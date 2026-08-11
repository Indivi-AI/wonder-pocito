import { dsls, coreUtils, jb } from '@jb6/core'
import '@jb6/common'
import '@wonder/bi/bi-common.js'
import '@wonder/bi/report-catalog.js'
import '@wonder/db/db-drivers.js'
const { prefetchSignedUrls } = jb.wonderUtils

const { biUtils } = jb
const { parseSqlAst } = biUtils
const {
  tgp: { TgpType, Component, Const },
  bi: { Cube, SqlModifier, cube: { cube }, 'silver-builder': { parquetSource }, 'query-lookup': { lookupByWUrl }, dimension: { dimension }, metric: { metric, ratio, share } }
} = dsls

const comaxStarJoin = SqlModifier('comaxStarJoin', {
  impl: () => ({ phase: 'build:0', async modifyAst(sqlAst, ctx) {
    const schema = jb.coreRegistry.consts.fiveStarsSchema, args = ctx.vars.comaxArgs || {}
    const stmt = sqlAst.statements[0].node
    const requested = columnRefsIn(stmt).filter(n => schema.fields[n])
    const { sql, pruneWindow, fieldsUsed, joinsUsed } = comaxStarPrelude(schema, args, requested)
    const prelude = coreUtils.embedBraceVars(sql, ctx)
    try {
      const parsed = await parseSqlAst(prelude + ' select 1', ctx)
      const starMap = parsed.statements[0].node.cte_map.map
      stmt.cte_map.map = [...starMap, ...stmt.cte_map.map]
      ctx?.vars?.comaxLogger?.info?.({ t: 'comaxStarJoin', requested, fieldsUsed, joinsUsed, ctes: starMap.map(c=>c.key),
        pruneWindow }, {}, { ctx })
      return { sqlAst, explanation: `star join · ${pruneWindow.lo}→${pruneWindow.hi} · fields ${requested.join(',')}` }
    } catch (e) {
      coreUtils.logException(e, 'comaxStarJoin parse', { prelude })
      throw e
    }
  } })
})

const comaxStarFilter = SqlModifier('comaxStarFilter', {
  impl: () => ({ phase: 'build:30', async modifyAst(sqlAst, ctx) {   // adds where to base → after the base CTE is built
    const { branch='', filters={} } = ctx.vars.comaxArgs || {}
    const filterValues = typeof filters==='string' ? JSON.parse(filters||'{}') : filters||{}
    const predicates = Object.entries({ ...filterValues, ...(branch?{branch}:{}) }).filter(([,v])=>v!==''&&v!=null).map(([n,v])=>`cast(${qi(n)} as varchar)=${q(v)}`)
    if (!predicates.length) return { sqlAst }
    const base = sqlAst.statements[0].node.cte_map.map.find(c=>c.key==='base')
    base.value.query.node.where_clause = (await parseSqlAst(`select 1 where ${predicates.join(' and ')}`, ctx)).statements[0].node.where_clause
    ctx?.vars?.comaxLogger?.info?.({ t: 'comaxStarFilter', predicates }, {}, { ctx })
    return { sqlAst, explanation: `star filter · ${predicates.join(' and ')}` }
  } })
})

