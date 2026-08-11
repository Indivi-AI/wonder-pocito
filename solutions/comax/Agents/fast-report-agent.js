import { dsls, jb, coreUtils } from '@jb6/core'
import '@jb6/common'
import { writeBigLog } from '@wonder/core/base-utils.js'
import { activeCompany } from '../Doclets/comax-analytics-doclets.js'
import { CAVEAT_POLICY, antiRepeatFailure, awaitEntityVars, cleanAnswer, executeMultiReportPlan,
  executeReportPlan, filterUiRowsByEntities, markUnverifiedAnswer, reportEntityFlow,
  requireSliceRows, requiresReportExecution, rowsValue, runCustomAnswer, runSliceRows,
  selectRoute, selectSlots } from './reports-template-agent.js'

const {
  common: { Data, data: { verifiedReportsRegistry, runReport, queryReportFullData, llmSummary, comaxEntityCandidates } },
  workflow: { Workflow, 'flow-elem': { flow, setCtxData, setCtxVar, asHumanFeedback, finalAnswerFromReport } }
} = dsls

const LLM_PROXY = 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy'
const MODEL = 'openai/gpt-5.4-mini'
const ROUTER_MODEL = 'groq/openai/gpt-oss-20b'
const PLANNER_MODEL = 'groq/openai/gpt-oss-120b'
const SUMMARY_MODEL = 'openai/gpt-5.4'
const REPORTS_ROOT = 'signedRoom://comaxDemo/usersRO/parquet/OEM_BI_4466'
const LONG_ANSWER_STYLE = [
  'LONG_ANSWER בלבד: פתח בכותרת "### מצב" ובמשפט שורה תחתונה אחד.',
  'אחריה כתוב 2-3 כותרות ### עסקיות ורשימה ממוספרת קצרה מתחת לכל כותרת; פעולה או מסקנה אחת בכל שורה.',
  'כשנדרשות המלצות מבצעים, השתמש בכותרות "### מומלץ להפעיל" ו-"### לעצור או לצמצם" '
    + 'והצג 2-3 מבצעים בכל רשימה.',
  'בכל פריט כתוב **שם הישות**, פעולה ושני מספרים חשובים בלבד; את יתר הפרטים משאירים לכרטיסים.',
  'עגל סכומים גדולים לאלפים או למיליונים בלי .00, ואחוזים לספרה עשרונית אחת.',
  'הבדל בין אחוז שינוי לנקודות אחוז.',
  'אל תחזור על מספר או מסר, אל תשתמש בביטוי "התמונה מצביעה", ואל תמליץ אלא אם התבקשת.',
  'השתמש רק בשמות עסקיים טבעיים בעברית; אל תזכיר שמות שדות, rows, reportResult, SQL או snake_case.',
  'SHORT_ANSWER נשאר משפט אחד לפי ההנחיות הקיימות; כללי המבנה האלה אינם חלים עליו.'
].join('\n')
const arr = v => Array.isArray(v) ? v : v == null ? [] : [v]
const reportFallback = () => 'הדוח המאומת מוכן; הנתונים מוצגים בהמשך.'
const summarizeReport = s => async ctx => {
  const answer = await llmSummary.$runWithCtx(ctx, {summaryCategories: 'dataInsights',
    evaluation: `${s.summaryEvaluation}\n${LONG_ANSWER_STYLE}\n${CAVEAT_POLICY}`})
  return answer?.error ? ctx.vars.answer : answer
}
// structured turn record: what THIS answer showed, persisted with the message so the next turn's router can
// compare requested entities against shown rows and quote the caveats that were active on this exact answer
const planOf = s => ({reportId: s.reportId, sections: s.sections, sectionDepth: s.sectionDepth,
  params: s.params || {}, ...(s.slice && {slice: s.slice.sql})})
