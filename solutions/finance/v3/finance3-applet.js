import { dsls, coreUtils, jb } from '@jb6/core'
import '@jb6/react'
import '@jb6/react/reveal.js'
import '@jb6/core/misc/pretty-print.js'
import '@wonder/ui/zui/zui-dsl.js'
import '@wonder/db/db-drivers.js'
const { wfetch2 } = jb.wonderUtils
import './finance3-benchmarks.js'
import '@wonder/bi/benchmark/bi-benchmark-applet.js'

const {
  tgp: { Const, 'ctx-enricher': { loadReveal, Var } },
  bi: { 'query-environment': { cloud, wasm } },
  react: {
    ReactComp, 'react-comp': { comp, zoomingSvg, biBenchmarkPerformance },
    'react-metadata': { importUrl }
  },
  zui: {
    'metadata-layout': { twoLayerMetadataLayout },
    'zoom-views': { zoomViews }, 'item-view': { itemView }
  }
} = dsls
const codeMirrorBundle = '@jb6/react/lib/codemirror6/codemirror6-bundle.mjs'
const portfolioQueryCase = dsls.bi['query-case']['finance3Bench.customerPortfolio']
const portfolioSql = portfolioQueryCase.$run().sql.profile
const cubeProfileText = coreUtils.prettyPrintComp(coreUtils.compByFullId('cube<bi>finance3Cube'), { tgpModel: jb })

const Finance3LambdaColdPerformance = ReactComp('finance3LambdaColdPerformance', {
  impl: biBenchmarkPerformance({
    title: 'Lambda cold', cases: [['customerPortfolio', portfolioQueryCase]],
    environmentProfiles: [['cloud', cloud]], warmRuns: 0, selectedRun: 'lambda-cold'
  })
})
const Finance3LambdaWarmPerformance = ReactComp('finance3LambdaWarmPerformance', {
  impl: biBenchmarkPerformance({
    title: 'Lambda warm', cases: [['customerPortfolio', portfolioQueryCase]],
    environmentProfiles: [['cloud', cloud]], warmRuns: 1, selectedRun: 'lambda-warm'
  })
})
const Finance3WasmWarmPerformance = ReactComp('finance3WasmWarmPerformance', {
  impl: biBenchmarkPerformance({
    title: 'Warm WASM', cases: [['customerPortfolio', portfolioQueryCase]],
    environmentProfiles: [['wasm', wasm]], warmRuns: 0, selectedRun: 'wasm-warm', clearBeforeRun: false
  })
})
const Finance3WasmColdPerformance = ReactComp('finance3WasmColdPerformance', {
  impl: biBenchmarkPerformance({
    title: 'Cold WASM', cases: [['customerPortfolio', portfolioQueryCase]],
    environmentProfiles: [['wasm', wasm]], warmRuns: 0, selectedRun: 'wasm-cold'
  })
})

