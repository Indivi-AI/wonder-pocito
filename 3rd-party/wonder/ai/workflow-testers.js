import { dsls, jb, coreUtils } from '@jb6/core'
import '@jb6/common'
import '@jb6/testing'
import '@wonder/ai/llm-flow-core.js'
import { fetchItemsFromLLMReactiveP } from '@wonder/ai/reactive-llm.js'

const { tgp: { TgpType, Component }, common: { Boolean, data: { first } },
  test: { Logger, Test, logger: { domainLogger }, test: { dataTest } } } = dsls
const Evaluation = TgpType('evaluation', 'ai', {description: "Workflow evaluation components inspired by Agno's evaluation framework",
  typescript: 'Promise<boolean>', moreTypes: 'boolean<common>'})

Evaluation('evaluations', {
  params: [
    {id: 'evaluations', type: 'evaluation<ai>[]', dynamic: true}
  ],
  impl: async (ctx, {evaluationLogger}, {evaluations}) => {
    const results = await Promise.all(evaluations(ctx))
    const checks = results.map((success, i) => ({evaluation: evaluations.profile[i].$?.id,
      criteria: evaluations.profile[i].criteria, success}))
    const success = results.every(x => x)
    evaluationLogger?.info?.({t: 'evaluations', success, checks}, {}, {ctx})
    return success
  }
})
Evaluation.coerce = evaluations => Evaluation.evaluations(...evaluations)

const workflowExpectedResult = Boolean('workflowExpectedResult', {
  params: [{id: 'expectedResult', type: 'boolean<common>', dynamic: true, defaultValue: true}],
  impl: (ctx, {}, {expectedResult}) => ctx.data.evaluation.success && expectedResult(ctx.setData(ctx.data.workflowResult))
})
Test('workflowTest', {
  params: [
    {id: 'workflow', type: 'workflow<ai>', mandatory: true},
    {id: 'roomId', as: 'string'},
    {id: 'userMessage', as: 'string'},
    {id: 'userId', as: 'string', defaultValue: 'ScreenshotService'},
    {id: 'db', as: 'string', defaultValue: 'local'},
    {id: 'wonderServiceBase', as: 'string', defaultValue: 'http://localhost:3000'},
    {id: 'categories', as: 'string[]'},
    {id: 'iterations', as: 'number', defaultValue: 1},
    {id: 'evaluations', type: 'evaluation<ai>', dynamic: true, defaultValue: true},
    {id: 'expectedResult', type: 'boolean<common>', dynamic: true, defaultValue: true},
    {id: 'timeout', as: 'number', defaultValue: 100000},
    {id: 'logger', as: 'string', defaultValue: 'llmCallLogger,evaluationLogger'},
    {id: 'allowError', type: 'boolean<common>', dynamic: true}
  ],
  impl: dataTest({
    calculate: async (ctx, {}, {workflow, roomId, userMessage, userId, db, wonderServiceBase, categories, iterations, evaluations}) => {
      const results = []
      for (let iteration = 0; iteration < iterations; iteration++) {
        const runCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx.setVars({roomId, roomWUrl: roomId && `room://${roomId}`,
          userMessage, userId, db, wonderServiceBase, iteration, accumulatedContext: {chatHistory: []},
          categories: Object.fromEntries((categories || []).map(category => [category, true]))}))
        const result = await workflow.calcWorkflow(runCtx)
        results.push({...result, evaluation: {iteration, workflowLog: runCtx.vars.workflowLogger?.workflowLog || [],
          workflowErrors: runCtx.vars.workflowLogger?.workflowErrors || []}})
      }
      const workflowResult = iterations == 1 ? results[0] : results
      return {workflowResult, evaluation: {success: await evaluations(ctx.setData(workflowResult))}}
    },
    expectedResult: workflowExpectedResult('%$expectedResult()%'),
    timeout: '%$timeout%',
    allowError: '%$allowError()%',
    logger: '%$logger%'
  })
})
Evaluation('accuracy', {
  description: 'Compare workflow output with the expected output',
  params: [
    {id: 'output', dynamic: true, defaultValue: '%runRes%'},
    {id: 'expectedOutput', dynamic: true, mandatory: true}
  ],
  impl: async (ctx, {}, {output, expectedOutput}) => (Array.isArray(ctx.data) ? ctx.data : [ctx.data])
    .every(run => JSON.stringify(output(ctx.setData(run))) == JSON.stringify(expectedOutput(ctx.setData(run))))
})

