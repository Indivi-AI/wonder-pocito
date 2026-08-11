# Comax — 50 שאלות מנהל קמעונאות עם SQL מאומת

Verified SQL doclets for the 50 retail-manager questions (from `50-retail-manager-questions.md`), each investigated and executed against the real data by a dedicated agent, then independently re-verified. Intended as LLM guidance for querying this data correctly.

**How to run:** `duckdb -readonly /Users/yiftachn/code/Genie/files/rooms/comaxDemo/usersRO/comax.duckdb -c "<SQL>"` — schema `big` = the supermarket chain (11 selling branches, data 2022-01-02 → 2026-06-28). App/test parquet wurl: `signedRoom://comaxDemo/usersRO/parquet`. Always `-readonly`.

**Statuses:** `VERIFIED` = runs and answers the question. `PARTIAL` = best honest approximation, limits in notes. `NOT_ANSWERABLE` = required data proven absent (proof query included). Totals: 40 VERIFIED, 7 PARTIAL, 3 NOT_ANSWERABLE.

## Global rules (apply to EVERY query here)

1. **Window ≥ 2024-01-01.** Line-level data is complete only from 2024 (2022 headers have no lines, 2023 half). The pre-baked fact `big.f` is already windowed.
2. **`big.f` first.** 63.8M enriched line rows: `store, d(DATE), ym(yyyymm), cust, moadon, doctype, prt, dept, grp, qty, gross, net, cost, cogs, disc_pct(clean 0-100), promo(bool)`. It is a 1:1 mirror of KupaDoc_Lines for 2024+. It has **no receipt id** — anything per-basket/per-receipt (basket size, transaction counts, co-occurrence) must use `big.KupaDoc_Header`/`big.KupaDoc_Lines` (join `l.KupaDocC = h.C`).
3. **Money:** `Scm`/`gross` include VAT; net = `Scm − VatAmount` (header: `Scm − ScmMaam`). VAT changed 17%→18% on 2025-01-01. Dept 11 (פירות וירקות ללא מע"מ, `SwNoMaam=1`) is legally VAT-exempt (~20.6% of net).
4. **Returns are negative rows; plain SUM self-nets.** Transaction counts = receipts with `Scm>0` (a refund is also a header row). Returns ≈ −0.6% of net.
5. **`DocType` is NULL before 2026-02-16** (POS change). After: 652=receipt, 670=named-account invoice (Wolt/self-use — real positive sales), 654=void/refund (negative), 650=manual charge. Never filter history by DocType.
6. **Two ledgers, never add them:** `big.KupaDocLk_*` is the Wolt/delivery invoice book; from 2026-02-16 the same orders also appear in the main ledger as DocType 670 (monthly match 96-103%). Use the main ledger; use Lk only pre-2026-02 or for cancellations (`StornoDocC`).
7. **Cost:** sale lines carry no cost (`ScmAlut`=0). Cost = `big.DailyPriceCost.FinalRegularCostPrice` (BIGINT `yyyymmdd` dates, sparse days, **history starts 2025-01-01**); latest per item×store = `arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE >0)`. `big.f.cost/cogs` pre-implement this. `cost IS NULL` (≈1.3% of net) = margin UNKNOWABLE → exclude, never zero-cost.
8. **`qty` mixes kg and units** (19% of lines are weighed, fractional). Never present cross-item SUM(qty) as "units"; per-item ratios (days-of-cover, uplift) are fine.
9. **Discounts:** `AczDisLine` is a % with a −99900 sentinel — raw use needs `BETWEEN 0 AND 100`; `big.f.disc_pct` is clean. AVERAGE (revenue-weighted), never SUM. Free items (`gross=0, qty>0`, ~25K lines) are real promo giveaways.
10. **Promotions:** `MivzaNo` lives on KupaDoc_Lines (not in f — f has only the `promo` bool). Bridge `Mivza_Prt` is keyed **(MivzaC, PrtC) — join needs both**. No promotion master exists (no names/dates); promo periods are inferred from when MivzaNo appears on lines; ~2.7% of promo lines resolve to nothing.
11. **Customers (`Idx`):** per-branch anonymous buckets are `Nm LIKE 'לקוח כללי%'` (64.2% of net). **Identified individuals are Type 900 named accounts** (house/charge accounts; with Type 1 named businesses = 34.9% of net). Wolt accounts `LIKE '%וולט%'`, self-use `LIKE 'צריכה עצמית%'`.
12. **Loyalty (`MOADON_NO`):** captured only from 2026-05-16 (0% before, 51% May, 100% June). June-2026 is the only valid loyalty window. Cards averaging **≥10 receipts/day are per-branch default/house cards** (e.g. 1029, sequential block 301174-301181) — exclude from member analyses.
13. **Cashiers/registers:** `OvedC` is an opaque id (no employee master in this tenant); ids 2 and 3 (500-680K receipts each) are aggregate/self-checkout system accounts, not people.
14. **Stock (`Prt_ItrotStore_Yomi`):** a SINGLE-DAY photo (2026-06-28). 22.6% of balances negative — register-sold never-received items (bags, deposits) and weighed-produce count drift are artifacts, not theft. Days-of-cover = Itra ÷ recent daily sales rate. Some warehouses also have `SnifC>0` (מרלוג-דנלוג) — check names.
15. **Artifact departments to exclude from assortment math:** 164 (אגרות משטחים מיכלים — crates/deposits) and 204 (לא לפידיון — e.g. loyalty-point redemptions).
16. **Relative dates:** the extract is static. Last full day = 2026-06-27 (06-28 is truncated); latest complete month = 202605; 2026-06 is partial. The chain is largely Shabbat-closed — only גני תקווה, אם המושבות and רמת השרון trade Saturdays.

---

## ביצועי מכירות והכנסות

<doclet id="Q1" label="מכירות יומיות" status="VERIFIED">
<question>מה היו סך המכירות אתמול בכל הסניפים, ואיך זה מול אותו יום בשבוע שעבר?</question>
<sql>
-- "yesterday" = last FULL day in data = 2026-06-27 (Sat); prior-week same weekday = 2026-06-20 (Sat)
WITH d AS (
  SELECT trim(s.Nm) AS branch,
         sum(CASE WHEN f.d=DATE '2026-06-27' THEN f.net END) AS net_yday,
         sum(CASE WHEN f.d=DATE '2026-06-20' THEN f.net END) AS net_prevwk
  FROM big.f f JOIN big.Store s ON f.store=s.C
  WHERE f.d IN (DATE '2026-06-27', DATE '2026-06-20')
  GROUP BY branch)
SELECT branch, round(net_yday) AS net_yesterday, round(net_prevwk) AS net_prev_week,
       round(100.0*(net_yday-net_prevwk)/nullif(net_prevwk,0),1) AS pct_chg
FROM d
UNION ALL
SELECT 'סה"כ רשת', round(sum(net_yday)), round(sum(net_prevwk)),
       round(100.0*(sum(net_yday)-sum(net_prevwk))/nullif(sum(net_prevwk),0),1) FROM d
ORDER BY net_yesterday DESC;
</sql>
<notes>
- net revenue = f.net (= gross − VAT); big.f is line-grain but SUM self-nets returns, giving day net directly.
- "yesterday" is relative to a static extract → substituted with 2026-06-27, verified as the last COMPLETE day (2026-06-28 is truncated: 11.7K rows vs a normal Sunday's ~70K). 06-27 has 5,516 receipts / trades to hour 22, squarely in the normal Saturday range.
- Compared against the SAME weekday one week back (2026-06-20) to neutralize day-of-week seasonality — mandatory because 06-27 is a Saturday.
- Only 3 branches appear because this is a Saturday: the chain is largely Shabbat-closed — only גני תקווה, אם המושבות and רמת השרון trade Saturdays (verified: other branches have ≤1 Saturday of sales ever). Chain net -5.8% vs prior Saturday.
</notes>
</doclet>

<doclet id="Q2" label="דירוג סניפים" status="VERIFIED">
<question>אילו סניפים הם המובילים והחלשים ביותר החודש לפי הכנסה?</question>
<sql>
-- "this month" → 202605 (latest COMPLETE month; 202606 is partial, 28 of 30 days)
SELECT trim(s.Nm) AS branch, round(sum(f.net)) AS net_month
FROM big.f f JOIN big.Store s ON f.store=s.C
WHERE f.ym = 202605
GROUP BY branch ORDER BY net_month DESC;
</sql>
<notes>
- Ranking hi→lo: leaders = גני תקווה (₪8.12M), אם המושבות (₪6.34M); weakest real branch = כפר סבא-גולני (₪0.35M). כלנית אור יהודה (₪513) is effectively a dead/just-opened store (first sale 2026-05-13) — flag separately, not a true "weak branch".
- "this month" is relative; used 202605 as the latest FULL month. Literal 202606 would understate every branch (only 28 days captured). Rank order is stable across months.
- All 11 stores in big.f are real branches; matches the master branch ranking.
</notes>
</doclet>

<doclet id="Q3" label="גודל סל" status="VERIFIED">
<question>מה שווי הסל הממוצע לכל סניף, ואיפה הוא מצטמצם?</question>
<sql>
-- basket = one positive receipt; value = net per receipt. Compare 202605 vs 202604 to find shrinkage.
WITH r AS (
  SELECT h.StoreC,
         CASE WHEN h.DateDoc>=TIMESTAMP '2026-05-01' AND h.DateDoc<TIMESTAMP '2026-06-01' THEN 202605
              WHEN h.DateDoc>=TIMESTAMP '2026-04-01' AND h.DateDoc<TIMESTAMP '2026-05-01' THEN 202604 END AS ym,
         (h.Scm - h.ScmMaam) AS net
  FROM big.KupaDoc_Header h
  WHERE h.DateDoc>=TIMESTAMP '2026-04-01' AND h.DateDoc<TIMESTAMP '2026-06-01' AND h.Scm>0)
SELECT trim(s.Nm) AS branch,
       round(avg(net) FILTER (WHERE ym=202605),1) AS basket_may,
       round(avg(net) FILTER (WHERE ym=202604),1) AS basket_apr,
       round(100.0*(avg(net) FILTER (WHERE ym=202605)-avg(net) FILTER (WHERE ym=202604))
             /avg(net) FILTER (WHERE ym=202604),1) AS pct_chg
FROM r JOIN big.Store s ON r.StoreC=s.C
GROUP BY branch ORDER BY basket_may DESC;
</sql>
<notes>
- Basket = a single receipt, so this uses big.KupaDoc_Header (receipt grain) — big.f is line-grain and has NO receipt id, so it cannot compute per-basket averages.
- Basket value = Scm − ScmMaam (net), averaged over positive receipts only (Scm>0) so returns/voids don't create phantom tiny baskets.
- "Shrinking" = MoM change vs prior full month: contracting at כפר סבא-גולני (-3.4%), כץ (-3.0%), רחובות (-2.0%); premium branches (גני תקווה ₪118, אם המושבות ₪114) hold or grow. Header net matches big.f exactly over this window.
</notes>
</doclet>

<doclet id="Q4" label="מספר עסקאות" status="VERIFIED">
<question>כמה עסקאות כל סניף ביצע היום, והאם התנועה עולה או יורדת?</question>
<sql>
-- "today" = last FULL day 2026-06-27; trend vs same weekday prior week 2026-06-20
WITH t AS (
  SELECT h.StoreC,
    count(*) FILTER (WHERE h.DateDoc>=TIMESTAMP '2026-06-27' AND h.DateDoc<TIMESTAMP '2026-06-28') AS tx_today,
    count(*) FILTER (WHERE h.DateDoc>=TIMESTAMP '2026-06-20' AND h.DateDoc<TIMESTAMP '2026-06-21') AS tx_prevwk
  FROM big.KupaDoc_Header h
  WHERE h.Scm>0 AND h.DateDoc>=TIMESTAMP '2026-06-20' AND h.DateDoc<TIMESTAMP '2026-06-28'
    AND (h.DateDoc<TIMESTAMP '2026-06-21' OR h.DateDoc>=TIMESTAMP '2026-06-27')
  GROUP BY h.StoreC)
SELECT trim(s.Nm) AS branch, tx_today, tx_prevwk,
       round(100.0*(tx_today-tx_prevwk)/nullif(tx_prevwk,0),1) AS pct_chg
FROM t JOIN big.Store s ON t.StoreC=s.C
WHERE tx_today>0 OR tx_prevwk>0 ORDER BY tx_today DESC;
</sql>
<notes>
- transaction = a positive receipt (Scm>0), counted from big.KupaDoc_Header (big.f cannot count receipts — no receipt id). Voids/returns excluded so counts reflect real checkouts.
- "today" → last FULL day 2026-06-27; direction judged vs the SAME weekday one week earlier to remove day-of-week effects.
- Only 3 rows because 06-27 is a Saturday (Shabbat-closed chain, same 3 branches as Q1). Traffic UP (+0.5% to +3.2%) while Q1 net was down — slightly more, smaller baskets.
</notes>
</doclet>

<doclet id="Q5" label="שעות שיא" status="VERIFIED">
<question>מה שעות המכירה החזקות לכל סניף, והאם אני מאייש אותן נכון?</question>
<sql>
-- peak hours per branch by transaction volume, latest complete month 202605
WITH h AS (
  SELECT k.StoreC, k.Hour, count(*) AS tx
  FROM big.KupaDoc_Header k
  WHERE k.Scm>0 AND k.DateDoc>=TIMESTAMP '2026-05-01' AND k.DateDoc<TIMESTAMP '2026-06-01'
  GROUP BY k.StoreC, k.Hour),
ranked AS (
  SELECT trim(s.Nm) AS branch, Hour, tx,
         row_number() OVER (PARTITION BY StoreC ORDER BY tx DESC) AS rn
  FROM h JOIN big.Store s ON h.StoreC=s.C)
SELECT branch, string_agg(Hour||'h('||tx||')', ', ' ORDER BY rn) AS peak_hours_by_tx
FROM ranked WHERE rn<=3
GROUP BY branch ORDER BY branch;
</sql>
<notes>
- Peak measured by TRANSACTION count per hour (the staffing driver = customers to serve), not shekels. Header.Hour is a clean 0-23 integer, fully populated. Positive receipts only.
- Top-3 hours per branch with volumes, so staffing can be judged directly.
- Two branch archetypes emerge: EVENING-peak (גני תקווה, אם המושבות, בר כוכבא, רמת השרון → 17-19h) vs MIDDAY-peak (הסתדרות, חובבי ציון, כץ, רעננה → 10-13h). They need different shift structures — one staffing template would misfit half the estate.
</notes>
</doclet>

<doclet id="Q6" label="מגמת מכירות" status="VERIFIED">
<question>האם ההכנסה במגמת עלייה או ירידה ב-12 השבועות האחרונים, בנטרול מבצעים?</question>
<sql>
-- 12 COMPLETE ISO weeks (Mon-start), non-promo lines only. Last complete week starts 2026-06-15 (ends Sun 06-21).
WITH base AS (
  SELECT date_trunc('week', d) AS wk, sum(net) FILTER (WHERE promo=false) AS net_ex_promo
  FROM big.f
  WHERE d BETWEEN DATE '2026-03-30' AND DATE '2026-06-21'
  GROUP BY wk)
SELECT wk::DATE AS week_start, round(net_ex_promo) AS net_ex_promo,
       round(100.0*(net_ex_promo-lag(net_ex_promo) OVER (ORDER BY wk))
             /lag(net_ex_promo) OVER (ORDER BY wk),1) AS wow_pct
FROM base ORDER BY wk;
-- trend slope over the 12 weeks: regr_slope = -28,439 ₪/week (-0.52%/week), corr = -0.42
</sql>
<notes>
- "Neutralizing promos" = only non-promo lines (big.f.promo = false): the trend reflects base/full-price demand, not discount-driven spikes.
- Windowed to 12 COMPLETE Mon-Sun weeks (2026-03-30 … 2026-06-15 starts). Deliberately excludes the partial trailing week of 06-22 (missing Sunday 06-28), which would show a false -11% cliff.
- Verdict: roughly FLAT with slight downward drift — slope −₪28.4K/week (−0.52%/week), weak negative correlation (−0.42). Non-promo revenue oscillates ₪5.1M-6.0M/week; June softened.
</notes>
</doclet>

<doclet id="Q7" label="צמיחת חנויות זהות" status="VERIFIED">
<question>איך המכירות השנה מול שנה שעברה בסניפים שהיו פתוחים בשתי התקופות?</question>
<sql>
-- same-store: Jan 1 – Jun 27 each year (aligned to last full day); only branches selling in BOTH windows
WITH per AS (
  SELECT f.store,
    sum(net) FILTER (WHERE f.d BETWEEN DATE '2026-01-01' AND DATE '2026-06-27') AS net_2026,
    sum(net) FILTER (WHERE f.d BETWEEN DATE '2025-01-01' AND DATE '2025-06-27') AS net_2025
  FROM big.f f
  WHERE f.d BETWEEN DATE '2025-01-01' AND DATE '2025-06-27'
     OR f.d BETWEEN DATE '2026-01-01' AND DATE '2026-06-27'
  GROUP BY f.store)
SELECT trim(s.Nm) AS branch, round(net_2025) AS h1_2025, round(net_2026) AS h1_2026,
       round(100.0*(net_2026-net_2025)/net_2025,1) AS yoy_pct
FROM per JOIN big.Store s ON per.store=s.C
WHERE net_2025>0 AND net_2026>0
UNION ALL
SELECT 'סה"כ חנויות זהות', round(sum(net_2025)), round(sum(net_2026)),
       round(100.0*(sum(net_2026)-sum(net_2025))/sum(net_2025),1)
FROM per WHERE net_2025>0 AND net_2026>0
ORDER BY h1_2026 DESC;
</sql>
<notes>
- Same-store filter = net>0 in BOTH windows — automatically excludes new stores (כפר סבא-גולני opened 2026-03, כלנית 2026-05) → 9 comparable branches.
- Both windows are the SAME calendar span (Jan 1 → Jun 27), like-for-like, unaffected by partial June. Uses net, so the 17→18% VAT change doesn't distort.
- Total same-store growth = +12.3% YoY. Maturing branches lead (רמת השרון +36%, בר כוכבא +35%, both opened 2024); הסתדרות flat (+0.9%).
</notes>
</doclet>

<doclet id="Q8" label="סוף שבוע מול חול" status="VERIFIED">
<question>כמה מההכנסה שלי מגיעה מסופי שבוע, והאם זה מצדיק את האיוש?</question>
<sql>
-- weekend = Fri-Sat (isodow 5,6); weekday = Sun-Thu. isodow: 1=Mon..7=Sun.
SELECT
  CASE WHEN isodow(d) IN (5,6) THEN 'סופ"ש (שישי-שבת)' ELSE 'חול (ראשון-חמישי)' END AS daypart,
  round(sum(net)) AS net,
  round(100.0*sum(net)/(SELECT sum(net) FROM big.f),1) AS pct_of_total,
  count(distinct d) AS n_days,
  round(sum(net)/count(distinct d)) AS net_per_day
FROM big.f GROUP BY daypart ORDER BY net DESC;
-- per-weekday detail (net per trading day): Mon 664K(12.5%) Tue 694K(13.0%) Wed 732K(13.8%)
-- Thu 929K(17.3%) Fri 1,204K(22.6%) Sat 463K(8.6%) Sun 643K(12.1%)
</sql>
<notes>
- Weekday activity verified empirically first: the chain trades all 7 days but is largely SHABBAT-CLOSED — only 2-3 branches sell Saturdays. "Weekend" ≠ a uniform two-day block.
- Israeli weekend = Fri-Sat (isodow 5-6): 31.3% of net; per trading day, weekend days average MORE (₪835K) than weekdays (₪732K).
- The weekend is really a FRIDAY phenomenon: Friday alone is the biggest day (₪1.20M/day = 22.6% of ALL revenue, pre-Shabbat rush); Saturday is the WEAKEST (₪0.46M/day, most branches shut). Thursday is also elevated.
- Staffing: Friday (and Thursday PM) warrant maximum staffing chain-wide; Saturday staffing only concerns the 2-3 Shabbat-open branches. One "weekend tier" would over-staff Saturday and under-staff Friday.
</notes>
</doclet>

---

## רווחיות ומרווח

<doclet id="Q9" label="רווח גולמי" status="VERIFIED">
<question>מה הרווח הגולמי לכל סניף, ואילו סניפים שוחקים אותו?</question>
<sql>
WITH s AS (
  SELECT f.store,
    sum(f.net) net_all,
    sum(f.net) FILTER (WHERE f.cost IS NOT NULL) net_c,
    sum(f.net-f.cogs) FILTER (WHERE f.cost IS NOT NULL) margin
  FROM big.f f WHERE f.d>=DATE '2024-01-01' GROUP BY 1
), chain AS (SELECT sum(margin)/sum(net_c) m_pct FROM s)
SELECT st.Nm, round(s.net_all) net, round(s.margin) gross_profit_ils,
  round(100.0*s.margin/s.net_c,1) margin_pct,
  round((SELECT m_pct FROM chain)*100,1) chain_avg_pct,
  round(s.margin - (SELECT m_pct FROM chain)*s.net_c) drag_vs_chain_ils
FROM s JOIN big.Store st ON st.C=s.store
WHERE s.net_all>1000000
ORDER BY drag_vs_chain_ils ASC;
</sql>
<notes>
- Gross profit per store = SUM(net − cogs) over costed rows; margin% on costed net only. Top branch גני תקווה earns ₪71.6M gross profit (32.6%).
- "Shrinker" = drag_vs_chain_ils: ₪ of margin a store loses vs chain-avg margin% (31.9%) applied to its own costed net — isolates margin QUALITY erosion, not size.
- Dominant shrinker: בר כוכבא פ"ת at 27.1% — 4.8pts below chain, eroding ₪2.6M; every other store is within ±0.4pts. Investigate that branch's discount policy / mix / shrinkage.
- Cost-NULL rows (1.33% of net) excluded so they don't fake 100% margin; returns self-net; tiny new stores (<₪1M) filtered. This is GROSS margin (pre-opex).
</notes>
</doclet>

<doclet id="Q10" label="מרווח קטגוריה" status="VERIFIED">
<question>אילו מחלקות מרוויחות לי הכי הרבה מול אלה שרק מביאות תנועה?</question>
<sql>
WITH dept AS (
  SELECT f.dept,
    round(sum(f.net)) net,
    round(sum(f.net-f.cogs) FILTER (WHERE f.cost IS NOT NULL)) margin_ils,
    round(100.0*sum(f.net-f.cogs) FILTER (WHERE f.cost IS NOT NULL)/nullif(sum(f.net) FILTER (WHERE f.cost IS NOT NULL),0),1) margin_pct,
    count(DISTINCT (f.store,f.d,f.cust)) baskets
  FROM big.f f WHERE f.d>=DATE '2024-01-01' GROUP BY 1
)
SELECT d.dept, dp.Nm dept_nm, d.net, d.margin_ils, d.margin_pct,
  round(100.0*d.margin_ils/sum(d.margin_ils) OVER (),1) share_of_total_margin
FROM dept d JOIN big.Departments dp ON dp.C=d.dept
ORDER BY d.net DESC;
</sql>
<notes>
- "Earns most" = margin_ils (absolute ₪) + share_of_total_margin; "brings traffic" = high net/baskets but low margin%.
- Star earner: פירות וירקות is both #1 seller (₪142.5M) AND highest margin (42.0%) = 27.3% of ALL chain margin. Thin-margin traffic drivers: מוצרי חלב (26.1%) and בשר ועוף טרי (24.6%).
- baskets = distinct (store,day,customer) — a proxy for shopping trips touching the dept (no receipt id in f).
- Cost-NULL excluded from margin math. Margin is pre-opex gross.
</notes>
</doclet>

<doclet id="Q11" label="מוצרי הפסד" status="VERIFIED">
<question>אילו פריטים אני מוכר מתחת לעלות, והאם זה מכוון?</question>
<sql>
WITH it AS (
  SELECT f.prt,
    sum(f.qty) qty, round(sum(f.net)) net,
    round(sum(f.net-f.cogs)) margin_ils,
    round(sum(f.cogs)) cogs
  FROM big.f f WHERE f.d>=DATE '2024-01-01' AND f.cost IS NOT NULL
  GROUP BY 1
  HAVING sum(f.net-f.cogs) < 0
)
SELECT it.prt, p.Nm, it.qty, it.net, it.margin_ils AS lost_margin_ils,
  round(100.0*it.margin_ils/nullif(it.net,0),1) margin_pct
FROM it JOIN big.Prt p ON p.C=it.prt
ORDER BY it.margin_ils ASC LIMIT 20;
</sql>
<notes>
- Below-cost judged on NET price vs cost (cost is VAT-exclusive): an item lists only if its TOTAL margin over 2024+ is negative — structurally below cost, not a one-off.
- "Intentional?" is read from the mix: leaders are classic loss-leaders / regulated items — instant coffee (Taster's Choice −₪290K, Elite −₪36K: KVI price anchors) and שקית לקופה (checkout bags, 4.2M units, government-regulated price). Clearly deliberate. Berries/fresh (blueberries −34%, cherries) look like spoilage/markdown losses — review those.
- Cost-NULL items excluded (would fake +100% margin); returns self-net; per-item ₪ totals are kg/unit-safe.
</notes>
</doclet>

<doclet id="Q12" label="דליפת מרווח" status="VERIFIED">
<question>איפה מחיר המכירה בפועל נמוך באופן עקבי ממחיר המחירון, ולמה?</question>
<sql>
WITH lk AS (
  SELECT f.prt,
    sum(CASE WHEN f.disc_pct BETWEEN 0.001 AND 99.9 THEN f.gross/(1-f.disc_pct/100)-f.gross ELSE 0 END) leak_total,
    sum(CASE WHEN f.promo AND f.disc_pct BETWEEN 0.001 AND 99.9 THEN f.gross/(1-f.disc_pct/100)-f.gross ELSE 0 END) leak_promo,
    sum(CASE WHEN NOT f.promo AND f.disc_pct BETWEEN 0.001 AND 99.9 THEN f.gross/(1-f.disc_pct/100)-f.gross ELSE 0 END) leak_manual,
    sum(f.gross) paid_gross
  FROM big.f f WHERE f.d>=DATE '2024-01-01' GROUP BY 1
)
SELECT lk.prt, p.Nm,
  round(lk.leak_total) leak_ils,
  round(100.0*lk.leak_total/nullif(lk.leak_total+lk.paid_gross,0),1) leak_pct_of_list,
  round(lk.leak_promo) via_promo,
  round(lk.leak_manual) via_manual
FROM lk JOIN big.Prt p ON p.C=lk.prt
ORDER BY lk.leak_total DESC LIMIT 20;
</sql>
<notes>
- Leak = list − paid, reconstructed per line as gross/(1−disc_pct/100) − gross (list implied by the clean disc_pct). Decomposed into via_promo vs via_manual (cashier discount).
- Chain-wide leak = ₪39.4M gross ≈ 4.8% of list. Root cause unambiguous: 99% is PLANNED PROMO, only ₪0.46M manual — no register leakage / rogue overrides problem.
- Two leak profiles: high-volume fresh (schnitzel, ground beef) = big ₪ at low %; beverages/oil (energy drink 26.5%, canola 37%, Coke Zero 33.8%) = aggressive depth.
- Sentinel excluded via BETWEEN; validated against raw MhrLine×Cmt reconstruction (₪40.3M, ~₪1M gap = sentinel rows). Both sides gross — the ratio is unaffected by VAT.
</notes>
</doclet>

<doclet id="Q13" label="סחיפת עלות" status="PARTIAL">
<question>אילו פריטים ספגו עליית עלות ספק שעדיין לא גלגלתי למחיר מדף?</question>
<sql>
WITH c AS (
  SELECT ItemID,
    avg(FinalRegularCostPrice) FILTER (WHERE DateDoc BETWEEN 20250101 AND 20250331) cost_base,
    avg(FinalRegularCostPrice) FILTER (WHERE DateDoc BETWEEN 20260101 AND 20260628) cost_now
  FROM big.DailyPriceCost
  WHERE FinalRegularCostPrice>0 AND FinalRegularCostSource<>'No Cost'
  GROUP BY 1
),
p AS (
  SELECT prt,
    sum(net) FILTER (WHERE ym BETWEEN 202501 AND 202503)/nullif(sum(qty) FILTER (WHERE ym BETWEEN 202501 AND 202503),0) px_base,
    sum(net) FILTER (WHERE ym BETWEEN 202601 AND 202606)/nullif(sum(qty) FILTER (WHERE ym BETWEEN 202601 AND 202606),0) px_now,
    sum(net) FILTER (WHERE ym BETWEEN 202601 AND 202606) net_recent
  FROM big.f WHERE d>=DATE '2025-01-01' AND qty>0 GROUP BY 1
)
SELECT c.ItemID prt, pr.Nm,
  round(c.cost_base,2) cost_base, round(c.cost_now,2) cost_now,
  round(100.0*(c.cost_now-c.cost_base)/c.cost_base,1) cost_chg_pct,
  round(100.0*(p.px_now-p.px_base)/p.px_base,1) price_chg_pct,
  round(p.net_recent) net_recent_2026h1
FROM c JOIN p ON p.prt=c.ItemID JOIN big.Prt pr ON pr.C=c.ItemID
WHERE c.cost_base>0 AND c.cost_now>0 AND p.px_base>0 AND p.px_now>0
  AND (c.cost_now-c.cost_base)/c.cost_base >= 0.15
  AND (p.px_now-p.px_base)/p.px_base < 0.05
  AND p.net_recent > 50000
ORDER BY p.net_recent*((c.cost_now-c.cost_base)/c.cost_base) DESC;
</sql>
<notes>
- Cost trend from DailyPriceCost (baseline 2025Q1 vs 2026H1); price trend = avg NET unit price (net/qty) over the same windows. Flag = cost +≥15% AND net price +<5%, recent revenue >₪50K.
- Only 2 items pass the strict bar — genuine unpassed hikes: דנוור סטייק (cost +18.2%, shelf +4.9%, ₪432K sales) and hot-drink cups (cost +17.5%, price −24.6%). Relaxing to 10%/3%/₪30K adds tomato paste (+60.5% cost), frozen burgers, pitas, red pears.
- PARTIAL because: (a) DailyPriceCost history starts 2025-01-01 — no 2024 cost baseline exists; (b) thresholds are documented analyst choices. The short list is a real finding (pass-through is generally healthy), not a data gap.
- 'No Cost' excluded; net price vs net cost = apples to apples; within-item comparison is kg/unit-safe.
</notes>
</doclet>

<doclet id="Q14" label="רווח פריט" status="VERIFIED">
<question>מהם 20 הפריטים הרווחיים ביותר בשקלים, לא רק באחוזים?</question>
<sql>
SELECT f.prt, p.Nm,
  round(sum(f.net)) net,
  round(sum(f.net-f.cogs)) margin_ils,
  round(100.0*sum(f.net-f.cogs)/nullif(sum(f.net),0),1) margin_pct
FROM big.f f JOIN big.Prt p ON p.C=f.prt
WHERE f.d>=DATE '2024-01-01' AND f.cost IS NOT NULL
GROUP BY 1,2 ORDER BY margin_ils DESC LIMIT 20;
</sql>
<notes>
- Ranked by absolute margin ₪ (SUM(net − cogs)), cost-known items only — the "profit in the till" view, deliberately NOT margin% (a 70% item selling ₪10K matters less than a 30% item selling ₪10M).
- Top of list is produce: tomatoes ₪4.3M margin (58.7%), cherry tomatoes ₪4.1M (63.7%), cucumbers ₪2.4M, bananas ₪1.6M — high-volume produce generates the most absolute profit.
- Cost-NULL items EXCLUDED — notably fresh chicken cuts (see Q15) have big revenue but unknown cost, so they cannot be ranked here (unknown ≠ zero). Returns self-net.
</notes>
</doclet>

<doclet id="Q15" label="פריטים ללא מרווח" status="VERIFIED">
<question>לאילו פריטים אין נתוני עלות, כך שאני בכלל לא יודע אם הם רווחיים?</question>
<sql>
SELECT f.prt, p.Nm,
  round(sum(f.net)) net_at_risk,
  sum(f.qty) qty,
  count(DISTINCT f.store) stores
FROM big.f f JOIN big.Prt p ON p.C=f.prt
WHERE f.d>=DATE '2024-01-01' AND f.cost IS NULL
GROUP BY 1,2 ORDER BY net_at_risk DESC LIMIT 20;
</sql>
<notes>
- "No cost data" = big.f.cost IS NULL (no positive FinalRegularCostPrice ever resolved for the item). Ranked by net_at_risk = revenue whose profitability is unknowable — the correct prioritization.
- Total blind spot = ₪9.2M net (1.33% of chain). Concentrated in fresh weighed products: premium chicken cuts (breast ₪540K, drumsticks ₪432K, thighs ₪378K), strawberries ₪414K, and קוד כללי (a catch-all SKU worth splitting into real items).
- Fixing cost capture for the top ~10 chicken/produce SKUs recovers visibility over most of the ₪9.2M. These items are rightly excluded from all margin math elsewhere.
- qty mixes kg and units — indicative only.
</notes>
</doclet>

---

## מלאי ומחסן

<doclet id="Q16" label="מלאי שלילי" status="VERIFIED">
<question>אילו פריטים מציגים יתרת מלאי שלילית, שמצביעה על בעיית נתונים או גניבה?</question>
<sql>
-- Negative on-hand ranked by severity; artifact vs suspicious real-product split.
SELECT
  s.Itra qty, trim(p.Nm) item, trim(st.Nm) store, trim(d.Nm) dept,
  CASE WHEN regexp_matches(p.Nm,'שקית|פקדון|פיקדון|מארז|משטח|מיכל|בקבוק ריק|ארגז')
       THEN 'artifact' ELSE 'suspicious' END kind
FROM big.Prt_ItrotStore_Yomi s
JOIN big.Prt p ON p.C=s.Prt
JOIN big.Store st ON st.C=s.Store AND st.SnifC>0
LEFT JOIN big.Departments d ON d.C=p.DepartmentC
WHERE s.Itra<0
ORDER BY s.Itra ASC LIMIT 20;
-- Worst SUSPICIOUS (real-product) negatives: add
--   AND NOT regexp_matches(p.Nm,'שקית|פקדון|פיקדון|מארז|משטח|מיכל|בקבוק ריק|ארגז')
</sql>
<notes>
- 59,113 of 262,092 snapshot rows are negative (22.6%). Worst overall = שקית לקופה גני תקווה −466,539 — all top rows are checkout bags = process artifacts (register-sold, never received), NOT theft.
- Worst real-product negatives are almost entirely weighed produce (potatoes −32K kg, cherry tomatoes, herbs) = PLU/weighing-station process gaps. The only unit-good in the top set is Coca-Cola Zero at גני תקווה (−15,772) — a receiving/scan gap worth investigating.
- Single-day snapshot (2026-06-28); real branches only; magnitudes comparable within an item only (kg vs units).
- Cannot distinguish theft from receiving-error without receiving data; "suspicious" = real sellable product with negative on-hand, the best available signal.
</notes>
</doclet>

<doclet id="Q17" label="עודף מלאי" status="VERIFIED">
<question>מה יושב במלאי ולא נמכר 60+ ימים וכובל מזומן?</question>
<sql>
-- No stock history -> reframe: current positive stock with ZERO sales in last 60 days
-- (2026-04-29..2026-06-28), valued at latest item×store cost = tied-up cash.
WITH cost AS (
  SELECT ItemID, StoreID, arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE FinalRegularCostPrice>0) c
  FROM big.DailyPriceCost GROUP BY ItemID, StoreID),
sales60 AS (
  SELECT prt, store, SUM(qty) q FROM big.f WHERE d >= DATE '2026-04-29' GROUP BY 1,2)
SELECT trim(p.Nm) item, trim(st.Nm) store, ROUND(s.Itra,1) stock,
  ROUND(s.Itra*c.c) tied_cash
FROM big.Prt_ItrotStore_Yomi s
JOIN big.Prt p ON p.C=s.Prt AND p.ArchiveDate IS NULL
JOIN big.Store st ON st.C=s.Store AND st.SnifC>0
JOIN cost c ON c.ItemID=s.Prt AND c.StoreID=s.Store
LEFT JOIN sales60 f ON f.prt=s.Prt AND f.store=s.Store
WHERE s.Itra>0 AND COALESCE(f.q,0)<=0
ORDER BY tied_cash DESC LIMIT 20;
-- Chain total: 10,926 item×store lines, ₪3,511,463 tied cash.
</sql>
<notes>
- Reframed (no stock history): "unsold 60+ days" = current positive on-hand with zero sales in the last 60 days. Active items only (discontinued handled in Q20). Valued at latest positive item×store cost.
- Top line is the מרלוג-דנלוג warehouse holding 54,197 units of MUTTI crushed tomatoes (₪677K) — central bulk stock, not shelf overstock; read warehouses separately.
- אנגוס grill kits and strawberries at large qty with zero 60-day sales are genuine cash traps (strawberries possibly an unreconciled count — see Q23).
- Single-day snapshot; Itra>0 only; uncosted lines contribute stock but not ₪.
</notes>
</doclet>

<doclet id="Q18" label="חוסרים" status="VERIFIED">
<question>אילו פריטים מהירי-תנועה קרובים לאפס מלאי כרגע?</question>
<sql>
-- Fast movers (daily rate >= 5 over last 89d) whose on-hand covers <= 2 days.
WITH r AS (
  SELECT prt, store, SUM(qty)/89.0 rate
  FROM big.f WHERE d >= DATE '2026-04-01' AND qty>0 GROUP BY 1,2 HAVING SUM(qty)/89.0 >= 5)
SELECT trim(p.Nm) item, trim(st.Nm) store, ROUND(s.Itra,1) stock,
  ROUND(r.rate,1) daily_rate, ROUND(s.Itra/r.rate,2) days_cover
FROM r
JOIN big.Prt_ItrotStore_Yomi s ON s.Prt=r.prt AND s.Store=r.store
JOIN big.Prt p ON p.C=s.Prt
JOIN big.Store st ON st.C=s.Store AND st.SnifC>0
WHERE s.Itra>0 AND s.Itra/r.rate <= 2
ORDER BY r.rate DESC LIMIT 20;
</sql>
<notes>
- Fast mover = ≥5 units-or-kg/day over the last 89 days (2026-04-01→06-28, ends at the snapshot day so cover = "right now"); "near zero" = ≤2 days of cover. Both sides of the ratio share the item's own unit — kg/unit-safe.
- Results are the expected high-velocity staples: watermelon, 3% milk, cottage cheese, onions. Daily-replenished perishables at sub-2-day cover are partly normal — but cottage at 0.27 days ≈ 2 hours of demand flags real stockout risk.
- Flat 89-day average rate — no weekday/promo modeling; promo items' true stockout timing may differ.
</notes>
</doclet>

<doclet id="Q19" label="פחת" status="PARTIAL">
<question>איפה המלאי הרשום לא תואם למה שנמכר בפועל, מה שמצביע על אובדן?</question>
<sql>
-- PARTIAL: no receiving data => true shrink (received - sold - onhand) is UNCOMPUTABLE.
-- Proxy: negative on-hand on PACKAGED (unit-sold) ACTIVE goods, valued at cost.
-- Weighed produce (dept 11/12) & artifacts (bags/deposits) excluded as known non-shrink noise.
WITH cost AS (
  SELECT ItemID, StoreID, arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE FinalRegularCostPrice>0) c
  FROM big.DailyPriceCost GROUP BY ItemID, StoreID)
SELECT trim(p.Nm) item, trim(st.Nm) store, trim(d.Nm) dept,
  ROUND(s.Itra,1) neg_stock, ROUND(-s.Itra*c.c) loss_proxy_ils
FROM big.Prt_ItrotStore_Yomi s
JOIN big.Prt p ON p.C=s.Prt AND p.ArchiveDate IS NULL
JOIN big.Store st ON st.C=s.Store AND st.SnifC>0
LEFT JOIN big.Departments d ON d.C=p.DepartmentC
JOIN cost c ON c.ItemID=s.Prt AND c.StoreID=s.Store
WHERE s.Itra<0 AND p.DepartmentC NOT IN (11,12) AND s.Itra = FLOOR(s.Itra)
  AND NOT regexp_matches(p.Nm,'שקית|פקדון|פיקדון|מארז|משטח|מיכל|ארגז')
ORDER BY loss_proxy_ils DESC LIMIT 20;
-- Chain total proxy: 10,965 lines, ₪4,273,606.
</sql>
<notes>
- Shrink = received − sold − on-hand; receiving data does not exist, so true shrink is uncomputable → proxy measures one side: where cumulative sales exceeded recorded receipts enough to drive on-hand negative, valued at cost (₪4.27M across 10,965 lines).
- Cannot show: losses on items still positive; whether a gap is theft, unrecorded receiving (bread/bakery delivered without receipt docs dominates the top), spoilage write-off, or scan error. Direction only.
- Noise controls: weighed produce (depts 11/12) and bag/deposit artifacts excluded; integer-qty heuristic keeps packaged goods.
</notes>
</doclet>

<doclet id="Q20" label="מלאי מת" status="VERIFIED">
<question>אילו פריטים סומנו כ"הפסק-מכירה" אך עדיין נושאים מלאי שצריך לפנות?</question>
<sql>
-- Discontinued (ArchiveDate NOT NULL) items still carrying positive on-hand, valued.
WITH cost AS (
  SELECT ItemID, arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE FinalRegularCostPrice>0) c
  FROM big.DailyPriceCost GROUP BY ItemID)
