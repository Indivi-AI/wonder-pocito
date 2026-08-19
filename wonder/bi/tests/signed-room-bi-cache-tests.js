import { dsls } from '@jb6/core'
import '@jb6/testing'
import '../bi-common.js'
import '@wonder/db/room-lambda-client.js'
import '@wonder/db/tests/gmail-test-users.js'

const {
  tgp: { Component, 'ctx-enricher': { enrichCtx, setVars, testUser } },
  common: { Lambda, data: { asIs, cubeQuery, invokeSnippetInContext, join },
    boolean: { equals, and, contains } },
  bi: { Cube, cube: { cube }, 'silver-builder': { parquetSource }, metric: { metric } },
  test: { Test, test: { dataTest } }
} = dsls

// the reusable signed-room fixture: 28 stores over a protected parquet, storeCount = count(*).
const cacheStoresCube = Cube('cacheStoresCube', { impl: cube({
  source: parquetSource('signedRoom://testSignedRoom/usersRO/stores.parquet', { name: 'stores' }),
  metrics: [metric('storeCount', 'count(*)')]
}) })

// the lambda under test: cacheStrategy rides in the cubeQuery profile → picks the read path locally AND survives the wire.
const cacheStoresReport = Lambda('cacheStoresReport', {
  permissionByPath: 'usersRO',
  params: [{ id: 'cacheStrategy', as: 'string', options: 'colsCache,fullFileCache' }],
  impl: cubeQuery({ sql: 'select storeCount', cube: cacheStoresCube(), cacheStrategy: '%$cacheStrategy%' })
})

// LOCAL: run the report in-process (onLiveRepo) under a chosen db + cacheStrategy; assert storeCount + the silver `via` path.
const biCacheLocalTest = Component('biCacheLocalTest', {
  type: 'test<test>',
  params: [
    { id: 'db', as: 'string', mandatory: true, description: "'fs' reads the disk mirror (strategy ignored); 'gcs' exercises the remote read path" },
    { id: 'cacheStrategy', as: 'string', description: 'colsCache/fullFileCache — omit for the cube default' },
    { id: 'expectedVia', as: 'string', mandatory: true, description: 'the resolveSilvers `via` label this strategy must log' }
  ],
  impl: dataTest({
    setup: setVars(({},{},{db}) => ({ db, hasGcpIdentity: db === 'gcs', onLiveRepo: true, roomWUrl: 'signedRoom://testSignedRoom' })),
    calculate: invokeSnippetInContext(cacheStoresReport({ cacheStrategy: '%$cacheStrategy%' })),
    expectedResult: and(equals(28, '%0/storeCount%'),
      contains('%$expectedVia%', { allText: join(',', { items: '%$biLogger.biLog.via%' }) })),
    timeout: 15000,
    logger: 'biLogger,dbLogger,roomLogger,colsCacheLogger'
  })
})

// CLOUD: ship the same lambda over the roomLambda wire (uploads + runs AS THE USER on staging). The server's biLogger
// `silver` event is merged back into our biLogger, so the same `via` assertion proves the strategy ran server-side.
const biCacheCloudTest = Component('biCacheCloudTest', {
  type: 'test<test>',
  params: [
    { id: 'cacheStrategy', as: 'string', mandatory: true, options: 'colsCache,fullFileCache' },
    { id: 'expectedVia', as: 'string', mandatory: true, description: 'the server-side resolveSilvers `via` label merged back over the wire' }
  ],
  impl: dataTest({
    setup: setVars(asIs({ lambdaHost: 'https://w-staging.indivi.ai', roomWUrl: 'signedRoom://testSignedRoom', onLiveRepo: false })),
    calculate: invokeSnippetInContext(cacheStoresReport({ cacheStrategy: '%$cacheStrategy%' })),
    expectedResult: and(equals(28, '%0/storeCount%'),
      contains('%$expectedVia%', { allText: join(',', { items: '%$biLogger.biLog.via%' }) }),
      contains('roomLambda done', { allText: join(',', { items: '%$roomLogger.roomLog.event%' }) })),
    timeout: 20000,
    logger: 'biLogger,dbLogger,roomLogger,colsCacheLogger'
  })
})

