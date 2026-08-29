import { dsls, jb, coreUtils } from '@jb6/core'
import '@jb6/common'
import '@jb6/react'
import '@wonder/ui/applet.js'
import '@wonder/ai/report-step.js'
import '../Reports/comax-reports.js'
import '../Reports/index.js'
import '@wonder/ui/viz/viz-index.js'
import '../Agents/dashboards-edit-agent.js'
import '@wonder/db/db-drivers.js'
const { wfetch2, wresolve } = jb.wonderUtils
import { comaxDrillQuestion } from '../Comps/drill-helpers.js'
import { comaxLogo, comaxFontCss } from '../Comps/comax-brand.js'

const {
  react: {
    ReactComp,
    'react-comp': { comp },
    'react-metadata': { applet },
  },
  common: {
    data: { runReport, verifiedReportsRegistry },
  },
} = dsls
const MODEL = 'openai/gpt-5.5',
  DEFAULT_ROOM = 'signedRoom://comaxDemo',
  REPORTS_ROOT = 'signedRoom://comaxDemo/usersRO/parquet/OEM_BI_4466',
  DASHBOARD_FILE = 'dashboards/dashboards.react.js',
  DEFAULT_REPORT_ID = 'promotions'
const arr = (v) => (Array.isArray(v) ? v : v == null ? [] : [v])
const rank = (id) => (id == 'promotions' ? 0 : id == 'promo-recommendations' ? 1 : 2)
const uniqById = (xs) => [
  ...new Map(
    arr(xs)
      .filter((r) => r?.id)
      .map((r) => [r.id, r]),
  ).values(),
]
export const sortDashboardReports = (reports) => uniqById(reports).sort((a, b) => rank(a.id) - rank(b.id) || String(a.title || a.id).localeCompare(String(b.title || b.id), 'he'))
const tag = (xs, kind) => arr(xs).map((x, i) => ({ ...x, id: x.id || `${kind}.${x.slot || i}` }))
export const dashboardFromReport = (res = {}, report = {}) => ({
  reportId: res.reportId || report.id,
  title: res.title || report.title,
  description: report.description,
  caveats: res.caveats || report.caveats,
  widgets: tag(res.widgets, 'widget'),
  reactComps: tag(res.reactComps, 'panel'),
  error: res.error,
})
const sectionsOf = (r) => arr(r.sections).map((s) => s.id)
const roomPath = (roomWUrl, path) => `${(roomWUrl || DEFAULT_ROOM).replace(/\/$/, '')}/${path}`
const io = (ctx) => ctx.setVars(ctx.vars.sqlLambda ? {} : { db: 'local' }) // dashboard files: localhost → files/rooms, cloud (sqlLambda set) → signed GCS
const readText = async (url, ctx) => {
  const r = await wfetch2(url, { method: 'GET' }, ctx)
  return r?.ok ? r.text() : ''
}
const bust = (url) => `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`
const importDashboardModule = async (url, ctx) => {
  try {
    const resolved = await wresolve(url, ctx)
    resolved && (await import(bust(resolved)))
  } catch {}
}
const importEditAgent = () => import(`../Agents/dashboards-edit-agent.js?v=${Date.now()}`).catch(() => null)
const flowEditResult = (res) =>
  arr(res?.workflowTrace)
    .map((e) => e.output)
    .filter((o) => o?.draftUrl || o?.error)
    .at(-1) ||
  res?.runRes ||
  res?.data ||
  res
const traceEditRows = (res) =>
  arr(res?.workflowTrace)
    .map((e) => e.setVars?.dashboardEditRows)
    .filter((r) => r && !r.error && typeof r.sql == 'string' && r.rowsCount >= 0)
    .at(-1)

