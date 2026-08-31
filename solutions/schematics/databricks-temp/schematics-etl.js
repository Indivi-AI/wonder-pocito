// Silver generation for the schematics cubes, as a registered TGP etl — not a loose .sql file.
// `schematicsSilver` is a silver-builder<bi>, so each cube OWNS its materialisation: cube.plan()/cube.build()
// produce the parquet the cube then reads. Same shape as finance3SilverBuilder → finance3Build.
//
//   runTest({testId: 'buildSchematicsSilver'})   rebuilds all three parquets
//
// Bronze today is the schematics Databricks dump, pulled read-only to srcDir:
//   gcloud storage cp gs://schematics-gcs-dump/databricks/<stamp>/wonder_full/bronze/{revenue_clicks,sessions,hourly_smm}.parquet /tmp/schm-bronze/
// When the CDC pipeline lands, only SRC changes — the SQL, cubes and applet stay put.
//
// ALL VERTICALS. `vertical` is a column, never a build-time filter: a dashboard picks its vertical
// with a where-clause. Revenue carries the vertical as a FACT (the offer the client bought); spend has
// no vertical in the Meta feed at all, so it is DERIVED from the ad account — schematics buy media in
// vertical-segregated accounts (PL=Home Equity, BL US=Business Loans, CC US=Credit Cards), measured
// 99.98% pure. See the `vertical` guidance in schematics-cubes.js.

import { dsls, coreUtils } from '@jb6/core'
import '@jb6/common'
import '@wonder/db/etl/etl-dsl.js'

const { tgp: { Component }, test: { logger: { etlLogger } } } = dsls

const SILVER = [
  { name: 'conversions',   file: 'conversions.parquet',    keyField: 'event_id' },
  { name: 'spend',         file: 'spend.parquet',          keyField: 'ad_id' },
  { name: 'adPerformance', file: 'ad-performance.parquet',  keyField: '' }
]

const UNATTRIBUTED = '(unattributed)'

