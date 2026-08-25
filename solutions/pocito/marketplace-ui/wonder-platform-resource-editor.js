import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-resource-fields.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformAttachPicker', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({picker, repo, setPicker, attachSelected, createNested}) => picker && h(
      'div:fixed inset-0 z-[90] grid place-items-center bg-black/35 p-4', {}, h(
        'section:max-h-[78vh] w-full max-w-xl overflow-hidden rounded-2xl border border-[#e8e8ea] bg-white shadow-2xl', {},
        h('div:flex items-center gap-3 border-b border-[#e8e8ea] p-4', {}, h('L:Search', {size: 16, className: 'text-[#6b6b6f]'}),
          h('input:flex-1 text-sm outline-none', {value: picker.query || '', placeholder: `חיפוש ${picker.label}…`,
            onInput: event => setPicker({...picker, query: event.target.value})}), h('button:text-xs text-[#6b6b6f]', {
            onClick: () => setPicker(), 'aria-label': 'סגירה'}, 'esc')),
        h('div:max-h-[58vh] overflow-y-auto p-3', {}, h('button:mb-2 flex w-full items-center justify-between rounded-xl border border-dashed ' +
          'border-[#d8d8dc] px-4 py-3 text-sm font-semibold text-[#0f0f10]', {onClick: () => createNested(picker.resource)},
        picker.resource == 'tools' ? 'כלי חדש ממארז Flow' : `${picker.single} חדשה`, h('L:Plus', {size: 15})),
        (repo[picker.resource] || []).filter(item => !picker.query || `${item.name} ${item.desc}`.includes(picker.query)).map(item => {
          const selected = picker.selected.includes(item.id)
          return h(`button:mb-2 flex w-full items-start gap-3 rounded-xl border p-3 text-right ${selected
            ? 'border-[#d8d8dc] bg-[#f4f4f5]' : 'border-[#e8e8ea] bg-white'}`, {key: item.id,
            onClick: () => setPicker({...picker, selected: selected ? picker.selected.filter(id => id != item.id) : [...picker.selected, item.id]})},
          h(`span:mt-1 h-4 w-4 rounded border ${selected ? 'border-[#0f0f10] bg-[#0f0f10]' : 'border-[#d8d8dc]'}`, {},
            selected && h('L:Check', {size: 14, className: 'text-white'})), h('span:min-w-0 flex-1', {}, h('b:block text-sm', {}, item.name),
            h('small:mt-1 block text-[#6b6b6f]', {}, item.desc)), item.managed && h('span:text-[10px] text-[#6b6b6f]', {}, 'מנוהל'))
        })), h('div:flex items-center justify-between border-t border-[#e8e8ea] bg-[#fafafa] p-4', {},
          h('span:text-xs text-[#6b6b6f]', {}, 'בחירה מרובה'), h('div:flex gap-2', {}, h('button:rounded-xl px-4 py-2 text-sm', {
            onClick: () => setPicker()}, 'ביטול'), h('button:rounded-xl bg-[#0f0f10] px-4 py-2 text-sm font-semibold text-white', {
            onClick: attachSelected, 'aria-label': 'אישור בחירה'}, 'אישור בחירה')))))
  })
})

ReactComp('wonderPlatformResourceEditor', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh}}) => ({editors, setEditors, repo, saveEditor, deleteEditor, openPicker, requestClose}) => {
      const {classes, labels} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx), active = editors.at(-1)
      if (!active) return null
      const {resource, item} = active, update = value => setEditors(editors.map((entry, index) => index == editors.length - 1
        ? {...entry, item: typeof value == 'function' ? value(entry.item) : value} : entry))
      const readOnlyTool = resource == 'tools' && item.originalId && item.kind != 'flow'
      const saveDisabled = !item.name?.trim() || !item.id?.trim() || resource == 'skills' && !repo.marketplace && (!item.content?.trim()
        || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(item.publishVersion))
      return h('div:fixed inset-0 z-[80] bg-black/25', {}, h('section:absolute inset-y-0 left-0 w-full max-w-3xl overflow-y-auto bg-white shadow-2xl', {
        dir: 'rtl'}, h('div:sticky top-0 z-10 border-b border-[#e8e8ea] bg-white p-5', {}, h('div:flex flex-wrap gap-2 text-xs text-[#6b6b6f]', {},
        editors.map((entry, index) => h('button', {key: index,
          onClick: () => index == editors.length - 1 || requestClose(() => setEditors(editors.slice(0, index + 1)))},
          `${labels[entry.resource] || 'סט'} · ${entry.item.name || 'חדש'}`))), h('div:mt-3 flex items-center justify-between gap-4', {}, h('div', {},
        h('input:min-w-0 flex-1 text-xl font-bold outline-none', {value: item.name || '', placeholder: 'שם להצגה…',
          'aria-label': 'display_name', onInput: event => update({...item, name: event.target.value})}),
        h('span:text-xs text-[#6b6b6f]', {}, labels[resource])),
      h('div:flex items-center gap-2', {}, !readOnlyTool && h(`button:${classes.primary}`, {
        disabled: saveDisabled, onClick: saveEditor, 'aria-label': 'שמירת עורך'}, 'שמירה'),
        h('button:rounded-lg p-2 hover:bg-gray-100', {onClick: () => requestClose(() => setEditors(editors.slice(0, -1))),
          'aria-label': 'סגירה'}, h('L:X'))))),
      h('div:p-6', {}, hh(ctx, dsls.react['react-comp'].wonderPlatformResourceFields, {resource, item, update, repo, openPicker})),
      h('div:flex items-center justify-between border-t border-[#e8e8ea] p-5', {}, !readOnlyTool && active.item.originalId &&
        (resource != 'skills' || repo.marketplace) && h('button:text-sm text-red-600', {
        onClick: deleteEditor}, 'מחיקה'), h(`button:${classes.button} mr-auto`, {
        onClick: () => requestClose(() => setEditors(editors.slice(0, -1)))}, 'ביטול'))))
    }
  })
})
