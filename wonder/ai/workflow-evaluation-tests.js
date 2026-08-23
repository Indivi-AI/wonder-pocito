import './workflow-testers.js'
import './llm-call.js'
import { dsls } from '@jb6/core'

const { test: { Test, test: { workflowTest } },
  ai: { evaluation: { accuracy, agentAsJudge, performance }, workflow: { llmCall }, mpi: { mpi } } } = dsls

Test('workflowTest.simpleLlm', {
  HeavyTest: true,
  impl: workflowTest({
    workflow: llmCall({
      mpi: mpi('groq/openai/gpt-oss-120b', {
        prompt: 'Return the number 4',
        instructions: `Reply only with this exact code block:
\`\`\`javascript
{$: 'flow-elem<ai>setCtxData', goal: 'answer', value: 4}
\`\`\``,
        thinkingBudget: 0
      }),
      bookletsToLoad: []
    }),
    roomId: 'BSG-prod-slice',
    userMessage: 'Return the number 4',
    expectedResult: '%runRes% == 4',
    timeout: 120000
  })
})

Test('workflowEvaluationTest.severalEvaluators', {
  HeavyTest: true,
  impl: workflowTest({
    workflow: llmCall({
      mpi: mpi('groq/openai/gpt-oss-120b', {
        prompt: 'Return the number 4',
        instructions: `Reply only with this exact code block:
\`\`\`javascript
{$: 'flow-elem<ai>setCtxData', goal: 'answer', value: 4}
\`\`\``,
        thinkingBudget: 0
      }),
      bookletsToLoad: []
    }),
    userMessage: 'Return the number 4',
    evaluations: [
      accuracy('%runRes%', 4),
      agentAsJudge('The candidate output must be exactly the number 4', '%runRes%', {
        model: 'groq/openai/gpt-oss-120b'
      }),
      performance('%runRes%')
    ],
    timeout: 120000
  })
})
