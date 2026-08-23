// Room serving + running: the applet host page AND the room-gated, runs-as-user lambda/snippet runner.
// Every run = extract the code closure (ensureExtracted) → spawn node → run a TGP profile (runProfile).
// Two version namespaces, deliberately distinct:
//   lambdaV = a node code-closure tarball id (lambdas/<lambdaV>.tar.gz)   — server extracts & runs it.
//   appletV = a browser share-snapshot id (shared/<appletV>/…)            — the importmap points source there.
// Routes (each run has a twin -sse-progress variant: same auth+source, but streams progress over SSE then a 'done' message):
//  - POST /run-[signed-]room-lambda[-sse-progress]/:roomId/:name → run a public/signed room lambda AS THE USER.
//  - GET  /[signed-]room/:roomId/applet/:name → serve the matching public/signed applet host page inline.
import express from 'express'
import { jb, coreUtils } from '@jb6/core/index.js'
import '@jb6/core/misc/jb-remote-via-cli.js'   // runStrippedCli (stripCtx-aware server↔child run)
import { caller, roomPolicy, roleOf, canAccess } from './auth-utils.js'
import { readJson } from './signed-url.js'
import '@wonder/db/auth.js'
import '@wonder/db/db-drivers.js'
import { promises as fsp, existsSync } from 'fs'
import { spawn } from 'child_process'

const { storageEnvVars } = jb.wonderUtils
const storageProvider = () => process.env.STORAGE_PROVIDER || 'gcs'
const storageUrl = () => process.env.WONDER_STORAGE_URL
  || (storageProvider() === 'minio' && process.env.MINIO_ENDPOINT) || 'https://storage.googleapis.com'
const CLIENT_RUNTIME_WURL = 'clientCode:cloudflare//runtime/'
const jb6Pkgs = ['core','common','react','rx','jq','llm-guide','mcp','testing','repo','lang-service',
  'probe-studio']
const json = express.json({ limit: '1mb' })
const respond = (res, r) => res.status(r.error ? 500 : 200).json(r.error ? r : { result: r })
const extractionPromises = new Map()

// Applet host page
const APPLET_HOST_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Wonder Workspace</title>
<link rel="icon" type="image/svg+xml" href="_FAVICON_">
<link rel="apple-touch-icon" href="_APPLE_TOUCH_ICON_">
_OG_TAGS_
<style>
html,body{height:100%;margin:0;padding:0}
@keyframes dots{0%{content:''}33%{content:'.'}66%{content:'..'}100%{content:'...'}}
#loading{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#f4f3ef;
z-index:9999;font-family:system-ui;color:#666;font-size:14px}
#loading::after{content:'';animation:dots 1.5s infinite steps(1)}
</style>
</head><body>
<div id="loading">Loading...</div>
<script>Object.assign(globalThis, _CLIENT_ENV_)</script>
<script type="importmap">_IMPORT_MAP_</script>
<div id="root" style="height:100vh"></div>
<script type="module">
import '@jb6/react/lib/tailwindcss-3.4.17.js'
import { reactUtils } from '@jb6/react'
import { coreUtils } from '@jb6/core'
import { ensureLogin } from '@wonder/db/oauth2.js'
const appletSpec = _APPLET_SPEC_
reactUtils.loadLucid05()
const { urlsToLoad, roomWUrl } = appletSpec
const cmpId = new URLSearchParams(location.search).get('cmpId') || appletSpec.cmpId   // multi-comp applets navigate by ?cmpId=; def cmpId is the default
// Server noAuth (or ?noAuth) skips login only for room://; signed rooms ignore it.
const noAuth = (appletSpec.noAuth || new URLSearchParams(location.search).has('noAuth')) && roomWUrl?.startsWith('room://')
const root = document.getElementById('root')
if (appletSpec.liveRepo) await import('@wonder/db/room-lambda-live-repo.js')
const runAutomation = async mCtx => {
  window.jbLoggers = mCtx.vars
  if (new URLSearchParams(location.search).has('automation')) {
    await import('@jb6/react/automation.js')
    await reactUtils.startAutomation(mCtx, window)
  }
}
// extendCtxWithUrl seeds ctx-* query params (e.g. ?ctx-reportUrl=…) + loggers from the URL; then add react + the applet's roomWUrl.
const ctx = reactUtils.extendCtxWithUrl().setVars({ react: reactUtils, db: globalThis.WONDER_STORAGE_PROVIDER,
  bucketEndpoint: globalThis.WONDER_STORAGE_URL, ...(roomWUrl && { roomWUrl }), ...(noAuth && { noAuth: true }) })
