import {dsls, jb} from '@jb6/core'
import '@jb6/common'
import '@jb6/testing'
import '@jb6/react/tests/react-testers.js'
import {cleanAnswer, combineReportResults, normalizeReportRoute, PROMOTION_ACTION_QUESTION} from '../Agents/reports-template-agent.js'
import {chatHistoryEntry, promotionAlertData, uniqueReportReactComps} from '../App/comaxApp.js'
import '../Comps/promotion-report-ui.js'

const {common: {boolean: {and, contains}}, test: {Test, test: {dataTest, reactTest}},
  react: {'ui-action': {actions, click, waitForText}}} = dsls
const SHABBAT_CAVEAT = 'אם היום המלא האחרון הוא שבת — יופיעו רק סניפי השבת.'
const accumulatedContext = {
  chatHistory: [
    {role: 'user', content: 'כמה מבצעים מפסידים יש?'},
    {role: 'assistant', content: 'יש 95 מבצעים מפסידים.',
      plan: {reportId: 'promotions', sections: [], sectionDepth: 'summary', params: {}}, verified: true,
      rowsShown: [{active_promos: 729, losing_promos: 95}], entitiesShown: {}, caveats: [SHABBAT_CAVEAT]}
  ]
}
const includes = (text, values) => values.every(value => text.includes(value))
const reportsRegistry = [
  {id: 'promotions', sections: [{id: 'coverage'}]},
  {id: 'promo-recommendations', sections: [{id: 'rerun-winners'}, {id: 'stop-list'}]}
]

Test('comaxContext.routerReceivesAssistantData', {
  impl: dataTest({
    calculate: ctx => jb.workflowUtils.reportTemplateRoutePrompt(ctx.setVars({
      TODAYS_DATE: '7/20/2026', userMessage: 'מה המבצעים המפסידים?', accumulatedContext
    })),
    expectedResult: ctx => includes(ctx.data, ['CONVERSATION_CONTEXT', 'assistant', 'losing_promos', '95',
      'promotions', SHABBAT_CAVEAT]) || {testFailure: ctx.data},
    logger: 'workflowLogger'
  })
})

// the router sees WHAT the user saw (plan, rows, caveats) - never internal sql/llm code
Test('comaxContext.routerKeepsShownDataDropsInternals', {
  impl: dataTest({
    calculate: ctx => jb.workflowUtils.reportTemplateRoutePrompt(ctx.setVars({
      TODAYS_DATE: '7/20/2026', userMessage: 'מה המבצע המוביל?', accumulatedContext: {chatHistory: [
        chatHistoryEntry({sender: 'Assistant', content: 'תות שדה מוביל.', sql: 'SECRET SQL', llmGeneratedCode: 'SECRET FLOW',
          turnRecord: {plan: {reportId: 'promotions', sections: ['promo-extrema'], sectionDepth: 'summary', params: {}},
            rowsShown: [{deal_name: 'תות שדה', margin_ils: 469119}], entitiesShown: {product: ['תות שדה']},
            caveats: ['ההשוואה מול בסיס של אותם פריטים.'], verified: true}}, true)
      ]}
    })),
    expectedResult: ctx => includes(ctx.data, ['תות שדה מוביל.', '469119', 'promo-extrema', 'ההשוואה מול בסיס'])
      && !['SECRET SQL', 'SECRET FLOW'].some(x => ctx.data.includes(x))
      && ctx.data.length < 3000 || {testFailure: ctx.data},
    logger: 'workflowLogger'
  })
})

Test('llmSummary.conversationContextKeepsAssistantData', {
  impl: dataTest({
    calculate: () => jb.workflowUtils.conversationContextText(accumulatedContext),
    expectedResult: ctx => includes(ctx.data, ['assistant', 'losing_promos', '95', SHABBAT_CAVEAT]) || {testFailure: ctx.data},
    logger: 'workflowLogger'
  })
})

