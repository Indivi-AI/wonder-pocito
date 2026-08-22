import { dsls, jb } from '@jb6/core'
import '@wonder/db/db-drivers.js'

const { wfetch2 } = jb.wonderUtils
import '@jb6/common'
import '@jb6/testing'
import '../nostalgy/reports-based-agent.js'
import { constrainSlots, markUnverifiedAnswer, normalizeReportRoute, validateCustomAnswer } from '../Agents/reports-template-agent.js'
import '../Agents/fast-report-agent.js'
import '../nostalgy/structured-reports-template-agent.js'
import '../Agents/parallel-agent.js'
import '../Agents/agents-repo.js'
import '../Agents/report-edit-agent.js'
import '@wonder/verified-queries/verified-queries-assets.js'
import '@jb6/react/tests/react-testers.js'
import '../App/reports-workspace.js'
import '../App/report-studio.js'
import { buildRequestBody, fetchItemsFromLLMReactiveP } from '@wonder/ai/reactive-llm.js'

const {
  tgp: { 'ctx-enricher': { setVars } },
  common: { data: {
    editReportStudioDraft, runReport, queryReportFullData, verifiedReportsRegistry, loadVerifiedReportsAsAssets, testVerifiedSlot
  }, boolean: { contains, equals, notContains, and } },
  test: { Test, test: { dataTest, reactTest } },
  react: { 'ui-action': { actions, click, waitForText, delay } },
  react: { 'react-comp': { reportsWorkspace, reportStudio } },
  ai: { 'flow-elem': { finalAnswerFromReport } }
} = dsls

const llmProxyUrl = 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy'
const SUMMARY_MODEL = 'openai/gpt-5.4'
const LOCAL_ROOT = new URL('../../../../files/rooms/comaxDemo/usersRO/parquet/OEM_BI_4466', import.meta.url).pathname   // local parquet copy - runReport without wresolve
const ALL_QIDS = [...Array(50)].map((_, i) => 'Q' + (i + 1))
const SEC_DEPTHS = ['executiveSummary', 'summary', 'inDepth']
const reportSqls = r => [r.executiveSummary?.sql, r.summary?.sql, ...(r.sections || []).flatMap(s => [...SEC_DEPTHS.map(d => s[d]?.sql), s.fullData?.viewSql])]
const WIDGET_KINDS = 'bar,hbar,pie,funnel,treemap,waterfall,line,area,stackedBar,groupedBar,kpi,table,scatter,heatmap,histogram'.split(',')
const WIDGET_BINDING = {
  kpi: w => w.items?.length && w.items.every(i => i.label && i.col), table: w => w.columns?.length && w.columns.every(c => c.key && c.label),
  line: w => w.x && (w.ys?.length || w.y), area: w => w.x && (w.ys?.length || w.y),
  stackedBar: w => w.category && (w.ys?.length || (w.value && w.seriesBy)), groupedBar: w => w.category && (w.ys?.length || (w.value && w.seriesBy)),
  scatter: w => w.x && w.y, heatmap: w => w.x && w.y && w.value, histogram: w => w.value
}
const widgetIssue = (id, w) => !w ? `${id}: missing widget` : !WIDGET_KINDS.includes(w.kind) ? `${id}: bad widget kind '${w.kind}'`
  : !w.title ? `${id}: widget without title` : !(WIDGET_BINDING[w.kind] || (x => x.name && x.value))(w) ? `${id}: widget '${w.kind}' missing column bindings` : null
const withRegistry = ctx => ctx.setVars({ reportsRegistry: verifiedReportsRegistry.$runWithCtx(ctx) })
// real catalog + local duckdb root + a live workflowLogger so tests can assert the runReport log lines, not just rows
const reportsTestEnv = setVars(ctx => ({ db: 'local', dbHost: 'node', reportsRegistry: verifiedReportsRegistry.$runWithCtx(ctx), reportsRoot: LOCAL_ROOT,
  workflowLogger: dsls.test.logger.workflowLoggerProfile.$runWithCtx(ctx) }))
const studioEdit = (userMessage, more = {}) => async ctx => editReportStudioDraft.$runWithCtx(ctx, {
  userMessage, currentReport: verifiedReportsRegistry.$runWithCtx(ctx).find(r => r.id == 'promotions'), reportsRoot: LOCAL_ROOT,
  roomWUrl: 'room://comax-report-studio-test/usersRW', selectedSlotKey: 'coverage.summary', saveDraft: false, ...more
})

Test('comaxReports.catalogIntegrity', {
  impl: dataTest({
    calculate: ctx => {
      const comaxReports = verifiedReportsRegistry.$runWithCtx(ctx)
      const covered = new Set(comaxReports.flatMap(r => r.questionsCovered || []))
      return [
        comaxReports.length < 13 && `expected at least 13 reports, got ${comaxReports.length}`,
        ...comaxReports.flatMap(r => [
          ...['executiveSummary', 'summary'].filter(d => !r[d]?.sql).map(d => `${r.id}: missing report-level ${d}.sql`),
          ...['executiveSummary', 'summary'].map(d => widgetIssue(`${r.id}.${d}`, r[d]?.widget)),
          ...(r.sections || []).flatMap(s => [
            ...SEC_DEPTHS.filter(d => !s[d]?.sql).map(d => `${r.id}/${s.id}: missing ${d}.sql`),
            ...SEC_DEPTHS.map(d => widgetIssue(`${r.id}/${s.id}.${d}`, s[d]?.widget)),
            !s.fullData?.viewSql && `${r.id}/${s.id}: missing fullData.viewSql`]),
          ...reportSqls(r).filter(sql => sql && !sql.includes('{{ROOT}}') && !/\bfull_data\b/.test(sql))
            .map(sql => `${r.id}: sql without {{ROOT}}: ${sql.slice(0, 60)}`)]),
        ...ALL_QIDS.filter(q => !covered.has(q)).map(q => `${q} not covered by any report`)
      ].filter(Boolean)
    },
    expectedResult: ctx => ctx.data.length == 0 || { testFailure: ctx.data.join('; ') },
    timeout: 3000
  })
})

// the extrema comparison is a VERIFIED catalog section (promo-extrema) - same numbers the old hand-written slice produced
Test('comaxReports.promotionsBestWorstBig', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: runReport({ reportId: 'promotions', scope: 'none', sections: ['promo-extrema'], sectionDepth: 'summary' }),
    expectedResult: ctx => {
      const rows = ctx.data?.results?.sections?.['promo-extrema']?.rows, widget = ctx.data?.widgets?.[0]
      return rows?.length == 2 && rows[0].comparison == 'הכי מצליח'
        && rows[0].promo_name == 'קנייה מעל 500 משלוחים חינם אם המושבות'
        && Math.abs(rows[0].margin_ils - 868897.7) < .1 && rows[1].comparison == 'הכי כושל'
        && rows[1].promo_name == 'טסטר צויס 29.90 ₪' && Math.abs(rows[1].margin_ils + 60161.5) < .1
        && widget?.kind == 'bar' && widget.data?.length == 2
        || { testFailure: JSON.stringify({ rows, widget })?.slice(0, 500) }
    },
    timeout: 60000
  })
})

// the LLM-facing catalog booklet must name every report + full_data columns, and never leak the sql bodies
Test('comaxReports.bookletHidesSqlBodies', {
  impl: dataTest({
    calculate: ctx => jb.workflowUtils.bookletContent('comaxReportsCatalog', ctx.setVars({ categories: { reportsAnalytics: true, local: true } })).then(x => x.nested),
    expectedResult: ctx => {
      const text = String(ctx.data)
      const reportIds = verifiedReportsRegistry.$runWithCtx(ctx).map(r => r.id)
      const missing = [...reportIds, 'full_data', 'questionsCovered', 'runReport', 'queryReportFullData'].filter(t => !text.includes(t))
      return missing.length == 0 && !text.includes('read_parquet(')
        || { testFailure: missing.length ? 'booklet missing: ' + missing.join(',') : "booklet leaks sql bodies: contains read_parquet(" }
    },
    timeout: 5000
  })
})

Test('comaxReports.routerIndexCompact', {
  impl: dataTest({
    calculate: ctx => jb.workflowUtils.docletContent('comaxReportsIndex', ctx),
    expectedResult: ctx => {
      const text = String(ctx.data)
      return text.includes('branch-performance') && text.includes('ranking') && !text.includes('read_parquet(') && !text.includes('questionsCovered')
        || { testFailure: text.slice(0, 500) }
    }
  })
})

// router contract: retrieval-only shortlist + coverage-check + anti-repeat + mandatory justification
Test('reportsTemplate.routeInstructionsPinNewContract', {
  impl: dataTest({
    calculate: () => jb.workflowUtils.reportTemplateRouteInstructions,
    expectedResult: and(contains('You only SHORTLIST 1-3 reports'), contains('COVERAGE CHECK (mode=directResponse)'),
      contains('ANTI-REPEAT'), contains('justification is MANDATORY'),
      contains("mode=customAnswer only when no report's data covers the question at all"))
  })
})

Test('comaxReports.monthComparisonRealData', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: async ctx => {
      const sections = ['trend','branch-comparison','item-drivers','supplier-drivers']
      const d = await runReport.$runWithCtx(ctx, { reportId: 'sales-overview', scope: 'summary', sections, sectionDepth: 'summary' })
      const trend = d?.widgets?.find(x => x.slot == 'trend')
      return { error: d?.error, months: [d?.results?.summary?.[0]?.current_month, d?.results?.summary?.[0]?.previous_month],
        rows: sections.map(id => d?.results?.sections?.[id]?.rows?.length),
        widgets: d?.widgets?.map(x => ({ kind: x.kind, title: x.title, series: x.series?.length })),
        trend: { smooth: trend?.smooth, points: trend?.series?.map(s => s.points.length), labels: trend?.series?.[0]?.points.map(p => p.x) },
        errors: ctx.vars.workflowLogger.workflowErrors }
    },
    expectedResult: ctx => !ctx.data.error && ctx.data.months.join(',') == '2026-05,2026-04' && ctx.data.rows.every(Boolean)
      && ctx.data.widgets.map(x => x.kind).join(',') == 'kpi,line,table,groupedBar,groupedBar'
      && ctx.data.widgets.slice(-2).map(x => x.title).join(',') ==
        'מכירות לפי היררכיית פריט — חודש מול קודם,מכירות לפי ספק — חודש מול קודם'
      && ctx.data.widgets.slice(-2).every(x => x.series == 2) && ctx.data.trend.smooth === false
      && ctx.data.trend.points.every(n => n == 36) && ctx.data.trend.labels.some(x => x.includes('★'))
      && !ctx.data.errors.length || { testFailure: JSON.stringify(ctx.data) },
    timeout: 180000,
    logger: 'dbLogger,workflowLogger'
  })
})

