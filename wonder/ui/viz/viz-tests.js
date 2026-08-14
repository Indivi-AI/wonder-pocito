import { dsls, ns } from '@jb6/core'
import '@jb6/testing'
import '@jb6/react/tests/react-testers.js'
import '../echart.js'
import './viz-categorical.js'
import './viz-multi-series.js'
import './viz-distributions.js'
import './viz-matrix-flow.js'
import './viz-trends.js'
import './viz-points.js'
import './viz-dom.js'
import './viz-shapes.js'

const {
  tgp: {Const},
  common: {boolean: {contains, and}},
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
Const('vizTrendSeries', [
  {name: 'Organic', points: [{x: 'Jan', y: 20}, {x: 'February with a long label', y: 35}, {x: 'Mar', y: 30}]},
  {name: 'Paid', points: [{x: 'Jan', y: 12}, {x: 'February with a long label', y: 24}, {x: 'Mar', y: 42}]}
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
Const('vizScatterPoints', [
  {name: 'Alpha', x: 12, y: 28}, {name: 'Beta', x: 24, y: 46}, {name: 'Gamma', x: 38, y: 32}
])
Const('vizBubblePoints', [
  {name: 'Alpha', x: 12, y: 28, size: 18}, {name: 'Beta', x: 24, y: 46, size: 42}, {name: 'Gamma', x: 38, y: 32, size: 27}
])
Const('vizKpiItems', [
  {label: 'Revenue', value: 128400, delta: 12.5, unit: 'USD'}, {label: 'Orders', value: 842, delta: -3.2}
])
Const('vizTableColumns', [
  {key: 'region', label: 'Region'}, {key: 'sales', label: 'Sales', format: 'compact'}
])
Const('vizTableRows', [
  {region: 'North', sales: 128400}, {region: 'South', sales: 96200}, {region: 'West', sales: 113700},
  {region: 'East', sales: 87500}, {region: 'Central', sales: 104300}, {region: 'International', sales: 141200}
])
Const('vizRadarIndicators', [{name: 'Speed', max: 100}, {name: 'Quality', max: 100}, {name: 'Reach', max: 100}, {name: 'Value', max: 100}])
Const('vizRadarSeries', [{name: 'Current', values: [82, 74, 66, 91]}, {name: 'Previous', values: [68, 79, 58, 76]}])
Const('vizFunnelStages', [{name: 'Visits', value: 1200}, {name: 'Leads', value: 620}, {name: 'Trials', value: 280}, {name: 'Customers', value: 96}])
Const('vizTreemapItems', [{name: 'Enterprise', value: 48}, {name: 'SMB', value: 31}, {name: 'Consumer', value: 15}, {name: 'Other', value: 6}])
Const('vizBulletItems', [
  {name: 'Revenue', value: 82, target: 90, ranges: [55, 75, 100]}, {name: 'Margin', value: 68, target: 72, ranges: [45, 65, 85]}
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
      EChart(viz.heatmap(['Mon','Tue','Wed'], ['AM','PM'], {
        cells: '%$vizHeatmapCells%',
        title: 'Activity'
      })),
      EChart(viz.gauge(72, { title: 'Goal', target: 80 })),
      EChart(viz.line('%$vizTrendSeries%', { title: 'Traffic trend' })),
      EChart(viz.area('%$vizTrendSeries%', { title: 'Traffic volume', stacked: true })),
      EChart(viz.scatter('%$vizScatterPoints%', { title: 'Conversion', xLabel: 'Visits', yLabel: 'Orders' })),
      EChart(viz.bubble('%$vizBubblePoints%', {
        title: 'Market reach',
        xLabel: 'Growth',
        yLabel: 'Margin',
        sizeLabel: 'Revenue'
      })),
      EChart(viz.radar('%$vizRadarIndicators%', '%$vizRadarSeries%', { title: 'Capability profile' })),
      EChart(viz.funnel('%$vizFunnelStages%', { title: 'Conversion funnel' })),
      EChart(viz.treemap('%$vizTreemapItems%', { title: 'Customer mix' })),
      EChart(viz.bullet('%$vizBulletItems%', { title: 'Performance vs target' })),
      viz.kpi('%$vizKpiItems%', { title: 'Overview' }),
      viz.table('%$vizTableColumns%', '%$vizTableRows%', {
        title: 'Regional sales',
        highlight: {max: true, note: 'Top region'}
      })
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

Test('reactTest.echart.gauge', {
  impl: reactTest(EChart(viz.gauge(72, {title: 'Goal', target: 80})), and(contains('72'), contains('target 80')), {
    userActions: waitForText('target 80')
  })
})

Test('reactTest.echart.line', {
  impl: reactTest(EChart(viz.line('%$vizTrendSeries%', {title: 'Traffic trend'})), contains('Organic'), {
    userActions: waitForText('Organic')
  })
})

Test('reactTest.echart.area', {
  impl: reactTest(EChart(viz.area('%$vizTrendSeries%', {title: 'Traffic volume', stacked: true})), contains('Paid'), {
    userActions: waitForText('Paid')
  })
})
