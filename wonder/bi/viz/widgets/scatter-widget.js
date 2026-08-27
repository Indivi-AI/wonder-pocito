import { dsls, jb, coreUtils } from '@jb6/core'
import '@jb6/common'
import '@jb6/testing'
import '@jb6/react/tests/react-testers.js'
import '../viz-core.js'
import './table-widget.js' // drill side-plot target in tests
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

// scatterWidget — relationship between two numeric variables. `highlight` a point
// (by name) keeps it full-color and larger while dimming the rest; note as subtext.
const scatterOption = (props, V) => {
  const pts = (V.asArray(props.data) || []).map((d, i) => ({ name: String(d.name ?? i), x: +d.x || 0, y: +d.y || 0 }))
  const hl = V.resolveExtremes(
    props.highlight,
    pts.map((p) => ({ name: p.name, value: p.y })),
  )
  const note = pts.map((p) => V.highlightNote(hl, p.name)).find(Boolean) || V.highlightNote(hl)
  const active = V.hasHighlight(hl)
  const xFormat = props.xFormat || props.valueFormat,
    yFormat = props.yFormat || props.valueFormat
  const axis = (name, format) => ({
    type: 'value',
    name,
    nameLocation: 'middle',
    nameGap: 26,
    nameTextStyle: { color: V.MUTE, fontSize: 11 },
    scale: true,
    axisLabel: { color: V.MUTE, fontSize: 10, formatter: (v) => V.fmtNum(v, format) },
    splitLine: { lineStyle: { color: '#f1f5f9' } },
  })
  return {
    ...V.titleBlock(props.title, note),
    grid: { left: 56, right: 18, top: note ? (props.title ? 68 : 44) : props.title ? 50 : 18, bottom: 52 },
    tooltip: {
      trigger: 'item',
      formatter: (p) => `${pts[p.dataIndex].name}<br/>${props.xLabel || 'x'}:
      ${V.fmtNum(p.value[0], xFormat)}<br/>${props.yLabel || 'y'}: ${V.fmtNum(p.value[1], yFormat)}`,
    },
    xAxis: axis(props.xLabel, xFormat),
    yAxis: axis(props.yLabel, yFormat),
    dataZoom: [
      { type: 'inside', xAxisIndex: 0 },
      { type: 'inside', yAxisIndex: 0 },
    ],
    series: [
      {
        type: 'scatter',
        data: pts.map((p, i) => {
          const on = !active || V.matchHighlight(hl, p.name, i)
          return {
            value: [p.x, p.y],
            symbolSize: on ? 18 : 11,
            itemStyle: { color: on ? V.colorAt(0) : V.DIM, opacity: on ? 0.95 : 0.5, borderColor: '#fff', borderWidth: on ? 1 : 0 },
          }
        }),
        emphasis: { focus: 'self', scale: 1.4, itemStyle: { borderColor: V.INK, borderWidth: 1.5 } },
      },
    ],
  }
}

const scatterClickInfo = (p, props) => {
  const d = (jb.vizUtils.asArray(props.data) || [])[p.dataIndex] || {}
  return { name: String(d.name ?? p.dataIndex), x: d.x, y: d.y }
}

jb.vizUtils.vizComp('scatter', scatterOption, 'Scatter plot of two numeric variables; highlight emphasizes a point and dims the rest', scatterClickInfo)

const sample = [
  { name: 'A', x: 5, y: 12 },
  { name: 'B', x: 18, y: 30 },
  { name: 'C', x: 33, y: 24 },
  { name: 'D', x: 47, y: 55 },
  { name: 'E', x: 60, y: 41 },
]

Test('reactTest.viz.scatter', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'scatter', title: 'Spend vs revenue', data: sample, xLabel: 'spend', yLabel: 'revenue', valueFormat: 'int' },
        }),
    expectedResult: and(contains('Spend vs revenue'), contains('spend'), contains('revenue'), contains('60')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.scatter.highlight', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'scatter', title: 'Outlier', data: sample, xLabel: 'spend', yLabel: 'revenue', highlight: { name: 'D', note: 'top performer' } },
        }),
    expectedResult: and(contains('Outlier'), contains('top performer')),
    userActions: delay(80),
  }),
})

// RTL host regression: the widget container forces direction:ltr so ECharts text
// geometry stays valid inside Hebrew (dir=rtl) applets; per-axis formats apply.
Test('reactTest.viz.scatter.rtlHost', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { h, hh } }) =>
      () =>
        h(
          'div',
          { dir: 'rtl', lang: 'he' },
          hh(ctx, dsls.react['react-comp'].VizWidget, {
            spec: {
              kind: 'scatter',
              title: 'מחזור מול מרווח לפי סניף',
              xLabel: 'מחזור (₪)',
              yLabel: 'מרווח (%)',
              xFormat: '₪',
              yFormat: '%',
              data: [
                { x: 222758042, y: 32.4, name: 'גני תקווה' },
                { x: 54786821, y: 26.8, name: 'בר כוכבא פתח תקווה' },
              ],
            },
          }),
        ),
    expectedResult: and(contains('direction: ltr'), contains('מחזור מול מרווח לפי סניף'), contains('מרווח (%)'), contains('M ₪')),
    userActions: delay(150),
  }),
})

Test('reactTest.viz.scatter.drillPanel', {
  impl: reactTest({
    testedComp: drillHost(
      {
        kind: 'scatter',
        title: 'Spend vs revenue',
        data: sample,
        drill: { kind: 'table', title: 'Campaigns of {name}', sql: 'SELECT campaign, spend FROM t WHERE account = {name:q}' },
      },
      [{ campaign: 'Summer sale', spend: 77 }],
    ),
    expectedResult: and(contains("WHERE account = '"), contains('Campaigns of '), contains('Summer sale'), contains('77')),
    userActions: [delay(120), clickVizShape(), delay(200)],
  }),
})
