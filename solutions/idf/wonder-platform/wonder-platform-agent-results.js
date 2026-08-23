import { dsls } from '@jb6/core'
import '@jb6/react'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformAgnoResult', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({result}) => h(
      'div:rounded-2xl border border-[#dce6df] bg-white p-5 shadow-sm', {'data-agent-harness': 'agno'},
      h('div:mb-3 flex items-center justify-between gap-3 text-xs font-semibold text-[#3c5548]', {},
        h('span', {}, 'תשובת AgentOS'), h('span:font-mono text-[10px] text-[#8b948f]', {}, result.runId || 'run pending')),
      h('div:whitespace-pre-wrap text-sm leading-7', {}, result.text || result.output),
      result.sessionId && h('div:mt-3 text-[10px] text-[#a3a9a6]', {}, `session · ${result.sessionId}`)
    )
  })
})
ReactComp('wonderPlatformLlmFlowResult', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({result, setMessage}) => h(
      'div:rounded-2xl border border-[#d9e1ee] bg-white p-5 shadow-sm', {'data-agent-harness': 'llmflow'},
      h('div:mb-3 flex items-center justify-between gap-3 text-xs font-semibold text-[#3d526b]', {},
        h('span', {}, 'תשובת LLM Flow'), h('span:text-[10px] text-[#8b948f]', {}, `${result.runtimeSteps?.length || 0} שלבים`)),
      h('div:whitespace-pre-wrap text-sm leading-7', {}, result.text || result.output || JSON.stringify(result, null, 2)),
      (result.followUps || []).length > 0 && h('div:mt-4 flex flex-wrap gap-2', {}, result.followUps.map(text => h(
        'button:rounded-full border border-[#ccd9e9] bg-[#f1f5fa] px-3 py-1.5 text-xs text-[#3d526b]',
        {key: text, onClick: () => setMessage?.(text)}, text)))
    )
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