Cube('comaxSalesCube', {
  params: [
    { id: 'linesPath', as: 'string', defaultValue: 'KupaDoc_Lines-mqy.parquet' },
    { id: 'headersPath', as: 'string', defaultValue: 'KupaDoc_Header-mqy.parquet' }
  ],
  impl: cube({
    wUrlBase: 'signedRoom://comax2/usersRO/parquet/OEM_BI_4466',
    source: parquetSource('%$linesPath%', 'salesLines', { keyField: 'C' }),
    dimensions: [
      dimension('year', { guidance: 'calendar year' }),
      dimension('quarter', { guidance: 'quarter and year', parent: 'year' }),
      dimension('month_year', { guidance: 'month and year', parent: 'quarter' }),
      dimension('month', { guidance: 'Hebrew month number', parent: 'year' }),
      dimension('week_year', { guidance: 'ISO week and year', parent: 'year' }),
      dimension('weekday', { guidance: 'Hebrew weekday' }),
      dimension('holiday', { guidance: 'normalized Israeli holiday', parent: 'sale_date' }),
      dimension('sale_date', { type: 'timestamp', guidance: 'checkout date', parent: 'week_year' }),
      dimension('sale_time', { type: 'timestamp', guidance: 'receipt timestamp', parent: 'sale_date' }),
      dimension('hour', { type: 'integer', guidance: 'checkout hour', parent: 'daypart' }),
      dimension('daypart', { guidance: 'day quarters: dawn, morning, noon, evening/night' }),
      dimension('branch', { guidance: 'selling store/branch' }),
      dimension('warehouse', { guidance: 'store/warehouse label' }),
      dimension('supplier', { guidance: 'item supplier' }),
      dimension('department_top', { guidance: 'top department' }),
      dimension('department', { guidance: 'department', parent: 'department_top' }),
      dimension('item_group', { guidance: 'item group', parent: 'department' }),
      dimension('item_subgroup', { guidance: 'item subgroup', parent: 'item_group' }),
      dimension('item', { guidance: 'SKU name', parent: 'item_subgroup' }),
      dimension('model', { guidance: 'item model', parent: 'item' }),
      dimension('barcode', { guidance: 'item barcode', parent: 'item' }),
      dimension('business_customer', { guidance: 'named business/customer account' }),
      dimension('loyalty_customer', { guidance: 'MOADON_NO loyalty identifier' }),
      dimension('customer_group', { guidance: 'customer finance group' }),
      dimension('promotion', { guidance: 'promotion name' }),
      dimension('promotion_classification', {
        guidance: 'promotion classification',
        parent: 'promotion'
      }),
      dimension('receipt', { guidance: 'receipt/slip number' }),
      dimension('employee', { guidance: 'cashier/worker' }),
      dimension('agent', { guidance: 'sales agent' }),
      dimension('wolt', { guidance: 'Wolt/named-account channel' })
    ],
    metrics: [
      metric('sales_lines', 'count', 'checkout SKU line grain'),
      metric('receipts', 'distinctCount(KupaDocC)'),
      metric('quantity', 'sum(Cmt)'),
      metric('gross_sales', 'sum(Scm)'),
      metric('vat', 'sum(VatAmount)'),
      metric('net_sales', 'sum(net_sales_amount)', 'sales without VAT'),
      metric('costed_net_sales', 'sum(costed_net_sales_amount)'),
      metric('cost', 'sum(cost_amount)', 'same-day franchise cost, regular fallback, then zero'),
      metric('gross_profit', 'sum(gross_profit_amount)', 'net sales minus resolved cost'),
      metric('promo_net_sales', 'sum(promo_net_sales_amount)'),
      metric('returns_net_sales', 'sum(return_net_sales_amount)'),
      metric('discount_value', 'sum(discount_amount)'),
      metric('missing_cost_lines', 'sum(missing_cost_line)'),
      metric('current_net_sales', "sum(case when period_bucket='current' then net_sales_amount else 0 end)", 'net sales inside the requested period'),
      metric('previous_net_sales', "sum(case when period_bucket='previous' then net_sales_amount else 0 end)", 'same window a year earlier — populated only when prior=true'),
      metric('current_quantity', "sum(case when period_bucket='current' then Cmt else 0 end)"),
      metric('previous_quantity', "sum(case when period_bucket='previous' then Cmt else 0 end)"),
      ratio('profit_margin', 'gross_profit/net_sales'),
      ratio('average_basket', 'net_sales/receipts', { scale: 1 }),
      ratio('average_items_per_basket', 'quantity/receipts', { scale: 1 }),
      ratio('promo_share', 'promo_net_sales/net_sales'),
      ratio('cost_coverage', 'costed_net_sales/net_sales'),
      ratio('net_sales_change_pct', '(current_net_sales - previous_net_sales)/previous_net_sales', { description: 'growth vs the same window last year — the period compare, never re-filter dates' }),
      ratio('quantity_change_pct', '(current_quantity - previous_quantity)/previous_quantity', { description: 'unit growth vs the same window last year' }),
      share('net_sales_share', 'net_sales')
    ],
    queryLookups: [
      lookupByWUrl('%$headersPath%', 'salesHeaders'),
      lookupByWUrl('Store.parquet', 'stores', { ensureCols: ['C'] }),
      lookupByWUrl('Prt.parquet', 'products', { ensureCols: ['C'] }),
      lookupByWUrl('Departments.parquet', 'departments'),
      lookupByWUrl('DepartmentsTop.parquet', 'departmentTops'),
      lookupByWUrl('PrtGroups.parquet', 'productGroups'),
      lookupByWUrl('PrtGroupTt.parquet', 'productSubgroups'),
      lookupByWUrl('Suppliers.parquet', 'suppliers'),
      lookupByWUrl('Idx.parquet', 'entities'),
      lookupByWUrl('Idx_Grp.parquet', 'entityGroups'),
      lookupByWUrl('Mivza.parquet', 'promotions'),
      lookupByWUrl('Mivza_Svg.parquet', 'promotionClasses'),
      lookupByWUrl('PrtDegem.parquet', 'models'),
      lookupByWUrl('DailyPriceCost.parquet', 'salesCosts'),
      lookupByWUrl('DailyPriceCost_Zakyan.parquet', 'franchiseCosts'),
      lookupByWUrl('Prt_ItrotStore_Yomi.parquet', 'inventory')
    ],
    sqlModifiers: [comaxStarJoin(), comaxStarFilter()],
    limits: [
      'cost precedence zakyan→regular→zero: gross_profit is OVERSTATED on zero-cost rows — read cost_coverage / missing_cost_lines, never call margin exact below 100% coverage',
      'data ends 2026-06-28 — anchor today / this month there, never now(); the latest day/week/month bucket is partial',
      'money is ₪ (ILS): net_sales is ex-VAT, gross_sales incl VAT — report on net_sales unless VAT is explicitly asked',
      'base is pre-windowed to the requested period (plus the prior year when prior=true) — compare current vs previous via the period_bucket column, do not re-filter dates',
      'returns are negative rows folded into net_sales; returns_net_sales isolates them — a net_sales drop can be returns, not lost gross sales',
      'item, barcode, receipt and loyalty_customer are unbounded — filter or top-N, never GROUP BY them blindly',
      'the holiday dimension uses fixed Israeli-calendar ranges 2022–2026; a span crossing a chag mixes holiday and normal trading — split by holiday before comparing',
      'sales ledger only — no stock or inventory value (that is comaxInventoryCube), and no purchasing side: no purchase orders, payment terms, rebates or price-list/cost-history',
      'no branch master or operational log — no floor area, headcount, labor cost, till/register id, void log, or second (franchise Lk) ledger',
      'no item lifecycle — no launch date and no targets/forecasts, and an item with zero sales never appears at all in a sales ledger',
      'incrementality, uplift and cannibalization need a baseline this cube has no machinery for — only descriptive proxies exist, never state a causal verdict'
    ]
  })
})

