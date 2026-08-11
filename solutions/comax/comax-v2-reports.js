import { dsls, coreUtils } from '@jb6/core'
import '@jb6/react'
import '@wonder/ai/verified-report.js'
import '@wonder/ai/llm-summary-step.js'
import '@solution/comax2/comax-cube.js'

const {
  tgp: { 'ctx-enricher': { Var } },
  common: { VerifiedReport2, data: { cubeQuery, asIs, llmSummary } },
  bi: { cube: { comaxSalesCube, comaxInventoryCube } },
  workflow: { FlowElem },
  react: { ReactComp, 'react-comp': { comp } }
} = dsls

// every report: one pre-validated cube-vocabulary SQL over the comax star (`from base`, window via comaxArgs).
// mac-node lacks the linux cols_cache byte-range extension - that realm reads whole files natively (fullFileCache);
// browser-wasm (static cols_cache) and linux keep the cube's colsCache default. profiles re-evaluate per realm at import.
export const macNodeCacheStrategy = coreUtils.isNode && globalThis.process?.platform == 'darwin' ? { cacheStrategy: 'fullFileCache' } : {}
const salesQuery = (sql, args) => cubeQuery(Var('comaxArgs', asIs(args)), sql, { cube: comaxSalesCube(), ...macNodeCacheStrategy })
const MONTH = { period: '30', prior: true }, WINDOW = 'last 30 data days (to 2026-06-28) vs the same window a year earlier'

const salesOverviewComax = VerifiedReport2('salesOverview.comax', {
  description: `Sales overview by department: net sales, gross profit, quantity and receipts for the ${WINDOW}.`,
  whenToUse: 'overall sales, revenue vs last year, department mix, profit and margin headline questions',
  impl: salesQuery(`with agg as (select department, period_bucket, round(sum(net_sales_amount)) net,
    round(sum(gross_profit_amount)) profit, round(sum(Cmt)) qty, count(distinct KupaDocC) receipt_count from base group by 1,2)
  select department, max(net) filter(where period_bucket='current') net, max(profit) filter(where period_bucket='current') profit,
    max(qty) filter(where period_bucket='current') qty, max(receipt_count) filter(where period_bucket='current') receipt_count,
    max(net) filter(where period_bucket='previous') previous_net
  from agg where department is not null group by 1 order by net desc nulls last limit 30`, MONTH)
})

const branchPerformanceComax = VerifiedReport2('branchPerformance.comax', {
  description: `Branch performance: net sales, gross profit, receipts and average basket per branch for the ${WINDOW}.`,
  whenToUse: 'branch ranking or comparison: which branch leads or lags, branch growth vs last year, basket and traffic per branch',
  impl: salesQuery(`with agg as (select branch, period_bucket, round(sum(net_sales_amount)) net,
    round(sum(gross_profit_amount)) profit, count(distinct KupaDocC) receipt_count from base group by 1,2)
  select branch, max(net) filter(where period_bucket='current') net, max(profit) filter(where period_bucket='current') profit,
    max(receipt_count) filter(where period_bucket='current') receipt_count, max(net) filter(where period_bucket='previous') previous_net
  from agg where branch is not null group by 1 order by net desc nulls last limit 25`, MONTH)
})

const promotionsComax = VerifiedReport2('promotions.comax', {
  description: 'Promotion performance over the last 30 data days: net sales, gross profit and margin per promotion, '
    + 'plus chain totals (promo share of sales, active promotion count) repeated on every row.',
  whenToUse: 'promotion or deal questions: which promotions run, which lose or make money, promotion share of sales',
  impl: salesQuery(`with t as (select round(sum(net_sales_amount)) all_net, round(sum(promo_net_sales_amount)) promo_net,
    count(distinct if(MivzaNo>0, MivzaNo, null)) active_promos from base),
  p as (select promotion, round(sum(net_sales_amount)) net, round(sum(gross_profit_amount)) profit,
    round(100*sum(gross_profit_amount)/nullif(sum(net_sales_amount),0),1) margin_pct,
    round(sum(Cmt)) qty, count(distinct KupaDocC) receipt_count
  from base where MivzaNo>0 group by 1 order by net desc nulls last limit 40)
  select p.*, t.all_net, t.promo_net, t.active_promos from p cross join t`, { period: '30', prior: false })
})

