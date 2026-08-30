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

// pieWidget — share of a total across few categories (donut, hollow center holds the total).
// highlight offsets the matched slice in full color and dims the rest to V.DIM; note shows as subtext.
// Geometry is derived from width/height: donut + edge labels fit between the title band and the
// legend band at any size, and the center total is anchored by its middle at the true pie center.
const pieOption = (props, V) => {
  const data = (V.asArray(props.data) || []).map((d, i) => ({ name: String(d.name ?? d.label ?? i), value: +(d.value ?? d.y ?? 0) || 0, color: d.color }))
  const hl = V.resolveExtremes(props.highlight, data)
  const note = data.map((d) => V.highlightNote(hl, d.name)).find(Boolean)
  const active = V.hasHighlight(hl)
  const colors = V.itemColors(hl, data)
  const donut = props.donut !== false
  const total = data.reduce((s, d) => s + d.value, 0)
  const fmt = (v) => V.fmtNum(v, props.valueFormat)
  const width = +props.width || 540,
    height = +props.height || 320
  const top = props.title || note ? (props.title && note ? 56 : 40) : 10,
    bottom = props.showLegend ? 30 : 10
  const band = height - top - bottom
  const Rlab = Math.round(Math.max(28, Math.min(band / 2 - 26, width * 0.28))) // radius when outside labels are shown: 26px keeps label lines+text inside the band
  const strip = Math.round(width / 2 - Rlab - 6) // horizontal room left for one label column
  const labelW = Math.max(56, strip - 8)
  const rowH = Math.ceil(((Math.max(0, ...data.map((d) => d.name.length)) + 8) * 6.5) / labelW) * 13 + 8
  const showLabels = strip >= 84 && band / Math.ceil(data.length / 2) >= rowH && Rlab >= 40
  const R = showLabels ? Rlab : Math.round(Math.max(28, Math.min(band / 2 - 8, width * 0.42)))
  const centerY = Math.round(top + band / 2)
  const centerLabel = donut &&
    total && {
      text: fmt(total),
      left: 'center',
      top: centerY,
      textVerticalAlign: 'middle',
      textStyle: { fontSize: Math.max(12, Math.min(20, Math.round(R * 0.24))), fontWeight: 700, color: V.INK },
    }
  const titles = [V.titleBlock(props.title, note).title, centerLabel].filter(Boolean)
  const legend = V.legendBlock(
    props.showLegend,
    data.map((d) => d.name),
  )
  legend.legend && Object.assign(legend.legend, { type: 'scroll' }) // one bounded row — many slices page instead of wrapping over the chart
  return {
    ...(titles.length ? { title: titles } : {}),
    tooltip: { trigger: 'item', valueFormatter: fmt, textStyle: { fontSize: 12 } },
    ...legend,
    series: [
      {
        type: 'pie',
        radius: donut ? [Math.round(R * 0.7), R] : [0, R],
        center: ['50%', centerY],
        avoidLabelOverlap: true,
        minAngle: 6,
        padAngle: 2,
        itemStyle: { borderColor: '#fff', borderWidth: 2, borderRadius: 4 },
        emphasis: { scale: true, scaleSize: 6, itemStyle: { shadowBlur: 10, shadowColor: 'rgba(37,99,235,0.25)' } },
        selectedMode: 'single',
        selectedOffset: 10,
        data: data.map((d, i) => ({ name: d.name, value: d.value, itemStyle: { color: colors[i] }, selected: active && colors[i] !== V.DIM })),
        labelLine: showLabels ? { length: 12, length2: 10, smooth: true, lineStyle: { color: V.MUTE } } : { show: false },
        label: showLabels
          ? {
              alignTo: 'edge',
              edgeDistance: 6,
              minMargin: 4,
              formatter: (p) => `${p.name}  ${p.percent}%`,
              fontSize: 11,
              width: labelW,
              overflow: 'break', // narrow hosts wrap long labels instead of running under the pie
              color: (p) => (active && colors[p.dataIndex] === V.DIM ? V.MUTE : V.INK),
            }
          : { show: false },
      },
    ],
  }
}

jb.vizUtils.vizComp('pie', pieOption, 'Donut/pie showing share of a total across few categories; highlight offsets one slice in full color and dims the rest')

const sample = [
  { name: 'Alice', value: 120 },
  { name: 'Bob', value: 80 },
  { name: 'Carol', value: 50 },
  { name: 'Dan', value: 30 },
]

Test('reactTest.viz.pie', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'pie', title: 'Messages by sender', data: sample, valueFormat: 'int' },
        }),
    expectedResult: and(contains('Messages by sender'), contains('Alice'), contains('280')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.pie.highlight', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'pie', donut: true, title: 'Top spenders', data: sample, highlight: { name: 'Alice', note: 'biggest spender' } },
        }),
    expectedResult: and(contains('Top spenders'), contains('biggest spender'), contains('Alice')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.pie.drillPanel', {
  impl: reactTest({
    testedComp: drillHost(
      {
        kind: 'pie',
        title: 'Senders',
        data: sample,
        drill: { kind: 'pie', title: 'Months — {name}', sql: 'SELECT month AS name, msgs AS value FROM t WHERE sender = {name:q}' },
      },
      [
        { name: 'Jan', value: 60 },
        { name: 'Feb', value: 40 },
      ],
    ),
    expectedResult: and(contains("WHERE sender = 'Alice'"), contains('Months — Alice'), contains('Feb')),
    userActions: [delay(120), clickVizShape({ shapeType: 'sector' }), delay(200)],
  }),
})
