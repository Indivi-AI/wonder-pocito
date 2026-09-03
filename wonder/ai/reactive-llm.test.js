import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRequestBody, getProviderConfig } from './reactive-llm.js'

const request = model => buildRequestBody(model, [{role: 'user', content: 'hi'}], 100, 0, '', '', 'openai', 0).body

test('OpenAI GPT-5 uses supported options', () => {
  const body = request('gpt-5-mini')
  assert.equal(body.temperature, undefined)
  assert.equal(body.reasoning_effort, 'minimal')
})
test('other OpenAI models preserve temperature', () => assert.equal(request('gpt-4o-mini').temperature, 0))
test('proxy model alias stays raw', () => assert.deepEqual(getProviderConfig('minimax-skynet', true), {
  provider: 'openai', model: 'minimax-skynet', url: 'https://api.openai.com/v1/chat/completions'
}))
