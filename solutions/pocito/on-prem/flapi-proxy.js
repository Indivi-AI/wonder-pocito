import express from 'express'

export function setupFlapiProxyRoute(app) {
  const baseUrl = process.env.FLAPI_BASE_URL?.replace(/\/$/, ''), headers = {'Content-Type': 'application/json', accept: 'application/json',
    Authorization: process.env.FLAPI_TOKEN || '', Username: process.env.FLAPI_USERNAME || ''}
  const postJson = async (path, body = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {method: 'POST', headers, body: JSON.stringify(body)})
    if (!response.ok) throw Object.assign(new Error(`FLAPI ${response.status}: ${await response.text()}`), {status: response.status})
    return response.json()
  }
  const getJson = async (path) => {
    const response = await fetch(`${baseUrl}${path}`, {method: 'GET', headers})
    if (!response.ok) throw Object.assign(new Error(`FLAPI ${response.status}: ${await response.text()}`), {status: response.status})
    return response.json()
  }
  app.get('/package/v1/quick/:packageId', async (req, res) => {
    if (!baseUrl) return res.status(503).json({error: 'FLAPI_BASE_URL is not configured'})
    try { res.json(await getJson(`/package/v1/quick/${encodeURIComponent(req.params.packageId)}`)) }
    catch (error) { res.status(error.status || 502).json({error: error.message}) }
  })
  app.all('/package/v2/:packageId', express.json(), async (req, res) => {
    if (!baseUrl) return res.status(503).json({error: 'FLAPI_BASE_URL is not configured'})
    try {
      const fn = req.method === 'GET' ? getJson : postJson
      res.json(await fn(`/package/v2/${encodeURIComponent(req.params.packageId)}`, req.body))
    } catch (error) { res.status(error.status || 502).json({error: error.message}) }
  })
  app.get('/flapi/package/:packageId', async (req, res) => {
    if (!baseUrl) return res.status(503).json({error: 'FLAPI_BASE_URL is not configured'})
    try {
      res.json(await postJson(`/package/v2/${encodeURIComponent(req.params.packageId)}`))
    } catch (error) { res.status(error.status || 502).json({error: error.message}) }
  })
  app.post(['/package/v3/:packageId', '/flapi/package/:packageId/run'], express.json(), async (req, res) => {
    if (!baseUrl) return res.status(503).json({error: 'FLAPI_BASE_URL is not configured'})
    try { res.json(await postJson(`/package/v3/${encodeURIComponent(req.params.packageId)}`, req.body)) }
    catch (error) { res.status(error.status || 502).json({error: error.message}) }
  })
  app.get(['/metadata/:packageId/queries/names', '/flapi/metadata/:packageId/queries/names'], async (req, res) => {
    if (!baseUrl) return res.status(503).json({error: 'FLAPI_BASE_URL is not configured'})
    try { res.json(await getJson(`/metadata/${encodeURIComponent(req.params.packageId)}/queries/names`)) }
    catch (error) { res.status(error.status || 502).json({error: error.message}) }
  })
}

export async function createFlapiApp() {
  const app = express()
  setupFlapiProxyRoute(app)
  app.get('/health', (_, res) => res.json({status: 'ok', service: 'flapi-proxy'}))
  return app
}
