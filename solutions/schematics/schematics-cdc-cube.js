// clickoutsCdcCube — the clickout silver rebuilt from raw CDC instead of the Databricks dump.
// Same grain as conversionsCube (one clickout), but sourced from gs://schematics-gcs-dump directly, which runs
// to within ~2 days instead of freezing at 2026-06-03.
//
// VERIFIED against the dump for 2026-05-15: 99.98% of its 28,492 rows reconstruct from this one table, with
// 6 unresolved. Per-click revenue is exact on 99.7% of them once the ledger is joined.
//
// WHY LATEST-WINS IS THE WHOLE POINT: a clickout is written ~3 times (INSERT, then UPDATEs as the client
// responds), so every non-key column has to come from the LAST version. It no longer moves revenue — that is
// joined from the ledger on the CDC primary key, which is constant across versions — but it decides
// conversion, sub1/2/3 and the offer, and a reader that merely concatenates the avro gets the first of each.
//
//   runTest({testId: 'clickoutsCdc.rebuildsTheDump'})

import { dsls, jb } from '@jb6/core'
import '@jb6/common'
import '@wonder/bi/bi-common.js'
import '@wonder/bi/materialization.js'
import './cdc-event-source.js'
import './cdc-reference-etl.js'   // registers buildCdcReference — writes the ref-offers/ref-clients parquets
import './cdc-gold-etl.js'        // registers buildCdcGold (etl<etl>)

const {
  tgp: { Const },
  bi: {
    Cube, SilverBuilder,
    cube: { cube },
    'silver-builder': { materializeFromEvents, parquetSource },
    'event-source': { avroCdcSource },
    'field-reducer': { pick, withReduceFunc, enrichFromLookup },
    lookup: { lookupByQuery },
    pick: { last, count },
    dimension: { dimension },
    metric: { metric, ratio },
    'parquet-file': { projection },
    validation: { validation }
  },
  common: { boolean: { notNull, equals }, data: { obj }, prop: { prop } }
} = dsls

// signedRoom, not room: the silver carries per-clickout revenue and buyer detail, so it must not be world-readable.
// Under Var('db','fs') this mirrors to files/rooms/schematicsBI/...; through the server it resolves to a short-lived
// signed URL. ONE line to move the whole pipeline to another room.
const ROOM = 'signedRoom://schematicsBI'
const WURL = ROOM + '/usersRO/silver/clickouts-cdc-${period}.parquet'

// The domain facts a non-technical implementor changes: which vertical the HELOC dashboard is about, which
// buyers it breaks out, and the two dates that bound what any ROI number there can mean. They live on the
// registry rather than in the applet because the applet is layout — the moment a fourth buyer is added, that
// should be a profile edit and not a JavaScript one.
Const('helocVertical', 'Home Equity Loans')
Const('helocClients', [['amerisave', 'Amerisave'], ['unison', 'Unison'], ['splitero', 'Splitero']])
Const('adHierarchy', ['account_name', 'sub1', 'sub2', 'sub3'])
// the fb-connector horizon: past this date revenue exists and spend does not, so ROI reads as infinite
Const('spendHorizon', '2026-06-04')
// below this age a day's revenue is still arriving and must not be compared against a matured one
Const('maturityDays', 21)

