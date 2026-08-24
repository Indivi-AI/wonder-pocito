import { dsls, jb } from '@jb6/core'
import '@jb6/react'
import '../marketplace-ui/wonder-platform-domain.js'
import './room-state-react-comp.js'

const { common: { Data }, react: { ReactComp, 'react-comp': { comp } } } = dsls

Data('llmFlowExampleAnswer', {
  params: [
    {id: 'question', as: 'string'},
    {id: 'plugin', as: 'object'},
    {id: 'repo', as: 'object'}
  ],
  impl: async (ctx, {}, {question, plugin, repo}) => {
    const workflowCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx.setVars({
      userMessage: question, selectedPlugin: JSON.stringify(plugin), accumulatedContext: { chatHistory: [] },
      assetRepoText: JSON.stringify({ plugin, skills: repo.skills.filter(item => plugin.skillIds.includes(item.id)),
        tools: repo.tools.filter(item => plugin.toolIds.includes(item.id)),
        subagents: repo.subagents.filter(item => plugin.subagentIds.includes(item.id)), reports: repo.reports }),
      llmProxyUrl: 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy'
    }))
    const result = await dsls.ai.workflow.wonderPlatformAgent.$run().calcWorkflow(workflowCtx)
    const output = typeof result.runRes === 'string' ? { text: result.runRes } : result.runRes || {}
    return { text: output.text || '', reportIds: output.reportIds || [], followUps: output.followUps || [],
      trace: result.workflowTrace || [] }
  }
})

ReactComp('llmFlowExample', {
  params: [
    {id: 'roomWUrl', as: 'string', defaultValue: 'room:minio//pocito-llm-flow-example'}
  ],
  impl: comp({
    hFunc: (ctx, {}, {roomWUrl}) => {
      const { h, useEffect, useState } = ctx.vars.react
      const seed = dsls.common.data.wonderPlatformSeed.$run()
      const store = dsls.common.data.pocitoRoomJsonStore.$runWithCtx(ctx, {
        roomWUrl, assetPath: 'usersRW/react-comp-examples/llm-flow-assets'
      })
      return function LlmFlowExample() {
        const [repo, setRepo] = useState(), [question, setQuestion] = useState('מה מצב המוכנות של תוכנית שחר?')
        const [answer, setAnswer] = useState(), [busy, setBusy] = useState(false)
        useEffect(() => { void store.load(seed).then(setRepo) }, [])
        if (!repo) return h('div:p-6', {}, 'טוען…')
        const run = async () => {
          setBusy(true)
          setAnswer(await dsls.common.data.llmFlowExampleAnswer.$runWithCtx(ctx, { question, plugin: repo.plugins[0], repo }))
          setBusy(false)
        }
        return h('main:max-w-2xl mx-auto p-6 space-y-4', { dir: 'rtl' }, h('h1:text-xl font-bold', {}, 'llm-flow אמיתי'),
          h('textarea:w-full rounded-xl border p-3', { value: question, rows: 3, onInput: event => setQuestion(event.target.value) }),
          h('button:rounded-lg bg-emerald-800 text-white px-4 py-2 disabled:opacity-40', {
            disabled: busy || !question.trim(), onClick: run
          }, busy ? 'מריץ…' : 'הרצה'), answer && h('section:rounded-2xl border p-4 space-y-3', {},
            h('p:whitespace-pre-wrap', {}, answer.text), h('div:flex flex-wrap gap-2', {}, answer.reportIds.map(id => {
              const report = repo.reports.find(item => item.id === id)
              return report && h('span:rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1', {
                key: id, 'data-report-id': id
              }, report.name)
            })), h('div:flex flex-wrap gap-2', {}, answer.followUps.map((text, index) => h('button:rounded-lg border px-3 py-2', {
              key: index, onClick: () => setQuestion(text)
            }, text))), h('small:text-gray-500', {}, answer.trace.length + ' רשומות trace')))
      }
    }
  })
})