SELECT trim(p.Nm) item, CAST(p.ArchiveDate AS DATE) arch, ROUND(SUM(s.Itra),1) qty,
  ROUND(SUM(s.Itra)*ANY_VALUE(c.c)) stock_val
FROM big.Prt_ItrotStore_Yomi s
JOIN big.Prt p ON p.C=s.Prt AND p.ArchiveDate IS NOT NULL
JOIN big.Store st ON st.C=s.Store AND st.SnifC>0
JOIN cost c ON c.ItemID=s.Prt
WHERE s.Itra>0
  AND NOT regexp_matches(p.Nm,'לא קיים|היטל|לא במגוון|פריט חדש')
GROUP BY 1,2 ORDER BY stock_val DESC LIMIT 20;
</sql>
<notes>
- "הפסק מכירה" = Prt.ArchiveDate NOT NULL, still Itra>0 at real branches: 135 discontinued items (191 item×store lines).
- Two populations: (1) placeholder master rows (פריט לא קיים 22,336 "units", היטל מס קנייה 15,556 — system stubs, excluded via regex); (2) real dead stock = seasonal perishables archived Nov-2025–Feb-2026 (figs, grapes, pineapple, chestnuts, strawberries).
- The genuine to-clear list is small and low-value (top ₪3,799) — no large discontinued-inventory overhang.
- Cost coverage on archived items is only ~20% (they lack recent price rows) — ₪ figures are lower bounds; item-level cost fallback used (any store).
</notes>
</doclet>

