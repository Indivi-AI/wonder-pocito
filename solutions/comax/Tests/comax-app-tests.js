import { dsls, jb, coreUtils } from '@jb6/core'
import '@jb6/common'
import '@jb6/testing'
import '@jb6/react/tests/react-testers.js'
import '../../../viz/viz-index.js'
import { salesHomeData } from '../App/comaxApp.js'
import '../App/dashboards.js'
import '../Comps/human-feedback-preview.js'
import './analytics-agent-tests.js'
import { normalizeReportRoute } from '../Agents/reports-template-agent.js'
import './eval/comax-eval.js'
import './reports-agent-tests.js'
import './eval/reports-eval.js'
import './eval/execution-accuracy.js'
import { comaxReportFromAnswer } from '../Comps/report-button.js'
import '@wonder/db/db-drivers.js'
const { wfetch2, wresolve } = jb.wonderUtils

const {
  common: { boolean: { contains, and, equals, not }, data: { runReport, queryReportFullData, verifiedReportsRegistry } },
  react: { 'react-comp': {
    AnalyticsAssistantResponse, branchDrillPanel, inventoryDrillPanel,
    HumanFeedbackMessageTestHarness, HumanFeedbackAutoResolvedHarness, Dashboards
  } },
  test: { Test, 'ui-action': { delay, click, clickVizShape }, test: { dataTest, reactTest } }
} = dsls
const REPORTS_ROOT = new URL('../../../../files/rooms/comaxDemo/usersRO/parquet/OEM_BI_4466', import.meta.url).pathname

const answer = {
  id: 'comax-a1', sender: 'Assistant', type: 'text',
  content: '## מכירות לפי סניף\n\nסניף תל אביב מוביל עם **18,400 ₪**.',
  longText: `הסבר מורחב: תל אביב מובילה בפדיון, ירושלים קרובה בכמות הזמנות, ולכן כדאי לבדוק גם סל ממוצע.
אם הפער נשמר, מומלץ לפרק לפי קטגוריות כדי למצוא את מקור היתרון.`,
  narrative: 'סניף תל אביב מוביל בפער ברור, אבל ירושלים קרובה במדד ההזמנות.',
  sql: 'SELECT branch, sales, orders FROM comax_sales_daily ORDER BY sales DESC LIMIT 2',
  rows: [{ branch: 'תל אביב', sales: 18400, orders: 73 }, { branch: 'ירושלים', sales: 14200, orders: 69 }],
  widgets: [{ kind: 'bar', title: 'מכירות לפי סניף', valueFormat: 'int',
    data: [{ name: 'תל אביב', value: 18400 }, { name: 'ירושלים', value: 14200 }],
    drill: { dimension: 'branch', question: 'נתח את {name} לפי קטגוריית מוצר' } }],
  followUps: [{ label: 'השווה לירושלים', question: 'השווה את תל אביב לירושלים לפי קטגוריית מוצר' }],
  trust: { label: 'בדיקות אמון', checks: ['מקור: comax_sales_daily', '2 שורות'] },
  report: { title: 'דוח מכירות יומי' },
  reportsUsed: [{ reportId: 'sales-overview', sections: ['sales-by-branch'], depth: 'summary' }],
  playbooks: [{ label: 'חקירת ירידה', question: 'פתח פלייבוק לחקירת ירידה במכירות' }]
}
const optionalReportPayload = () => {
  const out = JSON.stringify(comaxReportFromAnswer(answer))
  return out.includes('תל אביב') && out.includes(answer.sql)
}
const answerWith = element => (ctx, { react: { h, hh, useState } }) => () => {
  const [sent, setSent] = useState('')
  return h('div', {}, h('div', {}, 'sent:' + sent), hh(ctx, AnalyticsAssistantResponse, { element, send: setSent }))
}
const answerComp = answerWith(answer)

Test('comaxHome.salesCardUsesMonthlyReportContract', {
  impl: dataTest({
    calculate: () => salesHomeData({ current_sales: 27899819, previous_sales: 27447162, sales_change_pct: 1.6,
      current_basket: 89.5, current_receipts: 311724 }),
    expectedResult: ctx => !JSON.stringify(ctx.data).includes('—') && ctx.data[2].map(x => x[2]).join(',') == '27447162,89.5,311724'
      || { testFailure: JSON.stringify(ctx.data) }
  })
})

Test('comaxContract.hebrewExplorableAnswer', {
  impl: dataTest({
    calculate: () => answer,
    expectedResult: and(
      contains('תל אביב', { allText: '%content%' }),
      equals('תל אביב', '%rows/0/branch%'),
      contains('comax_sales_daily', { allText: '%sql%' }),
      contains('{name}', { allText: '%widgets/0/drill/question%' }),
      equals('השווה לירושלים', '%followUps/0/label%'))
  })
})

Test('reactTest.comax.hebrewSqlAndFollowUp', {
  impl: reactTest({
    testedComp: answerComp,
    expectedResult: and(contains('סניף תל אביב'), contains('מכירות לפי סניף'), contains('SELECT branch'),
      contains('sent:השווה את תל אביב'), contains('מאומת על בסיס דוח')),
    userActions: [delay(80), click('הצג SQL / נתונים'), click('השווה לירושלים'), delay(80)]
	})
})

Test('reactTest.comax.customUiNotice', {
  impl: reactTest({
    testedComp: answerWith({ ...answer, reportsUsed: [] }),
    expectedResult: and(contains('התשובה אינה מאומתת, יש לוודא את אמינות הנתונים'), contains('data-badge-kind="warning"'),
      not(contains('מאומת על בסיס דוח')), not(contains('lucide-info'))),
    userActions: [delay(80)]
  })
})

Test('reactTest.comax.sliceOverridesVerifiedBadge', {
  impl: reactTest({
    testedComp: answerWith({ ...answer, verified: false, verificationWarning: 'התשובה אינה מאומתת; יש לאמת את הנתונים.' }),
    expectedResult: ctx => { const html = String(ctx.data)
      return html.includes('התשובה אינה מאומתת, יש לוודא את אמינות הנתונים') && html.includes('data-badge-kind="warning"')
        && !html.includes('מאומת על בסיס דוח') || { testFailure: (html.match(/.{0,120}(?:lucide|מאומת).{0,120}/g) || []).join('\n') }
    },
    userActions: [delay(80)]
  })
})

