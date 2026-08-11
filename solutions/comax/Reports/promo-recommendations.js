import { dsls } from '@jb6/core'
import '@wonder/verified-queries/verified-queries-dsl.js'
import { CLEARANCE_VIEW, DEAL_REC_VIEW, dateCaveat, reactComp } from './promo-shared.js'

const { 'verified-queries': {
  VerifiedReport, 'verified-report': { verifiedReport }, 'report-section': { section },
  'query-slot': { querySlot }, 'full-data': { fullData }
} } = dsls
const RERUN_WHERE = `NOT is_active_now
  AND (cycles_with_sales >= 3 OR (cycles_with_sales >= 2 AND lift_multiplier >= 2))
  AND lift_multiplier >= 1.4 AND margin_pct >= 10 AND uplift_daily_net >= 500 AND total_net >= 20000
  AND stock_days_at_promo_rate >= 7 AND days_since_last_run BETWEEN 14 AND 365`
const STOP_WHERE = `cycles_with_sales >= 2 AND total_net > 20000 AND (margin_pct <= 0 OR lift_multiplier < 1.1)`
const DEAL_COLS = `deal_name, brand, category, mechanic, promo_items, item_count, cycles_run, days_since_last_run,
  lift_multiplier, uplift_daily_net, on_daily_net, off_daily_net, margin_ils, margin_pct, effective_discount_pct,
  total_net, stock_left, stock_days_at_promo_rate, cycles_chart`
const rerunSql = `WITH deals AS (${DEAL_REC_VIEW})
SELECT ${DEAL_COLS}, 'להריץ שוב בהנחה של כ-' || round(effective_discount_pct)::BIGINT || '% (' || mechanic || ')' AS recommendation,
  'good:מכפיל ' || lift_multiplier || ' ב-' || cycles_with_sales || ' מחזורים' AS promo_labels
FROM deals WHERE ${RERUN_WHERE} ORDER BY uplift_daily_net DESC LIMIT 25`
const stopSql = `WITH deals AS (${DEAL_REC_VIEW})
SELECT ${DEAL_COLS}, is_active_now,
  CASE WHEN margin_pct <= 0 THEN 'להפסיק או להקטין עומק — המבצע מפסיד כסף'
    ELSE 'לצמצם עומק — ההנחה לא מזיזה מכירות' END AS recommendation,
  concat_ws('|', CASE WHEN is_active_now THEN 'warn:רץ עכשיו' END,
    CASE WHEN margin_pct <= 0 THEN 'bad:מרווח שלילי' ELSE 'warn:ללא תוספת מכירות' END) AS promo_labels
FROM deals WHERE ${STOP_WHERE} ORDER BY total_net DESC LIMIT 25`
const clearanceSql = `WITH stuck AS (${CLEARANCE_VIEW})
SELECT item || ' — ' || branch AS proposed_promo_name, item, branch, dept, stock_qty, daily_rate, days_cover,
  tied_cash_ils, margin_pct, rec_depth_pct, rec_mechanic, best_past_promo_daily_sales,
  'הנחה של כ-' || rec_depth_pct || '% (' || rec_mechanic || ')' AS recommendation
FROM stuck ORDER BY tied_cash_ils DESC LIMIT 25`
const kpisSql = `WITH deals AS (${DEAL_REC_VIEW}), stuck AS (${CLEARANCE_VIEW}),
rerun AS (SELECT uplift_daily_net FROM deals WHERE ${RERUN_WHERE}), stop AS (SELECT margin_ils FROM deals WHERE ${STOP_WHERE})
SELECT (SELECT count(*) FROM rerun) AS rerun_deals,
  (SELECT round(sum(uplift_daily_net)) FROM rerun) AS expected_daily_uplift,
  (SELECT count(*) FROM stop) AS stop_deals,
  (SELECT round(sum(margin_ils)) FROM stop WHERE margin_ils < 0) AS losing_margin_ils,
  (SELECT count(*) FROM stuck) AS clearance_items,
  (SELECT round(sum(tied_cash_ils)) FROM stuck) AS clearance_tied_cash`
