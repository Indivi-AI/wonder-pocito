import { dsls, coreUtils, jb } from '@jb6/core'
import '@wonder/db/db-drivers-utils.js'
import '@wonder/ui/ui-utils.js'
const { createShortUrl, formatTimeWithRandom, shareHandler, wAppend, wGet, wPut } = jb.wonderUtils
<<<<<<< HEAD
import '@wonder/ui/applet.js'
import '@wonder/db/room-lambda-client.js'   // roomLambda db-driver-interceptor - routes the <roomWUrl>/lambda/<name> POSTs of the remote duckDbSql hook
import '../Agents/analytics-agent.js'   // registers the basicAnalytics workflow (run in-browser; its duckDbSql offloads duckdb to /run-bash)
import { PROMOTION_ACTION_QUESTION } from '../Agents/reports-template-agent.js'
import '../Agents/fast-report-agent.js'   // registers fast-report (quick report widgets + delayed LLM summary)
import '../Agents/agents-repo.js'   // Data('comaxAnalyticsAgents') — the selectable-agents repo
import '@wonder/bi/viz/viz-index.js'   // VizWidget + all inline chart widgets the assistant can emit
=======
import '@wonder/applets/applet.js'
import '@wonder/db/room-lambda-client.js'   // roomLambda db-driver-interceptor - routes the <roomWUrl>/lambda/<name> POSTs of the remote duckDbSql hook
import '../comax-v2-agent.js'
import '../Agents/agents-repo.js'   // Data('comaxAnalyticsAgents') — the selectable-agents repo
import '@wonder/ui/viz/viz-index.js'   // VizWidget + all inline chart widgets the assistant can emit
>>>>>>> origin/master
import './dashboards.js'
import { comaxDrillQuestion, comaxFixDrillSql } from '../Comps/drill-helpers.js'
import { runViaRoomLambda } from '@wonder/ai/duckdb-sql-step.js'
import { comaxLogo, comaxFontCss } from '../Comps/comax-brand.js'

const {
  react: { ReactComp,
    'react-comp': { comp },
    'react-metadata': { applet }
  },
  wonder: { 'content-type': cts },
} = dsls

const availableAgents = () => dsls.common.data.comaxAnalyticsAgents.$run()
const DEFAULT_WORKFLOW = 'comaxVerifiedReports'
// debug-mode model picker: label → the model id the workflow receives as its `model` param
const MODELS = [
  ['Gemini Flash 3.5', 'gemini/gemini-3.5-flash'],
  ['GPT-5.5', 'openai/gpt-5.5'],
  ['GPT-5.4', 'openai/gpt-5.4'],
  ['GPT-5.4 mini', 'openai/gpt-5.4-mini']
]
const HOME_REPORTS_ROOT = 'signedRoom://comaxDemo/usersRO/parquet/OEM_BI_4466'
// published applet (non-localhost): no local duckdb - reports read the signed room, sql executes via the comaxSql
// room lambda, and warmed report results come straight from the room cache (see report-step.js roomCacheRead)
const remoteVars = () => globalThis.location?.hostname == 'localhost' ? {} : {
  sqlLambda: 'comaxSql', reportsLambda: 'comaxRunReport',
  lambdaHost: 'https://comax-demo-server-365199207445.me-west1.run.app',   // dedicated 8-vCPU compute service - the demo's duckdb never contends with staging
  reportsRoot: HOME_REPORTS_ROOT, reportsCacheRoot: 'signedRoom://comaxDemo/usersRO/cache'
}
const localDb = ctx => ctx.vars.sqlLambda ? {} : { db: 'local' }
const chatUser = () => globalThis.localStorage && JSON.parse(localStorage.getItem('auth2') || '{}')?.sub   // no sub (anon / minted token) - skip chat persistence
const appRail = (h, active, go) => h(
  'aside:fixed top-0 right-0 bottom-0 z-50 hidden w-24 bg-white border-l border-gray-200 sm:flex flex-col items-center gap-2 py-3 shadow-sm', {},
  h('img:h-6 sm:h-7 w-auto mb-2', { src: comaxLogo, alt: 'COMAX' }),
  [['chat', 'MessageCircle', 'צ׳אט'], ['dashboards', 'LayoutDashboard', 'דשבורד']].map(([id, icon, label]) =>
    h('button:w-14 sm:w-16 h-14 sm:h-16 rounded-xl flex flex-col items-center justify-center gap-1 text-[10px] sm:text-[11px] font-bold transition-colors '
      + (active == id ? 'bg-[#61A60E] text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'),
      { key: id, onClick: () => go(id), title: label, 'aria-label': label }, h(`L:${icon}`, { size: 18 }), h('span:leading-3', {}, label))))
const chatHome = (h, composer, insights) => h('div:min-h-[calc(100vh-7rem)] flex items-center justify-center px-4 py-8', {},
  h('div:w-full max-w-3xl text-center', {},
    h('h1:text-2xl sm:text-4xl font-semibold text-[#454343] tracking-normal', {}, 'מה נרצה לגלות היום?'),
    h('div:mt-7 text-right', {}, composer),
    h('div:mt-7 text-right', {}, insights)))
const fmtHome = (v, f) => v == null || Number.isNaN(+v) ? '—'
  : f == '₪' ? `${(+v).toLocaleString('he-IL', { notation: 'compact', maximumFractionDigits: 1 })} ₪`
  : f == '%' ? `${(+v).toFixed(1)}%` : (+v).toLocaleString('he-IL', { maximumFractionDigits: 1 })
const fmtHomeMoney = v => Math.abs(+v) >= 1e6 ? `${fmtHome(+v/1e6)} מ׳ ₪`
  : Math.abs(+v) >= 1e3 ? `${fmtHome(+v/1e3)} אלף ₪` : `${fmtHome(v)} ₪`
export const salesHomeData = r => [fmtHome(r.current_sales, '₪'), `מול חודש קודם ${fmtHome(r.sales_change_pct, '%')}`,
  [['חודש קודם', fmtHome(r.previous_sales, '₪'), r.previous_sales], ['סל ממוצע', fmtHome(r.current_basket, '₪'), r.current_basket],
    ['קבלות', fmtHome(r.current_receipts), r.current_receipts]]]
export const promotionAlertData = (promotions = {}, recommendations = {}) => {
  const counts = {activePromos: +promotions.active_promos, losingPromos: +promotions.losing_promos,
    activeGrossLossIls: Math.abs(+promotions.losing_margin_ils), recommendedPromos: +recommendations.rerun_deals}
  return Object.values(counts).every(Number.isFinite) ? counts : null
}
const promotionHomeData = x => [`${fmtHome(x.losingPromos)} מבצעים מפסידים`,
  `${fmtHomeMoney(x.activeGrossLossIls)} הפסד גולמי · ${fmtHome(x.recommendedPromos)} מומלצים להפעלה`, [
  ['מבצעים פעילים', fmtHome(x.activePromos), x.activePromos],
  ['מבצעים מפסידים', fmtHome(x.losingPromos), x.losingPromos, x.activePromos, 'bad'],
  ['מומלצים להפעלה', fmtHome(x.recommendedPromos), x.recommendedPromos, x.activePromos, 'good']]]
