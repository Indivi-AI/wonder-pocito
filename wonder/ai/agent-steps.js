import { dsls, jb, coreUtils } from '@jb6/core'
import '@jb6/llm-guide'
import './llm-flow-core.js'
import { fetchItemsFromLLMReactiveP } from '@wonder/ai/reactive-llm.js'

const {
  tgp: { TgpType },
  common: { Data },
  'llm-guide': { Doclet, doclet: { dataComp }, guidance: { example, mustDo, doNot }, explanationPoint: { explanation, syntax, whenToUse } }
} = dsls
const FlowElem = TgpType('flow-elem', 'workflow')
const { squeeze, getWorkflowVars, parseFlowCode, resolveCompRefs, lastFencedBlock } = jb.workflowUtils

// verifier contract: a boolean<common> profile returning boolean (jqBoolean) or a {satisfied, reason} verdict (llmVerdict).
// the reason is the Reflexion feedback fed into the next attempt
async function calcVerdict(verifier, ctx) {
  try {
    const raw = await verifier(ctx)
    const val = raw instanceof coreUtils.Ctx ? raw.data : raw
    return val && typeof val == 'object' ? { satisfied: !!val.satisfied, reason: val.reason } : { satisfied: !!val }
  } catch (error) {
    return { satisfied: false, reason: `verifier crashed: ${error.stack || error}` }
  }
}

const asCtx = (raw, ctx) => raw instanceof coreUtils.Ctx ? raw : ctx.setData(raw)

FlowElem('until', {
  description: 'evaluator-optimizer loop: run body, judge result with verifier, feed the failure reason back via $untilFeedback and rerun, up to maxRuns',
  params: [
    {id: 'goal', as: 'string'},
    {id: 'body', type: 'flow-elem', dynamic: true, mandatory: true},
    {id: 'verifier', type: 'boolean<common>', dynamic: true, mandatory: true, description: 'jqBoolean or llmVerdict, judges the body output ctx'},
    {id: 'maxRuns', as: 'number', defaultValue: 3}
  ],
  impl: async (ctx, {flowIndex, workflowLogger}, {goal, body, verifier, maxRuns}) => {
    const logger = workflowLogger || ctx.vars.logger
    let runCtx = ctx, lastError
    for (let run = 1; run <= maxRuns; run++) {
      const raw = await coreUtils.waitForInnerElements(await body(runCtx.setVars({untilRun: run})))
      if (raw?.needsRegeneration) return raw
      const outCtx = asCtx(raw, runCtx)
      lastError = raw?.error ? raw : null
      const verdict = lastError ? { satisfied: false, reason: squeeze(raw.error) } : await calcVerdict(verifier, outCtx)
      logger?.info({t: 'until', goal, flowIndex, run, maxRuns, satisfied: verdict.satisfied, reason: verdict.reason}, {data: squeeze(outCtx.data)}, {ctx: outCtx})
      if (verdict.satisfied) return outCtx
      runCtx = outCtx.setVars({untilFeedback: {run, reason: verdict.reason || 'verifier not satisfied'}})
    }
    logger?.warning({t: 'until exhausted maxRuns', goal, flowIndex, maxRuns}, {}, {ctx: runCtx})
    return lastError || runCtx.setVars({untilExhausted: true})
  }
})

