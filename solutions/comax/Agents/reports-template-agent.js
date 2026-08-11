import { dsls, jb } from '@jb6/core'
import '@jb6/common'
import './analytics-agent.js'
import '@wonder/llm-flow/report-step.js'
import '@wonder/llm-flow/final-answer-from-report-step.js'
import '../Reports/index.js'
import { fetchItemsFromLLMReactiveP } from '@wonder/core/reactive-llm.js'
import '../Doclets/comax-analytics-doclets.js'

const {
  common: { data: { runReport, queryReportFullData, comaxEntityCandidates, duckDbSql } },
  workflow: { 'flow-elem': { flow, asHumanFeedback } }
} = dsls

export const PROMOTION_ACTION_QUESTION = 'נתח ביצועי מבצעים והמלץ על פעולות'
export const UNVERIFIED_WARNING = 'התשובה אינה מאומתת; יש לאמת את הנתונים.'
const enumOf = (v, xs, d) => xs.includes(v) ? v : d
const arr = v => Array.isArray(v) ? v : v == null ? [] : [v]
const uniq = xs => [...new Set(xs.filter(Boolean))]
const compactParams = params => Object.fromEntries(Object.entries(params || {}).filter(([, values]) =>
  values != null && (typeof values != 'object' || Array.isArray(values) || Object.keys(values).length)))
const parseJsonObject = (s, goal) => {
  const text = String(s ?? '').trim()
  if (!text.startsWith('{')) throw new Error(`${goal} returned non-JSON object: ${text.slice(0, 100)}`)
  return JSON.parse(text)
}
const sectionMap = r => Object.fromEntries((r.sections || []).map(s => [s.id, s]))
const paramDetails = p => [p.id, p.type, p.multiple && 'list',
  p.options?.length && `options=${p.options.join('|')}`, p.min != null && `min=${p.min}`,
  p.max != null && `max=${p.max}`, p.description].filter(Boolean).join('; ')
const slotDetails = (x, id) => x?.goal && `${id}: ${x.goal}; params: ${x.params?.length
  ? x.params.map(paramDetails).join(' / ') : 'none'}`
const routeText = text => String(text || '').replace(/\bSELECT\b[\s\S]*?\b(?:LIMIT\s+\d+|ORDER\s+BY\s+[\w,\s]+)(?=\.\s|$)/gi, '')
  .replace(/\s+/g, ' ').trim()
const fullDataColumns = fullData => String(fullData?.columns || '').split(',')
  .map(x => x.trim().match(/^"?([A-Za-z_]\w*)"?/)?.[1]).filter(Boolean).join(',')
const quoteSchemaColumns = (sql, columns) => [...String(columns || '').matchAll(/"([A-Za-z_]\w*)"/g)]
  .reduce((text, [, id]) => text.replace(new RegExp(`(?<!["\\w])${id}(?!["\\w])`, 'g'), `"${id}"`), sql)
export const reportRouterContext = context => {
  const chatHistory = arr(context?.chatHistory).slice(-6)
    .map(({role, content, plan, rowsShown, entitiesShown, caveats, verified}) => ({role, content,
      ...(plan && {plan}), ...(entitiesShown && {entitiesShown}), ...(verified != null && {verified}),
      ...(rowsShown && {rowsShown}), ...(caveats?.length && {caveats})}))
  const clarifiedParams = arr(context?.clarifiedParams)
  return chatHistory.length || clarifiedParams.length ? {chatHistory, ...(clarifiedParams.length && {clarifiedParams})} : null
}
const contextPrompt = ctx => {
  const routerContext = reportRouterContext(ctx.vars.accumulatedContext)
  const lastAssistant = routerContext?.chatHistory?.filter(x => x.role == 'assistant').at(-1)
  const context = jb.workflowUtils.conversationContextText(routerContext, 16000)
  return [context && `CONVERSATION_CONTEXT:\n${context}`,
    `DEFAULT_WIDGETS_ALREADY_SHOWN: ${!!(lastAssistant?.plan || lastAssistant?.rowsShown)}`].filter(Boolean).join('\n')
}
const routePrompt = ctx => [`${ctx.vars.TODAYS_DATE} -- ANALYTICS_QUESTION: ${ctx.vars.userMessage}`,
  contextPrompt(ctx)].filter(Boolean).join('\n\n')
