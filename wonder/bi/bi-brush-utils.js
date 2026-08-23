// bi-brush-utils.js — GENERIC, cube-agnostic code↔data BRUSHING toolkit. a drilled value links to the CODE that made it.
// a `drill` (ctx-enricher → ctx.vars.valueSource) is run by each brush view; valueSource carries three elements:
//   G gold source   = valueSource.gSource (a squeezeAndHighlight of the metric node)   ┐ the CODE half  → codeBrush
//   S silver source = valueSource.sSource (a squeezeAndHighlight of the cube pick node) ┘
//   R data result   = valueSource.silverByKey (keys → events, winner highlighted)        the DATA half  → dataBrush
// BrushView is the type-alias (like Aggregator→Data) for a react-comp that IS a brush view. codeBrush/dataBrush are the two
// PRIMITIVES; brushPanes/brushResultFirst/brushInline are COMPOSITES that lay them out; brushViews is a dev EXPLORER (tabs).
// the CONCRETE per-cube wiring (which cube, metric, paths, room/period) lives in the consumer — see product-cube-ui.js.
import { dsls, coreUtils, jb } from '@jb6/core'
import '@jb6/react'
import '@jb6/core/misc/pretty-print.js'

const {
  tgp: { TgpType, TgpTypeModifier, CtxEnricher, 'ctx-enricher': { enrichCtx } },
  common: { Data },
  react: { 'react-comp': reactComps, 'react-comp': { comp } },
  bi: { SqlModifier }
} = dsls

// BrushView — a react-comp that is a code/data brush view. same react-comp<react> type as ReactComp, own constructor, stamps
// brushView:true on each comp (exactly as Aggregator stamps aggregator:true on a data<common> comp). self-documenting; no tabs.
const BrushView = TgpTypeModifier('BrushView', { brushView: true, dsl: 'react', type: 'react-comp' })
// BrushData — a data<common> comp that projects a [span]-carrying drill result into the brush's data model (the DATA half,
// sibling of BrushView; same modifier bi-dsl.js declares — TgpTypeModifier is idempotent per capital id → the one shared common.BrushData).
const BrushData = TgpTypeModifier('BrushData', { brushData: true, dsl: 'common', type: 'data' })

// code-locator — LOCAL to this brush toolkit: a typed address of the link token inside a comp's source (path + the literal param +
// the dialect-correct sub-parser). one comp per literal kind (sqlLocator, cubeLocator); consumed by squeezeAndHighlight.
// RT contract (what every code-locator impl returns) — squeezeAndHighlight reads exactly these three:
//   path:      string                                          // tgp path into the comp; path.split('~')[0] = the compId to pretty-print
//   litChild:  string                                          // the string-literal param holding the token (matched as `insideText!<tail>~<litChild>`)
//   inLitCols: (litText: string, token: string) => number[] | Promise<number[]>  // token offsets WITHIN that literal (awaited)
const CodeLocator = TgpType('code-locator', 'bi', {
  typescript: '{ path: string; litChild: string; inLitCols: (litText: string, token: string) => number[] | Promise<number[]> }'
})

// code-locator — a typed address of the link token inside a comp's source: `path` into the comp, `litChild` = the string-literal
// param that holds the token, and `inLitCols(litText, token)` = the dialect-correct sub-parser giving the token's offsets WITHIN
// that literal (prettyPrint treats the literal as opaque, so this is the one level deeper). one comp per literal kind:
//   sqlLocator  — SQL `expr` → DuckDB COLUMN_REF query_location (sqlColumnRefCols): finds `price` in `avg(price)`, NOT in the alias.
//   cubeLocator — csv `fields` → word-boundary index of the token in the comma list.
CodeLocator('sqlLocator', {
  params: [
    { id: 'path', as: 'string', mandatory: true, description: 'tgp path into the comp, e.g. cube<bi>productCube~impl~metrics~0' },
    { id: 'litChild', as: 'string', defaultValue: 'expr', description: 'the SQL string-literal param holding the token' }
  ],
  impl: (ctx, {}, { path, litChild }) => ({ path, litChild,
    inLitCols: async (litText, token) => (await import('@wonder/bi/duckdb-utils.js'), jb.biUtils.sqlColumnRefCols(litText, token, ctx)) })
})
CodeLocator('cubeLocator', {
  params: [
    { id: 'path', as: 'string', mandatory: true, description: 'tgp path into the comp, e.g. cube<bi>productCube~impl~fields~0' },
    { id: 'litChild', as: 'string', defaultValue: 'fields', description: 'the csv string-literal param holding the token' }
  ],
  impl: (ctx, {}, { path, litChild }) => ({ path, litChild,
    inLitCols: (litText, token) => [...litText.matchAll(new RegExp(`\\b${token}\\b`, 'g'))].map(m => m.index) })
})

