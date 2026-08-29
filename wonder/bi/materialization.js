// materialization.js — the BUILD side of the bi cube, split off bi-dsl.js (which keeps every TgpType + the QUERY/gold engine).
// materializeFromEvents (bronze events → silver objs/parquet) + its drive entrypoints, and the reducer vocabulary the fields[]
// are built from: event-predicates, pick strategies, the pick reducer, broadcast lookups, and the enrichment reducers.
import { dsls, coreUtils, jb } from '@jb6/core'
import '@jb6/common'
import './bi-dsl.js'   // declares the silver-builder/event-source/field-reducer/lookup/pick/event-predicate TgpTypes + `span`
import '@wonder/db/db-drivers.js'
const { wresolve, wfetch2 } = jb.wonderUtils
import '@jb6/rx'   // registers jb.rxUtils (subscribe) — the callbag consumer `drain` uses to pull an event source

const span = coreUtils.biSpan   // the provenance back-pointer bi-dsl set on coreUtils (Symbol.for('bi-span'))

const {
  tgp: { TgpType, TgpTypeModifier },
  common: { Data, CubeTool }
} = dsls
const { Ctx } = coreUtils
const biUtils = jb.biUtils ||= {}
const { runDuckdbSqlByHost, runDuckdb } = biUtils   // duckdb runners from duckdb-utils.js (via bi-dsl import chain)
const SilverBuilder   = TgpType('silver-builder', 'bi')
const EventPredicate = TgpType('event-predicate', 'bi')
const FieldReducer   = TgpType('field-reducer', 'bi')
const Lookup         = TgpType('lookup', 'bi')
const Pick           = TgpType('pick', 'bi')

function drain(sourceCb, onEvent) { return new Promise((res, rej) => jb.rxUtils.subscribe({ next: onEvent, complete: res, error: rej })(sourceCb)) }
function at(obj, path) { return path.split('.').reduce((o, k) => o == null ? o : o[k], obj) }   // 'urlParams.sub1'
function num(v) { const n = +v; return isNaN(n) ? 0 : n }
function dedup(arr, by) {
  if (!by?.length) return arr
  const seen = {}
  return arr.filter(e => { const k = by.map(p => at(e, p) ?? '').join('\u0000'); return k in seen ? false : (seen[k] = 1) })
}
function normalizeReducer(r) { return typeof r === 'function' ? { reduce: r } : r }

