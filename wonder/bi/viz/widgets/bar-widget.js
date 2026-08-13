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

// barWidget — vertical columns comparing values across categories. `highlight`
// accents one/several bars (or {max}/{min}) and dims the rest; note shows as subtext.
const barOption = (props, V) => {
  const data = (V.asArray(props.data) || []).map((d, i) => ({ name: String(d.name ?? d.label ?? d.x ?? i), value: +(d.value ?? d.y ?? 0) || 0, color: d.color }))
  const hl = V.resolveExtremes(props.highlight, data)
  const note = data.map((d) => V.highlightNote(hl, d.name)).find(Boolean)
  const active = V.hasHighlight(hl)
  const colors = V.itemColors(hl, data)
  const fmt = (v) => V.fmtNum(v, props.valueFormat)
  return {
    ...V.titleBlock(props.title, note),
    grid: { left: 8, right: 16, top: props.title ? (note ? 62 : 46) : 20, bottom: props.xLabel ? 44 : 30, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: fmt, textStyle: { fontSize: 12 } },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.name),
      name: props.xLabel,
      nameLocation: 'middle',
      nameGap: 30,
      nameTextStyle: { color: V.MUTE, fontSize: 11 },
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
        type: 'bar',
        barMaxWidth: 46,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        emphasis: { focus: 'series', itemStyle: { shadowBlur: 8, shadowColor: 'rgba(37,99,235,0.25)' } },
        data: data.map((d, i) => ({ value: d.value, itemStyle: { color: colors[i] } })),
        label: {
          show: props.showValues !== false,
          position: 'top',
          fontSize: 11,
          formatter: (p) => fmt(p.value),
          color: (p) => (active && colors[p.dataIndex] !== V.DIM ? V.INK : V.MUTE),
        },
      },
    ],
  }
}

jb.vizUtils.vizComp('bar', barOption, 'Vertical bar/column chart comparing values across categories; highlight accents bars')

const sample = [
  { name: 'Mon', value: 30 },
  { name: 'Tue', value: 55 },
  { name: 'Wed', value: 42 },
  { name: 'Thu', value: 70 },
  { name: 'Fri', value: 48 },
]

Test('reactTest.viz.bar', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'bar', title: 'Sessions by day', data: sample, yLabel: 'sessions', valueFormat: 'int' },
        }),
    expectedResult: and(contains('Sessions by day'), contains('Thu'), contains('70')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.bar.highlight', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'bar', title: 'Peak day', data: sample, highlight: { max: true, note: 'busiest day' } },
        }),
    expectedResult: and(contains('Peak day'), contains('busiest day')),
    userActions: delay(80),
  }),
})

// clicking a bar fires onEvent with the clicked category name (drill plumbing, §6.3)
Test('reactTest.viz.bar.drill', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { h, hh, useState } }) =>
      () => {
        const [clicked, setClicked] = useState('')
        return h(
          'div',
          {},
          h('div', {}, 'drilled:' + clicked),
          hh(ctx, dsls.react['react-comp'].VizWidget, { spec: { kind: 'bar', title: 'Days', data: sample }, onEvent: (e) => setClicked(String(e.name)) }),
        )
      },
    expectedResult: contains('drilled:Mon'),
    userActions: [delay(120), clickVizShape(), delay(60)],
  }),
})

// clicking a bar with spec.drill runs the filled SQL and opens the side plot
Test('reactTest.viz.bar.drillPanel', {
  impl: reactTest({
    testedComp: drillHost(
      { kind: 'bar', title: 'Days', data: sample, drill: { kind: 'bar', title: 'Weeks — {name}', sql: 'SELECT week AS name, amount AS value FROM t WHERE day = {name:q}' } },
      [
        { name: 'W1', value: 5 },
        { name: 'W2', value: 9 },
      ],
    ),
    expectedResult: and(contains("drillSql:SELECT week AS name, amount AS value FROM t WHERE day = 'Mon'"), contains('Weeks — Mon'), contains('W2')),
    userActions: [delay(120), clickVizShape(), delay(200)],
  }),
})
