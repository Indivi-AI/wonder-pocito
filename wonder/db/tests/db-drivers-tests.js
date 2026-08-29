import { dsls, coreUtils, jb } from '@jb6/core'
import '@wonder/db/db-drivers.js'

const { wfetch2, wresolve, wresolveInfo, wcachePopulate, getDBDriver } = jb.wonderUtils
import '@jb6/testing'
import '@jb6/common'
import '@jb6/jq'
import '@wonder/db/tests/db-drivers-testers.js'
import '@wonder/db/tests/gmail-test-users.js'

const {
  tgp: { 'ctx-enricher': { testUser } },
  common: { 
    boolean: { equals }, data: { asIs }
  },
  test: { Test,
    test: { dataTest, dbDriverAppendTest, dbDriverPutGetTest, publicRoomCountTest }
  }
} = dsls



Test('dbDriverTests.gcs.browser.prod.putGet', {
  impl: dbDriverPutGetTest('room:gcs//buyPhone/items?user=Buyer', 'browser-prod')
})

Test('dbDriverTests.gcs.node.prod.putGet', {
  description: 'slow in tests',
  impl: dbDriverPutGetTest('room:gcs//buyPhone/items?user=Buyer', 'node-prod')
})

Test('dbDriverTests.gcs.node.localhost.putGet', {
  impl: dbDriverPutGetTest('room:gcs//buyPhone/items?user=Buyer', 'node-localhost')
})

Test('dbDriverTests.gcs.browser.localhost.putGet', {
  impl: dbDriverPutGetTest('room:gcs//buyPhone/items?user=Buyer', 'browser-localhost')
})

// fs-mem: in-memory (no disk write), fast, per-test isolated — kept for quick round-trip coverage
Test('dbDriverTests.fs-mem.node.localhost.putGet', {
  impl: dbDriverPutGetTest('room:fs-mem//buyPhone/items?user=Buyer', 'node-localhost')
})

Test('dbDriverTests.fs-mem.browser.localhost.putGet', {
  impl: dbDriverPutGetTest('room:fs-mem//buyPhone/items?user=Buyer', 'browser-localhost')
})

Test('dbDriverTests.gcs.node.prod.append', {
  description: 'slow in tests',
  impl: dbDriverAppendTest('room:gcs//buyPhone/items.jsonl?user=Buyer', 'node-prod')
})

Test('dbDriverTests.fs-mem.node.localhost.append', {
  impl: dbDriverAppendTest('room:fs-mem//buyPhone/items.jsonl?user=Buyer', 'node-localhost')
})

Test('dbDriverTests.fs-mem.browser.localhost.append', {
  impl: dbDriverAppendTest('room:fs-mem//buyPhone/items.jsonl?user=Buyer', 'browser-localhost')
})

Test('dbDriverTests.gcs.node.prod.append.newFile', {
  description: 'slow in tests',
  nodeOnly: true,
  impl: dbDriverAppendTest('room:gcs//buyPhone/items-%$testSessionId%.jsonl?user=Buyer', 'node-prod', {
    changeNewFile: true
  })
})

Test('dbDriverTests.fs-mem.node.localhost.append.newFile', {
  impl: dbDriverAppendTest('room:fs-mem//buyPhone/items-%$testSessionId%.jsonl?user=Buyer', 'node-localhost', {
    changeNewFile: true
  })
})

Test('dbDriverTests.fs-mem.browser.localhost.append.newFile', {
  impl: dbDriverAppendTest('room:fs-mem//buyPhone/items-%$testSessionId%.jsonl?user=Buyer', 'browser-localhost', {
    changeNewFile: true
  })
})

Test('dbDriverTests.gcs.browser.localhost.get.logs', {
  doNotRunInTests: true,
  impl: dbDriverPutGetTest('logs:gcs//wfLog/log1', 'browser-localhost')
})

Test('dbDriverTests.gcs.node.localhost.get.analytics', {
  doNotRunInTests: true,
  nodeOnly: true,
  impl: dbDriverPutGetTest('analytics:gcs//test/analyticsTest', 'node-localhost')
})