const homeCards = [
  ['sales-overview', 'TrendingUp', 'מכירות חודש מלא אחרון', 'מכירות החודש ביחס לחודש שעבר', salesHomeData],
  ['promotions', 'BellRing', 'המלצות מבצעים', 'נתח ביצועי מבצעים והמלץ על פעולות', r => [fmtHome(r.losing_promos),
    'מבצעים מפסידים — טוען המלצות', [
      ['רווחיים', fmtHome(r.profitable_promos), r.profitable_promos, r.active_promos, 'good'],
      ['מפסידים', fmtHome(r.losing_promos), r.losing_promos, r.active_promos, 'bad'],
      ['פדיון נמוך', fmtHome(r.low_redemption_promos), r.low_redemption_promos, r.active_promos, 'warn']]]],
]
const HomeInsights = ReactComp('HomeInsights', {
  impl: comp({
    hFunc: (ctx, { react: { h, useEffect, useState } }) => ({ send, composer }) => {
      const [cards, setCards] = useState(null)
      const cls = t => t == 'bad' ? 'bg-red-500' : t == 'warn' ? 'bg-amber-500' : 'bg-[#61A60E]'
      useEffect(() => { let live = true
        const runCtx = ctx.setVars({ ...localDb(ctx), reportsRegistry: dsls.common.data.verifiedReportsRegistry.$runWithCtx(ctx),
          reportsRoot: ctx.vars.reportsRoot || HOME_REPORTS_ROOT, duckdbMatRun: `home_${Date.now()}` })
        const cardsRun = Promise.all(homeCards.map(async ([reportId, icon, title, q, pick]) => {
          const res = await dsls.common.data.runReport.$runWithCtx(runCtx,
            { reportId, scope: 'executiveSummary', sections: [], sectionDepth: 'summary' }).catch(e => ({ error: String(e?.message || e) }))
          const row = res?.results?.executiveSummary?.[0] || {}
          return { reportId, icon, title, q, row, data: res?.error ? null : pick(row) }
        }))
        const recommendationsRun = dsls.common.data.runReport.$runWithCtx(runCtx, {reportId: 'promo-recommendations',
          scope: 'executiveSummary', sections: [], sectionDepth: 'summary'}).catch(() => null)
        Promise.all([cardsRun, recommendationsRun]).then(([xs, recs]) => { if (!live) return
          const promotionCounts = promotionAlertData(xs.find(x => x.reportId == 'promotions')?.row, recs?.results?.executiveSummary?.[0])
          setCards(xs.map(card => card.reportId == 'promotions' && promotionCounts
            ? {...card, recommendation: true, data: promotionHomeData(promotionCounts)} : card))
        }); return () => { live = false }
      }, [])
      const insights = h('div:grid grid-cols-1 sm:grid-cols-2 gap-3', {},
          (cards || homeCards.map(([, icon, title, q]) => ({ icon, title, q }))).map(({ icon, title, q, data, recommendation }) =>
            h(`section:rounded-lg border p-3 shadow-sm min-w-0 ${recommendation
              ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200 bg-white'}`,
              {key: title}, h(`div:flex items-center justify-between gap-2 text-xs font-bold ${recommendation
                ? 'text-amber-800' : 'text-gray-500'}`, {}, title,
                h('span:relative shrink-0', {}, h(`L:${icon}`,
                  { size: 16, className: recommendation ? 'text-amber-600' : 'text-[#61A60E]' }),
                  recommendation && h('span:absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-amber-50'))),
              h(`div:mt-2 text-2xl font-black tabular-nums ${recommendation ? 'text-amber-950' : 'text-[#454343]'}`, {},
                data?.[0] || (cards ? 'לא נטען' : 'טוען...')),
              h('div:mt-1 text-xs text-gray-500 min-h-4', {},
                data?.[1] || (cards ? 'בדקו את חיבור הנתונים' : 'נתוני אמת מהדוחות המאומתים')),
              h('div:mt-3 space-y-2', {}, (data?.[2] || []).map(([l, t, n, max = n, tone]) =>
                h('div', { key: l }, h('div:flex justify-between gap-2 text-[11px] text-gray-500', {}, h('span:truncate', {}, l),
                  h('span:font-bold tabular-nums text-gray-700', {}, t)),
                h('div:mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden', {}, h(`div:h-full rounded-full ${cls(tone)}`,
                  { style: { width: `${Math.min(100, Math.max(8, Math.abs(+n || 0) / Math.max(Math.abs(+max || 1), 1) * 100))}%` } }))))),
              h(`button:mt-4 w-full rounded-lg px-3 py-2.5 text-sm font-bold transition-colors inline-flex items-center justify-center gap-2 ${recommendation
                ? 'bg-amber-100 text-amber-950 hover:bg-amber-200' : 'bg-[#454343] text-white hover:bg-[#61A60E]'}`,
                { onClick: () => send(q) }, h('L:Sparkles', { size: 15 }), q))))
      return composer ? chatHome(h, composer, insights) : insights
    }
  })
})

// Minimal markdown → react nodes (headings, bullet/numbered lists, **bold**, *italic*, `code`).
// Emphasized numbers/KPIs land inside <strong>. No dangerouslySetInnerHTML, no dependency.
const mdInline = (h, s) => String(s).split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).filter(Boolean).map((p, i) =>
  p.startsWith('**') ? h('strong:font-semibold text-gray-900', { key: i }, p.slice(2, -2))
    : p.startsWith('`') ? h('code:px-1 py-0.5 rounded bg-gray-100 text-[0.85em] font-mono', { key: i }, p.slice(1, -1))
    : p.startsWith('*') ? h('em', { key: i }, p.slice(1, -1)) : p)
const renderMarkdown = (h, md) => {
  const lines = String(md || '').replace(/\r/g, '').split('\n'), out = []
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i], head = ln.match(/^(#{1,4})\s+(.+)/)
    if (head) { const lv = head[1].length, sz = ['text-xl', 'text-lg', 'text-base', 'text-sm'][lv - 1]
      out.push(h(`h${lv}:${sz} font-semibold text-gray-900 mt-4 first:mt-0 mb-1`, { key: out.length }, mdInline(h, head[2]))); continue }
    const ordered = /^\s*\d+\.\s+/.test(ln), item = ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/
    if (ordered || item.test(ln)) { const items = []
      while (i < lines.length && item.test(lines[i]))
        items.push(h('li:leading-relaxed', { key: items.length }, mdInline(h, lines[i++].replace(/^\s*(?:\d+\.|[-*])\s+/, '')))); i--
      out.push(h(`${ordered ? 'ol:list-decimal' : 'ul:list-disc'}:pr-5 my-1 space-y-0.5 marker:text-gray-400`, { key: out.length }, items)); continue }
    if (ln.trim()) out.push(h('p:leading-relaxed my-1', { key: out.length }, mdInline(h, ln)))
  }
  return out
}

