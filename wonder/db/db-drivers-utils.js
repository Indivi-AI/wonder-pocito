import { jb, coreUtils, dsls } from '@jb6/core'
import { logger, wonderBucketName, serversByUrl } from '@wonder/db/base-utils.js'
import { auth } from '@wonder/db/auth.js'

const { test: { Logger, logger: { domainLogger } } } = dsls
jb.wonderUtils ||= {}
jb.dbDriversRegistry ||= { signedUrlCache: new Map() }

let rawFileExts


async function wresolve(url, _ctx, method = 'GET') {
  const dbLogger = _ctx.vars.dbLogger || logger
  const ctx = _ctx.setVars({ url, method, dbLogger, localhostServer: serversByUrl(_ctx).localhostServer })
  const extracted = extractFromUrl(url, ctx)
  const { fileName } = extracted
  const ext = (url.endsWith('/') || fileName?.includes('.')) ? '' : '.json'
  const path = await calcPath(ctx, extracted) + ext
  const driver = await jb.wonderUtils.getDBDriver(url, ctx)
  return driver?.filePathUrl(ctx.setVars({ ...extracted, path }))
}

async function wresolveInfo(url, _ctx, method = 'GET') {
  if (!/^\w+:\/\//.test(url))
    return { url, db: null, fullyResolvedUrl: url, resolved: url, isWUrl: false, isLocal: true }   // bare disk path (csv/parquet) — not a wUrl, read as-is
  const db = extractFromUrl(url, _ctx)?.db ?? _ctx.vars.db ?? 'gcs'
  const resolved = await wresolve(url, _ctx, method)
  const fullyResolvedUrl = url.replace(/^(\w+):[^/]*\/\//, `$1:${db}//`)
  const isLocal = resolved != null && !/^https?:\/\//.test(resolved)   // wresolve returns a directly-readable path (fs or repo-relative mirror) for local; an https url for remote
  return { url, db, fullyResolvedUrl, resolved, isWUrl: resolved != null, isLocal, needsWcache: resolved != null && !isLocal }
}

async function wcachePopulate(wUrl, _ctx, { validate = false } = {}) {
  const dbLogger = _ctx.vars.dbLogger || logger
  if (!coreUtils.isNode) {
    const script = `import { coreUtils, jb } from '@jb6/core'
import '@wonder/db/db-drivers.js'
const { wcachePopulate } = jb.wonderUtils
;(async()=>{ try {
  await coreUtils.writeServiceResult(await wcachePopulate(${JSON.stringify(wUrl)}, new coreUtils.Ctx(), { validate: ${validate} }))
} catch (e) { await coreUtils.writeServiceResult({ error: e.stack || String(e) }) } })()`
    return (await coreUtils.runCliInContext(script, { ctx: _ctx, bindLoggers: 'dbLogger' })).result
  }
  const ctx = _ctx.setVars({ db: 'gcs' })
  try {
    const t0 = Date.now(), cachePath = await wresolve(wUrl, ctx.setVars({ db: 'wcache' })), fs = await import('fs/promises')
    if (validate) {
      const remoteMtime = (await jb.wonderUtils.wfetch2(wUrl, { method: 'HEAD' }, ctx))?.headers?.get?.('Last-Modified')
      const localMtime = await fs.stat(cachePath).then(s => s.mtime.toISOString()).catch(() => null)
      if (localMtime && (!remoteMtime || localMtime >= remoteMtime)) {
        dbLogger?.info?.({ t: 'wcache hit', cachePath, localMtime, remoteMtime, validateMs: Date.now() - t0 }, {}, { ctx })
        return cachePath
      }
    }
    const binary = /\.(parquet|jpg|jpeg|png|gif|webp|mp4|webm|wav|mp3|tar\.gz)$/i.test(wUrl)
    const res = await jb.wonderUtils.wfetch2(wUrl, { method: 'GET' }, ctx)
    if (!res?.ok) { dbLogger?.info?.({ t: 'wcache miss', wUrl, cachePath }, {}, { ctx }); return false }
    const content = binary ? Buffer.from(await res.arrayBuffer()) : rawFileExts.test(wUrl) ? await res.text()
      : await (async d => d == null ? null : typeof d === 'string' ? d : JSON.stringify(d, null, 2))(await res.json())
    if (content == null) { dbLogger?.info?.({ t: 'wcache empty', wUrl, cachePath }, {}, { ctx }); return false }
    await fs.mkdir(cachePath.replace(/\/[^/]*$/, ''), { recursive: true })
    await fs.writeFile(cachePath, content)
    dbLogger?.info?.({ t: 'wcache populated', cachePath, bytes: content.length, downloadMs: Date.now() - t0 }, {}, { ctx })
    return cachePath
  } catch (e) { dbLogger?.error?.({ t: 'wcache error', wUrl, err: e.message || String(e) }, {}, { ctx }); return false }
}

async function calcPath(ctx, { scope, roomId, userId, fileName, db }) {
  const dbToUse = db || serversByUrl(ctx).db
  const isLocal = dbToUse === 'fs' || dbToUse === 'local' // old - now we use wCache!!
  const myRooms = (userId && !isLocal && dsls.common.data.getMyRooms) ? await dsls.common.data.getMyRooms.$runWithCtx(ctx) : {}
  const userPrivatePath = isLocal ? userId : (myRooms?.private || userId)

  const ctxForPath = ctx.setVars({ userPrivatePath, userId, roomId, fileName })
  const roomsPrefix = isLocal && (scope.id == 'room' || scope.id == 'signedRoom') ? 'rooms' : ''
  const fetchPath = scope.fetchPath.length > 0 ? scope.fetchPath : scope.path
  const path = [roomsPrefix, scope.folderInBucket, ...fetchPath.map(v => ctxForPath.vars[v])].filter(x => x).join('/')
  return path
}

function calcUrl(ctx, { scope, roomId, userId, fileName }) {
  const ctxForPath = ctx.setVars({ userPrivatePath: '', userId: '', roomId, fileName })
  const urlPath = scope.path.map(v => ctxForPath.vars[v]).filter(x => x).join('/')

  return `${scope.id}://${urlPath}?user=${userId}`
}

function extractFromUrl(url, ctx) {
  const { dbLogger } = ctx.vars
  const [scopeId, rest] = url.split(':', 2)
  if (!rest)
    return dbLogger?.error?.({ t: 'extractFromUrl invalid url' }, { url }, { ctx })

  const dbMatch = /^([^/]+)\/\/(.+)/.exec(rest)
  const db = dbMatch ? dbMatch[1] : ctx.vars.db
  const pathAndQuery = dbMatch ? dbMatch[2] : rest.replace(/^\/\//, '')
  const parsed = new URL(`http://dummy/${pathAndQuery}`)
  const pathParts = parsed.pathname.slice(1).split('/')
  const userId = parsed.searchParams.get('user') || ctx?.vars.userId

  const scope = dsls.wonder.scope[scopeId]?.$run()
  if (!scope)
    return dbLogger?.error?.({ t: `extractFromUrl invalid scope ${scopeId}` }, { url }, { ctx })
  scope.id = scopeId

  const args = {}
  const path = scope.path
  for (let i = 0; i < path.length - 1; i++)
    args[path[i]] = pathParts[i]
  args[path[path.length - 1]] = pathParts.slice(path.length - 1).join('/') // last elements in path takes them all
  const res = { scope, bucketName: scope.bucket, userId, db, ...args }
  //dbLogger?.info?.({ t: 'extractFromUrl', scope, db, userId, fileName: res.fileName }, { url, res, pathParts }, { ctx })
  return res
}

function notifyInternalActivity(url, opts, ctx) { if (ctx.vars.doNotUpdateRoomActivity) return }

async function paginateGcsList(fetchPage) {
  const items = [], dirs = []
  let pageToken, pages = 0, status = 200
  do {
    const page = await fetchPage(pageToken)
    if (page.status != null) status = page.status
    for (const p of (page.prefixes || [])) dirs.push({ name: p, isDir: true })
    for (const f of (page.items || [])) items.push({ name: f.name, updated: f.updated, size: Number(f.size) || 0 })
    pageToken = page.nextPageToken
    pages++
  } while (pageToken)
  return { items, dirs, pages, status, result: [...dirs, ...items] }
}

const successResult = { ok: true, status: 200, statusText: 'success', text: async () => '{ success: true }', json: async () => ({ success: true }) }
const errorResultByException = error => ({ ok: false, status: 500, statusText: error.stack || error, text: async () => null, json: async () => null })
const notFoundResult = { ok: false, status: 404, statusText: 'not found', text: async () => '{}', json: async () => ({}) }

async function wonderRepoRoot() {
  if (globalThis.__repoRoot) return globalThis.__repoRoot
  const { resolve, dirname } = await import('path')
  const { fileURLToPath } = await import('url')
  return resolve(dirname(fileURLToPath(import.meta.url)), '../..')
}

const bustCdnCache = url => url.includes('X-Goog-Signature') ? url : `${url}${url.includes('?') ? '&' : '?'}cacheKiller=${Date.now()}`

const gcsStorage = ctx => auth.gcpStorage(ctx)
const nativeGcsStorage = ctx => auth.gcpStorage(ctx, { native: true })

Logger('dbLogger', {
  impl: domainLogger('db', 'driverId,db,method,fileName,status,statusText', {
    addToR2: 'url,filePathUrl,filePath,opts,curl'
  })
})

const methodToAction = method => method === 'GET' || method === 'HEAD' ? 'read' : 'write'
const sigsStorageKey = roomId => `sigs_${roomId}_${auth.currentPrincipal()}`

function loadSignaturesFromStorage(roomId) {
  if (coreUtils.isNode) return
  try {
    const stored = JSON.parse(localStorage.getItem(sigsStorageKey(roomId)) || '{}')
    const { signedUrlCache } = jb.dbDriversRegistry
    const now = Date.now()
    for (const [key, entry] of Object.entries(stored))
      if (entry.url && entry.exp > now) signedUrlCache.set(key, entry)
  } catch {}
}

function cacheSignatures(roomId, signatures) {
  const { signedUrlCache } = jb.dbDriversRegistry
  const now = Date.now()
  for (const [key, entry] of Object.entries(signatures))
    if (entry.url && entry.exp > now) signedUrlCache.set(key, entry)
  if (!coreUtils.isNode)
    localStorage.setItem(sigsStorageKey(roomId), JSON.stringify(signatures))
}

const loadedRooms = new Set()

async function getCachedSignedUrl(ctx, path, method) {
  // works with cloud-services/express-server/lib/signed-url.js
  const { signedUrlCache } = jb.dbDriversRegistry
  const dbLogger = ctx.vars.dbLogger
  const slashIdx = path.indexOf('/')
  const roomId = path.slice(0, slashIdx)
  const fileKey = path.slice(slashIdx + 1)
  if (!coreUtils.isNode && !loadedRooms.has(roomId)) {
    loadSignaturesFromStorage(roomId)
    loadedRooms.add(roomId)
  }
  const cacheKey = `${fileKey}:${methodToAction(method)}`
  const cached = signedUrlCache.get(cacheKey)
  dbLogger?.info?.({ t: 'signedUrl cacheLookup', cacheKey, hit: !!(cached && cached.exp > Date.now()), cacheSize: signedUrlCache.size }, {}, { ctx }) // log to delete
  if (cached && cached.exp > Date.now()) return cached.url
  const t0 = Date.now()
  dbLogger?.info?.({ t: 'signedUrl fetch', path, method }, {}, { ctx })
  const idToken = await auth.wonderIdToken(ctx)
  const { signedUrlServer } = serversByUrl(ctx)
  let res
  for (let attempt = 0; ; attempt++) {   // burst signing of many NEW files hits the signatures-file mutation rate limit (GCS 429 → 500) - back off and retry
    res = await fetch(`${signedUrlServer}/${path}?method=${method}`, { headers: { Authorization: `Bearer ${idToken}` } })
    if (res.ok || attempt >= 2) break
    dbLogger?.info?.({ t: 'signedUrl retry', path, status: res.status, attempt }, {}, { ctx })
    await new Promise(ok => setTimeout(ok, 1500 * (attempt + 1)))
  }
  if (!res.ok) {
    const error = `signed-url failed: ${res.status} ${await res.text()}`
    dbLogger?.error?.({ t: error, path, method }, {}, { ctx })
    throw new Error(error)
  }
  const { signedUrl, signatures, timing } = await res.json()
  if (signatures) cacheSignatures(roomId, signatures)
  dbLogger?.info?.({ t: 'signedUrl ready', path, method, duration: Date.now() - t0, serverTiming: timing }, {}, { ctx })
  return signedUrl
}

async function prefetchSignedUrls(ctx) {
  if (ctx.vars.db && ctx.vars.db !== 'gcs') return
  const { roomId } = ctx.vars
  const t0 = Date.now()   // log to delete
  const idToken = await auth.wonderIdToken(ctx)
  const { signedUrlServer } = serversByUrl(ctx)
  const res = await fetch(`${signedUrlServer.replace('/signed-url', '')}/signed-urls/${roomId}`, { headers: { Authorization: `Bearer ${idToken}` } })
  if (!res.ok) return
  const { signatures, cached, timing } = await res.json()
  if (signatures) cacheSignatures(roomId, signatures)
  ctx?.vars?.dbLogger?.info?.({ t: 'prefetchSignedUrls timing', roomId, ms: Date.now() - t0, cached, timing,
    signatures: signatures && Object.keys(signatures).length }, {}, { ctx })   // log to delete
}

const isLocalFile = (body, opts) => typeof body === 'string' && opts?.headers?.['x-wonder-body'] === 'localFile'

const rawFileUtils = (text, binary) => {
  const mimeTypes = {...text, ...binary}
  rawFileExts = new RegExp(`\\.(${Object.keys(mimeTypes).join('|')})$`, 'i')
  const isTextMime = contentType => Object.values(text).includes(contentType)
  return { mimeTypes, rawFileExts, isTextMime, rawFileBody: async (body, contentType, opts) => {
    if (typeof body !== 'string') return body
    if (isLocalFile(body, opts)) { const fs = await import('fs'); return fs.readFileSync(body) }
    const isText = isTextMime(contentType)
    return coreUtils.isNode ? Buffer.from(body, isText ? 'utf8' : 'base64')
      : isText ? new TextEncoder().encode(body) : Uint8Array.from(atob(body), c => c.charCodeAt(0))
  }}
}

const wcacheRoot = () => process.env?.WCACHE_DIR || '/tmp/wcache'
const wcachePath = (bucketName, path) => `${wcacheRoot()}/${bucketName}/${path}`

Object.assign(jb.wonderUtils, { successResult, errorResultByException, notFoundResult, wresolve, wresolveInfo, wcachePopulate,
  calcPath, calcUrl, extractFromUrl, wonderRepoRoot, bustCdnCache, paginateGcsList, gcsStorage,
  getCachedSignedUrl, prefetchSignedUrls, isLocalFile, rawFileUtils, wcachePath,
  getIdToken: auth.wonderIdToken, getAccessToken: auth.gcpAccessToken
})
