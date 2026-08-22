import {dsls, jb} from '@jb6/core'
import '@jb6/common'
import '@jb6/testing'
import {antiRepeatFailure, constrainSlots, executeReportPlan, normalizeReportRoute, planTuple,
  requireSliceRows, requiresReportExecution} from '../Agents/reports-template-agent.js'
import '../Agents/fast-report-agent.js'

const {
  tgp: {'ctx-enricher': {setVars}},
  common: {data: {queryReportFullData, runReport, verifiedReportsRegistry}},
  test: {Test, test: {dataTest}}
} = dsls

const LOCAL_ROOT = new URL('../../../../files/rooms/comaxDemo/usersRO/parquet/OEM_BI_4466', import.meta.url).pathname
const withRegistry = ctx => ctx.setVars({reportsRegistry: verifiedReportsRegistry.$runWithCtx(ctx)})
const reportEnv = setVars(ctx => ({
  db: 'local', dbHost: 'node', reportsRegistry: verifiedReportsRegistry.$runWithCtx(ctx), reportsRoot: LOCAL_ROOT,
  workflowLogger: dsls.test.logger.workflowLoggerProfile.$runWithCtx(ctx)
}))
const slotsOf = report => [report.executiveSummary, report.summary,
  ...(report.sections || []).flatMap(section => [section.executiveSummary, section.summary, section.inDepth])]
  .filter(Boolean)

Test('reportParams.catalogContractsV14', {
  impl: dataTest({
    calculate: ctx => {
      const reports = verifiedReportsRegistry.$runWithCtx(ctx)
      const sections = reports.flatMap(report => (report.sections || []).map(section => ({report, section})))
      const missingParams = reports.flatMap(report => slotsOf(report)
        .filter(slot => !Array.isArray(slot.params)).map(slot => `${report.id}:${slot.goal}`))
      const missingGuidance = sections.filter(({section}) => section.fullData
        && (!section.fullData.queryGuidance || !section.fullData.exampleSql))
        .map(({report, section}) => `${report.id}/${section.id}`)
      const invalidExamples = sections.filter(({section}) => section.fullData
        && (!/^SELECT\b[\s\S]*\bFROM\s+full_data\b/i.test(section.fullData.exampleSql)
          || /sum\s*\([^)]*(?:date|_d)\b/i.test(section.fullData.exampleSql)
          || /\bperiod_bucket\b/.test(section.fullData.columns)
            && !/period_bucket\s*=\s*'current'/i.test(section.fullData.exampleSql)))
        .map(({report, section}) => `${report.id}/${section.id}`)
      const invalidBindings = sections.flatMap(({report, section}) =>
        [section.executiveSummary, section.summary, section.inDepth].filter(Boolean).flatMap(slot => {
          const columns = String(section.fullData?.columns || '').split(',').map(x => x.trim().match(/^([A-Za-z_]\w*)/)?.[1])
          return (slot.params || []).filter(param => param.stage != 'result' && param.column
            && (!/\bfull_data\b/i.test(slot.sql) || !columns.includes(param.column))
            || param.operation == 'limit' && !/\bLIMIT\s+\d+\s*$/i.test(slot.sql.trim()))
            .map(param => `${report.id}/${section.id}:${param.id}`)
        }))
      const daily = reports.find(report => report.id == 'branch-performance')?.sections
        .find(section => section.id == 'daily-sales')?.summary
      const dailyExecutive = reports.find(report => report.id == 'branch-performance')?.sections
        .find(section => section.id == 'daily-sales')?.executiveSummary
      const itemTrendSlots = reports.find(report => report.id == 'item-trends')?.sections
        .find(section => section.id == 'price-trend')
      const unsafeTemporal = [itemTrendSlots?.executiveSummary, itemTrendSlots?.summary, itemTrendSlots?.inDepth]
        .flatMap(slot => slot?.params || []).filter(param => param.stage != 'result'
          && ['d', 'sale_date', 'aligned_date', 'snapshot_date', 'sales_through_date', 'date_open',
            'doc_date', 'last_purchase_d', 'ym', 'month'].includes(param.column))
      const unsafeDimensions = ['branch-margin', 'branch-mix'].flatMap(id => {
        const section = reports.find(report => report.id == 'branch-performance')?.sections.find(item => item.id == id)
        return [section?.executiveSummary, section?.summary, section?.inDepth]
          .flatMap(slot => slot?.params || []).filter(param => param.operation != 'limit' && param.stage != 'result'
            && (id == 'branch-mix' || param.column != 'dept'))
          .map(param => `${id}:${param.id}`)
      })
      const mechanicalParams = reports.flatMap(report => slotsOf(report).flatMap(slot => slot.params
        .filter(param => ['branch', 'item', 'department', 'supplier', 'date', 'month', 'dateFrom', 'dateTo', 'limit'].includes(param.id))
        .map(param => `${report.id}:${param.id}`)))
      const missingCapability = reports.filter(report => !slotsOf(report)
        .some(slot => slot.params.some(param => param.operation != 'limit'))).map(report => report.id)
      const semanticParamNames = [...new Set(reports.flatMap(report => slotsOf(report)
        .flatMap(slot => slot.params.map(param => param.id))))].sort()
      const semanticSourceParams = [...new Set(reports.flatMap(report => slotsOf(report).flatMap(slot => slot.params
        .filter(param => param.column && param.stage != 'result').map(param => `${report.id}:${param.id}`))))].sort()
      const calculationCapableReports = reports.filter(report => slotsOf(report).some(slot => slot.params
        .some(param => param.column && param.stage != 'result'))).map(report => report.id).sort()
      const resultLimits = [...new Set(reports.flatMap(report => slotsOf(report).flatMap(slot => slot.params
        .filter(param => param.operation == 'limit').map(param => `${report.id}:${param.id}`))))]
      return {reports: reports.length, missingParams, missingGuidance, invalidExamples, invalidBindings,
        unsafeTemporal, unsafeDimensions, mechanicalParams, missingCapability, semanticParamNames, semanticSourceParams,
        calculationCapableReports, resultLimits,
        dailyExecutiveHasLimit: dailyExecutive?.params.some(param => param.operation == 'limit'),
        dailyExecutiveParams: dailyExecutive?.params.map(param => param.id) || [],
        dailyParams: daily?.params.map(param => param.id) || []}
    },
    expectedResult: ctx => ctx.data.reports >= 20 && !ctx.data.missingParams.length
      && !ctx.data.missingGuidance.length && !ctx.data.invalidExamples.length
      && !ctx.data.invalidBindings.length && !ctx.data.unsafeTemporal.length
      && !ctx.data.unsafeDimensions.length && !ctx.data.mechanicalParams.length && !ctx.data.missingCapability.length
      && !ctx.data.dailyExecutiveHasLimit
      && ctx.data.resultLimits.includes('promotions:maxPromotions')
      && ctx.data.resultLimits.includes('promo-recommendations:maxRecommendations')
      && JSON.stringify(ctx.data.calculationCapableReports) == JSON.stringify([
        'branch-performance', 'category-mix', 'customers-loyalty', 'operations-audit',
        'pricing-cost-drift', 'profitability', 'sales-overview', 'suppliers'])
      && ['reportDate', 'reportMonth', 'fromDate', 'toDate', 'branchesToAnalyze', 'maxRows']
        .every(id => ctx.data.dailyParams.includes(id))
      || {testFailure: JSON.stringify(ctx.data)}
  })
})

