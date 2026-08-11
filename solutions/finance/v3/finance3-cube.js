import { dsls, coreUtils, jb } from '@jb6/core'
import '@wonder/bi/metrics.js'
import '@wonder/bi/bi-manifest.js'
import './finance3-etl.js'

const { bi: {
  Cube, SqlModifier, cube: { cube }, 'silver-builder': { finance3SilverBuilder }, 'query-lookup': { lookupByWUrl },
  dimension: { dimension }, metric: { metric, ratio }
}, 'dim-stat': { 'stat-builder': {
  categoricalStat, numericStat, temporalStat, textStat
} } } = dsls

const finance3StarJoin = SqlModifier('finance3StarJoin', {
  impl: () => ({ phase: 'build:0', async modifyAst(sqlAst, ctx) {
    const refs = new Set()
    jb.biUtils.eachNode(sqlAst, node => node.class === 'COLUMN_REF' && refs.add(node.column_names.at(-1)))
    const customer = ['customer_type', 'customer_country', 'loyalty_tier'].some(name => refs.has(name))
    const product = ['product_category', 'brand', 'unit_cost'].some(name => refs.has(name))
    const payment = ['payment_channel', 'payment_provider', 'fee_bps'].some(name => refs.has(name))
    if (!customer && !product && !payment) return { sqlAst, explanation: 'finance3 lookup joins skipped' }
    const stmt = sqlAst.statements[0].node
    const fields = [customer && 'c.customer_type,c.customer_country,c.loyalty_tier',
      product && 'p.product_category,p.brand,p.unit_cost', payment && 'm.payment_channel,m.payment_provider,m.fee_bps'].filter(Boolean)
    const joins = [customer && 'left join {%$customers%} c using(customer_id)', product && 'left join {%$products%} p using(product)',
      payment && 'left join {%$payments%} m using(payment_method)'].filter(Boolean)
    const prelude = coreUtils.embedBraceVars(`with base as (select t.*,${fields.join(',')} from {%$transactions%} t ${joins.join(' ')})`, ctx)
    stmt.cte_map.map = [...(await jb.biUtils.parseSqlAst(`${prelude} select 1`, ctx)).statements[0].node.cte_map.map, ...stmt.cte_map.map]
    stmt.from_table = (await jb.biUtils.parseSqlAst('select 1 from base', ctx)).statements[0].node.from_table
    return { sqlAst, explanation: `finance3 lookup joins: ${[customer && 'customers', product && 'products',
      payment && 'payments'].filter(Boolean).join(', ')}` }
  } })
})

Cube('finance3Cube', {
  impl: cube({
    source: finance3SilverBuilder({
      sourceWUrl: 'room:fs//finance3/usersRO/bronze/dirty_financial_transactions.csv',
      additionalStats: [
        categoricalStat('missing_transaction_id'),
        categoricalStat('invalid_date'),
        numericStat('quantity'),
        numericStat('price'),
        numericStat('transaction_value'),
        numericStat('unit_cost'),
        numericStat('fee_bps')
      ]
    }),
    wUrlBase: 'room://finance3/usersRO',
    cacheStrategy: 'colsCache',
    dimensions: [
      dimension('date', temporalStat(), { type: 'timestamp' }),
      dimension('source_date_quality', categoricalStat()),
      dimension('transaction_id', textStat()),
      dimension('customer_id', textStat()),
      dimension('product', categoricalStat()),
      dimension('payment_method', categoricalStat()),
      dimension('status', categoricalStat()),
      dimension('has_quality_issue', categoricalStat(), { type: 'boolean' }),
      dimension('customer_type', categoricalStat()),
      dimension('customer_country', categoricalStat()),
      dimension('loyalty_tier', categoricalStat()),
      dimension('product_category', categoricalStat()),
      dimension('brand', categoricalStat()),
      dimension('payment_channel', categoricalStat()),
      dimension('payment_provider', categoricalStat())
    ],
    metrics: [
      metric('txns', 'count', { unit: 'int' }),
      metric('customers', 'distinctCount(customer_id)', { unit: 'int' }),
      metric('units', 'round(sum(case when quantity>=0 then quantity end),2)'),
      metric('gross_value', 'round(sum(transaction_value),2)', { unit: '$' }),
      metric('completed_value', "round(sum(case when status='completed' then transaction_value end),2)", { unit: '$' }),
      metric('estimated_cost', 'round(sum(case when quantity>=0 then quantity*unit_cost end),2)', { unit: '$' }),
      metric('payment_fees', 'round(sum(transaction_value*fee_bps/10000),2)', { unit: '$' }),
      metric('completed_n', "sum(status='completed')", { unit: 'int' }),
      metric('failed_n', "sum(status='failed')", { unit: 'int' }),
      metric('quality_issue_n', 'sum(has_quality_issue)', { unit: 'int' }),
      metric('missing_id_n', 'sum(missing_transaction_id)', { unit: 'int' }),
      metric('invalid_date_n', 'sum(invalid_date)', { unit: 'int' }),
      ratio('completion_rate', 'completed_n/txns'),
      ratio('quality_issue_rate', 'quality_issue_n/txns'),
      ratio('gross_margin', '(gross_value-estimated_cost)/gross_value')
    ],
    queryLookups: [
      lookupByWUrl('silver/customers.parquet', 'customers',
        { ensureCols: ['customer_id', 'customer_type', 'customer_country', 'loyalty_tier'] }),
      lookupByWUrl('silver/products.parquet', 'products', { ensureCols: ['product', 'product_category', 'brand', 'unit_cost'] }),
      lookupByWUrl('silver/payments.parquet', 'payments', { ensureCols: ['payment_method', 'payment_channel', 'payment_provider', 'fee_bps'] })
    ],
    sqlModifiers: [finance3StarJoin()]
  })
})
