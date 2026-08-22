import './workflow-testers.js'
import './parallel-step.js'
import { dsls } from '@jb6/core'

const { test: { Test, test: { workflowTest } },
  ai: { evaluation: { accuracy, agentAsJudge, performance, reliability }, workflow: { flowWorkflow }, 'flow-elem': { setCtxData } } } = dsls

Test('workflowEvaluationTest.severalEvaluators', {
  HeavyTest: true,
  impl: workflowTest({
    workflow: flowWorkflow(setCtxData('answer', 4)),
    userMessage: 'Return the number 4',
    evaluations: [
      accuracy('%runRes%', 4),
      agentAsJudge('The candidate output must be exactly the number 4', '%runRes%', {
        model: 'openrouter/google/gemini-2.5-flash-preview-09-2025'
      }),
      performance('%runRes%'),
      reliability([], [])
    ],
    timeout: 120000
  })
})