Test('reportParams.twoStageRouterContext', {
  impl: dataTest({
    calculate: ctx => {
      const reports = verifiedReportsRegistry.$runWithCtx(ctx)
      const report = reports.find(x => x.id == 'branch-performance')
      const router = jb.workflowUtils.reportTemplateRouteCatalog(reports)
      const selected = jb.workflowUtils.reportTemplateReportDetails(report, ['daily-sales'], true)
      const missingReports = reports.filter(item => !router.includes(`## ${item.id}`)).map(item => item.id)
      const missingSections = reports.flatMap(item => (item.sections || [])
        .filter(section => !jb.workflowUtils.reportTemplateRouteCatalog([item]).includes(`section ${section.id}`))
        .map(section => `${item.id}/${section.id}`))
      return {
        routerLength: router.length, missingReports, missingSections,
        routerHasContract: router.includes('when to use / available report data:')
          && router.includes('when to use / available data:') && router.includes('available fields:')
          && router.includes('branch_id') && router.includes('wow_pct'),
        routerLeaksPlanning: /params=|fullData fallback:|grain=|reportDate:date/.test(router),
        routerLeaksSql: /\bSELECT\b[^;\n]*\bFROM\b|read_parquet\s*\(/i.test(router),
        routerLeaksBindings: /\bstage=|\bcolumn=|full_data_source/.test(router),
        selectedGuidance: selected.includes('QUERY_GUIDANCE:'),
        selectedExample: selected.includes('EXAMPLE_SQL:'),
        selectedDateParam: selected.includes('reportDate; date; list'),
        selectedLeaksOtherSection: selected.includes('weekly-product-profit'),
        fallbackInstruction: jb.workflowUtils.reportTemplateRouteInstructions
          .includes("mode=customAnswer only when no report's data covers the question at all")
      }
    },
    expectedResult: ctx => ctx.data.routerLength < 80000 && !ctx.data.missingReports.length
      && !ctx.data.missingSections.length && ctx.data.routerHasContract
      && !ctx.data.routerLeaksPlanning && !ctx.data.routerLeaksSql && !ctx.data.routerLeaksBindings
      && ctx.data.selectedGuidance && ctx.data.selectedExample
      && ctx.data.selectedDateParam
      && !ctx.data.selectedLeaksOtherSection && ctx.data.fallbackInstruction
      || {testFailure: JSON.stringify(ctx.data)}
  })
})

// the router shortlists; the planner owns the plan; constrainSlots enforces ONLY the shortlist
Test('reportParams.secondStageOwnsExecutionPlan', {
  impl: dataTest({
    calculate: ctx => {
      const reportCtx = withRegistry(ctx).setVars({userMessage: 'הצג שני סניפים ביום האחרון'})
      const route = normalizeReportRoute({mode: 'reports',
        reports: [{reportId: 'branch-performance', candidateSections: ['daily-sales']}]}, reportCtx)
      const slots = jb.workflowUtils.normalizeReportTemplateSlots(constrainSlots({reportId: 'branch-performance',
        scope: 'none', sections: ['daily-sales'], sectionDepth: 'summary',
        params: {'daily-sales': {reportDate: 'latest', maxRows: 2}},
        rows: {source: 'section', sectionId: 'daily-sales'}, entities: [], widgets: [], followUps: []}, route), reportCtx)
      let outsideShortlist
      try { constrainSlots({reportId: 'sales-overview'}, route) } catch (e) { outsideShortlist = e.message }
      return {route, slots, outsideShortlist}
    },
    expectedResult: ctx => ctx.data.route.mode == 'reports'
      && ctx.data.route.reports[0].candidateSections.join(',') == 'daily-sales'
      && ctx.data.slots.scope == 'none' && ctx.data.slots.sectionDepth == 'summary'
      && ctx.data.slots.params['daily-sales'].reportDate == 'latest'
      && ctx.data.slots.params['daily-sales'].maxRows == 2
      && ctx.data.outsideShortlist.includes('shortlist') || {testFailure: JSON.stringify(ctx.data)}
  })
})

// new route contract: shortlist + hints only; deterministic validation returns {invalid} for the router retry;
// anti-repeat compares the PLANNED tuple against the previous assistant turn's plan
Test('reportParams.routerShortlistContractV12', {
  impl: dataTest({
    calculate: ctx => {
      const reportCtx = withRegistry(ctx).setVars({userMessage: 'סניפים בולטים לחיוב ולשלילה היום'})
      const route = normalizeReportRoute({mode: 'reports', reports: [
        {reportId: 'branch-performance', candidateSections: ['daily-sales', 'no-such-section']},
        {reportId: 'branch-performance', candidateSections: ['ranking']}]}, reportCtx)
      const unknown = normalizeReportRoute({mode: 'reports', reports: [{reportId: 'no-such-report'}]}, reportCtx)
      const empty = normalizeReportRoute({mode: 'reports', reports: []}, reportCtx)
      const custom = normalizeReportRoute({mode: 'customAnswer', reason: 'raw sql'}, reportCtx)
      const historyCtx = reportCtx.setVars({accumulatedContext: {chatHistory: [
        {role: 'user', content: 'שאלה'},
        {role: 'assistant', content: 'תשובה', rowsShown: [{branch: 'א', net: 1}],
          plan: {reportId: 'branch-performance', sections: ['daily-sales'], sectionDepth: 'summary', params: {}}}]}})
      const direct = normalizeReportRoute({mode: 'directResponse',
        directResponse: {groundedIn: {turn: 1}, instruction: 'הסבר'}, justification: 'covered'}, historyCtx)
      const badTurn = normalizeReportRoute({mode: 'directResponse',
        directResponse: {groundedIn: {turn: 0}, instruction: 'הסבר'}}, historyCtx)
      const slots = jb.workflowUtils.normalizeReportTemplateSlots({reportId: 'branch-performance', scope: 'none',
        sections: ['daily-sales'], sectionDepth: 'summary', rows: {source: 'section', sectionId: 'daily-sales'}}, reportCtx)
      const repeat = antiRepeatFailure(slots, historyCtx)
      const noRepeat = antiRepeatFailure({...slots, sectionDepth: 'inDepth'}, historyCtx)
      const fastElems = jb.coreUtils.resolveProfileArgs(jb.workflowUtils.fastReportFlow(slots, null, null,
        reportCtx.vars.reportsRegistry.find(report => report.id == 'branch-performance'))).elems
      const fastGoals = fastElems.map(elem => elem.goal)
      const fastFirstRun = fastElems.find(elem => elem.goal == 'Run selected report')
      const mixed = {...slots, slice: {sectionId: 'daily-sales', sql: 'SELECT * FROM full_data'},
        params: {'daily-sales': {branchesToAnalyze: 'גני תקווה'}}}
      let sliceError
      try { requireSliceRows({error: 'bad slice'}) } catch (error) { sliceError = error.message }
      return {route, unknown: !!unknown.invalid, empty: !!empty.invalid, custom, direct, badTurn: !!badTurn.invalid,
        repeat: repeat?.code, noRepeat, tupleStable: planTuple(slots) == planTuple({reportId: 'branch-performance',
          params: {}, sectionDepth: 'summary', sections: ['daily-sales']}),
        fastPhase: {scope: fastFirstRun.value?.scope, sections: fastFirstRun.value?.sections}, fastGoals,
        mixedExecutes: requiresReportExecution(mixed), pureSliceExecutes: requiresReportExecution({...mixed, params: {}}),
        emptySlice: requireSliceRows([]), sliceError}
    },
    expectedResult: ctx => ctx.data.route.mode == 'reports' && ctx.data.route.reports.length == 1
      && ctx.data.route.reports[0].candidateSections.join(',') == 'daily-sales,ranking'
      && ctx.data.unknown && ctx.data.empty && ctx.data.custom.mode == 'customAnswer'
      && ctx.data.direct.mode == 'directResponse' && ctx.data.direct.turn == 1
      && ctx.data.direct.grounded.rowsShown.length == 1 && ctx.data.badTurn
      && ctx.data.repeat == 'ANTI_REPEAT' && !ctx.data.noRepeat && ctx.data.tupleStable
      && ctx.data.fastPhase.scope == 'summary' && ctx.data.fastPhase.sections?.length == 0
      && ctx.data.fastGoals.indexOf('Execute selected sections') < ctx.data.fastGoals.indexOf('Run selected sections')
      && ctx.data.fastGoals.indexOf('Mark section fallback unverified') < ctx.data.fastGoals.indexOf('Emit section widgets')
      && ctx.data.mixedExecutes && !ctx.data.pureSliceExecutes
      && !ctx.data.emptySlice.length && ctx.data.sliceError == 'bad slice'
      || {testFailure: JSON.stringify(ctx.data)}
  })
})

Test('reportParams.invalidValueIsStructuredV3', {
  impl: dataTest({
    setup: reportEnv,
    calculate: runReport({reportId: 'branch-performance', scope: 'none', sections: ['daily-sales'],
      sectionDepth: 'summary', params: {'daily-sales': {reportDate: '2026-02-30'}}}),
    expectedResult: ctx => ctx.data.code == 'INVALID_REPORT_PARAMS' && ctx.data.retryable === true
      && ctx.data.failures?.[0]?.target == 'daily-sales'
      && ctx.data.failures[0].errors?.[0]?.error.includes('real YYYY-MM-DD')
      && ctx.data.failures[0].supportedParams.some(param => param.id == 'reportDate')
      || {testFailure: JSON.stringify(ctx.data)},
    logger: 'workflowLogger'
  })
})

Test('reportParams.rejectsInvalidContractsV3', {
  impl: dataTest({
    setup: reportEnv,
    calculate: async ctx => {
      const args = {reportId: 'branch-performance', scope: 'none', sections: ['daily-sales'],
        sectionDepth: 'summary'}
      const unknown = await runReport.$runWithCtx(ctx, {...args, params: {'daily-sale': {reportDate: 'latest'}}})
      const reversed = await runReport.$runWithCtx(ctx, {...args,
        params: {'daily-sales': {fromDate: '2026-06-02', toDate: '2026-06-01'}}})
      let plannerError
      try {
        jb.workflowUtils.normalizeReportTemplateSlots({...args, rows: {source: 'section', sectionId: 'daily-sales'},
          params: {'weekly-product-profit': {branchesToAnalyze: 'גני תקווה'}}}, ctx)
      } catch (error) { plannerError = error.message }
      let malformedError
      try {
        jb.workflowUtils.normalizeReportTemplateSlots({...args, rows: {source: 'section', sectionId: 'daily-sales'},
          params: {'daily-sales': 'latest'}}, ctx)
      } catch (error) { malformedError = error.message }
      return {unknown, reversed, plannerError, malformedError}
    },
    expectedResult: ctx => ctx.data.unknown.code == 'INVALID_REPORT_PARAMS'
      && ctx.data.unknown.failures?.[0]?.target == 'daily-sale'
      && ctx.data.reversed.code == 'INVALID_REPORT_PARAMS'
      && ctx.data.reversed.failures?.[0]?.errors?.some(error => error.error.includes('fromDate'))
      && ctx.data.plannerError?.includes('unselected slots')
      && ctx.data.malformedError?.includes('must contain an object') || {testFailure: JSON.stringify(ctx.data)},
    logger: 'workflowLogger'
  })
})

Test('reportParams.noMatchIncludesCandidatesV3', {
  impl: dataTest({
    setup: reportEnv,
    calculate: runReport({reportId: 'branch-performance', scope: 'none', sections: ['daily-sales'],
      sectionDepth: 'summary', params: {'daily-sales': {branchesToAnalyze: 'missing-branch'}}}),
    expectedResult: ctx => ctx.data.code == 'INVALID_REPORT_PARAMS'
      && ctx.data.failures?.[0]?.errors?.[0]?.error.includes('no full_data rows matched')
      && ctx.data.failures[0].candidates?.branchesToAnalyze?.some(row => row.value)
      || {testFailure: JSON.stringify(ctx.data)?.slice(0, 1500)},
    timeout: 120000,
    logger: 'dbLogger,workflowLogger'
  })
})

Test('reportParams.validEmptyCombinationStaysVerifiedV3', {
  impl: dataTest({
    setup: reportEnv,
    calculate: async ctx => {
      const pairs = await queryReportFullData.$runWithCtx(ctx, {reportId: 'branch-performance',
        sectionId: 'daily-sales', sql: `SELECT b.branch, CAST(days.d AS VARCHAR) AS d
FROM (SELECT DISTINCT branch FROM full_data) b
CROSS JOIN (SELECT DISTINCT d FROM full_data) days
ANTI JOIN full_data present ON present.branch = b.branch AND present.d = days.d
LIMIT 1`})
      const pair = pairs?.[0]
      const report = pair && await runReport.$runWithCtx(ctx, {reportId: 'branch-performance', scope: 'none',
        sections: ['daily-sales'], sectionDepth: 'summary',
        params: {'daily-sales': {branchesToAnalyze: pair.branch, reportDate: pair.d}}})
      return {pair, error: report?.error, rows: report?.results?.sections?.['daily-sales']?.rows}
    },
    expectedResult: ctx => ctx.data.pair && !ctx.data.error && Array.isArray(ctx.data.rows)
      && !ctx.data.rows.length || {testFailure: JSON.stringify(ctx.data)?.slice(0, 1200)},
    timeout: 180000,
    logger: 'dbLogger,workflowLogger'
  })
})

Test('reportParams.dateAndMonthRunVerifiedSqlV5', {
  impl: dataTest({
    setup: reportEnv,
    calculate: async ctx => {
      const dateRows = await queryReportFullData.$runWithCtx(ctx, {reportId: 'branch-performance',
        sectionId: 'daily-sales', sql: 'SELECT CAST(max(d) - 14 AS VARCHAR) AS d FROM full_data'})
      const date = dateRows?.[0]?.d
      const report = await runReport.$runWithCtx(ctx, {reportId: 'branch-performance', scope: 'none',
        sections: ['daily-sales'], sectionDepth: 'summary', params: {'daily-sales': {reportDate: date}}})
      const direct = await queryReportFullData.$runWithCtx(ctx, {reportId: 'branch-performance',
        sectionId: 'daily-sales', sql: `SELECT branch, net AS net_last_day, net_prev_week, wow_pct, receipts, basket
FROM full_data WHERE d = DATE '${date}' ORDER BY net_last_day DESC LIMIT 25`})
      const branches = direct.slice(0, 2).map(row => row.branch)
      const branchSql = branches.map(branch => `'${branch.replaceAll("'", "''")}'`).join(', ')
      const combined = await runReport.$runWithCtx(ctx, {reportId: 'branch-performance', scope: 'none',
        sections: ['daily-sales'], sectionDepth: 'summary',
        params: {'daily-sales': {reportDate: 'latest', branchesToAnalyze: branches, maxRows: 1}}})
      const combinedDirect = await queryReportFullData.$runWithCtx(ctx, {reportId: 'branch-performance',
        sectionId: 'daily-sales', sql: `SELECT branch, net AS net_last_day, net_prev_week, wow_pct, receipts, basket
FROM full_data WHERE d = (SELECT max(d) FROM full_data) AND branch IN (${branchSql})
ORDER BY net_last_day DESC LIMIT 1`})
      const ranged = await runReport.$runWithCtx(ctx, {reportId: 'branch-performance', scope: 'none',
        sections: ['daily-sales'], sectionDepth: 'summary',
        params: {'daily-sales': {fromDate: date, toDate: date}}})
      const month = date.slice(0, 7)
      const monthly = await runReport.$runWithCtx(ctx, {reportId: 'branch-performance', scope: 'none',
        sections: ['daily-sales'], sectionDepth: 'summary', params: {'daily-sales': {reportMonth: month}}})
      const monthlyDirect = await queryReportFullData.$runWithCtx(ctx, {reportId: 'branch-performance',
        sectionId: 'daily-sales', sql: `SELECT branch, net AS net_last_day, net_prev_week, wow_pct, receipts, basket
FROM full_data WHERE strftime(d, '%Y-%m') = '${month}'
  AND d = (SELECT max(d) FROM full_data WHERE strftime(d, '%Y-%m') = '${month}')
ORDER BY net_last_day DESC LIMIT 25`})
      return {date, rows: report?.results?.sections?.['daily-sales']?.rows, direct,
        combined: combined?.results?.sections?.['daily-sales']?.rows, combinedDirect,
        ranged: ranged?.results?.sections?.['daily-sales']?.rows,
        monthly: monthly?.results?.sections?.['daily-sales']?.rows, monthlyDirect,
        errors: ctx.vars.workflowLogger.workflowErrors}
    },
    expectedResult: ctx => ctx.data.date && JSON.stringify(ctx.data.rows) == JSON.stringify(ctx.data.direct)
      && JSON.stringify(ctx.data.combined) == JSON.stringify(ctx.data.combinedDirect)
      && JSON.stringify(ctx.data.ranged) == JSON.stringify(ctx.data.direct)
      && JSON.stringify(ctx.data.monthly) == JSON.stringify(ctx.data.monthlyDirect)
      && !ctx.data.errors.length || {testFailure: JSON.stringify(ctx.data)?.slice(0, 1000)},
    timeout: 180000,
    logger: 'dbLogger,workflowLogger'
  })
})

Test('reportParams.resultRowParamRunsVerifiedSqlV3', {
  impl: dataTest({
    setup: reportEnv,
    calculate: async ctx => {
      const args = {reportId: 'sales-overview', scope: 'none', sections: ['daily-pulse'], sectionDepth: 'summary'}
      const original = await runReport.$runWithCtx(ctx, args), rows = original.results?.sections?.['daily-pulse']?.rows || []
      const branch = rows.find(row => row.branch)?.branch
      const filtered = await runReport.$runWithCtx(ctx, {...args, params: {'daily-pulse': {branchesToShow: branch}}})
      const missing = await runReport.$runWithCtx(ctx, {...args, params: {'daily-pulse': {branchesToShow: 'missing-branch'}}})
      return {branch, original: rows.find(row => row.branch == branch), filtered: filtered.results?.sections?.['daily-pulse']?.rows,
        missing, errors: ctx.vars.workflowLogger.errorLogs || []}
    },
    expectedResult: ctx => ctx.data.branch && ctx.data.filtered?.length == 1
      && JSON.stringify(ctx.data.filtered[0]) == JSON.stringify(ctx.data.original)
      && ctx.data.missing?.code == 'INVALID_REPORT_PARAMS'
      && ctx.data.missing.failures?.[0]?.errors?.[0]?.error.includes('verified result')
      && !ctx.data.errors.length || {testFailure: JSON.stringify(ctx.data)?.slice(0, 1600)},
    timeout: 180000,
    logger: 'dbLogger,workflowLogger'
  })
})

Test('reportParams.semanticThresholdRunsVerifiedSqlV2', {
  impl: dataTest({
    setup: reportEnv,
    calculate: async ctx => {
      const args = {reportId: 'pricing-cost-drift', scope: 'none', sections: ['cost-creep'], sectionDepth: 'summary'}
      const original = await runReport.$runWithCtx(ctx, args), rows = original.results?.sections?.['cost-creep']?.rows || []
      const threshold = Math.min(...rows.map(row => row.cost_chg_pct).filter(Number.isFinite))
      const filtered = await runReport.$runWithCtx(ctx, {...args,
        params: {'cost-creep': {minimumCostIncreasePct: threshold}}})
      const widening = await runReport.$runWithCtx(ctx, {...args, params: {'cost-creep': {minimumCostIncreasePct: 9}}})
      return {threshold, filtered: filtered.results?.sections?.['cost-creep']?.rows, widening,
        errors: ctx.vars.workflowLogger.errorLogs || []}
    },
    expectedResult: ctx => Number.isFinite(ctx.data.threshold) && ctx.data.filtered?.length
      && ctx.data.filtered.every(row => row.cost_chg_pct >= ctx.data.threshold)
      && ctx.data.widening?.code == 'INVALID_REPORT_PARAMS'
      && !ctx.data.errors.length || {testFailure: JSON.stringify(ctx.data)?.slice(0, 1600)},
    timeout: 180000,
    logger: 'dbLogger,workflowLogger'
  })
})

Test('reportParams.reportScopeSemanticParamRunsVerifiedSqlV2', {
  impl: dataTest({
    setup: reportEnv,
    calculate: async ctx => {
      const args = {reportId: 'profitability', scope: 'summary', sections: []}
      const original = await runReport.$runWithCtx(ctx, args), rows = original.results?.summary || []
      const department = rows.find(row => row.dept)?.dept
      const filtered = await runReport.$runWithCtx(ctx, {...args, params: {$report: {departmentsToShow: department}}})
      const missing = await runReport.$runWithCtx(ctx, {...args, params: {$report: {departmentsToShow: 'missing-department'}}})
      return {department, original: rows.find(row => row.dept == department), filtered: filtered.results?.summary,
        missing, errors: ctx.vars.workflowLogger.errorLogs || []}
    },
    expectedResult: ctx => ctx.data.department && ctx.data.filtered?.length == 1
      && JSON.stringify(ctx.data.filtered[0]) == JSON.stringify(ctx.data.original)
      && ctx.data.missing?.code == 'INVALID_REPORT_PARAMS'
      && ctx.data.missing.failures?.[0]?.target == '$report'
      && !ctx.data.errors.length || {testFailure: JSON.stringify(ctx.data)?.slice(0, 1600)},
    timeout: 180000,
    logger: 'dbLogger,workflowLogger'
  })
})

Test('reportParams.selectedExampleAndFilteredSliceRunV5', {
  impl: dataTest({
    setup: reportEnv,
    calculate: async ctx => {
      const section = ctx.vars.reportsRegistry.find(report => report.id == 'branch-performance').sections
        .find(item => item.id == 'daily-sales')
      const example = await queryReportFullData.$runWithCtx(ctx, {reportId: 'branch-performance',
        sectionId: 'daily-sales', sql: section.fullData.exampleSql})
      const branches = await queryReportFullData.$runWithCtx(ctx, {reportId: 'branch-performance',
        sectionId: 'daily-sales', sql: 'SELECT DISTINCT branch FROM full_data ORDER BY 1 LIMIT 2'})
      const branch = branches[0]?.branch
      const filtered = await queryReportFullData.$runWithCtx(ctx, {reportId: 'branch-performance',
        sectionId: 'daily-sales', sectionDepth: 'summary', params: {branchesToAnalyze: branch},
        sql: 'SELECT DISTINCT branch FROM full_data ORDER BY 1 LIMIT 20'})
      const latestMonth = await queryReportFullData.$runWithCtx(ctx, {reportId: 'branch-performance',
        sectionId: 'daily-sales', sectionDepth: 'summary', params: {reportMonth: 'latest'},
        sql: `SELECT count(DISTINCT d) AS days, strftime(min(d), '%Y-%m') AS first_month,
  strftime(max(d), '%Y-%m') AS last_month FROM full_data`})
      return {example, branch, filtered, latestMonth, errors: ctx.vars.workflowLogger.workflowErrors}
    },
    expectedResult: ctx => ctx.data.example?.length && ctx.data.branch && ctx.data.filtered?.length == 1
      && ctx.data.filtered[0].branch == ctx.data.branch && !ctx.data.errors.length
      && ctx.data.latestMonth?.[0]?.days > 1
      && ctx.data.latestMonth[0].first_month == ctx.data.latestMonth[0].last_month
      || {testFailure: JSON.stringify(ctx.data)?.slice(0, 1200)},
    timeout: 180000,
    logger: 'dbLogger,workflowLogger'
  })
})

// no hidden repair ladder: executeReportPlan returns ONE honest attempt - success, or a STRUCTURED failure
// (supportedParams/candidates preserved) that the workflow feeds to the single planner retry
Test('reportParams.failuresAreStructuredForPlannerRetry', {
  impl: dataTest({
    calculate: async ctx => {
      const planCtx = withRegistry(ctx).setVars({userMessage: 'סניפים היום', TODAYS_DATE: '2026-07-20'})
      const slots = jb.workflowUtils.normalizeReportTemplateSlots({reportId: 'branch-performance', scope: 'none',
        sections: ['daily-sales'], sectionDepth: 'summary',
        params: {'daily-sales': {branchesToAnalyze: 'גני תקווה', reportDate: '2026-07-20'}},
        rows: {source: 'section', sectionId: 'daily-sales'}}, planCtx)
      const invalid = {error: 'INVALID_REPORT_PARAMS', code: 'INVALID_REPORT_PARAMS',
        failures: [{target: 'daily-sales', errors: [{param: 'reportDate', error: 'no rows matched'}],
          supportedParams: [{id: 'reportDate', type: 'date'}], candidates: {reportDate: [{min: '2024-01-01', max: '2026-06-27'}]}}]}
      const failed = await executeReportPlan(planCtx, 'unused', slots, {runReport: async () => invalid})
      const ok = await executeReportPlan(planCtx, 'unused', slots,
        {runReport: async () => ({reportId: 'branch-performance', results: {sections: {'daily-sales': {rows: [{branch: 'א'}]}}}})})
      return {failedSource: failed.source, failureCode: failed.failure?.code,
        candidates: failed.failure?.failures?.[0]?.candidates?.reportDate?.[0]?.max,
        attempts: failed.attempts.length, okSource: ok.source, okAttempts: ok.attempts.length}
    },
    expectedResult: ctx => ctx.data.failedSource == 'failed' && ctx.data.failureCode == 'INVALID_REPORT_PARAMS'
      && ctx.data.candidates == '2026-06-27' && ctx.data.attempts == 1
      && ctx.data.okSource == 'verified' && ctx.data.okAttempts == 1
      || {testFailure: JSON.stringify(ctx.data)},
    logger: 'workflowLogger'
  })
})

// live: a bad requested date must recover via the workflow's single planner retry (params fixed or slice escalation)
Test('reportParams.planRetryLiveV6', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: async ctx => {
      const vars = {db: 'local', roomId: 'comaxDemo', reportsRoot: LOCAL_ROOT, doNotWriteLogs: true,
        userMessage: 'הצג את הסניפים ב-20 ביולי 2026; אם אין נתונים השתמש ביום האחרון הזמין',
        llmProxyUrl: 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy',
        categories: {reportsAnalytics: true, reports: true, local: true}}
      const wfCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx.setVars(vars))
      const result = await dsls.ai.workflow['fast-report'].$runWithCtx(wfCtx).calcWorkflow(wfCtx)
      return {reportId: result.reportSlots?.reportId, attempts: result.reportExecution?.attempts,
        rows: result.runRes?.rows?.length, error: result.runRes?.error, errors: result.workflowErrors}
    },
    expectedResult: ctx => ctx.data.reportId && ctx.data.rows > 0 && !ctx.data.error
      || {testFailure: JSON.stringify(ctx.data)?.slice(0, 2000)},
    timeout: 300000,
    logger: 'dbLogger,workflowLogger'
  })
})