const uiSource = appletSpec.liveRepo
  ? 'live-repo (localhost /jb6_packages, /wonder, /solution, /indiviai)'
  : 'appletV snapshot ' + appletSpec.appletV + ' (bucket share, NOT live-repo) - edit-to-live needs uploadRoomApplet'
ctx.vars.roomLogger?.info?.({ t: 'serve applet page', roomWUrl, cmpId, urlsToLoad,
  appletV: appletSpec.appletV, clientCodeWUrl: appletSpec.clientCodeWUrl, uiSource }, {}, { ctx })
document.getElementById('loading')?.remove()
// the lambda runner is gated per-user (runs AS the caller) ⇒ an anonymous applet silently gets no data. force login first (into #root).
// ensureLogin also completes the OAuth redirect (GOT_CODE) and returns true, so the host page renders the applet.
if (!noAuth && !await ensureLogin(ctx)) { await runAutomation(ctx) } else {
if (urlsToLoad) await Promise.all(urlsToLoad.split(',').map(f => import(f)))
const { reactCmp, ctx: cmpCtx } = await reactUtils.runOnHost(cmpId, ctx)
reactUtils.createRoot(root).render(reactUtils.h('div', {}, reactUtils.hh(cmpCtx, reactCmp)))
await runAutomation(cmpCtx)
}
</script></body></html>`

// link-preview branding: crawlers run no JS, so the shared applet card is chosen server-side. Resolved per-field, first-defined-wins:
// applet.og (applets/<name>.json) → room admin/branding.json → wonder.html defaults (wonder.svg favicon, "Wonder" title/og:image).
const ogDefaults = runtimeBase => ({
  favicon: `${runtimeBase}images/wonder.svg`,
  ogImage: `${runtimeBase}images/wonder.svg`,
  ogTitle: 'Wonder Workspace',
  ogDescription: 'A Wonder workspace applet',
  ogType: 'website'
})
const mergeBranding = (defaults, ...srcs) => Object.assign({}, defaults, ...srcs.map(s => s && Object.fromEntries(Object.entries(s).filter(([, v]) => v != null))))
const ogTags = b => [
  ['og:title', b.ogTitle], ['og:description', b.ogDescription], ['og:image', b.ogImage], ['og:type', b.ogType], ['og:url', b.ogUrl],
  ['og:image:width', '1200'], ['og:image:height', '630'], ['twitter:card', 'summary_large_image']
].filter(([, c]) => c).map(([p, c]) => `<meta property="${p}" content="${c}">`).join('')

// serveAppletPage: turn an appletSpec ({cmpId, urlsToLoad, roomWUrl, appletV, clientCodeWUrl, og}) into the inline page. appletV = the share
// snapshot id. jb6 + wonder SOURCE comes from the share; versioned React runtime files use the additive CDN directory.
// localImports = dev live-repo importmap (no upload).
export async function serveAppletPage(spec, res, localImports) {
  res.set({
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless'
  })
  const codeCtx = new coreUtils.Ctx().setVars(storageEnvVars({ forBrowser: true }))   // resolved urls are fetched by the BROWSER - public endpoint
  const runtimeBase = await jb.wonderUtils.wresolve(CLIENT_RUNTIME_WURL, codeCtx, 'GET')
  if (!localImports && !spec.clientCodeWUrl) throw new Error(`applet ${spec.cmpId} has no clientCodeWUrl; publish it again`)
  const shareBase = localImports ? '' : (await jb.wonderUtils.wresolve(spec.clientCodeWUrl, codeCtx, 'GET')).replace(/\/$/, '')
  const imports = localImports ? localImports : spec.clientCodeWUrl ? {
    ...Object.fromEntries(jb6Pkgs.flatMap(p => [
      [`@jb6/${p}`, `${shareBase}/jb6/${p}/index.js`], [`@jb6/${p}/`, `${shareBase}/jb6/${p}/`]])),
    '@jb6/react/lib/': runtimeBase,
    '@wonder/': `${shareBase}/wonder/`, '@solution/': `${shareBase}/solutions/`, '@indiviai/': `${shareBase}/indiviai/`
  } : {}
  const { og = [], ...clientSpec } = spec   // og = raw branding sources (room, applet), server-only — not shipped to the client
  const branding = mergeBranding(ogDefaults(runtimeBase), ...og)
  const html = APPLET_HOST_HTML
    .replace('_CLIENT_ENV_', JSON.stringify({ WONDER_STORAGE_PROVIDER: storageProvider(), WONDER_STORAGE_URL: storageUrl() }))
    .replace('_IMPORT_MAP_', JSON.stringify({ imports }))
    .replace('_APPLET_SPEC_', JSON.stringify({ ...clientSpec, liveRepo: !!localImports }))
    .replace('_FAVICON_', branding.favicon)
    .replace('_APPLE_TOUCH_ICON_', `${runtimeBase}images/icon/icon-180x180.png`)
    .replace('_OG_TAGS_', ogTags(branding))
  res.set('Content-Type', 'text/html').send(html)
}

// running code closures (lambda / admin snippet)
// Definitions live in the public bucket for public rooms and in the private bucket for signed rooms.
export async function readDef(roomWUrl, path) {
  const def = roomWUrl.startsWith('signedRoom://') ? await readJson(`${roomWUrl.split('://')[1]}/${path}`)
    : await jb.wonderUtils.wfetch2(`${roomWUrl}/${path}`, { method: 'GET' }, new coreUtils.Ctx().setVars(storageEnvVars())).then(r => r.ok ? r.json() : null, () => null)
  return def?.content ?? def
}

// authorize a caller against a room: authenticate → load policy (null ⇒ public) → role. Returns { who, policy, role }.
// who null ⇒ not authenticated (401). role null ⇒ authenticated but not a member of a restricted room (403).
async function authorize(req, roomId, ctx, signed) {
  const { authLogger } = ctx.vars
  const authAt = performance.now()
  authLogger?.info?.({t: 'authentication started', atEpoch: Date.now(), roomId,
    hasToken: !!req.headers['x-user-authorization']}, {}, {ctx})
  const policy = signed ? await roomPolicy(roomId) : null
  authLogger?.info?.({t: 'room policy loaded', atEpoch: Date.now(), roomId, signed: !!policy}, {}, {ctx})
  const policyMs = performance.now() - authAt, callerAt = performance.now()
  try {
    const who = await caller(req)
    authLogger?.info?.({t: 'token verified', atEpoch: Date.now(), roomId, email: who?.email}, {}, {ctx})
    return { who, policy, role: who && roleOf(policy, who.email),
      authTiming: { policyMs, callerMs: performance.now() - callerAt, authMs: performance.now() - authAt } }
  } catch (error) {
    authLogger?.error?.({t: 'token verification failed', atEpoch: Date.now(), roomId}, {}, {ctx, error})
    return { policy, authError: /too late|expired/i.test(error.message) ? 'authorization token expired' : 'invalid authorization token',
      authTiming: { policyMs, callerMs: performance.now() - callerAt, authMs: performance.now() - authAt } }
  }
}

// gated(req,res) → { lambdaV, source } (or null if it already responded). Same shape for both run + sse-progress twins.
const runRoute = (withProgress, gated) => async (req, res) => {
  try {
    const routeAt = performance.now(), routeAtEpoch = Date.now()
    const job = await gated(req, res)
    if (!job) return
    if (!withProgress) return respond(res, await run(job.lambdaV, job.source, req.body.serverTimeout))
    res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()
    const send = msg => res.write(`data: ${JSON.stringify(msg)}\n\n`)
    const onProgress = ev => send({ channel: 'progress', event: ev })   // live progress → SSE frames
    coreUtils.eventEmitter.on('progress', onProgress)
    try {
      const runAt = performance.now(), runAtEpoch = Date.now()
      const result = await run(job.lambdaV, job.source, req.body.serverTimeout), serializeAt = performance.now()
      const done = JSON.stringify({ type: 'done', result })
      send({ type: 'timing', gateMs: runAt - routeAt, runMs: serializeAt - runAt,
        serializeMs: performance.now() - serializeAt, resultBytes: Buffer.byteLength(done),
        requestAtEpoch: req.body.requestAtEpoch, routeAtEpoch, runAtEpoch, doneAtEpoch: Date.now() })
      res.write(`data: ${done}\n\n`)
    } catch (e) { send({ type: 'done', result: { error: e.stack } }) }
    finally { coreUtils.eventEmitter.off('progress', onProgress) }
    res.end()
  } catch (e) { console.error('[run] error', e); if (!res.headersSent) res.status(500).json({ error: e.stack }) }
}

const TIMED_OUT = Symbol('timedOut')
const run = async (lambdaV, source, serverTimeout) => {
  const ctx = await coreUtils.ensureLoggers((source.logger || '').split(',').filter(Boolean))
  Object.entries(source.gateLogs || {}).forEach(([name, channels]) => Object.entries(channels).forEach(([channel, entries]) =>
    ctx.vars[name]?.[channel]?.push(...entries)))
  const roomLogger = ctx.vars.roomLogger
  if (source.gate) roomLogger?.info?.({ event: 'gate', ...source.gate }, {}, { ctx })   // runs-as-user + permissionByPath decision, harvestable
  roomLogger?.info?.({ event: 'run version', lambdaV,
    uptimeMs: process.uptime() * 1000 }, {}, { ctx })   // small uptime ⇒ cold container
  const timeout = serverTimeout && new Promise(ok => setTimeout(() => ok(TIMED_OUT), serverTimeout))
  const t0 = Date.now()
  const imports = await sourceImports(lambdaV, source, ctx)
  const extractMs = Date.now() - t0
  roomLogger?.info?.({ event: source.userVars?.isLocalHost ? 'live-repo imports (localhost, no snapshot)' : 'extract tar',
    lambdaV, extractMs }, {}, { ctx })
  const res = await Promise.race([runProfile(imports, source, ctx), timeout].filter(Boolean))
  if (res === TIMED_OUT) return { result: 'serverTimeout', logs: coreUtils.harvestLogs(ctx) }
  roomLogger?.info?.({ event: 'server run done', lambdaV, extractMs, runMs: Date.now() - t0 - extractMs }, {}, { ctx })   // $source carries machine:pid
  const serverLogs = coreUtils.harvestLogs(ctx)   // merge the server's own loggers (run version + timing) into the child's
  const mergeLogValues = (child, server) => Array.isArray(child) ? [...child, ...(Array.isArray(server) ? server : [])] : child ?? server
  return { ...res, logs: { ...res.logs, ...Object.fromEntries(Object.entries(serverLogs).map(([n, le]) =>
    [n, Object.fromEntries(Object.entries(le).map(([k, value]) => [k, mergeLogValues(res.logs?.[n]?.[k], value)]))])) } }
}

export function setupRoomLambdaAndApplet(app) {
  // data gate: authorize against the room, then run the room's lambda AS THE USER
  // (caller idToken in ctx → signedRoom reads gated as the user, not the server SA).
  // the lambda def file <roomId>/lambdas/<name>.json IS { lambdaV, entryCompFullId }. profile = {$:entryCompFullId} + userVars params.
  const roomLambdaGate = signed => async (req, res) => {
    const gateAt = performance.now()
    const { roomId, name } = req.params
    const gateCtx = coreUtils.ensureLoggers((req.body?.logger || '').split(',').filter(name => name === 'authLogger'))
    const gateLogs = () => coreUtils.harvestLogs(gateCtx, ['authLogger'])
    const roomWUrl = `${signed ? 'signedRoom' : 'room'}://${roomId}`
    const { who, policy, role, authError, authTiming } = await authorize(req, roomId, gateCtx, signed)   // 1. authenticate
    if (signed && !policy) { res.status(404).json({ error: `no signed room ${roomId}` }); return null }
    if (authError) { res.status(401).json({ error: authError, logs: gateLogs() }); return null }
    // ?noAuth is honored ONLY on a PUBLIC room (policy null): run anonymously as the server SA — no idToken, no per-user data.
    const anon = !who && req.body?.noAuth && !policy
    if (!who && !anon) { res.status(401).json({ error: 'login required' }); return null }
    const defAt = performance.now(), lambda = await readDef(roomWUrl, `lambdas/${name}.json`), defMs = performance.now() - defAt
    if (!lambda) { res.status(500).json({ error: `no lambda ${name} in ${roomId}` }); return null }
    if (lambda.roomWUrl && lambda.roomWUrl !== roomWUrl) { res.status(409).json({ error: `lambda room mismatch: ${lambda.roomWUrl}` }); return null }
    // 2. authorize read access to the lambda's declared dir against the room ACL (a lambda reads-to-execute). anon ⇒ public 'authenticated' role.
    const effRole = anon ? 'authenticated' : role, email = who?.email || 'anonymous'
    const denied = lambda.dir && !canAccess(policy, lambda.dir, 'r', effRole)
    if (denied) { res.status(403).json({ error: `forbidden: ${lambda.dir} for role ${effRole} for user ${email}` }); return null }
    // roomWUrl tells signedRoom:// reads which signed-room policy applies.
    const isLocalHost = req.hostname === 'localhost'
    return { lambdaV: lambda.lambdaV, source: {   // 3. run AS THE USER (or anon SA)
      // profile = the call; packedCtx = the caller's ctx slice (stripCtx, logger-free).
      // logger = active logger names, revived server-side. The server overlays the TRUSTED identity.
      gate: { roomId, name, email, role: effRole, dir: lambda.dir, denied, anon,
        ...authTiming, defMs, gateMs: performance.now() - gateAt },                    // harvestable gate decision (→ roomLogger in run())
      gateLogs: gateLogs(),
      profile: req.body?.profile || { $: lambda.entryCompFullId }, packedCtx: req.body?.packedCtx, logger: req.body?.logger,
      userVars: {
        roomId, roomWUrl, ...(who && { idToken: who.token }), userEmail: email, ...storageEnvVars(),
        hasGcpIdentity: storageProvider() === 'gcs', isLocalHost, isStaging: !isLocalHost && req.hostname?.includes('staging')
      }
    } }
  }
  app.post('/run-room-lambda/:roomId/:name', json, runRoute(false, roomLambdaGate(false)))
  app.post('/run-room-lambda-sse-progress/:roomId/:name', json, runRoute(true, roomLambdaGate(false)))
  app.post('/run-signed-room-lambda/:roomId/:name', json, runRoute(false, roomLambdaGate(true)))
  app.post('/run-signed-room-lambda-sse-progress/:roomId/:name', json, runRoute(true, roomLambdaGate(true)))

  // entry gate: serve the applet host page inline. The route declares the scheme; storage is never probed to infer it.
  // scheme is a property of the route, not of this GET's identity — a browser top-level nav
  // carries no x-user-authorization header (its token lives in localStorage.auth2, used later on the lambda POST). The host page
  // exposes no room data, so serving it unauthenticated is safe; the teeth are the downstream signedRoom:// per-file reads.
  // the applet def <roomId>/applets/<name>.json IS { cmpId, urlsToLoad, appletV }; appletV = the share snapshot id.
  const appletRoute = signed => async (req, res) => {
    try {
      const { roomId, name } = req.params
      const roomWUrl = `${signed ? 'signedRoom' : 'room'}://${roomId}`
      const applet = await readDef(roomWUrl, `applets/${name}.json`)
      if (!applet) return res.status(404).json({ error: `no applet ${name} in ${roomId}` })
      if (applet.roomWUrl && applet.roomWUrl !== roomWUrl) return res.status(409).json({ error: `applet room mismatch: ${applet.roomWUrl}` })
      const ogUrl = `${req.hostname === 'localhost' ? 'http' : 'https'}://${req.get('host')}${req.path}`
      const og = [await readDef(roomWUrl, 'admin/branding.json'), applet.og, { ogUrl }]
      const spec = { cmpId: applet.cmpId, urlsToLoad: applet.urlsToLoad, roomWUrl,
        appletV: applet.appletV, clientCodeWUrl: applet.clientCodeWUrl,
        noAuth: process.env.WONDER_AUTH_MODE === 'none' && !signed, og }
      await serveAppletPage(spec, res)
    } catch (e) { console.error('[room-applet] error', e); res.status(500).json({ error: e.stack }) }
  }
  app.get('/room/:roomId/applet/:name', appletRoute(false))
  app.get('/signed-room/:roomId/applet/:name', appletRoute(true))
}