<doclet id="Q21" label="תזמון הזמנה" status="VERIFIED">
<question>אילו פריטים צריך להזמין השבוע לפי קצב המכירה?</question>
<sql>
-- Reorder-this-week = cover < 7 days at the last-89d rate, movers >= 3/day. Top-up to 7 days.
WITH r AS (
  SELECT prt, store, SUM(qty)/89.0 rate
  FROM big.f WHERE d >= DATE '2026-04-01' AND qty>0 GROUP BY 1,2 HAVING SUM(qty)/89.0 >= 3)
SELECT trim(p.Nm) item, trim(st.Nm) store, ROUND(s.Itra,1) stock,
  ROUND(r.rate,1) daily_rate, ROUND(s.Itra/r.rate,1) days_cover,
  CEIL(r.rate*7 - s.Itra) suggest_order_qty
FROM r
JOIN big.Prt_ItrotStore_Yomi s ON s.Prt=r.prt AND s.Store=r.store
JOIN big.Prt p ON p.C=s.Prt AND p.ArchiveDate IS NULL
JOIN big.Store st ON st.C=s.Store AND st.SnifC>0
WHERE s.Itra>0 AND s.Itra/r.rate < 7
ORDER BY r.rate DESC LIMIT 20;
-- Scope: 1,142 active item×store lines below the 7-day reorder point (660 distinct items).
</sql>
<notes>
- Reorder threshold = 7 days of cover (weekly cycle + short lead time); suggest_order_qty = max(rate×7 − stock, 0). Documented and tunable. Movers ≥3/day keeps the list actionable (1,142 lines / 660 items).
- Dominated by daily perishables/staples (milk, watermelon, cottage) — exactly what a weekly reorder view should surface.
- Filter out פקדון/deposit rows before handing buyers the list — deposits move with beverage volume but aren't independently ordered.
- Flat average rate; promo/holiday demand and pack sizes (MOQ) not modeled — round to pack size in practice.
</notes>
</doclet>