// current-turn caveats must reach llmSummary VERBATIM - a caveat truncated mid-sentence cannot license a coverage-gap explanation
Test('llmSummary.caveatsNeverTruncated', {
  impl: dataTest({
    calculate: () => {
      const longCaveat = 'אם היום המלא האחרון הוא שבת יופיעו רק סניפי השבת. '.repeat(10)
      const compact = jb.workflowUtils.compactLLMSummaryValue({
        title: 'x'.repeat(400),
        caveats: longCaveat,
        results: { sections: { 'daily-pulse': { caveats: [longCaveat], rows: [] } } }
      })
      return { reportCaveat: compact.caveats, sectionCaveat: compact.results.sections['daily-pulse'].caveats[0], title: compact.title }
    },
    expectedResult: ctx => !ctx.data.reportCaveat.includes('...') && ctx.data.reportCaveat.length > 300
      && !ctx.data.sectionCaveat.includes('...') && ctx.data.title.endsWith('...')
      || { testFailure: JSON.stringify({ r: ctx.data.reportCaveat.length, s: ctx.data.sectionCaveat.length }) }
  })
})

Test('fastReport.sliceAnswerIsUnverified', {
  impl: dataTest({
    calculate: () => markUnverifiedAnswer({ text: 'תשובה', reportsUsed: [{ reportId: 'sales-overview' }] }),
    expectedResult: ctx => ctx.data.verified === false && ctx.data.verificationWarning
      && ctx.data.text.startsWith(ctx.data.verificationWarning) || { testFailure: JSON.stringify(ctx.data) }
  })
})

Test('fastReport.middlePlannerUsesGpt54Mini', {
  impl: dataTest({
    calculate: () => dsls.ai.workflow['fast-report'][jb.coreUtils.asJbComp].params.find(p=>p.id=='model').defaultValue,
    expectedResult: equals('openai/gpt-5.4-mini')
  })
})

Test('fastReport.twoStageGptOssModels', {
  impl: dataTest({
    calculate: () => Object.fromEntries(dsls.ai.workflow['fast-report'][jb.coreUtils.asJbComp].params
      .filter(p => ['routerModel', 'plannerModel'].includes(p.id)).map(p => [p.id, p.defaultValue])),
    expectedResult: ctx => ctx.data.routerModel == 'groq/openai/gpt-oss-20b'
      && ctx.data.plannerModel == 'groq/openai/gpt-oss-120b' || {testFailure: JSON.stringify(ctx.data)}
  })
})

// the extrema question is answerable ONLY through the catalog now: the promo-extrema section must be
// discoverable by the router (goal text) and carry the hand-tuned answerInstructions
Test('reportsTemplate.promoExtremaIsCatalogDiscoverable', {
  impl: dataTest({
    calculate: ctx => {
      const registry = verifiedReportsRegistry.$runWithCtx(ctx)
      const catalog = jb.workflowUtils.reportTemplateRouteCatalog(registry)
      const section = registry.find(r => r.id == 'promotions').sections.find(s => s.id == 'promo-extrema')
      return { catalogHasSection: catalog.includes('section promo-extrema'),
        catalogHasGoal: catalog.includes('הכי מצליח'), instructions: section?.answerInstructions || '' }
    },
    expectedResult: ctx => ctx.data.catalogHasSection && ctx.data.catalogHasGoal
      && ctx.data.instructions.includes('מרווח גולמי') || { testFailure: JSON.stringify(ctx.data) }
  })
})


Test('reportsTemplate.customAnswerSqlReplay', {
  impl: dataTest({
    calculate: async ctx => {
      const valid = await validateCustomAnswer(ctx, { runRes: { text: 'תשובה', sql: 'SELECT 1 AS correlation',
        rows: [{correlation: 1}], widgets: [{kind:'bar', valueCol:'correlation', valueFormat:'int'}] } })
      const mismatch = await validateCustomAnswer(ctx, { runRes: { text: 'תשובה', sql: 'SELECT 1 AS n', rows: [{n: 2}] } })
        .catch(e => e.message)
      return { valid, mismatch }
    },
    expectedResult: ctx => ctx.data.valid.runRes.verified === false && ctx.data.valid.runRes.widgets[0].valueFormat == ''
      && ctx.data.valid.runRes.text.startsWith('התשובה אינה מאומתת')
      && !ctx.data.valid.runRes.text.includes('This answer') && ctx.data.mismatch.includes('do not match'),
    timeout: 5000
  })
})

// a router answer with no usable reports is INVALID (feeds the router retry), never silently coerced
Test('reportsTemplate.missingReportsAreInvalidForRetry', {
  impl: dataTest({
    calculate: ctx => [normalizeReportRoute({}, withRegistry(ctx)),
      normalizeReportRoute({mode: 'reports', reports: [{reportId: 'promotions', candidateSections: ['profitable-promotions']}]},
        withRegistry(ctx))],
    expectedResult: ctx => !!ctx.data[0].invalid && ctx.data[1].mode == 'reports'
      && ctx.data[1].reports[0].candidateSections.join(',') == 'profitable-promotions'
      || { testFailure: JSON.stringify(ctx.data) }
  })
})

Test('reportsTemplate.groqGptOssRouterNoReasoningOrMaxTokens', {
  impl: dataTest({
    calculate: () => buildRequestBody('openai/gpt-oss-20b', [{role: 'user', content: 'x'}], null, 0, 'i', '', 'groq', 0).body,
    expectedResult: ctx => ctx.data.include_reasoning === false && ctx.data.reasoning_effort == 'low'
      && !('max_tokens' in ctx.data) && !ctx.data.messages[0].content.includes('max of')
      || { testFailure: JSON.stringify(ctx.data) }
  })
})

Test('reportsTemplate.openAiGpt5UsesMaxCompletionTokens', {
  impl: dataTest({
    calculate: () => ['gpt-5.4', 'gpt-5.5'].map(model => buildRequestBody(model, [{role: 'user', content: 'x'}], 123, 0, 'i', '', 'openai', 0).body),
    expectedResult: ctx => ctx.data.every(b => b.max_completion_tokens == 123 && !('max_tokens' in b) && b.reasoning_effort == 'none')
      || { testFailure: JSON.stringify(ctx.data) }
  })
})

Test('llm.openAiGpt54Smoke', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: async ctx => {
      const workflowLogger = dsls.test.logger.workflowLoggerProfile.$runWithCtx(ctx)
      const llmCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx.setVars({ db: 'local', isLocalHost: false, llmProxyUrl, workflowLogger, categories: { local: true } }))
      const { responseText, llmStats, outputTokens } = await fetchItemsFromLLMReactiveP({ ctx: llmCtx,
        model: SUMMARY_MODEL, goal: 'openai gpt-5.4 smoke', prompt: 'ענה בדיוק בשתי מילים בעברית: מכירות יציבות',
        instructions: '', maxTokens: 80, temperature: 0, thinkingBudget: 0 })
      return { responseText, llmStats, outputTokens, errors: workflowLogger.workflowErrors }
    },
    expectedResult: ctx => /מכירות|יציבות/.test(ctx.data.responseText || '') && !ctx.data.errors?.length
      && ctx.data.llmStats?.inputTokens > 0 && ctx.data.outputTokens > 0
      && ctx.data.outputTokens == ctx.data.llmStats.outputTokens
      || { testFailure: JSON.stringify(ctx.data) },
    timeout: 60000
  })
})

Test('reportsTemplate.normalizeRowsScopeFallback', {
  impl: dataTest({
    calculate: ctx => jb.workflowUtils.normalizeReportTemplateSlots({
      reportId: 'branch-performance', scope: 'none', sections: [], sectionDepth: 'summary',
      rows: { source: 'scope', scope: 'summary' }, entities: [{ entity: 'branch', query: 'גני תקווה', varName: 'selectedBranches', mode: 'single' }]
    }, withRegistry(ctx)),
    expectedResult: ctx => ctx.data.scope == 'summary' && ctx.data.entities?.length == 1 && ctx.data.rows.source == 'scope'
      || { testFailure: JSON.stringify(ctx.data) }
  })
})

Test('reportsTemplate.qlikUsesExecutiveBaseline', {
  impl: dataTest({
    calculate: ctx => jb.workflowUtils.normalizeReportTemplateSlots({ reportId: 'qlik-sales-pulse', scope: 'summary',
      sections: ['sales-momentum', 'branch-drivers'], sectionDepth: 'summary',
      rows: { source: 'section', sectionId: 'branch-drivers' } }, withRegistry(ctx)),
    expectedResult: ctx => ctx.data.scope=='executiveSummary'&&ctx.data.sections.join(',')=='sales-momentum,branch-drivers'||{testFailure:JSON.stringify(ctx.data)}
  })
})

Test('reportsTemplate.normalizeSliceKeepsBranchEntity', {
  impl: dataTest({
    calculate: ctx => jb.workflowUtils.normalizeReportTemplateSlots({
      reportId: 'promotions', scope: 'none', sections: ['coverage'], sectionDepth: 'summary',
      rows: { source: 'section', sectionId: 'coverage' },
      entities: [{ entity: 'branch', query: 'גני תקווה', varName: 'selectedBranches', mode: 'single' }],
      slice: { sectionId: 'coverage',
        sql: 'SELECT branch, round(sum(promo_net)) AS promo_net FROM full_data WHERE branch IN (%$selectedBranches.sqlLabelsIn%) GROUP BY 1 ORDER BY 2 DESC' }
    }, withRegistry(ctx)),
    expectedResult: ctx => ctx.data.entities?.[0]?.varName == 'selectedBranches' && ctx.data.slice.sql.includes('LIMIT 20')
      || { testFailure: JSON.stringify(ctx.data) }
  })
})

