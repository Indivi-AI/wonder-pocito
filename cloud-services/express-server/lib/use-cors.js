import cors from 'cors'

const origins = ['https://wonder.indivi.ai', 'https://w-staging.indivi.ai', 'http://localhost:3000',
  /^https:\/\/[\w-]+-365199207445\.me-west1\.run\.app$/]

export const useCors = (app, local) => {
  const allowAll = local || process.env.CORS_ALLOW_ALL === 'true'
  return app.use(cors({
    origin: (origin, done) => (!origin || allowAll
      || origins.some(allowed => allowed instanceof RegExp ? allowed.test(origin) : allowed === origin))
      ? done(null, true) : done(new Error('origin not allowed')),
    methods: allowAll ? ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] : ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-authorization', 'x-wonder-proxy-auth', 'Range'],
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
    credentials: true
  }))
}