async function authorFollowUpFlow(ctx, {goal, task, attempts, model, instructions, logger}) {
  const authorGuides = instructions || [ctx.vars.llmFlowBooklet || (await jb.workflowUtils.bookletContent('llmFlow', ctx))?.nested, ctx.vars.dbBooklet].filter(Boolean).join('\n')
  const workflowVars = getWorkflowVars(logger?.workflowTrace)
  const prompt = [
    'A previous flow ran but the task below is NOT completed yet. Author a follow-up flow that completes it, continuing from the current result.',
    `TASK: ${task}`,
    goal ? `REPLAN GOAL: ${goal}` : null,
    `CURRENT RESULT (ctx.data): ${squeeze(ctx.data, 4000)}`,
    Object.keys(workflowVars).length ? `WORKFLOW VARS: ${squeeze(workflowVars, 2000)}` : null,
    `VERIFIER FEEDBACK - why the task is not complete, most recent last:\n${attempts.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,
    'Reply with ONLY a ```javascript block containing a flow-elem<workflow> profile. Do NOT include a replan element in it.'
  ].filter(Boolean).join('\n\n')
  const { responseText } = await fetchItemsFromLLMReactiveP({
    ctx, model, goal: `replan: ${goal || task}`, prompt,
    instructions: authorGuides, maxTokens: 8000, temperature: 0, thinkingBudget: 0
  })
  const flowCode = (lastFencedBlock(responseText) || responseText).trim()
  if (!flowCode || flowCode == '{}') throw new Error('flow authoring llm call failed (empty response)')
  return flowCode
}

FlowElem('replan', {
  description: 'plan-and-execute replanner: judge task completion with verifier; while incomplete, ask the LLM to author a follow-up flow and run it, up to maxRuns replans',
  params: [
    {id: 'goal', as: 'string'},
    {id: 'task', as: 'text', dynamic: true, defaultValue: '%$userMessage%', description: 'the task the whole flow must complete'},
    {id: 'verifier', type: 'boolean<common>', dynamic: true, mandatory: true, description: 'decides if the task is completed - llmVerdict or jqBoolean'},
    {id: 'maxRuns', as: 'number', defaultValue: 3},
    {id: 'model', as: 'string'},
    {id: 'instructions', as: 'text', dynamic: true,
      description: 'booklets/guides for the follow-up author; defaults to llmFlowBooklet+dbBooklet'}
  ],
  impl: async (ctx, {flowIndex, workflowLogger}, {goal, task, verifier, maxRuns, model, instructions}) => {
    const logger = workflowLogger || ctx.vars.logger
    const depth = ctx.vars.replanDepth || 0
    if (depth >= 2) {
      logger?.warning({t: 'replan depth limit reached, skipping', goal, depth}, {}, {ctx})
      return ctx
    }
    let runCtx = ctx.setVars({replanDepth: depth + 1})
    const attempts = []
    for (let replans = 0; ; replans++) {
      const verdict = await calcVerdict(verifier, runCtx)
      logger?.info({t: 'replan verdict', goal, flowIndex, replans, maxRuns, satisfied: verdict.satisfied, reason: verdict.reason}, {data: squeeze(runCtx.data)}, {ctx: runCtx})
      if (verdict.satisfied) return runCtx
      if (replans >= maxRuns) break
      attempts.push(verdict.reason || 'task not completed')
      try {
        const flowCode = await authorFollowUpFlow(runCtx, {goal, task: task(runCtx), attempts, logger,
          model: model || runCtx.vars.flowModel || runCtx.vars.summaryModel || 'gemini/gemini-3.5-flash', instructions: instructions.profile ? instructions(runCtx) : null})
        const profile = await parseFlowCode(flowCode, logger, runCtx)
        coreUtils.resolveProfileTypes(profile, {expectedType: 'flow-elem<workflow>', tgpModel: jb})
        resolveCompRefs(profile)
        logger?.info({t: 'replan follow-up flow', goal, replans: replans + 1}, {flowCode}, {ctx: runCtx})
        const raw = await coreUtils.waitForInnerElements(await runCtx.run(profile))
        if (raw?.error) attempts.push(`follow-up flow error: ${squeeze(raw.error)}`)
        else runCtx = asCtx(raw, runCtx)
      } catch (error) {
        logger?.error({t: 'replan follow-up flow failed', goal}, {}, {ctx: runCtx, error})
        attempts.push(`follow-up flow crashed: ${squeeze(error.stack || error)}`)
      }
    }
    logger?.warning({t: 'replan exhausted maxRuns', goal, maxRuns, attempts}, {}, {ctx: runCtx})
    return runCtx.setVars({replanExhausted: true})
  }
})

