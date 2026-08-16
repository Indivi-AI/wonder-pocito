import { dsls, jb, coreUtils } from '@jb6/core'
import '@jb6/common'
import '@jb6/react'
import '@wonder/ui/applet.js'
import '@wonder/ai/duckdb-sql-step.js'
import '@wonder/bi/viz/viz-index.js'
import './finance-analytics.js' // registers the financeAnalytics workflow (Ask AI) + the runFinanceAnalytics/runFinanceReport* lambdas
import '@wonder/db/room/room-lambda-client.js' // invokeSnippetInContext + roomLambda interceptor (?engine=lambda fallback)
import '@wonder/db/db-drivers-utils.js'
const { wGet, wPut } = jb.wonderUtils
import { q, cap, sentence, fmtBucket, cubeWidgets } from '@wonder/bi/cube-widget-builder.js'

const {
  react: {
    ReactComp,
    'react-comp': { comp },
    'react-metadata': { applet },
  },
  tgp: {
    'ctx-enricher': { setupCube },
  },
  bi: {
    cube: { demoFinanacialCubeV2 },
  },
  'llm-guide': { Doclet },
  wonder: {
    'content-type': { demoFinancialUserWidgetsV2, demoFinancialCompanyWidgetsV2, demoFinancialGlobalWidgetsV2, demoFinancialSchedulesV2 },
  },
  common: {
    data: { cubeQuery, invokeSnippetInContext, runFinanceAnalytics, runFinanceReportBatch },
  },
} = dsls

// URL param opt-in: bare ?logo=payoneer promotes to ctx.vars.logo (Payoneer branding for live client demos); default brand is Finance.
Object.assign(jb.coreRegistry.urlReservedParams, { logo: true })

// Query engine: in-page duckdb-wasm everywhere — cols_cache (statically linked in the wasm build) byte-ranges bucket parquet via same-origin /gcs-proxy.
// ?engine=lambda falls back to the room-lambda batch path (signed rooms / wasm regressions).
// The dataset path lives only in demoFinanacialCubeV2; applet and LLM queries use semantic names.
// room-aware: served as /room/<id>/applet/FinanceDemo the data+lambdas resolve in that room, so the demo can be published into any room that holds copies (e.g. the deck room)
const FINANCE_ROOM = globalThis.location?.pathname?.match(/\/room\/([^/]+)/)?.[1] || 'finance3'
const WASM = new URLSearchParams(globalThis.location?.search || '').get('engine') != 'lambda'
const wasmCtx = ctx => ctx.setVars({ categories: { ...ctx.vars.categories, gcshttpblockedbycors: true } })

// Brand accents for the shared viz kit: orange leads (money-in), slate for money-out.
Object.assign(jb.vizTheme, { palette: ['#FF4800', '#334155', '#1FA971', '#E8A317', '#7C3AED', '#0891B2'], accent: '#FF4800', fontFamily: "'Inter', system-ui, sans-serif" })

const ORANGE = '#FF4800',
  ORANGE_SOFT = '#FDBCA6',
  GREEN = '#1FA971',
  RED = '#D64545',
  INK = '#1A1A1A',
  MUTE = '#8A8A8A',
  SUB = '#5A5A5A',
  LINE = '#E6E6E8'

const CUBE_META = demoFinanacialCubeV2.$run()
const valuesOf = (n) => CUBE_META.dimensions.find((d) => d.name == n)?.values || []
const STATUSES = valuesOf('status'),
  PRODUCTS = valuesOf('product'),
  PAYMENTS = valuesOf('payment_method')
const COMPARE_DIMS = [
  ...CUBE_META.dimensions.map((d) => ({ id: d.name, label: sentence(d.name), sql: d.name })),
  { id: 'month', label: 'Month', sql: `strftime(date_trunc('month', date), '%Y-%m')` },
  { id: 'quarter', label: 'Quarter', sql: `year(date) || '-Q' || quarter(date)` },
  { id: 'weekday', label: 'Day of week', sql: `strftime(date, '%A')` },
  { id: 'week', label: 'Week number', sql: `strftime(date, '%G-W%V')` },
]
const CW = cubeWidgets(CUBE_META, { palette: [ORANGE, ORANGE_SOFT] })
const dateClause = (a, b) => CW.rangeWhere(a, b)
const dashWhere = (f) => [dateClause(f.start, f.end), f.segment && `customer_type = ${q(f.segment)}`].filter(Boolean).join(' AND ')
const fmtOf = CW.unitOf,
  WIDGET_FILTERS = CW.filters,
  filterLabel = CW.filterLabel,
  userWidgetSql = CW.sql,
  userWidgetSpec = CW.spec
const userWidgetWhere = (w, f) => CW.where(w, dashWhere(f))

const SEGMENTS = [
  {
    id: '',
    merchant: 'All customers',
    first: 'there',
    initials: 'ALL',
    story: 'A portfolio-wide view of every customer, product and payment method in the transaction dataset.',
  },
  {
    id: 'Consumer',
    merchant: 'Consumer portfolio',
    first: 'Consumer team',
    initials: 'CO',
    story: 'Consumer customers across countries, loyalty tiers, products and payment methods.',
  },
  {
    id: 'SMB',
    merchant: 'SMB portfolio',
    first: 'SMB team',
    initials: 'SMB',
    story: 'Small and medium business customers with their product, payment and quality performance.',
  },
  {
    id: 'Enterprise',
    merchant: 'Enterprise portfolio',
    first: 'Enterprise team',
    initials: 'ENT',
    story: 'Enterprise customers, focused on completed value, profitability, payment costs and source quality.',
  },
]
const RANGES = [
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
  { id: 'prevmonth', label: 'Previous month' },
  { id: 'custom', label: 'Custom range' },
  { id: 'all', label: 'All time', days: null },
]
const GRANS = [
  { id: 'day', label: 'D' },
  { id: 'week', label: 'W' },
  { id: 'month', label: 'M' },
]
const STATUS_TONE = { completed: ['#EAF7F1', '#1B8A5E'], pending: ['#FDF3E0', '#B9791A'], failed: ['#FBEBEB', '#C0392B'] }
const FONT_CSS = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@500;600;700&display=swap');`
// branded PDF via print CSS (zero deps): hide app chrome + .no-print, reveal print-only branded covers, keep charts whole
const PRINT_CSS = `.print-cover{display:none}
@media print{
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  @page{size:A4 portrait;margin:9mm}
  html,body{background:#fff!important}
  header,.no-print,button[title^="Pick element"]{display:none!important}
  .print-cover{display:block!important}
  .md\\:min-h-screen{min-height:0!important;background:#fff!important}
  .print-area{zoom:.72}
  .print-area svg{max-width:100%!important;height:auto!important}
  .viz-widget,tr{break-inside:avoid}
}`
// a filter change keeps the previous figures on screen, blurred, until the new ones land — no full-screen reload
const STALE_CSS = `.stale{filter:blur(2.5px);opacity:.55}`
const staleDiv = (stale, cls = '') => {
  const c = [cls, stale && 'stale'].filter(Boolean).join(' ')
  return c ? 'div:' + c : 'div'
}

// --- cube queries ------------------------------------------------------------
const addDays = (d, n) => {
  const t = new Date(d + 'T00:00:00Z')
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
const addMonths = (d, n) => {
  const t = new Date(d + 'T00:00:00Z')
  t.setUTCMonth(t.getUTCMonth() + n)
  return t.toISOString().slice(0, 10)
}
const bucketEnd = (d, gran) => (gran == 'week' ? addDays(d, 7) : gran == 'month' ? addMonths(d, 1) : addDays(d, 1)) // chart-click drills the whole bucket, not one day
const reportWhere = (f) =>
  [
    f.rangeId != 'all' && dateClause(f.start, f.end),
    f.segment && `customer_type = ${q(f.segment)}`,
    f.statuses.length && `status IN (${f.statuses.map(q).join(',')})`,
    f.product && `product = ${q(f.product)}`,
    f.payment && `payment_method = ${q(f.payment)}`,
    f.customer && `customer_id = ${q(f.customer)}`,
    f.day && (f.dayEnd ? `date >= DATE ${q(f.day)} AND date < DATE ${q(f.dayEnd)}` : `date = DATE ${q(f.day)}`),
    f.search && `(transaction_id ILIKE ${q('%' + f.search + '%')} OR customer_id ILIKE ${q('%' + f.search + '%')} OR product ILIKE ${q('%' + f.search + '%')})`,
  ]
    .filter(Boolean)
    .join(' AND ')

// Reports-table presentation SQL (cube-vocab: no FROM — the cube injects the filtered relation; WHERE arrives via entry.where)
const SORT_COL = {
  tid: 'transaction_id',
  date: 'date',
  customer: 'customer_id',
  product: 'product',
  value: 'transaction_value',
  status: 'status',
  fee: 'fee',
  quality: 'has_quality_issue',
}
const tableSql = (sortKey, dir, limit, offset) => `select transaction_id as "tid",date,customer_id as "customer",
  customer_type,product,product_category,quantity,price,payment_method,payment_channel,status,
  transaction_value as "value",round(transaction_value*fee_bps/10000,2) as "fee",
  (has_quality_issue or quantity<=0 or price<=0) as "quality"
order by ${SORT_COL[sortKey] || SORT_COL.date} ${dir} limit ${limit} offset ${offset}`
const comparisonSql = (dims, metrics) => {
  const ds = dims.map((id) => COMPARE_DIMS.find((d) => d.id == id)).filter(Boolean)
  const select = [...ds.map((d, i) => `${d.sql} as "d${i}"`), ...metrics.map((m, i) => `${m} as "m${i}"`)].join(', ')
  return `select ${select} group by ${ds.map((_, i) => i + 1).join(', ')} order by ${ds.length + 1} desc limit 100`
}
const reportSummarySql = `select txns as "n",completed_value as "completed",gross_profit as "profit",avg_order_value as "avg"`
const statusCountsSql = `select status as "s",txns as "n" group by 1`
const META = { lo: '2020-01-01', hi: '2025-06-30' }
const memo = (map, key, make, onError, cap = 80) => {
  if (!map.has(key)) {
    map.set(
      key,
      make().catch((e) => (map.delete(key), onError(e))),
    )
    map.size > cap && map.delete(map.keys().next().value)
  }
  return map.get(key)
}
const batchCache = new Map(),
  cubeBindings = new Map()

// --- formatting -------------------------------------------------------------
const compact = (n) => {
  const a = Math.abs(n || 0)
  return a >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : a >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n || 0))
}
const usd = (n) => (n < 0 ? '−$' : '$') + compact(Math.abs(n || 0))
const fmtDate = (d) => {
  const raw = String(d ?? ''),
    day = raw.match(/\d{4}-\d{2}-\d{2}/)?.[0],
    date = new Date(day ? day + 'T00:00:00Z' : d)
  return isNaN(+date) ? '—' : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

// --- scheduled reports: a definition = chosen widgets (verified reports + saved widgets) + KPI metrics + a cadence.
// Stored via demoFinancialSchedulesV2; "Run now" executes the same cube batch every screen uses.
const FREQS = [
  { v: 'daily', label: 'Daily' },
  { v: 'weekly', label: 'Weekly' },
  { v: 'monthly', label: 'Monthly' },
]
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const BLANK_SCHED = {
  title: '',
  reports: ['demoFinancialRevenueTrend'],
  widgets: [],
  metrics: ['completed_value', 'gross_profit', 'payment_fees'],
  freq: 'weekly',
  dow: 1,
  dom: 1,
  time: '08:00',
  enabled: true,
} // no recipients field: a schedule is private to its owner, so it always mails the signed-in user
const nextRun = (s) => {
  const [hh, mm] = String(s.time || '08:00')
      .split(':')
      .map(Number),
    d = new Date(),
    now = Date.now()
  d.setHours(hh, mm, 0, 0)
  for (let i = 0; i < 400; i++, d.setDate(d.getDate() + 1))
    if (+d > now && (s.freq == 'daily' || (s.freq == 'weekly' && d.getDay() == +s.dow) || (s.freq == 'monthly' && d.getDate() == +s.dom))) return d
}
const cadenceLabel = (s) => (s.freq == 'daily' ? `Every day at ${s.time}` : s.freq == 'weekly' ? `Every ${DOW[+s.dow]} at ${s.time}` : `Day ${s.dom} of each month at ${s.time}`)

const KINDS = [
  ['hbar', 'BarChartHorizontal'],
  ['bar', 'BarChart3'],
  ['pie', 'PieChart'],
  ['line', 'LineChart'],
  ['area', 'AreaChart'],
  ['kpi', 'Hash'],
  ['table', 'Table'],
]
// dashboard-publish permissions — will move to maintained jsons (per-company admins / payoneer platform admins); hard-coded for now
const COMPANY_ADMINS = ['roee@indivi.ai', 'annavo@payoneer.com']
const PLATFORM_ADMINS = ['roee@indivi.ai', 'annavo@payoneer.com']
const SAMPLE = { vars: { segment: '' } }

const REPORTS = [
  'demoFinancialTopCustomers',
  'demoFinancialTopProducts',
  'demoFinancialRevenueTrend',
  'demoFinancialFeesByMethod',
  'demoFinancialCustomerSegments',
  'demoFinancialStatusMix',
  'demoFinancialQualityRisk',
  'demoFinancialProfitability',
].map((cid) => {
  const meta = coreUtils.resolveProfileArgs(dsls.bi.report[cid][Symbol.for('asJbComp')].impl)
  return { cid, id: meta.id, q: meta.question, icon: meta.icon, widget: meta.widget }
})
const DEPTH_CATEGORY = { short: 'shortAnswer', medium: 'longAnswer', deep: 'inDepthAnswer' }
Object.entries({
  shortAnswer: 'one useful 15–30 word sentence, never one word',
  longAnswer: '3–4 concise business sentences with the headline, key drivers and material caveat',
  inDepthAnswer: '6–8 analytical sentences across 2–3 short paragraphs, covering drivers, comparisons, implications and caveats',
}).forEach(([category, length]) => {
  Doclet(`llmSummary.dataInsights.${category}`, { impl: `Write ${length}.` })
  Doclet(`essentialOutputFormat.llmSummary.${category}`, {
    impl: `Return only <LLM_SUMMARY><SHORT_ANSWER>a useful 15–30 word sentence</SHORT_ANSWER><LONG_ANSWER>${length}</LONG_ANSWER></LLM_SUMMARY>.`,
  })
})
// minimal markdown → react nodes: **bold**, `code`, # headings, ordered/bullet lists, | tables |, paragraphs
const mdInline = (h, s) =>
  String(s)
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter(Boolean)
    .map((p, i) =>
      p.startsWith('**')
        ? h('strong:font-semibold', { key: i, style: { color: INK } }, p.slice(2, -2))
        : p.startsWith('`')
          ? h('code:text-[13px] bg-[#F0F0F1] rounded px-1 py-0.5', { key: i }, p.slice(1, -1))
          : p,
    )
const renderMd = (h, md) => {
  const lines = String(md || '')
      .replace(/\r/g, '')
      .split('\n'),
    out = []
  const isRow = (ln) => /^\s*\|.*\|\s*$/.test(ln)
  const cells = (ln) =>
    ln
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim())
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i],
      heading = ln.match(/^\s*(#{1,6})\s+(.*)/),
      ordered = /^\s*\d+\.\s+/,
      bullet = /^\s*[-*]\s+/
    if (heading) {
      out.push(h(`div:font-bold text-[#1A1A1A] mt-3 mb-1${heading[1].length <= 2 ? ' text-lg' : ''}`, { key: out.length }, mdInline(h, heading[2])))
      continue
    }
    if (isRow(ln)) {
      const rows = []
      while (i < lines.length && isRow(lines[i])) rows.push(cells(lines[i++]))
      i--
      const [head, ...body] = rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)))
      out.push(
        h(
          'div:overflow-x-auto my-2',
          { key: out.length },
          h(
            'table:w-full text-sm border-collapse',
            {},
            h('thead', {}, h('tr:border-b', { style: { borderColor: LINE } }, head.map((c, j) => h('th:text-left px-2 py-1.5 font-semibold', { key: j }, mdInline(h, c))))),
            h(
              'tbody',
              {},
              body.map((r, k) =>
                h('tr:border-b last:border-0', { key: k, style: { borderColor: '#F0F0F1' } }, r.map((c, j) => h('td:px-2 py-1.5 align-top', { key: j }, mdInline(h, c)))),
              ),
            ),
          ),
        ),
      )
      continue
    }
    if (ordered.test(ln) || bullet.test(ln)) {
      const item = ordered.test(ln) ? ordered : bullet,
        items = []
      while (i < lines.length && item.test(lines[i])) items.push(h('li:leading-relaxed', { key: items.length }, mdInline(h, lines[i++].replace(item, ''))))
      i--
      out.push(h(`${item == ordered ? 'ol:list-decimal' : 'ul:list-disc'} pl-5 my-1 space-y-0.5`, { key: out.length }, items))
      continue
    }
    if (ln.trim()) out.push(h('p:leading-relaxed my-1.5', { key: out.length }, mdInline(h, ln)))
  }
  return out
}
// pull { text, widgets, followUps, sql, rows, narrative } out of a mainWorkflow result (runRes, else workflowTrace vars)
const askPayload = (wfres, depth) => {
  const { runRes } = wfres || {}
  const traceVars = Object.assign({}, ...(wfres?.workflowTrace || []).map((e) => e.setVars).filter(Boolean))
  const final = runRes && typeof runRes == 'object' && !Array.isArray(runRes) ? runRes : (traceVars.answer && { text: traceVars.answer, rows: traceVars.rows }) || {}
  const long = final.longText || final.longAnswer || '',
    short = [final.text, final.narrative, long.split(/(?<=[.!?])\s+/)[0]].find((s) => String(s || '').trim().split(/\s+/).length > 3) || final.text
  const text = (depth == 'short' ? short : long) || final.text || (typeof runRes == 'string' ? runRes : '') || traceVars.answer || 'No answer produced.'
  return {
    text,
    narrative: depth == 'short' ? '' : final.narrative,
    sql: final.sql,
    rows: final.rows || [],
    widgets: Array.isArray(final.widgets) ? final.widgets : [],
    followUps: Array.isArray(final.followUps) ? final.followUps : [],
  }
}

