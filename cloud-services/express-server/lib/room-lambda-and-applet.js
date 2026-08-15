// Room serving + running: the applet host page AND the room-gated, runs-as-user lambda/snippet runner.
// Every run = extract the code closure (ensureExtracted) → spawn node → run a TGP profile (runProfile).
// Two version namespaces, deliberately distinct:
//   lambdaV = a node code-closure tarball id (lambdas/<lambdaV>.tar.gz)   — server extracts & runs it.
//   appletV = a browser share-snapshot id (shared/<appletV>/…)            — the importmap points source there.
// Routes (each run has a twin -sse-progress variant: same auth+source, but streams progress over SSE then a 'done' message):
//  - POST /run-room-lambda[-sse-progress]/:roomId/:name → room member; run the room's lambda AS THE USER.
//  - GET  /room/:roomId/applet/:name → serve the applet host page INLINE (no 302). Same URL for public & signed rooms; policy picks the teeth.
import express from 'express'
import { coreUtils } from '@jb6/core/index.js'
import '@jb6/core/misc/jb-remote-via-cli.js'   // runStrippedCli (stripCtx-aware server↔child run)
import { caller, roomPolicy, roleOf, canAccess } from './auth-utils.js'
import '@wonder/db/auth.js'
import { readJson } from './signed-url.js'
import { promises as fsp, existsSync } from 'fs'
import { spawn } from 'child_process'

const FRONTEND_URL = 'https://jb6-cdn.pages.dev'
const CODE_PACKAGES_URL = 'https://storage.googleapis.com/wonder-code-packages'
const PUBLIC_ROOM_BUCKET = 'https://storage.googleapis.com/indiviai-wonder'
const jb6Pkgs = ['core','common','react','rx','jq','llm-guide','mcp','testing','repo','lang-service','probe-studio']
const json = express.json({ limit: '1mb' })
const respond = (res, r) => res.status(r.error ? 500 : 200).json(r.error ? r : { result: r })
const extractionPromises = new Map()

// ─── the applet host page ──────────────────────────────────────────────────────────────────────────
const APPLET_HOST_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Wonder Workspace</title>
<link rel="icon" type="image/svg+xml" href="_FAVICON_">
<link rel="apple-touch-icon" href="${FRONTEND_URL}/images/icon/icon-180x180.png">
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
<script type="importmap">_IMPORT_MAP_</script>
<div id="root" style="height:100vh"></div>
<script type="module">
import '@jb6/react/lib/tailwindcss-3.4.17.js'
import { reactUtils } from '@jb6/react'
import { coreUtils } from '@jb6/core'
import { ensureLogin } from '@wonder/db/oauth2.js'
const appletSpec = _APPLET_SPEC_
reactUtils.loadLucid05()
const { urlsToLoad, roomUrl } = appletSpec
const cmpId = new URLSearchParams(location.search).get('cmpId') || appletSpec.cmpId   // multi-comp applets navigate by ?cmpId=; def cmpId is the default
// ?noAuth on a PUBLIC room (room://) skips the login gate — data is public, so run anonymously (server SA) with no OAuth spin. Signed rooms ignore it.
const noAuth = new URLSearchParams(location.search).has('noAuth') && roomUrl?.startsWith('room://')
const root = document.getElementById('root')
if (appletSpec.liveRepo) await import('@wonder/db/room/room-lambda-live-repo.js')
const runAutomation = async mCtx => {
  window.jbLoggers = mCtx.vars
  if (new URLSearchParams(location.search).has('automation')) {
    await import('@jb6/react/automation.js')
    await reactUtils.startAutomation(mCtx, window)
  }
}
// extendCtxWithUrl seeds ctx-* query params (e.g. ?ctx-reportUrl=…) + loggers from the URL; then add react + the applet's roomUrl.
const ctx = reactUtils.extendCtxWithUrl().setVars({ react: reactUtils, ...(roomUrl && { roomUrl }), ...(noAuth && { noAuth: true }) })
const uiSource = appletSpec.liveRepo
  ? 'live-repo (localhost /jb6_packages, /wonder, /solution, /indiviai)'
  : 'appletV snapshot ' + appletSpec.appletV + ' (GCS share, NOT live-repo) - edit-to-live needs uploadRoomApplet'
