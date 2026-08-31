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

// groupedBarWidget — clustered columns comparing series within and across categories.
// `highlight` a series (by name) or a category keeps it colored + emphasized and dims the rest; note shows as subtext.
const groupedBarOption = (props, V) => {
  const categories = (V.asArray(props.categories) || []).map(String)
  const series = V.asArray(props.series) || []
  const seriesHl = V.resolveExtremes(
    props.highlight,
    series.map((s) => ({ name: s.name })),
  )
  const note = series.map((s) => V.highlightNote(seriesHl, s.name)).find(Boolean) || categories.map((c) => V.highlightNote(seriesHl, c)).find(Boolean) || V.highlightNote(seriesHl)
  const active = V.hasHighlight(seriesHl)
  const catMatch = (ci) => V.matchHighlight(seriesHl, categories[ci], ci)
  const byCat = active && categories.some((c, ci) => catMatch(ci))
  const multi = series.length > 1
  return {
    ...V.titleBlock(props.title, note),
    grid: { left: 8, right: 18, top: note ? (props.title ? 66 : 44) : props.title ? 46 : 16, bottom: (multi ? 40 : 20) + (props.yLabel ? 4 : 0), containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: (v) => V.fmtNum(v, props.valueFormat), axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(37,99,235,0.06)' } } },
    ...V.legendBlock(
      multi,
      series.map((s) => String(s.name)),
    ),
    xAxis: {
      type: 'category',
      data: categories,
      axisLine: { lineStyle: { color: V.DIM } },
      axisTick: { show: false },
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
    series: series.map((s, i) => {
      const on = !active || byCat || V.matchHighlight(seriesHl, s.name, i)
      const values = V.asArray(s.values) || []
      const color = byCat ? (p) => (catMatch(p.dataIndex) ? V.colorAt(i) : V.DIM) : on ? V.colorAt(i) : V.DIM
      return {
        name: String(s.name),
        type: 'bar',
        barMaxWidth: 34,
        barGap: '18%',
        barCategoryGap: '38%',
        data: values,
        itemStyle: { color, borderRadius: [3, 3, 0, 0], opacity: on ? 1 : 0.75 },
        emphasis: { focus: 'series', itemStyle: { color: V.colorAt(i) } },
        z: on ? 3 : 1,
      }
    }),
  }
}

jb.vizUtils.vizComp('groupedBar', groupedBarOption, 'Clustered columns comparing series per category; highlight emphasizes a series')

const cats = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const plan = { name: 'Plan', values: [40, 50, 45, 60, 55] }
const actual = { name: 'Actual', values: [38, 55, 42, 70, 50] }

Test('reactTest.viz.groupedBar', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'groupedBar', title: 'Plan vs Actual', categories: cats, series: [plan, actual], valueFormat: 'int' },
        }),
    expectedResult: and(contains('Plan vs Actual'), contains('Plan'), contains('Actual'), contains('Mon'), contains('60')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.groupedBar.highlight', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'groupedBar', title: 'Delivery', categories: cats, series: [plan, actual], highlight: { name: 'Thu', note: 'beat plan Thu' } },
        }),
    expectedResult: and(contains('Delivery'), contains('beat plan Thu'), contains('#2563eb'), contains('#16a34a')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.groupedBar.drillPanel', {
  impl: reactTest({
    testedComp: drillHost(
      {
        kind: 'groupedBar',
        title: 'Plan vs Actual',
        categories: cats,
        series: [plan, actual],
        drill: {
          kind: 'groupedBar',
          title: '{series} / {name}',
          sql: 'SELECT week AS category, team AS series, amount AS value FROM t WHERE day = {name:q}' + ' AND kind = {series:q}',
        },
      },
      [
        { category: 'W1', series: 'T1', value: 1 },
        { category: 'W2', series: 'T1', value: 2 },
        { category: 'W1', series: 'T2', value: 3 },
        { category: 'W2', series: 'T2', value: 4 },
      ],
    ),
    expectedResult: and(contains("WHERE day = 'Mon' AND kind = 'Plan'"), contains('Plan / Mon'), contains('W2'), contains('T2')),
    userActions: [delay(120), clickVizShape({ shapeType: 'rect' }), delay(200)],
  }),
})