// squeezeAndHighlight(locator, token) → { crumb, sections, token } — the PURE squeeze+highlight pass (dataTest-able).
// SQUEEZE: pretty-print the comp the locator points into, mark the tgpPath lines (ancestors + node + descendants) as onPath, fold the rest.
// HIGHLIGHT: find the literal's span via the actionMap `insideText!…~litChild` action, then ask the locator's own inLitCols for the
//   token offsets inside that literal; literal line/col + each in-literal offset = absolute highlight column. the sub-parser is
//   polymorphic (it lives on the locator comp) so this pass is dialect-agnostic. async: SQL needs duckdb (node).
const squeezeAndHighlight = Data('squeezeAndHighlight', {
  params: [
    { id: 'locator', type: 'code-locator<bi>', mandatory: true, description: 'the address of the token in a comp (sqlLocator/cubeLocator)' },
    { id: 'token', as: 'string', mandatory: true, description: 'the highlighted link token, e.g. price' }
  ],
  impl: async (ctx, { biLogger }, { locator, token }) => {
    const { prettyPrintWithPositions, compByFullId } = coreUtils
    const { path, litChild, inLitCols } = locator
    const compId = path.split('~')[0]
    const tail = '~' + path.split('~').slice(1).join('~')   // actionMap paths are `verb!~impl~…` — keep the leading ~ so onPath + insideText share one convention
    const { text, actionMap: raw, startOffset } = prettyPrintWithPositions(compByFullId(compId))
    const actionMap = raw.map(a => ({ ...a, from: a.from - startOffset, to: a.to - startOffset }))   // actionMap offsets are based at startOffset (compHeader len when a $comp); text starts at 0
    const lines = text.split('\n')
    const lineAt = off => { let n = 0; for (let i = 0; i < lines.length; i++) { const e = n + lines[i].length; if (off <= e) return { i, col: off - n }; n = e + 1 } }
    // the whole algorithm is the tgpPath: each path element (~impl, ~impl~metrics, …, the target node) owns a contiguous text span;
    // keep its OPEN + CLOSE line. over the path that's the nested skeleton (Cube → impl → metrics → metric); drop lone-bracket close
    // lines (`]`/`}`/`],`/`})` — trailing `,` stripped, then trimmed to ≤2 chars: pure structural noise) so the fold reads cleanly. siblings fold.
    const span = p => actionMap.filter(a => a.action.split('!').pop() === p).reduce((s, a) => ({ from: Math.min(s.from, a.from), to: Math.max(s.to, a.to) }), { from: Infinity, to: -Infinity })
    const pathElems = path => path.split('~').map((_, n, a) => a.slice(0, n + 1).join('~'))
    const keep = pathElems(tail).reduce((m, p) => { const s = span(p)
      ;[lineAt(s.from).i, lineAt(s.to).i].forEach(i => { if (lines[i].trim().replace(/,$/, '').length > 2) m[i] = true }); return m }, {})
    const onPath = lines.map((_, i) => !!keep[i])
    const crumb = [compId.split('>').pop(), ...tail.split('~').filter(s => s && s !== 'impl')
      .map(s => /^\d+$/.test(s) ? `[${s}]` : s)].join(' › ')
    // highlight columns BY LINE: find the literal child span in the actionMap, ask the locator's sub-parser for the token offsets
    // inside that literal, map each to absolute col (literal start col + in-literal offset).
    const highlightsByLine = {}
    const lit = actionMap.find(a => a.action === `insideText!${tail}~${litChild}`)
    if (lit) {
      const litStart = lit.from - 1   // insideText.from points 1 char INTO the literal (opening quote at from-2)
      const litText = text.slice(litStart, lit.to - 1), { i, col } = lineAt(litStart)
      const inLit = await inLitCols(litText, token)
      inLit.forEach(c => (highlightsByLine[i] = highlightsByLine[i] || []).push(col + c))
      // future-llm: one line tells you WHAT was located and WHERE — the squeezed comp, the on-path crumb, the literal that holds
      // the token, and the absolute columns the token highlights landed on (empty cols ⇒ the sub-parser didn't find the token).
      biLogger?.info?.({ t: 'squeezeAndHighlight', compId, crumb, litChild, token, litText, cols: inLit.map(c => col + c) }, {}, { ctx })
    }
    // cluster ALL line-numbers into runs that share kept/folded status (in:true = kept run, in:false = folded gap); then emit
    // each in-cluster line as a section and each out-cluster as a single {fold:n}.
    const clusters = lines.map((_, i) => i).reduce((cl, i) => cl.at(-1)?.in === !!keep[i] ? [...cl.slice(0, -1), { ...cl.at(-1), size: cl.at(-1).size + 1 }] : [...cl, { in: !!keep[i], from: i, size: 1 }], [])
    const sections = clusters.flatMap(c => c.in ? Array.from({ length: c.size }, (_, k) => c.from + k).map(i => ({ line: lines[i], onPath: onPath[i], highlights: (highlightsByLine[i] || []).sort((a, b) => a - b) })) : [{ fold: c.size }])
    return { crumb, sections, token }
  }
})

