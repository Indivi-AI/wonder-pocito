// product-cube-ui.js — the CONCRETE productCube wiring for the generic code↔data brush (bi-brush-utils.js).
// it binds productCube/avg_price/'price' into: a node drill payload (productSpanCell), a drill enricher (productDrill =
// live vars + valueSource), and a ready-to-mount brush (productBrush). nothing generic lives here; nothing concrete leaks back.
import { dsls } from '@jb6/core'
import '../bi-brush-utils.js'                              // brushSpanCell + squeezeAndHighlight + the generic brush views
import '@wonder/bi/tests/bi-tests.js'       // spanCell + productCube

const {
  tgp: { CtxEnricher, 'ctx-enricher': { enrichCtx, setVars, setVar } },
  common: { BrushData, data: { asIs, brushSpanCell, squeezeAndHighlight, spanCell, spanView, cubeQuery, resolveKeySpan, invokeSnippetInContext } },
  'bi': { cube: { productCube }, 'code-locator': { sqlLocator, cubeLocator } },
  react: { ReactComp, 'react-comp': { brushViews } }
} = dsls

// productSpanCell — the CONCRETE brushSpanCell for productCube/avg_price: the brush's node payload. G = the metric SQL node
// (kind sql → duckdb-located 'price'); S = the cube pick node (kind cube → the 'price' field in the csv); both squeeze productCube.
const productSpanCell = BrushData('productSpanCell', {
  impl: brushSpanCell({
    cell: spanCell({
      gold: spanView(cubeQuery({ sql: 'select avg_price', cube: productCube() })),
      silverOf: spanView(resolveKeySpan(productCube(), '%$key%')),
      metric: 'avg_price', metricField: 'price' }),
    gSource: squeezeAndHighlight({ locator: sqlLocator('cube<bi>productCube~impl~metrics~0'), token: 'price' }),
    sSource: squeezeAndHighlight({ locator: cubeLocator('silver-builder<bi>productEvents~impl~fields~0'), token: 'price' })
  })
})

// productDrill — the brush's `drill` for productCube: set the LIVE vars + period, then ship productSpanCell to node → valueSource.
// NO setupCube — it would plant the live cube OBJECT (loadLookups) into ctx vars, which the node drill can't revive; the drill
// rebuilds the cube node-side from productCube() in productSpanCell's sub-profiles, reading queryPeriod for the silver paths.
const productDrill = CtxEnricher('productDrill', {
  impl: enrichCtx(
    setVars(asIs({ db: 'gcs', hasGcpIdentity: true, onLiveRepo: true, roomUrl: 'room://testPublicRoom', queryPeriod: '2026-01-01' })),
    setVar('valueSource', invokeSnippetInContext(productSpanCell()))
  )
})

// productBrush — the brushViews explorer bound to productDrill: drills once, the hosted views inherit its valueSource.
const productBrush = ReactComp('productBrush', { impl: brushViews({ drill: productDrill() }) })
