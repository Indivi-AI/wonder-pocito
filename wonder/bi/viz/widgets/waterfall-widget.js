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

// waterfallWidget — a starting total built up/down to an ending total via sequential +/- steps.
// A transparent stacked base floats each visible delta to its running cumulative; connectors link
// step tops. increase=green, decrease=red, total=neutral ink; highlight keeps one step full-color,
// dims the rest to V.DIM and surfaces its note as blue subtext.
const waterfallOption = (props, V) => {
  const GREEN = V.colorAt(1),
    RED = V.colorAt(3)
  let cum = 0
  const steps = (V.asArray(props.data) || []).map((d, i) => {
    const name = String(d.name ?? d.label ?? i)
    if (d.total) {
      const end = +(d.value ?? cum) || cum
      const s = { name, total: true, delta: end, base: 0, top: end }
      cum = end
      return s
    }
    const delta = +(d.value ?? d.y ?? 0) || 0,
      start = cum
    cum = start + delta
    return { name, delta, base: Math.min(start, cum), top: cum }
  })
  const hl = V.resolveExtremes(
    props.highlight,
    steps.map((s) => ({ name: s.name, value: s.delta })),
  )
  const note = steps.map((s) => V.highlightNote(hl, s.name)).find(Boolean)
  const active = V.hasHighlight(hl)
  const dimmed = (s, i) => active && !V.matchHighlight(hl, s.name, i)
  const colorOf = (s, i) => (dimmed(s, i) ? V.DIM : s.total ? V.INK : s.delta >= 0 ? GREEN : RED)
  const sign = (v) => (v > 0 ? '+' : '') + V.fmtNum(v, props.valueFormat)
  const connectors = steps.slice(0, -1).map((s, i) => [
    { xAxis: i, yAxis: s.top },
    { xAxis: i + 1, yAxis: s.top },
  ])
  return {
    ...V.titleBlock(props.title, note),
    grid: { left: 8, right: 18, top: props.title ? (note ? 62 : 46) : 16, bottom: 28, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (ps) => {
        const s = steps[ps[0].dataIndex]
        return `${s.name}<br/>${s.total ? V.fmtNum(s.delta, props.valueFormat) : sign(s.delta)} → ${V.fmtNum(s.top, props.valueFormat)}`
      },
    },
    xAxis: {
      type: 'category',
      data: steps.map((s) => s.name),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: V.DIM } },
      axisLabel: { color: V.MUTE, fontSize: 10, interval: 0, hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      name: props.yLabel,
      nameTextStyle: { color: V.MUTE, fontSize: 11 },
      axisLabel: { color: V.MUTE, fontSize: 10, formatter: (v) => V.fmtNum(v, props.valueFormat) },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
    },
    series: [
      { type: 'bar', stack: 'wf', silent: true, itemStyle: { color: 'transparent' }, emphasis: { disabled: true }, data: steps.map((s) => s.base) },
      {
        type: 'bar',
        stack: 'wf',
        barMaxWidth: 46,
        itemStyle: { borderRadius: [3, 3, 0, 0] },
        emphasis: { focus: 'series', itemStyle: { shadowBlur: 8, shadowColor: 'rgba(30,41,59,0.2)' } },
        data: steps.map((s, i) => ({ value: Math.abs(s.delta), itemStyle: { color: colorOf(s, i) } })),
        markLine: { silent: true, symbol: 'none', lineStyle: { color: V.DIM, type: 'dashed', width: 1 }, data: connectors },
        label: {
          show: true,
          position: 'top',
          fontSize: 10,
          color: (p) => (dimmed(steps[p.dataIndex], p.dataIndex) ? V.DIM : active ? V.INK : V.MUTE),
          formatter: (p) => (steps[p.dataIndex].total ? V.fmtNum(steps[p.dataIndex].delta, props.valueFormat) : sign(steps[p.dataIndex].delta)),
        },
      },
    ],
  }
}

jb.vizUtils.vizComp('waterfall', waterfallOption, 'Waterfall chart: a running total built from sequential +/- contributions; highlight emphasizes one step')

const sample = [
  { name: 'Start', total: true, value: 100 },
  { name: 'Sales', value: 60 },
  { name: 'Returns', value: -25 },
  { name: 'Fees', value: -15 },
  { name: 'Bonus', value: 40 },
  { name: 'End', total: true },
]

Test('reactTest.viz.waterfall', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'waterfall', title: 'Net revenue build', data: sample, yLabel: 'amount', valueFormat: 'int' },
        }),
    expectedResult: and(contains('Net revenue build'), contains('Returns'), contains('-25')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.waterfall.highlight', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'waterfall', title: 'Cost driver', data: sample, valueFormat: 'int', highlight: { name: 'Returns', note: 'biggest leak' } },
        }),
    expectedResult: contains('biggest leak'),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.waterfall.drillPanel', {
  impl: reactTest({
    testedComp: drillHost(
      {
        kind: 'waterfall',
        title: 'Net revenue build',
        data: sample,
        valueFormat: 'int',
        drill: { kind: 'waterfall', title: 'Steps of {name}', sql: 'SELECT step AS name, delta AS value FROM t WHERE stage = {name:q}' },
      },
      [
        { name: 'Online', value: 40 },
        { name: 'Retail', value: -12 },
      ],
    ),
    expectedResult: and(contains("WHERE stage = '"), contains('Steps of '), contains('Retail'), contains('-12')),
    userActions: [delay(120), clickVizShape({ shapeType: 'rect' }), delay(200)],
  }),
})