Test('reportsTemplate.rejectsBraceSlicePlaceholder', {
  impl: dataTest({
    calculate: ctx => { try { return jb.workflowUtils.normalizeReportTemplateSlots({
      reportId: 'promotions', scope: 'none', sections: ['coverage'], sectionDepth: 'summary',
      rows: { source: 'section', sectionId: 'coverage' }, entities: [{ entity: 'branch', query: 'גני תקווה', varName: 'selectedBranches', mode: 'single' }],
      slice: { sectionId: 'coverage', sql: 'SELECT branch, sum(promo_net) AS promo_net FROM full_data WHERE branch IN ({{selectedBranches.sqlLabelsIn}}) GROUP BY 1' }
    }, withRegistry(ctx)) } catch(e) { return e.message } },
    expectedResult: contains('invalid slice')
  })
})

Test('comaxReports.selectedDetailsLazy', {
  impl: dataTest({
    calculate: ctx => jb.workflowUtils.docletContent('comaxSelectedReportDetails', ctx.setVars({ selectedReportIds: ['branch-performance'] })),
    expectedResult: ctx => {
      const text = String(ctx.data)
      return text.includes('branch-performance') && text.includes('fullData') && !text.includes('promo-recommendations')
        || { testFailure: text.slice(0, 500) }
    }
  })
})

Test('comaxReports.finalAnswerPromptUsesDeclarativeWidgets', {
  impl: dataTest({
    calculate: ctx => jb.workflowUtils.docletContent('essentialOutputFormat.reports', ctx),
    expectedResult: ctx => {
      const text = String(ctx.data)
      return text.includes('Charts use kind + nameCol + valueCol') && text.includes("table uses kind:'table' + columns only")
        && text.includes('Never pass data, rows, series, items, values, categories')
        || { testFailure: text.slice(text.indexOf('finalAnswerFromReport params'), text.indexOf('finalAnswerFromReport params') + 800) }
    },
    timeout: 3000
  })
})

Test('comaxReports.promptsUseTgpHumanFeedbackPlaceholders', {
  impl: dataTest({
    calculate: async ctx => [jb.workflowUtils.reportTemplateSlotInstructions,
      await jb.workflowUtils.docletContent('essentialOutputFormat.reports', ctx),
      await jb.workflowUtils.docletContent('essentialOutputFormat.analytics', ctx.setVars({ categories: { analytics: true, local: true } })),
      await jb.workflowUtils.docletContent('asHumanFeedbackFlowElem', ctx)].join('\n'),
    expectedResult: ctx => {
      const text = String(ctx.data), bad = text.match(/\{\{selected(?:Products|Branches)[^}]*\}\}/g)
      return text.includes('%$selectedProducts.sqlIn%') && text.includes('%$selectedBranches.sqlLabelsIn%') && !bad
        || { testFailure: bad?.join(',') || text.slice(0, 500) }
    },
    timeout: 3000
  })
})

Test('comaxReports.runReportSalesOverview', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: runReport({ reportId: 'sales-overview', scope: 'executiveSummary', sections: ['trend'], sectionDepth: 'summary' }),
    expectedResult: ctx => {
      const d = ctx.data, log = (ctx.vars.workflowLogger?.workflowLog || []).find(l => l.t == 'runReport')
      const execRows = d?.results?.executiveSummary, trendRows = d?.results?.sections?.trend?.rows
      const widgetsOk = d?.widgets?.length == 2 && d.widgets.every(w => w.slot && w.kind && w.title
        && (w.data?.length || w.series?.length || w.items?.length || w.rows?.length || w.values?.length))
      return Array.isArray(execRows) && execRows.length > 0 && Array.isArray(trendRows) && trendRows.length > 0
        && log?.scopeRows?.rowCount > 0 && log?.sections?.trend?.rowCount > 0 && widgetsOk
        || { testFailure: `exec:${JSON.stringify(execRows)?.slice(0, 120)} trend:${JSON.stringify(trendRows)?.slice(0, 120)}
widgets:${JSON.stringify(d?.widgets)?.slice(0, 200)} runReportLog:${JSON.stringify(log) || 'MISSING'}` }
    },
    timeout: 120000
  })
})

Test('comaxReports.runReportPromotionsReactComps', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: runReport({ reportId: 'promotions', scope: 'executiveSummary', sections: ['coverage'], sectionDepth: 'summary' }),
    expectedResult: ctx => ctx.data?.reactComps?.length >= 2 && ctx.data.reactComps.every(c => c.cmpId == 'promotionReportPanel' && c.rows?.length)
      || { testFailure: JSON.stringify(ctx.data?.reactComps)?.slice(0, 300) },
    timeout: 120000
  })
})

// every recommendation card field must exist in the returned rows — no silent '—' cells, no English enum values
Test('comaxReports.promoRecommendationsCardsContract', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: runReport({ reportId: 'promo-recommendations', scope: 'executiveSummary',
      sections: ['rerun-winners', 'stop-list', 'clearance-candidates'], sectionDepth: 'summary' }),
    expectedResult: ctx => {
      const comps = ctx.data?.reactComps || []
      const missing = comps.filter(c => c.mode == 'recommendations').flatMap(c => (c.fields || []).filter(f => !(f in (c.rows?.[0] || {}))).map(f => `${c.title}:${f}`))
      const english = comps.flatMap(c => (c.rows || []).slice(0, 3).flatMap(r =>
        ['recommendation', 'rec_mechanic', 'promo_labels']
          .filter(k => /[a-z_]{4,}/.test(String(r[k] ?? '').replace(/(^|\|)(good|warn|bad|info):/g, '')))))
      return comps.length >= 4 && comps.every(c => c.rows?.length) && !missing.length && !english.length
        || { testFailure: JSON.stringify({ comps: comps.map(c => ({ title: c.title, rows: c.rows?.length })), missing, english })?.slice(0, 400) }
    },
    timeout: 300000
  })
})

Test('reportStudioEdit.daysToStockoutDraft', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: studioEdit('הוסף שדה ימים לגמר מלאי', { saveDraft: true }),
    expectedResult: ctx => {
      const d = ctx.data, card = d.validation?.run?.reactComps?.find(c => c.mode == 'promotionCards'), rows = card?.rows || []
      return d.validation?.ok && d.draftWrite?.ok && d.patch?.ops?.length
        && card?.fields?.includes('days_to_stockout')
        && d.report.sections.find(s => s.id == 'coverage').summary.sql.includes('days_to_stockout')
        && rows.some(r => r.days_to_stockout != null) || { testFailure: JSON.stringify({ changes: d.changes,
          draftWrite: d.draftWrite, validation: { ok: d.validation?.ok, rows: d.validation?.rows,
            errors: d.validation?.errors }, fields: card?.fields, row: rows[0], patch: d.patch }) }
    },
    timeout: 120000
  })
})

Test('reportStudioEdit.titleDraft', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: studioEdit('title: כרטיסי מבצעים לטיפול'),
    expectedResult: ctx => ctx.data?.validation?.ok && ctx.data.report.sections.find(s => s.id == 'coverage')?.title == 'כרטיסי מבצעים לטיפול'
      || { testFailure: JSON.stringify({ changes: ctx.data?.changes, title: ctx.data?.report?.sections?.find(s => s.id == 'coverage')?.title, validation: ctx.data?.validation }) },
    timeout: 120000
  })
})

Test('reportStudioEdit.goalDraft', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: studioEdit('goal: להציג קודם מבצעים חלשים שדורשים פעולה'),
    expectedResult: ctx => ctx.data?.validation?.ok && ctx.data.report.sections.find(s => s.id == 'coverage')?.summary?.goal.includes('מבצעים חלשים')
      || { testFailure: JSON.stringify({ changes: ctx.data?.changes,
        goal: ctx.data?.report?.sections?.find(s => s.id == 'coverage')?.summary?.goal,
        validation: ctx.data?.validation }) },
    timeout: 120000
  })
})

Test('reportStudioEdit.losingPromotionsSqlDraft', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: studioEdit(
      'change the logic behind losing promotions to be active promotions with negative margin_pct or negative item_sales_lift_pct',
      { selectedSlotKey: 'report.executiveSummary' }),
    expectedResult: ctx => {
      const d = ctx.data, sql = d.report?.executiveSummary?.sql || ''
      return d.validation?.ok && d.patch?.ops?.some(op => JSON.stringify(op).includes('losing_promos')) && /item_sales_lift_pct|margin_pct/.test(sql)
        || { testFailure: JSON.stringify({ changes: d.changes, errors: d.validation?.errors, sql: sql.slice(0, 600), patch: d.patch }) }
    },
    timeout: 180000
  })
})

Test('reportStudioEdit.lowPerformingTableDraft', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: studioEdit('add a table of all the low performing promotions', { selectedSlotKey: 'coverage.summary' }),
    expectedResult: ctx => {
      const d = ctx.data
      const s = d.report?.sections?.find(x => x.id == 'low-performing-promotions')
        || d.report?.sections?.find(x => /חלש|low-performing|low performing/i.test(`${x.id} ${x.title}`))
      const rows = d.validation?.run?.results?.sections?.[s?.id]?.rows
      const comp = d.validation?.run?.reactComps?.find(c => c.title == s?.summary?.reactComp?.title)
      return d.validation?.ok && s?.summary?.widget?.kind == 'table' && s.summary?.reactComp?.cmpId == 'promotionReportPanel'
        && s.summary?.reactComp?.view == 'table' && s.summary.sql.includes('full_data')
        && rows?.length > 0 && comp?.rows?.length > 0
        || { testFailure: JSON.stringify({ changes: d.changes, errors: d.validation?.errors, section: s, rows: rows?.slice?.(0, 2), comp, patch: d.patch }) }
    },
    timeout: 180000
  })
})

Test('reportStudioEdit.followUpReapplyUsesChatHistory', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: async ctx => {
      const base = verifiedReportsRegistry.$runWithCtx(ctx).find(r => r.id == 'promotions')
      const args = { reportsRoot: LOCAL_ROOT, roomWUrl: 'room://comax-report-studio-test/usersRW',
        selectedSlotKey: 'coverage.summary', saveDraft: false }
      const firstMsg = 'תוריד את השדה של מבצעים בפדיון נמוך'
      const first = await editReportStudioDraft.$runWithCtx(ctx, {...args, userMessage: firstMsg, currentReport: base})
      const secondMsg = 'בעצם תוסיף אותו מחדש'
      const second = await editReportStudioDraft.$runWithCtx(ctx, { ...args, userMessage: secondMsg,
        chatHistory: [{ role: 'user', text: firstMsg }, { role: 'assistant', text: first.text },
          { role: 'user', text: secondMsg }], currentReport: first.report, currentPatch: first.patch })
      return { first, second }
    },
    expectedResult: ctx => {
      const f = ctx.data.first, s = ctx.data.second, keys = s.report?.executiveSummary?.reactComp?.kpis?.map(k => k.key) || []
      return f.validation?.ok && s.validation?.ok
        && !f.report?.executiveSummary?.reactComp?.kpis?.some(k => k.key == 'low_redemption_promos')
        && keys.includes('low_redemption_promos') && JSON.stringify(s.lastPatch || s.patch).includes('low_redemption_promos')
        && !JSON.stringify(s.lastPatch || {}).includes('days_to_stockout')
        || { testFailure: JSON.stringify({ first: { changes: f.changes, ok: f.validation?.ok },
          second: { changes: s.changes, ok: s.validation?.ok, keys, patch: s.lastPatch || s.patch,
            errors: s.validation?.errors } }) }
    },
    timeout: 300000
  })
})

