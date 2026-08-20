import { dsls } from '@jb6/core'
import '@jb6/react'
import './platform-v0-model.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('PlatformV0Evaluation', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => {
      const {classes} = dsls.common.data.platformV0Config.$run()
      return ({catalog, search, setSearch, openSet, createSet, runningSet, runSet}) => {
        const sets = (catalog.evalSets || []).filter(set => !search || `${set.title} ${set.description}`.includes(search))
        const headers = ['שם הסט', 'רשומות', 'הרצה אחרונה', 'פלאגין', 'סטטוס', '']
        const runTime = run => run.startedAt || +(run.name.match(/\d{10,}/)?.[0] || 0)
        const lastRun = set => catalog.evalRuns?.filter(run => run.set == set.name).sort((a, b) => runTime(a) - runTime(b)).at(-1)
        const target = set => catalog.plugins?.find(plugin => plugin.evalSet == set.name)
        const setRow = set => {
          const run = lastRun(set), plugin = target(set), cell = (label, content) => h('div:flex items-center justify-between gap-3 md:block', {},
            h('span:text-xs text-[#8b948f] md:hidden', {}, label), content)
          return h('div:grid grid-cols-1 items-center gap-3 border-t border-[#edf0ee] px-4 py-4 md:grid-cols-[2fr_80px_140px_1.4fr_90px_100px]', {
            key: set.name}, h('button:text-right', {onClick: () => openSet(set)}, h('b:block text-sm', {}, set.title),
            h('small:text-[#8b948f]', {}, set.description)), cell('רשומות', h('span:text-sm', {}, set.rows?.length || 0)),
            cell('הרצה אחרונה', h('span:text-xs', {}, run?.started || '—')), cell('פלאגין', h('span:text-sm', {}, plugin?.title || '—')),
            cell('סטטוס', h(`span:${classes.chip}`, {}, run?.status || 'טרם הורץ')), h(`button:${classes.button}`, {
              disabled: !plugin || runningSet == set.name, onClick: () => runSet(set, plugin)}, runningSet == set.name ? 'מריץ…' : 'הרצה'))
        }
        return h('main:min-h-screen overflow-x-hidden px-5 pb-24 pt-8 sm:mr-[210px] sm:px-10', {}, h('div:mx-auto max-w-6xl', {},
          h('div:flex flex-wrap items-start justify-between gap-4', {}, h('div', {}, h('h1:text-2xl font-bold', {}, 'סטי אבלואציה'),
            h('p:mt-2 text-sm text-[#929995]', {}, 'ספרייה של תרחישי בדיקה, לשימוש חוזר מכל פלאגין.')),
          h(`button:${classes.primary}`, {onClick: createSet}, h('L:Plus', {size: 15}), 'סט חדש')),
          h('div:mt-7 flex items-center gap-3', {}, h('div:relative max-w-md flex-1', {},
            h('L:Search', {size: 16, className: 'absolute right-3 top-3 text-[#a1a7a4]'}),
            h('input:w-full rounded-xl border border-[#e2e6e3] bg-white py-2.5 pl-3 pr-9 text-sm outline-none', {
              value: search, placeholder: 'חיפוש לפי כותרת…', onInput: event => setSearch(event.target.value)})),
            h('span:text-xs text-[#9da39f]', {}, `${sets.length} סטים`)),
          h('div:mt-5 rounded-2xl border border-[#e2e7e4] bg-white', {}, h('div:hidden grid-cols-[2fr_80px_140px_1.4fr_90px_100px] ' +
            'gap-3 bg-[#f7f9f8] px-4 py-3 text-xs text-[#8b948f] md:grid', {}, ...headers.map(value => h('span', {key: value}, value))),
          sets.map(setRow))))
      }
    }
  })
})
