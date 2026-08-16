import { dsls, jb } from '@jb6/core'
import '@wonder/db/db-drivers.js'
import '@wonder/db/etl/etl-dsl.js'
import '@wonder/bi/bi-dsl.js'
import '@wonder/bi/dimention-stat-dsl.js'

const { wresolve } = jb.wonderUtils
const { tgp: { Component }, bi: { SilverBuilder },
  etl: { etl: { etls, cliEtl, dimensionStatsMacroFile }, 'cli-extract': { localFile },
    'cli-transform': { duckdb, dimensionStats }, 'cli-load': { copyToFile } }
} = dsls

const finance3ParquetWithStats = Component('finance3ParquetWithStats', {
  moreTypes: 'etl<etl>', params: [
    { id: 'dataFile', as: 'string' }, { id: 'statsFile', as: 'string' }, { id: 'outFile', as: 'string' }
  ],
  impl: cliEtl({
    extract: localFile('%$dataFile%'), moreFiles: [localFile('%$statsFile%')],
    transform: duckdb(`select * from read_json_auto('{%$inputFile%}')`, {
      format: `PARQUET, COMPRESSION ZSTD, KV_METADATA {'dimension-stats': getvariable('dimension_stats')}`,
      prelude: `set variable dimension_stats=(select content from read_text('{%$moreFile0%}'));`
    }),
    load: copyToFile('%$outFile%')
  })
})

const finance3Transactions = Component('finance3Transactions', {
  moreTypes: 'etl<etl>', params: [{ id: 'source', as: 'string' }],
  impl: cliEtl({
      extract: localFile('%$source%'),
      transform: duckdb(`with raw as (select row_number() over() source_row,*
        from read_csv_auto('{%$inputFile%}',all_varchar=true)), typed as (select source_row,
        nullif(trim(Transaction_ID),'') transaction_id,date '2020-01-01'+((source_row-1)%2008)::int date,
        case when try_strptime(trim(Transaction_Date),'%Y-%m-%d') is null then 'invalid' else 'valid' end source_date_quality,
        nullif(trim(Customer_ID),'') customer_id,
        case upper(left(trim(Product_Name),1)) when 'L' then 'Laptop' when 'T' then 'Tablet' when 'S' then 'Smartphone'
          when 'H' then 'Headphones' when 'C' then 'Coffee Machine' else trim(Product_Name) end product,
        try_cast(Quantity as double) quantity,try_cast(replace(trim(Price),'$','') as double) price,
        case lower(replace(trim(Payment_Method),' ','')) when 'paypal' then 'PayPal' when 'creditcard' then 'Credit Card'
          when 'cash' then 'Cash' else trim(Payment_Method) end payment_method,
        case lower(trim(Transaction_Status)) when 'complete' then 'completed' when 'success' then 'completed'
          when 'declined' then 'failed' when 'cancelled' then 'failed' when '' then 'unknown'
          else coalesce(lower(trim(Transaction_Status)),'unknown') end status,
        nullif(trim(Transaction_ID),'') is null missing_transaction_id,
        try_strptime(trim(Transaction_Date),'%Y-%m-%d') is null invalid_date from raw)
        select *,round(quantity*price,2) transaction_value,
          (missing_transaction_id or invalid_date or customer_id is null or quantity is null or price is null) has_quality_issue from typed`,
        { format: 'JSON, ARRAY false' }),
      load: copyToFile('/tmp/finance3-transactions.jsonl')
    })
})

const finance3Customers = Component('finance3Customers', {
  moreTypes: 'etl<etl>', params: [{ id: 'source', as: 'string' }],
  impl: cliEtl({
      extract: localFile('%$source%'),
      transform: duckdb(`with ids as (select distinct nullif(trim(Customer_ID),'') customer_id
        from read_csv_auto('{%$inputFile%}',all_varchar=true)), numbered as
        (select customer_id,coalesce(try_cast(regexp_extract(customer_id,'[0-9]+') as integer),0) n from ids where customer_id is not null)
        select customer_id,['Consumer','SMB','Enterprise'][1+n%3] customer_type,
          ['US','UK','DE','FR','CA'][1+n%5] customer_country,['Bronze','Silver','Gold'][1+n%3] loyalty_tier from numbered`,
        { format: 'JSON, ARRAY false' }),
      load: copyToFile('/tmp/finance3-customers.jsonl')
    })
})

const finance3Products = Component('finance3Products', {
  moreTypes: 'etl<etl>',
  impl: cliEtl({
      extract: localFile('/tmp/finance3-transactions.jsonl'),
      transform: duckdb(`select * from (values ('Laptop','Computers','Northstar',620),('Tablet','Computers','Northstar',280),
        ('Smartphone','Mobile','Orbit',410),('Headphones','Audio','Echo',55),('Coffee Machine','Appliances','Hearth',95))
        t(product,product_category,brand,unit_cost)`, { format: 'JSON, ARRAY false' }),
      load: copyToFile('/tmp/finance3-products.jsonl')
    })
})

