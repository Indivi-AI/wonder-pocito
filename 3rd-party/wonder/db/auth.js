import { coreUtils, dsls } from '@jb6/core'

const { common: { Data }, test: { Logger, logger: { domainLogger } } } = dsls
Logger('authLogger', { impl: domainLogger('auth', 'roomId,email') })
const registry = { accessTokenByScope: {} }
const authStore = () => globalThis.localStorage
export const readAuth = () => { try { return JSON.parse(authStore()?.getItem('auth2') || '{}') } catch { return {} } }
export const writeAuth = auth => authStore()?.setItem('auth2', JSON.stringify(auth))
export const currentPrincipal = () => readAuth().sub || readAuth().email || 'anon'
const localhostServer = ctx => ctx?.vars?.localhostServer || globalThis.process?.env?.WONDER_LOCAL_SERVER || 'http://localhost:3000'
const isLocalHost = ctx => ctx?.vars?.isLocalHost ?? !!(globalThis.location?.hostname === 'localhost' || globalThis.location?.hostname?.startsWith('192.168'))

const devEmail = async ctx => {
  if (!coreUtils.isNode) {
    const email = readAuth().email
    if (email) return email
    await import('@jb6/core/misc/jb-cli.js')
    return (await coreUtils.runCliInContext(`import { coreUtils } from '@jb6/core'
import { auth } from '@wonder/db/auth.js'
await coreUtils.writeServiceResult(await auth.devEmail(new coreUtils.Ctx()))`, { ctx, expressUrl: localhostServer(ctx) })).result || ''
  }
  const { readFile } = await import('fs/promises')
  const config = await readFile(`${process.env.HOME}/.config/gcloud/configurations/config_default`, 'utf8').catch(() => '')
  return config.match(/^account\s*=\s*(.+)$/m)?.[1].trim() || ''
}

const hasGcpIdentity = async () => {
  if (!coreUtils.isNode) return false
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.K_SERVICE) return true
  const { access } = await import('fs/promises')
  return access(`${process.env.HOME}/.config/gcloud/application_default_credentials.json`).then(() => true, () => false)
}

const wonderIdToken = async ctx => {
  const dbLogger = ctx?.vars.dbLogger
  if (ctx?.vars.idToken) return ctx.vars.idToken
  if (!coreUtils.isNode) {
    const stored = readAuth()
    if (stored.id_token && (!stored.expiresAt || stored.expiresAt > Date.now())) return stored.id_token
    if (isLocalHost(ctx)) {
      const email = stored.email || await devEmail(ctx)
      const id_token = await fetch(`${localhostServer(ctx)}/mint-wonder-token?email=${encodeURIComponent(email)}`).then(r => r.text())
      writeAuth({ ...stored, id_token, email, expiresAt: Date.now() + 86400e3 })
      return id_token
    }
    if (stored.id_token) await (await import('./oauth2.js')).handleAuth()
    if (readAuth().id_token) return readAuth().id_token
    return dbLogger?.error?.({ t: 'wonderIdToken: login required' }, {}, { ctx }) || null
  }
  if (registry.idToken) return registry.idToken
  if (process.env.K_SERVICE) {
    const { GoogleAuth } = await import('google-auth-library')
    const headers = await (await new GoogleAuth().getIdTokenClient('unused')).getRequestHeaders()
    return registry.idToken = (headers.get?.('authorization') || headers.authorization || headers.Authorization).split(' ')[1]
  }
  return registry.idToken = fetch(`${localhostServer(ctx)}/mint-wonder-token?email=${encodeURIComponent(await devEmail(ctx))}`).then(r => r.text())
}

const gcpAccessToken = async (ctx, { method = 'GET' } = {}) => {
  const scope = ['GET', 'HEAD'].includes(method) ? 'devstorage.read_only' : 'devstorage.read_write'
  if (registry.accessTokenByScope[scope]) return registry.accessTokenByScope[scope]
  if (process.env.K_SERVICE) {
    const { GoogleAuth } = await import('google-auth-library')
    return registry.accessTokenByScope[scope] = (await (await new GoogleAuth({ scopes: [`https://www.googleapis.com/auth/${scope}`] }).getClient()).getAccessToken()).token
  }
  const { readFileSync, writeFileSync, mkdirSync } = await import('fs')
  const file = `/tmp/wonder/gcs-adc-machine-access-token.${scope}.json`
  try { const c = JSON.parse(readFileSync(file, 'utf8')); if (Date.now() - c.at < 3000e3) return registry.accessTokenByScope[scope] = c.token } catch {}
  const token = (await import('child_process')).execSync('gcloud auth application-default print-access-token', { encoding: 'utf8' }).trim()
  mkdirSync('/tmp/wonder', { recursive: true }); writeFileSync(file, JSON.stringify({ token, at: Date.now() }))
  return registry.accessTokenByScope[scope] = token
}

let storage, nativeStorage
const gcpStorage = async (ctx, { native = false } = {}) => {
  const { Storage } = await import('@google-cloud/storage')
  if (native) return nativeStorage ||= new Storage()
  if (storage) return storage
  const token = await auth.gcpAccessToken(ctx, { method: 'POST' })
  const authClient = { getRequestHeaders: async () => ({ Authorization: `Bearer ${token}` }),
    getAccessToken: async () => token, request: async () => ({}) }
  return storage = new Storage({ authClient })
}

export const auth = { currentPrincipal, devEmail, hasGcpIdentity, wonderIdToken, gcpAccessToken, gcpStorage }

Data('mintWonderAuth2', { impl: ctx => auth.wonderIdToken(ctx).then(id_token => ({ auth2: { id_token, access_token: id_token, expiresAt: 9999999999999 } })) })
