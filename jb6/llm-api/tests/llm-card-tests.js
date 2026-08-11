import { coreUtils, dsls, ns, jb } from '@jb6/core'
import '@jb6/llm-api/tests/llm-api-tester.js'
import '@jb6/llm-api/llm-card.js'

const {
  tgp: { TgpType },
  common: { Data, Action, Boolean,
    data: { pipeline, filter, join, property, obj, delay, asIs, pipe, list }, 
    Boolean: { contains, equals, and, notContains },
    Prop: { prop }
  },
  'llm-api': { Prompt,
    prompt: { prompt, user, system, includeBooklet, includeFiles },
    model: {llama_33_70b_versatile, claude_code_sonnet_4, sonnet_4, opus_4, claude3Haiku, gemini_2_5_flash, gemini_2_5_pro, gemini_2_5_flash_lite_preview, gemini_2_0_flash, gemini_1_5_flash, gemini_1_5_flash_8b, gemini_1_5_pro, o1, o1_mini, o4_mini, gpt_4o, gpt_4o_mini, gpt_35_turbo_0125, gpt_35_turbo_16k}
  },
  test: { Test, 
    test: { llmTest, dataTest }
  }
} = dsls
const { llm, rx } = ns

const profitableProducts = Prompt('profitableProducts', {
  impl: llm.card({
    prompt: 'Create a dashboard showing our most profitable products with good ratings.',
    DBSchema: `{
  "products": [{"name": "iPhone", "price": 999, "cost": 600, "rating": 4.8, "units_sold": 1250}],
  "customers": [{"name": "John", "total_spent": 5420, "tier": "gold", "orders_count": 8}],
  "orders": [{"customer_name": "John", "total_amount": 1299, "status": "shipped", "order_date": "2024-11-01"}]
  }`
  })
})

Test('llmCardTest.profitableProducts', {
  HeavyTest: true,
  impl: llmTest({
    prompt: profitableProducts(),
    expectedResult: and(
      contains('(ctx) =>', 'jq(', 'price', '-', 'cost', 'rating', "h('", { anyOrder: true }),
      notContains('`'),
      notContains('${'),
      notContains('import'),
      notContains('React')
    ),
    maxTokens: 300,
    useLocalStorageCache: true
  })
})

const productsDb = Data('productsDb', {
  impl: asIs({
    products: [
      { name: 'iPhone 15', price: 999, cost: 600, rating: 4.8, units_sold: 1250 },
      { name: 'Samsung Galaxy S24', price: 899, cost: 520, rating: 4.6, units_sold: 980 },
      { name: 'Google Pixel 8', price: 799, cost: 480, rating: 4.7, units_sold: 740 },
      { name: 'OnePlus 12', price: 749, cost: 450, rating: 4.5, units_sold: 610 }
    ],

    customers: [
      { name: 'John', total_spent: 5420, tier: 'gold', orders_count: 8 },
      { name: 'Sarah', total_spent: 3120, tier: 'silver', orders_count: 5 },
      { name: 'Michael', total_spent: 7850, tier: 'platinum', orders_count: 12 },
      { name: 'Emma', total_spent: 1860, tier: 'bronze', orders_count: 3 }
    ],

    orders: [
      { customer_name: 'John', total_amount: 1299, status: 'shipped', order_date: '2024-11-01' },
      { customer_name: 'Sarah', total_amount: 799, status: 'processing', order_date: '2024-11-03' },
      { customer_name: 'Michael', total_amount: 1599, status: 'delivered', order_date: '2024-10-29' },
      { customer_name: 'Emma', total_amount: 499, status: 'cancelled', order_date: '2024-11-05' }
    ]
  })
})

Test('llmCardTest.profitableProductsPng', {
  HeavyTest: true,
  doNotRunInTests: true,
  impl: dataTest({
    calculate: llm.cardToPng({
      prompt: 'Create a VERY BEAUTIFUL chart showing our 3 most profitable products. show the profit',
      DBSchema: `{
  "products": [{"name": "iPhone", "price": 999, "cost": 600, "rating": 4.8, "units_sold": 1250}],
  "customers": [{"name": "John", "total_spent": 5420, "tier": "gold", "orders_count": 8}],
  "orders": [{"customer_name": "John", "total_amount": 1299, "status": "shipped", "order_date": "2024-11-01"}]
  }`,
      db: productsDb()
    }),
    expectedResult: contains('data', { allText: '%imageUrl%' }),
    timeout: '5000'
  })
})
