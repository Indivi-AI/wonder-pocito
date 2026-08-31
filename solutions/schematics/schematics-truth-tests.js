// GROUND TRUTH — our pipeline against schematics' OWN dashboard, captured 2026-08-31 from their HELOC V2 view.
//
// This is the first INDEPENDENT check the cost side has ever had. Everything else in the suite compares us to
// the Databricks dump, and spend.parquet is built FROM that dump's hourly_smm table — so "our spend matches
// Databricks" was always self-consistency. These numbers come from their system, not ours.
//
// ONE TEST PER CAPTURED PERIOD, and it asserts ONE thing: the output of the ETLs against the figures the
// client's dashboard printed. Each test replays gs://schematics-gcs-dump through every stage — reference
// tables, clickout silver at maturity, gold — and then compares those five numbers and nothing else. No dump,
// no row counts, no internal invariants: those belong to schematics-cdc-tests.js, which is about whether the
// pipeline is self-consistent. This file is about whether it is RIGHT.
//
// A test that read the gold parquet already on disk would be cheap and would prove nothing here — it would
// assert that some earlier build agreed with the client, not that the pipeline does. That is why the build is
// inside the test rather than a prerequisite of it.
//
// WHAT THE END-TO-END TEST DOES NOT COVER, and it is the first question anyone should ask of it: spend is not
// reachable from CDC at all. Meta cost arrives via the fb-connector and today lands through the Databricks
// pipeline, so the rebuild replays the REVENUE side from bronze and joins a pre-existing cost silver. The spend
// figure is therefore validated only by agreeing with schematics — which is exactly what makes these captures
// worth having, and exactly why the test asserts spend as well as revenue.
//
// RESULT on the one period measured so far: we reproduce them to within 0.8% on every figure, and the RATIOS
// (ROI, cost per clickout, cost per lead) match to within 0.5%. A uniform shortfall with intact ratios means
// the reconstruction is missing a little activity evenly — not mis-joining, not double-counting.
//
// TWO THINGS THE SCREENSHOTS FORCE, and both are load-bearing:
//
// 1. ONLY THE "Performance" ROW IS REAL. Their "Revenue (P&L)" tile reads 10,936,954.34 on the 06-03 view AND
//    on the week view — the identical number for a one-day and a six-day window. It is a lifetime total that
//    ignores the date filter, and Profit (P&L) / ROI % (P&L) are both derived from it (on 05-15, Profit (P&L)
//    10,898,703.70 is exactly that constant minus the day's spend). Every P&L tile is an artifact. Do not
//    reconcile against them and do not let anyone add them to the captures below.
//
// 2. THE WEEK IS SIX DAYS, NOT SEVEN. The picker was set to 05/11 00:00 - 05/17 00:00, and an exclusive 00:00
//    end drops 05-17 entirely. Their default would have been 23:59 and would have included it. The capture says
//    05-11..05-16 for that reason — reading it as a calendar week overstates our side by a full day and the
//    test then fails for a reason that has nothing to do with the pipeline.
//
// WHAT IS DELIBERATELY NOT ASSERTED: profit. It is a DIFFERENCE of two large, nearly equal numbers — the week
// is $255,187 revenue against $253,788 spend for $1,399 of profit — so a uniform 0.7% shortfall on each side
// moves profit by ~15% while both inputs stay within 1%. A percentage band on it would be noise, and a band
// wide enough to be stable would catch nothing. Profit is fully determined by revenue and spend, and both of
// those ARE asserted.
//
// The comparisons use PHYSICAL columns rather than metric names on purpose: the metric vocabulary is pinned by
// cdcGold.everyNumberOnTheDay in schematics-cdc-tests.js, so this file is free to be about the numbers alone.

import { dsls, jb } from '@jb6/core'
import '@jb6/testing'
import '@wonder/db/db-drivers-live-repo.js'   // FS.* drivers — without them every enriched column is NULL (trap 7.1)
import './schematics-cdc-cube.js'

const {
  tgp: { Const, 'ctx-enricher': { Var } },
  test: { Test, test: { dataTest }, logger: { etlLogger } },
  common: { Data, Boolean, Action, data: { pipe, cubeQuery, materializeCubePeriod }, boolean: { and } },
  bi: { cube: { clickoutsCdcCube, cdcAdPerformanceCube } },
  etl: { etl: { buildCdcReference, buildCdcGold } }
} = dsls

