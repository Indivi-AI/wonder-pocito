import { dsls } from '@jb6/core'
import '@wonder/workflows/workflows.js'
import '@wonder/workflows/workflow-testers.js'

const { test: { Test, test: { workflowTest } }, workflow: { workflow: { simpleLlmCall } } } = dsls
const models = [
  ['gemma4_31b_it', 'gcp/gemma-4-31b-it', 'gemini', 'gemma-4-31b-it'],
  ['gemma4_26b_a4b_it', 'gcp/gemma-4-26b-a4b-it', 'gemini', 'gemma-4-26b-a4b-it'],
  ['qwen3_32b', 'qwen/qwen3-32b', 'openrouter', 'qwen/qwen3-32b']
]

const expected = (provider, model) => ctx => {
  const { responseText, workflowLog = [] } = ctx.data
  const finished = workflowLog.find(x => x.t?.endsWith('llm call finished') && x.model == model)
  const routed = workflowLog.find(x => x.t?.endsWith('llm cache usage') && x.provider == provider && x.model == model)
  const errors = workflowLog.filter(x => x.severity == 'error')
  return responseText?.trim() && finished && routed && !errors.length || { testFailure: JSON.stringify({ responseText, finished, routed, errors }) }
}

const testModel = ([id, model, provider, canonicalModel]) => Test(`workflowTest.reactiveLlm.${id}`, {
  impl: workflowTest('comaxDemo', 'Reply with exactly MODEL_OK.', {
    userId: 'ReactiveLlmModelTest', categories: 'local', logger: 'workflowLogger',
    workflow: simpleLlmCall({ whenToUse: 'model smoke test', model, instructions: () => 'Reply with exactly MODEL_OK.' }),
    expectedResult: expected(provider, canonicalModel)
  })
})

models.forEach(testModel)
