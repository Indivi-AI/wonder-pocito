import { dsls, coreUtils, jb } from '@jb6/core'
import '@jb6/react'
import '@jb6/react/progress-indicators.js'
import '../../duckdb-utils.js'
import '@wonder/db/db-drivers.js'
const { wresolve } = jb.wonderUtils
import { tableFromIPC } from './duckdb-dist/arrow.bundle.mjs'

const {
  tgp: { Component },
  react: {
    ReactComp, 'react-comp': { comp },
    'progress-indicator': { stepper }
  }
} = dsls
const root = new URL('./', import.meta.url).href
const e2eWorkerUrl = new URL('./e2e-worker.js', import.meta.url)
const storesUrl = new URL('./stores.parquet', import.meta.url).href
const storesBigUrl = new URL('./stores-big.parquet', import.meta.url).href
const T = 'room://testPublicRoom/usersRO/taxi-row-groups.parquet'
const taxiFile = '/files/rooms/testPublicRoom/usersRO/taxi-row-groups.parquet'
const taxiSql = `select count(*) trips, cast(round(sum(fare_amount)) as bigint) total_fare from cols_cache(['${T}'])`
const comaxBase = 'room://comax2/usersRO/parquet/OEM_BI_4466/'
const comaxLocal = '/files/rooms/comax2/usersRO/parquet/OEM_BI_4466/'
const comaxUrl = name => comaxBase + name
const comaxRel = name => `cols_cache(['${comaxUrl(name)}'])`
const comaxUrls = names => Object.fromEntries(names.map(name => [comaxUrl(name), comaxLocal + name]))
const lines = comaxRel('KupaDoc_Lines-mqy.parquet'), headers = comaxRel('KupaDoc_Header-mqy.parquet')
const stores = comaxRel('Store.parquet'), products = comaxRel('Prt.parquet')
const costs = comaxRel('DailyPriceCost.parquet'), franchiseCosts = comaxRel('DailyPriceCost_Zakyan.parquet')
const promotions = comaxRel('Mivza.parquet')
const salesFiles = ['KupaDoc_Lines-mqy.parquet', 'KupaDoc_Header-mqy.parquet', 'Store.parquet', 'Prt.parquet']
const costFiles = ['KupaDoc_Lines-mqy.parquet', 'KupaDoc_Header-mqy.parquet', 'Store.parquet', 'Prt.parquet',
  'DailyPriceCost.parquet', 'DailyPriceCost_Zakyan.parquet']
const salesSql = (from, to, select, extra = '', extraFields = '') => `with h as (
    select * from ${headers} where sale_date between date '${from}' and date '${to}'
  ), base as (
    select trim(s.Nm) branch, trim(p.Nm) item, l.KupaDocC, l.Cmt, l.MivzaNo, h.DateDoc sale_time,
      l.Scm-l.VatAmount net_sales_amount,
      case when l.MivzaNo>0 then l.Scm-l.VatAmount else 0 end promo_net_sales_amount ${extraFields}
    from ${lines} l join h on l.KupaDocC=h.C join ${stores} s on s.C=h.StoreC join ${products} p on p.C=l.PrtC ${extra}
    where l.sale_date between date '${from}' and date '${to}'
  ) ${select}`
const costSql = select => `with h as (
    select *, year(DateDoc)*10000+month(DateDoc)*100+day(DateDoc) cost_date from ${headers}
    where sale_date between date '2026-05-30' and date '2026-06-28'
  ), base as (
    select trim(s.Nm) branch, l.Scm-l.VatAmount net_sales_amount,
      (l.Scm-l.VatAmount)-l.Cmt*coalesce(z.FinalCostPrice,c.FinalRegularCostPrice,0) gross_profit_amount,
      case when coalesce(z.FinalCostPrice,c.FinalRegularCostPrice) is not null then l.Scm-l.VatAmount end costed_net_sales_amount,
      case when coalesce(z.FinalCostPrice,c.FinalRegularCostPrice) is null then 1 else 0 end missing_cost_line,
      case when z.FinalCostPrice is not null then 'zakyan' when c.FinalRegularCostPrice is not null then 'regular' else 'zero' end resolved_cost_source
    from ${lines} l join h on l.KupaDocC=h.C join ${stores} s on s.C=h.StoreC join ${products} p on p.C=l.PrtC
    left join ${costs} c on c.StoreID=h.StoreC and c.ItemID=l.PrtC and c.DateDoc=h.cost_date
    left join ${franchiseCosts} z on z.StoreID=h.StoreC and z.ItemID=l.PrtC and z.CustomerID=h.CustomerC
      and z.MivzaC=l.MivzaNo and z.DateDoc=h.cost_date
    where l.sale_date between date '2026-05-30' and date '2026-06-28'
  ) ${select}`