const entitiesShownOf = rows => {
  const vals = k => [...new Set(rows.map(r => r?.[k]).filter(v => v != null && v !== ''))]
  const branch = vals('branch'), product = [...new Set([...vals('item'), ...vals('product')])]
  return {...(branch.length && {branch}), ...(product.length && {product})}
}
const executedCaveats = rr => [...new Set([
  ...arr(rr?.caveats),
  ...Object.values(rr?.results?.sections || {}).flatMap(x => arr(x?.caveats)),
  ...Object.values(rr?.results?.reports || {}).flatMap(rep => Object.values(rep?.sections || {}).flatMap(x => arr(x?.caveats)))
].filter(Boolean))]
const turnRecord = (plan, runRes, reportResult) => {
  const rows = arr(runRes?.rows)
  return {plan, rowsShown: rows, entitiesShown: entitiesShownOf(rows),
    caveats: executedCaveats(reportResult), verified: runRes?.verified !== false}
}
const runCustom = async (ctx, model, logger) => {
  try { return await runCustomAnswer(ctx, model) } catch (error) {
    if (!logger.workflowErrors.some(e => e.status == 429)) throw error
    return runCustomAnswer(ctx, 'gemini/gemini-3.5-flash')
  }
}
const emitPartial = ctx => arr(ctx.data?.rows).length || arr(ctx.data?.widgets).length
  || arr(ctx.data?.reactComps).length
  ? (coreUtils.eventEmitter.emit('fastReportPartial', {...ctx.data, isPartial: true}), ctx.data) : ctx.data
const mergeReports = (a = {}, b = {}) => ({...a,
  results: {...(a.results || {}), ...(b.results || {}),
    sections: {...(a.results?.sections || {}), ...(b.results?.sections || {})}},
  widgets: [...arr(a.widgets), ...arr(b.widgets)],
  reactComps: [...arr(a.reactComps), ...arr(b.reactComps)]})
const guided = (s, r) => ({...s, summaryEvaluation: [s.summaryEvaluation,
  r?.id == 'sales-overview' && 'ב-LONG_ANSWER להשוואה חודשית סדר הפסקאות הוא: מכירות; רווח ורווחיות; '
    + 'כמות וסל ממוצע; '
    + 'ואם נבחרו פרקים — גורמים בולטים בסניפים, בפריטים ובספקים עם ראיות מספריות מתוך הפרקים.',
  r?.kind == 'qlik-report' && 'ב-LONG_ANSWER חובה לכסות כל פרק שנבחר בעדות '
    + 'מספרית ושם עסקי אחד מתוך reportResult/results/sections. כששורת הסיכום כוללת תאריכי '
    + 'התחלה/סיום או צילום, ציין אותם במפורש. אם אין תמיכה ב-LONG_ANSWER, כתוב את כל 3–4 '
    + 'המשפטים כתשובה הרגילה.'
].filter(Boolean).join('\n')})
// phasing is a RUNTIME property of the flow, never a rewrite of the plan: a plan with sections and no
// slice/params runs the cheap report-level scope first (instant widgets), then its sections, then the summary
const hasParamValues = s => Object.values(s.params || {}).some(x => Object.keys(x || {}).length)
const phaseScope = report => report?.kind == 'qlik-report' ? 'executiveSummary' : 'summary'
export const isPhased = s => !s.slice && !hasParamValues(s) && arr(s.sections).length > 0

// phase-B section execution with the single planner retry: a failed section run feeds retryPlan (when the
// turn's retry budget allows); the retried plan may swap sections or escalate to a full_data slice
const runSections = (s, plannerModel, retryPlan) => async ctx => {
  const first = await executeReportPlan(ctx, plannerModel, {...s, scope: 'none'})
  if (first.source != 'failed') return first
  if (!retryPlan) throw new Error(first.failure.error)
  const s2 = {...await retryPlan(first.failure), scope: 'none'}
  if (s2.slice) return {source: 'fullData', reportResult: first.reportResult,
    rows: await runSliceRows(ctx, s2), slots: s2,
    attempts: [...first.attempts, {source: 'fullData', sectionId: s2.slice.sectionId, sql: s2.slice.sql}], ctx}
  const second = await executeReportPlan(ctx, plannerModel, s2)
  if (second.source == 'failed') throw new Error(`sections failed after retry: ${second.failure.error}`)
  return {...second, attempts: [...first.attempts, ...second.attempts]}
}