<doclet id="Q22" label="שווי מלאי" status="VERIFIED">
<question>מה השווי הכולל של המלאי בכל סניף כרגע?</question>
<sql>
-- Stock value per store = SUM(Itra × latest positive cost), Itra>0 only.
-- Cost = latest item×store cost; fall back to latest item-level cost if store-specific missing.
WITH cost AS (
  SELECT ItemID, StoreID, arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE FinalRegularCostPrice>0) c
  FROM big.DailyPriceCost GROUP BY ItemID, StoreID),
icost AS (
  SELECT ItemID, arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE FinalRegularCostPrice>0) c
  FROM big.DailyPriceCost GROUP BY ItemID)
SELECT trim(st.Nm) branch,
  ROUND(SUM(s.Itra * COALESCE(c.c, ic.c)) FILTER (WHERE COALESCE(c.c,ic.c) IS NOT NULL)) stock_value,
  COUNT(*) FILTER (WHERE s.Itra>0) pos_items,
  ROUND(100.0*COUNT(*) FILTER (WHERE COALESCE(c.c,ic.c) IS NOT NULL)/COUNT(*),1) cost_cov_pct
FROM big.Prt_ItrotStore_Yomi s
JOIN big.Store st ON st.C=s.Store AND st.SnifC>0
LEFT JOIN cost c ON c.ItemID=s.Prt AND c.StoreID=s.Store
LEFT JOIN icost ic ON ic.ItemID=s.Prt
WHERE s.Itra>0
GROUP BY 1 ORDER BY stock_value DESC;
</sql>
<notes>
- Value = Itra × latest positive cost, Itra>0 and cost known only. Item-level fallback lifts coverage from 95.3% to 98.5-99.2% at all real branches; uncosted lines are dropped, so figures are slightly conservative.
- Total priced stock ≈ ₪19.7M across 14 stock-holding locations. Top: אם המושבות ₪4.01M, גני תקווה ₪3.81M — matches the sales ranking.
- Two WAREHOUSES appear despite SnifC>0 (מחסן מרלוג-דנלוג ₪976K in 31 SKUs; מרלו"ג פ"ת ₪62K) — central inventory, not shelves; read separately.
- ₪ value is unit-safe and additive; quantities are not (kg/unit mix).
</notes>
</doclet>

<doclet id="Q23" label="סיכון מתכלים" status="VERIFIED">
<question>אילו פריטים מתכלים נמצאים בעודף ביחס לקצב המכירה היומי שלהם?</question>
<sql>
-- Perishable (fresh) depts: 11,12 produce; 23 fresh fish; 194 dairy&eggs; 197 chilled packaged; 214 fresh meat.
-- Overstock = days_cover > 14 (far beyond fresh shelf life). Rank by tied cash.
WITH cost AS (
  SELECT ItemID, StoreID, arg_max(FinalRegularCostPrice, DateDoc) FILTER (WHERE FinalRegularCostPrice>0) c
  FROM big.DailyPriceCost GROUP BY ItemID, StoreID),
r AS (
  SELECT prt, store, SUM(qty)/89.0 rate
  FROM big.f WHERE d >= DATE '2026-04-01' AND qty>0 GROUP BY 1,2 HAVING SUM(qty)>0)
SELECT trim(p.Nm) item, trim(st.Nm) store, trim(d.Nm) dept,
  ROUND(s.Itra,1) stock, ROUND(r.rate,2) daily_rate,
  ROUND(s.Itra/r.rate,1) days_cover, ROUND(s.Itra*c.c) tied_cash
FROM r
JOIN big.Prt_ItrotStore_Yomi s ON s.Prt=r.prt AND s.Store=r.store
JOIN big.Prt p ON p.C=s.Prt AND p.ArchiveDate IS NULL
JOIN big.Store st ON st.C=s.Store AND st.SnifC>0
JOIN big.Departments d ON d.C=p.DepartmentC
JOIN cost c ON c.ItemID=s.Prt AND c.StoreID=s.Store
WHERE s.Itra>0 AND p.DepartmentC IN (11,12,23,194,197,214)
  AND s.Itra/r.rate > 14
ORDER BY tied_cash DESC LIMIT 20;
</sql>
<notes>
- Perishable = fresh departments by name (produce, fresh fish, dairy&eggs, chilled, fresh meat); frozen deliberately excluded. Threshold: >14 days cover (fresh shelf life ~3-7 days). Same-unit ratio (kg both sides) is valid.
- CRITICAL: top rows show physically impossible cover (534-2,913 days) on produce that sells hundreds/day chain-wide — verified the RATE is real, so the anomaly is the ON-HAND (e.g. 28,723 kg potatoes at one store): inflated/unreconciled counts, the same weighing-station family as Q16's negatives.
- So this doclet doubles as a data-quality flag: the biggest "perishable overstock by cash" items need a physical re-count before acting. Strawberries at גני תקווה (58 days) are the most plausibly-real overstock.
</notes>
</doclet>

---

## מבצעים ותמחור

<doclet id="Q24" label="החזר על מבצע" status="VERIFIED">
<question>האם המבצעים של החודש שעבר באמת הגדילו כמות, או רק הנחו מכירות שהיו קורות ממילא?</question>
<sql>
-- Last full month = 2026-05. Per item promoted in May-2026, compare qty/day during the
-- promo month vs the item's OWN non-promo baseline months (>=2). Classify by uplift ratio.
WITH im AS (
  SELECT prt, ym, SUM(qty) qty, SUM(net) net, COUNT(DISTINCT d) nd, MAX(promo::INT) hp
  FROM big.f WHERE d>='2024-01-01' AND qty>0 GROUP BY prt, ym
),
pm AS (SELECT DISTINCT prt FROM im WHERE ym=202605 AND hp=1),
b AS (
  SELECT im.prt,
    SUM(im.qty) FILTER(WHERE im.ym=202605)/NULLIF(SUM(im.nd) FILTER(WHERE im.ym=202605),0) may_qpd,
    SUM(im.net) FILTER(WHERE im.ym=202605) may_net,
    SUM(im.qty) FILTER(WHERE im.hp=0)/NULLIF(SUM(im.nd) FILTER(WHERE im.hp=0),0) base_qpd,
    SUM(im.nd) FILTER(WHERE im.ym=202605) may_nd,
    SUM(CASE WHEN im.hp=0 THEN 1 ELSE 0 END) bm
  FROM im JOIN pm USING(prt) GROUP BY im.prt
),
c AS (SELECT *, may_qpd/NULLIF(base_qpd,0) ratio, (may_qpd-base_qpd)*may_nd incremental_units
      FROM b WHERE bm>=2 AND base_qpd>0)
SELECT
  CASE WHEN ratio>=2 THEN '1_strong_uplift(>=2x)' WHEN ratio>=1.2 THEN '2_moderate(1.2-2x)'
       WHEN ratio>=0.9 THEN '3_flat(0.9-1.2x)' ELSE '4_declined(<0.9x)' END tier,
  COUNT(*) items, ROUND(SUM(may_net)/1e3,0) may_net_K,
  ROUND(100.0*SUM(may_net)/SUM(SUM(may_net)) OVER(),1) net_share_pct,
  ROUND(MEDIAN(ratio),2) median_ratio, ROUND(SUM(incremental_units)/1e3,1) incr_units_K
FROM c GROUP BY tier ORDER BY tier;
</sql>
<notes>
- Verdict: mixed. ~65% of May promo revenue (1,762 items) came with genuine volume lift (median 1.43-2.56×); ~34% (1,945 items, flat+declined tiers) showed NO real uplift — those promos discounted sales that would have happened anyway. The declined tier is net-negative (−41.5K units).
- Baseline = the item's OWN months with no promo line (≥2 such months required). Uplift = May qty/day ÷ baseline qty/day — per-item, same unit, kg-safe.
- qty>0 excludes returns (−0.61% of net, immaterial); free giveaway lines kept in qty (real promo volume). Uses big.f.promo, no bridge dependency.
- Limitation: baseline months span 2024-2026, so seasonal items can show "uplift" that is seasonality; causality is associational.
</notes>
</doclet>

<doclet id="Q25" label="מרווח מבצע" status="VERIFIED">
<question>אילו מבצעים נמכרו טוב אך הרסו לי את המרווח?</question>
<sql>
-- Per MivzaNo (2025+): promo revenue + depth from KupaDoc_Lines; margin via per-prt unit cost
-- from big.f; compared to the SAME items' full-price margin. Ranked by margin destruction.
WITH pcost AS (
  SELECT prt, SUM(cogs)/NULLIF(SUM(qty),0) unit_cost,
    SUM(net) FILTER(WHERE promo=false AND disc_pct=0) fp_net,
    SUM(cogs) FILTER(WHERE promo=false AND disc_pct=0) fp_cogs
  FROM big.f WHERE d>='2025-01-01' AND cost IS NOT NULL GROUP BY prt
),
mp AS (
  SELECT l.MivzaNo mz, l.PrtC prt, SUM(l.Scm-l.VatAmount) pnet, SUM(l.Cmt) pqty,
    SUM((l.Scm-l.VatAmount)*l.AczDisLine) FILTER(WHERE l.AczDisLine BETWEEN 0 AND 100) dnum,
    SUM(l.Scm-l.VatAmount)               FILTER(WHERE l.AczDisLine BETWEEN 0 AND 100) dden
  FROM big.KupaDoc_Lines l JOIN big.KupaDoc_Header h ON l.KupaDocC=h.C
  WHERE l.MivzaNo>0 AND h.DateDoc>='2025-01-01' GROUP BY 1,2
),
mz AS (
  SELECT mp.mz, SUM(mp.pnet) promo_net,
    SUM(mp.pnet - COALESCE(pc.unit_cost,0)*mp.pqty) FILTER(WHERE pc.unit_cost IS NOT NULL) promo_gp,
    SUM(mp.pnet) FILTER(WHERE pc.unit_cost IS NOT NULL) promo_net_costed,
    SUM(mp.dnum)/NULLIF(SUM(mp.dden),0) depth,
    SUM(pc.fp_net) fp_net, SUM(pc.fp_cogs) fp_cogs, COUNT(DISTINCT mp.prt) nprt
  FROM mp LEFT JOIN pcost pc ON mp.prt=pc.prt GROUP BY mp.mz
)
SELECT mz, ROUND(promo_net/1e3,0) promo_net_K, nprt, ROUND(depth,1) depth_pct,
  ROUND(100.0*promo_gp/NULLIF(promo_net_costed,0),1) promo_margin_pct,
  ROUND(100.0*(fp_net-fp_cogs)/NULLIF(fp_net,0),1) fullprice_margin_pct
FROM mz WHERE promo_net>150000 AND fp_net>0
ORDER BY (100.0*(fp_net-fp_cogs)/NULLIF(fp_net,0)) - (100.0*promo_gp/NULLIF(promo_net_costed,0)) DESC
LIMIT 20;
</sql>
<notes>
- Margin destroyers: MivzaNo 21278 (₪177K at 53% depth) collapses margin 50%→−18.3% (68pt loss); 19445 drops 38.4%→4.0%; 19025 55%→26.2%. Others (16829, 15269) run −23% on promo but their items are near-break-even at full price too — structural loss-leaders, not promo-caused.
- MivzaNo lives only on KupaDoc_Lines (big.f has just the promo bool) → revenue/depth from raw lines; net = Scm−VatAmount; depth = revenue-weighted AczDisLine with the BETWEEN 0 AND 100 sentinel filter.
- Lines carry no cost → unit cost borrowed per-prt from big.f (cogs/qty; cost is a prt attribute). Verified 100% of promo net has a costed prt. Full-price margin = same prts' promo=false AND disc_pct=0 lines.
- No promo master exists — MivzaNo is number-only, period inferred from line appearances. A prt under several MivzaNo is costed at its period-average unit cost (smoothing).
</notes>
</doclet>

