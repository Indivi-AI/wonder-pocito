import { dsls } from '@jb6/core'

const { tgp: { CtxEnricher } } = dsls

const googleTestUser = CtxEnricher('googleTestUser', {
  params: [
    {id: 'envName', as: 'string', mandatory: true}
  ],
  impl: async (ctx, {}, { envName }) => {
    if (process.env.WONDER_AUTH_MODE == 'none') return ctx
    const email = process.env[envName]?.split(':', 1)[0]
    const refreshToken = JSON.parse(process.env.WONDER_USERS || '{}')[email]?.refreshToken
    if (!email || !refreshToken) throw new Error(`WONDER_USERS has no refresh token for ${email || envName}`)
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET, refresh_token: refreshToken, grant_type: 'refresh_token' })
    })
    const body = await res.json()
    if (!res.ok || !body.id_token) throw new Error(body.error_description || body.error || 'Google returned no ID token')
    return ctx.setVars({ idToken: body.id_token, userEmail: email })
  }
})
CtxEnricher('testAdminUser', {
  impl: googleTestUser('ADMIN_WONDER_EMAIL')
})
CtxEnricher('testUser', {
  impl: googleTestUser('USER_WONDER_EMAIL')
})
