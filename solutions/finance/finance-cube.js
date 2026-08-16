import { dsls, jb, coreUtils } from '@jb6/core'
import '@wonder/bi/metrics.js'
import '@wonder/bi/report-catalog.js'

const {
  bi: {
    Cube, Report, SilverBuilder,
    cube: { cube },
    dimension: { dimension },
    metric: { metric, ratio, share },
    report: { report }
  },
  common: { Data, data: { cubeQuery } }
} = dsls

// single source of truth: the finance-demo remote bucket — resolveFroms pins db:'bucket', immune to the ambient ctx db
// (so browser-LIVE's db:'local' Ask-AI var can't re-route it to nonexistent files/rooms). Realms differ only in HOW
// they read it: the linux lambda (native ext) and browser LIVE (static-wasm) byte-range via the cols_cache extension;
// only mac/node dev mirrors whole files to /tmp/wcache (fullFileCache) — the browser has no disk and its wasm engine reads solely through cols_cache.
const DATA_ROOT = 'room://finance-demo/usersRO/data'
const CACHE_STRATEGY = !coreUtils.isNode || globalThis.process?.platform === 'linux' ? 'colsCache' : 'fullFileCache'

const compact = n => {
  const a = Math.abs(n || 0)
  return a >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (n / 1e6).toFixed(2) + 'M'
    : a >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n || 0))
}
const usd = n => '$' + compact(n)
const usdSigned = n => (n >= 0 ? '+' : '−') + '$' + compact(Math.abs(n || 0))
const sentence = s => { s = (s || '').replace(/_/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1) }
const ORANGE = '#FF4800', ORANGE_SOFT = '#FDBCA6', GREEN = '#1FA971', AMBER = '#E8A317', RED = '#D64545'

// the wallet CSV(s) as ONE FROM-able relation, every row tagged with its entity id.
// persona '__all__' consolidates the three entities via UNION ALL — the trick finance-demo's src() used to play, moved into the cube
// so consolidated views work through cubeQuery/reports with zero per-query edits. USD-normalisation keeps the union arithmetically sound.
const ENTITIES = ['freelancer', 'ecommerce', 'marketplace']
const financeTxSource = SilverBuilder('financeTxSource', {
  params: [
    {id: 'dataRoot', as: 'string', mandatory: true},
    {id: 'persona', as: 'string', mandatory: true},
    {id: 'size', as: 'string', mandatory: true}
  ],
  impl: (_, {}, { dataRoot, persona, size }) => {
    const parts = (persona == '__all__' ? ENTITIES : [persona]).map(p => ({ p, wUrl: `${dataRoot}/finance_${p}_${size}.parquet` }))
    return {
      name: 'tx', keyField: '', periodPattern: 'YYYY-MM-DD',
      parquetFiles: [{ name: 'tx', wUrlPattern: parts[0].wUrl, version: 1 }],
      async resolveFroms(ctx, periods) {
        const bucketCtx = (['local', 'fs'].includes(ctx.vars.db) ? ctx.setVars({ db: 'bucket' }) : ctx)
          .setVars({ cacheStrategy: ctx.vars.cacheStrategy ?? CACHE_STRATEGY })
        const strategy = jb.biUtils.cacheStrategyOf(bucketCtx)
        const rels = await Promise.all(parts.map(async ({ p, wUrl }) =>
          `select *, '${p}' as entity from ${(await strategy.buildSourceReader([wUrl], bucketCtx)).sql}`))
        const froms = { tx: `(${rels.join(' union all ')})` }
        Object.defineProperty(froms, '$modifiers', { value: strategy.modifiers(bucketCtx) })
        return Object.defineProperty(froms, '$manifest', { value: {} })   // no manifest silvers, but querySetup folds lookups into this
      },
      async resolveKey() { throw new Error('financeTxSource: no drill (no source events)') },
      getSourceEvents() { throw new Error('financeTxSource: no drill (no source events)') },
      async materialize() { throw new Error('financeTxSource: not event-based (no materialize)') },
      async materializePeriod(_ctx, period) { return { period, objs: 0, bytes: 0, parquet: null, outUrl: parts[0].wUrl } }
    }
  }
})

