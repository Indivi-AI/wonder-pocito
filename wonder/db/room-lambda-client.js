import { jb, coreUtils, dsls } from '@jb6/core'
import '@jb6/llm-guide/essentials.js'
import '@wonder/db/db-drivers.js'
import '@wonder/db/room-lambda-def.js'
const { getIdToken, wfetch2 } = jb.wonderUtils
import '@jb6/core/misc/jb-remote.js'                // stripCtx — roomLambda ships the call + ctx slice

const {
  tgp: { TgpType },
  common: { Data },
  wonder: { DbDriverInterceptor, 'db-driver-interceptor': { dbDriverInterceptor } },
  test: { Logger, logger: { domainLogger } },
  'llm-guide': { Doclet }
} = dsls
const { activeLoggers } = coreUtils

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

const unPackagedInLiveRepo = LambdaPackaging('unPackagedInLiveRepo', {
  impl: () => ({ run: async (ctx, compToRun) => {
    const nodeOnly = asJbComp(compToRun.profile.$)?.nodeOnly
    if ((coreUtils.isNode || !nodeOnly) && !ctx.vars.forceDiscover) {
      ctx.vars.lambdaLogger?.info?.({ event: 'in-process (live repo, no wire)', strategy: 'unPackagedInLiveRepo',
        host: coreUtils.isNode ? 'node' : 'browser' }, {}, { ctx })
      return compToRun(ctx)
    }
    if (!coreUtils.runUnPackagedInLiveRepo) await import('./room-lambda-' + 'live-repo.js')
    return coreUtils.runUnPackagedInLiveRepo(ctx, compToRun)
  } })
})

