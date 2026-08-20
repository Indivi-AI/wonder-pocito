import { dsls } from '@jb6/core'
import '@jb6/react'
import './platform-v0-model.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('PlatformV0ResourceModal', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => {
      const {resources} = dsls.common.data.platformV0Config.$run()
      return ({draft, setDraft, saveResource}) => draft && h('div:fixed inset-0 z-[70] grid place-items-center bg-black/25 p-4', {
        onMouseDown: event => event.target == event.currentTarget && setDraft(null)
      }, h('section:w-full max-w-lg rounded-2xl border border-[#dfe5e1] bg-white p-6 shadow-2xl', {},
        h('div:flex items-center justify-between', {}, h('h2:text-lg font-bold text-[#202724]', {},
          draft.originalName ? 'עריכת פריט' : resources[draft.resource]?.createLabel),
          h('button:rounded-lg p-2 hover:bg-gray-100', {onClick: () => setDraft(null), 'aria-label': 'סגירה'}, h('L:X', {size: 17}))),
        h('label:mt-5 block text-xs font-semibold text-[#69726d]', {}, 'כותרת',
          h('input:mt-2 w-full rounded-xl border border-[#dfe5e1] px-3 py-2.5 text-sm outline-none focus:border-[#789b86]', {
            value: draft.title, onInput: event => setDraft({...draft, title: event.target.value})})),
        h('label:mt-4 block text-xs font-semibold text-[#69726d]', {}, 'מזהה',
          h('input:mt-2 w-full rounded-xl border border-[#dfe5e1] px-3 py-2.5 text-left text-sm outline-none', {
            dir: 'ltr', value: draft.name, disabled: !!draft.originalName, onInput: event => setDraft({...draft, name: event.target.value})})),
        h('label:mt-4 block text-xs font-semibold text-[#69726d]', {}, 'תיאור',
          h('textarea:mt-2 min-h-24 w-full resize-none rounded-xl border border-[#dfe5e1] px-3 py-2.5 text-sm outline-none', {
            value: draft.description, onInput: event => setDraft({...draft, description: event.target.value})})),
        draft.resource == 'skills' && h('label:mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl ' +
          'border border-dashed border-[#b9ccc0] p-4 text-sm text-[#42634f]', {},
          h('L:Upload', {size: 16}), draft.fileName || 'העלאת SKILL.md או ZIP',
          h('input:hidden', {type: 'file', accept: '.md,.zip,.json,.yaml,.yml', onChange: async event => {
            const file = event.target.files?.[0]
            if (!file) return
            const content = await file.text()
            setDraft(current => ({...current, title: current.title || file.name.replace(/\.[^.]+$/, ''),
              name: current.name || file.name.replace(/\W+/g, '-').toLowerCase(), fileName: file.name, content}))
          }})),
        h('div:mt-6 flex justify-end gap-2', {},
          h('button:rounded-xl px-4 py-2 text-sm text-[#68716c] hover:bg-gray-100', {onClick: () => setDraft(null)}, 'ביטול'),
          h('button:rounded-xl bg-[#2f6b4b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40', {
            disabled: !draft.title?.trim() || !draft.name?.trim(), onClick: saveResource
          }, draft.originalName ? 'שמירת שינויים' : 'יצירה ושמירה'))))
    }
  })
})
