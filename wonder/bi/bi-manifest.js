// bi-manifest.js — manifest partition-pruning: read a …-manifest.json listing {name,lo,hi} partition files, and at query time
// keep only the files a query's WHERE can touch. filesFromManifest reads the json (bind sites in bi-dsl call it); the
// expandManifest sql-modifier prunes + swaps each manifest read_parquet placeholder for the concrete kept-files FROM.
import { dsls, coreUtils, jb } from '@jb6/core'
import './bi-dsl.js'   // SqlModifier type + biUtils (visitSqlAst/parseSqlAst/astToSql/runDuckdbSqlByHost/cacheStrategyOf) already registered
import '@wonder/db/db-drivers.js'
const { wresolve, wfetch2 } = jb.wonderUtils

const { tgp: { TgpType }, bi: { SqlModifier } } = dsls
const biUtils = jb.biUtils
const { cacheStrategyOf, parseSqlAst, astToSql, visitSqlAst, runDuckdbSqlByHost } = biUtils

const sqlToNode = async (sql, ctx) => (await parseSqlAst(`select ${sql}`, ctx)).statements[0].node.select_list[0]

// the manifest read_parquet(['k']) is wrapped by cubeQuery as (select * from read_parquet(['k']) where W).
// find, per manifest key, the SELECT node whose from subtree holds that read_parquet, and return its where_clause + the
// relation alias (e.g. star-join's `l`) so a table-qualified predicate (`l.sale_date`) can bind in pruneManifest's probe.
function whereClauseByManifest(sqlAst, keys, ctx) {
  // the manifest read_parquet is the `function` child of a TABLE_FUNCTION FROM entry; the relation alias (star-join's `l`)
  // lives on that wrapper, never on the read_parquet leaf (whose alias is always ''). match the wrapper, take its alias.
  const isManifestRead = (n, k) => n?.function?.function_name === 'read_parquet' && n.function.children?.[0]?.children?.[0]?.value?.value === k
  const aliasHolding = (node, k) => { let a; visitSqlAst(node, n => (isManifestRead(n, k) && (a = n.alias || true), n), ctx); return a }
  const out = {}, froms = []
  visitSqlAst(sqlAst, node => {
    if (node?.type === 'SELECT_NODE' && node.where_clause)
      keys.forEach(k => { const a = !out[k] && aliasHolding(node.from_table, k); if (a) out[k] = { whereNode: node.where_clause, alias: typeof a === 'string' ? a : null } })
    if (node?.type === 'TABLE_FUNCTION') froms.push({ read: node.function?.function_name, arg: node.function?.children?.[0]?.children?.[0]?.value?.value, alias: node.alias })
    return node
  }, ctx)
  // each manifest key must find a WHERE-carrying SELECT whose FROM holds its read_parquet; unmatched ⇒ pruneManifest bails
  // (no whereNode) ⇒ every partition scanned. `froms` lists the TABLE_FUNCTION entries (arg + relation alias) actually seen.
  ctx?.vars?.manifestLogger?.info?.({ event: 'whereClauseByManifest', matched: Object.keys(out).map(k => ({ key: k, alias: out[k].alias })), unmatched: keys.filter(k => !out[k]), froms }, {}, { ctx })
  return out
}
// split a WHERE AST into its top-level AND conjuncts (CONJUNCTION_AND flattened; anything else is one conjunct)
const andConjuncts = n => n?.type === 'CONJUNCTION_AND' ? n.children.flatMap(andConjuncts) : n ? [n] : []
// column names a conjunct references (COLUMN_REF leaves, last name part = the bare column)
const colsOf = (n, ctx) => { const s = new Set(); visitSqlAst(n, x => (x?.class === 'COLUMN_REF' && x.column_names?.length && s.add(x.column_names.at(-1)), x), ctx); return [...s] }
async function pruneManifest(files, field = 'startTime', where, byExpr = {}, log, ctx) {
  const names = files.map(f => f.name)
  if (!where?.whereNode || !files[0]?.lo) return names
  // keep only conjuncts the probe can evaluate — those naming just `field` + byExpr aliases. dropping the rest is a safe
  // superset (pruning WHERE only ever removes files), so a compound header WHERE (h.sale_date AND h.DateDoc between r.*) prunes on the literal alone.
  const available = new Set([field, ...Object.keys(byExpr)])
  const evaluable = andConjuncts(where.whereNode).filter(c => colsOf(c, ctx).every(col => available.has(col)))
  if (!evaluable.length) { log?.info?.({ event: 'manifestPrune skip', reason: 'no evaluable conjunct', where: colsOf(where.whereNode, ctx) }, {}, { ctx }); return names }
  const whereNode = evaluable.reduce((a, b) => ({ type: 'CONJUNCTION_AND', class: 'CONJUNCTION', children: [a, b] }))
  const tmpl = await parseSqlAst('select * where TRUE', ctx)   // real SELECT node (has cte_map etc.); swap its where_clause and re-serialize
  tmpl.statements[0].node.where_clause = whereNode
  const whereSql = (await astToSql(tmpl, ctx)).replace(/^\s*SELECT\s+\*\s+WHERE\s+/i, '')
  const rows = files.map(f => `('${f.name}','${f.lo}'::TIMESTAMP,'${f.hi}'::TIMESTAMP)`).join(',')
  const aliasSel = Object.entries(byExpr).filter(([a]) => a !== field && new RegExp(`\\b${a}\\b`).test(whereSql)).map(([a, e]) => `, ${e} AS ${a}`).join('')
  const relAlias = where.alias ? ` ${where.alias}` : ''   // give the probe source the manifest relation's alias so `alias.field` predicates bind
  const sql = `WITH files(name,lo,hi) AS (VALUES ${rows}),
    probe AS (SELECT name, lo AS ${field} FROM files UNION ALL SELECT name, hi - INTERVAL 1 MICROSECOND FROM files)
    SELECT DISTINCT name FROM (SELECT name, ${field}${aliasSel} FROM probe)${relAlias} WHERE ${whereSql}`
  const { stdout, error, stderr } = await runDuckdbSqlByHost(sql, ctx, { as: 'raw' })
  const kept = error ? names : (stdout || []).map(r => r.name)   // probe failed (non-time predicate etc.) → keep all
  log?.info?.({ event: 'manifestPrune', where: whereSql, kept, of: names.length, dropped: names.filter(n => !kept.includes(n)), sql, error: error && stderr?.slice(0, 200) }, {}, { ctx })
  return kept
}
SqlModifier('expandManifest', {
  impl: () => ({ isBuiltIn: true, phase: 'rewriteSource', async modifyAst(sqlAst, ctx) {   // after every FROM source (star join / implicit-FROM) exists → swap the manifest read_parquet node
    const log = ctx.vars.manifestLogger, manifest = ctx.vars.compileArgs.manifest || {}, keys = Object.keys(manifest), expanded = []
    log?.info?.({ event: 'enter', keys, counts: keys.map(k => manifest[k].names.length) }, {}, { ctx })
    if (!keys.length) return { sqlAst }
    const whereByManifest = await whereClauseByManifest(sqlAst, keys, ctx)   // the WHERE wrapping each manifest FROM (baked at cubeQuery:455)
    const byExpr = ctx.vars.compileArgs.byExpr || {}                    // alias→sql defs, so a WHERE on a derived column resolves in the probe
    const nodeByManifest = Object.fromEntries(await Promise.all(keys.map(async k => {
      const { wDirUrl, names, files, field } = manifest[k]
      const kept = await pruneManifest(files, field, whereByManifest[k], byExpr, log, ctx)
      const { sql, via } = await cacheStrategyOf(ctx).buildSourceReader(kept.map(n => `${wDirUrl}${n}.parquet`), ctx)   // strategy owns the FROM (colsCache byte-range/mmap, noCache/fullFileCache native read)
      log?.info?.({ event: 'manifestSql', manifest: k, cacheStrategy: ctx.vars.cacheStrategy || 'colsCache', via, kept: kept.length, of: names.length, sql }, {}, { ctx })
      return [k, await sqlToNode(sql, ctx)]
    })))
    const ast = visitSqlAst(structuredClone(sqlAst), node => {
      const c = node.function_name === 'read_parquet' && node.children?.[0]?.function_name === 'list_value' && node.children[0].children?.[0]
      const repl = c?.class === 'CONSTANT' && nodeByManifest[c.value?.value]
      if (repl) { const k = c.value.value; expanded.push({ from: k, files: manifest[k].names.length, totalBytes: manifest[k].totalBytes }); return { ...structuredClone(repl), alias: node.alias } }
      return node
    }, ctx)
    log?.info?.({ event: 'expanded', expanded }, {}, { ctx })
    return { sqlAst: ast, explanation: expanded.length ? { expandManifest: expanded } : null }
  } })
})

