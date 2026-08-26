import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRequestBody } from './reactive-llm.js'

const request = model => buildRequestBody(model, [{role: 'user', content: 'hi'}], 100, 0, '', '', 'openai', 0).body

test('OpenAI GPT-5 uses supported options', () => {
  const body = request('gpt-5-mini')
  assert.equal(body.temperature, undefined)
  assert.equal(body.reasoning_effort, 'minimal')
})
test('other OpenAI models preserve temperature', () => assert.equal(request('gpt-4o-mini').temperature, 0))
