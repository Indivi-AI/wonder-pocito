import express from 'express'
import { promises as fs } from 'node:fs'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import mime from 'mime-types'
import { coreUtils } from '@jb6/core'
import '@jb6/core/misc/import-map-services.js'
import { setupAuthRoutes } from './lib/auth-routes.js'
import { setupGCSProxyRoute } from './lib/gcs-proxy.js'
import { setupSignedUrlForwarder } from './lib/signed-url-forwarder.js'
import { setupRoomLambdaAndApplet } from './lib/room-lambda-and-applet.js'
import { roomPolicy, signWonderToken } from './lib/auth-utils.js'
import { readDef, serveAppletPage } from './lib/room-lambda-and-applet.js'
import { useCors } from './lib/use-cors.js'

function setupLocalFiles(app, root) {
  const filesRoot = path.join(root, 'files'), filePath = req => path.join(filesRoot, req.params[0])
  const prepare = async (name, res) => {
    const data = await fs.readFile(name), { mtime } = await fs.stat(name)
    res.set({ 'Content-Type': mime.lookup(name) || 'application/octet-stream', 'Content-Length': data.length,
      ETag: crypto.createHash('md5').update(data).digest('hex'), 'Last-Modified': mtime.toUTCString() })
    return data
  }
  app.get('/files/*', async (req, res) => {
    try {
      const name = filePath(req), stat = await fs.stat(name), range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/)
      if (range) {
        const suffix = !range[1], start = suffix ? Math.max(0, stat.size - +range[2]) : +range[1]
        const end = suffix || !range[2] ? stat.size - 1 : Math.min(+range[2], stat.size - 1)
        res.status(206).set({ 'Content-Type': mime.lookup(name) || 'application/octet-stream', 'Content-Length': end-start+1,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Last-Modified': stat.mtime.toUTCString() })
        return createReadStream(name, { start, end }).pipe(res)
      }
      const data = await prepare(name, res), type = res.get('Content-Type')
      res.send(type.startsWith('text/') || type === 'application/json' ? data.toString('utf8') : data)
    } catch (error) { res.status(error.code === 'ENOENT' ? 404 : 500).json({ error: error.code === 'ENOENT' ? 'File not found' : String(error) }) }
  })
  app.head('/files/*', async (req, res) => {
    try { await prepare(filePath(req), res); res.end() }
    catch (error) { res.status(error.code === 'ENOENT' ? 404 : 500).end() }
  })
  app.put('/files/*', async (req, res) => {
    try {
      const name = filePath(req)
      await fs.mkdir(path.dirname(name), { recursive: true })
      const body = req.is('application/json') ? Buffer.from(JSON.stringify(req.body, null, 2))
        : Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body)
      await fs.writeFile(name, body)
      const etag = crypto.createHash('md5').update(body).digest('hex'), { mtime } = await fs.stat(name)
      res.set({ ETag: etag, 'Last-Modified': mtime.toUTCString(), 'Content-MD5': Buffer.from(etag, 'hex').toString('base64') })
      res.json({ message: 'File updated', etag })
    } catch (error) { res.status(500).json({ error: String(error) }) }
  })
}

async function setupLiveRepo(app) {
  const root = await coreUtils.calcRepoRoot(), { importMap, staticMappings } = await coreUtils.getStaticServeConfig(root)
  process.env.HOST_NODE_MODULES_BASE = root
  app.get('/wonder.html', (_, res) => res.type('html').send(`<script type="importmap">${JSON.stringify(importMap)}</script>
<script type="module">import { handleAuth } from '@wonder/db/oauth2.js'; await handleAuth({})</script>`))
  app.get('/studio/tests.html', async (_, res) => {
    const html = await fs.readFile(path.join(root, 'wonder/studio/tests.html'), 'utf8')
    res.type('html').send(html.replace('JB_IMPORT_MAP', JSON.stringify(importMap)))
  })
  app.use('/studio', express.static(path.join(root, 'wonder/studio')))
  app.use('/tests', express.static(path.join(root, 'tests')))
  app.get('/mint-wonder-token', (req, res) => res.send(signWonderToken({ phone: req.query.email || 'devMachine' })))
  app.get('/room/:roomId/applet/:name', async (req, res, next) => {
    try {
      const { roomId, name } = req.params, applet = await readDef(roomId, `applets/${name}.json`)
      if (!applet) return next()
      await serveAppletPage({ ...applet,
        noAuth: process.env.WONDER_AUTH_MODE === 'none' && applet.roomWUrl?.startsWith('room://'),
        og: [await readDef(roomId, 'admin/branding.json'), applet.og] }, res, importMap.imports)
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
  if (mode === 'local') process.env.WONDER_TOKEN ||= crypto.randomBytes(32).toString('hex')
  const app = express().set('trust proxy', 1)
  app.use((_, res, next) => (res.set({'X-Wonder-Service': mode,
    ...(process.env.K_REVISION && {'X-Wonder-Revision': process.env.K_REVISION})}), next()))
  useCors(app, mode === 'local')
  app.use(express.json({ limit: mode === 'local' ? '50mb' : '10mb' }))
  if (mode === 'local') app.use(express.raw({ type: req => !/^application\/json/i.test(req.headers['content-type'] || ''), limit: '50mb' }))
  mode === 'local' && app.get('/oauth2redirect', (_, res) => res.type('html').send(`<script>
const url = new URL(localStorage.getItem('post_auth_redirect_url') || '/', location.origin)
for (const [key, value] of new URLSearchParams(location.search)) url.searchParams.set(key, value)
location.replace(url)
</script>`))
  if (mode === 'signed') setupSignedUrlForwarder(app)
  else {
    setupAuthRoutes(app)
    setupSignedUrlForwarder(app)
    if (mode === 'local') {
      await import('../../.jb6/mcp.js')
      await import('@jb6/server-utils/serve-mcp.js')
      await import('@jb6/server-utils/serve-edit-source.js')
      const { serverUtils } = await import('@jb6/server-utils')
      await setupLiveRepo(app)
      setupLocalFiles(app, await coreUtils.calcRepoRoot())
      serverUtils.serveCli(app)
      serverUtils.serveCliStream(app)
      serverUtils.serveGotoSource(app)
      serverUtils.serveEditSource(app, { express })
      await serverUtils.serveMcpViaCli(app, { express })
    }
    setupRoomLambdaAndApplet(app)
    setupGCSProxyRoute(app)
  }
  app.get('/health', (_, res) => res.json({ status: 'ok', mode }))
  return app
}
