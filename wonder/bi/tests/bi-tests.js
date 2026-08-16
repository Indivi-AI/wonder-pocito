import { dsls } from '@jb6/core'
import '@jb6/testing'
import '../bi-common.js'
import '../materialization.js'
import '../event-sources.js'
import '@wonder/db/room/managed-ctx.js'

const {
  tgp: { Const, 'ctx-enricher': { setupCube, setVar, setVars, tempView, materializedView } },
  test: { Test, test: { dataTest } },
  common: { data: {
    asIs, buildCube, compileCubeSql, cubeQuery, cubeToolInfoForQuery, statFitMetrics, materializeCubeEvents, materializeCubePeriod,
    metricDrift, readEventSource, pipe, pipeline, resolveKeySpan, spanView, wFetch
  },
  boolean: { notNull, gt, notEquals, equals, and, or, contains } },
  'managed-data-ctx': { 'freshness-policy': { never, ttl } },
  'bi': {
    Cube, SilverBuilder,
    cube:               { cube, cubeless },
    'silver-builder':    { materializeFromEvents, parquetSource },
    'event-source':     { bucketUrlSourceJsonEvents, apiWUrlSource },
    'parquet-file':     { projection },
    'event-predicate':  { eventType },
    'field-reducer':    { pick, enrichFromLookup, firstSucceeding },
    lookup:         { lookupByQuery },
    'query-lookup':  { lookupByWUrl },
    pick:           { count, sum, exists, uniqueBy, last, first, min, max, peak, mostFrequent, distinctCount, all },
    dimension:      { dimension },
    metric:         { metric, ratio },
    validation:     { validation },
    stat:            { normalStat, skewedStat, uniformStat, categoricalStat },
    'metric-validation': { aboveBaseline }
  }
} = dsls

// scenario-grouped: each § holds its fixtures + cube + the tests that exercise it, in pipeline order (reduce → build → query).
//   §1 product cube · §2 event sources · §3 session cube · §4 signed-room lambda · §5 metric algebra · §6 stats · §7 drift & views


// §1 PRODUCT CUBE
Const('priceDay','2026-01-01')
Const('priceEvents',[
  { productId: 'A', price: 90 }, { productId: 'A', price: 100 },
  { productId: 'B', price: 180 }, { productId: 'B', price: 200 }
])

const productEvents = SilverBuilder('productEvents', { impl: materializeFromEvents({
  eventSource: 'roomLogs://testPublicRoom/prices/${period}/${productId}-${counter}.json',
  keyField: 'productId',
  fields: [pick('productId, price', { take: last() })],
  parquetFiles: [projection('products', 'room://testPublicRoom/usersRO/silver/products-${period}.parquet')]
}) })
const productCube = Cube('productCube', { impl: cube({
  source: productEvents(),
  metrics: [metric('avg_price', 'avg(price)')]
}) })

Test('biTest.productMaterialize', {
  impl: dataTest({
    calculate: materializeCubeEvents(productCube(), '%$priceEvents%'),
    expectedResult: equals(asIs([
        {productId: 'A', price: 100},
        {productId: 'B', price: 200}
    ])),
    logger: 'biLogger'
  })
})

Test('biTest.parquetSourceBuildSkipped', {
  impl: dataTest({
    calculate: buildCube(cube(parquetSource('/tmp/unused.parquet', 'local'), { metrics: [] })),
    expectedResult: and(equals('full', '%plan/sourceType%'), equals(true, '%plan/skip%'), equals(true, '%result/skipped%'))
  })
})

Test('biTest.productBuild', {
  HeavyTest: true,
  impl: dataTest(materializeCubePeriod(productCube(), '%$priceDay%'), equals(2, '%objs%'), {
    setup: setVars(asIs({db: 'bucket', bucketProvider: 'gcs', hasGcpIdentity: true, onLiveRepo: true,
      roomWUrl: 'room://testPublicRoom'})),
    timeout: 10000,
    logger: 'biLogger'
  })
})

Test('biTest.productGoldQuery', {
  HeavyTest: true,
  impl: dataTest(cubeQuery('select avg_price'), equals(150, '%0/avg_price%'), {
    setup: setupCube(productCube(), '%$priceDay%'),
    timeout: 10000,
    logger: 'biLogger'
  })
})

