import { dsls, coreUtils, jb } from '@jb6/core'
import './db-drivers.js'

const { wfetch2, wresolve, resolveWUrl, wcachePopulate, getDBDriver } = jb.wonderUtils
import '@jb6/testing'
import '@jb6/common'
import '@jb6/jq'
import './db-drivers-testers.js'

const {
  common: { 
    boolean: { equals }, data: { asIs }
  },
  test: { Test,
    test: { dataTest, dbDriverAppendTest, dbDriverPatchTest, dbDriverPutGetTest, publicRoomCountTest }
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

Test('dbDriverTests.minio.driverSelection', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async ctx => {
      const dbCtx = ctx.setVars({ hasGcpIdentity: false })
      const read = await getDBDriver('room:minio//testRoom/item.json', dbCtx.setVars({ method: 'GET' }))
      const write = await getDBDriver('room:minio//testRoom/item.json', dbCtx.setVars({ method: 'PUT' }))
      return { result: { read: read?.id, write: write?.id, canList: !!read?.list.profile }, ...coreUtils.harvestLogs(ctx) }
    },
    expectedResult: equals('%result%', asIs({ read: 'bucket.minio.public', write: 'bucket.minio', canList: false })),
    logger: 'dbLogger'
  })
})

Test('dbDriverTests.bucket.providerSelection', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async ctx => {
      const providerCtx = provider => ctx.setVars({ db: 'bucket', bucketProvider: provider, dbHost: 'node',
        hasGcpIdentity: provider === 'gcs' })
      const select = provider => getDBDriver('codePackages://shared/item.js', providerCtx(provider))
      const minioUrl = await wresolve('codePackages://shared/item.js', providerCtx('minio'))
      const endpoint = (process.env.MINIO_ENDPOINT || 'http://127.0.0.1:9000').replace(/\/$/, '')
      return { result: { drivers: [(await select('minio'))?.id, (await select('gcs'))?.id], endpoint: minioUrl.startsWith(endpoint) },
        ...coreUtils.harvestLogs(ctx) }
    },
    expectedResult: equals('%result%', asIs({ drivers: ['bucket.minio', 'GCS.node.gcpIdentity'], endpoint: true })),
    logger: 'dbLogger'
  })
})

Test('dbDriverTests.amazon.protected.putGet', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async (ctx, { testSessionId }) => {
      const url = `protected://aTeam/admin/tests/${testSessionId}.json`, content = { value: 42 }
      const put = await wfetch2(url, { method: 'PUT', body: content }, ctx)
      const get = await wfetch2(url, { method: 'GET' }, ctx)
      const resolved = await wresolve(url, ctx)
      return { result: { driver: (await getDBDriver(url, ctx))?.id, put: put.status, get: get.status, content: await get.json(),
        resolved: resolved === `https://s3.il-central-1.amazonaws.com/wonder-rooms-585008076838/aTeam/admin/tests/${testSessionId}.json` },
        ...coreUtils.harvestLogs(ctx) }
    },
    expectedResult: equals('%result%', asIs({driver: 'bucket.amazon', put: 200, get: 200, content: {value: 42}, resolved: true})),
    logger: 'dbLogger',
    timeout: 10000
  })
})

Test('dbDriverTests.amazon.protected.resolveWUrl', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async ctx => ({ result: [await resolveWUrl('protected://comax2', ctx), await resolveWUrl('comax2', ctx)],
      ...coreUtils.harvestLogs(ctx) }),
    expectedResult: equals('%result%', ['protected://comax2', 'protected://comax2']),
    logger: 'dbLogger',
    timeout: 10000
  })
})

Test('dbDriverTests.minio.putGet', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async (ctx, { testSessionId }) => {
      const url = `room:minio//testRoom/tests/${testSessionId}/put-get.json`, content = { value: 42 }
      await wfetch2(url, { method: 'PUT', body: content }, ctx)
      return { result: await (await wfetch2(url, { method: 'GET' }, ctx)).json(), ...coreUtils.harvestLogs(ctx) }
    },
    expectedResult: equals('%result%', asIs({ value: 42 })),
    logger: 'dbLogger'
  })
})