Test('comaxReports.runReportPromotionsProfitable', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: runReport({ reportId: 'promotions', scope: 'none', sections: ['profitable-promotions'], sectionDepth: 'summary' }),
    expectedResult: ctx => {
      const rows = ctx.data?.results?.sections?.['profitable-promotions']?.rows
      return rows?.length > 0 && rows.every(r => r.margin_ils > 0)
        && ctx.data.reactComps?.[0]?.title == 'מבצעים רווחיים'
        && ctx.data.reactComps[0].compactFields?.[0] == 'margin_ils'
        || { testFailure: JSON.stringify({ rows: rows?.slice(0, 2), reactComps: ctx.data?.reactComps }) }
    },
    timeout: 120000
  })
})

Test('promotionReportPanel.kpiFiltersCards', {
  impl: reactTest({
    testedComp: (ctx, { react: { h, hh } }) => () => h('div', {},
      hh(ctx, dsls.react['react-comp'].promotionReportPanel, { spec: { mode: 'kpis', title: 'מדדי מבצעים', kpis: [
        { key: 'profitable_promos', label: 'מבצעים רווחיים', value: 1, tone: 'good' },
        { key: 'losing_promos', label: 'מבצעים מפסידים', value: 1, tone: 'bad' }] } }),
      hh(ctx, dsls.react['react-comp'].promotionReportPanel, { spec: { mode: 'promotionCards', title: 'כרטיסי מבצעים', rows: [
        { promo_name: 'מבצע רווחי', window: '01/01/2026 - 02/01/2026', margin_ils: 10, margin_pct: 20,
          daily_sales_rate: 100, sales_change_ils: 5, sales_lift_multiplier: 1.2, stock_left: 3, sold_items: 1, item_count: 1 },
        { promo_name: 'מבצע מפסיד', window: '01/01/2026 - 02/01/2026', margin_ils: -5, margin_pct: -10,
          daily_sales_rate: 50, sales_change_ils: -2, sales_lift_multiplier: 0.5, stock_left: 2, sold_items: 0, item_count: 2 }] } })),
    userActions: actions(waitForText('מבצע מפסיד'), delay(120), click('מבצעים רווחיים'), delay(80)),
    expectedResult: and(contains('מבצע רווחי'), notContains('מבצע מפסיד'))
  })
})

Test('comaxReports.queryReportFullData', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: queryReportFullData({ reportId: 'sales-overview', sectionId: 'trend',
      sql: 'SELECT weekday_name, round(sum(net)) AS net FROM full_data GROUP BY 1 ORDER BY 2 DESC LIMIT 3' }),
    expectedResult: ctx => {
      const rows = ctx.data, log = (ctx.vars.workflowLogger?.workflowLog || []).find(l => l.t == 'queryReportFullData')
      return Array.isArray(rows) && rows.length == 3 && rows[0].weekday_name && rows[0].net > 0 && log?.rowCount == 3
        || { testFailure: `rows:${JSON.stringify(rows)?.slice(0, 200)} log:${JSON.stringify(log) || 'MISSING'}` }
    },
    timeout: 120000
  })
})

Test('comaxReports.salesOverviewTrendSelectedProductBranch', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: queryReportFullData({ reportId: 'sales-overview', sectionId: 'trend',
      sql: `SELECT branch_id, branch, round(sum(net)) AS net FROM full_data WHERE prt IN (8996,20703)
AND branch_id IN (SELECT branch_id FROM full_data GROUP BY 1 ORDER BY sum(net) DESC LIMIT 1) GROUP BY 1, 2 LIMIT 1` }),
    expectedResult: ctx => ctx.data?.[0]?.branch_id != null && ctx.data[0].branch && ctx.data[0].net > 0
      || { testFailure: JSON.stringify(ctx.data)?.slice(0, 300) },
    timeout: 120000
  })
})

Test('comaxReports.queryReportFullData.productBranchSlice', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: queryReportFullData({ reportId: 'profitability', sectionId: 'item-profit',
      sql: 'SELECT branch, round(sum(net)) AS net FROM full_data WHERE prt IN (8996,20703) GROUP BY 1 ORDER BY 2 DESC LIMIT 20' }),
    expectedResult: ctx => Array.isArray(ctx.data) && ctx.data.length && ctx.data[0].branch && ctx.data[0].net > 0
      || { testFailure: JSON.stringify(ctx.data)?.slice(0, 300) },
    timeout: 120000
  })
})

Test('finalAnswerFromReport.sliceWidgetsReplaceReportWidgets', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: async ctx => (await ctx.setVars({ answer: 'ok', rows: [{ branch: 'גני תקווה', net: 7 }],
      reportWidgets: [{slot: 'item-profit', kind: 'table', title: '25 מובילי הרווח',
        columns: [{key: 'item', label: 'פריט'}], rows: [{item: 'עגבניה ישראל'}]}]})
      .run(finalAnswerFromReport({ goal: 'answer slice', rowsVar: 'rows', reportWidgetsVar: 'reportWidgets', narrative: '{0.branch}', sql: 'slice',
        widgets: [{ kind: 'bar', title: 'מכירות נייר', nameCol: 'branch', valueCol: 'net' }] }))).data,
    expectedResult: ctx => ctx.data?.widgets?.length == 1 && ctx.data.widgets[0].kind == 'bar'
      && ctx.data.widgets[0].data[0].name == 'גני תקווה' && !JSON.stringify(ctx.data.widgets).includes('עגבניה')
      || { testFailure: JSON.stringify(ctx.data?.widgets) }
  })
})

Test('finalAnswerFromReport.keepsReportReactComps', {
  impl: dataTest({
    calculate: async ctx => (await ctx.setVars({ answer: 'ok', rows: [{ branch: 'גני תקווה', net: 7 }],
      reportReactComps: [{ cmpId: 'promotionReportPanel', rows: [{ branch: 'גני תקווה' }] }] })
      .run(finalAnswerFromReport({ goal: 'answer', rowsVar: 'rows', narrative: '{0.branch}', sql: 'x' }))).data,
    expectedResult: ctx => ctx.data?.reactComps?.[0]?.cmpId == 'promotionReportPanel' && ctx.data.reactComps[0].rows[0].branch == 'גני תקווה'
      || { testFailure: JSON.stringify(ctx.data?.reactComps) }
  })
})

Test('reportsTemplate.hidesOnlyDefaultReportWidgetsContract', {
  impl: dataTest({
    calculate: async ctx => {
      const route = normalizeReportRoute({mode: 'reports', reports: [{reportId: 'sales-overview', candidateSections: []}],
        hideWidgets: true}, withRegistry(ctx).setVars({userMessage: 'ומה המוביל?'}))
      const slots = constrainSlots({reportId: 'sales-overview', scope: 'summary', sections: [],
        sectionDepth: 'summary', params: {}}, route)
      const res = await ctx.setVars({answer: 'ok', rows: [{branch: 'A', net: 7}],
        reportWidgets: [{kind: 'table', title: 'default'}], reportReactComps: [{cmpId: 'default'}]})
        .run(finalAnswerFromReport({goal: 'answer', rowsVar: 'rows', reportWidgetsVar: 'reportWidgets',
          hideWidgets: slots.hideWidgets, narrative: '{0.branch}', sql: 'x',
          widgets: [{kind: 'bar', title: 'ad hoc', nameCol: 'branch', valueCol: 'net'}]}))
      return {route, slots, res: res.data,
        prompt: jb.workflowUtils.reportTemplateRouteInstructions.includes('hideWidgets=DEFAULT_WIDGETS_ALREADY_SHOWN')}
    },
    expectedResult: ctx => ctx.data.prompt && ctx.data.route.mode == 'reports' && ctx.data.slots.hideWidgets === true
      && ctx.data.res.widgets?.[0]?.title == 'ad hoc'
      && !ctx.data.res.reactComps.length || {testFailure: JSON.stringify(ctx.data)}
  })
})

Test('finalAnswerFromReport.missingNarrativeColumnFallsBack', {
  impl: dataTest({
    calculate: async ctx => (await ctx.setVars({ answer: '**תשובה נקייה** עם מספרים.', rows: [{ branch: 'גני תקווה', net: 7 }] })
      .run(finalAnswerFromReport({ goal: 'answer', rowsVar: 'rows', narrative: '{0.missing} חסר', sql: 'x' }))).data,
    expectedResult: equals('תשובה נקייה עם מספרים.', '%narrative%')
  })
})

Test('finalAnswerFromReport.tableWidgetMaterializedFromRows', {
  impl: dataTest({
    calculate: async ctx => (await ctx.setVars({ answer: 'ok', rows: [{ branch: 'גני תקווה', net_month: 7, basket: 2 }] })
      .run(finalAnswerFromReport({ goal: 'answer', rowsVar: 'rows', narrative: '{0.branch}', sql: 'x',
        widgets: [{ kind: 'table', title: 'טבלה',
          columns: [{ key: 'branch', label: 'סניף' }, { key: 'net', label: 'נטו' }],
          data: [{ name: 'bad', value: 999 }], rows: [{ branch: 'bad' }] }] }))).data.widgets[0],
    expectedResult: ctx => ctx.data?.kind == 'table' && ctx.data.rows?.[0]?.net_month == 7 && !ctx.data.data && ctx.data.columns?.length == 1 && ctx.data.columns[0].key == 'branch'
      || { testFailure: JSON.stringify(ctx.data) },
    timeout: 3000
  })
})

