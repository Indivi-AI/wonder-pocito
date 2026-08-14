# Viz widget implementation guide (ECharts)

Build one inline data-visualization widget as a jb6 `ReactComp`, rendered with
**ECharts using the SVG renderer**. ECharts is vendored locally
so it works in the browser AND in the node/jsdom `reactTest` harness. The SVG
renderer + a pure-JS text-measure shim (installed by `viz-core.js`) make every
title/label/value serialize as real `<text>`, so tests can assert them.

## Read first
- `admin/viz/viz-core.js` — the shared kit `jb.vizUtils` + the `vizComp(kind, optionFrom)` factory + the `VizWidget` dispatcher + the `jb.vizTheme` brand override point. Do NOT re-init echarts, install the shim, or manage resize/dispose yourself — the factory owns all of that.
- Copy the closest of these four GREEN templates (structure + test style):
  - `widgets/bar-widget.js` — single-series categorical, per-item color via `V.itemColors`. Template for: hbar, histogram, funnel, treemap, gauge, waterfall, boxplot, bullet.
  - `widgets/line-widget.js` — multi-series, dim non-matched series, `xType` handling, legend. Template for: area, scatter, bubble, groupedBar, stackedBar, radar.
  - `widgets/heatmap-widget.js` — `visualMap` + 2-D categorical data + cell outline highlight.
  - `widgets/table-widget.js` — DOM (no echarts, no `vizComp`, no importUrl); register the ReactComp directly. Template for: kpi.

## What you write (only this)
A file `widgets/<kind>-widget.js` containing:
1. one pure function `<kind>Option(props, V) -> echartsOption` (V is `jb.vizUtils`),
2. one call `jb.vizUtils.vizComp('<kind>', <kind>Option, '<one-line description>', <kind>ClickInfo?)`,
3. three co-located `reactTest`s (base + highlight + drillPanel).
The dispatcher maps `kind` → `${kind}Widget`, so the registered name MUST be `<kind>Widget` (the factory does this from the string you pass).

## Drill-down (every widget supports it)
`VizWidget` owns the drill flow: when the spec carries `drill: {kind, title, sql, question?, label?, valueFormat?}` (or an array of these), a click fills the `{name} {series} {x} {y} {value}` placeholders from the normalized click info (`{name:q}` → safely-quoted SQL literal), runs the SQL through the `runSql` prop, converts the rows with `V.rowsToSpec(kind, rows)` (column-alias conventions per kind: name/value · x,y[,series] · category,series,value · x,y,value · label,value · any for table) and renders the side plot in a panel below; `drill.question` escalates to chat via `onEvent({type:'question', question})` and is the fallback when there is no sql.
A widget only supplies the 4th `vizComp` arg `clickInfo(echartsParams, props) -> {name, series, x, y, value}` when the default (`p.name`/`p.seriesName`) is wrong — see heatmap (cell x/y), scatter/bubble (point name from data), line/area (x + series), gauge (title), boxplot (group by dataIndex). DOM widgets (table/kpi) call `props.onEvent({type:'drill', name, ...})` themselves on row/card click and set `cursor-pointer`.
Note: `viz-core` sets `animation:false` under `window.testing` so jsdom hit-testing sees final-state geometry.

