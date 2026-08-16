import { dsls, jb } from '@jb6/core'
import '@wonder/ai/llm-flow-main-workflow.js'
import '@jb6/llm-guide'
import '@wonder/ai/duckdb-sql-step.js'
import '../comax/Doclets/viz-doclets.js'
import './demo-financial-cube-v2.js'
import '@wonder/db/room/room-lambda-client.js'

const {
  tgp: { Component, 'ctx-enricher': { setupCube } },
  common: { Lambda, data: { cubeQuery } },
  'llm-guide': { Booklet, Doclet, booklet: { booklet } },
  workflow: { Workflow, workflow: { mainWorkflow }, mpi: { mpi } },
  bi: { cube: { demoFinanacialCubeV2 } }
} = dsls

const cubeVocab = () => jb.biUtils.cubeVocab(demoFinanacialCubeV2.$run())
const LLM_PROXY = 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy'
const MAIN_MODEL = 'gemini/gemini-3.5-flash'
const SUMMARY_MODEL = 'openai/gpt-5.4'

Booklet('financeAnalytics', { impl: booklet('financeLocalData,financeSchema,financeQuestions,financeTone') })

Doclet('financeLocalData.local', {
  impl: `
Finance portfolio analytics runs as data<common>cubeQuery over demoFinanacialCubeV2, never raw duckDbSql.
The GCS dataset is already bound. Write no FROM clause or file path; select metric names and group by dimensions.
Example: select customer_id as "name",completed_value as "value" group by 1 order by 2 desc limit 8.
Only raw-row analysis names {%$transactions%}; normal business questions use cube vocabulary.
`
})

Doclet('financeSchema', {
  impl: () => `
The cube below is the complete business vocabulary. Select metric names directly and group/filter by dimensions.
Raw columns available through {%$transactions%}: source_row, transaction_id, date, customer_id, product,
payment_method, status, quantity, price, transaction_value, source_date_quality and has_quality_issue.
Lookup dimensions and metrics automatically add only their required customer, product or payment joins.
${cubeVocab()}
`
})

Doclet('financeQuestions', {
  impl: `
Build answers as metric × dimension aggregates. Useful dimensions are customer_id, customer_type, customer_country,
loyalty_tier, product, product_category, payment_method, payment_channel, status and date.
Use completed_value for realised sales, gross_profit for profitability, payment_fees for processing expense,
and quality_issue_rate for source risk. Never invent currency conversion, wallet balances, payouts or cash direction.
`
})

Doclet('financeTone', {
  impl: `
Answer as a concise portfolio analyst in English. Lead with the material number in **bold**.
Display money as dataset dollars. State when cost, fees or profit are estimates and note source-quality caveats when material.
`
})

Doclet('llmSummary.dataInsights.finance', {
  impl: `
Write for a portfolio owner using only the aggregate rows named by the evaluation.
SHORT_ANSWER is one useful sentence. LONG_ANSWER is 3–4 concise business sentences with leading values and drivers.
Format money with $ and percentages with two decimals. Mention estimated cost/fees or source quality only when material.
`
})

