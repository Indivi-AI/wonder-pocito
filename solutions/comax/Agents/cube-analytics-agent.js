// cube-analytics-agent.js — Ask-AI analytics over the comax2 comaxSalesCube semantic layer.
// Like finance-analytics.js: the LLM writes ONE data<common>cubeQuery `select … from base` — never a parquet path.
// The cube owns the data (dims/metrics/limits, rendered here by cubeVocab); this file owns only tone + the query-surface prompt.
import { dsls, jb } from '@jb6/core'
import '@wonder/llm-flow/llm-flow-main-workflow.js'
import '@jb6/llm-guide'
import '@wonder-admin/comax2/comax-cube.js'   // comaxSalesCube semantic layer + setupComax binding
import '../Doclets/viz-doclets.js'            // the vizWidgets booklet — reused as-is
import '@wonder-admin/room/room-lambda-client.js'   // runner deps + permissionByPath field, must be in the lambda closure

const {
  tgp: { Component, 'ctx-enricher': { setupCube, setupComax } },
  common: { Lambda, data: { cubeQuery } },
  'llm-guide': { Doclet },
  workflow: { Workflow, workflow: { mainWorkflow }, mpi: { mpi } },
  bi: { cube: { comaxSalesCube } }
} = dsls

const LLM_PROXY = 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy'
const MAIN_MODEL = 'gemini/gemini-3.5-flash'
const SUMMARY_MODEL = 'openai/gpt-5.4'
// schema rendered live from the cube — dimensions + metric fragments + the cube's limits, the single source of truth
const CUBE_VOCAB = jb.biUtils.cubeVocab(comaxSalesCube.$run())
const MAX_DATE = jb.coreRegistry.consts.fiveStarsSchema.MAX_DATE   // the frozen demo ledger's last day

// the workflow's one enricher: bind the cube (so cubeQuery works in-process AND via lambda) + anchor today to the frozen ledger.
// comaxArgs defaults to a full window; the lambda's period param wins when it set comaxArgs first.
Component('setupComaxCubeAgent', {
  type: 'ctx-enricher<tgp>',
  params: [{ id: 'summaryModel', as: 'string' }],
  impl: async (ctx, {}, { summaryModel }) => {
    const local = ['local', 'fs'].includes(ctx.vars.db)   // dev browser reads the on-disk room mirror via the public room:// scheme, never the protected signed bucket
    const pre = ctx.setVars({ cacheStrategy: globalThis.process?.platform === 'linux' ? 'colsCache' : 'fullFileCache',   // colsCache extension is linux-only; off-linux mirror whole files (finance parity)
      ...(local && { cubeWUrlBase: comaxSalesCube.$run().wUrlBase.replace('signedRoom://', 'room://') }) })   // ambient base wins in querySetup, so lookups resolve to the local mirror before the sign
    const bound = await Promise.resolve(pre.run(setupCube(comaxSalesCube())))
    return bound.setVars({ comaxArgs: bound.vars.comaxArgs || { period: 'ytd', prior: true }, summaryModel,
      TODAYS_DATE: `${MAX_DATE} (the dataset's last day — treat it as today)` })
  }
})
const { setupComaxCubeAgent } = dsls.tgp['ctx-enricher']

