import { dsls } from '@jb6/core'
import '@wonder/bi/benchmark/bi-benchmark-applet.js'
import './finance-benchmarks.js'

const {
  bi: {
    'query-case': {
      'finance2Bench.paymentFeeEfficiency': paymentFeeEfficiency
    },
    'query-environment': { cloud }
  },
  react: { ReactComp, 'react-comp' : { benchmarkApplet} }
} = dsls

ReactComp('finance2BenchmarkApplet', {
  impl: benchmarkApplet('Finance2 query benchmarks',
    [['paymentFeeEfficiency', paymentFeeEfficiency]], [['cloud', cloud]])
})
