import { dsls } from '@jb6/core'
import './ba-dsl.js'

const {
  tgp: { Const },
  common: { data: { asIs } },
  ba: {
    SemanticCube, input: { factByExample, masterDataByExample },
    mapping: { mapInput, materializeInput, mapFacts, materializeMasterData },
    field: { field, sourceField, enumField, masterDataField, calculatedField },
    normalizer: { ignoreCase, kebab }, 'enum-alias': { aliases },
    'field-reducer': { pick },
    relationship: { relationship, relationshipByKey }, dimension: { dimension }, metric: { metric },
    limit: { limit },
    'query-service-level': { queryServiceLevel }, 'semantic-cube': { semanticCube }
  }
} = dsls

Const('finance2Transactions', {
    Transaction_ID: ' TX-1 ',
    Transaction_Date: '2025-03-07',
    Customer_ID: ' C-1 ',
    Product_Name: 'laptop',
    Quantity: '2',
    Price: '$899',
    Payment_Method: 'creditcard',
    Transaction_Status: 'success'
  }
)
Const('finance2Products', [
  {product: 'Laptop', product_category: 'Computers', brand: 'Northstar', unit_cost: 620},
  {product: 'Tablet', product_category: 'Computers', brand: 'Northstar', unit_cost: 280},
  {product: 'Smartphone', product_category: 'Mobile', brand: 'Orbit', unit_cost: 410},
  {product: 'Headphones', product_category: 'Audio', brand: 'Echo', unit_cost: 55},
  {product: 'Coffee Machine', product_category: 'Appliances', brand: 'Hearth', unit_cost: 95}
])
Const('finance2Payments', [
  {payment_method: 'Cash', payment_channel: 'Offline', payment_provider: 'Cash', fee_bps: 0},
  {payment_method: 'Credit Card', payment_channel: 'Card', payment_provider: 'Card Network', fee_bps: 290},
  {payment_method: 'PayPal', payment_channel: 'Wallet', payment_provider: 'PayPal', fee_bps: 340}
])

const finance2 = SemanticCube('finance2', {
  impl: semanticCube({
    inputs: [
      factByExample('transactions', '%$finance2Transactions%', {
        remark: 'CSV ingestion, parsing, storage, partitioning and schema-drift handling are future DE settings'
      }),
      masterDataByExample('products', '%$finance2Products%'),
      masterDataByExample('payments', '%$finance2Payments%')
    ],
    mappings: [
      mapFacts({
        baseInput: 'transactions',
        fields: [
          sourceField('transaction_id'),
          sourceField('date', 'Transaction_Date', { type: 'date' }),
          sourceField('customer_id'),
          masterDataField('product', 'products.product', { from: 'Product_Name', normalizer: ignoreCase() }),
          sourceField('quantity'),
          sourceField('price'),
          masterDataField('payment_method', 'payments.payment_method', { normalizer: kebab() }),
          enumField('status', 'completed,pending,failed,unknown', {
            from: 'Transaction_Status',
            normalizer: ignoreCase(),
            aliases: [
              aliases('completed', 'complete,success'),
              aliases('failed', 'declined,cancelled')
            ]
          }),
          calculatedField('transaction_value', (ctx, vars, args) => ctx.data.quantity * ctx.data.price)
        ],
        relationships: [
          relationshipByKey('customers', 'customer_id'),
          relationshipByKey('products', 'product'),
          relationshipByKey('payments', 'payment_method')
        ]
      }),
      materializeMasterData('customers', 'transactions', {
        grain: ['customer_id'],
        fields: [pick('customer_id')],
        remark: `Tenant master data extracted from this tenant's transaction facts`
      })
    ],
    dimensions: [
      dimension('date', { type: 'date' }),
      dimension('transaction_id'),
      dimension('customer_id'),
      dimension('product', {
        values: ['Laptop','Tablet','Smartphone','Headphones','Coffee Machine']
      }),
      dimension('payment_method', { values: ['Cash','Credit Card','PayPal'] }),
      dimension('status', { values: ['completed','pending','failed','unknown'] }),
      dimension('product_category', 'products.product_category'),
      dimension('brand', 'products.brand'),
      dimension('payment_channel', 'payments.payment_channel'),
      dimension('payment_provider', 'payments.payment_provider')
    ],
    metrics: [
      metric('txns', 'count(*)', { unit: 'int' }),
      metric('customers', 'count(distinct customer_id)', { unit: 'int' }),
      metric('units', 'round(sum(quantity), 2)'),
      metric('gross_value', 'round(sum(transaction_value), 2)', { unit: '$' }),
      metric('completed_value', `round(sum(case when status = 'completed' then transaction_value end), 2)`, {
        unit: '$'
      })
    ],
    queryServiceLevels: [
      queryServiceLevel({
        name: 'interactiveRecentFinance',
        when: 'period is latest month and grain is product|customer segment|payment method',
        latency: '2s',
        freshness: '1h',
        priority: 5,
        frequency: 'high'
      }),
      queryServiceLevel('historicalFinance', 'period is older than one year or grain is transaction_id', {
        latency: '30s',
        freshness: '1d',
        priority: 2,
        frequency: 'low'
      })
    ],
    limits: [
      limit('money has no currency column and is presented as dataset dollars'),
      limit('no balances, cash direction, payouts, invoices or reconciliation'),
      limit('relative dates anchor to max(date), not wall-clock time')
    ]
  })
})
