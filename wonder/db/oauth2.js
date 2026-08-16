import { reactUtils } from '@jb6/react'
import { readAuth, writeAuth } from './auth.js'

const { h, useState } = reactUtils
const encode = (text) => {
    if (typeof Buffer !== 'undefined') return Buffer.from(text, 'utf-8')
    if (globalThis.TextEncoder) return new TextEncoder().encode(text)
    throw new Error('No text encoder available')
}

const isIOSWebView = navigator.userAgent === "wonder-ios"
const isLocalHost = location.hostname === 'localhost' || location.hostname.startsWith('192.168')
const lambdaServerBase = location.origin

const authConfig = 
  isIOSWebView ? {
      clientId: '365199207445-n99rrv6nma73vpk4t1vvv3t9otauq98s.apps.googleusercontent.com', // Replace with actual iOS client ID
      redirectUri: 'com.googleusercontent.apps.365199207445-n99rrv6nma73vpk4t1vvv3t9otauq98s:/oauth2redirect' // iOS custom URL scheme
  } : isLocalHost ? {
      clientId: '365199207445-q87kjft2o40ird0hv5r0r9vs8l7bvund.apps.googleusercontent.com',
      redirectUri: 'http://localhost:3000/wonder.html'
  } : {
      clientId: '365199207445-f9hqa8n0u6s7dpssq86n4ncqm3ef676v.apps.googleusercontent.com',
      redirectUri: window.location.origin
  }