const profitYoYSql = `with h as (
    select *, case when sale_date>=date '2026-05-30' then 'current' else 'previous' end period_bucket,
      year(DateDoc)*10000+month(DateDoc)*100+day(DateDoc) cost_date from ${headers}
    where sale_date between date '2026-05-30' and date '2026-06-28'
      or sale_date between date '2025-05-30' and date '2025-06-28'
  ), c as (select * from ${costs} where DateDoc between 20260530 and 20260628 or DateDoc between 20250530 and 20250628),
  z as (select * from ${franchiseCosts} where DateDoc between 20260530 and 20260628 or DateDoc between 20250530 and 20250628),
  base as (
    select trim(s.Nm) branch, h.period_bucket,
      l.Scm-l.VatAmount-l.Cmt*coalesce(z.FinalCostPrice,c.FinalRegularCostPrice,0) gross_profit_amount
    from ${lines} l join h on l.KupaDocC=h.C join ${stores} s on s.C=h.StoreC join ${products} p on p.C=l.PrtC
    left join c on c.StoreID=h.StoreC and c.ItemID=l.PrtC and c.DateDoc=h.cost_date
    left join z on z.StoreID=h.StoreC and z.ItemID=l.PrtC and z.CustomerID=h.CustomerC
      and z.MivzaC=l.MivzaNo and z.DateDoc=h.cost_date
    where l.sale_date between date '2025-05-30' and date '2026-06-28'
  ), agg as (select branch,period_bucket,round(sum(gross_profit_amount),2) profit from base group by 1,2)
  select branch, max(profit) filter(where period_bucket='current') current_profit,
    max(profit) filter(where period_bucket='previous') previous_profit
  from agg group by 1 order by current_profit desc nulls last limit 10`