Test('finalAnswerFromReport.chartWidgetMaterializedFromRows', {
  impl: dataTest({
    calculate: async ctx => (await ctx.setVars({ answer: 'ok', rows: [{ branch: 'גני תקווה', net_month: 7 }] })
      .run(finalAnswerFromReport({ goal: 'answer', rowsVar: 'rows', narrative: '{0.branch}', sql: 'x',
        widgets: [{ kind: 'bar', title: 'תרשים', nameCol: 'missing', valueCol: 'net', data: [{ name: 'bad', value: 999 }], rows: [{ branch: 'bad' }] }] }))).data.widgets[0],
    expectedResult: ctx => ctx.data?.data?.[0]?.name == 'גני תקווה' && ctx.data.data[0].value == 7 && !ctx.data.rows && !JSON.stringify(ctx.data).includes('bad')
      || { testFailure: JSON.stringify(ctx.data) },
    timeout: 3000
  })
})

Test('finalAnswerFromReport.emptyRowsKeepsReportWidgets', {
  impl: dataTest({
    calculate: async ctx => (await ctx.setVars({ answer: 'none', rows: [],
      reportWidgets: [{ kind: 'table', title: 'מקור', columns: [{ key: 'branch' }], rows: [{ branch: 'גני תקווה' }] }] })
      .run(finalAnswerFromReport({ goal: 'answer', rowsVar: 'rows', reportWidgetsVar: 'reportWidgets', narrative: '{0.branch}', emptyNarrative: 'אין נתונים', sql: 'x',
        widgets: [{ kind: 'bar', title: 'לא לבנות', nameCol: 'branch', valueCol: 'net' }] }))).data,
    expectedResult: ctx => ctx.data.narrative == '' && ctx.data.widgets?.[0]?.title == 'מקור'
      || { testFailure: JSON.stringify(ctx.data) },
    timeout: 3000
  })
})

Test('finalAnswerFromReport.emptyRowsNoReportUiSaysNoData', {
  impl: dataTest({
    calculate: async ctx => (await ctx.setVars({ answer: 'none', rows: [] })
      .run(finalAnswerFromReport({ goal: 'answer', rowsVar: 'rows', narrative: '{0.branch}', emptyNarrative: 'אין נתונים', sql: 'x' }))).data,
    expectedResult: equals('אין נתונים', '%narrative%')
  })
})

Test('structuredReportsTemplate.agentRegistered', {
  impl: dataTest({
    calculate: () => dsls.common.data.comaxAnalyticsAgents.$run().map(a => a.id),
    expectedResult: ctx => ctx.data.includes('structuredReportsTemplateAnalytics') || { testFailure: JSON.stringify(ctx.data) }
  })
})

Test('fastReport.agentRegistered', {
  impl: dataTest({
    calculate: () => dsls.common.data.comaxAnalyticsAgents.$run().map(a => a.id),
    expectedResult: ctx => ctx.data.includes('fast-report') && dsls.ai.workflow['fast-report'] || { testFailure: JSON.stringify(ctx.data) }
  })
})

Test('fastReport.widgetsBeforeSummary', {
  impl: dataTest({
    calculate: () => {
      const ctx = new jb.coreUtils.Ctx({ vars: { reportsRegistry: verifiedReportsRegistry.$run() } })
      const slots = jb.workflowUtils.normalizeReportTemplateSlots({ reportId: 'sales-overview', scope: 'executiveSummary',
        sections: ['trend'], sectionDepth: 'summary', rows: { source: 'section', sectionId: 'trend' } }, ctx)
      return jb.coreUtils.resolveProfileArgs(jb.workflowUtils.fastReportFlow(slots)).elems.map(e => e.goal)
    },
    expectedResult: ctx => ctx.data.indexOf('Emit fast widgets') < ctx.data.indexOf('Write answer') || { testFailure: JSON.stringify(ctx.data) }
  })
})

// phasing is structural: a sections-plan runs the cheap qlik executiveSummary scope FIRST, then the sections, then the summary
Test('fastReport.qlikPhasedKeepsExecutiveBaseline', {
  impl: dataTest({
    calculate: () => {
      const reportsRegistry = verifiedReportsRegistry.$run()
      const report = reportsRegistry.find(r => r.id == 'qlik-sales-pulse')
      const ctx = new jb.coreUtils.Ctx({ vars: { reportsRegistry } })
      const slots = jb.workflowUtils.normalizeReportTemplateSlots({ reportId: report.id, scope: 'none',
        sections: ['sales-momentum'], sectionDepth: 'summary' }, ctx)
      const elems = jb.coreUtils.resolveProfileArgs(jb.workflowUtils.fastReportFlow(slots, null, null, report)).elems
      const goals = elems.map(e => e.goal), firstRun = elems.find(e => e.goal == 'Run selected report')
      return { phaseScope: firstRun.value?.scope, phaseSections: firstRun.value?.sections, planSections: slots.sections,
        refreshBeforeSummary: goals.indexOf('Refresh answer rows') < goals.indexOf('Write answer'),
        emitBeforeSections: goals.indexOf('Emit fast widgets') < goals.indexOf('Execute selected sections') }
    },
    expectedResult: ctx => ctx.data.phaseScope == 'executiveSummary' && ctx.data.phaseSections?.length == 0
      && ctx.data.planSections[0] == 'sales-momentum' && ctx.data.refreshBeforeSummary && ctx.data.emitBeforeSections
      || { testFailure: JSON.stringify(ctx.data) }
  })
})

// hand-tuned answer guidance now lives IN the catalog (section answerInstructions), reachable by every slot source
Test('fastReport.sectionAnswerInstructionsReachEvaluation', {
  impl: dataTest({
    calculate: ctx => jb.workflowUtils.normalizeReportTemplateSlots({ reportId: 'promotions', scope: 'none',
      sections: ['profitable-promotions'], sectionDepth: 'summary',
      rows: { source: 'section', sectionId: 'profitable-promotions' } }, withRegistry(ctx)),
    expectedResult: ctx => ctx.data.summaryEvaluation.includes('daily_sales_rate הוא ₪ ליום')
      && ctx.data.sections[0] == 'profitable-promotions' || { testFailure: ctx.data.summaryEvaluation }
  })
})

Test('structuredReportsTemplate.partInputs', {
  impl: dataTest({
    calculate: ctx => jb.workflowUtils.structuredReportPartInputs(ctx.setVars({
      reportsRegistry: [{ id: 'sales-overview', sections: [{ id: 'trend', title: 'מגמה' }] }],
      rows: [{ branch: 'גני תקווה', net: 7 }],
      reportResult: { results: { sections: { trend: { rows: [{ month: '2026-06', net: 7 }] } } } }
    }), { reportId: 'sales-overview', sections: ['trend'], rows: { source: 'scope', scope: 'summary' }, summaryEvaluation: 'סכם' }),
    expectedResult: ctx => ctx.data.length == 2 && ctx.data[0].kind == 'summary' && ctx.data[1].title == 'מגמה' && ctx.data[1].rows[0].net == 7
      || { testFailure: JSON.stringify(ctx.data) }
  })
})

Test('comaxReports.profitabilityFullData.branchFields', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: ctx => Promise.all([
      ['department-margin', 'SELECT branch_id, branch, dept, round(sum(net)) AS v FROM full_data GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 1'],
      ['item-profit', 'SELECT branch_id, branch, prt, round(sum(net)) AS v FROM full_data GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 1'],
      ['loss-items', 'SELECT branch_id, branch, prt, round(sum(net)) AS v FROM full_data GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 1'],
      ['no-cost-items', 'SELECT branch_id, branch, prt, round(sum(net_at_risk)) AS v FROM full_data GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 1'],
      ['margin-leakage', 'SELECT branch_id, branch, prt, round(sum(leak_ils)) AS v FROM full_data GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 1']
    ].map(([sectionId, sql]) => queryReportFullData.$runWithCtx(ctx, { reportId: 'profitability', sectionId, sql }))),
    expectedResult: ctx => ctx.data.every(rows => rows?.[0]?.branch_id != null && rows[0].branch && rows[0].v > 0)
      || { testFailure: JSON.stringify(ctx.data)?.slice(0, 500) },
    timeout: 120000
  })
})

Test('comaxReports.itemTrends.priceTrendSelectedProducts', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: queryReportFullData({ reportId: 'item-trends', sectionId: 'price-trend',
      sql: 'SELECT prt, item, ym, unit_price_gross FROM full_data WHERE prt IN (8996,20703) ORDER BY ym DESC LIMIT 20' }),
    expectedResult: ctx => Array.isArray(ctx.data) && ctx.data.length && ctx.data.every(r => [8996, 20703].includes(r.prt) && r.ym && r.unit_price_gross > 0)
      || { testFailure: JSON.stringify(ctx.data)?.slice(0, 300) },
    timeout: 120000
  })
})

Test('comaxReports.customersLoyalty.topCustomersSelectedProduct', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: queryReportFullData({ reportId: 'customers-loyalty', sectionId: 'top-customers',
      sql: 'SELECT branch, customer, round(sum(net)) AS net FROM full_data WHERE prt IN (8996,20703) GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10' }),
    expectedResult: ctx => Array.isArray(ctx.data) && ctx.data.length && ctx.data[0].branch && ctx.data[0].customer && ctx.data[0].net > 0
      || { testFailure: JSON.stringify(ctx.data)?.slice(0, 300) },
    timeout: 120000
  })
})

Test('comaxReports.queryReportFullData.promoRerunWinnersSlice', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: queryReportFullData({ reportId: 'promo-recommendations', sectionId: 'rerun-winners',
      sql: `SELECT deal_name, cycles_with_sales, lift_multiplier, round(total_net) AS total_net FROM full_data
WHERE cycles_with_sales >= 2 AND lift_multiplier >= 1.3 AND margin_pct > 0 ORDER BY total_net DESC LIMIT 10` }),
    expectedResult: ctx => Array.isArray(ctx.data) && ctx.data.length && ctx.data.every(r => r.deal_name && r.cycles_with_sales >= 2 && r.lift_multiplier >= 1.3 && r.total_net > 0)
      || { testFailure: JSON.stringify(ctx.data)?.slice(0, 300) },
    timeout: 120000
  })
})

