import { dsls, jb } from '@jb6/core'
import '@wonder/db/db-drivers.js'
const { wfetch2 } = jb.wonderUtils
import '@wonder/bi/duckdb-utils.js'
import '@wonder/bi/bi-etl.js'

const { common: { Data } } = dsls
const room = 'room://finance2/usersRO', tmp = name => `/tmp/finance2-${name}.parquet`
const symbols = [
  ['channel.bank', '🏦', 'Bank payment channel'], ['channel.card', '💳', 'Card payment channel'],
  ['channel.wallet', '👛', 'Digital wallet channel'], ['account.operating', '🏢', 'Operating accounts'],
  ['account.collections', '📥', 'Collection accounts'], ['account.reserve', '🛡️', 'Reserve accounts'],
  ['account.payout', '📤', 'Payout accounts'], ['transaction.collections', '📥', 'Incoming revenue'],
  ['transaction.disbursements', '📤', 'Supplier and contractor payments'], ['transaction.treasury', '🏦', 'Treasury movement'],
  ['transaction.adjustments', '⚖️', 'Refunds and chargebacks'], ['method.ach', '↔', 'ACH transfer'],
  ['method.wire', '⚡', 'Wire transfer'], ['method.sepa', '🇪🇺', 'SEPA transfer'], ['method.visa', 'V', 'Visa card'],
  ['method.mastercard', '◎', 'Mastercard'], ['method.amex', 'A', 'American Express'], ['method.paypal', 'P', 'PayPal'],
  ['method.wallet', '◉', 'Digital wallet'], ['transaction.client', '👤', 'Client payment'],
  ['transaction.marketplace', '🛒', 'Marketplace payment'], ['transaction.supplier', '📦', 'Supplier payment'],
  ['transaction.contractor', '🛠️', 'Contractor payout'], ['transaction.withdrawal', '↓', 'Bank withdrawal'],
  ['transaction.transfer', '⇄', 'Internal transfer'], ['transaction.refund', '↩', 'Customer refund'],
  ['transaction.chargeback', '⚠️', 'Chargeback']
]
const values = rows => rows.map(row => `(${row.map(x => `'${String(x).replaceAll("'", "''")}'`).join(',')})`).join(',')
const lookups = {
  symbols: `select * from (values ${values(symbols)}) t(id,symbol,description)`,
  counterparties: `select 'cp-'||lpad(i::varchar,3,'0') counterparty_id, 'Counterparty '||lpad(i::varchar,3,'0') counterparty,
    ['Enterprise','Mid-market','SMB'][1+(i*7%3)] segment, ['US','DE','GB','FR','CA'][1+(i*11%5)] country,
    ['Low','Medium','High'][1+(i*13%3)] risk_tier, i%17=0 strategic from range(200) t(i)`,
  accounts: `select * from (values
    ('op-usd','Operating','Main operating USD','USD'),('op-eur','Operating','European operating EUR','EUR'),
    ('op-gbp','Operating','UK operating GBP','GBP'),('col-online','Collections','Online collections USD','USD'),
    ('col-enterprise','Collections','Enterprise collections USD','USD'),('col-eur','Collections','European collections EUR','EUR'),
    ('res-chargeback','Reserve','Chargeback reserve USD','USD'),('res-tax','Reserve','Tax reserve USD','USD'),
    ('res-supplier','Reserve','Supplier reserve EUR','EUR'),('pay-supplier','Payout','Supplier payouts USD','USD'),
    ('pay-contractor','Payout','Contractor payouts USD','USD'),('pay-global','Payout','International payouts EUR','EUR'))
    t(account_id,account_group,account,currency)`,
  payment_methods: `select * from (values
    ('ach','Bank','ACH',20,2),('wire','Bank','Wire',45,1),('sepa','Bank','SEPA',25,2),
    ('visa','Card','Visa',140,2),('mastercard','Card','Mastercard',150,2),('amex','Card','Amex',220,3),
    ('paypal','Wallet','PayPal',190,1),('wallet','Wallet','Digital wallet',170,1))
    t(payment_method_id,payment_channel,payment_method,expected_fee_bps,settlement_days)`,
  transaction_types: `select * from (values
    ('client','Collections','Client payment','in'),('marketplace','Collections','Marketplace payment','in'),
    ('supplier','Disbursements','Supplier payment','out'),('contractor','Disbursements','Contractor payout','out'),
    ('withdrawal','Treasury','Bank withdrawal','out'),('transfer','Treasury','Internal transfer','out'),
    ('refund','Adjustments','Refund','out'),('chargeback','Adjustments','Chargeback','out'))
    t(transaction_type_id,transaction_group,transaction_type,direction)`
}
const rows = `with base as (select i, date '2025-01-01'+(i*17%365)::integer date,
  'cp-'||lpad((i*37%200)::varchar,3,'0') counterparty_id,
  ['op-usd','op-eur','op-gbp','col-online','col-enterprise','col-eur','res-chargeback','res-tax','res-supplier',
    'pay-supplier','pay-contractor','pay-global'][1+(i*19%12)] account_id,
  ['ach','wire','sepa','visa','mastercard','amex','paypal','wallet'][1+(i*23%8)] payment_method_id,
  ['client','marketplace','supplier','contractor','withdrawal','transfer','refund','chargeback'][1+(i*29%8)] transaction_type_id
  from range(100000) t(i))
  select i::bigint transaction_id,date,counterparty_id,account_id,payment_method_id,transaction_type_id,
  case when i*31%20<16 then 'completed' when i*31%20<18 then 'pending' else 'failed' end status,
  round(50+(i*43%5000)*.73,2) amount_usd,
  round((50+(i*43%5000)*.73)*([22,42,37,132,155,238,184,180][1+(i*23%8)]+case
    when ((i*37%200)*13+quarter(date)*17)%397=0 then 600
    when ((i*37%200)*13+quarter(date)*17)%79=0 then 180
    when ((i*37%200)*13+quarter(date)*17)%17=0 then 45 else i*47%7-3 end)/10000,2) fee_usd from base`

Data('finance2BuildData', {
  impl: async ctx => {
    const raw = '/tmp/finance.parquet', mqy = '/tmp/finance-mqy.parquet', files = Object.keys(lookups).map(name => [tmp(name), `${room}/${name}.parquet`])
    const sql = [`copy (${rows}) to '${raw}' (format parquet, compression zstd)`,
      ...Object.entries(lookups).map(([name, query]) => `copy (${query}) to '${tmp(name)}' (format parquet, compression zstd)`)].join(';')
    const { error, stderr } = await jb.biUtils.runDuckdbSqlByHost(sql, ctx, { as: 'nonQuery' })
    if (error) throw new Error(stderr)
    const segments = await jb.biUtils.writeMonthQuarterYearParquet({ source: raw, outFile: mqy, dateColumn: 'date' })
    files.push([raw, `${room}/bronze/finance.parquet`], [mqy, `${room}/finance-mqy.parquet`])
    await Promise.all(files.map(([file, url]) =>
      wfetch2(url, { method: 'PUT', body: file, headers: { 'x-wonder-body': 'localFile' } }, ctx)))
    await Promise.all(files.map(([file]) => import('fs/promises').then(fs => fs.rm(file))))
    return { rows: 100000, segments, files: files.map(([, url]) => url) }
  }
})