const comaxBenches = [
  {
    name: 'latestMonthRaw', fsMs: 157, files: ['KupaDoc_Lines-mqy.parquet'],
    sql: `select count(*) lines from ${lines} where sale_date between date '2026-06-01' and date '2026-06-28'`
  }
]
const comaxAllBenches = [
  {
    name: 'holidayComparison', fsMs: 331, files: salesFiles,
    sql: salesSql('2026-03-26', '2026-04-15', `select branch,
      round(sum(net_sales_amount) filter(where sale_time<date '2026-04-02'),2) before_value,
      round(sum(net_sales_amount) filter(where sale_time between date '2026-04-02' and date '2026-04-08'),2) during_value,
      round(sum(net_sales_amount) filter(where sale_time>date '2026-04-08'),2) after_value
      from base where branch is not null group by 1 order by during_value desc nulls last limit 10`)
  },
  ...comaxBenches,
  {
    name: 'weeklyTrend', fsMs: 649, files: ['KupaDoc_Lines-mqy.parquet', 'KupaDoc_Header-mqy.parquet', 'Store.parquet', 'Prt.parquet'],
    sql: `with h as (select * from ${headers} where sale_date between date '2026-03-31' and date '2026-06-28')
      select strftime(h.DateDoc,'%G-%V') week_year, round(sum(l.Scm-l.VatAmount),2) sales,
      count(distinct l.KupaDocC) receipts from ${lines} l join h on l.KupaDocC=h.C
      join ${stores} s on s.C=h.StoreC join ${products} p on p.C=l.PrtC
      where l.sale_date between date '2026-03-31' and date '2026-06-28' group by 1 order by 1`
  },
  {
    name: 'topItems', fsMs: 351, files: ['KupaDoc_Lines-mqy.parquet', 'KupaDoc_Header-mqy.parquet', 'Store.parquet', 'Prt.parquet'],
    sql: `with h as (select * from ${headers} where sale_date between date '2026-05-30' and date '2026-06-28')
      select trim(p.Nm) as item_name, round(sum(l.Scm-l.VatAmount),2) sales, sum(l.Cmt) qty from ${lines} l
      join h on l.KupaDocC=h.C join ${stores} s on s.C=h.StoreC join ${products} p on p.C=l.PrtC
      where l.sale_date between date '2026-05-30' and date '2026-06-28' group by 1 order by sales desc limit 20`
  },
  {
    name: 'kpis', fsMs: 343, files: costFiles,
    sql: costSql(`select round(sum(net_sales_amount),2) sales, round(sum(gross_profit_amount),2) profit,
      round(100*sum(gross_profit_amount)/nullif(sum(net_sales_amount),0),2) margin,
      round(100*sum(costed_net_sales_amount)/nullif(sum(net_sales_amount),0),2) coverage from base`)
  },
  {
    name: 'costAudit', fsMs: 438, files: costFiles,
    sql: costSql(`select resolved_cost_source as source, count(*) lines,
      round(sum(gross_profit_amount),2) profit from base group by 1 order by 2 desc`)
  },
  {
    name: 'marginByBranch', fsMs: 599, files: costFiles,
    sql: costSql(`select branch, round(sum(net_sales_amount),2) sales, round(sum(gross_profit_amount),2) profit,
      round(100*sum(gross_profit_amount)/nullif(sum(net_sales_amount),0),2) margin
      from base group by branch order by profit desc limit 10`)
  },
  {
    name: 'missingCostCoverage', fsMs: 692, files: costFiles,
    sql: costSql(`select branch, sum(missing_cost_line) missing_lines, count(*) total_lines,
      round(100.0*sum(missing_cost_line)/count(*),1) missing_pct
      from base group by branch order by missing_pct desc`)
  },
  {
    name: 'profitYoYByBranch', fsMs: 3997, files: costFiles, sql: profitYoYSql
  },
  {
    name: 'topBranches', fsMs: 466, files: salesFiles,
    sql: salesSql('2026-05-30', '2026-06-28', `select branch, round(sum(net_sales_amount),2) sales,
      round(sum(net_sales_amount)/nullif(count(distinct KupaDocC),0),2) basket
      from base group by branch order by sales desc limit 8`)
  },
  {
    name: 'promotionPerformance', fsMs: 251, files: [...salesFiles, 'Mivza.parquet'],
    sql: salesSql('2026-05-30', '2026-06-28', `select promotion,
      round(sum(promo_net_sales_amount),2) promo_sales, count(distinct KupaDocC) receipts
      from base where MivzaNo>0 group by 1 order by promo_sales desc limit 15`,
    `left join ${promotions} promo on promo.C=l.MivzaNo`, ', trim(promo.Nm) promotion')
  },
  {
    name: 'baselineNetSales30d', fsMs: 184, files: salesFiles,
    sql: salesSql('2026-05-30', '2026-06-28', 'select round(sum(net_sales_amount),2) sales from base')
  }
]
const send = (msg, log, onProgress = () => {}, ctx) => new Promise(resolve => {
  const worker = new Worker(e2eWorkerUrl, { type: 'module' })
  worker.onmessage = ({ data }) => {
    if (data.kind === 'log') return log(`[cpp] ${data.line}`)
    if (data.kind === 'progress') return onProgress(data.step, data.status)
    if (data.kind === 'ready') return
    worker.terminate()
    if (data.error) ctx?.vars?.errorLogger?.error?.({ t: 'wasm.worker.error', error: data.error }, {}, { ctx })
    resolve({ ...data, rows: data.error ? [] : tableFromIPC(data.ipc).toArray().map(row => row.toJSON()) })
  }
  worker.postMessage(msg)
})
const stage = async (name, msg, check, addStage, log) => {
  const at = performance.now(), result = await send(msg, log), ok = check(result)
  addStage({ name, ok, ms: performance.now() - at, faults: result.faults, hits: result.hits, rows: result.rows })
  if (!ok) throw new Error(`${name}: ${JSON.stringify({ rows: result.rows, faults: result.faults, hits: result.hits })}`)
  return result
}
const runStages = async (addStage, log) => {
  const P = storesUrl, BIG = storesBigUrl, runId = `${Date.now()}-${Math.random()}`
  const from = `cols_cache(['${P}'])`, bigFrom = `cols_cache(['${BIG}'])`
  await stage('1 — wasm sql parse', { sql: 'select 42 answer' }, r => r.rows[0].answer === 42, addStage, log)
  await stage('2 — browser-fs prefilled', {
    sql: `select count(*) storeCount from ${from}`, ccUrls: { [P]: P }, prefill: [P],
    cacheId: `${runId}-s2`, cleanupUrls: [P]
  }, r => r.rows[0].storeCount === 28 && !r.faults, addStage, log)
  const q = `select count(distinct City) cities from ${bigFrom}`
  await stage('3 — page fault', {
    sql: q, ccUrls: { [BIG]: BIG }, cacheId: `${runId}-s3`, cleanupUrls: [BIG]
  }, r => r.rows[0].cities > 0 && r.faults > 0, addStage, log)
  await stage('4a — populate chunks', {
    sql: q, ccUrls: { [BIG]: BIG }, cacheId: `${runId}-s4`
  }, r => r.faults > 0, addStage, log)
  await stage('4b — fresh worker reuses chunks', {
    sql: q, ccUrls: { [BIG]: BIG }, cacheId: `${runId}-s4`, cleanupUrls: [BIG]
  }, r => !r.faults && r.hits > 0, addStage, log)
  const W = 'room://testPublicRoom/usersRO/stores.parquet'
  const gcs = await wresolve(W, new coreUtils.Ctx().setVars({ dbCategories: { gcshttpblockedbycors: true } }))
  await stage('5 — stream from GCS', {
    sql: `select count(*) storeCount from cols_cache(['${W}'])`, ccUrls: { [W]: gcs },
    cacheId: `${runId}-s5`, cleanupUrls: [W]
  }, r => r.rows[0].storeCount === 28, addStage, log)
  await stage('6 — cold taxi', {
    sql: taxiSql, threads: 1, ccUrls: { [T]: taxiFile }, cacheId: `${runId}-taxi`
  }, r => r.rows[0].trips === 3066766 && r.faults + r.hits > 0, addStage, log)
  await stage('7 — hot taxi ×7', {
    sql: taxiSql, threads: 1, ccUrls: { [T]: taxiFile }, cacheId: `${runId}-taxi`,
    cleanupUrls: [T], warmup: 1, runs: 7
  }, r => r.rows[0].trips === 3066766 && !r.faults, addStage, log)
}
const stats = runs => {
  const times = runs.map(x => x.ms).sort((a, b) => a - b)
  return { median: times[times.length >> 1], p90: times[Math.ceil(times.length * .9) - 1], min: times[0], max: times[times.length - 1] }
}
const benchmark = async ({ sql, threads, ccUrls, runs = 7 }, log, onProgress, ctx) => {
  const at = performance.now()
  const result = await send({
    sql, threads, ccUrls, cacheId: `benchmark-${Date.now()}-${Math.random()}`,
    cleanupUrls: Object.keys(ccUrls), warmup: 1, runs
  }, log, onProgress, ctx)
  if (result.faults) throw new Error(`${threads} threads: measured scan faulted`)
  return {
    threads, rows: result.rows, cold: result.warmups[0].ms, total: performance.now() - at,
    fileMB: result.fileBytes / 1e6, scanMB: result.warmups[0].readBytes / 1e6,
    ...stats(result.runs)
  }
}

