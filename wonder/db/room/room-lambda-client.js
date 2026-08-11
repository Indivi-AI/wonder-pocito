import { jb, coreUtils, dsls } from '@jb6/core'
import '@jb6/llm-guide'
import '@wonder/db/db-drivers.js'
const { getIdToken, wfetch2 } = jb.wonderUtils
import '@jb6/lang-service/src/tgp-snippet.js'      // calcImportsForProfile — discover the live entry path
import '@jb6/core/misc/jb-remote-via-cli.js'        // runStrippedCli — run over the LIVE repo (no upload)
import '@jb6/core/misc/jb-remote.js'                // stripCtx — roomLambda ships the call + ctx slice

const {
  tgp: { TgpType, TgpTypeModifier, CompField },
  common: { Data },
  wonder: { DbDriverInterceptor, 'db-driver-interceptor': { dbDriverInterceptor } },
  test: { Logger, logger: { domainLogger } },
  'llm-guide': { Doclet }
} = dsls
const { isNode, activeLoggers } = coreUtils

CompField('permissionByPath', { impl: { $: 'comp-field<tgp>compField', type: 'string' } })
const Lambda = TgpTypeModifier('Lambda', { lambda: true, dsl: 'common', type: 'data' })

Doclet('lambda-packaging-concept', {
  impl: `
  invokeSnippetInContext has a 'pack' param. 

invokeSnippetInContext RUNS a compToRun somewhere, shipping the call (profile + the ctx slice its \`%$tokens%\` need,
via stripCtx) to that somewhere. A lambda-packaging is a subject-free behavior:
\`{ run(ctx, compToRun) -> value }\`. The subject (compToRun, a data<common> dynamic comp) is INJECTED
at call time, never a param. Both packagings PACK the call the same way (stripCtx); only the TRANSPORT differs.

- unPackagedInLiveRepo — node: run in-process (no wire). browser-localhost: discover imports then ship the
  packed call over the LIVE repo via CLI (no tar, no version)
- roomLambda          — ship the packed call to the remote, gated AS THE USER;
  version resolved server-side from the room manifest (name → lambdas/<name>.json)
  * use mcp uploadLambdaComp to pack and upload lambda code before

  to run adHokSnippetForAdmin use the Tool uploadAdHokSnippetForAdmin - and run it directly via /admin-run-snippet/<lambdaV>
`
})

const LambdaPackaging = TgpType('lambda-packaging', 'lambda')

const asJbComp = c => typeof c == 'string' ? coreUtils.compByFullId(c) : c?.[Symbol.for('asJbComp')] || (c?.$location ? c : null)

const importsFromLoadedLocations = (profile, repoRoot) => {
  const seen = new Set(), paths = []
  let missing = false
  const urlToRepoDir = { '/jb6_packages': 'jb6', '/wonder': 'wonder', '/solution': 'solutions', '/indiviai': 'indiviai' }
  const abs = p => {
    const dir = Object.keys(urlToRepoDir).find(pre => p.startsWith(pre + '/'))
    return dir ? `${repoRoot}/${urlToRepoDir[dir]}${p.slice(dir.length)}` : p.startsWith('/') ? p : `${repoRoot}/${p}`
  }
  const walkComp = c => {
    if (!c || seen.has(c)) return
    seen.add(c)
    if (!c.$location?.path) { missing = true; return }
    paths.push(abs(c.$location.path))
    walkNode(c.impl)
  }
  // one traversal for both the profile arg tree AND comp impls: descend every value, and at each `$` resolve→walk its comp.
  const walkNode = node => {
    if (!node || typeof node != 'object' || seen.has(node)) return
    seen.add(node)
    if (node.$) walkComp(asJbComp(node.$))
    Object.values(node).forEach(v => Array.isArray(v) ? v.forEach(walkNode) : walkNode(v))
  }
  walkNode(profile)
  if (missing) return null   // a comp the profile touches isn't loaded here → caller falls back to parsed discover
  const topLevelImports = coreUtils.unique(paths)
  return { topLevelImports, importsStr: topLevelImports.map(f => `await import('${f}')`).join('\n'), projectDir: repoRoot, importMapsInCli: jb.coreRegistry.importMapsInCli, compsWalked: seen.size }
}

