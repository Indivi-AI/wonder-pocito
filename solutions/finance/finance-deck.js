import { dsls } from '@jb6/core'
import '@jb6/react'
import '@jb6/react/reveal.js'
import '@wonder/ui/applets/applet.js'

const { react: { ReactComp, 'react-comp': { comp }, 'react-metadata': { applet } }, tgp: { 'ctx-enricher': { loadReveal } } } = dsls

const ORANGE = '#FF4800', INK = '#1A1A1A', SUB = '#5A5A5A', MUTE = '#8A8A8A', LINE = '#E6E6E8'
// localhost: raw comp view over local source; published: the FinanceDemo copy that lives in this deck's own room (self-contained — data+lambdas copied into 4c7ef0)
const DEMO_URL = globalThis.location?.hostname == 'localhost'
  ? '/jb6_packages/react/react-comp-view.html?cmpId=FinanceDemo&urlsToLoad=@wonder-admin/finance/finance-demo.js&logo=payoneer'
  : 'https://staging.indivi.ai/room/4c7ef0/applet/FinanceDemo?logo=payoneer'
const FONT_CSS = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
.reveal{font-family:'Inter',system-ui,sans-serif}
.reveal h1,.reveal h2,.reveal h3{font-family:'Inter',sans-serif;font-weight:800;letter-spacing:-0.02em;text-transform:none}
.reveal .slides section{text-align:left}`

// demo-slide shortcut buttons → append a param to the live demo's URL (deep-links its screen / opens the report builder)
const DEMO_TABS = [['Flow 1 · Home', ''], ['Flows 2 & 3', '&screen=reports'], ['Create report', '&builder=1'], ['Ask AI', '&screen=ask']]
// hand-authored SVG of the attached data-flow (all boxes & words preserved; grouped by trust boundary)
const ARCH_SVG = `<svg viewBox="0 0 1000 540" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;font-family:Inter,system-ui,sans-serif">
  <defs>
    <marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#5A5A5A"/></marker>
    <marker id="aho" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#FF4800"/></marker>
    <marker id="ahl" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#9AA0A6"/></marker>
  </defs>
  <rect x="16" y="16" width="710" height="480" rx="16" fill="none" stroke="#FF4800" stroke-width="1.5" stroke-dasharray="7 6"/>
  <text x="34" y="42" fill="#FF4800" font-size="13" font-weight="700" letter-spacing="1.5">YOUR AWS CLOUD</text>
  <rect x="760" y="40" width="224" height="440" rx="16" fill="none" stroke="#C9CCD2" stroke-width="1.5" stroke-dasharray="7 6"/>
  <text x="778" y="64" fill="#8A8A8A" font-size="13" font-weight="700" letter-spacing="1.5">USER DEVICE</text>
  <line x1="190" y1="102" x2="234" y2="150" stroke="#5A5A5A" stroke-width="1.5" marker-end="url(#ah)"/>
  <rect x="199" y="110" width="28" height="16" fill="#fff"/>
  <text x="213" y="123" text-anchor="middle" font-size="12" font-weight="700" fill="#5A5A5A">ETL</text>
  <line x1="162" y1="358" x2="298" y2="252" stroke="#5A5A5A" stroke-width="1.5" marker-end="url(#ah)"/>
  <rect x="40" y="70" width="150" height="54" rx="12" fill="#F7F7F8" stroke="#E6E6E8"/>
  <text x="115" y="102" text-anchor="middle" font-size="15" font-weight="600" fill="#1A1A1A">Payoneer CDC</text>
  <rect x="232" y="118" width="200" height="146" rx="14" fill="#FFFFFF" stroke="#E6E6E8" stroke-dasharray="4 4"/>
  <text x="248" y="142" font-size="13" font-weight="700" fill="#8A8A8A">AWS bucket</text>
  <rect x="272" y="150" width="150" height="40" rx="10" fill="#EDEEF0" stroke="#E6E6E8"/>
  <rect x="266" y="156" width="150" height="40" rx="10" fill="#F7F7F8" stroke="#E6E6E8"/>
  <text x="341" y="181" text-anchor="middle" font-size="13.5" font-weight="600" fill="#1A1A1A">User Directory</text>
  <rect x="300" y="200" width="150" height="50" rx="10" fill="#E4E6E9" stroke="#E6E6E8"/>
  <rect x="294" y="205" width="150" height="50" rx="10" fill="#EDEEF0" stroke="#E6E6E8"/>
  <rect x="288" y="210" width="150" height="50" rx="10" fill="#F7F7F8" stroke="#E6E6E8"/>
  <text x="363" y="240" text-anchor="middle" font-size="13" font-weight="600" fill="#1A1A1A">transactions.parquet</text>
  <rect x="40" y="358" width="150" height="54" rx="12" fill="#F7F7F8" stroke="#E6E6E8"/>
  <text x="115" y="390" text-anchor="middle" font-size="15" font-weight="600" fill="#1A1A1A">Report API</text>
  <rect x="512" y="44" width="182" height="58" rx="12" fill="#F7F7F8" stroke="#E6E6E8"/>
  <text x="603" y="70" text-anchor="middle" font-size="14" font-weight="600" fill="#1A1A1A">Auth Lambda</text>
  <text x="603" y="90" text-anchor="middle" font-size="11.5" font-weight="500" fill="#5A5A5A">your IdP → signed URLs</text>
  <rect x="800" y="180" width="176" height="84" rx="12" fill="#F7F7F8" stroke="#E6E6E8"/>
  <text x="888" y="227" text-anchor="middle" font-size="15" font-weight="700" fill="#1A1A1A">Browser (user)</text>
  <rect x="808" y="92" width="156" height="48" rx="12" fill="#F7F7F8" stroke="#E6E6E8"/>
  <text x="886" y="122" text-anchor="middle" font-size="14.5" font-weight="600" fill="#1A1A1A">Local Cache</text>
  <rect x="808" y="300" width="156" height="52" rx="12" fill="#F7F7F8" stroke="#E6E6E8"/>
  <text x="886" y="332" text-anchor="middle" font-size="14.5" font-weight="600" fill="#1A1A1A">Web Assembly</text>
  <line x1="40" y1="510" x2="960" y2="510" stroke="#E6E6E8"/>
  <text x="40" y="532" font-size="13" fill="#5A5A5A"><tspan font-weight="700" fill="#1A1A1A">How a query runs — </tspan><tspan fill="#FF4800" font-weight="700">1</tspan> authenticate via your IdP   <tspan fill="#FF4800" font-weight="700">2</tspan> receive signed URLs   <tspan fill="#FF4800" font-weight="700">3</tspan> read only the needed subsections   <tspan fill="#FF4800" font-weight="700">4</tspan> run SQL in-browser</text>
  <g class="fragment" data-fragment-index="1">
    <line x1="800" y1="205" x2="602" y2="106" stroke="#5A5A5A" stroke-width="1.5" stroke-dasharray="5 4" marker-start="url(#ah)" marker-end="url(#ah)"/>
    <rect x="686" y="170" width="66" height="18" fill="#fff"/>
    <text x="719" y="184" text-anchor="middle" font-size="13" font-weight="600" fill="#5A5A5A">OAuth 2.0</text>
    <circle cx="672" cy="180" r="11" fill="#FF4800"/><text x="672" y="185" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">1</text>
  </g>
  <g class="fragment" data-fragment-index="2">
    <rect x="682" y="138" width="76" height="18" fill="#fff"/>
    <text x="719" y="152" text-anchor="middle" font-size="13" font-weight="600" fill="#5A5A5A">Signed URLs</text>
    <circle cx="668" cy="148" r="11" fill="#FF4800"/><text x="668" y="153" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">2</text>
  </g>
  <g class="fragment" data-fragment-index="3">
    <line x1="438" y1="214" x2="798" y2="214" stroke="#FF4800" stroke-width="1.5" marker-end="url(#aho)"/>
    <line x1="438" y1="222" x2="798" y2="222" stroke="#FF4800" stroke-width="1.5" marker-end="url(#aho)"/>
    <line x1="438" y1="230" x2="798" y2="230" stroke="#FF4800" stroke-width="1.5" marker-end="url(#aho)"/>
    <text x="458" y="187" font-size="13" font-weight="700" fill="#FF4800">Wonder Fast Query</text>
    <text x="458" y="205" font-size="12" font-weight="600" fill="#5A5A5A">parallel subsection reads</text>
    <circle cx="440" cy="183" r="11" fill="#FF4800"/><text x="440" y="188" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">3</text>
  </g>
  <g class="fragment" data-fragment-index="4">
    <line x1="888" y1="264" x2="888" y2="298" stroke="#5A5A5A" stroke-width="1.5" marker-end="url(#ah)"/>
    <line x1="888" y1="180" x2="888" y2="140" stroke="#5A5A5A" stroke-width="1.5" marker-end="url(#ah)"/>
    <circle cx="910" cy="278" r="11" fill="#FF4800"/><text x="910" y="283" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">4</text>
  </g>
  <g class="fragment" data-fragment-index="5">
    <rect x="536" y="296" width="176" height="70" rx="12" fill="#FAFAFB" stroke="#C9CCD2" stroke-dasharray="5 4"/>
    <text x="624" y="327" text-anchor="middle" font-size="14" font-weight="600" fill="#1A1A1A">Fallback Lambda</text>
    <text x="624" y="347" text-anchor="middle" font-size="14" font-weight="600" fill="#1A1A1A">(thin clients)</text>
    <line x1="566" y1="296" x2="444" y2="250" stroke="#9AA0A6" stroke-width="1.5" stroke-dasharray="6 5" marker-end="url(#ahl)"/>
    <line x1="712" y1="320" x2="800" y2="246" stroke="#9AA0A6" stroke-width="1.5" stroke-dasharray="6 5" marker-end="url(#ahl)"/>
    <text x="505" y="286" text-anchor="end" font-size="13" font-weight="600" fill="#9AA0A6">Wonder Fast Query</text>
  </g>
