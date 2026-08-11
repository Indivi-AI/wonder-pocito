import { dsls, jb } from '@jb6/core'
import '@jb6/llm-guide'
import '@wonder/db/db-drivers.js'
import './llm-flow-core.js'
import { runViaRoomLambda } from './duckdb-sql-step.js'

const { wfetch2 } = jb.wonderUtils
const {
  common: { Data, data: { duckDbSql } },
  'llm-guide': { Doclet, doclet: { dataComp }, guidance: { example, mustDo, doNot }, explanationPoint: { explanation, syntax, whenToUse } }
} = dsls

// reports registry contract: [{id, title, caveats, executiveSummary: {goal,sql,widget,reactComp,explainer}, summary: {goal,sql,widget,reactComp,explainer},
//   sections: [{id, title, goal, caveats?, reactComp?, executiveSummary|summary|inDepth:
//   {goal,sql,widget,reactComp,explainer}, fullData: {description, grain, columns, viewSql, perItemOnly?}}]}]
// fullData.perItemOnly: comma-list of columns whose units differ per item (own-unit qty, unit prices) - sum/avg over them
//   is rejected unless the sql keeps items separate (item in the SELECT list) or pins one item (item = '...')
// every sql may embed {{ROOT}} - substituted with the %$reportsRoot% parquet base url at run time
// widget/reactComp are declarative bindings materialized against slot rows into app-renderable specs; explainer travels with them for UI help marks
const ROOT_TOKEN = '{{ROOT}}'
const INVALID_REPORT_PARAMS = 'INVALID_REPORT_PARAMS'
const REPORT_SQL_ERROR = 'REPORT_SQL_ERROR'
const cleanSql = sql => String(sql || '').trim().replace(/;+\s*$/, '')
const quoteId = id => `"${String(id).replaceAll('"', '""')}"`
const quoteText = value => `'${String(value).replaceAll("'", "''")}'`
const paramValues = value => Array.isArray(value) ? value : [value]
const publicParams = params => (params || []).map(({column, stage, operator, operation, sensitive, ...param}) => param)
const validDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(+date) && date.toISOString().slice(0, 10) == value
}
const paramLiteral = (def, value) => {
  if (def.type == 'date') {
    if (!validDate(value)) throw new Error('expected a real YYYY-MM-DD date, latest, or earliest')
    return `DATE ${quoteText(value)}`
  }
  if (def.type == 'month') {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error('expected YYYY-MM')
    return quoteText(value)
  }
  if (def.type == 'number') {
    if (value === '' || !Number.isFinite(+value)) throw new Error('expected a number')
    return String(+value)
  }
  if (typeof value != 'string' && typeof value != 'number') throw new Error('expected text or a list of text values')
  return quoteText(value)
}
const withLimit = (sql, limit, clean = cleanSql(sql)) => limit == null ? clean
  : /\bLIMIT\s+\d+\s*$/i.test(clean) ? clean.replace(/\bLIMIT\s+\d+\s*$/i, `LIMIT ${limit}`) : `${clean} LIMIT ${limit}`
const withoutFinalLimit = sql => cleanSql(sql).replace(/\bLIMIT\s+\d+\s*$/i, '').trim()
const bindResult = (sql, predicates = [], clean = cleanSql(sql), limit = clean.match(/\bLIMIT\s+(\d+)\s*$/i)?.[1]) => !predicates.length ? clean
  : `WITH verified_result_source AS (${withoutFinalLimit(clean)}) SELECT * FROM verified_result_source WHERE ${predicates.join(' AND ')}`
    + (limit ? ` LIMIT ${limit}` : '')
const boundsError = def => def.min != null && def.max != null ? `expected value between ${def.min} and ${def.max}`
  : def.min != null ? `expected value at least ${def.min}` : `expected value at most ${def.max}`
