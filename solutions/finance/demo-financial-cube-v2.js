import { dsls, coreUtils, jb } from '@jb6/core'
import '@wonder/bi/metrics.js'
import '@wonder/bi/report-catalog.js'
import '@wonder/bi/bi-manifest.js'
import './v3/finance3-etl.js'

const {
  bi: {
    Cube, Report, SqlModifier, cube: { cube }, 'silver-builder': { finance3SilverBuilder },
    'query-lookup': { lookupByWUrl }, dimension: { dimension }, metric: { metric, ratio }, report: { report }
  },
  common: { data: { cubeQuery } }
} = dsls

const demoFinancialStarJoinV2 = SqlModifier('demoFinancialStarJoinV2', {
  impl: () => ({ phase: 'build:0', async modifyAst(sqlAst, ctx) {
    const where = ctx.vars.cubeWhere || '', refs = new Set()
    jb.biUtils.eachNode(sqlAst, node => node.class === 'COLUMN_REF' && refs.add(node.column_names.at(-1)))
    const customer = ['customer_type', 'customer_country', 'loyalty_tier'].some(name => refs.has(name) || where.includes(name))
    const product = ['product_category', 'brand', 'unit_cost'].some(name => refs.has(name) || where.includes(name))
    const payment = ['payment_channel', 'payment_provider', 'fee_bps'].some(name => refs.has(name) || where.includes(name))
    if (!customer && !product && !payment) return { sqlAst, explanation: 'demo financial lookup joins skipped' }
    const stmt = sqlAst.statements[0].node
    const fields = [customer && 'c.customer_type,c.customer_country,c.loyalty_tier',
      product && 'p.product_category,p.brand,p.unit_cost',
      payment && 'm.payment_channel,m.payment_provider,m.fee_bps'].filter(Boolean)
    const joins = [customer && 'left join {%$customers%} c using(customer_id)',
      product && 'left join {%$products%} p using(product)',
      payment && 'left join {%$payments%} m using(payment_method)'].filter(Boolean)
    const prelude = coreUtils.embedBraceVars(
      `with base as (select t.*,${fields.join(',')} from {%$transactions%} t ${joins.join(' ')} ${where ? `where ${where}` : ''})`, ctx)
    stmt.cte_map.map = [...(await jb.biUtils.parseSqlAst(`${prelude} select 1`, ctx)).statements[0].node.cte_map.map, ...stmt.cte_map.map]
    stmt.from_table = (await jb.biUtils.parseSqlAst('select 1 from base', ctx)).statements[0].node.from_table
    return { sqlAst, explanation: `demo financial lookup joins: ${[customer && 'customers', product && 'products', payment && 'payments'].filter(Boolean).join(', ')}` }
  } })
})