const fin3ArchitectureCss = `
.f3a{font-family:Inter,system-ui;color:#dce8f3}.f3a *{box-sizing:border-box}.f3a h2{font-size:34px;margin:0 0 4px;color:#f5f9fc}
.f3a .sub{font-size:15px;color:#7890a6;margin-bottom:16px}.f3a .node{background:#0b1926;border:1px solid #294158;border-radius:12px;padding:13px 16px}
.f3a .node b{display:block;font-size:17px;color:#f4f8fb}.f3a .node small{display:block;font-size:11px;color:#8299ad;margin-top:3px}
.f3a .software{border-color:#39aee3}.f3a .gateway{border:2px solid #f2b84b}.f3a .storage{border-color:#35c99a;background:#0b211f}
.f3a .boundary{border:1px solid #294158;border-radius:18px;padding:14px 20px 16px;background:#07131e}
.f3a .boundary-label{font-size:10px;letter-spacing:.16em;color:#5f7890;text-align:left;margin-bottom:8px}.f3a .down{font-size:11px;color:#86a0b6;line-height:17px}
.f3a .system{display:grid;grid-template-columns:1.5fr .65fr .75fr;align-items:center;gap:14px}.f3a .stack{display:grid;gap:5px}
.f3a .wire{font-size:11px;color:#efbc59;letter-spacing:.04em;line-height:1.5}.f3a .wire strong{display:block;color:#ffd375;font-size:13px}
.f3a .bucket{position:relative;padding:30px 16px 22px;border:2px solid #35c99a;border-radius:12px 12px 28px 28px;background:#0b211f}
.f3a .bucket:before{content:'';position:absolute;left:-2px;right:-2px;top:-10px;height:21px;border:2px solid #35c99a;border-radius:50%;background:#10312d}
.f3a .bucket b{display:block;font-size:20px;color:#7ce7c4}.f3a .bucket small{display:block;margin-top:7px;font-size:11px;color:#84aa9e;line-height:1.5}
.f3a .lean-flow{display:grid;grid-template-columns:320px minmax(160px,1fr) 320px;align-items:center;gap:22px;width:70%;margin:55px auto}
.f3a .lean-browser{padding:16px;border:1px solid #294158;border-radius:16px;background:#07131e}
.f3a .lean-browser>label{display:block;margin-bottom:10px;color:#5f7890;font-size:9px;letter-spacing:.16em;text-align:left}
.f3a .lean-stack{display:grid;gap:5px}.f3a .lean-stack i{color:#6f879c;font-size:10px;font-style:normal;line-height:12px}
.f3a .cache-origin{position:relative}.f3a .page-fault{position:absolute;left:100%;top:50%;width:380px;border-top:2px dashed #f2b84b}
.f3a .page-fault{color:#efbc59;font-size:9px;letter-spacing:.08em;padding-top:7px}
.f3a .page-fault:after{content:'▶';position:absolute;right:-2px;top:-8px;color:#f2b84b;font-size:12px}
.f3a .lean-flow>.bucket{grid-column:3;min-height:250px}
.f3a .mini-parquet{width:62%;margin:60px auto 0;padding:8px;border:1px solid #6bd9b7;border-radius:4px;background:#081722;text-align:left}
.f3a .mini-parquet header{display:flex;justify-content:space-between;color:#f2c25f;font:700 7px ui-monospace}
.f3a .mini-cols{display:flex;height:42px;margin-top:7px}.f3a .mini-cols span{border-right:1px solid #102c41;background:#245577}
.f3a .mini-cols .read{background:#f3a72f}
.f3a .loop-grid{display:grid;grid-template-columns:1fr 80px 1.1fr 80px 1fr;align-items:center}
.f3a .decision{border:2px solid #f2b84b;border-radius:18px;padding:22px 12px;background:#241d10}.f3a .decision b{font-size:22px;color:#ffd47c}
.f3a .arrow{font-size:25px;color:#6f879c}.f3a .arrow label{display:block;font-size:10px;color:#8da3b7}.f3a .miss{color:#f2b84b}.f3a .hit{color:#35c99a}
.f3a .return{margin:14px auto 0;border-top:2px solid #35c99a;width:67%;padding-top:6px;color:#65deb8;font-size:12px}
.f3a .parquet-view{display:grid;grid-template-columns:260px minmax(0,1fr);align-items:center;gap:36px;width:96%;margin:auto}
.f3a .queries{display:grid;gap:7px;text-align:left}.f3a .query{padding:9px 11px;border:1px solid #294158;border-radius:8px;background:#0b1926;cursor:pointer;text-align:left}
.f3a .query.active{border-color:#f3a72f;background:#241b10}.f3a .query b{display:block;font-size:11px;color:#dce8f3}
.f3a .query code{display:block;margin-top:4px;color:#7890a6;font-size:7px;white-space:normal}.f3a .query.active code{color:#e8b85c}
.f3a .parquet{position:relative;padding:16px 18px;border:2px solid #3b566e;border-radius:8px 28px 8px 8px;background:#081722;box-shadow:0 18px 45px #02080e99}
.f3a .parquet:after{content:'';position:absolute;right:-2px;top:-2px;border-style:solid;border-width:0 30px 30px 0;border-color:transparent #193247 transparent transparent}
.f3a .parquet-mark{display:flex;justify-content:space-between;color:#f2c25f;font:700 10px ui-monospace;letter-spacing:.18em;padding:0 3px 7px}
.f3a .column-head,.f3a .period{display:grid;grid-template-columns:92px 1fr;align-items:center}.f3a .column-head{margin-bottom:3px;color:#66849b;font-size:5px}
.f3a .column-numbers,.f3a .period-cols{display:flex}.f3a .column-numbers span{flex:none;text-align:center;min-width:1px;overflow:hidden;border-right:1px solid #203e54}
.f3a .column-numbers .read{color:#f3a72f;background:#332510}
.f3a .timeline{display:grid;gap:3px}.f3a .period{display:grid;grid-template-columns:92px 1fr;align-items:stretch}
.f3a .period-label{display:flex;align-items:center;color:#55748d;font-size:7px;text-align:left}
.f3a .period-cols{display:flex;height:100%;overflow:hidden;background:#0e293e;border-radius:2px}
.f3a .period-col{flex:none;min-width:1px;background:#245577;border-right:1px solid #102c41}
.f3a .heat-0 .period-label{color:#f3a72f;font-weight:800}.f3a .heat-0 .period-col,.f3a .heat-1 .period-col{background:#365f78}
.f3a .heat-2 .period-col{background:#2d5570}.f3a .heat-3 .period-col{background:#244b67}.f3a .heat-4 .period-col{background:#1b405b}
.f3a .period-col.read{background:#f3a72f}
.f3a .ratio{text-align:left}.f3a .ratio strong{display:block;color:#f3a72f;font-size:42px;line-height:1}.f3a .ratio b{display:block;color:#dce8f3;font-size:16px;margin:8px 0}
.f3a .ratio small{display:block;color:#738b9f;font-size:11px;line-height:1.5}
.f3a .ratio-line{height:3px;background:linear-gradient(90deg,#f3a72f 10%,#17344b 10%);margin-bottom:12px}
.f3a .compression-list{display:grid;grid-template-columns:repeat(2,1fr);gap:4px;margin:12px 0}.f3a .compression-list span{color:#7890a6;font-size:9px}
.f3a .compression-list .read{color:#f3a72f;font-weight:800}.f3a .col-key{display:flex;gap:10px;color:#7890a6;font-size:8px}
`