export const { code } = Object.fromEntries(new URLSearchParams(location.search).entries())
export const { noAuth } = Object.fromEntries([...new URLSearchParams(location.search).entries(), ...new URLSearchParams(location.hash.replace(/^#/, '?')).entries()])

function getAuthState({loginButtonRequest} = {}) {
  const auth = readAuth()
  const has_access_token = auth && auth.access_token
  const access_token_not_expired = auth && auth.expiresAt && Date.now() < auth.expiresAt
  const loginState = loginButtonRequest ? 'AUTH_INITIATED'
    : code ? 'GOT_CODE'
    : !has_access_token ? 'UNAUTHENTICATED'
    :  !access_token_not_expired ? 'ACCESS_TOKEN_EXPIRED'
    : 'AUTHENTICATED'
  return loginState
}

export function getAuthorizationHeaders(ctx) {
  const access_token = globalThis.localStorage && JSON.parse(localStorage.getItem('auth2') || '{}')?.access_token
  if (!access_token) 
    ctx.vars.errorLogger.error({ t: 'access token missing' }, {}, {ctx})
  return { 'Authorization': `Bearer ${access_token}` }
}

export async function ensureLogin(ctx, el = globalThis.document?.getElementById('root') || globalThis.document?.body) {
  const { createRoot, h } = ctx.vars.react
  if (await handleAuth({ctx})) return true
  ctx.vars.uiLogger?.info?.({t:'startingAuth'}, {}, {ctx})
  createRoot(el).render(h(LoginScreen))
  return false
}

export function reLogin() {
  localStorage.removeItem('auth2')
  const url = new URL(location.href)
  url.searchParams.delete('noAuth')
  location.replace(url)
}

export async function handleAuth(params) {
  if (noAuth != null)
    return true
  const authState = getAuthState(params)
  const { loginButtonRequest, scopes = [] } = params || {}
  const defaultScopes = 'openid profile email'
  const requestedScopes = scopes.length > 0 ? scopes.join(' ') : defaultScopes
  switch (authState) {
    case 'AUTH_INITIATED': {
      const state = randomString()
      const codeVerifier = randomString()
      const challenge = await sha256(codeVerifier)

      // Store the full current URL for post-auth redirect
      localStorage.setItem('post_auth_redirect_url', window.location.href)

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${authConfig.clientId}` +
        `&redirect_uri=${encodeURIComponent(authConfig.redirectUri)}` +
        `&response_type=code&scope=${encodeURIComponent(requestedScopes)}` +
        `&state=${state}&access_type=offline&prompt=consent` +
        (scopes.length > 0 ? '&include_granted_scopes=true' : '') +
        `&code_challenge=${challenge}&code_challenge_method=S256`

      localStorage.setItem("pending_auth", JSON.stringify({ state, codeVerifier }))
      window.location.href = authUrl
      break
    }
  
    case 'GOT_CODE':
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      const pendingJson = localStorage.getItem("pending_auth")
      const pending = pendingJson ? JSON.parse(pendingJson) : null
      if (!pending || pending.state !== state) {
        console.log('Invalid state:', state)
        return
      }
      const query = new URLSearchParams({ code, client_id: authConfig.clientId, redirect_uri: authConfig.redirectUri,
        code_verifier: pending.codeVerifier, ios: String(isIOSWebView) })
      const tokenUrl = `${accessAndRefreshTokenEndpoint()}?${query}`
      console.log('Token URL:', tokenUrl)
      const res = await fetch(tokenUrl,
       {
        credentials: 'include'
      })
      if (!res.ok){
        console.log('replicate with CURL:')
        console.log('OAuth token exchange failed', { code, clientId: authConfig.clientId, redirectUri: authConfig.redirectUri })
        console.log('Error fetching access token:', res.statusText)
        return
      }
      const authData = await res.json() // Access token  + also refreshToken is set a Http-Only cookie
      const [ , payloadB64 ] = authData.id_token.split('.')
      const userDetails = JSON.parse(atob(payloadB64))
      const mergedAuthData = {...authData, ...userDetails}
      writeAuth(mergedAuthData)
      
      // Restore the original URL if present
      const redirectUrl = localStorage.getItem('post_auth_redirect_url')
      if (redirectUrl) {
        localStorage.removeItem('post_auth_redirect_url')
        window.location.replace(redirectUrl)
        return true
      }
      // Clean URL by removing all query parameters after successful authentication
      const cleanUrl = window.location.pathname
      window.history.replaceState({}, document.title, cleanUrl)
      
      return true

    case 'ACCESS_TOKEN_EXPIRED':
      const auth = readAuth()    
      const refreshEndpoint = `${lambdaServerBase}/refreshAccessToken?client_id=${authConfig.clientId}&ios=${isIOSWebView ? 'true' : 'false'}`
      const timeout = new Promise((_, reject) => setTimeout(() => reject(), 5000))
      const refreshRes = await Promise.race([
        fetch(refreshEndpoint, { method: 'GET', credentials: 'include' }),
        timeout
      ]).catch(() => null)
      if (!refreshRes || !refreshRes.ok) {
        localStorage.removeItem('auth2')
        window.location.href = window.location.pathname
        return
      }
      
      const tokenData = await refreshRes.json()
      
      const updatedAuth = {
        ...auth,
        access_token: tokenData.access_token,
        ...(tokenData.id_token && { id_token: tokenData.id_token }),
        token_type: tokenData.token_type,
        expires_in: tokenData.expires_in,
        expiresAt: tokenData.expiresAt
      }
      
      writeAuth(updatedAuth)
      return updatedAuth
        

    case 'AUTHENTICATED':
        return true
  
    case 'UNAUTHENTICATED':
      return false
  }
}

const randomString = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)

const sha256 = async text => {
  const buffer = await crypto.subtle.digest('SHA-256', encode(text))
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const accessAndRefreshTokenEndpoint = () => `${lambdaServerBase}/getAccessAndRefreshToken`

// ** login screen usage in wonder.html **
export const LoginScreen = () => {
  const colors = { primary: '[#e8ab16]', secondary: '[#324a60]', background: 'amber-50', accent: 'amber-500', danger: 'red-500' }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  const handleGoogleLogin = async () => {
    setLoading(true)
    setError(null)
    try {
      await handleAuth({loginButtonRequest: true})
    } catch (error) {
      console.error('Login error:', error)
      setError('Authentication failed. Please try again.')
      setLoading(false)
    }
  }
  
  return h(`div:min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-${colors.background}`, {},
    h('div:w-full max-w-md', {},
      h('div:text-center mb-8', {},
        h('div:flex justify-center mb-3', {},
          h('div:w-16 h-16 rounded-full flex items-center justify-center bg-amber-500 text-white shadow-[0_8px_24px_rgba(232,171,22,0.30)]', {},
            h('div:text-3xl font-bold -translate-y-[2px]', {}, 'W')
          )
        ),
        h('h1:text-2xl font-bold text-gray-800 mb-1', {}, 'Wonder'),
        h('p:text-gray-500', {}, 'An app full of wonder')
      ),
  
      h('div:bg-white rounded-xl shadow-xl p-8 mb-6', {},
        h('h2:text-xl font-semibold text-gray-800 mb-6 text-center', {}, 'Sign in to continue'),
        error && h('div:mb-4 p-3 bg-red-50 text-red-700 rounded-md text-sm', {}, error),
  
        h(`button:w-full flex items-center justify-center py-3 px-4 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors ${
          loading ? 'opacity-70 cursor-not-allowed' : ''}`,
          { onClick: handleGoogleLogin, disabled: loading, type: 'button' },
          loading
            ? h('L:Loader:h-5 w-5 animate-spin mr-2 text-gray-600', {})
            : h('div:mr-3 flex-shrink-0', {},
                h('svg:w-6 h-6', { viewBox: '0 0 24 24', xmlns: 'http://www.w3.org/2000/svg' },
                  h('path', { d: 'M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z', fill: '#4285F4' }),
                  h('path', { d: 'M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53'
                    + 'H2.18v2.84C3.99 20.53 7.7 23 12 23z', fill: '#34A853' }),
                  h('path', { d: 'M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z', fill: '#FBBC05' }),
                  h('path', { d: 'M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07'
                    + 'l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z', fill: '#EA4335' })
                )
              ),
          h('span:text-gray-700 font-medium', {}, loading ? 'Signing in…' : 'Sign in with Google')
        )
      ),
  
      h('div:text-center text-sm text-gray-500', {},
        'By signing in, you agree to our ',
        h('a:text-amber-600 hover:text-amber-700', { href: '#' }, 'Terms of Service'),
        ' and ',
        h('a:text-amber-600 hover:text-amber-700', { href: '#' }, 'Privacy Policy')
      )
    )
  )
}
