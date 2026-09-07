import assert from 'node:assert/strict'
import { test } from 'node:test'
import http from 'node:http'
import { once } from 'node:events'
import { PassThrough, Readable } from 'node:stream'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { miniMaxThinking, miniMaxCompletions, miniMaxEvents, startOmpGateway } from './omp-minimax.mjs'

const choice = (content, index = 0, finish_reason = null) => ({index, delta: {content}, finish_reason})
const event = choices => `data: ${JSON.stringify({id: 'completion', object: 'chat.completion.chunk', choices})}\n\n`
const split = chunks => {
  const parse = miniMaxThinking(), parts = [...chunks.map(text => parse(text)), parse('', true)]
  return Object.fromEntries(['content', 'reasoning_content'].map(key => [key, parts.map(part => part[key]).join('')]))
}

test('reasoning tags split at every boundary, including every character and Unicode', () => {
  const text = 'Before <mm:think>חשיבה 🧠</mm:think>after', expected = {content: 'Before after', reasoning_content: 'חשיבה 🧠'}
  for (let at = 0; at <= text.length; at++) assert.deepEqual(split([text.slice(0, at), text.slice(at)]), expected)
  assert.deepEqual(split([...text]), expected)
})

test('multiple and empty reasoning blocks', () => {
  assert.deepEqual(split(['<mm:think></mm:think>a<mm:think>r1</mm:think>b<mm:think>r2</mm:think>']), {
    content: 'ab', reasoning_content: 'r1r2'
  })
})

test('truncated reasoning stays reasoning, incomplete visible opening stays visible', () => {
  assert.deepEqual(split(['<mm:think>reason</mm:']), {content: '', reasoning_content: 'reason</mm:'})
  assert.deepEqual(split(['answer <mm:']), {content: 'answer <mm:', reasoning_content: ''})
})

test('non-streaming without a preexisting reasoning field and with native reasoning', () => {
  for (const native of [undefined, 'native ']) {
    const message = {content: '<mm:think>reason</mm:think>answer', ...(native && {reasoning_content: native})}
    miniMaxCompletions()({choices: [{index: 0, message}]})
    assert.deepEqual(message, {content: 'answer', reasoning_content: (native || '') + 'reason'})
  }
})

test('streaming choices are all parsed and keep independent state', () => {
  const parse = miniMaxCompletions()
  const first = parse({choices: [choice('<mm:think>r0', 0), choice('a1<mm:', 1)]})
  assert.equal(first.choices[0].delta.reasoning_content, 'r0')
  assert.equal(first.choices[1].delta.content, 'a1')
  const second = parse({choices: [choice('think>r1</mm:think>b1', 1), choice('</mm:think>a0', 0)]})
  assert.deepEqual(second.choices.map(c => c.delta), [{content: 'b1', reasoning_content: 'r1'}, {content: 'a0'}])
})

test('concurrent requests do not share parsing state', () => {
  const first = miniMaxCompletions(), second = miniMaxCompletions()
  first({choices: [choice('<mm:think>reason')]})
  assert.equal(second({choices: [choice('visible')]}).choices[0].delta.content, 'visible')
  assert.equal(first({choices: [choice('more reasoning')]}).choices[0].delta.reasoning_content, 'more reasoning')
})

test('usage, tool calls, plain text completions and other response shapes pass through', () => {
  const responses = [{choices: [], usage: {total_tokens: 10}}, {data: []}, {error: {message: 'upstream error'}},
    {choices: [{text: 'ordinary completion'}]}, {choices: [choice(null)]},
    {choices: [{index: 0, delta: {tool_calls: [{index: 0, function: {arguments: '{"literal":"<mm:think>"}'}}]}}]}]
  for (const response of responses) {
    const before = structuredClone(response)
    assert.deepEqual(miniMaxCompletions()(response), before)
  }
})

test('finish_reason flushes held text to its current channel without changing finish metadata', () => {
  const parse = miniMaxCompletions()
  parse({choices: [choice('<mm:think>reason</mm:')]})
  const tail = parse({choices: [choice(null, 0, 'length')]})
  assert.deepEqual(tail.choices[0], {index: 0, delta: {content: null, reasoning_content: '</mm:'}, finish_reason: 'length'})
})

test('SSE preserves event metadata, handles multiline JSON, CRLF and UTF-8 byte boundaries', async () => {
  const input = ': heartbeat\r\n\r\nid: 7\r\nevent: message\r\ndata: {"choices":\r\n' +
    'data: [{"index":0,"delta":{"content":"<mm:think>🧠</mm:think>שלום"}}]}\r\n\r\ndata: [DONE]\r\n\r\n'
  const chunks = [...Buffer.from(input)].map(byte => Buffer.from([byte]))
  const output = (await Array.fromAsync(miniMaxEvents(Readable.from(chunks)))).join('')
  assert.match(output, /: heartbeat\n\n/)
  assert.match(output, /id: 7\nevent: message\n/)
  assert.match(output, /"content":"שלום","reasoning_content":"🧠"/)
  assert.ok(output.endsWith('data: [DONE]\n\n'))
})