// the comax finalAnswer contract: write cubeQuery over `base`, aggregate, answer in Hebrew. Selected by the 'comax' category.
Doclet('essentialOutputFormat.comax', {
  impl: `
Return only one javascript code block containing a flow with this backbone:
1) setCtxData running data<common>cubeQuery — the FROM is ALWAYS \`base\` (the cube's star injects joins + the date window). NEVER a file path, read_parquet or room:// url. Select the cube's metric fragments (sum(net_sales_amount), …) and GROUP BY the requested dimension so the result is COMPACT AGGREGATES: ORDER BY the key metric, LIMIT a top-N (<=20). The sql param is ONE plain string.
2) setCtxVar 'rows' with data<common>jqSingle exp '.' — copy VERBATIM; it keeps the aggregate rows.
3) setCtxVar 'answer' via data<common>llmSummary summaryCategories 'dataInsights' — a one-sentence SHORT_ANSWER and a 3-4 sentence LONG_ANSWER, in Hebrew.
4) flow-elem<workflow>finalAnswer — DECLARATIVE { text, narrative, sql, rows, widgets, followUps }. The runtime reads the answer/rows vars, echoes your sql, materializes widgets from the rows and handles empty rows — do NOT write an empty-rows branch and do NOT build the object with jq.
finalAnswer params: sql (the SAME literal string you ran); narrative (ONE Hebrew sentence, {0.col} inserts row 0's column, {0.col:₪} formats); widgets (declarative kind + nameCol/valueCol for charts, kind:'table' + columns for tables — NEVER data/rows/series); followUps (2-4 Hebrew {label, question}, label <=40 chars). Each flow element carries a short Hebrew present-tense status.
\`\`\`javascript
{$:'flow-elem<workflow>flow', elems:[
  {$:'flow-elem<workflow>setCtxData', goal:'Query sales', status:'שולף מכירות...',
    value:{$:'data<common>cubeQuery', sql:'select branch as "name", round(sum(net_sales_amount),2) as "value" from base group by 1 order by 2 desc limit 8'},
    postCondition:{$:'boolean<common>jqBoolean', exp:'type == "array"'}},
  {$:'flow-elem<workflow>setCtxVar', goal:'Keep rows', varName:'rows', value:{$:'data<common>jqSingle', exp:'.'}},
  {$:'flow-elem<workflow>setCtxVar', goal:'Write answer', status:'מסכם...', varName:'answer',
    value:{$:'data<common>llmSummary', summaryCategories:'dataInsights', evaluation:'כתוב SHORT_ANSWER במשפט אחד עם הסניף המוביל והסכום ב-**bold**, ו-LONG_ANSWER בן 3-4 משפטים. אם אין שורות, ציין שלא נמצאו נתונים.'},
    postCondition:{$:'boolean<common>jqBoolean', exp:'(type == "string" and length > 0) or (.text | type == "string" and length > 0)'}},
  {$:'flow-elem<workflow>finalAnswer', goal:'Return answer', status:'מרכיב תשובה...',
    sql:'select branch as "name", round(sum(net_sales_amount),2) as "value" from base group by 1 order by 2 desc limit 8',
    narrative:'הסניף המוביל הוא {0.name} עם {0.value:₪}.',
    widgets:[{kind:'hbar', title:'סניפים מובילים · ₪', valueFormat:'₪', nameCol:'name', valueCol:'value', highlight:{max:true, note:'הסניף המוביל'}}],
    followUps:[{label:'מול אשתקד', question:'מה המכירות בכל סניף מול אשתקד?'},{label:'פריטים מובילים', question:'אילו פריטים נמכרו הכי הרבה?'}]}
]}
\`\`\`
`
})

// wins over the generic llmSummary.dataInsights when the summary runs with the comax category/room
Doclet('llmSummary.dataInsights.comax', {
  impl: `
Write the answer for an Israeli supermarket buyer/manager, in Hebrew.
- The input is pre-aggregated top-N data; #FLOW_VARS holds the named results — ground the answer ONLY in the vars the EVALUATION names. The full detail is in the interactive widgets/table below — do NOT repeat every row.
- SHORT_ANSWER is exactly one sentence. LONG_ANSWER is 3-4 concise business sentences covering each named var, with the leading 1-2 items and key numbers in **bold**.
- Money is ₪ (net of VAT unless said otherwise). Format every number with thousands separators (1904249 -> 1,904,249); percents are already 0-100.
- Add a short caveat only when material (partial last period, cost coverage below 100%) — not a checklist.
`
})

Workflow('comaxCubeAnalytics', {
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
%$vizWidgets%
${CUBE_VOCAB}
Compose ONE data<common>cubeQuery over the bound comax cube — the FROM is always \`base\`, never a file path. A complex question still uses ONE base query with more dimensions, not disconnected queries. Answer in Hebrew RTL; %$essentialOutputFormat% holds the exact flow shape.
`
    }),
    categories: ['comax', 'viz'],
    bookletsToLoad: ['vizWidgets'],
    enrichCtx: setupComaxCubeAgent('%$summaryModel%')
  })
})

// binds the cube (setupComax prefetches signed URLs + folds the star modifiers), then runs the workflow where duckdb lives
Lambda('runComaxCubeAnalytics', {
  permissionByPath: 'usersRO',
  params: [
    { id: 'userMessage', as: 'string', mandatory: true },
    { id: 'chatHistory', as: 'array' },
    { id: 'period', as: 'string', defaultValue: 'ytd' },
    { id: 'prior', as: 'boolean', defaultValue: true }
  ],
  impl: async (ctx, {}, { userMessage, chatHistory, period, prior }) => {
    const vars = { userMessage, llmProxyUrl: LLM_PROXY, summaryModel: SUMMARY_MODEL, accumulatedContext: { chatHistory }, categories: { comax: true, viz: true } }
    const cubeCtx = await Promise.resolve(ctx.setVars(vars).run(setupComax(comaxSalesCube(), { period, prior })))
    const wfCtx = await jb.workflowUtils.extendWithWorkflowVars(cubeCtx)
    return dsls.workflow.workflow.comaxCubeAnalytics.$runWithCtx(wfCtx).calcWorkflow(wfCtx)
  }
})