const progress = (step, status) => coreUtils.eventEmitter.emit('progress', { step, status })
const errorData = (ctx, data, error) => ctx.setData({ ...data, error: error.stack || String(error) })
const shell = (h, title, body, error) => h('div:p-4 bg-gray-950 text-gray-200 min-h-screen font-mono', {},
  h('h2:text-lg text-white mb-3', {}, title), body, error && h('pre:text-red-400 whitespace-pre-wrap', {}, error))
const timedStepper = Component('timedStepper', {
  type: 'progress-indicator<react>',
  params: [{ id: 'title' }, { id: 'steps' }, { id: 'labels' }],
  impl: (ctx, { react: { h, useEffect, useState } }, { title, steps, labels }) => () => {
    const ids = steps.split(','), names = labels.split(','), [state, setState] = useState({})
    const [started] = useState(performance.now()), [now, setNow] = useState(started)
    useEffect(() => {
      const timer = setInterval(() => setNow(performance.now()), 100)
      const update = e => e?.step && setState(s => {
        const at = performance.now(), previous = s[e.step]
        return { ...s, [e.step]: { status: e.status, start: previous?.start || at, end: e.status === 'done' ? at : 0 } }
      })
      coreUtils.eventEmitter.on('progress', update)
      return () => { clearInterval(timer); coreUtils.eventEmitter.off('progress', update) }
    }, [])
    const clock = ms => `${ms.toFixed(3)} ms`
    return h('div:max-w-lg mx-auto mt-10 p-6 bg-white rounded-xl text-gray-800', {},
      h('h2:font-semibold mb-4', {}, `${title} — ${clock(now - started)}`),
      h('ul:space-y-2', {}, ...ids.map((id, i) => {
        const x = state[id], elapsed = x && clock((x.end || now) - x.start)
        return h('li:flex justify-between', { key: id },
          h('span', {}, `${x?.status === 'done' ? '✓' : x ? '▶' : '○'} ${names[i]}`), h('span:tabular-nums', {}, elapsed || ''))
      })))
  }
})

