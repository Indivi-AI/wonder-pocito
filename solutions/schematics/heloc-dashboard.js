// HELOC V2 — schematics' Sigma dashboard, now served from the CDC pipeline rather than the Databricks dump.
// This file holds LAYOUT ONLY. Every number is a cube metric NAME and every pixel is a shared viz widget:
// no sum(), no join, no ratio formula lives here. Business definitions live in schematics-cdc-cube.js.
// URL: localhost:3000/room/schematicsBI/applet/HelocDashboard
//
// TWO HORIZONS, AND THEY DO NOT MATCH. Clickouts come from CDC and run to within ~2 days; Meta spend arrives
// via the fb-connector and stops at SPEND_MAX. Past that date revenue exists and spend is zero, so ROI would
// read as infinite — the picker is capped there rather than letting the page render a number that is nonsense.
//
// AND A DAY IS NOT FINAL FOR ~21 DAYS. HELOC lenders confirm over weeks, so a recent day understates revenue
// and therefore ROI. The header says so on screen; see the cube limits for the measurement behind it.

import { dsls, jb } from '@jb6/core'
import '@jb6/common'
import '@jb6/react'
import '@wonder/ui/applet.js'
import '@wonder/db/db-drivers-live-repo.js'   // FS.* drivers: silver lives in files/rooms/schematicsBI, read via db:'local'
import '@wonder/bi/viz/viz-index.js'
import './schematics-cdc-cube.js'
import './demo-advance-day.js'   // the advance lambda the Next-day button calls

const {
  react: { ReactComp, 'react-comp': { comp }, 'react-metadata': { applet } },
  tgp: { 'ctx-enricher': { setupCube } },
  bi: { cube: { cdcAdPerformanceCube } },
  common: { Lambda: { advanceSchematicsDayLambda }, data: { cubeQuery, invokeSnippetInContext } }
} = dsls
const { wfetch2 } = jb.wonderUtils

Object.assign(jb.vizTheme, { palette: ['#2E7D32', '#455A64', '#1FA971', '#E8A317', '#7C3AED', '#0891B2'], accent: '#2E7D32' })

const INK = '#1A1A1A', MUTE = '#6B7280', LINE = '#E5E7EB'

// Every domain fact this applet needs is a registered Const, declared in schematics-cdc-cube.js next to the
// cube it describes. The applet is layout: it decides where a number goes, never which number exists or what
// it means. Adding a fourth buyer or moving the spend horizon is a profile edit, not a code change here.
const { helocVertical: VERTICAL, helocClients: CLIENTS, adHierarchy: LEVELS,
        spendHorizon: SPEND_MAX, maturityDays: MATURE_DAYS } = jb.coreRegistry.consts

// Column keys ARE metric names. The drill widget re-derives each ratio from its own num/den at every level,
// which is why revenue+spend and each client's leads must also be selected.
const TABLE_COLUMNS = [
  { key: 'revenue', label: 'Revenue', format: '$' },
  { key: 'spend', label: 'Spend', format: '$' },
  { key: 'profit', label: 'Profit', format: '$' },
  { key: 'roi_pct', label: 'ROI %', kind: 'ratio', num: 'revenue', den: 'spend', scale: 100, format: '%',
    heat: { mid: 110, span: 20, good: 'high' } },
  ...CLIENTS.flatMap(([id]) => [
    { key: `${id}_leads`, label: 'Leads', format: 'int' },
    { key: `${id}_sales`, label: 'Sales', format: 'int' },
    // L2S is re-derived from this client's own sales/leads at every drill level, never averaged down the tree
    { key: `${id}_l2s_pct`, label: 'L2S %', kind: 'ratio', num: `${id}_sales`, den: `${id}_leads`,
      scale: 100, format: '%' }
  ])
]
const TABLE_METRICS = ['revenue', 'spend', 'profit',
  ...CLIENTS.flatMap(([id]) => [`${id}_leads`, `${id}_sales`])]
const KPI_METRICS = ['revenue', 'spend', 'profit', 'roi_pct', 'cost_per_clickout', 'cpl', 'lead_to_sale_pct']

const TABLE_SQL = `select ${LEVELS.join(', ')}, ${TABLE_METRICS.join(', ')} group by ${LEVELS.map((_, i) => i + 1).join(', ')}`
const KPI_SQL = `select ${KPI_METRICS.join(', ')}`