// a manifest (…/manifest/xx-{grain}-manifest.json) → { wDirUrl, names, files }: read the manifest json by its known name (one
// anonymous GET — no dir list, which public buckets deny). `files` are {name, lo?, hi?} entries; `wDirUrl` is the manifest dir
// as a wUrl (scheme://…/), still unresolved — expandManifest resolves each `wDirUrl+name.parquet` per file via colsFrom (db-owned).
async function filesFromManifest(wUrl, ctx) {
  const wDirUrl = wUrl.slice(0, wUrl.lastIndexOf('/') + 1)
  const m = await (await wfetch2(wUrl, { method: 'GET' }, ctx)).json()
  const names = m.files.map(f => f.name)
  ctx?.vars?.manifestLogger?.info?.({ event: 'filesFromManifest', manifest: wUrl, wDirUrl, field: m.field, names }, {}, { ctx })
  return { wDirUrl, names, field: m.field, files: m.files, totalBytes: m.totalBytes }
}

// bindManifestSource: the manifest half of building a FROM. a `-manifest.json` wUrl → { manifestUrl, from, via, entry }:
// bind the read_parquet(['<url>']) placeholder (expandManifest swaps it) + read its files so pruneManifest sees them.
// non-manifest wUrl → null, so the caller falls through to its normal cacheStrategy FROM. shared by resolveSilvers + lookupByWUrl.
async function bindManifestSource(wUrl, ctx) {
  if (!wUrl.endsWith('-manifest.json')) return null
  const manifestUrl = await wresolve(wUrl, ctx)
  return { manifestUrl, from: `read_parquet(['${manifestUrl}'])`, via: 'manifest (expanded at query time)', entry: await filesFromManifest(wUrl, ctx) }
}

Object.assign(biUtils, { filesFromManifest, bindManifestSource })