const wasmStages = ReactComp('wasmStages', {
  impl: comp({
    enrichCtx: async ctx => {
      const stages = [], logs = []
      try {
        progress('stages', 'running')
        await runStages(stage => stages.push(stage), line => logs.push(line))
        progress('stages', 'done')
        return ctx.setData({ stages, logs })
      } catch (error) {
        return errorData(ctx, { stages, logs }, error)
      }
    },
    progressIndicator: stepper({ title: 'Running seven functional stages', steps: 'stages', labels: 'Seven stages' }),
    hFunc: (ctx, { react: { h } }) => () => shell(h, 'Seven functional stages',
      h('div', {}, ...ctx.data.stages.map((s, i) => h('pre:m-0', { key: i },
        `${s.ok ? '✓' : '✗'} ${s.name} ${s.ms.toFixed(0)}ms faults=${s.faults} hits=${s.hits}`))), ctx.data.error)
  })
})

const wasmTaxiPerformance = ReactComp('wasmTaxiPerformance', {
  impl: comp({
    enrichCtx: async ctx => {
      const perf = [], logs = [], run = async name => {
        progress(name, 'running')
        const at = performance.now(), rows = await jb.biUtils.runDuckdb(taxiSql, ctx)
        perf.push({ name, ms: performance.now() - at, rows })
        progress(name, 'done')
      }
      try {
        ;(jb.biUtils.colsCacheUrls ||= {})[T] = taxiFile
        await jb.biUtils.clearDuckdbCache()
        await run('cold')
        await run('warm')
        return ctx.setData({ perf, logs })
      } catch (error) {
        return errorData(ctx, { perf, logs }, error)
      }
    },
    progressIndicator: stepper({
      title: 'Running cubeless taxi via duckdb-utils', steps: 'cold,warm', labels: 'Cold query,Warm query'
    }),
    hFunc: (ctx, { react: { h } }) => () => shell(h, 'Cubeless taxi via duckdb-utils',
      h('div', {},
        ...ctx.data.perf.map(p => h('pre:m-0', { key: p.name }, `${p.name}=${p.ms.toFixed(1)}ms ${JSON.stringify(p.rows)}`))),
      ctx.data.error)
  })
})

const wasmComaxBenchmarks = ReactComp('wasmComaxBenchmarks', {
  impl: comp({
    enrichCtx: async ctx => {
      const comax = [], logs = []
      try {
        for (const item of comaxBenches) {
          const result = await benchmark({
            sql: item.sql, threads: 1, ccUrls: comaxUrls(item.files), runs: 1
          }, line => logs.push(line), progress, ctx)
          comax.push({ name: item.name, fsMs: item.fsMs, ...result, ratio: result.median / item.fsMs })
        }
        return ctx.setData({ comax, logs })
      } catch (error) {
        return errorData(ctx, { comax, logs }, error)
      }
    },
    progressIndicator: timedStepper({
      title: 'Running Comax benchmark', steps: 'opfs,signature,footer,allocate,seed,glue,wasm,duckdb,cold,hot,cleanup',
      labels: 'Create OPFS access handle,Fetch PAR1 header and file size,Fetch explicit 64 KB footer,Initialize 61 KB page map,' +
        'Write initial footer to browser cache,Load WASM glue,' +
        'Download and compile WASM,Open DuckDB,Cold query and page faults,Hot query,Close and delete browser cache'
    }),
    hFunc: (ctx, { react: { h } }) => () => shell(h, 'Comax benchmarks',
      h('div', {}, h('pre:m-0 text-gray-400', {}, 'benchmark          cold query  hot query  total wait  localhost FS  hot/FS'),
        ...ctx.data.comax.map(x => h('pre:m-0', { key: x.name },
          `${x.name.padEnd(18)} ${x.cold.toFixed(1).padStart(8)}ms ${x.median.toFixed(1).padStart(8)}ms ` +
          `${x.total.toFixed(0).padStart(8)}ms ${String(x.fsMs).padStart(11)}ms ${x.ratio.toFixed(2).padStart(7)}×`)),
        h('h3:text-white mt-4', {}, 'C++ logs'),
        ...ctx.data.logs.map((line, i) => h('pre:m-0 text-gray-500', { key: i }, line))),
      ctx.data.error)
  })
})