function renderMessageContent(element, ctx) {
  const { wonderMain, roomId, react: { h, hh } } = ctx.vars
  const content = element?.content || ''
  const type = element?.type || 'text'
  
  if (type === 'image' || (typeof content === 'string' && (/^data:image\//i.test(content) || /\.(png|jpe?g|gif|webp)(\\?.*)?$/i.test(content)))) {
    const url = element?.imageUrl || content
    const nodes = h('div', {},
      content && h('div', { style: { whiteSpace: 'pre-wrap', marginBottom: '8px' } }, content),
      h('a', { href: url, target: '_blank', rel: 'noopener' },
        h('img:max-w-80 rounded-lg', { src: url }))
    )
    return { nodes, hostContent: null }
  }
  
  if (type === 'reaction') {
    const nodes = h('div:text-2xl', {}, content)
    return { nodes, hostContent: null }
  }
  
  if (type === 'poll') {
    const nodes = h('div:mt-2', {},
      h('div:font-medium text-sm mb-2', {}, element.pollQuestion || content),
      ...(element.pollOptions || []).map((opt, i) =>
        h('div:bg-gray-100 rounded-full px-3 py-1.5 mb-1 text-sm flex items-center', { key: i },
          h('div:w-4 h-4 rounded-full border-2 border-gray-400 ml-2'),
          opt
        )
      )
    )
    return { nodes, hostContent: null }
  }
  
  let hostContent = null
  if (element.host && element.host.length > 0) {
    hostContent = h('div:mt-2', {},
      element.host.map((hostElement, i) => {
        if (hostElement.type === 'text') return h('p:text-xs text-gray-500', { key: i }, hostElement.content)
        if (hostElement.type === 'applet-link') return h('button:text-xs text-blue-500 underline p-1', {
          key: i,
          onClick: () => wonderMain?.setRoomApplet?.({ roomId, appletId: hostElement.applet })
        }, hostElement.text || hostElement.applet)
        return null
      }).filter(Boolean)
    )
  }
  
  // Handle text content (including whatsappMessage and default): render as markdown.
  const nodes = h('div:text-[15px] leading-relaxed break-words', {}, renderMarkdown(h, content))
  return { nodes, hostContent }
}

const partQuestion = p => typeof p?.drill == 'string' ? p.drill : p?.drill?.question
// drill side plots run their {name:q}-filled SQL through the same in-browser duckDbSql the flow uses (offloaded to /run-bash)
const drillSqlRunner = ctx => async sql => {
  const res = await dsls.common.data.duckDbSql.$runWithCtx(ctx.setVars(localDb(ctx)), comaxFixDrillSql(sql))
  const rows = typeof res == 'string' ? JSON.parse(res || '[]') : res
  if (rows?.error) throw new Error(rows.error)
  return rows
}
const reportUiKey = x => [x?.reportId, x?.slot, x?.cmpId].join(':')
export const uniqueReportReactComps = xs => coreUtils.asArray(xs)
  .filter((x, i, all) => all.findIndex(y => reportUiKey(y) == reportUiKey(x)) == i)
const pickFinalFields = o => Object.fromEntries(
  `pollQuestion pollOptions pollVotes selectedOption host applet widgets reactComps viewId reportId showIn narrative sql rows followUps parts partsLayout
    longText longAnswer reportsUsed verified verificationWarning customAnswer`.split(/\s+/).map(k => [k, o?.[k]]).filter(([,v]) => v !== undefined))
// honest failure handling: the workflow owns its retry (one planner retry with feedback); the app never races
// a second agent behind the user's back - a failed run gets an honest message and a one-click re-run
const FAILURE_TEXT = 'לא הצלחתי להשלים את הניתוח כרגע. אפשר להריץ שוב ואנסה מחדש.'
const failedResult = r => !r?.payload || r.error || r.payload.runRes?.error
  || r.payload.runRes?.needsRegeneration || r.payload.content === '??'
// deadline: an agent can hang forever (e.g. a pending human-feedback var with no UI) - every run must resolve so the spinner never sticks
const withDeadline = (p, ms, fallback = null) => Promise.race([p, new Promise(ok => setTimeout(() => ok(fallback), ms))])
const fmtRowVal = v => v == null ? '' : typeof v == 'number' ? v.toLocaleString('he-IL', { maximumFractionDigits: 2 }) : String(v)
const heStatus = s => /[\u0590-\u05FF]/.test(s || '') ? s : ({'building image': 'בונה תמונה...'}[String(s || '').toLowerCase()] || 'מעבד...')
const WorkingIndicator = ReactComp('WorkingIndicator', { impl: comp({
  hFunc: (ctx, { react: { h, useEffect, useState } }) => () => {
    const [status, setStatus] = useState('חושב...')
    useEffect(() => { const onProgress = e => e?.t && setStatus(heStatus(e.t))
      coreUtils.eventEmitter.on('progress', onProgress); return () => coreUtils.eventEmitter.off('progress', onProgress) }, [])
    return h('div:max-w-3xl mx-auto px-5 sm:px-6 py-4', {},
      h('div:flex items-center gap-3 text-gray-500', {},
        h('div:w-8 h-8 rounded-full bg-white border border-gray-200 text-[#61A60E] flex items-center justify-center', {},
          h('L:Sparkles', { size: 14, className: 'animate-pulse' })),
        h('div:flex-1 min-w-0', {}, h('div:text-sm italic truncate', {}, status),
          h('div:mt-2 h-1 w-24 rounded-full bg-gray-200 overflow-hidden', {},
            h('div:h-full w-1/2 rounded-full bg-[#61A60E] animate-pulse')))))
  }
}) })
const rowVal = (ctx, rows, exp) => { try { return fmtRowVal(coreUtils.compileJb(exp.trim())(ctx.setVars({ rows })).next().value) } catch { return null } }
const fillRows = (ctx, rows, s) => !Array.isArray(rows) || typeof s != 'string' ? s : s
  .replace(/\$\(\(([\s\S]*?)\)\)/g, (m, exp) => { const v = rowVal(ctx, rows, exp); return v == null ? m : `$${v}` })
  .replace(/\(\(([\s\S]*?\$rows[\s\S]*?)\)\)/g, (m, exp) => rowVal(ctx, rows, exp) ?? m)
  .replace(/\((\$rows\[\d+\]\.[a-zA-Z_]\w*)\)/g, (m, exp) => rowVal(ctx, rows, exp) ?? m)
const fillObjRows = (ctx, rows, v) => typeof v == 'string' ? fillRows(ctx, rows, v)
  : Array.isArray(v) ? v.map(x => fillObjRows(ctx, rows, x))
  : v && typeof v == 'object' ? Object.fromEntries(Object.entries(v).map(([k,x]) => [k, fillObjRows(ctx, rows, x)])) : v
const clock = t => t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
// scoped scroll: only the chat list scrolls (scrollIntoView would also scroll the host page when embedded inline)
const scrollToMsg = msgId => { const el = document.getElementById(`msg-${msgId}`), sc = el?.closest('.overflow-y-auto')
  el && sc && sc.scrollTo({ top: sc.scrollTop + el.getBoundingClientRect().top - sc.getBoundingClientRect().top - 80, behavior: 'smooth' }) }
const VERIFIED_BADGE = 'https://upload.wikimedia.org/wikipedia/commons/e/e4/Twitter_Verified_Badge.svg'
const badgeLabel = kind => kind == 'verified' ? 'מאומת על בסיס דוח' : 'התשובה אינה מאומתת, יש לוודא את אמינות הנתונים'
const trustBadge = (h, kind) => kind == 'verified'
  ? h('span:inline-flex h-5 w-5 items-center justify-center',
    { title: badgeLabel(kind), 'aria-label': badgeLabel(kind), 'data-badge-kind': kind },
    h('img:w-4 h-4', { src: VERIFIED_BADGE, alt: '' }), h('span:sr-only', {}, badgeLabel(kind)))
  : kind == 'warning' && h('span:inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-50 text-amber-600 ring-1 ring-amber-200',
    { title: badgeLabel(kind), 'aria-label': badgeLabel(kind), 'data-badge-kind': kind }, h('L:TriangleAlert', { size: 13, strokeWidth: 2.2 }),
    h('span:sr-only', {}, badgeLabel(kind)))
const withTitleBadge = (h, kind, spec) => kind ? { ...spec, titleBadge: trustBadge(h, kind) } : spec
const badgedBlock = (h, kind, node) => h('div:min-w-0 max-w-full', {}, kind && h('div:mb-2 flex', {}, trustBadge(h, kind)), node)
const salesNumber = v => v == null || v === '' ? null : +v
const reportValueText = (v, f) => v == null ? '—' : f == '₪' ? `${salesNumber(v).toLocaleString('he-IL', { maximumFractionDigits: 1 })} ₪`
  : f == '%' ? `${salesNumber(v).toFixed(1)}%` : f == 'pp' ? `${salesNumber(v).toFixed(1)} נק׳ אחוז`
  : salesNumber(v).toLocaleString('he-IL', { maximumFractionDigits: 1 })
const salesLabels = { current_sales: 'חודש מלא אחרון', previous_sales: 'חודש קודם', change_ils: 'פער', change_pct: 'שינוי',
  current_profit: 'רווח גולמי', current_margin_pct: 'רווחיות', current_quantity: 'כמות', current_basket: 'סל ממוצע' }
const salesInsightFields = [
  ['name', 'שם'], ['x', 'תקופה'], ['current_value', 'מכירות', '₪'], ['previous_value', 'תקופה מקבילה', '₪'],
  ['change_pct', 'שינוי', '%'], ['wow_pct', 'מול שבוע קודם', '%'], ['receipts', 'קבלות', 'int'], ['basket', 'סל', '₪'],
  ['margin_ils', 'רווח גולמי', '₪'], ['margin_pct', 'רווחיות', '%'], ['share_pct', 'נתח מהרשת', '%'],
  ['promo_share_pct', 'נתח מבצעים', '%'], ['active_items', 'פריטים פעילים', 'int'], ['supplier', 'ספק'],
  ['department', 'מחלקה'], ['item_group', 'קבוצה']
]
const salesColumnFormat = k => k == 'change_pct' || k.includes('pct') ? '%' : k.includes('sales') || k.includes('profit')
  || k.includes('basket') || k == 'change_ils' ? '₪' : 'int'
const salesComparison = (values, format) => { const [current, previous] = values
  const diff = salesNumber(current?.value) - salesNumber(previous?.value)
  return [...values, { label: 'פער', value: diff, format },
    { label: 'שינוי', value: previous?.value ? 100 * diff / previous.value : null, format: '%' }] }
const salesKpiDrillData = (widget, event) => { const item = coreUtils.asArray(widget.items).find(x => x.label == event.name) || widget.items?.[0]
  return { subject: item?.label, format: item?.format, values: [
    { label: 'חודש מלא אחרון', value: item?.value, format: item?.format },
    { label: 'שינוי מול חודש קודם', value: item?.delta, format: /רווחיות/.test(item?.label) ? 'pp' : '%' }] } }
const salesSeriesDrillData = (widget, event) => { const index = coreUtils.asArray(widget.categories).indexOf(String(event.name))
  const values = widget.categories ? coreUtils.asArray(widget.series)
    .map(x => ({ label: x.name, value: x.values?.[index], format: widget.valueFormat }))
    : coreUtils.asArray(widget.series).map(x => ({ label: x.name,
      value: x.points?.find(p => String(p.x) == String(event.name))?.y, format: widget.valueFormat }))
  return { subject: event.name, format: widget.valueFormat, values: salesComparison(values, widget.valueFormat) } }
const salesRowDrillData = (widget, event) => ({ subject: event.name, format: widget.valueFormat || '₪',
  values: Object.entries(event.row || {}).filter(([, v]) => typeof v == 'number')
    .map(([key, value]) => ({ label: salesLabels[key] || key, value, format: salesColumnFormat(key) })) })
const salesDrillData = spec => spec.mode == 'kpi' ? salesKpiDrillData(spec.widget, spec.event)
  : spec.event?.row ? salesRowDrillData(spec.widget, spec.event) : salesSeriesDrillData(spec.widget, spec.event)
const reportDrillRunner = ctx => async (query, event) => {
  const root = ctx.vars.reportsRoot || HOME_REPORTS_ROOT
  const registry = dsls.common.data.verifiedReportsRegistry.$runWithCtx(ctx)
  const rows = await dsls.common.data.queryReportFullData.$runWithCtx(
    ctx.setVars({ ...localDb(ctx), reportsRoot: root, reportsRegistry: registry }),
    { ...query, sql: jb.vizUtils.fillDrill(query.sql, event), root, registry })
  return Array.isArray(rows) ? rows : []
}
const useReportQueries = (useState, useEffect, runQuery, spec) => {
  const queries = coreUtils.asArray(spec.queries), [sets, setSets] = useState(queries.length ? null : [])
  useEffect(() => { let live = true
    queries.length && Promise.all(queries.map(query => runQuery(query, spec.event))).then(rows => live && setSets(rows))
    return () => { live = false }
  }, [spec.event?.name, spec.event?.series])
  return sets
}
const salesInsight = (h, hh, ctx, query, rows) => {
  const ordered = ['months', 'days'].includes(query.id) ? [...rows].reverse() : rows
  const hasPrevious = ordered.some(row => row.previous_value != null), isTimeline = ordered.some(row => row.x != null)
  const chart = !ordered.length ? null : isTimeline ? { kind: 'line', title: query.title, width: 620, height: 260, valueFormat: '₪',
    series: [{ name: 'מכירות', points: ordered.map(row => ({ x: String(row.x), y: row.current_value })) },
      ...(hasPrevious ? [{ name: 'שבוע קודם', points: ordered.map(row => ({ x: String(row.x), y: row.previous_value })) }] : [])] }
    : hasPrevious ? { kind: 'groupedBar', title: query.title, width: 620, height: 260, valueFormat: '₪',
      categories: ordered.map(row => row.name), series: [
        { name: 'חודש מלא אחרון', values: ordered.map(row => row.current_value) },
        { name: 'חודש קודם', values: ordered.map(row => row.previous_value) }] }
    : { kind: 'hbar', title: query.title, width: 620, height: 260, valueFormat: '₪',
      data: ordered.map(row => ({ name: row.name, value: row.current_value })) }
  const columns = salesInsightFields.filter(([key]) => ordered.some(row => row[key] != null))
    .map(([key, label, format]) => ({ key, label, ...(format && { format }) }))
  return h('section:space-y-2 rounded-xl border border-slate-200 bg-white p-2.5', { key: query.id },
    !ordered.length ? h('div:text-sm text-slate-500', {}, `${query.title}: אין נתונים`) : [
      hh(ctx, dsls.react['react-comp'].VizWidget, { spec: chart }),
      !isTimeline && hh(ctx, dsls.react['react-comp'].VizWidget, { spec: {
        kind: 'table', title: `${query.title} — נתונים`, width: 620, columns, rows: ordered } })])
}
const metricCards = (h, metrics) => h('div:grid grid-cols-2 sm:grid-cols-4 gap-2', {}, metrics.map((metric, index) =>
  h('div:rounded-lg border border-slate-200 bg-slate-50 p-3 min-w-0', { key: `${metric.label}-${index}` },
    h('div:text-xs text-slate-500 truncate', {}, metric.label),
    h('div:mt-1 text-lg font-bold tabular-nums text-slate-900 break-words', {}, reportValueText(metric.value, metric.format)))))

ReactComp('branchDrillPanel', { impl: comp({
  hFunc: (ctx, { react: { h, hh, useState, useEffect } }) => ({ spec = {}, runQuery }) => {
    const sets = useReportQueries(useState, useEffect, runQuery, spec), [months = [], days = [], departments = []] = sets || []
    const current = months[0], previous = months[1], change = previous?.current_value
      ? 100*(current?.current_value - previous.current_value)/previous.current_value : null
    const metrics = current ? [
      { label: 'מכירות בחודש המלא האחרון', value: current.current_value, format: '₪' },
      { label: 'שינוי חודשי', value: change, format: '%' }, { label: 'סל ממוצע', value: current.basket, format: '₪' },
      { label: 'קבלות', value: current.receipts, format: 'int' }
    ] : []
    return h('section:space-y-3', { dir: 'rtl' },
      h('div', {}, h('div:text-xs font-semibold text-[#61A60E]', {}, 'כרטיס סניף'),
        h('h3:text-xl font-black text-slate-900 break-words', {}, spec.event?.name)),
      metrics.length > 0 && metricCards(h, metrics),
      sets ? coreUtils.asArray(spec.queries).map((query, index) => salesInsight(h, hh, ctx, query, sets[index] || []))
        : h('div:flex items-center justify-center gap-2 py-12 text-sm text-slate-500', {},
          h('L:Loader2', { size: 18, className: 'animate-spin' }), 'טוען נתוני סניף מאומתים...'))
  }
}) })

ReactComp('salesDrillPanel', { impl: comp({
  hFunc: (ctx, { react: { h, hh, useState, useEffect } }) => ({ spec = {}, runQuery }) => {
  const data = salesDrillData(spec), pair = data.values.slice(0, 2), sets = useReportQueries(useState, useEffect, runQuery, spec)
  return h('section:space-y-3', { dir: 'rtl' }, h('div:text-sm font-semibold text-slate-700 break-words', {}, data.subject),
    pair.every(x => x.value != null && x.format == data.format) && hh(ctx, dsls.react['react-comp'].VizWidget, { spec: {
      kind: 'groupedBar', width: 580, height: 220,
      valueFormat: data.format, categories: [data.subject], series: pair.map(x => ({ name: x.label, values: [x.value] })) } }),
    metricCards(h, data.values),
    sets ? coreUtils.asArray(spec.queries).map((query, index) => salesInsight(h, hh, ctx, query, sets[index] || []))
      : h('div:flex items-center justify-center gap-2 py-8 text-sm text-slate-500', {},
        h('L:Loader2', { size: 18, className: 'animate-spin' }), 'טוען נתוני עומק מאומתים...'))
} }) })

const inventoryFields = [
  ['name', 'שם'], ['current_value', 'שווי', '₪'], ['inventory_value_ils', 'שווי המלאי', '₪'],
  ['excess_value_ils', 'מלאי עודף', '₪'], ['sales_at_risk_ils', 'מכירות בסיכון בגלל חוסר', '₪'],
  ['missing_items', 'פריטים חסרים', 'int'], ['low_stock_items', 'פריטים שנשארו לשבוע', 'int'],
  ['stock_days', 'ימי מלאי משוערים', 'int'], ['stock_qty', 'כמות במלאי'], ['daily_sales', 'מכירות ליום'],
  ['sales_change_pct', 'שינוי בקצב המכירה', '%'], ['margin_pct', 'רווחיות', '%'],
  ['sales_90d', 'מכירות ב־90 הימים האחרונים', '₪'], ['no_sales_value_ils', 'לא נמכר ב־90 הימים האחרונים', '₪'],
  ['items_to_check', 'פריטים לבדיקה', 'int'], ['inventory_state', 'מצב המלאי'], ['reason', 'למה צריך לטפל'],
  ['branch', 'סניף'], ['last_sale_date', 'נמכר לאחרונה']
]
const inventoryInsight = (h, hh, ctx, query, rows) => {
  const columns = inventoryFields.filter(([key]) => rows.some(row => row[key] != null))
    .map(([key, label, format]) => ({ key, label: key == 'current_value' ? query.valueLabel || label : label, ...(format && { format }) }))
  const metrics = query.kind == 'metrics' && inventoryFields.filter(([key]) => rows[0]?.[key] != null && key != 'name')
    .map(([key, label, format]) => ({ label, value: rows[0][key], format }))
  const chart = rows.some(row => row.name != null && row.current_value != null) && {
    kind: 'hbar', title: query.title, width: 620, height: 280, valueFormat: '₪',
    data: rows.map(row => ({ name: row.name, value: row.current_value }))
  }
  return h('section:space-y-2 rounded-xl border border-slate-200 bg-white p-2.5', { key: query.id },
    !rows.length ? h('div:text-sm text-slate-500', {}, `${query.title}: אין נתונים`)
      : metrics ? [h('h4:text-sm font-bold text-slate-800', {}, query.title), metricCards(h, metrics)]
      : [chart && hh(ctx, dsls.react['react-comp'].VizWidget, { spec: chart }),
        hh(ctx, dsls.react['react-comp'].VizWidget, { spec: {
          kind: 'table', title: `${query.title} — פירוט`, width: 620, columns, rows } })])
}
const inventoryDrillTitles = {
  kpi: 'תמונת המלאי ברשת', branch: 'מצב המלאי בסניף',
  availability: 'מצב הפריט בכל הסניפים', excess: 'מה מרכיב את המלאי העודף'
}
ReactComp('inventoryDrillPanel', { impl: comp({
  hFunc: (ctx, { react: { h, hh, useState, useEffect } }) => ({ spec = {}, runQuery }) => {
    const sets = useReportQueries(useState, useEffect, runQuery, spec)
    return h('section:space-y-3', { dir: 'rtl' },
      h('div', {}, h('div:text-xs font-semibold text-[#61A60E]', {}, inventoryDrillTitles[spec.mode]),
        h('h3:text-lg font-black text-slate-900 break-words', {}, spec.event?.name)),
      sets ? coreUtils.asArray(spec.queries).map((query, index) => inventoryInsight(h, hh, ctx, query, sets[index] || []))
        : h('div:flex items-center justify-center gap-2 py-12 text-sm text-slate-500', {},
          h('L:Loader2', { size: 18, className: 'animate-spin' }), 'טוען נתוני מלאי מאומתים...'))
  }
}) })

const AnalyticsAssistantResponse = ReactComp('AnalyticsAssistantResponse', {
  impl: comp({
    hFunc: (ctx, { isDebug, colors = { text: '#111827' }, react: { h, hh, useState } }) => ({ element, send, openDetails }) => {
      const rows = Array.isArray(element?.rows) ? element.rows : []
      const shownElement = { ...element, ...fillObjRows(ctx, rows, { content: element?.content,
        parts: element?.parts, longText: element?.longText, longAnswer: element?.longAnswer }) }
      const { nodes, hostContent } = renderMessageContent(shownElement, ctx)
      const longText = shownElement.longText || shownElement.longAnswer || shownElement.runRes?.longText || shownElement.runRes?.longAnswer
      const adminUrl = element?.adminUrl
      const showAdminLink = (isDebug || element?.content === '??') && adminUrl
      const widgets = (Array.isArray(element?.widgets) ? element.widgets : [])
        .slice().sort((a, b) => (a?.kind == 'table') - (b?.kind == 'table'))   // charts first, tables after (stable within each group)
      const reactComps = uniqueReportReactComps([
        ...coreUtils.asArray(element?.reactComps),
        ...(element?.viewId ? [{ cmpId: element.viewId, rows: element.rows }] : [])
      ])
      const reportVerified = !!element?.viewId || coreUtils.asArray(element?.reportsUsed ?? element?.runRes?.reportsUsed).length > 0
      const badgeKind = element?.verificationWarning || element?.verified === false ? 'warning'
        : reportVerified ? 'verified' : widgets.length || reactComps.length ? 'warning' : ''
      const badgeWrap = x => badgeKind ? h('div:flex items-start gap-2', {}, h('span:pt-1 shrink-0', {}, trustBadge(h, badgeKind)), h('div:min-w-0 flex-1', {}, x)) : x
      const followUps = Array.isArray(element?.followUps) ? element.followUps : []
      const parts = Array.isArray(shownElement?.parts) ? shownElement.parts : []
      const collapsedParts = shownElement?.partsLayout == 'collapsedSections' && parts.length
      const VizWidget = dsls.react['react-comp'].VizWidget
      const mobileChartSize = (globalThis.innerWidth || 1200) < 640 && { width: Math.max(280, globalThis.innerWidth - 40), height: 250 }
      const renderReactComp = (spec, i) => {
        const Cmp = spec?.cmpId && dsls.react['react-comp'][spec.cmpId]
        return Cmp && h('div:min-w-0 overflow-hidden', { key: i }, hh(ctx, Cmp, { spec, send, openDetails }))
      }
      const drillOf = spec => coreUtils.asArray(spec?.drill).find(x => x?.reactComp || x?.sql || x?.question)
      const openDrill = async (spec, e) => {
        const d = drillOf(spec), fill = s => s && jb.vizUtils.fillDrill(s, e)
        const title = fill(d?.title) || e?.name || spec?.title || 'פירוט'
        const Cmp = d?.reactComp && dsls.react['react-comp'][d.reactComp]
        if (d?.reactComp) return Cmp && openDetails({ title, width: d.width, badgeKind,
          content: hh(ctx, Cmp, { spec: { ...d, widget: spec, event: e }, runQuery: reportDrillRunner(ctx) }) })
        else if (d?.sql) {
          openDetails({ title, loading: true, question: fill(d.question), badgeKind })
          try { const rows = await drillSqlRunner(ctx)(fill(d.sql)), kind = d.kind || spec.kind || 'table'
            openDetails({ title, question: fill(d.question), badgeKind, childSpec: { kind, title, valueFormat: d.valueFormat, ...jb.vizUtils.rowsToSpec(kind, rows) } })
          } catch (err) { openDetails({ title, badgeKind, error: String(err?.message || err) }) }
        } else {
          const q = e.type == 'question' && e.question || comaxDrillQuestion(spec, e)
          q && openDetails({ title, question: q, badgeKind })
        }
      }
      const drawerSpec = spec => { const { drill, ...s } = spec; return s }
      const [showLong, setShowLong] = useState(false)
      const [depth, setDepth] = useState(0)
      return h('div:w-full max-w-3xl mx-auto px-5 sm:px-6 py-3', {},
        badgeWrap(collapsedParts
          ? h('div:space-y-3 text-[16px] leading-7 text-gray-900', { style: { color: colors.text, overflowWrap: 'anywhere' } },
            h('div', {}, nodes),
            parts.map((p, i) => h('details:rounded-lg border border-gray-200 bg-white px-3 py-2', { key: i },
              h('summary:cursor-pointer text-sm font-semibold text-gray-900', {}, p.title || `חלק ${i + 1}`),
              h('div:mt-2 text-[15px] leading-7 text-gray-700', {}, renderMarkdown(h, p.text || p.short || '')))))
          : parts.length
          ? h('div:text-[16px] leading-7 text-gray-900', { style: { color: colors.text, overflowWrap: 'anywhere' } }, parts.map((p, i) => {
            const q = partQuestion(p)
            return h('div:my-2', { key: i },
              p.title && h('div:text-sm font-semibold text-gray-900 mb-0.5', {}, p.title),
              h('div', {}, renderMarkdown(h, p.short || p.text || '')),
              depth > 0 && p.detail && h('div:mt-1 pr-3 border-r border-gray-200 text-gray-600', {}, renderMarkdown(h, p.detail)),
              depth > 1 && p.insight && h('div:mt-1 pr-3 border-r border-gray-300 font-medium text-gray-800', {}, renderMarkdown(h, p.insight)),
              q && depth > 0 && h('button:mt-1 text-xs text-gray-600 hover:text-gray-900 inline-flex items-center gap-1', { onClick: () => send?.(q) },
                h('L:Search', { size: 13 }), p.drill?.label || 'נתח את זה'))
          }))
          : h('div:text-[16px] leading-7 text-gray-900', { style: { color: colors.text, overflowWrap: 'anywhere' } }, nodes)),
        parts.length > 0 && !collapsedParts && h('div:mt-3 flex items-center gap-3 text-xs text-gray-500', {},
          h('input:flex-1 min-w-0 accent-[#61A60E]', { type: 'range', min: 0, max: 2, value: depth, onInput: e => setDepth(+e.target.value), 'aria-label': 'אורך תשובה' }),
          h('button:px-2.5 py-1.5 rounded-full border border-gray-200 bg-white text-gray-700 disabled:text-gray-400 inline-flex items-center gap-1',
            { disabled: depth == 2, onClick: () => setDepth(Math.min(2, depth + 1)) },
            h('L:ChevronDown', { size: 13 }), depth == 2 ? 'עמוק' : 'העמק')),
        longText && h('details:mt-3 rounded-lg border border-gray-200 bg-white px-3 py-2', { open: showLong, onToggle: e => setShowLong(e.currentTarget.open) },
          h('summary:cursor-pointer list-none text-sm font-semibold text-gray-700 flex items-center gap-1', {},
            h('L:chevron-down', { size: 14, className: `transition-transform ${showLong ? 'rotate-180' : ''}` }), 'פירוט'),
          showLong && h('div:mt-2 text-[15px] leading-7 text-gray-700', {}, renderMarkdown(h, longText))),
        reactComps.length > 0 && h('div:mt-5 space-y-4 overflow-x-hidden', {}, reactComps.map((spec, i) => {
          const node = renderReactComp(spec, i)
          return node && badgedBlock(h, badgeKind, node)
        }).filter(Boolean)),
        !reactComps.length && widgets.length > 0 && h('div:mt-5 space-y-5 overflow-x-hidden', {},
          widgets.map((spec, i) => h(`div:min-w-0 ${spec.kind == 'table' ? 'overflow-x-auto' : 'overflow-hidden'}`, { key: i },
            hh(ctx, VizWidget, { spec: withTitleBadge(h, badgeKind,
              { width: 680, height: 340, ...(openDetails ? drawerSpec(spec) : spec), ...mobileChartSize }), runSql: drillSqlRunner(ctx),
              onEvent: openDetails ? drillOf(spec) && (e => openDrill(spec, e)) : send && (e => {
                const q = e.type == 'question' && e.question || comaxDrillQuestion(spec, e); q && send(q)
              }) })))),
        followUps.length > 0 && h('div:mt-3 flex flex-wrap gap-2', {}, followUps.map((f, i) =>
          h('button:px-3 py-1.5 text-sm rounded-full border border-[#61A60E]/40 bg-white text-[#4a7f0b] hover:bg-[#61A60E]/10 transition-colors', {
            key: i, onClick: () => send?.(f.question) }, f.label || f.question))),
        hostContent && h('div:mt-2', {}, hostContent),
        showAdminLink && h('div:mt-1', {},
          h('a:text-xs text-blue-500 hover:text-blue-700 underline', { href: adminUrl, target: '_blank', rel: 'noopener' },
            element?.content === '??' ? 'שגיאת דיבאג' : 'דיבאג')
        )
      )
    }
  })
})

const AnalyticsComposer = ReactComp('AnalyticsComposer', {
  impl: comp({
    hFunc: (ctx, { react: { h, useEffect, useRef, useState } }) => ({ send, disabled, selected, setSelected, multi, home, model = '', setModel = () => {} }) => {
      const [txt, setTxt] = useState(''), [open, setOpen] = useState(false), ref = useRef(null), canSend = !!txt.trim() && !disabled
      const agents = availableAgents(), byId = Object.fromEntries(agents.map(a => [a.id, a]))
      useEffect(() => { const el = ref.current; if (el) el.style.height = 'auto', el.style.height = `${Math.min(el.scrollHeight, 176)}px` }, [txt])
      const submit = () => canSend && (send(txt), setTxt(''))
      const toggle = id => multi
        ? setSelected(s => s.includes(id) ? (s.length > 1 ? s.filter(x => x != id) : s) : [...s, id])
        : (setSelected([id]), setOpen(false))
      const label = (selected || []).map(id => byId[id]?.label || id).join(' + ') || 'סוכן'
      return h(`div:${home ? 'rounded-[28px]' : 'rounded-[22px]'} border border-gray-200 bg-white shadow-[0_10px_35px_rgba(0,0,0,0.09)] overflow-visible`, {},
        h('div:flex items-end gap-2 p-2', {},
          h(`textarea:flex-1 ${home ? 'min-h-[92px] text-[17px]' : 'min-h-[48px] text-[15px]'} max-h-44 resize-none bg-transparent px-3 py-3 `
            + 'leading-6 text-gray-900 placeholder:text-gray-400 focus:outline-none', {
            ref, value: txt, dir: 'rtl', rows: 1, placeholder: 'שאלו על נתוני קומקס...',
            onInput: e => setTxt(e.target.value),
            onKeyDown: e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), submit())
          }),
          h('button:w-10 h-10 mb-1 flex items-center justify-center rounded-full bg-[#61A60E] text-white disabled:bg-gray-200 disabled:text-gray-400 transition-colors',
            { disabled: !canSend, onClick: submit, 'aria-label': 'שליחה' },
            h('L:ArrowUp', { size: 17, strokeWidth: 3 }))),
        h('div:relative px-3 pb-2 flex flex-wrap items-center gap-2', {},
          open && h('div:fixed inset-0 z-40', { onClick: () => setOpen(false) }),
          multi && h('select:px-2.5 py-1.5 rounded-full border border-gray-200 bg-white text-xs font-medium text-gray-700 max-w-[9.5rem]', {
            value: model, onChange: e => setModel(e.target.value), title: 'מודל (דיבאג)', 'aria-label': 'בחירת מודל' },
            [h('option', { key: '_default', value: '' }, 'מודל ברירת מחדל'), ...MODELS.map(([lbl, id]) => h('option', { key: id, value: id }, lbl))]),
          multi && h('button:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 bg-white text-gray-700 '
            + 'hover:border-gray-300 transition-colors',
            {
            onClick: () => setOpen(v => !v), 'aria-label': 'בחירת סוכן', 'aria-expanded': open },
            h('L:Bot', { size: 13 }), label,
            multi && h('span:text-[10px] text-amber-600 font-semibold', {}, 'דיבאג'),
            h('L:ChevronDown', { size: 14, className: `transition-transform ${open ? 'rotate-180' : ''}` })),
          open && h('div:absolute bottom-full right-3 mb-2 w-72 rounded-2xl border border-gray-200 bg-white shadow-xl p-1.5 z-50', {},
            agents.map(a => { const on = (selected || []).includes(a.id)
              return h('button:w-full text-right px-3 py-2 rounded-xl flex items-start gap-2 transition-colors '
                + (on ? 'bg-[#61A60E]/10' : 'hover:bg-gray-50'), { key: a.id, onClick: () => toggle(a.id) },
                multi
                  ? h('span:mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 '
                    + (on ? 'bg-[#61A60E] border-[#61A60E] text-white' : 'border-gray-300'), {},
                    on && h('L:Check', { size: 11, strokeWidth: 3 }))
                  : h('span:mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 '
                    + (on ? 'border-[#61A60E]' : 'border-gray-300'), {}, on && h('span:w-2 h-2 rounded-full bg-[#61A60E]')),
                h('span:flex-1', {},
                  h('span:block text-sm font-medium text-gray-800', {}, a.label),
                  h('span:block text-xs text-gray-500', {}, a.hint)))
            }),
            multi && h('div:px-3 py-1.5 text-[10px] text-gray-400 border-t border-gray-100 mt-1', {},
              'מצב דיבאג: בחרו כמה סוכנים להשוואה מקבילה'))),
        h('div:flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400', {},
          h('img:h-4 w-auto', { src: comaxLogo, alt: 'COMAX' }),
          h(disabled ? 'div' : 'div:text-[#61A60E] font-bold', {}, disabled ? 'עובד' : 'מוכן')))
    }
  })
})