Test('dbDriverTests.gcs.browser.localhost.get.analytics', {
  doNotRunInTests: true,
  impl: dbDriverPutGetTest('analytics:gcs//test/analyticsTest', 'browser-localhost')
})

Test('dbDriverTests.jqPath', {
  impl: dataTest({
    calculate: async ctx => {
      const dbCtx = ctx.setVars({ db: 'fs-mem', onLiveRepo: true })
      const data = { people: [{name: 'Alice', age: 25}, {name: 'Bob', age: 30}] }
      await wfetch2('room:fs-mem//testRoom/jqTestData?user=tester', {
        body: JSON.stringify(data), method: 'PUT', headers: {'content-type': 'application/json'} }, dbCtx)
      const jqExp = encodeURIComponent('.people[] | select(.age > 26)')
      const res = await wfetch2(`room:fs-mem//testRoom/jqTestData?user=tester&jq=${jqExp}`, { method: 'GET' }, dbCtx)
      return { result: await res.json(), ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals('%result%', [
      {name: 'Bob', age: 30}
    ]),
    timeout: 10000,
    logger: 'dbLogger'
  })
})

Test('dbDriverTests.gcs.node.noIdentity.publicRead', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async ctx => {
      const dbCtx = ctx.setVars({ dbHost: 'node', forceGCS: true, hasGcpIdentity: false })
      const res = await wfetch2('room:gcs//buyPhone/items?user=Buyer', { method: 'GET' }, dbCtx)
      return { result: res.status, ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals('%result%', 200),
    timeout: 10000,
    logger: 'dbLogger'
  })
})

// wcache (db:'wcache') is a local-disk cache path, scheme-agnostic — must resolve to /tmp/wcache/<bucket>/<path> for
// BOTH public (indiviai-wonder) and signed (indiviai-wonder-protected), never the signed HTTPS url (→ ENAMETOOLONG).
Test('dbDriverTests.wcachePath', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async ctx => {
      const dbCtx = ctx.setVars({ forceGCS: false, onLiveRepo: true, hasGcpIdentity: true })
      const at = u => wresolve(u, dbCtx.setVars({ db: 'wcache' }))
      return { result: [await at('signedRoom://testSignedRoom/usersRO/sales-large.json'),
        await at('room://testPublicRoom/usersRO/sales-large.json')], ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals({
      item1: '%result%',
      item2: ['/tmp/wcache/indiviai-wonder-protected/testSignedRoom/usersRO/sales-large.json','/tmp/wcache/indiviai-wonder/testPublicRoom/usersRO/sales-large.json']
    }),
    timeout: 10000,
    logger: 'dbLogger'
  })
})

Test('dbDriverTests.resolveLocations', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async ctx => {
      const url = 'room://testPublicRoom/usersRO/stores.parquet'
      const resolveWith = vars => wresolve(url, ctx.setVars({ onLiveRepo: true, hasGcpIdentity: false, ...vars }))
      const [nodeLocal, browserLocal, nodeMem, browserMem, cache, gcs] = await Promise.all([
        resolveWith({ db: 'local', dbHost: 'node' }), resolveWith({ db: 'local', dbHost: 'browser' }),
        resolveWith({ db: 'fs-mem', dbHost: 'node' }), resolveWith({ db: 'fs-mem', dbHost: 'browser' }),
        resolveWith({ db: 'wcache', dbHost: 'node' }), resolveWith({ db: 'gcs', dbHost: 'node', forceGCS: true })
      ])
      return { result: [nodeLocal.endsWith('/files/rooms/testPublicRoom/usersRO/stores.parquet'), browserLocal,
        nodeMem.endsWith('/files/testPublicRoom/usersRO/stores.parquet'), browserMem, cache, gcs], ...coreUtils.harvestLogs(ctx) }
    },
    expectedResult: equals({
      item1: '%result%',
      item2: [true,'http://localhost:3000/files/rooms/testPublicRoom/usersRO/stores.parquet',true,'http://localhost:3000/files/testPublicRoom/usersRO/stores.parquet','/tmp/wcache/indiviai-wonder/testPublicRoom/usersRO/stores.parquet','https://storage.googleapis.com/indiviai-wonder/testPublicRoom/usersRO/stores.parquet']
    }),
    timeout: 10000,
    logger: 'dbLogger'
  })
})