const unPackagedInLiveRepo = LambdaPackaging('unPackagedInLiveRepo', {
  impl: () => ({
    run: async (ctx, compToRun) => {
      const log = ctx.vars.lambdaLogger
      // the live repo IS this process — run in-process, no wire. node always qualifies; the browser qualifies too unless the
      // comp is nodeOnly (touches fs/spawn/gcs; e.g. fileQuery). a cubeQuery lambda is NOT nodeOnly → runs on wasm duckdb in-page.
      const nodeOnly = asJbComp(compToRun.profile.$)?.nodeOnly
      if ((isNode || !nodeOnly) && !ctx.vars.forceDiscover) { log?.info?.({ event: 'in-process (live repo, no wire)', strategy: 'unPackagedInLiveRepo', host: isNode ? 'node' : 'browser' }, {}, { ctx }); return compToRun(ctx) }
      const profile = coreUtils.tgpProfileToJson(compToRun.profile)   // resolves compToRun.profile in place → its $ nodes are now jbComp objects
      const repoRoot = await coreUtils.calcRepoRoot()
      await coreUtils.calcJb6RepoRootAndImportMapsInCli()   // populates jb.coreRegistry.importMapsInCli → buildNodeCliCmd passes --import to the child
      const fast = importsFromLoadedLocations(compToRun.profile, repoRoot)   // null ⇒ some comp not loaded here
      const imp = fast || await coreUtils.calcImportsForProfile(profile, { entryPointPaths: [`${repoRoot}/tests/all-tests.js`], ctx })
      log?.info?.({ event: fast ? 'entry paths from loaded $location (fast, no parse)' : 'loaded $location incomplete → parsed discover (slow)',
        strategy: 'unPackagedInLiveRepo', files: imp?.topLevelImports?.length, compsWalked: fast?.compsWalked }, { imp }, { ctx })
      if (!imp || imp.error) { log?.error?.({ event: 'discover failed → skip', strategy: 'unPackagedInLiveRepo', error: imp?.error }, { imp }, { ctx }); return null }
      // pack = ship the call (profile + only the %$tokens% slice of ctx it needs, via stripCtx) to a fresh node CLI that shares this repo
      const packedCtx = coreUtils.stripCtx({ profileJson: profile, ctx: compToRun.lexicalCtx })
      packedCtx.vars.db = 'gcs'
      const loggers = activeLoggers(ctx)
      log?.info?.({ event: 'spawning child CLI to run packed profile', strategy: 'unPackagedInLiveRepo', loggers, ctxVars: Object.keys(packedCtx.vars || {}) }, {}, { ctx })
      const res = await coreUtils.runStrippedCli({ profileJson: profile, packedCtx, imports: imp, testLoggers: loggers, progressLoggers: loggers, ctx })
      if (res?.error) { log?.error?.({ event: 'run failed → skip', strategy: 'unPackagedInLiveRepo', error: res.error }, { childLogs: res.logs }, { ctx }); return null }
      log?.info?.({ event: 'child CLI returned ok', strategy: 'unPackagedInLiveRepo', resultRows: Array.isArray(res.result) ? res.result.length : typeof res.result }, {}, { ctx })
      return res.result
    }
  })
})

