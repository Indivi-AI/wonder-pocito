//  Q   strat       ORIGINAL ClickBench query  ⇒  TEMPLATE (skeleton + {flex params} the client turns per call)
//  Q00 fold        SELECT COUNT(*) FROM hits
//                    ⇒ SELECT COUNT(*) FROM hits                                                          (no knob; single scalar, grows as data appends)
//  Q01 fold        SELECT COUNT(*) FROM hits WHERE AdvEngineID <> 0
//                    ⇒ SELECT COUNT(*) WHERE {col} <> {val}                                               audit a different dimension/sentinel
//  Q02 fold        SELECT SUM(AdvEngineID), COUNT(*), AVG(ResolutionWidth) FROM hits
//                    ⇒ SELECT SUM({a}), COUNT(*), AVG({b})                                                 swap which numeric cols the summary card sums/avgs
//  Q03 fold        SELECT AVG(UserID) FROM hits
//                    ⇒ SELECT AVG({col})                                                                   single-metric probe; {col} per metric of interest
//  Q04 sketchFold  SELECT COUNT(DISTINCT UserID) FROM hits
//                    ⇒ SELECT COUNT(DISTINCT {col})                                                        unique-cardinality KPI; {col}=entity        — HLL union
//  Q05 sketchFold  SELECT COUNT(DISTINCT SearchPhrase) FROM hits
//                    ⇒ SELECT COUNT(DISTINCT {col})                                                        (Q04 template, {col}=SearchPhrase)          — HLL union
//  Q06 fold        SELECT MIN(EventDate), MAX(EventDate) FROM hits
//                    ⇒ SELECT MIN({col}), MAX({col})                                                       data-range probe; {col} bounds any column
//  Q07 fold        SELECT AdvEngineID, COUNT(*) FROM hits WHERE AdvEngineID<>0 GROUP BY AdvEngineID ORDER BY COUNT(*) DESC
//                    ⇒ SELECT {k}, COUNT(*) WHERE {k}<>{v} GROUP BY {k} ORDER BY COUNT(*) DESC             drill a different breakdown dimension {k}
//  Q08 sketchFold  SELECT RegionID, COUNT(DISTINCT UserID) AS u FROM hits GROUP BY RegionID ORDER BY u DESC LIMIT 10
//                    ⇒ SELECT {k}, COUNT(DISTINCT {m}) AS u GROUP BY {k} ORDER BY u DESC LIMIT {n}         {k}=pivot dim, {n}=page size                 — HLL/group
//  Q09 sketchFold  SELECT RegionID, SUM(AdvEngineID),COUNT(*) AS c,AVG(ResolutionWidth),COUNT(DISTINCT UserID) FROM hits GROUP BY RegionID ORDER BY c DESC LIMIT 10
//                    ⇒ SELECT {k}, SUM(..),COUNT(*),AVG(..),COUNT(DISTINCT {m}) GROUP BY {k} LIMIT {n}     {k}=pivot the analyst rotates                — HLL+folds
//  Q10 sketchFold  SELECT MobilePhoneModel, COUNT(DISTINCT UserID) AS u FROM hits WHERE MobilePhoneModel<>'' GROUP BY MobilePhoneModel ORDER BY u DESC LIMIT 10
//                    ⇒ SELECT {k}, COUNT(DISTINCT {m}) AS u WHERE {k}<>'' GROUP BY {k} .. LIMIT {n}        {k} swaps per categorical dimension          — HLL/group
//  Q11 sketchFold  SELECT MobilePhone, MobilePhoneModel, COUNT(DISTINCT UserID) AS u FROM hits WHERE MobilePhoneModel<>'' GROUP BY MobilePhone,MobilePhoneModel ORDER BY u DESC LIMIT 10
//                    ⇒ SELECT {k1},{k2}, COUNT(DISTINCT {m}) GROUP BY {k1},{k2} .. LIMIT {n}               add/remove a second grouping column          — HLL/group
//  Q12 fold        SELECT SearchPhrase, COUNT(*) AS c FROM hits WHERE SearchPhrase<>'' GROUP BY SearchPhrase ORDER BY c DESC LIMIT 10
//                    ⇒ SELECT {k}, COUNT(*) AS c WHERE {k}<>'' GROUP BY {k} ORDER BY c DESC LIMIT {n}      canonical top-k: {k}=dim, {n}=rows shown
//  Q13 sketchFold  SELECT SearchPhrase, COUNT(DISTINCT UserID) AS u FROM hits WHERE SearchPhrase<>'' GROUP BY SearchPhrase ORDER BY u DESC LIMIT 10
//                    ⇒ SELECT {k}, COUNT(DISTINCT {m}) AS u GROUP BY {k} ORDER BY u DESC LIMIT {n}         top-k by DISTINCT users; {k} swaps          — HLL/group
//  Q14 fold        SELECT SearchEngineID, SearchPhrase, COUNT(*) AS c FROM hits WHERE SearchPhrase<>'' GROUP BY SearchEngineID,SearchPhrase ORDER BY c DESC LIMIT 10
//                    ⇒ SELECT {k1},{k2}, COUNT(*) AS c GROUP BY {k1},{k2} ORDER BY c DESC LIMIT {n}        two-key top-k; grouping cols rotate
//  Q15 fold        SELECT UserID, COUNT(*) FROM hits GROUP BY UserID ORDER BY COUNT(*) DESC LIMIT 10
//                    ⇒ SELECT {k}, COUNT(*) GROUP BY {k} ORDER BY COUNT(*) DESC LIMIT {n}                  heavy-hitter detection; {k}=entity
//  Q16 fold        SELECT UserID, SearchPhrase, COUNT(*) FROM hits GROUP BY UserID,SearchPhrase ORDER BY COUNT(*) DESC LIMIT 10
//                    ⇒ SELECT {k1},{k2}, COUNT(*) GROUP BY {k1},{k2} ORDER BY COUNT(*) DESC LIMIT {n}      top pairs; second key added for cross-tab
//  Q17 fold        SELECT UserID, SearchPhrase, COUNT(*) FROM hits GROUP BY UserID,SearchPhrase LIMIT 10
//                    ⇒ SELECT {k1},{k2}, COUNT(*) GROUP BY {k1},{k2} LIMIT {n}                             NO order → sample of {n} groups (fold-all)
//  Q18 fullScan    SELECT UserID, extract(minute FROM EventTime) AS m, SearchPhrase, COUNT(*) FROM hits GROUP BY UserID,m,SearchPhrase ORDER BY COUNT(*) DESC LIMIT 10
//                    ⇒ SELECT {k}, extract({unit} FROM {tcol}) AS m, {k2}, COUNT(*) GROUP BY .. LIMIT {n}  {unit} toggle — extract() key ⇒ NOT pre-keyable
//  Q19 randomAccess SELECT UserID FROM hits WHERE UserID = 435090932899640449
//                    ⇒ SELECT {col} FROM hits WHERE {key} = {id}                                           {id} changes EVERY request — valueMap point lookup
//  Q20 fold        SELECT COUNT(*) FROM hits WHERE URL LIKE '%google%'
//                    ⇒ SELECT COUNT(*) WHERE {col} LIKE {pat}                                              {pat}=typed term (count folds; LIKE re-filters)
//  Q21 fold        SELECT SearchPhrase, MIN(URL), COUNT(*) AS c FROM hits WHERE URL LIKE '%google%' AND SearchPhrase<>'' GROUP BY SearchPhrase ORDER BY c DESC LIMIT 10
//                    ⇒ SELECT {k}, MIN({r}), COUNT(*) AS c WHERE {col} LIKE {pat} GROUP BY {k} .. LIMIT {n} {pat}=filter term, {k}=breakdown dim
//  Q22 sketchFold  SELECT SearchPhrase, MIN(URL),MIN(Title), COUNT(*) AS c, COUNT(DISTINCT UserID) FROM hits WHERE Title LIKE '%Google%' AND URL NOT LIKE '%.google.%' AND SearchPhrase<>'' GROUP BY SearchPhrase ORDER BY c DESC LIMIT 10
//                    ⇒ SELECT {k}, MIN(..),MIN(..), COUNT(*), COUNT(DISTINCT {m}) WHERE {c} LIKE {p1} ..   include/exclude {p1}/{p2} tuned            — HLL/group
//  Q23 boundedMerge SELECT * FROM hits WHERE URL LIKE '%google%' ORDER BY EventTime LIMIT 10
//                    ⇒ SELECT * FROM hits WHERE {col} LIKE {pat} ORDER BY {tcol} {dir} LIMIT {n}           raw-row drill-in (SELECT *); LIMIT ⇒ cache n rows, merge-truncate
//  Q24 boundedMerge SELECT SearchPhrase FROM hits WHERE SearchPhrase<>'' ORDER BY EventTime LIMIT 10
//                    ⇒ SELECT {col} WHERE {col}<>'' ORDER BY {tcol} LIMIT {n}                              latest-{n} by time; LIMIT ⇒ cache n rows, merge-truncate
//  Q25 boundedMerge SELECT SearchPhrase FROM hits WHERE SearchPhrase<>'' ORDER BY SearchPhrase LIMIT 10
//                    ⇒ SELECT {col} WHERE {col}<>'' ORDER BY {col} LIMIT {n}                               same values sorted LEXICALLY — sort-key toggle
//  Q26 boundedMerge SELECT SearchPhrase FROM hits WHERE SearchPhrase<>'' ORDER BY EventTime, SearchPhrase LIMIT 10
//                    ⇒ SELECT {col} WHERE {col}<>'' ORDER BY {t1},{t2} LIMIT {n}                           composite-sort feed; client adds a tiebreaker
//  Q27 fold        SELECT CounterID, AVG(length(URL)) AS l, COUNT(*) AS c FROM hits WHERE URL<>'' GROUP BY CounterID HAVING COUNT(*)>100000 ORDER BY l DESC LIMIT 25
//                    ⇒ SELECT {k}, AVG(length({s})) AS l, COUNT(*) AS c GROUP BY {k} HAVING COUNT(*)>{thr} {thr}=min-volume cutoff raised/lowered
//  Q28 fullScan    SELECT REGEXP_REPLACE(Referer,'^https?://..','\1') AS k, AVG(length(Referer)) AS l, COUNT(*) AS c, MIN(Referer) FROM hits WHERE Referer<>'' GROUP BY k HAVING COUNT(*)>100000 ORDER BY l DESC LIMIT 25
//                    ⇒ SELECT REGEXP_REPLACE({s},{re},{rep}) AS k, AVG(..), COUNT(*) GROUP BY k HAVING ..  {re} redefines the key ⇒ derived key, NOT pre-keyable
//  Q29 fold        SELECT SUM(ResolutionWidth), SUM(ResolutionWidth+1), .. SUM(ResolutionWidth+89) FROM hits
//                    ⇒ SELECT SUM({m}+{i}) for i in 0..{N}                                                 {N}=number of shifted-sum columns (width knob)
//  Q30 fold        SELECT SearchEngineID, ClientIP, COUNT(*) AS c, SUM(IsRefresh), AVG(ResolutionWidth) FROM hits WHERE SearchPhrase<>'' GROUP BY SearchEngineID,ClientIP ORDER BY c DESC LIMIT 10
//                    ⇒ SELECT {k1},{k2}, COUNT(*), SUM({a}), AVG({b}) GROUP BY {k1},{k2} ORDER BY c LIMIT  multi-metric top-k by pair; keys+filter rotate
//  Q31 fold        SELECT WatchID, ClientIP, COUNT(*) AS c, SUM(IsRefresh), AVG(ResolutionWidth) FROM hits WHERE SearchPhrase<>'' GROUP BY WatchID,ClientIP ORDER BY c DESC LIMIT 10
//                    ⇒ (Q30 template with {k1}=WatchID and a WHERE {f}<>'' filter)                         different {k1}; the {f} filter is itself the flex point
//  Q32 fold        SELECT WatchID, ClientIP, COUNT(*) AS c, SUM(IsRefresh), AVG(ResolutionWidth) FROM hits GROUP BY WatchID,ClientIP ORDER BY c DESC LIMIT 10
//                    ⇒ (Q31 template WITHOUT the filter)                                                   Q31/Q32 differ only by the {f} predicate
//  Q33 fold        SELECT URL, COUNT(*) AS c FROM hits GROUP BY URL ORDER BY c DESC LIMIT 10
//                    ⇒ SELECT {k}, COUNT(*) AS c GROUP BY {k} ORDER BY c DESC LIMIT {n}                    representative top-k; {k}=high-card dimension
//  Q34 fullScan    SELECT 1, URL, COUNT(*) AS c FROM hits GROUP BY 1, URL ORDER BY c DESC LIMIT 10
//                    ⇒ SELECT {lit}, {k}, COUNT(*) GROUP BY {lit},{k} ORDER BY c DESC LIMIT {n}            constant {lit} select item ⇒ NOT a foldable column key
//  Q35 fullScan    SELECT ClientIP, ClientIP-1, ClientIP-2, ClientIP-3, COUNT(*) AS c FROM hits GROUP BY ClientIP,ClientIP-1,ClientIP-2,ClientIP-3 ORDER BY c DESC LIMIT 10
//                    ⇒ SELECT {k}, {k}-1, {k}-2, {k}-3, COUNT(*) GROUP BY ..                               arithmetic {k}-i ⇒ derived key, NOT pre-keyable
//  Q36 fold        SELECT URL, COUNT(*) AS PageViews FROM hits WHERE CounterID=62 AND EventDate>='2013-07-01' AND EventDate<='2013-07-31' AND DontCountHits=0 AND IsRefresh=0 AND URL<>'' GROUP BY URL ORDER BY PageViews DESC LIMIT 10
//                    ⇒ SELECT {k}, COUNT(*) AS pv WHERE CounterID={cid} AND EventDate BETWEEN {d1} {d2} .. THE dashboard query: {cid}+{date window} move EVERY view
//  Q37 fold        SELECT Title, COUNT(*) AS PageViews FROM hits WHERE CounterID=62 AND EventDate>='2013-07-01' AND EventDate<='2013-07-31' AND DontCountHits=0 AND IsRefresh=0 AND Title<>'' GROUP BY Title ORDER BY PageViews DESC LIMIT 10
//                    ⇒ (Q36 template with {k}=Title)                                                       same dashboard, different breakdown {k}
//  Q38 fold        SELECT URL, COUNT(*) AS PageViews FROM hits WHERE CounterID=62 AND EventDate>='2013-07-01' AND EventDate<='2013-07-31' AND IsRefresh=0 AND IsLink<>0 AND IsDownload=0 GROUP BY URL ORDER BY PageViews DESC LIMIT 10 OFFSET 1000
//                    ⇒ (Q36 template + OFFSET {o})                                                         adds pagination; {o} increments as client pages
//  Q39 fullScan    SELECT TraficSourceID, SearchEngineID, AdvEngineID, CASE WHEN (SearchEngineID=0 AND AdvEngineID=0) THEN Referer ELSE '' END AS Src, URL AS Dst, COUNT(*) AS PageViews FROM hits WHERE .. GROUP BY .. ,Src,Dst ORDER BY PageViews DESC LIMIT 10 OFFSET 1000
//                    ⇒ SELECT .., CASE WHEN .. THEN Referer ELSE '' END AS Src, COUNT(*) ..               CASE-derived {Src} ⇒ not a stored column, NOT pre-keyable
//  Q40 fold        SELECT URLHash, EventDate, COUNT(*) AS PageViews FROM hits WHERE .. TraficSourceID IN (-1,6) AND RefererHash=3594120000172545465 GROUP BY URLHash,EventDate ORDER BY PageViews DESC LIMIT 10 OFFSET 100
//                    ⇒ SELECT {k1}, EventDate, COUNT(*) WHERE .. TraficSourceID IN {set} AND RefererHash={h} {set}/{h} change per referer inspected
//  Q41 fold        SELECT WindowClientWidth, WindowClientHeight, COUNT(*) AS PageViews FROM hits WHERE .. URLHash=2868770270353813622 GROUP BY WindowClientWidth,WindowClientHeight ORDER BY PageViews DESC LIMIT 10 OFFSET 10000
//                    ⇒ SELECT {k1},{k2}, COUNT(*) WHERE .. URLHash={h} GROUP BY .. OFFSET {o}              {h}=the specific URL clicked into
//  Q42 fullScan    SELECT DATE_TRUNC('minute', EventTime) AS M, COUNT(*) AS PageViews FROM hits WHERE .. GROUP BY DATE_TRUNC('minute', EventTime) ORDER BY M LIMIT 10 OFFSET 1000
//                    ⇒ SELECT DATE_TRUNC({unit},{tcol}) AS M, COUNT(*) WHERE EventDate BETWEEN {d1} {d2}   {unit}=zoom grain — date_trunc-as-KEY ⇒ NOT pre-keyable
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// CACHE SIZE per plan — what the cached state costs, and the literature that proves the bound. Symbols read from
// columnStats: G = #distinct group-key tuples (∏ ndv of GROUP BY cols, 1 if none); m = #metrics; ndv = distinct values
// of a column; R = numRowGroups; n = the LIMIT value; w = a value/row width in bytes.
//
//  plan          cached state                    cache size            bounded by     literature (why the bound holds)
//  ────────────  ──────────────────────────────  ────────────────────  ─────────────  ───────────────────────────────────────────
//  fold          scalar / group×metric           G · m · w             schema (G,m)   Gray'97 DATA CUBE: COUNT/SUM/MIN/MAX are
//                (avg = the (sum,count) pair)                                          DISTRIBUTIVE/ALGEBRAIC ⇒ constant-bound
//                                                                                      sub-aggregate; IVM merges a delta, never
//                                                                                      re-reads base (Duke IVM notes).
//  sketchFold    HLL sketch / group              G · 12KB (p=14)        schema (G)     Gray'97: COUNT(DISTINCT) is HOLISTIC — NO
//                (exact set only if ndv tiny)     (exact: G · ndv · w)                  constant bound on exact sub-aggregate;
//                                                                                      HLL restores it: 2^14 registers = 12KB for
//                                                                                      ±0.81% error, 1..2^64 (Heule'13, Redis).
//  limit         the n result rows               n · w                 query (n)      Yi/Yu/Yang'03 materialized top-k views:
//                                                                                      keep exactly k tuples, ⊕ = merge sorted
//                                                                                      lists then truncate to k.
//  randomAccess  valueMap {keyValue→rowGroupId}  ndv(key) · (w+log2 R)  DATA (grows!)  no constant bound — one entry per distinct
//                                                                                      key; only pays off when selectivity→1
//                                                                                      (near-unique), else map ≈ #rows.
//  fullScan      nothing                          0                     —              mutable source; any cache invalidatable.
//
// The ONE plan whose cache grows with the data is randomAccess (its map is one row per distinct key) — hence the
// selectivity gate. fold/sketchFold/limit are all bounded by schema constants (G, 12KB, n), independent of appended rows.
// Sources: Gray et al., "Data Cube" (distributive/algebraic/holistic classes); Heule et al. 2013 "HyperLogLog in
// Practice"; Yi, Yu, Yang 2003 "Efficient Maintenance of Materialized Top-k Views".
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
import { dsls, jb } from '@jb6/core'
import '@jb6/common'
import './duckdb-utils.js'   // biUtils.parseSqlAst (SQL → DuckDB AST) — the only thing the classifier needs

