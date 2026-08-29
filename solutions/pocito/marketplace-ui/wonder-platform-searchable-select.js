import { dsls } from '@jb6/core'
import '@jb6/react'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformSearchableSelect', {
  impl: comp({
    hFunc: (ctx, {react: {h, useState, useEffect, useRef}}) =>
      ({items, value, onChange, placeholder, empty, testId, multi, bare, icon, label, card}) => {
      const [open, setOpen] = useState(false), [query, setQuery] = useState('')
      const ref = useRef()
      useEffect(() => {
        if (!open) return
        const close = event => { if (!ref.current?.contains(event.target)) setOpen(false) }
        document.addEventListener('pointerdown', close)
        return () => document.removeEventListener('pointerdown', close)
      }, [open])
      const chosen = multi ? (value || []) : [], selected = multi ? null : items.find(item => item.id == value)
      const isChosen = item => multi ? chosen.includes(item.id) : item.id == value
      const filtered = items.filter(item => !query.trim() || (item.name || '').includes(query))
        .sort((a, b) => isChosen(b) - isChosen(a))
      const pick = id => multi
        ? onChange(chosen.includes(id) ? chosen.filter(entry => entry != id) : [...chosen, id])
        : (onChange(id), setOpen(false), setQuery(''))
      const chosenItem = id => items.find(item => item.id == id)
      const mark = item => h('span:grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#f4f4f5] ' +
        'text-[10px] font-bold text-[#0f0f10]', {key: 'mark'},
        item?.icon ? h(`L:${item.icon}`, {size: 12}) : (item?.mark || '·'))
      const row = item => h(`div:flex cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-sm hover:bg-[#fafafa]${
        isChosen(item) ? ' bg-[#f7f7f8] font-semibold text-[#0f0f10]' : ''}`, {key: item.id,
        onMouseDown: event => event.preventDefault(), onClick: () => pick(item.id)},
      mark(item), h('span:flex-1 truncate', {}, item.name),
      isChosen(item) && h('L:Check', {size: 14, className: 'shrink-0 text-[#0f0f10]'}))
      const dropdown = open && h('div:absolute z-20 mt-2 w-full min-w-[260px] overflow-hidden rounded-2xl border ' +
        'border-[#e8e8ea] bg-white shadow-[0_16px_40px_rgba(0,0,0,0.14)]', {},
        h('input:w-full border-b border-[#e8e8ea] px-3.5 py-2.5 text-sm outline-none', {value: query, autoFocus: true,
          placeholder: 'חיפוש…', onInput: event => setQuery(event.target.value)}),
        h('div:max-h-64 overflow-y-auto', {}, !multi && h('div:cursor-pointer px-3.5 py-2.5 text-sm text-[#6b6b6f] ' +
          'hover:bg-[#fafafa]', {onMouseDown: event => event.preventDefault(), onClick: () => pick('')},
          empty || 'ללא בחירה'),
        filtered.map(row), filtered.length == 0 && h('div:px-3.5 py-2.5 text-xs text-[#6b6b6f]', {}, 'אין תוצאות')),
        multi && h('button:w-full border-t border-[#e8e8ea] px-3.5 py-2.5 text-xs font-medium text-[#0f0f10] ' +
          'hover:bg-[#fafafa]', {onClick: () => (setOpen(false), setQuery(''))}, 'סיום'))
      if (card) {
        const filled = multi ? chosen.length > 0 : !!selected
        return h('div:relative', {ref}, h(`button:flex w-full min-h-[136px] flex-col items-center justify-center ` +
          `gap-2.5 rounded-2xl border p-4 text-center transition-all duration-150 shadow-[0_2px_8px_rgba(0,0,0,0.04)] ` +
          `hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(0,0,0,0.10)] ${filled
            ? 'border-[#d8d8dc] bg-[#f7f7f8]' : 'border-dashed border-[#d8d8dc] bg-white hover:border-[#b8b8bd]'}`,
          {type: 'button', 'data-testid': testId, onClick: () => setOpen(!open)},
          h(`span:grid h-11 w-11 shrink-0 place-items-center rounded-full ${filled ? 'bg-white' : 'bg-[#f4f4f5]'}`,
            {}, h(`L:${icon || 'Plus'}`, {size: 19, className: filled ? 'text-[#0f0f10]' : 'text-[#6b6b6f]'})),
          h('span:text-[13px] font-semibold text-[#0f0f10]', {}, label),
          filled
            ? h('span:flex w-full flex-wrap items-center justify-center gap-1', {},
                multi ? chosen.map(id => h('span:flex max-w-full items-center gap-1 rounded-md bg-white py-1 pe-2 ps-1.5 ' +
                  'text-[11.5px] font-medium leading-snug text-[#2e2e2e] shadow-[0_1px_2px_rgba(0,0,0,0.06)]', {key: id},
                  chosenItem(id)?.icon && h(`L:${chosenItem(id).icon}`, {size: 11, className: 'shrink-0'}),
                  h('span:break-words', {}, chosenItem(id)?.name || id)))
                  : h('span:flex max-w-full items-center gap-1 rounded-md bg-white py-1 pe-2 ps-1.5 text-[11.5px] ' +
                    'font-medium leading-snug text-[#2e2e2e] shadow-[0_1px_2px_rgba(0,0,0,0.06)]', {},
                    selected?.icon && h(`L:${selected.icon}`, {size: 11, className: 'shrink-0'}),
                    h('span:break-words', {}, selected?.name)))
            : h('span:text-[11px] font-medium text-[#8a8a8f]', {}, placeholder || 'הוספה')),
          dropdown)
      }
      const triggerLabel = multi ? placeholder : (selected?.name || placeholder)
      return h('div:relative', {ref}, h(`button:flex w-full items-center justify-between gap-2 px-3.5 py-3 text-sm ${
        bare ? '' : 'rounded-2xl border border-[#e8e8ea] bg-[#fafafa] shadow-[0_1px_2px_rgba(0,0,0,0.03)]'} ` +
        'transition-colors hover:border-[#c9c9ce]', {type: 'button', 'data-testid': testId, onClick: () => setOpen(!open)},
      multi && chosen.length
        ? h('span:flex flex-1 flex-wrap items-center gap-1.5', {}, chosen.map(id => h('span:flex items-center gap-1 ' +
          'rounded-md bg-[#f4f4f5] py-0.5 pe-2 ps-1 text-xs', {key: id}, mark(chosenItem(id)), chosenItem(id)?.name || id)))
        : !multi && selected
          ? h('span:flex flex-1 items-center gap-2 truncate', {}, mark(selected), selected.name)
          : h('span:truncate text-[#8a8a8f]', {}, triggerLabel || 'בחירה'),
      h('L:ChevronDown', {size: 14, className: 'shrink-0 text-[#6b6b6f]'})), dropdown)
    }
  })
})
