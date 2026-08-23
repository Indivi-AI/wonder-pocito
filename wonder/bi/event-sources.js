// event-sources.js — the concrete event-source<bi> comps (the BUILD read side) for the cube, split off bi-dsl.js (which
// keeps the EventSource TgpType). a source.read(ctx, period, keyField) → { sourceCb }: a keyField-ordered callbag of events.
import { dsls, jb } from '@jb6/core'
import './bi-dsl.js'   // registers the event-source<bi> TgpType (+ the cube backbone) this file implements against
import './duckdb-utils.js'
import '@wonder/db/db-drivers.js'
const { getAccessToken, wresolve, wfetch2 } = jb.wonderUtils

const { tgp: { TgpType } } = dsls
const EventSource = TgpType('event-source', 'bi')

const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))

// stream a file of concatenated top-level JSON objects ({..}{..}, no separators — GCS compose output),
// calling onObj per complete object. Bounded memory: buffer trimmed to the current object's start each chunk.
const streamConcatJson = async (path, onObj) => {
  const { createReadStream } = await import('fs')
  let buf = '', i = 0, depth = 0, start = 0, inStr = false, esc = false   // i,start are offsets into buf
  for await (const chunk of createReadStream(path, { encoding: 'utf8' })) {
    buf += chunk
    for (; i < buf.length; i++) {
      const c = buf[i]
      if (inStr) { esc ? esc = false : c === '\\' ? esc = true : c === '"' && (inStr = false); continue }
      if (c === '"') inStr = true
      else if (c === '{') { if (depth++ === 0) start = i }
      else if (c === '}' && --depth === 0) onObj(JSON.parse(buf.slice(start, i + 1)))
    }
    // drop everything before the in-progress object (or all, if between objects) to bound memory
    const keepFrom = depth > 0 ? start : i
    buf = buf.slice(keepFrom); i -= keepFrom; start -= keepFrom
  }
}

const nameExtractor = (wUrlEventPattern, keyField) => {
  const fileTpl = wUrlEventPattern.split('/').pop()                  // ${sessionId}-${pageLoadId}-${counter}.json
  const tokens = []
  const rx = fileTpl.replace(/[.*+?^${}()|[\]\\]/g, m => m === '$' ? '$' : '\\' + m)  // escape regex, keep $
    .replace(/\$\{(\w+)\}/g, (_, tok) => { tokens.push(tok); return tok === keyField ? '(.+)' : tok === 'counter' ? '(\\d+)' : '([^-]+)' })
  const re = new RegExp('^' + rx + '$')
  const keyIdx = tokens.indexOf(keyField), counterIdx = tokens.indexOf('counter')
  return name => {
    const m = re.exec(name.split('/').pop()); if (!m) return null
    return { key: m[keyIdx + 1], counter: counterIdx >= 0 ? +m[counterIdx + 1] : 0 }
  }
}

