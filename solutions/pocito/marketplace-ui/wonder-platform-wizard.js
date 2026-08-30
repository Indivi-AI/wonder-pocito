import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformWizard', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({steps, activeId, onStep}) => {
      const active = steps.find(step => step.id == activeId) || steps[0]
      return h('div', {},
        h('nav:flex flex-wrap items-center gap-5 border-b border-[var(--wp-border)]', {}, steps.map(step => h(
          `button:-mb-px border-b-2 pb-2.5 text-[13px] font-medium transition-colors ${step.id == active.id
            ? 'border-b-[color:var(--wp-ink)] text-[var(--wp-ink)]'
            : 'border-b-transparent text-[var(--wp-ink-3)] hover:text-[var(--wp-ink)]'} ${
            step.disabled ? 'pointer-events-none opacity-40' : ''}`,
          {key: step.id, disabled: step.disabled, onClick: () => onStep(step.id)}, step.label))),
        h('div:pt-5', {}, active.render()))
    }
  })
})
