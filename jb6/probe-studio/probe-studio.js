import { dsls, coreUtils, jb } from '@jb6/core'
import { reactUtils } from '@jb6/react'
import '@jb6/react/tests/react-testers.js'
import '@jb6/core/misc/import-map-services.js'
import '@jb6/core/misc/probe.js'
import '@jb6/jq'
import '@jb6/probe-studio/probe-studio-dsl.js'

Object.assign(coreUtils, { runProbeStudio })

const {
  tgp: { 'ctx-enricher': { Var } },
  react: { ReactComp, ReactMetadata,
    'react-comp': { comp },
    'react-metadata': { abbr, matchData, priority, importUrl }
  }
} = dsls

async function runProbeStudio({ importMapsInCli, imports, staticMappings, topElem, urlsToLoad, cleanseProbResult }) {
  jb.coreRegistry.importMapsInCli = importMapsInCli
  const { h, hh, createRoot, loadLucid05 } = reactUtils

  await loadLucid05()

  const urlParams = new URLSearchParams(window.location.search)
  const path = urlParams.get('path') || 'reactTest.HelloWorld~impl~expectedResult'
  const logger = urlParams.get('logger') || ''

  // harvestable browser loggers: uiLogger (visitsProgress wire diagnostics) + cliLogger (SSE→router→dispatch wire
  // logs) + probeLogger + any ?logger= names. exposed on window.jbLoggers so playwrightHarvest's
  // harvestLogs({vars: window.jbLoggers}) can read them. this SAME ctx is passed to runProbeCli so its
  // browser-side wire diagnostics (cliLogger.info) route into the harvested vars.
  const loggerCtx = coreUtils.ensureLoggers(['uiLogger', 'cliLogger', 'cliLineLogger', 'probeLogger', ...logger.split(',').map(s => s.trim()).filter(Boolean)])
  window.jbLoggers = loggerCtx.vars
  coreUtils.studioUiLogger = loggerCtx.vars.uiLogger   // visitsProgress logs into this
  coreUtils.studioLoggerCtx = loggerCtx                 // domainLogger.info needs a real ctx as 3rd arg

  const root = createRoot(topElem)
  const render = (c) => root.render(c)
  let status = ''
  const ctx = new coreUtils.Ctx().setVars({ react: reactUtils, path })
  const { loadingView } = dsls.react['react-comp']
  const onStatus = (status) => render(hh(ctx, loadingView, { status }))

  render(hh(ctx, loadingView, { status }))

  const repoRoot = await coreUtils.calcRepoRoot()
  const id6 = `${String(new Date().getMonth()+1).padStart(2,'0')}${String(new Date().getDate()).padStart(2,'0')}${String(Math.floor(Math.random()*100)).padStart(2,'0')}`
  const claudeDir = `${repoRoot}/.probe-claude/${id6}`

  let top = {}, error
  try {
    for (const file of urlsToLoad || []) {
      onStatus({ text: `Loading ${file}...`})
      try { await import(file) } catch (error) { 
        console.error(`Failed to load ${file}: ${error.stack}`) 
      }
    }
    const entryPointPaths = urlsToLoad.map(f => coreUtils.resolveWithImportMap(f, { imports }, staticMappings))
    top = await coreUtils.runProbeCli(path, { entryPointPaths, logger, ctx: loggerCtx }, { onStatus, claudeDir })
    if (cleanseProbResult)
      top = cleanseProbResult(ctx.setData(top))
  } catch (e) { error = e.stack || e.message }
  error = error || top.error || top.probeRes?.error
  error = error?.stderr || error

  const { probeRes, cmd: _cmd, projectDir } = top

  const _firstRes = probeRes?.result?.[0]?.in?.data
  let firstResInput = _firstRes
  try {
    firstResInput = typeof _firstRes == 'string' && _firstRes.trim().match(/^\[{/) ? JSON.parse(_firstRes) : _firstRes
  } catch (e) { }
  if (firstResInput) {
    firstResInput = probeRes.result[0].in.data = coreUtils.resolveRefs(firstResInput)
  }

  const cmd = [`cd ${projectDir}`, _cmd].join('\n')
  const success = probeRes?.circuitRes?.success
  const visits = probeRes?.visits?.[probeRes?.probePath] || 0
  const totalTime = probeRes?.totalTime
  const titleShort = (probeRes?.circuitCmpId || '').split('>').pop() || ''
  const probePath = probeRes?.probePath

  const viewCtx = ctx.setVars({ top, error, path, urlsToLoad, probeRes, firstResInput, cmd, success, visits, totalTime, titleShort, probePath, claudeDir })
  const allViews = coreUtils.globalsOfTypeIds(dsls.react['react-comp'])
    .map(id => {
      const comp = dsls.react['react-comp'][id]
      const jbComp = comp[coreUtils.asJbComp]
      coreUtils.resolveCompArgs(jbComp)
      const metadata = coreUtils.asArray(jbComp.impl.metadata)
      if (!metadata) return
      const priority = metadata.find(m => m.priority)?.priority
      const abbr = metadata.find(m => m.abbr)?.abbr
      const matchData = metadata.find(m => m.matchData)?.matchData
      let data
      try { data = matchData && viewCtx.run(matchData) } catch (error) { console.error(error) }
      const emptyArray = Array.isArray(data) && data.length == 0
      const useView = data && !emptyArray
      //console.log('view', id, useView)
      return ({ id, data, priority, abbr, comp, useView })
    }).filter(e => e?.useView)
    .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))


  render(hh(viewCtx.setVars({ allViews }), probeResultView))
}

