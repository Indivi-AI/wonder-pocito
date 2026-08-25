import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-resource-fields.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformResourcePage', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh}}) => ({active, update, save, deleteItem, back, repo, openPicker, saveAndRun, runningSet}) => {
      const {classes, labels} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx), {resource, item} = active
      const readOnlyTool = resource == 'tools' && item.originalId && item.kind != 'flow'
      const saveDisabled = !item.name?.trim() || !item.id?.trim() || resource == 'skills' && !repo.marketplace && (!item.content?.trim()
        || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(item.publishVersion))
      return h('main:min-h-screen min-w-0 flex-1 overflow-x-hidden pb-24 sm:pb-0', {},
        h('header:sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-[#e8e8ea] bg-white px-5 py-4', {},
          h('button:rounded-lg p-2 hover:bg-[#f4f4f5]', {onClick: back, 'aria-label': `חזרה ל${labels[resource]}`}, h('L:ChevronRight', {size: 16})),
          h('span:text-xs text-[#6b6b6f]', {}, labels[resource]),
          h('input:min-w-0 flex-1 text-xl font-bold outline-none', {value: item.name || '', placeholder: 'שם להצגה…', 'aria-label': 'display_name',
            onInput: event => update({...item, name: event.target.value})}),
          h(`span:${classes.chip}`, {}, item.version || 'V0'),
          !readOnlyTool && h(`button:${classes.primary}`, {disabled: saveDisabled, onClick: save, 'aria-label': 'שמירת עמוד'}, 'שמירה'),
          !readOnlyTool && item.originalId && (resource != 'skills' || repo.marketplace) && h('button:text-sm text-red-600', {onClick: deleteItem}, 'מחיקה')),
        h('div:mx-auto max-w-4xl p-5', {}, hh(ctx, dsls.react['react-comp'].wonderPlatformResourceFields, {
          resource, item, update, repo, openPicker, saveAndRun, runningSet})))
    }
  })
})