## Boilerplate (copy from bar-widget.js, adapt the option builder)
```js
import { dsls, jb, coreUtils } from '@jb6/core'
import '@jb6/common'
import '@jb6/testing'
import '@jb6/react/tests/react-testers.js'
import '../viz-core.js'

const {
  common: { boolean: { contains, and } },
  test: { Test, 'ui-action': { delay }, test: { reactTest } }
} = dsls

const <kind>Option = (props, V) => {
  // 1. normalize props into echarts data (V.asArray for arrays)
  // 2. const hl = V.resolveExtremes(props.highlight, items)   // items:[{name,value}] where applicable
  // 3. const note = items.map(d => V.highlightNote(hl, d.name)).find(Boolean)
  // 4. emphasize: V.itemColors(hl, items) -> per-item colors (matched=color, others=V.DIM) for bar/pie-like;
  //    for series-based kinds, dim non-matched series (lineStyle/itemStyle opacity or color V.DIM).
  return {
    ...V.titleBlock(props.title, note),          // title.text + highlight note as subtext (assertable)
    tooltip: { /* trigger:'axis' | 'item' */ valueFormatter: v => V.fmtNum(v, props.valueFormat) },
    /* xAxis/yAxis/series/radar/... per kind */
  }
}

jb.vizUtils.vizComp('<kind>', <kind>Option, '<one line: what it shows + that highlight emphasizes an element>')

const sample = /* representative data for this kind */
Test('reactTest.viz.<kind>', { impl: reactTest({
  testedComp: (ctx,{react:{hh}})=>()=>hh(ctx, dsls.react['react-comp'].VizWidget, { spec: { kind:'<kind>', title:'...', /* data */ } }),
  expectedResult: and(contains('...title...'), contains('...a data label or value...')),
  userActions: delay(80)
}) })
Test('reactTest.viz.<kind>.highlight', { impl: reactTest({
  testedComp: (ctx,{react:{hh}})=>()=>hh(ctx, dsls.react['react-comp'].VizWidget, { spec: { kind:'<kind>', title:'...', /* data */, highlight:{ /* name or max */ note:'the punchline' } } }),
  expectedResult: contains('the punchline'),
  userActions: delay(80)
}) })
Test('reactTest.viz.<kind>.drillPanel', { impl: reactTest({   // import { drillHost } from '../viz-test-helpers.js', destructure clickVizShape
  testedComp: drillHost({ kind:'<kind>', /* data */, drill: { kind:'<kind>', title:'... {name}', sql:'SELECT ... WHERE dim = {name:q}' } }, /* side-plot rows */),
  expectedResult: and(contains("WHERE dim = '<clicked name>'"), contains('<filled title>'), contains('<a side-plot value>')),
  userActions: [delay(120), clickVizShape(/* {shapeType:'rect'|'sector'|'ec-polyline'...} */), delay(200)]
}) })
```
`drillHost` renders VizWidget with a recording `runSql` (echoes the filled SQL as `drillSql:` text and returns the given rows); `clickVizShape` drives a real zrender click on the first data-bound shape.

## `jb.vizUtils` API (use these — do not re-derive)
- Colors/text: `PALETTE`, `colorAt(i)`, `DIM` (gray for de-emphasized), `INK`, `MUTE`.
- Numbers: `fmtNum(v, format)` format ∈ `'int'|'$'|'%'|'compact'|undefined`; `compact(v)`.
- Highlight contract: `resolveExtremes(highlight, items)` (turns `{max}|{min}` into a name), `matchHighlight(highlight,name,i)`, `highlightNote(highlight,name)`, `hasHighlight(highlight)`, `itemColors(highlight, items)->[color]`.
- Option blocks: `titleBlock(title, note)` → `{title:{text,subtext}}` (note renders as blue subtext, assertable); `legendBlock(show, names)`.
- `asArray`, `ECHARTS_IMPORT`.

## Rules
- Functional, minimal lines. No comments except a 1–2 line header. Do NOT import echarts directly, do NOT call echarts.init — the factory does. Access nothing global except `jb.vizUtils`. No `export`.
- Title, axis/series labels, and the highlight `note` MUST appear as real text (ECharts SVG `<text>`) so tests/screenshots see them. Put the highlight note in `titleBlock`'s note arg.
- `highlight` MUST visibly emphasize the chosen element (full color) and dim the others (`V.DIM`), and surface `note`.
- Numbers come from `props` only — never invent data inside the widget.
- Tooltip: use `valueFormatter: v => V.fmtNum(v, props.valueFormat)`. Emphasis on hover is native (ECharts `emphasis`); the persistent highlight is baked into itemStyle/lineStyle colors.

