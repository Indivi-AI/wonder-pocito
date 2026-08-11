export const T = n => `read_parquet('{{ROOT}}/${n}.parquet')`
export const H = T('KupaDoc_Header'), L = T('KupaDoc_Lines'), PRT = T('Prt'), STORE = T('Store'), DEPT = T('Departments')
export const DPC = T('DailyPriceCost'), ITR = T('Prt_ItrotStore_Yomi'), M = T('Mivza'), MP = T('Mivza_Prt'), PC = T('promotion_cycles')
export const NET = `(l.Scm - l.VatAmount)`
export const LAST_FULL = `(SELECT max(DateDoc)::DATE - 1 FROM ${H})`
export const SNAP = `(SELECT max(DateDoc) FROM ${ITR})`
export const COST = `cost AS (SELECT ItemID, StoreID, arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE FinalRegularCostPrice > 0) AS unit_cost FROM ${DPC} GROUP BY 1, 2)`
export const reactComp = (mode, title, extra = {}) => ({ cmpId: 'promotionReportPanel', area: mode == 'recommendations' ? 'המלץ על מבצעים' : 'נתח ביצועי מבצעים', mode, title, ...extra })
export const dateCaveat = 'תאריכים מעוגנים ליום האחרון המלא בנתונים; הכנסה = Scm - VatAmount; החזרים שליליים מתקזזים; עלות = FinalRegularCostPrice אחרון חיובי לפי פריט×סניף.'