SilverBuilder('materializeFromEvents', {
  description: `BUILD side: reconstruct silver objs from raw bronze events. fields[] are cubeReducers; materialize groups
  events by keyField and reduces each object's events → one silver obj. parquetFiles[] are the physical artifacts.`,
  typescript: '{ materialize: (events: Event[]) => obj[], keyField, periodPattern, parquetFiles }',
  params: [
    {id: 'eventSource', type: 'event-source<bi>',
      description: 'bronze source. bare wUrls use bucketUrlSourceJsonEvents; apiWUrlSource pulls connector rows.'},
    {id: 'accounts', type: 'account<wonder>[]',
      description: 'ad accounts whose connectors produce the bronze events reduced by this cube.'},
    {id: 'keyField', as: 'string', defaultValue: 'sessionId', description: 'event field events are grouped by → one obj per distinct value'},
    {id: 'periodGranularity', as: 'string', defaultValue: 'daily', options: 'daily,hourly', description: 'conceptual grain; code is grain-agnostic, used by discovery'},
    {id: 'periodPattern', as: 'string', defaultValue: 'YYYY-MM-DD', description: 'how a period id is formatted, e.g. YYYY-MM-DD or YYYY-MM-DD-HH'},
    {id: 'buildLookups', type: 'lookup[]',
      description: 'BUILD-phase reference tables broadcast once into ctx.vars Maps for enrichFromLookup reducers.'},
    {id: 'fields',      type: 'field-reducer[]', mandatory: true},
    {id: 'validations', type: 'validation[]',   description: 'obj rules → adds valid (0/1) + invalidReasons fields to each object'},
    {id: 'parquetFiles',type: 'parquet-file[]', description: 'physical parquet artifacts: projection(s) (per-obj) and/or rollup(s) (per-group)'},
  ],
  impl: (_, {}, { eventSource, accounts, keyField, periodGranularity, periodPattern, buildLookups, fields, validations, parquetFiles }) => {
    accounts = accounts || []; buildLookups = buildLookups || []
    // source-events wUrl: sibling of parquetFiles[0] → events-of-{keyField}-{period}.jsonl
    const eventsWUrl = period => (parquetFiles?.[0]?.wUrlPattern || '')
      .replace(/[^/]+\.parquet$/, `events-of-${keyField}-${period}.jsonl`)
      .replace('${period}', period).replace('{period}', period)
    const reducers = (fields || []).map(normalizeReducer)
    const fieldR = reducers.filter(r => r.phase !== 'obj')
    const objR   = reducers.filter(r => r.phase === 'obj')
    const phases = [...new Set(buildLookups.map(l => l.phase || 0))].sort((a, b) => a - b)
    return {
    sourceType: 'event-batches',
    async plan(ctx, requirements, { periods = ctx.vars.timePeriods || [] } = {}) {
      return { sourceType: 'event-batches', requirements, periods, parquetFiles }
    },
    async build(ctx, plan) {
      const results = []
      for (const period of plan.periods) {
        try { results.push(await this.materializePeriod(ctx, period)) }
        catch (error) {
          ctx.vars.biLogger?.error?.({ event: 'period failed', period }, {}, { ctx, error })
          results.push({ period, error: error.stack })
        }
      }
      return { ok: results.every(result => !result.error), sourceType: 'event-batches', results }
    },
    // load all cube.buildLookups into ctx.vars[as], phase-ordered (later phases can read earlier from ctx.vars)
    async loadLookups(ctx) {
      for (const ph of phases) {
        const loaded = await Promise.all(buildLookups.filter(l => (l.phase || 0) === ph).map(async l => [l.as, await l.prepare(ctx)]))
        ctx = ctx.setVars(Object.fromEntries(loaded))   // ctx.vars[as] = { get(key) }
      }
      return ctx
    },
    // reduce one object's events (time-sorted) → one silver `obj`. field-phase reducers see EVENTS: reduce(events, ctx).
    // obj-phase reducers see the materialized OBJ: reduce(obj, ctx) — they derive columns from sibling fields. then validations.
    reduceObject(objEvents, ctx) {
      const sorted = [...objEvents].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      const parts = fieldR.map(r => r.reduce(sorted, ctx))
      const obj = Object.assign({}, ...parts)
      const spans = parts.map(p => p[span]).filter(Boolean)
      if (spans.length) obj[span] = { tier: 'silver', fields: Object.assign({}, ...spans.map(s => s.fields)) }
      for (const r of objR) Object.assign(obj, r.reduce(obj, ctx))
      if (ctx?.vars?.brushMode && obj[span]) obj[span].key = obj[keyField]   // span: tag the silver obj with its keyField address
      const failed = (validations || []).filter(v => !v.test(obj)).map(v => v.name)
      return validations?.length ? { ...obj, valid: failed.length ? 0 : 1, invalidReasons: failed } : obj
    },
    // single-object materialization: load buildLookups (once) → reduce ONE key's events → one silver obj. the drill reuses this.
    async materializeOne(events, ctx) {
      const enriched = buildLookups.length && ctx ? await this.loadLookups(ctx) : ctx
      return this.reduceObject(events, enriched)
    },
    // funnel: load buildLookups → group events by keyField → reduce each group → silver objs
    async materialize(events, ctx) {
      const log = ctx?.vars?.biLogger
      const enriched = buildLookups.length && ctx ? await this.loadLookups(ctx) : ctx
      const groups = events.reduce((g, ev) => ((g[ev[keyField]] ||= []).push(ev), g), {})
      const objs = Object.values(groups).map(evs => this.reduceObject(evs, enriched))
      log?.info?.({ event: 'materialize', events: events.length, keys: Object.keys(groups).length, objs: objs.length }, { sample: objs[0] }, { ctx })
      return objs
    },
    // DRILL — getSourceEvents: ONE key's events, duckdb-scanned out of the source-events jsonl we wrote beside the parquet at build.
    async getSourceEvents(key, period, ctx) {
      const log = ctx?.vars?.biLogger, t0 = Date.now()
      const wUrl = eventsWUrl(period)
      // DRILL reads the source-events jsonl straight from the source — one UNWRAPPED event per line — filtered by keyField in JS (no cache, no duckdb → runs in node AND browser).
      const res = await wfetch2(wUrl, { method: 'GET' }, ctx)
      const events = res?.ok ? (await res.text()).split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(ev => ev[keyField] === key) : []
      log?.info?.({ t: 'getSourceEvents', key, period, wUrl, events: events.length, ms: Date.now() - t0 }, { events: coreUtils.squeeze(events) }, { ctx })
      return events
    },
    // DRILL — resolveKey: one key's bronze → materializeOne(brushMode) → silver obj WITH [span] (winner = field.events[pickedIdx]).
    async resolveKey(key, period, ctx) {
      return this.materializeOne(await this.getSourceEvents(key, period, ctx), ctx.setVars({ brushMode: true }))
    },
    // PRODUCER phase (impl TBD): accounts[].connectors will PULL+LAND bronze before the cube reads it.
    async produce(ctx, period) { throw new Error('cube.produce: not implemented (accounts/connectors producer phase TBD)') },
    // materialize one closed period → one silver parquet. Reads io config from ctx.vars (localDir, tmpPrefix).
    async materializePeriod(_ctx, period) {
      const { promises: fsp } = await import('fs')
      // buildSetup asserts gcp identity (K_SERVICE) + scratch paths into ctx.
      const periodCtx = this.buildSetup(_ctx, period)
      const ctx = periodCtx, log = ctx?.vars?.biLogger, ms = t => Date.now() - t
      const localDir = ctx.vars.localDir
      await fsp.mkdir(localDir, { recursive: true })
      log?.info?.({ event: 'materializePeriod start', period }, {}, { ctx })

      // reduce: the eventSource emits keyField-ordered events; accumulate one object's events, flush its silver obj on
      // key change. bounded memory: only the current object's events + the output streams are resident.
      let t = Date.now()
      log?.progress?.({ step: 'reduce', status: 'running', t: 'streaming reduce' })
      const redCtx = buildLookups.length ? await this.loadLookups(periodCtx) : periodCtx   // broadcast buildLookups once
      const silver = `${localDir}/silver-${period}.jsonl`
      const srcEvents = `${localDir}/source-events-${period}.jsonl`   // clean drill source: one UNWRAPPED event per line (db-driver reads raw jsonl)
      const ws = (await import('fs')).createWriteStream(silver)
      const es = (await import('fs')).createWriteStream(srcEvents)
      const seen = {}; let curKey, group = [], events = 0, objs = 0, maxGroup = 0
      const flush = () => {
        if (group.length) {
          const obj = this.reduceObject(group, redCtx)
          ws.write(JSON.stringify(obj) + '\n'); objs++
          maxGroup = Math.max(maxGroup, group.length)
          if (objs <= 3) log?.info?.({ event: 'sample obj', period, objNum: objs, groupSize: group.length }, { obj }, { ctx })
        }
        group = []
      }
      const { sourceCb } = await eventSource.read(periodCtx, period, keyField)
      await drain(sourceCb, ev => {
        const k = ev[keyField]; events++
        if (k !== curKey) { flush(); if (seen[k]) throw new Error(`keyField not contiguous: ${k} reappeared`); seen[k] = 1; curKey = k }
        group.push(ev); es.write(JSON.stringify(ev) + '\n')
        if (events % 5000 === 0) log?.info?.({ event: 'streaming progress', period, events, objs }, {}, { ctx })
      })
      flush()
      await new Promise(r => ws.end(r))
      await new Promise(r => es.end(r))
      log?.progress?.({ step: 'reduce', status: 'done', t: `${objs} objs` })
      log?.info?.({ event: 'reduce done', period, events, objs, distinctKeys: Object.keys(seen).length,
        maxEventsPerObject: maxGroup, reduceMs: ms(t) }, {}, { ctx })

      t = Date.now()
      log?.progress?.({ step: 'parquet', status: 'running', t: `${objs} objs` })
      const parquet = `${localDir}/closed-${period}.parquet`
      const copySql = `COPY (SELECT * FROM read_json_auto('${silver}')) TO '${parquet}' (FORMAT PARQUET, COMPRESSION ZSTD)`
      const { error, stderr } = await runDuckdbSqlByHost(copySql, ctx, { as: 'nonQuery' })
      if (error) throw new Error(`duckdb copy failed: ${stderr}`)
      const bytes = (await fsp.stat(parquet)).size
      log?.progress?.({ step: 'parquet', status: 'done' })
      log?.info?.({ event: 'parquet written', period, objs, parquetMs: ms(t), bytes, localFile: parquet }, {}, { ctx })

      // PUBLISH: upload the local parquet + the events jsonl (drill source)
      t = Date.now()
      const outWUrl = (parquetFiles?.[0]?.wUrlPattern || '').replace('${period}', period).replace('{period}', period)
      let outUrl = null
      const upload = async (wUrl, file) => {
        const res = await wfetch2(wUrl, { method: 'PUT', body: file, headers: {
          'x-wonder-body': 'localFile', 'content-type': 'application/vnd.apache.parquet'} }, ctx)
        if (!res.ok) throw new Error(`upload failed: ${res.status} ${res.statusText}`)
        return wUrl
      }
      if (outWUrl) {
        log?.progress?.({ step: 'upload', status: 'running', t: outWUrl })
        outUrl = await upload(outWUrl, parquet)
        await upload(eventsWUrl(period), srcEvents)   // source-events sibling: drill reads this, not roomLogs
        log?.progress?.({ step: 'upload', status: 'done', t: outUrl })
      }
      log?.info?.({ event: 'bronzeToSilver done', period, objs, bytes, uploadMs: ms(t), outUrl: outUrl || '(local only — no parquetFiles)', localFile: parquet }, {}, { ctx })
      return { period, objs, bytes, parquet, outUrl }
    },
    // client surface: materialize the given periods. ctx.vars.timePeriods = ['2026-05-28', ...].
    // discovery (which periods need work) is the caller's job — see discoverPeriodGaps.
    async bronzeToSilver(ctx) {
      return (await this.build(ctx, await this.plan(ctx))).results
    },
    // TODO: list source periods (wUrlEventPattern dirs, formatted by periodPattern) minus already-built
    // parquets (parquetFiles dests), honoring "closed only" + version → return the periods needing (re)build.
    async discoverPeriodGaps(ctx) { throw new Error('discoverPeriodGaps not implemented') },
    // buildSetup (BUILD: bronze→silver): scratch paths for one period → ctx vars. the eventSource owns its own wUrl/prefix.
    buildSetup(ctx, period) {
      const c = ctx.setVars({ hasGcpIdentity: ctx.vars.hasGcpIdentity ?? !!process.env.K_SERVICE })
      const localDir = c.vars.localDir || `/dev/shm/daily-logs-${period}`
      return c.setVars({ keyField, localDir, tmpPrefix: c.vars.tmpPrefix || `tmp/daily-logs/${period}` })
    },
    name: parquetFiles?.[0]?.name, eventSource, accounts, keyField, periodGranularity, periodPattern, buildLookups, validations, parquetFiles
  }}
})

