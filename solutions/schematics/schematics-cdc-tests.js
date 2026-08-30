// THE CONTRACT — what must still be true after this pipeline is rewritten.
//
// Five assertions. Four are measured against schematics' OWN Databricks dump, which nothing here produces,
// so agreeing with it is evidence rather than self-consistency. The fifth pins every number the gold cube
// serves, so a metric that quietly disappears in a refactor fails loudly instead of rendering as zero.
// Everything under FIXTURES asserts nothing — it is the build chain these five read.
//
// Read HANDOVER.md §7 before touching a number here. Every trap in it fails SILENTLY: a room:// lookup that
// cannot resolve returns an empty Map and writes NULLs rather than raising, so a broken build looks healthy.

import { dsls } from '@jb6/core'
import '@jb6/testing'
import '@wonder/db/db-drivers-live-repo.js'   // FS.* drivers — without them every enriched column is NULL (trap 7.1)
import './schematics-cdc-cube.js'
import './heloc-dashboard.js'
import './schematics-cron.js'
import '@jb6/react/tests/react-testers.js'

const {
  tgp: { 'ctx-enricher': { setupCube, Var, enrichCtx } },
  test: { Test, test: { dataTest, reactTest } },
  react: { 'react-comp': { HelocDashboard }, 'ui-action': { delay } },
  common: { data: { cubeQuery, materializeCubePeriod, buildCube, schematicsNightlyReadiness }, boolean: { and, contains, notContains } },
  bi: { cube: { clickoutsCdcCube, cdcAdPerformanceCube } },
  etl: { etl: { buildCdcReference, buildCdcGold } }
} = dsls

const PERIOD = '2026-05-15', PREV = '2026-05-14', RANGE = `${PREV}..2026-05-17`
const queryVars = [Var('db', 'fs'), Var('cacheStrategy', 'noCache')]
const HELOC = "vertical = 'Home Equity Loans'"

// ---------------------------------------------------------------------------------------------------------
// CONTRACT
// ---------------------------------------------------------------------------------------------------------

// COMPLETENESS. Every clickout the dump knows about must reconstruct out of the raw change records, under
// EITHER of the two keys the dump derives — a click with a uniqueTrackId is keyed upper(uniqueTrackId)_offerId,
// otherwise by clickId. 82% of rows use the first form and the other 18% carry 87% of the revenue, so a
// reconstruction that handles only one looks nearly complete and loses most of the money.
//
// versions_per_click is the MERGE assertion riding along: a clickout is written ~3.16 times and every non-key
// column must come from the LAST version. A reader that merely concatenates the avro gets the first of each
// and still returns a plausible row count.
//
// The window is stated in UTC instants, never as session_dt::date — the dump renders that column in +03, so
// comparing date-labels scores 85% and reads as data loss when it is only a three-hour offset (trap 7.2).
Test('clickoutsCdc.rebuildsTheDump', {
  impl: dataTest({
    vars: queryVars,
    calculate: cubeQuery(`with dump as (
        select event_id from read_parquet('/tmp/schm-bronze/revenue_clicks.parquet')
        where session_dt >= timestamptz '${PERIOD} 00:00:00+00'
          and session_dt < timestamptz '${PERIOD} 00:00:00+00' + interval 1 day),
      built as (
        select lower(click_uuid) k from {%$clickoutsCdc%} where click_uuid is not null
        union all
        select lower(unique_track_id || '_' || offer_id) from {%$clickoutsCdc%} where unique_track_id is not null)
      select count(*) dump_rows, round(100.0 * count(b.k) / count(*), 2) pct_found,
             (select round(sum(cdc_versions) * 1.0 / count(*), 2) from {%$clickoutsCdc%}) versions_per_click
      from dump d left join built b on b.k = lower(d.event_id)`),
    expectedResult: and('%0/dump_rows% > 25000', '%0/pct_found% > 99', '%0/versions_per_click% > 2'),
    setup: setupCube(clickoutsCdcCube(), PERIOD),
    timeout: 120000,
    logger: 'biLogger'
  })
})