const detailLabel = {stock: 'מלאי', weekly_sales_avg: 'מכירות שבועיות', current_price: 'מחיר', last_sale_date: 'תאריך אחרון', receipts: 'קבלות'}
const feedbackDetails = o => o?.summary || Object.entries(o?.details || {}).map(([k, v]) => `${detailLabel[k] || k}: ${fmtRowVal(v)}`).join(' · ')
const feedbackNoun = e => ({product: 'מוצרים', products: 'מוצרים', branch: 'סניפים', branches: 'סניפים'}[
  String(e.entity || e.varName || '').replace(/^selected/i, '').toLowerCase()] || 'אפשרויות')
const feedbackIds = e => e.selectedIds || e.ids || e.value?.ids || (Array.isArray(e.value) ? e.value : [])
const feedbackItems = (e, ids) => {
  const opts = Object.fromEntries((e.options || []).map(o => [String(o.id), o]))
  const items = coreUtils.asArray(e.items || e.value?.items), labels = coreUtils.asArray(e.labels || e.value?.labels)
  return (ids.length ? ids : items.length ? items.map(x => x.id) : labels)
    .map((id, i) => opts[String(id)] || items.find(x => String(x.id) == String(id)) || {id, label: labels[i] || id}).filter(Boolean)
}
const clarifiedParam = e => {
  const items = e?.type == 'humanFeedback' && e.resolved && feedbackItems(e, feedbackIds(e))
  return items?.length ? { varName: e.varName, question: e.question, ids: items.map(x => x.id), labels: items.map(x => x.label || x.name || String(x.id)) } : null
}
// structured turn record (msg.turnRecord, written by the workflow): plan + rowsShown + entitiesShown + caveats + verified.
// Persisted FULL in privateChat; trimmed only here at prompt assembly - full rows/caveats on the last 2 assistant
// turns, older turns keep the cheap plan + entitiesShown so entity-coverage comparison survives long chats.
const FULL_TURNS = 2, ROWS_SHOWN_LIMIT = 20
export const chatHistoryEntry = (m, fullTurn) => {
  const c = clarifiedParam(m)
  if (c) return { role: 'user', content: `Clarified ${c.varName}: ${c.labels.join(', ')} (ids: ${c.ids.join(',')})`, clarifiedParam: c }
  if (m.sender !== 'Assistant') return { role: 'user', content: m.content }
  const t = m.turnRecord
  return { role: 'assistant', content: m.content,
    ...(t?.plan && { plan: t.plan }), ...(t?.entitiesShown && { entitiesShown: t.entitiesShown }),
    ...(t && { verified: t.verified !== false }),
    ...(fullTurn && t ? { rowsShown: coreUtils.asArray(t.rowsShown).slice(0, ROWS_SHOWN_LIMIT),
      caveats: coreUtils.asArray(t.caveats) } : {}),
    ...(m.sql && { sql: m.sql }), ...(m.llmGeneratedCode && { llmFlow: m.llmGeneratedCode }) }
}
export const buildChatHistory = msgs => {
  const fullIds = new Set(msgs.filter(m => m.sender === 'Assistant' && m.turnRecord).slice(-FULL_TURNS).map(m => m.id))
  return msgs.map(m => chatHistoryEntry(m, fullIds.has(m.id)))
}
const HumanFeedbackMessage = ReactComp('HumanFeedbackMessage', {
  impl: comp({
    hFunc: (ctx, { react: { h, useState } }) => ({ element, resolve }) => {
      const [ids, setIds] = useState(feedbackIds(element)), [open, setOpen] = useState(false), multi = element.mode == 'multi', done = element.resolved
      const has = (xs, id) => xs.some(x => String(x) == String(id))
      const toggle = id => !done && setIds(xs => multi ? (has(xs, id) ? xs.filter(x => String(x) != String(id)) : [...xs, id]) : [id])
      const selected = feedbackItems(element, ids)
      return h('div:w-full max-w-3xl mx-auto px-5 sm:px-6 py-3', {},
        h('div:bg-white border border-gray-200 rounded-2xl p-4 shadow-sm', {},
          h('div:flex items-center gap-2 mb-3 text-sm font-semibold text-gray-900', {}, h('L:ListChecks', { size: 16 }), element.question),
          done
            ? h('div:space-y-2', {},
              selected.length > 0 && h('div:flex flex-wrap gap-2', {}, selected.map(o =>
                h('span:inline-flex items-center gap-1 rounded-full bg-[#61A60E]/10 px-2.5 py-1 text-xs font-semibold text-[#4a7f0b]',
                  { key: o.id }, h('L:Check', { size: 12 }), o.label || o.name || o.id))),
              h('button:inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700', { onClick: () => setOpen(x => !x), 'aria-expanded': open },
                h('L:ChevronDown', { size: 13, className: `transition-transform ${open ? 'rotate-180' : ''}` }),
                `${element.autoResolved ? 'נבחר אוטומטית · ' : ''}נבחרו ${selected.length} ${feedbackNoun(element)}`),
              open && h('div:space-y-1', {}, selected.map(o => h('div:rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700', { key: o.id },
                h('div:font-medium text-gray-800 break-words', {}, o.label || o.name || o.id),
                feedbackDetails(o) && h('div:text-xs text-gray-500 mt-0.5 break-words', {}, feedbackDetails(o))))))
            : h('div:space-y-2', {}, (element.options || []).map(o => {
            const on = has(ids, o.id)
            return h('button:w-full text-right rounded-xl border p-3 transition-colors '
              + (on ? 'border-[#61A60E] bg-[#61A60E]/10' : 'border-gray-200 hover:bg-gray-50'), { key: o.id, onClick: () => toggle(o.id) },
              h('div:flex items-start gap-3', {},
                h(`span:mt-0.5 w-5 h-5 rounded ${multi ? 'border' : 'rounded-full border'} flex items-center justify-center shrink-0 `
                  + (on ? 'bg-[#61A60E] border-[#61A60E] text-white' : 'border-gray-300'), {},
                  on && h('L:Check', { size: 13, strokeWidth: 3 })),
                h('span:min-w-0 flex-1', {},
                  h('span:block font-medium text-gray-900 break-words', {}, o.label || o.name || o.id),
                  h('span:block text-xs text-gray-500 mt-1 break-words', {}, feedbackDetails(o))))) })),
          !done && h('button:mt-3 px-4 py-2 rounded-full bg-[#61A60E] text-white text-sm font-semibold disabled:bg-gray-200 disabled:text-gray-400',
            { disabled: !ids.length, onClick: () => resolve(ids) }, 'המשך')))
    }
  })
})

