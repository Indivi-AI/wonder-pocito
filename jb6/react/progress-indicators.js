import { jb, coreUtils, dsls } from '@jb6/core'
import { reactUtils } from './react-utils.js'

const { tgp: { Component } } = dsls
const { h, hh, L } = reactUtils

// progress-indicator<react> built-ins. RT: (ctx) => () => vdom
// Mounted only during the enrichCtx wait of react-comp.comp. Unmounted on resolve.

Component('spinner', {
  type: 'progress-indicator<react>',
  description: 'classic Lucide loader spinning. No events.',
  impl: ctx => () => {
    const {react: {useEffect}, uiLogger} = ctx.vars
    useEffect(() => { uiLogger?.info?.({t: 'progress.mount', indicator: 'spinner'}, {}, {ctx}) }, [])
    return h('div:flex items-center justify-center h-full w-full', {},
      h(L('Loader'), { className: 'animate-spin w-4 h-4' }))
  }
})

Component('dots', {
  type: 'progress-indicator<react>',
  description: 'time-based animated dots, no events required',
  params: [
    {id: 'title', as: 'string', defaultValue: 'Loading'},
    {id: 'dotsPerSec', as: 'number', defaultValue: 2}
  ],
  impl: (ctx, {react: {useState, useEffect}, uiLogger}, {title, dotsPerSec}) => () => {
    const [n, setN] = useState(0)
    useEffect(() => {
      uiLogger?.info?.({t: 'progress.mount', indicator: 'dots', title}, {}, {ctx})
      const id = setInterval(() => setN(x => (x+1) % 4), 1000 / (dotsPerSec || 2))
      return () => clearInterval(id)
    }, [])
    return h('div', {}, title + '.'.repeat(n))
  }
})

const byProgress = Component('byProgress', {
  type: 'progress-indicator<react>',
  description: 'subscribes to coreUtils.eventEmitter and shows progress events',
  params: [
    {id: 'title', as: 'string', defaultValue: 'Loading'},
    {id: 'hFunc', type: 'progress-hfunc<react>', dynamic: true, byName: true, defaultValue: {$: 'progress-hfunc<react>text'}},
    {id: 'filter', dynamic: true, byName: true, defaultValue: true, description: '(progressEvent) => boolean; default: accept all'},
  ],
  impl: (ctx, {react: {useState, useEffect}, uiLogger}, {title, filter, hFunc: hFuncF}) => () => {
    const hFunc = hFuncF(ctx)
    const [progressEvent, setEvent] = useState(null)
    useEffect(() => {
      uiLogger?.info?.({t: 'progress.mount', indicator: 'byProgress', title}, {}, {ctx})
      const fn = e => {
        if (filter && !filter(ctx.setVars({progressEvent: e}))) return
        uiLogger?.info?.({t: 'progress.event', indicator: 'byProgress', event: e}, {}, {ctx})
        setEvent(e)
      }
      coreUtils.eventEmitter.on('progress', fn)
      return () => coreUtils.eventEmitter.off('progress', fn)
    }, [])
    if (progressEvent == null) return h('div', {}, title)
    return hh(ctx, hFunc, {progressEvent})
  }
})

// byStatus is byProgress with a built-in status filter
Component('byStatus', {
  type: 'progress-indicator<react>',
  description: 'byProgress filtered to status-flagged events',
  params: [
    {id: 'title', as: 'string', defaultValue: 'Loading'},
    {id: 'hFunc', type: 'progress-hfunc<react>', dynamic: true, byName: true, defaultValue: {$: 'progress-hfunc<react>text'}}
  ],
  impl: byProgress({
    title: '%$title%',
    filter: '%$progressEvent.status%',
    hFunc: '%$hFunc()%'
  })
})

// progress-hfunc<react> renderers. RT: (ctx) => ({progressEvent}) => vdom

Component('text', {
  type: 'progress-hfunc<react>',
  description: 'renders progressEvent.t',
  impl: ({}, {react: {h}}) => ({progressEvent}) => h('div', {}, progressEvent?.t ?? '')
})

