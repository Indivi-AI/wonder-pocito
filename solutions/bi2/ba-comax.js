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

Const('comax2HolidayPeriods', [
  ['פורים','2022-03-17','2022-03-17'], ['פסח','2022-04-16','2022-04-22'], ['יום העצמאות','2022-05-05','2022-05-05'],
  ['שבועות','2022-06-05','2022-06-05'], ['ראש השנה','2022-09-26','2022-09-27'], ['יום כיפור','2022-10-05','2022-10-05'],
  ['סוכות','2022-10-10','2022-10-16'], ['שמיני עצרת','2022-10-17','2022-10-17'], ['חנוכה','2022-12-18','2022-12-26'],
  ['פורים','2023-03-07','2023-03-07'], ['פסח','2023-04-06','2023-04-12'], ['יום העצמאות','2023-04-26','2023-04-26'],
  ['שבועות','2023-05-26','2023-05-26'], ['ראש השנה','2023-09-16','2023-09-17'], ['יום כיפור','2023-09-25','2023-09-25'],
  ['סוכות','2023-09-30','2023-10-06'], ['שמיני עצרת','2023-10-07','2023-10-07'], ['חנוכה','2023-12-07','2023-12-15'],
  ['פורים','2024-03-24','2024-03-24'], ['פסח','2024-04-23','2024-04-29'], ['יום העצמאות','2024-05-14','2024-05-14'],
  ['שבועות','2024-06-12','2024-06-12'], ['ראש השנה','2024-10-03','2024-10-04'], ['יום כיפור','2024-10-12','2024-10-12'],
  ['סוכות','2024-10-17','2024-10-23'], ['שמיני עצרת','2024-10-24','2024-10-24'], ['חנוכה','2024-12-25','2025-01-02'],
  ['פורים','2025-03-14','2025-03-14'], ['פסח','2025-04-13','2025-04-19'], ['יום העצמאות','2025-05-01','2025-05-01'],
  ['שבועות','2025-06-02','2025-06-02'], ['ראש השנה','2025-09-23','2025-09-24'], ['יום כיפור','2025-10-02','2025-10-02'],
  ['סוכות','2025-10-07','2025-10-13'], ['שמיני עצרת','2025-10-14','2025-10-14'], ['חנוכה','2025-12-14','2025-12-22'],
  ['פורים','2026-03-03','2026-03-03'], ['פסח','2026-04-02','2026-04-08'], ['יום העצמאות','2026-04-22','2026-04-22'],
  ['שבועות','2026-05-22','2026-05-22'], ['ראש השנה','2026-09-12','2026-09-13'], ['יום כיפור','2026-09-21','2026-09-21'],
  ['סוכות','2026-09-26','2026-10-02'], ['שמיני עצרת','2026-10-03','2026-10-03'], ['חנוכה','2026-12-04','2026-12-12']
])


