import { dsls, coreUtils } from '@jb6/core'
import '@jb6/testing'
import '@jb6/llm-guide/essentials.js'
import '@wonder/db/room-lambda-client.js'         // permissionByPath comp-field + roomLambda interceptor + lambdaLogger/roomLogger
import './minimal-ping-lambda.js'
import './bi-lambdas-for-tests.js'
import './room-test-lambdas.js'
import '@wonder/db/tests/gmail-test-users.js'

const {
  tgp: { Component, 'ctx-enricher': { setVars, Var, enrichCtx, testAdminUser, testUser } },
  common: { Data, Lambda,
    boolean: { equals, notEmpty, contains, and },
    data: { asIs, count, join, pipe, wFetch, invokeSnippetInContext, ping, storeCount, salesByCategory }
  },
  lambda: { 'lambda-packaging': { roomLambda } },
  test: { Test, test: { dataTest } },
  'llm-guide': { Doclet }
} = dsls

const whoAmI = Lambda('whoAmI', { permissionByPath: 'usersRO', impl: '%$userEmail%' })

const categoryDefault = Lambda('categoryDefault', {
  params: [{ id: 'category', defaultValue: 'electronics' }],
  impl: '%$category%'
})

const accountSummary = Lambda('accountSummary', {
  permissionByPath: 'usersRO',
  params: [{
    id: 'accountDetails', dynamic: true, mandatory: true,
    description: 'the account order rows; pass a %$var% to ship by value, or a wFetch(roomWUrl/...) profile to read server-side'
  }],
  impl: pipe('%$accountDetails()%', count())
})

// permission probes: same trivial body, different declared dir → drive the gate's accessLevels[dir][role] decision per room.
const pingRW = Lambda('pingRW', { permissionByPath: 'usersRW', impl: asIs({ pong: true }) })
const pingAdmin = Lambda('pingAdmin', { permissionByPath: 'admin', impl: asIs({ pong: true }) })

Test('roomLambdaTest.liveDevelopment.onLiveRepo', {
  impl: dataTest({
    setup: setVars(asIs({ roomWUrl: 'room://testPublicRoom', onLiveRepo: true })),
    calculate: invokeSnippetInContext(ping()),
    expectedResult: and(equals(true, '%pong%'), contains('in-process', { allText: join(',', { items: '%$lambdaLogger.lambdaLog.event%' }) })),
    timeout: 12000,
    logger: 'lambdaLogger'
  })
})

Test('roomLambdaTest.devMachine.lambdaViaCli', {
  HeavyTest: true,
  impl: dataTest({
    setup: setVars(asIs({ roomWUrl: 'room://testPublicRoom', onLiveRepo: true, forceDiscover: true })),
    calculate: invokeSnippetInContext(ping()),
    expectedResult: and(equals(true, '%pong%'), contains('spawning child CLI', { allText: join(',', { items: '%$lambdaLogger.lambdaLog.event%' }) })),
    timeout: 12000,
    logger: 'lambdaLogger'
  })
})

Test('roomLambdaTest.deployOnTheCloud', {
  HeavyTest: true,
  impl: dataTest({
    setup: setVars(asIs({ lambdaHost: 'https://w-staging.indivi.ai', roomWUrl: 'room://testPublicRoom' })),
    calculate: invokeSnippetInContext(salesByCategory('sports')),
    expectedResult: and(equals('sports', '%0/category%'), contains('roomLambda done', { allText: join(',', { items: '%$roomLogger.roomLog.event%' }) })),
    timeout: 12000,
    logger: 'roomLogger'
  })
})

Test('roomLambdaTest.ensureExtracted.concurrent', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async () => {
      const serverModule = '../../../cloud-services/express-server/lib/room-lambda-and-applet.js'
      const { ensureExtracted } = await import(serverModule)
      const { promises: fsp } = await import('fs')
      const root = `/tmp/ensure-extracted-${Date.now()}`, src = `${root}/src`, code = `${root}/code`
      await fsp.mkdir(src, { recursive: true })
      await fsp.writeFile(`${src}/index.js`, 'export const ok = true\n')
      await fsp.writeFile(`${src}/importmap.mjs`, 'export default {}\n')
      await coreUtils.runBashScript(`tar -czf ${root}/lambda.tar.gz -C ${src} .`)
      const tar = await fsp.readFile(`${root}/lambda.tar.gz`)
      let fetches = 0
      const dirs = await Promise.all(Array.from({ length: 20 }, () => ensureExtracted('race-test', {
        root: code, fetchTar: async () => (fetches++, await new Promise(r => setTimeout(r, 20)), tar)
      })))
      const files = await fsp.readdir(dirs[0])
      await fsp.rm(root, { recursive: true, force: true })
      return { dirs: new Set(dirs).size, fetches, hasIndex: files.includes('index.js'), hasImportmap: files.includes('importmap.mjs') }
    },
    expectedResult: and(
      equals(1, '%dirs%'),
      equals(1, '%fetches%'),
      equals(true, '%hasIndex%'),
      equals(true, '%hasImportmap%')
    ),
    timeout: 12000
  })
})

