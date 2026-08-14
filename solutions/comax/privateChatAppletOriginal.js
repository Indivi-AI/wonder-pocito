import { dsls, coreUtils, jb } from '@jb6/core'
import '@wonder/db/db-drivers-utils.js'
import '@wonder/ui/ui-utils.js'
const { createShortUrl, formatTimeWithRandom, shareHandler, wAppend, wGet, wPut } = jb.wonderUtils
import '@wonder/applets/applet.js'
import './Agents/analytics-agent.js'   // registers the basicAnalytics workflow (run in-browser; its duckDbSql offloads duckdb to /run-bash)
import './nostalgy/reports-based-agent.js'
import './Agents/reports-template-agent.js'   // registers reportsTemplateAnalytics (LLM fills slots, runtime owns the report flow)
import './Agents/fast-report-agent.js'   // registers fast-report (quick report widgets + delayed LLM summary)
import './nostalgy/structured-reports-template-agent.js'   // registers structuredReportsTemplateAnalytics (summary + collapsed report sections)
import './Agents/parallel-agent.js'   // registers the comaxAgentPanel workflow (runs both agents in parallel + judge)
import './nostalgy/retrieval-analytics-agent.js'   // registers the retrievalAnalytics workflow (RAG over verified-questions.md)
import './Agents/agentic-agents.js'   // registers verifiedAnalytics (critic loop) + agenticAnalytics (replan-tailed flow)
import './Agents/agents-repo.js'   // Data('comaxAnalyticsAgents') — the selectable-agents repo
import '@wonder/ui/viz/viz-index.js'   // VizWidget + all inline chart widgets the assistant can emit
import { comaxDrillQuestion, comaxFixDrillSql } from './Comps/drill-helpers.js'
import { comaxLogo, comaxFontCss } from './Comps/comax-brand.js'

const {
  react: { ReactComp,
    'react-comp': { comp },
    'react-metadata': { applet }
  },
  wonder: { 'content-type': cts },
} = dsls

const availableAgents = () => dsls.common.data.comaxAnalyticsAgents.$run()
// debug-mode model picker: label → the model id the workflow receives as its `model` param
const MODELS = [
  ['Gemini Flash 3.5', 'gemini/gemini-3.5-flash'],
  ['GPT-5.5', 'openai/gpt-5.5'],
  ['GPT-5.4', 'openai/gpt-5.4'],
  ['GPT-5.4 mini', 'openai/gpt-5.4-mini']
]
const todayFocus = [
  ['מכירות היום', 'TrendingUp', 'מול יום דומה וסניפים מובילים', 'בדוק את המכירות היום מול יום דומה: איפה אנחנו מעל או מתחת לקצב?'],
  ['מבצעים פעילים', 'BadgePercent', 'מה מוכר, מה תקוע ומה נשחק', 'איך המבצעים הפעילים מתפקדים היום במכירות, רווחיות ומלאי?'],
  ['מכירות במבצע', 'ShoppingBasket', 'נתח פדיון שמגיע מהנחות', 'כמה מהמכירות היום הגיעו ממבצעים, ובאילו קטגוריות זה עובד הכי טוב?'],
  ['רווחיות מבצעים', 'CircleDollarSign', 'מי משתלם ומי שורף מרווח', 'אילו מבצעים שוחקים רווחיות ומה כדאי לשנות היום?']
]
const suggestedQueries = [
  'איך המבצעים מתפקדים היום?',
  'איזה מבצע מוכר הכי טוב?',
  'אילו מבצעים חלשים?',
  'השווה מכירות במבצע מול מחיר רגיל',
  'אילו פריטי מבצע בסיכון חוסר מלאי?',
  'אילו מבצעים מסתיימים בקרוב?',
  'איפה ההנחה עמוקה מדי?',
  'מה שלוש הפעולות הכי חשובות היום?'
]
const cockpit = (h, send) => h('div:max-w-5xl mx-auto px-5 sm:px-6 pt-6 sm:pt-10 pb-10', {},
  h('div:flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6', {},
    h('div', {},
      h('img:hidden sm:block h-9 w-auto', { src: comaxLogo, alt: 'COMAX' }),
      h('h1:sm:mt-4 text-3xl font-bold tracking-tight text-[#454343]', {}, 'מה זז היום?'),
      h('p:mt-2 max-w-2xl text-sm leading-6 text-gray-600', {}, 'תמונה מהירה של מכירות, מבצעים פעילים, רווחיות ומלאי במבצע.')),
    h('div:flex items-center gap-2 rounded-full bg-[#61A60E] px-5 py-3 text-sm font-bold text-white shadow-sm', {}, h('L:Sparkles', { size: 16 }), 'מוקד היום: מבצעים')),
  h('div:grid grid-cols-2 lg:grid-cols-4 gap-3', {}, todayFocus.map(([domain, icon, hint, q]) =>
    h('button:text-right rounded-lg border border-gray-200 bg-white p-3 sm:p-4 shadow-sm hover:border-gray-300 hover:shadow-md transition-all', { key: domain, onClick: () => send(q) },
      h('div:flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3', {},
        h('span:w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[#61A60E] text-white flex items-center justify-center shrink-0', {}, h(`L:${icon}`, { size: 18 })),
        h('span', {}, h('span:block text-sm sm:text-base font-semibold text-[#454343]', {}, domain), h('span:block mt-1 text-[11px] sm:text-xs leading-5 text-gray-500', {}, hint))),
      h('span:mt-3 sm:mt-4 inline-flex items-center gap-1 text-xs sm:text-sm font-bold text-[#61A60E]', {}, 'בדוק עכשיו', h('L:ArrowLeft', { size: 14 }))))),
  h('div:mt-6', {},
    h('div:mb-2 text-xs font-bold text-gray-500', {}, 'שאלות מומלצות'),
    h('div:flex flex-wrap gap-2', {}, suggestedQueries.map(q =>
      h('button:rounded-full border border-[#61A60E]/30 bg-white px-3 py-2 text-sm font-semibold text-[#4a7f0b] hover:bg-[#61A60E]/10 transition-colors', { key: q, onClick: () => send(q) }, q)))))

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
  const res = await dsls.common.data.duckDbSql.$runWithCtx(ctx.setVars({ db: 'local' }), comaxFixDrillSql(sql))
  const rows = typeof res == 'string' ? JSON.parse(res || '[]') : res
  if (rows?.error) throw new Error(rows.error)
  return rows
}
const pickFinalFields = o => Object.fromEntries('pollQuestion pollOptions pollVotes selectedOption host applet widgets reactComps narrative sql rows followUps parts partsLayout'.split(' ').map(k => [k, o?.[k]]).filter(([,v]) => v !== undefined))
const fmtRowVal = v => v == null ? '' : typeof v == 'number' ? v.toLocaleString('he-IL', { maximumFractionDigits: 2 }) : String(v)
const rowVal = (ctx, rows, exp) => { try { return fmtRowVal(coreUtils.compileJb(exp.trim())(ctx.setVars({ rows })).next().value) } catch { return null } }
const fillRows = (ctx, rows, s) => !Array.isArray(rows) || typeof s != 'string' ? s : s
  .replace(/\$\(\(([\s\S]*?)\)\)/g, (m, exp) => { const v = rowVal(ctx, rows, exp); return v == null ? m : `$${v}` })
  .replace(/\(\(([\s\S]*?\$rows[\s\S]*?)\)\)/g, (m, exp) => rowVal(ctx, rows, exp) ?? m)
  .replace(/\((\$rows\[\d+\]\.[a-zA-Z_]\w*)\)/g, (m, exp) => rowVal(ctx, rows, exp) ?? m)