</svg>`
// step pricing — one flat fee for your whole user band; never billed per user (except the open-ended top tier)
const BASE = '$10,000'  // permanent monthly base — always charged from the first user, stacks under every step
// [band, fee, sub, staircase height] — each fee stacks on top of the base
const STEPS = [
  ['Up to 10,000 users', 'Included', 'in the base', '34%'],
  ['Up to 25,000 users', '+ $15,000', '/ mo flat', '58%'],
  ['Up to 100,000 users', '+ $30,000', '/ mo flat', '80%'],
  ['Above 100,000', '+ $1', '/ user · yr', '100%']
]
const WORKED = [['20,000 users', '$10,000 base + $15,000 = $25,000 / mo'], ['250,000 users', '$10,000 + $30,000 + 150k×$1/yr = $52,500 / mo']]
const CRITERIA = [
  ['Integration time', '2–4 weeks, require setting the ETL, Auth Lambda, Report API and our React component'],
  ['Time to deliver a new chart / table', 'Minutes, can be defined in the UI and set to some/all users'],
  ['PDF branded export (compliance)', 'Built — branded print covers, A4, charts kept whole (Reports + Leadership board PDF).'],
  ['Custom reporting (self-serve)', 'Built, filters + column chooser'],
  ['Multi-role support', 'Built'],
  ['Monitoring of customer usage', 'Built in'],
  ['Tech stack', 'React, Iceberg, DuckDB'],
  ['UI developer headcount', 'Minimal, only integrations'],
  ['Costs', 'Next Slide']
]
// gantt: bar positions in weeks on a 12-week axis
const PLAN = [
  { name: 'Pilot in Production', sub: '2–4 weeks · limited merchant cohort', chipTxt: 'MY ACCOUNT INTEGRATION', bars: [{ from: 0, to: 2, solid: true }, { from: 2, to: 4 }] },
  { name: 'Gradual Rollout', sub: '2–8 weeks', bars: [{ from: 4, to: 6, solid: true }, { from: 6, to: 12 }] },
  { name: 'Quality Guard', sub: 'Monitor, evaluate & improve · 24h SLA', bars: [{ from: 2, to: 12, faint: true }], tail: 'PERPETUAL →' }
]

ReactComp('FinanceDeck', {
  impl: comp({
    hFunc: (ctx, { reveal, react: { h, useRef, useEffect, useState } }) => () => {
      const host = useRef()
      const [demoParam, setDemoParam] = useState('')
      useEffect(() => reveal.mount(host.current).disconnect, [])

      const H = (txt, sub) => [h('h2', { style: { margin: '0 0 6px', fontSize: '1.15em', color: INK } }, txt),
        sub && h('p', { style: { margin: '0 0 22px', fontSize: '0.55em', color: SUB } }, sub)]
      const chip = (txt, tone) => h('span', { style: { fontSize: '0.42em', fontWeight: 700, color: tone, background: tone + '18', border: `1px solid ${tone}55`, borderRadius: '99px', padding: '3px 12px', whiteSpace: 'nowrap' } }, txt)
      const orangeBtn = { fontSize: '0.45em', fontWeight: 700, color: '#fff', background: ORANGE, border: 'none', borderRadius: '9px', padding: '10px 20px', cursor: 'pointer' }
      const tabBtn = a => ({ fontSize: '0.45em', fontWeight: 700, cursor: 'pointer', borderRadius: '9px', padding: '9px 18px', color: a ? '#fff' : INK, background: a ? ORANGE : '#fff', border: `1px solid ${a ? ORANGE : LINE}` })
      const fullscreen = e => e.currentTarget.closest('section').querySelector('iframe').requestFullscreen()

      return h('div:reveal', { ref: host, style: { position: 'absolute', inset: 0, background: '#fff' } }, h('style', {}, FONT_CSS), h('div:slides', {},

        // 1 · Live demo — shortcut buttons + full screen
        h('section', {},
          h('div:flex items-center justify-between', { style: { margin: '0 0 14px', flexWrap: 'wrap', gap: '10px' } },
            h('div:flex items-center gap-2', {},
              h('span', { style: { fontWeight: 800, color: INK } }, 'payoneer'), h('span', { style: { color: ORANGE, fontWeight: 800 } }, '×'),
              h('span', { style: { fontWeight: 600, color: SUB } }, 'indivi'),
              h('span', { style: { fontSize: '0.5em', color: MUTE, marginLeft: '8px' } }, 'Data Visualization — live POC')),
            h('button', { style: orangeBtn, onClick: fullscreen }, '⛶  Full screen')),
          h('div:flex items-center gap-2', { style: { margin: '0 0 12px', flexWrap: 'wrap' } },
            ...DEMO_TABS.map(([label, p], i) => h('button', { key: i, style: tabBtn(demoParam == p), onClick: () => setDemoParam(p) }, label))),
          h('iframe', { src: DEMO_URL + demoParam, allowFullScreen: true, style: { width: '100%', height: '600px', border: `1px solid ${LINE}`, borderRadius: '14px', background: '#fff' } })),

        // 2 · Architecture — the data-flow diagram + one security line
        h('section', {}, ...H('Architecture'),
          h('div', { style: { margin: '18px 0 20px' }, dangerouslySetInnerHTML: { __html: ARCH_SVG } }),
          h('p', { style: { fontSize: '0.52em', color: INK, fontWeight: 600, borderLeft: `4px solid ${ORANGE}`, paddingLeft: '14px', lineHeight: 1.4 } },
            'Our analyticalDB sits over Iceberg in your cloud, and data leaves your cloud only via signed URLs to the user’s browser')),

        // 3 · Vendor scorecard
        h('section', {}, ...H('Vendor Comparison'),
          h('div', { style: { fontSize: '0.42em' } }, ...CRITERIA.map(([c, a], i) =>
            h('div:flex', { key: i, style: { borderBottom: `1px solid ${LINE}`, padding: '7px 4px', gap: '16px' } },
              h('span', { style: { fontWeight: 700, color: INK, minWidth: '270px' } }, c), h('span', { style: { color: SUB, flex: 1 } }, a))))),

        // 4 · Pricing — permanent $10k/mo base + one flat step per user band (never per user); base stacks under every step
        h('section', {}, ...H('Pricing', 'One flat step per band. The $10,000/mo base is always charged from the first user.'),
          h('div:flex', { style: { alignItems: 'flex-end', gap: '14px', height: '228px', margin: '10px 0 10px' } },
            ...STEPS.map(([band, fee, sub, ht], i) => h('div', { key: i, style: { flex: 1, display: 'flex', flexDirection: 'column', height: '100%' } },
              h('div', { style: { flex: 1, display: 'flex', alignItems: 'flex-end' } },
                h('div', { style: { width: '100%', height: ht, background: ORANGE, opacity: 0.78 + i * 0.07, borderRadius: '12px 12px 0 0', padding: '12px 15px', color: '#fff' } },
                  h('div', { style: { fontSize: '0.6em', fontWeight: 800 } }, fee),
                  h('div', { style: { fontSize: '0.34em', fontWeight: 600, opacity: 0.9 } }, sub))),
              h('div', { style: { fontSize: '0.38em', color: INK, fontWeight: 700, marginTop: '8px', textAlign: 'center' } }, band)))),
          h('div:flex items-center', { style: { gap: '12px', background: ORANGE, color: '#fff', borderRadius: '12px', padding: '11px 20px', margin: '0 0 14px' } },
            h('span', { style: { fontSize: '0.4em', fontWeight: 800, color: ORANGE, background: '#fff', borderRadius: '99px', padding: '3px 13px' } }, 'BASE'),
            h('span', { style: { fontSize: '0.66em', fontWeight: 800 } }, BASE),
            h('span', { style: { fontSize: '0.44em', fontWeight: 600, opacity: 0.95 } }, '/ mo')),
          h('div', { style: { borderTop: `1px solid ${LINE}`, paddingTop: '14px', display: 'flex', gap: '44px', flexWrap: 'wrap' } },
            ...WORKED.map(([label, calc], i) => h('div', { key: i },
              h('span', { style: { fontSize: '0.42em', color: SUB, fontWeight: 600 } }, `${label} → `),
              h('span', { style: { fontSize: '0.42em', color: ORANGE, fontWeight: 800 } }, calc))))),

        // 5 · Plan
        h('section', {},
          h('div', { style: { fontSize: '0.42em', fontWeight: 800, letterSpacing: '0.2em', color: ORANGE, marginBottom: '8px', fontFamily: 'monospace' } }, 'IMPLEMENTATION PLAN'),
          ...H('Timeline', ''),
          h('div:flex', { style: { margin: '4px 0 0' } },
            h('div', { style: { flex: '0 0 34%' } }),
            h('div', { style: { flex: 1, position: 'relative', height: '18px' } },
              ...[0, 2, 4, 6, 8, 10, 12].map(w => h('span', { key: w, style: { position: 'absolute', left: `${w / 12 * 100}%`, fontSize: '0.35em', color: MUTE, fontFamily: 'monospace' } }, w == 0 ? 'wk 0' : String(w))))),
          ...PLAN.map((r, i) => h('div:flex items-center', { key: i, style: { borderTop: `1px solid ${LINE}`, padding: '20px 0' } },
            h('div', { style: { flex: '0 0 34%', paddingRight: '18px' } },
              h('div', { style: { fontWeight: 800, fontSize: '0.62em', color: INK } }, r.name),
              h('div', { style: { fontSize: '0.42em', color: SUB, marginTop: '4px' } }, r.sub),
              r.chipTxt && h('div', { style: { marginTop: '8px' } }, chip(r.chipTxt, ORANGE))),
            h('div', { style: { flex: 1, position: 'relative', height: '28px' } },
              ...[0, 2, 4, 6, 8, 10, 12].map(w => h('div', { key: 'g' + w, style: { position: 'absolute', left: `${w / 12 * 100}%`, top: 0, bottom: 0, width: '1px', background: LINE } })),
              ...r.bars.map((b, j) => h('div', { key: j, style: { position: 'absolute', top: '5px', height: '18px', left: `${b.from / 12 * 100}%`, width: `${(b.to - b.from) / 12 * 100}%`,
                background: b.faint ? `linear-gradient(90deg, ${ORANGE}30, ${ORANGE}0A)` : b.solid ? ORANGE : ORANGE + '55',
                borderRadius: r.bars.length == 1 ? '9px 0 0 9px' : j == 0 ? '9px 0 0 9px' : '0 9px 9px 0' } })),
              r.tail && h('span', { style: { position: 'absolute', right: '10px', top: '8px', fontSize: '0.35em', fontWeight: 700, color: ORANGE, fontFamily: 'monospace', letterSpacing: '0.12em' } }, r.tail)))),
          h('p', { style: { fontSize: '0.68em', fontWeight: 800, color: INK, marginTop: '28px', borderTop: `1px solid ${LINE}`, paddingTop: '22px' } },
            'Live in production within a month — ', h('span', { style: { color: ORANGE } }, 'full rollout in 1–3 months.')))))
    },
    enrichCtx: loadReveal('white')
  }),
  metadata: applet({ title: 'Payoneer Deck', icon: 'Presentation', showMessageInput: false })
})