// reusable live visited-comps list. Subscribes to eventEmitter 'progress' and accumulates {comp:count}
// from {t:'visit', comps} events (emitted by Probe.record via cliLogger.progress, routed browser-side by
// dispatchChildLine). Optional `seed` prop pre-fills the map (used post-run from probeRes.visits). `probed`
// prop highlights the probed comp.
const visitsProgress = ReactComp('visitsProgress', {
  impl: comp({
    hFunc: ({ }, { react: { h, useState, useEffect } }) => ({ seed, probed }) => {
      // seed from the global buffer so a re-mount (onStatus re-renders loadingView) keeps prior visits
      const [visits, setVisits] = useState(seed || coreUtils.lastProbeVisits || {})
      const [count, setCount] = useState(0)
      const [started, setStarted] = useState(false)   // flips true on the probeStart event (before any visit)
      const uiLog = ev => coreUtils.studioUiLogger?.info?.(ev, {}, { ctx: coreUtils.studioLoggerCtx })   // harvestable via window.jbLoggers; domainLogger.info needs {ctx}
      useEffect(() => {
        uiLog({ t: 'visitsProgress subscribe', seed, probed, buffered: coreUtils.lastProbeVisits })
        const fn = e => {
          uiLog({ t: 'visitsProgress progress', eventT: e?.t, visits: e?.visits })
          setCount(c => c + 1)
          if (e?.t === 'probeStart') setStarted(true)   // immediate "probe is alive" signal from runCircuit
          if (e?.t === 'visit') { coreUtils.lastProbeVisits = e.visits; setVisits(e.visits) }
        }
        coreUtils.eventEmitter.on('progress', fn)
        return () => {
          uiLog({ t: 'visitsProgress unsubscribe' })
          coreUtils.eventEmitter.off('progress', fn)
        }
      }, [])
      // probe emits per-tgpPath counts (visits keyed by full path like `comp<dsl>id~impl~...`).
      // UI aggregates: group paths by their comp (path.split('~')[0]), each group shows its per-path rows.
      const entries = Object.entries(visits)
      const total = entries.reduce((s, [, n]) => s + n, 0)
      const max = entries.reduce((m, [, n]) => Math.max(m, n), 1)
      const live = count > 0

      const groups = {}
      for (const [p, n] of entries) {
        const comp = p.split('~')[0]
        ;(groups[comp] = groups[comp] || []).push([p, n])
      }
      // sort groups by their busiest path desc; probed comp first
      const groupList = Object.entries(groups)
        .map(([comp, paths]) => ({ comp, paths: paths.sort((a, b) => b[1] - a[1]), sum: paths.reduce((s, [, n]) => s + n, 0) }))
        .sort((a, b) => (b.comp === probed) - (a.comp === probed) || b.sum - a.sum)

      const header = h('div:flex items-center justify-between mb-2', {},
        h('div:flex items-center gap-2', {},
          h('span:relative flex h-2 w-2', {},
            live && h('span:animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75', {}),
            h('span', { className: `relative inline-flex rounded-full h-2 w-2 ${live ? 'bg-emerald-500' : 'bg-gray-300'}` })
          ),
          h('span:text-xs font-semibold text-gray-700', {}, `Visited paths`),
          h('span:text-[10px] font-medium text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5 tabular-nums', {}, '' + entries.length)
        ),
        h('span:text-[10px] text-gray-400 tabular-nums', {}, `${total} visits`)
      )

      if (!entries.length)
        return h('div:w-full', {},
          header,
          h('div:text-gray-400 text-center text-xs py-6 flex flex-col items-center gap-1', {},
            h('span:inline-block h-4 w-4 border-2 border-gray-200 border-t-emerald-400 rounded-full animate-spin', {}),
            h('span', {}, started ? 'probe started, running the circuit…' : 'waiting for the probe to run…')
          )
        )

      // per comp-group: a small comp header, then each tgpPath as a row with a proportional bar (n/max).
      return h('div:w-full flex flex-col gap-2', {},
        header,
        ...groupList.map(({ comp, paths, sum }) => {
          const isProbed = comp === probed
          return h('div', {
            key: comp,
            className: `rounded-lg border overflow-hidden ${isProbed ? 'border-amber-300' : 'border-gray-100'}`
          },
            h('div:flex items-center justify-between px-2 py-1', {
              className: isProbed ? 'bg-amber-100' : 'bg-gray-50'
            },
              h('span:flex items-center gap-1.5 min-w-0', {},
                isProbed && h('span:text-[9px] font-bold uppercase tracking-wide text-amber-700 bg-amber-200 rounded px-1', {}, 'probed'),
                h('span:truncate text-xs font-semibold', {
                  className: isProbed ? 'text-amber-900' : 'text-gray-700',
                  title: comp
                }, comp.split('>').pop())
              ),
              h('span:tabular-nums text-[10px] text-gray-400 ml-2', {}, `${sum}`)
            ),
            h('div:flex flex-col divide-y divide-gray-50', {},
              ...paths.map(([p, n]) => {
                const suffix = p.slice(comp.length).replace(/^~/, '') || '(root)'
                const pct = Math.max(6, Math.round((n / max) * 100))
                return h('div:relative flex items-center overflow-hidden bg-white', { key: p },
                  h('div', {
                    className: `absolute inset-y-0 left-0 ${isProbed ? 'bg-amber-100' : 'bg-emerald-50'} transition-all duration-300 ease-out`,
                    style: { width: `${pct}%` }
                  }),
                  h('div:relative flex items-center justify-between w-full pl-3 pr-2 py-0.5', {},
                    h('span:truncate text-[11px] font-mono text-gray-600', { title: p }, suffix),
                    h('span:tabular-nums text-[10px] font-medium text-gray-500 ml-2', {}, '' + n)
                  )
                )
              })
            )
          )
        })
      )
    }
  })
})

