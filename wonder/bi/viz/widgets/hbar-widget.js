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

// hbarWidget — horizontal bars ranking a few categories with long labels; largest on top.
// `highlight` gives one bar full color + emphasis and dims the rest to V.DIM; note shows as blue subtext.
const hbarOption = (props, V) => {
  const data = (V.asArray(props.data) || [])
    .map((d, i) => ({ name: String(d.name ?? d.label ?? d.y ?? i), value: +(d.value ?? d.x ?? 0) || 0, color: d.color }))
    .sort((a, b) => b.value - a.value)
  const hl = V.resolveExtremes(props.highlight, data)
  const note = data.map((d) => V.highlightNote(hl, d.name)).find(Boolean)
  const active = V.hasHighlight(hl)
  const colors = V.itemColors(hl, data)
  const fmt = (v) => V.fmtNum(v, props.valueFormat)
  return {
    ...V.titleBlock(props.title, note),
    grid: { left: 8, right: 52, top: note ? (props.title ? 68 : 44) : props.title ? 50 : 14, bottom: props.valueLabel ? 34 : 16, containLabel: true },
    tooltip: { trigger: 'item', valueFormatter: fmt },
    xAxis: {
      type: 'value',
      name: props.valueLabel,
      nameLocation: 'middle',
      nameGap: 26,
      nameTextStyle: { color: V.MUTE, fontSize: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
      axisLabel: { color: V.MUTE, fontSize: 10, formatter: fmt },
    },
    yAxis: {
      type: 'category',
      data: data.map((d) => d.name),
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 11, width: 130, overflow: 'truncate', color: (p) => (active && !V.matchHighlight(hl, p) ? V.MUTE : V.INK) },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 26,
        barCategoryGap: '38%',
        itemStyle: { borderRadius: [0, 4, 4, 0] },
        data: data.map((d, i) => ({ value: d.value, itemStyle: { color: colors[i] } })),
        emphasis: { focus: 'self' },
        label: {
          show: props.showValues !== false,
          position: 'right',
          fontSize: 10,
          fontWeight: 600,
          color: (p) => (active && !V.matchHighlight(hl, p.name, p.dataIndex) ? V.DIM : V.MUTE),
          formatter: (p) => fmt(p.value),
        },
      },
    ],
  }
}

jb.vizUtils.vizComp('hbar', hbarOption, 'Horizontal bar chart for a ranked list with long labels; highlight accents a bar')

const sample = [
  { name: 'Documentation site', value: 320 },
  { name: 'Onboarding guide', value: 540 },
  { name: 'API reference', value: 210 },
  { name: 'Community forum', value: 95 },
  { name: 'Release notes', value: 160 },
]

Test('reactTest.viz.hbar', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'hbar', title: 'Page views by section', data: sample, valueFormat: 'int' },
        }),
    expectedResult: and(contains('Page views by section'), contains('Onboarding guide'), contains('540')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.hbar.highlight', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'hbar', title: 'Most visited section', data: sample, highlight: { max: true, note: 'top destination' } },
        }),
    expectedResult: and(contains('Most visited section'), contains('Onboarding guide'), contains('top destination')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.hbar.drillPanel', {
  impl: reactTest({
    testedComp: drillHost(
      {
        kind: 'hbar',
        title: 'Sections',
        data: sample,
        drill: { kind: 'hbar', title: 'Pages — {name}', sql: 'SELECT page AS name, views AS value FROM t WHERE section = {name:q}' },
      },
      [
        { name: 'Intro page', value: 3 },
        { name: 'Setup page', value: 7 },
      ],
    ),
    expectedResult: and(contains("WHERE section = 'Onboarding guide'"), contains('Pages — Onboarding guide'), contains('Setup page')),
    userActions: [delay(120), clickVizShape(), delay(200)],
  }),
})