const mixSql = `WITH deals AS (${DEAL_REC_VIEW}), stuck AS (${CLEARANCE_VIEW})
SELECT 2 AS sort_order, 'להפעיל מבצעים מוכחים' AS recommendation_type, count(*) AS recommendations,
  round(sum(uplift_daily_net)) AS value_at_stake, 'תוספת מכירות יומית צפויה בש"ח' AS value_meaning
FROM deals WHERE ${RERUN_WHERE}
UNION ALL SELECT 1, 'להפסיק או לצמצם עומק', count(*), round(sum(total_net)), 'פדיון מצטבר במבצעים חלשים' FROM deals WHERE ${STOP_WHERE}
UNION ALL SELECT 3, 'חיסול מלאי תקוע', count(*), round(sum(tied_cash_ils)), 'מזומן כבול במלאי' FROM stuck
ORDER BY sort_order`
const explainer = {
  'המלץ על מבצעים': 'המלצות מבצעים משלושה מנועים: מבצעים חוזרים שהוכיחו תוספת מכירות ורווח, '
    + 'מבצעים חוזרים ששורפים מרווח בלי להזיז מכירות, ומלאי תקוע בסניף ששווה לחסל בהנחה.',
  'מדדי המלצות מבצעים': 'סיכום שלושת מנועי ההמלצה: כמה מבצעים מומלצים להפעלה, '
    + 'כמה מבצעים חלשים רצים, וכמה מזומן תקוע במלאי.',
  'מבצעים מומלצים להפעלה': 'מבצעים חוזרים שאינם פעילים, עם ראיות מכמה מחזורים, מכפיל 1.4 ומעלה, '
    + 'מרווח של 10% ומעלה, תוספת יומית של 500 ש״ח לפחות ומלאי לשבוע.',
  'מבצעים להפסקה או צמצום': 'מבצעים חוזרים עם פדיון משמעותי שמפסידים כסף '
    + '(מרווח שלילי) או שההנחה בהם לא מזיזה מכירות (מכפיל קטן מ-1.1). אלה שורפים מרווח.',
  'חיסול מלאי תקוע': 'פריטים בסניפים עם מלאי של 45 יום ומעלה וקצב מכירה שמאט, עם מרווח שמאפשר הנחה. '
    + 'עומק ההנחה המומלץ שומר לפחות 5 נקודות מרווח.',
  rerun_deals: 'מספר המבצעים שעומדים בכל תנאי ההפעלה: ראיות משני מחזורים חזקים או שלושה מחזורים, '
    + 'מכפיל 1.4 ומעלה, מרווח 10% ומעלה, תוספת יומית 500 ש״ח לפחות, פדיון 20 אלף ש״ח לפחות, '
    + 'מלאי לשבוע והרצה אחרונה לפני 14–365 ימים.',
  expected_daily_uplift: 'סך התוספת היומית הצפויה בש"ח מכל המבצעים המומלצים להפעלה: '
    + 'קצב יומי בימי מבצע פחות קצב יומי בימים רגילים.',
  stop_deals: 'מספר המבצעים החוזרים עם פדיון מעל 20 אלף ש"ח שמרווחם שלילי או שמכפיל המכירות שלהם קטן מ-1.1.',
  losing_margin_ils: 'סך ההפסד הגולמי המצטבר במבצעים שמרווחם שלילי.',
  clearance_items: 'מספר צירופי פריט וסניף עם מלאי תקוע שמתאים לחיסול בהנחה.',
  clearance_tied_cash: 'סך המזומן הכבול במלאי התקוע: כמות במלאי כפול עלות אחרונה.',
  deal_name: 'שם המבצע המזוהה לפי טבלת מחזורי המבצעים — קיבוץ של כל המחזורים של אותו מבצע.',
  recommendation: 'הפעולה המומלצת בעברית: מה להריץ, מה להפסיק או איזה עומק הנחה לתת.',
  cycles_run: 'כמה מחזורים של המבצע רצו מאז 2024.',
  days_since_last_run: 'כמה ימים עברו מאז המכירה האחרונה במבצע.',
  lift_multiplier: 'מכפיל מכירות אמיתי: מכירות כל פריטי המבצע בימים שהמבצע פעיל חלקי המכירות בימים רגילים. '
    + 'מחושב על כל המכירות, לא רק שורות שסומנו במבצע.',
  uplift_daily_net: 'התוספת היומית בש"ח: קצב יומי בימי מבצע פחות קצב יומי בימים רגילים.',
  on_daily_net: 'קצב מכירות יומי של פריטי המבצע בימים שהמבצע פעיל.',
  off_daily_net: 'קצב מכירות יומי של אותם פריטים בימים ללא המבצע.',
  margin_ils: 'רווח גולמי מצטבר בשורות המבצע: פדיון נטו פחות עלות אחרונה חיובית לפי פריט וסניף.',
  margin_pct: 'מרווח גולמי באחוזים מתוך הפדיון נטו במבצע.',
  effective_discount_pct: 'ההנחה בפועל שניתנה במבצע: הפער בין מחיר מלא לפדיון נטו שנגבה.',
  total_net: 'פדיון נטו מצטבר של כל מחזורי המבצע מאז 2024.',
  stock_left: 'יתרת מלאי עדכנית של פריטי המבצע בסניפים (ללא מחסן).',
  stock_days_at_promo_rate: 'לכמה ימי מבצע יספיק המלאי הנוכחי לפי קצב היחידות שנמכר במבצע.',
  cycles_chart: 'קצב המכירות היומי בכל מחזור של המבצע, לפי חודש תחילת המחזור.',
  mechanic: 'מנגנון המבצע לפי הגדרת קומקס: כמות בסכום, קנה קבל ועוד.',
  item_count: 'מספר הפריטים שמשתתפים במבצע.',
  promo_items: 'רשימת פריטי המבצע.',
  tied_cash_ils: 'מזומן כבול: כמות המלאי כפול העלות האחרונה של הפריט בסניף.',
  days_cover: 'ימי כיסוי: המלאי הנוכחי חלקי קצב המכירה היומי ב-91 הימים האחרונים.',
  daily_rate: 'קצב מכירה יומי ביחידות ב-91 הימים האחרונים.',
  stock_qty: 'כמות במלאי לפי צילום המלאי האחרון.',
  rec_depth_pct: 'עומק ההנחה המומלץ: לפי מדרגת ימי הכיסוי, מוגבל כך שנשארות לפחות 5 נקודות מרווח.',
  rec_mechanic: 'המנגנון המומלץ: הוזלה מיידית לטרי, מבצע מחיר או מארז לשאר.',
  best_past_promo_daily_sales: 'קצב המכירות היומי הטוב ביותר שהפריט השיג במבצע עבר כלשהו.'
}
const slot = o => querySlot({ explainer, ...o })
const dealFields = ({ title, fields, compactFields }) => reactComp('recommendations', title, {
  fields: fields || ['recommendation', 'lift_multiplier', 'uplift_daily_net', 'margin_pct', 'effective_discount_pct', 'cycles_run', 'days_since_last_run'],
  compactFields: compactFields || ['lift_multiplier', 'uplift_daily_net', 'margin_pct', 'cycles_run'] })
