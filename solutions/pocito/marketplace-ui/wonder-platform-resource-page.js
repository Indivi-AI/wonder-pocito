import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-resource-fields.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformResourcePage', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh}}) => ({active, update, save, deleteItem, back, repo, loadPackage, openPicker, saveAndRun, runningSet}) => {
      const {labels} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx), {resource, item} = active
      const readOnlyTool = resource == 'tools' && item.originalId && item.kind != 'flow'
      const isTool = resource == 'tools'
      const saveDisabled = !item.name?.trim() || !item.id?.trim()
        || (isTool && (!item.packageId?.trim() || !item.apiDescription?.trim() || !item.desc?.trim() || !item.outputCubes?.length))
        || (resource == 'skills' && !repo.marketplace && (!item.content?.trim()
          || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(item.publishVersion)))
      return h('main:min-h-screen min-w-0 flex-1 overflow-x-hidden pb-24 sm:pb-0', {},
        h('header:sticky top-0 z-20 flex items-center justify-between gap-2 border-b border-[#e8e8ea] bg-white px-3 py-2', {},
          h('div:flex items-center gap-1', {}, h('button:rounded-lg p-2 hover:bg-[#f4f4f5]', {onClick: back,
            'aria-label': `חזרה ל${labels[resource]}`}, h('L:ChevronRight', {size: 16})),
          !readOnlyTool && item.originalId && (resource != 'skills' || repo.marketplace) && h(
            'button:rounded-lg p-2 text-[#6b6b6f] hover:bg-red-50 hover:text-red-600', {onClick: deleteItem,
              'aria-label': `מחיקת ${item.name || ''}`, title: `מחיקת ${item.name || ''}`}, h('L:Trash2', {size: 16}))),
          !readOnlyTool && h('button:rounded-lg bg-[#0f0f10] p-2 text-white disabled:opacity-40', {disabled: saveDisabled,
            onClick: save, 'aria-label': 'שמירת עמוד', title: 'שמירה'}, h('L:Save', {size: 16}))),
        h('div:mx-auto max-w-4xl p-5', {}, hh(ctx, dsls.react['react-comp'].wonderPlatformResourceFields, {
          resource, item, update, repo, loadPackage, openPicker, saveAndRun, runningSet})))
    }
  })
})
