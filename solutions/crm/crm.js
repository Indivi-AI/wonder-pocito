import { dsls, jb } from '@jb6/core'
import '@jb6/react'
import '@wonder/db/db-drivers.js'
import { handleAuth, LoginScreen } from '@wonder/db/oauth2.js'
import { fetchLLMProxy } from '@wonder/ai/reactive-llm.js'
import { WA_ROOM, parseWaEvents, applyWaEvents, waChart, waSummary, nameFromLinkedin } from './whatsapp-sync.js'

const { wfetch2 } = jb.wonderUtils
const { react: { ReactComp, 'react-comp': { comp } } } = dsls

// room comes from the applet spec (shell passes roomUrl: room://<id> in ctx) — never hardcoded here
const getRoom = ctx => ctx.vars.roomUrl || new URLSearchParams(globalThis.location?.search || '').get('roomUrl')
const navTo = cmpId => { const u = new URL(globalThis.location.href); u.searchParams.set('cmpId', cmpId); globalThis.location.assign(u.href) }
const allFields = ['Main Contact', 'Company', 'Position', 'Funnel', 'Chance 1-10', 'next action', 'date next action', 'summary', 'Product', 'Alive/Dead', 'sender']
const extraFields = ['linkedin', 'geo', 'docUrl', 'deadReason'] // editable in the panel, not table columns
const derivedFields = ['id', 'dateLocked', 'msgs', 'notes', 'meetings', 'docText', 'activity'] // structural or synced — never hand-edited
const wideFields = ['summary', 'Product', 'linkedin', 'docUrl']
const closedCols = ['Funnel', 'Chance 1-10', 'Alive/Dead', 'sender']
const productCols = ['Product']
const bulkFields = ['Funnel', 'Chance 1-10', 'next action', 'date next action', 'Product', 'Alive/Dead', 'sender']
const colLabels = { 'Alive/Dead': 'Status', linkedin: 'LinkedIn URL', geo: 'Geo', docUrl: 'Doc URL', deadReason: 'Dead reason' }
const dateCol = 'date next action', chanceCol = 'Chance 1-10'
const sortableCols = [dateCol, chanceCol]
const aliveColors = { Alive: 'bg-green-100 text-green-800', Dead: 'bg-red-100 text-red-800' }
const funnelColors = {
  '0-Lead': 'bg-gray-200 text-gray-700', '0-Attempted to contact': 'bg-sky-100 text-sky-800',
  '1-Contacted': 'bg-blue-100 text-blue-800', '2-Discovery': 'bg-violet-100 text-violet-800',
  '3-Proposal': 'bg-amber-100 text-amber-800', '4-Negotiation': 'bg-green-100 text-green-800',
  '5-Won': 'bg-emerald-200 text-emerald-900'
}
const knownProducts = ['LPO', 'Marketing Data', 'ETLS', 'UI', 'WonderSpace', 'Workflows']
const deadReasons = ['Not relevant', "Doesn't answer", 'Left the company', 'Solved the problem on their own', "Doesn't buy outside solutions"]
const statusLabel = c => c.deadReason ? `${c['Alive/Dead']} · ${c.deadReason}` : c['Alive/Dead']
const parseDMY = s => { const [d, m, y] = (s || '').split('/'); return y ? Date.parse(`${y}-${m}-${d}`) : null }
const isOverdue = s => { const t = parseDMY(s); return t && t < Date.now() }
const fmtDMY = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return d }
const addMonths = n => { const d = new Date(); d.setMonth(d.getMonth() + n); return d }
const nextWeekday = w => { const d = new Date(); d.setDate(d.getDate() + ((w - d.getDay() + 7) % 7 || 7)); return d }
const datePresets = { Today: () => new Date(), Tomorrow: () => addDays(1), 'Next Sunday': () => nextWeekday(0), 'Next Thursday': () => nextWeekday(4), 'In a week': () => addDays(7), 'In a month': () => addMonths(1) }
const chanceBg = n => `hsl(${120 - (Math.min(Math.max(n, 1), 10) - 1) / 9 * 120}, 70%, 85%)`
const truncCols = { summary: 'max-w-[160px]', 'next action': 'max-w-[130px]', 'Alive/Dead': 'max-w-[150px]' }
const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400'
const productColors = ['bg-purple-100 text-purple-700', 'bg-orange-100 text-orange-700', 'bg-teal-100 text-teal-700', 'bg-pink-100 text-pink-700', 'bg-indigo-100 text-indigo-700', 'bg-yellow-100 text-yellow-700']
const productColor = p => productColors[knownProducts.indexOf(p) % productColors.length] || 'bg-gray-100 text-gray-600'
const fmtDate = d => { const t = Date.parse(d); return isNaN(t) ? (d || '') : new Date(t).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) }
// minimal markdown → text lines with bold/heading/bullet (Fathom summaries are simple markdown)
const md = (h, text) => (text || '').split('\n').map((line, i) => {
  const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) => p.startsWith('**') ? h('strong', { key: j }, p.slice(2, -2)) : p)
  const heading = line.match(/^#{1,6}\s+(.*)/)
  if (heading) return h('div:font-semibold text-gray-800 mt-2', { key: i }, heading[1].replace(/\*\*/g, ''))
  const bullet = line.match(/^\s*[-*]\s+(.*)/)
  if (bullet) return h('div:flex gap-1.5 pl-1', { key: i }, h('span:text-gray-400', {}, '•'), h('span', {}, bullet[1].split(/(\*\*[^*]+\*\*)/g).map((p, j) => p.startsWith('**') ? h('strong', { key: j }, p.slice(2, -2)) : p)))
  return h('div', { key: i }, parts)
})

