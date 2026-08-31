// One day of the pipeline, on demand — what the demo's `Next day ▶` button calls, and what the nightly
// gcloudCronEtl runs on a schedule in production. Same ETL, same state record, different trigger.
//
// WHY asOf IS READ FROM A FILE AND NOT Date.now(): every maturity judgement is relative to "now", and a
// dashboard anchored to the wall clock cannot show a historical dataset honestly — a day three months old is
// always "matured", so the maturity warning never fires and a demo can never be replayed. The nightly job
// writes the same `asOf` after each run, so the dashboard reports the PIPELINE's freshness, not the browser's.
//
// WHAT ONE DAY ACTUALLY DOES, and why advancing is not just "append":
//   a new day of clicks lands, immature      -> build asOf+1 at the source default lag
//   the day 21 back finishes settling        -> REBUILD it at lagDays 21, which is what makes revenue final
// Both are real ETL runs over real bronze. Advancing the clock without the rebuild would show a dashboard
// whose old days never settle, which is precisely the failure the maturity rule exists to prevent.

import { dsls, coreUtils, jb } from '@jb6/core'
import '@jb6/common'
import '@wonder/bi/bi-common.js'
import '@wonder/bi/materialization.js'
import '@wonder/db/etl/etl-dsl.js'
import '@wonder/db/room-lambda-client.js'
import './schematics-cdc-cube.js'

const { tgp: { Component }, common: { Lambda, data: { materializeCubePeriod } },
        bi: { cube: { clickoutsCdcCube } }, etl: { etl: { buildCdcGold } },
        test: { logger: { etlLogger } } } = dsls
const { wfetch2 } = jb.wonderUtils
const dayAfter = (d, n = 1) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)

// state + run log live in the room beside the silver, in the shape gcloudCronEtl already writes, so the
// demo's ETL panel and production monitoring read the SAME records.
const readJson = async (wUrl, ctx, fallback) => {
  try { const r = await wfetch2(wUrl, { method: 'GET' }, ctx); return r.ok ? await r.json() : fallback } catch { return fallback }
}
const writeJson = (wUrl, body, ctx) =>
  wfetch2(wUrl, { method: 'PUT', body: JSON.stringify(body, null, 2) }, ctx)

Component('advanceSchematicsDay', {
  moreTypes: 'etl<etl>',
  description: 'move the pipeline clock one day: build the newly-arrived day, re-mature the day that just settled',
  params: [
    { id: 'room', as: 'string', defaultValue: 'signedRoom://schematicsBI' },
    { id: 'scratchDir', as: 'string', defaultValue: '/tmp/schm-advance',
      description: "materializePeriod's scratch. buildSetup defaults it to /dev/shm, which is a LINUX tmpfs and "
        + 'does not exist on macOS — the lambda dies with EPERM mkdir /dev/shm. /tmp exists on both.' },
    { id: 'maturityDays', as: 'number', defaultValue: 21, description: 'a day is final once this many days of payouts have landed' },
    { id: 'buildSilver', type: 'data<common>', dynamic: true, defaultValue: materializeCubePeriod(clickoutsCdcCube(), '%$period%'),
      description: 'invoked per period with %$period% bound, and %$lagDays% set for the matured rebuild' },
    { id: 'buildGold', type: 'data<common>', dynamic: true, defaultValue: buildCdcGold('%$period%'),
      description: 'invoked per period with %$period% bound' }
  ],
  impl: async (ctx, { etlId }, { room, scratchDir, maturityDays, buildSilver, buildGold }) => {
    const log = ctx.vars.etlLogger || etlLogger.$runWithCtx(ctx)
    const stateWUrl = `${room}/usersRO/pipeline-state.json`
    const state = await readJson(stateWUrl, ctx, null)
    if (!state?.asOf) throw new Error(`advanceSchematicsDay: no asOf in ${stateWUrl} — seed it first`)
    const asOf = dayAfter(state.asOf), matured = dayAfter(asOf, -maturityDays)
    log.info({ t: 'advance start', from: state.asOf, to: asOf, matured }, {}, { ctx })

    // the fresh day: source default lag, i.e. deliberately immature — this is what a real nightly run sees
    const t0 = Date.now()
    const fresh = await buildSilver(ctx.setVars({ period: asOf, localDir: `${scratchDir}/${asOf}` }))
    // the settled day: lagDays 21 makes revenue final. materializeCubePeriod, never buildCube — only the
    // former propagates the lag (trap 7.3).
    const settled = await buildSilver(ctx.setVars({ period: matured, lagDays: maturityDays, localDir: `${scratchDir}/${matured}` }))
    // gold for the TWO days whose silver actually changed — never the range between them. A range would
    // demand a silver for every day in it, and a per-period silver raises "No files found" for an unbuilt
    // day rather than returning empty (trap 7.11).
    for (const period of [matured, asOf]) await buildGold(ctx.setVars({ period }))

    const run = { ts: new Date(Date.parse(asOf + 'T00:00:00Z')).toISOString(), asOf, matured,
      freshObjs: fresh?.objs ?? 0, maturedObjs: settled?.objs ?? 0, ms: Date.now() - t0, status: 'ok' }
    await writeJson(`${room}/usersRO/etl-runs/${asOf}.json`, run, ctx)
    await writeJson(stateWUrl, { ...state, asOf, lastRun: run }, ctx)
    log.info({ t: 'advance done', ...run }, {}, { ctx })
    return { ...coreUtils.harvestLogs(ctx), ...run }
  }
})

// The button's server side. The ETL shells out to python3/duckdb, so it can only run where a shell exists —
// never in the browser. permissionByPath 'usersRO' is where it writes, and users.json grants that rw to
// admins only, so a viewer can read the dashboard but cannot move the clock.
Lambda('advanceSchematicsDayLambda', {
  permissionByPath: 'usersRO',
  impl: dsls.etl.etl.advanceSchematicsDay()
})