Cube('comaxInventoryCube', {
  impl: cube({
    wUrlBase: 'signedRoom://comax2/usersRO/parquet/OEM_BI_4466',
    source: parquetSource('Prt_ItrotStore_Yomi.parquet', 'inventory'),
    dimensions: [
      dimension('item', { guidance: 'product-store-day grain' }),
      dimension('model', { guidance: 'product model' }),
      dimension('branch', { guidance: 'inventory store' }),
      dimension('warehouse', { guidance: 'inventory warehouse' }),
      dimension('sale_date', { guidance: 'inventory snapshot day' })
    ],
    metrics: [
      metric('inventory_quantity', 'sum(Itra)'),
      metric('operational_inventory', 'sum(ItraTifuli)')
    ],
    queryLookups: [
      lookupByWUrl('Prt.parquet', 'products'),
      lookupByWUrl('PrtDegem.parquet', 'models'),
      lookupByWUrl('Store.parquet', 'stores')
    ]
  })
})

// ── the comax star schema (the one real thing: header-computed date anchors + dependency-pruned joins + field→sql/joins) ──
const q = s => `'${String(s).replaceAll("'", "''")}'`, qi = s => `"${String(s).replaceAll('"', '""')}"`
const rel = name => `{%$${name}%}`, expand = sql => sql.replace(/@([A-Za-z]\w*)/g, (_,name) => rel(name))