// spanCell — the gold-cell popup model: run the gold view → its value + contributing keys, then the silver view per key.
// gold/silverOf are supplied by the consumer (the concrete cube's metric/pick views); spanCell is cube-agnostic.
const spanCell = BrushData('spanCell', {
  params: [
    { id: 'gold', dynamic: true, mandatory: true },
    { id: 'silverOf', dynamic: true, mandatory: true },
    { id: 'metric', as: 'string', mandatory: true },
    { id: 'metricField', as: 'string', description: "the link token threaded G/S/R, e.g. price" }
  ],
  impl: async (ctx, {}, { gold, silverOf, metric, metricField }) => {
    const [goldRow] = await gold(ctx)
    const { value, keys } = Object.values(goldRow.cells)[0]
    const silvers = await Promise.all(keys.map(k => silverOf(ctx.setVars({ key: k }))))
    return { func: metric, value, keys, metricField, silverByKey: Object.fromEntries(keys.map((k, i) => [k, silvers[i]])) }
  }
})

const brushSpanCell = BrushData('brushSpanCell', {
  params: [
    { id: 'cell', dynamic: true, mandatory: true },
    { id: 'gSource', dynamic: true, mandatory: true },
    { id: 'sSource', dynamic: true, mandatory: true }
  ],
  impl: async (ctx, {}, { cell, gSource, sSource }) =>
    ({ ...await cell(ctx), gSource: await gSource(ctx), sSource: await sSource(ctx) })
})

const inheritDrill = CtxEnricher('inheritDrill', { impl: (ctx) => ctx })

// shared pieces: the top dashboard, a master key-row, the raw-event lines (winner highlighted), a squeezed code box.
const dashboard = (h, func, value, sub) => h('div:bg-white border rounded-xl shadow-sm px-5 py-3 mb-4 flex items-baseline gap-3', {},
  h('div:text-[11px] uppercase tracking-wide text-gray-400', {}, func),
  h('div:text-2xl font-bold text-gray-900', {}, value),
  h('div:text-xs text-gray-400 ml-auto', {}, sub))
const eventLines = (h, s, field, onWinner) => { const f = s?.fields?.[field] || { events: [], pickedIdx: -1 }; return f.events.map((e, i) =>
  h(`div:font-mono text-[11px] ${i === f.pickedIdx ? 'text-green-700 font-bold cursor-pointer hover:underline' : 'text-gray-400'}`,
    { key: i, onClick: i === f.pickedIdx ? onWinner : undefined },
    (i === f.pickedIdx ? '▶ ' : '  ') + JSON.stringify(e) + (i === f.pickedIdx ? '  ← winner ⊞' : ''))) }