const fastReportFlow = (s, execution, plannerModel, report, retryPlan) => {
  const phased = isPhased(s) && (!execution || execution.phase == 'scope')
  return flow({ elems: [
  ...(!execution ? s.entities.map(e => asHumanFeedback({ goal: `Resolve ${e.entity}`, varName: e.varName,
    question: e.entity == 'branch' ? 'לאיזה סניף התכוונת?' : 'לאיזה מוצר התכוונת?', mode: e.mode,
    options: comaxEntityCandidates({ entity: e.entity, query: e.query, limit: 12 }) })) : []),
  setCtxData({goal: 'Run selected report', status: 'מריץ דוח מאומת...', value: execution
    ? () => execution.reportResult : runReport(phased
      ? {reportId: s.reportId, scope: phaseScope(report), sections: [], sectionDepth: 'summary', params: {}}
      : {reportId: s.reportId, scope: s.scope, sections: s.sections, sectionDepth: s.sectionDepth, params: s.params})}),
  setCtxVar({ goal: 'Keep report result', varName: 'reportResult', value: ctx => ctx.data }),
  setCtxVar({ goal: 'Keep report widgets', varName: 'reportWidgets',
    value: async ctx => filterUiRowsByEntities(ctx.data?.widgets, s.entities, (await awaitEntityVars(ctx, s.entities)).vars) }),
  setCtxVar({ goal: 'Keep report React comps', varName: 'reportReactComps',
    value: async ctx => filterUiRowsByEntities(ctx.data?.reactComps, s.entities, (await awaitEntityVars(ctx, s.entities)).vars) }),
  ...(execution?.rows ? [setCtxVar({goal: 'Keep fallback rows', varName: 'rows', value: () => execution.rows})]
    : s.slice ? [
      setCtxVar({goal: 'Run report slice', status: 'בודק חיתוך ממוקד...', varName: 'rows',
        value: queryReportFullData({reportId: s.reportId, sectionId: s.slice.sectionId,
          sectionDepth: s.sectionDepth, params: s.params?.[s.slice.sectionId], sql: s.slice.sql})}),
      setCtxVar({goal: 'Validate report slice', varName: 'rows', value: ctx => requireSliceRows(ctx.vars.rows)})
    ]
    : [setCtxVar({ goal: 'Keep answer rows', varName: 'rows',
      value: rowsValue(phased ? {...s, sections: [], rows: {source: 'scope', scope: phaseScope(report)}} : s) })]),
  setCtxVar({ goal: 'Prime answer', varName: 'answer', value: reportFallback }),
  finalAnswerFromReport({goal: 'Return fast widgets', status: 'מציג נתונים...', rowsVar: 'rows',
    reportWidgetsVar: 'reportWidgets', narrative: s.narrative, sql: s.sqlDescription,
    widgets: s.widgets, followUps: s.followUps, hideWidgets: s.hideWidgets}),
  ...(s.slice || execution?.source == 'fullData'
    ? [setCtxData({goal: 'Mark slice answer unverified', value: ctx => markUnverifiedAnswer(ctx.data)})] : []),
  setCtxData({ goal: 'Emit fast widgets', value: emitPartial }),
  ...phased ? [
    setCtxVar({goal: 'Execute selected sections', status: 'מריץ פרקי דוח...', varName: 'sectionExecution',
      value: runSections(s, plannerModel, retryPlan)}),
    setCtxData({goal: 'Run selected sections', value: ctx => ctx.vars.sectionExecution.reportResult}),
    setCtxVar({goal: 'Merge report sections', varName: 'reportResult',
      value: ctx => mergeReports(ctx.vars.reportResult, ctx.data)}),
    setCtxVar({ goal: 'Keep section widgets', varName: 'reportWidgets',
      value: async ctx => filterUiRowsByEntities(ctx.vars.reportResult?.widgets, s.entities, (await awaitEntityVars(ctx, s.entities)).vars) }),
    setCtxVar({goal: 'Keep section React comps', varName: 'reportReactComps',
      value: async ctx => filterUiRowsByEntities(ctx.vars.reportResult?.reactComps, s.entities, (await awaitEntityVars(ctx, s.entities)).vars)}),
    setCtxVar({goal: 'Refresh answer rows', varName: 'rows',
      value: ctx => ctx.vars.sectionExecution.rows
        || rowsValue(s)(ctx.setData(ctx.vars.reportResult))}),
    finalAnswerFromReport({goal: 'Return section widgets', status: 'מציג פרקי דוח...', rowsVar: 'rows',
      reportWidgetsVar: 'reportWidgets', narrative: s.narrative, sql: s.sqlDescription,
      widgets: s.widgets, followUps: s.followUps, hideWidgets: s.hideWidgets}),
    setCtxData({goal: 'Mark section fallback unverified',
      value: ctx => ctx.vars.sectionExecution.source == 'fullData' ? markUnverifiedAnswer(ctx.data) : ctx.data}),
    setCtxData({ goal: 'Emit section widgets', value: emitPartial })
  ] : [],
  setCtxVar({ goal: 'Write answer', status: 'מסכם תובנות...', varName: 'answer', value: summarizeReport(s) }),
  setCtxVar({ goal: 'Clean answer', varName: 'answer', value: ctx => cleanAnswer(ctx.vars.answer) }),
  finalAnswerFromReport({goal: 'Return final fast report', status: 'מרכיב תשובה...', rowsVar: 'rows',
    reportWidgetsVar: 'reportWidgets', narrative: s.narrative, sql: s.sqlDescription,
    widgets: s.widgets, followUps: s.followUps, hideWidgets: s.hideWidgets}),
  ...phased ? [setCtxData({goal: 'Mark final section fallback unverified',
    value: ctx => ctx.vars.sectionExecution?.source == 'fullData' ? markUnverifiedAnswer(ctx.data) : ctx.data})] : []
] }) }

