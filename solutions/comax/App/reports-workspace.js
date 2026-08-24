import { dsls } from '@jb6/core'
import '@jb6/react'
import '@wonder/ui/applet.js'
import '@wonder/ui/viz/viz-index.js'
import '@wonder/db/room-lambda-client.js'
import './reports-workspace-lambda.js'

const {
  react: { ReactComp, 'react-comp': { comp }, 'react-metadata': { applet } },
  common: { data: { invokeSnippetInContext, testVerifiedSlot } }
} = dsls

const SLOT_DEPTHS = ['executiveSummary', 'summary', 'inDepth']
const gcsBase = roomId => `https://storage.googleapis.com/indiviai-wonder/${roomId}`
const unwrap = j => { const c = j?.content ?? j; return typeof c == 'string' ? JSON.parse(c) : c }
const fetchJson = async url => { const r = await fetch(`${url}?t=${Date.now()}`).catch(() => null); return r?.ok ? unwrap(await r.json()) : null }
const putJson = (base, file, content) => fetch(`${base}/${file}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) })

ReactComp('reportsWorkspace', {
  impl: comp({
    hFunc: (ctx, { roomId, verifiedVariants, uiLogger, react: { h, hh, useState } }) => () => {
      const base = gcsBase(roomId)
      const VizWidget = dsls.react['react-comp'].VizWidget
      const [variants, setVariants] = useState(verifiedVariants)
      const [sel, setSel] = useState(null)              // selected variantId
      const [working, setWorking] = useState(null)      // editable copy of the selected report payload
      const [runs, setRuns] = useState({})              // slotKey -> {running} | {res}
      const [widgetTexts, setWidgetTexts] = useState({})// slotKey -> widget-binding JSON text being edited
      const [sliceSqls, setSliceSqls] = useState({})    // sectionKey -> full_data slice sql being tried
      const [openSecs, setOpenSecs] = useState({})
      const [saving, setSaving] = useState(false)

      const byAsset = variants.reduce((g, v) => ({ ...g, [v.assetId]: [...(g[v.assetId] || []), v] }), {})
      const open = async variantId => {
        setSel(variantId); setWorking(null); setRuns({}); setWidgetTexts({}); setOpenSecs({})
        setWorking(await fetchJson(`${base}/${variantId}`))
      }
      const upd = fn => setWorking(w => { const n = structuredClone(w); fn(n); return n })
      const slotAt = (r, secIdx, depth) => secIdx == null ? r[depth] : r.sections[secIdx][depth]

      const run = async (key, slot, viewSql) => {
        setRuns(r => ({ ...r, [key]: { running: true } }))
        let res
        try {
          const wsCtx = ctx.setVars({ onLiveRepo: location.hostname == 'localhost' || undefined })
          res = await invokeSnippetInContext.$runWithCtx(wsCtx, testVerifiedSlot({ slot, viewSql })) || { error: 'no result (see roomLogger)' }
        } catch (e) { res = { error: String(e?.message || e) } }
        uiLogger?.info?.({ t: 'workspaceRun', key, rowCount: res?.rowCount, durMs: res?.durMs, error: res?.error }, {}, { ctx })
        setRuns(r => ({ ...r, [key]: { res } }))
      }

      const save = async () => {
        setSaving(true)
        const catalog = await fetchJson(`${base}/assets.json`) || []
        const ids = new Set(catalog.map(v => v.variantId))
        let n = catalog.filter(v => v.assetId == working.id).length
        let variantId = `${working.id}.verified.v${n}`
        while (ids.has(variantId)) variantId = `${working.id}.verified.v${++n}`
        await putJson(base, variantId, JSON.stringify(working, null, 1))
        const variant = { variantId, assetType: 'verifiedQueries', format: 'json', assetId: working.id,
          categories: ['verified', variantId.split('.').at(-1)], createdAt: Date.now(), url: `room://${roomId}/${variantId}`,
          sectionCount: (working.sections || []).length, questionCount: (working.questionsCovered || []).length,
          editedFrom: sel, editedBy: ctx.vars.userEmail || null }
        const next = [...catalog, variant]
        await putJson(base, 'assets.json', next)
        uiLogger?.info?.({ t: 'workspaceSave', variantId, editedFrom: sel }, {}, { ctx })
        setVariants(next.filter(v => v.assetType == 'verifiedQueries')); setSel(variantId); setSaving(false)
      }

      // --- small edit controls ---
      const inp = (label, value, onChange, mono) => h('label:block text-xs text-slate-500', {}, label,
        h(`input:mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-800 ${mono ? 'font-mono' : ''}`,
          { value: value ?? '', dir: 'auto', onInput: e => onChange(e.target.value) }))
      const area = (label, value, onChange, rows, mono) => h('label:block text-xs text-slate-500', {}, label,
        h(`textarea:mt-0.5 w-full rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-800 resize-y ${mono ? 'font-mono whitespace-pre' : ''}`,
          { value: value ?? '', rows: rows || 3, dir: mono ? 'ltr' : 'auto', spellCheck: false, onInput: e => onChange(e.target.value) }))

      const rowsTable = rows => h('div:mt-2 overflow-x-auto rounded-md border border-slate-200', {},
        h('table:w-full text-xs', {},
          h('thead:bg-slate-50 text-slate-500', {}, h('tr', {}, Object.keys(rows[0]).map(k => h('th:px-2 py-1 text-left font-medium whitespace-nowrap', { key: k }, k)))),
          h('tbody', {}, rows.slice(0, 20).map((r, i) => h('tr:border-t border-slate-100', { key: i },
            Object.keys(rows[0]).map(k => h('td:px-2 py-1 whitespace-nowrap text-slate-700', { key: k }, String(r[k] ?? ''))))))))

      const runResult = key => { const st = runs[key]
        return st && h('div:mt-2', {},
          st.running && h('div:text-xs text-slate-400 animate-pulse', {}, 'running...'),
          st.res?.error && h('pre:text-xs text-red-600 bg-red-50 rounded-md p-2 whitespace-pre-wrap break-words', {}, String(st.res.error).slice(0, 800)),
          st.res && !st.res.error && h('div', {},
            h('div:text-xs text-slate-500', {}, `${st.res.rowCount} rows · ${((st.res.durMs || 0) / 1000).toFixed(1)}s`),
            st.res.rows?.length > 0 && rowsTable(st.res.rows),
            (st.res.widgets || []).map((spec, i) => h('div:mt-2', { key: i, style: { direction: 'ltr' } }, hh(ctx, VizWidget, { spec: { width: 620, height: 300, ...spec } })))))
      }

      const slotCard = (secIdx, depth) => {
        const slot = slotAt(working, secIdx, depth)
        if (!slot) return null
        const key = `${secIdx == null ? 'report' : working.sections[secIdx].id}.${depth}`
        const widgetText = widgetTexts[key] ?? (slot.widget ? JSON.stringify(slot.widget, null, 1) : '')
        const widgetBroken = (() => { if (!widgetText.trim()) return false; try { JSON.parse(widgetText); return false } catch { return true } })()
        const setSlot = (field, value) => upd(r => { slotAt(r, secIdx, depth)[field] = value })
        return h('div:rounded-lg border border-slate-200 bg-white p-3 space-y-2', { key },
          h('div:flex items-center justify-between gap-2', {},
            h('span:text-xs font-semibold uppercase tracking-wide text-slate-400', {}, depth),
            h('button:px-3 py-1 rounded-md bg-slate-800 text-white text-xs font-medium hover:bg-slate-700 disabled:opacity-40', {
              disabled: runs[key]?.running, onClick: () => run(key, slotAt(working, secIdx, depth)) }, 'Run')),
          inp('goal', slot.goal, v => setSlot('goal', v)),
          area('sql ({{ROOT}} = parquet base)', slot.sql, v => setSlot('sql', v), Math.min(14, (String(slot.sql || '').match(/\n/g) || []).length + 2), true),
          h('div', {}, area('widget binding (JSON)', widgetText, v => {
            setWidgetTexts(t => ({ ...t, [key]: v }))
            try { const w = v.trim() ? JSON.parse(v) : undefined; upd(r => { slotAt(r, secIdx, depth).widget = w }) } catch {}
          }, 3, true), widgetBroken && h('div:text-xs text-amber-600 mt-0.5', {}, 'invalid JSON — last valid binding kept')),
          runResult(key))
      }

      const fullDataCard = secIdx => {
        const fd = working.sections[secIdx].fullData
        if (!fd) return null
        const secId = working.sections[secIdx].id, key = `${secId}.fullData`
        const setFd = (field, value) => upd(r => { r.sections[secIdx].fullData[field] = value })
        const slice = sliceSqls[key] ?? 'SELECT * FROM full_data LIMIT 10'
        return h('div:rounded-lg border border-dashed border-slate-300 bg-white p-3 space-y-2', { key },
          h('div:text-xs font-semibold uppercase tracking-wide text-slate-400', {}, 'fullData'),
          inp('description', fd.description, v => setFd('description', v)),
          inp('grain', fd.grain, v => setFd('grain', v)),
          inp('columns', fd.columns, v => setFd('columns', v)),
          fd.perItemOnly != null && inp('perItemOnly', fd.perItemOnly, v => setFd('perItemOnly', v), true),
          area('viewSql', fd.viewSql, v => setFd('viewSql', v), 8, true),
          h('div:flex items-end gap-2', {},
            h('div:flex-1', {}, area('try a slice (FROM full_data)', slice, v => setSliceSqls(s => ({ ...s, [key]: v })), 2, true)),
            h('button:px-3 py-1.5 rounded-md bg-slate-800 text-white text-xs font-medium hover:bg-slate-700 disabled:opacity-40', {
              disabled: runs[key]?.running,
              onClick: () => run(key, { sql: slice }, working.sections[secIdx].fullData.viewSql) }, 'Run slice')),
          runResult(key))
      }

      const sectionBlock = (sec, i) => {
        const isOpen = openSecs[sec.id]
        return h('div:rounded-xl border border-slate-200 bg-slate-50', { key: sec.id },
          h('button:w-full flex items-center justify-between gap-2 px-3 py-2', { onClick: () => setOpenSecs(o => ({ ...o, [sec.id]: !isOpen })) },
            h('span:text-sm font-semibold text-slate-700 truncate', { dir: 'auto' }, `${sec.id} — ${sec.title || ''}`),
            h(`L:${isOpen ? 'ChevronUp' : 'ChevronDown'}`, { size: 16 })),
          isOpen && h('div:px-3 pb-3 space-y-2', {},
            inp('title', sec.title, v => upd(r => { r.sections[i].title = v })),
            area('goal', sec.goal, v => upd(r => { r.sections[i].goal = v }), 2),
            area('caveats', sec.caveats, v => upd(r => { r.sections[i].caveats = v }), 2),
            ...SLOT_DEPTHS.map(d => slotCard(i, d)),
            fullDataCard(i)))
      }

      const reportPane = () => h('div:flex-1 min-w-0 p-4 space-y-3', {},
        h('div:flex items-center justify-between gap-3 flex-wrap', {},
          h('div', {},
            h('div:text-lg font-bold text-slate-800', { dir: 'auto' }, working.title),
            h('div:text-xs text-slate-400 font-mono', {}, sel)),
          h('button:px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 disabled:opacity-40', {
            disabled: saving, onClick: save }, saving ? 'Saving...' : 'Save as new version')),
        h('div:rounded-xl border border-slate-200 bg-white p-3 space-y-2', {},
          inp('title', working.title, v => upd(r => { r.title = v })),
          area('description', working.description, v => upd(r => { r.description = v }), 2),
          area('whenToUse', working.whenToUse, v => upd(r => { r.whenToUse = v }), 2),
          area('caveats', working.caveats, v => upd(r => { r.caveats = v }), 3),
          inp('questionsCovered (comma list)', (working.questionsCovered || []).join(','), v =>
            upd(r => { r.questionsCovered = v.split(',').map(s => s.trim()).filter(Boolean) }))),
        h('div:text-sm font-semibold text-slate-600 pt-1', {}, 'Report-level slots'),
        ...['executiveSummary', 'summary'].map(d => slotCard(null, d)),
        h('div:text-sm font-semibold text-slate-600 pt-1', {}, `Sections (${(working.sections || []).length})`),
        ...(working.sections || []).map(sectionBlock))

      const sidebar = () => h('div:w-full lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white lg:min-h-screen', {},
        h('div:p-3 space-y-1', {},
          Object.entries(byAsset).map(([assetId, vs]) => {
            const latest = vs.reduce((a, b) => (a.createdAt || 0) > (b.createdAt || 0) ? a : b)
            const active = sel && sel.startsWith(`${assetId}.`)
            return h('div', { key: assetId },
              h(`button:w-full text-left px-3 py-2 rounded-lg text-sm ${active ? 'bg-slate-800 text-white' : 'hover:bg-slate-100 text-slate-700'}`, {
                onClick: () => open(latest.variantId) },
                h('div:font-medium truncate', {}, assetId),
                h(`div:text-xs ${active ? 'text-slate-300' : 'text-slate-400'}`, {}, `${latest.sectionCount ?? '?'} sections · ${vs.length} version${vs.length > 1 ? 's' : ''}`)),
              active && vs.length > 1 && h('div:flex flex-wrap gap-1 px-3 py-1', {}, [...vs].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map(v =>
                h(`button:px-2 py-0.5 rounded-full text-[11px] border ${v.variantId == sel
                  ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 text-slate-500 hover:border-slate-400'}`, {
                  key: v.variantId, onClick: () => open(v.variantId) }, v.variantId.split('.').slice(1).join('.')))))
          })))

      return h('div:min-h-screen bg-slate-50 text-slate-900', { dir: 'ltr' },
        h('div:sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-2', {},
          h('L:FlaskConical', { size: 18, className: 'text-emerald-600' }),
          h('span:font-bold', {}, 'Reports workspace'),
          h('span:text-xs text-slate-400', {}, `${Object.keys(byAsset).length} reports · room ${roomId}`)),
        h('div:flex flex-col lg:flex-row', {},
          sidebar(),
          sel && !working && h('div:flex-1 p-8 text-sm text-slate-400', {}, 'loading report...'),
          working ? reportPane() : !sel && h('div:flex-1 p-8 text-sm text-slate-400', {}, 'Pick a report to view, test and edit its verified queries.')))
    },
    enrichCtx: async ctx => {
      const roomId = ctx.vars.roomWUrl?.match(/^\w+:\/\/([^/]+)/)?.[1] || ctx.vars.roomId || 'comaxDemo'
      const catalog = await fetchJson(`${gcsBase(roomId)}/assets.json`) || []
      const verifiedVariants = catalog.filter(v => v.assetType == 'verifiedQueries')
      ctx.vars.uiLogger?.info?.({ t: 'workspaceLoad', roomId, variants: verifiedVariants.length }, {}, { ctx })
      return ctx.setVars({ roomId, verifiedVariants, roomWUrl: ctx.vars.roomWUrl || `room://${roomId}` })
    },
    metadata: applet({ title: 'Reports workspace', icon: 'FlaskConical', showMessageInput: false })
  })
})
