import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-kit.js'
import './wonder-platform-workspace.js'
import './wonder-platform-resource-fields.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformJourneyBar', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({stack, goToDepth, exit}) => {
      const {resources, newLabels} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const name = entry => entry.item.name?.trim() || entry.createLabel || newLabels[entry.resource]
      const root = resources[stack[0].resource] || {}
      const crumbs = [{icon: root.icon, title: root.title || '', onClick: exit},
        ...stack.map((entry, index) => ({icon: entry.item.icon || resources[entry.resource]?.icon || 'Dot',
          title: name(entry), onClick: () => goToDepth(index)}))]
      const crumb = (value, index, last) => h(
        `button:flex min-w-0 shrink-0 items-center gap-1.5 text-[13px] transition-colors ${last
          ? 'font-semibold text-[var(--wp-ink)]' : 'font-medium text-[var(--wp-ink-2)] hover:text-[var(--wp-ink)]'}`,
        {key: index, disabled: last, onClick: value.onClick, title: value.title},
        h(`L:${value.icon || 'Dot'}`, {size: 14, className: 'shrink-0'}),
        h('span:max-w-[24ch] truncate', {}, value.title))
      const sep = key => h('L:ChevronLeft', {key, size: 13, className: 'shrink-0 text-[var(--wp-ink-4)]'})
      return h('div:wp-scroll flex h-full items-center gap-2.5 overflow-x-auto', {'aria-label': 'מסלול הבנייה'},
        ...crumbs.flatMap((value, index) => [index > 0 && sep(`s${index}`),
          crumb(value, index, index == crumbs.length - 1)]))
    }
  })
})

ReactComp('wonderPlatformJourney', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh, useEffect, useRef, useState}}) => props => {
      const {stack, repo, popFrame, goToDepth, updateTop, saveTop, deleteTop, openPicker, openEditor, createNested,
        loadPackage, saveAndRun, runningSet, runTarget, runEval, finishAgent, exit} = props
      const {classes, newLabels, resources} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const [confirmDelete, setConfirmDelete] = useState(false)
      const active = stack.at(-1), {resource, item} = active, parent = stack.at(-2)
      const [panelOpen, setPanelOpen] = useState(true)
      const [tab, setTab] = useState('test')
      const bodyRef = useRef(null)
      useEffect(() => { bodyRef.current?.scrollTo(0, 0); setPanelOpen(true) }, [active.baseline])
      const parentName = parent && (parent.item.name?.trim() || newLabels[parent.resource])
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
      const isAgent = resource == 'agents'
      const saveReason = !item.name?.trim() ? 'הוסיפו שם להצגה' : !item.id?.trim() ? 'הוסיפו מזהה'
        : resource == 'tools' && !item.packageId?.trim() ? 'הזינו מזהה מארז Flow וטענו אותו'
          : resource == 'tools' && !item.outputCubes?.length ? 'בחרו לפחות קוביית פלט אחת'
            : resource == 'skills' && !repo.marketplace && !item.content?.trim() ? 'הוסיפו את תוכן המיומנות'
              : saveDisabled ? 'השלימו את שדות החובה כדי לשמור' : `מוכן לשמירה${parent ? ` וחזרה ל${parentName}` : ''}`
      return h('main:flex h-screen min-w-0 flex-1 flex-col overflow-hidden bg-[var(--wp-surface)]', {},
        h('header:z-30 shrink-0 border-b border-[var(--wp-border)] bg-[var(--wp-surface)] px-5', {},
          h('div:flex h-[64px] items-center gap-3', {},
            h(`button:${classes.icon} -mr-1.5`, {onClick: () => parent ? popFrame() : exit(),
              'aria-label': parent ? `חזרה ל${parentName}` : `חזרה ל${resources[resource]?.title || ''}`},
              h('L:ChevronRight', {size: 17})),
            hh(ctx, dsls.react['react-comp'].wonderPlatformMark,
              {icon: item.icon || resources[resource]?.icon, text: item.mark, size: 'sm'}),
            h('div:min-w-0 flex-1', {dir: 'rtl'},
              h('h1:truncate text-[15px] font-semibold text-[var(--wp-ink)]',
                {title: item.name || ''}, item.name || active.createLabel || newLabels[resource]),
              h('p:truncate text-[12px] text-[var(--wp-ink-4)]', {dir: 'ltr'}, item.id || '')),
            readOnlyTool && h(`span:${classes.chip}`, {}, 'לקריאה בלבד'),
            isComposite && h(`button:${classes.icon} ${panelOpen ? 'bg-[var(--wp-surface-3)]' : ''}`,
              {onClick: () => setPanelOpen(!panelOpen), 'aria-expanded': panelOpen, title: 'הרצת ניסוי',
                'aria-label': panelOpen ? 'סגירת פאנל הרצת ניסוי' : 'פתיחת פאנל הרצת ניסוי'}, h('L:MessageCircle', {size: 16})),
            canDelete && h(`button:${classes.icon} hover:bg-[var(--wp-danger-soft)] hover:text-[var(--wp-danger)]`,
              {onClick: () => setConfirmDelete(true), 'aria-label': `מחיקת ${item.name || ''}`},
              h('L:Trash2', {size: 16})),
            !readOnlyTool && h(`button:${classes.primary}`, {disabled: saveDisabled, onClick: () => saveTop(),
              'aria-label': 'שמירת המסע'}, saveLabel)),
          h('div:h-[38px] border-t border-[var(--wp-border)]', {},
            hh(ctx, dsls.react['react-comp'].wonderPlatformJourneyBar, {stack, goToDepth, exit}))),
        h('div:min-h-0 flex-1 overflow-hidden', {ref: bodyRef}, isComposite
          ? hh(ctx, dsls.react['react-comp'].wonderPlatformWorkspace, {workspace: active, repo, openPicker, openEditor,
            createNested, runTarget, runEval, update: updateTop, panelOpen, setPanelOpen, tab, setTab,
            finish: isAgent ? finishAgent : saveTop, finishLabel: isAgent ? 'סיום · שוחח עם הסוכן' : saveLabel,
            finishAria: isAgent ? 'סיום ומעבר לשיחה' : 'שמירת המסע'})
          : hh(ctx, dsls.react['react-comp'].wonderPlatformResourceFields,
            {resource, item, update: updateTop, repo, loadPackage, openPicker, saveAndRun, runningSet, reason: saveReason,
              finish: {label: saveLabel, aria: 'שמירת המסע', disabled: saveDisabled, onClick: () => saveTop()}})),
        confirmDelete && hh(ctx, dsls.react['react-comp'].wonderPlatformDialog, {title: 'מחיקת פריט',
          body: `למחוק לצמיתות את "${item.name || item.id}"? לא ניתן לשחזר פעולה זו.`,
          close: () => setConfirmDelete(false),
          actions: [['מחיקה', () => (setConfirmDelete(false), deleteTop()), 'danger'],
            ['ביטול', () => setConfirmDelete(false)]]}))
    }
  })
})
