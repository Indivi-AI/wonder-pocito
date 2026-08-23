import { dsls } from '@jb6/core'
import '@jb6/react'
import '@wonder/ui/viz/viz-index.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls
const arr = v => Array.isArray(v) ? v : v == null ? [] : [v]
const num = v => typeof v == 'number' ? v : +String(v ?? '').replace(/[^\d.-]/g, '')
const int = v => Math.round(num(v)).toLocaleString('he-IL')
const fmt = (v, f) => v == null || v === '' ? '—'
  : f == '₪' ? `${int(v)} ₪`
  : f == '%' ? `${num(v).toFixed(1)}%`
  : f == 'x' ? `${num(v).toFixed(2)}x`
  : f == 'days' ? `${int(v)} ימים`
  : typeof v == 'number' ? v.toLocaleString('he-IL', { maximumFractionDigits: 1 }) : String(v)
const Pace = (h, v, compact, p = String(v ?? '').match(/₪?\s*([\d,.-]+)\s*₪?\s*\/\s*([\d,.-]+)/)) => p && h(
  `div:flex flex-wrap items-baseline justify-end gap-1 mt-1 min-w-0 leading-tight ${compact ? '' : 'text-sm'}`,
  { dir: 'ltr' },
  h(`span:font-black tabular-nums whitespace-nowrap tracking-normal ${compact
    ? 'text-[13px] sm:text-[15px]'
    : 'text-lg'}`, { dir: 'rtl' }, `${int(p[1])} ₪`),
  h('span:text-slate-300 text-xs font-black', {}, '/'),
  h(`span:font-bold tabular-nums whitespace-nowrap text-slate-500 ${compact
    ? 'text-xs sm:text-sm'
    : 'text-sm'}`, { dir: 'rtl' }, `${int(p[2])} יח`))
const Val = (h, f, v, cls, compact, x = fmt(v, formats[f])) => f == 'daily_sales_rate'
  && Pace(h, v, compact) || h(`div:${cls}`, compact
    ? { style: { fontSize: `${Math.max(10, Math.min(18, 260/String(x).length))}px` } }
    : {}, x)