// resolve a cube profile via dynamic:true (no ctx.run in impl) → RT cube object, then materialize `events`.
CubeTool('materializeCubeEvents', {
  params: [
    { id: 'cube', type: 'cube<bi>', dynamic: true, mandatory: true },
    { id: 'events', as: 'array', defaultValue: '%$events%' }
  ],
  impl: (ctx, {}, { cube, events }) => cube(ctx).materialize(events, ctx)
})

CubeTool('buildCube', {
  params: [{ id: 'cube', type: 'cube<bi>', dynamic: true, mandatory: true }, { id: 'requirements', asIs: true }, { id: 'options', asIs: true }],
  impl: async (ctx, {}, { cube, requirements, options }) => {
    const source = cube(ctx), plan = await source.plan(ctx, requirements, options)
    return { plan, result: await source.build(ctx, plan) }
  }
})

// SOURCE-ONLY test surface: resolve an event-source profile via dynamic:true → RT { read }, drive its read() for one
// period, COLLECT the emitted events (no reduce, no parquet). returns { events, count, firstKey, lastKey, contiguous }
// so a test asserts the source's whole contract — it emits, and emits keyField-CONTIGUOUS — in isolation from the cube.
Data('readEventSource', {
  params: [
    { id: 'source', type: 'event-source<bi>', dynamic: true, mandatory: true },
    { id: 'period', as: 'string', mandatory: true },
    { id: 'keyField', as: 'string', mandatory: true }
  ],
  impl: async (ctx, {}, { source, period, keyField }) => {
    const events = [], seen = {}; let curKey, contiguous = true
    const { sourceCb } = await source(ctx).read(ctx, period, keyField)
    await drain(sourceCb, ev => {
      const k = ev[keyField]
      if (k !== curKey) { if (seen[k]) contiguous = false; seen[k] = 1; curKey = k }
      events.push(ev)
    })
    return { count: events.length, firstKey: events[0]?.[keyField], lastKey: events.at(-1)?.[keyField], contiguous, events }
  }
})