async function compose1024AndDownload(ctx) {
  const { wUrlPrefix, wUrlEventPattern, keyField, tmpPrefix, localDir, outFile, chunkSize = 1024 } = ctx.vars
  const extract = (wUrlEventPattern && keyField) ? nameExtractor(wUrlEventPattern, keyField) : null
  const log = ctx?.vars?.biLogger
  log?.info?.({ event: 'compose1024 enter', wUrlPrefix, hasKService: !!process.env?.K_SERVICE, keyField }, {}, { ctx })
  const { Pool } = await import('undici'), { promises: fsp } = await import('fs')
  log?.info?.({ event: 'undici imported' }, {}, { ctx })
  const token = await getAccessToken(ctx, { method: 'POST' })   // compose/upload/delete → read_write scope
  log?.info?.({ event: 'got access token', tokenLen: token?.length || 0 }, {}, { ctx })
  const resolved = await wresolve(wUrlPrefix.endsWith('/') ? wUrlPrefix : wUrlPrefix + '/', ctx)
  log?.info?.({ event: 'wresolve result', resolved, isStaging: ctx.vars.isStaging, db: ctx.vars.db }, {}, { ctx })
  const m = resolved && resolved.match(/storage\.googleapis\.com\/([^/]+)\/(.*)$/)
  if (!m) throw new Error(`wresolve gave no GCS url: ${resolved}`)
  const [, bucket, prefix] = m
  log?.info?.({ event: 'resolved wUrl', resolved, bucket, prefix }, {}, { ctx })
  const pool = new Pool('https://storage.googleapis.com', { connections: 500, keepAliveTimeout: 60000 })
  const api = `/storage/v1/b/${bucket}/o`, auth = { authorization: `Bearer ${token}` }
  const req = async (method, path, body) => {
    const r = await pool.request({ method, path, headers: { ...auth, ...(body && { 'content-type': 'application/json' }) }, body: body && JSON.stringify(body) })
    if (r.statusCode >= 400) throw new Error(`${method} ${path.slice(0, 80)}: ${r.statusCode}`)
    return r
  }
  const compose = (srcs, to) => req('POST', `${api}/${encodeURIComponent(to)}/compose`, { sourceObjects: srcs.map(name => ({ name })) }).then(r => r.body.dump())
  const composeChained = async (sources, dest, base) => {  // fold >32 via levels (<=1024 components total)
    let cur = sources, lvl = 0
    while (cur.length > 32) { cur = await Promise.all(chunk(cur, 32).map((c, i) => { const t = `${base}L${lvl}_${i}`; return compose(c, t).then(() => t) })); lvl++ }
    await compose(cur, dest)
  }
  try {
    log?.progress?.({ step: 'list', status: 'running', t: 'listing files', prefix })
    const names = []; let pt = ''
    do {
      const r = await req('GET', `${api}?prefix=${encodeURIComponent(prefix)}&maxResults=1000&fields=items(name),nextPageToken${pt ? `&pageToken=${pt}` : ''}`)
      const d = await r.body.json(); (d.items || []).forEach(it => names.push(it.name)); pt = d.nextPageToken
    } while (pt)
    if (extract) {  // order by keyField(+counter) so the concatenated file is keyField-contiguous
      const meta = names.map(n => ({ n, ...(extract(n) || { key: n, counter: 0 }) }))
      meta.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : a.counter - b.counter)
      names.length = 0; meta.forEach(m => names.push(m.n))
    }
    const chunks = chunk(names, chunkSize)
    log?.progress?.({ step: 'list', status: 'done', t: `${names.length} files` })
    log?.info?.({ event: 'listed', files: names.length, composites: chunks.length, prefix }, {}, { ctx })

    log?.progress?.({ step: 'download', status: 'running', t: `0/${chunks.length} composites` })
    await fsp.mkdir(localDir, { recursive: true })
    const out = outFile || `${localDir}/all.jsonl`
    await fsp.writeFile(out, '')
    // compose+download each composite, append straight into the single jsonl (parallel fetch, ordered append)
    let done = 0
    const bufs = await Promise.all(chunks.map(async (files, i) => {
      const dest = `${tmpPrefix}/c${i}`
      await composeChained(files, dest, `${tmpPrefix}/c${i}_`)
      const r = await req('GET', `/${bucket}/${dest.split('/').map(encodeURIComponent).join('/')}`)
      req('DELETE', `${api}/${encodeURIComponent(dest)}`).catch(() => {})  // cleanup GCS temp
      const buf = Buffer.from(await r.body.arrayBuffer())
      done++
      log?.progress?.({ step: 'download', status: done === chunks.length ? 'done' : 'running', t: `${done}/${chunks.length} composites` })
      return buf
    }))
    log?.progress?.({ step: 'concat', status: 'running', t: 'writing jsonl' })
    for (const b of bufs) await fsp.appendFile(out, b)
    const bytes = (await fsp.stat(out)).size
    log?.progress?.({ step: 'concat', status: 'done', t: `${bytes} bytes` })
    log?.info?.({ event: 'done', files: names.length, composites: chunks.length, bytes, outFile: out }, {}, { ctx })
    return out
  } catch (e) {
    log?.error?.({ event: 'compose1024AndDownload failed', prefix }, {}, { ctx, error: e })
    throw e
  } finally {
    await pool.close()
  }
}

// bucketUrlSourceJsonEvents — the GCS default (bare wUrl coerces here). wUrlEventPattern is a FILE-PER-EVENT room prefix,
// e.g. roomLogs://sessions/${period}/${sessionId}-${counter}.json. read(): PHASE 1 (the promise) — derive the period
// prefix, compose1024 the thousands of small files into ONE local jsonl (filenames pre-sorted by keyField → the jsonl
// is keyField-contiguous). PHASE 2 ({ sourceCb }) — streamConcatJson it, UNWRAP each {content} and push. never buffers.
EventSource('bucketUrlSourceJsonEvents', {
  description: 'GCS file-per-event source: compose1024 a room prefix into a keyField-sorted jsonl, stream+unwrap each event.',
  params: [{ id: 'wUrlEventPattern', as: 'string', mandatory: true, description: 'file-per-event room prefix, e.g. roomLogs://sessions/${period}/${sessionId}-${counter}.json' }],
  impl: (_, {}, { wUrlEventPattern }) => ({
    async read(ctx, period, keyField) {
      const log = ctx?.vars?.biLogger, t0 = Date.now()
      const localDir = ctx.vars.localDir || `/dev/shm/daily-logs-${period}`
      const wUrlPrefix = wUrlEventPattern.replace('${period}', period).replace(/\$\{[^}]*\}.*$/, '')
      const c = ctx.setVars({ wUrlPrefix, wUrlEventPattern, keyField, localDir, tmpPrefix: ctx.vars.tmpPrefix || `tmp/daily-logs/${period}`, outFile: `${localDir}/all.jsonl` })
      const jsonl = await compose1024AndDownload(c)
      const sourceCb = (t, sink) => {
        if (t !== 0) return
        sink(0, () => {})   // talkback: greedy pull, no backpressure
        let events = 0
        streamConcatJson(jsonl, o => { events++; sink(1, typeof o.content === 'string' ? JSON.parse(o.content) : o.content) })
          .then(() => {
            log?.info?.({ t: 'eventSource.read', source: 'bucketUrlSourceJsonEvents',
              period, from: wUrlPrefix, keyField, events, ms: Date.now() - t0 }, {}, { ctx })
            sink(2)
          }, e => sink(2, e))
      }
      return { sourceCb }
    }
  })
})