// multi-report is a ROUTER decision now (no regex): the shortlist normalizes; unknown ids are invalid → router retry
Test('reportsTemplate.normalizesGeneralMultiReportRoute', {
  impl: dataTest({
    calculate: ctx => [normalizeReportRoute({mode: 'reports', reports: [
      {reportId: 'promotions', candidateSections: ['coverage']},
      {reportId: 'promo-recommendations', candidateSections: ['rerun-winners', 'stop-list']}
    ]}, ctx.setVars({userMessage: PROMOTION_ACTION_QUESTION, reportsRegistry})),
    normalizeReportRoute({mode: 'reports', reports: [{reportId: 'promotions'}, {reportId: 'missing'}]},
      ctx.setVars({userMessage: 'שלב דוחות', reportsRegistry}))],
    expectedResult: ctx => ctx.data[0].mode == 'reports' && ctx.data[0].reports?.length == 2
      && ctx.data[0].reports[1].candidateSections.join(',') == 'rerun-winners,stop-list'
      && !!ctx.data[1].invalid
      && includes(jb.workflowUtils.reportTemplateRouteInstructions, ['Return 1-3 reports', 'multiple reports'])
      || {testFailure: JSON.stringify(ctx.data)},
    logger: 'workflowLogger'
  })
})

Test('reportsTemplate.combinesNamespacedResults', {
  impl: dataTest({
    calculate: () => combineReportResults([
      {route: {reportId: 'promotions'}, execution: {reportResult: {title: 'ביצועים',
        results: {summary: [{losing_promos: 95}]}, widgets: [{kind: 'kpi'}]}}},
      {route: {reportId: 'promo-recommendations'}, execution: {reportResult: {title: 'המלצות',
        results: {summary: [{recommendations: 12}]}, widgets: [{kind: 'table'}]}}}
    ]),
    expectedResult: ctx => ctx.data.results.reports.promotions.summary[0].losing_promos == 95
      && ctx.data.results.reports['promo-recommendations'].summary[0].recommendations == 12
      && ctx.data.widgets.map(widget => widget.reportId).join(',') == 'promotions,promo-recommendations'
      || {testFailure: JSON.stringify(ctx.data)},
    logger: 'workflowLogger'
  })
})

Test('reportsTemplate.cleansSummaryNumbers', {
  impl: dataTest({
    calculate: () => cleanAnswer('729.00 מבצעים, מכפיל 1.48.00', {reportId: 'promotions+promo-recommendations', sections: []}),
    expectedResult: ctx => ctx.data == '729 מבצעים, מכפיל 1.48' || {testFailure: ctx.data}, logger: 'workflowLogger'
  })
})

Test('comaxApp.keepsDistinctReportPanels', {
  impl: dataTest({
    calculate: () => uniqueReportReactComps([
      {cmpId: 'promotionReportPanel', reportId: 'promo-recommendations', slot: 'rerun-winners'},
      {cmpId: 'promotionReportPanel', reportId: 'promo-recommendations', slot: 'stop-list'}]),
    expectedResult: ctx => ctx.data.length == 2 || {testFailure: JSON.stringify(ctx.data)}, logger: 'workflowLogger'
  })
})

Test('comaxHome.promotionAlertShowsLossAndLaunches', {
  impl: dataTest({
    calculate: () => promotionAlertData({active_promos: 729, losing_promos: 95, losing_margin_ils: -74658}, {rerun_deals: 13}),
    expectedResult: ctx => ctx.data.activePromos == 729 && ctx.data.losingPromos == 95
      && ctx.data.activeGrossLossIls == 74658 && ctx.data.recommendedPromos == 13
      || {testFailure: JSON.stringify(ctx.data)},
    logger: 'workflowLogger'
  })
})

Test('promotionReportPanel.recommendationEvidence', {
  impl: reactTest({
    testedComp: (ctx, {react: {hh}}) => () => hh(ctx, dsls.react['react-comp'].promotionReportPanel, {spec: {
      mode: 'recommendations', title: 'מבצעים מומלצים', fields: ['recommendation', 'lift_multiplier'], rows: [{
        deal_name: 'מבצע בדיקה', recommendation: 'להפעיל', on_daily_net: 1800, off_daily_net: 600,
        uplift_daily_net: 1200, lift_multiplier: 3, margin_pct: 22, cycles_run: 4,
        cycles_chart: '01/26:1300|02/26:1650|03/26:1800|04/26:1750'
      }]
    }}),
    expectedResult: and(contains('קצב מכירות יומי: מבצע מול רגיל'), contains('המחזורים האחרונים מול הקצב הרגיל'),
      contains('ללא מבצע'), contains('מחזור מבצע')),
    userActions: actions(click('מבצע בדיקה'), waitForText('מחזור מבצע')),
    logger: 'uiLogger'
  })
})
