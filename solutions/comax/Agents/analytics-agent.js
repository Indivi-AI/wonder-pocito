import { dsls, jb } from '@jb6/core'
import '@wonder/ai/llm-flow-main-workflow.js'
import '@wonder/core/db-drivers-live-repo.js'
import '@wonder-admin/room/room-lambda-client.js'
import '@wonder-admin/bi/bi-repair-doclets.js'
import '@wonder-admin/comax/comax-repair-doclets.js'
import '../Doclets/comax-analytics-doclets.js'
import '../Doclets/viz-doclets.js'

const {
  tgp: { 'ctx-enricher': { setVars } },
  common: { Data },
  workflow: { Workflow, workflow: { mainWorkflow }, mpi: { mpi } }
} = dsls

const LLM_PROXY = 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy'
const MAIN_MODEL = 'openai/gpt-5.4'
const SUMMARY_MODEL = 'openai/gpt-5.4'

Workflow('basicAnalytics', {
  params: [
    { id: 'model', as: 'string', defaultValue: MAIN_MODEL },
    { id: 'summaryModel', as: 'string', defaultValue: SUMMARY_MODEL }
  ],
  impl: mainWorkflow({
    main: mpi('%$model%', {
      thinkingBudget: 0,
      prompt: `%$TODAYS_DATE% -- ANALYTICS_QUESTION: %$userMessage%
%$essentialOutputFormat%`,
      instructions: `
%$llmFlowBooklet%
%$comaxAnalytics%
%$vizWidgets%
Use one DuckDB SQL query over the Comax ERP parquets in signedRoom://comaxDemo/usersRO/parquet;
never use repo-local admin/comax paths. Complex questions use joins or CTEs, not disconnected queries.
Keep rows and exact SQL in vars, run llmSummary, then return
{ text, narrative, sql, rows, widgets, followUps } with Hebrew RTL-friendly markdown.
Aggregate in SQL so downstream receives compact results, not raw data. Empty arrays are valid.
End with flow-elem<workflow>finalAnswer; never assemble the final object with jq.
Declare chart nameCol/valueCol and table columns; never pass widget data/rows/series/items.
Before writing the flow, split the question into every requested outcome. SQL, summary and widgets must cover all.
Never use a source lacking a requested entity or metric.
For top/bottom/best/worst return the requested N or 10 ordered context rows, winner first, never only the winner.
For dependent rankings, such as top branch and its top product, use CTEs in the one query.
Every ranking claim needs its own 10-row list and visible widget. Never keep one ranking only as a scalar helper CTE.
For two rankings, align both lists by rank in the result and declare two widgets.
All visible text, titles, labels and followUps must use natural Hebrew business terms only.
Never expose table/column names, SQL aliases, snake_case, rows, reportResult or other implementation terms.
Do not use English ranking phrases such as "Top 10"; say "עשרת המובילים" or the natural Hebrew equivalent.
Keep technical keys internal, map each visible field to Hebrew, and repeat this rule in llmSummary evaluation.
Use Hebrew titles/highlights, grounded Hebrew followUps and short Hebrew status text.
For ambiguous named products or branches, inspect accumulatedContext.clarifiedParams and chatHistory first.
Use asHumanFeedback with comaxEntityCandidates only for a still-unresolved user-supplied name, not dimensions/top lists.
Filter ids with %$selectedProducts.sqlIn%/%$selectedBranches.sqlIn% and names with
%$selectedProducts.sqlLabelsIn%/%$selectedBranches.sqlLabelsIn%. Never use {{...}} for human feedback vars.
When an assistant chatHistory turn has rowsShown/entitiesShown, those are the rows the user actually saw -
preserve those visible categories unless the new question requests another slice, and use that turn's caveats
to explain coverage gaps instead of re-running the same query.
`
    }),
    categories: ['analytics','local','viz','duckdb','comax'],
    bookletsToLoad: ['comaxAnalytics','vizWidgets'],
    enrichCtx: setVars(ctx => ({ summaryModel: ctx.exp('%$summaryModel%', 'string') }))   // param → var so the flow's llmSummary uses it
  })
})

Data('runAnalytics', {
  permissionByPath: 'usersRW',
  params: [
    { id: 'userMessage', as: 'string', mandatory: true },
    { id: 'chatHistory', as: 'array' }
  ],
  impl: async (ctx, {}, { userMessage, chatHistory }) => {
    const vars = {db: 'local', userMessage, llmProxyUrl: LLM_PROXY,
      summaryModel: SUMMARY_MODEL, accumulatedContext: {chatHistory},
      categories: {analytics: true, local: true, duckdb: true, comax: true}}
    const wfCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx.setVars(vars))
    return dsls.workflow.workflow.basicAnalytics.$runWithCtx(wfCtx).calcWorkflow(wfCtx)
  }
})
