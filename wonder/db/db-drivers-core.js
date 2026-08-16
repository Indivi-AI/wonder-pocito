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
const { wresolve, successResult, errorResultByException, notFoundResult, bustCdnCache, gcsStorage, paginateGcsList, calcPath,
  extractFromUrl, wonderRepoRoot, isLocalFile, rawFileUtils, wcachePath } = wonderUtils

Data('wFetch', {
  description: ['Read & write room content. GET a file, PUT to overwrite, POST/PATCH to append/merge,',
    'or GET a trailing-"/" url to list. Wraps wfetch2 — same wUrl scheme, scopes and drivers.'].join(' '),
  params: [
    { id: 'url', as: 'string', dynamic: true, mandatory: true,
      description: 'wUrl: <scheme>://<roomId>/<dir>/<file>?user=<id>. room:// is public; signedRoom:// is protected' },
    { id: 'method', as: 'string', defaultValue: 'GET',
      description: 'GET (read/list) | PUT (overwrite) | POST (append array) | PATCH (merge object) | HEAD' },
    { id: 'body', dynamic: true, description: 'content to write: whole value, append items, or merge object' },
    { id: 'headers', as: 'object', defaultValue: {},
      description: 'extra headers. x-wonder-body=localFile makes body a server-side path to stream' },
    { id: 'stream', as: 'boolean', description: 'false (default) returns parsed json; true returns the raw Response (for binaries / large media)' },
    { id: 'isStaging', as: 'boolean', description: 'route signed-url to staging from MCP/dev' },
    { id: 'logger', as: 'string', description: 'comma-separated loggers to harvest. returns {result, ...harvestedLogs}; implies no stream' }
  ],
  impl: async (ctx, {}, { url, method, body, headers, stream, isStaging, logger }) => {
    const fetchCtx = coreUtils.ensureLoggers(logger, { ctx: ctx.setVars({ ...(isStaging && { isStaging }) }) })
    const res = await wfetch2(url(ctx), { method, headers, ...(body.profile ? { body: await body(ctx) } : {}) }, fetchCtx)
    const readBody = () => (method || 'GET').toUpperCase() === 'HEAD'
      ? { ok: res.ok, status: res.status, lastModified: res.headers?.get?.('last-modified'),
          contentLength: res.headers?.get?.('content-length'), contentLocation: res.headers?.get?.('content-location') }
      : res.json()
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

Scope('protected', {
  impl: scope({ db: 'amazon', bucket: 'wonder-rooms-585008076838', path: ['roomId','fileName'] })
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

Scope('codePackages', {
  impl: scope('wonder-code-packages', { path: ['fileName'] })
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

const DbBackend = TgpType('db-backend', 'wonder', { typescript: '{ categories, enrichCtx(ctx): Ctx }' })
const dbBackend = DbBackend('dbBackend', {
  params: [
    {id: 'categories', as: 'array'},
    {id: 'enrichCtx', type: 'ctx-enricher<tgp>', dynamic: true, defaultValue: sameCtx()}
  ],
  impl: (ctx, {}, backend) => backend
})

DbBackend('gcs', {
  impl: dbBackend({ categories: ['bucket', 'google', 'gcs'],
    enrichCtx: Var('bucketEndpoint', () => globalThis.WONDER_STORAGE_URL || globalThis.process?.env?.WONDER_STORAGE_URL
      || 'https://storage.googleapis.com') })
})

DbBackend('amazon', {
  impl: dbBackend({
    categories: ['bucket','s3','amazon'],
    enrichCtx: [
      Var('bucketEndpoint', 'https://s3.il-central-1.amazonaws.com'),
      Var('bucketRegion', 'il-central-1')
    ]
  })
})

DbBackend('minio', {
  impl: dbBackend({
    categories: ['bucket','s3','minio'],
    enrichCtx: [
      Var('bucketEndpoint', () => coreUtils.isNode ? globalThis.process?.env?.MINIO_ENDPOINT || 'http://127.0.0.1:9000'
        : globalThis.WONDER_STORAGE_URL || globalThis.process?.env?.MINIO_PUBLIC_ENDPOINT || 'http://127.0.0.1:9000'),
      Var('bucketRegion', () => globalThis.process?.env?.MINIO_REGION || 'us-east-1'),
      Var('bucketAccessKeyId', () => globalThis.process?.env?.MINIO_ACCESS_KEY),
      Var('bucketSecretAccessKey', () => globalThis.process?.env?.MINIO_SECRET_KEY)
    ]
  })
})

DbBackend('bucket', {
  impl: ctx => dsls.wonder['db-backend'][ctx.vars.bucketProvider || globalThis.WONDER_BUCKET_PROVIDER
    || globalThis.process?.env?.STORAGE_PROVIDER || (globalThis.process?.env?.MINIO_ENDPOINT ? 'minio' : 'gcs')].$runWithCtx(ctx)
})

DbBackend('fs', { impl: dbBackend({ categories: ['fs'] }) })
DbBackend('fsmem', { impl: dbBackend({ categories: ['fsmem'] }) })
DbBackend('wcache', { impl: dbBackend({ categories: ['wcache'] }) })

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

AuthToken('authToken.awsCredentials', {
  impl: async ctx => {
    if (!coreUtils.isNode) return { value: null, expired: () => false }
    const { bucketAccessKeyId: accessKeyId, bucketSecretAccessKey: secretAccessKey,
      bucketSessionToken: sessionToken, bucketCredentialsExpiresAt: expiresAt } = ctx.vars
    const value = accessKeyId ? { accessKeyId, secretAccessKey, sessionToken, expiration: expiresAt }
      : await (await import('@aws-sdk/credential-provider-node')).defaultProvider({ profile: ctx.vars.awsProfile })()
    return { value, expired: () => !!value.expiration && Date.now() >= new Date(value.expiration).getTime() }
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

AuthMethod('authMethod.awsSigV4', {
  impl: () => ({
    enrichRequest: async (fetchReq, authToken, ctx) => {
      if (!authToken.value) return fetchReq
      const { accessKeyId, secretAccessKey, sessionToken } = authToken.value
      const url = new URL(fetchReq.url), encoder = new TextEncoder(), subtle = globalThis.crypto.subtle
      const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, ch => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
      const hash = async value => new Uint8Array(await subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : value))
      const hmac = async (key, value) => new Uint8Array(await subtle.sign('HMAC',
        await subtle.importKey('raw', typeof key === 'string' ? encoder.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
        encoder.encode(value)))
      const hex = bytes => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
      const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''), date = amzDate.slice(0, 8)
      const region = ctx.vars.bucketRegion || 'us-east-1', scope = `${date}/${region}/s3/aws4_request`
      const headers = new Headers(fetchReq.headers), payloadHash = 'UNSIGNED-PAYLOAD'
      headers.set('x-amz-content-sha256', payloadHash); headers.set('x-amz-date', amzDate)
      if (sessionToken) headers.set('x-amz-security-token', sessionToken)
      const signedHeaders = ['host', ...(sessionToken ? ['x-amz-security-token'] : []), 'x-amz-content-sha256', 'x-amz-date']
      const canonicalHeaders = signedHeaders.map(name => `${name}:${name === 'host' ? url.host : headers.get(name).trim()}\n`).join('')
      const canonicalQuery = [...url.searchParams].map(([key, value]) => [encode(key), encode(value)])
        .sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue))
        .map(pair => pair.join('=')).join('&')
      const canonicalPath = url.pathname.split('/').map(part => encode(decodeURIComponent(part))).join('/')
      const canonical = [fetchReq.method, canonicalPath, canonicalQuery, canonicalHeaders, signedHeaders.join(';'), payloadHash].join('\n')
      const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, hex(await hash(canonical))].join('\n')
      const signingKey = await hmac(await hmac(await hmac(await hmac(`AWS4${secretAccessKey}`, date), region), 's3'), 'aws4_request')
      const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders.join(';')},`
        + ` Signature=${hex(await hmac(signingKey, stringToSign))}`
      headers.set('authorization', authorization)
      ctx.vars.dbLogger?.info?.({ t: 'bucket request authenticated', authMethod: 'awsSigV4',
        method: fetchReq.method, host: url.host, region, signedHeaders, hasSessionToken: !!sessionToken }, {}, { ctx })
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
    {id: 'get', type: 'get-method', dynamic: true},
    {id: 'put', type: 'put-method', dynamic: true},
    {id: 'append', type: 'append-method', dynamic: true},
    {id: 'head', type: 'head-method', dynamic: true},
    {id: 'list', type: 'list-method', dynamic: true},
    {id: 'storageApi', type: 'boolean<common>'},
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
  // Public bucket reads are anonymous: no token mint or SDK startup.
  const isPublicRead = isPublicBucket && methodToAction((ctx.vars.opts?.method || ctx.vars.method || 'GET').toUpperCase()) === 'read'
  const db = extracted.db || ctx.vars.db || (isPublicBucket ? 'bucket' : dbFromCtx) || 'bucket'
  const dbNormalized = forceGCS ? 'gcs' : db === 'local' ? 'fs' : db.replace(/-/g, '')
  const scopeId = extracted?.scope?.id
  const backend = dsls.wonder['db-backend'][dbNormalized]?.$runWithCtx(ctx)

  if (dbNormalized === 'wcache')
    return coreUtils.globalsOfType(dsls.wonder['db-driver']).find(d => d.id === 'wcache')

  const categories = {
    [host]: true, [dbNormalized]: true,
    ...Object.fromEntries((backend?.categories || []).map(category => [category.toLowerCase(), true])),
    ...(onLiveRepo && {liverepo: true}),
    ...(hasGcp && {gcpidentity: true}),
    ...(isPublicRead && {publicgcs: true, public: true}),
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
  const rawDb = extracted.db || runtimeDbValue || 'bucket'
  const db = ctx.vars.forceGCS ? 'gcs' : rawDb === 'local' ? 'fs' : rawDb.replace(/-/g, '')
  const backend = dsls.wonder['db-backend'][db]?.$runWithCtx(ctx)
  const backendCtx = backend?.enrichCtx ? await backend.enrichCtx(ctx) : ctx
  const enrichCtxProfile = coreUtils.tgpProfileToJson(backend?.enrichCtx.profile)
  const safeEnrichCtxProfile = enrichCtxProfile && JSON.parse(JSON.stringify(enrichCtxProfile, (key, value) => key === 'val' ? undefined : value))
  const backendVarNames = Object.keys(backendCtx.vars).filter(name => !(name in ctx.vars))
  const overriddenBackendVars = Object.keys(ctx.vars).filter(name => backendCtx.vars[name] !== ctx.vars[name])
  ctx = backendCtx.setVars({ ...ctx.vars, db,
    categories: { ...Object.fromEntries((backend?.categories || []).map(category => [category, true])), ...ctx.vars.categories } })
  dbLogger?.info?.({ t: 'DB backend resolved', db, source: ctx.vars.forceGCS ? 'forceGCS' : explicitDb ? 'wUrl'
    : _ctx.vars.db ? 'ctx.vars.db' : runtimeDbValue ? 'runtimeDb' : 'default', categories: backend?.categories || [],
    enrichCtxProfile: safeEnrichCtxProfile, backendVarNames, overriddenBackendVars }, {}, { ctx })
  const { scope, roomId, userId, fileName, bucketName } = extracted
  // REST-standard: GET on a collection (trailing '/') = list; on a resource = get. No '.json' ext for a dir prefix.
  const isList = url.endsWith('/') && (opts.method || 'GET').toUpperCase() === 'GET'
  const ext = isList || fileName?.includes('.') ? '' : '.json'
  const rawPath = await calcPath(ctx, { scope, roomId, userId, fileName, db }) + ext
  const path = isList && !rawPath.endsWith('/') ? rawPath + '/' : rawPath

  let driverMethod = isList ? 'list' : (opts.method || 'GET').toLowerCase()
  driverMethod = driverMethod == 'post' || driverMethod == 'patch' ? 'append' : driverMethod

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
  let gcsFile = null, filePath = null
  const filePathUrl = isList ? null : await driver.filePathUrl(ctx.setVars({ path, bucketName, method: opts.method }))
  if (filePathUrl?.ok === false) return filePathUrl
  if (filePathUrl) curl = `curl "${filePathUrl}"`
  const filePathUrlMs = _gms()

  const postCtx = preCtx.setVars({ filePathUrl })
  for (const i of interceptors.filter(i=>i.post.profile)) {
    const res = await i.post(postCtx)
    if (res) {
      if (res.status != 302) return res
      const followed = await fetch(bustCdnCache(res.headers.get('Location')))
      dbLogger?.info?.({ t: `${i.id} GET → 302 → fetched bytes direct from GCS`, interceptor: i.id, method: driverMethod,
        status: followed.status, bytes: followed.headers.get('content-length') }, { url, location: res.headers.get('Location') }, { ctx })
      return followed
    }
  }

  const postInterceptorsMs = _gms()
  const driverParts = driver.id.split('.')

  if (driver.storageApi)
    gcsFile = (await (ctx.vars.nativeGcsAuth ? auth.gcpStorage(ctx, { native: true }) : gcsStorage(ctx))).bucket(bucketName).file(path)
  if (driverParts.includes('FS') && driverParts.includes('node')) {
    const { resolve } = await import('path')
    filePath = resolve(await wonderRepoRoot(), `files/${path}`)
    curl = `cat ${filePath}`
  }
  const transportSetupMs = _gms()

  const driverCtx = ctx.setVars({ ...extracted, bucketName, filePath, gcsFile, curl, path, filePathUrl,
    driverId: driver.id, fileName, opts, method: opts.method, driver })
  const authToken = driver.authToken.profile ? await driver.authToken(driverCtx) : { value: null, expired: () => false }
  const authMethod = driver.authMethod.profile ? await driver.authMethod(driverCtx) : { enrichRequest: fetchReq => fetchReq }
  const ctxToUse = driverCtx.setVars({ authToken, authMethod })
  dbLogger?.info?.({ t: 'bucket auth ready', authToken: driver.authToken.profile?.$?.id || 'anonymous',
    authMethod: driver.authMethod.profile?.$?.id || 'none', expired: authToken.expired(),
    endpoint: ctx.vars.bucketEndpoint, region: ctx.vars.bucketRegion }, {}, { ctx: ctxToUse })
  etlStatus?.(`${driverMethod.toUpperCase()} ${driver.id} ${path}`)
  dbLogger?.info?.({ t: 'running driver profile', filePathUrlMs, postInterceptorsMs, transportSetupMs }, {}, { ctx: ctxToUse })
  notifyInternalActivity(url, opts, ctxToUse)
  const res = await driver[driverMethod](ctxToUse)
  if (isList) return { ok: true, status: 200, json: async () => res }   // driver.list returns an array → wrap as a Response
  etlStatus?.(`${driverMethod.toUpperCase()} ${driver.id} ${path} → ${res?.status || '?'}`)
  if (driverMethod == 'get' && res?.status == 404) return notFoundResult
  // media HEAD = resolve: synthesize Content-Location (the resolved GCS url) onto the real HEAD response,
  // preserving its Last-Modified. resolveThumb / wcachePopulate validate read Content-Location to get the url.
  if (driverMethod == 'head' && res?.ok && rawFileExts.test(path)) {
    const orig = res.headers.get.bind(res.headers)
    res.headers.get = h => h.toLowerCase() == 'content-location' ? filePathUrl : orig(h)
    dbLogger?.info?.({ t: 'media HEAD → Content-Location resolved', method: driverMethod,
      lastModified: res.headers.get('Last-Modified') }, { url, contentLocation: filePathUrl }, { ctx })
  }
  if (driverMethod == 'get' && res?.json && res.ok) {
    const origJson = res.json
    res.json = async () => {
      const data = await origJson()
      if (Array.isArray(data)) data[Symbol.for('bigData')] = url
      return data
    }
  }
  return res
  } catch (e) {
    coreUtils.logException(e, 'wfetch2 failed', { ctx, url: _url, method: opts?.method })
    return { ok: false, status: 500, text: async () => null, json: async () => null }
  }
}

Object.assign(wonderUtils, { getDBDriver, wfetch2 })

HeadMethod('whead.GcsJSApi', {
  impl: async (ctx, { dbLogger, gcsFile }) => {
    try {
      const _t0 = Date.now()
      const [metadata] = await gcsFile.getMetadata()
      const lastModified = metadata.updated
      const size = Number(metadata.size || 0)
      dbLogger?.info?.({ t: 'GCS HEAD', lastModified, size, getMetadataMs: Date.now() - _t0 }, {}, { ctx })
      return { ok: true, status: 200, headers: {
          get: (h) => ({ 'last-modified': lastModified, 'content-length': size }[h.toLowerCase()]) },
        text: async () => null, json: async () => null
      }
    } catch (error) {
      if (error.code === 404)
        return notFoundResult
      coreUtils.logException(error, 'GCS HEAD failed', { ctx })
      return errorResultByException(error)
    }
  }
})

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

GetMethod('wget.GcsJSApi', {
  impl: async (ctx, { dbLogger, gcsFile }) => {
    try {
      const [buf] = await gcsFile.download()
      const txt = buf.toString('utf8')
      dbLogger?.info?.({ t: 'GCS GET result', status: 200, bytes: txt.length }, { txt: txt.slice(0, 20000) }, { ctx })
      return {
        ok: true, status: 200, text: async () => txt, json: async () => {
          try {
            return JSON.parse(txt).content
          } catch (error) {
            coreUtils.logException(error, 'GCS GET json parse failed', { ctx, txt })
            return errorResultByException(error)
          }
        }
      }
    } catch (error) {
      if (error.code === 404) {
        dbLogger?.info?.({ t: 'GCS GET 404' }, {}, { ctx })
        return notFoundResult
      }
      coreUtils.logException(error, 'GCS GET failed', { ctx })
      return errorResultByException(error)
    }
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

    let data
    try { data = await response.json() } catch(e) {
      coreUtils.logException(e, 'viaBucketApi GET json parse failed', { ctx, status: response.status, url })
      return { ok: false, status: 500, text: async () => null, json: async () => null }
    }

    const content = data.content
    dbLogger?.info?.({ t: 'viaBucketApi GET parsed', contentKind: Array.isArray(content) ? 'array' : typeof content,
      items: Array.isArray(content) ? content.length : content && typeof content === 'object' ? Object.keys(content).length : null },
    { url }, { ctx })
    return { ok: true, status: 200, text: async () => JSON.stringify(content), json: async () => content }
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
    const data = await response.json()
    dbLogger?.info?.({ t: 'viaGcsProxy GET', bytes: JSON.stringify(data).length }, { url, data }, { ctx })
    return { ok: true, status: 200, text: async () => JSON.stringify(data.content), json: async () => data.content }
  }
})

PutMethod('wput.viaGcsProxy', {
  impl: async (ctx, { dbLogger, bucketName, path, opts }) => {
    const url = `${gcsProxyBase(ctx)}/gcs-proxy/${bucketName}/${path}`
    const jsonStr = JSON.stringify({ content: opts.body })
    const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: jsonStr })
    if (!response.ok) { dbLogger?.error?.({ t: 'viaGcsProxy PUT failure' }, { url }, { ctx, response }); return response }
    dbLogger?.info?.({ t: 'viaGcsProxy PUT', bytes: jsonStr.length }, {}, { ctx })
    return successResult
  }
})

PutMethod('wput.GcsJSApi', {
  impl: async (ctx, { dbLogger, opts, gcsFile, bucketName, path, etlLogger }) => {
    const etlStatus = t => etlLogger?.status?.(t)
    try {
      const jsonStr = JSON.stringify({ content: opts.body })
      const totalBytes = Buffer.byteLength(jsonStr)
      const mb = (totalBytes / 1e6).toFixed(1)
      dbLogger?.info?.({ t: 'wput.GcsJSApi start', bucketName, path, bytes: totalBytes }, {}, { ctx })
      const stream = gcsFile.createWriteStream({ contentType: 'application/json', resumable: totalBytes > 5e6 })
      const CHUNK = 256 * 1024
      await new Promise((resolve, reject) => {
        stream.on('error', reject)
        stream.on('finish', resolve)
        const writeNext = (i) => {
          if (i >= jsonStr.length) return stream.end()
          const ok = stream.write(jsonStr.slice(i, i + CHUNK))
          etlStatus?.(`uploading ${path} ${Math.round(Math.min(i + CHUNK, jsonStr.length) / totalBytes * 100)}% of ${mb}MB`)
          ok ? writeNext(i + CHUNK) : stream.once('drain', () => writeNext(i + CHUNK))
        }
        writeNext(0)
      })
      dbLogger?.info?.({ t: 'wput.GcsJSApi', status: 200, bytes: totalBytes }, {}, { ctx })
      return successResult
    } catch (error) {
      coreUtils.logException(error, 'wput.GcsJSApi failed', { ctx, bucketName, path })
      return errorResultByException(error)
    }
  }
})

PutMethod('wput.viaBucketApi', {
  impl: async (ctx, { filePathUrl, dbLogger, opts, authToken, authMethod }) => {
    const jsonStr = JSON.stringify({ content: opts.body })
    const curl = `curl -X PUT -H "Content-Type: application/json" -d '${jsonStr}' "${filePathUrl}"`
    let response, jsonRes
    try {
      const fetchReq = new Request(filePathUrl, { headers: { 'Content-Type': 'application/json' }, method: 'PUT', body: jsonStr })
      response = await fetch(await authMethod.enrichRequest(fetchReq, authToken, ctx))
      await response.text()
    } catch (error) {
      coreUtils.logException(error, 'wput.viaBucketApi failed', { ctx, filePathUrl, curl, response })
      return errorResultByException(error)
    }
    if (!response.ok) {
      dbLogger?.error?.({ t: 'viaBucketApi PUT failure', bytes: jsonStr.length }, { curl }, { ctx, response })
      return response
    }
    dbLogger?.info?.({ t: 'viaBucketApi PUT', bytes: jsonStr.length }, {}, { ctx, response })
    return successResult
  }
})

// append-method
AppendMethod('wappend.GcsJSApiWithGenerationCheck', {
  impl: async (ctx, { dbLogger, opts, gcsFile, curl, method }) => {
    if (!gcsFile) {
      dbLogger?.error?.({ t: `wappend.GcsJSApiWithGenerationCheck - null gcsFile object`}, { curl}, { ctx })
      return errorResultByException('null gcsFile object')
    }
    const emptyObj = method == 'PATCH' ? {} : []
    const newItems = opts.body

    const maxRetries = 5
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      let existing = emptyObj, generation = 0

      try {
        const [metadata] = await gcsFile.getMetadata()
        generation = Number(metadata?.generation || 0)

        const [buf] = await gcsFile.download()
        const txt = buf.toString('utf8')
        existing = txt ? JSON.parse(txt).content : existing
        dbLogger?.info?.({ t: `wappend.GcsJSApiWithGenerationCheck GET`, itemsCount: Object.keys(existing).length, attempt }, { curl }, { ctx })
      } catch (error) {
        if (error.code !== 404) coreUtils.logException(error, 'wappend.GcsJSApiWithGenerationCheck read failed', { ctx, attempt, generation, curl })
        generation = 0
      }
      const merged = method == 'PATCH' ? { ...existing, ...newItems } : [...existing, ...newItems]

      try {
        const body = JSON.stringify({ content: merged }, null, 2)
        await gcsFile.save(body, { contentType: 'application/json', resumable: body.length > 5e6, preconditionOpts: { ifGenerationMatch: generation || 0 } })
        dbLogger?.info?.({ t: `wappend.GcsJSApiWithGenerationCheck SAVE`, itemsCount: merged.length, attempt }, { newItems }, { ctx })
        return successResult
      } catch (error) {
        if ((error.code == 409 || error.code == 412) && attempt < maxRetries - 1) {
          dbLogger?.warning?.({ t: `wappend.GcsJSApiWithGenerationCheck generation mismatch - retrying`, attempt, generation }, {}, { ctx })
        } else {
          coreUtils.logException(error, 'wappend.GcsJSApiWithGenerationCheck failed permanently', { ctx, attempt })
          return errorResultByException(error)
        }
      }
    }
    dbLogger?.error?.({ t: `wappend.GcsJSApiWithGenerationCheck failed after max retries`, attempt }, {}, { ctx, error })
    return {
      ok: false, status: 500, text: async () => `wappend.GcsJSApiWithGenerationCheck failed after max retries`,
      json: async () => ({ error: `wappend.GcsJSApiWithGenerationCheck failed after max retries` })
    }
  }
})

AppendMethod('wappend.getAndPut', {
  impl: async (ctx, { dbLogger, opts, path, bucketName, driver, authToken, authMethod }) => {
    const method = (opts.method || 'POST').toUpperCase()
    const newItems = opts.body
    try {
      const urlOf = operation => driver.filePathUrl(ctx.setVars({ path, bucketName, method: operation }))
      const getReq = new Request(await urlOf('GET'), { headers: { 'Content-Type': 'application/json' } })
      const res = await fetch(await authMethod.enrichRequest(getReq, authToken, ctx))
      const existing = res.ok ? (await res.json()).content : (method === 'PATCH' ? {} : [])
      dbLogger?.info?.({ t: 'wappend.getAndPut read', status: res.status,
        existingItems: Array.isArray(existing) ? existing.length : Object.keys(existing).length }, {}, { ctx })
      const merged = method === 'PATCH' ? { ...existing, ...newItems } : [...existing, ...newItems]
      const putReq = new Request(await urlOf('PUT'), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: merged })
      })
      const putRes = await fetch(await authMethod.enrichRequest(putReq, authToken, ctx))
      if (!putRes.ok) {
        dbLogger?.error?.({ t: 'wappend.getAndPut PUT failed', status: putRes.status }, {}, { ctx })
        return putRes
      }
      dbLogger?.info?.({ t: 'wappend.getAndPut success',
        items: Array.isArray(merged) ? merged.length : Object.keys(merged).length }, {}, { ctx })
      return successResult
    } catch (error) {
      coreUtils.logException(error, 'wappend.getAndPut failed', { ctx })
      return errorResultByException(error)
    }
  }
})

ListMethod('wlist.GcsJSApi', {
  impl: async (ctx, { dbLogger, bucketName, path }) => {
    const t0 = Date.now()
    const bucket = (await gcsStorage(ctx)).bucket(bucketName)
    const { items, dirs, pages, result } = await paginateGcsList(async pageToken => {
      const [files, nextQuery, apiResp] = await bucket.getFiles({ prefix: path, delimiter: '/', autoPaginate: false, maxResults: 5000, pageToken })
      return {
        items: files.map(f => ({ name: f.name, updated: f.metadata?.updated, size: f.metadata?.size })),
        prefixes: apiResp?.prefixes || [],
        nextPageToken: nextQuery?.pageToken
      }
    })
    dbLogger?.info?.({ t: 'wlist.GcsJSApi', prefix: path, items: items.length, dirs: dirs.length, pages, ms: Date.now() - t0 }, {}, { ctx })
    return result
  }
})

ListMethod('wlist.viaGoogleBucketApi', {
  impl: async (ctx, { dbLogger, bucketName, path, authToken, authMethod }) => {
    const t0 = Date.now()
    const { items, dirs, pages, status, result } = await paginateGcsList(async pageToken => {
      const pageQuery = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
      const endpoint = ctx.vars.bucketEndpoint || storagePrefix
      const url = `${endpoint}/storage/v1/b/${bucketName}/o?delimiter=%2F&prefix=${encodeURIComponent(path)}&maxResults=5000${pageQuery}`
      const res = await fetch(await authMethod.enrichRequest(new Request(url), authToken, ctx))
      const data = res.ok ? await res.json() : { items: [], prefixes: [] }
      return { ...data, status: res.status }
    })
    dbLogger?.info?.({ t: 'wlist.viaGoogleBucketApi', prefix: path, items: items.length,
      dirs: dirs.length, pages, ms: Date.now() - t0, status }, {}, { ctx })
    return result
  }
})

ListMethod('wlist.viaS3BucketApi', {
  impl: async (ctx, { dbLogger, bucketName, path, authToken, authMethod }) => {
    const t0 = Date.now()
    const endpoint = (ctx.vars.bucketEndpoint || 'https://s3.amazonaws.com').replace(/\/$/, '')
    const decodeXml = text => text.replace(/&(?:amp|lt|gt|quot|apos);/g,
      entity => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[entity])
    const valueOf = (xml, tag) => decodeXml(xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] || '')
    const result = []
    let continuationToken, pages = 0, status = 200
    do {
      const query = new URLSearchParams({ 'list-type': '2', delimiter: '/', prefix: path })
      if (continuationToken) query.set('continuation-token', continuationToken)
      const fetchReq = new Request(`${endpoint}/${bucketName}?${query}`)
      const res = await fetch(await authMethod.enrichRequest(fetchReq, authToken, ctx))
      status = res.status
      const xml = res.ok ? await res.text() : ''
      for (const match of xml.matchAll(/<CommonPrefixes>([\s\S]*?)<\/CommonPrefixes>/g))
        result.push({ name: valueOf(match[1], 'Prefix'), isDir: true })
      for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g))
        result.push({ name: valueOf(match[1], 'Key'), updated: valueOf(match[1], 'LastModified'),
          size: Number(valueOf(match[1], 'Size')) || 0 })
      continuationToken = valueOf(xml, 'NextContinuationToken') || null
      pages++
    } while (continuationToken)
    dbLogger?.info?.({ t: 'wlist.viaS3BucketApi', prefix: path, items: result.length, pages,
      ms: Date.now() - t0, status }, {}, { ctx })
    return result
  }
})

// Same as viaGoogleBucketApi but routes through /gcs-proxy on the same origin to bypass CORS in browser iframes.
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

const { authToken, authMethod, wget, wput, wappend, whead, wlist } = ns

DbDriver('GCS.node.gcpIdentity', {
  impl: dbDriver({
    whenAndWhyToUse: 'Fastest path: node with GCP credentials (ADC/SA/metadata). Uses @google-cloud/storage SDK directly.',
    designConcerns: 'implement with @google-cloud/storage and not http because it is faster and supports generation check',
    get: wget.GcsJSApi(),
    put: wput.GcsJSApi(),
    append: wappend.GcsJSApiWithGenerationCheck(),
    head: whead.GcsJSApi(),
    list: wlist.GcsJSApi(),
    storageApi: true,
    filePathUrl: (ctx, { path, bucketName }) => `${storagePrefix}/${bucketName}/${path}`
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
    list: wlist.viaGoogleBucketApi(),
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
    list: wlist.viaGoogleBucketApi(),
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
    append: wappend.getAndPut(),
    head: whead.viaBucketApi(),
    list: wlist.viaGoogleBucketApi(),
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
    append: wappend.getAndPut(),
    head: whead.viaBucketApi(),
    list: wlist.viaGoogleBucketApi(),
    filePathUrl: '%$bucketEndpoint%/%$bucketName%/%$path%'
  })
})

DbDriver('bucket.amazon', {
  impl: dbDriver({
    whenAndWhyToUse: 'Amazon S3 HTTP access with AWS Signature Version 4.',
    authToken: authToken.awsCredentials(),
    authMethod: authMethod.awsSigV4(),
    get: wget.viaBucketApi(),
    put: wput.viaBucketApi(),
    append: wappend.getAndPut(),
    head: whead.viaBucketApi(),
    list: wlist.viaS3BucketApi(),
    filePathUrl: '%$bucketEndpoint%/%$bucketName%/%$path%'
  })
})

DbDriver('bucket.minio', {
  impl: dbDriver({
    whenAndWhyToUse: 'S3-compatible bucket inside an air-gapped environment.',
    authToken: authToken.awsCredentials(),
    authMethod: authMethod.awsSigV4(),
    get: wget.viaBucketApi(),
    put: wput.viaBucketApi(),
    append: wappend.getAndPut(),
    head: whead.viaBucketApi(),
    list: wlist.viaS3BucketApi(),
    filePathUrl: '%$bucketEndpoint%/%$bucketName%/%$path%'
  })
})

DbDriver('bucket.minio.public', {
  impl: dbDriver({
    whenAndWhyToUse: 'Anonymous object access to a public MinIO bucket; listing is intentionally unavailable.',
    authToken: authToken.anonymous(),
    authMethod: authMethod.none(),
    get: wget.viaBucketApi(),
    put: wput.viaBucketApi(),
    append: wappend.getAndPut(),
    head: whead.viaBucketApi(),
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

ListMethod('wlist.wcache', {
  impl: async (ctx, { dbLogger, bucketName, path }) => {
    const fs = await import('fs/promises')
    const dir = wcachePath(bucketName, path).replace(/\/$/, '')
    let entries = []
    try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch (e) {
      if (e.code !== 'ENOENT') coreUtils.logException(e, 'wlist.wcache failed', { ctx, dir })
    }
    const items = entries.filter(e => e.isFile()).map(e => ({ name: `${path}${e.name}` }))
    const dirs = entries.filter(e => e.isDirectory()).map(e => ({ name: `${path}${e.name}/`, isDir: true }))
    dbLogger?.info?.({ t: 'wlist.wcache', dir, items: items.length, dirs: dirs.length }, {}, { ctx })
    return [...dirs, ...items]
  }
})

DbDriver('wcache', {
  impl: dbDriver({
    whenAndWhyToUse: 'Whole-file local mirror for non-Parquet, or for etls that need to scan the whole parquet',
    designConcerns: 'WARNING: Do not use for large GCS Parquet in lambda; whole-file downloads defeat colsCache range reads. Callers own population and freshness.',
    list: wlist.wcache(),
    filePathUrl: (ctx, { path, bucketName }) => wcachePath(bucketName, path)
  })
})

DbDriver('GCS.node.gcpIdentity.logs', {
  impl: dbDriver({
    whenAndWhyToUse: 'write logs on cloud; list also supported (read of object content not supported)',
    designConcerns: 'object read is not supported, but listing prefixes is safe and useful (e.g. for date-partitioned discovery via a trailing-slash GET)',
    get: (ctx, { dbLogger }) => { dbLogger?.info?.({ t: 'GCS.node.gcpIdentity.logs can not read biglogs in cloud. only in localhost' }, {}, { ctx }) },
    put: wput.GcsJSApi(),
    append: wappend.GcsJSApiWithGenerationCheck(),
    list: wlist.GcsJSApi(),
    storageApi: true,
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

const rawText = { csv: 'text/csv', tsv: 'text/tab-separated-values', jsonl: 'application/x-ndjson', mjs: 'application/javascript',
  js: 'application/javascript', html: 'text/html', css: 'text/css', txt: 'text/plain', md: 'text/markdown', svg: 'image/svg+xml', manifest: 'text/plain' }
const rawBinary = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', mp4: 'video/mp4',
  mov: 'video/quicktime', webm: 'video/webm', wav: 'audio/wav', mp3: 'audio/mpeg', m4a: 'audio/mp4', pdf: 'application/pdf', zip: 'application/zip',
  parquet: 'application/vnd.apache.parquet', 'tar.gz': 'application/gzip' }
const { mimeTypes, rawFileExts, isTextMime, rawFileBody } = rawFileUtils(rawText, rawBinary)

DbDriverInterceptor('rawFile', {
  impl: dbDriverInterceptor({
    whenAndWhyToUse: ['Raw media, document and tabular formats that must be stored and returned as their original bytes',
      'instead of the standard {content: value} JSON envelope.'].join(' '),
    designConcerns: ['Text string bodies are UTF-8; binary string bodies are base64. A server-side file path is accepted',
      'only with x-wonder-body=localFile.'].join(' '),
    pre: async (ctx, { url, driverMethod, dbLogger, path }) => {
      if ((extractFromUrl(url, ctx)?.db || '') !== 'fs') return null
      const { resolve, dirname } = await import('path')
      const fs = await import('fs')
      const filePath = resolve(await wonderRepoRoot(), `files/${path}`)
      const rawExt = path.match(rawFileExts)
      if (driverMethod === 'get') {
        if (!fs.existsSync(filePath)) return notFoundResult
        const buf = fs.readFileSync(filePath)
        dbLogger?.info?.({ t: 'rawFile fs GET', filePath, bytes: buf.length }, {}, { ctx })
        return { ok: true, status: 200, arrayBuffer: async () => buf, text: async () => buf.toString('utf8'), json: async () => JSON.parse(buf.toString('utf8')) }
      }
      if (driverMethod === 'put') {
        const opts = ctx.vars.opts, body = opts?.body, fromLocalFile = isLocalFile(body, opts)
        fs.mkdirSync(dirname(filePath), { recursive: true })
        if (fromLocalFile) fs.copyFileSync(body, filePath) // body is a server-side file path → copy, no heap buffering
        else if (rawExt) fs.writeFileSync(filePath, await rawFileBody(body, mimeTypes[rawExt[1].toLowerCase()] || 'application/octet-stream', opts)) // body is the payload bytes
        else fs.writeFileSync(filePath, typeof body === 'string' ? body : JSON.stringify(body, null, 2))
        dbLogger?.info?.({ t: 'rawFile fs PUT', filePath, bytes: fs.statSync(filePath).size, fromLocalFile }, {}, { ctx })
        return successResult
      }
      if (driverMethod === 'list') {   // list the local mirror dir → {name: path+entry} items, so wfetch2(dir/) lists on fs like the gcs drivers do
        const entries = fs.existsSync(filePath) ? fs.readdirSync(filePath, { withFileTypes: true }) : []
        const items = entries.map(e => ({ name: `${path}${e.name}${e.isDirectory() ? '/' : ''}`, isDir: e.isDirectory() }))
        dbLogger?.info?.({ t: 'rawFile fs LIST', filePath, items: items.length }, {}, { ctx })
        return { ok: true, status: 200, json: async () => items }
      }
    },
    post: async (ctx, { url, driverMethod, filePathUrl, opts, dbLogger, path, bucketName }) => {
      if (!rawFileExts.test(path) || (extractFromUrl(url, ctx)?.db || '').match(/^fs/)) return null
      if (driverMethod === 'get')
        return { status: 302, headers: { get: h => h.toLowerCase() === 'location' ? filePathUrl : null } }
      if (driverMethod === 'put') {
        const contentType = mimeTypes[path.match(rawFileExts)[1].toLowerCase()] || 'application/octet-stream'
        const body = opts.body, isFile = isLocalFile(body, opts)
        const fs = isFile ? await import('fs') : null
        const sendBody = isFile ? fs.createReadStream(body) : await rawFileBody(body, contentType, opts)
        const bytes = isFile ? fs.statSync(body).size : sendBody.length
        // encoding of a STRING body: text mimes (rawText) → utf8; binary mimes (rawBinary) → the string is base64 → decoded.
        // a text format missing from rawText would fall to base64 and CORRUPT (e.g. jsonl mangled as base64 before it was classified text).
        dbLogger?.info?.({ t: 'rawFile PUT', contentType, bytes, streamed: isFile, encoding: isFile ? 'stream' : isTextMime(contentType) ? 'utf8' : 'base64' }, {}, { ctx })
        const uploadStarted = Date.now()
        let status = 200
        if (!coreUtils.isNode) {
          const res = await fetch(filePathUrl, { method: 'PUT', headers: { 'content-type': contentType }, body: sendBody })
          status = res.status
          if (!res.ok) throw new Error(`rawFile PUT failed: ${res.status} ${await res.text()}`)
        } else {
          const { request } = await import('undici')
          const { channel } = await import('diagnostics_channel')
          const accessToken = await auth.gcpAccessToken(ctx, { method: 'PUT' }), accessTokenMs = Date.now() - uploadStarted
          const requestStarted = Date.now(), phases = {}, subscriptions = [], mark = phase => message => {
            if (!phases.request || !message.request || message.request === phases.request || phase === 'request') {
              phases[phase] = phase === 'request' ? message.request : Date.now() - requestStarted
            }
          }
          ;['request:create', 'client:beforeConnect', 'client:connected', 'request:bodySent', 'request:headers', 'request:trailers'].forEach(name => {
            const ch = channel(`undici:${name}`), handler = mark(name.split(':').at(-1))
            ch.subscribe(handler); subscriptions.push([ch, handler])
          })
          let responseBody
          try {
            const response = await request(`${storagePrefix}/${bucketName}/${path}`, { method: 'PUT',
              headers: { authorization: `Bearer ${accessToken}`, 'content-type': contentType }, body: sendBody })
            status = response.statusCode
            responseBody = await response.body.text()
          } finally {
            subscriptions.forEach(([ch, handler]) => ch.unsubscribe(handler))
          }
          delete phases.request
          dbLogger?.info?.({ t: 'rawFile PUT transport', transport: 'GcsHttpApi', accessTokenMs,
            ...phases, totalMs: Date.now() - requestStarted, status }, {}, { ctx })
          if (status >= 400) throw new Error(`rawFile PUT failed: ${status} ${responseBody}`)
        }
        dbLogger?.info?.({ t: 'rawFile PUT done', uploadMs: Date.now() - uploadStarted, status, bytes }, {}, { ctx })
        return successResult
      }
    }
  })
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
