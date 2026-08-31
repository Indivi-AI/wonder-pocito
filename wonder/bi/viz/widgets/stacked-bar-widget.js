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

// stackedBarWidget — part-to-whole per category (segments stacked to a total).
// `highlight` a series keeps it colored and dims the rest; note shows as subtext.
const stackedBarOption = (props, V) => {
  const categories = (V.asArray(props.categories) || []).map(String)
  const series = (V.asArray(props.series) || []).map((s) => ({ name: String(s.name ?? ''), values: (V.asArray(s.values) || []).map((v) => +v || 0) }))
  const hl = V.resolveExtremes(
    props.highlight,
    series.map((s) => ({ name: s.name })),
  )
  const note = series.map((s) => V.highlightNote(hl, s.name)).find(Boolean) || V.highlightNote(hl)
  const active = V.hasHighlight(hl)
  const multi = series.length > 1
  const totals = categories.map((_, ci) => series.reduce((sum, s) => sum + (s.values[ci] || 0), 0))
  const peak = Math.max(1, ...totals)
  const last = series.length - 1
  return {
    ...V.titleBlock(props.title, note),
    grid: { left: 52, right: 18, top: props.title ? (note ? 64 : 48) : 22, bottom: (multi ? 40 : 26) + (props.yLabel ? 0 : 0), containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(37,99,235,0.06)' } }, valueFormatter: (v) => V.fmtNum(v, props.valueFormat) },
    ...V.legendBlock(
      multi,
      series.map((s) => s.name),
    ),
    xAxis: {
      type: 'category',
      data: categories,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: V.DIM } },
      axisLabel: { color: V.MUTE, fontSize: 10, hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      name: props.yLabel,
      nameTextStyle: { color: V.MUTE, fontSize: 11 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
      axisLabel: { color: V.MUTE, fontSize: 10, formatter: (v) => V.fmtNum(v, props.valueFormat) },
    },
    series: series
      .map((s, i) => {
        const on = !active || V.matchHighlight(hl, s.name, i)
        const total = i === last
        return {
          name: s.name,
          type: 'bar',
          stack: 'total',
          barMaxWidth: 52,
          data: s.values,
          z: on ? 3 : 1,
          itemStyle: { color: on ? V.colorAt(i) : V.DIM, borderColor: '#fff', borderWidth: 1.5, borderRadius: total ? [4, 4, 0, 0] : 0 },
          emphasis: { focus: 'series' },
          label: {
            show: on,
            position: 'inside',
            color: '#fff',
            fontSize: 10,
            fontWeight: 600,
            formatter: (p) => (s.values[p.dataIndex] / peak >= 0.14 ? V.fmtNum(p.value, props.valueFormat) : ''),
          },
          ...(total ? { labelLayout: { hideOverlap: true } } : {}),
        }
      })
      .concat({
        type: 'bar',
        stack: 'total',
        silent: true,
        itemStyle: { color: 'transparent' },
        data: totals.map(() => 0),
        tooltip: { show: false },
        label: { show: true, position: 'top', distance: 5, color: V.INK, fontSize: 11, fontWeight: 700, formatter: (p) => V.fmtNum(totals[p.dataIndex], props.valueFormat) },
      }),
  }
}

jb.vizUtils.vizComp('stackedBar', stackedBarOption, 'Stacked columns showing part-to-whole per category; highlight emphasizes a series')

const cats = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const paid = { name: 'Paid', values: [20, 25, 18, 30, 22] }
const organic = { name: 'Organic', values: [10, 18, 22, 20, 26] }

Test('reactTest.viz.stackedBar', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'stackedBar', title: 'Traffic mix', categories: cats, series: [paid, organic], valueFormat: 'int' },
        }),
    expectedResult: and(contains('Traffic mix'), contains('Paid'), contains('Organic'), contains('Mon'), contains('30')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.stackedBar.highlight', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'stackedBar', title: 'Channel share', categories: cats, series: [paid, organic], highlight: { name: 'Paid', note: 'paid heavy' } },
        }),
    expectedResult: and(contains('Channel share'), contains('paid heavy')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.stackedBar.drillPanel', {
  impl: reactTest({
    testedComp: drillHost(
      {
        kind: 'stackedBar',
        title: 'Traffic mix',
        categories: cats,
        series: [paid, organic],
        drill: {
          kind: 'stackedBar',
          title: '{series} on {name}',
          sql: 'SELECT week AS category, src AS series, amount AS value FROM t WHERE day = {name:q} AND channel = {series:q}',
        },
      },
      [
        { category: 'W1', series: 'S1', value: 1 },
        { category: 'W2', series: 'S1', value: 2 },
        { category: 'W1', series: 'S2', value: 3 },
        { category: 'W2', series: 'S2', value: 4 },
      ],
    ),
    expectedResult: and(contains("WHERE day = 'Mon' AND channel = 'Organic'"), contains('Organic on Mon'), contains('W2'), contains('S2')),
    userActions: [delay(120), clickVizShape({ shapeType: 'rect' }), delay(200)],
  }),
})