const routeCatalog = rs => rs.map(r => [
  `## ${r.id}${r.title ? ` (${r.title})` : ''}`,
  `when to use / available report data: ${routeText([r.whenToUse, r.description].filter(Boolean).join(' '))}`,
  r.caveats && `caveats: ${routeText(r.caveats)}`,
  uniq([r.executiveSummary?.goal, r.summary?.goal]).length
    && `report data: ${uniq([r.executiveSummary?.goal, r.summary?.goal]).map(routeText).join(' | ')}`,
  r.routePhrases?.length && `phrases: ${r.routePhrases.join(' | ')}`,
  ...(r.sections || []).map(s => [`- section ${s.id}${s.title ? ` (${s.title})` : ''}`,
    `  when to use / available data: ${routeText(s.goal)}`,
    s.caveats && `  caveats: ${routeText(s.caveats)}`,
    s.fullData && `  available fields: ${fullDataColumns(s.fullData)}`]
    .filter(Boolean).join('\n'))
].filter(Boolean).join('\n')).join('\n\n')
const sectionDetails = (s, fullData) => [`section ${s.id}${s.title ? ` (${s.title})` : ''}`,
  `goal: ${s.goal}`, s.caveats && `caveats: ${s.caveats}`,
  ...['executiveSummary', 'summary', 'inDepth'].map(d => slotDetails(s[d], d)),
  fullData && s.fullData && [`FULL_DATA_SCHEMA ${s.id}: ${s.fullData.description}`,
    `grain: ${s.fullData.grain}`, `columns: ${s.fullData.columns}`,
    s.fullData.perItemOnly && `perItemOnly: ${s.fullData.perItemOnly}`,
    s.fullData.queryGuidance && `QUERY_GUIDANCE: ${s.fullData.queryGuidance}`,
    s.fullData.exampleSql && `EXAMPLE_SQL: ${s.fullData.exampleSql}`].filter(Boolean).join('\n')
].filter(Boolean).join('\n')
const reportDetails = (r, secIds, fullData) => [
  `report ${r.id}${r.title ? ` (${r.title})` : ''}`,
  `description: ${r.description}`,
  `whenToUse: ${r.whenToUse}`,
  r.qlikScreen && `QLIK_SCREEN: ${JSON.stringify(r.qlikScreen)}`,
  r.controls && `DECLARATIVE_CONTROLS: ${JSON.stringify(r.controls)}`,
  r.analysisLogic && `QLIK_ANALYSIS_METHOD:\n${r.analysisLogic}`,
  r.answerInstructions && `QLIK_ANSWER_INSTRUCTIONS:\n${r.answerInstructions}`,
  r.exampleQuestions?.length && `examples: ${r.exampleQuestions.join(' | ')}`,
  r.caveats && `caveats: ${r.caveats}`,
  slotDetails(r.executiveSummary, 'report executiveSummary'), slotDetails(r.summary, 'report summary'),
  ...arr(secIds).map(id => sectionMap(r)[id]).filter(Boolean).map(s => sectionDetails(s, fullData))]
  .filter(Boolean).join('\n\n')