const fillObjRows = (ctx, rows, v) => typeof v == 'string' ? fillRows(ctx, rows, v) : Array.isArray(v) ? v.map(x => fillObjRows(ctx, rows, x)) : v && typeof v == 'object' ? Object.fromEntries(Object.entries(v).map(([k,x]) => [k, fillObjRows(ctx, rows, x)])) : v
const clock = t => t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''

const AnalyticsAssistantResponse = ReactComp('AnalyticsAssistantResponse', {
  impl: comp({
    hFunc: (ctx, { isDebug, colors = { text: '#111827' }, react: { h, hh, useState } }) => ({ element, send, openDetails }) => {
      const rows = Array.isArray(element?.rows) ? element.rows : []
      const shownElement = { ...element, ...fillObjRows(ctx, rows, { content: element?.content, narrative: element?.narrative, parts: element?.parts }) }
      const { nodes, hostContent } = renderMessageContent(shownElement, ctx)
      const adminUrl = element?.adminUrl
      const showAdminLink = (isDebug || element?.content === '??') && adminUrl
      const widgets = (Array.isArray(element?.widgets) ? element.widgets : [])
        .slice().sort((a, b) => (a?.kind == 'table') - (b?.kind == 'table'))   // charts first, tables after (stable within each group)
      const reactComps = Array.isArray(element?.reactComps) ? element.reactComps : []
      const followUps = Array.isArray(element?.followUps) ? element.followUps : []
      const parts = Array.isArray(shownElement?.parts) ? shownElement.parts : []
      const collapsedParts = shownElement?.partsLayout == 'collapsedSections' && parts.length
      const { narrative, sql } = shownElement || {}
      const VizWidget = dsls.react['react-comp'].VizWidget
      const renderReactComp = (spec, i) => {
        const Cmp = spec?.cmpId && dsls.react['react-comp'][spec.cmpId]
        return Cmp && h('div:min-w-0 overflow-hidden', { key: i }, hh(ctx, Cmp, { spec, send, openDetails }))
      }
      const openDrill = async (spec, e) => {
        const d = coreUtils.asArray(spec?.drill).find(x => x?.sql || x?.question), fill = s => s && jb.vizUtils.fillDrill(s, e), title = fill(d?.title) || e?.name || spec?.title || 'פירוט'
        if (d?.sql) {
          openDetails({ title, loading: true, question: fill(d.question) })
          try { const rows = await drillSqlRunner(ctx)(fill(d.sql)), kind = d.kind || spec.kind || 'table'
            openDetails({ title, question: fill(d.question), childSpec: { kind, title, valueFormat: d.valueFormat, ...jb.vizUtils.rowsToSpec(kind, rows) } })
          } catch (err) { openDetails({ title, error: String(err?.message || err) }) }
        } else {
          const q = e.type == 'question' && e.question || comaxDrillQuestion(spec, e)
          q && openDetails({ title, question: q })
        }
      }
      const drawerSpec = spec => { const { drill, ...s } = spec; return s }
      const [showData, setShowData] = useState(false)
      const [depth, setDepth] = useState(0)
      const cols = Array.isArray(rows) && rows.length ? Object.keys(rows[0]).map(k => ({ key: k, label: k })) : []
      return h('div:w-full max-w-3xl mx-auto px-5 sm:px-6 py-3', {},
        narrative && h('div:mb-4 text-sm text-gray-500 leading-6', {}, narrative),
        collapsedParts
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
          : h('div:text-[16px] leading-7 text-gray-900', { style: { color: colors.text, overflowWrap: 'anywhere' } }, nodes),
        parts.length > 0 && !collapsedParts && h('div:mt-3 flex items-center gap-3 text-xs text-gray-500', {},
          h('input:flex-1 min-w-0 accent-[#61A60E]', { type: 'range', min: 0, max: 2, value: depth, onInput: e => setDepth(+e.target.value), 'aria-label': 'אורך תשובה' }),
          h('button:px-2.5 py-1.5 rounded-full border border-gray-200 bg-white text-gray-700 disabled:text-gray-400 inline-flex items-center gap-1', { disabled: depth == 2, onClick: () => setDepth(Math.min(2, depth + 1)) },
            h('L:ChevronDown', { size: 13 }), depth == 2 ? 'עמוק' : 'העמק')),
        reactComps.length > 0 && h('div:mt-5 space-y-4 overflow-x-hidden', {}, reactComps.map(renderReactComp).filter(Boolean)),
        !reactComps.length && widgets.length > 0 && h('div:mt-5 space-y-5 overflow-x-hidden', {},
          widgets.map((spec, i) => h('div:min-w-0 overflow-x-auto', { key: i },
            hh(ctx, VizWidget, { spec: { width: 680, height: 340, ...(openDetails ? drawerSpec(spec) : spec) }, runSql: drillSqlRunner(ctx),
              onEvent: openDetails ? e => openDrill(spec, e) : send && (e => { const q = e.type == 'question' && e.question || comaxDrillQuestion(spec, e); q && send(q) }) })))),
        followUps.length > 0 && h('div:mt-3 flex flex-wrap gap-2', {}, followUps.map((f, i) =>
          h('button:px-3 py-1.5 text-sm rounded-full border border-[#61A60E]/40 bg-white text-[#4a7f0b] hover:bg-[#61A60E]/10 transition-colors', {
            key: i, onClick: () => send?.(f.question) }, f.label || f.question))),
        (sql || (Array.isArray(rows) && rows.length)) && h('div:mt-3', {},
          h('button:text-xs text-gray-500 hover:text-gray-700 inline-flex items-center gap-1', { onClick: () => setShowData(v => !v) },
            h('L:Database', { size: 12 }), showData ? 'הסתר SQL / נתונים' : 'הצג SQL / נתונים'),
          showData && h('div:mt-2 space-y-2', {},
            sql && h('pre:text-xs bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-x-auto whitespace-pre text-gray-700', {}, sql),
            cols.length > 0 && hh(ctx, VizWidget, { spec: { kind: 'table', columns: cols, rows: rows.slice(0, 50) } }))),
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
    hFunc: (ctx, { react: { h, useEffect, useRef, useState } }) => ({ send, disabled, selected, setSelected, multi, model = '', setModel = () => {} }) => {
      const [txt, setTxt] = useState(''), [open, setOpen] = useState(false), ref = useRef(null), canSend = !!txt.trim() && !disabled
      const agents = availableAgents(), byId = Object.fromEntries(agents.map(a => [a.id, a]))
      useEffect(() => { const el = ref.current; if (el) el.style.height = 'auto', el.style.height = `${Math.min(el.scrollHeight, 176)}px` }, [txt])
      const submit = () => canSend && (send(txt), setTxt(''))
      const toggle = id => multi
        ? setSelected(s => s.includes(id) ? (s.length > 1 ? s.filter(x => x != id) : s) : [...s, id])
        : (setSelected([id]), setOpen(false))
      const label = (selected || []).map(id => byId[id]?.label || id).join(' + ') || 'סוכן'
      return h('div:rounded-[22px] border border-gray-200 bg-white shadow-[0_10px_35px_rgba(0,0,0,0.09)] overflow-visible', {},
        h('div:flex items-end gap-2 p-2', {},
          h('textarea:flex-1 min-h-[48px] max-h-44 resize-none bg-transparent px-3 py-3 text-[15px] leading-6 text-gray-900 placeholder:text-gray-400 focus:outline-none', {
            ref, value: txt, dir: 'rtl', rows: 1, placeholder: 'שאלו על נתוני Comax ERP...',
            onInput: e => setTxt(e.target.value),
            onKeyDown: e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), submit())
          }),
          h('button:w-10 h-10 mb-1 flex items-center justify-center rounded-full bg-[#61A60E] text-white disabled:bg-gray-200 disabled:text-gray-400 transition-colors', { disabled: !canSend, onClick: submit, 'aria-label': 'שליחה' },
            h('L:ArrowUp', { size: 17, strokeWidth: 3 }))),
        h('div:relative px-3 pb-2 flex flex-wrap items-center gap-2', {},
          open && h('div:fixed inset-0 z-40', { onClick: () => setOpen(false) }),
          multi && h('select:px-2.5 py-1.5 rounded-full border border-gray-200 bg-white text-xs font-medium text-gray-700 max-w-[9.5rem]', {
            value: model, onChange: e => setModel(e.target.value), title: 'מודל (דיבאג)', 'aria-label': 'בחירת מודל' },
            [h('option', { key: '_default', value: '' }, 'מודל ברירת מחדל'), ...MODELS.map(([lbl, id]) => h('option', { key: id, value: id }, lbl))]),
          h('button:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 bg-white text-gray-700 hover:border-gray-300 transition-colors', {
            onClick: () => setOpen(v => !v), 'aria-label': 'בחירת סוכן', 'aria-expanded': open },
            h('L:Bot', { size: 13 }), label,
            multi && h('span:text-[10px] text-amber-600 font-semibold', {}, 'דיבאג'),
            h('L:ChevronDown', { size: 14, className: `transition-transform ${open ? 'rotate-180' : ''}` })),
          open && h('div:absolute bottom-full right-3 mb-2 w-72 rounded-2xl border border-gray-200 bg-white shadow-xl p-1.5 z-50', {},
            agents.map(a => { const on = (selected || []).includes(a.id)
              return h(`button:w-full text-right px-3 py-2 rounded-xl flex items-start gap-2 transition-colors ${on ? 'bg-[#61A60E]/10' : 'hover:bg-gray-50'}`, { key: a.id, onClick: () => toggle(a.id) },
                multi
                  ? h(`span:mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-[#61A60E] border-[#61A60E] text-white' : 'border-gray-300'}`, {}, on && h('L:Check', { size: 11, strokeWidth: 3 }))
                  : h(`span:mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${on ? 'border-[#61A60E]' : 'border-gray-300'}`, {}, on && h('span:w-2 h-2 rounded-full bg-[#61A60E]')),
                h('span:flex-1', {},
                  h('span:block text-sm font-medium text-gray-800', {}, a.label),
                  h('span:block text-xs text-gray-500', {}, a.hint)))
            }),
            multi && h('div:px-3 py-1.5 text-[10px] text-gray-400 border-t border-gray-100 mt-1', {}, 'מצב דיבאג: בחרו כמה סוכנים להשוואה מקבילה'))),
        h('div:flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400', {},
          h('img:h-4 w-auto', { src: comaxLogo, alt: 'COMAX' }),
          h(disabled ? 'div' : 'div:text-[#61A60E] font-bold', {}, disabled ? 'עובד' : 'מוכן')))
    }
  })
})

