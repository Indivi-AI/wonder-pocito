import { dsls } from '@jb6/core'
import '@wonder/verified-queries/verified-queries-dsl.js'
import { H, L, PRT, STORE, DEPT, DPC, ITR, NET, LAST_FULL, SNAP, COST, dateCaveat } from './promo-shared.js'

const { 'verified-queries': { VerifiedReport, 'verified-report': { verifiedReport }, 'report-section': { section }, 'query-slot': { querySlot }, 'full-data': { fullData } } } = dsls
const col = (key, label, format) => ({ key, label, ...(format && { format }) })
const kpi = (col, label, format) => ({ col, label, ...(format && { format }) })
const table = (title, columns) => ({ kind: 'table', title, columns })
const INVENTORY_VIEW = `WITH anchor AS (SELECT ${LAST_FULL} AS d, ${SNAP} AS snap_d),
${COST},
cost_item AS (SELECT ItemID, arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE FinalRegularCostPrice > 0) AS unit_cost FROM ${DPC} GROUP BY 1),
sales AS (
  SELECT l.PrtC AS prt, h.StoreC AS branch_id, sum(l.Cmt) AS sales_qty_90d, sum(${NET}) AS sales_net_90d, sum(l.Cmt)/90.0 AS daily_rate,
    sum(l.Cmt) FILTER (WHERE h.DateDoc::DATE > (SELECT d FROM anchor) - INTERVAL 30 DAY)/30.0 AS rate30, max(h.DateDoc::DATE) AS last_sale_d
  FROM ${L} l JOIN ${H} h ON h.C = l.KupaDocC
  WHERE h.DateDoc::DATE > (SELECT d FROM anchor) - INTERVAL 90 DAY AND h.DateDoc::DATE <= (SELECT d FROM anchor) AND l.Cmt > 0 GROUP BY 1, 2),
stock AS (SELECT i.Prt AS prt, i.Store AS branch_id, sum(i.Itra) AS stock_qty FROM ${ITR} i JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0 WHERE i.DateDoc = (SELECT snap_d FROM anchor) GROUP BY 1, 2),
raw AS (
  SELECT st.prt, trim(p.Nm) AS item, st.branch_id, trim(s.Nm) AS branch, trim(dp.Nm) AS dept, st.stock_qty, coalesce(c.unit_cost, ci.unit_cost) AS unit_cost,
    coalesce(sa.sales_qty_90d, 0) AS sales_qty_90d, coalesce(sa.sales_net_90d, 0) AS sales_net_90d, coalesce(sa.daily_rate, 0) AS daily_rate, coalesce(sa.rate30, 0) AS rate30,
    sa.last_sale_d, CASE WHEN p.ArchiveDate IS NULL THEN 'active' ELSE 'discontinued' END AS item_status,
    CASE WHEN p.DepartmentC IN (11, 12) OR st.stock_qty <> floor(st.stock_qty) THEN 'weighed_count_unreliable' ELSE 'count_plausible' END AS reliability
  FROM stock st JOIN ${PRT} p ON p.C = st.prt JOIN ${STORE} s ON s.C = st.branch_id LEFT JOIN ${DEPT} dp ON dp.C = p.DepartmentC
  LEFT JOIN sales sa USING (prt, branch_id) LEFT JOIN cost c ON c.ItemID = st.prt AND c.StoreID = st.branch_id LEFT JOIN cost_item ci ON ci.ItemID = st.prt
  WHERE st.stock_qty > 0)
SELECT prt, item, branch_id, branch, dept, round(stock_qty, 1) AS stock_qty, round(unit_cost, 3) AS unit_cost, round(stock_qty*unit_cost, 1) AS stock_value_ils,
  round(sales_qty_90d, 1) AS sales_qty_90d, round(sales_net_90d, 1) AS sales_net_90d, round(daily_rate, 3) AS daily_rate, round(rate30, 3) AS rate30,
  CASE WHEN daily_rate > 0 THEN round(stock_qty/daily_rate, 1) END AS days_cover, last_sale_d, item_status, reliability,
  CASE WHEN daily_rate >= 1 AND stock_qty/daily_rate <= 7 THEN 'almost_out' WHEN daily_rate = 0 THEN 'no_recent_sales' WHEN stock_qty/daily_rate > 45 THEN 'excess_stock' ELSE 'balanced' END AS stock_status
FROM raw`
const kpisSql = `WITH inv AS (${INVENTORY_VIEW})
SELECT round(sum(stock_value_ils)/1e6, 2) AS stock_value_m_ils, round(sum(stock_qty)) AS stock_units, count(*) AS stock_lines, count(DISTINCT prt) AS sku_count,
  round(sum(stock_value_ils) FILTER (WHERE stock_status IN ('excess_stock','no_recent_sales'))/1e6, 2) AS excess_value_m_ils,
  count(*) FILTER (WHERE stock_status = 'almost_out') AS almost_out_lines,
  round(sum(stock_value_ils) FILTER (WHERE stock_status = 'almost_out')) AS almost_out_value_ils
FROM inv`
const deptSql = `WITH inv AS (${INVENTORY_VIEW})
SELECT dept, count(DISTINCT prt) AS sku_count, count(*) AS stock_lines, round(sum(stock_qty)) AS stock_units, round(sum(stock_value_ils)) AS stock_value_ils,
  round(sum(sales_net_90d)) AS sales_net_90d, round(sum(stock_value_ils)/nullif(sum(sales_net_90d), 0), 2) AS cash_to_90d_sales
FROM inv GROUP BY 1 ORDER BY stock_value_ils DESC NULLS LAST LIMIT 25`
const excessSql = `WITH inv AS (${INVENTORY_VIEW})
SELECT prt, item, branch_id, branch, dept, stock_qty, daily_rate, rate30, days_cover, stock_value_ils,
  CASE WHEN stock_status = 'no_recent_sales' THEN 'אין מכירות ב-90 יום' WHEN days_cover > 90 THEN 'כיסוי מעל 90 יום' ELSE 'כיסוי מעל 45 יום' END AS reason, reliability
FROM inv WHERE stock_status IN ('excess_stock','no_recent_sales') AND coalesce(stock_value_ils, 0) > 500 ORDER BY stock_value_ils DESC NULLS LAST LIMIT 50`
const almostOutSql = `WITH inv AS (${INVENTORY_VIEW})
SELECT prt, item, branch_id, branch, dept, stock_qty, daily_rate, days_cover, stock_value_ils, ceil(daily_rate*14 - stock_qty) AS suggested_order_qty,
  round(greatest(daily_rate*14 - stock_qty, 0)*unit_cost) AS suggested_order_value_ils
FROM inv WHERE stock_status = 'almost_out' ORDER BY daily_rate DESC LIMIT 50`
const fd = () => fullData({ description: 'Inventory snapshot enriched with 90-day sales velocity, stock value, days cover and status by item×branch.', grain: 'one row per positive-stock item×branch', columns: 'prt, item, branch_id, branch, dept, stock_qty, unit_cost, stock_value_ils, sales_qty_90d, sales_net_90d, daily_rate, rate30, days_cover, last_sale_d, item_status, reliability, stock_status', perItemOnly: 'stock_qty,unit_cost,sales_qty_90d,daily_rate,rate30', viewSql: INVENTORY_VIEW })

