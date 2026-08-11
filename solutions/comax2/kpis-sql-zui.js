import { dsls } from '@jb6/core'
import '@jb6/react'
import '@wonder/ui/zui/zui-dsl.js'

const {
  tgp: { Const },
  react: { ReactComp, 'react-comp': { comp, zoomingSvg } }
} = dsls

Const('kpisSqlItems', [
  ['range0', 20, 205, 'time', 'range0', '2026-05-30 → 2026-06-28',
    `SELECT max_date, max_date-29 current_from\nFROM (SELECT DATE '2026-06-28' max_date)`,
    '{ max_date: 2026-06-28, current_from: 2026-05-30 }'],
  ['ranges', 225, 205, 'time', 'ranges', 'Current + previous-year boundaries',
    `SELECT *,(current_from-INTERVAL 1 YEAR)::DATE previous_from,\n(max_date-INTERVAL 1 YEAR)::DATE previous_to FROM range0`,
    '{ current: 05-30→06-28, previous: 2025-05-30→2025-06-28 }'],
  ['headers', 445, 15, 'source', 'filtered_headers', '🗓️▤ receipt headers in range',
    `FROM KupaDoc_Header-mqy h CROSS JOIN ranges r\nWHERE h.sale_date BETWEEN DATE '2026-05-30' AND DATE '2026-06-28'`,
    '{ C: 12412049, StoreC: 26, CustomerC: 9587, sale_date: 2026-06-01 }'],
  ['lines', 445, 160, 'source', 'sales_lines', '🗓️▤ primitive sales rows',
    `FROM KupaDoc_Lines-mqy l\nWHERE l.sale_date BETWEEN DATE '2026-05-30' AND DATE '2026-06-28'`,
    '{ C: 90356844, KupaDocC: 12412049, PrtC: 11450, Cmt: 4, Scm: 18.7, VatAmount: 2.8525 }'],
  ['regular', 445, 305, 'source', 'costs_range', '🏬·📦·📅 ↦ 💰◯',
    `SELECT StoreID,ItemID,DateDoc,FinalRegularCostPrice\nFROM DailyPriceCost\nWHERE DateDoc BETWEEN current_yyyymmdd AND max_yyyymmdd`,
    '{ StoreID: 26, ItemID: 11450, DateDoc: 20260601, FinalRegularCostPrice: 1.86 }'],
  ['franchise', 445, 450, 'source', 'franchiseCosts_range', '🏬·📦·👤·🏷️·📅 ↦ 💰🏪',
    `SELECT StoreID,ItemID,CustomerID,MivzaC,DateDoc,FinalCostPrice\nFROM DailyPriceCost_Zakyan\nWHERE DateDoc BETWEEN current_yyyymmdd AND max_yyyymmdd`,
    '{ StoreID: 18, ItemID: 12963, CustomerID: 40935, MivzaC: 0, FinalCostPrice: 6.6 }'],
  ['receipt', 690, 145, 'join', 'receipt_join', 'Attach receipt context to every sales line',
    `JOIN filtered_headers h ON l.KupaDocC=h.C`,
    '{ line: 90356844, receipt: 12412049, store: 26, customer: 9587, item: 11450 }'],
  ['lookups', 690, 15, 'guard', 'mandatory_lookups', 'Always-on inner joins; fields unused by KPIs',
    `JOIN Store s ON s.C=h.StoreC\nJOIN Prt p ON p.C=l.PrtC`,
    "{ store: 'רעננה אחוזה', item: 'משקה אנרגיה אקסל 250 מל' }"],
  ['costJoins', 690, 390, 'join', 'cost_joins', 'Optional regular and franchise enrichment',
    `LEFT JOIN costs_range cost
 ON cost.StoreID=h.StoreC AND cost.ItemID=l.PrtC AND cost.DateDoc=h.cost_date
LEFT JOIN franchiseCosts_range zcost
 ON zcost.StoreID=h.StoreC AND zcost.ItemID=l.PrtC
 AND zcost.CustomerID=h.CustomerC AND zcost.MivzaC=l.MivzaNo
 AND zcost.DateDoc=h.cost_date`,
    '{ regular_cost: 1.86, franchise_cost: null, resolved_cost: 1.86 }'],
  ['measures', 940, 190, 'math', 'derived_measures', 'Sales, cost precedence, profit, coverage',
    `l.Scm-l.VatAmount AS net_sales_amount
coalesce(zcost.FinalCostPrice,cost.FinalRegularCostPrice,0) AS resolved_cost
net_sales_amount-l.Cmt*resolved_cost AS gross_profit_amount
if(resolved_cost IS NULL,NULL,net_sales_amount) AS costed_net_sales_amount`,
    '{ net_sales: 15.8475, resolved_cost: 1.86, quantity: 4, gross_profit: 8.4075, costed: 15.8475 }'],
  ['base', 1180, 205, 'alias', 'base', 'Expose the enriched sales-line grain',
    `base AS (SELECT * FROM raw_base)`,
    '{ net_sales_amount: 15.8475, gross_profit_amount: 8.4075, costed_net_sales_amount: 15.8475 }'],
  ['kpis', 1390, 190, 'result', 'KPI SELECT', '₪25.57M · ₪9.04M · 35.36% · 98.97%',
    `SELECT round(sum(net_sales_amount),2) sales,
 round(sum(gross_profit_amount),2) profit,
 round(100*sum(gross_profit_amount)/nullif(sum(net_sales_amount),0),2) margin,
 round(100*sum(costed_net_sales_amount)/nullif(sum(net_sales_amount),0),2) coverage
FROM base`,
    '{ sales: 25574406.48, profit: 9042823.44, margin: 35.36, coverage: 98.97 }']
])

