import { dsls, jb, coreUtils } from '@jb6/core'
import '@jb6/common'
import '@jb6/testing'
import '@jb6/react/tests/react-testers.js'
import '../viz-core.js'
import './table-widget.js' // drill side-plot target in tests
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

// bubbleWidget — three numerics on one scatter: x, y position, bubble AREA ∝ size.
// `highlight` keeps matched points full-color/opaque on top, dims the rest; note shows as subtext.
const bubbleOption = (props, V) => {
  const data = (V.asArray(props.data) || []).map((d, i) => ({ name: String(d.name ?? i), x: +d.x || 0, y: +d.y || 0, size: +d.size || 0 }))
  const hl = V.resolveExtremes(
    props.highlight,
    data.map((d) => ({ name: d.name, value: d.size })),
  )
  const note = data.map((d) => V.highlightNote(hl, d.name)).find(Boolean) || V.highlightNote(hl)
  const active = V.hasHighlight(hl)
  const sizes = data.map((d) => d.size),
    lo = Math.min(...sizes),
    hi = Math.max(...sizes),
    MIN = 12,
    MAX = 46
  const symbolSize = (s) => (hi === lo ? (MIN + MAX) / 2 : MIN + Math.sqrt((s - lo) / (hi - lo)) * (MAX - MIN))
  const xFormat = props.xFormat || props.valueFormat,
    yFormat = props.yFormat || props.valueFormat
  return {
    ...V.titleBlock(props.title, note),
    grid: { left: 56, right: 26, top: props.title ? 50 : 18, bottom: 56 },
    tooltip: {
      trigger: 'item',
      formatter: (p) => `<b>${p.value[3]}</b><br/>${props.xLabel || 'x'}: ${V.fmtNum(p.value[0], xFormat)}`
        + `<br/>${props.yLabel || 'y'}: ${V.fmtNum(p.value[1], yFormat)}`
        + `<br/>${props.sizeLabel || 'size'}: ${V.fmtNum(p.value[2], props.valueFormat)}`,
    },
    xAxis: {
      type: 'value',
      name: props.xLabel,
      nameLocation: 'middle',
      nameGap: 26,
      scale: true,
      splitLine: { lineStyle: { color: '#f1f5f9' } },
      axisLabel: { color: V.MUTE, fontSize: 10, formatter: (v) => V.fmtNum(v, xFormat) },
    },
    yAxis: {
      type: 'value',
      name: props.yLabel,
      nameTextStyle: { color: V.MUTE, fontSize: 11 },
      scale: true,
      splitLine: { lineStyle: { color: '#f1f5f9' } },
      axisLabel: { color: V.MUTE, fontSize: 10, formatter: (v) => V.fmtNum(v, yFormat) },
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0 },
      { type: 'inside', yAxisIndex: 0 },
    ],
    series: [
      {
        type: 'scatter',
        symbolSize: (v) => symbolSize(v[2]),
        data: data.map((d, i) => {
          const on = !active || V.matchHighlight(hl, d.name, i)
          return {
            value: [d.x, d.y, d.size, d.name],
            z: on ? 3 : 1,
            itemStyle: { color: on ? V.colorAt(i) : V.DIM, opacity: on ? 0.85 : 0.4, borderColor: '#fff', borderWidth: 1 },
            emphasis: { focus: 'self', itemStyle: { opacity: 1, borderColor: V.INK, borderWidth: 1.5 } },
          }
        }),
      },
    ],
  }
}

const bubbleClickInfo = (p) => ({ name: String(p.value?.[3] ?? ''), x: p.value?.[0], y: p.value?.[1], value: p.value?.[2] })

jb.vizUtils.vizComp('bubble', bubbleOption, 'Bubble chart of x, y and size on one scatter; highlight emphasizes a point', bubbleClickInfo)

const sample = [
  { name: 'Alpha', x: 10, y: 20, size: 40 },
  { name: 'Beta', x: 25, y: 45, size: 90 },
  { name: 'Gamma', x: 40, y: 30, size: 60 },
  { name: 'Delta', x: 55, y: 60, size: 120 },
]

Test('reactTest.viz.bubble', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'bubble', title: 'Accounts by reach', data: sample, xLabel: 'recency', yLabel: 'frequency', valueFormat: 'int' },
        }),
    expectedResult: and(contains('Accounts by reach'), contains('recency'), contains('frequency')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.bubble.highlight', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'bubble', title: 'Biggest account', data: sample, highlight: { max: true, note: 'largest by size' } },
        }),
    expectedResult: contains('largest by size'),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.bubble.drillPanel', {
  impl: reactTest({
    testedComp: drillHost(
      { kind: 'bubble', title: 'Accounts by reach', data: sample, drill: { kind: 'table', title: 'Deals of {name}', sql: 'SELECT deal, amount FROM t WHERE account = {name:q}' } },
      [{ deal: 'Renewal Q3', amount: 88 }],
    ),
    expectedResult: and(contains("WHERE account = '"), contains('Deals of '), contains('Renewal Q3'), contains('88')),
    userActions: [delay(120), clickVizShape(), delay(200)],
  }),
})
