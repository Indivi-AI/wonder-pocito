import { dsls } from '@jb6/core'
import '@jb6/react'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

const CUBE_SQL = `select branch, department, net_sales, gross_profit, margin_pct, receipts
group by branch, department order by net_sales desc`

const COMPILED_SQL = `SELECT branch, department, sum(net_sales) AS net_sales, sum(gross_profit) AS gross_profit,
  round(((100.0 * sum(gross_profit)) / nullif(sum(net_sales), 0)), 2) AS margin_pct,
  count(DISTINCT receipt_id) AS receipts
FROM cols_cache(['signedRoom://comaxDemo/usersRO/demo/comax-sales-cdc-2026-06-28.parquet'])
GROUP BY branch, department
ORDER BY sum(net_sales) DESC`

const CUBE_PROFILE = `SilverBuilder('comaxSalesCdcEvents', {
  impl: materializeFromEvents(comaxDemoCdcEvents(), {
    keyField: 'line_cdc_id',
    fields: [
      pick('line_cdc_id, timestamp as startTime'),
      pick({
        fields: 'after.C as receipt_id, after.StoreC as branch_id, after.DateDoc as sale_time,
          after.Hour as hour, after.DocType as doc_type, after.CustomerC as customer_id, after.OvedC as cashier_id',
        eventFilter: equals('table', 'KupaDoc_Header')
      }),
      pick({
        fields: 'after.C as line_id, after.Line as line_no, after.PrtC as item_id, after.Cmt as qty,
          after.Scm as gross_sales, after.VatAmount as vat_amount, after.MivzaNo as promo_id',
        eventFilter: equals('table', 'KupaDoc_Lines')
      }),
      pick('after.MivzaNo as promo_id, after.AczDisLine as discount_pct, after.MhrLine as unit_price', {
        eventFilter: equals('table', 'KupaDoc_Lines')
      }),
      pick({
        fields: 'after.Nm as item, after.DepartmentC as department_id, after.GroupC as group_id, after.Spk as supplier_id',
        eventFilter: equals('table', 'Prt')
      }),
      pick('after.Nm as department', { eventFilter: equals('table', 'Departments') }),
      pick('after.Nm as branch', { eventFilter: equals('table', 'Store') }),
      pick('after.Nm as supplier', { eventFilter: equals('table', 'Suppliers') }),
      pick('after.FinalRegularCostPrice as unit_cost', { eventFilter: equals('table', 'DailyPriceCost') }),
      pick('after.deal_id, after.deal_name, after.is_recurring', { eventFilter: equals('table', 'promotion_cycles') }),
      pick('cdc_events', { take: count() }),
      { phase: 'obj', reduce: o => {
        const net = n(o.gross_sales) - n(o.vat_amount), cogs = n(o.qty) * n(o.unit_cost), profit = net - cogs, promo = n(o.promo_id) > 0
        return { net_sales: net, cogs, gross_profit: profit, promo_net: promo ? net : 0, is_promo: promo ? 1 : 0,
          margin_pct: net ? +(100 * profit / net).toFixed(2) : null }
      } }
    ],
    validations: [
      validation('valid_line', notNull('%line_id%')),
      validation('valid_receipt', notNull('%receipt_id%')),
      validation('valid_time', gt(0, { val: '%startTime%' }))
    ],
    parquetFiles: [
      projection('comaxSalesCdc', 'signedRoom://comaxDemo/usersRO/demo/comax-sales-cdc-\${period}.parquet', { fields: '*' })
    ]
  })
})

Cube('comaxSalesCdcCube', {
  impl: cube(comaxSalesCdcEvents(), {
    dimensions: [
      dimension('branch'),
      dimension('department'),
      dimension('item'),
      dimension('supplier'),
      dimension('deal_name'),
      dimension('doc_type', { type: 'integer' }),
      dimension('is_promo', { type: 'boolean' }),
      dimension('sale_time', { type: 'timestamp' })
    ],
    metrics: [
      metric('sales_lines', 'count'),
      metric('receipts', 'distinctCount(receipt_id)'),
      metric('cdc_events', 'sum(cdc_events)'),
      metric('qty', 'sum(qty)'),
      metric('gross_sales', 'sum(gross_sales)'),
      metric('vat', 'sum(vat_amount)'),
      metric('net_sales', 'sum(net_sales)'),
      metric('promo_net', 'sum(promo_net)'),
      metric('gross_profit', 'sum(gross_profit)'),
      ratio('promo_share', 'promo_net/net_sales'),
      ratio('margin_pct', 'gross_profit/net_sales')
    ]
  })
})`

