// Comax semantic-model explorer as a Wonder reactComp.
// The rich rendering (histograms, pies, SVG graph, filtering) is proven string-HTML from the
// standalone viewer; the comp injects it once and wires the imperative interactions in a useEffect,
// scoped to its own root so nothing leaks onto the host page.
import { dsls } from '@jb6/core'
import '@jb6/react'
import { comaxSchema } from '../../../../files/rooms/comaxDemo/usersRO/schema/comax_semantic_schema.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

const STYLE = `
  #comaxRoot{--bg:#0e1014;--panel:#161922;--panel2:#1d212c;--line:#2a2f3b;--line2:#353b49;
    --ink:#e8ebf1;--muted:#98a1b2;--dim:#5b6474;
    --key:#f6c177;--fk:#6ea8fe;--measure:#7ee0b8;--date:#5bc8c0;
    --flag:#b39ddb;--dim-c:#e88bb0;--code:#e0a878;--text:#9aa8bd;--empty:#4a5160;--rate:#d98e6a;
    --red:#f2777a;--mono:"SF Mono",ui-monospace,Menlo,Consolas,monospace;
    background:var(--bg);color:var(--ink);
    font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5;display:block;min-height:100vh}
  #comaxRoot *{box-sizing:border-box}
  #comaxRoot .wrap{max-width:1200px;margin:0 auto;padding:0 20px}
  #comaxRoot header{padding:30px 0 18px;border-bottom:1px solid var(--line)}
  #comaxRoot h1{margin:0 0 6px;font-size:25px;letter-spacing:-.3px}
  #comaxRoot .sub{color:var(--muted);font-size:14.5px;max-width:900px}
  #comaxRoot .legend{display:flex;gap:7px;flex-wrap:wrap;margin:14px 0 2px;font-size:11.5px}
  #comaxRoot .rl{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:16px;
    border:1px solid var(--line);color:var(--muted);font-family:var(--mono);font-weight:600}
  #comaxRoot .rl i{width:9px;height:9px;border-radius:50%}
  #comaxRoot .bar{position:sticky;top:0;z-index:30;background:var(--bg);border-bottom:1px solid var(--line);
    padding:11px 0;margin-bottom:8px;display:flex;gap:9px;flex-wrap:wrap;align-items:center}
  #comaxRoot .bar input{background:var(--panel2);border:1px solid var(--line);color:var(--ink);
    padding:8px 12px;border-radius:8px;font-size:14px;min-width:200px;font-family:var(--mono)}
  #comaxRoot .btn{background:var(--panel2);border:1px solid var(--line);color:var(--ink);padding:8px 12px;
    border-radius:8px;cursor:pointer;font-size:13px}
  #comaxRoot .btn:hover{border-color:var(--fk)}
  #comaxRoot .btn.on{background:#182231;border-color:var(--fk);color:var(--fk)}
  #comaxRoot .count{color:var(--muted);font-size:13px;margin-left:auto;font-family:var(--mono)}
  #comaxRoot .grouphd{font:600 12px var(--mono);letter-spacing:1px;text-transform:uppercase;color:var(--dim);
    margin:26px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--line)}
  #comaxRoot .tcard{background:var(--panel);border:1px solid var(--line);border-radius:14px;margin-bottom:13px;overflow:hidden}
  #comaxRoot .thead{display:grid;grid-template-columns:auto auto 1fr auto;gap:12px 14px;align-items:center;
    padding:14px 18px;cursor:pointer;user-select:none}
  #comaxRoot .thead:hover{background:var(--panel2)}
  #comaxRoot .thead h2{margin:0;font:600 16px var(--mono);grid-column:1}
  #comaxRoot .rolebadge{font:600 10px var(--mono);text-transform:uppercase;letter-spacing:.5px;
    padding:3px 9px;border-radius:6px;border:1px solid}
  #comaxRoot .r-dimension{color:var(--dim-c);border-color:#5a3040;background:#241820}
  #comaxRoot .r-fact{color:var(--fk);border-color:#2a3a52;background:#152231}
  #comaxRoot .r-snapshot{color:var(--measure);border-color:#265041;background:#14251d}
  #comaxRoot .r-bridge{color:var(--flag);border-color:#3d3358;background:#1e1a28}
  #comaxRoot .grain{grid-column:1/-1;color:var(--muted);font:13px/1.4 var(--mono);margin-top:-2px}
  #comaxRoot .grain b{color:var(--date)}
  #comaxRoot .purpose{grid-column:1/-1;color:var(--muted);font-size:13.5px;margin-top:2px}
  #comaxRoot .dqchip{font:600 11px var(--mono);color:var(--red);background:#2a1a1c;border:1px solid #4a2b2d;
    padding:2px 8px;border-radius:6px;white-space:nowrap}
  #comaxRoot .caret{color:var(--muted);transition:.2s;justify-self:end}
  #comaxRoot .tcard.open .caret{transform:rotate(90deg)}
  #comaxRoot .tbody{display:none;padding:2px 16px 16px}
  #comaxRoot .tcard.open .tbody{display:block}
  #comaxRoot .csec{margin-top:14px}
  #comaxRoot .csec .h{font:600 11px var(--mono);letter-spacing:.5px;text-transform:uppercase;margin:0 0 8px;
    display:flex;align-items:center;gap:7px}
  #comaxRoot .csec .h .ct{color:var(--dim);font-weight:600}
  #comaxRoot .cols{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:9px}
  #comaxRoot .col{background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:11px 12px;border-left:3px solid}
  #comaxRoot .col.key{border-left-color:var(--key)} #comaxRoot .col.fk{border-left-color:var(--fk)}
  #comaxRoot .col.measure{border-left-color:var(--measure)} #comaxRoot .col.date{border-left-color:var(--date)}
  #comaxRoot .col.flag{border-left-color:var(--flag)} #comaxRoot .col.dimension{border-left-color:var(--dim-c)}
  #comaxRoot .col.code{border-left-color:var(--code)} #comaxRoot .col.text{border-left-color:var(--text)}
  #comaxRoot .col.rate{border-left-color:var(--rate)}
  #comaxRoot .col.empty{border-left-color:var(--empty);opacity:.55}
  #comaxRoot .col .top{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
  #comaxRoot .col .cn{font:600 13px var(--mono);color:var(--ink);word-break:break-all}
  #comaxRoot .col .cn.rtl{direction:rtl}
  #comaxRoot .col .roletag{font:600 9px var(--mono);text-transform:uppercase;letter-spacing:.5px;color:var(--dim);white-space:nowrap}
  #comaxRoot .col .mean{font-size:12px;color:var(--muted);margin:3px 0 7px;font-style:italic}
  #comaxRoot .col .mean.rtl{direction:rtl;text-align:right}
  #comaxRoot .col .fillbadge{font:600 10px var(--mono);color:var(--dim)}
  #comaxRoot .col .fillbadge.low{color:var(--red)} #comaxRoot .col .fillbadge.mid{color:var(--key)}
  #comaxRoot .body{font:11.5px var(--mono);color:var(--muted);line-height:1.65}
  #comaxRoot .body b{color:var(--ink);font-weight:600}
  #comaxRoot .body .neg{color:var(--red)} #comaxRoot .body .zero{color:var(--key)} #comaxRoot .body .ok{color:var(--measure)}
  #comaxRoot .keyview .u{color:var(--measure);font-weight:600}
  #comaxRoot .fkview .tgt{color:var(--fk);font-weight:600}
  #comaxRoot .joinbadge{display:inline-block;font:600 9px var(--mono);padding:1px 6px;border-radius:4px;margin-left:4px}
  #comaxRoot .join-ok{background:#14251d;color:var(--measure);border:1px solid #265041}
  #comaxRoot .join-partial{background:#2a2418;color:var(--key);border:1px solid #4a4426}
  #comaxRoot .mstat{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:5px}
  #comaxRoot .mstat span{white-space:nowrap}
  #comaxRoot .hist{display:flex;align-items:flex-end;gap:2px;height:38px;margin-top:5px}
  #comaxRoot .hist i{flex:1;background:linear-gradient(180deg,var(--measure),#3d7a63);border-radius:2px 2px 0 0;min-height:1px;opacity:.85}
  #comaxRoot .histlbl{display:flex;justify-content:space-between;font-size:9.5px;color:var(--dim);margin-top:2px}
  #comaxRoot .members{display:flex;flex-direction:column;gap:2px}
  #comaxRoot .members .m{display:flex;justify-content:space-between;gap:8px;padding:1px 0}
  #comaxRoot .members .mv{color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:210px}
  #comaxRoot .members .mv.rtl{direction:rtl}
  #comaxRoot .members .mc{color:var(--dim);font-size:10.5px}
  #comaxRoot .members .more{color:var(--dim);font-size:10.5px;margin-top:2px}
  #comaxRoot .complete-tag{font:600 9px var(--mono);color:var(--measure);margin-left:5px}
  #comaxRoot .pierow{display:flex;align-items:center;gap:12px;margin-top:4px}
  #comaxRoot .pie{flex-shrink:0}
  #comaxRoot .flagbar{height:7px;background:#2a2438;border-radius:4px;overflow:hidden;margin-top:4px;display:flex}
  #comaxRoot .flagbar .on{background:var(--flag)}
  #comaxRoot .dateview b{color:var(--date)}
  #comaxRoot .textview .samp{color:var(--muted)}
  #comaxRoot .textview .samp.rtl{direction:rtl;display:inline-block}
  #comaxRoot .panel{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin-bottom:14px}
  #comaxRoot .panel h2{margin:0 0 12px;font-size:17px}
  #comaxRoot .joinlist{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:8px}
  #comaxRoot .jrow{display:flex;align-items:center;gap:8px;font:12px var(--mono);background:var(--panel2);
    border:1px solid var(--line);border-radius:8px;padding:8px 11px}
  #comaxRoot .jrow .child{color:var(--ink)} #comaxRoot .jrow .arrow{color:var(--fk)} #comaxRoot .jrow .parent{color:var(--dim-c)}
  #comaxRoot .jrow .pct{margin-left:auto;color:var(--measure);font-weight:600}
  #comaxRoot .dqlist{display:flex;flex-direction:column;gap:7px}
  #comaxRoot .dqrow{display:flex;gap:10px;font-size:13px;background:var(--panel2);border:1px solid var(--line);
    border-left:3px solid var(--red);border-radius:8px;padding:9px 12px}
  #comaxRoot .dqrow .where{font:600 12px var(--mono);color:var(--key);white-space:nowrap}
  #comaxRoot .dqrow .what{color:var(--muted)}
  #comaxRoot .hidden{display:none!important}
  #comaxRoot .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--measure);
    color:#08120c;font:600 13px var(--mono);padding:10px 18px;border-radius:10px;opacity:0;transition:.2s;pointer-events:none;z-index:99}
  #comaxRoot .toast.on{opacity:1}
  #comaxRoot footer{padding:22px 0 60px;color:var(--muted);font-size:13px}
  #comaxRoot code{font:12px var(--mono);background:var(--panel2);padding:1px 5px;border-radius:4px;color:var(--measure)}
`