// Debug-mode multi-agent comparison: one collapsible box per agent, timing in the header, fastest highlighted.
const AgentComparison = ReactComp('AgentComparison', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh, useState } }) => ({ element, send, openDetails }) => {
      const items = Array.isArray(element?.comparison) ? element.comparison : []
      const [closed, setClosed] = useState({})
      const byId = Object.fromEntries(availableAgents().map(a => [a.id, a]))
      const fastest = Math.min(...items.filter(i => !i.error && i.durMs != null).map(i => i.durMs))
      const AnswerComp = dsls.react['react-comp'].AnalyticsAssistantResponse
      return h('div:w-full max-w-3xl mx-auto px-5 sm:px-6 py-3 space-y-3', {},
        h('div:text-xs text-gray-500', {}, `השוואת ${items.length} סוכנים — הרצה במקביל`),
        items.map(it => { const isOpen = !closed[it.agent]
          return h('div:rounded-2xl border border-gray-200 bg-white overflow-hidden', { key: it.agent },
            h('button:w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-gray-50 transition-colors',
              { onClick: () => setClosed(c => ({ ...c, [it.agent]: isOpen })) },
              h('span:flex items-center gap-2 text-sm font-semibold text-gray-800', {},
                h('L:Bot', { size: 14 }), byId[it.agent]?.label || it.agent,
                it.error && h('span:text-xs font-medium text-red-600 bg-red-50 rounded-full px-2 py-0.5', {}, 'שגיאה')),
              h('span:flex items-center gap-2 text-xs text-gray-500', {},
                it.durMs != null && h(`span:font-mono ${it.durMs == fastest ? 'text-[#61A60E] font-bold' : ''}`, {}, `${(it.durMs / 1000).toFixed(1)}s`),
                h('L:ChevronDown', { size: 14, className: `transition-transform ${isOpen ? 'rotate-180' : ''}` }))),
            isOpen && h('div:border-t border-gray-100', {},
              it.error
                ? h('div:px-4 py-3 text-sm text-red-700 whitespace-pre-wrap break-words', {}, String(it.error).slice(0, 600))
                : hh(ctx, AnswerComp, { element: { sender: 'Assistant', type: 'text', ...it.payload }, send, openDetails })))
        }))
    }
  })
})

