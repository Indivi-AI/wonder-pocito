// The schematics cubes, rebuilt over our own silver — ALL VERTICALS.
// Grain: conversionsCube = one CLICKOUT (a card click handed to a buying client), enriched with the
// session's traffic attribution (sub1/2/3) and the Meta account that paid for it.
// spendCube = one Meta ad row per hour. adPerformanceCube is the full-outer join of the two.
//
// A dashboard picks its vertical with `where vertical = '...'`; no cube is built for one vertical.
// Silver is built by schematics-etl.js from the schematics Databricks dump (valid through 2026-06-03).
// Swapping `source` to a live-CDC-built parquet of the same schema is a drop-in change.

import { dsls } from '@jb6/core'
import '@jb6/common'
import '@wonder/bi/bi-common.js'
import './schematics-etl.js'   // registers buildSchematicsSilver (etl<etl>) + schematicsSilver (silver-builder<bi>)

const {
  bi: {
    Cube,
    cube: { cube },
    'silver-builder': { schematicsSilver },
    'query-lookup': { lookupByWUrl },
    dimension: { dimension },
    metric: { metric, ratio, share }
  }
} = dsls

const WURL_BASE = 'room://schematicsBI/usersRO/silver'

// The join contract between the two cubes. Defined once: if these four drift apart, revenue and spend
// stop meeting and every profit/ROI number silently becomes wrong.
const adHierarchy = () => [
  dimension('account_name', {
    guidance: 'Meta ad account, e.g. "D.Y.K. TECHNOLOGIES LTD - PL 10". Accounts are vertical-segregated, so this is also where a spend row gets its vertical'
  }),
  dimension('sub1', { guidance: 'Meta campaign id — the spend<->revenue join key. ~1100 values across all verticals; groupable but wide', parent: 'account_name' }),
  dimension('sub2', { guidance: 'Meta ad-set name', parent: 'sub1' }),
  dimension('sub3', { guidance: 'Meta ad id — unbounded, filter or top-N rather than group blindly', parent: 'sub2' })
]

