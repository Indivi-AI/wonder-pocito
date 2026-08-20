import { dsls } from '@jb6/core'
import '@jb6/react'
import './platform-v0-model.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('PlatformV0Marketplace', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => {
      const {resources} = dsls.common.data.platformV0Config.$run()
      return ({view, catalog, search, setSearch, setDraft, deleteResource}) => {
        const resourceConfig = resources[view], items = (catalog?.[view] || []).filter(item =>
          !search || `${item.title} ${item.description}`.includes(search))
        const resourceCard = item => h('article:rounded-2xl border border-[#e4e8e5] bg-white p-5 shadow-[0_1px_2px_rgba(30,50,40,.04)]', {
          key: item.name, onClick: () => setDraft({...item, resource: view, originalName: item.name})
        }, h('div:flex items-start gap-3', {},
          h('div:grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#dbe7df] bg-[#edf6f0] text-sm font-bold text-[#285a40]', {},
            item.title?.slice(0, 2)),
          h('div:min-w-0 flex-1', {}, h('div:flex items-center gap-2', {},
            h('h3:truncate text-base font-bold text-[#202724]', {}, item.title),
            h('span:rounded border border-[#e6e9e7] px-1.5 py-0.5 text-[10px] text-[#9aa19d]', {}, item.version || 'V0'),
            resourceConfig.verified && h('span:flex items-center gap-1 text-[10px] font-semibold text-[#2f6b4b]', {},
              h('L:BadgeCheck', {size: 12}), 'מאומת')),
            h('div:mt-0.5 text-xs text-[#a1a7a4]', {}, resourceConfig.typeLabel || resourceConfig.title)),
          h('button:rounded-lg p-1.5 text-[#a5aaa7] hover:bg-red-50 hover:text-red-600', {
            onClick: event => (event.stopPropagation(), deleteResource(view, item.name)), 'aria-label': `מחיקת ${item.title}`
          }, h('L:Trash2', {size: 15}), h('span:sr-only', {}, `מחיקת ${item.title}`))),
          h('p:mt-4 min-h-10 text-sm leading-6 text-[#68706c]', {}, item.description),
          view == 'plugins' && h('div:mt-4 flex flex-wrap gap-2 text-[11px] text-[#59615d]', {},
            h('span:rounded-full bg-[#f1f3f2] px-2.5 py-1', {}, `${item.skills || 0} מיומנויות`),
            h('span:rounded-full bg-[#f1f3f2] px-2.5 py-1', {}, `${item.tools || 0} כלים ישירים`),
            h('span:rounded-full border border-[#dfe4e1] px-2.5 py-1', {}, `${item.agents || 0} סאב-אייג׳נטים`)),
          h('div:mt-4 border-t border-dashed border-[#edf0ee] pt-3 text-[11px] text-[#a3a9a6]', {}, `עודכן ${item.updated || 'עכשיו'}`))
        return h('main:min-h-screen overflow-x-hidden px-5 pb-24 pt-8 sm:mr-[210px] sm:px-10 sm:pb-10', {},
          h('div:mx-auto max-w-6xl', {}, h('div:flex flex-wrap items-start justify-between gap-4', {},
            h('div', {}, h('div:flex items-center gap-2', {}, h(`L:${resourceConfig.icon}`, {size: 21, className: 'text-[#2f6b4b]'}),
              h('h1:text-2xl font-bold text-[#202724]', {}, resourceConfig.title)),
              h('p:mt-2 text-sm text-[#929995]', {}, resourceConfig.subtitle)),
            h('button:inline-flex items-center gap-2 rounded-xl bg-[#2f6b4b] px-4 py-2.5 text-sm font-semibold text-white shadow-sm', {
              onClick: () => setDraft({resource: view, title: '', name: '', description: '', version: 'V0'})
            }, h('L:Plus', {size: 16}), resourceConfig.createLabel)),
            h('div:mt-7 flex items-center gap-4', {}, h('div:relative max-w-md flex-1', {},
              h('L:Search', {size: 16, className: 'absolute right-3 top-3 text-[#a1a7a4]'}),
              h('input:w-full rounded-xl border border-[#e2e6e3] bg-white py-2.5 pl-3 pr-9 text-sm outline-none focus:border-[#7fa18c]', {
                value: search, placeholder: 'חיפוש לפי כותרת…', onInput: event => setSearch(event.target.value)})),
              h('span:text-xs text-[#9da39f]', {}, `${items.length} פריטים`)),
            !catalog ? h('div:grid min-h-80 place-items-center text-[#8b938e]', {}, h('L:Loader2', {size: 22, className: 'animate-spin'}))
              : h('div:mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3', {}, items.map(resourceCard))))
      }
    }
  })
})