ReactComp('fin3Architecture', {
  impl: comp({
    enrichCtx: loadReveal(),
    hFunc: ({}, { reveal, react: { h, useEffect, useRef, useState } }) => () => {
      const host = useRef()
      const [selectedQuery, setSelectedQuery] = useState(0)
      useEffect(() => reveal.mount(host.current, { hash: true, transition: 'fade', width: '100%', height: '100%', margin: 0 }).disconnect, [])
      const node = (title, sub, cls = '') => h(`div:node ${cls}`, {}, h('b', {}, title), h('small', {}, sub))
      const compressionShares = [18, 8, 14, 5, 12, 10, 16, 6, 7, 4]
      const rowGroups = [
        ['AUG 2026 · PARTIAL MONTH', .5, 0], ['JUL 2026 · MONTH', 1, 1], ['JUN 2026 · MONTH', 1, 1], ['MAY 2026 · MONTH', 1, 1],
        ['FEB–APR 2026 · 3 MONTHS', 3, 2], ['NOV 2025–JAN 2026 · 3 MONTHS', 3, 2],
        ['AUG–OCT 2025 · 3 MONTHS', 3, 3], ['MAY–JUL 2025 · 3 MONTHS', 3, 3],
        ['MAY 2024–APR 2025 · 12 MONTHS', 12, 4], ['MAY 2023–APR 2024 · 12 MONTHS', 12, 4],
        ['MAY 2022–APR 2023 · 12 MONTHS', 12, 4]
      ]
      const queries = [
        { title: 'Q1 · Last 30 days · 5 cols', sql: 'SELECT c1,c2,c4,c6,c10 WHERE date >= today() - 30', rows: [0, 1], cols: [0, 1, 3, 5, 9] },
        { title: 'Q2 · This month vs last year · 3 cols', sql: 'SELECT c1,c3,c6 WHERE month IN (2026-08, 2025-08)', rows: [0, 6], cols: [0, 2, 5] },
        { title: 'Q3 · Latest quarter report · 7 cols', sql: 'SELECT c1,c2,c3,c5,c6,c7,c9 WHERE date >= 2026-06-01', rows: [0, 1, 2], cols: [0, 1, 2, 4, 5, 6, 8] }
      ]
      const query = queries[selectedQuery], fileMonths = rowGroups.reduce((sum, [, months]) => sum + months, 0)
      const selectedShare = query.cols.reduce((sum, column) => sum + compressionShares[column], 0)
      const selectedMonths = query.rows.reduce((sum, row) => sum + rowGroups[row][1], 0)
      const readPercent = (selectedShare * selectedMonths / fileMonths).toFixed(1)
      const RowGroup = ({ row: [label, months, temperature], index }) =>
        h(`div:period heat-${temperature}`, { style: { height: `${months * 7}px` } },
          h('span:period-label', {}, `RG ${index} · ${label}`), h('div:period-cols', {}, ...compressionShares.map((share, column) =>
            h(`span:period-col ${query.rows.includes(index) && query.cols.includes(column) ? 'read' : ''}`, { style: { width: `${share}%` },
              title: `row group ${index} · column ${column + 1} · ${share}% compressed bytes` }))))
      const rowGroupView = (row, index) => RowGroup({ row, index })
      const slide = (title, sub, body) => h('section:f3a', { 'data-background-color': '#06111b' },
        h('style', {}, fin3ArchitectureCss), h('h2', {}, title), h('div:sub', {}, sub), body)
      return h('div:reveal', { ref: host, style: { position: 'absolute', inset: 0 } }, h('div:slides', {},
        slide('Query → physical Parquet reads', 'Select SQL; only its required compressed column chunks become warm',
          h('div:parquet-view', {}, h('div:queries', {}, ...queries.map((item, index) =>
            h(`button:query ${index === selectedQuery ? 'active' : ''}`, { onClick: () => setSelectedQuery(index) },
              h('b', {}, item.title), h('code', {}, item.sql))), h('div:ratio', {}, h('strong', {}, `${readPercent}%`),
              h('b', {}, 'of compressed file bytes'), h('small', {}, `${selectedMonths} of ${fileMonths} month-units × ${selectedShare}% column share`))),
          h('div:parquet', {}, h('div:parquet-mark', {}, h('span', {}, 'PAR1'),
            h('span', {}, 'TRANSACTIONS.PARQUET')), h('div:column-head', {}, h('span', {}, 'PHYSICAL ROW GROUP'),
            h('div:column-numbers', {}, ...compressionShares.map((share, column) =>
              h(query.cols.includes(column) ? 'span:read' : 'span', { style: { width: `${share}%` } }, `C${column + 1} ${share}%`)))),
            h('div:timeline', {}, ...rowGroups.map(rowGroupView)),
            h('div:parquet-mark', { style: { padding: '7px 3px 0' } },
              h('span', {}, 'FOOTER · SCHEMA · OFFSETS · MIN/MAX'), h('span', {}, 'PAR1'))))),
        slide('Lean WASM data path', 'A colsCache miss page-faults one remote Parquet range',
          h('div:lean-flow', {}, h('div:lean-browser', {}, h('label', {}, 'BROWSER'), h('div:lean-stack', {},
            node('JavaScript', 'SQL query'), h('i', {}, '↓'), node('DuckDB WASM', 'Parquet reader', 'software'), h('i', {}, '↓'),
            h('div:cache-origin', {}, node('colsCache', 'getOrCreateCol()', 'gateway storage'),
              h('div:page-fault', {}, 'MISS · PAGE FAULT · HTTPS RANGE · SIGNED URL')),
            h('i', {}, '↓ lookup column'), node('VFS', 'column cache', 'software'))),
          h('div:bucket', {}, h('b', {}, 'GCS bucket'), h('small', {}, 'Private object storage'),
            h('div:mini-parquet', {}, h('header', {}, h('span', {}, 'PAR1'), h('span', {}, 'FILE.PARQUET')),
              h('div:mini-cols', {}, ...compressionShares.map((share, column) =>
                h(column === 3 ? 'span:read' : 'span', { style: { width: `${share}%` } }))))))),
        slide('Option 2 · Page fault as the architecture', 'colsCache is the decision point between a local hit and a remote range fetch',
          h('div', {}, h('div:loop-grid', {}, node('DuckDB WASM', 'read(offset, length)', 'software'),
            h('div:arrow', {}, '→', h('label', {}, 'logical read')),
            h('div:decision', {}, h('b', {}, 'colsCache'), h('small', {}, 'Is this range cached?')),
            h('div:arrow miss', {}, '→', h('label', {}, 'MISS · page fault')),
            node('GCS Parquet', 'HTTP Range: bytes 8,400–12,600', 'storage')),
          h('div:return', {}, 'GCS bytes  →  browser range cache  →  resume the blocked DuckDB read  ↩')))))
    }
  })
})

const Finance3CodeMirror = ReactComp('finance3CodeMirror', {
  params: [
    { id: 'fontSize', as: 'number', defaultValue: 12 },
    { id: 'fontSizeButton', as: 'boolean', defaultValue: true }
  ],
  impl: comp({
    hFunc: ({}, { react: { h, useEffect, useRef, useState } }, { fontSize, fontSizeButton }) => ({ code }) => {
      const cm = jb.reactRepository.importCache[codeMirrorBundle], host = useRef(), view = useRef()
      const [currentFontSize, setFontSize] = useState(fontSize)
      useEffect(() => {
        view.current = new cm.EditorView({
          parent: host.current,
          state: cm.EditorState.create({
            doc: code,
            extensions: [
              cm.lineNumbers(), cm.javascript(), cm.oneDark, cm.EditorState.readOnly.of(true),
              cm.EditorView.theme({
                '&': { height: '100%', fontSize: 'var(--code-font-size)', backgroundColor: '#071521' },
                '.cm-scroller': { overflow: 'auto' }, '.cm-content': { fontFamily: 'ui-monospace,SFMono-Regular,monospace' },
                '.cm-gutters': { backgroundColor: '#0b1220', color: '#64748b', border: 'none' },
                '.cm-activeLine,.cm-activeLineGutter': { backgroundColor: '#10283a' }
              }, { dark: true })
            ]
          })
        })
        return () => view.current.destroy()
      }, [])
      const resizeFont = by => e => (e.stopPropagation(), setFontSize(size => Math.max(8, Math.min(28, size + by))))
      return h('div', { style: { height: '100%', position: 'relative', '--code-font-size': `${currentFontSize}px` } },
        h('style', {}, `.finance3-font-size-button:hover{background:#334155aa!important;color:white!important}
          .finance3-font-size-button:focus-visible{outline:2px solid #38bdf8;outline-offset:-2px}`),
        fontSizeButton && h('div', { style: {
          position: 'absolute', zIndex: 2, top: 7, right: 9, display: 'flex', overflow: 'hidden',
          border: '1px solid #475569aa', borderRadius: 8, background: '#0f172ae8', boxShadow: '0 4px 14px #0006',
          backdropFilter: 'blur(8px)'
        }}, ...[['A−', -2, 'Decrease font size'], ['A+', 2, 'Increase font size']].map(([label, by, title], i) =>
          h('button', { key: label, className: 'finance3-font-size-button', onClick: resizeFont(by), title, 'aria-label': title, style: {
            width: 34, height: 28, border: 0, borderLeft: i ? '1px solid #47556988' : 0,
            background: 'transparent', color: '#cbd5e1', font: '600 12px Inter,system-ui', cursor: 'pointer'
          }}, label))),
        h('div', { ref: host, style: { height: '100%' } }))
    },
    metadata: importUrl(codeMirrorBundle)
  })
})