export const PERF_VIEW = `WITH anchor AS (SELECT ${LAST_FULL} AS d),
${COST},
promo_items AS (
  SELECT mp.MivzaC AS mivza_c, mp.PrtC AS prt, trim(p.Nm) AS item, trim(dp.Nm) AS category
  FROM ${MP} mp JOIN ${PRT} p ON p.C = mp.PrtC LEFT JOIN ${DEPT} dp ON dp.C = p.DepartmentC),
promo_item_count AS (SELECT MivzaC AS mivza_c, count(DISTINCT PrtC) AS item_count FROM ${MP} GROUP BY 1),
promo_meta AS (
  SELECT pc.deal_id, pc.deal_name, pc.n_cycles, pc.is_recurring, m.C AS mivza_c, trim(m.Nm) AS promo_name,
    m.FromDate::DATE AS from_d, m.ToDate::DATE AS to_d, m.MivzaType AS mechanic_id, trim(m.MivzaTypeNm) AS mechanic, m.Cmt AS threshold_qty,
    m.Scm AS deal_price, m.K_AczDis AS planned_discount_pct, m.K_ScmDis AS planned_discount_ils, m.MinCmt AS min_qty, GREATEST(1, LEAST(90, date_diff('day', m.FromDate::DATE, m.ToDate::DATE) + 1)) AS duration_days,
    GREATEST(1, LEAST(GREATEST(1, LEAST(90, date_diff('day', m.FromDate::DATE, m.ToDate::DATE) + 1)), date_diff('day', m.FromDate::DATE, LEAST((SELECT d FROM anchor), m.ToDate::DATE)) + 1)) AS cmp_days,
    count(DISTINCT pi.prt) AS item_count, string_agg(DISTINCT left(pi.item, 70), ' | ') AS promo_items, string_agg(DISTINCT pi.category, ', ') AS categories
  FROM ${PC} pc JOIN ${M} m ON m.C = pc.mivza_c LEFT JOIN promo_items pi ON pi.mivza_c = m.C
  WHERE m.ToDate::DATE >= DATE '2024-01-01' AND m.FromDate::DATE <= (SELECT d FROM anchor) AND m.ToDate::DATE >= (SELECT d FROM anchor) - INTERVAL 180 DAY
  GROUP BY ALL),
line_fact AS (
  SELECT pm.mivza_c, l.PrtC AS prt, h.StoreC AS branch_id, h.DateDoc::DATE AS d, sum(l.Cmt) AS qty, sum(${NET}) AS net,
    sum(CASE WHEN c.unit_cost IS NOT NULL THEN c.unit_cost*l.Cmt ELSE 0 END) AS cogs, sum(l.MhrLine*l.Cmt) AS list_gross,
    sum(CASE WHEN l.AczDisLine >= 100 THEN abs(l.Cmt) ELSE 0 END) AS free_units
  FROM promo_meta pm JOIN ${L} l ON l.MivzaNo = pm.mivza_c JOIN ${H} h ON h.C = l.KupaDocC AND h.DateDoc >= DATE '2024-01-01'
  LEFT JOIN cost c ON c.ItemID = l.PrtC AND c.StoreID = h.StoreC
  GROUP BY 1, 2, 3, 4),
promo_roll AS (
  SELECT mivza_c, min(d) AS actual_from, max(d) AS actual_to, count(DISTINCT d) AS selling_days, count(DISTINCT prt) FILTER (WHERE qty > 0) AS sold_items,
    sum(qty) AS units_sold, sum(net) AS promo_net, sum(cogs) AS cogs, sum(list_gross) AS list_gross, sum(free_units) AS free_units
  FROM line_fact GROUP BY 1),
item_period_fact AS (
  SELECT pm.mivza_c, h.DateDoc::DATE AS d, CASE WHEN h.DateDoc::DATE < pm.from_d THEN 'baseline' ELSE 'current' END AS period,
    sum(l.Cmt) AS qty, sum(${NET}) AS net, sum(CASE WHEN c.unit_cost IS NOT NULL THEN c.unit_cost*l.Cmt ELSE 0 END) AS cogs,
    string_agg(DISTINCT regexp_replace(trim(m2.Nm), '[|~]', '/', 'g'), ' + ') FILTER (WHERE pc2.deal_id = pm.deal_id) AS same_deal_names
  FROM promo_meta pm JOIN promo_items pi ON pi.mivza_c = pm.mivza_c JOIN ${L} l ON l.PrtC = pi.prt
  JOIN ${H} h ON h.C = l.KupaDocC AND h.DateDoc::DATE >= pm.from_d - (CAST(pm.cmp_days AS INTEGER) * INTERVAL 1 DAY) AND h.DateDoc::DATE <= LEAST((SELECT d FROM anchor), pm.to_d)
  LEFT JOIN ${PC} pc2 ON pc2.mivza_c = l.MivzaNo LEFT JOIN ${M} m2 ON m2.C = l.MivzaNo LEFT JOIN cost c ON c.ItemID = l.PrtC AND c.StoreID = h.StoreC
  GROUP BY 1, 2, 3),
item_period_roll AS (
  SELECT mivza_c, sum(net) FILTER (WHERE period = 'current') AS current_item_net, sum(cogs) FILTER (WHERE period = 'current') AS current_item_cogs,
    sum(net) FILTER (WHERE period = 'baseline') AS baseline_item_net, sum(cogs) FILTER (WHERE period = 'baseline') AS baseline_item_cogs,
    string_agg(strftime(d, '%m-%d') || '~' || period || '~' || CAST(round(net) AS VARCHAR) || '~' || coalesce(same_deal_names, ''), '|' ORDER BY d) AS sales_timeline_chart
  FROM item_period_fact GROUP BY 1),
prev_identical_base AS (
  SELECT pm.mivza_c, m.C AS prev_mivza_c, trim(m.Nm) AS prev_name, m.FromDate::DATE AS prev_from, m.ToDate::DATE AS prev_to, pm.from_d, pm.cmp_days, count(DISTINCT cur.prt) AS matching_items
  FROM promo_meta pm JOIN ${PC} pc ON pc.deal_id = pm.deal_id JOIN ${M} m ON m.C = pc.mivza_c
  JOIN promo_items cur ON cur.mivza_c = pm.mivza_c JOIN ${MP} mp ON mp.MivzaC = m.C AND mp.PrtC = cur.prt
  JOIN promo_item_count prev_cnt ON prev_cnt.mivza_c = m.C
  WHERE m.C <> pm.mivza_c AND m.FromDate::DATE < pm.from_d AND m.MivzaType = pm.mechanic_id
    AND coalesce(m.Cmt, -999999) = coalesce(pm.threshold_qty, -999999) AND coalesce(m.Scm, -999999) = coalesce(pm.deal_price, -999999)
    AND coalesce(m.K_AczDis, -999999) = coalesce(pm.planned_discount_pct, -999999) AND coalesce(m.K_ScmDis, '') = coalesce(pm.planned_discount_ils, '')
    AND coalesce(m.MinCmt, -999999) = coalesce(pm.min_qty, -999999)
  GROUP BY ALL HAVING matching_items = max(pm.item_count) AND max(prev_cnt.item_count) = max(pm.item_count)),
prev_roll AS (
  SELECT p.mivza_c, p.prev_mivza_c, sum(l.Cmt) AS qty, sum(${NET}) AS net, sum(CASE WHEN c.unit_cost IS NOT NULL THEN c.unit_cost*l.Cmt ELSE 0 END) AS cogs, count(DISTINCT h.DateDoc::DATE) AS days
  FROM prev_identical_base p LEFT JOIN ${L} l ON l.MivzaNo = p.prev_mivza_c LEFT JOIN ${H} h ON h.C = l.KupaDocC AND h.DateDoc >= DATE '2024-01-01'
  LEFT JOIN cost c ON c.ItemID = l.PrtC AND c.StoreID = h.StoreC GROUP BY 1, 2),
prev_identical AS (
  SELECT p.mivza_c, count(*) FILTER (WHERE p.prev_to >= p.from_d - (CAST(p.cmp_days AS INTEGER) * INTERVAL 1 DAY)) AS previous_identical_count,
    string_agg(CAST(p.prev_mivza_c AS VARCHAR) || '~' || regexp_replace(p.prev_name, '[|~]', '/', 'g') || '~' || strftime(p.prev_from, '%d/%m/%Y') || ' - ' || strftime(p.prev_to, '%d/%m/%Y') || '~' || CAST(round(coalesce(r.net, 0)) AS VARCHAR) || '~' || CAST(round(coalesce(r.net, 0)/nullif(r.days, 0)) AS VARCHAR) || '~' || CAST(round(100*(coalesce(r.net, 0)-coalesce(r.cogs, 0))/nullif(r.net, 0), 1) AS VARCHAR), '|' ORDER BY p.prev_from DESC) AS previous_identical_promos
  FROM prev_identical_base p LEFT JOIN prev_roll r USING (mivza_c, prev_mivza_c) GROUP BY 1),
baseline AS (
  SELECT pm.mivza_c, sum(l.Cmt) AS baseline_units, sum(${NET}) AS baseline_net
  FROM promo_meta pm JOIN promo_items pi ON pi.mivza_c = pm.mivza_c JOIN ${L} l ON l.PrtC = pi.prt
  JOIN ${H} h ON h.C = l.KupaDocC AND h.DateDoc::DATE >= pm.from_d - (CAST(pm.cmp_days AS INTEGER) * INTERVAL 1 DAY) AND h.DateDoc::DATE < pm.from_d
  LEFT JOIN ${PC} pc2 ON pc2.mivza_c = l.MivzaNo
  WHERE coalesce(pc2.deal_id, -1) <> pm.deal_id
  GROUP BY 1),
stock AS (
  SELECT pi.mivza_c, sum(i.Itra) AS stock_left
  FROM promo_items pi JOIN ${ITR} i ON i.Prt = pi.prt AND i.DateDoc = ${SNAP} JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0 GROUP BY 1),
daily_series AS (
  SELECT mivza_c, string_agg(strftime(d, '%m-%d') || ':' || CAST(round(sum_net) AS VARCHAR), '|' ORDER BY d) AS daily_sales_chart
  FROM (SELECT mivza_c, d, sum(net) AS sum_net FROM line_fact GROUP BY 1, 2) x GROUP BY 1)
SELECT pm.mivza_c, pm.deal_id, pm.deal_name, pm.promo_name, pm.from_d, pm.to_d, strftime(pm.from_d, '%d/%m/%Y') || ' - ' || strftime(pm.to_d, '%d/%m/%Y') AS window,
  strftime(pm.from_d - (CAST(pm.cmp_days AS INTEGER) * INTERVAL 1 DAY), '%d/%m/%Y') || ' - ' || strftime(pm.from_d - INTERVAL 1 DAY, '%d/%m/%Y') AS baseline_window,
  pm.mechanic, pm.threshold_qty, pm.deal_price, pm.planned_discount_pct, pm.duration_days, pm.cmp_days, pm.n_cycles, pm.is_recurring, pm.item_count, pm.promo_items, pm.categories,
  coalesce(pr.sold_items, 0) AS sold_items, round(coalesce(st.stock_left, 0), 1) AS stock_left, round(coalesce(pr.units_sold, 0), 1) AS units_sold,
  round(coalesce(pr.promo_net, 0), 1) AS promo_net, round(coalesce(pr.cogs, 0), 1) AS cogs, round(coalesce(pr.promo_net, 0) - coalesce(pr.cogs, 0), 1) AS margin_ils,
  round(100.0*(coalesce(pr.promo_net, 0) - coalesce(pr.cogs, 0))/nullif(pr.promo_net, 0), 1) AS margin_pct,
  round(coalesce(pr.promo_net, 0)/nullif(coalesce(pr.selling_days, pm.cmp_days), 0), 1) AS daily_sales_rate,
  round(coalesce(ip.current_item_net, 0), 1) AS current_item_net, round(coalesce(ip.baseline_item_net, 0), 1) AS baseline_item_net,
  round(coalesce(ip.current_item_net, 0) - coalesce(ip.baseline_item_net, 0), 1) AS item_sales_change_ils,
  round((coalesce(ip.current_item_net, 0) - coalesce(ip.current_item_cogs, 0)) - (coalesce(ip.baseline_item_net, 0) - coalesce(ip.baseline_item_cogs, 0)), 1) AS item_profit_change_ils,
  round(100.0*(coalesce(ip.current_item_net, 0)/nullif(ip.baseline_item_net, 0)-1), 1) AS item_sales_lift_pct,
  round(coalesce(b.baseline_net, 0)/nullif(pm.cmp_days, 0), 1) AS baseline_daily_sales_rate,
  round(coalesce(pr.promo_net, 0) - coalesce(b.baseline_net, 0), 1) AS sales_change_ils,
  round((coalesce(pr.promo_net, 0)/nullif(coalesce(pr.selling_days, pm.cmp_days), 0))/nullif(coalesce(b.baseline_net, 0)/nullif(pm.cmp_days, 0), 0), 2) AS sales_lift_multiplier,
  round(100.0*(1 - coalesce(pr.promo_net, 0)/nullif(pr.list_gross, 0)), 1) AS effective_discount_pct,
  coalesce(pr.free_units, 0) AS free_units, pr.actual_from, pr.actual_to, coalesce(pr.selling_days, 0) AS selling_days,
  ds.daily_sales_chart, ip.sales_timeline_chart, coalesce(pi.previous_identical_count, 0) AS previous_identical_count, pi.previous_identical_promos,
  concat_ws('|',
    CASE WHEN coalesce(ip.current_item_net, 0) < coalesce(ip.baseline_item_net, 0) THEN 'warn:ירידה במכירות' END,
    CASE WHEN coalesce(pi.previous_identical_count, 0) = 0 AND coalesce(ip.current_item_net, 0) <= coalesce(ip.baseline_item_net, 0) THEN 'warn:המבצע לא שיפר את המכירות' END,
    CASE WHEN coalesce(ip.current_item_net, 0) > coalesce(ip.baseline_item_net, 0) THEN 'good:המבצע שיפר מכירות' END,
    CASE WHEN coalesce(pi.previous_identical_count, 0) > 0 THEN 'info:מבצע זהה קודם' END) AS promo_labels,
  CASE WHEN pm.from_d <= (SELECT d FROM anchor) AND pm.to_d >= (SELECT d FROM anchor) THEN true ELSE false END AS is_active,
  CASE WHEN coalesce(ip.current_item_net, 0) < coalesce(ip.baseline_item_net, 0) THEN 'ירידה במכירות מול תקופת הבסיס'
    WHEN coalesce(pi.previous_identical_count, 0) = 0 AND coalesce(ip.current_item_net, 0) <= coalesce(ip.baseline_item_net, 0) THEN 'המבצע לא שיפר את המכירות'
    ELSE '' END AS warning
FROM promo_meta pm LEFT JOIN promo_roll pr USING (mivza_c) LEFT JOIN item_period_roll ip USING (mivza_c) LEFT JOIN prev_identical pi USING (mivza_c) LEFT JOIN baseline b USING (mivza_c) LEFT JOIN stock st USING (mivza_c) LEFT JOIN daily_series ds USING (mivza_c)`