export const conversionsCube = Cube('conversionsCube', {
  impl: cube({
    wUrlBase: WURL_BASE,
    source: schematicsSilver('conversions'),
    dimensions: [
      dimension('vertical', {
        guidance: 'the product category the clickout was sold into — Home Equity Loans, Auto Insurance, Home Warranty, Business Loans… A FACT: it comes from ' +
        'the offer the client actually bought. ~29 values, safe to group'
      }),
      dimension('account_vertical', {
        guidance: 'the vertical the MEDIA BUYER was aiming at, from the ad account — what adPerformanceCube groups by. Compare it against `vertical` to see ' +
        'where a campaign sold something other than what it was bought for; they agree 98.8% of the time'
      }),
      dimension('client_name', { guidance: 'the buyer the clickout was sold to — amerisave, unison, splitero, point impact, lendingtree. Safe to group', parent: 'vertical' }),
      dimension('offer_id', { guidance: 'the specific offer within a client; a client runs several', parent: 'client_name' }),
      dimension('disposition', { guidance: "the client's reported outcome: Sale, Lead, ELIGIBLE, INELIGIBLE. null = never reported back" }),
      dimension('disposition_source', { guidance: 'which client reported the disposition; free text, spelling varies (Amerisave vs Amersiave)', parent: 'disposition' }),
      ...adHierarchy(),
      dimension('session_time', { type: 'timestamp', guidance: 'when the visitor landed. The PERFORMANCE axis — group/filter here to judge traffic you bought' }),
      dimension('conversion_time', { type: 'timestamp', guidance: 'when the client paid. The P&L axis — group/filter here for revenue recognised in a period' }),
      dimension('auto_state', { type: 'string', guidance: 'US state, IP-derived unless the form captured it', parent: 'auto_country' }),
      dimension('auto_country', { type: 'string', guidance: 'top of the geo hierarchy; effectively all US' }),
      dimension('device_type', { guidance: 'mobile/desktop/tablet — low cardinality, safe to group' }),
      dimension('browser', { guidance: 'low cardinality, safe to group' }),
      dimension('os', { guidance: 'low cardinality, safe to group' }),
      dimension('page', { guidance: 'landing page url — wide, filter rather than group' }),
      dimension('form_id', { guidance: 'the form the session used; null for schematics React variants' }),
      dimension('variant_id', { guidance: 'A/B arm id' })
    ],
    metrics: [
      metric('clickouts', 'count', 'card clicks handed to a client — the denominator of Cost per Clickout'),
      metric('sessions', 'distinctCount(session_id)', 'distinct visitors behind those clickouts; one session can click several offers'),
      metric('leads', 'sum(is_lead)', 'clickouts the client accepted and paid for (is_converted=1) — the CPL denominator'),
      metric('sales', 'sum(is_sale)', "clickouts the client later reported as disposition='Sale' — a real closed loan, reported days to weeks late"),
      metric('revenue', 'sum(revenue_amount)', 'confirmed revenue booked for the clickout', { unit: '$' }),
      metric('estimated_revenue', 'sum(estimated_amount)', 'revenue including not-yet-confirmed payouts; equals revenue in most verticals, diverges in Auto', { unit: '$' }),
      metric('bid_value', 'sum(bid_amount)', 'sum of the bids shown on the cards, not money earned', { unit: '$' }),
      ratio('l2s_pct', 'sales/leads', { description: "lead-to-sale: of the leads a client bought, how many closed. The dashboard's L2S% column" }),
      ratio('lead_rate_pct', 'leads/clickouts', { description: 'share of clickouts a client actually accepted — acceptance, not conversion' }),
      ratio('rev_per_lead', 'revenue/leads', { scale: 1, unit: '$', description: 'average price the client paid per accepted lead' }),
      ratio('rev_per_clickout', 'revenue/clickouts', { scale: 1, unit: '$', description: 'blended earning per card click, including rejected ones' }),
      share('revenue_share', 'revenue')
    ],
    queryLookups: [lookupByWUrl('spend.parquet', 'spend')],
    limits: [
      'silver is a snapshot of the schematics Databricks dump: session_dt runs 2025-09-01 → 2026-06-03. Anything after that is MISSING, not zero — never anchor on now()',
      'ALL VERTICALS are present and they are wildly different businesses — Home Equity Loans earns $6.9M on 250K clickouts while Auto Insurance earns $2.8M on 3.1M. NEVER ' +
        'total across verticals without saying so, and never compare a rate between them',
      'REVENUE HAS TWO CLOCKS. session_time = the cohort that produced it; conversion_time = when it was booked. MEASURED on May 2026 HELOC they differ by only 0.7% ' +
        '($1,306,273 vs $1,315,876), so the clocks do NOT explain Sigma\'s 2.8x "Revenue (Performance)" vs "Revenue (P&L)" gap — that gap is still UNEXPLAINED. Never label a ' +
        'number Performance or P&L until it is resolved; say which clock you filtered on instead',
      'a clickout with disposition=null was never reported back by the client — it is unknown, not a non-sale. sales/l2s_pct therefore UNDERSTATE for every client that does ' +
        'not report (only amerisave, unison, unlock, naf and a few others do)',
      'sales arrive days to weeks after the session. Any l2s_pct over a recent window is biased low; do not compare a fresh window to a mature one',
      'leads = is_converted, i.e. the client ACCEPTED and paid. It is not a form fill. The leads-table lead-gen verticals use a different mechanism and are not in this cube',
      'REVENUE IS INCOMPLETE FOR FORM-FILL VERTICALS. Home Security earns $2,560,225 in the bronze leads table and only $1,130 here — 99.96% of it is invisible to this cube. ' +
      'Medical Alerts and Windows Installation are affected too. Never compute ROI or profit for those verticals from this data; it will show a catastrophic loss that is not real',
      '801,698 clickouts carry vertical=null and still earn $383,021 — unclassified offers, not a vertical of their own. Filtering to one vertical silently excludes them',
      'every clickout matches a session, but ~2.3% carry a null sub1 — organic or untagged traffic that still earns revenue. That is the dashboard\'s blank first row, not a ' +
        'bug; an inner join to spend silently deletes it',
      'spend lives only in the %$spend% lookup at ad grain. There is no spend column here: any profit/ROI/CPL number requires the join, and an inner join silently drops ' +
        'unattributed revenue — use a full join, or use adPerformanceCube which has both already',
      'no attribution model — revenue is credited to the session that produced the clickout, first and only touch. Multi-touch, view-through and cross-device journeys are ' +
        'invisible',
      'bid_value is what the cards advertised, never what was earned; never present it as revenue'
    ]
  })
})

