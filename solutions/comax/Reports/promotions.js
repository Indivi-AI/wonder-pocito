import { dsls } from '@jb6/core'
import '@wonder/verified-queries/verified-queries-dsl.js'
import { COVERAGE_VIEW, PERF_VIEW, dateCaveat, reactComp } from './promo-shared.js'

const { 'verified-queries': {
  VerifiedReport, 'verified-report': { verifiedReport }, 'report-section': { section },
  'query-slot': { querySlot }, 'full-data': { fullData }
} } = dsls
const kpisSql = `WITH promos AS (${PERF_VIEW})
SELECT count(*) FILTER (WHERE is_active) AS active_promos,
  count(*) FILTER (WHERE is_active AND margin_ils > 0) AS profitable_promos,
  count(*) FILTER (WHERE is_active AND margin_ils <= 0) AS losing_promos,
  round(sum(margin_ils) FILTER (WHERE is_active AND margin_ils <= 0)) AS losing_margin_ils,
  round(sum(sales_change_ils) FILTER (WHERE is_active)) AS sales_growth_ils,
  count(*) FILTER (WHERE is_active AND (sold_items < greatest(1, item_count*0.35) OR coalesce(sales_lift_multiplier, 0) < 1)) AS low_redemption_promos,
  round(avg(sales_lift_multiplier) FILTER (WHERE is_active AND sales_lift_multiplier IS NOT NULL), 2) AS avg_lift_multiplier
FROM promos`
const dailyPace = `concat(round(daily_sales_rate)::BIGINT, ' ₪ / ', `
  + `round(units_sold/nullif(coalesce(nullif(selling_days, 0), cmp_days), 0))::BIGINT, ' יח') AS daily_sales_rate`
