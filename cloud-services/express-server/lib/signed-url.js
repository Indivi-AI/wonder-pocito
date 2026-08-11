import { Storage } from '@google-cloud/storage'
import { signWonderToken, verifyToken } from './auth-utils.js'
export { signWonderToken }

const storage = new Storage()
const bucket = storage.bucket('indiviai-wonder-protected')
const SIGN_EXPIRY = 24 * 60 * 60 * 1000
const REFRESH_THRESHOLD = 60 * 60 * 1000
const MAX_ENTRIES = 1000

export async function readJson(path) {
  try {
    const [buf] = await bucket.file(path).download()
    return JSON.parse(buf.toString('utf8'))
  } catch (e) { return e.code === 404 ? null : Promise.reject(e) }
}

const writeJson = (path, data) => bucket.file(path).save(JSON.stringify(data), { contentType: 'application/json' })

export function getRole(users, identity) {
  if (!users) return null
  if (users.admins?.includes(identity)) return 'admin'
  if (users.users?.includes(identity) || users.users?.includes('authenticated')) return 'user'
  return null
}

function checkAccess(users, accessLevel, role, action, identity, pathUserId) {
  const perms = users.accessLevels?.[accessLevel]?.[role] || ''
  if (perms.includes('u') && identity !== pathUserId) return false
  return action === 'read' ? perms.includes('r') : perms.includes('w')
}

async function signFile(gcsPath, action) {
  const exp = Date.now() + SIGN_EXPIRY
  const [url] = await bucket.file(gcsPath).getSignedUrl({
    version: 'v4', action, expires: exp,
    ...(action === 'write' && { contentType: 'application/json' })
  })
  return { url, exp }
}

const signaturesPath = (roomId, role, pathUserId) => pathUserId
  ? `${roomId}/userProtected/${pathUserId}/signatures.json`
  : `${roomId}/admin/signatures-${role}.json`
const sigKey = (fileName, action) => `${fileName}:${action}`
const signIndividually = path => path.split('/').includes('logs')

function makeTiming() {
  const startTime = Date.now(), timing = [{label: 'start', at: 0}]
  const tick = label => {
    const now = Date.now() - startTime
    timing.at(-1).duration = now - timing.at(-1).at
    timing.push({label, at: now})
  }
  return { timing, tick }
}

// mutates sigs in place; returns true only when a signature was minted/refreshed or entries evicted.
// callers persist sigs only when changed — a read with still-valid signatures writes nothing,
// so a burst of parallel reads never exceeds GCS's 1-write/sec/object limit on the shared sigs file.
async function makeSignatures(sigs, filesToSign) {
  const now = Date.now()
  let changed = false
  await Promise.all(filesToSign.map(async ({ gcsPath, fileName, action }) => {
    const key = sigKey(fileName, action)
    const entry = sigs[key]
    if (!entry || !entry.exp || entry.exp - now < REFRESH_THRESHOLD) {
      const { url, exp } = await signFile(gcsPath, action)
      sigs[key] = { url, exp, lastRequest: now }
      changed = true
    } else {
      entry.lastRequest = now
    }
  }))
  const keys = Object.keys(sigs)
  if (keys.length > MAX_ENTRIES) {
    keys.sort((a, b) => (sigs[a].lastRequest || 0) - (sigs[b].lastRequest || 0))
    keys.slice(0, keys.length - MAX_ENTRIES).forEach(k => delete sigs[k])
    changed = true
  }
  return changed
}