Test('reactTest.comax.narrativeNeverRendered', {
  impl: reactTest({
    testedComp: answerWith({ ...answer, content: '**סיכום עיקרי**', narrative: 'נרטיב דטרמיניסטי נסתר', longText: '', sql: '', rows: [], widgets: [], followUps: [] }),
    expectedResult: ctx => !String(ctx.data).includes('נרטיב דטרמיניסטי נסתר') || { testFailure: String(ctx.data) },
    userActions: [delay(80)]
  })
})

Test('reactTest.comax.longAnswerCollapsed', {
  impl: reactTest({
    testedComp: answerComp,
    expectedResult: and(contains('פירוט'), contains('הסבר מורחב')),
    userActions: [delay(80), click('פירוט'), delay(80)]
  })
})

Test('reactTest.comax.humanFeedbackSelectsMultiple', {
  impl: reactTest({
    testedComp: HumanFeedbackMessageTestHarness(),
    expectedResult: and(contains('לאיזה מוצר התכוונת?'), contains('resolved:886,19406'), contains('נבחרו 2 מוצרים'), contains('מלאי 3,697.3')),
    userActions: [delay(80), click('עגבניות שרי תמר ישראל'), click('עגבניות שרי מנומר ישראל'), click('המשך'),
      delay(80), click('נבחרו 2 מוצרים'), delay(80)]
  })
})

Test('reactTest.comax.humanFeedbackShowsAutoResolved', {
  impl: reactTest({
    testedComp: HumanFeedbackAutoResolvedHarness(),
    expectedResult: and(contains('לאיזה סניף התכוונת?'), contains('גני תקווה'), contains('נבחר אוטומטית')),
    userActions: [delay(80)]
  })
})

Test('reactTest.comax.drillSend', {
  impl: reactTest({
    testedComp: answerComp,
    expectedResult: contains('sent:נתח את תל אביב לפי קטגוריית מוצר'),
    userActions: [delay(120), clickVizShape(), delay(80)]
  })
})

Test('reactTest.comax.drillDrawerBadgeKind', {
  impl: reactTest({
    testedComp: (ctx, { react: { h, hh, useState } }) => () => {
      const [details, setDetails] = useState({})
      return h('div', {}, h('div', {}, 'drawer:' + (details.badgeKind || '')), hh(ctx, AnalyticsAssistantResponse, { element: answer, openDetails: setDetails, send: () => {} }))
    },
    expectedResult: contains('drawer:verified'),
    userActions: [delay(120), clickVizShape(), delay(80)]
  })
})

Test('comaxReports.monthlyWidgetsUseReactDrill', {
  impl: dataTest({
    calculate: ctx => {
      const report = verifiedReportsRegistry.$runWithCtx(ctx).find(x => x.id == 'sales-overview')
      const sections = ['trend', 'branch-comparison', 'item-drivers', 'supplier-drivers']
      return [report.summary.widget, ...sections.map(id => report.sections.find(x => x.id == id).summary.widget)]
    },
    expectedResult: ctx => ctx.data.length == 5
      && ctx.data.map(x => x.drill?.reactComp).join() == 'salesDrillPanel,salesDrillPanel,branchDrillPanel,salesDrillPanel,salesDrillPanel'
      && ctx.data.every(x => x.drill?.queries?.length) || { testFailure: JSON.stringify(ctx.data.map(x => x.drill)) }
  })
})

Test('comaxReports.branchDrillFreshInsightsRealData', {
  impl: dataTest({
    calculate: async ctx => {
      const registry = verifiedReportsRegistry.$runWithCtx(ctx)
      const runCtx = ctx.setVars({ db: 'local', dbHost: 'node', reportsRegistry: registry, reportsRoot: REPORTS_ROOT })
      const report = registry.find(x => x.id == 'sales-overview')
      const drill = report.sections.find(x => x.id == 'branch-comparison').summary.widget.drill
      const branches = await queryReportFullData.$runWithCtx(runCtx, { reportId: 'branch-performance', sectionId: 'ranking',
        sql: 'SELECT branch FROM full_data WHERE ym < (SELECT max(ym) FROM full_data) ORDER BY net DESC LIMIT 1' })
      const rows = await Promise.all(drill.queries.map(query => queryReportFullData.$runWithCtx(runCtx,
        { ...query, sql: jb.vizUtils.fillDrill(query.sql, { name: branches[0].branch }) })))
      return { component: drill.reactComp, counts: rows.map(x => x.length), fields: rows.map(x => Object.keys(x[0] || {})) }
    },
    expectedResult: ctx => ctx.data.component == 'branchDrillPanel' && ctx.data.counts.length == 3
      && ctx.data.counts.every(Boolean) && ['basket', 'previous_value', 'margin_pct'].every((key, i) => ctx.data.fields[i].includes(key))
      || { testFailure: JSON.stringify(ctx.data) },
    timeout: 120000
  })
})

Test('comaxReports.salesDrillsFreshInsightsRealData', {
  impl: dataTest({
    calculate: async ctx => {
      const registry = verifiedReportsRegistry.$runWithCtx(ctx)
      const runCtx = ctx.setVars({ db: 'local', dbHost: 'node', reportsRegistry: registry, reportsRoot: REPORTS_ROOT })
      const sections = ['trend', 'item-drivers', 'supplier-drivers']
      const report = await runReport.$runWithCtx(runCtx, { reportId: 'sales-overview', scope: 'summary', sections })
      const widget = slot => report.widgets.find(x => x.slot == slot), trend = widget('trend')
      const cases = [
        [report.widgets.find(x => x.kind == 'kpi'), { name: 'מכירות נטו' }],
        [trend, { name: trend.series[0].points.find(x => x.y != null).x, series: trend.series[0].name }],
        [widget('item-drivers'), { name: widget('item-drivers').categories[0] }],
        [widget('supplier-drivers'), { name: widget('supplier-drivers').categories[0] }]
      ]
      const queries = cases.flatMap(([source, event]) => source.drill.queries.map(query => ({ query, event })))
      const rows = await Promise.all(queries.map(({ query, event }) => queryReportFullData.$runWithCtx(runCtx,
        { ...query, sql: jb.vizUtils.fillDrill(query.sql, event) })))
      return { modes: cases.map(([source]) => source.drill.mode), counts: rows.map(x => x.length), errors: rows.map(x => x.error).filter(Boolean) }
    },
    expectedResult: ctx => ctx.data.modes.join() == 'kpi,trend,product,supplier' && ctx.data.counts.length == 5
      && ctx.data.counts.every(Boolean) && !ctx.data.errors.length || { testFailure: JSON.stringify(ctx.data) },
    timeout: 180000
  })
})

