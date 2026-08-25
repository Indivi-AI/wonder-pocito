import { dsls } from '@jb6/core'
import '../finance/v3/finance3-etl.js'
import './ba-finance.js'
import './de-dsl.js'

const {
  ba: { 'semantic-cube': { finance2 } },
  de: {
    PhysicalTopology, Cube, SilverBuilder, SqlModifier,
    cube: { cube },
    'physical-topology': { singleCubeBucketDuckdbZeroSilverReplication },
    'silver-projection': { projection }, 'silver-file': { parquetFile },
    'query-lookup': { lookupByWUrl },
    'cache-strategy': { colsCache }
  },
  etl: { etl: { finance3Build } }
} = dsls

const demoFinancialStarJoinV2 = SqlModifier('demoFinancialStarJoinV2', {
  description: 'joins requested finance master data'
})

const finance3SilverBuilder = SilverBuilder('finance3SilverBuilder', {
  params: [
    {id: 'sourceWUrl', as: 'string', defaultValue: 'room:fs//finance3/usersRO/bronze/dirty_financial_transactions.csv'},
    {id: 'additionalStats', type: 'stat-builder<dim-stat>[]'}
  ]
})

PhysicalTopology('finance2', {
  impl: singleCubeBucketDuckdbZeroSilverReplication({
    cube: cube({
      baCube: finance2(),
      source: finance3SilverBuilder('room:fs//finance3/usersRO/bronze/dirty_financial_transactions.csv'),
      queryLookups: [
        lookupByWUrl('silver/customers.parquet', 'customers', {
          ensureCols: ['customer_id','customer_type','customer_country','loyalty_tier']
        }),
        lookupByWUrl('silver/products.parquet', 'products', {
          ensureCols: ['product','product_category','brand','unit_cost']
        }),
        lookupByWUrl('silver/payments.parquet', 'payments', {
          ensureCols: ['payment_method','payment_channel','payment_provider','fee_bps']
        })
      ],
      sqlModifiers: [
        demoFinancialStarJoinV2()
      ]
    }),
    etls: [
      finance3Build('room:fs//finance3/usersRO/bronze/dirty_financial_transactions.csv')
    ],
    silverProjections: [
      projection('transactionGrain', {
        mainCubeFile: parquetFile('transactions', 'signedRoom://finance3/usersRO/silver/transactions-18m-hist.parquet', {
          source: 'transactions',
          compression: 'zstd',
          orderBy: 'date',
          rowGroupLayout: 'history before the latest 18 months',
          metadata: 'dimension-stats'
        }),
        lookupFiles: [
          parquetFile('customers', 'signedRoom://finance3/usersRO/silver/customers.parquet', {
            source: 'customers',
            compression: 'zstd',
            metadata: 'dimension-stats'
          }),
          parquetFile('products', 'signedRoom://finance3/usersRO/silver/products.parquet', {
            source: 'products',
            compression: 'zstd',
            metadata: 'dimension-stats'
          }),
          parquetFile('payments', 'signedRoom://finance3/usersRO/silver/payments.parquet', {
            source: 'payments',
            compression: 'zstd',
            metadata: 'dimension-stats'
          })
        ]
      })
    ],
    wUrlBase: 'room://finance3/usersRO',
    cacheStrategy: colsCache()
  })
})
