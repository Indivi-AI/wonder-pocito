import { dsls, jb } from '@jb6/core'
import '@jb6/testing'
import './finance-cube.js'
import './finance-analytics.js'   // the Ask-AI closure — its jb.workflowUtils writers are guarded below
import { cubeWidgets, widgetSql, widgetWhere, widgetSpec, widgetFilters, unitOf } from '@wonder/bi/cube-widget-builder.js'
import '@wonder/db/db-drivers.js'
const { fullFileCachePopulate } = jb.wonderUtils

const {
  tgp: { 'ctx-enricher': { setupCube, setVars, Var } },
  test: { Test, test: { dataTest } },
  common: { data: { cubeQuery, compileCubeSql, asIs, join }, boolean: { and, equals, notNull, contains } },
  bi: { cube: { financeCube }, report: { financeTopPayers } }
} = dsls

// the cube reads the finance-demo room (mirrored to /tmp/fullFileCache on non-linux); legacy baselines compare it
// against hand-written SQL over the room CSVs, mirrored the same way (Last-Modified-validated, so always fresh)
const legacyCsv = (ctx, persona = 'freelancer') =>
  fullFileCachePopulate(`room://finance-demo/usersRO/data/finance_${persona}_realistic.csv`, ctx, { validate: true })

// the widget-builder engine bound to financeCube — the same one-line binding the demo does (finance-demo.js CW)
const FW = cubeWidgets(financeCube.$run(), { exclude: ['Currency'] })
const userWidgetSql = FW.sql, userWidgetSpec = FW.spec
const userWidgetWhere = (w, f) => FW.where(w, FW.rangeWhere(f.start, f.end))

// run mixed {report}/{sql} entries over the ctx cube (the runFinanceReportBatch lambda's per-entry logic, for node tests)
const runEntries = (ctx, entries) => Promise.all(entries.map(e => {
  const c = ctx.setVars({ ...(e.vars || {}), depth: e.depth || 'medium', cubeWhere: e.where || '' })
  return c.run(e.report ? dsls.bi.report[e.report]() : cubeQuery(e.sql))
}))

// the demo's hand-written topSql (finance-demo.js REPORTS['top-payers']) — the equivalence baseline
const legacyTopPayersSql = csvPath => `SELECT Description AS "name", ROUND(SUM("Amount (USD)")) AS "value"
FROM read_csv_auto('${csvPath}')
WHERE Direction='in' AND Status='completed' GROUP BY 1 ORDER BY 2 DESC LIMIT 8`

Test('financeCube.topPayersMatchesLegacy', {
  impl: dataTest({
    calculate: async ctx => {
      const cubeRows = await cubeQuery.$runWithCtx(ctx,
        'select Description as "name", money_in as "value" group by 1 having money_in is not null order by 2 desc limit 8')
      const legacyRows = await jb.biUtils.runDuckdb(legacyTopPayersSql(await legacyCsv(ctx)), ctx)
      const [c, l] = [cubeRows, legacyRows].map(rows => rows.map(r => [r.name, +r.value]))
      return { match: JSON.stringify(c) == JSON.stringify(l), rows: c.length, cube: c, legacy: l }
    },
    expectedResult: and(equals(true, '%match%'), equals(8, '%rows%')),
    setup: setupCube(financeCube()),
    timeout: 15000,
    logger: 'biLogger'
  })
})

Test('financeCube.runReportTopPayers', {
  impl: dataTest({
    calculate: financeTopPayers(Var('depth', 'deep')),
    expectedResult: and(
      equals('hbar', '%widgets/0/kind%'),
      equals(8, '%widgets/0/data/length%'),
      notNull('%text%'),
      equals(2, '%followUps/length%')
    ),
    setup: setupCube(financeCube()),
    timeout: 15000,
    logger: 'biLogger'
  })
})

