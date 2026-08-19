import { jb, coreUtils, dsls } from '@jb6/core'
import { auth } from '@wonder/db/auth.js'

const { test: { Logger, logger: { domainLogger } } } = dsls
jb.wonderUtils ||= {}
jb.dbDriversRegistry ||= { signedUrlCache: new Map() }

// public
const formatDay = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const formatTimeWithRandom = () => {
  const d = new Date()
  return `${[d.getFullYear(), d.getMonth()+1, d.getDate(), d.getHours(), d.getMinutes()]
    .map((x,i) => i ? String(x).padStart(2,'0') : x).concat(d.getMilliseconds()).join('-')}-${Math.random().toString(36).slice(2, 11)}`
}


async function wresolve(url, _ctx, method = 'GET') {
  const dbLogger = _ctx.vars.dbLogger
  let ctx = _ctx.setVars({ url, method, dbLogger, localhostServer: localhostServer(_ctx) })
  const extracted = extractFromUrl(url, ctx), db = extracted.db || ctx.vars.db || 'bucket'
  const backend = dsls.wonder['db-backend'][db.replace(/-/g, '')]?.$runWithCtx(ctx)
  if (backend?.enrichCtx) ctx = await backend.enrichCtx(ctx)
  const { fileName } = extracted
  const ext = (url.endsWith('/') || fileName?.includes('.')) ? '' : '.json'
  const path = await calcPath(ctx, extracted) + ext
  const driver = await jb.wonderUtils.getDBDriver(url, ctx)
  return driver?.filePathUrl(ctx.setVars({ ...extracted, path }))
}

