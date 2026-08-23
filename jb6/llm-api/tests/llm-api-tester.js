import { coreUtils, dsls, ns, jb } from '@jb6/core'
import '@jb6/llm-api'
import '@jb6/testing'
const {
  test: { Test, test: { dataTest} },
  'llm-api': { model: { llama_33_70b_versatile } },
} = dsls
const { llm } = ns

Test('llmTest', {
  params: [
    {id: 'prompt', type: 'prompt<llm-api>', dynamic: true},
    {id: 'expectedResult', type: 'boolean', dynamic: true},
    {id: 'llmModel', type: 'model<llm-api>', defaultValue: llama_33_70b_versatile()},
    {id: 'maxTokens', as: 'number', defaultValue: 3500},
    {id: 'useLocalStorageCache', as: 'boolean'}
  ],
  impl: dataTest({
    calculate: llm.completions('%$prompt()%', '%$llmModel%', {
      maxTokens: '%$maxTokens%',
      useLocalStorageCache: '%$useLocalStorageCache%'
    }),
    expectedResult: '%$expectedResult()%',
    timeout: 12000,
    includeTestRes: true
  })
})

Test('llmCardTest', {
  params: [
    {id: 'prompt', type: 'prompt<llm-api>', dynamic: true},
    {id: 'expectedResult', type: 'boolean', dynamic: true},
    {id: 'llmModel', type: 'model<llm-api>', defaultValue: llama_33_70b_versatile()},
    {id: 'maxTokens', as: 'number', defaultValue: 3500},
    {id: 'useLocalStorageCache', as: 'boolean'}
  ],
  impl: dataTest({
    calculate: llm.completions('%$prompt()%', '%$llmModel%', {
      maxTokens: '%$maxTokens%',
      useLocalStorageCache: '%$useLocalStorageCache%'
    }),
    expectedResult: '%$expectedResult()%',
    timeout: 12000,
    includeTestRes: true
  })
})