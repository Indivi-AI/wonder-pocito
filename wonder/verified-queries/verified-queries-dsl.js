import { jb, dsls } from '@jb6/core'
import '@jb6/llm-guide'

const {
  coreUtils: { globalsOfType, callerCompId },
} = jb
const {
  tgp: { TgpType },
  common: { Data },
  'llm-guide': { Doclet },
} = dsls

Doclet('verified-queries-dsl', {
  impl: `
# verified-queries DSL — catalogs of pre-validated SQL reports
A verified-report is a catalog entry of SQLs already executed and checked against the real data; consumers (data<common>runReport,
data<common>queryReportFullData) run them by id and never rewrite them. Structure: report -> {executiveSummary,summary} query-slots +
sections[] -> {executiveSummary,summary,inDepth} query-slots + a full-data view for ad-hoc slicing.
All text/sql params are asIs: the SQL is literal validated text (contains strftime '%Y-%m' etc) — never %-templated; {{ROOT}} is the
only substitution, done at run time by runReport. widget is the declarative column binding materialized by report-step.js toWidget.
Slot params are semantic report arguments. ToAnalyze values and dates constrain calculation; ToShow values filter verified output afterward.
Registry: data<common>verifiedReportsRegistry materializes all registered verified-report comps into the plain reportsRegistry contract.
reactComp is an optional render binding carried beside widget for rich app sections. explainer maps widget titles/metric keys to polished help text.
Files: public/verified-queries/verified-queries-dsl.js (model), verified-queries-assets.js (room assets bridge), admin/comax/Reports/comax-reports.js (comax catalog instance)
`,
})

