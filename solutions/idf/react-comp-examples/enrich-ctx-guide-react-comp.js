import { dsls, jb } from '@jb6/core'
import '@jb6/react'
import '../marketplace-ui/wonder-platform-domain.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('enrichCtxGuide', {
  impl: comp({
    hFunc: (ctx, { react: { h, useState } }) => {
      const repo = dsls.common.data.wonderPlatformSeed.$run(), plugin = repo.plugins[0]
      const groundedAssets = { plugin, skills: repo.skills.filter(item => plugin.skillIds.includes(item.id)),
        tools: repo.tools.filter(item => plugin.toolIds.includes(item.id)),
        subagents: repo.subagents.filter(item => plugin.subagentIds.includes(item.id)), reports: repo.reports }
      return function EnrichCtxGuide() {
        const [answer, setAnswer] = useState(''), [busy, setBusy] = useState(false)
        const run = async () => {
          setBusy(true)
          const workflowCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx.setVars({
            userMessage: 'מה מצב תוכנית שחר?', selectedPlugin: JSON.stringify(plugin), accumulatedContext: { chatHistory: [] },
            assetRepoText: JSON.stringify(groundedAssets),
            llmProxyUrl: 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy'
          }))
          const result = await dsls.ai.workflow.wonderPlatformAgent.$run().calcWorkflow(workflowCtx)
          setAnswer(typeof result.runRes === 'string' ? result.runRes : result.runRes?.text || '')
          setBusy(false)
        }
        return h('main:max-w-xl mx-auto mt-16 p-4 space-y-3', { dir: 'rtl' }, h('h1:font-bold', {}, 'enrichCtx · workflow boundary'),
          h('button:border rounded-lg px-3 py-2', {
            disabled: busy, onClick: run
          }, busy ? 'מריץ…' : 'הרצת workflow'), h('p:whitespace-pre-wrap', { 'data-answer': true }, answer))
      }
    }
  })
})