const roomLambda = LambdaPackaging('roomLambda', {
  params: [
    { id: 'streamProgress', as: 'boolean' },
    { id: 'timeout', as: 'number', defaultValue: '%$testTimeout%' },
    { id: 'timeoutRatio', as: 'number', defaultValue: 0.8 },
    { id: 'maxPackedBytes', as: 'number', defaultValue: 65536, description: 'advisory wire-size budget (~one 64K transport chunk); a bigger input belongs in a room file, not packedCtx' }
  ],
  impl: (_, {}, { streamProgress, timeout, timeoutRatio, maxPackedBytes }) => ({
    run: async (ctx, compToRun) => {
      const log = ctx.vars.roomLogger
      const profile = coreUtils.tgpProfileToJson(compToRun.profile)
      const name = profile.$.match(/([^<>]+)$/)[1]
      // packedCtx ships only the %$token% slice the lambda reaches. Two size guards, same lesson: keep big bytes server-side,
      // send only a reference — a CONSTANT belongs in a param defaultValue (resolves on the server, never crosses), a RUNTIME
      // input in a room FILE (cachedWonderUrl/wfetch2 inside the lambda); a packedCtx var is for small tokens only. tooLarge =
      // a warning a future LLM reads in the log, then {error} (no fetch) - NOT a raw stack. CAP (256K, jb-remote.js) is the hard ceiling.
      const tooLarge = (bytes, detail) => (log?.warning?.({ event: 'do not pass large objects over the wire', strategy: 'roomLambda', version: name },
        { bytes, maxPackedBytes, hint: 'keep the bytes server-side, send only a reference. CONSTANT input → a param defaultValue (omit the arg, it resolves on the server, never crosses; e.g. salesByCategory: defaultValue:"electronics"). RUNTIME/caller-specific input → a room FILE the lambda reads (cachedWonderUrl/wfetch2 inside the impl). a packedCtx var is for SMALL tokens only (id/date/category)', ...detail }, { ctx }), { error: `packedCtx exceeds budget: ${detail.cap || `${bytes} > ${maxPackedBytes}`}` })
      let packedCtx
      try { packedCtx = coreUtils.stripCtx({ profileJson: profile, ctx: compToRun.lexicalCtx }) }
      catch (err) { return tooLarge(undefined, { cap: err.message }) }
      const packedBytes = JSON.stringify(packedCtx).length
      log?.info?.({ event: 'packed', strategy: 'roomLambda', version: name, packedBytes }, { packedVars: Object.keys(packedCtx.vars || {}) }, { ctx })
      if (maxPackedBytes && packedBytes > maxPackedBytes) return tooLarge(packedBytes, {})
      const serverTimeout = timeout && timeout * timeoutRatio
      const t0 = Date.now()
      const TIMED_OUT = Symbol('timedOut')
      const fetching = wfetch2(`${ctx.vars.roomUrl}/lambda/${name}`, { method: 'post', body: { profile, packedCtx, stream: !!streamProgress, serverTimeout } }, ctx)
      const deadline = serverTimeout && new Promise(ok => setTimeout(() => ok(TIMED_OUT), serverTimeout))
      const res = await Promise.race([fetching, deadline].filter(Boolean))
      const uptimeMs = ctx.vars.roomLogger?.roomLog?.find(e => e.t === 'run version')?.uptimeMs
      const lambdaMs = Date.now() - t0
      if (res === TIMED_OUT) { log?.info?.({ event: uptimeMs ? `timeout - uptime ${uptimeMs}` : 'timeout - probably warmup', strategy: 'roomLambda', version: name }, { lambdaMs }, { ctx }); return { error: 'timeout' } }
      log?.info?.({ event: 'roomLambda done', strategy: 'roomLambda', version: name }, { roomUrl: ctx.vars.roomUrl, lambdaMs, uptimeMs, ok: res.ok }, { ctx })
      const body = await res.json()
      return res.ok ? body : { error: body.error || res.status }
    }
  })
})

Data('invokeSnippetInContext', {
  params: [
    { id: 'compToRun', type: 'data<common>', dynamic: true, mandatory: true },
    { id: 'pack', type: 'lambda-packaging<lambda>', byName: true, defaultValue: roomLambda() },
    { id: 'defaultOnLiveRepo', type: 'lambda-packaging<lambda>', defaultValue: unPackagedInLiveRepo(), description: 'internal, do not use this param' }
  ],
  impl: (ctx, {onLiveRepo}, { compToRun, defaultOnLiveRepo, pack }) => (onLiveRepo ? defaultOnLiveRepo : pack).run(ctx, compToRun)
})