ctx.vars.roomLogger?.info?.({ t: 'serve applet page', roomUrl, cmpId, urlsToLoad, appletV: appletSpec.appletV, uiSource }, {}, { ctx })
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
const OG_DEFAULTS = {
  favicon: `${FRONTEND_URL}/images/wonder.svg`,
  ogImage: `${FRONTEND_URL}/images/wonder.svg`,
  ogTitle: 'Wonder Workspace',
  ogDescription: 'A Wonder workspace applet',
  ogType: 'website'
}
const mergeBranding = (...srcs) => Object.assign({}, OG_DEFAULTS, ...srcs.map(s => s && Object.fromEntries(Object.entries(s).filter(([, v]) => v != null))))
const ogTags = b => [
  ['og:title', b.ogTitle], ['og:description', b.ogDescription], ['og:image', b.ogImage], ['og:type', b.ogType], ['og:url', b.ogUrl],
  ['og:image:width', '1200'], ['og:image:height', '630'], ['twitter:card', 'summary_large_image']
].filter(([, c]) => c).map(([p, c]) => `<meta property="${p}" content="${c}">`).join('')

// serveAppletPage: turn an appletSpec ({cmpId, urlsToLoad, roomUrl, appletV, og}) into the inline page. appletV = the share
// snapshot id. jb6 + wonder SOURCE comes from the share; versioned React runtime files use the additive CDN directory.
// localImports = dev live-repo importmap (no upload).
export async function serveAppletPage(spec, res, localImports) {
  res.set({
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless'
  })
  const shareId = spec.appletV
  const shareBase = `${CODE_PACKAGES_URL}/shared/${shareId}`
  const imports = localImports ? localImports : shareId ? {
    ...Object.fromEntries(jb6Pkgs.flatMap(p => [
      [`@jb6/${p}`, `${shareBase}/jb6/${p}/index.js`], [`@jb6/${p}/`, `${shareBase}/jb6/${p}/`]])),
    '@jb6/react/lib/': 'https://jb6-cdn.pages.dev/',
    '@wonder/': `${shareBase}/wonder/`, '@solution/': `${shareBase}/solutions/`, '@indiviai/': `${shareBase}/indiviai/`
  } : {}
  const { og = [], ...clientSpec } = spec   // og = raw branding sources (room, applet), server-only — not shipped to the client
  const branding = mergeBranding(...og)
  const html = APPLET_HOST_HTML
    .replace('_IMPORT_MAP_', JSON.stringify({ imports }))
    .replace('_APPLET_SPEC_', JSON.stringify({ ...clientSpec, liveRepo: !!localImports }))
    .replace('_FAVICON_', branding.favicon)
    .replace('_OG_TAGS_', ogTags(branding))
  res.set('Content-Type', 'text/html').send(html)
}

// ─── running code closures (lambda / admin snippet) ────────────────────────────────────────────────
// def (lambdas/applets/<name>.json) lives in the PUBLIC room bucket for public rooms; fall back to the protected
// bucket for signed rooms. Public rooms thus need nothing in the protected bucket — fully public end to end.
export async function readDef(roomId, path) {
  // cache-bust: GCS edge-caches the def; without ?v the closure pointer (lambdaV) goes stale after a re-publish.
  const r = await fetch(`${PUBLIC_ROOM_BUCKET}/${roomId}/${path}?v=${Date.now()}`).catch(() => null)
  if (r?.ok) { const d = await r.json().catch(() => null); return d?.content ?? d }   // room files are stored as { content }
  return readJson(`${roomId}/${path}`)   // protected fallback
}

