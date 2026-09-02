import express from 'express'

export function setupFlapiProxyRoute(app) {
  const baseUrl = process.env.FLAPI_BASE_URL?.replace(/\/$/, ''), headers = {'Content-Type': 'application/json', accept: 'application/json',
    Authorization: process.env.FLAPI_TOKEN || '', Username: process.env.FLAPI_USERNAME || ''}
  const postJson = async (path, body = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {method: 'POST', headers, body: JSON.stringify(body)})
    if (!response.ok) throw Object.assign(new Error(`FLAPI ${response.status}: ${await response.text()}`), {status: response.status})
    return response.json()
  }
  app.get('/flapi/package/:packageId', async (req, res) => {
    if (!baseUrl) return res.status(503).json({error: 'FLAPI_BASE_URL is not configured'})
    try {
      const id = encodeURIComponent(req.params.packageId), [quick, metadata] = await Promise.all([
        postJson(`/package/v1/quick/${id}`), postJson(`/package/v2/${id}`)])
      res.json({quick, metadata})
    } catch (error) { res.status(error.status || 502).json({error: error.message}) }
  })
  app.post('/flapi/package/:packageId/run', express.json(), async (req, res) => {
    if (!baseUrl) return res.status(503).json({error: 'FLAPI_BASE_URL is not configured'})
    try { res.json(await postJson(`/package/v3/${encodeURIComponent(req.params.packageId)}`, req.body)) }
    catch (error) { res.status(error.status || 502).json({error: error.message}) }
  })
}

export async function createFlapiApp() {
  const app = express()
  setupFlapiProxyRoute(app)
  app.get('/health', (_, res) => res.json({status: 'ok', service: 'flapi-proxy'}))
  return app
}
