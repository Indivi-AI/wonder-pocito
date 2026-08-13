import { dsls } from '@jb6/core'
import '@jb6/llm-guide'
import '@wonder/ai/duckdb-sql-step.js'
import { comaxSchema } from '../../../files/rooms/comaxDemo/usersRO/schema/comax_semantic_schema.js'

const {
  common: { Data, data: { duckDbSql } },
  'llm-guide': { Booklet, Doclet, booklet: { booklet }, doclet: { dataComp }, guidance: { example, mustDo }, explanationPoint: { explanation, syntax, whenToUse } }
} = dsls
const ROOM_ROOT = 'signedRoom://comaxDemo/usersRO/parquet'
const COMPANY = 'OEM_BI_4466'
export const activeCompany = () => COMPANY
const COMPANY_DESC = 'the full supermarket chain (branches like גני תקווה, אם המושבות, רמת השרון; produce, food items, Wolt, מועדון)'
const pq = (name, company) => `${ROOM_ROOT}/${company}/${name}.parquet`
const tableNames = ['KupaDoc_Header', 'KupaDoc_Lines', 'Prt', 'Store', 'Idx', 'Suppliers', 'DailyPriceCost', 'DailyPriceCost_Zakyan', 'Prt_ItrotStore_Yomi', 'Mivza_Prt', 'KupaDocLk_Header', 'KupaDocLk_Lines', 'Departments', 'PrtGroups', 'Idx_Grp']
const tables = tableNames.map(name => {
  const { role, rows, grain, purpose } = comaxSchema.tables[name]
  return `- ${name}.parquet (${role}, ${rows} rows): ${grain.text}. ${purpose}`
}).join('\n')
const promoTables = `- Mivza.parquet (dimension, big dataset): promotion master. C is promo id; Nm is promo/campaign name; FromDate/ToDate are planned dates; MivzaTypeNm is mechanism.
- promotion_cycles.parquet (derived dimension, big dataset): recurring deal map. mivza_c -> Mivza.C; deal_id/deal_name group repeated runs of the same promotion.`
const joins = comaxSchema.joins.map(j => `- ${j.from}.${j.col} -> ${j.target}${j.verified == null ? '' : ` (${Math.round(j.verified * 10000) / 100}% verified)`}`).join('\n')
const dq = comaxSchema.dataQuality.map(x => `- ${x.table}.${x.column}: ${x.note}`).join('\n')

Booklet('comaxAnalytics', {
  impl: booklet('comaxLocalParquet,comaxAnalyticsSchema,comaxDimensionValues,comaxEntityCandidatesDataComponent,comaxRetailQuestions,comaxPromoRecommendations,comaxHebrewRtl')
})

