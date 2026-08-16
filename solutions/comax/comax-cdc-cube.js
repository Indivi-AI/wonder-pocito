import { dsls, jb } from '@jb6/core'
import '@jb6/common'
import '@wonder/bi/bi-common.js'
import '@wonder/bi/materialization.js'

const {
  tgp: { TgpType },
  common: { Data, boolean: { gt, notNull } },
  bi: {
    Cube, SilverBuilder,
    cube: { cube },
    'silver-builder': { materializeFromEvents },
    'event-predicate': { equals: evEquals },
    'field-reducer': { pick },
    pick: { count },
    dimension: { dimension },
    metric: { metric, ratio },
    'parquet-file': { projection },
    validation: { validation }
  }
} = dsls

const EventSource = TgpType('event-source', 'bi'), { runDuckdb } = jb.biUtils
const q = s => `'${String(s).replaceAll("'", "''")}'`
const n = v => +v || 0
const calc = fn => ({ phase: 'obj', reduce: fn })
const ts = v => Date.parse(`${String(v).replace(' ', 'T')}Z`) || 0
const cdc = (r, table, after) => ({ t: 'cdcRow', table, op: 'r', line_cdc_id: String(r.line_id), timestamp: ts(r.sale_time), ts_ms: ts(r.sale_time), source: { connector: 'comax-demo-cdc', db: 'OEM_BI_4466', table }, after: Object.fromEntries(Object.entries(after).filter(([,v]) => v != null)) })
const table = (root, name) => `read_parquet(${q(`${root}/${name}.parquet`)})`
const cdcSql = (root, period, limit) => `
with ic as (select StoreID, ItemID, arg_max(FinalRegularCostPrice, DateDoc) unit_cost from ${table(root, 'DailyPriceCost')} where FinalRegularCostPrice > 0 group by 1,2)
select l.C line_id, l.KupaDocC receipt_id, l.Line line_no, l.PrtC item_id, l.Cmt qty, l.Scm gross_sales, l.VatAmount vat_amount,
  nullif(l.AczDisLine, -99900) discount_pct, l.MhrLine unit_price, l.MivzaNo promo_id,
  h.StoreC branch_id, h.DateDoc sale_time, h.Hour sale_hour, h.DocType doc_type, h.CustomerC customer_id, h.OvedC cashier_id,
  trim(s.Nm) branch, trim(p.Nm) item, p.DepartmentC department_id, p.GroupC group_id, p.Spk supplier_id,
  trim(d.Nm) department, trim(sup.Nm) supplier, ic.unit_cost, pc.deal_id, pc.deal_name, pc.is_recurring
from ${table(root, 'KupaDoc_Lines')} l
join ${table(root, 'KupaDoc_Header')} h on h.C = l.KupaDocC
join ${table(root, 'Store')} s on s.C = h.StoreC
join ${table(root, 'Prt')} p on p.C = l.PrtC
left join ${table(root, 'Departments')} d on d.C = p.DepartmentC
left join ${table(root, 'Suppliers')} sup on sup.C = p.Spk
left join ic on ic.StoreID = h.StoreC and ic.ItemID = l.PrtC
left join ${table(root, 'promotion_cycles')} pc on pc.mivza_c = l.MivzaNo
where h.DateDoc::date = date ${q(period)} order by l.C limit ${Math.max(1, +limit || 200)}`
const rowToEvents = r => [
  cdc(r, 'KupaDoc_Header', { C: r.receipt_id, StoreC: r.branch_id, DateDoc: r.sale_time, Hour: r.sale_hour, DocType: r.doc_type, CustomerC: r.customer_id, OvedC: r.cashier_id }),
  cdc(r, 'KupaDoc_Lines', { C: r.line_id, KupaDocC: r.receipt_id, Line: r.line_no, PrtC: r.item_id, Cmt: r.qty, Scm: r.gross_sales, VatAmount: r.vat_amount, MivzaNo: r.promo_id, AczDisLine: r.discount_pct, MhrLine: r.unit_price }),
  cdc(r, 'Prt', { C: r.item_id, Nm: r.item, DepartmentC: r.department_id, GroupC: r.group_id, Spk: r.supplier_id }),
  cdc(r, 'Departments', { C: r.department_id, Nm: r.department }),
  cdc(r, 'Store', { C: r.branch_id, Nm: r.branch }),
  cdc(r, 'Suppliers', { C: r.supplier_id, Nm: r.supplier }),
  cdc(r, 'DailyPriceCost', { ItemID: r.item_id, StoreID: r.branch_id, FinalRegularCostPrice: r.unit_cost }),
  cdc(r, 'promotion_cycles', { mivza_c: r.promo_id, deal_id: r.deal_id, deal_name: r.deal_name, is_recurring: r.is_recurring })
]
const collect = sourceCb => new Promise((res, rej) => { const out = []; sourceCb(0, (t, d) => t == 1 ? out.push(d) : t == 2 && (d ? rej(d) : res(out))) })

