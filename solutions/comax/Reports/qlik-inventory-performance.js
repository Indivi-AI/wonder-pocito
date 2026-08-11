import { dsls } from '@jb6/core'
import './qlik-report-dsl.js'
import './qlik-report-source.js'

const {
  common: { data: { comaxQlikReportSalesSql, comaxQlikReportTable } },
  'verified-queries': {
    VerifiedReport, 'verified-report': { qlikReport }, 'report-section': { section },
    'query-slot': { querySlot }, 'full-data': { fullData }
  }
} = dsls
const salesSql = options => comaxQlikReportSalesSql.$run({ options })
const table = name => comaxQlikReportTable.$run({ name })
const col = (key, label, format) => ({ key, label, ...format && { format } })
const slot = o => querySlot(o), T = table
const inventoryStateSql = status => `CASE ${status} WHEN 'negative_stock' THEN 'מלאי שלילי — לבדיקה'
  WHEN 'stockout' THEN 'חסר במלאי' WHEN 'low_cover' THEN 'נשאר לשבוע או פחות'
  WHEN 'overstock' THEN 'מלאי ליותר מ־60 יום' WHEN 'no_recent_sales' THEN 'לא נמכר ב־90 הימים האחרונים'
  ELSE 'מלאי תקין' END`
const fd = () => fullData({
  description: 'Latest inventory snapshot with Qlik-aligned sales, profit, costs and actionable item-by-branch status.',
  grain: 'one row per snapshot item × branch; quantities and coverage are comparable only within the same item',
  columns: `snapshot_date, sales_through_date, prt, item, branch_id, branch, location_type, dept, unit_kind, item_status,
    stock_qty, operational_stock_qty, unit_cost, stock_value_ils, cost_source, cost_date, cost_age_days, sold_qty_30d,
    sold_qty_90d, daily_rate_30d, daily_rate_90d, days_cover_current, days_cover_90d, sell_through_90d_pct,
    sales_net_30d, sales_net_90d, gross_profit_90d, margin_pct, sales_cost_coverage_pct, last_sale_date,
    demand_trend_pct, inventory_status, action_axis, priority_ils`,
  perItemOnly: `stock_qty,operational_stock_qty,unit_cost,sold_qty_30d,sold_qty_90d,daily_rate_30d,daily_rate_90d,
    days_cover_current,days_cover_90d,sell_through_90d_pct`,
  viewSql: INVENTORY_VIEW
})
const I = T('inventory'), P = T('products'), S = T('stores'), D = T('departments'), C = T('salesCosts')
const sales = salesSql({
  period: '90', prior: false,
  fields: ['PrtC', 'StoreC', 'sale_date', 'Cmt', 'net_sales_amount', 'gross_profit_amount', 'costed_net_sales_amount', 'period_bucket']
})
const INVENTORY_VIEW = `${sales},
anchor AS (
  SELECT max(DateDoc)::DATE snapshot_date, year(max(DateDoc))*10000+month(max(DateDoc))*100+day(max(DateDoc)) cost_date FROM ${I}
), sales AS (
  SELECT PrtC prt, StoreC branch_id, sum(greatest(Cmt,0)) sold_qty_90d,
    sum(greatest(Cmt,0)) FILTER(WHERE sale_date>(SELECT snapshot_date FROM anchor)-INTERVAL 30 DAY) sold_qty_30d,
    sum(net_sales_amount) sales_net_90d,
    sum(net_sales_amount) FILTER(WHERE sale_date>(SELECT snapshot_date FROM anchor)-INTERVAL 30 DAY) sales_net_30d,
    sum(gross_profit_amount) gross_profit_90d, sum(costed_net_sales_amount) costed_net_sales_90d, max(sale_date) last_sale_date
  FROM base GROUP BY 1,2
), stock AS MATERIALIZED (
  SELECT i.Prt prt, i.Store branch_id, i.Itra stock_qty, i.ItraTifuli operational_stock_qty
  FROM ${I} i JOIN ${S} s ON s.C=i.Store AND s.SnifC>0 WHERE i.DateDoc=(SELECT snapshot_date FROM anchor)
), costs AS MATERIALIZED (
  SELECT c.ItemID, c.StoreID, arg_max(c.FinalRegularCostPrice,c.DateDoc) FILTER(WHERE c.FinalRegularCostPrice>0) unit_cost,
    max(c.DateDoc) FILTER(WHERE c.FinalRegularCostPrice>0) cost_date
  FROM ${C} c JOIN stock st ON st.prt=c.ItemID AND st.branch_id=c.StoreID
  WHERE c.DateDoc<=(SELECT cost_date FROM anchor) GROUP BY 1,2
), item_costs AS (
  SELECT ItemID, arg_max(unit_cost,cost_date) unit_cost, max(cost_date) cost_date
  FROM costs WHERE unit_cost IS NOT NULL GROUP BY 1
), raw AS (
  SELECT a.snapshot_date, sa.last_sale_date sales_through_date, st.prt, trim(p.Nm) item, st.branch_id, trim(s.Nm) branch,
    if(regexp_matches(trim(s.Nm),'מחסן|מרלו.?ג'),'מרכז לוגיסטי','סניף מכירה') location_type,
    coalesce(trim(d.Nm),'ללא מחלקה') dept, if(p.SwShakil=1,'משקל','יחידות') unit_kind,
    if(coalesce(p.ArchiveDate,p.DateStop_Sell)::DATE<=a.snapshot_date,'מופסק','פעיל') item_status,
    st.stock_qty, st.operational_stock_qty, coalesce(c.unit_cost,ci.unit_cost) unit_cost,
    greatest(st.stock_qty,0)*coalesce(c.unit_cost,ci.unit_cost) stock_value_ils,
    CASE WHEN c.unit_cost IS NOT NULL THEN 'עלות סניף' WHEN ci.unit_cost IS NOT NULL THEN 'אומדן עלות פריט' ELSE 'עלות חסרה' END cost_source,
    coalesce(c.cost_date,ci.cost_date) cost_date, coalesce(sa.sold_qty_30d,0) sold_qty_30d,
    coalesce(sa.sold_qty_90d,0) sold_qty_90d, coalesce(sa.sold_qty_30d,0)/30 daily_rate_30d,
    coalesce(sa.sold_qty_90d,0)/90 daily_rate_90d, coalesce(sa.sales_net_30d,0) sales_net_30d,
    coalesce(sa.sales_net_90d,0) sales_net_90d, coalesce(sa.gross_profit_90d,0) gross_profit_90d,
    coalesce(sa.costed_net_sales_90d,0) costed_net_sales_90d, sa.last_sale_date
  FROM stock st CROSS JOIN anchor a JOIN ${P} p ON p.C=st.prt JOIN ${S} s ON s.C=st.branch_id
  LEFT JOIN ${D} d ON d.C=p.DepartmentC LEFT JOIN sales sa ON sa.prt=st.prt AND sa.branch_id=st.branch_id
  LEFT JOIN costs c ON c.ItemID=st.prt AND c.StoreID=st.branch_id LEFT JOIN item_costs ci ON ci.ItemID=st.prt
), scored AS (
  SELECT *, CASE WHEN stock_qty<=0 AND daily_rate_30d>0 THEN 0
      WHEN stock_qty>0 AND greatest(daily_rate_30d,daily_rate_90d)>0 THEN stock_qty/greatest(daily_rate_30d,daily_rate_90d) END days_cover_current,
    CASE WHEN stock_qty>0 AND daily_rate_90d>0 THEN stock_qty/daily_rate_90d END days_cover_90d,
    100*sold_qty_90d/nullif(sold_qty_90d+greatest(stock_qty,0),0) sell_through_90d_pct,
    100*gross_profit_90d/nullif(sales_net_90d,0) margin_pct,
    100*costed_net_sales_90d/nullif(sales_net_90d,0) sales_cost_coverage_pct,
    100*(daily_rate_30d/nullif(daily_rate_90d,0)-1) demand_trend_pct,
    date_diff('day',strptime(cost_date::VARCHAR,'%Y%m%d')::DATE,snapshot_date) cost_age_days
  FROM raw
), classified AS (
  SELECT *, CASE WHEN stock_qty<0 THEN 'negative_stock' WHEN stock_qty<=0 AND daily_rate_30d>=0.1 THEN 'stockout'
    WHEN stock_qty>0 AND greatest(daily_rate_30d,daily_rate_90d)>=0.1 AND days_cover_current<=7 THEN 'low_cover'
    WHEN stock_qty>0 AND daily_rate_90d=0 THEN 'no_recent_sales'
    WHEN stock_qty>0 AND days_cover_90d>60 THEN 'overstock' ELSE 'balanced' END inventory_status
  FROM scored
)
SELECT *, CASE WHEN inventory_status IN ('stockout','low_cover') THEN 'חוסר במלאי'
    WHEN inventory_status IN ('overstock','no_recent_sales') THEN 'מלאי עודף'
    WHEN inventory_status='negative_stock' THEN 'בדיקת נתונים' ELSE 'מאוזן' END action_axis,
  CASE WHEN inventory_status IN ('stockout','low_cover') THEN greatest(sales_net_30d,0)
    WHEN inventory_status IN ('overstock','no_recent_sales') THEN stock_value_ils
    WHEN inventory_status='negative_stock' THEN abs(stock_qty)*unit_cost ELSE 0 END priority_ils
FROM classified`
const KPI_SQL = `WITH inv AS (${INVENTORY_VIEW})
SELECT round(sum(stock_value_ils)) inventory_value_ils,
  round(sum(stock_value_ils) FILTER(WHERE inventory_status IN ('overstock','no_recent_sales'))) excess_value_ils,
  round(sum(greatest(sales_net_30d,0)) FILTER(WHERE inventory_status IN ('stockout','low_cover'))) availability_exposure_ils,
  count(*) FILTER(WHERE inventory_status='stockout') stockout_lines,
  count(*) FILTER(WHERE inventory_status='low_cover') low_cover_lines,
  round(100*count(*) FILTER(WHERE stock_qty>0 AND cost_source<>'עלות חסרה')/nullif(count(*) FILTER(WHERE stock_qty>0),0),1)
    valued_stock_line_pct,
  max(snapshot_date) snapshot_date, max(sales_through_date) sales_through_date
FROM inv`
const BRANCH_SQL = `WITH inv AS (${INVENTORY_VIEW})
SELECT branch, location_type, round(sum(stock_value_ils)) inventory_value_ils, round(sum(sales_net_90d)) sales_net_90d,
  round(90*sum(stock_value_ils)/nullif(sum(sales_net_90d-gross_profit_90d),0),1) cash_cover_days,
  round(100*sum(gross_profit_90d)/nullif(sum(sales_net_90d),0),1) margin_pct,
  round(sum(stock_value_ils) FILTER(WHERE inventory_status IN ('overstock','no_recent_sales'))) excess_value_ils,
  round(sum(greatest(sales_net_30d,0)) FILTER(WHERE inventory_status IN ('stockout','low_cover'))) availability_exposure_ils,
  count(*) FILTER(WHERE inventory_status IN ('stockout','low_cover')) availability_risk_lines,
  round(100*sum(costed_net_sales_90d)/nullif(sum(sales_net_90d),0),1) sales_cost_coverage_pct,
  max(snapshot_date) snapshot_date
FROM inv GROUP BY 1,2 HAVING inventory_value_ils>0 ORDER BY inventory_value_ils DESC`
const AVAILABILITY_SQL = `WITH inv AS (${INVENTORY_VIEW})
SELECT left(item,42)||' · '||left(branch,24) action_label, item, branch, dept,
  CASE inventory_status WHEN 'stockout' THEN 'חסר במלאי' ELSE 'נשאר לשבוע או פחות' END risk,
  round(stock_qty,1) stock_qty, unit_kind, round(daily_rate_30d,2) daily_rate_30d,
  round(days_cover_current,1) days_cover_current, round(sales_net_30d) sales_net_30d,
  round(100*sales_net_30d/nullif(sales_net_90d/3,0)-100,1) sales_trend_pct,
  round(margin_pct,1) margin_pct, round(sales_cost_coverage_pct,1) cost_coverage_pct,
  last_sale_date, cost_source
FROM inv
WHERE location_type='סניף מכירה' AND item_status='פעיל'
  AND inventory_status IN ('stockout','low_cover') AND sales_net_30d>0
ORDER BY if(inventory_status='stockout',0,1),sales_net_30d DESC LIMIT 30`
const EXCESS_SQL = `WITH inv AS (${INVENTORY_VIEW})
SELECT dept, round(sum(stock_value_ils) FILTER(WHERE inventory_status='overstock')) overstock_value_ils,
  round(sum(stock_value_ils) FILTER(WHERE inventory_status='no_recent_sales')) no_sales_value_ils,
  count(*) FILTER(WHERE inventory_status IN ('overstock','no_recent_sales')) risk_lines
FROM inv WHERE inventory_status IN ('overstock','no_recent_sales') GROUP BY 1
HAVING coalesce(overstock_value_ils,0)+coalesce(no_sales_value_ils,0)>0
ORDER BY coalesce(overstock_value_ils,0)+coalesce(no_sales_value_ils,0) DESC LIMIT 15`
const ACTION_SQL = `WITH inv AS (${INVENTORY_VIEW})
SELECT item, branch, location_type, dept,
  ${inventoryStateSql('inventory_status')} action_label,
  action_axis, round(priority_ils) priority_ils, round(stock_value_ils) stock_value_ils,
  round(days_cover_current,1) current_cover_days, round(days_cover_90d,1) stable_cover_days,
  round(sell_through_90d_pct,1) sell_through_pct, round(sales_net_30d) sales_net_30d,
  round(margin_pct,1) margin_pct, last_sale_date, cost_source, cost_age_days
FROM inv WHERE inventory_status<>'balanced'
ORDER BY CASE action_axis WHEN 'חוסר במלאי' THEN 1 WHEN 'מלאי עודף' THEN 2 ELSE 3 END, priority_ils DESC NULLS LAST LIMIT 40`