Test('reportParams.originalQuestionEndToEndFinalV7', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: async ctx => {
      const vars = {db: 'local', userId: 'ReportParamsTest', roomId: 'comaxDemo', doNotWriteLogs: true,
        isLocalHost: false, userMessage: 'סניפים בולטים לחיוב ולשלילה היום', reportsRoot: LOCAL_ROOT,
        llmProxyUrl: 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy',
        summaryModel: 'openai/gpt-5.4', categories: {reportsAnalytics: true, reports: true, local: true}}
      const wfCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx.setVars(vars))
      const result = await dsls.ai.workflow['fast-report'].$runWithCtx(wfCtx).calcWorkflow(wfCtx)
      return {reportId: result.reportSlots?.reportId,
        sections: result.reportSlots?.sections,
        slice: result.reportSlots?.slice, execution: result.reportExecution,
        rows: result.runRes?.rows, verified: result.runRes?.verified, errors: result.workflowErrors}
    },
    expectedResult: ctx => ctx.data.reportId == 'branch-performance'
      && ctx.data.sections?.includes('daily-sales') && !ctx.data.slice
      && ctx.data.execution?.source == 'verified' && ctx.data.rows?.length
      && ctx.data.rows.every(row => Math.abs(row.wow_pct) < 1000)
      && ctx.data.verified !== false && !ctx.data.errors?.length
      || {testFailure: JSON.stringify(ctx.data)?.slice(0, 2000)},
    timeout: 300000,
    logger: 'dbLogger,workflowLogger'
  })
})