const defined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null))
const materialize = (ctx, {}, args) => defined(args)
const dimension = (analyzeId, showId, type, label, sensitive) => ({ analyzeId, showId, type, label, sensitive })
const paramColumns = {
  branch: dimension('branchesToAnalyze', 'branchesToShow', 'string', 'branches'),
  branch_id: dimension('branchIdsToAnalyze', 'branchIdsToShow', 'number', 'branch ids'),
  item: dimension('itemsToAnalyze', 'itemsToShow', 'string', 'items'),
  prt: dimension('itemIdsToAnalyze', 'itemIdsToShow', 'number', 'item ids'),
  item_group: dimension('itemGroupsToAnalyze', 'itemGroupsToShow', 'string', 'item groups'),
  dept: dimension('departmentsToAnalyze', 'departmentsToShow', 'string', 'departments'),
  department: dimension('departmentsToAnalyze', 'departmentsToShow', 'string', 'departments'),
  department_top: dimension('topDepartmentsToAnalyze', 'topDepartmentsToShow', 'string', 'top-level departments'),
  supplier: dimension('suppliersToAnalyze', 'suppliersToShow', 'string', 'suppliers'),
  spk: dimension('supplierIdsToAnalyze', 'supplierIdsToShow', 'number', 'supplier ids'),
  category: dimension('categoriesToAnalyze', 'categoriesToShow', 'string', 'categories'),
  customer: dimension('customersToAnalyze', 'customersToShow', 'string', 'customers', true),
  cust: dimension('customerIdsToAnalyze', 'customerIdsToShow', 'string', 'customer ids', true),
  customer_account: dimension('customerAccountsToAnalyze', 'customerAccountsToShow', 'string', 'customer accounts', true),
  segment: dimension('customerSegmentsToAnalyze', 'customerSegmentsToShow', 'string', 'customer segments'),
  idx_type: dimension('customerIdTypesToAnalyze', 'customerIdTypesToShow', 'string', 'customer identifier types'),
  weekday: dimension('weekdaysToAnalyze', 'weekdaysToShow', 'string', 'weekdays'),
  weekday_name: dimension('weekdaysToAnalyze', 'weekdaysToShow', 'string', 'weekdays'),
  holiday: dimension('holidaysToAnalyze', 'holidaysToShow', 'string', 'holidays'),
  phase: dimension('holidayPhasesToAnalyze', 'holidayPhasesToShow', 'string', 'holiday phases'),
  location: dimension('locationsToAnalyze', 'locationsToShow', 'string', 'locations'),
  location_id: dimension('locationIdsToAnalyze', 'locationIdsToShow', 'number', 'location ids'),
  location_kind: dimension('locationTypesToAnalyze', 'locationTypesToShow', 'string', 'location types'),
  location_type: dimension('locationTypesToAnalyze', 'locationTypesToShow', 'string', 'location types'),
  warehouse: dimension('warehousesToAnalyze', 'warehousesToShow', 'string', 'warehouses'),
  employee: dimension('employeesToAnalyze', 'employeesToShow', 'string', 'employees'),
  agent: dimension('agentsToAnalyze', 'agentsToShow', 'string', 'agents'),
  promo_name: dimension('promotionsToAnalyze', 'promotionsToShow', 'string', 'promotions'),
  deal_name: dimension('promotionFamiliesToAnalyze', 'promotionFamiliesToShow', 'string', 'promotion families'),
  deal_id: dimension('promotionFamilyIdsToAnalyze', 'promotionFamilyIdsToShow', 'number', 'promotion family ids'),
  mivza_c: dimension('promotionIdsToAnalyze', 'promotionIdsToShow', 'number', 'promotion ids'),
  mivza_no: dimension('promotionIdsToAnalyze', 'promotionIdsToShow', 'number', 'promotion ids'),
  grp: dimension('productGroupsToAnalyze', 'productGroupsToShow', 'string', 'product groups'),
  grp_c: dimension('productGroupIdsToAnalyze', 'productGroupIdsToShow', 'number', 'product group ids'),
  item_status: dimension('itemStatusesToAnalyze', 'itemStatusesToShow', 'string', 'item statuses'),
  doc_type: dimension('documentTypesToAnalyze', 'documentTypesToShow', 'string', 'document types'),
  register_no: dimension('registersToAnalyze', 'registersToShow', 'string', 'registers'),
  cashier_id: dimension('cashierIdsToAnalyze', 'cashierIdsToShow', 'string', 'cashier audit ids', true),
  card_no: dimension('loyaltyCardNumbersToAnalyze', 'loyaltyCardNumbersToShow', 'string', 'loyalty card numbers', true),
  hour_of_day: dimension('hoursToAnalyze', 'hoursToShow', 'number', 'hours'),
  daypart: dimension('daypartsToAnalyze', 'daypartsToShow', 'string', 'dayparts'),
  loss_kind: dimension('lossDriversToAnalyze', 'lossDriversToShow', 'string', 'loss drivers'),
  cohort: dimension('launchCohortsToAnalyze', 'launchCohortsToShow', 'string', 'launch cohorts'),
  card_kind: dimension('loyaltyCardTypesToAnalyze', 'loyaltyCardTypesToShow', 'string', 'loyalty card types'),
  last_branch: dimension('lastPurchaseBranchesToAnalyze', 'lastPurchaseBranchesToShow', 'string', 'last-purchase branches'),
  last_branch_id: dimension('lastPurchaseBranchIdsToAnalyze', 'lastPurchaseBranchIdsToShow', 'number', 'last-purchase branch ids'),
  whitespace_flag: dimension('whitespaceStatusesToAnalyze', 'whitespaceStatusesToShow', 'string', 'whitespace statuses'),
  promotion_classification: dimension('promotionTypesToAnalyze', 'promotionTypesToShow', 'string', 'promotion types'),
}
const paramSpec = (column, key) =>
  column == 'deal_name' && key?.startsWith('promo-recommendations/')
    ? dimension('promotionDealsToAnalyze', 'promotionDealsToShow', 'string', 'promotion deals')
    : paramColumns[column]