// §2 — CTX OVER THE WIRE. A call POSTs {profile, packedCtx}: profile = the macro args; packedCtx = stripCtx's harvest of the
// %$tokens% the run reaches, where ctx VARS land in packedCtx.vars (guarded by maxPackedBytes). Same accountSummary param, fed two ways:
//   byFetch  accountSummary(wFetch('…/acme.json'))  packedCtx.vars {roomWUrl} ~120B           file read server-side, rows never cross
//   byValue  accountSummary('%$accountDetails%')    packedCtx.vars {accountDetails:[...]} ~515B  the rows themselves cross; at 50 rows → 803B > budget → WARNING
// byFetch vs byValue = ship a reference vs ship the bytes. (arg rides in the profile not packedCtx; loggers §7; identity §4.)

Test('roomLambdaTest.remoteCall.argDefault', {
  impl: dataTest({
    calculate: categoryDefault(),
    expectedResult: equals('electronics', '%%')
  })
})

Test('roomLambdaTest.remoteCall.arg', {
  HeavyTest: true,
  impl: dataTest({
    setup: setVars(asIs({ lambdaHost: 'https://w-staging.indivi.ai', roomWUrl: 'room://testPublicRoom' })),
    calculate: invokeSnippetInContext(salesByCategory({ category: 'sports' })),
    expectedResult: equals('sports', '%0/category%'),
    timeout: 12000,
    logger: 'dbLogger,roomLogger,etlLogger'
  })
})

Test('roomLambdaTest.remoteCall.byFetch', {
  HeavyTest: true,
  impl: dataTest({
    calculate: invokeSnippetInContext(accountSummary(wFetch('{%$roomWUrl%}/usersRO/accounts/acme.json'))),
    expectedResult: and(equals(5, '%%'), '%$roomLogger.roomLog.packedBytes% < 200'),
    setup: setVars(asIs({lambdaHost: 'https://w-staging.indivi.ai', roomWUrl: 'room://testPublicRoom'})),
    timeout: 12000,
    logger: 'roomLogger'
  })
})

Test('roomLambdaTest.remoteCall.byValue', {
  HeavyTest: true,
  impl: dataTest({
    calculate: invokeSnippetInContext(accountSummary('%$accountDetails%')),
    expectedResult: and(equals(30, '%%'), '%$roomLogger.roomLog.packedBytes% > 300'),
    setup: setVars(() => ({
      lambdaHost: 'https://w-staging.indivi.ai',
      roomWUrl: 'room://testPublicRoom',
      accountDetails: Array.from({ length: 30 }, (_, i) => ({ amount: i }))
    })),
    timeout: 12000,
    logger: 'roomLogger'
  })
})

Test('roomLambdaTest.remoteCall.tooLargeByValue', {
  HeavyTest: true,
  impl: dataTest({
    setup: setVars(asIs({ lambdaHost: 'http://localhost:3000', roomWUrl: 'room://testPublicRoom', accountDetails: Array.from({ length: 50 }, (_, i) => ({ amount: i })) })),
    calculate: invokeSnippetInContext(accountSummary('%$accountDetails%'), { pack: roomLambda({ maxPackedBytes: 100 }) }),
    expectedResult: contains('do not pass large objects', { allText: join(',', { items: '%$roomLogger.roomLog.event%' }) }),
    timeout: 12000,
    logger: 'roomLogger'
  })
})

// ACCESS: same trivial pings, different declared dir → drive the gate's accessLevels[dir][role] decision per room.
// setup sets the ctx vars the lambda layer reads; calculate runs the gated invoke IN that ctx. roomWUrl is passed whole — a
// nested enricher (enrichCtx>Var) can't see the tester's own `room` arg, so the leaf builds the full signedRoom:// url.
const accessGranted = Component('accessGranted', {
  type: 'test<test>',
  params: [
    { id: 'room', as: 'string', mandatory: true },
    { id: 'invoke', type: 'data<common>', dynamic: true, mandatory: true, description: 'invokeSnippetInContext(pingX()) — the gated call' }
  ],
  impl: dataTest({
    setup: setVars( ({},{},{room}) => ({ lambdaHost: 'https://w-staging.indivi.ai', roomWUrl: `signedRoom://${room}` })),
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
    setup: setVars( ({},{},{room}) => ({ lambdaHost: 'https://w-staging.indivi.ai', roomWUrl: `signedRoom://${room}` })),
    calculate: '%$invoke()%',
    allowError: true,
    expectedResult: and(contains('403', { allText: join(',', { items: '%$roomLogger.roomErrors.status%' }) }),
                        contains('%$reason%', { allText: join(',', { items: '%$roomLogger.roomErrors.serverError%' }) })),
    timeout: 12000, logger: 'roomLogger'
  })
})

