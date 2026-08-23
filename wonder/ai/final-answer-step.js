import { dsls, coreUtils } from '@jb6/core'
import './llm-flow-core.js'
import { materializeWidgets } from './widget-column-resolver.js'

const { tgp: { TgpType } } = dsls
const FlowElem = TgpType('flow-elem', 'ai')

// Declarative final-answer assembly — replaces the LLM-authored jq mega-expression that crashed on
// Hebrew quotes (מע"מ), `=` assignments and unresolved $rows. The LLM only declares literal strings
// and column names; the runtime substitutes vars, builds widget data FROM the rows (provenance by
// construction) and handles the empty-rows branch once.
const FMT = { '₪': v => Math.round(+v).toLocaleString('en-US') + ' ₪', '%': v => (+v).toFixed(1) + '%' }
// a numeric format over a value that does not coerce to a number counts as missing - never render 'NaN ₪'
const fmtVal = (v, f) => v == null || (FMT[f] && Number.isNaN(+v)) ? '' : (FMT[f] || (x => typeof x == 'number' ? x.toLocaleString('en-US') : String(x)))(v)
const answerText = x => typeof x == 'string' ? x : x?.text || x?.shortAnswer || x?.error || JSON.stringify(x ?? '')
const answerLongText = x => typeof x == 'object' && x ? x.longText || x.longAnswer || '' : ''

FlowElem('finalAnswer', {
  description: 'assemble {text,narrative,sql,rows,widgets,followUps} from kept vars — no jq; widgets are declarative specs and runtime builds rows/data',
  params: [
    {id: 'goal', as: 'string'},
    {id: 'status', as: 'string'},
    {id: 'textVar', as: 'string', defaultValue: 'answer', description: 'ctx var holding the Hebrew answer text'},
    {id: 'rowsVar', as: 'string', defaultValue: 'rows', description: 'ctx var holding the SQL result rows'},
    {id: 'narrative', as: 'text', dynamic: true, description: 'one Hebrew sentence; {0.col} / {0.col:₪} / {0.col:%} insert formatted row values'},
    {id: 'emptyNarrative', as: 'text', dynamic: true, defaultValue: 'לא נמצאו נתונים מתאימים לשאלה.'},
    {id: 'sql', as: 'text', dynamic: true, description: 'the exact SQL string that ran (raw, no templating)'},
    {id: 'widgets', as: 'array', description: 'declarative widget specs only: table uses columns; charts use nameCol/valueCol; never pass data/rows/series/items'},
    {id: 'followUps', as: 'array'},
    {id: 'maxRows', as: 'number', defaultValue: 50}
  ],
  impl: async (ctx, { flowIndex, workflowLogger }, { goal, status, textVar, rowsVar, narrative, emptyNarrative, sql, widgets, followUps, maxRows }) => {
    const logger = workflowLogger || ctx.vars.logger
    logger?.step(flowIndex, status || goal)
    logger?.workflowTrace?.push({ flowIndex, input: ctx.data })
    const rawCtx = ctx.setVars({ doNotCalcExpression: true })   // literal params: keep Hebrew quotes, LIKE patterns, % signs intact
    const answer = ctx.vars[textVar], warning = ctx.vars.unverifiedAnswerWarning, longText = answerLongText(answer)
    const text0 = answerText(answer)
    const text = warning && !text0.includes(warning) ? `${warning}\n\n${text0}` : text0
    let res
    try {
      const rows = coreUtils.asArray(ctx.vars[rowsVar] ?? []).filter(r => r != null && typeof r == 'object')
      const fill = s => String(s ?? '').replace(/\{(\d+)\.(\w+)(?::([^}]+))?\}/g, (_, i, col, f) => fmtVal(rows[+i]?.[col], f))
      res = rows.length
        ? { text, ...(longText && { longText }), narrative: fill(narrative(rawCtx)), sql: sql(rawCtx), rows: rows.slice(0, maxRows),
            widgets: await materializeWidgets(rows, widgets, { maxRows, ctx }), followUps: followUps || [], ...(warning && { verified: false, verificationWarning: warning }) }
        : { text, ...(longText && { longText }), narrative: emptyNarrative(rawCtx), sql: sql(rawCtx), rows: [], widgets: [], followUps: followUps || [], ...(warning && { verified: false, verificationWarning: warning }) }
    } catch (error) {
      logger?.error({ t: 'finalAnswer assemble error', goal }, {}, { ctx, error })
      res = { text, narrative: '', sql: '', rows: [], widgets: [], followUps: [], assembleError: error.stack || String(error) }
    }
    logger?.info({ t: 'finalAnswer', goal, flowIndex, rowsCount: res.rows.length, widgetsCount: res.widgets.length }, {}, { ctx })
    logger?.workflowTrace?.push({ flowIndex, output: { ...res, rows: res.rows.slice(0, 3) } })
    return ctx.setData(res)
  }
})
