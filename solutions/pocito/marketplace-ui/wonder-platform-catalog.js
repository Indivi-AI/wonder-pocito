import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-kit.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformCatalog', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh, useState}}) => ({view, repo, search, setSearch, openItem, createItem, importItem}) => {
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
      const lastRun = item => (repo.evalRuns || []).filter(run => run.targetId == item.id).sort((a, b) => b.startedAt - a.startedAt)[0]
      const humanDate = value => /^\d{4}-\d{2}-\d{2}T/.test(value || '')
        ? new Date(value).toLocaleDateString('he-IL', {day: '2-digit', month: '2-digit'}) : value
      const counter = (icon, value, title) => value > 0 && h('span:flex items-center gap-1 text-[var(--wp-ink-3)]', {key: icon, title},
        h(`L:${icon}`, {size: 13}), h('span:wp-num text-[11px]', {}, value))
      const empty = search ? ['Search', 'לא נמצאו תוצאות', `לא נמצא פריט שתואם ל״${search}״. נסו מונח אחר.`]
        : ownerTab == 'global' ? ['Globe', 'הקטלוג המשותף ריק',
          'פריטים שיפורסמו לקטלוג הארגוני יופיעו כאן לשימוש חוזר.']
          : [config.icon, `אין עדיין ${config.title}`, config.subtitle]
      const card = item => {
        const editable = !(view == 'tools' && item.managed), users = usedBy(item), run = lastRun(item)
        const owner = {me: 'שלי', imported: 'מיובא', other: 'מיובא', global: 'גלובלי'}[item.owner] || 'שלי'
        const kind = view == 'tools' ? (item.kind == 'flow' ? 'Flow · מארז' : 'Connector · MCP') : owner
        const version = (v => /^[vV]/.test(v) ? v : 'v' + v)(item.version || 'V0')
        return h(`article:${classes.card} group flex flex-col gap-2.5 ` +
          `${editable ? 'cursor-pointer hover:border-[var(--wp-border-strong)] hover:shadow-[var(--wp-sh-1)]' : ''}`,
        {key: item.id, role: editable ? 'button' : undefined, tabIndex: editable ? 0 : undefined,
          onClick: editable ? () => openItem(view, item) : undefined,
          onKeyDown: editable ? event => {if (event.key == 'Enter' || event.key == ' ') {
            event.key == ' ' && event.preventDefault(); openItem(view, item)}} : undefined},
        h('div:flex items-start gap-3', {},
          hh(ctx, dsls.react['react-comp'].wonderPlatformMark, {icon: item.icon || config.icon, text: item.mark}),
          h('div:min-w-0 flex-1', {}, h(`h3:${classes.h3} truncate`, {}, item.name),
            h('p:mt-0.5 truncate text-[12px] text-[var(--wp-ink-4)]', {}, kind))),
        h('p:line-clamp-2 text-[13px] leading-[1.6] text-[var(--wp-ink-3)]', {}, item.desc || 'אין תיאור'),
        (item.managed || item.syncStatus || run) && h('div:flex flex-wrap gap-1.5', {},
          item.managed && h(`span:${classes.chip}`, {}, 'מנוהל'),
          item.syncStatus && h(`span:${classes.chip}`, {}, item.syncStatus),
          run && h(`span:${classes.badge}`, {title: run.started}, `הרצה · ${run.status}`)),
        h(`div:mt-auto flex items-center justify-between gap-3 border-t border-[var(--wp-border)] pt-2.5`, {},
          h('div:flex min-w-0 items-center gap-3.5', {},
            (config.relations || []).map(([field, resource]) => counter(resources[resource]?.icon || 'Dot', item[field]?.length || 0,
              (item[field] || []).map(id => repo[resource].find(value => value.id == id)?.name).filter(Boolean).join('\n'))),
            view == 'skills' && (item.categories?.length || 0) > 0 && h('span:text-[11px] text-[var(--wp-ink-4)]',
              {key: 'cat', title: item.categories.join('\n')}, `${item.categories.length} קטגוריות`),
            view == 'knowledge' && counter('File', item.fileCount || item.files?.length || 0, 'קבצים'),
            view != 'plugins' && counter('PlugZap', users.length, users.map(plugin => plugin.name).join('\n')),
            h('span:truncate text-[12px] text-[var(--wp-ink-4)]', {}, `${version} · עודכן ${humanDate(item.updated) || 'עכשיו'}`)),
          ownable && item.owner == 'global'
            ? h(`button:${classes.button} shrink-0 px-2.5`,
              {onClick: event => (event.stopPropagation(), importItem(view, item))}, 'ייבוא')
            : h('L:ArrowLeft', {size: 15, className: 'shrink-0 text-[var(--wp-ink-4)] opacity-0 transition-opacity group-hover:opacity-100'})))
      }
      return h(`main:${classes.page} wp-scroll`, {},
        hh(ctx, dsls.react['react-comp'].wonderPlatformPageHeader, {title: config.title, subtitle: config.subtitle,
          count: items.length, search, setSearch, tab: ownerTab, setTab: setOwnerTab, tabs: ownable ? ownerTabs : [],
          actions: h(`button:${classes.primary}`, {onClick: () => createItem(view)}, h('L:Plus', {size: 15}), config.create)}),
        h(`div:${classes.content} pb-16`, {},
          items.length ? h('div:mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3', {}, items.map(card))
            : hh(ctx, dsls.react['react-comp'].wonderPlatformEmpty, {icon: empty[0], title: empty[1], body: empty[2],
              actionLabel: search || ownerTab == 'global' ? '' : config.create, onAction: () => createItem(view)})))
    }
  })
})
