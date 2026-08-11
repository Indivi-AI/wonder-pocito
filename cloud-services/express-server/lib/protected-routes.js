import { Readable } from 'node:stream'
import { GoogleAuth } from 'google-auth-library'
import { setupLlmProxyRoute } from './llm-proxy.js'
import { setupSignedUrlRoute } from './signed-url.js'

const auth = new GoogleAuth(), clients = new Map()

export function setupProtectedRoutes(app) {
  const target = process.env.PROTECTED_LAMBDA_URL
  if (!target) {
    setupSignedUrlRoute(app)
    return setupLlmProxyRoute(app)
  }
  const forward = async (req, res) => {
    try {
      const client = clients.get(target) || await auth.getIdTokenClient(target).then(client => (clients.set(target, client), client))
      const { host, authorization, ...incoming } = req.headers
      const headers = { ...incoming, ...await client.getRequestHeaders(), ...(authorization && { 'x-user-authorization': authorization }) }
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body)
      const upstream = await fetch(`${target.replace(/\/$/, '')}${req.originalUrl}`, { method: req.method, headers, body })
      res.status(upstream.status)
      upstream.headers.forEach((value, name) => res.setHeader(name, value))
      upstream.body ? Readable.fromWeb(upstream.body).pipe(res) : res.end()
    } catch (error) { res.status(502).json({ error: error.message }) }
  }
  app.all('/signed-url/*', forward)
  app.all('/signed-urls/*', forward)
  app.all('/llmProxy', forward)
}