const profitabilityComax = VerifiedReport2('profitability.comax', {
  description: 'Profitability by department over the last 30 data days: net sales, gross profit, margin percent and '
    + 'cost coverage (share of sales with a resolved cost - margin is overstated where coverage is low).',
  whenToUse: 'profit, margin or cost questions: which departments earn or drag margin, where cost data is missing',
  impl: salesQuery(`select department, round(sum(net_sales_amount)) net, round(sum(gross_profit_amount)) profit,
    round(100*sum(gross_profit_amount)/nullif(sum(net_sales_amount),0),1) margin_pct,
    round(100*sum(costed_net_sales_amount)/nullif(sum(net_sales_amount),0),1) coverage_pct,
    sum(missing_cost_line) uncosted_lines
  from base where department is not null group by 1 order by profit desc nulls last limit 30`, { period: '30', prior: false })
})

const inventoryHealthComax = VerifiedReport2('inventoryHealth.comax', {
  description: 'Inventory health at the latest snapshot day: stock units, distinct items and negative-stock items per branch.',
  whenToUse: 'stock or inventory questions: how much stock per branch, negative stock, item counts on hand',
  impl: cubeQuery(`with snap as (select max(DateDoc) d from {%$inventory%})
  select trim(s.Nm) branch, round(sum(i.Itra)) units, count(distinct i.Prt) items,
    count(distinct if(i.Itra<0, i.Prt, null)) negative_items, round(sum(if(i.Itra<0, i.Itra, 0))) negative_units
  from {%$inventory%} i cross join snap join {%$stores%} s on s.C=i.Store
  where i.DateDoc=snap.d and s.SnifC>0 group by 1 order by units desc limit 30`,
    { cube: comaxInventoryCube(), ...macNodeCacheStrategy })
})

