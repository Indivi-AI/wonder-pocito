import { dsls } from '@jb6/core'
import '@wonder/ai/agent-steps.js'
import '@wonder/ai/parallel-step.js'
import '../nostalgy/retrieval-analytics-agent.js'   // registers retrievalAnalytics + exports retrieveDoclets
import { retrieveDoclets, RETRIEVAL_MODEL } from '../nostalgy/retrieval-analytics-agent.js'

const {
  tgp: { 'ctx-enricher': { setVars } },
  common: { data: { runAgentWorkflow, llmVerdict } },
  workflow: { Workflow, workflow: { flowWorkflow, mainWorkflow }, mpi: { mpi }, 'flow-elem': { flow, setCtxVar, setCtxData, until } }
} = dsls

const MAIN_MODEL = 'gemini/gemini-3.5-flash'
const SUMMARY_MODEL = 'openai/gpt-5.4'
const CRITIC_MODEL = 'openai/gpt-5.4'

const CRITIC_CRITERIA = `The RESULT must be a complete Hebrew BI answer to the retail-manager question: %$baseUserMessage%
PASS only if ALL hold:
- text answers the question directly with concrete numbers, in Hebrew
- sql exists and its filters match the question: correct period/window, net revenue = Scm-VatAmount when revenue is involved, item-level data anchored at 2024+
- rows ground the numbers appearing in text
- when the question is time-relative, the answer states the period anchor it used
If the underlying data CANNOT answer the question, PASS only when the text explicitly states what data is missing (a clearly-labeled proxy alongside is fine).
FAIL ONLY on a material defect a rerun can fix (wrong filter/period, ungrounded numbers, empty answer); do NOT fail for style, extra detail you would add, or minor phrasing. When in doubt, PASS.
On FAIL give one short fixable instruction: what to change in the SQL or the answer.`

export const verifiedAnalyticsFlow = ({
  baseUserMessage = ctx => ctx.vars.baseUserMessage || ctx.vars.userMessage,
  retrievedDoclets = async ctx => ctx.vars.retrievedDoclets || retrieveDoclets(ctx, ctx.vars.baseUserMessage, ctx.exp('%$retrievalModel%', 'string')),
  retryUserMessage = ctx => ctx.vars.untilFeedback
    ? `${ctx.vars.baseUserMessage}\n\nהתשובה הקודמת נפסלה על ידי מבקר: ${ctx.vars.untilFeedback.reason}\nתקן את השאילתה והתשובה בהתאם.`
    : ctx.vars.baseUserMessage,
  criteria = CRITIC_CRITERIA
} = {}) => flow({ elems: [
  setCtxVar({ goal: 'Keep the original question stable across retries', varName: 'baseUserMessage', value: baseUserMessage }),
  setCtxVar({ goal: 'Retrieve verified reference answers once', varName: 'retrievedDoclets', value: retrievedDoclets }),
  until({
    goal: 'Answer with the retrieval agent, judge with a critic, retry on fixable failures',
    maxRuns: 2,
    body: flow({ elems: [
      setCtxVar({ goal: 'Inject critic feedback into the question on retry', varName: 'userMessage', value: retryUserMessage }),
      setCtxData({ goal: 'Run the retrieval analytics agent', status: 'מריץ ניתוח...', value: runAgentWorkflow('retrievalAnalytics', '%$model%') })
    ] }),
    verifier: llmVerdict({ criteria, model: '%$criticModel%' })
  })
] })
export const verifiedAnalyticsTemplateFlow = () => verifiedAnalyticsFlow({
  baseUserMessage: '%$userMessage%',
  retrievedDoclets: '%$retrievedDoclets%',
  retryUserMessage: '%$baseUserMessage%',
  criteria: 'PASS when the Hebrew result answers %$baseUserMessage% with grounded rows and matching SQL.'
})

// verifiedAnalytics: evaluator-optimizer wrapper - retrievalAnalytics answers, an LLM critic judges,
// a failed verdict reruns the agent with the critic feedback appended to the question (Reflexion)
Workflow('verifiedAnalytics', {
  params: [
    { id: 'model', as: 'string' },
    { id: 'retrievalModel', as: 'string', defaultValue: RETRIEVAL_MODEL },
    { id: 'criticModel', as: 'string', defaultValue: CRITIC_MODEL }
  ],
  impl: flowWorkflow({
    flow: verifiedAnalyticsFlow()
  })
})

// agenticAnalytics: retrievalAnalytics whose LLM-authored flow ENDS with a replan element -
// the plan self-extends (verifier + follow-up flow) until the task is judged complete
Workflow('agenticAnalytics', {
  params: [
    { id: 'model', as: 'string', defaultValue: MAIN_MODEL },
    { id: 'summaryModel', as: 'string', defaultValue: SUMMARY_MODEL },
    { id: 'retrievalModel', as: 'string', defaultValue: RETRIEVAL_MODEL }
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
%$retrievedDoclets%
Use one DuckDB SQL query over the Comax supermarket ERP parquets in signedRoom://comaxDemo/usersRO/parquet, never repo-local admin/comax paths. Keep its rows and exact SQL string in vars, then llmSummary, then return { text, narrative, sql, rows, widgets, followUps } with Hebrew RTL-friendly markdown. Aggregate inside SQL - GROUP BY with counts/sums/avg and relevant min/max, ORDER BY the metric and LIMIT to a top-N - so downstream gets compact aggregates, not whole datasets. Empty arrays are valid: do not require length > 0. Assemble the answer with flow-elem<workflow>finalAnswer (declarative assembly: literal sql string, narrative template, chart widgets with nameCol/valueCol and table widgets with columns — the runtime builds data/rows from the rows) and never assemble the final object with jq. Never pass widget data/rows/series/items. Prefer a coherent widget set from the same rows, with Hebrew titles/highlights and grounded Hebrew followUps. Complex questions should use joins, not disconnected queries. Narrate progress with short Hebrew status text.
The VERY LAST flow element must be a replan element that verifies the task completed and self-extends the plan when it did not:
{$: 'flow-elem<workflow>replan',
  goal: 'ודא שהשאלה נענתה במלואה',
  verifier: {$: 'boolean<common>llmVerdict', criteria: 'the result object has text answering the question with concrete numbers, sql matching the question, and grounded rows; a stated "data is missing" answer also passes: %$userMessage%'},
  maxRuns: 2,
  instructions: '%$llmFlowBooklet%\\n%$comaxAnalytics%\\n%$vizWidgets%'}
`
    }),
    categories: ['analytics', 'local', 'viz'],
    bookletsToLoad: ['comaxAnalytics', 'vizWidgets'],
    enrichCtx: async ctx => ctx.setVars({ summaryModel: ctx.exp('%$summaryModel%', 'string'),
      retrievedDoclets: ctx.vars.retrievedDoclets || await retrieveDoclets(ctx, ctx.vars.userMessage, ctx.exp('%$retrievalModel%', 'string')) })
  })
})