const sign = v => num(v) < 0 ? 'bad' : num(v) > 0 ? 'good' : ''
const splitItems = v => String(v || '').split(/\s*\|\s*/).filter(Boolean)
const labelRows = v => splitItems(v).map(x => {
  const [t, ...text] = x.split(':')
  return { tone: ['good', 'warn', 'bad', 'info'].includes(t) ? t : 'info', text: text.join(':') || t }
}).filter(x => x.text)
const labelText = v => labelRows(v).map(x => x.text).join(', ')
const prevPromos = v => splitItems(v).map(x => {
  const [id, name, window, net, daily, margin] = x.split('~')
  return { id, name, window, net, daily, margin }
}).filter(x => x.id)
const labels = {
  promo_name: 'מבצע', proposed_promo_name: 'מבצע מוצע', deal_name: 'מבצע', window: 'תאריכים',
  baseline_window: 'תקופת בסיס', promo_items: 'פריטים', items: 'פריטים', item: 'פריט', branch: 'סניף',
  dept: 'מחלקה', brand: 'מותג', category: 'קטגוריה', sold_items: 'פריטים שנמכרו', stock_left: 'מלאי', stock_qty: 'מלאי',
  days_to_stockout: 'ימים לגמר מלאי', daily_sales_rate: 'קצב יומי', baseline_daily_sales_rate: 'קצב בסיס',
  current_item_net: 'מכירות במבצע', baseline_item_net: 'מכירות בסיס', item_sales_change_ils: 'שינוי מכירות',
  item_profit_change_ils: 'גידול רווח מול בסיס', item_sales_lift_pct: 'שיפור מכירות',
  previous_identical_count: 'זהים בבסיס', promo_labels: 'לייבלים', margin_ils: 'רווח', margin_pct: 'מרווח',
  sales_change_ils: 'שינוי ישן', sales_lift_multiplier: 'מכפיל ישן', effective_discount_pct: 'הנחה בפועל',
  free_units: 'יחידות חינם', n_cycles: 'מחזורי עבר', actual_from: 'מכירה ראשונה', actual_to: 'מכירה אחרונה',
  warning: 'אזהרה', recommendation: 'המלצה', recommendation_type: 'סוג המלצה', recommendations: 'המלצות',
  value_at_stake: 'ערך על הכף', value_meaning: 'משמעות הערך', cycles_run: 'מחזורים שרצו',
  days_since_last_run: 'ימים מאז רץ', lift_multiplier: 'מכפיל מכירות', uplift_daily_net: 'תוספת יומית',
  on_daily_net: 'קצב יומי במבצע', off_daily_net: 'קצב יומי רגיל', total_net: 'פדיון מצטבר',
  stock_days_at_promo_rate: 'ימי מלאי בקצב מבצע', tied_cash_ils: 'מזומן כבול', days_cover: 'ימי כיסוי',
  daily_rate: 'קצב יומי (יח׳)', rec_depth_pct: 'עומק מומלץ', rec_mechanic: 'מנגנון מומלץ',
  best_past_promo_daily_sales: 'שיא קצב במבצע עבר', rerun_deals: 'להריץ שוב', stop_deals: 'להפסיק/לצמצם',
  expected_daily_uplift: 'תוספת יומית צפויה', losing_margin_ils: 'הפסד במפסידים',
  clearance_items: 'פריטים לחיסול', clearance_tied_cash: 'מזומן תקוע', active_promos: 'מבצעים פעילים',
  profitable_promos: 'מבצעים רווחיים', losing_promos: 'מבצעים מפסידים', low_redemption_promos: 'פדיון נמוך',
  avg_lift_multiplier: 'מכפיל ממוצע', sales_growth_ils: 'גידול מכירות', mechanic: 'מנגנון',
  promos: 'מבצעים', promo_net: 'מכירות במבצע', lift: 'מכפיל', value: 'ערך', delta: 'שינוי'
}
const formats = {
  days_to_stockout: 'days', margin_ils: '₪', margin_pct: '%', sales_change_ils: '₪', sales_growth_ils: '₪',
  promo_net: '₪', baseline_daily_sales_rate: '₪', current_item_net: '₪', baseline_item_net: '₪',
  item_sales_change_ils: '₪', item_profit_change_ils: '₪', item_sales_lift_pct: '%', lift: 'x',
  avg_lift_multiplier: 'x', sales_lift_multiplier: 'x', effective_discount_pct: '%', lift_multiplier: 'x',
  uplift_daily_net: '₪', on_daily_net: '₪', off_daily_net: '₪', total_net: '₪', tied_cash_ils: '₪', value_at_stake: '₪',
  days_cover: 'days', days_since_last_run: 'days', stock_days_at_promo_rate: 'days', rec_depth_pct: '%',
  expected_daily_uplift: '₪', losing_margin_ils: '₪', clearance_tied_cash: '₪'
}
const fields = {
  promotionCards: ['promo_name', 'window', 'stock_left', 'daily_sales_rate', 'margin_pct',
    'item_sales_change_ils', 'item_sales_lift_pct'],
  recommendations: ['recommendation', 'lift_multiplier', 'uplift_daily_net', 'margin_pct',
    'effective_discount_pct', 'cycles_run'],
  default: ['value', 'delta']
}
const evidenceFields = ['lift_multiplier', 'uplift_daily_net', 'on_daily_net', 'off_daily_net',
  'cycles_run', 'margin_pct']
const detailFields = ['lift_multiplier', 'uplift_daily_net', 'on_daily_net', 'off_daily_net', 'cycles_run',
  'days_since_last_run', 'total_net', 'margin_ils', 'stock_days_at_promo_rate', 'mechanic', 'brand', 'category',
  'stock_left', 'stock_qty', 'days_cover', 'daily_rate', 'tied_cash_ils', 'rec_depth_pct', 'rec_mechanic',
  'best_past_promo_daily_sales', 'days_to_stockout', 'daily_sales_rate', 'baseline_daily_sales_rate',
  'current_item_net', 'baseline_item_net', 'item_sales_change_ils', 'item_sales_lift_pct', 'margin_pct',
  'effective_discount_pct', 'free_units', 'previous_identical_count', 'n_cycles', 'warning']
const chartPoints = s => splitItems(s).map(x => x.split(':'))
  .filter(x => x[0] && !Number.isNaN(num(x[1])))
  .map(([x, y]) => ({ name: x, value: num(y) }))
