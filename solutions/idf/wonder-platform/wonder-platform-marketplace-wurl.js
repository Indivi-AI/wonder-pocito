import { dsls } from '@jb6/core'
import '@wonder/db/db-drivers.js'

const { wonder: { DbDriverInterceptor, 'db-driver-interceptor': { dbDriverInterceptor } } } = dsls
DbDriverInterceptor('wonderPlatformMarketplace', {
  impl: dbDriverInterceptor({
    whenAndWhyToUse: 'Route wonder-platform marketplace WURLs to the single-scope FastAPI and AgentOS endpoints.',
    designConcerns: 'Only reserved marketplace roots are intercepted and API paths stay Swagger-compatible.',
    pre: async (ctx, { url, fileName, opts, marketplaceBaseUrl, marketplaceLogger }) => {
      let path = String(fileName || '').replace(/^\/+/, '')
      if (!/^(healthz$|plugins(?:\/|$)|skills(?:\/|$)|tools(?:\/|$)|agents(?:\/|$)|subagents(?:\/|$)|audit(?:\/|$)|presign(?:\/|$)|users(?:\/|$))/.test(path))
        return
      path = path.replace(/^subagents(?=\/|$)/, 'agents')
      const query = url.includes('?') ? `?${url.split('?').slice(1).join('?')}` : ''
      const runtime = /^agents\/[^/]+\/runs$/.test(path)
      const apiPath = path == 'healthz' ? '/healthz' : runtime ? `/${path}` : `/api/v1/${path}`
      const method = (opts?.method || 'GET').toUpperCase(), body = opts?.body
      const hasBody = !['GET', 'HEAD'].includes(method) && body != null
      const isForm = typeof FormData != 'undefined' && body instanceof FormData
      const isJson = hasBody && typeof body == 'object' && !isForm && !(body instanceof ArrayBuffer) && !(body instanceof Blob)
      const headers = new Headers(opts?.headers || {})
      if (isJson) headers.set('Content-Type', 'application/json')
      const baseUrl = (marketplaceBaseUrl || globalThis.MARKETPLACE_API_URL
        || globalThis.process?.env?.MARKETPLACE_API_URL || 'http://localhost:7777').replace(/\/$/, '')
      const response = await fetch(`${baseUrl}${apiPath}${query}`, {
        method,
        headers,
        ...(hasBody ? { body: isJson ? JSON.stringify(body) : body } : {})
      })
      marketplaceLogger?.info?.({ t: 'marketplaceWUrl', url, apiPath, method, status: response.status }, {}, { ctx })
      return response
    }
  })
})