// live probe-timeline stepper. Subscribes to eventEmitter 'progress' and accumulates {step:status}.
// resolveImports runs CLIENT-side in runProbeCli (before the client sends the /run-cli-stream HTTP) so its
// progress reaches this eventEmitter directly. imports/runCircuit originate in the spawned child
// (server-side) and stream back as stderr JSONL, re-emitted via dispatchChildLine → eventEmitter.
// spawn (~10ms) and calcCircuit (near-instant) are omitted - too fast to be worth a row.
const probeSteps = [
  ['resolveImports', 'resolve imports'],
  ['imports',        'loading imports'],
  ['runCircuit',     'run circuit']
]
const stageProgress = ReactComp('stageProgress', {
  impl: comp({
    hFunc: ({ }, { react: { h, useState, useEffect } }) => () => {
      // seed 'resolveImports' running so the stepper shows an active spinner from the true client-side start,
      // even before the real resolveImports event lands. real events overwrite it as they arrive.
      const [state, setState] = useState({ resolveImports: 'running' })
      const uiLog = ev => coreUtils.studioUiLogger?.info?.(ev, {}, { ctx: coreUtils.studioLoggerCtx })
      useEffect(() => {
        uiLog({ t: 'stageProgress subscribe' })
        const fn = e => {
          if (!e?.step) return
          uiLog({ t: 'stageProgress step', step: e.step, status: e.status || 'running' })
          // a later step arriving implies the previous ones are done
          setState(s => ({ ...s, [e.step]: e.status || 'running' }))
        }
        coreUtils.eventEmitter.on('progress', fn)
        return () => coreUtils.eventEmitter.off('progress', fn)
      }, [])
      return h('ul:flex flex-col gap-2', {}, ...probeSteps.map(([id, label]) => {
        const status = state[id]
        const done = status === 'done', running = status === 'running'
        const dot = done
          ? h('span:w-4 h-4 rounded-full bg-emerald-500 text-white text-[10px] flex items-center justify-center shrink-0', {}, '✓')
          : running
          ? h('span:w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0', {})
          : h('span:w-4 h-4 rounded-full bg-gray-200 shrink-0', {})
        const textCls = done ? 'text-gray-500' : running ? 'text-blue-700 font-medium' : 'text-gray-400'
        return h('li:flex items-center gap-3', { key: id }, dot,
          h('span:text-sm ' + textCls, {}, label))
      }))
    }
  })
})