const { tgp: { TgpType }, common: { Data } } = dsls
const biUtils = jb.biUtils ||= {}

// ── the foldable monoid: agg SQL-name → how partial results combine across periods. avg is NOT a monoid on its own,
// so it decomposes into the (sum,count) pair — the honest reason avg needs a special foldState, not a single column.
const MONOID = { count_star: 'sum', count: 'sum', sum: 'sum', min: 'min', max: 'max' }   // partial ⊕ across periods
const foldableAgg = fn => fn && (fn.function_name in MONOID)

// selectivity(metadata, col) — 0..1 uniqueness (→1 near-unique = an index key; →0 low-card = indexing prunes nothing).
// The SQL can't say this; the db-metadata-extractor already derived it per column (from distinctCount or the
// compression ratio). The classifier just READS it — it does not re-crunch the footer.
const selectivity = (metadata, col) => metadata?.columns?.[col]?.selectivity ?? null

// classify one select_list node → { key } | { agg } | { sketch } | { avg } | { unfoldable }. The whole "how do we fold it" test.
function classifyCol(node) {
  if (node.class === 'STAR') return { kind: 'key', name: '*', alias: '*' }   // SELECT * → all columns of the matched rows: a ROW query, not an aggregate
  if (node.class === 'COLUMN_REF') return { kind: 'key', name: node.column_names.at(-1), alias: node.alias || node.column_names.at(-1) }
  if (node.class !== 'FUNCTION') return { kind: 'unfoldable', reason: 'non-column non-agg expression' }
  const fn = node.function_name, alias = node.alias || fn, field = node.children?.[0]?.column_names?.at(-1)
  if (node.distinct) return { kind: 'sketch', alias, field, fn }             // COUNT(DISTINCT) → HLL, union across periods
  if (fn === 'avg') return { kind: 'avg', alias, field }                     // → checkpoint (sum,count), divide at read
  if (foldableAgg(node)) return { kind: 'agg', alias, field, combine: MONOID[fn], fn }
  return { kind: 'unfoldable', reason: `${fn} is not a commutative monoid` }
}