// THE MONEY. Measured over the dump's OWN +03 day, which spans TWO UTC parquets — its 2026-05-15 begins at
// 2026-05-14 21:00 UTC, so a single UTC file silently drops 210 clickouts before any correctness question is
// asked. Baselines are stated rather than joined because a cubeQuery cannot select a raw column named
// `revenue` — the name expands to the metric and quoting does not help (trap 7.7).
//
//   revenue  $46,566 vs dump $46,553  ->  100.03%
//   sales         26 vs dump      26  ->  EXACT
//   leads    399-406 vs dump     403      moves with the lag window; revenue and sales do not
//
// WHAT MAKES IT EXACT: revenue comes from the links_tracking_payouts LEDGER, never the clickout row's own
// payout field. Same (clickId, offerId) = revisions, take max; different offerId = separate payments, sum.
// Both rules were measured, not assumed — unison writes 0.00 then 200.00 a second apart and the dump keeps
// 200, so first-by-time is wrong; amerisave writes 87.00 twice eleven days apart and the dump keeps 87 not
// 174, so summing is wrong. The remaining $13 is three clickouts on two offers the dump books differently.
Test('clickoutsCdc.maturedRevenueReachesParity', {
  impl: dataTest({
    vars: queryVars,
    calculate: cubeQuery(`select count(*) clickouts, sum(is_lead) leads, sum(is_sale) sales,
        round(sum(revenue_amount)) rev_all
      from {%$clickoutsCdc%} where ${HELOC}
        and click_time >= '${PREV} 21:00:00' and click_time < '${PERIOD} 21:00:00'`),
    // plain bounds, not ratios: the expression evaluator does not do parenthesised arithmetic. The revenue
    // band is TIGHT on purpose — a matured day is settled, so any drift here is a regression, not late payouts
    expectedResult: and('%0/sales% == 26', '%0/leads% > 395', '%0/leads% < 410',
      '%0/clickouts% > 1450', '%0/rev_all% > 46100', '%0/rev_all% < 47000'),
    setup: setupCube(clickoutsCdcCube(), `${PREV}..${PERIOD}`),
    timeout: 120000,
    logger: 'biLogger'
  })
})

// EVERY NUMBER THE GOLD CUBE SERVES, on HELOC 2026-05-15, pinned to what it measured on 2026-08-30. This is
// the one test to keep if only one survives a rewrite: a metric that is dropped, renamed or silently joined
// away does not error — it reads as 0, and a dashboard tile showing $0 looks like a quiet day.
//
// splitero is 0 leads and 0 sales on this day. That is a REAL measurement, not a gap: the buyer was live and
// bought nothing, and pinning it is what proves the per-client pivot fires for all three rather than for the
// two that happen to have volume.
Test('cdcGold.everyNumberOnTheDay', {
  impl: dataTest({
    vars: queryVars,
    calculate: cubeQuery({ sql: `select clickouts, leads, sales, revenue, spend, profit, roi_pct,
        cost_per_clickout, cpl, rev_per_lead, lead_rate_pct, lead_to_sale_pct, impressions, link_clicks,
        amerisave_leads, amerisave_sales, unison_leads, unison_sales, splitero_leads, splitero_sales`,
      where: HELOC }),
    expectedResult: and(
      '%0/clickouts% == 1446', '%0/leads% == 404', '%0/sales% == 30',
      '%0/impressions% == 538453', '%0/link_clicks% == 9535',
      '%0/amerisave_leads% == 252', '%0/amerisave_sales% == 14',
      '%0/unison_leads% == 33', '%0/unison_sales% == 1',
      '%0/splitero_leads% == 0', '%0/splitero_sales% == 0',
      '%0/revenue% > 46724', '%0/revenue% < 46725',      // $46,724.31
      '%0/spend% > 37976', '%0/spend% < 37977',          // $37,976.87 — UTC-pinned; see trap 7.13
      '%0/profit% > 8747', '%0/profit% < 8748',          // $8,747.44
      '%0/roi_pct% > 123', '%0/roi_pct% < 124',          // 123.03% — a percent of spend, so 100 is break-even
      '%0/cost_per_clickout% > 26', '%0/cost_per_clickout% < 27',   // $26.26
      '%0/cpl% > 93', '%0/cpl% < 95',                    // $94.00
      '%0/rev_per_lead% > 115', '%0/rev_per_lead% < 116',           // $115.65
      '%0/lead_rate_pct% > 27', '%0/lead_rate_pct% < 28',           // 27.94%
      '%0/lead_to_sale_pct% > 7', '%0/lead_to_sale_pct% < 8'),     // 7.43%
    setup: setupCube(cdcAdPerformanceCube(), PERIOD),
    timeout: 120000,
    logger: 'biLogger'
  })
})

// SPEND LANDS EXACTLY ONCE. Deliberately unfiltered, because this is the fan-out guard: if vertical ever
// creeps into the gold's join key, or a campaign is counted under two accounts, the gold total diverges from
// the spend silver and every ROI in the cube is quietly overstated while each row still looks right.
Test('cdcGold.spendIsNotDuplicated', {
  impl: dataTest({
    vars: queryVars,
    calculate: cubeQuery(`select round(sum(spend_amount)) gold_spend,
      (select round(sum(spend_amount)) from read_parquet('files/rooms/schematicsBI/usersRO/silver/spend.parquet')
        where (dt at time zone 'UTC')::date = date '${PERIOD}') silver_spend`),
    expectedResult: '%0/gold_spend% == %0/silver_spend%',
    setup: setupCube(cdcAdPerformanceCube(), PERIOD),
    timeout: 120000,
    logger: 'biLogger'
  })
})