// query-lookup consumed IN THE cubeQuery SQL as a MAP-join. the cube's main table is salesByCity (city→revenue, a jsonl silver);
// the queryLookup lookupByWUrl publishes a pop(city) MAP-macro (city→population from cities.json) as a sqlPrelude. the query
// "joins" the population onto each row by simply calling pop(city) — duckdb resolves it per row straight from the map.
const salesByCityCube = Cube('salesByCityCube', { impl: cube({
  source: parquetSource('room://testPublicRoom/usersRO/salesByCity-${period}.jsonl', { name: 'salesByCity' }),
  metrics: [
    metric('revenue', 'sum(revenue)'),
    metric('population', 'max(pop(city))')   // the lookup macro rides INSIDE a metric expression — sqlEditor expands `population` → max(pop(city))
  ],
  queryLookups: [lookupByWUrl('room://testPublicRoom/usersRO/cities.json', { bindAs: 'pop', key: 'city', value: 'population' })]
}) })
Test('biTest.perCapitaMap', {
  HeavyTest: true,
  impl: dataTest({
    setup: setupCube(salesByCityCube(), '%$priceDay%'),
    calculate: cubeQuery('select city, pop(city) population from {%$salesByCity%} group by city order by city'),
    expectedResult: and(equals(3, '%length%'),
      equals('Boston', '%0/city%'), equals(675647, '%0/population%'),
      equals('New York', '%1/city%'), equals(8804190, '%1/population%'),
      equals('Seattle', '%2/city%'), equals(737015, '%2/population%')),
    vars: setVars(asIs({ db: 'bucket', bucketProvider: 'gcs', hasGcpIdentity: true, onLiveRepo: true,
      roomWUrl: 'room://testPublicRoom' })),
    timeout: 10000,
    logger: 'biLogger,dbLogger'
  })
})

// same lookup, consumed THROUGH A METRIC: the cube's `population` metric IS max(pop(city)); the query author selects `population`
// by name (never sees pop) — sqlEditor expands the metric ref and the macro-prelude resolves it per group. this is the
// "do it with metrics" path: the lookup lives in the cube's vocabulary, not in the ad-hoc SQL.
Test('biTest.perCapitaMetric', {
  impl: dataTest({
    setup: setupCube(salesByCityCube(), '%$priceDay%'),
    calculate: cubeQuery('select city, revenue, population group by city order by city'),
    expectedResult: and(equals(3, '%length%'),
      equals('Boston', '%0/city%'), equals(120, '%0/revenue%'), equals(675647, '%0/population%'),
      equals('New York', '%1/city%'), equals(500, '%1/revenue%'), equals(8804190, '%1/population%'),
      equals('Seattle', '%2/city%'), equals(300, '%2/revenue%'), equals(737015, '%2/population%')),
    vars: setVars(asIs({ db: 'bucket', bucketProvider: 'gcs', hasGcpIdentity: true, onLiveRepo: true,
      roomWUrl: 'room://testPublicRoom' })),
    timeout: 10000,
    logger: 'biLogger,dbLogger'
  })
})


// §2 EVENT SOURCES
// readEventSource drives the source alone (no reduce/parquet) and asserts contiguous: the events arrive keyField-grouped.
Test('biTest.bucketUrlSourceRead', {
  HeavyTest: true,
  impl: dataTest({
    calculate: readEventSource(bucketUrlSourceJsonEvents('roomLogs://testPublicRoom/prices/${period}/${productId}-${counter}.json'), '%$priceDay%', 'productId'),
    expectedResult: and(equals(4, '%count%'), equals('%contiguous%', true)),
    setup: setVars(asIs({db: 'bucket', bucketProvider: 'gcs', hasGcpIdentity: true, onLiveRepo: true,
      roomWUrl: 'room://testPublicRoom'})),
    timeout: 10000,
    logger: 'biLogger'
  })
})

const apiPriceEvents = SilverBuilder('apiPriceEvents', { impl: materializeFromEvents({
  eventSource: apiWUrlSource('room://testPublicRoom/usersRO/api-rows-${period}.json'),
  keyField: 'productId',
  fields: [pick('productId, price', { take: last() })],
  parquetFiles: [projection('products', 'room://testPublicRoom/usersRO/silver/api-products-${period}.parquet')]
}) })
const apiPriceCube = Cube('apiPriceCube', { impl: cube({
  source: apiPriceEvents(),
  metrics: [metric('avg_price', 'avg(price)')]
}) })

