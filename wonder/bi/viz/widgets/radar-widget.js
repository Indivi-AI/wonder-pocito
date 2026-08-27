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

// radarWidget — multi-metric profile comparing series across shared indicators.
// `highlight` a series (by name) keeps it full color with an area fill; others dim.
const radarOption = (props, V) => {
  const indicators = (V.asArray(props.indicators) || []).map((d) => ({ name: String(d.name ?? ''), max: +(d.max ?? 1) || 1 }))
  const series = (V.asArray(props.series) || []).map((s) => ({ name: String(s.name ?? ''), values: (V.asArray(s.values) || []).map((v) => +v || 0) }))
  const hl = V.resolveExtremes(
    props.highlight,
    series.map((s) => ({ name: s.name })),
  )
  const note = series.map((s) => V.highlightNote(hl, s.name)).find(Boolean) || V.highlightNote(hl)
  const active = V.hasHighlight(hl)
  const multi = series.length > 1
  return {
    ...V.titleBlock(props.title, note),
    tooltip: { trigger: 'item', valueFormatter: (v) => V.fmtNum(v, props.valueFormat) },
    ...V.legendBlock(
      multi,
      series.map((s) => s.name),
    ),
    radar: {
      indicator: indicators,
      center: ['50%', props.title ? '57%' : '52%'],
      radius: '58%',
      axisName: { color: V.MUTE, fontSize: 11, padding: [2, 4] },
      nameGap: 8,
      splitNumber: 4,
      axisLine: { lineStyle: { color: '#e2e8f0' } },
      splitLine: { lineStyle: { color: '#eef2f7' } },
      splitArea: { areaStyle: { color: ['#fafbfc', '#ffffff'] } },
    },
    series: [
      {
        type: 'radar',
        symbolSize: 4,
        data: series.map((s, i) => {
          const on = !active || V.matchHighlight(hl, s.name, i)
          const color = on ? V.colorAt(i) : V.DIM
          return {
            name: s.name,
            value: s.values,
            lineStyle: { color, width: on ? (active ? 3 : 2.4) : 1.2, opacity: on ? 1 : 0.85 },
            itemStyle: { color },
            areaStyle: { color, opacity: on ? (active ? 0.28 : 0.16) : 0.04 },
            emphasis: { lineStyle: { width: on ? 3.5 : 1.2 }, areaStyle: { opacity: on ? 0.35 : 0.06 } },
            z: on ? 3 : 1,
          }
        }),
      },
    ],
  }
}

jb.vizUtils.vizComp('radar', radarOption, 'Radar chart comparing series across shared indicators; highlight emphasizes one series')

const indicators = [
  { name: 'Speed', max: 100 },
  { name: 'Power', max: 100 },
  { name: 'Range', max: 100 },
  { name: 'Comfort', max: 100 },
  { name: 'Price', max: 100 },
]
const series = [
  { name: 'Model A', values: [80, 65, 70, 90, 55] },
  { name: 'Model B', values: [60, 90, 50, 70, 80] },
]

Test('reactTest.viz.radar', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'radar', title: 'Model comparison', indicators, series, valueFormat: 'int' },
        }),
    expectedResult: and(contains('Model comparison'), contains('Speed'), contains('Comfort'), contains('Model A'), contains('Model B')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.radar.highlight', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'radar', title: 'Best balance', indicators, series, highlight: { name: 'Model A', note: 'most balanced' } },
        }),
    expectedResult: and(contains('Best balance'), contains('most balanced'), contains('Model A')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.radar.drillPanel', {
  impl: reactTest({
    testedComp: drillHost(
      {
        kind: 'radar',
        title: 'Models',
        indicators,
        series,
        drill: { kind: 'radar', title: 'Profile of {name}', sql: 'SELECT metric AS indicator, trim AS series, score AS value FROM t WHERE model = {name:q}' },
      },
      [
        { indicator: 'Zul', series: 'S1', value: 5 },
        { indicator: 'Qet', series: 'S1', value: 7 },
        { indicator: 'Rix', series: 'S1', value: 3 },
      ],
    ),
    expectedResult: and(contains("WHERE model = 'Model"), contains('Profile of Model'), contains('Zul')),
    userActions: [delay(120), clickVizShape(), delay(200)],
  }),
})
