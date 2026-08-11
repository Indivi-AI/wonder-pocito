import { dsls, jb } from '@jb6/core'
import '@jb6/common'
import '@jb6/jq'
import '@jb6/llm-guide'
import '@wonder/llm-flow/llm-flow-core.js'
import '@wonder/llm-flow/parallel-step.js'
import '@wonder/llm-flow/agent-steps.js'
import '@wonder/llm-flow/duckdb-sql-step.js'
import '@wonder/llm-flow/report-step.js'
import '@wonder/llm-flow/llm-flow-doclets.js'
import '@wonder/verified-queries/verified-queries-dsl.js'
import '../Reports/comax-reports.js'
import '../Reports/index.js'
import '@wonder/core/db-drivers.js'
const { wfetch2, wresolve } = jb.wonderUtils
import { writeBigLog } from '@wonder/core/base-utils.js'
import { fetchItemsFromLLMReactiveP } from '@wonder/core/reactive-llm.js'
import { PERF_VIEW } from '../Reports/promo-shared.js'

const { tgp: { TgpType }, common: { Data, data }, workflow: { Workflow, workflow: { flowWorkflow }, 'flow-elem': { flow, setCtxVar, until, replan } }, 'llm-guide': { Doclet } } = dsls
const FlowElem = TgpType('flow-elem', 'workflow'), MODEL = 'openai/gpt-5.5', ROOT = 'signedRoom://comaxDemo/usersRO/parquet/OEM_BI_4466'
const arr = v => Array.isArray(v) ? v : v == null ? [] : [v]
const rowsOf = v => Array.isArray(v) ? v : Array.isArray(v?.rows) ? v.rows : Array.isArray(v?.data) ? v.data : arr(v)
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const mark = (id, x) => `// dashboard-widget:${x} ${id}`
const codePart = s => (String(s || '').match(/```(?:javascript|js)?\s*([\s\S]*?)```/i)?.[1] || s).trim()
const readJs = async (url, ctx) => {
  const r = await wfetch2(url, { method: 'GET' }, ctx); if (r?.ok) return r.text()
  const loc = r?.status == 302 && r.headers?.get?.('location')
  if (loc) { const fr = await fetch(loc); if (fr.ok) return fr.text() }
  const resolved = await wresolve(url, ctx)
  if (globalThis.process?.versions?.node && resolved && !/^https?:/i.test(resolved)) return (await import('fs')).readFileSync(resolved.replace(/\?.*/, ''), 'utf8')
  return ''
}
const draftUrlOf = url => String(url).replace(/\.js(?:\?.*)?$/, '-draft.js')
const manifestUrl = roomUrl => `${(roomUrl || 'signedRoom://comaxDemo').replace(/\/$/, '')}/dashboards/dashboard-draft`
const uniqReports = xs => [...new Map(arr(xs).filter(r => r?.id).map(r => [r.id, r])).values()]
const reportsOf = ctx => uniqReports(ctx.vars.reportsRegistry || data.verifiedReportsRegistry.$runWithCtx(ctx))
const catalog = rs => reportsOf({ vars: { reportsRegistry: rs } }).map(r => ({ id: r.id, title: r.title, sections: arr(r.sections).map(s => ({ id: s.id, title: s.title, columns: s.fullData?.columns })) }))
const sqlRoot = (sql, ctx) => String(sql || '').replaceAll('{{ROOT}}', ctx.vars.reportsRoot || ROOT)
const json = text => { const s = String(text ?? '').trim(); if (!s.startsWith('{')) throw new Error(`dashboard edit plan returned non-JSON object: ${s.slice(0, 100)}`); return JSON.parse(s) }

export const dashboardWidgetBlock = (code, id) => String(code).match(new RegExp(`${esc(mark(id, 'start'))}[\\s\\S]*?${esc(mark(id, 'end'))}`))?.[0]
export const normalizeDashboardWidgetEdit = (text, id) => {
  const code = codePart(text)
  return code.includes(mark(id, 'start')) ? code : `${mark(id, 'start')}\n${code}\n${mark(id, 'end')}`
}
export const replaceDashboardWidgetBlock = (code, id, edited) => {
  const old = dashboardWidgetBlock(code, id), next = normalizeDashboardWidgetEdit(edited, id)
  if (!old) throw new Error(`dashboard widget ${id} not found`)
  if (!next.includes(`ReactComp('${id}'`) && !next.includes(`ReactComp("${id}"`)) throw new Error(`edited block must define ReactComp('${id}')`)
  return String(code).replace(old, next)
}

