import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-kit.js'
import './wonder-platform-workspace.js'
import './wonder-platform-resource-fields.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformJourneyBar', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({stack, goToDepth}) => {
      const {resources, labels} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const name = entry => entry.item.name?.trim() || entry.createLabel || `${labels[entry.resource]} חדש`
      const crumb = (entry, index, last) => h(
        `button:flex min-w-0 shrink-0 items-center gap-1.5 text-[13px] transition-colors ${last
          ? 'font-semibold text-[var(--wp-ink)]' : 'font-medium text-[var(--wp-ink-2)] hover:text-[var(--wp-ink)]'}`,
        {key: index, disabled: last, onClick: () => goToDepth(index), title: name(entry)},
        h(`L:${entry.item.icon || resources[entry.resource]?.icon || 'Dot'}`, {size: 14, className: 'shrink-0'}),
        h('span:max-w-[18ch] truncate', {}, name(entry)))
      const sep = key => h('L:ChevronLeft', {key, size: 14, className: 'shrink-0 text-[var(--wp-ink-3)]'})
      return h('div:wp-scroll flex items-center gap-1.5 overflow-x-auto', {},
        ...stack.flatMap((entry, index) => [index > 0 && sep(`s${index}`),
          crumb(entry, index, index == stack.length - 1)]))
    }
  })
})

ReactComp('wonderPlatformJourney', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh, useEffect, useRef, useState}}) => props => {
      const {stack, repo, popFrame, goToDepth, updateTop, saveTop, deleteTop, openPicker, openEditor,
        loadPackage, saveAndRun, runningSet, runTarget, runEval, exit} = props
      const {classes, labels, resources} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const [confirmDelete, setConfirmDelete] = useState(false)
      const active = stack.at(-1), {resource, item} = active, parent = stack.at(-2)
      const [panelOpen, setPanelOpen] = useState(() => ['plugins', 'agents'].includes(resource) || window.innerWidth >= 1600)
      const [tab, setTab] = useState('test')
      const bodyRef = useRef(null)
      useEffect(() => { bodyRef.current?.scrollTo(0, 0) }, [active.baseline])
      const parentName = parent && (parent.item.name?.trim() || `${labels[parent.resource]} חדש`)
      const isComposite = ['plugins', 'subagents', 'agents'].includes(resource)
      const readOnlyTool = resource == 'tools' && item.originalId && item.kind != 'flow'
      const saveDisabled = !item.name?.trim() || !item.id?.trim()
        || (resource == 'tools' && (!item.packageId?.trim() || !item.apiDescription?.trim()
          || !item.desc?.trim() || !item.outputCubes?.length))
        || (resource == 'skills' && !repo.marketplace && (!item.content?.trim()
          || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(item.publishVersion)))
        || (isComposite && (!item.apiDescription?.trim() || !item.desc?.trim()
          || !(resource == 'plugins' ? item.readme : item.instructions)?.trim()))
      const canDelete = !readOnlyTool && item.originalId && (resource != 'skills' || repo.marketplace)
      const saveLabel = parent ? `שמירה וחזרה ל${parentName}` : 'שמירה'
      return h(`main:${classes.page} h-screen flex flex-col overflow-x-hidden`, {},
        h('header:sticky top-0 z-30 shrink-0 border-b border-[var(--wp-border)] bg-[var(--wp-surface)]/92 px-5 backdrop-blur',
          {},
          h('div:flex h-[64px] items-center gap-3', {},
            h(`button:${classes.icon} -mr-1.5`, {onClick: () => parent ? popFrame() : exit(),
              'aria-label': parent ? `חזרה ל${parentName}` : `חזרה ל${resources[resource]?.title || ''}`},
              h('L:ChevronRight', {size: 17})),
            hh(ctx, dsls.react['react-comp'].wonderPlatformMark,
              {icon: item.icon || resources[resource]?.icon, text: item.mark, size: 'sm'}),
            h('div:min-w-0 flex-1', {},
              h('h1:truncate text-[15px] font-semibold text-[var(--wp-ink)]',
                {title: item.name || ''}, item.name || active.createLabel || `${labels[resource]} חדש`),
              h('p:truncate text-[12px] text-[var(--wp-ink-4)]', {dir: 'auto'}, item.id || '')),
            readOnlyTool && h(`span:${classes.chip}`, {}, 'לקריאה בלבד'),
            isComposite && h(`button:${classes.icon} ${panelOpen ? 'bg-[var(--wp-surface-3)]' : ''}`,
              {onClick: () => setPanelOpen(!panelOpen), 'aria-expanded': panelOpen, title: 'הרצת ניסוי',
                'aria-label': panelOpen ? 'סגירת פאנל הרצת ניסוי' : 'פתיחת פאנל הרצת ניסוי'}, h('L:MessageCircle', {size: 16})),
            canDelete && h(`button:${classes.icon} hover:bg-[var(--wp-danger-soft)] hover:text-[var(--wp-danger)]`,
              {onClick: () => setConfirmDelete(true), 'aria-label': `מחיקת ${item.name || ''}`},
              h('L:Trash2', {size: 16})),
            !readOnlyTool && h(`button:${classes.primary}`, {disabled: saveDisabled, onClick: () => saveTop(),
              'aria-label': 'שמירת המסע'}, saveLabel)),
          stack.length > 1 && h('div:flex items-center gap-2.5 pb-3', {},
            h('span:shrink-0 text-[12px] font-medium text-[var(--wp-ink-3)]', {}, 'נבנה עבור'),
            hh(ctx, dsls.react['react-comp'].wonderPlatformJourneyBar, {stack, goToDepth}))),
        h('div:wp-scroll min-h-0 flex-1 overflow-y-auto', {ref: bodyRef}, isComposite
          ? hh(ctx, dsls.react['react-comp'].wonderPlatformWorkspace, {workspace: active, repo,
            openPicker, openEditor, runTarget, runEval, update: updateTop, panelOpen, setPanelOpen, tab, setTab})
          : h('div:mx-auto max-w-[820px] px-6 pb-24 pt-7', {},
            hh(ctx, dsls.react['react-comp'].wonderPlatformResourceFields,
              {resource, item, update: updateTop, repo, loadPackage, openPicker, saveAndRun, runningSet}))),
        confirmDelete && hh(ctx, dsls.react['react-comp'].wonderPlatformDialog, {title: 'מחיקת פריט',
          body: `למחוק לצמיתות את "${item.name || item.id}"? לא ניתן לשחזר פעולה זו.`,
          close: () => setConfirmDelete(false),
          actions: [['מחיקה', () => (setConfirmDelete(false), deleteTop()), 'danger'],
            ['ביטול', () => setConfirmDelete(false)]]}))
    }
  })
})
