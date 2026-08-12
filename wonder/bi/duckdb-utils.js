import { dsls, coreUtils, jb } from '@jb6/core'
import '@jb6/core/misc/jb-cli.js'
import '@jb6/core/misc/import-map-services.js'
import { colsCacheRuntime } from './cols-cache/cols-cache-version.js'

const biUtils = jb.biUtils ||= {}
const { ensureLoggers } = coreUtils
const { tgp: { Component }, test: { Logger } } = dsls

Component('checkTimePredicate', {
  type: 'ctx-enricher<tgp>',
  params: [{ id: 'predicate', as: 'text', mandatory: true }],
  impl: async (ctx, {}, { predicate }) => {
    const checked = await biUtils.checkTimePredicate(predicate, ctx)
    return checked.error ? ctx.setVars({ queryCaseError: checked.error }) : ctx.setVars({ timePredicate: checked.predicate })
  }
})

Logger('duckDBProfilingLogger', { impl: ctx => { let deps = ctx, result; return {
  duckDBProfilingLog: [], duckDBProfilingErrors: [],
  onCreation: c => (deps = ensureLoggers('colsCacheLogger,biDownloadLogger,insideDuckdbLogger,biLogger,bigLogLogger', { ctx: c })),
  logsAndErrors() {
    if (result) return result
    const drain = l => [...(deps.vars[l]?.[l.replace(/Logger$/, 'Log')] || [])]   // read a COPY of the shared dep array; never mutate it — other harvesters read the same ref
    // lambda harvest returns cpp lines from child logs and live SSE; collapse duplicates so sums stay correct.
    const dedup = arr => [...new Map(arr.map(r =>
      [JSON.stringify({ ...r, at: 0, $source: 0, tgpPath: 0 }), r])).values()]
    const cols = dedup(drain('insideDuckdbLogger')), cache = dedup(drain('colsCacheLogger')), bi = dedup(drain('biLogger')),
      downloads = dedup(drain('biDownloadLogger'))
    const compile = bi.find(l => l.t === 'sqlEditor.compile') || {}   // the SQL the studio scanned: in = original query, out = compiled duckdb SQL
    const sum = (arr, t, k) => arr.filter(l => l.t === t).reduce((a, l) => a + (l[k] || 0), 0)   // a manifest emits one entry per file — sum across them
    const base = p => (p || '').replace(/.*\//, '').replace(/\.parquet$/, '')   // shortest file id: basename, no dir, no .parquet ext
    const measurement = t => bi.find(l => l.t === t) || {}
    const duck = measurement('duck.time'), scanMs = duck.ms, e2eMs = measurement('e2e.time').ms
    const colBytes = cols.filter(l => l.t === 'scan.colBytes').flatMap(l => l.cols || [])
      .reduce((m, c) => (m[c.col] = (m[c.col] || 0) + c.bytes, m), {})   // sum each column's bytes over every file scanned
    const one = obj => Object.entries(obj).filter(([, v]) => v || v === 0).map(([k, v]) => `${k}=${v}`).join(' ')   // flatten to a single readable line, drop blanks
    const scanBytes = Object.values(colBytes).reduce((a, b) => a + b, 0)
      || cache.filter(l => l.t === 'scan.file').reduce((sum, l) => sum + l.hitBytes + l.missBytes, 0)
    const sourceBytes = Object.values(Object.fromEntries(cache.filter(l => l.t === 'file.size').map(l => [base(l.file), l.size])))
      .reduce((sum, bytes) => sum + bytes, 0)
    const starts = new Map(downloads.filter(l => l.t === 'bi.network.begin').map(l => [`${l.queryId}.${l.operationId}`, l]))
    const operations = downloads.filter(l => l.t === 'bi.network.end').flatMap(end => {
      const start = starts.get(`${end.queryId}.${end.operationId}`)
      return start ? [{ start: start.at, end: end.at, bytes: end.bytes, kind: end.kind }] : []
    })
    const downloadBytes = operations.reduce((sum, op) => sum + op.bytes, 0)
    const downloadMs = operations.length ? Math.max(...operations.map(op => op.end)) - Math.min(...operations.map(op => op.start)) : undefined
    const activeMs = operations.sort((a, b) => a.start - b.start).reduce((s, op) => {
      s.ms += Math.max(0, op.end - Math.max(op.start, s.end)); s.end = Math.max(s.end, op.end); return s
    }, { ms: 0, end: -Infinity }).ms
    const chunks = new Map(cache.filter(l => l.t === 'scan.ranges').flatMap(l =>
      (l.ranges || []).map(r => [`${base(l.file)}.${r.off}`, { rg: l.rg, col: r.col }])))
    const roles = Object.fromEntries(cache.filter(l => l.t === 'source.roles').flatMap(l =>
      Object.entries(l.roles || {}).map(([wUrl, role]) => [base(wUrl), role])))
    const ranges = cache.filter(l => ['range.wrote', 'range.tail', 'range.full', 'range.get'].includes(l.t)).map(l => {
      const off = l.off ?? +(l.file || '0').split('-')[0]
      const file = base(l.wUrl || l.file), chunk = chunks.get(`${file}.${off}`)
      return { type: l.t.split('.')[1], file, role: roles[file], rg: l.rg ?? chunk?.rg, col: l.col ?? chunk?.col,
        off, bytes: l.bytes, startMs: l.atMs, durationMs: l.gcsMs,
        endMs: l.atMs + l.gcsMs }
    })
    const points = ranges.flatMap(r => [[r.startMs, 1], [r.endMs, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
    const maxConcurrency = points.reduce((s, [, d]) => (s.n += d, s.max = Math.max(s.max, s.n), s), { n: 0, max: 0 }).max
    const fetched = cache.filter(l => l.t === 'range.wrote').map(l => { const off = +l.file.split('-')[0]
      const c = chunks.get(`${base(l.wUrl)}.${off}`)
      return `${base(l.wUrl)}:${c ? `${c.rg}:${c.col}` : '?'}`
    })
      .sort((a, b) => +a.split(':')[0] - +b.split(':')[0])
    result = { duckDBProfiling: {
      timing: one({ scan_ms: scanMs, e2e_ms: e2eMs }),
      scanMs, cpuMs: duck.cpuMs, userCpuMs: duck.userCpuMs, systemCpuMs: duck.systemCpuMs,
      download: downloadMs == null ? undefined : { bytes: downloadBytes, ms: downloadMs, activeMs,
        mbps: downloadBytes / downloadMs / 1000, activeMbps: downloadBytes / activeMs / 1000,
        operations: operations.map(op => ({ ...op, note: 'log to delete' })) },
      bytesScanned: scanBytes || undefined,
      sourceBytes: sourceBytes || cache.find(l => ['size.hit', 'range.tail'].includes(l.t))?.size,
      rangesFromBucket: ranges.length ? { requests: ranges.length, bytes: ranges.reduce((s, r) => s + r.bytes, 0),
        wallMs: Math.max(...ranges.map(r => r.endMs)) - Math.min(...ranges.map(r => r.startMs)),
        requestMs: ranges.reduce((s, r) => s + r.durationMs, 0), maxConcurrency, waterfall: ranges } : undefined,
      fetchedChunks: fetched.length ? fetched : undefined,
      colScan: Object.entries(colBytes).map(([c, b]) => `${c}:${b}`).join(' ') || undefined,
      rowGroupsScanned: cols.some(l => l.t === 'scan.rowGroups') ? `${sum(cols, 'scan.rowGroups', 'scanned')}/${sum(cols, 'scan.rowGroups', 'total')}` : undefined,
      colsCache: colsCacheLine(),
      manifestBytes: (compile.explanation || []).flatMap(e => e.expandManifest || [])
        .reduce((s, e) => s + (e.totalBytes || 0), 0) || undefined,
      sql: compile.in, compiledSql: compile.out
    } }
    jb.loggingUtils.preserveForBigLog(deps, ['insideDuckdbLogger', 'colsCacheLogger', 'biDownloadLogger', 'biLogger'])
    ;['insideDuckdbLogger', 'colsCacheLogger', 'biDownloadLogger', 'biLogger'].forEach(l =>
      Object.values(deps.vars[l] || {}).filter(Array.isArray).forEach(log => log.length = 0))
    return result
    function colsCacheLine() {
      if (!cache.some(l => l.t === 'scan.plan')) return undefined
      const rollup = one({ rowGroups: sum(cache, 'scan.plan', 'rgs'), hits: sum(cache, 'scan.summary', 'hits'), misses: sum(cache, 'scan.summary', 'misses'),
        hitBytes: sum(cache, 'scan.summary', 'hitBytes'), missBytes: sum(cache, 'scan.summary', 'missBytes'), streamMs: sum(cache, 'scan.summary', 'streamMs') })
      const sizes = Object.fromEntries(cache.filter(l => l.t === 'file.size').map(l => [base(l.file), l.size]))
      const scanned = cache.filter(l => l.t === 'scan.file').reduce((m, l) =>
        (m[base(l.file)] = (m[base(l.file)] || 0) + l.hitBytes + l.missBytes, m), {})
      const perFile = Object.entries(sizes).map(([name, size]) => `${name}:${scanned[name] || 0}/${size}`)
      return one({ files: perFile.length, totalBytes: Object.values(sizes).reduce((a, b) => a + b, 0) }) + ' ' + rollup
        + `\n  perFile: ${perFile.join(', ')}`
    }
  } } } 
})

// cli transport: spawn DuckDB with -json; streams stderr to onLine. big SQL rides a temp .sql file (no E2BIG argv).
async function runDuckdbWithCli(sql, duckFlags, ctx, onLine) {
  const flags = `${duckFlags}-json`, opts = { onStderrLine: onLine, cliLogger: ctx?.vars?.cliLogger, ctx }
  const timed = cmd => `TIMEFORMAT='__JB_DUCK_CPU__ %U %S'; time ${cmd}`
  let res
  if (sql.length <= 50 * 1024)   // small enough for argv
    res = await coreUtils.runBashScript(timed(`duckdb ${flags} -c '${sql.replaceAll("'", "'\\''")}'`), opts)
  else {
    const file = `/tmp/duck-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`
    await (await import('fs/promises')).writeFile(file, sql)   // fs write, not a heredoc → the SQL never rides in bash -c argv (no E2BIG)
    res = await coreUtils.runBashScript(`${timed(`duckdb ${flags} -f '${file}'`)}; rc=$?; rm -f '${file}'; exit $rc`, opts)
  }
  const [, user = 0, system = 0] = res.stderr.match(/__JB_DUCK_CPU__ ([\d.]+) ([\d.]+)/) || []
  return { ...res, userCpuMs: +user * 1000, systemCpuMs: +system * 1000, cpuMs: (+user + +system) * 1000 }
}

// the single gate every duckdb sql flows through. `as` picks what comes back; the host picks only the raw transport —
// runDuckdbWithCli (spawn cli) or runDuckdbWithWasm (melt vendored duckdb-eh.wasm host + cols_cache side-module).
// the prelude, the ctx.vars loggers and the CppLog router are SHARED here: the C++ CppLog emits the same {kind:'log'}
// JSONL on both hosts (child stderr on node, worker console in the browser) → one dispatchChildLine routes it identically.
//   parseOnly: a bare json_serialize/deserialize transform — skips the memory/temp/duckFlags envelope, just lambda_syntax.
//   duckFlags: cli flags the compile chain contributed (e.g. '-unsigned ' from colsCache); ignored when parseOnly.
//   as: 'rows' array · 'value' first cell (json-parsed) · 'text' first cell string · 'raw' {stdout,stderr,error} · 'nonQuery' {error,stderr}
async function runDuckdbSqlByHost(sql, ctx, { as = 'rows', parseOnly = false, duckFlags = '' } = {}) {
  const memLimit = ctx?.vars?.duckMemLimit || (coreUtils.isNode ? '500MB' : '300MB')
  const prelude = parseOnly ? `SET lambda_syntax='ENABLE_SINGLE_ARROW';\n`
    : `SET memory_limit='${memLimit}';\n${coreUtils.isNode ? `SET temp_directory='/tmp';\n` : ''}SET lambda_syntax='ENABLE_SINGLE_ARROW';\n`   // no /tmp in the wasm (FILESYSTEM=0)
  const route = coreUtils.makeChildOutputRouter({
    ctx, bindLoggers: coreUtils.activeLoggers(ctx) || 'colsCacheLogger'
  })
  const onLine = line => route?.({ stream: 'stderr', text: line + '\n' })
  const t0 = Date.now()
  const res = coreUtils.isNode ? await runDuckdbWithCli(prelude + sql, parseOnly ? '' : duckFlags, ctx, onLine)
                               : await runDuckdbWithWasm(prelude + sql, ctx, onLine)
  if (!parseOnly) ctx?.vars?.biLogger?.info?.({
    t: 'duck.time', ms: Date.now() - t0, cpuMs: res.cpuMs, userCpuMs: res.userCpuMs, systemCpuMs: res.systemCpuMs
  }, {}, { ctx })
  route?.flush()
  if (as === 'raw') return res
  if (as === 'nonQuery') return { error: res.error, stderr: res.stderr }
  const rows = res.stdout || [], v = Object.values(rows[0] ?? {})[0]
  return as === 'rows' ? rows
       : as === 'value' ? (typeof v === 'string' ? JSON.parse(v) : v ?? null)   // json scalar arrives parsed on -json, as a string on wasm
       : v == null ? '' : String(v)                                             // 'text' — e.g. json_deserialize_sql's SQL string
}

// wasm transport: worker query → -json rows in {stdout}; hands each cpp CppLog line to onLine (same router as cli's stderr).
async function runDuckdbWithWasm(sql, ctx, onLine) {
  ctx?.vars?.colsCacheLogger?.info?.({ t: 'wasm.path', path: colsCacheRuntime.client }, {}, { ctx })
  return { stdout: await (await import(colsCacheRuntime.client)).runSql(sql, ctx, onLine) }
}

async function clearDuckdbCache() {
  if (!coreUtils.isNode) return (await import(colsCacheRuntime.client)).clearCache()
  return (await import('fs/promises')).rm('/tmp/cols_cache', { recursive: true, force: true })
}

function quoteLiteral(s) { return `'${s.replaceAll("'", "''")}'` }
function readSourceFiles(paths) { const list = `[${paths.map(p => `'${p}'`).join(',')}]`
  return /\.csv$/.test(paths[0]) ? `read_csv_auto(${list})` : /\.jsonl?$/.test(paths[0]) ? `read_json(${list})` : `read_parquet(${list})` 
}

function stripLoc(n) { return Array.isArray(n) ? n.map(stripLoc)
  : n && typeof n === 'object' ? Object.fromEntries(Object.entries(n).filter(([k]) => k !== 'query_location').map(([k, v]) => [k, stripLoc(v)])) : n }
// docs: https://duckdb.org/docs/lts/data/json/sql_to_and_from_json | https://github.com/duckdb/duckdb/discussions/6922
async function sqlParseKeepLoc(sql, ctx) {   // keeps query_location. duckdb reports a syntax error as {error:true,...} rather than throwing,
  const ast = await runDuckdbSqlByHost(`SELECT json_serialize_sql(${quoteLiteral(sql)}) AS a`,
    ctx, { as: 'value', parseOnly: true })
  if (ast.error) throw new Error(`duckdb could not parse cube SQL: ${ast.error_message} (at position ${ast.position}) — sql: ${sql}`)
  return ast
}
async function parseSqlAst(sql, ctx) { return stripLoc(await sqlParseKeepLoc(sql, ctx)) }
function astToSql(ast, ctx) { return runDuckdbSqlByHost(`SELECT json_deserialize_sql(${quoteLiteral(JSON.stringify(ast))}) AS a`, ctx, { as: 'text', parseOnly: true }) }

async function checkTimePredicate(predicate, ctx) {
  try {
    const expression = (await parseSqlAst(`select ${predicate} as predicate`, ctx)).statements[0].node.select_list[0]
    const date = node => node?.class == 'COLUMN_REF' && node.column_names?.length == 1 && node.column_names[0] == 'date'
    const literal = node => node?.class == 'CAST' && node.cast_type?.id == 'DATE' && node.child?.class == 'CONSTANT'
    const comparisons = node => node?.class == 'CONJUNCTION' && node.type == 'CONJUNCTION_AND'
      ? node.children.flatMap(comparisons) : [node]
    const parts = comparisons(expression)
    const lower = node => node?.class == 'COMPARISON' && node.type == 'COMPARE_GREATERTHANOREQUALTO'
      && date(node.left) && literal(node.right)
    const upper = node => node?.class == 'COMPARISON' && node.type == 'COMPARE_LESSTHAN' && date(node.left) && literal(node.right)
    if (!parts.length || !parts.every(node => lower(node) || upper(node)) || !parts.some(lower) || !parts.some(upper))
      return { error: "Invalid timePredicate: require date >= DATE 'YYYY-MM-DD' AND date < DATE 'YYYY-MM-DD'" }
    const { error, stderr } = await runDuckdbSqlByHost(`select (${predicate}) from (select DATE '2000-01-01' date)`, ctx, { as: 'raw' })
    return error ? { error: `Invalid timePredicate: ${String(stderr || error).replace(/\n__JB_DUCK_CPU__.*/s, '').trim()}` } : { predicate }
  } catch (error) {
    coreUtils.logException(error, 'Invalid timePredicate', { ctx, predicate })
    return { error: 'Invalid timePredicate' }
  }
}

const SEL = 'SELECT '
function eachNode(node, fn, ctx) { if (Array.isArray(node)) node.forEach(n => eachNode(n, fn, ctx))
  else if (node && typeof node === 'object') { fn(node, ctx); Object.values(node).forEach(v => eachNode(v, fn, ctx)) }
}

function rewriteDigest(out, expansions, { filterSql = {}, extra = {} } = {}) {
  const typeOf = ref => filterSql[ref] ? 'filter' : extra[ref] ? 'extra' : 'metric'
  const outExpr = ref => (out.match(new RegExp(`(?:SELECT |, )([^,]+?) AS ${ref}\\b`)) || [])[1]
  return expansions.map(({ ref, pos }) => ({ ref, type: typeOf(ref), pos, out: pos === 'SELECT' ? outExpr(ref) : `(tail: ${ref})` }))
}

function sqlEditor(cube, metricSql, logger, ctx, filterSql = {}) {
  const exprByName = { ...Object.fromEntries((cube.metrics || []).map(m => [m.name, metricSql(m)])), ...filterSql }
  const cacheStrategyOf = ctx => dsls.bi['cache-strategy'][ctx?.vars?.cacheStrategy || 'colsCache'].$run()
  return {
    async compile(sql, { debug = false, span = true, extra = {}, defaultFrom, modifiers = [], manifest = {}, prelude = '' } = {}) {
      const byExpr = { ...exprByName, ...extra }
      const t = () => globalThis.process?.hrtime ? Number(process.hrtime.bigint() / 1000n) / 1000 : performance.now()
      const t0 = t()
      const compileArgs = { byExpr, defaultFrom, debug, span, cube, filterSql, extra, manifest, inSql: sql }
      let c = ctx.setVars({ compileArgs })
      const builtIns = coreUtils.globalsOfType(dsls.bi['sql-modifier'], c).filter(m => m.isBuiltIn)
      const phases = ['build', 'rewriteSource', 'finalize']
      const rank = m => { const [p, o] = (m.phase || 'build').split(':')
        return [phases.indexOf(p), +o || 10] }
      const cacheStrategyModifiers = c.vars.silvers?.$modifiers || cacheStrategyOf(c).modifiers(c)
      const chain = [...builtIns, ...cacheStrategyModifiers, ...modifiers].map((m, i) => [m, i])
        .sort(([a, i], [b, j]) => rank(a)[0] - rank(b)[0] || rank(a)[1] - rank(b)[1] || i - j).map(([m]) => m)
      const t1 = t()
      let sqlAst = await parseSqlAst(sql, c), trace = []
      for (const mod of chain) if (mod.modifyAst) {
        const res = await mod.modifyAst(sqlAst, c)
        if (res.error) return { error: res.error }
        sqlAst = res.sqlAst; trace.push(res)
        if (res.preFetchCols != null) c = c.setVars({ preFetchCols: res.preFetchCols })
        if (res.prefetchPlan) c = c.setVars({ prefetchPlan: res.prefetchPlan })
      }
      const t2 = t()
      const body = await astToSql(sqlAst, c)
      for (const mod of chain) if (mod.modifyPrelude) prelude = await mod.modifyPrelude(prelude, c)
      const duckFlags = chain.map(m => m.duckFlags?.(c) || '').join('')
      const out = (prelude ? prelude + ';\n' : '') + body
      const t3 = t()
      const ms = { total: t3 - t0, nodesMs: t1 - t0, foldMs: t2 - t1, serializeMs: t3 - t2 }
      const explanation = trace.map(r => r.expansions ? rewriteDigest(out, r.expansions, r.marks) : r.explanation).filter(Boolean)
      logger?.info?.({ t: 'sqlEditor.compile', ms, in: sql, out, explanation }, {}, { ctx })
      ctx.vars.fullSqlModifierLogger?.info?.({ t: 'sqlEditor.compile.ast', in: sql, out, trace }, {}, { ctx })
      return { out, prelude, duckFlags, preFetchCols: c.vars.preFetchCols, prefetchPlan: c.vars.prefetchPlan }
    }
  }
}

async function colsCacheExt(ctx) { const repoRoot = await coreUtils.calcRepoRoot()
  const extensionPath = globalThis.process?.env?.COLS_CACHE_EXT || coreUtils.pathJoin(repoRoot, 'wonder/bi/cols-cache/cols_cache.duckdb_extension')
  ctx?.vars?.colsCacheLogger?.info?.({ t: 'extension.path', repoRoot, extensionPath, cwd: process.cwd() }, {}, { ctx })
  return extensionPath
}

const browserRangeUrl = url => {
  const parsed = !coreUtils.isNode && url.startsWith('https://storage.googleapis.com/') && new URL(url)
  return parsed ? `${location.origin}/gcs-proxy/${parsed.pathname.slice(1)}${parsed.search}` : url
}
// C++ uses fullyResolvedUrl; browser hooks map it to a browser-fetchable URL.
function colsCacheFrom(infos, table = 'cols_cache') {
  const arr = Array.isArray(infos) ? infos : [infos]
  const urls = biUtils.colsCacheUrls ||= {}
  arr.forEach(i => { if (i.resolved && /^https?:\/\//.test(i.resolved)) urls[i.fullyResolvedUrl] = browserRangeUrl(i.resolved) })
  return `${table}([${arr.map(i => quoteLiteral(i.fullyResolvedUrl)).join(',')}])`
}

async function runDuckdb(sql, ctx) { return runDuckdbSqlByHost(sql, ctx, { as: 'rows' }) }

async function sqlColumnRefCols(expr, name, ctx) {
  const ast = await sqlParseKeepLoc(SEL + expr, ctx), cols = []
  eachNode(ast, n => { if (n.class === 'COLUMN_REF' && n.column_names?.length === 1 && n.column_names[0] === name) cols.push(n.query_location - SEL.length) }, ctx)
  return cols
}

function visitSqlAst(node, fn, ctx, inSelect = false) {
  return Array.isArray(node) ? node.map(n => visitSqlAst(n, fn, ctx, inSelect))
    : node && typeof node === 'object'
      ? fn(Object.fromEntries(Object.entries(node).map(([k, v]) => [k, visitSqlAst(v, fn, ctx, k === 'select_list')])), inSelect, ctx)
      : node
}

async function toNodes(exprByName, ctx) {
  const entries = Object.entries(exprByName)
  if (!entries.length) return {}
  const list = (await parseSqlAst(`select ${entries.map(([n, e]) => `${e} AS ${n}`).join(', ')}`, ctx)).statements[0].node.select_list
  return Object.fromEntries(entries.map(([n], i) => [n, list[i]]))
}

function mapMacroSql({ as, key, value, path }) {
  const parquet = /\.parquet$/i.test(path)
  const rel = parquet ? `read_parquet(${quoteLiteral(path)})` : `(select unnest(content) rec from read_json(${quoteLiteral(path)}))`
  const [k, v] = parquet ? [key, value] : [`rec.${key}`, `rec.${value}`]
  return { name: as, sql: `create or replace macro ${as}(k) as ((select map(list(${k}), list(${v})) from ${rel})[k])` }
}

async function runDuckdbScalar(sql, ctx) { return runDuckdbSqlByHost(sql, ctx, { as: 'value' }) }

Object.assign(biUtils, { colsCacheExt, runDuckdbSqlByHost, runDuckdb, runDuckdbScalar, sqlEditor,
  sqlColumnRefCols, parseSqlAst, astToSql, checkTimePredicate, visitSqlAst, eachNode, toNodes, readSourceFiles, colsCacheFrom,
  mapMacroSql, clearDuckdbCache })