ReactComp('loadingView', {
  impl: comp({
    hFunc: (ctx, { path, react: { h, hh } }) => ({ status }) => {
      return h('div:w-full h-full flex flex-col items-center bg-gradient-to-b from-gray-50 to-gray-100 py-8 px-4 overflow-auto', {},
        h('div:w-full max-w-md flex flex-col gap-4', {},
          // status card
          h('div:bg-white rounded-xl shadow-sm border border-gray-100 p-5', {},
            h('div:flex items-center gap-3', {},
              h('span:inline-block h-5 w-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin shrink-0', {}),
              h('div:min-w-0 flex-1', {},
                h('div:text-sm font-semibold text-gray-800 truncate', {}, status?.text || 'Running probe…'),
                h('div:text-xs text-gray-400 truncate font-mono mt-0.5', { title: path }, path)
              ),
              h('a:text-gray-400 hover:text-gray-700 transition-colors shrink-0',
                { href: location.href, target: '_blank', title: 'Open in new tab' },
                h('L:ExternalLink', { className: 'w-4 h-4' })
              )
            )
          ),
          // probe-timeline stepper card
          h('div:bg-white rounded-xl shadow-sm border border-gray-100 p-4', {},
            hh(ctx, stageProgress, {})
          ),
          // live visits card
          h('div:bg-white rounded-xl shadow-sm border border-gray-100 p-4', {},
            hh(ctx, visitsProgress, { probed: path?.split('~')[0] })
          )
        )
      )
    }
  })
})