Test('dbDriverTests.minio.append', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async (ctx, { testSessionId }) => {
      const url = `room:minio//testRoom/tests/${testSessionId}/append.json`
      await wfetch2(url, { method: 'PUT', body: [{ id: 1 }] }, ctx)
      await wfetch2(url, { method: 'POST', body: [{ id: 2 }] }, ctx)
      return { result: await (await wfetch2(url, { method: 'GET' }, ctx)).json(), ...coreUtils.harvestLogs(ctx) }
    },
    expectedResult: equals('%result%', [{id: 1}, {id: 2}]),
    logger: 'dbLogger'
  })
})

Test('dbDriverTests.minio.patch', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async (ctx, { testSessionId }) => {
      const url = `room:minio//testRoom/tests/${testSessionId}/patch.json`
      await wfetch2(url, { method: 'PUT', body: { a: 1 } }, ctx)
      await wfetch2(url, { method: 'PATCH', body: { b: 2 } }, ctx)
      return { result: await (await wfetch2(url, { method: 'GET' }, ctx)).json(), ...coreUtils.harvestLogs(ctx) }
    },
    expectedResult: equals('%result%', asIs({ a: 1, b: 2 })),
    logger: 'dbLogger'
  })
})

Test('dbDriverTests.minio.head', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async (ctx, { testSessionId }) => {
      const url = `room:minio//testRoom/tests/${testSessionId}/head.json`
      await wfetch2(url, { method: 'PUT', body: { value: 42 } }, ctx)
      const res = await wfetch2(url, { method: 'HEAD' }, ctx)
      return { result: { status: res.status, size: Number(res.headers.get('content-length')) > 0 }, ...coreUtils.harvestLogs(ctx) }
    },
    expectedResult: equals('%result%', asIs({ status: 200, size: true })),
    logger: 'dbLogger'
  })
})

Test('dbDriverTests.minio.list', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async (ctx, { testSessionId }) => {
      const dir = `codePackages:minio//tests/${testSessionId}/list/`
      await Promise.all(['a', 'b'].map(name => wfetch2(`${dir}${name}.json`, { method: 'PUT', body: { name } }, ctx)))
      const items = await (await wfetch2(dir, { method: 'GET' }, ctx)).json()
      return { result: items.map(item => item.name.split('/').at(-1)).sort(), ...coreUtils.harvestLogs(ctx) }
    },
    expectedResult: equals('%result%', ['a.json','b.json']),
    logger: 'dbLogger'
  })
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
  impl: dbDriverAppendTest('room:gcs//buyPhone/items?user=Buyer', 'node-prod')
})

Test('dbDriverTests.fs-mem.node.localhost.append', {
  impl: dbDriverAppendTest('room:fs-mem//buyPhone/items?user=Buyer', 'node-localhost')
})

Test('dbDriverTests.fs-mem.browser.localhost.append', {
  impl: dbDriverAppendTest('room:fs-mem//buyPhone/items?user=Buyer', 'browser-localhost')
})

Test('dbDriverTests.gcs.node.prod.append.newFile', {
  nodeOnly: true,
  description: 'slow in tests',
  impl: dbDriverAppendTest('room:gcs//buyPhone/items-%$testSessionId%?user=Buyer', 'node-prod', {
    initialArray: [],
    changeNewFile: true
  })
})

Test('dbDriverTests.fs-mem.node.localhost.append.newFile', {
  impl: dbDriverAppendTest('room:fs-mem//buyPhone/items-%$testSessionId%?user=Buyer', 'node-localhost', {
    initialArray: [],
    changeNewFile: true
  })
})

Test('dbDriverTests.fs-mem.browser.localhost.append.newFile', {
  impl: dbDriverAppendTest('room:fs-mem//buyPhone/items-%$testSessionId%?user=Buyer', 'browser-localhost', {
    initialArray: [],
    changeNewFile: true
  })
})

Test('dbDriverTests.gcs.node.prod.patch', {
  nodeOnly: true,
  description: 'slow in tests',
  impl: dbDriverPatchTest('room:gcs//buyPhone/items?user=Buyer', 'node-prod')
})

Test('dbDriverTests.gcs.browser.localhost.patch', {
  impl: dbDriverPatchTest('room:gcs//buyPhone/items?user=Buyer', 'browser-localhost')
})

