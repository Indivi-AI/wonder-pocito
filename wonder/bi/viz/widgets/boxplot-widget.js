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

// boxplotWidget — box-and-whisker spread (min/q1/median/q3/max + IQR-fence outliers)
// across groups. `highlight` colors one group's box full, dims the rest; note = subtext.
const quantile = (s, p) => {
  const i = (s.length - 1) * p,
    lo = Math.floor(i)
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo)
}
const summarize = (d) => {
  if (d.median != null) return { name: d.name, five: [+d.min, +d.q1, +d.median, +d.q3, +d.max], outliers: [] }
  const s = (d.values || [])
    .map(Number)
    .filter((v) => !isNaN(v))
    .sort((a, b) => a - b)
  const q1 = quantile(s, 0.25),
    q3 = quantile(s, 0.75),
    f = 1.5 * (q3 - q1)
  const inl = s.filter((v) => v >= q1 - f && v <= q3 + f)
  return { name: d.name, five: [inl[0], q1, quantile(s, 0.5), q3, inl[inl.length - 1]], outliers: s.filter((v) => v < q1 - f || v > q3 + f) }
}
const fade = (c, V) => (c === V.DIM ? c : c + '26')

const boxplotOption = (props, V) => {
  const groups = (V.asArray(props.data) || []).map((d, i) => summarize({ ...d, name: String(d.name ?? i) }))
  const items = groups.map((g) => ({ name: g.name, value: g.five[2] }))
  const hl = V.resolveExtremes(props.highlight, items)
  const note = groups.map((g) => V.highlightNote(hl, g.name)).find(Boolean)
  const active = V.hasHighlight(hl)
  const colors = V.itemColors(hl, items)
  const on = (i) => !active || colors[i] !== V.DIM
  const fmt = (v) => V.fmtNum(v, props.valueFormat)
  const stat = (n, v) => `${n} ${fmt(v)}`
  return {
    ...V.titleBlock(props.title, note),
    grid: { left: 48, right: 16, top: props.title ? (note ? 60 : 44) : 16, bottom: 26, containLabel: true },
    tooltip: {
      trigger: 'item',
      confine: true,
      textStyle: { fontSize: 12 },
      formatter: (p) =>
        p.seriesType === 'scatter'
          ? `${p.name} · outlier ${fmt(p.value[1])}`
          : `<b>${p.name}</b><br/>${[stat('max', p.value[5]), stat('q3', p.value[4]), stat('median', p.value[3]), stat('q1', p.value[2]), stat('min', p.value[1])].join('<br/>')}`,
    },
    xAxis: {
      type: 'category',
      data: groups.map((g) => g.name),
      boundaryGap: true,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: V.DIM } },
      axisLabel: { color: V.MUTE, fontSize: 11, interval: 0, hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      name: props.yLabel,
      nameTextStyle: { color: V.MUTE, fontSize: 11, align: 'left' },
      nameGap: 12,
      axisLabel: { color: V.MUTE, fontSize: 10, formatter: fmt },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
    },
    series: [
      {
        type: 'boxplot',
        boxWidth: [10, 34],
        emphasis: { itemStyle: { borderWidth: 2.4, shadowBlur: 8, shadowColor: 'rgba(37,99,235,0.25)' } },
        data: groups.map((g, i) => ({
          value: g.five,
          itemStyle: {
            color: fade(colors[i], V),
            borderColor: colors[i],
            borderWidth: on(i) ? 2.2 : 1.4,
            opacity: on(i) ? 1 : 0.75,
          },
        })),
      },
      {
        type: 'scatter',
        symbolSize: 6,
        z: 3,
        data: groups.flatMap((g, i) =>
          g.outliers.map((v) => ({
            name: g.name,
            value: [i, v],
            itemStyle: { color: on(i) ? colors[i] : V.DIM, opacity: on(i) ? 0.9 : 0.55, borderColor: '#fff', borderWidth: 1 },
          })),
        ),
      },
    ],
  }
}

const boxplotClickInfo = (p, props) => ({ name: String((jb.vizUtils.asArray(props.data) || [])[p.dataIndex]?.name ?? p.name ?? '') })

jb.vizUtils.vizComp('boxplot', boxplotOption, 'Box-and-whisker chart of value spread across groups; highlight emphasizes one group', boxplotClickInfo)

const sample = [
  { name: 'Mon', values: [12, 15, 18, 22, 25, 28, 30, 35] },
  { name: 'Tue', values: [20, 24, 26, 30, 33, 38, 42, 50] },
  { name: 'Wed', values: [8, 10, 14, 16, 19, 21, 24, 60] },
  { name: 'Thu', values: [30, 34, 38, 41, 45, 49, 53, 58] },
]

Test('reactTest.viz.boxplot', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'boxplot', title: 'Latency by day', data: sample, yLabel: 'ms', valueFormat: 'int' },
        }),
    expectedResult: and(contains('Latency by day'), contains('Thu'), contains('ms')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.boxplot.highlight', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'boxplot', title: 'Spread by day', data: sample, highlight: { name: 'Tue', note: 'widest spread' } },
        }),
    expectedResult: contains('widest spread'),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.boxplot.drillPanel', {
  impl: reactTest({
    testedComp: drillHost(
      {
        kind: 'boxplot',
        title: 'Latency by day',
        data: sample,
        drill: { kind: 'boxplot', title: 'Hours of {name}', sql: 'SELECT hour AS name, latency AS value FROM t WHERE day = {name:q}' },
      },
      [
        { name: 'H1', value: 3 },
        { name: 'H1', value: 5 },
        { name: 'H2', value: 8 },
        { name: 'H2', value: 9 },
      ],
    ),
    expectedResult: and(contains("WHERE day = 'Mon'"), contains('Hours of Mon'), contains('H2')),
    userActions: [delay(120), clickVizShape(), delay(200)],
  }),
})