const planSql = {
  table: `SELECT C AS promo_id, trim(Nm) AS promo_name, FromDate::DATE AS from_date, ToDate::DATE AS to_date, coalesce(trim(MivzaTypeNm), 'ללא מנגנון') AS mechanic, Cmt AS quantity, Scm AS deal_price, K_AczDis AS discount_pct, K_ScmDis AS discount_ils, MinCmt AS min_qty FROM read_parquet('{{ROOT}}/Mivza.parquet') WHERE C IS NOT NULL ORDER BY to_date DESC NULLS LAST, promo_id DESC LIMIT 200`,
  bar: `SELECT coalesce(trim(MivzaTypeNm), 'ללא מנגנון') AS name, count(*) AS value FROM read_parquet('{{ROOT}}/Mivza.parquet') GROUP BY 1 ORDER BY value DESC LIMIT 12`,
  kpi: `SELECT count(*) AS total_promotions, count(*) FILTER (WHERE FromDate::DATE <= current_date AND ToDate::DATE >= current_date) AS active_today, min(FromDate::DATE) AS first_from, max(ToDate::DATE) AS last_to FROM read_parquet('{{ROOT}}/Mivza.parquet')`,
  profitGrowth: `WITH promos AS (${PERF_VIEW}) SELECT round(sum(item_profit_change_ils) FILTER (WHERE is_active)) AS profit_growth_vs_base_ils FROM promos`,
  suppliers: `WITH cost AS (SELECT ItemID, StoreID, arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE FinalRegularCostPrice > 0) AS unit_cost FROM read_parquet('{{ROOT}}/DailyPriceCost.parquet') GROUP BY 1, 2), fx AS (SELECT p.Spk AS spk, l.PrtC AS prt, p.DepartmentC AS dept_c, l.Scm - l.VatAmount AS net, c.unit_cost, c.unit_cost*l.Cmt AS cogs FROM read_parquet('{{ROOT}}/KupaDoc_Lines.parquet') l JOIN read_parquet('{{ROOT}}/KupaDoc_Header.parquet') h ON l.KupaDocC = h.C AND h.DateDoc >= DATE '2024-01-01' JOIN read_parquet('{{ROOT}}/Prt.parquet') p ON p.C = l.PrtC LEFT JOIN cost c ON c.ItemID = l.PrtC AND c.StoreID = h.StoreC) SELECT trim(sup.Nm) AS supplier, round(sum(fx.net)) AS net, round(100.0*sum(fx.net)/sum(sum(fx.net)) OVER (), 2) AS pct_of_total_net, round(100.0*sum(fx.net - fx.cogs) FILTER (WHERE fx.unit_cost IS NOT NULL) / nullif(sum(fx.net) FILTER (WHERE fx.unit_cost IS NOT NULL), 0), 1) AS margin_pct, count(DISTINCT fx.prt) AS items, count(DISTINCT fx.dept_c) AS depts FROM fx JOIN read_parquet('{{ROOT}}/Suppliers.parquet') sup ON sup.C = fx.spk GROUP BY 1 ORDER BY net DESC LIMIT 25`
}
const plans = [
  [/גידול.*רווח|רווח.*(מול|לעומת).*בסיס|profit.*base|profit.*baseline/i, { kind: 'kpi', title: 'גידול רווח מול בסיס', sql: planSql.profitGrowth, columns: [{ key: 'profit_growth_vs_base_ils', label: 'גידול רווח מול בסיס', format: '₪' }] }],
  [/גרף|מנגנון|סוג/, { kind: 'bar', title: 'מבצעים לפי מנגנון', sql: planSql.bar }],
  [/kpi|KPI|כמות|כמה/, { kind: 'kpi', title: 'כמות מבצעים', sql: planSql.kpi }],
  [/ספק|ספקים|רכש/, { kind: 'table', title: 'טבלת ספקים', sql: planSql.suppliers, columns: [
    { key: 'supplier', label: 'ספק' }, { key: 'net', label: 'נטו', format: '₪' }, { key: 'pct_of_total_net', label: 'נתח', format: '%' }, { key: 'margin_pct', label: 'מרווח', format: '%' }, { key: 'items', label: 'פריטים', format: 'int' }, { key: 'depts', label: 'מחלקות', format: 'int' }] }],
  [/מבצע/, { kind: 'table', title: 'כל המבצעים הקיימים', sql: planSql.table, columns: [
    { key: 'promo_id', label: 'קוד', format: 'int' }, { key: 'promo_name', label: 'מבצע' }, { key: 'from_date', label: 'מתאריך' }, { key: 'to_date', label: 'עד תאריך' }, { key: 'mechanic', label: 'מנגנון' }, { key: 'quantity', label: 'כמות' }, { key: 'deal_price', label: 'מחיר', format: '₪' }, { key: 'discount_pct', label: 'הנחה %', format: '%' }] }]
]
const deterministicPlan = s => plans.find(([re]) => re.test(String(s)))?.[1]
const editDocs = async ctx => (await Promise.all(['dashboardsEditAgent', 'comaxDashboardDataStructure', 'dashboardReactCompMicroEdits', 'duckDbSqlDataComponent', 'runReportDataComponent', 'queryReportFullDataDataComponent'].map(id => jb.workflowUtils.docletContent(id, ctx)))).filter(Boolean).join('\n\n')
const llmPlan = async (ctx, instruction) => {
  const prompt = [`USER_EDIT: ${instruction}`, `CURRENT_REPORT_ID: ${ctx.vars.currentReportId || 'promotions'}`, `CURRENT_DASHBOARD: ${JSON.stringify(ctx.vars.currentDashboard || {})}`, `REPORT_CATALOG: ${JSON.stringify(catalog(reportsOf(ctx)))}`, 'Return raw JSON object only, no XML/tags, markdown, or prose: {"kind":"table|bar|kpi","title":"...","sql":"SELECT ... LIMIT ...","columns":[{"key":"...","label":"...","format":"int|₪|%"}]}'].join('\n\n')
  const { responseText } = await fetchItemsFromLLMReactiveP({ ctx, model: ctx.vars.flowModel || MODEL, goal: 'plan dashboard edit', prompt, instructions: ctx.vars.dashboardEditDoclets || await editDocs(ctx), maxTokens: 5000 })
  return json(responseText)
}
const planDashboardEdit = async (ctx, instruction = ctx.vars.userMessage) => {
  const p = deterministicPlan(instruction) || await llmPlan(ctx, instruction)
  return { action: 'appendWidget', id: `ai.${Date.now().toString(36)}`, reportId: ctx.vars.currentReportId || 'promotions', ...p, title: p.title || 'תוספת לדשבורד' }
}
const runDashboardEditSql = async (ctx, plan) => {
  const sql = sqlRoot(plan.sql, ctx), res = await ctx.setVars({ db: ctx.vars.db || 'local' }).run(data.duckDbSql(() => sql)), rows = rowsOf(res)
  return { ...plan, sql, rows, rowsCount: rows.length, ...(res?.error && { error: res.error }) }
}
const validEditRows = ctx => !ctx.vars.dashboardEditRows?.error && typeof ctx.vars.dashboardEditRows?.sql == 'string' && ctx.vars.dashboardEditRows?.rowsCount >= 0
const validDraft = ctx => !ctx.data?.error && ctx.data?.draftUrl && ctx.data?.widget && ctx.data?.rowsCount >= 0
const columnsOf = rows => Object.keys(rowsOf(rows)[0] || {}).map(key => ({ key, label: key }))
const colsOf = xs => arr(xs).flatMap(c => Array.isArray(c) ? c : c && typeof c == 'object' && !c.key ? Object.values(c) : c).map(c => typeof c == 'string' ? { key: c, label: c } : c).filter(c => c?.key && !/JBREFERENCE/i.test(c.key))
const kpiItems = p => { const cols = colsOf(p.items || p.columns); return (cols.length ? cols : columnsOf(p.rows)).map(c => ({ label: c.label || c.key, value: rowsOf(p.rows)[0]?.[c.key], format: c.format })) }
const widgetFromPlan = p => p.kind == 'bar' ? { id: p.id, kind: 'bar', title: p.title, data: rowsOf(p.rows).map(r => ({ name: r.name, value: +r.value || 0 })), valueFormat: 'int', sql: p.sql }
  : p.kind == 'kpi' ? { id: p.id, kind: 'kpi', title: p.title, items: kpiItems(p), sql: p.sql }
  : { id: p.id, kind: 'table', title: p.title, columns: colsOf(p.columns).length ? colsOf(p.columns) : columnsOf(p.rows), rows: rowsOf(p.rows), collapsedRows: 8, sql: p.sql }
