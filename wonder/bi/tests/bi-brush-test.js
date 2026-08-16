import { dsls } from '@jb6/core'
import '@jb6/react/tests/react-testers.js'
import './product-cube-ui.js'   // productDrill + productBrush + the generic brush views (via bi-brush-utils.js)

const {
  tgp: { CtxEnricher, 'ctx-enricher': { productDrill, enrichCtx, setVars, setData, setupCube } },
  common: {
    data: { asIs, squeezeAndHighlight, pipe, filter, firstSucceeding, join, spanCell, cubeQuery, resolveKeySpan, spanView, invokeSnippetInContext },
    boolean: { and, contains, gt, equals }
  },
  bi: { 'code-locator': { sqlLocator }, cube: { productCube, cube }, 'silver-builder': { parquetSource }, metric: { metric } },
  react: { ReactComp, 'react-comp': { comp, productBrush, brushResultFirst, brushPanes, brushInline },
    'ui-action': { actions, click, waitForText } },
  test: { Test, test: { reactTest, dataTest } }
} = dsls

// ── Brush infra · liveSetup + brushTest template ──
// liveSetup — the test-side enricher that plants the LIVE vars on the comp ctx so its enrichCtx (the drill) ships to node.
// NO setupCube: productDrill rebuilds the cube node-side from productCube() in productSpanCell, reading queryPeriod.
const liveSetup = CtxEnricher('liveSetup', {
  impl: enrichCtx(setVars(asIs({ db: 'bucket', bucketProvider: 'gcs', hasGcpIdentity: true, onLiveRepo: true,
    roomWUrl: 'room://testPublicRoom', queryPeriod: '2026-01-01' })))
})

// test template: shared live setup + timeout/loggers; each test supplies only the comp + assertions.
const brushTest = Test('brushTest', {
  params: [
    {id: 'testedComp', type: 'react-comp<react>', dynamic: true},
    {id: 'expectedResult', type: 'boolean', dynamic: true},
    {id: 'userActions', type: 'ui-action<react>[]'},
    {id: 'setup', type: 'ctx-enricher<tgp>', dynamic: true, defaultValue: liveSetup()}
  ],
  impl: reactTest({
    testedComp: '%$testedComp()%',
    setup: '%$setup()%',
    expectedResult: '%$expectedResult()%',
    userActions: '%$userActions%',
    timeout: 12000,
    logger: 'uiLogger,biLogger,lambdaLogger'
  })
})

// ── Span drill · gold + key (data, no UI) ──
// DRILL enricher (node-only closure → no React): set the live vars, then ship spanCell to node → ctx.data. node runs
// locally; the browser ships THIS profile over the live repo (localhost) or lambda (remote). spanCell lives in bi-brush-utils.
const spanDrillA = CtxEnricher('spanDrillA', {
  impl: enrichCtx(
    setVars(asIs({ db: 'bucket', bucketProvider: 'gcs', hasGcpIdentity: true, onLiveRepo: true,
      roomWUrl: 'room://testPublicRoom', queryPeriod: '2026-01-01' })),
    setData(invokeSnippetInContext(spanCell({
      gold: spanView(cubeQuery({ sql: 'select avg_price', cube: productCube() })),
      silverOf: spanView(resolveKeySpan(productCube(), '%$key%')),
      metric: 'avg_price'
    })))
  )
})

Test('biTest.brush.span.gold', {
  impl: dataTest({
    calculate: spanView(cubeQuery('select avg_price')),
    expectedResult: and(equals('%0/avg_price%', 150), equals('%0/cells/avg_price/n%', 2)),
    setup: setupCube(productCube(), '%$priceDay%'),
    timeout: 10000,
    logger: 'biLogger'
  })
})

Test('biTest.brush.span.key', {
  impl: dataTest({
    calculate: spanView(resolveKeySpan(productCube(), 'A')),
    expectedResult: and(equals('%key%', 'A'), equals('%fields/price/value%', 100), equals('%fields/price/winner/price%', 100), equals('%fields/price/pickedIdx%', 1)),
    setup: setupCube(productCube(), '%$priceDay%'),
    timeout: 12000,
    logger: 'biLogger,dbLogger,roomLogger'
  })
})

