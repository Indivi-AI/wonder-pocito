import { dsls, coreUtils, jb } from '@jb6/core'
import '@jb6/react'
import '@jb6/core/misc/pretty-print.js'
import '@jb6/lang-service/src/tgp-snippet.js'
import '@jb6/core/misc/jb-remote-via-cli.js'
import './bi-benchmarks.js'
import '@solution/comax2/comax-benchmark.js'
import '@wonder/db/db-drivers-utils.js'

const { formatTimeWithRandom } = jb.wonderUtils

const {
  common: { data: { compareBenchmarks } },
  bi: {
    'query-case': {
      'biBench.taxi': taxi
    },
    'query-environment': { wasm, cloud }
  },
  react: { ReactComp, 'react-comp': { comp } }
} = dsls
const ms = n => n == null ? '—' : `${n.toFixed(1)}ms`
const mb = n => n == null ? '—' : `${(n / 1e6).toFixed(1)} MB`
const mbps = n => n == null ? '—' : `${n.toFixed(1)} MB/s`
const benchmarkStats = result => {
  const cold = result.cold, profiling = result.profiling || {}, ranges = profiling.rangesFromBucket, download = profiling.download
  const bytes = download?.bytes ?? ranges?.bytes, pct = bytes == null || !profiling.sourceBytes
    ? '—' : `${(100 * bytes / profiling.sourceBytes).toFixed(1)}%`
  return [
    ['Query E2E', ms(cold.queryMs)], ['DuckDB wall', ms(profiling.scanMs)], ['DuckDB CPU', ms(profiling.cpuMs)],
    ['CPU user / system', `${ms(profiling.userCpuMs)} / ${ms(profiling.systemCpuMs)}`], ['File', mb(profiling.sourceBytes)],
    ['Scanned', mb(profiling.bytesScanned)], ['Downloaded', bytes == null ? '—' : `${mb(bytes)} · ${pct}`],
    ['Network active', ms(download?.activeMs)],
    ['Request sum', ms(ranges?.requestMs)], ['Requests', ranges?.requests ?? '—'], ['Concurrency', ranges?.maxConcurrency ?? '—'],
    ['Throughput', mbps(download?.mbps)], ['Active throughput', mbps(download?.activeMbps)],
    ['Row groups', profiling.rowGroupsScanned || '—'], ['Instance', cold.runtime?.instance || '—'],
    ['Revision', cold.runtime?.revision || '—'], ['Cache reused', result.cacheReused == null ? '—' : String(result.cacheReused)],
    ['Valid', String(result.valid)]
  ]
}
const caseName = id => id.split('.').pop()
const fileName = wUrl => wUrl?.split('/').pop()?.replace(/\.parquet$/i, '')
const environmentName = id => ({
  localFs: 'Local filesystem', cloud: 'Cloud Run Lambda', wasm: 'Public-room GCS in browser WASM',
  'wasm-cold': 'Cold WASM', 'wasm-warm': 'Warm WASM'
})[id] || id
const rangeText = (r, first) => `${r.file}${r.role ? ` · join ${r.role}` : ''} · ${r.rg == null ? r.type : `${r.rg}:${r.col}`} · ${mb(r.bytes)} · `
  + `at +${ms(r.startMs - first)} · duration ${ms(r.durationMs)}`
