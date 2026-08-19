import { dsls, coreUtils, jb } from '@jb6/core'
import '@jb6/common/essentials.js'
import '@wonder/db/db-drivers.js'
const { getAccessToken, wresolve, wresolveInfo, wcachePopulate, wfetch2 } = jb.wonderUtils
import './duckdb-utils.js'

const {
  tgp: { TgpType, TgpTypeModifier, Component },
  common: { Data },
  test: { Logger, logger: { domainLogger } }
} = dsls
const { enrichCtxWithDataContext, omitEmptyProps } = coreUtils
const biUtils = jb.biUtils ||= {}
const { runDuckdbSqlByHost, runDuckdb, runDuckdbScalar, sqlEditor, readSourceFiles, parseSqlAst, visitSqlAst, eachNode, toNodes } = biUtils
const duckdbAggFuncs = new Set('any_value,approx_count_distinct,approx_quantile,approx_top_k,arbitrary,arg_max,arg_max_null,arg_max_nulls_last,arg_min,arg_min_null,arg_min_nulls_last,argmax,argmin,array_agg,avg,bit_and,bit_or,bit_xor,bitstring_agg,bool_and,bool_or,corr,count,count_if,count_star,countif,covar_pop,covar_samp,cume_dist,dense_rank,entropy,favg,fill,first,first_value,fsum,group_concat,histogram,histogram_exact,kahan_sum,kurtosis,kurtosis_pop,lag,last,last_value,lead,list,listagg,mad,max,max_by,mean,median,min,min_by,mode,nth_value,ntile,percent_rank,product,quantile,quantile_cont,quantile_disc,rank,rank_dense,regr_avgx,regr_avgy,regr_count,regr_intercept,regr_r2,regr_slope,regr_sxx,regr_sxy,regr_syy,reservoir_quantile,row_number,sem,skewness,stddev,stddev_pop,stddev_samp,string_agg,sum,sum_no_overflow,sumkahan,var_pop,var_samp,variance'.split(','))
const span = coreUtils.biSpan = Symbol.for('bi-span')

// joinBase: a relative wUrl (no scheme://) joins under wUrlBase; a full scheme://… wUrl wins as-is. concat only —
// db-stamping is wresolveInfo's job (its fullyResolvedUrl makes the scheme self-describing for the ctx-free range-host).
const joinBase = (wUrl, wUrlBase = '') => /^\w+:\/\//.test(wUrl) || !wUrlBase ? wUrl : `${wUrlBase.replace(/\/$/, '')}/${wUrl}`

const CubeTool = TgpTypeModifier('CubeTool', { cubeTool: true, dsl: 'common', type: 'data' })

const Script = TgpType('script', 'bi', { demoProfile: 'test<test>biTest.sqlScript' })
const Cube = TgpType('cube', 'bi', {
  demoProfile: 'cube<bi>sessionCube',
  typescript: `{
  source: SilverBuilder
  dimensions: Dimension[]
  metrics: Metric[]
  dimensionStatsBuilders(): StatBuilder[]
  querySetup(ctx, queryPeriod: string): Promise<Ctx>
  summary(ctx): Promise<{ metrics, dimensions, validations, timeColumn, dimensionStats }>
  cubeToolInfoForQuery(ctx, queryPeriod?: string): Promise<{cube, queryVocabulary, dataState, physical}>
}`
})
const EventSource = TgpType('event-source', 'bi', {
  typescript: `{
  read: (ctx, period: string, keyField: string) => Promise<{ sourceCb: Callbag<Event> }>
}`,
  coerce: wUrl => dsls['bi']['event-source'].bucketUrlSourceJsonEvents(wUrl)
})
const SilverBuilder = TgpType('silver-builder', 'bi', {
  typescript: `{
  sourceType: "event-batches"|"full"
  keyField: string
  periodPattern: string
  parquetFiles: ParquetFile[]
  plan(ctx, requirements?, options?): Promise<SilverBuildPlan>
  build(ctx, plan): Promise<SilverBuildResult>
  materialize(events: Event[], ctx): Promise<Obj[]>
  materializePeriod(ctx, period: string): Promise<{objs, bytes, parquet, outUrl}>
  resolveKey(key: string, period: string, ctx): Promise<Obj>
}`
})
const Dimension = TgpType('dimension', 'bi', {
  typescript: `{
  name: string
  type?: "string"|"integer"|"timestamp"|"boolean"
  guidance?: string
  statBuilder?: StatBuilder
  parent?: string
  partition?: string
  hierarchy?: Hierarchy
}`
})
const Metric = TgpType('metric', 'bi', {
  typescript: `{
  name: string
  agg?: string
  field?: string
  sql?: string
  hierarchy?: Hierarchy
  description?: string
}`
})
const Hierarchy = TgpType('hierarchy', 'bi')
const Stat = TgpType('stat', 'bi')
const ParquetFile = TgpType('parquet-file', 'bi', {
  typescript: `{
  name: string
  wUrlPattern: string
  fields?: string[]
  version: number
}`
})
const Validation = TgpType('validation', 'bi', {
  typescript: `{
  name: string
  test(obj): boolean
}`
})
const MetricValidation = TgpType('metric-validation', 'bi', {
  typescript: `{
  name: string
  sql(valueCol: string, fitted?: {const: string}): string
}`
})
const EventPredicate = TgpType('event-predicate', 'bi', {
  typescript: `(ev: Event) => boolean`,
  coerce: name => dsls['bi']['event-predicate'].eventType(name)
})
const FieldReducer = TgpType('field-reducer', 'bi', {
  typescript: `{
  phase?: "obj"
  reduce: (events: Event[] | Obj, ctx) => Partial<Obj>
}`
})
const Lookup = TgpType('lookup', 'bi', {
  typescript: `{
  as: string
  phase?: number
  prepare: (ctx) => Promise<{ get: (key: string) => Record }>
}`
})
const QueryLookup = TgpType('query-lookup', 'bi', {
  typescript: `{
  bindAs: string
  resolveForQuery(ctx, periods: string[]): Promise<{ vars?: Record<string,string>, prelude?: string, ensureCols?: {wUrl, cols}[], sourceRoles?: Record<string,string> }>
}`
})
const SqlModifier = TgpType('sql-modifier', 'bi', {
  typescript: `{
  modifyAst?(sqlAst, ctx): Promise<{ sqlAst, explanation }>   // rewrite the SELECT body (duckdb JSON AST)
  modifyPrelude?(prelude: string, ctx): Promise<string>       // string->string over the DDL prelude (LOAD lines / macros) that can't be an AST
  duckFlags?(ctx): string                                     // duckdb cli flags this modifier needs (e.g. '-unsigned ' for the byte-range ext)
}`
})
const Pick = TgpType('pick', 'bi', {
  typescript: `(events: Event[], ctx<fieldIdForTake, pathForTake>) => value`
})
const CacheStrategy = TgpType('cache-strategy', 'bi', {
  typescript: `{
  buildSourceReader(wUrls, ctx): Promise<{ sql: string, via: string, resolvedWUrls?: string[] }>   // duckdb reader + canonical source ids
  modifiers(ctx): sql-modifier<bi>[]                                     // the sql-modifiers this strategy contributes (its LOAD prelude + duck cli flags ride here)
  initQueryLookups?(ctx): Ctx                                           // strategy-owned lookup preparation before DuckDB executes
  effectiveStrategyFor?(wUrls): string                                  // the strategy name that can actually read these wUrls (colsCache yields fullFileCache for non-parquet); absent ⇒ this same strategy
}`,
  coerce: name => dsls['bi']['cache-strategy'][name]()   // a bare 'colsCache'/'noCache'/'fullFileCache' in a strategy slot becomes its profile
})
// cacheStrategyOf: the ambient read strategy as its RT interface. every decision site resolves through here, so the string
// var flowing from cube/cubeQuery/external Var('cacheStrategy',…) becomes one strategy object owning the whole read path.
const cacheStrategyOf = ctx => CacheStrategy[ctx?.vars?.cacheStrategy || 'colsCache'].$run()