const temporalColumns = {
  d: ['reportDate', 'reportMonth', 'fromDate', 'toDate'],
  sale_date: ['salesDate', 'salesMonth', 'salesFromDate', 'salesToDate'],
  aligned_date: ['alignedDate', 'alignedMonth', 'alignedFromDate', 'alignedToDate'],
  snapshot_date: ['snapshotDate', 'snapshotMonth', 'snapshotFromDate', 'snapshotToDate'],
  sales_through_date: ['salesThroughDate', 'salesThroughMonth', 'salesThroughFromDate', 'salesThroughToDate'],
  date_open: ['openingDate', 'openingMonth', 'openingFromDate', 'openingToDate'],
  doc_date: ['documentDate', 'documentMonth', 'documentFromDate', 'documentToDate'],
  last_purchase_d: ['lastPurchaseDate', 'lastPurchaseMonth', 'lastPurchaseFromDate', 'lastPurchaseToDate'],
  ym: [null, 'monthsToAnalyze'],
  month: [null, 'monthsToAnalyze'],
}
const displayPeriodColumns = {
  d: ['datesToShow', 'date', 'dates'],
  sale_date: ['salesDatesToShow', 'date', 'sales dates'],
  aligned_date: ['alignedDatesToShow', 'date', 'aligned dates'],
  week_start: ['weeksToShow', 'date', 'weeks'],
  ym: ['monthsToShow', 'month', 'months'],
  month: ['monthsToShow', 'month', 'months'],
}
const allowParams = (report, section, columns, depths = ['executiveSummary', 'summary', 'inDepth']) => depths.map((depth) => [`${report}/${section}/${depth}`, columns])
const verifiedSourceColumns = new Map([
  ['branch-performance/daily-sales/executiveSummary', ['branch_id', 'branch']],
  ['branch-performance/daily-sales/summary', ['branch_id', 'branch', 'weekday_name', 'd']],
  ['branch-performance/daily-sales/inDepth', ['branch_id', 'branch']],
  ...allowParams('branch-performance', 'weekly-product-profit', ['prt', 'item', 'dept', 'branch_id', 'branch']),
  ...allowParams('branch-performance', 'branch-margin', ['dept']),
  ...allowParams('sales-overview', 'branch-comparison', ['branch']),
  ...allowParams('sales-overview', 'item-drivers', ['department', 'item_group', 'item', 'supplier']),
  ...allowParams('sales-overview', 'supplier-drivers', ['department', 'item_group', 'item', 'supplier']),
  ...allowParams('customers-loyalty', 'mix', ['branch_id', 'branch', 'segment'], ['summary', 'inDepth']),
  ...allowParams('customers-loyalty', 'mix', ['branch_id', 'branch', 'segment', 'ym'], ['executiveSummary']),
  ...allowParams('customers-loyalty', 'top-customers', ['customer', 'idx_type'], ['executiveSummary', 'inDepth']),
  ...allowParams('customers-loyalty', 'top-customers', ['cust', 'customer', 'idx_type'], ['summary']),
  ...allowParams('customers-loyalty', 'churn-signals', ['cust', 'customer', 'last_branch_id', 'last_branch', 'last_purchase_d'], ['summary', 'inDepth']),
  ...allowParams('category-mix', 'group-contribution', ['grp_c', 'grp'], ['executiveSummary', 'summary']),
  ...allowParams('profitability', 'department-margin', ['branch_id', 'branch', 'ym'], ['executiveSummary']),
  ...allowParams('profitability', 'department-margin', ['branch_id', 'branch', 'dept', 'ym'], ['summary']),
  ...allowParams('profitability', 'department-margin', ['branch_id', 'branch', 'dept'], ['inDepth']),
  ...allowParams('profitability', 'item-profit', ['prt', 'item', 'dept', 'branch_id', 'branch']),
  ...allowParams('profitability', 'loss-items', ['prt', 'item', 'dept']),
  ...allowParams('profitability', 'no-cost-items', ['prt', 'item', 'dept', 'branch_id', 'branch']),
  ...allowParams('pricing-cost-drift', 'cost-creep', ['prt', 'item', 'supplier']),
  ...allowParams('pricing-cost-drift', 'price-consistency', ['prt', 'item', 'branch_id', 'branch'], ['executiveSummary', 'summary']),
  ...allowParams('suppliers', 'dependency', ['branch_id', 'branch'], ['executiveSummary']),
  ...allowParams('suppliers', 'cost-increases', ['prt', 'item', 'supplier']),
  ...allowParams('suppliers', 'supplier-breadth', ['supplier', 'dept'], ['executiveSummary', 'summary']),
  ...allowParams('suppliers', 'supplier-breadth', ['dept'], ['inDepth']),
  ...allowParams('operations-audit', 'registers', ['branch_id', 'branch'], ['inDepth']),
  ...allowParams('operations-audit', 'cashier-anomalies', ['branch_id', 'branch']),
  ...allowParams('operations-audit', 'vat-exposure', ['branch_id', 'branch'], ['executiveSummary']),
  ...allowParams('operations-audit', 'vat-exposure', ['branch_id', 'branch', 'ym'], ['summary']),
  ...allowParams('operations-audit', 'doc-anomalies', ['branch_id', 'branch'], ['summary']),
])
const threshold = (id, column, operator, min, max, description) => defined({ id, type: 'number', column, operator, min, max, description })
const verifiedSourceParams = new Map([
  ...allowParams(
    'pricing-cost-drift',
    'cost-creep',
    [
      threshold('minimumCostIncreasePct', 'cost_chg_pct', 'gte', 10, null, 'minimum verified cost increase percent'),
      threshold('maximumPriceIncreasePct', 'price_chg_pct', 'lte', null, 3, 'maximum verified price increase percent'),
      threshold('minimumRecentRevenue', 'net_recent_6m', 'gte', 30000, null, 'minimum recent six-month revenue'),
    ],
    ['executiveSummary', 'summary'],
  ),
  ...allowParams(
    'pricing-cost-drift',
    'cost-creep',
    [
      threshold('minimumCostIncreasePct', 'cost_chg_pct', 'gte', 5, null, 'minimum verified cost increase percent'),
      threshold('maximumPassThroughPct', 'pass_through_pct', 'lte', null, 50, 'maximum verified cost pass-through percent'),
      threshold('minimumRecentRevenue', 'net_recent_6m', 'gte', 20000, null, 'minimum recent six-month revenue'),
    ],
    ['inDepth'],
  ),
])
const limitLabels = { maxRows: 'rows', maxPromotions: 'promotions', maxRecommendations: 'recommendations' }
const columnNames = (columns) =>
  String(columns || '')
    .split(',')
    .map((x) => x.trim().match(/^([A-Za-z_]\w*)/)?.[1])
    .filter(Boolean)
