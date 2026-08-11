import { dsls } from '@jb6/core'
import './finance2-cube.js'
import '@wonder/bi/benchmark/bi-benchmark-dsl.js'

const {
  common: { boolean: { and } },
  bi: { QueryCase, cube: { finance2Cube }, 'query-case': { queryCase } }
} = dsls

QueryCase('finance2Bench.paymentFeeEfficiency', {
  impl: queryCase({
    sql: `select payment_channel, payment_channel_symbol, payment_method, payment_method_symbol, expected_fee_bps,
      fees, settled_volume, fee_rate_bps, round(fee_rate_bps-expected_fee_bps,1) variance_bps, txns
      group by 1,2,3,4,5 order by payment_channel, variance_bps desc`,
    cube: finance2Cube(),
    expectedResult: and('%length% == 8', '%0/fees% > 0', '%0/payment_method_symbol% != ""')
  })
})

QueryCase('finance2Bench.counterpartyQuarterFeeLeakage', {
  impl: queryCase({
    sql: `select counterparty,segment,year(date) yr,quarter(date) qtr,
      fee_leakage,fees,expected_fees,settled_volume,fee_rate_bps,txns
      group by 1,2,3,4 order by fee_leakage desc limit 50`,
    cube: finance2Cube(),
    expectedResult: and('%length% == 50', '%0/fee_leakage% > 0', '%0/qtr% >= 1')
  })
})

QueryCase('finance2Bench.counterpartyPaymentFailures', {
  impl: queryCase({
    sql: `select counterparty,payment_channel,payment_method,txns,failed_n,failed_rate,settled_volume,fees
      group by 1,2,3 order by failed_n desc,failed_rate desc limit 50`,
    cube: finance2Cube(),
    expectedResult: and('%length% == 50', '%0/failed_rate% == 100', '%0/counterparty% != ""')
  })
})