// cubeWhere filters (the setupCube filters / runReportBatch entry.where mechanism) vs the demo's hand-written filtered SQL
Test('financeCube.filteredSummaryMatchesLegacy', {
  impl: dataTest({
    calculate: async ctx => {
      const where = `Date >= DATE '2025-06-01' AND Date <= DATE '2025-06-30' AND Currency = 'USD'`
      const cubeRows = await cubeQuery.$runWithCtx(ctx.setVars({ cubeWhere: where }), 'select money_in as "mi", money_out as "mo", txns as "n"')
      const legacyRows = await jb.biUtils.runDuckdb(`SELECT
  ROUND(SUM(CASE WHEN Direction='in' AND Status='completed' THEN "Amount (USD)" END)) mi,
  ROUND(SUM(CASE WHEN Direction='out' AND Status='completed' THEN "Amount (USD)" END)) mo, COUNT(*) n
FROM read_csv_auto('${await legacyCsv(ctx)}') WHERE ${where}`, ctx)
      return { match: JSON.stringify(cubeRows) == JSON.stringify(legacyRows), cube: cubeRows[0], legacy: legacyRows[0] }
    },
    expectedResult: and(equals(true, '%match%'), notNull('%cube/mi%')),
    setup: setupCube(financeCube()),
    timeout: 15000,
    logger: 'biLogger'
  })
})

// persona '__all__' — the cube's tagged UNION ALL vs the demo's legacy src() consolidation
Test('financeCube.consolidatedTopPayersMatchesLegacy', {
  impl: dataTest({
    calculate: async ctx => {
      const cubeRows = await cubeQuery.$runWithCtx(ctx,
        'select Description as "name", money_in as "value" group by 1 having money_in is not null order by 2 desc limit 8')
      const paths = await Promise.all(['freelancer', 'ecommerce', 'marketplace'].map(p => legacyCsv(ctx, p)))
      const union = paths.map(path => `SELECT * FROM read_csv_auto('${path}')`).join(' UNION ALL ')
      const legacyRows = await jb.biUtils.runDuckdb(`SELECT Description AS "name", ROUND(SUM(CASE WHEN Direction='in' AND Status='completed' THEN "Amount (USD)" END)) AS "value"
FROM (${union}) GROUP BY 1 HAVING "value" IS NOT NULL ORDER BY 2 DESC LIMIT 8`, ctx)
      const [c, l] = [cubeRows, legacyRows].map(rows => rows.map(r => [r.name, +r.value]))
      return { match: JSON.stringify(c) == JSON.stringify(l), rows: c.length, cube: c, legacy: l }
    },
    expectedResult: and(equals(true, '%match%'), equals(8, '%rows%')),
    setup: setupCube(financeCube('__all__')),
    timeout: 20000,
    logger: 'biLogger'
  })
})

// runReportBatch: mixed {report}/{sql} entries, per-entry where + vars (gran), balance subquery over {%$tx%}
Test('financeCube.runReportBatchMixed', {
  impl: dataTest({
    calculate: async ctx => {
      const [sum, vol, bal, n] = await runEntries(ctx, [
        { report: 'financeSummary', where: `Date >= DATE '2025-06-01' AND Date <= DATE '2025-06-30'` },
        { report: 'financeVolume', vars: { gran: 'month' }, where: `Date >= DATE '2025-01-01' AND Date <= DATE '2025-03-31'` },
        { report: 'financeBalance', where: `Date <= DATE '2025-06-30'` },
        { sql: 'select txns as "n"' }
      ])
      return { sumOk: !!(sum?.verified && +sum.rows?.[0]?.money_in > 0), volBuckets: vol?.rows?.length || 0,
        volKind: vol?.widgets?.[0]?.kind, balOk: bal?.rows?.[0]?.v != null, txns: +n?.[0]?.n || 0 }
    },
    expectedResult: and(equals(true, '%sumOk%'), equals(3, '%volBuckets%'), equals('area', '%volKind%'), equals(true, '%balOk%'), equals(1980, '%txns%')),
    setup: setupCube(financeCube()),
    timeout: 30000,
    logger: 'biLogger'
  })
})