Doclet('essentialOutputFormat.finance', {
  impl: `
Return one javascript code block containing a flow:
1. setCtxData runs one aggregate data<common>cubeQuery with no FROM or path.
2. setCtxVar rows uses data<common>jqSingle with exp '.'.
3. setCtxVar answer uses data<common>llmSummary with summaryCategories 'dataInsights'.
4. flow-elem<workflow>finalAnswer returns text, narrative, sql, rows, widgets and followUps declaratively.
Charts declare kind, title, nameCol and valueCol; never embed rows/data/series. Use output aliases "name" and "value".
Every flow element has a short present-tense status. Keep result sets aggregate and normally limit top-N to 20.

\`\`\`javascript
{$: 'flow-elem<workflow>flow', elems: [
  {$: 'flow-elem<workflow>setCtxData', goal: 'Run cube query', status: 'Querying portfolio...',
    value: {$: 'data<common>cubeQuery',
      sql: 'select product as "name",completed_value as "value" group by 1 order by 2 desc limit 8'}},
  {$: 'flow-elem<workflow>setCtxVar', goal: 'Keep rows', varName: 'rows',
    value: {$: 'data<common>jqSingle', exp: '.'}},
  {$: 'flow-elem<workflow>setCtxVar', goal: 'Write answer', status: 'Summarising...', varName: 'answer',
    value: {$: 'data<common>llmSummary', summaryCategories: 'dataInsights',
      evaluation: 'Write SHORT_ANSWER and LONG_ANSWER naming the leading product and completed value.'}},
  {$: 'flow-elem<workflow>finalAnswer', goal: 'Return answer', status: 'Composing answer...',
    sql: 'select product as "name",completed_value as "value" group by 1 order by 2 desc limit 8',
    narrative: '{0.name} leads completed value at {0.value:$}.',
    widgets: [{kind: 'bar', title: 'Completed value by product', valueFormat: '$',
      nameCol: 'name', valueCol: 'value'}],
    followUps: [{label: 'Product profit', question: 'Compare gross profit by product.'}]
  }
]}
\`\`\`
`
})

Component('anchorTodayToDataEnd', {
  type: 'ctx-enricher<tgp>',
  params: [
    { id: 'summaryModel', as: 'string' },
    { id: 'dataEnd', dynamic: true,
      defaultValue: cubeQuery(`select strftime(max(date), '%Y-%m-%d') as "d"`) }
  ],
  impl: async (ctx, {}, { summaryModel, dataEnd }) => {
    const d = (await dataEnd(ctx))?.[0]?.d
    return ctx.setVars({ summaryModel, ...(d && { TODAYS_DATE: `${d} (the dataset's last day; treat it as today)` }) })
  }
})
const { anchorTodayToDataEnd } = dsls.tgp['ctx-enricher']

Workflow('financeAnalytics', {
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
%$financeAnalytics%
%$vizWidgets%
Write one aggregate cubeQuery, then llmSummary, then finalAnswer. Never name a file or embed widget rows.
`
    }),
    categories: ['finance', 'local', 'viz'],
    bookletsToLoad: ['financeAnalytics', 'vizWidgets'],
    enrichCtx: anchorTodayToDataEnd('%$summaryModel%')
  })
})

Lambda('runFinanceReportBatch', {
  permissionByPath: 'usersRO',
  params: [{ id: 'entries', as: 'array', mandatory: true }],
  impl: async (ctx, {}, { entries }) => {
    const base = await Promise.resolve(ctx.run(setupCube(demoFinanacialCubeV2())))
    return Promise.all((entries || []).map(async e => {
      const runCtx = base.setVars({ ...(e.vars || {}), depth: e.depth || 'medium', cubeWhere: e.where || '' })
      try {
        const rep = e.report && dsls.bi.report[e.report]
        if (e.report && !rep) throw new Error(`unknown report<bi> ${e.report}`)
        return await runCtx.run(rep ? rep() : cubeQuery({ sql: e.sql, where: e.where || '' }))
      } catch (error) {
        return { error: String(error?.message || error) }
      }
    }))
  }
})

Lambda('runFinanceAnalytics', {
  permissionByPath: 'usersRO',
  params: [
    { id: 'userMessage', as: 'string', mandatory: true },
    { id: 'chatHistory', as: 'array' }
  ],
  impl: async (ctx, {}, { userMessage, chatHistory }) => {
    const vars = {
      db: 'bucket', userMessage, llmProxyUrl: LLM_PROXY, summaryModel: SUMMARY_MODEL,
      accumulatedContext: { chatHistory }, categories: { finance: true, local: true, viz: true }
    }
    const cubeCtx = await Promise.resolve(ctx.setVars(vars).run(setupCube(demoFinanacialCubeV2())))
    const wfCtx = await jb.workflowUtils.extendWithWorkflowVars(cubeCtx)
    return dsls.workflow.workflow.financeAnalytics.$runWithCtx(wfCtx).calcWorkflow(wfCtx)
  }
})
