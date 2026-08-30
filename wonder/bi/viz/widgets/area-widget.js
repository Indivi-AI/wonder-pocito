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

// areaWidget — filled trend(s) over an ordered axis. `stacked` composes magnitude;
// `highlight` a series keeps it solid+gradient and dims the rest; note shows as subtext.
const areaOption = (props, V) => {
  const series = props.series || (props.data ? [{ name: props.title || 'series', points: props.data }] : [])
  const norm = series.map((s) => ({ name: String(s.name ?? ''), points: (V.asArray(s.points) || []).map((p) => [p.x ?? p.name, +(p.y ?? p.value) || 0]) }))
  const hl = V.resolveExtremes(
    props.highlight,
    norm.map((s) => ({ name: s.name })),
  )
  const note = norm.map((s) => V.highlightNote(hl, s.name)).find(Boolean) || V.highlightNote(hl)
  const active = V.hasHighlight(hl)
  const xType = props.xType === 'number' ? 'value' : props.xType === 'time' ? 'time' : 'category'
  const cats = xType === 'category' ? norm[0]?.points.map((p) => String(p[0])) : undefined
  const multi = norm.length > 1
  const rotate = cats && cats.length <= 20 && cats.some((c) => c.length > 8) ? 28 : 0 // long top-N names tilt to fit (grid bottom grows to hold them)
  const fade = (c, a) => ({
    type: 'linear',
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: c + a },
      { offset: 1, color: c + '05' },
    ],
  })
  return {
    ...V.titleBlock(props.title, note),
    grid: { left: 52, right: 16, top: props.title ? 50 : 18, bottom: (multi ? 40 : 30) + (rotate ? 34 : 0), containLabel: false },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v) => V.fmtNum(v, props.valueFormat),
      textStyle: { fontSize: 12, color: V.INK },
      axisPointer: { type: 'line', lineStyle: { color: V.DIM } },
    },
    ...V.legendBlock(
      multi,
      norm.map((s) => s.name),
    ),
    // small category axes (top-N charts) label EVERY point — auto-thinning long names reads as missing data; rotate/truncate to fit
    xAxis: {
      type: xType,
      data: cats,
      name: props.xLabel,
      nameLocation: 'middle',
      nameGap: 26,
      boundaryGap: false,
      axisLine: { lineStyle: { color: V.DIM } },
      axisTick: { show: false },
      axisLabel: {
        color: V.MUTE,
        fontSize: 10,
        hideOverlap: true,
        ...(cats && cats.length <= 20 ? { interval: 0, hideOverlap: false, rotate, overflow: 'truncate', width: 92 } : {}),
      },
    },
    yAxis: {
      type: 'value',
      name: props.yLabel,
      splitLine: { lineStyle: { color: '#f1f5f9' } },
      axisLabel: { color: V.MUTE, fontSize: 10, formatter: (v) => V.fmtNum(v, props.valueFormat) },
    },
    series: norm.map((s, i) => {
      const on = !active || V.matchHighlight(hl, s.name, i)
      const color = on ? V.colorAt(i) : V.DIM
      const fill = props.stacked ? { color, opacity: on ? 0.55 : 0.15 } : { color: fade(color, on ? '66' : '1f') }
      return {
        name: s.name,
        type: 'line',
        smooth: true,
        triggerLineEvent: true,
        showSymbol: on && !multi ? false : on && active,
        symbolSize: 5,
        stack: props.stacked ? 'total' : undefined,
        data: xType === 'category' ? s.points.map((p) => p[1]) : s.points,
        lineStyle: { color, width: on ? 2.5 : 1 },
        itemStyle: { color },
        areaStyle: fill,
        emphasis: { focus: 'series' },
        z: on ? 3 : 1,
      }
    }),
  }
}

jb.vizUtils.vizComp('area', areaOption, 'Filled area chart of one or more trends; highlight emphasizes a series')

const free = {
  name: 'Free',
  points: [
    { x: 'W1', y: 10 },
    { x: 'W2', y: 20 },
    { x: 'W3', y: 35 },
    { x: 'W4', y: 55 },
    { x: 'W5', y: 80 },
  ],
}
const pro = {
  name: 'Pro',
  points: [
    { x: 'W1', y: 5 },
    { x: 'W2', y: 8 },
    { x: 'W3', y: 14 },
    { x: 'W4', y: 22 },
    { x: 'W5', y: 33 },
  ],
}

Test('reactTest.viz.area', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'area', title: 'Cumulative signups', xType: 'category', stacked: true, series: [free, pro], valueFormat: 'int' },
        }),
    expectedResult: and(contains('Cumulative signups'), contains('Free'), contains('Pro'), contains('W5')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.area.highlight', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'area', title: 'Growth mix', xType: 'category', series: [free, pro], highlight: { name: 'Pro', note: 'accelerating' } },
        }),
    expectedResult: and(contains('Growth mix'), contains('Pro'), contains('accelerating')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.area.drillPanel', {
  impl: reactTest({
    testedComp: drillHost(
      {
        kind: 'area',
        title: 'Signups',
        xType: 'category',
        series: [free],
        drill: { kind: 'area', title: 'Daily — {name}', sql: 'SELECT day AS x, signups AS y FROM t WHERE plan = {name:q}' },
      },
      [
        { x: 'D1', y: 2 },
        { x: 'D2', y: 4 },
      ],
    ),
    expectedResult: and(contains("WHERE plan = 'Free'"), contains('Daily — Free'), contains('D2')),
    userActions: [delay(120), clickVizShape({ shapeType: 'ec-polyline' }), delay(200)],
  }),
})