ReactComp('unverifiedAgentApplet', {
  impl: comp({
  hFunc: (ctx, { roomId, isDebug, comaxView = 'chat', colors = { text: '#111827' }, wonderMain, initChatElements, shareShortUrl
    , react: { h, hh, useRef, useState, useEffect } }) => () => {
      
      const listRef = useRef(null)
      const didInitialScroll = useRef(false)
      const [workingUserId, setWorkingUserId] = useState(null)
      const [chatElements, setChatElements] = useState(initChatElements || [])
      const [selected, setSelected] = useState([ctx.vars.analyticsWorkflow || DEFAULT_WORKFLOW])
      const [model, setModel] = useState(ctx.vars.analyticsModel || '')
      const [details, setDetails] = useState(null), [detailsW, setDetailsW] = useState(430)
      const [activeView, setActiveView] = useState(comaxView)
      const [viewportWidth, setViewportWidth] = useState(globalThis.innerWidth || 1200), mobile = viewportWidth < 640, railWidth = mobile ? 0 : 96
      const maxDetailsW = mobile ? viewportWidth : Math.max(260, Math.min(720, viewportWidth - railWidth - 64)), drawerW = Math.min(detailsW, maxDetailsW)
      const shift = details ? drawerW : 0
      const mainHidden = details && mobile, fixedStyle = mainHidden ? { display: 'none' } : { left: shift, right: railWidth, transition: 'left .3s ease' }
      const drawerChildW = Math.max(260, drawerW - 32)
      const openDetails = d => (d?.width && setDetailsW(d.width), setDetails(d))
      const go = view => (setActiveView(view), setHashParam('view', view == 'chat' ? null : view))
      const dragDetails = e => {
        e.preventDefault()
        const move = ev => setDetailsW(Math.max(260, Math.min(maxDetailsW, ev.clientX)))
        const up = () => (removeEventListener('pointermove', move), removeEventListener('pointerup', up))
        addEventListener('pointermove', move); addEventListener('pointerup', up)
      }

      useEffect(() => setChatElements(initChatElements || []), [initChatElements])
      useEffect(() => { const updateViewportWidth = () => setViewportWidth(innerWidth)
        addEventListener('resize', updateViewportWidth); return () => removeEventListener('resize', updateViewportWidth) }, [])
      const send = txt => sendMessage({ txt, agents: selected, model, chatElements, setChatElements, ctx, setWorkingUserId })
      const resolveHumanFeedback = (element, ids) => {
        coreUtils.eventEmitter.emit('humanFeedbackResolve', { requestId: element.requestId || element.id, ids })
        setChatElements(xs => {
          const next = xs.map(x => x.id == element.id ? { ...x, selectedIds: ids, resolved: true } : x)
          chatUser() && wPut(cts.privateChat, next, ctx)
          return next
        })
      }
      const visibleMessages = chatElements.filter(e => e && e.type !== 'setDBSource')
      const share = async () => {
        if (!shareShortUrl) return
        await shareHandler({ title: 'Comax ERP אנליטיקה', url: shareShortUrl })
        navigator.clipboard?.writeText(shareShortUrl)
      }
      const newChat = () => { setHashParam('instanceId', formatTimeWithRandom()); location.reload() }

      !didInitialScroll.current && chatElements?.length && (didInitialScroll.current = true, typeof requestAnimationFrame == 'function' && requestAnimationFrame(() => {
        const el = listRef.current
        el && el.scrollTo({ top: el.scrollHeight, behavior: 'auto' })
      }))
      const composer = props => hh(ctx, AnalyticsComposer, { send, disabled: !!workingUserId, selected, setSelected, multi: !!isDebug,
        model, setModel: v => { setModel(v); setHashParam('model', v) }, ...props })

      // fixed inset-0 (not h-screen): iOS 100vh exceeds the visible viewport (toolbars), giving the outer page its own scroll that drags the nav off-screen
      return h('div:comax-brand fixed inset-0 overflow-hidden bg-[#F6F7F8] text-gray-900', { dir: 'rtl', lang: 'he' },
        h('style', {}, comaxFontCss),
        appRail(h, activeView, go),
        activeView == 'dashboards' && h('main:h-full overflow-y-auto overflow-x-hidden overscroll-contain',
          { style: { marginRight: railWidth } }, hh(ctx, dsls.react['react-comp'].Dashboards)),
        activeView == 'chat' && details && h('aside:fixed top-0 bottom-0 left-0 z-40 bg-white border-r border-gray-200 shadow-xl flex flex-col',
          { style: { width: drawerW, paddingTop: 68 } },
          h('div:flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100', {},
            h('div:min-w-0 flex items-center gap-2', {},
              details.badgeKind && trustBadge(h, details.badgeKind),
              h('div:min-w-0 text-sm font-bold text-gray-900 truncate', {}, details.title || 'פירוט')),
            h('button:w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center',
              { onClick: () => setDetails(null), 'aria-label': 'סגור פירוט' }, h('L:X', { size: 16 }))),
          h('div:flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-3', {},
            details.loading && h('div:text-sm text-gray-500', {}, 'טוען...'),
            details.error && h('div:text-sm text-red-600 whitespace-pre-wrap', {}, details.error),
            details.content,
            details.childSpec && hh(ctx, dsls.react['react-comp'].VizWidget,
              { spec: withTitleBadge(h, details.badgeKind, { width: drawerChildW, height: 300, ...details.childSpec }), runSql: drillSqlRunner(ctx) }),
            details.question && h('button:inline-flex items-center gap-2 rounded-full bg-[#61A60E] px-4 py-2 text-sm font-bold text-white',
              { onClick: () => send(details.question) }, h('L:MessageCircle', { size: 15 }), 'המשך בצ׳אט'))),
        activeView == 'chat' && details && h(
          'div:fixed top-0 bottom-0 z-50 w-2 cursor-col-resize touch-none bg-transparent hover:bg-[#61A60E]/20 transition-colors',
          { style: { left: drawerW - 4 }, onPointerDown: dragDetails }),
        activeView == 'chat' && h('nav:fixed top-0 left-0 right-0 z-40 px-4 py-3 bg-white/95 backdrop-blur border-b-2 border-[#61A60E]', { style: fixedStyle },
          h('div:mx-auto max-w-5xl flex items-center justify-between', {},
            // back = out of the chat to the main page (a fresh instance); on the main page there is nothing to go back to
            visibleMessages.length ? h('button:w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100', {
              onClick: newChat, 'aria-label': 'חזרה' },
              h('L:ChevronRight', { size: 20 })
            ) : h('div:w-10 h-10'),
            h('div:flex flex-col items-center gap-0.5', {},
              h('img:h-6 w-auto', { src: comaxLogo, alt: 'COMAX' }),
              h('div:text-[11px] font-semibold text-[#454343]', {}, visibleMessages.length ? `אנליטיקה · ${visibleMessages.length} הודעות` : 'אנליטיקה')),
            h('div:flex items-center gap-2', {},
              h('button:w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100',
                { onClick: newChat, title: 'צ׳אט חדש', 'aria-label': 'צ׳אט חדש' }, h('L:SquarePen', { size: 18 })),
              h('button:w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100', { onClick: share }, h('L:Share2', { size: 18 }))
            )
          )
        ),
        activeView == 'chat' && h(`div:fixed top-0 bottom-0 pt-20 ${visibleMessages.length ? 'pb-36' : 'pb-4'} overflow-y-auto overflow-x-hidden overscroll-contain`,
          { ref: listRef, style: fixedStyle },
        h('div:mx-auto max-w-5xl py-4', {},
            visibleMessages.length === 0 && hh(ctx, HomeInsights, {send, composer: composer({home: true})}),
            visibleMessages.map(e =>
              e.sender === 'Assistant'
                ? h('div', { key: e.id, id: `msg-${e.id}` }, hh(ctx,
                  e.type === 'humanFeedback' ? HumanFeedbackMessage : e.type === 'agentComparison' ? AgentComparison : AnalyticsAssistantResponse,
                  { element: e, send, openDetails, resolve: ids => resolveHumanFeedback(e, ids) }))
                : (() => {
                  const { nodes } = renderMessageContent(e, ctx)
                  return h('div', { key: e.id, id: `msg-${e.id}` },
                    h('div:flex justify-start px-5 sm:px-6 my-5', {}, h('div:flex flex-col items-start gap-1', {},
                      h('div:max-w-[min(28rem,82vw)] px-4 py-2.5 rounded-2xl bg-[#EBF4DE] text-[15px] leading-6',
                        { style: { color: colors.text } }, nodes || h('span:whitespace-pre-wrap', {}, e?.content || '')),
                      h('div:text-[11px] text-gray-400 px-1', {}, clock(e.time)))),
                    e.id == workingUserId && hh(ctx, WorkingIndicator))
                })()
            )
          )
        ),
        activeView == 'chat' && visibleMessages.length > 0 && h('div:fixed bottom-0 left-0 right-0 z-40 bg-[#F6F7F8]/85 backdrop-blur',
          { style: { ...fixedStyle, paddingBottom: 'env(safe-area-inset-bottom)' } },
          h('div:mx-auto max-w-3xl px-4 py-3', {},
            composer()
          )
        )
      )
    },
    enrichCtx: async (ctx, { roomId }) => {
      // maximum-scale=1 blocks the iOS focus-zoom on sub-16px inputs (leaves the page panned = horizontal scroll); pinch zoom stays enabled
      const viewportMeta = document.querySelector('meta[name=viewport]') || document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'viewport' }))
      viewportMeta.content = 'width=device-width, initial-scale=1, maximum-scale=1'
      roomId ||= ctx.vars.roomWUrl?.split('://')[1] || 'comaxDemo'   // published: the room serving the applet (comaxDemo); localhost dev: comax
      const p = new URLSearchParams(location.hash.replace(/^#/, '?'))
      const existingInstanceId = p.get('instanceId')
      const instanceId = existingInstanceId || formatTimeWithRandom()
      !existingInstanceId && setHashParam('instanceId', instanceId)
      const fullUrl = new URL(`${location.origin}${location.pathname}${location.search}`).toString()
      // share.indivi.ai blocks cross-origin staging calls, so published applets share their full URL
      const shareShortUrl = location.hostname == 'localhost' ? await createShortUrl(fullUrl) : fullUrl
      // block startup on login (staging/prod); localhost keeps the auto-minted dev admin token. oauth2 is browser-only - dynamic import keeps node tests loading.
      // on false ensureLogin rendered the LoginScreen - halt enrichCtx forever so the applet never mounts over it (sign-in navigates away)
      if (location.hostname != 'localhost' && !await (await import('@wonder/db/oauth2.js')).ensureLogin(ctx)) return new Promise(() => {})
      const roomCtx = ctx.setVars({ roomId, instanceId, userId: ctx.vars.userId || chatUser() })   // applets lack mobile-web-app's auth2.sub seeding
      const appCtx = roomCtx.setVars({ initChatElements: existingInstanceId && chatUser() ? await wGet(cts.privateChat, roomCtx) : [], shareShortUrl,
        analyticsWorkflow: p.get('workflow') || DEFAULT_WORKFLOW, comaxDataset: 'big', analyticsModel: p.get('model'),
        comaxView: p.get('view') || 'chat', isDebug: ctx.vars.isDebug || p.get('debug') != null, ...remoteVars() })
      // fire-and-forget warm: spin the compute container + extract the lambda closure while the user is still reading the home screen
      appCtx.vars.lambdaHost && runViaRoomLambda(appCtx, 'comaxSql', { $: 'data<common>duckDbSql', sql: 'select 1' })
      return appCtx
    },
    metadata: applet({ title: 'Comax ERP אנליטיקה', icon: 'BarChart3', showMessageInput: false })
  })
})

