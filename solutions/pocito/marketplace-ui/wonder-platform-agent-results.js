import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformAgnoResult', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({result}) => {
      const {classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      return h(
        `div:${classes.card}`, {'data-agent-harness': 'agno'},
        h('div:mb-3 flex items-center justify-between gap-3 text-[12px] font-semibold text-[var(--wp-ink-2)]', {},
          h('span', {}, 'תשובת AgentOS'), h(`span:${classes.mono}`, {}, result.runId || 'בהרצה…')),
        h('div:whitespace-pre-wrap text-[13px] leading-7', {dir: 'auto'}, result.text || result.output),
        result.sessionId && h(`div:mt-3 ${classes.mono}`, {}, `session · ${result.sessionId}`)
      )
    }
  })
})
ReactComp('wonderPlatformLlmFlowResult', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({result, setMessage}) => {
      const {classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      return h(
        `div:${classes.card}`, {'data-agent-harness': 'llmflow'},
        h('div:mb-3 flex items-center justify-between gap-3 text-[12px] font-semibold text-[var(--wp-ink-2)]', {},
          h('span', {}, 'תשובת LLM Flow'), h(`span:${classes.mono}`, {}, `${result.runtimeSteps?.length || 0} שלבים`)),
        h('div:whitespace-pre-wrap text-[13px] leading-7', {}, result.text || result.output || JSON.stringify(result, null, 2)),
        (result.followUps || []).length > 0 && h('div:mt-4 flex flex-wrap gap-2', {}, result.followUps.map(text => h(
          'button:rounded-full border border-[var(--wp-border-strong)] bg-[var(--wp-surface-3)] px-3 py-1.5 ' +
          'text-[12px] text-[var(--wp-ink-2)]',
          {key: text, onClick: () => setMessage?.(text)}, text)))
      )
    }
  })
})
ReactComp('wonderPlatformAgentResult', {
  impl: comp({
    hFunc: (ctx, {react: {hh}}) => props => hh(ctx,
      props.result.harness == 'llmflow'
        ? dsls.react['react-comp'].wonderPlatformLlmFlowResult
        : dsls.react['react-comp'].wonderPlatformAgnoResult,
      props)
  })
})
