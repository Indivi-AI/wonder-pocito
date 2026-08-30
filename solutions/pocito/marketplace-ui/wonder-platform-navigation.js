import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-kit.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformNavigation', {
  impl: comp({
    hFunc: (ctx, {react: {h, useState}}) => ({view, openView, brand, brandTagline, brandIcon, extraLibraryNav,
      conversations, conversationId, openConversation, newConversation, createAgent}) => {
      const {primaryNav, catalogNav, catalogViews, classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const [catalogOpen, setCatalogOpen] = useState(catalogViews.includes(view))
      const fullCatalogNav = [...catalogNav, ...(extraLibraryNav || [])]
      const groupLabel = text => h('div:px-2.5 pb-1.5 pt-5 text-[11px] font-medium text-[var(--wp-ink-4)]', {}, text)
      const item = ([id, icon, title]) => h(`button:flex h-8 w-full items-center gap-2.5 rounded-[8px] px-2.5 text-[13px] ` +
        `transition-colors ${view == id ? 'bg-[var(--wp-surface)] font-medium text-[var(--wp-ink)] shadow-[var(--wp-sh-1)]'
          : 'text-[var(--wp-ink-2)] hover:bg-[var(--wp-surface-3)] hover:text-[var(--wp-ink)]'}`,
      {key: id, onClick: () => openView(id), 'aria-current': view == id ? 'page' : undefined},
      h(`L:${icon}`, {size: 15, className: `shrink-0 ${view == id ? 'text-[var(--wp-ink)]' : 'text-[var(--wp-ink-4)]'}`}), title)
      const recent = (conversations || []).slice(0, 5)
      const conversationRow = conversation => h(`button:flex h-8 w-full items-center rounded-[8px] px-2.5 ` +
        `text-right text-[12px] transition-colors ${conversation.id == conversationId && view == 'chat'
          ? 'bg-[var(--wp-surface)] font-medium text-[var(--wp-ink)] shadow-[var(--wp-sh-1)]'
          : 'text-[var(--wp-ink-3)] hover:bg-[var(--wp-surface-3)] hover:text-[var(--wp-ink)]'}`,
      {key: conversation.id, onClick: () => openConversation(conversation.id)},
      h('span:min-w-0 flex-1 truncate', {}, conversation.title))
      return h('div:contents', {},
        h('aside:wp-scroll sticky top-0 z-40 hidden h-screen w-[260px] shrink-0 flex-col ' +
          'border-l border-[var(--wp-border)] sm:flex', {},
        h('div:flex items-center gap-2.5 px-4 py-3.5', {},
          h('span:grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[var(--wp-ink)] text-white', {},
            h(`L:${brandIcon || 'ShieldCheck'}`, {size: 16})),
          h('span:min-w-0', {}, h('span:block truncate text-[14px] font-semibold text-[var(--wp-ink)]', {}, brand || 'פלאגין סטודיו'),
            brandTagline && h('span:block truncate text-[11px] text-[var(--wp-ink-4)]', {}, brandTagline))),
        h('div:wp-scroll flex-1 overflow-y-auto px-2.5 pb-4', {},
          newConversation && h(`button:${classes.primary} mt-1 w-full`,
            {onClick: () => newConversation()}, h('L:Plus', {size: 15}), 'שיחה חדשה'),
          createAgent && h(`button:${classes.button} mt-1.5 w-full`,
            {onClick: () => createAgent()}, h('L:Plus', {size: 15}), 'סוכן חדש'),
          h('div:mt-4 space-y-px', {}, primaryNav.map(item)),
          recent.length > 0 && h('div', {}, groupLabel('שיחות אחרונות'),
            h('div:space-y-px', {}, recent.map(conversationRow))),
          h('button:flex w-full items-center justify-between px-2.5 pb-1.5 pt-5 text-[11px] font-medium ' +
            'text-[var(--wp-ink-4)] transition-colors hover:text-[var(--wp-ink-2)]',
          {onClick: () => setCatalogOpen(!catalogOpen), 'aria-expanded': catalogOpen}, 'ניהול נכסים',
          h(`L:${catalogOpen ? 'ChevronUp' : 'ChevronDown'}`, {size: 13})),
          catalogOpen && h('div:space-y-px', {}, fullCatalogNav.map(item)))))
    }
  })
})
