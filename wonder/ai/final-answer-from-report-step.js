import { dsls, coreUtils } from '@jb6/core'
import './llm-flow-core.js'
import { materializeWidgets } from './widget-column-resolver.js'

const { tgp: { TgpType } } = dsls
const FlowElem = TgpType('flow-elem', 'workflow')

// Declarative final-answer assembly for the reports agent — like finalAnswer, plus report-specific
// behaviours that keep the LLM from re-typing what the runtime already knows: it uses runReport's prebuilt
// .widgets only when no focused slice widget is declared, builds slice widgets FROM the rows, and derives reportsUsed from
// the logged runReport calls (provenance by construction). The LLM declares only literal strings + column
// names; the runtime substitutes vars and handles the empty-rows branch once — no jq mega-expression.
const FMT = { '₪': v => Math.round(+v).toLocaleString('en-US') + ' ₪', '%': v => (+v).toFixed(1) + '%' }
// a numeric format over a value that does not coerce to a number (missing col, '4,011.00', free text) counts as MISSING - never render 'NaN ₪'
const badVal = (v, f) => v == null || (FMT[f] && Number.isNaN(+v))
const fmtVal = (v, f) => badVal(v, f) ? '' : (FMT[f] || (x => typeof x == 'number' ? x.toLocaleString('en-US') : String(x)))(v)
const answerText = x => typeof x == 'string' ? x : x?.text || x?.shortAnswer || x?.error || JSON.stringify(x ?? '')
const answerLongText = x => typeof x == 'object' && x ? x.longText || x.longAnswer || '' : ''
const firstLine = s => String(s || '').replace(/\*\*/g, '').split('\n').find(Boolean)?.trim() || ''
const reportsUsedFromLog = log => (log || []).filter(e => e.t == 'runReport')
  .map(e => ({ reportId: e.reportId, sections: Object.keys(e.sections || {}), depth: e.sectionDepth }))

FlowElem('finalAnswerFromReport', {
  description: 'assemble {text,narrative,sql,rows,widgets,reactComps,followUps,reportsUsed} for reports — '
    + 'runReport UI is fallback; slice widgets are materialized from rows',
  params: [
    {id: 'goal', as: 'string'},
    {id: 'status', as: 'string'},
    {id: 'textVar', as: 'string', defaultValue: 'answer', description: 'ctx var holding the Hebrew answer text'},
    {id: 'rowsVar', as: 'string', defaultValue: 'rows', description: 'ctx var holding the compact rows to show (a kept slice/section rows)'},
    {id: 'reportWidgetsVar', as: 'string',
      description: "ctx var holding runReport's prebuilt .widgets — used only when no focused slice widget is declared"},
    {id: 'reportReactCompsVar', as: 'string', defaultValue: 'reportReactComps', description: "ctx var holding runReport's prebuilt .reactComps"},
    {id: 'hideWidgets', as: 'boolean', description: 'hide only prebuilt report widgets/reactComps'},
    {id: 'narrative', as: 'text', dynamic: true, description: 'one Hebrew sentence; {0.col} / {0.col:₪} / {0.col:%} insert formatted rowsVar values'},
    {id: 'emptyNarrative', as: 'text', dynamic: true, defaultValue: 'לא נמצאו נתונים מתאימים לשאלה.'},
    {id: 'sql', as: 'text', dynamic: true, description: 'short description of the reports/sections used + any queryReportFullData sql (raw, no templating)'},
    {id: 'widgets', as: 'array', description: 'declarative slice widget specs only: table uses columns; charts use nameCol/valueCol; never pass data/rows/series/items'},
    {id: 'followUps', as: 'array'},
    {id: 'maxRows', as: 'number', defaultValue: 50}
  ],
  impl: async (ctx, {flowIndex, workflowLogger}, {goal, status, textVar, rowsVar, reportWidgetsVar,
    reportReactCompsVar, hideWidgets, narrative, emptyNarrative, sql, widgets, followUps, maxRows}) => {
    const logger = workflowLogger || ctx.vars.logger
    logger?.step(flowIndex, status || goal)
    logger?.workflowTrace?.push({ flowIndex, input: ctx.data })
    const rawCtx = ctx.setVars({ doNotCalcExpression: true })   // literal params: keep Hebrew quotes, LIKE patterns, % intact
    const answer = ctx.vars[textVar], text = answerText(answer), longText = answerLongText(answer)
    let res
    try {
      const rows = coreUtils.asArray(ctx.vars[rowsVar] ?? []).filter(r => r != null && typeof r == 'object')
      const reportWidgets = hideWidgets ? [] : coreUtils.asArray(reportWidgetsVar ? ctx.vars[reportWidgetsVar] ?? [] : [])
      const reactComps = hideWidgets ? [] : coreUtils.asArray(reportReactCompsVar ? ctx.vars[reportReactCompsVar] ?? [] : [])
      const fill = s => {
        let missing = false
        const out = String(s ?? '').replace(/\{(\d+)\.(\w+)(?::([^}]+))?\}/g,
          (_, i, col, f) => ((missing ||= badVal(rows[+i]?.[col], f)), fmtVal(rows[+i]?.[col], f)))
        return missing ? '' : out
      }
      const sliceWidgets = await materializeWidgets(rows, widgets, { maxRows, ctx })
      const reportUi = sliceWidgets.length || reportWidgets.length || reactComps.length
      const renderedNarrative = rows.length ? fill(narrative(rawCtx)) || firstLine(text) || emptyNarrative(rawCtx)
        : reportUi ? '' : emptyNarrative(rawCtx)
      res = { text, ...(longText && { longText }), narrative: renderedNarrative, sql: sql(rawCtx),
        rows: rows.slice(0, maxRows), widgets: sliceWidgets.length ? sliceWidgets : reportWidgets, reactComps,
        followUps: followUps || [], reportsUsed: reportsUsedFromLog(logger?.workflowLog) }
    } catch (error) {
      logger?.error({ t: 'finalAnswerFromReport assemble error', goal }, {}, { ctx, error })
      res = { text, narrative: '', sql: '', rows: [], widgets: [], reactComps: [], followUps: [], reportsUsed: [], assembleError: error.stack || String(error) }
    }
    logger?.info({t: 'finalAnswerFromReport', goal, flowIndex, rowsCount: res.rows.length,
      widgetsCount: res.widgets.length, reactCompsCount: res.reactComps.length, reportsUsed: res.reportsUsed}, {}, {ctx})
    logger?.workflowTrace?.push({ flowIndex, output: { ...res, rows: res.rows.slice(0, 3) } })
    return ctx.setData(res)
  }
})
