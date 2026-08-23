import { fetchItemsFromLLMReactiveP } from '@wonder/ai/reactive-llm.js'
import './llm-flow-core.js'
import { dsls } from '@jb6/core'

const { extendWithWorkflowVars, bookletContent } = jb.workflowUtils

const {
  tgp: { Component }
} = dsls


Component('llmCall', {
  type: 'workflow<ai>',
  params: [
    { id: 'mpi', type: 'mpi' },
    { id: 'categories', as: 'string[]' },
    { id: 'bookletsToLoad', as: 'string[]' },
  ],
  impl: ({}, {}, { mpi, categories, bookletsToLoad }) => ({
    async calcWorkflow(__ctx) {
      const { userMessage } = __ctx.vars
      const startTime = Date.now()
      let ctx = await extendWithWorkflowVars(__ctx)
      ctx = ctx.setVars({ categories: { ...ctx.vars.categories, ...Object.fromEntries((categories || []).map(c => [c, true])) } })
      const workflowLogger = ctx.vars.workflowLogger
      let res
      try {
        const [...bookletContents] = await Promise.all([...bookletsToLoad.map(b => bookletContent(b, ctx))])
        ctx = ctx.setVars({
          ...Object.fromEntries(bookletsToLoad.map((b, i) => [b, bookletContents[i].nested])),
          userMessage
        })
        const { responseText } = await fetchItemsFromLLMReactiveP({
          ctx, model: ctx.vars.flowModelOverride || mpi.model(ctx), goal: 'llm call',
          prompt: mpi.prompt(ctx),
          instructions: mpi.instructions(ctx),
          context: ctx.vars.accumulatedContext && JSON.stringify(ctx.vars.accumulatedContext),
          thinkingBudget: mpi.thinkingBudget?.(ctx)
        })
        res = await dsls.common.data.runLLMFlowScript.$runWithCtx(ctx, responseText)
      } catch (error) {
        workflowLogger.error({ t: 'llmCall failed' }, {}, { error, ctx })
      }
      const result = { ...res, ...workflowLogger.logsAndErrors() }
      workflowLogger.info({ t: 'oneShotBooklet completed', duration: Date.now() - startTime }, {}, { ctx })
      return result
    }
  })
})