const DASHBOARD_WIDGET_BODY = `
const { react: { ReactComp, 'react-comp': { comp } } } = dsls
const arr = v => Array.isArray(v) ? v : v == null ? [] : [v]
const clean = s => { const { id, slot, cmpId, ...rest } = s || {}; return rest }
// dashboard-widget:start dashboards.reportPanel
ReactComp('dashboards.reportPanel', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh } }) => ({ spec = {}, send, openDetails, onWidget }) => {
      const Cmp = spec.cmpId && dsls.react['react-comp'][spec.cmpId]
      return h('div:min-w-0 overflow-hidden', { onClick: () => onWidget?.(spec.id || 'dashboards.reportPanel') },
        Cmp ? hh(ctx, Cmp, { spec: clean(spec), send, openDetails })
          : h('div:rounded-lg border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500', {}, 'רכיב דוח לא נמצא'))
    }
  })
})
// dashboard-widget:end dashboards.reportPanel

// dashboard-widget:start dashboards.vizWidget
ReactComp('dashboards.vizWidget', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh } }) => ({ spec = {}, openWidget, onWidget }) => h(
      'section:rounded-lg border border-slate-200 bg-white p-3 shadow-sm min-w-0 overflow-hidden',
      { onClick: () => onWidget?.(spec.id || 'dashboards.vizWidget') },
      hh(ctx, dsls.react['react-comp'].VizWidget, { spec: { width: 560, height: 320, ...clean(spec) }, onEvent: e => openWidget?.(spec, e) }))
  })
})
// dashboard-widget:end dashboards.vizWidget

// dashboard-widget:start dashboards.reportCanvas
ReactComp('dashboards.reportCanvas', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh } }) => ({ dashboard = {}, send, openDetails, openWidget, onWidget }) => {
      const panels = arr(dashboard.reactComps), widgets = arr(dashboard.widgets)
      return h('div:space-y-4', { dir: 'rtl' }, panels.length || widgets.length ? [
        panels.length && h('div:grid grid-cols-1 gap-4', {}, panels.map(s =>
          h('div:min-w-0', { key: s.id }, hh(ctx, dsls.react['react-comp']['dashboards.reportPanel'], { spec: s, send, openDetails, onWidget })))),
        widgets.length && h('div:grid grid-cols-1 xl:grid-cols-2 gap-4', {}, widgets.map(s =>
          h('div:min-w-0', { key: s.id }, hh(ctx, dsls.react['react-comp']['dashboards.vizWidget'], { spec: s, openWidget, onWidget }))))
      ].filter(Boolean) : h('div:rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500', {}, 'בחרו דוח להצגה'))
    }
  })
})
// dashboard-widget:end dashboards.reportCanvas
`
export const defaultDashboardJs = `import { dsls } from '@jb6/core'\nimport '@jb6/react'\n${DASHBOARD_WIDGET_BODY}`
let registered
const registerDashboardComps = () => (registered ||= (new Function('dsls', DASHBOARD_WIDGET_BODY)(dsls), true))
const saveManifest = (ctx, roomWUrl, dashboardUrl) =>
  wfetch2(
    roomPath(roomWUrl, 'dashboards/dashboard'),
    { method: 'PUT', body: { title: 'Dashboards', dashboardUrl, widgets: ['dashboards.reportCanvas', 'dashboards.reportPanel', 'dashboards.vizWidget'], updatedAt: Date.now() } },
    ctx,
  )
const ensureDashboardModule = async (_ctx, roomWUrl) => {
  const ctx = io(_ctx),
    url = roomPath(roomWUrl, DASHBOARD_FILE),
    code = await readText(url, ctx)
  if (!code.includes('dashboard-widget:start')) (await wfetch2(url, { method: 'PUT', body: defaultDashboardJs,
    headers: {'content-type': 'application/javascript'} }, ctx), await saveManifest(ctx, roomWUrl, url))
  await importDashboardModule(url, ctx)
  return url
}
registerDashboardComps()
Object.assign((jb.dashboardUtils = jb.dashboardUtils || {}), { sortDashboardReports, dashboardFromReport, defaultDashboardJs })

