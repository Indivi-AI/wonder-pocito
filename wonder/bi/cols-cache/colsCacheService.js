// colsCacheService.js — Node half of the cols_cache range-cache VFS.
//
// The C extension is a byte-range pump: on a cache miss it asks us for exact
// [offset,length) slices of a remote parquet object; we Range-GET them from GCS
// and drop each slice as its own file in the cache dir. C's own DuckDB
// ParquetReader then decodes — we never touch decoded data, only move bytes.
//
// Wire: newline-delimited JSON, requests on stdin, acks on stdout, logs on stderr.
//   in  : {"id":N,"cmd":"size","wUrl":"room://.../taxi.parquet"}
//         {"id":N,"cmd":"fetch","wUrl":"...","dir":"/cache/<hash>","need":[{"file":"<off>-<len>","offset":O,"length":L}]}
//   out : {"id":N,"ok":true,"size":S}                               (size reply)
//         {"id":N,"ok":true,"wrote":[{"file":"<off>-<len>","bytes":B}]}   (one per file, as it lands)
//         {"id":N,"ok":false,"error":"..."}

import { coreUtils, jb } from '@jb6/core'
import '@wonder/db/db-drivers.js'

const { wresolve } = jb.wonderUtils
const { ensureLoggers } = coreUtils

const ctx = ensureLoggers(process.argv[2] || 'colsCacheLogger', { wrapToStderr: true })   // cpp passes the active-logger list as argv → ctx.vars.<name>Logger, wrapped to stderr
const emit = o => process.stdout.write(JSON.stringify(o) + '\n')
const httpsUrl = new Map() // wUrl -> resolved public https url (resolved once)

const isLocal = url => !/^https?:\/\//.test(url)
const resolve = async wUrl => {
  if (!httpsUrl.has(wUrl)) httpsUrl.set(wUrl, /^https?:\/\//.test(wUrl) || wUrl.startsWith('/') ? wUrl : await wresolve(wUrl, ctx))
  return httpsUrl.get(wUrl)
}
const rangeGet = async (url, offset, length) => {
  if (isLocal(url)) {
    const fs = await import('fs/promises'), fh = await fs.open(url)
    try { const b = Buffer.alloc(length), { bytesRead } = await fh.read(b, 0, length, offset); return b.subarray(0, bytesRead) }
    finally { await fh.close() }
  }
  const res = await fetch(url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } })
  if (!res.ok && res.status !== 206) throw new Error(`gcs ${res.status} for ${offset}-${length}`)
  return Buffer.from(await res.arrayBuffer())
}
const TAIL_BYTES = 65536

// bootMs: ms since this host booted — the shared clock every GCS call is stamped against, so the log lines form one ordered timeline.
const bootMs = () => Math.round(performance.now())
// suffix Range-GET: fetch the last TAIL_BYTES; Content-Range 'bytes START-END/TOTAL' yields both the footer slice
// (cached at its absolute <START>-<len> key, so C's footer Read hits it) and the total size — no separate HEAD.
const onTail = async req => {
  const { writeFile, mkdir, stat } = await import('fs/promises')
  const url = await resolve(req.wUrl)
  await mkdir(req.dir, { recursive: true })
  const atMs = bootMs()
  let start, size, buf
  if (isLocal(url)) {
    size = (await stat(url)).size; start = Math.max(0, size - TAIL_BYTES)
    buf = await rangeGet(url, start, size - start)
  } else {
    const res = await fetch(url, { headers: { Range: `bytes=-${TAIL_BYTES}` } })
    if (!res.ok && res.status !== 206) throw new Error(`gcs ${res.status} for tail`)
    buf = Buffer.from(await res.arrayBuffer())
    ;[, start, size] = res.headers.get('content-range').match(/bytes (\d+)-\d+\/(\d+)/).map(Number)
  }
  const gcsMs = bootMs() - atMs
  await writeFile(`${req.dir}/${start}-${buf.length}`, buf)
  ctx.vars.colsCacheLogger?.info?.({ t: 'range.tail', wUrl: req.wUrl, size, bytes: buf.length, atMs, gcsMs }, {}, { ctx })
  emit({ id: req.id, ok: true, size })
}
const onFetch = async req => {
  const { writeFile, mkdir } = await import('fs/promises')
  const requestCtx = ctx.setVars({ preFetchCols: req.preFetchCols || '' }), url = await resolve(req.wUrl)
  const totalBytes = req.need.reduce((n, x) => n + x.length, 0), step = `colsCache.prefetch.${req.id}`
  let next = 0, fetchedBytes = 0, fetchedRanges = 0
  const progress = status => requestCtx.vars.biDownloadLogger?.progress({
    t: 'rangeDownload', step, status, wUrl: req.wUrl, fetchedBytes, totalBytes,
    fetchedRanges, totalRanges: req.need.length, pct: totalBytes ? 100 * fetchedBytes / totalBytes : 100
  })
  await mkdir(req.dir, { recursive: true })
  progress('running')
  await Promise.all(Array.from({ length: Math.min(6, req.need.length) }, async () => { while (next < req.need.length) {
    const n = req.need[next++]
    const atMs = bootMs(); const buf = await rangeGet(url, n.offset, n.length); const gcsMs = bootMs() - atMs
    await writeFile(`${req.dir}/${n.file}`, buf); const diskMs = bootMs() - atMs - gcsMs
    requestCtx.vars.colsCacheLogger?.info?.({ t: 'range.wrote', wUrl: req.wUrl, file: n.file, bytes: buf.length, atMs, gcsMs, diskMs }, {}, { ctx: requestCtx })
    fetchedBytes += buf.length; fetchedRanges++; progress(fetchedRanges === req.need.length ? 'done' : 'running')
    emit({ id: req.id, ok: true, wrote: [{ file: n.file, bytes: buf.length }] })
  }}))
  emit({ id: req.id, ok: true, done: true })
}

let buf = ''
process.stdin.on('data', d => {
  buf += d
  for (let nl; (nl = buf.indexOf('\n')) >= 0;) {
    const line = buf.slice(0, nl); buf = buf.slice(nl + 1)
    if (!line.trim()) continue
    const req = JSON.parse(line)
    ;(req.cmd === 'tail' ? onTail(req) : onFetch(req)).catch(e =>
      emit({ id: req.id, ok: false, error: e.stack || String(e) }))
  }
})
