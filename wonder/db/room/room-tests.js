import { dsls, coreUtils } from '@jb6/core'
import '@jb6/testing'
import '@jb6/llm-guide'
import './room-lambda-client.js'         // permissionByPath comp-field + roomLambda interceptor + lambdaLogger/roomLogger
import '@wonder/db/etl/file-query.js'  // fileQuery, cachedWonderUrl, duckdb
import '@wonder/bi/bi-common.js'     // cube/cubeQuery/parquetSource — the signed-room parquet cubeQuery lambda

const {
  tgp: { Component, 'ctx-enricher': { setVars, Var, enrichCtx } },
  common: { Data, Lambda,
    boolean: { equals, notEmpty, contains, and },
    data: { asIs, count, join, pipe, fileQuery, wFetch, invokeSnippetInContext, cubeQuery }
  },
  lambda: { 'lambda-packaging': { roomLambda } },
  etl: { 'cli-extract': { cachedWonderUrl }, 'cli-transform': { duckdb } },
  bi: { cube: { cube }, 'silver-builder': { parquetSource }, metric: { metric } },
  test: { Test, test: { dataTest } },
  'llm-guide': { Doclet }
} = dsls

const salesByCategory = Lambda('salesByCategory', {
  permissionByPath: 'usersRO',
  params: [{ id: 'category', as: 'string', defaultValue: 'electronics', description: 'one category to summarize; empty = all categories' }],
  impl: fileQuery(cachedWonderUrl('{%$roomUrl%}/usersRO/sales-large.json'), {
    query: duckdb({
      sql: `SELECT category, count(*) AS count, sum(amount) AS total FROM read_json_auto('{%$inputFile%}')
          WHERE '{%$category%}' = '' OR category = '{%$category%}' GROUP BY category ORDER BY total DESC`,
      format: 'JSON, ARRAY'
    })
  })
})

const whoAmI = Lambda('whoAmI', { permissionByPath: 'usersRO', impl: '%$userEmail%' })

const accountSummary = Lambda('accountSummary', {
  permissionByPath: 'usersRO',
  params: [{ id: 'accountDetails', dynamic: true, mandatory: true, description: 'the account order rows; pass a %$var% to ship by value, or a wFetch(roomUrl/...) profile to read server-side' }],
  impl: pipe('%$accountDetails()%', count())
})

const ping = Lambda('ping', { permissionByPath: 'usersRO', impl: asIs({ pong: true }) })
// permission probes: same trivial body, different declared dir → drive the gate's accessLevels[dir][role] decision per room.
const pingRW = Lambda('pingRW', { permissionByPath: 'usersRW', impl: asIs({ pong: true }) })
const pingAdmin = Lambda('pingAdmin', { permissionByPath: 'admin', impl: asIs({ pong: true }) })

Test('roomLambdaTest.liveDevelopment.onLiveRepo', {
  impl: dataTest({
    setup: setVars(asIs({ roomUrl: 'room://testPublicRoom', onLiveRepo: true })),
    calculate: invokeSnippetInContext(ping()),
    expectedResult: and(equals(true, '%pong%'), contains('in-process', { allText: join(',', { items: '%$lambdaLogger.lambdaLog.event%' }) })),
    timeout: 12000,
    logger: 'lambdaLogger'
  })
})

Test('roomLambdaTest.devMachine.lambdaViaCli', {
  HeavyTest: true,
  impl: dataTest({
    setup: setVars(asIs({ roomUrl: 'room://testPublicRoom', onLiveRepo: true, forceDiscover: true })),
    calculate: invokeSnippetInContext(ping()),
    expectedResult: and(equals(true, '%pong%'), contains('spawning child CLI', { allText: join(',', { items: '%$lambdaLogger.lambdaLog.event%' }) })),
    timeout: 12000,
    logger: 'lambdaLogger'
  })
})

Test('roomLambdaTest.deployOnTheCloud', {
  HeavyTest: true,
  impl: dataTest({
    setup: setVars(asIs({ lambdaHost: 'https://staging.indivi.ai', roomUrl: 'room://testPublicRoom' })),
    calculate: invokeSnippetInContext(salesByCategory('sports')),
    expectedResult: and(equals('sports', '%0/category%'), contains('roomLambda done', { allText: join(',', { items: '%$roomLogger.roomLog.event%' }) })),
    timeout: 12000,
    logger: 'roomLogger'
  })
})

