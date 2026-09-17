import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformMark', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({icon, text, size = 'md'}) => {
      const [box, glyph] = {sm: ['h-7 w-7 text-[11px]', 13], md: ['h-9 w-9 text-[11px]', 16], lg: ['h-11 w-11 text-[13px]', 18]}[size]
      return h(`span:grid ${box} shrink-0 place-items-center rounded-[8px] border border-[var(--wp-border)] ` +
        'bg-[var(--wp-surface-2)] font-semibold text-[var(--wp-ink-2)]', {},
      icon ? h(`L:${icon}`, {size: glyph}) : (text || '').slice(0, 2))
    }
  })
})

ReactComp('wonderPlatformEmpty', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh}}) => ({icon, title, body, actionLabel, onAction, compact}) => {
      const {classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      return h(`div:flex flex-col items-center justify-center px-6 text-center ${compact ? 'py-12' : 'py-24'}`, {},
        hh(ctx, dsls.react['react-comp'].wonderPlatformMark, {icon: icon || 'Inbox', size: 'lg'}),
        h(`h3:${classes.h3} mt-4`, {}, title),
        body && h('p:mt-1.5 max-w-[36ch] text-[13px] leading-[1.65] text-[var(--wp-ink-3)]', {}, body),
        actionLabel && h(`button:${classes.primary} mt-5`, {onClick: onAction}, h('L:Plus', {size: 15}), actionLabel))
    }
  })
})

ReactComp('wonderPlatformAppSkeleton', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => () => {
      const {classes, catalogNav} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const bar = (width, height = 'h-3') => h(`span:wp-skel block ${height} ${width}`)
      const navRow = key => h('div:flex items-center gap-2.5 px-2.5 py-2', {key}, bar('w-4', 'h-4'), bar('w-24'))
      const navGroup = (key, rows) => h('div', {key}, h('div:pb-1.5 pt-5', {}, bar('w-16')),
        h('div:space-y-1', {}, Array.from({length: rows}, (value, index) => navRow(`${key}-${index}`))))
      const actionCard = index => h(`div:${classes.panel} flex flex-1 flex-col items-start gap-2 p-6`, {key: index},
        bar('w-11', 'h-11'), h('span:mt-2 block', {}, bar('w-24', 'h-4')), bar('w-full'), bar('w-4/5'))
      const row = index => h('div:flex items-center gap-3 bg-[var(--wp-surface)] px-3.5 py-2.5', {key: index},
        bar('w-7', 'h-7'), h('span:min-w-0 flex-1', {}, bar('w-32'), h('span:mt-1.5 block', {}, bar('w-20'))))
      const group = index => h('div:min-w-0 flex-1', {key: index}, h('div:pb-2', {}, bar('w-24')),
        h('div:grid gap-px overflow-hidden rounded-[8px] border border-[var(--wp-border)] bg-[var(--wp-border)]', {},
          [0, 1, 2].map(row)))
      return h('div:flex min-h-screen w-full', {},
        h('aside:hidden w-[260px] shrink-0 flex-col border-l border-[var(--wp-border)] px-2.5 py-3.5 sm:flex', {},
          h('div:flex items-center gap-2.5 px-1.5 pb-4', {}, bar('w-8', 'h-8'), bar('w-28')),
          h('div:space-y-1', {}, navRow('home')),
          h('div:mt-5 space-y-2', {}, bar('w-full', 'h-9'),
            h('div:grid grid-cols-2 gap-1.5', {}, bar('w-full', 'h-9'), bar('w-full', 'h-9'))),
          navGroup('recent', 3), navGroup('catalog', catalogNav.length)),
        h(`main:${classes.page}`, {},
          h('div:mx-auto w-full max-w-[1180px] px-8 pb-20 pt-20', {},
            bar('w-56', 'h-6'), h('span:mt-2 block', {}, bar('w-80')),
            h('div:mt-6 flex gap-3', {}, [0, 1, 2].map(actionCard)),
            h('div:mt-10 flex gap-6', {}, [0, 1].map(group)))))
    }
  })
})

ReactComp('wonderPlatformJourneySkeleton', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({bodyOnly}) => {
      const bar = (width, height = 'h-3', key) => h(`span:wp-skel block ${height} ${width}`, key == null ? {} : {key})
      const step = index => h('span:flex items-center gap-2', {key: index}, bar('w-5', 'h-5'), bar('w-16'))
      const field = index => h('div:space-y-3 rounded-[12px] border border-[var(--wp-border)] p-4', {key: index},
        bar('w-32', 'h-3.5'), bar('w-full', 'h-9'), bar('w-4/5', 'h-9'))
      const mainCol = h('div:flex min-w-0 flex-1 flex-col', {},
        h('nav:flex shrink-0 items-center gap-4 border-b border-[var(--wp-border)] px-5 py-3', {}, [0, 1, 2].map(step)),
        h('div:min-h-0 flex-1 overflow-hidden', {},
          h('div:mx-auto w-full max-w-[840px] space-y-4 px-6 py-6', {}, [0, 1, 2].map(field))),
        h('div:flex shrink-0 items-center justify-between gap-4 border-t border-[var(--wp-border)] px-6 py-3', {},
          bar('w-40'), bar('w-28', 'h-9')))
      const drawer = h('aside:flex h-full w-[400px] shrink-0 flex-col border-r border-[var(--wp-border)] 2xl:w-[460px]', {},
        h('div:flex shrink-0 items-center gap-2 border-b border-[var(--wp-border)] p-3', {}, bar('w-6', 'h-6'),
          h('div:inline-flex items-center gap-1 rounded-[8px] border border-[var(--wp-border)] p-[3px]', {},
            bar('w-16', 'h-6'), bar('w-16', 'h-6'))),
        h('div:min-h-0 flex-1 space-y-3 p-4', {}, ['w-full', 'w-4/5', 'w-2/3', 'w-3/4', 'w-1/2'].map((width, index) =>
          bar(width, 'h-9', index))))
      const body = h('div:min-h-0 flex-1 overflow-hidden', {}, h('div:flex h-full min-h-0', {}, mainCol, drawer))
      if (bodyOnly) return h('div:absolute inset-0 z-10 flex flex-col bg-[var(--wp-surface)]', {},
        h('div:h-[64px] shrink-0 border-b border-[var(--wp-border)]'),
        h('div:h-[38px] shrink-0 border-b border-[var(--wp-border)]'), body)
      return h('main:flex h-screen min-w-0 flex-1 flex-col overflow-hidden bg-[var(--wp-surface)]', {},
        h('header:z-30 shrink-0 border-b border-[var(--wp-border)] px-5', {},
          h('div:flex h-[64px] items-center gap-3', {}, bar('w-8', 'h-8'), bar('w-9', 'h-9'),
            h('div:min-w-0 flex-1', {}, bar('w-40', 'h-4'), h('span:mt-2 block', {}, bar('w-24'))), bar('w-24', 'h-9')),
          h('div:flex h-[38px] items-center gap-2.5 border-t border-[var(--wp-border)]', {}, bar('w-16'), bar('w-20'))),
        body)
    }
  })
})

