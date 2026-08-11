import { dsls } from '@jb6/core'
import '@jb6/testing'
import './demo-financial-cube-v2.js'

const {
  common: { data: { cubeQuery }, boolean: { and } },
  bi: { cube: { demoFinanacialCubeV2 }, report: { demoFinancialSummary, demoFinancialRevenueTrend } },
  tgp: { 'ctx-enricher': { setupCube, enrichCtx, Var } },
  test: { Test, test: { dataTest } }
} = dsls

Test('demoFinancialCubeV2.financialMetrics', {
  impl: dataTest({
    calculate: cubeQuery('select txns,customers,completed_value,estimated_cost,payment_fees,gross_profit,quality_issue_rate'),
    expectedResult: and('%0/txns%==100000', '%0/customers%>0', '%0/completed_value%>0', '%0/gross_profit%<%0/completed_value%'),
    setup: enrichCtx(Var('cacheStrategy', 'fullFileCache'), setupCube(demoFinanacialCubeV2())),
    timeout: 15000,
    logger: 'biLogger,biDownloadLogger'
  })
})

Test('demoFinancialCubeV2.scheduleKpiMetrics', {
  impl: dataTest({
    calculate: cubeQuery('select completed_value as "completed_value", gross_profit as "gross_profit", payment_fees as "payment_fees"'),
    expectedResult: and('%0/completed_value%>0', '%0/gross_profit%>0', '%0/payment_fees%>0'),
    setup: enrichCtx(Var('cacheStrategy', 'fullFileCache'), setupCube(demoFinanacialCubeV2())),
    timeout: 15000,
    logger: 'biLogger'
  })
})

Test('demoFinancialCubeV2.trendNoGranVar', {
  impl: dataTest({
    calculate: demoFinancialRevenueTrend(),
    expectedResult: and('%rows/length%>0', '%rows/0/value%>0'),
    setup: enrichCtx(Var('cacheStrategy', 'fullFileCache'), setupCube(demoFinanacialCubeV2())),
    timeout: 15000,
    logger: 'biLogger'
  })
})

Test('demoFinancialCubeV2.lookupDimensions', {
  impl: dataTest({
    calculate: cubeQuery(`select customer_type,product_category,payment_channel,gross_profit
      group by customer_type,product_category,payment_channel`),
    expectedResult: and('%length%>20', '%0/customer_type%', '%0/product_category%', '%0/payment_channel%'),
    setup: enrichCtx(Var('cacheStrategy', 'fullFileCache'), setupCube(demoFinanacialCubeV2())),
    timeout: 15000,
    logger: 'biLogger,biDownloadLogger'
  })
})

Test('demoFinancialCubeV2.filteredSummaryReport', {
  impl: dataTest({
    calculate: demoFinancialSummary(),
    expectedResult: and('%rows/0/txns%==1519', '%widgets/0/kind%==table', '%text%'),
    setup: enrichCtx(Var('cacheStrategy', 'fullFileCache'),
      setupCube(demoFinanacialCubeV2(), { filters: "date >= DATE '2025-05-31' AND date <= DATE '2025-06-30'" })),
    timeout: 15000,
    logger: 'biLogger,biDownloadLogger'
  })
})