const salesDrillAnswer = { ...answer, widgets: [{ kind: 'kpi', title: 'חודש מלא אחרון מול חודש קודם',
  items: [{ label: 'מכירות נטו', value: 27899819, delta: 1.6, format: '₪' }],
  drill: { reactComp: 'salesDrillPanel', mode: 'kpi', title: 'פירוט — {name}' } }] }
const drawerHarness = element => (ctx, { react: { h, hh, useState } }) => () => {
  const [details, setDetails] = useState(null)
  return h('div', {}, h('div', {}, `drawer:${details ? 'open' : 'closed'}`), details?.content,
    hh(ctx, AnalyticsAssistantResponse, { element, openDetails: setDetails, send: () => {} }))
}

Test('reactTest.comax.salesReactDrillDrawer', {
  impl: reactTest({
    testedComp: drawerHarness(salesDrillAnswer),
    expectedResult: and(contains('drawer:open'), contains('חודש קודם'), contains('מכירות נטו')),
    userActions: [delay(80), click('מכירות נטו'), delay(100)]
  })
})

Test('reactTest.comax.widgetWithoutDrillKeepsDrawerClosed', {
  impl: reactTest({
    testedComp: drawerHarness({ ...answer, widgets: answer.widgets.map(({ drill, ...widget }) => widget) }),
    expectedResult: contains('drawer:closed'),
    userActions: [delay(120), clickVizShape(), delay(80)]
  })
})

const branchDrillRows = {
  months: [{ x: '2026-06', current_value: 1246300, receipts: 13740, basket: 90.7 },
    { x: '2026-05', current_value: 1175100, receipts: 13120, basket: 89.6 }],
  days: [{ x: '2026-06-30', current_value: 49300, previous_value: 46200, wow_pct: 6.7, basket: 91.2 }],
  departments: [{ name: 'חלב ומוצריו', current_value: 342000, margin_ils: 119000, margin_pct: 34.8 }]
}
const branchDrillHarness = (ctx, { react: { hh } }) => () => hh(ctx, branchDrillPanel, { spec: {
  event: { name: 'סניף מרכז' }, queries: Object.keys(branchDrillRows).map(id => ({ id, title: {
    months: 'מומנטום חודשי', days: '28 הימים המלאים האחרונים', departments: 'רווחיות לפי מחלקה' }[id] }))
}, runQuery: query => Promise.resolve(branchDrillRows[query.id]) })

Test('reactTest.comax.branchDrillShowsFreshInsights', {
  impl: reactTest({ testedComp: branchDrillHarness,
    expectedResult: and(contains('כרטיס סניף'), contains('סל ממוצע'), contains('28 הימים'), contains('חלב ומוצריו')),
    userActions: [delay(300)] })
})

Test('comaxReports.inventoryWidgetsUseContextDrill', {
  impl: dataTest({
    calculate: ctx => {
      const report = verifiedReportsRegistry.$runWithCtx(ctx).find(x => x.id == 'qlik-inventory-performance')
      const sections = ['network-capital-coverage', 'availability-risk', 'excess-capital-actions']
      return [report.executiveSummary.widget, ...sections.map(id => report.sections.find(x => x.id == id).summary.widget)]
    },
    expectedResult: ctx => ctx.data.length == 4 && ctx.data.every(x => !x.highlight)
      && ctx.data.every(x => x.drill?.reactComp == 'inventoryDrillPanel')
      && ctx.data.map(x => x.drill.queries.length).join() == '2,3,1,2'
      && !/מכר 30 יום חשוף|הון עודף|מוקדי אזל|כיסוי עלות|כיסוי כספי/.test(JSON.stringify(ctx.data))
      || { testFailure: JSON.stringify(ctx.data) }
  })
})

Test('comaxReports.inventoryDrillsFreshInsightsRealData', {
  impl: dataTest({
    calculate: async ctx => {
      const registry = verifiedReportsRegistry.$runWithCtx(ctx)
      const runCtx = ctx.setVars({ db: 'local', dbHost: 'node', reportsRegistry: registry, reportsRoot: REPORTS_ROOT })
      const sections = ['network-capital-coverage', 'availability-risk', 'excess-capital-actions']
      const result = await runReport.$runWithCtx(runCtx, {
        reportId: 'qlik-inventory-performance', scope: 'executiveSummary', sections, sectionDepth: 'summary'
      })
      const widget = slot => result.widgets.find(x => x.slot == slot)
      const cases = [
        [result.widgets.find(x => x.kind == 'kpi'), { name: 'שווי המלאי' }],
        [widget('network-capital-coverage'), { name: widget('network-capital-coverage').data[0].name }],
        [widget('availability-risk'), { name: widget('availability-risk').data[0].name }],
        [widget('excess-capital-actions'), { name: widget('excess-capital-actions').categories[0] }]
      ]
      const queries = cases.flatMap(([source, event]) => source.drill.queries.map(query => ({ query, event })))
      const rows = []
      for (const { query, event } of queries) rows.push(await queryReportFullData.$runWithCtx(runCtx,
        { ...query, sql: jb.vizUtils.fillDrill(query.sql, event) }))
      return { modes: cases.map(([source]) => source.drill.mode), counts: rows.map(x => x.length),
        errors: rows.map(x => x.error).filter(Boolean) }
    },
    expectedResult: ctx => ctx.data.modes.join() == 'kpi,branch,availability,excess' && ctx.data.counts.length == 8
      && ctx.data.counts.every(Boolean) && !ctx.data.errors.length || { testFailure: JSON.stringify(ctx.data) },
    timeout: 180000
  })
})

