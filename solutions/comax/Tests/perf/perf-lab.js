import { dsls, jb } from '@jb6/core'
import { fetchItemsFromLLMReactiveP, warmLLMCache } from '@wonder/core/reactive-llm.js'
import { writeBigLog } from '@wonder/core/base-utils.js'
import '@wonder/ai/llm-flow-main-workflow.js'
import '@wonder/ai/report-step.js'
import '@wonder/core/db-drivers-live-repo.js'
import '@wonder-admin/room/room-lambda-client.js'
import '../../nostalgy/reports-based-agent.js'
import '../../Reports/comax-reports.js'
import '../../Doclets/perf/perf-instructions-small.js'
import '../../Doclets/perf/perf-instructions-medium.js'

// perf-lab — SMALL, MEDIUM and LONG instruction variants of reportsAnalytics, to measure how
// input size affects codegen latency across OpenAI GPT models. Each variant's ENTIRE
// instruction is ONE cap-controlled doclet (essentialOutputFormat.<variant>): the fixed
// llmFlow booklet (~3.5k) is dropped from the prompt so the whole budget is controllable.
// The consolidated doclets live in perf-instructions-{small,medium}.js (compressed by the perf agents).

const {
  tgp: { 'ctx-enricher': { setVars } },
  common: { Data, data: { verifiedReportsRegistry } },
  workflow: { Workflow, workflow: { mainWorkflow }, mpi: { mpi } }
} = dsls

const LLM_PROXY = 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy'
const SUMMARY_MODEL = 'openai/gpt-5.4'
const REPORTS_ROOT = 'signedRoom://comaxDemo/usersRO/parquet/OEM_BI_4466'
const PERF_PROMPT = `%$TODAYS_DATE% -- ANALYTICS_QUESTION: %$userMessage%`
const PERF_INSTRUCTIONS = '%$essentialOutputFormat%'
const variantCategory = variant => ({ small: 'reportsAnalyticsSmall', medium: 'reportsAnalyticsMedium', long: 'reportsAnalytics' })[variant]
const variantCategories = variant => variant == 'long' ? { reportsAnalytics: true, reports: true } : { [variantCategory(variant)]: true }
const longInstructions = async ctx => (await Promise.all(['essentialOutputFormat','llmFlow','comaxReportsCatalog','vizWidgets'].map(x => x == 'essentialOutputFormat' ? jb.workflowUtils.docletContent(x, ctx) : jb.workflowUtils.bookletContent(x, ctx).then(y => y?.nested)))).filter(Boolean).join('\n\n')
const perfVars = (ctx, userMessage) => ({ db: 'local', roomId: ctx.vars.roomId || 'comaxDemo', userMessage, llmProxyUrl: LLM_PROXY, summaryModel: SUMMARY_MODEL, accumulatedContext: {}, categories: { local: true } })
const cacheMeasureKey = () => `cache-${Date.now()}-${Math.random().toString(36).slice(2)}`
const perfPromptCtx = async (ctx, {userMessage = 'warmup', variant = 'small'}) => {
  const categories = { ...ctx.vars.categories, ...variantCategories(variant), local: true, viz: true }
  const base = ctx.setVars({ ...perfVars(ctx, userMessage), categories, TODAYS_DATE: new Date().toLocaleDateString() })
  return base.setVars({ essentialOutputFormat: variant == 'long' ? await longInstructions(base) : await jb.workflowUtils.docletContent('essentialOutputFormat', base) })
}

// whole instruction = %$essentialOutputFormat% (the consolidated per-variant doclet); no booklets, so token size is exactly that doclet
const perfWorkflow = category => mainWorkflow({
  main: mpi('%$model%', {
    thinkingBudget: 0,
    prompt: PERF_PROMPT,
    instructions: PERF_INSTRUCTIONS
  }),
  categories: [category, 'local', 'viz'],
  bookletsToLoad: [],
  enrichCtx: setVars(ctx => ({ reportsRegistry: verifiedReportsRegistry.$runWithCtx(ctx), reportsRoot: REPORTS_ROOT, summaryModel: SUMMARY_MODEL }))
})

Workflow('reportsAnalyticsSmall', { params: [{ id: 'model', as: 'string' }], impl: perfWorkflow('reportsAnalyticsSmall') })
Workflow('reportsAnalyticsMedium', { params: [{ id: 'model', as: 'string' }], impl: perfWorkflow('reportsAnalyticsMedium') })

