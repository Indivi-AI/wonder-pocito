import { dsls, coreUtils, jb } from '@jb6/core'
import '@wonder/bi/metrics.js'
import '@wonder/bi/bi-dsl.js'

const {
  bi: {
    Cube, SqlModifier, Hierarchy, cube: { cube }, 'silver-builder': { parquetSource },
    'query-lookup': { lookupByWUrl }, dimension: { dimension }, metric: { metric, ratio }, hierarchy: { geoHierarchy }
  }
} = dsls
const room = 'room://finance2/usersRO'
const paymentMethodHierarchy = Hierarchy('finance2.paymentMethodHierarchy', {
  impl: geoHierarchy(['payment_method', 'payment_channel'])
})
const accountHierarchy = Hierarchy('finance2.accountHierarchy', {
  impl: geoHierarchy(['account', 'account_group'])
})
const transactionTypeHierarchy = Hierarchy('finance2.transactionTypeHierarchy', {
  impl: geoHierarchy(['transaction_type', 'transaction_group'])
})

const finance2StarJoin = SqlModifier('finance2StarJoin', {
  impl: () => ({ phase: 'build:0', async modifyAst(sqlAst, ctx) {
    const stmt = sqlAst.statements[0].node
    const prelude = coreUtils.embedBraceVars(`with base as (select t.*,c.counterparty,c.segment,c.country,c.risk_tier,c.strategic,
      a.account_group,a.account,a.currency,p.payment_channel,p.payment_method,p.expected_fee_bps,p.settlement_days,
      x.transaction_group,x.transaction_type,x.direction,cs.symbol payment_channel_symbol,ms.symbol payment_method_symbol,
      ags.symbol account_group_symbol,tgs.symbol transaction_group_symbol,tts.symbol transaction_type_symbol
      from {%$transactions%} t join {%$counterparties%} c using(counterparty_id) join {%$accounts%} a using(account_id)
      join {%$paymentMethods%} p using(payment_method_id) join {%$transactionTypes%} x using(transaction_type_id)
      join {%$symbols%} cs on cs.id='channel.'||lower(p.payment_channel)
      join {%$symbols%} ms on ms.id='method.'||p.payment_method_id
      join {%$symbols%} ags on ags.id='account.'||lower(a.account_group)
      join {%$symbols%} tgs on tgs.id='transaction.'||lower(x.transaction_group)
      join {%$symbols%} tts on tts.id='transaction.'||x.transaction_type_id)`, ctx)
    const starMap = (await jb.biUtils.parseSqlAst(`${prelude} select 1`, ctx)).statements[0].node.cte_map.map
    stmt.cte_map.map = [...starMap, ...stmt.cte_map.map]
    stmt.from_table = (await jb.biUtils.parseSqlAst('select 1 from base', ctx)).statements[0].node.from_table
    return { sqlAst, explanation: 'finance2 star join' }
  } })
})

Cube('finance2Cube', {
  impl: cube({
    wUrlBase: room,
    source: parquetSource('finance-mqy.parquet', 'transactions', { keyField: 'transaction_id' }),
    cacheStrategy: 'colsCache',
    dimensions: [
      dimension('date', { type: 'timestamp' }), dimension('counterparty'), dimension('segment'), dimension('country'),
      dimension('risk_tier'), dimension('account_group'),
      dimension('account', { parent: 'account_group', hierarchy: accountHierarchy() }), dimension('currency'),
      dimension('payment_channel'), dimension('payment_channel_symbol'),
      dimension('payment_method', { parent: 'payment_channel', hierarchy: paymentMethodHierarchy() }), dimension('payment_method_symbol'),
      dimension('status', { values: ['completed', 'pending', 'failed'] }), dimension('direction'),
      dimension('transaction_group'), dimension('transaction_group_symbol'),
      dimension('transaction_type', { parent: 'transaction_group', hierarchy: transactionTypeHierarchy() }),
      dimension('transaction_type_symbol')
    ],
    metrics: [
      metric('txns', 'count', { unit: 'int' }),
      metric('money_in', "round(sum(case when direction='in' and status='completed' then amount_usd end),2)", { unit: '$' }),
      metric('money_out', "round(sum(case when direction='out' and status='completed' then amount_usd end),2)", { unit: '$' }),
      metric('fees', "round(sum(case when status='completed' then fee_usd end),2)", { unit: '$' }),
      metric('expected_fees',
        "round(sum(case when status='completed' then amount_usd*expected_fee_bps/10000 end),2)", { unit: '$' }),
      metric('fee_leakage',
        "round(sum(case when status='completed' then fee_usd-amount_usd*expected_fee_bps/10000 end),2)", { unit: '$' }),
      metric('settled_volume', "round(sum(case when status='completed' then amount_usd end),2)", { unit: '$' }),
      ratio('fee_rate_bps', 'fees/settled_volume', { scale: 10000, unit: 'bps', description: 'fees per settled dollar' }),
      metric('net_flow', "round(sum(case when status='completed' then case when direction='in' then amount_usd else -amount_usd end end),2)", { unit: '$' }),
      metric('failed_n', "sum(case when status='failed' then 1 else 0 end)", { unit: 'int' }),
      ratio('failed_rate', 'failed_n/txns', { description: 'failed transactions as a share of all transactions' })
    ],
    queryLookups: [
      lookupByWUrl('counterparties.parquet', 'counterparties', {
        ensureCols: ['counterparty_id', 'counterparty', 'segment', 'country', 'risk_tier', 'strategic']
      }),
      lookupByWUrl('accounts.parquet', 'accounts', { ensureCols: ['account_id', 'account_group', 'account', 'currency'] }),
      lookupByWUrl('payment_methods.parquet', 'paymentMethods', {
        ensureCols: ['payment_method_id', 'payment_channel', 'payment_method', 'expected_fee_bps', 'settlement_days']
      }),
      lookupByWUrl('transaction_types.parquet', 'transactionTypes', {
        ensureCols: ['transaction_type_id', 'transaction_group', 'transaction_type', 'direction']
      }),
      lookupByWUrl('symbols.parquet', 'symbols', { ensureCols: ['id', 'symbol', 'description'] })
    ],
    sqlModifiers: [finance2StarJoin()]
  })
})