Evaluation('agentAsJudge', {
  description: 'Evaluate workflow output against criteria using an LLM judge',
  params: [
    {id: 'criteria', as: 'text', mandatory: true},
    {id: 'output', dynamic: true, defaultValue: '%%'},
    {id: 'input', dynamic: true, defaultValue: '%$userMessage%'},
    {id: 'referenceOutput', dynamic: true},
    {id: 'scoringStrategy', as: 'string', options: 'binary,numeric', defaultValue: 'binary'},
    {id: 'threshold', as: 'number', defaultValue: 7},
    {id: 'additionalGuidelines', as: 'string[]'},
    {id: 'model', as: 'string', defaultValue: 'openai/gpt-5-mini'}
  ],
  impl: async (ctx, {evaluationLogger}, {criteria, output, input, referenceOutput, scoringStrategy, threshold, additionalGuidelines, model}) => {
    const runs = Array.isArray(ctx.data) ? ctx.data : [ctx.data]
    const schema = scoringStrategy == 'numeric'
      ? {type: 'object', properties: {score: {type: 'integer', minimum: 1, maximum: 10}, reason: {type: 'string'}},
          required: ['score', 'reason'], additionalProperties: false}
      : {type: 'object', properties: {passed: {type: 'boolean'}, reason: {type: 'string'}},
          required: ['passed', 'reason'], additionalProperties: false}
    const scores = await Promise.all(runs.map(async run => {
      const runCtx = ctx.setData(run), candidate = output(runCtx), reference = referenceOutput(runCtx)
      try {
        const prompt = JSON.stringify({input: input(runCtx), output: candidate, ...(reference == null ? {} : {referenceOutput: reference})})
        const instructions = ['Judge only the supplied output against the criteria.', criteria, ...(additionalGuidelines || []),
          scoringStrategy == 'numeric' ? 'Score from 1 to 10.' : 'Return pass or fail.'].join('\n')
        const {responseText} = await fetchItemsFromLLMReactiveP({ctx: runCtx, model, goal: 'agentAsJudge', prompt, instructions,
          maxTokens: 500, temperature: 0, thinkingBudget: 0, responseSchema: schema})
        const result = JSON.parse(responseText.replace(/```(?:json)?/g, '').trim())
        if (result.passed == null && result.score == null) throw new Error(`invalid judge response: ${responseText}`)
        return {passed: scoringStrategy == 'numeric' ? result.score >= threshold : result.passed, ...result}
      } catch (error) {
        coreUtils.logException(error, 'agentAsJudge', {ctx: runCtx, model, candidate})
        evaluationLogger?.error?.({t: 'agentAsJudge invalid response', logToDelete: true, model, scoringStrategy,
          error: error.stack || String(error)}, {candidate}, {ctx: runCtx, error})
        return {passed: false, error: error.message}
      }
    }))
    return scores.every(result => result.passed)
  }
})
Evaluation('performance', {
  description: 'Evaluate average runtime against a maximum duration',
  params: [
    {id: 'func', dynamic: true, defaultValue: '%runRes%'},
    {id: 'maxRuntimeMs', as: 'number', defaultValue: 100},
    {id: 'warmupRuns', as: 'number', defaultValue: 1},
    {id: 'numIterations', as: 'number', defaultValue: 3}
  ],
  impl: async (ctx, {}, {func, maxRuntimeMs, warmupRuns, numIterations}) => {
    for (let i = 0; i < warmupRuns; i++) await func(ctx)
    const start = performance.now()
    for (let i = 0; i < numIterations; i++) await func(ctx)
    return (performance.now() - start) / numIterations <= maxRuntimeMs
  }
})
Evaluation('toolCallExpectedResult', {
  description: 'Evaluate aggregated results of calls to a named tool',
  params: [
    {id: 'toolName', as: 'string', mandatory: true},
    {id: 'expectedResult', type: 'boolean<common>', dynamic: true, mandatory: true},
    {id: 'aggToolResults', dynamic: true, defaultValue: first()}
  ],
  impl: (ctx, {}, {toolName, expectedResult, aggToolResults}) => (Array.isArray(ctx.data) ? ctx.data : [ctx.data]).every(run =>
    expectedResult(ctx.setData(aggToolResults(ctx.setData((run.toolCalls || []).filter(call => call.name == toolName))))))
})
