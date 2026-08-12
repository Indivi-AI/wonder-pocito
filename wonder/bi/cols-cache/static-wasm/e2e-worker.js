// e2e-worker.js — self-contained wasm driver (no @jb6, no rooms, no duckdb-wasm.js). Spawns the single
// static duckdb-eh.wasm, hosts the cols_cache page-fault hooks (sync-XHR Range on a localhost/GCS parquet),
// and runs one sql per message. Pure wasm isolation for step-by-step e2e.
//
// Cache model mirrors the NATIVE extension (colsCacheExtension.cpp::RangeImage::Read): the browser-db is keyed
// by byte-range "<off>-<len>". After projection+filter pushdown each range DuckDB requests IS a column-chunk, so
// every col-chunk is fetched, persisted and NOTIFIED independently the instant it faults — no "wait for all", no
// whole-file gate. The DuckDB hooks are synchronous, but OPFS handle CREATION is async; so the browser-db is one
// OPFS file per object, its sync-access-handle opened ONCE (async) before the query. Ranges are then read/written
// through that handle fully synchronously inside the hooks. A page→packed-slot map records cached pages and
// survives worker restart, so a fresh worker (fresh DuckDB)
// HITS every col-chunk a prior worker cached: browser-db separated from the ephemeral DuckDB lifecycle.
import { colsCacheRuntime } from '../cols-cache-version.js'
const { default: createModule } = await import(colsCacheRuntime.js)
const runtimeUrls = { 'duckdb_wasm.wasm': colsCacheRuntime.wasm }
const post = (kind, d) => postMessage({ kind, ...d })
const timing = { started: 0, phases: {} }
const phase = (step, status) => {
  const at = performance.now(), times = timing.phases[step] ||= {}
  times[status] = at; post('progress', { step, status })
}
const PAGE = 65536   // OPFS/persist page granularity; also the tail-suffix size (one GET → object size + footer)

const box = {}, sizes = {}, stat = { faults: 0, hits: 0, readBytes: 0 }
const ccUrl = u => (self.__ccUrls || {})[u] || u
const fileName = u => `${self.__cacheId || 'default'}-${u.replace(/[^\w]/g, '_')}.ccdb`
const rangeGet = (u, off, len) => { const x = new XMLHttpRequest(); x.open('GET', ccUrl(u), false)
  x.setRequestHeader('Range', `bytes=${off}-${off + len - 1}`); x.responseType = 'arraybuffer'; x.send(null); return new Uint8Array(x.response) }

let opfsRoot
const dir = async () => (opfsRoot ||= await navigator.storage.getDirectory())
const handle = async name => (await (await dir()).getFileHandle(name, { create: true })).createSyncAccessHandle()

// per object: OPFS stores a small page→packed-slot map followed by only the fetched pages.
const pages = n => Math.ceil(n / PAGE)
const newImg = (total, ah) => { const map = new Int32Array(pages(total)); map.fill(-1)
  return { total, ah, map, mapBytes: map.byteLength, nextSlot: 0,
    covers(off, len) { for (let p = (off / PAGE) | 0; p <= ((off + len - 1) / PAGE) | 0; p++) if (this.map[p] < 0) return false; return true },
    writeMap() { this.ah.write(new Uint8Array(this.map.buffer), { at: 0 }) } } }
const covered = (u, off, len) => { const c = box[u]; return c && off + len <= c.total && c.covers(off, len) }
const fetchRange = async (u, range) => {
  const response = await fetch(ccUrl(u), { cache: 'no-store', headers: { Range: `bytes=${range}` } })
  if (response.status !== 206) { await response.body?.cancel(); throw new Error(`Range ${range} returned ${response.status}, expected 206`) }
  return { bytes: new Uint8Array(await response.arrayBuffer()), contentRange: response.headers.get('Content-Range') }
}

// fault one range (a col-chunk): fetch its page span, stream to OPFS, mark pages, NOTIFY this col-chunk is ready.
const fault = (u, off, len) => { const c = box[u]
  const p0 = (off / PAGE) | 0, p1 = ((off + len - 1) / PAGE) | 0
  const start = p0 * PAGE, end = Math.min((p1 + 1) * PAGE, c.total)
  const bytes = rangeGet(u, start, end - start)
  for (let p = p0; p <= p1; p++) if (c.map[p] < 0) {
    c.map[p] = c.nextSlot++
    c.ah.write(bytes.subarray(p * PAGE - start, Math.min((p + 1) * PAGE, end) - start), { at: c.mapBytes + c.map[p] * PAGE })
  }
  c.writeMap(); post('ready', { url: u, off, len }) }   // per col-chunk notify — do NOT wait for the whole file