// resolve a cube profile via dynamic:true → RT cube object, then materialize one closed `period` → silver parquet.
CubeTool('materializeCubePeriod', {
  params: [
    { id: 'cube', type: 'cube<bi>', dynamic: true, mandatory: true },
    { id: 'period', as: 'string', mandatory: true }
  ],
  impl: (ctx, {}, { cube, period }) => cube(ctx).materializePeriod(ctx, period)
})

// DRILL entrypoint: re-run ONE key's bronze → silver obj carrying [span] (the provenance back-pointer). debug-only path.
CubeTool('resolveKeySpan', {
  params: [
    { id: 'cube', type: 'cube<bi>', dynamic: true, mandatory: true },
    { id: 'key', as: 'string', mandatory: true },
    { id: 'queryPeriod', as: 'string', defaultValue: '%$queryPeriod%' }
  ],
  impl: (ctx, {}, { cube, key, queryPeriod }) => cube(ctx).resolveKey(key, queryPeriod, ctx)
})

EventPredicate('eventType', {
  description: "ev.t matches name; comma-separated = match ANY, e.g. eventType('clickConversion,leadConversion'). The most common predicate.",
  params: [{id: 'name', as: 'string', mandatory: true}],
  impl: (_, {}, { name }) => { const names = name.split(',').map(s => s.trim()); return ev => names.includes(ev.t) }
})