const BrushData = TgpTypeModifier('BrushData', { brushData: true, dsl: 'common', type: 'data' })

const cube = Cube('cube', {
  description: 'semantic cube: dimensions + metrics over a silver-builder. delegates build/drill to source.',
  params: [
    {id: 'source', type: 'silver-builder<bi>', mandatory: true},
    {id: 'wUrlBase', as: 'string', defaultValue: '', description: 'base wUrl (scheme+room+path)'},
    {id: 'dimensions', type: 'dimension[]', description: 'group-by columns available on this cube'},
    {id: 'metrics', type: 'metric[]', description: 'aggregatable columns available on this cube; expression refers to sibling metric names'},
    {id: 'queryLookups', type: 'query-lookup<bi>[]', description: 'QUERY-phase lookups'},
    {id: 'sqlModifiers', type: 'sql-modifier<bi>[]', description: 'QUERY-phase AST transforms'},
    {id: 'setup', type: 'ctx-enricher<tgp>', dynamic: true, description: 'cube-default ctx enrichment (e.g. window args) applied once by querySetup/cubeQuery before silvers resolve; a downstream Var still overrides'},
    {id: 'cacheStrategy', as: 'string', options: 'colsCache,fullFileCache,noCache', defaultValue: 'colsCache', description: 'colsCache = local native read_parquet / remote byte-range extension; fullFileCache = wcache whole-file mirror; noCache = read source as-is (fs disk / gcs httpfs), nothing persisted'},
    {id: 'limits', as: 'array', description: 'epistemic guardrails: what this cube CANNOT answer + column caveats, rendered verbatim into the LLM vocabulary'}
  ],
  impl: (_, {}, { source: mat, wUrlBase, dimensions, metrics, queryLookups, sqlModifiers, setup, cacheStrategy, limits }) => ({
    name: mat.name, sourceType: mat.sourceType, keyField: mat.keyField, periodPattern: mat.periodPattern,
    periodGranularity: mat.periodGranularity, wUrlBase, cacheStrategy,
    eventSource: mat.eventSource, accounts: mat.accounts, buildLookups: mat.buildLookups, validations: mat.validations,
    parquetFiles: mat.parquetFiles, source: mat, dimensions, metrics, queryLookups, sqlModifiers, limits,
    metric: Object.fromEntries((metrics || []).map(m => [m.name, biUtils.metricToSql(m, Object.fromEntries((metrics || []).map(x => [x.name, x]))) ])),
    applySetup: async ctx => (setup.profile && !ctx.vars.cubeSetupDone) ? (await ctx.run(setup.profile)).setVars({ cubeSetupDone: true }) : ctx,
    materialize: (...a) => mat.materialize(...a),
    materializeOne: (...a) => mat.materializeOne(...a),
    materializePeriod: (...a) => mat.materializePeriod(...a),
    reduceObject: (...a) => mat.reduceObject(...a),
    getSourceEvents: (...a) => mat.getSourceEvents(...a),
    resolveKey: (...a) => mat.resolveKey(...a),
    bronzeToSilver: (...a) => mat.bronzeToSilver(...a),
    dimensionStatsBuilders: () => dimensions.map(dimension => dimension.statBuilder).filter(Boolean),
    plan(ctx, requirements = {}, options) {
      return mat.plan(ctx, { ...requirements, dimensionStatsBuilders: this.dimensionStatsBuilders() }, options)
    },
    build: (...a) => mat.build(...a),
    async querySetup(ctx, queryPeriod) {
      ctx = await this.applySetup(ctx)
      const periods = expandPeriods(queryPeriod, mat.periodPattern)
      const c = ctx.setVars({ periods, periodPattern: mat.periodPattern, queryPeriod, brushMode: true, cubeWUrlBase: ctx.vars.cubeWUrlBase || this.wUrlBase })
      const parts = await Promise.all((queryLookups || []).map(l => l.resolveForQuery(c, periods)))
      const lookupVars = Object.assign({}, ...parts.map(p => p.vars).filter(Boolean))
      const sqlPreludes = parts.map(p => p.prelude).filter(Boolean)
      const ensureCols = parts.flatMap(p => p.ensureCols || [])
      const silvers = await resolveSilvers(this, periods, c)
      const sourceRoles = Object.assign({}, silvers.$sourceRoles, ...parts.map(p => p.sourceRoles).filter(Boolean))
      Object.assign(silvers.$manifest, ...parts.map(p => p.manifest).filter(Boolean))   // fold manifest lookups into the source $manifest so expandManifest prunes them too
      const sqlModifiers = this.sqlModifiers || []
      c?.vars?.biLogger?.info?.({ event: 'queryLookups resolved', joins: Object.keys(lookupVars), preludes: sqlPreludes, modifiers: sqlModifiers.length }, {}, { ctx })
      return enrichCtxWithDataContext(c, {
        vars: { cube: this, queryPeriod, periods, silvers, ...silvers, ...lookupVars, sqlPreludes, sqlModifiers, ensureCols, sourceRoles }
      })
    },
    async summary(ctx, dimensionStats) {
      if (!dimensionStats) {
        const file = mat.parquetFiles?.[0]
        const wUrl = file && perPeriodWUrls(joinBase(file.wUrlPattern, this.wUrlBase), ['_'])[0]
        dimensionStats = wUrl && await parquetDimensionStats(wUrl, ctx)
      }
      return omitEmptyProps({
        metrics: (metrics || []).map(m => omitEmptyProps({ name: m.name, agg: m.agg, field: m.field, sql: m.sql, unit: m.unit, description: m.description })),
        dimensions: (dimensions || []).map(d => omitEmptyProps({ name: d.name, type: d.type, guidance: d.guidance, values: d.values, levels: d.hierarchy?.levels })),
        validations: (mat.validations || []).map(v => v.name), limits, dimensionStats, timeColumn: 'time'
      })
    },
    async cubeToolInfoForQuery(ctx, queryPeriod = 'today') {
      const periods = expandPeriods(queryPeriod, mat.periodPattern)
      const files = await Promise.all((mat.parquetFiles || []).map(async f => {
        const wUrlPattern = joinBase(f.wUrlPattern, this.wUrlBase)
        const paths = await cachePeriodParquets(wUrlPattern, periods, ctx)
        return { name: f.name, paths, lastBuilt: await lastBuiltOnGcs(wUrlPattern, periods, ctx), ...(paths.length ? await parquetMeta(paths, ctx) : { columns: [], rows: 0 }) }
      }))
      const selectableColumns = [...new Set(files.flatMap(f => (f.columns || []).map(c => c.name)))]
      const dimensionStats = files.find(file => file.dimensionStats)?.dimensionStats
      return {
        cube: mat.parquetFiles?.[0]?.name,
        queryVocabulary: { selectableColumns, ...await this.summary(ctx, dimensionStats) },
        dataState: omitEmptyProps({ queryPeriod, periods, keyField: mat.keyField, rows: files.reduce((n, f) => n + (f.rows || 0), 0), lastBuilt: files.map(f => f.lastBuilt).filter(Boolean).sort().at(-1) || null }),
        physical: files.map(f => ({ name: f.name, bytes: f.bytes, rows: f.rows, byColumn: f.byColumn, rowGroups: f.rowGroups, paths: f.paths }))
      }
    }
  })
})

