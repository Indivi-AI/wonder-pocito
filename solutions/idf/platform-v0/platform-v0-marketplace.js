import { dsls } from '@jb6/core'
import '@jb6/react'
import './platform-v0-model.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('PlatformV0Marketplace', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => {
      const {resources, classes} = dsls.common.data.platformV0Config.$run()
      return ({view, catalog, search, setSearch, openItem, createItem}) => {
        const config = resources[view], items = (catalog?.[view] || []).filter(item =>
          !search || `${item.title} ${item.description}`.includes(search))
        const usedBy = item => (catalog?.plugins || []).filter(plugin => {
          if (view == 'skills') return plugin.skills?.includes(item.name) || plugin.agents?.some(name =>
            catalog.agents?.find(agent => agent.name == name)?.skills?.includes(item.name))
          if (view == 'tools') return plugin.tools?.includes(item.name) || plugin.skills?.some(name =>
            catalog.skills?.find(skill => skill.name == name)?.tools?.includes(item.name)) || plugin.agents?.some(name => {
            const agent = catalog.agents?.find(current => current.name == name)
            return agent?.tools?.includes(item.name) || agent?.skills?.some(skill =>
              catalog.skills?.find(current => current.name == skill)?.tools?.includes(item.name))
          })
          return view == 'agents' && plugin.agents?.includes(item.name)
        })
        const chip = (text, names) => h(`span:${classes.chip}`, {title: names?.join('\n') || ''}, text)
        return h('main:min-h-screen overflow-x-hidden px-5 pb-24 pt-8 sm:mr-[210px] sm:px-10 sm:pb-10', {},
          h('div:mx-auto max-w-6xl', {}, h('div:flex flex-wrap items-start justify-between gap-4', {}, h('div', {},
            h('div:flex items-center gap-2', {}, h(`L:${config.icon}`, {size: 21, className: 'text-[#2f6b4b]'}),
              h('h1:text-2xl font-bold text-[#202724]', {}, config.title)), h('p:mt-2 text-sm text-[#929995]', {}, config.subtitle)),
          h(`button:${classes.primary}`, {onClick: () => createItem(view)}, h('L:Plus', {size: 16}), config.createLabel)),
          h('div:mt-7 flex items-center gap-4', {}, h('div:relative max-w-md flex-1', {},
            h('L:Search', {size: 16, className: 'absolute right-3 top-3 text-[#a1a7a4]'}),
            h('input:w-full rounded-xl border border-[#e2e6e3] bg-white py-2.5 pl-3 pr-9 text-sm outline-none focus:border-[#7fa18c]', {
              value: search, placeholder: 'חיפוש לפי כותרת…', onInput: event => setSearch(event.target.value)})),
          h('span:text-xs text-[#9da39f]', {}, `${items.length} פריטים`)),
          !catalog ? h('div:grid min-h-80 place-items-center text-[#8b938e]', {}, h('L:Loader2', {size: 22, className: 'animate-spin'}))
            : items.length ? h('div:mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3', {}, items.map(item => {
              const editable = !(view == 'tools' && item.managed), users = usedBy(item)
              return h(`article:${classes.card} min-h-52 ${editable ? 'cursor-pointer hover:border-[#9eb9a8]' : ''}`, {
                key: item.name, role: editable ? 'button' : undefined, tabIndex: editable ? 0 : undefined,
                onClick: editable ? () => openItem(view, item) : undefined,
                onKeyDown: editable ? event => event.key == 'Enter' && openItem(view, item) : undefined
              }, h('div:flex items-start gap-3', {},
                h('div:grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#dbe7df] bg-[#edf6f0] text-sm font-bold text-[#285a40]', {},
                  item.title?.slice(0, 2)), h('div:min-w-0 flex-1', {}, h('div:flex flex-wrap items-center gap-2', {},
                    h('h3:truncate text-base font-bold text-[#202724]', {}, item.title),
                    item.managed && chip('מנוהל'), h('span:rounded border border-[#e6e9e7] px-1.5 py-0.5 text-[10px] text-[#9aa19d]', {},
                      item.version || 'V0')), h('div:mt-0.5 text-xs text-[#a1a7a4]', {},
                    view == 'tools' ? item.kind == 'flow' ? 'Flow · מארז' : 'Connector · MCP' : config.typeLabel))),
              h('p:mt-4 min-h-10 text-sm leading-6 text-[#68706c]', {}, item.description),
              h('div:mt-4 flex flex-wrap gap-2', {}, (config.relations || []).map(([key, label]) =>
                chip(`${item[key]?.length || 0} ${label}`, (item[key] || []).map(name => catalog[key]?.find(value => value.name == name)?.title).filter(Boolean))),
              view != 'plugins' && chip(users.length ? `בשימוש ב-${users.length} פלאגינים` : 'לא בשימוש', users.map(plugin => plugin.title)),
              view == 'tools' && chip(item.kind == 'flow' ? 'מארז Flow' : 'שרת MCP')),
              h('div:mt-4 border-t border-dashed border-[#edf0ee] pt-3 text-[11px] text-[#a3a9a6]', {},
                `נוצר ${item.created || 'היום'} · עודכן ${item.updated || 'עכשיו'}`))
            })) : h('div:mt-12 rounded-2xl border border-dashed border-[#d9e1dc] p-10 text-center text-sm text-[#8b938e]', {},
              'לא נמצאו פריטים מתאימים')))
      }
    }
  })
})