// ALLOW: admin grants every dir; user grants the dirs it has r on.
Test('roomLambdaTest.accessControl.admin.usersRO', {
  HeavyTest: true,
  impl: accessGranted({
    vars: [testAdminUser()],
    room: 'testSignedRoom',
    invoke: invokeSnippetInContext(ping())
  })
})
Test('roomLambdaTest.accessControl.admin.adminDir', {
  HeavyTest: true,
  impl: accessGranted({
    vars: [testAdminUser()],
    room: 'testSignedRoom',
    invoke: invokeSnippetInContext(pingAdmin())
  })
})
Test('roomLambdaTest.accessControl.user.usersRW', {
  HeavyTest: true,
  impl: accessGranted({
    vars: [testUser()],
    room: 'testUserRoom',
    invoke: invokeSnippetInContext(pingRW())
  })
})
// DENY G2: user on the admin dir (no perm). DENY G1: stranger (role null) on any dir.
Test('roomLambdaTest.accessControl.deny.userOnAdminDir', {
  HeavyTest: true,
  impl: accessDenied({
    vars: [testUser()],
    room: 'testUserRoom',
    invoke: invokeSnippetInContext(pingAdmin()),
    reason: 'forbidden: admin for role user for user'
  })
})
Test('roomLambdaTest.accessControl.deny.stranger', {
  HeavyTest: true,
  impl: accessDenied({
    vars: [testUser()],
    room: 'testStrangerRoom',
    invoke: invokeSnippetInContext(ping()),
    reason: 'forbidden: usersRO for role null for user'
  })
})

Test('roomLambdaTest.accessControl.signed', {
  HeavyTest: true,
  impl: dataTest({
    calculate: invokeSnippetInContext(salesByCategory('sports')),
    expectedResult: and(
      equals('sports', '%0/category%'),
      contains('signedRoom', { allText: join(',', { items: '%$dbLogger.dbLog.driverId%' }) }),
      contains('signedUrl ready', { allText: join(',', { items: '%$dbLogger.dbLog.t%' }) })
    ),
    setup: enrichCtx(
      testUser(),
      setVars(asIs({lambdaHost: 'https://w-staging.indivi.ai', roomWUrl: 'signedRoom://testSignedRoom'}))
    ),
    timeout: 12000,
    logger: 'dbLogger,roomLogger,etlLogger'
  })
})

Test('roomLambdaTest.runsAsUser.identity', {
  HeavyTest: true,
  impl: dataTest({
    setup: setVars(asIs({ lambdaHost: 'http://localhost:3000', roomWUrl: 'room://testPublicRoom' })),
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
    setup: setVars(asIs({ lambdaHost: 'http://localhost:3000', roomWUrl: 'room://testPublicRoom', onLiveRepo: true, runAnyways: true })),
    calculate: invokeSnippetInContext(salesByCategory('sports')),
    expectedResult: contains('progress', { allText: join(',', { items: '%$etlLogger.etlLog.severity%' }) }),
    timeout: 12000,
    logger: 'etlLogger'
  })
})

// §6 — ROOM APPLETS (browser twin) — see room-applet-tests.js

Test('roomLambdaTest.singedRoom.ping', {
  HeavyTest: true,
  impl: dataTest(invokeSnippetInContext(ping()), equals(true, '%pong%'), {
    setup: enrichCtx(
      testUser(),
      setVars(asIs({lambdaHost: 'https://w-staging.indivi.ai', roomWUrl: 'signedRoom://testSignedRoom'}))
    ),
    timeout: 12000,
    logger: 'dbLogger,roomLogger'
  })
})

// PERF: the duckdb cli's perf rides back NATIVELY in etlLog as the 'transform done' entry {cliMs, maxRssKb}. onLiveRepo +
// runAnyways ⇒ in-process, reaching cliEtl (not a cache hit), so maxRssKb is the real run. Assert on the log, no probe comp.
Test('roomLambdaTest.probe.duckdbPerf', {
  HeavyTest: true,
  impl: dataTest({
    setup: setVars(asIs({ lambdaHost: 'http://localhost:3000', roomWUrl: 'room://testPublicRoom', onLiveRepo: true, runAnyways: true })),
    calculate: invokeSnippetInContext(salesByCategory('sports')),
    expectedResult: notEmpty('%$etlLogger.etlLog.maxRssKb%'),
    timeout: 12000,
    logger: 'etlLogger'
  })
})

// §8 — CUBE QUERY OVER PARQUET, on the signed room. A cubeQuery lambda: the cube compiles `storeCount` → count_star()
// over stores.parquet, run AS THE USER, reading the protected parquet via signed-url byte-ranges (db:'gcs' server-side).
Test('roomLambdaTest.cubeQuery.signedParquet', {
  impl: dataTest(invokeSnippetInContext(storeCount()), equals(28, '%0/storeCount%'), {
    setup: enrichCtx(
      testUser(),
      setVars(asIs({lambdaHost: 'https://w-staging.indivi.ai', roomWUrl: 'signedRoom://testSignedRoom'}))
    ),
    timeout: 5000,
    logger: 'roomLogger,biLogger,colsCacheLogger'
  })
})
