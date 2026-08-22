import { dsls, jb } from '@jb6/core'
import '@jb6/common'
import '@jb6/testing'
import '@wonder/ai/llm-flow-core.js'
import { fetchItemsFromLLMReactiveP } from '@wonder/ai/reactive-llm.js'

const { tgp: { TgpType, Component }, common: { Boolean }, test: { Logger, Test, logger: { domainLogger }, test: { dataTest } } } = dsls
const Evaluation = TgpType('evaluation', 'ai', {description: 'Workflow evaluation based on the Agno evaluation framework',
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
    {id: 'categories', as: 'string[]'},
    {id: 'iterations', as: 'number', defaultValue: 1},
    {id: 'evaluations', type: 'evaluation<ai>', dynamic: true, defaultValue: true},
    {id: 'expectedResult', type: 'boolean<common>', dynamic: true, defaultValue: true},
    {id: 'timeout', as: 'number', defaultValue: 100000},
    {id: 'logger', as: 'string', defaultValue: 'llmCallLogger,evaluationLogger'},
    {id: 'allowError', type: 'boolean<common>', dynamic: true}
  ],
  impl: dataTest({
    calculate: async (ctx, {}, {workflow, roomId, userMessage, userId, db, categories, iterations, evaluations}) => {
      const results = []
      for (let iteration = 0; iteration < iterations; iteration++) {
        const runCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx.setVars({roomId, roomWUrl: roomId && `room://${roomId}`,
          userMessage, userId, db, iteration, accumulatedContext: {chatHistory: []},
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
  description: 'Accuracy evaluator based on the Agno evaluation framework',
  params: [
    {id: 'output', dynamic: true, defaultValue: '%runRes%'},
    {id: 'expectedOutput', dynamic: true, mandatory: true}
  ],
  impl: async (ctx, {}, {output, expectedOutput}) => (Array.isArray(ctx.data) ? ctx.data : [ctx.data])
    .every(run => JSON.stringify(output(ctx.setData(run))) == JSON.stringify(expectedOutput(ctx.setData(run))))
})

Evaluation('agentAsJudge', {
  description: 'Agent-as-judge evaluator based on the Agno evaluation framework',
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
  impl: async (ctx, {}, {criteria, output, input, referenceOutput, scoringStrategy, threshold, additionalGuidelines, model}) => {
    const runs = Array.isArray(ctx.data) ? ctx.data : [ctx.data]
    const schema = scoringStrategy == 'numeric'
      ? {type: 'object', properties: {score: {type: 'integer', minimum: 1, maximum: 10}, reason: {type: 'string'}},
          required: ['score', 'reason'], additionalProperties: false}
      : {type: 'object', properties: {passed: {type: 'boolean'}, reason: {type: 'string'}},
          required: ['passed', 'reason'], additionalProperties: false}
    const scores = await Promise.all(runs.map(async run => {
      const runCtx = ctx.setData(run), candidate = output(runCtx), reference = referenceOutput(runCtx)
      const prompt = JSON.stringify({input: input(runCtx), output: candidate, ...(reference == null ? {} : {referenceOutput: reference})})
      const instructions = ['Judge only the supplied output against the criteria.', criteria, ...(additionalGuidelines || []),
        scoringStrategy == 'numeric' ? 'Score from 1 to 10.' : 'Return pass or fail.'].join('\n')
      const {responseText} = await fetchItemsFromLLMReactiveP({ctx: runCtx, model, goal: 'agentAsJudge', prompt, instructions,
        maxTokens: 500, temperature: 0, thinkingBudget: 0, responseSchema: schema})
      const result = JSON.parse(responseText.replace(/```(?:json)?/g, '').trim())
      const passed = scoringStrategy == 'numeric' ? result.score >= threshold : result.passed
      return {passed, ...result}
    }))
    return scores.every(result => result.passed)
  }
})
Evaluation('performance', {
  description: 'Performance evaluator based on the Agno evaluation framework',
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
Evaluation('reliability', {
  description: 'Reliability evaluator based on the Agno evaluation framework',
  params: [
    {id: 'actualToolCalls', dynamic: true, defaultValue: '%toolCalls%'},
    {id: 'expectedToolCalls', as: 'string[]'},
    {id: 'allowAdditionalToolCalls', as: 'boolean', type: 'boolean<common>'},
    {id: 'expectedToolCallArguments', as: 'object'}
  ],
  impl: (ctx, {}, {actualToolCalls, expectedToolCalls, allowAdditionalToolCalls, expectedToolCallArguments}) => {
    const calls = actualToolCalls(ctx) || [], names = calls.map(call => call.name)
    return (expectedToolCalls || []).every(name => names.includes(name)) && (allowAdditionalToolCalls || names.length == (expectedToolCalls || []).length)
      && Object.entries(expectedToolCallArguments || {}).every(([name, args]) =>
        calls.some(call => call.name == name && JSON.stringify(call.arguments) == JSON.stringify(args)))
  }
})
