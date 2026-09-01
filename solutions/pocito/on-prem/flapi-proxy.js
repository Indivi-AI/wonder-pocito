import express from 'express'

export function setupFlapiProxyRoute(app) {
  const baseUrl = process.env.FLAPI_BASE_URL?.replace(/\/$/, ''), token = process.env.FLAPI_TOKEN
  app.get('/flapi/package/:packageId', async (req, res) => {
    if (!baseUrl) return res.status(503).json({error: 'FLAPI_BASE_URL is not configured'})
    const postJson = async path => {
      const response = await fetch(`${baseUrl}${path}`, {method: 'POST', headers: {'content-type': 'application/json'},
        body: JSON.stringify(token ? {token} : {})})
      if (!response.ok) throw Object.assign(new Error(`FLAPI ${response.status}: ${await response.text()}`), {status: response.status})
      return response.json()
    }
    try {
      const id = encodeURIComponent(req.params.packageId), [quick, metadata] = await Promise.all([
        postJson(`/package/v1/quick/${id}`), postJson(`/package/v2/${id}`)])
      res.json({quick, metadata})
    } catch (error) { res.status(error.status || 502).json({error: error.message}) }
  })
}

export async function createFlapiApp() {
  const app = express()
  setupFlapiProxyRoute(app)
  app.get('/health', (_, res) => res.json({status: 'ok', service: 'flapi-proxy'}))
  return app
}