const drillQuery = (id, title, sectionId, sql, options = {}) =>
  ({ id, title, reportId: 'qlik-inventory-performance', sectionId, sql, ...options })
const branchFilter = 'branch = {name:q}'
const inventoryDrillQueries = {
  kpi: [
    drillQuery('branches', 'מצב המלאי לפי סניף', 'network-capital-coverage', `
SELECT branch AS name, round(sum(stock_value_ils)) AS current_value,
  round(sum(stock_value_ils) FILTER(WHERE inventory_status IN ('overstock','no_recent_sales'))) AS excess_value_ils,
  round(sum(sales_net_30d) FILTER(WHERE inventory_status IN ('stockout','low_cover'))) AS sales_at_risk_ils,
  count(*) FILTER(WHERE inventory_status='stockout') AS missing_items,
  round(90*sum(stock_value_ils)/nullif(sum(sales_net_90d-gross_profit_90d),0),1) AS stock_days
FROM full_data WHERE location_type='סניף מכירה' GROUP BY 1 ORDER BY current_value DESC LIMIT 12`,
    { valueLabel: 'שווי המלאי' }),
    drillQuery('departments', 'חוסרים ועודפים לפי מחלקה', 'excess-capital-actions', `
SELECT dept AS name,
  round(sum(stock_value_ils) FILTER(WHERE inventory_status IN ('overstock','no_recent_sales'))) AS current_value,
  round(sum(sales_net_30d) FILTER(WHERE inventory_status IN ('stockout','low_cover'))) AS sales_at_risk_ils,
  count(*) FILTER(WHERE inventory_status='stockout') AS missing_items
FROM full_data GROUP BY 1 HAVING current_value>0 OR sales_at_risk_ils>0 ORDER BY current_value DESC LIMIT 12`,
    { valueLabel: 'שווי המלאי העודף' })
  ],
  branch: [
    drillQuery('summary', 'תמונת הסניף', 'network-capital-coverage', `
SELECT round(sum(stock_value_ils)) AS inventory_value_ils,
  round(sum(stock_value_ils) FILTER(WHERE inventory_status IN ('overstock','no_recent_sales'))) AS excess_value_ils,
  round(sum(sales_net_30d) FILTER(WHERE inventory_status IN ('stockout','low_cover'))) AS sales_at_risk_ils,
  count(*) FILTER(WHERE inventory_status='stockout') AS missing_items,
  count(*) FILTER(WHERE inventory_status='low_cover') AS low_stock_items,
  round(90*sum(stock_value_ils)/nullif(sum(sales_net_90d-gross_profit_90d),0),1) AS stock_days,
  round(100*sum(gross_profit_90d)/nullif(sum(sales_net_90d),0),1) AS margin_pct
FROM full_data WHERE ${branchFilter}`, { kind: 'metrics' }),
    drillQuery('missing', 'מה חסר בסניף', 'availability-risk', `
SELECT item AS name, round(sales_net_30d) AS current_value, round(stock_qty,1) AS stock_qty,
  round(days_cover_current,1) AS stock_days, round(daily_rate_30d,1) AS daily_sales,
  round(demand_trend_pct,1) AS sales_change_pct, round(margin_pct,1) AS margin_pct, last_sale_date
FROM full_data WHERE ${branchFilter} AND item_status='פעיל' AND inventory_status IN ('stockout','low_cover')
ORDER BY current_value DESC LIMIT 12`, { valueLabel: 'מכירות בחודש האחרון' }),
    drillQuery('excess', 'מה תקוע בסניף', 'excess-capital-actions', `
SELECT item AS name, round(stock_value_ils) AS current_value, round(days_cover_90d,1) AS stock_days,
  round(sales_net_90d) AS sales_90d, last_sale_date,
  CASE inventory_status WHEN 'no_recent_sales' THEN 'לא נמכר ב־90 הימים האחרונים' ELSE 'מלאי ליותר מ־60 יום' END AS reason
FROM full_data WHERE ${branchFilter} AND inventory_status IN ('overstock','no_recent_sales')
ORDER BY current_value DESC LIMIT 12`, { valueLabel: 'שווי המלאי' })
  ],
  availability: [
    drillQuery('item-branches', 'מצב הפריט בכל הסניפים', 'availability-risk', `
WITH chosen AS (
  SELECT item FROM full_data
  WHERE left(item,42)||' · '||left(branch,24)={name:q} LIMIT 1
)
SELECT fd.branch AS name, round(fd.sales_net_30d) AS current_value, round(fd.stock_qty,1) AS stock_qty,
  round(fd.days_cover_current,1) AS stock_days, round(fd.daily_rate_30d,1) AS daily_sales,
  round(fd.demand_trend_pct,1) AS sales_change_pct, fd.last_sale_date,
  ${inventoryStateSql('fd.inventory_status')} AS inventory_state
FROM full_data fd, chosen
WHERE fd.item=chosen.item AND fd.location_type='סניף מכירה' AND fd.item_status='פעיל'
ORDER BY CASE fd.inventory_status WHEN 'negative_stock' THEN 0 ELSE 1 END, current_value DESC LIMIT 15`,
    { valueLabel: 'מכירות בחודש האחרון' })
  ],
  excess: [
    drillQuery('items', 'הפריטים היקרים ביותר לטיפול', 'excess-capital-actions', `
SELECT item||' · '||branch AS name, branch, round(stock_value_ils) AS current_value,
  round(days_cover_90d,1) AS stock_days, round(sales_net_90d) AS sales_90d, last_sale_date,
  CASE inventory_status WHEN 'no_recent_sales' THEN 'לא נמכר ב־90 הימים האחרונים' ELSE 'מלאי ליותר מ־60 יום' END AS reason
FROM full_data WHERE dept={name:q} AND inventory_status IN ('overstock','no_recent_sales')
ORDER BY current_value DESC LIMIT 15`, { valueLabel: 'שווי המלאי' }),
    drillQuery('branches', 'באילו סניפים העודף נמצא', 'excess-capital-actions', `
SELECT branch AS name, round(sum(stock_value_ils)) AS current_value,
  round(sum(stock_value_ils) FILTER(WHERE inventory_status='no_recent_sales')) AS no_sales_value_ils,
  count(*) AS items_to_check
FROM full_data WHERE dept={name:q} AND inventory_status IN ('overstock','no_recent_sales')
GROUP BY 1 ORDER BY current_value DESC LIMIT 12`, { valueLabel: 'שווי המלאי העודף' })
  ]
}
const inventoryDrill = mode => ({
  reactComp: 'inventoryDrillPanel', mode, title: 'פירוט — {name}', width: 680, queries: inventoryDrillQueries[mode]
})
const analysisLogic = `1. Anchor every conclusion to inventory snapshot_date and sales_through_date; flag stale data before judging performance.
2. Separate availability from excess: missing/low stock is prioritized by recent sales, while excess/no-sales is prioritized by stock value.
3. Calculate sell-through and days cover only at item×branch grain. Across items, compare ₪ value, sales and item×branch counts.
4. Rank active selling-branch availability first by stockout versus low cover, then by 30-day sales and recent demand trend.
5. Rank excess by stock value and distinguish cover above 60 days from zero sales in 90 days; warehouses suggest transfer checks.
6. Read sales and gross margin together, and verify sales cost coverage before trusting margin.
7. End with a short queue: urgent availability, excess-stock release, then negative-stock/data checks.`
const answerInstructions = `ענה בעברית מסחרית יומיומית, קצרה וברורה. שמור על מבנה התשובה הקיים ועל איכות הניתוח, אבל אל תשתמש
במונחים חשבונאיים או טכניים כשאפשר לומר אותם בפשטות. פתח בתאריך צילום המלאי ובשורת מצב אחת. אחר כך הפרד:
(1) חוסרים — כמה פריטים חסרים או נשארו לשבוע, וכמה הם מכרו בחודש האחרון; אל תקרא לזה "מכר חשוף" ואל תציג זאת כהפסד ודאי.
(2) עודפים — אמור "מלאי עודף בשווי..." או "מלאי שלא נמכר", לא "הון עודף".
(3) שלוש פעולות ברורות לפי פריט וסניף. במקום "כיסוי עלות" אמור במדויק לכמה משורות המלאי יש מחיר עלות,
או לכמה מהמכירות יש נתוני עלות. אמור "ימי מלאי" במקום "כיסוי כספי". ציין ימי מלאי או אחוז שנמכר רק לפריט×סניף,
ולעולם אל תחבר כמויות או תמצע ימים בין פריטים. פרש רווחיות רק כשיש מספיק נתוני עלות. במקום "סיכון זמינות" אמור
"מכירות שעלולות להיפגע בגלל חוסר"; במקום "שורות סיכון" אמור "פריטים חסרים או כמעט גמורים"; ובמקום "מגמת ביקוש"
אמור בפשטות "קצב המכירות עלה" או "קצב המכירות ירד".`