Const('kpisSqlEdges', [
  ['range0', 'ranges', 'derives', 'time'],
  ['ranges', 'headers', 'filters', 'time'],
  ['ranges', 'lines', 'prunes', 'time'],
  ['ranges', 'regular', 'filters', 'time'],
  ['ranges', 'franchise', 'filters', 'time'],
  ['headers', 'receipt', 'INNER JOIN', 'flow'],
  ['lines', 'receipt', 'INNER JOIN', 'flow'],
  ['receipt', 'lookups', 'row gate', 'guard'],
  ['receipt', 'costJoins', 'join keys', 'flow'],
  ['regular', 'costJoins', 'LEFT JOIN', 'optional'],
  ['franchise', 'costJoins', 'LEFT JOIN', 'optional'],
  ['lookups', 'measures', 'surviving rows', 'guard'],
  ['receipt', 'measures', 'sales values', 'flow'],
  ['costJoins', 'measures', 'cost precedence', 'optional'],
  ['measures', 'base', 'aliases', 'flow'],
  ['base', 'kpis', 'aggregates', 'flow']
])

ReactComp('kpisSqlZui', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh } }) => () => {
      const items = ctx.exp('%$kpisSqlItems%'), edges = ctx.exp('%$kpisSqlEdges%')
      const byId = Object.fromEntries(items.map(item => [item[0], item]))
      const colors = {
        time: '#0ea5e9', source: '#14b8a6', join: '#38bdf8', guard: '#f59e0b',
        math: '#a855f7', alias: '#64748b', result: '#22c55e', flow: '#38bdf8', optional: '#a855f7'
      }
      const groups = [
        ['TIME', 20, 190], ['BOUNDED SOURCES', 445, 0], ['ROW ASSEMBLY', 690, 0],
        ['BUSINESS MATH', 940, 175], ['OUTPUT', 1180, 190]
      ]
      return hh(ctx, zoomingSvg, {
        width: 1620, height: 590,
        zoomingVars: [
          { id: 'sqlDetail', calc: scale => Math.max(0, Math.min(1, (scale - 1.2) * 2.4)) },
          { id: 'debugResult', calc: scale => Math.max(0, Math.min(1, (scale - 2.1) * 2)) },
          { id: 'sqlSummary', calc: scale => Math.max(0, Math.min(1, 2.2 - scale)) },
          { id: 'sqlFont', calc: scale => `${11 / scale}px` }
        ],
        content: () => h('g', {},
          h('defs', {}, h('marker', {
            id: 'kpi-sql-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5,
            markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse'
          }, h('path', { d: 'M0 0L10 5L0 10z', fill: '#38bdf8' }))),
          ...groups.map(([name, x, y]) => h('text', {
            x, y, fill: '#64748b', fontSize: 11, fontWeight: 800
          }, name)),
          ...edges.flatMap(([from, to, label, kind]) => {
            const a = byId[from], b = byId[to], x1 = a[1] + 190, y1 = a[2] + 62, x2 = b[1], y2 = b[2] + 62
            const color = colors[kind]
            return [
              h('path', {
                d: `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`,
                fill: 'none', stroke: color, strokeWidth: kind === 'guard' ? 3 : 2,
                strokeDasharray: kind === 'time' ? '6 5' : '', markerEnd: 'url(#kpi-sql-arrow)'
              }),
              h('text', {
                x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 4, fill: color,
                fontSize: 9, textAnchor: 'middle'
              }, label)
            ]
          }),
          ...items.map(([id, x, y, kind, title, summary, sql, result]) => h('foreignObject', {
            x, y, width: 190, height: 124, 'data-zui-card': id
          }, h('article', { xmlns: 'http://www.w3.org/1999/xhtml', title: summary, style: {
            height: '100%', boxSizing: 'border-box', overflow: 'hidden', padding: '.65em',
            border: '1px solid #334155', borderLeft: `5px solid ${colors[kind]}`,
            borderRadius: '.55em', background: '#0b1220', color: '#cbd5e1',
            fontSize: 'var(--sqlFont)', textAlign: 'left'
          }},
          h('div', { style: { color: colors[kind], fontSize: '.72em', fontWeight: 800 } }, kind.toUpperCase()),
          h('div', { style: { color: '#fff', fontWeight: 750, marginTop: '.15em' } }, title),
          h('div', { style: {
            color: kind === 'result' ? '#a7f3d0' : '#bae6fd', marginTop: '.45em', opacity: 'var(--sqlSummary)'
          } }, summary),
          h('pre', { style: {
            margin: '.5em 0 0', color: '#cbd5e1', opacity: 'var(--sqlDetail)',
            whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace', fontSize: '.78em', lineHeight: 1.3
          } }, sql),
          h('pre', { title: 'squeezed real result', style: {
            margin: '.55em 0 0', paddingTop: '.45em', borderTop: '1px solid #334155',
            color: '#a7f3d0', opacity: 'var(--debugResult)', whiteSpace: 'pre-wrap',
            fontFamily: 'ui-monospace, monospace', fontSize: '.78em', lineHeight: 1.3
          } }, `↳ ${result}`)))))
      })
    }
  })
})
