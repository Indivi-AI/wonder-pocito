import { dsls } from '@jb6/core'
import '@wonder/applets/applet.js'

const { react: { ReactComp, 'react-comp': { comp }, 'react-metadata': { applet } } } = dsls
const stores = ['כל הסניפים', 'דיזנגוף', 'קניון הזהב', 'אילת']
const departments = ['כל המחלקות', 'נשים', 'גברים', 'ילדים', 'אביזרים']
const playbook = ['מה היו המכירות והרווח הגולמי?', 'אילו סניפים השתפרו מול התקופה הקודמת?', 'מה המחלקה החלשה ביותר ולמה?', 'מצא חריגות במכירות היומיות']
const filterLines = f => [`תאריכים: ${f.from} עד ${f.to}`, `סניף: ${f.store}`, `מחלקה: ${f.department}`]
const withFilters = (q, f) => `ענה בעברית על בסיס המסננים הקבועים: ${filterLines(f).join(' | ')}. השאלה: ${q}`
const controlCls = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2'

ReactComp('persistentFiltersDemoApplet', {
  impl: comp({
    hFunc: ({}, { react: { h, useState } }) => () => {
      const [filters, setFilters] = useState({ from: '2026-06-01', to: '2026-06-30', store: stores[0], department: departments[0] })
      const [sent, setSent] = useState([]), [custom, setCustom] = useState('')
      const set = k => e => setFilters(f => ({ ...f, [k]: e.target.value }))
      const send = q => q.trim() && (setSent(xs => [withFilters(q.trim(), filters), ...xs]), setCustom(''))
      const input = (label, key, type = 'date') => h('label:text-sm font-medium', {}, label, h(`input:${controlCls}`, { type, value: filters[key], onInput: set(key) }))
      const select = (label, key, options) => h('label:text-sm font-medium', {}, label, h(`select:${controlCls}`, { value: filters[key], onInput: set(key) }, options.map(x => h('option', { key: x }, x))))
      const btn = q => h('button:rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-700', { key: q, onClick: () => send(q) }, q)
      return h('main:min-h-screen overflow-x-hidden bg-slate-50 text-slate-900 p-4 sm:p-8', { dir: 'rtl' },
        h('div:mx-auto max-w-5xl space-y-6', {},
          h('section:space-y-4', {},
            h('div:flex items-center gap-3', {}, h('L:SlidersHorizontal', { size: 24 }), h('h1:text-2xl font-semibold', {}, 'דמו מסננים עקביים')),
            h('div:grid gap-3 sm:grid-cols-4', {},
              input('מתאריך', 'from'), input('עד תאריך', 'to'), select('סניף', 'store', stores), select('מחלקה', 'department', departments)),
            h('div:flex flex-wrap gap-2', {}, filterLines(filters).map(x => h('span:rounded-full bg-white border border-slate-200 px-3 py-1 text-sm', { key: x }, x)))),
          h('section:space-y-3', {},
            h('h2:text-lg font-semibold', {}, 'כפתורי התחלה'),
            h('div:flex flex-wrap gap-2', {}, playbook.map(btn)),
            h('div:flex flex-col gap-2 sm:flex-row', {},
              h(`input:flex-1 min-w-0 ${controlCls}`, { value: custom, placeholder: 'שאלה חופשית עם אותם מסננים...', onInput: e => setCustom(e.target.value), onKeyDown: e => e.key === 'Enter' && send(custom) }),
              h('button:rounded-lg bg-emerald-700 px-4 py-2 text-white disabled:bg-slate-300', { disabled: !custom.trim(), onClick: () => send(custom) }, 'שלח'))),
          h('section:space-y-3', {},
            h('h2:text-lg font-semibold', {}, 'שאלות שנשלחו עם המסננים'),
            sent.length ? sent.map((q, i) => h('pre:whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6', { key: i }, q)) : h('div:rounded-lg border border-dashed border-slate-300 bg-white p-4 text-slate-500', {}, 'עדיין לא נשלחה שאלה.'))))
    },
    metadata: applet({ title: 'דמו מסננים עקביים', icon: 'SlidersHorizontal', showMessageInput: false, showOnMainPageMenu: true })
  })
})
