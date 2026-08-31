import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-kit.js'
import './wonder-platform-resource-fields.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformAttachPicker', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh}}) => ({picker, repo, setPicker, attachSelected, createNested}) => {
      const {classes, resources, newLabels} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      if (!picker) return null
      const items = (repo[picker.resource] || []).filter(item => !picker.query || `${item.name} ${item.desc}`.includes(picker.query))
      const toggle = item => setPicker({...picker, selected: picker.selected.includes(item.id)
        ? picker.selected.filter(id => id != item.id) : [...picker.selected, item.id]})
      const row = item => {
        const selected = picker.selected.includes(item.id)
        return h('button:flex w-full items-center gap-3 border-b border-b-[color:var(--wp-border)] border-s-2 px-4 ' +
          'py-2.5 text-start transition-colors ' + (selected
            ? 'border-s-[color:var(--wp-ink)] bg-[var(--wp-surface-3)]'
            : 'border-s-transparent hover:bg-[var(--wp-surface-2)]'),
        {key: item.id, onClick: () => toggle(item)},
        h('span:grid h-[17px] w-[17px] shrink-0 place-items-center rounded-[5px] border transition-colors ' +
          (selected ? 'border-[var(--wp-ink)] bg-[var(--wp-ink)]' : 'border-[var(--wp-border-strong)] bg-[var(--wp-surface)]'),
        {}, selected && h('L:Check', {size: 12, className: 'text-white'})),
        hh(ctx, dsls.react['react-comp'].wonderPlatformMark,
          {icon: item.icon || resources[picker.resource]?.icon, text: item.mark, size: 'sm'}),
        h('span:min-w-0 flex-1', {}, h('span:block truncate text-[13px] font-medium text-[var(--wp-ink)]', {}, item.name),
          h('span:block truncate text-[12px] text-[var(--wp-ink-4)]', {}, item.desc || '')),
        item.managed && h(`span:${classes.chip}`, {}, 'מנוהל'))
      }
      return h(`div:${classes.overlay}`, {onClick: event => event.target == event.currentTarget && setPicker()},
        h(`section:${classes.dialog} flex max-h-[78vh] w-full max-w-xl flex-col overflow-hidden`,
          {role: 'dialog', 'aria-modal': 'true', 'aria-label': `בחירת ${picker.label}`},
          h('div:flex items-center gap-2.5 border-b border-[var(--wp-border)] px-4 py-3', {},
            h('L:Search', {size: 16, className: 'shrink-0 text-[var(--wp-ink-4)]'}),
            h('input:flex-1 bg-transparent text-[13px] outline-none wp-noring ' +
              'placeholder:text-[var(--wp-ink-4)]',
              {value: picker.query || '', autoFocus: true, placeholder: `חיפוש ${picker.label}…`,
                onInput: event => setPicker({...picker, query: event.target.value})}),
            h(`button:${classes.icon}`, {onClick: () => setPicker(), 'aria-label': 'סגירה'}, h('L:X', {size: 16}))),
          h('div:wp-scroll min-h-0 flex-1 overflow-y-auto', {},
            items.map(row), items.length == 0 && h('p:px-4 py-8 text-center text-[13px] text-[var(--wp-ink-3)]', {},
              `לא נמצא ${picker.single} מתאים`)),
          h('div:flex items-center justify-between gap-3 border-t border-[var(--wp-border)] ' +
            'bg-[var(--wp-surface-2)] px-4 py-3', {},
            h(`span:${classes.meta}`, {}, `${picker.selected.length} נבחרו`),
            h('div:flex items-center gap-2', {},
              h(`button:${classes.button}`, {onClick: () => createNested(picker.resource),
                'aria-label': `בניית ${newLabels[picker.resource]}`},
                h('L:Plus', {size: 14}),
                picker.resource == 'tools' ? 'כלי חדש ממארז Flow' : newLabels[picker.resource]),
              h(`button:${classes.button}`, {onClick: () => setPicker()}, 'ביטול'),
              h(`button:${classes.primary}`, {onClick: attachSelected, 'aria-label': 'אישור בחירה'}, 'אישור')))))
    }
  })
})
