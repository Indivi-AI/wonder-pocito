import cors from 'cors'

const origins = ['https://wonder.indivi.ai', 'https://w-staging.indivi.ai', 'http://localhost:3000',
  /^https:\/\/[\w-]+-365199207445\.me-west1\.run\.app$/]
const localOrigin = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/

export const useCors = (app, local) => app.use(cors({
  origin: (origin, done) => (!origin || local && localOrigin.test(origin)
    || origins.some(allowed => allowed instanceof RegExp ? allowed.test(origin) : allowed === origin))
    ? done(null, true) : done(new Error('origin not allowed')),
  methods: local ? ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] : ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-authorization', 'x-wonder-proxy-auth', 'Range'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
  credentials: true
}))
