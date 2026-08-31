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
    test: { reactTest },
  },
  react: {
    'ui-action': { delay, clickVizShape },
  },
} = dsls

// bulletWidget — Stephen Few bullet graph: graded qualitative bands (light→dark) behind a slim
// measure bar for `value` and a crisp perpendicular target tick. highlight lifts one row, dims the rest.
const bulletOption = (props, V) => {
  const data = (V.asArray(props.data) || []).map((d, i) => ({
    name: String(d.name ?? d.label ?? i),
    value: +(d.value ?? 0) || 0,
    target: +(d.target ?? 0) || 0,
    ranges: (V.asArray(d.ranges) || []).map(Number).sort((a, b) => a - b),
  }))
  const names = data.map((d) => d.name)
  const hl = V.resolveExtremes(props.highlight, data)
  const note = data.map((d) => V.highlightNote(hl, d.name)).find(Boolean)
  const active = V.hasHighlight(hl)
  const on = (i) => !active || V.matchHighlight(hl, data[i].name, i)
  const bandCount = Math.max(0, ...data.map((d) => d.ranges.length))
  const shade = (b, lit) => {
    const g = bandCount > 1 ? b / (bandCount - 1) : 0,
      l = Math.round((lit ? 240 : 247) - g * (lit ? 66 : 14))
    return `rgb(${l},${l + 5},${l + 11})`
  }
  const fmt = (v) => V.fmtNum(v, props.valueFormat)
  const bandSeries = Array.from({ length: bandCount }, (_, b) => ({
    type: 'bar',
    stack: 'band',
    silent: true,
    barWidth: '68%',
    z: 1,
    emphasis: { disabled: true },
    data: data.map((d, i) => ({ value: (d.ranges[b] ?? 0) - (b ? (d.ranges[b - 1] ?? 0) : 0), itemStyle: { color: shade(b, on(i)) } })),
  }))
  return {
    ...V.titleBlock(props.title, note),
    grid: { left: 12, right: 70, top: props.title ? (note ? 62 : 46) : 18, bottom: 22, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => fmt(v), textStyle: { fontSize: 12 } },
    xAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { color: V.MUTE, fontSize: 10, formatter: (v) => fmt(v) },
    },
    yAxis: {
      type: 'category',
      data: names,
      inverse: true,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: V.DIM } },
      axisLabel: { fontSize: 11, color: V.INK, fontWeight: 600 },
    },
    series: [
      ...bandSeries,
      {
        type: 'bar',
        name: 'value',
        barWidth: '26%',
        barGap: '-100%',
        z: 3,
        itemStyle: { borderRadius: 2 },
        data: data.map((d, i) => ({ value: d.value, itemStyle: { color: on(i) ? V.colorAt(i) : V.DIM } })),
        label: {
          show: true,
          position: 'right',
          fontSize: 10,
          formatter: (p) => `${fmt(data[p.dataIndex].value)} / ${fmt(data[p.dataIndex].target)}`,
          color: (p) => (on(p.dataIndex) ? V.INK : V.MUTE),
        },
      },
      {
        type: 'scatter',
        name: 'target',
        symbol: 'rect',
        symbolSize: [3, 24],
        z: 4,
        silent: true,
        data: data.map((d, i) => ({ value: [d.target, d.name], itemStyle: { color: on(i) ? V.INK : V.DIM } })),
      },
    ],
  }
}

jb.vizUtils.vizComp('bullet', bulletOption, 'Bullet chart comparing actual values to targets across KPI rows with qualitative range bands; highlight emphasizes a row')

const sample = [
  { name: 'Revenue', value: 270, target: 300, ranges: [150, 250, 350] },
  { name: 'Profit', value: 22, target: 25, ranges: [10, 20, 30] },
  { name: 'New users', value: 1700, target: 1500, ranges: [800, 1400, 2000] },
]

Test('reactTest.viz.bullet', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'bullet', title: 'KPIs vs target', data: sample, valueFormat: 'int' },
        }),
    expectedResult: and(contains('KPIs vs target'), contains('Revenue'), contains('270')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.bullet.highlight', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'bullet', title: 'KPI focus', data: sample, valueFormat: 'int', highlight: { name: 'New users', note: 'beat target' } },
        }),
    expectedResult: and(contains('KPI focus'), contains('New users'), contains('beat target')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.bullet.drillPanel', {
  impl: reactTest({
    testedComp: drillHost(
      {
        kind: 'bullet',
        title: 'KPIs vs target',
        data: sample,
        valueFormat: 'int',
        drill: { kind: 'bullet', title: 'Regions of {name}', sql: 'SELECT region AS name, actual AS value, goal AS target FROM t WHERE kpi = {name:q}' },
      },
      [
        { name: 'North', value: 5, target: 8 },
        { name: 'South', value: 9, target: 7 },
      ],
    ),
    expectedResult: and(contains("WHERE kpi = 'Revenue'"), contains('Regions of Revenue'), contains('South')),
    userActions: [delay(120), clickVizShape({ shapeType: 'rect' }), delay(200)],
  }),
})