Test('comaxReports.inventoryDrillMarksNegativeStock', {
  impl: dataTest({
    calculate: async ctx => {
      const registry = verifiedReportsRegistry.$runWithCtx(ctx)
      const runCtx = ctx.setVars({ db: 'local', dbHost: 'node', reportsRegistry: registry, reportsRoot: REPORTS_ROOT })
      const report = registry.find(x => x.id == 'qlik-inventory-performance')
      const section = report.sections.find(x => x.id == 'availability-risk')
      const clicked = await queryReportFullData.$runWithCtx(runCtx, { reportId: report.id, sectionId: section.id,
        sql: `SELECT left(item,42)||' · '||left(branch,24) AS action_label FROM full_data
WHERE location_type='סניף מכירה' AND item_status='פעיל' AND inventory_status IN ('stockout','low_cover')
  AND item IN (SELECT item FROM full_data WHERE inventory_status='negative_stock')
ORDER BY sales_net_30d DESC LIMIT 1` })
      const query = section.summary.widget.drill.queries[0]
      const rows = await queryReportFullData.$runWithCtx(runCtx,
        { ...query, sql: jb.vizUtils.fillDrill(query.sql, { name: clicked[0]?.action_label }) })
      return rows.find(x => x.stock_qty < 0) || { clicked, rows }
    },
    expectedResult: ctx => ctx.data.inventory_state == 'מלאי שלילי — לבדיקה'
      || { testFailure: JSON.stringify(ctx.data) },
    timeout: 180000
  })
})

const inventoryDrillRows = {
  summary: [{ inventory_value_ils: 3811161, excess_value_ils: 2168796, sales_at_risk_ils: 2514487,
    missing_items: 422, low_stock_items: 1385, stock_days: 22.9, margin_pct: 35.8 }],
  missing: [{ name: 'מיץ תפוזים', current_value: 16072, stock_qty: 0, stock_days: 0, daily_sales: 31.9 }],
  excess: [{ name: 'מוצרי יסוד', current_value: 1561119, stock_days: 74, reason: 'מלאי ליותר מ־60 יום' }]
}
const inventoryDrillHarness = (ctx, { react: { hh } }) => () => hh(ctx, inventoryDrillPanel, { spec: {
  mode: 'branch', event: { name: 'גני תקווה' }, queries: Object.keys(inventoryDrillRows).map(id => ({ id,
    title: { summary: 'תמונת הסניף', missing: 'מה חסר בסניף', excess: 'מה תקוע בסניף' }[id],
    kind: id == 'summary' ? 'metrics' : 'hbar', valueLabel: 'שווי' }))
}, runQuery: query => Promise.resolve(inventoryDrillRows[query.id]) })

Test('reactTest.comax.inventoryDrillShowsFreshInsights', {
  impl: reactTest({
    testedComp: inventoryDrillHarness,
    expectedResult: and(contains('מצב המלאי בסניף'), contains('פריטים חסרים'), contains('מה חסר בסניף'), contains('מה תקוע בסניף')),
    userActions: [delay(300)]
  })
})

// full drill path through the applet renderer: click a bar → the widget's drill.sql runs
// on REAL duckdb (node runBashScript spawns bash directly) → the line side plot renders.
const drillAnswer = { ...answer, widgets: [{ ...answer.widgets[0],
  drill: { kind: 'line', title: 'מכירות שבועיות — {name}', sql: "SELECT 'W1' AS x, 5 AS y UNION ALL SELECT 'W2', 9 ORDER BY 1" } }] }
const roomDrillAnswer = { ...answer, widgets: [{ ...answer.widgets[0],
  drill: { kind: 'table', title: 'שורות קופה — {name}',
    sql: "SELECT 1 AS line_ok FROM read_parquet('signedRoom://comaxDemo/usersRO/parquet/OEM_BI_4466/KupaDoc_Lines.parquet') LIMIT 1" } }] }

Test('reactTest.comax.drillPanelDuckDb', {
  impl: reactTest({
    testedComp: (ctx, { react: { hh } }) => () => hh(ctx, AnalyticsAssistantResponse, { element: drillAnswer, send: () => {} }),
    expectedResult: and(contains('מכירות שבועיות — תל אביב'), contains('W2')),
    userActions: [delay(150), clickVizShape(), delay(800)],
    timeout: 10000
  })
})

Test('reactTest.comax.drillPanelRoomUrl', {
  impl: reactTest({
    testedComp: (ctx, { react: { hh } }) => () => hh(ctx, AnalyticsAssistantResponse, { element: roomDrillAnswer, send: () => {} }),
    expectedResult: and(contains('שורות קופה — תל אביב'), contains('line_ok')),
    userActions: [delay(150), clickVizShape(), delay(800)],
    timeout: 10000
  })
})

Test('comaxContract.reportHelper', {
  impl: dataTest({ calculate: optionalReportPayload, expectedResult: equals(true) })
})

Test('dashboards.reportsMenuPromotionsFirst', {
  impl: dataTest({
    calculate: () => jb.dashboardUtils.sortDashboardReports([
      { id: 'sales-overview', title: 'Sales' }, { id: 'promo-recommendations', title: 'Recs' },
      { id: 'promotions', title: 'old' }, { id: 'promotions', title: 'Promos' }
    ]).map(r => `${r.id}:${r.title}`).join(','),
    expectedResult: equals('promotions:Promos,promo-recommendations:Recs,sales-overview:Sales')
  })
})

const expectedDashboardReports = [
  'promotions', 'promo-recommendations', 'branch-performance', 'category-mix', 'customers-loyalty', 'inventory-health',
  'inventory-analysis', 'item-trends', 'operations-audit', 'pricing-cost-drift', 'profitability', 'sales-overview', 'suppliers',
  'qlik-sales-pulse', 'qlik-branch-operations', 'qlik-assortment-performance', 'qlik-flexible-comparison',
  'qlik-holiday-performance', 'qlik-inventory-performance', 'qlik-period-comparison'
]
Test('dashboards.menuIncludesAllReports', {
  impl: dataTest({
    calculate: ctx => jb.dashboardUtils.sortDashboardReports(verifiedReportsRegistry.$runWithCtx(ctx)).map(r => r.id),
    expectedResult: ctx => ctx.data[0] == 'promotions' && ctx.data.length == expectedDashboardReports.length
      && expectedDashboardReports.every(id => ctx.data.includes(id)) || { testFailure: JSON.stringify(ctx.data) }
  })
})