export const COVERAGE_VIEW = `WITH base AS (
  SELECT pc.deal_id, pc.deal_name, l.MivzaNo AS mivza_c, l.PrtC AS prt, h.StoreC AS branch_id, date_trunc('month', h.DateDoc)::DATE AS mth,
    sum(${NET}) AS net, sum(${NET}) FILTER (WHERE l.MivzaNo > 0) AS promo_net, sum(l.Cmt) FILTER (WHERE l.MivzaNo > 0) AS promo_qty,
    sum(l.AczDisLine*${NET}) FILTER (WHERE l.MivzaNo > 0 AND l.AczDisLine BETWEEN 0.001 AND 100) AS promo_disc_dnum,
    sum(${NET}) FILTER (WHERE l.MivzaNo > 0 AND l.AczDisLine BETWEEN 0.001 AND 100) AS promo_disc_net
  FROM ${L} l JOIN ${H} h ON h.C = l.KupaDocC AND h.DateDoc >= DATE '2024-01-01' LEFT JOIN ${PC} pc ON pc.mivza_c = l.MivzaNo
  WHERE l.MivzaNo > 0 GROUP BY 1, 2, 3, 4, 5, 6)
SELECT base.mivza_c, base.deal_id, base.deal_name, base.prt, trim(p.Nm) AS item, base.branch_id, trim(s.Nm) AS branch, trim(dp.Nm) AS dept,
  strftime(base.mth, '%Y-%m') AS ym, round(base.net, 1) AS net, round(base.promo_net, 1) AS promo_net, round(base.promo_qty, 1) AS promo_qty,
  round(base.promo_disc_dnum/nullif(base.promo_disc_net, 0), 1) AS depth_wtd_pct
FROM base JOIN ${PRT} p ON p.C = base.prt JOIN ${STORE} s ON s.C = base.branch_id LEFT JOIN ${DEPT} dp ON dp.C = p.DepartmentC`