const badSlicePlaceholder = sql => /\{\{/.test(sql) || /%\$(?!(selectedProducts|selectedBranches)\.(sqlIn|sqlLabelsIn)%)[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*%/.test(sql)
const validSql = sql => /^\s*select\b/i.test(sql) && /\bfrom\s+full_data\b/i.test(sql)
  && !badSlicePlaceholder(sql)
  && !/\b(read_parquet|insert|update|delete|drop|create|alter|copy)\b|;/i.test(sql)
const ensureLimit = sql => /\blimit\s+\d+/i.test(sql) ? sql.replace(/\blimit\s+(\d+)/i, (_, n) => `LIMIT ${Math.min(+n || 20, 20)}`) : `${sql} LIMIT 20`
const rowsFromReport = (res, s) => arr(s.rows.source == 'scope' ? res?.results?.[s.rows.scope] : res?.results?.sections?.[s.rows.sectionId]?.rows)
// S4 grounding invariant: ONE deterministic entity filter, applied to the summary rows AND to every UI rows payload -
// the text and the widgets can never disagree about which entities are shown. Rows without entity columns pass through.
const entityRowMatch = (e, vars) => {
  const selected = vars[e.varName] || {}, ids = new Set(arr(selected.ids).map(String)), labels = new Set(arr(selected.labels))
  const labelKeys = e.entity == 'branch' ? ['branch'] : ['item', 'product']
  const idKeys = e.entity == 'branch' ? ['branch_id'] : ['prt']
  return row => ![...labelKeys, ...idKeys].some(k => row?.[k] != null)
    || labelKeys.some(k => labels.has(row[k])) || idKeys.some(k => ids.has(String(row[k])))
}
export const filterRowsByEntities = (rows, entities, vars) =>
  arr(entities).reduce((xs, e) => xs.filter(entityRowMatch(e, vars)), arr(rows))
export const filterUiRowsByEntities = (ui, entities, vars) => !arr(entities).length ? arr(ui)
  : arr(ui).map(x => Array.isArray(x?.rows) ? {...x, rows: filterRowsByEntities(x.rows, entities, vars)} : x)
// a plain JS fn does not textually reference %$var% - await pending entity pickers explicitly before reading them
export const awaitEntityVars = (ctx, entities) => arr(entities).length
  ? jb.workflowUtils.waitForHumanFeedbackVars(ctx, arr(entities).map(e => `$${e.varName}`).join(' '), ctx.vars.workflowLogger)
  : Promise.resolve(ctx)
export const rowsValue = s => async ctx => {
  const resolved = await awaitEntityVars(ctx, s.entities)
  const base = ctx.vars.reportsRegistry?.find(r => r.id == s.reportId)?.kind != 'qlik-report'
    || !s.sections.length || s.entities.length
    ? rowsFromReport(ctx.data, s)
    : [
      ...arr(ctx.data?.results?.executiveSummary).map(r => ({...r, _analysis: 'executiveSummary'})),
      ...s.sections.flatMap(id => arr(ctx.data?.results?.sections?.[id]?.rows)
        .slice(0, 5).map(r => ({...r, _analysis: id})))
    ]
  return filterRowsByEntities(base, s.entities, resolved.vars)
}
// formatting-only normalizer (.00 stripping) - meaning-level text patching is forbidden; caveat behavior is governed by CAVEAT_POLICY
const cleanText = txt => String(txt || '')
  .replace(/(\d[\d,]*\.\d+)\.00\b/g, '$1').replace(/(\d[\d,]*)\.00\b/g, '$1').trim()
export const cleanAnswer = txt => txt && typeof txt == 'object'
  ? Object.fromEntries(Object.entries(txt).map(([k, v]) => [k, typeof v == 'string' ? cleanText(v) : v])) : cleanText(txt)
export const CAVEAT_POLICY = 'אם השורות אינן עונות על השאלה כפי שנשאלה, השתמש ב-caveats של הדוח או הפרקים '
  + 'כדי להסביר את הפער בין מה שנשאל למה שמוצג. '
  + 'אל תוסיף את ההסתייגות על השוואה להיסטוריית הפריט עצמו או קבוצת ביקורת '
  + 'אלא אם הדוח עוסק במבצעים או קידום.'
const WIDGET_KINDS = 'bar,hbar,pie,funnel,treemap,waterfall,line,area,table'.split(',')
const formatColumn = c => c.format ? c
  : /_pct\b|%/.test(`${c.key} ${c.label}`) ? {...c, format: '%'}
  : /(?:_ils|_sales|_profit|_basket)\b|מכירות|רווח/.test(`${c.key} ${c.label}`) ? {...c, format: '₪'} : c
const cleanWidget = ({data, rows, series, values, categories, xCategories, yCategories, points, items,
  columns, name, value, min, max, target, indicators, ...w} = {}) => {
  const kind = enumOf(w.kind, WIDGET_KINDS, 'bar')
  return kind == 'table' ? { ...w, kind, columns: arr(columns).filter(c => c?.key).map(formatColumn) }
    : { ...w, kind, ...(w.nameCol || name ? { nameCol: w.nameCol || name } : {}), ...(w.valueCol || value ? { valueCol: w.valueCol || value } : {}) }
}

const routeInstructions = `
Return raw JSON object only:
{"mode":"reports"|"directResponse"|"customAnswer",
"reports":[{"reportId":"id","candidateSections":["sectionId"]}],
"directResponse":{"groundedIn":{"turn":0},"instruction":"Hebrew instruction for the summarizer; may quote that turn's caveats"},
"justification":"which requested entities/metrics are or aren't covered by prior rowsShown/caveats or by the selected reports",
"hideWidgets":true|false,"reason":"short"}.
No XML/tags, markdown fences, or prose; first non-whitespace char must be { and last must be }.
You only SHORTLIST 1-3 reports and hint candidateSections; a stronger planner with the full schemas
makes every other decision (scope, depth, parameters, entities, SQL slice, widgets). Never decide those here.
justification is MANDATORY: state which requested entities/metrics are covered and by what.
COVERAGE CHECK (mode=directResponse): compare the question's requested entities and metrics against
entitiesShown and rowsShown columns on assistant turns in CONVERSATION_CONTEXT.chatHistory. If they are fully
covered - or a caveat on that turn explains why the shown coverage is complete - set groundedIn.turn to that
turn's zero-based index in chatHistory and write a Hebrew instruction for the summarizer. Do not run reports
for a question already answered by shown rows. The trigger is entity-level coverage, never topic similarity.
ANTI-REPEAT: a follow-up about data just shown must never lead to the identical previous plan; use
directResponse or shortlist a report/sections that produce a DIFFERENT cut.
mode=customAnswer only when no report's data covers the question at all (free SQL over the raw ERP data).
Return 1-3 reports. Select multiple reports when distinct parts of the question require different report goals;
never force one report to answer a part covered better by another;
use empty candidateSections only when report-level data answers the outcome. Never redundant reports or sections.
Set hideWidgets=DEFAULT_WIDGETS_ALREADY_SHOWN, except set it false when the question explicitly asks to show or visualize new widgets.
Silently split the question into atomic requested outcomes: entity, metric, ranking/comparison, filter and dependency.
Treat COMPACT_REPORTS as a hard schema: an outcome is covered only when available report data or section fields
explicitly provide its entity and metric. The shortlisted reports together must cover every outcome; never infer
fields from a title or neighboring section.
For a dependent question such as the top branch and its top product, choose customAnswer unless one report explicitly
covers the complete dependency. Independent reports cannot pass a winning entity from one report into another.
For a specific best/worst/top/bottom/comparison, hint a section whose data or fields contain the entity and metric.
For an entity ranking, candidateSections must not be empty; report-level aggregate data cannot identify a winning entity.
`

const slotInstructions = `
Return raw JSON object only. No XML/tags, markdown fences, or prose; first non-whitespace char must be { and last must be }.
Use only SELECTED_REPORT_DETAILS and fill slots for this fixed runtime template:
optional entity picker -> runReport -> keep rows/widgets/reactComps -> optional queryReportFullData slice
-> llmSummary -> finalAnswerFromReport.
Schema:
{"reportId":"id","scope":"executiveSummary|summary|none","sections":["sectionId"],"sectionDepth":"executiveSummary|summary|inDepth",
"params":{"$report":{"branchesToShow":["name"]},"sectionId":{"reportDate":"YYYY-MM-DD|latest","reportMonth":"YYYY-MM","maxRows":10}},
"rows":{"source":"scope|section|slice","scope":"executiveSummary|summary","sectionId":"sectionId"},
"entities":[{"entity":"product|branch",
"query":"exact user phrase only for a named/fuzzy product or branch; empty for dimensions/top lists/promotion ids",
"varName":"selectedProducts|selectedBranches","mode":"single|multi"}],
"slice":{"sectionId":"sectionId","sql":"SELECT ... FROM full_data ... GROUP BY ... ORDER BY ... LIMIT 20"},
"summaryEvaluation":"Hebrew instruction that names rows as the grounding var",
"narrative":"Hebrew one-sentence template over rows, e.g. {0.branch} ... {0.net:₪}",
"sqlDescription":"short report/section/depth description plus slice sql if any",
"widgets":[{"kind":"bar|hbar|pie|funnel|treemap|waterfall|line|area","title":"...",
"nameCol":"branch","valueCol":"net","valueFormat":"₪"},
{"kind":"table","title":"...","columns":[{"key":"branch","label":"סניף"}]}],
"followUps":[{"label":"<=40 chars","question":"..."}]}
For SELECTED_PATHS return {"plans":[...]} with exactly one complete schema object per selected report.
Rules: use only parameters declared by that exact selected slot, under $report or the section id;
omit params instead of inventing a value.
Treat candidateSections as routing hints; finalize sections from availableSections using the detailed slots and fields.
ToAnalyze and period arguments constrain report calculations;
ToShow arguments select verified output without changing comparisons or baselines.
minimum*/maximum* arguments tighten verified business thresholds within their declared bounds.
For a fullData slice, preserve those meanings and do not duplicate declared parameters in SQL.
Inspect accumulatedContext.clarifiedParams and CONVERSATION_CONTEXT before adding entities;
reuse already clarified product/branch filters and ask only for still-unresolved named/fuzzy filters.
Use slice only when FULL_DATA_SCHEMA is present and no verified slot parameter can express the requested cut.
SQL must be a single SELECT FROM full_data with GROUP BY/ORDER BY/LIMIT and may use
%$selectedProducts.sqlIn%, %$selectedProducts.sqlLabelsIn%, %$selectedBranches.sqlIn%,
%$selectedBranches.sqlLabelsIn% only for user-supplied named/fuzzy entity filters.
Never use {{...}} in generated slice SQL; {{ROOT}} is only for verified report catalog SQL.
Widget rules: declare widgets ONLY for a full_data slice. When the plan runs verified report scope/sections
without a slice, return "widgets":[] - the report's own verified widgets and panels render and must never be
replaced by a weaker ad-hoc table. Declared slice widgets are intent only: never output
data/rows/series/items/values/categories/xCategories/yCategories/points;
table uses columns only, charts use nameCol/valueCol only. Runtime materializes render props from rows.
Every *_pct SQL column must be on a 0–100 scale (100*ratio) and its widget column must use format:"%".
When FULL_DATA has period_bucket, every period-specific metric must FILTER or CASE on period_bucket='current'
or 'previous'; never use a bare SUM over both periods as a current metric.
For slice SQL, follow QUERY_GUIDANCE and EXAMPLE_SQL;
preserve the documented grain, use only listed columns with their exact identifier quoting, and apply the requested temporal filter explicitly.
For top/bottom/best/worst return the requested N or 10 ordered rows with the answer first; never reduce the result
to only row_number()=1. Every ranking claim needs its own visible chart or table over those context rows.
For all-time/historical ("אי פעם") questions, return a slice from a historical FULL_DATA_SCHEMA; active/latest slots cannot answer them.
For two rankings, return both lists and two widgets; never keep one ranking only as a scalar helper.
When DETERMINISTIC_FAILURE is present, the previous plan failed exactly as described: fix ONLY what failed -
correct failed parameter values using supportedParams/candidates, choose different sections, or return a
full_data slice for a section with FULL_DATA_SCHEMA instead of the failing parameters.
When DETERMINISTIC_FAILURE has code ANTI_REPEAT, the new plan must differ from previousPlan in depth,
params, sections or slice while still answering the follow-up.
summaryEvaluation, narrative, widget titles, column labels and followUps must use natural Hebrew business terms only.
Never expose SQL aliases, raw column names, snake_case, rows, reportResult or other implementation terms to the user.
Never assume the latest date equals today; use max(date column) when the question means latest available data.
`

// the router is RETRIEVAL ONLY: it shortlists reports (candidateSections are hints), flags directResponse
// coverage, or bails to customAnswer. It never decides scope/depth/params/slice - the planner does, with
// full schemas. A malformed answer gets ONE retry with the failure spelled out, never a regex correction.
const customAnswerRoute = reason => ({ mode: 'customAnswer', customAnswer: true, reason })
export const normalizeReportRoute = (raw, ctx) => {
  const registry = ctx.vars.reportsRegistry || []
  const mode = enumOf(raw.mode, ['reports', 'directResponse', 'customAnswer'],
    raw.customAnswer ? 'customAnswer' : 'reports')
  if (mode == 'customAnswer') return customAnswerRoute(raw.reason || '')
  if (mode == 'directResponse') {
    const history = arr(ctx.vars.accumulatedContext?.chatHistory)
    const turn = +raw.directResponse?.groundedIn?.turn
    const grounded = history[turn]
    if (grounded?.role != 'assistant' || !arr(grounded?.rowsShown).length)
      return {invalid: {error: `directResponse groundedIn.turn ${raw.directResponse?.groundedIn?.turn} is not an `
        + 'assistant turn carrying rowsShown; pick a valid turn index or use mode "reports"'}}
    return {mode: 'directResponse', customAnswer: false, turn, grounded,
      instruction: String(raw.directResponse?.instruction || ''),
      justification: String(raw.justification || ''), hideWidgets: raw.hideWidgets !== false}
  }
  const reports = arr(raw.reports).slice(0, 3)
    .map(p => ({reportId: p.reportId, candidateSections: uniq(arr(p.candidateSections ?? p.sections))}))
  const unknown = reports.filter(p => !registry.some(r => r.id == p.reportId)).map(p => p.reportId)
  if (unknown.length || !reports.length)
    return {invalid: {error: reports.length ? `unknown reportIds: ${unknown.join(', ')}` : 'no reports returned',
      availableReports: registry.map(r => r.id)}}
  const deduped = [...reports.reduce((m, p) => m.set(p.reportId, {reportId: p.reportId,
    candidateSections: uniq([...(m.get(p.reportId)?.candidateSections || []), ...p.candidateSections])}), new Map()).values()]
    .map(p => {
      const report = registry.find(r => r.id == p.reportId)
      return {...p, candidateSections: p.candidateSections.filter(id => sectionMap(report)[id])}
    })
  // hideWidgets only suppresses ALREADY-SHOWN default widgets - with no prior assistant turn there is nothing
  // to suppress, so a stray true from the router cannot blank a first answer
  const widgetsAlreadyShown = arr(ctx.vars.accumulatedContext?.chatHistory)
    .some(x => x.role == 'assistant' && (x.plan || x.rowsShown))
  return {mode: 'reports', customAnswer: false, reports: deduped,
    hideWidgets: !!raw.hideWidgets && widgetsAlreadyShown,
    justification: String(raw.justification || ''), reason: raw.reason || ''}
}
export const reportRoutes = route => arr(route?.reports)

export async function selectRoute(ctx, model) {
  ctx.vars.workflowLogger?.status?.('בוחר דוח מאומת...')
  const instructions = [`COMPACT_REPORTS:\n${routeCatalog(ctx.vars.reportsRegistry)}`, routeInstructions].join('\n\n')
  let failure
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = [routePrompt(ctx), failure && `PREVIOUS_ATTEMPT_FAILED - fix exactly this and answer again:\n${JSON.stringify(failure)}`]
      .filter(Boolean).join('\n\n')
    try {
      const {responseText} = await fetchItemsFromLLMReactiveP({ctx, model, goal: 'report template route', prompt,
        instructions, maxTokens: null, temperature: 0, thinkingBudget: 0})
      const route = normalizeReportRoute(parseJsonObject(responseText, 'report template route'), ctx)
      if (!route.invalid) {
        ctx.vars.workflowLogger?.info({t: 'reportsTemplateRoute', source: 'llm', model, attempt,
          mode: route.mode, reports: route.reports?.map(p => p.reportId), turn: route.turn,
          justification: route.justification}, {route}, {ctx})
        return route
      }
      failure = route.invalid
    } catch (error) { failure = {error: error.message || String(error)} }
    ctx.vars.workflowLogger?.info({t: 'reportsTemplateRouteRetry', model, attempt, error: failure?.error}, {}, {ctx})
  }
  return customAnswerRoute(`router failed twice: ${String(failure?.error).slice(0, 200)}`)
}

export async function validateCustomAnswer(ctx, res) {
  const answer = res?.runRes
  if (answer?.error || typeof answer?.text != 'string' || typeof answer?.sql != 'string' || !Array.isArray(answer.rows))
    throw new Error(answer?.error || 'custom answer is missing text, sql, or rows')
  const replayed = await duckDbSql.$runWithCtx(ctx, answer.sql)
  if (!Array.isArray(replayed) || JSON.stringify(replayed.slice(0, 50)) != JSON.stringify(answer.rows))
    throw new Error(replayed?.error || 'custom answer rows do not match its SQL')
  return { ...res, runRes: markUnverifiedAnswer({ ...answer,
    widgets: arr(answer.widgets).map(w => /corr|מתאם/i.test(`${w.valueCol} ${w.x} ${w.y} ${w.title}`) && w.valueFormat ? { ...w, valueFormat: '' } : w) }) }
}

export const markUnverifiedAnswer = r => ({ ...r,
  text: String(r?.text || '').startsWith(UNVERIFIED_WARNING) ? r.text : `${UNVERIFIED_WARNING}\n\n${r?.text || ''}`,
  verified: false, verificationWarning: UNVERIFIED_WARNING })
export const requireSliceRows = rows => {
  if (!Array.isArray(rows)) throw new Error(rows?.error || 'full_data slice returned no row array')
  return rows
}
export const requiresReportExecution = slots => !slots.slice || !!Object.keys(slots.params).length

export const runCustomAnswer = async (ctx, model) => {
  const nextCtx = ctx.setVars({comaxDataset: 'big', unverifiedAnswerWarning: UNVERIFIED_WARNING,
    categories: {...(ctx.vars.categories || {}), analytics: true, local: true, viz: true}})
  const workflow = dsls.workflow.workflow.basicAnalytics.$runWithCtx(nextCtx,
    {...(model && {model}), ...(ctx.vars.summaryModel && {summaryModel: ctx.vars.summaryModel})})
  return validateCustomAnswer(nextCtx, await workflow.calcWorkflow(nextCtx))
}

// planner is the SOLE decision maker below the report shortlist; the only hard constraint is the shortlist itself
export const constrainSlots = (slots, route) => {
  const shortlist = arr(route.reports).map(p => p.reportId)
  if (slots.reportId && shortlist.length && !shortlist.includes(slots.reportId))
    throw new Error(`slot planner chose ${slots.reportId} outside the routed shortlist: ${shortlist.join(', ')}`)
  return {...slots, hideWidgets: !!route.hideWidgets}
}

// anti-repeat: a follow-up must not re-execute the byte-identical previous plan; the violation feeds ONE planner retry
const canonJson = v => JSON.stringify(v ?? null, (k, x) => x && typeof x == 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x).sort()) : x)
export const planTuple = s => canonJson({reportId: s.reportId, sections: arr(s.sections),
  sectionDepth: s.sectionDepth || 'summary', params: compactParams(s.params), slice: s.slice?.sql || s.slice || null})
