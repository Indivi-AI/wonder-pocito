import { dsls } from '@jb6/core'
import '@jb6/testing'
import './finance3-etl.js'
import './finance3-benchmarks.js'
import './finance3-17mb-benchmark.js'
import '../demo-financial-cube-v2-tests.js'

const {
  common: {
    data: { compareBenchmarks, finance3CloudBenchmarkResult, finance3RawSseFetch, cubeQuery, pipeline, sum },
    boolean: { and, equals, or }
  },
  bi: { cube: { finance3Cube }, 'query-environment': { localFs } },
  tgp: { 'ctx-enricher': { setupCube } },
  test: { Test, test: { dataTest } }
} = dsls

Test('finance3.silverProducts', {
  impl: dataTest({
    calculate: cubeQuery('select product,txns group by product order by txns desc'),
    expectedResult: and('%length%==5', equals(100000, pipeline('%txns%', sum()))),
    setup: setupCube(finance3Cube()),
    timeout: 15000,
    logger: 'biLogger,colsCacheLogger'
  })
})
Test('finance3.silverQuality', {
  impl: dataTest({
    calculate: cubeQuery('select quality_issue_n,invalid_date_n,missing_id_n'),
    expectedResult: and('%0/invalid_date_n%==68261','%0/missing_id_n%==5018'),
    setup: setupCube(finance3Cube()),
    timeout: 15000,
    logger: 'biLogger,colsCacheLogger'
  })
})
Test('finance3.silverLookups', {
  impl: dataTest({
    calculate: cubeQuery(`select customer_type,product_category,payment_channel,txns
    group by customer_type,product_category,payment_channel`),
    expectedResult: and('%length%>20','%0/customer_type%','%0/product_category%','%0/payment_channel%'),
    setup: setupCube(finance3Cube()),
    timeout: 15000,
    logger: 'biLogger,colsCacheLogger'
  })
})
Test('finance3.localFsBenchmarkTelemetry', {
  HeavyTest: true,
  impl: dataTest({
    calculate: compareBenchmarks(dsls.bi['query-case']['finance3Bench.customerPortfolio'](), [localFs()], { warmRuns: 0 }),
    expectedResult: ctx => {
      const { cold, profiling, valid } = ctx.data[0]
      return valid && cold.rows.length > 0 && [cold.queryMs, profiling.scanMs, profiling.cpuMs, profiling.sourceBytes,
        profiling.bytesScanned, profiling.rowGroupsScanned].every(value => value != null)
    },
    timeout: 120000,
    logger: 'benchmarkLogger,duckDBProfilingLogger,biLogger,colsCacheLogger,dbLogger'
  })
})
Test('finance3.cloudBenchmarkSse', {
  impl: dataTest({
    calculate: finance3CloudBenchmarkResult(),
    expectedResult: or(
      and('%ok%', '%result/cold/rows/length%==45', '%result/profiling/rangesFromBucket/requests%>0'),
      and('!%ok%', '%error/message%', '%error/stack%', '%error/cause%')
    ),
    timeout: 60000,
    logger: 'roomBigLogLogger2,benchmarkLogger,roomLogger,dbLogger,biLogger,colsCacheLogger'
  })
})
Test('finance3.rawLocalSse', {
  impl: dataTest({
    calculate: finance3RawSseFetch(),
    expectedResult: and('%status%==200', '%contentType%^=text/event-stream', '%done%', '%rows%==45', '%requests%>0'),
    timeout: 60000,
    logger: 'roomBigLogLogger2,benchmarkLogger,roomLogger,dbLogger,errorLogger'
  })
})
Test('finance3.rawStagingSse', {
  impl: dataTest({
    calculate: finance3RawSseFetch({ host: 'https://staging.indivi.ai' }),
    expectedResult: and('%status%==200', '%contentType%^=text/event-stream', '%done%', '%rows%==45', '%requests%>0'),
    timeout: 60000,
    logger: 'roomBigLogLogger2,benchmarkLogger,roomLogger,dbLogger,errorLogger,duckDBProfilingLogger'
  })
})