// a cache-strategy's LOAD as a phase build:0 sql-modifier: prepend its LOAD line to the WHOLE prelude (so a cache-referencing
// macro prelude sees cols_cache already loaded), and contribute its duck cli flags.
const preludeModifier = (loadFn, flags = '') => ({ 
  isBuiltIn: true, phase: 'build:0',
  async modifyPrelude(prelude, ctx) { return await loadFn(ctx) + prelude },
  duckFlags: ctx => flags 
})

const exprRefs = node => {
  const out = []
  ;(function walk(x) {
    if (!x || typeof x !== 'object' || x.type === 'SELECT_NODE') return
    if (x.class === 'COLUMN_REF') out.push({ qualifier: x.column_names.at(-2), column: x.column_names.at(-1) })
    else Object.values(x).forEach(walk)
  })(node)
  return out
}
const colsCacheWUrls = node => node?.function?.function_name === 'cols_cache'
  ? node.function.children?.[0]?.children?.filter(x => x.class === 'CONSTANT').map(x => x.value.value) || [] : []
const andConjuncts = node => node?.type === 'CONJUNCTION_AND' ? node.children.flatMap(andConjuncts) : node ? [node] : []
const literal = node => node?.class === 'CONSTANT' ? node.value?.value : node?.class === 'CAST' ? literal(node.child) : undefined

function derivePrefetchPlan(sqlAst, sourceRoles = {}) {
  const ctes = new Map(), plans = new Map(), queued = new Map(), done = new Map(), joinColumns = new Set()
  visitSqlAst(sqlAst, node => {
    node?.cte_map?.map?.forEach(x => ctes.set(x.key, x.value.query.node))
    return node
  })
  const enqueue = (query, columns) => {
    if (!query) return
    if (columns == null) return queued.set(query, null)
    const q = queued.get(query)
    if (q !== null) queued.set(query, new Set([...(q || []), ...columns]))
  }
  const sourcesOf = from => {
    if (!from) return []
    if (from.type === 'TABLE_FUNCTION') {
      const wUrls = colsCacheWUrls(from)
      return wUrls.length ? [{ alias: from.alias || '', wUrls }] : []
    }
    if (from.type === 'BASE_TABLE' && ctes.has(from.table_name))
      return [{ alias: from.alias || from.table_name, query: ctes.get(from.table_name) }]
    if (from.type === 'SUBQUERY') return [{ alias: from.alias || '', query: from.subquery?.node }]
    return [...sourcesOf(from.left), ...sourcesOf(from.right)]
  }
  const joinsOf = from => from ? [from.condition, ...joinsOf(from.left), ...joinsOf(from.right)].filter(Boolean) : []
  enqueue(sqlAst.statements?.at(-1)?.node, null)
  while (queued.size) {
    const [query, required] = queued.entries().next().value
    queued.delete(query)
    const prior = done.get(query)
    if (prior === null || required && prior && [...required].every(x => prior.has(x))) continue
    done.set(query, required == null ? null : new Set([...(prior || []), ...required]))
    const sources = sourcesOf(query.from_table), byAlias = Object.fromEntries(sources.map(x => [x.alias, x]))
    const outputs = new Map(), stars = []
    ;(query.select_list || []).forEach(x => x.class === 'STAR' ? stars.push(x)
      : outputs.set(x.alias || (x.class === 'COLUMN_REF' && x.column_names.at(-1)), x))
    const expressions = required == null ? query.select_list || [] : [...required].flatMap(column =>
      outputs.has(column) ? [outputs.get(column)] : stars.map(x => ({ class: 'COLUMN_REF', column_names: [x.relation_name, column].filter(Boolean) })))
    const joinExpressions = joinsOf(query.from_table)
    joinExpressions.flatMap(exprRefs).forEach(x => joinColumns.add(x.column))
    const refs = [...expressions, query.where_clause, query.having, query.qualify,
      ...(query.group_expressions || []), ...joinExpressions].flatMap(exprRefs)
    refs.forEach(({ qualifier, column }) => {
      const targets = qualifier && byAlias[qualifier] ? [byAlias[qualifier]]
        : sources.length === 1 ? sources : sources
      targets.forEach(source => source.wUrls
        ? source.wUrls.forEach(wUrl => {
            const plan = plans.get(wUrl) || { wUrl, role: sourceRoles[wUrl], columns: new Set(), constraints: [] }
            plan.columns.add(column); plans.set(wUrl, plan)
          })
        : enqueue(source.query, [column]))
    })
    andConjuncts(query.where_clause).forEach(node => {
      if (node.class !== 'BETWEEN' || node.input?.class !== 'COLUMN_REF') return
      const qualifier = node.input.column_names.at(-2), source = qualifier ? byAlias[qualifier] : sources.length === 1 && sources[0]
      const lo = literal(node.lower), hi = literal(node.upper)
      if (!source?.wUrls || lo == null || hi == null) return
      source.wUrls.forEach(wUrl => plans.get(wUrl)?.constraints.push({ column: node.input.column_names.at(-1), lo, hi }))
    })
  }
  return [...plans.values()].map(x => ({ ...x, columns: [...x.columns],
    joinColumns: [...x.columns].filter(column => joinColumns.has(column)) }))
}

const preFetchColsModifier = () => ({ phase: 'finalize', modifyAst: async (sqlAst, ctx) =>
  ({ sqlAst, prefetchPlan: derivePrefetchPlan(sqlAst, ctx.vars.sourceRoles) }) })