export const antiRepeatFailure = (slots, ctx) => {
  const prev = arr(ctx.vars.accumulatedContext?.chatHistory).filter(x => x.role == 'assistant').at(-1)?.plan
  return prev && !Array.isArray(prev) && prev.reportId && planTuple(slots) == planTuple(prev)
    ? {code: 'ANTI_REPEAT', error: 'the planned tuple is identical to the previous assistant turn; the user asked a '
      + 'follow-up - change depth/params/sections/slice, or use the shown rows differently', previousPlan: prev} : null
}

export async function selectSlots(ctx, model, route, failure) {
  ctx.vars.workflowLogger?.status?.('מתכנן דוח מאומת...')
  const registry = ctx.vars.reportsRegistry
  const paths = arr(route.reports).map(p => ({reportId: p.reportId, candidateSections: arr(p.candidateSections),
    availableSections: (registry.find(r => r.id == p.reportId)?.sections || []).map(s => s.id)}))
  const multi = paths.length > 1
  const details = paths.map(p => reportDetails(registry.find(r => r.id == p.reportId), p.availableSections, true)).join('\n\n')
  const instructions = [`SELECTED_REPORT_DETAILS:\n${details}`, slotInstructions].join('\n\n')
  const prompt = [
    `${ctx.vars.TODAYS_DATE} -- ANALYTICS_QUESTION: ${ctx.vars.userMessage}`,
    contextPrompt(ctx),
    `${multi ? 'SELECTED_PATHS' : 'SELECTED_PATH'}:\n${JSON.stringify(multi ? paths : paths[0])}`,
    failure && `DETERMINISTIC_FAILURE:\n${JSON.stringify(failure)}`
  ].filter(Boolean).join('\n\n')
  const {responseText} = await fetchItemsFromLLMReactiveP({ctx, model, goal: 'report template slots', prompt,
    instructions, maxTokens: multi ? 6000 : 3500, temperature: 0, thinkingBudget: 0})
  const raw = parseJsonObject(responseText, 'report template slots'), plans = arr(raw.plans?.length ? raw.plans : raw)
  const slots = paths.map(path => normalizeSlots(constrainSlots(plans.find(plan => plan.reportId == path.reportId)
    || (() => { throw new Error(`slot planner omitted ${path.reportId}`) })(), route), ctx))
  return multi ? slots : slots[0]
}