// campaign_name → sub1: bare numeric ids pass through, "Prefix - 12345" splits on the last ' - '
const buildSql = (src, out) => `
SET VARIABLE src = '${src}';
SET VARIABLE out = '${out}';
CREATE OR REPLACE MACRO to_sub1(campaign_name) AS
  CASE WHEN campaign_name LIKE '% - %' THEN trim(split_part(campaign_name, ' - ', -1)) ELSE campaign_name END;

CREATE VIEW smm AS SELECT * FROM read_parquet(getvariable('src') || '/hourly_smm.parquet');
CREATE VIEW rc  AS SELECT * FROM read_parquet(getvariable('src') || '/revenue_clicks.parquet');
CREATE VIEW se  AS SELECT * FROM read_parquet(getvariable('src') || '/sessions.parquet');

-- one account per campaign; a campaign renamed across accounts keeps its highest-spend owner
CREATE TABLE campaign_account AS
  SELECT sub1, arg_max(account_name, spend) account_name
  FROM (SELECT to_sub1(campaign_name) sub1, account_name, sum(spend) spend FROM smm GROUP BY 1, 2) GROUP BY 1;

-- account → vertical. The Meta feed has no vertical column, so it is inferred from where the account's
-- own traffic actually converted. Accounts are vertical-segregated by schematics' own naming, which is
-- why this lands at 99.98% purity and why an account keeps its vertical even on a campaign that never sold.
CREATE TABLE account_vertical AS
  WITH cv AS (
    SELECT ca.account_name, rc.vertical, count(*) n
    FROM rc JOIN se USING (session_id) JOIN campaign_account ca ON ca.sub1 = se.sub1
    WHERE rc.vertical IS NOT NULL GROUP BY 1, 2)
  SELECT account_name, arg_max(vertical, n) vertical FROM cv GROUP BY 1;

COPY (
  SELECT s.* EXCLUDE (spend), s.spend spend_amount, to_sub1(s.campaign_name) sub1, s.adset_name sub2, s.ad_name sub3,
         coalesce(av.vertical, '${UNATTRIBUTED}') vertical
  FROM smm s LEFT JOIN account_vertical av USING (account_name)
) TO (getvariable('out') || '/spend.parquet') (FORMAT PARQUET, COMPRESSION ZSTD);

-- Both verticals ride on every clickout: the vertical column is what the client actually bought, account_vertical
-- is what the media buyer was aiming at. They agree 98.8% of the time and the gap is worth being able to see,
-- so it is materialised here rather than re-derived by a join every time the gold is built.
COPY (
  SELECT rc.event_id, rc.session_id, rc.client_id::bigint client_id, rc.client_name, rc.offer_id, rc.vertical,
         coalesce(av.vertical, '${UNATTRIBUTED}') account_vertical,
         rc.is_converted::int is_lead, (rc.disposition = 'Sale')::int is_sale,
         rc.disposition, rc.disposition_source, rc.payout payout_amount,
         rc.revenue revenue_amount, rc.estimated estimated_amount, try_cast(rc.bid_price AS DOUBLE) bid_amount,
         rc.session_dt session_time, rc.conversion_dt conversion_time,
         se.sub1, se.sub2, se.sub3, ca.account_name,
         se.page, se.form_id, se.variant_id, se.auto_state, se.auto_country, se.device_type, se.browser, se.os
  FROM rc
  LEFT JOIN se USING (session_id)
  LEFT JOIN campaign_account ca ON ca.sub1 = se.sub1
  LEFT JOIN account_vertical av ON av.account_name = ca.account_name
) TO (getvariable('out') || '/conversions.parquet') (FORMAT PARQUET, COMPRESSION ZSTD);

-- gold: (session_date, vertical, account, campaign, adset, ad) with revenue AND spend on one row, so
-- profit / ROI / CPL are cube metrics rather than applet SQL. the vertical here is the ACCOUNT's vertical on
-- BOTH sides — a campaign's spend and the revenue it earned must land in the same bucket or the full join
-- splits and ROI breaks. Revenue's own per-clickout vertical stays a fact in the conversions cube.
CREATE VIEW conv AS SELECT * FROM read_parquet(getvariable('out') || '/conversions.parquet');
CREATE VIEW spd  AS SELECT * FROM read_parquet(getvariable('out') || '/spend.parquet');

COPY (
  WITH rev AS (
    SELECT session_time::date AS session_date, account_vertical AS vertical,
           coalesce(account_name, '${UNATTRIBUTED}') AS account_name,
           coalesce(sub1, '—') AS sub1, coalesce(sub2, '—') AS sub2, coalesce(sub3, '—') AS sub3,
           sum(revenue_amount) AS revenue_amount, sum(estimated_amount) AS estimated_amount,
           count(*) AS clickout_count, sum(is_lead) AS lead_count, sum(is_sale) AS sale_count,
           sum(is_lead) FILTER (client_name='amerisave') AS amerisave_lead_count,
           sum(is_sale) FILTER (client_name='amerisave') AS amerisave_sale_count,
           sum(is_lead) FILTER (client_name='unison')    AS unison_lead_count,
           sum(is_sale) FILTER (client_name='unison')    AS unison_sale_count,
           sum(is_lead) FILTER (client_name='splitero')  AS splitero_lead_count,
           sum(is_sale) FILTER (client_name='splitero')  AS splitero_sale_count
    FROM conv
    GROUP BY 1,2,3,4,5,6),
  cost AS (
    SELECT dt::date AS session_date, vertical, coalesce(account_name, '${UNATTRIBUTED}') AS account_name,
           coalesce(sub1, '—') AS sub1, coalesce(sub2, '—') AS sub2, coalesce(sub3, '—') AS sub3,
           sum(spend_amount) AS spend_amount, sum(impressions) AS impression_count, sum(clicks) AS link_click_count
    FROM spd GROUP BY 1,2,3,4,5,6)
  SELECT coalesce(rev.session_date, cost.session_date) AS session_date,
         coalesce(rev.vertical, cost.vertical) AS vertical,
         coalesce(rev.account_name, cost.account_name) AS account_name, coalesce(rev.sub1, cost.sub1) AS sub1,
         coalesce(rev.sub2, cost.sub2) AS sub2, coalesce(rev.sub3, cost.sub3) AS sub3,
         coalesce(revenue_amount,0) AS revenue_amount, coalesce(estimated_amount,0) AS estimated_amount,
         coalesce(spend_amount,0) AS spend_amount,
         coalesce(revenue_amount,0) - coalesce(spend_amount,0) AS profit_amount,
         coalesce(clickout_count,0) AS clickout_count, coalesce(lead_count,0) AS lead_count,
         coalesce(sale_count,0) AS sale_count,
         coalesce(impression_count,0) AS impression_count, coalesce(link_click_count,0) AS link_click_count,
         coalesce(amerisave_lead_count,0) AS amerisave_lead_count, coalesce(amerisave_sale_count,0) AS amerisave_sale_count,
         coalesce(unison_lead_count,0) AS unison_lead_count, coalesce(unison_sale_count,0) AS unison_sale_count,
         coalesce(splitero_lead_count,0) AS splitero_lead_count, coalesce(splitero_sale_count,0) AS splitero_sale_count
  FROM rev FULL JOIN cost USING (session_date, vertical, account_name, sub1, sub2, sub3)
) TO (getvariable('out') || '/ad-performance.parquet') (FORMAT PARQUET, COMPRESSION ZSTD);

SELECT 'adPerformance' tbl, count(*) n_rows, count(DISTINCT vertical) verticals, round(sum(revenue_amount)) revenue,
       round(sum(spend_amount)) spend, sum(lead_count) leads, sum(sale_count) sales
  FROM read_parquet(getvariable('out') || '/ad-performance.parquet');`