test('SSE EOF and DONE flush every choice without inventing a successful finish', async () => {
  for (const ending of ['', 'data: [DONE]\n\n', 'data: [DONE]']) {
    const input = event([choice('a<mm:', 0)]) + event([choice('<mm:think>r</mm:', 1)]) + ending
    const output = (await Array.fromAsync(miniMaxEvents(Readable.from([input])))).join('')
    const tail = output.split('\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6))).at(-1)
    assert.deepEqual(tail.choices, [choice('<mm:', 0), {index: 1, delta: {reasoning_content: '</mm:'}, finish_reason: null}])
  }
})

test('reasoning streams before the answer or response has finished', async () => {
  const body = new PassThrough(), stream = miniMaxEvents(body)
  body.write(event([choice('<mm:think>live reasoning')]))
  assert.match((await stream.next()).value, /"reasoning_content":"live reasoning"/)
  body.end(event([choice('</mm:think>answer', 0, 'stop')]) + 'data: [DONE]\n\n')
  assert.match((await Array.fromAsync(stream)).join(''), /"content":"answer"/)
})

test('gateway forwards discovery/auth/body/path and transforms only successful chat responses', async t => {
  const received = []
  const upstream = http.createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    received.push({path: req.url, authorization: req.headers.authorization, body})
    if (req.url.endsWith('/models')) return res.setHeader('content-type', 'application/json').end('{"data":[{"id":"minimax"}]}')
    if (body === 'denied') return res.writeHead(403, {'content-type': 'text/plain'}).end('upstream denied')
    if (body === 'stream') {
      res.writeHead(200, {'content-type': 'text/event-stream'})
      res.write(event([choice('<mm:think>reason')]))
      res.end(event([choice('</mm:think>answer', 0, 'stop')]) + 'data: [DONE]\n\n')
    } else {
      const response = JSON.stringify({choices: [{index: 0, message: {content: '<mm:think>reason</mm:think>answer'}}]})
      res.writeHead(200, {'content-type': 'application/json', 'content-length': Buffer.byteLength(response)}).end(response)
    }
  }).listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  const {server, baseUrl} = await startOmpGateway(`http://127.0.0.1:${upstream.address().port}/gateway/v1`)
  t.after(() => { for (const listener of [server, upstream]) { listener.closeAllConnections(); listener.close() } })
  assert.deepEqual(await (await fetch(`${baseUrl}/models`)).json(), {data: [{id: 'minimax'}]})
  const post = (body, path = '/chat/completions') => fetch(baseUrl + path, {method: 'POST', headers: {authorization: 'Bearer test-key'}, body})
  assert.deepEqual((await (await post('json')).json()).choices[0].message, {content: 'answer', reasoning_content: 'reason'})
  const stream = await (await post('stream')).text()
  assert.match(stream, /"reasoning_content":"reason"/)
  assert.doesNotMatch(stream, /mm:think/)
  assert.equal((await post('denied')).status, 403)
  assert.match(await (await post('json', '/completions')).text(), /mm:think/)
  assert.deepEqual(received[1], {path: '/gateway/v1/chat/completions', authorization: 'Bearer test-key', body: 'json'})
})

test('OMP renders adapted MiniMax content as a thinking block', {skip: !process.env.POCITO_TEST_OMP_BIN}, async t => {
  const upstream = http.createServer(async (req, res) => {
    for await (const chunk of req) void chunk
    if (req.url.endsWith('/models'))
      return res.setHeader('content-type', 'application/json').end(JSON.stringify({data: [{id: 'minimax-test', object: 'model'}]}))
    if (!req.url.endsWith('/chat/completions')) return res.writeHead(404).end()
    res.writeHead(200, {'content-type': 'text/event-stream'})
    for (const content of ['<mm:', 'think>REASONING_MARKER', '</mm:thi', 'nk>ANSWER_MARKER'])
      res.write(event([choice(content)]))
    res.end(event([choice(null, 0, 'stop')]) + 'data: [DONE]\n\n')
  }).listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  const {server, baseUrl} = await startOmpGateway(`http://127.0.0.1:${upstream.address().port}/v1`)
  t.after(() => { for (const listener of [server, upstream]) { listener.closeAllConnections(); listener.close() } })
  const directory = await mkdtemp(`${tmpdir()}/pocito-omp-test-`)
  const run = promisify(execFile)(process.env.POCITO_TEST_OMP_BIN,
    ['--model', 'litellm/minimax-test', '--mode', 'json', '--print', '--no-session', '--no-tools', '--no-lsp', '--no-pty',
      '--no-extensions', '--no-skills', '--no-rules', '--no-title', '--system-prompt', 'Answer the prompt.', 'Hello'],
    {cwd: directory, timeout: 60000, killSignal: 'SIGKILL', maxBuffer: 2 ** 20, env: {PATH: process.env.PATH, PI_CODING_AGENT_DIR: directory,
      LITELLM_BASE_URL: baseUrl, LITELLM_API_KEY: 'unused'}})
  run.child.stdin.end()
  const {stdout} = await run
  const messages = stdout.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line))
    .filter(event => event.type === 'message_end' && event.message?.role === 'assistant').map(event => event.message)
  assert.ok(messages.length, stdout)
  assert.ok(messages.some(message => message.content.some(block => block.type === 'thinking' && block.thinking === 'REASONING_MARKER')),
    JSON.stringify(messages))
  assert.ok(messages.some(message => message.content.some(block => block.type === 'text' && block.text === 'ANSWER_MARKER')))
  assert.doesNotMatch(JSON.stringify(messages), /mm:think/)
})