const wasmComaxComparison = ReactComp('wasmComaxComparison', {
  impl: comp({
    enrichCtx: async ctx => {
      const comax = [], logs = []
      try {
        for (const item of comaxAllBenches) {
          progress(item.name, 'running')
          const result = await benchmark({
            sql: item.sql, threads: 1, ccUrls: comaxUrls(item.files), runs: 1
          }, line => logs.push(line), undefined, ctx)
          comax.push({ name: item.name, fsMs: item.fsMs, ...result, ratio: result.median / item.fsMs })
          progress(item.name, 'done')
        }
        return ctx.setData({ comax, logs })
      } catch (error) {
        return errorData(ctx, { comax, logs }, error)
      }
    },
    progressIndicator: timedStepper({
      title: 'Running Comax comparison',
      steps: comaxAllBenches.map(x => x.name).join(','),
      labels: comaxAllBenches.map(x => x.name).join(',')
    }),
    hFunc: (ctx, { react: { h } }) => () => {
      const chartData = ctx.data.comax.slice(0, 2)
      const max = Math.max(1, ...chartData.map(x => x.cold)), height = ms => `${160 * ms / max}px`
      const chart = h('div:mt-6', {},
        h('div:flex gap-4 text-xs mb-3', {},
          h('span:text-slate-400', {}, '■ localhost FS'),
          h('span:text-green-400', {}, '■ WASM hot'),
          h('span:text-orange-400', {}, '■ WASM cold overhead')),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: '16px' } },
          ...chartData.map(x => h('div:text-center text-xs', { key: x.name },
            h('div:flex items-end justify-center gap-3 h-44', {},
              h('div:w-7 bg-slate-400', { style: { height: height(x.fsMs) }, title: `FS ${x.fsMs}ms` }),
              h('div:w-7 flex flex-col justify-end', { style: { height: height(x.cold) }, title: `WASM cold ${x.cold.toFixed(1)}ms` },
                h('div:bg-orange-400', { style: { height: height(x.cold - x.median) } }),
                h('div:bg-green-500', { style: { height: height(x.median) } }))),
            h('div:break-words mt-1', {}, x.name),
            h('div:text-gray-400', {}, `${x.ratio.toFixed(2)}× hot/FS`)))))
      return shell(h, 'Comax comparison',
        h('div', {}, h('pre:m-0 text-gray-400', {},
          'benchmark          file MB  scan MB  cold query  hot query  total wait  localhost FS  hot/FS'),
          ...ctx.data.comax.map(x => h('pre:m-0', { key: x.name },
            `${x.name.padEnd(18)} ${x.fileMB.toFixed(1).padStart(7)} ${x.scanMB.toFixed(1).padStart(8)} ` +
            `${x.cold.toFixed(1).padStart(8)}ms ${x.median.toFixed(1).padStart(8)}ms ` +
            `${x.total.toFixed(0).padStart(8)}ms ${String(x.fsMs).padStart(11)}ms ${x.ratio.toFixed(2).padStart(7)}×`)),
          chart), ctx.data.error)
    }
  })
})

ReactComp('wasmBenchmarks', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh, useState } }) => () => {
      const [tab, setTab] = useState('taxi')
      const tabs = {
        comparison: wasmComaxComparison,
        comax: wasmComaxBenchmarks,
        stages: wasmStages,
        taxi: wasmTaxiPerformance
      }
      const button = id => h(`button:px-3 py-2 ${tab === id ? 'bg-blue-600 text-white' : 'bg-gray-800'}`,
        { onClick: () => setTab(id) }, id === 'comax' ? 'comax - Latest month raw' : id === 'comparison' ? 'comax - comparison' : id)
      return h('div:p-4 bg-gray-950 text-gray-200 min-h-screen font-mono', {},
        h('h1:text-lg text-white mb-3', {}, 'DuckDB WASM diagnostics'),
        h('div:flex gap-1 mb-3', {}, ...Object.keys(tabs).map(button)),
        hh(ctx, tabs[tab]))
    }
  })
})
