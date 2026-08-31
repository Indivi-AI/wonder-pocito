// cacheStrategy 'noCache' is required locally: colsCache LOADs a duckdb extension built only for linux_amd64.
// Verifies conversionsCube / spendCube / adPerformanceCube over the local db:'fs' mirror of room://schematicsBI.
// Baselines come from the schematics Databricks dump (2025-09-01 → 2026-06-03) and are asserted as ranges,
// so a re-dump that shifts totals slightly still passes while a broken join does not.
//
// The cubes are ALL-VERTICAL. Tests that carry a HELOC baseline say so with an explicit `vertical =` filter;
// that filter is itself the assertion that generalising did not change what HELOC means.

import { dsls } from '@jb6/core'
import '@jb6/testing'
import '@wonder/db/db-drivers-live-repo.js'   // registers the FS.* drivers that db:'fs' needs; db-drivers.js does not load it
import './schematics-cubes.js'
import './schematics-etl.js'

const {
  tgp: { 'ctx-enricher': { setupCube, Var } },
  test: { Test, test: { dataTest } },
  common: { data: { cubeQuery }, boolean: { and, equals } },
  bi: { cube: { conversionsCube, spendCube, adPerformanceCube } },
  etl: { etl: { buildSchematicsSilver } }
} = dsls

const HELOC = "vertical = 'Home Equity Loans'"

// The silver now carries every vertical. HELOC keeping its original clickout count is what proves that
// generalising widened the cube without disturbing the slice the dashboard already trusted.
Test('conversionsCube.allVerticalsPresent', {
  impl: dataTest({
    vars: [Var('db', 'fs'), Var('cacheStrategy', 'noCache')],
    calculate: cubeQuery(`select count(*) clickouts, count(distinct vertical) verticals,
      count(*) filter (${HELOC}) heloc_clickouts from {%$conversions%}`),
    expectedResult: and('%0/verticals% > 20', '%0/clickouts% > 6000000',
      '%0/heloc_clickouts% > 240000', '%0/heloc_clickouts% < 260000'),
    setup: setupCube(conversionsCube()),
    timeout: 60000,
    logger: 'biLogger'
  })
})

// The L2S numbers I reverse-engineered from the Sigma dashboard: leads = is_converted, sales = disposition 'Sale'.
// amerisave 42445/1803 = 4.25%, unison 1370/95 = 6.93% — both inside the dashboard's observed 0–6.9% band.
Test('conversionsCube.leadToSaleByClient', {
  impl: dataTest({
    vars: [Var('db', 'fs'), Var('cacheStrategy', 'noCache')],
    calculate: cubeQuery(`select client_name, clickouts, leads, sales, l2s_pct
      from {%$conversions%} where ${HELOC} and client_name in ('amerisave','unison') group by client_name order by leads desc`),
    expectedResult: and(
      equals('amerisave', '%0/client_name%'), equals(42445, '%0/leads%'), equals(1803, '%0/sales%'),
      '%0/l2s_pct% > 4.2', '%0/l2s_pct% < 4.3',
      equals('unison', '%1/client_name%'), equals(1370, '%1/leads%'), equals(95, '%1/sales%')),
    setup: setupCube(conversionsCube()),
    timeout: 60000,
    logger: 'biLogger'
  })
})

// Guards the limits entry on unattributed traffic — the dashboard's blank first row (2.3% of clickouts, null sub1).
// If this ratio moves sharply the sessions join broke, which would silently mis-attribute revenue to campaigns.
Test('conversionsCube.unattributedRevenueIsIsolated', {
  impl: dataTest({
    vars: [Var('db', 'fs'), Var('cacheStrategy', 'noCache')],
    calculate: cubeQuery(`select
        count(*) filter (sub1 is null) unattributed,
        round(100.0 * count(*) filter (sub1 is null) / count(*), 1) unattributed_pct,
        round(sum(revenue_amount) filter (sub1 is null)) unattributed_revenue
      from {%$conversions%} where ${HELOC}`),
    expectedResult: and('%0/unattributed_pct% > 0', '%0/unattributed_pct% < 30', '%0/unattributed_revenue% > 0'),
    setup: setupCube(conversionsCube()),
    timeout: 60000,
    logger: 'biLogger'
  })
})

// The two revenue clocks must genuinely differ, otherwise modelling them as separate dimensions is pointless
// and the Performance/P&L tiles cannot be reproduced. Same measure, two date axes, one month.
Test('conversionsCube.revenueClocksDiverge', {
  impl: dataTest({
    vars: [Var('db', 'fs'), Var('cacheStrategy', 'noCache')],
    calculate: cubeQuery(`select
        round(sum(revenue_amount) filter (session_time >= date '2026-05-01' and session_time < date '2026-06-01')) by_session,
        round(sum(revenue_amount) filter (conversion_time >= date '2026-05-01' and conversion_time < date '2026-06-01')) by_conversion
      from {%$conversions%} where ${HELOC}`),
    expectedResult: and('%0/by_session% > 0', '%0/by_conversion% > 0', '%0/by_session% != %0/by_conversion%'),
    setup: setupCube(conversionsCube()),
    timeout: 60000,
    logger: 'biLogger'
  })
})

// The load-bearing assumption of the whole spend model: schematics buy media in vertical-segregated ad
// accounts, so an account's vertical can be inferred from where its own traffic converted. Measured 99.98%
// pure. If a shared account ever appears this drops and every per-vertical spend number becomes suspect.
Test('spendCube.accountVerticalIsPure', {
  impl: dataTest({
    vars: [Var('db', 'fs'), Var('cacheStrategy', 'noCache')],
    calculate: cubeQuery(`select account_name, count(distinct vertical) verticals
      from {%$spend%} group by account_name order by verticals desc limit 3`),
    expectedResult: and('%0/verticals% == 1', '%length% == 3'),
    setup: setupCube(spendCube()),
    timeout: 60000,
    logger: 'biLogger'
  })
})