const tone = (k, v) => {
  if (k == 'warning' || k == 'stock_left' && num(v) < 0 || k == 'days_to_stockout' && num(v) < 7) return 'warn'
  if (k == 'margin_pct') return num(v) < 0 ? 'bad' : ''
  if (k == 'lift_multiplier') return num(v) >= 1.3 ? 'good' : num(v) < 1.1 ? 'bad' : ''
  return ['margin_ils', 'sales_change_ils', 'item_sales_change_ils', 'item_profit_change_ils',
    'item_sales_lift_pct', 'sales_lift_multiplier', 'uplift_daily_net'].includes(k) ? sign(v) : ''
}
const toneCls = t => ({
  good: 'text-emerald-700 bg-emerald-50 border-emerald-100',
  bad: 'text-red-700 bg-red-50 border-red-100',
  warn: 'text-amber-700 bg-amber-50 border-amber-100',
  info: 'text-sky-700 bg-sky-50 border-sky-100'
})[t] || 'text-slate-800 bg-slate-50 border-slate-100'
const icon = (k, t) => {
  if (['stock_left', 'stock_qty'].includes(k)) return 'Boxes'
  if (['days_to_stockout', 'days_cover', 'stock_days_at_promo_rate'].includes(k)) return 'Timer'
  if (k == 'daily_sales_rate') return 'Gauge'
  if (k == 'margin_pct') return 'Percent'
  if (k == 'recommendation') return 'Lightbulb'
  if (k == 'cycles_run') return 'Repeat'
  if (k == 'days_since_last_run') return 'CalendarClock'
  if (['tied_cash_ils', 'clearance_tied_cash'].includes(k)) return 'Banknote'
  if (['margin_ils', 'sales_change_ils', 'item_sales_change_ils', 'item_profit_change_ils',
    'uplift_daily_net', 'expected_daily_uplift', 'losing_margin_ils'].includes(k))
    return t == 'bad' ? 'TrendingDown' : 'TrendingUp'
  if (k == 'item_sales_lift_pct') return t == 'bad' ? 'TrendingDown' : 'Star'
  if (['sales_lift_multiplier', 'lift_multiplier'].includes(k)) return 'Zap'
  return k == 'warning' ? 'TriangleAlert' : 'CircleDot'
}
const labelIcon = t => t == 'good' ? 'Star' : t == 'warn' || t == 'bad' ? 'TriangleAlert' : 'Info'
const cardTitle = r => r.promo_name || r.proposed_promo_name || r.deal_name || r.mechanic || r.metric || 'מבצע'
const lbl = k => labels[k] || labels[String(k || '').toLowerCase()] || 'נתון'
const kKey = k => String(k.key || k.col || k.id || k.label || '').toLowerCase()
const kLabel = k => !/[A-Za-z_]/.test(k.label || '') && k.label || lbl(kKey(k))
const fieldKeys = xs => arr(xs)
  .flatMap(f => Array.isArray(f) ? f : f && typeof f == 'object' ? Object.values(f) : f)
  .map(f => f?.key || f).filter(Boolean)
const filterLabel = k => ({
  active_promos: 'כל המבצעים', profitable_promos: 'מבצעים רווחיים', losing_promos: 'מבצעים מפסידים',
  low_redemption_promos: 'פדיון נמוך'
})[k]
const passFilter = (r, k) => {
  if (!k || k == 'active_promos') return true
  if (k == 'profitable_promos') return num(r.margin_ils ?? r.margin_pct) > 0
  if (k == 'losing_promos') return num(r.margin_ils ?? r.margin_pct) <= 0
  return k != 'low_redemption_promos' || num(r.sales_lift_multiplier) < 1
    || num(r.sold_items) < Math.max(1, num(r.item_count)*0.35)
}
const filterListeners = new Set()
const fireFilter = k => {
  const detail = { key: k, label: filterLabel(k) }
  filterListeners.forEach(f => f({ detail }))
  globalThis.CustomEvent && globalThis.dispatchEvent?.(new CustomEvent('promotionReportFilter', { detail }))
}
const Metric = (h, f, r, Help) => {
  const t = tone(f, r[f])
  return h(`div:rounded-md border p-2 min-w-0 ${toneCls(t)}`, { key: f },
    h('div:flex items-center gap-1 text-[11px] font-medium', {}, h(`L:${icon(f, t)}`, { size: 13, className: 'shrink-0' }), h('span:truncate', {}, lbl(f)), Help?.(f)),
    Val(h, f, r[f], 'text-sm font-bold tabular-nums truncate mt-1'))
}
const CardMetric = (h, f, r, Help) => {
  const t = tone(f, r[f])
  return h(`div:min-w-0 rounded-md border px-2 py-1.5 ${toneCls(t)}`, { key: f },
    h('div:flex items-center justify-between gap-1 text-[10px] sm:text-[11px] font-medium', {},
      h('span:min-w-0 flex items-center gap-1', {}, h('span:truncate', {}, lbl(f)), Help?.(f)),
      h(`L:${icon(f, t)}`, { size: 13, className: 'shrink-0' })),
    Val(h, f, r[f], 'font-bold tabular-nums break-words leading-tight mt-0.5', true))
}
const Items = (h, items, full) => h('div:mt-2 text-xs text-slate-600 min-h-[48px]', {},
  h('div:flex flex-wrap gap-1 overflow-hidden', { style: { maxHeight: full ? 'none' : '48px' } },
    items.map((x, i) => h('span:rounded bg-slate-100 px-2 py-1 max-w-full truncate',
      { key: i, title: x }, x))))