const detailLabel = {stock: 'מלאי', weekly_sales_avg: 'מכירות שבועיות', current_price: 'מחיר', last_sale_date: 'תאריך אחרון', receipts: 'קבלות'}
const feedbackDetails = o => o?.summary || Object.entries(o?.details || {}).map(([k, v]) => `${detailLabel[k] || k}: ${fmtRowVal(v)}`).join(' · ')
const feedbackNoun = e => ({product: 'products', products: 'products', branch: 'branches', branches: 'branches'}[String(e.entity || e.varName || '').replace(/^selected/i, '').toLowerCase()] || 'options')
const feedbackIds = e => e.selectedIds || e.ids || e.value?.ids || (Array.isArray(e.value) ? e.value : [])
const feedbackItems = (e, ids) => {
  const opts = Object.fromEntries((e.options || []).map(o => [String(o.id), o])), items = coreUtils.asArray(e.items || e.value?.items), labels = coreUtils.asArray(e.labels || e.value?.labels)
  return (ids.length ? ids : items.length ? items.map(x => x.id) : labels).map((id, i) => opts[String(id)] || items.find(x => String(x.id) == String(id)) || {id, label: labels[i] || id}).filter(Boolean)
}
const clarifiedParam = e => {
  const items = e?.type == 'humanFeedback' && e.resolved && feedbackItems(e, feedbackIds(e))
  return items?.length ? { varName: e.varName, question: e.question, ids: items.map(x => x.id), labels: items.map(x => x.label || x.name || String(x.id)) } : null
}
const xmlText = s => String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))
const viewedValues = a => coreUtils.asArray(a).slice(0, 30).map(x => x?.label != null || x?.name != null || x?.value != null ? [x.label ?? x.name, x.value] : x?.x != null || x?.y != null ? [x.x, x.y] : x)
const viewedBlock = w => {
  const kind = {bar:'InlineBarPlot',hbar:'InlineBarPlot',pie:'InlinePiePlot',line:'InlineLinePlot',area:'InlineLinePlot',table:'InlineTable',kpi:'InlineKpis'}[w?.kind] || 'InlineWidget'
  const body = w?.data ? ['values', viewedValues(w.data)] : w?.rows ? ['rows', coreUtils.asArray(w.rows).slice(0, 30)] : w?.items ? ['values', viewedValues(w.items)] : w?.series ? ['series', w.series] : []
  return body.length ? `<${kind}>\n<title>${xmlText(w.title)}</title>\n<${body[0]}>${JSON.stringify(body[1])}</${body[0]}>\n</${kind}>` : ''
}
const viewedData = m => {
  const blocks = coreUtils.asArray(m.widgets).map(viewedBlock).filter(Boolean)
  return blocks.length ? `<ViewedData>\n${blocks.join('\n')}\n</ViewedData>` : ''
}
const chatHistoryEntry = m => {
  const c = clarifiedParam(m)
  const vd = m.sender === 'Assistant' && viewedData(m)
  return c ? { role: 'user', content: `Clarified ${c.varName}: ${c.labels.join(', ')} (ids: ${c.ids.join(',')})`, clarifiedParam: c }
    : { role: m.sender === 'Assistant' ? 'assistant' : 'user', content: m.content, ...(vd && { viewedData: vd }), ...(m.sql && { sql: m.sql }), ...(m.llmGeneratedCode && { llmFlow: m.llmGeneratedCode }) }
}
const HumanFeedbackMessage = ReactComp('HumanFeedbackMessage', {
  impl: comp({
    hFunc: (ctx, { react: { h, useState } }) => ({ element, resolve }) => {
      const [ids, setIds] = useState(feedbackIds(element)), [open, setOpen] = useState(false), multi = element.mode == 'multi', done = element.resolved
      const has = (xs, id) => xs.some(x => String(x) == String(id)), toggle = id => !done && setIds(xs => multi ? (has(xs, id) ? xs.filter(x => String(x) != String(id)) : [...xs, id]) : [id])
      const selected = feedbackItems(element, ids)
      return h('div:w-full max-w-3xl mx-auto px-5 sm:px-6 py-3', {},
        h('div:bg-white border border-gray-200 rounded-2xl p-4 shadow-sm', {},
          h('div:flex items-center gap-2 mb-3 text-sm font-semibold text-gray-900', {}, h('L:ListChecks', { size: 16 }), element.question),
          done
            ? h('div:space-y-2', {},
              selected.length > 0 && h('div:flex flex-wrap gap-2', {}, selected.map(o =>
                h('span:inline-flex items-center gap-1 rounded-full bg-[#61A60E]/10 px-2.5 py-1 text-xs font-semibold text-[#4a7f0b]', { key: o.id }, h('L:Check', { size: 12 }), o.label || o.name || o.id))),
              h('button:inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700', { onClick: () => setOpen(x => !x), 'aria-expanded': open },
                h('L:ChevronDown', { size: 13, className: `transition-transform ${open ? 'rotate-180' : ''}` }), `${element.autoResolved ? 'נבחר אוטומטית · ' : ''}selected ${selected.length} ${feedbackNoun(element)}`),
              open && h('div:space-y-1', {}, selected.map(o => h('div:rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700', { key: o.id },
                h('div:font-medium text-gray-800 break-words', {}, o.label || o.name || o.id),
                feedbackDetails(o) && h('div:text-xs text-gray-500 mt-0.5 break-words', {}, feedbackDetails(o))))))
            : h('div:space-y-2', {}, (element.options || []).map(o => {
            const on = has(ids, o.id)
            return h(`button:w-full text-right rounded-xl border p-3 transition-colors ${on ? 'border-[#61A60E] bg-[#61A60E]/10' : 'border-gray-200 hover:bg-gray-50'}`, { key: o.id, onClick: () => toggle(o.id) },
              h('div:flex items-start gap-3', {},
                h(`span:mt-0.5 w-5 h-5 rounded ${multi ? 'border' : 'rounded-full border'} flex items-center justify-center shrink-0 ${on ? 'bg-[#61A60E] border-[#61A60E] text-white' : 'border-gray-300'}`, {}, on && h('L:Check', { size: 13, strokeWidth: 3 })),
                h('span:min-w-0 flex-1', {},
                  h('span:block font-medium text-gray-900 break-words', {}, o.label || o.name || o.id),
                  h('span:block text-xs text-gray-500 mt-1 break-words', {}, feedbackDetails(o))))) })),
          !done && h('button:mt-3 px-4 py-2 rounded-full bg-[#61A60E] text-white text-sm font-semibold disabled:bg-gray-200 disabled:text-gray-400', { disabled: !ids.length, onClick: () => resolve(ids) }, 'המשך')))
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
            h('button:w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-gray-50 transition-colors', { onClick: () => setClosed(c => ({ ...c, [it.agent]: isOpen })) },
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

ReactComp('comaxDemoOriginalApplet', {
  impl: comp({
  hFunc: (ctx, { roomId, isDebug, colors = { text: '#111827' }, wonderMain, initChatElements, shareShortUrl
    , react: { h, hh, useRef, useState, useEffect } }) => () => {
      
      const listRef = useRef(null)
      const didInitialScroll = useRef(false)
      const [streamingState, setStreamingState] = useState({ text: '', isTyping: false })
      const [chatElements, setChatElements] = useState(initChatElements || [])
      const [selected, setSelected] = useState([ctx.vars.analyticsWorkflow || 'basicAnalytics'])
      const [model, setModel] = useState(ctx.vars.analyticsModel || '')
      const [typedStatus, setTypedStatus] = useState('')
      const [newTextId, setNewTextId] = useState(null)
      const [details, setDetails] = useState(null), [detailsW, setDetailsW] = useState(430)
      const typedStatusRef = useRef('')
      const typingTimerRef = useRef(0)
      const vw = globalThis.innerWidth || 1200, maxDetailsW = vw < 640 ? vw : Math.max(260, Math.min(720, vw - 64)), drawerW = Math.min(detailsW, maxDetailsW)
      const shift = details ? drawerW : 0
      const mainHidden = details && vw < 640, fixedStyle = mainHidden ? { display: 'none' } : { left: shift, transition: 'left .3s ease' }
      const openDetails = d => (d?.width && setDetailsW(d.width), setDetails(d))
      const dragDetails = e => {
        e.preventDefault()
        const move = ev => setDetailsW(Math.max(260, Math.min(maxDetailsW, ev.clientX)))
        const up = () => (removeEventListener('pointermove', move), removeEventListener('pointerup', up))
        addEventListener('pointermove', move); addEventListener('pointerup', up)
      }

      useEffect(() => setChatElements(initChatElements || []), [initChatElements])
      useEffect(() => { typedStatusRef.current = typedStatus }, [typedStatus])
      useEffect(() => {
        clearTimeout(typingTimerRef.current)
        const target = streamingState.isTyping ? (streamingState.text || 'חושב...') : ''
        if (!target) return setTypedStatus('')
        const start = target.startsWith(typedStatusRef.current) ? typedStatusRef.current : ''
        const step = () => {
          if (!streamingState.isTyping) return
          const next = target.slice(0, Math.min(target.length, typedStatusRef.current.length + 3))
          setTypedStatus(next)
          if (next.length < target.length) typingTimerRef.current = setTimeout(step, 25)
        }
        setTypedStatus(start)
        typingTimerRef.current = setTimeout(step, 25)
        return () => clearTimeout(typingTimerRef.current)
      }, [streamingState.isTyping, streamingState.text])
      const send = (txt) => sendMessage({ txt, agents: selected, model, chatElements, setChatElements, ctx, setStreamingState, setNewTextId })
      const resolveHumanFeedback = (element, ids) => {
        coreUtils.eventEmitter.emit('humanFeedbackResolve', { requestId: element.requestId || element.id, ids })
        setChatElements(xs => {
          const next = xs.map(x => x.id == element.id ? { ...x, selectedIds: ids, resolved: true } : x)
          wPut(cts.privateChat, next, ctx)
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

      return h('div:comax-brand min-h-screen bg-[#F6F7F8] text-gray-900 overflow-x-hidden', { dir: 'rtl', lang: 'he' },
        h('style', {}, comaxFontCss),
        details && h('aside:fixed top-0 bottom-0 left-0 z-40 bg-white border-r border-gray-200 shadow-xl flex flex-col', { style: { width: drawerW, paddingTop: 68 } },
          h('div:flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100', {},
            h('div:min-w-0 text-sm font-bold text-gray-900 truncate', {}, details.title || 'פירוט'),
            h('button:w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center', { onClick: () => setDetails(null), 'aria-label': 'סגור פירוט' }, h('L:X', { size: 16 }))),
          h('div:flex-1 min-h-0 overflow-auto p-4 space-y-3', {},
            details.loading && h('div:text-sm text-gray-500', {}, 'טוען...'),
            details.error && h('div:text-sm text-red-600 whitespace-pre-wrap', {}, details.error),
            details.content,
            details.childSpec && hh(ctx, dsls.react['react-comp'].VizWidget, { spec: { width: Math.max(260, drawerW - 32), height: 300, ...details.childSpec }, runSql: drillSqlRunner(ctx) }),
            details.question && h('button:inline-flex items-center gap-2 rounded-full bg-[#61A60E] px-4 py-2 text-sm font-bold text-white', { onClick: () => send(details.question) }, h('L:MessageCircle', { size: 15 }), 'המשך בצ׳אט'))),
        details && h('div:fixed top-0 bottom-0 z-50 w-2 cursor-col-resize touch-none bg-transparent hover:bg-[#61A60E]/20 transition-colors', { style: { left: drawerW - 4 }, onPointerDown: dragDetails }),
        h('nav:fixed top-0 left-0 right-0 z-50 px-4 py-3 bg-white/95 backdrop-blur border-b-2 border-[#61A60E]', { style: fixedStyle },
          h('div:mx-auto max-w-5xl flex items-center justify-between', {},
            h('button:w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100', { 
              onClick: () => wonderMain?.back?.() || wonderMain?.backToMain?.() },
              h('L:ChevronRight', { size: 20 })
            ),
            h('div:flex flex-col items-center gap-0.5', {},
              h('img:h-6 w-auto', { src: comaxLogo, alt: 'COMAX' }),
              h('div:text-[11px] font-semibold text-[#454343]', {}, visibleMessages.length ? `אנליטיקה · ${visibleMessages.length} הודעות` : 'אנליטיקה')),
            h('div:flex items-center gap-2', {},
              h('button:w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100', { onClick: newChat, title: 'צ׳אט חדש', 'aria-label': 'צ׳אט חדש' }, h('L:SquarePen', { size: 18 })),
              h('button:w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100', { onClick: share }, h('L:Share2', { size: 18 }))
            )
          )
        ),
        h('div:pt-20 pb-36 overflow-y-auto overflow-x-hidden', { ref: listRef, style: { height: '100vh', marginLeft: shift, width: `calc(100vw - ${shift}px)`, transition: 'margin-left .3s ease,width .3s ease', ...(mainHidden && { display: 'none' }) } },
          h('div:mx-auto max-w-5xl py-4', {},
            visibleMessages.length === 0 && cockpit(h, send),
            visibleMessages.map(e =>
              e.sender === 'Assistant'
                ? h('div', { key: e.id, id: `msg-${e.id}` }, hh(ctx, e.type === 'humanFeedback' ? HumanFeedbackMessage : e.type === 'agentComparison' ? AgentComparison : AnalyticsAssistantResponse, { element: e, send, openDetails, resolve: ids => resolveHumanFeedback(e, ids) }))
                : (() => {
                  const { nodes } = renderMessageContent(e, ctx)
                  return h('div:flex justify-start px-5 sm:px-6 my-5', { key: e.id, id: `msg-${e.id}` },
                    h('div:flex flex-col items-start gap-1', {},
                      h('div:max-w-[min(28rem,82vw)] px-4 py-2.5 rounded-2xl bg-[#EBF4DE] text-[15px] leading-6', { style: { color: colors.text } },
                        nodes || h('span:whitespace-pre-wrap', {}, e?.content || '')),
                      h('div:text-[11px] text-gray-400 px-1', {}, clock(e.time)))
                  )
                })()
            ),
            streamingState.isTyping && (
              h('div:max-w-3xl mx-auto px-5 sm:px-6 py-4', {},
                h('div:flex items-center gap-3 text-gray-500', {},
                  h('div:w-8 h-8 rounded-full bg-white border border-gray-200 text-[#61A60E] flex items-center justify-center', {}, h('L:Sparkles', { size: 14, className: 'animate-pulse' })),
                  h('div:flex-1 min-w-0', {},
                    h('div:text-sm italic truncate', {}, typedStatus || 'חושב...'),
                    h('div:mt-2 h-1 w-24 rounded-full bg-gray-200 overflow-hidden', {}, h('div:h-full w-1/2 rounded-full bg-[#61A60E] animate-pulse')))))
            )
          )
        ),
        newTextId && !mainHidden && h('button:fixed left-1/2 -translate-x-1/2 bottom-28 sm:bottom-24 z-50 max-w-[calc(100vw-2rem)] inline-flex items-center gap-2 rounded-full bg-[#61A60E] px-4 py-2 text-sm font-bold text-white shadow-lg animate-pulse', {
          style: { left: `calc(${shift}px + (100vw - ${shift}px) / 2)` },
          onClick: () => (document.getElementById(`msg-${newTextId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), setNewTextId(null))
        }, h('L:ArrowDown', { size: 16 }), 'התשובה מוכנה'),
        h('div:fixed bottom-0 left-0 right-0 z-40 bg-[#F6F7F8]/85 backdrop-blur', { style: { ...fixedStyle, paddingBottom: 'env(safe-area-inset-bottom)' } },
          h('div:mx-auto max-w-3xl px-4 py-3', {},
            hh(ctx, AnalyticsComposer, { send, disabled: streamingState.isTyping, selected, setSelected, multi: !!isDebug,
              model, setModel: v => { setModel(v); setHashParam('model', v) } })
          )
        )
      )
    },
    enrichCtx: async (ctx, { roomId }) => {
      roomId ||= 'comaxDemo'
      const p = new URLSearchParams(location.hash.replace(/^#/, '?'))
      const instanceId = p.get('instanceId') || formatTimeWithRandom()
      !p.get('instanceId') && setHashParam('instanceId', instanceId)
      const shareShortUrl = await createShortUrl(new URL(`${location.origin}${location.pathname}${location.search}`).toString())
      const roomCtx = ctx.setVars({ roomId, instanceId })
      return roomCtx.setVars({ initChatElements: await wGet(cts.privateChat, roomCtx), shareShortUrl, analyticsWorkflow: p.get('workflow'), comaxDataset: 'big', analyticsModel: p.get('model'), isDebug: ctx.vars.isDebug || p.get('debug') != null })
    },
    metadata: applet({ title: 'Comax Demo - Original', icon: 'BarChart3', showMessageInput: false })
  })
})

const buildAssistantPayload = wfres => {
  const { responseText, runRes, adminUrl } = wfres || {}
  const traceVars = Object.assign({}, ...((wfres?.workflowTrace) || []).map(e => e.setVars).filter(Boolean))
  const finalRes = runRes && typeof runRes == 'object' && !Array.isArray(runRes) ? runRes : traceVars.answer && { ...traceVars, text: traceVars.answer, widgets: [], followUps: [] }
  const { text, imageUrl } = finalRes || {}
  const content = responseText || (typeof text == 'string' && text) || typeof runRes == 'string' && runRes || (imageUrl ? '' : '??')
  const type = imageUrl ? 'image' : finalRes?.type || runRes?.type || 'text'
  return { content, imageUrl, type, runRes: finalRes || runRes, adminUrl, llmGeneratedCode: wfres?.llmGeneratedCode, ...(finalRes ? pickFinalFields(finalRes) : {}) }
}

async function sendMessage({ txt, agents: agentIds, model, chatElements, setChatElements, ctx, setStreamingState, setNewTextId = () => {} }) {
  if (!txt?.trim()) return
  const ids = agentIds?.length ? agentIds : [ctx.vars.analyticsWorkflow || 'basicAnalytics']
  let partialId = null
  const msg = { id: Math.random().toString(36).slice(2, 12), time: Date.now(), sender: 'User', content: txt, type: 'text' }
  const nextMsgs = [...chatElements, msg]
  setNewTextId(null)
  setChatElements(nextMsgs)
  setStreamingState({ text: '', isTyping: true })
  typeof requestAnimationFrame == 'function' && requestAnimationFrame(() =>
    document.getElementById(`msg-${msg.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  await wAppend(cts.privateChat, msg, ctx)
  const upsertAssistant = m => setChatElements(xs => {
    const next = xs.some(x => x.id == m.id) ? xs.map(x => x.id == m.id ? { ...x, ...m } : x) : [...xs, m]
    wPut(cts.privateChat, next, ctx)
    return next
  })

  const onProgress = e => e?.t && setStreamingState({ text: e.t, isTyping: true })   // in-browser flow status → typing indicator (logger.status → eventEmitter 'progress')
  const onFastPartial = payload => {
    if (ids.length != 1 || ids[0] != 'fast-report') return
    partialId = partialId || Math.random().toString(36).slice(2, 12)
    upsertAssistant({ id: partialId, time: Date.now(), sender: 'Assistant', ...buildAssistantPayload({ runRes: payload }) })
  }
  const onHumanFeedback = req => {
    const feedbackMsg = { id: req.id, requestId: req.id, time: Date.now(), sender: 'Assistant', content: req.question, ...req }
    setChatElements(xs => [...xs, feedbackMsg])
    wAppend(cts.privateChat, feedbackMsg, ctx)
  }
  coreUtils.eventEmitter.on('progress', onProgress)
  coreUtils.eventEmitter.on('fastReportPartial', onFastPartial)
  coreUtils.eventEmitter.on('humanFeedbackRequest', onHumanFeedback)

  const chatHistory = chatElements.filter(Boolean).map(chatHistoryEntry)
  const clarifiedParams = chatElements.map(clarifiedParam).filter(Boolean)
  const ctxForWf = ctx.setVars({ chatElements: nextMsgs, setChatElements, userMessage: txt, db: 'local', comaxDataset: 'big', accumulatedContext: { chatHistory, clarifiedParams } })

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
    const results = await Promise.all(ids.map(runOne))
    const base = { id: partialId || Math.random().toString(36).slice(2, 12), time: Date.now(), sender: 'Assistant' }
    assistantMsg = results.length === 1
      ? { ...base, durMs: results[0].durMs, ...(results[0].payload || { content: results[0].error || '??', type: 'text' }) }
      : { ...base, type: 'agentComparison', content: `השוואת ${results.length} סוכנים`, comparison: results }
    if (!partialId) await wAppend(cts.privateChat, assistantMsg, ctx)
  } finally {
    coreUtils.eventEmitter.off('progress', onProgress)
    coreUtils.eventEmitter.off('fastReportPartial', onFastPartial)
    coreUtils.eventEmitter.off('humanFeedbackRequest', onHumanFeedback)
    partialId && assistantMsg ? upsertAssistant(assistantMsg) : setChatElements(xs => assistantMsg ? [...xs, assistantMsg] : xs)
    assistantMsg && setNewTextId(assistantMsg.id)
    setStreamingState({ text: '', isTyping: false })
  }
}

function setHashParam(k, v) {
  const params = new URLSearchParams(location.hash.replace(/^#/, '?'))
  v == null ? params.delete(k) : params.set(k, v)
  window.location.hash = `#${params.toString()}`
}