// pull the SELECT node + the classified shape out of an already-parsed DuckDB AST (the {statements:[...]} object
// cubeQuery stages as ctx.vars.compiledSqlAst after compile). Pure structural read — no parse, no execution, no LLM.
function shapeOf(ast) {
  const node = ast.statements[0].node
  const cols = (node.select_list || []).map(classifyCol)
  const orderMod = (node.modifiers || []).find(m => m.type === 'ORDER_MODIFIER')
  const limitMod = (node.modifiers || []).find(m => m.type === 'LIMIT_MODIFIER')
  const firstOrder = orderMod?.orders?.[0]
  const eq = node.where_clause?.type === 'COMPARE_EQUAL' && node.where_clause   // WHERE {col} = {const} → a point predicate
  return {
    node, cols,
    key: eq?.left?.column_names?.at(-1),                         // the column pinned to a single value (valueMap point-lookup key)
    keys: cols.filter(c => c.kind === 'key').map(c => c.name),
    aggs: cols.filter(c => c.kind === 'agg' || c.kind === 'avg'),
    sketches: cols.filter(c => c.kind === 'sketch'),
    unfoldable: cols.filter(c => c.kind === 'unfoldable'),
    hasAgg: cols.some(c => c.kind !== 'key'),                    // any non-key select item ⇒ aggregate query, not row-level
    orderByAlias: firstOrder?.expression?.column_names?.at(-1),
    limit: limitMod?.limit?.value?.value ?? null
  }
}