DbDriverInterceptor('roomLambda', {
  impl: dbDriverInterceptor({
    pre: async (ctx, { roomId, fileName, driverMethod, opts, roomLogger }) => {
      if (driverMethod !== 'append' || !fileName?.startsWith('lambda/')) return null
      const name = fileName.slice('lambda/'.length)
      try {
      // lambdaHost: explicit override (e.g. http://localhost:3000 or https://staging.indivi.ai). else browser: page origin; node: staging (lambdas/applets NEVER target wonder.indivi.ai).
      const base = ctx.vars.lambdaHost || globalThis.window?.location?.origin || 'https://staging.indivi.ai'
      const authAt = performance.now()
      const idToken = ctx.vars.noAuth ? null : await getIdToken(ctx)
      const authMs = performance.now() - authAt
      const authHeaders = { 'Content-Type': 'application/json', ...(idToken && { 'x-user-authorization': `Bearer ${idToken}` }) }
      // forward the caller's room + the active logger names (revived server-side, kept OUT of packedCtx)
      const requestAtEpoch = Date.now()
      const body = JSON.stringify({ ...(opts.body || {}), roomUrl: ctx.vars.roomUrl, logger: activeLoggers(ctx),
        requestAtEpoch, ...(ctx.vars.noAuth && { noAuth: true }) })
      roomLogger?.info?.({ t: 'roomLambda invoke', roomId, name, roomUrl: ctx.vars.roomUrl,
        stream: !!opts.body?.stream, noAuth: !!ctx.vars.noAuth, authMs }, {}, { ctx })
      // route result shape is { result: { result, error, logs } }. Merge the lambda's per-logger logs INTO the caller's
      // same-named logger instances (so a test's `logger:` harvest picks them up natively), then unwrap the value.
      const streamed = !!opts.body?.stream
      const asResponse = inner => {
        Object.entries(inner?.logs || {}).forEach(([lname, le]) => {
          const inst = ctx.vars[lname]
          if (inst && le) Object.entries(le).forEach(([k, arr]) => {
            if (!Array.isArray(inst[k]) || !Array.isArray(arr)) return
            inst[k].push(...arr.filter(e => !(streamed && e?.severity === 'progress')).map(e => ({ ...e, $lambda: name })))
          })
        })
        if (inner?.error) roomLogger?.error?.({ t: 'roomLambda error', roomId, name, error: inner.error }, {}, { ctx })
        return { ok: !inner?.error, status: inner?.error ? 500 : 200, text: async () => JSON.stringify(inner?.result), json: async () => inner?.result }
      }
      if (!opts.body?.stream) {
        const url = `${base}/run-room-lambda/${roomId}/${name}`
        const res = await fetch(url, { method: 'POST', headers: authHeaders, body })
        const raw = await res.text()   // read once as text: a bare-text 503 'Service Unavailable' (Cloud Run OOM) is NOT json — parse it blind and you'd lose the real status behind an opaque SyntaxError
        let json; try { json = JSON.parse(raw) } catch {}
        if (json === undefined) {   // non-json body ⇒ the infra failed before the lambda: surface status + body + a future-LLM hint (503 'Service Unavailable' = the lambda container was OOM-killed; the heavy cube crossed the 2Gi Cloud Run cap → check `gcloud logging read` for 'Memory limit ... exceeded')
          roomLogger?.error?.({ t: 'roomLambda non-json response', roomId, name, status: res.status, body: raw.slice(0, 500),
            hint: `the room-lambda infra returned a non-json body (status ${res.status}). a bare-text 503 'Service Unavailable' means the lambda container was OOM-killed — the query exceeded the 2Gi Cloud Run cap (duckdb sizes memory_limit off the HOST ram, not the cgroup). run a lighter query or cap duckMemLimit; check \`gcloud logging read\` on node25-automations-server-staging for 'Memory limit ... exceeded'` }, {}, { ctx })
          return { ok: false, status: res.status, json: async () => ({ error: `room-lambda ${res.status}: ${raw.slice(0, 200)}` }), text: async () => raw }
        }
        if (!res.ok) {   // 401/403/... carry {error} and no result - surface it; asResponse would mask it as an ok-null (the "failed: 200" trap)
          if (globalThis.window && (json?.error === 'authorization token expired' || json?.error?.endsWith('role null for user devMachine')))
            (await import('@wonder/db/oauth2.js')).reLogin()
          roomLogger?.error?.({ t: 'roomLambda rejected', roomId, name, status: res.status, serverError: json?.error }, {}, { ctx })
          return { ok: false, status: res.status, json: async () => ({ error: json?.error || `room-lambda ${res.status}` }), text: async () => raw }
        }
        return asResponse(json.result)
      }
      // stream:true → SSE, relay progress to the stepper, return the final result
      const requestAt = performance.now()
      const res = await fetch(`${base}/run-room-lambda-sse-progress/${roomId}/${name}`, {
        method: 'POST', headers: { ...authHeaders, Accept: 'text/event-stream' }, body
      })
      const headersMs = performance.now() - requestAt, headersAtEpoch = Date.now()
      if (!res.ok) {   // gate rejected (401/403/404/...) — surface the server's reason, don't silently return undefined
        const { error: serverError = res.status } = await res.json()
        if (serverError === 'authorization token expired' && globalThis.window)
          (await import('@wonder/db/oauth2.js')).reLogin()
        roomLogger?.error?.({ t: 'roomLambda rejected', roomId, name, dir: ctx.vars.lambdaDir, status: res.status, serverError }, {}, { ctx })
        return { ok: false, status: res.status, json: async () => ({ error: serverError || res.status }), text: async () => serverError }
      }
      const reader = res.body.getReader(), decoder = new TextDecoder()
      let buf = '', done, timing, bytes = 0, seen = new Set()
      let timingAtEpoch, doneAtEpoch, streamEndedAtEpoch
      while (true) {
        const { value, done: streamDone } = await reader.read()
        if (streamDone) { streamEndedAtEpoch = Date.now(); break }
        bytes += value.byteLength
        buf += decoder.decode(value, { stream: true })
        const msgs = buf.split('\n\n'); buf = msgs.pop()
        for (const m of msgs) {
          const dataLine = m.split('\n').find(l => l.startsWith('data:'))
          if (!dataLine) continue
          const ev = JSON.parse(dataLine.slice(5).trim())
          if (ev.type === 'done') { done = ev.result; doneAtEpoch = Date.now() }
          else if (ev.type === 'timing') { timingAtEpoch = Date.now(); timing = { ...ev, timingFrameMs: performance.now() - requestAt } }
          else if (ev.channel === 'progress') {
            const key = `${ev.event?.$source}|${ev.event?.at}|${ev.event?.t}`
            if (seen.has(key)) continue
            seen.add(key)
            coreUtils.eventEmitter.emit('progress', ev.event)
          }
        }
      }
      const mergeAt = performance.now(), response = asResponse(done)
      roomLogger?.info?.({ t: 'roomLambda transport', headersMs, doneFrameMs: mergeAt - requestAt,
        bytes, ...timing, requestAtEpoch, headersAtEpoch, timingAtEpoch, doneAtEpoch, streamEndedAtEpoch,
        streamEndMs: streamEndedAtEpoch - requestAtEpoch, mergeMs: performance.now() - mergeAt }, {}, { ctx })
      return response
      } catch (err) {
        roomLogger?.error?.({ t: 'roomLambda failed', roomId, name, error: err.stack || String(err) }, {}, { ctx })
        return { ok: false, status: 500, json: async () => ({ error: err.stack || String(err) }), text: async () => err.stack || String(err) }
      }
    }
  })
})