EventPredicate('equals', {
  description: 'event.<path> == value.',
  params: [
    {id: 'path',  as: 'string', mandatory: true},
    {id: 'value', mandatory: true}
  ],
  impl: (_, {}, { path, value }) => ev => at(ev, path) === value
})

EventPredicate('notNull', {
  description: 'event.<path> != null.',
  params: [{id: 'path', as: 'string', mandatory: true}],
  impl: (_, {}, { path }) => ev => at(ev, path) != null
})

EventPredicate('and', {
  description: 'logical AND. Composite, accepts eventPredicate<bi>[].',
  params: [{id: 'items', type: 'eventPredicate<bi>[]', mandatory: true, composite: true}],
  impl: (_, {}, { items }) => ev => items.every(p => p(ev))
})

EventPredicate('or', {
  description: 'logical OR. Composite, accepts eventPredicate<bi>[].',
  params: [{id: 'items', type: 'eventPredicate<bi>[]', mandatory: true, composite: true}],
  impl: (_, {}, { items }) => ev => items.some(p => p(ev))
})

EventPredicate('not', {
  description: 'logical NOT.',
  params: [{id: 'of', type: 'eventPredicate<bi>', mandatory: true}],
  impl: (_, {}, { of }) => ev => !of(ev)
})

// pick<bi> strategies: each (events, ctx<fieldIdForTake, pathForTake>) => the picked value.
// position-pickers also set f.pickedIdx = the chosen event's index (the span highlights THAT event, not every value
// match). aggregates leave pickedIdx undefined ⇒ the span falls back to value-match. impl returns the SAME function f
// across calls (per-field), so pickedIdx is read right after the take call, before the next field overwrites it.
function p(ctx) { return ctx.vars.pathForTake }
const firstNotNull = Pick('firstNotNull', { impl: () => {
  const f = (es, ctx) => (f.pickedIdx = es.findIndex(e => at(e, p(ctx)) != null),
    f.pickedIdx < 0 ? null : at(es[f.pickedIdx], p(ctx)))
  return f
} })
Pick('first',        { impl: () => { const f = (es, ctx) => (f.pickedIdx = es.length ? 0 : -1, (es[0] && at(es[0], p(ctx))) ?? null); return f } })
Pick('last',         { impl: () => { const f = (es, ctx) => (f.pickedIdx = es.length - 1, (es.at(-1) && at(es.at(-1), p(ctx))) ?? null); return f } })
Pick('all',          { impl: () => (es, ctx) => es.map(e => at(e, p(ctx)) ?? null) })
Pick('mostFrequent', { impl: () => { const f = (es, ctx) => {
  const c = {}
  for (const e of es) { const v = at(e, p(ctx)); if (v != null) c[v] = (c[v] || 0) + 1 }
  const best = Object.entries(c).sort((a, b) => b[1] - a[1])[0]
  f.pickedIdx = best ? es.findIndex(e => String(at(e, p(ctx))) === best[0]) : -1
  return best ? best[0] : null
}; return f } })
// aggregators (count ignores path; sum/min/max/distinctCount reduce values at path; exists → 0/1).
const count = Pick('count',   { impl: () => es => es.length })
Pick('sum',           { impl: () => (es, ctx) => es.reduce((a, e) => a + num(at(e, p(ctx))), 0) })
Pick('min',           { impl: () => (es, ctx) => { const v = es.map(e => at(e, p(ctx))).filter(x => x != null); return v.length ? Math.min(...v.map(num)) : null } })
Pick('max',           { impl: () => (es, ctx) => { const v = es.map(e => at(e, p(ctx))).filter(x => x != null); return v.length ? Math.max(...v.map(num)) : null } })
// argmax position-picker: the max value at path AND f.pickedIdx = the winning event ⇒ the span highlights THAT one event.
Pick('peak', { impl: () => {
  const f = (es, ctx) => (f.pickedIdx = es.reduce(
    (b, e, i) => num(at(e, p(ctx))) > num(at(es[b], p(ctx))) ? i : b, 0),
  es.length ? num(at(es[f.pickedIdx], p(ctx))) : null)
  return f
} })
Pick('distinctCount', { impl: () => (es, ctx) => new Set(es.map(e => at(e, p(ctx)))).size })
Pick('exists',        { impl: () => es => es.length ? 1 : 0 })
// combinator: keep events unique by `by` key paths, then delegate to inner `take` (recursive pick<bi>).
Pick('uniqueBy', {
  params: [
    {id: 'by',   as: 'string', mandatory: true, description: 'comma-separated key paths to keep events unique by'},
    {id: 'take', type: 'pick<bi>', byName: true, defaultValue: count()}
  ],
  impl: (_, {}, { by, take }) => (es, ctx) => take(dedup(es, by.split(',').map(s => s.trim())), ctx)
})