Test('dbDriverTests.resolveCodeLocations', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async ctx => {
      const info = async url => {
        const { db, fullyResolvedWUrl, resolved, isWUrl, isLocal } = await wresolveInfo(url, ctx)
        return { db, fullyResolvedWUrl, resolved, isWUrl, isLocal }
      }
      return { result: await Promise.all([
        info('clientCode:cloudflare//runtime/react.js'),
        info('clientCode:gcs//applets/v1/wonder/ui.js'),
        info('lambdaCode:gcs//v1.tar.gz')
      ]) }
    },
    expectedResult: equals('%result%', asIs([
        {
          db: 'cloudflare',
          fullyResolvedWUrl: 'clientCode:cloudflare//runtime/react.js',
          resolved: 'https://jb6-cdn.pages.dev/react.js',
          isWUrl: true,
          isLocal: false
        },
        {
          db: 'gcs',
          fullyResolvedWUrl: 'clientCode:gcs//applets/v1/wonder/ui.js',
          resolved: 'https://storage.googleapis.com/wonder-code-packages/applets/v1/wonder/ui.js',
          isWUrl: true,
          isLocal: false
        },
        {
          db: 'gcs',
          fullyResolvedWUrl: 'lambdaCode:gcs//v1.tar.gz',
          resolved: 'https://storage.googleapis.com/wonder-code-packages/lambdas/v1.tar.gz',
          isWUrl: true,
          isLocal: false
        }
    ]))
  })
})

// wcachePopulate → cache an object at its canonical wcache path, transport chosen by scheme (signed URL for signedRoom,
// SA/public for gcs). Both testSignedRoom and testPublicRoom hold usersRO/sales-large.json; populate each, assert non-empty.
Test('dbDriverTests.wcachePopulate', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async ctx => {
      const { promises: fsp } = await import('fs')
      const dbCtx = ctx.setVars({ db: 'gcs', forceGCS: false, onLiveRepo: true, hasGcpIdentity: true })
      const at = async u => { const p = await wcachePopulate(u, dbCtx); return !!p && (await fsp.stat(p)).size > 0 }
      return { result: [
        await at('signedRoom://testSignedRoom/usersRO/sales-large.json'),
        await at('room://testPublicRoom/usersRO/sales-large.json')
      ], ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals('%result%', [true,true]),
    setup: testUser(),
    timeout: 20000,
    logger: 'authLogger,dbLogger'
  })
})

Test('dbDriverTests.text.bodyRoundTrip', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async ctx => {
      const dbCtx = ctx.setVars({ db: 'fs-mem' })
      const sid = ctx.vars.testSessionId

      const jsSrc = '// crm comp\nexport const x = 1\n'
      const jsUrl = `room://textFileTest/comp-${sid}.js`
      await wfetch2(jsUrl, { method: 'PUT', body: jsSrc, headers: {'content-type': 'application/javascript'} }, dbCtx)
      const jsBack = await (await wfetch2(jsUrl, { method: 'GET' }, dbCtx)).text()
      dbCtx.vars.dbLogger?.info?.({ t: 'TEST content-branch: // body kept as content', match: jsBack === jsSrc }, { jsBack }, { ctx })

      return { result: jsBack === jsSrc, ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals('%result%', true),
    timeout: 10000,
    logger: 'dbLogger'
  })
})

Test('dbDriverTests.wcachePopulate.textCsv', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async ctx => {
      const { promises: fsp } = await import('fs')
      const dbCtx = ctx.setVars({ db: 'gcs', forceGCS: false, onLiveRepo: true, hasGcpIdentity: true })
      const url = `room://testPublicRoom/wcache-raw-${ctx.vars.testSessionId}.csv`
      const csv = 'campaign_name,revenue\ncamp_a,10\ncamp_b,5'
      await wfetch2(url, { body: csv, method: 'PUT', headers: {'content-type': 'text/csv'} }, dbCtx)
      const cachePath = await wcachePopulate(url, dbCtx)
      const content = cachePath && await fsp.readFile(cachePath, 'utf8')
      return { result: content, ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals('%result%', 'campaign_name,revenue\ncamp_a,10\ncamp_b,5'),
    timeout: 15000,
    logger: 'dbLogger'
  })
})