// ── Span viewer · result-only drill UI ──
// spanViewer — the result-only drill (R): keys + their silver fields, winner highlighted. node-only drill via spanDrillA().
const spanViewer = ReactComp('spanViewer', {
  impl: comp({
    enrichCtx: spanDrillA(),   // node-only drill closure (defined in bi-tests.js) → no React in the lambda
    hFunc: (ctx, { react: { h, useState } }) => () => {
      const { func, value, keys = [], silverByKey = {} } = ctx.data || {}
      const [sel, setSel] = useState(null), [showAll, setShowAll] = useState(false)
      const shown = showAll ? keys : keys.slice(0, 5), more = keys.length - shown.length

      const eventsRow = (silver, field) => {
        const f = silver.fields[field]
        return h('div:pl-4 mt-1 space-y-0.5', {},
          ...f.events.map((e, i) => h(`div:text-xs font-mono ${i === f.pickedIdx ? 'text-green-700 font-bold' : 'text-gray-400'}`, {},
            (i === f.pickedIdx ? '▶ ' : '  ') + JSON.stringify(e) + (i === f.pickedIdx ? '  ← winner' : ''))))
      }
      const keyRow = k => {
        const silver = silverByKey[k], open = sel === k
        return h('div:border-b border-gray-100', { key: k },
          h('div:flex justify-between items-center py-1 cursor-pointer hover:bg-gray-50', { onClick: () => setSel(open ? null : k) },
            h('span:font-mono text-sm text-gray-700', {}, (open ? '▾ ' : '▸ ') + k),
            silver && h('span:text-xs text-gray-400', {}, Object.entries(silver.fields).map(([f, d]) => `${f}=${d.value}`).join(' '))),
          open && silver && h('div:pb-2', {}, ...Object.keys(silver.fields).map(field =>
            h('div', { key: field }, h('div:text-xs text-gray-500 pl-2', {}, field + ' events:'), eventsRow(silver, field)))))
      }

      return h('div:max-w-md mx-auto p-4 bg-white rounded-lg shadow border', {},
        h('div:text-xs text-gray-400 mb-2', {}, `${keys.length} contributing keys`),
        ...shown.map(keyRow),
        more > 0 && h('div:text-xs text-blue-500 cursor-pointer py-1', { onClick: () => setShowAll(true) }, `.. ${more} more items`),
        h('div:border-t-2 border-gray-800 mt-2 pt-2 flex justify-between', {},
          h('span:text-lg font-bold text-gray-900', {}, value),
          h('span:text-sm text-gray-500 self-end', {}, func)))
    }
  })
})

// span cell: dashboard 150 + 2 contributing keys (drill result only, no code panes).
Test('biTest.brush.spanUi.cell', {
  impl: brushTest(spanViewer(),
    and(contains('150'), contains('avg'), contains('contributing keys')),
    waitForText('150'))
})

// click key 'A' → expands its silver: price=100, both bronze events listed, events[1] highlighted as winner.
Test('biTest.brush.spanUi.key', {
  impl: brushTest(spanViewer(),
    and(contains('winner'), contains('100')),
    actions(waitForText('150'), click('A'), waitForText('winner')))
})

// ── Brush views · result-first / panes / inline ──
// view B (result-first): dashboard 150 + G metric node + S pick macro; drill key B → its winner event 200.
// NOTE: assert on the alias 'avg_price' (intact) not 'avg(price)' — the squeeze wraps the link token 'price' in a <span>,
// so the literal substring 'avg(price)' is split in the rendered html (avg(<span>price</span>)).
Test('biTest.brush.viewResultFirst', {
  impl: brushTest(brushResultFirst({ drill: productDrill() }),
    and(contains('150'), contains('gold · metric'), contains('avg_price'), contains('silver · pick')),
    actions(waitForText('150'), click('B'), waitForText('200')))
})

// view A (three panes): G | S | R coequal; drill key A → winner 100.
Test('biTest.brush.viewPanes', {
  impl: brushTest(brushPanes({ drill: productDrill() }),
    and(contains('gold · metric'), contains('silver · pick'), contains('winner')),
    actions(waitForText('150'), click('A'), waitForText('winner')))
})

// view C (inline): G/S fold into the dashboard as chips; drill key A → winner.
Test('biTest.brush.viewInline', {
  impl: brushTest(brushInline({ drill: productDrill() }),
    and(contains('price'), contains('150'), contains('last()')),
    actions(waitForText('150'), click('A'), waitForText('winner')))
})

// ── Brush histogram · key → winner → bars → raw ──
// click key A → its winner event row (⊞) → histogram of price across A's events (90, 100) appears.
Test('biTest.brush.histogram', {
  impl: brushTest(brushResultFirst({ drill: productDrill() }),
    and(contains('90'), contains('100')),
    actions(waitForText('150'), click('A'), waitForText('winner'), click('winner'), waitForText('90')))
})