const SAMPLE_DASHBOARD = {
  reportId: 'promotions',
  title: 'נתח ביצועי מבצעים',
  description: 'מדדי מבצעים, ציר זמן וכרטיסי דיל-דאון חיים.',
  reactComps: [
    {
      id: 'panel.kpis',
      slot: 'executiveSummary',
      cmpId: 'promotionReportPanel',
      mode: 'kpis',
      title: 'מדדי מבצעים פעילים',
      rows: [{ active_promos: 42, profitable_promos: 27, losing_promos: 9, sales_growth_ils: 318000, low_redemption_promos: 6 }],
      kpis: [
        { key: 'active_promos', label: 'מבצעים פעילים' },
        { key: 'profitable_promos', label: 'רווחיים', tone: 'good' },
        { key: 'losing_promos', label: 'מפסידים', tone: 'bad' },
        { key: 'sales_growth_ils', label: 'גידול מכירות', format: '₪', tone: 'good' },
        { key: 'low_redemption_promos', label: 'פדיון נמוך', tone: 'bad' },
      ],
    },
  ],
  widgets: [
    {
      id: 'widget.timeline',
      kind: 'line',
      title: 'מספר מבצעים פעילים',
      series: [
        {
          name: 'פעילים',
          points: [
            { x: '06-01', y: 32 },
            { x: '06-08', y: 35 },
            { x: '06-15', y: 42 },
          ],
        },
      ],
    },
  ],
}
const SAMPLE_REPORTS = [
  { id: 'promotions', title: 'נתח ביצועי מבצעים', description: 'מבצעים פעילים, רווחיות ומלאי.' },
  { id: 'promo-recommendations', title: 'המלץ על מבצעים', description: 'מנוע המלצות מבצעים.' },
  { id: 'sales-overview', title: 'תמונת מכירות כללית', description: 'פדיון, סניפים ומגמות.' },
]

