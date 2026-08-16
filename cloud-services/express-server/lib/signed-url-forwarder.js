// Reverse-proxies /signed-url/* to the private wonder-protected-rooms Cloud Run service.
// Uses the runtime SA's metadata server to mint a Google ID token (audience = protected URL),
// which lets the private service accept the call (it requires roles/run.invoker).
// If PROTECTED_LAMBDA_URL is unset, falls back to handling the route locally — so the same image
// can be deployed twice: public lambda forwards, protected lambda handles.
import { GoogleAuth } from 'google-auth-library'
import { setupSignedUrlRoute } from './signed-url.js'
import { authHttpLogger, safeError } from './auth-http-logger.js'

const auth = new GoogleAuth({ clientOptions: { transporterOptions: { fetchImplementation: globalThis.fetch } } })
const clientByAudience = {}
const idTokenClient = audience => clientByAudience[audience] ||= auth.getIdTokenClient(audience)

export function setupSignedUrlForwarder(app) {
    const target = process.env.PROTECTED_LAMBDA_URL
    if (!target) return setupSignedUrlRoute(app)

    const forward = async (req, res) => {
        const t0 = Date.now()
        const log = authHttpLogger(req, 'signed-url-forwarder')
        let stage = 'receive request'
        try {
            log.info({t: 'forwarder received', method: req.method, requestUrl: req.originalUrl,
                hasUserAuth: !!req.headers.authorization})
            stage = 'mint service token'
            const client = await idTokenClient(target)
            const authHeaders = await client.getRequestHeaders()
            const googleHeaders = authHeaders?.entries ? Object.fromEntries(authHeaders.entries()) : { ...authHeaders }
            const googleAuthorization = googleHeaders.authorization || googleHeaders.Authorization
            log.info({t: 'service token ready', hasServiceAuth: !!googleAuthorization})
            stage = 'call protected signer'
            const { host, authorization, ...incoming } = req.headers
            const url = target.replace(/\/$/, '') + req.originalUrl
            log.info({t: 'forwarder calling protected signer', target: url, hasUserAuth: !!authorization,
                hasServiceAuth: !!googleAuthorization})
            const init = { method: req.method, headers: { ...incoming, ...googleHeaders, ...(authorization ? { 'x-user-authorization': authorization } : {}) } }
            if (req.method !== 'GET' && req.method !== 'HEAD')
                init.body = Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body)
            const upstream = await fetch(url, init)
            stage = 'read protected response'
            const buf = Buffer.from(await upstream.arrayBuffer())
            log[upstream.ok ? 'info' : 'error']({t: 'protected signer response', status: upstream.status, ms: Date.now() - t0})
            if (req.query.logger === 'authLogger') {
                let body
                try { body = JSON.parse(buf.toString('utf8')) } catch { body = { error: buf.toString('utf8').slice(0, 500) } }
                log.merge(body.logs?.authLogger)
                return res.status(upstream.status).json(log.body(body))
            }
            res.status(upstream.status)
            upstream.headers.forEach((v, k) => res.setHeader(k, v))
            res.send(buf)
        } catch (e) {
            log.error({t: 'forwarder failed', stage, ms: Date.now() - t0, error: safeError(e)})
            res.status(502).json(log.body({error: 'signed-url forward failed', detail: String(e?.message || e)}))
        }
    }
    app.all('/signed-url/*', forward)
    app.all('/signed-urls/*', forward)
    app.all('/make/*', forward)
}