// The dump keys the same clickout two ways, so the silver carries both and neither is guessed at query time:
// a click with a uniqueTrackId is keyed upper(uniqueTrackId)_offerId, otherwise by clickId. Reconstructing this
// is what closed the last gap — 82% of rows use the first form, but the other 18% carry 87% of the revenue.
const clickoutsCdcSilver = SilverBuilder('clickoutsCdcSilver', {
  impl: materializeFromEvents({
    eventSource: avroCdcSource({ table: 'links_tracking_clicks', primaryKey: 'id', dateField: 'dt', lagDays: 2 }),
    keyField: 'id',
    periodGranularity: 'daily',
    periodPattern: 'YYYY-MM-DD',
    // BUILD-phase broadcast: the offer catalogue, pre-joined to clients, loaded once into a Map. One lookup
    // rather than two because vertical and client_name are always wanted together and enrichFromLookup cannot
    // chain a second hop — the join belongs in SQL, where it is stated once and read by every row.
    buildLookups: [
      lookupByQuery('offers', `SELECT l.offerId, l.name AS offer_name,
          CASE WHEN l.category = 'Purchase Mortgages' THEN 'Purchase Mortgage'
               WHEN l.category = 'SMB' THEN 'SMB Insurance'
               ELSE l.category END AS vertical,
          c.company AS client_name
        FROM read_parquet('${ROOM}/usersRO/silver/ref-offers.parquet') l
        LEFT JOIN read_parquet('${ROOM}/usersRO/silver/ref-clients.parquet') c
          ON CAST(c.id AS VARCHAR) = CAST(l.client_id AS VARCHAR)
        WHERE NOT l.is_deleted`, ['offerId']),
      // THE SETTLEMENT LEDGER, with the revision rule stated where it is READ rather than buried in a build
      // script. Several rows on one (clickId, offerId) are restatements of one payment and collapse to their
      // max; rows on different offers are separate payments and sum. Measured against the Databricks dump,
      // that reproduces 27,572 of 27,585 clickouts exactly, where the click's own payout field manages 6.7%.
      // TRY_CAST because Datastream ships MySQL DECIMAL as a string.
      lookupByQuery('payouts', `SELECT clickId AS click_id,
          sum(offer_payout) AS ledger_revenue_amount,
          max(offer_is_sale) AS is_sale,
          arg_max(offer_disposition, offer_payout) AS disposition
        FROM (SELECT clickId, offerId,
                max(TRY_CAST(payout AS DOUBLE)) AS offer_payout,
                arg_max(disposition, TRY_CAST(payout AS DOUBLE)) AS offer_disposition,
                max(CASE WHEN disposition = 'Sale' THEN 1 ELSE 0 END) AS offer_is_sale
              FROM read_parquet('${ROOM}/usersRO/silver/ref-payouts.parquet')
              WHERE NOT is_deleted GROUP BY 1, 2)
        GROUP BY 1`, ['click_id'])
    ],
    fields: [
      // take: last() over events the source pre-ordered by binlog position — this IS the CDC merge
      pick('id as click_id, after.clickId as click_uuid, after.uniqueTrackId as unique_track_id', { take: last() }),
      pick('after.offerId as offer_id, after.dt as click_time', { take: last() }),
      pick('after.conversion as is_lead', { take: last() }),
      pick('after.sub1 as sub1, after.sub2 as sub2, after.sub3 as sub3', { take: last() }),
      pick('after.utm_source as utm_source', { take: last() }),
      pick('after.device_type as device_type, after.state as auto_state, after.country as auto_country', { take: last() }),
      // the row is deleted if its LAST change record is a tombstone — validations read the obj, not the events,
      // so this has to be picked onto the object or not_deleted fails every row for the wrong reason
      pick('is_deleted', { take: last() }),
      // provenance: how many change records collapsed into this row. A row with 1 is an INSERT nothing updated;
      // a row with 5 was rewritten four times. Keeping it makes the merge auditable instead of invisible.
      pick('id as cdc_versions', { take: count() }),
      // what the clickout was SOLD as. enrichFromLookup keys off the raw event — specifically events[0], the
      // OLDEST version — while offer_id beside it is picked with last(). They agree only because offerId is
      // never rewritten (measured: 0 of 27,594 clickouts on 2026-05-15 change it). Nothing enforces that.
      enrichFromLookup('vertical', 'offers[after.offerId]/vertical'),
      enrichFromLookup('client_name', 'offers[after.offerId]/client_name'),
      enrichFromLookup('offer_name', 'offers[after.offerId]/offer_name'),
      // REVENUE IS THE LEDGER, not the click. links_tracking_payouts is where a payment is actually settled;
      // several rows on one (click, offer) are revisions and collapse to their max, rows on different offers
      // are separate payments and sum — the lookup SQL below does both, so one number arrives here.
      enrichFromLookup('revenue_amount', 'payouts[id]/ledger_revenue_amount'),
      // disposition rides on the settlement row, which is the only place a Sale is ever recorded
      enrichFromLookup('disposition', 'payouts[id]/disposition'),
      enrichFromLookup('is_sale', 'payouts[id]/is_sale'),
      // is_lead arrives from Datastream as a STRING, so the jsonl->parquet COPY infers its type from whatever
      // rows land first: a rebuild of the same day types it VARCHAR one time and BIGINT the next, sum() then
      // returns a string, and lead counts wobble between builds. Any new numeric CDC column needs this too.
      withReduceFunc(obj(prop('is_lead', '%is_lead%', 'number')))
    ],
    // a tombstone must be VISIBLE, not silently filtered — a delete storm should look like a delete storm
    validations: [
      validation('not_deleted', equals(false, '%is_deleted%')),
      validation('has_offer', notNull('%offer_id%'))
    ],
    parquetFiles: [projection('clickoutsCdc', WURL, { fields: '*' })]
  })
})