ReactComp('cmdErrorView', {
  impl: comp({
    hFunc: ({ }, { error, cmd, react: { h } }) => () => {
      return h('div:w-full h-96 flex items-center justify-center bg-red-50 flex-col', {},
        h('div:text-center', {},
          h('h3:text-lg font-semibold text-red-800 mb-4', {}, 'Probe Error'),
          h('div:bg-white p-4 rounded border', {},
            h('pre:text-xs text-red-700 overflow-auto', {}, typeof error === 'string' ? error : JSON.stringify(error, null, 2))
          ),
          h('button:bg-blue-600 text-white px-4 py-2 rounded mt-4', { onClick: () => window.location.reload() }, 'Retry')
        ),
        h('a:text-xs mt-2', { href: location.href }, 'Browser'),
        cmd && h('pre:bg-gray-900 text-green-400 p-3 rounded text-xs overflow-auto max-h-64 font-mono border border-gray-600 whitespace-pre-wrap mt-3', {}, `$ ${cmd}`)
      )
    },
    enrichCtx: Var('cmd', '%$top/cmd%'),
    metadata: [
      abbr('ERR'),
      matchData('%$error%'),
      priority(1)
    ]
  })
})

const probeResultView = ReactComp('probeResultView', {
  impl: comp({
    hFunc: (ctx, { probeRes, probePath, success, visits, totalTime, titleShort, allViews, react: { h, hh, useState } }) => () => {
      const [activeView, setActiveView] = useState(allViews.find(x => x.id == 'resultsView')?.id || allViews[0]?.id)

      const TabBtn = ({ id, abbr, isActive }) =>
        h('button:text-xs px-1 rounded', {
          className: (isActive ? 'bg-blue-100 ' : '') + 'text-gray-700 hover:text-gray-900',
          onClick: () => setActiveView(id)
        }, abbr)

      const headerLeft = h('div:flex items-center gap-2', {},
        success ? h('L:Check', { className: 'text-green-600' }) : h('L:X', { className: 'text-red-600' }),
        h('span:font-semibold', { className: !success ? 'text-red-800' : '' }, titleShort),
        h('span:text-gray-500', {}, `(${visits}v)`),
        totalTime != null && h('span:bg-blue-100 text-blue-700 px-1 rounded', {}, `${totalTime}ms`)
      )

      const headerRight = h('div:flex gap-1 items-center', {},
        ...allViews.map(v => h(TabBtn, { key: v.id, id: v.id, abbr: v.abbr, isActive: activeView === v.id })),
        h('a:text-xs px-1', { href: location.href }, h('L:RefreshCw', { className: 'w-3 h-3' }))
      )

      // Find active view component or dynamic module
      const activeComp = allViews.find(v => v.id === activeView)

      return h('div:w-full h-full flex flex-col overflow-auto bg-white border rounded shadow-sm text-xs', {},
        // Header
        h('div:sticky top-0 bg-white border-b px-3 py-2 flex items-center justify-between', {
          className: !success ? 'bg-red-50 border-red-200' : ''
        }, headerLeft, headerRight),

        h('div:text-xs text-gray-600 px-3 py-1 border-b truncate', { title: probePath }),

        // // Errors summary strip (when present)
        // (Array.isArray(probeRes?.errors) && probeRes.errors.length) && h('div:bg-red-50 border-l-2 border-red-500 px-3 py-1 text-red-700 max-h-[100px] overflow-auto', {},
        //   h('div:font-medium', {}, 'Errors'),
        //   h('pre:text-xs mb-1', {}, JSON.stringify(probeRes.errors, null, 1))
        // ),

        activeComp ? hh(ctx.setData(activeComp.data), activeComp.comp) : h('div:p-4 text-gray-400', {}, 'No view')
      )
    }
  })
})

/** ---------------- probe detail views ---------------- **/

ReactComp('resultsView', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh } }) => () => {
      const result = ctx.data
      if (!result?.length)
        return h('div:text-gray-500 text-center py-4', {}, 'No results')
      return h('div:p-3 flex flex-col overflow-auto', {},
        result.map(({ in: In, out }, i) => hh(ctx, codeMirrorInputOutput, { in: In, out, key: i }))
      )
    },
    metadata: [
      abbr('RES'),
      matchData('%$top/probeRes/result%'),
      priority(4)
    ]
  })
})

ReactComp('topView', {
  impl: comp({
    hFunc: (ctx, { react: { hh } }) => () => hh(ctx, codeMirrorJson, { json: ctx.data }),
    metadata: [
      abbr('ALL'),
      matchData('%$top%'),
      priority(5)
    ]
  })
})