// testPublicRoom holds the same data as testSignedRoom (assets.json + usersRO/sales-large.json), read over the public room:// path
Test('dbDriverTests.testPublicRoom.salesLarge', {
  nodeOnly: true,
  impl: publicRoomCountTest('usersRO/sales-large.json', 2000)
})
Test('dbDriverTests.testPublicRoom.assets', {
  nodeOnly: true,
  impl: publicRoomCountTest('assets.json', 3)
})

Test('dbDriverTests.driverSelection', {
  impl: dataTest({
    calculate: async (ctx) => {

      const scenarios = [
        { name: 'browser-prod-gcs', vars: {dbHost: 'browser', forceGCS: true}, url: 'room:gcs//buyPhone/items?user=Buyer', expected: 'bucket.google.public' },
        { name: 'browser-liveRepo-fs', vars: {dbHost: 'browser', onLiveRepo: true}, url: 'room:fs//buyPhone/items?user=Buyer', expected: 'FS.browser' },
        { name: 'browser-liveRepo-gcs', vars: {dbHost: 'browser', onLiveRepo: true}, url: 'room:gcs//buyPhone/items?user=Buyer', expected: 'bucket.google.public' },
        { name: 'browser-gcsHTTPBlockedByCORS-liveRepo', vars: {dbHost: 'browser', onLiveRepo: true,
          categories: {gcshttpblockedbycors: true}}, url: 'room:gcs//buyPhone/items?user=Buyer', expected: 'GCS.browser.gcsHTTPBlockedByCORS' },
        { name: 'browser-gcsHTTPBlockedByCORS-prod', vars: {dbHost: 'browser', forceGCS: true,
          categories: {gcshttpblockedbycors: true}}, url: 'room:gcs//buyPhone/items?user=Buyer', expected: 'GCS.browser.gcsHTTPBlockedByCORS' },
        { name: 'browser-liveRepo-fsmem', vars: {dbHost: 'browser', onLiveRepo: true, db: 'fs-mem'},
          url: 'room:fs-mem//buyPhone/items?user=Buyer', expected: 'fsmem.browser.liveRepo' },
        { name: 'browser-forceGCS-overrides-fsmem', vars: {dbHost: 'browser', forceGCS: true, db: 'fs-mem'},
          url: 'room:fs-mem//buyPhone/items?user=Buyer', expected: 'bucket.google.public' },
        { name: 'db-wcache-bypasses-scoring', vars: {dbHost: 'node', onLiveRepo: true, db: 'wcache'}, url: 'room://buyPhone/items', expected: 'wcache' },
        { name: 'browser-liveRepo-logs', vars: {dbHost: 'browser', onLiveRepo: true}, url: 'logs:gcs//wfLog/log1', expected: 'GCS.browser.liveRepo.logs' },
        { name: 'node-prod-noIdentity-public', vars: {dbHost: 'node', forceGCS: true, hasGcpIdentity: false}, url: 'room:gcs//x/y?user=u', expected: 'GCS.node.publicGCS' },
        { name: 'node-prod-noIdentity-logs', vars: {dbHost: 'node', forceGCS: true, hasGcpIdentity: false}, url: 'logs:gcs//x/y', expected: null },
        { name: 'node-prod-noIdentity-analytics', vars: {dbHost: 'node', forceGCS: true, hasGcpIdentity: false}, url: 'analytics:gcs//x/y', expected: null },
        { name: 'node-liveRepo-withIdentity', vars: {dbHost: 'node', onLiveRepo: true, hasGcpIdentity: true},
          url: 'room:gcs//x/y?user=u', expected: 'GCS.node.gcpIdentity.liveRepo' },
        { name: 'node-liveRepo-logs-withIdentity', vars: {dbHost: 'node', onLiveRepo: true, hasGcpIdentity: true},
          url: 'logs:gcs//x/y', expected: 'GCS.node.gcpIdentity.liveRepo.logs' },
        { name: 'node-liveRepo-analytics-withIdentity', vars: {dbHost: 'node', onLiveRepo: true, hasGcpIdentity: true},
          url: 'analytics:gcs//x/y', expected: 'GCS.node.gcpIdentity.liveRepo.allowStreaming' },
      ]
      const results = await Promise.all(scenarios.map(async ({name, vars, url, expected}) => {
        const dbCtx = ctx.setVars(vars)
        const selected = (await getDBDriver(url, dbCtx))?.id || null
        return { name, selected, expected, pass: selected === expected }
      }))
      const failures = results.filter(r => !r.pass)
      return failures.length === 0 ? {result: 'all passed'} : { failures, results }
    },
    expectedResult: equals('%result%', 'all passed'),
    timeout: 12000,
    allowError: true,
    logger: 'dbLogger'
  })
})


