import { jb, coreUtils, dsls, ns } from '@jb6/core'
import { auth } from '@wonder/db/auth.js'
import '@wonder/db/db-drivers-utils.js'

const {
  tgp: { TgpType, Component, 'ctx-enricher': { Var, sameCtx } },
  common: { Data },
} = dsls
const { wonderUtils } = jb
const { storagePrefix, wonderBucketName } = wonderUtils
const localhostServer = ctx => ctx.vars.localhostServer || globalThis.process?.env?.WONDER_LOCAL_SERVER || 'http://localhost:3000'
const runtimeDb = ctx => ctx.vars.db || (!coreUtils.isNode && new URLSearchParams(globalThis.location?.search || '').get('db'))
const gcsProxyBase = ctx => ctx.vars.wonderServiceBase || globalThis.location?.origin
  || globalThis.process?.env?.WONDER_SERVICE_URL || 'https://wonder-lambda-me-west1.indivi.ai'
const { wresolve, successResult, errorResultByException, notFoundResult, bustCdnCache, paginateGcsList, calcPath,
  extractFromUrl, wonderRepoRoot, fullFileCachePath } = wonderUtils

Data('wFetch', {
  description: 'Read or write JSON, text and binary room content. POST appends JSONL text; a trailing slash lists.',
  params: [
    {id: 'url', as: 'string', dynamic: true, mandatory: true, description: 'wUrl: <scheme>://<roomId>/<dir>/<file>?user=<id>. room:// is public; signedRoom:// is signed'},
    {id: 'method', as: 'string', defaultValue: 'GET', description: 'GET (read/list) | PUT (overwrite) | POST (append JSONL text) | HEAD'},
    {id: 'body', dynamic: true, description: 'PUT value or POST JSONL records'},
    {id: 'headers', as: 'object', defaultValue: {}, description: 'standard HTTP headers; x-wonder-body=localFile streams a Node-local body path'},
    {id: 'stream', as: 'boolean', description: 'return the untouched Response', type: 'boolean<common>'},
    {id: 'isStaging', as: 'boolean', description: 'route signed-url to staging from MCP/dev', type: 'boolean<common>'},
    {id: 'logger', as: 'string', description: 'comma-separated loggers to harvest. returns {result, ...harvestedLogs}; implies no stream'}
  ],
  impl: async (ctx, {}, { url, method, body, headers, stream, isStaging, logger }) => {
    const fetchCtx = coreUtils.ensureLoggers(logger, { ctx: ctx.setVars({ ...(isStaging && { isStaging }) }) })
    const target = url(ctx), suffix = target.split(/[?#]/)[0].match(/\.([^.\/]+)$/)?.[1]?.toLowerCase()
    const suppliedType = Object.entries(headers).find(([name]) => name.toLowerCase() === 'content-type')?.[1]
    const append = (method || 'GET').toUpperCase() === 'POST'
    const type = suppliedType || (append || suffix === 'jsonl' ? 'application/x-ndjson' : suffix === 'json' || !suffix ? 'application/json'
      : ['md','txt','csv','tsv','js','mjs','css','html','svg'].includes(suffix) ? 'text/plain'
      : 'application/octet-stream')
    const value = body.profile && await body(ctx)
    const requestBody = append && typeof value !== 'string' ? coreUtils.asArray(value).map(item => JSON.stringify(item)).join('\n') + '\n'
      : /json(?:;|$)/i.test(type) && typeof value !== 'string' ? JSON.stringify(value) : value
    const res = await wfetch2(target, { method, headers: { ...headers, 'content-type': type }, ...(body.profile && { body: requestBody }) }, fetchCtx)
    const readBody = () => (method || 'GET').toUpperCase() === 'HEAD'
      ? { ok: res.ok, status: res.status, lastModified: res.headers?.get?.('last-modified'),
          contentLength: res.headers?.get?.('content-length'), contentLocation: res.headers?.get?.('content-location') }
      : /json(?:;|$)/i.test(res.headers?.get?.('content-type') || type) ? res.json()
      : /^text\/|ndjson|javascript|svg/i.test(res.headers?.get?.('content-type') || type) ? res.text() : res.arrayBuffer()
    if (logger) return { result: await readBody(), ...coreUtils.harvestLogs(fetchCtx, logger.split(',')) }
    return stream ? res : readBody()
  }
})

Data('wResolve', {
  params: [
    {id: 'url', as: 'string', dynamic: true, mandatory: true},
    {id: 'method', as: 'string', defaultValue: 'GET'}
  ],
  impl: (ctx, {}, { url, method }) => wresolve(url(ctx), ctx, method)
})

const Scope = TgpType('scope', 'wonder', { typescript: '{ db, bucket, folderInBucket, path: [] }' })
const scope = Scope('scope', {
  params: [
    {id: 'bucket', as: 'string', defaultValue: 'indiviai-wonder'},
    {id: 'db', as: 'string', byName: true},
    {id: 'folderInBucket', as: 'string', defaultValue: '', byName: true},
    {id: 'path', as: 'array'},
    {id: 'fetchPath', as: 'array'}
  ],
  impl: (ctx, { }, args) => ({ ...args, id: ctx.jbCtx.profile?.$?.id })
})

Scope('room', {
  impl: scope({ path: ['roomId', 'fileName'] })
})

Scope('userGlobal', {
  impl: scope({
    folderInBucket: 'users',
    path: ['fileName'],
    fetchPath: ['userPrivatePath','fileName']
  })
})

Scope('userPerRoomPrivate', {
  impl: scope({
    folderInBucket: 'users',
    path: ['roomId','fileName'],
    fetchPath: ['userPrivatePath','roomId','fileName']
  })
})

// TODO: Implement inside the room as a file that only the user and admin can read and write
Scope('userPerRoom', {
  impl: scope({
    folderInBucket: 'users',
    path: ['roomId','fileName'],
    fetchPath: ['userPrivatePath','roomId','fileName']
  })
})

Scope('userPublish', {
  impl: scope({ folderInBucket: 'usersPub', path: ['userId', 'fileName'] })
})

Scope('logs', {
  impl: scope('logs-bucket-me-west1', { path: ['fileName'] })
})

Scope('roomLogs', {
  impl: scope('logs-bucket-me-west1', { path: ['roomId', 'fileName'] })
})

Scope('analytics', {
  impl: scope('ecommerce-clients-analysis', { path: ['fileName'] })
})

Scope('wonderPublish', {
  impl: scope({ folderInBucket: 'wonder', path: ['fileName'] })
})

Scope('userPublishToWonder', {
  impl: scope('logs-bucket-me-west1', {
    folderInBucket: 'usersPubToWonder',
    path: ['userId', 'fileName']
  })
})

Scope('tos', {
  impl: scope('indiviai-tos-bucket', {
    folderInBucket: 'phone',
    path: ['userId']
  })
})

Scope('waContact', {
  impl: scope('indiviai-wonder-users-contact-info', {
    folderInBucket: 'userIds',
    path: ['userId', 'fileName']
  })
})

const RevisionProtocol = TgpType('revision-protocol', 'wonder', {
  typescript: '{ responseHeader, enrichHeaders(headers, {expectedRevision,createOnly}), conflictStatuses, isConflict(response) }'
})
const revisionProtocol = RevisionProtocol('revisionProtocol', {
  params: [
    {id: 'responseHeader', as: 'string', mandatory: true},
    {id: 'matchHeader', as: 'string', mandatory: true},
    {id: 'createOnlyHeader', as: 'string', mandatory: true},
    {id: 'createOnlyValue', as: 'string', mandatory: true},
    {id: 'conflictStatuses', as: 'array', mandatory: true}
  ],
  impl: (ctx, {}, {responseHeader, matchHeader, createOnlyHeader, createOnlyValue, conflictStatuses}) => ({
    responseHeader,
    conflictStatuses,
    isConflict: response => conflictStatuses.includes(response?.status),
    enrichHeaders: (headers, {expectedRevision, createOnly} = {}) => {
      const enriched = new Headers(headers)
      if (createOnly) enriched.set(createOnlyHeader, createOnlyValue)
      else if (expectedRevision != null) enriched.set(matchHeader, expectedRevision)
      return enriched
    }
  })
})

const List = TgpType('list', 'wonder', {
  typescript: '(ctx: Ctx) => Promise<{name,updated?,size?,isDir?}[]>'
})

// list
List('list.gcs', {
  impl: () => async ctx => {
    const { dbLogger, bucketEndpoint, bucketName, path, authToken, authMethod } = ctx.vars
    const t0 = Date.now()
    const { items, dirs, pages, status, result } = await paginateGcsList(async pageToken => {
      const pageQuery = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
      const url = `${bucketEndpoint}/storage/v1/b/${bucketName}/o?delimiter=%2F&prefix=${encodeURIComponent(path)}&maxResults=5000${pageQuery}`
      const res = await fetch(await authMethod.enrichRequest(new Request(url), authToken, ctx))
      const page = res.ok ? await res.json() : { items: [], prefixes: [] }
      return { ...page, status: res.status }
    })
    dbLogger?.info?.({ t: 'list.gcs', prefix: path, items: items.length,
      dirs: dirs.length, pages, ms: Date.now() - t0, status }, {}, { ctx })
    return result
  }
})
const { list } = ns

const ObjectStore = TgpType('object-store', 'wonder', {
  typescript: '{ categories, enrichCtx(ctx): Ctx, list?: ListRT, revisionProtocol?: RevisionProtocolRT }'
})
const objectStore = ObjectStore('objectStore', {
  params: [
    {id: 'categories', as: 'array'},
    {id: 'enrichCtx', type: 'ctx-enricher<tgp>', dynamic: true, defaultValue: sameCtx()},
    {id: 'list', type: 'list<wonder>'},
    {id: 'revisionProtocol', type: 'revision-protocol<wonder>'}
  ],
  impl: (ctx, {}, store) => store
})

ObjectStore('gcs', {
  impl: objectStore({
    categories: ['bucket', 'google', 'gcs'],
    enrichCtx: Var('bucketEndpoint', 'https://storage.googleapis.com'),
    list: list.gcs(),
    revisionProtocol: revisionProtocol({
      responseHeader: 'x-goog-generation',
      matchHeader: 'x-goog-if-generation-match',
      createOnlyHeader: 'x-goog-if-generation-match',
      createOnlyValue: '0',
      conflictStatuses: [412]
    })
  })
})

ObjectStore('fs', { impl: objectStore({ categories: ['fs'] }) })
ObjectStore('fsmem', { impl: objectStore({ categories: ['fsmem'] }) })
ObjectStore('fullFileCache', {
  impl: objectStore(['fullFileCache'])
})

const AuthToken = TgpType('auth-token', 'wonder', { typescript: '{ value, expired() }' })
const AuthMethod = TgpType('auth-method', 'wonder', { typescript: '{ enrichRequest(fetchReq, authToken, ctx): fetchReq }' })

AuthToken('authToken.anonymous', {
  impl: () => ({ value: null, expired: () => false })
})

AuthToken('authToken.gcpAccessToken', {
  impl: async ctx => {
    const createdAt = Date.now()
    return { value: await auth.gcpAccessToken(ctx, { method: ctx.vars.method }), expired: () => Date.now() > createdAt + 3000e3 }
  }
})

AuthMethod('authMethod.none', {
  impl: () => ({ enrichRequest: fetchReq => fetchReq })
})

AuthMethod('authMethod.bearer', {
  impl: () => ({
    enrichRequest: (fetchReq, authToken, ctx) => {
      const headers = new Headers(fetchReq.headers)
      headers.set('authorization', `Bearer ${authToken.value}`)
      ctx.vars.dbLogger?.info?.({ t: 'bucket request authenticated', authMethod: 'bearer',
        method: fetchReq.method, host: new URL(fetchReq.url).host }, {}, { ctx })
      return new Request(fetchReq, { headers })
    }
  })
})

const GetMethod = TgpType('get-method', 'wonder', { typescript: '{ fetch(ctx)' })
const PutMethod = TgpType('put-method', 'wonder', { typescript: '{ fetch(ctx)' })
const AppendMethod = TgpType('append-method', 'wonder', { typescript: '{ fetch(ctx)' })
const HeadMethod = TgpType('head-method', 'wonder', { typescript: '{ fetch(ctx) }' })
const ListMethod = TgpType('list-method', 'wonder', { typescript: '{ list(ctx): {name,updated}[] }' })
const DbDriver = TgpType('db-driver', 'wonder', { typescript: '{ get(ctx), head(ctx), put(ctx), append(ctx), filePathUrl }' })
const DbDriverInterceptor = TgpType('db-driver-interceptor', 'wonder', {
  typescript: '{ transformUrl?(ctx<url,opts>): string|null, pre?(ctx<...,path,bucketName,driverMethod>): Response|null, post?(ctx<...,filePathUrl>): Response|null }'
})

const dbDriver = Component('dbDriver', {
  type: 'db-driver<wonder>',
  params: [
    {id: 'whenAndWhyToUse', as: 'text', byName: true},
    {id: 'designConcerns', as: 'text'},
    {id: 'authToken', type: 'auth-token', dynamic: true},
    {id: 'authMethod', type: 'auth-method', dynamic: true},
    {id: 'listAuthToken', type: 'auth-token', dynamic: true},
    {id: 'listAuthMethod', type: 'auth-method', dynamic: true},
    {id: 'get', type: 'get-method', dynamic: true},
    {id: 'put', type: 'put-method', dynamic: true},
    {id: 'append', type: 'append-method', dynamic: true},
    {id: 'head', type: 'head-method', dynamic: true},
    {id: 'list', type: 'list-method', dynamic: true},
    {id: 'filePathUrl', dynamic: true}
  ]
})

const cachedDrivers = {}
const methodToAction = method => method === 'GET' || method === 'HEAD' ? 'read' : 'write'
const notifyInternalActivity = (url, opts, ctx) => { if (ctx.vars.doNotUpdateRoomActivity) return }

async function getDBDriver(url, ctx) {
  const { dbLogger, forceGCS } = ctx.vars
  const host = ctx.vars.dbHost || (coreUtils.isNode ? 'node' : 'browser')
  const dbFromCtx = runtimeDb(ctx)
  const onLiveRepo = ctx.vars.onLiveRepo
  const hasGcp = ctx.vars.hasGcpIdentity ?? await auth.hasGcpIdentity(ctx)
  const extracted = url ? extractFromUrl(url, ctx) : {}
  const isPublicBucket = extracted?.scope?.bucket === wonderBucketName
  // public-bucket READS go anonymous-HTTPS (GCS.node.publicGCS) — no token mint, no SDK ctor → 0 init (key on cloud).
  const isPublicRead = isPublicBucket && methodToAction((ctx.vars.opts?.method || ctx.vars.method || 'GET').toUpperCase()) === 'read'
  const db = extracted.db || ctx.vars.db || (isPublicBucket ? 'gcs' : dbFromCtx) || 'gcs'
  const dbNormalized = forceGCS ? 'gcs' : db === 'local' ? 'fs' : db.replace(/-/g, '')
  const scopeId = extracted?.scope?.id
  const store = dsls.wonder['object-store'][dbNormalized]?.$runWithCtx(ctx)

  if (dbNormalized === 'fullFileCache')
    return coreUtils.globalsOfType(dsls.wonder['db-driver']).find(d => d.id === 'fullFileCache')

  const categories = {
    [host]: true, [dbNormalized]: true, [scopeId?.toLowerCase()]: true,
    ...Object.fromEntries((store?.categories || []).map(category => [category.toLowerCase(), true])),
    ...(onLiveRepo && {liverepo: true}),
    ...(hasGcp && {gcpidentity: true}),
    ...(isPublicBucket && {publicgcs: true, public: true}),
    ...(hasGcp && {identity: true}),
    ...(scopeId === 'signedRoom' && {signedroom: true}),
    ...((scopeId === 'logs' || scopeId === 'roomLogs') && {logs: true}),
    ...(scopeId === 'analytics' && {allowstreaming: true}),
    ...ctx.vars.categories
  }
  const allDrivers = coreUtils.globalsOfType(dsls.wonder['db-driver'])
  const cacheKey = Object.keys(categories).sort().join('.')
  if (cachedDrivers[cacheKey]) {
    dbLogger?.info?.({ t: 'DB driver selection cache hit', driverId: cachedDrivers[cacheKey].id,
      db: dbNormalized, categories: Object.keys(categories) }, {}, { ctx })
    return cachedDrivers[cacheKey]
  }

  const scored = allDrivers.map(d => {
    const parts = d.id.split('.').map(c => c.toLowerCase())
    const matchingCategories = parts.filter(c => categories[c]).length
    // db local/fs is always an explicit request — it beats the scheme's scope-named driver (signedRoom://x with db local → local files, not signing)
    const explicitDb = /^\w+:[^/]+\/\//.test(url)
    const scopeMatch = parts.length === 1 && scopeId === d.id && dbNormalized !== 'fs' && !explicitDb ? 1 : 0
    const hasIdentityToken = parts.includes('gcpidentity') ? 1 : 0
    const hasCorsToken = parts.includes('gcshttpblockedbycors') ? 1 : 0
    const hasPublicToken = isPublicRead && parts.includes('publicgcs') ? 1 : 0   // public read → win over gcpidentity (anonymous HTTPS, 0 init)
    return { d, parts, missing: parts.filter(c => !categories[c]), match: parts.every(c => categories[c]), matchingCategories,
      scopeMatch, hasIdentityToken, hasCorsToken, hasPublicToken, exactness: -parts.length }
  })
  const driver = scored.filter(x => x.match)
    .sort((a, b) => b.scopeMatch - a.scopeMatch || b.matchingCategories - a.matchingCategories || b.hasPublicToken - a.hasPublicToken
      || b.hasCorsToken - a.hasCorsToken || b.hasIdentityToken - a.hasIdentityToken || b.exactness - a.exactness)[0]?.d
  const winner = scored.find(candidate => candidate.d === driver)

  if (!driver) {   // teach a future LLM: every driver needs ALL its tokens in the bag. show the closest misses + the exact token each lacked
    const nearMisses = scored.filter(x => x.matchingCategories).sort((a, b) => b.matchingCategories - a.matchingCategories).slice(0, 3)
      .map(x => ({ id: x.d.id, lacks: x.missing }))
    dbLogger?.error?.({ t: 'No DB driver matched', url, categories: Object.keys(categories), nearMisses }, {}, { ctx })
  }

   const requestedDb = (ctx.vars.db || '').replace(/-/g, '')
  const dbIgnored = requestedDb && driver && !driver.id.toLowerCase().split('.').includes(requestedDb)
  dbLogger?.info?.({ t: 'Selected DB driver', driverId: driver?.id, url, bucket: extracted?.scope?.bucket, categories: Object.keys(categories),
    reason: winner && { requiredCategories: winner.parts, matchingCategoryCount: winner.matchingCategories,
      scopeMatch: !!winner.scopeMatch, matchingDrivers: scored.filter(candidate => candidate.match).map(candidate => candidate.d.id) },
    ...(dbIgnored && { dbIgnored, requestedDb, schemeForced: scopeId }) }, {}, { ctx })
  return cachedDrivers[cacheKey] = driver
}

async function wfetch2(_url, opts, _ctx) {
  const localServer = localhostServer(_ctx)
  const dbLogger = _ctx.vars.dbLogger
  const etlStatus = t => _ctx.vars.etlLogger?.status?.(t)
  let ctx = _ctx.setVars({ url: _url, opts, dbLogger, localhostServer: localServer })
  try {

  const interceptors = coreUtils.globalsOfType(dsls.wonder['db-driver-interceptor'])
  const url = await interceptors.filter(i=>i.transformUrl.profile).reduce(
    async (accP, i) => {
      const acc = await accP
      const r = await i.transformUrl(ctx.setVars({ url: acc }))
      dbLogger?.info?.({ t: 'transformUrl', interceptor: i.id, from: acc, to: typeof r === 'string' ? r : acc }, { returned: r }, { ctx })
      return typeof r === 'string' ? r : acc
    },
    Promise.resolve(_url)
  )

  const extracted = extractFromUrl(url, ctx)
  const explicitDb = /^\w+:[^/]+\/\//.test(url), runtimeDbValue = runtimeDb(ctx)
  const rawDb = extracted.db || runtimeDbValue || 'gcs'
  const db = ctx.vars.forceGCS ? 'gcs' : rawDb === 'local' ? 'fs' : rawDb.replace(/-/g, '')
  const store = dsls.wonder['object-store'][db]?.$runWithCtx(ctx)
  const storeCtx = store?.enrichCtx ? await store.enrichCtx(ctx) : ctx
  const enrichCtxProfile = coreUtils.tgpProfileToJson(store?.enrichCtx.profile)
  const safeEnrichCtxProfile = enrichCtxProfile && JSON.parse(JSON.stringify(enrichCtxProfile, (key, value) => key === 'val' ? undefined : value))
  const storeVarNames = Object.keys(storeCtx.vars).filter(name => !(name in ctx.vars))
  const overriddenStoreVars = Object.keys(ctx.vars).filter(name => storeCtx.vars[name] !== ctx.vars[name])
  ctx = storeCtx.setVars({ ...ctx.vars, db, list: store?.list, revisionProtocol: store?.revisionProtocol,
    categories: { ...Object.fromEntries((store?.categories || []).map(category => [category, true])), ...ctx.vars.categories } })
  dbLogger?.info?.({ t: 'Object store resolved', db, source: ctx.vars.forceGCS ? 'forceGCS' : explicitDb ? 'wUrl'
    : _ctx.vars.db ? 'ctx.vars.db' : runtimeDbValue ? 'runtimeDb' : 'default', categories: store?.categories || [],
    enrichCtxProfile: safeEnrichCtxProfile, storeVarNames, overriddenStoreVars }, {}, { ctx })
  const { scope, roomId, userId, fileName, bucketName } = extracted
  // REST-standard: GET on a collection (trailing '/') = list; on a resource = get. No '.json' ext for a dir prefix.
  const isList = url.endsWith('/') && (opts.method || 'GET').toUpperCase() === 'GET'
  const ext = isList || fileName?.includes('.') ? '' : '.json'
  const rawPath = await calcPath(ctx, { scope, roomId, userId, fileName, db }) + ext
  const path = isList && !rawPath.endsWith('/') ? rawPath + '/' : rawPath

  let driverMethod = isList ? 'list' : (opts.method || 'GET').toLowerCase()
  driverMethod = driverMethod === 'post' ? 'append' : driverMethod

  // pre interceptors — short-circuit before driver selection
  const preCtx = ctx.setVars({ ...extracted, path, bucketName, driverMethod, method: opts.method })
  for (const i of interceptors.filter(i=>i.pre.profile)) {
    const res = await i.pre(preCtx)
    if (res) { dbLogger?.info?.({ t: 'interceptor pre short-circuit', interceptor: i.id, driverMethod, path }, {}, { ctx }); return res }
  }

  const driver = await getDBDriver(url, ctx)
  if (!driver) {
    const error = 'wfetch: can not find dbDriver'
    dbLogger?.error?.({ t: error }, {}, { ctx })
    return { ok: false, status: 500, statusText: error, text: async () => t, json: async () => ({ error }) }
  }

  let _gp = Date.now(); const _gms = () => { const d = Date.now() - _gp; _gp = Date.now(); return d }
  let curl = null
  let filePath = null
  const filePathUrl = isList ? null : await driver.filePathUrl(ctx.setVars({ path, bucketName, method: opts.method }))
  if (filePathUrl?.ok === false) return filePathUrl
  if (filePathUrl) curl = `curl "${filePathUrl}"`
  const filePathUrlMs = _gms()

  const driverParts = driver.id.split('.')

  if (driverParts.includes('FS') && driverParts.includes('node')) {
    const { resolve } = await import('path')
    filePath = resolve(await wonderRepoRoot(), `files/${path}`)
    curl = `cat ${filePath}`
  }
  const transportSetupMs = _gms()

  const driverCtx = ctx.setVars({ ...extracted, bucketName, filePath, curl, path, filePathUrl,
    driverId: driver.id, driverMethod, fileName, opts, method: opts.method, driver })
  const authTokenProvider = driverMethod === 'list' && driver.listAuthToken.profile ? driver.listAuthToken : driver.authToken
  const authMethodProvider = driverMethod === 'list' && driver.listAuthMethod.profile ? driver.listAuthMethod : driver.authMethod
  const authToken = authTokenProvider.profile ? await authTokenProvider(driverCtx) : { value: null, expired: () => false }
  const authMethod = authMethodProvider.profile ? await authMethodProvider(driverCtx) : { enrichRequest: fetchReq => fetchReq }
  const ctxToUse = driverCtx.setVars({ authToken, authMethod })
  const postCtx = ctxToUse
  for (const i of interceptors.filter(i=>i.post.profile)) {
    const res = await i.post(postCtx)
    if (res) {
      if (res.status != 302) return res
      const followed = await fetch(await authMethod.enrichRequest(new Request(bustCdnCache(res.headers.get('Location'))), authToken, ctxToUse))
      dbLogger?.info?.({ t: `${i.id} GET → 302 → fetched raw bytes`, interceptor: i.id, method: driverMethod,
        status: followed.status, bytes: followed.headers.get('content-length') }, { url, location: res.headers.get('Location') }, { ctx: ctxToUse })
      return followed
    }
  }
  const postInterceptorsMs = _gms()
  dbLogger?.info?.({ t: 'bucket auth ready', authToken: authTokenProvider.profile?.$?.id || 'anonymous',
    authMethod: authMethodProvider.profile?.$?.id || 'none', expired: authToken.expired(),
    endpoint: ctx.vars.bucketEndpoint, region: ctx.vars.bucketRegion }, {}, { ctx: ctxToUse })
  etlStatus?.(`${driverMethod.toUpperCase()} ${driver.id} ${path}`)
  dbLogger?.info?.({ t: 'running driver profile', filePathUrlMs, postInterceptorsMs, transportSetupMs }, {}, { ctx: ctxToUse })
  notifyInternalActivity(url, opts, ctxToUse)
  const res = await driver[driverMethod](ctxToUse)
  if (isList) return { ok: true, status: 200, json: async () => res }   // driver.list returns an array → wrap as a Response
  etlStatus?.(`${driverMethod.toUpperCase()} ${driver.id} ${path} → ${res?.status || '?'}`)
  if (driverMethod == 'get' && res?.status == 404) return notFoundResult
  // media HEAD = resolve: synthesize Content-Location (the resolved GCS url) onto the real HEAD response,
  // preserving its Last-Modified. resolveThumb / fullFileCachePopulate validate read Content-Location to get the url.
  if (driverMethod == 'head' && res?.ok) {
    const orig = res.headers.get.bind(res.headers)
    res.headers.get = h => h.toLowerCase() == 'content-location' ? filePathUrl : orig(h)
    dbLogger?.info?.({ t: 'media HEAD → Content-Location resolved', method: driverMethod,
      lastModified: res.headers.get('Last-Modified') }, { url, contentLocation: filePathUrl }, { ctx })
  }
  return res
  } catch (e) {
    coreUtils.logException(e, 'wfetch2 failed', { ctx, url: _url, method: opts?.method })
    return { ok: false, status: 500, text: async () => null, json: async () => null }
  }
}

Object.assign(wonderUtils, { getDBDriver, wfetch2 })

HeadMethod('whead.viaBucketApi', {
  impl: async (ctx, { filePathUrl, dbLogger, authToken, authMethod }) => {
    const fetchReq = new Request(bustCdnCache(filePathUrl), { headers: { range: 'bytes=0-0' } })
    const response = await fetch(await authMethod.enrichRequest(fetchReq, authToken, ctx))
    if (!response.ok && response.status !== 206) {
      dbLogger?.error?.({ t: 'HEAD failed' }, { filePathUrl }, { ctx, response })
      return response
    }
    const size = (response.headers.get('content-range') || '').split('/')[1] || response.headers.get('content-length')
    return { ok: true, status: 200, headers: { get: h => ({ 'last-modified': response.headers.get('last-modified'),
      'content-length': size }[h.toLowerCase()] ?? response.headers.get(h)) }, text: async () => null, json: async () => null }
  }
})

GetMethod('wget.viaBucketApi', {
  impl: async (ctx, { filePathUrl, dbLogger, authToken, authMethod }) => {
    const url = bustCdnCache(filePathUrl)
    const t0 = Date.now()
    const response = await fetch(await authMethod.enrichRequest(new Request(url), authToken, ctx))
    dbLogger?.info?.({ t: 'bucketRead', readMs: Date.now() - t0, status: response.status }, {}, { ctx })
    if (!response.ok) {
      if (response.status === 404)
        dbLogger?.info?.({ t: 'viaBucketApi GET 404',
          hint: 'anonymous read — object may exist but lack public-read ACL (SA could read it). check driver selection: publicGCS forces anonymous' },
        { url }, { ctx, response })
      else
        dbLogger?.error?.({ t: 'viaBucketApi GET failure' }, { url }, { ctx, response })
      return response
    }
    return response
  }
})

GetMethod('wget.viaGcsProxy', {
  impl: async (ctx, { dbLogger, bucketName, path }) => {
    const url = `${gcsProxyBase(ctx)}/gcs-proxy/${bucketName}/${path}?t=${Date.now()}`
    const response = await fetch(url, { headers: { 'Content-Type': 'application/json' } })
    if (!response.ok) {
      if (response.status == 404) dbLogger?.info?.({ t: 'viaGcsProxy GET 404' }, { url }, { ctx })
      else dbLogger?.error?.({ t: 'viaGcsProxy GET failure' }, { url }, { ctx, response })
      return response
    }
    dbLogger?.info?.({ t: 'viaGcsProxy GET', bytes: response.headers.get('content-length') }, { url }, { ctx })
    return response
  }
})

PutMethod('wput.viaGcsProxy', {
  impl: async (ctx, { dbLogger, bucketName, path, opts }) => {
    const url = `${gcsProxyBase(ctx)}/gcs-proxy/${bucketName}/${path}`
    const response = await fetch(url, { method: 'PUT', headers: opts.headers, body: opts.body })
    if (!response.ok) { dbLogger?.error?.({ t: 'viaGcsProxy PUT failure' }, { url }, { ctx, response }); return response }
    dbLogger?.info?.({ t: 'viaGcsProxy PUT' }, {}, { ctx })
    return successResult
  }
})

PutMethod('wput.viaBucketApi', {
  impl: async (ctx, { filePathUrl, dbLogger, opts, authToken, authMethod }) => {
    let response
    try {
      const headers = new Headers(opts.headers), localFile = headers.get('x-wonder-body') === 'localFile'
      headers.delete('x-wonder-body')
      const body = localFile ? (await import('fs')).createReadStream(opts.body) : opts.body
      const fetchReq = new Request(filePathUrl, { headers, method: 'PUT', body,
        ...(coreUtils.isNode && body?.pipe && { duplex: 'half' }) })
      response = await fetch(await authMethod.enrichRequest(fetchReq, authToken, ctx))
      await response.text()
    } catch (error) {
      coreUtils.logException(error, 'wput.viaBucketApi failed', { ctx, filePathUrl, response })
      return errorResultByException(error)
    }
    if (!response.ok) {
      dbLogger?.error?.({ t: 'viaBucketApi PUT failure' }, {}, { ctx, response })
      return response
    }
    dbLogger?.info?.({ t: 'viaBucketApi PUT' }, {}, { ctx, response })
    return successResult
  }
})

// append-method
AppendMethod('wappend.singleWriterGetPut', {
  params: [
    {id: 'get', type: 'get-method', dynamic: true, byName: true},
    {id: 'put', type: 'put-method', dynamic: true}
  ],
  impl: async (ctx, {dbLogger, opts}, {get, put}) => {
    try {      
      let existing = ''
      try {
        const resp = await get(ctx)
        if (resp.status != 404) existing = await resp.text()
      } catch (error) {
        dbLogger?.error?.({t: 'wappend.singleWriterGetPut get failed'}, {}, {ctx, error})
        return errorResultByException(error)
      }
      
      await put(ctx.setVars({opts: {...opts, body: existing + opts.body }}))
      return successResult
    } catch (error) {
      dbLogger?.error?.({t: `wappend.singleWriterGetPut put failed`}, {}, {ctx, error})
      return errorResultByException(error)
    }
  }
})

ListMethod('wlist.viaBucketApi', {
  impl: async (ctx, { dbLogger, list }) => {
    if (typeof list !== 'function') {
      dbLogger?.error?.({ t: 'wlist.viaBucketApi missing ObjectStore.list' }, {}, { ctx })
      return []
    }
    return list(ctx)
  }
})

// Same result contract as list.gcs but routes through /gcs-proxy on the same origin to bypass CORS in browser iframes.
ListMethod('wlist.viaGcsProxy', {
  impl: async (ctx, { dbLogger, bucketName, path }) => {
    const t0 = Date.now()
    const base = gcsProxyBase(ctx)
    const { items, dirs, pages, status, result } = await paginateGcsList(async pageToken => {
      const pageQuery = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
      const url = `${base}/gcs-proxy-api/storage/v1/b/${bucketName}/o?delimiter=%2F&prefix=${encodeURIComponent(path)}&maxResults=5000${pageQuery}`
      const res = await fetch(url)
      const data = res.ok ? await res.json() : { items: [], prefixes: [] }
      return { ...data, status: res.status }
    })
    dbLogger?.info?.({ t: 'wlist.viaGcsProxy', prefix: path, items: items.length, dirs: dirs.length, pages, ms: Date.now() - t0, status }, {}, { ctx })
    return result
  }
})

const { authToken, authMethod, whead, wlist, wappend, wget, wput } = ns

AppendMethod('wappend.bucketSingleWriterGetPut', {
  impl: wappend.singleWriterGetPut({ get: wget.viaBucketApi(), put: wput.viaBucketApi() }),
})

DbDriver('GCS.node.gcpIdentity', {
  impl: dbDriver({
    whenAndWhyToUse: 'Node GCS access with a minted OAuth token over the HTTP API.',
    designConcerns: 'one authenticated HTTP transport for every object operation; no storage SDK',
    authToken: authToken.gcpAccessToken(),
    authMethod: authMethod.bearer(),
    get: wget.viaBucketApi(),
    put: wput.viaBucketApi(),
    append: wappend.bucketSingleWriterGetPut(),
    head: whead.viaBucketApi(),
    list: wlist.viaBucketApi(),
    filePathUrl: '%$bucketEndpoint%/%$bucketName%/%$path%'
  })
})

DbDriver('GCS.node.publicGCS', {
  impl: dbDriver({
    whenAndWhyToUse: 'Node without GCP identity targeting a public bucket. Uses anonymous HTTP operations allowed by the bucket policy.',
    authToken: authToken.anonymous(),
    authMethod: authMethod.none(),
    get: wget.viaBucketApi(),
    put: wput.viaBucketApi(),
    head: whead.viaBucketApi(),
    list: wlist.viaBucketApi(),
    filePathUrl: (ctx, { path, bucketName }) => `${storagePrefix}/${bucketName}/${path}`
  })
})

DbDriver('GCS.browser', {
  impl: dbDriver({
    whenAndWhyToUse: 'We prefer our users to interact directly with gcs and not via our lambdas mostly for scalability reasons. hence they need to use http api',
    designConcerns: 'generation checks are unavailable, so this driver deliberately does not support append/patch.',
    authToken: authToken.anonymous(),
    authMethod: authMethod.none(),
    get: wget.viaBucketApi(),
    put: wput.viaBucketApi(),
    head: whead.viaBucketApi(),
    list: wlist.viaBucketApi(),
    filePathUrl: (ctx, { path, bucketName }) => `${storagePrefix}/${bucketName}/${path}`
  })
})

DbDriver('bucket.google.public', {
  impl: dbDriver({
    whenAndWhyToUse: 'Anonymous HTTP access to a public Google bucket.',
    authToken: authToken.anonymous(),
    authMethod: authMethod.none(),
    get: wget.viaBucketApi(),
    put: wput.viaBucketApi(),
    append: wappend.bucketSingleWriterGetPut(),
    head: whead.viaBucketApi(),
    list: wlist.viaBucketApi(),
    filePathUrl: '%$bucketEndpoint%/%$bucketName%/%$path%'
  })
})

DbDriver('bucket.google.identity', {
  impl: dbDriver({
    whenAndWhyToUse: 'Google bucket HTTP access with the runtime GCP identity.',
    authToken: authToken.gcpAccessToken(),
    authMethod: authMethod.bearer(),
    get: wget.viaBucketApi(),
    put: wput.viaBucketApi(),
    append: wappend.bucketSingleWriterGetPut(),
    head: whead.viaBucketApi(),
    list: wlist.viaBucketApi(),
    filePathUrl: '%$bucketEndpoint%/%$bucketName%/%$path%'
  })
})

DbDriver('GCS.browser.gcsHTTPBlockedByCORS', {
  impl: dbDriver({
    whenAndWhyToUse: 'Browser fetch to storage.googleapis.com fails because the GCS bucket CORS config',
    get: wget.viaGcsProxy(),
    put: wput.viaGcsProxy(),
    list: wlist.viaGcsProxy(),
    filePathUrl: (ctx, { path, bucketName }) => `${gcsProxyBase(ctx)}/gcs-proxy/${bucketName}/${path}`
  })
})

ListMethod('wlist.fullFileCache', {
  impl: async (ctx, { dbLogger, bucketName, path }) => {
    const fs = await import('fs/promises')
    const dir = fullFileCachePath(bucketName, path).replace(/\/$/, '')
    let entries = []
    try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch (e) {
      if (e.code !== 'ENOENT') coreUtils.logException(e, 'wlist.fullFileCache failed', { ctx, dir })
    }
    const items = entries.filter(e => e.isFile()).map(e => ({ name: `${path}${e.name}` }))
    const dirs = entries.filter(e => e.isDirectory()).map(e => ({ name: `${path}${e.name}/`, isDir: true }))
    dbLogger?.info?.({ t: 'wlist.fullFileCache', dir, items: items.length, dirs: dirs.length }, {}, { ctx })
    return [...dirs, ...items]
  }
})

DbDriver('fullFileCache', {
  impl: dbDriver({
    whenAndWhyToUse: 'Whole-file local mirror for non-Parquet, or for etls that need to scan the whole parquet',
    designConcerns: 'WARNING: Do not use for large GCS Parquet in lambda; whole-file downloads defeat colsCache range reads. Callers own population and freshness.',
    list: wlist.fullFileCache(),
    filePathUrl: (ctx, { path, bucketName }) => fullFileCachePath(bucketName, path)
  })
})

DbDriver('GCS.node.gcpIdentity.logs', {
  impl: dbDriver({
    whenAndWhyToUse: 'Write and list cloud logs through authenticated GCS HTTP APIs.',
    designConcerns: 'Object reads remain unsupported; this is a single-writer log repository.',
    authToken: authToken.gcpAccessToken(),
    authMethod: authMethod.bearer(),
    get: (ctx, { dbLogger }) => { dbLogger?.info?.({ t: 'GCS.node.gcpIdentity.logs can not read biglogs in cloud. only in localhost' }, {}, { ctx }) },
    put: wput.viaBucketApi(),
    append: wappend.bucketSingleWriterGetPut(),
    head: whead.viaBucketApi(),
    list: wlist.viaBucketApi(),
    filePathUrl: (ctx, { path, bucketName }) => `${storagePrefix}/${bucketName}/${path}`
  })
})

const dbDriverInterceptor = Component('dbDriverInterceptor', {
  type: 'db-driver-interceptor<wonder>',
  params: [
    {id: 'whenAndWhyToUse', as: 'text', byName: true},
    {id: 'designConcerns', as: 'text'},
    {id: 'transformUrl', dynamic: true},
    {id: 'pre', dynamic: true},
    {id: 'post', dynamic: true}
  ]
})

DbDriverInterceptor('jqPath', {
  impl: dbDriverInterceptor({
    pre: async (ctx, { url, dbLogger }) => {
      if (!/[?&]jq=/.test(url)) return null
      const [fileUrl, rawJqExp] = url.split(/[?&]jq=/)
      const jqExp = decodeURIComponent(rawJqExp)
      dbLogger?.info?.({ t: 'jqPath GET', jqExp }, { fileUrl }, { ctx })
      const res = await wfetch2(fileUrl, { method: 'GET' }, ctx)
      if (!res?.ok) return res
      const data = await res.json()
      const result = dsls.common.data.jq.$runWithCtx(ctx.setData(data), jqExp)
      dbLogger?.info?.({ t: 'jqPath GET result', items: result?.length }, { result }, { ctx })
      return { ok: true, status: 200, text: async () => JSON.stringify(result), json: async () => result }
    }
  })
})

AppendMethod('wappend.appendMultiUser', {
  description: 'Conflict-safe HTTP text append with conditional write and retry using ObjectStore.revisionProtocol.',
  params: [
    {id: 'maxAttempts', as: 'number', defaultValue: 5}
  ],
  impl: async (ctx, { dbLogger, opts, path, bucketName, driver, authToken, authMethod, revisionProtocol }, { maxAttempts }) => {
    if (!revisionProtocol) {
      dbLogger?.error?.({ t: 'appendMultiUser missing revisionProtocol', driverId: driver.id }, {}, { ctx })
      return { ok: false, status: 500, statusText: 'object store has no revision protocol',
        text: async () => '', json: async () => ({ error: 'object store has no revision protocol' }) }
    }
    const newText = opts.body
    const urlOf = operation => driver.filePathUrl(ctx.setVars({ path, bucketName, method: operation }))
    const started = Date.now()
    dbLogger?.info?.({ t: 'appendMultiUser start', maxAttempts, addedBytes: new TextEncoder().encode(newText).length }, {}, { ctx })

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const getRequest = new Request(await urlOf('GET'))
        const getResponse = await fetch(await authMethod.enrichRequest(getRequest, authToken, ctx))
        const exists = getResponse.status !== 404
        if (!getResponse.ok && exists) {
          dbLogger?.error?.({ t: 'appendMultiUser read failed', attempt,
            status: getResponse.status, statusText: getResponse.statusText }, {}, { ctx })
          return getResponse
        }
        const expectedRevision = exists ? getResponse.headers.get(revisionProtocol.responseHeader) : null
        if (exists && expectedRevision == null) {
          dbLogger?.error?.({ t: 'appendMultiUser missing response revision', attempt,
            responseHeader: revisionProtocol.responseHeader }, {}, { ctx })
          return { ok: false, status: 500, statusText: 'object response has no revision',
            text: async () => '', json: async () => ({ error: 'object response has no revision' }) }
        }
        const current = exists ? await getResponse.text() : ''
        const merged = current + newText
        dbLogger?.info?.({ t: 'appendMultiUser read', attempt, exists, expectedRevision,
          existingBytes: new TextEncoder().encode(current).length }, {}, { ctx })

        const headers = revisionProtocol.enrichHeaders({ 'content-type': 'application/x-ndjson' },
          { expectedRevision, createOnly: !exists })
        const putRequest = new Request(await urlOf('PUT'), {
          method: 'PUT', headers, body: merged
        })
        const putResponse = await fetch(await authMethod.enrichRequest(putRequest, authToken, ctx))
        const responseBody = await putResponse.text()
        if (revisionProtocol.isConflict(putResponse)) {
          dbLogger?.warning?.({ t: 'appendMultiUser conflict', attempt, expectedRevision,
            status: putResponse.status, retry: attempt < maxAttempts }, {}, { ctx })
          if (attempt < maxAttempts) continue
        }
        if (!putResponse.ok) {
          dbLogger?.error?.({ t: 'appendMultiUser write failed', attempt, status: putResponse.status,
            statusText: putResponse.statusText }, { responseBody }, { ctx })
          return { ok: false, status: putResponse.status, statusText: putResponse.statusText,
            text: async () => responseBody, json: async () => ({ error: responseBody }) }
        }
        dbLogger?.info?.({ t: 'appendMultiUser done', attempt, bytes: new TextEncoder().encode(merged).length,
          appendMs: Date.now() - started }, {}, { ctx })
        return successResult
      } catch (error) {
        coreUtils.logException(error, 'appendMultiUser failed', { ctx, attempt })
        dbLogger?.error?.({ t: 'appendMultiUser failed', attempt,
          appendMs: Date.now() - started, error: error.message }, {}, { ctx })
        return errorResultByException(error)
      }
    }
  }
})