// What their dashboard printed, transcribed from the Performance row of the HELOC V2 tiles. A Const rather
// than a module-scope object so it is addressable as %$schematicsDashboardCaptures/<id>% from a profile, which
// is what lets one capture feed two tests without the numbers being written down twice.
//
// cpc and cpl are carried rather than derived because asserting them is what pins clickouts and leads:
// clickouts = spend/cpc and leads = spend/cpl, so a count that drifts surfaces here even though their
// dashboard exposes no count tile at all.
Const('schematicsDashboardCaptures', {
  // revenue is DERIVED for this day — the tile was behind the open date picker, so it is profit 8,848 + spend.
  // Cross-checks against the ROI tile (123.1% x 38,250.64 = 47,087, within the rounding of both). Re-capture
  // 05-15 with the picker closed and replace this with the printed figure.
  day20260515: { period: '2026-05-15', revenue: 47098.64, spend: 38250.64, roi: 123.1, cpc: 26.29, cpl: 94.45 },
  day20260603: { period: '2026-06-03', revenue: 54108, spend: 57973.41, roi: 93.3, cpc: 28.57, cpl: 111.49 },
  week20260511: { period: '2026-05-11..2026-05-16', revenue: 255187, spend: 253787.62, roi: 100.6, cpc: 28.34, cpl: 106.28 }
})

// ---------------------------------------------------------------------------------------------------------
// THE MEASUREMENT — every printed figure as a percentage of what they printed
// ---------------------------------------------------------------------------------------------------------

// WHY THIS EXISTS: a band is a licence to be wrong by a little, and a green test is read as "we reproduce the
// client". We do not — we are ~0.7% low on both primitives. Every figure inside the band still gets a verdict
// on the row and a warning in the log, so the shortfall cannot be mistaken for a clean result while it stands.
//
// warning(), never error(): a domain error tees into errorLogger and FAILS the test (tester.js:188), which
// would make this indistinguishable from a real regression. This is a debt marker, not a failure.
//
// AND THE DEBT IS PROBABLY OURS, NOT THE DATA'S. The obvious reading of a uniform shortfall is that the
// reconstruction is missing a little activity evenly. The likelier one is that a step lost something in the
// port to TGP — the reference ledger was already caught being built from a 20-day mirror instead of the full
// history, which changed sales on a day whose revenue looked settled. Look at the ETLs before concluding the
// source is short.
const flagsWhenNotExact = Data('flagsWhenNotExact', {
  description: 'pass the comparison row through, and say loudly when it is inside the band but not actually exact',
  params: [
    {id: 'exactWithinPct', as: 'number', defaultValue: 0.01,
      description: 'how far from 100 still counts as exact. The figures are rounded to 2 decimals, so anything tighter is rounding noise'}
  ],
  impl: (ctx, {}, { exactWithinPct }) => {
    const row = ctx.data
    const off = Object.entries(row).filter(([k]) => k.endsWith('_vs_truth'))
      .map(([k, v]) => [k, Math.round((v - 100) * 100) / 100]).filter(([, d]) => Math.abs(d) > exactWithinPct)
    if (!off.length) return { ...row, verdict: 'exact' }
    const worst = off.reduce((a, b) => Math.abs(b[1]) > Math.abs(a[1]) ? b : a)
    const verdict = `TEST PASSES BUT IS NOT 100% ACCURATE, NEEDS FIXING — ${worst[0]} is ${worst[1]}% off the `
      + `client's own figure, ${off.length} of 5 figures inexact. Suspect the ETL's port to TGP before the data.`
    ctx.vars.biLogger?.warning?.({ t: 'etlMatchesSchematics inexact', off: Object.fromEntries(off), verdict }, {}, { ctx })
    return { ...row, verdict }
  }
})