// histogram — stats for `field` values across `events` (equal-width bars). each bar drills: click it →
// the raw event(s) whose `field` equals that value expand inline beneath the chart. fed from one key (winner click)
// or from ALL keys' events (the code 'price' token click).
const histogram = (h, events, field, bar, onBar) => {
  const vals = events.map(e => Number(e[field])).filter(Number.isFinite), max = Math.max(...vals, 0)
  return h('div:mt-1 pl-3 border-l-2 border-green-200 space-y-0.5', {}, ...vals.map((v, i) =>
    h(`div:flex items-center gap-2 text-[11px] cursor-pointer ${v === bar ? 'bg-green-50' : 'hover:bg-gray-50'}`, { key: i, onClick: () => onBar(v === bar ? null : v) },
      h('span:font-mono text-gray-500 w-10 text-right', {}, v),
      h('div:h-3 rounded-sm bg-green-400', { style: { width: `${max ? (v / max) * 100 : 0}%`, minWidth: '2px' } }))),
    bar != null && h('div:mt-1 space-y-0.5', {}, ...events.filter(e => Number(e[field]) === bar).map((e, i) =>
      h('div:font-mono text-[11px] text-gray-600', { key: i }, JSON.stringify(e))))) }
const masterRow = (h, k, s, field, on, onClick) => h(`div:flex justify-between px-3 py-2 cursor-pointer text-sm ${on ? 'bg-yellow-50' : 'hover:bg-gray-50'}`,
  { onClick }, h('span:font-mono text-gray-700', {}, (on ? '▾ ' : '▸ ') + k),
  h('span:text-gray-400 text-xs', {}, `${field}=${s?.fields?.[field]?.value}`))
// codeBox — the SQUEEZED code pane (GitHub-style), a PURE render of a shipped `source` = squeezeAndHighlight's { crumb, sections,
// token }. yellow on-path lines, `-- n lines --` folds, the breadcrumb, the highlighted link token. used for both G and S.
const codeBox = (h, source, tag, onToken) => {
  const { crumb, sections, token } = source
  const renderLine = ({ line, onPath, highlights }, i) => {
    const out = []; let at = 0
    highlights.forEach((c, k) => { out.push(line.slice(at, c)); out.push(h(`span:bg-yellow-200 text-gray-900 rounded-sm ${onToken ? 'cursor-pointer hover:bg-yellow-300' : ''}`, { key: 'h' + k, onClick: onToken }, token)); at = c + token.length })
    out.push(line.slice(at))
    return h(`div:px-3 leading-5 ${onPath ? 'bg-yellow-50' : ''}`, { key: i }, ...out)
  }
  return h('div:bg-white border rounded overflow-hidden', {},
    h('div:px-2 py-1 text-[11px] font-semibold text-gray-500 border-b bg-gray-50 flex gap-2', {},
      h('span:text-gray-700', {}, tag), h('span:font-mono text-gray-400', {}, crumb)),
    h('div:py-1 font-mono text-xs whitespace-pre', {}, ...sections.map((s, i) => s.fold != null
      ? h('div:px-3 py-0.5 text-[11px] italic text-gray-400 bg-gray-50 border-y border-gray-100', { key: 'f' + i }, `-- ${s.fold} lines --`)
      : renderLine(s, i))))
}
// every brush view declares a `drill` param (dynamic ctx-enricher, default inheritDrill so a hosted primitive reuses its host's
// drill). it is inlined per comp — the lang-service static parser reads params from the literal AST, not from a shared JS const.

// ── codeBrush — the CODE half: G gold-source SQL + S silver-builder cube as TWO STACKED boxes (the metric now lives on cube<bi>,
// the pick on silver-builder<bi> — two comps, no line-aligned merge). G's highlighted metric token toggles the histogram.
BrushView('codeBrush', {
  params: [{ id: 'drill', type: 'ctx-enricher<tgp>', dynamic: true, defaultValue: inheritDrill() }],
  impl: comp({
    enrichCtx: '%$drill()%',
    hFunc: (ctx, { valueSource, react: { h, useState } }) => () => {
      const { gSource, sSource, metricField, keys, silverByKey } = valueSource
      const [hist, setHist] = useState(false), [bar, setBar] = useState(null)
      const allEvents = keys.flatMap(k => silverByKey[k]?.fields?.[metricField]?.events || [])
      const toggle = () => { setHist(!hist); setBar(null) }
      return h('div:space-y-2', {},
        codeBox(h, gSource, 'gold · metric', toggle),
        codeBox(h, sSource, 'silver · pick'),
        hist && histogram(h, allEvents, metricField, bar, setBar))
    }
  })
})

