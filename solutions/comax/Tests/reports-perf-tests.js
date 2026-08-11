import { dsls, jb } from '@jb6/core'
import '@jb6/common'
import '@jb6/testing'
import '../nostalgy/reports-based-agent.js'

// Performance gate: every report's section base view + report-level slot must run <2.5s on the BIG dataset.
// One Test per report (doNotRunInTests - heavy, on-demand). Section slots read the materialized full_data so
// they are trivially fast; the base VIEW compute is what these bound, since that is what runReport materializes
// once per run. Run one: runTest({testId:'comaxReports.perf.item-trends'}).
const {
  common: { data: { runReport, queryReportFullData, verifiedReportsRegistry } },
  tgp: { 'ctx-enricher': { setVars } },
  test: { Test, test: { dataTest } }
} = dsls

const BUDGET_SEC = 2.5
const BIG_ROOT = new URL('../../../../files/rooms/comaxDemo/usersRO/parquet/OEM_BI_4466', import.meta.url).pathname
const perfEnv = setVars(ctx => ({ db: 'local', dbHost: 'node', reportsRegistry: verifiedReportsRegistry.$runWithCtx(ctx), reportsRoot: BIG_ROOT,
  workflowLogger: dsls.test.logger.workflowLoggerProfile.$runWithCtx(ctx) }))

const timed = async fn => { const t = Date.now(); const r = await fn(); return { sec: +((Date.now() - t) / 1000).toFixed(2), r } }
const timeReport = async (ctx, reportId) => {
  const report = verifiedReportsRegistry.$runWithCtx(ctx).find(r => r.id == reportId)
  const out = []
  for (const s of report.sections || []) if (s.fullData?.viewSql) {
    const { sec, r } = await timed(() => queryReportFullData.$runWithCtx(ctx, { reportId, sectionId: s.id, sql: 'SELECT count(*) n FROM full_data' }))
    out.push({ q: `${reportId}/${s.id} (base)`, sec, ok: Array.isArray(r) })
  }
  for (const d of ['executiveSummary', 'summary']) if (report[d]?.sql) {
    const { sec, r } = await timed(() => runReport.$runWithCtx(ctx, { reportId, scope: d, sections: [] }))
    out.push({ q: `${reportId}.${d}`, sec, ok: !r?.error })
  }
  return out
}
const perfImpl = reportId => dataTest({
  setup: perfEnv,
  calculate: ctx => timeReport(ctx, reportId),
  expectedResult: ctx => {
    const rows = ctx.data || []
    const broken = rows.filter(x => !x.ok).map(x => `${x.q} ERRORED`)
    const slow = rows.filter(x => x.sec >= BUDGET_SEC).map(x => `${x.q} ${x.sec}s`)
    return (!broken.length && !slow.length)
      || { testFailure: [...broken, ...(slow.length ? [`over ${BUDGET_SEC}s: ${slow.join(', ')}`] : [])].join(' | ') + ` (all: ${rows.map(x => x.q + ' ' + x.sec + 's').join(', ')})` }
  },
  timeout: 300000
})

Test('comaxReports.perf.sales-overview', { doNotRunInTests: true, impl: perfImpl('sales-overview') })
Test('comaxReports.perf.branch-performance', { doNotRunInTests: true, impl: perfImpl('branch-performance') })
Test('comaxReports.perf.profitability', { doNotRunInTests: true, impl: perfImpl('profitability') })
Test('comaxReports.perf.item-trends', { doNotRunInTests: true, impl: perfImpl('item-trends') })
Test('comaxReports.perf.pricing-cost-drift', { doNotRunInTests: true, impl: perfImpl('pricing-cost-drift') })
Test('comaxReports.perf.promotions', { doNotRunInTests: true, impl: perfImpl('promotions') })
Test('comaxReports.perf.inventory-health', { doNotRunInTests: true, impl: perfImpl('inventory-health') })
Test('comaxReports.perf.customers-loyalty', { doNotRunInTests: true, impl: perfImpl('customers-loyalty') })
Test('comaxReports.perf.suppliers', { doNotRunInTests: true, impl: perfImpl('suppliers') })
Test('comaxReports.perf.category-mix', { doNotRunInTests: true, impl: perfImpl('category-mix') })
Test('comaxReports.perf.operations-audit', { doNotRunInTests: true, impl: perfImpl('operations-audit') })
Test('comaxReports.perf.promo-recommendations', { doNotRunInTests: true, impl: perfImpl('promo-recommendations') })