## Verify (must pass before done)
```
node ./public/core/run-tst.js --entryPoint=admin/viz/widgets/<kind>-widget.js --pattern="reactTest.viz.<kind>"
```
Both tests must print `success: true` with empty `errorLog`. Read the assertions — the base test must assert the title AND a real data label/value; the highlight test must assert the `note`. Iterate until green. Report the file path + that tests pass.

## Data shapes per kind (the spec the widget receives as props; all also take title/subtitle/highlight/valueFormat/width/height)
- hbar: `data:[{name,value}]` — horizontal bars (`yAxis:type category`, `xAxis:value`); long labels; highlight accents a bar.
- groupedBar: `categories:[...], series:[{name, values:[...]}]` — clustered columns; highlight a series (by name) or category.
- stackedBar: `categories:[...], series:[{name, values:[...]}]` — `series[].stack:'total'`; highlight a series.
- line: `series:[{name, points:[{x,y}]}]` (single may be `data:[{x,y}]`); `xType:'category'|'number'|'time'`; highlight a series or point. ECharts `dataZoom` for numeric/time x.
- area: like line + `stacked?:true`; `areaStyle:{}` fill.
- scatter: `data:[{x,y,name?}]`, `xLabel/yLabel` axis names, `xFormat/yFormat` per-axis number formats (fall back to `valueFormat`); `series.type:'scatter'`; highlight points with a distinct color/larger symbol; dataZoom.
- bubble: `data:[{x,y,size,name?}]`, `xLabel/yLabel/sizeLabel` + `xFormat/yFormat`; `symbolSize` ∝ size; highlight + dataZoom.
- histogram: `values:[numbers]` (or `data:[numbers]`), `bins?:n` — bucket in JS, render as bar with `categoryGap:0`; highlight a bin `{min}|{max}` or index.
- boxplot: `data:[{name, values:[numbers]}]` (or precomputed `{name,min,q1,median,q3,max,outliers?}`) — compute the 5 stats in JS, `series.type:'boxplot'`; highlight a group.
- heatmap: `xCategories:[...], yCategories:[...], data:[{x,y,value}]` — `series.type:'heatmap'` + `visualMap`; highlight a cell `{x,y}` or row/col.
- radar: `indicators:[{name,max}], series:[{name, values:[...]}]` — `radar:{indicator}` + `series.type:'radar'`; highlight a series.
- funnel: `data:[{name,value}]` descending — `series.type:'funnel'`, show value/percent labels; highlight a stage.
- gauge: `value, min, max, target?` — `series.type:'gauge'`; note shows value vs target; highlight surfaces the note.
- treemap: `data:[{name,value}]` — `series.type:'treemap'`; highlight a tile (color, dim others).
- waterfall: `data:[{name,value}]` (value +/-, optional `{name,total:true}`) — ECharts waterfall via a transparent stacked base bar + a visible bar; running cumulative; highlight a step.
- table: `columns:[{key,label,format?}], rows:[{...}]` — NOT echarts; render an HTML `<table>` inside the widget div (the factory host div is fine; return a `null` option is not allowed — instead this kind overrides by rendering DOM). See note below.
- kpi: `items:[{label,value,delta?,format?}]` — scorecard; also DOM-based (see note).
- bullet: `data:[{name,value,target,ranges?:[a,b,c]}]` — actual vs target; build from stacked bars + a target markLine per row; highlight a row.

### table & kpi note
`table` and `kpi` are not charts. For these two, do NOT use `vizComp`; instead register the ReactComp directly (see the pattern in bar-widget's factory, but write your own `hFunc` returning DOM `h('table',...)` / a grid of `h('div',...)`), still named `tableWidget`/`kpiWidget`, still with the two reactTests through the dispatcher. They need no echarts and no importUrl.
