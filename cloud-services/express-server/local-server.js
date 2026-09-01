import dotenv from 'dotenv'
import express from 'express'
import { promises as fs, createReadStream } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import crypto from 'node:crypto'
import mime from 'mime-types'
import { jb, coreUtils } from '@jb6/core'
import '@jb6/core/misc/import-map-services.js'
import { useCors } from './lib/use-cors.js'
import { setupWfetch } from './lib/wfetch.js'
import { serveAppletPage } from './lib/room-lambda-and-applet.js'
import { setupLiveRepoRoomApplet, setupLiveRepoDevApplet } from './lib/room-lambda-and-applet-live-repo.js'

const dir = path.dirname(fileURLToPath(import.meta.url))
if (process.env.ENV_PATH) dotenv.config({ path: process.env.ENV_PATH })
jb.coreRegistry.repoRoot = path.resolve(dir, '../..')
export async function createLocalApp({ llmProxyMode = process.env.LLM_PROXY_MODE || 'cloud' } = {}) {
const root = await coreUtils.calcRepoRoot(), { importMap, staticMappings } = await coreUtils.getStaticServeConfig(root)
process.env.HOST_NODE_MODULES_BASE = root

const app = express().set('trust proxy', 1), filesRoot = path.join(root, 'files')
const filePath = req => path.join(filesRoot, req.params[0])
const prepareFile = async (name, res) => {
  const data = await fs.readFile(name), {mtime} = await fs.stat(name)
  res.set({'Content-Type': mime.lookup(name) || 'application/octet-stream', 'Content-Length': data.length,
    ETag: crypto.createHash('md5').update(data).digest('hex'), 'Last-Modified': mtime.toUTCString()})
  return data
}

useCors(app, true)
app.use(express.json({limit: '50mb'}))
app.use(express.raw({type: req => !/^application\/json/i.test(req.headers['content-type'] || ''), limit: '50mb'}))
app.use((_, res, next) => (res.set({'X-Wonder-Service': 'local'}), next()))
app.get('/files/*', async (req, res) => {
  try {
    const name = filePath(req), stat = await fs.stat(name), range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/)
    if (range) {
      const suffix = !range[1], start = suffix ? Math.max(0, stat.size - +range[2]) : +range[1]
      const end = suffix || !range[2] ? stat.size - 1 : Math.min(+range[2], stat.size - 1)
      res.status(206).set({'Content-Type': mime.lookup(name) || 'application/octet-stream', 'Content-Length': end-start+1,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Last-Modified': stat.mtime.toUTCString()})
      return createReadStream(name, {start, end}).pipe(res)
    }
    const data = await prepareFile(name, res), type = res.get('Content-Type')
    res.send(type.startsWith('text/') || type === 'application/json' ? data.toString('utf8') : data)
  } catch (error) { res.status(error.code === 'ENOENT' ? 404 : 500).json({error: error.code === 'ENOENT' ? 'File not found' : String(error)}) }
})
app.head('/files/*', async (req, res) => {
  try { await prepareFile(filePath(req), res); res.end() }
  catch (error) { res.status(error.code === 'ENOENT' ? 404 : 500).end() }
})
app.put('/files/*', async (req, res) => {
  try {
    const name = filePath(req)
    await fs.mkdir(path.dirname(name), {recursive: true})
    const body = req.is('application/json') ? Buffer.from(JSON.stringify(req.body, null, 2))
      : Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body)
    await fs.writeFile(name, body)
    const etag = crypto.createHash('md5').update(body).digest('hex'), {mtime} = await fs.stat(name)
    res.set({ETag: etag, 'Last-Modified': mtime.toUTCString(), 'Content-MD5': Buffer.from(etag, 'hex').toString('base64')})
    res.json({message: 'File updated', etag})
  } catch (error) { res.status(500).json({error: String(error)}) }
})
app.get('/studio/tests.html', async (_, res) => {
  const html = await fs.readFile(path.join(root, 'wonder/studio/tests.html'), 'utf8')
  res.type('html').send(html.replace('JB_IMPORT_MAP', JSON.stringify(importMap)))
})
app.use('/studio', express.static(path.join(root, 'wonder/studio')))
app.use('/tests', express.static(path.join(root, 'tests')))
setupLiveRepoRoomApplet(app, {serveAppletPage, imports: importMap.imports})
setupLiveRepoDevApplet(app, {serveAppletPage, imports: importMap.imports})
for (const {urlPath, diskPath} of staticMappings) {
  app.use(urlPath, async (req, res, next) => {
    if (!req.path.endsWith('.html')) return next()
    const html = await fs.readFile(path.join(diskPath, req.path), 'utf8').catch(() => null)
    html ? res.type('html').send(html.replaceAll('JB_IMPORT_MAP', JSON.stringify(importMap))) : next()
  })
  app.use(urlPath, express.static(diskPath))
}
await import('../../.jb6/mcp.js')
await import('@jb6/server-utils/serve-mcp.js')
await import('@jb6/server-utils/serve-edit-source.js')
const {serverUtils} = await import('@jb6/server-utils')
serverUtils.serveCli(app)
serverUtils.serveCliStream(app)
serverUtils.serveGotoSource(app)
serverUtils.serveEditSource(app, {express})
await serverUtils.serveMcpViaCli(app, {express})
setupWfetch(app)
const {setupLlmProxyRoute} = await import(`./lib/${llmProxyMode === 'onprem' ? 'llm-proxy-onprem' : 'llm-proxy'}.js`)
setupLlmProxyRoute(app)
app.get('/health', (_, res) => res.json({status: 'ok', mode: 'local'}))
return app
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000)
  ;(await createLocalApp()).listen(port, '0.0.0.0', () => console.log(`Wonder local server is running on port ${port}`))
}