// A plan reads its inputs off the ctx cubeQuery already staged: ctx.vars.compiledSqlAst (the post-editor.compile AST)
// and ctx.vars.columnStats (the footer). match(ctx) → verdict {family, key?} | null.
const Plan = TgpType('append-only-plan', 'bi', {
  typescript: `() => { match(ctx<compiledSqlAst,columnStats>): { family, key? } | null }`
})

// ── the plans, most-specific → fallback. Each match(ctx) reads ctx.vars.compiledSqlAst / .columnStats and returns the
// verdict {family, key?} or null. The SQL shape picks the family; columnStats supplies the uniqueness the SQL can't. ──

// fold — every select item is a commutative monoid (count/sum/min/max, avg=sum+count). Keep {key → scalar}, ⊕ per period.
const fold = Plan('fold', {
  impl: () => ({
    match(ctx) {
      const s = shapeOf(ctx.vars.compiledSqlAst)
      if (s.unfoldable.length || s.sketches.length || !s.aggs.length) return null
      return { family: 'fold', groupKey: s.keys }
    }
  })
})

// sketchFold — a COUNT(DISTINCT) select item. Distinctness is append-only too, just with a set/HLL state: {key → HLL},
// ⊕ = HLL union. columnStats.ndv(field) picks exact-set (low-NDV) vs HLL (high-NDV) — a size choice, not a correctness one.
const sketchFold = Plan('sketchFold', {
  impl: () => ({
    match(ctx) {
      const s = shapeOf(ctx.vars.compiledSqlAst)
      if (s.unfoldable.length || !s.sketches.length) return null
      return { family: 'sketchFold', groupKey: s.keys, sketchOf: s.sketches.map(k => k.field), selectivity: selectivity(ctx.vars.columnStats, s.sketches[0].field) }
    }
  })
})