Cube('demoFinanacialCubeV2', {
  impl: cube({
    source: finance3SilverBuilder({
      sourceWUrl: 'room:fs//finance3/usersRO/bronze/dirty_financial_transactions.csv'
    }),
    wUrlBase: 'room://finance3/usersRO',
    cacheStrategy: 'colsCache',
    dimensions: [
      dimension('date', { type: 'timestamp', guidance: 'transaction date; group with date_trunc(day|week|month)' }),
      dimension('transaction_id', { guidance: 'business transaction identifier; some source rows are missing it' }),
      dimension('customer_id', { guidance: 'customer identifier; group with LIMIT for top-customer analysis' }),
      dimension('product', { values: ['Laptop', 'Tablet', 'Smartphone', 'Headphones', 'Coffee Machine'] }),
      dimension('payment_method', { values: ['Cash', 'Credit Card', 'PayPal'] }),
      dimension('status', { values: ['completed', 'pending', 'failed', 'unknown'] }),
      dimension('has_quality_issue', { type: 'boolean', guidance: 'source completeness flag' }),
      dimension('source_date_quality', { values: ['valid', 'invalid'] }),
      dimension('customer_type', { values: ['Consumer', 'SMB', 'Enterprise'] }),
      dimension('customer_country', { values: ['US', 'UK', 'DE', 'FR', 'CA'] }),
      dimension('loyalty_tier', { values: ['Bronze', 'Silver', 'Gold'] }),
      dimension('product_category', { values: ['Computers', 'Mobile', 'Audio', 'Appliances'] }),
      dimension('brand', { values: ['Northstar', 'Orbit', 'Echo', 'Hearth'] }),
      dimension('payment_channel', { values: ['Offline', 'Card', 'Wallet'] }),
      dimension('payment_provider', { values: ['Cash', 'Card Network', 'PayPal'] })
    ],
    metrics: [
      metric('txns', 'count', { unit: 'int', description: 'all transactions' }),
      metric('customers', 'distinctCount(customer_id)', { unit: 'int', description: 'distinct customers' }),
      metric('valid_sales_n', 'sum(quantity>0 and price>0)', { unit: 'int', description: 'rows with positive quantity and price' }),
      metric('completed_sales_n', "sum(status='completed' and quantity>0 and price>0)", { unit: 'int' }),
      metric('units', 'round(sum(case when quantity>0 and price>0 then quantity end),2)', { description: 'business-valid units sold' }),
      metric('gross_value', 'round(sum(case when quantity>0 and price>0 then transaction_value end),2)', {
        unit: '$', description: 'value of rows with positive quantity and price'
      }),
      metric('completed_value', "round(sum(case when status='completed' and quantity>0 and price>0 then transaction_value end),2)", {
        unit: '$', description: 'completed transaction value'
      }),
      metric('estimated_cost', "round(sum(case when status='completed' and quantity>0 and price>0 then quantity*unit_cost end),2)", {
        unit: '$', description: 'estimated product cost for completed transactions'
      }),
      metric('payment_fees', "round(sum(case when status='completed' and quantity>0 and price>0 then transaction_value*fee_bps/10000 end),2)", {
        unit: '$', description: 'estimated payment fees for completed transactions'
      }),
      metric('gross_profit', 'completed_value-estimated_cost-payment_fees', {
        unit: '$', description: 'completed value minus estimated cost and payment fees'
      }),
      metric('pending_value', "round(sum(case when status='pending' and quantity>0 and price>0 then transaction_value end),2)", {
        unit: '$', description: 'transaction value still pending'
      }),
      metric('failed_value', "round(sum(case when status='failed' and quantity>0 and price>0 then transaction_value end),2)", {
        unit: '$', description: 'value of failed transactions'
      }),
      metric('completed_n', "sum(status='completed')", { unit: 'int' }),
      metric('pending_n', "sum(status='pending')", { unit: 'int' }),
      metric('failed_n', "sum(status='failed')", { unit: 'int' }),
      metric('quality_issue_n', 'sum(has_quality_issue or quantity<=0 or price<=0)', { unit: 'int' }),
      metric('missing_id_n', 'sum(missing_transaction_id)', { unit: 'int' }),
      metric('invalid_date_n', 'sum(invalid_date)', { unit: 'int' }),
      ratio('completion_rate', 'completed_n/txns', { description: 'completed transactions as a percent of all transactions' }),
      ratio('failure_rate', 'failed_n/txns', { description: 'failed transactions as a percent of all transactions' }),
      ratio('quality_issue_rate', 'quality_issue_n/txns', { description: 'transactions carrying a source-quality issue' }),
      ratio('gross_margin', 'gross_profit/completed_value', { description: 'gross profit as a percent of completed value' }),
      ratio('avg_order_value', 'completed_value/completed_sales_n', {
        scale: 1, unit: '$', description: 'average business-valid completed transaction value'
      })
    ],
    queryLookups: [
      lookupByWUrl('silver/customers.parquet', 'customers', {
        ensureCols: ['customer_id', 'customer_type', 'customer_country', 'loyalty_tier']
      }),
      lookupByWUrl('silver/products.parquet', 'products', { ensureCols: ['product', 'product_category', 'brand', 'unit_cost'] }),
      lookupByWUrl('silver/payments.parquet', 'payments', {
        ensureCols: ['payment_method', 'payment_channel', 'payment_provider', 'fee_bps']
      })
    ],
    sqlModifiers: [demoFinancialStarJoinV2()],
    limits: [
      'transaction_value is quantity × price and has no currency column; all money is displayed as dataset dollars',
      'sales metrics include only rows with positive quantity and price; transaction counts retain all source rows',
      'estimated cost and payment fees come from lookup assumptions, not accounting records',
      'the data has no wallet balance, cash direction, payouts, invoices or bank reconciliation',
      'anchor relative dates to max(date), never the wall clock'
    ]
  })
})

