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

// lineWidget — one or more trends over an ordered axis. `highlight` a series (by
// name) keeps it in full color and dims the rest; note shows as subtext.
const lineOption = (props, V) => {
  const series = props.series || (props.data ? [{ name: props.title || 'series', points: props.data }] : [])
  const norm = series.map((s) => ({
    name: String(s.name ?? ''),
    points: (V.asArray(s.points) || []).map((p) => [p.x ?? p.name, p.y == null && p.value == null ? null : +(p.y ?? p.value) || 0]),
  }))
  const hl = V.resolveExtremes(
    props.highlight,
    norm.map((s) => ({ name: s.name })),
  )
  const note = props.note || norm.map((s) => V.highlightNote(hl, s.name)).find(Boolean) || V.highlightNote(hl)
  const active = V.hasHighlight(hl)
  const multi = norm.length > 1
  const xType = props.xType === 'number' ? 'value' : props.xType === 'time' ? 'time' : 'category'
  const zoom = xType !== 'category'
  const cats = xType === 'category' ? norm[0]?.points.map((p) => String(p[0])) : undefined
  return {
    ...V.titleBlock(props.title, note),
    grid: { left: 58, right: 20, top: props.title ? (note ? 62 : 46) : 18, bottom: (multi ? 44 : 26) + (props.xLabel ? 20 : 0) + (zoom ? 30 : 0), containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: (v) => V.fmtNum(v, props.valueFormat), axisPointer: { type: 'line', lineStyle: { color: V.DIM } } },
    ...V.legendBlock(
      multi,
      norm.map((s) => s.name),
    ),
    ...(zoom ? { dataZoom: [{ type: 'inside' }, { type: 'slider', height: 16, bottom: multi ? 24 : 6, borderColor: V.DIM, fillerColor: 'rgba(37,99,235,0.08)' }] } : {}),
    // small category axes (top-N charts) label EVERY point — auto-thinning long names reads as missing data; rotate/truncate to fit
    xAxis: {
      type: xType,
      data: cats,
      name: props.xLabel,
      nameLocation: 'middle',
      nameGap: 24,
      nameTextStyle: { color: V.MUTE, fontSize: 11 },
      boundaryGap: false,
      axisLine: { lineStyle: { color: V.DIM } },
      axisTick: { show: false },
      axisLabel: {
        color: V.MUTE,
        fontSize: 10,
        hideOverlap: true,
        ...(cats && cats.length <= 20 ? { interval: 0, hideOverlap: false, rotate: cats.some((c) => c.length > 8) ? 28 : 0, overflow: 'truncate', width: 92 } : {}),
      },
    },
    yAxis: {
      type: 'value',
      name: props.yLabel,
      nameTextStyle: { color: V.MUTE, fontSize: 11 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
      axisLabel: { color: V.MUTE, fontSize: 10, formatter: (v) => V.fmtNum(v, props.valueFormat) },
    },
    series: norm.map((s, i) => {
      const on = !active || V.matchHighlight(hl, s.name, i)
      const color = on ? V.colorAt(i) : V.DIM
      return {
        name: s.name,
        type: 'line',
        smooth: props.smooth ?? true,
        triggerLineEvent: true,
        symbolSize: 6,
        showSymbol: on && (norm[0]?.points.length || 0) <= 12,
        data: xType === 'category' ? s.points.map((p) => p[1]) : s.points,
        lineStyle: { color, width: on ? (active ? 3 : 2.4) : 1.2, opacity: on ? 1 : 0.7 },
        itemStyle: { color },
        emphasis: { focus: 'series', lineStyle: { width: on ? 3.5 : 1.2 } },
        z: on ? 3 : 1,
      }
    }),
  }
}

jb.vizUtils.vizComp('line', lineOption, 'Line chart of one or more trends over an ordered axis; highlight emphasizes a series')

const revenue = {
  name: 'Revenue',
  points: [
    { x: 'Mon', y: 30 },
    { x: 'Tue', y: 45 },
    { x: 'Wed', y: 42 },
    { x: 'Thu', y: 68 },
    { x: 'Fri', y: 60 },
  ],
}
const cost = {
  name: 'Cost',
  points: [
    { x: 'Mon', y: 20 },
    { x: 'Tue', y: 22 },
    { x: 'Wed', y: 25 },
    { x: 'Thu', y: 30 },
    { x: 'Fri', y: 28 },
  ],
}

Test('reactTest.viz.line', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'line', title: 'Weekly trend', xType: 'category', xLabel: 'Day', series: [revenue, cost], valueFormat: '$' },
        }),
    expectedResult: and(contains('Weekly trend'), contains('Revenue'), contains('Cost'), contains('Day'), contains('Mon')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.line.highlight', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'line', title: 'Growth', xType: 'category', series: [revenue, cost], highlight: { name: 'Revenue', note: 'fastest growth' } },
        }),
    expectedResult: and(contains('Growth'), contains('fastest growth'), contains('Revenue')),
    userActions: delay(80),
  }),
})

// clicking a point drills with {name}=x category and {series}=series name
Test('reactTest.viz.line.drillPanel', {
  impl: reactTest({
    testedComp: drillHost(
      {
        kind: 'line',
        title: 'Weekly',
        xType: 'category',
        series: [revenue],
        drill: { kind: 'line', title: '{series} on {name}', sql: 'SELECT hour AS x, amount AS y FROM t WHERE day = {name:q} AND metric = {series:q}' },
      },
      [
        { x: 'H1', y: 5 },
        { x: 'H2', y: 9 },
      ],
    ),
    expectedResult: and(contains("WHERE day = 'Wed' AND metric = 'Revenue'"), contains('Revenue on Wed'), contains('H2')),
    userActions: [delay(120), clickVizShape({ shapeType: 'ec-polyline' }), delay(200)],
  }),
})
