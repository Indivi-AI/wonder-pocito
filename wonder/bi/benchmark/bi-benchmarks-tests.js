import { dsls } from '@jb6/core'
import '@jb6/testing'
import '@jb6/lang-service/src/tgp-snippet.js'
import '@jb6/core/misc/jb-remote-via-cli.js'
import './bi-benchmarks.js'
import '../large-scan-cache-strategies.js'

const {
  tgp: { Component, 'ctx-enricher': { Var } },
  common: { data: { compareBenchmarks, parseSql, pickPlan }, boolean: { and, equals } },
  test: { Test, test: { dataTest } },
  bi: { 'query-environment': { cloud, localFs } }
} = dsls

const planFamilyBench = Component('planFamilyBench', {
  type: 'test<test>',
  params: [{ id: 'sql', as: 'string', mandatory: true }, { id: 'family', as: 'string', mandatory: true }],
  impl: dataTest({
    vars: Var('compiledSqlAst', parseSql('%$sql%')),
    calculate: pickPlan(),
    expectedResult: equals('%$family%', '%family%'),
    timeout: 8000,
    logger: 'biLogger'
  })
})

Test('biBench.plan.fold.bareCount', { impl: planFamilyBench('SELECT COUNT(*) FROM hits', 'fold') })
Test('biBench.plan.fold.topK', {
  impl: planFamilyBench("SELECT SearchPhrase, COUNT(*) c FROM hits GROUP BY SearchPhrase ORDER BY c DESC LIMIT 10", 'fold')
})
Test('biBench.plan.sketchFold.distinct', {
  impl: planFamilyBench('SELECT COUNT(DISTINCT UserID) FROM hits', 'sketchFold')
})
Test('biBench.plan.limit.boundedRows', {
  impl: planFamilyBench("SELECT SearchPhrase FROM hits WHERE SearchPhrase<>'' ORDER BY EventTime LIMIT 10", 'limit')
})
Test('biBench.plan.randomAccess.point', {
  impl: planFamilyBench('SELECT UserID FROM hits WHERE UserID = 435090932899640449', 'randomAccess')
})

Test('biBenchmark.localFs', {
  HeavyTest: true,
  impl: dataTest({
    calculate: compareBenchmarks(dsls.bi['query-case']['biBench.taxi'](), [localFs()]),
    expectedResult: and(
      equals('localFs', '%0/environment%'),
      equals(true, '%0/valid%'),
      '%0/cold/rows/0/trips% > 0',
      '%0/warm/0/rows/0/total_fare% > 0'
    ),
    timeout: 120000,
    logger: 'benchmarkLogger,duckDBProfilingLogger'
  })
})

Test('biBenchmark.cloud', {
  HeavyTest: true,
  impl: dataTest({
    vars: [Var('roomWUrl', 'room://testPublicRoom'), Var('lambdaHost', 'https://staging.indivi.ai')],
    calculate: compareBenchmarks(dsls.bi['query-case']['biBench.taxi'](), [cloud()]),
    expectedResult: and(
      equals('cloud', '%0/environment%'),
      equals(true, '%0/valid%'),
      '%0/cold/rows/0/trips% > 0',
      '%0/warm/0/rows/0/total_fare% > 0'
    ),
    timeout: 120000,
    logger: 'benchmarkLogger,duckDBProfilingLogger,roomLogger'
  })
})

Test('biBenchmark.localFsAndCloud', {
  HeavyTest: true,
  impl: dataTest({
    vars: [Var('roomWUrl', 'room://testPublicRoom'), Var('lambdaHost', 'https://staging.indivi.ai')],
    calculate: compareBenchmarks(dsls.bi['query-case']['biBench.taxi'](), [localFs(), cloud()]),
    expectedResult: and(equals(2, '%length%'), equals(true, '%0/valid%'), equals(true, '%1/valid%')),
    timeout: 120000,
    logger: 'benchmarkLogger,duckDBProfilingLogger,roomLogger'
  })
})