const sourceParams = (fullData, includeTemporal, key) => {
  const columns = columnNames(fullData?.columns),
    temporal = columns.find((column) => temporalColumns[column])
  const dimensions = columns.flatMap((column) => {
    const spec = paramSpec(column, key)
    return spec
      ? [
          {
            id: spec.analyzeId,
            type: spec.type,
            column,
            multiple: true,
            ...(spec.sensitive && { sensitive: true }),
            description: `${spec.label} included in the report calculation`,
          },
        ]
      : []
  })
  if (!temporal || !includeTemporal) return dimensions
  const [dateId, monthId, fromId, toId] = temporalColumns[temporal],
    type = dateId ? 'date' : 'month',
    id = dateId || monthId
  const description =
    type == 'date'
      ? `exact ${id}; accepts YYYY-MM-DD, latest, or earliest`
      : id == 'monthsToAnalyze'
        ? 'calendar months included in the report calculation; accepts YYYY-MM, latest, or earliest'
        : `exact ${id}; accepts YYYY-MM, latest, or earliest`
  return [
    ...dimensions,
    { id, type, column: temporal, multiple: true, description },
    ...(dateId
      ? [
          { id: monthId, type: 'month', column: temporal, multiple: true, description: `calendar ${monthId}; accepts YYYY-MM, latest, or earliest` },
          { id: fromId, type: 'date', column: temporal, operator: 'gte', description: `inclusive ${dateId} range start` },
          { id: toId, type: 'date', column: temporal, operator: 'lte', description: `inclusive ${dateId} range end` },
        ]
      : []),
  ]
}
const mergeParams = (...lists) => [...new Map(lists.flat().map((p) => [p.id, p])).values()]
const resultParams = (slot, key) =>
  [
    ...new Set(
      [
        slot?.widget?.name,
        slot?.widget?.nameCol,
        slot?.widget?.x,
        slot?.widget?.seriesBy,
        slot?.widget?.category,
        ...(slot?.widget?.columns || []).map((column) => column.key),
      ].filter(Boolean),
    ),
  ].flatMap((column) => {
    const spec = paramSpec(column, key),
      period = displayPeriodColumns[column]
    return spec
      ? [
          {
            id: spec.showId,
            type: spec.type,
            column,
            stage: 'result',
            multiple: true,
            ...(spec.sensitive && { sensitive: true }),
            description: `show only these ${spec.label} after verified calculations; comparison baselines stay unchanged`,
          },
        ]
      : period
        ? [
            {
              id: period[0],
              type: period[1],
              column,
              stage: 'result',
              multiple: true,
              description: `${period[2]} to display after verified calculations; comparison windows stay unchanged`,
            },
          ]
        : []
  })
