import http from 'node:http'
import https from 'node:https'
import { once } from 'node:events'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'

export function miniMaxThinking() {
  let held = '', thinking = false
  return (text = '', final = false) => {
    const parts = {content: '', reasoning_content: ''}
    text = held + text
    held = ''
    while (text) {
      const tag = thinking ? '</mm:think>' : '<mm:think>', at = text.indexOf(tag)
      let cut = at < 0 ? text.length : at
      if (at < 0 && !final)
        for (let n = Math.min(text.length, tag.length - 1); n > 0; n--)
          if (text.endsWith(tag.slice(0, n))) { cut -= n; break }
      parts[thinking ? 'reasoning_content' : 'content'] += text.slice(0, cut)
      if (at < 0) { held = text.slice(cut); break }
      text = text.slice(at + tag.length)
      thinking = !thinking
    }
    return parts
  }
}

export function miniMaxCompletions() {
  const parsers = new Map()
  return (response, final = false) => {
    for (const choice of response.choices || []) {
      const message = choice.delta || choice.message
      if (!message || (message.content != null && typeof message.content !== 'string')) continue
      if (!parsers.has(choice.index)) parsers.set(choice.index, miniMaxThinking())
      const parts = parsers.get(choice.index)(message.content || '', Boolean(final || choice.message || choice.finish_reason))
      if (typeof message.content === 'string' || parts.content) message.content = parts.content
      if (parts.reasoning_content) message.reasoning_content = (message.reasoning_content || '') + parts.reasoning_content
    }
    return response
  }
}

export async function* miniMaxEvents(body) {
  const parse = miniMaxCompletions(), indexes = new Set()
  let lines = [], last
  function* encode() {
    const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
    if (data === '[DONE]') yield flush()
    if (!data || data === '[DONE]') { yield lines.join('\n') + '\n\n'; return }
    const response = parse(JSON.parse(data))
    for (const choice of response.choices || []) if (choice.delta) indexes.add(choice.index)
    if (response.choices?.some(choice => choice.delta)) last = response
    yield [...lines.filter(line => !line.startsWith('data:')), `data: ${JSON.stringify(response)}`].join('\n') + '\n\n'
  }
  const flush = () => {
    if (!last) return ''
    const tail = parse({...last, usage: undefined, choices: [...indexes].map(index => ({index, delta: {}, finish_reason: null}))}, true)
    tail.choices = tail.choices.filter(choice => choice.delta.content || choice.delta.reasoning_content)
    last = undefined
    return tail.choices.length ? `data: ${JSON.stringify(tail)}\n\n` : ''
  }
  for await (const line of createInterface({input: body, crlfDelay: Infinity})) {
    if (line) lines.push(line)
    else { yield* encode(); lines = [] }
  }
  if (lines.length) yield* encode()
  yield flush()
}

export async function startOmpGateway(baseUrl) {
  const target = new URL(baseUrl)
  const server = http.createServer((req, res) => {
    const path = req.url.replace(/^\/v1(?=\/|\?|$)/, '')
    const headers = {...req.headers, host: target.host, 'accept-encoding': 'identity'}
    const proxy = (target.protocol === 'https:' ? https : http).request(target, {
      path: target.pathname.replace(/\/$/, '') + path, method: req.method, headers
    }, upstream => {
      const headers = {...upstream.headers}, chat = req.method === 'POST' && path.split('?')[0] === '/chat/completions'
      delete headers['content-length']
      res.writeHead(upstream.statusCode, headers)
      const type = headers['content-type'] || ''
      const body = chat && upstream.statusCode === 200 && type.includes('text/event-stream') ? Readable.from(miniMaxEvents(upstream))
        : chat && upstream.statusCode === 200 && type.includes('application/json') ? Readable.from((async function* () {
          const chunks = []
          for await (const chunk of upstream) chunks.push(chunk)
          yield JSON.stringify(miniMaxCompletions()(JSON.parse(Buffer.concat(chunks).toString())))
        })()) : upstream
      upstream.on('error', () => res.destroy())
      body.on('error', () => res.destroy()).pipe(res)
    })
    proxy.on('error', () => res.headersSent ? res.destroy() : res.writeHead(502).end())
    res.on('close', () => proxy.destroy())
    req.pipe(proxy)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return {server, baseUrl: `http://127.0.0.1:${server.address().port}/v1`}
}