Test('roomLambdaTest.ensureExtracted.concurrent', {
  impl: dataTest({
    calculate: async () => {
      const serverModule = '../../cloud-services/express-server/lib/room-lambda-and-applet.js'
      const { ensureExtracted } = await import(serverModule)
      const { promises: fsp } = await import('fs')
      const root = `/tmp/ensure-extracted-${Date.now()}`, src = `${root}/src`, code = `${root}/code`
      await fsp.mkdir(src, { recursive: true })
      await fsp.writeFile(`${src}/index.js`, 'export const ok = true\n')
      await fsp.writeFile(`${src}/importmap.mjs`, 'export default {}\n')
      await coreUtils.runBashScript(`tar -czf ${root}/lambda.tar.gz -C ${src} .`)
      const tar = await fsp.readFile(`${root}/lambda.tar.gz`)
      let fetches = 0
      const dirs = await Promise.all(Array.from({ length: 20 }, () => ensureExtracted('race-test', { root: code, fetchTar: async () => (fetches++, await new Promise(r => setTimeout(r, 20)), tar) })))
      const files = await fsp.readdir(dirs[0])
      await fsp.rm(root, { recursive: true, force: true })
      return { dirs: new Set(dirs).size, fetches, hasIndex: files.includes('index.js'), hasImportmap: files.includes('importmap.mjs') }
    },
    expectedResult: and(equals(1, '%dirs%'), equals(1, '%fetches%'), equals(true, '%hasIndex%'), equals(true, '%hasImportmap%')),
    timeout: 12000
  })
})

// §2 — CTX OVER THE WIRE. A call POSTs {profile, packedCtx}: profile = the macro args; packedCtx = stripCtx's harvest of the
// %$tokens% the run reaches, where ctx VARS land in packedCtx.vars (guarded by maxPackedBytes). Same accountSummary param, fed two ways:
//   byFetch  accountSummary(wFetch('…/acme.json'))  packedCtx.vars {roomUrl} ~120B           file read server-side, rows never cross
//   byValue  accountSummary('%$accountDetails%')    packedCtx.vars {accountDetails:[...]} ~515B  the rows themselves cross; at 50 rows → 803B > budget → WARNING
// byFetch vs byValue = ship a reference vs ship the bytes. (arg rides in the profile not packedCtx; loggers §7; identity §4.)

Test('roomLambdaTest.wire.argDefault', {
  HeavyTest: true,
  impl: dataTest({
    setup: setVars(asIs({ lambdaHost: 'https://staging.indivi.ai', roomUrl: 'room://testPublicRoom' })),
    calculate: invokeSnippetInContext(salesByCategory()),
    expectedResult: equals('electronics', '%0/category%'),
    timeout: 12000,
    logger: 'dbLogger,roomLogger,etlLogger'
  })
})

Test('roomLambdaTest.wire.arg', {
  HeavyTest: true,
  impl: dataTest({
    setup: setVars(asIs({ lambdaHost: 'https://staging.indivi.ai', roomUrl: 'room://testPublicRoom' })),
    calculate: invokeSnippetInContext(salesByCategory({ category: 'sports' })),
    expectedResult: equals('sports', '%0/category%'),
    timeout: 12000,
    logger: 'dbLogger,roomLogger,etlLogger'
  })
})

Test('roomLambdaTest.wire.byFetch', {
  HeavyTest: true,
  impl: dataTest({
    setup: setVars(asIs({ lambdaHost: 'https://staging.indivi.ai', roomUrl: 'room://testPublicRoom' })),
    calculate: invokeSnippetInContext(accountSummary(wFetch('{%$roomUrl%}/usersRO/accounts/acme.json'))),
    expectedResult: and(equals(5, '%%'),                                          // ROUND-TRIP: the lambda read acme.json server-side & counted its 5 rows
                        '%$roomLogger.roomLog.packedBytes% < 200'),                // SMALL: only the url's token crossed, NOT the rows
    timeout: 12000,
    logger: 'roomLogger'
  })
})

Test('roomLambdaTest.wire.byValue', {
  HeavyTest: true,
  impl: dataTest({
    setup: setVars(asIs({ lambdaHost: 'https://staging.indivi.ai', roomUrl: 'room://testPublicRoom', accountDetails: Array.from({ length: 30 }, (_, i) => ({ amount: i })) })),
    calculate: invokeSnippetInContext(accountSummary('%$accountDetails%')),
    expectedResult: and(equals(30, '%%'),                                         // ROUND-TRIP: the 30 rows themselves crossed & were counted server-side
                        '%$roomLogger.roomLog.packedBytes% > 300'),                // LARGE: the rows crossed in packedCtx.vars (vs byFetch's ~120)
    timeout: 12000,
    logger: 'roomLogger'
  })
})