// ── the taxi fixture: 3,066,766 trips over a 45MB protected parquet (ONE row group). count(*) only reads the footer,
// so it can't show byte-range value; totalFare = sum(fare_amount) forces a COLUMN-CHUNK read → colsCache caches that
// chunk and a warm re-run turns misses into hits. This is the ONLY shape that actually exercises colsCache byte-ranging.
const cacheTaxiCube = Cube('cacheTaxiCube', { impl: cube({
  source: parquetSource('signedRoom://testSignedRoom/usersRO/taxi.parquet', { name: 'taxi' }),
  metrics: [metric('trips', 'count(*)'), metric('totalFare', 'round(sum(fare_amount))::BIGINT'), metric('totalDistance', 'round(sum(trip_distance))::BIGINT')]
}) })

const cacheTaxiReport = Lambda('cacheTaxiReport', {
  permissionByPath: 'usersRO',
  params: [{ id: 'cacheStrategy', as: 'string', options: 'colsCache,fullFileCache' }],
  impl: cubeQuery({ sql: 'select trips, totalFare, totalDistance', cube: cacheTaxiCube(), cacheStrategy: '%$cacheStrategy%' })
})

// LOCAL colsCache over the 45MB signed taxi: assert the metrics, the `colsCache extension` via, AND that the cpp scan
// actually moved fare_amount column bytes (hit OR miss > 0) — proof the extension byte-ranged a column chunk, not just the footer.
const biTaxiColsCacheLocalTest = Component('biTaxiColsCacheLocalTest', {
  type: 'test<test>',
  impl: dataTest({
    setup: setVars(({},{},{}) => ({ db: 'gcs', hasGcpIdentity: true, onLiveRepo: true, roomWUrl: 'signedRoom://testSignedRoom' })),
    calculate: invokeSnippetInContext(cacheTaxiReport({ cacheStrategy: 'colsCache' })),
    expectedResult: and(equals(3066766, '%0/trips%'), equals(56327502, '%0/totalFare%'),
      contains('colsCache extension', { allText: join(',', { items: '%$biLogger.biLog.via%' }) }),
      contains('scan.summary', { allText: join(',', { items: '%$colsCacheLogger.colsCacheLog.t%' }) })),
    timeout: 30000,
    logger: 'biLogger,dbLogger,roomLogger,colsCacheLogger'
  })
})

// CLOUD colsCache over the wire: same taxi lambda uploaded + run AS THE USER on staging; the server-side `via` + cpp
// scan.summary are merged back, proving colsCache byte-ranged the protected taxi column chunk server-side.
const biTaxiColsCacheCloudTest = Component('biTaxiColsCacheCloudTest', {
  type: 'test<test>',
  impl: dataTest({
    setup: setVars(asIs({ lambdaHost: 'https://w-staging.indivi.ai', roomWUrl: 'signedRoom://testSignedRoom', onLiveRepo: false })),
    calculate: invokeSnippetInContext(cacheTaxiReport({ cacheStrategy: 'colsCache' })),
    expectedResult: and(equals(3066766, '%0/trips%'), equals(56327502, '%0/totalFare%'),
      contains('colsCache extension', { allText: join(',', { items: '%$biLogger.biLog.via%' }) }),
      contains('roomLambda done', { allText: join(',', { items: '%$roomLogger.roomLog.event%' }) })),
    timeout: 30000,
    logger: 'biLogger,dbLogger,roomLogger,colsCacheLogger'
  })
})

// ── LOCAL (in-process) ───────────────────────────────────────────────────────────────────────────────────────────
Test('biCacheTest.local.fs',                { impl: biCacheLocalTest('fs', { expectedVia: 'fs mirror' }) })
Test('biCacheTest.local.gcs.colsCache',     { impl: biCacheLocalTest('gcs', { cacheStrategy: 'colsCache', expectedVia: 'colsCache extension' }) })
Test('biCacheTest.local.gcs.fullFileCache', { impl: biCacheLocalTest('gcs', { cacheStrategy: 'fullFileCache', expectedVia: 'fullFileCache wcache' }) })

// ── CLOUD (roomLambda wire — uploads the lambda) ─────────────────────────────────────────────────────────────────
Test('biCacheTest.cloud.colsCache',     { impl: biCacheCloudTest('colsCache', { expectedVia: 'colsCache extension' }) })
Test('biCacheTest.cloud.fullFileCache', { impl: biCacheCloudTest('fullFileCache', { expectedVia: 'fullFileCache wcache' }) })

// ── TAXI (45MB protected parquet, colsCache only — byte-range a real column chunk) ───────────────────────────────
Test('biCacheTest.taxi.local.colsCache', { impl: biTaxiColsCacheLocalTest() })
Test('biCacheTest.taxi.cloud.colsCache', { impl: biTaxiColsCacheCloudTest() })