// the ONE field-picking reducer. fields = csv of 'path' or 'path as alias' (alias defaults to leaf). eventFilter scopes
// events; take = a pick<bi> strategy comp, default firstNotNull(). per-field ctx carries fieldId + path.
FieldReducer('pick', {
  description: "pick fields: 'timestamp as start_dt, page, page_params.sub1'. take = a pick<bi> strategy. eventFilter scopes events.",
  params: [
    {id: 'fields',      as: 'string', mandatory: true, description: "csv of 'path' or 'path as alias'; alias defaults to path leaf"},
    {id: 'eventFilter', type: 'event-predicate<bi>', byName: true, description: 'optional: scope to events matching this predicate'},
    {id: 'take',        type: 'pick<bi>', byName: true, defaultValue: firstNotNull()}
  ],
  impl: (_, {}, { fields, eventFilter, take }) => {
    const specs = fields.split(',').map(s => s.trim()).map(s => {
      const [path, alias] = s.split(/\s+as\s+/i)
      return [alias || path.split('.').pop(), path]
    })
    const reduce = (events, ctx = new Ctx()) => {
    const matches = eventFilter ? events.filter(eventFilter) : events   // events as the take SEES them (sorted upstream, then filtered)
    const obj = {}
    for (const [alias, path] of specs) {
      const fctx = ctx.setVars({ fieldIdForTake: alias, pathForTake: path })
      const value = obj[alias] = take(matches, fctx)
      if (fctx.vars.brushMode)   // span: ship the SAME `matches` array the take saw, so pickedIdx indexes it directly (UI reads field.events, never re-fetches)
        (obj[span] ||= { tier: 'silver', fields: {} }).fields[alias] = {
          events: matches, pickedIdx: take.pickedIdx ?? matches.findIndex(e => at(e, path) === value), tgpPath: fctx.jbCtx.lexicalParentPath
        }
    }
    return obj
    }
    reduce.aliases = specs.map(([alias]) => alias)   // the silver COLUMN names this pick produces (for cube.summary / span keys)
    return reduce
  }
})

