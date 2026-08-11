// Validated SQL reports catalog for the Comax supermarket ERP analytics agent.
// VALIDATION: 2026-07-03 — 196/196 queries executed OK vs OEM_BI_4466 (mem_limit 2GB), row budgets enforced + 152/152 widget bindings column-checked (DESCRIBE); item-profit re-validated at product (name) grain same day
// VALIDATION: 2026-07-03 — item-trends added: 12/12 queries executed OK vs OEM_BI_4466 (11 slot sqls + product×month view, 404,497 rows / 27,458 products) + 11/11 widget bindings column-checked; price index sanity: +6.2% YoY (2026-05, 4,644 products)
// VALIDATION: 2026-07-03 — unit-safety contracts (perItemOnly on 15 fullDatas) + item-trends full_data gained price_yoy_pct/partial_month: view re-executed vs OEM_BI_4466, grain preserved (404,497 rows / 27,458 items), coke-1.5L 2026-03 yoy +12.7% matches independent ground truth, 14,225 partial-tail rows flagged; gate + regressions 7/7 green
// VALIDATION: 2026-07-05 — promo-recommendations added (recommendation engine: clearance, break-even portfolio verdicts, store gaps): 14/14 queries executed OK vs OEM_BI_4466 (0.6-3.9s each) + widget bindings column-checked via catalogIntegrity; sanity: ~10.8K clearance candidates / ₪4.3M tied cash, 33% of promoted items beat break-even (matches published 59-72% value-destroying research), winner rows face-valid (olive-oil 26% depth 2258% lift vs 120% required)
// VALIDATION: 2026-07-06 — negative-stock refactored to a single shared NEG_CTE across all 4 slots + new kind pack_single_uom_artifact (negative single offset ≥50% by same-product positive pack/tray stock in base units, same store×dept): 4/4 slots executed OK vs OEM_BI_4466, 350 lines / ₪398K carved out of packaged_suspicious, coke-1.5L(43394) reclassified in 11 stores (Gani-Tikva −15,772 offset by +13,362 bottle-equiv six-packs), bread/nuts/generic-code negatives preserved as packaged_suspicious
import { dsls } from '@jb6/core'
import '@wonder/verified-queries/verified-queries-dsl.js'
import './qlik-report-source.js'

const { 'verified-queries': { VerifiedReport, FullData, 'verified-report': { verifiedReport }, 'report-section': { section }, 'query-slot': { querySlot }, 'full-data': { fullData } } } = dsls

const T = n => `read_parquet('{{ROOT}}/${n}.parquet')`
const H = T('KupaDoc_Header'), L = T('KupaDoc_Lines'), PRT = T('Prt'), STORE = T('Store'), DEPT = T('Departments')
const GRPS = T('PrtGroups'), IDX = T('Idx'), SUP = T('Suppliers'), DPC = T('DailyPriceCost'), ZAK = T('DailyPriceCost_Zakyan')
const ITR = T('Prt_ItrotStore_Yomi'), LKH = T('KupaDocLk_Header')
const SALES = `${L} l JOIN ${H} h ON l.KupaDocC = h.C AND h.DateDoc >= DATE '2024-01-01'`
const NET = `(l.Scm - l.VatAmount)`
const COST_CTE = `cost AS (SELECT ItemID, StoreID, arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE FinalRegularCostPrice > 0) AS unit_cost FROM ${DPC} GROUP BY 1, 2)`
const LAST_FULL = `(SELECT max(DateDoc)::DATE - 1 FROM ${H})`
const M_START = `(SELECT date_trunc('month', max(DateDoc)) - INTERVAL 1 MONTH FROM ${H})`
const M_END = `(SELECT date_trunc('month', max(DateDoc)) FROM ${H})`
const DISC = `l.AczDisLine BETWEEN 0.001 AND 100`
const FULL_PRICE = `l.MivzaNo = 0 AND l.AczDisLine = 0`
const SNAP = `(SELECT max(DateDoc) FROM ${ITR})`
// negative-stock classifier, shared by all 4 slots. A negative packaged single whose SAME base product is held
// POSITIVE in another form (six-pack/tray) in the same store×dept is a unit-of-measure artifact — received as a
// pack, sold as a single (e.g. Coca-Cola 1.5L) — not shrink. base = order/dup-insensitive token set with pack
// tokens stripped (collapses catalog name-noise like "קולה קולה"); pmult = units per pack; deficit compared in base units.
const NEG_ART = `regexp_matches(p.Nm, 'שקית|פקדון|פיקדון|מארז|משטח|מיכל|בקבוק ריק|ארגז')`
const NEG_PMULT = nm => `CASE WHEN regexp_matches(${nm}, 'שישיי?ה') THEN 6 WHEN regexp_matches(${nm}, 'חמישיי?ה') THEN 5 WHEN regexp_matches(${nm}, 'רביעיי?ה') THEN 4 WHEN regexp_matches(${nm}, 'שלישיי?ה') THEN 3 WHEN regexp_matches(${nm}, '(\\d+) ?יח') THEN CAST(regexp_extract(${nm}, '(\\d+) ?יח', 1) AS INTEGER) ELSE 1 END`
const NEG_BASE = nm => `array_to_string(list_sort(list_distinct([x FOR x IN string_split(regexp_replace(${nm}, '\\d+ ?יח''?|שישיי?ה|חמישיי?ה|רביעיי?ה|שלישיי?ה|\\* ?\\d+', ' ', 'g'), ' ') IF x <> ''])), ' ')`
const NEG_CTE = `${COST_CTE},
nfam AS (
  SELECT i.Store AS store, p.DepartmentC AS deptc, ${NEG_BASE('p.Nm')} AS base, sum(i.Itra*${NEG_PMULT('p.Nm')}) AS fam_pos_base
  FROM ${ITR} i JOIN ${PRT} p ON p.C = i.Prt JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
  WHERE i.Itra > 0 GROUP BY 1, 2, 3),
nl AS (
  SELECT i.Prt AS prt, trim(p.Nm) AS item, i.Store AS location_id, trim(s.Nm) AS location, trim(dp.Nm) AS dept,
    i.Itra AS itra, c.unit_cost,
    CASE WHEN ${NEG_ART} THEN 'artifact_bags_deposits'
      WHEN p.DepartmentC IN (11, 12) OR i.Itra <> floor(i.Itra) THEN 'weighed_produce_drift'
      WHEN coalesce(f.fam_pos_base, 0) >= -i.Itra*${NEG_PMULT('p.Nm')}*0.5 THEN 'pack_single_uom_artifact'
      ELSE 'packaged_suspicious' END AS kind
  FROM ${ITR} i JOIN ${PRT} p ON p.C = i.Prt JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
  LEFT JOIN ${DEPT} dp ON dp.C = p.DepartmentC
  LEFT JOIN cost c ON c.ItemID = i.Prt AND c.StoreID = i.Store
  LEFT JOIN nfam f ON f.store = i.Store AND f.deptc = p.DepartmentC AND f.base = ${NEG_BASE('p.Nm')}
  WHERE i.Itra < 0)`
const COSTED_ITEM_STORE = `${COST_CTE},
item_store AS (
  SELECT l.PrtC AS prt, h.StoreC AS store, sum(${NET}) AS net, sum(l.Cmt) AS qty,
    sum(${NET}) FILTER (WHERE l.MivzaNo > 0) AS promo_net,
    sum(${NET}) FILTER (WHERE ${FULL_PRICE}) AS fp_net, sum(l.Cmt) FILTER (WHERE ${FULL_PRICE}) AS fp_qty
  FROM ${SALES} GROUP BY 1, 2),
costed AS (
  SELECT a.*, a.net - c.unit_cost*a.qty AS margin_ils, a.fp_net - c.unit_cost*a.fp_qty AS fp_margin_ils
  FROM item_store a JOIN cost c ON c.ItemID = a.prt AND c.StoreID = a.store AND c.unit_cost IS NOT NULL)`
const ITEM_COST_DRIFT = `drift AS (
  SELECT ItemID, arg_min(FinalRegularCostPrice, DateDoc) AS cost_first, arg_max(FinalRegularCostPrice, DateDoc) AS cost_last,
    min(DateDoc) AS first_d, max(DateDoc) AS last_d
  FROM ${DPC} WHERE FinalRegularCostPrice > 0 GROUP BY 1 HAVING min(DateDoc) < max(DateDoc)),
rev AS (SELECT l.PrtC AS prt, sum(${NET}) AS rev FROM ${SALES} WHERE ${NET} > 0 GROUP BY 1),
chg AS (
  SELECT d.ItemID, p.Spk AS spk, trim(p.Nm) AS item, r.rev, d.cost_first, d.cost_last, d.first_d, d.last_d,
    (d.cost_last - d.cost_first)/d.cost_first AS infl
  FROM drift d JOIN ${PRT} p ON p.C = d.ItemID JOIN rev r ON r.prt = d.ItemID)`
const dateCaveat = 'התאריכים מעוגנים ל-max(DateDoc) של הנתונים (extract סטטי): "יום אחרון מלא" = היום שלפני היום האחרון (האחרון קטוע), "חודש אחרון" = החודש הקלנדרי המלא האחרון.'
const sqlLiteral = s => `'${String(s).replaceAll("'", "''")}'`
const holidayValues = dsls.common.data.comaxQlikReportHolidayPeriods.$run()
  .map(([name, start, end]) => `(${sqlLiteral(name)},DATE ${sqlLiteral(start)},DATE ${sqlLiteral(end)})`).join(',')
const drillQuery = (id, title, reportId, sectionId, sql) => ({ id, title, reportId, sectionId, sql })
const salesDrillQueries = {
  branch: [
    drillQuery('months', 'מומנטום חודשי', 'branch-performance', 'ranking', `SELECT ym AS x, round(net) AS current_value, receipts, basket
FROM full_data WHERE branch = {name:q} AND ym < (SELECT max(ym) FROM full_data) ORDER BY ym DESC LIMIT 6`),
    drillQuery('days', '28 הימים המלאים האחרונים', 'branch-performance', 'daily-sales',
      `SELECT d AS x, round(net) AS current_value, round(net_prev_week) AS previous_value, wow_pct, basket
FROM full_data WHERE branch = {name:q} ORDER BY d DESC LIMIT 28`),
    drillQuery('departments', 'רווחיות לפי מחלקה', 'branch-performance', 'branch-margin', `WITH complete AS (
  SELECT max(ym) AS ym FROM full_data WHERE ym < (SELECT max(ym) FROM full_data))
SELECT dept AS name, round(sum(net)) AS current_value, round(sum(margin_ils)) AS margin_ils,
  round(100*sum(margin_ils)/nullif(sum(net_costed), 0), 1) AS margin_pct
FROM full_data fd, complete WHERE branch = {name:q} AND fd.ym = complete.ym
GROUP BY 1 ORDER BY current_value DESC LIMIT 10`)
  ],
  kpi: [
    drillQuery('branches', 'פיזור לפי סניף', 'branch-performance', 'ranking', `WITH complete AS (
  SELECT max(ym) AS ym FROM full_data WHERE ym < (SELECT max(ym) FROM full_data)), ranked AS (
  SELECT branch AS name, round(net) AS current_value, receipts, basket FROM full_data fd, complete WHERE fd.ym = complete.ym)
SELECT *, round(100*current_value/sum(current_value) OVER (), 1) AS share_pct FROM ranked ORDER BY current_value DESC LIMIT 10`),
    drillQuery('margins', 'רווחיות לפי סניף', 'branch-performance', 'branch-margin', `WITH complete AS (
  SELECT max(ym) AS ym FROM full_data WHERE ym < (SELECT max(ym) FROM full_data))
SELECT branch AS name, round(sum(net)) AS current_value, round(sum(margin_ils)) AS margin_ils,
  round(100*sum(margin_ils)/nullif(sum(net_costed), 0), 1) AS margin_pct
FROM full_data fd, complete WHERE fd.ym = complete.ym GROUP BY 1 ORDER BY margin_ils DESC LIMIT 10`)
  ],
  trend: [drillQuery('branches', 'פירוק היום לפי סניף', 'sales-overview', 'trend', `WITH chosen AS (
  SELECT branch, sum(net) AS current_value, sum(promo_net) AS promo_net, count(DISTINCT prt) AS active_items
  FROM full_data WHERE strftime(d, '%Y-%m') = regexp_extract({series:q}, '[0-9]{4}-[0-9]{2}')
    AND 'ש' || CAST(floor((day(d)-1+dayofweek(date_trunc('month', d)))/7)+1 AS INTEGER) || ' ' ||
      CASE dayofweek(d) WHEN 0 THEN 'א׳' WHEN 1 THEN 'ב׳' WHEN 2 THEN 'ג׳' WHEN 3 THEN 'ד׳'
        WHEN 4 THEN 'ה׳' WHEN 5 THEN 'ו׳' ELSE 'שבת' END = split_part({name:q}, ' ★', 1)
  GROUP BY 1)
SELECT branch AS name, round(current_value) AS current_value,
  round(100*promo_net/nullif(current_value, 0), 1) AS promo_share_pct, active_items
FROM chosen ORDER BY current_value DESC LIMIT 12`)],
  product: [drillQuery('items', 'הפריטים שמרכיבים את הקבוצה', 'sales-overview', 'item-drivers',
    `SELECT item AS name, supplier, round(current_sales) AS current_value, round(previous_sales) AS previous_value, change_pct
FROM full_data WHERE coalesce(nullif(department, ''), 'ללא מחלקה') || ' › ' ||
  coalesce(nullif(item_group, ''), 'ללא קבוצה') = {name:q} ORDER BY current_value DESC LIMIT 12`)],
  supplier: [drillQuery('items', 'הפריטים המובילים של הספק', 'sales-overview', 'supplier-drivers',
    `SELECT item AS name, department, item_group, round(current_sales) AS current_value,
  round(previous_sales) AS previous_value, change_pct
FROM full_data WHERE supplier = {name:q} ORDER BY current_value DESC LIMIT 12`)]
}
const salesDrillSpec = mode => ({ reactComp: mode == 'branch' ? 'branchDrillPanel' : 'salesDrillPanel', mode,
  title: 'פירוט — {name}', width: 680, queries: salesDrillQueries[mode] || [] })
const monthTrendWidget = { kind: 'line', title: 'מכירות יומיות — ימי שבוע מקבילים', x: 'aligned_day', y: 'net_sales',
  seriesBy: 'period', valueFormat: '₪', smooth: false, note: 'השוואה לפי שבוע ויום; ★ חג או ערב חג באחת התקופות',
  drill: salesDrillSpec('trend') }
const monthKpiWidget = { kind: 'kpi', title: 'חודש מלא אחרון מול חודש קודם', deltaFormat: '%', items: [
  {label: 'מכירות נטו', col: 'current_sales', format: '₪', deltaCol: 'sales_change_pct'},
  {label: 'רווח גולמי', col: 'current_profit', format: '₪', deltaCol: 'profit_change_pct'},
  {label: 'רווחיות', col: 'current_margin_pct', format: '%', deltaCol: 'margin_change_pp'},
  {label: 'כמות', col: 'current_quantity', format: 'int', deltaCol: 'quantity_change_pct'},
  {label: 'סל ממוצע', col: 'current_basket', format: '₪', deltaCol: 'basket_change_pct'}
], drill: salesDrillSpec('kpi') }
const monthKpiSql = `WITH bounds AS (
  SELECT date_trunc('month', max(DateDoc)) AS current_end,
    date_trunc('month', max(DateDoc)) - INTERVAL 1 MONTH AS current_start
  FROM ${H}),
mh AS (
  SELECT date_trunc('month', h.DateDoc) AS m, sum(h.Scm - h.ScmMaam) AS sales,
    count(*) FILTER (WHERE h.Scm > 0) AS receipts,
    sum(h.Scm - h.ScmMaam) FILTER (WHERE h.Scm > 0) AS positive_sales
  FROM ${H} h, bounds b
  WHERE h.DateDoc >= b.current_start - INTERVAL 1 MONTH AND h.DateDoc < b.current_end GROUP BY 1),
ml AS (
  SELECT date_trunc('month', h.DateDoc) AS m, sum(l.Cmt) AS quantity,
    sum(${NET} - l.Cmt*coalesce(z.FinalCostPrice, c.FinalRegularCostPrice, 0)) AS profit
  FROM ${SALES}
  CROSS JOIN bounds b
  LEFT JOIN ${DPC} c ON c.StoreID = h.StoreC AND c.ItemID = l.PrtC
    AND c.DateDoc = year(h.DateDoc)*10000 + month(h.DateDoc)*100 + day(h.DateDoc)
  LEFT JOIN ${ZAK} z ON z.StoreID = h.StoreC AND z.ItemID = l.PrtC AND z.CustomerID = h.CustomerC
    AND z.MivzaC = l.MivzaNo AND z.DateDoc = year(h.DateDoc)*10000 + month(h.DateDoc)*100 + day(h.DateDoc)
  WHERE h.DateDoc >= b.current_start - INTERVAL 1 MONTH AND h.DateDoc < b.current_end GROUP BY 1),
mo AS (SELECT mh.*, ml.quantity, ml.profit FROM mh JOIN ml USING (m))
SELECT strftime(cur.m, '%Y-%m') AS current_month, strftime(prev.m, '%Y-%m') AS previous_month,
  round(cur.sales) AS current_sales, round(prev.sales) AS previous_sales,
  round(100*(cur.sales/NULLIF(prev.sales, 0)-1), 1) AS sales_change_pct,
  round(cur.profit) AS current_profit, round(100*(cur.profit/NULLIF(prev.profit, 0)-1), 1) AS profit_change_pct,
  round(100*cur.profit/NULLIF(cur.sales, 0), 1) AS current_margin_pct,
  round(100*cur.profit/NULLIF(cur.sales, 0) - 100*prev.profit/NULLIF(prev.sales, 0), 1) AS margin_change_pp,
  round(cur.quantity) AS current_quantity,
  round(100*(cur.quantity/NULLIF(prev.quantity, 0)-1), 1) AS quantity_change_pct,
  round(cur.positive_sales/NULLIF(cur.receipts, 0), 1) AS current_basket,
  round(100*((cur.positive_sales/NULLIF(cur.receipts, 0))/(prev.positive_sales/NULLIF(prev.receipts, 0))-1), 1) AS basket_change_pct,
  cur.receipts AS current_receipts
FROM mo cur JOIN mo prev ON prev.m = cur.m - INTERVAL 1 MONTH
WHERE cur.m = (SELECT current_start FROM bounds)`
const monthDailySql = `WITH bounds AS (
  SELECT date_trunc('month', max(DateDoc))::DATE AS current_end,
    (date_trunc('month', max(DateDoc)) - INTERVAL 1 MONTH)::DATE AS current_start FROM ${H}),
holidays(holiday, start_date, end_date) AS (VALUES ${holidayValues}),
daily AS (
  SELECT h.DateDoc::DATE AS d, date_trunc('month', h.DateDoc)::DATE AS month_start,
    round(sum(h.Scm - h.ScmMaam)) AS net_sales
  FROM ${H} h CROSS JOIN bounds b
  WHERE h.DateDoc >= b.current_start - INTERVAL 1 MONTH AND h.DateDoc < b.current_end GROUP BY 1, 2),
dated AS (
  SELECT d.*, coalesce(h.holiday, 'ערב ' || e.holiday) AS event
  FROM daily d LEFT JOIN holidays h ON d.d BETWEEN h.start_date AND h.end_date
  LEFT JOIN holidays e ON d.d = e.start_date - INTERVAL 1 DAY),
periods AS (
  SELECT current_start AS month_start, 'חודש מלא אחרון ' || strftime(current_start, '%Y-%m') AS period FROM bounds
  UNION ALL SELECT current_start - INTERVAL 1 MONTH, 'חודש קודם ' || strftime(current_start - INTERVAL 1 MONTH, '%Y-%m') FROM bounds),
cells AS (SELECT unnest(generate_series(0, 35))::INTEGER AS cell),
aligned AS (
  SELECT month_start, (floor((day(d) - 1 + dayofweek(month_start))/7)*7 + dayofweek(d))::INTEGER AS cell,
    net_sales, event FROM dated),
marks AS (SELECT cell, string_agg(DISTINCT event, ' / ') AS event FROM aligned WHERE event IS NOT NULL GROUP BY 1)
SELECT 'ש' || (floor(c.cell/7) + 1)::INTEGER || ' ' || CASE c.cell%7 WHEN 0 THEN 'א׳' WHEN 1 THEN 'ב׳'
    WHEN 2 THEN 'ג׳' WHEN 3 THEN 'ד׳' WHEN 4 THEN 'ה׳' WHEN 5 THEN 'ו׳' ELSE 'שבת' END
    || coalesce(' ★ ' || m.event, '') AS aligned_day,
  p.period, a.net_sales
FROM periods p CROSS JOIN cells c
LEFT JOIN aligned a ON a.month_start = p.month_start AND a.cell = c.cell
LEFT JOIN marks m ON m.cell = c.cell ORDER BY c.cell, p.month_start DESC`
const monthBranchSql = `WITH bounds AS (
  SELECT date_trunc('month', max(DateDoc)) AS current_end,
    date_trunc('month', max(DateDoc)) - INTERVAL 1 MONTH AS current_start FROM ${H}),
r AS (
  SELECT trim(s.Nm) AS branch, date_trunc('month', h.DateDoc) AS m, sum(h.Scm - h.ScmMaam) AS sales
  FROM ${H} h JOIN ${STORE} s ON s.C = h.StoreC CROSS JOIN bounds b
  WHERE h.DateDoc >= b.current_start - INTERVAL 1 MONTH AND h.DateDoc < b.current_end GROUP BY 1, 2),
p AS (
  SELECT branch, max(sales) FILTER (WHERE m = b.current_start) AS current_sales,
    max(sales) FILTER (WHERE m = b.current_start - INTERVAL 1 MONTH) AS previous_sales
  FROM r CROSS JOIN bounds b GROUP BY 1)
SELECT branch, round(current_sales) AS current_sales, round(previous_sales) AS previous_sales,
  round(current_sales - previous_sales) AS change_ils,
  round(100*(current_sales/NULLIF(previous_sales, 0)-1), 1) AS change_pct
FROM p`
const monthItemSql = `WITH bounds AS (
  SELECT date_trunc('month', max(DateDoc)) AS current_end,
    date_trunc('month', max(DateDoc)) - INTERVAL 1 MONTH AS current_start FROM ${H}),
r AS (
  SELECT trim(d.Nm) AS department, trim(g.Nm) AS item_group, trim(p.Nm) AS item, trim(s.Nm) AS supplier,
    date_trunc('month', h.DateDoc) AS m, sum(${NET}) AS sales
  FROM ${SALES}
  JOIN ${PRT} p ON p.C = l.PrtC LEFT JOIN ${DEPT} d ON d.C = p.DepartmentC
  LEFT JOIN ${GRPS} g ON g.C = p.GroupC LEFT JOIN ${SUP} s ON s.C = p.Spk CROSS JOIN bounds b
  WHERE h.DateDoc >= b.current_start - INTERVAL 1 MONTH AND h.DateDoc < b.current_end GROUP BY 1, 2, 3, 4, 5),
p AS (
  SELECT department, item_group, item, supplier,
    max(sales) FILTER (WHERE m = b.current_start) AS current_sales,
    max(sales) FILTER (WHERE m = b.current_start - INTERVAL 1 MONTH) AS previous_sales
  FROM r CROSS JOIN bounds b GROUP BY 1, 2, 3, 4)
SELECT department, item_group, item, supplier, round(current_sales) AS current_sales,
  round(previous_sales) AS previous_sales, round(current_sales - previous_sales) AS change_ils,
  round(100*(current_sales/NULLIF(previous_sales, 0)-1), 1) AS change_pct
FROM p WHERE coalesce(current_sales, previous_sales) IS NOT NULL`
const branchComparisonCols = [
  {key: 'branch', label: 'סניף'}, {key: 'current_sales', label: 'חודש מלא אחרון', format: '₪'},
  {key: 'previous_sales', label: 'חודש קודם', format: '₪'}, {key: 'change_ils', label: 'פער', format: '₪'},
  {key: 'change_pct', label: 'שינוי', format: '%'}
]
const itemDriverCols = [
  {key: 'department', label: 'מחלקה'}, {key: 'item_group', label: 'קבוצה'}, {key: 'item', label: 'פריט'},
  {key: 'supplier', label: 'ספק'}, {key: 'current_sales', label: 'חודש מלא אחרון', format: '₪'},
  {key: 'previous_sales', label: 'חודש קודם', format: '₪'}, {key: 'change_ils', label: 'פער', format: '₪'},
  {key: 'change_pct', label: 'שינוי', format: '%'}
]
const comparisonSlot = (goal, title, columns, order, limit, mode = 'row') => querySlot({
  goal, widget: { kind: 'table', title, columns, drill: salesDrillSpec(mode) },
  sql: `SELECT * FROM full_data ORDER BY ${order} DESC LIMIT ${limit}`
})
const driverSlot = (goal, title, category, expression, limit, mode) => querySlot({
  goal,
  widget: { kind: 'groupedBar', title, category, ys: [
    {col: 'current_sales', label: 'חודש מלא אחרון'}, {col: 'previous_sales', label: 'חודש קודם'}
  ], valueFormat: '₪', drill: salesDrillSpec(mode) },
  sql: `SELECT ${expression} AS ${category}, round(sum(current_sales)) AS current_sales,
  round(sum(previous_sales)) AS previous_sales, round(sum(change_ils)) AS change_ils,
  round(100*(sum(current_sales)/NULLIF(sum(previous_sales), 0)-1), 1) AS change_pct
FROM full_data WHERE ${expression} IS NOT NULL GROUP BY 1 ORDER BY current_sales DESC LIMIT ${limit}`
})
const productHierarchy = "coalesce(nullif(department, ''), 'ללא מחלקה') || ' › ' || " +
  "coalesce(nullif(item_group, ''), 'ללא קבוצה')"

VerifiedReport('sales-overview', { impl: verifiedReport({
  title: 'תמונת מכירות כללית',
  description: 'מבט-על על הכנסות הרשת: חודש מלא מול קודמו, מגמה, הדופק היומי, שעות, עומסים וסופי שבוע.',
  whenToUse: 'שאלות על מצב המכירות, חודש מלא מול חודש קודם, מגמות, עונתיות שבועית, ' +
    'שעות שיא ואיוש וסופ"ש מול חול. ' +
    'להשוואה חודשית מלאה (מכירות החודש מול חודש שעבר) בחר את כל ארבעת הפרקים: ' +
    'trend, branch-comparison, item-drivers, supplier-drivers.',
  routePhrases: ['מכירות', 'מחזור', 'פדיון', 'הכנסות', 'חודש מלא אחרון', 'חודש מול חודש',
    'מכירות החודש ביחס לחודש שעבר', 'לעומת החודש הקודם', 'מגמה', 'שעות שיא'],
  questionsCovered: ['Q1', 'Q4', 'Q5', 'Q6', 'Q8'],
  caveats: `${dateCaveat} הכנסה = נטו ללא מע"מ (Scm - ScmMaam); החזרים מתקזזים. ` +
    `d כולל את חודש הנתונים הרץ/האחרון; חיתוך חודש קלנדרי חייב להחריג date_trunc('month', max(d)). ` +
    'receipts ברמת יום×פריט×סניף אינו חיבורי; לקבלות ולסל יש להשתמש ב-slot המאומת ברמת הדוח ' +
    'ולא לסכום receipts מ-fullData.',
  executiveSummary: querySlot({
    goal: 'Five sales KPIs for the latest complete calendar month versus the preceding complete month.',
    widget: monthKpiWidget,
    sql: monthKpiSql
  }),
  summary: querySlot({
    goal: 'Five sales KPIs for the latest complete calendar month versus the preceding complete month.',
    widget: monthKpiWidget,
    sql: monthKpiSql
  }),
  sections: [
    section({
      id: 'trend',
      title: 'מגמה והשוואת תקופות',
      goal: 'Compare the latest complete calendar month with its predecessor and show the aligned daily sales trend.',
      caveats: 'd in fullData includes the running/latest data month. Calendar-month slices must exclude ' +
        "date_trunc('month', max(d)). Product-grain receipts are non-additive; use the verified report-level KPI slot for receipts and basket.",
      executiveSummary: querySlot({
        goal: 'Aligned daily sales for the latest two complete calendar months.',
        widget: monthTrendWidget,
        sql: monthDailySql
      }),
      summary: querySlot({
        goal: 'Aligned daily sales for the latest two complete calendar months.',
        widget: monthTrendWidget,
        sql: monthDailySql
      }),
      inDepth: querySlot({
        goal: 'Weekly trend of the last 13 complete Mon-Sun weeks, promo vs non-promo split, with week-over-week change on the non-promo base (the underlying demand signal).',
        widget: { kind: 'line', title: 'מחזור שבועי — עם ובלי מבצעים (₪)', subtitle: '13 שבועות אחרונים', valueFormat: '₪', x: 'week_start', ys: [{col: 'net', label: 'נטו'}, {col: 'net_ex_promo', label: 'ללא מבצעים'}] },
        sql: `WITH wk AS (
  SELECT date_trunc('week', h.DateDoc)::DATE AS week_start,
    sum(${NET}) AS net,
    sum(CASE WHEN l.MivzaNo = 0 THEN ${NET} ELSE 0 END) AS net_ex_promo
  FROM ${SALES}
  WHERE h.DateDoc::DATE > ${LAST_FULL} - 98 AND date_trunc('week', h.DateDoc)::DATE + 6 <= ${LAST_FULL}
  GROUP BY 1)
SELECT week_start, round(net) AS net, round(net_ex_promo) AS net_ex_promo,
  round(100.0*net_ex_promo/nullif(net, 0), 1) AS ex_promo_share_pct,
  round(100.0*(net_ex_promo - lag(net_ex_promo) OVER (ORDER BY week_start))
    /nullif(lag(net_ex_promo) OVER (ORDER BY week_start), 0), 1) AS wow_ex_promo_pct
FROM wk ORDER BY week_start DESC LIMIT 13`
      }),
      fullData: fullData({
        description: 'Daily sales since 2024 by product and branch. d includes the running/latest month. ' +
          'receipts is non-additive across products; use the verified report KPI slot for receipts and basket.',
        grain: 'one row per (day, product, branch) (2024-01-01 onward)',
        columns: 'd: day, weekday_no: 0=Sun..6=Sat, weekday_name: English day name, prt: product id, branch_id: StoreC, branch, gross: revenue incl VAT, net: revenue ex VAT, promo_net: net on MivzaNo>0 lines, disc_net: net on discounted lines, receipts: positive receipts, branches_traded: distinct stores that sold',
        viewSql: `WITH agg AS (
  SELECT h.DateDoc::DATE AS d, l.PrtC AS prt, h.StoreC AS branch_id,
    round(sum(l.Scm), 1) AS gross, round(sum(l.Scm - l.VatAmount), 1) AS net,
    round(sum(CASE WHEN l.MivzaNo > 0 THEN l.Scm - l.VatAmount ELSE 0 END), 1) AS promo_net,
    round(sum(CASE WHEN l.AczDisLine BETWEEN 0.001 AND 100 THEN l.Scm - l.VatAmount ELSE 0 END), 1) AS disc_net,
    count(DISTINCT h.C) FILTER (WHERE h.Scm > 0) AS receipts,
    count(DISTINCT h.StoreC) AS branches_traded
  FROM read_parquet('{{ROOT}}/KupaDoc_Lines.parquet') l JOIN read_parquet('{{ROOT}}/KupaDoc_Header.parquet') h ON l.KupaDocC = h.C AND h.DateDoc >= DATE '2024-01-01'
  GROUP BY 1, 2, 3)
SELECT a.d, dayofweek(a.d) AS weekday_no, dayname(a.d) AS weekday_name, a.prt, a.branch_id, trim(s.Nm) AS branch,
  a.gross, a.net, a.promo_net, a.disc_net, a.receipts, a.branches_traded
FROM agg a JOIN read_parquet('{{ROOT}}/Store.parquet') s ON s.C = a.branch_id`
      })
    }),
    section({
      id: 'branch-comparison',
      title: 'השוואת סניפים בין חודשים',
      goal: 'Compare branch sales for the latest complete month versus the preceding complete month.',
      executiveSummary: comparisonSlot('Top branch comparisons.', 'מכירות לפי סניף — חודש מול קודם',
        branchComparisonCols, 'current_sales', 8, 'branch'),
      summary: comparisonSlot('Branch comparisons.', 'מכירות לפי סניף — חודש מול קודם',
        branchComparisonCols, 'current_sales', 15, 'branch'),
      inDepth: comparisonSlot('All branch comparisons.', 'מכירות לפי סניף — פירוט',
        branchComparisonCols, 'current_sales', 50, 'branch'),
      fullData: fullData({
        description: 'Branch sales comparison for the latest two complete calendar months.',
        grain: 'one row per branch',
        columns: 'branch, current_sales, previous_sales, change_ils, change_pct',
        viewSql: monthBranchSql
      })
    }),
    section({
      id: 'item-drivers',
      title: 'מכירות לפי היררכיית פריט',
      goal: 'Compare month-over-month sales by department and item-group hierarchy.',
      executiveSummary: driverSlot('Largest product hierarchy groups.',
        'מכירות לפי היררכיית פריט — חודש מול קודם', 'product_hierarchy', productHierarchy, 8, 'product'),
      summary: driverSlot('Main product hierarchy groups.',
        'מכירות לפי היררכיית פריט — חודש מול קודם', 'product_hierarchy', productHierarchy, 20, 'product'),
      inDepth: comparisonSlot('Detailed item drivers.', 'היררכיית פריט וספק — פירוט',
        itemDriverCols, 'abs(change_ils)', 50, 'product'),
      fullData: fullData({
        description: 'Product hierarchy sales comparison for the latest two complete calendar months.',
        grain: 'one row per department, item group, item and supplier',
        columns: 'department, item_group, item, supplier, current_sales, previous_sales, change_ils, change_pct',
        viewSql: monthItemSql
      })
    }),
    section({
      id: 'supplier-drivers',
      title: 'מכירות לפי ספק',
      goal: 'Compare month-over-month sales by supplier.',
      executiveSummary: driverSlot('Largest supplier comparisons.',
        'מכירות לפי ספק — חודש מול קודם', 'supplier', 'supplier', 8, 'supplier'),
      summary: driverSlot('Main supplier comparisons.',
        'מכירות לפי ספק — חודש מול קודם', 'supplier', 'supplier', 20, 'supplier'),
      inDepth: comparisonSlot('Detailed supplier drivers.', 'מכירות לפי ספק — פירוט',
        itemDriverCols, 'abs(change_ils)', 50, 'supplier'),
      fullData: fullData({
        description: 'Supplier sales comparison for the latest two complete calendar months.',
        grain: 'one row per department, item group, item and supplier',
        columns: 'department, item_group, item, supplier, current_sales, previous_sales, change_ils, change_pct',
        viewSql: monthItemSql
      })
    }),
    section({
      id: 'daily-pulse',
      title: 'הדופק היומי',
      goal: 'How did the last full trading day perform vs the same weekday in prior weeks — the "how was yesterday" view.',
      caveats: 'היום האחרון בנתונים קטוע ולכן "אתמול" = היום המלא האחרון. ההשוואה היא תמיד מול אותו יום בשבוע (נטרול עונתיות שבועית). אם היום המלא האחרון הוא שבת — יופיעו רק סניפי השבת.',
      executiveSummary: querySlot({
        goal: 'Chain totals for the last full day vs the same weekday one week earlier.',
        widget: { kind: 'kpi', title: 'היום המלא האחרון', items: [{label: 'נטו', col: 'net_last_day', format: '₪', deltaCol: 'net_chg_pct'}, {label: 'קבלות', col: 'receipts_last_day', format: 'int'}, {label: 'אותו יום שבוע שעבר', col: 'net_same_weekday_prev', format: '₪'}, {label: 'קבלות שבוע שעבר', col: 'receipts_prev', format: 'int'}] },
        sql: `SELECT ${LAST_FULL} AS last_full_day, dayname(${LAST_FULL}) AS weekday_name,
  round(sum(Scm - ScmMaam) FILTER (WHERE DateDoc::DATE = ${LAST_FULL})) AS net_last_day,
  count(*) FILTER (WHERE DateDoc::DATE = ${LAST_FULL} AND Scm > 0) AS receipts_last_day,
  round(sum(Scm - ScmMaam) FILTER (WHERE DateDoc::DATE = ${LAST_FULL} - 7)) AS net_same_weekday_prev,
  count(*) FILTER (WHERE DateDoc::DATE = ${LAST_FULL} - 7 AND Scm > 0) AS receipts_prev,
  round(100.0*(sum(Scm - ScmMaam) FILTER (WHERE DateDoc::DATE = ${LAST_FULL})
    - sum(Scm - ScmMaam) FILTER (WHERE DateDoc::DATE = ${LAST_FULL} - 7))
    /nullif(sum(Scm - ScmMaam) FILTER (WHERE DateDoc::DATE = ${LAST_FULL} - 7), 0), 1) AS net_chg_pct
FROM ${H}
WHERE DateDoc::DATE = ${LAST_FULL} OR DateDoc::DATE = ${LAST_FULL} - 7
LIMIT 1`
      }),
      summary: querySlot({
        goal: 'Per-branch net and receipts on the last full day vs same weekday last week, plus a chain total row.',
        widget: { kind: 'table', title: 'סניפים — יום אחרון מול שבוע שעבר', columns: [{key: 'branch', label: 'סניף'}, {key: 'net_last_day', label: 'נטו יום אחרון', format: '₪'}, {key: 'net_same_weekday_prev', label: 'אותו יום שבוע שעבר', format: '₪'}, {key: 'net_chg_pct', label: 'שינוי', format: '%'}, {key: 'receipts', label: 'קבלות', format: 'int'}] },
        sql: `WITH d AS (
  SELECT trim(s.Nm) AS branch,
    sum(h.Scm - h.ScmMaam) FILTER (WHERE h.DateDoc::DATE = ${LAST_FULL}) AS net_last,
    count(*) FILTER (WHERE h.DateDoc::DATE = ${LAST_FULL} AND h.Scm > 0) AS receipts_last,
    sum(h.Scm - h.ScmMaam) FILTER (WHERE h.DateDoc::DATE = ${LAST_FULL} - 7) AS net_prev
  FROM ${H} h JOIN ${STORE} s ON s.C = h.StoreC
  WHERE h.DateDoc::DATE = ${LAST_FULL} OR h.DateDoc::DATE = ${LAST_FULL} - 7
  GROUP BY 1)
SELECT branch, round(net_last) AS net_last_day, receipts_last AS receipts,
  round(net_prev) AS net_same_weekday_prev,
  round(100.0*(net_last - net_prev)/nullif(net_prev, 0), 1) AS net_chg_pct
FROM d
UNION ALL
SELECT 'סה"כ רשת', round(sum(net_last)), sum(receipts_last), round(sum(net_prev)),
  round(100.0*(sum(net_last) - sum(net_prev))/nullif(sum(net_prev), 0), 1)
FROM d
ORDER BY net_last_day DESC NULLS LAST LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Per-branch last full day vs the AVERAGE of the same weekday over the prior 4 weeks: net, receipts and basket vs baseline.',
        widget: { kind: 'table', title: 'סניפים מול ממוצע 4 שבועות', columns: [{key: 'branch', label: 'סניף'}, {key: 'net_last_day', label: 'נטו יום אחרון', format: '₪'}, {key: 'net_same_weekday_avg_4w', label: 'ממוצע 4 שבועות', format: '₪'}, {key: 'net_vs_4w_avg_pct', label: 'מול ממוצע', format: '%'}, {key: 'basket', label: 'סל', format: '₪'}, {key: 'receipts', label: 'קבלות', format: 'int'}] },
        sql: `WITH d AS (
  SELECT h.StoreC,
    sum(h.Scm - h.ScmMaam) FILTER (WHERE h.DateDoc::DATE = ${LAST_FULL}) AS net_last,
    count(*) FILTER (WHERE h.DateDoc::DATE = ${LAST_FULL} AND h.Scm > 0) AS receipts_last,
    sum(h.Scm - h.ScmMaam) FILTER (WHERE h.DateDoc::DATE < ${LAST_FULL}) AS net_base,
    count(*) FILTER (WHERE h.DateDoc::DATE < ${LAST_FULL} AND h.Scm > 0) AS receipts_base,
    count(DISTINCT h.DateDoc::DATE) FILTER (WHERE h.DateDoc::DATE < ${LAST_FULL}) AS base_days
  FROM ${H} h
  WHERE h.DateDoc::DATE = ${LAST_FULL}
     OR (h.DateDoc::DATE >= ${LAST_FULL} - 28 AND h.DateDoc::DATE < ${LAST_FULL} AND dayofweek(h.DateDoc) = dayofweek(${LAST_FULL}))
  GROUP BY 1)
SELECT trim(s.Nm) AS branch, round(net_last) AS net_last_day, receipts_last AS receipts,
  round(net_last/nullif(receipts_last, 0), 1) AS basket,
  round(net_base/nullif(base_days, 0)) AS net_same_weekday_avg_4w,
  round(receipts_base*1.0/nullif(base_days, 0)) AS receipts_avg_4w,
  round(100.0*(net_last - net_base/nullif(base_days, 0))/nullif(net_base/nullif(base_days, 0), 0), 1) AS net_vs_4w_avg_pct
FROM d JOIN ${STORE} s ON s.C = d.StoreC
WHERE net_last IS NOT NULL OR net_base IS NOT NULL
ORDER BY net_last_day DESC NULLS LAST LIMIT 50`
      }),
      fullData: fullData({
        description: 'Branch-by-day performance over the last 90 days, for building any custom daily comparison.',
        grain: 'one row per branch per trading day, last 90 days (~1000 rows)',
        columns: 'branch_id: StoreC, branch: store name, d: day, weekday_no: 0=Sun..6=Sat, net: net revenue, receipts: positive receipts, basket: net per positive receipt',
        viewSql: `SELECT h.StoreC AS branch_id, trim(s.Nm) AS branch, h.DateDoc::DATE AS d, dayofweek(h.DateDoc) AS weekday_no,
  round(sum(h.Scm - h.ScmMaam), 1) AS net,
  count(*) FILTER (WHERE h.Scm > 0) AS receipts,
  round(sum(h.Scm - h.ScmMaam) FILTER (WHERE h.Scm > 0)/nullif(count(*) FILTER (WHERE h.Scm > 0), 0), 1) AS basket
FROM ${H} h JOIN ${STORE} s ON s.C = h.StoreC
WHERE h.DateDoc::DATE > ${LAST_FULL} - 90 AND h.DateDoc::DATE <= ${LAST_FULL}
GROUP BY 1, 2, 3, 4`
      })
    }),
    section({
      id: 'hours-and-days',
      title: 'שעות וימים',
      goal: 'When does traffic and revenue happen — hour-of-day and day-of-week patterns for staffing decisions.',
      executiveSummary: querySlot({
        goal: 'Top 8 chain-wide hours by receipts in the latest complete month.',
        widget: { kind: 'bar', title: 'שעות שיא לפי קבלות', subtitle: 'חודש מלא אחרון', valueFormat: 'int', name: 'hour_of_day', value: 'receipts', highlight: {max: true, note: 'שעת השיא'} },
        sql: `SELECT h.Hour AS hour_of_day,
  count(*) FILTER (WHERE h.Scm > 0) AS receipts,
  round(sum(h.Scm - h.ScmMaam)) AS net,
  round(100.0*count(*) FILTER (WHERE h.Scm > 0)/sum(count(*) FILTER (WHERE h.Scm > 0)) OVER (), 1) AS receipts_share_pct
FROM ${H} h
WHERE h.DateDoc >= ${M_START} AND h.DateDoc < ${M_END}
GROUP BY 1 ORDER BY receipts DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Full hour-of-day profile for the latest complete month: receipts, net, basket per hour.',
        widget: { kind: 'area', title: 'קבלות לפי שעה ביום', subtitle: 'חודש מלא אחרון', valueFormat: 'int', x: 'hour_of_day', ys: [{col: 'receipts', label: 'קבלות'}] },
        sql: `SELECT h.Hour AS hour_of_day,
  count(*) FILTER (WHERE h.Scm > 0) AS receipts,
  round(sum(h.Scm - h.ScmMaam)) AS net,
  round(sum(h.Scm - h.ScmMaam) FILTER (WHERE h.Scm > 0)/nullif(count(*) FILTER (WHERE h.Scm > 0), 0), 1) AS basket,
  round(100.0*count(*) FILTER (WHERE h.Scm > 0)/sum(count(*) FILTER (WHERE h.Scm > 0)) OVER (), 1) AS receipts_share_pct
FROM ${H} h
WHERE h.DateDoc >= ${M_START} AND h.DateDoc < ${M_END}
GROUP BY 1 ORDER BY hour_of_day LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Per-branch top-3 peak hours by receipts (latest complete month) — branches split into evening-peak vs midday-peak archetypes needing different shift templates.',
        widget: { kind: 'table', title: 'שעות השיא של כל סניף', columns: [{key: 'branch', label: 'סניף'}, {key: 'top3_hours_by_receipts', label: '3 שעות שיא'}, {key: 'top3_share_pct', label: 'נתח השיא', format: '%'}, {key: 'receipts_month', label: 'קבלות בחודש', format: 'int'}] },
        sql: `WITH hb AS (
  SELECT h.StoreC, h.Hour AS hr, count(*) AS receipts
  FROM ${H} h
  WHERE h.Scm > 0 AND h.DateDoc >= ${M_START} AND h.DateDoc < ${M_END}
  GROUP BY 1, 2),
ranked AS (
  SELECT trim(s.Nm) AS branch, hr, receipts,
    row_number() OVER (PARTITION BY hb.StoreC ORDER BY receipts DESC) AS rn,
    sum(receipts) OVER (PARTITION BY hb.StoreC) AS total_receipts
  FROM hb JOIN ${STORE} s ON s.C = hb.StoreC)
SELECT branch,
  string_agg(hr || 'h (' || receipts || ')', ', ' ORDER BY rn) AS top3_hours_by_receipts,
  round(100.0*sum(receipts)/max(total_receipts), 1) AS top3_share_pct,
  max(total_receipts) AS receipts_month
FROM ranked WHERE rn <= 3
GROUP BY branch ORDER BY receipts_month DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Branch × weekday × hour traffic/revenue matrix over the last 13 complete weeks (91 days) — the raw staffing heatmap.',
        grain: 'one row per (branch, weekday, hour) with sales in the window (~1400 rows)',
        columns: 'branch_id: StoreC, branch: store name, weekday_no: 0=Sun..6=Sat, weekday_name, hour_of_day: 0-23, receipts: positive receipts, net: net revenue, days_traded: distinct days this slot traded',
        viewSql: `SELECT h.StoreC AS branch_id, trim(s.Nm) AS branch, dayofweek(h.DateDoc) AS weekday_no, dayname(h.DateDoc) AS weekday_name,
  h.Hour AS hour_of_day,
  count(*) FILTER (WHERE h.Scm > 0) AS receipts,
  round(sum(h.Scm - h.ScmMaam), 1) AS net,
  count(DISTINCT h.DateDoc::DATE) AS days_traded
FROM ${H} h JOIN ${STORE} s ON s.C = h.StoreC
WHERE h.DateDoc::DATE > ${LAST_FULL} - 91 AND h.DateDoc::DATE <= ${LAST_FULL}
GROUP BY 1, 2, 3, 4, 5`
      })
    }),
    section({
      id: 'weekend',
      title: 'סופ"ש מול חול',
      goal: 'Weekend (Fri-Sat) share of revenue and per-day economics; the weekend is really a Friday phenomenon in this Shabbat-closed chain.',
      caveats: 'רק 3 סניפים סוחרים בשבת (גני תקווה, אם המושבות, רמת השרון) — שבת היא היום החלש ברשת ושישי הוא היום החזק. "סופ"ש" ישראלי = שישי-שבת (dayofweek 5,6).',
      executiveSummary: querySlot({
        goal: 'Weekend vs weekday: net, share of revenue, and net per trading day (2024+).',
        widget: { kind: 'pie', title: 'סופ"ש מול חול — נטו (₪)', donut: true, valueFormat: '₪', name: 'daypart', value: 'net' },
        sql: `SELECT CASE WHEN dayofweek(DateDoc) IN (5, 6) THEN 'weekend_fri_sat' ELSE 'weekday_sun_thu' END AS daypart,
  round(sum(Scm - ScmMaam)) AS net,
  round(100.0*sum(Scm - ScmMaam)/sum(sum(Scm - ScmMaam)) OVER (), 1) AS pct_of_total,
  count(DISTINCT DateDoc::DATE) AS n_days,
  round(sum(Scm - ScmMaam)/count(DISTINCT DateDoc::DATE)) AS net_per_day
FROM ${H}
WHERE DateDoc >= DATE '2024-01-01'
GROUP BY 1 ORDER BY net DESC LIMIT 2`
      }),
      summary: querySlot({
        goal: 'Per-weekday economics 2024+: net per trading day, receipts per day, share of total revenue.',
        widget: { kind: 'bar', title: 'נטו ליום מסחר לפי יום בשבוע (₪)', valueFormat: '₪', name: 'weekday_name', value: 'net_per_day', sortBy: 'weekday_no' },
        sql: `SELECT dayofweek(DateDoc) AS weekday_no, dayname(DateDoc) AS weekday_name,
  round(sum(Scm - ScmMaam)) AS net,
  round(100.0*sum(Scm - ScmMaam)/sum(sum(Scm - ScmMaam)) OVER (), 1) AS pct_of_total,
  round(sum(Scm - ScmMaam)/count(DISTINCT DateDoc::DATE)) AS net_per_day,
  round(count(*) FILTER (WHERE Scm > 0)*1.0/count(DISTINCT DateDoc::DATE)) AS receipts_per_day
FROM ${H}
WHERE DateDoc >= DATE '2024-01-01'
GROUP BY 1, 2 ORDER BY weekday_no LIMIT 7`
      }),
      inDepth: querySlot({
        goal: 'Per-branch weekend profile: weekend/Friday share and Saturday trading mode — which branches actually have a weekend staffing question.',
        widget: { kind: 'table', title: 'פרופיל סופ"ש לפי סניף', columns: [{key: 'branch', label: 'סניף'}, {key: 'weekend_share_pct', label: 'נתח סופ"ש', format: '%'}, {key: 'friday_share_pct', label: 'נתח שישי', format: '%'}, {key: 'saturdays_traded', label: 'שבתות מסחר', format: 'int'}, {key: 'saturday_mode', label: 'מצב שבת'}] },
        sql: `SELECT trim(s.Nm) AS branch,
  round(sum(h.Scm - h.ScmMaam)) AS net_total,
  round(100.0*sum(h.Scm - h.ScmMaam) FILTER (WHERE dayofweek(h.DateDoc) IN (5, 6))/nullif(sum(h.Scm - h.ScmMaam), 0), 1) AS weekend_share_pct,
  round(100.0*sum(h.Scm - h.ScmMaam) FILTER (WHERE dayofweek(h.DateDoc) = 5)/nullif(sum(h.Scm - h.ScmMaam), 0), 1) AS friday_share_pct,
  count(DISTINCT h.DateDoc::DATE) FILTER (WHERE dayofweek(h.DateDoc) = 6 AND h.Scm > 0) AS saturdays_traded,
  CASE WHEN count(DISTINCT h.DateDoc::DATE) FILTER (WHERE dayofweek(h.DateDoc) = 6 AND h.Scm > 0) > 20
    THEN 'trades_saturday' ELSE 'shabbat_closed' END AS saturday_mode
FROM ${H} h JOIN ${STORE} s ON s.C = h.StoreC
WHERE h.DateDoc >= DATE '2024-01-01'
GROUP BY 1 ORDER BY net_total DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Branch × weekday aggregates 2024+ for any custom weekend/weekday analysis.',
        grain: 'one row per (branch, weekday) (~80 rows)',
        columns: 'branch_id: StoreC, branch, weekday_no: 0=Sun..6=Sat, weekday_name, net, receipts, days_traded, net_per_day',
        viewSql: `SELECT h.StoreC AS branch_id, trim(s.Nm) AS branch, dayofweek(h.DateDoc) AS weekday_no, dayname(h.DateDoc) AS weekday_name,
  round(sum(h.Scm - h.ScmMaam), 1) AS net,
  count(*) FILTER (WHERE h.Scm > 0) AS receipts,
  count(DISTINCT h.DateDoc::DATE) AS days_traded,
  round(sum(h.Scm - h.ScmMaam)/nullif(count(DISTINCT h.DateDoc::DATE), 0)) AS net_per_day
FROM ${H} h JOIN ${STORE} s ON s.C = h.StoreC
WHERE h.DateDoc >= DATE '2024-01-01'
GROUP BY 1, 2, 3, 4`
      })
    })
  ]
}) })

VerifiedReport('branch-performance', { impl: verifiedReport({
  title: 'ביצועי סניפים',
  description: 'דירוג והשוואת סניפים: מכירות יומיות, הכנסה, עסקאות וסל ממוצע, צמיחת חנויות זהות, מוצרים מרוויחים/מפסידים השבוע, מרווח גולמי ותמהיל מחלקות סניפי.',
  whenToUse: 'שאלות על סניף מסוים או השוואת סניפים — מכירות יומיות, מי מוביל/חלש, מי צומח, מי שוחק מרווח, מוצרים מרוויחים/מפסידים השבוע, ובמה כל סניף שונה בתמהיל. לניתוח רווחיות פריטים/מחלקות ברמת הרשת השתמש ב-profitability.',
  routePhrases: ['סניפים', 'סניף', 'חנויות', 'ביצועי סניף', 'דירוג סניפים', 'מכירות יומיות', 'יומי סניף', 'מוצרים מרוויחים', 'מוצרים מפסידים', 'חנויות זהות', 'מרווח סניף', 'תמהיל סניף', 'צמיחה סניפים'],
  questionsCovered: ['Q2', 'Q3', 'Q4', 'Q7', 'Q9', 'Q45', 'Q50'],
  caveats: `${dateCaveat} סניפים חדשים (נפתחו במהלך התקופה) מעוותים MoM/YoY — צמיחת חנויות זהות דורשת מכירות בשתי התקופות. אין נתוני שטח (מ"ר), שכירות או כוח-אדם — "יעילות סניף" היא proxy של סל/צמיחה בלבד. מרווח מחושב רק על שורות עם עלות ידועה (~98.7% מהמחזור), עלות = העלות האחרונה הידועה לפריט×סניף (היסטוריית עלויות מ-2025-01).`,
  executiveSummary: querySlot({
    goal: 'Chain KPIs for the latest complete month: branch count, leader and weakest branch with their net, chain net and same-store YoY.',
    widget: { kind: 'kpi', title: 'סניפים — מבט מהיר', items: [{label: 'מחזור רשת (מ׳ ₪)', col: 'chain_net_month_M'}, {label: 'סניפים פעילים', col: 'active_branches', format: 'int'}, {label: 'צמיחת חנויות זהות', col: 'same_store_ytd_yoy_pct', format: '%'}, {label: 'הסניף המוביל (מ׳ ₪)', col: 'top_branch_net_M'}] },
    sql: `WITH b AS (
  SELECT trim(s.Nm) AS branch, sum(h.Scm - h.ScmMaam) AS net
  FROM ${H} h JOIN ${STORE} s ON s.C = h.StoreC
  WHERE h.DateDoc >= ${M_START} AND h.DateDoc < ${M_END}
  GROUP BY 1),
ss AS (
  SELECT h.StoreC,
    sum(h.Scm - h.ScmMaam) FILTER (WHERE h.DateDoc >= make_date(year(${LAST_FULL}), 1, 1) AND h.DateDoc::DATE <= ${LAST_FULL}) AS net_cur,
    sum(h.Scm - h.ScmMaam) FILTER (WHERE h.DateDoc >= make_date(year(${LAST_FULL}) - 1, 1, 1) AND h.DateDoc::DATE <= (${LAST_FULL} - INTERVAL 1 YEAR)::DATE) AS net_prev
  FROM ${H} h WHERE h.DateDoc >= make_date(year(${LAST_FULL}) - 1, 1, 1)
  GROUP BY 1)
SELECT count(*) AS active_branches,
  round(sum(net)/1e6, 2) AS chain_net_month_M,
  arg_max(branch, net) AS top_branch, round(max(net)/1e6, 2) AS top_branch_net_M,
  arg_min(branch, net) AS weakest_branch, round(min(net)/1e3, 1) AS weakest_branch_net_K,
  (SELECT round(100.0*(sum(net_cur) - sum(net_prev))/nullif(sum(net_prev), 0), 1)
   FROM ss WHERE net_cur > 0 AND net_prev > 0) AS same_store_ytd_yoy_pct
FROM b LIMIT 1`
  }),
  summary: querySlot({
    goal: 'All branches, latest complete month: net, receipts, basket, MoM change and share of chain.',
    widget: { kind: 'hbar', title: 'מחזור חודשי לפי סניף (₪)', valueFormat: '₪', name: 'branch', value: 'net_month' },
    sql: `WITH b AS (
  SELECT h.StoreC,
    sum(h.Scm - h.ScmMaam) FILTER (WHERE h.DateDoc >= ${M_START}) AS net_cur,
    count(*) FILTER (WHERE h.DateDoc >= ${M_START} AND h.Scm > 0) AS receipts_cur,
    sum(h.Scm - h.ScmMaam) FILTER (WHERE h.DateDoc >= ${M_START} AND h.Scm > 0) AS net_pos_cur,
    sum(h.Scm - h.ScmMaam) FILTER (WHERE h.DateDoc < ${M_START}) AS net_prev
  FROM ${H} h
  WHERE h.DateDoc >= ${M_START} - INTERVAL 1 MONTH AND h.DateDoc < ${M_END}
  GROUP BY 1)
SELECT trim(s.Nm) AS branch, round(net_cur) AS net_month, receipts_cur AS receipts,
  round(net_pos_cur/nullif(receipts_cur, 0), 1) AS basket,
  round(100.0*(net_cur - net_prev)/nullif(net_prev, 0), 1) AS mom_pct,
  round(100.0*net_cur/sum(net_cur) OVER (), 1) AS share_of_chain_pct
FROM b JOIN ${STORE} s ON s.C = b.StoreC
ORDER BY net_month DESC NULLS LAST LIMIT 25`
  }),
  sections: [
    section({
      id: 'ranking',
      title: 'דירוג סניפים',
      goal: 'Rank branches by net revenue, receipts and average basket; spot who leads, who lags, and where the basket is shrinking.',
      executiveSummary: querySlot({
        goal: 'Top 5 branches by net in the latest complete month.',
        widget: { kind: 'hbar', title: '5 הסניפים המובילים (₪)', valueFormat: '₪', name: 'branch', value: 'net_month', highlight: {max: true, note: 'מוביל החודש'} },
        sql: `SELECT trim(s.Nm) AS branch, round(sum(h.Scm - h.ScmMaam)) AS net_month,
  count(*) FILTER (WHERE h.Scm > 0) AS receipts,
  round(sum(h.Scm - h.ScmMaam) FILTER (WHERE h.Scm > 0)/nullif(count(*) FILTER (WHERE h.Scm > 0), 0), 1) AS basket
FROM ${H} h JOIN ${STORE} s ON s.C = h.StoreC
WHERE h.DateDoc >= ${M_START} AND h.DateDoc < ${M_END}
GROUP BY 1 ORDER BY net_month DESC LIMIT 5`
      }),
      summary: querySlot({
        goal: 'All branches latest complete month: net, receipts, basket, basket MoM change (the "where is the basket shrinking" signal).',
        widget: { kind: 'table', title: 'דירוג סניפים — סל ותנועה', columns: [{key: 'branch', label: 'סניף'}, {key: 'net_month', label: 'נטו', format: '₪'}, {key: 'basket', label: 'סל', format: '₪'}, {key: 'basket_mom_pct', label: 'סל מול חודש קודם', format: '%'}, {key: 'receipts_mom_pct', label: 'קבלות מול חודש קודם', format: '%'}] },
        sql: `WITH b AS (
  SELECT h.StoreC,
    sum(h.Scm - h.ScmMaam) FILTER (WHERE h.DateDoc >= ${M_START}) AS net_cur,
    count(*) FILTER (WHERE h.DateDoc >= ${M_START} AND h.Scm > 0) AS r_cur,
    sum(h.Scm - h.ScmMaam) FILTER (WHERE h.DateDoc >= ${M_START} AND h.Scm > 0) AS np_cur,
    count(*) FILTER (WHERE h.DateDoc < ${M_START} AND h.Scm > 0) AS r_prev,
    sum(h.Scm - h.ScmMaam) FILTER (WHERE h.DateDoc < ${M_START} AND h.Scm > 0) AS np_prev
  FROM ${H} h
  WHERE h.DateDoc >= ${M_START} - INTERVAL 1 MONTH AND h.DateDoc < ${M_END}
  GROUP BY 1)
SELECT trim(s.Nm) AS branch, round(net_cur) AS net_month, r_cur AS receipts,
  round(np_cur/nullif(r_cur, 0), 1) AS basket,
  round(np_prev/nullif(r_prev, 0), 1) AS basket_prev_month,
  round(100.0*(np_cur/nullif(r_cur, 0) - np_prev/nullif(r_prev, 0))/nullif(np_prev/nullif(r_prev, 0), 0), 1) AS basket_mom_pct,
  round(100.0*(r_cur - r_prev)/nullif(r_prev, 0), 1) AS receipts_mom_pct
FROM b JOIN ${STORE} s ON s.C = b.StoreC
ORDER BY net_month DESC NULLS LAST LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Branch × month for the last 4 complete months: net, receipts and MoM change — the short-term momentum table.',
        widget: { kind: 'line', title: 'מומנטום חודשי לפי סניף (₪)', subtitle: '4 חודשים אחרונים', valueFormat: '₪', x: 'ym', y: 'net', seriesBy: 'branch' },
        sql: `WITH bm AS (
  SELECT trim(s.Nm) AS branch, date_trunc('month', h.DateDoc) AS m,
    sum(h.Scm - h.ScmMaam) AS net, count(*) FILTER (WHERE h.Scm > 0) AS receipts
  FROM ${H} h JOIN ${STORE} s ON s.C = h.StoreC
  WHERE h.DateDoc >= ${M_START} - INTERVAL 3 MONTH AND h.DateDoc < ${M_END}
  GROUP BY 1, 2)
SELECT branch, strftime(m, '%Y-%m') AS ym, round(net) AS net, receipts,
  round(100.0*(net - lag(net) OVER (PARTITION BY branch ORDER BY m))
    /nullif(lag(net) OVER (PARTITION BY branch ORDER BY m), 0), 1) AS mom_pct
FROM bm ORDER BY branch, ym LIMIT 50`
      }),
      fullData: fullData({
        description: 'Branch × month since 2024: net, receipts, basket — the base table for any branch ranking or trend.',
        grain: 'one row per (branch, month) since 2024-01 (~350 rows)',
        columns: 'branch_id: StoreC, branch, ym: yyyy-mm, net, receipts: positive receipts, basket: net per positive receipt',
        viewSql: `SELECT h.StoreC AS branch_id, trim(s.Nm) AS branch, strftime(date_trunc('month', h.DateDoc), '%Y-%m') AS ym,
  round(sum(h.Scm - h.ScmMaam), 1) AS net,
  count(*) FILTER (WHERE h.Scm > 0) AS receipts,
  round(sum(h.Scm - h.ScmMaam) FILTER (WHERE h.Scm > 0)/nullif(count(*) FILTER (WHERE h.Scm > 0), 0), 1) AS basket
FROM ${H} h JOIN ${STORE} s ON s.C = h.StoreC
WHERE h.DateDoc >= DATE '2024-01-01'
GROUP BY 1, 2, 3`
      })
    }),
    section({
      id: 'daily-sales',
      title: 'מכירות יומיות לסניף',
      goal: 'Daily branch sales for the last full days: net, receipts, basket and same-weekday comparison for spotting weekday-adjusted spikes or drops.',
      caveats: 'היום האחרון בנתונים קטוע, לכן הניתוח נעצר ביום המלא האחרון. השוואה יומית נעשית מול אותו יום בשבוע הקודם כדי לנטרל עונתיות שבועית.',
      executiveSummary: querySlot({
        goal: 'Top 8 branches by last-7-full-days net, shown as a daily line series.',
        widget: { kind: 'line', title: 'מכירות יומיות — 7 ימים אחרונים', valueFormat: '₪', x: 'd', y: 'net', seriesBy: 'branch' },
        sql: `WITH top AS (SELECT branch_id FROM full_data WHERE d > (SELECT max(d) FROM full_data) - 7 GROUP BY 1 ORDER BY sum(net) DESC LIMIT 8)
SELECT d, branch, net FROM full_data JOIN top USING (branch_id)
WHERE d > (SELECT max(d) FROM full_data) - 7 ORDER BY d, net DESC`
      }),
      summary: querySlot({
        goal: 'Latest full day per branch vs same weekday previous week.',
        widget: { kind: 'table', title: 'יום אחרון מול אותו יום בשבוע שעבר', columns: [{key: 'branch', label: 'סניף'}, {key: 'net_last_day', label: 'נטו יום אחרון', format: '₪'}, {key: 'net_prev_week', label: 'שבוע קודם', format: '₪'}, {key: 'wow_pct', label: 'שינוי', format: '%'}, {key: 'basket', label: 'סל', format: '₪'}] },
        sql: `SELECT branch, net AS net_last_day, net_prev_week, wow_pct, receipts, basket
FROM full_data WHERE d = (SELECT max(d) FROM full_data)
ORDER BY net_last_day DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Top 10 branches daily trend over the last 28 full days, including week-over-week percent by day.',
        widget: { kind: 'line', title: 'מגמת מכירות יומית לפי סניף', subtitle: '28 ימים אחרונים', valueFormat: '₪', x: 'd', y: 'net', seriesBy: 'branch' },
        sql: `WITH top AS (SELECT branch_id FROM full_data WHERE d > (SELECT max(d) FROM full_data) - 28 GROUP BY 1 ORDER BY sum(net) DESC LIMIT 10)
SELECT d, branch, net, wow_pct FROM full_data JOIN top USING (branch_id)
WHERE d > (SELECT max(d) FROM full_data) - 28 ORDER BY branch, d LIMIT 280`
      }),
      fullData: fullData({
        description: 'Branch × day sales since 2024 with previous-week and previous-4-week comparisons.',
        grain: 'one row per (branch, day) since 2024-01',
        columns: 'branch_id, branch, d, weekday_no, weekday_name, net, receipts, basket, net_prev_week, wow_pct, net_prev_4w, vs_4w_pct',
        viewSql: `WITH bd AS (
  SELECT h.StoreC AS branch_id, trim(s.Nm) AS branch, h.DateDoc::DATE AS d,
    sum(h.Scm - h.ScmMaam) AS net, count(*) FILTER (WHERE h.Scm > 0) AS receipts,
    sum(h.Scm - h.ScmMaam) FILTER (WHERE h.Scm > 0) AS net_pos
  FROM ${H} h JOIN ${STORE} s ON s.C = h.StoreC
  WHERE h.DateDoc >= DATE '2024-01-01' AND h.DateDoc::DATE <= ${LAST_FULL}
  GROUP BY 1, 2, 3)
SELECT cur.branch_id, cur.branch, cur.d, dayofweek(cur.d) AS weekday_no, dayname(cur.d) AS weekday_name,
  round(cur.net, 1) AS net, cur.receipts, round(cur.net_pos/nullif(cur.receipts, 0), 1) AS basket,
  round(pw.net, 1) AS net_prev_week, round(100.0*(cur.net - pw.net)/nullif(pw.net, 0), 1) AS wow_pct,
  round(p4.net, 1) AS net_prev_4w, round(100.0*(cur.net - p4.net)/nullif(p4.net, 0), 1) AS vs_4w_pct
FROM bd cur
LEFT JOIN bd pw ON pw.branch_id = cur.branch_id AND pw.d = cur.d - 7
LEFT JOIN bd p4 ON p4.branch_id = cur.branch_id AND p4.d = cur.d - 28`
      })
    }),
    section({
      id: 'weekly-product-profit',
      title: 'מוצרים מרוויחים ומפסידים השבוע',
      goal: 'Per product × branch profitability over the last 7 full days: top gross-profit contributors and below-cost losers, with previous-week comparison.',
      caveats: '״השבוע״ = 7 הימים המלאים האחרונים ביחס ליום המלא האחרון בנתונים. רווחיות מחושבת רק כשיש עלות אחרונה חיובית לפריט×סניף; כמות היא ביחידת הפריט ולכן אין לסכום בין פריטים שונים.',
      executiveSummary: querySlot({
        goal: 'Top 5 winning and losing product×branch rows this week.',
        widget: { kind: 'table', title: 'מוצרים מרוויחים ומפסידים השבוע', columns: [{key: 'verdict', label: 'סוג'}, {key: 'item', label: 'מוצר'}, {key: 'branch', label: 'סניף'}, {key: 'margin_ils', label: 'רווח', format: '₪'}, {key: 'margin_pct', label: 'מרווח', format: '%'}, {key: 'net', label: 'נטו', format: '₪'}] },
        sql: `WITH r AS (
  SELECT *, row_number() OVER (ORDER BY margin_ils DESC) AS win_rn, row_number() OVER (ORDER BY margin_ils) AS lose_rn
  FROM full_data WHERE net_costed > 500)
SELECT 'מרוויח' AS verdict, item, branch, margin_ils, margin_pct, net FROM r WHERE win_rn <= 5
UNION ALL
SELECT 'מפסיד', item, branch, margin_ils, margin_pct, net FROM r WHERE margin_ils < 0 AND lose_rn <= 5
ORDER BY verdict DESC, margin_ils DESC`
      }),
      summary: querySlot({
        goal: 'Branch-level weekly product profitability: total gross profit, losing item count and ILS loss.',
        widget: { kind: 'table', title: 'רווחיות מוצרים השבוע לפי סניף', columns: [{key: 'branch', label: 'סניף'}, {key: 'margin_ils', label: 'רווח גולמי', format: '₪'}, {key: 'losing_items', label: 'מוצרים מפסידים', format: 'int'}, {key: 'loss_ils', label: 'הפסד', format: '₪'}, {key: 'margin_pct', label: 'מרווח', format: '%'}] },
        sql: `SELECT branch, round(sum(margin_ils)) AS margin_ils,
  count(*) FILTER (WHERE margin_ils < 0) AS losing_items,
  round(sum(margin_ils) FILTER (WHERE margin_ils < 0)) AS loss_ils,
  round(100.0*sum(margin_ils)/nullif(sum(net_costed), 0), 1) AS margin_pct
FROM full_data WHERE net_costed > 500
GROUP BY 1 ORDER BY margin_ils DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Top 40 weekly product profit/loss movers by absolute margin impact, with week-over-week net change.',
        widget: { kind: 'table', title: 'מוצרי השבוע — השפעת רווח/הפסד', columns: [{key: 'item', label: 'מוצר'}, {key: 'branch', label: 'סניף'}, {key: 'dept', label: 'מחלקה'}, {key: 'margin_ils', label: 'רווח', format: '₪'}, {key: 'margin_pct', label: 'מרווח', format: '%'}, {key: 'net_wow_pct', label: 'נטו מול שבוע קודם', format: '%'}] },
        sql: `SELECT item, branch, dept, net, net_prev_week, net_wow_pct, margin_ils, margin_pct, promo_share_pct
FROM full_data WHERE net_costed > 500
ORDER BY abs(margin_ils) DESC LIMIT 40`
      }),
      fullData: fullData({
        description: 'Last-7-full-days product × branch profitability with previous-week net and margin comparison.',
        grain: 'one row per (product, branch) sold in the last 7 full days',
        columns: 'prt, item, dept, branch_id, branch, net, net_prev_week, net_wow_pct, qty_own_unit, net_costed, margin_ils, margin_pct, margin_prev_week, margin_wow_ils, promo_net, promo_share_pct, receipts',
        perItemOnly: 'qty_own_unit',
        viewSql: `WITH ${COST_CTE},
cur AS (
  SELECT l.PrtC AS prt, h.StoreC AS branch_id, sum(${NET}) AS net, sum(l.Cmt) AS qty,
    count(DISTINCT h.C) FILTER (WHERE h.Scm > 0) AS receipts,
    sum(${NET}) FILTER (WHERE c.unit_cost IS NOT NULL) AS net_costed,
    sum(${NET} - c.unit_cost*l.Cmt) FILTER (WHERE c.unit_cost IS NOT NULL) AS margin_ils,
    sum(${NET}) FILTER (WHERE l.MivzaNo > 0) AS promo_net
  FROM ${L} l JOIN ${H} h ON l.KupaDocC = h.C AND h.DateDoc::DATE > ${LAST_FULL} - 7 AND h.DateDoc::DATE <= ${LAST_FULL}
  LEFT JOIN cost c ON c.ItemID = l.PrtC AND c.StoreID = h.StoreC
  GROUP BY 1, 2),
prev AS (
  SELECT l.PrtC AS prt, h.StoreC AS branch_id, sum(${NET}) AS net_prev_week,
    sum(${NET} - c.unit_cost*l.Cmt) FILTER (WHERE c.unit_cost IS NOT NULL) AS margin_prev_week
  FROM ${L} l JOIN ${H} h ON l.KupaDocC = h.C AND h.DateDoc::DATE > ${LAST_FULL} - 14 AND h.DateDoc::DATE <= ${LAST_FULL} - 7
  LEFT JOIN cost c ON c.ItemID = l.PrtC AND c.StoreID = h.StoreC
  GROUP BY 1, 2)
SELECT cur.prt, trim(p.Nm) AS item, trim(dp.Nm) AS dept, cur.branch_id, trim(s.Nm) AS branch,
  round(cur.net, 1) AS net, round(prev.net_prev_week, 1) AS net_prev_week,
  round(100.0*(cur.net - prev.net_prev_week)/nullif(prev.net_prev_week, 0), 1) AS net_wow_pct,
  round(cur.qty, 1) AS qty_own_unit, round(cur.net_costed, 1) AS net_costed,
  round(cur.margin_ils, 1) AS margin_ils, round(100.0*cur.margin_ils/nullif(cur.net_costed, 0), 1) AS margin_pct,
  round(prev.margin_prev_week, 1) AS margin_prev_week, round(cur.margin_ils - prev.margin_prev_week, 1) AS margin_wow_ils,
  round(cur.promo_net, 1) AS promo_net, round(100.0*cur.promo_net/nullif(cur.net, 0), 1) AS promo_share_pct, cur.receipts
FROM cur
JOIN ${PRT} p ON p.C = cur.prt
JOIN ${DEPT} dp ON dp.C = p.DepartmentC
JOIN ${STORE} s ON s.C = cur.branch_id
LEFT JOIN prev USING (prt, branch_id)`
      })
    }),
    section({
      id: 'growth',
      title: 'צמיחת חנויות זהות',
      goal: 'Same-store growth: YTD this year vs the identical span last year, only for branches that traded in both — the honest growth read.',
      caveats: 'סניף נחשב "זהה" רק אם מכר בשתי התקופות — סניפים חדשים מוחרגים אוטומטית ולכן לא מנפחים צמיחה.',
      executiveSummary: querySlot({
        goal: 'Same-store YTD YoY per branch, fastest growers first.',
        widget: { kind: 'hbar', title: 'צמיחת חנויות זהות YTD', valueFormat: '%', name: 'branch', value: 'yoy_pct', highlight: {max: true, note: 'הצומח המהיר'} },
        sql: `WITH per AS (
  SELECT h.StoreC,
    sum(h.Scm - h.ScmMaam) FILTER (WHERE h.DateDoc >= make_date(year(${LAST_FULL}), 1, 1) AND h.DateDoc::DATE <= ${LAST_FULL}) AS net_cur,
    sum(h.Scm - h.ScmMaam) FILTER (WHERE h.DateDoc >= make_date(year(${LAST_FULL}) - 1, 1, 1) AND h.DateDoc::DATE <= (${LAST_FULL} - INTERVAL 1 YEAR)::DATE) AS net_prev
  FROM ${H} h WHERE h.DateDoc >= make_date(year(${LAST_FULL}) - 1, 1, 1)
  GROUP BY 1)
SELECT trim(s.Nm) AS branch, round(net_prev) AS net_ytd_prev_year, round(net_cur) AS net_ytd,
  round(100.0*(net_cur - net_prev)/net_prev, 1) AS yoy_pct
FROM per JOIN ${STORE} s ON s.C = per.StoreC
WHERE net_prev > 0 AND net_cur > 0
ORDER BY yoy_pct DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Same-store YTD YoY: all comparable branches plus a chain total row, with receipts growth alongside revenue growth.',
        widget: { kind: 'table', title: 'חנויות זהות — צמיחה שנתית', columns: [{key: 'branch', label: 'סניף'}, {key: 'net_ytd', label: 'נטו YTD', format: '₪'}, {key: 'net_ytd_prev_year', label: 'YTD אשתקד', format: '₪'}, {key: 'yoy_pct', label: 'צמיחה', format: '%'}, {key: 'receipts_yoy_pct', label: 'צמיחת קבלות', format: '%'}] },
        sql: `WITH per AS (
  SELECT h.StoreC,
    sum(h.Scm - h.ScmMaam) FILTER (WHERE h.DateDoc >= make_date(year(${LAST_FULL}), 1, 1) AND h.DateDoc::DATE <= ${LAST_FULL}) AS net_cur,
    sum(h.Scm - h.ScmMaam) FILTER (WHERE h.DateDoc >= make_date(year(${LAST_FULL}) - 1, 1, 1) AND h.DateDoc::DATE <= (${LAST_FULL} - INTERVAL 1 YEAR)::DATE) AS net_prev,
    count(*) FILTER (WHERE h.Scm > 0 AND h.DateDoc >= make_date(year(${LAST_FULL}), 1, 1) AND h.DateDoc::DATE <= ${LAST_FULL}) AS tx_cur,
    count(*) FILTER (WHERE h.Scm > 0 AND h.DateDoc >= make_date(year(${LAST_FULL}) - 1, 1, 1) AND h.DateDoc::DATE <= (${LAST_FULL} - INTERVAL 1 YEAR)::DATE) AS tx_prev
  FROM ${H} h WHERE h.DateDoc >= make_date(year(${LAST_FULL}) - 1, 1, 1)
  GROUP BY 1),
ss AS (SELECT * FROM per WHERE net_prev > 0 AND net_cur > 0)
SELECT trim(s.Nm) AS branch, round(net_prev) AS net_ytd_prev_year, round(net_cur) AS net_ytd,
  round(100.0*(net_cur - net_prev)/net_prev, 1) AS yoy_pct,
  round(100.0*(tx_cur - tx_prev)/nullif(tx_prev, 0), 1) AS receipts_yoy_pct
FROM ss JOIN ${STORE} s ON s.C = ss.StoreC
UNION ALL
SELECT 'סה"כ חנויות זהות', round(sum(net_prev)), round(sum(net_cur)),
  round(100.0*(sum(net_cur) - sum(net_prev))/sum(net_prev), 1),
  round(100.0*(sum(tx_cur) - sum(tx_prev))/nullif(sum(tx_prev), 0), 1)
FROM ss
ORDER BY net_ytd DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Branch × quarter, last 4 complete quarters vs the same quarter a year earlier — where growth accelerates or stalls.',
        widget: { kind: 'heatmap', title: 'צמיחה שנתית לפי סניף ורבעון', valueFormat: '%', x: 'quarter_label', y: 'branch', value: 'yoy_pct' },
        sql: `WITH q AS (
  SELECT h.StoreC, date_trunc('quarter', h.DateDoc) AS qs, sum(h.Scm - h.ScmMaam) AS net
  FROM ${H} h GROUP BY 1, 2),
lastq AS (SELECT max(qs) AS q FROM q WHERE qs + INTERVAL 3 MONTH <= ${M_END})
SELECT trim(s.Nm) AS branch, year(cur.qs) || '-Q' || quarter(cur.qs) AS quarter_label,
  round(cur.net) AS net, round(py.net) AS net_same_q_prev_year,
  round(100.0*(cur.net - py.net)/nullif(py.net, 0), 1) AS yoy_pct
FROM q cur
LEFT JOIN q py ON py.StoreC = cur.StoreC AND py.qs = cur.qs - INTERVAL 12 MONTH
JOIN ${STORE} s ON s.C = cur.StoreC
WHERE cur.qs > (SELECT q FROM lastq) - INTERVAL 12 MONTH AND cur.qs <= (SELECT q FROM lastq)
ORDER BY branch, cur.qs LIMIT 50`
      }),
      fullData: fullData({
        description: 'Branch × month with prior-year comparison, full header history — the base for any growth/momentum analysis.',
        grain: 'one row per (branch, month) over the full header span (~600 rows)',
        columns: 'branch_id: StoreC, branch, ym: yyyy-mm, net, receipts, net_prior_year: same branch same month one year back, yoy_pct',
        viewSql: `WITH bm AS (
  SELECT h.StoreC, date_trunc('month', h.DateDoc) AS m,
    sum(h.Scm - h.ScmMaam) AS net, count(*) FILTER (WHERE h.Scm > 0) AS receipts
  FROM ${H} h GROUP BY 1, 2)
SELECT cur.StoreC AS branch_id, trim(s.Nm) AS branch, strftime(cur.m, '%Y-%m') AS ym, round(cur.net, 1) AS net, cur.receipts AS receipts,
  round(py.net, 1) AS net_prior_year,
  round(100.0*(cur.net - py.net)/nullif(py.net, 0), 1) AS yoy_pct
FROM bm cur
LEFT JOIN bm py ON py.StoreC = cur.StoreC AND py.m = cur.m - INTERVAL 12 MONTH
JOIN ${STORE} s ON s.C = cur.StoreC`
      })
    }),
    section({
      id: 'branch-margin',
      title: 'מרווח גולמי לסניף',
      goal: 'Gross margin per branch and who erodes it: drag = margin ILS a branch loses vs the chain-average margin applied to its own costed revenue.',
      caveats: 'מרווח על שורות עם עלות ידועה בלבד (חשיפת costed_share_pct); עלות = ארג-מקס אחרון לפריט×סניף מ-DailyPriceCost (היסטוריה מ-2025-01, מיושמת גם על מכירות 2024). מרווח גולמי לפני הוצאות תפעול.',
      executiveSummary: querySlot({
        goal: 'Worst margin-drag branches first: net, gross profit, margin % vs chain average.',
        widget: { kind: 'hbar', title: 'גרר מרווח מול ממוצע הרשת (₪)', valueFormat: '₪', name: 'branch', value: 'drag_vs_chain_ils', highlight: {min: true, note: 'השוחק הגדול'} },
        sql: `WITH st AS (SELECT branch, sum(net) AS net_all, sum(net_costed) AS net_costed, sum(margin_ils) AS margin_ils FROM full_data GROUP BY 1),
chain AS (SELECT sum(margin_ils)/sum(net_costed) AS m FROM st)
SELECT branch, round(net_all) AS net, round(margin_ils) AS margin_ils,
  round(100.0*margin_ils/net_costed, 1) AS margin_pct,
  round(100.0*(SELECT m FROM chain), 1) AS chain_margin_pct,
  round(margin_ils - (SELECT m FROM chain)*net_costed) AS drag_vs_chain_ils
FROM st
WHERE net_all > 1000000
ORDER BY drag_vs_chain_ils ASC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'All material branches (net > 1M): net, gross profit, margin %, drag vs chain, and the costed revenue share.',
        widget: { kind: 'scatter', title: 'מחזור מול מרווח לפי סניף', x: 'net', y: 'margin_pct', name: 'branch', xLabel: 'מחזור (₪)', yLabel: 'מרווח (%)', xFormat: '₪', yFormat: '%' },
        sql: `WITH st AS (SELECT branch, sum(net) AS net_all, sum(net_costed) AS net_costed, sum(margin_ils) AS margin_ils FROM full_data GROUP BY 1),
chain AS (SELECT sum(margin_ils)/sum(net_costed) AS m FROM st)
SELECT branch, round(net_all) AS net, round(margin_ils) AS margin_ils,
  round(100.0*margin_ils/net_costed, 1) AS margin_pct,
  round(margin_ils - (SELECT m FROM chain)*net_costed) AS drag_vs_chain_ils,
  round(100.0*net_costed/net_all, 1) AS costed_share_pct
FROM st
WHERE net_all > 1000000
ORDER BY net DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Branch × department margin drags: where inside a branch the margin is lost vs the chain-wide margin of the same department.',
        widget: { kind: 'table', title: 'גרר מרווח — סניף × מחלקה', columns: [{key: 'branch', label: 'סניף'}, {key: 'dept', label: 'מחלקה'}, {key: 'drag_ils', label: 'גרר', format: '₪'}, {key: 'margin_pct', label: 'מרווח', format: '%'}, {key: 'chain_dept_margin_pct', label: 'מרווח רשת במחלקה', format: '%'}, {key: 'net', label: 'נטו', format: '₪'}] },
        sql: `WITH bd AS (SELECT branch, dept, sum(net) AS net, sum(net_costed) AS net_costed, sum(margin_ils) AS margin_ils FROM full_data GROUP BY 1, 2),
dm AS (SELECT dept, sum(margin_ils)/nullif(sum(net_costed), 0) AS chain_dept_margin FROM bd GROUP BY 1)
SELECT bd.branch, bd.dept, round(bd.net) AS net,
  round(100.0*bd.margin_ils/nullif(bd.net_costed, 0), 1) AS margin_pct,
  round(100.0*dm.chain_dept_margin, 1) AS chain_dept_margin_pct,
  round(bd.margin_ils - dm.chain_dept_margin*bd.net_costed) AS drag_ils
FROM bd JOIN dm USING (dept)
WHERE bd.net_costed > 200000
ORDER BY drag_ils ASC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Branch × department × month margin components — build any margin trend or drill-down without rescanning raw lines.',
        grain: 'one row per (branch, department, month) since 2024 (~8000 rows)',
        columns: 'branch_id: StoreC, branch, dept, ym: yyyy-mm, net: all-lines net, net_costed: net where cost known, margin_ils: net_costed minus cogs, margin_pct',
        viewSql: `WITH cost AS (SELECT ItemID, StoreID, arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE FinalRegularCostPrice > 0) AS unit_cost FROM read_parquet('{{ROOT}}/DailyPriceCost.parquet') GROUP BY 1, 2)
SELECT h.StoreC AS branch_id, trim(s.Nm) AS branch, trim(dp.Nm) AS dept, strftime(date_trunc('month', h.DateDoc), '%Y-%m') AS ym,
  round(sum(l.Scm - l.VatAmount), 1) AS net,
  round(sum(l.Scm - l.VatAmount) FILTER (WHERE c.unit_cost IS NOT NULL), 1) AS net_costed,
  round(sum((l.Scm - l.VatAmount) - c.unit_cost*l.Cmt) FILTER (WHERE c.unit_cost IS NOT NULL), 1) AS margin_ils,
  round(100.0*sum((l.Scm - l.VatAmount) - c.unit_cost*l.Cmt) FILTER (WHERE c.unit_cost IS NOT NULL)
    /nullif(sum(l.Scm - l.VatAmount) FILTER (WHERE c.unit_cost IS NOT NULL), 0), 1) AS margin_pct
FROM read_parquet('{{ROOT}}/KupaDoc_Lines.parquet') l
JOIN read_parquet('{{ROOT}}/KupaDoc_Header.parquet') h ON l.KupaDocC = h.C AND h.DateDoc >= DATE '2024-01-01'
LEFT JOIN cost c ON c.ItemID = l.PrtC AND c.StoreID = h.StoreC
JOIN read_parquet('{{ROOT}}/Prt.parquet') p ON p.C = l.PrtC
JOIN read_parquet('{{ROOT}}/Departments.parquet') dp ON dp.C = p.DepartmentC
JOIN read_parquet('{{ROOT}}/Store.parquet') s ON s.C = h.StoreC
GROUP BY 1, 2, 3, 4`
      })
    }),
    section({
      id: 'branch-mix',
      title: 'תמהיל מחלקות לסניף',
      goal: 'How each branch\'s department mix differs from the chain — demographic/assortment fingerprints per branch.',
      executiveSummary: querySlot({
        goal: 'Chain-wide top departments by revenue share, last 12 complete months.',
        widget: { kind: 'pie', title: 'תמהיל מחלקות רשת (מ׳ ₪)', subtitle: '12 חודשים אחרונים', donut: true, name: 'dept', value: 'net_M' },
        sql: `SELECT dept, round(sum(net)/1e6, 2) AS net_M,
  round(100.0*sum(net)/sum(sum(net)) OVER (), 1) AS share_pct
FROM full_data
GROUP BY 1 ORDER BY net_M DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Per branch: its #1 and #2 departments with their in-branch revenue shares, last 12 complete months.',
        widget: { kind: 'table', title: 'המחלקות המובילות בכל סניף', columns: [{key: 'branch', label: 'סניף'}, {key: 'top_dept', label: 'מחלקה מובילה'}, {key: 'top_dept_share_pct', label: 'נתח', format: '%'}, {key: 'second_dept', label: 'מחלקה שנייה'}, {key: 'second_dept_share_pct', label: 'נתח', format: '%'}] },
        sql: `WITH r AS (SELECT branch, dept, net, branch_share_pct AS share, row_number() OVER (PARTITION BY branch ORDER BY net DESC) AS rn FROM full_data)
SELECT branch,
  max(CASE WHEN rn = 1 THEN dept END) AS top_dept, round(max(CASE WHEN rn = 1 THEN share END), 1) AS top_dept_share_pct,
  max(CASE WHEN rn = 2 THEN dept END) AS second_dept, round(max(CASE WHEN rn = 2 THEN share END), 1) AS second_dept_share_pct,
  round(sum(net)) AS net_12m
FROM r
GROUP BY 1 ORDER BY net_12m DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Largest branch-vs-chain department share deviations (ppt) — what each branch over/under-indexes on.',
        widget: { kind: 'table', title: 'סטיות תמהיל מול הרשת', columns: [{key: 'branch', label: 'סניף'}, {key: 'dept', label: 'מחלקה'}, {key: 'delta_ppt', label: 'סטייה (נק׳)'}, {key: 'branch_share_pct', label: 'נתח בסניף', format: '%'}, {key: 'chain_share_pct', label: 'נתח ברשת', format: '%'}] },
        sql: `WITH bd AS (
  SELECT h.StoreC AS store_c, p.DepartmentC AS dept_c, sum(${NET}) AS net
  FROM ${SALES} JOIN ${PRT} p ON p.C = l.PrtC
  WHERE h.DateDoc >= ${M_END} - INTERVAL 12 MONTH AND h.DateDoc < ${M_END}
  GROUP BY 1, 2),
sh AS (
  SELECT store_c, dept_c, net,
    100.0*net/sum(net) OVER (PARTITION BY store_c) AS branch_share,
    100.0*sum(net) OVER (PARTITION BY dept_c)/sum(net) OVER () AS chain_share
  FROM bd)
SELECT trim(s.Nm) AS branch, trim(dp.Nm) AS dept, round(net) AS net,
  round(branch_share, 1) AS branch_share_pct, round(chain_share, 1) AS chain_share_pct,
  round(branch_share - chain_share, 1) AS delta_ppt
FROM sh JOIN ${STORE} s ON s.C = sh.store_c JOIN ${DEPT} dp ON dp.C = sh.dept_c
WHERE net > 500000
ORDER BY abs(branch_share - chain_share) DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Branch × department shares over the last 12 complete months, with the chain share for deviation math.',
        grain: 'one row per (branch, department) (~330 rows)',
        columns: 'branch_id: StoreC, branch, dept, net, branch_share_pct: dept share within the branch, chain_share_pct: dept share chain-wide, delta_ppt',
        viewSql: `WITH bd AS (
  SELECT h.StoreC AS store_c, p.DepartmentC AS dept_c, sum(${NET}) AS net
  FROM ${SALES} JOIN ${PRT} p ON p.C = l.PrtC
  WHERE h.DateDoc >= ${M_END} - INTERVAL 12 MONTH AND h.DateDoc < ${M_END}
  GROUP BY 1, 2),
sh AS (
  SELECT store_c, dept_c, net,
    100.0*net/sum(net) OVER (PARTITION BY store_c) AS branch_share,
    100.0*sum(net) OVER (PARTITION BY dept_c)/sum(net) OVER () AS chain_share
  FROM bd)
SELECT sh.store_c AS branch_id, trim(s.Nm) AS branch, trim(dp.Nm) AS dept, round(net, 1) AS net,
  round(branch_share, 2) AS branch_share_pct, round(chain_share, 2) AS chain_share_pct,
  round(branch_share - chain_share, 2) AS delta_ppt
FROM sh JOIN ${STORE} s ON s.C = sh.store_c JOIN ${DEPT} dp ON dp.C = sh.dept_c`
      })
    })
  ]
}) })

VerifiedReport('profitability', { impl: verifiedReport({
  title: 'רווחיות ומרווח',
  description: 'רווח גולמי של הרשת: מרווח לפי מחלקה, הפריטים הרווחיים ביותר בשקלים, פריטים שנמכרים מתחת לעלות, הכנסה ללא נתוני עלות, ודליפת מרווח מול מחיר מחירון.',
  whenToUse: 'שאלות רווח/מרווח/עלות ברמת מחלקה או פריט — מי מרוויח, מי מפסיד, איפה דולף כסף מול המחירון. למרווח ברמת סניף השתמש ב-branch-performance, למבצעים ב-promotions; למגמת מחיר/כמות/מרווח של פריט לאורך זמן — item-trends.',
  routePhrases: ['רווחיות', 'רווח גולמי', 'מרווח', 'עלות', 'מי מרוויח', 'מי מפסיד', 'פריטים רווחיים', 'מתחת לעלות', 'דולף כסף'],
  questionsCovered: ['Q10', 'Q11', 'Q12', 'Q14', 'Q15', 'Q39'],
  caveats: `עלות מכר: שורות המכירה לא נושאות עלות (ScmAlut=0); עלות פריט = FinalRegularCostPrice האחרון החיובי לפריט×סניף מ-DailyPriceCost (היסטוריה מ-2025-01 בלבד, מיושמת גם על 2024). שורות ללא עלות (~1.3% מהנטו) מוחרגות מחישובי מרווח — לעולם לא מונחות כעלות אפס. אין נתוני קניין (UserKanyan ריק) — ה-proxy הקרוב ביותר לביצועי קניין הוא מרווח לפי מחלקה. המרווח גולמי, לפני הוצאות תפעול.`,
  executiveSummary: querySlot({
    goal: 'Chain profitability headline: net, gross profit, margin %, costed coverage, and the revenue with unknowable margin.',
    widget: { kind: 'kpi', title: 'רווחיות הרשת — מבט מהיר', items: [{label: 'מחזור (מ׳ ₪)', col: 'net_2024plus_M'}, {label: 'רווח גולמי (מ׳ ₪)', col: 'gross_profit_M'}, {label: 'מרווח', col: 'margin_pct', format: '%'}, {label: 'כיסוי עלות', col: 'costed_share_pct', format: '%'}, {label: 'ללא נתוני עלות (מ׳ ₪)', col: 'net_unknown_cost_M'}] },
    sql: `WITH ${COST_CTE},
base AS (
  SELECT l.PrtC AS prt, h.StoreC AS branch_id, sum(${NET}) AS net, sum(l.Cmt) AS qty
  FROM ${SALES}
  WHERE l.KupaDocC >= (SELECT min(C) FROM ${H} WHERE DateDoc >= DATE '2024-01-01')
  GROUP BY 1, 2),
agg AS (
  SELECT sum(net) AS net,
    sum(net) FILTER (WHERE c.unit_cost IS NOT NULL) AS net_costed,
    sum(b.net - c.unit_cost*b.qty) FILTER (WHERE c.unit_cost IS NOT NULL) AS margin_ils,
    sum(net) FILTER (WHERE c.unit_cost IS NULL) AS net_uncosted
  FROM base b LEFT JOIN cost c ON c.ItemID = b.prt AND c.StoreID = b.branch_id)
SELECT round(net/1e6, 1) AS net_2024plus_M,
  round(margin_ils/1e6, 1) AS gross_profit_M,
  round(100.0*margin_ils/net_costed, 1) AS margin_pct,
  round(100.0*net_costed/net, 1) AS costed_share_pct,
  round(net_uncosted/1e6, 2) AS net_unknown_cost_M
FROM agg LIMIT 1`
  }),
  summary: querySlot({
    goal: 'Departments ranked by absolute gross profit ILS with their share of total chain margin.',
    widget: { kind: 'treemap', title: 'רווח גולמי לפי מחלקה (₪)', valueFormat: '₪', name: 'dept', value: 'margin_ils' },
    sql: `WITH ${COST_CTE},
base AS (
  SELECT l.PrtC AS prt, h.StoreC AS branch_id, sum(${NET}) AS net, sum(l.Cmt) AS qty
  FROM ${SALES}
  WHERE l.KupaDocC >= (SELECT min(C) FROM ${H} WHERE DateDoc >= DATE '2024-01-01')
  GROUP BY 1, 2),
dept AS (
  SELECT p.DepartmentC AS dept_c, sum(b.net) AS net,
    sum(b.net) FILTER (WHERE c.unit_cost IS NOT NULL) AS net_costed,
    sum(b.net - c.unit_cost*b.qty) FILTER (WHERE c.unit_cost IS NOT NULL) AS margin_ils
  FROM base b JOIN ${PRT} p ON p.C = b.prt
  LEFT JOIN cost c ON c.ItemID = b.prt AND c.StoreID = b.branch_id
  GROUP BY 1)
SELECT trim(dp.Nm) AS dept, round(net) AS net, round(margin_ils) AS margin_ils,
  round(100.0*margin_ils/nullif(net_costed, 0), 1) AS margin_pct,
  round(100.0*margin_ils/sum(margin_ils) OVER (), 1) AS share_of_total_margin_pct,
  round(100.0*net_costed/nullif(net, 0), 1) AS costed_share_pct
FROM dept JOIN ${DEPT} dp ON dp.C = dept.dept_c
ORDER BY margin_ils DESC LIMIT 25`
  }),
  sections: [
    section({
      id: 'department-margin',
      title: 'מרווח לפי מחלקה',
      goal: 'Which departments earn the most gross profit vs those that only bring traffic — margin ILS, margin % and receipt reach per department.',
      executiveSummary: querySlot({
        goal: 'Top 8 departments by gross profit ILS.',
        widget: { kind: 'hbar', title: 'רווח גולמי לפי מחלקה (מ׳ ₪)', name: 'dept', value: 'margin_M' },
        sql: `WITH d AS (SELECT dept, sum(net) AS net, sum(net_costed) AS net_costed, sum(margin_ils) AS margin_ils FROM full_data GROUP BY dept)
SELECT dept, round(net/1e6, 1) AS net_M, round(margin_ils/1e6, 2) AS margin_M,
  round(100.0*margin_ils/nullif(net_costed, 0), 1) AS margin_pct,
  round(100.0*margin_ils/sum(margin_ils) OVER (), 1) AS share_of_total_margin_pct
FROM d ORDER BY margin_ils DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'All departments by revenue: net, margin, and how many receipts touch the department (traffic vs profit lens).',
        widget: { kind: 'scatter', title: 'תנועה מול רווח לפי מחלקה', x: 'receipts_touched', y: 'margin_ils', name: 'dept', xLabel: 'קבלות', yLabel: 'רווח גולמי (₪)', xFormat: 'compact', yFormat: '₪' },
        sql: `WITH d AS (SELECT dept, sum(net) AS net, sum(net_costed) AS net_costed, sum(margin_ils) AS margin_ils, sum(receipts_touched) AS receipts_touched FROM full_data GROUP BY dept)
SELECT dept, round(net) AS net, round(margin_ils) AS margin_ils,
  round(100.0*margin_ils/nullif(net_costed, 0), 1) AS margin_pct,
  receipts_touched,
  round(margin_ils/nullif(receipts_touched, 0), 2) AS margin_per_receipt
FROM d ORDER BY net DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Department margin trend by year (current year vs the two prior) — where margin quality is improving or eroding.',
        widget: { kind: 'table', title: 'מגמת מרווח מחלקתי לפי שנה', columns: [{key: 'dept', label: 'מחלקה'}, {key: 'margin_pct_2y_ago', label: 'לפני שנתיים', format: '%'}, {key: 'margin_pct_prev_year', label: 'אשתקד', format: '%'}, {key: 'margin_pct_cur_year', label: 'השנה', format: '%'}, {key: 'margin_ppt_chg_yoy', label: 'שינוי (נק׳)'}] },
        sql: `WITH yrs AS (SELECT year(${LAST_FULL}) AS y),
dy AS (SELECT dept, substr(ym, 1, 4)::INT AS yr, net, net_costed, margin_ils FROM full_data)
SELECT dept,
  round(sum(net)/1e6, 2) AS net_total_M,
  round(100.0*sum(margin_ils) FILTER (WHERE yr = (SELECT y FROM yrs) - 2)/nullif(sum(net_costed) FILTER (WHERE yr = (SELECT y FROM yrs) - 2), 0), 1) AS margin_pct_2y_ago,
  round(100.0*sum(margin_ils) FILTER (WHERE yr = (SELECT y FROM yrs) - 1)/nullif(sum(net_costed) FILTER (WHERE yr = (SELECT y FROM yrs) - 1), 0), 1) AS margin_pct_prev_year,
  round(100.0*sum(margin_ils) FILTER (WHERE yr = (SELECT y FROM yrs))/nullif(sum(net_costed) FILTER (WHERE yr = (SELECT y FROM yrs)), 0), 1) AS margin_pct_cur_year,
  round(100.0*sum(margin_ils) FILTER (WHERE yr = (SELECT y FROM yrs))/nullif(sum(net_costed) FILTER (WHERE yr = (SELECT y FROM yrs)), 0)
    - 100.0*sum(margin_ils) FILTER (WHERE yr = (SELECT y FROM yrs) - 1)/nullif(sum(net_costed) FILTER (WHERE yr = (SELECT y FROM yrs) - 1), 0), 1) AS margin_ppt_chg_yoy
FROM dy GROUP BY dept HAVING sum(net) > 1000000 ORDER BY net_total_M DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Branch × department × month margin components since 2024 — the base for any branch-filtered department profitability trend.',
        grain: 'one row per (branch, department, month) (~8K rows)',
        columns: 'branch_id: StoreC, branch, dept, ym: yyyy-mm, net, net_costed: net where cost known, margin_ils, margin_pct',
        viewSql: `WITH ${COST_CTE},
g AS (
  SELECT h.StoreC AS branch_id, p.DepartmentC AS dept_c, date_trunc('month', h.DateDoc) AS mth,
    sum(${NET}) AS net,
    sum(${NET}) FILTER (WHERE c.unit_cost IS NOT NULL) AS net_costed,
    sum(${NET} - c.unit_cost*l.Cmt) FILTER (WHERE c.unit_cost IS NOT NULL) AS margin_ils,
    count(DISTINCT h.C) AS receipts_touched
  FROM ${SALES}
  JOIN ${PRT} p ON p.C = l.PrtC
  LEFT JOIN cost c ON c.ItemID = l.PrtC AND c.StoreID = h.StoreC
  WHERE l.KupaDocC >= (SELECT min(C) FROM ${H} WHERE DateDoc >= DATE '2024-01-01')
  GROUP BY 1, 2, 3)
SELECT g.branch_id, trim(s.Nm) AS branch, trim(dp.Nm) AS dept, strftime(g.mth, '%Y-%m') AS ym,
  round(g.net, 1) AS net,
  round(g.net_costed, 1) AS net_costed,
  round(g.margin_ils, 1) AS margin_ils,
  round(100.0*g.margin_ils/nullif(g.net_costed, 0), 1) AS margin_pct,
  g.receipts_touched
FROM g JOIN ${DEPT} dp ON dp.C = g.dept_c
JOIN ${STORE} s ON s.C = g.branch_id`
      })
    }),
    section({
      id: 'item-profit',
      title: 'רווח לפי פריט',
      goal: 'Top items by ABSOLUTE gross profit ILS — the profit-in-the-till view, deliberately not margin % (a 70% item selling 10K matters less than a 30% item selling 10M).',
      caveats: 'פריטים ללא עלות ידועה מוחרגים מהדירוג (ראה סעיף no-cost-items — נתחי עוף טריים בולטים שם); כמות (qty) מערבבת ק"ג ויחידות — תקינה בתוך פריט, אסור לסכום בין פריטים; שמות פריט חוזרים על פני קודי פריט (רישום עונתי מחדש) אוחדו לפי שם — codes סופר כמה קודים אוחדו.',
      executiveSummary: querySlot({
        goal: 'Top 8 products by gross profit ILS (same-name seasonal re-listing codes merged).',
        widget: { kind: 'hbar', title: 'הפריטים הרווחיים ביותר (₪)', valueFormat: '₪', name: 'item', value: 'margin_ils' },
        sql: `WITH it AS (SELECT item, sum(net) AS net, sum(margin_ils) AS margin_ils, count(DISTINCT prt) AS codes FROM full_data GROUP BY item)
SELECT item, round(net) AS net, round(margin_ils) AS margin_ils,
  round(100.0*margin_ils/nullif(net, 0), 1) AS margin_pct, codes
FROM it ORDER BY margin_ils DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 products by gross profit ILS with department context (same-name codes merged).',
        widget: { kind: 'table', title: '25 מובילי הרווח', columns: [{key: 'item', label: 'פריט'}, {key: 'dept', label: 'מחלקה'}, {key: 'margin_ils', label: 'רווח גולמי', format: '₪'}, {key: 'net', label: 'נטו', format: '₪'}, {key: 'margin_pct', label: 'מרווח', format: '%'}] },
        sql: `WITH it AS (SELECT item, dept, sum(net) AS net, sum(margin_ils) AS margin_ils, count(DISTINCT prt) AS codes FROM full_data GROUP BY item, dept)
SELECT item, dept, round(net) AS net, round(margin_ils) AS margin_ils,
  round(100.0*margin_ils/nullif(net, 0), 1) AS margin_pct, codes
FROM it ORDER BY margin_ils DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Top 50 profit products with qty, stores selling, promo share of the product revenue — how the profit is made (same-name codes merged).',
        widget: { kind: 'table', title: 'מובילי רווח — איך נוצר הרווח', columns: [{key: 'item', label: 'פריט'}, {key: 'dept', label: 'מחלקה'}, {key: 'margin_ils', label: 'רווח', format: '₪'}, {key: 'margin_pct', label: 'מרווח', format: '%'}, {key: 'promo_share_pct', label: 'נתח מבצעים', format: '%'}, {key: 'stores', label: 'סניפים', format: 'int'}] },
        sql: `WITH it AS (
  SELECT item, dept, sum(net) AS net, sum(margin_ils) AS margin_ils, sum(qty_own_unit) AS qty,
    count(DISTINCT branch_id) AS stores, sum(promo_net) AS promo_net, count(DISTINCT prt) AS codes
  FROM full_data GROUP BY item, dept)
SELECT item, dept, round(net) AS net, round(margin_ils) AS margin_ils,
  round(100.0*margin_ils/nullif(net, 0), 1) AS margin_pct,
  round(qty) AS qty_own_unit, stores,
  round(100.0*promo_net/nullif(net, 0), 1) AS promo_share_pct, codes
FROM it ORDER BY margin_ils DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Product-code × branch profitability totals 2024+ for all products with any costed revenue; supports selected product-id slices by branch.',
        grain: 'one row per (product code, branch) with costed sales',
        columns: 'prt: product id, item: product name, dept, branch_id: StoreC, branch, net: all-lines net, net_costed, margin_ils (on costed lines), margin_pct, qty_own_unit: total qty in the product own unit, costed_share_pct',
        perItemOnly: 'qty_own_unit',
        viewSql: `WITH ${COST_CTE},
base AS (
  SELECT l.PrtC AS prt, h.StoreC AS branch_id, sum(${NET}) AS net, sum(l.Cmt) AS qty,
    sum(${NET}) FILTER (WHERE l.MivzaNo > 0) AS promo_net
  FROM ${SALES}
  WHERE l.KupaDocC >= (SELECT min(C) FROM ${H} WHERE DateDoc >= DATE '2024-01-01')
  GROUP BY 1, 2)
SELECT b.prt, trim(p.Nm) AS item, trim(dp.Nm) AS dept, b.branch_id, trim(s.Nm) AS branch,
  round(b.net, 1) AS net,
  round(b.net, 1) AS net_costed,
  round(b.net - c.unit_cost*b.qty, 1) AS margin_ils,
  round(100.0*(b.net - c.unit_cost*b.qty)/nullif(b.net, 0), 1) AS margin_pct,
  round(b.qty, 1) AS qty_own_unit,
  round(100.0*b.net/nullif(b.net, 0), 1) AS costed_share_pct,
  round(b.promo_net, 1) AS promo_net
FROM base b JOIN cost c ON c.ItemID = b.prt AND c.StoreID = b.branch_id AND c.unit_cost IS NOT NULL
JOIN ${PRT} p ON p.C = b.prt
JOIN ${DEPT} dp ON dp.C = p.DepartmentC
JOIN ${STORE} s ON s.C = b.branch_id`
      })
    }),
    section({
      id: 'loss-items',
      title: 'פריטים מתחת לעלות',
      goal: 'Items whose TOTAL 2024+ margin is negative — structurally sold below cost, split between deliberate loss-leaders and spoilage/markdown losses.',
      caveats: 'הפסד נשפט על נטו מול עלות (שניהם ללא מע"מ). מובילי הרשימה הם בדרך כלל loss-leaders מכוונים (קפה נמס, שקיות קופה במחיר מפוקח); פירות רכים נראים כהפסדי פחת/markdown. רף כמות מסנן פריטים זניחים. הדוח ברמת קוד פריט בכוונה: קוד "מדמם" עשוי להיות רישום עונתי אחד של מוצר שרווחי בכללותו (למשל תות שדה) — בדקו את השם לפני מסקנה ברמת מוצר; לאיחוד לפי מוצר: GROUP BY item על full_data.',
      executiveSummary: querySlot({
        goal: 'Top 8 below-cost items by ILS lost.',
        widget: { kind: 'hbar', title: 'הפסד שקלי — פריטים מתחת לעלות (₪)', valueFormat: '₪', name: 'item', value: 'margin_ils', highlight: {min: true, note: 'ההפסד הגדול'} },
        sql: `WITH it AS (SELECT prt, any_value(item) AS item, sum(qty_own_unit) AS qty, sum(net) AS net, sum(margin_ils) AS margin_ils FROM full_data GROUP BY prt)
SELECT prt, item, round(qty) AS qty_own_unit, round(net) AS net,
  round(margin_ils) AS margin_ils,
  round(100.0*margin_ils/nullif(net, 0), 1) AS margin_pct
FROM it ORDER BY margin_ils ASC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 below-cost items with department — the review list.',
        widget: { kind: 'table', title: 'פריטים מתחת לעלות — רשימת בדיקה', columns: [{key: 'item', label: 'פריט'}, {key: 'dept', label: 'מחלקה'}, {key: 'margin_ils', label: 'הפסד', format: '₪'}, {key: 'net', label: 'נטו', format: '₪'}, {key: 'margin_pct', label: 'מרווח', format: '%'}, {key: 'qty_own_unit', label: 'כמות'}] },
        sql: `WITH it AS (SELECT prt, any_value(item) AS item, any_value(dept) AS dept, sum(qty_own_unit) AS qty, sum(net) AS net, sum(margin_ils) AS margin_ils FROM full_data GROUP BY prt)
SELECT prt, item, dept,
  round(qty) AS qty_own_unit, round(net) AS net,
  round(margin_ils) AS margin_ils,
  round(100.0*margin_ils/nullif(net, 0), 1) AS margin_pct
FROM it ORDER BY margin_ils ASC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Top 50 below-cost items with the promo/discount fingerprint — is the loss driven by planned promos or by base price below cost (intentional loss-leader vs problem).',
        widget: { kind: 'table', title: 'מקור ההפסד — מבצע או מחיר בסיס', columns: [{key: 'item', label: 'פריט'}, {key: 'dept', label: 'מחלקה'}, {key: 'margin_ils', label: 'הפסד', format: '₪'}, {key: 'promo_share_pct', label: 'נתח מבצעים', format: '%'}, {key: 'fullprice_margin_ils', label: 'מרווח במחיר מלא', format: '₪'}, {key: 'loss_kind', label: 'סוג הפסד'}] },
        sql: `WITH it AS (
  SELECT prt, any_value(item) AS item, any_value(dept) AS dept, sum(qty_own_unit) AS qty, sum(net) AS net, sum(margin_ils) AS margin_ils,
    sum(promo_net) AS promo_net, sum(fullprice_margin_ils) AS fullprice_margin_ils
  FROM full_data GROUP BY prt)
SELECT prt, item, dept,
  round(net) AS net, round(margin_ils) AS margin_ils,
  round(100.0*margin_ils/nullif(net, 0), 1) AS margin_pct,
  round(100.0*promo_net/nullif(net, 0), 1) AS promo_share_pct,
  round(fullprice_margin_ils) AS fullprice_margin_ils,
  CASE WHEN coalesce(fullprice_margin_ils, 0) < 0 THEN 'base_price_below_cost' ELSE 'promo_or_markdown_driven' END AS loss_kind
FROM it ORDER BY margin_ils ASC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Per-store breakdown of every chain-level below-cost item — where each loss item actually loses.',
        grain: 'one row per (below-cost item, store) (~2K rows)',
        columns: 'prt, item, branch_id: StoreC, branch, net, margin_ils, qty_own_unit',
        perItemOnly: 'qty_own_unit',
        viewSql: `WITH cost AS (SELECT ItemID, StoreID, arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE FinalRegularCostPrice > 0) AS unit_cost FROM ${DPC} GROUP BY 1, 2),
item_store AS (
  SELECT l.PrtC AS prt, h.StoreC AS store, sum(${NET}) AS net, sum(l.Cmt) AS qty,
    sum(${NET}) FILTER (WHERE l.MivzaNo > 0) AS promo_net,
    sum(${NET}) FILTER (WHERE ${FULL_PRICE}) AS fp_net, sum(l.Cmt) FILTER (WHERE ${FULL_PRICE}) AS fp_qty
  FROM ${SALES}
  WHERE l.KupaDocC >= (SELECT min(C) FROM ${H} WHERE DateDoc >= DATE '2024-01-01')
  GROUP BY 1, 2),
costed AS (
  SELECT a.prt, a.store, a.net, a.qty, a.promo_net, a.net - c.unit_cost*a.qty AS margin_ils, a.fp_net - c.unit_cost*a.fp_qty AS fp_margin_ils
  FROM item_store a JOIN cost c ON c.ItemID = a.prt AND c.StoreID = a.store AND c.unit_cost IS NOT NULL),
loss_items AS (
  SELECT prt FROM costed GROUP BY 1
  HAVING sum(margin_ils) < 0 AND sum(qty) >= 100)
SELECT cs.prt, trim(p.Nm) AS item, trim(dp.Nm) AS dept, cs.store AS branch_id, trim(s.Nm) AS branch,
  round(cs.net, 1) AS net, round(cs.margin_ils, 1) AS margin_ils,
  round(cs.qty, 1) AS qty_own_unit,
  round(cs.promo_net, 1) AS promo_net, round(cs.fp_margin_ils, 1) AS fullprice_margin_ils
FROM costed cs
JOIN loss_items li ON li.prt = cs.prt
JOIN ${PRT} p ON p.C = cs.prt
JOIN ${DEPT} dp ON dp.C = p.DepartmentC
JOIN ${STORE} s ON s.C = cs.store`
      })
    }),
    section({
      id: 'no-cost-items',
      title: 'פריטים ללא נתוני עלות',
      goal: 'Revenue whose profitability is UNKNOWABLE because no cost was ever recorded — ranked by revenue at risk, the cost-capture fix list.',
      caveats: 'ריכוז בפריטים שקילים טריים (נתחי עוף, תותים) וב"קוד כללי". פריטים אלה מוחרגים בצדק מכל חישובי המרווח בקטלוג — unknown איננו אפס.',
      executiveSummary: querySlot({
        goal: 'The size of the blind spot: total revenue with no cost data, item count, share of chain net.',
        widget: { kind: 'kpi', title: 'הכנסה ללא נתוני עלות', items: [{label: 'הכנסה בסיכון (מ׳ ₪)', col: 'net_at_risk_M'}, {label: 'פריטים ללא עלות', col: 'items_no_cost', format: 'int'}, {label: 'מנטו הרשת', col: 'pct_of_chain_net', format: '%'}] },
        sql: `WITH it AS (SELECT prt, sum(net_at_risk) AS net FROM full_data GROUP BY prt)
SELECT round(sum(net)/1e6, 2) AS net_at_risk_M,
  count(*) AS items_no_cost,
  round(100.0*sum(net)/(SELECT sum(l.Scm - l.VatAmount) FROM ${L} l JOIN ${H} h ON l.KupaDocC = h.C AND h.DateDoc >= DATE '2024-01-01' WHERE l.KupaDocC >= (SELECT min(C) FROM ${H} WHERE DateDoc >= DATE '2024-01-01')), 2) AS pct_of_chain_net
FROM it LIMIT 1`
      }),
      summary: querySlot({
        goal: 'Top 25 no-cost items by revenue at risk.',
        widget: { kind: 'hbar', title: 'הכנסה ללא עלות לפי פריט (₪)', valueFormat: '₪', name: 'item', value: 'net_at_risk' },
        sql: `WITH it AS (SELECT prt, any_value(item) AS item, sum(net_at_risk) AS net, sum(qty_own_unit) AS qty, count(DISTINCT branch_id) AS stores FROM full_data GROUP BY prt)
SELECT prt, item, round(net) AS net_at_risk,
  round(qty) AS qty_own_unit, stores
FROM it ORDER BY net DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Top 50 no-cost items with department, last sale and recent run-rate — prioritize which cost records to fix first.',
        widget: { kind: 'table', title: 'תיקון רשומות עלות — סדר עדיפויות', columns: [{key: 'item', label: 'פריט'}, {key: 'dept', label: 'מחלקה'}, {key: 'net_at_risk', label: 'הכנסה בסיכון', format: '₪'}, {key: 'net_last_3m', label: '3 חודשים אחרונים', format: '₪'}, {key: 'stores', label: 'סניפים', format: 'int'}, {key: 'last_sale_d', label: 'מכירה אחרונה'}] },
        sql: `WITH it AS (SELECT prt, any_value(item) AS item, any_value(dept) AS dept, sum(net_at_risk) AS net, sum(net_last_3m) AS net_last_3m, count(DISTINCT branch_id) AS stores, max(last_sale_d) AS last_sale_d FROM full_data GROUP BY prt)
SELECT prt, item, dept, round(net) AS net_at_risk,
  round(coalesce(net_last_3m, 0)) AS net_last_3m, stores, last_sale_d
FROM it ORDER BY net DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Every item × branch that sold since 2024 for items with zero cost coverage anywhere — the complete branch-filterable cost-capture backlog.',
        grain: 'one row per no-cost item × branch',
        columns: 'prt, item, dept, branch_id: StoreC, branch, net_at_risk, qty_own_unit, stores, first_sale_d, last_sale_d',
        perItemOnly: 'qty_own_unit',
        viewSql: `WITH ${COST_CTE},
base AS (
  SELECT l.PrtC AS prt, h.StoreC AS branch_id, sum(${NET}) AS net, sum(l.Cmt) AS qty,
    min(h.DateDoc::DATE) AS first_sale_d, max(h.DateDoc::DATE) AS last_sale_d,
    sum(${NET}) FILTER (WHERE h.DateDoc >= ${M_END} - INTERVAL 3 MONTH) AS net_last_3m
  FROM ${SALES}
  WHERE l.KupaDocC >= (SELECT min(C) FROM ${H} WHERE DateDoc >= DATE '2024-01-01')
  GROUP BY 1, 2),
based AS (
  SELECT b.*, (c.unit_cost IS NOT NULL) AS has_cost FROM base b LEFT JOIN cost c ON c.ItemID = b.prt AND c.StoreID = b.branch_id),
no_cost AS (
  SELECT prt, count(*) AS stores FROM based GROUP BY 1
  HAVING max(has_cost) = FALSE)
SELECT b.prt, trim(p.Nm) AS item, trim(dp.Nm) AS dept, b.branch_id, trim(s.Nm) AS branch, round(b.net, 1) AS net_at_risk,
  round(b.qty, 1) AS qty_own_unit, nc.stores, b.first_sale_d, b.last_sale_d, round(coalesce(b.net_last_3m, 0), 1) AS net_last_3m
FROM based b JOIN no_cost nc ON nc.prt = b.prt
JOIN ${PRT} p ON p.C = b.prt
JOIN ${STORE} s ON s.C = b.branch_id
LEFT JOIN ${DEPT} dp ON dp.C = p.DepartmentC`
      })
    }),
    section({
      id: 'margin-leakage',
      title: 'דליפת מרווח מול מחירון',
      goal: 'Where actual paid price runs below list price (MhrLine): total leak, and whether it is planned promo or manual register discounting.',
      caveats: 'דליפה = מחיר מחירון (MhrLine×Cmt) פחות הסכום ששולם, על שורות חיוביות עם מחירון>0 — שני הצדדים ברוטו (כולל מע"מ) כך שהיחס אינו מושפע ממע"מ. ברשת זו ~99% מהדליפה היא מבצעים מתוכננים, לא הנחות קופה פרוצות.',
      executiveSummary: querySlot({
        goal: 'Chain leak headline: list vs paid, leak ILS and %, and the promo share of the leak.',
        widget: { kind: 'kpi', title: 'דליפה מול מחירון', items: [{label: 'מחירון (מ׳ ₪)', col: 'list_gross_M'}, {label: 'שולם (מ׳ ₪)', col: 'paid_gross_M'}, {label: 'דליפה (מ׳ ₪)', col: 'leak_gross_M'}, {label: 'מהמחירון', col: 'leak_pct_of_list', format: '%'}, {label: 'חלק המבצעים בדליפה', col: 'promo_share_of_leak_pct', format: '%'}] },
        sql: `SELECT round(sum(l.MhrLine*l.Cmt)/1e6, 1) AS list_gross_M,
  round(sum(l.Scm)/1e6, 1) AS paid_gross_M,
  round(sum(l.MhrLine*l.Cmt - l.Scm)/1e6, 1) AS leak_gross_M,
  round(100.0*sum(l.MhrLine*l.Cmt - l.Scm)/nullif(sum(l.MhrLine*l.Cmt), 0), 1) AS leak_pct_of_list,
  round(100.0*sum(CASE WHEN l.MivzaNo > 0 THEN l.MhrLine*l.Cmt - l.Scm ELSE 0 END)
    /nullif(sum(l.MhrLine*l.Cmt - l.Scm), 0), 1) AS promo_share_of_leak_pct
FROM ${SALES}
WHERE l.MhrLine > 0 AND l.Cmt > 0
LIMIT 1`
      }),
      summary: querySlot({
        goal: 'Top 25 leaking items: leak ILS, % of list, and the promo vs manual split.',
        widget: { kind: 'stackedBar', title: 'דליפה לפי פריט — מבצע מול ידני (₪)', valueFormat: '₪', category: 'item', ys: [{col: 'via_promo_ils', label: 'מבצעים'}, {col: 'via_manual_ils', label: 'הנחה ידנית'}] },
        sql: `WITH lk AS (
  SELECT l.PrtC AS prt,
    sum(l.MhrLine*l.Cmt - l.Scm) AS leak_ils,
    sum(l.MhrLine*l.Cmt) AS list_gross,
    sum(CASE WHEN l.MivzaNo > 0 THEN l.MhrLine*l.Cmt - l.Scm ELSE 0 END) AS leak_promo,
    sum(CASE WHEN l.MivzaNo = 0 THEN l.MhrLine*l.Cmt - l.Scm ELSE 0 END) AS leak_manual
  FROM ${SALES}
  WHERE l.MhrLine > 0 AND l.Cmt > 0
  GROUP BY 1)
SELECT lk.prt, trim(p.Nm) AS item, round(lk.leak_ils) AS leak_ils,
  round(100.0*lk.leak_ils/nullif(lk.list_gross, 0), 1) AS leak_pct_of_list,
  round(lk.leak_promo) AS via_promo_ils, round(lk.leak_manual) AS via_manual_ils
FROM lk JOIN ${PRT} p ON p.C = lk.prt
ORDER BY lk.leak_ils DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Leak by department: which categories give away the most vs list, and how deep — the pricing-policy view.',
        widget: { kind: 'hbar', title: 'דליפה מול מחירון לפי מחלקה (₪)', valueFormat: '₪', name: 'dept', value: 'leak_ils' },
        sql: `WITH lk AS (
  SELECT p.DepartmentC AS dept_c,
    sum(l.MhrLine*l.Cmt - l.Scm) AS leak_ils,
    sum(l.MhrLine*l.Cmt) AS list_gross,
    sum(CASE WHEN l.MivzaNo > 0 THEN l.MhrLine*l.Cmt - l.Scm ELSE 0 END) AS leak_promo
  FROM ${SALES} JOIN ${PRT} p ON p.C = l.PrtC
  WHERE l.MhrLine > 0 AND l.Cmt > 0
  GROUP BY 1)
SELECT trim(dp.Nm) AS dept, round(lk.leak_ils) AS leak_ils,
  round(100.0*lk.leak_ils/nullif(lk.list_gross, 0), 1) AS leak_pct_of_list,
  round(100.0*lk.leak_promo/nullif(lk.leak_ils, 0), 1) AS promo_share_of_leak_pct,
  round(lk.list_gross/1e6, 1) AS list_gross_M
FROM lk JOIN ${DEPT} dp ON dp.C = lk.dept_c
WHERE lk.list_gross > 1000000
ORDER BY lk.leak_ils DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Item × branch leak table: list vs paid with promo/manual decomposition, for any branch-filtered leak drill-down.',
        grain: 'one row per (item, branch) with any leak',
        columns: 'prt, item, dept, branch_id: StoreC, branch, list_gross, paid_gross, leak_ils, leak_pct_of_list, via_promo_ils, via_manual_ils',
        viewSql: `WITH lk AS (
  SELECT l.PrtC AS prt, h.StoreC AS branch_id,
    sum(l.MhrLine*l.Cmt) AS list_gross,
    sum(l.Scm) AS paid_gross,
    sum(l.MhrLine*l.Cmt - l.Scm) AS leak_ils,
    sum(CASE WHEN l.MivzaNo > 0 THEN l.MhrLine*l.Cmt - l.Scm ELSE 0 END) AS leak_promo,
    sum(CASE WHEN l.MivzaNo = 0 THEN l.MhrLine*l.Cmt - l.Scm ELSE 0 END) AS leak_manual
  FROM ${SALES}
  WHERE l.MhrLine > 0 AND l.Cmt > 0
  GROUP BY 1, 2
  HAVING sum(l.MhrLine*l.Cmt - l.Scm) <> 0)
SELECT lk.prt, trim(p.Nm) AS item, trim(dp.Nm) AS dept, lk.branch_id, trim(s.Nm) AS branch,
  round(lk.list_gross, 1) AS list_gross, round(lk.paid_gross, 1) AS paid_gross,
  round(lk.leak_ils, 1) AS leak_ils,
  round(100.0*lk.leak_ils/nullif(lk.list_gross, 0), 2) AS leak_pct_of_list,
  round(lk.leak_promo, 1) AS via_promo_ils, round(lk.leak_manual, 1) AS via_manual_ils
FROM lk JOIN ${PRT} p ON p.C = lk.prt JOIN ${STORE} s ON s.C = lk.branch_id LEFT JOIN ${DEPT} dp ON dp.C = p.DepartmentC`
      })
    })
  ]
}) })

const itemMonthFullData = FullData('itemMonthFullData', { impl: fullData({
  description: 'Product-code × month series 2024+: net, qty, avg PAID unit price (gross incl VAT and net ex VAT), margin at latest known cost, same-code YoY price change. The base for any single-item trend graph: filter exact prt or find candidates with WHERE item LIKE, then SELECT ym + the measure ORDER BY ym. Brand/category price trend = net-weighted avg of price_yoy_pct — never sum(net)/sum(qty). mi (linear month index) and the raw helper columns (net_raw, gross_pos, qty_pos, margin_ils_raw, net_costed, daymask) are internal reconstruction aids used by the section slots — the 15 public columns above are unchanged.',
  grain: 'one row per (product code, product name, department, month) with sales (~300-500K rows)',
  columns: 'prt: product id, item: product name, dept, ym: yyyy-mm, net, qty_own_unit, unit_price_gross: avg paid price incl VAT per own unit (positive sale lines, after discounts), unit_price_net: same ex VAT, margin_ils (latest-cost basis), margin_pct, days_sold, stores, codes: merged item codes in this row, price_yoy_pct: same-prt unit_price_gross vs 12 months back (null without year-ago sales), partial_month: true on the incomplete data-tail month',
  perItemOnly: 'qty_own_unit,unit_price_gross,unit_price_net,gross_pos,qty_pos',
  viewSql: `WITH cost AS (
  SELECT ItemID, StoreID, arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE FinalRegularCostPrice > 0) AS unit_cost
  FROM read_parquet('{{ROOT}}/DailyPriceCost.parquet') GROUP BY 1, 2),
hdr AS (
  SELECT C, StoreC, (year(DateDoc)*12 + month(DateDoc) - 1) AS mi, DateDoc::DATE AS dd, day(DateDoc) AS dom
  FROM read_parquet('{{ROOT}}/KupaDoc_Header.parquet') WHERE DateDoc >= DATE '2024-01-01'),
agg AS (
  SELECT l.PrtC AS prt, h.mi,
    round(sum(l.Scm - l.VatAmount), 1) AS net,
    round(sum(l.Cmt), 1) AS qty_own_unit,
    round(sum(l.Scm) FILTER (WHERE l.Cmt > 0 AND l.Scm > 0)/nullif(sum(l.Cmt) FILTER (WHERE l.Cmt > 0 AND l.Scm > 0), 0), 3) AS unit_price_gross,
    round(sum(l.Scm - l.VatAmount) FILTER (WHERE l.Cmt > 0 AND l.Scm > 0)/nullif(sum(l.Cmt) FILTER (WHERE l.Cmt > 0 AND l.Scm > 0), 0), 3) AS unit_price_net,
    round(sum((l.Scm - l.VatAmount) - c.unit_cost*l.Cmt) FILTER (WHERE c.unit_cost IS NOT NULL), 1) AS margin_ils,
    round(100.0*sum((l.Scm - l.VatAmount) - c.unit_cost*l.Cmt) FILTER (WHERE c.unit_cost IS NOT NULL)
      /nullif(sum(l.Scm - l.VatAmount) FILTER (WHERE c.unit_cost IS NOT NULL), 0), 1) AS margin_pct,
    count(DISTINCT h.dd) AS days_sold,
    count(DISTINCT h.StoreC) AS stores,
    1 AS codes,
    sum(l.Scm - l.VatAmount) AS net_raw,
    sum(l.Scm) FILTER (WHERE l.Cmt > 0 AND l.Scm > 0) AS gross_pos,
    sum(l.Cmt) FILTER (WHERE l.Cmt > 0 AND l.Scm > 0) AS qty_pos,
    sum((l.Scm - l.VatAmount) - c.unit_cost*l.Cmt) FILTER (WHERE c.unit_cost IS NOT NULL) AS margin_ils_raw,
    sum(l.Scm - l.VatAmount) FILTER (WHERE c.unit_cost IS NOT NULL) AS net_costed,
    bit_or((1::BIGINT << (h.dom - 1))) AS daymask
  FROM read_parquet('{{ROOT}}/KupaDoc_Lines.parquet') l
  JOIN hdr h ON l.KupaDocC = h.C
  LEFT JOIN cost c ON c.ItemID = l.PrtC AND c.StoreID = h.StoreC
  WHERE l.KupaDocC >= (SELECT min(C) FROM read_parquet('{{ROOT}}/KupaDoc_Header.parquet') WHERE DateDoc >= DATE '2024-01-01')
  GROUP BY 1, 2),
mx AS (SELECT (year(max(DateDoc))*12 + month(max(DateDoc)) - 1) AS last_mi,
  max(DateDoc)::DATE = (date_trunc('month', max(DateDoc)) + INTERVAL 1 MONTH - INTERVAL 1 DAY)::DATE AS complete FROM read_parquet('{{ROOT}}/KupaDoc_Header.parquet'))
SELECT a.prt, trim(p.Nm) AS item, trim(dp.Nm) AS dept,
  strftime(make_date(a.mi//12, a.mi%12 + 1, 1), '%Y-%m') AS ym, a.mi,
  a.net, a.qty_own_unit, a.unit_price_gross, a.unit_price_net, a.margin_ils, a.margin_pct, a.days_sold, a.stores, a.codes,
  round(100.0*(a.unit_price_gross/nullif(last_value(a.unit_price_gross) OVER (PARTITION BY a.prt ORDER BY a.mi RANGE BETWEEN 12 PRECEDING AND 12 PRECEDING), 0) - 1), 1) AS price_yoy_pct,
  (a.mi = mx.last_mi AND NOT mx.complete) AS partial_month,
  a.net_raw, a.gross_pos, a.qty_pos, a.margin_ils_raw, a.net_costed, a.daymask
FROM agg a
JOIN read_parquet('{{ROOT}}/Prt.parquet') p ON p.C = a.prt
JOIN read_parquet('{{ROOT}}/Departments.parquet') dp ON dp.C = p.DepartmentC
CROSS JOIN mx`
}) })

VerifiedReport('item-trends', { impl: verifiedReport({
  title: 'מגמות פריט לאורך זמן',
  description: 'סדרות חודשיות ברמת מוצר: מחיר ממוצע ששולם לצרכן, כמות/מהירות מכירה ומרווח — מי התייקר, מי מאט ומי נשחק, עם full_data חודשי לגרף של כל מוצר.',
  whenToUse: 'כל שאלת "לאורך זמן / מגמה / התייקר / האט" ברמת פריט או מוצר — גרף מחיר של מוצר, שינוי כמויות, שחיקת מרווח פר פריט. לזיהוי המוצר תחילה: SELECT item, round(sum(net)) AS net FROM full_data WHERE item LIKE ... GROUP BY 1 ORDER BY 2 DESC LIMIT 5. לרווחיות מצטברת — profitability; לעלות ספק מול מחיר מדף — pricing-cost-drift.',
  routePhrases: ['מגמת פריט', 'לאורך זמן', 'גרף מוצר', 'גרף מחיר', 'התייקר', 'הוזל', 'האט', 'מהירות מכירה', 'שחיקת מרווח פריט'],
  caveats: `מחיר = ממוצע ששולם בפועל ליחידה (כולל מע"מ, אחרי הנחות ומבצעים) על שורות מכירה חיוביות — לא מחיר מדף רשמי; קפיצת מע"מ 17%→18% ב-2025-01 נראית בכוונה במחיר הגלוי (unit_price_net מנטרל אותה). גרעין מוצר — שמות מאוחדים על פני קודים עונתיים (codes סופר); מחיר וכמות תקינים בתוך מוצר, אסור להשוות כמויות בין מוצרים. מרווח לפי העלות האחרונה הידועה (סטטית) — מגמת מרווח משקפת תנועת מחיר מול העלות הנוכחית, לא היסטוריית עלות. חלונות ההשוואה בסעיפים: 3 חודשים מלאים אחרונים מול אותם 3 חודשים אשתקד (נטרול עונתיות).`,
  materialize: true,   // cache the shared fullData view once per run; section slots below read FROM full_data
  executiveSummary: querySlot({
    goal: 'Item-trend headline: products measured, median consumer-price change YoY, how many got >=5% pricier/cheaper, and how many lost >=20% velocity.',
    widget: { kind: 'kpi', title: 'מגמות פריט — מבט מהיר', items: [{label: 'מוצרים במדידה', col: 'products_measured', format: 'int'}, {label: 'חציון שינוי מחיר שנתי', col: 'median_price_chg_pct', format: '%'}, {label: 'התייקרו 5%+', col: 'items_price_up_5pct', format: 'int'}, {label: 'הוזלו 5%+', col: 'items_price_down_5pct', format: 'int'}, {label: 'איבדו 20%+ מהקצב', col: 'items_qty_drop_20pct', format: 'int'}] },
    sql: `WITH mx AS (SELECT (year(max(DateDoc))*12 + month(max(DateDoc)) - 1) AS last_mi, min(C) FILTER (WHERE DateDoc >= DATE '2024-01-01') AS min_c
  FROM read_parquet('{{ROOT}}/KupaDoc_Header.parquet')),
hdr AS (
  SELECT h.C, (year(h.DateDoc)*12 + month(h.DateDoc) - 1) AS mi, day(h.DateDoc) AS dom
  FROM read_parquet('{{ROOT}}/KupaDoc_Header.parquet') h CROSS JOIN mx
  WHERE h.DateDoc >= DATE '2024-01-01'
    AND (((year(h.DateDoc)*12 + month(h.DateDoc) - 1) >= mx.last_mi - 3 AND (year(h.DateDoc)*12 + month(h.DateDoc) - 1) < mx.last_mi)
      OR ((year(h.DateDoc)*12 + month(h.DateDoc) - 1) >= mx.last_mi - 15 AND (year(h.DateDoc)*12 + month(h.DateDoc) - 1) < mx.last_mi - 12))),
agg AS (
  SELECT l.PrtC AS prt, h.mi,
    sum(l.Scm) FILTER (WHERE l.Cmt > 0 AND l.Scm > 0) AS g,
    sum(l.Cmt) FILTER (WHERE l.Cmt > 0 AND l.Scm > 0) AS q,
    sum(l.Scm - l.VatAmount) AS net,
    bit_or((1::BIGINT << (h.dom - 1))) AS daymask
  FROM read_parquet('{{ROOT}}/KupaDoc_Lines.parquet') l
  JOIN hdr h ON l.KupaDocC = h.C
  WHERE l.KupaDocC >= (SELECT min_c FROM mx)
  GROUP BY 1, 2),
imd AS (
  SELECT trim(p.Nm) AS item, trim(dp.Nm) AS dept, a.mi,
    sum(a.g) AS g, sum(a.q) AS q, sum(a.net) AS net,
    bit_count(bit_or(a.daymask)) AS ddays
  FROM agg a
  JOIN read_parquet('{{ROOT}}/Prt.parquet') p ON p.C = a.prt
  JOIN read_parquet('{{ROOT}}/Departments.parquet') dp ON dp.C = p.DepartmentC
  GROUP BY 1, 2, 3),
w AS (
  SELECT imd.item, imd.dept,
    sum(g)    FILTER (WHERE mi >= m.last_mi - 3  AND mi < m.last_mi)      AS gross_now,
    sum(q)    FILTER (WHERE mi >= m.last_mi - 3  AND mi < m.last_mi)      AS qty_now,
    sum(g)    FILTER (WHERE mi >= m.last_mi - 15 AND mi < m.last_mi - 12) AS gross_prev,
    sum(q)    FILTER (WHERE mi >= m.last_mi - 15 AND mi < m.last_mi - 12) AS qty_prev,
    sum(net)  FILTER (WHERE mi >= m.last_mi - 3  AND mi < m.last_mi)      AS net_now,
    sum(net)  FILTER (WHERE mi >= m.last_mi - 15 AND mi < m.last_mi - 12) AS net_prev,
    sum(ddays) FILTER (WHERE mi >= m.last_mi - 3  AND mi < m.last_mi)      AS days_now,
    sum(ddays) FILTER (WHERE mi >= m.last_mi - 15 AND mi < m.last_mi - 12) AS days_prev
  FROM imd CROSS JOIN mx m
  GROUP BY 1, 2)
SELECT count(*) FILTER (WHERE qty_now >= 100 AND qty_prev >= 100 AND net_now > 20000) AS products_measured,
  round(median(100.0*((gross_now/qty_now) - (gross_prev/qty_prev))/(gross_prev/qty_prev)) FILTER (WHERE qty_now >= 100 AND qty_prev >= 100 AND net_now > 20000), 1) AS median_price_chg_pct,
  count(*) FILTER (WHERE qty_now >= 100 AND qty_prev >= 100 AND net_now > 20000 AND (gross_now/qty_now) >= 1.05*(gross_prev/qty_prev)) AS items_price_up_5pct,
  count(*) FILTER (WHERE qty_now >= 100 AND qty_prev >= 100 AND net_now > 20000 AND (gross_now/qty_now) <= 0.95*(gross_prev/qty_prev)) AS items_price_down_5pct,
  count(*) FILTER (WHERE qty_prev >= 100 AND days_prev >= 20 AND (coalesce(qty_now, 0)/greatest(days_now, 1)) < 0.8*(qty_prev/days_prev)) AS items_qty_drop_20pct
FROM w LIMIT 1`
  }),
  summary: querySlot({
    goal: 'Chain consumer-price inflation by month: net-weighted YoY change of same-product paid prices, last 13 complete months.',
    widget: { kind: 'line', title: 'אינפלציית מחיר לצרכן ברשת (שנתי)', subtitle: 'שינוי מחיר משוקלל מול אותו חודש אשתקד', valueFormat: '%', x: 'ym', ys: [{col: 'price_yoy_wtd_pct', label: 'שינוי מחיר שנתי'}] },
    sql: `WITH hdr AS (
  SELECT C, (year(DateDoc)*12 + month(DateDoc) - 1) AS mi
  FROM read_parquet('{{ROOT}}/KupaDoc_Header.parquet') WHERE DateDoc >= DATE '2024-01-01'),
agg AS (
  SELECT l.PrtC AS prt, h.mi,
    sum(l.Scm) FILTER (WHERE l.Cmt > 0 AND l.Scm > 0) AS g,
    sum(l.Cmt) FILTER (WHERE l.Cmt > 0 AND l.Scm > 0) AS q,
    sum(l.Scm - l.VatAmount) AS net
  FROM read_parquet('{{ROOT}}/KupaDoc_Lines.parquet') l
  JOIN hdr h ON l.KupaDocC = h.C
  WHERE l.KupaDocC >= (SELECT min(C) FROM read_parquet('{{ROOT}}/KupaDoc_Header.parquet') WHERE DateDoc >= DATE '2024-01-01')
  GROUP BY 1, 2),
pm AS (
  SELECT trim(p.Nm) AS item, trim(dp.Nm) AS dept, a.mi, sum(a.g) AS g, sum(a.q) AS q, sum(a.net) AS net
  FROM agg a
  JOIN read_parquet('{{ROOT}}/Prt.parquet') p ON p.C = a.prt
  JOIN read_parquet('{{ROOT}}/Departments.parquet') dp ON dp.C = p.DepartmentC
  GROUP BY 1, 2, 3),
pw AS (
  SELECT item, dept, mi, g, q, net,
    last_value(g) OVER w AS py_g, last_value(q) OVER w AS py_q
  FROM pm
  WINDOW w AS (PARTITION BY item, dept ORDER BY mi RANGE BETWEEN 12 PRECEDING AND 12 PRECEDING)),
mx AS (SELECT (year(max(DateDoc))*12 + month(max(DateDoc)) - 1) AS last_mi FROM read_parquet('{{ROOT}}/KupaDoc_Header.parquet'))
SELECT strftime(make_date(pw.mi//12, pw.mi%12 + 1, 1), '%Y-%m') AS ym,
  round(100.0*(sum(pw.net*(pw.g/pw.q)/(py_g/py_q))/sum(pw.net) - 1), 2) AS price_yoy_wtd_pct,
  count(*) AS products_in_index
FROM pw CROSS JOIN mx
WHERE pw.mi < mx.last_mi AND pw.mi >= mx.last_mi - 13
  AND pw.q >= 30 AND py_q >= 30 AND pw.net > 0 AND py_g IS NOT NULL
GROUP BY 1 ORDER BY ym DESC LIMIT 13`
  }),
  sections: [
    section({
      id: 'price-trend',
      title: 'מגמת מחיר לצרכן',
      goal: 'Which products got more expensive (or cheaper) for the consumer — avg paid unit price, last 3 complete months vs the same 3 months a year earlier, revenue-weighted.',
      caveats: 'מחיר ממוצע ששולם — מבצע כבד באחד החלונות ייראה כשינוי מחיר; בדקו את qty_chg_pct בעומק לפני מסקנה. לגרף מחיר של מוצר בודד: full_data עם WHERE item = ... ORDER BY ym.',
      executiveSummary: querySlot({
        goal: 'Top 8 consumer-price increases by revenue-weighted change.',
        widget: { kind: 'hbar', title: 'ההתייקרויות הבולטות לצרכן', valueFormat: '%', name: 'item', value: 'price_chg_pct', highlight: {max: true, note: 'ההתייקרות החדה'} },
        sql: `WITH lm AS (SELECT max(mi) AS last_mi FROM full_data),
pm AS (
  SELECT fd.item, fd.dept, fd.mi,
    sum(fd.gross_pos) AS g, sum(fd.qty_pos) AS q, sum(fd.net_raw) AS net,
    sum(fd.margin_ils_raw) AS mraw, sum(fd.net_costed) AS nc,
    bit_count(bit_or(fd.daymask::BIGINT)) AS ddays
  FROM full_data fd CROSS JOIN lm
  WHERE (fd.mi >= lm.last_mi - 3 AND fd.mi < lm.last_mi) OR (fd.mi >= lm.last_mi - 15 AND fd.mi < lm.last_mi - 12)
  GROUP BY 1, 2, 3),
cd AS (
  SELECT fd.item, fd.dept, count(DISTINCT fd.prt) AS codes
  FROM full_data fd CROSS JOIN lm
  WHERE (fd.mi >= lm.last_mi - 3 AND fd.mi < lm.last_mi) OR (fd.mi >= lm.last_mi - 15 AND fd.mi < lm.last_mi - 12)
  GROUP BY 1, 2),
w AS (
  SELECT pm.item, pm.dept,
    sum(g)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS gross_now,
    sum(q)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS qty_now,
    sum(g)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS gross_prev,
    sum(q)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS qty_prev,
    sum(net)  FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS net_now,
    sum(net)  FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS net_prev,
    sum(mraw) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS margin_now,
    sum(nc)   FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS net_costed_now,
    sum(mraw) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS margin_prev,
    sum(nc)   FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS net_costed_prev,
    sum(ddays) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS days_now,
    sum(ddays) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS days_prev,
    any_value(cd.codes) AS codes
  FROM pm JOIN cd ON cd.item = pm.item AND cd.dept IS NOT DISTINCT FROM pm.dept
  GROUP BY 1, 2)
SELECT item, dept, round((gross_prev/qty_prev), 2) AS price_yr_ago, round((gross_now/qty_now), 2) AS price_now,
  round(100.0*((gross_now/qty_now) - (gross_prev/qty_prev))/(gross_prev/qty_prev), 1) AS price_chg_pct, round(net_now) AS net_3m
FROM w
WHERE qty_now >= 100 AND qty_prev >= 100 AND net_now > 20000
ORDER BY ((gross_now/qty_now) - (gross_prev/qty_prev))/(gross_prev/qty_prev)*net_now DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 paid-price movers both directions (revenue-weighted), with before/after prices.',
        widget: { kind: 'table', title: 'תזוזות מחיר לצרכן — שנה מול שנה', columns: [{key: 'item', label: 'פריט'}, {key: 'dept', label: 'מחלקה'}, {key: 'price_yr_ago', label: 'מחיר אשתקד', format: '₪'}, {key: 'price_now', label: 'מחיר עכשיו', format: '₪'}, {key: 'price_chg_pct', label: 'שינוי', format: '%'}, {key: 'net_3m', label: 'מחזור 3 חודשים', format: '₪'}] },
        sql: `WITH lm AS (SELECT max(mi) AS last_mi FROM full_data),
pm AS (
  SELECT fd.item, fd.dept, fd.mi,
    sum(fd.gross_pos) AS g, sum(fd.qty_pos) AS q, sum(fd.net_raw) AS net,
    sum(fd.margin_ils_raw) AS mraw, sum(fd.net_costed) AS nc,
    bit_count(bit_or(fd.daymask::BIGINT)) AS ddays
  FROM full_data fd CROSS JOIN lm
  WHERE (fd.mi >= lm.last_mi - 3 AND fd.mi < lm.last_mi) OR (fd.mi >= lm.last_mi - 15 AND fd.mi < lm.last_mi - 12)
  GROUP BY 1, 2, 3),
cd AS (
  SELECT fd.item, fd.dept, count(DISTINCT fd.prt) AS codes
  FROM full_data fd CROSS JOIN lm
  WHERE (fd.mi >= lm.last_mi - 3 AND fd.mi < lm.last_mi) OR (fd.mi >= lm.last_mi - 15 AND fd.mi < lm.last_mi - 12)
  GROUP BY 1, 2),
w AS (
  SELECT pm.item, pm.dept,
    sum(g)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS gross_now,
    sum(q)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS qty_now,
    sum(g)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS gross_prev,
    sum(q)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS qty_prev,
    sum(net)  FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS net_now,
    sum(net)  FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS net_prev,
    sum(mraw) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS margin_now,
    sum(nc)   FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS net_costed_now,
    sum(mraw) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS margin_prev,
    sum(nc)   FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS net_costed_prev,
    sum(ddays) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS days_now,
    sum(ddays) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS days_prev,
    any_value(cd.codes) AS codes
  FROM pm JOIN cd ON cd.item = pm.item AND cd.dept IS NOT DISTINCT FROM pm.dept
  GROUP BY 1, 2)
SELECT item, dept, round((gross_prev/qty_prev), 2) AS price_yr_ago, round((gross_now/qty_now), 2) AS price_now,
  round(100.0*((gross_now/qty_now) - (gross_prev/qty_prev))/(gross_prev/qty_prev), 1) AS price_chg_pct, round(net_now) AS net_3m
FROM w
WHERE qty_now >= 100 AND qty_prev >= 100 AND net_now > 20000
ORDER BY abs((gross_now/qty_now) - (gross_prev/qty_prev))/(gross_prev/qty_prev)*net_now DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Top 50 price movers with the volume response (qty change) and merged-code count — did demand react to the price move.',
        widget: { kind: 'table', title: 'מחיר מול תגובת ביקוש', columns: [{key: 'item', label: 'פריט'}, {key: 'price_chg_pct', label: 'שינוי מחיר', format: '%'}, {key: 'qty_chg_pct', label: 'שינוי כמות', format: '%'}, {key: 'price_now', label: 'מחיר עכשיו', format: '₪'}, {key: 'net_3m', label: 'מחזור 3 חודשים', format: '₪'}] },
        sql: `WITH lm AS (SELECT max(mi) AS last_mi FROM full_data),
pm AS (
  SELECT fd.item, fd.dept, fd.mi,
    sum(fd.gross_pos) AS g, sum(fd.qty_pos) AS q, sum(fd.net_raw) AS net,
    sum(fd.margin_ils_raw) AS mraw, sum(fd.net_costed) AS nc,
    bit_count(bit_or(fd.daymask::BIGINT)) AS ddays
  FROM full_data fd CROSS JOIN lm
  WHERE (fd.mi >= lm.last_mi - 3 AND fd.mi < lm.last_mi) OR (fd.mi >= lm.last_mi - 15 AND fd.mi < lm.last_mi - 12)
  GROUP BY 1, 2, 3),
cd AS (
  SELECT fd.item, fd.dept, count(DISTINCT fd.prt) AS codes
  FROM full_data fd CROSS JOIN lm
  WHERE (fd.mi >= lm.last_mi - 3 AND fd.mi < lm.last_mi) OR (fd.mi >= lm.last_mi - 15 AND fd.mi < lm.last_mi - 12)
  GROUP BY 1, 2),
w AS (
  SELECT pm.item, pm.dept,
    sum(g)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS gross_now,
    sum(q)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS qty_now,
    sum(g)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS gross_prev,
    sum(q)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS qty_prev,
    sum(net)  FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS net_now,
    sum(net)  FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS net_prev,
    sum(mraw) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS margin_now,
    sum(nc)   FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS net_costed_now,
    sum(mraw) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS margin_prev,
    sum(nc)   FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS net_costed_prev,
    sum(ddays) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS days_now,
    sum(ddays) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS days_prev,
    any_value(cd.codes) AS codes
  FROM pm JOIN cd ON cd.item = pm.item AND cd.dept IS NOT DISTINCT FROM pm.dept
  GROUP BY 1, 2)
SELECT item, dept, round((gross_prev/qty_prev), 2) AS price_yr_ago, round((gross_now/qty_now), 2) AS price_now,
  round(100.0*((gross_now/qty_now) - (gross_prev/qty_prev))/(gross_prev/qty_prev), 1) AS price_chg_pct, round(net_now) AS net_3m,
  round(100.0*((coalesce(qty_now, 0)/greatest(days_now, 1)) - (qty_prev/days_prev))/nullif((qty_prev/days_prev), 0), 1) AS qty_chg_pct, codes
FROM w
WHERE qty_now >= 100 AND qty_prev >= 100 AND net_now > 20000
ORDER BY abs((gross_now/qty_now) - (gross_prev/qty_prev))/(gross_prev/qty_prev)*net_now DESC LIMIT 50`
      }),
      fullData: itemMonthFullData()
    }),
    section({
      id: 'velocity-trend',
      title: 'מגמת כמות מכירה',
      goal: 'Which products are accelerating or fading in units/day — same seasonal-neutral windows, per-product own unit.',
      caveats: 'ירידה יכולה לנבוע מזמינות/מלאי ולא מביקוש; מוצר שלא נמכר כלל בחלון הנוכחי מופיע כ--100%. כמות ביחידת המוצר — בטוח בתוך מוצר בלבד.',
      executiveSummary: querySlot({
        goal: 'Top 8 fading products by revenue-weighted velocity drop — the demand alarm list.',
        widget: { kind: 'hbar', title: 'המוצרים שמאטים — כמות ליום', valueFormat: '%', name: 'item', value: 'qty_chg_pct', highlight: {min: true, note: 'הדעיכה החדה'} },
        sql: `WITH lm AS (SELECT max(mi) AS last_mi FROM full_data),
pm AS (
  SELECT fd.item, fd.dept, fd.mi,
    sum(fd.gross_pos) AS g, sum(fd.qty_pos) AS q, sum(fd.net_raw) AS net,
    sum(fd.margin_ils_raw) AS mraw, sum(fd.net_costed) AS nc,
    bit_count(bit_or(fd.daymask::BIGINT)) AS ddays
  FROM full_data fd CROSS JOIN lm
  WHERE (fd.mi >= lm.last_mi - 3 AND fd.mi < lm.last_mi) OR (fd.mi >= lm.last_mi - 15 AND fd.mi < lm.last_mi - 12)
  GROUP BY 1, 2, 3),
cd AS (
  SELECT fd.item, fd.dept, count(DISTINCT fd.prt) AS codes
  FROM full_data fd CROSS JOIN lm
  WHERE (fd.mi >= lm.last_mi - 3 AND fd.mi < lm.last_mi) OR (fd.mi >= lm.last_mi - 15 AND fd.mi < lm.last_mi - 12)
  GROUP BY 1, 2),
w AS (
  SELECT pm.item, pm.dept,
    sum(g)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS gross_now,
    sum(q)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS qty_now,
    sum(g)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS gross_prev,
    sum(q)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS qty_prev,
    sum(net)  FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS net_now,
    sum(net)  FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS net_prev,
    sum(ddays) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS days_now,
    sum(ddays) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS days_prev,
    any_value(cd.codes) AS codes
  FROM pm JOIN cd ON cd.item = pm.item AND cd.dept IS NOT DISTINCT FROM pm.dept
  GROUP BY 1, 2)
SELECT item, dept, round((qty_prev/days_prev), 1) AS qty_per_day_yr_ago, round((coalesce(qty_now, 0)/greatest(days_now, 1)), 1) AS qty_per_day_now,
  round(100.0*((coalesce(qty_now, 0)/greatest(days_now, 1)) - (qty_prev/days_prev))/(qty_prev/days_prev), 1) AS qty_chg_pct, round(coalesce(net_now, 0)) AS net_3m
FROM w
WHERE qty_prev >= 100 AND days_prev >= 20
ORDER BY ((qty_prev/days_prev) - (coalesce(qty_now, 0)/greatest(days_now, 1)))/(qty_prev/days_prev)*(coalesce(net_now, 0) + coalesce(net_prev, 0)) DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 velocity movers both directions (weighted by revenue at stake).',
        widget: { kind: 'table', title: 'תזוזות קצב מכירה — שנה מול שנה', columns: [{key: 'item', label: 'פריט'}, {key: 'dept', label: 'מחלקה'}, {key: 'qty_per_day_yr_ago', label: 'כמות/יום אשתקד'}, {key: 'qty_per_day_now', label: 'כמות/יום עכשיו'}, {key: 'qty_chg_pct', label: 'שינוי', format: '%'}, {key: 'net_3m', label: 'מחזור 3 חודשים', format: '₪'}] },
        sql: `WITH lm AS (SELECT max(mi) AS last_mi FROM full_data),
pm AS (
  SELECT fd.item, fd.dept, fd.mi,
    sum(fd.gross_pos) AS g, sum(fd.qty_pos) AS q, sum(fd.net_raw) AS net,
    sum(fd.margin_ils_raw) AS mraw, sum(fd.net_costed) AS nc,
    bit_count(bit_or(fd.daymask::BIGINT)) AS ddays
  FROM full_data fd CROSS JOIN lm
  WHERE (fd.mi >= lm.last_mi - 3 AND fd.mi < lm.last_mi) OR (fd.mi >= lm.last_mi - 15 AND fd.mi < lm.last_mi - 12)
  GROUP BY 1, 2, 3),
cd AS (
  SELECT fd.item, fd.dept, count(DISTINCT fd.prt) AS codes
  FROM full_data fd CROSS JOIN lm
  WHERE (fd.mi >= lm.last_mi - 3 AND fd.mi < lm.last_mi) OR (fd.mi >= lm.last_mi - 15 AND fd.mi < lm.last_mi - 12)
  GROUP BY 1, 2),
w AS (
  SELECT pm.item, pm.dept,
    sum(g)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS gross_now,
    sum(q)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS qty_now,
    sum(g)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS gross_prev,
    sum(q)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS qty_prev,
    sum(net)  FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS net_now,
    sum(net)  FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS net_prev,
    sum(ddays) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS days_now,
    sum(ddays) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS days_prev,
    any_value(cd.codes) AS codes
  FROM pm JOIN cd ON cd.item = pm.item AND cd.dept IS NOT DISTINCT FROM pm.dept
  GROUP BY 1, 2)
SELECT item, dept, round((qty_prev/days_prev), 1) AS qty_per_day_yr_ago, round((coalesce(qty_now, 0)/greatest(days_now, 1)), 1) AS qty_per_day_now,
  round(100.0*((coalesce(qty_now, 0)/greatest(days_now, 1)) - (qty_prev/days_prev))/(qty_prev/days_prev), 1) AS qty_chg_pct, round(coalesce(net_now, 0)) AS net_3m
FROM w
WHERE qty_prev >= 100 AND days_prev >= 20
ORDER BY abs((coalesce(qty_now, 0)/greatest(days_now, 1)) - (qty_prev/days_prev))/(qty_prev/days_prev)*(coalesce(net_now, 0) + coalesce(net_prev, 0)) DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Top 50 velocity movers with the price move alongside — was the demand shift price-driven.',
        widget: { kind: 'table', title: 'כמות מול מחיר — מה הזיז את הביקוש', columns: [{key: 'item', label: 'פריט'}, {key: 'qty_chg_pct', label: 'שינוי כמות', format: '%'}, {key: 'price_chg_pct', label: 'שינוי מחיר', format: '%'}, {key: 'qty_per_day_now', label: 'כמות/יום'}, {key: 'net_3m', label: 'מחזור 3 חודשים', format: '₪'}] },
        sql: `WITH lm AS (SELECT max(mi) AS last_mi FROM full_data),
pm AS (
  SELECT fd.item, fd.dept, fd.mi,
    sum(fd.gross_pos) AS g, sum(fd.qty_pos) AS q, sum(fd.net_raw) AS net,
    sum(fd.margin_ils_raw) AS mraw, sum(fd.net_costed) AS nc,
    bit_count(bit_or(fd.daymask::BIGINT)) AS ddays
  FROM full_data fd CROSS JOIN lm
  WHERE (fd.mi >= lm.last_mi - 3 AND fd.mi < lm.last_mi) OR (fd.mi >= lm.last_mi - 15 AND fd.mi < lm.last_mi - 12)
  GROUP BY 1, 2, 3),
cd AS (
  SELECT fd.item, fd.dept, count(DISTINCT fd.prt) AS codes
  FROM full_data fd CROSS JOIN lm
  WHERE (fd.mi >= lm.last_mi - 3 AND fd.mi < lm.last_mi) OR (fd.mi >= lm.last_mi - 15 AND fd.mi < lm.last_mi - 12)
  GROUP BY 1, 2),
w AS (
  SELECT pm.item, pm.dept,
    sum(g)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS gross_now,
    sum(q)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS qty_now,
    sum(g)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS gross_prev,
    sum(q)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS qty_prev,
    sum(net)  FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS net_now,
    sum(net)  FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS net_prev,
    sum(ddays) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS days_now,
    sum(ddays) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS days_prev,
    any_value(cd.codes) AS codes
  FROM pm JOIN cd ON cd.item = pm.item AND cd.dept IS NOT DISTINCT FROM pm.dept
  GROUP BY 1, 2)
SELECT item, dept, round((qty_prev/days_prev), 1) AS qty_per_day_yr_ago, round((coalesce(qty_now, 0)/greatest(days_now, 1)), 1) AS qty_per_day_now,
  round(100.0*((coalesce(qty_now, 0)/greatest(days_now, 1)) - (qty_prev/days_prev))/(qty_prev/days_prev), 1) AS qty_chg_pct, round(coalesce(net_now, 0)) AS net_3m,
  round(100.0*((gross_now/qty_now) - (gross_prev/qty_prev))/nullif((gross_prev/qty_prev), 0), 1) AS price_chg_pct, codes
FROM w
WHERE qty_prev >= 100 AND days_prev >= 20
ORDER BY abs((coalesce(qty_now, 0)/greatest(days_now, 1)) - (qty_prev/days_prev))/(qty_prev/days_prev)*(coalesce(net_now, 0) + coalesce(net_prev, 0)) DESC LIMIT 50`
      }),
      fullData: itemMonthFullData()
    }),
    section({
      id: 'margin-trend',
      title: 'מגמת מרווח פריט',
      goal: 'Products whose margin % moved most between the two windows — at static latest cost, so the move reflects paid-price/mix shifts, not supplier cost history.',
      caveats: 'עלות סטטית (האחרונה הידועה) — שחיקה כאן = ירידת מחיר ממוצע ששולם (מבצעים/הנחות/תמהיל), לא התייקרות ספק. להתייקרות ספק: suppliers/cost-increases.',
      executiveSummary: querySlot({
        goal: 'Top 8 margin-eroding products by ppt drop, weighted by costed revenue.',
        widget: { kind: 'hbar', title: 'שחיקת מרווח — פריטים בולטים (נק׳)', name: 'item', value: 'margin_chg_ppt', highlight: {min: true, note: 'השחיקה החדה'} },
        sql: `WITH lm AS (SELECT max(mi) AS last_mi FROM full_data),
pm AS (
  SELECT fd.item, fd.dept, fd.mi,
    sum(fd.gross_pos) AS g, sum(fd.qty_pos) AS q, sum(fd.net_raw) AS net,
    sum(fd.margin_ils_raw) AS mraw, sum(fd.net_costed) AS nc,
    bit_count(bit_or(fd.daymask::BIGINT)) AS ddays
  FROM full_data fd CROSS JOIN lm
  WHERE (fd.mi >= lm.last_mi - 3 AND fd.mi < lm.last_mi) OR (fd.mi >= lm.last_mi - 15 AND fd.mi < lm.last_mi - 12)
  GROUP BY 1, 2, 3),
cd AS (
  SELECT fd.item, fd.dept, count(DISTINCT fd.prt) AS codes
  FROM full_data fd CROSS JOIN lm
  WHERE (fd.mi >= lm.last_mi - 3 AND fd.mi < lm.last_mi) OR (fd.mi >= lm.last_mi - 15 AND fd.mi < lm.last_mi - 12)
  GROUP BY 1, 2),
w AS (
  SELECT pm.item, pm.dept,
    sum(g)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS gross_now,
    sum(q)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS qty_now,
    sum(g)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS gross_prev,
    sum(q)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS qty_prev,
    sum(net)  FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS net_now,
    sum(net)  FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS net_prev,
    sum(mraw) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS margin_now,
    sum(nc)   FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS net_costed_now,
    sum(mraw) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS margin_prev,
    sum(nc)   FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS net_costed_prev,
    sum(ddays) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS days_now,
    sum(ddays) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS days_prev,
    any_value(cd.codes) AS codes
  FROM pm JOIN cd ON cd.item = pm.item AND cd.dept IS NOT DISTINCT FROM pm.dept
  GROUP BY 1, 2)
SELECT item, dept, round(100.0*margin_prev/net_costed_prev, 1) AS margin_yr_ago_pct, round(100.0*margin_now/net_costed_now, 1) AS margin_now_pct,
  round(100.0*margin_now/net_costed_now - 100.0*margin_prev/net_costed_prev, 1) AS margin_chg_ppt, round(net_now) AS net_3m
FROM w
WHERE net_costed_now > 20000 AND net_costed_prev > 20000
ORDER BY (margin_prev/net_costed_prev - margin_now/net_costed_now)*net_costed_now DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 margin movers both directions with before/after margin %.',
        widget: { kind: 'table', title: 'תזוזות מרווח — שנה מול שנה', columns: [{key: 'item', label: 'פריט'}, {key: 'dept', label: 'מחלקה'}, {key: 'margin_yr_ago_pct', label: 'מרווח אשתקד', format: '%'}, {key: 'margin_now_pct', label: 'מרווח עכשיו', format: '%'}, {key: 'margin_chg_ppt', label: 'שינוי (נק׳)'}, {key: 'net_3m', label: 'מחזור 3 חודשים', format: '₪'}] },
        sql: `WITH lm AS (SELECT max(mi) AS last_mi FROM full_data),
pm AS (
  SELECT fd.item, fd.dept, fd.mi,
    sum(fd.gross_pos) AS g, sum(fd.qty_pos) AS q, sum(fd.net_raw) AS net,
    sum(fd.margin_ils_raw) AS mraw, sum(fd.net_costed) AS nc,
    bit_count(bit_or(fd.daymask::BIGINT)) AS ddays
  FROM full_data fd CROSS JOIN lm
  WHERE (fd.mi >= lm.last_mi - 3 AND fd.mi < lm.last_mi) OR (fd.mi >= lm.last_mi - 15 AND fd.mi < lm.last_mi - 12)
  GROUP BY 1, 2, 3),
cd AS (
  SELECT fd.item, fd.dept, count(DISTINCT fd.prt) AS codes
  FROM full_data fd CROSS JOIN lm
  WHERE (fd.mi >= lm.last_mi - 3 AND fd.mi < lm.last_mi) OR (fd.mi >= lm.last_mi - 15 AND fd.mi < lm.last_mi - 12)
  GROUP BY 1, 2),
w AS (
  SELECT pm.item, pm.dept,
    sum(g)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS gross_now,
    sum(q)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS qty_now,
    sum(g)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS gross_prev,
    sum(q)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS qty_prev,
    sum(net)  FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS net_now,
    sum(net)  FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS net_prev,
    sum(mraw) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS margin_now,
    sum(nc)   FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS net_costed_now,
    sum(mraw) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS margin_prev,
    sum(nc)   FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS net_costed_prev,
    sum(ddays) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS days_now,
    sum(ddays) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS days_prev,
    any_value(cd.codes) AS codes
  FROM pm JOIN cd ON cd.item = pm.item AND cd.dept IS NOT DISTINCT FROM pm.dept
  GROUP BY 1, 2)
SELECT item, dept, round(100.0*margin_prev/net_costed_prev, 1) AS margin_yr_ago_pct, round(100.0*margin_now/net_costed_now, 1) AS margin_now_pct,
  round(100.0*margin_now/net_costed_now - 100.0*margin_prev/net_costed_prev, 1) AS margin_chg_ppt, round(net_now) AS net_3m
FROM w
WHERE net_costed_now > 20000 AND net_costed_prev > 20000
ORDER BY abs(margin_now/net_costed_now - margin_prev/net_costed_prev)*net_costed_now DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Top 50 margin movers decomposed: price move and volume move alongside the margin move.',
        widget: { kind: 'table', title: 'פירוק תזוזת המרווח', columns: [{key: 'item', label: 'פריט'}, {key: 'margin_chg_ppt', label: 'שינוי מרווח (נק׳)'}, {key: 'price_chg_pct', label: 'שינוי מחיר', format: '%'}, {key: 'qty_chg_pct', label: 'שינוי כמות', format: '%'}, {key: 'net_3m', label: 'מחזור 3 חודשים', format: '₪'}] },
        sql: `WITH lm AS (SELECT max(mi) AS last_mi FROM full_data),
pm AS (
  SELECT fd.item, fd.dept, fd.mi,
    sum(fd.gross_pos) AS g, sum(fd.qty_pos) AS q, sum(fd.net_raw) AS net,
    sum(fd.margin_ils_raw) AS mraw, sum(fd.net_costed) AS nc,
    bit_count(bit_or(fd.daymask::BIGINT)) AS ddays
  FROM full_data fd CROSS JOIN lm
  WHERE (fd.mi >= lm.last_mi - 3 AND fd.mi < lm.last_mi) OR (fd.mi >= lm.last_mi - 15 AND fd.mi < lm.last_mi - 12)
  GROUP BY 1, 2, 3),
cd AS (
  SELECT fd.item, fd.dept, count(DISTINCT fd.prt) AS codes
  FROM full_data fd CROSS JOIN lm
  WHERE (fd.mi >= lm.last_mi - 3 AND fd.mi < lm.last_mi) OR (fd.mi >= lm.last_mi - 15 AND fd.mi < lm.last_mi - 12)
  GROUP BY 1, 2),
w AS (
  SELECT pm.item, pm.dept,
    sum(g)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS gross_now,
    sum(q)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS qty_now,
    sum(g)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS gross_prev,
    sum(q)    FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS qty_prev,
    sum(net)  FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS net_now,
    sum(net)  FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS net_prev,
    sum(mraw) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS margin_now,
    sum(nc)   FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS net_costed_now,
    sum(mraw) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS margin_prev,
    sum(nc)   FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS net_costed_prev,
    sum(ddays) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 3  AND mi < (SELECT last_mi FROM lm))      AS days_now,
    sum(ddays) FILTER (WHERE mi >= (SELECT last_mi FROM lm) - 15 AND mi < (SELECT last_mi FROM lm) - 12) AS days_prev,
    any_value(cd.codes) AS codes
  FROM pm JOIN cd ON cd.item = pm.item AND cd.dept IS NOT DISTINCT FROM pm.dept
  GROUP BY 1, 2)
SELECT item, dept, round(100.0*margin_prev/net_costed_prev, 1) AS margin_yr_ago_pct, round(100.0*margin_now/net_costed_now, 1) AS margin_now_pct,
  round(100.0*margin_now/net_costed_now - 100.0*margin_prev/net_costed_prev, 1) AS margin_chg_ppt, round(net_now) AS net_3m,
  round(100.0*((gross_now/qty_now) - (gross_prev/qty_prev))/nullif((gross_prev/qty_prev), 0), 1) AS price_chg_pct,
  round(100.0*((coalesce(qty_now, 0)/greatest(days_now, 1)) - (qty_prev/days_prev))/nullif((qty_prev/days_prev), 0), 1) AS qty_chg_pct, codes
FROM w
WHERE net_costed_now > 20000 AND net_costed_prev > 20000
ORDER BY abs(margin_now/net_costed_now - margin_prev/net_costed_prev)*net_costed_now DESC LIMIT 50`
      }),
      fullData: itemMonthFullData()
    })
  ]
}) })

VerifiedReport('pricing-cost-drift', { impl: verifiedReport({
  title: 'תמחור ועליית עלויות',
  description: 'שינויי עלות ספק מול מחיר מדף (עליות שלא גולגלו), אחידות מחירים בין סניפים על שורות מחיר מלא, והתפלגות עומק ההנחות.',
  whenToUse: 'שאלות תמחור: אילו פריטים ספגו עליית עלות שלא גולגלה, האם סניף מתמחר שונה מהרשת, כמה עמוקות ההנחות ולמי. לניתוח מבצעים ככלי שיווקי השתמש ב-promotions; לגרף מחיר לצרכן של פריט לאורך זמן — item-trends (אין כאן ציר זמן: שני חלונות קצה בלבד).',
  routePhrases: ['תמחור', 'מחיר מדף', 'סחיפת עלויות', 'עליית עלות', 'עלות ספק', 'לא גולגל', 'אחידות מחירים', 'עומק הנחות', 'הנחות'],
  questionsCovered: ['Q13', 'Q27', 'Q28'],
  caveats: `היסטוריית עלויות (DailyPriceCost) מתחילה ב-2025-01 — אין בסיס עלות 2024, לכן "שנה אחרונה" של עלות היא בפועל חלון ההיסטוריה הזמין. חלונות בסיס/עכשיו נגזרים דינמית מקצוות ההיסטוריה (90 יום ראשונים/אחרונים). ספי הסינון (עלייה ≥10%, מחיר <3%, מחזור ₪30K) הם בחירות אנליסט מתועדות וניתנות לכוונון.`,
  executiveSummary: querySlot({
    goal: 'Pricing-drift headline: unpassed cost hikes count and exposure, cross-store price dispersion, and average discount depth.',
    widget: { kind: 'kpi', title: 'תמחור — מבט מהיר', items: [{label: 'עליות עלות שלא גולגלו', col: 'unpassed_hike_items', format: 'int'}, {label: 'חשיפה (מ׳ ₪)', col: 'unpassed_net_recent_M'}, {label: 'חציון שינוי עלות', col: 'median_cost_chg_pct', format: '%'}, {label: 'חציון שינוי מחיר', col: 'median_price_chg_pct', format: '%'}] },
    sql: `WITH dpc AS (
  SELECT ItemID, make_date(DateDoc//10000, (DateDoc//100)%100, DateDoc%100) AS d, FinalRegularCostPrice AS c
  FROM ${DPC} WHERE FinalRegularCostPrice > 0 AND FinalRegularCostSource <> 'No Cost'),
bounds AS (SELECT min(d) AS mn, max(d) AS mx FROM dpc),
ic AS (
  SELECT ItemID,
    avg(c) FILTER (WHERE d < (SELECT mn FROM bounds) + 90) AS cost_base,
    avg(c) FILTER (WHERE d >= (SELECT mx FROM bounds) - 90) AS cost_now
  FROM dpc GROUP BY 1),
pxb AS (
  SELECT l.PrtC AS prt,
    sum(${NET}) FILTER (WHERE h.dd >= (SELECT mn FROM bounds) AND h.dd < (SELECT mn FROM bounds) + 90) AS gross_base,
    sum(l.Cmt) FILTER (WHERE h.dd >= (SELECT mn FROM bounds) AND h.dd < (SELECT mn FROM bounds) + 90) AS qty_base
  FROM ${L} l
  JOIN (SELECT C, DateDoc::DATE AS dd FROM ${H} WHERE DateDoc::DATE >= (SELECT mn FROM bounds) AND DateDoc::DATE < (SELECT mn FROM bounds) + 90) h ON l.KupaDocC = h.C
  WHERE l.Cmt > 0
    AND l.KupaDocC >= (SELECT min(C) FROM ${H} WHERE DateDoc::DATE >= (SELECT mn FROM bounds))
    AND l.KupaDocC <= (SELECT max(C) FROM ${H} WHERE DateDoc::DATE >= (SELECT mn FROM bounds) AND DateDoc::DATE < (SELECT mn FROM bounds) + 90)
  GROUP BY 1),
pxr AS (
  SELECT l.PrtC AS prt,
    sum(${NET}) FILTER (WHERE h.dd >= (SELECT mx FROM bounds) - 90) AS gross_now,
    sum(l.Cmt) FILTER (WHERE h.dd >= (SELECT mx FROM bounds) - 90) AS qty_now,
    sum(${NET}) FILTER (WHERE h.dd >= (SELECT mx FROM bounds) - 180) AS net_recent
  FROM ${L} l
  JOIN (SELECT C, DateDoc::DATE AS dd FROM ${H} WHERE DateDoc::DATE >= (SELECT mx FROM bounds) - 180) h ON l.KupaDocC = h.C
  WHERE l.Cmt > 0
    AND l.KupaDocC >= (SELECT min(C) FROM ${H} WHERE DateDoc::DATE >= (SELECT mx FROM bounds) - 180)
  GROUP BY 1),
px AS (
  SELECT coalesce(pxb.prt, pxr.prt) AS prt,
    pxb.gross_base/nullif(pxb.qty_base, 0) AS px_base,
    pxr.gross_now/nullif(pxr.qty_now, 0) AS px_now,
    pxr.net_recent AS net_recent
  FROM pxb FULL JOIN pxr ON pxb.prt = pxr.prt),
flagged AS (
  SELECT ic.ItemID, 100.0*(ic.cost_now - ic.cost_base)/ic.cost_base AS cost_chg_pct,
    100.0*(px.px_now - px.px_base)/px.px_base AS price_chg_pct, px.net_recent
  FROM ic JOIN px ON px.prt = ic.ItemID
  WHERE ic.cost_base > 0 AND ic.cost_now > 0 AND px.px_base > 0 AND px.px_now > 0)
SELECT count(*) FILTER (WHERE cost_chg_pct >= 10 AND price_chg_pct < 3 AND net_recent > 30000) AS unpassed_hike_items,
  round(sum(net_recent) FILTER (WHERE cost_chg_pct >= 10 AND price_chg_pct < 3 AND net_recent > 30000)/1e6, 2) AS unpassed_net_recent_M,
  round(median(cost_chg_pct), 1) AS median_cost_chg_pct,
  round(median(price_chg_pct), 1) AS median_price_chg_pct
FROM flagged LIMIT 1`
  }),
  summary: querySlot({
    goal: 'Top unpassed cost hikes: cost up materially while shelf price stayed flat, ranked by exposure (recent revenue × cost change).',
    widget: { kind: 'scatter', title: 'שינוי עלות מול שינוי מחיר מדף', valueFormat: '%', x: 'cost_chg_pct', y: 'price_chg_pct', name: 'item', xLabel: 'שינוי עלות (%)', yLabel: 'שינוי מחיר (%)' },
    sql: `WITH dpc AS (
  SELECT ItemID, make_date(DateDoc//10000, (DateDoc//100)%100, DateDoc%100) AS d, FinalRegularCostPrice AS c
  FROM ${DPC} WHERE FinalRegularCostPrice > 0 AND FinalRegularCostSource <> 'No Cost'),
bounds AS (SELECT min(d) AS mn, max(d) AS mx FROM dpc),
ic AS (
  SELECT ItemID,
    avg(c) FILTER (WHERE d < (SELECT mn FROM bounds) + 90) AS cost_base,
    avg(c) FILTER (WHERE d >= (SELECT mx FROM bounds) - 90) AS cost_now
  FROM dpc GROUP BY 1),
hik AS (SELECT ItemID, cost_base, cost_now FROM ic WHERE cost_base > 0 AND cost_now > 0 AND (cost_now - cost_base)/cost_base >= 0.10),
hdr AS (
  SELECT C, DateDoc::DATE AS dd FROM ${H}
  WHERE (DateDoc::DATE >= (SELECT mn FROM bounds) AND DateDoc::DATE < (SELECT mn FROM bounds) + 90)
     OR DateDoc::DATE >= (SELECT mx FROM bounds) - 180),
px AS (
  SELECT l.PrtC AS prt,
    sum(${NET}) FILTER (WHERE h.dd < (SELECT mn FROM bounds) + 90 AND h.dd >= (SELECT mn FROM bounds))
      /nullif(sum(l.Cmt) FILTER (WHERE h.dd < (SELECT mn FROM bounds) + 90 AND h.dd >= (SELECT mn FROM bounds)), 0) AS px_base,
    sum(${NET}) FILTER (WHERE h.dd >= (SELECT mx FROM bounds) - 90)
      /nullif(sum(l.Cmt) FILTER (WHERE h.dd >= (SELECT mx FROM bounds) - 90), 0) AS px_now,
    sum(${NET}) FILTER (WHERE h.dd >= (SELECT mx FROM bounds) - 180) AS net_recent
  FROM ${L} l JOIN hdr h ON l.KupaDocC = h.C
  WHERE l.Cmt > 0 AND l.PrtC IN (SELECT ItemID FROM hik)
    AND l.KupaDocC >= (SELECT min(C) FROM ${H} WHERE DateDoc::DATE >= (SELECT mn FROM bounds)) GROUP BY 1)
SELECT hik.ItemID AS prt, trim(p.Nm) AS item,
  round(hik.cost_base, 2) AS cost_base, round(hik.cost_now, 2) AS cost_now,
  round(100.0*(hik.cost_now - hik.cost_base)/hik.cost_base, 1) AS cost_chg_pct,
  round(100.0*(px.px_now - px.px_base)/px.px_base, 1) AS price_chg_pct,
  round(px.net_recent) AS net_recent_6m
FROM hik JOIN px ON px.prt = hik.ItemID JOIN ${PRT} p ON p.C = hik.ItemID
WHERE px.px_base > 0 AND px.px_now > 0
  AND (px.px_now - px.px_base)/px.px_base < 0.03
  AND px.net_recent > 30000
ORDER BY px.net_recent*((hik.cost_now - hik.cost_base)/hik.cost_base) DESC LIMIT 25`
  }),
  sections: [
    section({
      id: 'cost-creep',
      title: 'עליית עלות מול מחיר מדף',
      goal: 'Items whose supplier cost rose but shelf price did not follow — the unpassed-hike margin squeeze list.',
      caveats: 'עלות בסיס = ממוצע 90 הימים הראשונים של היסטוריית העלויות; עלות נוכחית = 90 הימים האחרונים. מחיר = מחיר יחידה נטו (נטו/כמות) באותם חלונות. השוואה בתוך פריט — בטוחה ליחידות ק"ג/יח.',
      executiveSummary: querySlot({
        goal: 'Top 8 unpassed cost hikes by exposure.',
        widget: { kind: 'groupedBar', title: 'עלות עלתה, המחיר לא זז', valueFormat: '%', category: 'item', ys: [{col: 'cost_chg_pct', label: 'שינוי עלות'}, {col: 'price_chg_pct', label: 'שינוי מחיר'}] },
        sql: `SELECT prt, item,
  round(cost_chg_pct, 1) AS cost_chg_pct,
  round(price_chg_pct, 1) AS price_chg_pct,
  round(net_recent_6m) AS net_recent_6m
FROM full_data
WHERE cost_chg_pct >= 10 AND price_chg_pct < 3 AND net_recent_6m > 30000
ORDER BY net_recent_6m*(cost_chg_pct/100.0) DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 unpassed cost hikes with base/now costs and prices.',
        widget: { kind: 'table', title: 'עליות עלות שלא גולגלו', columns: [{key: 'item', label: 'פריט'}, {key: 'cost_base', label: 'עלות בסיס', format: '₪'}, {key: 'cost_now', label: 'עלות כיום', format: '₪'}, {key: 'cost_chg_pct', label: 'שינוי עלות', format: '%'}, {key: 'price_chg_pct', label: 'שינוי מחיר', format: '%'}, {key: 'net_recent_6m', label: 'מחזור 6 חודשים', format: '₪'}] },
        sql: `SELECT prt, item,
  round(cost_base, 2) AS cost_base, round(cost_now, 2) AS cost_now,
  round(cost_chg_pct, 1) AS cost_chg_pct,
  round(price_base, 2) AS price_base, round(price_now, 2) AS price_now,
  round(price_chg_pct, 1) AS price_chg_pct,
  round(net_recent_6m) AS net_recent_6m
FROM full_data
WHERE cost_chg_pct >= 10 AND price_chg_pct < 3 AND net_recent_6m > 30000
ORDER BY net_recent_6m*(cost_chg_pct/100.0) DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Wider cost-vs-price screen (cost up >=5%, pass-through below half the cost move) with supplier context and pass-through ratio.',
        widget: { kind: 'table', title: 'מסך רחב — גלגול עלויות', columns: [{key: 'item', label: 'פריט'}, {key: 'supplier', label: 'ספק'}, {key: 'cost_chg_pct', label: 'שינוי עלות', format: '%'}, {key: 'price_chg_pct', label: 'שינוי מחיר', format: '%'}, {key: 'pass_through_pct', label: 'גלגול', format: '%'}, {key: 'net_recent_6m', label: 'מחזור 6 חודשים', format: '₪'}] },
        sql: `SELECT prt, item, supplier,
  round(cost_chg_pct, 1) AS cost_chg_pct,
  round(price_chg_pct, 1) AS price_chg_pct,
  round(pass_through_pct) AS pass_through_pct,
  round(net_recent_6m) AS net_recent_6m
FROM full_data
WHERE cost_chg_pct >= 5 AND price_chg_pct < 0.5*cost_chg_pct AND net_recent_6m > 20000
ORDER BY net_recent_6m*(cost_chg_pct/100.0) DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Item-level cost vs shelf-price movement between the two edge windows of the available cost history — no thresholds applied.',
        grain: 'one row per item with cost in both windows and sales in both windows (~10-20K rows)',
        columns: 'prt, item, supplier, cost_base, cost_now, cost_chg_pct, price_base, price_now, price_chg_pct, pass_through_pct, net_recent_6m',
        perItemOnly: 'cost_base,cost_now,price_base,price_now',
        viewSql: `WITH dpc AS (
  SELECT ItemID, make_date(DateDoc//10000, (DateDoc//100)%100, DateDoc%100) AS d, FinalRegularCostPrice AS c
  FROM ${DPC} WHERE FinalRegularCostPrice > 0 AND FinalRegularCostSource <> 'No Cost'),
bounds AS (SELECT min(d) AS mn, max(d) AS mx FROM dpc),
ic AS (
  SELECT ItemID,
    avg(c) FILTER (WHERE d < (SELECT mn FROM bounds) + 90) AS cost_base,
    avg(c) FILTER (WHERE d >= (SELECT mx FROM bounds) - 90) AS cost_now
  FROM dpc GROUP BY 1),
hdr AS (
  SELECT C, DateDoc::DATE AS dd FROM ${H}
  WHERE (DateDoc::DATE >= (SELECT mn FROM bounds) AND DateDoc::DATE < (SELECT mn FROM bounds) + 90)
     OR DateDoc::DATE >= (SELECT mx FROM bounds) - 180),
px AS (
  SELECT l.PrtC AS prt,
    sum(${NET}) FILTER (WHERE h.dd < (SELECT mn FROM bounds) + 90 AND h.dd >= (SELECT mn FROM bounds))
      /nullif(sum(l.Cmt) FILTER (WHERE h.dd < (SELECT mn FROM bounds) + 90 AND h.dd >= (SELECT mn FROM bounds)), 0) AS px_base,
    sum(${NET}) FILTER (WHERE h.dd >= (SELECT mx FROM bounds) - 90)
      /nullif(sum(l.Cmt) FILTER (WHERE h.dd >= (SELECT mx FROM bounds) - 90), 0) AS px_now,
    sum(${NET}) FILTER (WHERE h.dd >= (SELECT mx FROM bounds) - 180) AS net_recent
  FROM ${L} l JOIN hdr h ON l.KupaDocC = h.C
  WHERE l.Cmt > 0 AND l.KupaDocC >= (SELECT min(C) FROM ${H} WHERE DateDoc::DATE >= (SELECT mn FROM bounds)) GROUP BY 1)
SELECT ic.ItemID AS prt, trim(p.Nm) AS item, trim(sup.Nm) AS supplier,
  round(ic.cost_base, 3) AS cost_base, round(ic.cost_now, 3) AS cost_now,
  round(100.0*(ic.cost_now - ic.cost_base)/ic.cost_base, 2) AS cost_chg_pct,
  round(px.px_base, 3) AS price_base, round(px.px_now, 3) AS price_now,
  round(100.0*(px.px_now - px.px_base)/px.px_base, 2) AS price_chg_pct,
  round(100.0*((px.px_now - px.px_base)/px.px_base)/nullif((ic.cost_now - ic.cost_base)/ic.cost_base, 0), 0) AS pass_through_pct,
  round(px.net_recent, 1) AS net_recent_6m
FROM ic JOIN px ON px.prt = ic.ItemID
JOIN ${PRT} p ON p.C = ic.ItemID
LEFT JOIN ${SUP} sup ON sup.C = p.Spk
WHERE ic.cost_base > 0 AND ic.cost_now > 0 AND px.px_base > 0 AND px.px_now > 0`
      })
    }),
    section({
      id: 'price-consistency',
      title: 'אחידות מחירים בין סניפים',
      goal: 'Are shelf prices uniform across branches? Revenue-weighted systematic deviation per store vs each item cross-store median, FULL-PRICE lines only.',
      caveats: 'מחיר מלא = MivzaNo=0 וגם AczDisLine=0 (שורות עם sentinel -99900 מוחרגות — עומק לא ידוע). פריט נמדד רק אם נמכר במחיר מלא ב-8+ סניפים עם 20+ יחידות; חריגות |סטייה|>100% מסוננות כשגיאות נתונים. ידוע: סניף בר כוכבא מוזיל פירות/ירקות באופן שיטתי.',
      executiveSummary: querySlot({
        goal: 'Stores ranked by absolute systematic price deviation from the chain median (2025+, established stores).',
        widget: { kind: 'hbar', title: 'סטייה שיטתית מחציון המחיר הרשתי', valueFormat: '%', name: 'branch', value: 'systematic_dev_pct' },
        sql: `SELECT branch,
  round(sum(dev_pct/100.0*net)/sum(net)*100.0, 2) AS systematic_dev_pct,
  round(100.0*sum(CASE WHEN abs(dev_pct) > 3 THEN net ELSE 0 END)/sum(net), 0) AS rev_share_off_median_pct
FROM full_data
WHERE abs(dev_pct) < 100
GROUP BY branch
ORDER BY abs(sum(dev_pct/100.0*net)/sum(net)) DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'All established stores: systematic deviation and the revenue share priced >3% off the item median.',
        widget: { kind: 'table', title: 'אחידות מחירים לפי סניף', columns: [{key: 'branch', label: 'סניף'}, {key: 'systematic_dev_pct', label: 'סטייה שיטתית', format: '%'}, {key: 'rev_share_off_median_pct', label: 'הכנסה מעל 3% סטייה', format: '%'}, {key: 'fullprice_net_M', label: 'נטו מחיר מלא (מ׳ ₪)'}] },
        sql: `SELECT branch,
  round(sum(dev_pct/100.0*net)/sum(net)*100.0, 2) AS systematic_dev_pct,
  round(100.0*sum(CASE WHEN abs(dev_pct) > 3 THEN net ELSE 0 END)/sum(net), 0) AS rev_share_off_median_pct,
  round(sum(net)/1e6, 1) AS fullprice_net_M
FROM full_data
WHERE abs(dev_pct) < 100
GROUP BY branch
ORDER BY systematic_dev_pct ASC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Largest single item×store price gaps vs the item cross-store median, by absolute revenue impact — the concrete repricing list.',
        widget: { kind: 'table', title: 'פערי מחיר לתיקון — פריט × סניף', columns: [{key: 'item', label: 'פריט'}, {key: 'branch', label: 'סניף'}, {key: 'unit_price', label: 'מחיר בסניף', format: '₪'}, {key: 'cross_store_median', label: 'חציון רשתי', format: '₪'}, {key: 'dev_pct', label: 'סטייה', format: '%'}, {key: 'rev_impact_ils', label: 'השפעה', format: '₪'}] },
        sql: `WITH est AS (
  SELECT h.StoreC AS store_c FROM ${SALES} GROUP BY 1 HAVING sum(${NET}) > 10000000),
ps AS (
  SELECT l.PrtC AS prt, h.StoreC AS store_c, sum(${NET})/sum(l.Cmt) AS unit_price,
    sum(${NET}) AS net, sum(l.Cmt) AS qty
  FROM ${SALES}
  WHERE h.DateDoc >= DATE '2025-01-01' AND ${FULL_PRICE} AND l.Cmt > 0
    AND h.StoreC IN (SELECT store_c FROM est)
  GROUP BY 1, 2 HAVING sum(l.Cmt) >= 100 AND sum(${NET})/sum(l.Cmt) > 0),
med AS (SELECT prt, median(unit_price) AS med_price FROM ps GROUP BY 1 HAVING count(*) >= 8 AND median(unit_price) > 0)
SELECT ps.prt, trim(p.Nm) AS item, trim(s.Nm) AS branch,
  round(ps.unit_price, 2) AS unit_price, round(med.med_price, 2) AS cross_store_median,
  round(100.0*(ps.unit_price - med.med_price)/med.med_price, 1) AS dev_pct,
  round((ps.unit_price - med.med_price)*ps.qty) AS rev_impact_ils
FROM ps JOIN med USING (prt)
JOIN ${PRT} p ON p.C = ps.prt
JOIN ${STORE} s ON s.C = ps.store_c
WHERE abs((ps.unit_price - med.med_price)/med.med_price) BETWEEN 0.05 AND 1
ORDER BY abs((ps.unit_price - med.med_price)*ps.qty) DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Full-price unit price per item×store vs the item cross-store median (2025+), for any price-uniformity analysis.',
        grain: 'one row per (item, store) with >=20 full-price units and an item median over >=8 stores (~100K rows)',
        columns: 'prt, item, branch_id, branch, unit_price: net per own-unit, cross_store_median, dev_pct, net: full-price net, qty: full-price qty in own unit',
        perItemOnly: 'unit_price,qty',
        viewSql: `WITH est AS (
  SELECT h.StoreC AS store_c FROM ${SALES} GROUP BY 1 HAVING sum(${NET}) > 10000000),
ps AS (
  SELECT l.PrtC AS prt, h.StoreC AS store_c, sum(${NET})/sum(l.Cmt) AS unit_price,
    sum(${NET}) AS net, sum(l.Cmt) AS qty
  FROM ${SALES}
  WHERE h.DateDoc >= DATE '2025-01-01' AND ${FULL_PRICE} AND l.Cmt > 0
    AND h.StoreC IN (SELECT store_c FROM est)
  GROUP BY 1, 2 HAVING sum(l.Cmt) >= 20 AND sum(${NET})/sum(l.Cmt) > 0),
med AS (SELECT prt, median(unit_price) AS med_price FROM ps GROUP BY 1 HAVING count(*) >= 8 AND median(unit_price) > 0)
SELECT ps.prt, trim(p.Nm) AS item, ps.store_c AS branch_id, trim(s.Nm) AS branch,
  round(ps.unit_price, 3) AS unit_price, round(med.med_price, 3) AS cross_store_median,
  round(100.0*(ps.unit_price - med.med_price)/med.med_price, 2) AS dev_pct,
  round(ps.net, 1) AS net, round(ps.qty, 1) AS qty
FROM ps JOIN med USING (prt)
JOIN ${PRT} p ON p.C = ps.prt
JOIN ${STORE} s ON s.C = ps.store_c`
      })
    }),
    section({
      id: 'discount-depth',
      title: 'עומק הנחות',
      goal: 'Distribution of discount depth, weighted depth per department, and the deepest material item discounts with a margin verdict.',
      caveats: 'עומק = AczDisLine נקי (BETWEEN 0.001 AND 100; sentinel -99900 מוחרג). ממוצע משוקלל-הכנסה, לעולם לא סכום. פריטים חינמיים (עומק 100%) הם מתנות מבצע אמיתיות ונכללים.',
      executiveSummary: querySlot({
        goal: 'Discount-depth distribution: revenue in each depth bucket (2024+).',
        widget: { kind: 'bar', title: 'הכנסה מהונחת לפי עומק הנחה (מ׳ ₪)', name: 'depth_bucket', value: 'disc_net_M' },
        sql: `SELECT CASE
    WHEN l.AczDisLine < 5 THEN 'a_0-5%'
    WHEN l.AczDisLine < 10 THEN 'b_5-10%'
    WHEN l.AczDisLine < 20 THEN 'c_10-20%'
    WHEN l.AczDisLine < 30 THEN 'd_20-30%'
    WHEN l.AczDisLine < 50 THEN 'e_30-50%'
    ELSE 'f_50-100%' END AS depth_bucket,
  round(sum(${NET})/1e6, 2) AS disc_net_M,
  round(100.0*sum(${NET})/sum(sum(${NET})) OVER (), 1) AS share_of_disc_net_pct,
  count(DISTINCT l.PrtC) AS items
FROM ${SALES}
WHERE ${DISC}
GROUP BY 1 ORDER BY 1 LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Departments by discounted revenue: weighted depth and the discounted share of each department revenue.',
        widget: { kind: 'hbar', title: 'הכנסה מהונחת לפי מחלקה (מ׳ ₪)', name: 'dept', value: 'disc_net_M' },
        sql: `SELECT trim(dp.Nm) AS dept,
  round(sum(${NET}) FILTER (WHERE ${DISC})/1e6, 2) AS disc_net_M,
  round(sum(l.AczDisLine*${NET}) FILTER (WHERE ${DISC})/nullif(sum(${NET}) FILTER (WHERE ${DISC}), 0), 1) AS depth_wtd_pct,
  round(100.0*sum(${NET}) FILTER (WHERE ${DISC})/nullif(sum(${NET}), 0), 1) AS disc_share_of_dept_pct
FROM ${SALES}
JOIN ${PRT} p ON p.C = l.PrtC
JOIN ${DEPT} dp ON dp.C = p.DepartmentC
GROUP BY 1
HAVING sum(${NET}) FILTER (WHERE ${DISC}) > 100000
ORDER BY disc_net_M DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Deepest-discounted material items (discounted net > 50K, complete cost) with the realized margin ON the discounted lines — justified vs loss-making.',
        widget: { kind: 'table', title: 'ההנחות העמוקות — מוצדק או הפסד', columns: [{key: 'item', label: 'פריט'}, {key: 'depth_pct', label: 'עומק', format: '%'}, {key: 'disc_net_K', label: 'נטו מהונח (אלפי ₪)'}, {key: 'disc_margin_pct', label: 'מרווח בהנחה', format: '%'}, {key: 'verdict', label: 'הכרעה'}] },
        sql: `WITH ${COST_CTE},
d AS (
  SELECT l.PrtC AS prt,
    sum(${NET}) FILTER (WHERE ${DISC}) AS disc_net,
    sum(c.unit_cost*l.Cmt) FILTER (WHERE ${DISC}) AS disc_cogs,
    sum(l.AczDisLine*${NET}) FILTER (WHERE ${DISC})/nullif(sum(${NET}) FILTER (WHERE ${DISC}), 0) AS depth_wtd,
    count(*) FILTER (WHERE ${DISC} AND c.unit_cost IS NULL) AS null_cost_disc_lines
  FROM ${SALES}
  LEFT JOIN cost c ON c.ItemID = l.PrtC AND c.StoreID = h.StoreC
  WHERE l.Cmt > 0 OR NOT (${DISC})
  GROUP BY 1
  HAVING sum(${NET}) FILTER (WHERE ${DISC}) > 50000)
SELECT d.prt, trim(p.Nm) AS item, round(d.depth_wtd, 1) AS depth_pct,
  round(d.disc_net/1e3) AS disc_net_K,
  round(100.0*(d.disc_net - d.disc_cogs)/nullif(d.disc_net, 0), 1) AS disc_margin_pct,
  CASE WHEN (d.disc_net - d.disc_cogs) > 0 THEN 'justified_positive_margin' ELSE 'UNJUSTIFIED_loss' END AS verdict
FROM d JOIN ${PRT} p ON p.C = d.prt
WHERE d.null_cost_disc_lines = 0
ORDER BY d.depth_wtd DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Item-level discount aggregates: discounted revenue, weighted depth, realized discounted margin, and the item full-price revenue for contrast.',
        grain: 'one row per item with discounted sales (~20K rows)',
        columns: 'prt, item, dept, disc_net, depth_wtd_pct, disc_margin_pct (NULL when any discounted line lacks cost), fullprice_net, disc_share_pct',
        viewSql: `WITH ${COST_CTE},
d AS (
  SELECT l.PrtC AS prt,
    sum(${NET}) FILTER (WHERE ${DISC}) AS disc_net,
    sum(c.unit_cost*l.Cmt) FILTER (WHERE ${DISC}) AS disc_cogs,
    sum(l.AczDisLine*${NET}) FILTER (WHERE ${DISC})/nullif(sum(${NET}) FILTER (WHERE ${DISC}), 0) AS depth_wtd,
    count(*) FILTER (WHERE ${DISC} AND c.unit_cost IS NULL) AS null_cost_disc_lines,
    sum(${NET}) FILTER (WHERE ${FULL_PRICE}) AS fullprice_net,
    sum(${NET}) AS net_all
  FROM ${SALES}
  LEFT JOIN cost c ON c.ItemID = l.PrtC AND c.StoreID = h.StoreC
  GROUP BY 1
  HAVING sum(${NET}) FILTER (WHERE ${DISC}) IS NOT NULL)
SELECT d.prt, trim(p.Nm) AS item, trim(dp.Nm) AS dept,
  round(d.disc_net, 1) AS disc_net,
  round(d.depth_wtd, 2) AS depth_wtd_pct,
  CASE WHEN d.null_cost_disc_lines = 0 THEN round(100.0*(d.disc_net - d.disc_cogs)/nullif(d.disc_net, 0), 1) END AS disc_margin_pct,
  round(coalesce(d.fullprice_net, 0), 1) AS fullprice_net,
  round(100.0*d.disc_net/nullif(d.net_all, 0), 1) AS disc_share_pct
FROM d JOIN ${PRT} p ON p.C = d.prt LEFT JOIN ${DEPT} dp ON dp.C = p.DepartmentC`
      })
    })
  ]
}) })

VerifiedReport('promotions', { impl: verifiedReport({
  title: 'מבצעים',
  description: 'אפקטיביות מבצעים: כיסוי המבצעים בהכנסה, מבצעים שהרסו מרווח, uplift כמותי אמיתי מול הנחת מכירות שהיו קורות ממילא, קניבליזציה בתוך קבוצות מוצר, ופריטי חינם.',
  whenToUse: 'שאלות על מבצעים — כמה מההכנסה במבצע, אילו מבצעים עבדו/הרסו מרווח, האם מבצע באמת הגדיל כמות או רק גנב ממוצרים דומים. לעומק הנחות כללי השתמש ב-pricing-cost-drift.',
  routePhrases: ['מבצעים', 'מבצע', 'מבצעים רצים', 'מבצעים פעילים', 'ניתוח מבצעים', 'מבצעי עבר', 'מבצעים היסטוריים', 'רווחיות מבצעים', 'רווחיות של מבצעי עבר', 'הכנסה במבצע', 'הרס מרווח', 'מרווח מבצע', 'uplift', 'קניבליזציה', 'פריטי חינם', 'mivza'],
  questionsCovered: ['Q24', 'Q25', 'Q26', 'Q29'],
  caveats: `אין טבלת אב למבצעים (שמות/תאריכים) — MivzaNo הוא מספר בלבד ותקופת מבצע נגזרת מהופעתו על שורות. Mivza_Prt נדרש חיבור על שני המפתחות (MivzaC וגם PrtC). ניתוחי uplift/קניבליזציה הם אסוציאטיביים — עונתיות יכולה להתחזות ל-uplift. חישובי מרווח מבצע מתחילים ב-2025 (תחילת היסטוריית עלויות).`,
  executiveSummary: querySlot({
    goal: 'Promo headline: promo share of net, weighted depth on promo lines, active promos and promoted items in the latest complete month.',
    widget: { kind: 'kpi', title: 'מבצעים — מבט מהיר', items: [{label: 'נתח מבצעים 2024+', col: 'promo_share_2024plus_pct', format: '%'}, {label: 'עומק משוקלל', col: 'promo_depth_wtd_pct', format: '%'}, {label: 'מבצעים פעילים בחודש', col: 'active_promos_latest_month', format: 'int'}, {label: 'פריטים במבצע', col: 'promoted_items_latest_month', format: 'int'}, {label: 'נתח מבצעים בחודש', col: 'promo_share_latest_month_pct', format: '%'}] },
    sql: `SELECT
  round(100.0*sum(CASE WHEN l.MivzaNo > 0 THEN ${NET} ELSE 0 END)/sum(${NET}), 1) AS promo_share_2024plus_pct,
  round(sum(CASE WHEN l.MivzaNo > 0 AND ${DISC} THEN l.AczDisLine*${NET} END)
    /nullif(sum(${NET}) FILTER (WHERE l.MivzaNo > 0 AND ${DISC}), 0), 1) AS promo_depth_wtd_pct,
  count(DISTINCT l.MivzaNo) FILTER (WHERE l.MivzaNo > 0 AND h.DateDoc >= ${M_START} AND h.DateDoc < ${M_END}) AS active_promos_latest_month,
  count(DISTINCT l.PrtC) FILTER (WHERE l.MivzaNo > 0 AND h.DateDoc >= ${M_START} AND h.DateDoc < ${M_END}) AS promoted_items_latest_month,
  round(100.0*sum(CASE WHEN l.MivzaNo > 0 AND h.DateDoc >= ${M_START} AND h.DateDoc < ${M_END} THEN ${NET} ELSE 0 END)
    /nullif(sum(CASE WHEN h.DateDoc >= ${M_START} AND h.DateDoc < ${M_END} THEN ${NET} ELSE 0 END), 0), 1) AS promo_share_latest_month_pct
FROM ${SALES}
LIMIT 1`
  }),
  summary: querySlot({
    goal: 'Quarterly trend: discounted revenue share, formal promo share, and weighted average depth — is discounting intensifying.',
    widget: { kind: 'line', title: 'נתח מבצעים רבעוני לפי שנה', valueFormat: '%', x: 'q', y: 'formal_promo_share_pct', seriesBy: 'yr' },
    sql: `SELECT year(h.DateDoc) AS yr, quarter(h.DateDoc) AS q,
  round(sum(${NET})/1e6, 2) AS net_M,
  round(100.0*sum(CASE WHEN ${DISC} THEN ${NET} ELSE 0 END)/sum(${NET}), 1) AS disc_rev_share_pct,
  round(100.0*sum(CASE WHEN l.MivzaNo > 0 THEN ${NET} ELSE 0 END)/sum(${NET}), 1) AS formal_promo_share_pct,
  round(sum(CASE WHEN ${DISC} THEN l.AczDisLine*${NET} END)
    /nullif(sum(${NET}) FILTER (WHERE ${DISC}), 0), 1) AS avg_depth_pct
FROM ${SALES}
GROUP BY 1, 2 ORDER BY 1, 2 LIMIT 25`
  }),
  sections: [
    section({
      id: 'coverage',
      title: 'כיסוי מבצעים בהכנסה',
      goal: 'How much revenue is sold on formal promo vs manual discount vs full price, and per department.',
      executiveSummary: querySlot({
        goal: 'Latest complete month: net by price class (formal promo / manual discount / full price) with depth.',
        widget: { kind: 'pie', title: 'הכנסה לפי סוג מחיר (מ׳ ₪)', subtitle: 'חודש מלא אחרון', donut: true, name: 'price_class', value: 'net_M' },
        sql: `WITH agg AS (
  SELECT sum(net) AS net_all, sum(promo_net) AS promo_net, sum(disc_net) AS disc_net,
    sum(depth_wtd_pct*disc_net) AS dnum_all, sum(promo_disc_net) AS pd_net, sum(promo_disc_dnum) AS pd_dnum
  FROM full_data WHERE ym = (SELECT max(ym) FROM full_data WHERE ym < (SELECT max(ym) FROM full_data))),
cls AS (
  SELECT 'formal_promo' AS price_class, promo_net AS net, pd_dnum AS dnum, pd_net AS dden FROM agg
  UNION ALL SELECT 'manual_discount', disc_net - pd_net, dnum_all - pd_dnum, disc_net - pd_net FROM agg
  UNION ALL SELECT 'full_price', net_all - promo_net - (disc_net - pd_net), NULL, 0 FROM agg)
SELECT cls.price_class, round(cls.net/1e6, 2) AS net_M,
  round(100.0*cls.net/(SELECT net_all FROM agg), 1) AS share_pct,
  round(cls.dnum/nullif(cls.dden, 0), 1) AS depth_wtd_pct
FROM cls ORDER BY net_M DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Quarterly promo/discount coverage trend since 2024.',
        widget: { kind: 'table', title: 'כיסוי מבצעים והנחות לפי רבעון', columns: [{key: 'yr', label: 'שנה'}, {key: 'q', label: 'רבעון'}, {key: 'net_M', label: 'נטו (מ׳ ₪)'}, {key: 'formal_promo_share_pct', label: 'נתח מבצעים', format: '%'}, {key: 'disc_rev_share_pct', label: 'נתח מהונח', format: '%'}, {key: 'avg_depth_pct', label: 'עומק ממוצע', format: '%'}] },
        sql: `SELECT CAST(substr(ym, 1, 4) AS INT) AS yr, (CAST(substr(ym, 6, 2) AS INT) + 2) // 3 AS q,
  round(sum(net)/1e6, 2) AS net_M,
  round(100.0*sum(disc_net)/sum(net), 1) AS disc_rev_share_pct,
  round(100.0*sum(promo_net)/sum(net), 1) AS formal_promo_share_pct,
  round(sum(depth_wtd_pct*disc_net)/nullif(sum(disc_net), 0), 1) AS avg_depth_pct
FROM full_data GROUP BY 1, 2 ORDER BY 1, 2 LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Promo intensity by department: promo share and depth in the last 3 complete months vs the prior 3 — where promo pressure is shifting.',
        widget: { kind: 'table', title: 'לחץ מבצעים לפי מחלקה', columns: [{key: 'dept', label: 'מחלקה'}, {key: 'promo_share_now_pct', label: 'נתח עכשיו', format: '%'}, {key: 'promo_share_prev_pct', label: 'נתח קודם', format: '%'}, {key: 'promo_share_chg_ppt', label: 'שינוי (נק׳)'}, {key: 'depth_wtd_now_pct', label: 'עומק', format: '%'}, {key: 'net_3m_M', label: 'נטו 3 חודשים (מ׳ ₪)'}] },
        sql: `WITH m AS (SELECT ym, CAST(substr(ym,1,4) AS INT)*12 + CAST(substr(ym,6,2) AS INT) AS mi FROM (SELECT DISTINCT ym FROM full_data)),
me AS (SELECT max(mi) AS me_mi FROM m),
w AS (
  SELECT fd.dept AS dept,
    sum(fd.net) FILTER (WHERE mm.mi >= me.me_mi - 3) AS net_now,
    sum(fd.promo_net) FILTER (WHERE mm.mi >= me.me_mi - 3) AS promo_now,
    sum(fd.net) FILTER (WHERE mm.mi < me.me_mi - 3) AS net_prev,
    sum(fd.promo_net) FILTER (WHERE mm.mi < me.me_mi - 3) AS promo_prev,
    sum(fd.depth_wtd_pct*fd.disc_net) FILTER (WHERE mm.mi >= me.me_mi - 3) AS dnum,
    sum(fd.disc_net) FILTER (WHERE mm.mi >= me.me_mi - 3) AS dden
  FROM full_data fd JOIN m mm ON mm.ym = fd.ym CROSS JOIN me
  WHERE mm.mi >= me.me_mi - 6 AND mm.mi < me.me_mi
  GROUP BY 1)
SELECT dept, round(net_now/1e6, 2) AS net_3m_M,
  round(100.0*coalesce(promo_now, 0)/nullif(net_now, 0), 1) AS promo_share_now_pct,
  round(100.0*coalesce(promo_prev, 0)/nullif(net_prev, 0), 1) AS promo_share_prev_pct,
  round(100.0*coalesce(promo_now, 0)/nullif(net_now, 0) - 100.0*coalesce(promo_prev, 0)/nullif(net_prev, 0), 1) AS promo_share_chg_ppt,
  round(dnum/nullif(dden, 0), 1) AS depth_wtd_now_pct
FROM w WHERE net_now > 500000 ORDER BY net_now DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Product-code × branch × month promo/discount coverage since 2024.',
        grain: 'one row per (product code, branch, month)',
        columns: 'prt, item, branch_id, branch, dept, ym: yyyy-mm, net, promo_net: net on MivzaNo>0 lines, disc_net: net on discounted lines, depth_wtd_pct, promo_disc_net: net on lines both promoted and discounted, promo_disc_dnum: discount-weighted numerator on those lines',
        viewSql: `WITH base AS (
  SELECT l.PrtC AS prt, h.StoreC AS branch_id, date_trunc('month', h.DateDoc)::DATE AS mth,
    sum(${NET}) AS net,
    sum(${NET}) FILTER (WHERE l.MivzaNo > 0) AS promo_net,
    sum(${NET}) FILTER (WHERE ${DISC}) AS disc_net,
    sum(l.AczDisLine*${NET}) FILTER (WHERE ${DISC}) AS dnum,
    sum(${NET}) FILTER (WHERE l.MivzaNo > 0 AND ${DISC}) AS promo_disc_net,
    sum(l.AczDisLine*${NET}) FILTER (WHERE l.MivzaNo > 0 AND ${DISC}) AS promo_disc_dnum
  FROM ${SALES}
  GROUP BY 1, 2, 3)
SELECT base.prt AS prt, trim(p.Nm) AS item, base.branch_id AS branch_id, trim(s.Nm) AS branch,
  trim(dp.Nm) AS dept, strftime(base.mth, '%Y-%m') AS ym,
  round(base.net, 1) AS net, round(base.promo_net, 1) AS promo_net, round(base.disc_net, 1) AS disc_net,
  round(base.dnum/nullif(base.disc_net, 0), 2) AS depth_wtd_pct,
  round(base.promo_disc_net, 1) AS promo_disc_net, round(base.promo_disc_dnum, 1) AS promo_disc_dnum
FROM base
JOIN ${PRT} p ON p.C = base.prt
JOIN ${STORE} s ON s.C = base.branch_id
JOIN ${DEPT} dp ON dp.C = p.DepartmentC`
      })
    }),
    section({
      id: 'promo-margin',
      title: 'מבצעים שהרסו מרווח',
      goal: 'Per MivzaNo (2025+): promo revenue, depth, and realized promo margin vs the SAME items full-price margin — ranked by margin destruction.',
      caveats: 'שורות מכירה לא נושאות עלות — עלות יחידה נשאלת פר פריט מכלל השורות המתומחרות (cogs/qty). מבצע ללא שם — רק מספר; חלון 2025+ (תחילת היסטוריית עלויות). מרווח מחיר-מלא = אותם פריטים על שורות MivzaNo=0 ו-AczDisLine=0.',
      executiveSummary: querySlot({
        goal: 'Top 8 margin-destroying promos: promo margin vs full-price margin of the same items.',
        widget: { kind: 'groupedBar', title: 'מרווח במבצע מול מחיר מלא', valueFormat: '%', category: 'mivza_no', ys: [{col: 'fullprice_margin_pct', label: 'מחיר מלא'}, {col: 'promo_margin_pct', label: 'במבצע'}] },
        sql: `WITH ${COST_CTE},
pc AS (
  SELECT l.PrtC AS prt,
    sum(c.unit_cost*l.Cmt) FILTER (WHERE c.unit_cost IS NOT NULL)/nullif(sum(l.Cmt) FILTER (WHERE c.unit_cost IS NOT NULL), 0) AS unit_cost,
    sum(${NET}) FILTER (WHERE ${FULL_PRICE} AND c.unit_cost IS NOT NULL) AS fp_net,
    sum(c.unit_cost*l.Cmt) FILTER (WHERE ${FULL_PRICE} AND c.unit_cost IS NOT NULL) AS fp_cogs
  FROM ${SALES}
  LEFT JOIN cost c ON c.ItemID = l.PrtC AND c.StoreID = h.StoreC
  WHERE h.DateDoc >= DATE '2025-01-01'
  GROUP BY 1),
mp AS (
  SELECT l.MivzaNo AS mz, l.PrtC AS prt, sum(${NET}) AS pnet, sum(l.Cmt) AS pqty,
    sum(${NET}*l.AczDisLine) FILTER (WHERE ${DISC}) AS dnum,
    sum(${NET}) FILTER (WHERE ${DISC}) AS dden
  FROM ${SALES}
  WHERE l.MivzaNo > 0 AND h.DateDoc >= DATE '2025-01-01'
  GROUP BY 1, 2),
mz AS (
  SELECT mp.mz, sum(mp.pnet) AS promo_net, count(DISTINCT mp.prt) AS n_items,
    sum(mp.pnet - pc.unit_cost*mp.pqty) FILTER (WHERE pc.unit_cost IS NOT NULL) AS promo_gp,
    sum(mp.pnet) FILTER (WHERE pc.unit_cost IS NOT NULL) AS promo_net_costed,
    sum(mp.dnum)/nullif(sum(mp.dden), 0) AS depth,
    sum(pc.fp_net) AS fp_net, sum(pc.fp_cogs) AS fp_cogs
  FROM mp LEFT JOIN pc USING (prt) GROUP BY 1)
SELECT mz AS mivza_no, round(promo_net/1e3) AS promo_net_K, n_items, round(depth, 1) AS depth_pct,
  round(100.0*promo_gp/nullif(promo_net_costed, 0), 1) AS promo_margin_pct,
  round(100.0*(fp_net - fp_cogs)/nullif(fp_net, 0), 1) AS fullprice_margin_pct,
  round(100.0*(fp_net - fp_cogs)/nullif(fp_net, 0) - 100.0*promo_gp/nullif(promo_net_costed, 0), 1) AS margin_drop_ppt
FROM mz
WHERE promo_net > 150000 AND fp_net > 0
ORDER BY margin_drop_ppt DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 promos by margin destruction (promo net > 150K).',
        widget: { kind: 'table', title: 'מבצעים לפי הרס מרווח', columns: [{key: 'mivza_no', label: 'מס׳ מבצע'}, {key: 'promo_net_K', label: 'נטו מבצע (אלפי ₪)'}, {key: 'depth_pct', label: 'עומק', format: '%'}, {key: 'promo_margin_pct', label: 'מרווח במבצע', format: '%'}, {key: 'fullprice_margin_pct', label: 'מרווח מחיר מלא', format: '%'}, {key: 'margin_drop_ppt', label: 'צניחה (נק׳)'}] },
        sql: `WITH ${COST_CTE},
pc AS (
  SELECT l.PrtC AS prt,
    sum(c.unit_cost*l.Cmt) FILTER (WHERE c.unit_cost IS NOT NULL)/nullif(sum(l.Cmt) FILTER (WHERE c.unit_cost IS NOT NULL), 0) AS unit_cost,
    sum(${NET}) FILTER (WHERE ${FULL_PRICE} AND c.unit_cost IS NOT NULL) AS fp_net,
    sum(c.unit_cost*l.Cmt) FILTER (WHERE ${FULL_PRICE} AND c.unit_cost IS NOT NULL) AS fp_cogs
  FROM ${SALES}
  LEFT JOIN cost c ON c.ItemID = l.PrtC AND c.StoreID = h.StoreC
  WHERE h.DateDoc >= DATE '2025-01-01'
  GROUP BY 1),
mp AS (
  SELECT l.MivzaNo AS mz, l.PrtC AS prt, sum(${NET}) AS pnet, sum(l.Cmt) AS pqty,
    sum(${NET}*l.AczDisLine) FILTER (WHERE ${DISC}) AS dnum,
    sum(${NET}) FILTER (WHERE ${DISC}) AS dden
  FROM ${SALES}
  WHERE l.MivzaNo > 0 AND h.DateDoc >= DATE '2025-01-01'
  GROUP BY 1, 2),
mz AS (
  SELECT mp.mz, sum(mp.pnet) AS promo_net, count(DISTINCT mp.prt) AS n_items,
    sum(mp.pnet - pc.unit_cost*mp.pqty) FILTER (WHERE pc.unit_cost IS NOT NULL) AS promo_gp,
    sum(mp.pnet) FILTER (WHERE pc.unit_cost IS NOT NULL) AS promo_net_costed,
    sum(mp.dnum)/nullif(sum(mp.dden), 0) AS depth,
    sum(pc.fp_net) AS fp_net, sum(pc.fp_cogs) AS fp_cogs
  FROM mp LEFT JOIN pc USING (prt) GROUP BY 1)
SELECT mz AS mivza_no, round(promo_net/1e3) AS promo_net_K, n_items, round(depth, 1) AS depth_pct,
  round(100.0*promo_gp/nullif(promo_net_costed, 0), 1) AS promo_margin_pct,
  round(100.0*(fp_net - fp_cogs)/nullif(fp_net, 0), 1) AS fullprice_margin_pct,
  round(100.0*(fp_net - fp_cogs)/nullif(fp_net, 0) - 100.0*promo_gp/nullif(promo_net_costed, 0), 1) AS margin_drop_ppt
FROM mz
WHERE promo_net > 150000 AND fp_net > 0
ORDER BY margin_drop_ppt DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Top 50 material promos with the promo period (first/last month seen) and the leading item — the full promo P&L review list.',
        widget: { kind: 'table', title: 'סקירת מבצעים מהותיים', columns: [{key: 'mivza_no', label: 'מס׳ מבצע'}, {key: 'top_item', label: 'פריט מוביל'}, {key: 'first_ym', label: 'מחודש'}, {key: 'last_ym', label: 'עד חודש'}, {key: 'promo_net_K', label: 'נטו (אלפי ₪)'}, {key: 'promo_margin_pct', label: 'מרווח', format: '%'}] },
        sql: `WITH ${COST_CTE},
pc AS (
  SELECT l.PrtC AS prt,
    sum(c.unit_cost*l.Cmt) FILTER (WHERE c.unit_cost IS NOT NULL)/nullif(sum(l.Cmt) FILTER (WHERE c.unit_cost IS NOT NULL), 0) AS unit_cost
  FROM ${SALES}
  LEFT JOIN cost c ON c.ItemID = l.PrtC AND c.StoreID = h.StoreC
  WHERE h.DateDoc >= DATE '2025-01-01'
  GROUP BY 1),
mp AS (
  SELECT l.MivzaNo AS mz, l.PrtC AS prt, sum(${NET}) AS pnet, sum(l.Cmt) AS pqty,
    min(strftime(h.DateDoc, '%Y-%m')) AS first_ym, max(strftime(h.DateDoc, '%Y-%m')) AS last_ym,
    sum(${NET}*l.AczDisLine) FILTER (WHERE ${DISC}) AS dnum,
    sum(${NET}) FILTER (WHERE ${DISC}) AS dden
  FROM ${SALES}
  WHERE l.MivzaNo > 0 AND h.DateDoc >= DATE '2025-01-01'
  GROUP BY 1, 2),
mz AS (
  SELECT mp.mz, sum(mp.pnet) AS promo_net, count(DISTINCT mp.prt) AS n_items,
    min(mp.first_ym) AS first_ym, max(mp.last_ym) AS last_ym,
    arg_max(mp.prt, mp.pnet) AS top_prt,
    sum(mp.pnet - pc.unit_cost*mp.pqty) FILTER (WHERE pc.unit_cost IS NOT NULL) AS promo_gp,
    sum(mp.pnet) FILTER (WHERE pc.unit_cost IS NOT NULL) AS promo_net_costed,
    sum(mp.dnum)/nullif(sum(mp.dden), 0) AS depth
  FROM mp LEFT JOIN pc USING (prt) GROUP BY 1)
SELECT mz.mz AS mivza_no, round(mz.promo_net/1e3) AS promo_net_K, mz.n_items,
  mz.first_ym, mz.last_ym, trim(p.Nm) AS top_item,
  round(mz.depth, 1) AS depth_pct,
  round(100.0*mz.promo_gp/nullif(mz.promo_net_costed, 0), 1) AS promo_margin_pct
FROM mz JOIN ${PRT} p ON p.C = mz.top_prt
WHERE mz.promo_net > 100000
ORDER BY promo_margin_pct ASC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Promo × product × branch aggregates 2025+: revenue, inferred period, depth and margins.',
        grain: 'one row per (MivzaNo, product code, branch) active since 2025',
        columns: 'mivza_no, prt, item, branch_id, branch, promo_net, promo_qty_mixed_units, first_ym, last_ym, depth_pct, promo_margin_pct, promo_net_costed_share_pct',
        viewSql: `WITH ${COST_CTE},
pc AS (
  SELECT l.PrtC AS prt, h.StoreC AS branch_id,
    sum(c.unit_cost*l.Cmt) FILTER (WHERE c.unit_cost IS NOT NULL)/nullif(sum(l.Cmt) FILTER (WHERE c.unit_cost IS NOT NULL), 0) AS unit_cost
  FROM ${SALES}
  LEFT JOIN cost c ON c.ItemID = l.PrtC AND c.StoreID = h.StoreC
  WHERE h.DateDoc >= DATE '2025-01-01'
  GROUP BY 1, 2),
mp AS (
  SELECT l.MivzaNo AS mz, l.PrtC AS prt, h.StoreC AS branch_id, sum(${NET}) AS pnet, sum(l.Cmt) AS pqty,
    min(strftime(h.DateDoc, '%Y-%m')) AS first_ym, max(strftime(h.DateDoc, '%Y-%m')) AS last_ym,
    sum(${NET}*l.AczDisLine) FILTER (WHERE ${DISC}) AS dnum,
    sum(${NET}) FILTER (WHERE ${DISC}) AS dden
  FROM ${SALES}
  WHERE l.MivzaNo > 0 AND h.DateDoc >= DATE '2025-01-01'
  GROUP BY 1, 2, 3)
SELECT mp.mz AS mivza_no, mp.prt, trim(p.Nm) AS item, mp.branch_id, trim(s.Nm) AS branch,
  round(mp.pnet, 1) AS promo_net, round(mp.pqty, 1) AS promo_qty_mixed_units,
  mp.first_ym, mp.last_ym, round(mp.dnum/nullif(mp.dden, 0), 2) AS depth_pct,
  round(100.0*(mp.pnet - pc.unit_cost*mp.pqty)/nullif(mp.pnet, 0), 1) AS promo_margin_pct,
  CASE WHEN pc.unit_cost IS NOT NULL THEN 100.0 ELSE 0 END AS promo_net_costed_share_pct
FROM mp LEFT JOIN pc USING (prt, branch_id)
JOIN ${PRT} p ON p.C = mp.prt
JOIN ${STORE} s ON s.C = mp.branch_id`
      })
    }),
    section({
      id: 'uplift',
      title: 'החזר על מבצע (uplift)',
      goal: 'Did last month promos really lift volume, or just discount sales that would have happened anyway — per-item qty/day vs the item OWN non-promo baseline months.',
      caveats: 'Baseline = חודשים ללא שורת מבצע של אותו פריט (נדרשים 2+); היחס פר-פריט באותה יחידה (בטוח ק"ג/יח\'). עונתיות יכולה להתחזות ל-uplift; סיבתיות אינה מוכחת. ~שליש מהכנסות המבצע בדרך כלל ללא uplift אמיתי.',
      executiveSummary: querySlot({
        goal: 'Uplift tiers for the latest complete month promoted items: how much promo revenue came with real volume lift.',
        widget: { kind: 'funnel', title: 'הכנסת מבצעים לפי דרגת uplift (אלפי ₪)', name: 'uplift_tier', value: 'promo_month_net_K' },
        sql: `WITH im AS (
  SELECT l.PrtC AS prt, date_trunc('month', h.DateDoc) AS m, sum(l.Cmt) AS qty, sum(${NET}) AS net,
    count(DISTINCT h.DateDoc::DATE) AS nd, max(CASE WHEN l.MivzaNo > 0 THEN 1 ELSE 0 END) AS hp
  FROM ${SALES} WHERE l.Cmt > 0 GROUP BY 1, 2),
pm AS (SELECT DISTINCT prt FROM im WHERE m = ${M_START} AND hp = 1),
b AS (
  SELECT im.prt,
    sum(im.qty) FILTER (WHERE im.m = ${M_START})/nullif(sum(im.nd) FILTER (WHERE im.m = ${M_START}), 0) AS promo_qpd,
    sum(im.net) FILTER (WHERE im.m = ${M_START}) AS promo_month_net,
    sum(im.nd) FILTER (WHERE im.m = ${M_START}) AS promo_days,
    sum(im.qty) FILTER (WHERE im.hp = 0)/nullif(sum(im.nd) FILTER (WHERE im.hp = 0), 0) AS base_qpd,
    count(*) FILTER (WHERE im.hp = 0) AS baseline_months
  FROM im JOIN pm USING (prt) GROUP BY 1),
c AS (
  SELECT *, promo_qpd/nullif(base_qpd, 0) AS ratio, (promo_qpd - base_qpd)*promo_days AS incremental_units
  FROM b WHERE baseline_months >= 2 AND base_qpd > 0)
SELECT CASE WHEN ratio >= 2 THEN '1_strong_uplift_2x_plus' WHEN ratio >= 1.2 THEN '2_moderate_1.2_2x'
    WHEN ratio >= 0.9 THEN '3_flat_0.9_1.2x' ELSE '4_declined_below_0.9x' END AS uplift_tier,
  count(*) AS items, round(sum(promo_month_net)/1e3) AS promo_month_net_K,
  round(100.0*sum(promo_month_net)/sum(sum(promo_month_net)) OVER (), 1) AS net_share_pct,
  round(median(ratio), 2) AS median_ratio,
  round(sum(incremental_units)/1e3, 1) AS incremental_units_K
FROM c GROUP BY 1 ORDER BY 1 LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 promoted items of the latest complete month by promo revenue, with their uplift ratio and tier.',
        widget: { kind: 'table', title: 'פריטי המבצע הגדולים — uplift', columns: [{key: 'item', label: 'פריט'}, {key: 'promo_month_net', label: 'נטו בחודש המבצע', format: '₪'}, {key: 'baseline_qty_per_day', label: 'כמות/יום בסיס'}, {key: 'promo_qty_per_day', label: 'כמות/יום במבצע'}, {key: 'uplift_ratio', label: 'יחס uplift'}, {key: 'tier', label: 'דרגה'}] },
        sql: `WITH im AS (
  SELECT l.PrtC AS prt, date_trunc('month', h.DateDoc) AS m, sum(l.Cmt) AS qty, sum(${NET}) AS net,
    count(DISTINCT h.DateDoc::DATE) AS nd, max(CASE WHEN l.MivzaNo > 0 THEN 1 ELSE 0 END) AS hp
  FROM ${SALES} WHERE l.Cmt > 0 GROUP BY 1, 2),
pm AS (SELECT DISTINCT prt FROM im WHERE m = ${M_START} AND hp = 1),
b AS (
  SELECT im.prt,
    sum(im.qty) FILTER (WHERE im.m = ${M_START})/nullif(sum(im.nd) FILTER (WHERE im.m = ${M_START}), 0) AS promo_qpd,
    sum(im.net) FILTER (WHERE im.m = ${M_START}) AS promo_month_net,
    sum(im.qty) FILTER (WHERE im.hp = 0)/nullif(sum(im.nd) FILTER (WHERE im.hp = 0), 0) AS base_qpd,
    count(*) FILTER (WHERE im.hp = 0) AS baseline_months
  FROM im JOIN pm USING (prt) GROUP BY 1),
c AS (SELECT *, promo_qpd/nullif(base_qpd, 0) AS ratio FROM b WHERE baseline_months >= 2 AND base_qpd > 0)
SELECT c.prt, trim(p.Nm) AS item, round(c.promo_month_net) AS promo_month_net,
  round(c.promo_qpd, 1) AS promo_qty_per_day, round(c.base_qpd, 1) AS baseline_qty_per_day,
  round(c.ratio, 2) AS uplift_ratio,
  CASE WHEN ratio >= 2 THEN 'strong' WHEN ratio >= 1.2 THEN 'moderate' WHEN ratio >= 0.9 THEN 'flat' ELSE 'declined' END AS tier
FROM c JOIN ${PRT} p ON p.C = c.prt
ORDER BY c.promo_month_net DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Biggest absolute volume movers (up AND down) among latest-month promoted items — where promos created or destroyed the most units.',
        widget: { kind: 'hbar', title: 'יחידות שנוספו או אבדו במבצע', valueFormat: 'int', name: 'item', value: 'incremental_units_own_unit' },
        sql: `WITH im AS (
  SELECT l.PrtC AS prt, date_trunc('month', h.DateDoc) AS m, sum(l.Cmt) AS qty, sum(${NET}) AS net,
    count(DISTINCT h.DateDoc::DATE) AS nd, max(CASE WHEN l.MivzaNo > 0 THEN 1 ELSE 0 END) AS hp
  FROM ${SALES} WHERE l.Cmt > 0 GROUP BY 1, 2),
pm AS (SELECT DISTINCT prt FROM im WHERE m = ${M_START} AND hp = 1),
b AS (
  SELECT im.prt,
    sum(im.qty) FILTER (WHERE im.m = ${M_START})/nullif(sum(im.nd) FILTER (WHERE im.m = ${M_START}), 0) AS promo_qpd,
    sum(im.net) FILTER (WHERE im.m = ${M_START}) AS promo_month_net,
    sum(im.nd) FILTER (WHERE im.m = ${M_START}) AS promo_days,
    sum(im.qty) FILTER (WHERE im.hp = 0)/nullif(sum(im.nd) FILTER (WHERE im.hp = 0), 0) AS base_qpd,
    count(*) FILTER (WHERE im.hp = 0) AS baseline_months
  FROM im JOIN pm USING (prt) GROUP BY 1),
c AS (
  SELECT *, promo_qpd/nullif(base_qpd, 0) AS ratio, (promo_qpd - base_qpd)*promo_days AS incremental_units
  FROM b WHERE baseline_months >= 2 AND base_qpd > 0)
SELECT c.prt, trim(p.Nm) AS item, trim(dp.Nm) AS dept,
  round(c.promo_month_net) AS promo_month_net,
  round(c.promo_qpd, 1) AS promo_qty_per_day, round(c.base_qpd, 1) AS baseline_qty_per_day,
  round(c.ratio, 2) AS uplift_ratio, round(c.incremental_units) AS incremental_units_own_unit,
  c.baseline_months
FROM c JOIN ${PRT} p ON p.C = c.prt LEFT JOIN ${DEPT} dp ON dp.C = p.DepartmentC
ORDER BY abs(c.incremental_units) DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Item × branch × month sales for every item promoted at least once since 2025 — the base for any uplift/baseline analysis.',
        grain: 'one row per (ever-promoted item, branch, month with sales) since 2025',
        columns: 'prt, item, branch_id, branch, ym: yyyy-mm, qty_own_unit, net, days_sold, had_promo: 1 if any line that month carried MivzaNo>0, promo_net',
        perItemOnly: 'qty_own_unit',
        viewSql: `WITH ism AS (
  SELECT l.PrtC AS prt, h.StoreC AS branch_id, date_trunc('month', h.DateDoc)::DATE AS mth,
    sum(l.Cmt) AS qty_own_unit, sum(${NET}) AS net,
    count(DISTINCT h.DateDoc::DATE) AS days_sold,
    max(CASE WHEN l.MivzaNo > 0 THEN 1 ELSE 0 END) AS had_promo,
    sum(${NET}) FILTER (WHERE l.MivzaNo > 0) AS promo_net
  FROM ${SALES}
  WHERE h.DateDoc >= DATE '2025-01-01' AND l.Cmt > 0
  GROUP BY 1, 2, 3)
SELECT kept.prt AS prt, trim(p.Nm) AS item, kept.branch_id AS branch_id, trim(s.Nm) AS branch, strftime(kept.mth, '%Y-%m') AS ym,
  round(kept.qty_own_unit, 1) AS qty_own_unit, round(kept.net, 1) AS net,
  kept.days_sold AS days_sold, kept.had_promo AS had_promo,
  round(coalesce(kept.promo_net, 0), 1) AS promo_net
FROM (SELECT * FROM ism WHERE prt IN (SELECT prt FROM ism WHERE had_promo = 1)) kept
JOIN ${PRT} p ON p.C = kept.prt
JOIN ${STORE} s ON s.C = kept.branch_id`
      })
    }),
    section({
      id: 'cannibalization',
      title: 'קניבליזציה בתוך קבוצות',
      goal: 'Does promoting items in a product group steal from full-price group-mates: full-price velocity in promo-heavy months vs clean months, per PrtGroup, with the whole-group trend as control.',
      caveats: 'ניתוח ברמת קבוצה (PrtGroups כ-proxy לתחליפיות): "חודש מבצע" = >20% מכמות הקבוצה בשורות מבצע. אסוציאטיבי — עונתיות/חגים משפיעים על שני הצדדים. כמות בתוך קבוצה עלולה לערבב ק"ג ויחידות — קרא כמגמה, לא כיחידות מדויקות. אימות ידוע: תבניות ביצים — רווח המבצע ≈ אובדן התחליפים, הקטגוריה נשארה שטוחה.',
      executiveSummary: querySlot({
        goal: 'Top 8 groups with the strongest cannibalization signature: full-price velocity drops in promo months while the whole group stays flat.',
        widget: { kind: 'groupedBar', title: 'חתימת קניבליזציה — מחיר מלא מול כלל הקבוצה', valueFormat: '%', category: 'grp', ys: [{col: 'fullprice_chg_pct', label: 'מחיר מלא'}, {col: 'total_group_chg_pct', label: 'כלל הקבוצה'}] },
        sql: `WITH gm AS (
  SELECT p.GroupC AS grp_c, date_trunc('month', h.DateDoc) AS m,
    sum(l.Cmt) AS qty,
    sum(CASE WHEN ${FULL_PRICE} THEN l.Cmt ELSE 0 END) AS fp_qty,
    sum(CASE WHEN l.MivzaNo > 0 THEN l.Cmt ELSE 0 END) AS promo_qty,
    count(DISTINCT h.DateDoc::DATE) AS nd
  FROM ${SALES} JOIN ${PRT} p ON p.C = l.PrtC
  WHERE h.DateDoc >= DATE '2025-01-01' AND l.Cmt > 0 AND p.GroupC IS NOT NULL
    AND p.DepartmentC NOT IN (164, 204)
  GROUP BY 1, 2),
ph AS (SELECT *, CASE WHEN promo_qty > 0.2*qty THEN 1 ELSE 0 END AS promo_month FROM gm),
agg AS (
  SELECT grp_c,
    count(*) FILTER (WHERE promo_month = 1) AS promo_months,
    count(*) FILTER (WHERE promo_month = 0) AS clean_months,
    sum(fp_qty) FILTER (WHERE promo_month = 1)/nullif(sum(nd) FILTER (WHERE promo_month = 1), 0) AS fp_qpd_promo,
    sum(fp_qty) FILTER (WHERE promo_month = 0)/nullif(sum(nd) FILTER (WHERE promo_month = 0), 0) AS fp_qpd_clean,
    sum(qty) FILTER (WHERE promo_month = 1)/nullif(sum(nd) FILTER (WHERE promo_month = 1), 0) AS total_qpd_promo,
    sum(qty) FILTER (WHERE promo_month = 0)/nullif(sum(nd) FILTER (WHERE promo_month = 0), 0) AS total_qpd_clean
  FROM ph GROUP BY 1
  HAVING count(*) FILTER (WHERE promo_month = 1) >= 3 AND count(*) FILTER (WHERE promo_month = 0) >= 3 AND sum(qty) > 20000)
SELECT trim(g.Nm) AS grp, promo_months, clean_months,
  round(fp_qpd_clean, 1) AS fullprice_qpd_clean, round(fp_qpd_promo, 1) AS fullprice_qpd_promo,
  round(100.0*(fp_qpd_promo - fp_qpd_clean)/nullif(fp_qpd_clean, 0), 1) AS fullprice_chg_pct,
  round(100.0*(total_qpd_promo - total_qpd_clean)/nullif(total_qpd_clean, 0), 1) AS total_group_chg_pct
FROM agg JOIN ${GRPS} g ON g.C = agg.grp_c
WHERE fp_qpd_clean > 0
ORDER BY (100.0*(fp_qpd_promo - fp_qpd_clean)/nullif(fp_qpd_clean, 0)
  - 100.0*(total_qpd_promo - total_qpd_clean)/nullif(total_qpd_clean, 0)) ASC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 groups by cannibalization score with volumes for materiality.',
        widget: { kind: 'table', title: 'קבוצות לפי ציון קניבליזציה', columns: [{key: 'grp', label: 'קבוצה'}, {key: 'cannibalization_score', label: 'ציון'}, {key: 'fullprice_chg_pct', label: 'שינוי מחיר מלא', format: '%'}, {key: 'total_group_chg_pct', label: 'שינוי כלל הקבוצה', format: '%'}, {key: 'qty_total_mixed_units', label: 'כמות כוללת'}] },
        sql: `WITH gm AS (
  SELECT p.GroupC AS grp_c, date_trunc('month', h.DateDoc) AS m,
    sum(l.Cmt) AS qty,
    sum(CASE WHEN ${FULL_PRICE} THEN l.Cmt ELSE 0 END) AS fp_qty,
    sum(CASE WHEN l.MivzaNo > 0 THEN l.Cmt ELSE 0 END) AS promo_qty,
    count(DISTINCT h.DateDoc::DATE) AS nd
  FROM ${SALES} JOIN ${PRT} p ON p.C = l.PrtC
  WHERE h.DateDoc >= DATE '2025-01-01' AND l.Cmt > 0 AND p.GroupC IS NOT NULL
    AND p.DepartmentC NOT IN (164, 204)
  GROUP BY 1, 2),
ph AS (SELECT *, CASE WHEN promo_qty > 0.2*qty THEN 1 ELSE 0 END AS promo_month FROM gm),
agg AS (
  SELECT grp_c,
    count(*) FILTER (WHERE promo_month = 1) AS promo_months,
    count(*) FILTER (WHERE promo_month = 0) AS clean_months,
    sum(qty) AS qty_total,
    sum(fp_qty) FILTER (WHERE promo_month = 1)/nullif(sum(nd) FILTER (WHERE promo_month = 1), 0) AS fp_qpd_promo,
    sum(fp_qty) FILTER (WHERE promo_month = 0)/nullif(sum(nd) FILTER (WHERE promo_month = 0), 0) AS fp_qpd_clean,
    sum(qty) FILTER (WHERE promo_month = 1)/nullif(sum(nd) FILTER (WHERE promo_month = 1), 0) AS total_qpd_promo,
    sum(qty) FILTER (WHERE promo_month = 0)/nullif(sum(nd) FILTER (WHERE promo_month = 0), 0) AS total_qpd_clean
  FROM ph GROUP BY 1
  HAVING count(*) FILTER (WHERE promo_month = 1) >= 3 AND count(*) FILTER (WHERE promo_month = 0) >= 3 AND sum(qty) > 5000)
SELECT trim(g.Nm) AS grp, promo_months, clean_months, round(qty_total) AS qty_total_mixed_units,
  round(fp_qpd_clean, 1) AS fullprice_qpd_clean, round(fp_qpd_promo, 1) AS fullprice_qpd_promo,
  round(100.0*(fp_qpd_promo - fp_qpd_clean)/nullif(fp_qpd_clean, 0), 1) AS fullprice_chg_pct,
  round(100.0*(total_qpd_promo - total_qpd_clean)/nullif(total_qpd_clean, 0), 1) AS total_group_chg_pct,
  round((100.0*(fp_qpd_promo - fp_qpd_clean)/nullif(fp_qpd_clean, 0)
    - 100.0*(total_qpd_promo - total_qpd_clean)/nullif(total_qpd_clean, 0)), 1) AS cannibalization_score
FROM agg JOIN ${GRPS} g ON g.C = agg.grp_c
WHERE fp_qpd_clean > 0
ORDER BY cannibalization_score ASC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Group-level detail with department and promo-share context — 50 groups ordered by cannibalization score, both directions visible.',
        widget: { kind: 'table', title: 'קניבליזציה — פירוט קבוצות', columns: [{key: 'grp', label: 'קבוצה'}, {key: 'dept', label: 'מחלקה'}, {key: 'promo_qty_share_pct', label: 'נתח כמות במבצע', format: '%'}, {key: 'fullprice_chg_pct', label: 'שינוי מחיר מלא', format: '%'}, {key: 'total_group_chg_pct', label: 'שינוי קבוצה', format: '%'}, {key: 'cannibalization_score', label: 'ציון'}] },
        sql: `WITH gm AS (
  SELECT p.GroupC AS grp_c, min(p.DepartmentC) AS dept_c, date_trunc('month', h.DateDoc) AS m,
    sum(l.Cmt) AS qty,
    sum(CASE WHEN ${FULL_PRICE} THEN l.Cmt ELSE 0 END) AS fp_qty,
    sum(CASE WHEN l.MivzaNo > 0 THEN l.Cmt ELSE 0 END) AS promo_qty,
    count(DISTINCT h.DateDoc::DATE) AS nd
  FROM ${SALES} JOIN ${PRT} p ON p.C = l.PrtC
  WHERE h.DateDoc >= DATE '2025-01-01' AND l.Cmt > 0 AND p.GroupC IS NOT NULL
    AND p.DepartmentC NOT IN (164, 204)
  GROUP BY 1, 3),
ph AS (SELECT *, CASE WHEN promo_qty > 0.2*qty THEN 1 ELSE 0 END AS promo_month FROM gm),
agg AS (
  SELECT grp_c, min(dept_c) AS dept_c,
    count(*) FILTER (WHERE promo_month = 1) AS promo_months,
    count(*) FILTER (WHERE promo_month = 0) AS clean_months,
    sum(promo_qty)/nullif(sum(qty), 0) AS promo_qty_share,
    sum(fp_qty) FILTER (WHERE promo_month = 1)/nullif(sum(nd) FILTER (WHERE promo_month = 1), 0) AS fp_qpd_promo,
    sum(fp_qty) FILTER (WHERE promo_month = 0)/nullif(sum(nd) FILTER (WHERE promo_month = 0), 0) AS fp_qpd_clean,
    sum(qty) FILTER (WHERE promo_month = 1)/nullif(sum(nd) FILTER (WHERE promo_month = 1), 0) AS total_qpd_promo,
    sum(qty) FILTER (WHERE promo_month = 0)/nullif(sum(nd) FILTER (WHERE promo_month = 0), 0) AS total_qpd_clean
  FROM ph GROUP BY 1
  HAVING count(*) FILTER (WHERE promo_month = 1) >= 2 AND count(*) FILTER (WHERE promo_month = 0) >= 2 AND sum(qty) > 5000)
SELECT trim(g.Nm) AS grp, trim(dp.Nm) AS dept, promo_months, clean_months,
  round(100.0*promo_qty_share, 1) AS promo_qty_share_pct,
  round(fp_qpd_clean, 1) AS fullprice_qpd_clean, round(fp_qpd_promo, 1) AS fullprice_qpd_promo,
  round(100.0*(fp_qpd_promo - fp_qpd_clean)/nullif(fp_qpd_clean, 0), 1) AS fullprice_chg_pct,
  round(100.0*(total_qpd_promo - total_qpd_clean)/nullif(total_qpd_clean, 0), 1) AS total_group_chg_pct,
  round((100.0*(fp_qpd_promo - fp_qpd_clean)/nullif(fp_qpd_clean, 0)
    - 100.0*(total_qpd_promo - total_qpd_clean)/nullif(total_qpd_clean, 0)), 1) AS cannibalization_score
FROM agg JOIN ${GRPS} g ON g.C = agg.grp_c LEFT JOIN ${DEPT} dp ON dp.C = agg.dept_c
WHERE fp_qpd_clean > 0
ORDER BY cannibalization_score ASC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Group × branch × month velocity table (2025+): total, full-price and promo qty per day — swap in any group or branch to test suspected cannibalization.',
        grain: 'one row per (PrtGroup, branch, month) with sales',
        columns: 'grp_c: group id, grp: group name, branch_id, branch, ym, qty_per_day_mixed_units, fullprice_qty_per_day, promo_qty_share_pct, days_sold',
        viewSql: `WITH base AS (
  SELECT p.GroupC AS grp_c, h.StoreC AS branch_id, date_trunc('month', h.DateDoc)::DATE AS mth,
    sum(l.Cmt) AS qty,
    sum(l.Cmt) FILTER (WHERE ${FULL_PRICE}) AS fp_qty,
    sum(l.Cmt) FILTER (WHERE l.MivzaNo > 0) AS promo_qty,
    count(DISTINCT h.DateDoc::DATE) AS days_sold
  FROM ${SALES}
  JOIN ${PRT} p ON p.C = l.PrtC
  WHERE h.DateDoc >= DATE '2025-01-01' AND l.Cmt > 0 AND p.GroupC IS NOT NULL AND p.DepartmentC NOT IN (164, 204)
  GROUP BY 1, 2, 3)
SELECT base.grp_c AS grp_c, trim(g.Nm) AS grp, base.branch_id AS branch_id, trim(s.Nm) AS branch, strftime(base.mth, '%Y-%m') AS ym,
  round(base.qty/nullif(base.days_sold, 0), 2) AS qty_per_day_mixed_units,
  round(base.fp_qty/nullif(base.days_sold, 0), 2) AS fullprice_qty_per_day,
  round(100.0*base.promo_qty/nullif(base.qty, 0), 1) AS promo_qty_share_pct,
  base.days_sold AS days_sold
FROM base
JOIN ${GRPS} g ON g.C = base.grp_c
JOIN ${STORE} s ON s.C = base.branch_id`
      })
    }),
    section({
      id: 'free-items',
      title: 'פריטי חינם',
      goal: 'Real promo giveaways: lines with zero revenue and positive qty — how much is given away and on which items.',
      caveats: 'שורת חינם = Scm=0 וכמות>0 (~25K שורות ברשת זו) — מתנות מבצע אמיתיות, לא שגיאות. שווי משוער לפי מחיר מחירון (MhrLine); שורות ללא מחירון מוצגות ללא שווי.',
      executiveSummary: querySlot({
        goal: 'Free giveaways per year: lines, quantity and estimated list value.',
        widget: { kind: 'bar', title: 'שווי מחירון של פריטי חינם לפי שנה (₪)', valueFormat: '₪', name: 'yr', value: 'list_value_ils' },
        sql: `SELECT year(h.DateDoc) AS yr,
  count(*) AS free_lines,
  round(sum(l.Cmt)) AS qty_given_mixed_units,
  round(sum(l.MhrLine*l.Cmt) FILTER (WHERE l.MhrLine > 0)) AS list_value_ils,
  count(*) FILTER (WHERE l.MivzaNo > 0) AS via_formal_promo_lines
FROM ${SALES}
WHERE l.Scm = 0 AND l.Cmt > 0
GROUP BY 1 ORDER BY 1 LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 given-away items by estimated list value.',
        widget: { kind: 'hbar', title: 'הפריטים הניתנים חינם (שווי מחירון, ₪)', valueFormat: '₪', name: 'item', value: 'list_value_ils' },
        sql: `SELECT prt, item, dept,
  CAST(sum(free_lines) AS BIGINT) AS free_lines, round(sum(qty_given_own_unit)) AS qty_given_own_unit,
  round(sum(list_value_ils)) AS list_value_ils,
  round(100.0*sum(via_formal_promo_lines)/sum(free_lines), 0) AS formal_promo_share_pct
FROM full_data GROUP BY 1, 2, 3 ORDER BY list_value_ils DESC NULLS LAST LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Free giveaways by item × branch — which branches give what away.',
        widget: { kind: 'table', title: 'פריטי חינם לפי סניף', columns: [{key: 'item', label: 'פריט'}, {key: 'branch', label: 'סניף'}, {key: 'qty_given_own_unit', label: 'כמות'}, {key: 'list_value_ils', label: 'שווי מחירון', format: '₪'}, {key: 'free_lines', label: 'שורות', format: 'int'}] },
        sql: `SELECT prt, item, branch,
  CAST(sum(free_lines) AS BIGINT) AS free_lines, round(sum(qty_given_own_unit)) AS qty_given_own_unit,
  round(sum(list_value_ils)) AS list_value_ils
FROM full_data GROUP BY 1, 2, 3 ORDER BY list_value_ils DESC NULLS LAST LIMIT 50`
      }),
      fullData: fullData({
        description: 'Item × branch free-giveaway aggregates 2024+.',
        grain: 'one row per given-away item × branch',
        columns: 'prt, item, branch_id, branch, dept, free_lines, qty_given_own_unit, list_value_ils, formal_promo_share_pct, first_d, last_d, via_formal_promo_lines',
        perItemOnly: 'qty_given_own_unit',
        viewSql: `WITH base AS (
  SELECT l.PrtC AS prt, h.StoreC AS branch_id,
    count(*) AS free_lines, sum(l.Cmt) AS qty_given,
    sum(l.MhrLine*l.Cmt) FILTER (WHERE l.MhrLine > 0) AS list_value,
    count(*) FILTER (WHERE l.MivzaNo > 0) AS promo_lines,
    min(h.DateDoc::DATE) AS first_d, max(h.DateDoc::DATE) AS last_d
  FROM ${SALES}
  WHERE l.Scm = 0 AND l.Cmt > 0
  GROUP BY 1, 2)
SELECT base.prt AS prt, trim(p.Nm) AS item, base.branch_id AS branch_id, trim(s.Nm) AS branch, trim(dp.Nm) AS dept,
  base.free_lines AS free_lines, round(base.qty_given, 1) AS qty_given_own_unit, round(base.list_value, 1) AS list_value_ils,
  round(100.0*base.promo_lines/base.free_lines, 0) AS formal_promo_share_pct,
  base.first_d AS first_d, base.last_d AS last_d, base.promo_lines AS via_formal_promo_lines
FROM base
JOIN ${PRT} p ON p.C = base.prt
JOIN ${STORE} s ON s.C = base.branch_id
LEFT JOIN ${DEPT} dp ON dp.C = p.DepartmentC`
      })
    })
  ]
}) })

VerifiedReport('inventory-health', { impl: verifiedReport({
  title: 'בריאות מלאי',
  description: 'תמונת מלאי: שווי מלאי חיובי לפי סניף/מחלקה, מלאי שלילי (ארטיפקטים מול חשוד), מלאי מת וכבול-מזומן, סיכוני חוסר במהירי-תנועה, ועודפי כיסוי קיצוניים.',
  whenToUse: 'שאלות מלאי — כמה מלאי יש ושוויו, מה תקוע ולא נמכר, מה עומד להיגמר, איפה יש עודף או ספירה חשודה. קצב מכירה נגזר ממכירות 90 הימים האחרונים.',
  routePhrases: ['מלאי', 'בריאות מלאי', 'שווי מלאי', 'מלאי שלילי', 'מלאי מת', 'תקוע', 'חוסר', 'עודף מלאי', 'כיסוי', 'הזמנה'],
  questionsCovered: ['Q16', 'Q17', 'Q18', 'Q19', 'Q20', 'Q21', 'Q22', 'Q23'],
  caveats: `המלאי הוא צילום יום אחד (התאריך האחרון ב-Prt_ItrotStore_Yomi) — אין היסטוריית מלאי ואין נתוני קליטה, לכן פחת אמיתי (נקלט-נמכר-במלאי) אינו בר-חישוב; ~23% מהשורות שליליות ורובן ארטיפקטים (שקיות/פקדונות שנמכרים בקופה בלי קליטה) או פערי שקילה בירקות — לא גניבה. שווי לפי העלות האחרונה הידועה; כמויות בין פריטים מערבבות ק"ג ויחידות (₪ ניתן לסכימה, כמויות לא). מחסנים (מרלוג) מופיעים לצד סניפים — קרא בנפרד.`,
  executiveSummary: querySlot({
    goal: 'Inventory headline: positive stock value, negative-line share, dead stock cash, and stockout-risk count.',
    widget: { kind: 'kpi', title: 'מלאי — מבט מהיר', items: [{label: 'שווי מלאי (מ׳ ₪)', col: 'stock_value_M'}, {label: 'שורות חיוביות', col: 'positive_lines', format: 'int'}, {label: 'שורות שליליות', col: 'negative_lines', format: 'int'}, {label: 'נתח שלילי', col: 'negative_share_pct', format: '%'}, {label: 'מהירי תנועה בסיכון חוסר', col: 'fast_movers_under_2d_cover', format: 'int'}] },
    sql: `WITH ${COST_CTE},
snap AS (
  SELECT i.Prt AS prt, i.Store AS store_c, i.Itra AS itra, c.unit_cost
  FROM ${ITR} i
  JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
  LEFT JOIN cost c ON c.ItemID = i.Prt AND c.StoreID = i.Store),
r AS (
  SELECT l.PrtC AS prt, h.StoreC AS store_c, sum(l.Cmt)/90.0 AS rate
  FROM ${SALES}
  WHERE h.DateDoc::DATE > ${SNAP} - 90 AND l.Cmt > 0
  GROUP BY 1, 2 HAVING sum(l.Cmt)/90.0 >= 5)
SELECT
  round(sum(snap.itra*snap.unit_cost) FILTER (WHERE snap.itra > 0 AND snap.unit_cost IS NOT NULL)/1e6, 2) AS stock_value_M,
  count(*) FILTER (WHERE snap.itra > 0) AS positive_lines,
  count(*) FILTER (WHERE snap.itra < 0) AS negative_lines,
  round(100.0*count(*) FILTER (WHERE snap.itra < 0)/count(*), 1) AS negative_share_pct,
  (SELECT count(*) FROM r JOIN snap ON snap.prt = r.prt AND snap.store_c = r.store_c
   WHERE snap.itra > 0 AND snap.itra/r.rate <= 2) AS fast_movers_under_2d_cover
FROM snap LIMIT 1`
  }),
  summary: querySlot({
    goal: 'Stock value per location (branches and warehouses flagged), with cost coverage.',
    widget: { kind: 'hbar', title: 'שווי מלאי לפי אתר (₪)', valueFormat: '₪', name: 'location', value: 'stock_value_ils' },
    sql: `WITH ${COST_CTE},
icost AS (
  SELECT ItemID, arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE FinalRegularCostPrice > 0) AS unit_cost
  FROM ${DPC} GROUP BY ItemID)
SELECT trim(s.Nm) AS location,
  CASE WHEN regexp_matches(s.Nm, 'מרלוג|מחסן|מרלו') THEN 'warehouse' ELSE 'branch' END AS location_kind,
  round(sum(i.Itra*coalesce(c.unit_cost, ic.unit_cost)) FILTER (WHERE i.Itra > 0 AND coalesce(c.unit_cost, ic.unit_cost) IS NOT NULL)) AS stock_value_ils,
  count(*) FILTER (WHERE i.Itra > 0) AS positive_lines,
  count(*) FILTER (WHERE i.Itra < 0) AS negative_lines,
  round(100.0*count(*) FILTER (WHERE coalesce(c.unit_cost, ic.unit_cost) IS NOT NULL AND i.Itra > 0)
    /nullif(count(*) FILTER (WHERE i.Itra > 0), 0), 1) AS cost_coverage_pct
FROM ${ITR} i
JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
LEFT JOIN cost c ON c.ItemID = i.Prt AND c.StoreID = i.Store
LEFT JOIN icost ic ON ic.ItemID = i.Prt
GROUP BY 1, 2 ORDER BY stock_value_ils DESC NULLS LAST LIMIT 25`
  }),
  sections: [
    section({
      id: 'stock-value',
      title: 'שווי מלאי',
      goal: 'Total positive stock value per location and department, valued at the latest known cost (item×store, item-level fallback).',
      executiveSummary: querySlot({
        goal: 'Top 8 locations by positive stock value.',
        widget: { kind: 'treemap', title: 'איפה יושב המזומן — שווי מלאי (₪)', valueFormat: '₪', name: 'location', value: 'stock_value_ils' },
        sql: `WITH ${COST_CTE},
icost AS (
  SELECT ItemID, arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE FinalRegularCostPrice > 0) AS unit_cost
  FROM ${DPC} GROUP BY ItemID)
SELECT trim(s.Nm) AS location,
  round(sum(i.Itra*coalesce(c.unit_cost, ic.unit_cost)) FILTER (WHERE coalesce(c.unit_cost, ic.unit_cost) IS NOT NULL)) AS stock_value_ils,
  count(*) AS positive_lines
FROM ${ITR} i
JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
LEFT JOIN cost c ON c.ItemID = i.Prt AND c.StoreID = i.Store
LEFT JOIN icost ic ON ic.ItemID = i.Prt
WHERE i.Itra > 0
GROUP BY 1 ORDER BY stock_value_ils DESC NULLS LAST LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Stock value per location with negative-line counts and cost coverage — the full inventory balance sheet.',
        widget: { kind: 'table', title: 'מאזן מלאי לפי אתר', columns: [{key: 'location', label: 'אתר'}, {key: 'location_kind', label: 'סוג'}, {key: 'stock_value_ils', label: 'שווי', format: '₪'}, {key: 'positive_lines', label: 'שורות +', format: 'int'}, {key: 'negative_lines', label: 'שורות -', format: 'int'}, {key: 'cost_coverage_pct', label: 'כיסוי עלות', format: '%'}] },
        sql: `WITH ${COST_CTE},
icost AS (
  SELECT ItemID, arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE FinalRegularCostPrice > 0) AS unit_cost
  FROM ${DPC} GROUP BY ItemID)
SELECT trim(s.Nm) AS location,
  CASE WHEN regexp_matches(s.Nm, 'מרלוג|מחסן|מרלו') THEN 'warehouse' ELSE 'branch' END AS location_kind,
  round(sum(i.Itra*coalesce(c.unit_cost, ic.unit_cost)) FILTER (WHERE i.Itra > 0 AND coalesce(c.unit_cost, ic.unit_cost) IS NOT NULL)) AS stock_value_ils,
  count(*) FILTER (WHERE i.Itra > 0) AS positive_lines,
  count(*) FILTER (WHERE i.Itra < 0) AS negative_lines,
  round(100.0*count(*) FILTER (WHERE coalesce(c.unit_cost, ic.unit_cost) IS NOT NULL AND i.Itra > 0)
    /nullif(count(*) FILTER (WHERE i.Itra > 0), 0), 1) AS cost_coverage_pct
FROM ${ITR} i
JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
LEFT JOIN cost c ON c.ItemID = i.Prt AND c.StoreID = i.Store
LEFT JOIN icost ic ON ic.ItemID = i.Prt
GROUP BY 1, 2 ORDER BY stock_value_ils DESC NULLS LAST LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Stock value by location × department — where the cash sits on shelves.',
        widget: { kind: 'table', title: 'שווי מלאי — אתר × מחלקה', columns: [{key: 'location', label: 'אתר'}, {key: 'dept', label: 'מחלקה'}, {key: 'stock_value_ils', label: 'שווי', format: '₪'}, {key: 'positive_lines', label: 'שורות', format: 'int'}] },
        sql: `WITH ${COST_CTE},
icost AS (
  SELECT ItemID, arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE FinalRegularCostPrice > 0) AS unit_cost
  FROM ${DPC} GROUP BY ItemID)
SELECT trim(s.Nm) AS location, trim(dp.Nm) AS dept,
  round(sum(i.Itra*coalesce(c.unit_cost, ic.unit_cost)) FILTER (WHERE coalesce(c.unit_cost, ic.unit_cost) IS NOT NULL)) AS stock_value_ils,
  count(*) AS positive_lines
FROM ${ITR} i
JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
JOIN ${PRT} p ON p.C = i.Prt
LEFT JOIN ${DEPT} dp ON dp.C = p.DepartmentC
LEFT JOIN cost c ON c.ItemID = i.Prt AND c.StoreID = i.Store
LEFT JOIN icost ic ON ic.ItemID = i.Prt
WHERE i.Itra > 0
GROUP BY 1, 2 ORDER BY stock_value_ils DESC NULLS LAST LIMIT 50`
      }),
      fullData: fullData({
        description: 'Item × location × department stock aggregates: value, positive and negative lines.',
        grain: 'one row per (item, location, department) stock snapshot line',
        columns: 'location_id, location, location_kind: branch/warehouse, prt, item, dept, stock_value_ils (positive stock at latest cost), positive_lines, negative_lines',
        viewSql: `WITH ${COST_CTE},
icost AS (
  SELECT ItemID, arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE FinalRegularCostPrice > 0) AS unit_cost
  FROM ${DPC} GROUP BY ItemID)
SELECT i.Store AS location_id, trim(s.Nm) AS location,
  CASE WHEN regexp_matches(s.Nm, 'מרלוג|מחסן|מרלו') THEN 'warehouse' ELSE 'branch' END AS location_kind,
  i.Prt AS prt, trim(p.Nm) AS item, trim(dp.Nm) AS dept,
  round(sum(i.Itra*coalesce(c.unit_cost, ic.unit_cost)) FILTER (WHERE i.Itra > 0 AND coalesce(c.unit_cost, ic.unit_cost) IS NOT NULL), 1) AS stock_value_ils,
  count(*) FILTER (WHERE i.Itra > 0) AS positive_lines,
  count(*) FILTER (WHERE i.Itra < 0) AS negative_lines
FROM ${ITR} i
JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
JOIN ${PRT} p ON p.C = i.Prt
LEFT JOIN ${DEPT} dp ON dp.C = p.DepartmentC
LEFT JOIN cost c ON c.ItemID = i.Prt AND c.StoreID = i.Store
LEFT JOIN icost ic ON ic.ItemID = i.Prt
GROUP BY 1, 2, 3, 4, 5, 6`
      })
    }),
    section({
      id: 'negative-stock',
      title: 'מלאי שלילי',
      goal: 'Negative on-hand split into process artifacts (bags/deposits), weighed-produce count drift, pack/single unit-of-measure artifacts (single sold but same product held positive as a pack/tray), and genuinely suspicious packaged goods — the audit-worthy list.',
      caveats: 'שלילי על שקיות/פקדונות = נמכר בקופה בלי קליטה (ארטיפקט תהליך, לא גניבה); ירקות שקילים = פערי שקילה בתחנות השקילה; ארוז שלילי שמולו מלאי חיובי של אותו מוצר באריזה אחרת (שישייה/תריסר) = ארטיפקט יחידת-מידה (נקלט כמארז, נמכר כבודד — קוקה קולה 1.5 ליטר הוא הדוגמה הקלאסית), לא גניבה. הרשימה החשודה האמיתית: מוצרים ארוזים בכמויות שלמות ללא מארז מקזז. ללא נתוני קליטה אי-אפשר להבחין גניבה משגיאת קליטה — כיוון בלבד.',
      executiveSummary: querySlot({
        goal: 'Negative-stock scale: line counts and cost-valued loss proxy per kind (artifact / weighed produce / pack-single UoM / packaged suspicious).',
        widget: { kind: 'bar', title: 'מלאי שלילי לפי סוג — פרוקסי הפסד (₪)', valueFormat: '₪', name: 'kind', value: 'loss_proxy_ils' },
        sql: `WITH ${NEG_CTE}
SELECT kind, count(*) AS negative_lines,
  round(sum(-itra*unit_cost) FILTER (WHERE unit_cost IS NOT NULL)) AS loss_proxy_ils
FROM nl GROUP BY 1 ORDER BY loss_proxy_ils DESC NULLS LAST LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 suspicious packaged-goods negatives by cost-valued severity.',
        widget: { kind: 'table', title: 'שליליים חשודים — מוצרים ארוזים', columns: [{key: 'item', label: 'פריט'}, {key: 'location', label: 'אתר'}, {key: 'dept', label: 'מחלקה'}, {key: 'neg_stock_qty', label: 'כמות שלילית'}, {key: 'loss_proxy_ils', label: 'פרוקסי הפסד', format: '₪'}] },
        sql: `WITH ${NEG_CTE}
SELECT prt, item, location, dept,
  round(itra, 1) AS neg_stock_qty, round(-itra*unit_cost) AS loss_proxy_ils
FROM nl WHERE kind = 'packaged_suspicious' AND unit_cost IS NOT NULL
ORDER BY loss_proxy_ils DESC NULLS LAST LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Worst 50 negatives of ALL kinds with the kind label — the complete negative-stock severity picture including artifacts.',
        widget: { kind: 'table', title: 'השליליים החמורים — כל הסוגים', columns: [{key: 'item', label: 'פריט'}, {key: 'location', label: 'אתר'}, {key: 'neg_stock_qty', label: 'כמות שלילית'}, {key: 'loss_proxy_ils', label: 'פרוקסי הפסד', format: '₪'}, {key: 'kind', label: 'סוג'}] },
        sql: `WITH ${NEG_CTE}
SELECT prt, item, location, dept,
  round(itra, 1) AS neg_stock_qty, round(-itra*unit_cost) AS loss_proxy_ils, kind
FROM nl ORDER BY itra ASC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Every negative on-hand line with kind classification and cost-valued severity.',
        grain: 'one row per negative (item, location) line (~60K rows)',
        columns: 'prt, item, location_id, location, dept, neg_stock_qty (item own unit), unit_cost, loss_proxy_ils, kind: artifact_bags_deposits / weighed_produce_drift / pack_single_uom_artifact (single sold, same product held positive as a pack — NOT shrink) / packaged_suspicious',
        perItemOnly: 'neg_stock_qty,unit_cost',
        viewSql: `WITH ${NEG_CTE}
SELECT prt, item, location_id, location, dept,
  round(itra, 2) AS neg_stock_qty, round(unit_cost, 3) AS unit_cost,
  round(-itra*unit_cost, 1) AS loss_proxy_ils, kind
FROM nl`
      })
    }),
    section({
      id: 'dead-stock',
      title: 'מלאי מת וכבול-מזומן',
      goal: 'Positive on-hand with ZERO sales in the last 60 days (tied cash), including discontinued items still holding stock.',
      caveats: 'אין היסטוריית מלאי — "לא נמכר 60+ יום" = מלאי חיובי היום עם אפס מכירות ב-60 הימים האחרונים. שורות מרלוג הן מלאי מרכזי, לא עודף מדף. כיסוי עלות על פריטים בארכיון חלקי — שווים הוא רף תחתון. המלאי פיזית על קוד פריט, לכן הדוח ברמת קוד: קוד "מת" עשוי להיות רישום עונתי ישן של מוצר חי שנמכר תחת קוד חדש — בדקו את השם לפני פסילת המוצר.',
      executiveSummary: querySlot({
        goal: 'Dead-stock scale: active items with zero 60-day sales vs discontinued-but-stocked, lines and tied cash.',
        widget: { kind: 'pie', title: 'מזומן כבול במלאי מת (₪)', donut: true, valueFormat: '₪', name: 'kind', value: 'tied_cash_ils' },
        sql: `WITH ${COST_CTE},
sales60 AS (
  SELECT l.PrtC AS prt, h.StoreC AS store_c, sum(l.Cmt) AS q
  FROM ${SALES} WHERE h.DateDoc::DATE > ${SNAP} - 60 GROUP BY 1, 2)
SELECT CASE WHEN p.ArchiveDate IS NOT NULL THEN 'discontinued_still_stocked' ELSE 'active_no_sales_60d' END AS kind,
  count(*) AS lines,
  round(sum(i.Itra*c.unit_cost)) AS tied_cash_ils
FROM ${ITR} i
JOIN ${PRT} p ON p.C = i.Prt
JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
JOIN cost c ON c.ItemID = i.Prt AND c.StoreID = i.Store
LEFT JOIN sales60 f ON f.prt = i.Prt AND f.store_c = i.Store
WHERE i.Itra > 0 AND coalesce(f.q, 0) <= 0
  AND NOT regexp_matches(p.Nm, 'לא קיים|היטל|לא במגוון|פריט חדש')
GROUP BY 1 ORDER BY tied_cash_ils DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 dead-stock lines by tied cash.',
        widget: { kind: 'table', title: 'מלאי מת — שורות גדולות', columns: [{key: 'item', label: 'פריט'}, {key: 'location', label: 'אתר'}, {key: 'stock_qty', label: 'כמות'}, {key: 'tied_cash_ils', label: 'מזומן כבול', format: '₪'}, {key: 'item_status', label: 'סטטוס'}] },
        sql: `WITH ${COST_CTE},
sales60 AS (
  SELECT l.PrtC AS prt, h.StoreC AS store_c, sum(l.Cmt) AS q
  FROM ${SALES} WHERE h.DateDoc::DATE > ${SNAP} - 60 GROUP BY 1, 2)
SELECT i.Prt AS prt, trim(p.Nm) AS item, trim(s.Nm) AS location,
  round(i.Itra, 1) AS stock_qty, round(i.Itra*c.unit_cost) AS tied_cash_ils,
  CASE WHEN p.ArchiveDate IS NOT NULL THEN 'discontinued' ELSE 'active' END AS item_status
FROM ${ITR} i
JOIN ${PRT} p ON p.C = i.Prt
JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
JOIN cost c ON c.ItemID = i.Prt AND c.StoreID = i.Store
LEFT JOIN sales60 f ON f.prt = i.Prt AND f.store_c = i.Store
WHERE i.Itra > 0 AND coalesce(f.q, 0) <= 0
  AND NOT regexp_matches(p.Nm, 'לא קיים|היטל|לא במגוון|פריט חדש')
ORDER BY tied_cash_ils DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Top 50 dead-stock lines with department, last sale date and days since — clearance prioritization.',
        widget: { kind: 'table', title: 'עדיפות חיסול מלאי מת', columns: [{key: 'item', label: 'פריט'}, {key: 'location', label: 'אתר'}, {key: 'tied_cash_ils', label: 'מזומן כבול', format: '₪'}, {key: 'days_since_last_sale', label: 'ימים ממכירה', format: 'int'}, {key: 'last_sale_d', label: 'מכירה אחרונה'}, {key: 'item_status', label: 'סטטוס'}] },
        sql: `WITH ${COST_CTE},
sales60 AS (
  SELECT l.PrtC AS prt, h.StoreC AS store_c, sum(l.Cmt) AS q
  FROM ${SALES} WHERE h.DateDoc::DATE > ${SNAP} - 60 GROUP BY 1, 2),
last_sale AS (
  SELECT l.PrtC AS prt, h.StoreC AS store_c, max(h.DateDoc::DATE) AS last_sale_d
  FROM ${SALES} GROUP BY 1, 2)
SELECT i.Prt AS prt, trim(p.Nm) AS item, trim(s.Nm) AS location, trim(dp.Nm) AS dept,
  round(i.Itra, 1) AS stock_qty, round(i.Itra*c.unit_cost) AS tied_cash_ils,
  ls.last_sale_d, ${SNAP} - ls.last_sale_d AS days_since_last_sale,
  CASE WHEN p.ArchiveDate IS NOT NULL THEN 'discontinued' ELSE 'active' END AS item_status
FROM ${ITR} i
JOIN ${PRT} p ON p.C = i.Prt
JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
LEFT JOIN ${DEPT} dp ON dp.C = p.DepartmentC
JOIN cost c ON c.ItemID = i.Prt AND c.StoreID = i.Store
LEFT JOIN sales60 f ON f.prt = i.Prt AND f.store_c = i.Store
LEFT JOIN last_sale ls ON ls.prt = i.Prt AND ls.store_c = i.Store
WHERE i.Itra > 0 AND coalesce(f.q, 0) <= 0
  AND NOT regexp_matches(p.Nm, 'לא קיים|היטל|לא במגוון|פריט חדש')
ORDER BY tied_cash_ils DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'All positive-stock lines with 60-day sales, last sale date, tied cash and item status — the full slow-mover base.',
        grain: 'one row per positive-stock (item, location) with known cost (~180K rows)',
        columns: 'prt, item, location_id, location, dept, stock_qty, tied_cash_ils, qty_sold_60d, last_sale_d, item_status: active/discontinued',
        perItemOnly: 'stock_qty',
        viewSql: `WITH ${COST_CTE},
sales60 AS (
  SELECT l.PrtC AS prt, h.StoreC AS store_c, sum(l.Cmt) AS q, max(h.DateDoc::DATE) AS last_sale_d
  FROM ${SALES} GROUP BY 1, 2)
SELECT i.Prt AS prt, trim(p.Nm) AS item, i.Store AS location_id, trim(s.Nm) AS location, trim(dp.Nm) AS dept,
  round(i.Itra, 1) AS stock_qty,
  round(i.Itra*c.unit_cost, 1) AS tied_cash_ils,
  round(coalesce(s60.q, 0), 1) AS qty_sold_60d,
  s60.last_sale_d,
  CASE WHEN p.ArchiveDate IS NOT NULL THEN 'discontinued' ELSE 'active' END AS item_status
FROM ${ITR} i
JOIN ${PRT} p ON p.C = i.Prt
JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
LEFT JOIN ${DEPT} dp ON dp.C = p.DepartmentC
JOIN cost c ON c.ItemID = i.Prt AND c.StoreID = i.Store
LEFT JOIN (
  SELECT prt, store_c, sum(q) FILTER (WHERE TRUE) AS q, max(last_sale_d) AS last_sale_d
  FROM (SELECT prt, store_c, q, last_sale_d FROM sales60) GROUP BY 1, 2
) s60 ON s60.prt = i.Prt AND s60.store_c = i.Store
WHERE i.Itra > 0`
      })
    }),
    section({
      id: 'stockout-risk',
      title: 'סיכון חוסרים והזמנה',
      goal: 'Fast movers near zero cover right now, and the wider reorder-this-week list with suggested top-up quantities.',
      caveats: 'קצב = ממוצע שטוח של 90 הימים האחרונים עד יום הצילום (ללא מודל יום-בשבוע/מבצע); כיסוי = מלאי/קצב באותה יחידת פריט (בטוח ק"ג/יח\'). מתכלים יומיים בכיסוי נמוך הם חלקית נורמליים. שורות פקדון מסוננות מרשימת ההזמנה.',
      executiveSummary: querySlot({
        goal: 'Top 8 fast movers (>=5/day) with the lowest days of cover.',
        widget: { kind: 'table', title: 'מהירי תנועה על סף חוסר', columns: [{key: 'item', label: 'פריט'}, {key: 'location', label: 'אתר'}, {key: 'stock_qty', label: 'מלאי'}, {key: 'daily_rate', label: 'קצב יומי'}, {key: 'days_cover', label: 'ימי כיסוי'}] },
        sql: `WITH r AS (
  SELECT l.PrtC AS prt, h.StoreC AS store_c, sum(l.Cmt)/90.0 AS rate
  FROM ${SALES}
  WHERE h.DateDoc::DATE > ${SNAP} - 90 AND l.Cmt > 0
  GROUP BY 1, 2 HAVING sum(l.Cmt)/90.0 >= 5)
SELECT trim(p.Nm) AS item, trim(s.Nm) AS location, round(i.Itra, 1) AS stock_qty,
  round(r.rate, 1) AS daily_rate, round(i.Itra/r.rate, 2) AS days_cover
FROM r
JOIN ${ITR} i ON i.Prt = r.prt AND i.Store = r.store_c
JOIN ${PRT} p ON p.C = i.Prt
JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
WHERE i.Itra > 0 AND i.Itra/r.rate <= 2
ORDER BY r.rate DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 stockout risks: fast movers with cover <= 2 days.',
        widget: { kind: 'table', title: 'סיכוני חוסר — כיסוי עד יומיים', columns: [{key: 'item', label: 'פריט'}, {key: 'location', label: 'אתר'}, {key: 'stock_qty', label: 'מלאי'}, {key: 'daily_rate', label: 'קצב יומי'}, {key: 'days_cover', label: 'ימי כיסוי'}] },
        sql: `WITH r AS (
  SELECT l.PrtC AS prt, h.StoreC AS store_c, sum(l.Cmt)/90.0 AS rate
  FROM ${SALES}
  WHERE h.DateDoc::DATE > ${SNAP} - 90 AND l.Cmt > 0
  GROUP BY 1, 2 HAVING sum(l.Cmt)/90.0 >= 5)
SELECT i.Prt AS prt, trim(p.Nm) AS item, trim(s.Nm) AS location, round(i.Itra, 1) AS stock_qty,
  round(r.rate, 1) AS daily_rate, round(i.Itra/r.rate, 2) AS days_cover
FROM r
JOIN ${ITR} i ON i.Prt = r.prt AND i.Store = r.store_c
JOIN ${PRT} p ON p.C = i.Prt AND p.ArchiveDate IS NULL
JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
WHERE i.Itra > 0 AND i.Itra/r.rate <= 2
ORDER BY r.rate DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Reorder-this-week list: movers >=3/day with cover < 7 days, suggested order = top-up to 7 days of cover (deposits filtered out).',
        widget: { kind: 'table', title: 'רשימת הזמנה לשבוע', columns: [{key: 'item', label: 'פריט'}, {key: 'location', label: 'אתר'}, {key: 'stock_qty', label: 'מלאי'}, {key: 'daily_rate', label: 'קצב יומי'}, {key: 'days_cover', label: 'ימי כיסוי'}, {key: 'suggest_order_qty', label: 'הזמנה מוצעת', format: 'int'}] },
        sql: `WITH r AS (
  SELECT l.PrtC AS prt, h.StoreC AS store_c, sum(l.Cmt)/90.0 AS rate
  FROM ${SALES}
  WHERE h.DateDoc::DATE > ${SNAP} - 90 AND l.Cmt > 0
  GROUP BY 1, 2 HAVING sum(l.Cmt)/90.0 >= 3)
SELECT i.Prt AS prt, trim(p.Nm) AS item, trim(s.Nm) AS location, round(i.Itra, 1) AS stock_qty,
  round(r.rate, 1) AS daily_rate, round(i.Itra/r.rate, 1) AS days_cover,
  ceil(r.rate*7 - i.Itra) AS suggest_order_qty
FROM r
JOIN ${ITR} i ON i.Prt = r.prt AND i.Store = r.store_c
JOIN ${PRT} p ON p.C = i.Prt AND p.ArchiveDate IS NULL
JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
WHERE i.Itra > 0 AND i.Itra/r.rate < 7
  AND NOT regexp_matches(p.Nm, 'פקדון|פיקדון|שקית')
ORDER BY r.rate DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Item×location cover table for all movers (>=1/day over the last 90 days) with positive stock.',
        grain: 'one row per (item, location) mover with positive stock (~20K rows)',
        columns: 'prt, item, location_id, location, dept, stock_qty, daily_rate (own unit/day), days_cover, item_status',
        perItemOnly: 'stock_qty,daily_rate',
        viewSql: `WITH r AS (
  SELECT l.PrtC AS prt, h.StoreC AS store_c, sum(l.Cmt)/90.0 AS rate
  FROM ${SALES}
  WHERE h.DateDoc::DATE > ${SNAP} - 90 AND l.Cmt > 0
  GROUP BY 1, 2 HAVING sum(l.Cmt)/90.0 >= 1)
SELECT i.Prt AS prt, trim(p.Nm) AS item, i.Store AS location_id, trim(s.Nm) AS location, trim(dp.Nm) AS dept,
  round(i.Itra, 1) AS stock_qty, round(r.rate, 2) AS daily_rate,
  round(i.Itra/r.rate, 1) AS days_cover,
  CASE WHEN p.ArchiveDate IS NOT NULL THEN 'discontinued' ELSE 'active' END AS item_status
FROM r
JOIN ${ITR} i ON i.Prt = r.prt AND i.Store = r.store_c
JOIN ${PRT} p ON p.C = i.Prt
JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
LEFT JOIN ${DEPT} dp ON dp.C = p.DepartmentC
WHERE i.Itra > 0`
      })
    }),
    section({
      id: 'overstock',
      title: 'עודף מלאי וכיסוי קיצוני',
      goal: 'Perishables (and any item) with days-of-cover far beyond shelf life — tied cash plus a reliability flag, since weighed-produce counts are known to be unreliable.',
      caveats: 'שורות עם כיסוי בלתי-אפשרי פיזית (מאות ימים על ירקות) הן כמעט תמיד ספירה מנופחת/לא-מתואמת של פריטים שקילים — דגל איכות-נתונים לספירה מחדש, לא עודף אמיתי. מחלקות מתכלים מזוהות לפי שם (טרי/ירקות/חלב/דגים/בשר/מעדניה).',
      executiveSummary: querySlot({
        goal: 'Top 8 perishable overstock lines by tied cash (cover > 14 days), with the weighed-unreliability flag.',
        widget: { kind: 'scatter', title: 'עודף מתכלים — כיסוי מול מזומן כבול', x: 'days_cover', y: 'tied_cash_ils', name: 'item', xLabel: 'ימי כיסוי', yLabel: 'מזומן כבול (₪)', xFormat: 'int', yFormat: '₪' },
        sql: `WITH ${COST_CTE},
r AS (
  SELECT l.PrtC AS prt, h.StoreC AS store_c, sum(l.Cmt)/90.0 AS rate
  FROM ${SALES}
  WHERE h.DateDoc::DATE > ${SNAP} - 90 AND l.Cmt > 0
  GROUP BY 1, 2 HAVING sum(l.Cmt) > 0)
SELECT trim(p.Nm) AS item, trim(s.Nm) AS location, trim(dp.Nm) AS dept,
  round(i.Itra, 1) AS stock_qty, round(r.rate, 2) AS daily_rate,
  round(i.Itra/r.rate, 1) AS days_cover, round(i.Itra*c.unit_cost) AS tied_cash_ils,
  CASE WHEN p.DepartmentC IN (11, 12) OR i.Itra <> floor(i.Itra) THEN 'weighed_count_unreliable' ELSE 'count_plausible' END AS reliability
FROM r
JOIN ${ITR} i ON i.Prt = r.prt AND i.Store = r.store_c
JOIN ${PRT} p ON p.C = i.Prt AND p.ArchiveDate IS NULL
JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
JOIN ${DEPT} dp ON dp.C = p.DepartmentC
JOIN cost c ON c.ItemID = i.Prt AND c.StoreID = i.Store
WHERE i.Itra > 0 AND i.Itra/r.rate > 14
  AND regexp_matches(dp.Nm, 'פירות|ירקות|חלב|ביצים|דגים|בשר|עוף|מעדנ|טרי')
ORDER BY tied_cash_ils DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 perishable overstock lines by tied cash.',
        widget: { kind: 'table', title: 'עודפי מתכלים לפי מזומן כבול', columns: [{key: 'item', label: 'פריט'}, {key: 'location', label: 'אתר'}, {key: 'dept', label: 'מחלקה'}, {key: 'days_cover', label: 'ימי כיסוי'}, {key: 'tied_cash_ils', label: 'מזומן כבול', format: '₪'}, {key: 'reliability', label: 'אמינות ספירה'}] },
        sql: `WITH ${COST_CTE},
r AS (
  SELECT l.PrtC AS prt, h.StoreC AS store_c, sum(l.Cmt)/90.0 AS rate
  FROM ${SALES}
  WHERE h.DateDoc::DATE > ${SNAP} - 90 AND l.Cmt > 0
  GROUP BY 1, 2 HAVING sum(l.Cmt) > 0)
SELECT i.Prt AS prt, trim(p.Nm) AS item, trim(s.Nm) AS location, trim(dp.Nm) AS dept,
  round(i.Itra, 1) AS stock_qty, round(r.rate, 2) AS daily_rate,
  round(i.Itra/r.rate, 1) AS days_cover, round(i.Itra*c.unit_cost) AS tied_cash_ils,
  CASE WHEN p.DepartmentC IN (11, 12) OR i.Itra <> floor(i.Itra) THEN 'weighed_count_unreliable' ELSE 'count_plausible' END AS reliability
FROM r
JOIN ${ITR} i ON i.Prt = r.prt AND i.Store = r.store_c
JOIN ${PRT} p ON p.C = i.Prt AND p.ArchiveDate IS NULL
JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
JOIN ${DEPT} dp ON dp.C = p.DepartmentC
JOIN cost c ON c.ItemID = i.Prt AND c.StoreID = i.Store
WHERE i.Itra > 0 AND i.Itra/r.rate > 14
  AND regexp_matches(dp.Nm, 'פירות|ירקות|חלב|ביצים|דגים|בשר|עוף|מעדנ|טרי')
ORDER BY tied_cash_ils DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'All-department days-of-cover extremes (>30 days, tied cash > 1000) — the chain-wide overstock and count-anomaly screen.',
        widget: { kind: 'table', title: 'קיצוני כיסוי — כל המחלקות', columns: [{key: 'item', label: 'פריט'}, {key: 'location', label: 'אתר'}, {key: 'dept', label: 'מחלקה'}, {key: 'days_cover', label: 'ימי כיסוי'}, {key: 'tied_cash_ils', label: 'מזומן כבול', format: '₪'}, {key: 'reliability', label: 'אמינות ספירה'}] },
        sql: `WITH ${COST_CTE},
r AS (
  SELECT l.PrtC AS prt, h.StoreC AS store_c, sum(l.Cmt)/90.0 AS rate
  FROM ${SALES}
  WHERE h.DateDoc::DATE > ${SNAP} - 90 AND l.Cmt > 0
  GROUP BY 1, 2 HAVING sum(l.Cmt) > 0)
SELECT i.Prt AS prt, trim(p.Nm) AS item, trim(s.Nm) AS location, trim(dp.Nm) AS dept,
  round(i.Itra, 1) AS stock_qty, round(r.rate, 2) AS daily_rate,
  round(i.Itra/r.rate, 1) AS days_cover, round(i.Itra*c.unit_cost) AS tied_cash_ils,
  CASE WHEN p.DepartmentC IN (11, 12) OR i.Itra <> floor(i.Itra) THEN 'weighed_count_unreliable' ELSE 'count_plausible' END AS reliability
FROM r
JOIN ${ITR} i ON i.Prt = r.prt AND i.Store = r.store_c
JOIN ${PRT} p ON p.C = i.Prt AND p.ArchiveDate IS NULL
JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
LEFT JOIN ${DEPT} dp ON dp.C = p.DepartmentC
JOIN cost c ON c.ItemID = i.Prt AND c.StoreID = i.Store
WHERE i.Itra > 0 AND i.Itra/r.rate > 30 AND i.Itra*c.unit_cost > 1000
ORDER BY tied_cash_ils DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Item×location days-of-cover for every positive-stock mover, with tied cash and reliability flag — the base for any overstock threshold.',
        grain: 'one row per (item, location) with positive stock and any 90-day sales (~90K rows)',
        columns: 'prt, item, location_id, location, dept, stock_qty, daily_rate, days_cover, tied_cash_ils (NULL when cost unknown), reliability',
        perItemOnly: 'stock_qty,daily_rate',
        viewSql: `WITH ${COST_CTE},
r AS (
  SELECT l.PrtC AS prt, h.StoreC AS store_c, sum(l.Cmt)/90.0 AS rate
  FROM ${SALES}
  WHERE h.DateDoc::DATE > ${SNAP} - 90 AND l.Cmt > 0
  GROUP BY 1, 2 HAVING sum(l.Cmt) > 0)
SELECT i.Prt AS prt, trim(p.Nm) AS item, i.Store AS location_id, trim(s.Nm) AS location, trim(dp.Nm) AS dept,
  round(i.Itra, 1) AS stock_qty, round(r.rate, 3) AS daily_rate,
  round(i.Itra/r.rate, 1) AS days_cover,
  round(i.Itra*c.unit_cost, 1) AS tied_cash_ils,
  CASE WHEN p.DepartmentC IN (11, 12) OR i.Itra <> floor(i.Itra) THEN 'weighed_count_unreliable' ELSE 'count_plausible' END AS reliability
FROM r
JOIN ${ITR} i ON i.Prt = r.prt AND i.Store = r.store_c
JOIN ${PRT} p ON p.C = i.Prt
JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
LEFT JOIN ${DEPT} dp ON dp.C = p.DepartmentC
LEFT JOIN cost c ON c.ItemID = i.Prt AND c.StoreID = i.Store
WHERE i.Itra > 0`
      })
    })
  ]
}) })

VerifiedReport('customers-loyalty', { impl: verifiedReport({
  title: 'לקוחות ונאמנות',
  description: 'תמהיל הלקוחות (אנונימי/מזוהה/וולט/צריכה עצמית), הלקוחות המזוהים הגדולים, אימוץ מועדון הלקוחות, אותות נטישה של קבועים, והרכב הסל (מחלקות שנקנות יחד).',
  whenToUse: 'שאלות על לקוחות — מי קונה, כמה מההכנסה מזוהה, מי הפסיק לקנות, מה קונים יחד, ומה מצב המועדון. ניתוחי מועדון תקפים רק על החודש המלא האחרון של נתוני MOADON.',
  routePhrases: ['לקוחות', 'לקוח', 'נאמנות', 'מועדון', 'כרטיס מועדון', 'לקוחות מובילים', 'נטישה', 'סל לקוח', 'וולט', 'מה קונים יחד'],
  questionsCovered: ['Q30', 'Q32', 'Q33', 'Q34'],
  caveats: `"לקוח כללי" הם דליי-אנונימיים פר-סניף (~64% מהנטו) — לא אנשים. לקוחות מזוהים אמיתיים = חשבונות בשם מסוג Idx.Type 900 (משקי בית) ו-1 (עסקים) בניכוי וולט/צריכה עצמית. MOADON_NO נקלט רק מ-2026-05-16 (100% מיוני-2026) — ניתוחי מועדון תקפים ליוני-2026 בלבד; כרטיסים עם ≥10 קבלות/יום הם כרטיסי ברירת-מחדל סניפיים ומוחרגים. וולט נספר מהספר הראשי בלבד (אין כפל עם ספר Lk).`,
  executiveSummary: querySlot({
    goal: 'Customer-mix headline (2024+): revenue share by segment — anonymous buckets, identified named, Wolt, self-use.',
    widget: { kind: 'pie', title: 'תמהיל לקוחות — נטו (מ׳ ₪)', donut: true, name: 'segment', value: 'net_M' },
    sql: `SELECT CASE
    WHEN i.Nm LIKE 'לקוח כללי%' THEN 'anonymous_bucket'
    WHEN i.Nm LIKE '%וולט%' THEN 'wolt_delivery'
    WHEN i.Nm LIKE 'צריכה עצמית%' THEN 'self_consumption'
    WHEN i.Type IN (1, 900) THEN 'identified_named'
    ELSE 'other' END AS segment,
  round(sum(h.Scm - h.ScmMaam)/1e6, 1) AS net_M,
  round(100.0*sum(h.Scm - h.ScmMaam)/sum(sum(h.Scm - h.ScmMaam)) OVER (), 1) AS share_pct,
  count(*) FILTER (WHERE h.Scm > 0) AS receipts
FROM ${H} h LEFT JOIN ${IDX} i ON i.C = h.CustomerC
WHERE h.DateDoc >= DATE '2024-01-01'
GROUP BY 1 ORDER BY net_M DESC LIMIT 8`
  }),
  summary: querySlot({
    goal: 'Segment mix by year: net and share per segment for each of the last 3 calendar years — is identified revenue growing.',
    widget: { kind: 'groupedBar', title: 'נטו לפי פלח ושנה (מ׳ ₪)', category: 'segment', ys: [{col: 'net_2y_ago_M', label: 'לפני שנתיים'}, {col: 'net_prev_year_M', label: 'אשתקד'}, {col: 'net_cur_year_M', label: 'השנה'}] },
    sql: `WITH seg AS (
  SELECT year(h.DateDoc) AS yr,
    CASE WHEN i.Nm LIKE 'לקוח כללי%' THEN 'anonymous_bucket'
      WHEN i.Nm LIKE '%וולט%' THEN 'wolt_delivery'
      WHEN i.Nm LIKE 'צריכה עצמית%' THEN 'self_consumption'
      WHEN i.Type IN (1, 900) THEN 'identified_named'
      ELSE 'other' END AS segment,
    sum(h.Scm - h.ScmMaam) AS net
  FROM ${H} h LEFT JOIN ${IDX} i ON i.C = h.CustomerC
  WHERE h.DateDoc >= DATE '2024-01-01'
  GROUP BY 1, 2)
SELECT segment,
  round(sum(net) FILTER (WHERE yr = year(${LAST_FULL}) - 2)/1e6, 1) AS net_2y_ago_M,
  round(sum(net) FILTER (WHERE yr = year(${LAST_FULL}) - 1)/1e6, 1) AS net_prev_year_M,
  round(sum(net) FILTER (WHERE yr = year(${LAST_FULL}))/1e6, 1) AS net_cur_year_M,
  round(100.0*sum(net) FILTER (WHERE yr = year(${LAST_FULL}))
    /sum(sum(net) FILTER (WHERE yr = year(${LAST_FULL}))) OVER (), 1) AS share_cur_year_pct
FROM seg GROUP BY 1 ORDER BY net_cur_year_M DESC NULLS LAST LIMIT 8`
  }),
  sections: [
    section({
      id: 'mix',
      title: 'תמהיל לקוחות',
      goal: 'Revenue split between anonymous walk-in buckets, identified named accounts, Wolt delivery and self-use — overall, per branch, and over time.',
      executiveSummary: querySlot({
        goal: 'Segment shares 2024+ with receipts and average basket per segment.',
        widget: { kind: 'pie', title: 'פלחי לקוחות — נטו (מ׳ ₪)', donut: true, name: 'segment', value: 'net_M' },
        sql: `SELECT segment,
  round(sum(net)/1e6, 1) AS net_M,
  round(100.0*sum(net)/sum(sum(net)) OVER (), 1) AS share_pct,
  sum(receipts) AS receipts,
  round(sum(net_pos)/nullif(sum(receipts), 0), 1) AS basket
FROM full_data
GROUP BY 1 ORDER BY net_M DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Segment mix per branch: identified vs anonymous share of each branch revenue (last 12 complete months).',
        widget: { kind: 'stackedBar', title: 'תמהיל פלחים לפי סניף', valueFormat: '%', category: 'branch', ys: [{col: 'anonymous_share_pct', label: 'אנונימי'}, {col: 'identified_share_pct', label: 'מזוהה'}, {col: 'wolt_share_pct', label: 'וולט'}, {col: 'self_use_share_pct', label: 'צריכה עצמית'}] },
        sql: `SELECT branch,
  round(sum(net)/1e6, 2) AS net_12m_M,
  round(100.0*sum(net) FILTER (WHERE segment = 'anonymous_bucket')/nullif(sum(net), 0), 1) AS anonymous_share_pct,
  round(100.0*sum(net) FILTER (WHERE segment = 'identified_named')/nullif(sum(net), 0), 1) AS identified_share_pct,
  round(100.0*sum(net) FILTER (WHERE segment = 'wolt_delivery')/nullif(sum(net), 0), 1) AS wolt_share_pct,
  round(100.0*sum(net) FILTER (WHERE segment = 'self_consumption')/nullif(sum(net), 0), 1) AS self_use_share_pct
FROM full_data
WHERE ym >= strftime(${M_END} - INTERVAL 12 MONTH, '%Y-%m') AND ym < strftime(${M_END}, '%Y-%m')
GROUP BY 1 ORDER BY net_12m_M DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Monthly segment trend over the last 13 complete months — is the identified/delivery share shifting.',
        widget: { kind: 'line', title: 'נתחי פלחים לאורך זמן', valueFormat: '%', x: 'ym', ys: [{col: 'anonymous_share_pct', label: 'אנונימי'}, {col: 'identified_share_pct', label: 'מזוהה'}, {col: 'wolt_share_pct', label: 'וולט'}, {col: 'self_use_share_pct', label: 'צריכה עצמית'}] },
        sql: `SELECT ym,
  round(sum(net)/1e6, 2) AS net_M,
  round(100.0*sum(net) FILTER (WHERE segment = 'anonymous_bucket')/nullif(sum(net), 0), 1) AS anonymous_share_pct,
  round(100.0*sum(net) FILTER (WHERE segment = 'identified_named')/nullif(sum(net), 0), 1) AS identified_share_pct,
  round(100.0*sum(net) FILTER (WHERE segment = 'wolt_delivery')/nullif(sum(net), 0), 1) AS wolt_share_pct,
  round(100.0*sum(net) FILTER (WHERE segment = 'self_consumption')/nullif(sum(net), 0), 1) AS self_use_share_pct
FROM full_data
WHERE ym >= strftime(${M_END} - INTERVAL 13 MONTH, '%Y-%m') AND ym < strftime(${M_END}, '%Y-%m')
GROUP BY 1 ORDER BY ym DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Branch × segment × month revenue since 2024 — the base for any customer-mix slice.',
        grain: 'one row per (branch, segment, month) (~1600 rows)',
        columns: 'branch_id: StoreC, branch, segment: anonymous_bucket/identified_named/wolt_delivery/self_consumption/other, ym, net, net_pos: net summed over positive-Scm rows only (basket numerator), receipts',
        viewSql: `SELECT h.StoreC AS branch_id, trim(s.Nm) AS branch,
  CASE WHEN i.Nm LIKE 'לקוח כללי%' THEN 'anonymous_bucket'
    WHEN i.Nm LIKE '%וולט%' THEN 'wolt_delivery'
    WHEN i.Nm LIKE 'צריכה עצמית%' THEN 'self_consumption'
    WHEN i.Type IN (1, 900) THEN 'identified_named'
    ELSE 'other' END AS segment,
  strftime(date_trunc('month', h.DateDoc), '%Y-%m') AS ym,
  round(sum(h.Scm - h.ScmMaam), 1) AS net,
  round(sum(h.Scm - h.ScmMaam) FILTER (WHERE h.Scm > 0), 1) AS net_pos,
  count(*) FILTER (WHERE h.Scm > 0) AS receipts
FROM ${H} h
JOIN ${STORE} s ON s.C = h.StoreC
LEFT JOIN ${IDX} i ON i.C = h.CustomerC
WHERE h.DateDoc >= DATE '2024-01-01'
GROUP BY 1, 2, 3, 4`
      })
    }),
    section({
      id: 'top-customers',
      title: 'לקוחות מובילים',
      goal: 'Highest-spending IDENTIFIED customers (named Type 1/900 accounts) with what they buy — excludes anonymous buckets, Wolt and self-use by definition.',
      caveats: 'רשימה זו מכסה רק ~35% מההכנסה (החלק המזוהה); דליי "לקוח כללי" מוחרגים בכוונה. Type 900 = חשבונות בית פרטיים, Type 1 = עסקים.',
      executiveSummary: querySlot({
        goal: 'Top 8 identified customers by 2024+ net.',
        widget: { kind: 'hbar', title: 'הלקוחות המזוהים הגדולים (₪)', valueFormat: '₪', name: 'customer', value: 'net', highlight: {max: true, note: 'הלקוח הגדול'} },
        sql: `SELECT customer, idx_type,
  max(nm_net) AS net,
  max(nm_receipts) AS receipts,
  round(max(nm_net)/nullif(max(nm_receipts), 0), 1) AS basket
FROM full_data
GROUP BY customer, idx_type ORDER BY net DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 identified customers with activity span and their top department by spend.',
        widget: { kind: 'table', title: '25 הלקוחות הגדולים', columns: [{key: 'customer', label: 'לקוח'}, {key: 'net', label: 'נטו', format: '₪'}, {key: 'receipts', label: 'קבלות', format: 'int'}, {key: 'basket', label: 'סל', format: '₪'}, {key: 'months_active', label: 'חודשי פעילות', format: 'int'}, {key: 'top_dept', label: 'מחלקה מובילה'}] },
        sql: `WITH per_id AS (
  SELECT cust, any_value(customer) AS customer, any_value(idx_type) AS idx_type,
    any_value(id_net) AS net, any_value(id_receipts) AS receipts,
    any_value(id_months) AS months_active, any_value(id_last_d) AS last_purchase_d,
    any_value(top_dept) AS top_dept
  FROM full_data GROUP BY cust)
SELECT customer, idx_type, net, receipts,
  round(net/nullif(receipts, 0), 1) AS basket, months_active, last_purchase_d, top_dept
FROM per_id ORDER BY net DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Top 50 identified customers with recency/frequency profile: current-year vs prior-year spend — who is growing and who is fading.',
        widget: { kind: 'table', title: 'לקוחות גדולים — צומח או דועך', columns: [{key: 'customer', label: 'לקוח'}, {key: 'net_total', label: 'נטו כולל', format: '₪'}, {key: 'net_cur_year', label: 'השנה', format: '₪'}, {key: 'net_prev_year', label: 'אשתקד', format: '₪'}, {key: 'days_since_last', label: 'ימים מקנייה', format: 'int'}] },
        sql: `SELECT customer, idx_type,
  max(nm_net) AS net_total,
  max(nm_net_cur) AS net_cur_year,
  max(nm_net_prev) AS net_prev_year,
  max(nm_receipts) AS receipts,
  max(nm_months) AS months_active,
  max(nm_last_d) AS last_purchase_d,
  max(nm_days_since_last) AS days_since_last
FROM full_data
GROUP BY customer, idx_type ORDER BY net_total DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Identified named-account spend by product and branch since 2024, with per-customer-id and per-customer-name rollups precomputed — supports selected product-id or branch slices for top-customer questions.',
        grain: 'one row per (identified customer, product code, branch) with sales',
        columns: 'cust, customer, idx_type, prt, item, dept, branch_id, branch, net, receipts, basket, months_active, first_purchase_d, last_purchase_d, id_net, id_receipts, id_months, id_last_d, nm_net, nm_receipts, nm_months, nm_last_d, nm_net_cur, nm_net_prev, nm_days_since_last, top_dept',
        viewSql: `WITH ident AS (
  SELECT i.C, trim(i.Nm) AS nm, i.Type FROM read_parquet('{{ROOT}}/Idx.parquet') i
  WHERE i.Type IN (1, 900)
    AND i.Nm NOT LIKE 'לקוח כללי%' AND i.Nm NOT LIKE '%וולט%' AND i.Nm NOT LIKE 'צריכה עצמית%'),
last_full AS (SELECT max(DateDoc)::DATE - 1 AS d FROM read_parquet('{{ROOT}}/KupaDoc_Header.parquet')),
hdr AS (
  SELECT h.C AS rid, h.CustomerC AS cust, h.StoreC AS store,
    h.DateDoc::DATE AS d, date_trunc('month', h.DateDoc) AS mth, (h.Scm > 0) AS pos
  FROM read_parquet('{{ROOT}}/KupaDoc_Header.parquet') h
  SEMI JOIN ident n ON n.C = h.CustomerC
  WHERE h.DateDoc >= DATE '2024-01-01'),
detail AS (
  SELECT h.cust, l.PrtC AS prt, h.store AS branch_id,
    round(sum(l.Scm - l.VatAmount), 1) AS net,
    count(DISTINCT h.rid) FILTER (WHERE h.pos) AS receipts,
    round(sum(l.Scm - l.VatAmount) FILTER (WHERE h.pos)/nullif(count(DISTINCT h.rid) FILTER (WHERE h.pos), 0), 1) AS basket,
    count(DISTINCT h.mth) AS months_active,
    min(h.d) AS first_purchase_d, max(h.d) AS last_purchase_d
  FROM hdr h JOIN read_parquet('{{ROOT}}/KupaDoc_Lines.parquet') l ON l.KupaDocC = h.rid
  GROUP BY 1, 2, 3),
id_agg AS (
  SELECT h.CustomerC AS cust,
    round(sum(h.Scm - h.ScmMaam)) AS id_net,
    count(*) FILTER (WHERE h.Scm > 0) AS id_receipts,
    count(DISTINCT strftime(h.DateDoc, '%Y-%m')) AS id_months,
    max(h.DateDoc::DATE) AS id_last_d
  FROM read_parquet('{{ROOT}}/KupaDoc_Header.parquet') h JOIN ident n ON n.C = h.CustomerC
  WHERE h.DateDoc >= DATE '2024-01-01' GROUP BY 1),
nm_agg AS (
  SELECT n.nm AS customer,
    round(sum(h.Scm - h.ScmMaam)) AS nm_net,
    count(*) FILTER (WHERE h.Scm > 0) AS nm_receipts,
    count(DISTINCT strftime(h.DateDoc, '%Y-%m')) AS nm_months,
    max(h.DateDoc::DATE) AS nm_last_d,
    round(sum(h.Scm - h.ScmMaam) FILTER (WHERE year(h.DateDoc) = year((SELECT d FROM last_full)))) AS nm_net_cur,
    round(sum(h.Scm - h.ScmMaam) FILTER (WHERE year(h.DateDoc) = year((SELECT d FROM last_full)) - 1)) AS nm_net_prev
  FROM read_parquet('{{ROOT}}/KupaDoc_Header.parquet') h JOIN ident n ON n.C = h.CustomerC
  WHERE h.DateDoc >= DATE '2024-01-01' GROUP BY 1),
dept_top AS (
  SELECT cust, arg_max(dept_c, dnet) AS top_dept_c FROM (
    SELECT d.cust, p.DepartmentC AS dept_c, sum(d.net) AS dnet
    FROM detail d JOIN read_parquet('{{ROOT}}/Prt.parquet') p ON p.C = d.prt GROUP BY 1, 2) GROUP BY 1)
SELECT d.cust, n.nm AS customer, n.Type AS idx_type,
  d.prt, trim(p.Nm) AS item, trim(dp.Nm) AS dept, d.branch_id, trim(s.Nm) AS branch,
  d.net, d.receipts, d.basket, d.months_active, d.first_purchase_d, d.last_purchase_d,
  ia.id_net, ia.id_receipts, ia.id_months, ia.id_last_d,
  na.nm_net, na.nm_receipts, na.nm_months, na.nm_last_d, na.nm_net_cur, na.nm_net_prev,
  (SELECT d FROM last_full) - na.nm_last_d AS nm_days_since_last,
  trim(tdp.Nm) AS top_dept
FROM detail d
JOIN ident n ON n.C = d.cust
JOIN id_agg ia ON ia.cust = d.cust
JOIN nm_agg na ON na.customer = n.nm
JOIN read_parquet('{{ROOT}}/Prt.parquet') p ON p.C = d.prt
LEFT JOIN read_parquet('{{ROOT}}/Departments.parquet') dp ON dp.C = p.DepartmentC
JOIN read_parquet('{{ROOT}}/Store.parquet') s ON s.C = d.branch_id
LEFT JOIN dept_top dt ON dt.cust = d.cust
LEFT JOIN read_parquet('{{ROOT}}/Departments.parquet') tdp ON tdp.C = dt.top_dept_c`
      })
    }),
    section({
      id: 'loyalty-adoption',
      title: 'אימוץ מועדון',
      goal: 'Loyalty-card capture and the real-card vs default-card split in the only valid loyalty window (June-2026), plus the rollout curve.',
      caveats: 'MOADON_NO נקלט מ-2026-05-16 בלבד (0% לפני, ~51% במאי, 100% ביוני) — יוני-2026 הוא חלון המועדון התקף היחיד ברשת זו. כרטיסים עם ≥10 קבלות/יום = כרטיסי ברירת-מחדל/דלפק סניפיים, מוחרגים מניתוחי חברים.',
      executiveSummary: querySlot({
        goal: 'June-2026 loyalty mix: no-card vs default-house-card vs real loyalty card — net, share, receipts, basket.',
        widget: { kind: 'pie', title: 'תמהיל כרטיסי מועדון — יוני 2026 (מ׳ ₪)', donut: true, name: 'card_kind', value: 'net_M' },
        sql: `WITH cards AS (
  SELECT MOADON_NO, count(*) AS receipts_card, count(DISTINCT DateDoc::DATE) AS days_card
  FROM ${H}
  WHERE DateDoc >= DATE '2026-06-01' AND DateDoc < DATE '2026-07-01' AND MOADON_NO IS NOT NULL AND MOADON_NO <> 0
  GROUP BY 1),
j AS (
  SELECT h.Scm, h.ScmMaam,
    CASE WHEN h.MOADON_NO IS NULL OR h.MOADON_NO = 0 THEN 'a_no_card'
      WHEN c.receipts_card*1.0/c.days_card >= 10 THEN 'b_default_house_card'
      ELSE 'c_real_loyalty_card' END AS card_kind
  FROM ${H} h LEFT JOIN cards c ON c.MOADON_NO = h.MOADON_NO
  WHERE h.DateDoc >= DATE '2026-06-01' AND h.DateDoc < DATE '2026-07-01')
SELECT card_kind, round(sum(Scm - ScmMaam)/1e6, 2) AS net_M,
  round(100.0*sum(Scm - ScmMaam)/sum(sum(Scm - ScmMaam)) OVER (), 1) AS share_pct,
  count(*) FILTER (WHERE Scm > 0) AS receipts,
  round(sum(Scm - ScmMaam) FILTER (WHERE Scm > 0)/nullif(count(*) FILTER (WHERE Scm > 0), 0), 1) AS basket
FROM j GROUP BY 1 ORDER BY 1 LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Weekly card-capture rollout since 2026-05-01: share of receipts carrying a MOADON_NO.',
        widget: { kind: 'line', title: 'קליטת כרטיס מועדון בקבלות', valueFormat: '%', x: 'week_start', ys: [{col: 'carded_pct', label: 'אחוז קבלות עם כרטיס'}] },
        sql: `SELECT date_trunc('week', DateDoc)::DATE AS week_start,
  count(*) AS receipts,
  round(100.0*count(*) FILTER (WHERE MOADON_NO IS NOT NULL AND MOADON_NO <> 0)/count(*), 1) AS carded_pct,
  count(DISTINCT MOADON_NO) FILTER (WHERE MOADON_NO IS NOT NULL AND MOADON_NO <> 0) AS distinct_cards
FROM ${H}
WHERE DateDoc >= DATE '2026-05-01' AND Scm > 0
GROUP BY 1 ORDER BY week_start LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Top 50 REAL loyalty cards by June-2026 net (default cards excluded): spend, receipts, days active, main branch.',
        widget: { kind: 'table', title: 'כרטיסי המועדון הגדולים — יוני 2026', columns: [{key: 'card_no', label: 'כרטיס'}, {key: 'net_june', label: 'נטו יוני', format: '₪'}, {key: 'receipts', label: 'קבלות', format: 'int'}, {key: 'days_active', label: 'ימי פעילות', format: 'int'}, {key: 'basket', label: 'סל', format: '₪'}, {key: 'sample_branch', label: 'סניף עיקרי'}] },
        sql: `WITH cards AS (
  SELECT h.MOADON_NO, count(*) AS receipts, count(DISTINCT h.DateDoc::DATE) AS days_active,
    sum(h.Scm - h.ScmMaam) AS net,
    arg_max(trim(s.Nm), h.Scm) AS sample_branch
  FROM ${H} h JOIN ${STORE} s ON s.C = h.StoreC
  WHERE h.DateDoc >= DATE '2026-06-01' AND h.DateDoc < DATE '2026-07-01'
    AND h.MOADON_NO IS NOT NULL AND h.MOADON_NO <> 0
  GROUP BY 1
  HAVING count(*)*1.0/count(DISTINCT h.DateDoc::DATE) < 10)
SELECT MOADON_NO AS card_no, receipts, days_active, round(net) AS net_june,
  round(net/nullif(receipts, 0), 1) AS basket, sample_branch
FROM cards ORDER BY net DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Per-card June-2026 profile for every real loyalty card (default/house cards excluded).',
        grain: 'one row per real loyalty card active in June-2026 (~25K rows)',
        columns: 'card_no: MOADON_NO, receipts, days_active, net_june, basket, main_branch_id: StoreC of the top-revenue branch, main_branch',
        viewSql: `WITH per_branch AS (
  SELECT h.MOADON_NO, h.StoreC, sum(h.Scm - h.ScmMaam) AS net_b, count(*) AS receipts_b,
    count(DISTINCT h.DateDoc::DATE) AS days_b
  FROM ${H} h
  WHERE h.DateDoc >= DATE '2026-06-01' AND h.DateDoc < DATE '2026-07-01'
    AND h.MOADON_NO IS NOT NULL AND h.MOADON_NO <> 0
  GROUP BY 1, 2),
cards AS (
  SELECT MOADON_NO, sum(receipts_b) AS receipts, sum(net_b) AS net,
    max(days_b) AS max_days_one_branch, arg_max(StoreC, net_b) AS main_store_c
  FROM per_branch GROUP BY 1),
days AS (
  SELECT MOADON_NO, count(DISTINCT DateDoc::DATE) AS days_active
  FROM ${H}
  WHERE DateDoc >= DATE '2026-06-01' AND DateDoc < DATE '2026-07-01' AND MOADON_NO IS NOT NULL AND MOADON_NO <> 0
  GROUP BY 1)
SELECT c.MOADON_NO AS card_no, c.receipts, d.days_active,
  round(c.net, 1) AS net_june,
  round(c.net/nullif(c.receipts, 0), 1) AS basket,
  c.main_store_c AS main_branch_id, trim(s.Nm) AS main_branch
FROM cards c
JOIN days d ON d.MOADON_NO = c.MOADON_NO
JOIN ${STORE} s ON s.C = c.main_store_c
WHERE c.receipts*1.0/d.days_active < 10`
      })
    }),
    section({
      id: 'churn-signals',
      title: 'אותות נטישה',
      goal: 'Identified regulars (active most of last calendar year, 24+ receipts) with ZERO receipts in the last 90 days — the win-back list.',
      caveats: 'רק לקוחות מזוהים בשם ניתנים למעקב נטישה (דליים אנונימיים לא). MOADON קצר מדי להגדרת נטישה. "רבעון אחרון" = 90 הימים האחרונים עד היום המלא האחרון; שנת הבסיס = השנה הקלנדרית הקודמת.',
      executiveSummary: querySlot({
        goal: 'Churn scale: regulars last year, how many went silent in the last 90 days, and the prior-year revenue at risk.',
        widget: { kind: 'kpi', title: 'נטישת קבועים — מבט מהיר', items: [{label: 'קבועים אשתקד', col: 'regulars_last_year', format: 'int'}, {label: 'נטשו ב-90 יום', col: 'churned_90d', format: 'int'}, {label: 'שיעור נטישה', col: 'churn_pct', format: '%'}, {label: 'הכנסה בסיכון', col: 'net_at_risk_prev_year', format: '₪'}] },
        sql: `SELECT count(*) AS regulars_last_year,
  count(*) FILTER (WHERE churned_90d) AS churned_90d,
  round(100.0*count(*) FILTER (WHERE churned_90d)/count(*), 1) AS churn_pct,
  round(sum(net_prev_year) FILTER (WHERE churned_90d)) AS net_at_risk_prev_year
FROM full_data LIMIT 1`
      }),
      summary: querySlot({
        goal: 'Top 25 churned regulars by prior-year spend — the concrete win-back call list.',
        widget: { kind: 'hbar', title: 'נוטשים גדולים — הוצאה אשתקד (₪)', valueFormat: '₪', name: 'customer', value: 'net_prev_year' },
        sql: `SELECT customer, receipts_prev_year, months_prev_year, round(net_prev_year) AS net_prev_year
FROM full_data
WHERE churned_90d
ORDER BY net_prev_year DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Top 50 churned regulars with their exact last purchase and main branch — who to call and where they used to shop.',
        widget: { kind: 'table', title: 'רשימת win-back', columns: [{key: 'customer', label: 'לקוח'}, {key: 'net_prev_year', label: 'נטו אשתקד', format: '₪'}, {key: 'basket', label: 'סל', format: '₪'}, {key: 'last_purchase_d', label: 'קנייה אחרונה'}, {key: 'days_since_last', label: 'ימים', format: 'int'}, {key: 'last_branch', label: 'סניף אחרון'}] },
        sql: `SELECT customer, round(net_prev_year) AS net_prev_year, receipts_prev_year, months_prev_year,
  round(net_lifetime/nullif(receipts_pos_lifetime, 0), 1) AS basket,
  last_purchase_d, ${LAST_FULL} - last_purchase_d AS days_since_last, last_branch
FROM full_data
WHERE churned_90d
ORDER BY net_prev_year DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Every prior-year identified regular with activity stats and a churn flag — the full retention base.',
        grain: 'one row per prior-year regular customer (~11K rows)',
        columns: 'cust, customer, receipts_prev_year, months_prev_year, net_prev_year, last_purchase_d, last_branch_id, last_branch, churned_90d: true when zero receipts in the last 90 days, net_lifetime/receipts_pos_lifetime: all-time (not just prior-year) net and positive-receipt count, for an all-time basket',
        viewSql: `WITH ident AS (
  SELECT i.C, trim(i.Nm) AS nm FROM ${IDX} i
  WHERE i.Type IN (1, 900)
    AND i.Nm NOT LIKE 'לקוח כללי%' AND i.Nm NOT LIKE '%וולט%' AND i.Nm NOT LIKE 'צריכה עצמית%'),
reg AS (
  SELECT h.CustomerC AS cust, count(*) AS receipts,
    count(DISTINCT strftime(h.DateDoc, '%Y-%m')) AS months_active,
    sum(h.Scm - h.ScmMaam) AS net
  FROM ${H} h JOIN ident n ON n.C = h.CustomerC
  WHERE h.DateDoc >= make_date(year(${LAST_FULL}) - 1, 1, 1) AND h.DateDoc < make_date(year(${LAST_FULL}), 1, 1)
  GROUP BY 1
  HAVING count(DISTINCT strftime(h.DateDoc, '%Y-%m')) >= 9 AND count(*) >= 24),
hist AS (
  SELECT h.CustomerC AS cust, max(h.DateDoc::DATE) AS last_purchase_d, arg_max(h.StoreC, h.DateDoc) AS last_store_c,
    sum(h.Scm - h.ScmMaam) AS net_lifetime, count(*) FILTER (WHERE h.Scm > 0) AS receipts_pos_lifetime
  FROM ${H} h JOIN reg r ON r.cust = h.CustomerC GROUP BY 1)
SELECT r.cust, n.nm AS customer, r.receipts AS receipts_prev_year,
  r.months_active AS months_prev_year, r.net AS net_prev_year,
  hist.last_purchase_d, hist.last_store_c AS last_branch_id, trim(s.Nm) AS last_branch,
  hist.last_purchase_d <= ${LAST_FULL} - 90 AS churned_90d,
  hist.net_lifetime, hist.receipts_pos_lifetime
FROM reg r
JOIN ident n ON n.C = r.cust
JOIN hist ON hist.cust = r.cust
JOIN ${STORE} s ON s.C = hist.last_store_c`
      })
    }),
    section({
      id: 'basket-composition',
      title: 'הרכב סל',
      goal: 'Which departments the engaged loyalty shoppers buy TOGETHER — department-pair co-occurrence inside receipts (June-2026 real cards).',
      caveats: 'דורש מזהה קבלה (KupaDoc_Lines.KupaDocC→Header.C). "הלקוחות הטובים" = כרטיסי מועדון אמיתיים ביוני-2026 (<10 קבלות/יום, ≥8 קבלות) — חלון המועדון התקף היחיד; משקף סל קיץ של לקוחות מחויבים. מחלקות לא-מוצריות (פקדונות/אגרות/לא לפידיון) מוחרגות. ה-fullData רחב יותר: כל הקבלות ב-28 הימים האחרונים.',
      executiveSummary: querySlot({
        goal: 'Top 8 department pairs bought together by the best loyalty customers.',
        widget: { kind: 'table', title: 'צמדי המחלקות הנקנים יחד', columns: [{key: 'dept_a', label: 'מחלקה א'}, {key: 'dept_b', label: 'מחלקה ב'}, {key: 'baskets_together', label: 'סלים משותפים', format: 'int'}] },
        sql: `WITH real_cards AS (
  SELECT MOADON_NO FROM ${H}
  WHERE DateDoc >= DATE '2026-06-01' AND DateDoc < DATE '2026-07-01' AND MOADON_NO IS NOT NULL AND MOADON_NO <> 0
  GROUP BY 1
  HAVING count(*)*1.0/count(DISTINCT DateDoc::DATE) < 10 AND count(*) >= 8),
receipt_depts AS (
  SELECT DISTINCT l.KupaDocC AS rid, p.DepartmentC AS dept_c
  FROM ${H} h
  JOIN real_cards rc ON rc.MOADON_NO = h.MOADON_NO
  JOIN ${L} l ON l.KupaDocC = h.C
  JOIN ${PRT} p ON p.C = l.PrtC
  JOIN ${DEPT} dp ON dp.C = p.DepartmentC
  WHERE h.DateDoc >= DATE '2026-06-01' AND h.DateDoc < DATE '2026-07-01'
    AND dp.Nm NOT LIKE '%לא לפידיון%' AND dp.Nm NOT LIKE '%אגרות%' AND dp.Nm NOT LIKE '%מיכלים%' AND dp.Nm NOT LIKE '%פקדון%'),
pairs AS (
  SELECT a.dept_c AS d1, b.dept_c AS d2, count(*) AS baskets_together
  FROM receipt_depts a JOIN receipt_depts b ON a.rid = b.rid AND a.dept_c < b.dept_c
  GROUP BY 1, 2)
SELECT trim(d1.Nm) AS dept_a, trim(d2.Nm) AS dept_b, p.baskets_together
FROM pairs p JOIN ${DEPT} d1 ON d1.C = p.d1 JOIN ${DEPT} d2 ON d2.C = p.d2
ORDER BY p.baskets_together DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 department pairs with the share of analyzed baskets containing the pair.',
        widget: { kind: 'heatmap', title: 'מטריצת צמדי מחלקות בסל', valueFormat: 'int', x: 'dept_a', y: 'dept_b', value: 'baskets_together' },
        sql: `WITH real_cards AS (
  SELECT MOADON_NO FROM ${H}
  WHERE DateDoc >= DATE '2026-06-01' AND DateDoc < DATE '2026-07-01' AND MOADON_NO IS NOT NULL AND MOADON_NO <> 0
  GROUP BY 1
  HAVING count(*)*1.0/count(DISTINCT DateDoc::DATE) < 10 AND count(*) >= 8),
receipt_depts AS (
  SELECT DISTINCT l.KupaDocC AS rid, p.DepartmentC AS dept_c
  FROM ${H} h
  JOIN real_cards rc ON rc.MOADON_NO = h.MOADON_NO
  JOIN ${L} l ON l.KupaDocC = h.C
  JOIN ${PRT} p ON p.C = l.PrtC
  JOIN ${DEPT} dp ON dp.C = p.DepartmentC
  WHERE h.DateDoc >= DATE '2026-06-01' AND h.DateDoc < DATE '2026-07-01'
    AND dp.Nm NOT LIKE '%לא לפידיון%' AND dp.Nm NOT LIKE '%אגרות%' AND dp.Nm NOT LIKE '%מיכלים%' AND dp.Nm NOT LIKE '%פקדון%'),
nb AS (SELECT count(DISTINCT rid) AS n_baskets FROM receipt_depts),
pairs AS (
  SELECT a.dept_c AS d1, b.dept_c AS d2, count(*) AS baskets_together
  FROM receipt_depts a JOIN receipt_depts b ON a.rid = b.rid AND a.dept_c < b.dept_c
  GROUP BY 1, 2)
SELECT trim(d1.Nm) AS dept_a, trim(d2.Nm) AS dept_b, p.baskets_together,
  round(100.0*p.baskets_together/(SELECT n_baskets FROM nb), 1) AS pct_of_baskets
FROM pairs p JOIN ${DEPT} d1 ON d1.C = p.d1 JOIN ${DEPT} d2 ON d2.C = p.d2
ORDER BY p.baskets_together DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Top 50 department pairs with lift (co-occurrence vs what independence would predict) — true affinity, not just popularity.',
        widget: { kind: 'table', title: 'זיקת מחלקות — lift', columns: [{key: 'dept_a', label: 'מחלקה א'}, {key: 'dept_b', label: 'מחלקה ב'}, {key: 'baskets_together', label: 'סלים', format: 'int'}, {key: 'pct_of_baskets', label: 'מהסלים', format: '%'}, {key: 'lift', label: 'lift'}] },
        sql: `WITH real_cards AS (
  SELECT MOADON_NO FROM ${H}
  WHERE DateDoc >= DATE '2026-06-01' AND DateDoc < DATE '2026-07-01' AND MOADON_NO IS NOT NULL AND MOADON_NO <> 0
  GROUP BY 1
  HAVING count(*)*1.0/count(DISTINCT DateDoc::DATE) < 10 AND count(*) >= 8),
receipt_depts AS (
  SELECT DISTINCT l.KupaDocC AS rid, p.DepartmentC AS dept_c
  FROM ${H} h
  JOIN real_cards rc ON rc.MOADON_NO = h.MOADON_NO
  JOIN ${L} l ON l.KupaDocC = h.C
  JOIN ${PRT} p ON p.C = l.PrtC
  JOIN ${DEPT} dp ON dp.C = p.DepartmentC
  WHERE h.DateDoc >= DATE '2026-06-01' AND h.DateDoc < DATE '2026-07-01'
    AND dp.Nm NOT LIKE '%לא לפידיון%' AND dp.Nm NOT LIKE '%אגרות%' AND dp.Nm NOT LIKE '%מיכלים%' AND dp.Nm NOT LIKE '%פקדון%'),
nb AS (SELECT count(DISTINCT rid) AS n FROM receipt_depts),
dcount AS (SELECT dept_c, count(*) AS n_d FROM receipt_depts GROUP BY 1),
pairs AS (
  SELECT a.dept_c AS d1, b.dept_c AS d2, count(*) AS baskets_together
  FROM receipt_depts a JOIN receipt_depts b ON a.rid = b.rid AND a.dept_c < b.dept_c
  GROUP BY 1, 2)
SELECT trim(dd1.Nm) AS dept_a, trim(dd2.Nm) AS dept_b, p.baskets_together,
  round(100.0*p.baskets_together/(SELECT n FROM nb), 1) AS pct_of_baskets,
  round(p.baskets_together*1.0*(SELECT n FROM nb)/(c1.n_d*c2.n_d), 2) AS lift
FROM pairs p
JOIN dcount c1 ON c1.dept_c = p.d1 JOIN dcount c2 ON c2.dept_c = p.d2
JOIN ${DEPT} dd1 ON dd1.C = p.d1 JOIN ${DEPT} dd2 ON dd2.C = p.d2
WHERE p.baskets_together >= 100
ORDER BY p.baskets_together DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Department-pair co-occurrence by branch over ALL receipts of the last 28 full days (not just loyalty cards) — the broad basket-affinity base.',
        grain: 'one row per (branch, department pair)',
        columns: 'branch_id: StoreC, branch, dept_a, dept_b, baskets_together, pct_of_baskets: share of the branch multi-dept receipts containing the pair',
        viewSql: `WITH receipt_depts AS (
  SELECT DISTINCT l.KupaDocC AS rid, h.StoreC AS store_c, p.DepartmentC AS dept_c
  FROM ${H} h
  JOIN ${L} l ON l.KupaDocC = h.C
  JOIN ${PRT} p ON p.C = l.PrtC
  JOIN ${DEPT} dp ON dp.C = p.DepartmentC
  WHERE h.DateDoc::DATE > ${LAST_FULL} - 28 AND h.DateDoc::DATE <= ${LAST_FULL} AND h.Scm > 0
    AND dp.Nm NOT LIKE '%לא לפידיון%' AND dp.Nm NOT LIKE '%אגרות%' AND dp.Nm NOT LIKE '%מיכלים%' AND dp.Nm NOT LIKE '%פקדון%'),
nb AS (SELECT store_c, count(DISTINCT rid) AS n FROM receipt_depts GROUP BY 1),
pairs AS (
  SELECT a.store_c, a.dept_c AS d1, b.dept_c AS d2, count(*) AS baskets_together
  FROM receipt_depts a JOIN receipt_depts b ON a.rid = b.rid AND a.dept_c < b.dept_c
  GROUP BY 1, 2, 3)
SELECT p.store_c AS branch_id, trim(s.Nm) AS branch, trim(dd1.Nm) AS dept_a, trim(dd2.Nm) AS dept_b, p.baskets_together,
  round(100.0*p.baskets_together/nb.n, 2) AS pct_of_baskets
FROM pairs p
JOIN nb ON nb.store_c = p.store_c
JOIN ${STORE} s ON s.C = p.store_c
JOIN ${DEPT} dd1 ON dd1.C = p.d1 JOIN ${DEPT} dd2 ON dd2.C = p.d2`
      })
    })
  ]
}) })

VerifiedReport('suppliers', { impl: verifiedReport({
  title: 'ספקים ורכש',
  description: 'תלות בספקים (נתח הכנסה ומרווח פר ספק), התייקרויות עלות ברמת ספק, רוחב סל הספק וריכוזיות מחלקות, וחיוב זכיינים יומי (Zakyan).',
  whenToUse: 'שאלות ספקים — במי אנחנו תלויים, מי העלה מחירים, מי מספק מה, ומה חיוב הזכיינים. שאלות תנאי תשלום/החזרי ספק/קניינים אינן ניתנות למענה בנתונים אלה — אמור זאת ביושר והצע את ה-proxy.',
  routePhrases: ['ספקים', 'ספק', 'רכש', 'תלות ספק', 'מי העלה מחירים', 'התייקרות ספק', 'רוחב סל ספק', 'זכיינים', 'zakyan', 'החזרי ספק', 'קניין'],
  questionsCovered: ['Q31', 'Q35', 'Q36', 'Q37', 'Q38', 'Q39'],
  caveats: `שיוך ספק דרך Prt.Spk=Suppliers.C (פותר ~100% מההכנסה). מוכח ריק בנתונים אלה — יש לומר זאת ללקוח: תנאי תשלום (PaymentTerms מולא ל-11 מתוך 1,671 ספקים, אין נתוני תשלומים בפועל — Q37), החזרי/תמריצי ספק (SupplierRefund/RewardCharge/OperatingReturn = 0 בכל השורות — Q38), ושדות קניין (UserKanyan ריק לגמרי — Q39; ה-proxy: מרווח לפי מחלקה/ספק). היסטוריית עלויות מ-2025-01 — אינפלציית ספק נמדדת על החלון הזמין, לא על שנה מלאה. DailyPriceCost_Zakyan הוא חיוב עלות לזכיינים (אין צד הכנסה — לא מרווח).`,
  executiveSummary: querySlot({
    goal: 'Top 8 suppliers by revenue share with margin and breadth — the dependency headline.',
    widget: { kind: 'hbar', title: 'הספקים הגדולים (מ׳ ₪)', name: 'supplier', value: 'net_M', highlight: {max: true, note: 'התלות הגדולה'} },
    sql: `WITH g AS (
  SELECT l.PrtC AS prt, h.StoreC AS store,
    sum(l.Scm - l.VatAmount) AS net, sum(l.Cmt) AS cmt
  FROM ${L} l
  JOIN ${H} h ON l.KupaDocC = h.C
  WHERE l.KupaDocC >= 4366052
  GROUP BY 1, 2),
${COST_CTE},
fx AS (
  SELECT p.Spk AS spk, g.prt, p.DepartmentC AS dept_c, g.net,
    c.unit_cost, c.unit_cost*g.cmt AS cogs
  FROM g JOIN ${PRT} p ON p.C = g.prt
  LEFT JOIN cost c ON c.ItemID = g.prt AND c.StoreID = g.store)
SELECT trim(sup.Nm) AS supplier,
  round(sum(fx.net)/1e6, 1) AS net_M,
  round(100.0*sum(fx.net)/sum(sum(fx.net)) OVER (), 2) AS pct_of_total_net,
  round(100.0*sum(fx.net - fx.cogs) FILTER (WHERE fx.unit_cost IS NOT NULL)
    /nullif(sum(fx.net) FILTER (WHERE fx.unit_cost IS NOT NULL), 0), 1) AS margin_pct,
  count(DISTINCT fx.prt) AS items,
  count(DISTINCT fx.dept_c) AS depts
FROM fx JOIN ${SUP} sup ON sup.C = fx.spk
GROUP BY 1 ORDER BY net_M DESC LIMIT 8`
  }),
  summary: querySlot({
    goal: 'Top 25 suppliers: revenue, share, cumulative share, margin, item and department breadth.',
    widget: { kind: 'table', title: '25 הספקים הגדולים', columns: [{key: 'supplier', label: 'ספק'}, {key: 'net_M', label: 'נטו (מ׳ ₪)'}, {key: 'pct_of_total_net', label: 'נתח', format: '%'}, {key: 'cumulative_pct', label: 'מצטבר', format: '%'}, {key: 'margin_pct', label: 'מרווח', format: '%'}, {key: 'items', label: 'פריטים', format: 'int'}] },
    sql: `WITH g AS (
  SELECT l.PrtC AS prt, h.StoreC AS store,
    sum(l.Scm - l.VatAmount) AS net, sum(l.Cmt) AS cmt
  FROM ${L} l
  JOIN ${H} h ON l.KupaDocC = h.C
  WHERE l.KupaDocC >= 4366052
  GROUP BY 1, 2),
${COST_CTE},
fx AS (
  SELECT p.Spk AS spk, g.prt, p.DepartmentC AS dept_c, g.net,
    c.unit_cost, c.unit_cost*g.cmt AS cogs
  FROM g JOIN ${PRT} p ON p.C = g.prt
  LEFT JOIN cost c ON c.ItemID = g.prt AND c.StoreID = g.store),
sp AS (
  SELECT trim(sup.Nm) AS supplier, sum(fx.net) AS net,
    100.0*sum(fx.net - fx.cogs) FILTER (WHERE fx.unit_cost IS NOT NULL)
      /nullif(sum(fx.net) FILTER (WHERE fx.unit_cost IS NOT NULL), 0) AS margin_pct,
    count(DISTINCT fx.prt) AS items, count(DISTINCT fx.dept_c) AS depts,
    100.0*sum(fx.net)/sum(sum(fx.net)) OVER () AS pct
  FROM fx JOIN ${SUP} sup ON sup.C = fx.spk
  GROUP BY 1)
SELECT supplier, round(net/1e6, 1) AS net_M, round(pct, 2) AS pct_of_total_net,
  round(sum(pct) OVER (ORDER BY net DESC), 1) AS cumulative_pct,
  round(margin_pct, 1) AS margin_pct, items, depts
FROM sp ORDER BY net DESC LIMIT 25`
  }),
  sections: [
    section({
      id: 'dependency',
      title: 'תלות בספקים',
      goal: 'Supplier concentration: who carries the revenue and the margin engine — the single-point-of-failure view.',
      executiveSummary: querySlot({
        goal: 'Top 8 suppliers by net revenue share.',
        widget: { kind: 'hbar', title: 'נתח ההכנסה של הספקים הגדולים', valueFormat: '%', name: 'supplier', value: 'pct_of_total_net' },
        sql: `SELECT supplier, round(sum(net)/1e6, 1) AS net_M,
  round(100.0*sum(net)/sum(sum(net)) OVER (), 2) AS pct_of_total_net
FROM full_data GROUP BY 1 ORDER BY net_M DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 suppliers with margin and breadth (Q35 form).',
        widget: { kind: 'table', title: 'תלות בספקים — הכנסה ומרווח', columns: [{key: 'supplier', label: 'ספק'}, {key: 'net', label: 'נטו', format: '₪'}, {key: 'pct_of_total_net', label: 'נתח', format: '%'}, {key: 'margin_pct', label: 'מרווח', format: '%'}, {key: 'items', label: 'פריטים', format: 'int'}, {key: 'depts', label: 'מחלקות', format: 'int'}] },
        sql: `WITH ${COST_CTE},
fx AS (
  SELECT p.Spk AS spk, l.PrtC AS prt, p.DepartmentC AS dept_c, ${NET} AS net,
    c.unit_cost, c.unit_cost*l.Cmt AS cogs
  FROM ${SALES}
  JOIN ${PRT} p ON p.C = l.PrtC
  LEFT JOIN cost c ON c.ItemID = l.PrtC AND c.StoreID = h.StoreC)
SELECT trim(sup.Nm) AS supplier,
  round(sum(fx.net)) AS net,
  round(100.0*sum(fx.net)/sum(sum(fx.net)) OVER (), 2) AS pct_of_total_net,
  round(100.0*sum(fx.net - fx.cogs) FILTER (WHERE fx.unit_cost IS NOT NULL)
    /nullif(sum(fx.net) FILTER (WHERE fx.unit_cost IS NOT NULL), 0), 1) AS margin_pct,
  count(DISTINCT fx.prt) AS items,
  count(DISTINCT fx.dept_c) AS depts
FROM fx JOIN ${SUP} sup ON sup.C = fx.spk
GROUP BY 1 ORDER BY net DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Top 50 suppliers with their dominant department and the share of the supplier revenue it represents — what exactly is at risk if the supplier fails.',
        widget: { kind: 'table', title: 'מה בסיכון אם הספק נופל', columns: [{key: 'supplier', label: 'ספק'}, {key: 'net_M', label: 'נטו (מ׳ ₪)'}, {key: 'margin_pct', label: 'מרווח', format: '%'}, {key: 'top_dept', label: 'מחלקה דומיננטית'}, {key: 'top_dept_share_of_supplier_pct', label: 'נתח מהספק', format: '%'}] },
        sql: `WITH ${COST_CTE},
fx AS (
  SELECT p.Spk AS spk, l.PrtC AS prt, p.DepartmentC AS dept_c, ${NET} AS net,
    c.unit_cost, c.unit_cost*l.Cmt AS cogs
  FROM ${SALES}
  JOIN ${PRT} p ON p.C = l.PrtC
  LEFT JOIN cost c ON c.ItemID = l.PrtC AND c.StoreID = h.StoreC),
sd AS (
  SELECT spk, dept_c, sum(net) AS net_d,
    row_number() OVER (PARTITION BY spk ORDER BY sum(net) DESC) AS rn
  FROM fx GROUP BY 1, 2),
sp AS (
  SELECT spk, sum(net) AS net,
    100.0*sum(net - cogs) FILTER (WHERE unit_cost IS NOT NULL)
      /nullif(sum(net) FILTER (WHERE unit_cost IS NOT NULL), 0) AS margin_pct,
    count(DISTINCT prt) AS items
  FROM fx GROUP BY 1)
SELECT trim(sup.Nm) AS supplier, round(sp.net/1e6, 2) AS net_M,
  round(sp.margin_pct, 1) AS margin_pct, sp.items,
  trim(dp.Nm) AS top_dept,
  round(100.0*sd.net_d/sp.net, 0) AS top_dept_share_of_supplier_pct
FROM sp
JOIN ${SUP} sup ON sup.C = sp.spk
JOIN sd ON sd.spk = sp.spk AND sd.rn = 1
JOIN ${DEPT} dp ON dp.C = sd.dept_c
ORDER BY sp.net DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Supplier × branch totals 2024+: revenue, share, margin, breadth — the full supplier dependency base for branch slices.',
        grain: 'one row per (supplier, branch) with traded items',
        columns: 'spk: supplier id, supplier, branch_id, branch, net, pct_of_total_net, margin_pct (costed lines only), items, depts',
        viewSql: `WITH g AS (
  SELECT l.PrtC AS prt, h.StoreC AS branch_id,
    sum(l.Scm - l.VatAmount) AS net, sum(l.Cmt) AS cmt
  FROM ${L} l
  JOIN ${H} h ON l.KupaDocC = h.C
  WHERE l.KupaDocC >= 4366052
  GROUP BY 1, 2),
${COST_CTE},
fx AS (
  SELECT p.Spk AS spk, g.branch_id, g.prt, p.DepartmentC AS dept_c, g.net,
    c.unit_cost, c.unit_cost*g.cmt AS cogs
  FROM g JOIN ${PRT} p ON p.C = g.prt
  LEFT JOIN cost c ON c.ItemID = g.prt AND c.StoreID = g.branch_id),
agg AS (
  SELECT spk, branch_id,
    sum(net) AS net,
    sum(net - cogs) FILTER (WHERE unit_cost IS NOT NULL) AS m_num,
    sum(net) FILTER (WHERE unit_cost IS NOT NULL) AS m_den,
    count(*) AS items,
    count(DISTINCT dept_c) AS depts
  FROM fx GROUP BY 1, 2)
SELECT agg.spk, trim(sup.Nm) AS supplier, agg.branch_id, trim(st.Nm) AS branch,
  round(agg.net, 1) AS net,
  round(100.0*agg.net/sum(agg.net) OVER (), 3) AS pct_of_total_net,
  round(100.0*agg.m_num/nullif(agg.m_den, 0), 1) AS margin_pct,
  agg.items, agg.depts
FROM agg JOIN ${SUP} sup ON sup.C = agg.spk
JOIN ${STORE} st ON st.C = agg.branch_id`
      })
    }),
    section({
      id: 'cost-increases',
      title: 'התייקרויות ספק',
      goal: 'Revenue-weighted supplier cost inflation between the first and last recorded cost in the available history — who raised prices where it hurts.',
      caveats: 'היסטוריית עלויות קצרה (מ-2025-01) — ההשוואה היא עלות ראשונה מול אחרונה (arg_min/arg_max לפי תאריך) בחלון הזמין, לא שנה-מול-שנה; מגמות שנתיות מלאות מוערכות בחסר. משוקלל בהכנסת הפריט כדי להבליט התייקרויות שכואבות.',
      executiveSummary: querySlot({
        goal: 'Top 8 suppliers by revenue-weighted cost inflation (revenue floor 3M).',
        widget: { kind: 'hbar', title: 'אינפלציית עלות משוקללת לפי ספק', valueFormat: '%', name: 'supplier', value: 'wtd_cost_inflation_pct', highlight: {max: true, note: 'המתייקר החד'} },
        sql: `SELECT supplier,
  round(sum(inflation_pct/100.0*rev)/sum(rev), 1) AS wtd_cost_inflation_pct,
  count(*) AS n_items, round(sum(rev)/1e6, 1) AS rev_M
FROM full_data
GROUP BY 1 HAVING sum(rev) > 3000000
ORDER BY wtd_cost_inflation_pct DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 suppliers by weighted cost inflation (revenue floor 1M).',
        widget: { kind: 'table', title: 'התייקרויות ספק', columns: [{key: 'supplier', label: 'ספק'}, {key: 'wtd_cost_inflation_pct', label: 'אינפלציה משוקללת', format: '%'}, {key: 'items_up_5pct', label: 'פריטים שעלו 5%+', format: 'int'}, {key: 'items_down_5pct', label: 'פריטים שירדו 5%+', format: 'int'}, {key: 'rev_M', label: 'הכנסה (מ׳ ₪)'}] },
        sql: `SELECT supplier,
  round(sum(inflation_pct/100.0*rev)/sum(rev), 1) AS wtd_cost_inflation_pct,
  count(*) AS n_items,
  count(*) FILTER (WHERE inflation_pct > 5) AS items_up_5pct,
  count(*) FILTER (WHERE inflation_pct < -5) AS items_down_5pct,
  round(sum(rev)/1e6, 1) AS rev_M
FROM full_data
GROUP BY 1 HAVING sum(rev) > 1000000
ORDER BY wtd_cost_inflation_pct DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Top 50 inflating suppliers with their single biggest item mover — the negotiation prep list.',
        widget: { kind: 'table', title: 'הכנה למו"מ — מתייקרים', columns: [{key: 'supplier', label: 'ספק'}, {key: 'wtd_cost_inflation_pct', label: 'אינפלציה', format: '%'}, {key: 'rev_M', label: 'הכנסה (מ׳ ₪)'}, {key: 'biggest_mover_item', label: 'הפריט הבולט'}, {key: 'biggest_mover_infl_pct', label: 'התייקרות הפריט', format: '%'}] },
        sql: `SELECT supplier,
  round(sum(inflation_pct/100.0*rev)/sum(rev), 1) AS wtd_cost_inflation_pct,
  count(*) AS n_items, round(sum(rev)/1e6, 2) AS rev_M,
  arg_max(item, inflation_pct/100.0*rev) AS biggest_mover_item,
  round(arg_max(inflation_pct, inflation_pct/100.0*rev), 1) AS biggest_mover_infl_pct
FROM full_data
GROUP BY 1 HAVING sum(rev) > 500000
ORDER BY wtd_cost_inflation_pct DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Item-level cost inflation with supplier attribution — first vs last recorded cost (arg_min/arg_max by date) of the available history.',
        grain: 'one row per item with cost history on 2+ dates (~15K rows)',
        columns: 'prt, item, supplier, cost_first_d, cost_last_d, cost_first, cost_last, inflation_pct, rev: 2024+ net revenue weight',
        perItemOnly: 'cost_first,cost_last',
        viewSql: `WITH drift AS (
  SELECT ItemID, arg_min(FinalRegularCostPrice, DateDoc) AS cost_first, arg_max(FinalRegularCostPrice, DateDoc) AS cost_last,
    min(DateDoc) AS first_d, max(DateDoc) AS last_d
  FROM ${DPC} WHERE FinalRegularCostPrice > 0 GROUP BY 1 HAVING min(DateDoc) < max(DateDoc)),
rev AS (SELECT l.PrtC AS prt, sum(${NET}) AS rev FROM ${L} l JOIN ${H} h ON l.KupaDocC = h.C WHERE l.KupaDocC >= 4366052 AND ${NET} > 0 GROUP BY 1),
chg AS (
  SELECT d.ItemID, p.Spk AS spk, trim(p.Nm) AS item, r.rev, d.cost_first, d.cost_last, d.first_d, d.last_d,
    (d.cost_last - d.cost_first)/d.cost_first AS infl
  FROM drift d JOIN ${PRT} p ON p.C = d.ItemID JOIN rev r ON r.prt = d.ItemID)
SELECT chg.ItemID AS prt, chg.item, trim(sup.Nm) AS supplier,
  make_date(first_d//10000, (first_d//100)%100, first_d%100) AS cost_first_d,
  make_date(last_d//10000, (last_d//100)%100, last_d%100) AS cost_last_d,
  round(cost_first, 3) AS cost_first, round(cost_last, 3) AS cost_last,
  round(100.0*infl, 2) AS inflation_pct, round(rev, 1) AS rev
FROM chg LEFT JOIN ${SUP} sup ON sup.C = chg.spk`
      })
    }),
    section({
      id: 'supplier-breadth',
      title: 'רוחב סל וריכוזיות',
      goal: 'Supplier breadth (items and departments per supplier) and department concentration: departments where one supplier dominates — substitution risk.',
      executiveSummary: querySlot({
        goal: 'Top 8 broadest suppliers by item count.',
        widget: { kind: 'hbar', title: 'הספקים הרחבים — מספר פריטים', valueFormat: 'int', name: 'supplier', value: 'items' },
        sql: `SELECT supplier, sum(items) AS items, count(*) AS depts,
  round(sum(net)/1e6, 1) AS net_M, round(sum(net)/sum(items)) AS net_per_item
FROM full_data GROUP BY 1 ORDER BY items DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 suppliers by breadth with revenue efficiency per item.',
        widget: { kind: 'scatter', title: 'רוחב סל מול הכנסה לפי ספק', x: 'items', y: 'net_M', name: 'supplier', xLabel: 'מק"טים', yLabel: 'הכנסה (מ׳ ₪)', xFormat: 'int', yFormat: 'compact' },
        sql: `SELECT supplier, sum(items) AS items, count(*) AS depts,
  round(sum(net)/1e6, 2) AS net_M,
  round(sum(net)/sum(items)) AS net_per_item
FROM full_data GROUP BY 1 HAVING sum(net) > 1000000
ORDER BY items DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Department concentration: for each material department, the top supplier and its share of the department — where one failure kills a category.',
        widget: { kind: 'table', title: 'ריכוזיות ספק במחלקה', columns: [{key: 'dept', label: 'מחלקה'}, {key: 'top_supplier', label: 'ספק מוביל'}, {key: 'top_supplier_share_pct', label: 'נתח מהמחלקה', format: '%'}, {key: 'n_suppliers', label: 'ספקים', format: 'int'}, {key: 'dept_net_M', label: 'נטו (מ׳ ₪)'}] },
        sql: `WITH dt AS (
  SELECT dept, sum(net) AS dept_net, count(DISTINCT supplier) AS n_suppliers
  FROM full_data GROUP BY 1)
SELECT dt.dept, round(dt.dept_net/1e6, 2) AS dept_net_M, dt.n_suppliers,
  arg_max(fd.supplier, fd.share_of_dept_pct) AS top_supplier,
  round(max(fd.share_of_dept_pct), 1) AS top_supplier_share_pct
FROM dt JOIN full_data fd ON fd.dept = dt.dept
WHERE dt.dept_net > 1000000
GROUP BY 1, 2, 3
ORDER BY top_supplier_share_pct DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Supplier × department revenue and item counts — the full sourcing matrix.',
        grain: 'one row per (supplier, department) with sales (~3K rows)',
        columns: 'supplier, dept, net, items, share_of_dept_pct',
        viewSql: `WITH g AS (
  SELECT l.PrtC AS prt, sum(l.Scm - l.VatAmount) AS net
  FROM ${L} l
  JOIN ${H} h ON l.KupaDocC = h.C
  WHERE l.KupaDocC >= 4366052
  GROUP BY 1),
sd AS (
  SELECT p.Spk AS spk, p.DepartmentC AS dept_c, sum(g.net) AS net, count(DISTINCT g.prt) AS items
  FROM g JOIN ${PRT} p ON p.C = g.prt
  GROUP BY 1, 2)
SELECT trim(sup.Nm) AS supplier, trim(dp.Nm) AS dept, round(sd.net, 1) AS net, sd.items,
  round(100.0*sd.net/sum(sd.net) OVER (PARTITION BY sd.dept_c), 2) AS share_of_dept_pct
FROM sd JOIN ${SUP} sup ON sup.C = sd.spk
JOIN ${DEPT} dp ON dp.C = sd.dept_c`
      })
    }),
    section({
      id: 'franchise-zakyan',
      title: 'חיוב זכיינים (Zakyan)',
      goal: 'Daily cost billing to franchised branches from DailyPriceCost_Zakyan — who is billed how much, for how many units, and the monthly trend.',
      caveats: 'טבלת Zakyan היא חיוב-עלות בלבד (TotalCount × FinalCostPrice; שדות ScmAlut אפס) — אין צד הכנסה ולכן אין מרווח. מכסה רק את הסניפים המזוכיינים, מ-2025-01. ה-CustomerID-ים הם דליי "לקוח כללי" של הסניף עצמו.',
      executiveSummary: querySlot({
        goal: 'Top 8 franchised branches by billed cost volume.',
        widget: { kind: 'hbar', title: 'חיוב זכיינים לפי סניף (₪)', valueFormat: '₪', name: 'branch', value: 'billed_cost_ils' },
        sql: `SELECT trim(s.Nm) AS branch,
  round(sum(z.TotalCount*z.FinalCostPrice)) AS billed_cost_ils,
  round(sum(z.TotalCount)) AS units,
  count(DISTINCT z.DateDoc) AS billed_days,
  round(sum(z.TotalCount*z.FinalCostPrice)/nullif(sum(z.TotalCount), 0), 2) AS avg_unit_cost
FROM ${ZAK} z LEFT JOIN ${STORE} s ON s.C = z.StoreID
WHERE z.FinalCostPrice > 0
GROUP BY 1 ORDER BY billed_cost_ils DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'All franchised branches billed via Zakyan with volumes and unit economics.',
        widget: { kind: 'table', title: 'חיוב זכיינים — פירוט', columns: [{key: 'branch', label: 'סניף'}, {key: 'billed_cost_ils', label: 'חיוב', format: '₪'}, {key: 'units', label: 'יחידות', format: 'int'}, {key: 'items', label: 'פריטים', format: 'int'}, {key: 'avg_unit_cost', label: 'עלות ליחידה', format: '₪'}] },
        sql: `SELECT trim(s.Nm) AS branch,
  round(sum(z.TotalCount*z.FinalCostPrice)) AS billed_cost_ils,
  round(sum(z.TotalCount)) AS units,
  count(DISTINCT z.DateDoc) AS billed_days,
  count(DISTINCT z.ItemID) AS items,
  count(DISTINCT z.CustomerID) AS billing_accounts,
  round(sum(z.TotalCount*z.FinalCostPrice)/nullif(sum(z.TotalCount), 0), 2) AS avg_unit_cost
FROM ${ZAK} z LEFT JOIN ${STORE} s ON s.C = z.StoreID
WHERE z.FinalCostPrice > 0
GROUP BY 1 ORDER BY billed_cost_ils DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Branch × month billed-cost trend over the last 6 months of Zakyan data.',
        widget: { kind: 'line', title: 'מגמת חיוב זכיינים (₪)', subtitle: '6 חודשים אחרונים', valueFormat: '₪', x: 'ym_key', y: 'billed_cost_ils', seriesBy: 'branch' },
        sql: `WITH z AS (
  SELECT StoreID, DateDoc//100 AS ymk, sum(TotalCount*FinalCostPrice) AS billed, sum(TotalCount) AS units
  FROM ${ZAK} WHERE FinalCostPrice > 0
  GROUP BY 1, 2),
mx AS (SELECT max(ymk) AS m FROM z)
SELECT trim(s.Nm) AS branch, z.ymk AS ym_key,
  round(z.billed) AS billed_cost_ils, round(z.units) AS units
FROM z LEFT JOIN ${STORE} s ON s.C = z.StoreID
WHERE z.ymk > (SELECT m FROM mx) - 6
ORDER BY branch, ym_key LIMIT 50`
      }),
      fullData: fullData({
        description: 'Branch × billing account × month Zakyan billing — the complete franchise cost-billing base.',
        grain: 'one row per (branch, CustomerID, month) (~500 rows)',
        columns: 'branch_id, branch, customer_account: trimmed Idx name of the billed account, ym_key: yyyymm, billed_cost_ils, units, items',
        viewSql: `SELECT z.StoreID AS branch_id, trim(s.Nm) AS branch,
  trim(coalesce(i.Nm, z.CustomerID::VARCHAR)) AS customer_account,
  z.DateDoc//100 AS ym_key,
  round(sum(z.TotalCount*z.FinalCostPrice), 1) AS billed_cost_ils,
  round(sum(z.TotalCount), 1) AS units,
  count(DISTINCT z.ItemID) AS items
FROM ${ZAK} z
LEFT JOIN ${STORE} s ON s.C = z.StoreID
LEFT JOIN ${IDX} i ON i.C = z.CustomerID
WHERE z.FinalCostPrice > 0
GROUP BY 1, 2, 3, 4`
      })
    })
  ]
}) })

VerifiedReport('category-mix', { impl: verifiedReport({
  title: 'קטגוריות ותמהיל מוצרים',
  description: 'תמהיל מחלקות ומגמתו, תרומת קבוצות מוצר (רווח מול מספר מק"טים) וקבוצות מרווח-גבוה בתת-ייצוג, זנב ארוך של מק"טים להורדה, וקליטת פריטים חדשים.',
  whenToUse: 'שאלות מגוון וקטגוריות — איך מתחלקת ההכנסה בין מחלקות, אילו קבוצות שוות הרחבה, מה להוריד מהמדף, ואיך נקלטים פריטים חדשים. לרווחיות פריט בודד השתמש ב-profitability.',
  routePhrases: ['קטגוריות', 'תמהיל מוצרים', 'מחלקות', 'מגוון', 'קבוצות מוצר', 'מקטים', 'מק"ט', 'הורדה מהמדף', 'פריטים חדשים', 'השקות'],
  questionsCovered: ['Q40', 'Q41', 'Q42', 'Q43', 'Q44'],
  caveats: `מחלקות ארטיפקט מוחרגות מחישובי מגוון: 164 (אגרות/משטחים/מיכלים) ו-204 (לא לפידיון) — מזהים אלה ספציפיים לחברה זו. שנת 2026 חלקית — עמודות תקופתיות הן כיווניות. ירקות/פירות שקילים מרכזים פדיון עצום לקוד בודד ולכן רווח-לפריט שלהם גבוה מבנית.`,
  executiveSummary: querySlot({
    goal: 'Top 8 departments by revenue share over the last 12 complete months, with margin.',
    widget: { kind: 'treemap', title: 'תמהיל מחלקות (מ׳ ₪)', subtitle: '12 חודשים אחרונים', name: 'dept', value: 'net_12m_M' },
    sql: `WITH cost AS (SELECT ItemID, StoreID, arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE FinalRegularCostPrice > 0) AS unit_cost FROM read_parquet('{{ROOT}}/DailyPriceCost.parquet') GROUP BY 1, 2),
hdr AS (
  SELECT C, StoreC FROM read_parquet('{{ROOT}}/KupaDoc_Header.parquet')
  WHERE DateDoc >= (SELECT date_trunc('month', max(DateDoc)) FROM read_parquet('{{ROOT}}/KupaDoc_Header.parquet')) - INTERVAL 12 MONTH
    AND DateDoc < (SELECT date_trunc('month', max(DateDoc)) FROM read_parquet('{{ROOT}}/KupaDoc_Header.parquet'))),
istore AS (
  SELECT h.StoreC AS branch_id, l.PrtC AS prt, sum(l.Scm - l.VatAmount) AS net, sum(l.Cmt) AS qty
  FROM read_parquet('{{ROOT}}/KupaDoc_Lines.parquet') l
  JOIN hdr h ON h.C = l.KupaDocC
  GROUP BY 1, 2),
di AS (
  SELECT p.DepartmentC AS dept_c, istore.net, istore.qty, c.unit_cost
  FROM istore JOIN read_parquet('{{ROOT}}/Prt.parquet') p ON p.C = istore.prt
  LEFT JOIN cost c ON c.ItemID = istore.prt AND c.StoreID = istore.branch_id),
g AS (
  SELECT dept_c,
    sum(net) AS net,
    sum(net - unit_cost*qty) FILTER (WHERE unit_cost IS NOT NULL) AS gp,
    sum(net) FILTER (WHERE unit_cost IS NOT NULL) AS net_ck
  FROM di GROUP BY 1)
SELECT trim(dp.Nm) AS dept,
  round(g.net/1e6, 1) AS net_12m_M,
  round(100.0*g.net/sum(g.net) OVER (), 1) AS share_pct,
  round(100.0*g.gp/nullif(g.net_ck, 0), 1) AS margin_pct
FROM g JOIN read_parquet('{{ROOT}}/Departments.parquet') dp ON dp.C = g.dept_c
ORDER BY net_12m_M DESC LIMIT 8`
  }),
  summary: querySlot({
    goal: 'Department revenue share by period (two years back, prior year, current partial year) with the share shift — is the balance changing.',
    widget: { kind: 'table', title: 'נתח מחלקות לפי תקופה', columns: [{key: 'dept', label: 'מחלקה'}, {key: 'share_2y_ago_pct', label: 'לפני שנתיים', format: '%'}, {key: 'share_prev_year_pct', label: 'אשתקד', format: '%'}, {key: 'share_cur_year_pct', label: 'השנה', format: '%'}, {key: 'shift_ppt', label: 'שינוי (נק׳)'}] },
    sql: `WITH per AS (
  SELECT p.DepartmentC AS dept_c,
    CASE WHEN year(h.DateDoc) = year(${LAST_FULL}) THEN 'cur'
      WHEN year(h.DateDoc) = year(${LAST_FULL}) - 1 THEN 'prev'
      ELSE 'prev2' END AS per,
    sum(${NET}) AS net
  FROM ${SALES} JOIN ${PRT} p ON p.C = l.PrtC
  GROUP BY 1, 2),
sh AS (
  SELECT dept_c, per, net, 100.0*net/sum(net) OVER (PARTITION BY per) AS pct
  FROM per)
SELECT trim(dp.Nm) AS dept,
  round(max(CASE WHEN per = 'prev2' THEN pct END), 1) AS share_2y_ago_pct,
  round(max(CASE WHEN per = 'prev' THEN pct END), 1) AS share_prev_year_pct,
  round(max(CASE WHEN per = 'cur' THEN pct END), 1) AS share_cur_year_pct,
  round(coalesce(max(CASE WHEN per = 'cur' THEN pct END), 0) - coalesce(max(CASE WHEN per = 'prev2' THEN pct END), 0), 2) AS shift_ppt,
  round(sum(net)/1e6, 1) AS net_total_M
FROM sh JOIN ${DEPT} dp ON dp.C = sh.dept_c
GROUP BY 1 ORDER BY share_prev_year_pct DESC NULLS LAST LIMIT 25`
  }),
  sections: [
    section({
      id: 'department-mix',
      title: 'תמהיל מחלקות',
      goal: 'Revenue split between departments and how it shifts over time.',
      executiveSummary: querySlot({
        goal: 'Top 8 departments by share, last 12 complete months.',
        widget: { kind: 'pie', title: 'המחלקות המובילות (מ׳ ₪)', subtitle: '12 חודשים אחרונים', donut: true, name: 'dept', value: 'net_12m_M' },
        sql: `SELECT dept,
  round(sum(net)/1e6, 1) AS net_12m_M,
  round(100.0*sum(net)/sum(sum(net)) OVER (), 1) AS share_pct
FROM full_data
WHERE ym >= strftime(strptime((SELECT max(ym) FROM full_data) || '-01', '%Y-%m-%d') - INTERVAL 12 MONTH, '%Y-%m')
  AND ym < (SELECT max(ym) FROM full_data)
GROUP BY 1 ORDER BY net_12m_M DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Department share by year with the multi-year shift (Q40 form).',
        widget: { kind: 'table', title: 'נתח מחלקות רב-שנתי', columns: [{key: 'dept', label: 'מחלקה'}, {key: 'share_2y_ago_pct', label: 'לפני שנתיים', format: '%'}, {key: 'share_prev_year_pct', label: 'אשתקד', format: '%'}, {key: 'share_cur_year_pct', label: 'השנה', format: '%'}, {key: 'shift_ppt', label: 'שינוי (נק׳)'}] },
        sql: `WITH per AS (
  SELECT dept,
    CASE WHEN substr(ym,1,4)::INT = (SELECT max(substr(ym,1,4)::INT) FROM full_data) THEN 'cur'
      WHEN substr(ym,1,4)::INT = (SELECT max(substr(ym,1,4)::INT) FROM full_data) - 1 THEN 'prev'
      ELSE 'prev2' END AS per,
    sum(net) AS net
  FROM full_data GROUP BY 1, 2),
sh AS (SELECT dept, per, net, 100.0*net/sum(net) OVER (PARTITION BY per) AS pct FROM per)
SELECT dept,
  round(max(CASE WHEN per = 'prev2' THEN pct END), 1) AS share_2y_ago_pct,
  round(max(CASE WHEN per = 'prev' THEN pct END), 1) AS share_prev_year_pct,
  round(max(CASE WHEN per = 'cur' THEN pct END), 1) AS share_cur_year_pct,
  round(coalesce(max(CASE WHEN per = 'cur' THEN pct END), 0) - coalesce(max(CASE WHEN per = 'prev2' THEN pct END), 0), 2) AS shift_ppt
FROM sh
GROUP BY 1 ORDER BY share_prev_year_pct DESC NULLS LAST LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Department share momentum: last 3 complete months vs the same 3 months a year earlier — which categories are gaining or losing share now.',
        widget: { kind: 'hbar', title: 'שינוי נתח מחלקה (נק׳ אחוז)', name: 'dept', value: 'share_shift_ppt' },
        sql: `WITH b AS (SELECT max(ym) AS mx,
    strftime(strptime(max(ym) || '-01', '%Y-%m-%d') - INTERVAL 3 MONTH, '%Y-%m') AS n0,
    strftime(strptime(max(ym) || '-01', '%Y-%m-%d') - INTERVAL 15 MONTH, '%Y-%m') AS y0,
    strftime(strptime(max(ym) || '-01', '%Y-%m-%d') - INTERVAL 12 MONTH, '%Y-%m') AS y1
  FROM full_data),
w AS (
  SELECT dept,
    sum(net) FILTER (WHERE ym >= (SELECT n0 FROM b) AND ym < (SELECT mx FROM b)) AS net_now,
    sum(net) FILTER (WHERE ym >= (SELECT y0 FROM b) AND ym < (SELECT y1 FROM b)) AS net_yr_ago
  FROM full_data GROUP BY 1),
sh AS (
  SELECT dept, net_now, net_yr_ago,
    100.0*net_now/sum(net_now) OVER () AS share_now,
    100.0*net_yr_ago/sum(net_yr_ago) OVER () AS share_yr_ago
  FROM w)
SELECT dept,
  round(net_now/1e6, 2) AS net_3m_M,
  round(share_now, 2) AS share_now_pct,
  round(share_yr_ago, 2) AS share_yr_ago_pct,
  round(share_now - share_yr_ago, 2) AS share_shift_ppt,
  round(100.0*(net_now - net_yr_ago)/nullif(net_yr_ago, 0), 1) AS net_yoy_pct
FROM sh
WHERE net_now > 100000
ORDER BY abs(share_now - share_yr_ago) DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Department × branch × month revenue and share since 2024.',
        grain: 'one row per (department, branch, month)',
        columns: 'dept, branch_id, branch, ym, net, share_pct: department share of that branch-month revenue',
        viewSql: `WITH hdr AS (
  SELECT C, StoreC, date_trunc('month', DateDoc) AS m
  FROM read_parquet('{{ROOT}}/KupaDoc_Header.parquet')
  WHERE DateDoc >= DATE '2024-01-01'),
pd AS (
  SELECT p.C AS prt, dp.Nm AS dept_nm
  FROM read_parquet('{{ROOT}}/Prt.parquet') p
  JOIN read_parquet('{{ROOT}}/Departments.parquet') dp ON dp.C = p.DepartmentC),
dm AS (
  SELECT pd.dept_nm, h.StoreC AS branch_id, h.m, sum((l.Scm - l.VatAmount)) AS net
  FROM read_parquet('{{ROOT}}/KupaDoc_Lines.parquet') l
  JOIN hdr h ON l.KupaDocC = h.C
  JOIN pd ON pd.prt = l.PrtC
  GROUP BY 1, 2, 3)
SELECT trim(dm.dept_nm) AS dept, dm.branch_id, trim(s.Nm) AS branch, strftime(dm.m, '%Y-%m') AS ym, round(dm.net, 1) AS net,
  round(100.0*dm.net/sum(dm.net) OVER (PARTITION BY dm.branch_id, dm.m), 2) AS share_pct
FROM dm JOIN read_parquet('{{ROOT}}/Store.parquet') s ON s.C = dm.branch_id`
      })
    }),
    section({
      id: 'group-contribution',
      title: 'תרומת קבוצות מוצר',
      goal: 'Gross profit per traded SKU by PrtGroup — the assortment workhorses — plus high-margin under-represented groups (whitespace).',
      caveats: 'מק"ט נסחר = פריט עם מכירות ועלות ידועה; מונה ומכנה על אותו בסיס. whitespace = מרווח מעל ממוצע הרשת עם נתח הכנסה <1.5% — מסמן היכן הרחבה אפשרית, לא מוכיח ביקוש.',
      executiveSummary: querySlot({
        goal: 'Top 8 groups by gross profit per traded SKU.',
        widget: { kind: 'hbar', title: 'רווח גולמי למק"ט לפי קבוצה (₪)', valueFormat: '₪', name: 'grp', value: 'gp_per_sku' },
        sql: `SELECT grp, round(sum(net)/1e6, 1) AS net_M, round(sum(gross_profit_ils)) AS gross_profit_ils,
  max(traded_sku_chain) AS sku, round(sum(gross_profit_ils)/nullif(max(traded_sku_chain), 0)) AS gp_per_sku
FROM full_data
GROUP BY grp_c, grp
HAVING max(traded_sku_chain) >= 20 AND sum(net) > 500000
ORDER BY gp_per_sku DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 groups by profit per SKU (Q44 form).',
        widget: { kind: 'table', title: 'קבוצות לפי רווח למק"ט', columns: [{key: 'grp', label: 'קבוצה'}, {key: 'gp_per_sku', label: 'רווח למק"ט', format: '₪'}, {key: 'gross_profit_ils', label: 'רווח גולמי', format: '₪'}, {key: 'net_M', label: 'נטו (מ׳ ₪)'}, {key: 'sku', label: 'מק"טים', format: 'int'}] },
        sql: `SELECT grp, round(sum(net)/1e6, 1) AS net_M, round(sum(gross_profit_ils)) AS gross_profit_ils,
  max(traded_sku_chain) AS sku, round(sum(gross_profit_ils)/nullif(max(traded_sku_chain), 0)) AS gp_per_sku
FROM full_data
GROUP BY grp_c, grp
HAVING max(traded_sku_chain) >= 20 AND sum(net) > 500000
ORDER BY gp_per_sku DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'High-margin groups above chain-average margin with a whitespace flag (revenue share < 1.5%) — expansion candidates (Q42 form).',
        widget: { kind: 'scatter', title: 'מרווח מול נתח הכנסה — מועמדי הרחבה', x: 'rev_share_pct', y: 'margin_pct', name: 'grp', valueFormat: '%', xLabel: 'נתח הכנסה (%)', yLabel: 'מרווח (%)' },
        sql: `WITH gg AS (
  SELECT grp_c, grp, sum(net) AS net, sum(gross_profit_ils) AS gp, sum(net_ck) AS net_ck, max(sku_all_chain) AS sku
  FROM full_data GROUP BY grp_c, grp),
tot AS (SELECT sum(net) AS tnet, sum(gp)/sum(net_ck) AS chain_margin FROM gg)
SELECT grp,
  round(100.0*gp/nullif(net_ck, 0), 1) AS margin_pct,
  round(100.0*(SELECT chain_margin FROM tot), 1) AS chain_margin_pct,
  round(net/1e6, 2) AS net_M,
  round(100.0*net/(SELECT tnet FROM tot), 2) AS rev_share_pct,
  sku,
  CASE WHEN 100.0*net/(SELECT tnet FROM tot) < 1.5 THEN 'whitespace_candidate' ELSE 'established' END AS whitespace_flag
FROM gg
WHERE gp/nullif(net_ck, 0) > (SELECT chain_margin FROM tot) AND net_ck > 300000
ORDER BY margin_pct DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Group × branch economics: revenue, profit, SKU counts, margin and share, artifact departments excluded.',
        grain: 'one row per (PrtGroup, branch) with sales',
        columns: 'grp_c, grp, dept, branch_id, branch, net, gross_profit_ils, net_ck, margin_pct (costed basis), traded_sku (costed, net>0, branch), traded_sku_chain/sku_all_chain (chain-wide distinct SKU counts, denormalized per group), gp_per_sku, rev_share_pct',
        viewSql: `WITH cost AS (SELECT ItemID, StoreID, arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE FinalRegularCostPrice > 0) AS unit_cost FROM read_parquet('{{ROOT}}/DailyPriceCost.parquet') GROUP BY 1, 2),
pd AS (
  SELECT p.C AS prt, p.GroupC AS grp_c, p.DepartmentC AS dept_c
  FROM read_parquet('{{ROOT}}/Prt.parquet') p
  WHERE p.DepartmentC NOT IN (164, 204)),
hdr AS (
  SELECT C, StoreC FROM read_parquet('{{ROOT}}/KupaDoc_Header.parquet') WHERE DateDoc >= DATE '2024-01-01'),
istore AS MATERIALIZED (
  SELECT h.StoreC AS branch_id, l.PrtC AS prt,
    sum(l.Scm - l.VatAmount) AS net, sum(l.Cmt) AS qty,
    max((l.Scm - l.VatAmount) > 0) AS has_pos
  FROM read_parquet('{{ROOT}}/KupaDoc_Lines.parquet') l
  JOIN hdr h ON h.C = l.KupaDocC
  GROUP BY 1, 2),
gi AS (
  SELECT pd.grp_c, istore.branch_id, pd.dept_c, istore.prt, istore.net, istore.has_pos,
    c.unit_cost, istore.net - c.unit_cost*istore.qty AS gp_line
  FROM istore JOIN pd ON pd.prt = istore.prt
  LEFT JOIN cost c ON c.ItemID = istore.prt AND c.StoreID = istore.branch_id),
giprt AS (
  SELECT grp_c, prt, max((has_pos AND unit_cost IS NOT NULL)) AS costed_pos
  FROM gi GROUP BY 1, 2),
gchain AS (
  SELECT grp_c, count(*) FILTER (WHERE costed_pos) AS traded_sku_chain, count(*) AS sku_all_chain
  FROM giprt GROUP BY 1),
g AS (
  SELECT grp_c, branch_id, min(dept_c) AS dept_c,
    sum(net) AS net,
    sum(gp_line) FILTER (WHERE unit_cost IS NOT NULL) AS gp,
    sum(net) FILTER (WHERE unit_cost IS NOT NULL) AS net_ck,
    count(*) FILTER (WHERE has_pos AND unit_cost IS NOT NULL) AS traded_sku
  FROM gi GROUP BY 1, 2)
SELECT g.grp_c, trim(pg.Nm) AS grp, trim(dp.Nm) AS dept, g.branch_id, trim(s.Nm) AS branch,
  round(g.net, 1) AS net,
  round(g.gp, 1) AS gross_profit_ils,
  round(g.net_ck, 1) AS net_ck,
  round(100.0*g.gp/nullif(g.net_ck, 0), 1) AS margin_pct,
  g.traded_sku,
  gc.traded_sku_chain,
  gc.sku_all_chain,
  round(g.gp/nullif(g.traded_sku, 0)) AS gp_per_sku,
  round(100.0*g.net/sum(g.net) OVER (PARTITION BY g.branch_id), 3) AS rev_share_pct
FROM g
JOIN gchain gc ON gc.grp_c = g.grp_c
JOIN read_parquet('{{ROOT}}/PrtGroups.parquet') pg ON pg.C = g.grp_c
JOIN read_parquet('{{ROOT}}/Store.parquet') s ON s.C = g.branch_id
LEFT JOIN read_parquet('{{ROOT}}/Departments.parquet') dp ON dp.C = g.dept_c`
      })
    }),
    section({
      id: 'sku-rationalization',
      title: 'צמצום מק"טים',
      goal: 'The long tail: established items (>1 year old, not archived) with near-zero recent sales that still hold stock — the free-the-shelf list, with the tiny revenue at risk.',
      caveats: 'מועמד להורדה = פריט פעיל בן שנה+, מכר פחות מ-₪500 ב-180 הימים האחרונים, ועדיין מחזיק מלאי. מחלקות ארטיפקט (164/204) מוחרגות. GREATEST(net,0) מונע מפריטים עתירי-החזרות להסתיר סיכון. ה-SKU הוא קוד פריט; שמות חוזרים על פני קודים (רישום עונתי מחדש) — מגוון לפי שם נמוך ממספר הקודים, ומועמד להורדה עשוי להיות סתם קוד עונה שעברה של מוצר חי.',
      executiveSummary: querySlot({
        goal: 'Rationalization headline: candidate count, revenue at risk (and its share), stock units to free.',
        widget: { kind: 'kpi', title: 'צמצום מק"טים — מבט מהיר', items: [{label: 'מועמדים להורדה', col: 'candidate_items', format: 'int'}, {label: 'הכנסה בסיכון (אלפי ₪)', col: 'rev_at_risk_K'}, {label: 'מההכנסה', col: 'pct_of_recent_rev', format: '%'}, {label: 'יחידות מלאי להשתחרר', col: 'stock_units_mixed', format: 'int'}] },
        sql: `WITH recent AS (
  SELECT l.PrtC AS prt, sum(${NET}) AS net_recent
  FROM ${SALES} WHERE h.DateDoc::DATE > ${LAST_FULL} - 180 GROUP BY 1),
stock AS (
  SELECT i.Prt AS prt, sum(i.Itra) AS units FROM ${ITR} i
  JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
  GROUP BY 1 HAVING sum(i.Itra) > 0)
SELECT count(*) AS candidate_items,
  round(sum(greatest(coalesce(r.net_recent, 0), 0))/1e3, 1) AS rev_at_risk_K,
  round(100.0*sum(greatest(coalesce(r.net_recent, 0), 0))
    /(SELECT sum(${NET}) FROM ${SALES} WHERE h.DateDoc::DATE > ${LAST_FULL} - 180), 3) AS pct_of_recent_rev,
  round(sum(st.units)) AS stock_units_mixed
FROM ${PRT} p
JOIN stock st ON st.prt = p.C
LEFT JOIN recent r ON r.prt = p.C
WHERE p.ArchiveDate IS NULL AND p.DateOpen < ${LAST_FULL} - 365
  AND p.DepartmentC NOT IN (164, 204)
  AND coalesce(r.net_recent, 0) < 500
LIMIT 1`
      }),
      summary: querySlot({
        goal: 'Top 25 delist candidates by stock held — slowest items hogging the most shelf.',
        widget: { kind: 'hbar', title: 'מועמדי הורדה — מלאי מוחזק', valueFormat: 'int', name: 'item', value: 'stock_units' },
        sql: `WITH recent AS (
  SELECT l.PrtC AS prt, sum(${NET}) AS net_recent
  FROM ${SALES} WHERE h.DateDoc::DATE > ${LAST_FULL} - 180 GROUP BY 1),
stock AS (
  SELECT i.Prt AS prt, sum(i.Itra) AS units FROM ${ITR} i
  JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
  GROUP BY 1 HAVING sum(i.Itra) > 0)
SELECT p.C AS prt, trim(p.Nm) AS item, trim(dp.Nm) AS dept,
  round(coalesce(r.net_recent, 0)) AS net_last_180d,
  round(st.units) AS stock_units
FROM ${PRT} p
JOIN stock st ON st.prt = p.C
LEFT JOIN recent r ON r.prt = p.C
LEFT JOIN ${DEPT} dp ON dp.C = p.DepartmentC
WHERE p.ArchiveDate IS NULL AND p.DateOpen < ${LAST_FULL} - 365
  AND p.DepartmentC NOT IN (164, 204)
  AND coalesce(r.net_recent, 0) < 500
ORDER BY st.units DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Top 50 delist candidates with supplier, last sale and stock value — the buyer-ready rationalization sheet.',
        widget: { kind: 'table', title: 'גיליון צמצום לקניין', columns: [{key: 'item', label: 'פריט'}, {key: 'dept', label: 'מחלקה'}, {key: 'supplier', label: 'ספק'}, {key: 'net_last_180d', label: 'נטו 180 יום', format: '₪'}, {key: 'last_sale_d', label: 'מכירה אחרונה'}, {key: 'stock_units', label: 'מלאי'}, {key: 'stock_value_ils', label: 'שווי מלאי', format: '₪'}] },
        sql: `WITH recent AS (
  SELECT l.PrtC AS prt, sum(${NET}) AS net_recent, max(h.DateDoc::DATE) AS last_sale_d
  FROM ${SALES} GROUP BY 1),
stock AS (
  SELECT i.Prt AS prt, sum(i.Itra) AS units FROM ${ITR} i
  JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
  GROUP BY 1 HAVING sum(i.Itra) > 0),
icost AS (
  SELECT ItemID, arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE FinalRegularCostPrice > 0) AS unit_cost
  FROM ${DPC} GROUP BY ItemID),
recent180 AS (
  SELECT l.PrtC AS prt, sum(${NET}) AS net_180
  FROM ${SALES} WHERE h.DateDoc::DATE > ${LAST_FULL} - 180 GROUP BY 1)
SELECT p.C AS prt, trim(p.Nm) AS item, trim(dp.Nm) AS dept, trim(sup.Nm) AS supplier,
  round(coalesce(r180.net_180, 0)) AS net_last_180d,
  r.last_sale_d,
  round(st.units) AS stock_units,
  round(st.units*ic.unit_cost) AS stock_value_ils
FROM ${PRT} p
JOIN stock st ON st.prt = p.C
LEFT JOIN recent r ON r.prt = p.C
LEFT JOIN recent180 r180 ON r180.prt = p.C
LEFT JOIN icost ic ON ic.ItemID = p.C
LEFT JOIN ${DEPT} dp ON dp.C = p.DepartmentC
LEFT JOIN ${SUP} sup ON sup.C = p.Spk
WHERE p.ArchiveDate IS NULL AND p.DateOpen < ${LAST_FULL} - 365
  AND p.DepartmentC NOT IN (164, 204)
  AND coalesce(r180.net_180, 0) < 500
ORDER BY stock_value_ils DESC NULLS LAST LIMIT 50`
      }),
      fullData: fullData({
        description: 'Every delist candidate (established, near-zero 180-day branch sales, holding stock) with stock value and recency.',
        grain: 'one row per candidate item × branch',
        columns: 'prt, item, dept, supplier, branch_id, branch, net_last_180d, last_sale_d, stock_units, stock_value_ils',
        perItemOnly: 'stock_units',
        viewSql: `WITH sales_agg AS (
  SELECT l.PrtC AS prt, h.StoreC AS branch_id,
    sum(${NET}) FILTER (WHERE h.DateDoc::DATE > ${LAST_FULL} - 180) AS net_180,
    max(h.DateDoc::DATE) AS last_sale_d
  FROM ${SALES} GROUP BY 1, 2),
stock AS (
  SELECT i.Prt AS prt, i.Store AS branch_id, sum(i.Itra) AS units FROM ${ITR} i
  JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
  GROUP BY 1, 2 HAVING sum(i.Itra) > 0),
icost AS (
  SELECT ItemID, arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE FinalRegularCostPrice > 0) AS unit_cost
  FROM ${DPC} GROUP BY ItemID)
SELECT p.C AS prt, trim(p.Nm) AS item, trim(dp.Nm) AS dept, trim(sup.Nm) AS supplier, st.branch_id, trim(s.Nm) AS branch,
  round(coalesce(sa.net_180, 0), 1) AS net_last_180d,
  sa.last_sale_d,
  round(st.units, 1) AS stock_units,
  round(st.units*ic.unit_cost, 1) AS stock_value_ils
FROM ${PRT} p
JOIN stock st ON st.prt = p.C
JOIN ${STORE} s ON s.C = st.branch_id
LEFT JOIN sales_agg sa ON sa.prt = p.C AND sa.branch_id = st.branch_id
LEFT JOIN icost ic ON ic.ItemID = p.C
LEFT JOIN ${DEPT} dp ON dp.C = p.DepartmentC
LEFT JOIN ${SUP} sup ON sup.C = p.Spk
WHERE p.ArchiveDate IS NULL AND p.DateOpen < ${LAST_FULL} - 365
  AND p.DepartmentC NOT IN (164, 204)
  AND coalesce(sa.net_180, 0) < 500`
      })
    }),
    section({
      id: 'new-items',
      title: 'קליטת פריטים חדשים',
      goal: 'How recently opened items ramp vs expectations: the latest fully-observable opening cohort vs the same quarter a year earlier, on age-aligned first-13-week sales.',
      caveats: 'קוהורטה = רבעון פתיחה (Prt.DateOpen); ההשוואה מול אותו רבעון שנה קודם מנטרלת עונתיות. פריטים שנפתחו ולא מכרו כלל נספרים כאפס — קריאת "מול ציפיות" כנה. פריטי קצה-חלון צונזרים חלקית — כיוון אמין, גדלים אינדיקטיביים.',
      executiveSummary: querySlot({
        goal: 'Cohort comparison: activation rate and median first-13-week net — latest observable cohort vs same quarter last year.',
        widget: { kind: 'groupedBar', title: 'מכירות 13 שבועות ראשונים — קוהורטות (₪)', valueFormat: '₪', category: 'cohort', ys: [{col: 'median_net_13wk', label: 'חציון'}, {col: 'mean_net_13wk', label: 'ממוצע'}] },
        sql: `WITH coh AS (
  SELECT p.C AS prt, p.DateOpen,
    CASE WHEN p.DateOpen >= date_trunc('quarter', ${LAST_FULL}) - INTERVAL 6 MONTH
        AND p.DateOpen < date_trunc('quarter', ${LAST_FULL}) - INTERVAL 3 MONTH THEN 'b_recent_cohort'
      WHEN p.DateOpen >= date_trunc('quarter', ${LAST_FULL}) - INTERVAL 18 MONTH
        AND p.DateOpen < date_trunc('quarter', ${LAST_FULL}) - INTERVAL 15 MONTH THEN 'a_year_ago_cohort' END AS cohort
  FROM ${PRT} p
  WHERE p.DepartmentC NOT IN (164, 204)
    AND ((p.DateOpen >= date_trunc('quarter', ${LAST_FULL}) - INTERVAL 6 MONTH AND p.DateOpen < date_trunc('quarter', ${LAST_FULL}) - INTERVAL 3 MONTH)
      OR (p.DateOpen >= date_trunc('quarter', ${LAST_FULL}) - INTERVAL 18 MONTH AND p.DateOpen < date_trunc('quarter', ${LAST_FULL}) - INTERVAL 15 MONTH))),
w13 AS (
  SELECT c.cohort, c.prt, sum(${NET}) AS net13
  FROM coh c JOIN ${L} l ON l.PrtC = c.prt
  JOIN ${H} h ON l.KupaDocC = h.C
  WHERE h.DateDoc >= c.DateOpen AND h.DateDoc < c.DateOpen + INTERVAL 91 DAY AND h.DateDoc >= DATE '2024-01-01'
  GROUP BY 1, 2)
SELECT c.cohort, count(*) AS items_opened, count(w.prt) AS items_with_sales,
  round(100.0*count(w.prt)/count(*)) AS activation_pct,
  round(median(coalesce(w.net13, 0))) AS median_net_13wk,
  round(avg(coalesce(w.net13, 0))) AS mean_net_13wk
FROM coh c LEFT JOIN w13 w ON c.prt = w.prt AND c.cohort = w.cohort
GROUP BY 1 ORDER BY 1 LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 items of the recent cohort by first-13-week net — the successful launches.',
        widget: { kind: 'hbar', title: 'ההשקות המוצלחות (₪)', subtitle: '13 שבועות ראשונים', valueFormat: '₪', name: 'item', value: 'net_first_13wk' },
        sql: `WITH coh AS (
  SELECT p.C AS prt, trim(p.Nm) AS item, p.DateOpen, p.DepartmentC AS dept_c
  FROM ${PRT} p
  WHERE p.DepartmentC NOT IN (164, 204)
    AND p.DateOpen >= date_trunc('quarter', ${LAST_FULL}) - INTERVAL 6 MONTH
    AND p.DateOpen < date_trunc('quarter', ${LAST_FULL}) - INTERVAL 3 MONTH),
w13 AS (
  SELECT c.prt, sum(${NET}) AS net13, count(DISTINCT h.StoreC) AS stores
  FROM coh c JOIN ${L} l ON l.PrtC = c.prt
  JOIN ${H} h ON l.KupaDocC = h.C
  WHERE h.DateDoc >= c.DateOpen AND h.DateDoc < c.DateOpen + INTERVAL 91 DAY AND h.DateDoc >= DATE '2024-01-01'
  GROUP BY 1)
SELECT c.prt, c.item, trim(dp.Nm) AS dept, c.DateOpen::DATE AS date_open,
  round(coalesce(w.net13, 0)) AS net_first_13wk, coalesce(w.stores, 0) AS stores
FROM coh c
LEFT JOIN w13 w ON w.prt = c.prt
LEFT JOIN ${DEPT} dp ON dp.C = c.dept_c
ORDER BY net_first_13wk DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Both cohorts side by side, top 50 by first-13-week net with cohort label — compare launch quality across years.',
        widget: { kind: 'table', title: 'השקות משתי הקוהורטות', columns: [{key: 'cohort', label: 'קוהורטה'}, {key: 'item', label: 'פריט'}, {key: 'dept', label: 'מחלקה'}, {key: 'date_open', label: 'נפתח'}, {key: 'net_first_13wk', label: 'נטו 13 שבועות', format: '₪'}, {key: 'stores', label: 'סניפים', format: 'int'}] },
        sql: `WITH coh AS (
  SELECT p.C AS prt, trim(p.Nm) AS item, p.DateOpen, p.DepartmentC AS dept_c,
    CASE WHEN p.DateOpen >= date_trunc('quarter', ${LAST_FULL}) - INTERVAL 6 MONTH THEN 'recent_cohort'
      ELSE 'year_ago_cohort' END AS cohort
  FROM ${PRT} p
  WHERE p.DepartmentC NOT IN (164, 204)
    AND ((p.DateOpen >= date_trunc('quarter', ${LAST_FULL}) - INTERVAL 6 MONTH AND p.DateOpen < date_trunc('quarter', ${LAST_FULL}) - INTERVAL 3 MONTH)
      OR (p.DateOpen >= date_trunc('quarter', ${LAST_FULL}) - INTERVAL 18 MONTH AND p.DateOpen < date_trunc('quarter', ${LAST_FULL}) - INTERVAL 15 MONTH))),
w13 AS (
  SELECT c.prt, sum(${NET}) AS net13, sum(l.Cmt) AS qty13, count(DISTINCT h.StoreC) AS stores
  FROM coh c JOIN ${L} l ON l.PrtC = c.prt
  JOIN ${H} h ON l.KupaDocC = h.C
  WHERE h.DateDoc >= c.DateOpen AND h.DateDoc < c.DateOpen + INTERVAL 91 DAY AND h.DateDoc >= DATE '2024-01-01'
  GROUP BY 1)
SELECT c.cohort, c.prt, c.item, trim(dp.Nm) AS dept, c.DateOpen::DATE AS date_open,
  round(coalesce(w.net13, 0)) AS net_first_13wk,
  round(coalesce(w.qty13, 0)) AS qty_first_13wk_own_unit,
  coalesce(w.stores, 0) AS stores
FROM coh c
LEFT JOIN w13 w ON w.prt = c.prt
LEFT JOIN ${DEPT} dp ON dp.C = c.dept_c
ORDER BY net_first_13wk DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Every item opened in the last ~18 months with branch-level age-aligned first-13-week performance.',
        grain: 'one row per opened item × selling branch, plus one null-branch row for never-sold items',
        columns: 'prt, item, dept, supplier, branch_id, branch, date_open, net_first_13wk, qty_first_13wk_own_unit, activated: sold in that branch in first 13 weeks',
        perItemOnly: 'qty_first_13wk_own_unit',
        viewSql: `WITH coh AS (
  SELECT p.C AS prt, trim(p.Nm) AS item, p.DateOpen, p.DepartmentC AS dept_c, p.Spk AS spk
  FROM ${PRT} p
  WHERE p.DepartmentC NOT IN (164, 204)
    AND p.DateOpen >= date_trunc('quarter', ${LAST_FULL}) - INTERVAL 18 MONTH
    AND p.DateOpen < date_trunc('quarter', ${LAST_FULL}) - INTERVAL 3 MONTH),
w13 AS (
  SELECT c.prt, h.StoreC AS branch_id, sum(${NET}) AS net13, sum(l.Cmt) AS qty13
  FROM coh c JOIN ${L} l ON l.PrtC = c.prt
  JOIN ${H} h ON l.KupaDocC = h.C
  WHERE h.DateDoc >= c.DateOpen AND h.DateDoc < c.DateOpen + INTERVAL 91 DAY AND h.DateDoc >= DATE '2024-01-01'
  GROUP BY 1, 2)
SELECT c.prt, c.item, trim(dp.Nm) AS dept, trim(sup.Nm) AS supplier, w.branch_id, trim(s.Nm) AS branch,
  c.DateOpen::DATE AS date_open,
  round(coalesce(w.net13, 0), 1) AS net_first_13wk,
  round(coalesce(w.qty13, 0), 1) AS qty_first_13wk_own_unit,
  w.prt IS NOT NULL AS activated
FROM coh c
LEFT JOIN w13 w ON w.prt = c.prt
LEFT JOIN ${STORE} s ON s.C = w.branch_id
LEFT JOIN ${DEPT} dp ON dp.C = c.dept_c
LEFT JOIN ${SUP} sup ON sup.C = c.spk`
      })
    })
  ]
}) })

VerifiedReport('operations-audit', { impl: verifiedReport({
  title: 'תפעול וביקורת',
  description: 'ביקורת תפעולית: עומסי קופות, חריגות קופאים (החזרים/הנחות מול עמיתים), חשיפת מע"מ ופטור, התאמת שני ספרי המכירות (ראשי מול Lk), וחריגות מסמכים (ביטולים, זוגות תיקון, סטורנו).',
  whenToUse: 'שאלות תפעול/ביקורת — קופות, קופאים חריגים, מע"מ, התאמת ספרים וביטולים. לביצועי סניפים עסקיים השתמש ב-branch-performance.',
  routePhrases: ['תפעול', 'ביקורת', 'קופות', 'קופאים', 'מע"מ', 'מעמ', 'מסמכים', 'ביטולים', 'סטורנו', 'התאמת ספרים', 'חריגות'],
  questionsCovered: ['Q46', 'Q47', 'Q48', 'Q49'],
  caveats: `DocType ריק לפני 2026-02-16 (החלפת POS) — היסטוריה לעולם לא מסוננת לפי DocType; החזרים היסטוריים = Scm שלילי. משמעות סוגי המסמך אחרי המעבר: 652=קבלה, 670=חשבונית ללקוח בשם (וולט/צריכה עצמית — מכירות אמיתיות!), 654=ביטול, 650=חיוב ידני. לעולם אין לחבר את הספר הראשי עם ספר Lk — מ-2026-02-16 הזמנות וולט רשומות בשניהם (כפל). OvedC 2 ו-3 הם חשבונות מערכת/קופה-עצמית, לא אנשים; אין טבלת עובדים — אין שמות ואין עלות איוש. חריגה סטטיסטית אינה הוכחת מעילה.`,
  executiveSummary: querySlot({
    goal: 'Ops headline: refund-doc share, void count since DocType exists, VAT collected in the latest complete month, and the ledger match.',
    widget: { kind: 'kpi', title: 'תפעול — מבט מהיר', items: [{label: 'נתח מסמכי החזר', col: 'refund_doc_share_pct', format: '%'}, {label: 'ביטולים (654)', col: 'voids_654_since_doctype', format: 'int'}, {label: 'מע"מ חודש אחרון (מ׳ ₪)', col: 'vat_collected_latest_month_M'}, {label: 'התאמת ספרים Lk/670', col: 'lk_vs_main670_latest_month_pct', format: '%'}] },
    sql: `WITH dt AS (SELECT min(DateDoc) AS overlap_start FROM ${H} WHERE DocType IS NOT NULL),
main AS (
  SELECT count(*) FILTER (WHERE Scm < 0 OR DocType = 654) AS refund_docs,
    count(*) AS docs,
    count(*) FILTER (WHERE DocType = 654) AS voids_654
  FROM ${H} WHERE DateDoc >= DATE '2024-01-01'),
vat AS (
  SELECT sum(ScmMaam) AS vat_month FROM ${H}
  WHERE DateDoc >= ${M_START} AND DateDoc < ${M_END}),
recon AS (
  SELECT sum(lk.Scm) AS lk_gross,
    (SELECT sum(Scm) FROM ${H}
     WHERE DocType = 670 AND DateDoc >= ${M_START} AND DateDoc < ${M_END}) AS main670_gross
  FROM ${LKH} lk WHERE lk.Date >= ${M_START} AND lk.Date < ${M_END})
SELECT round(100.0*main.refund_docs/main.docs, 2) AS refund_doc_share_pct,
  main.voids_654 AS voids_654_since_doctype,
  round(vat.vat_month/1e6, 2) AS vat_collected_latest_month_M,
  round(100.0*recon.lk_gross/nullif(recon.main670_gross, 0), 1) AS lk_vs_main670_latest_month_pct,
  (SELECT overlap_start::DATE FROM dt) AS doctype_since
FROM main, vat, recon LIMIT 1`
  }),
  summary: querySlot({
    goal: 'Branch-level ops profile 2024+: receipts, refund-doc rate, registers in use, receipts per register per day.',
    widget: { kind: 'table', title: 'פרופיל תפעולי לפי סניף', columns: [{key: 'branch', label: 'סניף'}, {key: 'receipts', label: 'קבלות', format: 'int'}, {key: 'refund_doc_rate_pct', label: 'שיעור החזרים', format: '%'}, {key: 'registers', label: 'קופות', format: 'int'}, {key: 'receipts_per_register_day', label: 'קבלות לקופה ליום'}] },
    sql: `SELECT trim(s.Nm) AS branch,
  count(*) FILTER (WHERE h.Scm > 0) AS receipts,
  round(100.0*count(*) FILTER (WHERE h.Scm < 0 OR h.DocType = 654)/count(*), 2) AS refund_doc_rate_pct,
  count(DISTINCT h.KupaNo) AS registers,
  count(DISTINCT h.OvedC) AS cashier_ids,
  round(count(*) FILTER (WHERE h.Scm > 0)*1.0
    /nullif(count(DISTINCT h.DateDoc::DATE)*count(DISTINCT h.KupaNo), 0), 1) AS receipts_per_register_day
FROM ${H} h JOIN ${STORE} s ON s.C = h.StoreC
WHERE h.DateDoc >= DATE '2024-01-01'
GROUP BY 1 ORDER BY receipts DESC LIMIT 25`
  }),
  sections: [
    section({
      id: 'registers',
      title: 'קופות',
      goal: 'Register (KupaNo) workload and anomalies: which registers carry the traffic and which show unusual refund shares.',
      executiveSummary: querySlot({
        goal: 'Top 8 busiest registers in the latest complete month.',
        widget: { kind: 'table', title: 'הקופות העמוסות', columns: [{key: 'branch', label: 'סניף'}, {key: 'register_no', label: 'קופה'}, {key: 'receipts', label: 'קבלות', format: 'int'}, {key: 'net', label: 'נטו', format: '₪'}, {key: 'basket', label: 'סל', format: '₪'}] },
        sql: `WITH w AS (SELECT max(ym) FILTER (WHERE ym < (SELECT max(ym) FROM full_data)) AS complete FROM full_data)
SELECT branch, register_no,
  sum(receipts) AS receipts,
  round(sum(net)) AS net,
  round(sum(receipts_net)/nullif(sum(receipts), 0), 1) AS basket
FROM full_data, w WHERE ym = w.complete
GROUP BY 1, 2 ORDER BY receipts DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 registers by traffic (latest complete month) with refund share.',
        widget: { kind: 'table', title: 'קופות לפי תנועה', columns: [{key: 'branch', label: 'סניף'}, {key: 'register_no', label: 'קופה'}, {key: 'receipts', label: 'קבלות', format: 'int'}, {key: 'refund_doc_rate_pct', label: 'שיעור החזרים', format: '%'}, {key: 'active_days', label: 'ימי פעילות', format: 'int'}] },
        sql: `WITH w AS (SELECT max(ym) FILTER (WHERE ym < (SELECT max(ym) FROM full_data)) AS complete FROM full_data)
SELECT branch, register_no,
  sum(receipts) AS receipts,
  round(sum(net)) AS net,
  round(100.0*sum(refund_docs)/sum(docs), 2) AS refund_doc_rate_pct,
  max(active_days) AS active_days
FROM full_data, w WHERE ym = w.complete
GROUP BY 1, 2 ORDER BY receipts DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Register refund-rate anomalies vs the same-store median (2024+, min 2000 docs) — registers to audit.',
        widget: { kind: 'table', title: 'קופות לביקורת — החזרים חריגים', columns: [{key: 'branch', label: 'סניף'}, {key: 'register_no', label: 'קופה'}, {key: 'refund_rate_pct', label: 'שיעור החזרים', format: '%'}, {key: 'store_median_refund_pct', label: 'חציון הסניף', format: '%'}, {key: 'refund_vs_median_x', label: 'פי כמה מהחציון'}, {key: 'docs', label: 'מסמכים', format: 'int'}] },
        sql: `WITH reg AS (
  SELECT branch_id, branch, register_no, sum(docs) AS docs,
    100.0*sum(refund_docs)/sum(docs) AS refund_rate
  FROM full_data
  GROUP BY 1, 2, 3 HAVING sum(docs) >= 2000),
m AS (
  SELECT *, median(refund_rate) OVER (PARTITION BY branch_id) AS store_median_refund
  FROM reg)
SELECT branch, register_no, docs,
  round(refund_rate, 2) AS refund_rate_pct,
  round(store_median_refund, 2) AS store_median_refund_pct,
  round(refund_rate/nullif(store_median_refund, 0), 1) AS refund_vs_median_x
FROM m
WHERE refund_rate > 1.5*store_median_refund
ORDER BY refund_rate - store_median_refund DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Register × month workload since 2024: receipts, net, refund docs.',
        grain: 'one row per (branch, register, month) (~4K rows)',
        columns: 'branch_id: StoreC, branch, register_no, ym, docs, receipts, receipts_net, net, refund_docs, active_days',
        viewSql: `SELECT h.StoreC AS branch_id, trim(s.Nm) AS branch, h.KupaNo AS register_no,
  strftime(date_trunc('month', h.DateDoc), '%Y-%m') AS ym,
  count(*) AS docs,
  count(*) FILTER (WHERE h.Scm > 0) AS receipts,
  round(sum(h.Scm - h.ScmMaam), 1) AS net,
  round(sum(h.Scm - h.ScmMaam) FILTER (WHERE h.Scm > 0), 1) AS receipts_net,
  count(*) FILTER (WHERE h.Scm < 0 OR h.DocType = 654) AS refund_docs,
  count(DISTINCT h.DateDoc::DATE) AS active_days
FROM ${H} h JOIN ${STORE} s ON s.C = h.StoreC
WHERE h.DateDoc >= DATE '2024-01-01'
GROUP BY 1, 2, 3, 4`
      })
    }),
    section({
      id: 'cashier-anomalies',
      title: 'חריגות קופאים',
      goal: 'Cashiers whose refund rate or discount depth stands out vs their SAME-STORE peer median (min 500 docs) — statistical audit flags, not accusations.',
      caveats: 'OvedC הוא מזהה אטום (אין טבלת עובדים); מזהים 2 ו-3 הם חשבונות מערכת/קופה-עצמית עם מאות אלפי קבלות — מסומנים ואינם "עובדים מובילים". דגל = החזרים >×2 או עומק הנחה >×1.5 מחציון הסניף.',
      executiveSummary: querySlot({
        goal: 'Top 8 flagged cashiers by refund-rate excess vs same-store median.',
        widget: { kind: 'table', title: 'קופאים מסומנים — החזרים', columns: [{key: 'branch', label: 'סניף'}, {key: 'cashier_id', label: 'מזהה קופאי'}, {key: 'refund_rate_pct', label: 'שיעור החזרים', format: '%'}, {key: 'store_median_pct', label: 'חציון הסניף', format: '%'}, {key: 'refund_vs_median_x', label: 'פי כמה'}, {key: 'id_kind', label: 'סוג מזהה'}] },
        sql: `WITH m AS (
  SELECT *, median(refund_rate_raw) OVER (PARTITION BY branch_id) AS med_refund
  FROM full_data WHERE n_docs >= 500)
SELECT branch, cashier_id, n_docs,
  round(refund_rate_raw, 2) AS refund_rate_pct,
  round(med_refund, 2) AS store_median_pct,
  round(refund_rate_raw/nullif(med_refund, 0), 1) AS refund_vs_median_x,
  id_kind
FROM m
WHERE refund_rate_raw > 2*med_refund
ORDER BY refund_rate_raw - med_refund DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 flagged cashiers: refund-rate OR discount-depth outliers vs same-store peers (Q47 form).',
        widget: { kind: 'table', title: 'חריגי החזרים והנחות', columns: [{key: 'branch', label: 'סניף'}, {key: 'cashier_id', label: 'מזהה קופאי'}, {key: 'refund_rate_pct', label: 'החזרים', format: '%'}, {key: 'store_med_refund_pct', label: 'חציון החזרים', format: '%'}, {key: 'disc_depth_pct', label: 'עומק הנחה', format: '%'}, {key: 'store_med_disc_pct', label: 'חציון הנחה', format: '%'}, {key: 'id_kind', label: 'סוג'}] },
        sql: `WITH m AS (
  SELECT *, median(refund_rate_raw) OVER (PARTITION BY branch_id) AS med_refund,
    median(disc_depth_raw) OVER (PARTITION BY branch_id) AS med_disc
  FROM full_data WHERE n_docs >= 500)
SELECT branch, cashier_id, n_docs,
  round(refund_rate_raw, 2) AS refund_rate_pct, round(med_refund, 2) AS store_med_refund_pct,
  round(disc_depth_raw, 1) AS disc_depth_pct, round(med_disc, 1) AS store_med_disc_pct,
  id_kind
FROM m
WHERE refund_rate_raw > 2*med_refund OR disc_depth_raw > 1.5*med_disc
ORDER BY refund_rate_raw - med_refund DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'All material cashiers (>=500 docs) with sales productivity and both audit metrics — the complete per-cashier profile (Q49 view included).',
        widget: { kind: 'table', title: 'פרופיל קופאים מלא', columns: [{key: 'branch', label: 'סניף'}, {key: 'cashier_id', label: 'מזהה'}, {key: 'id_kind', label: 'סוג'}, {key: 'receipts', label: 'קבלות', format: 'int'}, {key: 'net_M', label: 'נטו (מ׳ ₪)'}, {key: 'refund_rate_pct', label: 'החזרים', format: '%'}, {key: 'disc_depth_pct', label: 'עומק הנחה', format: '%'}] },
        sql: `WITH m AS (
  SELECT *, median(refund_rate_raw) OVER (PARTITION BY branch_id) AS med_refund,
    median(disc_depth_raw) OVER (PARTITION BY branch_id) AS med_disc
  FROM full_data WHERE n_docs >= 500)
SELECT branch, cashier_id, id_kind,
  receipts, round(net/1e6, 2) AS net_M,
  round(net/nullif(receipts, 0), 1) AS net_per_receipt,
  round(refund_rate_raw, 2) AS refund_rate_pct, round(med_refund, 2) AS store_med_refund_pct,
  round(disc_depth_raw, 1) AS disc_depth_pct, round(med_disc, 1) AS store_med_disc_pct
FROM m
ORDER BY net DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Per (branch, cashier-id) audit metrics 2024+: volume, revenue, refund rate, discount depth, and same-store medians.',
        grain: 'one row per (branch, cashier id) with >=100 docs (~1K rows)',
        columns: 'branch_id: StoreC, branch, cashier_id, id_kind: person/system_account, n_docs, receipts, net, refund_rate_raw, disc_depth_raw, refund_rate_pct, disc_depth_pct, store_med_refund_pct, store_med_disc_pct',
        viewSql: `WITH doc AS (
  SELECT StoreC, OvedC, count(*) AS n_docs,
    count(*) FILTER (WHERE Scm > 0) AS receipts,
    sum(Scm - ScmMaam) AS net,
    100.0*count(*) FILTER (WHERE Scm < 0 OR DocType = 654)/count(*) AS refund_rate
  FROM ${H} WHERE DateDoc >= DATE '2024-01-01' AND OvedC IS NOT NULL
  GROUP BY 1, 2),
disc AS (
  SELECT h.StoreC, h.OvedC, avg(l.AczDisLine) AS disc_depth
  FROM ${L} l JOIN ${H} h ON h.C = l.KupaDocC
  WHERE h.DateDoc >= DATE '2024-01-01' AND h.OvedC IS NOT NULL AND l.AczDisLine BETWEEN 0.01 AND 100
  GROUP BY 1, 2),
m AS (
  SELECT d.*, disc.disc_depth,
    median(d.refund_rate) OVER (PARTITION BY d.StoreC) AS med_refund,
    median(disc.disc_depth) OVER (PARTITION BY d.StoreC) AS med_disc
  FROM doc d LEFT JOIN disc ON disc.StoreC = d.StoreC AND disc.OvedC = d.OvedC
  WHERE d.n_docs >= 100)
SELECT m.StoreC AS branch_id, trim(s.Nm) AS branch, m.OvedC AS cashier_id,
  CASE WHEN m.OvedC IN (2, 3) THEN 'system_account' ELSE 'person' END AS id_kind,
  m.n_docs, m.receipts, round(m.net, 1) AS net,
  m.refund_rate AS refund_rate_raw, m.disc_depth AS disc_depth_raw,
  round(m.refund_rate, 3) AS refund_rate_pct,
  round(m.disc_depth, 2) AS disc_depth_pct,
  round(m.med_refund, 3) AS store_med_refund_pct,
  round(m.med_disc, 2) AS store_med_disc_pct
FROM m JOIN ${STORE} s ON s.C = m.StoreC`
      })
    }),
    section({
      id: 'vat-exposure',
      title: 'חשיפת מע"מ',
      goal: 'VAT collected over time, the effective rate on taxable revenue (validating the 17%->18% transition), and the legally VAT-exempt share.',
      caveats: 'השיעור האפקטיבי המשוקלל נמוך מהסטטוטורי כי מחלקות פטורות (SwNoMaam=1, בעיקר פירות וירקות ~20% מהנטו) — נכון, לא באג. שיעור סטטוטורי עלה 17%→18% ב-2025-01-01.',
      executiveSummary: querySlot({
        goal: 'VAT by year: collected, effective rate on taxable net, exempt share.',
        widget: { kind: 'bar', title: 'מע"מ שנגבה לפי שנה (מ׳ ₪)', name: 'yr', value: 'vat_collected_M' },
        sql: `SELECT left(ym,4)::INT AS yr,
  round(sum(net)/1e6, 1) AS net_M,
  round(sum(vat_collected)/1e6, 2) AS vat_collected_M,
  round(100.0*sum(vat_collected)/nullif(sum(taxable_net), 0), 2) AS vat_pct_on_taxable,
  round(100.0*sum(exempt_net)/sum(net), 1) AS exempt_share_pct
FROM full_data
GROUP BY 1 ORDER BY 1 LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Monthly VAT trail (last 25 months): collected, effective rate on taxable, exempt share — the transition audit.',
        widget: { kind: 'line', title: 'שיעור מע"מ אפקטיבי ונתח פטור', valueFormat: '%', x: 'ym', ys: [{col: 'vat_pct_on_taxable', label: 'שיעור על חייב'}, {col: 'exempt_share_pct', label: 'נתח פטור'}] },
        sql: `SELECT ym,
  round(sum(net)/1e6, 2) AS net_M,
  round(sum(vat_collected)/1e6, 2) AS vat_collected_M,
  round(100.0*sum(vat_collected)/nullif(sum(taxable_net), 0), 2) AS vat_pct_on_taxable,
  round(100.0*sum(exempt_net)/sum(net), 1) AS exempt_share_pct
FROM full_data
GROUP BY 1 ORDER BY ym DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Per-branch VAT check over the last 12 complete months: every branch should carry the statutory rate on its taxable portion; exempt-share differences are demographic.',
        widget: { kind: 'table', title: 'בדיקת מע"מ לפי סניף', columns: [{key: 'branch', label: 'סניף'}, {key: 'net_12m_M', label: 'נטו (מ׳ ₪)'}, {key: 'vat_collected_M', label: 'מע"מ (מ׳ ₪)'}, {key: 'vat_pct_on_taxable', label: 'שיעור על חייב', format: '%'}, {key: 'exempt_share_pct', label: 'נתח פטור', format: '%'}] },
        sql: `WITH w AS (SELECT max(ym) AS e FROM full_data)
SELECT branch,
  round(sum(net)/1e6, 2) AS net_12m_M,
  round(sum(vat_collected)/1e6, 2) AS vat_collected_M,
  round(100.0*sum(vat_collected)/nullif(sum(taxable_net), 0), 2) AS vat_pct_on_taxable,
  round(100.0*sum(exempt_net)/sum(net), 1) AS exempt_share_pct
FROM full_data, w
WHERE ym >= strftime(strptime(w.e, '%Y-%m') - INTERVAL 12 MONTH, '%Y-%m') AND ym < w.e
GROUP BY 1 ORDER BY net_12m_M DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Branch × month VAT components since 2024.',
        grain: 'one row per (branch, month) (~350 rows)',
        columns: 'branch_id: StoreC, branch, ym, net, vat_collected, taxable_net, exempt_net, vat_pct_on_taxable',
        viewSql: `WITH pe AS (
  SELECT p.C AS prt, CASE WHEN dp.SwNoMaam = 1 THEN 1 ELSE 0 END AS is_exempt
  FROM ${PRT} p LEFT JOIN ${DEPT} dp ON dp.C = p.DepartmentC),
hd AS (
  SELECT C, StoreC, strftime(DateDoc, '%Y-%m') AS ym FROM ${H} WHERE DateDoc >= DATE '2024-01-01'),
agg AS (
  SELECT h.StoreC AS branch_id, h.ym,
    sum(l.Scm - l.VatAmount) AS net,
    sum(l.VatAmount) AS vat_collected,
    sum(l.Scm - l.VatAmount) FILTER (WHERE pe.is_exempt = 0) AS taxable_net,
    sum(l.Scm - l.VatAmount) FILTER (WHERE pe.is_exempt = 1) AS exempt_net
  FROM ${L} l
  JOIN hd h ON l.KupaDocC = h.C
  JOIN pe ON pe.prt = l.PrtC
  GROUP BY 1, 2)
SELECT agg.branch_id, trim(s.Nm) AS branch, agg.ym,
  round(agg.net, 1) AS net,
  round(agg.vat_collected, 1) AS vat_collected,
  round(agg.taxable_net, 1) AS taxable_net,
  round(agg.exempt_net, 1) AS exempt_net,
  round(100.0*agg.vat_collected/nullif(agg.taxable_net, 0), 2) AS vat_pct_on_taxable
FROM agg JOIN ${STORE} s ON s.C = agg.branch_id`
      })
    }),
    section({
      id: 'ledger-reconciliation',
      title: 'התאמת ספרים (ראשי מול Lk)',
      goal: 'Monthly side-by-side of the Lk (Wolt/named-invoice) book vs main-ledger DocType 670 in the overlap era — reconciled means 95-105%; NEVER add the two books.',
      caveats: 'מ-2026-02-16 (תחילת DocType) אותן הזמנות וולט רשומות בשני הספרים — חיבורם = ספירה כפולה; דווח מהספר הראשי, השתמש ב-Lk רק להיסטוריה שלפני התאריך הזה או לביטולי סטורנו. פער 2-6% בחודש מלא = פיגור קליטה בין מערכות; חודש חלקי יראה יחס מעוות.',
      executiveSummary: querySlot({
        goal: 'Latest complete months of the overlap era: Lk gross vs main-670 gross and the match %.',
        widget: { kind: 'groupedBar', title: 'ספר Lk מול ראשי 670 (₪)', valueFormat: '₪', category: 'ym', sortBy: 'ym', ys: [{col: 'lk_gross', label: 'ספר Lk'}, {col: 'main670_gross', label: 'ראשי 670'}] },
        sql: `WITH dt AS (SELECT min(DateDoc) AS os FROM ${H} WHERE DocType IS NOT NULL),
lk AS (
  SELECT strftime(Date, '%Y-%m') AS ym, sum(Scm) AS lk_gross, count(*) AS lk_docs
  FROM ${LKH} WHERE Date >= (SELECT os FROM dt) GROUP BY 1),
m670 AS (
  SELECT strftime(DateDoc, '%Y-%m') AS ym, sum(Scm) AS main670_gross, count(*) AS main670_docs
  FROM ${H} WHERE DateDoc >= (SELECT os FROM dt) AND DocType = 670 GROUP BY 1)
SELECT lk.ym, round(lk.lk_gross) AS lk_gross, round(m670.main670_gross) AS main670_gross,
  round(100.0*lk.lk_gross/nullif(m670.main670_gross, 0), 1) AS lk_vs_670_pct,
  lk.lk_docs, m670.main670_docs
FROM lk JOIN m670 USING (ym)
ORDER BY lk.ym DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'The full two-ledger picture: overlap months matched, plus the pre-overlap years where the Lk book stands alone.',
        widget: { kind: 'table', title: 'שני הספרים — תמונה מלאה', columns: [{key: 'period', label: 'תקופה'}, {key: 'lk_gross', label: 'ספר Lk', format: '₪'}, {key: 'main670_gross', label: 'ראשי 670', format: '₪'}, {key: 'lk_vs_670_pct', label: 'התאמה', format: '%'}] },
        sql: `WITH dt AS (SELECT min(DateDoc) AS os FROM ${H} WHERE DocType IS NOT NULL),
lk AS (
  SELECT strftime(Date, '%Y-%m') AS period, sum(Scm) AS lk_gross
  FROM ${LKH} WHERE Date >= (SELECT os FROM dt) GROUP BY 1),
m670 AS (
  SELECT strftime(DateDoc, '%Y-%m') AS period, sum(Scm) AS main670_gross
  FROM ${H} WHERE DateDoc >= (SELECT os FROM dt) AND DocType = 670 GROUP BY 1),
overlap AS (
  SELECT lk.period, round(lk.lk_gross) AS lk_gross, round(m670.main670_gross) AS main670_gross,
    round(100.0*lk.lk_gross/nullif(m670.main670_gross, 0), 1) AS lk_vs_670_pct
  FROM lk JOIN m670 USING (period)),
pre AS (
  SELECT year(Date)::VARCHAR AS period, round(sum(Scm)) AS lk_gross, NULL::DOUBLE AS main670_gross, NULL::DOUBLE AS lk_vs_670_pct
  FROM ${LKH} WHERE Date < (SELECT os FROM dt) GROUP BY 1)
SELECT * FROM overlap
UNION ALL
SELECT * FROM pre
ORDER BY period LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Overlap-era reconciliation by month × branch — localize any mismatch to a store.',
        widget: { kind: 'table', title: 'התאמת ספרים לפי סניף וחודש', columns: [{key: 'ym', label: 'חודש'}, {key: 'branch', label: 'סניף'}, {key: 'lk_gross', label: 'ספר Lk', format: '₪'}, {key: 'main670_gross', label: 'ראשי 670', format: '₪'}, {key: 'lk_vs_670_pct', label: 'התאמה', format: '%'}] },
        sql: `WITH dt AS (SELECT min(DateDoc) AS os FROM ${H} WHERE DocType IS NOT NULL),
lk AS (
  SELECT strftime(Date, '%Y-%m') AS ym, StoreC, sum(Scm) AS lk_gross, count(*) AS lk_docs
  FROM ${LKH} WHERE Date >= (SELECT os FROM dt) GROUP BY 1, 2),
m670 AS (
  SELECT strftime(DateDoc, '%Y-%m') AS ym, StoreC, sum(Scm) AS main670_gross, count(*) AS main670_docs
  FROM ${H} WHERE DateDoc >= (SELECT os FROM dt) AND DocType = 670 GROUP BY 1, 2)
SELECT coalesce(lk.ym, m670.ym) AS ym, trim(s.Nm) AS branch,
  round(coalesce(lk.lk_gross, 0)) AS lk_gross,
  round(coalesce(m670.main670_gross, 0)) AS main670_gross,
  round(100.0*lk.lk_gross/nullif(m670.main670_gross, 0), 1) AS lk_vs_670_pct,
  coalesce(lk.lk_docs, 0) AS lk_docs, coalesce(m670.main670_docs, 0) AS main670_docs
FROM lk FULL OUTER JOIN m670 ON m670.ym = lk.ym AND m670.StoreC = lk.StoreC
LEFT JOIN ${STORE} s ON s.C = coalesce(lk.StoreC, m670.StoreC)
ORDER BY ym DESC, lk_gross DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Month × branch, both ledgers side by side over the full Lk history — overlap months carry both sides, pre-overlap months only Lk.',
        grain: 'one row per (month, branch) with activity in either ledger (~250 rows)',
        columns: 'ym, branch_id: StoreC, branch, lk_gross, lk_docs, main670_gross (NULL pre-overlap), main670_docs, lk_storno_docs: cancellations in the Lk book',
        viewSql: `WITH lk AS (
  SELECT strftime(Date, '%Y-%m') AS ym, StoreC, sum(Scm) AS lk_gross, count(*) AS lk_docs,
    count(*) FILTER (WHERE StornoDocC > 0) AS lk_storno_docs
  FROM ${LKH} GROUP BY 1, 2),
m670 AS (
  SELECT strftime(DateDoc, '%Y-%m') AS ym, StoreC, sum(Scm) AS main670_gross, count(*) AS main670_docs
  FROM ${H} WHERE DocType = 670 GROUP BY 1, 2)
SELECT coalesce(lk.ym, m670.ym) AS ym, coalesce(lk.StoreC, m670.StoreC) AS branch_id, trim(s.Nm) AS branch,
  round(coalesce(lk.lk_gross, 0), 1) AS lk_gross,
  coalesce(lk.lk_docs, 0) AS lk_docs,
  round(m670.main670_gross, 1) AS main670_gross,
  m670.main670_docs,
  coalesce(lk.lk_storno_docs, 0) AS lk_storno_docs
FROM lk FULL OUTER JOIN m670 ON m670.ym = lk.ym AND m670.StoreC = lk.StoreC
LEFT JOIN ${STORE} s ON s.C = coalesce(lk.StoreC, m670.StoreC)`
      })
    }),
    section({
      id: 'doc-anomalies',
      title: 'חריגות מסמכים',
      goal: 'Document-type mix since DocType exists, void (654) volumes, and +/- correction pairs (a negative doc matching a positive doc, same store, day and amount).',
      caveats: 'ניתוח סוגי מסמך אפשרי רק מאז 2026-02-16. זוג תיקון = מסמך שלילי עם מסמך חיובי זהה בסכום באותו יום וסניף — היוריסטיקה; התאמות מקריות אפשריות בסכומים נפוצים. סטורנו נספר בספר Lk.',
      executiveSummary: querySlot({
        goal: 'Doc-type mix since DocType exists, plus the Lk storno count — one row per kind.',
        widget: { kind: 'bar', title: 'תמהיל סוגי מסמכים', valueFormat: 'int', name: 'doc_kind', value: 'docs' },
        sql: `WITH dt AS (SELECT min(DateDoc) AS os FROM ${H} WHERE DocType IS NOT NULL)
SELECT 'main_' || coalesce(DocType::VARCHAR, 'null') AS doc_kind, count(*) AS docs,
  round(sum(Scm)/1e6, 2) AS gross_M,
  count(*) FILTER (WHERE Scm < 0) AS negative_docs
FROM ${H} WHERE DateDoc >= (SELECT os FROM dt)
GROUP BY 1
UNION ALL
SELECT 'lk_storno', count(*), round(sum(Scm)/1e6, 2), count(*) FILTER (WHERE Scm < 0)
FROM ${LKH} WHERE StornoDocC > 0
ORDER BY docs DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Month × doc-type counts since DocType exists: receipts, named invoices, voids, manual charges, and the void rate.',
        widget: { kind: 'line', title: 'שיעור ביטולים חודשי', valueFormat: '%', x: 'ym', ys: [{col: 'void_per_receipt_pct', label: 'ביטולים מקבלות'}] },
        sql: `SELECT strftime(d, '%Y-%m') AS ym,
  sum(docs) FILTER (WHERE doc_type = 652) AS receipts_652,
  sum(docs) FILTER (WHERE doc_type = 670) AS named_invoices_670,
  sum(docs) FILTER (WHERE doc_type = 654) AS voids_654,
  sum(docs) FILTER (WHERE doc_type = 650) AS manual_650,
  round(100.0*sum(docs) FILTER (WHERE doc_type = 654)/nullif(sum(docs) FILTER (WHERE doc_type = 652), 0), 2) AS void_per_receipt_pct
FROM full_data
GROUP BY 1 ORDER BY ym LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Correction pairs in the latest complete month: negative docs matched to a same-day same-store positive doc of the exact opposite amount.',
        widget: { kind: 'table', title: 'זוגות תיקון — חודש אחרון', columns: [{key: 'branch', label: 'סניף'}, {key: 'doc_date', label: 'תאריך'}, {key: 'neg_amount', label: 'סכום שלילי', format: '₪'}, {key: 'matching_pos_docs', label: 'מסמכים חיוביים תואמים', format: 'int'}] },
        sql: `WITH docs AS (
  SELECT h.C, h.StoreC, h.CustomerC, h.DateDoc::DATE AS d, h.Scm
  FROM ${H} h
  WHERE h.DateDoc >= ${M_START} AND h.DateDoc < ${M_END}),
pairs AS (
  SELECT n.StoreC, n.d, n.Scm AS neg_amount, count(*) AS matching_pos_docs
  FROM docs n JOIN docs p ON p.StoreC = n.StoreC AND p.d = n.d AND p.Scm = -n.Scm
  WHERE n.Scm < 0 AND p.Scm > 0
  GROUP BY 1, 2, 3)
SELECT trim(s.Nm) AS branch, pr.d AS doc_date, round(pr.neg_amount, 2) AS neg_amount,
  pr.matching_pos_docs
FROM pairs pr JOIN ${STORE} s ON s.C = pr.StoreC
ORDER BY pr.neg_amount ASC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Day × branch × doc-type counts for the whole DocType era — the base for any void/anomaly time series.',
        grain: 'one row per (day, branch, doc type) since DocType exists (~6K rows)',
        columns: 'd, branch_id: StoreC, branch, doc_type, docs, gross, negative_docs',
        viewSql: `WITH dt AS (SELECT min(DateDoc) AS os FROM ${H} WHERE DocType IS NOT NULL)
SELECT h.DateDoc::DATE AS d, h.StoreC AS branch_id, trim(s.Nm) AS branch, h.DocType AS doc_type,
  count(*) AS docs, round(sum(h.Scm), 1) AS gross,
  count(*) FILTER (WHERE h.Scm < 0) AS negative_docs
FROM ${H} h JOIN ${STORE} s ON s.C = h.StoreC
WHERE h.DateDoc >= (SELECT os FROM dt)
GROUP BY 1, 2, 3, 4`
      })
    })
  ]
}) })

// --- promo-recommendations: the promotion RECOMMENDATION engine (expert framework: judge by incremental profit vs
// break-even lift, never by sales lift; required_lift = reg_margin/promo_margin - 1; smallest depth that clears) ---

const DEPOSIT_RE = `שקית|פקדון|פיקדון|מארז|משטח|מיכל|בקבוק ריק|ארגז`
const PERISH_RE = `פירות|ירקות|חלב|ביצים|דגים|בשר|עוף|מעדנ|טרי|לחם|מקורר`
const TOBACCO_FILTER = `NOT regexp_matches(dp.Nm, 'טבק|עישון')`   // promoting tobacco is prohibited in Israel — excluded from every recommendation engine
const ICOST = `icost AS (SELECT ItemID, arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE FinalRegularCostPrice > 0) AS unit_cost FROM ${DPC} GROUP BY 1)`
// engine A: item×store clearance candidates — stock too high (cover>45d), sale too low and decelerating (30d rate < 90d rate).
// rec_depth = smallest useful tier by cover, capped by margin floor (keep 5% margin) AND by breakeven<=200% (depth <= margin*2/3)
const CLEARANCE_BASE = `${COST_CTE},
r AS (
  SELECT l.PrtC AS prt, h.StoreC AS store_c, sum(l.Cmt)/90.0 AS rate,
    sum(l.Cmt) FILTER (WHERE h.DateDoc::DATE > ${SNAP} - 30)/30.0 AS rate30,
    sum(${NET})/nullif(sum(l.Cmt), 0) AS price_net, max(h.DateDoc)::DATE AS last_sale_d
  FROM ${SALES}
  WHERE h.DateDoc::DATE > ${SNAP} - 90 AND l.Cmt > 0 AND l.Scm > 0
  GROUP BY 1, 2 HAVING sum(l.Cmt) > 0),
cand AS (
  SELECT i.Prt AS prt, trim(p.Nm) AS item, i.Store AS branch_id, trim(s.Nm) AS branch, trim(dp.Nm) AS dept,
    i.Itra AS stock_qty, r.rate AS daily_rate, r.rate30, i.Itra/r.rate AS days_cover,
    i.Itra*c.unit_cost AS tied_cash_ils, r.last_sale_d,
    100*(1 - c.unit_cost/nullif(r.price_net, 0)) AS margin_pct,
    regexp_matches(dp.Nm, '${PERISH_RE}') AS perishable,
    (p.DepartmentC IN (11, 12) OR i.Itra <> floor(i.Itra)) AS weighed_suspect,
    c.unit_cost, r.price_net,
    round(LEAST(CASE WHEN i.Itra/r.rate > 180 THEN 35 WHEN i.Itra/r.rate > 90 THEN 25 ELSE 15 END,
      GREATEST(100*(1 - c.unit_cost/nullif(r.price_net, 0)) - 5, 0),
      GREATEST(100*(1 - c.unit_cost/nullif(r.price_net, 0))*2.0/3, 0))) AS rec_depth_pct
  FROM ${ITR} i
  JOIN r ON r.prt = i.Prt AND r.store_c = i.Store
  JOIN ${PRT} p ON p.C = i.Prt AND p.ArchiveDate IS NULL
  JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0
  JOIN ${DEPT} dp ON dp.C = p.DepartmentC AND dp.C NOT IN (164, 204) AND ${TOBACCO_FILTER}
  JOIN cost c ON c.ItemID = i.Prt AND c.StoreID = i.Store
  WHERE i.DateDoc = ${SNAP} AND i.Itra > 0 AND i.Itra/r.rate > 45 AND r.rate30 < r.rate
    AND NOT regexp_matches(p.Nm, '${DEPOSIT_RE}'))`
const REC_MECHANIC = `CASE WHEN weighed_suspect THEN 'recount_first_stock_suspect'
  WHEN rec_depth_pct < 5 THEN 'no_margin_room_review_cost_or_return'
  WHEN dept LIKE '%אלכוהול%' THEN 'legal_check_alcohol_promo_restricted'
  WHEN perishable THEN 'markdown_now_sell_through' ELSE 'price_promo_or_multibuy' END`
const BREAKEVEN_AT_REC = `round(100*((price_net - unit_cost)/nullif(price_net*(1 - rec_depth_pct/100.0) - unit_cost, 0) - 1))`
// engines B+C: per-item promo economics since 2025 (cost era) — own-history baseline (non-promo months), achieved vs
// required (break-even) lift at the realized depth, realized promo margin, and the post-promo (pull-forward) gap
const PROMO_ECON = `${ICOST},
m AS (
  SELECT l.PrtC AS prt, date_trunc('month', h.DateDoc) AS ym,
    sum(l.Cmt) FILTER (WHERE l.Cmt > 0) AS qty, count(DISTINCT h.DateDoc::DATE) AS days_sold,
    max(CASE WHEN l.MivzaNo > 0 THEN 1 ELSE 0 END) AS had_promo,
    sum(${NET}) FILTER (WHERE l.MivzaNo > 0) AS promo_net,
    sum(${NET}) FILTER (WHERE l.MivzaNo > 0 AND l.Cmt > 0)/nullif(sum(l.Cmt) FILTER (WHERE l.MivzaNo > 0 AND l.Cmt > 0), 0) AS promo_unit_net,
    sum(${NET}) FILTER (WHERE ${FULL_PRICE} AND l.Cmt > 0)/nullif(sum(l.Cmt) FILTER (WHERE ${FULL_PRICE} AND l.Cmt > 0), 0) AS fp_unit_net
  FROM ${L} l JOIN ${H} h ON l.KupaDocC = h.C AND h.DateDoc >= DATE '2025-01-01'
  GROUP BY 1, 2),
flagged AS (SELECT *, lag(had_promo) OVER (PARTITION BY prt ORDER BY ym) AS prev_promo FROM m),
econ AS (
  SELECT f.prt, trim(p.Nm) AS item, trim(dp.Nm) AS dept, c.unit_cost,
    count(*) FILTER (WHERE had_promo = 0) AS base_months, count(*) FILTER (WHERE had_promo = 1) AS promo_months,
    avg(qty/nullif(days_sold, 0)) FILTER (WHERE had_promo = 0) AS base_rate,
    avg(qty/nullif(days_sold, 0)) FILTER (WHERE had_promo = 1) AS promo_rate,
    avg(qty/nullif(days_sold, 0)) FILTER (WHERE had_promo = 0 AND coalesce(prev_promo, 0) = 0) AS clean_base_rate,
    avg(qty/nullif(days_sold, 0)) FILTER (WHERE had_promo = 0 AND prev_promo = 1) AS post_promo_rate,
    avg(fp_unit_net) AS fp_price, avg(promo_unit_net) FILTER (WHERE had_promo = 1) AS promo_price,
    sum(promo_net) AS promo_net
  FROM flagged f
  JOIN icost c ON c.ItemID = f.prt
  JOIN ${PRT} p ON p.C = f.prt JOIN ${DEPT} dp ON dp.C = p.DepartmentC AND dp.C NOT IN (164, 204) AND ${TOBACCO_FILTER}
  GROUP BY 1, 2, 3, 4),
verdicts AS (
  SELECT *, 100.0*(promo_rate/base_rate - 1) AS achieved_lift_pct,
    100.0*((fp_price - unit_cost)/nullif(promo_price - unit_cost, 0) - 1) AS required_lift_pct,
    100.0*(1 - promo_price/nullif(fp_price, 0)) AS realized_depth_pct,
    100.0*(post_promo_rate - clean_base_rate)/nullif(clean_base_rate, 0) AS post_promo_gap_pct,
    CASE WHEN promo_price <= unit_cost THEN 'below_cost_stop'
      WHEN promo_rate/base_rate - 1 >= (fp_price - unit_cost)/nullif(promo_price - unit_cost, 0) - 1 THEN 'repeat_winner'
      WHEN promo_rate/base_rate - 1 >= 0.5*((fp_price - unit_cost)/nullif(promo_price - unit_cost, 0) - 1) THEN 'shallower_depth'
      ELSE 'stop_or_redesign' END AS verdict
  FROM econ
  WHERE base_months >= 2 AND promo_months >= 1 AND base_rate > 0 AND fp_price > 0 AND promo_price IS NOT NULL)`
// engine D: store-gap targeting — velocity index = the item's share in the store vs its fair (chain) share; index<0.5 on
// a chain-proven item = local promo/display candidate ("shift exposure to stores with better ROI"), last 91 full days
const STORE_GAP = `sg AS (
  SELECT l.PrtC AS prt, h.StoreC AS store_c, sum(${NET}) AS net
  FROM ${SALES} WHERE h.DateDoc::DATE > ${LAST_FULL} - 91 GROUP BY 1, 2),
store_tot AS (SELECT store_c, sum(net) AS snet FROM sg GROUP BY 1),
item_tot AS (SELECT prt, sum(net) AS inet, count(*) AS nstores FROM sg GROUP BY 1),
chain AS (SELECT sum(net) AS cnet FROM sg),
gaps AS (
  SELECT sg.prt, trim(p.Nm) AS item, trim(dp.Nm) AS dept, sg.store_c AS branch_id, trim(s.Nm) AS branch,
    round(sg.net) AS net_91d, round((sg.net/t.snet)/(i.inet/c.cnet), 2) AS velocity_index,
    round(i.inet/c.cnet*t.snet - sg.net) AS net_opportunity_91d, i.nstores, round(i.inet) AS chain_net_91d
  FROM sg JOIN store_tot t ON t.store_c = sg.store_c JOIN item_tot i ON i.prt = sg.prt CROSS JOIN chain c
  JOIN ${PRT} p ON p.C = sg.prt JOIN ${DEPT} dp ON dp.C = p.DepartmentC AND dp.C NOT IN (164, 204) AND ${TOBACCO_FILTER}
  JOIN ${STORE} s ON s.C = sg.store_c AND s.SnifC > 0
  WHERE i.nstores >= 8 AND i.inet > 20000 AND NOT regexp_matches(p.Nm, '${DEPOSIT_RE}'))`
const promoRecCaveats = `שיפוט מבצע = רווח תוספתי מול נקודת איזון (required_lift = מרווח רגיל/מרווח מבצע - 1), לעולם לא לפי עליית מכירות בלבד. baseline = היסטוריית הפריט עצמו (חודשים ללא מבצע) — הרובד החלש בסולם המדידה: אין קבוצות ביקורת/holdout, עונתיות עלולה להתחזות ל-uplift. מימון ספקים מוכח ריק בנתונים (SupplierRefund/Reward=0) — "רווחיות מבצע" כאן היא לפני מימון, ומבצע שנראה מפסיד עשוי להיות ממומן. קניבליזציה נמדדת ברמת קבוצה בדוח promotions ואינה מנוכה כאן (מחקרית ~12-22% מה-uplift). עלות = האחרונה הידועה לפריט (היסטוריה מ-2025-01); מלאי = צילום יום אחד; ספירות פריטים שקילים לא אמינות (דגל reliability). חוקי: מוצרי טבק מוחרגים מכל מנועי ההמלצה (קידום טבק אסור בישראל); מבצעי מחיר על אלכוהול מוגבלים בחוק — מסומנים legal_check ואינם מובלים. ${dateCaveat}`

VerifiedReport('promo-recommendations', { impl: verifiedReport({
  title: 'המלצות מבצעים',
  description: 'מנוע המלצות מבצעים: חיסול עודפי מלאי בסניף (מלאי גבוה + מכירה איטית) עם עומק ומנגנון מומלצים, כלכלת עומק הנחה מול נקודת איזון, אילו מבצעים להריץ שוב ואילו לעצור, ופערי חנות לקידום מקומי.',
  whenToUse: 'שאלות "מה כדאי לקדם / איזה מבצע לעשות ואיפה" — פריט תקוע בסניף, עומק הנחה נכון לפריט, אילו מבצעים הוכיחו תוספתיות ואילו שורפים מרווח, ובאיזה סניף פריט חזק מקודד חלש. להמלצת מבצעים מלאה לסניף/מחלקה הרץ את שלושת הסעיפים יחד (sections: clearance-candidates, promo-portfolio, store-gaps ב-runReport אחד) וסנן ב-full_data לפי branch/dept — חיסול עודפים + מנצחים מוכחים להרצה חוזרת + פערי חנות. לניתוח מבצעים היסטורי תיאורי — promotions; לתמונת עודפים גולמית — inventory-health.',
  routePhrases: ['המלצות מבצעים', 'איזה מבצע לעשות', 'מה כדאי לקדם', 'מה לקדם', 'חיסול עודפים', 'עומק הנחה נכון', 'להריץ שוב', 'לעצור מבצע', 'פערי חנות', 'פריט תקוע'],
  caveats: promoRecCaveats,
  materialize: true,   // cache each section's fullData view once per run; slots below read FROM full_data
  executiveSummary: querySlot({
    goal: 'Portfolio headline: how many clearance candidates and how much cash they tie, what share of past promos beat their break-even lift, how much promo revenue sits on value-destroying promos, and the store-gap opportunity.',
    widget: { kind: 'kpi', title: 'המלצות מבצעים — מבט מהיר', items: [{label: 'מועמדים לחיסול (פריט×סניף)', col: 'clearance_candidates', format: 'int'}, {label: 'מזומן כבול במועמדים', col: 'clearance_tied_cash', format: '₪'}, {label: 'מבצעים שעברו נקודת איזון', col: 'promos_beating_breakeven_pct', format: '%'}, {label: 'מחזור מבצעים מתחת לנקודת איזון', col: 'underperforming_promo_net', format: '₪'}, {label: 'פוטנציאל פערי חנות (91 יום)', col: 'store_gap_opportunity', format: '₪'}] },
    sql: `WITH ${CLEARANCE_BASE},
${PROMO_ECON},
${STORE_GAP}
SELECT
  (SELECT count(*) FROM cand) AS clearance_candidates,
  (SELECT round(sum(tied_cash_ils)) FROM cand) AS clearance_tied_cash,
  (SELECT round(100.0*count(*) FILTER (WHERE verdict = 'repeat_winner')/count(*), 1) FROM verdicts) AS promos_beating_breakeven_pct,
  (SELECT round(sum(promo_net)) FROM verdicts WHERE verdict IN ('stop_or_redesign', 'below_cost_stop')) AS underperforming_promo_net,
  (SELECT round(sum(net_opportunity_91d)) FROM gaps WHERE velocity_index < 0.5) AS store_gap_opportunity
LIMIT 1`
  }),
  summary: querySlot({
    goal: 'The recommendation mix: per engine, how many recommendations and the value at stake — where the money is before drilling into a specific list.',
    widget: { kind: 'table', title: 'תמהיל ההמלצות — ערך על הכף', columns: [{key: 'engine', label: 'סוג המלצה'}, {key: 'recommendations', label: 'המלצות', format: 'int'}, {key: 'value_at_stake_ils', label: 'ערך על הכף', format: '₪'}, {key: 'action', label: 'פעולה'}] },
    sql: `WITH ${CLEARANCE_BASE},
${PROMO_ECON},
${STORE_GAP}
SELECT 3 AS sort_order, 'clearance' AS engine, count(*) AS recommendations, round(sum(tied_cash_ils)) AS value_at_stake_ils, 'הנחת חיסול/מבצע בסניף לשחרור מזומן' AS action FROM cand
UNION ALL SELECT 2, 'repeat_winners', count(*), round(sum(promo_net)), 'להריץ שוב — עברו נקודת איזון' FROM verdicts WHERE verdict = 'repeat_winner'
UNION ALL SELECT 1, 'stop_or_redesign', count(*), round(sum(promo_net)), 'לעצור/לעצב מחדש — מתחת לנקודת איזון' FROM verdicts WHERE verdict IN ('stop_or_redesign', 'below_cost_stop')
UNION ALL SELECT 4, 'shallower_depth', count(*), round(sum(promo_net)), 'להפחית עומק — קרוב לאיזון' FROM verdicts WHERE verdict = 'shallower_depth'
UNION ALL SELECT 5, 'store_gaps', count(*), round(sum(net_opportunity_91d)), 'קידום מקומי בסניף המפגר' FROM gaps WHERE velocity_index < 0.5
ORDER BY sort_order`
  }),
  sections: [
    section({
      id: 'clearance-candidates',
      title: 'חיסול עודפים בסניף',
      goal: 'Where stock is too high and sales too low per item×store — with a recommended mechanic (perishable→markdown-now, else price promo/multi-buy) and the SMALLEST useful depth: cover tier (45-90d→15%, 90-180d→25%, >180d→35%) capped so at least 5% margin remains AND the break-even lift stays <=200%.',
      caveats: 'מועמד = כיסוי מעל 45 יום וגם קצב 30 הימים האחרונים איטי מקצב 90 הימים (האטה). ספירות שקילים מנופחות ידועות — rec_mechanic יורד ל-recount_first כשהספירה חשודה; אל תמליץ הנחה על מלאי פנטום. עומק מומלץ הוא כלכלי (מרווח ונקודת איזון), לא מודל ביקוש: הוא הרצפה הבטוחה, לא הבטחת ניקוי.',
      executiveSummary: querySlot({
        goal: 'Top 8 clearance recommendations by tied cash.',
        widget: { kind: 'table', title: 'חיסול עודפים — ההמלצות הגדולות', columns: [{key: 'item', label: 'פריט'}, {key: 'branch', label: 'סניף'}, {key: 'days_cover', label: 'ימי כיסוי', format: 'int'}, {key: 'tied_cash_ils', label: 'מזומן כבול', format: '₪'}, {key: 'rec_depth_pct', label: 'עומק מומלץ', format: '%'}, {key: 'rec_mechanic', label: 'מנגנון'}] },
        sql: `SELECT item, branch, days_cover, tied_cash_ils, rec_depth_pct, rec_mechanic
FROM full_data ORDER BY tied_cash_ils DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Top 25 clearance recommendations with the margin math: current margin, recommended depth, and the break-even lift that depth requires.',
        widget: { kind: 'table', title: 'מועמדים לחיסול — עם מתמטיקת המרווח', columns: [{key: 'item', label: 'פריט'}, {key: 'branch', label: 'סניף'}, {key: 'dept', label: 'מחלקה'}, {key: 'days_cover', label: 'כיסוי', format: 'int'}, {key: 'tied_cash_ils', label: 'מזומן', format: '₪'}, {key: 'margin_pct', label: 'מרווח', format: '%'}, {key: 'rec_depth_pct', label: 'עומק', format: '%'}, {key: 'breakeven_lift_pct', label: 'lift נדרש', format: '%'}, {key: 'rec_mechanic', label: 'מנגנון'}] },
        sql: `SELECT item, branch, dept, days_cover, tied_cash_ils, margin_pct, rec_depth_pct, breakeven_lift_pct, rec_mechanic
FROM full_data ORDER BY tied_cash_ils DESC LIMIT 25`
      }),
      inDepth: querySlot({
        goal: 'Top 50 with the full decision context: velocity deceleration (30d vs 90d rate), aging (last sale), count reliability, perishability — everything a category manager needs to approve each markdown/promo.',
        widget: { kind: 'table', title: 'חיסול עודפים — הקשר מלא להחלטה', columns: [{key: 'item', label: 'פריט'}, {key: 'branch', label: 'סניף'}, {key: 'days_cover', label: 'כיסוי', format: 'int'}, {key: 'daily_rate', label: 'קצב 90 יום'}, {key: 'rate30', label: 'קצב 30 יום'}, {key: 'last_sale_d', label: 'מכירה אחרונה'}, {key: 'tied_cash_ils', label: 'מזומן', format: '₪'}, {key: 'rec_depth_pct', label: 'עומק', format: '%'}, {key: 'rec_mechanic', label: 'מנגנון'}] },
        sql: `SELECT item, branch, dept, days_cover, daily_rate, rate30, last_sale_d, tied_cash_ils, margin_pct, rec_depth_pct, breakeven_lift_pct, rec_mechanic, perishable, weighed_suspect
FROM full_data ORDER BY tied_cash_ils DESC LIMIT 50`
      }),
      fullData: fullData({
        description: 'Every clearance candidate (item×store with cover>45d and decelerating sales): stock, velocity, tied cash, margin, recommended depth/mechanic and reliability flags — the base for any store or department clearance program.',
        grain: 'one row per candidate (item × store) at the stock snapshot (~10K rows)',
        columns: 'prt, item, branch_id, branch, dept, stock_qty, daily_rate: 90d qty/day, rate30: 30d qty/day, days_cover, tied_cash_ils, last_sale_d, margin_pct, rec_depth_pct: smallest useful economic depth, rec_mechanic: markdown_now_sell_through/price_promo_or_multibuy/recount_first_stock_suspect/no_margin_room_review_cost_or_return, breakeven_lift_pct: volume multiple needed at rec depth, perishable, weighed_suspect',
        perItemOnly: 'stock_qty,daily_rate,rate30',
        viewSql: `WITH ${CLEARANCE_BASE}
SELECT prt, item, branch_id, branch, dept, round(stock_qty, 1) AS stock_qty, round(daily_rate, 2) AS daily_rate,
  round(rate30, 2) AS rate30, round(days_cover) AS days_cover, round(tied_cash_ils) AS tied_cash_ils,
  last_sale_d, round(margin_pct, 1) AS margin_pct, rec_depth_pct,
  ${REC_MECHANIC} AS rec_mechanic, ${BREAKEVEN_AT_REC} AS breakeven_lift_pct, perishable, weighed_suspect
FROM cand -- LIMIT below is a pushdown fence: outer filters on weighed_suspect (two-table OR) hit a duckdb INTERNAL bind error without it
LIMIT 100000000`
      })
    }),
    section({
      id: 'promo-portfolio',
      title: 'תיק המבצעים — להריץ שוב, להעמיק פחות או לעצור',
      goal: 'Every promoted item (2025+) judged by the expert rule: achieved lift (promo months vs own non-promo baseline) vs REQUIRED break-even lift (reg_margin/promo_margin - 1) at the realized depth. Verdicts: repeat_winner (achieved>=required), shallower_depth (>=half of required), stop_or_redesign, below_cost_stop. Includes the pull-forward check (post-promo month vs clean baseline). In any promo-recommendation answer, NAME the top repeat_winner items (with their proven depth and achieved-vs-required lift) as the "run again" list — they are the safest promos to schedule.',
      caveats: 'ההשוואה פר פריט מול עצמו (חודשי מבצע מול חודשי בסיס) — עונתיות עלולה להתחזות ל-uplift; דורש 2+ חודשי בסיס. מרווח מבצע לפני מימון ספקים (לא קיים בנתונים) — מותג ממומן עשוי להיות רווחי בפועל; ורדיקט stop הוא טריגר לבדיקת מימון, לא פסק דין. post_promo_gap שלילי עמוק = הקדמת קניות (pantry loading) שמוחקת חלק מהרווח.',
      executiveSummary: querySlot({
        goal: 'The portfolio verdict mix: counts and promo revenue per verdict — how much of the promo machine passes the break-even test.',
        widget: { kind: 'bar', title: 'מחזור מבצעים לפי ורדיקט', valueFormat: '₪', name: 'verdict', value: 'promo_net', highlight: {name: 'stop_or_redesign', note: 'מתחת לנקודת איזון'} },
        sql: `SELECT verdict, count(*) AS items, round(sum(promo_net)) AS promo_net,
  round(avg(realized_depth_pct), 1) AS avg_depth_pct
FROM full_data GROUP BY 1 ORDER BY promo_net DESC`
      }),
      summary: querySlot({
        goal: 'Top 20 repeat-winners by promo revenue: proven above-break-even promos to run again, with the depth that worked and the post-promo (pull-forward) gap.',
        widget: { kind: 'table', title: 'להריץ שוב — מבצעים שהוכיחו תוספתיות', columns: [{key: 'item', label: 'פריט'}, {key: 'dept', label: 'מחלקה'}, {key: 'realized_depth_pct', label: 'עומק שעבד', format: '%'}, {key: 'achieved_lift_pct', label: 'lift בפועל', format: '%'}, {key: 'required_lift_pct', label: 'lift נדרש', format: '%'}, {key: 'promo_net', label: 'מחזור מבצע', format: '₪'}, {key: 'post_promo_gap_pct', label: 'פער אחרי', format: '%'}] },
        sql: `SELECT item, dept, realized_depth_pct, achieved_lift_pct, required_lift_pct, promo_net, post_promo_gap_pct
FROM full_data WHERE verdict = 'repeat_winner' AND promo_months >= 2
ORDER BY promo_net DESC LIMIT 20`
      }),
      inDepth: querySlot({
        goal: 'The stop-list: the biggest value-destroying promos (below break-even or below cost) ranked by promo revenue at stake — each row is margin bleeding unless supplier funding covers it.',
        widget: { kind: 'table', title: 'לעצור או לעצב מחדש — שורפי מרווח', columns: [{key: 'item', label: 'פריט'}, {key: 'dept', label: 'מחלקה'}, {key: 'verdict', label: 'ורדיקט'}, {key: 'realized_depth_pct', label: 'עומק', format: '%'}, {key: 'achieved_lift_pct', label: 'lift בפועל', format: '%'}, {key: 'required_lift_pct', label: 'lift נדרש', format: '%'}, {key: 'promo_net', label: 'מחזור בסיכון', format: '₪'}] },
        sql: `SELECT item, dept, verdict, realized_depth_pct, achieved_lift_pct, required_lift_pct, promo_net, post_promo_gap_pct
FROM full_data WHERE verdict IN ('stop_or_redesign', 'below_cost_stop')
ORDER BY promo_net DESC LIMIT 40`
      }),
      fullData: fullData({
        description: 'Per-item promo economics 2025+: own-baseline vs promo velocity, realized depth, break-even math, pull-forward gap and the verdict — the base for any "should we promote X / at what depth" question. Depth guidance: required_lift explodes when promo margin approaches zero, so low-margin items can only take shallow (5-15%) defensive promos.',
        grain: 'one row per promoted item with 2+ baseline months (~13K rows)',
        columns: 'prt, item, dept, base_months, promo_months, base_rate: qty/day in non-promo months, promo_rate, achieved_lift_pct, required_lift_pct: break-even lift at the realized depth, realized_depth_pct, fp_price: full-price unit net, promo_price: promo unit net, unit_cost, promo_net: total promo revenue, post_promo_gap_pct: post-promo month vs clean baseline (negative = pull-forward), verdict: repeat_winner/shallower_depth/stop_or_redesign/below_cost_stop',
        perItemOnly: 'base_rate,promo_rate,fp_price,promo_price,unit_cost',
        viewSql: `WITH ${PROMO_ECON}
SELECT prt, item, dept, base_months, promo_months, round(base_rate, 2) AS base_rate, round(promo_rate, 2) AS promo_rate,
  round(achieved_lift_pct) AS achieved_lift_pct, round(required_lift_pct) AS required_lift_pct,
  round(realized_depth_pct, 1) AS realized_depth_pct, round(fp_price, 2) AS fp_price, round(promo_price, 2) AS promo_price,
  round(unit_cost, 2) AS unit_cost, round(promo_net) AS promo_net, round(post_promo_gap_pct) AS post_promo_gap_pct, verdict
FROM verdicts`
      })
    }),
    section({
      id: 'store-gaps',
      title: 'פערי חנות — קידום מקומי',
      goal: 'Chain-proven items underselling in a specific store: velocity_index = the item revenue share in the store vs its fair (chain) share; index<0.5 flags a local gap worth a store-targeted promo, display or availability check — shifting promo exposure to where the ROI is.',
      caveats: 'פוטנציאל = השלמה ל-fair share (חלק יחסי רשתי) על 91 יום — תקרה תיאורטית, לא תחזית: פער יכול לנבוע מדמוגרפיה שונה, חוסר זמינות/מדף או תמחור סניפי, לא רק מחוסר קידום. פריט נמדד רק אם נמכר ב-8+ סניפים ומעל ₪20K ברשת בתקופה.',
      executiveSummary: querySlot({
        goal: 'Top 8 store gaps by fair-share opportunity.',
        widget: { kind: 'table', title: 'פערי חנות — הפוטנציאל הגדול', columns: [{key: 'item', label: 'פריט'}, {key: 'branch', label: 'סניף'}, {key: 'velocity_index', label: 'אינדקס מהירות'}, {key: 'net_91d', label: 'בפועל 91 יום', format: '₪'}, {key: 'net_opportunity_91d', label: 'פוטנציאל', format: '₪'}] },
        sql: `SELECT item, branch, velocity_index, net_91d, net_opportunity_91d
FROM full_data WHERE velocity_index < 0.5 ORDER BY net_opportunity_91d DESC LIMIT 8`
      }),
      summary: querySlot({
        goal: 'Which branches carry the most gap opportunity — where a local promo program pays most.',
        widget: { kind: 'bar', title: 'פוטנציאל פערי חנות לפי סניף (₪, 91 יום)', valueFormat: '₪', name: 'branch', value: 'opportunity_ils', highlight: {max: true, note: 'הסניף עם הפער הגדול'} },
        sql: `SELECT branch, count(*) AS gap_items, round(sum(net_opportunity_91d)) AS opportunity_ils,
  round(avg(velocity_index), 2) AS avg_index
FROM full_data WHERE velocity_index < 0.5 GROUP BY 1 ORDER BY opportunity_ils DESC`
      }),
      inDepth: querySlot({
        goal: 'Top 40 item×store gaps with chain context (chain revenue, stores selling) — the store-targeted promo candidate list.',
        widget: { kind: 'table', title: 'רשימת מועמדים לקידום מקומי', columns: [{key: 'item', label: 'פריט'}, {key: 'branch', label: 'סניף'}, {key: 'dept', label: 'מחלקה'}, {key: 'velocity_index', label: 'אינדקס'}, {key: 'net_91d', label: 'בפועל', format: '₪'}, {key: 'net_opportunity_91d', label: 'פוטנציאל', format: '₪'}, {key: 'chain_net_91d', label: 'מחזור רשתי', format: '₪'}] },
        sql: `SELECT item, branch, dept, velocity_index, net_91d, net_opportunity_91d, chain_net_91d, nstores
FROM full_data WHERE velocity_index < 0.5 ORDER BY net_opportunity_91d DESC LIMIT 40`
      }),
      fullData: fullData({
        description: 'The full item×store velocity-index table (every measured item×store, not only gaps), for any local-assortment or store-mix analysis. net_opportunity_91d is meaningful when velocity_index<1.',
        grain: 'one row per (chain-proven item × branch) with sales in the last 91 full days (~25K rows)',
        columns: 'prt, item, dept, branch_id, branch, net_91d, velocity_index: store share vs fair chain share (1 = fair), net_opportunity_91d: fair-share completion, chain_net_91d, nstores: stores selling the item',
        viewSql: `WITH ${STORE_GAP}
SELECT prt, item, dept, branch_id, branch, net_91d, velocity_index, net_opportunity_91d, chain_net_91d, nstores
FROM gaps`
      })
    })
  ]
}) })