ReactComp('FinanceDemoDesktop', {
  impl: comp({
    hFunc:
      (ctx, { react: { h, hh, useState, useEffect } }) =>
      () => {
        const VizWidget = dsls.react['react-comp'].VizWidget
        const mobileDemo = !!ctx.vars.mobileDemo
        const mdUp = (cls) => (mobileDemo ? '' : cls) // md: desktop-restores — omitted in the phone frame, where media queries track the window, not the 390px frame
        const byWidth = (narrow, wide) => (mobileDemo ? narrow : h('div', {}, h('div:md:hidden', {}, narrow), h('div:hidden md:block', {}, wide)))
        const logoParam = new URLSearchParams(globalThis.location?.search || '').get('logo') || ctx.vars.logo
        const brand = { payoneer: { name: 'Payoneer', mark: true } }[logoParam] || { name: 'Finance' }
        const [segment, setSegment] = useState(ctx.vars.segment || ''),
          [menu, setMenu] = useState(false)
        const screenParam = new URLSearchParams(globalThis.location?.search || '').get('screen')
        const [screen, setScreen] = useState({ reports: 'reports', compare: 'reports', ...(mobileDemo ? {} : { schedules: 'schedules' }), ask: 'ask' }[screenParam] || 'home')
        const meta = META
        const [rangeId, setRangeId] = useState('30d'),
          [gran, setGran] = useState('week')
        const [cStart, setCStart] = useState(''),
          [cEnd, setCEnd] = useState('')
        const [showFilters, setShowFilters] = useState(false),
          [repView, setRepView] = useState(screenParam == 'compare' ? 'compare' : 'summary'),
          [toast, setToast] = useState(null)
        const [home, setHome] = useState(null)
        const [cmpDims, setCmpDims] = useState(['customer_type']),
          [cmpMetrics, setCmpMetrics] = useState(['completed_value', 'gross_profit'])
        const [search, setSearch] = useState(''),
          [statuses, setStatuses] = useState([]),
          [product, setProduct] = useState(''),
          [payment, setPayment] = useState(''),
          [customer, setCustomer] = useState(''),
          [day, setDay] = useState(''),
          [dayEnd, setDayEnd] = useState('')
        const [rSort, setRSort] = useState('date'),
          [rDir, setRDir] = useState('DESC'),
          [page, setPage] = useState(0),
          [perPage, setPerPage] = useState(25)
        const [rep, setRep] = useState(null),
          [detail, setDetail] = useState(null),
          [colMenu, setColMenu] = useState(false),
          [cols, setCols] = useState(['tid', 'date', 'customer', 'product', 'value', 'fee', 'status', 'quality'])
        const [messages, setMessages] = useState([]),
          [ask, setAsk] = useState(''),
          [busy, setBusy] = useState(false),
          [status, setStatus] = useState(null),
          [showData, setShowData] = useState({}),
          [depth, setDepth] = useState('medium')
        // self-serve widget builder + per-user saved widgets
        const [showBuilder, setShowBuilder] = useState(new URLSearchParams(globalThis.location?.search || '').get('builder') == '1'),
          [myWidgets, setMyWidgets] = useState([]),
          [myData, setMyData] = useState({})
        const [companyWidgets, setCompanyWidgets] = useState([]),
          [globalWidgets, setGlobalWidgets] = useState([])
        const [schedules, setSchedules] = useState([]),
          [sched, setSched] = useState(null) // sched: the definition being edited (null = list view)
        const [schedPreview, setSchedPreview] = useState(null)
        const [bTitle, setBTitle] = useState(''),
          [bMetric, setBMetric] = useState('completed_value'),
          [bDim, setBDim] = useState('product'),
          [bKind, setBKind] = useState('hbar'),
          [bGrain, setBGrain] = useState('month'),
          [bLimit, setBLimit] = useState(10),
          [bPreview, setBPreview] = useState(null)
        const [bMetric2, setBMetric2] = useState(''),
          [bFilters, setBFilters] = useState({}),
          [bEditId, setBEditId] = useState(null)
        const userId = ctx.vars.userId || (globalThis.localStorage && JSON.parse(localStorage.getItem('auth2') || '{}')?.sub) || 'anon'
        const userEmail = (globalThis.localStorage && JSON.parse(localStorage.getItem('auth2') || '{}')?.email) || ''
        const company = userEmail.split('@')[1] || '' // email domain = the user's company; keys the per-company widgets json
        const mailTo = userEmail || 'your account email' // scheduled reports go to the signed-in user only — never a typed-in address
        const ctCtx = ctx.setVars({ roomId: ctx.vars.roomId || FINANCE_ROOM, userId, instanceId: company })

        const queryError = (error) => (ctx.vars.errorLogger?.error?.({ t: 'finance.query.error', error: String(error?.message || error) }, {}, { ctx }), [])
        const fetchEntries = async (entries) => {
          const t0 = performance.now()
          let res
          if (WASM) {
            const base = await memo(cubeBindings, 'demoFinanacialCubeV2', async () => wasmCtx(ctx).run(setupCube(demoFinanacialCubeV2())), queryError)
            if (!base?.setVars) return []
            res = await Promise.all(
              entries.map((e) =>
                base
                  .setVars({ ...(e.vars || {}), depth: e.depth || 'medium', cubeWhere: e.where || '' })
                  .run(e.report ? dsls.bi.report[e.report]() : cubeQuery({ sql: e.sql, where: e.where || '' }))
                  .catch((err) => ({ error: String(err?.message || err) })),
              ),
            )
          } else res = await invokeSnippetInContext.$runWithCtx(ctx.setVars({ roomWUrl: ctx.vars.roomWUrl || `room://${FINANCE_ROOM}` }), runFinanceReportBatch({ entries }))
          console.debug(`finance.batch ${WASM ? 'wasm' : 'lambda'} ${entries.length} entries ${Math.round(performance.now() - t0)}ms`)
          const error = res?.error || (Array.isArray(res) && res.find((r) => r?.error)?.error)
          return error ? queryError(error) : Array.isArray(res) ? res : []
        }
        const runEntries = (entries, cache = true) =>
          cache ? memo(batchCache, JSON.stringify([segment, entries]), () => fetchEntries(entries), queryError) : fetchEntries(entries)
        const bounds = () => {
          const r = RANGES.find((x) => x.id == rangeId)
          if (rangeId == 'custom') return { start: cStart || meta.lo, end: cEnd || meta.hi }
          if (rangeId == 'prevmonth') {
            const ms = meta.hi.slice(0, 8) + '01'
            return { start: addMonths(ms, -1), end: addDays(ms, -1) }
          } // anchored to data max (meta.hi), never now()
          return { start: r.days == null ? meta.lo : addDays(meta.hi, -r.days), end: meta.hi }
        }
        const P = SEGMENTS.find((p) => p.id == segment) || SEGMENTS[0]
        const rangeLabel = rangeId == 'custom' && meta ? `${fmtDate(cStart || meta.lo)} – ${fmtDate(cEnd || meta.hi)}` : RANGES.find((r) => r.id == rangeId).label.toLowerCase()

        useEffect(() => {
          if (!meta || screen != 'home') return
          setHome((prev) => prev && { ...prev, stale: true }) // keep the old figures, blurred, while the new range loads
          const f = { segment, ...bounds() }
          runEntries([
            { report: 'demoFinancialSummary', where: dashWhere(f) },
            { report: 'demoFinancialRevenueTrend', where: dashWhere(f), vars: { gran } },
            { report: 'demoFinancialTopCustomers', where: dashWhere(f) },
            { report: 'demoFinancialTopProducts', where: dashWhere(f) },
          ])
            .then(([c, vol, customers, products]) => setHome({ c: c.rows[0], vol: vol.rows, customers: customers.rows.slice(0, 5), products: products.rows.slice(0, 5) }))
            .catch((e) => setHome({ error: String(e.message || e) }))
        }, [meta, screen, segment, rangeId, cStart, cEnd, gran])

        useEffect(() => {
          if (!meta || screen != 'reports') return
          const f = { rangeId, ...bounds(), segment, statuses, product, payment, customer, day, dayEnd, search: search.trim() }
          setRep((r) => ({ ...r, busy: true }))
          const rw = reportWhere(f)
          const entries = [
            { sql: tableSql(rSort, rDir, perPage, page * perPage), where: rw },
            { sql: reportSummarySql, where: rw },
            { sql: statusCountsSql, where: reportWhere({ ...f, statuses: [] }) },
          ]
          if (repView == 'fees') entries.push({ report: 'demoFinancialFeesByMethod', where: rw })
          if (repView == 'profitability') entries.push({ report: 'demoFinancialProfitability', where: rw })
          if (repView == 'compare') entries.push({ sql: comparisonSql(cmpDims, cmpMetrics), where: rw })
          let gone = false // debounce typing; only the newest request may paint — a slower stale response must not overwrite it
          const t = setTimeout(
            () =>
              runEntries(entries)
                .then(([rows, sum, sc, extra]) => {
                  if (gone) return
                  const counts = {}
                  sc.forEach((x) => (counts[x.s] = +x.n))
                  setRep({
                    rows,
                    total: +sum[0]?.n || 0,
                    completed: +sum[0]?.completed || 0,
                    profit: +sum[0]?.profit || 0,
                    avg: +sum[0]?.avg || 0,
                    counts,
                    fees: repView == 'fees' ? extra : null,
                    profitability: repView == 'profitability' ? extra : null,
                    compare: repView == 'compare' ? extra : null,
                  })
                })
                .catch((e) => gone || setRep({ error: String(e.message || e), rows: [], counts: {} })),
            search ? 250 : 0,
          )
          return () => ((gone = true), clearTimeout(t))
        }, [meta, screen, segment, rangeId, cStart, cEnd, statuses, product, payment, customer, day, dayEnd, search, rSort, rDir, page, perPage, repView, cmpDims, cmpMetrics])

        useEffect(() => {
          wGet(demoFinancialUserWidgetsV2, ctCtx).then((ws) => setMyWidgets(Array.isArray(ws) ? ws : []))
          company && wGet(demoFinancialCompanyWidgetsV2, ctCtx).then((ws) => setCompanyWidgets(Array.isArray(ws) ? ws : []))
          wGet(demoFinancialGlobalWidgetsV2, ctCtx).then((ws) => setGlobalWidgets(Array.isArray(ws) ? ws : []))
          wGet(demoFinancialSchedulesV2, ctCtx).then((ss) => setSchedules(Array.isArray(ss) ? ss : []))
        }, [])

        const allWidgets = [...myWidgets, ...companyWidgets, ...globalWidgets]
        // one saved widget → one cube entry. report pins re-run the verified report, AI pins keep their fixed SQL, cube widgets follow the dashboard filters
        const widgetEntry = (w, f) =>
          w.type == 'report' ? { report: w.cid, depth, where: dashWhere(f) } :
            w.type == 'pinned' ? { sql: w.sql } : { sql: userWidgetSql(w), where: userWidgetWhere(w, f) }
        useEffect(() => {
          // saved-widget data — cube widgets, report pins and pinned Ask-AI queries are all cube entries now, so ONE batch serves them all
          if (!meta || !allWidgets.length || screen != 'home') return
          const f = { segment, ...bounds() }
          runEntries(allWidgets.map((w) => widgetEntry(w, f)))
            .then((res) => setMyData((d) => ({ ...d, ...Object.fromEntries(allWidgets.map((w, i) => [w.id, res[i] || []])) })))
            .catch((e) => showToast('My widgets failed: ' + String(e?.message || e), 'error'))
        }, [meta, myWidgets, companyWidgets, globalWidgets, screen, segment, rangeId, cStart, cEnd])

        // default title: "Money in vs Money out by Date" (kpi has no dimension part)
        const bDefaultTitle = `${sentence(bMetric)}${bMetric2 ? ' vs ' + sentence(bMetric2) : ''}${bKind == 'kpi' ? '' : ` by ${bDim.replace(/"/g, '')}`}`
        useEffect(() => {
          // live builder preview
          if (!showBuilder || !meta) return
          setBPreview(null)
          const w = {
            title: bTitle || bDefaultTitle,
            metric: bMetric,
            ...(bMetric2 ? { metric2: bMetric2 } : {}),
            dimension: bDim,
            kind: bKind,
            grain: bGrain,
            limit: bLimit,
            filters: bFilters,
          }
          runEntries([{ sql: userWidgetSql(w), where: userWidgetWhere(w, { segment, ...bounds() }) }])
            .then(([rows]) => setBPreview({ w, rows }))
            .catch((e) => setBPreview({ error: String(e?.message || e) }))
        }, [showBuilder, bMetric, bMetric2, bDim, bKind, bGrain, bLimit, bTitle, bFilters, meta, segment, rangeId, cStart, cEnd])

        useEffect(() => {
          // live preview of the schedule being edited — the sections its run will produce
          if (!sched || !meta) return
          setSchedPreview(null)
          runEntries(schedEntries(sched))
            .then((res) => setSchedPreview({ s: sched, res }))
            .catch((e) => setSchedPreview({ error: String(e?.message || e) }))
        }, [sched && [sched.reports, sched.widgets, sched.metrics].join('|'), meta, segment, rangeId, cStart, cEnd])

        const closeBuilder = () => {
          setShowBuilder(false)
          setBEditId(null)
        }
        const editWidget = (w) => {
          // cube widgets only: reopen the builder pre-filled from the saved spec
          setBEditId(w.id)
          setBTitle(w.title || '')
          setBMetric(w.metric)
          setBMetric2(w.metric2 || '')
          setBDim(w.dimension)
          setBKind(w.kind)
          setBGrain(w.grain || 'month')
          setBLimit(w.limit || 10)
          setBFilters(w.filters || {})
          setShowBuilder(true)
        }
        // widget stores: private (default save), company dashboard (per email-domain json) and all-users json — the last two admin-published
        const STORES = [
          { ct: demoFinancialUserWidgetsV2, list: myWidgets, set: setMyWidgets, label: 'My widgets', note: '· private to you', icon: 'LayoutGrid', mine: true },
          {
            ct: demoFinancialCompanyWidgetsV2,
            list: companyWidgets,
            set: setCompanyWidgets,
            label: 'Company dashboard',
            note: `· everyone at ${company}`,
            icon: 'Building2',
            admin: !!company && COMPANY_ADMINS.includes(userEmail),
            publish: 'Publish to company dashboard',
          },
          {
            ct: demoFinancialGlobalWidgetsV2,
            list: globalWidgets,
            set: setGlobalWidgets,
            label: 'Shared with all users',
            note: '· all companies',
            icon: 'Globe',
            admin: PLATFORM_ADMINS.includes(userEmail),
            publish: 'Publish to all users',
          },
        ]
        const builderWidget = () => {
          const filters = Object.fromEntries(Object.entries(bFilters).filter(([, v]) => v))
          return {
            id: Math.random().toString(36).slice(2, 10),
            title: bPreview.w.title,
            metric: bMetric,
            ...(bMetric2 ? { metric2: bMetric2 } : {}),
            dimension: bDim,
            kind: bKind,
            grain: bGrain,
            limit: bLimit,
            ...(Object.keys(filters).length ? { filters } : {}),
            createdAt: Date.now(),
          }
        }
        const resetBuilder = () => {
          closeBuilder()
          setBTitle('')
          setBMetric2('')
          setBFilters({})
        }
        const saveWidget = async () => {
          const w = builderWidget()
          const store = STORES.find((s) => s.list.some((x) => x.id == bEditId)) || STORES[0] // edits save back to the store the widget lives in; new widgets are private
          const next = bEditId ? store.list.map((x) => (x.id == bEditId ? { ...w, id: bEditId, createdAt: x.createdAt } : x)) : [...store.list, w]
          await wPut(store.ct, next, ctCtx)
          store.set(next)
          resetBuilder()
          showToast(bEditId ? 'Widget updated.' : 'Widget saved — only you can see it.', 'success')
        }
        const publishWidget = async (store) => {
          const next = [...store.list, builderWidget()]
          await wPut(store.ct, next, ctCtx)
          store.set(next)
          resetBuilder()
          showToast(`Published — ${store.note.slice(2)}.`, 'success')
        }
        const removeWidget = async (store, w) => {
          const next = store.list.filter((x) => x.id != w.id)
          await wPut(store.ct, next, ctCtx)
          store.set(next)
        }

        const resetReports = () => {
          setSearch('')
          setStatuses([])
          setProduct('')
          setPayment('')
          setCustomer('')
          setDay('')
          setDayEnd('')
          setPage(0)
        }
        const goReports = (extra) => {
          resetReports()
          extra?.customer && setCustomer(extra.customer)
          extra?.product && setProduct(extra.product)
          extra?.day && (setDay(extra.day), setDayEnd(extra.dayEnd || ''))
          setScreen('reports')
        }
        const clearFilters = resetReports
        const switchAccount = (fn) => {
          fn()
          setMenu(false)
          resetReports()
        }
        const showToast = (msg, tone = 'info') => {
          setToast({ msg, tone })
          setTimeout(() => setToast(null), 3200)
        }
        const exportCsv = async () => {
          try {
            const f = { rangeId, ...bounds(), segment, statuses, product, payment, customer, day, dayEnd, search: search.trim() }
            const rows = (await runEntries([{ sql: tableSql(rSort, rDir, 100000, 0), where: reportWhere(f) }], false))[0] || [] // 100k rows: stream it, never hold it in the cache
            if (!rows.length) return showToast('No transactions match the current filter — nothing to export.', 'info')
            const cols = Object.keys(rows[0]),
              csv = [cols.join(','), ...rows.map((r) => cols.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
            const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
            const a = document.createElement('a')
            a.href = url
            a.download = `finance3_${segment || 'all'}.csv`
            a.click()
            URL.revokeObjectURL(url)
            showToast(`Exported ${rows.length.toLocaleString()} rows.`, 'success')
          } catch (e) {
            showToast('Export failed: ' + String(e?.message || e), 'error')
          }
        }

        // verified reports and chart drill-downs use the same cube batch path as dashboard widgets
        const drillSql = async (sql) => (await runEntries([{ sql }]))[0] || []
        const runReportPayload = async (cid) => (await runEntries([{ report: cid, depth, where: dashWhere({ segment, ...bounds() }) }]))[0]
        const runVerified = async (entry) => {
          if (busy) return
          setAsk('')
          setScreen('ask')
          setBusy(true)
          setStatus({ t: 'Running verified report…' })
          setMessages((m) => [...m, { role: 'user', text: entry.q }])
          try {
            const res = await runReportPayload(entry.cid)
            setMessages((m) => [...m, { role: 'assistant', ...res }])
          } catch (e) {
            setMessages((m) => [...m, { role: 'assistant', text: 'Report failed: ' + String(e?.message || e) }])
          } finally {
            setBusy(false)
            setStatus(null)
          }
        }
        const pinWidget = async (m, w, question) => {
          if (!m.verified && !m.sql) return showToast('This answer has no SQL to pin.', 'error')
          const base = { id: Math.random().toString(36).slice(2, 10), title: w.title || 'From Ask AI', kind: w.kind, createdAt: Date.now() }
          const entry = m.verified
            ? { ...base, type: 'report', cid: REPORTS.find((r) => r.id == m.id)?.cid, question: m.question }
            : { ...base, type: 'pinned', valueFormat: w.valueFormat, question, sql: String(m.sql) }
          const next = [...myWidgets, entry]
          await wPut(demoFinancialUserWidgetsV2, next, ctCtx)
          setMyWidgets(next)
          showToast('Added to your dashboard — only you can see it.', 'success')
        }
        const runAsk = async (question) => {
          const q = (question || '').trim()
          if (!q || busy) return
          setAsk('')
          setBusy(true)
          setStatus(null)
          setMessages((m) => [...m, { role: 'user', text: q }])
          const onProgress = (e) => (e?.t || e?.pct != null) && setStatus({ t: e.t, pct: e.pct }) // in-browser flow status + live LLM token bar
          coreUtils.eventEmitter.on('progress', onProgress)
          const category = DEPTH_CATEGORY[depth],
            guide = coreUtils.sourceRefs.strip(jb.workflowUtils.docletContent(`llmSummary.dataInsights.${category}`, ctx))
          const userMessage = `${q}\n\nANSWER DEPTH:\n${guide}\nSet llmSummary summaryCategories to 'dataInsights,${category}'.`
          const wfVars = {
            userMessage,
            llmProxyUrl: 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy',
            categories: { finance: true, local: true, viz: true, [category]: true },
            accumulatedContext: { chatHistory: [] },
          }
          try {
            const wfres = WASM
              ? await dsls.workflow.workflow.financeAnalytics.$run().calcWorkflow(await Promise.resolve(wasmCtx(ctx.setVars(wfVars)).run(setupCube(demoFinanacialCubeV2()))))
              : await ctx.setVars({ roomWUrl: ctx.vars.roomWUrl || `room://${FINANCE_ROOM}` }).run(invokeSnippetInContext(runFinanceAnalytics({ userMessage })))
            setMessages((m) => [...m, { role: 'assistant', ...askPayload(wfres, depth) }])
          } catch (e) {
            setMessages((m) => [...m, { role: 'assistant', text: 'Something went wrong: ' + String(e?.message || e) }])
          } finally {
            coreUtils.eventEmitter.off('progress', onProgress)
            setBusy(false)
            setStatus(null)
          }
        }

        // --- reusable bits ---
        const head = (txt, cls = '') => h('span:' + cls, { style: { fontFamily: "'Poppins', 'Inter', sans-serif" } }, txt)
        const iconBtn = (icon, badge) =>
          h(
            'button:relative w-10 h-10 grid place-items-center rounded-full text-[#5A5A5A] hover:bg-slate-100',
            {},
            h('L:' + icon, { size: 19 }),
            badge &&
              h(
                'span:absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 grid place-items-center rounded-full text-[10px] font-bold text-white',
                { style: { background: ORANGE } },
                badge,
              ),
          )
        const dropdown = (val, set, opts, icon) =>
          h(
            'div:relative',
            {},
            h(
              'select:appearance-none rounded-lg border bg-white pr-9 py-2 text-sm font-medium text-[#1A1A1A] cursor-pointer',
              { style: { borderColor: LINE, paddingLeft: icon ? '34px' : '14px' }, value: val, onChange: (e) => set(e.target.value) },
              opts.map((o) => h('option', { key: o.v, value: o.v }, o.label)),
            ),
            icon && h('L:' + icon, { size: 15, className: 'absolute left-3 top-2.5 text-[#8A8A8A] pointer-events-none' }),
            h('L:ChevronDown', { size: 15, className: 'absolute right-2.5 top-2.5 text-[#8A8A8A] pointer-events-none' }),
          )
        const primaryBtn = (label, icon, onClick) =>
          h(
            'button:inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white',
            { style: { background: ORANGE, borderRadius: '9px' }, onClick },
            h('L:' + icon, { size: 16 }),
            label,
          )
        const ghostBtn = (label, icon, onClick) =>
          h(
            'button:inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#1A1A1A] bg-white border',
            { style: { borderColor: LINE, borderRadius: '9px' }, onClick },
            h('L:' + icon, { size: 16 }),
            label,
          )
        const pill = (s) => {
          const [bg, fg] = STATUS_TONE[s] || ['#F0F0F1', '#5A5A5A']
          return h('span:inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize', { style: { background: bg, color: fg } }, s)
        }
        const customRange = () =>
          rangeId == 'custom' &&
          meta &&
          h(
            'div:flex items-center gap-1.5',
            {},
            h('input:rounded-lg border bg-white px-2.5 py-2 text-sm text-[#1A1A1A]', {
              type: 'date',
              value: cStart || meta.lo,
              min: meta.lo,
              max: meta.hi,
              style: { borderColor: LINE },
              onChange: (e) => (setCStart(e.target.value), setPage(0)),
            }),
            h('span:text-sm text-[#8A8A8A]', {}, '–'),
            h('input:rounded-lg border bg-white px-2.5 py-2 text-sm text-[#1A1A1A]', {
              type: 'date',
              value: cEnd || meta.hi,
              min: meta.lo,
              max: meta.hi,
              style: { borderColor: LINE },
              onChange: (e) => (setCEnd(e.target.value), setPage(0)),
            }),
          )
        // print-only branded cover shown on the printed PDF (hidden on screen via .print-cover)
        const printCover = (title) =>
          h(
            'div:print-cover mb-4 pb-3 border-b',
            { style: { borderColor: LINE } },
            head(brand.name, 'block text-xl font-bold text-[#1A1A1A]'),
            h('div:text-2xl font-bold text-[#1A1A1A] mt-2', {}, title),
            h('div:text-sm text-[#8A8A8A] mt-1', {}, `${cap(rangeLabel)} · Dataset dollars · ${P.merchant}`),
          )
        const logo = h(
          'div:flex items-center gap-2',
          {},
          brand.mark &&
            h(
              'svg:h-7 w-7',
              { viewBox: '0 0 24 24', fill: 'none' },
              h('circle', { cx: 12, cy: 12, r: 9, stroke: 'url(#pg)', strokeWidth: 3 }),
              h(
                'defs',
                {},
                h(
                  'linearGradient',
                  { id: 'pg', x1: 2, y1: 2, x2: 22, y2: 22 },
                  h('stop', { offset: 0, stopColor: '#FF4800' }),
                  h('stop', { offset: 0.45, stopColor: '#E8127D' }),
                  h('stop', { offset: 0.75, stopColor: '#7C3AED' }),
                  h('stop', { offset: 1, stopColor: '#0891B2' }),
                ),
              ),
            ),
          head(brand.name, 'text-xl font-bold text-[#1A1A1A]'),
        )
        const NAV = [
          ['home', 'Home', 'Home'],
          ['reports', 'Reports', 'Table'],
          ['schedules', 'Schedules', 'CalendarClock'],
          ['ask', 'Ask AI', 'Sparkles'],
        ]
        // phones: no Schedules, no Compare (it lives inside Reports) — three tabs only
        const MOBILE_NAV = [
          ['home', 'Home', 'Home'],
          ['reports', 'Reports', 'Table'],
          ['ask', 'AI', 'Sparkles'],
        ]
        const nav =
          !mobileDemo &&
          h(
            'nav:hidden md:flex md:ml-8 items-center gap-7',
            {},
            NAV.map(([id, label]) =>
              h(
                'button:relative py-4 text-[15px]',
                { key: id, className: screen == id ? 'font-semibold text-[#1A1A1A]' : 'font-medium text-[#5A5A5A] hover:text-[#1A1A1A]', onClick: () => setScreen(id) },
                label,
                screen == id && h('span:absolute left-0 right-0 bottom-0 h-0.5 rounded', { style: { background: ORANGE } }),
              ),
            ),
          )
        const mobileNav = h(
          `nav:${mobileDemo ? '' : 'md:hidden'} z-40 bg-white border-t flex no-print shrink-0`,
          { style: { borderColor: LINE } },
          MOBILE_NAV.map(([id, label, icon]) =>
            h(
              'button:flex-1 flex flex-col items-center gap-0.5 py-2',
              { key: id, className: screen == id ? 'text-[#FF4800]' : 'text-[#8A8A8A]', onClick: () => setScreen(id) },
              h('L:' + icon, { size: 20 }),
              h('span:text-[11px] font-medium', {}, label),
            ),
          ),
        )
        const avatar = h(
          'div:relative',
          {},
          h(
            'button:flex items-center gap-2 pl-1',
            { onClick: () => setMenu((m) => !m) },
            h('span:w-9 h-9 grid place-items-center rounded-full text-white text-xs font-bold', { style: { background: ORANGE } }, P.initials),
            !mobileDemo && h('span:text-sm font-medium text-[#1A1A1A] hidden sm:block max-w-[130px] leading-tight text-left', {}, P.merchant),
            h('L:ChevronDown', { size: 15, className: 'text-[#8A8A8A]' }),
          ),
          menu &&
            h(
              'div:absolute right-0 mt-2 w-80 rounded-xl border bg-white shadow-xl z-50 p-2',
              { style: { borderColor: LINE } },
              h('div:px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#8A8A8A]', {}, 'Customer segment'),
              SEGMENTS.map((p) =>
                h(
                  `button:w-full flex items-start gap-2.5 rounded-lg px-2 py-2 text-left ${p.id == segment ? 'bg-[#FFF0EB]' : 'hover:bg-slate-50'}`,
                  { key: p.id, onClick: () => switchAccount(() => setSegment(p.id)) },
                  h(
                    'span:w-7 h-7 shrink-0 grid place-items-center rounded-full text-white text-[10px] font-bold mt-0.5',
                    { style: { background: p.id == segment ? ORANGE : '#C7C7CC' } },
                    p.initials,
                  ),
                  h(
                    'span:min-w-0 flex-1',
                    {},
                    h('span:block text-sm font-medium text-[#1A1A1A]', {}, p.merchant),
                    h('span:block text-xs text-[#8A8A8A] leading-snug mt-0.5', {}, p.story),
                    p.id == segment && h('span:block text-[11px] font-semibold text-[#FF4800] mt-0.5', {}, 'Active'),
                  ),
                ),
              ),
            ),
        )
        const header = h(
          'header:sticky top-0 z-40 bg-white border-b',
          { style: { borderColor: LINE } },
          h(
            'div:mx-auto max-w-[1320px] flex items-center px-5',
            {},
            logo,
            nav,
            h('div:ml-auto flex items-center gap-1', {}, !mobileDemo && iconBtn('HelpCircle'), !mobileDemo && iconBtn('Bell', '3'), h('div:ml-1', {}, avatar)),
          ),
        )

        const card = (...kids) => h('div:rounded-2xl border bg-white', { style: { borderColor: LINE } }, ...kids)
        // waiting has two causes: no meta yet = discovering the data's date range; meta but no screen data = running the range's figures.
        const loadingState = () =>
          h(
            'div:p-16 flex flex-col items-center gap-3 text-[#8A8A8A]',
            {},
            h('L:Loader2', { size: 22, className: 'animate-spin' }),
            h('div:text-sm', {}, meta ? `Loading ${cap(rangeLabel)} figures for ${P.merchant}…` : 'Reading your transaction date range…'),
          )
        const barRow = (name, value, max, color, soft) =>
          h(
            'div',
            {},
            h(
              'div:flex items-baseline justify-between gap-3',
              {},
              h('span:text-sm text-[#1A1A1A] truncate', {}, name),
              h('span:text-sm font-bold text-[#1A1A1A] tabular-nums shrink-0', {}, usd(value)),
            ),
            h(
              'div:h-2 rounded-full mt-1.5',
              { style: { background: '#F0EFEE' } },
              h('div:h-full rounded-full', { style: { width: (max ? Math.max(6, (value / max) * 100) : 0) + '%', background: color } }),
            ),
          )
        const rankCard = (title, rows, color, filter) =>
          card(
            h(
              'div:p-5',
              {},
              head(title, 'block text-base font-bold text-[#1A1A1A] mb-4'),
              h(
                'div:space-y-3.5',
                {},
                (rows || []).map((r, i) =>
                  h('button:w-full text-left', { key: i, onClick: () => goReports({ [filter]: r.name }) }, barRow(r.name, r.value, rows[0]?.value, color)),
                ),
              ),
            ),
          )

        // --- SELF-SERVE WIDGETS ---
        const newWidgetBtn = ghostBtn('New widget', 'Plus', () => {
          setBEditId(null)
          setShowBuilder(true)
        })
        const drillMyWidget = (w, e) => {
          // click-through to Reports: customers filter by ID, dates by the clicked bucket
          if (w.type || w.kind == 'kpi' || !e?.name) return
          if (w.dimension == 'customer_id') return goReports({ customer: e.name })
          if (w.dimension == 'date') {
            const r = (myData[w.id] || []).find((x) => fmtBucket(x.name, w.grain) == e.name),
              d = r && String(r.name).slice(0, 10)
            d && goReports({ day: d, dayEnd: bucketEnd(d, w.grain || 'month') })
          }
        }
        // spec per widget type: report pin → the re-run report's widget; AI pin → rows through the shared rowsToSpec; cube → M-map spec
        const specFor = (w, d) =>
          w.type == 'report'
            ? { ...(d.widgets?.[0] || {}), title: '' }
            : w.type == 'pinned'
              ? { kind: w.kind, valueFormat: w.valueFormat, ...jb.vizUtils.rowsToSpec(w.kind, d), title: '' }
              : { ...userWidgetSpec(w, d), title: '' }
        const savedSpec = (w) => specFor(w, myData[w.id])
        const pinBadge = (w) =>
          (w.type == 'report' || w.type == 'pinned') &&
          h(
            'button:inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold rounded-full px-1.5 py-0.5 no-print',
            {
              title: w.question ? 'Re-ask: ' + w.question : 'from Ask AI',
              style: w.type == 'report' ? { background: '#EAF7F1', color: '#1B8A5E' } : { background: '#F0F0F1', color: MUTE },
              onClick: () => (w.type == 'report' ? runVerified(REPORTS.find((r) => r.cid == w.cid)) : w.question && (setScreen('ask'), runAsk(w.question))),
            },
            h('L:' + (w.type == 'report' ? 'BadgeCheck' : 'Sparkles'), { size: 11 }),
            w.type == 'report' ? 'verified' : 'Ask AI',
          )
        const widgetSections = () =>
          STORES.filter((s) => s.list.length > 0).map((s) =>
            h(
              'section',
              { key: s.label },
              h(
                'div:flex items-center gap-2 mb-3',
                {},
                h('L:' + s.icon, { size: 16, style: { color: ORANGE } }),
                head(s.label, 'text-base font-bold text-[#1A1A1A]'),
                h('span:text-xs text-[#8A8A8A]', {}, s.note),
              ),
              h(
                'div:grid grid-cols-1 lg:grid-cols-2 gap-5',
                {},
                s.list.map((w) =>
                  h(
                    'div',
                    { key: w.id },
                    card(
                      h(
                        'div:p-5',
                        {},
                        h(
                          'div:flex items-center justify-between gap-2 mb-1',
                          {},
                          h(
                            'div:flex items-center gap-2 min-w-0',
                            {},
                            head(w.title, 'text-base font-bold text-[#1A1A1A] truncate'),
                            pinBadge(w),
                            filterLabel(w) && h('span:text-[10px] text-[#8A8A8A] rounded-full border px-1.5 py-0.5 shrink-0', { style: { borderColor: LINE } }, filterLabel(w)),
                          ),
                          h(
                            'div:flex items-center gap-1 shrink-0 no-print',
                            {},
                            (s.mine || s.admin) &&
                              !w.type &&
                              h(
                                'button:w-7 h-7 grid place-items-center rounded-lg text-[#C7C7CC] hover:bg-slate-100 hover:text-[#5A5A5A]',
                                { title: 'Edit widget', onClick: () => editWidget(w) },
                                h('L:Pencil', { size: 14 }),
                              ),
                            (s.mine || s.admin) &&
                              h(
                                'button:w-7 h-7 grid place-items-center rounded-lg text-[#C7C7CC] hover:bg-red-50 hover:text-red-500',
                                { title: 'Delete widget', onClick: () => removeWidget(s, w) },
                                h('L:Trash2', { size: 14 }),
                              ),
                          ),
                        ),
                        myData[w.id]
                          ? hh(ctx, VizWidget, { spec: { width: 560, height: 280, ...savedSpec(w) }, onEvent: (e) => drillMyWidget(w, e) })
                          : h('div:py-10 text-center text-[#8A8A8A]', {}, h('L:Loader2', { size: 18, className: 'animate-spin inline' })),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          )
        const builderField = (label, el, hint) =>
          h(
            'div',
            {},
            h('div:text-[11px] font-semibold uppercase tracking-wide text-[#8A8A8A] mb-1.5', {}, label),
            el,
            hint && h('div:text-xs text-[#8A8A8A] mt-1 leading-snug', {}, hint),
          )
        const builder =
          showBuilder &&
          (() => {
            // full-screen "new tab" overlay: pick metric × dimension × chart over the cube, live preview, save
            const mSel = CUBE_META.metrics.find((m) => m.name == bMetric),
              dSel = CUBE_META.dimensions.find((d) => d.name == bDim)
            const preview = bPreview?.rows
            return h(
              'div:fixed inset-0 z-[80] overflow-auto no-print',
              { style: { background: '#F7F7F8' } },
              h(
                'header:sticky top-0 z-10 bg-white border-b',
                { style: { borderColor: LINE } },
                h(
                  'div:mx-auto max-w-[1100px] flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2.5',
                  {},
                  h(
                    'span:w-8 h-8 shrink-0 grid place-items-center rounded-lg',
                    { style: { background: '#FFF0EB', color: ORANGE } },
                    h('L:' + (bEditId ? 'Pencil' : 'Plus'), { size: 16 }),
                  ),
                  head(bEditId ? 'Edit widget' : 'New widget', 'text-lg font-bold text-[#1A1A1A] shrink-0 whitespace-nowrap'),
                  h('span:text-xs text-[#8A8A8A] shrink truncate hidden sm:block', {}, `· ${P.merchant} · ${cap(rangeLabel)} · private to you`),
                  h(
                    'div:ml-auto flex flex-wrap items-center justify-end gap-2',
                    {},
                    ...STORES.filter((s) => s.admin).map((s) =>
                      h(
                        'button:inline-flex shrink-0 whitespace-nowrap items-center gap-2 px-4 py-2 text-sm font-medium text-[#1A1A1A] bg-white border disabled:opacity-40',
                        { key: s.label, style: { borderColor: LINE, borderRadius: '9px' }, disabled: !preview?.length, onClick: () => publishWidget(s) },
                        h('L:' + s.icon, { size: 16 }),
                        s.publish,
                      ),
                    ),
                    h(
                      'button:inline-flex shrink-0 whitespace-nowrap items-center gap-2 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40',
                      { style: { background: ORANGE, borderRadius: '9px' }, disabled: !preview?.length, onClick: saveWidget },
                      h('L:Check', { size: 16 }),
                      'Save widget',
                    ),
                    h(
                      'button:w-9 h-9 shrink-0 grid place-items-center rounded-lg text-[#5A5A5A] hover:bg-slate-100',
                      { 'aria-label': 'Close', onClick: closeBuilder },
                      h('L:X', { size: 18 }),
                    ),
                  ),
                ),
              ),
              h(
                'div:mx-auto max-w-[1100px] grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 p-5',
                {},
                card(
                  h(
                    'div:p-5 space-y-4',
                    {},
                    builderField(
                      'Title',
                      h('input:w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none', {
                        style: { borderColor: LINE },
                        value: bTitle,
                        placeholder: bDefaultTitle,
                        onInput: (e) => setBTitle(e.target.value),
                      }),
                    ),
                    builderField(
                      'Metric',
                      dropdown(
                        bMetric,
                        (v) => (setBMetric(v), bMetric2 && fmtOf(bMetric2) != fmtOf(v) && setBMetric2('')),
                        CUBE_META.metrics.map((m) => ({ v: m.name, label: sentence(m.name) })),
                      ),
                      mSel?.description,
                    ),
                    builderField(
                      'Compare with',
                      dropdown(bMetric2, (v) => (setBMetric2(v), v && ['pie', 'hbar'].includes(bKind) && setBKind(bDim == 'date' ? 'line' : 'bar')), [
                        { v: '', label: 'None' },
                        ...CUBE_META.metrics.filter((m) => m.name != bMetric && fmtOf(m.name) == fmtOf(bMetric)).map((m) => ({ v: m.name, label: sentence(m.name) })),
                      ]),
                      bMetric2 ? 'second series — bars render clustered' : 'optional second metric (same unit)',
                    ),
                    bKind != 'kpi' &&
                      builderField(
                        'Group by',
                        dropdown(
                          bDim,
                          (v) => (
                            setBDim(v),
                            ['kpi', 'table'].includes(bKind) || setBKind(v == 'date' ? 'line' : ['line', 'area'].includes(bKind) ? (bMetric2 ? 'bar' : 'hbar') : bKind)
                          ),
                          CUBE_META.dimensions.map((d) => ({ v: d.name, label: d.name.replace(/"/g, '') })),
                        ),
                        dSel?.guidance,
                      ),
                    bKind != 'kpi' &&
                      bDim == 'date' &&
                      builderField(
                        'Granularity',
                        h(
                          'div:flex rounded-lg border overflow-hidden',
                          { style: { borderColor: LINE } },
                          ['day', 'week', 'month'].map((g) =>
                            h(
                              `button:flex-1 py-1.5 text-xs font-semibold ${g == bGrain ? 'text-white' : 'text-[#5A5A5A]'}`,
                              { key: g, style: g == bGrain ? { background: ORANGE } : {}, onClick: () => setBGrain(g) },
                              cap(g),
                            ),
                          ),
                        ),
                      ),
                    builderField(
                      'Chart type',
                      h(
                        'div:flex flex-wrap gap-1.5',
                        {},
                        KINDS.map(([k, ic]) => {
                          const off = bMetric2 && ['pie', 'hbar'].includes(k)
                          return h(
                            [
                              'button:inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium',
                              bKind == k ? 'text-white' : 'text-[#5A5A5A] bg-white',
                              off ? 'opacity-40 cursor-not-allowed' : '',
                            ].join(' '),
                            {
                              key: k,
                              title: off ? 'Not available when comparing two metrics' : undefined,
                              style: bKind == k ? { background: ORANGE, borderColor: ORANGE } : { borderColor: LINE },
                              onClick: () => !off && setBKind(k),
                            },
                            h('L:' + ic, { size: 13 }),
                            k,
                          )
                        }),
                      ),
                    ),
                    bKind != 'kpi' &&
                      bDim != 'date' &&
                      builderField(
                        'Top N',
                        dropdown(
                          String(bLimit),
                          (v) => setBLimit(+v),
                          [5, 10, 20].map((n) => ({ v: String(n), label: 'Top ' + n })),
                        ),
                      ),
                    builderField(
                      'Filters',
                      h(
                        'div:space-y-2',
                        {},
                        WIDGET_FILTERS.map((x) =>
                          h(
                            'div:flex items-center gap-2',
                            { key: x.key },
                            h('span:text-xs text-[#8A8A8A] w-20 shrink-0', {}, x.label),
                            h(
                              'div:flex-1 min-w-0',
                              {},
                              dropdown(bFilters[x.key] || '', (v) => setBFilters((fs) => ({ ...fs, [x.key]: v })), [
                                { v: '', label: 'All' },
                                ...x.opts.map((o) => ({ v: o, label: sentence(o) })),
                              ]),
                            ),
                          ),
                        ),
                      ),
                      'optional — on top of the dashboard filters',
                    ),
                  ),
                ),
                card(
                  h(
                    'div:p-5',
                    {},
                    h(
                      'div:flex items-center justify-between mb-3',
                      {},
                      head('Preview', 'text-base font-bold text-[#1A1A1A]'),
                      h('span:text-xs text-[#8A8A8A]', {}, 'live over your data · follows the dashboard filters'),
                    ),
                    bPreview?.error
                      ? h('div:rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 whitespace-pre-wrap', {}, bPreview.error)
                      : !preview
                        ? h('div:py-24 text-center text-[#8A8A8A]', {}, h('L:Loader2', { size: 20, className: 'animate-spin inline' }))
                        : !preview.length
                          ? h('div:py-24 text-center text-[#8A8A8A]', {}, 'No data for this combination in the current range.')
                          : hh(ctx, VizWidget, { spec: { width: 700, height: 380, ...userWidgetSpec(bPreview.w, preview) } }),
                    preview &&
                      h(
                        'details:mt-4',
                        {},
                        h('summary:text-xs text-[#8A8A8A] cursor-pointer', {}, 'Show SQL'),
                        h(
                          'pre:text-xs bg-[#FAFAFB] border rounded-lg p-3 overflow-x-auto whitespace-pre mt-2 text-[#5A5A5A]',
                          { style: { borderColor: LINE } },
                          `-- over demoFinanacialCubeV2 (filters: ${userWidgetWhere({ filters: bFilters }, { segment, ...bounds() }) || 'none'})\n` +
                            userWidgetSql({ metric: bMetric, ...(bMetric2 ? { metric2: bMetric2 } : {}), dimension: bDim, grain: bGrain, limit: bLimit }),
                        ),
                      ),
                  ),
                ),
              ),
            )
          })()

        // --- HOME ---
        const homeScreen = () => {
          if (home?.error) return h('div:m-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 whitespace-pre-wrap', {}, home.error)
          if (!home) return loadingState()
          const c = home.c
          const metric = (label, value, red) =>
            card(h('div:px-4 py-3.5', {}, h('div:text-xs text-[#8A8A8A]', {}, label), h('div:text-xl font-bold mt-0.5 tabular-nums', { style: { color: red ? RED : INK } }, value)))
          const kpi = (label, value, color) =>
            h('div', {}, h('div:text-sm text-[#8A8A8A]', {}, label), h('div:text-2xl sm:text-3xl font-bold mt-0.5 tabular-nums', { style: { color } }, value))
          return h(
            'div:space-y-5',
            {},
            h(
              'div:flex items-start justify-between gap-4 flex-wrap',
              {},
              h(
                'div',
                {},
                head(`Hi ${P.first}, here's the portfolio at a glance`, 'block text-2xl font-semibold text-[#1A1A1A] leading-tight'),
                h('p:text-sm text-[#8A8A8A] mt-1', {}, `${cap(rangeLabel)} · dataset dollars`),
              ),
              h(
                'div:flex items-center gap-2.5 flex-wrap no-print',
                {},
                dropdown(
                  rangeId,
                  setRangeId,
                  RANGES.map((r) => ({ v: r.id, label: r.label })),
                  'Calendar',
                ),
                customRange(),
                !mobileDemo && newWidgetBtn,
                !mobileDemo && primaryBtn('Export data', 'Download', exportCsv),
              ),
            ),
            h(
              staleDiv(home.stale, 'space-y-5'),
              {},
              card(
                h(
                  'div:p-5',
                  {},
                  h(
                    'div:flex items-start justify-between gap-4 flex-wrap mb-3',
                    {},
                    h(
                      'div:flex flex-wrap items-center gap-x-6 gap-y-2',
                      {},
                      kpi('Completed value', usd(c.completed_value), GREEN),
                      kpi('Estimated cost', usd(c.estimated_cost), INK),
                      h('div:hidden sm:block w-px h-12 self-center', { style: { background: LINE } }),
                      kpi('Gross profit', usd(c.gross_profit), ORANGE),
                    ),
                    h(
                      'div:flex items-center gap-3',
                      {},
                      h(
                        'div:flex items-center gap-3 text-xs font-medium text-[#5A5A5A]',
                        {},
                        h('span:flex items-center gap-1', {}, h('span:w-2.5 h-2.5 rounded-full', { style: { background: ORANGE } }), 'Value'),
                        h('span:flex items-center gap-1', {}, h('span:w-2.5 h-2.5 rounded-full', { style: { background: '#334155' } }), 'Profit'),
                      ),
                      h(
                        'div:flex rounded-lg border overflow-hidden',
                        { style: { borderColor: LINE } },
                        GRANS.map((g) =>
                          h(
                            `button:w-8 py-1.5 text-xs font-semibold ${g.id == gran ? 'text-white' : 'text-[#5A5A5A]'}`,
                            { key: g.id, style: g.id == gran ? { background: ORANGE } : {}, onClick: () => setGran(g.id) },
                            g.label,
                          ),
                        ),
                      ),
                    ),
                  ),
                  hh(ctx, VizWidget, {
                    spec: {
                      kind: 'area',
                      width: 1240,
                      height: mobileDemo ? 220 : 300,
                      valueFormat: '$',
                      xType: 'category',
                      series: [
                        { name: 'Completed value', points: home.vol.map((r) => ({ x: fmtBucket(r.x, gran), y: r.value || 0 })) },
                        { name: 'Gross profit', points: home.vol.map((r) => ({ x: fmtBucket(r.x, gran), y: r.profit || 0 })) },
                      ],
                    },
                    onEvent: (e) => {
                      const r = home.vol[home.vol.findIndex((v) => fmtBucket(v.x, gran) == e?.name)]
                      r && goReports({ day: r.x, dayEnd: bucketEnd(r.x, gran) })
                    },
                  }),
                ),
              ),
              h(
                `div:grid grid-cols-2 ${mobileDemo ? '' : 'md:grid-cols-5'} gap-3.5`,
                {},
                metric('Customers', (+c.customers || 0).toLocaleString()),
                metric('Gross value', usd(c.gross_value)),
                metric('Average order', usd(c.avg_order_value)),
                metric('Payment fees', usd(c.payment_fees)),
                metric('Quality issue rate', (+c.quality_issue_rate || 0).toFixed(1) + '%', +c.quality_issue_rate > 0),
              ),
              h(
                'section',
                {},
                h(
                  'div:flex items-center gap-2 mb-3',
                  {},
                  h('L:Sparkles', { size: 16, style: { color: ORANGE } }),
                  head('AI insights', 'text-base font-bold text-[#1A1A1A]'),
                  h('span:text-xs text-[#8A8A8A]', {}, '· click to explore in Ask AI'),
                ),
                h(
                  `div:grid grid-cols-1 ${mobileDemo ? '' : 'md:grid-cols-3'} gap-3.5`,
                  {},
                  [
                    {
                      icon: 'TrendingUp',
                      label: 'Top customer',
                      value: home.customers[0]?.name || '—',
                      sub: home.customers[0] ? `${usd(home.customers[0].value)} completed value` : '',
                      report: 'top-customers',
                    },
                    {
                      icon: 'BadgeDollarSign',
                      label: 'Gross margin',
                      value: (+c.gross_margin || 0).toFixed(1) + '%',
                      sub: `${usd(c.gross_profit)} gross profit`,
                      report: 'profitability',
                    },
                    {
                      icon: 'ShieldCheck',
                      label: 'Completion rate',
                      value: (+c.completion_rate || 0).toFixed(1) + '%',
                      sub: `${(+c.failure_rate || 0).toFixed(1)}% failed`,
                      report: 'status-mix',
                    },
                  ].map((cd, i) =>
                    h(
                      'button:text-left rounded-2xl border bg-white p-4 hover:border-[#FBD9CC] transition-colors',
                      { key: i, style: { borderColor: LINE }, onClick: () => runVerified(REPORTS.find((r) => r.id == cd.report)) },
                      h(
                        'div:flex items-center gap-2',
                        {},
                        h('span:w-8 h-8 grid place-items-center rounded-lg', { style: { background: '#FFF0EB', color: ORANGE } }, h('L:' + cd.icon, { size: 16 })),
                        h('span:text-xs font-medium text-[#8A8A8A]', {}, cd.label),
                      ),
                      h('div:text-xl font-bold text-[#1A1A1A] mt-2 truncate', {}, cd.value),
                      h('div:text-xs text-[#8A8A8A] mt-0.5 truncate', {}, cd.sub),
                      h('div:text-xs font-semibold mt-2 inline-flex items-center gap-1', { style: { color: ORANGE } }, 'Explore', h('L:ArrowRight', { size: 12 })),
                    ),
                  ),
                ),
              ),
              mobileDemo
                ? rankCard('Top customers', home.customers, ORANGE, 'customer')
                : h(
                    'div:grid grid-cols-1 lg:grid-cols-2 gap-5',
                    {},
                    rankCard('Top customers', home.customers, ORANGE, 'customer'),
                    rankCard('Top products', home.products, '#334155', 'product'),
                  ),
              !mobileDemo && widgetSections(),
            ),
          )
        }

        // --- FLEXIBLE COMPARISON ---
        const compareChoice = (items, selected, set, max) =>
          h(
            'div:flex flex-wrap gap-2',
            {},
            items.map((item) => {
              const on = selected.includes(item.id)
              return h(
                `button:rounded-full border px-3 py-1.5 text-xs font-medium ${on ? 'text-white' : 'text-[#5A5A5A] bg-white'}`,
                {
                  key: item.id,
                  style: on ? { background: ORANGE, borderColor: ORANGE } : { borderColor: LINE },
                  onClick: () => set(on ? (selected.length > 1 ? selected.filter((x) => x != item.id) : selected) : selected.length < max ? [...selected, item.id] : selected),
                },
                item.label,
              )
            }),
          )
        const cmpValue = (metric, value) => (fmtOf(metric) == '$' ? usd(value) : fmtOf(metric) == '%' ? (+value || 0).toFixed(1) + '%' : (+value || 0).toLocaleString())
        const compareSection = () => {
          const rows = rep?.compare || [],
            dims = cmpDims.map((id) => COMPARE_DIMS.find((d) => d.id == id))
          const metrics = cmpMetrics.map((name) => ({ name, label: sentence(name) }))
          const cells = (r) => [
            ...dims.map((d, i) => ({ label: d.label, value: d.id == 'date' ? fmtDate(r['d' + i]) : String(r['d' + i] ?? '—') })),
            ...metrics.map((m, i) => ({ label: m.label, value: cmpValue(m.name, r['m' + i]), metric: true })),
          ]
          const mobileRows = h(
            'div:space-y-3',
            {},
            rows.map((r, i) =>
              card(
                h(
                  'div:p-4 grid grid-cols-2 gap-3',
                  { key: i },
                  cells(r).map((c) =>
                    h(
                      'div:min-w-0',
                      { key: c.label },
                      h('div:text-[10px] uppercase tracking-wide text-[#8A8A8A]', {}, c.label),
                      h(`div:text-sm mt-0.5 break-words ${c.metric ? 'font-bold text-[#1A1A1A]' : 'text-[#5A5A5A]'}`, {}, c.value),
                    ),
                  ),
                ),
              ),
            ),
          )
          const desktopTable = card(
            h(
              'div:overflow-hidden',
              {},
              h(
                'table:w-full table-fixed border-collapse',
                {},
                h(
                  'thead',
                  {},
                  h(
                    'tr:border-b',
                    { style: { borderColor: LINE } },
                    cells(rows[0] || {}).map((c) =>
                      h('th:px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#8A8A8A] break-words', { key: c.label }, c.label),
                    ),
                  ),
                ),
                h(
                  'tbody',
                  {},
                  rows.map((r, i) =>
                    h(
                      'tr:border-b last:border-0',
                      { key: i, style: { borderColor: '#F0F0F1' } },
                      cells(r).map((c) =>
                        h(`td:px-3 py-3 text-sm break-words ${c.metric ? 'font-semibold text-[#1A1A1A] tabular-nums' : 'text-[#5A5A5A]'}`, { key: c.label }, c.value),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          )
          const result = !rep || (rep.busy && !rows.length)
            ? loadingState()
            : !rows.length
              ? card(h('div:p-12 text-center text-sm text-[#8A8A8A]', {}, 'No data matches this comparison.'))
              : byWidth(mobileRows, desktopTable)
          return h(
            'div:space-y-4',
            {},
            h(
              `div:grid ${mobileDemo ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'} gap-4`,
              {},
              card(h('div:p-4', {}, head('Dimensions', 'block text-sm font-bold text-[#1A1A1A] mb-3'), compareChoice(COMPARE_DIMS, cmpDims, setCmpDims, 3))),
              card(
                h(
                  'div:p-4',
                  {},
                  head('Metrics', 'block text-sm font-bold text-[#1A1A1A] mb-3'),
                  compareChoice(
                    CUBE_META.metrics.map((m) => ({ id: m.name, label: sentence(m.name) })),
                    cmpMetrics,
                    setCmpMetrics,
                    4,
                  ),
                ),
              ),
            ),
            result,
          )
        }

        // --- REPORTS ---
        const filters = () => {
          const check = (s) => {
            const on = statuses.includes(s)
            return h(
              'button:w-full flex items-center gap-2.5 py-1.5',
              { key: s, onClick: () => (setStatuses(on ? statuses.filter((x) => x != s) : [...statuses, s]), setPage(0)) },
              h(
                'span:w-4 h-4 rounded grid place-items-center border',
                { style: on ? { background: ORANGE, borderColor: ORANGE } : { borderColor: '#C7C7CC' } },
                on && h('L:Check', { size: 12, className: 'text-white' }),
              ),
              h('span:text-sm text-[#1A1A1A] capitalize flex-1 text-left', {}, s),
              h('span:text-xs text-[#8A8A8A] tabular-nums', {}, (rep?.counts?.[s] ?? '').toLocaleString?.() ?? ''),
            )
          }
          const secLabel = (t) => h('div:text-[11px] font-semibold uppercase tracking-wide text-[#8A8A8A] mb-2 mt-5 first:mt-0', {}, t)
          return h(
            [
              'aside:border-r bg-white px-5 py-5 no-print',
              showFilters ? 'fixed inset-y-0 left-0 z-50 w-72 overflow-auto shadow-xl block' : 'hidden',
              mobileDemo ? '' : 'lg:static lg:inset-auto lg:z-auto lg:w-64 lg:shrink-0 lg:overflow-visible lg:shadow-none lg:block',
            ].join(' '),
            { style: { borderColor: LINE } },
            h(
              'div:flex items-center justify-between',
              {},
              head('Filters', 'text-base font-bold text-[#1A1A1A]'),
              h('button:text-sm font-semibold', { style: { color: ORANGE }, onClick: clearFilters }, 'Clear all'),
            ),
            secLabel('Date range'),
            dropdown(
              rangeId,
              setRangeId,
              RANGES.map((r) => ({ v: r.id, label: r.label })),
              'Calendar',
            ),
            rangeId == 'custom' && h('div:mt-2', {}, customRange()),
            secLabel('Status'),
            h('div', {}, STATUSES.map(check)),
            secLabel('Product'),
            dropdown(product, (v) => (setProduct(v), setPage(0)), [{ v: '', label: 'All products' }, ...PRODUCTS.map((v) => ({ v, label: v }))]),
            secLabel('Payment method'),
            dropdown(payment, (v) => (setPayment(v), setPage(0)), [{ v: '', label: 'All methods' }, ...PAYMENTS.map((v) => ({ v, label: v }))]),
            customer && h('button:mt-5 text-sm font-semibold', { style: { color: ORANGE }, onClick: () => setCustomer('') }, `Customer: ${customer} ×`),
          )
        }
        const pageList = (cur, tot) => {
          if (tot <= 7) return Array.from({ length: tot }, (_, i) => i + 1)
          const s = new Set([1, 2, tot, cur, cur - 1, cur + 1])
          const out = []
          let prev = 0
          ;[...s]
            .filter((n) => n >= 1 && n <= tot)
            .sort((a, b) => a - b)
            .forEach((n) => {
              if (n - prev > 1) out.push('…')
              out.push(n)
              prev = n
            })
          return out
        }
        const reportsScreen = () => {
          const rows = rep?.rows || [],
            busy = !rep || rep.busy,
            totalPages = Math.max(1, Math.ceil((rep?.total || 0) / perPage))
          const sumCard = (label, value, sub, color) =>
            card(
              h(
                'div:p-4',
                {},
                h('div:text-xs text-[#8A8A8A]', {}, label),
                h('div:text-2xl font-bold mt-1 tabular-nums', { style: { color: color || INK } }, value),
                h('div:text-xs text-[#8A8A8A] mt-1', {}, sub),
              ),
            )
          const COLS = [
            { key: 'tid', label: 'Transaction ID', sort: 'tid', cell: (r) => h('td:px-3 py-3 text-sm text-[#8A8A8A] break-words', { key: 'tid' }, r.tid) },
            { key: 'date', label: 'Date', sort: 'date', cell: (r) => h('td:px-3 py-3 text-sm text-[#5A5A5A] whitespace-nowrap', { key: 'date' }, fmtDate(r.date)) },
            {
              key: 'customer',
              label: 'Customer',
              sort: 'customer',
              cell: (r) => h('td:px-3 py-3 text-sm font-semibold text-[#1A1A1A] break-words', { key: 'customer' }, r.customer),
            },
            { key: 'customer_type', label: 'Customer type', cell: (r) => h('td:px-3 py-3 text-sm text-[#5A5A5A]', { key: 'customer_type' }, r.customer_type) },
            { key: 'product', label: 'Product', sort: 'product', cell: (r) => h('td:px-3 py-3 text-sm text-[#5A5A5A] break-words', { key: 'product' }, r.product) },
            { key: 'product_category', label: 'Category', cell: (r) => h('td:px-3 py-3 text-sm text-[#5A5A5A]', { key: 'product_category' }, r.product_category) },
            {
              key: 'quantity',
              label: 'Quantity',
              right: true,
              cell: (r) => h('td:px-3 py-3 text-right text-sm tabular-nums text-[#5A5A5A]', { key: 'quantity' }, (+r.quantity || 0).toLocaleString()),
            },
            { key: 'price', label: 'Price', right: true, cell: (r) => h('td:px-3 py-3 text-right text-sm tabular-nums text-[#5A5A5A]', { key: 'price' }, usd(r.price)) },
            { key: 'payment_method', label: 'Payment method', cell: (r) => h('td:px-3 py-3 text-sm text-[#5A5A5A]', { key: 'payment_method' }, r.payment_method) },
            { key: 'payment_channel', label: 'Channel', cell: (r) => h('td:px-3 py-3 text-sm text-[#5A5A5A]', { key: 'payment_channel' }, r.payment_channel) },
            {
              key: 'value',
              label: 'Value',
              sort: 'value',
              right: true,
              cell: (r) => h('td:px-3 py-3 text-right text-sm font-semibold tabular-nums text-[#1A1A1A]', { key: 'value' }, usd(r.value)),
            },
            { key: 'fee', label: 'Fee', sort: 'fee', right: true, cell: (r) => h('td:px-3 py-3 text-right text-sm tabular-nums text-[#5A5A5A]', { key: 'fee' }, usd(r.fee)) },
            { key: 'status', label: 'Status', sort: 'status', cell: (r) => h('td:px-3 py-3', { key: 'status' }, pill(r.status)) },
            {
              key: 'quality',
              label: 'Data quality',
              sort: 'quality',
              cell: (r) =>
                h(
                  'td:px-3 py-3',
                  { key: 'quality' },
                  h(
                    'span:inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    { style: r.quality ? { background: '#FBEBEB', color: RED } : { background: '#EAF7F1', color: GREEN } },
                    r.quality ? 'Issue' : 'Clean',
                  ),
                ),
            },
          ]
          const visible = COLS.filter((c) => cols.includes(c.key))
          const thFor = (c) =>
            h(
              `th:px-3 py-3 text-[11px] font-semibold uppercase tracking-wide text-[#8A8A8A] break-words ${c.right ? 'text-right' : 'text-left'} ${c.sort ? 'cursor-pointer' : ''}`,
              {
                key: c.key,
                onClick: () => c.sort && (rSort == c.sort ? setRDir((d) => (d == 'ASC' ? 'DESC' : 'ASC')) : (setRSort(c.sort), setRDir('DESC'))),
              },
              c.label,
              rSort == c.sort && (rDir == 'ASC' ? ' ↑' : ' ↓'),
            )
          const colsBtn = h(
            'div:relative',
            {},
            ghostBtn(`Columns (${visible.length})`, 'Columns3', () => setColMenu((open) => !open)),
            colMenu &&
              h(
                'div:absolute right-0 mt-2 w-56 rounded-xl border bg-white shadow-xl z-40 p-2 max-h-80 overflow-auto',
                { style: { borderColor: LINE } },
                COLS.map((c) => {
                  const on = cols.includes(c.key)
                  return h(
                    'button:w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-left hover:bg-slate-50',
                    {
                      key: c.key,
                      onClick: () => setCols((current) => (current.includes(c.key) ? (current.length > 1 ? current.filter((x) => x != c.key) : current) : [...current, c.key])),
                    },
                    h(
                      'span:w-4 h-4 rounded grid place-items-center border',
                      { style: on ? { background: ORANGE, borderColor: ORANGE } : { borderColor: '#C7C7CC' } },
                      on && h('L:Check', { size: 12, className: 'text-white' }),
                    ),
                    c.label,
                  )
                }),
              ),
          )
          const mobileRows =
            busy && !rows.length
              ? loadingState()
              : !rows.length
                ? card(h('div:p-10 text-center text-sm text-[#8A8A8A]', {}, 'No transactions match these filters.'))
                : h(
                    'div:space-y-3',
                    {},
                    rows.map((r) =>
                      card(
                        h(
                          'button:w-full p-4 text-left',
                          { key: r.tid, onClick: () => setDetail(r) },
                          h(
                            'div:flex items-start justify-between gap-3',
                            {},
                            h(
                              'div:min-w-0',
                              {},
                              h('div:text-sm font-semibold text-[#1A1A1A] truncate', {}, r.customer),
                              h('div:text-xs text-[#8A8A8A] mt-1', {}, `${r.product} · ${fmtDate(r.date)}`),
                            ),
                            h('div:text-right shrink-0', {}, h('div:text-sm font-bold tabular-nums text-[#1A1A1A]', {}, usd(r.value)), h('div:mt-1', {}, pill(r.status))),
                          ),
                        ),
                      ),
                    ),
                  )
          const table = card(
            h(
              'div:overflow-x-auto',
              {},
              h(
                'table:w-full border-collapse',
                {},
                h('thead', {}, h('tr:border-b', { style: { borderColor: LINE } }, visible.map(thFor))),
                h(
                  'tbody',
                  {},
                  busy && !rows.length
                    ? h('tr', {}, h('td:py-16 text-center text-[#8A8A8A]', { colSpan: visible.length }, h('L:Loader2', { size: 20, className: 'animate-spin inline' })))
                    : !rows.length
                      ? h('tr', {}, h('td:py-16 text-center text-[#8A8A8A]', { colSpan: visible.length }, 'No transactions match these filters.'))
                      : rows.map((r) =>
                          h(
                            'tr:border-b last:border-0 hover:bg-[#FAFAFB] cursor-pointer',
                            { key: r.tid, style: { borderColor: '#F0F0F1' }, onClick: () => setDetail(r) },
                            visible.map((c) => c.cell(r)),
                          ),
                        ),
                ),
              ),
            ),
          )
          const pages = h(
            'div:flex items-center justify-between flex-wrap gap-3 mt-4 text-sm no-print',
            {},
            h('div:text-[#8A8A8A]', {}, rows.length ? `Showing ${page * perPage + 1}–${Math.min((page + 1) * perPage, rep.total)} of ${rep.total.toLocaleString()}` : ''),
            h(
              'div:flex items-center gap-1',
              {},
              h(
                'button:w-8 h-8 grid place-items-center rounded-lg border disabled:opacity-40',
                { style: { borderColor: LINE }, disabled: page == 0, onClick: () => setPage((p) => Math.max(0, p - 1)) },
                h('L:ChevronLeft', { size: 15 }),
              ),
              h(`span:px-2 text-xs text-[#5A5A5A] ${mdUp('md:hidden')}`, {}, `${page + 1} / ${totalPages}`),
              !mobileDemo &&
                h(
                  'div:hidden md:flex items-center gap-1',
                  {},
                  pageList(page + 1, totalPages).map((n, i) =>
                    n == '…'
                      ? h('span:px-1.5 text-[#8A8A8A]', { key: i }, '…')
                      : h(
                          `button:min-w-8 h-8 px-2 grid place-items-center rounded-lg text-sm font-semibold ${n == page + 1 ? 'text-white' : 'text-[#1A1A1A] hover:bg-slate-100'}`,
                          { key: i, style: n == page + 1 ? { background: ORANGE } : {}, onClick: () => setPage(n - 1) },
                          n,
                        ),
                  ),
                ),
              h(
                'button:w-8 h-8 grid place-items-center rounded-lg border disabled:opacity-40',
                { style: { borderColor: LINE }, disabled: page + 1 >= totalPages, onClick: () => setPage((p) => p + 1) },
                h('L:ChevronRight', { size: 15 }),
              ),
            ),
            !mobileDemo &&
              h(
                'div:hidden md:block',
                {},
                dropdown(
                  String(perPage),
                  (v) => (setPerPage(+v), setPage(0)),
                  [25, 50, 100].map((n) => ({ v: String(n), label: n + ' rows' })),
                ),
              ),
          )
          const reportWidget = (payload, empty) =>
            card(
              h(
                'div:p-5 overflow-hidden',
                {},
                payload?.widgets?.[0]
                  ? hh(ctx, VizWidget, { spec: { width: 1180, height: 380, ...payload.widgets[0] } })
                  : h('div:py-16 text-center text-[#8A8A8A]', {}, busy ? h('L:Loader2', { size: 20, className: 'animate-spin inline' }) : empty),
              ),
            )
          const body =
            repView == 'fees'
              ? reportWidget(rep?.fees, 'No fees match the current filter.')
              : repView == 'profitability'
                ? reportWidget(rep?.profitability, 'No profitability data matches the current filter.')
                : repView == 'compare'
                  ? compareSection()
                  : h(
                    'div',
                    {},
                    h(
                      `div:grid grid-cols-2 ${mobileDemo ? '' : 'lg:grid-cols-4'} gap-3.5 mb-5`,
                      {},
                      sumCard('Transactions', (rep?.total || 0).toLocaleString(), 'in current filter'),
                      sumCard('Completed value', usd(rep?.completed), 'realised sales', GREEN),
                      sumCard('Gross profit', usd(rep?.profit), 'estimated', ORANGE),
                      sumCard('Average order', usd(rep?.avg), 'per transaction'),
                    ),
                    byWidth(mobileRows, table),
                    pages,
                  )
          const toolbar = h(
            'div:flex items-center gap-3 flex-wrap mb-4 no-print',
            {},
            head('Reports', 'text-2xl font-bold text-[#1A1A1A]'),
            h(
              `div:flex rounded-lg border overflow-hidden w-full order-2 ${mdUp('md:w-auto md:order-none')}`,
              { style: { borderColor: LINE } },
              [
                ['summary', 'Transactions'],
                ['fees', 'Fees'],
                ['profitability', 'Profitability'],
                ['compare', 'Comparison'],
              ].map(([value, label]) =>
                h(
                  `button:flex-1 px-2 py-2 text-[13px] font-medium ${mdUp('md:flex-none md:px-3 md:text-sm')} ${repView == value ? '' : 'text-[#5A5A5A] hover:bg-slate-50'}`,
                  {
                    key: value,
                    style: repView == value ? { color: ORANGE, background: '#FFF0EB', boxShadow: `inset 0 0 0 1px ${ORANGE}` } : {},
                    onClick: () => setRepView(value),
                  },
                  label,
                ),
              ),
            ),
            h(
              `div:relative flex-1 order-2 min-w-[150px] max-w-sm ml-auto ${mdUp('md:order-none md:min-w-[190px]')}`,
              {},
              h('L:Search', { size: 16, className: 'absolute left-3 top-3 text-[#8A8A8A]' }),
              h(`input:w-full rounded-lg border bg-white pl-9 pr-3 py-2.5 text-base ${mdUp('md:text-sm')} outline-none`, {
                style: { borderColor: LINE },
                value: search,
                placeholder: 'Search customer, product or ID',
                onInput: (e) => (setSearch(e.target.value), setPage(0)),
              }),
            ),
            h(
              `button:inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium text-[#1A1A1A] bg-white border order-2 ${mdUp('md:order-none lg:hidden')}`,
              { style: { borderColor: LINE, borderRadius: '9px' }, onClick: () => setShowFilters((open) => !open) },
              h('L:SlidersHorizontal', { size: 16 }),
              'Filters',
            ),
            !mobileDemo && repView == 'summary' && h('div:hidden md:block', {}, colsBtn),
            h(`div:order-1 ml-auto ${mdUp('md:order-none md:ml-0')}`, {}, primaryBtn('Export', 'Download', exportCsv)),
          )
          return h(
            'div:flex',
            {},
            showFilters && h(`div:fixed inset-0 bg-black/30 z-40 ${mobileDemo ? '' : 'lg:hidden'} no-print`, { onClick: () => setShowFilters(false) }),
            filters(),
            h(
              `main:flex-1 min-w-0 ${mobileDemo ? 'px-3 py-4' : 'px-6 py-5'}`,
              {},
              printCover(
                repView == 'fees' ? 'Fee breakdown' : repView == 'profitability' ? 'Profitability report' : repView == 'compare' ? 'Comparison report' : 'Transaction report',
              ),
              toolbar,
              h(staleDiv(rep?.busy), {}, body),
            ),
          )
        }
        // --- SCHEDULED REPORTS ---
        const fmtRun = (d) => (d && !isNaN(+d) ? d.toLocaleString(undefined, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—')
        const putSchedules = async (next) => {
          await wPut(demoFinancialSchedulesV2, next, ctCtx)
          setSchedules(next)
        }
        const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x != v) : [...list, v])
        const chips = (opts, sel, set) =>
          h(
            'div:flex flex-wrap gap-1.5',
            {},
            opts.map((o) =>
              h(
                `button:rounded-full border px-3 py-1.5 text-xs font-medium text-left ${sel.includes(o.v) ? 'text-white' : 'text-[#5A5A5A] bg-white'}`,
                { key: o.v, style: sel.includes(o.v) ? { background: ORANGE, borderColor: ORANGE } : { borderColor: LINE }, onClick: () => set(toggle(sel, o.v)) },
                o.label,
              ),
            ),
          )
        const setS = (k, v) => setSched((s) => ({ ...s, [k]: v }))
        const saveSched = async () => {
          const next = sched.id
            ? schedules.map((x) => (x.id == sched.id ? sched : x))
            : [...schedules, { ...sched, id: Math.random().toString(36).slice(2, 10), createdAt: Date.now() }]
          await putSchedules(next)
          setSched(null)
          showToast(`Schedule saved — next run ${fmtRun(nextRun(sched))}.`, 'success')
        }
        // the report's sections as cube entries — reports, then chosen saved widgets, then one KPI row. Preview and "Run now" share it.
        const schedEntries = (s) => {
          const f = { segment, ...bounds() }
          return [
            ...s.reports.map((cid) => ({ report: cid, depth, where: dashWhere(f) })),
            ...s.widgets.map((id) => widgetEntry(allWidgets.find((w) => w.id == id) || {}, f)),
            ...(s.metrics.length ? [{ sql: `select ${s.metrics.map((m) => `${m} as "${m}"`).join(', ')}`, where: dashWhere(f) }] : []),
          ]
        }
        // "Run now" is the real thing minus delivery: the same batch the preview renders
        const runSchedNow = async (s) => {
          try {
            const res = await runEntries(schedEntries(s))
            await putSchedules(schedules.map((x) => (x.id == s.id ? { ...x, lastRun: Date.now() } : x)))
            showToast(`"${s.title}" generated — ${res.length} sections ready for ${mailTo} (delivery is mocked).`, 'success')
          } catch (e) {
            showToast('Run failed: ' + String(e?.message || e), 'error')
          }
        }
        const fmtMetric = (m, v) => {
          const u = fmtOf(m)
          return u == '$' ? usd(v) : u == '%' ? (+v || 0) + '%' : (+v || 0).toLocaleString()
        }
        // what the recipient will get: the same sections "Run now" produces, rendered as the mailed report
        const schedPreviewCard = () => {
          const p = schedPreview,
            s = p?.s
          const section = (title, narrative, spec, key) =>
            h(
              'div:space-y-2',
              { key },
              head(title, 'block text-sm font-bold text-[#1A1A1A]'),
              narrative && h('div:text-sm text-[#5A5A5A]', {}, renderMd(h, narrative)),
              spec && h('div:min-w-0 overflow-hidden', {}, hh(ctx, VizWidget, { spec: { width: 620, height: 300, ...spec } })),
            )
          return card(
            h(
              'div:p-5',
              {},
              h(
                'div:flex items-center justify-between gap-3 mb-3 flex-wrap',
                {},
                head('Report preview', 'text-base font-bold text-[#1A1A1A]'),
                h('span:text-xs text-[#8A8A8A]', {}, `live over your data · ${cap(rangeLabel)} · ${P.merchant}`),
              ),
              p?.error
                ? h('div:rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 whitespace-pre-wrap', {}, p.error)
                : !p
                  ? h('div:py-24 text-center text-[#8A8A8A]', {}, h('L:Loader2', { size: 20, className: 'animate-spin inline' }))
                  : h(
                      'div:rounded-xl border',
                      { style: { borderColor: LINE } },
                      h(
                        'div:px-4 py-3 border-b',
                        { style: { borderColor: LINE, background: '#FAFAFB' } },
                        h('div:text-xs text-[#8A8A8A]', {}, `To ${mailTo} · ${cadenceLabel(sched)}`),
                        head(sched.title || 'Untitled report', 'block text-base font-bold text-[#1A1A1A] mt-0.5'),
                      ),
                      h(
                        'div:p-4 space-y-6',
                        {},
                        sched.metrics.length > 0 &&
                          h(
                            'div:grid grid-cols-2 sm:grid-cols-3 gap-3',
                            {},
                            sched.metrics.map((m) =>
                              h(
                                'div:rounded-xl border p-3',
                                { key: m, style: { borderColor: LINE } },
                                h('div:text-xs text-[#8A8A8A]', {}, sentence(m)),
                                h('div:text-lg font-bold text-[#1A1A1A] tabular-nums mt-0.5', {}, fmtMetric(m, (p.res[p.res.length - 1] || [])[0]?.[m])),
                              ),
                            ),
                          ),
                        s.reports.map((cid, i) => {
                          const r = p.res[i] || {}
                          return section(REPORTS.find((x) => x.cid == cid)?.q || cid, r.narrative || r.text, r.widgets?.[0], 'r' + cid)
                        }),
                        s.widgets.map((id, i) => {
                          const w = allWidgets.find((x) => x.id == id)
                          return w && section(w.title, null, specFor(w, p.res[s.reports.length + i]), 'w' + id)
                        }),
                        !s.reports.length &&
                          !s.widgets.length &&
                          !s.metrics.length &&
                          h('div:py-10 text-center text-sm text-[#8A8A8A]', {}, 'Pick at least one report, widget or metric.'),
                      ),
                    ),
            ),
          )
        }
        const schedEditor = () =>
          card(
            h(
              'div:p-5 space-y-4',
              {},
              builderField(
                'Report name',
                h('input:w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none', {
                  style: { borderColor: LINE },
                  value: sched.title,
                  placeholder: 'Weekly cash-flow digest',
                  onInput: (e) => setS('title', e.target.value),
                }),
              ),
              builderField(
                'Verified reports',
                chips(
                  REPORTS.map((r) => ({ v: r.cid, label: r.q })),
                  sched.reports,
                  (v) => setS('reports', v),
                ),
                'each becomes a chart + narrative section',
              ),
              allWidgets.length > 0 &&
                builderField(
                  'Saved widgets',
                  chips(
                    allWidgets.map((w) => ({ v: w.id, label: w.title })),
                    sched.widgets,
                    (v) => setS('widgets', v),
                  ),
                ),
              builderField(
                'KPI metrics',
                chips(
                  CUBE_META.metrics.map((m) => ({ v: m.name, label: sentence(m.name) })),
                  sched.metrics,
                  (v) => setS('metrics', v),
                ),
                'headline numbers at the top of the report',
              ),
              h(
                'div:grid grid-cols-2 gap-4',
                {},
                builderField(
                  'Frequency',
                  dropdown(sched.freq, (v) => setS('freq', v), FREQS, 'Repeat'),
                ),
                builderField(
                  'Time',
                  h('input:w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none', {
                    type: 'time',
                    style: { borderColor: LINE },
                    value: sched.time,
                    onChange: (e) => setS('time', e.target.value),
                  }),
                ),
                sched.freq == 'weekly' &&
                  builderField(
                    'Day of week',
                    dropdown(
                      String(sched.dow),
                      (v) => setS('dow', +v),
                      DOW.map((d, i) => ({ v: String(i), label: d })),
                    ),
                  ),
                sched.freq == 'monthly' &&
                  builderField(
                    'Day of month',
                    dropdown(
                      String(sched.dom),
                      (v) => setS('dom', +v),
                      Array.from({ length: 28 }, (_, i) => ({ v: String(i + 1), label: String(i + 1) })),
                    ),
                  ),
                builderField(
                  'Sent to',
                  h('div:rounded-lg border bg-[#FAFAFB] px-3 py-2 text-sm text-[#5A5A5A] truncate', { style: { borderColor: LINE } }, mailTo),
                  'your account email · no mail is sent in this demo',
                ),
              ),
              h(
                'div:flex items-center gap-2 pt-1',
                {},
                primaryBtn(sched.id ? 'Save changes' : 'Create schedule', 'Check', () => (sched.title.trim() ? saveSched() : showToast('Give the report a name first.', 'error'))),
                ghostBtn('Cancel', 'X', () => setSched(null)),
                h('span:text-xs text-[#8A8A8A] ml-auto', {}, `Next run ${fmtRun(nextRun(sched))}`),
              ),
            ),
          )
        const schedRow = (s) =>
          card(
            h(
              'div:p-5 flex items-start gap-4 flex-wrap',
              {},
              h('span:w-9 h-9 grid place-items-center rounded-lg shrink-0', { style: { background: '#FFF0EB', color: ORANGE } }, h('L:CalendarClock', { size: 17 })),
              h(
                'div:min-w-0 flex-1',
                {},
                h(
                  'div:flex items-center gap-2',
                  {},
                  head(s.title, 'text-base font-bold text-[#1A1A1A] truncate'),
                  h(
                    'span:text-[10px] font-semibold rounded-full px-2 py-0.5',
                    { style: s.enabled ? { background: '#EAF7F1', color: '#1B8A5E' } : { background: '#F0F0F1', color: MUTE } },
                    s.enabled ? 'active' : 'paused',
                  ),
                ),
                h('div:text-sm text-[#5A5A5A] mt-1', {}, cadenceLabel(s)),
                h('div:text-xs text-[#8A8A8A] mt-1', {}, `${s.reports.length + s.widgets.length} widgets · ${s.metrics.length} metrics · to ${mailTo}`),
                h('div:text-xs text-[#8A8A8A] mt-0.5', {}, `Next run ${fmtRun(s.enabled && nextRun(s))}${s.lastRun ? ` · last run ${fmtRun(new Date(s.lastRun))}` : ''}`),
              ),
              h(
                'div:flex items-center gap-1 shrink-0',
                {},
                h('button:px-3 py-1.5 text-xs font-semibold rounded-lg border bg-white text-[#1A1A1A]', { style: { borderColor: LINE }, onClick: () => runSchedNow(s) }, 'Run now'),
                h(
                  'button:w-8 h-8 grid place-items-center rounded-lg text-[#C7C7CC] hover:bg-slate-100 hover:text-[#5A5A5A]',
                  { title: s.enabled ? 'Pause' : 'Resume', onClick: () => putSchedules(schedules.map((x) => (x.id == s.id ? { ...x, enabled: !x.enabled } : x))) },
                  h('L:' + (s.enabled ? 'Pause' : 'Play'), { size: 14 }),
                ),
                h(
                  'button:w-8 h-8 grid place-items-center rounded-lg text-[#C7C7CC] hover:bg-slate-100 hover:text-[#5A5A5A]',
                  { title: 'Edit', onClick: () => setSched(s) },
                  h('L:Pencil', { size: 14 }),
                ),
                h(
                  'button:w-8 h-8 grid place-items-center rounded-lg text-[#C7C7CC] hover:bg-red-50 hover:text-red-500',
                  { title: 'Delete', onClick: () => putSchedules(schedules.filter((x) => x.id != s.id)) },
                  h('L:Trash2', { size: 14 }),
                ),
              ),
            ),
          )
        const schedScreen = () =>
          h(
            'div:space-y-5',
            {},
            h(
              'div:flex items-start justify-between gap-4 flex-wrap',
              {},
              h(
                'div',
                {},
                head('Scheduled reports', 'block text-2xl font-semibold text-[#1A1A1A]'),
                h('p:text-sm text-[#8A8A8A] mt-1', {}, 'Pick the widgets and metrics once — they run on your cadence and land in your inbox.'),
              ),
              !sched && primaryBtn('New scheduled report', 'Plus', () => setSched(BLANK_SCHED)),
            ),
            sched
              ? h('div:grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-5 items-start', {}, schedEditor(), schedPreviewCard())
              : schedules.length
                ? h(
                    'div:space-y-3.5',
                    {},
                    schedules.map((s) => h('div', { key: s.id }, schedRow(s))),
                  )
                : card(
                    h('div:p-12 text-center text-[#8A8A8A]', {}, h('L:CalendarClock', { size: 26, className: 'inline mb-2' }), h('div:text-sm', {}, 'No scheduled reports yet.')),
                  ),
          )

        // --- ASK AI ---
        const composer = (big) =>
          h(
            `div:rounded-2xl border bg-white ${big ? 'shadow-lg' : ''}`,
            { style: { borderColor: LINE } },
            h(
              'div:flex items-end gap-2 p-2',
              {},
              h(`textarea:flex-1 resize-none bg-transparent px-3 py-2.5 leading-6 outline-none max-h-40 min-h-[${big ? 64 : 46}px] text-[16px] ${mdUp('md:text-[15px]')}`, {
                value: ask,
                placeholder: `Ask about your ${brand.name} money…`,
                onInput: (e) => setAsk(e.target.value),
                onKeyDown: (e) => e.key == 'Enter' && !e.shiftKey && (e.preventDefault(), runAsk(ask)),
              }),
              h(
                'button:w-10 h-10 mb-0.5 grid place-items-center rounded-full text-white disabled:opacity-40 shrink-0',
                { style: { background: ORANGE }, disabled: !ask.trim() || busy, onClick: () => runAsk(ask), 'aria-label': 'Send' },
                h('L:ArrowUp', { size: 17, strokeWidth: 3 }),
              ),
            ),
          )
        const askMsg = (m, i) =>
          m.role == 'user'
            ? h(
                'div:flex justify-end my-4',
                { key: i },
                h('div:max-w-[80%] px-4 py-2.5 rounded-2xl text-[15px] leading-6', { style: { background: '#FFF0EB', color: INK } }, m.text),
              )
            : (() => {
                const rows = Array.isArray(m.rows) ? m.rows : [],
                  dcols = rows.length ? Object.keys(rows[0]).map((k) => ({ key: k, label: k })) : [],
                  open = showData[i]
                return h(
                  'div:my-4 max-w-3xl',
                  { key: i },
                  m.text != 'No answer produced.' &&
                    h(
                      'div:mb-1.5',
                      {},
                      m.verified
                        ? h(
                            'span:inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5',
                            { style: { background: '#EAF7F1', color: '#1B8A5E' } },
                            h('L:BadgeCheck', { size: 12 }),
                            'Verified report',
                          )
                        : h(
                            'span:inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5',
                            { style: { background: '#F0F0F1', color: MUTE } },
                            h('L:Sparkles', { size: 12 }),
                            'AI-generated',
                          ),
                    ),
                  m.narrative && h('div:mb-2 text-sm text-[#8A8A8A]', {}, m.narrative),
                  h('div:text-[15px] text-[#1A1A1A]', {}, renderMd(h, m.text)),
                  m.widgets.length > 0 &&
                    h(
                      'div:mt-4 space-y-4',
                      {},
                      m.widgets.map((w, j) =>
                        h(
                          'div:min-w-0',
                          { key: j },
                          h(
                            'div:flex justify-end mb-1 no-print',
                            {},
                            h(
                              [
                                'button:inline-flex items-center gap-1 text-[11px] font-medium rounded-full border bg-white px-2 py-0.5',
                                'text-[#5A5A5A] hover:text-[#E03F00] hover:border-[#FBD9CC]',
                              ].join(' '),
                              { style: { borderColor: LINE }, onClick: () => pinWidget(m, w, messages[i - 1]?.role == 'user' ? messages[i - 1].text : '') },
                              h('L:Pin', { size: 11 }),
                              'Add to dashboard',
                            ),
                          ),
                          h('div:min-w-0 overflow-hidden', {}, hh(ctx, VizWidget, { spec: { width: 640, height: 340, ...w }, runSql: drillSql })),
                        ),
                      ),
                    ),
                  m.followUps.length > 0 &&
                    h(
                      'div:mt-3 flex flex-wrap gap-2',
                      {},
                      m.followUps.map((f, j) =>
                        h(
                          'button:max-w-full truncate px-3 py-1.5 text-sm rounded-full border bg-white text-[#E03F00] hover:bg-[#FFF0EB]',
                          { key: j, style: { borderColor: '#FBD9CC' }, onClick: () => runAsk(f.question) },
                          f.label || f.question,
                        ),
                      ),
                    ),
                  (m.sql || rows.length) &&
                    h(
                      'div:mt-3',
                      {},
                      h(
                        'button:text-xs text-[#8A8A8A] hover:text-[#5A5A5A] inline-flex items-center gap-1',
                        { onClick: () => setShowData((s) => ({ ...s, [i]: !s[i] })) },
                        h('L:Database', { size: 12 }),
                        open ? 'Hide SQL / data' : 'Show SQL / data',
                      ),
                      open &&
                        h(
                          'div:mt-2 space-y-2',
                          {},
                          m.sql && h('pre:text-xs bg-[#FAFAFB] border rounded-lg p-3 overflow-x-auto whitespace-pre text-[#5A5A5A]', { style: { borderColor: LINE } }, m.sql),
                          dcols.length > 0 && hh(ctx, VizWidget, { spec: { kind: 'table', columns: dcols, rows: rows.slice(0, 50) } }),
                        ),
                    ),
                )
              })()
        const depthRow = h(
          'div:inline-flex items-center gap-2 text-xs text-[#8A8A8A]',
          {},
          'Answer depth',
          h(
            'div:inline-flex rounded-lg border overflow-hidden',
            { style: { borderColor: LINE } },
            [
              ['short', 'Short'],
              ['medium', 'Long'],
              ['deep', 'In depth'],
            ].map(([v, l]) =>
              h(
                `button:px-2.5 py-1 text-xs font-medium ${depth == v ? 'text-white' : 'text-[#5A5A5A] hover:bg-slate-50'}`,
                { key: v, style: depth == v ? { background: ORANGE } : {}, onClick: () => setDepth(v) },
                l,
              ),
            ),
          ),
        )
        const askScreen = () =>
          h(
            `div:${mobileDemo ? 'px-3 py-4' : 'px-6 py-6'} max-w-3xl mx-auto`,
            {},
            messages.length == 0
              ? h(
                  'div:pt-8',
                  {},
                  head(`Hi ${P.first}, ask anything about your money`, 'block text-2xl font-semibold text-[#1A1A1A] text-center'),
                  h('p:text-sm text-[#8A8A8A] mt-1.5 text-center', {}, 'Answers run live over your transactions with charts you can explore.'),
                  h('div:mt-6', {}, composer(true)),
                  h('div:mt-3 flex justify-center', {}, depthRow),
                  h(
                    'div:mt-4 flex flex-wrap justify-center gap-2',
                    {},
                    REPORTS.slice(0, 4).map((r) =>
                      h(
                        [
                          `button:inline-flex max-w-full items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-[13px] ${mdUp('md:px-3 md:py-1.5 md:text-sm')}`,
                          'font-medium text-[#5A5A5A] hover:border-[#FBD9CC] hover:text-[#E03F00]',
                        ].join(' '),
                        { key: r.id, style: { borderColor: LINE }, onClick: () => runVerified(r) },
                        h('L:BadgeCheck', { size: 13, className: 'shrink-0', style: { color: GREEN } }),
                        h('span:truncate', {}, r.q),
                      ),
                    ),
                  ),
                )
              : h(
                  'div',
                  {},
                  messages.map(askMsg),
                  busy &&
                    h(
                      'div:my-4 space-y-1.5',
                      {},
                      h(
                        'div:flex items-center gap-2 text-sm text-[#8A8A8A]',
                        {},
                        h('L:Sparkles', { size: 15, className: 'animate-pulse', style: { color: ORANGE } }),
                        status?.t || 'Analysing your transactions…',
                      ),
                      status?.pct != null &&
                        h(
                          'div:h-1.5 rounded-full overflow-hidden',
                          { style: { background: '#F0EFEE' } },
                          h('div:h-full rounded-full transition-all duration-200', { style: { width: status.pct + '%', background: ORANGE } }),
                        ),
                    ),
                  h(
                    `div:sticky bottom-0 ${mobileDemo ? '-mx-3 px-3' : '-mx-6 px-6'} pt-3 pb-4 mt-4 space-y-2`,
                    { style: { background: '#F7F7F8' } },
                    h('div:flex justify-center', {}, depthRow),
                    composer(false),
                  ),
                ),
          )

        const field = (k, v) =>
          h('div', {}, h('div:text-xs text-[#8A8A8A]', {}, k), h('div:text-sm text-[#1A1A1A] break-words mt-0.5', {}, v == null || v === '' ? '—' : String(v)))
        const drawer =
          detail &&
          h(
            'div:fixed inset-0 z-[60] flex',
            {},
            h('div:flex-1 bg-black/30', { onClick: () => setDetail(null) }),
            h(
              'aside:w-full max-w-md bg-white h-full overflow-auto shadow-2xl',
              {},
              h(
                'div:flex items-center justify-between px-5 py-4 border-b',
                { style: { borderColor: LINE } },
                head('Transaction details', 'font-bold text-[#1A1A1A]'),
                h('button:w-8 h-8 grid place-items-center rounded-lg hover:bg-slate-100', { onClick: () => setDetail(null) }, h('L:X', { size: 16 })),
              ),
              h(
                'div:p-5 space-y-5',
                {},
                h('div:flex items-center justify-between', {}, h('div:text-2xl font-bold tabular-nums text-[#1A1A1A]', {}, usd(detail.value)), pill(detail.status)),
                h(
                  'div:flex items-center gap-2 text-sm',
                  {},
                  h('span:font-semibold text-[#1A1A1A]', {}, detail.customer || 'Missing customer ID'),
                  h('L:ArrowRight', { size: 15, className: 'text-[#8A8A8A]' }),
                  h('span:font-semibold text-[#1A1A1A]', {}, detail.product),
                ),
                h(
                  'div:grid grid-cols-2 gap-4 pt-1',
                  {},
                  field('Transaction ID', detail.tid),
                  field('Date', fmtDate(detail.date)),
                  field('Customer type', detail.customer_type),
                  field('Product category', detail.product_category),
                  field('Quantity', detail.quantity),
                  field('Unit price', usd(detail.price)),
                  field('Transaction value', usd(detail.value)),
                  field('Fee', '$' + (+detail.fee).toFixed(2)),
                  field('Payment method', detail.payment_method),
                  field('Payment channel', detail.payment_channel),
                  field('Quality issue', detail.quality ? 'Flagged' : 'No'),
                ),
              ),
            ),
          )

        return h(
          `div:flex flex-col overflow-hidden ${mobileDemo ? 'h-full min-h-0' : 'h-[100dvh] md:h-auto md:min-h-screen md:block md:overflow-visible'}`,
          {
            style: { height: mobileDemo ? ctx.vars.mobileHeight || '100vh' : undefined, background: '#F7F7F8', color: INK, fontFamily: "'Inter', system-ui, sans-serif" },
            onClick: (e) => {
              if (!e.target.closest?.('.relative')) {
                menu && setMenu(false)
                colMenu && setColMenu(false)
              }
            },
          },
          h('style', {}, FONT_CSS + PRINT_CSS + STALE_CSS),
          header,
          h(
            `div:relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden ${mdUp('md:overflow-visible')}`,
            {},
            h(
              'div:mx-auto max-w-[1320px] print-area',
              {},
              screen == 'reports'
                ? reportsScreen()
                : screen == 'ask'
                  ? askScreen()
                  : h(`div:${mobileDemo ? 'px-3 py-4' : 'px-6 py-6'}`, {}, screen == 'schedules' ? schedScreen() : homeScreen()),
            ),
            drawer,
            builder,
          ),
          mobileNav,
          toast &&
            h(
              'div:fixed bottom-5 right-5 z-[70] no-print flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white max-w-sm',
              { style: { background: toast.tone == 'error' ? RED : toast.tone == 'success' ? GREEN : INK } },
              h('L:' + (toast.tone == 'error' ? 'AlertCircle' : toast.tone == 'success' ? 'CheckCircle2' : 'Info'), { size: 16, className: 'shrink-0' }),
              toast.msg,
            ),
        )
      },
    metadata: applet({ title: 'Finance Demo', icon: 'Wallet', showMessageInput: false }),
    sampleCtxData: () => SAMPLE,
  }),
})

const FinanceDemoDesktop = dsls.react['react-comp'].FinanceDemoDesktop
ReactComp('FinanceDemoMobile', {
  impl: comp({
    hFunc:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx.setVars({ mobileDemo: true }), FinanceDemoDesktop),
  }),
})

const FinanceDemoMobile = dsls.react['react-comp'].FinanceDemoMobile
ReactComp('FinanceDemo', {
  impl: comp({
    hFunc:
      (ctx, { react: { h, hh } }) =>
      () => {
        const params = new URLSearchParams(globalThis.location?.search || ''),
          inDeck = !!globalThis.self && globalThis.self !== globalThis.top,
          framed = inDeck || params.get('deck') == '1'
        // framed: the desktop/mobile toggle lives in the DECK (outside this iframe) and drives ?view=
        const view = params.get('view') == 'mobile' ? 'mobile' : 'desktop'
        const demo = view == 'mobile' ? hh(ctx.setVars({ mobileHeight: framed ? 'calc(100% - 18px)' : '100vh' }), FinanceDemoMobile) : hh(ctx, FinanceDemoDesktop)
        if (!framed) return demo
        return h(
          'div:h-screen flex flex-col overflow-hidden',
          { style: { background: '#ECEDEF', fontFamily: "'Inter', system-ui, sans-serif" } },
          view == 'desktop'
            ? h('div:flex-1 min-h-0 overflow-auto bg-white', {}, demo)
            : h(
                'div:flex-1 min-h-0 grid place-items-center px-4 py-5',
                {},
                h(
                  'div:relative w-[390px] max-w-full h-full max-h-[760px] rounded-[44px] border-[10px] border-[#171717] bg-black shadow-2xl overflow-hidden',
                  {},
                  h('div:absolute z-50 top-0 left-1/2 -translate-x-1/2 w-28 h-5 rounded-b-2xl bg-[#171717]'),
                  h('div:h-[18px] bg-white'),
                  h('div:w-full overflow-hidden bg-white', { style: { height: 'calc(100% - 18px)' } }, demo),
                ),
              ),
        )
      },
    metadata: applet({ title: 'Finance Demo', icon: 'Wallet', showMessageInput: false }),
    sampleCtxData: () => SAMPLE,
  }),
})