// ── dataBrush — the DATA half: R the contributing keys → raw events, winner highlighted. a standalone brush view.
BrushView('dataBrush', {
  params: [{ id: 'drill', type: 'ctx-enricher<tgp>', dynamic: true, defaultValue: inheritDrill() }],
  impl: comp({
    enrichCtx: '%$drill()%',
    hFunc: (ctx, { valueSource, react: { h, useState } }) => () => {
      const { metricField, keys, silverByKey } = valueSource
      const [open, setOpen] = useState(null), [hist, setHist] = useState(null), [bar, setBar] = useState(null)
      return h('div:bg-white border rounded divide-y', {}, ...keys.map(k => {
        const s = silverByKey[k], on = k === open
        return h('div', { key: k }, masterRow(h, k, s, metricField, on, () => setOpen(on ? null : k)),
          on && h('div:px-3 pb-2', {}, ...eventLines(h, s, metricField, () => { setHist(hist === k ? null : k); setBar(null) }),
            hist === k && histogram(h, s?.fields?.[metricField]?.events || [], metricField, bar, setBar)))
      }))
    }
  })
})

// ── brushPanes — composite A: codeBrush | dataBrush side by side, coequal. (drills once; the two primitives inheritDrill.)
BrushView('brushPanes', {
  params: [{ id: 'drill', type: 'ctx-enricher<tgp>', dynamic: true, defaultValue: inheritDrill() }],
  impl: comp({
    enrichCtx: '%$drill()%',
    hFunc: (ctx, { valueSource, react: { h, hh } }) => () => {
      const { func, value, metricField } = valueSource
      return h('div', {}, dashboard(h, func, value, `field '${metricField}'`),
        h('div:flex gap-3 items-start', {},
          h('div:flex-1 min-w-0', {}, hh(ctx, reactComps.codeBrush)),
          h('div:w-80 shrink-0', {}, hh(ctx, reactComps.dataBrush))))
    }
  })
})

// ── brushResultFirst — composite B: dataBrush leads, codeBrush is the detail rail (recommended popup layout).
BrushView('brushResultFirst', {
  params: [{ id: 'drill', type: 'ctx-enricher<tgp>', dynamic: true, defaultValue: inheritDrill() }],
  impl: comp({
    enrichCtx: '%$drill()%',
    hFunc: (ctx, { valueSource, react: { h, hh } }) => () => {
      const { func, value, metricField, keys } = valueSource
      return h('div', {}, dashboard(h, func, value, `${keys.length} keys · field '${metricField}'`),
        h('div:flex gap-3 items-start', {},
          h('div:w-80 shrink-0', {}, hh(ctx, reactComps.dataBrush)),
          h('div:flex-1 min-w-0', {}, hh(ctx, reactComps.codeBrush))))
    }
  })
})

// ── brushInline — composite C: code folds behind chips, data flows below (mobile/dense, inline layout).
BrushView('brushInline', {
  params: [{ id: 'drill', type: 'ctx-enricher<tgp>', dynamic: true, defaultValue: inheritDrill() }],
  impl: comp({
    enrichCtx: '%$drill()%',
    hFunc: (ctx, { valueSource, react: { h, hh, useState } }) => () => {
      const { func, value, metricField } = valueSource
      const [showCode, setShowCode] = useState(false)
      const chip = h('span:font-mono text-[11px] px-1 mr-2 rounded bg-gray-100 text-gray-600 cursor-pointer hover:bg-yellow-100',
        { onClick: () => setShowCode(!showCode) }, `${metricField} · last() ${showCode ? '▾' : '▸'}`)
      return h('div', {}, dashboard(h, func, value, ''),
        h('div:mb-3 text-xs', {}, chip, showCode && h('div:mt-1', {}, hh(ctx, reactComps.codeBrush))),
        hh(ctx, reactComps.dataBrush))
    }
  })
})