const PromoLabels = (h, r, compact) => {
  const xs = labelRows(r.promo_labels)
  return xs.length ? h(`div:flex flex-wrap gap-1 ${compact ? 'max-h-7 overflow-hidden' : ''}`, {}, xs.map((x, i) =>
    h(`span:inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${toneCls(x.tone)}`, { key: i, title: x.text },
      h(`L:${labelIcon(x.tone)}`, { size: 12, className: 'shrink-0' }), h('span:truncate', {}, x.text)))) : null
}
const LineChart = (h, hh, ctx, data, title) => {
  const points = chartPoints(data).map(({ name, value }) => ({ x: name, y: value }))
  return points.length ? hh(ctx, dsls.react['react-comp'].VizWidget, {
    spec: { kind: 'line', title, width: 560, height: 260, valueFormat: '₪', series: [{ name: title, points }] }
  }) : null
}
const PromotionEvidence = (h, hh, ctx, r, Help) => {
  if (r.on_daily_net == null || r.off_daily_net == null) return null
  const promoDailyNet = num(r.on_daily_net), regularDailyNet = num(r.off_daily_net)
  const profitableLift = promoDailyNet > regularDailyNet && num(r.margin_pct) > 0
  const recentCycles = chartPoints(r.cycles_chart).slice(-8)
  return h('div:space-y-3', {},
    h('div:grid grid-cols-2 sm:grid-cols-4 gap-2', {},
      ['uplift_daily_net', 'lift_multiplier', 'margin_pct', 'cycles_run'].map(f => CardMetric(h, f, r, Help))),
    hh(ctx, dsls.react['react-comp'].VizWidget, { spec: {
      kind: 'bar', title: 'קצב מכירות יומי: מבצע מול רגיל', width: 560, height: 230, valueFormat: '₪',
      data: [{ name: 'ללא מבצע', value: regularDailyNet, color: '#94a3b8' },
        { name: 'במבצע', value: promoDailyNet, color: profitableLift ? '#65a30d' : '#dc2626' }]
    } }),
    recentCycles.length ? hh(ctx, dsls.react['react-comp'].VizWidget, { spec: {
      kind: 'groupedBar', title: 'המחזורים האחרונים מול הקצב הרגיל', width: 560, height: 260, valueFormat: '₪',
      categories: recentCycles.map(x => x.name), series: [
        { name: 'קצב רגיל', values: recentCycles.map(() => regularDailyNet) },
        { name: 'מחזור מבצע', values: recentCycles.map(x => x.value) }
      ]
    } }) : null)
}
const PreviousPromos = (h, row) => {
  const ps = prevPromos(row.previous_identical_promos)
  return h('div:space-y-2', {},
    h('div:flex items-center justify-between gap-2', {},
      h('div:text-sm font-bold text-slate-900', {}, 'מבצעים זהים קודמים'),
      h('span:text-xs text-slate-500', {}, fmt(ps.length))),
    ps.length ? h('div:grid grid-cols-1 gap-2', {}, ps.map(p => h(
      'div:rounded-md border border-slate-200 bg-white p-2 min-w-0', { key: p.id },
      h('div:flex items-center justify-between gap-2', {},
        h('div:font-bold text-xs text-slate-900 truncate', { title: p.name }, p.name),
        h('span:text-[10px] text-slate-500', {}, `#${p.id}`)),
      h('div:text-[11px] text-slate-500 mt-1', {}, p.window),
      h('div:grid grid-cols-3 gap-1 mt-2', {},
        [['מכירות', p.net, '₪'], ['יומי', p.daily, '₪'], ['מרווח', p.margin, '%']].map(([k, v, f]) => h(
          'div:rounded bg-slate-50 px-1.5 py-1 min-w-0', { key: k },
          h('div:text-[10px] text-slate-500', {}, k),
          h('div:text-xs font-bold tabular-nums truncate', {}, fmt(v, f)))))))) :
      h('div:text-xs text-slate-500 rounded-md border border-dashed border-slate-200 p-2', {},
        'לא נמצאו מבצעים זהים קודמים.'))
}
const SmartTable = (h, { rows, fs, search, setSearch, colFilters, setColFilters, sort, setSort, expanded, setExpanded, select, Help }) => {
  const hay = (r, f) => `${r[f] ?? ''} ${fmt(r[f], formats[f])}`.toLowerCase(), q = search.trim().toLowerCase()
  const filteredRows = rows.filter(r => (!q || fs.some(f => hay(r, f).includes(q)))
    && fs.every(f => !colFilters[f] || hay(r, f).includes(String(colFilters[f]).toLowerCase())))
  const compareRows = (a, b) => !isNaN(num(a[sort.key])) && !isNaN(num(b[sort.key]))
    ? num(a[sort.key]) - num(b[sort.key])
    : String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? ''))
  const sorted = [...filteredRows].sort((a, b) => sort.key ? (sort.dir == 'desc' ? -1 : 1) * compareRows(a, b) : 0)
  const shown = expanded ? sorted : sorted.slice(0, 10)
  const cellText = (r, f) => f == 'promo_labels' ? labelText(r[f])
    : f == 'promo_items' || f == 'items' ? splitItems(r[f]).slice(0, 3).join(', ')
    : fmt(r[f], formats[f])
  const mark = x => !q || !String(x).toLowerCase().includes(q) ? x
    : String(x).split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'))
      .map((p, i) => p.toLowerCase() == q ? h('mark:bg-amber-100 px-0', { key: i }, p) : p)
  const mobileFs = fs.filter(f => !['promo_name', 'proposed_promo_name', 'deal_name', 'window',
    'promo_items', 'items', 'recommendation'].includes(f)).slice(0, 4)
  const controls = h('div:flex flex-wrap gap-2 mb-2', {},
    h('div:flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 min-w-[160px] flex-1', {},
      h('L:Search', { size: 14, className: 'text-slate-400 shrink-0' }),
      h('input:w-full outline-none text-xs bg-transparent', {
        value: search, placeholder: 'חיפוש', onChange: e => setSearch(e.target.value)
      })),
    fs.slice(0, 4).map(f => h('input:min-w-[92px] flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none', {
      key: f, value: colFilters[f] || '', placeholder: lbl(f),
      onChange: e => setColFilters({ ...colFilters, [f]: e.target.value })
    })))
  const th = f => h('th:px-2 py-2 text-right font-medium text-slate-600 truncate', { key: f },
    h('button:inline-flex items-center gap-1 max-w-full', {
      onClick: () => setSort(sort.key == f
        ? { key: f, dir: sort.dir == 'asc' ? 'desc' : 'asc' }
        : { key: f, dir: 'asc' }), title: 'מיון'
    },
      h('span:truncate', {}, lbl(f)), Help?.(f), h('L:ArrowUpDown', { size: 12, className: 'shrink-0' })))
  const head = h('thead:bg-slate-50', {}, h('tr', {}, fs.map(th)))
  const body = h('tbody:divide-y divide-slate-100', {}, shown.map((r, i) => h('tr:hover:bg-slate-50 cursor-pointer', { key: i, onClick: () => select(r) },
    fs.map(f => h('td:px-2 py-2 align-top truncate', { key: f, title: cellText(r, f) }, mark(cellText(r, f)))))))
  return h('div:w-full rounded-lg border border-slate-200 bg-white p-3', {},
    controls,
    h('div:text-[11px] text-slate-500 mb-2', {}, `${sorted.length} מתוך ${rows.length} שורות`),
    h('div:hidden sm:block w-full overflow-hidden', {}, h('table:w-full text-xs sm:text-sm table-fixed', {}, head, body)),
    h('div:sm:hidden flex flex-col gap-2', {}, shown.map((r, i) => h(
      'button:text-right w-full rounded-lg border border-slate-200 p-2 bg-white min-w-0',
      { key: i, onClick: () => select(r) },
      h('div:font-bold text-slate-900 truncate', { title: cardTitle(r) }, mark(cardTitle(r))),
      h('div:text-xs text-slate-500 truncate mt-1', {}, r.window || r.recommendation || r.deal_name || ''),
      h('div:grid grid-cols-2 gap-1.5 mt-2', {}, mobileFs.map(f => CardMetric(h, f, r, Help)))))),
    sorted.length > 10 && h(
      'button:w-full mt-2 border-t border-slate-100 pt-2 text-xs font-semibold text-[#61A60E]',
      { onClick: () => setExpanded(!expanded) }, expanded ? 'הצג פחות' : `הצג עוד ${sorted.length - 10}`))
}