const appendWidget = (dashboard, widget) => ({ ...(dashboard || {}), widgets: [...arr(dashboard?.widgets).filter(w => w.id != widget.id), widget] })
const canvasEdit = widgets => `${mark('dashboards.reportCanvas', 'start')}
ReactComp('dashboards.reportCanvas', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh } }) => ({ dashboard = {}, send, openDetails, openWidget, onWidget }) => {
      const generated = ${JSON.stringify(widgets)}, panels = arr(dashboard.reactComps), ids = new Set(arr(dashboard.widgets).map(w => w.id)), widgets = [...arr(dashboard.widgets), ...generated.filter(w => !ids.has(w.id))]
      return h('div:space-y-4', { dir: 'rtl' }, panels.length || widgets.length ? [
        panels.length && h('div:grid grid-cols-1 gap-4', {}, panels.map(s => h('div:min-w-0', { key: s.id }, hh(ctx, dsls.react['react-comp']['dashboards.reportPanel'], { spec: s, send, openDetails, onWidget })))),
        widgets.length && h('div:grid grid-cols-1 xl:grid-cols-2 gap-4', {}, widgets.map(s => h('div:min-w-0', { key: s.id }, hh(ctx, dsls.react['react-comp']['dashboards.vizWidget'], { spec: s, openWidget, onWidget }))))
      ].filter(Boolean) : h('div:rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500', {}, 'בחרו דוח להצגה'))
    }
  })
})
${mark('dashboards.reportCanvas', 'end')}`