const cardsSql = `WITH promos AS (${PERF_VIEW})
SELECT promo_name, deal_name, "window", baseline_window, promo_items, sold_items, item_count, stock_left, ${dailyPace}, margin_ils, margin_pct,
  current_item_net, baseline_item_net, item_sales_change_ils, item_sales_lift_pct, sales_change_ils, sales_lift_multiplier,
  promo_labels, warning, daily_sales_chart, sales_timeline_chart, previous_identical_count, previous_identical_promos, n_cycles, actual_from, actual_to
FROM promos WHERE is_active ORDER BY item_sales_change_ils ASC LIMIT 25`
const profitableCardsSql = `WITH promos AS (${PERF_VIEW})
SELECT promo_name, deal_name, "window", baseline_window, promo_items, sold_items, item_count, stock_left, ${dailyPace}, margin_ils, margin_pct,
  current_item_net, baseline_item_net, item_sales_change_ils, item_sales_lift_pct, sales_change_ils, sales_lift_multiplier,
  promo_labels, warning, daily_sales_chart, sales_timeline_chart, previous_identical_count, previous_identical_promos, n_cycles, actual_from, actual_to
FROM promos WHERE is_active AND margin_ils > 0 ORDER BY margin_ils DESC LIMIT 25`
const detailSql = `WITH promos AS (${PERF_VIEW})
SELECT promo_name, deal_name, "window", baseline_window, promo_items, daily_sales_chart, sales_timeline_chart, ${dailyPace}, baseline_daily_sales_rate,
  current_item_net, baseline_item_net, item_sales_change_ils, item_sales_lift_pct, sales_lift_multiplier, previous_identical_count, previous_identical_promos,
  promo_labels, margin_pct, sales_change_ils, effective_discount_pct, free_units, n_cycles, warning
FROM promos WHERE is_active ORDER BY promo_net DESC LIMIT 20`
const extremaSql = `WITH promos AS (${PERF_VIEW})
SELECT CASE WHEN row_number() OVER (ORDER BY margin_ils DESC) = 1
    THEN 'הכי מצליח' ELSE 'הכי כושל' END AS comparison,
  promo_name, round(margin_ils, 2) AS margin_ils, round(margin_pct, 2) AS margin_pct,
  round(item_sales_change_ils, 2) AS item_sales_change_ils,
  round(item_sales_lift_pct, 2) AS item_sales_lift_pct
FROM promos WHERE margin_ils IS NOT NULL
QUALIFY row_number() OVER (ORDER BY margin_ils DESC) = 1
  OR row_number() OVER (ORDER BY margin_ils ASC) = 1
ORDER BY margin_ils DESC`
const explainer = {
  kpis: 'תמונת מצב קצרה של המבצעים הפעילים ביום הנתונים המלא האחרון. '
    + 'כל המדדים מחושבים רק על מבצעים שמוגדרים פעילים באותו יום.',
  promotionCards: 'כרטיסי מבצעים פעילים מתוך מאגר ביצועי המבצעים. '
    + 'ברירת המחדל מציפה קודם מבצעים שבהם שינוי המכירות מול הבסיס הוא הנמוך ביותר.',
  'מדדי מבצעים פעילים': 'מדדי כותרת למבצעים פעילים: כמה רצים עכשיו, כמה רווחיים או מפסידים, '
    + 'מה התוספת מול בסיס נקי, וכמה נמצאים בפדיון נמוך.',
  'מדדי ביצוע מבצעים': 'אותם מדדי כותרת, מחושבים על מבצעים פעילים בלבד. '
    + 'ההשוואה היא מול חלון בסיס של אותם פריטים לפני המבצע, ללא אותה משפחת מבצע.',
  'כרטיסי מבצעים פעילים': 'כרטיסים למבצעים פעילים עם חלון תאריכים, מלאי, קצב יומי, מרווח, '
    + 'שינוי מול בסיס ואזהרה אם אין שיפור.',
  'מבצעים רווחיים': 'מבצעים פעילים עם רווח גולמי חיובי בשקלים, ממוינים מהרווח הגבוה לנמוך.',
  'פירוט מבצע': 'פירוט למבצעים פעילים מובילים לפי פדיון המבצע: קצב, בסיס להשוואה, מכפיל, '
    + 'הנחה בפועל, יחידות חינם ותרשים יומי.',
  active_promos: 'מספר המבצעים שתאריך העוגן נמצא בתוך חלון הפעילות שלהם.',
  profitable_promos: 'מבצעים פעילים שבהם הרווח הגולמי חיובי. '
    + 'רווח גולמי = פדיון נטו במבצע פחות עלות אחרונה חיובית לפי פריט וסניף.',
  losing_promos: 'מבצעים פעילים שבהם הרווח הגולמי אפס או שלילי לפי אותה נוסחת רווח.',
  losing_margin_ils: 'סך ההפסד הגולמי במבצעים הפעילים המפסידים.',
  sales_growth_ils: 'סך ההפרש בין פדיון המבצע לבין פדיון הבסיס. '
    + 'הבסיס הוא מכירות אותם פריטים בחלון קודם באורך דומה, ללא מחזורי אותה משפחת מבצע.',
  low_redemption_promos: 'מבצעים פעילים שבהם נמכרו פחות מ-35% מפריטי המבצע '
    + '(לפחות פריט אחד) או שמכפיל המכירות קטן מ-1.',
  avg_lift_multiplier: 'ממוצע מכפיל המכירות של המבצעים הפעילים שיש להם בסיס להשוואה.',
  promo_net: 'פדיון נטו של שורות הקופה ששויכו למבצע, לאחר קיזוז מע״מ והחזרים.',
  promo_name: 'שם המבצע כפי שמופיע בטבלת המבצעים.',
  deal_name: 'משפחת המבצע מתוך טבלת מחזורי המבצעים. '
    + 'אותה משפחה מוחרגת מחלון הבסיס כדי לא להשוות מבצע לעצמו.',
  window: 'חלון התאריכים המתוכנן של המבצע.',
  promo_items: 'רשימת הפריטים המשויכים למבצע מתוך טבלת פריטי המבצע, מקובצת לתצוגה קצרה.',
  sold_items: 'מספר פריטי המבצע השונים שנמכרו בפועל בתקופת המבצע.',
  item_count: 'מספר הפריטים השונים שהוגדרו למבצע.',
  stock_left: 'יתרת מלאי עדכנית של פריטי המבצע לפי צילום המלאי האחרון.',
  daily_sales_rate: 'קצב יומי במבצע: פדיון נטו ליום וגם יחידות ליום, '
    + 'לפי ימי מכירה בפועל או אורך חלון ההשוואה כשאין מכירות.',
  baseline_daily_sales_rate: 'קצב יומי בבסיס: פדיון הבסיס חלקי מספר ימי ההשוואה. '
    + 'חלון הבסיס הוא התקופה שלפני המבצע באורך דומה, ללא אותה משפחת מבצע.',
  margin_ils: 'רווח גולמי בשקלים: פדיון נטו במבצע פחות עלות המכר. '
    + 'העלות מחושבת לפי העלות האחרונה החיובית לכל פריט וסניף.',
  margin_pct: 'מרווח גולמי באחוזים: הרווח הגולמי בשקלים חלקי הפדיון נטו במבצע, כפול 100.',
  sales_change_ils: 'שינוי מכירות מול בסיס: פדיון המבצע פחות פדיון הבסיס.',
  current_item_net: 'פדיון נטו של פריטי המבצע בתקופת המבצע הפעילה עד יום העוגן.',
  baseline_item_net: 'פדיון נטו של אותם פריטים בתקופה הקודמת באותו אורך כמו חלון ההשוואה.',
  item_sales_change_ils: 'שינוי המכירות לפי הלוגיקה החדשה: פדיון אותם פריטים בתקופת המבצע '
    + 'פחות פדיון אותם פריטים בתקופת הבסיס. מכיוון שהחלונות באותו אורך, זה שקול להשוואת ממוצע יומי.',
  item_sales_lift_pct: 'אחוז השיפור לפי הלוגיקה החדשה: הפער היחסי בין פדיון אותם פריטים '
    + 'בתקופת המבצע לבין פדיון אותם פריטים בתקופת הבסיס, כפול 100.',
  sales_lift_multiplier: 'מכפיל מכירות: קצב יומי במבצע חלקי קצב יומי בבסיס.',
  promo_labels: 'לייבלים מחושבים למבצע: ירידה, לא שיפר ללא מבצע זהה קודם, '
    + 'שיפר מכירות, או נמצא מבצע זהה קודם.',
  baseline_window: 'תקופת הבסיס להשוואה: אותם פריטים, אותו מספר ימים, לפני תחילת המבצע.',
  previous_identical_count: 'מספר מבצעים זהים שחפפו לתקופת הבסיס: אותה משפחת מבצע, אותם תנאים ואותו סט פריטים.',
  previous_identical_promos: 'רשימת מבצעים זהים קודמים להצגה בחלונית הפירוט.',
  sales_timeline_chart: 'סדרת מכירות יומית של אותם פריטים בתקופת הבסיס ובתקופת המבצע, '
    + 'כולל שם מבצע זהה אם הופיע בבסיס.',
  effective_discount_pct: 'ההנחה בפועל מול מחיר שורה מלא: '
    + 'אחוז הירידה בין המחיר המלא לבין הפדיון נטו שנגבה בפועל.',
  free_units: 'סך יחידות שניתנו בחינם, לפי שורות שבהן ההנחה מלאה.',
  n_cycles: 'מספר מחזורי עבר של אותה משפחת מבצע לפי טבלת מחזורי המבצעים.',
  actual_from: 'תאריך המכירה הראשון שנמצא בקווי הקופה של המבצע.',
  actual_to: 'תאריך המכירה האחרון שנמצא בקווי הקופה של המבצע.',
  warning: 'אזהרה שמופיעה כאשר מכירות אותם פריטים ירדו מול תקופת הבסיס, '
    + 'או כשאין מבצע זהה קודם והמכירות לא השתפרו.',
  daily_sales_chart: 'סדרת מכירות יומית: סכום הפדיון נטו בכל יום, משמשת לתרשים בתוך חלונית הפירוט.'
}
const slot = o => querySlot({ explainer, ...o })
const extremaSlot = slot({
  goal: 'המבצע המצליח ביותר מול המבצע הכושל ביותר לפי רווח גולמי, עם מרווח ושינוי מכירות.',
  widget: { kind: 'bar', title: 'המבצע המצליח מול הכושל — רווח גולמי',
    name: 'promo_name', value: 'margin_ils', valueFormat: '₪' },
  sql: extremaSql })