const ils = value => `₪${Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0)}`
const pct = value => value == null ? '—' : `${(+value).toFixed(1)}%`
const num = value => (+value || 0).toLocaleString('en-US')
const yoy = (current, previous) => previous ? `${(100 * (current / previous - 1)).toFixed(1)}%` : '—'
const sumRows = (rows, key) => rows.reduce((sum, row) => sum + (+row[key] || 0), 0)
const reportFrame = (h, title, subtitle, accent, children) => h('section', { dir: 'ltr', style: {
  padding: 18, border: '1px solid #e2e8f0', borderRadius: 20, background: '#f8fafc', color: '#172033',
  boxShadow: '0 16px 44px #0f172a12'
} }, h('header', { style: { marginBottom: 16 } },
  h('div', { style: { color: accent, fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase' } },
    'Verified Comax report'),
  h('h2', { style: { margin: '4px 0', fontSize: 24, letterSpacing: '-.03em' } }, title),
  h('div', { style: { color: '#64748b', fontSize: 13 } }, subtitle)), children)
const cardGrid = (h, children, min = 170) => h('div', { style: {
  display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(min(100%,${min}px),1fr))`, gap: 12
} }, children)
const metricCard = (h, label, value, detail, accent = '#2563eb') => h('div', { style: {
  padding: 14, border: '1px solid #e2e8f0', borderRadius: 14, background: '#fff'
} }, h('div', { style: { color: '#64748b', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' } }, label),
h('strong', { style: { display: 'block', marginTop: 5, color: accent, fontSize: 22 }, dir: 'auto' }, value),
detail && h('div', { style: { marginTop: 3, color: '#64748b', fontSize: 11 }, dir: 'auto' }, detail))
const valueBar = (h, value, max, color) => h('div', { style: { height: 6, marginTop: 9, borderRadius: 8, background: '#e2e8f0' } },
  h('div', { style: { width: `${100 * Math.max(0, value) / (max || 1)}%`, height: '100%', borderRadius: 8, background: color } }))
// clickable ranked row - openDetails shows the full row in the side drawer (detailsPanel is registered by the chat app)
const drillRow = (h, openDetails, row, title, value, detail, color) =>
  h('button', { style: { display: 'block', width: '100%', textAlign: 'left', padding: 15, border: '1px solid #e2e8f0',
    borderRadius: 15, background: '#fff', cursor: openDetails ? 'pointer' : 'default' },
    onClick: () => openDetails?.({ title, spec: { cmpId: 'detailsPanel', item: row } }) },
  h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: 8 } },
    h('strong', { dir: 'auto', style: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, title),
    h('b', { style: { color, whiteSpace: 'nowrap' } }, value)),
  h('div', { style: { marginTop: 5, color: '#64748b', fontSize: 11 }, dir: 'auto' }, detail))

const compactReport = (h, id, rows) => {
  const top = rows[0] || {}, specs = {
    salesOverview: ['Sales overview', ['Net sales', ils(sumRows(rows, 'net'))], ['Gross profit', ils(sumRows(rows, 'profit'))], ['Top department', top.department]],
    branchPerformance: ['Branch performance', ['Chain sales', ils(sumRows(rows, 'net'))], ['Leading branch', top.branch], ['Active branches', rows.length]],
    promotions: ['Promotions', ['Promo sales', ils(top.promo_net)], ['Sales share', pct(100 * top.promo_net / top.all_net)],
      ['Losing promotions', rows.filter(row => +row.profit <= 0).length]],
    profitability: ['Profitability', ['Gross profit', ils(sumRows(rows, 'profit'))],
      ['Chain margin', pct(100 * sumRows(rows, 'profit') / sumRows(rows, 'net'))], ['Low coverage', rows.filter(row => +row.coverage_pct < 90).length]],
    inventoryHealth: ['Inventory health', ['Stock units', num(sumRows(rows, 'units'))],
      ['Negative items', num(sumRows(rows, 'negative_items'))], ['Leading branch', top.branch]]
  }, [title, ...cards] = specs[id]
  return reportFrame(h, title, 'Verified Comax data', '#61A60E', cardGrid(h, cards.map(([label, value]) => metricCard(h, label, value, '', '#61A60E'))))
}
const viewImpl = (dataComp, render) => comp({
  enrichCtx: async ctx => ctx.vars.reportRows ? ctx : ctx.setVars({ reportData: await ctx.run(dataComp()) }),
  hFunc: ({}, { reportData, react: { h } }) => ({ rows, spec, openDetails }) => {
    const data = (Array.isArray(rows) ? rows : null) || spec?.rows || reportData || []
    return data.error || !data.length ? h('div', { style: { color: '#dc2626', fontSize: 13 } }, String(data.error || 'no rows'))
      : render(h, data, openDetails)
  }
})
const reportView = (id, dataComp, { description, whenToUse, dataInterface, render }) => {
  const def = suffix => ({ description, whenToUse, dataInterface, categories: 'comaxReport',
    impl: viewImpl(dataComp, suffix == 'nextChatItem' ? (h, rows) => compactReport(h, id, rows) : render) })
  ReactComp(`${id}.reportView.comax`, def())
  ReactComp(`${id}.reportView.comax.nextChatItem`, def('nextChatItem'))
  ReactComp(`${id}.reportView.comax.sidePanel`, def('sidePanel'))
}

export const salesOverviewView = (h, rows, openDetails, { hiddenMetrics = [], netSalesField = 'net', title } = {}) => {
  const net = sumRows(rows, netSalesField), previous = sumRows(rows, 'previous_net'), profit = sumRows(rows, 'profit')
  return reportFrame(h, title || 'Sales overview', `Department mix for the ${WINDOW}.`, '#0f766e',
    h('div', {}, cardGrid(h, [
      !hiddenMetrics.includes('netSales') && metricCard(h, 'Net sales', ils(net), `${yoy(net, previous)} vs last year`, '#0f766e'),
      metricCard(h, 'Gross profit', ils(profit), `${pct(100 * profit / net)} margin`, '#16a34a'),
      metricCard(h, 'Receipts', num(sumRows(rows, 'receipt_count')), `${ils(net / (sumRows(rows, 'receipt_count') || 1))} avg basket`, '#0f766e')
    ].filter(Boolean)), h('h3', { style: { margin: '20px 0 10px', fontSize: 15 } }, 'Departments by net sales'),
    cardGrid(h, rows.slice(0, 12).map(row => drillRow(h, openDetails, row, row.department, ils(row.net),
      `${ils(row.profit)} profit · ${yoy(row.net, row.previous_net)} vs last year · ${num(row.receipt_count)} receipts`,
      '#14b8a6')), 220)))
}

reportView('salesOverview', salesOverviewComax, {
  description: 'Sales dashboard: chain KPIs vs last year and department ranking; a department click opens its detail in the side drawer.',
  whenToUse: 'overall sales, revenue vs last year, department mix, profit headline questions',
  dataInterface: 'rows per department: {department, net, profit, qty, receipt_count, previous_net} for the last 30 data days (previous = same window last year)',
  render: salesOverviewView
})

reportView('branchPerformance', branchPerformanceComax, {
  description: 'Branch dashboard: leader KPIs and per-branch ranking with growth and basket; a branch click opens its detail in the side drawer.',
  whenToUse: 'branch ranking or comparison, branch growth vs last year, basket and traffic per branch',
  dataInterface: 'rows per branch: {branch, net, profit, receipt_count, previous_net} for the last 30 data days (previous = same window last year)',
  render: (h, rows, openDetails) => {
    const net = sumRows(rows, 'net'), top = rows[0] || {}, max = +top.net || 1
    return reportFrame(h, 'Branch performance', `Branch ranking for the ${WINDOW}.`, '#1d4ed8',
      h('div', {}, cardGrid(h, [
        metricCard(h, 'Chain net sales', ils(net), `${yoy(net, sumRows(rows, 'previous_net'))} vs last year`, '#1d4ed8'),
        metricCard(h, 'Leading branch', top.branch || '—', top.net && `${ils(top.net)} · ${yoy(top.net, top.previous_net)} vs last year`, '#1d4ed8'),
        metricCard(h, 'Active branches', rows.length, `${ils(net / (sumRows(rows, 'receipt_count') || 1))} avg basket`, '#1d4ed8')
      ]), h('h3', { style: { margin: '20px 0 10px', fontSize: 15 } }, 'Branches by net sales'),
      h('div', { style: { display: 'grid', gap: 10 } }, rows.map(row => h('div', { key: row.branch },
        drillRow(h, openDetails, row, row.branch, ils(row.net),
          `${yoy(row.net, row.previous_net)} vs last year · ${num(row.receipt_count)} receipts · ${ils(row.net / (row.receipt_count || 1))} basket`,
          '#3b82f6'), valueBar(h, +row.net, max, '#3b82f6'))))))
  }
})

reportView('promotions', promotionsComax, {
  description: 'Promotions dashboard: promo share KPIs, losing and top promotions; a promotion click opens its detail in the side drawer.',
  whenToUse: 'promotion or deal performance: which promotions run, which lose or make money, promotion share of sales',
  dataInterface: 'rows per promotion: {promotion, net, profit, margin_pct, qty, receipt_count} + chain totals on every row {all_net, promo_net, active_promos}',
  render: (h, rows, openDetails) => {
    const totals = rows[0] || {}, losing = rows.filter(row => +row.profit <= 0)
    return reportFrame(h, 'Promotions performance', 'Active promotions over the last 30 data days.', '#c2410c',
      h('div', {}, cardGrid(h, [
        metricCard(h, 'Promo net sales', ils(totals.promo_net), `${pct(100 * totals.promo_net / totals.all_net)} of chain sales`, '#c2410c'),
        metricCard(h, 'Active promotions', num(totals.active_promos), `${losing.length} losing money in the top ${rows.length}`, '#c2410c'),
        metricCard(h, 'Worst margin', rows.length && `${pct(Math.min(...rows.map(row => +row.margin_pct || 0)))}`, 'gross margin on promo lines', '#dc2626')
      ]), losing.length > 0 && h('h3', { style: { margin: '20px 0 10px', fontSize: 15 } }, 'Losing promotions'),
      cardGrid(h, losing.slice(0, 6).map(row => drillRow(h, openDetails, row, row.promotion, ils(row.profit),
        `${ils(row.net)} sales · ${pct(row.margin_pct)} margin · ${num(row.qty)} units`, '#dc2626')), 220),
      h('h3', { style: { margin: '20px 0 10px', fontSize: 15 } }, 'Top promotions by net sales'),
      cardGrid(h, rows.slice(0, 8).map(row => drillRow(h, openDetails, row, row.promotion, ils(row.net),
        `${ils(row.profit)} profit · ${pct(row.margin_pct)} margin · ${num(row.receipt_count)} receipts`, '#f97316')), 220)))
  }
})

reportView('profitability', profitabilityComax, {
  description: 'Profitability dashboard: margin and cost-coverage per department; a department click opens its detail in the side drawer.',
  whenToUse: 'profit, margin or cost-coverage questions: which departments earn or drag margin, where cost data is missing',
  dataInterface: 'rows per department: {department, net, profit, margin_pct, coverage_pct, uncosted_lines} for the last 30 data days',
  render: (h, rows, openDetails) => {
    const profit = sumRows(rows, 'profit'), net = sumRows(rows, 'net'), lowCoverage = rows.filter(row => +row.coverage_pct < 90)
    return reportFrame(h, 'Profitability', 'Departments over the last 30 data days - margin is overstated where cost coverage is low.', '#7c3aed',
      h('div', {}, cardGrid(h, [
        metricCard(h, 'Gross profit', ils(profit), `${pct(100 * profit / net)} chain margin`, '#7c3aed'),
        metricCard(h, 'Net sales', ils(net), `${rows.length} departments`, '#7c3aed'),
        metricCard(h, 'Low cost coverage', `${lowCoverage.length} departments`, 'below 90% costed sales - read margin with care', '#dc2626')
      ]), h('h3', { style: { margin: '20px 0 10px', fontSize: 15 } }, 'Departments by gross profit'),
      cardGrid(h, rows.slice(0, 12).map(row => drillRow(h, openDetails, row, row.department, ils(row.profit),
        `${pct(row.margin_pct)} margin · ${ils(row.net)} sales · ${pct(row.coverage_pct)} cost coverage`, '#8b5cf6')), 220)))
  }
})

reportView('inventoryHealth', inventoryHealthComax, {
  description: 'Inventory dashboard: stock units and negative-stock items per branch at the latest snapshot; a branch click opens its detail in the side drawer.',
  whenToUse: 'stock or inventory questions: units on hand per branch, negative stock, item counts',
  dataInterface: 'rows per branch at the latest snapshot day: {branch, units, items, negative_items, negative_units}',
  render: (h, rows, openDetails) => {
    const units = sumRows(rows, 'units'), max = +rows[0]?.units || 1
    return reportFrame(h, 'Inventory health', 'Latest stock snapshot per branch.', '#0f766e',
      h('div', {}, cardGrid(h, [
        metricCard(h, 'Stock units', num(units), `${rows.length} branches`, '#0f766e'),
        metricCard(h, 'Distinct items', num(sumRows(rows, 'items')), 'items with stock rows', '#0f766e'),
        metricCard(h, 'Negative-stock items', num(sumRows(rows, 'negative_items')), `${num(sumRows(rows, 'negative_units'))} units below zero`, '#dc2626')
      ]), h('h3', { style: { margin: '20px 0 10px', fontSize: 15 } }, 'Branches by stock units'),
      h('div', { style: { display: 'grid', gap: 10 } }, rows.map(row => h('div', { key: row.branch },
        drillRow(h, openDetails, row, row.branch, num(row.units),
          `${num(row.items)} items · ${num(row.negative_items)} negative items`, '#14b8a6'),
        valueBar(h, +row.units, max, '#14b8a6'))))))
  }
})

const comaxReportInsights = FlowElem('comaxReportInsights', {
  description: 'explain a comax verified report from its rows; the report UI renders under the answer so the text stays short',
  impl: async (ctx, { workflowLogger }) => {
    const report = ctx.data
    workflowLogger?.progress?.({ userRequestId: ctx.vars.userRequestId, step: 'summary', t: 'Explaining verified results…', status: 'running' })
    const summary = await ctx.setVars({ goal: `explain verified report ${report.reportId}` }).run(llmSummary({ summaryCategories: 'dataInsights',
      evaluation: 'Use only the verified report JSON; the UI renders full rows below, so do not repeat tables or invent missing facts.' }))
    return ctx.setData({ ...report, ...(typeof summary == 'string' ? { text: summary } : summary) })
  }
})
;['salesOverview', 'branchPerformance', 'promotions', 'profitability', 'inventoryHealth'].forEach(id =>
  FlowElem(`${id}.summaryFlow.comax.dataInsights`, { impl: comaxReportInsights() }))