const finance3Payments = Component('finance3Payments', {
  moreTypes: 'etl<etl>',
  impl: cliEtl({
      extract: localFile('/tmp/finance3-transactions.jsonl'),
      transform: duckdb(`select * from (values ('Cash','Offline','Cash',0),('Credit Card','Card','Card Network',290),
        ('PayPal','Wallet','PayPal',340)) t(payment_method,payment_channel,payment_provider,fee_bps)`, { format: 'JSON, ARRAY false' }),
      load: copyToFile('/tmp/finance3-payments.jsonl')
    })
})

const finance3FactStats = Component('finance3FactStats', {
  moreTypes: 'etl<etl>', params: [{ id: 'statBuilders', type: 'stat-builder<dim-stat>[]' }], impl: etls(
    cliEtl({
      extract: localFile('/tmp/finance3-transactions.jsonl'), moreFiles: [localFile('/tmp/finance3-customers.jsonl'),
        localFile('/tmp/finance3-products.jsonl'), localFile('/tmp/finance3-payments.jsonl')],
      transform: dimensionStats('%$statBuilders%', {
        namespace: 'finance3.all', from: `(select t.*,c.customer_type,c.customer_country,c.loyalty_tier,
        p.product_category,p.brand,p.unit_cost,m.payment_channel,m.payment_provider,m.fee_bps
        from read_json_auto('{%$inputFile%}') t left join read_json_auto('{%$moreFile0%}') c using(customer_id)
        left join read_json_auto('{%$moreFile1%}') p using(product)
        left join read_json_auto('{%$moreFile2%}') m using(payment_method)) fact` }),
      load: copyToFile('/tmp/finance3.dimension-stats.json')
    }),
    dimensionStatsMacroFile('/tmp/finance3.dimension-stats.json', '/tmp/finance3.dimension-stats.js')
  )
})

const finance3TransactionsParquet = Component('finance3TransactionsParquet', {
  moreTypes: 'etl<etl>', impl: cliEtl({
    extract: localFile('/tmp/finance3-transactions.jsonl'), moreFiles: [localFile('/tmp/finance3.dimension-stats.js')],
    transform: duckdb(`select * from read_json_auto('{%$inputFile%}') order by date`, {
      format: `PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE getvariable('history_rows'), KV_METADATA {'dimension-stats': getvariable('dimension_stats')}`,
      prelude: `set variable dimension_stats=(select content from read_text('{%$moreFile0%}'));
        set variable cutoff=(select date_trunc('month',max(date))-interval 17 month from read_json_auto('{%$inputFile%}'));
        set variable history_rows=(select count(*) from read_json_auto('{%$inputFile%}') where date<getvariable('cutoff'));`
    }), load: copyToFile('files/rooms/finance3/usersRO/silver/transactions-18m-hist.parquet')
  })
})

Component('finance3Build', {
  moreTypes: 'etl<etl>',
  params: [
    {id: 'source', as: 'string'},
    {id: 'statBuilders', type: 'stat-builder<dim-stat>[]'}
  ],
  impl: etls(
    finance3Transactions('%$source%'),
    finance3Customers('%$source%'),
    finance3Products(),
    finance3Payments(),
    finance3FactStats('%$statBuilders%'),
    finance3TransactionsParquet(),
    finance3ParquetWithStats('/tmp/finance3-customers.jsonl', '/tmp/finance3.dimension-stats.js', {
      outFile: 'files/rooms/finance3/usersRO/silver/customers.parquet'
    }),
    finance3ParquetWithStats('/tmp/finance3-products.jsonl', '/tmp/finance3.dimension-stats.js', {
      outFile: 'files/rooms/finance3/usersRO/silver/products.parquet'
    }),
    finance3ParquetWithStats('/tmp/finance3-payments.jsonl', '/tmp/finance3.dimension-stats.js', {
      outFile: 'files/rooms/finance3/usersRO/silver/payments.parquet'
    })
  )
})

Component('finance3SilverBuilder', {
  type: 'silver-builder<bi>',
  description: 'Build Finance3 silver Parquets and embed dimension stats from the full bronze CSV.',
  params: [
    {id: 'sourceWUrl', as: 'string', defaultValue: 'room:fs//finance3/usersRO/bronze/dirty_financial_transactions.csv'},
    {id: 'additionalStats', type: 'stat-builder<dim-stat>[]'}
  ],
  impl: (_, {}, { sourceWUrl, additionalStats }) => ({
    sourceType: 'full', name: 'transactions', keyField: 'source_row', periodPattern: 'YYYY-MM-DD',
    parquetFiles: [{ name: 'transactions', wUrlPattern: 'protected://finance3/usersRO/silver/transactions-18m-hist.parquet', version: 1 }],
    plan: async (ctx, { dimensionStatsBuilders = [] }) => ({ source: await wresolve(sourceWUrl, ctx),
      statBuilders: [...dimensionStatsBuilders, ...additionalStats] }),
    build: (ctx, plan) => dsls.etl.etl.finance3Build.$runWithCtx(ctx, plan)
  })
})
