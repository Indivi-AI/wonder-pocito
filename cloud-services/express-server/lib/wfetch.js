import { jb, coreUtils } from '@jb6/core'
import '@wonder/ai/doclet-storage.js'

const methods = {GET: 'r', HEAD: 'r', PUT: 'w', POST: 'w', PATCH: 'w'}
const headerNames = ['content-type', 'content-length', 'content-location', 'etag', 'last-modified', 'generation']

export const setupWfetch = app => app.post('/wfetch', async (req, res) => {
  try {
    const {url, method: rawMethod = 'GET', body, headers = {}, responseType = 'json', categories = [], logger = ''} = req.body || {}
    const method = rawMethod.toUpperCase(), baseCtx = new coreUtils.Ctx().setVars(jb.wonderUtils.storageEnvVars())
    const parsed = url && jb.wonderUtils.extractFromUrl(url, baseCtx)
    if (!['room', 'signedRoom'].includes(parsed?.scope?.id) || !parsed.roomId || !parsed.fileName)
      return res.status(400).json({error: 'url must be a room WURL with a resource path'})
    if (!methods[method] || !['json', 'text'].includes(responseType)) return res.status(405).json({error: 'unsupported operation'})
    const signed = parsed.scope.id == 'signedRoom', noAuth = process.env.WONDER_AUTH_MODE === 'none'
    if (noAuth && signed) return res.status(400).json({error: 'signed rooms are disabled'})
    let who
    if (!noAuth) {
      const {caller, roomPolicy, roleOf, canAccess} = await import('./auth-utils.js'), policy = signed && await roomPolicy(parsed.roomId)
      if (signed && !policy) return res.status(404).json({error: `no signed room ${parsed.roomId}`})
      try { who = await caller(req) } catch { return res.status(401).json({error: 'invalid authorization token'}) }
      if (!who && (signed || methods[method] == 'w')) return res.status(401).json({error: 'login required'})
      const role = who ? roleOf(policy, who.email) : 'authenticated', dir = parsed.fileName.split('/')[0]
      if (!role || !canAccess(policy, dir, methods[method], role)) return res.status(403).json({error: `forbidden ${method} ${dir}`})
    }
    const loggerNames = logger.split(',').map(name => name.trim()).filter(Boolean)
    const roomWUrl = url.match(/^(?:room|signedRoom)(?::[^/]*)?\/\/[^/?#]+/)?.[0]
    const ctx = coreUtils.ensureLoggers(loggerNames, {ctx: baseCtx}).setVars({roomId: parsed.roomId, roomWUrl,
      categories: Object.fromEntries(categories.map(category => [category, true])),
      ...(who && {idToken: who.token, userEmail: who.email})})
    const safeHeaders = Object.fromEntries(Object.entries(headers).filter(([name]) =>
      !['authorization', 'x-wonder-body'].includes(name.toLowerCase())))
    const response = await jb.wonderUtils.wfetch2(url, {method, body, headers: safeHeaders}, ctx)
    const responseHeaders = Object.fromEntries(headerNames.map(name => [name, response.headers?.get?.(name)]).filter(([, value]) => value != null))
    const responseBody = method == 'HEAD' ? null : await response[responseType]()
    return res.status(response.status || 500).json({ok: !!response.ok, status: response.status, statusText: response.statusText,
      headers: responseHeaders, body: responseBody, ...(loggerNames.length && {logs: coreUtils.harvestLogs(ctx, loggerNames)})})
  } catch (error) { return res.status(500).json({error: error.message || String(error)}) }
})