const enrichFullData = (fullData) => {
  if (!fullData) return fullData
  const columns = columnNames(fullData.columns),
    date = columns.find((x) => temporalColumns[x])
  const period = columns.includes('period_bucket'),
    dimension = columns.find((x) => paramColumns[x] && x != 'period_bucket')
  const perItemOnly = new Set(
    String(fullData.perItemOnly || '')
      .split(',')
      .map((x) => x.trim()),
  )
  const metric = columns.find(
    (x) =>
      !perItemOnly.has(x) && /^(net|net_sales|net_raw|net_costed|revenue|sales|current_sales|previous_sales|profit|profit_ils|margin_ils|opportunity_ils|tied_cash_ils)$/.test(x),
  )
  const periodPredicate = period && "period_bucket = 'current'"
  const datePredicate = date && `${date} = (SELECT max(${date}) FROM full_data${period ? " WHERE period_bucket = 'current'" : ''})`
  const predicates = [periodPredicate, datePredicate].filter(Boolean)
  const where = predicates.length ? ` WHERE ${predicates.join(' AND ')}` : ''
  const select = dimension
    ? `${dimension}, ${metric ? `round(sum(${metric}), 2) AS ${metric}` : 'count(*) AS rows'}`
    : metric
      ? `round(sum(${metric}), 2) AS ${metric}`
      : 'count(*) AS rows'
  return {
    ...fullData,
    queryGuidance:
      fullData.queryGuidance ||
      [
        `Query only full_data at its documented grain: ${fullData.grain}`,
        'Use only listed columns; the view already contains the verified joins and business filters',
        date && `For a latest-period question filter ${date} to max(${date}) inside full_data`,
        period && "Filter period_bucket to 'current' or 'previous'; never combine them as one period",
        fullData.perItemOnly && `Do not aggregate ${fullData.perItemOnly} across items`,
      ]
        .filter(Boolean)
        .join('. '),
    exampleSql: fullData.exampleSql || `SELECT ${select} FROM full_data${where}${dimension ? ` GROUP BY 1 ORDER BY 2 DESC` : ''} LIMIT 10`,
  }
}
const enrichSlot = (slot, fullData, key) => {
  if (!slot) return slot
  const sql = String(slot.sql || ''),
    usesFullData = fullData && /\bfull_data\b/i.test(sql)
  const allowedColumns = verifiedSourceColumns.get(key)
  const inferred =
    usesFullData && allowedColumns
      ? sourceParams(
          fullData,
          allowedColumns.some((column) => temporalColumns[column]),
          key,
        ).filter((param) => allowedColumns.includes(param.column))
      : []
  const ranked = ['table', 'bar', 'hbar', 'pie', 'funnel', 'treemap', 'waterfall', 'scatter'].includes(slot.widget?.kind) && /\bLIMIT\s+\d+\s*$/i.test(sql.trim())
  const limitId = key?.startsWith('promotions/') ? 'maxPromotions' : key?.startsWith('promo-recommendations/') ? 'maxRecommendations' : 'maxRows'
  return {
    ...slot,
    params: mergeParams(
      resultParams(slot, key),
      inferred,
      verifiedSourceParams.get(key) || [],
      ranked ? [{ id: limitId, type: 'integer', min: 1, max: 100, operation: 'limit', description: `maximum ${limitLabels[limitId]} to return` }] : [],
      slot.params || [],
    ),
  }
}
const enrichReport = (report) => ({
  ...report,
  executiveSummary: enrichSlot(report.executiveSummary, null, `${report.id}/$report/executiveSummary`),
  summary: enrichSlot(report.summary, null, `${report.id}/$report/summary`),
  sections: (report.sections || []).map((section) => {
    const fullData = enrichFullData(section.fullData)
    const slot = (depth) => enrichSlot(section[depth], fullData, `${report.id}/${section.id}/${depth}`)
    return { ...section, fullData, executiveSummary: slot('executiveSummary'), summary: slot('summary'), inDepth: slot('inDepth') }
  }),
})

