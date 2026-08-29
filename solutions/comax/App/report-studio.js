import { dsls, jb } from '@jb6/core'
import '@jb6/common'
import '@jb6/react'
import '@wonder/ui/applet.js'
import '@wonder/ai/report-step.js'
import '@wonder/verified-queries/verified-queries-dsl.js'
import '@wonder/db/db-drivers.js'
const { wfetch2 } = jb.wonderUtils
import '../Reports/index.js'

const {
  react: { ReactComp, 'react-comp': { comp }, 'react-metadata': { applet } },
  common: { data: { runReport, verifiedReportsRegistry } }
} = dsls

const REPORT_ID = 'promotions', RC_ID = 'promotionReportPanel'
const DEPTHS = ['executiveSummary', 'summary', 'inDepth'], URLS = '@solution/comax/Reports/index.js'
const defaultRoot = () => globalThis.process?.versions?.node ? new URL('../Data/parquet/OEM_BI_4466', import.meta.url).pathname
  : new URL('../../../../files/rooms/comaxDemo/usersRO/parquet/OEM_BI_4466', import.meta.url).pathname
const clone = x => structuredClone(x), roomFile = (roomWUrl, file) => `${roomWUrl}/report-studio/${file}`
const loadJson = async (url, ctx) => { const r = await wfetch2(url, { method: 'GET' }, ctx).catch(() => null); return r?.ok ? r.json() : null }
const loadSavedReport = async (roomWUrl, ctx) => {
  const assets = await loadJson(`${roomWUrl}/assets.json`, ctx), v = Array.isArray(assets) && assets.find(x => x.variantId == `${REPORT_ID}.reportStudio.latest`)
  return v && loadJson(v.url || roomFile(roomWUrl, `${REPORT_ID}.json`), ctx)
}
const slotsOf = r => [
  ...['executiveSummary', 'summary'].map(depth => ({ key: `report.${depth}`, label: `report / ${depth}`, depth, slot: r[depth] })),
  ...(r.sections || []).flatMap((sec, sectionIdx) => DEPTHS.map(depth => ({ key: `${sec.id}.${depth}`, label: `${sec.id} / ${depth}`, sectionId: sec.id, sectionIdx, depth, slot: sec[depth], section: sec })))
].filter(x => x.slot)
const withSlot = (r, key, fn) => { const n = clone(r), s = slotsOf(n).find(x => x.key == key); if (s) fn(s.slot, s, n); return n }
const slotProfile = s => s && { $: 'query-slot<verified-queries>querySlot', goal: s.goal, reactComp: s.reactComp, widget: s.widget, sql: s.sql }
const fdProfile = f => f && { $: 'full-data<verified-queries>fullData', description: f.description, grain: f.grain, columns: f.columns, perItemOnly: f.perItemOnly, viewSql: f.viewSql }
const sectionProfile = s => ({ $: 'report-section<verified-queries>section', id: s.id, title: s.title, goal: s.goal, caveats: s.caveats, reactComp: s.reactComp,
  executiveSummary: slotProfile(s.executiveSummary), summary: slotProfile(s.summary), inDepth: slotProfile(s.inDepth), fullData: fdProfile(s.fullData) })
const reportProfile = r => ({ $: 'verified-report<verified-queries>verifiedReport', title: r.title, description: r.description, whenToUse: r.whenToUse,
  routePhrases: r.routePhrases, questionsCovered: r.questionsCovered, caveats: r.caveats, reactComp: r.reactComp,
  executiveSummary: slotProfile(r.executiveSummary), summary: slotProfile(r.summary), sections: (r.sections || []).map(sectionProfile) })