Component('textWithPct', {
  type: 'progress-hfunc<react>',
  description: 'renders "t — pct%"',
  impl: ({}, {react: {h}}) => ({progressEvent}) =>
    h('div', {}, `${progressEvent?.t ?? ''} — ${progressEvent?.pct ?? 0}%`)
})

Component('progressBar', {
  type: 'progress-hfunc<react>',
  description: 'horizontal bar reading progressEvent.pct',
  impl: ({}, {react: {h}}) => ({progressEvent}) =>
    h('div:bg-gray-200 h-2 w-full', {},
      h('div:bg-blue-500 h-2', {style: {width: `${progressEvent?.pct ?? 0}%`}}))
})

Component('stepper', {
  type: 'progress-indicator<react>',
  description: 'accumulates progress events keyed by .step and renders a vertical checklist',
  params: [
    {id: 'title', as: 'string', defaultValue: 'Loading'},
    {id: 'steps', as: 'string', description: 'comma-delimited expected step ids in order'},
    {id: 'labels', as: 'string', description: 'comma-delimited friendly labels (parallel to steps)'}
  ],
  impl: (ctx, {react: {useState, useEffect}, uiLogger}, {title, steps, labels}) => () => {
    const stepIds = (steps || '').split(',').map(s => s.trim()).filter(Boolean)
    const staticLabels = (labels || '').split(',').map(s => s.trim())
    const [state, setState] = useState({})
    const [plan, setPlan] = useState(null)   // runtime-announced plan (stepPlan) fixes the denominator from event #1 when steps aren't known at mount
    useEffect(() => {
      uiLogger?.info?.({t: 'progress.mount', indicator: 'stepper', title}, {}, {ctx})
      const fn = e => {
        if (e?.stepPlan) return setPlan({ids: e.stepPlan.map(String), labels: e.stepLabels || []})
        if (e?.step != null) setState(s => ({...s, [e.step]: e.status || 'running'}))
      }
      coreUtils.eventEmitter.on('progress', fn)
      return () => coreUtils.eventEmitter.off('progress', fn)
    }, [])
    const ids = stepIds.length ? stepIds : plan ? plan.ids : Object.keys(state)
    const labelArr = stepIds.length ? staticLabels : plan ? plan.labels : []
    const doneCount = ids.filter(id => state[id] === 'done').length
    const runningCount = ids.filter(id => state[id] === 'running').length
    const pct = ids.length ? Math.round(100 * (doneCount + runningCount * 0.5) / ids.length) : 0
    return h('div:max-w-md mx-auto mt-10 p-6 bg-white rounded-xl shadow-md border border-gray-100 font-sans', {},
      h('div:flex items-center justify-between mb-4', {},
        h('h2:text-base font-semibold text-gray-800', {}, title),
        h('span:text-xs text-gray-400 tabular-nums', {}, pct + '%')),
      h('div:bg-gray-100 h-1.5 rounded-full overflow-hidden mb-5', {},
        h('div:bg-indigo-500 h-full transition-all duration-300', {style: {width: pct + '%'}})),
      h('ul:space-y-2', {}, ...ids.map((id, i) => {
        const status = state[id]
        const done = status === 'done'
        const running = status === 'running'
        const error = status === 'error'
        const dot = error
          ? h('span:w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center', {}, '×')
          : done
          ? h('span:w-4 h-4 rounded-full bg-green-500 text-white text-[10px] flex items-center justify-center', {}, '✓')
          : running
          ? h('span:w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin', {})
          : h('span:w-4 h-4 rounded-full bg-gray-200', {})
        const textCls = error ? 'text-red-700 font-medium' : done ? 'text-gray-500' : running ? 'text-indigo-700 font-medium' : 'text-gray-400'
        return h('li:flex items-center gap-3', {}, dot,
          h('span:text-sm ' + textCls, {}, labelArr[i] || id))
      })))
  }
})