const profitableCardsSlot = slot({
  goal: 'רשימת כרטיסיות של מבצעים פעילים רווחיים בלבד, ממוינת לפי רווח גולמי בשקלים.',
  reactComp: reactComp('promotionCards', 'מבצעים רווחיים', {
    fields: ['daily_sales_rate', 'margin_ils', 'margin_pct', 'item_sales_lift_pct', 'item_sales_change_ils', 'window'],
    compactFields: ['margin_ils', 'daily_sales_rate', 'margin_pct', 'item_sales_lift_pct']
  }),
  widget: { kind: 'table', title: 'מבצעים רווחיים', columns: [
    {key: 'promo_name', label: 'מבצע'}, {key: 'margin_ils', label: 'רווח', format: '₪'},
    {key: 'margin_pct', label: 'מרווח', format: '%'}, {key: 'item_sales_lift_pct', label: 'שיפור', format: '%'},
    {key: 'item_sales_change_ils', label: 'שינוי', format: '₪'}
  ] },
  sql: profitableCardsSql })
const kpisSlot = () => slot({
  goal: 'כרטיסי מדדים למבצעים פעילים: כמות פעילים, רווחיים ומפסידים, '
    + 'הפסד גולמי, גידול מכירות מול בסיס ופדיון נמוך.',
  reactComp: reactComp('kpis', 'מדדי מבצעים פעילים', { kpis: [
    {key: 'active_promos', label: 'מבצעים פעילים'},
    {key: 'profitable_promos', label: 'מבצעים רווחיים', tone: 'good', question: 'סנן את כרטיסי המבצעים למבצעים רווחיים'},
    {key: 'losing_promos', label: 'מבצעים מפסידים', tone: 'bad', question: 'סנן את כרטיסי המבצעים למבצעים מפסידים'},
    {key: 'losing_margin_ils', label: 'הפסד גולמי', format: '₪', tone: 'bad', question: 'אילו מבצעים מפסידים כסף?'},
    {key: 'sales_growth_ils', label: 'גידול מכירות מול בסיס', format: '₪', tone: 'good',
      question: 'הצג תרשים מבצעים לפי מכפיל גידול מכירות'},
    {key: 'low_redemption_promos', label: 'מבצעים בפדיון נמוך', tone: 'bad', question: 'סנן למבצעים עם פדיון נמוך'}] }),
  widget: { kind: 'kpi', title: 'מדדי מבצעים פעילים', items: [{label: 'פעילים', col: 'active_promos', format: 'int'},
    {label: 'רווחיים', col: 'profitable_promos', format: 'int'}, {label: 'מפסידים', col: 'losing_promos', format: 'int'},
    {label: 'הפסד גולמי', col: 'losing_margin_ils', format: '₪'}, {label: 'גידול מכירות', col: 'sales_growth_ils', format: '₪'},
    {label: 'פדיון נמוך', col: 'low_redemption_promos', format: 'int'}] },
  sql: kpisSql
})