Test('biTest.apiCubeBuild', {
  HeavyTest: true,
  impl: dataTest(pipeline(
    wFetch('room://testPublicRoom/usersRO/api-rows-%$priceDay%.json', { method: 'PUT', body: asIs([
      { productId: 'B', price: 180 }, { productId: 'A', price: 90 }, { productId: 'B', price: 200 }, { productId: 'A', price: 100 }
    ]) }),
    materializeCubePeriod(apiPriceCube(), '%$priceDay%')
  ), equals(2, '%objs%'), {
    setup: setVars(asIs({db: 'bucket', bucketProvider: 'gcs', hasGcpIdentity: true, onLiveRepo: true,
      roomWUrl: 'room://testPublicRoom'})),
    timeout: 15000,
    logger: 'biLogger,dbLogger'
  })
})


// §3 SESSION CUBE
// s2 is a bot → the notBot validation flags it; the cardClick picks dedup by uniqueBy before count/sum/exists.
Const('sessionClickstream', [
  { t: 'pageLoad', sessionId: 's1', variant: 'V11', timestamp: 1000, device: 'desktop', url: '/p', urlParams: { sub1: 'a1' }, clientIP: '1.1.1.1' },
  { t: 'cardClick', sessionId: 's1', variant: 'V11', timestamp: 1100, clickId: 'c1', company: 'acme', pos: 1, cpc: '2.5' },
  { t: 'cardClick', sessionId: 's1', variant: 'V11', timestamp: 1200, clickId: 'c2', company: 'acme', pos: 2, cpc: '1.5' },
  { t: 'pageLoad', sessionId: 's2', variant: 'V12', timestamp: 2000, device: 'bot', url: '/q', urlParams: {}, clientIP: '2.2.2.2' }
])

const sessionEvents = SilverBuilder('sessionEvents', { impl: materializeFromEvents({
  eventSource: 'roomLogs://testRoom/${period}/${session}-${counter}.json',
  keyField: 'sessionId',
  periodGranularity: 'daily',
  periodPattern: 'YYYY-MM-DD',
  fields: [
    pick('sessionId, variant, timestamp as startTime'),
    pick('device, url as urlPath, urlParams.sub1, urlParams.sub2, urlParams.sub3, clientIP', { eventFilter: eventType('pageLoad') }),
    pick('cardClicks', { eventFilter: eventType('cardClick'), take: uniqueBy('clickId,company,pos', { take: count() }) }),
    pick('cpc as revenue', { eventFilter: eventType('cardClick'), take: uniqueBy('clickId,company,pos', { take: sum() }) }),
    pick('isConverter', { eventFilter: eventType('cardClick'), take: uniqueBy('clickId,company,pos', { take: exists() }) })
  ],
  validations: [
    validation('hasSessionId', notNull('%sessionId%')),
    validation('validStartTime', gt({ than: 0, val: '%startTime%' })),
    validation('notBot', notEquals('bot', '%device%'))
  ],
  parquetFiles: [
    projection('signedRoom://testRoom/analytics/sessions-{period}-{version}', { fields: '*' }),
    projection('signedRoom://testRoom/analytics/sessions-{month}-{version}', { fields: '*' }),
  ]
}) })
const sessionCube = Cube('sessionCube', {
  impl: cube({
    source: sessionEvents(),
    dimensions: [
      dimension('variant', { guidance: 'low cardinality, safe to group — the A/B test arm' }),
      dimension('device', { guidance: 'low cardinality (mobile/desktop/bot), safe to group' }),
      dimension('urlPath', { guidance: 'high cardinality — filter or top-N, avoid full group' }),
      dimension('sub1', { guidance: 'high cardinality affiliate sub-id — filter, do not group blindly' }),
      dimension('sub2', { guidance: 'high cardinality affiliate sub-id — filter, do not group blindly' }),
      dimension('sub3', { guidance: 'high cardinality affiliate sub-id — filter, do not group blindly' }),
      dimension('time', { type: 'timestamp', guidance: 'bucket by day/hour/week; never group raw' })
    ],
    metrics: [
      metric('session_count', 'count'),
      metric('bids', 'sum(cardClicks)'),
      metric('converters', 'sum(isConverter)'),
      metric('totalRevenue', 'sum(revenue)'),
      ratio('ctr', 'bids/session_count'),
      ratio('cvr', 'converters/session_count'),
      ratio('avg_bid', 'totalRevenue/bids', { scale: 1 }),
      ratio('usd_per_session', 'totalRevenue/session_count', { scale: 1 })
    ]
  })
})