const hooks = {
  haveRange(u, off, len) { const h = covered(u, off, len); if (h) stat.hits++; return h ? 1 : 0 },
  faultRange(u, off, len) { stat.faults++; fault(u, off, len) },
  readRange(u, off, len, buf) { const c = box[u], tmp = new Uint8Array(len); stat.readBytes += len
    for (let p = (off / PAGE) | 0; p <= ((off + len - 1) / PAGE) | 0; p++) {
      const from = Math.max(off, p * PAGE), to = Math.min(off + len, (p + 1) * PAGE)
      c.ah.read(tmp.subarray(from - off, to - off), { at: c.mapBytes + c.map[p] * PAGE + from - p * PAGE })
    }
    this.HEAPU8.set(tmp, buf) },
  tailSize(u) { return sizes[u] }   // openObject (pre-query, async) already sized+opened the browser-db
}

// open the browser-db for u BEFORE the query (async handle creation done here, so the sync hooks never create one):
// reload its page map if present (prior worker's col-chunks → hits), else initialize the map and footer pages.
async function openObject(u) { if (box[u]) return sizes[u]
  phase('opfs', 'running')
  const ah = await handle(fileName(u))
  phase('opfs', 'done'); phase('signature', 'running')
  const first = await fetchRange(u, '0-3'), total = +(first.contentRange || '').match(/\/(\d+)/)?.[1]
  if (new TextDecoder().decode(first.bytes) !== 'PAR1' || !total) throw new Error(`Invalid Parquet header: ${first.contentRange}`)
  phase('signature', 'done'); phase('footer', 'running')
  const { bytes: footer, contentRange } = await fetchRange(u, `${Math.max(0, total - PAGE)}-${total - 1}`)
  const signature = new TextDecoder().decode(footer.subarray(-4))
  phase('footer', 'done')
  if (footer.byteLength > PAGE || signature !== 'PAR1')
    throw new Error(`Invalid Parquet footer: ${contentRange}, ${footer.byteLength} bytes, ${signature}`)
  const c = newImg(total, ah); box[u] = c; sizes[u] = total
  if (ah.getSize() >= c.mapBytes) {
    ah.read(new Uint8Array(c.map.buffer), { at: 0 }); c.nextSlot = c.map.reduce((max, slot) => Math.max(max, slot), -1) + 1
  }
  else {
    phase('allocate', 'running'); ah.truncate(c.mapBytes); c.writeMap()
    phase('allocate', 'done'); phase('seed', 'running')
    fault(u, total - footer.byteLength, footer.byteLength)
    phase('seed', 'done')
  }
  return total }

const callSRet = (m, fn, types, args) => { const sp = m.stackSave(), res = m.stackAlloc(3 * 8)
  m.ccall(fn, null, ['number', ...types], [res, ...args]); const r = res >> 3
  const out = [m.HEAPF64[r], m.HEAPF64[r + 1], m.HEAPF64[r + 2]]; m.stackRestore(sp); return out }
const readStr = (m, p, n) => new TextDecoder().decode(new Uint8Array(m.HEAPU8.subarray(p, p + n)))
const noRuntime = new Proxy({ getDefaultDataProtocol: () => 2, testPlatformFeature: () => false }, { get: (t, k) => t[k] ?? (() => 0) })

let M, conn, boot
const ready = () => boot ||= (async () => {
  globalThis.DUCKDB_RUNTIME = noRuntime
  const locateFile = f => runtimeUrls[f] || f
  /* MT: pthread builds require a classic glue blob and duckdb_wasm.worker.js. */
  phase('glue', 'running')
  phase('glue', 'done'); phase('wasm', 'running')
  M = await createModule({ locateFile, print: l => post('log', { line: l }), printErr: l => post('log', { line: l }), ...hooks })
  phase('wasm', 'done'); phase('duckdb', 'running')
  const [s, d, n] = callSRet(M, 'duckdb_web_open', ['string'], [JSON.stringify({ path: ':memory:', maximumThreads: 1 })])
  if (s !== 0) throw new Error(readStr(M, d, n)); M.ccall('duckdb_web_clear_response', null, [], [])
  conn = M.ccall('duckdb_web_connect', 'number', [], [])
  querySync('SET enable_object_cache=false')   // no parquet-metadata cache → every scan re-consults the browser-db
  phase('duckdb', 'done')
})()