const holidayByYear = {
  2022:[['פורים','03-17'],['פסח','04-16','04-22'],['יום העצמאות','05-05'],['שבועות','06-05'],['ראש השנה','09-26','09-27'],['יום כיפור','10-05'],['סוכות','10-10','10-16'],['שמיני עצרת','10-17'],['חנוכה','12-18','12-26']],
  2023:[['פורים','03-07'],['פסח','04-06','04-12'],['יום העצמאות','04-26'],['שבועות','05-26'],['ראש השנה','09-16','09-17'],['יום כיפור','09-25'],['סוכות','09-30','10-06'],['שמיני עצרת','10-07'],['חנוכה','12-07','12-15']],
  2024:[['פורים','03-24'],['פסח','04-23','04-29'],['יום העצמאות','05-14'],['שבועות','06-12'],['ראש השנה','10-03','10-04'],['יום כיפור','10-12'],['סוכות','10-17','10-23'],['שמיני עצרת','10-24'],['חנוכה','12-25','2025-01-02']],
  2025:[['פורים','03-14'],['פסח','04-13','04-19'],['יום העצמאות','05-01'],['שבועות','06-02'],['ראש השנה','09-23','09-24'],['יום כיפור','10-02'],['סוכות','10-07','10-13'],['שמיני עצרת','10-14'],['חנוכה','12-14','12-22']],
  2026:[['פורים','03-03'],['פסח','04-02','04-08'],['יום העצמאות','04-22'],['שבועות','05-22'],['ראש השנה','09-12','09-13'],['יום כיפור','09-21'],['סוכות','09-26','10-02'],['שמיני עצרת','10-03'],['חנוכה','12-04','12-12']]
}
const holidayPeriods = Object.entries(holidayByYear).flatMap(([year,periods]) => periods.map(([name,start,end=start]) => [name,`${year}-${start}`,end.length===5?`${year}-${end}`:end]))
const dateRange = (start,end) => Array.from({length:(Date.parse(end)-Date.parse(start))/86400000+1},(_,i)=>new Date(Date.parse(start)+i*86400000).toISOString().slice(0,10))
const holidayDatesCte = `holiday_dates(holiday,day) as (values ${holidayPeriods.flatMap(([name,start,end])=>dateRange(start,end).map(day=>`(${q(name)},date ${q(day)})`)).join(',')})`

