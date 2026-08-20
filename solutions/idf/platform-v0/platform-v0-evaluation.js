import { dsls } from '@jb6/core'
import '@jb6/react'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('PlatformV0Evaluation', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({evaluations, setEvaluations}) =>
      h('main:min-h-screen overflow-x-hidden px-5 pb-24 pt-8 sm:mr-[210px] sm:px-10', {}, h('div:mx-auto max-w-5xl', {},
        h('div:flex items-start justify-between gap-4', {}, h('div', {}, h('h1:text-2xl font-bold text-[#202724]', {}, 'אבלואציה'),
          h('p:mt-2 text-sm text-[#929995]', {}, 'מדדי איכות והרצות בדיקה לפלאגינים הפעילים.')),
          h('button:rounded-xl bg-[#2f6b4b] px-4 py-2.5 text-sm font-semibold text-white', {
            onClick: () => setEvaluations(items => items.map(item => ({...item, runs: item.runs + 1})))
          }, 'הרצת אבלואציה')),
        h('div:mt-7 grid grid-cols-1 gap-4 md:grid-cols-3', {}, evaluations.map(item =>
          h('article:rounded-2xl border border-[#e3e7e4] bg-white p-5', {key: item.name},
            h('div:text-sm font-semibold text-[#323a36]', {}, item.name),
            h('div:mt-4 text-4xl font-bold text-[#2f6b4b]', {}, `${item.score}%`),
            h('div:mt-3 h-2 overflow-hidden rounded-full bg-[#eef1ef]', {},
              h('div:h-full rounded-full bg-[#5d8a70]', {style: {width: `${item.score}%`}})),
            h('div:mt-3 text-xs text-[#9da39f]', {}, `${item.runs} הרצות`))))))
  })
})
