import http from 'node:http'
import https from 'node:https'

const streamUpstream = (url, headers, body, res, method = 'POST') => {
  const proxy = (url.protocol === 'https:' ? https : http).request(url, { method, headers }, upstream => {
    res.status(upstream.statusCode || 500)
    Object.entries(upstream.headers).filter(([name]) => name !== 'content-encoding' && !name.startsWith('access-control-'))
      .forEach(([name, value]) => res.setHeader(name, value))
    upstream.pipe(res)
  })
  proxy.on('error', error => res.headersSent ? res.end() : res.status(500).json({ error: error.message }))
  if (body) proxy.write(typeof body === 'string' ? body : JSON.stringify(body))
  proxy.end()
}

export function setupLlmProxyRoute(app) {
  const litellmHost = process.env.LITELLM_HOST
  if (!litellmHost) throw new Error('LITELLM_HOST is required for on-prem LLM proxy')

  app.get('/llmProxy/models', (req, res) =>
    streamUpstream(new URL('/v1/models', litellmHost), { 'accept-encoding': 'identity' }, null, res, 'GET'))

  app.post('/llmProxy', (req, res) => {
    try {
      const { targetUrl, originalBody, headers = {} } = req.body
      const destinationHeaders = Object.fromEntries(Object.entries(headers)
        .filter(([name]) => !['authorization', 'x-wonder-proxy-auth'].includes(name.toLowerCase())))
      const url = new URL(targetUrl)
      return streamUpstream(new URL(url.pathname + url.search, litellmHost),
        { ...destinationHeaders, 'accept-encoding': 'identity' }, originalBody, res)
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })
}