// authorize a caller against a room: authenticate → load policy (null ⇒ public) → role. Returns { who, policy, role }.
// who null ⇒ not authenticated (401). role null ⇒ authenticated but not a member of a restricted room (403).
async function authorize(req, roomId, ctx) {
  const { authLogger } = ctx.vars
  const authAt = performance.now()
  authLogger?.info?.({t: 'authentication started', atEpoch: Date.now(), roomId,
    hasToken: !!req.headers['x-user-authorization']}, {}, {ctx})
  const policy = await roomPolicy(roomId)
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
  roomLogger?.info?.({ event: 'run version', lambdaV, uptimeMs: process.uptime() * 1000 }, {}, { ctx })   // small uptime ⇒ cold container
  const timeout = serverTimeout && new Promise(ok => setTimeout(() => ok(TIMED_OUT), serverTimeout))
  const t0 = Date.now()
  const imports = await sourceImports(lambdaV, source, ctx)
  const extractMs = Date.now() - t0
  roomLogger?.info?.({ event: source.userVars?.isLocalHost ? 'live-repo imports (localhost, no snapshot)' : 'extract tar', lambdaV, extractMs }, {}, { ctx })
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
  const roomLambdaGate = async (req, res) => {
    const gateAt = performance.now()
    const { roomId, name } = req.params
    const gateCtx = coreUtils.ensureLoggers((req.body?.logger || '').split(',').filter(name => name === 'authLogger'))
    const gateLogs = () => coreUtils.harvestLogs(gateCtx, ['authLogger'])
    const { who, policy, role, authError, authTiming } = await authorize(req, roomId, gateCtx)   // 1. authenticate
    if (authError) { res.status(401).json({ error: authError, logs: gateLogs() }); return null }
    // ?noAuth is honored ONLY on a PUBLIC room (policy null): run anonymously as the server SA — no idToken, no per-user data.
    const anon = !who && req.body?.noAuth && !policy
    if (!who && !anon) { res.status(401).json({ error: 'login required' }); return null }
    const defAt = performance.now(), lambda = await readDef(roomId, `lambdas/${name}.json`), defMs = performance.now() - defAt
    if (!lambda) { res.status(500).json({ error: `no lambda ${name} in ${roomId}` }); return null }
    // 2. authorize read access to the lambda's declared dir against the room ACL (a lambda reads-to-execute). anon ⇒ public 'authenticated' role.
    const effRole = anon ? 'authenticated' : role, email = who?.email || 'anonymous'
    const denied = lambda.dir && !canAccess(policy, lambda.dir, 'r', effRole)
    if (denied) { res.status(403).json({ error: `forbidden: ${lambda.dir} for role ${effRole} for user ${email}` }); return null }
    // roomUrl tells signedRoom:// reads which protected room policy applies.
    const isLocalHost = req.hostname === 'localhost'
    return { lambdaV: lambda.lambdaV, source: {                                         // 3. run AS THE USER (or anon SA)
      // profile = the call; packedCtx = the caller's ctx slice (stripCtx, logger-free).
      // logger = active logger names, revived server-side. The server overlays the TRUSTED identity.
      gate: { roomId, name, email, role: effRole, dir: lambda.dir, denied, anon,
        ...authTiming, defMs, gateMs: performance.now() - gateAt },                    // harvestable gate decision (→ roomLogger in run())
      gateLogs: gateLogs(),
      profile: req.body?.profile || { $: lambda.entryCompFullId }, packedCtx: req.body?.packedCtx, logger: req.body?.logger,
      userVars: {
        roomId, roomUrl: req.body?.roomUrl, ...(who && { idToken: who.token }), userEmail: email,
        hasGcpIdentity: true, isLocalHost, isStaging: !isLocalHost && req.hostname?.includes('staging')
      }
    } }
  }
  app.post('/run-room-lambda/:roomId/:name', json, runRoute(false, roomLambdaGate))
  app.post('/run-room-lambda-sse-progress/:roomId/:name', json, runRoute(true, roomLambdaGate))

  // entry gate: serve the applet host page inline (keeps the pretty /room/.../applet URL — no 302).
  // scheme is a property of the ROOM (has admin/users.json ⇒ signed), not of this GET's identity — a browser top-level nav
  // carries no x-user-authorization header (its token lives in localStorage.auth2, used later on the lambda POST). The host page
  // exposes no room data, so serving it unauthenticated is safe; the teeth are the downstream signedRoom:// per-file reads.
  // the applet def <roomId>/applets/<name>.json IS { cmpId, urlsToLoad, appletV }; appletV = the share snapshot id.
  app.get('/room/:roomId/applet/:name', async (req, res) => {
    try {
      const { roomId, name } = req.params
      const applet = await readDef(roomId, `applets/${name}.json`)
      if (!applet) return res.status(404).json({ error: `no applet ${name} in ${roomId}` })
      const scheme = await roomPolicy(roomId) ? 'signedRoom' : 'room'
      const ogUrl = `${req.hostname === 'localhost' ? 'http' : 'https'}://${req.get('host')}${req.path}`
      const og = [await readDef(roomId, 'admin/branding.json'), applet.og, { ogUrl }]
      const spec = { cmpId: applet.cmpId, urlsToLoad: applet.urlsToLoad, roomUrl: `${scheme}://${roomId}`,
        appletV: applet.appletV, og }
      await serveAppletPage(spec, res)
    } catch (e) { console.error('[room-applet] error', e); res.status(500).json({ error: e.stack }) }
  })
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
  if (!extractionPromises.has(key)) extractionPromises.set(key, extractLambda(lambdaV, dir, root, fetchTar).finally(() => extractionPromises.delete(key)))
  return extractionPromises.get(key)
}

async function fetchLambdaTar(lambdaV) {
  const r = await fetch(`${CODE_PACKAGES_URL}/lambdas/${lambdaV}.tar.gz?v=${Date.now()}`)
  if (!r.ok) throw new Error(`tar fetch ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
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
  Object.assign(packedCtx.vars ||= {}, { db: 'gcs', ...userVars })   // TRUSTED, server-authoritative
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
