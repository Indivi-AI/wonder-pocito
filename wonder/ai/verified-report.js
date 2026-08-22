import {dsls, coreUtils, jb} from '@jb6/core'
import '@jb6/react'
import '@wonder/ai/llm-flow-core.js'
import '@wonder/ai/category-dsl.js'
import {fetchItemsFromLLMReactiveP} from '@wonder/ai/reactive-llm.js'

const {tgp: {CategoryType, 'category-type': {categoryTypeBySuffix}}, common: {Data, VerifiedReport2, data: {runLLMFlowScript}}, ai: {FlowElem, Workflow},
  react: {'react-comp': reactComps}} = dsls
const {bestVariant} = jb.workflowUtils

CategoryType('section', {
  impl: categoryTypeBySuffix('Section', 'VerifiedReport2')
})

const categorizedReportViewId = Data('categorizedReportViewId', {
  params: [
    {id: 'reportId', as: 'string', mandatory: true}
  ],
  impl: (ctx, {}, {reportId}) => Object.entries(reactComps)
    .filter(([id, comp]) => comp?.[coreUtils.asJbComp] && id.startsWith(`${reportId}.`) && id.split('.').includes('reportView'))
    .map(([id]) => id).reduce((best, id) => bestVariant([best, id], ctx), null)
})

const categorizedSummaryFlowId = Data('categorizedSummaryFlowId', {
  params: [{id: 'reportId', as: 'string', mandatory: true}],
  impl: (ctx, {}, {reportId}) => coreUtils.globalsOfTypeIds(FlowElem, 'all').filter(id => id.startsWith(`${reportId}.summaryFlow.`))
    .reduce((best, id) => bestVariant([best, id], ctx), null)
})

FlowElem('calcVerifiedReport', {
  description: 'execute a predefined verified report and attach its best categorized UI',
  params: [
    {id: 'report', dynamic: true, mandatory: true},
    {id: 'showIn', as: 'string', options: 'nextChatItem,sidePanel,doNotShow', defaultValue: 'nextChatItem'},
    {id: 'summaryCategories', as: 'string', defaultValue: 'noSummary'}
  ],
  impl: async (ctx, {workflowLogger}, {report, showIn, summaryCategories}) => {
    const shortId = coreUtils.compIdOfProfile(report.profile).split('>').pop(), reportId = shortId.split('.')[0]
    if (!VerifiedReport2[shortId]) return ctx.setData({error: `${shortId} is not a VerifiedReport2`, reportId})
    try {
      const rows = await report(ctx), categories = {...ctx.vars.categories, reportView: true, [showIn]: true}
      const viewId = ctx.setVars({categories}).run(categorizedReportViewId(reportId))
      if (showIn != 'doNotShow' && !viewId) return ctx.setData({error: `${reportId} has no matching reportView`, reportId})
      const result = {reportId, rows, showIn, ...(viewId && showIn != 'doNotShow' && {viewId})}
      const summary = Object.fromEntries(summaryCategories.split(',').map(x => [x.trim(), true]))
      const summaryId = !summary.noSummary && ctx.setVars({categories: {...categories, ...summary, summaryFlow: true}})
        .run(categorizedSummaryFlowId(reportId))
      return summaryId ? ctx.setData(result).run(FlowElem[summaryId]()) : ctx.setData(result)
    } catch (error) {
      workflowLogger?.error?.({t: 'calcVerifiedReport failed', reportId, error: error.stack || String(error)}, {}, {ctx, error})
      return ctx.setData({error: error.stack || String(error), reportId})
    }
  }
})

const verifiedReportsCatalog = Data('verifiedReportsCatalog', {
  impl: async ctx => (await Promise.all(Object.entries(VerifiedReport2)
    .filter(([id, report]) => report?.[coreUtils.asJbComp] && id.split('.').slice(1).some(x => ctx.vars.categories?.[x]))
    .map(async ([id, report]) => {
      const reportId = id.split('.')[0], def = report[coreUtils.asJbComp]
      const viewId = ctx.setVars({categories: {...ctx.vars.categories, reportView: true}}).run(categorizedReportViewId(reportId))
      const params = await Promise.all((def.params || []).map(async param => {
        const guidance = param.guidance && await ctx.run(param.guidance)
        return `${param.id}${param.mandatory ? '' : '?'}: ${param.as || param.type || 'data'}`
          + `${param.description ? ` — ${param.description}` : ''}`
          + `${guidance ? `\nGuidance: ${coreUtils.prettyPrint(guidance, {noMacros: true})}` : ''}`
      }))
      return `${id}(${params.join(', ')})\nUse when: ${def.whenToUse}\nReport: ${def.description}\n`
        + `UI: ${reactComps[viewId]?.[coreUtils.asJbComp]?.description || 'predefined rich report view'}`
    }))).join('\n\n')
})

Workflow('verifiedReportAgent', {
  params: [
    {id: 'agentContext', type: 'ctx-enricher<tgp>', dynamic: true, mandatory: true},
    {id: 'booklet', dynamic: true, mandatory: true},
    {id: 'model', as: 'string', defaultValue: 'openrouter/google/gemini-3-flash-preview'},
    {id: 'goal', as: 'string', defaultValue: 'select verified report'}
  ],
  impl: (compCtx, {}, {agentContext, booklet, model, goal}) => ({calcWorkflow: async ctx => {
    const workflowId = coreUtils.callerCompId(compCtx.jbCtx) || 'verifiedReportAgent'
    ctx = ctx.setVars({workflowStack: [...(ctx.vars.workflowStack || []),
      {workflowId, workflowRunId: Math.random().toString(36).slice(2, 12), goal}]})
    ctx = await agentContext(await jb.workflowUtils.extendWithWorkflowVars(ctx))
    ctx = ctx.setVars({categories: {...ctx.vars.categories, reportView: true}})
    const {responseText} = await fetchItemsFromLLMReactiveP({ctx, model: ctx.vars.flowModel || model, goal,
      prompt: ctx.vars.userMessage, instructions: await booklet(ctx), context: JSON.stringify(ctx.vars.accumulatedContext),
      temperature: 0, thinkingBudget: 0})
    const res = responseText.includes('flow-elem<ai>calcVerifiedReport')
      ? await ctx.run(runLLMFlowScript(responseText)) : {runRes: {text: responseText}}
    const report = res?.runRes
    return report?.viewId || report?.text ? res : {...res,
      runRes: {text: report?.error || report?.bigLogWUrl || 'No verified report matched this question.'}}
  }})
})