// The two row-query plans. For a non-aggregate query we do NOT care about the WHERE/ORDER BY shape — only one thing
// decides the cache: is the result BOUNDED (LIMIT) or UNBOUNDED?

// limit — a non-aggregate query with LIMIT n. Bounded ⇒ trivially append-only: cache the n rows, and on new data re-run
// the same top-n over the appended partition and merge-truncate the two n-row lists (⊕ = merge-by-orderBy, keep n). No
// selectivity, no index, no scan reasoning — LIMIT alone makes it cache-cheap (Q23 SELECT *, Q24-Q26 ORDER BY).
const limit = Plan('limit', {
  impl: () => ({
    match(ctx) {
      const s = shapeOf(ctx.vars.compiledSqlAst)
      if (s.hasAgg || s.limit == null) return null               // aggregate ⇒ a fold/sketch owns it; no LIMIT ⇒ unbounded
      return { family: 'limit', limit: s.limit, orderBy: s.orderByAlias }
    }
  })
})

// randomAccess — a non-aggregate query with WHERE key = {id} and no LIMIT (Q19). Unbounded, so the limit cache doesn't
// apply; we seek by value. We map key → rowGroupId in a tiny companion parquet and embed it so DuckDB's row-group pruning
// skips the rest:  WHERE rowGroupId IN (SELECT rowGroupId FROM read_parquet('key_index.parquet') WHERE keyValue = {id}).
// Gated by selectivity (→1 near-unique = one group; →0 = no pruning).
const randomAccess = Plan('randomAccess', {
  impl: () => ({
    match(ctx) {
      const s = shapeOf(ctx.vars.compiledSqlAst)
      if (s.hasAgg || !s.key) return null
      return { family: 'randomAccess', key: s.key, selectivity: selectivity(ctx.vars.columnStats, s.key) }
    }
  })
})