const rerunSlot = slot({
  goal: 'מבצעים חוזרים עם ראיות חזקות ממספר מחזורים, תוספת יומית מהותית, '
    + 'מרווח בריא, מלאי ורלוונטיות בזמן.',
  reactComp: dealFields({ title: 'מבצעים מומלצים להפעלה' }),
  widget: { kind: 'table', title: 'מבצעים מומלצים להפעלה', columns: [{key: 'deal_name', label: 'מבצע'},
    {key: 'recommendation', label: 'המלצה'}, {key: 'lift_multiplier', label: 'מכפיל'},
    {key: 'uplift_daily_net', label: 'תוספת יומית', format: '₪'}, {key: 'margin_pct', label: 'מרווח', format: '%'},
    {key: 'days_since_last_run', label: 'ימים מאז רץ'}] },
  sql: rerunSql })
const stopSlot = slot({
  goal: 'מבצעים חוזרים ששורפים מרווח: מרווח שלילי או מכפיל מכירות אמיתי מתחת ל-1.1 '
    + 'על פדיון משמעותי, ממוינים לפי פדיון.',
  reactComp: dealFields({
    title: 'מבצעים להפסקה או צמצום',
    fields: ['recommendation', 'lift_multiplier', 'margin_pct', 'effective_discount_pct',
      'total_net', 'cycles_run', 'days_since_last_run'],
    compactFields: ['lift_multiplier', 'margin_pct', 'effective_discount_pct', 'total_net']
  }),
  widget: { kind: 'table', title: 'מבצעים להפסקה או צמצום', columns: [
    {key: 'deal_name', label: 'מבצע'}, {key: 'recommendation', label: 'המלצה'},
    {key: 'lift_multiplier', label: 'מכפיל'}, {key: 'margin_pct', label: 'מרווח', format: '%'},
    {key: 'effective_discount_pct', label: 'הנחה בפועל', format: '%'},
    {key: 'total_net', label: 'פדיון מצטבר', format: '₪'}
  ] },
  sql: stopSql })