// age is measured against the PIPELINE's asOf, not the browser's clock — a historical dataset viewed today
// would otherwise report every day as long-settled, and the maturity warning would never fire. See demo-advance-day.js.
const daysBetween = (from, to) => Math.floor((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000)
const ROOM = 'signedRoom://schematicsBI'
const readRoomJson = async (path, ctx, fallback) => {
  try { const r = await wfetch2(`${ROOM}/${path}`, { method: 'GET' }, ctx); return r.ok ? await r.json() : fallback } catch { return fallback }
}

ReactComp('HelocDashboard', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh, useState, useEffect } }) => () => {
      const VizWidget = dsls.react['react-comp'].VizWidget
      // defaults to the window that is actually BUILT. A per-period silver has no rows for an unbuilt day —
      // it raises "No files found" — so the pickers must stay inside what buildCdcRange/buildCdcGold produced.
      const [from, setFrom] = useState('2026-05-15'), [to, setTo] = useState('2026-05-17')
      const [rows, setRows] = useState(null), [kpi, setKpi] = useState(null)
      const [err, setErr] = useState(null), [nonce, setNonce] = useState(0)
      const [clock, setClock] = useState(null), [runs, setRuns] = useState([]), [busy, setBusy] = useState(false)

      // the clock and the ETL run log, both re-read after every advance
      useEffect(() => { (async () => {
        const c = await readRoomJson('usersRO/pipeline-state.json', ctx, null)
        setClock(c)
        setRuns(c?.lastRun ? [c.lastRun] : [])
      })() }, [nonce])

      // the ONE kind of SQL a dashboard legitimately owns: which slice of which dimension
      const where = `vertical = '${VERTICAL}'`
      // a cube whose wUrl carries ${period} needs the range as its queryPeriod — `from..to` is the spec
      // expandPeriods provides for exactly this, and it is anchored to the DATA, not to now()
      const period = `${from}..${to}`

      useEffect(() => {
        let live = true
        ;(async () => {
          setErr(null); setRows(null); setKpi(null)
          try {
            const cubeCtx = ctx.setVars({ db: ctx.vars.db || 'local' })
            const gold = await cubeCtx.run(setupCube(cdcAdPerformanceCube(), period))
            const [t, k] = await Promise.all([
              gold.run(cubeQuery({ sql: TABLE_SQL, where })),
              gold.run(cubeQuery({ sql: KPI_SQL, where }))
            ])
            if (!live) return
            setRows(t || []); setKpi(k?.[0] || {})
          } catch (e) { live && setErr(String(e?.message || e)) }
        })()
        return () => { live = false }
      }, [period, nonce])

      const c = kpi || {}
      const tile = (label, key) => ({ label, value: +c[key] || 0, format: key.endsWith('_pct') ? '%' : '$' })
      const items = [tile('Revenue', 'revenue'), tile('Sum of spend', 'spend'), tile('Profit', 'profit'),
        tile('ROI %', 'roi_pct'), tile('Cost per Clickout', 'cost_per_clickout'), tile('CPL', 'cpl'),
        tile('L2S %', 'lead_to_sale_pct')]

      // ONE day per click: build the day that just arrived, re-mature the day that just settled.
      const advance = async () => {
        setBusy(true); setErr(null)
        try { await ctx.run(invokeSnippetInContext(advanceSchematicsDayLambda())); setNonce(n => n + 1) }
        catch (e) { setErr(String(e?.message || e)) } finally { setBusy(false) }
      }
      const immature = clock && daysBetween(to, clock.asOf) < MATURE_DAYS
      const pastSpend = to > SPEND_MAX
      const dateBox = (label, val, set) =>
        h('div:flex-1 min-w-[220px]', {},
          h('div', { style: { fontSize: '12px', fontWeight: 600, color: INK, marginBottom: '5px' } }, label),
          h('input', { type: 'date', value: val, max: SPEND_MAX, onChange: e => set(e.target.value),
            style: { width: '100%', border: `1px solid ${LINE}`, borderRadius: '6px', padding: '8px 10px',
              fontSize: '13px', color: val ? INK : MUTE, background: '#fff', boxSizing: 'border-box' } }))
      const banner = (bg, fg, text) => h('div', { style: { margin: '0 20px 12px', padding: '10px 12px',
        borderRadius: '8px', background: bg, color: fg, fontSize: '12px' } }, text)

      return h('div', { style: { background: '#F4F5F7', minHeight: '100vh', fontFamily: "'Inter', system-ui, sans-serif" } },
        h('div', { style: { background: '#fff', borderBottom: `1px solid ${LINE}`, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '14px' } },
          h('div', { style: { fontSize: '15px', fontWeight: 700, color: INK } }, 'HELOC V2'),
          h('div', { style: { fontSize: '12px', color: MUTE } },
            clock ? `pipeline as of ${clock.asOf} · spend through ${SPEND_MAX}` : `spend through ${SPEND_MAX}`),
          h('div:flex-1'),
          h('button', { onClick: advance, disabled: busy,
            style: { border: 'none', borderRadius: '6px', background: busy ? '#9CA3AF' : '#2E7D32', color: '#fff',
              fontSize: '12px', fontWeight: 600, padding: '6px 14px', marginRight: '8px',
              cursor: busy ? 'wait' : 'pointer' } }, busy ? 'Running ETLs…' : 'Next day \u25b6'),
          h('button', { onClick: () => setNonce(n => n + 1),
            style: { border: `1px solid ${LINE}`, borderRadius: '6px', background: '#fff', color: INK, fontSize: '12px', padding: '6px 12px', cursor: 'pointer' } }, '↻ Refresh')),

        h('div', { style: { padding: '16px 20px', display: 'flex', gap: '16px', flexWrap: 'wrap' } },
          dateBox('Click Date (from)', from, setFrom),
          dateBox('Click Date (to)', to, setTo)),

        pastSpend && banner('#FEF2F2', '#B91C1C',
          `Spend data ends ${SPEND_MAX}. Beyond it revenue exists with zero spend, so ROI and profit are meaningless.`),
        immature && !pastSpend && banner('#FFF7E6', '#92400E',
          `This window is younger than ${MATURE_DAYS} days. HELOC payouts confirm over weeks, so revenue — and therefore ROI — is still rising.`),
        err && banner('#FEF2F2', '#B91C1C', err),

        h('div', { style: { padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: '16px' } },
          !kpi && !err && h('div', { style: { color: MUTE, fontSize: '13px' } }, 'Loading…'),
          kpi && hh(ctx, VizWidget, { spec: { kind: 'kpi', items, width: 2000 } }),
          rows && hh(ctx, VizWidget, { spec: { kind: 'drillTable', title: 'Analysis by Meta Campaign, Ad Set and Ad',
            levels: LEVELS, levelLabel: 'Account / Campaign / Ad set / Ad', rows, columns: TABLE_COLUMNS,
            groups: [{ label: '', span: 4 }, ...CLIENTS.map(([, label]) => ({ label, span: 3 }))],
            maxHeight: 520 } }),
          runs.length > 0 && h('div', { style: { background: '#fff', border: `1px solid ${LINE}`, borderRadius: '10px', padding: '12px 14px' } },
            h('div', { style: { fontSize: '13px', fontWeight: 600, color: INK, marginBottom: '8px' } }, 'Pipeline runs'),
            h('table', { style: { borderCollapse: 'collapse', width: '100%', fontSize: '12px' } },
              h('thead', {}, h('tr', {}, ['as of', 'new day', 'matured day', 'rows built', 'rows re-matured', 'duration', ''].map((c, i) =>
                h('th', { key: i, style: { textAlign: i > 2 ? 'right' : 'left', padding: '4px 8px', color: MUTE, fontWeight: 600, borderBottom: `1px solid ${LINE}` } }, c)))),
              h('tbody', {}, runs.map(r => h('tr', { key: r.ts },
                [r.asOf, r.asOf, r.matured, (+r.freshObjs).toLocaleString(), (+r.maturedObjs).toLocaleString(),
                 `${(r.ms / 1000).toFixed(1)}s`, r.status].map((v, i) =>
                  h('td', { key: i, style: { textAlign: i > 2 ? 'right' : 'left', padding: '4px 8px', color: i === 6 ? '#2E7D32' : INK,
                    fontVariantNumeric: 'tabular-nums' } }, String(v))))))),
            h('div', { style: { fontSize: '11px', color: MUTE, marginTop: '6px' } },
              'Each advance builds the newly-arrived day at the default lag and REBUILDS the day 21 back at lagDays 21 — that second build is what makes revenue final.')),
          rows && h('div', { style: { fontSize: '11px', color: MUTE } },
            'Revenue and sales are settled figures from the links_tracking_payouts ledger. A client that never ' +
            'reports a disposition shows 0 sales — that is unreported, not unsold, so L2S% compares reporting ' +
            'habits as much as performance.')))
    },
    metadata: applet({ title: 'HELOC V2', icon: 'BarChart3', showMessageInput: false })
  })
})
