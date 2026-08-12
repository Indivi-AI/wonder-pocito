// Reverse-proxies /signed-url/* to the private wonder-protected-rooms Cloud Run service.
// Uses the runtime SA's metadata server to mint a Google ID token (audience = protected URL),
// which lets the private service accept the call (it requires roles/run.invoker).
// If PROTECTED_LAMBDA_URL is unset, falls back to handling the route locally — so the same image
// can be deployed twice: public lambda forwards, protected lambda handles.
import { GoogleAuth } from 'google-auth-library'
import { coreUtils } from '@jb6/core'
import { setupSignedUrlRoute } from './signed-url.js'

const auth = new GoogleAuth()
const clientByAudience = {}
const idTokenClient = audience => clientByAudience[audience] ||= auth.getIdTokenClient(audience)

export function setupSignedUrlForwarder(app) {
    const target = process.env.PROTECTED_LAMBDA_URL
    if (!target) {
        console.log('[signed-url-forwarder] PROTECTED_LAMBDA_URL unset — handling locally') // log to delete
        return setupSignedUrlRoute(app)
    }
    console.log('[signed-url-forwarder] forwarding /signed-url/* →', target) // log to delete

    const forward = async (req, res) => {
        const t0 = Date.now()
        const debugLogs = req.headers['x-wonder-debug-logs'] === '1'
        const ctx = debugLogs ? coreUtils.ensureLoggers('signedRoomLogger') : null
        const log = ctx?.vars.signedRoomLogger
        try {
            log?.info?.({ t: 'public signer entered', method: req.method, path: req.path, target,
                incomingUserAuth: !!req.headers.authorization }, {}, { ctx })
            const client = await idTokenClient(target)
            const authHeaders = await client.getRequestHeaders()
            const googleHeaders = authHeaders?.entries ? Object.fromEntries(authHeaders.entries()) : { ...authHeaders }
            const googleAuthorization = googleHeaders.authorization || googleHeaders.Authorization
            log?.info?.({ t: 'Google ID token headers ready', headersType: authHeaders?.constructor?.name,
                enumerableKeys: Object.keys(authHeaders || {}), normalizedKeys: Object.keys(googleHeaders), hasGoogleAuthorization: !!googleAuthorization }, {}, { ctx })
            console.log('[signed-url-forwarder] →', req.method, req.originalUrl, 'token?', !!authHeaders.Authorization, 'userAuth?', !!req.headers.authorization) // log to delete
            const { host, authorization, ...incoming } = req.headers
            const url = target.replace(/\/$/, '') + req.originalUrl
            const init = { method: req.method, headers: { ...incoming, ...googleHeaders, ...(authorization ? { 'x-user-authorization': authorization } : {}) } }
            log?.info?.({ t: 'public signer sending protected request', url, hasGoogleAuthorization: !!googleAuthorization,
                hasUserAuthorization: !!authorization }, {}, { ctx })
            if (req.method !== 'GET' && req.method !== 'HEAD')
                init.body = Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body)
            const upstream = await fetch(url, init)
            const buf = Buffer.from(await upstream.arrayBuffer())
            log?.info?.({ t: 'protected signer response', status: upstream.status, contentType: upstream.headers.get('content-type'), ms: Date.now() - t0 }, {}, { ctx })
            console.log('[signed-url-forwarder] ←', upstream.status, `${Date.now()-t0}ms`, upstream.status >= 400 ? buf.toString('utf8').slice(0, 500) : '') // log to delete
            if (debugLogs) {
                let body
                try { body = JSON.parse(buf.toString('utf8')) } catch { body = { error: buf.toString('utf8').slice(0, 500) } }
                const logs = coreUtils.harvestLogs(ctx, ['signedRoomLogger'])
                const protectedLogs = body.logs?.signedRoomLogger
                if (protectedLogs) Object.entries(protectedLogs).forEach(([channel, entries]) =>
                    logs.signedRoomLogger[channel]?.push(...entries))
                return res.status(upstream.status).json({ ...body, logs })
            }
            res.status(upstream.status)
            upstream.headers.forEach((v, k) => res.setHeader(k, v))
            res.send(buf)
        } catch (e) {
            log?.error?.({ t: 'public signer failed', ms: Date.now() - t0 }, {}, { ctx, error: e })
            console.error('[signed-url-forwarder] forward failed:', e.stack || e) // log to delete
            res.status(502).json({ error: 'signed-url forward failed', detail: String(e?.message || e),
                ...(debugLogs && { logs: coreUtils.harvestLogs(ctx, ['signedRoomLogger']) }) })
        }
    }
    app.all('/signed-url/*', forward)
    app.all('/signed-urls/*', forward)
    app.all('/make/*', forward)
}