Test('dbDriverTests.roomLogs.writeAndList', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async (ctx) => {
      const dbCtx = ctx.setVars({db: 'gcs', dbHost: 'node', forceGCS: true, hasGcpIdentity: true})
      const url = 'roomLogs:gcs//testRoom/2026-04-01/s1-p1-0.json'
      const body = JSON.stringify({date: '2026-04-01', sessionId: 's1', playerId: 'p1', counter: 0, ev: 'pageView'})
      const driver = await getDBDriver(url, dbCtx)
      const putRes = await wfetch2(url, {method: 'PUT', body, headers: {'content-type': 'application/json'}}, dbCtx)
      const list = await wfetch2('roomLogs:gcs//testRoom/2026-04-01/', { method: 'GET' }, dbCtx).then(r => r.json()).catch(e => ({error: String(e?.message || e)}))
      return { driverId: driver?.id, putOk: putRes?.ok !== false, putStatus: putRes?.status,
        listCount: Array.isArray(list) ? list.length : null,
        listSample: Array.isArray(list) ? list.slice(0,3).map(f => f.name || f) : null,
        listError: list?.error, ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals(true, '%putOk%'),
    timeout: 12000,
    logger: 'dbLogger'
  })
})

// Diagnose: list at room root (no date subdir). bucketDates relies on this returning the per-date subdirs.
Test('dbDriverTests.roomLogs.listRoomRoot', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async (ctx) => {
      const dbCtx = ctx.setVars({db: 'gcs', dbHost: 'node', forceGCS: true, hasGcpIdentity: true})
      const url = 'roomLogs:gcs//testRoom/'
      const list = await wfetch2(url, { method: 'GET' }, dbCtx).then(r => r.json()).catch(e => ({error: String(e?.message || e)}))
      const arr = Array.isArray(list) ? list : []
      return {
        url,
        count: arr.length,
        entries: arr.slice(0, 15).map(e => ({name: e.name, isDir: e.isDir, size: e.size})),
        ...coreUtils.harvestLogs(dbCtx)
      }
    },
    expectedResult: equals(true, true),
    timeout: 12000,
    logger: 'dbLogger'
  })
})
Test('dbDriverTests.forwarderRequiresAuthenticatedUser', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async () => {
      const previousTarget = process.env.SIGNED_LAMBDA_URL
      process.env.SIGNED_LAMBDA_URL = 'https://private.invalid'
      try {
        const { setupSignedUrlForwarder } = await import('../../../cloud-services/express-server/lib/signed-url-forwarder.js')
        const routes = {}
        setupSignedUrlForwarder({ all: (path, handler) => routes[path] = handler })
        const request = headers => new Promise(resolve => routes['/signed-url/*']({
          method: 'GET', originalUrl: '/signed-url/room/usersRO/file?method=GET', headers, query: {}
        }, {
          status(status) { this.statusCode = status; return this },
          json(body) { resolve({ status: this.statusCode, body }) }
        }))
        return Promise.all([
          request({}),
          request({ 'x-user-authorization': 'Bearer attacker-controlled' })
        ])
      } finally {
        previousTarget == null ? delete process.env.SIGNED_LAMBDA_URL : process.env.SIGNED_LAMBDA_URL = previousTarget
      }
    },
    expectedResult: equals([
      {status: 401, body: {error: 'missing user token'}},
      {status: 401, body: {error: 'missing user token'}}
    ]),
    logger: 'authLogger'
  })
})
Test('dbDriverTests.signerSeparatesServiceIdentityAndChecksAudience', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async () => {
      const [{ OAuth2Client }, { setupSignedUrlRoute }, { verifyToken }] = await Promise.all([
        import('google-auth-library'), import('../../../cloud-services/express-server/lib/signed-url.js'),
        import('../../../cloud-services/express-server/lib/auth-utils.js')
      ])
      const routes = {}, original = OAuth2Client.prototype.verifyIdToken
      setupSignedUrlRoute({ get: (path, handler) => routes[path] = handler })
      const signerStatus = await new Promise(resolve => routes['/signed-url/*']({
        originalUrl: '/signed-url/testSignedRoom/usersRO/file', headers: { authorization: 'Bearer service-token' }, params: { 0: 'testSignedRoom/usersRO/file' }, query: {}
      }, { status(status) { this.statusCode = status; return this }, json() { resolve(this.statusCode) } }))
      let audience
      OAuth2Client.prototype.verifyIdToken = async opts => (audience = opts.audience, { getPayload: () => ({ email: 'user@example.com', exp: Date.now() / 1000 + 60 }) })
      try {
        await verifyToken(`audience-test-${Date.now()}`)
        return [signerStatus, audience]
      } finally {
        OAuth2Client.prototype.verifyIdToken = original
      }
    },
    expectedResult: equals({
      item1: '%%',
      item2: [
        401,
        ['365199207445-q87kjft2o40ird0hv5r0r9vs8l7bvund.apps.googleusercontent.com','365199207445-f9hqa8n0u6s7dpssq86n4ncqm3ef676v.apps.googleusercontent.com']
      ]
    })
  })
})
Test('dbDriverTests.liveStagingPreservesUserIdentity', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async (ctx, {idToken, userEmail}) => {
      const url = 'https://w-staging.indivi.ai/signed-url/testSignedRoom/usersRO/sales-large.json?method=GET&logger=authLogger'
      const call = async headers => {
        const response = await fetch(url, { headers }), body = await response.json()
        return { status: response.status, body }
      }
      const anonymous = await call({ 'x-user-authorization': 'Bearer attacker-controlled' })
      const authenticated = await call({ Authorization: `Bearer ${idToken}` })
      const logs = authenticated.body.logs?.authLogger?.authLog || []
      ctx.vars.authLogger?.info?.({ t: 'live signed-url security results', anonymousStatus: anonymous.status,
        authenticatedStatus: authenticated.status, identities: logs.filter(x => x.email).map(x => x.email) }, {}, { ctx })
      return anonymous.status === 401 && !anonymous.body.signedUrl && !anonymous.body.signatures
        && authenticated.status === 200 && logs.some(x => x.t === 'forwarder user verified' && x.email === userEmail)
        && logs.some(x => x.t === 'user token verified' && x.email === userEmail)
        && !logs.some(x => /compute@developer\.gserviceaccount\.com$/.test(x.email || ''))
    },
    expectedResult: equals('%%', true),
    setup: testUser(),
    timeout: 12000,
    logger: 'authLogger'
  })
})
Test('dbDriverTests.binary.publicRoom', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async (ctx, {testSessionId}) => {
      const dbCtx = ctx.setVars({ db: 'gcs', forceGCS: false, onLiveRepo: true, hasGcpIdentity: true })
      const url = `room://testPublicRoom/usersRW/assets/test-media-${testSessionId}.png`
      const body = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
      const put = await wfetch2(url, { body, method: 'PUT', headers: {'content-type': 'image/png'} }, dbCtx)
      const get = await wfetch2(url, { method: 'GET' }, dbCtx)
      const bytes = get?.ok ? (await get.arrayBuffer()).byteLength : 0
      const head = await wfetch2(url, { method: 'HEAD' }, dbCtx)
      return {
        result: {
          put: put?.status,
          get: get?.status,
          bytes,
          head: head?.status,
          contentLocation: !!head?.headers?.get?.('Content-Location')
        },
        ...coreUtils.harvestLogs(dbCtx)
      }
    },
    expectedResult: equals('%result%', asIs({put: 200, get: 200, bytes: 70, head: 200, contentLocation: true})),
    timeout: 20000,
    logger: 'dbLogger'
  })
})