Test('biTest.materializeSample', {
  impl: dataTest({
    calculate: materializeCubeEvents(sessionCube(), '%$sessionClickstream%'),
    expectedResult: equals(2, '%length%'),
    logger: 'biLogger'
  })
})

const miniEvents = SilverBuilder('miniEvents', { impl: materializeFromEvents({
  eventSource: 'room://demoRoom/usersRO/events/${period}/x.json', keyField: 'sessionId',
  fields: [pick('variant'), pick('cpc as revenue', { eventFilter: eventType('cardClick'), take: sum() })],
  parquetFiles: [projection('sessions', 'room://demoRoom/usersRO/silver/sessions-${period}.parquet')]
}) })
const miniCube = Cube('miniCube', { impl: cube({
  source: miniEvents(),
  metrics: [
    metric('session_count', 'count'), metric('bids', 'sum(cardClicks)'),
    metric('totalRevenue', 'sum(revenue)'), ratio('ctr', 'bids/session_count')
  ]
}) })

Test('biTest.variantsBySessions', {
  HeavyTest: true,
  impl: dataTest({
    setup: setupCube(miniCube(), '2000-01-01'),
    calculate: cubeQuery('select variant, session_count, bids, totalRevenue, ctr where valid=1 group by variant order by session_count desc'),
    expectedResult: equals(2, '%length%'),
    timeout: 10000,
    logger: 'biLogger'
  })
})

Test('biTest.cubeInfoForQuery', {
  HeavyTest: true,
  impl: dataTest({
    calculate: cubeToolInfoForQuery(miniCube(), '2000-01-01'),
    expectedResult: and(equals('sessions', '%cube%'), equals(4, '%dataState/rows%'), equals('sessionId', '%dataState/keyField%'),
      equals('session_count', '%queryVocabulary/metrics/0/name%')),
    timeout: 10000,
    logger: 'biLogger'
  })
})

// §5 METRIC ALGEBRA
const allMetricsEvents = SilverBuilder('allMetricsEvents', { impl: materializeFromEvents({
  eventSource: 'room://x/${period}/x.json', keyField: 'sessionId',
  fields: [pick('variant, userId, revenue, cardClicks')]
}) })
const allMetricsCube = Cube('allMetricsCube', { impl: cube({
  source: allMetricsEvents(),
  metrics: [
    metric('session_count', 'count'), metric('uniq_users', 'distinctCount(userId)'),
    metric('totalRevenue', 'sum(revenue)'), metric('maxRevenue', 'max(revenue)'),
    metric('minRevenue', 'min(revenue)'), metric('avgRevenue', 'avg(revenue)'),
    metric('bids', 'sum(cardClicks)'),
    ratio('ctr', 'bids/session_count'), ratio('avg_bid', 'totalRevenue/bids', { scale: 1 })
  ]
}) })

Test('biTest.metricKindsSelect', {
  impl: dataTest({
    calculate: compileCubeSql(allMetricsCube(),
      'select variant, session_count, uniq_users, totalRevenue, maxRevenue, minRevenue, avgRevenue, bids, ctr, avg_bid from tbl group by variant'),
    expectedResult: contains({ anyOrder: true, text: [
      'count_star() AS session_count', 'count(DISTINCT userId) AS uniq_users', 'sum(revenue) AS totalRevenue',
      'max(revenue) AS maxRevenue', 'min(revenue) AS minRevenue', 'avg(revenue) AS avgRevenue', 'sum(cardClicks) AS bids',
      'round(((100.0 * sum(cardClicks)) / "nullif"(count_star(), 0)), 2) AS ctr',
      'round(((1.0 * sum(revenue)) / "nullif"(sum(cardClicks), 0)), 2) AS avg_bid'
    ] }),
    logger: 'biLogger'
  })
})

// in HAVING/ORDER the metric expands BARE (no alias) — the same one visitor, everywhere.
Test('biTest.metricKindsTailClauses', {
  impl: dataTest({
    calculate: compileCubeSql(allMetricsCube(), 'select variant, ctr from tbl group by variant having bids > 2 order by ctr desc'),
    expectedResult: contains({ anyOrder: true, text: [
      'HAVING (sum(cardClicks) > 2)',
      'ORDER BY round(((100.0 * sum(cardClicks)) / "nullif"(count_star(), 0)), 2) DESC'
    ] }),
    logger: 'biLogger'
  })
})