// Change 4: zero-cost turn for questions answerable from a prior turn's shown rows - no planner, no execution;
// the summarizer grounds on rowsShown + that turn's caveats, per the router's Hebrew instruction
const directResponseFlow = (route, grounded) => flow({ elems: [
  setCtxVar({ goal: 'Keep grounded rows', varName: 'rows', value: () => arr(grounded.rowsShown) }),
  setCtxVar({ goal: 'Prime answer', varName: 'answer', value: () => grounded.content }),
  setCtxVar({ goal: 'Write answer', status: 'עונה מהנתונים שכבר הוצגו...', varName: 'answer',
    value: async ctx => {
      const answer = await llmSummary.$runWithCtx(ctx.setData({rowsShown: grounded.rowsShown,
        caveats: arr(grounded.caveats), previousAnswer: grounded.content}), {summaryCategories: 'dataInsights',
        evaluation: [route.instruction,
          'ענה מתוך rowsShown שכבר הוצגו למשתמש בתשובה הקודמת; '
            + 'אל תמציא נתונים חדשים ואל תניח שקיימות שורות נוספות.',
          CAVEAT_POLICY].filter(Boolean).join('\n')})
      return answer?.error ? ctx.vars.answer : answer
    } }),
  setCtxVar({ goal: 'Clean answer', varName: 'answer', value: ctx => cleanAnswer(ctx.vars.answer) }),
  finalAnswerFromReport({goal: 'Return direct answer', status: 'מרכיב תשובה...', rowsVar: 'rows',
    narrative: '', sql: `directResponse: grounded in turn ${route.turn}`, widgets: [], followUps: [],
    hideWidgets: route.hideWidgets})
] })