Data('llmVerdict', {
  moreTypes: 'boolean<common>',
  description: 'LLM-as-judge verifier: judge ctx.data against criteria, returns {satisfied, reason} - use as until/replan verifier',
  params: [
    {id: 'criteria', as: 'text', dynamic: true, mandatory: true, description: 'what makes the current result a completed, correct answer; may reference %$userMessage%'},
    {id: 'model', as: 'string'}
  ],
  impl: async (ctx, {workflowLogger, summaryModel, flowModel}, {criteria, model}) => {
    const logger = workflowLogger || ctx.vars.logger
    const prompt = [
      'You are a verifier. Judge if the RESULT satisfies the CRITERIA. Follow the CRITERIA own strictness guidance; absent such guidance, FAIL when uncertain.',
      `CRITERIA: ${criteria(ctx)}`,
      `RESULT: ${squeeze(ctx.data, 6000)}`,
      'Reply with exactly: <VERDICT>PASS or FAIL</VERDICT><REASON>one sentence, if FAIL say what is missing</REASON>'
    ].join('\n\n')
    try {
      const { responseText } = await fetchItemsFromLLMReactiveP({
        ctx, model: model || summaryModel || flowModel || 'gemini/gemini-3.5-flash', goal: 'llm verdict',
        prompt, instructions: '', maxTokens: 1000, temperature: 0, thinkingBudget: 0
      })
      const satisfied = /<VERDICT>\s*PASS/i.test(responseText)
      const reason = responseText.match(/<REASON>\s*([\s\S]*?)\s*(?:<\/REASON>|$)/)?.[1]
      logger?.info({t: 'llmVerdict', satisfied, reason}, {responseText: responseText?.slice(0, 300)}, {ctx})
      return { satisfied, reason }
    } catch (error) {
      logger?.error({t: 'llmVerdict failed'}, {}, {ctx, error})
      return { satisfied: false, reason: `llmVerdict crashed: ${error.stack || error}` }
    }
  }
})

Doclet('agentLoopComponents', {
  impl: dataComp('until', {
    guidance: [
      example(`
// until: evaluator-optimizer loop - rerun body until verifier passes (max maxRuns)
{$: 'flow-elem<workflow>until',
  goal: 'Fetch rows until relevant ones are found',
  body: {$: 'flow-elem<workflow>setCtxData',
    goal: 'query',
    value: {$: 'data<common>duckDbSql', sql: 'SELECT * FROM data LIMIT 20'}},
  verifier: {$: 'boolean<common>jqBoolean', exp: 'length > 0'},
  maxRuns: 3
}

// replan: END the flow with it when the task may need follow-up steps.
// It judges completion; if incomplete, it writes and runs a follow-up flow (up to maxRuns times, default 3)
{$: 'flow-elem<workflow>replan',
  goal: 'Ensure the user question is fully answered',
  verifier: {$: 'boolean<common>llmVerdict', criteria: 'the result fully answers: %$userMessage%'},
  maxRuns: 3
}
`),
      mustDo('inside an until body, read %$untilFeedback% (the {run, reason} of the failed verifier) to improve the next attempt'),
      mustDo('give llmVerdict concrete, checkable criteria - what fields/content the result must contain'),
      doNot('nest replan inside a replan-generated flow', { reason: 'the runtime blocks depth > 2; one replan at the END of the flow is the pattern' })
    ],
    explaination: [
      explanation('until(goal, body, verifier, maxRuns): rerun body with $untilFeedback until verifier passes; returns last body output'),
      explanation('replan(goal, task, verifier, maxRuns, model): verify task completion; while incomplete author+run a follow-up flow. task defaults to %$userMessage%'),
      explanation('llmVerdict(criteria, model): LLM-as-judge boolean returning {satisfied, reason}; the reason becomes feedback for the next attempt'),
      syntax("verifier: {$: 'boolean<common>jqBoolean', exp: 'length > 0'}", 'cheap structural verifier'),
      syntax("verifier: {$: 'boolean<common>llmVerdict', criteria: '...'}", 'semantic verifier for open-ended tasks'),
      whenToUse('until - for retryable steps with a checkable goal; replan - as the LAST flow element when completion is uncertain')
    ]
  })
})