function normalizeSlots(raw, ctx) {
  const registry = ctx.vars.reportsRegistry || [], report = registry.find(r => r.id == raw.reportId)
  if (!report) throw new Error(`unknown reportId ${raw.reportId}`)
  const bySec = sectionMap(report)
  const requestedScope = enumOf(raw.scope == 'none' && raw.rows?.source == 'scope' ? raw.rows.scope : raw.scope,
    ['executiveSummary','summary','none'], 'executiveSummary')
  const scope = report.kind == 'qlik-report' && requestedScope != 'none' ? 'executiveSummary' : requestedScope
  const sectionDepth = enumOf(raw.sectionDepth, ['executiveSummary', 'summary', 'inDepth'], 'summary')
  const sliceSectionId = raw.slice?.sectionId || raw.rows?.sectionId
  const rawSlice = raw.slice?.sql && {sectionId: sliceSectionId,
    sql: ensureLimit(quoteSchemaColumns(String(raw.slice.sql).trim(), bySec[sliceSectionId]?.fullData?.columns))}
  const sections = uniq(arr(raw.sections).filter(id => bySec[id]))
  if (rawSlice && (!sections.includes(rawSlice.sectionId) || !bySec[rawSlice.sectionId]?.fullData
    || !validSql(rawSlice.sql))) throw new Error(`invalid slice for ${report.id}/${rawSlice.sectionId}`)
  if (raw.params != null && (typeof raw.params != 'object' || Array.isArray(raw.params)))
    throw new Error(`invalid params object for ${report.id}`)
  const rawParams = compactParams(raw.params), targets = [...sections, ...(scope == 'none' ? [] : ['$report'])]
  const invalidTargets = Object.keys(rawParams).filter(id => !targets.includes(id))
  if (invalidTargets.length)
    throw new Error(`params target unselected slots: ${invalidTargets.join(', ')}`)
  const malformedTargets = Object.entries(rawParams).filter(([, values]) => !values || typeof values != 'object' || Array.isArray(values))
  if (malformedTargets.length)
    throw new Error(`params target must contain an object: ${malformedTargets.map(([id]) => id).join(', ')}`)
  if (scope == 'none' && !sections.length) throw new Error(`report ${report.id} has neither scope nor sections`)
  const rows = rawSlice ? { source: 'slice' }
    : raw.rows?.source == 'scope' || !sections.length
      ? {source: 'scope', scope: scope == 'none' ? 'executiveSummary' : scope}
      : {source: 'section', sectionId: bySec[raw.rows?.sectionId]?.id || sections[0]}
  const entities = arr(raw.entities || raw.entity).map(e => ({
    entity: enumOf(e.entity, ['product', 'branch'], 'product'),
    query: e.query,
    varName: e.varName || (e.entity == 'branch' ? 'selectedBranches' : 'selectedProducts'),
    mode: enumOf(e.mode, ['single', 'multi'], 'multi')
  }))
    .filter(e => e.query && (!rawSlice || rawSlice.sql.includes(`%$${e.varName}.`)))
  ;(rawSlice?.sql.match(/%\$(selectedProducts|selectedBranches)\./g) || []).map(m => m.slice(2, -1)).forEach(v => {
    if (!entities.some(e => e.varName == v)) throw new Error(`slice references ${v} without entity slot`)
  })
  const params = Object.fromEntries(targets.filter(id => rawParams[id]
    && typeof rawParams[id] == 'object' && Object.keys(rawParams[id]).length).map(id => [id, rawParams[id]]))
  const summaryEvaluation = [
    raw.summaryEvaluation
      || 'ענה בעברית עסקית קצרה על שאלת המשתמש מתוך rows; '
        + 'הדגש מספרים מרכזיים ב-**bold** ואם אין שורות אמור שלא נמצאו נתונים מתאימים.',
    report.analysisLogic && `פעל לפי שיטת הניתוח של מסך Qlik:\n${report.analysisLogic}`,
    report.answerInstructions && `הוראות התשובה:\n${report.answerInstructions}`,
    ...sections.map(id => bySec[id]?.answerInstructions
      && `הוראות התשובה לפרק ${bySec[id].title || id}:\n${bySec[id].answerInstructions}`)
  ].filter(Boolean).join('\n')
  const narrative = [...String(raw.narrative || '').matchAll(/\{([^}]+)\}/g)]
    .every(([, x]) => /^\d+\.[A-Za-z_]\w*(?::(?:₪|%|qty))?$/.test(x)) ? raw.narrative || '' : ''
  const sqlDescription = raw.sqlDescription || `report: ${report.id} (${scope})`
    + `${sections.length ? ` sections: ${sections.join(',')} (${sectionDepth})` : ''}`
    + `${rawSlice ? `; slice: ${rawSlice.sql}` : ''}`
  return {reportId: report.id, scope, sections, sectionDepth, params, rows, entities, slice: rawSlice,
    hideWidgets: !!raw.hideWidgets,
    summaryEvaluation, narrative, sqlDescription,
    widgets: arr(raw.widgets).map(cleanWidget).filter(Boolean), followUps: arr(raw.followUps).slice(0, 4)}
}