ReactComp('Dashboards', {
  impl: comp({
    hFunc:
      (
        ctx,
        {
          reports = SAMPLE_REPORTS,
          reportsRoot = REPORTS_ROOT,
          roomWUrl = DEFAULT_ROOM,
          dashboardUrl,
          initialDashboard,
          react: { h, hh, hhStrongRefresh, useEffect, useRef, useState },
        },
      ) =>
      () => {
        const [reportId, setReportId] = useState(ctx.vars.reportId || DEFAULT_REPORT_ID),
          [dashboard, setDashboard] = useState(initialDashboard),
          [busy, setBusy] = useState(!initialDashboard),
          [pane, setPane] = useState('reports'),
          [details, setDetails] = useState(null),
          [selectedWidgetId, setSelectedWidgetId] = useState('dashboards.reportCanvas'),
          [draft, setDraft] = useState(''),
          [draftEdit, setDraftEdit] = useState(null),
          [msgs, setMsgs] = useState([
            {
              role: 'ai',
              text:
                'אפשר לבקש למשל: תוסיף טבלה של ספקים, תוסיף טבלה עם כל המבצעים הקיימים, ' +
                'או גרף לפי מנגנון מבצע.',
            },
          ]),
          [aiBusy, setAiBusy] = useState(false),
          [typedStatus, setTypedStatus] = useState(''),
          [refresh, setRefresh] = useState(0)
        const loadSeq = useRef(0)
        const Canvas = dsls.react['react-comp']['dashboards.reportCanvas'],
          VizWidget = dsls.react['react-comp'].VizWidget
        const openDetails = (d) => setDetails(d)
        const ask = (q) => (setPane('ai'), setDraft(q || ''))
        const openWidget = (spec, e = {}) =>
          setDetails({ title: e.name || spec.title || 'פירוט', question: (e.type == 'question' && e.question) || comaxDrillQuestion(spec, e) })
        const loadReport = async (id) => {
          const seq = ++loadSeq.current,
            report = reports.find((r) => r.id == id) || reports[0]
          setBusy(true)
          setDetails(null)
          setDraftEdit(null)
          await importDashboardModule(dashboardUrl, ctx)
          try {
            const res = await ctx
              .setVars({ reportsRegistry: reports, reportsRoot, ...(ctx.vars.sqlLambda ? {} : { db: 'local' }), duckdbMatRun: `dashboards_${Date.now()}` })
              .run(runReport({ reportId: report.id, scope: 'executiveSummary', sections: sectionsOf(report), sectionDepth: 'summary' }))
            seq == loadSeq.current && setDashboard(dashboardFromReport(res?.jbCtx ? res.data : res, report))
          } catch (e) {
            seq == loadSeq.current &&
              setDashboard({ reportId: report.id, title: report.title, description: report.description, error: String(e?.message || e), widgets: [], reactComps: [] })
          } finally {
            seq == loadSeq.current && setBusy(false)
          }
        }
        const cancelDraft = async () => {
          setDraftEdit(null)
          await importDashboardModule(dashboardUrl, ctx)
          initialDashboard ? setRefresh((x) => x + 1) : await loadReport(reportId)
        }
        const applyDraft = async () => {
          if (!draftEdit?.code) return
          await wfetch2(dashboardUrl, { method: 'PUT', body: draftEdit.code,
            headers: {'content-type': 'application/javascript'} }, io(ctx))
          await saveManifest(io(ctx), roomWUrl, dashboardUrl)
          await cancelDraft()
          setMsgs((xs) => [...xs, { role: 'ai', text: 'שמרתי את הטיוטה כדשבורד הפעיל.' }])
        }
        const sendAi = async () => {
          const text = draft.trim()
          if (!text || aiBusy) return
          setDraft('')
          setMsgs((xs) => [...xs, { role: 'user', text }])
          setAiBusy(true)
          const onProgress = (e) => e?.t && setTypedStatus(e.t)
          coreUtils.eventEmitter.on('progress', onProgress)
          try {
            const mod = await importEditAgent(),
              editCtx = ctx.setVars({
                userMessage: text,
                dashboardUrl,
                widgetId: selectedWidgetId,
                roomId: 'comaxDemo',
                roomWUrl,
                currentReportId: reportId,
                currentDashboard: dashboard,
                reportsRegistry: reports,
                reportsRoot,
                ...(ctx.vars.sqlLambda ? {} : { db: 'local' }),
                duckdbMatRun: `dashboards_ai_${Date.now()}`,
              })
            const res = await dsls.ai.workflow['dashboards-edit'].$run({ model: MODEL }).calcWorkflow(editCtx)
            const rows = traceEditRows(res)
            let edit = flowEditResult(res)
            if (rows && mod?.createDashboardDraft) edit = await mod.createDashboardDraft(editCtx, { id: selectedWidgetId, dashboardUrl, planRows: rows })
            setMsgs((xs) => [
              ...xs,
              {
                role: 'ai',
                text:
                  edit?.error || edit?.text ||
                  (edit?.draftUrl ? 'טיוטת שינוי מוכנה.' : 'לא הצלחתי ליצור טיוטה. נסה ניסוח ממוקד יותר.'),
                adminUrl: res?.adminUrl || edit?.adminUrl,
              },
            ])
            if (edit?.draftUrl) {
              setDraftEdit(edit)
              edit.draftDashboard && setDashboard(edit.draftDashboard)
              await importDashboardModule(edit.draftUrl, ctx)
            }
            setRefresh((x) => x + 1)
          } catch (e) {
            setMsgs((xs) => [...xs, { role: 'ai', text: String(e?.message || e) }])
          } finally {
            coreUtils.eventEmitter.off('progress', onProgress)
            setTypedStatus('')
            setAiBusy(false)
          }
        }
        useEffect(() => {
          if (!initialDashboard) loadReport(reportId)
        }, [reportId])
        return h(
          'div:comax-brand min-h-screen bg-[#F6F7F8] text-slate-900 overflow-x-hidden',
          { dir: 'rtl', lang: 'he' },
          h('style', {}, comaxFontCss),
          details &&
            h(
              'aside:fixed top-0 bottom-0 left-0 z-40 w-full sm:w-[34rem] bg-white border-r border-slate-200 shadow-xl flex flex-col',
              {},
              h(
                'div:flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100',
                {},
                h('div:min-w-0 font-bold truncate', {}, details.title || 'פירוט'),
                h('button:w-9 h-9 grid place-items-center rounded-md hover:bg-slate-100', { onClick: () => setDetails(null), 'aria-label': 'סגור' }, h('L:X', { size: 16 })),
              ),
              h(
                'div:flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-3',
                {},
                details.loading && h('div:text-sm text-slate-500', {}, 'טוען...'),
                details.error && h('div:text-sm text-red-600 whitespace-pre-wrap', {}, details.error),
                details.content,
                details.childSpec && hh(ctx, VizWidget, { spec: { width: 480, height: 300, ...details.childSpec } }),
                details.question &&
                  h(
                    'button:inline-flex items-center gap-2 rounded-md bg-[#61A60E] px-4 py-2 text-sm font-bold text-white',
                    { onClick: () => ask(details.question) },
                    h('L:MessageCircle', { size: 15 }),
                    'פתח בצ׳אט AI',
                  ),
              ),
            ),
          h(
            'div:flex flex-col lg:flex-row min-h-screen',
            {},
            h(
              'aside:lg:w-80 lg:shrink-0 bg-white border-b lg:border-b-0 lg:border-l border-slate-200 lg:sticky lg:top-0 lg:h-screen flex flex-col',
              {},
              h(
                'div:p-4 border-b border-slate-100 space-y-3',
                {},
                h('img:h-7 w-auto', { src: comaxLogo, alt: 'COMAX' }),
                h(
                  'button:w-full inline-flex items-center justify-center gap-2 rounded-md bg-[#61A60E] px-4 py-2.5 text-sm font-bold text-white',
                  { onClick: () => setPane('ai') },
                  h('L:Sparkles', { size: 16 }),
                  'שאל AI לערוך את הדשבורד',
                ),
              ),
              pane == 'reports'
                ? h(
                    'div:flex-1 min-h-0 overflow-auto p-3 space-y-2',
                    {},
                    reports.map((r) =>
                      h(
                        'button:w-full text-right rounded-md border px-3 py-2.5 transition-colors ' +
                          (r.id == reportId ? 'border-[#61A60E] bg-[#61A60E]/10 text-[#3d7d08]' : 'border-slate-200 bg-white hover:bg-slate-50'),
                        { key: r.id, onClick: () => setReportId(r.id) },
                        h('div:flex items-center gap-2 font-bold text-sm', {}, h('L:BarChart3', { size: 15, className: 'shrink-0' }), h('span:truncate', {}, r.title || r.id)),
                        h('div:text-xs text-slate-500 mt-1 line-clamp-2', {}, r.description || ''),
                      ),
                    ),
                  )
                : h(
                    'div:flex-1 min-h-0 flex flex-col p-3 gap-3',
                    {},
                    h(
                      'div:flex items-center justify-between',
                      {},
                      h('div:text-sm font-bold', {}, 'עורך דשבורד AI'),
                      h(
                        'button:w-8 h-8 grid place-items-center rounded-md hover:bg-slate-100',
                        { onClick: () => setPane('reports'), 'aria-label': 'חזרה לדוחות' },
                        h('L:List', { size: 16 }),
                      ),
                    ),
                    h('div:text-xs rounded-md bg-slate-50 border border-slate-200 p-2 break-all', {}, `ווידג׳ט נבחר: ${selectedWidgetId}`),
                    draftEdit &&
                      h(
                        'div:rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 space-y-2',
                        {},
                        h('div:font-bold', {}, 'טיוטת AI מוכנה לתצוגה'),
                        h('div:break-all', {}, draftEdit.draftUrl),
                        h(
                          'div:flex gap-2',
                          {},
                          h('button:flex-1 rounded-md bg-[#61A60E] px-3 py-1.5 font-bold text-white', { onClick: applyDraft }, 'שמור שינוי'),
                          h('button:flex-1 rounded-md border border-amber-300 bg-white px-3 py-1.5 font-bold', { onClick: cancelDraft }, 'בטל'),
                        ),
                      ),
                    h(
                      'div:flex-1 min-h-0 overflow-auto space-y-2',
                      {},
                      msgs.map((m, i) =>
                        h(
                          `div:rounded-md px-3 py-2 text-sm leading-6 ${m.role == 'user' ? 'bg-[#EBF4DE] text-slate-900' : 'bg-slate-50 text-slate-700'}`,
                          { key: i },
                          m.text,
                          m.adminUrl && h('div:mt-1', {}, h('a:text-xs font-bold text-[#3d7d08] underline', { href: m.adminUrl, target: '_blank', rel: 'noopener' }, 'biglog')),
                        ),
                      ),
                      aiBusy && h('div:text-xs text-slate-500', {}, typedStatus || 'מריץ llm-flow...'),
                    ),
                    h('textarea:min-h-28 resize-none rounded-md border border-slate-200 p-3 text-sm outline-none focus:border-[#61A60E]', {
                      value: draft,
                      placeholder: 'תוסיף טבלה של ספקים',
                      onInput: (e) => setDraft(e.target.value),
                      onKeyDown: (e) => e.key == 'Enter' && !e.shiftKey && (e.preventDefault(), sendAi()),
                    }),
                    h(
                      'button:inline-flex items-center justify-center gap-2 rounded-md bg-[#454343] px-4 py-2.5 text-sm font-bold text-white disabled:bg-slate-300',
                      { disabled: !draft.trim() || aiBusy, onClick: sendAi },
                      h('L:Send', { size: 15 }),
                      'שלח ל-AI',
                    ),
                  ),
            ),
            h(
              'main:flex-1 min-w-0 p-4 sm:p-6 overflow-x-hidden',
              {},
              h(
                'header:flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5',
                {},
                h(
                  'div:min-w-0',
                  {},
                  h('div:text-xs font-bold text-[#61A60E]', {}, 'Dashboards'),
                  h('h1:text-2xl sm:text-3xl font-black text-[#454343] truncate', {}, dashboard?.title || 'Dashboards'),
                  h('p:text-sm text-slate-500 mt-1 max-w-3xl', {}, dashboard?.description || 'BI dashboards over Comax data'),
                ),
                h(
                  'div:flex items-center gap-2 text-xs text-slate-500',
                  {},
                  busy && h('span:inline-flex items-center gap-1', {}, h('L:Loader2', { size: 14, className: 'animate-spin' }), 'מריץ דוח'),
                  dashboard?.caveats && h('span:rounded-full bg-white border border-slate-200 px-2 py-1 truncate max-w-xs', { title: dashboard.caveats }, dashboard.caveats),
                ),
              ),
              draftEdit &&
                h(
                  'div:mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900',
                  {},
                  'מציג טיוטת AI. שמירה תחליף את הדשבורד הפעיל.',
                ),
              dashboard?.error
                ? h('div:rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 whitespace-pre-wrap', {}, dashboard.error)
                : hhStrongRefresh(ctx.setVars({ dashboardRefresh: `${refresh}:${draftEdit?.draftUrl || ''}` }), Canvas, {
                    dashboard,
                    send: ask,
                    openDetails,
                    openWidget,
                    onWidget: setSelectedWidgetId,
                  }),
            ),
          ),
        )
      },
    enrichCtx: async (
      ctx,
      {
        roomWUrl = ctx.vars.roomWUrl || DEFAULT_ROOM,
        reportsRoot = ctx.vars.reportsRoot || REPORTS_ROOT,
        reports = ctx.vars.reports,
        initialDashboard = ctx.vars.initialDashboard,
      },
    ) => {
      registerDashboardComps()
      const preview = ctx.vars.skipDashboardRoom && !initialDashboard,
        catalog = sortDashboardReports(reports || (preview ? SAMPLE_REPORTS : verifiedReportsRegistry.$runWithCtx(ctx))),
        dashboardUrl = ctx.vars.dashboardUrl || (ctx.vars.skipDashboardRoom ? roomPath(roomWUrl, DASHBOARD_FILE) : await ensureDashboardModule(ctx, roomWUrl))
      return ctx.setVars({
        reports: catalog,
        roomWUrl,
        reportsRoot,
        dashboardUrl,
        initialDashboard: initialDashboard || (preview && SAMPLE_DASHBOARD),
        reportId: ctx.vars.reportId || DEFAULT_REPORT_ID,
      })
    },
    metadata: applet({ title: 'Dashboards', icon: 'LayoutDashboard', showMessageInput: false }),
    sampleCtxData: () => ({
      vars: {
        skipDashboardRoom: true,
        initialDashboard: SAMPLE_DASHBOARD,
        reports: SAMPLE_REPORTS,
        dashboardUrl: roomPath(DEFAULT_ROOM, DASHBOARD_FILE),
        roomWUrl: DEFAULT_ROOM,
        reportsRoot: REPORTS_ROOT,
      },
    }),
  }),
})