// the self-serve widget-builder engine, end to end: every kind's spec {metric, metric2?, dimension, kind, filters?}
// → userWidgetSql/userWidgetWhere → cube compile → duckdb over the sample CSV → userWidgetSpec chart shape
Test('financeCube.userWidgetKinds', {
  impl: dataTest({
    calculate: async ctx => {
      const F = { start: '2025-06-01', end: '2025-06-30' }
      const W = [
        { metric: 'money_in', dimension: 'Description', kind: 'hbar', limit: 5 },
        { metric: 'money_in', metric2: 'money_out', dimension: 'Date', kind: 'line', grain: 'week' },
        { metric: 'money_in', metric2: 'fees', dimension: 'Description', kind: 'bar', limit: 5 },
        { metric: 'money_in', metric2: 'fees', kind: 'kpi' },
        { metric: 'txns', dimension: 'Status', kind: 'table', limit: 10 }
      ]
      const rowsets = await runEntries(ctx, W.map(w => ({ sql: userWidgetSql(w), where: userWidgetWhere(w, F) })))
      const [hbar, line, grouped, kpi, table] = W.map((w, i) => userWidgetSpec({ ...w, title: 't' }, rowsets[i]))
      return { hbar: hbar.kind == 'hbar' && hbar.data.length == 5 && hbar.data[0].value > 0,
        line: line.kind == 'line' && line.series.length == 2 && line.series[0].points.length >= 4,
        grouped: grouped.kind == 'groupedBar' && grouped.series.length == 2 && grouped.categories.length == 5,
        kpi: kpi.kind == 'kpi' && kpi.items.length == 2 && kpi.items[0].value > 0,
        table: table.kind == 'table' && table.columns.length == 2 && table.rows.length >= 2 }
    },
    expectedResult: and(equals(true, '%hbar%'), equals(true, '%line%'), equals(true, '%grouped%'), equals(true, '%kpi%'), equals(true, '%table%')),
    setup: setupCube(financeCube()),
    timeout: 30000,
    logger: 'biLogger'
  })
})

// widget-level filters (userWidgetWhere) vs hand-written duckdb SQL with the same clauses
Test('financeCube.userWidgetFiltersMatchLegacy', {
  impl: dataTest({
    calculate: async ctx => {
      const w = { metric: 'money_in', dimension: 'Description', kind: 'hbar', limit: 5, filters: { 'Counterparty Type': 'marketplace', Status: 'completed' } }
      const cubeRows = await cubeQuery.$runWithCtx(ctx.setVars({ cubeWhere: userWidgetWhere(w, { start: '2025-06-01', end: '2025-06-30' }) }), userWidgetSql(w))
      const legacyRows = await jb.biUtils.runDuckdb(`SELECT Description AS "name", ROUND(SUM(CASE WHEN Direction='in' AND Status='completed' THEN "Amount (USD)" END)) AS "value"
FROM read_csv_auto('${await legacyCsv(ctx)}')
WHERE Date >= DATE '2025-06-01' AND Date <= DATE '2025-06-30' AND "Counterparty Type" = 'marketplace' AND Status = 'completed'
GROUP BY 1 HAVING "value" IS NOT NULL ORDER BY 2 DESC LIMIT 5`, ctx)
      const [c, l] = [cubeRows, legacyRows].map(rows => rows.map(r => [r.name, +r.value]))
      return { match: JSON.stringify(c) == JSON.stringify(l), nonEmpty: c.length > 0, cube: c, legacy: l }
    },
    expectedResult: and(equals(true, '%match%'), equals(true, '%nonEmpty%')),
    setup: setupCube(financeCube()),
    timeout: 15000,
    logger: 'biLogger'
  })
})

