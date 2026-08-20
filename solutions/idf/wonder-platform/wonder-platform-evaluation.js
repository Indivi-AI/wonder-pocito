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
      const target = evaluation => repo.plugins.find(plugin => plugin.evaluationId == evaluation.id)
        || repo.subagents.find(agent => agent.evaluationId == evaluation.id)
      const row = evaluation => {
        const run = lastRun(evaluation), linkedTarget = target(evaluation), cell = (label, content) => h(
          'div:flex items-center justify-between gap-3 md:block', {}, h('span:text-xs text-[#8b948f] md:hidden', {}, label), content)
        return h('div:grid grid-cols-1 items-center gap-3 border-t border-[#edf0ee] px-4 py-4 md:grid-cols-[2fr_80px_140px_1.4fr_90px_100px]', {
          key: evaluation.id}, h('button:text-right', {onClick: () => openSet(evaluation)}, h('b:block text-sm', {}, evaluation.name),
        h('small:text-[#8b948f]', {}, evaluation.desc)), cell('רשומות', h('span:text-sm', {}, evaluation.rows.length)),
        cell('הרצה אחרונה', h('span:text-xs', {}, run?.started || '—')), cell('יעד', h('span:text-sm', {}, linkedTarget?.name || '—')),
        cell('סטטוס', h(`span:${classes.chip}`, {}, run?.status || 'טרם הורץ')), h(`button:${classes.button}`, {
          disabled: !linkedTarget || runningSet == evaluation.id, onClick: () => runSet(evaluation, linkedTarget)},
          runningSet == evaluation.id ? 'מריץ…' : 'הרצה'))
      }
      return h('main:min-h-screen overflow-x-hidden px-5 pb-24 pt-8 sm:mr-[210px] sm:px-10', {}, h('div:mx-auto max-w-6xl', {},
        h('div:flex flex-wrap items-start justify-between gap-4', {}, h('div', {}, h('h1:text-2xl font-bold', {}, 'סטי אבלואציה'),
          h('p:mt-2 text-sm text-[#929995]', {}, 'ספרייה של תרחישי בדיקה, לשימוש חוזר מכל פלאגין או סאב-אייג׳נט.')),
        h(`button:${classes.primary}`, {onClick: createSet}, h('L:Plus', {size: 15}), 'סט חדש')),
      h('div:mt-7 flex items-center gap-3', {}, h('div:relative max-w-md flex-1', {}, h('L:Search', {
        size: 16, className: 'absolute right-3 top-3 text-[#a1a7a4]'}), h('input:w-full rounded-xl border border-[#e2e6e3] bg-white py-2.5 ' +
          'pl-3 pr-9 text-sm outline-none', {value: search, placeholder: 'חיפוש לפי כותרת…', onInput: event => setSearch(event.target.value)})),
      h('span:text-xs text-[#9da39f]', {}, `${sets.length} סטים`)), h('div:mt-5 rounded-2xl border border-[#e2e7e4] bg-white', {},
        h('div:hidden grid-cols-[2fr_80px_140px_1.4fr_90px_100px] gap-3 bg-[#f7f9f8] px-4 py-3 text-xs text-[#8b948f] md:grid', {},
          ...['שם הסט', 'רשומות', 'הרצה אחרונה', 'יעד', 'סטטוס', ''].map(title => h('span', {key: title}, title))), sets.map(row))))
    }
  })
})