// Normalize the DSL schema into the shape the renderers expect.
const M = (() => {
  const tables = {}
  for (const [name, t] of Object.entries(comaxSchema.tables)) {
    tables[name] = {
      rows: t.rows,
      ncols: t.ncols ?? (t.columns ? t.columns.length : 0),
      cols: (t.columns || []).map(c => ({ ...c, meaning: c.meaning || '' })),
      meta: { role: t.role, grain: t.grain?.text ?? t.grain ?? '?', purpose: t.purpose || '' }
    }
  }
  const joins = comaxSchema.joins.map(j => [j.from, j.col, j.target, (j.verified ?? 1) * 100])
  const dataQuality = comaxSchema.dataQuality.map(d => [d.table, d.column, d.note])
  return { tables, joins, dataQuality, glossary: comaxSchema.glossary }
})()
const TABLES = M.tables, JOINS = M.joins, DQ = M.dataQuality
const heb = s => /[֐-׿]/.test(String(s))
const fmt = n => (n === '' || n == null) ? '' : (isNaN(+n) ? n : (+n).toLocaleString('en-US'))
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
const ROLE_COLOR = { key: '--key', fk: '--fk', measure: '--measure', rate: '--rate', date: '--date', flag: '--flag', dimension: '--dim-c', code: '--code', text: '--text', empty: '--empty' }
const ROLE_ORDER = ['key', 'fk', 'measure', 'rate', 'dimension', 'code', 'date', 'flag', 'text', 'empty']
const ROLE_LABEL = { key: 'Keys', fk: 'Foreign keys', measure: 'Measures', rate: 'Rates / % (non-additive)', dimension: 'Dimensions', code: 'Codes', date: 'Dates', flag: 'Flags', text: 'Free text', empty: 'Empty' }
const TABLE_ROLE_ORDER = ['fact', 'snapshot', 'bridge', 'dimension', '?']
const TABLE_GROUP_LABEL = { fact: 'Fact tables (events)', snapshot: 'Snapshots (state over time)', bridge: 'Bridge tables (M:N)', dimension: 'Dimensions / lookups', '?': 'Other' }
function renderKey(c) { return `<div class="keyview">${c.unique ? '<span class="u">unique ✓</span> — safe primary key' : 'has duplicates ✗'} · ${fmt(c.distinct)} distinct</div>` }
function renderFK(c) {
  const jb = c._join != null ? `<span class="joinbadge ${c._join >= 99.9 ? 'join-ok' : 'join-partial'}">${c._join >= 99.9 ? 'join ✓' : c._join + '%'}</span>` : ''
  const note = c.fk_note ? `<div style="color:var(--dim);margin-top:3px;font-size:10.5px">⚠ ${esc(c.fk_note)}</div>` : ''
  return `<div class="fkview">→ <span class="tgt">${esc(c.target)}</span>${jb}<br>${fmt(c.distinct_refs)} distinct targets referenced${c.has_zero ? ' · uses 0 = "none"' : ''}${note}</div>`
}
function renderRate(c) {
  const s = c.rate_stats
  const r = c.rate || {}
  let out = `<b>range ${r.min ?? (s ? s.min : '?')}–${r.max ?? (s ? s.max : '?')}</b> — a percentage, <span class="neg">not additive</span>`
  if (s) out += `<div class="mstat" style="margin-top:4px"><span>mean <b>${fmt(s.mean)}</b></span><span>med <b>${fmt(s.median)}</b></span><span class="zero">zeros ${fmt(s.zero)}</span>${s.neg ? `<span class="neg">neg ${fmt(s.neg)} (sentinels)</span>` : ''}</div>`
  return out
}
function renderMeasure(c) {
  if (!c.stats) return `${fmt(c.distinct)} distinct`
  const s = c.stats
  let out = `<div class="mstat"><span>min <b>${fmt(s.min)}</b></span><span>max <b>${fmt(s.max)}</b></span><span>mean <b>${fmt(s.mean)}</b></span><span>med <b>${fmt(s.median)}</b></span></div>
    <div class="mstat"><span>Σ <b>${fmt(s.sum)}</b></span><span class="zero">zeros ${fmt(s.zero)}</span>${s.neg ? `<span class="neg">neg ${fmt(s.neg)}</span>` : '<span class="ok">no negatives</span>'}</div>`
  if (c.hist) {
    const mx = Math.max(...c.hist.bins) || 1
    out += `<div class="hist">${c.hist.bins.map(b => `<i style="height:${Math.round(100 * b / mx)}%"></i>`).join('')}</div><div class="histlbl"><span>${fmt(c.hist.lo)}</span><span>${fmt(c.hist.hi)}</span></div>`
  }
  return out
}
function pie(members) {
  const total = members.reduce((a, [, n]) => a + n, 0); const cols = ['#e88bb0', '#6ea8fe', '#7ee0b8', '#f6c177', '#b39ddb', '#5bc8c0']
  let a = -Math.PI / 2, paths = ''
  members.forEach(([, n], i) => {
    const frac = n / total, a2 = a + frac * 2 * Math.PI, big = frac > 0.5 ? 1 : 0
    const x1 = 18 + 16 * Math.cos(a), y1 = 18 + 16 * Math.sin(a), x2 = 18 + 16 * Math.cos(a2), y2 = 18 + 16 * Math.sin(a2)
    paths += `<path d="M18,18 L${x1.toFixed(1)},${y1.toFixed(1)} A16,16 0 ${big} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${cols[i % 6]}"/>`; a = a2
  })
  return `<svg class="pie" width="36" height="36" viewBox="0 0 36 36">${paths}</svg>`
}
function renderDimension(c) {
  const mems = c.members || []
  const list = `<div class="members">${mems.map(([v, n]) => { const r = heb(v) ? ' rtl' : ''; return `<div class="m"><span class="mv${r}">${esc(v || '∅')}</span><span class="mc">${fmt(n)}</span></div>` }).join('')}${c.complete ? '' : `<div class="more">+${fmt(c.distinct - mems.length)} more…</div>`}</div>`
  const tag = c.complete ? `<span class="complete-tag">complete list</span>` : ''
  if (c.complete && mems.length <= 6 && mems.length >= 2) return `<div class="pierow">${pie(mems)}<div style="flex:1">${list}</div></div>${tag}`
  return list + tag
}
function renderCode(c) {
  const mems = c.members || []
  return `<div class="members">${mems.map(([v, n]) => { const r = heb(v) ? ' rtl' : ''; return `<div class="m"><span class="mv${r}">${esc(v)}</span>${n > 1 ? `<span class="mc">×${n}</span>` : ''}</div>` }).join('')}${c.complete ? '<span class="complete-tag">complete list</span>' : `<div class="more">+${fmt(c.distinct - mems.length)} more codes…</div>`}</div>`
}
function renderFlag(c) {
  const t = c.flag.true, f = c.flag.false, tot = t + f || 1, pct = Math.round(100 * t / tot)
  return `<b>${pct}%</b> set · ${fmt(t)} on / ${fmt(f)} off<div class="flagbar"><span class="on" style="width:${pct}%"></span></div>`
}
function renderDate(c) { return `<div class="dateview"><b>${c.range ? c.range[0] : '?'}</b> → <b>${c.range ? c.range[1] : '?'}</b><br>${fmt(c.distinct_days)} distinct days</div>` }
function renderText(c) { const t = c.text || {}; const r = heb(t.sample) ? ' rtl' : ''; return `<div class="textview">avg len <b>${t.avg}</b> · max <b>${t.max}</b><br><span class="samp${r}">e.g. "${esc(t.sample)}"</span></div>` }
function renderBody(c) {
  switch (c.role) {
    case 'key': return renderKey(c); case 'fk': return renderFK(c); case 'measure': return renderMeasure(c)
    case 'rate': return renderRate(c)
    case 'dimension': return renderDimension(c); case 'code': return renderCode(c); case 'flag': return renderFlag(c)
    case 'date': return renderDate(c); case 'text': return renderText(c)
    case 'empty': return '<span style="color:var(--dim)">no values / constant in this extract</span>'
    default: return `${fmt(c.distinct)} distinct`
  }
}
function renderCol(c) {
  const nmeRtl = heb(c.name) ? ' rtl' : ''; const meanRtl = heb(c.meaning) ? ' rtl' : ''
  const fillCls = c.fill >= 95 ? '' : c.fill >= 50 ? 'mid' : 'low'
  const noise = c.role === 'empty' || (c.role === 'flag' && c.flag && c.flag.true === 0)
  return `<div class="col ${c.role}" data-col="${esc(c.name.toLowerCase())} ${esc((c.meaning || '').toLowerCase())}" data-noise="${noise ? 1 : 0}">
    <div class="top"><span class="cn${nmeRtl}">${esc(c.name)}</span><span class="roletag">${c.role}</span></div>
    ${c.meaning ? `<div class="mean${meanRtl}">${esc(c.meaning)}</div>` : ''}
    <div class="body">${renderBody(c)}</div>
    <div class="fillbadge ${fillCls}" style="margin-top:6px">${c.fill}% filled · ${fmt(c.distinct)} distinct</div>
  </div>`
}
const JMAP = {}; JOINS.forEach(([child, fk, parent, pct]) => { JMAP[`${child}.${fk.toLowerCase()}`] = pct })