const compileSlotParams = (slot, values = {}) => {
  const defs = Object.fromEntries((slot?.params || []).map(p => [p.id, p])), errors = [], predicates = [], resultPredicates = [], checks = []
  if (!values || typeof values != 'object' || Array.isArray(values))
    return {error: INVALID_REPORT_PARAMS, errors: [{value: values, error: 'expected a parameter object'}],
      supportedParams: publicParams(slot?.params)}
  const limitDef = (slot?.params || []).find(def => def.operation == 'limit'), resultLimit = values[limitDef?.id]
    == null ? null : +values[limitDef.id]
  for (const [id, value] of Object.entries(values || {}).filter(([,v]) => v != null)) {
    const def = defs[id]
    if (!def) { errors.push({param: id, value, error: 'unsupported parameter'}); continue }
    if (def.operation == 'limit') {
      if (!Number.isInteger(resultLimit) || resultLimit < (def.min || 1) || resultLimit > (def.max || 100))
        errors.push({param: id, value, error: `expected integer ${def.min || 1}-${def.max || 100}`})
      continue
    }
    if (!def.column || (def.stage != 'result' && !/\bfull_data\b/i.test(slot.sql || ''))) {
      errors.push({param: id, value, error: 'parameter is not bound to this verified SQL'})
      continue
    }
    try {
      const vals = paramValues(value)
      if (!vals.length) throw new Error('expected at least one value')
      if (!def.multiple && vals.length > 1) throw new Error('expected one value')
      if (def.options && vals.some(v => !def.options.includes(v))) throw new Error(`expected one of: ${def.options.join(', ')}`)
      if ((def.min != null && vals.some(v => +v < def.min)) || (def.max != null && vals.some(v => +v > def.max)))
        throw new Error(boundsError(def))
      const col = quoteId(def.column), operator = {gte: '>=', lte: '<='}[def.operator]
      if (operator && vals.length != 1) throw new Error('expected one value')
      const edge = ['latest', 'earliest'].includes(vals[0]) && vals.length == 1
        && ['date', 'month'].includes(def.type) ? vals[0] : null
      const edgeFn = edge == 'latest' ? 'max' : 'min'
      const source = def.stage == 'result' ? 'verified_result_source' : 'full_data_source'
      const edgePredicate = source => def.type == 'month' && !['ym', 'month'].includes(def.column)
        ? `strftime(CAST(${col} AS DATE), '%Y-%m') = (SELECT strftime(CAST(${edgeFn}(${col}) AS DATE), '%Y-%m') FROM ${source})`
        : `${col} = (SELECT ${edgeFn}(${col}) FROM ${source})`
      const parts = operator ? [`${col} ${operator} ${paramLiteral(def, vals[0])}`]
        : edge ? [edgePredicate(source)]
        : vals.map(v => def.type == 'month' && !['ym', 'month'].includes(def.column)
          ? `strftime(CAST(${col} AS DATE), '%Y-%m') = ${paramLiteral(def, v)}`
          : `${col} = ${paramLiteral(def, v)}`)
      ;(def.stage == 'result' ? resultPredicates : predicates).push(parts.length == 1 ? parts[0] : `(${parts.join(' OR ')})`)
      checks.push(...parts.map((predicate, i) => ({param: id, value: vals[i] ?? value,
        stage: def.stage, predicate: edge ? edgePredicate(def.stage == 'result' ? source : 'full_data') : predicate})))
    } catch (e) { errors.push({param: id, value, error: e.message}) }
  }
  for (const from of (slot?.params || []).filter(def => def.operator == 'gte')) {
    const to = (slot.params || []).find(def => def.column == from.column && def.operator == 'lte')
    if (to && validDate(values[from.id]) && validDate(values[to.id]) && values[from.id] > values[to.id])
      errors.push({param: from.id, value: values[from.id], error: `${from.id} must not be after ${to.id}`})
  }
  if (errors.length) return {error: INVALID_REPORT_PARAMS, errors, supportedParams: publicParams(slot?.params)}
  return {sql: withLimit(slot.sql, resultLimit), predicates, resultPredicates, checks}
}
const rowsInfo = rows => rows?.error ? { error: String(rows.error).slice(0, 300) } : { rowCount: Array.isArray(rows) ? rows.length : null }
let reportCacheP
const stable = v => JSON.stringify(v, (_, x) => x && typeof x == 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x)
const reportCache = () => reportCacheP ||= !globalThis.process?.versions?.node ? Promise.resolve(null)
  : Promise.all([import('node:crypto'), import('node:fs'), import('node:url')]).then(([{ createHash }, fs, { fileURLToPath }]) => {
  const base = fileURLToPath(new URL('../../.cache/', import.meta.url)), dir = sub => `${base}/${sub}`, file = (key, sub = 'report-runs') => `${dir(sub)}/${key}.json`
  return {
    exists: fs.existsSync,
    mkdir: dir => fs.mkdirSync(dir, { recursive: true }),
    fullDataDir: dir('report-full-data'),
    key: def => createHash('sha256').update(stable(def)).digest('hex'),
    parquet: key => `${dir('report-full-data')}/${key}.parquet`,
    tmp: f => `${f}.${globalThis.process?.pid || 'browser'}.${Date.now()}.tmp`,
    rename: fs.renameSync,
    unlink: f => fs.existsSync(f) && fs.unlinkSync(f),
    read: (key, sub) => { try { return fs.existsSync(file(key, sub)) && JSON.parse(fs.readFileSync(file(key, sub), 'utf8')) } catch { return null } },
    write: (key, val, sub) => {
      fs.mkdirSync(dir(sub || 'report-runs'), {recursive: true})
      const f = file(key, sub), tmp = `${f}.${globalThis.process?.pid || 'browser'}.${Date.now()}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(val))
      fs.renameSync(tmp, f)
      return val
    }
  }
}).catch(() => null)
const noSqlErrors = r => !r?.error && ![...Object.entries(r.results || {}).filter(([k]) => k != 'sections').map(([,v]) => v),
  ...Object.values(r.results?.sections || {}).map(s => s.rows)].some(x => x?.error)

// --- room cache: the same sha256(stable(def)) keys as the local .cache, but stored as room files under
// %$reportsCacheRoot% (e.g. signedRoom://comaxDemo/usersRO/cache) so a BROWSER or a cold lambda answers warmed
// questions with one signed GET and no duckdb. hashKey is isomorphic (node:crypto / crypto.subtle → same hex).
const hashKey = async def => {
  const cache = await reportCache()
  if (cache) return cache.key(def)
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable(def)))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}
const roomCacheRead = async (ctx, sub, key) => {
  if (!ctx.vars.reportsCacheRoot || !key) return null
  const res = await wfetch2(`${ctx.vars.reportsCacheRoot}/${sub}/${key}.json`, { method: 'GET' }, ctx).catch(() => null)
  const val = res?.ok ? await res.json() : null
  return val && typeof val == 'object' ? val : null
}
const roomCacheWrite = async (ctx, sub, key, val) => ctx.vars.reportsCacheWrite && key &&
  wfetch2(`${ctx.vars.reportsCacheRoot}/${sub}/${key}.json`, { method: 'PUT', body: val }, ctx)
// a warmed full_data parquet in the room — returned as a wUrl duckDbSql resolves, so slices read the small parquet, not the base
const roomParquet = async (ctx, key) => {
  if (!ctx.vars.reportsCacheRoot || !key) return null
  const url = `${ctx.vars.reportsCacheRoot}/report-full-data/${key}.parquet`
  const res = await wfetch2(url, { method: 'HEAD' }, ctx).catch(() => null)
  return res?.ok ? url : null
}

// --- base materialization: a report flagged `materialize` computes each section's heavy full_data view ONCE
// per run into a small parquet (keyed by the per-run ctx var duckdbMatRun), then every slot + queryReportFullData
// slice read_parquet it instead of recomputing the CTE base. Separate files per section = naturally parallel
// (no shared-writer lock) and quality-neutral (the view SQL is unchanged, just cached).
const MAT_DIR = '/tmp/wonder-report-mat'
const matFile = (run, reportId, sectionId) => `${MAT_DIR}/${run}/${`${reportId}__${sectionId}`.replace(/[^a-zA-Z0-9_-]/g, '_')}.parquet`
// a materialize-report slot/slice body reads the magic table `full_data`; bind it to the cached parquet, else inline the view
const bindFullData = (body, view, matF, predicates = []) => {
  if (!/\bfull_data\b/i.test(body)) return body
  if (!predicates.length) return matF ? body.replace(/\bfull_data\b/gi, `read_parquet('${matF}')`)
    : `WITH full_data AS (${view}) ${body.replace(/^\s*WITH\s/i, ', ')}`
  const source = matF ? `SELECT * FROM read_parquet('${matF}')` : view
  return `WITH full_data_source AS (${source}), full_data AS (`
    + `SELECT * FROM full_data_source WHERE ${predicates.join(' AND ')}) ${body.replace(/^\s*WITH\s/i, ', ')}`
}

// --- predefined slot widgets: a declarative column binding per slot, materialized against the slot rows
// into the applet-native viz spec {kind, title, data|series|categories|items|columns, ...}. binding forms:
//   name+value                      -> bar,hbar,pie,funnel,treemap,waterfall  (data: [{name,value}])
//   x + ys:[{col,label?}] | x+y+seriesBy -> line,area                         (series: [{name,points}], sorted asc by x)
//   category + ys | category+value+seriesBy -> stackedBar,groupedBar          (categories + aligned series values)
//   items:[{label,col,format?,deltaCol?}]  -> kpi (reads rows[0])   columns:[{key,label,format?}] -> table
//   x+y[+name] -> scatter   x+y+value -> heatmap   value -> histogram
const num = v => v == null || v === '' ? null : +v
const uniq = vals => [...new Set(vals)]
const boundSeries = (rows, w) => w.seriesBy
  ? uniq(rows.map(r => String(r[w.seriesBy]))).map(name => ({ name, rows: rows.filter(r => String(r[w.seriesBy]) == name) }))
  : (w.ys || [{ col: w.y }]).map(({col, label}) => ({ name: label || col, col, rows }))
const SHAPES = {
  kpi: (rows, w) => ({ items: w.items.map(({label, col, format, deltaCol}) =>
    ({ label, value: num(rows[0]?.[col]), ...(format && {format}), ...(deltaCol && { delta: num(rows[0]?.[deltaCol]) }) })) }),
  table: (rows, w) => ({ columns: w.columns, rows }),
  line: (rows, w) => ({ series: boundSeries(rows, w).map(s => ({ name: s.name, points: s.rows.map(r => ({ x: r[w.x], y: num(r[s.col ?? w.y]) })) })) }),
  stackedBar: (rows, w) => {
    const categories = uniq(rows.map(r => String(r[w.category])))
    return { categories, series: boundSeries(rows, w).map(s =>
      ({ name: s.name, values: categories.map(c => num(s.rows.find(r => String(r[w.category]) == c)?.[s.col ?? w.value]) ?? 0) })) }
  },
  scatter: (rows, w) => ({ data: rows.map(r => ({ x: num(r[w.x]), y: num(r[w.y]), ...(w.name && { name: String(r[w.name]) }) })) }),
  heatmap: (rows, w) => ({ xCategories: uniq(rows.map(r => String(r[w.x]))), yCategories: uniq(rows.map(r => String(r[w.y]))),
    data: rows.map(r => ({ x: String(r[w.x]), y: String(r[w.y]), value: num(r[w.value]) })) }),
  histogram: (rows, w) => ({ values: rows.map(r => num(r[w.value])).filter(v => v != null) }),
}
SHAPES.area = SHAPES.line; SHAPES.groupedBar = SHAPES.stackedBar
const toWidget = (rows, w) => {
  if (!w?.kind || !Array.isArray(rows) || !rows.length) return null
  const by = w.sortBy || (SHAPES[w.kind] == SHAPES.line && w.x)
  const sorted = by ? [...rows].sort((a, b) => a[by] < b[by] ? -1 : a[by] > b[by] ? 1 : 0) : rows
  // binding keys out; presentation keys (kind, title, highlight, ...) pass through
  const { name, value, x, y, ys, seriesBy, category, items, columns, sortBy, ...presentation } = w
  return { ...presentation, ...(SHAPES[w.kind] || ((rows, w) => ({ data: rows.map(r => ({ name: String(r[w.name]), value: num(r[w.value]) })) })))(sorted, w) }
}
const slotWidget = (slot, rows, def) => { const built = toWidget(rows, def?.widget); return built ? [{ slot, ...built, ...(def?.explainer && { explainer: def.explainer }) }] : [] }
const slotReactComp = (slot, rows, def, section) => def?.reactComp || section?.reactComp ? [{slot,
  rows: Array.isArray(rows) ? rows : [], ...(section?.reactComp || {}), ...(def?.reactComp || {}),
  ...(def?.explainer && {explainer: def.explainer})}] : []
const oneKpi = comps => comps.filter((c, i, a) => c.mode != 'kpis' || a.findIndex(x => x.cmpId == c.cmpId && x.mode == 'kpis') == i)

Data('runReport', {
  description: 'execute the selected pre-validated SQLs of one catalog report (report-level scope + sections at a depth), concurrently',
  params: [
    {id: 'reportId', as: 'string', mandatory: true},
    {id: 'scope', as: 'string', options: 'executiveSummary,summary,none', defaultValue: 'executiveSummary'},
    {id: 'sections', as: 'array', defaultValue: [], description: 'section ids to execute'},
    {id: 'sectionDepth', as: 'string', options: 'executiveSummary,summary,inDepth', defaultValue: 'summary'},
    {id: 'params', description: 'typed values by slot target: {$report:{...}, sectionId:{...}}'},
    {id: 'registry', defaultValue: '%$reportsRegistry%'},
    {id: 'root', as: 'string', defaultValue: '%$reportsRoot%'},
    {id: 'runSql', dynamic: true, defaultValue: duckDbSql(ctx => ctx.vars.sqlToRun)}
  ],
  impl: async (ctx, {workflowLogger}, {reportId, scope, sections = [], sectionDepth, params, registry, root, runSql}) => {
    if (!registry?.length || !root)
      return { error: `runReport: missing ${registry?.length ? 'reportsRoot' : 'reportsRegistry'} ctx var` }
    const report = registry.find(r => r.id == reportId)
    if (!report)
      return { error: `runReport: unknown reportId '${reportId}'. available: ${registry.map(r => r.id).join(', ')}` }
    const unknownSections = sections.filter(id => !(report.sections || []).some(s => s.id == id))
    if (unknownSections.length)
      return {error: `runReport: unknown sections for '${reportId}': ${unknownSections.join(', ')}`}
    if (params && typeof params == 'object' && !Array.isArray(params))
      params = Object.fromEntries(Object.entries(params).filter(([, values]) =>
        !values || typeof values != 'object' || Array.isArray(values) || Object.keys(values).length))
    const secs = sections.map(id => ({ id, section: (report.sections || []).find(s => s.id == id) }))
    const allSql = [scope != 'none' && report[scope]?.sql, ...secs.flatMap(({section}) => [section?.[sectionDepth]?.sql, section?.fullData?.viewSql])].filter(Boolean).join('\n')
    ctx = await jb.workflowUtils.waitForHumanFeedbackVars(ctx, allSql, workflowLogger)
    const applyVars = sql => sql && jb.workflowUtils.applyHumanFeedbackVars(sql, ctx)
    const slotDef = (slot, target) => {
      if (!slot) return null
      const sql = applyVars(slot.sql), prepared = compileSlotParams({...slot, sql}, params?.[target])
      return {...slot, ...prepared, target}
    }
    const scopeSlot = slotDef(scope != 'none' && report[scope], '$report')
    const sectionSlots = secs.map(({id, section}) => ({id, title: section?.title, goal: section?.goal, caveats: section?.caveats,
      reactComp: section?.reactComp, slot: slotDef(section?.[sectionDepth], id),
      fullData: section?.fullData && {viewSql: applyVars(section.fullData.viewSql), perItemOnly: section.fullData.perItemOnly}}))
    const supportedTargets = Object.fromEntries([
      ...(scopeSlot ? [['$report', publicParams(scopeSlot.params)]] : []),
      ...sectionSlots.filter(item => item.slot).map(item => [item.id, publicParams(item.slot.params)])])
    const invalidParams = failures => {
      const error = {error: INVALID_REPORT_PARAMS, code: INVALID_REPORT_PARAMS, reportId, failures, retryable: true}
      workflowLogger?.info?.({t: 'runReport invalid params', reportId, failures}, {}, {ctx})
      return error
    }
    const sqlFailure = failures => ({error: `${REPORT_SQL_ERROR}: verified report SQL failed`, code: REPORT_SQL_ERROR,
      reportId, failures, retryable: false})
    if (params != null && (typeof params != 'object' || Array.isArray(params)))
      return invalidParams([{target: 'params', values: params, errors: [{error: 'expected an object keyed by slot target'}]}])
    const allowedTargets = new Set([...(scope == 'none' ? [] : ['$report']), ...sections])
    const unknownTargets = Object.keys(params || {}).filter(target => !allowedTargets.has(target))
    if (unknownTargets.length) return invalidParams(unknownTargets.map(target => ({target, values: params[target],
      errors: [{error: `unknown or unselected slot target; expected one of: ${[...allowedTargets].join(', ') || 'none'}`}],
      supportedTargets})))
    const paramErrors = [scopeSlot, ...sectionSlots.map(s => s.slot)].filter(s => s?.error)
    if (paramErrors.length) return invalidParams(paramErrors.map(({target, errors, supportedParams}) =>
      ({target, values: params?.[target], errors, supportedParams})))
    const cacheDef = { v: 3, reportId, scope, sections, sectionDepth, root, title: report.title, caveats: report.caveats, materialize: !!report.materialize,
      params, scopeSlot, sectionSlots }
    const cache = await reportCache(), key = await hashKey(cacheDef), local = cache?.read(key)
    const cached = local || await roomCacheRead(ctx, 'report-runs', key)
    const logRun = (res, cache) => workflowLogger?.info?.({t: 'runReport', reportId, scope,
      sectionDepth, cache, ...(cacheDef.scopeSlot?.sql
        ? {scopeRows: rowsInfo(res.results?.[scope])} : {}),
      sections: Object.fromEntries(secs.map(({id}) =>
        [id, rowsInfo(res.results?.sections?.[id]?.rows)]))}, {}, {ctx})
    if (cached) { logRun(cached, local ? 'hit' : 'room-hit'); !local && cache?.write(key, cached); return cached }
    // browser with a reports lambda (%$reportsLambda% = a Lambda wrapping runReport server-side): run the WHOLE report
    // near the data in ONE lambda call - the server hits its own room/tmp cache, and the anon (noAuth) path needs no signing
    if (!globalThis.process?.versions?.node && ctx.vars.reportsLambda) {
      const remote = await runViaRoomLambda(ctx, ctx.vars.reportsLambda,
        {$: `data<common>${ctx.vars.reportsLambda}`, reportId, scope, sections, sectionDepth, params})
      if (!remote.error) logRun(remote, 'lambda')
      return remote
    }
    // .catch → {error}: a throw (e.g. signing failure) must land as a structured slot error - a bare rejection inside the
    // parallel Promise.all leaves sibling rejections unhandled and kills the node child
    const exec = sql => runSql(ctx.setVars({ sqlToRun: sql.replaceAll(ROOT_TOKEN, root) })).catch(e => ({ error: String(e.message || e) }))
    const matRun = cache && report.materialize && ctx.vars.duckdbMatRun
    if (matRun) {   // compute each section's heavy view ONCE into a parquet (parallel, separate files); slots then read_parquet it
      cache.mkdir(`${MAT_DIR}/${matRun}`)
      await Promise.all(cacheDef.sectionSlots.filter(s => s.fullData?.viewSql).map(({ id, fullData }) =>
        exec(`COPY (${fullData.viewSql}) TO '${matFile(matRun, reportId, id)}' (FORMAT parquet)`)))
    }
    const bind = (sql, id, predicates) => bindFullData(sql,
      id && cacheDef.sectionSlots.find(s => s.id == id)?.fullData?.viewSql,
      matRun && id ? matFile(matRun, reportId, id) : null, predicates)
    const targets = [scopeSlot && {id: '$report', slot: scopeSlot}, ...cacheDef.sectionSlots].filter(x => x?.slot)
    const checked = targets.flatMap(target => ['source', 'result'].map(stage => ({...target, stage,
      checks: target.slot.checks.filter(check => (check.stage == 'result') == (stage == 'result'))})).filter(x => x.checks.length))
    const checkSql = ({id, slot, stage, checks}) => {
      const select = `SELECT ${checks.map((x, i) => `max(CASE WHEN ${x.predicate} THEN 1 ELSE 0 END) AS p${i}`).join(', ')}`
      return stage == 'result'
        ? `WITH verified_result_source AS (${withoutFinalLimit(bind(slot.sql, id == '$report' ? null : id))}) ${select} FROM verified_result_source`
        : bind(`${select} FROM full_data`, id)
    }
    const checkRuns = await Promise.all(checked.map(target => exec(checkSql(target))))
    const noMatches = checked.map((target, i) => ({...target, check: checkRuns[i],
      missed: target.checks.filter((x, j) => !checkRuns[i]?.[0]?.[`p${j}`])}))
      .filter(({check, missed}) => check?.error || missed.length)
    const candidates = async ({id, slot}, paramIds = Object.keys(params?.[id] || {})) => Object.fromEntries(await Promise.all(
      paramIds.map(async paramId => {
        const def = (slot.params || []).find(p => p.id == paramId)
        if (!def?.column || def.sensitive || def.operation == 'limit') return [paramId, []]
        const col = quoteId(def.column)
        const value = def.type == 'month' && !['ym', 'month'].includes(def.column)
          ? `strftime(CAST(${col} AS DATE), '%Y-%m')` : col
        const source = def.stage == 'result' ? 'verified_result_source' : 'full_data'
        const sql = ['date', 'month'].includes(def.type)
          ? `SELECT min(${value}) AS min, max(${value}) AS max FROM ${source}`
          : `SELECT DISTINCT ${col} AS value FROM ${source} WHERE ${col} IS NOT NULL ORDER BY 1 LIMIT 20`
        const bound = def.stage == 'result'
          ? `WITH verified_result_source AS (${withoutFinalLimit(bind(slot.sql, id == '$report' ? null : id))}) ${sql}` : bind(sql, id)
        return [paramId, await exec(bound)]
      })))
    const checkErrors = noMatches.filter(x => x.check?.error)
    if (checkErrors.length) return sqlFailure(checkErrors.map(({id, check}) => ({target: id, errors: [{error: check.error}]})))
    if (noMatches.length) return invalidParams(await Promise.all(noMatches.map(async ({id, slot, missed}) => ({
      target: id, values: params?.[id],
      errors: missed.map(({param, value, stage}) => ({param, value,
        error: `no ${stage == 'result' ? 'verified result' : 'full_data'} rows matched the supplied parameter value`})),
      supportedParams: publicParams(slot.params),
      candidates: await candidates({id, slot}, [...new Set(missed.map(x => x.param))])
    }))))
    const scopeSql = cacheDef.scopeSlot?.sql
    const [scopeRows, ...sectionRows] = await Promise.all([scopeSql
      ? exec(bindResult(bind(scopeSql, null, scopeSlot.predicates), scopeSlot.resultPredicates)) : null,
      ...secs.map(({id, section}, i) => cacheDef.sectionSlots[i].slot?.sql
        ? exec(bindResult(bind(cacheDef.sectionSlots[i].slot.sql, id, cacheDef.sectionSlots[i].slot.predicates),
          cacheDef.sectionSlots[i].slot.resultPredicates))
        : { error: `runReport: no '${sectionDepth}' sql for section '${id}'. sections: ${(report.sections || []).map(s => s.id).join(', ')}` })])
    const targetRuns = [scopeSql && {target: '$report', rows: scopeRows, slot: cacheDef.scopeSlot},
      ...sectionRows.map((rows, i) => ({target: secs[i].id, rows, slot: cacheDef.sectionSlots[i].slot, sectionId: secs[i].id}))].filter(Boolean)
    const failedParams = targetRuns.filter(x => Object.keys(params?.[x.target] || {}).length && x.rows?.error)
    if (failedParams.length) return sqlFailure(await Promise.all(failedParams.map(async x => ({
      target: x.target, values: params[x.target], errors: [{error: x.rows.error}], supportedParams: publicParams(x.slot.params),
      ...(x.sectionId && {candidates: await candidates({id: x.sectionId, slot: x.slot})})
    }))))
    const executed = [scopeRows, ...sectionRows].filter(Boolean)
    if (executed.length && executed.every(rows => rows?.error))
      return { error: `runReport '${reportId}': all sqls failed: ${executed.map(rows => rows.error).join(' | ')}` }
    const res = { reportId, title: report.title, caveats: report.caveats,
      results: { ...(scopeSql ? { [scope]: scopeRows } : {}),
        sections: Object.fromEntries(secs.map(({id, section}, i) =>
          [id, { title: section?.title, goal: section?.[sectionDepth]?.goal || section?.goal, caveats: section?.caveats, rows: sectionRows[i] }])) },
      widgets: [...(scopeSql ? slotWidget(scope, scopeRows, report[scope]) : []),
        ...secs.flatMap(({id, section}, i) => slotWidget(id, sectionRows[i], section?.[sectionDepth]))],
      reactComps: oneKpi([...(scopeSql ? slotReactComp(scope, scopeRows, report[scope], report) : []),
        ...secs.flatMap(({id, section}, i) => slotReactComp(id, sectionRows[i], section?.[sectionDepth], section))]) }
    logRun(res, 'miss')
    if (!key || !noSqlErrors(res)) return res
    cache?.write(key, res)
    await roomCacheWrite(ctx, 'report-runs', key, res)
    return res
  }
})

Data('queryReportFullData', {
  description: 'run a small ad-hoc SELECT over one section full_data view without loading the underlying data into LLM context',
  params: [
    {id: 'reportId', as: 'string', mandatory: true},
    {id: 'sectionId', as: 'string', mandatory: true},
    {id: 'sectionDepth', as: 'string', options: 'executiveSummary,summary,inDepth', defaultValue: 'summary'},
    {id: 'params', description: 'typed values declared by the selected deterministic section slot'},
    {id: 'sql', as: 'text', asIs: true, mandatory: true, description: 'SELECT over the full_data table'},
    {id: 'registry', defaultValue: '%$reportsRegistry%'},
    {id: 'root', as: 'string', defaultValue: '%$reportsRoot%'},
    {id: 'runSql', dynamic: true, defaultValue: duckDbSql(ctx => ctx.vars.sqlToRun)}
  ],
  impl: async (ctx, {workflowLogger}, {reportId, sectionId, sectionDepth, params, sql, registry, root, runSql}) => {
    ctx = await jb.workflowUtils.waitForHumanFeedbackVars(ctx, sql, workflowLogger)
    sql = jb.workflowUtils.applyHumanFeedbackVars(sql, ctx)
    const report = (registry || []).find(r => r.id == reportId)
    const section = (report?.sections || []).find(s => s.id == sectionId), fullData = section?.fullData
    if (!root || !fullData?.viewSql)
      return { error: `queryReportFullData: ${!root ? 'missing reportsRoot ctx var' : `no fullData view for '${reportId}/${sectionId}'`}` }
    sql = cleanSql(sql)
    if (!/^\s*(?:SELECT|WITH)\b/i.test(sql) || !/\b(?:FROM|JOIN)\s+full_data\b/i.test(sql)
      || /;|\b(read_parquet|read_csv|insert|update|delete|drop|create|alter|copy)\b/i.test(sql))
      return {error: `queryReportFullData: the sql must select FROM full_data using one safe SELECT, got: ${sql.slice(0, 200)}`}
    const prepared = compileSlotParams({...section?.[sectionDepth], sql}, params || {})
    if (prepared.error) return {...prepared, code: prepared.error, reportId,
      failures: [{target: sectionId, values: params, errors: prepared.errors, supportedParams: prepared.supportedParams}]}
    sql = prepared.sql
    const mixedCols = (fullData.perItemOnly || '').split(',').filter(c => c && new RegExp(`(sum|avg)\\s*\\(\\s*${c}\\b`, 'i').test(sql))
    if (mixedCols.length && !(/\bitem\b/i.test(sql.slice(0, sql.search(/\bfrom\b/i))) || /\bitem\b\s*=/i.test(sql))) {
      workflowLogger?.info?.({ t: 'queryReportFullData unit-safety reject', reportId, sectionId, mixedCols }, { sql }, {ctx})
      return {error: `queryReportFullData unit-safety: sum/avg over [${mixedCols}] mixes units across items `
        + '(a six-pack counts as 1 unit like a single can) - keep items separate '
        + "(SELECT item ... GROUP BY item), pin one item (WHERE item = '<exact name>'), "
        + 'or aggregate the ₪ money columns instead'}
    }
    const cache = await reportCache()
    const viewSql = fullData.viewSql.replaceAll(ROOT_TOKEN, root)
    const baseDef = { v: 1, reportId, sectionId, root, viewSql, perItemOnly: fullData.perItemOnly }
    const sliceKey = await hashKey({ ...baseDef, sql, predicates: prepared.predicates, resultPredicates: prepared.resultPredicates })
    const cached = cache?.read(sliceKey, 'report-full-data') || await roomCacheRead(ctx, 'report-full-data', sliceKey)
    if (cached) { workflowLogger?.info?.({ t: 'queryReportFullData', reportId, sectionId, cache: 'slice-hit', ...rowsInfo(cached) }, { sql }, {ctx}); return cached }
    const fullKey = await hashKey(baseDef), persistentMatF = cache && cache.parquet(fullKey)
    let sourceF = persistentMatF && cache.exists(persistentMatF) ? persistentMatF : await roomParquet(ctx, fullKey)
    if (!sourceF && persistentMatF) {
      cache.mkdir(cache.fullDataDir)
      const tmp = cache.tmp(persistentMatF), copied = await runSql(ctx.setVars({ sqlToRun: `COPY (${viewSql}) TO '${tmp}' (FORMAT parquet)` }))
      if (copied?.error) { cache.unlink(tmp); return copied }
      cache.rename(tmp, persistentMatF)
      sourceF = persistentMatF
      await (ctx.vars.reportsCacheWrite && wfetch2(
        `${ctx.vars.reportsCacheRoot}/report-full-data/${fullKey}.parquet`,
        {method: 'PUT', headers: {'x-wonder-body': 'localFile'}, body: persistentMatF}, ctx))
    }
    const matRun = cache && report?.materialize && ctx.vars.duckdbMatRun
    const matF = matRun ? matFile(matRun, reportId, sectionId) : null
    if (!sourceF && matF) {   // reuse runReport's cached view, or build it on demand if this slice runs before any runReport
      if (!cache.exists(matF)) { cache.mkdir(`${MAT_DIR}/${matRun}`); await runSql(ctx.setVars({ sqlToRun: `COPY (${viewSql}) TO '${matF}' (FORMAT parquet)` })) }
      sourceF = matF
    }
    const wrapped = bindResult(bindFullData(sql, viewSql, sourceF, prepared.predicates), prepared.resultPredicates)
    const rows = await runSql(ctx.setVars({ sqlToRun: wrapped }))
    workflowLogger?.info?.({ t: 'queryReportFullData', reportId, sectionId, cache: rows?.error ? 'miss-error' : 'miss', ...rowsInfo(rows) }, { sql }, {ctx})
    if (sliceKey && !rows?.error) { cache?.write(sliceKey, rows, 'report-full-data'); await roomCacheWrite(ctx, 'report-full-data', sliceKey, rows) }
    return rows
  }
})

Doclet('runReportDataComponent', {
  impl: dataComp('runReport', {
    guidance: [
      example(`
{$: 'flow-elem<workflow>setCtxData',
  goal: 'Run the sales overview report',
  value: {$: 'data<common>runReport', reportId: 'branch-performance', scope: 'none', sections: ['daily-sales'],
    sectionDepth: 'summary', params: {'daily-sales': {reportDate: 'latest'}}},
  postCondition: {$: 'boolean<common>jqBoolean', exp: 'has("results")'}
}`),
      mustDo('Answer analytics questions by selecting from the REPORT CATALOG - usually 1 runReport call, never more than 3 per flow'),
      mustDo("Keep depth minimal: scope 'executiveSummary' for headlines; sectionDepth 'summary' for drills; "
        + "'inDepth' only for explicitly requested detail"),
      mustDo("Use scope: 'none' when only specific sections are needed"),
      doNot('Write raw read_parquet/duckDbSql SQL for a question a report covers',
        {reason: 'report SQL is pre-validated against costs, returns, VAT and date-anchor traps'})
    ],
    explaination: [
      explanation('Executes selected pre-validated SQLs concurrently and returns report metadata, '
        + 'scope/section rows, widgets and React comps'),
      syntax("scope: 'executiveSummary'|'summary'|'none'", 'which report-level rows to compute'),
      syntax("sections: ['id1', 'id2'], sectionDepth: 'executiveSummary'|'summary'|'inDepth'", 'which section rows and at what detail'),
      syntax('widgets/reactComps', "render-ready specs prebuilt per executed slot from predefined bindings - pass them into finalAnswerFromReport as-is"),
      whenToUse('Every analytics question covered by a catalog report - the compact results feed llmSummary directly')
    ]
  })
})

Doclet('queryReportFullDataDataComponent', {
  impl: dataComp('queryReportFullData', {
    guidance: [
      example(`
{$: 'flow-elem<workflow>setCtxVar',
  goal: 'Slice branch sales to Fridays only', varName: 'fridayRows',
  value: {$: 'data<common>queryReportFullData', reportId: 'branch-performance', sectionId: 'daily-sales',
    sql: 'SELECT branch, round(sum(net)) AS net FROM full_data WHERE weekday_no = 5 GROUP BY 1 ORDER BY 2 DESC LIMIT 10'},
  postCondition: {$: 'boolean<common>jqBoolean', exp: 'type == "array"'}
}`),
      mustDo('SELECT FROM full_data only, using the columns the catalog lists for the section; aggregate with GROUP BY and LIMIT to a top-N (<= 20)'),
      doNot('Use read_parquet or table paths - full_data is the only table', {reason: 'the view already encodes the validated joins and filters'}),
      doNot("sum/avg a perItemOnly column across items without selecting item or pinning item = '<exact>'",
        {reason: 'own-unit quantities and prices mix units; only ₪ money columns add up cross-item'}),
      doNot('Reach for queryReportFullData when a report section already answers the question', {reason: 'pre-validated section SQL is safer than ad-hoc SQL'})
    ],
    explaination: [
      explanation('Wraps the section fullData view as WITH full_data AS (<view>) <your sql> and runs DuckDB - only your aggregated result enters LLM context'),
      whenToUse('Ad-hoc slicing of a report section by a dimension/filter no depth provides (a specific branch, weekday, date range)')
    ]
  })
})