VerifiedReport('promotions', { impl: verifiedReport({
  title: 'נתח ביצועי מבצעים',
  description: 'דוח ביצועי מבצעים לפי טבלת המבצעים ושיוך משפחות המבצע: '
    + 'מבצעים פעילים, רווחיות, מכפיל מול חלון בסיס, וכרטיסי מבצע עם מלאי וקצב.',
  whenToUse: 'שאלות על מבצעים פעילים או היסטוריים: איך המבצעים מתפקדים, מי מפסיד או מרוויח, '
    + 'האם המבצע מגדיל מכירות מול תקופת בסיס ללא אותה משפחת מבצע, אילו מבצעים חלשים, '
    + 'ומה קורה במלאי ובקצב היומי. '
    + 'דוח promotions תמיד כולל גם רשימת/כרטיסי מבצעים פעילים. '
    + 'כשהשאלה מבקשת גם ניתוח ביצועים וגם המלצות פעולה, בחר גם את promo-recommendations לצידו.',
  routePhrases: ['מבצעים', 'מבצע', 'מבצעים פעילים', 'נתח ביצועי מבצעים', 'רווחיות מבצעים',
    'מבצע חלש', 'מלאי במבצע', 'קצב מבצע', 'promotion_cycles', 'mivza'],
  questionsCovered: ['Q24', 'Q25', 'Q26', 'Q29'],
  caveats: `${dateCaveat} לייבלי המבצע משתמשים בבסיס של אותם פריטים בחלון קודם באותו אורך; `
    + 'מבצע זהה בתקופת הבסיס אינו מוחרג אלא מסומן ומוצג בדיל-דאון. '
    + 'השיפור עדיין אסוציאטיבי ולא ניסוי מבוקר.',
  executiveSummary: kpisSlot(),
  summary: kpisSlot(),
  sections: [
    section({
      id: 'performance-kpis', title: 'מדדי ביצוע',
      goal: 'כרטיסי מדדים למבצעים פעילים, רווחיים, מפסידים, צומחים ובפדיון נמוך.',
      executiveSummary: slot({
        goal: 'כרטיסי מדדים ראשיים.', reactComp: reactComp('kpis', 'מדדי ביצוע מבצעים'),
        widget: { kind: 'kpi', title: 'מדדי ביצוע', items: [
          {label: 'פעילים', col: 'active_promos'}, {label: 'רווחיים', col: 'profitable_promos'},
          {label: 'מפסידים', col: 'losing_promos'}, {label: 'גידול', col: 'sales_growth_ils', format: '₪'},
          {label: 'פדיון נמוך', col: 'low_redemption_promos'}
        ] }, sql: kpisSql
      }),
      summary: slot({
        goal: 'שורת מדדים קומפקטית.', reactComp: reactComp('kpis', 'מדדי ביצוע מבצעים'),
        widget: { kind: 'kpi', title: 'מדדי ביצוע', items: [
          {label: 'פעילים', col: 'active_promos'}, {label: 'רווחיים', col: 'profitable_promos'},
          {label: 'מפסידים', col: 'losing_promos'}, {label: 'גידול', col: 'sales_growth_ils', format: '₪'},
          {label: 'מכפיל ממוצע', col: 'avg_lift_multiplier'}
        ] }, sql: kpisSql
      }),
      inDepth: slot({
        goal: 'שורת מדדים עם מכפיל ממוצע.', reactComp: reactComp('kpis', 'מדדי ביצוע מבצעים'),
        widget: { kind: 'kpi', title: 'מדדי ביצוע', items: [
          {label: 'פעילים', col: 'active_promos'}, {label: 'רווחיים', col: 'profitable_promos'},
          {label: 'מפסידים', col: 'losing_promos'}, {label: 'גידול', col: 'sales_growth_ils', format: '₪'},
          {label: 'מכפיל ממוצע', col: 'avg_lift_multiplier'}
        ] }, sql: kpisSql
      }),
      fullData: fullData({ description: 'שורת מדדים אחת על מבצעים פעילים מתוכננים.', grain: 'שורה אחת',
        columns: 'active_promos, profitable_promos, losing_promos, losing_margin_ils, sales_growth_ils, low_redemption_promos, avg_lift_multiplier',
        viewSql: kpisSql })
    }),
    section({
      id: 'coverage', title: 'כרטיסי מבצעים ורשימת פריטים',
      goal: 'רשימת כרטיסיות וטבלה של מבצעים פעילים עם תאריכים, פריטים, לייבלים, קצב יומי, '
        + 'מרווח ושינוי מכירות לפי אותם פריטים מול תקופת הבסיס.',
      executiveSummary: slot({
        goal: 'כרטיסי המבצעים הדחופים ביותר לפי הלייבלים ושינוי המכירות החדש.',
        reactComp: reactComp('promotionCards', 'כרטיסי מבצעים פעילים'),
        widget: { kind: 'table', title: 'כרטיסי מבצעים פעילים', columns: [
          {key: 'promo_name', label: 'מבצע'}, {key: 'window', label: 'חלון'},
          {key: 'promo_labels', label: 'לייבלים'}, {key: 'daily_sales_rate', label: 'קצב יומי'},
          {key: 'item_sales_change_ils', label: 'שינוי', format: '₪'},
          {key: 'item_sales_lift_pct', label: 'שיפור', format: '%'}
        ] }, sql: cardsSql
      }),
      summary: slot({
        goal: 'רשימת כרטיסיות וטבלה של מבצעים פעילים.',
        reactComp: reactComp('promotionCards', 'כרטיסי מבצעים פעילים'),
        widget: { kind: 'table', title: 'כרטיסי מבצעים פעילים', columns: [
          {key: 'promo_name', label: 'מבצע'}, {key: 'promo_items', label: 'פריטים'},
          {key: 'stock_left', label: 'מלאי'}, {key: 'margin_pct', label: 'מרווח', format: '%'},
          {key: 'item_sales_lift_pct', label: 'שיפור', format: '%'}, {key: 'promo_labels', label: 'לייבלים'}
        ] }, sql: cardsSql
      }),
      inDepth: slot({
        goal: 'כרטיסי מבצעים מפורטים עם תרשים בסיס מול מבצע, לייבלים ומבצעים זהים קודמים.',
        reactComp: reactComp('promotionCards', 'כרטיסי מבצעים פעילים'),
        widget: { kind: 'table', title: 'כרטיסי מבצעים פעילים — עומק', columns: [
          {key: 'promo_name', label: 'מבצע'}, {key: 'deal_name', label: 'משפחה'},
          {key: 'window', label: 'חלון'}, {key: 'baseline_window', label: 'בסיס'},
          {key: 'item_sales_lift_pct', label: 'שיפור', format: '%'},
          {key: 'previous_identical_count', label: 'זהים קודמים'}
        ] }, sql: detailSql
      }),
      fullData: fullData({
        description: 'חתך כיסוי מבצעים לפי מבצע, פריט, סניף וחודש לשאלות פילוח.',
        grain: 'שורה לכל מבצע, פריט, סניף וחודש',
        columns: 'mivza_c, deal_id, deal_name, prt, item, branch_id, branch, dept, ym, net, promo_net, promo_qty, depth_wtd_pct',
        perItemOnly: 'promo_qty', viewSql: COVERAGE_VIEW
      })
    }),
    section({
      id: 'promo-extrema', title: 'המבצע המצליח והכושל ביותר',
      goal: 'השוואת קיצון: המבצע המצליח ביותר מול הכושל ביותר לפי רווח גולמי בשקלים. '
        + 'לשאלות "המבצע הכי מצליח/רווחי" ו"הכי כושל/מפסיד".',
      answerInstructions: 'ענה בעברית בשני משפטים מתוך השורות בלבד: שם ורווח המבצע הכי מצליח, '
        + 'ואז שם והפסד המבצע הכי כושל. ציין גם מרווח ושינוי מכירות; אל תשנה את מדד ההצלחה מרווח גולמי.',
      executiveSummary: extremaSlot, summary: extremaSlot,
      inDepth: slot({
        goal: 'טבלת השוואת הקיצון עם כל מדדי הרווחיות והמכירות.',
        widget: { kind: 'table', title: 'השוואת מבצעים', columns: [
          {key: 'comparison', label: 'דירוג'}, {key: 'promo_name', label: 'מבצע'},
          {key: 'margin_ils', label: 'רווח גולמי', format: '₪'}, {key: 'margin_pct', label: 'מרווח', format: '%'},
          {key: 'item_sales_change_ils', label: 'שינוי מכירות', format: '₪'}
        ] }, sql: extremaSql
      }),
      fullData: fullData({
        description: 'שורה לכל מבצע פעיל או אחרון עם מדדי רווחיות, לייבלים וביצוע.', grain: 'שורה לכל מבצע',
        columns: 'mivza_c, deal_id, deal_name, promo_name, "window", baseline_window, promo_items, daily_sales_rate, '
          + 'margin_ils, margin_pct, item_sales_change_ils, item_sales_lift_pct, promo_labels, previous_identical_count, warning',
        viewSql: PERF_VIEW
      })
    }),
    section({
      id: 'profitable-promotions', title: 'מבצעים רווחיים',
      goal: 'רשימת כרטיסיות של מבצעים פעילים רווחיים בלבד, לא summary כללי.',
      answerInstructions: 'ענה בעברית עסקית קצרה מתוך השורות כרשימת מבצעים רווחיים בלבד. כתוב עד 6 '
        + 'בולטים בלבד; כל בולט חייב להיות מבצע ספציפי עם רווח, מרווח, מכפיל ושינוי מכירות. '
        + 'daily_sales_rate הוא ₪ ליום ולא יחידות. אל תכתוב קפצו/זינקו אם מכפיל המכירות קטן '
        + 'מ-1 או שינוי המכירות שלילי; כתוב ניטרלי: מכפיל מכירות X. אל תזכיר סניף או קטגוריה אם '
        + 'אין עמודה כזו בשורות, ואל תוסיף פסקת סיכום או קיבוץ לפי חודש/סוג מוצר.',
      executiveSummary: profitableCardsSlot, summary: profitableCardsSlot, inDepth: profitableCardsSlot,
      fullData: fullData({
        description: 'שורה לכל מבצע פעיל או אחרון עם מדדי רווחיות, לייבלים וביצוע.', grain: 'שורה לכל מבצע',
        columns: 'mivza_c, deal_id, deal_name, promo_name, "window", baseline_window, promo_items, daily_sales_rate, '
          + 'margin_ils, margin_pct, item_sales_change_ils, item_sales_lift_pct, promo_labels, previous_identical_count, warning',
        viewSql: PERF_VIEW
      })
    }),
    section({
      id: 'promotion-detail', title: 'פירוט מבצע ודמיון לעבר',
      goal: 'שורות לחלונית הפירוט: תרשים יומי, השוואה לבסיס, הנחה, '
        + 'יחידות חינם ומספר מחזורי עבר לכל מבצע פעיל.',
      executiveSummary: slot({
        goal: 'שורות פירוט למבצעים פעילים מובילים.', reactComp: reactComp('promotionCards', 'פירוט מבצע'),
        widget: { kind: 'table', title: 'פירוט מבצע', columns: [
          {key: 'promo_name', label: 'מבצע'}, {key: 'baseline_window', label: 'בסיס'},
          {key: 'item_sales_lift_pct', label: 'שיפור', format: '%'},
          {key: 'item_sales_change_ils', label: 'שינוי', format: '₪'},
          {key: 'effective_discount_pct', label: 'הנחה', format: '%'}
        ] }, sql: detailSql
      }),
      summary: slot({
        goal: 'שורות פירוט עם מספר מחזורי עבר.', reactComp: reactComp('promotionCards', 'פירוט מבצע'),
        widget: { kind: 'table', title: 'פירוט מבצע', columns: [
          {key: 'promo_name', label: 'מבצע'}, {key: 'n_cycles', label: 'מחזורים'},
          {key: 'margin_pct', label: 'מרווח', format: '%'}, {key: 'item_sales_change_ils', label: 'שינוי', format: '₪'},
          {key: 'promo_labels', label: 'לייבלים'}
        ] }, sql: detailSql
      }),
      inDepth: slot({
        goal: 'שורות פירוט עם תרשים יומי וכל מדדי ההשוואה.', reactComp: reactComp('promotionCards', 'פירוט מבצע'),
        widget: { kind: 'table', title: 'פירוט מבצע — עומק', columns: [
          {key: 'promo_name', label: 'מבצע'}, {key: 'sales_timeline_chart', label: 'תרשים בסיס/מבצע'},
          {key: 'item_sales_lift_pct', label: 'שיפור', format: '%'},
          {key: 'previous_identical_count', label: 'זהים בבסיס'}, {key: 'free_units', label: 'יח׳ חינם'}
        ] }, sql: detailSql
      }),
      fullData: fullData({
        description: 'שורה אחת לכל מבצע פעיל או אחרון, עם מדדים לחלונית, לייבלים, '
          + 'תרשים בסיס מול מבצע ומבצעים זהים קודמים.',
        grain: 'שורה לכל מבצע',
        columns: 'mivza_c, deal_id, deal_name, promo_name, "window", baseline_window, promo_items, daily_sales_chart, '
          + 'sales_timeline_chart, daily_sales_rate, baseline_daily_sales_rate, current_item_net, baseline_item_net, '
          + 'item_sales_change_ils, item_sales_lift_pct, previous_identical_count, previous_identical_promos, promo_labels, '
          + 'margin_pct, effective_discount_pct, free_units, n_cycles, warning',
        viewSql: PERF_VIEW
      })
    })
  ]
}) })