Test('comaxReports.queryReportFullData.promoClearanceProductBranchSlice', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: queryReportFullData({ reportId: 'promo-recommendations', sectionId: 'clearance-candidates',
      sql: `SELECT branch_id, branch, round(sum(tied_cash_ils)) AS tied_cash FROM full_data
WHERE prt IN (SELECT prt FROM full_data GROUP BY 1 ORDER BY sum(tied_cash_ils) DESC LIMIT 3)
GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 20` }),
    expectedResult: ctx => Array.isArray(ctx.data) && ctx.data.length && ctx.data[0].branch_id != null && ctx.data[0].branch && ctx.data[0].tied_cash > 0
      || { testFailure: JSON.stringify(ctx.data)?.slice(0, 300) },
    timeout: 120000
  })
})

Test('comaxReports.queryReportFullData.pricingCostDriftBranchSlice', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: queryReportFullData({ reportId: 'pricing-cost-drift', sectionId: 'price-consistency',
      sql: `SELECT branch_id, branch, count(*) AS rows, round(sum(net)) AS net FROM full_data
WHERE branch_id IN (SELECT branch_id FROM full_data GROUP BY 1 ORDER BY sum(net) DESC LIMIT 1) GROUP BY 1, 2 LIMIT 1` }),
    expectedResult: ctx => ctx.data?.[0]?.branch_id != null && ctx.data[0].branch && ctx.data[0].rows > 0 && ctx.data[0].net > 0
      || { testFailure: JSON.stringify(ctx.data)?.slice(0, 300) },
    timeout: 120000
  })
})

Test('comaxReports.queryReportFullData.promotionsProductBranchSlice', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: queryReportFullData({ reportId: 'promotions', sectionId: 'coverage',
      sql: `SELECT branch_id, branch, item, round(sum(promo_net)) AS promo_net FROM full_data
WHERE prt IN (SELECT prt FROM full_data GROUP BY 1 ORDER BY sum(promo_net) DESC LIMIT 3)
  AND branch_id IN (SELECT branch_id FROM full_data GROUP BY 1 ORDER BY sum(promo_net) DESC LIMIT 1)
GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 10` }),
    expectedResult: ctx => Array.isArray(ctx.data) && ctx.data.length && ctx.data[0].branch_id != null && ctx.data[0].branch && ctx.data[0].item && ctx.data[0].promo_net > 0
      || { testFailure: JSON.stringify(ctx.data)?.slice(0, 300) },
    timeout: 120000
  })
})

Test('comaxReports.queryReportFullData.suppliersBranchSlice', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: queryReportFullData({ reportId: 'suppliers', sectionId: 'dependency',
      sql: `SELECT branch_id, branch, round(sum(net)) AS net FROM full_data
WHERE branch_id IN (SELECT branch_id FROM full_data GROUP BY 1 ORDER BY sum(net) DESC LIMIT 1) GROUP BY 1, 2 LIMIT 1` }),
    expectedResult: ctx => Array.isArray(ctx.data) && ctx.data[0]?.branch_id != null && ctx.data[0].branch && ctx.data[0].net > 0
      || { testFailure: JSON.stringify(ctx.data)?.slice(0, 300) },
    timeout: 120000
  })
})

Test('comaxReports.queryReportFullData.branchPerformanceBranchSlice', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: queryReportFullData({ reportId: 'branch-performance', sectionId: 'ranking',
      sql: `SELECT branch_id, branch, round(sum(net)) AS net FROM full_data
WHERE branch_id IN (SELECT branch_id FROM full_data GROUP BY 1 ORDER BY sum(net) DESC LIMIT 1) GROUP BY 1, 2 LIMIT 1` }),
    expectedResult: ctx => {
      const log = (ctx.vars.workflowLogger?.workflowLog || []).find(l => l.t == 'queryReportFullData')
      return Array.isArray(ctx.data) && ctx.data[0]?.branch_id != null && ctx.data[0].branch && ctx.data[0].net > 0 && log?.rowCount == 1
        || { testFailure: `rows:${JSON.stringify(ctx.data)?.slice(0, 300)} log:${JSON.stringify(log)}` }
    },
    timeout: 120000
  })
})

Test('comaxReports.inventoryHealthFullData.productSlice', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: queryReportFullData({ reportId: 'inventory-health', sectionId: 'stock-value',
      sql: `SELECT prt, item, location_id, location, round(sum(stock_value_ils)) AS stock_value_ils
FROM full_data WHERE prt IN (8996,20703) GROUP BY 1, 2, 3, 4 ORDER BY 5 DESC LIMIT 20` }),
    expectedResult: ctx => Array.isArray(ctx.data) && ctx.data.length && ctx.data[0].prt && ctx.data[0].location_id && ctx.data[0].stock_value_ils > 0
      || { testFailure: JSON.stringify(ctx.data)?.slice(0, 300) },
    timeout: 120000
  })
})

Test('comaxReports.runReportInventoryAnalysis', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: runReport({ reportId: 'inventory-analysis', scope: 'executiveSummary', sections: ['excess-stock', 'almost-out'], sectionDepth: 'summary' }),
    expectedResult: ctx => {
      const d = ctx.data, excess = d?.results?.sections?.['excess-stock']?.rows, almost = d?.results?.sections?.['almost-out']?.rows
      return d?.results?.executiveSummary?.[0]?.stock_value_m_ils > 0 && excess?.length > 0 && almost?.length > 0
        || { testFailure: JSON.stringify({ executiveSummary: d?.results?.executiveSummary, excess: excess?.slice(0, 1), almost: almost?.slice(0, 1) }) }
    },
    timeout: 120000
  })
})

Test('comaxReports.queryReportFullData.categoryMixBranchSlice', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: queryReportFullData({ reportId: 'category-mix', sectionId: 'department-mix',
      sql: `SELECT branch, dept, round(sum(net)) AS net FROM full_data WHERE branch = 'גני תקווה' GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 5` }),
    expectedResult: ctx => Array.isArray(ctx.data) && ctx.data.length && ctx.data.every(r => r.branch == 'גני תקווה' && r.net > 0)
      || { testFailure: JSON.stringify(ctx.data)?.slice(0, 300) },
    timeout: 120000
  })
})

Test('comaxReports.queryReportFullData.operationsAuditBranchSlice', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: queryReportFullData({ reportId: 'operations-audit', sectionId: 'registers',
      sql: `SELECT branch_id, branch, round(sum(net)) AS net FROM full_data WHERE branch = 'גני תקווה' GROUP BY 1, 2 LIMIT 1` }),
    expectedResult: ctx => ctx.data?.[0]?.branch_id != null && ctx.data[0].branch == 'גני תקווה' && ctx.data[0].net > 0
      || { testFailure: JSON.stringify(ctx.data)?.slice(0, 300) },
    timeout: 120000
  })
})

Test('comaxReports.queryReportFullData.rejectsNonFullData', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: queryReportFullData({ reportId: 'sales-overview', sectionId: 'trend', sql: `SELECT 1 FROM read_parquet('x.parquet')` }),
    expectedResult: contains('must select FROM full_data', { allText: '%error%' }),
    timeout: 3000
  })
})

// unit-safety gate: cross-item sum/avg of a perItemOnly column (own-unit qty / unit price) is a pack-mix artifact - rejected with a teaching error
Test('comaxReports.queryReportFullData.unitSafetyReject', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: queryReportFullData({ reportId: 'item-trends', sectionId: 'price-trend',
      sql: `SELECT ym, round(sum(net)/sum(qty_own_unit), 2) AS blended_price FROM full_data WHERE item LIKE 'קוקה' GROUP BY 1` }),
    expectedResult: contains('unit-safety', { allText: '%error%' }),
    timeout: 3000
  })
})

// paved road: per-item YoY price + partial-month flag land in item-trends full_data (locked to the static local parquet)
Test('comaxReports.itemTrends.priceYoyAndPartialMonth', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: queryReportFullData({ reportId: 'item-trends', sectionId: 'price-trend',
      sql: `SELECT ym, unit_price_gross, price_yoy_pct, partial_month FROM full_data WHERE prt = 43379 ORDER BY ym DESC LIMIT 16` }),
    expectedResult: ctx => {
      const rows = ctx.data, mar26 = Array.isArray(rows) ? rows.find(r => r.ym == '2026-03') : null
      return rows?.[0]?.ym == '2026-06' && String(rows[0].partial_month) == 'true' && String(rows[1].partial_month) == 'false'
        && mar26?.price_yoy_pct == 13.9 && rows.filter(r => r.price_yoy_pct != null).length >= 12
        || { testFailure: JSON.stringify(rows)?.slice(0, 400) }
    },
    timeout: 120000
  })
})

// --- manual: execute EVERY sql of one report against the local parquet (the per-report slice of the original 196/196 validation) ---

Test('comaxReports.validateReportSqls', {
  doNotRunInTests: true,
  params: [{id: 'reportId', as: 'string', defaultValue: 'promo-recommendations'}],
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: async (ctx, {}, {reportId}) => {
      const r = verifiedReportsRegistry.$runWithCtx(ctx).find(x => x.id == reportId)
      const slots = [['executiveSummary', r.executiveSummary], ['summary', r.summary],
        ...(r.sections || []).flatMap(s => [...SEC_DEPTHS.map(d => [`${s.id}.${d}`, s[d]]),
          [`${s.id}.fullData`, s.fullData && { sql: `WITH full_data AS (${s.fullData.viewSql}) SELECT * FROM full_data LIMIT 5` }]])]
      const results = []
      for (const [key, slot] of slots) {
        if (!slot?.sql) { results.push({ key, error: 'MISSING SQL' }); continue }
        const t0 = Date.now()
        const rows = await dsls.common.data.duckDbSql.$runWithCtx(ctx, slot.sql.replaceAll('{{ROOT}}', LOCAL_ROOT))
        results.push({ key, ms: Date.now() - t0, ...(rows?.error ? { error: String(rows.error).slice(0, 300) } : { rows: Array.isArray(rows) ? rows.length : -1 }) })
      }
      return results
    },
    expectedResult: ctx => ctx.data.every(r => r.rows > 0) || { testFailure: JSON.stringify(ctx.data.filter(r => !(r.rows > 0))) },
    timeout: 1200000
  })
})

// --- reports workspace: the slot test-runner lambda + the workspace UI ---