// the wallet's semantic layer: every business definition (what counts as money-in, how fees convert to USD)
// lives HERE once — dashboards, verified reports and the LLM all read the same vocabulary.
Cube('financeCube', {
  params: [
    {id: 'persona', as: 'string', defaultValue: 'freelancer', options: 'freelancer,ecommerce,marketplace,__all__'},
    {id: 'size', as: 'string', defaultValue: 'realistic', options: 'realistic,heavy'},
    {id: 'dataRoot', as: 'string', defaultValue: DATA_ROOT}
  ],
  impl: cube({
    source: financeTxSource('%$dataRoot%', '%$persona%', '%$size%'),
    cacheStrategy: CACHE_STRATEGY,
    dimensions: [
      dimension('entity', { guidance: "originating entity id (freelancer|ecommerce|marketplace); every row is tagged — only interesting when persona='__all__'" }),
      dimension('Description', { guidance: 'counterparty name (payer/recipient). unbounded — group with LIMIT top-N' }),
      dimension('Currency', { values: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'], guidance: '6 values. money metrics are already USD-normalised' }),
      dimension('Status', { values: ['completed', 'pending', 'failed'], guidance: 'money metrics already filter completed' }),
      dimension('Direction', { values: ['in', 'out'], guidance: 'money_in/money_out already encode it' }),
      dimension('"Transaction Type"', {
        values: ['marketplace_payment', 'client_payment', 'supplier_payment', 'payout', 'withdrawal'],
        guidance: 'spaced name — keep the double quotes'
      }),
      dimension('"Counterparty Type"', { values: ['marketplace', 'client', 'supplier', 'contractor', 'withdrawal'] }),
      dimension('Date', { type: 'timestamp',
        guidance: "group via date_trunc('day'|'week'|'month', Date); never now() — anchor to max(Date); "
          + 'the LATEST bucket is partial — completed metrics understate it while payments still pending settle' })
    ],
    metrics: [
      metric('money_in', `ROUND(SUM(CASE WHEN Direction='in' AND Status='completed' THEN "Amount (USD)" END))`, { unit: '$', description: 'completed inflows, USD-normalised' }),
      metric('money_out', `ROUND(SUM(CASE WHEN Direction='out' AND Status='completed' THEN "Amount (USD)" END))`, { unit: '$', description: 'completed outflows, USD-normalised' }),
      metric('net_flow',
        `ROUND(SUM(CASE WHEN Status='completed' THEN CASE WHEN Direction='in' THEN "Amount (USD)" ELSE -"Amount (USD)" END END))`,
        { unit: '$', description: 'money_in − money_out' }),
      metric('fees', `ROUND(SUM(CASE WHEN Status='completed' THEN Fee*("Amount (USD)"/NULLIF(Amount,0)) END))`,
        { unit: '$', description: 'fees converted to USD via the per-row rate' }),
      metric('pending', `ROUND(SUM(CASE WHEN Status='pending' THEN "Amount (USD)" END))`, { unit: '$', description: 'unsettled pipeline, USD' }),
      metric('settled_gross', `ROUND(SUM(CASE WHEN Status='completed' THEN "Amount (USD)" END))`, { unit: '$', description: 'all completed volume, USD' }),
      metric('txns', 'count', { unit: 'int', description: 'transaction count (any status)' }),
      metric('completed_n', `SUM(CASE WHEN Status='completed' THEN 1 ELSE 0 END)`, { unit: 'int', description: 'completed transaction count' }),
      metric('pending_n', `SUM(CASE WHEN Status='pending' THEN 1 ELSE 0 END)`, { unit: 'int', description: 'pending transaction count' }),
      metric('failed_n', `SUM(CASE WHEN Status='failed' THEN 1 ELSE 0 END)`, { unit: 'int', description: 'failed transaction count' }),
      metric('failed_rate', `ROUND(100.0*SUM(CASE WHEN Status='failed' THEN 1 ELSE 0 END)/NULLIF(COUNT(*),0),1)`, { unit: '%', description: '% failed of all transactions' }),
      metric('net_income', 'money_in - fees', { unit: '$', description: 'what you actually keep: completed inflows minus fees — rank payers by THIS, not money_in' }),
      metric('failed_usd', `ROUND(SUM(CASE WHEN Status='failed' THEN "Amount (USD)" END))`, { unit: '$', description: 'dollars lost to failed transactions' }),
      ratio('fee_pct', 'fees/settled_gross', { description: 'fee % of completed volume — marketplaces ~1.1%, direct clients ~0.25%' }),
      ratio('failed_usd_rate', 'failed_usd/settled_gross', { description: 'failed dollars per completed dollar — the money-weighted risk signal (counts hide it)' }),
      metric('withdrawn',
        `ROUND(SUM(CASE WHEN "Counterparty Type"='withdrawal' AND Status='completed' THEN "Amount (USD)" END))`,
        { unit: '$', description: 'cash actually moved to the bank' }),
      metric('supplier_spend',
        `ROUND(SUM(CASE WHEN "Counterparty Type"='supplier' AND Status='completed' THEN "Amount (USD)" END))`,
        { unit: '$', description: 'software/infra suppliers' }),
      metric('contractor_spend',
        `ROUND(SUM(CASE WHEN "Counterparty Type"='contractor' AND Status='completed' THEN "Amount (USD)" END))`,
        { unit: '$', description: 'subcontractor payouts' }),
      metric('avg_txn', `ROUND(AVG(CASE WHEN Status='completed' THEN "Amount (USD)" END))`, { unit: '$', description: 'average completed transaction size' }),
      share('money_in_share', 'money_in', { description: "this group's % of total completed inflows — concentration/dependency questions" })
    ],
    limits: [
      'contractor payouts have NO link to revenue (no project/invoice key) — contractor ROI/profitability is UNANSWERABLE from this data',
      '"Running Balance" is a true cumulative ledger per entity+currency: each completed row carries the balance AFTER it, '
        + 'so within one currency you may diff two rows to get the change between them. Never SUM it across rows. '
        + 'A balance AS OF a date = arg_max("Running Balance"*("Amount (USD)"/NULLIF(Amount,0)), "Date & Time") '
        + 'per entity+Currency over rows up to that date, completed only, then summed',
      'the ledger reconciles EXACTLY in native currency (closing − opening = completed in − out − fees) but only approximately in USD: '
        + 'each row converts at its own rate, so a multi-currency USD statement carries an FX-translation residual — '
        + 'report it as its own line, never bury it in fees',
      'pending is not income — never mix it into money_in; pending older than ~60 days before max(Date) is stale and worth chasing',
      "data ends at max(Date) — anchor 'today'/'this month' there, never now()",
      'month-over-month drops: decompose each month by day before blaming clients — a drop is often the partial last month '
        + '(still-pending money) or day-level concentration in the compared month, not lost income',
      'trends: report a direction only when monthly buckets actually trend — volatile/lumpy spend is a finding, not a trend'
    ]
  })
})

// ── verified report catalog (ports finance-demo REPORTS; rows arrive as ctx.data with legacy name/value columns) ──

Report('financeTopPayers', {
  impl: report('top-payers', 'Who are my top payers?', {
    icon: 'TrendingUp',
    source: cubeQuery('select Description as "name", money_in as "value" group by 1 having money_in is not null order by 2 desc limit 8'),
    widget: ctx => ({ kind: 'hbar', title: 'Top payers · USD', valueFormat: '$',
      data: ctx.data.map((r, i) => ({ name: r.name, value: +r.value, color: i == 0 ? ORANGE : ORANGE_SOFT })),
      drill: { kind: 'line', title: 'Monthly inflow — {name}', valueFormat: '$',
        sql: `SELECT strftime(date_trunc('month',Date),'%Y-%m') AS x, ROUND(SUM("Amount (USD)")) AS y
          FROM ${ctx.vars.tx} WHERE Direction='in' AND Status='completed' AND Description={name:q} GROUP BY 1 ORDER BY 1` } }),
    narrative: ctx => { const rows = ctx.data, t = rows.reduce((a, r) => a + +r.value, 0), top = rows[0] || {}
      const s = `**${top.name}** is your top payer at **${usd(top.value)}** — ${Math.round(top.value / (t || 1) * 100)}% of your top-8 inflow.`
      return ctx.vars.depth == 'deep'
        ? s + ` Your top 3 (${rows.slice(0, 3).map(r => r.name).join(', ')}) together bring `
          + `**${usd(rows.slice(0, 3).reduce((a, r) => a + +r.value, 0))}**. `
          + `Click any bar for that payer's monthly trend.`
        : s },
    followUps: ['Who are my top recipients?', 'Show the currency mix of my inflows']
  })
})

Report('financeTopRecipients', {
  impl: report('top-recipients', 'Who are my top recipients?', {
    icon: 'TrendingDown',
    source: cubeQuery('select Description as "name", money_out as "value" group by 1 having money_out is not null order by 2 desc limit 8'),
    widget: ctx => ({ kind: 'hbar', title: 'Top recipients · USD', valueFormat: '$',
      data: ctx.data.map((r, i) => ({ name: r.name, value: +r.value, color: i == 0 ? '#334155' : '#94A3B8' })),
      drill: { kind: 'line', title: 'Monthly outflow — {name}', valueFormat: '$',
        sql: `SELECT strftime(date_trunc('month',Date),'%Y-%m') AS x, ROUND(SUM("Amount (USD)")) AS y
          FROM ${ctx.vars.tx} WHERE Direction='out' AND Status='completed' AND Description={name:q} GROUP BY 1 ORDER BY 1` } }),
    narrative: ctx => { const rows = ctx.data
      return `You send the most to **${rows[0]?.name}** — **${usd(rows[0]?.value)}**.`
        + (ctx.vars.depth == 'deep'
          ? ` Your top outflows total **${usd(rows.slice(0, 3).reduce((a, r) => a + +r.value, 0))}** across `
            + `${rows.slice(0, 3).map(r => r.name).join(', ')}.` : '') },
    followUps: ['Break fees down by transaction type', 'Who are my top payers?']
  })
})

Report('financeMoneyFlow', {
  impl: report('money-flow', 'How did money in vs out trend this period?', {
    icon: 'ArrowLeftRight',
    source: cubeQuery(`select strftime(date_trunc('month',Date),'%b') as "m",
      strftime(date_trunc('month',Date),'%Y-%m') as "ym", money_in as "mi", money_out as "mo" group by 1,2 order by 2`),
    widget: ctx => ({ kind: 'area', title: 'Money in vs out · monthly', valueFormat: '$',
      series: [{ name: 'In', points: ctx.data.map(r => ({ x: r.m, y: +r.mi || 0 })) }, { name: 'Out', points: ctx.data.map(r => ({ x: r.m, y: +r.mo || 0 })) }] }),
    narrative: ctx => { const rows = ctx.data, i = rows.reduce((a, r) => a + (+r.mi || 0), 0), o = rows.reduce((a, r) => a + (+r.mo || 0), 0)
      return `Over the period you took in **${usd(i)}** and sent out **${usd(o)}** — a net of **${usdSigned(i - o)}**.`
        + (ctx.vars.depth == 'deep'
          ? ` Money-in ${i > o * 1.5 ? 'comfortably exceeds' : 'roughly tracks'} money-out month to month.` : '') },
    followUps: ['Who are my top payers?', "What's my failed-transaction rate?"]
  })
})

Report('financeFeesByType', {
  impl: report('fees-by-type', 'Break fees down by transaction type', {
    icon: 'Receipt',
    source: cubeQuery('select "Transaction Type" as "name", fees as "value" group by 1 having fees is not null order by 2 desc'),
    widget: ctx => ({ kind: 'bar', title: 'Fees by transaction type · USD', valueFormat: '$',
      data: ctx.data.map(r => ({ name: sentence(r.name), value: +r.value, color: ORANGE })) }),
    narrative: ctx => { const rows = ctx.data, t = rows.reduce((a, r) => a + +r.value, 0)
      return `You paid **${usd(t)}** in fees; **${sentence(rows[0]?.name)}** is the biggest slice at **${usd(rows[0]?.value)}**.`
        + (ctx.vars.depth == 'deep'
          ? ` Fees concentrate in your highest-volume flows — worth reviewing if margins are thin.` : '') },
    followUps: ['Show the currency mix of my inflows', 'Who are my top recipients?']
  })
})

Report('financeCurrencyMix', {
  impl: report('currency-mix', 'Show the currency mix of my inflows', {
    icon: 'Globe',
    source: cubeQuery('select Currency as "name", money_in as "value" group by 1 having money_in is not null order by 2 desc'),
    widget: ctx => ({ kind: 'pie', donut: true, showLegend: true, title: 'Inflow by currency · USD', valueFormat: '$',
      data: ctx.data.map(r => ({ name: r.name, value: +r.value })) }),
    narrative: ctx => { const rows = ctx.data, t = rows.reduce((a, r) => a + +r.value, 0)
      return `**${rows[0]?.name}** is your largest inflow currency — `
        + `**${Math.round(rows[0]?.value / (t || 1) * 100)}%** of the total.`
        + (ctx.vars.depth == 'deep'
          ? ` You receive across ${rows.length} currencies; all figures are USD-normalised for comparison.` : '') },
    followUps: ['How did money in vs out trend this period?', 'Break fees down by transaction type']
  })
})

Report('financeFailedRate', {
  impl: report('failed-rate', "What's my failed-transaction rate?", {
    icon: 'ShieldCheck',
    source: cubeQuery('select Status as "name", txns as "value" group by 1'),
    widget: ctx => ({ kind: 'pie', donut: true, showLegend: true, title: 'Transactions by status', valueFormat: 'int',
      data: ctx.data.map(r => ({ name: r.name, value: +r.value, color: r.name == 'completed' ? GREEN : r.name == 'pending' ? AMBER : RED })) }),
    narrative: ctx => {
      const rows = ctx.data, by = Object.fromEntries(rows.map(r => [r.name, +r.value]))
      const t = rows.reduce((a, r) => a + +r.value, 0), fr = (by.failed || 0) / (t || 1) * 100
      return `Your failed-transaction rate is **${fr.toFixed(1)}%** (${by.failed || 0} of ${t.toLocaleString()}); `
        + `**${(100 - fr).toFixed(1)}%** succeed.`
        + (ctx.vars.depth == 'deep' ? ` **${by.pending || 0}** are still pending and haven't settled yet.` : '') },
    followUps: ['How did money in vs out trend this period?', 'Who are my top payers?']
  })
})

// ── dashboard reports (finance-demo Home/Leadership widgets, ported from its hand-written SQL builders).
// Filters (date range, currency, entity) arrive via the cube binding — setupCube filters / runReportBatch entry where — never here.

Report('financeSummary', {
  impl: report('summary', 'Summarise the period: money in, money out, fees and status counts', {
    icon: 'Gauge',
    source: cubeQuery(`select money_in as "money_in", money_out as "money_out", fees as "fees", txns as "txns",
      completed_n as "completed", pending_n as "pending_n", failed_n as "failed_n", failed_rate as "failed_rate",
      pending as "pending", settled_gross as "settled_gross"`),
    widget: ctx => ({ kind: 'table', title: 'Period summary', columns: Object.keys(ctx.data[0] || {}).map(k => ({ key: k, label: sentence(k) })), rows: ctx.data }),
    narrative: ctx => { const c = ctx.data[0] || {}
      return `You took in **${usd(c.money_in)}** and sent **${usd(c.money_out)}** across **${(+c.txns || 0).toLocaleString()}** transactions; fees were **${usd(c.fees)}**.` }
  })
})

Report('financeVolume', {
  impl: report('money-volume', 'Show money in vs out over time', {
    icon: 'AreaChart',
    // {%$gran%} (day|week|month) comes from the binding ctx — pass vars: {gran} on the runReportBatch entry
    source: cubeQuery(`select strftime(date_trunc('{%$gran%}', Date), '%Y-%m-%d') as "x", money_in as "mi", money_out as "mo" group by 1 order by 1`),
    widget: ctx => ({ kind: 'area', title: 'Money in vs out', valueFormat: '$', xType: 'category',
      series: [{ name: 'In', points: ctx.data.map(r => ({ x: r.x, y: +r.mi || 0 })) }, { name: 'Out', points: ctx.data.map(r => ({ x: r.x, y: +r.mo || 0 })) }] }),
    narrative: ctx => { const rows = ctx.data, i = rows.reduce((a, r) => a + (+r.mi || 0), 0), o = rows.reduce((a, r) => a + (+r.mo || 0), 0)
      return `Across ${rows.length} buckets you took in **${usd(i)}** and sent **${usd(o)}**.` }
  })
})

Report('financeBalance', {
  impl: report('total-balance', 'What is my total balance?', {
    icon: 'Wallet',
    // latest completed running balance per entity+currency (USD-normalised via the per-row rate), then summed.
    // explicit FROM {%$tx%}: the arg_max needs raw rows, so it opts out of the implicit-FROM aggregate shape.
    source: cubeQuery(`select round(sum(bal)) as "v" from (
  select entity, Currency, arg_max("Running Balance"*("Amount (USD)"/nullif(Amount,0)), "Date & Time") as bal
  from {%$tx%} where Status='completed' group by entity, Currency)`),
    widget: ctx => ({ kind: 'table', title: 'Total balance · USD', columns: [{ key: 'v', label: 'Balance (USD)' }], rows: ctx.data }),
    narrative: ctx => `Your combined balance across currencies is **${usd(ctx.data[0]?.v)}** (USD-normalised).`
  })
})

// reduce the grouped scan into the finished statement: ordered activity/payout line lists (signed USD
// baked into each line, so the object is pure JSON and survives the lambda round-trip) plus the totals.
// The one business rule is the block split — a withdrawal leaves the wallet (payout), everything else
// moves the balance within it (activity). Line labels, ordering into a bank-statement shape, and the
// FX/rounding residual are presentation and stay in the caller.
const statementTotals = rows => {
  const done = r => r.st == 'completed', signed = r => (r.dir == 'in' ? 1 : -1) * (+r.v || 0)
  const total = (list, k) => list.reduce((a, r) => a + (+r[k] || 0), 0)
  const tally = s => { const g = rows.filter(r => r.st == s); return { n: total(g, 'n'), v: total(g, 'v') } }
  // each line carries its own tt/dir so a caller can drill to exactly the rows behind it — no ct→type map to drift
  const line = r => ({ ct: r.ct, tt: r.tt, dir: r.dir, n: +r.n })
  const act = rows.filter(r => r.block == 'activity' && done(r)).sort((a, b) => signed(b) - signed(a)).map(r => ({ ...line(r), amount: signed(r) }))
  const pay = rows.filter(r => r.block == 'payout' && done(r)).map(r => ({ ...line(r), amount: +r.v }))
  const activity = total(act, 'amount'), fees = total(rows.filter(done), 'fee'), payouts = total(pay, 'amount')
  return { act, pay, activity, fees, payouts, netActivity: activity - fees, change: activity - fees - payouts,
    payoutN: total(pay, 'n'), pending: tally('pending'), failed: tally('failed') }
}

// the statement as a report source: run the grouped scan, reduce to the single finished statement row.
// Modelled on withPrevPeriod — a Data comp wrapping a cubeQuery — so the arithmetic lives IN the report
// (its widget, narrative and every caller read the same ctx.data[0]) instead of an exported JS helper.
const financeStatement = Data('financeStatement', {
  description: 'balance statement: the grouped block/status scan reduced to one row — activity/payout line lists + activity, fees, payouts and net change totals',
  params: [{ id: 'source', type: 'data<common>', dynamic: true, mandatory: true, description: 'the grouped cubeQuery (block/ct/dir/st → n/v/fee)' }],
  impl: async (ctx, {}, { source }) => [statementTotals(await source(ctx))]
})

Report('financeBalanceStatement', {
  impl: report('balance-statement', 'Show my balance statement for the period', {
    icon: 'Scale',
    // explicit FROM {%$tx%}: the cube injects the already-filtered relation, so the date/currency/entity
    // filters apply, and the per-status grouping survives (money metrics would have pre-filtered completed).
    source: financeStatement(cubeQuery(`select case when "Counterparty Type"='withdrawal' then 'payout' else 'activity' end as "block",
  "Counterparty Type" as "ct", "Transaction Type" as "tt", Direction as "dir", Status as "st", count(*) as "n",
  round(sum("Amount (USD)")) as "v", round(sum(Fee*("Amount (USD)"/nullif(Amount,0)))) as "fee"
from {%$tx%} group by 1,2,3,4,5 order by 1,2,4`)),
    widget: ctx => { const s = ctx.data[0] || {}
      return { kind: 'table', title: 'Balance change · USD',
        columns: [{ key: 'line', label: 'Description' }, { key: 'amount', label: 'Amount (USD)' }],
        rows: [{ line: 'Account activity before fees', amount: usdSigned(s.activity) }, { line: 'Fees', amount: usdSigned(-s.fees) },
          { line: 'Net balance change from activity', amount: usdSigned(s.netActivity) }, { line: `Payouts (${s.payoutN})`, amount: usdSigned(-s.payouts) },
          { line: 'Net balance change', amount: usdSigned(s.change) }] } },
    narrative: ctx => { const s = ctx.data[0] || {}
      return `Activity moved **${usdSigned(s.activity)}** before fees; fees took **${usd(s.fees)}** and payouts `
        + `**${usd(s.payouts)}**, leaving a net balance change of **${usdSigned(s.change)}**.`
        + (ctx.vars.depth == 'deep' ? ` **${s.pending?.n}** transactions are still pending and **${s.failed?.n}** failed — neither moves the balance.` : '') },
    followUps: ['What is my total balance?', 'How did money in vs out trend this period?']
  })
})

Report('financeActiveClients', {
  impl: report('active-clients', 'How many marketplaces and direct clients pay me?', {
    icon: 'Users',
    source: cubeQuery(`select count(distinct case when Direction='in' and "Counterparty Type"='marketplace'
      then Description end) as "mkt", count(distinct case when Direction='in' and "Counterparty Type"='client'
      then Description end) as "direct"`),
    widget: ctx => ({ kind: 'bar', title: 'Active payers', valueFormat: 'int',
      data: [{ name: 'Marketplaces', value: +(ctx.data[0]?.mkt || 0), color: ORANGE }, { name: 'Direct clients', value: +(ctx.data[0]?.direct || 0), color: ORANGE_SOFT }] }),
    narrative: ctx => { const c = ctx.data[0] || {}
      return `**${(+c.mkt || 0) + (+c.direct || 0)}** counterparties paid you — **${c.mkt || 0}** marketplaces and **${c.direct || 0}** direct clients.` }
  })
})

// period comparison: the previous window of a [from,to] date range — equal-length back-shift (MoM/QoQ) or same window last year (YoY)
const prevRange = (from, to, mode = 'period') => {
  const d = s => new Date(s + 'T00:00:00Z'), iso = t => t.toISOString().slice(0, 10), day = 86400000
  const shift = mode == 'year' ? t => { const x = d(t); x.setUTCFullYear(x.getUTCFullYear() - 1); return iso(x) }
    : t => iso(new Date(+d(t) - ((+d(to) - +d(from)) / day + 1) * day))
  return { from: shift(from), to: shift(to) }
}
// zip current rows with their previous-window counterparts as <col>_prev — by key when the key values overlap
// (categorical dims: same payer both windows), else by row position (time series / single-row KPI selects)
const zipPrev = (rows, prevRows, key = 'name') => {
  const byKey = new Map(prevRows.map(r => [r[key], r])), aligned = rows.some(r => byKey.has(r[key]))
  return rows.map((r, i) => { const p = aligned ? byKey.get(r[key]) : prevRows[i]
    return { ...r, ...Object.fromEntries(Object.entries(p || {}).map(([k, v]) => [k + '_prev', v])) } })
}

const withPrevPeriod = Data('withPrevPeriod', {
  description: 'period comparison: run source (a cubeQuery) over [from,to] and over the shifted-back window, '
    + 'zip prev columns in as <col>_prev. mode period = equal-length previous window (MoM/QoQ), '
    + 'year = same window last year (YoY). ANDs onto any binding cubeWhere.',
  params: [
    { id: 'source', type: 'data<common>', dynamic: true, mandatory: true, description: 'the cubeQuery to run once per window' },
    { id: 'from', as: 'string', mandatory: true, description: 'current window start, YYYY-MM-DD' },
    { id: 'to', as: 'string', mandatory: true, description: 'current window end, YYYY-MM-DD' },
    { id: 'mode', as: 'string', defaultValue: 'period', options: 'period,year' },
    { id: 'key', as: 'string', defaultValue: 'name', byName: true, description: 'column matching current rows to previous rows; no overlap ⇒ positional zip' }
  ],
  impl: async (ctx, {}, { source, from, to, mode, key }) => {
    const timeDim = (ctx.vars.cube?.dimensions || []).find(d => d.type == 'timestamp')?.name
    const base = ctx.vars.cubeWhere ? `${ctx.vars.cubeWhere} AND ` : ''
    const windowWhere = (f, t) => `${base}${timeDim} >= DATE '${f}' AND ${timeDim} <= DATE '${t}'`
    const prev = prevRange(from, to, mode)
    const [cur, before] = await Promise.all([
      source(ctx.setVars({ cubeWhere: windowWhere(from, to) })),
      source(ctx.setVars({ cubeWhere: windowWhere(prev.from, prev.to) }))])
    ctx.vars.biLogger?.info?.({ event: 'withPrevPeriod', from, to, prev, curRows: cur.length, prevRows: before.length }, {}, { ctx })
    return zipPrev(cur, before, key)
  }
})

Report('financePeriodCompare', {
  impl: report('period-compare', 'How does this period compare to the previous one?', {
    icon: 'GitCompareArrows',
    // {%$from%}/{%$to%} come from the binding ctx (the dashboard date filter) — pass vars: {from, to} on the runReportBatch entry
    source: withPrevPeriod(cubeQuery('select money_in as "mi", money_out as "mo", fees as "fees", net_flow as "nf"'), '%$from%', '%$to%'),
    widget: ctx => { const c = ctx.data[0] || {}
      return { kind: 'groupedBar', title: 'This period vs previous · USD', valueFormat: '$',
        categories: ['Money in', 'Money out', 'Fees', 'Net flow'],
        series: [{ name: 'Current', values: [c.mi, c.mo, c.fees, c.nf].map(v => +v || 0) },
          { name: 'Previous', values: [c.mi_prev, c.mo_prev, c.fees_prev, c.nf_prev].map(v => +v || 0) }] } },
    narrative: ctx => { const c = ctx.data[0] || {}, pct = (a, b) => +b ? ` (${Math.round((a - b) / Math.abs(+b) * 100)}%)` : ''
      return `Money in **${usd(c.mi)}** — **${usdSigned(c.mi - c.mi_prev)}**${pct(+c.mi, c.mi_prev)} vs the previous period; `
        + `money out **${usd(c.mo)}** (**${usdSigned(c.mo - c.mo_prev)}**); net flow **${usdSigned(c.nf)}** `
        + `vs **${usdSigned(c.nf_prev)}**.`
        + (ctx.vars.depth == 'deep' ? ` Fees moved **${usdSigned(c.fees - c.fees_prev)}** to **${usd(c.fees)}**.` : '') },
    followUps: ['How did money in vs out trend this period?', 'Summarise the period: money in, money out, fees and status counts']
  })
})

Report('financePendingByClient', {
  impl: report('pending-by-client', 'Which clients have unsettled (pending or failed) money?', {
    icon: 'Clock',
    source: cubeQuery(`select Description as "name", any_value(case when Status in ('pending','failed') then Status end) as "st",
      round(sum(case when Status in ('pending','failed') then "Amount (USD)" end)) as "v"
      group by 1 having "v" is not null order by 3 desc limit 5`),
    widget: ctx => ({ kind: 'hbar', title: 'Unsettled by client · USD', valueFormat: '$',
      data: ctx.data.map(r => ({ name: r.name, value: +r.v, color: r.st == 'failed' ? RED : AMBER })) }),
    narrative: ctx => { const rows = ctx.data, t = rows.reduce((a, r) => a + (+r.v || 0), 0)
      return `**${usd(t)}** is still unsettled across your top ${rows.length} counterparties; **${rows[0]?.name}** holds the most (**${usd(rows[0]?.v)}**).` }
  })
})