const comax2Sales = SemanticCube('comax2Sales', {
  impl: semanticCube({
    inputs: [
      factByExample({
        name: 'salesLines',
        example: asIs({C: 1, KupaDocC: 1001, PrtC: 42, Cmt: 2, Scm: 117, VatAmount: 17, MivzaNo: 0, MhrLine: 60}),
        size: 'large',
        updateFrequency: 'daily'
      }),
      factByExample({
        name: 'salesHeaders',
        example: asIs({
            C: 1001,
            StoreC: 7,
            CustomerC: 22,
            DateDoc: '2026-06-28T11:42:00',
            Hour: 11,
            MOADON_NO: 12,
            TlushNo: 1234,
            OvedC: 30,
            SochenC: '31',
            DocType: 670
        }),
        size: 'large',
        updateFrequency: 'daily'
      }),
      masterDataByExample('stores', asIs({C: 7, Nm: 'Store 7'})),
      masterDataByExample('products', asIs({C: 42, Nm: 'Product 42', BarCode: '7290001', DepartmentC: 4, GroupC: 5, GroupTtC: 6, Spk: 8, DegemC: 9})),
      masterDataByExample('departments', asIs({C: 4, Nm: 'Department', DepartmentTop: 3})),
      masterDataByExample('departmentTops', asIs({C: 3, Nm: 'Top department'})),
      masterDataByExample('productGroups', asIs({C: 5, Nm: 'Product group'})),
      masterDataByExample('productSubgroups', asIs({C: 6, Nm: 'Product subgroup'})),
      masterDataByExample('suppliers', asIs({C: 8, Nm: 'Supplier'})),
      masterDataByExample('entities', asIs({C: 22, Nm: 'Entity', IdxGrp: 2})),
      masterDataByExample('entityGroups', asIs({C: 2, Nm: 'Entity group'})),
      masterDataByExample('promotions', asIs({C: 10, Nm: 'Promotion', SivugC: 11})),
      masterDataByExample('promotionClasses', asIs({C: 11, Nm: 'Promotion class'})),
      masterDataByExample('models', asIs({C: 9, Nm: 'Model'})),
      masterDataByExample('salesCosts', asIs({StoreID: 7, ItemID: 42, DateDoc: 20260628, FinalRegularCostPrice: 30})),
      masterDataByExample('franchiseCosts', asIs({StoreID: 7, ItemID: 42, CustomerID: 22, MivzaC: 10, DateDoc: 20260628, FinalCostPrice: 28})),
      masterDataByExample('israeliHolidayPeriods', '%$comax2HolidayPeriods%')
    ],
    mappings: [
      materializeInput('israeliHolidays', 'fixed holiday periods', {
        grain: ['holiday day'],
        rows: asIs([
            ['פורים','2022-03-17','2022-03-17'],
            ['פסח','2022-04-16','2022-04-22'],
            ['יום העצמאות','2022-05-05','2022-05-05'],
            ['שבועות','2022-06-05','2022-06-05'],
            ['ראש השנה','2022-09-26','2022-09-27'],
            ['יום כיפור','2022-10-05','2022-10-05'],
            ['סוכות','2022-10-10','2022-10-16'],
            ['שמיני עצרת','2022-10-17','2022-10-17'],
            ['חנוכה','2022-12-18','2022-12-26'],
            ['פורים','2023-03-07','2023-03-07'],
            ['פסח','2023-04-06','2023-04-12'],
            ['יום העצמאות','2023-04-26','2023-04-26'],
            ['שבועות','2023-05-26','2023-05-26'],
            ['ראש השנה','2023-09-16','2023-09-17'],
            ['יום כיפור','2023-09-25','2023-09-25'],
            ['סוכות','2023-09-30','2023-10-06'],
            ['שמיני עצרת','2023-10-07','2023-10-07'],
            ['חנוכה','2023-12-07','2023-12-15'],
            ['פורים','2024-03-24','2024-03-24'],
            ['פסח','2024-04-23','2024-04-29'],
            ['יום העצמאות','2024-05-14','2024-05-14'],
            ['שבועות','2024-06-12','2024-06-12'],
            ['ראש השנה','2024-10-03','2024-10-04'],
            ['יום כיפור','2024-10-12','2024-10-12'],
            ['סוכות','2024-10-17','2024-10-23'],
            ['שמיני עצרת','2024-10-24','2024-10-24'],
            ['חנוכה','2024-12-25','2025-01-02'],
            ['פורים','2025-03-14','2025-03-14'],
            ['פסח','2025-04-13','2025-04-19'],
            ['יום העצמאות','2025-05-01','2025-05-01'],
            ['שבועות','2025-06-02','2025-06-02'],
            ['ראש השנה','2025-09-23','2025-09-24'],
            ['יום כיפור','2025-10-02','2025-10-02'],
            ['סוכות','2025-10-07','2025-10-13'],
            ['שמיני עצרת','2025-10-14','2025-10-14'],
            ['חנוכה','2025-12-14','2025-12-22'],
            ['פורים','2026-03-03','2026-03-03'],
            ['פסח','2026-04-02','2026-04-08'],
            ['יום העצמאות','2026-04-22','2026-04-22'],
            ['שבועות','2026-05-22','2026-05-22'],
            ['ראש השנה','2026-09-12','2026-09-13'],
            ['יום כיפור','2026-09-21','2026-09-21'],
            ['סוכות','2026-09-26','2026-10-02'],
            ['שמיני עצרת','2026-10-03','2026-10-03'],
            ['חנוכה','2026-12-04','2026-12-12']
        ]),
        fields: [
          field('holiday', 'row[0]'),
          field('day', 'each inclusive date from row[1] through row[2]', { type: 'date' })
        ]
      }),
      mapInput({
        baseInput: 'salesLines',
        fields: [
          field('sale_time', 'salesHeaders.DateDoc', { type: 'timestamp' }),
          field('sale_date', 'date(salesHeaders.DateDoc)', { type: 'date' }),
          field('cost_date', 'year(sale_time) * 10000 + month(sale_time) * 100 + day(sale_time)'),
          field('year', 'year(sale_time)'),
          field('quarter', `'Q' + quarter(sale_time) + ' ' + year(sale_time)`),
          field('month_year', `strftime(sale_time, '%Y-%m')`),
          field('month', 'month(sale_time)'),
          field('week_year', `strftime(sale_time, '%G-%V')`),
          field('weekday', `case dayOfWeek(sale_time) 0:'יום א' 1:'יום ב' 2:'יום ג' 3:'יום ד' 4:'יום ה' 5:'יום ו' else:'שבת'`),
          field('daypart', `if hour 6..11 'בוקר', 12..17 'צהריים', 18..23 'ערב לילה', otherwise 'לפנות בוקר'`),
          field('loyalty_customer', 'string(nullIf(salesHeaders.MOADON_NO, 0))'),
          field('receipt', 'string(salesHeaders.TlushNo)'),
          field('wolt', `if(salesHeaders.DocType = 670 or trim(customers.Nm) contains 'וולט', 'וולט', 'חנויות')`),
          field('net_sales_amount', 'Scm - VatAmount'),
          field('resolved_cost', 'coalesce(franchiseCosts.FinalCostPrice, salesCosts.FinalRegularCostPrice, 0)'),
          field({
            name: 'resolved_cost_source',
            sqlExp: `if(franchiseCosts.FinalCostPrice exists, 'zakyan', if(salesCosts.FinalRegularCostPrice exists, 'regular', 'zero'))`
          }),
          field({
            name: 'costed_net_sales_amount',
            sqlExp: 'if(franchiseCosts.FinalCostPrice or salesCosts.FinalRegularCostPrice exists, net_sales_amount, null)'
          }),
          field('cost_amount', 'Cmt * resolved_cost'),
          field('gross_profit_amount', 'net_sales_amount - cost_amount'),
          field('promo_net_sales_amount', 'if(MivzaNo > 0, net_sales_amount, 0)'),
          field('return_net_sales_amount', 'if(Scm < 0, net_sales_amount, 0)'),
          field('discount_amount', 'if(Cmt > 0, max(MhrLine * Cmt - Scm, 0), 0)'),
          field('missing_cost_line', 'if(franchiseCosts.FinalCostPrice and salesCosts.FinalRegularCostPrice are null, 1, 0)'),
          field('period_bucket', `if(sale_date between current_from and max_date, 'current', 'previous')`),
          field('display_date', 'if(sale_date < current_from, sale_date + 1 year, sale_date)')
        ],
        relationships: [
          relationship('lineHeader', 'salesLines', {
            to: 'salesHeaders',
            on: 'salesLines.KupaDocC = salesHeaders.C',
            cardinality: 'many-to-one',
            required: true
          }),
          relationship('headerStore', 'salesHeaders', {
            to: 'stores',
            on: 'salesHeaders.StoreC = stores.C',
            required: true
          }),
          relationship('lineProduct', 'salesLines', {
            to: 'products',
            on: 'salesLines.PrtC = products.C',
            required: true
          }),
          relationship('productDepartment', 'products', {
            to: 'departments',
            on: 'products.DepartmentC = departments.C'
          }),
          relationship('departmentTop', 'departments', {
            to: 'departmentTops',
            on: 'departments.DepartmentTop = departmentTops.C'
          }),
          relationship('productGroup', 'products', {
            to: 'productGroups',
            on: 'products.GroupC = productGroups.C'
          }),
          relationship('productSubgroup', 'products', {
            to: 'productSubgroups',
            on: 'products.GroupTtC = productSubgroups.C'
          }),
          relationship('productSupplier', 'products', { to: 'suppliers', on: 'products.Spk = suppliers.C' }),
          relationship('headerCustomer', 'salesHeaders', {
            to: 'entities as customers',
            on: 'salesHeaders.CustomerC = customers.C'
          }),
          relationship('customerGroup', 'customers', {
            to: 'entityGroups as customerGroups',
            on: 'customers.IdxGrp = customerGroups.C'
          }),
          relationship('headerEmployee', 'salesHeaders', {
            to: 'entities as employees',
            on: 'salesHeaders.OvedC = employees.C'
          }),
          relationship('headerAgent', 'salesHeaders', {
            to: 'entities as agents',
            on: 'number(salesHeaders.SochenC) = agents.C'
          }),
          relationship('linePromotion', 'salesLines', {
            to: 'promotions',
            on: 'salesLines.MivzaNo = promotions.C'
          }),
          relationship('promotionClassification', 'promotions', {
            to: 'promotionClasses',
            on: 'promotions.SivugC = promotionClasses.C'
          }),
          relationship('productModel', 'products', { to: 'models', on: 'products.DegemC = models.C' }),
          relationship('regularSameDayCost', 'salesLines + salesHeaders', {
            to: 'salesCosts',
            on: 'salesHeaders.StoreC = salesCosts.StoreID and salesLines.PrtC = salesCosts.ItemID and cost_date = salesCosts.DateDoc'
          }),
          relationship('franchiseSameDayCost', 'salesLines as l + salesHeaders as h', {
            to: 'franchiseCosts as z',
            on: 'h.StoreC=z.StoreID and l.PrtC=z.ItemID and h.CustomerC=z.CustomerID and l.MivzaNo=z.MivzaC and cost_date=z.DateDoc'
          }),
          relationship('saleHoliday', 'salesHeaders', {
            to: 'israeliHolidays',
            on: 'sale_date = israeliHolidays.day'
          })
        ],
        remarks: ['Physical paths, lookup pruning, join algorithms, range materialization and partitioning are future DE settings']
      })
    ],
    dimensions: [
      dimension('year', 'year'),
      dimension('quarter', 'quarter', { parent: 'year' }),
      dimension('month_year', 'month_year', { parent: 'quarter' }),
      dimension('month', 'month', { parent: 'year' }),
      dimension('week_year', 'week_year', { parent: 'year' }),
      dimension('weekday', 'weekday'),
      dimension('holiday', 'israeliHolidays.holiday', { parent: 'sale_date' }),
      dimension('sale_date', 'sale_date', { type: 'timestamp', parent: 'week_year' }),
      dimension('sale_time', 'sale_time', { type: 'timestamp', parent: 'sale_date' }),
      dimension('hour', 'salesHeaders.Hour', { type: 'integer', parent: 'daypart' }),
      dimension('daypart', 'daypart'),
      dimension('branch', 'trim(stores.Nm)'),
      dimension('warehouse', 'trim(stores.Nm)'),
      dimension('supplier', 'trim(suppliers.Nm)'),
      dimension('department_top', 'trim(departmentTops.Nm)'),
      dimension('department', 'trim(departments.Nm)', { parent: 'department_top' }),
      dimension('item_group', 'trim(productGroups.Nm)', { parent: 'department' }),
      dimension('item_subgroup', 'trim(productSubgroups.Nm)', { parent: 'item_group' }),
      dimension('item', 'trim(products.Nm)', { parent: 'item_subgroup' }),
      dimension('model', 'trim(models.Nm)', { parent: 'item' }),
      dimension('barcode', 'string(products.BarCode)', { parent: 'item' }),
      dimension('business_customer', 'trim(customers.Nm)'),
      dimension('loyalty_customer', 'loyalty_customer'),
      dimension('customer_group', 'trim(customerGroups.Nm)'),
      dimension('promotion', 'trim(promotions.Nm)'),
      dimension('promotion_classification', 'trim(promotionClasses.Nm)', { parent: 'promotion' }),
      dimension('receipt', 'receipt'),
      dimension('employee', 'trim(employees.Nm)'),
      dimension('agent', 'trim(agents.Nm)'),
      dimension('wolt', 'wolt')
    ],
    metrics: [
      metric('sales_lines', 'count', { unit: 'int' }),
      metric('receipts', 'distinctCount(KupaDocC)', { unit: 'int' }),
      metric('quantity', 'sum(Cmt)'),
      metric('gross_sales', 'sum(Scm)', { unit: '₪' }),
      metric('vat', 'sum(VatAmount)', { unit: '₪' }),
      metric('net_sales', 'sum(net_sales_amount)', { unit: '₪' }),
      metric('costed_net_sales', 'sum(costed_net_sales_amount)', { unit: '₪' }),
      metric('cost', 'sum(cost_amount)', { unit: '₪' }),
      metric('gross_profit', 'sum(gross_profit_amount)', { unit: '₪' }),
      metric('promo_net_sales', 'sum(promo_net_sales_amount)', { unit: '₪' }),
      metric('returns_net_sales', 'sum(return_net_sales_amount)', { unit: '₪' }),
      metric('discount_value', 'sum(discount_amount)', { unit: '₪' }),
      metric('missing_cost_lines', 'sum(missing_cost_line)', { unit: 'int' }),
      metric('current_net_sales', `sum(if(period_bucket = 'current', net_sales_amount, 0))`, {
        unit: '₪'
      }),
      metric('previous_net_sales', `sum(if(period_bucket = 'previous', net_sales_amount, 0))`, {
        unit: '₪'
      }),
      metric('current_quantity', `sum(if(period_bucket = 'current', Cmt, 0))`),
      metric('previous_quantity', `sum(if(period_bucket = 'previous', Cmt, 0))`),
      metric('profit_margin', 'gross_profit / net_sales', { unit: '%' }),
      metric('average_basket', 'net_sales / receipts', { unit: '₪' }),
      metric('average_items_per_basket', 'quantity / receipts'),
      metric('promo_share', 'promo_net_sales / net_sales', { unit: '%' }),
      metric('cost_coverage', 'costed_net_sales / net_sales', { unit: '%' }),
      metric('net_sales_change_pct', '(current_net_sales - previous_net_sales) / previous_net_sales', {
        unit: '%'
      }),
      metric('quantity_change_pct', '(current_quantity - previous_quantity) / previous_quantity', {
        unit: '%'
      }),
      metric('net_sales_share', 'net_sales / sum(net_sales across all groups)', { unit: '%' })
    ],
    queryServiceLevels: [
      queryServiceLevel({
        name: 'recentOperationalSales',
        when: 'latest month grouped by branch|department|item_group with sales and profit metrics',
        latency: '2s',
        freshness: '1h',
        priority: 5,
        frequency: 'high'
      }),
      queryServiceLevel('periodComparison', 'current period compared with the same prior-year window', {
        latency: '5s',
        freshness: '1h',
        priority: 4,
        frequency: 'medium'
      }),
      queryServiceLevel({
        name: 'historicalReceiptDrill',
        when: 'historical period grouped or filtered by receipt|item|barcode|loyalty_customer',
        latency: '60s',
        freshness: '1d',
        priority: 1,
        frequency: 'rare'
      })
    ],
    limits: [
      limit('cost precedence is franchise then regular then zero; zero-cost rows overstate gross profit, so inspect cost coverage'),
      limit('data ends 2026-06-28 and the latest bucket is partial'),
      limit('money is ILS; net sales excludes VAT and is the default sales measure'),
      limit('returns are negative rows included in net sales'),
      limit('item, barcode, receipt and loyalty customer require filtering or top-N'),
      limit('holiday coverage is fixed to 2022–2026'),
      limit('sales ledger excludes inventory value, purchasing, labor, branch operations, targets and forecasts'),
      limit('the cube supports descriptive analysis, not causal incrementality, uplift or cannibalization claims')
    ],
    remarks: ['Readers, paths, caches, join algorithms, materialization and pre-aggregation are future DE settings']
  })
})