const ROWS = [
  ['חובבי ציון פ"ת', 'מוצרי טבק ועישון', 142.37, 32.28, 22.68, 2],
  ['גני תקווה', 'קפואים', 50.68, 9.98, 19.69, 1],
  ['חובבי ציון פ"ת', 'מוצרי ניקיון וחד פעמי', 35.51, 10.51, 29.59, 1],
  ['בר כוכבא פתח תקווה', 'מוצרי חלב וביצים', 33.64, 7.73, 22.99, 2],
  ['בר כוכבא פתח תקווה', 'דגני בוקר ומאפה מתוק', 30.34, 11.98, 39.48, 1],
  ['אם המושבות פ"ת', 'מוצרי חלב וביצים', 27.99, 9.75, 34.84, 1],
  ['כץ פתח תקווה', 'משקאות לא אלכוהולים', 23.73, 12.68, 53.43, 1],
  ['בר כוכבא פתח תקווה', 'פירות וירקות ללא מע"מ', 23.57, 5.48, 23.24, 2],
  ['אם המושבות פ"ת', 'פירות וירקות ללא מע"מ', 23.27, 11.22, 48.23, 1],
  ['בר כוכבא פתח תקווה', 'קפואים', 21.11, 3.07, 14.54, 1],
  ['חובבי ציון פ"ת', 'משקאות לא אלכוהולים', 20.51, 10.0, 48.75, 2],
  ['חובבי ציון פ"ת', 'מוצרי חלב וביצים', 18.43, 4.28, 23.23, 3],
  ['אם המושבות פ"ת', 'סוכריות ומסטיקים', 17.54, 6.23, 35.53, 1],
  ['בר כוכבא פתח תקווה', 'ממתקים ופיצוחים במשקל', 16.64, 3.35, 20.12, 1],
  ['אם המושבות פ"ת', 'לחם ותחליפיו', 15.17, 5.57, 36.72, 1],
  ['חובבי ציון פ"ת', 'לחם ותחליפיו', 12.63, 3.89, 30.78, 1],
  ['כץ פתח תקווה', 'מוצרי חלב וביצים', 12.03, 3.45, 28.7, 1],
  ['בר כוכבא פתח תקווה', 'סוכריות ומסטיקים', 11.78, 4.49, 38.11, 1],
  ['כץ פתח תקווה', 'דגני בוקר ומאפה מתוק', 10.08, 3.67, 36.44, 1],
  ['חובבי ציון פ"ת', 'לא מזון וחד פעמי', 9.24, 3.76, 40.68, 1],
  ['גני תקווה', 'מוצרי חלב וביצים', 9.24, 3.06, 33.1, 1],
  ['חובבי ציון פ"ת', 'דגני בוקר ומאפה מתוק', 8.39, 2.14, 25.51, 1],
  ['חובבי ציון פ"ת', 'קפואים', 8.39, 2.81, 33.49, 1],
  ['חובבי ציון פ"ת', 'משקאות חמים וממתיקים', 7.54, 2.21, 29.33, 1],
  ['רעננה אחוזה', 'מוצרי חלב וביצים', 5.0, 1.18, 23.6, 1],
  ['בר כוכבא פתח תקווה', 'מוצרי יסוד', 5.0, 2.5, 50.0, 1],
  ['כץ פתח תקווה', 'אגרות משטחים מיכלים', 1.27, 0.07, 5.6, 1],
  ['חובבי ציון פ"ת', 'אגרות משטחים מיכלים', 0.51, 0.03, 5.62, 2],
  ['חובבי ציון פ"ת', 'לא לפידיון', 0.08, -0.04, -41.51, 1],
  ['בר כוכבא פתח תקווה', 'לא לפידיון', 0.08, -0.04, -41.51, 1],
  ['אם המושבות פ"ת', 'לא לפידיון', 0.08, -0.04, -41.51, 1]
]

