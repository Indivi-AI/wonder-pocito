import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-kit.js'
import './wonder-platform-resource-fields.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformResourcePage', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh}}) =>
      ({active, update, save, deleteItem, back, repo, loadPackage, openPicker, saveAndRun, runningSet}) => {
        const {labels, resources, classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx), {resource, item} = active
        const readOnlyTool = resource == 'tools' && item.originalId && item.kind != 'flow'
        const isTool = resource == 'tools'
        const saveDisabled = !item.name?.trim() || !item.id?.trim()
          || (isTool && (!item.packageId?.trim() || !item.apiDescription?.trim() || !item.desc?.trim() || !item.outputCubes?.length))
          || (resource == 'skills' && !repo.marketplace && (!item.content?.trim()
            || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(item.publishVersion)))
        const canDelete = !readOnlyTool && item.originalId && (resource != 'skills' || repo.marketplace)
        return h(`main:${classes.page} wp-scroll overflow-x-hidden`, {},
          hh(ctx, dsls.react['react-comp'].wonderPlatformDetailHeader, {
            title: item.name || active.createLabel || `${labels[resource]} חדש`, subtitle: item.id,
            icon: item.icon || resources[resource]?.icon, back, backLabel: `חזרה ל${labels[resource]}`,
            badge: readOnlyTool && h(`span:${classes.chip}`, {}, 'לקריאה בלבד'),
            actions: [canDelete && h(`button:${classes.icon} hover:bg-[var(--wp-danger-soft)] hover:text-[var(--wp-danger)]`,
              {key: 'delete', onClick: deleteItem, 'aria-label': `מחיקת ${item.name || ''}`,
                title: `מחיקת ${item.name || ''}`}, h('L:Trash2', {size: 16})),
            !readOnlyTool && h(`button:${classes.primary}`, {key: 'save', disabled: saveDisabled, onClick: save,
              title: saveDisabled ? 'השלימו את שדות החובה כדי לשמור' : 'שמירה'}, 'שמירה')]}),
          h('div:mx-auto max-w-[820px] px-6 pb-24 pt-7', {}, hh(ctx, dsls.react['react-comp'].wonderPlatformResourceFields, {
            resource, item, update, repo, loadPackage, openPicker, saveAndRun, runningSet})))
      }
  })
})