// The $531,179 on accounts that never sold anything must stay VISIBLE. The previous build dropped it with a
// `sub1 in (select sub1 from conversions)` filter, which deleted 11% of all spend and flattered every ROI.
Test('spendCube.unattributedSpendSurvives', {
  impl: dataTest({
    vars: [Var('db', 'fs'), Var('cacheStrategy', 'noCache')],
    calculate: cubeQuery(`select vertical, spend from {%$spend%}
      where vertical = '(unattributed)' group by vertical`),
    expectedResult: and('%length% == 1', '%0/spend% > 500000', '%0/spend% < 600000'),
    setup: setupCube(spendCube()),
    timeout: 60000,
    logger: 'biLogger'
  })
})

Test('spendCube.accountTotals', {
  impl: dataTest({
    vars: [Var('db', 'fs'), Var('cacheStrategy', 'noCache')],
    calculate: cubeQuery(`select account_name, spend, impressions, cpc from {%$spend%}
      group by account_name order by spend desc limit 5`),
    expectedResult: and('%0/spend% > 1000000', '%0/cpc% > 0', equals('D.Y.K. TECHNOLOGIES LTD - BL US', '%0/account_name%')),
    setup: setupCube(spendCube()),
    timeout: 60000,
    logger: 'biLogger'
  })
})

// The dashboard's KPI tiles once read ROI 42% / CPL $249 because spend was not restricted to HELOC campaigns.
// Now the vertical filter does that work, so the tiles are only correct if the filter reaches BOTH sides of
// the revenue/spend join. Note the SQL: metric NAMES only. If a metric is renamed or its formula breaks, this fails.
Test('adPerformanceCube.kpiTilesAreSane', {
  impl: dataTest({
    vars: [Var('db', 'fs'), Var('cacheStrategy', 'noCache')],
    calculate: cubeQuery({ sql: 'select revenue, spend, profit, roi_pct, cost_per_clickout, cpl',
      where: `${HELOC} and session_date >= date '2026-05-01'` }),
    expectedResult: and('%0/roi_pct% > 90', '%0/roi_pct% < 140',
      '%0/cost_per_clickout% > 10', '%0/cost_per_clickout% < 45',
      '%0/cpl% > 50', '%0/cpl% < 150', '%0/profit% != 0'),
    setup: setupCube(adPerformanceCube()),
    timeout: 60000,
    logger: 'biLogger'
  })
})

// The gold roll-up must not lose or duplicate money. Note revenue is $6,857,332 here against $6,942,668 in
// conversionsCube: gold buckets by the ACCOUNT's vertical, so ~1.2% of HELOC-sold clickouts earned by
// non-HELOC accounts land elsewhere. That gap is the definition working as designed, not drift.
Test('adPerformanceCube.helocReconciles', {
  impl: dataTest({
    vars: [Var('db', 'fs'), Var('cacheStrategy', 'noCache')],
    calculate: cubeQuery({ sql: 'select revenue, spend, leads, sales, clickouts', where: HELOC }),
    // revenue/spend are doubles and clickouts arrives as a bigint string — compare numerically, not by identity
    expectedResult: and('%0/revenue% > 6857331', '%0/revenue% < 6857333',
      '%0/spend% > 7034576', '%0/spend% < 7034578',
      equals(77150, '%0/leads%'), equals(2596, '%0/sales%'), '%0/clickouts% == 242654'),
    setup: setupCube(adPerformanceCube()),
    timeout: 60000,
    logger: 'biLogger'
  })
})

// Every vertical must be reachable, not just the one the dashboard happens to use.
Test('adPerformanceCube.verticalsAreSeparable', {
  impl: dataTest({
    vars: [Var('db', 'fs'), Var('cacheStrategy', 'noCache')],
    calculate: cubeQuery('select vertical, revenue, spend, roi_pct group by 1 order by spend desc limit 6'),
    expectedResult: and('%length% == 6', equals('Home Equity Loans', '%0/vertical%'),
      '%0/roi_pct% > 90', '%0/roi_pct% < 110', '%1/spend% > 0'),
    setup: setupCube(adPerformanceCube()),
    timeout: 60000,
    logger: 'biLogger'
  })
})

// The exact table the applet renders — metric names only, no aggregate SQL in the caller.
Test('adPerformanceCube.dashboardTableVocabulary', {
  impl: dataTest({
    vars: [Var('db', 'fs'), Var('cacheStrategy', 'noCache')],
    calculate: cubeQuery({ sql: `select account_name, sub1, revenue, spend, profit, roi_pct,
        amerisave_leads, amerisave_sales, amerisave_l2s_pct
      group by 1,2 order by revenue desc limit 5`, where: `${HELOC} and session_date >= date '2026-05-01'` }),
    expectedResult: and('%length% == 5', '%0/revenue% > 0', '%0/roi_pct% > 0', '%0/amerisave_leads% > 0'),
    setup: setupCube(adPerformanceCube()),
    timeout: 60000,
    logger: 'biLogger'
  })
})

// The silver build is a component now, so it is runnable and assertable like anything else in the repo.
Test('buildSchematicsSilver', {
  HeavyTest: true,
  impl: dataTest({
    calculate: buildSchematicsSilver(),
    expectedResult: '%built/length% == 3',
    timeout: 120000,
    logger: 'etlLogger'
  })
})