Test('reportsWorkspace.testSlot', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: testVerifiedSlot({
      slot: { goal: 'weekday net', widget: { kind: 'bar', title: 'net by weekday', name: 'd', value: 'net' },
        sql: `SELECT dayname(DateDoc) AS d, round(sum(Scm - ScmMaam)) AS net FROM read_parquet('{{ROOT}}/KupaDoc_Header.parquet') GROUP BY 1 ORDER BY 2 DESC LIMIT 3` },
      root: LOCAL_ROOT
    }),
    expectedResult: ctx => ctx.data?.rowCount == 3 && ctx.data?.widgets?.[0]?.data?.length == 3
      || { testFailure: JSON.stringify(ctx.data)?.slice(0, 300) },
    timeout: 120000
  })
})

Test('reportsWorkspace.testSlotSlice', {
  impl: dataTest({
    setup: reportsTestEnv,
    calculate: ctx => {
      const viewSql = verifiedReportsRegistry.$runWithCtx(ctx).find(r => r.id == 'sales-overview').sections.find(s => s.id == 'trend').fullData.viewSql
      return testVerifiedSlot.$runWithCtx(ctx, { root: LOCAL_ROOT, viewSql,
        slot: { sql: 'SELECT weekday_name, round(sum(net)) AS net FROM full_data GROUP BY 1 ORDER BY 2 DESC LIMIT 2' } })
    },
    expectedResult: ctx => ctx.data?.rowCount == 2 && ctx.data?.rows?.[0]?.net > 0
      || { testFailure: JSON.stringify(ctx.data)?.slice(0, 300) },
    timeout: 120000
  })
})

Test('reportsWorkspace.ui', {
  impl: reactTest({
    testedComp: reportsWorkspace(),
    logger: 'uiLogger',
    userActions: [waitForText('Reports workspace')],
    expectedResult: contains('sales-overview')
  })
})

Test('reportStudio.chatEditsProfile', {
  impl: reactTest({
    testedComp: reportStudio(),
    logger: 'uiLogger',
    userActions: actions(waitForText('Report studio'), click('Set demo goal'), waitForText('Studio edited goal')),
    expectedResult: contains('Studio edited goal')
  })
})

Test('reportStudio.uiRunPromotions', {
  doNotRunInTests: true,
  impl: reactTest({
    testedComp: reportStudio(),
    logger: 'uiLogger',
    userActions: actions(waitForText('Report studio'), click('Run'), waitForText('ReactComp: promotionReportPanel')),
    expectedResult: contains('ReactComp: promotionReportPanel'),
    timeout: 120000
  })
})

// --- manual: publish the verified-report catalog into a room as verifiedQueries assets ---

Test('comaxReports.loadToRoomAsAssets', {
  doNotRunInTests: true,
  params: [{id: 'roomWUrl', as: 'string', defaultValue: 'signedRoom://comaxDemo'}, {id: 'db', as: 'string', defaultValue: 'gcs'}],
  impl: dataTest({
    logger: 'assetLogger,dbLogger',
    calculate: async (ctx, {}, {roomWUrl, db}) => {
      const dbCtx = ctx.setVars({ roomWUrl, onLiveRepo: true, db })
      await wfetch2(`${roomWUrl}/assets.json`, { method: 'PUT', body: [] }, dbCtx)
      const am = dsls.asset['asset-model'].assetModel.$runWithCtx(dbCtx)
      const ids = await loadVerifiedReportsAsAssets.$runWithCtx(dbCtx.setVars({ assetModel: am }))
      return { published: ids.length, catalog: am.catalog.length }
    },
    expectedResult: ctx => ctx.data?.published > 0 && ctx.data?.published === ctx.data?.catalog,
    timeout: 120000
  })
})

// --- live e2e: Hebrew question -> reports flow (LLM proxy) -> runReport over comax room -> explorable answer with reportsUsed ---

const runReportsFlow = userMessage => async ctx => {
  const vars = { db: 'local', userId: 'ScreenshotService', roomId: 'comaxDemo', userMessage, doNotWriteLogs: true, isLocalHost: false,
    llmProxyUrl, summaryModel: SUMMARY_MODEL, categories: { reportsAnalytics: true, local: true } }
  const wfCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx.setVars(vars))
  return dsls.ai.workflow.reportsAnalytics.$runWithCtx(wfCtx).calcWorkflow(wfCtx)
}

Test('workflowTest.reportsAnalytics.hebrewSmoke', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: runReportsFlow('מה מצב המכירות החודש?'),
    expectedResult: ctx => {
      const d = ctx.data || {}, rr = typeof d.runRes == 'object' && d.runRes || {}, code = d.llmGeneratedCode || ''
      const ranReport = (d.workflowLog || []).some(l => String(l.t || '').includes('runReport'))
      const missingKeys = ['text', 'narrative', 'sql', 'rows', 'widgets', 'followUps', 'reportsUsed'].filter(k => rr[k] == null)
      return missingKeys.length == 0 && rr.reportsUsed.length > 0 && rr.widgets.length > 0 && ranReport && !code.includes('read_parquet(')
        || { testFailure: `missingKeys:[${missingKeys}] ranReportLog:${ranReport} widgets:${rr.widgets?.length ?? 'none'}
reportsUsed:${JSON.stringify(rr.reportsUsed ?? null)} runRes:${JSON.stringify(d.runRes)?.slice(0, 300)}` }
    },
    allowError: true,
    timeout: 300000
  })
})

const runStructuredReportsTemplateFlow = userMessage => async ctx => {
  const vars = { db: 'local', userId: 'ScreenshotService', roomId: 'comaxDemo', userMessage, isLocalHost: false,
    llmProxyUrl, summaryModel: SUMMARY_MODEL, categories: { reportsAnalytics: true, reports: true, local: true } }
  const wfCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx.setVars(vars))
  return dsls.ai.workflow.structuredReportsTemplateAnalytics.$runWithCtx(wfCtx).calcWorkflow(wfCtx)
}

const runFastReportFlow = userMessage => async ctx => {
  const start = Date.now(), partials = [], onPartial = p => partials.push({ ms: Date.now() - start, widgets: p.widgets?.length, rows: p.rows?.length })
  jb.coreUtils.eventEmitter.on('fastReportPartial', onPartial)
  try {
    const vars = { db: 'local', userId: 'ScreenshotService', roomId: 'comaxDemo', userMessage, doNotWriteLogs: true, isLocalHost: false,
      llmProxyUrl, summaryModel: SUMMARY_MODEL, categories: { reportsAnalytics: true, reports: true, local: true } }
    const wfCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx.setVars(vars))
    return { ...(await dsls.ai.workflow['fast-report'].$runWithCtx(wfCtx).calcWorkflow(wfCtx)), partials }
  } finally { jb.coreUtils.eventEmitter.off('fastReportPartial', onPartial) }
}

Test('workflowTest.fastReport.twoStagePromotionHistoryContract', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: async ctx => {
      const d = await runFastReportFlow('מה המבצע הכי מוצלח אי פעם?')(ctx)
      const calls = (d.workflowLog || []).filter(log => log.t?.endsWith('llm call finished'))
        .filter(log => ['report template route', 'report template slots'].includes(log.goal))
      return {slots: d.reportSlots, rows: d.runRes?.rows, text: d.runRes?.text,
        calls: calls.map(({goal, model, inputTokens}) => ({goal, model, inputTokens})), errors: d.workflowErrors}
    },
    expectedResult: ctx => ctx.data.slots?.reportId == 'promotions' && ctx.data.slots?.slice
      && ctx.data.rows?.[0]?.promo_name && ctx.data.text?.includes(ctx.data.rows[0].promo_name)
      && ctx.data.calls.map(call => call.model).join(',') == 'openai/gpt-oss-20b,openai/gpt-oss-120b'
      && ctx.data.calls.every(call => call.inputTokens > 0) && !ctx.data.errors?.length
      || {testFailure: JSON.stringify(ctx.data)},
    allowError: true, timeout: 300000, logger: 'workflowLogger'
  })
})

Test('workflowTest.fastReport.weekendBranches', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: runFastReportFlow('איזה סניפים חזקים בסוף השבוע?'),
    expectedResult: ctx => {
      const d = ctx.data || {}, rr = typeof d.runRes == 'object' && d.runRes || {}
      const missingKeys = ['text', 'narrative', 'sql', 'rows', 'widgets', 'followUps', 'reportsUsed'].filter(k => rr[k] == null)
      return missingKeys.length == 0 && d.reportSlots?.reportId && rr.rows?.length
        || { testFailure: `missingKeys:[${missingKeys}] slots:${JSON.stringify(d.reportSlots)} runRes:${JSON.stringify(rr)?.slice(0, 300)}` }
    },
    allowError: true,
    timeout: 300000
  })
})

Test('workflowTest.fastReport.promotionsPartial', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: runFastReportFlow('נתח ביצועי מבצעים'),
    expectedResult: ctx => {
      const d = ctx.data || {}, rr = typeof d.runRes == 'object' && d.runRes || {}, p = d.partials?.[0]
      return p?.widgets > 0 && p.ms <= 4000 && rr.widgets?.length > 0 && rr.text && !rr.text.includes('מסכם תובנות')
        || { testFailure: `partial:${JSON.stringify(p)} widgets:${rr.widgets?.length} text:${String(rr.text).slice(0, 80)} slots:${JSON.stringify(d.reportSlots)}` }
    },
    allowError: true,
    timeout: 300000
  })
})

Test('comaxDemo.fastReport.aiNarrativeAfterPartial', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: async ctx => {
      const d = await runFastReportFlow('איך היו המכירות מתחילת 2026 מול אותם תאריכים ב-2025 ומה הניע את השינוי?')(ctx)
      const rr = d.runRes || {}
      return { partials: d.partials, reportId: d.reportSlots?.reportId, text: rr.text,
        widgets: rr.widgets?.length, errors: d.workflowErrors }
    },
    expectedResult: ctx => { const d = ctx.data, text = String(d.text || '')
      return d.partials?.[0]?.widgets > 0 && d.widgets > 0 && text.length > 80 && !text.includes('הדוח המאומת מוכן') && !/202[56]\.00/.test(text) && !d.errors?.length
        || { testFailure: JSON.stringify(d) }
    },
    allowError: true,
    timeout: 300000
  })
})