Test('dashboards.allReportsDuckDbExecutiveSummaries', {
  impl: dataTest({
    calculate: async ctx => {
      const reports = jb.dashboardUtils.sortDashboardReports(verifiedReportsRegistry.$runWithCtx(ctx))
      const base = ctx.setVars({ reportsRegistry: reports,
        reportsRoot: 'signedRoom://comaxDemo/usersRO/parquet/OEM_BI_4466', db: 'local', duckdbMemoryLimit: '2GB', duckdbThreads: 4 })
      const out = []
      for (const r of reports) {
        const res = await base.setVars({ duckdbMatRun: `dashboards_all_${r.id}_${Date.now()}` })
          .run(runReport({ reportId: r.id, scope: 'executiveSummary', sections: [], sectionDepth: 'summary' }))
        out.push({ id: r.id, ok: !res?.error && !res?.results?.executiveSummary?.error,
          rows: res?.results?.executiveSummary?.length || 0, error: res?.error || res?.results?.executiveSummary?.error })
      }
      return out
    },
    expectedResult: ctx => ctx.data.every(r => r.ok && r.rows >= 0) || { testFailure: JSON.stringify(ctx.data.filter(r => !r.ok)) },
    timeout: 120000
  })
})

const dashboardTestUrl = id => `room:fs//comaxDemo/dashboards/tests/${id}.js`
const readLocalJs = async (url, ctx) => (await import('fs')).readFileSync((await wresolve(url, ctx)).replace(/\?.*/, ''), 'utf8')
const runDashboardEdit = async (ctx, message, id) => {
  const url = dashboardTestUrl(id), reports = jb.dashboardUtils.sortDashboardReports(verifiedReportsRegistry.$runWithCtx(ctx))
  const vars = ctx.setVars({ db: 'local', roomUrl: 'room:fs//comaxDemo', roomId: 'comaxDemo', dashboardUrl: url,
    reportsRoot: 'signedRoom://comaxDemo/usersRO/parquet/OEM_BI_4466', reportsRegistry: reports,
    currentReportId: 'promotions', userMessage: message, widgetId: 'dashboards.reportCanvas', duckdbMemoryLimit: '2GB',
    duckdbThreads: 4, duckDbSqlCache: false, doNotWriteLogs: true })
  await wfetch2(url, { method: 'PUT', body: jb.dashboardUtils.defaultDashboardJs }, vars)
  const res = await dsls.workflow.workflow['dashboards-edit'].$run({ model: 'openai/gpt-5.5' }).calcWorkflow(vars)
  const code = res.runRes?.draftUrl ? await readLocalJs(res.runRes.draftUrl, vars) : ''
  return { ...res.runRes, adminUrl: res.adminUrl, bigLogRes: res.bigLogRes, code: undefined, editedCode: undefined,
    hasExistingPromos: code.includes('כל המבצעים הקיימים'), hasMechanic: code.includes('מבצעים לפי מנגנון'),
    hasKpi: code.includes('כמות מבצעים'), hasSuppliers: code.includes('טבלת ספקים'),
    hasProfitGrowth: code.includes('גידול רווח מול בסיס') }
}

Test('dashboards.aiEditAddsExistingPromotionsTable', {
  impl: dataTest({
    calculate: ctx => runDashboardEdit(ctx, 'תוסיף טבלה עם כל המבצעים הקיימים', 'promotions-table'),
    expectedResult: ctx => ctx.data.draftUrl?.endsWith('-draft.js') && ctx.data.rowsCount > 0
      && ctx.data.widget?.kind == 'table' && ctx.data.hasExistingPromos && ctx.data.sql.includes('Mivza.parquet')
      || { testFailure: JSON.stringify(ctx.data) },
    timeout: 60000
  })
})

Test('dashboards.aiEditAddsPromotionMechanicBar', {
  impl: dataTest({
    calculate: ctx => runDashboardEdit(ctx, 'תוסיף גרף מספר מבצעים לפי מנגנון', 'promotions-mechanic'),
    expectedResult: ctx => ctx.data.rowsCount > 0 && ctx.data.widget?.kind == 'bar'
      && ctx.data.widget.data?.[0]?.value > 0 && ctx.data.hasMechanic || { testFailure: JSON.stringify(ctx.data) },
    timeout: 60000
  })
})

Test('dashboards.aiEditAddsPromotionCountKpi', {
  impl: dataTest({
    calculate: ctx => runDashboardEdit(ctx, 'תוסיף KPI של כמות המבצעים', 'promotions-kpi'),
    expectedResult: ctx => ctx.data.rowsCount == 1 && ctx.data.widget?.kind == 'kpi'
      && ctx.data.widget.items?.[0]?.value > 0 && ctx.data.hasKpi || { testFailure: JSON.stringify(ctx.data) },
    timeout: 60000
  })
})

Test('dashboards.aiEditAddsSuppliersTable', {
  impl: dataTest({
    calculate: ctx => runDashboardEdit(ctx, 'תוסיף טבלה של ספקים', 'suppliers-table'),
    expectedResult: ctx => ctx.data.draftUrl?.endsWith('-draft.js') && ctx.data.rowsCount > 0
      && ctx.data.widget?.kind == 'table' && ctx.data.draftDashboard?.widgets?.some(w => w.title == 'טבלת ספקים')
      && ctx.data.hasSuppliers && ctx.data.sql.includes('Suppliers.parquet') || { testFailure: JSON.stringify(ctx.data) },
    timeout: 60000
  })
})

Test('dashboards.aiEditAddsProfitGrowthBaselineKpi', {
  impl: dataTest({
    calculate: ctx => runDashboardEdit(ctx, 'תוסיף ערך של ״גידול רווח מול בסיס״', 'profit-growth-baseline'),
    expectedResult: ctx => ctx.data.bigLogRes?.fileName == 'doNotWriteLogs' && ctx.data.rowsCount == 1
      && ctx.data.widget?.kind == 'kpi' && ctx.data.widget.title == 'גידול רווח מול בסיס'
      && ctx.data.widget.items?.[0]?.label == 'גידול רווח מול בסיס' && ctx.data.widget.items?.[0]?.value !== undefined
      && ctx.data.hasProfitGrowth && !JSON.stringify(ctx.data).includes('undefined') || { testFailure: JSON.stringify(ctx.data) },
    timeout: 60000
  })
})