// --- enrichment: lookup (load a small reference parquet once → ctx.vars[as] Map) + reducers that read it ---
const refCache = {}
function toMap(rows, key) { const m = new Map(); for (const r of rows) m.set(key.map(k => r[k] ?? '').join('\u0000'), r); return m }
async function loadRef(table, key, ctx) {   // broadcast Map keyed by `key`, memoized per table+key
  const ck = `${table}|${key.join(',')}`
  if (refCache[ck]) return refCache[ck]
  let map = new Map()
  try {
    const glob = (await wresolve(table.replace(/\$\{period\}|\{period\}/, '*'), ctx)).replace('https://storage.googleapis.com/', 'gs://')
    map = toMap(await runDuckdb(`SELECT * FROM read_parquet('${glob}')`, ctx), key)
  } catch (e) { /* ref unavailable → empty map → enrichFromLookup yields null */ }
  return refCache[ck] = map
}
// resolve every embedded wUrl (scheme://...) inside the sql to a gs:// glob, then run it → Map keyed by `key`. = fileQuery essence.
async function resolveSqlWurls(sql, ctx) {
  const wurls = [...new Set(sql.match(/[a-zA-Z][\w-]*:\/\/[^'")\s]+/g) || [])]
  let out = sql
  for (const u of wurls) {
    const gs = (await wresolve(u.replace(/\$\{period\}|\{period\}/, '*'), ctx)).replace('https://storage.googleapis.com/', 'gs://')
    out = out.split(u).join(gs)
  }
  return out
}
async function loadByQuery(sql, key, ctx) {
  const ck = `${sql}|${key.join(',')}`
  if (refCache[ck]) return refCache[ck]
  let map = new Map()
  try { map = toMap(await runDuckdb(await resolveSqlWurls(sql, ctx), ctx), key) }
  catch (e) { /* query failed → empty map */ }
  return refCache[ck] = map
}

Lookup('lookupTable', {
  description: 'BROADCAST lookup: load a small reference parquet once into a Map; get(key) is sync. = ad_ids/links/clients.',
  params: [
    {id: 'as',    as: 'string', mandatory: true, description: 'ctx.vars name; enrichFromLookup reads it by this'},
    {id: 'table', as: 'string', mandatory: true, description: 'reference parquet wUrl'},
    {id: 'key',   as: 'array',  mandatory: true, description: 'broadcast-map key column(s)'},
    {id: 'phase', as: 'number', defaultValue: 0, description: 'load order; later phases can read earlier lookups from ctx.vars'}
  ],
  impl: (_, {}, { as, table, key, phase }) => ({ as, key, phase,
    prepare: async ctx => { const map = await loadRef(table, key, ctx); return { get: k => map.get(k) } } })
})

// lookupByQuery: BROADCAST lookup whose source is a FULL duckdb query (filter/dedup/join in SQL) → Map keyed by `key`.
Lookup('lookupByQuery', {
  description: 'BROADCAST lookup from a full duckdb SQL (read_parquet/wUrl, WHERE, QUALIFY dedup, JOIN) → Map. = cards/conversions joins.',
  params: [
    {id: 'as',    as: 'string', mandatory: true, description: 'ctx.vars name; enrichFromLookup reads it by this'},
    {id: 'sql',   as: 'string', mandatory: true, description: "full duckdb query, e.g. SELECT * FROM read_parquet('wUrl') WHERE clicked=1 QUALIFY row_number() OVER (...)=1"},
    {id: 'key',   as: 'array',  mandatory: true, description: 'broadcast-map key column(s)'},
    {id: 'phase', as: 'number', defaultValue: 0, description: 'load order; later phases can read earlier lookups from ctx.vars'}
  ],
  impl: (_, {}, { as, sql, key, phase }) => ({ as, key, phase,
    prepare: async ctx => { const map = await loadByQuery(sql, key, ctx); return { get: k => map.get(k) } } })
})

FieldReducer('enrichFromLookup', {
  description: 'pick a field from a broadcast lookup via compact path "ref[joinKey1,joinKey2]/pick". pure & sync.',
  params: [
    {id: 'as',   as: 'string', mandatory: true},
    {id: 'path', as: 'string', mandatory: true, description: 'ref[key1,key2]/pick, e.g. adIdsBySub3Sub1[sub3,sub1]/vertical'}
  ],
  impl: (_, {}, { as, path }) => {
    const [, ref, key, pick] = path.match(/^([^[]+)\[([^\]]*)\]\/(.+)$/)
    const keys = key.split(',').map(s => s.trim())
    return { reduce: (events, ctx) => ({ [as]: ctx?.vars?.[ref]?.get(keys.map(f => at(events[0], f) ?? '').join('\u0000'))?.[pick] ?? null }) }
  }
})

FieldReducer('firstSucceeding', {
  description: 'obj-phase: first non-null among already-computed sibling fields (in priority order) → as.',
  params: [
    {id: 'as',     as: 'string', mandatory: true},
    {id: 'fields', as: 'array',  mandatory: true, description: 'sibling field names, in priority order'}
  ],
  impl: (_, {}, { as, fields }) => ({ phase: 'obj', reduce: obj => ({ [as]: fields.map(f => obj[f]).find(v => v != null) ?? null }) })
})

FieldReducer('withAggFunc', {
  description: 'field-phase: aggregate the event array into columns; aggFunc is a data<common> profile evaluated with the sorted events[] as data.',
  params: [
    {id: 'aggFunc', type: 'data<common>', dynamic: true, mandatory: true, description: 'expression over the events[] (as data) returning the aggregated columns object'}
  ],
  impl: (_, {}, { aggFunc }) => ({ reduce: (events, ctx = _) => aggFunc(ctx.setData(events)) })
})

FieldReducer('withReduceFunc', {
  description: 'obj-phase: compute derived columns from sibling fields; reduceFunc is a data<common> profile returning the columns object, evaluated over the silver obj.',
  params: [
    {id: 'reduceFunc', type: 'data<common>', dynamic: true, mandatory: true, description: 'expression over the obj (e.g. obj(prop(...))) returning the derived columns'}
  ],
  impl: (_, {}, { reduceFunc }) => ({ phase: 'obj', reduce: (obj, ctx = _) => reduceFunc(ctx.setData(obj)) })
})

// dynamicPivotFields: tall→wide. each matching event (item) becomes a column: name+value are item expressions
// (eval'd over ctx.setData(item), e.g. 'q_%question%' / '%answer%'). = data<common>dynamicObject over the cube's events.
FieldReducer('dynamicPivotFields', {
  description: 'pivot matching events into dynamic columns; propertyName/value are expressions over each item event.',
  params: [
    {id: 'propertyName', mandatory: true, dynamic: true, byName: true, description: 'column name expr, e.g. q_%question%'},
    {id: 'value',        mandatory: true, dynamic: true, byName: true, description: 'cell value expr, e.g. %answer%'},
    {id: 'where',        type: 'event-predicate<bi>', byName: true}
  ],
  impl: (_, {}, { propertyName, value, where }) => ({
    reduce: (events, ctx = _) => (where ? events.filter(where) : events)
      .reduce((obj, item) => ({ ...obj, [propertyName(ctx.setData(item))]: value(ctx.setData(item)) }), {})
  })
})