// stuck stock worth clearing via promotion: real branches only (no warehouse), sellable items only (rate floor,
// bounded cover, weighed phantom counts out), margin room for a discount, no deposits/tobacco (illegal to promote)
export const CLEARANCE_VIEW = `WITH anchor AS (SELECT ${LAST_FULL} AS d),
${COST},
sales AS (
  SELECT l.PrtC AS prt, h.StoreC AS branch_id, sum(l.Cmt) FILTER (WHERE h.DateDoc::DATE > (SELECT d FROM anchor) - INTERVAL 91 DAY) / 91.0 AS daily_rate,
    sum(l.Cmt) FILTER (WHERE h.DateDoc::DATE > (SELECT d FROM anchor) - INTERVAL 31 DAY) / 31.0 AS rate30,
    sum(${NET}) FILTER (WHERE h.DateDoc::DATE > (SELECT d FROM anchor) - INTERVAL 91 DAY) AS net_91d, max(h.DateDoc::DATE) AS last_sale_d
  FROM ${L} l JOIN ${H} h ON h.C = l.KupaDocC AND h.DateDoc::DATE <= (SELECT d FROM anchor) AND h.DateDoc::DATE > (SELECT d FROM anchor) - INTERVAL 120 DAY
  GROUP BY 1, 2),
best_promo AS (
  SELECT l.PrtC AS prt, round(max(promo_net/nullif(days, 0)), 1) AS best_past_promo_daily_sales
  FROM (SELECT l.PrtC, l.MivzaNo, sum(${NET}) AS promo_net, count(DISTINCT h.DateDoc::DATE) AS days FROM ${L} l JOIN ${H} h ON h.C = l.KupaDocC WHERE l.MivzaNo > 0 AND h.DateDoc >= DATE '2024-01-01' GROUP BY 1, 2) l GROUP BY 1),
stock AS (
  SELECT i.Prt AS prt, i.Store AS branch_id, sum(i.Itra) AS stock_qty FROM ${ITR} i JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0 AND trim(s.Nm) NOT LIKE '%מחסן%' WHERE i.DateDoc = ${SNAP} GROUP BY 1, 2),
cand AS (
  SELECT st.prt, trim(p.Nm) AS item, st.branch_id, trim(s.Nm) AS branch, trim(dp.Nm) AS dept, st.stock_qty, sa.daily_rate, sa.rate30,
    st.stock_qty/sa.daily_rate AS days_cover, round(st.stock_qty*coalesce(c.unit_cost, 0)) AS tied_cash_ils, sa.net_91d, sa.last_sale_d,
    100.0*(sa.net_91d - coalesce(c.unit_cost, 0)*sa.daily_rate*91)/nullif(sa.net_91d, 0) AS margin_pct,
    CASE WHEN st.stock_qty/sa.daily_rate > 180 THEN 35 WHEN st.stock_qty/sa.daily_rate > 90 THEN 25 ELSE 15 END AS base_depth_pct,
    bp.best_past_promo_daily_sales, regexp_matches(trim(dp.Nm), 'חלב|בשר|עוף|דגים|ירקות|פירות|מקורר|קפוא') AS perishable
  FROM stock st JOIN ${PRT} p ON p.C = st.prt JOIN ${STORE} s ON s.C = st.branch_id
  JOIN ${DEPT} dp ON dp.C = p.DepartmentC AND dp.C NOT IN (164, 204) AND NOT regexp_matches(dp.Nm, 'טבק|עישון')
  JOIN sales sa ON sa.prt = st.prt AND sa.branch_id = st.branch_id
  LEFT JOIN cost c ON c.ItemID = st.prt AND c.StoreID = st.branch_id LEFT JOIN best_promo bp ON bp.prt = st.prt
  WHERE st.stock_qty > 0 AND sa.daily_rate >= 0.1 AND st.stock_qty/sa.daily_rate BETWEEN 45 AND 720
    AND coalesce(sa.rate30, 0) <= sa.daily_rate*0.85 AND NOT (p.SwShakil = 1 AND st.stock_qty > 500)
    AND NOT regexp_matches(p.Nm, 'שקית|פקדון|פיקדון|מארז|משטח|מיכל|בקבוק ריק|ארגז'))
SELECT prt, item, branch_id, branch, dept, round(stock_qty, 1) AS stock_qty, round(daily_rate, 2) AS daily_rate, round(rate30, 2) AS rate30,
  round(days_cover) AS days_cover, tied_cash_ils, last_sale_d, round(margin_pct, 1) AS margin_pct,
  LEAST(base_depth_pct, GREATEST(5, floor(margin_pct - 5)))::INTEGER AS rec_depth_pct,
  CASE WHEN perishable THEN 'הוזלה מיידית לניקוי מלאי טרי' ELSE 'מבצע מחיר או מארז' END AS rec_mechanic,
  round(best_past_promo_daily_sales, 1) AS best_past_promo_daily_sales, perishable
FROM cand WHERE margin_pct > 8`