// §6 STATS
Test('biTest.statFitMetricsNormal', {
  impl: dataTest(statFitMetrics(normalStat(), 'price'),
    equals(asIs([
      { name: 'price_mu', agg: 'avg', field: 'price' }, { name: 'price_sigma', agg: 'stddev', field: 'price' },
      { name: 'price_skew', agg: 'skewness', field: 'price' }
    ])))
})
Test('biTest.statFitMetricsSkewed', {
  impl: dataTest(statFitMetrics(skewedStat(), 'price'),
    equals(asIs([{ name: 'price_median', agg: 'median', field: 'price' }, { name: 'price_skew', agg: 'skewness', field: 'price' }])))
})
Test('biTest.statFitMetricsUniform', {
  impl: dataTest(statFitMetrics(uniformStat(), 'price'),
    equals(asIs([{ name: 'price_a', agg: 'min', field: 'price' }, { name: 'price_b', agg: 'max', field: 'price' }])))
})
Test('biTest.statFitMetricsCategorical', {
  impl: dataTest(statFitMetrics(categoricalStat(), 'tier'),
    equals(asIs([{ name: 'tier_hist', agg: 'histogram', field: 'tier' }])))
})

const statCube = Cube('statCube', { impl: cube({
  source: allMetricsEvents(),
  metrics: [metric('price_mu', 'avg(revenue)'), metric('price_sigma', 'stddev(revenue)'), metric('price_skew', 'skewness(revenue)')]
}) })
Test('biTest.statFitCompiles', {
  impl: dataTest({
    calculate: compileCubeSql(statCube(), 'select price_mu, price_sigma, price_skew from tbl'),
    expectedResult: contains({ anyOrder: true, text: ['avg(revenue) AS price_mu', 'stddev(revenue) AS price_sigma', 'skewness(revenue) AS price_skew'] }),
    logger: 'biLogger'
  })
})


// §7 DRIFT & VIEWS
// c1 fatigues: roas ~4 then collapses to 1.5 on day 5 (< 0.5·baseline → drift_day); c2 stays flat (no drift).
Const('rentalSeries', [
  { sub1: 'c1', day: '2026-01-01', val: 4.0 }, { sub1: 'c1', day: '2026-01-02', val: 4.2 }, { sub1: 'c1', day: '2026-01-03', val: 3.8 },
  { sub1: 'c1', day: '2026-01-04', val: 3.9 }, { sub1: 'c1', day: '2026-01-05', val: 1.5 }, { sub1: 'c1', day: '2026-01-06', val: 1.2 },
  { sub1: 'c2', day: '2026-01-01', val: 3.0 }, { sub1: 'c2', day: '2026-01-02', val: 3.1 }, { sub1: 'c2', day: '2026-01-03', val: 2.9 },
  { sub1: 'c2', day: '2026-01-04', val: 3.0 }, { sub1: 'c2', day: '2026-01-05', val: 2.8 }, { sub1: 'c2', day: '2026-01-06', val: 3.2 }
])
Test('biTest.metricDriftDetects', {
  impl: dataTest({
    setup: tempView('daySeries', '%$rentalSeries%'),
    calculate: metricDrift('%$daySeries%', { key: 'sub1', validation: aboveBaseline(0.5) }),
    expectedResult: equals(asIs([{ sub1: 'c1', drift_day: '2026-01-05', baseline: 4.2 }, { sub1: 'c2', drift_day: null, baseline: 3.1 }])),
    timeout: 10000,
    logger: 'biLogger'
  })
})

// never-fresh forces the build branch: COPY rentalSeries to the room parquet, then drift off it.
Test('biTest.materializedViewBuilds', {
  HeavyTest: true,
  impl: dataTest({
    setup: materializedView('rentalView', 'room://testPublicRoom/usersRO/views/rentalView.parquet', '%$rentalSeries%', { freshness: never() }),
    calculate: metricDrift('%$rentalView%', { key: 'sub1', validation: aboveBaseline(0.5) }),
    expectedResult: equals(asIs([{ sub1: 'c1', drift_day: '2026-01-05', baseline: 4.2 }, { sub1: 'c2', drift_day: null, baseline: 3.1 }])),
    vars: setVars(asIs({ db: 'bucket', bucketProvider: 'gcs', hasGcpIdentity: true, onLiveRepo: true,
      roomWUrl: 'room://testPublicRoom' })),
    timeout: 15000,
    logger: 'biLogger'
  })
})

