import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformNavigation', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({view, openView}) => {
      const {primaryNav, libraryNav, mobileNav} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const item = ([id, icon, title]) => h(`button:w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${view == id
        ? 'bg-[#e7f1eb] font-semibold text-[#204d36]' : 'text-[#66706b] hover:bg-gray-50'}`, {key: id, onClick: () => openView(id),
        'aria-label': title}, h(`L:${icon}`, {size: 17}), title)
      return h('div:contents', {}, h('aside:fixed top-0 right-0 bottom-0 z-40 hidden w-[210px] flex-col border-l border-[#e4e8e5] ' +
        'bg-white p-4 sm:flex', {}, h('div:flex items-center gap-3 px-2 pb-6 font-bold text-[#202724]', {},
        h('span:grid h-8 w-8 place-items-center rounded-xl bg-[#2f6b4b] text-white', {}, h('L:ShieldCheck', {size: 17})), 'פלאגין סטודיו'),
      primaryNav.map(item), h('div:px-3 pb-2 pt-7 text-xs text-[#a4aaa7]', {}, 'ספרייה'), libraryNav.map(item)),
      h('nav:fixed bottom-0 left-0 right-0 z-50 grid grid-cols-7 border-t border-[#e4e8e5] bg-white sm:hidden', {},
        mobileNav.map(([id, icon, title]) => h(`button:min-w-0 py-2 text-[8px] ${view == id ? 'text-[#2f6b4b]' : 'text-gray-500'}`, {
          key: id, onClick: () => openView(id)}, h(`L:${icon}`, {size: 16, className: 'mx-auto mb-0.5'}), h('span:block truncate', {}, title)))))
    }
  })
})