CacheStrategy('colsCache', {
  impl: () => ({
    effectiveStrategyFor: wUrls => /\.parquet$/i.test(wUrls[0]) ? 'colsCache' : 'fullFileCache',   // cols_cache seeks PAR1 magic — non-parquet silvers read through the whole-file native reader
    buildSourceReader: async (wUrls, ctx) => {
      const infos = await Promise.all(wUrls.map(u => wresolveInfo(u, ctx)))
      return { sql: biUtils.colsCacheFrom(infos), via: 'colsCache extension (byte-range, no download)',
        resolvedWUrls: infos.map(x => x.fullyResolvedUrl) }
    },
    initQueryLookups: ctx => ctx.setVars({ colsCacheEnsureCols: ctx.vars.ensureCols || [] }),
    modifiers: () => [preFetchColsModifier(),
      preludeModifier(async ctx => `${coreUtils.isNode ? `LOAD '${await biUtils.colsCacheExt(ctx)}';\n` : ''}SET cols_cache_loggers='${coreUtils.activeLoggers(ctx)}';\nSET cols_cache_prefetch_cols='${ctx.vars.preFetchCols || ''}';\n`, '-unsigned ')]   // wasm: cols_cache statically linked, no LOAD/FS; SET still wires loggers
  })
})
// whole-file wcache mirror, then native read_parquet over the local paths; signed cache_httpfs.
CacheStrategy('fullFileCache', {
  impl: () => ({
    buildSourceReader: async (wUrls, ctx) => ({ via: 'fullFileCache wcache (whole file mirrored)', sql: readSourceFiles(await Promise.all(wUrls.map(async u => {
      const { resolved, needsWcache } = await wresolveInfo(u, ctx)
      return needsWcache ? await wcachePopulate(u, ctx, { validate: true }) : resolved
    }))) }),
    modifiers: () => [preludeModifier(() => 'LOAD cache_httpfs;\n')]
  })
})
// read the source as-is (fs disk / gcs httpfs) via wresolve; nothing persisted; signed cache_httpfs.
CacheStrategy('noCache', {
  impl: () => ({
    buildSourceReader: async (wUrls, ctx) => ({ via: 'noCache (read source in place)', sql: readSourceFiles(await Promise.all(wUrls.map(u => wresolve(u, ctx)))) }),
    modifiers: () => [preludeModifier(() => 'LOAD cache_httpfs;\n')]
  })
})

// the built-in modifier: implicit-FROM (when the SELECT has none) + expand every metric/filter/dim/extra name ref to its
// expression node (SELECT keeps alias, tail bare). per-compile inputs ride on %$compileArgs%.
SqlModifier('nameExpand', {
  impl: () => ({ isBuiltIn: true, phase: 'build', async modifyAst(sqlAst, ctx) {
    const { byExpr, defaultFrom, filterSql, extra, inSql } = ctx.vars.compileArgs
    const log = ctx?.vars?.biLogger, nodes = await toNodes(byExpr, ctx)
    const ast = structuredClone(sqlAst), selNode = ast.statements[0].node
    if (selNode.from_table?.type === 'EMPTY' && defaultFrom) {
      selNode.from_table = (await parseSqlAst(`select 1 from ${defaultFrom}`, ctx)).statements[0].node.from_table
      log?.info?.({ t: 'sqlEditor.implicitFrom', from: defaultFrom, in: inSql }, {}, { ctx })
    }
    const metricRef = n => n.class === 'COLUMN_REF' && n.column_names?.length === 1 && nodes[n.column_names[0]] && n.column_names[0]
    const defined = new Set(), nested = new Set()   // defined = metric names the query redefines as an alias/CTE (safe on their own; dangerous only when also referenced bare)
    eachNode(ast, n => { if (n.alias && nodes[n.alias]) defined.add(n.alias); (n.cte_map?.map || []).forEach(c => nodes[c.key] && defined.add(c.key))
      if (n.class === 'FUNCTION' && duckdbAggFuncs.has((n.function_name || '').toLowerCase())) (n.children || []).forEach(c => metricRef(c) && nested.add(metricRef(c))) }, ctx)
    const shadowed = new Set()   // a redefined name that is ALSO referenced as a bare column in ORDER BY/HAVING/expr — nameExpand would wrongly re-expand it
    visitSqlAst(ast, (node, inSelect) => { const r = !inSelect && metricRef(node); if (r && defined.has(r)) shadowed.add(r); return node }, ctx)
    const ambiguous = [...shadowed, ...nested][0]
    if (ambiguous) {
      const how = shadowed.has(ambiguous) ? 'reused as a query alias/CTE name then referenced again' : 'wrapped in an aggregate, but it is already an aggregate'
      const reason = `"${ambiguous}" is a predefined metric ${how}. rename it, or write {%$cube.metric.${ambiguous}%} to force the metric.`
      ctx.vars.ambiguityCheckLogger?.info?.({ t: 'ambiguousMetric', name: ambiguous, kind: shadowed.has(ambiguous) ? 'shadow' : 'nestedAggregate', shadowed: [...shadowed], nested: [...nested], inSql }, {}, { ctx })
      return { sqlAst, expansions: [], error: reason }
    }
    const expansions = []
    const expanded = visitSqlAst(ast, (node, inSelect) => {
      const ref = node.class === 'COLUMN_REF' && node.column_names?.length === 1 && node.column_names[0]
      if (!ref || !nodes[ref]) return node
      const newNode = { ...structuredClone(nodes[ref]), alias: inSelect ? (node.alias || ref) : '' }
      expansions.push({ ref, to: byExpr[ref], pos: inSelect ? 'SELECT' : 'tail', fromNode: node, toNode: newNode })
      return newNode
    }, ctx)
    return { sqlAst: expanded, expansions, marks: { filterSql, extra } }
  } })
})

// brush-mode built-in modifier: in debug/span mode, append a `<metric>__keys = list(keyField)` column per selected metric
// so the drill/brush UI can trace which source rows fed each aggregate. reads its own trigger (debug+span+keyField) from ctx.


// duckdb's own EXPLAIN ANALYZE profiler — the ground truth for what the scan actually read, even when the cols_cache VFS
// telemetry is bypassed (pushed-down filter on a single file). enable_profiling='json' dumps a structured tree to a file;
// we read it back and pull the TABLE_SCAN operators (function, rows scanned, projected columns, filters, per-node time).
const scanNodes = node => (node ? [...(node.operator_name === 'TABLE_SCAN' || node.operator_type === 'TABLE_SCAN' ? [node] : []),
  ...(node.children || []).flatMap(scanNodes)] : [])
