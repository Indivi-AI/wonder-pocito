import { dsls } from '@jb6/core'
import '@jb6/testing'
import '@jb6/testing/test-data.js'
import '@jb6/react/tests/react-testers.js'
import '../echart-dsl.js'
import '../echart.js'

const {
  tgp: {Const, any: {typeAdapter}},
  echart: {
    EChartsOption: {option}, SeriesOption: {pie, bar, line, scatter, heatmap, boxplot, funnel, gauge, treemap, radar},
    AxisOption: {xAxis, yAxis}, AxisLabelOption: {axisLabel}, LabelOption: {label}, DatasetTransform: {boundIQR, bin},
    DatasetOption: {dataset}, EncodeOption: {encode}
  },
  common: {boolean: {contains}},
  react: {'react-comp': {EChart}},
  test: {Test, test: {dataTest, reactTest}}
} = dsls

Const('echartTestData', [{name: 'A', value: 3}])
Const('echartBinTestData', [{duration: 2}, {duration: 3}, {duration: 3}, {duration: 9}])

Test('echartTest.optionContract', {
  impl: dataTest({
    calculate: typeAdapter('echarts-option<echart>', option({
      series: [
        pie({ Data: '%$echartTestData%', label: label({ formatter: '%name%:%value%' }) }),
        bar({ Data: '%$echartTestData%' }),
        line({ Data: '%$echartTestData%' }),
        scatter({ Data: '%$echartTestData%' }),
        heatmap({ Data: '%$echartTestData%' }),
        boxplot({ Data: '%$echartTestData%' }),
        funnel({ Data: '%$echartTestData%' }),
        gauge({ Data: '%$echartTestData%' }),
        treemap({ Data: '%$echartTestData%' }),
        radar({ Data: '%$echartTestData%' })
      ],
      xAxis: xAxis({ type: 'category', Data: ['A'], axisLabel: axisLabel({ formatter: '[%%]' }) })
    })),
    expectedResult: ({data}) => data.series.map(({type}) => type).join(',') == 'pie,bar,line,scatter,heatmap,boxplot,funnel,gauge,treemap,radar'
      && data.series.every(series => series.data[0].value == 3) && data.series[0].label.formatter({name: 'A', value: 3}) == 'A:3'
      && data.xAxis.data[0] == 'A' && data.xAxis.axisLabel.formatter('A') == '[A]'
  })
})

Test('echartTest.datasetTransformContract', {
  impl: dataTest({
    calculate: typeAdapter('dataset-transform<echart>', bin({ dimension: 'duration', maxBins: 12 })),
    expectedResult: ({data}) => data.type == 'wonder:bin' && data.config.dimension == 'duration' && data.config.maxBins == 12
      && typeof data.transform == 'function'
  })
})

Test('echartTest.boundIQRContract', {
  impl: dataTest({
    calculate: typeAdapter('dataset-transform<echart>', boundIQR({ factor: 2 })),
    expectedResult: ({data}) => data.type == 'boxplot' && data.config.boundIQR == 2 && data.transform == null
  })
})

Test('reactTest.echart.binTransform', {
  impl: reactTest({
    testedComp: EChart(option({
      series: bar({ datasetIndex: 1, encode: encode({ x: 'bin', y: 'count' }) }),
      color: ['#2563eb'],
      xAxis: xAxis({ type: 'category' }),
      yAxis: yAxis({ type: 'value' }),
      dataset: [
        dataset({ source: '%$echartBinTestData%' }),
        dataset({ fromDatasetIndex: 0, transform: bin({ dimension: 'duration', maxBins: 3 }) })
      ]
    })),
    expectedResult: contains('#2563eb')
  })
})
