import { dsls } from '@jb6/core'
import './comax-cube.js'
import '@wonder/bi/benchmark/bi-benchmark-dsl.js'

const {
  tgp: { 'ctx-enricher': { setupCube, Var } },
  common: { data: { asIs }, boolean: { and } },
  bi: { QueryCase, 'query-case': { queryCase }, cube: { comaxSalesCube } }
} = dsls

const comaxQuery = (sql, expectedResult = '%length% > 0', vars) =>
  queryCase(...(vars || []), { sql, cube: comaxSalesCube(), setup: setupCube(comaxSalesCube()), expectedResult })
const period = comaxArgs => [Var('comaxArgs', asIs(comaxArgs))]

QueryCase('comaxBench.kpis', { impl: comaxQuery(
  `select round(sum(net_sales_amount),2) sales, round(sum(gross_profit_amount),2) profit,
  round(100*sum(gross_profit_amount)/nullif(sum(net_sales_amount),0),2) margin,
  round(100*sum(costed_net_sales_amount)/nullif(sum(net_sales_amount),0),2) coverage from base`,
  and('%0/sales% > 0', '%0/profit% > 0')) })

QueryCase('comaxBench.costAudit', { impl: comaxQuery(
  `select resolved_cost_source as "name", count(*) as "value",
  round(sum(gross_profit_amount),2) profit from base group by 1 order by 2 desc`) })

QueryCase('comaxBench.marginByBranch', { impl: comaxQuery(
  `select branch, round(sum(net_sales_amount),2) sales, round(sum(gross_profit_amount),2) profit,
  round(100*sum(gross_profit_amount)/nullif(sum(net_sales_amount),0),2) margin
  from base group by branch order by profit desc limit 10`) })

QueryCase('comaxBench.missingCostCoverage', { impl: comaxQuery(
  `select branch, sum(missing_cost_line) missing_lines, count(*) total_lines,
  round(100.0*sum(missing_cost_line)/count(*),1) missing_pct from base group by branch order by missing_pct desc`) })

QueryCase('comaxBench.branchYoY', { impl: comaxQuery(
  `select branch as "name", round(current_net_sales,2) cur_sales, round(previous_net_sales,2) prev_sales
  from base group by 1 order by cur_sales desc nulls last limit 10`, undefined, period({ period: '30', prior: true })) })

QueryCase('comaxBench.totalGrowthPct', { impl: comaxQuery(
  `select round(current_net_sales,2) cur, round(previous_net_sales,2) prev,
  round(100*(current_net_sales-previous_net_sales)/nullif(previous_net_sales,0),1) change_pct from base`,
  '%0/cur% > 0', period({ period: '30', prior: true })) })

QueryCase('comaxBench.profitYoYByBranch', { impl: comaxQuery(
  `with agg as (select branch, period_bucket, round(sum(gross_profit_amount),2) m_profit from base group by 1,2)
  select branch as "name", max(m_profit) filter(where period_bucket='current') current_profit,
  max(m_profit) filter(where period_bucket='previous') previous_profit
  from agg group by 1 order by current_profit desc nulls last limit 10`,
  undefined, period({ period: '30', prior: true })) })

QueryCase('comaxBench.holidayComparison', { impl: comaxQuery(
  `with phases as (select branch as "name", case when sale_date<date '2026-04-02' then 'before'
  when sale_date<=date '2026-04-08' then 'during' else 'after' end phase,
  round(sum(net_sales_amount),2) v from base group by 1,2)
  select "name", max(v) filter(where phase='before') "before", max(v) filter(where phase='during') "during",
  max(v) filter(where phase='after') "after" from phases where "name" is not null
  group by 1 order by "during" desc nulls last limit 10`,
  undefined, period({ from: '2026-03-26', to: '2026-04-15', prior: false })) })

QueryCase('comaxBench.weeklyTrend', { impl: comaxQuery(
  `select week_year, round(sum(net_sales_amount),2) sales, count(distinct KupaDocC) receipts
  from base group by week_year order by week_year`,
  undefined, period({ period: '90', prior: false })) })

QueryCase('comaxBench.topBranches', { impl: comaxQuery(
  `select branch as "name", round(sum(net_sales_amount),2) sales,
  round(sum(net_sales_amount)/nullif(count(distinct KupaDocC),0),2) basket
  from base group by branch order by sales desc limit 8`) })

QueryCase('comaxBench.topItems', { impl: comaxQuery(
  `select item as "name", round(sum(net_sales_amount),2) sales, sum(Cmt) qty
  from base group by item order by sales desc limit 20`) })

QueryCase('comaxBench.promotionPerformance', { impl: comaxQuery(
  `select promotion as "name", round(sum(promo_net_sales_amount),2) promo_sales,
  count(distinct KupaDocC) receipts from base where MivzaNo>0 group by promotion order by promo_sales desc limit 15`) })

QueryCase('comaxBench.latestMonthRaw', { impl: comaxQuery(
  `select count(*) lines from {%$salesLines%} where sale_date between date '2026-06-01' and date '2026-06-28'`,
  '%0/lines% > 0') })

QueryCase('comaxBench.baselineNetSales30d', {
  impl: comaxQuery('select round(sum(net_sales_amount),2) sales from base', '%0/sales% > 0')
})
QueryCase('comaxBench.rowCount', { impl: comaxQuery('select count(*) cnt from base', '%0/cnt% > 0') })