const money = n => '$' + Math.round(+n || 0).toLocaleString()
const colors = ['#FF4800', '#FDBCA6', '#334155', '#1FA971', '#E8A317']

Report('demoFinancialSummary', {
  impl: report('portfolio-summary', 'Summarise portfolio value, profit, fees and quality', {
    source: cubeQuery(`select txns,customers,gross_value,completed_value,estimated_cost,payment_fees,gross_profit,
      pending_value,failed_value,completion_rate,failure_rate,quality_issue_rate,gross_margin,avg_order_value`),
    widget: ctx => ({ kind: 'table', title: 'Portfolio summary', rows: ctx.data,
      columns: Object.keys(ctx.data[0] || {}).map(key => ({ key, label: key.replace(/_/g, ' ') })) }),
    narrative: ctx => { const r = ctx.data[0] || {}
      return `Completed value is **${money(r.completed_value)}** with **${money(r.gross_profit)}** gross profit at a **${r.gross_margin || 0}%** margin.` },
    icon: 'Gauge'
  })
})

Report('demoFinancialRevenueTrend', {
  impl: report('revenue-trend', 'How are completed value and gross profit trending?', {
    icon: 'ChartNoAxesCombined',
    source: cubeQuery(`select strftime(date_trunc(case when '{%$gran%}' in ('','undefined') then 'month' else '{%$gran%}' end,date),'%Y-%m-%d') as "x",
      completed_value as "value",gross_profit as "profit" group by 1 order by 1`),
    widget: ctx => ({ kind: 'area', title: 'Completed value and gross profit', valueFormat: '$', xType: 'category',
      series: [{ name: 'Completed value', points: ctx.data.map(r => ({ x: r.x, y: +r.value || 0 })) },
        { name: 'Gross profit', points: ctx.data.map(r => ({ x: r.x, y: +r.profit || 0 })) }] }),
    narrative: ctx => { const rows = ctx.data, revenue = rows.reduce((sum, r) => sum + (+r.value || 0), 0)
      return `The selected period produced **${money(revenue)}** in completed value across ${rows.length} time buckets.` },
    followUps: ['Which products generate the most profit?', 'Which customer segments have the best completion rate?']
  })
})

Report('demoFinancialTopCustomers', {
  impl: report('top-customers', 'Who are the top customers by completed value?', {
    icon: 'Users',
    source: cubeQuery(`select customer_id as "name",completed_value as "value" group by 1
      having customer_id is not null and completed_value is not null order by 2 desc limit 8`),
    widget: ctx => ({ kind: 'hbar', title: 'Top customers', valueFormat: '$',
      data: ctx.data.map((r, i) => ({ name: r.name || 'Missing customer ID', value: +r.value, color: colors[i ? 1 : 0] })) }),
    narrative: ctx => `**${ctx.data[0]?.name || 'No customer'}** leads completed value at **${money(ctx.data[0]?.value)}**.`,
    followUps: ['Which customer segments deserve investment?', 'Show the top products for completed sales']
  })
})

Report('demoFinancialTopProducts', {
  impl: report('top-products', 'Which products generate the most completed value?', {
    icon: 'Package',
    source: cubeQuery(`select product as "name",completed_value as "value" group by 1
      having completed_value is not null order by 2 desc`),
    widget: ctx => ({ kind: 'bar', title: 'Completed value by product', valueFormat: '$',
      data: ctx.data.map((r, i) => ({ name: r.name, value: +r.value, color: colors[i % colors.length] })) }),
    narrative: ctx => `**${ctx.data[0]?.name || 'No product'}** is the leading product at **${money(ctx.data[0]?.value)}** completed value.`,
    followUps: ['Compare product revenue and estimated cost', 'Which payment channels sell each product?']
  })
})