Workflow('fast-report', {
  params: [
    {id: 'model', as: 'string', defaultValue: MODEL},
    {id: 'summaryModel', as: 'string', defaultValue: SUMMARY_MODEL},
    {id: 'routerModel', as: 'string', defaultValue: ROUTER_MODEL},
    {id: 'plannerModel', as: 'string', defaultValue: PLANNER_MODEL},
    {id: 'replayCtx', dynamic: true, defaultValue: '%$replayCtx%', description: 'edited workflow context overlaid before routing'}
  ],
  impl: ({}, {}, { model, summaryModel, routerModel, plannerModel, replayCtx }) => ({
    async calcWorkflow(__ctx) {
      const startTime = Date.now()
      let ctx = await jb.workflowUtils.extendWithWorkflowVars(__ctx), res, workflowLogger = ctx.vars.workflowLogger
      try {
        const reportsRegistry = verifiedReportsRegistry.$runWithCtx(ctx)
        const reportsRoot = ctx.vars.reportsRoot || (ctx.vars.comaxDataset ? `signedRoom://comaxDemo/usersRO/parquet/${activeCompany(ctx)}` : REPORTS_ROOT)
        ctx = ctx.setVars({ reportsRegistry, reportsRoot, summaryModel, flowModel: model, routerModel, plannerModel })
        const replay = replayCtx(__ctx)
        ctx = replay instanceof coreUtils.Ctx ? ctx.setVars(replay.vars).setData(replay.data) : ctx
        const route = await selectRoute(ctx, routerModel)
        if (route.mode == 'customAnswer') {
          res = { ...(await runCustom(ctx, model, workflowLogger)), customAnswer: true, reportRoute: route }
          res.turnRecord = turnRecord({customAnswer: true, ...(res.runRes?.sql && {sql: res.runRes.sql})}, res.runRes, null)
        }
        else if (route.mode == 'directResponse') {
          const grounded = route.grounded
          workflowLogger.info({t: 'fastReportDirectResponse', turn: route.turn,
            justification: route.justification}, {route, grounded}, {ctx})
          const out = await ctx.setData(null).run(directResponseFlow(route, grounded))
          const groundedReports = arr(grounded.plan).flatMap(p => p?.reportId
            ? [{reportId: p.reportId, sections: arr(p.sections)}] : [])
          const runRes = {...out?.data, reportsUsed: groundedReports}
          res = {runRes: grounded.verified === false ? markUnverifiedAnswer(runRes) : runRes,
            directResponse: {turn: route.turn, justification: route.justification},
            workflowTrace: workflowLogger.workflowTrace}
          res.turnRecord = {plan: {directResponse: true, groundedTurn: route.turn},
            rowsShown: arr(grounded.rowsShown), entitiesShown: grounded.entitiesShown || {},
            caveats: arr(grounded.caveats), verified: grounded.verified !== false}
        }
        else if (route.reports.length > 1) {
          let multi
          try { multi = await executeMultiReportPlan(ctx, plannerModel, route) }
          catch (error) {
            workflowLogger.info({t: 'fastReportMultiRetry', error: String(error.message).slice(0, 300)},
              {failure: error.planFailure}, {ctx})
            multi = await executeMultiReportPlan(ctx, plannerModel, route,
              error.planFailure || {error: String(error.message || error)})
          }
          workflowLogger.info({t: 'fastReportMulti', reportIds: route.reports.map(x => x.reportId)},
            {route, slots: multi.runs.map(x => x.slots)}, {ctx})
          const out = await ctx.setData(null).run(fastReportFlow(multi.slots, multi.execution, plannerModel))
          res = {runRes: multi.execution.source == 'fullData' ? markUnverifiedAnswer(out?.data) : out?.data,
            workflowTrace: workflowLogger.workflowTrace, reportSlots: multi.runs.map(x => x.slots),
            reportExecution: {source: multi.execution.source,
              attempts: multi.runs.map(x => ({reportId: x.route.reportId, attempts: x.execution.attempts}))}}
          res.turnRecord = turnRecord(multi.runs.map(x => planOf(x.slots)), res.runRes, multi.execution.reportResult)
        }
        else {
          const report = reportsRegistry.find(r => r.id == route.reports[0].reportId)
          // ONE planner retry per failure kind (anti-repeat / execution) - bounded, never a hidden ladder
          const retriedCodes = new Set()
          const retryPlan = async failure => {
            const kind = failure.code == 'ANTI_REPEAT' ? 'ANTI_REPEAT' : 'execution'
            if (retriedCodes.has(kind))
              throw new Error(`plan failed and the ${kind} retry was already used: ${failure.error || failure.code}`)
            retriedCodes.add(kind)
            workflowLogger.info({t: 'fastReportPlanRetry', code: failure.code,
              error: String(failure.error || '').slice(0, 300)}, {failure}, {ctx})
            return guided(await selectSlots(ctx, plannerModel, route, failure), report)
          }
          let slots = guided(await selectSlots(ctx, plannerModel, route), report), execution, runCtx = ctx
          const repeat = antiRepeatFailure(slots, ctx)
          if (repeat) {
            const differentPlan = await retryPlan(repeat)
            if (antiRepeatFailure(differentPlan, ctx))
              workflowLogger.info({t: 'fastReportAntiRepeatUnresolved'}, {slots: differentPlan}, {ctx})
            else slots = differentPlan
          }
          const phased = isPhased(slots)
          workflowLogger.info({t: 'fastReportSlots', reportId: slots.reportId, sections: slots.sections,
            phased, slice: !!slots.slice, params: slots.params}, {route, slots}, {ctx})
          if (phased || requiresReportExecution(slots)) {
            runCtx = slots.entities.length ? await ctx.setData(null).run(reportEntityFlow(slots)) : ctx
            execution = phased
              ? {...await executeReportPlan(runCtx, plannerModel,
                {...slots, scope: phaseScope(report), sections: [], params: {}}), phase: 'scope'}
              : await executeReportPlan(runCtx, plannerModel, slots)
            if (execution.source == 'failed' && phased) throw new Error(execution.failure.error)
            if (execution.source == 'failed') {
              slots = await retryPlan(execution.failure)
              if (requiresReportExecution(slots) || isPhased(slots)) {
                execution = isPhased(slots)
                  ? {...await executeReportPlan(runCtx, plannerModel,
                    {...slots, scope: phaseScope(report), sections: [], params: {}}), phase: 'scope'}
                  : await executeReportPlan(runCtx, plannerModel, slots)
                if (execution.source == 'failed') throw new Error(`plan failed after retry: ${execution.failure.error}`)
              } else execution = undefined
            }
            runCtx = execution?.ctx || runCtx
          }
          const out = await runCtx.setData(null).run(fastReportFlow(slots, execution, plannerModel, report, retryPlan))
          const finalExecution = out?.vars?.sectionExecution || execution
          res = {runRes: slots.slice || finalExecution?.source == 'fullData'
            ? markUnverifiedAnswer(out?.data) : out?.data,
            workflowTrace: workflowLogger.workflowTrace, reportSlots: slots,
            reportExecution: finalExecution && {source: finalExecution.source, attempts: finalExecution.attempts}}
          res.turnRecord = turnRecord(planOf(out?.vars?.sectionExecution?.slots || slots), res.runRes, out?.vars?.reportResult)
        }
      } catch (error) {
        workflowLogger.error({ t: 'fast-report failed' }, {}, { error, ctx })
        res = { runRes: { error: error.stack || String(error) } }
      }
      const result = { ...res, workflowInput: ctx.vars.workflowInput, ...workflowLogger.logsAndErrors() }
      const { userId, roomId, userMessage, replay } = ctx.vars
      const bigLogRes = ctx.vars.doNotWriteLogs ? null : await writeBigLog({roomId,
        fileName: `wf-fast-report-${Date.now()}`, payload: result,
        metadata: {userMessage, workflowName: ctx.vars.workflowInput?.agentId || 'fast-report', userId,
          duration: Date.now() - startTime, roomId, ...(replay && {modified: true, replayOf: replay.sourceRunId})}, ctx})
      return {...result, bigLogRes, ...(bigLogRes?.adminUrl
        ? {adminUrl: bigLogRes.adminUrl} : {bigLogError: bigLogRes?.error})}
    }
  })
})

Data('runFastReport', {
  permissionByPath: 'usersRW',
  params: [{ id: 'userMessage', as: 'string', mandatory: true }, { id: 'chatHistory', as: 'array' }, { id: 'model', as: 'string' }],
  impl: async (ctx, {}, { userMessage, chatHistory, model }) => {
    const vars = {db: 'local', roomId: ctx.vars.roomId || 'comaxDemo', userMessage,
      llmProxyUrl: LLM_PROXY, summaryModel: SUMMARY_MODEL, accumulatedContext: {chatHistory},
      categories: {reportsAnalytics: true, reports: true, local: true}}
    const wfCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx.setVars(vars))
    return dsls.workflow.workflow['fast-report'].$runWithCtx(wfCtx, { ...(model ? { model } : {}) }).calcWorkflow(wfCtx)
  }
})

Object.assign(jb.workflowUtils, {fastReportFlow, fastReportPhased: isPhased})
