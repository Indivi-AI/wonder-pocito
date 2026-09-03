import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformAgentResult', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({result, setMessage}) => {
      const {classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      return h(`div:${classes.card}`, {},
        result.runId && h('div:mb-3 flex items-center justify-end', {},
          h(`span:${classes.mono}`, {}, result.runId)),
        h('div:whitespace-pre-wrap text-[13px] leading-7', {dir: 'auto'}, result.text || result.output),
        (result.followUps || []).length > 0 && h('div:mt-4 flex flex-wrap gap-2', {}, result.followUps.map(text => h(
          'button:rounded-full border border-[var(--wp-border-strong)] bg-[var(--wp-surface-3)] px-3 py-1.5 ' +
          'text-[12px] text-[var(--wp-ink-2)]',
          {key: text, onClick: () => setMessage?.(text)}, text))),
        result.sessionId && h(`div:mt-3 ${classes.mono}`, {}, `session · ${result.sessionId}`))
    }
  })
})