async function resolveWUrl(roomId, ctx) {
  if (/^\w+:(?:[^/]*)\/\//.test(roomId)) return roomId.replace(/\/$/, '')
  if (globalThis.process?.env?.WONDER_AUTH_MODE === 'none') return `room://${roomId}`
  const exists = async url => {
    const res = await jb.wonderUtils.wfetch2(url, { method: 'HEAD' }, ctx)
    if (res.status === 404) return false
    if (!res.ok) throw new Error(`resolveWUrl failed: ${res.status} ${url}`)
    return true
  }
  return await exists(`signedRoom://${roomId}/admin/users.json`) ? `signedRoom://${roomId}` : `room://${roomId}`
}

async function wresolveInfo(url, _ctx, method = 'GET') {
  if (!/^\w+:\/\//.test(url))
    return { url, db: null, fullyResolvedUrl: url, resolved: url, isWUrl: false, isLocal: true }   // bare disk path (csv/parquet) — not a wUrl, read as-is
  const db = extractFromUrl(url, _ctx)?.db ?? _ctx.vars.db ?? 'bucket'
  const resolved = await wresolve(url, _ctx, method)
  const fullyResolvedUrl = url.replace(/^(\w+):[^/]*\/\//, `$1:${db}//`)
  const isLocal = resolved != null && !/^https?:\/\//.test(resolved)   // wresolve returns a directly-readable path (fs or repo-relative mirror) for local; an https url for remote
  return { url, db, fullyResolvedUrl, resolved, isWUrl: resolved != null, isLocal, needsWcache: resolved != null && !isLocal }
}

async function wcachePopulate(wUrl, _ctx, { validate = false } = {}) {
  const dbLogger = _ctx.vars.dbLogger
  if (!coreUtils.isNode) {
    const script = `import { coreUtils, jb } from '@jb6/core'
import '@wonder/db/db-drivers.js'
const { wcachePopulate } = jb.wonderUtils
;(async()=>{ try {
  await coreUtils.writeServiceResult(await wcachePopulate(${JSON.stringify(wUrl)}, new coreUtils.Ctx(), { validate: ${validate} }))
} catch (e) { await coreUtils.writeServiceResult({ error: e.stack || String(e) }) } })()`
    return (await coreUtils.runCliInContext(script, { ctx: _ctx, bindLoggers: 'dbLogger' })).result
  }
  const ctx = _ctx.setVars({ db: 'bucket' })
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
  } catch (e) { coreUtils.logException(e, 'wcache failed', { ctx, wUrl }); return false }
}

async function saveRoomBigLog2(ctx, id = formatTimeWithRandom()) {
  if (!ctx.vars.roomBigLogLogger2 || !ctx.vars.roomWUrl) return
  const wUrl = `${ctx.vars.roomWUrl}/admin/bigLogs/${id}.json`
  const res = await jb.wonderUtils.wfetch2(wUrl, { method: 'PUT', body: coreUtils.harvestBigLog(ctx) }, ctx)
  return res.ok && wUrl
}

async function prefetchSignedUrls(ctx) {
  if (ctx.vars.db && !['bucket', 'gcs'].includes(ctx.vars.db)) return
  const { roomId } = ctx.vars
  const t0 = Date.now()
  const idToken = await auth.wonderIdToken(ctx)
  const signedUrlServer = signedUrlServerOf(ctx)
  const logger = ctx.vars.authLogger ? '?logger=authLogger' : ''
  const res = await fetch(`${signedUrlServer.replace('/signed-url', '')}/signed-urls/${roomId}${logger}`,
    {headers: {Authorization: `Bearer ${idToken}`}})
  const { signatures, cached, timing, logs } = await res.json()
  Object.entries(logs?.authLogger || {}).forEach(([channel, entries]) => ctx.vars.authLogger?.[channel]?.push(...entries))
  if (!res.ok) return
  if (signatures) cacheSignatures(roomId, signatures)
  ctx?.vars?.dbLogger?.info?.({ t: 'prefetchSignedUrls timing', roomId, ms: Date.now() - t0, cached, timing,
    signatures: signatures && Object.keys(signatures).length }, {}, { ctx })
}

const getIdToken = auth.wonderIdToken
const getAccessToken = auth.gcpAccessToken

// bucket paths shared by db drivers
const storagePrefix = 'https://storage.googleapis.com'
const wonderBucketName = 'indiviai-wonder'

async function calcPath(ctx, { scope, roomId, userId, fileName, db }) {
  const dbToUse = db || ctx.vars.db
  const isLocal = dbToUse === 'fs' || dbToUse === 'local' // old - now we use wCache!!
  const myRooms = (userId && !isLocal && dsls.common.data.getMyRooms) ? await dsls.common.data.getMyRooms.$runWithCtx(ctx) : {}
  const userPrivatePath = isLocal ? userId : (myRooms?.private || userId)

  const ctxForPath = ctx.setVars({ userPrivatePath, userId, roomId, fileName })
  const roomsPrefix = isLocal && ['room', 'signedRoom'].includes(scope.id) ? 'rooms' : ''
  const fetchPath = scope.fetchPath.length > 0 ? scope.fetchPath : scope.path
  const path = [roomsPrefix, scope.folderInBucket, ...fetchPath.map(v => ctxForPath.vars[v])].filter(x => x).join('/')
  return path
}

function extractFromUrl(url, ctx) {
  const { dbLogger } = ctx.vars
  const [scopeId, rest] = url.split(':', 2)
  if (!rest)
    return dbLogger?.error?.({ t: 'extractFromUrl invalid url' }, { url }, { ctx })

  const dbMatch = /^([^/]+)\/\/(.+)/.exec(rest)
  const pathAndQuery = dbMatch ? dbMatch[2] : rest.replace(/^\/\//, '')
  const parsed = new URL(`http://dummy/${pathAndQuery}`)
  const pathParts = parsed.pathname.slice(1).split('/')
  const userId = parsed.searchParams.get('user') || ctx?.vars.userId

  const scope = dsls.wonder.scope[scopeId]?.$run()
  if (!scope)
    return dbLogger?.error?.({ t: `extractFromUrl invalid scope ${scopeId}` }, { url }, { ctx })
  scope.id = scopeId
  const db = dbMatch ? dbMatch[1] : ctx.vars.db || scope.db

  const args = {}
  const path = scope.path
  for (let i = 0; i < path.length - 1; i++)
    args[path[i]] = pathParts[i]
  args[path[path.length - 1]] = pathParts.slice(path.length - 1).join('/') // last elements in path takes them all
  const res = { scope, bucketName: scope.bucket, userId, db, ...args }
  //dbLogger?.info?.({ t: 'extractFromUrl', scope, db, userId, fileName: res.fileName }, { url, res, pathParts }, { ctx })
  return res
}

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

Logger('dbLogger', {
  impl: domainLogger('db', 'driverId,db,method,fileName,status,statusText', {
    addToR2: 'url,filePathUrl,filePath,opts,curl'
  })
})

async function getCachedSignedUrl(ctx, path, method) {
  // works with cloud-services/express-server/lib/signed-url.js
  const { signedUrlCache } = jb.dbDriversRegistry
  const dbLogger = ctx.vars.dbLogger
  const authLogger = ctx.vars.authLogger
  const mergeAuthLogs = logs => Object.entries(logs?.authLogger || {}).forEach(([channel, entries]) =>
    authLogger?.[channel]?.push(...entries))
  const slashIdx = path.indexOf('/')
  const roomId = path.slice(0, slashIdx)
  const fileKey = path.slice(slashIdx + 1)
  if (!coreUtils.isNode && !loadedRooms.has(roomId)) {
    loadSignaturesFromStorage(roomId)
    loadedRooms.add(roomId)
  }
  const cacheKey = `${fileKey}:${methodToAction(method)}`
  const cached = signedUrlCache.get(cacheKey)
  if (cached && cached.exp > Date.now()) return cached.url
  const t0 = Date.now()
  const signedUrlServer = signedUrlServerOf(ctx)
  dbLogger?.info?.({ t: 'signedUrl fetch', path, method, signedUrlServer }, {}, { ctx })
  const idToken = await auth.wonderIdToken(ctx)
  const tokenReadyAt = Date.now()
  authLogger?.info?.({t: 'signed-url token ready', atEpoch: tokenReadyAt, tokenMs: tokenReadyAt - t0,
    hasUserToken: !!idToken}, {}, {ctx})
  let res, requestUrl, callId, attempt = 0
  for (; ; attempt++) {   // burst signing of many NEW files hits the signatures-file mutation rate limit (GCS 429 → 500) - back off and retry
    const logger = authLogger ? '&logger=authLogger' : ''
    callId = authLogger && `${coreUtils.isNode ? process.pid : 'browser'}-${Date.now()}-${attempt + 1}`
    requestUrl = `${signedUrlServer}/${path}?method=${method}${logger}${callId ? `&callId=${callId}` : ''}`
    const runtime = coreUtils.isNode ? {runtime: 'node', runtimeVersion: process.version,
      service: process.env.K_SERVICE, revision: process.env.K_REVISION} : {runtime: 'browser'}
    authLogger?.info?.({t: 'remote signed-url call', atEpoch: Date.now(), callId, transport: 'https',
      from: runtime, to: {server: signedUrlServer, url: requestUrl}, method, attempt: attempt + 1,
      requestedLogger: 'authLogger', hasUserToken: !!idToken}, {}, {ctx})
    const requestAt = Date.now()
    res = await fetch(requestUrl, {headers: {Authorization: `Bearer ${idToken}`}})
    const willRetry = !res.ok && (res.status >= 500 || res.status === 429) && attempt < 2
    authLogger?.info?.({t: 'remote signed-url response', atEpoch: Date.now(), callId, server: signedUrlServer, url: requestUrl,
      attempt: attempt + 1, status: res.status, statusText: res.statusText, ok: res.ok, requestMs: Date.now() - requestAt,
      contentType: res.headers.get('content-type'), responseServer: res.headers.get('server'),
      responsePoweredBy: res.headers.get('x-powered-by'), responseWonderService: res.headers.get('x-wonder-service'),
      responseRevision: res.headers.get('x-wonder-revision'), traceId: res.headers.get('x-cloud-trace-context'),
      willRetry}, {}, {ctx})
    if (!willRetry) break
    dbLogger?.info?.({ t: 'signedUrl retry', path, status: res.status, attempt }, {}, { ctx })
    await new Promise(ok => setTimeout(ok, 1500 * (attempt + 1)))
  }
  if (!res.ok) {
    const body = await res.text()
    let parsed
    try { parsed = JSON.parse(body) } catch {}
    mergeAuthLogs(parsed?.logs)
    authLogger?.error?.({t: 'signed-url rejected', atEpoch: Date.now(), callId, path, method, status: res.status,
      statusText: res.statusText, contentType: res.headers.get('content-type'), responseKind: parsed ? 'json' : 'non-json',
      remoteAuthTrace: !!parsed?.logs?.authLogger, retry: false, clientAction: 'return failed DB response', returnedStatus: 500,
      server: signedUrlServer, url: requestUrl, attempt: attempt + 1, responseServer: res.headers.get('server'),
      responsePoweredBy: res.headers.get('x-powered-by'), traceId: res.headers.get('x-cloud-trace-context'),
      responseWonderService: res.headers.get('x-wonder-service'), responseRevision: res.headers.get('x-wonder-revision')}, {}, {ctx})
    const permissionDenial = res.status === 403 && await checkPermissionDenial(ctx, roomId, fileKey, method)
    if (permissionDenial) authLogger.info(permissionDenial, {}, {ctx})
    const message = `signed-url failed: ${res.status} ${method} ${path} via ${signedUrlServer}`
    const stack = new Error(message).stack
    ctx.vars.errorLogger.error({ t: 'signed-url failed', stack, status: res.status, path, method, signedUrlServer }, { body }, { ctx })
    return { ok: false, status: 500, statusText: stack, text: async () => body, json: async () => ({ error: stack }) }
  }
  const responseAt = Date.now()
  const { signedUrl, signatures, timing, logs } = await res.json()
  mergeAuthLogs(logs)
  authLogger?.info?.({t: 'signed-url accepted', atEpoch: Date.now(), path, method, status: res.status}, {}, {ctx})
  if (signatures) cacheSignatures(roomId, signatures)
  dbLogger?.info?.({ t: 'signedUrl ready', path, method, duration: Date.now() - t0, idTokenMs: tokenReadyAt - t0,
    fetchMs: responseAt - tokenReadyAt, responseBodyMs: Date.now() - responseAt, attempts: attempt + 1, serverTiming: timing }, {}, { ctx })
  return signedUrl
}

async function checkPermissionDenial(ctx, room, file, method) {
  if (!ctx.vars.authLogger || !coreUtils.isNode || process.env.K_SERVICE || !/^[\w.-]+$/.test(room)) return
  const {execFile} = await import('node:child_process'), {promisify} = await import('node:util')
  const {stdout} = await promisify(execFile)('gsutil', ['cat', `gs://indiviai-wonder-protected/${room}/admin/users.json`])
  const parsed = JSON.parse(stdout), users = parsed.content || parsed, username = ctx.vars.userEmail || await auth.devEmail(ctx)
  const role = users.admins.includes(username) ? 'admin'
    : users.users.includes(username) || users.users.includes('authenticated') ? 'user' : null
  const [accessLevel, pathUserId] = file.split('/'), permissions = users.accessLevels[accessLevel]?.[role] || ''
  const action = methodToAction(method), requiresUserMatch = permissions.includes('u')
  const userMatches = !requiresUserMatch || username === pathUserId
  const allowed = userMatches && permissions.includes(action === 'read' ? 'r' : 'w')
  return {t: 'users.json', atEpoch: Date.now(), username, room, users, role, accessLevel, permissions, action,
    requiresUserMatch, userMatches, allowed, permissionDenied: !allowed}
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

const wcachePath = (bucketName, path) => `${wcacheRoot()}/${bucketName}/${path}`

Object.assign(jb.wonderUtils, { formatDay, formatTimeWithRandom, wresolve, wresolveInfo, wcachePopulate,
  saveRoomBigLog2, prefetchSignedUrls, resolveWUrl, getIdToken, getAccessToken,
  storagePrefix, wonderBucketName, successResult, errorResultByException, notFoundResult,
  calcPath, extractFromUrl, wonderRepoRoot, bustCdnCache, paginateGcsList, gcsStorage,
  getCachedSignedUrl, isLocalFile, rawFileUtils, wcachePath })

// private
let rawFileExts
const localhostServer = ctx => ctx.vars.localhostServer || globalThis.process?.env?.WONDER_LOCAL_SERVER || 'http://localhost:3000'
const signedUrlServerOf = ctx => ctx.vars.signedUrlServer
  || 'https://w-staging.indivi.ai/signed-url'
const methodToAction = method => method === 'GET' || method === 'HEAD' ? 'read' : 'write'
const sigsStorageKey = roomId => `sigs_${roomId}_${auth.currentPrincipal()}`
const loadedRooms = new Set()
const wcacheRoot = () => process.env?.WCACHE_DIR || '/tmp/wcache'

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
  if (!coreUtils.isNode) localStorage.setItem(sigsStorageKey(roomId), JSON.stringify(signatures))
}