Test('comaxDemo.fastReport.salesPulseQlikGroundedNarrativeV3', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: async ctx => {
      const d = await runFastReportFlow('הצג את דופק המכירות של המסך הראשי ב-Qlik ומה מניע את השינוי')(ctx)
      const rr = d.runRes || {}, names = (analysis, key) => rr.rows?.filter(r => r._analysis == analysis)
        .map(r => r[key]).filter(Boolean)
      return { partials: d.partials, reportId: d.reportSlots?.reportId, text: rr.text, longText: rr.longText,
        drivers: [names('branch-drivers', 'branch'), names('item-drivers', 'item'), names('supplier-drivers', 'supplier')],
        widgets: rr.widgets?.map(w => ({kind: w.kind, series: w.series?.length})),
        reportsUsed: rr.reportsUsed, errors: d.workflowErrors }
    },
    expectedResult: ctx => { const d = ctx.data, text = String(d.longText || d.text || '')
      return d.reportId == 'qlik-sales-pulse' && d.partials?.[0]?.widgets > 0
        && d.widgets?.some(w => w.kind == 'line' && w.series == 2)
        && d.reportsUsed?.some(x => x.reportId == 'qlik-sales-pulse')
        && d.drivers?.every(xs => xs.some(x => text.includes(x))) && text.length > 100 && text.includes('₪')
        && /[\u0590-\u05FF]/.test(text) && !text.includes('הדוח המאומת מוכן') && !d.errors?.length
        || { testFailure: JSON.stringify(d) }
    },
    allowError: true,
    timeout: 300000
  })
})

Test('comaxDemo.fastReport.holidayQlikGroundedNarrativeV5', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: async ctx => {
      const d = await runFastReportFlow('כמה טוב היו המכירות בפסח? נתח לפני, בחג ואחרי, מול פסח 2025 ולפי סניפים')(ctx)
      const rr = d.runRes || {}, text = String(rr.longText || rr.text || '')
      const branches = rr.rows?.filter(r => r._analysis == 'branch-contributors') || []
      return { reportId: d.reportSlots?.reportId, text,
        positive: branches.filter(r => r.uplift_daily_ils > 0).map(r => r.branch),
        negative: branches.filter(r => r.uplift_daily_ils < 0).map(r => r.branch),
        widgets: rr.widgets?.length, errors: d.workflowErrors }
    },
    expectedResult: ctx => {
      const d = ctx.data
      return d.reportId == 'qlik-holiday-performance' && d.widgets >= 4 && (d.positive.length || d.negative.length)
        && (!d.positive.length || d.positive.some(x => d.text.includes(x)))
        && (!d.negative.length || d.negative.some(x => d.text.includes(x)))
        && ['לפני', 'בחג', 'אחרי', '02.04.2026', '08.04.2026', '13.04.2025', '19.04.2025']
          .every(x => d.text.includes(x)) && !d.errors?.length || {testFailure: JSON.stringify(d)}
    },
    allowError: true, timeout: 300000
  })
})

Test('comaxDemo.fastReport.inventoryQlikGroundedNarrative', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: async ctx => {
      const d = await runFastReportFlow('נתח מלאי שכמעט אוזל ועודפי מלאי לפי קצב מכירות')(ctx)
      const rr = d.runRes || {}, text = String(rr.longText || rr.text || ''), names = key => rr.rows?.map(r => r[key]).filter(Boolean) || []
      return { reportId: d.reportSlots?.reportId, text, items: names('item'), departments: names('dept'),
        widgets: rr.widgets?.length, errors: d.workflowErrors }
    },
    expectedResult: ctx => {
      const d = ctx.data, jargon = /מכר חשוף|הון עודף|כיסוי עלות|בסיכון זמינות|שורות סיכון|מגמת ביקוש/
      return d.reportId == 'qlik-inventory-performance' && d.widgets >= 4 && d.items.some(x => d.text.includes(x))
        && d.departments.some(x => d.text.includes(x)) && /חסר|כמעט/.test(d.text) && d.text.includes('מלאי עודף')
        && !jargon.test(d.text) && !d.errors?.length || { testFailure: JSON.stringify(d) }
    },
    allowError: true, timeout: 300000
  })
})

Test('workflowTest.fastReport.profitablePromotions', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: runFastReportFlow('תראה לי מבצעים רווחיים'),
    expectedResult: ctx => {
      const d = ctx.data || {}, rr = typeof d.runRes == 'object' && d.runRes || {}
      const text = String(rr.text)
      return d.reportSlots?.sections?.[0] == 'profitable-promotions' && rr.rows?.length > 0
        && rr.rows.every(r => r.margin_ils > 0)
        && !['729', "יח'", 'סניף', 'קטגור', 'קבוצת ביקורת'].some(x => text.includes(x))
        || { testFailure: `slots:${JSON.stringify(d.reportSlots)} text:${String(rr.text).slice(0, 220)} rows:${JSON.stringify(rr.rows?.slice(0, 2))}` }
    },
    allowError: true,
    timeout: 300000
  })
})

Test('workflowTest.fastReport.bestWorstPromotions', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: runFastReportFlow('מה המבצע הכי מצליח והכי כושל?'),
    expectedResult: ctx => { const d = ctx.data || {}, rr = typeof d.runRes == 'object' && d.runRes || {}, names = (rr.rows || []).map(r => r.promo_name)
      return d.customAnswer !== true && d.reportSlots?.reportId == 'promotions' && rr.rows?.length == 2
        && names.every(n => rr.text?.includes(n)) && Math.abs(rr.rows[0].margin_ils - 868897.7) < .1
        && Math.abs(rr.rows[1].margin_ils + 60161.5) < .1
        || { testFailure: `route:${JSON.stringify(d.reportRoute)} error:${rr.error} rows:${JSON.stringify(rr.rows)} text:${String(rr.text).slice(0, 300)}` }
    },
    allowError: true,
    timeout: 300000
  })
})

Test('comaxDemo.fastReport.customReceiptCorrelationV3', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: runFastReportFlow('האם יש מתאם בין מספר הפריטים בקבלה לבין גובה הסל, ומהו לפי סניף?'),
    expectedResult: ctx => { const d = ctx.data || {}, rr = typeof d.runRes == 'object' && d.runRes || {}, top = rr.rows?.[0]
      return d.customAnswer === true && d.reportRoute?.customAnswer === true && rr.verified === false && !rr.error
        && rr.sql?.includes('/OEM_BI_4466/KupaDoc_Header.parquet') && rr.sql.includes('TotalCmt')
        && rr.sql.toLowerCase().includes('corr(') && !rr.sql.includes('KupaDoc_Lines') && rr.rows?.length > 1
        && rr.text?.includes(top.branch) && !`${rr.text}${rr.longText}`.includes('#FLOW_VARS') && rr.widgets?.length
        && rr.widgets.every(w => !/corr|מתאם/i.test(w.title) || !w.valueFormat)
        || { testFailure: `route:${JSON.stringify(d.reportRoute)} error:${rr.error} sql:${rr.sql}
rows:${JSON.stringify(rr.rows?.slice(0, 2))} text:${String(rr.text).slice(0, 300)}` }
    },
    allowError: true,
    timeout: 300000
  })
})

Test('workflowTest.fastReport.promoRerunRecommendation', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: runFastReportFlow('אילו מבצעים כדאי להריץ שוב?'),
    expectedResult: ctx => {
      const d = ctx.data || {}, rr = typeof d.runRes == 'object' && d.runRes || {}, text = String(rr.text)
      return d.reportSlots?.reportId == 'promo-recommendations' && rr.rows?.length > 0 && text.length > 40 && !/[a-z_]{4,}/.test(text.replace(/\*/g, ''))
        || { testFailure: `slots:${JSON.stringify(d.reportSlots)} rows:${rr.rows?.length} text:${text.slice(0, 400)}` }
    },
    allowError: true,
    timeout: 300000
  })
})

Test('workflowTest.fastReport.promoStopRecommendation', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: runFastReportFlow('אילו מבצעים כדאי להפסיק או לצמצם?'),
    expectedResult: ctx => {
      const d = ctx.data || {}, rr = typeof d.runRes == 'object' && d.runRes || {}, text = String(rr.text)
      return d.reportSlots?.reportId == 'promo-recommendations' && rr.rows?.length > 0 && text.length > 40 && !/[a-z_]{4,}/.test(text.replace(/\*/g, ''))
        || { testFailure: `slots:${JSON.stringify(d.reportSlots)} rows:${rr.rows?.length} text:${text.slice(0, 400)}` }
    },
    allowError: true,
    timeout: 300000
  })
})

Test('workflowTest.structuredReportsTemplateAnalytics.salesStatus', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: runStructuredReportsTemplateFlow('מה מצב המכירות החודש?'),
    expectedResult: ctx => {
      const d = ctx.data || {}, rr = typeof d.runRes == 'object' && d.runRes || {}
      const missingKeys = ['text', 'narrative', 'sql', 'rows', 'widgets', 'followUps', 'reportsUsed', 'parts', 'partsLayout'].filter(k => rr[k] == null)
      return missingKeys.length == 0 && rr.partsLayout == 'collapsedSections' && d.reportSlots?.reportId
        || { testFailure: `missingKeys:[${missingKeys}] slots:${JSON.stringify(d.reportSlots)} runRes:${JSON.stringify(rr)?.slice(0, 300)}` }
    },
    allowError: true,
    timeout: 300000
  })
})

// live e2e: Hebrew question -> comaxAgentPanel runs reportsAnalytics + basicAnalytics(GPT-5.5) in parallel -> judge returns the winning answer
const runPanelFlow = userMessage => async ctx => {
  const vars = { db: 'local', userId: 'ScreenshotService', roomId: 'comaxDemo', userMessage, doNotWriteLogs: true, isLocalHost: false,
    llmProxyUrl, summaryModel: SUMMARY_MODEL, categories: { local: true } }
  const wfCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx.setVars(vars))
  return dsls.ai.workflow.comaxAgentPanel.$runWithCtx(wfCtx).calcWorkflow(wfCtx)
}

Test('workflowTest.comaxAgentPanel.hebrewSmoke', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: runPanelFlow('מה מצב המכירות החודש?'),
    expectedResult: ctx => {
      const d = ctx.data || {}, rr = typeof d.runRes == 'object' && d.runRes || {}
      const missingKeys = ['text', 'narrative', 'widgets', 'followUps'].filter(k => rr[k] == null)
      return missingKeys.length == 0 && rr.panel && typeof rr.panel.chosen == 'string' && rr.panel.sources?.length == 2
        || { testFailure: `missingKeys:[${missingKeys}] panel:${JSON.stringify(rr.panel ?? null)} runRes:${JSON.stringify(d.runRes)?.slice(0, 300)}` }
    },
    allowError: true,
    timeout: 300000
  })
})
