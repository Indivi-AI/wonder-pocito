import { dsls } from '@jb6/core'
import '@jb6/testing'
import '@jb6/react'
import '@jb6/react/progress-indicators.js'
import '@jb6/react/tests/react-testers.js'
import '@wonder/db/oauth2.js'
import './room-tests.js'
import '@wonder/db/db-drivers.js'
import '@wonder/db/etl/file-query.js'
import '@wonder/db/tests/gmail-test-users.js'

// How to run the test via mcp:
// 1) fast nodejs, default: runTest({testId:'roomAppletTest.summaryApplet', logger:'dbLogger,roomLogger'}).
// 2) in browser via playwrightHarvest({url, automation})
//    http://localhost:3000/room/<room>/applet/summaryApplet?logger=roomLogger,dbLogger is using liveRepo, no need to upload applet
//    https://w-staging.indivi.ai, after working on localhost and loading applet via mcp
//   To save time, look at the logs, do not trust green tests

const {
  tgp: { Component, 'ctx-enricher': { setData, testUser } },
  common: { Data, boolean: { contains }, data: { invokeSnippetInContext, salesByCategory, fileQuery } },
  lambda: { 'lambda-packaging': { roomLambda } },
  test: { Test, test: { reactTest } },
  react: { ReactComp, 'react-comp': { comp }, 'progress-indicator': { stepper, dots }, 'ui-action': { waitForText } },
  etl: { 'cli-extract': { cachedWonderUrl }, 'cli-transform': { duckdb } }
} = dsls

const summaryApplet = ReactComp('summaryApplet', {
  impl: comp({
    enrichCtx: setData(invokeSnippetInContext(salesByCategory(), { pack: roomLambda({ streamProgress: true }) })),
    progressIndicator: stepper({ title: 'Summarizing', steps: 'load,process', labels: 'Loading file,Aggregating' }),
    hFunc: (ctx, { react: { h } }) => () => {
      const rows = Array.isArray(ctx.data) ? ctx.data : []
      return h('div:p-4 font-sans', {},
        h('h1:text-lg font-bold', {}, 'Room Summary'),
        h('p', {}, `${rows.length} categories`),
        h('ul', {}, ...rows.map(r => h('li', {}, `${r.category}: ${r.total}`))))
    }
  })
})

const dailySales = Data('dailySales', {
  permissionByPath: 'usersRO',
  params: [{ id: 'date', as: 'string' }],
  impl: fileQuery({
    from: cachedWonderUrl('room://aTeam/usersRO/sales-large.json'),
    query: duckdb(`SELECT category, sum(amount) AS total FROM read_json_auto({%$inputFile%})
      WHERE day = '{%$date%}' GROUP BY category ORDER BY total DESC`, { format: 'JSON, ARRAY' })
  })
})

const dailySalesReport = ReactComp('dailySalesReport', {
  params: [{ id: 'date', as: 'string' }],
  impl: comp({
    enrichCtx: setData(invokeSnippetInContext(dailySales('%$date%'), { pack: roomLambda({ streamProgress: true }) })),   // streamProgress ⇒ live dots
    progressIndicator: dots({ title: 'loading %$date% data' }),
    hFunc: (ctx, { react: { h } }) => () => h('pre', {}, JSON.stringify(ctx.data))
  })
})

ReactComp('salesPage', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh } }) => () => h('div', {}, hh(ctx, dailySalesReport('2026-06-01')))
  })
})

// server: cloud-services/express-server/lib/room-lambda-and-applet.js
const summaryAppletTest = Component('summaryAppletTest', {
  type: 'test<test>',
  params: [{ id: 'roomWUrl', as: 'string', mandatory: true }, { id: 'onLiveRepo', as: 'boolean', defaultValue: true }, { id: 'lambdaHost', as: 'string' }],
  impl: reactTest({
  testedComp: (c, { react: { hh } }, { roomWUrl, onLiveRepo, lambdaHost }) => () => hh(c.setVars({ roomWUrl, onLiveRepo, ...(lambdaHost && { lambdaHost }) }), summaryApplet),
    expectedResult: contains('Room Summary'),
    userActions: waitForText('categories'),
    timeout: 12000,
    logger: 'dbLogger,roomLogger'
  })
})

Test('roomAppletTest.summaryApplet', { impl: summaryAppletTest('room://testPublicRoom') })
Test('roomAppletTest.signedSummaryApplet', {
  impl: summaryAppletTest({ vars: [testUser()], roomWUrl: 'signedRoom://testSignedRoom' })
})
Test('roomAppletTest.signedSummaryApplet.cloud', {
  impl: summaryAppletTest({
    vars: [testUser()],
    roomWUrl: 'signedRoom://testSignedRoom',
    onLiveRepo: false,
    lambdaHost: 'https://w-staging.indivi.ai'
  })
})