const CUBE_CSS = `
.cube-panes{flex:1;min-height:0;display:flex;flex-direction:column;gap:16px}
.cube-panes .win.small{flex:none}
.cube-panes pre.code-pane{font-size:17px;line-height:1.5}
.cube-table{flex:1;min-height:0;overflow:auto;padding:6px 20px;text-align:left}
.cube-row{display:grid;grid-template-columns:1.2fr 1.6fr repeat(4,.6fr);gap:14px;border-bottom:1px solid #26324a;padding:9px 4px;
font:500 19px Heebo;color:#c7cce0;align-items:baseline}
.cube-row.head{position:sticky;top:0;font:700 15px Sora;color:#8ea0c0;letter-spacing:.06em}
.cube-row b{color:#e8ebf6;font-weight:600}
.cube-row .num{text-align:right;font-variant-numeric:tabular-nums}
`

ReactComp('vizSlide.pocito', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh } }) => ({ slide }) => {
      const Viz = dsls.react['react-comp'][slide.viz]
      return h('div:s-slide', {}, h('div:glow'),
        hh(ctx, dsls.react['react-comp']['slideHead.pocito'], { title: slide.title }),
        slide.subtitle && h('div:slide-sub', {}, slide.subtitle),
        Viz && hh(ctx, Viz))
    }
  })
})

ReactComp('pocitoCubeViz', {
  impl: comp({
    hFunc: (ctx, { react: { h, useState } }) => () => {
      const [tab, setTab] = useState('cube')
      const pane = (title, body, small) => h(`div:win${small ? ' small' : ''}`, {},
        h('div:chrome', {}, h('i'), h('i'), h('i'), title), body)
      const table = h('div:cube-table', {},
        h('div:cube-row head', {}, h('span', {}, 'BRANCH'), h('span', {}, 'DEPARTMENT'), h('span:num', {}, 'NET SALES'),
          h('span:num', {}, 'PROFIT'), h('span:num', {}, 'MARGIN %'), h('span:num', {}, 'RECEIPTS')),
        ...ROWS.map(([branch, department, net, profit, margin, receipts], i) => h('div:cube-row', { key: i },
          h('b', {}, branch), h('span', {}, department), h('span:num', {}, net.toFixed(2)),
          h('span:num', {}, profit.toFixed(2)), h('span:num', {}, `${margin}%`), h('span:num', {}, receipts))))
      const details = {
        cube: pane('the cube — EventSource builder → silver parquet → semantic cube', h('pre:code-pane', {}, CUBE_PROFILE)),
        'compiled sql': pane('compiled sql — the cube compiler output', h('pre:code-pane', {}, COMPILED_SQL)),
        table: pane('table result — branch × department, 2026-06-28 (50 CDC lines)', table)
      }
      return h('div:iv', {}, h('style', {}, CUBE_CSS),
        h('div:cube-panes', {},
          pane('cube sql — metrics by name, no joins, no from', h('pre:code-pane', {}, CUBE_SQL), true),
          h('div:toggle', {}, ...Object.keys(details).map(id =>
            h('button', { key: id, className: tab == id ? 'on' : '', onClick: () => setTab(id) }, id))),
          details[tab]),
        h('div:iv-caption', {}, 'The cube is built by an ', h('b', {}, 'EventSource builder'),
          ' — CDC events folded into a silver parquet, metrics defined once on top; queries name metrics, the compiler emits the SQL.'))
    }
  })
})