Data('runReportsAnalyticsPerf', {
  params: [
    { id: 'userMessage', as: 'string', mandatory: true },
    { id: 'model', as: 'string' },
    { id: 'variant', as: 'string', defaultValue: 'small' }
  ],
  impl: async (ctx, {}, { userMessage, model, variant }) => {
    const wf = variantCategory(variant)
    const vars = { db: 'local', roomId: ctx.vars.roomId || 'comaxDemo', userMessage, llmProxyUrl: LLM_PROXY, summaryModel: SUMMARY_MODEL, accumulatedContext: {}, categories: { local: true } }
    const wfCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx.setVars(vars))
    return dsls.workflow.workflow[wf].$runWithCtx(wfCtx, { ...(model ? { model } : {}) }).calcWorkflow(wfCtx)
  }
})

Data('warmReportsAnalyticsPerfCache', {
  params: [
    { id: 'model', as: 'string', mandatory: true },
    { id: 'variant', as: 'string', defaultValue: 'small' },
    { id: 'userMessage', as: 'string', defaultValue: 'warmup' }
  ],
  impl: async (ctx, {}, { userMessage, model, variant }) => {
    const promptCtx = await perfPromptCtx(ctx, { userMessage, variant })
    return warmLLMCache({ ctx: promptCtx, model, goal: `warm reportsAnalyticsPerf ${variant}`, prompt: promptCtx.exp(PERF_PROMPT, 'string'), instructions: promptCtx.exp(PERF_INSTRUCTIONS, 'string'), thinkingBudget: 0 })
  }
})

Data('measureReportsAnalyticsPerfCache', {
  params: [
    { id: 'model', as: 'string', mandatory: true },
    { id: 'variant', as: 'string', defaultValue: 'small' },
    { id: 'userMessage', as: 'string', defaultValue: 'המלץ על מבצעים בגני תקווה' },
    { id: 'cacheKey', as: 'string' },
    { id: 'writeLog', as: 'boolean', defaultValue: true }
  ],
  impl: async (ctx, {}, { userMessage, model, variant, cacheKey, writeLog }) => {
    const promptCtx = await perfPromptCtx(ctx, { userMessage, variant }), prompt = promptCtx.exp(PERF_PROMPT, 'string'), instructions = promptCtx.exp(PERF_INSTRUCTIONS, 'string'), key = cacheKey || cacheMeasureKey()
    const saltedInstructions = suffix => (instructions.match(/[\s\S]{1,900}/g) || ['']).map((part, i) => `CACHE_MEASURE_KEY: ${suffix}; PART: ${i}\n${part}`).join('\n')
    const run = async (goal, suffix) => {
      const start = Date.now()
      const {responseText, llmStats = {}} = await fetchItemsFromLLMReactiveP({ ctx: promptCtx, model, goal, prompt, instructions: saltedInstructions(suffix), thinkingBudget: 0, maxTokens: 1 })
      return { duration: Date.now() - start, ...llmStats, responseChars: responseText?.length || 0 }
    }
    const cold = await run(`cold reportsAnalyticsPerf ${variant}`, `${key}-cold`)
    const prewarm = await warmLLMCache({ ctx: promptCtx, model, goal: `warm reportsAnalyticsPerf ${variant}`, prompt, instructions: saltedInstructions(`${key}-warm`), thinkingBudget: 0 })
    const warm = await run(`cached reportsAnalyticsPerf ${variant}`, `${key}-warm`)
    const result = { model, variant, cold, prewarm, warm, improvementPct: cold.duration && warm.duration ? Math.round((1 - warm.duration / cold.duration) * 100) : null }
    return writeLog ? { ...result, bigLog: await writeBigLog({ roomId: promptCtx.vars.roomId, fileName: `perf-cache-${Date.now()}`, payload: result, metadata: { test: 'perfLab.cacheTiming.live', model, variant }, ctx: promptCtx }) } : result
  }
})

Data('reportsAnalyticsPerfPromptParts', {
  params: [
    { id: 'userMessage', as: 'string', defaultValue: 'warmup' },
    { id: 'variant', as: 'string', defaultValue: 'small' }
  ],
  impl: async (ctx, {}, { userMessage, variant }) => {
    const promptCtx = await perfPromptCtx(ctx, { userMessage, variant })
    return { prompt: promptCtx.exp(PERF_PROMPT, 'string'), instructions: promptCtx.exp(PERF_INSTRUCTIONS, 'string') }
  }
})
