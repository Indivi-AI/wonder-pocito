// comax-cube-tests.js — verify the fresh comax report<bi> catalog over the local db:'fs' mirror of
// signedRoom://comax2/usersRO/parquet/OEM_BI_4466 (files/rooms/comax2/...). Baseline: 30d net sales ≈ 25.5M.
import { dsls } from '@jb6/core'
import '@jb6/testing'
import './comax-cube.js'
import './comax-reports.js'
import './comax-lambdas.js'
import './comax-etl.js'

const {
  tgp: { 'ctx-enricher': { setupCube, setVars, Var } },
  test: { Test, test: { dataTest } },
  common: { data: { cubeQuery, asIs, invokeSnippetInContext, comaxNetSales30d, comaxPing, comaxLatestMonthRaw }, boolean: { and, equals } },
  bi: { cube: { comaxSalesCube }, report: { comaxSalesKpis, comaxTopBranches, comaxCostAudit, comaxBranchYoY, comaxHolidayComparison } }
} = dsls

Test('comaxCube.latestMonthRaw', {
  impl: dataTest({
    vars: [Var('db', 'fs')],
    calculate: cubeQuery("select count(*) lines from {%$salesLines%} where sale_date between date '2026-06-01' and date '2026-06-28'"),
    expectedResult: '%0/lines% > 0',
    setup: setupCube(comaxSalesCube()),
    timeout: 60000,
    logger: 'comaxLogger,biLogger'
  })
})

Test('comaxCube.baselineNetSales30d', {
  impl: dataTest({
    vars: [Var('db', 'fs'), Var('comaxArgs', asIs({period: '30', prior: false}))],
    calculate: cubeQuery('select round(sum(net_sales_amount),2) sales from base'),
    expectedResult: and('%0/sales% > 25000000','%0/sales% < 26000000'),
    setup: setupCube(comaxSalesCube()),
    timeout: 60000,
    logger: 'comaxLogger,biLogger'
  })
})

// the same baseline query as comaxNetSales30d, but run as a published room lambda: invokeSnippetInContext POSTs the call
// to the protected comax room; the server runs setupComax + cubeQuery and rows ride back.
Test('comaxCube.lambda.ping', {
  HeavyTest: true,
  impl: dataTest({
    setup: setVars(asIs({ lambdaHost: 'https://w-staging.indivi.ai', roomWUrl: 'signedRoom://comax2' })),
    calculate: invokeSnippetInContext(comaxPing()),
    expectedResult: equals(true, '%pong%'),
    timeout: 20000,
    logger: 'roomLogger,dbLogger'
  })
})

Test('comaxCube.lambda.netSales30d', {
  HeavyTest: true,
  impl: dataTest({
    setup: setVars(asIs({ lambdaHost: 'https://w-staging.indivi.ai', roomWUrl: 'signedRoom://comax2' })),
    calculate: invokeSnippetInContext(comaxNetSales30d()),
    expectedResult: and('%0/sales% > 25000000', '%0/sales% < 26000000'),
    timeout: 60000,
    logger: 'comaxLogger,biLogger,dbLogger,roomLogger'
  })
})

// The same raw latest-month MQY query through the published protected-room lambda.
// PRECONDITION (future LLM): like every *lambda* HeavyTest, this invokes comaxLatestMonthRaw BY NAME on staging — it must be
// PUBLISHED first or the server answers 500 "no lambda comaxLatestMonthRaw in comax2". Publish via the uploadRoomLambda MCP
// tool: { roomId: 'comax2', entryPath: '@solution/comax2/comax-lambdas.js', lambdaId: 'comaxLatestMonthRaw' }.
Test('comaxCube.lambda.latestMonthRaw', {
  HeavyTest: true,
  impl: dataTest({
    setup: setVars(asIs({ lambdaHost: 'https://w-staging.indivi.ai', roomWUrl: 'signedRoom://comax2' })),
    calculate: invokeSnippetInContext(comaxLatestMonthRaw()),
    expectedResult: '%0/lines% > 0',
    timeout: 60000,
    logger: 'comaxLogger,biLogger,dbLogger,roomLogger'
  })
})

Test('comaxCube.salesKpis', { impl: dataTest({
    calculate: comaxSalesKpis(),
    expectedResult: and('%widgets/0/kind% == table', '%widgets/0/rows/0/sales% > 0', '%text%', '%followUps/length% == 2'),
    setup: setupCube(comaxSalesCube()), 
    timeout: 12000, logger: 'comaxLogger,biLogger,dbLogger'
  }) 
})

Test('comaxCube.topBranches', { impl: dataTest({
  calculate: comaxTopBranches(),
  expectedResult: and('%widgets/0/kind% == hbar', '%widgets/0/data/length% > 0', '%text%'),
  setup: setupCube(comaxSalesCube()), timeout: 12000, logger: 'comaxLogger,biLogger,dbLogger'
}) })

Test('comaxCube.costAudit', { impl: dataTest({
  calculate: comaxCostAudit(),
  expectedResult: and('%widgets/0/kind% == pie', '%widgets/0/data/length% > 0', '%text%'),
  setup: setupCube(comaxSalesCube()), timeout: 12000, logger: 'comaxLogger,biLogger,dbLogger'
}) })

Test('comaxCube.branchYoY', { impl: dataTest({
  calculate: comaxBranchYoY(),
  expectedResult: and('%widgets/0/kind% == groupedBar', '%widgets/0/series/0/points/length% > 0', '%text%'),
  setup: setupCube(comaxSalesCube()), timeout: 12000, logger: 'comaxLogger,biLogger,dbLogger'
}) })

Test('comaxCube.holidayComparison', { impl: dataTest({
  calculate: comaxHolidayComparison(),
  expectedResult: and('%widgets/0/kind% == groupedBar', '%widgets/0/series/0/points/length% > 0', '%text%'),
  setup: setupCube(comaxSalesCube()), timeout: 12000, logger: 'comaxLogger,biLogger,dbLogger'
}) })
