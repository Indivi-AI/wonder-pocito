// cc-worker.js — POC-style worker (link.js twin) that runs the single static duckdb-eh.wasm
// (engine+parquet+cols_cache all linked in). The cols_cache VFS calls back into JS on page faults via
// Module.{tailSize,haveRange,faultRange,readRange}; those + self.__ccUrls (wUrl→signed https) are planted
// at Module creation, so there is no postMessage race. Sync XHR + range fetch are legal on this worker.
// CppLog lines (engine stdout/stderr) stream up as {kind:'log'}; the query rows come back as {kind:'result'}.
import createModule from './duckdb-dist/st/duckdb-eh.js'
import { tableFromIPC } from './duckdb-dist/arrow.bundle.mjs'
const dist = new URL('./duckdb-dist/st/', import.meta.url).href
const runtimeUrls = {
  'duckdb_wasm.wasm': new URL('./duckdb-dist/st/duckdb-eh.wasm', import.meta.url).href
}
// MT: const rangeWorkerUrl = new URL('./range-worker.js', import.meta.url)
// MT: const rangeWorkers = Array.from({ length: 6 }, () => new Worker(rangeWorkerUrl))
let requestId
const post = (kind, d) => postMessage({ kind, requestId, ...d })
const started = performance.now()
const ccLog = event => post('log', {
  line: JSON.stringify({ kind: 'log', logger: 'colsCacheLogger', channel: 'info', event: { requestId, ...event } })
})
const ccProgress = event => post('log', {
  line: JSON.stringify({ kind: 'log', logger: 'biDownloadLogger', channel: 'progress', event: { requestId, ...event } })
})
const ccError = event => post('log', {
  line: JSON.stringify({ kind: 'log', logger: 'errorLogger', channel: 'error', event: { requestId, ...event } })
})
const footerBytes = bytes => new DataView(bytes.buffer, bytes.byteOffset + bytes.byteLength - 8, 4).getUint32(0, true) + 8