// drill a histogram bar → the raw event(s) at that value expand inline. click bar '90' → {"productId":"A","price":90}.
Test('biTest.brush.histogramBar', {
  impl: brushTest(brushResultFirst({ drill: productDrill() }),
    contains('"productId":"A","price":90'),
    actions(waitForText('150'), click('A'), waitForText('winner'), click('winner'), waitForText('90'), click('90'), waitForText('"price":90')))
})

// click the highlighted 'price' token (the bg-yellow-200 span) in the code box → all-events histogram (90,100,180,200).
Test('biTest.brush.codeTokenHistogram', {
  impl: brushTest(brushResultFirst({ drill: productDrill() }),
    and(contains('90'), contains('180'), contains('200')),
    actions(waitForText('avg_price'), click('bg-yellow-200'), waitForText('180')))
})

// ── Combined brush · one drill, 3 views ──
// COMBINED brush: owns the drill, the 3 views share its ctx.data; tab to A, then drill a key → winner.
Test('biTest.brush.combined', {
  impl: brushTest(productBrush(),
    and(contains('code ↔ data brush'), contains('150'), contains('avg_price'), contains('winner')),
    actions(waitForText('150'), click('A · Three panes'), waitForText('avg_price'), click('▸ A'), waitForText('winner')))
})

// productBrush end-to-end: drill key A → winner → histogram → bar '90' → the raw event expands inline.
Test('biTest.brush.combinedHistogram', {
  impl: brushTest(productBrush(),
    contains('"productId":"A","price":90'),
    actions(waitForText('150'), click('▸ A'), waitForText('winner'), click('winner'), waitForText('90'), click('90'), waitForText('"price":90')))
})

// ── Squeeze algo · fold + highlight (no UI) ──
// squeeze ALGO (no UI): the G metric node squeezes productCube to the on-path line `metric('avg_price', 'avg(price)')` with the
// rest folded, and highlights 'price' at its DuckDB query_location INSIDE avg(price) (NOT the price in the avg_price alias).
Test('biTest.brush.squeezeGold', {
  impl: dataTest(
    pipe(squeezeAndHighlight(sqlLocator('cube<bi>productCube~impl~metrics~0'), 'price'),
      '%sections%', firstSucceeding('%line%', '-- %fold% lines --'), join('\n')),
    and(contains('Cube('), contains('metrics:'), contains("metric('avg_price', 'avg(price)')"), contains('-- 2 lines --')),
    { logger: 'biLogger' })
})

// the highlight column on that on-path line must land on 'price' INSIDE avg(price), not the alias — assert the slice at the col.
Test('biTest.brush.squeezeHighlight', {
  impl: dataTest(
    pipe(squeezeAndHighlight(sqlLocator('cube<bi>productCube~impl~metrics~0'), 'price'),
      '%sections%', filter('%onPath%'), firstSucceeding('%highlights/0%')),
    gt('%%/0%', 0),
    { logger: 'biLogger' })
})

Test('biTest.parquetSourceSpanDrillable', {
  HeavyTest: true,
  impl: dataTest(spanView(cubeQuery('select avg_price, max_price')), and(equals(asIs(['A', 'B']), '%0/cells/avg_price/keys%'), equals(200, '%0/max_price%')), {
    setup: setupCube(cube({
      source: parquetSource('room://testPublicRoom/usersRO/silver/products-${period}.parquet', { name: 'productsDrill', keyField: 'productId' }),
      metrics: [metric('avg_price', 'avg(price)'), metric('max_price', 'max(price)')]
    }), '%$priceDay%'),
    timeout: 10000,
    logger: 'biLogger'
  })
})

// span OFF: a parquet source with no keyField → the gold popup's cells map is empty (nothing to drill into), no list() binder error.
Test('biTest.viewSourceSpanNoDrill', {
  HeavyTest: true,
  impl: dataTest(spanView(cubeQuery('select avg_price')), equals(asIs({}), '%0/cells%'), {
    setup: setupCube(cube({
      source: parquetSource('room://testPublicRoom/usersRO/silver/products-${period}.parquet', { name: 'productsNoDrill' }),
      metrics: [metric('avg_price', 'avg(price)')]
    }), '%$priceDay%'),
    timeout: 10000,
    logger: 'biLogger'
  })
})
