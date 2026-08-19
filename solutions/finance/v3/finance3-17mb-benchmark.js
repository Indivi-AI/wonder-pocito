import { dsls } from '@jb6/core'
import '@wonder/bi/metrics.js'
import '@wonder/bi/benchmark/bi-benchmark-dsl.js'
import '@wonder/bi/benchmark/bi-benchmark-applet.js'

const {
  bi: {
    Cube, QueryCase, cube: { cube }, 'silver-builder': { parquetSource }, dimension: { dimension }, metric: { metric, ratio },
    'query-case': { queryCase }, 'query-environment': { wasm }
  },
  react: { ReactComp, 'react-comp': { biBenchmarkPerformance } }
} = dsls

const finance3Cube17MB = Cube('finance3Cube17MB', {
  impl: cube({
    source: parquetSource('silver/transactions-17mb.parquet', { name: 'transactions17MB' }),
    wUrlBase: 'signedRoom://finance3/usersRO', cacheStrategy: 'colsCache',
    dimensions: [
      dimension('date', { type: 'timestamp' }), dimension('customer_id'), dimension('product'), dimension('payment_method'),
      dimension('status'), dimension('has_quality_issue', { type: 'boolean' })
    ],
    metrics: [
      metric('txns', 'count', { unit: 'int' }), metric('customers', 'distinctCount(customer_id)', { unit: 'int' }),
      metric('gross_value', 'round(sum(case when quantity>0 and price>0 then transaction_value end),2)', { unit: '$' }),
      metric('completed_value', "round(sum(case when status='completed' and quantity>0 and price>0 then transaction_value end),2)", { unit: '$' }),
      metric('quality_issue_n', 'sum(has_quality_issue or quantity<=0 or price<=0)', { unit: 'int' }),
      metric('completed_n', "sum(status='completed')", { unit: 'int' }),
      ratio('completion_rate', 'completed_n/txns'), ratio('quality_issue_rate', 'quality_issue_n/txns')
    ],
    limits: ['5.7 million scaled Finance3 fact rows in a 16.96 MB Parquet; benchmark data, not independent transactions']
  })
})

const summary = QueryCase('finance3Bench17MB.summary', {
  impl: queryCase({
    sql: 'select txns,customers,gross_value,completed_value,completion_rate,quality_issue_rate', cube: finance3Cube17MB(),
    expectedResult: ctx => ctx.data[0]?.txns === 5700000
  })
})
const productStatus = QueryCase('finance3Bench17MB.productStatus', {
  impl: queryCase({
    sql: 'select product,status,txns,completed_value group by product,status order by completed_value desc', cube: finance3Cube17MB(),
    expectedResult: ctx => ctx.data.length === 20
  })
})
const recentTrend = QueryCase('finance3Bench17MB.recentTrend', {
  impl: queryCase({
    sql: "select date,txns,completed_value where date between date '2025-05-31' and date '2025-06-30' group by date order by date",
    cube: finance3Cube17MB(), expectedResult: ctx => ctx.data.length === 31
  })
})

ReactComp('finance3Benchmark17MBApplet', {
  impl: biBenchmarkPerformance({
    title: 'Finance3 17 MB WASM benchmark', cases: [['summary', summary], ['productStatus', productStatus], ['recentTrend', recentTrend]],
    environmentProfiles: [['wasm', wasm]], warmRuns: 1
  })
})