Cube('clickoutsCdcCube', {
  impl: cube({
    source: clickoutsCdcSilver(),
    dimensions: [
      dimension('vertical', {
        guidance: 'the product category the clickout was sold into — Home Equity Loans, Auto Insurance, Business Loans… ' +
        'Resolved from the offer catalogue at build time, so it is a FACT about the offer, not an attribution'
      }),
      dimension('client_name', { guidance: 'the buyer — amerisave, unison, splitero, mediaalpha…', parent: 'vertical' }),
      dimension('offer_id', { guidance: 'the specific offer within a client; a client runs several', parent: 'client_name' }),
      dimension('offer_name', { guidance: 'human label for the offer, e.g. "BorrowBetter - Debt - Aug 2026"', parent: 'offer_id' }),
      dimension('sub1', { guidance: 'Meta campaign id, carried BY THE CLICKOUT ITSELF — 100% populated, so no sessions table is needed to attribute spend' }),
      dimension('sub2', { guidance: 'Meta ad-set', parent: 'sub1' }),
      dimension('sub3', { guidance: 'Meta ad id — unbounded, filter rather than group', parent: 'sub2' }),
      dimension('click_time', { type: 'timestamp', guidance: 'when the card was clicked, in UTC. NOT the session start, and NOT the payout time' }),
      dimension('utm_source'), dimension('device_type'),
      dimension('auto_state', { parent: 'auto_country' }), dimension('auto_country'),
      dimension('disposition', {
        guidance: 'what the buyer ultimately did with the lead, from the settlement row — Sale, Lead, ' +
        'INELIGIBLE, Underwriting… Only some clients report it, so a null disposition means UNREPORTED, ' +
        'never "not a sale"'
      })
    ],
    metrics: [
      metric('clickouts', 'count', 'card clicks handed to a client'),
      metric('leads', 'sum(is_lead)', 'clickouts the client accepted and paid for'),
      metric('revenue', 'sum(revenue_amount)', 'settled payout from the links_tracking_payouts ledger', { unit: '$' }),
      metric('sales', 'sum(is_sale)', 'leads the buyer closed — dispositioned Sale on the settlement row'),
      ratio('lead_rate_pct', 'leads/clickouts', { description: 'share of clickouts a client accepted' }),
      ratio('lead_to_sale_pct', 'sales/leads', {
        description: 'L2S — share of accepted leads the buyer closed. Only meaningful for clients that report ' +
        'disposition at all; for the rest it reads 0 because nothing was reported, not because nothing closed'
      }),
      ratio('rev_per_clickout', 'revenue/clickouts', { scale: 1, unit: '$' }),
      ratio('rev_per_lead', 'revenue/leads', { scale: 1, unit: '$' })
    ],
    limits: [
      'REVENUE GROWS AFTER THE FACT: a payout is written days after the click, so a period built with a narrow ' +
      'window understates it. MEASURED on HELOC 2026-05-15 against the dump\'s own +03 day (403 leads): ours ' +
      'reads ~399 at lagDays=2 and ~406 at 21. Rebuild a matured period with Var("lagDays", 21) before quoting ' +
      'revenue, and never compare a fresh day against a matured one',
      'REVENUE IS THE LEDGER (links_tracking_payouts), never the click row. Several payout rows on one ' +
      '(click, offer) are REVISIONS and collapse to their max; rows on different offers are separate payments ' +
      'and sum. MEASURED against the dump over its own +03 day, 28,425 clickouts reconciled by key: the ledger ' +
      'is exact on 99.70% of them and the click row on 98.21%. Restricted to the 2,335 clickouts that actually ' +
      'EARNED, which is where the difference lives, that is 96.45% against 78.42%',
      'THE RESIDUAL IS 13 CLICKOUTS, and it is a per-offer question rather than a merge question. Offer 90267 ' +
      'settles $100 on the ledger while the dump books $20; offer 18059 settles $300 while the dump books $0. Each ' +
      'has exactly ONE payout row, so no multi-row rule reaches them — something downstream rewrites those two ' +
      'offers. Worth $1,480 on the day — 1.55% of the day\'s revenue. Ask schematics before modelling it',
      'a null disposition means the buyer never REPORTED one, not that the lead failed to close. sales and ' +
      'lead_to_sale_pct are floors for any client that does not report, so comparing L2S across clients ' +
      'compares reporting habits as much as performance',
      'a clickout with no ledger row has revenue null, not zero. That is the honest reading — nothing was ' +
      'settled — but it means count(*) and count(revenue_amount) differ, and an average over the wrong one lies',
      'click_time is UTC and is the CLICK, not the session start. The Databricks dump buckets by session_dt in +03, ' +
      'so a day here is not the same set of rows as a day there — reconcile by key, never by date',
      'vertical and client_name come from the offer catalogue as it stands TODAY, not as it stood on the click ' +
      'day. An offer recategorised since then is reported under its new vertical — history is rewritten by ' +
      'design, because the catalogue only keeps current state. Small in practice, wrong to ignore in an audit',
      'an offer the catalogue has never seen yields vertical=null. Those clickouts are not a vertical of their ' +
      'own and a "where vertical = ..." filter silently drops them — count them before trusting a total',
      'the catalogue AND the ledger are both rebuilt WHOLESALE by buildCdcReference, not ' +
      'per period. Whatever appeared after the last rebuild resolves to null until you re-run them',
      'no spend. Profit and ROI need the Meta feed, which is a different source entirely',
      'rows carry valid=0 when the CDC row was a delete or has no offer. Filter on valid=1 for business numbers, ' +
      'but LOOK at the invalid ones first — a spike there is a pipeline failure, not noise',
      'cdc_versions is a COLUMN, not a metric, on purpose: it measures how hard the merge worked and belongs ' +
      'in a health check. Query it directly if you are auditing the merge; it is not business vocabulary'
    ]
  })
})

