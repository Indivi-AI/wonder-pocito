import { dsls } from '@jb6/core'
import './finance2-etl.js'
import './finance-benchmarks.js'
import './finance2-internals-applet.js'
import '@jb6/testing'

const {
  test: { Test, test: { dataTest } },
  common: { boolean: { equals }, data: { cubeQuery } },
  tgp: { 'ctx-enricher': { setupCube } },
  bi: { cube: { finance2Cube } }
} = dsls

Test('finance2.rowCount', {
  impl: dataTest({
    calculate: cubeQuery('select txns'),
    expectedResult: equals(100000, '%0/txns%'),
    setup: setupCube(finance2Cube()),
    timeout: 15000,
    logger: 'biLogger,colsCacheLogger'
  })
})

Test('finance2.cardMethods', {
  impl: dataTest({
    calculate: cubeQuery(`select payment_method,fee_leakage,txns where payment_channel='Card' group by 1`),
    expectedResult: equals(3, '%length%'),
    setup: setupCube(finance2Cube()),
    timeout: 15000,
    logger: 'biLogger,colsCacheLogger'
  })
})

Test('finance2.clientQuarters', {
  impl: dataTest({
    calculate: cubeQuery(`select counterparty,segment,year(date) yr,quarter(date) q,fee_leakage,settled_volume,txns
      group by 1,2,3,4 order by fee_leakage desc limit 60`),
    expectedResult: ctx => ctx.data.length >= 30,
    setup: setupCube(finance2Cube()),
    timeout: 15000,
    logger: 'biLogger,colsCacheLogger'
  })
})