// --- query-slot: one validated sql at one depth, with its goal and widget binding ---

const QuerySlot = TgpType('query-slot', 'verified-queries', {
  typescript: '{ goal: string, sql: string, params: ReportParam[], widget?: WidgetBinding, reactComp?: object, explainer?: object }',
})
QuerySlot('querySlot', {
  params: [
    { id: 'goal', asIs: true, description: 'what the rows answer, for the LLM catalog' },
    { id: 'widget', asIs: true, description: 'declarative column binding, see report-step.js toWidget' },
    { id: 'reactComp', asIs: true, description: 'declarative ReactComp binding materialized with the slot rows' },
    { id: 'explainer', asIs: true, description: 'help text by widget title, React mode, label, or metric key' },
    { id: 'params', asIs: true, description: 'explicit typed semantic arguments accepted by runReport' },
    { id: 'sql', asIs: true, description: 'validated sql, {{ROOT}} substituted at run time' },
  ],
  impl: (ctx, {}, args) => defined({ ...args, params: args.params || [] }),
})

// --- full-data: the section view exposed to ad-hoc slicing via queryReportFullData ---

const FullData = TgpType('full-data', 'verified-queries', { typescript: '{ description: string, grain: string, columns: string, viewSql: string, perItemOnly?: string }' })
FullData('fullData', {
  params: [
    { id: 'description', asIs: true },
    { id: 'grain', asIs: true, description: 'one row per what, and row count scale' },
    { id: 'columns', asIs: true, description: 'column docs the LLM slices by' },
    { id: 'viewSql', asIs: true, description: 'validated view sql wrapped as WITH full_data AS (...)' },
    { id: 'perItemOnly', asIs: true, description: 'comma-list of columns whose units differ per item — cross-item sum/avg rejected' },
    { id: 'queryGuidance', asIs: true, description: 'selected-section guidance for safe full_data slicing' },
    { id: 'exampleSql', asIs: true, description: 'one schema-safe example SELECT from full_data' },
  ],
  impl: materialize,
})

// --- report-section: a drill-down area with slots per depth + its full-data view ---

const ReportSection = TgpType('report-section', 'verified-queries')
ReportSection('section', {
  params: [
    { id: 'id', as: 'string', mandatory: true },
    { id: 'title', asIs: true },
    { id: 'goal', asIs: true },
    { id: 'caveats', asIs: true },
    { id: 'answerInstructions', asIs: true, description: 'Hebrew answer guidance appended to llmSummary evaluation when this section is selected' },
    { id: 'reactComp', asIs: true },
    { id: 'executiveSummary', type: 'query-slot' },
    { id: 'summary', type: 'query-slot' },
    { id: 'inDepth', type: 'query-slot' },
    { id: 'fullData', type: 'full-data' },
  ],
  impl: materialize,
})

// --- verified-report: a catalog report. global comp id becomes the report id ---

const VerifiedReport = TgpType('verified-report', 'verified-queries')
VerifiedReport('verifiedReport', {
  params: [
    { id: 'title', asIs: true },
    { id: 'description', asIs: true },
    { id: 'whenToUse', asIs: true },
    { id: 'routePhrases', asIs: true },
    { id: 'questionsCovered', asIs: true },
    { id: 'caveats', asIs: true },
    { id: 'answerInstructions', asIs: true, description: 'Hebrew answer guidance appended to llmSummary evaluation for this report' },
    { id: 'executiveSummary', type: 'query-slot' },
    { id: 'summary', type: 'query-slot' },
    { id: 'reactComp', asIs: true },
    { id: 'sections', type: 'report-section[]' },
    { id: 'materialize', as: 'boolean', description: 'cache each section fullData view once per run so slots and slices reuse it; slot sqls must read FROM full_data' },
    { id: 'id', as: 'string', description: 'defaults to the enclosing comp id' },
  ],
  impl: (ctx, {}, { id, ...args }) => defined({ id: id || callerCompId(ctx.jbCtx), ...args }),
})

// --- registry: all registered verified-report comps, materialized to the plain reportsRegistry contract ---

Data('verifiedReportsRegistry', {
  impl: (ctx) => globalsOfType(dsls['verified-queries']['verified-report'], ctx).map(enrichReport),
})
