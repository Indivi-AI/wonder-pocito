import { dsls, jb } from '@jb6/core'
import '@jb6/react'
import '@wonder/db/db-drivers.js'
import '@wonder/ui/viz/viz-index.js'
import { comaxLogo, comaxFontCss } from './comax-brand.js'

const { wfetch2 } = jb.wonderUtils
const { react: { ReactComp, 'react-comp': { comp } } } = dsls

const clone = v => v == null ? v : JSON.parse(JSON.stringify(v))
const strip = s => String(s || '').replace(/[#*_`>]/g, '').trim()
const firstLine = (...xs) => strip(xs.find(x => strip(x)) || '').split('\n').map(strip).find(Boolean) || ''
const id = () => `comax-report-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
const answerObj = a => ({ ...(a?.runRes && typeof a.runRes == 'object' && !Array.isArray(a.runRes) ? a.runRes : {}), ...(a || {}) })
const reportBaseUrl = roomUrl => {
  const u = (roomUrl || 'signedRoom://comaxDemo/usersRW').replace(/\/$/, '')
  return u.startsWith('signedRoom://') && u.split('/').length == 3 ? `${u}/usersRW` : u
}
const mcpPost = async (method, params, ctx) => {
  const serviceBase = ctx?.vars?.wonderServiceBase || globalThis.location?.origin || 'http://localhost:3000'
  const res = await fetch(`${serviceBase}/mcp`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  })
  return (await res.json())?.result
}
const mcpText = r => r?.content?.map(c => c.text || '').join('\n') || (typeof r == 'string' ? r : JSON.stringify(r || {}))
const callToolJson = async (ctx, name, args) => JSON.parse(mcpText(await mcpPost('tools/call', { name, arguments: args }, ctx)) || '{}')
const withParams = (url, params) => {
  const u = new URL(url)
  Object.entries(params).forEach(([k, v]) => v != null && u.searchParams.set(k, v))
  return u.toString()
}
const colsOf = rows => rows[0] ? Object.keys(rows[0]).map(key => ({ key, label: key })) : []
const val = v => v == null ? '' : typeof v == 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(v)

export const comaxReportFromAnswer = (answer, { rowLimit = 200 } = {}) => {
  const a = answerObj(answer), rows = Array.isArray(a.rows) ? a.rows : [], text = a.text || a.content || ''
  const title = firstLine(a.title, a.question, String(text).match(/^#\s*(.+)$/m)?.[1], a.narrative, text) || 'דוח אנליטיקה'
  return clone({ id: id(), title, takeaway: firstLine(a.takeaway, a.narrative, text, title), text, narrative: a.narrative || '',
    parts: Array.isArray(a.parts) ? a.parts : [], partsLayout: a.partsLayout, widgets: Array.isArray(a.widgets) ? a.widgets : [], reactComps: Array.isArray(a.reactComps) ? a.reactComps : [],
    rows: rows.slice(0, rowLimit), rowCount: rows.length, rowLimit, sql: a.sql || '',
    followUps: Array.isArray(a.followUps) ? a.followUps : [], createdAt: new Date().toISOString() })
}

export const comaxReportAssistantMessage = ({ url, report }) => ({
  id: `${report.id}-msg`, time: Date.now(), sender: 'Assistant', type: 'text', reportUrl: url,
  content: `הדוח מוכן: ${url}`, text: `הדוח מוכן: ${url}`
})

const roomIdOf = roomUrl => reportBaseUrl(roomUrl).replace(/^\w+:\/\//, '').split('/')[0]

// Reports are a single stable room applet (comaxAnalyticsReport); each report is the same applet URL with its own ?ctx-reportUrl=.
export async function createComaxAnalyticsReport(ctx, answer, { roomUrl = ctx.vars.roomUrl, preferLocal = false, rowLimit } = {}) {
  const report = comaxReportFromAnswer(answer, { rowLimit }), baseUrl = reportBaseUrl(roomUrl), reportUrl = `${baseUrl}/reports/${report.id}.json`
  const put = await wfetch2(reportUrl, { method: 'PUT', body: report }, ctx)
  if (!put?.ok) throw new Error(`report payload upload failed: ${put?.status || ''} ${put?.statusText || ''}`.trim())
  const uploaded = await callToolJson(ctx, 'uploadRoomApplet', {
    roomId: roomIdOf(roomUrl), entryPath: '@wonder-admin/comax/demo/Comps/report-index.js', entryCompFullId: 'react-comp<react>comaxAnalyticsReport'
  })
  if (uploaded.error) throw new Error(uploaded.error.stack || uploaded.error)
  const base = preferLocal ? uploaded.entryUrl.replace(/^https:\/\/staging\.indivi\.ai/, 'http://localhost:3000') : uploaded.entryUrl
  const url = withParams(base, { 'ctx-reportUrl': reportUrl })
  return { ...uploaded, report, reportUrl, url, assistantMessage: comaxReportAssistantMessage({ url, report }) }
}

ReactComp('comaxAnalyticsReport', {
  impl: comp({
    hFunc: (ctx, { report = {}, reportError, react: { h, hh } }) => () => {
      const rows = Array.isArray(report.rows) ? report.rows : [], widgets = Array.isArray(report.widgets) ? report.widgets : [], reactComps = Array.isArray(report.reactComps) ? report.reactComps : [], parts = Array.isArray(report.parts) ? report.parts : [], cols = colsOf(rows)
      const VizWidget = dsls.react['react-comp'].VizWidget
      const renderReactComp = (spec, i) => {
        const Cmp = spec?.cmpId && dsls.react['react-comp'][spec.cmpId]
        return Cmp && h('div:min-w-0 overflow-hidden', { key: i }, hh(ctx, Cmp, { spec }))
      }
      if (reportError) return h('pre:p-4 text-red-600 whitespace-pre-wrap', {}, reportError)
      return h('main:comax-brand min-h-screen bg-[#f8fafc] text-slate-900 overflow-x-hidden', {},
        h('style', {}, comaxFontCss),
        h('section:max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-10', {},
          h('div:flex flex-col gap-2 border-b-2 border-[#61A60E] pb-5 mb-6', {},
            h('img:h-7 w-auto self-start', { src: comaxLogo, alt: 'COMAX' }),
            h('h1:text-2xl sm:text-4xl font-bold leading-tight text-[#454343]', {}, report.title || 'דוח אנליטיקה'),
            report.takeaway && h('p:text-base sm:text-lg text-slate-600 max-w-3xl', {}, report.takeaway)),
          report.narrative && h('p:text-sm sm:text-base leading-7 text-slate-700 max-w-4xl whitespace-pre-wrap', {}, report.narrative),
          report.text && h('div:my-5 text-base leading-7 text-slate-800 whitespace-pre-wrap max-w-4xl', {}, report.text),
          report.partsLayout == 'collapsedSections' && parts.length > 0 && h('section:my-6 space-y-2 max-w-4xl', {}, parts.map((p, i) =>
            h('details:bg-white border border-slate-200 rounded-lg px-4 py-3', { key: i },
              h('summary:cursor-pointer text-sm font-semibold text-slate-900', {}, p.title || `Section ${i + 1}`),
              h('div:mt-2 text-sm leading-7 text-slate-700 whitespace-pre-wrap', {}, p.text || p.short || '')))),
          reactComps.length > 0 && h('div:my-7 space-y-4', {}, reactComps.map(renderReactComp).filter(Boolean)),
          !reactComps.length && widgets.length > 0 && h('div:grid grid-cols-1 lg:grid-cols-2 gap-4 my-7', {}, widgets.map((spec, i) =>
            h('div:min-w-0 overflow-hidden bg-white border border-slate-200 rounded-lg p-2', { key: i },
              hh(ctx, VizWidget, { spec: { width: 540, height: 320, ...spec } })))),
          rows.length > 0 && h('section:my-7', {},
            h('div:flex items-end justify-between gap-3 mb-2', {},
              h('h2:text-lg font-semibold', {}, 'שורות'),
              h('div:text-xs text-slate-500', {}, `${rows.length}${report.rowCount > rows.length ? ` מתוך ${report.rowCount}` : ''}`)),
            h('div:overflow-hidden bg-white border border-slate-200 rounded-lg', {},
              h('table:w-full table-fixed text-sm', {},
                h('thead:bg-slate-50', {}, h('tr', {}, cols.map(c => h('th:px-3 py-2 text-left font-medium text-slate-600 break-words align-top', { key: c.key }, c.label)))),
                h('tbody:divide-y divide-slate-100', {}, rows.map((r, i) => h('tr', { key: i }, cols.map(c =>
                  h('td:px-3 py-2 break-words align-top text-slate-700', { key: c.key }, val(r[c.key]))))))))),
          (report.sql || report.createdAt) && h('details:mt-6 bg-white border border-slate-200 rounded-lg p-4', {},
            h('summary:text-sm font-medium cursor-pointer', {}, 'שאילתה ואמינות'),
            h('div:mt-3 text-xs text-slate-500', {}, `נוצר ${report.createdAt || ''}. שורות בתשובה: ${report.rowCount ?? rows.length}.`),
            report.sql && h('pre:mt-3 text-xs bg-slate-950 text-slate-100 rounded p-3 overflow-hidden whitespace-pre-wrap break-words', {}, report.sql))))
    },
    enrichCtx: ctx => {
      const url = ctx.vars.reportUrl
      if (!url) return ctx.vars.report ? ctx : ctx.setVars({ reportError: 'missing ctx-reportUrl' })
      return wfetch2(url, { method: 'GET' }, ctx).then(async res =>
        ctx.setVars(res?.ok ? { report: await res.json() } : { reportError: `failed to load ${url}: ${res?.status}` }))
    },
    sampleCtxData: () => ({ vars: { report: { title: 'דוח לדוגמה', takeaway: 'תקציר לדוגמה', rows: [{ metric: 'שורות תשובה', value: 1 }], createdAt: new Date().toISOString() } } })
  })
})

ReactComp('AnalyticsReportButton', {
  impl: comp({
    hFunc: (ctx, { react: { h, useState } }) => ({ answer, onReport, roomUrl }) => {
      const [state, setState] = useState({})
      const produce = async () => {
        setState({ busy: true })
        try {
          const res = await createComaxAnalyticsReport(ctx, answer, { roomUrl, preferLocal: globalThis.location?.hostname == 'localhost' })
          onReport?.(res.assistantMessage, res)
          setState({ url: res.url })
        } catch (error) {
          setState({ error: error.message })
        }
      }
      return h('div:flex items-center gap-2 flex-wrap', {},
        h('button:px-3 py-1.5 text-sm rounded-full border border-[#61A60E]/40 bg-white text-[#4a7f0b] hover:bg-[#61A60E]/10 disabled:opacity-50 inline-flex items-center gap-1.5',
          { disabled: state.busy || !answer, onClick: produce }, h('L:FileText', { size: 14 }), state.busy ? 'מפיק דוח...' : 'הפק דוח'),
        state.url && h('a:text-xs text-blue-600 underline', { href: state.url, target: '_blank', rel: 'noopener' }, 'פתח דוח'),
        state.error && h('span:text-xs text-red-600', {}, state.error))
    }
  })
})