const symbols = {
  row: '№', transaction: '🧾', date: '📅', customer: '👤', product: '📦',
  payment: '💳', quantity: '🔢', value: '💵', quality: '◆', segment: '◉'
}
const symbolNames = Object.fromEntries(Object.entries(symbols).map(([name, symbol]) => [symbol, name]))
const field = (name, type, meaning, usage, profile) => ({ name, type, meaning, usage, profile })
const customerPortfolioCompiledSql = `WITH base AS (
  SELECT t.*, p.product_category, p.brand, p.unit_cost,
    m.payment_channel, m.payment_provider, m.fee_bps
  FROM cols_cache(['room:gcs//finance3/usersRO/silver/transactions-18m-hist.parquet']) t
  LEFT JOIN cols_cache(['room:gcs//finance3/usersRO/silver/products.parquet']) p USING (product)
  LEFT JOIN cols_cache(['room:gcs//finance3/usersRO/silver/payments.parquet']) m USING (payment_method)
)
SELECT customer_type, customer_country, loyalty_tier,
  count(DISTINCT customer_id) AS customers,
  count(*) AS txns,
  round(sum(CASE WHEN status = 'completed' THEN transaction_value END), 2) AS completed_value,
  round(100 * sum(status = 'completed') / nullif(count(*), 0), 2) AS completion_rate,
  round(100 * sum(has_quality_issue) / nullif(count(*), 0), 2) AS quality_issue_rate
FROM base
WHERE customer_type IS NOT NULL
GROUP BY customer_type, customer_country, loyalty_tier
ORDER BY completed_value DESC`

Const('finance3InternalsMetadata', {
  lineage: [
    ['bronze', 'Dirty CSV', '100,000 source rows', '#f59e0b'],
    ['clean', 'Clean + deterministic dates', 'quality flags · 2020–2025', '#38bdf8'],
    ['silver', 'Transaction silver', 'latest 18 months + history · 2 row groups', '#22c55e'],
    ['cube', 'Finance3 semantic cube', '18 dimensions · 18 metrics', '#a78bfa']
  ],
  graph: {
    children: [
      ['transactions', 'transactions-18m-hist.parquet',
        [[symbols.row, 'source_row'], '·', [symbols.transaction, 'transaction_id'], '↦', [symbols.date, 'date'], '·',
          [symbols.customer, 'customer_id'], '·', [symbols.product, 'product'], '·', [symbols.payment, 'payment_method']],
        'fact', 29, 100000, 2, 2567378],
      ['customers', 'customers.parquet',
        [[symbols.customer, 'customer_id'], '↦', [symbols.segment, 'type · country · loyalty']],
        'enriched', 4, 9500, 1, 94000],
      ['products', 'products.parquet',
        [[symbols.product, 'product'], '↦', [symbols.segment, 'category · brand'], '·', [symbols.value, 'unit cost']],
        'lookup', 4, 5, 1, 950],
      ['payments', 'payments.parquet',
        [[symbols.payment, 'payment_method'], '↦', [symbols.segment, 'channel · provider'], '·', [symbols.value, 'fee bps']],
        'lookup', 4, 3, 1, 820]
    ],
    edges: [
      ['customer', 'transactions', 'customers', 'customer_id N → 1 · physically enriched into silver'],
      ['product', 'transactions', 'products', 'product N → 1 · runtime star join'],
      ['payment', 'transactions', 'payments', 'payment_method N → 1 · runtime star join']
    ]
  },
  schemas: {
    transactions: {
      source: 'bronze/dirty_financial_transactions.csv → silver/transactions-18m-hist.parquet',
      primitiveData: ['date', 'customer_type', 'product', 'payment_method', 'transaction_value', 'has_quality_issue'],
      primitiveExample: {
        date: '2024-08-17', customer_type: 'Enterprise', product: 'Laptop',
        payment_method: 'Credit Card', transaction_value: 2499.98, has_quality_issue: 0
      },
      groups: {
        'Keys & time': [
          field('source_row', 'BIGINT', 'stable physical row key', 'all cube scans', '1 → 100,000 · unique'),
          field('transaction_id', 'VARCHAR', 'business transaction identifier', 'quality audit', '5,018 missing · duplicates flagged'),
          field('date', 'DATE', 'deterministic analytical date', '18-month/history pruning and trends', '2020-01-01 → 2025-06-30')
        ],
        'Customer enrichment': [
          field('customer_id', 'VARCHAR', 'customer lookup key', 'distinct customers', '≈9.5K customers'),
          field('customer_type', 'VARCHAR', 'commercial segment', 'customer portfolio', 'Consumer · SMB · Enterprise'),
          field('customer_country', 'VARCHAR', 'customer market', 'market opportunities', 'US · GB · DE · CA · AU'),
          field('loyalty_tier', 'VARCHAR', 'retention tier', 'customer portfolio', 'Bronze · Silver · Gold')
        ],
        'Product & payment': [
          field('product', 'VARCHAR', 'normalized product', 'product economics', '5 products'),
          field('payment_method', 'VARCHAR', 'normalized tender', 'payment economics', 'Cash · Credit Card · PayPal'),
          field('status', 'VARCHAR', 'normalized lifecycle status', 'completion and failure rates', 'completed · pending · failed · unknown')
        ],
        Measures: [
          field('quantity', 'DOUBLE', 'units in source transaction', 'units and cost', 'missing and negative values retained'),
          field('price', 'DOUBLE', 'source unit price', 'gross value', 'currency symbol removed'),
          field('transaction_value', 'DOUBLE', 'valid quantity × price', 'revenue metrics', 'null for invalid inputs')
        ],
        'Quality lineage': [
          field('source_date_quality', 'VARCHAR', 'raw-date diagnosis', 'quality audit', 'valid · invalid month/day · missing'),
          field('has_quality_issue', 'INTEGER', 'combined quality indicator', 'quality issue rate', '0 or 1'),
          field('transaction_date_raw', 'VARCHAR', 'unaltered source date', 'source reconciliation', 'junk retained for audit')
        ]
      }
    },
    customers: {
      source: 'generated from distinct source customer IDs; attributes also embedded in transaction silver',
      primitiveData: ['customer_type', 'customer_country', 'loyalty_tier'],
      primitiveExample: { customer_id: 'C1024', customer_type: 'SMB', customer_country: 'AU', loyalty_tier: 'Silver' },
      groups: {
        Identity: [field('customer_id', 'VARCHAR', 'one row per customer', 'enrichment key', 'distinct source IDs')],
        Segmentation: [
          field('customer_type', 'VARCHAR', 'commercial service model', 'portfolio prioritization', '3 types'),
          field('customer_country', 'VARCHAR', 'operating market', 'market prioritization', '5 countries'),
          field('loyalty_tier', 'VARCHAR', 'retention relationship', 'loyalty investment', '3 tiers')
        ]
      }
    },
    products: {
      source: 'silver/products.parquet · runtime lookup',
      primitiveData: ['product_category', 'brand', 'unit_cost'],
      primitiveExample: { product: 'Laptop', product_category: 'Computing', brand: 'Nova', unit_cost: 520 },
      groups: {
        Identity: [
          field('product', 'VARCHAR', 'normalized product key', 'runtime star join', '5 unique products'),
          field('product_category', 'VARCHAR', 'portfolio family', 'category economics', '4 categories'),
          field('brand', 'VARCHAR', 'commercial brand', 'brand economics', 'Nova · Vertex · Sonic · BrewCo')
        ],
        Economics: [field('unit_cost', 'INTEGER', 'estimated unit cost', 'gross margin', '$48 → $520')]
      }
    },
    payments: {
      source: 'silver/payments.parquet · runtime lookup',
      primitiveData: ['payment_channel', 'payment_provider', 'fee_bps'],
      primitiveExample: { payment_method: 'PayPal', payment_channel: 'Wallet', payment_provider: 'PayPal', fee_bps: 290 },
      groups: {
        Identity: [
          field('payment_method', 'VARCHAR', 'normalized tender key', 'runtime star join', '3 methods'),
          field('payment_channel', 'VARCHAR', 'commercial payment channel', 'channel economics', 'Offline · Card · Wallet'),
          field('payment_provider', 'VARCHAR', 'settlement provider', 'provider analysis', '3 providers')
        ],
        Economics: [field('fee_bps', 'INTEGER', 'estimated processing fee', 'payment fees', '0 → 290 bps')]
      }
    }
  }
})

