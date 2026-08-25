import { dsls } from '@jb6/core'
import '@jb6/react'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformSearchableSelect', {
  impl: comp({
    hFunc: (ctx, {react: {h, useState}}) => ({items, value, onChange, placeholder, empty, testId, multi, bare, tall}) => {
      const [open, setOpen] = useState(false), [query, setQuery] = useState('')
      const chosen = multi ? (value || []) : [], selected = multi ? null : items.find(item => item.id == value)
      const filtered = items.filter(item => !query.trim() || (item.name || '').includes(query))
      const pick = id => multi
        ? onChange(chosen.includes(id) ? chosen.filter(entry => entry != id) : [...chosen, id])
        : (onChange(id), setOpen(false), setQuery(''))
      const chosenName = id => items.find(item => item.id == id)?.name || id
      const label = multi ? placeholder : selected?.name || placeholder
      const row = item => h(`div:flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50${
        multi && chosen.includes(item.id) ? ' font-semibold text-[#0f0f10]' : ''}`, {key: item.id,
        onMouseDown: event => event.preventDefault(), onClick: () => pick(item.id)},
      multi && h(`span:grid h-4 w-4 shrink-0 place-items-center rounded border ${chosen.includes(item.id)
        ? 'border-[#0f0f10] bg-[#0f0f10] text-white' : 'border-[#d8d8dc]'}`, {}, chosen.includes(item.id) && h('L:Check', {size: 11})),
      h('span:truncate', {}, item.name))
      return h('div:relative', {tabIndex: -1, onBlur: () => setOpen(false)}, h(`button:flex w-full items-center justify-between gap-2 px-3 py-2.5 text-sm${
        bare ? '' : ' rounded-xl border border-[#e8e8ea] bg-[#fafafa]'}`, {type: 'button', 'data-testid': testId,
        onClick: () => setOpen(!open)},
      multi && chosen.length
        ? h('span:flex flex-1 flex-wrap items-center gap-1', {}, chosen.map(id => h('span:rounded-md bg-[#f4f4f5] ' +
          'px-2 py-0.5 text-xs', {key: id}, chosenName(id))))
        : h('span:truncate', {}, label || 'בחירה'),
      h('L:ChevronDown', {size: 14, className: 'shrink-0 text-[#6b6b6f]'})),
      open && h('div:absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-[#e8e8ea] bg-white shadow-lg', {},
        h('input:w-full border-b border-[#e8e8ea] px-3 py-2 text-sm outline-none', {value: query, autoFocus: true,
          placeholder: 'חיפוש…', onInput: event => setQuery(event.target.value)}),
        h(`div:${tall ? '' : 'max-h-56 overflow-y-auto '}`, {}, !multi && h('div:cursor-pointer px-3 py-2 text-sm text-[#6b6b6f] hover:bg-gray-50', {
          onMouseDown: event => event.preventDefault(), onClick: () => pick('')}, empty || 'ללא בחירה'),
        filtered.map(row), filtered.length == 0 && h('div:px-3 py-2 text-xs text-[#6b6b6f]', {}, 'אין תוצאות')),
        multi && h('button:w-full border-t border-[#e8e8ea] px-3 py-2 text-xs text-[#0f0f10]', {
          onClick: () => (setOpen(false), setQuery(''))}, 'סיום')))
    }
  })
})