// One shape for all five numbers, so one band family covers them and the assertion reads the same for a day
// and for a week. ROI is redundant given revenue and spend, and is compared anyway because it is a SEPARATELY
// printed tile: it catches a transcription error in the capture itself, which no amount of internal
// consistency would.
//
// The aliases end _vs_truth because roi_pct, cpl, cost_per_clickout, revenue and spend are all METRIC names on
// this cube, and a bare metric name expands to the metric even as an output alias — quoting does not help
// (trap 7.7). There is no FROM clause: cubeQuery supplies the cube's own relation.
//
// cube and queryPeriod are passed here rather than bound by a setupCube in the test's `setup`, and that is not
// a style choice. setupCube resolves the silver files at SETUP time, which is before runBefore has built them,
// and a per-period silver raises "No files found" for a day that does not exist yet rather than returning
// empty (trap 7.11). cubeQuery runs the same querySetup lazily, so it reads what the ETL just wrote.
const goldVsSchematicsDashboard = Data('goldVsSchematicsDashboard', {
  description: `our HELOC gold as a percentage of what schematics' own dashboard printed for the same period`,
  params: [
    {id: 'capture', mandatory: true, description: 'one row of Const schematicsDashboardCaptures — its period and its five printed figures'}
  ],
  impl: pipe(cubeQuery({
    sql: `select
        round(100.0 * sum(revenue_amount) / {%$capture/revenue%}, 2) revenue_vs_truth,
        round(100.0 * sum(spend_amount) / {%$capture/spend%}, 2) spend_vs_truth,
        round(100.0 * sum(spend_amount) / sum(clickout_count) / {%$capture/cpc%}, 2) cpc_vs_truth,
        round(100.0 * sum(spend_amount) / sum(lead_count) / {%$capture/cpl%}, 2) cpl_vs_truth,
        round(10000.0 * sum(revenue_amount) / sum(spend_amount) / {%$capture/roi%}, 2) roi_vs_truth`,
    cube: cdcAdPerformanceCube(),
    queryPeriod: '%$capture/period%',
    where: "vertical = '%$helocVertical%'"
  }), flagsWhenNotExact())
})

// ONE PERCENT EITHER WAY, on every figure. The target is 100% — this band is the most that can be tolerated
// while the shortfall is investigated, not a definition of correct, and anything inside it still carries the
// verdict above. The two directions do mean different things and the band is deliberately symmetric anyway:
// over-counting (a fan-out in the gold join reads as more revenue than the client booked) flatters a number
// instead of shrinking it, so it is the failure nobody notices and it earns no more latitude than the other.
//
// Measured 99.21-99.95% on 2026-05-15, so today every figure sits inside this band with ~0.2pp to spare.
// Tighten it as the gap closes; do NOT widen it to admit a regression.
const withinSchematicsDashboardBands = Boolean('withinSchematicsDashboardBands', {
  description: 'every figure within 1% of what the client dashboard printed, in either direction',
  impl: and(
    '%0/revenue_vs_truth% > 99', '%0/revenue_vs_truth% < 101',
    '%0/spend_vs_truth% > 99', '%0/spend_vs_truth% < 101',
    '%0/cpc_vs_truth% > 99', '%0/cpc_vs_truth% < 101',
    '%0/cpl_vs_truth% > 99', '%0/cpl_vs_truth% < 101',
    '%0/roi_vs_truth% > 99', '%0/roi_vs_truth% < 101')
})

// ---------------------------------------------------------------------------------------------------------
// THE END-TO-END REBUILD
// ---------------------------------------------------------------------------------------------------------

// Every ETL the pipeline has, in the one order that works, over the raw Datastream sink. An action rather than
// a data comp because it produces no answer — it puts the store into the state the assertion then reads, which
// is what runBefore is for. Sitting in runBefore also puts it INSIDE the test's timeout race; a ctx-enricher in
// `setup` runs before the race and could hang forever.
//
// EACH TEST REBUILDS ITS OWN PERIOD, reference tables included. That is deliberate duplication: a test whose
// result depends on which other test ran first is precisely the failure HANDOVER traps 7.1 and 7.4 describe,
// and the reference replay is idempotent — §17 measured it reproducing all three parquets exactly.
//
// The three build steps are dynamic:true params rather than calls, so the impl never runs a profile of its own
// and a narrower source can be substituted without editing this component. Each is invoked with %$period%
// bound — and the silver with %$lagDays% too — by the setVars below.
const rebuildSchematicsPeriodFromBronze = Action('rebuildSchematicsPeriodFromBronze', {
  description: 'replay gs://schematics-gcs-dump through reference, clickout silver and gold for one period, at maturity',
  params: [
    {id: 'period', as: 'string', mandatory: true, description: 'YYYY-MM-DD or an inclusive from..to range — the same spec the cube query takes'},
    {id: 'lagDays', as: 'number', defaultValue: '%$maturityDays%',
      description: 'how many following days of payouts to fold in. The client quotes SETTLED numbers, so the silver must be matured'},
    {id: 'scratchDir', as: 'string', defaultValue: '/tmp/schm-e2e',
      description: "materializePeriod's scratch. buildSetup defaults it to /dev/shm, a LINUX tmpfs that does not exist on macOS"},
    {id: 'buildReference', type: 'data<common>', dynamic: true, defaultValue: buildCdcReference(),
      description: 'offers, clients and the settlement ledger — rebuilt WHOLESALE across all history, never per period (trap 7.5)'},
    {id: 'buildSilver', type: 'data<common>', dynamic: true, defaultValue: materializeCubePeriod(clickoutsCdcCube(), '%$period%'),
      description: 'invoked once per day with %$period% and %$lagDays% bound. materializeCubePeriod, never buildCube — only the former propagates the lag (trap 7.3)'},
    {id: 'buildGold', type: 'data<common>', dynamic: true, defaultValue: buildCdcGold('%$period%'),
      description: 'invoked once for the whole period; it expands the range itself, and needs every day of silver to exist first (trap 7.11)'}
  ],
  impl: async (ctx, {}, { period, lagDays, scratchDir, buildReference, buildSilver, buildGold }) => {
    const log = ctx.vars.etlLogger || etlLogger.$runWithCtx(ctx)
    const days = jb.biUtils.expandPeriods(period, 'YYYY-MM-DD')
    log.info({ t: 'e2e rebuild start', period, days: days.length, lagDays }, {}, { ctx })
    const reference = await buildReference(ctx)
    const silvers = []
    for (const day of days)
      silvers.push(await buildSilver(ctx.setVars({ period: day, lagDays, localDir: `${scratchDir}/${day}` })))
    const gold = await buildGold(ctx.setVars({ period }))
    log.info({ t: 'e2e rebuild done', period, reference: reference?.built, objs: silvers.map(s => s?.objs),
      goldDays: gold?.days }, {}, { ctx })
  }
})