function querySync(sql) {
  const buf = new TextEncoder().encode(sql), ptr = M._malloc(buf.length); M.HEAPU8.set(buf, ptr)
  const [s, d, n] = callSRet(M, 'duckdb_web_query_run_buffer', ['number', 'number', 'number'], [conn, ptr, buf.length]); M._free(ptr)
  if (s !== 0) { const e = readStr(M, d, n); M.ccall('duckdb_web_clear_response', null, [], []); throw new Error(e) }
  const out = M.HEAPU8.slice(d, d + n); M.ccall('duckdb_web_clear_response', null, [], []); return out
}

const tick = () => new Promise(resolve => setTimeout(resolve))
const pendingResult = ([s, d, n]) => {
  if (s === 256) return
  if (s !== 0) { const e = readStr(M, d, n); M.ccall('duckdb_web_clear_response', null, [], []); throw new Error(e) }
  const out = n ? M.HEAPU8.slice(d, d + n) : null
  M.ccall('duckdb_web_clear_response', null, [], [])
  return out
}
async function query(sql) {
  const buf = new TextEncoder().encode(sql), ptr = M._malloc(buf.length); M.HEAPU8.set(buf, ptr)
  let head = pendingResult(callSRet(M, 'duckdb_web_pending_query_start_buffer',
    ['number', 'number', 'number', 'boolean'], [conn, ptr, buf.length, true]))
  M._free(ptr)
  while (!head) {
    await tick()
    head = pendingResult(callSRet(M, 'duckdb_web_pending_query_poll', ['number'], [conn]))
  }
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

const wipe = async u => { await (await dir()).removeEntry(fileName(u)).catch(() => {}) }
const close = () => Object.values(box).forEach(c => c.ah.close())

onmessage = async e => {
  const { sql, ccUrls, prefill, wipeUrls, cleanupUrls, cacheId, runs = 1, warmup = 0 } = e.data; let result
  try { timing.started = performance.now(); timing.phases = {}; self.__cacheId = cacheId
    self.__ccUrls = { ...self.__ccUrls, ...(ccUrls || {}) }
    stat.faults = 0; stat.hits = 0; stat.readBytes = 0; for (const k in box) delete box[k]
    if (wipeUrls) for (const u of wipeUrls) await wipe(u)             // start from an empty persistent browser-db
    for (const u of Object.keys(ccUrls || {})) await openObject(u)   // key by the wUrl the C++ VFS uses; ccUrl(u) resolves the fetch url
    if (prefill) for (const u of prefill) fault(u, 0, sizes[u])       // Stage 2: JS pre-populates the whole object
    const cacheFull = prefill ? prefill.every(u => covered(u, 0, sizes[u])) : null
    await ready()
    phase('cold', 'running')
    const warmups = []
    for (let i = 0; i < warmup; i++) {
      const before = { ...stat }, at = performance.now(); await query(sql)
      warmups.push({ ms: performance.now() - at, faults: stat.faults - before.faults, hits: stat.hits - before.hits,
        readBytes: stat.readBytes - before.readBytes })
    }
    phase('cold', 'done'); phase('hot', 'running')
    const samples = []; let ipc
    for (let i = 0; i < runs; i++) {
      const before = { ...stat }, at = performance.now(); ipc = await query(sql)
      samples.push({ ms: performance.now() - at, faults: stat.faults - before.faults, hits: stat.hits - before.hits,
        readBytes: stat.readBytes - before.readBytes })
    }
    result = { ipc, runs: samples, warmups, cacheFull, faults: samples.reduce((n, x) => n + x.faults, 0),
      hits: samples.reduce((n, x) => n + x.hits, 0), fileBytes: Object.values(box).reduce((n, x) => n + x.total, 0) }
    phase('hot', 'done')
  }
  catch (err) { result = { error: err?.stack || err?.message || String(err) } }
  finally {
    phase('cleanup', 'running'); close()
    if (cleanupUrls) for (const u of cleanupUrls) await wipe(u)
    phase('cleanup', 'done')
    const phases = Object.fromEntries(Object.entries(timing.phases).map(([step, x]) => [step, +(x.done - x.running).toFixed(3)]))
    console.log('[wasm benchmark timing]', JSON.stringify({ totalMs: +(performance.now() - timing.started).toFixed(3), phases }))
  }
  post('result', result)
}
