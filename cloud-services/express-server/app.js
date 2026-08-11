import express from 'express'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { coreUtils } from '@jb6/core'
import '@jb6/core/misc/import-map-services.js'
import '@jb6/mcp'
import '../../.jb6/mcp.js'
import '@jb6/server-utils/serve-mcp.js'
import { serverUtils } from '@jb6/server-utils'
import { setupAuthRoutes } from './lib/auth-routes.js'
import { setupGCSProxyRoute } from './lib/gcs-proxy.js'
import { setupProtectedRoutes } from './lib/protected-routes.js'
import { setupRoomLambdaAndApplet } from './lib/room-lambda-and-applet.js'
import { roomPolicy, signWonderToken } from './lib/auth-utils.js'
import { readDef, serveAppletShell } from './lib/room-lambda-and-applet.js'
import { useCors } from './lib/use-cors.js'

async function setupLiveRepo(app) {
  const root = await coreUtils.calcRepoRoot(), { importMap, staticMappings } = await coreUtils.getStaticServeConfig(root)
  process.env.HOST_NODE_MODULES_BASE = root
  app.get('/mint-wonder-token', (req, res) => res.send(signWonderToken({ phone: req.query.email || 'devMachine' })))
  app.get('/room/:roomId/applet/:name', async (req, res, next) => {
    try {
      const { roomId, name } = req.params, applet = await readDef(roomId, `applets/${name}.json`)
      if (!applet) return next()
      const roomUrl = `${await roomPolicy(roomId) ? 'signedRoom' : 'room'}://${roomId}`
      await serveAppletShell({ ...applet, roomUrl, og: [await readDef(roomId, 'admin/branding.json'), applet.og] }, res, importMap.imports)
    } catch { next() }
  })
  for (const { urlPath, diskPath } of staticMappings) {
    app.use(urlPath, async (req, res, next) => {
      if (!req.path.endsWith('.html')) return next()
      const html = await fs.readFile(path.join(diskPath, req.path), 'utf8').catch(() => null)
      html ? res.type('html').send(html.replaceAll('JB_IMPORT_MAP', JSON.stringify(importMap))) : next()
    })
    app.use(urlPath, express.static(diskPath))
  }
}

export async function createApp(mode = process.env.WONDER_SERVICE || 'public') {
  const app = express().set('trust proxy', 1)
  useCors(app)
  app.use(express.json({ limit: '10mb' }))
  if (mode === 'protected') setupProtectedRoutes(app)
  else {
    setupAuthRoutes(app)
    setupProtectedRoutes(app)
    if (mode === 'local') {
      await setupLiveRepo(app)
      await serverUtils.serveMcpViaCli(app, { express })
    }
    setupRoomLambdaAndApplet(app)
    setupGCSProxyRoute(app)
  }
  app.get('/health', (_, res) => res.json({ status: 'ok', mode }))
  return app
}