// live visited-comps view: accumulates {compId: count} from eventEmitter 'visit' progress events
// (emitted by Probe.record via cliLogger.progress). Seeds from the final probeRes.visits (grouped by
// comp) so it also renders correctly on a completed/replayed probe. ctx.data is the visits {path:count} map.
// post-run VIS tab: seeds visitsProgress from the final probeRes.visits (grouped by comp). ctx.data is the
// visits {path:count} map. The shared visitsProgress also keeps listening, so a re-run updates it live too.
ReactComp('visitsProgressView', {
  impl: comp({
    hFunc: (ctx, { probePath, react: { h, hh } }) => () => {
      // ctx.data is the raw probeRes.visits (tgpPath→count). visitsProgress aggregates by comp itself.
      return h('div:p-3', {}, hh(ctx, visitsProgress, { seed: ctx.data || {}, probed: probePath?.split('~')[0] }))
    },
    metadata: [
      abbr('VIS'),
      matchData('%$top/probeRes/visits%'),
      priority(4.5)
    ]
  })
})

function summarizeRecord(record, keepPrefixSize = 1000, maxLength = 4000) {
  const text = record ? JSON.stringify(record) : ''
  if (text.length <= maxLength) return record
  const suffixSize = maxLength - keepPrefixSize
  return {
    __squeezed: true, summary: text.slice(0, keepPrefixSize) +
      `====text was originally ${text.length} and was squeezed to ${maxLength} chars. ${text.length - maxLength} missing chars here====` + text.slice(text.length - suffixSize)
  }
}

function squeezeArray(arr, k = 10) {
  if (arr.length <= k * 2) return arr
  const mid = arr.length - k * 2
  return [...arr.slice(0, k), `${mid} items were here`, ...arr.slice(-k)]
}

function squeezeLogEntries(obj, parent, keepPrefixSize = 1000, maxLength = 2000) {
  if (typeof obj !== 'object' || obj === null) return obj
  const out = Array.isArray(obj) ? [] : {}
  for (const [key, value] of Object.entries(obj)) {
    let v = value
    if (/[lL]og/.test(parent || ''))
      v = Array.isArray(value) ? value.map(e => summarizeRecord(e, keepPrefixSize, maxLength)) : summarizeRecord(value, keepPrefixSize, maxLength)
    // else if (/room/.test(key) && Array.isArray(value))
    //   v = squeezeArray(value)
    if (typeof value === 'object' && value !== null)
      v = squeezeLogEntries(value, key, keepPrefixSize, maxLength)
    out[key] = v
  }
  return out
}

function summarizeRecord1(record) { // reuslt.in.vars.workflowDb
  const text = record ? JSON.stringify(record) : ''
  const keepPrefixSize = 1000
  const maxLength = 2000
  return {
    summary: (text.length > maxLength) ? [text.slice(0, keepPrefixSize),
    `====text was originally ${text.length}.and was squeezed to ${maxLength} chars. ${text.length - maxLength} missing chars here====`,
    text.slice(text.length - maxLength + keepPrefixSize)
    ].join('') : text
  }
}

function print(v) {
  return typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)
}

const CM6_IMPORT = '@jb6/react/lib/codemirror6/codemirror6-bundle.mjs'

function createCm6Editor(parent, text, extraExtensions = []) {
  const { EditorState, EditorView, javascript, lineNumbers, syntaxHighlighting, defaultHighlightStyle, foldGutter, foldAll, unfoldAll, search, openSearchPanel, keymap } = jb.reactRepository.importCache[CM6_IMPORT]
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: text,
      extensions: [
        lineNumbers(), foldGutter(), syntaxHighlighting(defaultHighlightStyle), javascript(), search(),
        keymap.of([{ key: 'Ctrl-f', run: openSearchPanel }, { key: 'Ctrl-]', run: foldAll }, { key: 'Ctrl-[', run: unfoldAll }]),
        EditorState.readOnly.of(true),
        EditorView.theme({ '&': { height: '100%', fontSize: '12px' }, '.cm-scroller': { overflow: 'auto' }, '.cm-content': { fontFamily: 'monospace' } }),
        ...extraExtensions
      ]
    })
  })
  return view
}

