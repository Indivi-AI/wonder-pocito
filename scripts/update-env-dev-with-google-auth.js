#!/usr/bin/env node
import dotenv from 'dotenv'
import { spawn, spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OAuth2Client } from 'google-auth-library'

const [email, password] = process.argv.slice(2)
if (!/^[^@\s]+@gmail\.com$/.test(email) || !password)
  throw new Error('Usage: npm run update-env-dev-with-google-auth -- <user@gmail.com> <password>')

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../cloud-services/express-server/.env.dev')
const envText = await readFile(envPath, 'utf8')
const env = dotenv.parse(envText)
const usersText = env.WONDER_USERS || '{}'
const users = JSON.parse(usersText.startsWith('{\\"') ? usersText.replaceAll('\\"', '"') : usersText)
const clientId = env.GOOGLE_OAUTH_CLIENT_ID || '365199207445-q87kjft2o40ird0hv5r0r9vs8l7bvund.apps.googleusercontent.com'
const clientSecret = env.CLIENT_SECRET
if (!clientSecret) throw new Error('CLIENT_SECRET is missing from .env.dev')

const redirectUri = 'http://localhost:3000/wonder.html'
const verifier = randomBytes(32).toString('base64url')
const state = randomBytes(24).toString('base64url')
const challenge = createHash('sha256').update(verifier).digest('base64url')
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
Object.entries({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid profile email', state,
  access_type: 'offline', prompt: 'consent', login_hint: email, code_challenge: challenge, code_challenge_method: 'S256' })
  .forEach(([key, value]) => authUrl.searchParams.set(key, value))

const clipboard = value => [['wl-copy', []], ['xclip', ['-selection', 'clipboard']], ['xsel', ['--clipboard', '--input']], ['pbcopy', []]]
  .some(([command, args]) => !spawnSync(command, args, { input: value, stdio: ['pipe', 'ignore', 'ignore'] }).error)
const copied = clipboard(password)
console.log(`Sign in as ${email}. ${copied ? 'The password is in your clipboard.' : 'Clipboard unavailable; use the password argument.'}`)

const updateEnv = (text, key, value) => {
  const line = `${key}=${key === 'WONDER_USERS' ? `'${value}'` : JSON.stringify(value)}`
  return new RegExp(`^${key}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${key}=.*$`, 'm'), line) : `${text.trimEnd()}\n${line}\n`
}
const done = new Promise((resolveDone, reject) => {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, redirectUri)
    if (url.pathname !== '/wonder.html') return res.writeHead(404).end()
    try {
      if (url.searchParams.get('state') !== state) throw new Error('Invalid OAuth state')
      const body = new URLSearchParams({ code: url.searchParams.get('code'), client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, code_verifier: verifier, grant_type: 'authorization_code' })
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' }, body })
      const tokens = await tokenRes.json()
      if (!tokenRes.ok || !tokens.refresh_token || !tokens.id_token) throw new Error(tokens.error_description || 'Google did not return refresh and ID tokens')
      const payload = await new OAuth2Client(clientId).verifyIdToken({ idToken: tokens.id_token, audience: clientId }).then(x => x.getPayload())
      if (payload.email !== email) throw new Error(`Authorized ${payload.email}; expected ${email}`)
      users[email] = { ...users[email], passwd: password, refreshToken: tokens.refresh_token }
      let updated = updateEnv(envText, 'WONDER_USERS', JSON.stringify(users))
      updated = updateEnv(updated, 'GOOGLE_OAUTH_CLIENT_ID', clientId)
      await writeFile(envPath, updated)
      res.end('Google authorization saved. You may close this tab.')
      console.log(`Updated .env.dev for ${email} without printing credentials.`)
      resolveDone()
    } catch (error) {
      res.statusCode = 400
      res.end(error.message)
      reject(error)
    } finally { clipboard(''); server.close() }
  }).listen(3000, '127.0.0.1')
  server.on('error', error => reject(new Error(error.code === 'EADDRINUSE' ? 'Port 3000 is busy; stop npm run local and retry' : error.message)))
})

const opener = process.platform === 'darwin' ? ['open'] : process.platform === 'win32' ? ['cmd', '/c', 'start', ''] : ['xdg-open']
const opened = spawn(opener[0], [...opener.slice(1), authUrl.href], { detached: true, stdio: 'ignore' })
opened.on('error', () => console.log(authUrl.href))
opened.unref()
await Promise.race([done, new Promise((_, reject) => setTimeout(() => reject(new Error('Google authorization timed out')), 300000).unref())])