export const spendCube = Cube('spendCube', {
  impl: cube({
    wUrlBase: WURL_BASE,
    source: schematicsSilver('spend'),
    dimensions: [
      dimension('vertical', {
        guidance: 'DERIVED, not sourced: the Meta feed has no vertical at all. Assigned from the ad account, because schematics buy media in ' +
        'vertical-segregated accounts (PL=Home Equity, BL US=Business Loans, CC US=Credit Cards) — measured 99.98% pure. Spend on an account that ' +
        'never produced a clickout lands in (unattributed)'
      }),
      ...adHierarchy(),
      dimension('traffic_source', { guidance: 'facebook / tiktok — low cardinality', values: ['facebook', 'tiktok'] }),
      dimension('time', { type: 'timestamp', guidance: 'the spend hour; bucket by day, never group raw' })
    ],
    metrics: [
      metric('spend', 'sum(spend_amount)', 'gross media cost', { unit: '$' }),
      metric('impressions', 'sum(impressions)'),
      metric('clicks', 'sum(clicks)', 'all Meta-reported clicks, including non-outbound'),
      metric('link_clicks', 'sum(inline_link_clicks)', 'outbound link clicks — the closest Meta analogue to a landing'),
      ratio('cpc', 'spend/clicks', { scale: 1, unit: '$' }),
      ratio('cpm', 'spend/impressions', { scale: 1000, unit: '$', description: 'cost per thousand impressions' }),
      ratio('ctr_pct', 'clicks/impressions')
    ],
    limits: [
      'vertical here is an ATTRIBUTION, not a fact. Meta charges per ad; the vertical is inferred from the account. It is 99.98% accurate but it is still inferred — never ' +
        'present per-vertical spend with the same confidence as per-vertical revenue',
      '$531,179 of spend (2.07%) sits on 16 accounts that never produced a single clickout and therefore have NO derivable vertical. It is bucketed as (unattributed) and is ' +
        'real money — a total that silently omits it overstates ROI',
      'dt runs 2025-05-23 → 2026-06-04, one row per ad per hour; the last day is partial',
      'sub1 is derived from campaign_name: bare numeric ids pass through, "Prefix - 12345" is split on the last " - ". A campaign named without that convention will not join ' +
        'to any revenue',
      'link_clicks is Meta-reported and never equals our clickouts — different systems, different definitions of a click',
      'this cube has no revenue. Do not compute ROI here; use adPerformanceCube, which carries both on one row'
    ]
  })
})

// The clients the HELOC dashboard breaks out. One entry here yields three metrics and three table columns.
export const HELOC_CLIENTS = [['amerisave', 'Amerisave'], ['unison', 'Unison'], ['splitero', 'Splitero']]

const clientMetrics = HELOC_CLIENTS.flatMap(([id, label]) => [
  metric(`${id}_leads`, `sum(${id}_lead_count)`, `clickouts ${label} accepted and paid for`),
  metric(`${id}_sales`, `sum(${id}_sale_count)`, `clickouts ${label} later reported as closed`),
  ratio(`${id}_l2s_pct`, `${id}_sales/${id}_leads`, { description: `${label} lead-to-sale` })
])

