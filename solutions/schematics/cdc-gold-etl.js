// buildCdcGold — CDC clickouts joined to Meta spend at ad-day grain, so profit and ROI become cube metrics.
//
// WHY A SEPARATE GRAIN: spend is charged per ad per hour, revenue is earned per clickout. Putting spend on a
// clickout row would multiply it by the number of clickouts that ad produced. The only sound place for the two
// to meet is a row that is neither — one row per (day, campaign, ad-set, ad) — which is exactly what makes
// profit additive and therefore correct when it rolls up.
//
//   runTest({testId: 'buildCdcGold'})
//
// THE JOIN KEY IS THE AD HIERARCHY, NOT THE VERTICAL. A campaign can serve more than one vertical; if vertical
// were part of the key the same spend would land on several rows. So a row is one ad-day, and its vertical is
// the most frequent vertical among that ad's clickouts. clickoutsCdcCube stays authoritative for what each
// individual clickout was actually sold as.

import { dsls, coreUtils, jb } from '@jb6/core'
import '@jb6/common'
import '@wonder/bi/bi-common.js'   // jb.biUtils.expandPeriods — the same range spec the cube's queryPeriod takes
import '@wonder/db/etl/etl-dsl.js'

const { tgp: { Component }, test: { logger: { etlLogger } } } = dsls
const { wfetch2 } = jb.wonderUtils

// duckdb cannot read a protected room directly (no credentials — a bare gs:// read 403s), and COPY TO a bucket
// is worse. So the inputs are pulled to a local scratch dir, duckdb works on plain files, and the output is PUT
// back through the same wUrl the cube reads. Identical under Var('db','fs') and server-side db:'gcs' — which is
// the whole point: the advance's two halves (silver, gold) now follow the SAME store instead of diverging.
const pull = async (wUrl, local, ctx) => {
  const res = await wfetch2(wUrl, { method: 'GET' }, ctx)
  if (!res.ok) throw new Error(`buildCdcGold: cannot read ${wUrl} (${res.status})`)
  const { promises: fsp } = await import('fs')
  await fsp.writeFile(local, Buffer.from(await res.arrayBuffer()))
  return local
}

const UNATTRIBUTED = '(unattributed)'

// The buyer breakout is generated from Const('helocClients') rather than typed out, so adding a fourth buyer
// is one profile edit. Read at CALL time, not module load: this file is imported BY the file that registers
// the Const, so at module scope it does not exist yet.
const goldSql = (dir, period) => {
  const clients = jb.coreRegistry.consts.helocClients.map(([id]) => id)
  const tally = f => clients.map(c =>
    `sum(coalesce(${f}, 0)) FILTER (client_name='${c}') AS ${c}_${f.slice(3)}_count`).join(',\n           ')
  const carry = f => clients.map(c =>
    `coalesce(rev.${c}_${f.slice(3)}_count, 0) AS ${c}_${f.slice(3)}_count`).join(',\n         ')
  return `
SET VARIABLE dir = '${dir}';
SET VARIABLE period = '${period}';
CREATE VIEW clk AS SELECT * FROM read_parquet(getvariable('dir') || '/clickouts-cdc-' || getvariable('period') || '.parquet');
CREATE VIEW spd AS SELECT * FROM read_parquet(getvariable('dir') || '/spend.parquet');

-- a campaign keeps its highest-spend owner across ALL history, so an ad-day with revenue but no spend that
-- day still resolves an account instead of falling into (unattributed)
CREATE TABLE campaign_account AS
  SELECT sub1, arg_max(account_name, s) account_name
  FROM (SELECT sub1, account_name, sum(spend_amount) s FROM spd GROUP BY 1, 2) GROUP BY 1;

COPY (
  WITH rev AS (
    SELECT coalesce(sub1, '—') AS sub1, coalesce(sub2, '—') AS sub2, coalesce(sub3, '—') AS sub3,
           -- mode(), not arg_max(vertical, 1): ordering by a constant returns an ARBITRARY row's vertical,
           -- which happened to agree with the true winner on every multi-vertical ad measured but is not the
           -- same statement. 6 ad-days on 2026-05-15 serve more than one vertical.
           mode(vertical) AS vertical,
           sum(coalesce(revenue_amount, 0)) AS revenue_amount,
           count(*) AS clickout_count, sum(coalesce(is_lead, 0)) AS lead_count,
           sum(coalesce(is_sale, 0)) AS sale_count,
           ${tally('is_lead')},
           ${tally('is_sale')}
    FROM clk WHERE valid = 1 GROUP BY 1, 2, 3),
  cost AS (
    SELECT coalesce(sub1, '—') AS sub1, coalesce(sub2, '—') AS sub2, coalesce(sub3, '—') AS sub3,
           arg_max(vertical, spend_amount) AS vertical, arg_max(account_name, spend_amount) AS account_name,
           sum(spend_amount) AS spend_amount, sum(impressions) AS impression_count,
           sum(inline_link_clicks) AS link_click_count
    -- AT TIME ZONE 'UTC', not a bare dt::date: spd.dt is a TIMESTAMPTZ, so dt::date resolves in the SESSION
    -- timezone and the same query returned $121,172 on a machine in Asia/Jerusalem against $119,192 under UTC.
    -- Revenue is bucketed on the UTC click day, so spend must be too, or one gold row carries two different day
    -- boundaries and the total depends on where the build ran. Stated in the expression rather than as a SET so
    -- it travels with the query wherever it is copied.
    FROM spd WHERE (dt AT TIME ZONE 'UTC')::date = getvariable('period')::date GROUP BY 1, 2, 3)
  SELECT getvariable('period')::date AS click_date,
         coalesce(rev.sub1, cost.sub1) AS sub1, coalesce(rev.sub2, cost.sub2) AS sub2,
         coalesce(rev.sub3, cost.sub3) AS sub3,
         coalesce(rev.vertical, cost.vertical, '${UNATTRIBUTED}') AS vertical,
         coalesce(cost.account_name, ca.account_name, '${UNATTRIBUTED}') AS account_name,
         coalesce(rev.revenue_amount, 0) AS revenue_amount,
         coalesce(cost.spend_amount, 0) AS spend_amount,
         coalesce(rev.revenue_amount, 0) - coalesce(cost.spend_amount, 0) AS profit_amount,
         coalesce(rev.clickout_count, 0) AS clickout_count, coalesce(rev.lead_count, 0) AS lead_count,
         coalesce(rev.sale_count, 0) AS sale_count,
         coalesce(cost.impression_count, 0) AS impression_count,
         coalesce(cost.link_click_count, 0) AS link_click_count,
         ${carry('is_lead')},
         ${carry('is_sale')}
  FROM rev FULL JOIN cost USING (sub1, sub2, sub3)
  LEFT JOIN campaign_account ca ON ca.sub1 = coalesce(rev.sub1, cost.sub1)
) TO (getvariable('dir') || '/cdc-ad-performance-' || getvariable('period') || '.parquet') (FORMAT PARQUET, COMPRESSION ZSTD);

SELECT 'cdcGold' tbl, count(*) n_rows, count(DISTINCT vertical) verticals,
       round(sum(revenue_amount)) revenue, round(sum(spend_amount)) spend, sum(lead_count) leads,
       sum(sale_count) sales
  FROM read_parquet(getvariable('dir') || '/cdc-ad-performance-' || getvariable('period') || '.parquet');`
}