ReactComp('crm', {
  impl: comp({
    hFunc: (ctx, {initialContacts, unmatchedMeetings = [], ignoredMeetings = [], waEvents = [], ignoredWa = [],
      room, authed, dbUrl, react: {h, useState, useEffect, useRef}}) => () => {
      if (!authed) return h(LoginScreen)
      const [contacts, setContacts] = useState(initialContacts)
      const [unmatched, setUnmatched] = useState(unmatchedMeetings)
      const [linkingMtg, setLinkingMtg] = useState(null)
      const [linkSearch, setLinkSearch] = useState('')
      const [editing, setEditing] = useState(null)
      const [confirming, setConfirming] = useState(false)
      const [saving, setSaving] = useState(false)
      const [showMsgs, setShowMsgs] = useState(false)
      const [draft, setDraft] = useState('')
      const [editNoteTs, setEditNoteTs] = useState(null)
      const [copied, setCopied] = useState(false)
      const [openMtg, setOpenMtg] = useState(null)
      const [filters, setFilters] = useState(() => ({
        'Alive/Dead': [...new Set(initialContacts.map(c => (c['Alive/Dead'] || '').trim()))].filter(v => v != 'Dead')
      }))
      const [sort, setSort] = useState({ col: dateCol, dir: 1 })
      const [importance, setImportance] = useState(null)
      const [linkedin, setLinkedin] = useState(null)
      const [late, setLate] = useState(false)
      const [cellEdit, setCellEdit] = useState(null)
      const [openFilter, setOpenFilter] = useState(null)
      const [expandedSummary, setExpandedSummary] = useState(null)
      const [aiLoading, setAiLoading] = useState(false)
      const [selected, setSelected] = useState(() => new Set())
      const [bulkField, setBulkField] = useState(null)
      const [askDead, setAskDead] = useState(null)
      const [waIgnored, setWaIgnored] = useState(ignoredWa)
      const [waOpen, setWaOpen] = useState(false)
      const [waDays, setWaDays] = useState(7)
      const [linkingWa, setLinkingWa] = useState(null)
      useEffect(() => {
        const onDown = e => { if (!e.target.closest('.filter-pop')) setOpenFilter(null) }
        const sync = () => {
          const p = new URLSearchParams(location.search), name = p.get('name')
          if (!name) return setEditing(null)
          const c = contacts.find(x => (x['Main Contact'] || '') == name && (x.Company || '') == (p.get('company') || ''))
          if (c) { setShowMsgs(false); setConfirming(false); setEditing(c) }
        }
        sync()
        document.addEventListener('mousedown', onDown)
        window.addEventListener('popstate', sync)
        return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('popstate', sync) }
      }, [])

      const activeFilters = Object.values(filters).filter(v => v?.length).length
      const companyCount = contacts.reduce((m, c) => { const k = (c.Company || '').trim(); if (k) m[k] = (m[k] || 0) + 1; return m }, {})
      const isDupCompany = c => companyCount[(c.Company || '').trim()] > 1
      const isImportant = c => parseInt(c.Funnel) >= 2 || Number(c[chanceCol]) >= 3
      const visible = contacts.filter(c =>
        closedCols.every(f => !filters[f]?.length || filters[f].includes((c[f] || '').trim())) &&
        (!filters['Product']?.length || (c['Product'] || []).some(p => filters['Product'].includes(p))) &&
        (!filters['Company']?.length || filters['Company'].includes((c.Company || '').trim())) &&
        (!importance || isImportant(c) == (importance == 'important')) &&
        (!linkedin || !!c.linkedin == (linkedin == 'only')) &&
        (!late || isOverdue(c[dateCol])))
      const sortVal = c => sort.col == dateCol ? parseDMY(c[dateCol]) : Number(c[chanceCol]) || null
      const sorted = !sort ? visible : [...visible].sort((a, b) => {
        const [va, vb] = [sortVal(a), sortVal(b)]
        return va == null ? 1 : vb == null ? -1 : (va - vb) * sort.dir
      })

      const contactUrl = c => { const u = new URL(location.href); if (c?.['Main Contact']) { u.searchParams.set('name', c['Main Contact']); u.searchParams.set('company', c.Company || '') } else ['name', 'company'].forEach(k => u.searchParams.delete(k)); return u }
      const openEdit = (c, msgs = false) => { setShowMsgs(msgs); setConfirming(false); setEditing(c); history.pushState(null, '', contactUrl(c)) }
      const closeEdit = () => { setEditing(null); history.pushState(null, '', contactUrl(null)) }
      const shareLink = () => { navigator.clipboard.writeText(contactUrl(editing).href); setCopied(true); setTimeout(() => setCopied(false), 1500) }
      const saveQueue = useRef(Promise.resolve())
      const persist = next => { // optimistic, then merge our change (by id) into the latest server list — serialized so a stale tab never overwrites server-side rows
        setContacts(next)
        const prevById = new Map(contacts.map(c => [c.id, c]))
        const changed = next.filter(c => prevById.get(c.id) !== c)
        const removed = [...prevById.keys()].filter(id => !next.some(c => c.id == id))
        saveQueue.current = saveQueue.current.then(async () => {
          setSaving(true)
          const latest = await wfetch2(dbUrl, { method: 'GET' }, ctx).then(r => r.ok && r.json()).catch(() => null)
          const byId = new Map((Array.isArray(latest) ? latest : next).map(c => [c.id, c]))
          changed.forEach(c => byId.set(c.id, c)); removed.forEach(id => byId.delete(id))
          const merged = [...byId.values()]
          await wfetch2(dbUrl, { method: 'PUT', body: merged }, ctx)
          setContacts(merged)
          setSaving(false)
        })
        return saveQueue.current
      }
      // any status→Dead change first asks why; apply(reason) runs only after a reason is picked (cancel = change abandoned)
      const askIfDead = (f, v, apply) => f == 'Alive/Dead' && v == 'Dead'
        ? setAskDead({ onPick: r => { setAskDead(null); apply(r) } }) : apply(null)
      const patch = (f, v, r) => ({ [f]: v, ...(f == 'Alive/Dead' && { deadReason: r }), ...(f == dateCol && { dateLocked: true }) })
      const deadModal = () => h('div:fixed inset-0 z-50 bg-black/30 flex items-center justify-center', { onClick: () => setAskDead(null) },
        h('div:bg-white rounded-xl shadow-xl p-5 w-80', { onClick: e => e.stopPropagation() },
          h('div:text-sm font-semibold text-gray-700 mb-3', {}, 'Why is this lead dead?'),
          h('div:flex flex-col gap-1.5 mb-3', {}, deadReasons.map(r =>
            h('button:text-left px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-red-50', { key: r, onClick: () => askDead.onPick(r) }, r))),
          h('input', { className: inputCls, placeholder: 'Other reason…  (↵)', autoFocus: true,
            onKeyDown: e => e.key == 'Enter' && e.target.value.trim() && askDead.onPick(e.target.value.trim()) }),
          h('button:mt-3 text-xs text-gray-500 hover:text-gray-700', { onClick: () => setAskDead(null) }, 'Cancel')))
      const putFile = (name, body) => wfetch2(`${room}/${name}`, { method: 'PUT', body }, ctx)
      const dropUnmatched = id => { const next = unmatched.filter(u => u.recording_id != id); setUnmatched(next); return putFile('fathom-unmatched', next) }
      const linkMeeting = (c, m) => {
        const meetings = [...(c.meetings || []).filter(x => x.recording_id != m.recording_id), { recording_id: m.recording_id, title: m.title, date: m.date, summary: m.summary, actionItems: m.actionItems, url: m.url }].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
        persist(contacts.map(x => x.id == c.id ? { ...x, meetings } : x))
        dropUnmatched(m.recording_id); setLinkingMtg(null); setLinkSearch('')
      }
      const ignoreMeeting = async m => { await putFile('fathom-ignored', [...ignoredMeetings, m.recording_id]); dropUnmatched(m.recording_id) }
      // WhatsApp sync is fully derived: it re-runs on every render and applies whatever is still fresh, so linking or
      // creating a contact below is enough — its events land on the next pass and it drops out of waUnmatched by itself.
      const waSync = applyWaEvents(contacts, waEvents, Object.keys(funnelColors))
      const waUnmatched = waSync.unmatched.filter(u => !waIgnored.includes(u.li))
      useEffect(() => { if (waSync.applied) persist(waSync.contacts) }, [waSync.applied])
      const createFromWa = u => openEdit({ id: Date.now(), 'Main Contact': nameFromLinkedin(u.li), linkedin: u.url, sender: u.by, Funnel: '0-Lead', 'Alive/Dead': 'Alive' })
      const linkWaTo = (c, u) => { persist(contacts.map(x => x.id == c.id ? { ...x, linkedin: u.url } : x)); setLinkingWa(null); setLinkSearch('') }
      const ignoreWa = u => { const next = [...waIgnored, u.li]; setWaIgnored(next); putFile('wa-ignored', next) }
      const contactPicker = (onPick, hover) => h('div:w-full mt-1 flex flex-col gap-1', {},
        h('input', { className: inputCls + ' text-xs', placeholder: 'search contact…', value: linkSearch, autoFocus: true, onChange: e => setLinkSearch(e.target.value) }),
        h('div:max-h-44 overflow-y-auto flex flex-col', {},
          contacts.filter(c => !linkSearch || `${c['Main Contact']} ${c.Company}`.toLowerCase().includes(linkSearch.toLowerCase())).slice(0, 8).map(c =>
            h(`button:text-left px-2 py-1 text-xs rounded ${hover}`, { key: c.id, onClick: () => onPick(c) }, `${c['Main Contact']} — ${c.Company || ''}`))))
      const saveEditing = () => {
        const exists = contacts.some(c => c.id == editing.id)
        persist(exists ? contacts.map(c => c.id == editing.id ? editing : c) : [...contacts, editing])
        closeEdit()
      }
      const removeContact = c => { persist(contacts.filter(x => x.id != c.id)); closeEdit(); setConfirming(false) }
      const addMsg = c => {
        persist(contacts.map(x => x.id == c.id ? { ...x, msgs: [...(x.msgs || []), { ts: Date.now(), text: draft, from: 'me', manual: true }] } : x))
        setDraft('')
      }
      const mergeNotes = (c, notes) => { // persist notes without clobbering msgs/meetings; keep page in sync
        setEditing(prev => prev && prev.id == c.id ? { ...prev, notes } : prev)
        persist(contacts.map(x => x.id == c.id ? { ...x, notes } : x))
      }
      const addNote = (c, ta) => { const text = (ta.value || '').trim(); if (!text) return; mergeNotes(c, [...(c.notes || []), { ts: Date.now(), text }]); ta.value = '' }
      const wrapSel = (ta, pre, post) => { const { selectionStart: s, selectionEnd: e, value: v } = ta; ta.value = v.slice(0, s) + pre + v.slice(s, e) + post + v.slice(e); ta.focus(); ta.setSelectionRange(s + pre.length, e + pre.length) }
      const noteToolbar = () => h('div:flex gap-1 mb-1', {}, [['B', '**', '**'], ['I', '*', '*'], ['• List', '\n- ', ''], ['H', '\n### ', '']].map(([l, pre, post]) =>
        h('button:px-2 py-0.5 text-xs border border-gray-200 rounded hover:bg-gray-100 font-semibold text-gray-600', { key: l, type: 'button', onMouseDown: ev => { ev.preventDefault(); wrapSel(ev.currentTarget.closest('.note-box').querySelector('textarea'), pre, post) } }, l)))
      const editNote = (c, ts, text) => mergeNotes(c, (c.notes || []).map(n => n.ts == ts ? { ...n, text } : n))

      const genAiSummary = async c => {
        setAiLoading(c.id)
        const msgs = (c.msgs || []).map(m => `${m.from}: ${m.text}`).join('\n')
        const mtgs = (c.meetings || []).map(m => `${m.title} (${fmtDate(m.date)}):\n${m.summary}`).join('\n\n')
        const notes = (c.notes || []).map(n => n.text).join('\n')
        const prompt = `One or two sentences max. Who is this person and what's the current status/next step?\n\nContact: ${c['Main Contact']} @ ${c.Company} (${c.Position})\nFunnel: ${c.Funnel}\nProduct: ${(c.Product||[]).join(', ')}\n${msgs ? `LinkedIn messages:\n${msgs}\n` : ''}${mtgs ? `Meetings:\n${mtgs}\n` : ''}${notes ? `Notes:\n${notes}\n` : ''}${c.summary ? `Existing summary: ${c.summary}` : ''}`
        const body = { model: 'claude-sonnet-4-6', max_tokens: 200, messages: [{ role: 'user', content: prompt }] }
        const res = await fetchLLMProxy('https://api.anthropic.com/v1/messages', { body, headers: { 'content-type': 'application/json' } }, ctx)
        const json = await res.json()
        const text = json.content?.[0]?.text || ''
        if (text) setEditing(prev => ({ ...prev, summary: text }))
        setAiLoading(null)
      }

      const distinct = f => [...new Set(contacts.map(c => (c[f] || '').trim()))].sort()
      const distinctProducts = () => [...new Set([...knownProducts, ...contacts.flatMap(c => c.Product || [])])].filter(Boolean)
      const colOptions = f => f == 'Funnel' ? Object.keys(funnelColors) : f == 'Alive/Dead' ? ['Alive', 'Dead']
        : f == chanceCol ? Array.from({ length: 10 }, (_, i) => `${i + 1}`) : distinct(f).filter(Boolean)

      // ---- bulk multi-edit ----
      const anchorId = useRef(null) // shift-click extends from the last row clicked, over the rows as currently sorted/filtered
      const toggleOne = (id, range) => setSelected(s => {
        const ids = sorted.map(c => c.id), from = range ? ids.indexOf(anchorId.current) : -1, to = ids.indexOf(id)
        const span = from < 0 ? [id] : ids.slice(Math.min(from, to), Math.max(from, to) + 1)
        const n = new Set(s), add = !n.has(id)
        span.forEach(x => add ? n.add(x) : n.delete(x))
        anchorId.current = id
        return n
      })
      const allVisSelected = sorted.length > 0 && sorted.every(c => selected.has(c.id))
      const toggleAll = () => setSelected(allVisSelected ? new Set() : new Set(sorted.map(c => c.id)))
      const applyBulk = (f, v) => askIfDead(f, v, r => persist(contacts.map(c => selected.has(c.id) ? { ...c, ...patch(f, v, r) } : c)))
      const addBulkProduct = p => persist(contacts.map(c => selected.has(c.id) ? { ...c, Product: [...new Set([...(c.Product || []), p])] } : c))
      const bulkInput = 'border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white'
      const bulkCtrl = f =>
        f == dateCol ? h(DateField, { val: null, onPick: v => applyBulk(f, v), cls: bulkInput })
        : f == 'Product' ? h('div:flex flex-wrap gap-1.5', {}, distinctProducts().map(p =>
            h(`button:px-2 py-1 rounded text-xs ${productColor(p)}`, { key: p, title: 'Add to selected', onClick: () => addBulkProduct(p) }, '+ ' + p)))
        : closedCols.includes(f) ? h('select', { className: bulkInput, value: '', onChange: e => e.target.value && applyBulk(f, e.target.value) },
            h('option', { value: '' }, 'choose…'), colOptions(f).map(o => h('option', { key: o, value: o }, o)))
        : h('input', { className: bulkInput, placeholder: 'value, then ↵', onKeyDown: e => e.key == 'Enter' && applyBulk(f, e.target.value) })
      const bulkBar = () => h('div:flex flex-wrap items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 mb-3', {},
        h('span:text-sm font-semibold text-blue-800', {}, `${selected.size} selected`),
        h('span:text-sm text-gray-600', {}, 'Set'),
        h('select', { className: bulkInput, value: bulkField || '', onChange: e => setBulkField(e.target.value || null) },
          h('option', { value: '' }, 'field…'), bulkFields.map(f => h('option', { key: f, value: f }, colLabels[f] || f))),
        bulkField && h('span:text-sm text-gray-600', {}, 'to'),
        bulkField && bulkCtrl(bulkField),
        h('button:ml-auto text-sm text-gray-500 hover:text-gray-700', { onClick: () => { setSelected(new Set()); setBulkField(null) } }, 'Clear selection'))

      const fieldRef = useRef() // stable identity so the popover's open/view state survives parent re-renders
      if (!fieldRef.current) fieldRef.current = ({ val, onPick, cls = inputCls, autoOpen = false }) => {
        const [open, setOpen] = useState(autoOpen)
        const sel = parseDMY(val), s = sel && new Date(sel)
        const [view, setView] = useState(() => { const d = s || new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
        const move = d => setView(v => { const n = new Date(v.y, v.m + d, 1); return { y: n.getFullYear(), m: n.getMonth() } })
        const days = new Date(view.y, view.m + 1, 0).getDate(), pad = new Date(view.y, view.m, 1).getDay()
        const isSel = day => s && s.getFullYear() == view.y && s.getMonth() == view.m && s.getDate() == day
        const pick = v => { setOpen(false); onPick(v) }
        return h('div:relative inline-block', { onBlur: e => !e.currentTarget.contains(e.relatedTarget) && setOpen(false) },
          h('button:text-left', { type: 'button', className: cls, onClick: () => setOpen(o => !o) }, val || 'Pick date'),
          open && h('div:absolute z-30 mt-1 left-0 w-60 bg-white border border-gray-200 rounded-lg shadow-lg p-2', {},
            h('div:flex items-center justify-between mb-1', {},
              h('button:px-2 py-0.5 rounded hover:bg-gray-100 text-gray-600', { type: 'button', onClick: () => move(-1) }, '‹'),
              h('span:text-sm font-medium', {}, new Date(view.y, view.m, 1).toLocaleDateString([], { month: 'long', year: 'numeric' })),
              h('button:px-2 py-0.5 rounded hover:bg-gray-100 text-gray-600', { type: 'button', onClick: () => move(1) }, '›')),
            h('div:grid grid-cols-7 gap-0.5 text-center', {},
              ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => h('div:text-[10px] text-gray-400 py-0.5', { key: d }, d)),
              Array.from({ length: pad }).map((_, i) => h('div', { key: 'p' + i })),
              Array.from({ length: days }, (_, i) => i + 1).map(day =>
                h(`button:text-xs rounded py-1 hover:bg-blue-100 ${isSel(day) ? 'bg-blue-500 text-white' : ''}`,
                  { key: day, type: 'button', onClick: () => pick(fmtDMY(new Date(view.y, view.m, day))) }, day))),
            h('div:flex flex-wrap gap-1 mt-2 pt-2 border-t border-gray-100', {},
              Object.keys(datePresets).map(k => h('button:px-2 py-0.5 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700',
                { key: k, type: 'button', onClick: () => pick(fmtDMY(datePresets[k]())) }, k)),
              val && h('button:px-2 py-0.5 text-xs rounded bg-red-100 hover:bg-red-200 text-red-700',
                { type: 'button', onClick: () => pick('') }, '✕ Clear'))))
      }
      const DateField = fieldRef.current

      // ---- edit page ----
      const fieldCtrl = f => {
        const val = editing[f], set = v => askIfDead(f, v, r => setEditing({ ...editing, ...patch(f, v, r) }))
        if (f == 'Product') {
          const sel = Array.isArray(val) ? val : []
          return h('div:flex flex-wrap gap-2', {}, distinctProducts().map(p =>
            h('label:flex items-center gap-1.5 text-sm cursor-pointer', { key: p },
              h('input', { type: 'checkbox', checked: sel.includes(p), onChange: e => set(e.target.checked ? [...sel, p] : sel.filter(x => x != p)) }), p)))
        }
        if (f == 'summary') return h('div:flex flex-col gap-1', {},
          h('textarea', { className: inputCls, rows: 3, value: val || '', onChange: e => set(e.target.value) }),
          h('button:self-start text-xs text-blue-500 hover:text-blue-700 disabled:opacity-40', {
            disabled: aiLoading == editing.id,
            onClick: () => genAiSummary(editing)
          }, aiLoading == editing.id ? '⏳ Generating…' : '✨ Generate AI summary'))
        if (closedCols.includes(f)) return h('select', { className: inputCls, value: val || '', onChange: e => set(e.target.value) },
          h('option', { value: '' }, '—'), colOptions(f).map(o => h('option', { key: o, value: o }, o)))
        if (f == dateCol) return h(DateField, { val, onPick: set })
        return h('input', { className: inputCls, type: 'text', value: val || '', onChange: e => set(e.target.value) })
      }
      const mtgRow = (c, m) => h('div:border border-gray-200 rounded-lg', { key: m.recording_id },
        h('div:flex items-center justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50', { onClick: () => setOpenMtg(openMtg == m.recording_id ? null : m.recording_id) },
          h('div:min-w-0', {}, h('div:text-sm font-medium truncate', {}, m.title || 'Meeting'), h('div:text-xs text-gray-400', {}, fmtDate(m.date))),
          h('div:flex items-center gap-2 shrink-0', {},
            m.url && h('a:text-xs text-blue-500 hover:underline', { href: m.url, target: '_blank', onClick: e => e.stopPropagation() }, '▶ Fathom'),
            h('span:text-gray-400 text-xs', {}, openMtg == m.recording_id ? '▲' : '▼'))),
        openMtg == m.recording_id && h('div:px-3 pb-3 pt-1 border-t border-gray-100 space-y-2', {},
          m.summary && h('div:text-xs text-gray-700 leading-relaxed space-y-0.5', {}, md(h, m.summary)),
          (m.actionItems || []).length > 0 && h('div', {}, h('div:text-xs font-semibold text-gray-600 mb-1', {}, 'Action items'),
            h('ul:space-y-0.5', {}, m.actionItems.map((a, i) => h('li:text-xs text-gray-700 flex gap-1.5', { key: i }, h('span:text-gray-400', {}, '☐'), a))))))
      const notesSection = notes => h('div:bg-white border border-gray-200 rounded-xl shadow-sm p-5', {},
        h('div:text-sm font-semibold text-gray-700 mb-3', {}, `📝 Notes ${notes.length ? `(${notes.length})` : ''}`),
        h('div:space-y-2 mb-3', {}, notes.map(n => editNoteTs == n.ts
          ? h('div:note-box', { key: n.ts }, noteToolbar(),
              h('textarea:w-full ' + inputCls, { rows: 5, autoFocus: true, defaultValue: n.text,
                onBlur: e => { if (e.target.value != n.text) editNote(editing, n.ts, e.target.value); setEditNoteTs(null) } }))
          : h('div:bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 cursor-text hover:border-amber-300', { key: n.ts, onClick: () => setEditNoteTs(n.ts) },
              h('div:text-[10px] text-gray-400 mb-1', {}, fmtDate(n.ts)),
              h('div:text-sm text-gray-800 leading-relaxed space-y-0.5', {}, md(h, n.text))))),
        h('div:note-box', {}, noteToolbar(),
          h('textarea:w-full ' + inputCls, { rows: 5, placeholder: 'Add a note…  (**bold**, *italic*, - list, ### heading)' }),
          h('button:mt-2 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600', { onClick: e => addNote(editing, e.currentTarget.closest('.note-box').querySelector('textarea')) }, 'Add Note')))

      const editPage = () => {
        const exists = contacts.some(c => c.id == editing.id)
        const editFields = [...new Set([...allFields, ...extraFields, ...contacts.flatMap(Object.keys)])].filter(f => !derivedFields.includes(f))
        const msgs = editing.msgs || [], mtgs = editing.meetings || [], notes = editing.notes || []
        return h('div:max-w-6xl mx-auto', {},
          h('div:flex items-center justify-between gap-3 mb-5', {},
            h('div:flex items-center gap-3 min-w-0', {},
              h('button:px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 shrink-0', { onClick: closeEdit }, '← Back'),
              h('div:min-w-0', {},
                h('h1:text-2xl font-bold truncate', {}, editing['Main Contact'] || 'New Contact'),
                (editing.Company || editing.Position) && h('div:text-sm text-gray-500 truncate', {}, [editing.Position, editing.Company].filter(Boolean).join(' · ')))),
            h('div:flex items-center gap-2 shrink-0', {},
              saving && h('span:text-sm text-gray-400', {}, 'saving...'),
              msgs.length > 0 && h(`button:px-3 py-1.5 text-sm rounded-lg border ${showMsgs ? 'bg-blue-500 text-white border-blue-500' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`, { onClick: () => setShowMsgs(v => !v) }, `💬 ${msgs.length}`),
              exists && h('button:px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50', { onClick: shareLink }, copied ? '✓ Copied' : '🔗 Copy link'),
              h('button:px-5 py-1.5 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-40', { onClick: saveEditing, disabled: !editing['Main Contact'] }, 'Save'))),
          showMsgs && h('div:border border-gray-200 rounded-xl p-4 mb-5 max-h-80 overflow-auto bg-gray-100/70 space-y-1.5', {},
            msgs.map(m => {
              const mine = [editing.sender, 'Winder', 'Yiftach', 'me'].includes(m.from)
              return h(`div:flex ${mine ? 'justify-end' : 'justify-start'}`, { key: m.ts },
                h(`div:max-w-[78%] rounded-lg px-3 py-1.5 shadow-sm ${mine ? 'bg-[#d9fdd3]' : 'bg-white'}`, {},
                  !mine && h('div:text-xs font-semibold text-blue-600 mb-0.5', {}, m.from),
                  h('div:text-sm whitespace-pre-wrap break-words', { style: { overflowWrap: 'anywhere' } }, m.text),
                  h('div:text-[10px] text-gray-400 text-right mt-0.5', {}, new Date(m.ts).toLocaleDateString([], { day: '2-digit', month: '2-digit' }) + ' ' + new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }))))
            }),
            h('div:flex gap-2 mt-3 sticky bottom-0', {},
              h('input:flex-1 border border-gray-300 rounded-full px-4 py-1.5 text-sm bg-white', {
                placeholder: 'New message', value: draft, onChange: e => setDraft(e.target.value),
                onKeyDown: e => e.key == 'Enter' && draft && addMsg(editing)
              }),
              h('button:px-4 py-1.5 bg-blue-500 text-white rounded-full text-sm', { onClick: () => draft && addMsg(editing) }, 'Send'))),
          h('div:grid grid-cols-1 lg:grid-cols-2 gap-6 items-start', {},
            h('div:bg-white border border-gray-200 rounded-xl shadow-sm p-6 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4', {},
              editFields.map(f => h(`div:${wideFields.includes(f) ? 'sm:col-span-2' : ''}`, { key: f },
                h('label:block text-xs font-medium text-gray-500 mb-1', {}, colLabels[f] || f),
                fieldCtrl(f))),
              h('div:sm:col-span-2 pt-2 border-t border-gray-100', {},
                confirming ? h('div:flex items-center gap-2', {},
                    h('span:text-sm text-gray-600', {}, 'Delete permanently?'),
                    h('button:px-3 py-1.5 bg-red-500 text-white rounded-lg text-sm', { onClick: () => removeContact(editing) }, 'Yes, delete'),
                    h('button:px-3 py-1.5 text-sm text-gray-500', { onClick: () => setConfirming(false) }, 'Cancel'))
                  : exists && h('button:text-red-500 text-sm hover:text-red-600', { onClick: () => setConfirming(true) }, 'Delete contact'))),
            h('div:space-y-6', {},
              exists && h('div:bg-white border border-gray-200 rounded-xl shadow-sm p-5', {},
                h('div:text-sm font-semibold text-gray-700 mb-3', {}, `📅 Meetings ${mtgs.length ? `(${mtgs.length})` : ''}`),
                mtgs.length ? h('div:space-y-2', {}, mtgs.map(m => mtgRow(editing, m))) : h('div:text-xs text-gray-400', {}, 'No meetings synced yet.')),
              exists && notesSection(notes))))
      }

      // ---- table header: sort + filter ----
      const allChecked = f => (filters[f]?.length || 0) === (f == 'Product' ? distinctProducts().length : distinct(f).length)
      const filterOptions = f => f == 'Product' ? distinctProducts() : distinct(f)
      const filterUI = f => f == dateCol
        ? h(`button:cursor-pointer text-[11px] select-none whitespace-nowrap ${late ? 'text-blue-600 font-medium' : 'text-gray-400'}`,
            { onClick: () => setLate(v => !v) }, late ? 'late ●' : 'late ▾')
        : (closedCols.includes(f) || productCols.includes(f)) && h('div:relative filter-pop font-normal', {},
        h(`button:cursor-pointer text-[11px] list-none select-none whitespace-nowrap ${filters[f]?.length ? 'text-blue-600 font-medium' : 'text-gray-400'}`,
          { onClick: () => setOpenFilter(openFilter == f ? null : f) }, filters[f]?.length ? 'filter ●' : 'filter ▾'),
        openFilter == f && h('div:absolute z-20 bg-white border border-gray-200 rounded-lg shadow-lg p-2 max-h-56 overflow-auto', {},
          h('label:flex items-center gap-1.5 text-xs whitespace-nowrap py-0.5 cursor-pointer border-b border-gray-100 mb-1 font-medium', {},
            h('input', { type: 'checkbox', checked: allChecked(f), onChange: e => setF(f, e.target.checked ? filterOptions(f) : []) }), 'Select all'),
          filterOptions(f).map(v => h('label:flex items-center gap-1.5 text-xs whitespace-nowrap py-0.5 cursor-pointer', { key: v || '_' },
            h('input', {
              type: 'checkbox', checked: (filters[f] || []).includes(v),
              onChange: e => setF(f, e.target.checked ? [...(filters[f] || []), v] : (filters[f] || []).filter(x => x != v))
            }), v || '(empty)'))))
      const setF = (f, v) => setFilters({ ...filters, [f]: v })
      const header = f => !sortableCols.includes(f) ? (colLabels[f] || f)
        : h(`span:cursor-pointer select-none ${sort?.col == f ? 'text-blue-600' : ''}`, {
            onClick: () => setSort(sort?.col == f ? { col: f, dir: -sort.dir } : { col: f, dir: 1 })
          }, colLabels[f] || f, h('span:text-gray-400 ml-0.5', {}, sort?.col == f ? (sort.dir == 1 ? '↑' : '↓') : '⇅'))

      // ---- cells (inline edit) ----
      const markSent = c => persist(contacts.map(x => x.id == c.id ? { ...x, 'next action': 'awaiting acceptance', [dateCol]: '' } : x))
      const display = (c, f) =>
        f == 'Funnel' && c[f] ? h(`span:px-2 py-0.5 rounded-full text-xs whitespace-nowrap ${funnelColors[c[f]] || 'bg-gray-100 text-gray-600'}`, {}, c[f])
        : f == 'Alive/Dead' && c[f] ? h(`span:px-2 py-0.5 rounded-full text-xs ${aliveColors[c[f]] || ''}`, { title: c.deadReason }, statusLabel(c))
        : f == chanceCol && c[f] ? h('span:inline-flex w-6 h-6 items-center justify-center rounded font-medium text-gray-800', { style: { backgroundColor: chanceBg(Number(c[f])) } }, c[f])
        : f == dateCol && c[f] ? h(`span:whitespace-nowrap ${isOverdue(c[f]) ? 'text-red-600 font-medium' : ''}`, {}, c[f])
        : f == 'Product' ? h('div:flex flex-wrap gap-1', {}, (c[f] || []).map(p => h(`span:px-1.5 py-0.5 rounded text-xs ${productColor(p)}`, { key: p }, p)))
        : f == 'summary' ? h('div:relative cursor-pointer', { onClick: () => setExpandedSummary(expandedSummary == c.id ? null : c.id) },
            expandedSummary == c.id
              ? h('span:text-xs text-gray-700 whitespace-pre-wrap', {}, c[f] || h('span:text-gray-300', {}, '—'))
              : h('span:text-xs text-gray-700 truncate block max-w-[160px]', {}, c[f] || h('span:text-gray-300', {}, '—')))
        : f == 'Company' && c[f] && isDupCompany(c) ? h('button:text-red-600 font-medium hover:underline text-left', { title: 'Duplicate company — click to find all contacts here', onClick: e => { e.stopPropagation(); setFilters(filters['Company']?.length ? {} : { Company: [(c[f] || '').trim()] }) } }, c[f])
        : f == 'next action' && c[f] == 'connect on linkedin' ? h('span:inline-flex items-center gap-1.5 flex-wrap', {}, c[f],
            h('button:text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 whitespace-nowrap', { title: 'I sent the request — clears the due date until they accept', onClick: e => { e.stopPropagation(); markSent(c) } }, '✓ sent'))
        : f == 'next action' && c[f] == 'awaiting acceptance' ? h('span:inline-flex items-center gap-1 text-gray-400 whitespace-nowrap', {}, '⏳', h('span:text-xs', {}, 'awaiting accept'))
        : f == 'Main Contact' ? h('span:font-medium', {},
            c.linkedin ? h('a:text-blue-600 hover:underline', { href: c.linkedin, target: '_blank' }, c[f]) : c[f],
            (c.msgs||[]).length > 0 && h('button:text-blue-500 text-xs ml-1 hover:text-blue-700 cursor-pointer', { title: 'View messages', onClick: e => { e.stopPropagation(); openEdit(c, true) } }, `💬${(c.msgs||[]).length}`),
            (c.meetings||[]).length > 0 && h('button:text-violet-500 text-xs ml-1 hover:text-violet-700 cursor-pointer', { title: 'View meetings', onClick: e => { e.stopPropagation(); openEdit(c) } }, `📅${(c.meetings||[]).length}`),
            c.geo == 'US' && h('span:text-xs ml-1', { title: 'US-based' }, '🇺🇸'))
        : c[f] || h('span:text-gray-300', {}, '—')
      const saveCell = (c, f, v) => { setCellEdit(null); if (v != (c[f] || '')) askIfDead(f, v, r => persist(contacts.map(x => x.id == c.id ? { ...x, ...patch(f, v, r) } : x))) }
      const dateEditor = (c, f) =>
        h('div', { onBlur: e => !e.currentTarget.contains(e.relatedTarget) && setCellEdit(null) },
          h(DateField, { val: c[f], autoOpen: true, cls: 'border border-blue-400 rounded px-1 py-0.5 text-sm w-28', onPick: v => saveCell(c, f, v) }))
      const toggleProduct = (c, p) => persist(contacts.map(x => x.id == c.id ? { ...x, Product: (x.Product || []).includes(p) ? x.Product.filter(y => y != p) : [...(x.Product || []), p] } : x))
      const productEditor = c => h('div:relative inline-block', { tabIndex: 0, ref: el => el && el.focus(), onBlur: e => !e.currentTarget.contains(e.relatedTarget) && setCellEdit(null) },
        display(c, 'Product'),
        h('div:absolute z-30 mt-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg p-2 max-h-56 overflow-auto', {},
          distinctProducts().map(p => h('label:flex items-center gap-1.5 text-xs whitespace-nowrap py-0.5 cursor-pointer', { key: p },
            h('input', { type: 'checkbox', checked: (c.Product || []).includes(p), onChange: () => toggleProduct(c, p) }), p))))
      const cellEditor = (c, f) => {
        if (f == 'Product') return productEditor(c)
        if (f == dateCol) return dateEditor(c, f)
        const common = { autoFocus: true, defaultValue: c[f] || '', className: 'w-full border border-blue-400 rounded px-1 py-0.5 text-sm',
          onBlur: e => saveCell(c, f, e.target.value), onKeyDown: e => e.key == 'Enter' && e.target.blur() }
        if (closedCols.includes(f)) return h('select', { ...common, onChange: e => saveCell(c, f, e.target.value) },
          h('option', { value: '' }, '—'), colOptions(f).map(v => h('option', { key: v, value: v }, v)))
        return h('input', { ...common, type: 'text' })
      }
      const cell = (c, f) => cellEdit?.id == c.id && cellEdit.field == f
        ? cellEditor(c, f)
        : h('div:cursor-pointer min-h-[1.25rem]', { onClick: () => f != 'Main Contact' && setCellEdit({ id: c.id, field: f }) }, display(c, f))

      if (editing) return h('div:w-full p-4 font-sans', {}, editPage(), askDead && deadModal())
      return h('div:w-full p-4 font-sans', {},
        askDead && deadModal(),
        unmatched.length > 0 && h('div:bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-3 text-sm', {},
          h('div:font-medium text-amber-800 mb-2', {}, `📅 ${unmatched.length} meeting${unmatched.length > 1 ? 's' : ''} not linked to a contact`),
          h('div:flex flex-col gap-1.5', {}, unmatched.map(m => h('div:flex flex-wrap items-center gap-2', { key: m.recording_id },
            m.url ? h('a:underline text-amber-900 font-medium', { href: m.url, target: '_blank' }, m.title) : h('span:text-amber-900 font-medium', {}, m.title),
            m.invitees?.length ? h('span:text-amber-600 text-xs', {}, `(${m.invitees.join(', ')})`) : null,
            h('button:px-2 py-0.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600', { onClick: () => { setLinkingMtg(linkingMtg?.recording_id == m.recording_id ? null : m); setLinkSearch('') } }, 'Link'),
            h('button:px-2 py-0.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-100', { onClick: () => ignoreMeeting(m) }, 'Ignore'),
            linkingMtg?.recording_id == m.recording_id && contactPicker(c => linkMeeting(c, m), 'hover:bg-amber-100'))))),
        waUnmatched.length > 0 && h('div:bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 mb-3 text-sm', {},
          h('div:font-medium text-emerald-900 mb-2', {}, `💬 ${waUnmatched.length} WhatsApp lead${waUnmatched.length > 1 ? 's' : ''} not in the CRM`),
          h('div:flex flex-col gap-1.5', {}, waUnmatched.map(u => h('div:flex flex-wrap items-center gap-2', { key: u.li },
            h('a:underline text-emerald-900 font-medium', { href: u.url, target: '_blank' }, nameFromLinkedin(u.li)),
            h('span:text-emerald-700 text-xs', {}, `${u.kinds.join(', ')} · ${u.by}`),
            h('button:px-2 py-0.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600', { onClick: () => createFromWa(u) }, 'Create'),
            h('button:px-2 py-0.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-100',
              { onClick: () => { setLinkingWa(linkingWa?.li == u.li ? null : u); setLinkSearch('') } }, 'Link'),
            h('button:px-2 py-0.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-100', { onClick: () => ignoreWa(u) }, 'Ignore'),
            linkingWa?.li == u.li && contactPicker(c => linkWaTo(c, u), 'hover:bg-emerald-100'))))),
        h('div:bg-white border border-gray-200 rounded-xl px-4 py-2 mb-3', {},
          h('div:flex items-center gap-3 flex-wrap', {},
            h('button:text-sm font-semibold text-gray-700', { onClick: () => setWaOpen(v => !v) }, `${waOpen ? '▴' : '▾'} 📊 Activity`),
            h('span:text-xs text-gray-500', {}, waSummary(waEvents, waDays)),
            h('div:ml-auto flex gap-1', {}, [7, 14, 30].map(n =>
              h(`button:px-2 py-0.5 text-xs rounded ${waDays == n ? 'bg-blue-500 text-white' : 'text-gray-600 border border-gray-200 hover:bg-gray-50'}`,
                { key: n, onClick: () => { setWaDays(n); setWaOpen(true) } }, `${n}d`)))),
          waOpen && h('div:mt-3', {}, waChart(h, waEvents, waDays))),
        h('div:flex items-center justify-between mb-4', {},
          h('h1:text-2xl font-bold', {}, 'Wonder CRM ', h('span:text-sm text-gray-400 font-normal', {}, `${visible.length}/${contacts.length}`)),
          h('div:flex items-center gap-3', {},
            saving && h('span:text-sm text-gray-400', {}, 'saving...'),
            h('button:px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50', { onClick: () => navTo('productMap') }, 'Product Map →'),
            (sender => h(`button:px-3 py-1.5 text-sm rounded-lg border ${sender ? 'bg-blue-500 text-white border-blue-500' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`,
              { title: 'Click to cycle: Both → Winder → Yiftach', onClick: () => setF('sender', sender == null ? ['Winder'] : sender == 'Winder' ? ['Yiftach'] : []) },
              `Sender: ${sender || 'Both'}`))(filters.sender?.length == 1 ? filters.sender[0] : null),
            h(`button:px-3 py-1.5 text-sm rounded-lg border ${importance ? 'bg-blue-500 text-white border-blue-500' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`,
              { title: 'Click to cycle: All → Important → Not important', onClick: () => setImportance(importance == null ? 'important' : importance == 'important' ? 'not' : null) },
              `Leads: ${importance == 'important' ? 'Important' : importance == 'not' ? 'Not important' : 'All'}`),
            h(`button:px-3 py-1.5 text-sm rounded-lg border ${linkedin ? 'bg-blue-500 text-white border-blue-500' : 'text-gray-600 border-gray-300 hover:bg-gray-50'}`,
              { title: 'Click to cycle: All → LinkedIn → Not LinkedIn', onClick: () => setLinkedin(linkedin == null ? 'only' : linkedin == 'only' ? 'not' : null) },
              `LinkedIn: ${linkedin == 'only' ? 'Only' : linkedin == 'not' ? 'Not' : 'All'}`),
            (activeFilters || sort) && h('button:px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50', {
              onClick: () => { setFilters({}); setSort(null) }
            }, `Clear filters${activeFilters ? ` (${activeFilters})` : ''}`),
            h('button:px-4 py-1.5 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600', {
              onClick: () => openEdit({ id: Date.now() })
            }, '+ Add Contact'))),
        selected.size > 0 && bulkBar(),
        h('div:border border-gray-200 rounded-xl shadow-sm', {},
          h('table:w-full text-sm [&_td]:border-r [&_td]:border-gray-100 [&_th]:border-r [&_th]:border-gray-100', {},
            h('thead:bg-gray-50 sticky top-0 z-10', {}, h('tr:text-left text-gray-600 border-b border-gray-200 align-top', {},
              h('th:py-2 px-2.5 w-8', { title: 'Select all — or shift-click two rows to select the range between them' },
                h('input', { type: 'checkbox', checked: allVisSelected, onChange: toggleAll })),
              [...allFields, ''].map(f => h('th:py-2 px-2.5 font-medium capitalize', { key: f },
                f && h('div:whitespace-nowrap', {}, header(f)), f && filterUI(f))))),
            h('tbody', {}, sorted.map(c =>
              h(`tr:border-b border-gray-100 hover:bg-blue-50/30 ${selected.has(c.id) ? 'bg-blue-100/60' : 'even:bg-gray-50/50'}`, { key: c.id },
                h('td:px-2.5 align-top py-1.5', {}, h('input', { type: 'checkbox', checked: selected.has(c.id), readOnly: true, onClick: e => toggleOne(c.id, e.shiftKey) })),
                allFields.map(f => h(`td:py-1.5 px-2.5 align-top ${truncCols[f] ? truncCols[f] + ' truncate' : ''}`, { key: f, title: typeof c[f] == 'string' ? c[f] : '' }, cell(c, f))),
                h('td:py-1.5 px-2.5 whitespace-nowrap text-right text-xs', {},
                  h('button:text-blue-500', { onClick: () => openEdit(c) }, 'Edit'))))))))
    },
    enrichCtx: async ctx => {
      const authed = await handleAuth()
      if (!authed) return ctx.setVars({ authed: false })
      const room = getRoom(ctx)
      const dbUrl = ctx.vars.dbUrl || `${room}/contacts`
      const get = url => wfetch2(url, { method: 'GET' }, ctx).then(r => r.ok && r.json()).catch(() => null)
      const arr = v => Array.isArray(v) ? v : []
      const [data, unmatched, ignored, waRows, waIgnored] = await Promise.all(
        [dbUrl, `${room}/fathom-unmatched`, `${room}/fathom-ignored`, WA_ROOM, `${room}/wa-ignored`].map(get))
      return ctx.setVars({ authed: true, room, dbUrl, initialContacts: arr(data), unmatchedMeetings: arr(unmatched),
        ignoredMeetings: arr(ignored), waEvents: parseWaEvents(arr(waRows)), ignoredWa: arr(waIgnored) })
    }
  })
})