// the widget engine is cube-agnostic: drive it with a comax-shaped fake meta (Hebrew dim names, ₪ units, its own
// time column) and assert NO finance vocabulary is needed — pure JS, no duckdb
Test('financeCube.widgetEngineIsGeneric', {
  impl: dataTest({
    calculate: () => {
      const meta = {
        dimensions: [{ name: 'סניף', values: ['תל אביב', 'חיפה'] }, { name: 'fact_date', type: 'timestamp' }, { name: 'Item', guidance: 'unbounded' }],
        metrics: [{ name: 'SalesBase', unit: '₪' }, { name: 'DocCount', unit: 'int' }]
      }
      const sql = widgetSql(meta, { metric: 'SalesBase', dimension: 'fact_date', kind: 'line', grain: 'day' })
      const where = widgetWhere(meta, { filters: { 'סניף': 'חיפה' } }, `fact_date >= DATE '2025-01-01'`)
      const spec = widgetSpec(meta, { metric: 'SalesBase', metric2: 'DocCount', kind: 'kpi', title: 't' }, [{ value: 7, value2: 3 }])
      return {
        timeSql: sql.includes(`date_trunc('day', fact_date)`),
        filterSql: where == `fact_date >= DATE '2025-01-01' AND סניף = 'חיפה'`,
        filtersUi: widgetFilters(meta).length == 1 && widgetFilters(meta)[0].opts[1] == 'חיפה',
        units: unitOf(meta, 'SalesBase') == '₪' && spec.items[0].format == '₪' && spec.items[1].format == 'int'
      }
    },
    expectedResult: and(equals(true, '%timeSql%'), equals(true, '%filterSql%'), equals(true, '%filtersUi%'), equals(true, '%units%')),
    timeout: 5000
  })
})

// the Reports-screen shape: presentation SQL (columns/sort/paging, implicit FROM) + summary + status counts,
// all over one gnarly where (date + direction + ILIKE search with literal %)
Test('financeCube.reportsTableShape', {
  impl: dataTest({
    calculate: async ctx => {
      const tableSql = `select "Transaction ID" as "tid", "Date & Time" as "dt", Date, Direction as "dir", "Transaction Type" as "ttype", Description as "descr", entity,
  "Counterparty Type" as "ctype", Source as "src", Target as "tgt", Amount as "amt", Currency as "cur",
  "Amount (USD)" as "usd", Status as "status", Fee as "fee", "Running Balance" as "bal", "Store Name" as "store",
  "Reference ID" as "refid", "Additional Description" as "addl"
order by "Date & Time" DESC limit 25 offset 0`
      const where = `Date >= DATE '2025-06-01' AND Date <= DATE '2025-06-30' AND Direction = 'in'
        AND ("Transaction ID" ILIKE '%TX%' OR Description ILIKE '%TX%' OR "Store Name" ILIKE '%TX%')`
      const [rows, sum, sc] = await runEntries(ctx, [
        { sql: tableSql, where },
        { sql: 'select txns as "n", money_in as "mi", money_out as "mo"', where },
        { sql: 'select Status as "s", txns as "n" group by 1', where }
      ])
      return { rows: rows.length, hasCols: !!(rows[0]?.tid && rows[0]?.descr && rows[0]?.entity && rows[0]?.status && rows[0]?.Date),
        n: +sum[0]?.n || 0, statusesOk: sc.length >= 1 && sc.every(x => +x.n > 0) }
    },
    expectedResult: and(equals(25, '%rows%'), equals(true, '%hasCols%'), notNull('%n%'), equals(true, '%statusesOk%')),
    setup: setupCube(financeCube()),
    timeout: 30000,
    logger: 'biLogger'
  })
})

// withPrevPeriod: the June window vs its equal-length previous window (May 2 – May 31), prev columns vs hand-written duckdb
Test('financeCube.periodCompare', {
  impl: dataTest({
    calculate: async ctx => {
      const [r] = await runEntries(ctx, [{ report: 'financePeriodCompare', vars: { from: '2025-06-01', to: '2025-06-30' } }])
      const c = r?.rows?.[0] || {}
      const legacy = await jb.biUtils.runDuckdb(`SELECT ROUND(SUM(CASE WHEN Direction='in' AND Status='completed' THEN "Amount (USD)" END)) mi
FROM read_csv_auto('${await legacyCsv(ctx)}') WHERE Date >= DATE '2025-05-02' AND Date <= DATE '2025-05-31'`, ctx)
      return { curOk: +c.mi > 0, prevMatchesLegacy: +c.mi_prev == +legacy[0]?.mi,
        kind: r?.widgets?.[0]?.kind, series: r?.widgets?.[0]?.series?.length, narrativeOk: /vs the previous period/.test(r?.text || '') }
    },
    expectedResult: and(equals(true, '%curOk%'), equals(true, '%prevMatchesLegacy%'), equals('groupedBar', '%kind%'), equals(2, '%series%'), equals(true, '%narrativeOk%')),
    setup: setupCube(financeCube()),
    timeout: 30000,
    logger: 'biLogger'
  })
})

