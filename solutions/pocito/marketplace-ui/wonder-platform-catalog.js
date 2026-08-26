import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformCatalog', {
  impl: comp({
    hFunc: (ctx, {react: {h, useState}}) => ({view, repo, search, setSearch, openItem, createItem, importItem}) => {
      const {resources, classes, ownerTabs} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx), config = resources[view]
      const [ownerTab, setOwnerTab] = useState('mine'), ownable = !!importItem
      const items = (repo[view] || []).filter(item => !search || `${item.name} ${item.desc}`.includes(search))
        .filter(item => !ownable || ownerTab == 'global' || (item.owner || 'me') != 'global')
      const usedBy = item => repo.plugins.filter(plugin => {
        const subs = (plugin.subagentIds || []).map(id => repo.subagents.find(value => value.id == id)).filter(Boolean)
        const viaSkillTools = ids => (ids || []).some(id => repo.skills.find(skill => skill.id == id)?.toolIds?.includes(item.id))
        if (view == 'skills') return plugin.skillIds?.includes(item.id) || subs.some(sub => sub.skillIds?.includes(item.id))
        return view == 'tools' && (plugin.toolIds?.includes(item.id) || viaSkillTools(plugin.skillIds)
          || subs.some(sub => sub.toolIds?.includes(item.id) || viaSkillTools(sub.skillIds)))
      })
      const note = text => h('p:mt-1 text-sm text-[#6b6b6f]', {}, text)
      const [emptyTitle, emptyBody] = search ? ['לא נמצאו תוצאות', note('נסו מונח חיפוש אחר')]
        : ownerTab == 'global' ? ['הקטלוג המשותף ריק', note('פריטים שיפורסמו לקטלוג יופיעו כאן')]
        : ['אין כאן עדיין פריטים', h(`button:${classes.primary} mt-3`, {onClick: () => createItem(view)}, config.create)]
      const chip = (text, title) => h(`span:${classes.chip}`, {title}, text)
      const lastRun = item => (repo.evalRuns || []).filter(run => run.targetId == item.id)
        .sort((a, b) => b.startedAt - a.startedAt)[0]
      const humanDate = value => /^\d{4}-\d{2}-\d{2}T/.test(value || '')
        ? new Date(value).toLocaleString('he-IL', {dateStyle: 'short', timeStyle: 'short'}) : value
      return h('main:min-h-screen min-w-0 flex-1 overflow-x-hidden pb-24 sm:pb-10', {},
        h('div:px-5 pt-10 sm:px-10', {}, h('div:mx-auto max-w-[1600px]', {},
        h('div', {}, h('h1:text-[26px] font-semibold tracking-[-0.02em] text-[#0f0f10]', {}, config.title),
          h('p:mt-1.5 text-sm text-[#6b6b6f]', {}, config.subtitle)),
      h('div:mt-8 flex flex-wrap items-center justify-between gap-3 border-b border-[#e8e8ea] pb-3', {},
        h('div:flex items-center gap-3', {}, ownable && h('div:flex gap-1', {}, ownerTabs.map(([id, title]) => h(
          `button:relative rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${ownerTab == id
            ? 'font-medium text-[#0f0f10]' : 'text-[#6b6b6f] hover:text-[#2e2e2e]'}`, {key: id, onClick: () => setOwnerTab(id)}, title,
          ownerTab == id && h('span:absolute inset-x-2.5 -bottom-[13px] h-px bg-[#0f0f10]')))),
          h(`button:${classes.primary}`, {onClick: () => createItem(view)}, h('L:Plus', {size: 15}), config.create)),
        h('div:relative w-64 max-w-full', {}, h('L:Search', {size: 14, className: 'absolute right-3 top-2.5 text-[#6b7280]'}),
          h('input:w-full rounded-[10px] border border-[#e8e8ea] bg-white py-2 pl-3 pr-9 text-[13px] outline-none ' +
            'transition-colors placeholder:text-[#6b7280] focus:border-[#c9c9ce]', {'aria-label': 'חיפוש', value: search,
            placeholder: 'חיפוש…', onInput: event => setSearch(event.target.value)}))),
      items.length ? h('div:mt-5 grid [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))] gap-3', {}, items.map(item => {
        const editable = !(view == 'tools' && item.managed), users = usedBy(item)
        return h(`article:${classes.card} group flex flex-col ${editable ? 'cursor-pointer hover:border-[#0f0f10]' : ''}`, {key: item.id,
          role: editable ? 'button' : undefined, tabIndex: editable ? 0 : undefined, onClick: editable ? () => openItem(view, item) : undefined,
          onKeyDown: editable ? event => {if (event.key == 'Enter' || event.key == ' ') {event.key == ' ' && event.preventDefault(); openItem(view, item)}} : undefined},
        h('div:flex items-start justify-between gap-3', {},
          h('div:min-w-0 flex-1', {}, h('h3:truncate text-[14px] font-medium text-[#0f0f10]', {}, item.name),
            view == 'tools' && h('div:mt-0.5 text-[12px] text-[#6b7280]', {}, item.kind == 'flow' ? 'Flow · מארז' : 'Connector · MCP')),
          h('span:shrink-0 font-mono text-[11px] text-[#6b7280]', {}, (v => /^[vV]/.test(v) ? v : 'v' + v)(item.version || 'V0'))),
        h('p:mt-3 line-clamp-2 text-[13px] leading-[1.5] text-[#6b6b6f]', {}, item.desc),
        h('div:mt-3 flex flex-wrap gap-1.5', {},
          (config.relations || []).map(([field, resource, label]) => (item[field]?.length || 0) > 0 && chip(
            `${item[field].length} ${label}`,
            item[field].map(id => repo[resource].find(value => value.id == id)?.name).filter(Boolean).join('\n'))),
          view == 'skills' && (item.categories?.length || 0) > 0 && chip(`${item.categories.length} קטגוריות`,
            item.categories.join('\n')), item.managed && chip('מנוהל'),
          view == 'knowledge' && item.fileCount > 0 && chip(`${item.fileCount} קבצים`),
          view == 'knowledge' && item.syncStatus && chip(item.syncStatus),
          view == 'agents' && lastRun(item) && chip(`הרצה אחרונה · ${lastRun(item).started}`, lastRun(item).status),
          view != 'plugins' && users.length > 0 && chip(`${users.length} פלאגינים`, users.map(plugin => plugin.name).join('\n'))),
        h('div:mt-auto flex items-center justify-between gap-2 pt-4', {},
          h('span:truncate text-[11px] text-[#6b7280]', {}, `עודכן ${humanDate(item.updated) || 'עכשיו'}`),
          h('div:flex shrink-0 items-center gap-2', {},
            ownable && h('span:text-[11px] text-[#6b7280]', {},
              {me: 'שלי', imported: 'מיובא', other: 'מיובא', global: 'גלובלי'}[item.owner] || 'שלי'),
            ownable && item.owner == 'global' && h(`button:${classes.button} px-2 py-1 text-[12px]`, {onClick: event => (
              event.stopPropagation(), importItem(view, item))}, 'ייבוא'))))
      })) : h('div:mt-5 rounded-2xl border border-dashed border-[#d8d8dc] p-12 text-center', {},
        h(`L:${config.icon}`, {size: 28, className: 'mx-auto mb-3 text-[#6b6b6f]'}), h('b:block', {}, emptyTitle), emptyBody)
    )))
    }
  })
})
