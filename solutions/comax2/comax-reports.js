// comax-reports.js — verified report<bi> catalog over the comax sales cube.
// Each report: Var('comaxArgs',{…}) window knobs + a pure `select … from base`, run via the standard cubeQuery.
// The comaxStarJoin/comaxStarFilter modifiers turn `from base` into the header-first star. widget + Hebrew narrative.
import { dsls, jb } from '@jb6/core'
import './comax-cube.js'

const {
  tgp: { 'ctx-enricher': { Var } },
  common: { data: { cubeQuery, asIs } },
  bi: { Report, report: { report } }
} = dsls

const { holidayPeriods } = jb.coreRegistry.consts.fiveStarsSchema
// current/previous pivots over period_bucket (branchYoY only needs net_sales)
const aggregateMetricsFor = names => names.map(n => ({ net_sales: 'round(sum(net_sales_amount),2) m_net_sales' }[n])).join(',')
const pivotMetricsFor = names => names.flatMap(f => ['current','previous'].map(p => `max(m_${f}) filter(where period_bucket='${p}') ${p}_${f}`)).join(',')

const GREEN = '#61A60E', GREEN_SOFT = '#B7D98A', SLATE = '#334155', SLATE_SOFT = '#94A3B8'
const ils = n => '₪' + Math.round(n || 0).toLocaleString()
const pct = n => (n == null ? '—' : (+n).toFixed(1) + '%')

// ── KPI card: current 30d net sales, gross profit, margin, cost coverage ──
Report('comaxSalesKpis', {
  impl: report('current-kpis', 'מה המכירות, הרווח והמרווח ב-30 הימים האחרונים?', {
    icon: 'Gauge',
    source: cubeQuery(Var('comaxArgs', asIs({period:'30',prior:false})), `select round(sum(net_sales_amount),2) sales, round(sum(gross_profit_amount),2) profit,
round(100*sum(gross_profit_amount)/nullif(sum(net_sales_amount),0),2) margin,
round(100*sum(costed_net_sales_amount)/nullif(sum(net_sales_amount),0),2) coverage from base`),
    widget: ctx => { const c = ctx.data[0] || {}
      return { kind: 'table', title: 'מדדי מפתח · 30 יום', columns: [['sales','מכירות'],['profit','רווח גולמי'],['margin','מרווח %'],['coverage','כיסוי עלות %']].map(([key,label])=>({key,label})), rows: [c] } },
    narrative: ctx => { const c = ctx.data[0] || {}
      return `ב-30 הימים האחרונים המכירות היו **${ils(c.sales)}** והרווח הגולמי **${ils(c.profit)}** (מרווח **${pct(c.margin)}**, כיסוי עלות **${pct(c.coverage)}**).` },
    followUps: ['אילו סניפים מובילים במכירות?', 'איך התפלגות פתרון העלות?']
  })
})

// ── top branches by net sales (30d) + avg basket ──
Report('comaxTopBranches', {
  impl: report('top-branches', 'אילו סניפים מובילים במכירות?', {
    icon: 'Store',
    source: cubeQuery(Var('comaxArgs', asIs({period:'30',prior:false})), `select branch as "name", round(sum(net_sales_amount),2) sales, round(sum(net_sales_amount)/nullif(count(distinct KupaDocC),0),2) basket
from base group by branch order by sales desc limit 8`),
    widget: ctx => ({ kind: 'hbar', title: 'סניפים מובילים · מכירות ₪', valueFormat: '₪',
      data: ctx.data.map((r,i) => ({ name: r.name, value: +r.sales, color: i==0?GREEN:GREEN_SOFT })) }),
    narrative: ctx => { const rows = ctx.data, t = rows.reduce((a,r)=>a+ +r.sales,0), top = rows[0]||{}
      return `**${top.name}** הוא הסניף המוביל עם **${ils(top.sales)}** — ${Math.round(top.sales/(t||1)*100)}% מ-8 המובילים. ממוצע סל **${ils(top.basket)}**.` },
    followUps: ['מה המכירות מול אשתקד?','אילו פריטים מובילים?']
  })
})

