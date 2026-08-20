import { dsls } from '@jb6/core'
import '@jb6/react'
import './platform-v0-model.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('PlatformV0Navigation', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => {
      const {primaryNav, libraryNav, mobileNav} = dsls.common.data.platformV0Config.$run()
      return ({view, openView, setView}) => {
        const navButton = ([id, icon, title]) => h(
          'button:w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ' +
            (view == id ? 'bg-[#e7f1eb] text-[#204d36] font-semibold' : 'text-[#66706b] hover:bg-gray-50'),
          {key: id, onClick: () => openView(id), 'aria-label': title}, h(`L:${icon}`, {size: 17}), title)
        return h('div:contents', {},
          h('aside:fixed top-0 right-0 bottom-0 z-40 hidden sm:flex w-[210px] flex-col border-l border-[#e4e8e5] bg-white p-4', {},
            h('div:flex items-center gap-3 px-2 pb-6 font-bold text-[#202724]', {},
              h('span:grid h-8 w-8 place-items-center rounded-xl bg-[#2f6b4b] text-white', {}, h('L:ShieldCheck', {size: 17})),
              'פלאגין סטודיו'),
            primaryNav.map(navButton), h('div:px-3 pb-2 pt-7 text-xs text-[#a4aaa7]', {}, 'ספרייה'), libraryNav.map(navButton)),
          h('nav:fixed bottom-0 left-0 right-0 z-50 flex border-t border-[#e4e8e5] bg-white sm:hidden', {},
            mobileNav.map(([id, icon, title]) => h(
              `button:flex-1 py-2 text-[10px] ${view == id ? 'text-[#2f6b4b]' : 'text-gray-500'}`,
              {key: id, onClick: () => setView(id)}, h(`L:${icon}`, {size: 18, className: 'mx-auto mb-0.5'}), title))))
      }
    }
  })
})
