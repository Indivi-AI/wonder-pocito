import { dsls } from '@jb6/core'
import '@jb6/react/tests/react-testers.js'
import '@jb6/mcp/mcp-jb-tools.js'
import '@wonder/db/oauth2.js'
import './room-test-applets.js'

// How to run the test via mcp:
// 1) fast nodejs, default: runTest({testId:'roomAppletTest.summaryApplet', logger:'dbLogger,roomLogger'}).
// 2) in browser via playwrightHarvest({url, automation})
//    http://localhost:3000/room/<room>/applet/summaryApplet?logger=roomLogger,dbLogger is using liveRepo, no need to upload applet
//    https://w-staging.indivi.ai, after working on localhost and loading applet via mcp
//   To save time, look at the logs, do not trust green tests

const {
  common: { boolean: { and, contains, equals }, data: { join, playwrightHarvest } },
  test: { Test, test: { dataTest, reactTest } },
  react: { 'react-comp': { storeCountApplet }, 'ui-action': { click, waitForText } }
} = dsls
Test('roomAppletTest.cubeQuery.wasm', {
  impl: reactTest(storeCountApplet(), contains('storeCount":28'), {
    userActions: waitForText('storeCount'),
    logger: 'roomLogger,biLogger,colsCacheLogger',
    timeout: 12000
  })
})

Test('roomAppletTest.signedSummaryApplet.cloud', {
  nodeOnly: true,
  impl: dataTest({
    calculate: playwrightHarvest({
      url: 'https://w-staging.indivi.ai/signed-room/testSignedRoom/applet/summaryApplet?logger=roomLogger,dbLogger',
      automation: waitForText('categories'),
      timeout: 10000,
      domSelector: '#root',
      seedLocalStorage: 'mintWonderAuth2'
    }),
    expectedResult: and(
      equals(true, '%done%'),
      equals(0, '%errors/length%'),
      contains('1 categories', { allText: '%html%' }),
      contains('serve applet page', { allText: join(',', { items: '%logs/roomLogger/roomLog/t%' }) }),
      contains('roomLambda invoke', { allText: join(',', { items: '%logs/roomLogger/roomLog/t%' }) }),
      contains('roomLambda done', {
        allText: join(',', { items: '%logs/roomLogger/roomLog/event%' })
      })
    ),
    timeout: 12000
  })
})