// header-computed columns available to every field (date reduction anchors)
const headerFields = [
  ['sale_date','h.DateDoc::date'], ['cost_date','year(h.DateDoc)*10000+month(h.DateDoc)*100+day(h.DateDoc)'],
  ['period_bucket',"if(h.DateDoc::date between r.current_from and r.max_date,'current','previous')"], ['display_date','if(h.DateDoc::date<r.current_from,h.DateDoc::date+interval 1 year,h.DateDoc)::date']
]
// dependency-pruned joins: {name, sql, dependsOn, cte?, always?, rangeSource?, rangeFields?}
const joins = {
  stores:{sql:'join (select * replace(trim(Nm) as Nm) from @stores) s on s.C=h.StoreC',always:1}, products:{sql:'join (select * replace(trim(Nm) as Nm) from @products) p on p.C=l.PrtC',always:1},
  departments:{sql:'left join @departments d on d.C=p.DepartmentC',dependsOn:['products']}, departmentTops:{sql:'left join @departmentTops dt on dt.C=d.DepartmentTop',dependsOn:['departments']},
  productGroups:{sql:'left join @productGroups g on g.C=p.GroupC',dependsOn:['products']}, productSubgroups:{sql:'left join @productSubgroups sg on sg.C=p.GroupTtC',dependsOn:['products']}, suppliers:{sql:'left join (select * replace(trim(Nm) as Nm) from @suppliers) sup on sup.C=p.Spk',dependsOn:['products']},
  customers:{sql:'left join @entities cust on cust.C=h.CustomerC'}, customerGroups:{sql:'left join @entityGroups cg on cg.C=cust.IdxGrp',dependsOn:['customers']}, employees:{sql:'left join @entities emp on emp.C=h.OvedC'}, agents:{sql:'left join @entities agent on agent.C=try_cast(h.SochenC as bigint)'},
  promotions:{sql:'left join @promotions promo on promo.C=l.MivzaNo'}, promotionClasses:{sql:'left join @promotionClasses pc on pc.C=promo.SivugC',dependsOn:['promotions']}, models:{sql:'left join @models model on model.C=p.DegemC',dependsOn:['products']},
  costs:{sql:'left join costs_range cost on cost.StoreID=h.StoreC and cost.ItemID=l.PrtC and cost.DateDoc=h.cost_date',rangeSource:'salesCosts',rangeFields:['StoreID','ItemID','DateDoc','FinalRegularCostPrice']}, franchiseCosts:{sql:'left join franchiseCosts_range zcost on zcost.StoreID=h.StoreC and zcost.ItemID=l.PrtC and zcost.CustomerID=h.CustomerC and zcost.MivzaC=l.MivzaNo and zcost.DateDoc=h.cost_date',rangeSource:'franchiseCosts',rangeFields:['StoreID','ItemID','CustomerID','MivzaC','DateDoc','FinalCostPrice']},
  holidays:{sql:'left join holiday_dates hol on hol.day=h.sale_date',cte:holidayDatesCte}
}
// field → {sql, joins}: which joins each selectable field needs
const fields = Object.fromEntries([
  ['C','l.C'],['PrtC','l.PrtC'],['StoreC','h.StoreC'],['KupaDocC','l.KupaDocC'],['Cmt','l.Cmt'],['Scm','l.Scm'],['VatAmount','l.VatAmount'],['MivzaNo','l.MivzaNo'],['sale_time','h.DateDoc'],['sale_date','h.sale_date'],['hour','h.Hour'],
  ['year','year(h.DateDoc)'],['quarter',"'Q' || quarter(h.DateDoc) || ' ' || year(h.DateDoc)"],['month_year',"strftime(h.DateDoc,'%Y-%m')"],['month','month(h.DateDoc)'],['week_year',"strftime(h.DateDoc,'%G-%V')"],['holiday','hol.holiday',['holidays']],
  ['weekday',"case dayofweek(h.DateDoc) when 0 then 'יום א' when 1 then 'יום ב' when 2 then 'יום ג' when 3 then 'יום ד' when 4 then 'יום ה' when 5 then 'יום ו' else 'שבת' end"],['daypart',"case when h.Hour between 6 and 11 then 'בוקר' when h.Hour between 12 and 17 then 'צהריים' when h.Hour between 18 and 23 then 'ערב לילה' else 'לפנות בוקר' end"],
  ['branch','s.Nm',['stores']],['warehouse','s.Nm',['stores']],['supplier','sup.Nm',['suppliers']],['department_top','trim(dt.Nm)',['departmentTops']],['department','trim(d.Nm)',['departments']],['item_group','trim(g.Nm)',['productGroups']],['item_subgroup','trim(sg.Nm)',['productSubgroups']],['item','p.Nm',['products']],['model','trim(model.Nm)',['models']],['barcode','p.BarCode::varchar',['products']],
  ['business_customer','trim(cust.Nm)',['customers']],['loyalty_customer','nullif(h.MOADON_NO,0)::varchar'],['customer_group','trim(cg.Nm)',['customerGroups']],['promotion','trim(promo.Nm)',['promotions']],['promotion_classification','trim(pc.Nm)',['promotionClasses']],['receipt','h.TlushNo::varchar'],['employee','trim(emp.Nm)',['employees']],['agent','trim(agent.Nm)',['agents']],['wolt',"case when h.DocType=670 or trim(cust.Nm) like '%וולט%' then 'וולט' else 'חנויות' end",['customers']],
  ['net_sales_amount','l.Scm-l.VatAmount'],['resolved_cost_source',"case when zcost.FinalCostPrice is not null then 'zakyan' when cost.FinalRegularCostPrice is not null then 'regular' else 'zero' end",['costs','franchiseCosts']],['costed_net_sales_amount','if(coalesce(zcost.FinalCostPrice,cost.FinalRegularCostPrice) is null,null,l.Scm-l.VatAmount)',['costs','franchiseCosts']],['cost_amount','l.Cmt*coalesce(zcost.FinalCostPrice,cost.FinalRegularCostPrice,0)',['costs','franchiseCosts']],['gross_profit_amount','l.Scm-l.VatAmount-l.Cmt*coalesce(zcost.FinalCostPrice,cost.FinalRegularCostPrice,0)',['costs','franchiseCosts']],
  ['promo_net_sales_amount','if(l.MivzaNo>0,l.Scm-l.VatAmount,0)'],['return_net_sales_amount','if(l.Scm<0,l.Scm-l.VatAmount,0)'],['discount_amount','if(l.Cmt>0,greatest(l.MhrLine*l.Cmt-l.Scm,0),0)'],['missing_cost_line','if(coalesce(zcost.FinalCostPrice,cost.FinalRegularCostPrice) is null,1,0)',['costs','franchiseCosts']],['period_bucket','h.period_bucket'],['display_date','h.display_date']
].map(([name,sql,joins=[]])=>[name,{sql,joins}]))