<doclet id="Q26" label="כיסוי מבצעים" status="VERIFIED">
<question>כמה מסך ההכנסה מגיע מפריטים מוזלים מול מחיר מלא?</question>
<sql>
-- Quarterly trend (2024+): discounted revenue share (any disc), formal-promo share
-- (MivzaNo>0), and revenue-weighted average depth.
SELECT (ym//100) yr, ((ym%100-1)//3)+1 q,
  ROUND(SUM(net)/1e6,2) net_M,
  ROUND(100.0*SUM(CASE WHEN disc_pct>0 THEN net ELSE 0 END)/SUM(net),1) disc_rev_share_pct,
  ROUND(100.0*SUM(CASE WHEN promo     THEN net ELSE 0 END)/SUM(net),1) formal_promo_share_pct,
  ROUND(SUM(CASE WHEN disc_pct>0 THEN disc_pct*net ELSE 0 END)
        /NULLIF(SUM(CASE WHEN disc_pct>0 THEN net ELSE 0 END),0),1) avg_depth_pct
FROM big.f WHERE d>='2024-01-01' GROUP BY 1,2 ORDER BY 1,2;
</sql>
<notes>
- ~1/4 of revenue is discounted (21.8-25.4%, stable); formal promo (MivzaNo attached) = 12.8-16.6%; the gap = non-promo discounts (manual/club/markdowns). Depth trends UP from the Q4-2024 low (10.8%) to Q1-2026 (17.3%) — discounting is intensifying.
- Two share definitions kept separate on purpose: "discounted" = disc_pct>0 (any cut); "formal promo" = promo flag. Depth = revenue-weighted average over discounted lines only — never summed.
- Full-window anchors reproduce exactly: disc share 24.3%, promo share 14.5%, depth 13.7%, net ₪691.3M. Free items (disc_pct=100) legitimately count as discounted. Partial June affects ₪ levels, not the % ratios.
</notes>
</doclet>

<doclet id="Q27" label="תחרותיות מחיר" status="VERIFIED">
<question>האם מחירי המדף שלי אחידים בין הסניפים, או שסניף אחד חורג?</question>
<sql>
-- Avg NET unit price per (prt,store), FULL-PRICE lines only (promo=false AND disc_pct=0),
-- 2025+, established stores. Rank stores by revenue-weighted signed deviation from each
-- item's cross-store median (>=8 stores).
WITH est AS (SELECT store FROM big.f WHERE d>='2024-01-01' GROUP BY store HAVING SUM(net)>10e6),
ps AS (
  SELECT prt, store, SUM(net)/SUM(qty) up, SUM(net) net
  FROM big.f WHERE d>='2025-01-01' AND promo=false AND disc_pct=0 AND qty>0
    AND store IN (SELECT store FROM est)
  GROUP BY prt, store HAVING SUM(qty)>=20 AND SUM(net)/SUM(qty)>0
),
med AS (SELECT prt, MEDIAN(up) m FROM ps GROUP BY prt HAVING COUNT(*)>=8 AND MEDIAN(up)>0),
dev AS (SELECT ps.store, ps.net, (ps.up-med.m)/med.m reldev
        FROM ps JOIN med USING(prt) WHERE ABS((ps.up-med.m)/med.m) < 1)
SELECT d.store, s.Nm,
  ROUND(100.0*SUM(reldev*net)/SUM(net),2) syst_dev_pct,
  ROUND(100.0*SUM(CASE WHEN ABS(reldev)>0.03 THEN net ELSE 0 END)/SUM(net),0) pct_rev_offmedian
FROM dev d JOIN big.Store s ON d.store=s.C GROUP BY d.store, s.Nm ORDER BY syst_dev_pct DESC;
</sql>
<notes>
- Prices are mostly uniform: 7 of 9 stores within ±0.5% of chain median; median cross-store spread per item just 2.9%. BUT store 27 (בר כוכבא) systematically underprices by 4.48% — driven entirely by FRESH PRODUCE (bananas −23%, cucumber −34%, onion −41%, avocado −41%): a produce-pricing/weighing policy difference. Store 24 has the most dispersed pricing (23% of full-price revenue >3% off median); store 13 is the high outlier (+1.01%).
- NET unit price (net/qty), identical items, full-price lines only — isolates list price from promo mix. Deviation vs the item's own cross-store median, revenue-weighted; item must sell full-price in ≥8 stores with ≥20 units.
- Guard |dev|<100% drops a handful of data-error unit prices. Tiny new stores and non-retail nodes excluded.
- Note: this exposes בר כוכבא's low margin (Q9) as at least partly a produce-pricing choice.
</notes>
</doclet>

<doclet id="Q28" label="עומק הנחה" status="VERIFIED">
<question>אילו פריטים מוזלים בעומק הגבוה ביותר, והאם העומק מוצדק?</question>
<sql>
-- Deepest-discounted material items (2024+, discounted net >₪50K, cost complete).
-- "Justified" = still margin-positive after the cut.
WITH d AS (
  SELECT prt, SUM(net) disc_net, SUM(cogs) disc_cogs, SUM(disc_pct*net)/SUM(net) depth_wtd,
    COUNT(*) FILTER(WHERE cost IS NULL) null_cost_lines
  FROM big.f WHERE d>='2024-01-01' AND disc_pct>0 AND qty>0
  GROUP BY prt HAVING SUM(net)>50000
)
SELECT d.prt, p.Nm, ROUND(depth_wtd,1) depth_pct, ROUND(disc_net/1e3,0) disc_net_K,
  ROUND(100.0*(disc_net-disc_cogs)/NULLIF(disc_net,0),1) disc_margin_pct,
  CASE WHEN (disc_net-disc_cogs)>0 THEN 'justified(+margin)' ELSE 'UNJUSTIFIED(loss)' END verdict
FROM d JOIN big.Prt p ON d.prt=p.C
WHERE null_cost_lines=0 ORDER BY depth_wtd DESC LIMIT 20;
</sql>
<notes>
- Deepest cuts run 43-52% depth. Most stay profitable (energy drink 33.5% margin, reusable bags 44.5%, hot cups 42.4%) = justified. True loss-makers: imported pineapple (−15.2% at 52% depth) and עלית snack mix (−38.3% at 44.6%). Of 62 material items with depth>30%: 47 justified, 15 loss-making.
- Depth = revenue-weighted clean disc_pct; margin computed on the DISCOUNTED lines only — the realized margin of the promo, not blended.
- Items with ANY cost-NULL discounted line excluded entirely (never zero-costed). Free items (disc_pct=100) legitimately deepen depth and push margin negative — that's the signal.
- Materiality floor ₪50K discounted net.
</notes>
</doclet>

<doclet id="Q29" label="קניבליזציה" status="PARTIAL">
<question>האם מבצע על פריט אחד פשוט גנב מכירות מפריט דומה במחיר מלא?</question>
<sql>
-- Clean exemplar via PrtGroups: group 511 (egg trays, tight substitute set). Promo item 42327
-- (Arizon L 12-tray, on promo 11 of 17 months). Compare group-mates' FULL-PRICE qty/day,
-- the item's own qty/day, and the whole group's qty/day, promo vs non-promo months.
WITH im AS (
  SELECT prt, ym, SUM(qty) qty,
    SUM(CASE WHEN promo=false AND disc_pct=0 THEN qty ELSE 0 END) fp_qty,
    MAX(promo::INT) hp, COUNT(DISTINCT d) nd
  FROM big.f WHERE d>='2025-01-01' AND grp=511 AND qty>0 GROUP BY prt, ym
),
pm AS (SELECT ym, hp FROM im WHERE prt=42327),
agg AS (
  SELECT im.ym,
    SUM(im.fp_qty) FILTER(WHERE im.prt<>42327)/MAX(im.nd) mates_fp_qpd,
    SUM(im.qty)    FILTER(WHERE im.prt=42327)/MAX(im.nd)  l_qpd,
    SUM(im.qty)/MAX(im.nd) total_grp_qpd
  FROM im GROUP BY im.ym
)
SELECT CASE WHEN pm.hp=1 THEN 'L-tray ON promo' ELSE 'L-tray full price' END phase,
  COUNT(*) nmonths,
  ROUND(AVG(a.mates_fp_qpd),1) mates_fullprice_qpd,
  ROUND(AVG(a.l_qpd),1) L_tray_qpd,
  ROUND(AVG(a.total_grp_qpd),1) whole_group_qpd
FROM agg a JOIN pm USING(ym) GROUP BY phase ORDER BY phase;
</sql>
<notes>
- Clear cannibalization in the exemplar: on promo the egg tray's own sales quadruple (66.6→275.2/day, +208), the whole egg category is FLAT (1054→1051), and full-price group-mates drop 985→770 (−215/day). The promo's gain is almost exactly the substitutes' loss — buyers moved between trays, the category didn't grow.
- Method: PrtGroups as the substitute proxy; within-item design (same group-mates in promo vs non-promo months) controls the "fewer non-promo items" artifact of naive correlations. Group 511 chosen for its substantial always-full-price core; broad groups (vegetables, cheeses) have too-small full-price cores for reliable reads.
- A group-wide correlation scan of mid-size groups showed consistently negative promo-vs-mates correlations (−0.86 to −0.93) — directionally supporting cannibalization category-wide.
- PARTIAL: causal identification impossible from observational months (season/holiday demand co-moves); the −22% mate drop is association. Template: swap grp/prt ids to test any other suspected pair.
</notes>
</doclet>

---

## לקוחות ונאמנות

<doclet id="Q30" label="ערך לקוח" status="VERIFIED">
<question>מי הלקוחות עם ההוצאה הגבוהה ביותר, ומה הם קונים?</question>
<sql>
-- TIER A: top identified customers long-term (2024+), named Idx accounts (Type 1 businesses
-- + Type 900 individual house-accounts), with each one's top department by net
WITH ident AS (
  SELECT i.C, i.Nm, i.Type FROM big.Idx i
  WHERE i.Type IN (1,900)
    AND i.Nm NOT LIKE 'לקוח כללי%' AND i.Nm NOT LIKE '%וולט%' AND i.Nm NOT LIKE 'צריכה עצמית%'
),
top AS (
  SELECT f.cust, SUM(f.net) net FROM big.f f JOIN ident n ON n.C=f.cust
  WHERE f.d>=DATE '2024-01-01' GROUP BY 1 ORDER BY net DESC LIMIT 20
),
td AS (
  SELECT f.cust, d.Nm dept, ROW_NUMBER() OVER(PARTITION BY f.cust ORDER BY SUM(f.net) DESC) rn
  FROM big.f f JOIN top t ON t.cust=f.cust LEFT JOIN big.Departments d ON d.C=f.dept
  WHERE f.d>=DATE '2024-01-01' GROUP BY 1,2
)
SELECT n.Nm customer, n.Type, ROUND(t.net,0) net_2024plus, td.dept top_dept
FROM top t JOIN ident n ON n.C=t.cust LEFT JOIN td ON td.cust=t.cust AND td.rn=1
ORDER BY t.net DESC;

-- TIER B: top real loyalty cards June-2026, <10 receipts/day (excludes default/house cards)
WITH cards AS (
  SELECT MOADON_NO, COUNT(*) receipts, COUNT(DISTINCT DateDoc) ad, SUM(Scm-ScmMaam) net
  FROM big.KupaDoc_Header
  WHERE DateDoc BETWEEN DATE '2026-06-01' AND DATE '2026-06-28' AND MOADON_NO IS NOT NULL AND MOADON_NO<>0
  GROUP BY 1 HAVING COUNT(*)*1.0/COUNT(DISTINCT DateDoc) < 10
),
top20 AS (SELECT MOADON_NO, receipts, net FROM cards ORDER BY net DESC LIMIT 20),
td AS (
  SELECT f.moadon, d.Nm dept, ROW_NUMBER() OVER(PARTITION BY f.moadon ORDER BY SUM(f.net) DESC) rn
  FROM big.f f JOIN top20 t ON t.MOADON_NO=f.moadon LEFT JOIN big.Departments d ON d.C=f.dept
  WHERE f.d BETWEEN DATE '2026-06-01' AND DATE '2026-06-28' GROUP BY 1,2
)
SELECT t.MOADON_NO card, t.receipts, ROUND(t.net,0) net_june, td.dept top_dept
FROM top20 t LEFT JOIN td ON td.moadon=t.MOADON_NO AND td.rn=1 ORDER BY t.net DESC;
</sql>
<notes>
- Two tiers: Tier A = long-term identified customers by net (2024+); Tier B = June-2026 loyalty cards (the only moadon window).
- KEY: the real identified individual shoppers are Idx **Type 900** named accounts (household names, ~₪137-173 baskets, thousands with 100+ receipts) — NOT Type 1, which is almost entirely B2B. "Identified" = Type IN (1,900) with a real name, excluding 'לקוח כללי%', '%וולט%', 'צריכה עצמית%'.
- Top identified customer is a business (משרדי סופרטל ₪310K, beverages); the rest are loyal households (₪100-139K over 2.5y) buying meat/produce/dairy.
- Real card = moadon averaging <10 receipts/day; cards ≥10/day are per-branch default/desk cards (sequential 301174-301181, 30-58/day) — excluded.
- Only ~35% of revenue is attributable to identified accounts (Q32); the top anonymous buckets are deliberately excluded here.
</notes>
</doclet>

<doclet id="Q31" label="ביצועי זכיין" status="VERIFIED">
<question>אילו זכיינים קונים הכי הרבה, ובאיזו עלות עבורי?</question>
<sql>
-- Franchisee performance = big.DailyPriceCost_Zakyan, the daily per-item cost-billing
-- snapshot to each franchised branch. Rank by billed COST volume.
WITH z AS (
  SELECT z.StoreID, s.Nm store,
    ROUND(SUM(z.TotalCount*z.FinalCostPrice),0) billed_cost,
    ROUND(SUM(z.TotalCount),0) units,
    COUNT(DISTINCT z.DateDoc) billed_days
  FROM big.DailyPriceCost_Zakyan z LEFT JOIN big.Store s ON s.C=z.StoreID
  WHERE z.FinalCostPrice>0
  GROUP BY 1,2
)
SELECT store, billed_cost, units, billed_days, ROUND(billed_cost/units,2) avg_unit_cost
FROM z ORDER BY billed_cost DESC;
</sql>
<notes>
- DailyPriceCost_Zakyan = per-(day, store, item, customer) franchise cost-billing: 174,005 rows, 25 CustomerIDs across 8 StoreIDs, 2025-01-01→2026-06-28. TotalScmAlut/MhrAlut* are all zero — the only live cost signal is FinalCostPrice, so cost = TotalCount × FinalCostPrice.
- The 8 StoreIDs map 1:1 to real branches; each branch's CustomerIDs are its own 'לקוח כללי' buckets — the table bills the franchise operator for the branch's throughput. Ranking by StoreID = ranking franchised branches.
- גני תקווה dominates (₪1.70M billed cost, 320K units); avg unit cost ₪4.3-6.8 across branches. ~13K rows with FinalCostPrice=0 filtered.
- Covers only these 8 branches, starts 2025-01; it is a cost-billing view (no retail-revenue column → not a margin view).
</notes>
</doclet>

<doclet id="Q32" label="תמהיל לקוחות" status="VERIFIED">
<question>כמה מההכנסה מגיעה מלקוחות מזוהים/מועדון מול לקוחות מזדמנים?</question>
<sql>
-- LONG-TERM (2024+) mix by account segment (net = Scm−ScmMaam, main ledger):
SELECT
  CASE
    WHEN i.Nm LIKE 'לקוח כללי%' THEN 'anonymous_bucket'
    WHEN i.Nm LIKE '%וולט%'     THEN 'wolt_delivery'
    WHEN i.Nm LIKE 'צריכה עצמית%' THEN 'self_consumption'
    WHEN i.Type IN (1,900)      THEN 'identified_named'
    ELSE 'other' END seg,
  ROUND(SUM(h.Scm-h.ScmMaam)/1e6,1) net_M,
  ROUND(100.0*SUM(h.Scm-h.ScmMaam)/SUM(SUM(h.Scm-h.ScmMaam)) OVER(),1) pct
FROM big.KupaDoc_Header h LEFT JOIN big.Idx i ON i.C=h.CustomerC
WHERE h.DateDoc>=DATE '2024-01-01' GROUP BY 1 ORDER BY net_M DESC;

-- JUNE-2026 honest loyalty mix (100% carded month): real card vs default/house card
WITH h AS (
  SELECT h.*, hd.receipts_card, hd.ad_card
  FROM big.KupaDoc_Header h
  LEFT JOIN (
    SELECT MOADON_NO, COUNT(*) receipts_card, COUNT(DISTINCT DateDoc) ad_card
    FROM big.KupaDoc_Header
    WHERE DateDoc BETWEEN DATE '2026-06-01' AND DATE '2026-06-28' AND MOADON_NO IS NOT NULL AND MOADON_NO<>0
    GROUP BY 1
  ) hd ON hd.MOADON_NO=h.MOADON_NO
  WHERE h.DateDoc BETWEEN DATE '2026-06-01' AND DATE '2026-06-28'
)
SELECT
  CASE WHEN MOADON_NO IS NULL OR MOADON_NO=0 THEN 'no_card'
       WHEN receipts_card*1.0/ad_card >= 10 THEN 'default_house_card'
       ELSE 'real_loyalty_card' END seg,
  ROUND(SUM(Scm-ScmMaam),0) net,
  ROUND(100.0*SUM(Scm-ScmMaam)/SUM(SUM(Scm-ScmMaam)) OVER(),1) pct
FROM h GROUP BY 1 ORDER BY net DESC;
</sql>
<notes>
- Two lenses. Long-term (2024+): 64.2% anonymous walk-in buckets (₪444.2M) vs 34.9% identified named accounts (₪241.4M) + 0.8% Wolt. June-2026 (the only 100%-carded month): 52.2% real loyalty cards vs 47.8% default/house cards.
- CRITICAL: naive "Type 1 named only" would show identified = 0.1%. The real identified base is Type 900 named individuals (house/charge accounts, ₪240.7M). Segments sum to ₪691.4M = the anchor.
- MOADON go-live handled: before 2026-05-16 there are no cards, so "מועדון vs מזדמן" is undefined historically; June is the defensible window, and default cards (≥10 receipts/day) are separated so "52% loyalty" isn't inflated by register defaults.
- Wolt from main ledger only (no Lk double-count).
</notes>
</doclet>

<doclet id="Q33" label="סימן נטישה" status="VERIFIED">
<question>אילו לקוחות קבועים הפסיקו לקנות ברבעון האחרון?</question>
<sql>
-- Churn among identified regulars: named Idx (Type 1 & 900) who were "regular" in 2025
-- (>=9 active months AND >=24 receipts) but have ZERO activity in Q2-2026.
WITH ident AS (
  SELECT i.C, i.Nm FROM big.Idx i
  WHERE i.Type IN (1,900)
    AND i.Nm NOT LIKE 'לקוח כללי%' AND i.Nm NOT LIKE '%וולט%' AND i.Nm NOT LIKE 'צריכה עצמית%'
),
reg2025 AS (
  SELECT h.CustomerC, COUNT(*) rec, COUNT(DISTINCT strftime(h.DateDoc,'%Y-%m')) mo, ROUND(SUM(h.Scm-h.ScmMaam),0) net
  FROM big.KupaDoc_Header h JOIN ident n ON n.C=h.CustomerC
  WHERE h.DateDoc BETWEEN DATE '2025-01-01' AND DATE '2025-12-31'
  GROUP BY 1 HAVING COUNT(DISTINCT strftime(h.DateDoc,'%Y-%m'))>=9 AND COUNT(*)>=24
),
active_q2 AS (
  SELECT DISTINCT CustomerC FROM big.KupaDoc_Header WHERE DateDoc BETWEEN DATE '2026-04-01' AND DATE '2026-06-28'
)
SELECT n.Nm customer, r.rec rec_2025, r.mo months_2025, r.net net_2025
FROM reg2025 r JOIN ident n ON n.C=r.CustomerC
WHERE r.CustomerC NOT IN (SELECT CustomerC FROM active_q2)
ORDER BY r.net DESC LIMIT 20;
-- Summary: 10,607 regulars in 2025; 234 (2.2%) silent in Q2-2026; ₪1,475,272 of 2025 net at risk.
</sql>
<notes>
- "Regular" = identified named account (Type 1/900) active ≥9 of 12 months in 2025 AND ≥24 receipts (~monthly shopper). "Churned" = zero receipts in Q2-2026 (Apr 1 – Jun 28).
- Result: 234 of 10,607 regulars (2.2%) lapsed, ₪1.48M of prior-year net — an actionable win-back list (top churner: 390 receipts across all 12 months of 2025, then silent).
- MOADON cards deliberately NOT used: capture began 2026-05-16, <2 months of history — too short to define lapse.
- Excludes anonymous buckets/Wolt/self-use (lapse not attributable to a person). Thresholds documented and tunable.
</notes>
</doclet>

<doclet id="Q34" label="הרכב סל" status="VERIFIED">
<question>מה הלקוחות הכי טובים שלי נוהגים לקנות יחד?</question>
<sql>
-- Department-pair co-occurrence within receipts of the best real loyalty cards, June-2026.
WITH real_cards AS (
  SELECT MOADON_NO FROM big.KupaDoc_Header
  WHERE DateDoc BETWEEN DATE '2026-06-01' AND DATE '2026-06-28' AND MOADON_NO IS NOT NULL AND MOADON_NO<>0
  GROUP BY 1
  HAVING COUNT(*)*1.0/COUNT(DISTINCT DateDoc) < 10   -- exclude default/house cards
     AND COUNT(*) >= 8                                -- engaged repeat shoppers
),
receipt_depts AS (                                    -- distinct (receipt, department) pairs
  SELECT DISTINCT l.KupaDocC rid, p.DepartmentC dept
  FROM big.KupaDoc_Header h
  JOIN real_cards rc ON rc.MOADON_NO=h.MOADON_NO
  JOIN big.KupaDoc_Lines l ON l.KupaDocC=h.C
  JOIN big.Prt p ON p.C=l.PrtC
  JOIN big.Departments d ON d.C=p.DepartmentC
  WHERE h.DateDoc BETWEEN DATE '2026-06-01' AND DATE '2026-06-28'
    AND d.Nm NOT LIKE '%לא לפידיון%' AND d.Nm NOT LIKE '%אגרות%' AND d.Nm NOT LIKE '%מיכלים%'
),
pairs AS (
  SELECT a.dept d1, b.dept d2, COUNT(*) baskets_together
  FROM receipt_depts a JOIN receipt_depts b ON a.rid=b.rid AND a.dept<b.dept
  GROUP BY 1,2
)
SELECT d1.Nm dept_a, d2.Nm dept_b, p.baskets_together
FROM pairs p JOIN big.Departments d1 ON d1.C=p.d1 JOIN big.Departments d2 ON d2.C=p.d2
ORDER BY p.baskets_together DESC LIMIT 20;
</sql>
<notes>
- Co-occurrence needs the receipt id (KupaDoc_Lines.KupaDocC → Header.C) — big.f has no receipt id and cannot do this. Distinct (receipt, department) pairs, self-joined with dept_a < dept_b.
- "Best customers" = real June-2026 loyalty cards (<10 receipts/day, ≥8 June receipts) — genuine engaged shoppers; also bounds runtime on the 2.2M June lines.
- Non-product departments excluded (לא לפידיון, אגרות/מיכלים — bags/deposits ranked #2-3 otherwise but aren't "bought").
- Strongest affinities: produce+dairy (16,046 co-baskets), dairy+pantry basics, produce+basics, bread+dairy — the classic staples basket. Department granularity keeps pairs interpretable; item-level needs heavier scoping.
- June-only window (loyalty data doesn't exist earlier); reflects the summer basket of engaged carded shoppers.
</notes>
</doclet>

---

## ספקים ורכש

<doclet id="Q35" label="תלות בספק" status="VERIFIED">
<question>באילו ספקים אני הכי תלוי, ומה החשיפה שלי אם אחד ייפול?</question>
<sql>
WITH fx AS (
  SELECT f.prt, f.dept, f.net, f.cogs, f.cost, p.Spk
  FROM big.f f JOIN big.Prt p ON f.prt = p.C
  WHERE f.d >= DATE '2024-01-01'
)
SELECT s.Nm AS supplier,
  ROUND(SUM(fx.net),0) AS net_rev,
  ROUND(100.0*SUM(fx.net)/SUM(SUM(fx.net)) OVER (),2) AS pct_of_total_net,
  ROUND(100.0*SUM(CASE WHEN fx.cost IS NOT NULL THEN fx.net-fx.cogs END)
        /NULLIF(SUM(CASE WHEN fx.cost IS NOT NULL THEN fx.net END),0),1) AS margin_pct,
  COUNT(DISTINCT fx.prt) AS items,
  COUNT(DISTINCT fx.dept) AS depts
FROM fx JOIN big.Suppliers s ON fx.Spk = s.C
GROUP BY s.Nm ORDER BY net_rev DESC LIMIT 20;
</sql>
<notes>
- Supplier exposure = revenue of items whose Prt.Spk points to the supplier. **Spk resolves 100.0% of 2024+ net revenue** (only 3 of 28,182 traded items unresolved) — the ranking is reliable.
- Top dependency: ביכורי שדה דרום (produce distributor) = **16.5% of total net (₪114M) AND the highest margin (41.6%)** — a single point of failure carrying both the biggest revenue and the margin engine. תנובה חלב 7.2%, שטראוס מצונן 5.3%. אסם-נסטלה is the broadest (957 items, 14 depts).
- margin_pct excludes cost-NULL lines (never zeroed). depts = breadth of exposure. Returns self-net.
</notes>
</doclet>

<doclet id="Q36" label="עלות ספק" status="PARTIAL">
<question>אילו ספקים העלו מחירים הכי הרבה בשנה האחרונה?</question>
<sql>
-- Revenue-weighted supplier cost inflation.
-- DailyPriceCost only spans 202501-202606 (18 mo), so windows are asymmetric:
--   "last 12 months" = 202507-202606  vs  "prior (available)" = 202501-202506 (6 mo).
WITH item_cost AS (
  SELECT ItemID,
    AVG(CASE WHEN DateDoc//100 BETWEEN 202507 AND 202606 THEN FinalRegularCostPrice END) AS cost_last,
    AVG(CASE WHEN DateDoc//100 BETWEEN 202501 AND 202506 THEN FinalRegularCostPrice END) AS cost_prior
  FROM big.DailyPriceCost
  WHERE FinalRegularCostPrice > 0
  GROUP BY ItemID
),
item_rev AS (
  SELECT prt, SUM(net) AS rev FROM big.f
  WHERE d >= DATE '2024-01-01' AND net > 0 GROUP BY prt
),
item_chg AS (
  SELECT ic.ItemID, p.Spk, r.rev,
    (ic.cost_last - ic.cost_prior)/ic.cost_prior AS infl
  FROM item_cost ic
  JOIN big.Prt p ON ic.ItemID = p.C
  JOIN item_rev r ON r.prt = ic.ItemID
  WHERE ic.cost_last > 0 AND ic.cost_prior > 0
)
SELECT s.Nm AS supplier,
  ROUND(100.0*SUM(infl*rev)/SUM(rev),1) AS wtd_cost_infl_pct,
  COUNT(*) AS n_items,
  ROUND(SUM(rev)/1e6,1) AS rev_musd
FROM item_chg JOIN big.Suppliers s ON item_chg.Spk = s.C
GROUP BY s.Nm
HAVING SUM(rev) > 3000000
ORDER BY wtd_cost_infl_pct DESC LIMIT 20;
</sql>
<notes>
- Per-item inflation = (mean cost last-12mo − mean prior)/prior, aggregated per supplier weighted by item net revenue — surfaces cost creep on items that matter, not a naive item average.
- PARTIAL: DailyPriceCost history starts 2025-01 (verified), so the "prior" baseline is only 2025H1 — a true 12-vs-12 comparison is impossible; figures understate full-year moves.
- Mhr_Spk (supplier list price) is NULL for early-2025 rows — FinalRegularCostPrice is the usable series.
- Top movers: לויתן (agricultural) +8.8% on ₪16.3M; biggest ₪ exposure: ביכורי שדה +2.7% on ₪106.5M. Revenue floor ₪3M drops immaterial suppliers. Regular cost only (promo deals not isolated).
</notes>
</doclet>

<doclet id="Q37" label="תנאי תשלום" status="NOT_ANSWERABLE">
<question>אילו ספקים נותנים לי את תנאי התשלום הטובים ביותר, והאם אני מנצל אותם?</question>
<sql>
-- Emptiness / non-materiality proof for PaymentTerms + no payment-timing data exists.
WITH pt AS (SELECT C FROM big.Suppliers WHERE TRIM(COALESCE(PaymentTerms,'')) <> '')
SELECT
  (SELECT COUNT(*) FROM big.Suppliers) AS total_suppliers,
  (SELECT COUNT(*) FROM pt) AS suppliers_with_terms,
  ROUND(100.0*(SELECT COUNT(*) FROM pt)/(SELECT COUNT(*) FROM big.Suppliers),1) AS pct_suppliers,
  ROUND(100.0*SUM(CASE WHEN p.Spk IN (SELECT C FROM pt) THEN f.net ELSE 0 END)
        /SUM(f.net),1) AS pct_net_rev_with_terms
FROM big.f f JOIN big.Prt p ON f.prt = p.C
WHERE f.d >= DATE '2024-01-01';
-- Field census: tot=1671, nonnull=11, distinct=10 free-text values (e.g. "שוטף 45 יום 2")
</sql>
<notes>
- NOT_ANSWERABLE for two independent reasons: (1) PaymentTerms is populated for only 11 of 1,671 suppliers (0.7%; 8.2% of revenue) as free-text — no ranking of "best terms" is possible; the entire top-dependency list (תנובה, ביכורי שדה…) has no terms recorded. (2) "Am I utilizing them" needs accounts-payable / payment-date / DSO data, which does not exist anywhere in this extract (Idx Type 2 is an account list, not a payment ledger).
- The proof query doubles as the monitor: if PaymentTerms ever gets populated, pct_suppliers rises and the question opens up.
</notes>
</doclet>

<doclet id="Q38" label="החזרי ספק" status="NOT_ANSWERABLE">
<question>כמה מגיע לי בהחזרי ספק ותמריצים שעדיין לא גביתי?</question>
<sql>
-- Emptiness proof: SupplierRefund / RewardCharge / OperatingReturn are constant 0 across all 8.96M rows.
SELECT
  COUNT(*) AS rows,
  COUNT(SupplierRefund) AS sr_nonnull, COUNT(DISTINCT SupplierRefund) AS sr_distinct,
  SUM(CASE WHEN SupplierRefund <> 0 THEN 1 ELSE 0 END) AS sr_nonzero,
  COUNT(RewardCharge)  AS rc_nonnull, COUNT(DISTINCT RewardCharge)  AS rc_distinct,
  SUM(CASE WHEN RewardCharge  <> 0 THEN 1 ELSE 0 END) AS rc_nonzero,
  COUNT(OperatingReturn) AS or_nonnull, COUNT(DISTINCT OperatingReturn) AS or_distinct,
  SUM(CASE WHEN OperatingReturn <> 0 THEN 1 ELSE 0 END) AS or_nonzero
FROM big.DailyPriceCost;
</sql>
<notes>
- Proven empty: across all 8,958,997 DailyPriceCost rows, each of the three supplier-incentive columns has exactly 1 distinct value = 0.0 and zero non-zero rows (same in DailyPriceCost_Zakyan). No refund/rebate/reward signal exists anywhere in the extract, and big.f (sales-side) doesn't carry it either.
- A source-data gap, not a query problem — requires the ERP's supplier-agreement / rebate-accrual tables, absent from this pull.
</notes>
</doclet>

<doclet id="Q39" label="ביצועי קניין" status="NOT_ANSWERABLE">
<question>הקטגוריות של איזה קניין מספקות את המרווח הטוב ביותר?</question>
<sql>
-- Part A — buyer-field emptiness proof (the literal question):
SELECT COUNT(*) AS total_suppliers,
  COUNT(UserKanyan) AS uk_nonnull, COUNT(DISTINCT UserKanyan) AS uk_distinct,
  COUNT(TradeHandler) AS th_nonnull, COUNT(DISTINCT TradeHandler) AS th_distinct,
  COUNT(UserAtt) AS ua_nonnull, COUNT(DISTINCT UserAtt) AS ua_distinct
FROM big.Suppliers;
-- -> total=1671, uk_nonnull=0, th_nonnull=14 (5 distinct), ua_nonnull=14 (5 distinct)

-- Part B — actionable PROXY: margin by department (the "buying portfolio" a buyer would own):
SELECT d.Nm AS department,
  ROUND(SUM(f.net)/1e6,1) AS net_musd,
  ROUND(100.0*SUM(CASE WHEN f.cost IS NOT NULL THEN f.net-f.cogs END)
        /NULLIF(SUM(CASE WHEN f.cost IS NOT NULL THEN f.net END),0),1) AS margin_pct,
  COUNT(DISTINCT f.prt) AS items
FROM big.f f JOIN big.Departments d ON f.dept = d.C
WHERE f.d >= DATE '2024-01-01'
GROUP BY d.Nm HAVING SUM(f.net) > 5000000
ORDER BY margin_pct DESC;
</sql>
<notes>
- Literal question NOT_ANSWERABLE: no buyer/קניין taxonomy exists — UserKanyan is 0 non-null across all 1,671 suppliers; TradeHandler/UserAtt cover 0.8% (5 distinct values). Prt/PrtGroups BuyerId also empty. No way to attribute categories to a named buyer.
- Nearest actionable proxy (Part B, fully verified): margin by department — each department is effectively a buying desk. Best: לא מזון/חד-פעמי 43.7%, פירות וירקות 42.0% (and largest at ₪142.5M). Alternative "buying relationship" lens: margin per supplier (Q35).
- Margin excludes cost-NULL lines; ~98.7% of revenue carries cost.
</notes>
</doclet>

---

## קטגוריה ותמהיל מוצרים

<doclet id="Q40" label="תמהיל מחלקות" status="VERIFIED">
<question>איך ההכנסה מתחלקת בין המחלקות, והאם האיזון משתנה?</question>
<sql>
WITH p AS (
  SELECT CASE WHEN d>='2026-01-01' THEN '2026H1' WHEN d>='2025-01-01' THEN '2025' ELSE '2024' END AS per,
         dept, net FROM big.f WHERE d>='2024-01-01'),
agg AS (SELECT per, dept, SUM(net) net FROM p GROUP BY 1,2),
sh AS (SELECT per, dept, 100.0*net/SUM(net) OVER (PARTITION BY per) AS pct FROM agg)
SELECT d.Nm dept,
  ROUND(MAX(CASE WHEN per='2024' THEN pct END),1) s24,
  ROUND(MAX(CASE WHEN per='2025' THEN pct END),1) s25,
  ROUND(MAX(CASE WHEN per='2026H1' THEN pct END),1) s26h1,
  ROUND(MAX(CASE WHEN per='2026H1' THEN pct END)-MAX(CASE WHEN per='2024' THEN pct END),2) ppt_24to26
FROM sh JOIN big.Departments d ON sh.dept=d.C
GROUP BY 1 ORDER BY s25 DESC NULLS LAST;
</sql>
<notes>
- Share = dept net / total net per period (2024, 2025, 2026H1). The mix is remarkably stable; the one clear mover is מוצרי חלב וביצים +1.27ppt (18.6%→19.9%). פירות וירקות is the largest dept (~20-21%) but slid ~0.5ppt. Top-6 departments ≈ 68% of revenue.
- 2026H1 is a partial (half-year) window — the ppt column is directional, not a like-for-like annual delta (seasonal weighting).
- Revenue-based shares only (no cross-item unit sums).
</notes>
</doclet>

<doclet id="Q41" label="צמצום מק&quot;טים" status="VERIFIED">
<question>אילו פריטים כמעט לא נמכרים ואפשר להוריד כדי לפנות מדף?</question>
<sql>
WITH recent AS (SELECT prt, SUM(net) net6 FROM big.f WHERE d>='2026-01-01' GROUP BY prt),
stock AS (SELECT Prt, SUM(Itra) units FROM big.Prt_ItrotStore_Yomi GROUP BY Prt HAVING SUM(Itra)>0)
SELECT COUNT(*) candidate_items,
  ROUND(SUM(GREATEST(r.net6,0))/1e3,1) rev_at_risk_K,
  ROUND(100.0*SUM(GREATEST(r.net6,0))/(SELECT SUM(net) FROM big.f WHERE d>='2026-01-01'),3) pct_h1_rev,
  ROUND(SUM(s.units),0) stock_units
FROM big.Prt p JOIN stock s ON p.C=s.Prt LEFT JOIN recent r ON p.C=r.prt
WHERE p.ArchiveDate IS NULL AND p.DateOpen<DATE '2025-06-28'
  AND p.DepartmentC NOT IN (164,204) AND COALESCE(r.net6,0)<500;
-- For the item-level list: SELECT the same conditions with p.Nm, r.net6, s.units ORDER BY s.units DESC
</sql>
<notes>
- Delist candidate = non-archived, >1yr old (excludes ramping new items), <₪500 net in 2026H1, AND still holding stock (a genuine "free the shelf" list).
- Result: 4,009 items; delisting risks only ₪494K = 0.31% of half-year revenue while freeing ~317K stock units.
- Artifact departments excluded: 164 (אגרות משטחים מיכלים — pallets/deposits) and 204 (לא לפידיון — e.g. loyalty-point redemptions, which alone held 731K "units" and −₪614K and would grossly distort the list).
- GREATEST(net,0) prevents return-heavy items netting negative and understating risk. Stock is the one-day photo. Revenue (not margin) is the right lens for delisting risk.
</notes>
</doclet>

<doclet id="Q42" label="פערי תמהיל" status="VERIFIED">
<question>אילו קבוצות בעלות מרווח גבוה מיוצגות בחסר בתמהיל שלי?</question>
<sql>
WITH tot AS (SELECT SUM(net) tnet FROM big.f WHERE d>='2024-01-01'),
g AS (
  SELECT grp, SUM(net) net,
    100.0*SUM(net-cogs) FILTER (WHERE cost IS NOT NULL)/NULLIF(SUM(net) FILTER (WHERE cost IS NOT NULL),0) margin,
    SUM(net) FILTER (WHERE cost IS NOT NULL) net_ck
  FROM big.f WHERE d>='2024-01-01' GROUP BY grp)
SELECT pg.Nm grp, ROUND(g.margin,1) margin_pct,
  ROUND(g.net/1e6,2) net_M, ROUND(100.0*g.net/tot.tnet,2) rev_share_pct
FROM g JOIN big.PrtGroups pg ON g.grp=pg.C, tot
WHERE g.margin > 31.9 AND g.net_ck > 300000 AND 100.0*g.net/tot.tnet < 1.5
ORDER BY g.margin DESC;
</sql>
<notes>
- Whitespace = margin above chain average (31.9%, cost-known basis) but revenue share <1.5%, with ≥₪300K cost-known revenue so the margin is reliable.
- Found niches at 43-50% margin: מוצרי יום הולדת (50.3%), נרות וגפרורים (48.7%), מזון לבע"ח (47.9%), אביזרים לאירוח (43.3% — the most material at ₪3.6M).
- Interpretation limit: high margin + low share can also mean genuinely low demand; this flags where profitable expansion is POSSIBLE, sizing needs external demand data.
</notes>
</doclet>

<doclet id="Q43" label="קליטת פריט חדש" status="VERIFIED">
<question>איך פריטים שנפתחו לאחרונה נמכרים מול הציפיות?</question>
<sql>
WITH coh AS (
  SELECT C prt, DateOpen,
    CASE WHEN DateOpen>=DATE '2026-01-01' AND DateOpen<DATE '2026-04-01' THEN 'recent_2026Q1'
         WHEN DateOpen>=DATE '2025-01-01' AND DateOpen<DATE '2025-04-01' THEN 'hist_2025Q1' END c
  FROM big.Prt
  WHERE DepartmentC NOT IN (164,204)
    AND ((DateOpen>=DATE '2026-01-01' AND DateOpen<DATE '2026-04-01')
      OR (DateOpen>=DATE '2025-01-01' AND DateOpen<DATE '2025-04-01'))),
w13 AS (
  SELECT c.c coh, c.prt, SUM(f.net) net13
  FROM coh c JOIN big.f f ON f.prt=c.prt
    AND f.d>=c.DateOpen AND f.d < c.DateOpen + INTERVAL '13 weeks'
  GROUP BY 1,2)
SELECT c.c coh, COUNT(*) items_opened, COUNT(w.prt) items_with_sales,
  ROUND(100.0*COUNT(w.prt)/COUNT(*),0) pct_activated,
  ROUND(MEDIAN(COALESCE(w.net13,0)),0) median_net_13wk,
  ROUND(AVG(COALESCE(w.net13,0)),0) mean_net_13wk
FROM coh c LEFT JOIN w13 w ON c.prt=w.prt AND c.c=w.coh
GROUP BY 1 ORDER BY 1;
</sql>
<notes>
- Cohorts by Prt.DateOpen quarter: recent = 2026Q1 vs benchmark = 2025Q1 (same season, controls seasonality). Metric = each item's net in its first 13 weeks since opening (age-aligned windows; zeros included — items opened-but-never-sold count as 0, the honest "vs expectations" read).
- Signal: the 2026Q1 cohort ramps materially WORSE — activation 81%→62%, median 13-week net ₪525→₪180 (cohort sizes matched, 1,303 vs 1,322). New-item introduction quality dropped.
- Right-censoring: late-March-2026 openers have their 13 weeks fully observed but at the data edge — direction robust, magnitudes indicative.
</notes>
</doclet>

<doclet id="Q44" label="תרומת קבוצה" status="VERIFIED">
<question>אילו קבוצות מוצרים תורמות רווח גבוה יחסית למספר המק"טים?</question>
<sql>
WITH g AS (
  SELECT grp,
    SUM(net-cogs) FILTER (WHERE cost IS NOT NULL) gp,
    SUM(net) net,
    COUNT(DISTINCT prt) FILTER (WHERE net>0 AND cost IS NOT NULL) traded_ck
  FROM big.f WHERE d>='2024-01-01' GROUP BY grp)
SELECT pg.Nm grp, ROUND(g.net/1e6,1) net_M, ROUND(g.gp/1e3,0) gp_K,
  g.traded_ck sku, ROUND(g.gp/NULLIF(g.traded_ck,0),0) gp_per_sku
FROM g JOIN big.PrtGroups pg ON g.grp=pg.C
WHERE g.traded_ck>=20 AND g.net>500000
ORDER BY gp_per_sku DESC;
</sql>
<notes>
- Efficiency = gross profit ÷ traded SKUs per group. Numerator and denominator on the SAME cost-known basis (a traded-with-cost SKU count) so the ratio is coherent.
- Traded SKU = item with net>0 in the window — distinct from the 75.6K catalog rows (mostly archived). Floors (≥20 SKUs, >₪500K) keep noise out.
- Fresh dominates: ירקות ₪99K/SKU (381 SKUs → ₪37.8M gp), פירות ₪93K/SKU, then fresh fish/poultry/meat and bread. Few codes, heavy profit each — the assortment's workhorses; read alongside Q41's long tail for rationalization.
- Structural note: weighed produce turns huge volume per code, so per-SKU profit is naturally high vs fine-grained packaged goods — the ranking rewards concentration.
</notes>
</doclet>

---

## תפעול, ניהול סניפים ואסטרטגיה

<doclet id="Q45" label="יעילות סניף" status="PARTIAL">
<question>איזה סניף מייצר את ההכנסה הגבוהה ביותר למ"ר?</question>
<sql>
-- Store area columns are EMPTY (proof):
--   SELECT COUNT(*), SUM((Area>0)::int), SUM((AreaBruto>0)::int) FROM big.Store;
--   -> 28 stores, 0 with Area>0, 0 with AreaBruto>0 (all 0.0)
-- Best proxy: revenue scale + basket size + YoY growth as the branch-productivity view.
WITH b AS (
  SELECT store,
    SUM(net) FILTER (WHERE ym BETWEEN 202501 AND 202512) net25,
    SUM(net) FILTER (WHERE ym BETWEEN 202401 AND 202412) net24
  FROM big.f GROUP BY store),
bk AS (
  SELECT StoreC store, SUM(Scm-ScmMaam)/COUNT(*) basket
  FROM big.KupaDoc_Header
  WHERE DateDoc>='2025-01-01' AND DateDoc<'2026-01-01' AND Scm>0 GROUP BY 1)
SELECT s.Nm branch, ROUND(b.net25/1e6,1) net25_M, ROUND(bk.basket,1) avg_basket_ILS,
  ROUND(100.0*(b.net25-b.net24)/NULLIF(b.net24,0),1) yoy_pct
FROM b JOIN big.Store s ON s.C=b.store JOIN bk ON bk.store=b.store
WHERE b.net24>1000000 ORDER BY b.net25 DESC;
</sql>
<notes>
- Area & AreaBruto proven empty for all 28 stores → true ₪/sqm is unanswerable; PARTIAL with the density proxy = basket (₪/transaction) alongside scale and growth.
- גני תקווה leads scale AND basket (₪87.8M, ₪117.8); אם המושבות is #2 and growing (+15%). If sqm ever loads, divide net25 by it.
- Cannot distinguish a large-footprint high-revenue store from a compact high-density one without sqm.
</notes>
</doclet>

<doclet id="Q46" label="חשיפת מע&quot;מ" status="VERIFIED">
<question>כמה מע"מ אני גובה, והאם הסניפים ללא מע"מ מטופלים נכון?</question>
<sql>
-- VAT collected = gross−net in big.f. Taxable vs exempt split via dept 11 (SwNoMaam=1).
SELECT ym,
  ROUND(SUM(net)/1e6,2) net_M,
  ROUND(SUM(gross-net)/1e6,2) vat_collected_M,
  ROUND(100.0*SUM(gross-net)/NULLIF(SUM(net) FILTER(WHERE dept<>11),0),2) vat_pct_on_taxable,
  ROUND(100.0*SUM(net) FILTER(WHERE dept=11)/SUM(net),1) exempt_share_pct
FROM big.f GROUP BY ym ORDER BY ym;
-- Per-branch check: GROUP BY store — every branch's taxable VAT ≈ 17-18%, exempt share 19-27%.
</sql>
<notes>
- VAT collected 2024+ = ₪97.09M on ₪691.3M net. Blended effective rate 14.04% is BELOW statutory because 20.6% of net is VAT-exempt produce (dept 11) — correct, not an error.
- The 17→18% transition is provably clean: vat_pct_on_taxable = 17.06/17.07% in Nov/Dec-2024 → 18.06/18.05% in Jan/Feb-2025, exactly at 2025-01-01.
- Per-branch: every branch carries ~17-18% on its taxable portion; exempt-share differences (הסתדרות 26.6% vs others ~20%) are demographic (produce-heavy stores), not accounting errors.
- AczMaam_Tlush=0 receipts: none exist in 2024+ (every header carries 17 or 18). Uses big.f gross−net; header ScmMaam gives the same result.
</notes>
</doclet>

<doclet id="Q47" label="חריגות קופה" status="VERIFIED">
<question>האם יש קופות או קופאים עם דפוסי ביטול, הנחה או זיכוי חריגים?</question>
<sql>
-- Per (store, OvedC): refund-doc rate, avg discount depth. Flag vs STORE peer-median.
-- Voids: pre-2026 = negative Scm; post-2026-02-16 also DocType=654. AczDisLine filtered 0.01..100.
WITH doc AS (
  SELECT StoreC, OvedC, COUNT(*) n_docs,
    100.0*COUNT(*) FILTER (WHERE Scm<0 OR DocType=654)/COUNT(*) refund_rate
  FROM big.KupaDoc_Header WHERE DateDoc>='2024-01-01' AND OvedC IS NOT NULL GROUP BY 1,2),
disc AS (
  SELECT h.StoreC, h.OvedC, AVG(l.AczDisLine) disc_depth
  FROM big.KupaDoc_Lines l JOIN big.KupaDoc_Header h ON h.C=l.KupaDocC
  WHERE h.DateDoc>='2024-01-01' AND h.OvedC IS NOT NULL AND l.AczDisLine BETWEEN 0.01 AND 100
  GROUP BY 1,2),
m AS (
  SELECT d.*, disc.disc_depth,
    MEDIAN(refund_rate) OVER (PARTITION BY StoreC) med_refund,
    MEDIAN(disc.disc_depth) OVER (PARTITION BY StoreC) med_disc
  FROM doc d LEFT JOIN disc USING(StoreC,OvedC) WHERE d.n_docs>=500)
SELECT StoreC store, OvedC oved, n_docs,
  ROUND(refund_rate,2) refund_pct, ROUND(med_refund,2) store_med_refund,
  ROUND(disc_depth,1) disc_pct, ROUND(med_disc,1) store_med_disc
FROM m WHERE refund_rate > med_refund*2 OR disc_depth > med_disc*1.5
ORDER BY (refund_rate-med_refund) DESC LIMIT 20;
</sql>
<notes>
- Standout: store 27 / OvedC 1435 — refund rate 3.64% vs store median 0.58% (>6×) on 16,808 docs: the audit target. Store 25 / OvedC 1058 combines 3.7× refunds AND elevated discount depth.
- refund_rate = negative-total docs OR DocType 654 (covers both eras); depth = avg AczDisLine on discounted lines (sentinel excluded). Peer group = same-store cashiers, flag = >2× median refunds or >1.5× median depth; ≥500 docs floor.
- OvedC is opaque (no employee master); ids 2 & 3 (500-680K docs) are aggregate/self-checkout accounts — they sit near store medians so the peer logic naturally ignores them.
- Anomaly = statistical outlier, not proof of misconduct.
</notes>
</doclet>

<doclet id="Q48" label="התאמת ספרים כפולים" status="VERIFIED">
<question>האם ספרי המכירות הראשי והזכיינות ("Lk") מתואמים בסוף החודש?</question>
<sql>
-- Overlap period (2026-02-16+): Lk book vs main-ledger DocType 670, monthly.
WITH lk AS (
  SELECT strftime(Date,'%Y-%m') ym, SUM(Scm) lk_gross
  FROM big.KupaDocLk_Header WHERE Date>='2026-02-16' GROUP BY 1),
m670 AS (
  SELECT strftime(DateDoc,'%Y-%m') ym, SUM(Scm) m670_gross
  FROM big.KupaDoc_Header WHERE DateDoc>='2026-02-16' AND DocType=670 GROUP BY 1)
SELECT lk.ym, ROUND(lk.lk_gross,0) lk_gross, ROUND(m670.m670_gross,0) main670_gross,
  ROUND(100.0*lk.lk_gross/NULLIF(m670.m670_gross,0),1) lk_vs_670_pct
FROM lk JOIN m670 USING(ym) ORDER BY ym;
-- Pre-2026 the Lk book stands alone: yearly ₪1.31M (2022), ₪1.56M (2023), ₪0.71M (2024), ₪1.89M (2025).
</sql>
<notes>
- VERDICT: reconciled in the overlap — complete months match 95.9-102.6% (2026-03: Lk ₪1.26M vs 670 ₪1.29M = 98.0%); the ~2-6% gap is ingestion lag between systems. June's 118.4% is a partial-month artifact (different close lags), not a failure.
- DOUBLE-BOOKING (explicit): from 2026-02-16 Wolt/named-account orders exist in BOTH books. Summing both double-counts. Report from the main ledger; use Lk alone for pre-2026-02 delivery history or cancellations (StornoDocC).
- Pre-2026-02-16 the main ledger has no DocType, so Lk stands alone — no cross-check possible there.
</notes>
</doclet>

<doclet id="Q49" label="מכירות עובדים" status="PARTIAL">
<question>אילו עובדים או סוכנים קשורים למרב המכירות, והאם זה תואם לעלות האיוש?</question>
<sql>
-- Sales per cashier-id per branch (OvedC opaque). Staffing cost NOT in data.
SELECT h.StoreC store, h.OvedC oved,
  COUNT(*) n_receipts,
  ROUND(SUM(h.Scm-h.ScmMaam)/1e6,1) net_M,
  ROUND(SUM(h.Scm-h.ScmMaam)/COUNT(*),1) rev_per_receipt
FROM big.KupaDoc_Header h
WHERE h.DateDoc>='2024-01-01' AND h.OvedC IS NOT NULL AND h.Scm>0
GROUP BY 1,2 ORDER BY net_M DESC LIMIT 20;
</sql>
<notes>
- Computable: revenue & receipts per (store, OvedC). CRITICAL: OvedC 2 & 3 (500-680K receipts each, multi-store) are aggregate/self-checkout POS accounts, NOT people — exclude before naming "top employees". Real cashiers start around OvedC 1887 (₪25.6M/318K receipts at store 26); best individual throughput = OvedC 2317 at store 18 (₪121.8/receipt).
- PARTIAL: staffing-cost alignment is unanswerable — no payroll/hours/headcount data exists, and OvedC has no name resolution in this tenant (no employee table; verified).
- Best available productivity signal = rev_per_receipt per cashier-id.
</notes>
</doclet>

<doclet id="Q50" label="איפה להשקיע" status="PARTIAL">
<question>אם יכולתי להרחיב או לשפץ סניף אחד, איזה ייתן את ההחזר הטוב ביותר?</question>
<sql>
-- Composite scorecard: net25, YoY (full-2025 vs full-2024), margin%, basket, txn YoY.
WITH y AS (
  SELECT store,
    SUM(net) FILTER (WHERE ym BETWEEN 202401 AND 202412) net24,
    SUM(net) FILTER (WHERE ym BETWEEN 202501 AND 202512) net25,
    SUM(cogs) FILTER (WHERE ym BETWEEN 202401 AND 202512) cogs2yr,
    SUM(net)  FILTER (WHERE ym BETWEEN 202401 AND 202512) net2yr
  FROM big.f GROUP BY store),
txn AS (
  SELECT StoreC store,
    COUNT(*) FILTER (WHERE DateDoc>='2024-01-01' AND DateDoc<'2025-01-01') tx24,
    COUNT(*) FILTER (WHERE DateDoc>='2025-01-01' AND DateDoc<'2026-01-01') tx25,
    SUM(Scm-ScmMaam) FILTER (WHERE DateDoc>='2025-01-01' AND DateDoc<'2026-01-01') net25h
  FROM big.KupaDoc_Header WHERE Scm>0 GROUP BY StoreC)
SELECT s.Nm branch, ROUND(y.net25/1e6,1) net25_M,
  ROUND(100.0*(y.net25-y.net24)/NULLIF(y.net24,0),1) yoy_pct,
  ROUND(100.0*(y.net2yr-y.cogs2yr)/NULLIF(y.net2yr,0),1) margin_pct,
  ROUND(txn.net25h/NULLIF(txn.tx25,0),1) basket25,
  ROUND(100.0*(txn.tx25-txn.tx24)/NULLIF(txn.tx24,0),1) txn_yoy_pct
FROM y JOIN big.Store s ON s.C=y.store JOIN txn ON txn.store=y.store
WHERE y.net25>1000000 AND y.net24>1000000  -- exclude too-new branches (meaningless YoY)
ORDER BY y.net25 DESC;
</sql>
<notes>
- Scorecard: scale (net25), momentum (net & txn YoY on complete years 2024 vs 2025), quality (margin%, basket). Suggested weights: 35/30/15/10/10 — documented, tunable.
- TOP PICK: אם המושבות — #2 scale (₪64.2M) AND compounding (+15% net, +8.3% txn, ₪109.7 basket, 32.3% margin): base + momentum. Growth play: רעננה אחוזה (+27.2% net, +18% txn). גני תקווה is largest but flat (-0.7%/-3.8%) → renovation, not expansion; רחובות declining on both.
- New-branch trap handled: רמת השרון opened 2024-11 → meaningless YoY (denominator ≈0); excluded via the net24>₪1M floor (it's a growth candidate but too young to score).
- PARTIAL by nature: no capex/rent/sqm/footfall data — this ranks revenue-trend attractiveness, not true ROI.
</notes>
</doclet>
