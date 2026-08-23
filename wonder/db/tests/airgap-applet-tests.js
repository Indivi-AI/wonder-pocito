import { dsls, coreUtils, jb } from '@jb6/core'
import '@jb6/testing'
import '@wonder/db/db-drivers.js'

const { common: { boolean: { equals }, data: { asIs } }, test: { Test, test: { dataTest } } } = dsls

const PUBLIC_MINIO = 'https://minio.public.example'

const startFakeMinio = async () => {
  const { createServer } = await import('node:http')
  const objects = new Map()
  const server = createServer((req, res) => {
    const key = req.url.split('?')[0], chunks = []
    req.on('data', chunk => chunks.push(chunk)).on('end', () => {
      if (req.method === 'PUT') { objects.set(key, Buffer.concat(chunks)); return res.end() }
      res.statusCode = objects.has(key) ? 200 : 404
      res.end(objects.get(key) || '')
    })
  })
  await new Promise(ok => server.listen(0, '127.0.0.1', ok))
  return { objects, endpoint: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }
}

const withAirgapEnv = async (internalEndpoint, body) => {
  const airgap = { STORAGE_PROVIDER: 'minio', MINIO_ENDPOINT: internalEndpoint, WONDER_STORAGE_URL: PUBLIC_MINIO,
    WONDER_CDN_URL: `${PUBLIC_MINIO}/wonder-code-packages/cdn`, WONDER_AUTH_MODE: 'none' }
  const saved = Object.keys(airgap).map(key => [key, process.env[key]])
  Object.assign(process.env, airgap)
  try { return await body() }
  finally { saved.forEach(([key, value]) => value == null ? delete process.env[key] : process.env[key] = value) }
}

Test('dbDriverTests.airgap.appletPageServing', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async ctx => {
      const minio = await startFakeMinio()
      try {
        return await withAirgapEnv(minio.endpoint, async () => {
          const roomId = `airgapTest-${ctx.vars.testSessionId}`
          const def = { cmpId: 'helloApplet', urlsToLoad: '@wonder/db/tests/room-test-applets.js', appletV: 'v1',
            clientCodeWUrl: 'clientCode:minio//applets/v1/', roomWUrl: `room://${roomId}` }
          minio.objects.set(`/indiviai-wonder/${roomId}/applets/helloApplet.json`, Buffer.from(JSON.stringify(def)))
          const { setupRoomLambdaAndApplet } = await import('../../../cloud-services/express-server/lib/room-lambda-and-applet.js')
          const routes = {}
          setupRoomLambdaAndApplet({ get: (path, handler) => routes[path] = handler, post: () => {} })
          const response = await new Promise(resolve => routes['/room/:roomId/applet/:name']({
            params: { roomId, name: 'helloApplet' }, hostname: 'wonder.airgap.example',
            path: `/room/${roomId}/applet/helloApplet`, get: () => 'wonder.airgap.example'
          }, {
            code: 200, set() { return this }, status(code) { this.code = code; return this },
            json(body) { resolve({ status: this.code, ...body }) }, send(html) { resolve({ status: this.code, html }) }
          }))
          return { result: {
            status: response.status,
            error: response.error || null,
            sharedCodeOnPublicMinio: !!response.html?.includes(`${PUBLIC_MINIO}/wonder-code-packages/applets/v1/wonder/`),
            runtimeOnMinioCdn: !!response.html?.includes(`${PUBLIC_MINIO}/wonder-code-packages/cdn/`),
            browserStorageEnv: !!response.html?.includes('"WONDER_STORAGE_PROVIDER":"minio"'),
            noAuth: !!response.html?.includes('"noAuth":true'),
            noForeignHosts: !/storage\.googleapis\.com|jb6-cdn\.pages\.dev|127\.0\.0\.1:9000/.test(response.html || '')
          }, ...coreUtils.harvestLogs(ctx) }
        })
      } finally { minio.close() }
    },
    expectedResult: equals('%result%', asIs({
        status: 200,
        error: null,
        sharedCodeOnPublicMinio: true,
        runtimeOnMinioCdn: true,
        browserStorageEnv: true,
        noAuth: true,
        noForeignHosts: true
    })),
    timeout: 15000,
    logger: 'dbLogger'
  })
})

Test('dbDriverTests.airgap.publishStorageCtx', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async ctx => {
      const { wfetch2, wresolve, storageEnvVars } = jb.wonderUtils
      const minio = await startFakeMinio()
      try {
        return await withAirgapEnv(minio.endpoint, async () => {
          const roomId = `airgapTest-${ctx.vars.testSessionId}`
          const manifestCtx = ctx.setVars(storageEnvVars ? storageEnvVars() : {})
          await wfetch2(`room://${roomId}/applets/helloApplet.json`, { method: 'PUT', body: { cmpId: 'helloApplet' },
            headers: { 'x-wonder-json': 'as-is' } }, manifestCtx)
          const callerEndpointHonored = await wresolve('clientCode:minio//applets/v1/index.js',
            ctx.setVars({ bucketEndpoint: PUBLIC_MINIO }), 'GET')
          return { result: {
            manifestInMinio: minio.objects.has(`/indiviai-wonder/${roomId}/applets/helloApplet.json`),
            callerEndpointHonored
          }, ...coreUtils.harvestLogs(ctx) }
        })
      } finally { minio.close() }
    },
    expectedResult: equals('%result%', asIs({manifestInMinio: true,
      callerEndpointHonored: 'https://minio.public.example/wonder-code-packages/applets/v1/index.js'})),
    timeout: 15000,
    logger: 'dbLogger'
  })
})