const entityElems = s => s.entities.map(e => asHumanFeedback({goal: `Resolve ${e.entity}`,
  varName: e.varName, question: e.entity == 'branch' ? 'לאיזה סניף התכוונת?' : 'לאיזה מוצר התכוונת?',
  mode: e.mode, options: comaxEntityCandidates({entity: e.entity, query: e.query, limit: 12})}))
export const reportEntityFlow = s => flow({elems: entityElems(s)})
const reportArgs = (s, params) => ({reportId: s.reportId, scope: s.scope, sections: s.sections,
  sectionDepth: s.sectionDepth, params})
const reportFailure = (res, s) => {
  if (res?.error) return res
  const runs = [...(s.scope == 'none' ? [] : [['$report', res?.results?.[s.scope]]]),
    ...s.sections.map(id => [id, res?.results?.sections?.[id]?.rows])]
  const failures = runs.filter(([, rows]) => !Array.isArray(rows))
    .map(([target, rows]) => ({target, errors: [{error: rows?.error || 'missing result rows'}]}))
  return failures.length ? {error: `REPORT_SQL_ERROR: ${failures.map(x => `${x.target}: ${x.errors[0].error}`).join(' | ')}`,
    code: 'REPORT_SQL_ERROR', failures} : null
}

// one honest execution attempt: success or a STRUCTURED failure (with supportedParams/candidates from
// runReport) that feeds the single planner retry. No hidden repair ladder.
export async function executeReportPlan(ctx, model, s, runtime = {}) {
  const run = params => runtime.runReport ? runtime.runReport(params)
    : runReport.$runWithCtx(ctx, reportArgs(s, params))
  const result = await run(s.params), failure = reportFailure(result, s)
  const attempts = [{source: 'verified', params: s.params, error: failure?.error}]
  return failure ? {source: 'failed', failure, reportResult: result, slots: s, attempts, ctx}
    : {source: 'verified', reportResult: result, slots: s, attempts, ctx}
}
export const runSliceRows = async (ctx, slots) => requireSliceRows(
  await queryReportFullData.$runWithCtx(ctx, {reportId: slots.reportId,
    sectionId: slots.slice.sectionId, sectionDepth: slots.sectionDepth,
    params: slots.params?.[slots.slice.sectionId], sql: slots.slice.sql}))