Component('buildSchematicsSilver', {
  moreTypes: 'etl<etl>',
  description: 'bronze parquet → the three schematics silver parquets (conversions, spend, adPerformance), all verticals',
  params: [
    {id: 'srcDir', as: 'string', defaultValue: '/tmp/schm-bronze', description: 'local mirror of the schematics Databricks bronze dump'},
    {id: 'outDir', as: 'string', defaultValue: 'files/rooms/schematicsBI/usersRO/silver'}
  ],
  impl: async (_ctx, { etlId }, { srcDir, outDir }) => {
    const ctx = _ctx.setVars({ etlId: etlId || 'buildSchematicsSilver' })
    const log = _ctx.vars.etlLogger || etlLogger.$runWithCtx(_ctx)
    log.info({ t: 'buildSchematicsSilver start', srcDir, outDir }, {}, { ctx })
    // heredoc, not `duckdb -c "<sql>"`: the script is multi-line and full of quotes, and a JSON-stringified
    // argument reaches duckdb with literal \n in it.
    const r = await coreUtils.runBashScript(
      `mkdir -p '${outDir}' && duckdb <<'__SQL_EOF__'\n${buildSql(srcDir, outDir)}\n__SQL_EOF__`)
    const out = String(r.stdout ?? '')
    if (!/adPerformance/.test(out)) {
      log.error({ t: 'buildSchematicsSilver failed', stderr: r.stderr, stdout: out.slice(0, 400) }, {}, { ctx })
      throw new Error(r.stderr || 'duckdb build produced no adPerformance summary')
    }
    log.info({ t: 'buildSchematicsSilver complete', summary: out.trim().split('\n').slice(-4).join(' ') }, {}, { ctx })
    return { ...coreUtils.harvestLogs(ctx), built: SILVER.map(s => s.file) }
  }
})

// One silver-builder per cube. All three delegate build() to the same etl because the gold is derived
// from the other two — rebuilding one in isolation would let them drift out of sync.
Component('schematicsSilver', {
  type: 'silver-builder<bi>',
  description: "the schematics silver a cube owns; `which` picks which parquet this cube reads",
  params: [
    {id: 'which', as: 'string', options: 'conversions,spend,adPerformance', mandatory: true},
    {id: 'wUrlBase', as: 'string', defaultValue: 'room://schematicsBI/usersRO/silver'}
  ],
  impl: (_, {}, { which, wUrlBase }) => {
    const spec = SILVER.find(s => s.name === which)
    if (!spec) throw new Error(`schematicsSilver: unknown silver '${which}'`)
    const wUrlPattern = `${wUrlBase}/${spec.file}`
    return {
      sourceType: 'full', name: spec.name, keyField: spec.keyField, periodPattern: 'YYYY-MM-DD',
      parquetFiles: [{ name: spec.name, wUrlPattern, version: 1 }],
      // skip:true — the silver already exists; a QUERY must never trigger a build (the browser realm has no
      // shell). Building is an explicit operation: runTest({testId:'buildSchematicsSilver'}).
      plan: async () => ({ sourceType: 'full', parquetFiles: [{ name: spec.name, wUrlPattern, version: 1 }],
        skip: true, reason: 'pre-built silver — run buildSchematicsSilver to refresh' }),
      build: (ctx, plan) => dsls.etl.etl.buildSchematicsSilver.$runWithCtx(ctx, plan || {}),
      async materializePeriod(_ctx, period) { return { period, objs: 0, bytes: 0, parquet: null, outUrl: wUrlPattern } },
      async resolveKey() { throw new Error(`schematicsSilver ${which}: no drill (silver is pre-aggregated)`) },
      getSourceEvents() { throw new Error(`schematicsSilver ${which}: not event-based`) },
      async materialize() { throw new Error(`schematicsSilver ${which}: not event-based`) }
    }
  }
})