// GOLD — the dashboard's own grain: revenue and spend on one row, so profit/ROI/CPL are metrics, not applet SQL.
export const adPerformanceCube = Cube('adPerformanceCube', {
  impl: cube({
    wUrlBase: WURL_BASE,
    source: schematicsSilver('adPerformance'),
    dimensions: [
      dimension('vertical', {
        guidance: 'the ACCOUNT\'s vertical, applied to revenue and spend alike so a campaign\'s cost and earnings land in the same bucket. Filter here first — totals across ' +
        'verticals are rarely meaningful'
      }),
      ...adHierarchy(),
      dimension('session_date', { type: 'timestamp', guidance: 'the day the visitor landed; the only date axis here — bucket by day/week/month' })
    ],
    metrics: [
      metric('revenue', 'sum(revenue_amount)', 'confirmed revenue from clickouts of that day', { unit: '$' }),
      metric('estimated_revenue', 'sum(estimated_amount)', 'revenue incl. unconfirmed payouts', { unit: '$' }),
      metric('spend', 'sum(spend_amount)', 'Meta media cost', { unit: '$' }),
      metric('profit', 'sum(profit_amount)', 'revenue minus spend; additive, so it rolls up correctly', { unit: '$' }),
      metric('clickouts', 'sum(clickout_count)', 'card clicks handed to a client'),
      metric('leads', 'sum(lead_count)', 'clickouts a client accepted and paid for'),
      metric('sales', 'sum(sale_count)', 'clickouts a client later reported as closed'),
      metric('impressions', 'sum(impression_count)'),
      metric('link_clicks', 'sum(link_click_count)', 'Meta-reported outbound clicks; never equals our clickouts'),
      ratio('roi_pct', 'revenue/spend', { description: "revenue as a percent of spend — the dashboard's ROI %; 100% is break-even, not zero" }),
      ratio('cost_per_clickout', 'spend/clickouts', { scale: 1, unit: '$', description: 'media cost per card click' }),
      ratio('cpl', 'spend/leads', { scale: 1, unit: '$', description: 'cost per lead — media cost per accepted lead' }),
      ratio('l2s_pct', 'sales/leads', { description: 'lead-to-sale across all clients' }),
      ratio('lead_rate_pct', 'leads/clickouts', { description: 'share of clickouts a client accepted' }),
      ratio('rev_per_lead', 'revenue/leads', { scale: 1, unit: '$' }),
      share('revenue_share', 'revenue'),
      ...clientMetrics
    ],
    limits: [
      'ALWAYS filter to one vertical. A grand total mixes Home Equity Loans with Auto Insurance and Home Warranty — different economics, different clients, ' +
      'meaningless combined',
      'THIS CUBE UNDERSTATES REVENUE FOR FORM-FILL VERTICALS, so their ROI is not real. Home Security reads $1,130 revenue against $3,743,901 spend (ROI 0.0%) ' +
      'because its actual $2,560,225 lives in the bronze leads table, which this silver does not read. Only Home Equity Loans, Auto Insurance, Home Warranty ' +
      'and Pet Insurance are ROI-trustworthy today',
      'vertical is the ACCOUNT\'s vertical on both sides, which is what makes the revenue/spend join hold. It is 99.98% consistent with the clickout\'s own vertical; where ' +
        'they disagree, conversionsCube is the authority on what was actually sold',
      'session_date only. Revenue is booked to the day the SESSION happened, not the day it converted — this cube cannot answer a conversion-date question; use conversionsCube ' +
        'for that',
      'of the clickouts that ever convert, ~89% convert same-day and ~4% next-day, so session_date and conversion_date agree for the large majority — but the tail runs to 16 days',
      'the (unattributed) vertical holds $531,179 of spend on accounts that never sold anything, plus revenue from untagged organic traffic. It is real; excluding it flatters ROI',
      'rows exist with revenue and zero spend (organic/untagged) and with spend and zero revenue (campaigns that sold nothing) — roi_pct is null on the latter, never zero',
      'the per-client metrics (amerisave_*, unison_*, splitero_*) are Home Equity Loans buyers. They are zero in every other vertical and must not be read as that vertical\'s ' +
        'totals',
      'sales lag the session by days to weeks; l2s_pct over a recent window is biased low',
      'silver ends 2026-06-03 — later dates are missing, not zero',
      'roi_pct is a percent of spend: 110 means a 10% margin. Reporting it as "110% profit" is wrong'
    ]
  })
})
