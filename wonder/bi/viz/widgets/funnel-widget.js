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

// funnelWidget — ordered stages that shrink (sessions→clicks→converters); labels show
// name, value and % of the first stage. `highlight` accents one stage and dims the rest.
const funnelOption = (props, V) => {
  const data = (V.asArray(props.data) || []).map((d, i) => ({ name: String(d.name ?? d.label ?? i), value: +(d.value ?? d.y ?? 0) || 0, color: d.color }))
  const top = data[0]?.value || 1
  const hl = V.resolveExtremes(props.highlight, data)
  const note = data.map((d) => V.highlightNote(hl, d.name)).find(Boolean)
  const active = V.hasHighlight(hl)
  const colors = V.itemColors(hl, data)
  const on = (i) => !active || colors[i] !== V.DIM
  const pct = (v) => ((v / top) * 100).toFixed(v / top >= 0.1 ? 0 : 1) + '%'
  return {
    ...V.titleBlock(props.title, note),
    tooltip: { trigger: 'item', valueFormatter: (v) => `${V.fmtNum(v, props.valueFormat)} (${pct(v)})`, textStyle: { fontSize: 12 } },
    series: [
      {
        type: 'funnel',
        sort: 'descending',
        top: props.title ? (note ? 66 : 50) : 20,
        bottom: 20,
        left: 8,
        right: 96,
        gap: 6,
        min: 0,
        max: top,
        funnelAlign: 'center',
        minSize: '18%',
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        emphasis: { label: { fontSize: 13 }, itemStyle: { shadowBlur: 10, shadowColor: 'rgba(37,99,235,0.3)' } },
        label: { position: 'inside', color: '#fff', fontSize: 11, formatter: (p) => `${V.fmtNum(p.value, props.valueFormat)} · ${pct(p.value)}` },
        labelLine: { length: 24, lineStyle: { color: V.MUTE } },
        data: data.map((d, i) => ({
          name: d.name,
          value: d.value,
          itemStyle: { color: colors[i], opacity: on(i) ? 1 : 0.85 },
          label: { fontWeight: on(i) ? 700 : 400 },
          labelLine: { show: true },
          emphasis: { label: { position: 'right', color: V.INK, formatter: `{b}: ${V.fmtNum(d.value, props.valueFormat)} (${pct(d.value)})` } },
        })),
      },
    ],
    graphic: data.map((d, i) => ({
      type: 'text',
      z: 20,
      right: 8,
      left: undefined,
      style: {
        text: d.name,
        fill: on(i) ? V.INK : V.MUTE,
        font: `${on(i) ? 600 : 400} 11px ui-sans-serif, system-ui, sans-serif`,
        textAlign: 'right',
        textVerticalAlign: 'middle',
      },
      top: (props.title ? (note ? 66 : 50) : 20) + (((props.height || 320) - (props.title ? (note ? 66 : 50) : 20) - 20) * (i + 0.5)) / data.length,
    })),
  }
}

jb.vizUtils.vizComp('funnel', funnelOption, 'Funnel of ordered shrinking stages with % of the first stage; highlight accents a stage')

const sample = [
  { name: 'Sessions', value: 1000 },
  { name: 'Clicks', value: 420 },
  { name: 'Leads', value: 180 },
  { name: 'Converters', value: 64 },
]

Test('reactTest.viz.funnel', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'funnel', title: 'Acquisition funnel', data: sample, valueFormat: 'int' },
        }),
    expectedResult: and(contains('Acquisition funnel'), contains('Sessions')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.funnel.highlight', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'funnel', title: 'Drop-off', data: sample, highlight: { name: 'Clicks', note: 'biggest drop here' } },
        }),
    expectedResult: contains('biggest drop here'),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.funnel.drillPanel', {
  impl: reactTest({
    testedComp: drillHost(
      {
        kind: 'funnel',
        title: 'Acquisition funnel',
        data: sample,
        drill: { kind: 'funnel', title: 'Inside {name}', sql: 'SELECT step AS name, cnt AS value FROM t WHERE stage = {name:q}' },
      },
      [
        { name: 'Step A', value: 50 },
        { name: 'Step B', value: 20 },
      ],
    ),
    expectedResult: and(contains("WHERE stage = '"), contains('Inside '), contains('Step B')),
    userActions: [delay(120), clickVizShape({ shapeType: 'polygon' }), delay(200)],
  }),
})