const hooks = {   // browser twin of colsCacheService.js — every hook synchronous (C++ page-fault contract)
  __ccBox: {}, __ccFull: {}, __ccTail: {}, __ccSize: {}, __ccPrefetch: {}, __ccQueue: [], __ccProgress: {}, __stat: {}, __querySeq: 0,
  __networkSeq: 0,
  __ccNetwork(kind, bytes) { return { queryId: this.__querySeq, operationId: ++this.__networkSeq, kind, bytes } },
  __ccUrl(u) { return (self.__ccUrls || {})[u] || u },
  __ccGet(u, off, len) { const atMs = performance.now() - started, network = this.__ccNetwork('range', len), x = new XMLHttpRequest()
    ccProgress({ t: 'bi.network.begin', ...network }); x.open('GET', this.__ccUrl(u), false)
    x.setRequestHeader('Range', `bytes=${off}-${off + len - 1}`); x.responseType = 'arraybuffer'; x.send(null)
    ccProgress({ t: 'bi.network.end', ...network, bytes: x.response.byteLength })
    ccLog({ t: 'range.get', wUrl: u, off, bytes: x.response.byteLength, atMs, gcsMs: performance.now() - started - atMs })
    return new Uint8Array(x.response) },
  __ccTotal(u) { const atMs = performance.now() - started, network = this.__ccNetwork('size', 1), x = new XMLHttpRequest()
    ccProgress({ t: 'bi.network.begin', ...network }); x.open('GET', this.__ccUrl(u), false)
    x.setRequestHeader('Range', 'bytes=0-0'); x.send(null); const m = (x.getResponseHeader('Content-Range') || '').match(/\/(\d+)/)
    ccProgress({ t: 'bi.network.end', ...network })
    ccLog({ t: 'range.tail', wUrl: u, size: +(m?.[1] || 0), bytes: 1, atMs, gcsMs: performance.now() - started - atMs })
    return m ? +m[1] : 0 },
  async ensureFull(u) {
    if (this.__ccFull[u]) return
    const atMs = performance.now() - started, network = this.__ccNetwork('fullFile', 0)
    ccProgress({ t: 'bi.network.begin', ...network, wUrl: u })
    const response = await fetch(this.__ccUrl(u))
    if (!response.ok) throw new Error(`Full prefetch returned ${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    this.__ccFull[u] = bytes; this.__ccSize[u] = bytes.length
    ccProgress({ t: 'bi.network.end', ...network, wUrl: u, bytes: bytes.length })
    ccLog({ t: 'range.full', wUrl: u, off: 0, bytes: bytes.length, atMs, gcsMs: performance.now() - started - atMs })
  },
  async ensureTail(u) {
    if (this.__ccSize[u] != null) return
    const atMs = performance.now() - started, network = this.__ccNetwork('tail', 65536)
    ccProgress({ t: 'bi.network.begin', ...network, wUrl: u })
    const response = await fetch(this.__ccUrl(u), { headers: { Range: 'bytes=-65536' } })
    if (!response.ok) throw new Error(`Tail prefetch returned ${response.status}`)
    let bytes = new Uint8Array(await response.arrayBuffer()), match = response.headers.get('content-range')?.match(/bytes (\d+)-\d+\/(\d+)/)
    const size = +(match?.[2] || response.headers.get('content-length') || bytes.length)
    if (footerBytes(bytes) > bytes.length)
      bytes = new Uint8Array(await (await fetch(this.__ccUrl(u), { headers: { Range: `bytes=${size - footerBytes(bytes)}-` } })).arrayBuffer())
    const off = size - bytes.length
    this.__ccTail[u] = { off, bytes }; this.__ccSize[u] = size
    ccProgress({ t: 'bi.network.end', ...network, wUrl: u, bytes: bytes.length })
    ccLog({ t: 'range.tail', wUrl: u, size, bytes: bytes.length, atMs, gcsMs: performance.now() - started - atMs })
  },
  __ccSlice(u, off, len) {
    const full = this.__ccFull[u], tail = this.__ccTail[u], cached = this.__ccCached(u, off, len)
    return full?.subarray(off, off + len)
      || tail && off >= tail.off && off + len <= tail.off + tail.bytes.length && tail.bytes.subarray(off - tail.off, off - tail.off + len)
      || cached && cached.bytes.subarray(off - cached.off, off - cached.off + len)
  },
  __ccCached(u, off, len) { const prefix = `${u}.`
    return Object.entries(this.__ccBox).flatMap(([key, bytes]) => {
      if (!key.startsWith(prefix)) return []
      const [start, size] = key.slice(prefix.length).split('.').map(Number)
      return start <= off && off + len <= start + size ? [{ off: start, bytes }] : []
    })[0]
  },
  /* MT: shared range-worker prefetch and Atomics.wait path, retained for a possible future COI mode.
  __ccPending(u, off, len) {
    return Object.values(this.__ccPrefetch).find(x => x.u === u && x.off <= off && off + len <= x.off + x.len)
  },
  haveRange(u, off, len) { const hit = this.__ccSlice(u, off, len), pending = this.__ccPending(u, off, len)
    this.__stat[hit ? 'hits' : pending ? 'waits' : 'faults']++; return hit ? 1 : 0 },
  prefetch({ file: u, ranges, progressKey = `${u}.${performance.now()}` }) {
    const unique = [...new Map(ranges.map(x => [`${u}.${x.off}.${x.len}`, x])).values()]
    const missing = unique.filter(({ off, len }) => !this.__ccSlice(u, off, len) && !this.__ccPending(u, off, len))
    if (!missing.length) return Promise.resolve()
    const worker = new Worker(rangeWorkerUrl)
    const done = new Promise((resolve, reject) => this.__ccProgress[progressKey] = { wUrl: u, fetchedBytes: 0,
      totalBytes: missing.reduce((n, x) => n + x.len, 0), fetchedRanges: 0, totalRanges: missing.length, resolve, reject })
    this.__ccEmitProgress(progressKey, missing.length ? 'running' : 'done')
    missing.forEach(({ off, len, rg, col }) => {
      const key = `${u}.${off}.${len}`
      const shared = new SharedArrayBuffer(len + 8)
      this.__ccPrefetch[key] = { u, off, len, rg, col, shared, progressKey, atMs: performance.now() - started, worker, streamed: true }
    })
    const network = this.__ccNetwork('parallelRanges', missing.reduce((n, x) => n + x.len, 0))
    worker.onmessage = ({ data }) => {
      if (data.network) {
        ccProgress({ t: `bi.network.${data.network}`, ...data })
        if (data.network === 'end') worker.terminate()
      } else {
        const pending = this.__ccPrefetch[data.key], progress = pending && this.__ccProgress[pending.progressKey]
        if (data.bytes && progress) {
          progress.fetchedBytes += data.bytes
          this.__ccEmitProgress(pending.progressKey, 'running')
        }
        if (data.done || data.error) this.__ccFinish(data.key, true)
      }
    }
    worker.postMessage({ url: this.__ccUrl(u), wUrl: u, progressChannel: self.__progressChannel, ...network,
      ranges: missing.map(({ off, len, rg, col }) => ({
      off, len, rg, col, key: `${u}.${off}.${len}`, shared: this.__ccPrefetch[`${u}.${off}.${len}`].shared
      })) })
      return done
    },
    prefetchRanges(u, packed, cols) { const ranges = packed ? packed.split(',').map(x => {
      const [off, len] = x.split(':').map(Number); return { off, len }
    }) : []
    if (!ranges.length) return
    const unique = [...new Map(ranges.map(x => [`${u}.${x.off}.${x.len}`, x])).values()],
    missing = unique.filter(({ off, len }) => !this.__ccSlice(u, off, len) && !this.__ccPending(u, off, len)),
    cached = unique.length - missing.length, progressKey = `${u}.${performance.now()}`,
    progress = this.__ccProgress[progressKey] = { wUrl: u, fetchedBytes: 0,
      totalBytes: missing.reduce((n, x) => n + x.len, 0), fetchedRanges: 0, totalRanges: missing.length }
    ccLog({ t: 'prefetch.plan', packed: cols, planned: unique.length, cached, missing: missing.length })
    this.__ccEmitProgress(progressKey, missing.length ? 'running' : 'done')
    this.prefetch({ file: u, ranges: missing, progressKey })
  },
  __ccEmitProgress(key, status) { const p = this.__ccProgress[key]
    if (!p) return
    const { resolve, reject, ...progress } = p
    ccProgress({ t: 'rangeDownload', step: `colsCache.prefetch.${key}`, status, ...progress,
      pct: p.totalBytes ? 100 * p.fetchedBytes / p.totalBytes : 100 })
    if (status === 'done') { resolve?.(); delete this.__ccProgress[key] }
  },
  __ccPump() { while (rangeWorkers.length && this.__ccQueue.length) {
    const key = this.__ccQueue.shift(), pending = this.__ccPrefetch[key]
    if (!pending) continue
    const worker = rangeWorkers.pop()
    pending.worker = worker
    worker.onmessage = ({ data }) => data.network ? ccProgress({ t: `bi.network.${data.network}`, ...data }) : this.__ccFinish(key)
    worker.postMessage({ key, url: this.__ccUrl(pending.u), off: pending.off, len: pending.len, shared: pending.shared,
      ...this.__ccNetwork('range', pending.len) })
  } },
  __ccFinish(key, streamed) {
    const pending = this.__ccPrefetch[key]
    if (!pending) return
    const state = new Int32Array(pending.shared, 0, 2)
    if (state[0] > 0) {
      this.__ccBox[key] = new Uint8Array(pending.shared, 8, pending.len)
      if (pending.progressKey && this.__ccProgress[pending.progressKey]) {
        const progress = this.__ccProgress[pending.progressKey]
        if (!streamed) progress.fetchedBytes += pending.len
        progress.fetchedRanges++
        this.__ccEmitProgress(pending.progressKey, progress.fetchedRanges === progress.totalRanges ? 'done' : 'running')
      }
      ccLog({ t: 'range.get', wUrl: pending.u, off: pending.off, bytes: pending.len, rg: pending.rg, col: pending.col,
        atMs: pending.atMs, gcsMs: state[1] / 1000 })
    } else hooks.__ccProgress[pending.progressKey]?.reject?.(new Error(`Prefetch failed ${pending.u} ${pending.off}:${pending.len}`))
    if (pending.worker && !pending.streamed) rangeWorkers.push(pending.worker)
    delete this.__ccPrefetch[key]
    this.__ccPump()
  },
  faultRange(u, off, len) {
    if (this.__ccSlice(u, off, len)) return
    const requestedKey = `${u}.${off}.${len}`, pending = this.__ccPrefetch[requestedKey] || this.__ccPending(u, off, len)
    const key = pending ? `${pending.u}.${pending.off}.${pending.len}` : requestedKey
    if (!pending) return this.__ccBox[key] = this.__ccGet(u, off, len)
    if (!pending.worker) {
      this.__ccQueue = this.__ccQueue.filter(x => x !== key)
      const worker = rangeWorkers.pop()
      if (!worker) {
        this.__ccFallback(key, pending); return
      }
      pending.worker = worker
      worker.onmessage = ({ data }) => data.network ? ccProgress({ t: `bi.network.${data.network}`, ...data }) : this.__ccFinish(key)
      worker.postMessage({ key, url: this.__ccUrl(u), off, len, shared: pending.shared, ...this.__ccNetwork('range', len) })
    }
    const state = new Int32Array(pending.shared, 0, 2)
    Atomics.wait(state, 0, 0, 5000)
    if (state[0] > 0) this.__ccFinish(key)
    else this.__ccFallback(key, pending)
    if (!this.__ccSlice(u, off, len)) this.__ccBox[requestedKey] = this.__ccGet(u, off, len)
  },
  readRange(u, off, len, buf) {
    this.__stat.scanBytes += len
    this.HEAPU8.set(this.__ccSlice(u, off, len), buf)
  },
  __ccFallback(key, pending) {
    this.__ccBox[key] = this.__ccGet(pending.u, pending.off, pending.len)
    const progress = this.__ccProgress[pending.progressKey]
    if (progress) {
      progress.fetchedBytes += pending.len; progress.fetchedRanges++
      this.__ccEmitProgress(pending.progressKey, progress.fetchedRanges === progress.totalRanges ? 'done' : 'running')
    }
    delete this.__ccPrefetch[key]
  },
  */
  haveRange(u, off, len) { const hit = this.__ccSlice(u, off, len)
    this.__stat[hit ? 'hits' : 'faults']++; return hit ? 1 : 0 },
  async prefetch({ file: u, ranges, progressKey = `${u}.${performance.now()}` }) {
    const unique = [...new Map(ranges.map(x => [`${u}.${x.off}.${x.len}`, x])).values()]
    const missing = unique.filter(({ off, len }) => !this.__ccSlice(u, off, len))
    if (!missing.length) return
    const progress = this.__ccProgress[progressKey] = { wUrl: u, fetchedBytes: 0,
      totalBytes: missing.reduce((n, x) => n + x.len, 0), fetchedRanges: 0, totalRanges: missing.length }
    this.__ccEmitProgress(progressKey, 'running')
    await Promise.all(missing.map(async ({ off, len, rg, col }) => {
      const atMs = performance.now() - started, network = this.__ccNetwork('range', len)
      ccProgress({ t: 'bi.network.begin', ...network })
      const response = await fetch(this.__ccUrl(u), { headers: { Range: `bytes=${off}-${off + len - 1}` } })
      if (response.status !== 206) throw new Error(`Range request returned ${response.status}`)
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.length !== len) throw new Error(`Range request returned ${bytes.length}/${len} bytes`)
      this.__ccBox[`${u}.${off}.${len}`] = bytes; progress.fetchedBytes += len; progress.fetchedRanges++
      ccProgress({ t: 'bi.network.end', ...network, bytes: len })
      ccLog({ t: 'range.get', wUrl: u, off, bytes: len, rg, col, atMs, gcsMs: performance.now() - started - atMs })
      this.__ccEmitProgress(progressKey, progress.fetchedRanges === progress.totalRanges ? 'done' : 'running')
    }))
  },
  prefetchRanges() {},
  __ccEmitProgress(key, status) { const p = this.__ccProgress[key]
    if (!p) return
    ccProgress({ t: 'rangeDownload', step: `colsCache.prefetch.${key}`, status, ...p,
      pct: p.totalBytes ? 100 * p.fetchedBytes / p.totalBytes : 100 })
    if (status === 'done') delete this.__ccProgress[key]
  },
  faultRange(u, off, len) {
    if (!this.__ccSlice(u, off, len)) this.__ccBox[`${u}.${off}.${len}`] = this.__ccGet(u, off, len)
  },
  readRange(u, off, len, buf) {
    this.__stat.scanBytes += len
    this.HEAPU8.set(this.__ccSlice(u, off, len), buf)
  },
  tailSize(u) { return this.__ccSize[u] ??= this.__ccTotal(u) }
}

// callSRet: pass a stack-allocated [status,dataPtr,dataLen] triple as arg0; unpack via HEAPF64.
let memoryBytes
const checkMemory = m => { const bytes = m.HEAPU8.buffer.byteLength
  if (memoryBytes && bytes > memoryBytes) ccError({ t: 'wasm.memoryGrowth', fromBytes: memoryBytes, toBytes: bytes, deltaBytes: bytes - memoryBytes })
  memoryBytes = bytes
}
const callSRet = (m, fn, types, args) => { const sp = m.stackSave(), res = m.stackAlloc(3 * 8)
  m.ccall(fn, null, ['number', ...types], [res, ...args]); checkMemory(m); const r = res >> 3
  const out = [m.HEAPF64[r], m.HEAPF64[r + 1], m.HEAPF64[r + 2]]; m.stackRestore(sp); return out }
const readStr = (m, p, n) => new TextDecoder().decode(m.HEAPU8.slice(p, p + n))

// duckdb-wasm's glue delegates every FS op to globalThis.DUCKDB_RUNTIME. Our cols_cache VFS owns all real I/O
// (page-fault hooks above), so the parquet never flows through here — a minimal runtime only has to open cleanly.
const noRuntime = new Proxy({ getDefaultDataProtocol: () => 2 /* BROWSER_FILEREADER */, testPlatformFeature: () => false },
  { get: (t, k) => t[k] ?? (() => 0) })
// MT: runtimeSource + mainScriptUrlOrBlob supplied the glue loaded by pthread workers.

let M, conn
const loadWasm = async () => {
  try {
    ccProgress({ t: 'benchmarkStage', label: 'Loading DuckDB WASM', files: [runtimeUrls['duckdb_wasm.wasm']] })
    const url = runtimeUrls['duckdb_wasm.wasm']
    const response = await fetch(url), totalBytes = +response.headers.get('content-length')
    if (!response.ok) return { error: `WASM download returned ${response.status}` }
    const reader = response.body.getReader(), chunks = []
    let fetchedBytes = 0, reported = -1
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value); fetchedBytes += value.length
      const pct = totalBytes ? 100 * fetchedBytes / totalBytes : 0
      if (Math.floor(pct) !== reported) {
        reported = Math.floor(pct)
        ccProgress({
          t: 'rangeDownload', step: 'wasm.load', status: 'running', wUrl: runtimeUrls['duckdb_wasm.wasm'],
          fetchedBytes, totalBytes, pct
        })
      }
    }
    const bytes = new Uint8Array(fetchedBytes)
    for (let at = 0, i = 0; i < chunks.length; at += chunks[i].length, i++) bytes.set(chunks[i], at)
    ccProgress({
      t: 'rangeDownload', step: 'wasm.load', status: 'done', wUrl: runtimeUrls['duckdb_wasm.wasm'],
      fetchedBytes, totalBytes: totalBytes || fetchedBytes, pct: 100
    })
    return { bytes }
  } catch (error) {
    const message = String(error?.message || error)
    ccError({ t: 'wasm.download.error', error: message })
    return { error: message }
  }
}
let ready
const initialize = async () => {
  globalThis.DUCKDB_RUNTIME = noRuntime
  const locateFile = file => runtimeUrls[file] || dist + file
  const print = line => post('log', { line }) // MT: scan.rangePlan also started shared range-worker prefetch.
  const wasm = await loadWasm()
  if (wasm.error) return wasm
  ccProgress({ t: 'benchmarkStage', label: 'Initializing DuckDB WASM' })
  M = await createModule({ INITIAL_MEMORY: 64 << 20, locateFile, wasmBinary: wasm.bytes, print, printErr: print, ...hooks })
  checkMemory(M)
  // MT: maximumThreads: 6
  const [s, d, n] = callSRet(M, 'duckdb_web_open', ['string'], [JSON.stringify({ path: ':memory:', maximumThreads: 1 })])
  if (s !== 0) throw new Error(readStr(M, d, n)); M.ccall('duckdb_web_clear_response', null, [], [])
  conn = M.ccall('duckdb_web_connect', 'number', [], [])
}

const pendingResult = ([s, d, n]) => {
  if (s === 256) return
  if (s !== 0) { const e = readStr(M, d, n); M.ccall('duckdb_web_clear_response', null, [], []); throw new Error(e) }
  const out = n ? M.HEAPU8.slice(d, d + n) : null
  M.ccall('duckdb_web_clear_response', null, [], [])
  return out
}
const tick = () => new Promise(resolve => setTimeout(resolve))
async function query(sql) {   // returns Arrow IPC bytes → decoded to rows on the main thread
  const buf = new TextEncoder().encode(sql), ptr = M._malloc(buf.length); M.HEAPU8.set(buf, ptr)
  let head = pendingResult(callSRet(M, 'duckdb_web_pending_query_start_buffer',
    ['number', 'number', 'number', 'boolean'], [conn, ptr, buf.length, true]))
  M._free(ptr)
  while (!head) { await tick(); head = pendingResult(callSRet(M, 'duckdb_web_pending_query_poll', ['number'], [conn])) }
  const chunks = [head]
  while (true) {
    await tick()
    const chunk = pendingResult(callSRet(M, 'duckdb_web_query_fetch_results', ['number'], [conn]))
    if (chunk === undefined) continue
    if (chunk === null) break
    chunks.push(chunk)
  }
  return chunks
}
const queryNow = sql => {
  const buf = new TextEncoder().encode(sql), ptr = M._malloc(buf.length)
  M.HEAPU8.set(buf, ptr)
  const [s, d, n] = callSRet(M, 'duckdb_web_query_run_buffer', ['number', 'number', 'number'], [conn, ptr, buf.length])
  M._free(ptr)
  if (s !== 0) { const error = readStr(M, d, n); M.ccall('duckdb_web_clear_response', null, [], []); throw new Error(error) }
  const out = M.HEAPU8.slice(d, d + n); M.ccall('duckdb_web_clear_response', null, [], [])
  return out
}

const metadataFile = tail => { const n = footerBytes(tail.bytes), out = new Uint8Array(n + 4)
  out.set([80, 65, 82, 49]); out.set(tail.bytes.subarray(tail.bytes.length - n), 4); return out }
const registerBuffer = (name, bytes) => {
  const ptr = M._malloc(bytes.length); M.HEAPU8.set(bytes, ptr)
  const [s, d, n] = callSRet(M, 'duckdb_web_fs_register_file_buffer',
    ['string', 'number', 'number'], [name, ptr, bytes.length])
  if (s !== 0) throw new Error(readStr(M, d, n))
  M.ccall('duckdb_web_clear_response', null, [], [])
}
const dropFile = name => {
  const [s, d, n] = callSRet(M, 'duckdb_web_fs_drop_file', ['string'], [name])
  if (s !== 0) throw new Error(readStr(M, d, n))
  M.ccall('duckdb_web_clear_response', null, [], [])
}
const q = s => `'${s.replaceAll("'", "''")}'`
const comparable = (a, b) => Number.isFinite(+a) && Number.isFinite(+b) ? [+a, +b] : [String(a), String(b)]
async function prefetchFromPlan(plans) {
  const requested = plans?.length || 0
  plans = (plans || []).filter(plan => !hooks.__ccFull[plan.wUrl])
  ccLog({ t: 'prefetch.eligible', requested, eligible: plans.length })
  if (!plans.length) return
  const files = plans.map((plan, i) => ({ plan, name: `__cc_metadata_q${requestId}_${i}.parquet` }))
  files.forEach(({ plan, name }, sourceIndex) => {
    const tail = hooks.__ccTail[plan.wUrl]
    ccLog({ t: 'prefetch.metadata.register.begin', sourceIndex, wUrl: plan.wUrl, name,
      size: hooks.__ccSize[plan.wUrl], tailBytes: tail.bytes.length, footerBytes: footerBytes(tail.bytes) })
    registerBuffer(name, metadataFile(tail))
    ccLog({ t: 'prefetch.metadata.register.done', sourceIndex, name })
  })
  const paths = files.map(x => q(x.name)).join(','), columns = [...new Set(plans.flatMap(x => x.columns))].map(q).join(',')
  ccLog({ t: 'prefetch.metadata.begin', files: files.length, columns })
  const ipc = await (async () => { try { return await query(`select file_name,row_group_id,path_in_schema,stats_min_value,stats_max_value,
    dictionary_page_offset,data_page_offset,total_compressed_size from parquet_metadata([${paths}])
    where path_in_schema in (${columns})`) } finally { files.forEach(x => dropFile(x.name)) } })()
  const rows = tableFromIPC(ipc).toArray().map(x => x.toJSON())
  ccLog({ t: 'prefetch.metadata.done', rows: rows.length })
  ccProgress({ t: 'benchmarkStage', label: `Prefetching ${files.length} Parquet files` })
  await Promise.all(files.map(({ plan, name }) => {
    const joinColumns = plan.joinColumns || []
    const columns = [...joinColumns, ...plan.columns.filter(column => !joinColumns.includes(column))]
    if (!columns.length) return
    const groups = Object.values(rows.filter(x => x.file_name === name)
      .reduce((byId, x) => ((byId[x.row_group_id] ||= []).push(x), byId), {}))
    const matching = groups.filter(group => (plan.constraints || []).every(c => {
      const stat = group.find(x => x.path_in_schema === c.column)
      if (!stat?.stats_min_value || !stat?.stats_max_value) return true
      const [min, lo] = comparable(stat.stats_min_value, c.lo), [max, hi] = comparable(stat.stats_max_value, c.hi)
      return max >= lo && min <= hi
    }))
    const ranges = matching.flatMap(group => group.filter(x => columns.includes(x.path_in_schema)))
      .sort((a, b) => columns.indexOf(a.path_in_schema) - columns.indexOf(b.path_in_schema)).map(x => ({
      rg: +x.row_group_id, col: x.path_in_schema,
      off: +(x.dictionary_page_offset > 0 ? x.dictionary_page_offset : x.data_page_offset),
      len: +x.total_compressed_size
    }))
    ccLog({ t: 'prefetch.sourcePlan', wUrl: plan.wUrl, size: hooks.__ccSize[plan.wUrl], groups: groups.length,
      matching: matching.length, joinColumns, columns, constraints: plan.constraints, ranges: ranges.length,
      bytes: ranges.reduce((sum, x) => sum + x.len, 0), maxEnd: Math.max(0, ...ranges.map(x => x.off + x.len)) })
    return hooks.prefetch({ file: plan.wUrl, ranges })
  }))
  ccLog({ t: 'prefetch.done', plans: plans.length })
}

onmessage = async e => {
  requestId = e.data.requestId
  const { sql, ccUrls, sourceUrls, ensureCols, sourceRoles, prefetchPlan, clearCache } = e.data
  try {
    if (clearCache) {
      hooks.__ccPrefetch = {}; hooks.__ccQueue = []; hooks.__ccProgress = {}
      if (clearCache === true) { hooks.__ccBox = {}; hooks.__ccFull = {}; hooks.__ccTail = {}; hooks.__ccSize = {} }
      else {
        Object.keys(hooks.__ccBox).filter(key => key.startsWith(`${clearCache}.`)).forEach(key => delete hooks.__ccBox[key])
        delete hooks.__ccFull[clearCache]
        delete hooks.__ccTail[clearCache]
        delete hooks.__ccSize[clearCache]
      }
      return post('result', {})
    }
    self.__ccUrls = { ...self.__ccUrls, ...(ccUrls || {}) }
    ccLog({ t: 'source.roles', roles: sourceRoles })
    hooks.__querySeq++; hooks.__networkSeq = 0
    const full = new Set((ensureCols || []).map(x => x.wUrl))
    ccProgress({ t: 'benchmarkStage', label: `Fetching metadata for ${(sourceUrls || []).length} Parquet files`,
      files: sourceUrls, cachedFiles: (sourceUrls || []).filter(u => hooks.__ccFull[u]) })
    await Promise.all([...(ensureCols || []).map(x => hooks.ensureFull(x.wUrl)),
      ...(sourceUrls || []).filter(u => !full.has(u)).map(u => hooks.ensureTail(u))])
    ccProgress({ t: 'benchmarkStage', label: 'Loading DuckDB WASM' })
    const init = await (ready ||= initialize())
    if (init?.error) return post('result', init)
    ccLog({ t: 'prefetch.begin', plans: prefetchPlan.length })
    ccProgress({ t: 'benchmarkStage', label: `Planning ${prefetchPlan.length} Parquet sources` })
    await prefetchFromPlan(prefetchPlan)
    ccProgress({ t: 'benchmarkStage', label: 'Running DuckDB query' })
    hooks.__stat = { hits: 0, waits: 0, faults: 0, scanBytes: 0 }
    post('result', { ipc: await query(sql), stats: hooks.__stat })
  }
  catch (err) { post('result', { error: err?.stack || err?.message || String(err) }) }
}