Test('roomLambdaTest.wire.tooLargeByValue', {
  HeavyTest: true,
  impl: dataTest({
    setup: setVars(asIs({ lambdaHost: 'http://localhost:3000', roomUrl: 'room://testPublicRoom', accountDetails: Array.from({ length: 50 }, (_, i) => ({ amount: i })) })),
    calculate: invokeSnippetInContext(accountSummary('%$accountDetails%'), { pack: roomLambda({ maxPackedBytes: 100 }) }),
    expectedResult: contains('do not pass large objects', { allText: join(',', { items: '%$roomLogger.roomLog.event%' }) }),
    timeout: 12000,
    logger: 'roomLogger'
  })
})

// ACCESS: same trivial pings, different declared dir → drive the gate's accessLevels[dir][role] decision per room.
// setup sets the ctx vars the lambda layer reads; calculate runs the gated invoke IN that ctx. roomUrl is passed whole — a
// nested enricher (enrichCtx>Var) can't see the tester's own `room` arg, so the leaf builds the full signedRoom:// url.
const accessGranted = Component('accessGranted', {
  type: 'test<test>',
  params: [
    { id: 'room', as: 'string', mandatory: true },
    { id: 'invoke', type: 'data<common>', dynamic: true, mandatory: true, description: 'invokeSnippetInContext(pingX()) — the gated call' }
  ],
  impl: dataTest({
    setup: setVars( ({},{},{room}) => ({ lambdaHost: 'https://staging.indivi.ai', roomUrl: `signedRoom://${room}` })),
    calculate: '%$invoke()%',
    expectedResult: equals(true, '%pong%'),
    timeout: 12000, logger: 'roomLogger'
  })
})

const accessDenied = Component('accessDenied', {
  type: 'test<test>',
  params: [
    { id: 'room', as: 'string', mandatory: true },
    { id: 'invoke', type: 'data<common>', dynamic: true, mandatory: true, description: 'invokeSnippetInContext(pingX()) — the gated call' },
    { id: 'reason', as: 'string', mandatory: true, description: 'the serverError substring the 403 must carry' }
  ],
  impl: dataTest({
    setup: setVars( ({},{},{room}) => ({ lambdaHost: 'https://staging.indivi.ai', roomUrl: `signedRoom://${room}` })),
    calculate: '%$invoke()%',
    allowError: true,
    expectedResult: and(contains('403', { allText: join(',', { items: '%$roomLogger.roomErrors.status%' }) }),
                        contains('%$reason%', { allText: join(',', { items: '%$roomLogger.roomErrors.serverError%' }) })),
    timeout: 12000, logger: 'roomLogger'
  })
})

// ALLOW: admin grants every dir; user grants the dirs it has r on.
Test('roomLambdaTest.perm.admin.usersRO', { HeavyTest: true, impl: accessGranted('testSignedRoom', invokeSnippetInContext(ping())) })
Test('roomLambdaTest.perm.admin.adminDir', { HeavyTest: true, impl: accessGranted('testSignedRoom', invokeSnippetInContext(pingAdmin())) })
Test('roomLambdaTest.perm.user.usersRW', { HeavyTest: true, impl: accessGranted('testUserRoom', invokeSnippetInContext(pingRW())) })
// DENY G2: user on the admin dir (no perm). DENY G1: stranger (role null) on any dir.
Test('roomLambdaTest.perm.deny.userOnAdminDir', { HeavyTest: true, impl: accessDenied('testUserRoom', invokeSnippetInContext(pingAdmin()), 'forbidden: admin for role user for user') })
Test('roomLambdaTest.perm.deny.stranger', { HeavyTest: true, impl: accessDenied('testStrangerRoom', invokeSnippetInContext(ping()), 'forbidden: usersRO for role null for user') })

Test('roomLambdaTest.perm.signed', {
  HeavyTest: true,
  impl: dataTest({
    calculate: invokeSnippetInContext(salesByCategory('sports')),
    expectedResult: contains('X-Goog-Signature=', {
      allText: join(',', { items: '%$dbLogger.dbLog.filePathUrl%' })
    }),
    setup: setVars(asIs({lambdaHost: 'https://staging.indivi.ai', roomUrl: 'signedRoom://testSignedRoom'})),
    timeout: 12000,
    logger: 'dbLogger,roomLogger,etlLogger'
  })
})