Component('buildCdcGold', {
  moreTypes: 'etl<etl>',
  description: 'CDC clickout silver + Meta spend → one ad-day gold parquet, so profit/ROI are cube metrics',
  params: [
    { id: 'period', as: 'string', mandatory: true,
      description: 'YYYY-MM-DD, or an inclusive from..to range. A per-period silver can only answer for days ' +
      'that were built, and a dashboard date range routinely spans a week — so backfilling is a first-class ' +
      'operation here, not something the caller loops over' },
    { id: 'room', as: 'string', defaultValue: 'signedRoom://schematicsBI/usersRO/silver',
      description: 'wUrl base the silver is read from and the gold written to — the SAME store the cube queries' },
    { id: 'localDir', as: 'string', defaultValue: '/tmp/cdc-gold', description: 'scratch for the duckdb inputs/outputs' }
  ],
  impl: async (_ctx, { etlId }, { period, room, localDir }) => {
    const ctx = _ctx.setVars({ etlId: etlId || 'buildCdcGold' })
    const log = _ctx.vars.etlLogger || etlLogger.$runWithCtx(_ctx)
    const days = jb.biUtils.expandPeriods(period, 'YYYY-MM-DD')
    const { promises: fsp } = await import('fs')
    await fsp.mkdir(localDir, { recursive: true })
    log.info({ t: 'buildCdcGold start', period, days: days.length, room, localDir }, {}, { ctx })
    // spend is whole-history and day-independent — pull once, not per day
    await pull(`${room}/spend.parquet`, `${localDir}/spend.parquet`, ctx)
    const built = []
    for (const day of days) {
      await pull(`${room}/clickouts-cdc-${day}.parquet`, `${localDir}/clickouts-cdc-${day}.parquet`, ctx)
      const r = await coreUtils.runBashScript(`duckdb <<'__SQL_EOF__'\n${goldSql(localDir, day)}\n__SQL_EOF__`)
      const out = String(r.stdout ?? '')
      if (!/cdcGold/.test(out)) {
        log.error({ t: 'buildCdcGold failed', day, stderr: r.stderr, stdout: out.slice(0, 400) }, {}, { ctx })
        throw new Error(r.stderr || `buildCdcGold produced no summary for ${day}`)
      }
      const outFile = `${localDir}/cdc-ad-performance-${day}.parquet`
      const put = await wfetch2(`${room}/cdc-ad-performance-${day}.parquet`,
        { method: 'PUT', body: outFile, headers: { 'x-wonder-body': 'localFile' } }, ctx)
      if (!put.ok) throw new Error(`buildCdcGold: upload failed for ${day} (${put.status})`)
      built.push(`cdc-ad-performance-${day}.parquet`)
      log.info({ t: 'buildCdcGold day done', day, summary: out.trim().split('\n').slice(-2).join(' ') }, {}, { ctx })
    }
    log.info({ t: 'buildCdcGold complete', period, days: built.length }, {}, { ctx })
    return { ...coreUtils.harvestLogs(ctx), period, days: built.length, built }
  }
})