// GOLD — revenue and spend on ONE row, so profit/ROI/CPL are cube vocabulary rather than caller arithmetic.
// Built by buildCdcGold; grain is one ad-day. See cdc-gold-etl.js for why vertical is not part of the join key.
Cube('cdcAdPerformanceCube', {
  impl: cube({
    source: parquetSource(ROOM + '/usersRO/silver/cdc-ad-performance-${period}.parquet', 'cdcAdPerformance'),
    dimensions: [
      dimension('vertical', {
        guidance: 'the DOMINANT vertical of this ad\'s clickouts. Filter here first — a total across verticals ' +
        'mixes Home Equity Loans with Auto Insurance and means nothing'
      }),
      dimension('account_name', { guidance: 'Meta ad account; accounts are vertical-segregated' }),
      dimension('sub1', { guidance: 'Meta campaign id — the key spend and revenue actually meet on', parent: 'account_name' }),
      dimension('sub2', { guidance: 'Meta ad-set', parent: 'sub1' }),
      dimension('sub3', { guidance: 'Meta ad id — unbounded, filter or top-N rather than group blindly', parent: 'sub2' }),
      dimension('click_date', { type: 'timestamp', guidance: 'the UTC day of the click; the only date axis here' })
    ],
    metrics: [
      metric('revenue', 'sum(revenue_amount)', 'settled ledger payout for clickouts of that day', { unit: '$' }),
      metric('spend', 'sum(spend_amount)', 'Meta media cost for that ad-day', { unit: '$' }),
      metric('profit', 'sum(profit_amount)', 'revenue minus spend; additive, so it rolls up correctly', { unit: '$' }),
      metric('clickouts', 'sum(clickout_count)', 'card clicks handed to a client'),
      metric('leads', 'sum(lead_count)', 'clickouts a client accepted and paid for'),
      metric('impressions', 'sum(impression_count)'),
      metric('link_clicks', 'sum(link_click_count)', 'Meta-reported outbound clicks; never equals our clickouts'),
      ratio('roi_pct', 'revenue/spend', { description: 'revenue as a percent of spend; 100% is break-even, not zero' }),
      ratio('cost_per_clickout', 'spend/clickouts', { scale: 1, unit: '$', description: 'media cost per card click' }),
      ratio('cpl', 'spend/leads', { scale: 1, unit: '$', description: 'cost per lead — media cost per accepted lead' }),
      ratio('rev_per_lead', 'revenue/leads', { scale: 1, unit: '$' }),
      ratio('lead_rate_pct', 'leads/clickouts', { description: 'share of clickouts a client accepted' }),
      metric('sales', 'sum(sale_count)', 'leads the buyer closed, from the settlement row\'s disposition'),
      ratio('lead_to_sale_pct', 'sales/leads', {
        description: 'L2S — share of accepted leads that closed. A client that never reports disposition reads ' +
        '0 here, which is unreported rather than unsold'
      }),
      // the buyers the dashboard breaks out, generated from the same Const buildCdcGold pivots on, so a
      // fourth buyer is one profile edit rather than four hand-copied lists
      ...jb.coreRegistry.consts.helocClients.flatMap(([id, label]) => [
        metric(`${id}_leads`, `sum(${id}_lead_count)`, `clickouts ${label} accepted and paid for`),
        metric(`${id}_sales`, `sum(${id}_sale_count)`, `${label} leads that closed`)
      ])
    ],
    limits: [
      'SPEND IS THE STALE HALF. Clickouts come from CDC and run to within ~2 days, but Meta spend arrives via ' +
      'the fb-connector and this silver holds it only to 2026-06-04. After that date revenue exists and spend ' +
      'is ZERO, so profit collapses to revenue and roi_pct reads as infinite. Never build a period past the ' +
      'spend horizon and present its ROI',
      'SPEND IS BUCKETED IN UTC, pinned by SET TimeZone in buildCdcGold. Before that pin the same query ' +
      'returned $121,172 on a machine in Asia/Jerusalem and $119,192 under UTC — a 1.7% swing that depended ' +
      'on the host. Any gold parquet built before 2026-08-25 carries the local-timezone figure',
      'ROI STILL NEEDS A MATURED PERIOD: revenue arrives for days after the click, so rebuild with ' +
      'Var("lagDays", 21) before quoting it and never compare a fresh period against a matured one',
      'SPEND HAS NEVER BEEN RECONCILED AGAINST AN INDEPENDENT SOURCE. spend.parquet is built FROM the ' +
      'Databricks hourly_smm table, so "our spend matches Databricks" is self-consistency, not validation — ' +
      'cdcGold.spendIsNotDuplicated proves only that the gold join does not fan the spend out. Until the ' +
      'fb-connector is read directly, treat cost as unverified',
      'ALWAYS filter to one vertical before reading a total',
      'vertical is the MOST FREQUENT vertical among the ad\'s clickouts, not each clickout\'s own. A campaign ' +
      'serving two verticals is reported wholly under the larger one — clickoutsCdcCube is authoritative for ' +
      'what was actually sold. Only 6 ad-days on 2026-05-15 serve more than one vertical at all',
      'rows exist with revenue and zero spend (organic or untagged) and with spend and zero revenue (ads that ' +
      'sold nothing). roi_pct is null on the latter, never zero — do not coalesce it to 0 and average it',
      'roi_pct is a percent of spend: 110 means a 10% margin. Reporting it as "110% profit" is wrong',
      'sales come from the settlement row\'s disposition, which only some clients report. A zero in sales or ' +
      'lead_to_sale_pct means UNREPORTED as often as it means unsold, so never rank clients on L2S alone',
      'YOU CAN ONLY QUERY DAYS YOU BUILT. This silver is one parquet per day, so a queryPeriod range covering an ' +
      'unbuilt day fails with "No files found" — it is not an empty result and not a zero. Backfill first with ' +
      'buildCdcGold("from..to"), which takes the same range spec the query does'
    ]
  })
})
