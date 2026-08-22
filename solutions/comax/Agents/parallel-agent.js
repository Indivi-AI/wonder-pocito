import { dsls } from '@jb6/core'
import '@wonder/ai/parallel-step.js'
import '../nostalgy/reports-based-agent.js'   // registers the reportsAnalytics workflow
import './analytics-agent.js'       // registers the basicAnalytics workflow

const {
  common: { data: { runAgentWorkflow, decideBestAnswer } },
  ai: { Workflow, workflow: { flowWorkflow }, 'flow-elem': { flow, parallel, setCtxData, setCtxVar } }
} = dsls

export const SQL_AGENT_MODEL = 'openai/gpt-5.5'
const SUMMARY_MODEL = 'openai/gpt-5.4'

export const comaxAgentPanelFlow = (sqlModel = ctx => ctx.exp('%$model%', 'string') || SQL_AGENT_MODEL) => flow({ elems: [
  setCtxVar({ goal: 'SQL-agent model - a chosen model overrides the default GPT-5.5', varName: 'sqlModel', value: sqlModel }),
  setCtxData({
    goal: 'Run the reports agent and the SQL agent in parallel',
    status: 'מריץ שני מנועי אנליטיקה במקביל...',
    value: parallel({ branches: [
      setCtxData({ goal: 'Reports-based agent', value: runAgentWorkflow('reportsAnalytics', '%$model%') }),
      setCtxData({ goal: 'Free-SQL agent', value: runAgentWorkflow('basicAnalytics', '%$sqlModel%') })
    ] })
  }),
  setCtxData({
    goal: 'Judge and pick the better answer',
    status: 'בוחר את התשובה הטובה ביותר...',
    value: decideBestAnswer({
      criteria: `שאלת המשתמש: %$userMessage%

לפניך תשובות מועמדות ממנועי אנליטיקה שונים על אותה שאלה. בחר את התשובה הטובה ביותר למנהל קמעונאי לפי נכונות, ביסוס בנתונים, בהירות ואיכות הויזואליזציה. נמק בעברית.`,
      sources: ['reportsAnalytics', 'basicAnalytics/%$sqlModel%'],
      model: '%$summaryModel%'
    })
  })
] })
export const comaxAgentPanelTemplateFlow = () => comaxAgentPanelFlow(SQL_AGENT_MODEL)

// runs the reports agent and the free-SQL agent on the same question, concurrently, then an LLM judge returns the better answer.
// model: a chosen debug model runs BOTH agents; unset keeps the curated pair (reports on its default, SQL on GPT-5.5)
Workflow('comaxAgentPanel', {
  params: [
    { id: 'model', as: 'string' },
    { id: 'summaryModel', as: 'string', defaultValue: SUMMARY_MODEL }
  ],
  impl: flowWorkflow({
    flow: comaxAgentPanelFlow()
  })
})