const roomLambda = LambdaPackaging('roomLambda', {
  params: [
    {id: 'streamProgress', as: 'boolean', type: 'boolean<common>'},
    {id: 'timeout', as: 'number', defaultValue: '%$testTimeout%'},
    {id: 'timeoutRatio', as: 'number', defaultValue: 0.8},
    {id: 'maxPackedBytes', as: 'number', defaultValue: 65536 }
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
      const tooLarge = (bytes, detail) => (log?.warning?.({ event: 'do not pass large objects over the wire',
        strategy: 'roomLambda', version: name }, { bytes, maxPackedBytes,
          hint: 'keep bytes server-side; send a reference. CONSTANT → param defaultValue. RUNTIME input → room FILE. packedCtx → small tokens only',
          ...detail }, { ctx }), { error: `packedCtx exceeds budget: ${detail.cap || `${bytes} > ${maxPackedBytes}`}` })
      let packedCtx
      try { packedCtx = coreUtils.stripCtx({ profileJson: profile, ctx: compToRun.lexicalCtx }) }
      catch (err) { coreUtils.logException(err, 'room lambda pack context failed', { ctx }); return tooLarge(undefined, {}) }
      const packedBytes = JSON.stringify(packedCtx).length
      log?.info?.({ event: 'packed', strategy: 'roomLambda', version: name, packedBytes }, { packedVars: Object.keys(packedCtx.vars || {}) }, { ctx })
      if (maxPackedBytes && packedBytes > maxPackedBytes) return tooLarge(packedBytes, {})
      const serverTimeout = timeout && timeout * timeoutRatio
      const t0 = Date.now()
      const TIMED_OUT = Symbol('timedOut')
      const fetching = wfetch2(`${ctx.vars.roomWUrl}/lambdas/${name}`,
        { method: 'post', body: { profile, packedCtx, stream: !!streamProgress, serverTimeout } }, ctx)
      const deadline = serverTimeout && new Promise(ok => setTimeout(() => ok(TIMED_OUT), serverTimeout))
      const res = await Promise.race([fetching, deadline].filter(Boolean))
      const uptimeMs = ctx.vars.roomLogger?.roomLog?.find(e => e.t === 'run version')?.uptimeMs
      const lambdaMs = Date.now() - t0
      if (res === TIMED_OUT) {
        log?.info?.({ event: uptimeMs ? `timeout - uptime ${uptimeMs}` : 'timeout - probably warmup',
          strategy: 'roomLambda', version: name }, { lambdaMs }, { ctx })
        return { error: 'timeout' }
      }
      log?.info?.({ event: 'roomLambda done', strategy: 'roomLambda', version: name }, { roomWUrl: ctx.vars.roomWUrl, lambdaMs, uptimeMs, ok: res.ok }, { ctx })
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
      if (driverMethod !== 'append' || !fileName?.startsWith('lambdas/')) return null
      const name = fileName.slice('lambdas/'.length)
      try {
      // lambdaHost: explicit override; else browser uses page origin and node uses WONDER_SERVICE_URL (on-prem) or staging.
      // node may carry a jsdom window (react tooling) - isNode decides, not window presence.
      const base = ctx.vars.lambdaHost || (!coreUtils.isNode && globalThis.window?.location?.origin)
        || globalThis.process?.env?.WONDER_SERVICE_URL || 'https://w-staging.indivi.ai'
      const roomWUrl = ctx.vars.roomWUrl.includes('://') ? ctx.vars.roomWUrl : `room://${ctx.vars.roomWUrl}`
      const route = roomWUrl.startsWith('signedRoom://') ? 'run-signed-room-lambda' : 'run-room-lambda'
      const authAt = performance.now()
      const idToken = ctx.vars.noAuth ? null : await getIdToken(ctx)
      const authMs = performance.now() - authAt
      const authHeaders = { 'Content-Type': 'application/json', ...(idToken && { 'x-user-authorization': `Bearer ${idToken}` }) }
      // forward the caller's room + the active logger names (revived server-side, kept OUT of packedCtx)
      const requestAtEpoch = Date.now()
      const body = JSON.stringify({ ...(opts.body || {}), roomWUrl, logger: activeLoggers(ctx),
        requestAtEpoch, ...(ctx.vars.noAuth && { noAuth: true }) })
      roomLogger?.info?.({ t: 'roomLambda invoke', roomId, name, roomWUrl: ctx.vars.roomWUrl,
        stream: !!opts.body?.stream, noAuth: !!ctx.vars.noAuth, authMs }, {}, { ctx })
      // route result shape is { result: { result, error, logs } }. Merge the lambda's per-logger logs INTO the caller's
      // same-named logger instances (so a test's `logger:` harvest picks them up natively), then unwrap the value.
      const streamed = !!opts.body?.stream
      const mergeLogs = logs => Object.entries(logs || {}).forEach(([lname, le]) => {
          const inst = ctx.vars[lname]
          if (inst && le) Object.entries(le).forEach(([k, arr]) => {
            if (!Array.isArray(inst[k]) || !Array.isArray(arr)) return
            inst[k].push(...arr.filter(e => !(streamed && e?.severity === 'progress')).map(e => ({ ...e, $lambda: name })))
            if (lname === 'authLogger') inst[k].sort((a, b) => (a.atEpoch || Infinity) - (b.atEpoch || Infinity))
          })
        })
      const asResponse = inner => {
        mergeLogs(inner?.logs)
        if (inner?.error) roomLogger?.error?.({ t: 'roomLambda error', roomId, name, error: inner.error }, {}, { ctx })
        return { ok: !inner?.error, status: inner?.error ? 500 : 200, text: async () => JSON.stringify(inner?.result), json: async () => inner?.result }
      }
      if (!opts.body?.stream) {
        const url = `${base}/${route}/${roomId}/${name}`
        const res = await fetch(url, { method: 'POST', headers: authHeaders, body })
        const raw = await res.text()
        let json; try { json = JSON.parse(raw) } catch {}
        if (json === undefined) {
          roomLogger?.error?.({ t: 'roomLambda non-json response', roomId, name, status: res.status, body: raw.slice(0, 500),
            hint: `non-json ${res.status}; a bare-text 503 usually means the 2Gi container was OOM-killed. `
              + `Run a lighter query or check wonder-server-staging logs for 'Memory limit ... exceeded'` }, {}, { ctx })
          return { ok: false, status: res.status,
            json: async () => ({ error: `room-lambda ${res.status}: ${raw.slice(0, 200)}` }), text: async () => raw }
        }
        if (!res.ok) {   // 401/403/... carry {error} and no result - surface it; asResponse would mask it as an ok-null (the "failed: 200" trap)
          mergeLogs(json?.logs)
          if (globalThis.window && (json?.error === 'authorization token expired'
            || typeof json?.error === 'string' && json.error.endsWith('role null for user devMachine')))
            (await import('@wonder/db/oauth2.js')).reLogin()
          roomLogger?.error?.({ t: 'roomLambda rejected', roomId, name, status: res.status, serverError: json?.error }, {}, { ctx })
          return { ok: false, status: res.status, json: async () => ({ error: json?.error || `room-lambda ${res.status}` }), text: async () => raw }
        }
        return asResponse(json.result)
      }
      // stream:true → SSE, relay progress to the stepper, return the final result
      const requestAt = performance.now()
      const res = await fetch(`${base}/${route}-sse-progress/${roomId}/${name}`, {
        method: 'POST', headers: { ...authHeaders, Accept: 'text/event-stream' }, body
      })
      const headersMs = performance.now() - requestAt, headersAtEpoch = Date.now()
      if (!res.ok) {   // gate rejected (401/403/404/...) — surface the server's reason, don't silently return undefined
        const rejected = await res.json(), serverError = rejected.error ?? res.status
        mergeLogs(rejected.logs)
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
