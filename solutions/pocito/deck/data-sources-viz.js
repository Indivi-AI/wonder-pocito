import { dsls } from '@jb6/core'
import '@jb6/react'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

const CSS = `
.ds-wrap{flex:1;min-height:0;display:flex;flex-direction:column;gap:10px}
.ds-h{font:700 32px Sora,sans-serif;color:#22d3ee}
.ds-h.ds-gap{margin-top:10px}
.ds-row{border:1px solid #26324a;border-radius:14px;background:#0d1526;padding:13px 22px;display:flex;align-items:center;gap:22px}
.ds-name{flex:none;font:700 27px Sora,sans-serif;color:#e8ebf6}
.ds-lines{min-width:0;display:flex;flex-direction:column;gap:5px}
.ds-url{font:500 19px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;color:#67e8f9;word-break:break-all}
.ds-url.ds-dim{font-size:16px;color:#8ea0c0}
.ds-chrome-url{margin-left:auto;font:400 15px ui-monospace,SFMono-Regular,Menlo,monospace;color:#5c6b8a}
.reveal pre.ds-code{font:400 16px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;padding:14px 22px}
`

const SOURCES = [
  [null, ['package://53478?pstn=X']],
  ['Facebook', ['fb://ad?account=718016703926473&period=2026-06-25&periodGranularity=daily',
    'connector<wonder>facebookInsights · signedRoom://schematics/admin/secrets.json']]
]

const CUBE_PARQUET = 'room:gcs//finance3/usersRO/silver/transactions-18m-hist.parquet'

const CUBE_CODE = `Cube('finance3Cube', { impl: cube({
  wUrlBase: 'room://finance3/usersRO',
  dimensions: [
    dimension('date', temporalStat(), { type: 'timestamp' }),
    dimension('product_category', categoricalStat())
  ],
  metrics: [
    metric('customers', 'distinctCount(customer_id)', { unit: 'int' }),
    metric('gross_value', 'round(sum(transaction_value),2)', { unit: '$' }),
    ratio('gross_margin', '(gross_value-estimated_cost)/gross_value')
  ]
}) })`

ReactComp('pocitoDataSourcesViz', {
  impl: comp({
    hFunc: (ctx, { react: { h } }) => () => h('div:iv', {}, h('style', {}, CSS), h('div:iv-title', {}, 'Data Sources'),
      h('div:ds-wrap', {},
        h('div:ds-h', {}, 'wUrls and Connectors'),
        ...SOURCES.map(([name, wUrls]) => h('div:ds-row', { key: wUrls[0] }, name && h('div:ds-name', {}, name),
          h('div:ds-lines', {}, ...wUrls.map((wUrl, i) => h(`div:ds-url${i ? ' ds-dim' : ''}`, { key: wUrl }, wUrl))))),
        h('div:ds-h ds-gap', {}, 'Cube'),
        h('div:iv-sub', {}, 'Simplified Optimized Semantic Queries over big data'),
        h('div:win', {}, h('div:chrome', {}, h('i'), h('i'), h('i'), 'admin/finance/v3/finance3-cube.js',
          h('span:ds-chrome-url', {}, CUBE_PARQUET)), h('pre:code-pane ds-code', {}, CUBE_CODE))))
  })
})