ReactComp('promotionReportPanel', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh, useState, useEffect, useRef } }) => ({ spec = {}, send, openDetails }) => {
      const rows = arr(spec.rows)
      const [view, setView] = useState(spec.view || 'cards'), [sel, setSel] = useState(null)
      const [filter, setFilter] = useState(null), [search, setSearch] = useState('')
      const [colFilters, setColFilters] = useState({}), [sort, setSort] = useState({})
      const [expanded, setExpanded] = useState(false), [cardLimit, setCardLimit] = useState(3)
      const [help, setHelp] = useState(null), muteHelp = useRef(0)
      const closeHelp = block => { if (block) muteHelp.current = Date.now() + 400; setHelp(null) }
      useEffect(() => {
        const f = e => setFilter(e.detail?.key && e.detail.key != 'active_promos' ? e.detail : null), close = () => closeHelp(true)
        const helpCloseEvents = 'scroll,wheel,touchmove,resize'.split(',')
        filterListeners.add(f)
        globalThis.addEventListener?.('promotionReportFilter', f)
        helpCloseEvents.forEach(x => globalThis.addEventListener?.(x, close, true))
        return () => {
          filterListeners.delete(f)
          globalThis.removeEventListener?.('promotionReportFilter', f)
          helpCloseEvents.forEach(x => globalThis.removeEventListener?.(x, close, true))
        }
      }, [])
      const fs0 = fieldKeys(spec.fields), fs = fs0.length ? fs0 : fields[spec.mode] || fields.default
      const cardFs = fs.filter(f => !['window', 'promo_items', 'items'].includes(f))
      const defaultCompactFields = spec.mode == 'promotionCards'
        ? ['daily_sales_rate', 'stock_left', 'sales_change_ils', 'margin_pct'] : cardFs
      const compactCardFs = fieldKeys(spec.compactFields || defaultCompactFields)
        .filter(f => cardFs.includes(f)).slice(0, 4)
      const visibleRows = rows.filter(r => passFilter(r, filter?.key))
      const topRows = visibleRows.slice(0, spec.limit || 12), cardRows = topRows.slice(0, cardLimit)
      const bar = spec.barValue || 'active_promos'
      const explain = { ...(spec.help || {}), ...(spec.explainer || {}) }
      const tip = k => explain[k] || explain[lbl(k)] || explain[String(k || '').toLowerCase()]
      const showHelp = (e, k, text, toggle) => {
        e.stopPropagation?.()
        if (Date.now() < muteHelp.current) return
        const r = e.currentTarget.getBoundingClientRect(), w = globalThis.innerWidth || 360
        const vh = globalThis.innerHeight || 640, key = `${k}:${Math.round(r.left)}:${Math.round(r.top)}`
        setHelp(toggle && help?.key == key ? null : {
          key, text, mobile: w < 640, x: Math.min(w - 172, Math.max(172, r.left + r.width/2)),
          y: r.bottom + 10, bottom: Math.max(12, vh - r.top + 10), above: r.bottom > vh - 170
        })
      }
      const tipStyle = p => ({
        ...(p.mobile ? { left: 12, right: 12 } : { left: p.x, width: 320, transform: 'translateX(-50%)' }),
        [p.above ? 'bottom' : 'top']: p.above ? p.bottom : p.y
      })
      const Help = (k, text = tip(k)) => text && h(
        'span:inline-flex items-center justify-center w-4 h-4 rounded-full border border-[#61A60E]/30 '
          + 'bg-[#61A60E]/10 text-[10px] font-bold text-[#3d7d08] shrink-0 cursor-pointer hover:bg-[#61A60E]/20',
        {
          title: text, role: 'button', tabIndex: 0, 'aria-label': 'הסבר',
          onClick: e => showHelp(e, k, text, true), onMouseEnter: e => showHelp(e, k, text),
          onMouseLeave: () => closeHelp(), onFocus: e => showHelp(e, k, text), onBlur: () => closeHelp(),
          onKeyDown: e => (e.key == 'Enter' || e.key == ' ') && showHelp(e, k, text, true)
        }, '?')
      const detailBody = (r, title) => {
        const evidence = PromotionEvidence(h, hh, ctx, r, Help)
        return h('div:space-y-3', {},
          title && h('h3:text-lg font-bold text-slate-900 break-words', {}, cardTitle(r)),
          h('div:text-xs text-slate-500', {}, r.window || r.recommendation || r.deal_name || ''),
          PromoLabels(h, r), LineChart(h, hh, ctx, r.daily_sales_chart, 'מכירות יומיות'), evidence,
          (r.previous_identical_count != null || r.previous_identical_promos != null) && PreviousPromos(h, r),
          Items(h, splitItems(r.promo_items || r.items), true),
          h('div:grid grid-cols-2 gap-2', {}, detailFields
            .filter(k => r[k] != null && r[k] !== '' && !(evidence && evidenceFields.includes(k)))
            .map(k => Metric(h, k, r, Help))))
      }
      const select = r => openDetails ? openDetails({ title: cardTitle(r), width: 640, content: detailBody(r) }) : setSel(r)
      return h('section:rounded-lg border border-slate-200 bg-white p-3 sm:p-4 overflow-hidden', {
        dir: 'rtl', onWheel: () => closeHelp(true), onScroll: () => closeHelp(true)
      },
        h('div:flex items-start justify-between gap-3 mb-3', {},
          h('div:min-w-0', {},
            h('div:text-xs font-semibold text-[#61A60E]', {}, spec.area || ''),
            h('div:flex items-center gap-1 min-w-0', {},
              h('h3:text-base sm:text-lg font-bold text-slate-900 break-words', {}, spec.title || 'דוח מבצעים'),
              Help(`title:${spec.title}`, explain[spec.title] || explain[spec.mode]))),
          !['kpis', 'timeline'].includes(spec.mode) && h('div:flex items-center gap-1 shrink-0', {},
            [['cards', 'LayoutGrid'], ['table', 'Table2']].map(([x, ic]) => h(
              `button:w-9 h-9 grid place-items-center rounded-md border ${view == x
                ? 'bg-[#61A60E] text-white border-[#61A60E]'
                : 'bg-white text-slate-600 border-slate-200'}`,
              { key: x, onClick: () => setView(x), title: x == 'cards' ? 'כרטיסים' : 'טבלה' },
              h(`L:${ic}`, { size: 15 }))))),
        help && h(
          'div:fixed z-[60] rounded-lg border border-[#61A60E]/20 bg-white p-3 text-xs leading-5 '
            + 'text-slate-700 shadow-xl ring-1 ring-[#61A60E]/10',
          { role: 'tooltip', style: tipStyle(help), onClick: e => e.stopPropagation() },
          h('div:flex items-start gap-2', {},
            h('L:Info', { size: 14, className: 'text-[#61A60E] shrink-0 mt-0.5' }),
            h('span', {}, help.text))),
        spec.mode == 'kpis' && h('div:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2', {},
          (arr(spec.kpis).length ? arr(spec.kpis) : Object.keys(rows[0] || {}).map(key => ({ key }))).map(k => {
          const key = kKey(k), val = k.value ?? rows[0]?.[key], t = k.tone || tone(key, val)
          const iconColor = t == 'bad' ? 'text-red-600' : t == 'good' ? 'text-emerald-700' : 'text-[#61A60E]'
          const valueColor = t == 'bad' ? 'text-red-700'
            : t == 'good' ? 'text-emerald-700' : toneCls(t).split(' ')[0]
          return h('button:text-right rounded-lg border p-3 hover:border-[#61A60E] min-w-0', {
            key, onClick: () => filterLabel(key) ? fireFilter(key) : k.question && send?.(k.question)
          },
          h('div:flex items-center gap-1 text-xs text-slate-500', {},
            h(`L:${icon(key, t)}`, { size: 14, className: iconColor }),
            h('span:truncate', {}, kLabel(k)), Help(key)),
          h(`div:text-xl font-bold tabular-nums mt-1 ${valueColor}`, {}, fmt(val, k.format || formats[key])))
        })),
        spec.mode == 'timeline' && hh(ctx, dsls.react['react-comp'].VizWidget, { spec: {
          kind: 'line', title: spec.title, width: 760, height: 320,
          highlight: { max: true, note: 'שיא תקופה' }, series: [{ name: 'מבצעים פעילים',
            points: topRows.map(r => ({ x: r.d || r.month, y: num(r[bar]) || 0 })) }]
        } }),
        !['kpis', 'timeline'].includes(spec.mode) && filter && h(
          'button:self-end inline-flex items-center gap-1 rounded-full border border-[#61A60E]/30 '
            + 'bg-[#61A60E]/10 px-2 py-1 text-xs font-semibold text-[#3d7d08] mb-2',
          { onClick: () => setFilter(null) }, h('L:X', { size: 12 }), filter.label),
        !['kpis', 'timeline'].includes(spec.mode) && (view == 'table'
          ? SmartTable(h, { rows: visibleRows, fs, search, setSearch, colFilters, setColFilters, sort, setSort, expanded, setExpanded, select, Help })
          : h('div:w-full divide-y divide-slate-200', {}, cardRows.map((r, i) => {
            const id = `${i}-${cardTitle(r)}`
            return h(
              'button:text-right w-full p-2.5 hover:bg-[#61A60E]/5 bg-white min-w-0 overflow-hidden flex flex-col gap-2',
              { key: id, onClick: () => select(r) },
              h('div:grid grid-cols-2 sm:grid-cols-4 gap-2', {}, compactCardFs.map(f => CardMetric(h, f, r, Help))),
              h('div:flex items-start justify-between gap-2 mt-1', {},
                h('div:min-w-0', {},
                  h('div:font-bold text-slate-900 truncate', { title: cardTitle(r) }, cardTitle(r)),
                  h('div:text-xs text-slate-500 truncate mt-1', {},
                    r.window || r.recommendation || r.deal_name || '')),
                !r.promo_labels && r.warning && h('L:TriangleAlert', { size: 18, className: 'text-amber-600 shrink-0' })),
              PromoLabels(h, r, true))
          }), topRows.length > cardRows.length && h(
            'button:w-full py-2 text-xs font-semibold text-[#61A60E] hover:bg-[#61A60E]/5',
            { onClick: () => setCardLimit(x => x + 5) },
            `טען עוד ${Math.min(5, topRows.length - cardRows.length)}`))),
        sel && h(
          'aside:fixed inset-y-0 left-0 z-50 w-full sm:w-[34rem] bg-white border-r border-slate-200 '
            + 'shadow-xl p-4 pt-12 overflow-y-auto', { dir: 'rtl' },
          h('button:absolute top-3 left-3 w-9 h-9 rounded-md border border-slate-200 bg-white flex items-center justify-center',
            { onClick: () => setSel(null), title: 'סגור' }, h('L:X', { size: 16 })),
          detailBody(sel, true)))
    },
    samplePropsData: () => ({
      spec: { title: 'מבצעים מוכחים להרצה חוזרת', mode: 'recommendations', area: 'המלץ על מבצעים',
        fields: ['recommendation', 'lift_multiplier', 'uplift_daily_net', 'margin_pct', 'effective_discount_pct', 'cycles_run', 'days_since_last_run'],
        compactFields: ['lift_multiplier', 'uplift_daily_net', 'margin_pct', 'cycles_run'], rows: [
        {
          deal_name: 'ג\'השאן שמן זית כתית מעולה', recommendation: 'להריץ שוב בהנחה של כ-41% (כמות בסכום)',
          promo_labels: 'good:מכפיל 3.08 ב-5 מחזורים', lift_multiplier: 3.08, uplift_daily_net: 1261,
          on_daily_net: 1867, off_daily_net: 605, margin_pct: 21.5, effective_discount_pct: 40.6,
          cycles_run: 5, days_since_last_run: 28, total_net: 118000, stock_left: 420,
          stock_days_at_promo_rate: 18, mechanic: 'כמות בסכום',
          promo_items: 'שמן זית כתית מעולה 750 מל | שמן זית כתית 1 ליטר',
          cycles_chart: '01/25:384|02/25:1355|03/26:1910|05/26:2028'
        },
        {
          deal_name: 'ברילה פסטה', recommendation: 'לצמצם עומק — ההנחה לא מזיזה מכירות',
          promo_labels: 'warn:רץ עכשיו|warn:ללא תוספת מכירות', lift_multiplier: 0.98,
          uplift_daily_net: -31, margin_pct: 40.7, effective_discount_pct: 41, cycles_run: 29,
          days_since_last_run: 2, total_net: 513998,
          promo_items: 'ברילה פנה | ברילה ספגטי | ברילה פוזילי'
        }] }
    })
  })
})