const Finance3SchemaCard = ReactComp('finance3SchemaCard', {
  impl: comp({
    hFunc: ({}, { react: { h } }) => ({ node, metadata, view }) => {
      const schema = metadata.schemas[node.id], colors = { fact: '#38bdf8', enriched: '#f59e0b', lookup: '#4ade80' }
      const groups = Object.entries(schema.groups)
      const relation = node.relation.map((part, i) => {
        const [symbol, text] = Array.isArray(part) ? part : [part]
        const title = [symbolNames[symbol], text].filter(Boolean).join(' — ')
        return h('span', { key: i, title }, `${symbol}${text ? ` ${text}` : ''} `)
      })
      return h('div', {
        xmlns: 'http://www.w3.org/1999/xhtml', 'data-zui-card': node.id,
        style: {
          height: '100%', overflow: 'hidden', border: '1px solid #334155', borderRadius: '.55em',
          background: '#0b1220', color: '#cbd5e1', fontSize: 'var(--fontSize)', userSelect: 'text'
        }
      }, h('div', { style: {
        padding: '.55em .7em', borderLeft: `.35em solid ${colors[node.kind]}`,
        borderBottom: '1px solid #334155', background: '#111c2e', fontWeight: 800
      }}, node.label, h('span', { style: { float: 'right', color: colors[node.kind], fontSize: '.75em' } }, node.kind)),
      h('div', { style: { padding: '.35em .7em', color: '#fbbf24', textAlign: 'center' } }, ...relation),
      h('div', { style: { padding: '0 .7em', color: '#94a3b8', opacity: 'var(--columns)' } }, schema.primitiveData.join(' · ')),
      h('div', { style: {
        display: 'flex', justifyContent: 'space-between', padding: '.35em .7em',
        color: '#94a3b8', borderTop: '1px solid #1e293b'
      }}, h('span', {}, `▥ ${node.meta.fields}`), h('span', {}, `◫ ${(node.meta.bytes / 1024).toFixed(1)} KB`),
      h('span', {}, `≡ ${node.meta.rows.toLocaleString()} · ${node.meta.rowGroups} RG`)),
      view === 'groups' && h('div', { style: {
        display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '.45em', padding: '.6em'
      }}, ...groups.map(([name, fields]) => h('div', { style: {
        padding: '.45em', border: '1px solid #334155', borderRadius: '.4em', background: '#101a2c'
      }}, h('b', { style: { color: '#7dd3fc' } }, name), h('div', {}, `${fields.length} fields`),
      h('div', { style: { color: '#64748b' } }, fields.slice(0, 3).map(x => x.name).join(' · '))))),
      view === 'details' && h('div', { style: {
        display: 'grid', gridTemplateColumns: '8em 5em minmax(15em,2fr)', columnGap: '.7em', padding: '.6em'
      }}, ...groups.flatMap(([name, fields]) => [
        h('b', { style: { gridColumn: '1/-1', color: '#7dd3fc', borderBottom: '1px solid #334155' } }, name),
        ...fields.flatMap(item => [
          h('div', { style: { fontWeight: 700 } }, item.name),
          h('div', { style: { color: '#94a3b8' } }, item.type),
          h('div', {}, item.meaning, h('span', { style: { color: '#fbbf24' } }, ` · ${item.usage}`),
            h('div', { style: { color: '#86efac' } }, item.profile))
        ])
      ])),
      view === 'details' && h('div', { style: { padding: '.4em .7em', color: '#a7f3d0' } },
        `Real row · ${Object.entries(schema.primitiveExample).map(([key, value]) => `${key}=${value}`).join(' · ')}`))
    }
  })
})