// the reuse branch: ttl=fresh → NO rebuild (empty rows source proves rows() never runs) → same drift off the cached parquet.
Test('biTest.materializedViewReuses', {
  HeavyTest: true,
  impl: dataTest({
    setup: materializedView('rentalView', 'room://testPublicRoom/usersRO/views/rentalView.parquet', asIs([]), { freshness: ttl({ maxAgeMs: 86400000 }) }),
    calculate: metricDrift('%$rentalView%', { key: 'sub1', validation: aboveBaseline(0.5) }),
    expectedResult: equals(asIs([{ sub1: 'c1', drift_day: '2026-01-05', baseline: 4.2 }, { sub1: 'c2', drift_day: null, baseline: 3.1 }])),
    vars: setVars(asIs({ db: 'bucket', bucketProvider: 'gcs', hasGcpIdentity: true, onLiveRepo: true,
      roomWUrl: 'room://testPublicRoom' })),
    timeout: 15000,
    logger: 'biLogger'
  })
})


// §8 REDUCER ALGEBRA
// each pick strategy over the SAME price column. ticks 90,100,90 → first/min/max/peak/modal/distinct/all. modal is a STRING (keyed by String(v)).
const pickStrategyEvents = SilverBuilder('pickStrategyEvents', { impl: materializeFromEvents({
  eventSource: 'room://x/${period}/x.json', keyField: 'productId',
  fields: [
    pick('price as first_p', { take: first() }), pick('price as min_p', { take: min() }),
    pick('price as max_p', { take: max() }), pick('price as peak_p', { take: peak() }),
    pick('price as modal_p', { take: mostFrequent() }), pick('price as kinds', { take: distinctCount() }),
    pick('price as all_p', { take: all() })
  ]
}) })
const pickStrategyCube = Cube('pickStrategyCube', { impl: cube({ source: pickStrategyEvents(), metrics: [] }) })

Test('biTest.pickStrategies', {
  impl: dataTest({
    calculate: materializeCubeEvents(pickStrategyCube(), asIs([
      { productId: 'A', price: 90, timestamp: 1 }, { productId: 'A', price: 100, timestamp: 2 }, { productId: 'A', price: 90, timestamp: 3 }
    ])),
    expectedResult: equals(asIs([{ first_p: 90, min_p: 90, max_p: 100, peak_p: 100, modal_p: '90', kinds: 2, all_p: [90, 100, 90] }])),
    logger: 'biLogger'
  })
})

// enrichment chain: lookupByQuery broadcasts a vendorId→vertical Map; enrichFromLookup joins it; firstSucceeding (obj-phase)
// prefers an explicit field, falling back to the looked-up one. s1 → fallback (auto), s2 → explicit (crypto) wins over finance.
const enrichedEvents = SilverBuilder('enrichedEvents', {
  impl: materializeFromEvents('room://x/${period}/x.json', {
    keyField: 'sessionId',
    buildLookups: [
      lookupByQuery('vertById', `select * from (values ('v1','auto'),('v2','finance')) t(id,vertical)`, {
        key: ['id']
      })
    ],
    fields: [
      pick('sessionId, vendorId, explicitVertical'),
      enrichFromLookup('vertical', 'vertById[vendorId]/vertical'),
      firstSucceeding('finalVertical', ['explicitVertical','vertical'])
    ]
  })
})
const enrichedCube = Cube('enrichedCube', { impl: cube({ source: enrichedEvents(), metrics: [] }) })

Test('biTest.enrichFallback', {
  impl: dataTest({
    calculate: materializeCubeEvents(enrichedCube(), asIs([
        {sessionId: 's1', vendorId: 'v1', timestamp: 1},
        {sessionId: 's2', vendorId: 'v2', explicitVertical: 'crypto', timestamp: 1}
    ])),
    expectedResult: equals(asIs([
        {sessionId: 's1', vendorId: 'v1', explicitVertical: null, vertical: 'auto', finalVertical: 'auto'},
        {
          sessionId: 's2',
          vendorId: 'v2',
          explicitVertical: 'crypto',
          vertical: 'finance',
          finalVertical: 'crypto'
        }
    ])),
    timeout: 10000,
    logger: 'biLogger'
  })
})