Test('dashboards.reportsMenuOrderLegacy', {
  impl: dataTest({
    calculate: () => jb.dashboardUtils.sortDashboardReports([
      { id: 'sales-overview', title: 'Sales' }, { id: 'promo-recommendations', title: 'Recs' },
      { id: 'promotions', title: 'Promos' }
    ]).map(r => r.id).join(','),
    expectedResult: equals('promotions,promo-recommendations,sales-overview')
  })
})

Test('dashboards.editWidgetReplacesOnlyOneReactComp', {
  impl: dataTest({
    calculate: () => {
      const code = jb.dashboardUtils.defaultDashboardJs, oldCanvas = jb.workflowUtils.dashboardWidgetBlock(code, 'dashboards.reportCanvas')
      const edited = `// dashboard-widget:start dashboards.vizWidget
ReactComp('dashboards.vizWidget', { impl: comp({ hFunc: (ctx, { react: { h } }) => () => h('div', {}, 'edited viz') }) })
// dashboard-widget:end dashboards.vizWidget`
      const next = jb.workflowUtils.replaceDashboardWidgetBlock(code, 'dashboards.vizWidget', edited)
      return { hasEdit: next.includes('edited viz'),
        sameCanvas: jb.workflowUtils.dashboardWidgetBlock(next, 'dashboards.reportCanvas') === oldCanvas,
        stillImports: next.includes("import { dsls }") }
    },
    expectedResult: ctx => ctx.data.hasEdit && ctx.data.sameCanvas && ctx.data.stillImports || { testFailure: JSON.stringify(ctx.data) }
  })
})

Test('dashboards.promotionsRunBuildsDashboard', {
  impl: dataTest({
    calculate: async ctx => {
      const reports = jb.dashboardUtils.sortDashboardReports(verifiedReportsRegistry.$runWithCtx(ctx)), report = reports.find(r => r.id == 'promotions')
      const res = await ctx.setVars({ reportsRegistry: reports,
        reportsRoot: 'signedRoom://comaxDemo/usersRO/parquet/OEM_BI_4466', db: 'local' })
        .run(runReport({ reportId: 'promotions', scope: 'executiveSummary', sections: ['coverage'], sectionDepth: 'summary' }))
      const dash = jb.dashboardUtils.dashboardFromReport(res?.jbCtx ? res.data : res, report)
      return { promoTop: reports[0]?.id, reportId: dash.reportId, title: dash.title, comps: dash.reactComps.length,
        first: dash.reactComps[0]?.cmpId, rows: dash.reactComps[0]?.rows?.length }
    },
    expectedResult: ctx => ctx.data.promoTop == 'promotions' && ctx.data.reportId == 'promotions'
      && ctx.data.comps > 0 && ctx.data.first == 'promotionReportPanel' && ctx.data.rows > 0
      || { testFailure: JSON.stringify(ctx.data) },
    timeout: 20000
  })
})

const dashboardSample = { reportId: 'promotions', title: 'נתח ביצועי מבצעים', description: 'מדדי מבצעים וכרטיסי דוח.',
  reactComps: [{ id: 'panel.kpis', cmpId: 'promotionReportPanel', mode: 'kpis', title: 'מדדי מבצעים פעילים',
    rows: [{ active_promos: 12, profitable_promos: 8, losing_promos: 4, sales_growth_ils: 120000 }],
    kpis: [{ key: 'active_promos', label: 'מבצעים פעילים' }, { key: 'profitable_promos', label: 'רווחיים', tone: 'good' },
      { key: 'losing_promos', label: 'מפסידים', tone: 'bad' },
      { key: 'sales_growth_ils', label: 'גידול', format: '₪' }] }], widgets: [] }
const dashboardReports = [
  { id: 'promotions', title: 'נתח ביצועי מבצעים', description: 'מבצעים פעילים.' },
  { id: 'sales-overview', title: 'תמונת מכירות כללית', description: 'מכירות וסניפים.' }
]
Test('reactTest.dashboards.shellMenuAndAiPane', {
  impl: reactTest({
    testedComp: (ctx, { react: { hh } }) => () => hh(ctx.setVars({ skipDashboardRoom: true,
      initialDashboard: dashboardSample, reports: dashboardReports,
      dashboardUrl: 'signedRoom://comaxDemo/dashboards/dashboards.react.js',
      reportsRoot: 'signedRoom://comaxDemo/usersRO/parquet/OEM_BI_4466' }), Dashboards),
    expectedResult: and(contains('Dashboards'), contains('נתח ביצועי מבצעים'), contains('ווידג׳ט נבחר: dashboards.reportCanvas')),
    userActions: [delay(100), click('שאל AI לערוך את הדשבורד'), delay(80)]
  })
})

// --- agents repo + dropdown selector + debug comparison ---

Test('comaxAgentsRepo.listsRegisteredAgents', {
  impl: dataTest({
    calculate: () => dsls.common.data.comaxAnalyticsAgents.$run(),
    expectedResult: ctx => { const xs = ctx.data
      return JSON.stringify(xs.map(x => x.id).sort()) == JSON.stringify(['basicAnalytics', 'fast-report'])
        && xs.every(a => dsls.workflow.workflow[a.id] && a.label && a.hint) }
  })
})

Test('reportsTemplate.normalizesSlots', {
  impl: dataTest({
    calculate: () => {
      const reportsRegistry = dsls.common.data.verifiedReportsRegistry.$run()
      const ctx = new coreUtils.Ctx({ vars: { reportsRegistry } })
      const slots = jb.workflowUtils.normalizeReportTemplateSlots({ reportId: 'sales-overview', scope: 'executiveSummary',
        sections: ['trend'], sectionDepth: 'summary', rows: { source: 'section', sectionId: 'trend' } }, ctx)
      const goals = coreUtils.resolveProfileArgs(jb.workflowUtils.fastReportFlow(slots)).elems.map(e => e.goal)
      return slots.reportId == 'sales-overview' && slots.rows.sectionId == 'trend'
        && ['Run selected report', 'Emit fast widgets', 'Write answer', 'Return final fast report'].every(g => goals.includes(g))
    },
    expectedResult: equals(true)
  })
})