const Finance3QueryCaseScene = ReactComp('finance3QueryCaseScene', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh, useState } }) => ({ rows = [] }) => {
      const detailIds = ['cube', 'compiled', 'lambda-cold', 'lambda-warm', 'wasm-cold', 'wasm', 'table', 'zui']
      const [detail, setDetail] = useState(detailIds[+location.hash.split('/')[2]] || detailIds[0])
      const money = value =>
        `$${Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}`
      const topRows = rows.slice(0, 12)
      const panel = (title, color, body) => h('div', { style: {
        height: '100%', border: '1px solid #334155', borderRadius: 12, overflow: 'hidden', background: '#0b1220'
      }}, h('div', { style: {
        padding: '9px 12px', borderBottom: '1px solid #1e293b', background: '#111c2e',
        color, fontSize: 11, fontWeight: 800, letterSpacing: 1.4
      }}, title), body)
      const code = (title, text, color) => panel(title, color,
        h('div', { style: { height: 'calc(100% - 39px)', textAlign: 'left' } }, hh(ctx, Finance3CodeMirror, { code: text })))
      const table = panel('RANKED CUSTOMER PORTFOLIO', '#4ade80', h('div', {
        style: { height: 'calc(100% - 39px)', overflow: 'auto' }
      }, h('div', { style: {
        display: 'grid', gridTemplateColumns: '1.4fr .6fr .65fr .75fr', padding: '8px 12px',
        color: '#64748b', fontSize: 9, letterSpacing: 1, position: 'sticky', top: 0, background: '#0b1220'
      }}, h('span', {}, 'COHORT'), h('span', {}, 'CUSTOMERS'), h('span', {}, 'COMPLETE'), h('span', {}, 'VALUE')),
      ...topRows.map((row, rank) => h('div', { style: {
        display: 'grid', gridTemplateColumns: '1.4fr .6fr .65fr .75fr', alignItems: 'center',
        padding: '8px 12px', borderTop: '1px solid #1e293b', fontSize: 12
      }}, h('div', {}, h('b', {}, `${rank + 1}. ${row.customer_type}`),
      h('div', { style: { color: '#64748b' } }, `${row.customer_country} · ${row.loyalty_tier}`)),
      h('span', {}, row.customers), h('span', { style: { color: '#4ade80' } }, `${row.completion_rate}%`),
      h('b', { style: { color: '#67e8f9' } }, money(row.completed_value))))))
      const performance = benchmarkComp => h('div', {
        className: 'finance3-benchmark', style: { height: '100%', overflow: 'auto', fontSize: 16 }
      },
        h('style', {}, `.finance3-benchmark main{min-height:0;padding:16px}.finance3-benchmark h1{font-size:24px;margin:0;text-transform:none}
          .finance3-benchmark strong{font-size:14px}.finance3-benchmark table{font-size:14px}`),
        hh(ctx, benchmarkComp))
      const values = rows.map(row => row.completed_value), rates = rows.map(row => row.completion_rate)
      const [minValue, maxValue, minRate, maxRate] = [Math.min(...values), Math.max(...values), Math.min(...rates), Math.max(...rates)]
      const bubbles = rows.map(row => ({
        row, r: 8 + 12 * Math.sqrt(row.customers / Math.max(...rows.map(item => item.customers))),
        tx: 90 + 750 * (row.completed_value - minValue) / (maxValue - minValue || 1),
        ty: 375 - 300 * (row.completion_rate - minRate) / (maxRate - minRate || 1)
      })).map(bubble => ({ ...bubble, x: bubble.tx, y: bubble.ty }))
      for (let step = 0; step < 160; step++) {
        bubbles.forEach(bubble => { bubble.x += (bubble.tx - bubble.x) * .015; bubble.y += (bubble.ty - bubble.y) * .015 })
        bubbles.forEach((bubble, i) => bubbles.slice(i + 1).forEach((other, j) => {
          const dx = other.x - bubble.x || (j % 2 ? .01 : -.01), dy = other.y - bubble.y || .01
          const overlapX = 63 - Math.abs(dx), overlapY = 43 - Math.abs(dy)
          if (overlapX > 0 && overlapY > 0) {
            if (overlapX < overlapY) {
              const shift = Math.sign(dx) * overlapX / 2
              bubble.x -= shift; other.x += shift
            } else {
              const shift = Math.sign(dy) * overlapY / 2
              bubble.y -= shift; other.y += shift
            }
          }
        }))
      }
      const zui = panel('ZUI RESULT · SCROLL TO ZOOM · DRAG TO PAN', '#a78bfa', hh(ctx, zoomingSvg, {
        width: 900, height: 450,
        content: zctx => {
          const { scale, pan } = zctx.vars.zoomState, zoom = +scale.toFixed(2)
          return h('g', {},
            h('path', { d: 'M90 45V375H850', fill: 'none', stroke: '#475569' }),
            h('text', { x: 470, y: 425, fill: '#94a3b8', fontSize: 12, textAnchor: 'middle' }, 'Completed value →'),
            h('text', { transform: 'translate(25 210) rotate(-90)', fill: '#94a3b8', fontSize: 12, textAnchor: 'middle' },
              'Completion rate →'),
            h('text', { x: 90, y: 395, fill: '#64748b', fontSize: 10 }, money(minValue)),
            h('text', { x: 850, y: 395, fill: '#64748b', fontSize: 10, textAnchor: 'end' }, money(maxValue)),
            h('text', { x: 80, y: 375, fill: '#64748b', fontSize: 10, textAnchor: 'end' }, `${minRate}%`),
            h('text', { x: 80, y: 50, fill: '#64748b', fontSize: 10, textAnchor: 'end' }, `${maxRate}%`),
            ...bubbles.flatMap(({ row, r, tx, ty, x, y }) => {
              const color = { Consumer: '#38bdf8', SMB: '#4ade80', Enterprise: '#a78bfa' }[row.customer_type]
              const customerLevel = zoom >= 4, detailsLevel = zoom >= 6, transactionLevel = zoom >= 8
              const width = customerLevel ? 60 : 48, height = customerLevel ? 40 : 29
              const customer = row.topCustomer || row.topcustomer, transaction = customer?.sampleTransaction
              const gap = Math.min(8, 3 + zoom * .6) / scale, pad = Math.min(10, 4 + zoom * .75) / scale
              const fontSize = Math.min(13, 8 + zoom * .65) / scale
              const stat = (label, value, tone) => h('div', { style: {
                minWidth: 0, padding: `${3 / scale}px`, borderRadius: `${5 / scale}px`, background: '#172033',
                border: '1px solid #26364a'
              }}, h('div', { style: { color: '#64748b', fontSize: '.78em', textTransform: 'uppercase' } }, label),
              h('b', { style: { color: tone || '#e2e8f0', whiteSpace: 'nowrap' } }, value))
              return [
                zoom < 3 && Math.hypot(x - tx, y - ty) > 2 &&
                  h('line', { x1: tx, y1: ty, x2: x, y2: y, stroke: '#64748b', strokeDasharray: '2 2' }),
                zoom < 2 ? h('g', { transform: `translate(${x},${y})` },
                  h('circle', { r, fill: `${color}55`, stroke: color, strokeWidth: 2 },
                    h('title', {}, `${row.customer_type} · ${row.customer_country} · ${row.loyalty_tier}
${money(row.completed_value)} · ${row.completion_rate}% complete · ${row.customers} customers`)),
                  h('text', { fill: '#e2e8f0', fontSize: 8, textAnchor: 'middle', y: 3 }, row.customer_country))
                  : h('foreignObject', { x: x - width / 2, y: y - height / 2, width, height },
                    h('div', { xmlns: 'http://www.w3.org/1999/xhtml', style: {
                      height: '100%', boxSizing: 'border-box', padding: pad, border: `1px solid ${color}`,
                      borderTop: `${3 / scale}px solid ${color}`, borderRadius: `${8 / scale}px`,
                      background: `linear-gradient(145deg,${color}18,#0b1220 36%,#080f1d)`, color: '#e2e8f0',
                      fontSize, lineHeight: 1.2, overflow: 'hidden', textAlign: 'left', display: 'grid',
                      alignContent: 'start', gap, boxShadow: `inset 0 0 ${20 / scale}px #0005`
                    }}, h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap } },
                      h('b', { style: { color, letterSpacing: '.04em' } }, `${row.customer_country} · ${row.loyalty_tier}`),
                      h('span', { style: {
                        padding: `${2 / scale}px ${5 / scale}px`, borderRadius: `${9 / scale}px`,
                        background: `${color}22`, color
                      }}, row.customer_type)),
                    h('div', { style: { display: 'grid', gap: `${2 / scale}px` } },
                      h('div', { style: { color: '#64748b', fontSize: '.78em', textTransform: 'uppercase' } },
                      'Completed value'), h('b', { style: { color: '#67e8f9', fontSize: '1.35em' } }, money(row.completed_value))),
                    customerLevel && h('div', { style: {
                      display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap
                    }}, stat('Customers', row.customers), stat('Complete', `${row.completion_rate}%`, '#4ade80'),
                    stat('Quality risk', `${row.quality_issue_rate}%`, '#fb7185')),
                    customerLevel && customer && h('div', { style: {
                      borderTop: '1px solid #334155', paddingTop: gap, display: 'grid',
                      gridTemplateColumns: `${22 / scale}px 1fr auto`, alignItems: 'center', gap
                    }}, h('div', { style: {
                      width: `${22 / scale}px`, height: `${22 / scale}px`, borderRadius: '50%', background: `${color}25`,
                      border: `1px solid ${color}`, color, display: 'grid', placeItems: 'center', fontWeight: 800
                    }}, customer.name.split(' ').filter(part => part !== '&').map(part => part[0]).slice(0, 2).join('')),
                    h('div', {}, h('b', {}, customer.name), h('div', { style: { color: '#94a3b8' } },
                      `${customer.city} · ${customer.industry}`)), h('span', { style: { color } }, customer.id)),
                    detailsLevel && customer && h('div', { style: {
                      display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap
                    }}, stat('Email', customer.email), stat('Customer value', money(customer.completedValue), '#67e8f9'),
                    stat('Transactions', customer.transactions)),
                    transactionLevel && transaction && h('div', { style: {
                      borderTop: '1px solid #334155', paddingTop: gap, display: 'grid',
                      gridTemplateColumns: '1.3fr 1fr auto', alignItems: 'end', gap
                    }}, stat('Product', transaction.product), stat('Payment', transaction.paymentMethod),
                    stat('Transaction', money(transaction.value), '#fbbf24'))))
              ]
            }),
            h('g', { transform: `translate(${-pan.x / scale} ${-pan.y / scale}) scale(${1 / scale})` },
              h('rect', { x: 8, y: 8, width: 88, height: 24, rx: 5, fill: '#071521dd', stroke: '#334155' }),
              h('text', { x: 18, y: 24, fill: '#c4b5fd', fontSize: 11 }, `Zoom ${zoom.toFixed(2)}×`)))
        }
      }))
      const details = {
        compiled: code('COMPILED SQL', customerPortfolioCompiledSql, '#a78bfa'),
        cube: code('FINANCE3 CUBE PROFILE', cubeProfileText, '#f472b6'),
        'lambda-cold': performance(Finance3LambdaColdPerformance),
        'lambda-warm': performance(Finance3LambdaWarmPerformance),
        'wasm-cold': performance(Finance3WasmColdPerformance),
        wasm: performance(Finance3WasmWarmPerformance),
        table, zui
      }
      return h('div', { style: {
        height: '100%', boxSizing: 'border-box', padding: '12px 18px 18px',
        background: 'radial-gradient(circle at 15% 0%,#13293d 0,#071521 45%)', color: '#e2e8f0', fontFamily: 'Inter,system-ui'
      }}, h('div', { style: {
        height: 96, marginBottom: 10, border: '1px solid #26364a', borderRadius: 10, overflow: 'hidden'
      }}, hh(ctx, Finance3CodeMirror, { code: portfolioSql })),
      h('div', { style: { display: 'grid', gridTemplateColumns: '190px 1fr', gap: 12, height: 'calc(100% - 106px)' } },
        h('nav', { style: {
          padding: 10, border: '1px solid #26364a', borderRadius: 12, background: 'linear-gradient(180deg,#101c2d,#0a1320)',
          boxShadow: '0 18px 45px #0004'
        }}, h('div', { style: {
          padding: '3px 9px 10px', color: '#64748b', fontSize: 9, letterSpacing: 1.6, textAlign: 'left', fontWeight: 800
        }}, 'QUERY INSPECTOR'),
          ...[
            ['cube', '◇', 'Cube', 'semantic model'], ['compiled', '⚙', 'Compiled SQL', 'physical plan'],
            ['lambda-cold', '◷', 'Lambda cold', 'empty cols cache'],
            ['lambda-warm', '◷', 'Lambda warm', 'reuse /tmp cols cache'],
            ['wasm-cold', '◷', 'WASM cold', 'empty browser cols cache'],
            ['wasm', '◷', 'WASM warm', 'reuse browser cols cache'], ['table', '▦', 'Table result', 'ranked cohorts'],
            ['zui', '◎', 'ZUI result', 'explore visually']
          ].map(([id, icon, label, hint], index) => h('button', {
            onClick: () => (setDetail(id), history.replaceState(null, '', `#/1/${index}`)), style: {
            display: 'grid', gridTemplateColumns: '28px 1fr', width: '100%', padding: '9px 8px', marginBottom: 4,
            border: 0, borderLeft: `2px solid ${detail === id ? '#67e8f9' : 'transparent'}`, borderRadius: 7,
            background: detail === id ? '#173047' : 'transparent', color: detail === id ? '#e0f2fe' : '#94a3b8',
            cursor: 'pointer', textAlign: 'left'
          }}, h('span', { style: {
            gridRow: '1/3', alignSelf: 'center', color: detail === id ? '#67e8f9' : '#64748b', fontSize: 16
          }}, icon), h('b', { style: { fontSize: 11 } }, label),
          h('span', { style: { color: '#64748b', fontSize: 9, marginTop: 2 } }, hint)))),
        h('main', { style: { minWidth: 0, minHeight: 0 } }, details[detail])))
    }
  })
})