// ── brushDashboard — composite D: the smallest production layout. just the metric card; click its value → a popup opens with the
// codeBrush (the gold metric box + the silver pick box, stacked). clicking the highlighted metric token there reveals the
// histogram of `field` across ALL keys (bar→raw-event drill). closeable. a number you can trace, in one clean pane.
BrushView('brushDashboard', {
  params: [{ id: 'drill', type: 'ctx-enricher<tgp>', dynamic: true, defaultValue: inheritDrill() }],
  impl: comp({
    enrichCtx: '%$drill()%',
    hFunc: (ctx, { valueSource, react: { h, hh, useState } }) => () => {
      const { func, value, metricField, keys } = valueSource
      const [open, setOpen] = useState(false)
      return h('div:max-w-xl mx-auto p-4', {},
        h('div:bg-white border rounded-xl shadow-sm px-5 py-3 flex items-baseline gap-3 cursor-pointer hover:bg-gray-50', { onClick: () => setOpen(true) },
          h('div:text-[11px] uppercase tracking-wide text-gray-400', {}, func),
          h('div:text-2xl font-bold text-gray-900', {}, value),
          h('div:text-xs text-gray-400 ml-auto', {}, `${keys.length} ${metricField} ▸`)),
        open && h('div:fixed inset-0 bg-black/30 flex items-start justify-center p-6 z-50', { onClick: () => setOpen(false) },
          h('div:bg-white rounded-xl shadow-xl max-w-2xl w-full p-4 space-y-3 max-h-[90vh] overflow-auto', { onClick: e => e.stopPropagation() },
            h('div:flex items-baseline gap-2', {}, h('div:text-sm font-bold text-gray-900', {}, `${func} = ${value}`),
              h('div:text-xs text-gray-400 ml-auto', {}, `click the highlighted ${metricField} → histogram`),
              h('div:text-xs text-gray-400 cursor-pointer hover:text-gray-700', { onClick: () => setOpen(false) }, '✕')),
            hh(ctx, reactComps.codeBrush))))
    }
  })
})

// ── brushViews — DEV EXPLORER: drills ONCE, tabs flip the composite layouts so I can compare them. NOT the production model
// (you mount a single layout); this is a scratch harness. children inheritDrill → reuse this valueSource (one round-trip).
BrushView('brushViews', {
  params: [{ id: 'drill', type: 'ctx-enricher<tgp>', dynamic: true, mandatory: true }],
  impl: comp({
    enrichCtx: '%$drill()%',
    hFunc: (ctx, { react: { h, hh, useState } }) => () => {
      const tabs = [['B', 'Result-first', 'brushResultFirst'], ['A', 'Three panes', 'brushPanes'], ['C', 'Inline', 'brushInline']]
      const [tab, setTab] = useState(0)
      return h('div:max-w-5xl mx-auto p-4 bg-gray-50 min-h-screen', {},
        h('h1:text-lg font-bold text-gray-900 mb-1', {}, 'code ↔ data brush'),
        h('p:text-xs text-gray-400 mb-3', {}, 'drill a value → the SQL, the cube pick, and the raw events that made it'),
        h('div:flex gap-1 mb-4 border-b', {}, ...tabs.map(([tag, label], i) =>
          h(`div:px-3 py-1.5 text-sm cursor-pointer border-b-2 ${i === tab ? 'border-blue-500 text-blue-600 font-semibold' : 'border-transparent text-gray-500 hover:text-gray-700'}`,
            { key: tag, onClick: () => setTab(i) }, `${tag} · ${label}`))),
        hh(ctx, reactComps[tabs[tab][2]]))
    }
  })
})

SqlModifier('spanKeys', {
  impl: () => ({ isBuiltIn: true, phase: 'build:20', async modifyAst(sqlAst, ctx) {
    const { byExpr, debug, span, cube } = ctx.vars.compileArgs
    if (!(debug && span && cube.keyField)) return { sqlAst }
    const ast = structuredClone(sqlAst), selList = ast.statements[0].node.select_list
    const selected = selList.filter(c => c.class === 'COLUMN_REF' && byExpr[c.column_names?.[0]]).map(c => c.column_names[0])
    const keyNodes = await toNodes(Object.fromEntries(selected.map(n => [`${n}__keys`, `list(${cube.keyField})`])), ctx)
    selList.push(...Object.values(keyNodes))
    return { sqlAst: ast }
  } })
})