// the two SQL shapes the Ask-AI doclet teaches the LLM (finance-analytics.js essentialOutputFormat.finance):
// a metric x dimension aggregate, and a drill filtered on the clicked value — both with NO FROM clause, so this
// test is what guarantees the model never has to name the dataset.
Test('financeCube.askAiDocletShapes', {
  impl: dataTest({
    calculate: async ctx => {
      const [main, drill] = await runEntries(ctx, [
        { sql: 'select Description as "name", money_in as "value" group by 1 having money_in is not null order by 2 desc limit 5' },
        { sql: `select strftime(date_trunc('month', Date), '%Y-%m') as x, money_in as y where Description = 'Upwork Global Inc' group by 1 order by 1` }
      ])
      return { top: main[0]?.name, topValue: +main[0]?.value || 0, months: drill.length, drillPositive: drill.every(r => +r.y > 0) }
    },
    expectedResult: and(equals('Upwork Global Inc', '%top%'), equals(673124, '%topValue%'), equals(6, '%months%'), equals(true, '%drillPositive%')),
    setup: setupCube(financeCube()),
    timeout: 20000,
    logger: 'biLogger'
  })
})

// REGRESSION: financeSummary selects metrics aliased to their own name (money_in as "money_in"); metricToSql's self-token
// guard must stop that re-expanding into a stack overflow. The batch must compile and return money_in with no cubeQuery failure.
Test('financeCube.selfAliasedMetricsCompile', {
  impl: dataTest({
    calculate: async ctx => {
      const [r] = await runEntries(ctx, [{ report: 'financeSummary', where: `Date <= DATE '2025-06-30'` }])
      const failed = (ctx.vars.biLogger.biLog || []).filter(e => e.event == 'cubeQuery failed')
      return { cubeQueryFailed: failed.length, moneyIn: +r?.rows?.[0]?.money_in || 0 }
    },
    expectedResult: and(equals(0, '%cubeQueryFailed%'), notNull('%moneyIn%')),
    setup: setupCube(financeCube()),
    timeout: 20000,
    logger: 'biLogger'
  })
})

// ── REALM GUARD: the cube must read MY room data correctly in all three realms. Pins two easy-to-"clean-up" contracts:
// duck-db-utils' conditional LOAD (the committed cols_cache binary is linux-only — an unconditional LOAD kills
// every mac/browser query) and resolveFroms' db pin (browser Ask-AI runs with db:'local' — it must NOT re-route the room
// to nonexistent files/rooms). Compile-only where the extension is involved, so it runs on every platform.
Test('financeCube.realmReadPaths', {
  impl: dataTest({
    calculate: async ctx => {
      const cube = ctx.vars.cube, periods = ['_']
      const mirror = (await cube.source.resolveFroms(ctx.setVars({ cacheStrategy: 'fullFileCache' }), periods)).tx   // mac dev / browser LIVE / node tests
      const ext = (await cube.source.resolveFroms(ctx.setVars({ cacheStrategy: 'colsCache' }), periods)).tx          // the room lambda (linux)
      const askAi = (await cube.source.resolveFroms(ctx.setVars({ cacheStrategy: 'fullFileCache', db: 'local' }), periods)).tx   // browser Ask-AI vars
      const mirrorSql = await compileCubeSql.$runWithCtx(ctx, financeCube(), `select count(*) as "n" from ${mirror}`)
      const extSql = await compileCubeSql.$runWithCtx(ctx, financeCube(), `select count(*) as "n" from ${ext}`)
      return {
        mirrorIsLocalFile: mirror.includes('/fullFileCache/') && mirror.includes('finance_freelancer_realistic.parquet'),
        mirrorSqlNoColsCacheLoad: !/cols_cache/i.test(mirrorSql),   // mac must NOT load the linux-only cols_cache ext (cache_httpfs is fine)
        extReadsRoom: ext.includes(`cols_cache(['room:gcs//finance-demo/usersRO/data/finance_freelancer_realistic.parquet'])`),   // cols_cache takes a LIST of wUrls
        extSqlLoadsExtension: /^LOAD /.test(extSql),
        askAiImmuneToLocalDb: askAi.includes('/fullFileCache/') && !askAi.includes('files/rooms')
      }
    },
    expectedResult: and(equals(true, '%mirrorIsLocalFile%'), equals(true, '%mirrorSqlNoColsCacheLoad%'), equals(true, '%extReadsRoom%'),
      equals(true, '%extSqlLoadsExtension%'), equals(true, '%askAiImmuneToLocalDb%')),
    setup: setupCube(financeCube()),
    timeout: 20000,
    logger: 'biLogger,dbLogger'
  })
})