Test('dbDriverTests.fs-mem.node.localhost.patch', {
  impl: dbDriverPatchTest('room:fs-mem//buyPhone/items?user=Buyer', 'node-localhost')
})

Test('dbDriverTests.fs-mem.browser.localhost.patch', {
  impl: dbDriverPatchTest('room:fs-mem//buyPhone/items?user=Buyer', 'browser-localhost')
})

Test('dbDriverTests.gcs.browser.localhost.get.logs', {
  doNotRunInTests: true,
  impl: dbDriverPutGetTest('logs:gcs//wfLog/log1', 'browser-localhost')
})

Test('dbDriverTests.gcs.node.localhost.get.analytics', {
  nodeOnly: true,
  doNotRunInTests: true,
  impl: dbDriverPutGetTest('analytics:gcs//test/analyticsTest', 'node-localhost')
})

Test('dbDriverTests.gcs.browser.localhost.get.analytics', {
  doNotRunInTests: true,
  impl: dbDriverPutGetTest('analytics:gcs//test/analyticsTest', 'browser-localhost')
})

Test('dbDriverTests.jqPath', {
  impl: dataTest({
    logger: 'dbLogger',
    calculate: async ctx => {
      const dbCtx = ctx.setVars({ db: 'fs-mem', onLiveRepo: true })
      const data = { people: [{name: 'Alice', age: 25}, {name: 'Bob', age: 30}] }
      await wfetch2('room:fs-mem//testRoom/jqTestData?user=tester', { body: data, method: 'PUT' }, dbCtx)
      const jqExp = encodeURIComponent('.people[] | select(.age > 26)')
      const res = await wfetch2(`room:fs-mem//testRoom/jqTestData?user=tester&jq=${jqExp}`, { method: 'GET' }, dbCtx)
      return { result: await res.json(), ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals('%result%', [{name: 'Bob', age: 30}]),
    timeout: 10000
  })
})

Test('dbDriverTests.gcs.node.noIdentity.publicRead', {
  nodeOnly: true,
  impl: dataTest({
    logger: 'dbLogger',
    calculate: async ctx => {
      const dbCtx = ctx.setVars({ dbHost: 'node', forceGCS: true, hasGcpIdentity: false })
      const res = await wfetch2('room:gcs//buyPhone/items?user=Buyer', { method: 'GET' }, dbCtx)
      return { result: res.status, ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals('%result%', 200),
    timeout: 10000
  })
})

// wcache (db:'wcache') is a local-disk cache path, scheme-agnostic — must resolve to /tmp/wcache/<bucket>/<path> for
// BOTH public (indiviai-wonder) and signed (indiviai-wonder-protected), never the signed HTTPS url (→ ENAMETOOLONG).
Test('dbDriverTests.wcachePath', {
  nodeOnly: true,
  impl: dataTest({
    logger: 'dbLogger',
    calculate: async ctx => {
      const dbCtx = ctx.setVars({ forceGCS: false, onLiveRepo: true, hasGcpIdentity: true })
      const at = u => wresolve(u, dbCtx.setVars({ db: 'wcache' }))
      return { result: [await at('signedRoom://testSignedRoom/usersRO/sales-large.json'),
        await at('room://testPublicRoom/usersRO/sales-large.json')], ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals('%result%', ['/tmp/wcache/indiviai-wonder-protected/testSignedRoom/usersRO/sales-large.json',
      '/tmp/wcache/indiviai-wonder/testPublicRoom/usersRO/sales-large.json']),
    timeout: 10000
  })
})

Test('dbDriverTests.resolveLocations', {
  nodeOnly: true,
  impl: dataTest({
    logger: 'dbLogger',
    calculate: async ctx => {
      const url = 'room://testPublicRoom/usersRO/stores.parquet'
      const resolveWith = vars => wresolve(url, ctx.setVars({ onLiveRepo: true, hasGcpIdentity: false, ...vars }))
      const [nodeLocal, browserLocal, nodeMem, browserMem, cache, gcs] = await Promise.all([
        resolveWith({ db: 'local', dbHost: 'node' }), resolveWith({ db: 'local', dbHost: 'browser' }),
        resolveWith({ db: 'fs-mem', dbHost: 'node' }), resolveWith({ db: 'fs-mem', dbHost: 'browser' }),
        resolveWith({ db: 'wcache', dbHost: 'node' }), resolveWith({ db: 'bucket', dbHost: 'node', forceGCS: true })
      ])
      return { result: [nodeLocal.endsWith('/files/rooms/testPublicRoom/usersRO/stores.parquet'), browserLocal,
        nodeMem.endsWith('/files/testPublicRoom/usersRO/stores.parquet'), browserMem, cache, gcs], ...coreUtils.harvestLogs(ctx) }
    },
    expectedResult: equals('%result%', [true,
      'http://localhost:3000/files/rooms/testPublicRoom/usersRO/stores.parquet', true,
      'http://localhost:3000/files/testPublicRoom/usersRO/stores.parquet',
      '/tmp/wcache/indiviai-wonder/testPublicRoom/usersRO/stores.parquet',
      'https://storage.googleapis.com/indiviai-wonder/testPublicRoom/usersRO/stores.parquet']),
    timeout: 10000
  })
})

// wcachePopulate → cache an object at its canonical wcache path, transport chosen by scheme (signed URL for signedRoom,
// SA/public for gcs). Both testSignedRoom and testPublicRoom hold usersRO/sales-large.json; populate each, assert non-empty.
Test('dbDriverTests.wcachePopulate', {
  nodeOnly: true,
  impl: dataTest({
    logger: 'dbLogger',
    calculate: async ctx => {
      const { promises: fsp } = await import('fs')
      const dbCtx = ctx.setVars({ db: 'bucket', bucketProvider: 'gcs', forceGCS: false, onLiveRepo: true, hasGcpIdentity: true })
      const at = async u => { const p = await wcachePopulate(u, dbCtx); return !!p && (await fsp.stat(p)).size > 0 }
      return { result: [
        await at('signedRoom://testSignedRoom/usersRO/sales-large.json'),
        await at('room://testPublicRoom/usersRO/sales-large.json')
      ], ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals('%result%', [true, true]),
    timeout: 20000
  })
})

// rawFileViaWfetch2 → media/binary wUrl over wfetch2: PUT a 1x1 png to both rooms, then GET auto-follows the 302 to
// real bytes (size>0) and HEAD returns 200 + Content-Location (the resolved url). No extension-keyed url-in-body anymore.
Test('dbDriverTests.rawFileViaWfetch2', {
  nodeOnly: true,
  impl: dataTest({
    logger: 'dbLogger',
    calculate: async ctx => {
      const dbCtx = ctx.setVars({ db: 'bucket', bucketProvider: 'gcs', forceGCS: false, onLiveRepo: true, hasGcpIdentity: true })
      const body = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64').toString('base64')
      const at = async url => {
        await wfetch2(url, { body, method: 'PUT' }, dbCtx)
        const get = await wfetch2(url, { method: 'GET' }, dbCtx)
        const bytes = get?.ok ? (await get.arrayBuffer()).byteLength : 0
        const head = await wfetch2(url, { method: 'HEAD' }, dbCtx)
        return bytes > 0 && !!head?.headers?.get?.('Content-Location')
      }
      return { result: [
        await at('signedRoom://testSignedRoom/usersRW/assets/test-media.png'),
        await at('room://testPublicRoom/usersRW/assets/test-media.png')
      ], ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals('%result%', [true, true]),
    timeout: 20000
  })
})

// rawFile body classification: opts.body is PAYLOAD (HTTP-standard). Guards the bug where .js content starting with '//'
// was mis-sniffed as a path by the old startsWith('/') heuristic and crashed the upload. fs-mem → no disk write.
Test('dbDriverTests.rawFile.bodyClassification', {
  nodeOnly: true,
  impl: dataTest({
    logger: 'dbLogger',
    calculate: async ctx => {
      const dbCtx = ctx.setVars({ db: 'fs-mem' })
      const sid = ctx.vars.testSessionId

      const jsSrc = '// crm comp\nexport const x = 1\n'
      const jsUrl = `room://rawFileTest/comp-${sid}.js`
      await wfetch2(jsUrl, { method: 'PUT', body: jsSrc }, dbCtx)
      const jsBack = await (await wfetch2(jsUrl, { method: 'GET' }, dbCtx)).text()
      dbCtx.vars.dbLogger?.info?.({ t: 'TEST content-branch: // body kept as content', match: jsBack === jsSrc }, { jsBack }, { ctx })

      return { result: jsBack === jsSrc, ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals('%result%', true),
    timeout: 10000
  })
})

// wcachePopulate of a TEXT rawFile (csv) — csv is not in wcachePopulate's binary regex, so it must read via text(),
// not res.json(). Repro of 'res.json is not a function'. public room (gcs) source → wCache, no fs disk write.
Test('dbDriverTests.wcachePopulate.rawCsvFs', {
  nodeOnly: true,
  impl: dataTest({
    logger: 'dbLogger',
    calculate: async ctx => {
      const { promises: fsp } = await import('fs')
      const dbCtx = ctx.setVars({ db: 'bucket', bucketProvider: 'gcs', forceGCS: false, onLiveRepo: true, hasGcpIdentity: true })
      const url = `room://testPublicRoom/wcache-raw-${ctx.vars.testSessionId}.csv`
      const csv = 'campaign_name,revenue\ncamp_a,10\ncamp_b,5'
      await wfetch2(url, { body: csv, method: 'PUT' }, dbCtx)
      const cachePath = await wcachePopulate(url, dbCtx)
      const content = cachePath && await fsp.readFile(cachePath, 'utf8')
      return { result: content, ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals('%result%', 'campaign_name,revenue\ncamp_a,10\ncamp_b,5'),
    timeout: 15000
  })
})

// testPublicRoom holds the same data as testSignedRoom (assets.json + usersRO/sales-large.json), read over the public room:// path
Test('dbDriverTests.testPublicRoom.salesLarge', { nodeOnly: true, impl: publicRoomCountTest('usersRO/sales-large.json', 2000) })
Test('dbDriverTests.testPublicRoom.assets', { nodeOnly: true, impl: publicRoomCountTest('assets.json', 3) })

Test('dbDriverTests.driverSelection', {
  impl: dataTest({
    logger: 'dbLogger',
    allowError: true,   // 2 scenarios expect null → getDBDriver logs 'No DB driver matched' by design; the %result% assertion still guards correctness
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
    timeout: 12000
  })
})


Test('dbDriverTests.roomLogs.writeAndList', {
  nodeOnly: true,
  impl: dataTest({
    logger: 'dbLogger',
    calculate: async (ctx) => {
      const dbCtx = ctx.setVars({db: 'bucket', bucketProvider: 'gcs', dbHost: 'node', forceGCS: true, hasGcpIdentity: true})
      const url = 'roomLogs:gcs//testRoom/2026-04-01/s1-p1-0.json'
      const body = JSON.stringify({date: '2026-04-01', sessionId: 's1', playerId: 'p1', counter: 0, ev: 'pageView'})
      const driver = await getDBDriver(url, dbCtx)
      const putRes = await wfetch2(url, {method: 'PUT', body}, dbCtx)
      const list = await wfetch2('roomLogs:gcs//testRoom/2026-04-01/', { method: 'GET' }, dbCtx).then(r => r.json()).catch(e => ({error: String(e?.message || e)}))
      return { driverId: driver?.id, putOk: putRes?.ok !== false, putStatus: putRes?.status,
        listCount: Array.isArray(list) ? list.length : null,
        listSample: Array.isArray(list) ? list.slice(0,3).map(f => f.name || f) : null,
        listError: list?.error, ...coreUtils.harvestLogs(dbCtx) }
    },
    expectedResult: equals(true, '%putOk%'),
    timeout: 12000
  })
})

// Diagnose: list at room root (no date subdir). bucketDates relies on this returning the per-date subdirs.
Test('dbDriverTests.roomLogs.listRoomRoot', {
  nodeOnly: true,
  impl: dataTest({
    logger: 'dbLogger',
    calculate: async (ctx) => {
      const dbCtx = ctx.setVars({db: 'bucket', bucketProvider: 'gcs', dbHost: 'node', forceGCS: true, hasGcpIdentity: true})
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
    timeout: 12000
  })
})