// ---------------------------------------------------------------------------------------------------------
// THE TESTS
//
// Written out one by one rather than generated from the capture table, and that is not verbosity for its own
// sake: the TGP model is built by PARSING these files, so a Test id assembled from a template literal inside a
// forEach registers at runtime but is invisible to runTest, which resolves the id statically. A generated
// suite looks fine and cannot be run. Each test names its capture once, in a Var, and the numbers still live
// in exactly one place.
//
// All three are HeavyTest: each one re-reads the whole payout history plus a day of clicks per period out of
// the bucket, so none of them belongs in a suite run.
//
// The week is the only period that can tell a DAY-BOUNDARY SHIFT from real loss: a timezone error makes each
// day short by what the next day is long by, so the days disagree while the six-day total lands. If the per-day
// tests fail and the week passes, the reconstruction is complete and the bucketing is wrong — a different bug
// with a different fix. That distinction is the entire reason a range was asked for alongside the days.
//
// EACH RUN REWRITES the silver and gold it asserts on, and the reference tables under them. 05-16 and 05-17
// are maintained at the source default lag of 2 by buildCdcRange, so a run of the week test leaves 05-16
// matured at 21 instead — re-run buildCdcRange if you want that fixture back exactly as it was.
// ---------------------------------------------------------------------------------------------------------

Test('cdcGold.etlMatchesSchematics.day20260515', {
  HeavyTest: true,
  impl: dataTest({
    vars: [Var('db', 'fs'), Var('cacheStrategy', 'noCache'), Var('capture', '%$schematicsDashboardCaptures/day20260515%')],
    runBefore: rebuildSchematicsPeriodFromBronze('%$capture/period%'),
    calculate: goldVsSchematicsDashboard('%$capture%'),
    expectedResult: withinSchematicsDashboardBands(),
    timeout: 1800000, logger: 'biLogger,etlLogger'
  })
})

Test('cdcGold.etlMatchesSchematics.day20260603', {
  HeavyTest: true,
  impl: dataTest({
    vars: [Var('db', 'fs'), Var('cacheStrategy', 'noCache'), Var('capture', '%$schematicsDashboardCaptures/day20260603%')],
    runBefore: rebuildSchematicsPeriodFromBronze('%$capture/period%'),
    calculate: goldVsSchematicsDashboard('%$capture%'),
    expectedResult: withinSchematicsDashboardBands(),
    timeout: 1800000, logger: 'biLogger,etlLogger'
  })
})

Test('cdcGold.etlMatchesSchematics.week20260511', {
  HeavyTest: true,
  impl: dataTest({
    vars: [Var('db', 'fs'), Var('cacheStrategy', 'noCache'), Var('capture', '%$schematicsDashboardCaptures/week20260511%')],
    runBefore: rebuildSchematicsPeriodFromBronze('%$capture/period%'),
    calculate: goldVsSchematicsDashboard('%$capture%'),
    expectedResult: withinSchematicsDashboardBands(),
    timeout: 5400000, logger: 'biLogger,etlLogger'
  })
})