const buildAssistantPayload = wfres => {
  const { responseText, runRes, adminUrl } = wfres || {}
  const traceVars = Object.assign({}, ...((wfres?.workflowTrace) || []).map(e => e.setVars).filter(Boolean))
  const finalRes = runRes && typeof runRes == 'object' && !Array.isArray(runRes) ? runRes : traceVars.answer && { ...traceVars, text: traceVars.answer, widgets: [], followUps: [] }
  const { text, imageUrl } = finalRes || {}
  const visibleText = finalRes?.verificationWarning && text?.startsWith(finalRes.verificationWarning) ? text.slice(finalRes.verificationWarning.length).trim() : text
  const content = (typeof visibleText == 'string' && visibleText) || responseText || typeof runRes == 'string' && runRes || (imageUrl ? '' : '??')
  const type = imageUrl ? 'image' : finalRes?.type || runRes?.type || 'text'
  return { content, imageUrl, type, runRes: finalRes || runRes, adminUrl, llmGeneratedCode: wfres?.llmGeneratedCode,
    ...(wfres?.turnRecord && { turnRecord: wfres.turnRecord }), ...(finalRes ? pickFinalFields(finalRes) : {}) }
}

async function sendMessage({ txt, agents: agentIds, model, chatElements, setChatElements, ctx, setWorkingUserId }) {
  if (!txt?.trim()) return
  const ids = agentIds?.length ? agentIds : [ctx.vars.analyticsWorkflow || DEFAULT_WORKFLOW]
  const msg = { id: Math.random().toString(36).slice(2, 12), time: Date.now(), sender: 'User', content: txt, type: 'text' }
  const nextMsgs = [...chatElements, msg]
  setChatElements(nextMsgs)
  coreUtils.eventEmitter.emit('progress', {t: 'חושב...'})
  setWorkingUserId(msg.id)
  typeof requestAnimationFrame == 'function' && requestAnimationFrame(() => scrollToMsg(msg.id))
  chatUser() && await wAppend(cts.privateChat, msg, ctx)
  const upsertAssistant = m => setChatElements(xs => {
    const next = xs.some(x => x.id == m.id) ? xs.map(x => x.id == m.id ? { ...x, ...m } : x) : [...xs, m]
    wPut(cts.privateChat, next, ctx)
    return next
  })

  const onHumanFeedback = req => {
    const feedbackMsg = { id: req.id, requestId: req.id, time: Date.now(), sender: 'Assistant', content: req.question, ...req }
    setChatElements(xs => [...xs, feedbackMsg])
    chatUser() && wAppend(cts.privateChat, feedbackMsg, ctx)
  }
  coreUtils.eventEmitter.on('humanFeedbackRequest', onHumanFeedback)

  const chatHistory = buildChatHistory(chatElements.filter(Boolean))
  const clarifiedParams = chatElements.map(clarifiedParam).filter(Boolean)
  const ctxForWf = ctx.setVars({ chatElements: nextMsgs, setChatElements, userMessage: txt, ...localDb(ctx), comaxDataset: 'big',
    accumulatedContext: { chatHistory, clarifiedParams } })   // llmProxyUrl comes from serversByUrl: localhost route locally, automations server in cloud

  // Run the selected workflow(s) IN-BROWSER. duckDbSql offloads the duckdb call to /run-bash (the local server),
  // reading the signed-room parquet via httpfs; writeBigLog hits the localhost server. No publish.
  // Debug mode: several agents run in PARALLEL, each timed, and land as one collapsible comparison message.
  const runOne = async id => {
    const start = Date.now()
    try {
      const wfres = await dsls.workflow.workflow[id].$run(model ? { model } : {}).calcWorkflow(ctxForWf) || {}
      return { agent: id, durMs: Date.now() - start, payload: buildAssistantPayload(wfres) }
    } catch (e) { return { agent: id, durMs: Date.now() - start, error: String(e?.stack || e) } }
  }
  let assistantMsg
  try {
    const results = await Promise.all(ids.map(id => withDeadline(runOne(id), 150000, { agent: id, durMs: 150000, error: 'agent timeout' })))
    const base = { id: Math.random().toString(36).slice(2, 12), time: Date.now(), sender: 'Assistant' }
    assistantMsg = results.length === 1
      ? { ...base, durMs: results[0].durMs, ...(results[0].payload || { content: results[0].error || '??', type: 'text' }) }
      : { ...base, type: 'agentComparison', content: `השוואת ${results.length} סוכנים`, comparison: results }
    if (results.length === 1 && failedResult(results[0])) {
      const denied = /forbidden|login required/i.test(JSON.stringify(results[0] || ''))
      assistantMsg = { ...base, durMs: results[0].durMs, type: 'text',
        content: denied
          ? 'לחשבון המחובר אין הרשאה לנתוני חדר הדמו. יש להתחבר עם חשבון מורשה ולנסות שוב.'
          : FAILURE_TEXT,
        followUps: [{ label: 'הרץ שוב', question: txt }],
        ...(results[0].payload?.adminUrl && { adminUrl: results[0].payload.adminUrl }) }
    }
  } finally {
    coreUtils.eventEmitter.off('humanFeedbackRequest', onHumanFeedback)
    assistantMsg && upsertAssistant(assistantMsg)
    setWorkingUserId(null)
  }
}

function setHashParam(k, v) {
  const params = new URLSearchParams(location.hash.replace(/^#/, '?'))
  v == null ? params.delete(k) : params.set(k, v)
  window.location.hash = `#${params.toString()}`
}