VerifiedReport('inventory-analysis', { impl: verifiedReport({
  title: 'ניתוח מלאי',
  description: 'טבלאות מלאי כספי וכמותי לפי צילום המלאי: שווי עלות וכמויות לפי פריט, סניף ומחלקה.',
  whenToUse: 'טבלאות מלאי בסיסיות: שווי וכמות במלאי לפי פריט, סניף ומחלקה. '
    + 'לניתוח מלאי מלא לפי קצב מכירות — עודפים, כמעט-אזל, ימי כיסוי, סיכון זמינות והון כלוא — '
    + 'העדף את qlik-inventory-performance (מסך ה-Qlik המלא).',
  routePhrases: ['טבלת מלאי', 'דוח מלאי בסיסי', 'שווי מלאי לפי פריט', 'מלאי כספי וכמותי'],
  caveats: `${dateCaveat} כמות מצטברת מערבבת יחידות/ק״ג ולכן היא מדד תפעולי; ניתוח כספי לפי עלות אחרונה אמין יותר לסיכום בין פריטים. קצב המכירה הוא ממוצע 90 יום ולא תחזית עונתית.`,
  executiveSummary: querySlot({ goal: 'Inventory headline KPIs: value, quantity, SKU count, excess value and almost-out lines.',
    widget: { kind: 'kpi', title: 'ניתוח מלאי — מדדים', items: [kpi('stock_value_m_ils', 'שווי מלאי מ׳ ₪'), kpi('stock_units', 'כמות במלאי'), kpi('sku_count', 'מק״טים'), kpi('excess_value_m_ils', 'עודף מ׳ ₪'), kpi('almost_out_lines', 'כמעט אוזל')] }, sql: kpisSql }),
  summary: querySlot({ goal: 'Financial and quantitative inventory by department.', widget: table('מלאי לפי מחלקה', [col('dept', 'מחלקה'), col('stock_value_ils', 'שווי', '₪'), col('stock_units', 'כמות'), col('sku_count', 'מק״טים'), col('sales_net_90d', 'מכר 90 יום', '₪'), col('cash_to_90d_sales', 'מלאי/מכר')]), sql: deptSql }),
  sections: [
    section({ id: 'financial-quantity', title: 'ניתוח כספי וכמותי', goal: 'שווי, כמות, מספר מק״טים ומכר 90 יום לפי מחלקה.',
      executiveSummary: querySlot({ goal: 'Top departments by stock value.', widget: table('מלאי לפי מחלקה', [col('dept', 'מחלקה'), col('stock_value_ils', 'שווי', '₪'), col('stock_units', 'כמות'), col('sku_count', 'מק״טים')]), sql: deptSql }),
      summary: querySlot({ goal: 'Department stock balance with sales ratio.', widget: table('מלאי/מכר לפי מחלקה', [col('dept', 'מחלקה'), col('stock_value_ils', 'שווי', '₪'), col('sales_net_90d', 'מכר 90 יום', '₪'), col('cash_to_90d_sales', 'מלאי/מכר')]), sql: deptSql }),
      inDepth: querySlot({ goal: 'Department inventory deep view with quantity and line count.', widget: table('ניתוח מלאי מחלקתי', [col('dept', 'מחלקה'), col('stock_lines', 'שורות'), col('sku_count', 'מק״טים'), col('stock_units', 'כמות'), col('stock_value_ils', 'שווי', '₪')]), sql: deptSql }), fullData: fd() }),
    section({ id: 'excess-stock', title: 'מלאי עודף', goal: 'פריטים עם כיסוי גבוה או ללא מכירות 90 יום, ממוינים לפי שווי מלאי.',
      executiveSummary: querySlot({ goal: 'Top excess-stock lines by tied cash.', widget: table('עודפי מלאי לפי קצב מכירות', [col('item', 'פריט'), col('branch', 'סניף'), col('stock_value_ils', 'שווי', '₪'), col('stock_qty', 'כמות'), col('days_cover', 'ימי כיסוי'), col('reason', 'סיבה')]), sql: excessSql }),
      summary: querySlot({ goal: 'Excess-stock table with velocity and reliability.', widget: table('מלאי עודף — פריטים לטיפול', [col('item', 'פריט'), col('branch', 'סניף'), col('daily_rate', 'קצב'), col('days_cover', 'ימי כיסוי'), col('stock_value_ils', 'שווי', '₪'), col('reliability', 'אמינות')]), sql: excessSql }),
      inDepth: querySlot({ goal: 'Full excess candidates with branch and department.', widget: table('מלאי עודף — עומק', [col('prt', 'קוד'), col('item', 'פריט'), col('branch', 'סניף'), col('dept', 'מחלקה'), col('stock_qty', 'כמות'), col('stock_value_ils', 'שווי', '₪')]), sql: excessSql }), fullData: fd() }),
    section({ id: 'almost-out', title: 'מלאי שכמעט אוזל', goal: 'מהירי תנועה עם פחות משבוע כיסוי והצעת השלמה ל-14 יום.',
      executiveSummary: querySlot({ goal: 'Fast movers near stockout.', widget: table('כמעט אוזל לפי קצב מכירות', [col('item', 'פריט'), col('branch', 'סניף'), col('stock_qty', 'מלאי'), col('daily_rate', 'קצב יומי'), col('days_cover', 'ימי כיסוי'), col('suggested_order_qty', 'השלמה')]), sql: almostOutSql }),
      summary: querySlot({ goal: 'Almost-out items with suggested order value.', widget: table('השלמת מלאי מומלצת', [col('item', 'פריט'), col('branch', 'סניף'), col('daily_rate', 'קצב'), col('suggested_order_qty', 'כמות'), col('suggested_order_value_ils', 'שווי', '₪')]), sql: almostOutSql }),
      inDepth: querySlot({ goal: 'Detailed stockout-risk list by branch and department.', widget: table('סיכון חוסר — עומק', [col('prt', 'קוד'), col('item', 'פריט'), col('branch', 'סניף'), col('dept', 'מחלקה'), col('stock_qty', 'מלאי'), col('days_cover', 'ימי כיסוי')]), sql: almostOutSql }), fullData: fd() })
  ]
}) })