EventSource('comaxDemoCdcEvents', {
  params: [
    { id: 'root', as: 'string', defaultValue: 'files/rooms/comaxDemo/usersRO/parquet/OEM_BI_4466' },
    { id: 'limit', as: 'number', defaultValue: 200 }
  ],
  impl: (_, {}, { root, limit }) => ({ read: async (_ctx, period) => ({ sourceCb: (t, sink) => t || runDuckdb(cdcSql(root, period, limit), _ctx).then(rows => {
    sink(0, () => {}); rows.flatMap(rowToEvents).sort((a, b) => a.line_cdc_id.localeCompare(b.line_cdc_id) || a.table.localeCompare(b.table)).forEach(e => sink(1, e)); sink(2)
  }, e => sink(2, e)) }) })
})

const comaxSalesCdcEvents = SilverBuilder('comaxSalesCdcEvents', {
  impl: materializeFromEvents({
    eventSource: dsls.bi['event-source'].comaxDemoCdcEvents(),
    keyField: 'line_cdc_id',
    fields: [
      pick('line_cdc_id, timestamp as startTime'),
      pick('after.C as receipt_id, after.StoreC as branch_id, after.DateDoc as sale_time, after.Hour as hour, after.DocType as doc_type, after.CustomerC as customer_id, after.OvedC as cashier_id', { eventFilter: evEquals('table', 'KupaDoc_Header') }),
      pick('after.C as line_id, after.Line as line_no, after.PrtC as item_id, after.Cmt as qty, after.Scm as gross_sales, after.VatAmount as vat_amount, after.MivzaNo as promo_id', { eventFilter: evEquals('table', 'KupaDoc_Lines') }),
      pick('after.MivzaNo as promo_id, after.AczDisLine as discount_pct, after.MhrLine as unit_price', { eventFilter: evEquals('table', 'KupaDoc_Lines') }),
      pick('after.Nm as item, after.DepartmentC as department_id, after.GroupC as group_id, after.Spk as supplier_id', { eventFilter: evEquals('table', 'Prt') }),
      pick('after.Nm as department', { eventFilter: evEquals('table', 'Departments') }),
      pick('after.Nm as branch', { eventFilter: evEquals('table', 'Store') }),
      pick('after.Nm as supplier', { eventFilter: evEquals('table', 'Suppliers') }),
      pick('after.FinalRegularCostPrice as unit_cost', { eventFilter: evEquals('table', 'DailyPriceCost') }),
      pick('after.deal_id, after.deal_name, after.is_recurring', { eventFilter: evEquals('table', 'promotion_cycles') }),
      pick('cdc_events', { take: count() }),
      calc(o => {
        const net = n(o.gross_sales) - n(o.vat_amount), cogs = n(o.qty) * n(o.unit_cost), profit = net - cogs, promo = n(o.promo_id) > 0
        return { net_sales: net, cogs, gross_profit: profit, promo_net: promo ? net : 0, is_promo: promo ? 1 : 0, margin_pct: net ? +(100 * profit / net).toFixed(2) : null }
      })
    ],
    validations: [
      validation('valid_line', notNull('%line_id%')),
      validation('valid_receipt', notNull('%receipt_id%')),
      validation('valid_time', gt({ than: 0, val: '%startTime%' }))
    ],
    parquetFiles: [projection('comaxSalesCdc', 'signedRoom://comaxDemo/usersRO/demo/comax-sales-cdc-${period}.parquet', { fields: '*' })]
  })
})

export const comaxSalesCdcCube = Cube('comaxSalesCdcCube', { impl: cube({
  source: comaxSalesCdcEvents(),
  dimensions: [
    dimension('branch'), dimension('department'), dimension('item'), dimension('supplier'),
    dimension('deal_name'), dimension('doc_type', { type: 'integer' }), dimension('is_promo', { type: 'boolean' }), dimension('sale_time', { type: 'timestamp' })
  ],
  metrics: [
    metric('sales_lines', 'count'), metric('receipts', 'distinctCount(receipt_id)'), metric('cdc_events', 'sum(cdc_events)'),
    metric('qty', 'sum(qty)'), metric('gross_sales', 'sum(gross_sales)'), metric('vat', 'sum(vat_amount)'),
    metric('net_sales', 'sum(net_sales)'), metric('promo_net', 'sum(promo_net)'), metric('gross_profit', 'sum(gross_profit)'),
    ratio('promo_share', 'promo_net/net_sales'), ratio('margin_pct', 'gross_profit/net_sales')
  ]
}) })

Data('comaxDemoCdcRows', {
  params: [{ id: 'period', as: 'string', defaultValue: '2026-06-28' }, { id: 'limit', as: 'number', defaultValue: 50 }],
  impl: async (ctx, {}, { period, limit }) => comaxSalesCdcCube.$runWithCtx(ctx).materialize(await collect((await dsls.bi['event-source'].comaxDemoCdcEvents.$runWithCtx(ctx, { limit }).read(ctx, period)).sourceCb), ctx)
})