const clearanceSlot = slot({
  goal: 'מלאי תקוע לחיסול: פריט וסניף עם כיסוי 45 יום ומעלה, מכירות מאטות ומרווח שמאפשר הנחה, '
    + 'ממוינים לפי מזומן כבול.',
  reactComp: reactComp('recommendations', 'חיסול מלאי תקוע', {
    fields: ['recommendation', 'tied_cash_ils', 'days_cover', 'stock_qty', 'margin_pct', 'dept'],
    compactFields: ['tied_cash_ils', 'days_cover', 'stock_qty', 'margin_pct']
  }),
  widget: { kind: 'table', title: 'חיסול מלאי תקוע', columns: [
    {key: 'item', label: 'פריט'}, {key: 'branch', label: 'סניף'}, {key: 'recommendation', label: 'המלצה'},
    {key: 'days_cover', label: 'ימי כיסוי'}, {key: 'tied_cash_ils', label: 'מזומן כבול', format: '₪'},
    {key: 'margin_pct', label: 'מרווח', format: '%'}
  ] },
  sql: clearanceSql })

VerifiedReport('promo-recommendations', { impl: verifiedReport({
  title: 'המלץ על מבצעים',
  description: 'מנוע המלצות על בסיס היסטוריית המבצעים החוזרים: אילו מבצעים מוכחים להפעיל, '
    + 'אילו מבצעים חלשים להפסיק או לצמצם, ואיזה מלאי תקוע לחסל בהנחה. '
    + 'כל המלצה נשענת על מכפיל מכירות אמיתי, מרווח והנחה מוכחת.',
  whenToUse: 'שאלות מה כדאי לקדם, איזה מבצע לעשות או להפעיל שוב, אילו מבצעים להפסיק או שלא עובדים, '
    + 'ואיך לשחרר מלאי תקוע. לא לניתוח ביצועי מבצע פעיל — השתמש ב-promotions. '
    + 'כשהשאלה מבקשת גם ניתוח ביצועים וגם המלצות פעולה (כמו "נתח ביצועי מבצעים והמלץ על פעולות"), '
    + 'בחר את שני הדוחות יחד: promotions וגם promo-recommendations (rerun-winners + stop-list).',
  routePhrases: ['המלץ על מבצעים', 'המלצות מבצעים', 'איזה מבצע לעשות', 'מה לקדם', 'להריץ שוב',
    'איזה מבצע להפסיק', 'מבצע לא עובד', 'מלאי תקוע', 'חיסול עודפים'],
  questionsCovered: ['Q27', 'Q28', 'Q30'],
  caveats: `${dateCaveat} מכפיל המכירות משווה ימי מבצע לימים רגילים של אותם פריטים — `
    + 'אסוציאטיבי ולא ניסוי מבוקר; '
    + 'עונתיות עלולה להיראות כתוספת. אין נתוני מימון ספק, ולכן מבצע שנראה מפסיד עשוי להיות ממומן. '
    + 'מבצעי טבק מוחרגים (אסור לקדם בישראל).',
  answerInstructions: 'אל תחבר ואל תסכם עמודות על פני שורות — השתמש רק במספרים שמופיעים כבר בשורות או במדדי '
    + 'הסיכום. נקוב בשמות 2-3 מבצעים מובילים מפרק ההמלצות הרלוונטי עם המכפיל, המרווח וההנחה, '
    + 'וציין את הפעולה מעמודת ההמלצה. כתוב מספרים שלמים ללא אפסים עשרוניים ובלי שמות שדות.',
  materialize: true,
  executiveSummary: slot({
    goal: 'מדדי המלצות: כמה מבצעים מומלצים להפעלה, תוספת יומית צפויה, '
      + 'כמה להפסקה, הפסד במבצעים מפסידים ומזומן תקוע.',
    sql: kpisSql
  }),
  summary: slot({
    goal: 'תמהיל ההמלצות לפי מנוע: כמה המלצות ומה הערך הכספי על הכף בכל מנוע.',
    sql: mixSql
  }),
  sections: [
    section({
      id: 'rerun-winners', title: 'מבצעים מומלצים להפעלה',
      goal: 'רשימת מבצעים חוזרים עם ראיות חזקות למכפיל, תוספת יומית ומרווח, שאינם פעילים ויש להם מלאי.',
      executiveSummary: rerunSlot, summary: rerunSlot, inDepth: rerunSlot,
      fullData: fullData({
        description: 'שורה לכל מבצע חוזר עם מחזורים, מכפיל, מרווח, הנחה, מלאי ותוספת יומית. '
          + 'מועמד להפעלה עובר את כל ספי האיכות המתועדים ב-rerun_deals.',
        grain: 'שורה לכל מבצע חוזר',
        columns: 'deal_id, deal_name, brand, category, mechanic, cycles_run, cycles_with_sales, item_count, promo_items, '
          + 'cycles_chart, is_active_now, last_sale_d, days_since_last_run, total_net, margin_ils, margin_pct, '
          + 'effective_discount_pct, promo_daily_net, on_daily_net, off_daily_net, lift_multiplier, uplift_daily_net, '
          + 'stock_left, stock_days_at_promo_rate',
        viewSql: DEAL_REC_VIEW })
    }),
    section({
      id: 'stop-list', title: 'מבצעים להפסקה או צמצום',
      goal: 'מבצעים חוזרים עם פדיון משמעותי שמרווחם שלילי או שההנחה לא מזיזה מכירות — '
        + 'מועמדים להפסקה, העלאת מחיר או צמצום עומק.',
      executiveSummary: stopSlot, summary: stopSlot, inDepth: stopSlot,
      fullData: fullData({
        description: 'אותה טבלת מבצעים חוזרים; לרשימת הפסקה סנן: cycles_with_sales >= 2 '
          + 'AND total_net > 20000 AND (margin_pct <= 0 OR lift_multiplier < 1.1).',
        grain: 'שורה לכל מבצע חוזר',
        columns: 'deal_id, deal_name, brand, category, mechanic, cycles_run, cycles_with_sales, item_count, '
          + 'promo_items, is_active_now, days_since_last_run, total_net, margin_ils, margin_pct, '
          + 'effective_discount_pct, lift_multiplier, uplift_daily_net',
        viewSql: DEAL_REC_VIEW
      })
    }),
    section({
      id: 'clearance-candidates', title: 'חיסול מלאי תקוע',
      goal: 'פריטים בסניפים עם מלאי גבוה ומכירות מאטות, '
        + 'עם עומק הנחה מומלץ ששומר מרווח — לשחרור מזומן כבול.',
      executiveSummary: clearanceSlot, summary: clearanceSlot, inDepth: clearanceSlot,
      fullData: fullData({
        description: 'שורה לכל פריט וסניף עם מלאי תקוע: מלאי, קצב, ימי כיסוי, '
          + 'מזומן כבול, מרווח ועומק הנחה מומלץ.',
        grain: 'שורה לכל פריט וסניף',
        columns: 'prt, item, branch_id, branch, dept, stock_qty, daily_rate, rate30, days_cover, tied_cash_ils, '
          + 'last_sale_d, margin_pct, rec_depth_pct, rec_mechanic, best_past_promo_daily_sales, perishable',
        perItemOnly: 'stock_qty,daily_rate,rate30', viewSql: CLEARANCE_VIEW
      })
    })
  ]
}) })
