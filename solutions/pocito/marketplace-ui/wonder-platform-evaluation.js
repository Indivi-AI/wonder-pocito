import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformEvaluation', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({repo, search, setSearch, openSet, createSet, runningSet, runSet}) => {
      const {classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const sets = repo.evaluations.filter(item => !search || `${item.name} ${item.desc}`.includes(search))
      const lastRun = evaluation => repo.evalRuns.filter(run => run.evaluationId == evaluation.id).sort((a, b) => b.startedAt - a.startedAt)[0]
      const target = evaluation => [...repo.agents, ...repo.plugins, ...repo.subagents].find(item => item.id == evaluation.targetId)
        || [...repo.plugins, ...repo.subagents, ...repo.agents].find(item => item.evaluationId == evaluation.id)
      const card = evaluation => {
        const run = lastRun(evaluation), linkedTarget = target(evaluation), running = runningSet == evaluation.id
        return h(`article:${classes.card} flex flex-col`, {key: evaluation.id}, h('div:flex items-start justify-between gap-3', {}, h(
          'div:min-w-0', {}, h('h2:text-[15px] font-semibold', {}, evaluation.name), h(
            'p:mt-1 line-clamp-2 text-[13px] leading-5 text-[#6b6b6f]', {}, evaluation.desc || 'ללא תיאור')),
          h(`span:${classes.chip}`, {}, run?.status || 'טרם הורץ')),
        h('div:mt-5 grid grid-cols-2 gap-3 text-xs', {}, h('div', {}, h('span:block text-[#9b9ba0]', {}, 'תרחישים'), h(
          'b:mt-1 block', {}, evaluation.rows.length)), h('div', {}, h('span:block text-[#9b9ba0]', {}, 'סוכן'), h(
          'b:mt-1 block truncate', {}, linkedTarget?.name || 'טרם נבחר'))),
        h('div:mt-auto flex items-center gap-2 pt-5', {}, h(`button:${classes.button} flex-1`, {onClick: () => openSet(evaluation)}, 'עריכה'), h(
          `button:${classes.primary} flex-1`, {disabled: !linkedTarget || running, onClick: () => runSet(evaluation, linkedTarget)},
          running ? 'מריץ…' : 'הרצה')))
      }
      return h('main:min-h-screen overflow-x-hidden px-5 pb-24 pt-8 sm:mr-[248px] sm:px-10', {}, h('div:mx-auto max-w-6xl', {},
        h('div:flex flex-wrap items-start justify-between gap-4', {}, h('div', {}, h('h1:text-2xl font-bold', {}, 'סטי אבלואציה'),
          h('p:mt-2 text-sm text-[#6b6b6f]', {}, 'הגדירו תרחישים, בחרו סוכן והריצו בדיקה במקום אחד.')),
        h(`button:${classes.primary}`, {onClick: createSet}, h('L:Plus', {size: 15}), 'בדיקה חדשה')),
      h('div:mt-7 flex items-center gap-3', {}, h('div:relative max-w-md flex-1', {}, h('L:Search', {
        size: 16, className: 'absolute right-3 top-3 text-[#6b6b6f]'}), h('input:w-full rounded-xl border border-[#e8e8ea] bg-white py-2.5 ' +
          'pl-3 pr-9 text-sm outline-none', {value: search, placeholder: 'חיפוש בדיקות…', onInput: event => setSearch(event.target.value)})),
      h('span:text-xs text-[#6b6b6f]', {}, `${sets.length} בדיקות`)), sets.length ? h(
        'div:mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3', {}, sets.map(card)) : h(
        'div:mt-5 rounded-2xl border border-dashed border-[#d8d8dc] p-12 text-center', {}, h(
          'L:SquareCheckBig', {size: 28, className: 'mx-auto mb-3 text-[#6b6b6f]'}), h('b:block', {}, 'אין בדיקות להצגה'), h(
          'p:mt-1 text-sm text-[#6b6b6f]', {}, search ? 'נסו חיפוש אחר' : 'צרו בדיקה ראשונה לסוכן'))))
    }
  })
})