const saveStudio = async (ctx, roomWUrl, report) => {
  const createdAt = Date.now(), reportUrl = roomFile(roomWUrl, `${REPORT_ID}.json`), tgpUrl = roomFile(roomWUrl, `${REPORT_ID}.tgp.json`), compUrl = roomFile(roomWUrl, `${RC_ID}.reactComp.json`)
  await Promise.all([
    wfetch2(reportUrl, { method: 'PUT', body: JSON.stringify(report), headers: {'content-type': 'application/json'} }, ctx),
    wfetch2(tgpUrl, { method: 'PUT', body: JSON.stringify(reportProfile(report)), headers: {'content-type': 'application/json'} }, ctx),
    wfetch2(compUrl, { method: 'PUT', body: JSON.stringify({ cmpId: RC_ID, urlsToLoad: URLS, reportId: REPORT_ID, savedAt: createdAt }),
      headers: {'content-type': 'application/json'} }, ctx)
  ])
  const assetsUrl = `${roomWUrl}/assets.json`, oldAssets = await loadJson(assetsUrl, ctx), assets = Array.isArray(oldAssets) ? oldAssets : [], ids = new Set([`${REPORT_ID}.reportStudio.latest`, `${RC_ID}.reportStudio.latest`])
  await wfetch2(assetsUrl, { method: 'PUT', body: JSON.stringify([
    ...assets.filter(v => !ids.has(v.variantId)),
    { variantId: `${REPORT_ID}.reportStudio.latest`, assetType: 'verifiedQueries', format: 'json', assetId: REPORT_ID, categories: ['reportStudio', 'latest'], url: reportUrl, tgpUrl, createdAt, sectionCount: (report.sections || []).length, questionCount: (report.questionsCovered || []).length },
    { variantId: `${RC_ID}.reportStudio.latest`, assetType: 'reactComp', assetId: RC_ID, categories: ['reportStudio', 'latest'], compId: RC_ID, urlsToLoad: URLS, url: compUrl, createdAt, rels: [{ rel: 'viewOf', asset: `${REPORT_ID}.reportStudio.latest` }] }
  ]), headers: {'content-type': 'application/json'} }, ctx)
}
const chatEdit = (text, key, report) => {
  const s = text.trim(), sql = s.match(/```sql\s*([\s\S]*?)```/i)?.[1]?.trim(), cmd = s.match(/^(?:set\s+)?(sql|goal|title)\s*:\s*([\s\S]+)/i)
  if (sql || cmd?.[1] == 'sql') return { report: withSlot(report, key, slot => { slot.sql = sql || cmd[2].trim() }), reply: 'Updated selected slot SQL.' }
  if (cmd?.[1] == 'goal') return { report: withSlot(report, key, slot => { slot.goal = cmd[2].trim() }), reply: 'Updated selected slot goal.' }
  if (cmd?.[1] == 'title') return { report: withSlot(report, key, (_, sel, r) => { sel.sectionIdx == null ? r.title = cmd[2].trim() : r.sections[sel.sectionIdx].title = cmd[2].trim() }), reply: 'Updated selected title.' }
  return { report, reply: 'Use set sql:, set goal:, set title:, or a fenced ```sql block.' }
}
const runSelected = async (ctx, report, sel, root) => {
  const res = await runReport.$runWithCtx(ctx.setVars({ reportsRegistry: [report], reportsRoot: root }), {
    reportId: REPORT_ID, registry: [report], root, scope: sel.sectionId ? 'none' : sel.depth, sections: sel.sectionId ? [sel.sectionId] : [], sectionDepth: sel.depth
  })
  const rows = sel.sectionId ? res.results?.sections?.[sel.sectionId]?.rows : res.results?.[sel.depth]
  const rc = (res.reactComps || []).find(c => c.slot == (sel.sectionId || sel.depth)) || { ...(sel.section?.reactComp || report.reactComp || {}), ...(sel.slot.reactComp || {}) }
  return { res, rows: Array.isArray(rows) ? rows : [], reactComp: { ...rc, rows: Array.isArray(rc.rows) ? rc.rows : Array.isArray(rows) ? rows : [] } }
}