const esc = s => String(s || '').replace(/'/g, "''").trim()
const like = (col, q) => esc(q).split(/\s+/).filter(Boolean).map(w => `${col} LIKE '%${w}%'`).join(' AND ') || '1=1'
const fmt = v => v == null ? '-' : typeof v == 'number' ? v.toLocaleString('he-IL', { maximumFractionDigits: 1 }) : String(v)
const option = (r, keys) => ({ ...r, details: Object.fromEntries(keys.map(k => [k, r[k]]).filter(([,v]) => v != null)),
  summary: keys.map(k => ({stock:'מלאי',weekly_sales_avg:'מכירות שבועיות',current_price:'מחיר',last_sale_date:'תאריך אחרון',receipts:'קבלות'}[k] + ' ' + fmt(r[k]))).join(' · ') })
const candidateSql = (ctx, entity, query, limit) => {
  const root = `${ROOM_ROOT}/${activeCompany(ctx)}`
  return entity == 'branch' ? `
WITH st AS (SELECT C id, trim(Nm) AS "label" FROM read_parquet('${root}/Store.parquet')),
h AS (SELECT * FROM read_parquet('${root}/KupaDoc_Header.parquet')), maxd AS (SELECT max(DateDoc) d FROM h),
s AS (SELECT StoreC id, round(sum(Scm-ScmMaam)/13) weekly_sales_avg, count(*) receipts, cast(max(DateDoc) AS varchar) last_sale_date FROM h WHERE DateDoc >= (SELECT d FROM maxd) - INTERVAL 91 DAY GROUP BY 1)
SELECT st.id, st."label", s.weekly_sales_avg, s.receipts, s.last_sale_date FROM st LEFT JOIN s USING(id) WHERE ${like('st."label"', query)} ORDER BY coalesce(s.weekly_sales_avg,0) DESC, st."label" LIMIT ${limit}` : `
WITH p AS (SELECT C id, trim(Nm) AS "label", BarCode barcode FROM read_parquet('${root}/Prt.parquet')),
h AS (SELECT * FROM read_parquet('${root}/KupaDoc_Header.parquet')), l AS (SELECT * FROM read_parquet('${root}/KupaDoc_Lines.parquet')),
i AS (SELECT Prt id, round(sum(Itra),1) stock FROM read_parquet('${root}/Prt_ItrotStore_Yomi.parquet') GROUP BY 1), maxd AS (SELECT max(DateDoc) d FROM h),
s AS (SELECT l.PrtC id, round(sum(l.Cmt)/13,1) weekly_sales_avg, round(arg_max(l.MhrLine,h.DateDoc),2) current_price, cast(max(h.DateDoc) AS varchar) last_sale_date, round(sum(l.Scm-l.VatAmount)) net FROM l JOIN h ON h.C=l.KupaDocC WHERE h.DateDoc >= greatest(DATE '2024-01-01',(SELECT d FROM maxd) - INTERVAL 91 DAY) GROUP BY 1)
SELECT p.id, p."label", p.barcode, coalesce(i.stock,0) stock, s.weekly_sales_avg, s.current_price, s.last_sale_date FROM p LEFT JOIN i USING(id) LEFT JOIN s USING(id) WHERE ${like('p."label"', query)} ORDER BY coalesce(s.net,0) DESC, p."label" LIMIT ${limit}`
}

Data('comaxEntityCandidates', {
  params: [{id: 'entity', as: 'string', options: 'product,branch', mandatory: true}, {id: 'query', as: 'string', mandatory: true}, {id: 'limit', as: 'number', defaultValue: 12}],
  impl: async (ctx, {}, {entity, query, limit}) => {
    const rows = await duckDbSql.$runWithCtx(ctx, candidateSql(ctx, entity, query, limit || 12))
    return Array.isArray(rows) ? rows.map(r => option(r, entity == 'branch' ? ['weekly_sales_avg','receipts','last_sale_date'] : ['stock','weekly_sales_avg','current_price','last_sale_date'])) : rows
  }
})

Doclet('comaxEntityCandidatesDataComponent', {
  impl: dataComp('comaxEntityCandidates', {
    guidance: [
      example(`options: {$: 'data<common>comaxEntityCandidates', entity: 'product', query: 'עגבניות שרי', limit: 12}`),
      mustDo('Use inside asHumanFeedback only when the user gives a specific product or branch name/phrase to filter and it may match 2+ entities; never for "by product/branch" dimensions or top lists')
    ],
    explaination: [
      explanation('Returns dropdown options {id,label,summary,details} for product/branch names, ordered by recent activity'),
      syntax("entity: 'product'|'branch'"),
      whenToUse('Before SQL/report slices that must filter an exact product or branch id')
    ]
  })
})

Doclet('comaxLocalParquet.local', {
  impl: ctx => { const c = activeCompany(ctx); return `
Comax supermarket ERP analytics uses local DuckDB over parquet files exposed through the local room. Write room:// wUrls; duckDbSql resolves them to local disk paths (in Node and browser alike) before DuckDB reads them.
ACTIVE DATASET: ${c} = ${COMPANY_DESC}.
Operate ONLY on \`${ROOM_ROOT}/${c}/*.parquet\` — never query another company, even if the question mentions one.
Always use full room:// paths such as:
SELECT * FROM read_parquet('${pq('KupaDoc_Lines', c)}') LIMIT 5;
SELECT * FROM read_parquet('${pq('KupaDoc_Header', c)}') LIMIT 5;
Do not use repo-local admin/comax paths, signedRoom:// paths, JSON readers, or bare filenames.
`}
})

Doclet('comaxAnalyticsSchema', {
  impl: ctx => { const c = activeCompany(ctx); return `
Domain: Hebrew supermarket/retail ERP over Comax POS, inventory, pricing, customer, supplier, SKU and promotion data.

Core tables:
${tables}
${promoTables}

Verified joins:
${joins}

Canonical sales base:
- Header h = read_parquet('${pq('KupaDoc_Header', c)}'), one row per receipt. Lines l = read_parquet('${pq('KupaDoc_Lines', c)}'), one row per SKU line. Join l.KupaDocC = h.C.
- Sales amount: sum(l.Scm). VAT: sum(l.VatAmount) or header ScmMaam. Net before VAT when needed: sum(l.Scm - l.VatAmount). Units: sum(l.Cmt). Average basket: sum(h.Scm)/count(distinct h.C) or sum(l.Scm)/count(distinct h.C).
- Receipt-grain questions and correlations use h.TotalCmt for item count and h.Scm or h.Scm-h.ScmMaam for basket value; never correlate line l.Cmt with line l.Scm.
- Correlation is association, never a causal driver. Preserve its decimals in charts (never valueFormat:'int'), state the analysis dates, and never alias quantity/units as sales or revenue.
- Negative l.Cmt or l.Scm are returns/refunds; include them for net sales, filter l.Cmt > 0 and l.Scm > 0 only when the question asks for gross positive sales.
- DocType: 652=retail receipt, 670=invoice to a NAMED account (Wolt delivery / צריכה עצמית; positive amounts — NOT a refund), 654=void/refund (negative), 650=manual charge. DocType is NULL before 2026-02-16 — never filter history by it; returns are negative-Scm/Cmt lines regardless of DocType.

Hard rules (each verified on this data):
- Nm name columns are space-padded — ALWAYS trim(): trim(Store.Nm), trim(Prt.Nm), trim(Departments.Nm).
- Static extract, no live clock: NEVER use now()/current_date. Anchor relative dates to (SELECT max(DateDoc) FROM header): "today"/"yesterday" = that max day (may be partial), "this month" = date_trunc('month', that max).
- Headers span 2022→2026 but line items are complete ONLY from 2024-01-01 — item/department questions must filter h.DateDoc >= DATE '2024-01-01' (header-only questions may use the full span).
- Revenue / basket / transaction-count / peak-hour questions need ONLY KupaDoc_Header (Scm, ScmMaam, TotalCmt, Hour 8-23, KupaNo register, OvedC cashier, DocType); join Lines only for item/department/promotion detail.
- Weekend (Israel) = dayofweek(DateDoc) IN (5, 6) (Friday, Saturday); dayname() for labels.
- KupaDoc_Lines.AczDisLine is a PERCENT with a -99900 null-sentinel: a discounted line is AczDisLine BETWEEN 0.01 AND 100; never SUM it.

Dimensions:
- SKU: l.PrtC -> Prt.C. Product name Prt.Nm, barcode Prt.BarCode, supplier id Prt.Spk, department Prt.DepartmentC, group Prt.GroupC.
- Department/group: Prt.DepartmentC -> Departments.C, Prt.GroupC -> PrtGroups.C, PrtGroups.DepartmentC -> Departments.C.
- Store: h.StoreC -> Store.C. Store.Nm is the branch/warehouse label. There are 11 recent selling branches plus inactive/warehouse records. For all-branch questions, derive active branches from KupaDoc_Header sales/receipts; NEVER hard-code StoreC/Store.C lists unless they come from selectedBranches.
- Customer/loyalty: h.CustomerC -> Idx.C and h.MOADON_NO is numeric loyalty member number. Idx.Type=1 means customer; CustomerC=0/unmatched is walk-in or unidentified. For customer counts, compare registered customers from Idx with distinct buying CustomerC and distinct positive MOADON_NO.
- Supplier: Prt.Spk = Suppliers.C (verified: matches 100% of items with Spk > 0). Left-join and GROUP BY trim(Suppliers.Nm) for supplier dependency / cost questions.

Cost, margin, price (the #1 trap):
- Never use KupaDoc_Lines.ScmAlut for margin: it is all-zero. And never equi-join DailyPriceCost on the sale date — the snapshot is sparse; a same-day date match covers only ~5% of revenue.
- Use the LATEST known cost per item x store:
  WITH ic AS (SELECT StoreID, ItemID, arg_max(FinalRegularCostPrice, DateDoc) AS unit_cost
              FROM read_parquet('${pq('DailyPriceCost', c)}') WHERE FinalRegularCostPrice > 0 GROUP BY 1, 2)
  ... LEFT JOIN ic ON ic.ItemID = l.PrtC AND ic.StoreID = h.StoreC
- gross_profit = sum((l.Scm - l.VatAmount) - ic.unit_cost * l.Cmt) FILTER (WHERE ic.unit_cost IS NOT NULL); margin_pct = 100 * gross_profit / the same costed net. Cost covers only part of revenue — ALWAYS return a costed-share or missing_cost_lines column and mention it in the Hebrew answer.
- PERFORMANCE (margin queries): FIRST pre-aggregate lines per item x store in a CTE — agg AS (SELECT l.PrtC, h.StoreC, sum(l.Scm - l.VatAmount) AS net, sum(l.Cmt) AS qty FROM lines l JOIN header h ... GROUP BY 1,2) — THEN LEFT JOIN ic on the aggregate (gross_profit = net - ic.unit_cost * qty; identical math since unit_cost is constant per item x store). Joining ic to raw un-aggregated lines runs minutes instead of seconds.
- l.MhrLine is the unit list price: discount value given = sum(l.MhrLine * l.Cmt - l.Scm) on positive lines. Company price: DailyPriceCost.MhrCompany; supplier list price: Mhr_Spk.
- Cost drift over time (עליית עלות): per item compare arg_min vs arg_max(FinalRegularCostPrice, DateDoc) from DailyPriceCost. Its DateDoc is BIGINT yyyymmdd — match to sale dates via cast(year(h.DateDoc)*10000 + month(h.DateDoc)*100 + day(h.DateDoc) AS BIGINT).
- DailyPriceCost_Zakyan is item x store x customer x promotion x day; use it for franchisee/customer-promotion cost questions, not as a generic line-cost table.

Inventory and promotions:
- Prt_ItrotStore_Yomi is the LATEST stock snapshot; its key columns are named Prt and Store (NOT PrtC/StoreC): i.Prt = Prt.C, i.Store = Store.C. Itra = on-hand qty.
- About half the Itra rows are NEGATIVE (7,388 of 14,590) — a data/shrinkage signal: report negatives separately; positive stock value = sum(i.Itra * ic.unit_cost) FILTER (WHERE i.Itra > 0), with ic joined ON ic.ItemID = i.Prt AND ic.StoreID = i.Store.
- Slow / dead / reorder questions: sales velocity per item = sum(l.Cmt) / days over a recent window (anchored to max date), joined to i.Itra; days_of_stock = Itra / velocity.
- Promotions: KupaDoc_Lines.MivzaNo > 0 marks a promo-priced line; Mivza_Prt bridges MivzaC + PrtC. Join promotions with BOTH MivzaC and PrtC — joining on MivzaC alone multiplies each line by the promo's item count (~9x revenue inflation). Mivza_Svg has 73 campaign channels.
- Promotion names/dates/mechanisms live on Mivza: join l.MivzaNo = m.C and use trim(m.Nm), m.FromDate, m.ToDate, m.MivzaTypeNm. NEVER use Mivza_Prt.Nm; Mivza_Prt has only MivzaC, PrtC, AlutMimushYehida, ByDateUpd.

Data-quality traps:
${dq}

Working customer-count SQL pattern:
SELECT 'לקוחות רשומים במערכת (Idx)' AS category, count(*) AS count_value FROM read_parquet('${pq('Idx', c)}') WHERE Type = 1
UNION ALL SELECT 'לקוחות ייחודיים שביצעו קנייה (CustomerC)', count(DISTINCT CustomerC) FROM read_parquet('${pq('KupaDoc_Header', c)}') WHERE CustomerC > 0
UNION ALL SELECT 'חברי מועדון ייחודיים שקנו (MOADON_NO)', count(DISTINCT MOADON_NO) FROM read_parquet('${pq('KupaDoc_Header', c)}') WHERE MOADON_NO > 0
`}
})

Doclet('comaxDimensionValues', {
  impl: `
Exact dimension values (closed lists — the extract is frozen). A user category/department/group/branch term MUST resolve to one of these exact names (or its C id);
NEVER equality-filter a guessed Hebrew name — an unmatched filter silently returns [] and fakes an honest "no data" answer.
Map loose terms to the closest value: 'מוצרי חלב' → department 'מוצרי חלב וביצים', 'יוגורטים' → group 'יוגורט ומשקאות יוגורט', 'בר כוכבא' → store 'בר כוכבא פתח תקווה'.
Only when nothing here fits, filter with LIKE on the distinctive token — never with equality on the user's wording.
Suppliers/promotions/customers are NOT listed here (hundreds of rows) and their real names are NEVER the user's wording (e.g. the supplier 'אסם' is 'קבוצת אסם סחר').
ALWAYS filter them with a self-resolving subselect on the distinctive token — p.Spk IN (SELECT C FROM read_parquet('<root>/Suppliers.parquet') WHERE Nm LIKE '%אסם%') —
never equality on the user's wording, and add the step-5 replan safety net.

Departments (Departments.C:Nm):
11:פירות וירקות ללא מע"מ, 12:פירות וירקות כולל מע"מ, 22:בשר ועוף קפוא, 23:דגים טריים, 24:פיצוחים ופירות יבשים, 33:ממתקים ופיצוחים במשקל, 58:מזון ואביזרי תינוקות,
164:אגרות משטחים מיכלים, 185:בירה לבנה, 186:יינות, 187:משקאות אלכוהולים אחרים, 188:משקאות חריפים, 189:אלכוהול, 190:חגי ישראל, 191:חטיפים מלוחים ופיצוחים,
192:לא מזון וחד פעמי, 193:לחם ותחליפיו, 194:מוצרי חלב וביצים, 195:מוצרי יסוד, 196:מוצרי ניקיון וחד פעמי, 197:מזון מקורר ארוז, 198:משקאות חמים וממתיקים,
199:משקאות לא אלכוהולים, 200:סוכריות ומסטיקים, 201:פארם וטואלטיקה, 202:קפואים, 203:דגני בוקר ומאפה מתוק, 204:לא לפידיון, 205:פקדון ללא מעמ, 206:חנוכה,
211:בעלי חיים, 212:מוצרי טבע, 213:מוצרי טבק ועישון, 214:בשר ועוף טרי, 215:שימוש עצמי, 217:בונבוניירות שוקולד וחטיפים מתוקים, 218:11, 219:137, 221:100

Item groups per department (trim(PrtGroups.Nm), listed under their parent department):
פירות וירקות ללא מע"מ: ירקות ללא מע"מ, פירות ללא מע"מ
פירות וירקות כולל מע"מ: פירות כולל מע"מ, ירקות כולל מע"מ
דגים טריים: דגים קפואים, דגים טריים
פיצוחים ופירות יבשים: פיצוחים ופירות יבשים
ממתקים ופיצוחים במשקל: חמוצים במשקל, תבלינים במשקל, ממתקים ומתוקים במשקל, פיצוחים ופירות יבשים במשקל, עוגיות ועוגות במשקל
מזון ואביזרי תינוקות: אביזרים לתינוק/ילדים, תכשירי טיפוח וניקוי תינוקות, תחליפי חלב אם, מזון תינוקות/ילדים, מגבונים לחים, חיתולים
אלכוהול: משקאות חריפים, בירה לבנה, יינות, משקאות אלכוהולים אחרים
חגי ישראל: פסח, עצמאות, ראש השנה
חטיפים מלוחים ופיצוחים: פיצוחים ופירות יבשים, חטיפים מלוחים
לא מזון וחד פעמי: הלבשה תחתונה, מוצרי חורף, עזרי מזון חד פעמי, קופונים, חשמל, טקסטיל, משחקי ילדים, מוצרי יום הולדת, משטחים מיכלים ופקדון,
  צמחייה, סלולאר, גרביים וקרסוליים, סוללות, ביגוד והנעלה, מוצרים לבית, ציוד למנגל
לחם ותחליפיו: אפייה, תחליפי לחם, לחמים, עוגות פרימיום
מוצרי חלב וביצים: ביצים מיוחדות, ביצים רגילות, מעדנים וקינוחים, מוצרי אפייה ובישול, תחליפי חלב וטופו, חלב ומשקאות חלב, יוגורט ומשקאות יוגורט, מדף גבינות ותחליפיו
מוצרי יסוד: אורז ופסטה, מוצרים אוריינטלים, רטבים וממרחים, עזרי אפייה ובישול, קטניות ותבשלים, פסטה/ פתיתים/ קוסקוס/פרורי לחם, תבלינים, שימורים, שמן חומץ ומיץ לימון
מוצרי ניקיון וחד פעמי: מטליות/אביזרי קרצוף, מטהר אוויר, אביזרים לאירוח, מוצרי כביסה, ניקיון הבית, מוצרי נייר, כפפות, משחות וצבעי נעליים, ניקוי כלים,
  נרות וגפרורים, מקלחות ושרותים, עזרי מזון חד פעמיים, אקונומיקה ורצפות, קוטל חרקים ומעופפים
מזון מקורר ארוז: אוכל מוכן למכירה, מזון מקורר ארוז, סלטים ארוזים
משקאות חמים וממתיקים: תחליפי סוכר, שוקו וקקאו, תה וקפה
משקאות לא אלכוהולים: תירוש, משקאות קלים, תרכיזי משקה סירופ, משקאות מוגזים, משקאות פונקציונלים/קפה, מים, סודה
סוכריות ומסטיקים: מסטיקים, סוכריות
פארם וטואלטיקה: היגיינה וטיפוח הגוף, טיפוח השיער, היגיינת הפה, סבון רחצה, הגנה מהשמש, טיפוח הפנים
קפואים: אוכל מוכן, פירות וירקות קפואים, עוגות וקינוחים קפואים, בשר קפוא, מוצרי בשר על האש, דגים קפואים, מוצרי בצק קפוא, גלידות ושלגונים, בשר ועוף קפוא, עוף והודו קפוא
דגני בוקר ומאפה מתוק: מאפה מתוק, פורים, חנוכה, דגני בוקר
לא לפידיון: לוגיסטיקה
פקדון ללא מעמ: פקדון ללא מעמ
בעלי חיים: מזון לבע"ח, אביזרי בע"ח
מוצרי טבע: מוצרים אורגניים, מוצרים ללא גלוטן
מוצרי טבק ועישון: אביזרי עישון וטבק
בשר ועוף טרי: בשר טרי, עוף והודו טרי
שימוש עצמי: שימוש עצמי
בונבוניירות שוקולד וחטיפים מתוקים: חטיפים מתוקים

Stores (Store.C:Nm — includes warehouses/virtual locations; still derive SELLING branches from sales, never from this list):
13:כץ פתח תקווה, 14:מחסן השמדות, 15:איזון מלאי, 17:מכון וייצמן, 18:גני תקווה, 19:הסתדרות פ"ת, 21:מרלו"ג - פתח תקווה, 23:רחובות, 24:חובבי ציון פ"ת,
25:אם המושבות פ"ת, 26:רעננה אחוזה, 27:בר כוכבא פתח תקווה, 29:ראש העין, 30:מחסן תרומות, 31:רמת השרון, 32:גשם- אור יהודה, 33:וולט, 34:נתניה קרית השרון,
35:כלנית אור יהודה, 36:קרית אונו- בוני התיכון, 37:רמת פנקס - אור יהודה, 38:ראשון לציון - מתחם ה 1000, 39:מחסן מרלוג- דנלוג, 40:כפר סבא- גולני,
41:מינץ פתח תקווה, 42:נופי בן שמן- לוד, 43:כפר סבא- הדרים, 44:הכרמל אור יהודה
`
})

Doclet('comaxRetailQuestions', {
  impl: `
Retail-manager question recipes, VERIFIED against the real data (full runnable doclets: admin/comax/Doclets/verified-questions.md — 40 VERIFIED / 7 PARTIAL / 3 NOT_ANSWERABLE).

Verified facts for ${COMPANY} — these override intuition:
- Self-check anchors: net 2024-01→2026-06 ≈ ₪691M; branch leader גני תקווה (May-2026 ≈ ₪8.1M, weakest real branch כפר סבא-גולני); פירות וירקות is BOTH top seller AND top margin ≈ 42% ; discounted revenue ≈ 24% of net at ≈ 14% avg depth; VAT rose from 17 to 18 on 2025-01-01 and produce is exempt (≈ 20% of net), so blended effective VAT ≈ 14% is CORRECT, not a bug.
- Dates: last COMPLETE day = 2026-06-27 (06-28 is truncated); "this month" → latest complete month (202605). Compare "yesterday" vs the SAME weekday a week back. Only 3 branches trade Saturday (גני תקווה, אם המושבות, רמת השרון) — the chain is largely Shabbat-closed; Friday alone ≈ 22.6% of all revenue, Saturday is the weakest day.
- Identified customers = Idx.Type IN (1,900) with a real name, excluding 'לקוח כללי' buckets / 'וולט' / 'צריכה עצמית'. Type 900 named accounts are individual house/charge customers ≈ 34.9% of net (naive Type-1-only reads ≈ 0). MOADON_NO exists only from 2026-05-16 (100% carded from June-2026); cards averaging 10+ receipts/day are per-branch DEFAULT cards (e.g. 1029, 301174-301181) — exclude them; loyalty analyses are valid on June-2026 only.
- DailyPriceCost history starts 2025-01 — cost-trend baselines cannot reach 2024.
- Artifact departments 164 (אגרות משטחים מיכלים) and 204 (לא לפידיון) — exclude from assortment/dead-stock/basket math. Exclude שקית/פקדון rows from reorder and shrink lists (checkout bags reach -466K stock: register-sold never-received, a process artifact, not theft). Weighed-produce on-hand is unreliable (physically impossible days-of-cover) — flag as count-discrepancy, never report as real overstock.
- Cashiers: OvedC 2 and 3 are aggregate/self-checkout accounts, not people. Anomaly = refund-rate above 2x or discount-depth above 1.5x the SAME-STORE peer median (min 500 docs).
- NOT_ANSWERABLE in this extract (proven empty — say so honestly in Hebrew and offer the nearest proxy): supplier payment terms (PaymentTerms filled for 11 of 1671), supplier refunds/rebates (SupplierRefund/RewardCharge/OperatingReturn all zero), buyer/קניין fields (UserKanyan empty; proxy = margin by department), revenue per sqm (Store.Area empty; proxy = basket + growth ranking).

Recipe families (compose with the schema hard rules; every query returns a compact GROUP BY aggregate):
- מכירות יומיות / אתמול / היום: header-only, WHERE h.DateDoc::DATE = (SELECT max(DateDoc)::DATE FROM header); compare vs that day - INTERVAL 7 DAY.
- דירוג סניפים / מגמת מכירות: header-only GROUP BY trim(s.Nm) or date_trunc('week'/'month', h.DateDoc); sum(h.Scm - h.ScmMaam).
- גודל סל / מספר עסקאות: sum(h.Scm)/count(*) and count(*) per branch; count transactions as Scm > 0 receipts, and where DocType exists separate 652 retail from 670 named-account/Wolt.
- שעות שיא: GROUP BY h.Hour (8-23), optionally x branch. סופ"ש מול חול: dayofweek(h.DateDoc) IN (5, 6).
- רווח גולמי / מרווח מחלקה / רווח פריט: lines + the ic latest-cost CTE, GROUP BY branch / trim(d.Nm) / trim(p.Nm); always include the costed-share column.
- מוצרי הפסד: GROUP BY item HAVING gross_profit < 0 AND sum(l.Cmt) > 50 ORDER BY gross_profit ASC.
- פריטים ללא נתוני עלות: items with revenue where ic.unit_cost IS NULL, ORDER BY revenue DESC.
- דליפת מרווח / עומק הנחה: sum(l.MhrLine * l.Cmt - l.Scm) by item/branch, or avg(AczDisLine) over AczDisLine BETWEEN 0.01 AND 100.
- עליית עלות ספק: per item arg_min vs arg_max(FinalRegularCostPrice, DateDoc) from DailyPriceCost, pct change, ORDER BY change DESC.
- כיסוי מבצעים / מרווח מבצע: revenue share where l.MivzaNo > 0 vs = 0; promo lines x ic CTE for promo margin, vs the SAME items' full-price margin.
- החזר על מבצע (uplift): per promoted item compare qty/day in the promo month vs the item's OWN non-promo months (need 2+ baseline months); tier by ratio — verified: roughly a third of promo revenue shows NO uplift.
- קניבליזציה: within a PrtGroups group, compare group-mates' FULL-PRICE qty/day in the promo item's promo months vs its non-promo months (verified exemplar: egg trays — the promo's gain ≈ the substitutes' loss; category flat).
- תחרותיות מחיר בין סניפים: NET unit price sum(Scm-VatAmount)/sum(Cmt) per item x branch on FULL-PRICE lines only (MivzaNo = 0 AND AczDisLine = 0), vs the item's cross-store median; flag revenue-weighted systematic deviation (verified: בר כוכבא underprices produce ≈ 4.5% below chain).
- מלאי שלילי / שווי מלאי: Prt_ItrotStore_Yomi x ic; negative Itra reported separately from positive stock value.
- עודף / מלאי מת / חוסרים / תזמון הזמנה: velocity per item (sum(l.Cmt)/days, recent window anchored to max date) joined to i.Itra; days_of_stock = Itra / velocity.
- ערך לקוח / תמהיל לקוחות: header GROUP BY trim(Idx.Nm) over identified accounts (Idx.Type IN (1,900), real names) or real moadon cards; ALWAYS exclude 'לקוח כללי' buckets and default cards from top-customer lists.
- סימן נטישה: identified named regulars (Type 1/900, active most months of last year with 24+ receipts) with ZERO receipts in the latest quarter; moadon history is too short for churn.
- תלות בספק / עלות ספק: revenue share GROUP BY trim(Suppliers.Nm) via p.Spk = Suppliers.C; cost increases via the עליית-עלות recipe.
- חריגות קופה / מכירות עובדים: header GROUP BY OvedC or KupaNo: count, negative-Scm count, avg Acz_Dis — flag outliers.
- התאמת ספרים כפולים (Lk): monthly sums of KupaDoc_Header vs KupaDocLk_Header side by side; never ADD the two ledgers — from 2026-02-16 the same Wolt orders appear in BOTH (Lk and main-ledger DocType 670).
`
})

Doclet('comaxPromoRecommendations', {
  impl: `
Promotion RECOMMENDATION expertise (המלץ על מבצעים / מה לקדם) — judge candidates by INCREMENTAL PROFIT, never by sales rank:
- NEVER recommend promoting an item just because it sells well at full price with no active promo — those are "sure things": a discount there subsidizes demand that exists anyway. High sales + margin headroom is NOT a promo objective.
- Classify the objective first, then pick the matching engine (a branch-scoped question usually wants 1+3, ideally both):
  1. חיסול עודפים (stock too high + selling too slow): join Prt_ItrotStore_Yomi (latest snapshot) with 90d velocity per item×store; candidate = Itra > 0 AND days_cover = Itra/rate > 45 AND 30d rate < 90d rate (decelerating). Rank by tied cash = Itra*unit_cost. Perishable dept → markdown now; non-perishable → price promo / multi-buy.
  2. מנצחים מוכחים (run-again list): promoted items whose promo-month qty/day beat their OWN non-promo baseline by MORE than the required break-even lift → recommend repeating at the depth that worked.
  3. פערי חנות: chain-proven items underselling in the branch (item share in branch vs fair chain share < 0.5) → local display/availability check or store-targeted promo.
- Depth by break-even math, never round numbers: required_lift = reg_margin/promo_margin - 1 (margins per unit; promo_margin = price*(1-depth) - cost). Cap the recommended depth so at least 5% margin remains AND required_lift <= 200% (i.e. depth <= margin_pct*2/3). Example: 25% margin at 20% depth needs 4x volume just to break even — say so. Low-margin staples (margin <= 15%) can take only a 5-15% defensive depth.
- Per candidate ALWAYS report: margin_pct, recommended depth, and the break-even lift that depth implies — the category manager must see the volume the promo has to move.
- Weighed-produce (פירות/ירקות) stock counts are unreliable — recommend 'ספירה מחדש' first, never a markdown on phantom stock.
- LEGAL (hard rules): NEVER recommend promotions on tobacco items (מוצרי טבק ועישון / סיגריות — prohibited in Israel; exclude the dept from candidate lists). Alcohol (אלכוהול) price promotions are legally restricted — flag 'בדיקה משפטית' and do not lead with them.
- State the caveats: baseline = the item's own non-promo months (no control groups — seasonality can fake uplift); supplier funding is NOT in this data (all-zero columns) so promo profitability is pre-funding; check the post-promo month for a pull-forward dip.
- When the reportsAnalytics agent is available, promo-recommendation questions belong to its pre-validated promo-recommendations report; this recipe is the fallback for hand-written SQL.
`
})

Doclet('comaxHebrewRtl', {
  impl: `
Answer in Hebrew unless the user asks otherwise. Use RTL-friendly markdown: Hebrew headings/labels, short right-to-left sentences, SQL/table/column names kept in English code spans, and currency as ₪. Avoid wide markdown tables; prefer bullets, compact KPI widgets, and charts with Hebrew titles. Explain caveats in business Hebrew, especially when costs are missing, returns are netted, or inventory is negative.
`
})

// wins over the generic llmSummary.dataInsights when the summary runs in the comax room (roomId is a doclet category)
Doclet('llmSummary.dataInsights.comax', {
  impl: `
Write the Hebrew answer for a supermarket branch/category manager - not a developer and not an analyst.
- The input is pre-aggregated top-N data; #FLOW_VARS holds the named results - ground the answer ONLY in the vars the EVALUATION names. The full detail is shown in interactive tables below your text - do NOT repeat it.
- SHORT_ANSWER is exactly one user-facing sentence. LONG_ANSWER is the fuller old-style answer: 3-4 short business sentences, under ~120 words, covering every topic (var) the EVALUATION names with the 1-2 leading items and key numbers in **bold**.
- NEVER format a line as "A | B | C" pipe-separated values - write a sentence.
- NEVER show raw column names (tied_cash, velocity_index, opportunity) or code values (recount_first_stock_suspect, price_promo_or_multibuy) - translate each to a Hebrew action: ספרו את המלאי מחדש לפני הנחה / מבצע מחיר או קנה-וקבל / הנחת חיסול מיידית.
- Natural business Hebrew, ZERO English words in the answer - even when the EVALUATION or column names use them: "lift"/"תוספתיות" -> "המכירות קפצו פי X" / "רף הכדאיות"; velocity_index 0.23 -> "מוכר רק כרבע מהצפוי לסניף"; not "מזומן קשור" but "מלאי תקוע בשווי X ₪"; days_cover as "מלאי ל-X ימים".
- מילון מונחים מועדף - כתוב תמיד את הצד העברי; האנגלית כאן היא רק המקור שאסור להעתיק לתשובה:
  מלאי - מלאי איטי (slow-moving) · מלאי מת (dead stock) · ימי כיסוי מלאי (days-of-cover) · שיעור מכירה מהמלאי (sell-through) · קצב מכירה (velocity) · פחת (shrink/waste) · חיסול מלאי (clearance) · פערי שקילה או חריגות שקילה - לא "סחף".
  רווחיות - רווח גולמי (gross profit) · מרווח גולמי (margin) · עלות ליחידה (unit cost) · עליית עלות ספק (cost creep, לא "סחיפה") · עומק הנחה (discount depth).
  מבצעים - מכירות צפויות ללא מבצע (baseline) · גידול נדרש/צפוי במכירות (לא "lift") · מכירות נוספות אמיתיות (לא "תוספתיות"/incrementality) · סף כדאיות (break-even) · 1+1 (BOGO) · מבצע כמות (multibuy) · מימון ספק (supplier funding) · פגיעה במכירות מוצרים חלופיים - הסבר, לא "קניבליזציה" · השפעה חיובית על הסל (halo) · הקדמת קנייה (pull-forward).
  סניף ומהימנות - פער ביצועי סניף (store gap) · הזדמנות מקומית (local opportunity) · רמת ביטחון (confidence) · קבוצת ביקורת (holdout).
- Format currency and continuous measures with at most 2 decimals, preserving their unit and scale; counts, years and dates are labels, so write 1,807, 2026 and 28.06.2026 without decimals; percent columns are already 0-100, never ×100.
- End with one short caveat line only when material (ספירה חשודה, אין נתוני מימון ספקים) - not a checklist, and in the same plain Hebrew (never "uplift"/"baseline"/"holdout": ההשוואה מול היסטוריית הפריט עצמו, ללא קבוצת ביקורת).
`
})

Doclet('essentialOutputFormat.analytics', {
  impl: `
Return only one javascript code block containing a flow with this backbone:
0) Before asking, inspect accumulatedContext.clarifiedParams and chatHistory. If an assistant chatHistory turn has rowsShown/entitiesShown/caveats, those are the rows the user actually saw and the caveats that were active on that answer; use them for follow-ups and do not contradict the displayed categories. If the needed product/branch was already clarified, reuse it and do not ask again. If the user gives a specific product or branch name/phrase to filter and it can match 2+ real entities, FIRST add flow-elem<workflow>asHumanFeedback with options data<common>comaxEntityCandidates. Use the exact user phrase as query (e.g. 'עגבניות שרי'), varName 'selectedProducts' or 'selectedBranches', and mode 'multi' unless the question clearly needs one. Never ask when product/branch is only a grouping/output dimension (e.g. "לפי פריט", top products, all branches, promotion id). Continue with unrelated planning; the first later profile that references $selectedProducts / $selectedBranches in jq/TGP or %$selectedProducts.sqlIn% / %$selectedBranches.sqlIn% in SQL waits automatically. Never use {{...}} for human feedback vars.
1) setCtxData running data<common>duckDbSql. The SQL must return COMPACT AGGREGATES, never raw un-aggregated rows: GROUP BY the requested dimension with counts/sums/avg plus min/max when relevant, ORDER BY the key metric, LIMIT to a top-N (usually <=20). Name filters must follow the exact-dimension-values rules — a grounded exact name, or the self-resolving LIKE subselect — and any free-text name filter REQUIRES the step-5 replan element. For best+worst, NEVER use UNION: rank the aggregate once with row_number() over both ASC and DESC orders, then select where either rank=1. The sql param is ONE plain quoted or backtick SQL string (no .trim() or other JS methods, and NEVER + concatenation - the parser reads only literals and drops expressions, leaving the sql empty; Hebrew literals like branch = 'גני תקווה' are fine inside a backtick string).
PERFORMANCE (date-scoped scans): KupaDoc_Lines has no date column and both files are sorted by doc id, so whenever you join Lines l to a date-filtered Header h (h.DateDoc >= X), ALSO add: l.KupaDocC >= (SELECT min(C) FROM <header parquet> WHERE DateDoc >= X). It is result-identical (a redundant lower bound) and lets DuckDB skip most of the 617MB Lines file.
2) setCtxVar 'rows' with value jqSingle exp '.' — copy this element VERBATIM from the example; it keeps the aggregate rows.
3) setCtxVar 'answer' via data<common>llmSummary writing one-sentence SHORT_ANSWER and 3-4 sentence LONG_ANSWER.
4) flow-elem<workflow>finalAnswer — DECLARATIVE assembly of the final { text, narrative, sql, rows, widgets, followUps } object. The runtime reads the answer and rows vars by itself, echoes your sql string, materializes widgets from the rows, truncates to 50 rows, and handles the empty-rows case automatically (default narrative, no widgets) — do NOT write an empty-rows branch and do NOT use jqSingle to build the final object.
5) SAFETY NET — MANDATORY whenever your SQL filters by ANY user-supplied free-text NAME (supplier/promotion/customer, or a product/branch not resolved via
asHumanFeedback), even when you used the LIKE subselect (the token may still miss): append flow-elem<workflow>replan as the LAST element, after finalAnswer.
It costs nothing when rows exist (the verifier passes instantly) and recovers bad-name empties instead of answering a blind "לא נמצאו נתונים":
{$: 'flow-elem<workflow>replan', goal: 'Verify empty result is not a bad name filter',
  task: 'התוצאה ריקה — ייתכן שהשם <the filtered name> לא קיים ככתבו. Author a recovery flow: (1) duckDbSql discovery — SELECT C, trim(Nm) FROM the entity dimension (Prt/Suppliers/Mivza/Idx) WHERE Nm LIKE on the DISTINCTIVE token of the name, never on a generic word (מחלבות/סוכנות/בע"מ/גבינה); (2) setCtxVar keeping the matches; (3) data<common>llmSql answering the ORIGINAL question for the discovered exact ids, GROUP BY the matched name so the answer shows what matched; (4) setCtxVar answer via llmSummary noting the corrected name, business Hebrew only — never mention vars/rows/#FLOW_VARS; (5) finalAnswer. If discovery finds nothing, or only names sharing nothing but a generic word — the entity does not exist in the data: answer that honestly, name what was checked, optionally list up to 3 near names as suggestions, and NEVER run numbers for a different entity. If discovery finds 2+ distinct entities and the question needs one, use asHumanFeedback with comaxEntityCandidates.',
  verifier: {$: 'boolean<common>jqBoolean', exp: '$rows | length > 0'},
  maxRuns: 1, instructions: '%$llmFlowBooklet%\n%$comaxAnalytics%'}
Never append replan otherwise — grounded-name flows keep the plain 4-element backbone.

finalAnswer params:
- sql: the SAME literal SQL string you ran — safe as-is (Hebrew, quotes, LIKE patterns need no escaping).
- narrative: ONE Hebrew sentence template. {0.col} inserts row 0's column col; {0.col:₪} and {0.col:qty} format it. Hebrew quotes like מע"מ are ALLOWED — these are plain strings, not jq.
- widgets: declarative widget specs. Charts use kind + nameCol + valueCol (column names from your SQL); table uses kind:'table' + columns only. The runtime builds data/rows from the rows. Never pass data, rows, series, items, values, categories, xCategories, yCategories or points. Other widget fields as usual: Hebrew title, valueFormat ("₪", "%", "qty"), highlight {max:true, note}, drill {dimension, question with {name}}.
- followUps: 2-4 Hebrew {label, question} grounded in this result, label <=40 chars.
Each element may carry a short Hebrew present-tense status, e.g. "בודק מכירות..." or "מרכיב תשובה...".
When using selected entities in SQL, write IN (%$selectedProducts.sqlIn%) / IN (%$selectedBranches.sqlIn%) for numeric ids, or IN (%$selectedProducts.sqlLabelsIn%) / IN (%$selectedBranches.sqlLabelsIn%) when the available column is a name like item or branch; never manually quote selected values and never use {{...}} for human feedback vars.
\`\`\`javascript
{$: 'flow-elem<workflow>flow', elems: [
  {$: 'flow-elem<workflow>setCtxData',
    goal: 'Run DuckDB SQL', status: 'בודק מכירות...',
    value: {$: 'data<common>duckDbSql', sql: 'SELECT name, value FROM ... ORDER BY value DESC LIMIT 8'},
    postCondition: {$: 'boolean<common>jqBoolean', exp: 'type == "array"'}
  },
  {$: 'flow-elem<workflow>setCtxVar', goal: 'Keep rows', varName: 'rows', value: {$: 'data<common>jqSingle', exp: '.'}},
  {$: 'flow-elem<workflow>setCtxVar', goal: 'Write answer', status: 'מסכם תובנות...', varName: 'answer',
    value: {$: 'data<common>llmSummary', summaryCategories: 'dataInsights', evaluation: 'כתוב SHORT_ANSWER בעברית במשפט אחד עם המספר המרכזי ב-**bold**, ו-LONG_ANSWER של 3-4 משפטים עסקיים. אם אין שורות, אמור שלא נמצאו נתונים מתאימים.'},
    postCondition: {$: 'boolean<common>jqBoolean', exp: '(type == "string" and length > 0) or (.text | type == "string" and length > 0)'}
  },
  {$: 'flow-elem<workflow>finalAnswer',
    goal: 'Return explorable answer', status: 'מרכיב תשובה...',
    sql: 'SELECT name, value FROM ... ORDER BY value DESC LIMIT 8',
    narrative: '{0.name} מוביל עם {0.value:₪} (נטו ללא מע"מ)',
    widgets: [{ kind: 'bar', title: 'מדד לפי קטגוריה', valueFormat: '₪', nameCol: 'name', valueCol: 'value',
                highlight: {max: true, note: 'הערך הגבוה ביותר'}, drill: {dimension: 'name', question: 'פרק את {name} לפי סניף'} }],
    followUps: [ {label: 'פירוק לפי סניף', question: 'פרק את התוצאה לפי סניף'}, {label: 'בדיקת מרווח', question: 'הצג את אותה התוצאה יחד עם רווח גולמי'} ]
  }
]}
\`\`\`
`
})
