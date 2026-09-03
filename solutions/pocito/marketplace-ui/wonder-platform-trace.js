import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

const wonderPlatformStepIcon = {thinking: 'Lightbulb', tool: 'Wrench', model: 'Sparkles'}
const wonderPlatformStepLabel = {thinking: 'חשיבה', tool: 'כלי', model: 'מודל'}

ReactComp('wonderPlatformTraceStep', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({step}) => {
      const {classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const payload = [['קלט', step.input], ['פלט', step.output]].filter(([, value]) => value != null && value !== '')
      return h('div:flex gap-2.5 py-2', {}, h(
        `span:grid h-6 w-6 shrink-0 place-items-center rounded-full border ${step.error
          ? 'border-[var(--wp-danger)] text-[var(--wp-danger)]' : 'border-[var(--wp-border-strong)] text-[var(--wp-ink-3)]'}`,
        {}, h(`L:${step.error ? 'CircleAlert' : wonderPlatformStepIcon[step.type] || 'Circle'}`, {size: 12})),
        h('div:min-w-0 flex-1', {},
          h('div:flex items-center gap-2', {},
            h(`span:${classes.chip}`, {}, wonderPlatformStepLabel[step.type] || step.type),
            h('span:min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--wp-ink-2)]', {}, step.title),
            step.seconds != null && h('span:shrink-0 text-[11px] text-[var(--wp-ink-4)]', {}, `${step.seconds.toFixed(1)} שנ׳`)),
          step.detail && h('p:mt-1 whitespace-pre-wrap text-[12px] leading-[1.6] text-[var(--wp-ink-3)]', {}, step.detail),
          payload.length > 0 && h('details:mt-1.5', {},
            h('summary:cursor-pointer text-[11px] font-medium text-[var(--wp-ink-3)]', {}, 'קלט ופלט'),
            h('div:mt-1.5 space-y-1.5', {}, payload.map(([label, value]) => h('div', {key: label},
              h('b:text-[11px] font-medium text-[var(--wp-ink-3)]', {}, label),
              h('pre:wp-scroll mt-1 max-w-full overflow-x-auto rounded-[8px] bg-[var(--wp-surface-2)] p-2 text-[11px] leading-[1.6]',
                {dir: 'ltr'}, typeof value == 'string' ? value : JSON.stringify(value, null, 2)))))),
          step.error && typeof step.error == 'string' && h('p:mt-1 text-[12px] text-[var(--wp-danger)]', {}, step.error)))
    }
  })
})

ReactComp('wonderPlatformRunTrace', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh}}) => ({steps, status}) => (steps || []).length > 0 && h(
      'details:mt-3 rounded-[8px] border border-[var(--wp-border)] bg-[var(--wp-surface-2)]', {},
      h('summary:cursor-pointer list-none px-3 py-2 text-[12px] text-[var(--wp-ink-3)]', {},
        `מעקב הרצה · ${steps.length} שלבים${status ? ` · ${status}` : ''}`),
      h('div:divide-y divide-[var(--wp-border)] border-t border-[var(--wp-border)] px-3', {},
        steps.map((step, index) => hh(ctx, dsls.react['react-comp'].wonderPlatformTraceStep, {key: index, step}))))
  })
})
