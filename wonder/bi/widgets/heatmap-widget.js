import { dsls, jb, coreUtils } from '@jb6/core'
import '@jb6/common'
import '@jb6/testing'
import '@jb6/react/tests/react-testers.js'
import '../viz-core.js'
import { drillHost } from '../viz-test-helpers.js'

const {
  common: {
    boolean: { contains, and },
  },
  test: {
    Test,
    'ui-action': { delay, clickVizShape },
    test: { reactTest },
  },
} = dsls

// heatmapWidget — magnitude across two categorical axes (visualMap colors by value,
// light→blue sequential ramp). `highlight` a cell {x,y} or {max}/{min} outlines it in
// INK and dims the rest; note shows as blue subtext.
const heatmapOption = (props, V) => {
  const xs = (V.asArray(props.xCategories) || []).map(String),
    ys = (V.asArray(props.yCategories) || []).map(String)
  const cells = (V.asArray(props.data) || []).map((d) => ({ x: String(d.x), y: String(d.y), value: +d.value || 0 }))
  const vals = cells.map((c) => c.value)
  const hlList = V.asArray(props.highlight) || []
  const marked = new Set()
  hlList.forEach((h) => {
    if (h && (h.max || h.min) && cells.length) {
      const c = cells.reduce((a, b) => ((h.max ? b.value > a.value : b.value < a.value) ? b : a))
      marked.add(c.x + '|' + c.y)
    } else if (h && h.x != null && h.y != null) marked.add(String(h.x) + '|' + String(h.y))
  })
  const active = marked.size > 0
  const note = hlList.map((h) => h && h.note).find(Boolean)
  const fmt = (v) => V.fmtNum(v, props.valueFormat)
  const compactAxis = { color: V.MUTE, fontSize: 10, hideOverlap: true, interval: 0 }
  return {
    ...V.titleBlock(props.title, note),
    grid: { left: 4, right: 12, top: props.title ? (note ? 60 : 46) : 14, bottom: 48, containLabel: true },
    tooltip: { position: 'top', borderColor: V.DIM, textStyle: { fontSize: 12 }, formatter: (p) => `${ys[p.value[1]]} · ${xs[p.value[0]]}<br/><b>${fmt(p.value[2])}</b>` },
    xAxis: {
      type: 'category',
      data: xs,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: V.DIM } },
      axisLabel: compactAxis,
      splitArea: { show: true, areaStyle: { color: ['#fff', '#fafbfc'] } },
    },
    yAxis: {
      type: 'category',
      data: ys,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: V.DIM } },
      axisLabel: compactAxis,
      splitArea: { show: true, areaStyle: { color: ['#fff', '#fafbfc'] } },
    },
    visualMap: {
      min: Math.min(0, ...vals),
      max: Math.max(1, ...vals),
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 6,
      itemWidth: 12,
      itemHeight: 90,
      inRange: { color: ['#eff6ff', '#93c5fd', V.PALETTE[0]] },
      textStyle: { color: V.MUTE, fontSize: 10 },
      formatter: fmt,
    },
    series: [
      {
        type: 'heatmap',
        itemStyle: { borderColor: '#fff', borderWidth: 1.5 },
        label: { show: true, fontSize: 10, formatter: (p) => fmt(p.value[2]), color: (p) => (active && !marked.has(xs[p.value[0]] + '|' + ys[p.value[1]]) ? V.MUTE : V.INK) },
        data: cells.map((c) => {
          const on = marked.has(c.x + '|' + c.y)
          return {
            value: [xs.indexOf(c.x), ys.indexOf(c.y), c.value],
            itemStyle: active ? (on ? { borderColor: V.INK, borderWidth: 2.5, opacity: 1 } : { opacity: 0.35 }) : undefined,
          }
        }),
        emphasis: { itemStyle: { borderColor: V.INK, borderWidth: 2.5 } },
      },
    ],
  }
}

const heatmapClickInfo = (p, props) => {
  const V = jb.vizUtils
  const xs = (V.asArray(props.xCategories) || []).map(String),
    ys = (V.asArray(props.yCategories) || []).map(String)
  return { name: `${xs[p.value?.[0]]} ${ys[p.value?.[1]]}`, x: xs[p.value?.[0]], y: ys[p.value?.[1]], value: p.value?.[2] }
}

jb.vizUtils.vizComp('heatmap', heatmapOption, 'Heatmap of value density across two categorical axes; highlight outlines a cell', heatmapClickInfo)

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const parts = ['AM', 'PM', 'Eve']
const grid = [].concat(...parts.map((y, yi) => days.map((x, xi) => ({ x, y, value: (xi * 7 + yi * 13) % 100 }))))

Test('reactTest.viz.heatmap', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'heatmap', title: 'Activity by hour', xCategories: days, yCategories: parts, data: grid, valueFormat: 'int' },
        }),
    expectedResult: and(contains('Activity by hour'), contains('Thu')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.heatmap.highlight', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'heatmap', title: 'Peak load', xCategories: days, yCategories: parts, data: grid, highlight: { max: true, note: 'busiest slot' } },
        }),
    expectedResult: and(contains('Peak load'), contains('busiest slot')),
    userActions: delay(80),
  }),
})

// clicking a cell drills with {x}/{y} = the cell's two axis categories
Test('reactTest.viz.heatmap.drillPanel', {
  impl: reactTest({
    testedComp: drillHost(
      {
        kind: 'heatmap',
        title: 'Activity',
        xCategories: days,
        yCategories: parts,
        data: grid,
        drill: { kind: 'heatmap', title: 'Cell {x} {y}', sql: 'SELECT week AS x, slot AS y, hits AS value FROM t WHERE day = {x:q} AND part = {y:q}' },
      },
      [
        { x: 'W1', y: 'S1', value: 6 },
        { x: 'W2', y: 'S1', value: 8 },
      ],
    ),
    expectedResult: and(contains("WHERE day = 'Mon' AND part = 'AM'"), contains('Cell Mon AM'), contains('W2')),
    userActions: [delay(120), clickVizShape({ shapeType: 'rect' }), delay(200)],
  }),
})
