// duckdb-wasm.js — main-thread half (link.js's useWorker twin). Runs the single static duckdb-eh.wasm in a
// Web Worker (cc-worker.js) where sync-XHR range page-faults are legal. runSql posts {sql, ccUrls} (wUrl→signed
// https, from biUtils.colsCacheUrls) BEFORE the query, so the worker's cols_cache hooks resolve a browser scheme
// with no race. CppLog lines stream back as {kind:'log'} → onLine (same router as the cli host's stderr); the
// Arrow-IPC result comes back as {kind:'result'} and is decoded to rows here.
import { jb } from '@jb6/core'
import { tableFromIPC } from './duckdb-dist/arrow.bundle.mjs'
const workerAsset = new URL('./cc-worker.js', import.meta.url)
const workerUrl = globalThis.location && workerAsset.origin !== location.origin
  ? `${location.origin}/gcs-proxy${workerAsset.pathname}` : workerAsset.href
let worker, stats, requestSeq = 0, queue = Promise.resolve()
const getWorker = () => worker ||= new Worker(workerUrl, { type: 'module' })

const request = (msg, ctx) => queue = queue.catch(() => {}).then(() => {
  ctx?.vars?.biDownloadLogger?.progress?.({ t: 'benchmarkStage', label: 'Loading WASM worker' })
  const w = getWorker(), requestId = ++requestSeq, timeoutMs = 120000   // silence budget: re-armed on every log/progress line; heavy scans compute silently for long stretches
  const { onLine, ...workerMsg } = msg
  return new Promise(resolve => {
    let lastEvent = 'sent', timer
    // MT: range workers used a BroadcastChannel for direct progress updates.
    const cleanup = () => {
      clearTimeout(timer)
      w.removeEventListener('message', onMsg)
      w.removeEventListener('error', onError)
    }
    const armTimeout = () => { clearTimeout(timer); timer = setTimeout(() => {
      cleanup(); w.terminate(); worker = undefined
      const error = `WASM request ${requestId} timed out after ${timeoutMs}ms at ${lastEvent}`
      const event = { t: 'wasm.request.timeout', requestId, lastEvent, timeoutMs, error }
      ctx?.vars?.errorLogger?.error?.(event, {}, { ctx })
      resolve({ error })
    }, timeoutMs) }
    const onError = e => {
      cleanup(); w.terminate(); worker = undefined
      const error = e.message || 'WASM worker failed to load'
      ctx?.vars?.errorLogger?.error?.({ t: 'wasm.worker.load.error', error, filename: e.filename, lineno: e.lineno }, {}, { ctx })
      resolve({ error })
    }
    const onMsg = e => { const d = e.data
      
      if (d.requestId !== requestId) return
      armTimeout()
      if (d.kind === 'log') {
        if (d.line.includes('"src":"cpp"')) console.log('C++ → JS', d.line)
        try { const event = JSON.parse(d.line).event
          lastEvent = event?.t || lastEvent
        } catch {}
        return onLine?.(d.line)
      }
      cleanup()
      if (d.error) ctx?.vars?.errorLogger?.error?.({ t: 'wasm.worker.error', error: d.error }, {}, { ctx })
      resolve(d)
    }
    w.addEventListener('message', onMsg)
    w.addEventListener('error', onError)
    armTimeout()
    w.postMessage({ ...workerMsg, requestId })
  })
})

export async function runSql(sql, ctx, onLine) {
  const ccUrls = jb.biUtils?.colsCacheUrls || {}
  // the wasm pending-query API yields the FIRST statement's (empty) result for a multi-statement script — peel the
  // machine-generated leading SET prelude into its own request (session vars persist on the worker connection),
  // so the real query's rows come back instead of the SET's empty result
  const prelude = (sql.match(/^\s*(?:SET\s[^;]*;\s*)+/i) || [''])[0]
  const send = sql => { const sourceUrls = Object.keys(ccUrls).filter(wUrl => sql.includes(wUrl)); return request({
    sql, onLine, ccUrls, sourceUrls, ensureCols: (ctx.vars.colsCacheEnsureCols || []).filter(x => sourceUrls.includes(x.wUrl)),
    sourceRoles: ctx.vars.sourceRoles || {}, prefetchPlan: (ctx.vars.prefetchPlan || []).filter(x => sourceUrls.includes(x.wUrl))
  }, ctx) }
  if (prelude.trim()) await send(prelude)
  const result = await send(sql.slice(prelude.length))
  if (result.error) return []
  stats = result.stats
  return tableFromIPC(result.ipc).toArray().map(r => r.toJSON())
}

export const clearCache = (wUrl = true) => request({ clearCache: wUrl })
export const lastRunStats = () => stats || {}