// §9 NO-BUILD SILVER SOURCES
// parquet: the silver pre-exists — point a cube at the products parquet §1 productBuild wrote, no reduce/build.
const parquetCube = Cube('parquetCube', { impl: cube({
  source: parquetSource('room://testPublicRoom/usersRO/silver/products-${period}.parquet', { name: 'productsRO' }),
  metrics: [metric('avg_price', 'avg(price)')]
}) })

// explicit name avoids colliding with §1's 'products' silver; parquetFiles derived from the wUrl (reuses §1 productBuild's parquet).
Test('biTest.parquetSourceMeta', {
  HeavyTest: true,
  impl: dataTest({
    calculate: cubeToolInfoForQuery(parquetCube(), '%$priceDay%'),
    expectedResult: equals('productsRO', '%cube%'),
    setup: setVars(asIs({ db: 'bucket', bucketProvider: 'gcs', hasGcpIdentity: true, onLiveRepo: true,
      roomWUrl: 'room://testPublicRoom' })),
    timeout: 10000,
    logger: 'biLogger'
  })
})

// query the pre-existing parquet directly (reuses §1 productBuild's silver).
Test('biTest.parquetSourceQuery', {
  HeavyTest: true,
  impl: dataTest(cubeQuery('select avg_price'), equals(150, '%0/avg_price%'), {
    setup: setupCube(parquetCube(), '%$priceDay%'),
    timeout: 10000,
    logger: 'biLogger'
  })
})

const storesCube = Cube('storesCube', {
  impl: cube(parquetSource('signedRoom://testSignedRoom/usersRO/stores.parquet', 'stores'), {
    metrics: [metric('storeCount', 'count(*)')]
  })
})
Test('biTest.parquetSignedRoomFs', {
  impl: dataTest({
    vars: setVar('db', 'fs'),
    calculate: cubeQuery('select storeCount', storesCube()),
    expectedResult: equals(28, '%0/storeCount%'),
    timeout: 10000,
    logger: 'biLogger,dbLogger'
  })
})
Test('biTest.parquetSignedRoomGcs', {
  impl: dataTest({
    vars: setVars(asIs({ db: 'bucket', bucketProvider: 'gcs', hasGcpIdentity: true, onLiveRepo: true })),
    calculate: cubeQuery({ sql: 'select storeCount', cube: storesCube() }),
    expectedResult: equals(28, '%0/storeCount%'),
    timeout: 15000,
    logger: 'biLogger,dbLogger,colsCacheLogger'
  })
})


Test('biTest.sqlScript', {
  impl: dataTest({
    calculate: pipe(
      tempView('raw', '%$priceEvents%'),                                                               // ① seed rows as a relation
      tempView('avgP', cubeQuery('select productId, avg_price from {%$raw%} group by productId', productCube())),  // ② SMART METRIC: avg_price ⇒ avg(price) via productCube
      tempView('maxP', cubeQuery('select productId, max(price) max_price from {%$raw%} group by productId')),   // ③ raw aggregate relation
      setVar('floor', cubeQuery('select median(avg_price) v from {%$avgP%}')),                         // ④ scalar (rows[0].v) threaded below
      cubeQuery(`select a.productId, a.avg_price, m.max_price, m.max_price - a.avg_price spread,
        a.avg_price >= 150 premium, rank() over (order by a.avg_price desc) rnk
        from {%$avgP%} a join {%$maxP%} m using(productId)
        where a.avg_price > {%$floor/0/v%} order by rnk`)                                              // ⑤ LAST = result: join + window + flag, filtered by the scalar
    ),
    expectedResult: and(equals(1, '%length%'), equals('B', '%0/productId%'), equals(190, '%0/avg_price%'),
      equals(10, '%0/spread%'), equals(true, '%0/premium%'), equals(1, '%0/rnk%')),
    timeout: 15000,
    logger: 'biLogger'
  })
})

// doNot escape simple %: a literal SQL string '%$x%' must survive cubeQuery's dynamic-sql interpolation VERBATIM —
// the %...% token interpolator must NOT resolve $x and swallow it into ''. only {%$name%} is a variable slot.
Test('biTest.doNotEscapeSimplePercent', {
  impl: dataTest(cubeQuery("select '%$x%' r"), equals(asIs('%$x%'), '%0/r%'), { timeout: 3000, logger: 'biLogger' })
})