// localhost dev: run the caller's profile against the LIVE repo (discover its minimal imports) — no snapshot,
// so flow/comp edits take effect with no uploadRoomLambda. staging/prod: run the published lambdaV tarball.
async function sourceImports(lambdaV, source, ctx) {
  if (source.userVars?.isLocalHost && source.profile) {
    const { liveRepoSourceImports } = await import('./room-lambda-and-applet-live-repo.js')
    const imp = await liveRepoSourceImports(source.profile, ctx)
    if (!imp.error) return imp
    ctx.vars.roomLogger?.info?.({ event: 'live-repo discover failed → snapshot fallback', error: imp.error }, {}, { ctx })
  }
  const dir = await ensureExtracted(lambdaV)
  return { importsStr: "await import('./index.js')", projectDir: dir, importMapsInCli: `${dir}/importmap.mjs` }
}

export async function ensureExtracted(lambdaV, { root = '/tmp/code', fetchTar = fetchLambdaTar } = {}) {
  const dir = `${root}/${lambdaV}`, key = `${root}:${lambdaV}`
  if (existsSync(`${dir}/index.js`)) return dir
  if (!extractionPromises.has(key)) extractionPromises.set(key,
    extractLambda(lambdaV, dir, root, fetchTar).finally(() => extractionPromises.delete(key)))
  return extractionPromises.get(key)
}