export const createDashboardDraft = async (ctx, { id = 'dashboards.reportCanvas', dashboardUrl = ctx.vars.dashboardUrl, planRows = ctx.vars.dashboardEditRows, workflowLogger, flowIndex } = {}) => {
  workflowLogger?.status?.('יוצר טיוטת דשבורד...')
  const widget = widgetFromPlan(planRows), draftDashboard = appendWidget(ctx.vars.currentDashboard, widget), editedCode = canvasEdit([widget])
  dashboardUrl = String(dashboardUrl).includes('%$dashboardUrl%') ? ctx.vars.dashboardUrl : dashboardUrl
  const code = await readJs(dashboardUrl, ctx), baseCode = dashboardWidgetBlock(code, id) ? code : jb.dashboardUtils?.defaultDashboardJs || code, nextCode = replaceDashboardWidgetBlock(baseCode, id, editedCode), draftUrl = draftUrlOf(dashboardUrl)
  const put = await wfetch2(draftUrl, { method: 'PUT', body: nextCode }, ctx)
  const res = put?.ok ? { text: `יצרתי טיוטה עם "${widget.title}". אפשר לשמור או לבטל.`, id, dashboardUrl, draftUrl, editedCode, code: nextCode, draftDashboard, widget, sql: planRows.sql, rowsCount: planRows.rowsCount, reportId: planRows.reportId }
    : { error: `failed saving dashboard draft: ${put?.status || ''} ${put?.statusText || ''}`.trim(), id, dashboardUrl }
  if (!res.error) await wfetch2(manifestUrl(ctx.vars.roomUrl), { method: 'PUT', body: { title: 'Dashboards draft', dashboardUrl, draftUrl, widgetId: widget.id, updatedAt: Date.now() } }, ctx)
  workflowLogger?.workflowTrace?.push({ flowIndex, output: { ...res, code: undefined, editedCode: res.editedCode?.slice(0, 500) } })
  return res
}

Data('dashboardEditPlan', { params: [{ id: 'instruction', as: 'text', dynamic: true, defaultValue: '%$userMessage%' }], impl: (ctx, {}, { instruction }) => planDashboardEdit(ctx, instruction(ctx)) })
Data('dashboardEditSqlRows', { params: [{ id: 'plan' }], impl: (ctx, {}, { plan }) => runDashboardEditSql(ctx, plan || ctx.vars.dashboardEditPlan) })
Data('dashboardEditDoclets', { impl: editDocs })

FlowElem('editDashboardWIdget', {
  params: [{ id: 'goal', as: 'string' }, { id: 'id', as: 'string', mandatory: true }, { id: 'dashboardUrl', as: 'string', mandatory: true }],
  impl: async (ctx, { flowIndex, workflowLogger }, { id, dashboardUrl }) => {
    return ctx.setData(await createDashboardDraft(ctx, { id, dashboardUrl, workflowLogger, flowIndex }))
  }
})

