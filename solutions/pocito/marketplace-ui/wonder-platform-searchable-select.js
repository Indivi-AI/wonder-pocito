import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-kit.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformSearchableSelect', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh, useState, useEffect, useRef}}) =>
      ({items, value, onChange, placeholder, empty, testId, multi, bare, icon, label, card}) => {
      const {classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [rect, setRect] = useState()
      const ref = useRef(), toggle = () => (setRect(ref.current.getBoundingClientRect()), setOpen(!open))
      useEffect(() => {
        if (!open) return
        const close = event => { if (!ref.current?.contains(event.target)) setOpen(false) }
        const dismiss = () => setOpen(false)
        document.addEventListener('pointerdown', close)
        window.addEventListener('scroll', close, true)
        window.addEventListener('resize', dismiss)
        return () => { document.removeEventListener('pointerdown', close)
          window.removeEventListener('scroll', close, true), window.removeEventListener('resize', dismiss) }
      }, [open])
      const chosen = multi ? (value || []) : [], selected = multi ? null : items.find(item => item.id == value)
      const isChosen = item => multi ? chosen.includes(item.id) : item.id == value
      const filtered = items.filter(item => !query.trim() || (item.name || '').includes(query))
        .sort((a, b) => isChosen(b) - isChosen(a))
      const pick = id => multi
        ? onChange(chosen.includes(id) ? chosen.filter(entry => entry != id) : [...chosen, id])
        : (onChange(id), setOpen(false), setQuery(''))
      const chosenItem = id => items.find(item => item.id == id)
      const mark = item => hh(ctx, dsls.react['react-comp'].wonderPlatformMark,
        {key: 'mark', icon: item?.icon, text: item?.mark, size: 'sm'})
      const row = item => h(`div:flex cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-[13px] hover:bg-[var(--wp-surface-2)]${
        isChosen(item) ? ' bg-[var(--wp-surface-3)] font-semibold text-[var(--wp-ink)]' : ''}`, {key: item.id,
        onMouseDown: event => event.preventDefault(), onClick: () => pick(item.id)},
      mark(item), h('span:flex-1 truncate', {}, item.name),
      isChosen(item) && h('L:Check', {size: 14, className: 'shrink-0 text-[var(--wp-ink)]'}))
      const view = document.documentElement, below = rect ? view.clientHeight - rect.bottom : 0, above = rect ? rect.top : 0
      const up = below < 260 && above > below
      const dropdown = open && rect && h(`div:${classes.panel} fixed z-[80] flex flex-col overflow-hidden shadow-[var(--wp-sh-2)]`,
        {style: {right: view.clientWidth - rect.right, minWidth: Math.max(rect.width, 260), maxWidth: view.clientWidth - 24,
          maxHeight: Math.min(360, (up ? above : below) - 12), ...(up ? {bottom: view.clientHeight - rect.top + 6} : {top: rect.bottom + 6})}},
        h('input:w-full shrink-0 border-b border-[var(--wp-border)] px-3.5 py-2.5 text-[13px] outline-none ' +
          'wp-noring', {value: query, autoFocus: true,
          placeholder: 'חיפוש…', onInput: event => setQuery(event.target.value)}),
        h('div:min-h-0 flex-1 overflow-y-auto wp-scroll', {}, !multi && h('div:cursor-pointer px-3.5 py-2.5 text-[13px] text-[var(--wp-ink-3)] ' +
          'hover:bg-[var(--wp-surface-2)]', {onMouseDown: event => event.preventDefault(), onClick: () => pick('')},
          empty || 'ללא בחירה'),
        filtered.map(row), filtered.length == 0 && h('div:px-3.5 py-2.5 text-[12px] text-[var(--wp-ink-3)]', {}, 'אין תוצאות')),
        multi && h('button:w-full shrink-0 border-t border-[var(--wp-border)] px-3.5 py-2.5 text-[12px] font-medium text-[var(--wp-ink)] ' +
          'hover:bg-[var(--wp-surface-2)]', {onClick: () => (setOpen(false), setQuery(''))}, 'סיום'))
      if (card) {
        const count = multi ? chosen.length : (selected ? 1 : 0)
        const children = !multi && selected
          ? [mark(selected), h('span:min-w-0 flex-1 truncate text-start font-medium text-[var(--wp-ink)]', {}, selected.name),
              h('L:ChevronDown', {size: 13, className: 'shrink-0 text-[var(--wp-ink-3)]'})]
          : [h(`L:${icon || 'Plus'}`, {size: 14, className: 'shrink-0 text-[var(--wp-ink-4)]'}),
              h('span:min-w-0 flex-1 truncate text-start font-medium text-[var(--wp-ink)]', {}, label),
              count ? h('span:wp-num shrink-0 text-[12px] text-[var(--wp-ink-3)]', {}, count)
                : h('L:Plus', {size: 13, className: 'shrink-0 text-[var(--wp-ink-4)]'})]
        return h('div:relative', {ref}, h('button:flex h-9 w-[184px] items-center gap-2 ' +
          'rounded-[8px] border px-3 ' +
          `text-[13px] transition-colors ${count ? 'border-[var(--wp-border-strong)] bg-[var(--wp-surface-3)]'
            : 'border-dashed border-[var(--wp-border-strong)] hover:bg-[var(--wp-surface-2)]'}`,
        {type: 'button', 'data-testid': testId, onClick: toggle}, ...children), dropdown)
      }
      const triggerLabel = multi ? placeholder : (selected?.name || placeholder)
      return h('div:relative', {ref}, h(`button:flex w-full items-center justify-between gap-2 px-3.5 py-3 text-[13px] ${
        bare ? '' : 'rounded-[12px] border border-[var(--wp-border)] bg-[var(--wp-surface-2)] shadow-[var(--wp-sh-1)]'} ` +
        'transition-colors hover:border-[var(--wp-border-strong)]', {type: 'button', 'data-testid': testId, onClick: toggle},
      multi && chosen.length
        ? h('span:flex flex-1 flex-wrap items-center gap-1.5', {}, chosen.map(id => h('span:flex items-center gap-1 ' +
          'rounded-[8px] bg-[var(--wp-surface-3)] py-0.5 pe-2 ps-1 text-[12px]', {key: id}, mark(chosenItem(id)), chosenItem(id)?.name || id)))
        : !multi && selected
          ? h('span:flex flex-1 items-center gap-2 truncate', {}, mark(selected), selected.name)
          : h('span:truncate text-[var(--wp-ink-4)]', {}, triggerLabel || 'בחירה'),
      h('L:ChevronDown', {size: 14, className: 'shrink-0 text-[var(--wp-ink-3)]'})), dropdown)
    }
  })
})