const reportResultRows = ({route, execution}) => {
  if (execution.rows) return arr(execution.rows).map(row => ({...row, _reportId: route.reportId, _slot: 'slice'}))
  const results = execution.reportResult?.results || {}
  return [
    ...Object.entries(results).filter(([id, rows]) => id != 'sections' && Array.isArray(rows))
      .flatMap(([id, rows]) => rows.map(row => ({...row, _reportId: route.reportId, _slot: id}))),
    ...Object.entries(results.sections || {}).flatMap(([id, section]) =>
      arr(section?.rows).map(row => ({...row, _reportId: route.reportId, _slot: id})))
  ]
}
export const combineReportResults = runs => ({
  reportId: runs.map(({route}) => route.reportId).join('+'),
  title: runs.map(({execution}) => execution.reportResult?.title).filter(Boolean).join(' + '),
  caveats: runs.map(({execution}) => execution.reportResult?.caveats).filter(Boolean).join('\n'),
  results: {reports: Object.fromEntries(runs.map(({route, execution}) =>
    [route.reportId, execution.reportResult?.results || {}]))},
  widgets: runs.flatMap(({route, execution}) => arr(execution.reportResult?.widgets)
    .map(widget => ({...widget, reportId: route.reportId}))),
  reactComps: runs.flatMap(({route, execution}) => arr(execution.reportResult?.reactComps)
    .map(reactComp => ({...reactComp, reportId: route.reportId})))
})
const combinedReportSlots = runs => {
  const ids = runs.map(({route}) => route.reportId), promotions = ids.includes('promotions')
    && ids.includes('promo-recommendations')
  return {reportId: ids.join('+'), scope: 'none', sections: [], sectionDepth: 'summary',
    hideWidgets: runs.some(({route}) => route.hideWidgets),
    params: {}, rows: {source: 'slice'}, entities: [], slice: null, narrative: '', widgets: [], followUps: [],
    sqlDescription: `reports: ${ids.join(', ')}`,
    summaryEvaluation: [
      'ענה בעברית עסקית מתוך reportResult/results/reports בלבד. שלב את כל הדוחות שנבחרו לתשובה אחת, '
        + 'כסה כל דוח בראיה מספרית, ואל תחבר מדדים בעלי גרגר או הגדרה שונים.',
      promotions && 'פתח במספר המבצעים הפעילים והמפסידים מתוך promotions. לאחר מכן בחר פעולות '
        + 'מתועדפות מתוך rerun-winners ו-stop-list של promo-recommendations. אל תציג את ההמלצות '
        + 'כהתאמה אחת-לאחת למבצעים המפסידים. ב-SHORT_ANSWER אל תכתוב '
        + 'טווחים מספריים; ציין את ספירת המפסידים ופעולה מובילה אחת. ב-LONG_ANSWER השתמש בכותרות '
        + '"### מצב", "### מומלץ להפעיל" ו-"### לעצור או לצמצם", וברשימות ממוספרות של 2-3 מבצעים; '
        + 'במצב כתוב משפט אחד בלבד; כל שורת פעולה: **שם המבצע**, פעולה ושני מספרים חשובים בלבד; '
        + 'ללא הביטוי "התמונה מצביעה".'
    ].filter(Boolean).join('\n')}
}
export async function executeMultiReportPlan(ctx, model, route, failure) {
  const plans = await selectSlots(ctx, model, route, failure)
  const runs = await Promise.all(arr(plans).map(async slots => {
    const runCtx = slots.entities.length ? await ctx.setData(null).run(reportEntityFlow(slots)) : ctx
    let execution = await executeReportPlan(runCtx, model, slots)
    if (execution.source == 'failed')
      throw Object.assign(new Error(execution.failure.error), {planFailure: execution.failure})
    if (slots.slice) execution = {...execution, source: 'fullData', rows: await runSliceRows(execution.ctx, slots)}
    return {route: {reportId: slots.reportId, hideWidgets: slots.hideWidgets}, slots, execution}
  }))
  const slots = combinedReportSlots(runs), source = runs.some(({execution}) => execution.source == 'fullData')
    ? 'fullData' : 'verified'
  return {runs, slots, execution: {source, reportResult: combineReportResults(runs),
    rows: runs.flatMap(reportResultRows), attempts: runs.flatMap(({execution}) => execution.attempts), ctx}}
}

Object.assign(jb.workflowUtils, {
  normalizeReportRoute,
  normalizeReportTemplateSlots: normalizeSlots,
  reportEntityRowsFilter: filterRowsByEntities,
  runCustomAnswer,
  cleanReportTemplateAnswer: cleanAnswer,
  parseReportTemplateJson: parseJsonObject,
  reportTemplateRouteCatalog: routeCatalog,
  reportTemplateRoutePrompt: routePrompt,
  reportTemplateReportDetails: reportDetails,
  reportTemplateSlotInstructions: slotInstructions,
  reportTemplateRouteInstructions: routeInstructions
})