const dashboardsEditFlow = flowWorkflow({
  flow: flow({ elems: [
      setCtxVar({ goal: 'Load report catalog', varName: 'reportsRegistry', value: ctx => ctx.vars.reportsRegistry || reportsOf(ctx) }),
      setCtxVar({ goal: 'Load dashboard-edit doclets', varName: 'dashboardEditDoclets', value: ctx => editDocs(ctx) }),
      until({ goal: 'Plan and validate a dashboard edit with DuckDB', maxRuns: 2,
        body: flow({ elems: [
          setCtxVar({ goal: 'Plan dashboard edit', status: 'מתכנן שינוי...', varName: 'dashboardEditPlan', value: ctx => planDashboardEdit(ctx, ctx.vars.userMessage || '') }),
          setCtxVar({ goal: 'Run dashboard edit SQL', status: 'בודק שאילתה מול מסד הנתונים...', varName: 'dashboardEditRows', value: ctx => runDashboardEditSql(ctx, ctx.vars.dashboardEditPlan) })
        ] }),
        verifier: validEditRows }),
      dsls.workflow['flow-elem'].editDashboardWIdget({ id: 'dashboards.reportCanvas', dashboardUrl: '%$dashboardUrl%' }),
      replan({ goal: 'Verify dashboard draft was saved and is renderable', task: '%$userMessage%', verifier: validDraft, maxRuns: 1, model: '%$model%', instructions: '%$dashboardEditDoclets%' })
    ] })
})

Workflow('dashboards-edit', {
  params: [{ id: 'model', as: 'string', defaultValue: MODEL }],
  impl: ({}, {}, { model }) => ({ async calcWorkflow(ctx0) {
    const start = Date.now(), ctx = ctx0.setVars({ model, flowModel: model, categories: { ...(ctx0.vars.categories || {}), dashboards: true, local: true } })
    const result = await ctx.run(dashboardsEditFlow).calcWorkflow(ctx), { userMessage, userId, roomId = 'comaxDemo' } = ctx.vars
    const bigLogRes = await writeBigLog({ roomId, fileName: `wf-dashboards-edit-${Date.now()}`, payload: result, metadata: { userMessage, workflowName: 'dashboards-edit', userId, duration: Date.now() - start, roomId }, ctx })
    return { ...result, bigLogRes, ...(bigLogRes?.adminUrl ? { adminUrl: bigLogRes.adminUrl } : { bigLogError: bigLogRes?.error }) }
  } })
})

Doclet('dashboardsEditAgent', { impl: `Dashboards edit agent. It receives userMessage, currentDashboard, currentReportId, reportsRegistry, reportsRoot, dashboardUrl and roomUrl. It plans a small dashboard edit with raw JSON-object planner output only, validates the SQL with duckDbSql against signedRoom://comaxDemo/usersRO/parquet/OEM_BI_4466, edits only one marked ReactComp block by id through editDashboardWIdget, and saves the result to a -draft.js file. The UI previews the draft; only the user's save action replaces dashboardUrl.` })
Doclet('comaxDashboardDataStructure', { impl: `Comax parquet root: signedRoom://comaxDemo/usersRO/parquet/OEM_BI_4466. Promotion master is Mivza.parquet with C, Nm, FromDate, ToDate, MivzaTypeNm, Cmt, Scm, K_AczDis, K_ScmDis, MinCmt. KupaDoc_Lines.MivzaNo joins Mivza.C. Mivza_Prt is only the promo-item bridge: MivzaC and PrtC. For raw promotion list widgets, query Mivza.parquet directly; for validated BI report slices, use runReport/queryReportFullData over the Reports catalog.` })
Doclet('dashboardReactCompMicroEdits', { impl: `Dashboard JS files are self-contained modules with marked blocks: // dashboard-widget:start <id> ... // dashboard-widget:end <id>. editDashboardWIdget must return/edit only the marked ReactComp block for the passed id, never a whole dashboard module. For appended widgets, edit dashboards.reportCanvas and append generated VizWidget specs to dashboard.widgets. The draft file keeps code, widget spec and SQL together so the preview works without separate state.` })

Data('replaceDashboardWidgetBlock', { params: [{ id: 'code', as: 'text' }, { id: 'widgetId', as: 'string' }, { id: 'edited', as: 'text' }], impl: (ctx, {}, { code, widgetId, edited }) => replaceDashboardWidgetBlock(code, widgetId, edited) })
Object.assign(jb.workflowUtils, { dashboardWidgetBlock, normalizeDashboardWidgetEdit, replaceDashboardWidgetBlock, draftUrlOf, planDashboardEdit, runDashboardEditSql, createDashboardDraft })
