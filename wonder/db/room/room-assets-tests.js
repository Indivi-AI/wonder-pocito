import { dsls } from '@jb6/core'
import '@jb6/testing'
import '@jb6/react'
import '@jb6/react/progress-indicators.js'   // stepper progress-indicator for the approvals applet
import '@jb6/react/tests/react-testers.js'
import '@wonder/asset/asset-dsl.js'           // asset model (the needsApproval/approved tags myApprovals filters on)
import './room-tests.js'                       // the lambda backbone: invokeSnippetInContext, roomLambda, Lambda, roomLogger
import '@wonder/db/etl/file-query.js'      // fileQuery, cachedWonderUrl, duckdb

const {
  tgp: { 'ctx-enricher': { setVars, setData } },   // setVars for the dataTest setup, setData for the applet enrichCtx
  common: { Lambda, boolean: { equals, notEmpty, contains }, data: { asIs, count, invokeSnippetInContext, fileQuery } },
  lambda: { 'lambda-packaging': { roomLambda } },
  etl: { 'cli-extract': { cachedWonderUrl }, 'cli-transform': { duckdb } },
  test: { Test, test: { dataTest, reactTest }, 'ui-action': { waitForText } },
  react: { ReactComp, 'react-comp': { comp }, 'progress-indicator': { stepper } }
} = dsls

// ============================================================================
// ROOM ASSETS — the runs-as-user lambda use-case, told through assets.json.
// This builds on the lambda mechanics in room-tests.js; here the point is the ASSET domain: a lambda that reads
// assets.json and filters to the rows the CALLER must approve. %$userEmail% is NOT in setVars — the server overlays
// the trusted identity into packedCtx at run time (the runs-as-user crux), so the same code returns each caller's own list.
// ============================================================================
const myApprovals = Lambda('myApprovals', {
  permissionByPath: 'usersRO',
  impl: fileQuery(cachedWonderUrl('{%$roomUrl%}/assets.json'), {
    query: duckdb({
      sql: `SELECT variantId, assetType FROM read_json_auto('{%$inputFile%}')
                WHERE approver = '{%$userEmail%}' AND list_contains(tags, 'needsApproval') AND NOT list_contains(tags, 'approved')`,
      format: 'JSON, ARRAY'
    })
  })
})

// RUNS-AS-USER: the lambda runs AS THE CALLER. %$userEmail% is absent from packedCtx (the client cannot forge identity) —
// the server overlays the trusted who.email before running, so myApprovals returns shaiby's own pending approvals.
Test('roomAssetsTest.runsAsUser', {
  HeavyTest: true,
  impl: dataTest({
    setup: setVars(asIs({ lambdaHost: 'http://localhost:3000', roomUrl: 'room://testPublicRoom' })),
    calculate: invokeSnippetInContext(myApprovals()),
    expectedResult: equals(2, count()),   // redBike.draft + blueCar.v2 (greenBoat is 'approved')
    timeout: 12000,
    logger: 'dbLogger,roomLogger,etlLogger'
  })
})

// APPLET: the browser twin — myApprovals invoked from a react-comp's enrichCtx, streaming progress to the stepper.
const approvalsApplet = ReactComp('approvalsApplet', {
  impl: comp({
    enrichCtx: setData(invokeSnippetInContext(myApprovals(), { pack: roomLambda({ streamProgress: true }) })),
    progressIndicator: stepper({ title: 'Loading approvals', steps: 'load,process', labels: 'Loading assets,Finding my tasks' }),
    hFunc: (ctx, { react: { h } }) => () => {
      const tasks = Array.isArray(ctx.data) ? ctx.data : []
      return h('div:p-4 font-sans', {},
        h('h1:text-lg font-bold', {}, 'Awaiting your approval'),
        tasks.length ? h('ul', {}, ...tasks.map(t => h('li', {}, `${t.variantId} (${t.assetType})`)))
          : h('p:text-gray-500', {}, 'Nothing to approve.'))
    }
  })
})

// reactTest: approvalsApplet renders assets awaiting the caller's approval (runs-as-user via the gate).
Test('roomAssetsTest.approvalsApplet', {
  HeavyTest: true,
  impl: reactTest({
    testedComp: (ctx, { react: { hh } }) => () => hh(ctx.setVars({ roomUrl: 'room://testPublicRoom', userEmail: 'shaiby@artwaresoft.com', onLiveRepo: true }), approvalsApplet),
    expectedResult: contains('redBike.draft'),   // a seeded asset awaiting my approval (in the resolved body, not the progress title)
    userActions: waitForText('redBike'),
    timeout: 12000,
    logger: 'dbLogger,roomLogger,uiLogger'
  })
})
