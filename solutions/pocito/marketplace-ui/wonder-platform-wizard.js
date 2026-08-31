import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformWizard', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({steps, activeId, onStep, rail, reason, finish}) => {
      const active = steps.find(step => step.id == activeId) || steps[0]
      if (rail) {
        const {classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
        const next = steps.slice(steps.indexOf(active) + 1).find(step => !step.disabled)
        const action = next ? {label: 'המשך', aria: 'המשך לשלב הבא', onClick: () => onStep(next.id)} : finish
        const mark = (step, index, current) => h(
          `span:grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border text-[11px] font-medium ${current
            ? 'border-[var(--wp-ink)] bg-[var(--wp-ink)] text-white'
            : step.done ? 'border-[var(--wp-border-strong)] text-[var(--wp-ink-2)]'
              : 'border-[var(--wp-border-strong)] text-[var(--wp-ink-4)]'}`,
          {}, step.done && !current ? h('L:Check', {size: 12}) : String(index + 1))
        const entry = (step, index) => {
          const current = step.id == active.id
          return h(`button:flex shrink-0 items-center gap-2 rounded-[8px] px-2 py-1 transition-colors ${current
            ? 'bg-[var(--wp-surface-3)]' : 'hover:bg-[var(--wp-surface-2)]'} ${step.disabled ? 'opacity-40' : ''}`,
          {key: step.id, disabled: step.disabled, onClick: () => onStep(step.id),
            'aria-current': current ? 'step' : undefined},
          mark(step, index, current),
          h(`span:text-[12px] font-medium ${current ? 'text-[var(--wp-ink)]' : 'text-[var(--wp-ink-3)]'}`, {}, step.label))
        }
        return h('div:flex h-full min-h-0 flex-col', {},
          h('nav:wp-scroll flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--wp-border)] px-5 py-3',
            {'aria-label': 'שלבי הבנייה'},
            ...steps.flatMap((step, index) => [index > 0 &&
              h('span:h-px w-10 shrink-0 bg-[var(--wp-border)]', {key: `line-${step.id}`}), entry(step, index)])),
          h('div:wp-scroll min-h-0 flex-1 overflow-y-auto', {},
            h('div:mx-auto w-full max-w-[840px] px-6 py-6', {}, active.render())),
          h('div:flex shrink-0 items-center justify-between gap-4 border-t border-[var(--wp-border)] ' +
            'bg-[var(--wp-surface)] px-6 py-3', {},
          h('p:min-w-0 truncate text-[12px] text-[var(--wp-ink-3)]', {}, reason || ''),
          action && h(`button:${classes.primary}`, {disabled: !!action.disabled, onClick: action.onClick,
            'aria-label': action.aria}, action.label, h('L:ArrowLeft', {size: 15}))))
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