ReactComp('wonderPlatformDialog', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({title, body, close, actions = [], busy, width = 'max-w-md', children}) => {
      const {classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      return h(`div:${classes.overlay}`, {onClick: event => event.target == event.currentTarget && close?.()},
        h(`section:${classes.dialog} ${width} p-5`, {role: 'dialog', 'aria-modal': 'true', 'aria-label': title},
          h('div:flex items-start justify-between gap-4', {}, h(`h2:${classes.h2}`, {}, title),
            close && h(`button:${classes.icon} -m-1`, {onClick: close, 'aria-label': 'סגירה'}, h('L:X', {size: 16}))),
          body && h(`p:mt-2 ${classes.body}`, {}, body), children,
          actions.length > 0 && h('div:mt-6 flex flex-wrap gap-2', {}, actions.map(([label, onClick, kind]) =>
            h(`button:${kind == 'danger' ? classes.danger : kind ? classes.primary : classes.button}`,
              {key: label, onClick, disabled: busy}, label)))))
    }
  })
})

ReactComp('wonderPlatformPageHeader', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({title, subtitle, count, actions, tabs, tab, setTab, search, setSearch}) => {
      const {classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      return h('div:sticky top-0 z-20 border-b border-[var(--wp-border)] bg-[var(--wp-surface)]/92 backdrop-blur', {},
        h(`div:${classes.content} flex h-[64px] items-center gap-4`, {},
          h('div:flex min-w-0 items-baseline gap-2.5', {}, h(`h1:${classes.h1} shrink-0`, {}, title),
            subtitle && h('p:min-w-0 truncate text-[12px] text-[var(--wp-ink-4)]', {}, subtitle)),
          h('div:ms-auto flex shrink-0 items-center gap-2.5', {},
            tabs?.length > 1 && h(`div:${classes.segment}`, {}, tabs.map(([id, label]) => h(
              `button:${tab == id ? classes.tabOn : classes.tab}`, {key: id, onClick: () => setTab(id)}, label))),
            setSearch && h('div:relative w-56', {},
              h('L:Search', {size: 14, className: 'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ' +
                'text-[var(--wp-ink-4)]'}),
              h(`input:${classes.fieldBare} pr-9`, {value: search, placeholder: 'חיפוש…', 'aria-label': 'חיפוש',
                onInput: event => setSearch(event.target.value)})),
            count != null && h('span:shrink-0 text-[12px] text-[var(--wp-ink-4)]', {},
              h('span:wp-num', {}, count), ' פריטים'),
            actions && h('div:flex shrink-0 items-center gap-2 border-s border-[var(--wp-border)] ps-2.5', {}, actions))))
    }
  })
})

ReactComp('wonderPlatformDetailHeader', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh}}) => ({title, subtitle, icon, mark, back, backLabel, actions, badge}) => {
      const {classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      return h('header:sticky top-0 z-30 flex h-[64px] items-center gap-3 border-b border-[var(--wp-border)] ' +
        'bg-[var(--wp-surface)]/92 px-5 backdrop-blur', {},
      back && h(`button:${classes.icon} -mr-1.5`, {onClick: back, 'aria-label': backLabel || 'חזרה'}, h('L:ChevronRight', {size: 17})),
      (icon || mark) && hh(ctx, dsls.react['react-comp'].wonderPlatformMark, {icon, text: mark, size: 'sm'}),
      h('div:min-w-0 flex-1', {}, h('h1:truncate text-[15px] font-semibold text-[var(--wp-ink)]', {}, title || 'ללא שם'),
        subtitle && h('p:truncate text-[12px] text-[var(--wp-ink-4)]', {},
          h('span:inline-block max-w-full truncate align-bottom', {dir: 'auto'}, subtitle))),
      badge, actions && h('div:flex shrink-0 items-center gap-2', {}, actions))
    }
  })
})

ReactComp('wonderPlatformSection', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({title, desc, action, children}) => {
      const {classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      return h(`section:${classes.panel}`, {},
        (title || action) && h('div:flex items-start justify-between gap-4 border-b border-[var(--wp-border)] px-4 py-3', {},
          h('div:min-w-0', {}, title && h(`h2:${classes.h2}`, {}, title),
            desc && h(`p:mt-1 ${classes.help} mt-1`, {}, desc)), action),
        h('div:space-y-4 p-4', {}, children))
    }
  })
})