async function fetchLambdaTar(lambdaV) {
  const res = await fetch(`${storageUrl()}/wonder-code-packages/lambdas/${lambdaV}.tar.gz`)
  if (!res.ok) throw new Error(`lambda package ${lambdaV}: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function extractLambda(lambdaV, dir, root, fetchTar) {
  await fsp.mkdir(root, { recursive: true })
  const tmp = await fsp.mkdtemp(`${root}/${lambdaV}-`), tarPath = `${tmp}.tar.gz`
  try {
    await fsp.writeFile(tarPath, await fetchTar(lambdaV))
    await new Promise((ok, fail) => spawn('tar', ['-xzf', tarPath, '-C', tmp]).on('close', c => c === 0 ? ok() : fail(new Error(`tar ${c}`))))
    if (existsSync(dir) && !existsSync(`${dir}/index.js`)) await fsp.rm(dir, { recursive: true, force: true })
    await fsp.rename(tmp, dir).catch(e => { if (!existsSync(`${dir}/index.js`)) throw e })
  } finally {
    await fsp.unlink(tarPath).catch(() => {})
    await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
  return dir
}

// the server↔child hop IS jb6's runStrippedCli: run the call AS THE USER on a fresh node that shares the lambda's
// PACKAGE (index.js + importmap). The lambda only merges the TRUSTED overlay into packedCtx and names its package; the
// caller's loggers (the `logger` field, kept OUT of packedCtx) are both returned (logs) and streamed live (→ eventEmitter → SSE route).
async function runProfile(imports, { profile, packedCtx = { vars: {}, args: {} }, userVars, logger = '' }, ctx) {
  if (packedCtx.vars?.lambdaLoggers != null) throw new Error('packedCtx must be logger-free - loggers travel via the `logger` field')
  Object.assign(packedCtx.vars ||= {}, userVars)
  const loggers = logger
  // live-stream only loggers this server actually instantiated (its generic bundle lacks most lambda-DSL logger
  // defs ⇒ ensureLoggers skipped them ⇒ dispatchChildLine can't route them → "dispatch missing"). all still ride back in {logs}.
  const progress = loggers.split(',').filter(n => ctx.vars[n]).join(',')
  const res = await coreUtils.runStrippedCli({
    profileJson: profile, packedCtx, ctx,   // shared ctx → child logs stream into it live, harvestable on timeout
    imports,   // snapshot (./index.js) or live-repo minimal imports — see sourceImports()
    testLoggers: loggers, progressLoggers: progress
  })
  return res
}