SqlModifier('explainScan', { // for debug
  impl: () => ({ phase: 'finalize', async modifyAst(sqlAst, ctx) {   // read-only observer: must see the final serialized SQL
    const body = await biUtils.astToSql(sqlAst, ctx)
    const mods = cacheStrategyOf(ctx).modifiers(ctx)   // its LOAD prelude + -unsigned flag: without both, the profiled run can't load cols_cache → empty profile
    const load = await mods.reduce(async (p, m) => m.modifyPrelude ? m.modifyPrelude(await p, ctx) : p, Promise.resolve(''))
    const duckFlags = mods.map(m => m.duckFlags?.(ctx) || '').join('')
    const out = `/tmp/explainScan-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
    const profile = `SET enable_profiling='json';\nSET profiling_output='${out}';\n`   // json profile tree → file (result rows still ride stdout)
    await runDuckdbSqlByHost(`${load ? load + ';\n' : ''}${profile}${body}`, ctx, { as: 'raw', duckFlags })
    const fs = await import('fs/promises')
    const prof = JSON.parse(await fs.readFile(out, 'utf8').finally(() => fs.unlink(out).catch(() => {})))
    const scans = scanNodes(prof).map(n => ({ fn: n.extra_info?.Function, rowsScanned: n.operator_rows_scanned,
      cols: n.extra_info?.Projections, filters: n.extra_info?.Filters, files: +(n.extra_info?.['Total Files Read'] || 0), ms: Math.round((n.operator_timing || 0) * 1000) }))
    ctx?.vars?.explainScanLogger?.info?.({ t: 'explainScan', scans, rowsScanned: prof.cumulative_rows_scanned, bytesScanned: prof.total_bytes_read, totalMs: Math.round((prof.latency || 0) * 1000) }, {}, { ctx })
    return { sqlAst }
  } })
})

QueryLookup('lookupByWUrl', {
  description: 'QUERY-phase lookup from a wUrl. with key+value → a scalar duckdb macro reading a MAP(key→value) from the json file, callable as bindAs(col); else → a FROM-able relation bound as %$bindAs%.',
  params: [
    {id: 'wUrl', as: 'string', mandatory: true, description: 'gold/ref parquet or json wUrl, relative to wUrlBase or full; ${period} expands per queryPeriod'},
    {id: 'bindAs', as: 'string', mandatory: true, description: 'the SQL name introduced: %$bindAs% relation (join) or bindAs(k) macro (map)'},
    {id: 'key', as: 'string', description: 'map branch: MAP key column; presence (with value) selects the macro form'},
    {id: 'value', as: 'string', description: 'map branch: MAP value column'},
    {id: 'ensureCols', as: 'array', byName: true, description: 'columns cached before browser DuckDB starts the query'}
  ],
  impl: (_, {errorLogger}, { wUrl, bindAs, key, value, ensureCols }) => ({ bindAs,
    async resolveForQuery(ctx, periods) {
      const log = ctx?.vars?.biLogger
      const fullWUrl = joinBase(wUrl, ctx.vars.cubeWUrlBase)
      const m = await biUtils.bindManifestSource?.(fullWUrl, ctx)
      if (m) {   // manifest lookup: bind the read_parquet placeholder (expandManifest swaps it) + register its files for pruneManifest
        log?.info?.({ t: 'queryLookup manifest', bindAs, manifestUrl: m.manifestUrl }, {}, { ctx })
        return { vars: { [bindAs]: m.from }, manifest: { [m.manifestUrl]: m.entry } }
      }
      const strategy = cacheStrategyOf(ctx)
      const sources = await Promise.all(perPeriodWUrls(fullWUrl, periods).map(u => strategy.buildSourceReader([u], ctx)))
      const srcs = sources.map(x => x.sql)
      if (!srcs.length) {
        errorLogger.error({ t: 'queryLookup missing required source', bindAs, wUrl: fullWUrl, periods,
          why: 'a declared lookup resolved to 0 sources (remote HEAD 404 / absent file / period matched nothing) — its %$bindAs% stays unbound, so any SQL referencing it fails at scan time',
          fix: `verify the parquet exists at ${fullWUrl} (gsutil stat / wFetch HEAD); if the lookup is legitimately optional, model it as optional rather than a queryLookup` }, {}, { ctx })
        return {}
      }
      if (key && value) {
        const path = await wresolve(perPeriodWUrls(fullWUrl, periods)[0], ctx)   // small ref file → read via read_json/read_parquet (mapMacroSql picks by ext), not the cols_cache parquet reader
        const { sql } = biUtils.mapMacroSql({ as: bindAs, key, value, path })
        log?.info?.({ t: 'queryLookup map', bindAs, key, value, path, macro: sql }, {}, { ctx })
        return { prelude: sql }
      }
      const rel = srcs.length > 1 ? `(select * from ${srcs.join(' union all select * from ')})` : srcs[0]
      const resolvedWUrls = sources.flatMap(x => x.resolvedWUrls || [])
      log?.info?.({ t: 'queryLookup join', bindAs, cacheStrategy: ctx?.vars?.cacheStrategy || 'colsCache', rel }, {}, { ctx })
      return { vars: { [bindAs]: rel },
        sourceRoles: Object.fromEntries(resolvedWUrls.map(wUrl => [wUrl, bindAs])),
        ensureCols: (ensureCols || []).length ? resolvedWUrls.map(wUrl => ({ wUrl, cols: ensureCols })) : [] }
    }
  })
})

Validation('validation', {
  description: 'named rule over the session obj; cond is a boolean<common> tested with the obj as data.',
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'cond', type: 'boolean<common>', dynamic: true, mandatory: true}
  ],
  impl: (_, {}, { name, cond }) => ({ name, test: obj => !!cond(_.setData(obj)) })
})

BrushData('spanView', {
  params: [{ id: 'of', dynamic: true, mandatory: true, description: 'a drill profile: resolveKeySpan(...) or a brushMode cubeQuery(...)' }],
  impl: async (ctx, {}, { of }) => {
    const r = await of(ctx.setVars({ brushMode: true })), log = ctx?.vars?.biLogger
    const silver = obj => {
      const s = obj[span]; if (!s) return null
      return { tier: 'silver', key: s.key, fields: Object.fromEntries(Object.entries(s.fields).map(([f, d]) =>
        [f, { value: obj[f], pickedIdx: d.pickedIdx, winner: d.events[d.pickedIdx] ?? null, events: d.events, tgpPath: d.tgpPath }])) }
    }
    const gold = row => ({ ...row, cells: Object.fromEntries(Object.entries(row[span].cells).map(([m, c]) => [m, { value: row[m], keys: c.keys, n: c.keys.length }])) })
    const view = Array.isArray(r) ? r.map(row => row[span]?.tier === 'gold' ? gold(row) : silver(row)) : silver(r)
    log?.info?.({ t: 'spanView', tier: Array.isArray(r) ? r[0]?.[span]?.tier : r?.[span]?.tier, view: coreUtils.squeeze(view) }, {}, { ctx })
    return view
  }
})

Dimension('dimension', {
  description: 'a field available for GROUP BY at gold. Guidance for query planners/LLMs choosing dimensions.',
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'statBuilder', type: 'stat-builder<dim-stat>', dynamic: true, description: 'builds observed statistics stored with silver data'},
    {id: 'type', as: 'string', byName: true, options: 'string,integer,timestamp,boolean', description: 'value type hint'},
    {id: 'guidance', as: 'string', description: 'free-text hint for query planners/LLMs, e.g. "low cardinality, safe to group" or "unbounded — filter, never group"'},
    {id: 'values', as: 'array', description: 'enum values of a low-cardinality dimension — drives self-serve filter dropdowns (cube-widget-builder) and LLM guidance'},
    {id: 'parent', as: 'string', description: 'parent dimension for hierarchies (e.g. city→state→country)'},
    {id: 'partition', as: 'string', description: 'iceberg partition transform if this dim should partition the table, e.g. day, hour, bucket[16], truncate[4]'},
    {id: 'hierarchy', type: 'hierarchy<bi>', description: 'levels this dimension groups at, e.g. timeBin("day") on a timestamp dim or geoHierarchy(city,state,country)'},
    {id: 'expectedStat', type: 'stat<bi>', description: 'declared group-size balance for comparing observed group counts'}
  ],
  impl: (ctx, {}, args) => ({ ...args, statBuilder: args.statBuilder(ctx.setVars({ dimensionName: args.name })) })
})

Component('setupCube', {
  type: 'ctx-enricher<tgp>',
  params: [
    {id: 'cube', type: 'cube<bi>', mandatory: true},
    {id: 'queryPeriod', as: 'string', defaultValue: 'today'},
    {id: 'filters', as: 'string', byName: true, description: 'SQL condition applied to every cubeQuery under this binding — becomes the cubeWhere var, wrapping each FROM relation as (select * from rel where <filters>); a per-query where overrides it'},
  ],
  impl: (ctx, {}, { cube, queryPeriod, filters }) => cube.querySetup(filters ? ctx.setVars({ cubeWhere: filters }) : ctx, queryPeriod)
})

async function rowsToParquet(rows, parquet, json, ctx) {
  await coreUtils.runBashScript(`cat > '${json}' <<'JSONEOF'\n${JSON.stringify(rows)}\nJSONEOF`)
  await runDuckdbSqlByHost(`copy (from read_json('${json}')) to '${parquet}' (format parquet)`, ctx, { as: 'nonQuery' })
  return parquet
}

Component('tempView', {
  type: 'ctx-enricher<tgp>',
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'rows', dynamic: true, mandatory: true, description: 'a cubeQuery (or any data) yielding the rows to materialize'}
  ],
  impl: async (ctx, {}, { name, rows }) => {
    const stamp = Date.now()
    const parquet = await rowsToParquet(await rows(ctx), `/tmp/${name}-${stamp}.parquet`, `/tmp/${name}-${stamp}.json`, ctx)
    return enrichCtxWithDataContext(ctx, { vars: { [name]: readSourceFiles([parquet]) } })
  }
})

Component('materializedView', {
  type: 'ctx-enricher<tgp>',
  description: 'pipe stage: freshness-gated rows→parquet→PUT, exposing %$name% as a FROM-able relation for a later cubeQuery. durable sibling of tempView.',
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'wUrl', as: 'string', mandatory: true, description: 'durable parquet location, e.g. room://x/views/${name}.parquet'},
    {id: 'rows', dynamic: true, mandatory: true, description: 'a cubeQuery (or any data) yielding the rows to materialize'},
    {id: 'maxAgeMs', as: 'number', defaultValue: 3600000, description: 'reuse the parquet within this age; 0 always rebuilds'}
  ],
  impl: async (ctx, {}, { name, wUrl, rows, maxAgeMs }) => {
    const log = ctx?.vars?.biLogger
    const head = await wfetch2(wUrl, { method: 'HEAD' }, ctx).catch(() => null)
    const lastModified = head?.ok && head.headers?.get?.('last-modified')
    const state = !lastModified ? 'missing' : maxAgeMs === 0 || Date.now() - new Date(lastModified).getTime() > maxAgeMs ? 'stale' : 'fresh'
    log?.info?.({ event: 'materializedView freshness', name, wUrl, state }, {}, { ctx })
    let path = state === 'fresh' && await wcachePopulate(wUrl, ctx, { validate: true })
    if (!path) {
      const stamp = Date.now()
      const local = await rowsToParquet(await rows(ctx), `/tmp/${name}-${stamp}.parquet`, `/tmp/${name}-${stamp}.json`, ctx)
      await wfetch2(wUrl, { method: 'PUT', body: local, headers: { 'x-wonder-body': 'localFile' } }, ctx)
      path = local
      log?.info?.({ event: 'materializedView built', name, wUrl, path }, {}, { ctx })
    }
    return enrichCtxWithDataContext(ctx, { vars: { [name]: readSourceFiles([path]) } })
  }
})

const parquetSource = SilverBuilder('parquetSource', {
  description: 'point the cube at a pre-existing silver parquet (built elsewhere). wUrl is the projection; no build, no drill.',
  params: [
    {id: 'wUrl', as: 'string', mandatory: true, description: "the existing silver parquet, relative to the cube's wUrlBase or full, e.g. room://x/silver/sessions-${period}.parquet"},
    {id: 'name', as: 'string', defaultValue: '', description: 'cube/FROM-var name; empty ⇒ derived from the wUrl basename'},
    {id: 'keyField', as: 'string', defaultValue: '', description: 'optional drill key; empty ⇒ span/drill off'},
    {id: 'periodPattern', as: 'string', defaultValue: 'YYYY-MM-DD'}
  ],
  impl: (_, {}, { wUrl, name, keyField, periodPattern }) => {
    name = name || wUrl.split('/').pop().replace(/\.parquet$/, '').replace(/[-_]?\$?\{period\}/, '')
    return {
      sourceType: 'full', keyField, periodPattern, name,
      parquetFiles: [{ name, wUrlPattern: wUrl, version: 1 }],
      async plan(_ctx, requirements) {
        return { sourceType: 'full', requirements, parquetFiles: this.parquetFiles, skip: true, reason: 'pre-existing silver' }
      },
      async build(_ctx, plan) {
        return { ok: true, sourceType: 'full', skipped: true, projections: plan?.parquetFiles || this.parquetFiles }
      },
      async resolveKey() { throw new Error(`silver-builder ${wUrl}: no drill (no source events)`) },
      getSourceEvents() { throw new Error(`silver-builder ${wUrl}: no drill (no source events)`) },
      async materialize() { throw new Error(`silver-builder ${wUrl}: not event-based (no materialize)`) },
      async materializePeriod(_ctx, period) { return { period, objs: 0, bytes: 0, parquet: null, outUrl: wUrl.replace(/\$\{period\}|\{period\}/, period) } }
    }
  }
})

const cubeless = Cube('cubeless', { impl: cube({ source: parquetSource('room://testPublicRoom/usersRO/silver/products-2026-01-01.parquet', 'noop'), metrics: [] }) })

function namedFilterPredicates(ctx) {
  const filters = dsls.bi['cube-filter'] || {}
  return Object.fromEntries(Object.keys(filters).flatMap(name => {
    const comp = filters[name][Symbol.for('asJbComp')]
    if ((comp?.params || []).length) return []
    try { return [[name, comp.runProfile({}, ctx).toSql(ctx)]] } catch { return [] }
  }))
}

CubeTool('cubeQuery', {
  params: [
    { id: 'sql', as: 'text', dynamic: true, mandatory: true, description: "read the impl to see the vars prepared for you. reference a var as {%$name%}; literal SQL % (LIKE '%x%', strftime('%Y')) passes through untouched." },
    { id: 'cube', type: 'cube<bi>', defaultValue: '%$cube%' },
    { id: 'queryPeriod', as: 'string', defaultValue: '%$queryPeriod%' },
    { id: 'timeSlice', as: 'string', byName: true, defaultValue: 'day' },
    { id: 'where', as: 'string', byName: true, defaultValue: '%$cubeWhere%', description: 'SQL condition wrapping every cube FROM relation: (select * from rel where <where>). usually flows from setupCube filters or a runReportBatch entry' },
    { id: 'cacheStrategy', as: 'string', options: 'colsCache,fullFileCache,noCache', description: 'override the cube default read strategy for THIS query. baked into the profile → survives the lambda wire.' }
  ],
  impl: async (ctx, {}, { sql: sqlFn, timeSlice, cube, queryPeriod, where, cacheStrategy }) => {
    const log = ctx?.vars?.biLogger, brushMode = ctx.vars.brushMode, e2e0 = Date.now()
    cube = cube || cubeless.$run()
    ctx = ctx.setVars({ gran: ctx.vars.gran || timeSlice,
      cacheStrategy: cacheStrategy || ctx.vars.cacheStrategy || cube.cacheStrategy })
    if (!ctx.vars.silvers) ctx = await cube.querySetup(ctx, queryPeriod || ctx.vars.queryPeriod || 'today')   // standalone cubeQuery: run the cube's setup+lookups+silvers+modifiers once, so `from base` works without setupCube
    ctx = ctx.setVars({ colsCacheEnsureCols: [] })
    ctx = await (cacheStrategyOf(ctx).initQueryLookups?.(ctx) || ctx)
    const periods = ctx.vars.periods || expandPeriods(queryPeriod || 'today', cube.periodPattern)
    const silvers = ctx.vars.silvers || await resolveSilvers(cube, periods, ctx)   // reuse querySetup's silvers (froms + $manifest) → no second manifest read
    const froms = where ? Object.defineProperty(Object.fromEntries(Object.keys(silvers).map(k => [k, `(select * from ${silvers[k]} where ${where})`])), '$manifest', { value: silvers.$manifest }) : silvers
    const sql = coreUtils.embedBraceVars(sqlFn.profile, sqlFn.lexicalCtx.setVars({ ...ctx.vars, ...froms }))
    const byName = Object.fromEntries((cube.metrics || []).map(m => [m.name, m]))
    const filterSql = namedFilterPredicates(ctx.setVars({ cube }))   // currentPeriod → 'DateType_ID in (0)', so `where currentPeriod` expands like a metric
    const editor = sqlEditor(cube, m => biUtils.metricToSql(m, byName), log, ctx, filterSql)
    const modifiers = [...(ctx.vars.sqlModifiers || []), ...(ctx.vars.explainScanLogger ? [SqlModifier.explainScan.$run()] : [])]
    const opts = { brushMode, extra: { time: biUtils.timeColumnSql(cube, timeSlice) }, defaultFrom: froms[cube.parquetFiles?.[0]?.name], modifiers, manifest: froms.$manifest }
    const prelude = (ctx.vars.sqlPreludes || []).join(';\n')   // map-macro DDL from query-lookups; compile folds the strategy's LOAD in front of it
    const { out: compiled, duckFlags, prefetchPlan, error: compileError } = await editor.compile(sql, { ...opts, prelude })
    if (compileError) { 
      ctx.vars.errorLogger?.error?.({ t: 'cubeQuery ambiguous metric', reason: compileError, sql }, {}, { ctx }); 
      return [] 
    }
    log?.info?.({ event: 'cubeQuery prelude', prelude }, {}, { ctx })
    ctx.vars.colsCacheLogger?.info?.({ t: 'prefetch.compiled', sources: prefetchPlan.length }, {}, { ctx })
    ctx = ctx.setVars({ prefetchPlan })
    const { stdout, stderr, error } = await runDuckdbSqlByHost(compiled, ctx, { as: 'raw', duckFlags })
    log?.info?.({ event: 'cubeQuery compiled', compiled }, {}, { ctx })
    if (error) {   // a failed query is not silently empty — report via errorLogger (surfaces in biErrors) and return [] so the flow continues
      ctx.vars.errorLogger?.error?.({ t: 'cubeQuery failed', reason: String(stderr || error).slice(0, 300), sql: compiled }, {}, { ctx })
      return []
    }
    const rows = stdout || []
    log?.info?.({ t: 'e2e.time', ms: Date.now() - e2e0 }, {}, { ctx })   // measured cubeQuery wall-time end to end (setup+compile+duckdb)
    log?.info?.({ event: 'cubeQuery rows', rows: rows.length }, { sample: rows[0] }, { ctx })
    return brushMode ? rows.map(splitGoldSpan) : rows
  }
})

CubeTool('cubeDimensionCatalog', {
  description: 'query verified values or a hierarchy for cube dimensions',
  params: [
    { id: 'cube', type: 'cube<bi>', mandatory: true },
    { id: 'dimension', as: 'string', mandatory: true, description: 'comma-separated hierarchy from broad to specific' }
  ],
  impl: async (ctx, {}, { cube, dimension }) => {
    const dimensions = dimension.split(',').map(x => x.trim())
    const rows = await CubeTool.cubeQuery.$runWithCtx(ctx, {
      cube, sql: `select ${dimensions.join(',')},count(*) rows group by ${dimensions.join(',')} order by ${dimensions.join(',')}`
    })
    return `Verified ${dimensions.join(' -> ')} values:\n${rows.map(row => dimensions.map(name => row[name]).join(' -> ')).join('\n')}`
  }
})

Script('sqlScript', {
  description: 'a staged BI computation: setup binds cubes as %$name% vars, steps accumulate %$name% relations/scalars, then result reads them → rows.',
  params: [
    { id: 'setup',  type: 'ctx-enricher<tgp>[]', dynamic: true, description: 'cube bindings — setupCube/setVar that name cubes as %$name% vars the steps below can query' },
    { id: 'steps',  type: 'ctx-enricher<tgp>[]', dynamic: true, mandatory: true, description: 'tempView/materializedView/setVar — stage %$name% relations/scalars for later steps' },
    { id: 'result', type: 'data', dynamic: true, mandatory: true, description: 'the terminal profile (usually a cubeQuery) whose rows ARE the answer, reading the staged %$name% vars' }
  ],
  impl: async (ctx, {}, { setup, steps, result }) =>
    result(await [...coreUtils.asArray(setup.profile), ...coreUtils.asArray(steps.profile)]
      .reduce((c, e) => Promise.resolve(c).then(c => c.run(e)), ctx))
})

CubeTool('compileCubeSql', {
  params: [
    { id: 'cube', type: 'cube<bi>', dynamic: true, mandatory: true },
    { id: 'sql',  as: 'string', mandatory: true }
  ],
  impl: (ctx, {}, { cube, sql }) => {
    const c = cube(ctx), byName = Object.fromEntries((c.metrics || []).map(m => [m.name, m]))
    return sqlEditor(c, m => biUtils.metricToSql(m, byName), ctx?.vars?.biLogger, ctx).compile(sql, { modifiers: c.sqlModifiers || [] }).then(r => r.out)
  }
})

CubeTool('cubeToolInfoForQuery', {
  params: [
    { id: 'cube', type: 'cube<bi>', dynamic: true, mandatory: true },
    { id: 'queryPeriod', as: 'string', defaultValue: 'today' }
  ],
  impl: (ctx, {}, { cube, queryPeriod }) => cube(ctx).cubeToolInfoForQuery(ctx, queryPeriod)
})

CubeTool('cubeSummary', {
  params: [{ id: 'cube', type: 'cube<bi>', dynamic: true, defaultValue: '%$cube%' }],
  impl: (ctx, {}, { cube }) => cube(ctx).summary(ctx)
})

CubeTool('cubeDimensionSummary', {
  params: [
    { id: 'dimension', as: 'string', mandatory: true },
    { id: 'cube', type: 'cube<bi>', dynamic: true, defaultValue: '%$cube%' }
  ],
  impl: async (ctx, {}, { dimension, cube }) => {
    const summary = await cube(ctx).summary(ctx)
    const stat = summary.dimensionStats?.split('\n\n').find(stat => stat.startsWith(`Stat('${dimension}.`))
    return { dimension: summary.dimensions.find(({ name }) => name == dimension), stat }
  }
})

ParquetFile('projection', {
  description: 'a named silver parquet (one obj per cube object). name → the gold `from %$name%` ctx var.',
  params: [
    {id: 'name',        as: 'string', mandatory: true, description: 'silver name; queries read `from %$name%`'},
    {id: 'wUrlPattern', as: 'string', mandatory: true, description: 'output parquet pattern, e.g. roomLogs://sessions/closed-${period}.parquet'},
    {id: 'fields',      as: 'array', byName: true, description: 'cubeReducer output names to store; "*" = all'},
    {id: 'version',     as: 'number', byName: true, defaultValue: 1, description: 'bumping rebuilds all periods'},
  ]
})

async function parquetMeta(paths, ctx) {
  const q = s => `'${s.replaceAll("'", "''")}'`
  const t = `[${paths.map(q).join(',')}]`
  const sql = `select to_json({
  columns:   (select list({name: column_name, type: column_type}) from (describe select * from read_parquet(${t}))),
  rows:      (select count(*) from read_parquet(${t})),
  bytes:     (select sum(total_compressed_size) from parquet_metadata(${t})),
  byColumn:  (select list({col: c, type: ty, compressed: comp, uncompressed: uncomp, values: vals}) from (select path_in_schema c, first(type) ty, sum(total_compressed_size) comp, sum(total_uncompressed_size) uncomp, sum(num_values) vals from parquet_metadata(${t}) group by path_in_schema)),
  rowGroups: (select list({id: id, rows: r, compressed: comp}) from (select row_group_id id, first(row_group_num_rows) r, sum(total_compressed_size) comp from parquet_metadata(${t}) group by row_group_id))})`
  const dimensionStats = await parquetDimensionStats(paths[0], ctx)
  return { ...await runDuckdbScalar(sql, ctx), dimensionStats }
}

const parquetDimensionStats = async (wUrl, ctx) => runDuckdbSqlByHost(`${coreUtils.isNode
  ? `LOAD '${await biUtils.colsCacheExt(ctx)}';` : ''} SET cols_cache_loggers='${coreUtils.activeLoggers(ctx)}';
select decode(value) from ${
  biUtils.colsCacheFrom([await wresolveInfo(wUrl, ctx)], 'cols_cache_kv_metadata')
} where decode(key)='dimension-stats' limit 1`, ctx, { as: 'text', duckFlags: '-unsigned ' })

function splitGoldSpan(row) {
  const cells = {}, clean = {}
  for (const [k, v] of Object.entries(row)) k.endsWith('__keys') ? (cells[k.slice(0, -'__keys'.length)] = { keys: v }) : (clean[k] = v)
  clean[span] = { tier: 'gold', cells }
  return clean
}

function fmtPeriod(d, pattern) { return pattern.includes('-HH') ? `${d.toISOString().slice(0, 10)}-${String(d.getUTCHours()).padStart(2, '0')}` : d.toISOString().slice(0, 10) }

function expandPeriods(spec, pattern, allMax = 60) {
  const stepMs = pattern.includes('-HH') ? 3600000 : 86400000
  const back = n => Array.from({ length: n }, (_, i) => fmtPeriod(new Date(Date.now() - i * stepMs), pattern))
  return spec === 'today' ? [fmtPeriod(new Date(), pattern)]
    : spec === 'all' ? back(allMax)
    : spec.startsWith('last:') ? back(+spec.slice(5) || 1)
    : [spec]
}

const perPeriodWUrls = (wUrlPattern, periods) =>
  (/\$\{period\}|\{period\}/.test(wUrlPattern) ? periods : ['_']).map(p => wUrlPattern.replace(/\$\{period\}|\{period\}/, p))

async function cachePeriodParquets(wUrlPattern, periods, ctx) {
  const out = []
  for (const url of perPeriodWUrls(wUrlPattern, periods)) {
    const { resolved, needsWcache } = await wresolveInfo(url, ctx)
    out.push(needsWcache ? await wcachePopulate(url, ctx, { validate: true }) : resolved)
  }
  return out
}

async function lastBuiltOnGcs(wUrlPattern, periods, ctx) {
  const heads = await Promise.all(perPeriodWUrls(wUrlPattern, periods).map(url =>
    wfetch2(url, { method: 'HEAD' }, ctx).then(r => r?.headers?.get?.('Last-Modified')).catch(() => null)))
  return heads.filter(Boolean).map(d => new Date(d).toISOString()).sort().at(-1) || null
}


async function resolveSilvers(cube, periods, ctx) {
  if (cube.source?.resolveFroms) return cube.source.resolveFroms(ctx, periods)
  const declaredStrategy = ctx?.vars?.cacheStrategy ?? cube.cacheStrategy ?? 'colsCache'
  const { biLogger: log, cubeWUrlBase } = ctx.vars, froms = {}, manifest = {}, sourceRoles = {}
  const strategiesByName = { [declaredStrategy]: CacheStrategy[declaredStrategy].$run() }   // seeded with the declared one: manifests + query-lookups read through it
  for (const p of cube.parquetFiles || []) {
    const wUrlPattern = joinBase(p.wUrlPattern, cubeWUrlBase)
    const wUrls = perPeriodWUrls(wUrlPattern, periods)
    const manifestSource = await biUtils.bindManifestSource?.(wUrls[0], ctx)   // manifest defers its real reader to expandManifest, which reads through the declared strategy
    const readableByDeclared = manifestSource || !strategiesByName[declaredStrategy].effectiveStrategyFor   // manifest defers to the declared strategy; a strategy with no delegation always reads its own silvers
    const effectiveStrategy = readableByDeclared ? declaredStrategy : strategiesByName[declaredStrategy].effectiveStrategyFor(wUrls)   // per-silver: both halves (reader + modifiers) come from this ONE strategy
    const strategy = strategiesByName[effectiveStrategy] ||= CacheStrategy[effectiveStrategy].$run()
    const source = manifestSource || await strategy.buildSourceReader(wUrls, ctx)
    const { from = source.sql, via } = source
    froms[p.name] = from
    ;(source.resolvedWUrls || []).forEach(wUrl => sourceRoles[wUrl] = p.name)
    if (manifestSource) manifest[manifestSource.manifestUrl] = manifestSource.entry
    log?.info?.({ event: 'silver', name: p.name, declaredStrategy, effectiveStrategy, via, from, periods: coreUtils.squeeze(periods) }, {}, { ctx })
  }
  Object.defineProperty(froms, '$modifiers', { value: Object.values(strategiesByName).flatMap(s => s.modifiers(ctx)) })   // union the modifiers of every strategy actually used → compile just spreads these
  Object.defineProperty(froms, '$sourceRoles', { value: sourceRoles })
  return Object.defineProperty(froms, '$manifest', { value: manifest })
}

Object.assign(biUtils, { cachePeriodParquets, expandPeriods, resolveSilvers, joinBase, wresolveInfo, cacheStrategyOf })
