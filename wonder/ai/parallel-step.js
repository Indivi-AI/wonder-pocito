import { dsls, jb, coreUtils } from '@jb6/core'
import '@jb6/llm-guide'
import './llm-flow-core.js'
import { fetchItemsFromLLMReactiveP } from '@wonder/ai/reactive-llm.js'

const {
  tgp: { Component },
  common: { Data },
  'llm-guide': { Doclet, doclet: { dataComp }, guidance: { example, mustDo, doNot }, explanationPoint: { explanation, syntax, whenToUse } }
} = dsls

const { extendWithWorkflowVars } = jb.workflowUtils

// run a hand-authored flow-elem tree as a workflow<workflow> (the non-LLM counterpart of mainWorkflow)
Component('flowWorkflow', {
  type: 'workflow<workflow>',
  params: [
    {id: 'flow', type: 'flow-elem<workflow>', dynamic: true}
  ],
  impl: ({}, {}, { flow }) => ({
    async calcWorkflow(__ctx) {
      const ctx = __ctx.vars.workflowLogger ? __ctx : await extendWithWorkflowVars(__ctx)
      const { workflowLogger } = ctx.vars
      let runRes
      try {
        const resCtx = await flow(ctx.setData(null))
        runRes = resCtx && typeof resCtx.setData == 'function' && resCtx.jbCtx ? resCtx.data : resCtx
      } catch (error) {
        workflowLogger.error({ t: 'flowWorkflow failed' }, {}, { error, ctx })
      }
      return { runRes, ...workflowLogger.logsAndErrors() }
    }
  })
})

Data('runAgentWorkflow', {
  description: 'run a named agent workflow on the current question in an isolated logger and return its final answer object',
  params: [
    {id: 'workflow', as: 'string', mandatory: true},
    {id: 'model', as: 'string', description: 'optional model override for the agent main flow'}
  ],
  impl: async (ctx, {}, { workflow, model }) => {
    const wf = dsls.workflow.workflow[workflow]
    if (!wf) return { error: `runAgentWorkflow: unknown workflow '${workflow}'` }
    const res = await wf.$run().calcWorkflow(ctx.setVars({ workflowLogger: undefined, flowModelOverride: model || undefined }))
    return res?.runRes && typeof res.runRes == 'object' && !Array.isArray(res.runRes)
      ? res.runRes : { error: `runAgentWorkflow: '${workflow}' produced no answer object`, runRes: res?.runRes }
  }
})

const compactAnswer = a => ({ text: a.text, narrative: a.narrative, sql: a.sql,
  rowsCount: Array.isArray(a.rows) ? a.rows.length : 0, widgetsCount: Array.isArray(a.widgets) ? a.widgets.length : 0, reportsUsed: a.reportsUsed })

Data('decideBestAnswer', {
  description: 'LLM-judge the candidate answers (ctx.data array); return the winning answer object plus a panel note. The caller supplies the domain/language-specific judging instruction via the criteria param',
  params: [
    {id: 'criteria', as: 'text', dynamic: true, byName: true, description: 'the judging instruction that precedes the candidates - question framing + what makes a good answer + reason language; may reference %$userMessage%',
      defaultValue: 'Pick the single best candidate answer to the user question: %$userMessage%. Judge by correctness, grounding in the data, and clarity.'},
    {id: 'sources', as: 'array', description: 'labels aligned with the candidates, for logging'},
    {id: 'model', as: 'string'}
  ],
  impl: async (ctx, { workflowLogger, summaryModel }, { criteria, sources, model }) => {
    const candidates = coreUtils.asArray(ctx.data).filter(a => a && typeof a == 'object' && !a.error)
    if (candidates.length <= 1) {
      workflowLogger?.info?.({ t: 'decideBestAnswer skip', reason: candidates.length ? 'single candidate' : 'no valid candidate', sources }, {}, { ctx })
      return candidates[0] || { error: 'decideBestAnswer: no valid candidate answers', raw: ctx.data }
    }
    const prompt = [
      criteria(ctx),
      ...candidates.map((a, i) => `--- candidate ${i + 1}${sources?.[i] ? ` (${sources[i]})` : ''} ---\n${JSON.stringify(compactAnswer(a))}`),
      'Reply with exactly: <CHOICE>the number of the best candidate</CHOICE><WHY>a one-sentence reason</WHY>'
    ].join('\n\n')
    const { responseText } = await fetchItemsFromLLMReactiveP({
      ctx, model: model || summaryModel || 'gemini/gemini-3.5-flash', goal: 'decide best answer',
      prompt, instructions: '', maxTokens: 4000, temperature: 0, thinkingBudget: 0
    })
    const choice = +(responseText.match(/<CHOICE>\s*(\d+)/)?.[1])
    const why = responseText.match(/<WHY>\s*([\s\S]*?)\s*(?:<\/WHY>|$)/)?.[1]?.trim()
    const idx = choice >= 1 && choice <= candidates.length ? choice - 1 : 0
    workflowLogger?.info?.({ t: 'decideBestAnswer', chosen: idx, source: sources?.[idx], why, sources }, { responseText: responseText?.slice(0, 300) }, { ctx })
    return { ...candidates[idx], panel: { chosen: sources?.[idx] || `candidate ${idx + 1}`, why, sources } }
  }
})

Doclet('parallelDataComponents', {
  impl: dataComp('parallel', {
    guidance: [
      example(`
{$: 'flow-elem<workflow>setCtxData',
  goal: 'Run two agents on the same question, concurrently',
  value: {$: 'flow-elem<workflow>parallel', branches: [
    {$: 'flow-elem<workflow>setCtxData', goal: 'Agent A', value: {$: 'data<common>runAgentWorkflow', workflow: 'reportsAnalytics'}},
    {$: 'flow-elem<workflow>setCtxData', goal: 'Agent B', value: {$: 'data<common>runAgentWorkflow', workflow: 'basicAnalytics', model: 'anthropic/claude-sonnet-4-5'}}
  ]}
}
{$: 'flow-elem<workflow>setCtxData', goal: 'Pick the better answer',
  value: {$: 'data<common>decideBestAnswer',
    criteria: 'Pick the best answer to the user question: %$userMessage%, by correctness, grounding in the data and clarity. Reason in the user language.',
    sources: ['reports', 'sql/sonnet']}}
`),
      mustDo('parallel branches run in isolation from the same input ctx; the output data is the array of branch results, read it in the next element'),
      mustDo('supply decideBestAnswer criteria yourself - it is the domain/language-specific judging instruction (may reference %$userMessage%); the step only appends the candidates and the <CHOICE>/<WHY> output contract'),
      doNot('share a var between parallel branches - branches must be independent', { reason: 'each branch runs its own agent with its own logger' })
    ],
    explaination: [
      explanation('parallel(branches): run flow-elem branches concurrently and set ctx.data to the array of their results'),
      explanation('runAgentWorkflow(workflow, model?): run a registered agent workflow in an isolated logger and return its final answer object'),
      explanation('decideBestAnswer(criteria, sources?): LLM-judge the ctx.data candidate answers against the caller-supplied criteria and return the winning answer object plus a panel note'),
      syntax("value: {$: 'data<common>runAgentWorkflow', workflow: 'basicAnalytics', model: 'anthropic/claude-sonnet-4-5'}", 'run an agent with a model override'),
      whenToUse('Comparing multiple agents/models on the same question and returning the best answer')
    ]
  })
})