// relationship graph, derived from TABLES (nodes) + JOINS (edges)
function buildGraph() {
  const TR_COLOR = { fact: '#6ea8fe', snapshot: '#7ee0b8', bridge: '#b39ddb', dimension: '#e88bb0', '?': '#98a1b2' }
  const edges = JOINS.map(([c, fk, p, pct]) => {
    const base = p.split(' ')[0].replace(/\(.*/, '').trim()
    return { from: c, to: base, fk, pct, rawTarget: p }
  }).filter(e => TABLES[e.from] && TABLES[e.to])
  const nodeNames = [...new Set(edges.flatMap(e => [e.from, e.to]))]
  const bands = { dimension: 0, fact: 1, snapshot: 1, bridge: 2 }
  const bandY = { 0: 70, 1: 230, 2: 390 }
  const byBand = { 0: [], 1: [], 2: [] }
  nodeNames.forEach(n => {
    const role = TABLES[n].meta?.role || '?'
    const b = bands[role] ?? 1
    byBand[b].push(n)
  })
  const W = 1120, pad = 90
  const pos = {}
  Object.entries(byBand).forEach(([b, arr]) => {
    const y = bandY[b]
    const n = arr.length
    arr.forEach((name, i) => {
      const x = n === 1 ? W / 2 : pad + i * ((W - 2 * pad) / (n - 1))
      pos[name] = { x, y, role: TABLES[name].meta?.role || '?' }
    })
  })
  const NW = 132, NH = 40, H = 470
  let svgEdges = ''
  edges.forEach(e => {
    const a = pos[e.from], b = pos[e.to]
    if (!a || !b) return
    const x1 = a.x, y1 = a.y, x2 = b.x, y2 = b.y
    const my = (y1 + y2) / 2
    const partial = e.pct < 99.9
    svgEdges += `<path d="M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}"
      fill="none" stroke="${partial ? '#4a4426' : '#3a4150'}" stroke-width="1.4"
      stroke-dasharray="${partial ? '4 3' : ''}" marker-end="url(#arr)" opacity="0.85"/>`
  })
  let svgNodes = ''
  Object.entries(pos).forEach(([name, p]) => {
    const col = TR_COLOR[p.role] || '#98a1b2'
    const t = TABLES[name]
    const grain = (t.meta?.grain || '').replace(/"/g, '')
    svgNodes += `<g class="gnode" data-node="${name.toLowerCase()}" style="cursor:pointer" transform="translate(${p.x - NW / 2},${p.y - NH / 2})">
      <rect width="${NW}" height="${NH}" rx="9" fill="#161922" stroke="${col}" stroke-width="1.6"/>
      <text x="${NW / 2}" y="17" text-anchor="middle" fill="#e8ebf1" font-family="var(--mono)" font-size="11.5" font-weight="600">${name}</text>
      <text x="${NW / 2}" y="31" text-anchor="middle" fill="#98a1b2" font-family="var(--mono)" font-size="8">${p.role} · ${(t.rows).toLocaleString()}</text>
      <title>${name} — ${grain}</title>
    </g>`
  })
  return `
  <h2>Relationship graph <span style="font:600 12px var(--mono);color:var(--muted)">nodes = tables · edges = verified joins · click a node to jump</span></h2>
  <div style="display:flex;gap:14px;flex-wrap:wrap;font:11px var(--mono);color:var(--muted);margin-bottom:10px">
    <span style="color:#6ea8fe">■ fact</span><span style="color:#7ee0b8">■ snapshot</span>
    <span style="color:#e88bb0">■ dimension</span><span style="color:#b39ddb">■ bridge</span>
    <span style="color:#4a4426">╌ partial join</span>
  </div>
  <div style="overflow-x:auto">
  <svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:900px;display:block">
    <defs><marker id="arr" markerWidth="9" markerHeight="9" refX="7.5" refY="3" orient="auto">
      <path d="M0,0 L7,3 L0,6 Z" fill="#6ea8fe"/></marker></defs>
    ${svgEdges}
    ${svgNodes}
  </svg></div>`
}
function renderTable(name, t) {
  const meta = t.meta || {}
  t.cols.forEach(c => { if (c.role === 'fk') c._join = JMAP[`${name}.${c.name.toLowerCase()}`] ?? null })
  const groups = {}; t.cols.forEach(c => { (groups[c.role] = groups[c.role] || []).push(c) })
  let secs = ''
  for (const r of ROLE_ORDER) {
    if (!groups[r]) continue
    secs += `<div class="csec" data-role="${r}"><div class="h" style="color:var(${ROLE_COLOR[r]})">${ROLE_LABEL[r]} <span class="ct">${groups[r].length}</span></div><div class="cols">${groups[r].map(renderCol).join('')}</div></div>`
  }
  const dqCount = DQ.filter(d => d[0] === name).length
  const dqChip = dqCount ? `<span class="dqchip">⚠ ${dqCount}</span>` : ''
  const rr = meta.role || '?'
  return `<div class="tcard" data-name="${esc(name.toLowerCase())}" data-trole="${rr}">
    <div class="thead"><h2>${name}</h2><span class="rolebadge r-${rr}">${rr}</span><span></span><span class="caret">▶</span>
      <div class="grain">grain: <b>${esc(meta.grain || '?')}</b> · ${fmt(t.rows)} rows × ${t.ncols} cols ${dqChip}</div>
      <div class="purpose">${esc(meta.purpose || '')}</div></div>
    <div class="tbody">${secs}</div></div>`
}

// full inner markup, built once from the static schema
function buildBody() {
  const names = Object.keys(TABLES)
  const graphHtml = buildGraph()
  const joinHtml = `<h2>Verified join graph <span style="font:600 12px var(--mono);color:var(--muted)">${JOINS.length} edges, all empirically tested</span></h2><div class="joinlist">${JOINS.map(([c, fk, p, pct]) => `<div class="jrow"><span class="child">${c}.${fk}</span><span class="arrow">→</span><span class="parent">${p}</span><span class="pct">${pct >= 99.9 ? '✓' : pct + '%'}</span></div>`).join('')}</div>`
  const dqHtml = `<h2>Data-quality watch <span style="font:600 12px var(--mono);color:var(--red)">${DQ.length} things that will mislead a naive query</span></h2><div class="dqlist">${DQ.map(([t, col, what]) => `<div class="dqrow"><span class="where">${t}.${col}</span><span class="what">${esc(what)}</span></div>`).join('')}</div>`
  let tablesHtml = ''
  for (const tr of TABLE_ROLE_ORDER) {
    const group = names.filter(n => (TABLES[n].meta?.role || '?') === tr)
    if (!group.length) continue
    tablesHtml += `<div class="grouphd">${TABLE_GROUP_LABEL[tr]} · ${group.length}</div>`
    tablesHtml += group.map(n => renderTable(n, TABLES[n])).join('')
  }
  const countTxt = `${names.length} tables · ${names.reduce((a, n) => a + TABLES[n].ncols, 0)} columns`
  return `<div class="wrap">
    <header>
      <h1>Comax DB — Semantic Model</h1>
      <div class="sub">Meaning-first view of ${names.length} tables. Each table leads with its <b>role · grain · purpose</b>; each column shows its <b>decoded meaning</b> and <b>semantic role</b>, then the one view that fits that role — value-lists for categories, histograms for measures, uniqueness for keys, verified-join targets for foreign keys.</div>
      <div class="legend">
        <span class="rl" style="color:var(--key)"><i style="background:var(--key)"></i>key</span>
        <span class="rl" style="color:var(--fk)"><i style="background:var(--fk)"></i>foreign key</span>
        <span class="rl" style="color:var(--measure)"><i style="background:var(--measure)"></i>measure</span>
        <span class="rl" style="color:var(--dim-c)"><i style="background:var(--dim-c)"></i>dimension</span>
        <span class="rl" style="color:var(--code)"><i style="background:var(--code)"></i>code</span>
        <span class="rl" style="color:var(--flag)"><i style="background:var(--flag)"></i>flag</span>
        <span class="rl" style="color:var(--date)"><i style="background:var(--date)"></i>date</span>
        <span class="rl" style="color:var(--text)"><i style="background:var(--text)"></i>text</span>
        <span class="rl" style="color:var(--empty)"><i style="background:var(--empty)"></i>empty</span>
      </div>
    </header>
    <div class="bar">
      <input id="search" placeholder="filter tables / columns / meanings…">
      <button class="btn on" id="noise">Hide empty cols: on</button>
      <button class="btn" id="expandAll">expand all</button>
      <button class="btn" id="collapseAll">collapse all</button>
      <button class="btn" id="copyAll">copy model (JSON)</button>
      <span class="count" id="count">${countTxt}</span>
    </div>
    <div id="graphpanel" class="panel">${graphHtml}</div>
    <div id="joinpanel" class="panel">${joinHtml}</div>
    <div id="dqpanel" class="panel">${dqHtml}</div>
    <div id="tables">${tablesHtml}</div>
    <footer>Derived from the extended-DSL semantic schema (signedRoom://comaxDemo/usersRO/schema/comax_semantic_schema.js). Roles are assigned by meaning, not datatype.</footer>
  </div>
  <div class="toast" id="toast">copied ✓</div>`
}

const BODY_HTML = buildBody()

// wire the imperative interactions, scoped to the comp's root
function initInteractions(root) {
  const $ = sel => root.querySelector(sel)
  const $$ = sel => root.querySelectorAll(sel)
  $$('.gnode').forEach(g => g.addEventListener('click', () => {
    const card = root.querySelector(`.tcard[data-name="${g.dataset.node}"]`)
    if (card) { card.classList.add('open'); card.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
  }))
  $$('.thead').forEach(h => h.onclick = () => h.parentElement.classList.toggle('open'))
  let hideNoise = true
  const applyNoise = () => {
    $$('.col[data-noise="1"]').forEach(c => c.classList.toggle('hidden', hideNoise))
    $$('.csec').forEach(s => { const vis = [...s.querySelectorAll('.col')].some(c => !c.classList.contains('hidden')); s.classList.toggle('hidden', !vis) })
  }
  const nb = $('#noise')
  nb.onclick = () => { hideNoise = !hideNoise; nb.textContent = 'Hide empty cols: ' + (hideNoise ? 'on' : 'off'); nb.classList.toggle('on', hideNoise); applyNoise() }
  applyNoise()
  $('#search').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase()
    $$('.tcard').forEach(card => {
      const nameHit = !q || card.dataset.name.includes(q); let any = false
      card.querySelectorAll('.col').forEach(col => {
        const noiseHidden = col.dataset.noise === '1' && hideNoise
        const hit = (!q || col.dataset.col.includes(q)) && !noiseHidden
        col.classList.toggle('hidden', !(hit || (nameHit && !q)) || noiseHidden)
        if (hit) any = true
      })
      card.querySelectorAll('.csec').forEach(s => { const vis = [...s.querySelectorAll('.col')].some(c => !c.classList.contains('hidden')); s.classList.toggle('hidden', !vis) })
      card.classList.toggle('hidden', !(nameHit || any))
      if (q && (nameHit || any)) card.classList.add('open')
    })
  })
  $('#expandAll').onclick = () => $$('.tcard').forEach(c => c.classList.add('open'))
  $('#collapseAll').onclick = () => $$('.tcard').forEach(c => c.classList.remove('open'))
  $('#copyAll').onclick = () => navigator.clipboard.writeText(JSON.stringify(M, null, 2)).then(() => {
    const t = $('#toast'); t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 1100)
  })
}

ReactComp('comaxSemanticModel', {
  impl: comp({
    hFunc: (ctx, { react: { h, useRef, useEffect } }) => () => {
      const ref = useRef(null)
      useEffect(() => { if (ref.current) initInteractions(ref.current) }, [])
      return h('div', { id: 'comaxRoot', ref },
        h('style', { dangerouslySetInnerHTML: { __html: STYLE } }),
        h('div', { dangerouslySetInnerHTML: { __html: BODY_HTML } }))
    }
  })
})