// apiWUrlSource — the generic single-fetch source (NOT fb-specific): ONE wfetch2 of any wUrl (period substituted),
// body is either a bounded rows[] or a {result: rows[]} envelope (connectors wrap, plain json files don't). sort the
// rows by keyField in RAM (bounded → cheap) then emit. fb is just one scheme it hits; any json wUrl works the same.
EventSource('apiWUrlSource', {
  description: 'single-fetch source: wfetch2 one wUrl, take body.result ?? body (bare array), sort by keyField in RAM, emit each.',
  params: [
    { id: 'wUrl', as: 'string', mandatory: true, description: 'json wUrl, e.g. fbInsights://insights?...&day=${period} or room://x/rows-${period}.json' },
    { id: 'headers', description: 'extra request headers, e.g. {"x-wonder-secret": "signedRoom://schematics/admin/secrets.json"}' }
  ],
  impl: (_, {}, { wUrl, headers }) => ({
    async read(ctx, period, keyField) {
      const log = ctx?.vars?.biLogger, t0 = Date.now()
      const from = wUrl.replace('${period}', period).replace('{period}', period)
      const res = await wfetch2(from, { method: 'GET', headers }, ctx)
      const body = await res.json()
      const rows = Array.isArray(body) ? body : (body?.result || [])
      rows.sort((a, b) => a[keyField] < b[keyField] ? -1 : a[keyField] > b[keyField] ? 1 : 0)
      const sourceCb = (t, sink) => {
        if (t !== 0) return
        sink(0, () => {})
        for (const ev of rows) sink(1, ev)
        log?.info?.({ t: 'eventSource.read', source: 'apiWUrlSource', period, from, keyField, events: rows.length, ms: Date.now() - t0 }, { sample: rows[0] }, { ctx })
        sink(2)
      }
      return { sourceCb }
    }
  })
})

EventSource('csvEventSource', {
  description: 'stream a keyField-ordered CSV from a local path or wUrl as events without buffering rows.',
  params: [{ id: 'wUrl', as: 'string', mandatory: true }, { id: 'sortByKey', as: 'boolean', byName: true }],
  impl: (_, {}, { wUrl, sortByKey }) => ({
    async read(ctx, period, keyField) {
      const log = ctx?.vars?.biLogger, t0 = Date.now(), from = wUrl.replace('${period}', period).replace('{period}', period)
      const resolved = /^\w+:(?:\w+)?:?\/\//.test(from) ? await wresolve(from, ctx) : from
      const jsonl = `/tmp/csv-events-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`
      const q = s => `'${s.replaceAll("'", "''")}'`
      const orderBy = sortByKey ? ` order by "${keyField.replaceAll('"', '""')}"` : ''
      const { error, stderr } = await jb.biUtils.runDuckdbSqlByHost(
        `copy (select * from read_csv_auto(${q(resolved)})${orderBy}) to ${q(jsonl)} (format json, array false)`, ctx, { as: 'nonQuery' })
      if (error) throw new Error(stderr)
      log?.info?.({ t: 'csvEventSource prepared', from, resolved, keyField, sortByKey, note: 'log to delete' }, {}, { ctx })
      return { sourceCb: (t, sink) => {
        if (t !== 0) return
        sink(0, () => {})
        let events = 0
        streamConcatJson(jsonl, event => { events++; sink(1, event) })
          .then(async () => {
            await import('fs/promises').then(fs => fs.unlink(jsonl))
            log?.info?.({ t: 'eventSource.read', source: 'csvEventSource', period, from, keyField, events, ms: Date.now() - t0 }, {}, { ctx })
            sink(2)
          }, error => sink(2, error))
      } }
    }
  })
})