// ── ASK-AI GUARD: the finance-analytics closure fills jb.workflowUtils from THREE writer modules (workflow-core,
// llm-flow-core, llm-summary-step). Each must MERGE (Object.assign) — a bare `jb.workflowUtils = {…}` in any of them
// wipes the other writers' keys in module order and kills Ask-AI with a duckDbSql crash (bit prod once). One key per writer:
Test('financeCube.askAiWorkflowUtilsIntact', {
  impl: dataTest({
    calculate: () => ({
      workflowCore: typeof jb.workflowUtils?.extendWithWorkflowVars == 'function',
      llmFlowCore: typeof jb.workflowUtils?.waitForHumanFeedbackVars == 'function',
      llmSummaryStep: typeof jb.workflowUtils?.llmSummaryText == 'function'
    }),
    expectedResult: and(equals(true, '%workflowCore%'), equals(true, '%llmFlowCore%'), equals(true, '%llmSummaryStep%')),
    timeout: 5000
  })
})

// REPRO: financeCube over a signed-room dataRoot under db:'bucket' whose finance_*.parquet do NOT exist. wresolveInfo stamps
// signedRoom:bucket//… ; colsCacheFrom hands DuckDB that wUrl; colsCacheService's onTail footer fetch gets a 404
// (the same shape as the room:gcs//noop/<date>.parquet failure, just anchored to testSignedRoom's baseWUrl).
Test('financeCube.missingParquetGcs404', {
  impl: dataTest({
    calculate: cubeQuery('select Description as "name", money_in as "value" group by 1 having money_in is not null order by 2 desc limit 8'),
    setup: setupCube(financeCube({ dataRoot: 'signedRoom://testSignedRoom/usersRO/data' })),
    vars: setVars(asIs({ db: 'bucket', bucketProvider: 'gcs', hasGcpIdentity: true, onLiveRepo: true })),
    allowError: true,
    expectedResult: contains('404 for tail', { allText: join(',', { items: '%$biLogger.biErrors.error%' }) }),
    timeout: 15000,
    logger: 'biLogger,dbLogger,colsCacheLogger'
  })
})

// The balance statement is an arithmetic proof, so the test asserts the proof, not the shape:
// within ONE currency there is no FX translation, so closing − opening must equal the window's
// activity − fees − payouts to the cent. This is what the ledger rewrite of "Running Balance" bought;
// against the old snapshot column it failed by six figures.
Test('financeCube.balanceStatementReconciles', {
  impl: dataTest({
    calculate: async ctx => {
      const usdOnly = `Currency = 'USD'`, [from, to] = ['2025-04-01', '2025-04-30']
      const [stmt, before, after] = await runEntries(ctx, [
        { report: 'financeBalanceStatement', where: `${usdOnly} AND Date >= DATE '${from}' AND Date <= DATE '${to}'` },
        { report: 'financeBalance', where: `${usdOnly} AND Date < DATE '${from}'` },
        { report: 'financeBalance', where: `${usdOnly} AND Date <= DATE '${to}'` }
      ])
      const { activity, fees, payouts } = stmt.rows[0]   // the report emits the finished figures directly
      const open = +before.rows[0]?.v || 0, close = +after.rows[0]?.v || 0
      const residual = close - open - (activity - fees - payouts)
      return { open, close, activity, fees, payouts, residual, ties: Math.abs(residual) <= 2, moved: Math.abs(close - open) > 1000 }
    },
    expectedResult: and(equals(true, '%ties%'), equals(true, '%moved%')),
    setup: setupCube(financeCube()),
    timeout: 20000,
    logger: 'biLogger'
  })
})