VerifiedReport('qlik-inventory-performance', { impl: qlikReport({
  qlikScreen: { title: 'מצב המלאי', order: 6, published: true },
  title: 'מצב המלאי — חוסרים, עודפים ומה עושים',
  description: 'תמונת מלאי ניהולית שמחברת שווי, קצב מכירה, ימי מלאי ורווחיות כדי להראות מה חסר, מה תקוע ומה לטפל קודם.',
  whenToUse: `שאלות על מצב ושווי המלאי, חוסרים, כמעט-אזל, עודפים, מלאי שלא נמכר, ימי מלאי, השלמה,
    העברה בין סניפים וסדר עדיפויות תפעולי.`,
  routePhrases: ['מצב המלאי', 'שווי מלאי', 'ימי מלאי', 'תחלופת מלאי', 'חוסר במלאי', 'אזל מהמלאי',
    'כמעט נגמר', 'מלאי שכמעט אוזל', 'עודפי מלאי לפי קצב מכירות', 'נתח מלאי',
    'מלאי עודף', 'מלאי מת', 'מה להזמין', 'מה להעביר בין סניפים'],
  questionsCovered: ['כמה כסף נמצא במלאי?', 'אילו פריטים בסיכון אזל?', 'איפה יש עודף ללא מכירות?',
    'מה סדר הפעולות לפי סניף ופריט?'],
  analysisLogic, answerInstructions,
  exampleQuestions: ['מה מצב המלאי ברשת?', 'אילו פריטים צפויים להיגמר קודם?', 'איפה תקוע הכי הרבה כסף במלאי?',
    'מה כדאי להשלים או להעביר השבוע?'],
  caveats: `צילום המלאי הוא יום יחיד. שווי חיובי בלבד מחושב לפי מחיר העלות האחרון בסניף, עם אומדן לפריט כשחסר מחיר בסניף.
    קצב 30/90 יום מבוסס על מכירות עבר ואינו תחזית. כמות, אחוז שנמכר וימי מלאי תקפים רק בתוך אותו פריט×סניף;
    סיכומי רשת משתמשים בשקלים.`,
  executiveSummary: slot({
    goal: 'Network inventory value, excess stock, sales on missing items, risk counts, valuation coverage and dates.',
    widget: {
      kind: 'kpi', title: 'מצב המלאי ברשת',
      items: [
        { label: 'שווי המלאי', col: 'inventory_value_ils', format: '₪' },
        { label: 'מלאי עודף', col: 'excess_value_ils', format: '₪' },
        { label: 'מכירות בסיכון בגלל חוסר', col: 'availability_exposure_ils', format: '₪' },
        { label: 'פריטים חסרים בסניפים', col: 'stockout_lines', format: 'int' },
        { label: 'שורות מלאי עם מחיר עלות', col: 'valued_stock_line_pct', format: '%' }
      ],
      drill: inventoryDrill('kpi')
    }, sql: KPI_SQL
  }),
  summary: slot({
    goal: 'Branch inventory value versus estimated stock days, with margin and data context.',
    widget: {
      kind: 'scatter', title: 'שווי המלאי ומספר ימי המלאי לפי סניף', name: 'branch',
      x: 'cash_cover_days', y: 'inventory_value_ils', xLabel: 'ימי מלאי משוערים', yLabel: 'שווי המלאי',
      xFormat: 'int', yFormat: '₪',
      drill: inventoryDrill('branch')
    }, sql: BRANCH_SQL
  }),
  sections: [
    section({
      id: 'network-capital-coverage', title: 'שווי וימי מלאי לפי סניף',
      goal: 'להשוות שווי מלאי, ימי מלאי, מכירות ורווחיות בלי לחבר כמויות של פריטים שונים.',
      summary: slot({
        goal: 'Branch value versus estimated stock days at cost.',
        widget: {
          kind: 'scatter', title: 'שווי המלאי ומספר ימי המלאי לפי סניף', name: 'branch',
          x: 'cash_cover_days', y: 'inventory_value_ils', xLabel: 'ימי מלאי משוערים', yLabel: 'שווי המלאי',
          xFormat: 'int', yFormat: '₪',
          drill: inventoryDrill('branch')
        }, sql: BRANCH_SQL
      }),
      inDepth: slot({
        goal: 'Exact branch inventory, excess, availability, margin and cost-data coverage.',
        widget: {
          kind: 'table', title: 'מצב המלאי לפי סניף',
          columns: [col('branch', 'סניף'), col('location_type', 'סוג'), col('inventory_value_ils', 'שווי המלאי', '₪'),
            col('cash_cover_days', 'ימי מלאי משוערים'), col('excess_value_ils', 'מלאי עודף', '₪'),
            col('availability_exposure_ils', 'מכירות בסיכון בגלל חוסר', '₪'), col('margin_pct', 'רווחיות', '%'),
            col('sales_cost_coverage_pct', 'מכירות עם נתוני עלות', '%')],
          drill: inventoryDrill('branch')
        }, sql: BRANCH_SQL
      }), fullData: fd()
    }),
    section({
      id: 'availability-risk', title: 'פריטים שחסרים או עומדים להיגמר',
      goal: 'לזהות פריטים פעילים שאזלו או נשארו לשבוע, ולדרג אותם לפי המכירות בחודש האחרון.',
      summary: slot({
        goal: 'Top item×branch availability risks ranked by recent sales.',
        widget: {
          kind: 'hbar', title: 'מה חסר עכשיו — לפי המכירות בחודש האחרון', name: 'action_label',
          value: 'sales_net_30d', valueFormat: '₪',
          drill: inventoryDrill('availability')
        }, sql: AVAILABILITY_SQL
      }),
      inDepth: slot({
        goal: 'Availability action table with native-unit stock, sales trend, margin and cost confidence.',
        widget: {
          kind: 'table', title: 'מה צריך להשלים קודם',
          columns: [col('item', 'פריט'), col('branch', 'סניף'), col('risk', 'מצב'), col('stock_qty', 'מלאי'),
            col('unit_kind', 'יחידה'), col('days_cover_current', 'ימי מלאי'),
            col('sales_net_30d', 'מכירות בחודש האחרון', '₪'), col('sales_trend_pct', 'שינוי בקצב המכירה', '%'),
            col('margin_pct', 'רווחיות', '%'), col('cost_coverage_pct', 'מכירות עם נתוני עלות', '%')],
          drill: inventoryDrill('availability')
        }, sql: AVAILABILITY_SQL
      }), fullData: fd()
    }),
    section({
      id: 'excess-capital-actions', title: 'מלאי עודף ומה עושים איתו',
      goal: 'להפריד מלאי שמספיק ליותר מ־60 יום ממלאי שלא נמכר, ולמצוא איפה נמצא השווי הגדול ביותר לטיפול.',
      summary: slot({
        goal: 'Department excess value split between overstock and no sales in 90 days.',
        widget: {
          kind: 'groupedBar', title: 'שווי המלאי העודף לפי מחלקה', category: 'dept',
          ys: [{ col: 'overstock_value_ils', label: 'מלאי ליותר מ־60 יום' },
            { col: 'no_sales_value_ils', label: 'לא נמכר ב־90 הימים האחרונים' }],
          valueFormat: '₪',
          drill: inventoryDrill('excess')
        }, sql: EXCESS_SQL
      }),
      inDepth: slot({
        goal: 'Action queue: missing stock first, excess stock second, data checks last.',
        widget: {
          kind: 'table', title: 'מה צריך לעשות במלאי — לפי פריט וסניף',
          columns: [col('item', 'פריט'), col('branch', 'סניף'), col('location_type', 'מיקום'),
            col('action_label', 'מה הבעיה'), col('action_axis', 'סוג טיפול'), col('priority_ils', 'שווי לטיפול', '₪'),
            col('stock_value_ils', 'שווי המלאי', '₪'), col('current_cover_days', 'ימי מלאי לפי הקצב האחרון'),
            col('sell_through_pct', 'אחוז מהמלאי שנמכר', '%'), col('sales_net_30d', 'מכירות בחודש האחרון', '₪'),
            col('margin_pct', 'רווחיות', '%'), col('cost_source', 'מקור מחיר העלות')],
          drill: inventoryDrill('excess')
        }, sql: ACTION_SQL
      }), fullData: fd()
    })
  ]
}) })