ReactComp('finance3Applet', {
  params: [{ id: 'layout', type: 'metadata-layout<zui>', dynamic: true, defaultValue: twoLayerMetadataLayout() }],
  impl: comp(
    Var('metadataLayout', '%$layout%'),
    Var('tableZoomViews', zoomViews(
      itemView(0, { hFunc: ctx => ctx.vars.renderCard(ctx, 'overview') }),
      itemView(400, { hFunc: ctx => ctx.vars.renderCard(ctx, 'groups') }),
      itemView(770, { hFunc: ctx => ctx.vars.renderCard(ctx, 'details') })
    )),
    {
      enrichCtx: loadReveal(),
      hFunc: (ctx, { reveal, react: { h, hh, useEffect, useRef, useState }, metadataLayout, tableZoomViews }) => () => {
        const [portfolio, setPortfolio] = useState(), host = useRef()
        const metadata = ctx.exp('%$finance3InternalsMetadata%')
        useEffect(() => {
          const { deck, disconnect } = reveal.mount(host.current, { width: '100%', height: '100%', margin: 0 })
          const syncHash = ({ indexh }) => history.replaceState(null, '', indexh ? `#/${indexh}/0` : '#/0')
          deck.on('slidechanged', syncHash)
          return () => (deck.off('slidechanged', syncHash), disconnect())
        }, [])
        useEffect(() => {
          let active = true
          wfetch2('room://finance3/usersRO/silver/customer-portfolio.json', {}, ctx)
            .then(res => res.json()).then(rows => active && setPortfolio({ rows }))
          return () => { active = false }
        }, [])
        const graph = {
          children: metadata.graph.children.map(([id, label, relation, kind, fields, rows, rowGroups, bytes]) => {
            const weight = Math.max(0, Math.log10(bytes) - 3)
            return {
              id, label, relation, kind, schema: metadata.schemas[id], meta: { fields, rows, rowGroups, bytes },
              layer: kind === 'fact' ? 'main' : 'lookup', width: 190 + weight * 18, height: 92 + weight * 7
            }
          }),
          edges: metadata.graph.edges.map(([id, source, target, text]) => ({
            id, sources: [source], targets: [target], text,
            labels: [{ id: `${id}-label`, text, width: Math.max(90, text.length * 6 + 20), height: 17 }]
          }))
        }
        const erd = metadataLayout(ctx.setData(graph))
        const pointPath = section => [section.startPoint, ...(section.bendPoints || []), section.endPoint]
          .map((point, i) => `${i ? 'L' : 'M'}${point.x},${point.y}`).join(' ')
        const Erd = ({ activeIds }) => hh(ctx, zoomingSvg, {
          width: erd.width, height: erd.height,
          zoomingVars: [
            { id: 'columns', calc: scale => Math.max(0, Math.min(1, (scale - 1) * 4)) },
            { id: 'joins', calc: scale => Math.max(0, Math.min(1, (scale - 1.1) * 4)) },
            { id: 'fontSize', calc: scale => `${9 / scale}px` }
          ],
          content: zctx => h('g', {},
            ...erd.edges.flatMap(edge => {
              const on = !activeIds || activeIds.has(edge.sources[0]) && activeIds.has(edge.targets[0])
              return edge.sections.map(section => h('path', {
                d: pointPath(section), fill: 'none', stroke: on ? '#38bdf8' : '#334155', strokeWidth: on ? 3 : 1.5
              })).concat(edge.labels.map(label => h('text', {
                x: label.x + label.width / 2, y: label.y + 12, fill: on ? '#bae6fd' : '#475569',
                opacity: 'var(--joins)', fontSize: 'var(--fontSize)', textAnchor: 'middle'
              }, edge.text)))
            }),
            ...erd.children.map(node => {
              const on = !activeIds || activeIds.has(node.id)
              let view = tableZoomViews.activeView(node.width * zctx.vars.zoomState.scale)
              if (view === 2 && zctx.vars.zoomState.hotCard !== node.id) view = 1
              const renderCard = (cardCtx, cardView) => hh(cardCtx, Finance3SchemaCard, {
                node, metadata, view: cardView
              })
              const card = tableZoomViews.views[view].hFunc(zctx.setData(node).setVars({ renderCard }))
              const fieldCount = Object.values(node.schema.groups).flat().length
              const height = view === 2 ? Math.max(node.height, (100 + fieldCount * 33) / zctx.vars.zoomState.scale) : node.height
              return h('g', { transform: `translate(${node.x},${node.y})`, opacity: on ? 1 : .15 },
                h('foreignObject', { width: node.width, height }, card))
            }))
        })
        const slide = (title, subtitle, body, titleSize = '.42em') => h('section', {
          'data-background-color': '#071521', style: { height: '100%', top: 0 }
        }, h('h2', { style: { margin: 0, fontSize: titleSize, lineHeight: 1 } }, title),
        h('div', { style: { marginTop: 7, fontSize: '.25em', color: '#94a3b8' } }, subtitle),
        h('div', { style: { position: 'absolute', inset: '36px 0 0' } }, body))
        return h('div:reveal', { ref: host, style: { position: 'absolute', inset: 0 } }, h('div:slides', {},
          slide('DB schema',
            'SMB transactions with products and customers',
            h('div', { style: { height: '100%' } }, h(Erd, {})), '.65em'),
          slide('Which customer cohorts deserve investment?',
            'Rank customer type × country × loyalty tier by completed value, completion rate, and quality risk',
            hh(ctx, Finance3QueryCaseScene, {
              rows: portfolio?.rows
            })),
          slide('WASM cold on mobile', 'DuckDB runs locally with an empty browser column cache',
            h('div:finance3-mobile-wasm', { style: { height: '100%', overflow: 'auto' } },
              h('style', {}, `@media(max-width:600px){.finance3-mobile-wasm{height:100vh!important}.finance3-mobile-wasm main{padding:8px}
                .finance3-mobile-wasm h1{font-size:20px}
                .finance3-mobile-wasm strong,.finance3-mobile-wasm table{font-size:12px}}`), hh(ctx, Finance3WasmColdPerformance)))))
      }
    }
  )
})