ReactComp('reportStudio', {
  impl: comp({
    hFunc: (ctx, { initialReport, roomWUrl, reportsRoot, react: { h, hh, useMemo, useState } }) => () => {
      const [report, setReport] = useState(initialReport), [key, setKey] = useState(slotsOf(initialReport)[0]?.key), [run, setRun] = useState(null)
      const [view, setView] = useState('react'), [busy, setBusy] = useState(''), [draft, setDraft] = useState(''), [msgs, setMsgs] = useState([{ role: 'assistant', text: 'Tell me edits as set sql:, set goal:, set title:, or paste a fenced sql block.' }])
      const slots = useMemo(() => slotsOf(report), [report]), sel = slots.find(s => s.key == key) || slots[0], rows = run?.rows || [], cols = Object.keys(rows[0] || {}), Preview = dsls.react['react-comp'][run?.reactComp?.cmpId]
      const setSlot = (field, val) => setReport(r => withSlot(r, sel.key, slot => { slot[field] = val }))
      const send = text => { if (!text.trim()) return; const r = chatEdit(text, sel.key, report); setReport(r.report); setMsgs(m => [...m, { role: 'user', text }, { role: 'assistant', text: r.reply }]); setDraft('') }
      const doRun = async () => { setBusy('run'); setRun(await runSelected(ctx, report, sel, reportsRoot)); setView('react'); setBusy('') }
      const doSave = async () => { setBusy('save'); await saveStudio(ctx, roomWUrl, report); setMsgs(m => [...m, { role: 'assistant', text: 'Saved report profile and ReactComp binding to the room.' }]); setBusy('') }
      const btn = (txt, onClick, active) => h(`button:px-3 py-1.5 rounded-md text-sm font-medium ${active ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'} disabled:opacity-40`, { disabled: !!busy, onClick }, txt)
      const area = (label, value, onInput, rows, mono) => h('label:block text-xs text-slate-500 min-w-0', {}, label, h(`textarea:mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm resize-y ${mono ? 'font-mono whitespace-pre' : ''}`, { value: value || '', rows, dir: mono ? 'ltr' : 'auto', spellCheck: false, onInput: e => onInput(e.target.value) }))
      const chatPane = h('aside:w-[320px] shrink-0 border-r border-slate-200 bg-white flex flex-col min-w-0', {},
        h('div:p-4 border-b border-slate-200', {}, h('div:font-bold', {}, 'AI editor'), h('div:text-xs text-slate-500', {}, 'Edits the selected TGP slot profile.')),
        h('div:flex-1 overflow-y-auto p-3 space-y-2', {}, msgs.map((m, i) => h(`div:rounded-lg px-3 py-2 text-sm ${m.role == 'user' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`, { key: i }, m.text))),
        h('div:p-3 border-t border-slate-200 space-y-2', {}, btn('Set demo goal', () => send('set goal: Studio edited goal'), false),
          h('textarea:w-full h-24 rounded-md border border-slate-200 p-2 text-sm resize-none', { value: draft, placeholder: 'set goal: ...', onInput: e => setDraft(e.target.value) }),
          btn('Apply edit', () => send(draft), true)))
      const editorPane = h('section:min-w-0 overflow-y-auto p-4 space-y-3 border-r border-slate-200', {},
        h('select:w-full rounded-md border border-slate-200 bg-white p-2 text-sm', { value: sel?.key, onChange: e => { setKey(e.target.value); setRun(null) } }, slots.map(s => h('option', { key: s.key, value: s.key }, s.label))),
        area('goal', sel?.slot.goal, v => setSlot('goal', v), 3),
        area('sql', sel?.slot.sql, v => setSlot('sql', v), Math.min(24, Math.max(10, (sel?.slot.sql || '').split('\n').length + 1)), true))
      const resultPane = h('section:min-w-0 overflow-y-auto p-4 space-y-3 bg-white', {},
        h('div:flex items-center justify-between gap-2', {}, h('div:font-semibold', {}, 'Results'), h('div:flex gap-2', {}, btn('ReactComp', () => setView('react'), view == 'react'), btn('SQL rows', () => setView('sql'), view == 'sql'))),
        busy == 'run' && h('div:text-sm text-slate-500 animate-pulse', {}, 'running report sql...'),
        run?.res?.error && h('pre:text-xs text-red-600 bg-red-50 rounded-md p-3 whitespace-pre-wrap break-words', {}, String(run.res.error)),
        run && !run.res?.error && h('div:space-y-3', {},
          h('div:text-xs text-slate-500', {}, `${rows.length} rows | ReactComp: ${run.reactComp?.cmpId || 'none'}`),
          view == 'react' && (Preview ? hh(ctx, Preview, { spec: run.reactComp, send }) : h('div:text-sm text-slate-400', {}, 'No ReactComp for this slot.')),
          view == 'sql' && h('div:overflow-x-auto rounded-md border border-slate-200', {}, h('table:w-full text-xs', {},
            h('thead:bg-slate-50', {}, h('tr', {}, cols.map(c => h('th:px-2 py-1 text-left font-medium whitespace-nowrap', { key: c }, c)))),
            h('tbody', {}, rows.slice(0, 50).map((r, i) => h('tr:border-t border-slate-100', { key: i }, cols.map(c => h('td:px-2 py-1 whitespace-nowrap', { key: c }, String(r[c] ?? ''))))))))),
        !run && !busy && h('div:text-sm text-slate-400', {}, 'Run the selected slot to display SQL rows and the promotions ReactComp.'))
      return h('div:h-screen overflow-hidden bg-slate-50 text-slate-900 flex', { dir: 'ltr' },
        chatPane,
        h('main:flex-1 min-w-0 min-h-0 flex flex-col', {},
          h('header:h-14 shrink-0 bg-white border-b border-slate-200 px-4 flex items-center justify-between gap-3', {},
            h('div:min-w-0', {}, h('div:font-bold truncate', {}, 'Report studio'), h('div:text-xs text-slate-500 truncate', {}, `${roomWUrl} / ${sel?.label || ''}`)),
            h('div:flex gap-2 shrink-0', {}, btn(busy == 'run' ? 'Running...' : 'Run', doRun, true), btn(busy == 'save' ? 'Saving...' : 'Save', doSave))),
          h('div:flex-1 min-h-0 grid grid-cols-2 overflow-hidden', {}, editorPane, resultPane)))
    },
    enrichCtx: async ctx => {
      const roomWUrl = ctx.vars.roomWUrl || 'signedRoom://comaxDemo', root = ctx.vars.reportsRoot || defaultRoot()
      ctx = !globalThis.process?.versions?.node ? ctx.setVars({ categories: { ...ctx.vars.categories, gcshttpblockedbycors: true } }) : ctx
      const base = verifiedReportsRegistry.$runWithCtx(ctx).find(r => r.id == REPORT_ID)
      return ctx.setVars({ initialReport: await loadSavedReport(roomWUrl, ctx) || clone(base), roomWUrl, reportsRoot: root })
    },
    sampleCtxData: () => ({ vars: { roomWUrl: 'signedRoom://comaxDemo', roomId: 'comaxDemo', userId: 'ScreenshotService' } }),
    metadata: applet({ title: 'Report studio', icon: 'FlaskConical', showMessageInput: false })
  })
})
