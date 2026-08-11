const T = {
  store: ['סניף', 'נתח את סניף {name} לפי מחלקה, פריט ושעה; הצג פדיון, כמות, רווח גולמי, סל ממוצע וחריגות מלאי.', [['מחלקות בסניף', 'אילו מחלקות בסניף {name} דוחפות או שוחקות את הרווח?'], ['שעות שיא', 'מה שעות המכירה החזקות והחלשות בסניף {name}?']], 'store branch storeid storec חנות סניף'],
  department: ['מחלקה', 'נתח את מחלקת {name} לפי סניף, פריט, ספק ומבצע; הצג פדיון, כמות, רווחיות ומלאי מת.', [['פריטים מובילים', 'מה הפריטים שמובילים את מחלקת {name} בפדיון וברווח?'], ['סניפים חלשים', 'באילו סניפים מחלקת {name} חלשה ביחס לרשת?']], 'department category dept מחלקה קטגוריה'],
  item: ['פריט', 'בדוק את הפריט {name} לפי סניף, ספק, מבצע ושעה; הצג מכירות, מרווח, מלאי, מחיר והנחות.', [['מלאי לפי סניף', 'איפה הפריט {name} עומד להיגמר או תקוע במלאי?'], ['השפעת מבצעים', 'האם מבצעים על הפריט {name} הגדילו כמות או רק שחיקו רווח?']], 'item product sku barcode prt prtc פריט מוצר מקט ברקוד'],
  supplier: ['ספק', 'נתח את ספק {name} לפי מחלקה, פריט וסניף; הצג תלות, רווח גולמי, עלות ספק וחריגות מלאי.', [['תלות בספק', 'באילו פריטים ומחלקות התלות בספק {name} הכי גבוהה?'], ['שחיקת עלות', 'אילו פריטים של ספק {name} ספגו עליית עלות בלי עדכון מחיר?']], 'supplier vendor spk ספק'],
  customer: ['לקוח', 'נתח את לקוח {name} לפי סל קניות, סניף, מחלקה ותדירות; הצג פדיון, רווחיות, הנחות וסימני נטישה.', [['סל קניות', 'מה לקוח {name} קונה יחד ומה אפשר להציע לו?'], ['סימן נטישה', 'האם לקוח {name} קונה פחות מול התקופה הקודמת?']], 'customer client account member idx לקוח לקוחות מועדון'],
  promotion: ['מבצע', 'בדוק את מבצע {name} לפי סניף, פריט, מחלקה ושעה; הצג גידול כמות, עומק הנחה, קניבליזציה ורווח גולמי.', [['רווחיות מבצע', 'אילו פריטים במבצע {name} מכרו טוב אך שחיקו רווח?'], ['קניבליזציה', 'האם מבצע {name} העביר מכירות מפריטים דומים במחיר מלא?']], 'promotion campaign discount coupon mivza מבצע הנחה קופון'],
  date: ['תאריך', 'נתח את {name} לפי שעה, סניף ומחלקה; הצג פדיון, כמות, סל ממוצע, מבצעים וחריגות מול תקופה קודמת.', [['שעות ביום', 'באילו שעות ב-{name} נוצרו השיאים והנפילות?'], ['סניפים ביום', 'איזה סניף בלט לטובה או לרעה ב-{name}?']], 'date day week month datedoc תאריך יום שבוע חודש'],
  hour: ['שעה', 'נתח את שעת {name} לפי סניף, מחלקה ופריט; הצג פדיון, כמות, סל ממוצע ועומס קופות.', [['סניפים בשעה', 'באילו סניפים שעת {name} חזקה או חלשה במיוחד?'], ['פריטים בשעה', 'אילו פריטים נמכרים הכי הרבה סביב {name}?']], 'hour time שעה שעות'],
  retail: ['בחירה', 'נתח את {name} לפי סניף, מחלקה, פריט, ספק, לקוח, מבצע ושעה; הצג פדיון, כמות, רווח גולמי וחריגות.', [['פירוק קמעונאי', 'פרק את {name} לפי סניף, מחלקה ופריט.'], ['חריגות', 'אילו חריגות רווח, מלאי או הנחה קשורות ל-{name}?']], '']
}

export const comaxDrillTemplates = Object.fromEntries(Object.entries(T).map(([k, [label, question, followUps, hints]]) => [k, { label, question, followUps, hints: hints.split(' ').filter(Boolean) }]))

const txt = x => Array.isArray(x) ? x.map(txt).join(' ') : x && typeof x == 'object' ? Object.values(x).map(txt).join(' ') : String(x ?? '')
const clean = x => String(x ?? '').trim()
const fill = (s, vars) => Object.entries(vars).reduce((r, [k, v]) => r.replaceAll(`{${k}}`, v), s)
const rtl = s => /[א-ת]/.test(s || '')
const nameOf = e => clean(typeof e == 'object' ? e?.name ?? e?.Nm ?? e?.שם ?? e?.label ?? e?.data?.name ?? e?.row?.name ?? e?.row?.Nm ?? e?.row?.שם ?? e?.value ?? e?.series : e) || 'הבחירה הזו'

export const comaxDrillDimension = (spec = {}, event = {}) => {
  const explicit = clean(spec?.drill?.dimension ?? spec?.dimension ?? event?.dimension).toLowerCase()
  const hay = txt([explicit, event?.series, spec?.title, spec?.xLabel, spec?.yLabel, spec?.nameKey, spec?.groupBy, spec?.columns?.[0]]).toLowerCase()
  return Object.keys(comaxDrillTemplates).find(k => k == explicit || comaxDrillTemplates[k].hints.some(h => hay.includes(h.toLowerCase()))) || 'retail'
}

export const comaxDrillQuestion = (spec = {}, event = {}) => {
  const dim = comaxDrillDimension(spec, event), name = nameOf(event), t = comaxDrillTemplates[dim] || comaxDrillTemplates.retail
  return fill(spec?.drill?.comaxQuestion || rtl(spec?.drill?.question) && spec.drill.question || t.question, { name, dimension: t.label })
}

export const comaxFollowUps = (spec = {}, event = {}) => {
  const dim = comaxDrillDimension(spec, event), name = nameOf(event), t = comaxDrillTemplates[dim] || comaxDrillTemplates.retail
  return t.followUps.map(([label, question]) => ({ label, question: fill(question, { name, dimension: t.label }) }))
}

export const comaxDrill = (dimension, extra = {}) => ({ dimension, question: (comaxDrillTemplates[dimension] || comaxDrillTemplates.retail).question, ...extra })
export const comaxFixDrillSql = sql => {
  const s = String(sql), l = s.match(/read_parquet\('([^']+)\/KupaDoc_Lines\.parquet'\)\s+(?:AS\s+)?l\b/i), h = s.match(/KupaDoc_Header\.parquet'\)\s+(?:AS\s+)?(\w+)/i), a = h?.[1] || 'h'
  return l && s.includes('l.StoreC') ? (h ? s : s.replace(l[0], `${l[0]} JOIN read_parquet('${l[1]}/KupaDoc_Header.parquet') h ON h.C = l.KupaDocC`)).replaceAll('l.StoreC', `${a}.StoreC`) : sql
}