// the single comax star, resolvable as %$fiveStarsSchema% — the modifiers read it, no cube plumbing
Const('fiveStarsSchema', { headerFields, joins, fields, holidayDatesCte, holidayPeriods, MAX_DATE: '2026-06-28' })

// comaxStarPrelude(schema, args, requested) → the `with … base as (…)` prelude string. period '30'|'90'|'ytd' | daysCount |
// from/to → header-first date window; prior adds prev-year window. filters/branch predicates are added by comaxStarFilter.
const comaxStarPrelude = ({ headerFields, joins, fields, MAX_DATE }, { period='30', from='', to='', prior=false, daysCount=0, branch='', filters={} }, requested=[]) => {
  const filterValues = typeof filters==='string' ? JSON.parse(filters||'{}') : filters||{}
  const names = [...new Set([...requested, ...Object.keys(filterValues), ...(branch?['branch']:[])])]
  const missing = names.filter(n=>!fields[n]); if (missing.length) throw new Error(`comaxStar unknown fields: ${missing.join(',')}`)
  const used = new Set(), use = name => { const j=joins[name]; if(!j||used.has(name))return; (j.dependsOn||[]).forEach(use); used.add(name) }
  Object.entries(joins).filter(([,j])=>j.always).forEach(([n])=>use(n)); names.flatMap(n=>fields[n].joins).forEach(use)
  const active = [...used].map(name=>({name,...joins[name]})), days = daysCount||({30:30,90:90,ytd:0}[period]??30), start = days?`max_date - ${days-1}`:`date_trunc('year',max_date)::date`
  const range0 = from&&to ? `range0 as (select date ${q(to)} max_date,date ${q(from)} current_from)` : `range0 as (select max_date,${start} current_from from (select date ${q(MAX_DATE)} max_date))`
  const key = d => `year(${d})*10000+month(${d})*100+day(${d})`
  // literal sale_date window → partition-prunes the prepared salesLines glob. superset of joined rows (join stays exact).
  const iso = d => d.toISOString().slice(0,10), maxDate = new Date(to||MAX_DATE)
  const loDate = from ? new Date(from) : days ? new Date(maxDate.getTime()-(days-1)*86400000) : new Date(maxDate.getFullYear(),0,1)
  const pruneLo = iso(prior ? new Date(loDate.getFullYear()-1, loDate.getMonth(), loDate.getDate()) : loDate)
  const linePrune = `l."sale_date" between date ${q(pruneLo)} and date ${q(iso(maxDate))}`
  const headerPrune = `h."sale_date" between date ${q(pruneLo)} and date ${q(iso(maxDate))}`
  const ctes = [...new Set(active.map(x=>x.rangeSource?`${x.name}_range as materialized (select ${(x.rangeFields||['*']).map(qi).join(',')} from ${rel(x.rangeSource)} j cross join ranges r where j."DateDoc" between ${key('r.current_from')} and ${key('r.max_date')}${prior?` or j."DateDoc" between ${key('r.previous_from')} and ${key('r.previous_to')}`:''})`:x.cte&&expand(x.cte)).filter(Boolean))]
  const date = `h.DateDoc::date`, selected = names.map(n=>({name:n,...fields[n]})), projection = selected.length?selected.map(x=>`${x.sql} ${qi(x.name)}`).join(','):'1'
  const sql = `with ${range0},ranges as (select *,(current_from-interval 1 year)::date previous_from,(max_date-interval 1 year)::date previous_to from range0),${ctes.length?ctes.join(',')+',':''}filtered_headers as materialized (select h.*,r.current_from,r.max_date,r.previous_from,r.previous_to${headerFields.map(([n,sql])=>`,${sql} ${qi(n)}`).join('')} from ${rel('salesHeaders')} h cross join ranges r where ${headerPrune} and (${date} between r.current_from and r.max_date${prior?` or ${date} between r.previous_from and r.previous_to`:''})),raw_base as (select ${projection} from ${rel('salesLines')} l join filtered_headers h on l."KupaDocC"=h."C" ${active.map(x=>expand(x.sql)).join(' ')} where ${linePrune}),base as (select * from raw_base)`
  return { sql, pruneWindow: { lo: pruneLo, hi: iso(maxDate), prior }, fieldsUsed: names, joinsUsed: active.map(x=>x.name) }
}
// referenced field names in a select statement's AST = every single-part COLUMN_REF (dims/metrics the user asked for)
const columnRefsIn = node => { const out=new Set(); const walk=n=>{ if(Array.isArray(n)) n.forEach(walk)
  else if(n&&typeof n==='object'){ if(n.class==='COLUMN_REF'&&n.column_names?.length===1) out.add(n.column_names[0]); Object.values(n).forEach(walk) } }; walk(node); return [...out] }

// setupComax(cube, comaxArgs): the enrichCtx seam — plants ctx.vars.comaxArgs (period/prior/branch/filters/from/to) that
// both star modifiers read, then delegates to the cube's querySetup (binds lookups + folds the sqlModifiers). period → queryPeriod.
Component('setupComax', {
  type: 'ctx-enricher<tgp>',
  params: [
    {id: 'cube', type: 'cube<bi>', mandatory: true},
    {id: 'args', as: 'single', defaultValue: {}}
  ],
  impl: async (ctx, {}, { cube, args }) => {
    const roomId = cube.wUrlBase.split('//')[1].split('/')[0]
    await prefetchSignedUrls(ctx.setVars({ roomId }))
    return cube.querySetup(ctx.setVars({ comaxArgs: args }), args.period || '30')
  }
})
