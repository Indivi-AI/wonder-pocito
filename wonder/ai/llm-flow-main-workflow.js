import { fetchItemsFromLLMReactiveP } from '@wonder/ai/reactive-llm.js'
import './llm-flow-core.js'
import { dsls } from '@jb6/core'
import './llm-flow-doclets.js'
import './llm-summary-step.js'
import './final-answer-step.js'
import './report-step.js'
import './parallel-step.js'
import './agent-steps.js'

const { extendWithWorkflowVars, docletContent, bookletContent } = jb.workflowUtils

const { tgp: { Component } } = dsls

const mainWorkflow = Component('mainWorkflow', {
  type: 'workflow<ai>',
  params: [
    { id: 'main', type: 'mpi' },
    { id: 'categories', as: 'array' },
    { id: 'bookletsToLoad', as: 'array' },
    { id: 'enrichCtx', type: 'ctx-enricher<tgp>', dynamic: true }
  ],
  impl: ({}, {}, { main, categories, bookletsToLoad, enrichCtx }) => ({
    async calcWorkflow(__ctx) {
      const { userMessage } = __ctx.vars
      const startTime = Date.now()
      let ctx = await extendWithWorkflowVars(__ctx)
      const workflowLogger = ctx.vars.workflowLogger
      let res
      try {
        ctx = ctx.setVars({ categories: { ...ctx.vars.categories, ...Object.fromEntries((categories || []).map(c => [c, true])) } })
        ctx = enrichCtx.profile ? await enrichCtx(ctx) : ctx
        workflowLogger?.step('context', 'Loading context...')
        const [llmFlowBooklet, ...bookletContents] = await Promise.all([
          bookletContent('llmFlow', ctx),
          ...bookletsToLoad.map(b => bookletContent(b, ctx))
        ])
        workflowLogger?.stepDone('context')
        const essentialOutputFormat = await docletContent('essentialOutputFormat', ctx)
        ctx = ctx.setVars({
          essentialOutputFormat,
          llmFlowBooklet: llmFlowBooklet.nested,
          ...Object.fromEntries(bookletsToLoad.map((b, i) => [b, bookletContents[i].nested])),
          userMessage
        })
        ctx = ctx.setVars({ flowModel: ctx.vars.flowModelOverride || main.model(ctx) })
        const { responseText } = await fetchItemsFromLLMReactiveP({
          ctx, model: ctx.vars.flowModel, goal: 'main flow',
          prompt: main.prompt(ctx),
          instructions: main.instructions(ctx),
          context: ctx.vars.accumulatedContext && JSON.stringify(ctx.vars.accumulatedContext),
          thinkingBudget: main.thinkingBudget?.(ctx)
        })
        res = await dsls.common.data.runLLMFlowScript.$runWithCtx(ctx, responseText)
      } catch (error) {
        workflowLogger.error({ t: 'mainWorkflow failed' }, {}, { error, ctx })
      }
      const result = { ...res, ...workflowLogger.logsAndErrors() }
      workflowLogger.info({ t: 'oneShotBooklet completed', duration: Date.now() - startTime }, {}, { ctx })
      return result
    }
  })
})
