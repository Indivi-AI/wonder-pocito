import http from 'node:http'
import https from 'node:https'

const forwardHeaders = headers => Object.fromEntries(Object.entries(headers).filter(([name]) =>
  !['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade',
    ...(headers.connection || '').toLowerCase().split(/\s*,\s*/)].includes(name)))

export function setupPocitoGateway(app) {
  const routes = [
    ['MARKETPLACE_API_URL', 'marketplace', process.env.MARKETPLACE_API_URL || `http://localhost:${process.env.MARKETPLACE_PORT || 7777}`],
    ['AGNO_API_URL', 'agno', process.env.AGNO_API_URL || `http://localhost:${process.env.AGENT_OS_PORT || 7778}`]
  ]
  app.locals.appletClientEnv = {LLM_PROXY_URL: '/llmProxy'}
  for (const [envName, service, base] of routes) {
    const prefix = `/_pocito/${service}`, target = new URL(base), basePath = target.pathname.replace(/\/$/, '')
    app.locals.appletClientEnv[envName] = prefix
    app.use(prefix, (req, res) => {
      const path = basePath + req.url
      const proxy = (target.protocol === 'https:' ? https : http).request(target, {
        path, method: req.method, headers: {...forwardHeaders(req.headers), host: target.host}
      }, upstream => {
        const headers = forwardHeaders(upstream.headers)
        if (headers.location) {
          const redirect = new URL(headers.location, new URL(path, target))
          if (redirect.origin === target.origin && (redirect.pathname === basePath || redirect.pathname.startsWith(`${basePath}/`)))
            headers.location = prefix + redirect.pathname.slice(basePath.length) + redirect.search + redirect.hash
        }
        res.writeHead(upstream.statusCode, headers)
        upstream.on('error', () => res.destroy()).pipe(res)
      })
      proxy.on('error', () => res.headersSent ? res.destroy() : res.sendStatus(502))
      res.on('close', () => proxy.destroy())
      req.pipe(proxy)
    })
  }
}
