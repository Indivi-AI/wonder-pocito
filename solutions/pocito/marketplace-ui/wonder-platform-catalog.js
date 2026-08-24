import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformCatalog', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({view, repo, search, setSearch, openItem, createItem}) => {
      const {resources, classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx), config = resources[view]
      const items = (repo[view] || []).filter(item => !search || `${item.name} ${item.desc}`.includes(search))
      const usedBy = item => repo.plugins.filter(plugin => {
        if (view == 'skills') return plugin.skillIds?.includes(item.id)
        return view == 'tools' && (plugin.toolIds?.includes(item.id) || plugin.skillIds?.some(id =>
          repo.skills.find(skill => skill.id == id)?.toolIds?.includes(item.id)))
      })
      const chip = (text, title) => h(`span:${classes.chip}`, {title}, text)
      return h('main:min-h-screen overflow-x-hidden px-5 pb-24 pt-8 sm:mr-[210px] sm:px-10 sm:pb-10', {}, h('div:mx-auto max-w-6xl', {},
        h('div:flex flex-wrap items-start justify-between gap-4', {}, h('div', {}, h('div:flex items-center gap-2', {},
          h(`L:${config.icon}`, {size: 21, className: 'text-[#2f6b4b]'}), h('h1:text-2xl font-bold', {}, config.title)),
        h('p:mt-2 text-sm text-[#929995]', {}, config.subtitle)), view != 'reports' && h(`button:${classes.primary}`, {
          onClick: () => createItem(view)}, h('L:Plus', {size: 16}), config.create)),
      h('div:mt-7 flex items-center gap-4', {}, h('div:relative max-w-md flex-1', {}, h('L:Search', {
        size: 16, className: 'absolute right-3 top-3 text-[#a1a7a4]'}), h('input:w-full rounded-xl border border-[#e2e6e3] bg-white py-2.5 ' +
          'pl-3 pr-9 text-sm outline-none', {value: search, placeholder: 'חיפוש לפי כותרת…', onInput: event => setSearch(event.target.value)})),
      h('span:text-xs text-[#9da39f]', {}, `${items.length} פריטים`)), h('div:mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3', {}, items.map(item => {
        const editable = !(view == 'tools' && item.managed), users = usedBy(item)
        return h(`article:${classes.card} min-h-52 ${editable ? 'cursor-pointer hover:border-[#9eb9a8]' : ''}`, {key: item.id,
          role: editable ? 'button' : undefined, tabIndex: editable ? 0 : undefined, onClick: editable ? () => openItem(view, item) : undefined,
          onKeyDown: editable ? event => event.key == 'Enter' && openItem(view, item) : undefined}, h('div:flex items-start gap-3', {},
          h('div:grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#dbe7df] bg-[#edf6f0] text-sm font-bold text-[#285a40]', {},
            item.mark || item.name?.slice(0, 2)), h('div:min-w-0 flex-1', {}, h('div:flex flex-wrap items-center gap-2', {},
            h('h3:truncate text-base font-bold', {}, item.name), item.managed && chip('מנוהל'),
            h('span:rounded border border-[#e6e9e7] px-1.5 py-0.5 text-[10px] text-[#9aa19d]', {}, item.version || 'V0')),
          h('div:mt-0.5 text-xs text-[#a1a7a4]', {}, view == 'tools' ? item.kind == 'flow' ? 'Flow · מארז' : 'Connector · MCP' : config.label))),
        h('p:mt-4 min-h-10 text-sm leading-6 text-[#68706c]', {}, item.desc), h('div:mt-4 flex flex-wrap gap-2', {},
          (config.relations || []).map(([field, resource, label]) => chip(`${item[field]?.length || 0} ${label}`,
            (item[field] || []).map(id => repo[resource].find(value => value.id == id)?.name).filter(Boolean).join('\n'))),
          view == 'skills' && chip(`${item.categories?.length || 0} קטגוריות`, (item.categories || []).join('\n')),
          !['plugins', 'reports'].includes(view) && chip(users.length ? `בשימוש ב-${users.length} פלאגינים` : 'לא בשימוש',
            users.map(plugin => plugin.name).join('\n')), view == 'tools' && chip(item.kind == 'flow' ? 'מארז Flow' : 'שרת MCP'),
          view == 'reports' && chip(`${item.sourceCount || 0} מקורות`), view == 'reports' && chip(item.status)),
        h('div:mt-4 border-t border-dashed border-[#edf0ee] pt-3 text-[11px] text-[#a3a9a6]', {},
          `נוצר ${item.created || '—'} · עודכן ${item.updated || item.verifiedAt || 'עכשיו'}`))
      }))))
    }
  })
})