Report('demoFinancialFeesByMethod', {
  impl: report('fees-by-method', 'How much do payment methods cost?', {
    icon: 'Receipt',
    source: cubeQuery(`select payment_method as "name",payment_fees as "value" group by 1
      having payment_fees is not null order by 2 desc`),
    widget: ctx => ({ kind: 'bar', title: 'Payment fees by method', valueFormat: '$',
      data: ctx.data.map((r, i) => ({ name: r.name, value: +r.value, color: colors[i % colors.length] })) }),
    narrative: ctx => `**${ctx.data[0]?.name || 'No method'}** carries the most estimated fees at **${money(ctx.data[0]?.value)}**.`,
    followUps: ['Compare completion rate by payment method', 'Show payment fees by customer segment']
  })
})

Report('demoFinancialStatusMix', {
  impl: report('status-mix', 'What is the transaction completion and failure mix?', {
    icon: 'ShieldCheck',
    source: cubeQuery('select status as "name",txns as "value" group by 1 order by 2 desc'),
    widget: ctx => ({ kind: 'pie', donut: true, showLegend: true, title: 'Transactions by status', valueFormat: 'int',
      data: ctx.data.map(r => ({ name: r.name, value: +r.value,
        color: r.name == 'completed' ? '#1FA971' : r.name == 'failed' ? '#D64545' : '#E8A317' })) }),
    narrative: ctx => { const total = ctx.data.reduce((sum, r) => sum + +r.value, 0), completed = ctx.data.find(r => r.name == 'completed')?.value || 0
      return `**${Math.round(completed / (total || 1) * 100)}%** of transactions are completed (${completed.toLocaleString()} of ${total.toLocaleString()}).` },
    followUps: ['Which products have the highest failure rate?', 'Compare status by payment channel']
  })
})

Report('demoFinancialCustomerSegments', {
  impl: report('customer-segments', 'Which customer segments deserve investment?', {
    icon: 'ChartPie',
    source: cubeQuery(`select customer_type as "name",completed_value as "value" group by 1
      having customer_type is not null and completed_value is not null order by 2 desc`),
    widget: ctx => ({ kind: 'pie', donut: true, showLegend: true, title: 'Completed value by customer segment', valueFormat: '$',
      data: ctx.data.map((r, i) => ({ name: r.name, value: +r.value, color: colors[i % colors.length] })) }),
    narrative: ctx => `**${ctx.data[0]?.name || 'No segment'}** leads completed value at **${money(ctx.data[0]?.value)}**.`,
    followUps: ['Compare margin by customer segment', 'Show segment performance by country']
  })
})

Report('demoFinancialQualityRisk', {
  impl: report('quality-risk', 'Where are the source-data quality issues?', {
    icon: 'TriangleAlert',
    source: cubeQuery(`select product as "name",quality_issue_n as "value" group by 1
      having quality_issue_n is not null order by 2 desc`),
    widget: ctx => ({ kind: 'hbar', title: 'Quality issues by product', valueFormat: 'int',
      data: ctx.data.map((r, i) => ({ name: r.name, value: +r.value, color: i ? '#FDBCA6' : '#D64545' })) }),
    narrative: ctx => `**${ctx.data[0]?.name || 'No product'}** has the most flagged source rows (${(+ctx.data[0]?.value || 0).toLocaleString()}).`,
    followUps: ['How many transaction IDs are missing?', 'Compare quality issue rate by customer segment']
  })
})

Report('demoFinancialProfitability', {
  impl: report('profitability', 'Compare revenue, cost and gross profit by product category', {
    icon: 'BadgeDollarSign',
    source: cubeQuery(`select product_category as "name",completed_value as "revenue",
      estimated_cost as "cost",gross_profit as "profit" group by 1 order by 2 desc`),
    widget: ctx => ({ kind: 'groupedBar', title: 'Profitability by product category', valueFormat: '$',
      categories: ctx.data.map(r => r.name), series: [
        { name: 'Completed value', values: ctx.data.map(r => +r.revenue || 0) },
        { name: 'Estimated cost', values: ctx.data.map(r => +r.cost || 0) },
        { name: 'Gross profit', values: ctx.data.map(r => +r.profit || 0) }
      ] }),
    narrative: ctx => `**${ctx.data[0]?.name || 'No category'}** leads completed value at **${money(ctx.data[0]?.revenue)}**.`,
    followUps: ['Which products generate the best gross margin?', 'Compare payment fees by product category']
  })
})
