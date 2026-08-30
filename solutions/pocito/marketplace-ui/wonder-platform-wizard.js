import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformWizard', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({steps, activeId, onStep, rail}) => {
      const active = steps.find(step => step.id == activeId) || steps[0]
      if (rail) {
        return h('div', {},
          h('nav:relative border-b border-[var(--wp-border)] px-5 py-6', {},
            h('div:flex items-center justify-center gap-8', {},
              steps.map((step, idx) => h('div:flex flex-col items-center', {key: step.id},
                h('button:grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-[12px] font-medium ' +
                  `transition-colors ${step.id == active.id ? 'border-[var(--wp-ink)] text-[var(--wp-ink)]' :
                  step.done ? 'border-[var(--wp-ink-3)] bg-[var(--wp-ink-3)] text-white' :
                  'border-[var(--wp-ink-4)] text-[var(--wp-ink-4)]'}`,
                {onClick: () => onStep(step.id)}, step.done ? h('L:Check', {size: 14}) : String(idx + 1)),
                h('span:mt-2 w-14 truncate text-center text-[11px] text-[var(--wp-ink-3)]', {}, step.label))),
              h('svg:absolute top-0 left-0 h-full w-full pointer-events-none', {viewBox: `0 0 ${32 * steps.length} 32`,
                preserveAspectRatio: 'none'}, steps.slice(0, -1).map((_, idx) => h('line', {key: idx,
                x1: `${32 * (idx + 0.5)}`, y1: '16', x2: `${32 * (idx + 1.5)}`, y2: '16',
                stroke: 'var(--wp-border)', strokeWidth: '1'})))
            )),
          h('div:pt-5', {}, active.render()))
      }
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