// S4: one deterministic entity filter grounds BOTH the summary rows and the UI rows - never a jq string per entity
Test('reportsTemplate.scopeRowsKeepFeedbackEntity', {
  impl: dataTest({
    calculate: () => {
      const ctx = new coreUtils.Ctx({ vars: { reportsRegistry: dsls.common.data.verifiedReportsRegistry.$run() } })
      const slots = jb.workflowUtils.normalizeReportTemplateSlots({ reportId: 'branch-performance', scope: 'none', sections: [], sectionDepth: 'summary',
        rows: { source: 'scope', scope: 'summary' }, entities: [{ entity: 'branch', query: 'גני תקווה', varName: 'selectedBranches', mode: 'single' }] }, ctx)
      const elems = coreUtils.resolveProfileArgs(jb.workflowUtils.fastReportFlow(slots)).elems
      const vars = { selectedBranches: { ids: [7], labels: ['גני תקווה'] } }
      const rows = [{ branch: 'גני תקווה', net: 1 }, { branch: 'אשדוד', net: 2 }, { branch_id: 7, net: 3 }, { total: 9 }]
      return { scope: slots.scope, rowsScope: slots.rows.scope, entity: slots.entities[0]?.varName,
        elems: elems.map(e => e.$?.id || e.$$),
        filtered: jb.workflowUtils.reportEntityRowsFilter(rows, slots.entities, vars) }
    },
    expectedResult: ctx => ctx.data.scope == 'summary' && ctx.data.rowsScope == 'summary'
      && ctx.data.entity == 'selectedBranches' && ctx.data.elems.includes('asHumanFeedback')
      && ctx.data.filtered.length == 3 && !ctx.data.filtered.some(r => r.branch == 'אשדוד')
      || { testFailure: JSON.stringify(ctx.data) }
  })
})

Test('reportsTemplate.widgetSlotsAreDeclarative', {
  impl: dataTest({
    calculate: () => {
      const ctx = new coreUtils.Ctx({ vars: { reportsRegistry: dsls.common.data.verifiedReportsRegistry.$run() } })
      return jb.workflowUtils.normalizeReportTemplateSlots({ reportId: 'sales-overview', scope: 'executiveSummary', sections: ['trend'], sectionDepth: 'summary',
        rows: { source: 'section', sectionId: 'trend' },
        widgets: [{ kind: 'bar', title: 'x', name: 'branch', value: 'net',
          data: [{ name: 'bad', value: 999 }], rows: [{ branch: 'bad' }] }] }, ctx).widgets[0]
    },
    expectedResult: ctx => ctx.data.nameCol == 'branch' && ctx.data.valueCol == 'net' && !ctx.data.name && !ctx.data.value && !ctx.data.data && !ctx.data.rows
      || { testFailure: JSON.stringify(ctx.data) }
  })
})

Test('reportsTemplate.slotInstructionsForbidWidgetPayloads', {
  impl: dataTest({
    calculate: () => jb.workflowUtils.reportTemplateSlotInstructions,
    expectedResult: ctx => {
      const text = String(ctx.data)
      return text.includes('Never output data/rows/series/items/values/categories') && text.includes("table uses columns only")
        && text.includes('charts use nameCol/valueCol only') && text.includes('0–100 scale')
        || { testFailure: text.slice(text.indexOf('Widget rules'), text.indexOf('Widget rules') + 300) }
    }
  })
})

Test('comaxAnalytics.finalAnswerPromptUsesDeclarativeWidgets', {
  impl: dataTest({
    calculate: ctx => Promise.all(['essentialOutputFormat.analytics', 'vizOutputFormat'].map(id => jb.workflowUtils.docletContent(id, ctx))),
    expectedResult: ctx => {
      const text = ctx.data.join('\n')
      return text.includes("Charts use kind + nameCol + valueCol") && text.includes("table uses kind:'table' + columns only")
        && text.includes('widgets are declarative only') && !text.includes('widgets[].data must come from') && !text.includes("Match each widget's data shape")
        || { testFailure: text.slice(0, 1000) }
    },
    timeout: 3000
  })
})

// caveat policy: cleaning is FORMATTING-ONLY (.00) - caveat sentences are never regex-stripped; the summarizer is instructed instead
Test('reportsTemplate.cleanAnswerIsFormattingOnly', {
  impl: dataTest({
    calculate: () => jb.workflowUtils.cleanReportTemplateAnswer(
      'מכירות של 729.00 ₪. ההשוואה מול היסטוריית הפריט עצמו, ללא קבוצת ביקורת.'),
    expectedResult: equals('מכירות של 729 ₪. ההשוואה מול היסטוריית הפריט עצמו, ללא קבוצת ביקורת.')
  })
})

Test('reportsTemplate.routeCatalogCompact', {
  impl: dataTest({
    calculate: () => jb.workflowUtils.reportTemplateRouteCatalog(dsls.common.data.verifiedReportsRegistry.$run()),
    expectedResult: ctx => String(ctx.data).includes('branch-performance') && String(ctx.data).includes('ranking') && !String(ctx.data).includes('read_parquet(')
  })
})

Test('reportsTemplate.routeCustomAnswer', {
  impl: dataTest({
    calculate: () => normalizeReportRoute({ mode: 'customAnswer', reason: 'ad hoc sql' },
      new coreUtils.Ctx({ vars: { reportsRegistry: dsls.common.data.verifiedReportsRegistry.$run() } })),
    expectedResult: ctx => ctx.data.customAnswer && ctx.data.mode == 'customAnswer' && ctx.data.reason == 'ad hoc sql'
  })
})

Test('reportsTemplate.routeInstructionsAllowCustomAnswer', {
  impl: dataTest({
    calculate: () => jb.workflowUtils.reportTemplateRouteInstructions,
    expectedResult: and(contains('customAnswer'), contains('free SQL over the raw ERP data'))
  })
})