function updateCm6Editor(view, text) {
  const current = view.state.doc.toString()
  if (current !== text) view.dispatch({ changes: { from: 0, to: current.length, insert: text } })
}

const codeMirrorJson = ReactComp('codeMirrorJson', {
  impl: comp({
    hFunc: ({ }, { react: { h, useRef, useEffect } }) => ({ json, foldAll: shouldFoldAll }) => {
      if (coreUtils.isNode)
        return h('textarea:h-full w-full font-mono text-xs p-2 border rounded bg-gray-50', { readOnly: true, value: print(json) })

      const host = useRef()
      const viewRef = useRef()

      useEffect(() => {
        if (!host.current || viewRef.current) return
        viewRef.current = createCm6Editor(host.current, print(json))
        if (shouldFoldAll) jb.reactRepository.importCache[CM6_IMPORT].foldAll(viewRef.current)
        return () => { viewRef.current?.destroy(); viewRef.current = null }
      }, [])

      useEffect(() => {
        if (!viewRef.current) return
        updateCm6Editor(viewRef.current, print(json))
        if (shouldFoldAll) jb.reactRepository.importCache[CM6_IMPORT].foldAll(viewRef.current)
      }, [json])

      return h('div:h-full', { ref: host })
    },
    metadata: importUrl(CM6_IMPORT)
  })
})

const codeMirrorInputOutput = ReactComp('codeMirrorInputOutput', {
  impl: comp({
    hFunc: ({ }, { react: { h, useRef, useEffect } }) => ({ in: In, out }) => {
      const format = v => print(v)
      const inputData = In?.data ?? In

      if (coreUtils.isNode) {
        return h('div:flex flex-1 min-h-96 border rounded p-2 mb-2 gap-2', {},
          h('div:flex-1 flex flex-col', {},
            h('span:font-medium text-gray-600 mb-1', {}, 'Input:'),
            h('textarea:flex-1 font-mono text-xs p-2 border rounded bg-gray-50', { readOnly: true, value: format(inputData) })
          ),
          h('div:flex-1 flex flex-col', {},
            h('span:font-medium text-gray-600 mb-1', {}, 'Output:'),
            h('textarea:flex-1 font-mono text-xs p-2 border rounded bg-gray-50', { readOnly: true, value: format(out) })
          )
        )
      }

      const { html: htmlLang } = jb.reactRepository.importCache[CM6_IMPORT]
      const isHtml = v => typeof v === 'string' && /^\s*</.test(v)
      const inputHost = useRef(), outputHost = useRef(), inputView = useRef(), outputView = useRef()

      useEffect(() => {
        if (inputHost.current && !inputView.current)
          inputView.current = createCm6Editor(inputHost.current, format(inputData), isHtml(inputData) ? [htmlLang()] : [])
        if (outputHost.current && !outputView.current)
          outputView.current = createCm6Editor(outputHost.current, format(out), isHtml(out) ? [htmlLang()] : [])
        return () => {
          inputView.current?.destroy(); inputView.current = null
          outputView.current?.destroy(); outputView.current = null
        }
      }, [In, out, inputData])

      return h('div:flex flex-1 min-h-96 border rounded p-2 mb-2 gap-2', {},
        h('div:flex-1 flex flex-col min-w-0', {},
          h('span:font-medium text-gray-600 mb-1', {}, 'Input:'),
          h('div:flex-1 overflow-hidden', { ref: inputHost })
        ),
        h('div:flex-1 flex flex-col min-w-0', {},
          h('span:font-medium text-gray-600 mb-1', {}, 'Output:'),
          h('div:flex-1 overflow-hidden', { ref: outputHost })
        )
      )
    },
    metadata: importUrl(CM6_IMPORT)
  })
})
