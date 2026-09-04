import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

const wonderPlatformStepIcon = {thinking: 'Lightbulb', tool: 'Wrench', model: 'Sparkles', skill: 'BookOpenText'}
const wonderPlatformStepLabel = {thinking: 'חשיבה', tool: 'כלי', model: 'מודל', skill: 'מיומנות'}

const wonderPlatformParsePayload = value => {
  if (typeof value != 'string') return value
  try { return JSON.parse(value) } catch { /* not JSON, try python-repr next */ }
  try {
    return JSON.parse(value.replace(/'/g, '"').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null'))
  } catch { return value }
}

ReactComp('wonderPlatformTracePayload', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({label, value}) => {
      const {classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const parsed = wonderPlatformParsePayload(value)
      const text = typeof parsed == 'string' ? parsed : JSON.stringify(parsed, null, 2)
      const kb = (new Blob([text]).size / 1024).toFixed(1)
      return h('div', {},
        h('div:flex items-center justify-between gap-2', {},
          h(`b:${classes.metaMono}`, {}, `${label} · ${kb}KB`),
          h('button:shrink-0 text-[var(--wp-ink-4)] transition-colors hover:text-[var(--wp-ink)]',
            {onClick: () => navigator.clipboard?.writeText(text), 'aria-label': 'העתקה', title: 'העתקה'}, h('L:Copy', {size: 11}))),
        h(`pre:${classes.code} mt-1 max-h-60 whitespace-pre-wrap break-all`, {dir: 'ltr'}, text))
    }
  })
})

ReactComp('wonderPlatformTraceStep', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh}}) => ({step}) => {
      const payload = [['קלט', step.input], ['פלט', step.output]].filter(([, value]) => value != null && value !== '')
      const icon = step.running ? 'Loader2' : step.error ? 'CircleAlert' : wonderPlatformStepIcon[step.type] || 'Circle'
      const isAscii = /^[\x00-\x7F]+$/.test(step.title || '')
      return h('div:flex gap-2.5 py-1.5', {},
        h(`span:mt-[2px] shrink-0 ${step.error ? 'text-[var(--wp-danger)]' : 'text-[var(--wp-ink-4)]'}`, {},
          h(`L:${icon}`, {size: 13, className: step.running ? 'animate-spin' : ''})),
        h('div:min-w-0 flex-1', {},
          h('div:flex items-center gap-2', {},
            h('span:sr-only', {}, wonderPlatformStepLabel[step.type] || step.type),
            h(`span:min-w-0 flex-1 truncate text-[12.5px] font-medium ${isAscii ? 'wp-num text-[var(--wp-ink)]' : 'text-[var(--wp-ink-2)]'}`,
              {dir: isAscii ? 'ltr' : 'auto'}, step.title),
            step.running ? h('span:shrink-0 text-[11px] text-[var(--wp-ink-5)]', {}, 'פועל…')
              : step.seconds != null && h('span:shrink-0 wp-num text-[11px] text-[var(--wp-ink-5)]', {}, `${step.seconds.toFixed(1)} שנ׳`)),
          step.detail && h('p:mt-0.5 whitespace-pre-wrap text-[12px] leading-[1.6] text-[var(--wp-ink-3)]', {dir: 'auto'}, step.detail),
          payload.length > 0 && h('details:group/io mt-1', {},
            h('summary:flex list-none cursor-pointer items-center gap-1 text-[11px] font-medium text-[var(--wp-ink-4)]', {},
              h('L:ChevronRight', {size: 11, className: 'transition-transform group-open/io:-rotate-90'}), 'קלט ופלט'),
            h('div:mt-1.5 space-y-1.5 ps-[15px]', {}, payload.map(([label, value]) => hh(ctx,
              dsls.react['react-comp'].wonderPlatformTracePayload, {key: label, label, value})))),
          step.error && typeof step.error == 'string' && h('p:mt-0.5 text-[12px] text-[var(--wp-danger)]', {dir: 'auto'}, step.error)))
    }
  })
})

ReactComp('wonderPlatformRunTrace', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh, useEffect, useState}}) => ({steps, status, duration, dense}) => {
      const [open, setOpen] = useState(true), [touched, setTouched] = useState(false)
      const running = status == 'בהרצה…' || status == 'מריץ…'
      useEffect(() => { if (!running && !touched) setOpen(false) }, [running, touched])
      if (!(steps || []).length) return running && h('div:mt-3 flex items-center gap-2 text-[12px] text-[var(--wp-ink-4)]', {},
        h('L:Loader2', {size: 13, className: 'animate-spin'}), 'מתחבר…')
      const toolCount = steps.filter(step => step.type == 'tool' || step.type == 'skill').length
      const thinkCount = steps.filter(step => step.type == 'thinking').length
      const errorCount = steps.filter(step => step.error).length
      const current = running ? [...steps].reverse().find(step => step.running) : null
      const summary = running ? (current ? `מריץ ${current.title}…` : 'חושב…')
        : [toolCount && `${toolCount} כלים`, thinkCount && `${thinkCount} שלבי חשיבה`, duration].filter(Boolean).join(' · ')
          || `${steps.length} שלבים`
      return h('details:mt-3', {open, onToggle: event => { setTouched(true); setOpen(event.target.open) }},
        h('summary:flex cursor-pointer list-none items-center gap-1.5 text-[12px] text-[var(--wp-ink-4)]', {},
          h('span', {}, summary), errorCount > 0 && h('span:text-[var(--wp-danger)]', {}, `· ${errorCount} שגיאות`)),
        h(`div:mt-1.5 border-s border-[var(--wp-border)] ${dense ? 'ps-2.5' : 'ps-3'}`, {},
          steps.map((step, index) => hh(ctx, dsls.react['react-comp'].wonderPlatformTraceStep, {key: index, step}))))
    }
  })
})