ReactComp('biBenchmarkPerformance', {
  params: [
    { id: 'title', as: 'string' },
    { id: 'cases', asIs: true },
    { id: 'environmentProfiles', asIs: true },
    { id: 'warmRuns', as: 'number', defaultValue: 1 },
    { id: 'selectedRun', as: 'string' },
    { id: 'clearBeforeRun', as: 'boolean', defaultValue: true },
    { id: 'onResult', asIs: true }
  ],
  impl: comp({
    enrichCtx: (ctx, {}, { cases, environmentProfiles, selectedRun }) => {
      const envs = environmentProfiles.map(([id]) => id)
      return ctx.setVars({
        cases, environmentProfiles, envs,
        selectedEnvs: selectedRun?.startsWith('wasm') ? ['wasm'] : selectedRun ? ['cloud'] : envs,
        selectResults: results => !selectedRun ? results : results.flatMap(result => {
          if (selectedRun?.startsWith('wasm')) {
            if (result.environment !== 'wasm') return []
            const run = result.cold
            return run ? [{ ...result, environment: selectedRun, cold: run, warm: [], profiling: run.profiling || {},
              cacheReused: selectedRun === 'wasm-warm' }] : []
          }
          if (result.environment !== 'cloud') return []
          const run = selectedRun === 'lambda-warm' ? result.warm[0] : result.cold
          const cacheReused = selectedRun === 'lambda-warm' ? run?.runtime?.instance === result.cold.runtime?.instance : undefined
          return run ? [{ ...result, environment: selectedRun, cold: run, warm: [],
            profiling: run.profiling || {}, cacheReused }] : []
        })
      })
    },
    hFunc: (_ctx, { roomUrl, react: { h, useEffect, useRef, useState },
      cases, environmentProfiles, envs, selectedEnvs, selectResults }, { title, warmRuns, selectedRun, clearBeforeRun, onResult }) => () => {
      const [progress, setProgress] = useState({}), [downloads, setDownloads] = useState({}),
        [results, setResults] = useState([]), [error, setError] = useState(), started = useRef(), saved = useRef(),
        ctx = useRef(coreUtils.ensureLoggers('benchmarkLogger,roomLogger,dbLogger', { ctx: _ctx })
          .setVars({ benchmarkRunId: formatTimeWithRandom() })).current
      useEffect(() => ctx.vars.benchmarkLogger?.info?.({
        t: 'benchmark.ui.mounted', benchmarkRunId: ctx.vars.benchmarkRunId
      }, {}, { ctx }), [])
      useEffect(() => {
        if (started.current) return
        started.current = true
        let activeCard
        const onProgress = e => {
          if ((['rangeDownload', 'benchmarkStage'].includes(e?.t) || e?.t?.startsWith('bi.network.') && e.wUrl) && activeCard)
            return setDownloads(x => {
            const card = x[activeCard] || {}
            return { ...x, [activeCard]: e.t === 'rangeDownload'
              ? { ...card, files: { ...card.files, [e.column ? `${e.wUrl}#${e.column}` : e.wUrl]: e } }
              : e.t === 'benchmarkStage' ? { ...card, stage: e, files: e.files
                ? Object.fromEntries(e.files.map(wUrl => [wUrl, card.files?.[wUrl] || {
                  wUrl, pct: e.cachedFiles?.includes(wUrl) ? 100 : 0, status: e.cachedFiles?.includes(wUrl) ? 'cached' : 'waiting'
                }]))
                : card.files }
              : { ...card, files: { ...card.files, [e.wUrl]: {
                ...card.files?.[e.wUrl], ...e, pct: e.t === 'bi.network.end' ? 100 : 0,
                status: e.t === 'bi.network.end' ? 'done' : 'running'
              } } } }
          })
          const environment = e?.environment || envs.find(x => e?.step?.includes(`.${x}.`))
          const queryCase = e?.queryCase || cases.find(([id]) => e?.step?.includes(id))?.[0]
          if (!environment || !queryCase) return
          const key = `${queryCase}.${environment}`
          setProgress(x => ({ ...x, [key]: { ...e, environment, queryCase } }))
          if (e.result) {
            ctx.vars.benchmarkLogger?.info?.({ t: 'benchmark.ui.resultReceived', queryCase, environment }, {}, { ctx })
            onResult?.(e.result)
            setResults(x => [...x.filter(y => `${y.queryCase}.${y.environment}` !== key), e.result])
          }
        }
        coreUtils.eventEmitter.on('progress', onProgress)
        ;(async () => {
          for (const [caseId, queryCase] of cases)
            for (const [environmentId, environment] of environmentProfiles.map(([id, profile]) => [id, profile()])) {
              activeCard = `${caseId}.${environmentId}`
              const [result] = await compareBenchmarks.$runWithCtx(ctx, {
                queryCase: queryCase(), environments: [environment], warmRuns, clearBeforeRun
              })
              if (result.error) setError(result.error)
            }
        })().catch(setError)
        return () => coreUtils.eventEmitter.off('progress', onProgress)
      }, [])
      const complete = results.length === cases.length * envs.length
      useEffect(() => {
        if (complete && !saved.current) {
          saved.current = true
          ctx.vars.benchmarkLogger?.info?.({
            t: 'benchmark.ui.resultsCommitted', results: results.length, expectedResults: cases.length * envs.length,
            benchmarkRunId: ctx.vars.benchmarkRunId
          }, {}, { ctx })
        }
      }, [complete])
      const selectedResults = selectResults(results)
      const coverage = selectedResults.find(x => x.profiling?.sourceBytes && x.profiling.bytesScanned != null)?.profiling
      const coveragePct = 100 * coverage?.bytesScanned / coverage?.sourceBytes
      const profiling = selectedResults.find(x => x.profiling?.rangesFromBucket || x.profiling?.download)?.profiling
      const rangesFromBucket = profiling?.rangesFromBucket
      const download = profiling?.download || rangesFromBucket && { bytes: rangesFromBucket.bytes, ms: rangesFromBucket.wallMs,
        mbps: rangesFromBucket.bytes / rangesFromBucket.wallMs / 1000, activeMbps: rangesFromBucket.bytes / rangesFromBucket.requestMs / 1000 }
      const firstRequest = rangesFromBucket && Math.min(...rangesFromBucket.waterfall.map(x => x.startMs))
      return h('main:min-h-screen bg-slate-950 text-slate-200 p-6 font-sans', {},
        h('style', {}, '@keyframes benchmark-wave{to{background-position:-200% 0}}'),
          h('div:max-w-5xl mx-auto', {},
          h('h1:text-2xl font-semibold text-white', {},
            ({ 'lambda-cold': 'Lambda cold', 'lambda-warm': 'Lambda warm', 'wasm-cold': 'Cold WASM', 'wasm-warm': 'Warm WASM' })[selectedRun] || title),
          h('p:text-sm text-slate-400 mt-1 mb-6', {}, envs.map(environmentName).join(' · ')),
          !error && (!complete || coverage) && h('div:mb-8', {},
            h('div:flex justify-between text-sm mb-2', {},
              h('span:text-slate-300', {}, coverage
                ? `Scanned ${mb(coverage.bytesScanned)} of ${mb(coverage.sourceBytes)}` : 'Measuring scan coverage…'),
              coverage && h('strong:text-cyan-300', {}, `${coveragePct.toFixed(1)}%`)),
            h('div:h-3 rounded-full bg-slate-800 overflow-hidden', {},
              h('div:h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all',
                { style: { width: coverage ? `${Math.min(100, coveragePct)}%` : '4%' } })),
            download && h('div:text-sm text-cyan-300 mt-2 tabular-nums', {},
              `Downloaded ${mb(download.bytes)} in ${ms(download.ms)} · ${mbps(download.mbps)} · `
              + `active ${mbps(download.activeMbps)}`)),
          !error && (!complete || selectedRun?.startsWith('wasm')) &&
          h('div:grid gap-3 mb-8', { style: { gridTemplateColumns: `repeat(${Math.min(3, cases.length * envs.length)},minmax(0,1fr))` } },
            ...cases.flatMap(([caseId]) => selectedEnvs.map(environment => {
            const result = results.find(x => x.queryCase.endsWith(caseId) && x.environment === environment)
            const event = Object.values(progress).find(x => x.queryCase?.endsWith(caseId) && x.environment === environment)
            const download = downloads[`${caseId}.${environment}`]
            const files = Object.values(download?.files || {})
            return h(`div:rounded-xl border bg-slate-900 p-4 transition ${event && !result
              ? 'border-cyan-500 shadow-lg shadow-cyan-950/60' : 'border-slate-800'}`, {
                key: `${caseId}.${environment}`, style: event && !result ? {
                  backgroundImage: 'linear-gradient(110deg,#0f172a 20%,#164e63 45%,#0f172a 70%)',
                  backgroundSize: '200% 100%', animation: 'benchmark-wave 1.3s linear infinite'
                } : {}
              },
              h('div:flex justify-between gap-3', {},
                h('strong:text-white', {}, `${caseId} · ${environment}`),
                h('span:text-xs ' + (result ? 'text-emerald-400' : 'text-cyan-400'), {},
                  result ? '✓ Complete' : event ? '● Running' : 'Waiting')),
              h('div:text-sm text-slate-400 mt-2', {}, download
                ? download.stage?.label || `prefetch · ${files.filter(x => x.status === 'done').length}/${files.length} files`
                : event?.t || 'Waiting'),
              h('div:space-y-2 mt-3', {}, ...(files.length ? files.map(file =>
                h('div', { key: `${file.wUrl}.${file.column || ''}` },
                  h('div:flex justify-between text-xs text-slate-400 mb-1', {},
                    h('span:truncate', { title: file.wUrl }, `${fileName(file.wUrl)}${file.column ? ` · ${file.column}` : ''}`),
                    h('span:tabular-nums', {}, file.fetchedBytes == null
                      ? `${file.status === 'cached' ? 'cached · ' : ''}${file.pct.toFixed(1)}%`
                      : `${mb(file.fetchedBytes)} / ${mb(file.totalBytes)} · ${file.pct.toFixed(1)}%`)),
                  h('div:h-1.5 rounded bg-slate-800 overflow-hidden', {},
                    h('div:h-full bg-cyan-400 transition-all', { style: { width: `${file.pct}%` } })))) : [
                h('div:h-1.5 rounded bg-slate-800 overflow-hidden', {},
                  h(`div:h-full transition-all ${event && !result ? 'bg-cyan-400 animate-pulse' : 'bg-cyan-500'}`,
                    { style: { width: result ? '100%' : event ? '8%' : '0%' } }))
              ])))
          }))),
          rangesFromBucket && h('div:mb-10 rounded-xl border border-slate-800 bg-slate-900 p-4', {},
            h('div:flex justify-between gap-4 mb-4', {},
              h('strong:text-white', {}, 'WASM cold network waterfall'),
              h('span:text-xs text-slate-400', {},
                `${rangesFromBucket.requests} requests · ${mb(rangesFromBucket.bytes)} · ${ms(rangesFromBucket.wallMs)} · `
                + `concurrency ${rangesFromBucket.maxConcurrency}`)),
            h('div:max-h-80 overflow-y-auto space-y-1', {}, ...rangesFromBucket.waterfall.map((request, i) =>
                h('div:grid grid-cols-[13rem_1fr] gap-3 items-center text-xs', { key: `${request.off}.${i}` },
                  h('span:text-slate-400 truncate tabular-nums', { title: rangeText(request, firstRequest) },
                    rangeText(request, firstRequest)),
                h('div:h-4 relative rounded bg-slate-800', {},
                  h('div:absolute h-full rounded bg-gradient-to-r from-cyan-500 to-blue-400', {
                    title: rangeText(request, firstRequest),
                    style: { left: `${100 * (request.startMs - firstRequest) / rangesFromBucket.wallMs}%`,
                      width: `${Math.max(0.5, 100 * request.durationMs / rangesFromBucket.wallMs)}%` }
                  })))))),
          selectedResults.length > 0 && h('div', {},
            h('div:grid gap-4', { style: { gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' } }, ...selectedResults.map(result =>
              h('div:rounded-xl border border-slate-800 bg-slate-900 p-4', { key: `stats.${result.queryCase}.${result.environment}` },
                h('strong:text-white', {}, `${caseName(result.queryCase)} · ${environmentName(result.environment)}`),
                h('div:grid grid-cols-2 gap-x-5 gap-y-2 mt-4 text-sm', {}, ...benchmarkStats(result).flatMap(([label, value]) => [
                  h('span:text-slate-400', {}, label), h('span:text-right text-cyan-200 tabular-nums', {}, value)
                ]))))),
          complete && h('div:text-emerald-400 mt-6', {}, 'All benchmarks complete'),
          error && h('pre:text-red-400 mt-6 whitespace-pre-wrap', {}, error.stack || String(error))))
      )
    }
  })
})

ReactComp('biBenchmarkQueryInspector', {
  params: [
    { id: 'title', as: 'string' },
    { id: 'cubeCompId', as: 'string', mandatory: true },
    { id: 'queryCaseId', as: 'string', mandatory: true }
  ],
  impl: comp({
    hFunc: (ctx, { react: { h, hh, useState } }, { title, cubeCompId, queryCaseId }) => () => {
      const queryCase = dsls.bi['query-case'][queryCaseId]
      const caseId = queryCaseId.split('.').pop()
      const modes = [
        ['cube', '◇', 'Cube', 'semantic model'], ['compiled', '⚙', 'Compiled SQL', 'physical query'],
        ['lambda-cold', '◷', 'Lambda cold', 'empty cols cache', cloud, 0, true],
        ['lambda-warm', '◷', 'Lambda warm', 'reuse /tmp cols cache', cloud, 1, true],
        ['wasm-cold', '◷', 'WASM cold', 'empty browser cols cache', wasm, 0, true],
        ['wasm-warm', '◷', 'WASM warm', 'reuse browser cols cache', wasm, 0, false]
      ]
      const [selected, setSelected] = useState(modes[+location.hash.split('/').at(-1)]?.[0] || 'cube')
      const [compiledSql, setCompiledSql] = useState()
      const [id, , label, , environment, warmRuns, clearBeforeRun] = modes.find(([id]) => id === selected)
      const benchmark = environment && ctx.run(dsls.react['react-comp'].biBenchmarkPerformance({
        title: label, cases: [[caseId, queryCase]], environmentProfiles: [[id.startsWith('wasm') ? 'wasm' : 'cloud', environment]],
        warmRuns, selectedRun: id, clearBeforeRun, onResult: result => setCompiledSql(result.profiling?.compiledSql)
      }))
      const code = text => h('pre', { style: {
        height: '100%', boxSizing: 'border-box', margin: 0, padding: 14, overflow: 'auto', textAlign: 'left',
        border: '1px solid #26364a', borderRadius: 12, background: '#0b1220', color: '#cbd5e1', fontSize: 12
      }}, text)
      const content = selected === 'cube'
        ? code(coreUtils.prettyPrintComp(coreUtils.compByFullId(cubeCompId), { tgpModel: jb }))
        : selected === 'compiled' ? code(compiledSql || 'Run a benchmark to produce its compiled SQL')
        : hh(ctx, benchmark)
      return h('div', { style: {
        height: '100%', boxSizing: 'border-box', padding: '12px 18px 18px',
        background: 'radial-gradient(circle at 15% 0%,#13293d 0,#071521 45%)', color: '#e2e8f0', fontFamily: 'Inter,system-ui'
      }}, h('pre', { style: {
        height: 96, boxSizing: 'border-box', margin: '0 0 10px', padding: 12, overflow: 'auto', textAlign: 'left',
        border: '1px solid #26364a', borderRadius: 10, background: '#0b1220', color: '#cbd5e1', fontSize: 12
      }}, queryCase.$run().sql.profile),
      h('div', { style: { display: 'grid', gridTemplateColumns: '190px 1fr', gap: 12, height: 'calc(100% - 106px)' } },
        h('nav', { style: {
          padding: 10, border: '1px solid #26364a', borderRadius: 12, background: 'linear-gradient(180deg,#101c2d,#0a1320)'
        }}, h('div', { style: {
          padding: '3px 9px 10px', color: '#64748b', fontSize: 9, letterSpacing: 1.6, textAlign: 'left', fontWeight: 800
        }}, title || 'QUERY PERFORMANCE'), ...modes.map(([mode, icon, modeLabel, hint], index) => h('button', {
          onClick: () => (setSelected(mode), history.replaceState(null, '', `#/1/${index}`)), style: {
            display: 'grid', gridTemplateColumns: '28px 1fr', width: '100%', padding: '9px 8px', marginBottom: 4,
            border: 0, borderLeft: `2px solid ${selected === mode ? '#67e8f9' : 'transparent'}`, borderRadius: 7,
            background: selected === mode ? '#173047' : 'transparent', color: selected === mode ? '#e0f2fe' : '#94a3b8',
            cursor: 'pointer', textAlign: 'left'
          }
        }, h('span', { style: {
          gridRow: '1/3', alignSelf: 'center', color: selected === mode ? '#67e8f9' : '#64748b', fontSize: 16
        }}, icon), h('b', { style: { fontSize: 11 } }, modeLabel),
        h('span', { style: { color: '#64748b', fontSize: 9, marginTop: 2 } }, hint)))),
        h('main', { key: selected, style: { minWidth: 0, minHeight: 0, overflow: 'auto' } }, content)))
    }
  })
})

ReactComp('biBenchmarkApplet', {
  impl: dsls.react['react-comp'].biBenchmarkPerformance({
    title: 'BI query benchmarks', cases: [['taxi', taxi]], environmentProfiles: [['wasm', wasm]]
  })
})

ReactComp('comaxBenchmarkApplet', {
  impl: dsls.react['react-comp'].biBenchmarkQueryInspector({
    title: 'COMAX2 KPI PERFORMANCE', cubeCompId: 'cube<bi>comaxSalesCube', queryCaseId: 'comaxBench.kpis'
  })
})