Test('reportsTemplate.strictJsonOnlyParserAndPrompts', {
  impl: dataTest({
    calculate: () => {
      const text = [jb.workflowUtils.reportTemplateRouteInstructions, jb.workflowUtils.reportTemplateSlotInstructions].join('\n')
      let rejectsXml = false
      try { jb.workflowUtils.parseReportTemplateJson('<SLOTS>{"reportId":"x"}</SLOTS>', 'slots') } catch (e) { rejectsXml = /non-JSON object/.test(e.message) }
      return { text, rejectsXml, parsesJson: jb.workflowUtils.parseReportTemplateJson('{"reportId":"x"}', 'slots').reportId == 'x' }
    },
    expectedResult: ctx => ctx.data.rejectsXml && ctx.data.parsesJson && !/<\/?(SLOTS|ROUTE)\b/.test(ctx.data.text)
      && ctx.data.text.includes('raw JSON object only') && ctx.data.text.includes('No XML/tags')
      || { testFailure: JSON.stringify(ctx.data) }
  })
})

// phasing is structural: a sections-plan (no slice/params) runs the cheap summary scope first, the plan itself is never rewritten
Test('fastReport.sectionsPlanRunsSummaryFirst', {
  impl: dataTest({
    calculate: () => {
      const ctx = new coreUtils.Ctx({ vars: { reportsRegistry: dsls.common.data.verifiedReportsRegistry.$run() } })
      const slots = jb.workflowUtils.normalizeReportTemplateSlots({ reportId: 'sales-overview', scope: 'none',
        sections: ['trend'], sectionDepth: 'summary', rows: { source: 'section', sectionId: 'trend' } }, ctx)
      const elems = coreUtils.resolveProfileArgs(jb.workflowUtils.fastReportFlow(slots)).elems
      const firstRun = elems.find(e => e.goal == 'Run selected report')
      return { phased: jb.workflowUtils.fastReportPhased(slots), phaseScope: firstRun.value?.scope,
        phaseSections: firstRun.value?.sections, planSections: slots.sections, planRows: slots.rows,
        withParams: jb.workflowUtils.fastReportPhased({ ...slots, params: { trend: { maxRows: 5 } } }),
        withSlice: jb.workflowUtils.fastReportPhased({ ...slots, slice: { sectionId: 'trend', sql: 'SELECT 1 FROM full_data' } }) }
    },
    expectedResult: ctx => ctx.data.phased && ctx.data.phaseScope == 'summary' && ctx.data.phaseSections.length == 0
      && ctx.data.planSections[0] == 'trend' && ctx.data.planRows.sectionId == 'trend'
      && !ctx.data.withParams && !ctx.data.withSlice || { testFailure: JSON.stringify(ctx.data) }
  })
})

Test('reportsTemplate.capsSliceLimit', {
  impl: dataTest({
    calculate: () => {
      const ctx = new coreUtils.Ctx({ vars: { reportsRegistry: dsls.common.data.verifiedReportsRegistry.$run() } })
      return jb.workflowUtils.normalizeReportTemplateSlots({ reportId: 'sales-overview', scope: 'none', sections: ['trend'], sectionDepth: 'summary',
        rows: { source: 'section', sectionId: 'trend' },
        slice: { sectionId: 'trend',
          sql: 'SELECT branch, round(sum(net)) AS net FROM full_data GROUP BY 1 ORDER BY 2 DESC LIMIT 999' } }, ctx).slice.sql
    },
    expectedResult: contains('LIMIT 20')
  })
})

// agent selection is debug-only
const composerHarness = multi => (ctx, { react: { hh, useState } }) => () => {
  const [selected, setSelected] = useState(['basicAnalytics'])
  return hh(ctx, dsls.react['react-comp'].AnalyticsComposer, { send: () => {}, disabled: false, selected, setSelected, multi })
}
Test('reactTest.comax.agentDropdownHiddenOutsideDebug', {
  impl: reactTest({
    testedComp: composerHarness(false),
    expectedResult: not(contains('בחירת סוכן')),
    userActions: [delay(80)]
  })
})

Test('reactTest.comax.agentDropdownMultiDebug', {
  impl: reactTest({
    testedComp: composerHarness(true),
    expectedResult: and(contains('SQL + fast-report'), contains('מצב דיבאג')),
    userActions: [delay(80), click('בחירת סוכן'), delay(80), click('fast-report'), delay(80)]
  })
})

// debug-only model picker: the four selectable models render in multi/debug mode, and are absent in single mode
Test('reactTest.comax.modelPickerDebug', {
  impl: reactTest({
    testedComp: composerHarness(true),
    expectedResult: and(contains('Gemini Flash 3.5'), contains('GPT-5.5'), contains('GPT-5.4'), contains('GPT-5.4 mini')),
    userActions: [delay(60)]
  })
})
Test('reactTest.comax.modelPickerHiddenInSingle', {
  impl: reactTest({
    testedComp: composerHarness(false),
    expectedResult: not(contains('GPT-5.5')),
    userActions: [delay(60)]
  })
})

Test('reactTest.comax.datasetPinnedBig', {
  impl: reactTest({
    testedComp: composerHarness(false),
    expectedResult: not(contains('בחירת מאגר נתונים')),
    userActions: [delay(80)]
  })
})

const comparisonMsg = { id: 'cmp1', sender: 'Assistant', type: 'agentComparison', content: 'השוואת 2 סוכנים', comparison: [
  { agent: 'basicAnalytics', durMs: 4200, payload: { ...answer } },
  { agent: 'fast-report', durMs: 2100, payload: { ...answer, content: 'תשובת דוח בלבד', narrative: 'נרטיב דוח', widgets: [], rows: [] } }
]}
Test('reactTest.comax.agentComparisonTimingAndCollapse', {
  impl: reactTest({
    testedComp: (ctx, { react: { hh } }) => () => hh(ctx, dsls.react['react-comp'].AgentComparison, { element: comparisonMsg, send: () => {} }),
    expectedResult: and(contains('הרצה במקביל'), contains('4.2s'), contains('2.1s'), contains('18,400'), not(contains('תשובת דוח בלבד'))),
    userActions: [delay(100), click('fast-report'), delay(80)]
  })
})