export function setupSignedUrlRoute(app) {
  app.get('/signed-url/*', async (req, res) => {
    const { timing, tick } = makeTiming()
    try {
      const token = req.headers['x-user-authorization']?.replace('Bearer ', '')
      if (!token) return res.status(401).json({ error: 'missing token' })
      tick('verifyToken')
      const { email } = await verifyToken(token)

      const [roomId, accessLevel, ...rest] = req.params[0].split('/')
      const pathUserId = accessLevel === 'userProtected' ? rest.shift() : null
      const fileName = rest.join('/')
      const method = (req.query.method || 'GET').toUpperCase()
      const action = method === 'GET' || method === 'HEAD' ? 'read' : 'write'

      tick('getUsers')
      const users = await readJson(`${roomId}/admin/users.json`)
      tick('checkAccess')
      const role = getRole(users, email)
      console.log('signed-url check', { email, role, roomId, accessLevel, action, hasUsers: !!users, admins: users?.admins })
      if (!checkAccess(users, accessLevel, role, action, email, pathUserId))
        return res.status(403).json({ error: 'access denied' })

      const fileInRoom = `${accessLevel}/${fileName}`
      const gcsPath = `${roomId}/${fileInRoom}`
      if (signIndividually(fileInRoom)) {
        tick('signFile')
        const { url } = await signFile(gcsPath, action)
        tick('return')
        return res.json({ signedUrl: url, timing })
      }
      const sigPath = signaturesPath(roomId, role, pathUserId)
      tick('readSigs')
      const sigs = await readJson(sigPath) || {}
      const entryKey = sigKey(fileInRoom, action)
      tick('makeSignatures')
      const changed = await makeSignatures(sigs, [{ gcsPath, fileName: fileInRoom, action }])
      tick('writeSigs')
      if (changed) await writeJson(sigPath, sigs)
      tick('return')
      res.json({ signedUrl: sigs[entryKey].url, signatures: sigs, timing })
    } catch (err) {
      tick('error')
      console.error('signed-url error', timing, err)
      res.status(500).json({ error: err.stack || String(err), timing })
    }
  })

  app.get('/signed-urls/:roomId', async (req, res) => {
    const { timing, tick } = makeTiming()
    try {
      const token = req.headers['x-user-authorization']?.replace('Bearer ', '')
      if (!token) return res.status(401).json({ error: 'missing token' })
      tick('verifyToken')
      const { email } = await verifyToken(token)

      tick('getUsers')
      const { roomId } = req.params
      const users = await readJson(`${roomId}/admin/users.json`)
      const role = getRole(users, email)
      if (!role) return res.status(403).json({ error: `${email} is not a member of room ${roomId}` })

      tick('readSigs')
      const sigPath = signaturesPath(roomId, role)
      const sigs = await readJson(sigPath) || {}
      const excludedKeys = Object.keys(sigs).filter(key => signIndividually(key.replace(/:(read|write)$/, '')))
      excludedKeys.forEach(key => delete sigs[key])
      let changed = excludedKeys.length > 0
      const now = Date.now(), keys = Object.keys(sigs)
      if (!changed && keys.length && keys.every(k => sigs[k].exp - now >= REFRESH_THRESHOLD)) {
        tick('return')
        return res.json({ signatures: sigs, timing, cached: true })
      }
      const levelActions = Object.entries(users.accessLevels || {})
        .map(([al, perms]) => {
          const p = perms[role] || ''
          return p ? [al, [...(p.includes('r') ? ['read'] : []), ...(p.includes('w') ? ['write'] : [])]] : null
        }).filter(Boolean)
      tick('listFiles')
      const fileListResults = await Promise.all(levelActions.map(([al]) => bucket.getFiles({ prefix: `${roomId}/${al}/` })))
      const filesToSign = fileListResults.flatMap(([files], i) =>
        files.filter(f => !f.name.replace(`${roomId}/`, '').startsWith('admin/signatures-') && !signIndividually(f.name))
          .flatMap(f => levelActions[i][1].map(action => ({ gcsPath: f.name, fileName: f.name.replace(`${roomId}/`, ''), action })))
      )
      tick('makeSignatures')
      changed = await makeSignatures(sigs, filesToSign) || changed
      tick('writeSigs')
      if (changed) await writeJson(sigPath, sigs)
      tick('return')

      res.json({ signatures: sigs, timing })
    } catch (err) {
      tick('error')
      console.error('signed-urls error', timing, err)
      res.status(500).json({ error: err.stack || String(err), timing })
    }
  })

}