// fullScan — the floor: reached only when the source is MUTABLE (updated in place). An append-only source never lands here.
const fullScan = Plan('fullScan', {
  impl: () => ({ match() { return { family: 'fullScan' } } })
})

// pickPlan — the priority chain, as a Data comp: run each plan's match(ctx) in order; the first non-null verdict wins.
// The inputs ride on ctx.vars (compiledSqlAst / columnStats) — staged by cubeQuery — so pickPlan just threads its ctx to
// each plan. `plans` is a dynamic param (a list of append-only-plan<bi>): calling it resolves the profiles into their
// impl objects {match}. The default IS the fold→sketchFold→limit→randomAccess→fullScan chain.
Data('pickPlan', {
  params: [
    { id: 'plans', type: 'append-only-plan<bi>[]', dynamic: true,
      defaultValue: [fold(), sketchFold(), limit(), randomAccess(), fullScan()] }
  ],
  impl: (ctx, {}, { plans }) => {
    for (const p of plans()) {
      const v = p.match(ctx)
      if (v) { ctx?.vars?.biLogger?.info?.({ t: 'pickPlan', chosen: v.family }, {}, { ctx }); return v }
    }
  }
})
// parseSql — SQL string → DuckDB AST, the value cubeQuery stages as ctx.vars.compiledSqlAst. Exposed as a Data comp so
// tests can drive the classifier through the same var the real query path uses (setVars compiledSqlAst → pickPlan).
Data('parseSql', {
  params: [{ id: 'sql', as: 'string', mandatory: true }],
  impl: (ctx, {}, { sql }) => biUtils.parseSqlAst(sql, ctx)
})
Object.assign(biUtils, { shapeOf, classifyCol, selectivity })
