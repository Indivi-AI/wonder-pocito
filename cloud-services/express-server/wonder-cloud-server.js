// Wonder cloud only. DO NOT add localhost, liveRepo, on-prem, or Pocito logic here.
import 'dotenv/config'
import express from 'express'
import { pathToFileURL } from 'node:url'
import { useCors } from './lib/use-cors.js'
import { setupAuthRoutes } from './lib/auth-routes.js'
import { setupSignedUrlForwarder } from './lib/signed-url-forwarder.js'
import { setupWfetch } from './lib/wfetch.js'
import { setupRoomLambdaAndApplet } from './lib/room-lambda-and-applet.js'
import { setupGCSProxyRoute } from './lib/gcs-proxy.js'
import { setupLlmProxyRoute } from './lib/llm-proxy.js'

const oauthRedirect = (_, res) => res.type('html').send(`<script>
const url = new URL(localStorage.getItem('post_auth_redirect_url') || '/', location.origin)
for (const [key, value] of new URLSearchParams(location.search)) url.searchParams.set(key, value)
location.replace(url)
</script>`)

export function createApp(mode = process.env.WONDER_SERVICE || 'public') {
  const noAuth = process.env.WONDER_AUTH_MODE === 'none'
  const app = express().set('trust proxy', 1)
  app.use((_, res, next) => (res.set({'X-Wonder-Service': mode,
    ...(process.env.K_REVISION && {'X-Wonder-Revision': process.env.K_REVISION})}), next()))
  useCors(app, false)
  app.use(express.json({limit: '10mb'}))
  if (!noAuth && mode !== 'signed') app.get('/', oauthRedirect)
  if (mode === 'signed') {
    if (!noAuth) setupSignedUrlForwarder(app)
  } else {
    if (!noAuth) {
      setupAuthRoutes(app)
      setupSignedUrlForwarder(app)
    }
    setupWfetch(app)
    setupRoomLambdaAndApplet(app)
    if (!noAuth) setupGCSProxyRoute(app)
    setupLlmProxyRoute(app)
  }
  app.get('/health', (_, res) => res.json({status: 'ok', mode}))
  return app
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  createApp().listen(Number(process.env.PORT || 8080), '0.0.0.0')
