import http from 'node:http'
import https from 'node:https'
import { createHash } from 'node:crypto'
import { Storage } from '@google-cloud/storage'
import { proxyRoomCaller } from './auth-utils.js'

const quotaBucket = new Storage().bucket('indiviai-wonder-protected')
const dailyLimit = Number(process.env.LLM_DAILY_CALLS_PER_IP || 100)

const providers = {
  'generativelanguage.googleapis.com': () => ({ 'x-goog-api-key': process.env.GEMINI_API_KEY }),
  'api.openai.com': () => ({ authorization: `Bearer ${process.env.OPENAI_API_KEY}` }),
  'api.groq.com': () => ({ authorization: `Bearer ${process.env.GROQ_KEY}` }),
  'api.anthropic.com': () => ({ 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }),
  'openrouter.ai': () => ({ authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'http-referer': 'https://wonder.indivi.ai' })
}

async function consumeDailyQuota(ip) {
  const day = new Date().toISOString().slice(0, 10), hash = createHash('sha256').update(ip).digest('base64url')
  const file = quotaBucket.file(`_system/proxy/v1/usage/${day}/ips/${hash}/llm`)
  for (let attempt = 0; attempt < 5; attempt++) {
    const [metadata] = await file.getMetadata().catch(error => error.code === 404 ? [null] : Promise.reject(error))
    const count = Number(metadata?.metadata?.count || 0)
    const quota = { day, period: 'UTC day', usedCalls: count, quotaCalls: dailyLimit,
      remainingCalls: Math.max(0, dailyLimit - count), usedPercent: Math.round(count / dailyLimit * 100) }
    if (count >= dailyLimit) return { allowed: false, ...quota }
    try {
      if (metadata) await file.setMetadata({ metadata: { count: String(count + 1) } }, {
        preconditionOpts: { ifGenerationMatch: metadata.generation }
      })
      else await file.save('', { metadata: { metadata: { count: '1' } }, preconditionOpts: { ifGenerationMatch: 0 } })
      return { allowed: true, ...quota, usedCalls: count + 1, remainingCalls: Math.max(0, dailyLimit - count - 1),
        usedPercent: Math.round((count + 1) / dailyLimit * 100) }
    } catch (error) { if (error.code !== 412) throw error }
  }
  throw new Error('quota counter contention')
}

const streamPost = (url, headers, originalBody, res) => {
  const proxy = (url.protocol === 'https:' ? https : http).request(url, { method: 'POST', headers }, upstream => {
    res.status(upstream.statusCode || 500)
    Object.entries(upstream.headers).filter(([name]) => name !== 'content-encoding' && !name.startsWith('access-control-'))
      .forEach(([name, value]) => res.setHeader(name, value))
    upstream.pipe(res)
  })
  proxy.on('error', error => res.headersSent ? res.end() : res.status(500).json({ error: error.message }))
  if (originalBody) proxy.write(typeof originalBody === 'string' ? originalBody : JSON.stringify(originalBody))
  proxy.end()
}

export function setupLlmProxyRoute(app) {
  // air-gap mode: LLM_PROXY_TARGET (an OpenAI-compatible gateway, e.g. llm-lite) replaces provider keys, GCS quota and the public-host allowlist
  const forwardTarget = process.env.LLM_PROXY_TARGET
  app.post('/llmProxy', async (req, res) => {
    try {
      const { targetUrl, originalBody, headers = {}, roomId } = req.body
      const destinationHeaders = Object.fromEntries(Object.entries(headers)
        .filter(([name]) => !['authorization', 'x-wonder-proxy-auth'].includes(name.toLowerCase())))
      const url = new URL(targetUrl)
      if (forwardTarget) return streamPost(new URL(url.pathname + url.search, forwardTarget),
        { ...destinationHeaders, 'accept-encoding': 'identity' }, originalBody, res)
      const access = await proxyRoomCaller(req, roomId)
      if (access.error) return res.status(access.status).json({ error: access.error })
      const providerHeaders = providers[url.hostname]?.()
      if (!providerHeaders) return res.status(400).json({ error: `unsupported LLM host ${url.hostname}` })
      const quota = await consumeDailyQuota(req.ip)
      if (!quota.allowed) return res.status(429).json({ error: 'daily LLM quota exceeded', quota })
      streamPost(url, { ...destinationHeaders, ...providerHeaders, 'accept-encoding': 'identity' }, originalBody, res)
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })
}
