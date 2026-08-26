import { dsls } from '@jb6/core'
import '@jb6/react'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformWizard', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({steps, activeId, onStep}) => {
      const active = steps.find(step => step.id == activeId) || steps[0]
      return h('div:space-y-4', {},
        h('nav:flex flex-wrap gap-1 border-b border-[#e8e8ea] pb-2', {}, steps.map(step => h(
          `button:rounded-lg px-3 py-2 text-right text-sm ${step.id == active.id
            ? 'bg-[#0f0f10] font-semibold text-white' : step.disabled
              ? 'cursor-not-allowed text-[#b9b9be]' : 'text-[#2e2e2e] hover:bg-[#f4f4f5]'}`,
          {key: step.id, disabled: step.disabled, onClick: () => onStep(step.id)}, step.label))),
        h('div', {}, active.render()))
    }
  })
})