Test('roomLambdaTest.runsAsUser.identity', {
  HeavyTest: true,
  impl: dataTest({
    setup: setVars(asIs({ lambdaHost: 'http://localhost:3000', roomUrl: 'room://testPublicRoom' })),
    calculate: invokeSnippetInContext(whoAmI()),
    expectedResult: contains('@'),   // the server overlays the trusted caller email; assert it's a real address, not a hardcoded one
    timeout: 12000,
    logger: 'dbLogger,roomLogger'
  })
})

// PROGRESS: etlLogger.status(...) emits severity:'progress' entries into etlLog natively. In-process (onLiveRepo + runAnyways)
// keeps them in the log; the streamed wire path peels them off to the SSE/stepper channel. Assert on the native log entries.
Test('roomLambdaTest.progress.stream', {
  HeavyTest: true,
  impl: dataTest({
    setup: setVars(asIs({ lambdaHost: 'http://localhost:3000', roomUrl: 'room://testPublicRoom', onLiveRepo: true, runAnyways: true })),
    calculate: invokeSnippetInContext(salesByCategory('sports')),
    expectedResult: contains('progress', { allText: join(',', { items: '%$etlLogger.etlLog.severity%' }) }),
    timeout: 12000,
    logger: 'etlLogger'
  })
})

// §6 — ROOM APPLETS (browser twin) — see room-applet-tests.js

Test('roomLambdaTest.singedRoom.ping', {
  HeavyTest: true,
  impl: dataTest({
    setup: setVars(asIs({ lambdaHost: 'https://staging.indivi.ai', roomUrl: 'signedRoom://testSignedRoom' })),
    calculate: invokeSnippetInContext(ping()),
    expectedResult: equals(true, '%pong%'),   // signed-room wire pongs; the signed-URL guarantee (X-Goog-Signature) is proven by perm.signed, which actually reads a file
    timeout: 12000,
    logger: 'dbLogger,roomLogger'
  })
})

// PERF: the duckdb cli's perf rides back NATIVELY in etlLog as the 'transform done' entry {cliMs, maxRssKb}. onLiveRepo +
// runAnyways ⇒ in-process, reaching cliEtl (not a cache hit), so maxRssKb is the real run. Assert on the log, no probe comp.
Test('roomLambdaTest.probe.duckdbPerf', {
  HeavyTest: true,
  impl: dataTest({
    setup: setVars(asIs({ lambdaHost: 'http://localhost:3000', roomUrl: 'room://testPublicRoom', onLiveRepo: true, runAnyways: true })),
    calculate: invokeSnippetInContext(salesByCategory('sports')),
    expectedResult: notEmpty('%$etlLogger.etlLog.maxRssKb%'),
    timeout: 12000,
    logger: 'etlLogger'
  })
})

// §8 — CUBE QUERY OVER PARQUET, on the signed room. A cubeQuery lambda: the cube compiles `storeCount` → count_star()
// over stores.parquet, run AS THE USER, reading the protected parquet via signed-url byte-ranges (db:'gcs' server-side).
const storeCount = Lambda('storeCount', {
  permissionByPath: 'usersRO',
  impl: cubeQuery({ sql: 'select storeCount', cube: cube({
    source: parquetSource('signedRoom://testSignedRoom/usersRO/stores.parquet', { name: 'stores' }),
    metrics: [metric('storeCount', 'count(*)')]
  }) })
})
Test('roomLambdaTest.cubeQuery.signedParquet', {
  impl: dataTest({
    setup: setVars(asIs({ lambdaHost: 'http://localhost:3000', roomUrl: 'signedRoom://testSignedRoom', onLiveRepo: true })),
    calculate: invokeSnippetInContext(storeCount()),
    expectedResult: equals(28, '%0/storeCount%'),
    timeout: 5000,
    logger: 'roomLogger,biLogger,colsCacheLogger'
  })
})

// wasm twin: same cube over the PUBLIC-room parquet (plain gcs url, no signing) — the browser has no auth token.
const storeCountPublic = Lambda('storeCountPublic', {
  permissionByPath: 'usersRO',
  impl: cubeQuery({ sql: 'select storeCount', cube: cube({
    source: parquetSource('room://testPublicRoom/usersRO/stores.parquet', { name: 'stores' }),
    metrics: [metric('storeCount', 'count(*)')]
  }) })
})
Test('roomLambdaTest.cubeQuery.wasm', {
  impl: dataTest({
    setup: setVars(asIs({ roomUrl: 'room://testPublicRoom', onLiveRepo: true })),
    calculate: invokeSnippetInContext(storeCountPublic()),
    expectedResult: equals(28, '%0/storeCount%'),
    timeout: 5000,
    logger: 'roomLogger,biLogger,colsCacheLogger'
  })
})