// deal-history recommendation spine: one row per recurring named deal (promotion_cycles), with stamped-line
// economics (net/margin/effective discount) and TRUE lift = member-item sales on deal-active days vs other days
// (stamped lines alone understate multibuy promos). lift needs >=14 off days, else NULL (always-on deals)
export const DEAL_REC_VIEW = `WITH anchor AS (SELECT ${LAST_FULL} AS d),
${COST},
cyc AS (
  SELECT pc.deal_id, pc.deal_name, pc.brand, pc.category, m.C AS mivza_c, m.FromDate::DATE AS f,
    LEAST(m.ToDate::DATE, (SELECT d FROM anchor)) AS t, trim(m.MivzaTypeNm) AS mechanic
  FROM ${PC} pc JOIN ${M} m ON m.C = pc.mivza_c
  WHERE pc.is_recurring AND NOT regexp_matches(pc.deal_name, '^מבצע [0-9]+$') AND m.FromDate::DATE >= DATE '2024-01-01'
    AND date_diff('day', m.FromDate::DATE, m.ToDate::DATE) BETWEEN 0 AND 90),
member_prts AS (SELECT DISTINCT c.deal_id, mp.PrtC AS prt FROM (SELECT DISTINCT deal_id, mivza_c FROM cyc) c JOIN ${MP} mp ON mp.MivzaC = c.mivza_c),
deal_items AS (
  SELECT mp.deal_id, count(DISTINCT mp.prt) AS item_count, string_agg(DISTINCT left(trim(p.Nm), 60), ' | ') AS promo_items,
    bool_or(regexp_matches(coalesce(dp.Nm, ''), 'טבק|עישון')) AS has_tobacco
  FROM member_prts mp JOIN ${PRT} p ON p.C = mp.prt LEFT JOIN ${DEPT} dp ON dp.C = p.DepartmentC GROUP BY 1),
cycle_roll AS (
  SELECT c.deal_id, c.mivza_c, min(c.f) AS f, sum(${NET}) AS net, sum(l.Cmt) AS qty,
    sum(CASE WHEN co.unit_cost IS NOT NULL THEN co.unit_cost*l.Cmt ELSE 0 END) AS cogs, sum(l.MhrLine*l.Cmt) AS list_gross,
    count(DISTINCT h.DateDoc::DATE) AS days, max(h.DateDoc::DATE) AS last_d
  FROM cyc c JOIN ${L} l ON l.MivzaNo = c.mivza_c JOIN ${H} h ON h.C = l.KupaDocC AND h.DateDoc >= DATE '2024-01-01'
  LEFT JOIN cost co ON co.ItemID = l.PrtC AND co.StoreID = h.StoreC GROUP BY 1, 2),
deal_days AS (SELECT DISTINCT deal_id, unnest(generate_series(f, t, INTERVAL 1 DAY))::DATE AS d FROM cyc WHERE f <= t),
item_daily AS (
  SELECT l.PrtC AS prt, h.DateDoc::DATE AS d, sum(${NET}) AS net
  FROM ${L} l JOIN ${H} h ON h.C = l.KupaDocC AND h.DateDoc >= DATE '2024-01-01'
  WHERE l.PrtC IN (SELECT prt FROM member_prts) GROUP BY 1, 2),
on_off AS (
  SELECT did.deal_id,
    sum(did.net) FILTER (WHERE dd.d IS NOT NULL)/nullif(count(*) FILTER (WHERE dd.d IS NOT NULL), 0) AS on_daily_net,
    sum(did.net) FILTER (WHERE dd.d IS NULL)/nullif(count(*) FILTER (WHERE dd.d IS NULL), 0) AS off_daily_net,
    count(*) FILTER (WHERE dd.d IS NULL) AS off_days
  FROM (SELECT mp.deal_id, id.d, sum(id.net) AS net FROM member_prts mp JOIN item_daily id ON id.prt = mp.prt GROUP BY 1, 2) did
  LEFT JOIN deal_days dd ON dd.deal_id = did.deal_id AND dd.d = did.d GROUP BY 1),
stock AS (
  SELECT mp.deal_id, sum(i.Itra) AS stock_left
  FROM member_prts mp JOIN ${ITR} i ON i.Prt = mp.prt AND i.DateDoc = ${SNAP}
  JOIN ${STORE} s ON s.C = i.Store AND s.SnifC > 0 AND trim(s.Nm) NOT LIKE '%מחסן%' GROUP BY 1),
deal_roll AS (
  SELECT c.deal_id, any_value(c.deal_name) AS deal_name, any_value(c.brand) AS brand, any_value(c.category) AS category, any_value(c.mechanic) AS mechanic,
    count(DISTINCT c.mivza_c) AS cycles_run, count(DISTINCT cr.mivza_c) AS cycles_with_sales, max(cr.last_d) AS last_sale_d,
    bool_or(c.f <= (SELECT d FROM anchor) AND c.t >= (SELECT d FROM anchor)) AS is_active_now,
    sum(cr.net) AS net, sum(cr.qty) AS qty, sum(cr.cogs) AS cogs, sum(cr.list_gross) AS list_gross, sum(cr.days) AS days,
    string_agg(strftime(cr.f, '%m/%y') || ':' || CAST(round(cr.net/nullif(cr.days, 0))::BIGINT AS VARCHAR), '|' ORDER BY cr.f) AS cycles_chart
  FROM cyc c LEFT JOIN cycle_roll cr ON cr.mivza_c = c.mivza_c GROUP BY 1)
SELECT dr.deal_id, dr.deal_name, dr.brand, dr.category, dr.mechanic, dr.cycles_run, dr.cycles_with_sales, di.item_count, di.promo_items, dr.cycles_chart,
  dr.is_active_now, dr.last_sale_d, date_diff('day', dr.last_sale_d, (SELECT d FROM anchor)) AS days_since_last_run,
  round(dr.net) AS total_net, round(dr.net - dr.cogs) AS margin_ils, round(100.0*(dr.net - dr.cogs)/nullif(dr.net, 0), 1) AS margin_pct,
  round(100.0*(1 - dr.net/nullif(dr.list_gross, 0)), 1) AS effective_discount_pct,
  round(dr.net/nullif(dr.days, 0)) AS promo_daily_net,
  round(oo.on_daily_net) AS on_daily_net, round(oo.off_daily_net) AS off_daily_net,
  CASE WHEN oo.off_days >= 14 THEN round(oo.on_daily_net/nullif(oo.off_daily_net, 0), 2) END AS lift_multiplier,
  CASE WHEN oo.off_days >= 14 THEN round(oo.on_daily_net - oo.off_daily_net) END AS uplift_daily_net,
  round(coalesce(st.stock_left, 0)) AS stock_left,
  round(coalesce(st.stock_left, 0)/nullif(dr.qty/nullif(dr.days, 0), 0)) AS stock_days_at_promo_rate
FROM deal_roll dr JOIN deal_items di USING (deal_id) LEFT JOIN on_off oo USING (deal_id) LEFT JOIN stock st USING (deal_id)
WHERE NOT di.has_tobacco`