// ── cost-resolution audit: grain + zakyan/regular/zero cost precedence ──
Report('comaxCostAudit', {
  impl: report('cost-audit', 'איך מתפלג פתרון העלות (זכיין / רגיל / אפס)?', {
    icon: 'ShieldCheck',
    source: cubeQuery(Var('comaxArgs', asIs({period:'30',prior:false})), `select resolved_cost_source as "name", count(*) as "value", round(sum(gross_profit_amount),2) profit from base group by 1 order by 2 desc`),
    widget: ctx => ({ kind: 'pie', donut: true, showLegend: true, title: 'שורות לפי מקור עלות', valueFormat: 'int',
      data: ctx.data.map(r => ({ name: {zakyan:'זכיין',regular:'רגיל',zero:'אפס'}[r.name]||r.name, value: +r.value, color: r.name=='zakyan'?GREEN:r.name=='regular'?SLATE:SLATE_SOFT })) }),
    narrative: ctx => { const by = Object.fromEntries(ctx.data.map(r=>[r.name,+r.value])), t = ctx.data.reduce((a,r)=>a+ +r.value,0)
      return `מתוך **${t.toLocaleString()}** שורות: **${by.zakyan||0}** זכיין, **${by.regular||0}** רגיל, **${by.zero||0}** ללא עלות.` },
    followUps: ['מה המכירות והרווח ב-30 יום?', 'אילו סניפים מובילים?']
  })
})

// ── year-over-year branch comparison (current vs previous, 30d) ──
Report('comaxBranchYoY', {
  impl: report('branch-yoy', 'מה המכירות בכל סניף מול אשתקד?', {
    icon: 'BarChart3',
    source: cubeQuery(Var('comaxArgs', asIs({period:'30'})), `with agg as (select branch, period_bucket, ${aggregateMetricsFor(['net_sales'])} from base group by 1,2)
select branch as "name", ${pivotMetricsFor(['net_sales'])} from agg group by 1 order by current_net_sales desc nulls last limit 10`),
    widget: ctx => ({ kind: 'groupedBar', title: 'מכירות לפי סניף · נוכחי מול אשתקד ₪', valueFormat: '₪',
      series: [{ name: 'נוכחי', points: ctx.data.map(r=>({x:r.name,y:+r.current_net_sales||0})) }, { name: 'אשתקד', points: ctx.data.map(r=>({x:r.name,y:+r.previous_net_sales||0})) }] }),
    narrative: ctx => { const rows = ctx.data, cur = rows.reduce((a,r)=>a+(+r.current_net_sales||0),0), prev = rows.reduce((a,r)=>a+(+r.previous_net_sales||0),0)
      return `סך המכירות בסניפים המובילים: **${ils(cur)}** מול **${ils(prev)}** אשתקד (${prev?Math.round((cur-prev)/prev*100):0}%).` },
    followUps: ['אילו סניפים מובילים במכירות?', 'מה המכירות סביב פסח?']
  })
})

// ── holiday sales comparison (before / during / after a holiday period) ──
Report('comaxHolidayComparison', {
  impl: report('holiday-comparison', 'מה המכירות בסניפים סביב פסח 2026?', {
    icon: 'CalendarDays',
    source: (() => {
      const [,start,end] = holidayPeriods.find(([n,s])=>n==='פסח'&&s.startsWith('2026')) || holidayPeriods.at(-1)
      const shift = (d,days) => new Date(new Date(`${d}T12:00:00Z`).getTime()+days*86400000).toISOString().slice(0,10)
      return cubeQuery(Var('comaxArgs', asIs({from:shift(start,-7),to:shift(end,7),prior:false})), `with phases as (select branch as "name", case when sale_date<date '${start}' then 'before' when sale_date<=date '${end}' then 'during' else 'after' end phase, round(sum(net_sales_amount),2) v from base group by 1,2)
select "name", max(v) filter(where phase='before') "before", max(v) filter(where phase='during') "during", max(v) filter(where phase='after') "after" from phases where "name" is not null group by 1 order by "during" desc nulls last limit 10`)
    })(),
    widget: ctx => ({ kind: 'groupedBar', title: 'מכירות סביב פסח · לפי סניף ₪', valueFormat: '₪',
      series: [['before','לפני'],['during','בחג'],['after','אחרי']].map(([k,name]) => ({ name, points: ctx.data.map(r=>({x:r.name,y:+r[k]||0})) })) }),
    narrative: ctx => { const rows = ctx.data, during = rows.reduce((a,r)=>a+(+r.during||0),0), before = rows.reduce((a,r)=>a+(+r.before||0),0)
      return `בתקופת החג נמכרו **${ils(during)}** בסניפים המובילים, מול **${ils(before)}** בשבוע שלפני.` },
    followUps: ['אילו סניפים מובילים במכירות?', 'מה המכירות מול אשתקד?']
  })
})