// THE APPLET ACTUALLY RENDERING. Every test above proves the DATA path; this is the only one that proves the
// dashboard a human opens produces numbers. It renders headlessly against the real gold parquets over db:'fs'
// and waits for the useEffect cube queries to settle. It exists because
// /room/schematicsBI/applet/HelocDashboard cannot be opened locally — the applet def was never published
// (HANDOVER §8.6) — so this is the only proof the UI works without making a bucket write first.
Test('helocDashboard.rendersWithRealData', {
  impl: reactTest({
    testedComp: HelocDashboard(),
    // 'HELOC V2' is the header; '$' proves a KPI tile formatted a real number rather than rendering 'Loading…'
    expectedResult: and(contains('HELOC V2'), contains('$'), notContains('Loading')),
    setup: enrichCtx([Var('db', 'fs'), Var('cacheStrategy', 'noCache')]),
    userActions: delay(3000),
    timeout: 120000,
    logger: 'biLogger'
  })
})

// ---------------------------------------------------------------------------------------------------------
// FIXTURES — the build chain, in this order. Nothing here asserts; each step reads the previous one's output,
// and getting the order wrong does not error, it writes NULLs (trap 7.1). Run only when you intend to rebuild.
//
//   buildCdcReference -> maturedBuildPrevDay -> maturedBuild -> buildCdcRange -> buildCdcGoldRange
// ---------------------------------------------------------------------------------------------------------

// lagDays 21 because a payout is written days after the click. buildCube does NOT propagate it (trap 7.3), so
// only the two materializeCubePeriod builds below are actually matured — which is why buildCdcRange is scoped
// to days whose maturity does not matter. /dev/shm is the linux default and does not exist on mac.
const buildVars = [Var('db', 'fs'), Var('cacheStrategy', 'noCache'), Var('localDir', '/tmp/cdc-build'), Var('lagDays', 21)]

// offers, clients and THE SETTLEMENT LEDGER, each collapsed to current state across ALL history — one day
// holds only whichever rows changed that day. The ledger lives here rather than in a per-period silver for a
// measured reason: a disposition is written back weeks after the payment is booked, so partitioning by
// booking day with the usual 2-day lag dropped 24 of this window's 26 HELOC sales while looking healthy (7.5).
Test('buildCdcReference', {
  HeavyTest: true,
  impl: dataTest({ calculate: buildCdcReference(), expectedResult: '%built/length% == 3', timeout: 180000, logger: 'etlLogger' })
})

// BOTH UTC days, because the dump's +03 day straddles them and the parity test above spans the pair.
Test('clickoutsCdc.maturedBuildPrevDay', {
  HeavyTest: true,
  impl: dataTest({
    vars: buildVars,
    calculate: materializeCubePeriod(clickoutsCdcCube(), PREV),
    expectedResult: and('%objs% > 24000', '%bytes% > 0'),
    timeout: 600000, logger: 'biLogger'
  })
})

Test('clickoutsCdc.maturedBuild', {
  HeavyTest: true,
  impl: dataTest({
    vars: buildVars,
    calculate: materializeCubePeriod(clickoutsCdcCube(), PERIOD),
    expectedResult: and('%objs% > 25000', '%bytes% > 0'),
    timeout: 600000, logger: 'biLogger'
  })
})

// ONLY the days the matured builds do not own — buildCube would rebuild them at the source default of 2 and
// quietly move the parity day's revenue and leads.
Test('buildCdcRange', {
  HeavyTest: true,
  impl: dataTest({
    vars: [...buildVars, Var('timePeriods', ['2026-05-16', '2026-05-17'])],
    calculate: buildCube(clickoutsCdcCube()),
    expectedResult: '%result/results/length% == 2',
    timeout: 900000, logger: 'biLogger'
  })
})

// The dashboard's date pickers default to 2026-05-15..2026-05-17, and a per-period silver raises
// "No files found" for an unbuilt day rather than returning empty (trap 7.11). Build what you intend to query.
Test('buildCdcGoldRange', {
  HeavyTest: true,
  impl: dataTest({ calculate: buildCdcGold(RANGE), expectedResult: '%days% == 4', timeout: 300000, logger: 'etlLogger' })
})

// ---------------------------------------------------------------------------------------------------------
// DEPLOYABILITY
// ---------------------------------------------------------------------------------------------------------

// THIS TEST FAILS TODAY, AND THAT IS THE POINT. schematicsNightly is written and correct, but the platform
// cannot yet run it: the image the job would run in has no gcloud, which gcloudCronEtl's own runner shells
// out to, and gcloudCronEtl cannot name the service account that is allowed to write the protected bucket.
// The failure lists both, with the fix for each. When infra lands them this goes green with no edit here —
// which is the only honest way to record "the ETLs do not yet run in the cloud".
Test('schematicsNightly.deployable', {
  impl: dataTest({ calculate: schematicsNightlyReadiness(), expectedResult: '%ready% == true', timeout: 60000 })
})
