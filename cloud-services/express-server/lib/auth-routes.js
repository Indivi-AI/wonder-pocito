import cookieParser from 'cookie-parser'

const googleToken = body => fetch('https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
})

export function setupAuthRoutes(app) {
  app.use(cookieParser())
  app.get('/getAccessAndRefreshToken', async (req, res) => {
    try {
      const { code, code_verifier, client_id, redirect_uri, ios } = req.query
      if (!code || !code_verifier || !client_id || !redirect_uri) return res.status(400).json({ error: 'missing OAuth parameters' })
      const params = new URLSearchParams({ code, client_id, redirect_uri, code_verifier, grant_type: 'authorization_code' })
      if (ios !== 'true') params.set('client_secret', process.env.CLIENT_SECRET || '')
      const response = await googleToken(params), tokens = await response.json()
      if (!response.ok) return res.status(response.status).json(tokens)
      tokens.expiresAt = Date.now() + tokens.expires_in * 1000
      if (tokens.refresh_token) res.cookie('refresh_token', tokens.refresh_token, {
        httpOnly: true, secure: process.env.NODE_ENV !== 'DEVELOPMENT', maxAge: 365 * 86400000, path: '/',
        ...(process.env.NODE_ENV === 'DEVELOPMENT' ? {} : { domain: '.indivi.ai' }),
        sameSite: process.env.NODE_ENV === 'DEVELOPMENT' ? 'lax' : 'strict'
      })
      res.json(Object.fromEntries(Object.entries(tokens).filter(([key]) => key !== 'refresh_token')))
    } catch (error) { res.status(500).json({ error: error.message }) }
  })
  app.get('/refreshAccessToken', async (req, res) => {
    try {
      const refreshToken = req.cookies.refresh_token, clientId = req.query.client_id || req.body?.client_id
      if (!refreshToken) return res.status(401).json({ error: 'No refresh token found. Please log in again.' })
      if (!clientId) return res.status(400).json({ error: 'Missing required parameter: client_id' })
      const params = new URLSearchParams({ client_id: clientId, refresh_token: refreshToken, grant_type: 'refresh_token' })
      if (req.query.ios !== 'true') params.set('client_secret', process.env.CLIENT_SECRET || '')
      const response = await googleToken(params)
      if (!response.ok) return res.sendStatus(response.status)
      const tokens = await response.json()
      res.json({ ...tokens, expiresAt: Date.now() + tokens.expires_in * 1000 })
    } catch (error) { res.status(500).json({ error: error.message }) }
  })
}
