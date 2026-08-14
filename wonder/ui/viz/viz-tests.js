import { dsls, ns } from '@jb6/core'
import '@jb6/testing'
import '@jb6/react/tests/react-testers.js'
import '../echart.js'
import './viz-categorical.js'
import './viz-multi-series.js'
import './viz-distributions.js'
import './viz-matrix-flow.js'

const {
  tgp: {Const},
  common: {boolean: {contains}},
  react: {ReactComp, 'react-comp': {EChart, comp}, 'ui-action': {waitForText}},
  viz: {'viz-highlight': {maximum}},
  test: {Test, test: {reactTest}}
} = dsls
const viz = ns.viz

Const('vizPieTestItems', [
  {name: 'Alice', value: 120},
  {name: 'Bob', value: 80}
])

Const('vizBarTestItems', [
  {name: 'Mon', value: 30},
  {name: 'Tuesday destination with a very long complete name', value: 55},
  {name: 'Wed', value: 42}
])

Const('vizCategories', ['Mon', 'Tue', 'Wed', 'Thu'])
Const('vizSeries', [
  {name: 'Plan', values: [40, 50, 45, 60]},
  {name: 'Actual', values: [38, 55, 42, 70]}
])
Const('vizHistogramValues', [2, 3, 3, 4, 4, 4, 5, 5, 6, 6, 7, 8, 9, 12, 14, 4, 5, 5, 6, 7])
Const('vizBoxplotGroups', [
  {name: 'US', values: [20, 22, 25, 30, 40, 28, 26]},
  {name: 'EU', values: [30, 35, 40, 45, 60, 38]},
  {name: 'APAC', values: [50, 60, 70, 80, 120, 65]}
])
Const('vizWaterfallSteps', [
  {name: 'Start', total: true, value: 100},
  {name: 'Sales', value: 60},
  {name: 'Returns', value: -25},
  {name: 'Fees', value: -15},
  {name: 'Bonus', value: 40},
  {name: 'End', total: true}
])
Const('vizHeatmapCells', [
  {x: 'Mon', y: 'AM', value: 12}, {x: 'Tue', y: 'AM', value: 48}, {x: 'Wed', y: 'AM', value: 32},
  {x: 'Mon', y: 'PM', value: 67}, {x: 'Tue', y: 'PM', value: 91}, {x: 'Wed', y: 'PM', value: 54}
])

ReactComp('vizTest.catalog', {
  params: [
    {id: 'charts', type: 'react-comp<react>[]'}
  ],
  impl: comp({
    hFunc: (ctx, {react: {h}}, {charts}) => () =>
      h('div:viz-catalog', {style: {display: 'flex', flexFlow: 'row wrap', gap: '16px'}},
        charts.map(Chart => h(Chart)))
  })
})

const vizTest = ns.vizTest

Test('reactTest.echart.pie', {
  impl: reactTest(EChart(viz.pie('%$vizPieTestItems%')), contains('Alice'), {
    userActions: waitForText('Alice')
  })
})

Test('reactTest.echart.bar', {
  impl: reactTest({
    testedComp: EChart(viz.bar('%$vizBarTestItems%', { title: 'Sessions', highlight: maximum({ note: 'peak' }) })),
    expectedResult: contains('peak'),
    userActions: waitForText('peak')
  })
})

Test('reactTest.echart.horizontalBar', {
  impl: reactTest({
    testedComp: EChart(viz.horizontalBar('%$vizBarTestItems%', { title: 'Destinations' })),
    expectedResult: contains('Destinations'),
    userActions: waitForText('Destinations')
  })
})

Test('reactTest.echart.catalog', {
  impl: reactTest({
    testedComp: vizTest.catalog(
      EChart(viz.pie('%$vizPieTestItems%', { title: 'Messages by sender' })),
      EChart(viz.bar('%$vizBarTestItems%', { title: 'Sessions', highlight: maximum({ note: 'peak' }) })),
      EChart(viz.horizontalBar('%$vizBarTestItems%', { title: 'Destinations' })),
      EChart(viz.groupedBar('%$vizCategories%', '%$vizSeries%', { title: 'Plan vs Actual' })),
      EChart(viz.stackedBar('%$vizCategories%', '%$vizSeries%', { title: 'Traffic mix' })),
      EChart(viz.histogram('%$vizHistogramValues%', { title: 'Session length', bins: 6 })),
      EChart(viz.boxplot('%$vizBoxplotGroups%', { title: 'Latency by region' })),
      EChart(viz.waterfall('%$vizWaterfallSteps%', { title: 'Profit bridge' })),
      EChart(viz.heatmap(['Mon', 'Tue', 'Wed'], ['AM', 'PM'], '%$vizHeatmapCells%', { title: 'Activity' }))
    ),
    expectedResult: contains('Destinations'),
    userActions: waitForText('Destinations')
  })
})

Test('reactTest.echart.histogram', {
  impl: reactTest(EChart(viz.histogram('%$vizHistogramValues%', {title: 'Session length', bins: 6})), contains('Session length'), {
    userActions: waitForText('Session length')
  })
})

Test('reactTest.echart.boxplot', {
  impl: reactTest({
    testedComp: EChart(viz.boxplot('%$vizBoxplotGroups%', { title: 'Latency by region' })),
    expectedResult: contains('Latency by region'),
    userActions: waitForText('Latency by region')
  })
})

Test('reactTest.echart.waterfall', {
  impl: reactTest({
    testedComp: EChart(viz.waterfall('%$vizWaterfallSteps%', { title: 'Profit bridge' })),
    expectedResult: contains('Profit bridge'),
    userActions: waitForText('Profit bridge')
  })
})

Test('reactTest.echart.heatmap', {
  impl: reactTest(EChart(viz.heatmap(['Mon', 'Tue', 'Wed'], ['AM', 'PM'], '%$vizHeatmapCells%', {title: 'Activity'})), contains('91'), {
    userActions: waitForText('91')
  })
})

Test('reactTest.echart.groupedBar', {
  impl: reactTest({
    testedComp: EChart(viz.groupedBar('%$vizCategories%', '%$vizSeries%', { title: 'Plan vs Actual' })),
    expectedResult: contains('Actual'),
    userActions: waitForText('Actual')
  })
})

Test('reactTest.echart.stackedBar', {
  impl: reactTest({
    testedComp: EChart(viz.stackedBar('%$vizCategories%', '%$vizSeries%', { title: 'Traffic mix' })),
    expectedResult: contains('130'),
    userActions: waitForText('130')
  })
})
