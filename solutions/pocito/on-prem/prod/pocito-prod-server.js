import express from 'express'
import { pathToFileURL } from 'node:url'
import { setupPocitoGateway } from '../pocito-gateway.js'
import { setupWfetch } from '../../../../cloud-services/express-server/lib/wfetch.js'
import { setupRoomLambdaAndApplet } from '../../../../cloud-services/express-server/lib/room-lambda-and-applet.js'
import { setupLlmProxyRoute } from '../../../../cloud-services/express-server/lib/llm-proxy-onprem.js'

export function createPocitoProdApp() {
  for (const name of ['MINIO_ENDPOINT', 'WONDER_CDN_URL', 'MARKETPLACE_API_URL', 'AGNO_API_URL', 'LITELLM_HOST'])
    if (!process.env[name]) throw new Error(`${name} is required`)
  Object.assign(process.env, {WONDER_AUTH_MODE: 'none', STORAGE_PROVIDER: 'minio'})
  const app = express().set('trust proxy', 1)
  setupPocitoGateway(app)
  app.use(express.json({limit: '100mb'}))
  setupWfetch(app)
  setupRoomLambdaAndApplet(app)
  setupLlmProxyRoute(app)
  app.get('/health', (_, res) => res.json({status: 'ok', mode: 'pocito-prod'}))
  return app
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = createPocitoProdApp(), server = app.listen(Number(process.env.PORT || 8080), '0.0.0.0')
  const stop = () => {
    server.close(() => process.exit(0))
    setTimeout(() => server.closeAllConnections(), Number(process.env.SHUTDOWN_TIMEOUT_MS || 25000)).unref()
  }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
}
