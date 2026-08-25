import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformNavigation', {
  impl: comp({
    hFunc: (ctx, {react: {h, useState}}) => ({view, openView, brand, brandTagline, brandIcon, extraPrimaryNav, extraLibraryNav,
      conversations, conversationId, openConversation, newConversation}) => {
      const {primaryNav, libraryNav, mobileNav} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const [libraryOpen, setLibraryOpen] = useState(true)
      const fullPrimaryNav = [...(extraPrimaryNav || []), ...primaryNav], fullLibraryNav = [...libraryNav, ...(extraLibraryNav || [])]
      const item = ([id, icon, title]) => h(`button:w-full flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[13px] ` +
        `transition-colors ${view == id ? 'bg-[#f4f4f5] font-medium text-[#0f0f10]'
          : 'text-[#6b6b6f] hover:bg-[#fafafa] hover:text-[#0f0f10]'}`, {key: id, onClick: () => openView(id),
        'aria-label': title}, h(`L:${icon}`, {size: 16, className: 'shrink-0'}), title)
      const recent = (conversations || []).slice(0, 4)
      return h('div:contents', {}, h('aside:sticky top-0 z-40 hidden h-screen w-[248px] shrink-0 flex-col border-l ' +
        'border-[#e8e8ea] bg-white sm:flex 2xl:w-[288px]', {},
      h('div:flex items-center gap-2.5 px-4 pb-3 pt-5', {},
        h('span:grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-[#0f0f10] text-white', {},
          h(`L:${brandIcon || 'ShieldCheck'}`, {size: 15})),
        h('span:truncate text-[14px] font-semibold tracking-[-0.01em] text-[#0f0f10]', {}, brand || 'פלאגין סטודיו')),
      h('div:flex-1 overflow-y-auto px-2.5', {},
        newConversation && h('button:mb-4 flex w-full items-center justify-between rounded-[10px] bg-[#0f0f10] px-3 py-2 ' +
          'text-[13px] font-medium text-white transition-opacity hover:opacity-85', {onClick: () => newConversation()},
        'שיחה חדשה', h('L:Plus', {size: 15})),
        h('button:mt-6 flex w-full items-center justify-between px-2.5 pb-1.5 text-[11px] font-medium uppercase ' +
          'tracking-[0.06em] text-[#6b7280]', {onClick: () => setLibraryOpen(!libraryOpen)}, 'קטלוג',
        h(`L:${libraryOpen ? 'ChevronUp' : 'ChevronDown'}`, {size: 13})),
        libraryOpen && h('div', {}, fullPrimaryNav.map(item), fullLibraryNav.map(item)),
        recent.length > 0 && h('div:mt-6', {}, h('div:px-2.5 pb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] ' +
          'text-[#6b7280]', {}, 'שיחות אחרונות'),
          recent.map(conversation => h(`button:flex w-full items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-right ` +
            `text-[12px] transition-colors ${conversation.id == conversationId && view == 'chat'
              ? 'bg-[#f4f4f5] text-[#0f0f10]' : 'text-[#6b6b6f] hover:bg-[#fafafa]'}`,
          {key: conversation.id, onClick: () => openConversation(conversation.id)},
          h('span:min-w-0 flex-1 truncate', {}, conversation.title)))))),
      h('nav:fixed bottom-0 left-0 right-0 z-50 grid grid-cols-7 border-t border-[#e8e8ea] bg-white sm:hidden', {},
        [...(extraPrimaryNav || []), ...mobileNav, ...(extraLibraryNav || [])].slice(0, 7).map(([id, icon, title]) => h(
          `button:min-w-0 py-2 text-[8px] ${view == id ? 'text-[#0f0f10]' : 'text-gray-500'}`, {key: id, onClick: () => openView(id)},
          h(`L:${icon}`, {size: 16, className: 'mx-auto mb-0.5'}), h('span:block truncate', {}, title)))))
    }
  })
})
