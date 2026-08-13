import { OAuth2Client } from 'google-auth-library'
import { createHash, createHmac } from 'node:crypto'
import { getRole, readJson } from './signed-url.js'

export const WONDER_ADMINS = ['shaiby@artwaresoft.com', 'yiftach@indivi.ai', 'roee@indivi.ai']

const oauthClient = new OAuth2Client({ transporterOptions: { fetchImplementation: globalThis.fetch } })
const clientIds = [
  '365199207445-q87kjft2o40ird0hv5r0r9vs8l7bvund.apps.googleusercontent.com',
  '365199207445-f9hqa8n0u6s7dpssq86n4ncqm3ef676v.apps.googleusercontent.com'
]
const secret = () => process.env.WONDER_TOKEN
const hmac = data => createHmac('sha256', secret()).update(data).digest('base64url')
const b64url = value => Buffer.from(value).toString('base64url')
const tokenCache = new Map(), policyCache = new Map()

export const PUBLIC_DEFAULT = {
  accessLevels: { usersRO: { authenticated: 'r' }, usersRW: { authenticated: 'rw' }, admin: { authenticated: 'r' } }
}
export const roomPolicy = async roomId => {
  const cached = policyCache.get(roomId)
  if (cached?.at > Date.now() - 30000) return cached.policy
  const policy = await readJson(`${roomId}/admin/users.json`)
  policyCache.set(roomId, { policy, at: Date.now() })
  return policy
}
export const roleOf = (policy, email) => policy ? getRole(policy, email) : 'authenticated'
export const canAccess = (policy, dir, permission, role) => ((policy || PUBLIC_DEFAULT).accessLevels?.[dir]?.[role] || '').includes(permission)

export function signWonderToken(payload) {
  const header = b64url('{"alg":"HS256","typ":"JWT"}')
  const body = b64url(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 }))
  return `${header}.${body}.${hmac(`${header}.${body}`)}`
}

export function verifyWonderToken(token) {
  const [header, body, signature] = token.split('.')
  if (hmac(`${header}.${body}`) !== signature) return null
  const payload = JSON.parse(Buffer.from(body, 'base64url'))
  return payload.exp < Date.now() / 1000 ? null : payload
}

export async function verifyToken(token) {
  const key = createHash('sha256').update(token).digest('base64url'), cached = tokenCache.get(key)
  if (cached?.until > Date.now()) return cached.payload
  const wonder = secret() && verifyWonderToken(token)
  const payload = wonder ? { email: wonder.phone, exp: wonder.exp } : (await oauthClient.verifyIdToken({ idToken: token })).getPayload()
  tokenCache.set(key, { payload, until: Math.min(payload.exp * 1000 || Infinity, Date.now() + 600000) })
  return payload
}

export async function caller(req) {
  const token = req.headers['x-user-authorization']?.replace(/^Bearer /, '')
  if (!token) return null
  return { email: (await verifyToken(token)).email, token }
}

export async function proxyRoomCaller(req, roomId) {
  const token = req.headers['x-wonder-proxy-auth']?.replace(/^Bearer /, '')
  if (!token || !roomId) return { status: 401, error: 'missing proxy authentication or room' }
  const { email } = await verifyToken(token), role = roleOf(await roomPolicy(roomId), email)
  return role ? { email, role } : { status: 403, error: `${email} is not a member of room ${roomId}` }
}

async function emailFromRefreshToken(refreshToken) {
  for (const clientId of clientIds) {
    const body = new URLSearchParams({ client_id: clientId, client_secret: process.env.CLIENT_SECRET || '', refresh_token: refreshToken, grant_type: 'refresh_token' })
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
    })
    if (!response.ok) continue
    const { id_token: token } = await response.json()
    if (token) return (await verifyToken(token)).email
  }
}

export async function verifyAdmin(req) {
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  const email = bearer ? await verifyToken(bearer).then(x => x.email).catch(() => null)
    : req.cookies?.refresh_token ? await emailFromRefreshToken(req.cookies.refresh_token) : null
  return WONDER_ADMINS.includes(email) && email
}
