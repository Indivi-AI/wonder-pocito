import { dsls, ns, coreUtils } from '@jb6/core'
import '@jb6/react/tests/react-testers.js'
import '@jb6/mcp/mcp-jb-tools.js'
import '@wonder/db/oauth2.js'
import '@wonder/studio/mcp-tools/wonder-mcp-tools.js'
import './gmail-test-users.js'
import './room-test-applets.js'

// How to run the test via mcp:
// 1) fast nodejs, default: runTest({testId:'roomAppletTest.summaryApplet', logger:'dbLogger,roomLogger'}).
// 2) in browser via playwrightHarvest({url, automation})
//    http://localhost:3000/room/<room>/applet/summaryApplet?logger=roomLogger,dbLogger is using liveRepo, no need to upload applet
//    https://w-staging.indivi.ai, after working on localhost and loading applet via mcp
//   To save time, look at the logs, do not trust green tests

const {
  tgp: { any: { typeAdapter }, 'ctx-enricher': { Var, testUser } },
  common: { Data, boolean: { and, contains, equals }, data: { asIs, first, join, pipe } },
  mcp: { tool: { roomAppletHarvest, uploadRoomApplet } },
  test: { Test, test: { dataTest, reactTest } },
  react: { 'react-comp': { storeCountApplet }, 'ui-action': { click, waitForText } }
} = dsls
const { json } = ns

Data('mintWonderTestUserAuth2', {
  impl: async ctx => {
    const idToken = (await testUser.$runWithCtx(ctx)).vars.idToken
    return {auth2: {id_token: idToken, access_token: idToken, expiresAt: 9999999999999}}
  }
})

Test('roomAppletTest.cubeQuery.wasm', {
  impl: reactTest(storeCountApplet(), contains('storeCount":28'), {
    userActions: waitForText('storeCount'),
    logger: 'roomLogger,biLogger,colsCacheLogger',
    timeout: 12000
  })
})

Test('roomAppletTest.liveRepo.devAppletRoute', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async ctx => {
      const { serveAppletPage } = await import('../../../cloud-services/express-server/lib/room-lambda-and-applet.js')
      const { setupLiveRepoDevApplet } = await import('../../../cloud-services/express-server/lib/room-lambda-and-applet-live-repo.js')
      const routes = {}
      setupLiveRepoDevApplet({ get: (path, handler) => routes[path] = handler }, { serveAppletPage, imports: {} })
      const serve = name => new Promise(resolve => routes['/applet/:name']({ params: { name } }, {
        code: 200, set() { return this }, status(code) { this.code = code; return this },
        json(body) { resolve({ status: this.code, ...body }) }, send(html) { resolve({ status: this.code, html }) }
      }))
      const derived = await serve('summaryApplet'), missing = await serve('noSuchComp')
      return { result: {
        derivedServes: ['"cmpId":"summaryApplet"', '"urlsToLoad":"@wonder/db/tests/room-test-applets.js"', '"roomWUrl":"room://dev"', '"liveRepo":true']
          .every(part => derived.html?.includes(part)),
        missingStatus: missing.status
      }, ...coreUtils.harvestLogs(ctx) }
    },
    expectedResult: equals('%result%', asIs({derivedServes: true, missingStatus: 404})),
    timeout: 20000,
    logger: 'dbLogger'
  })
})

Test('dbDriverTests.signedRoomAppletUploadAndRun', {
  nodeOnly: true,
  impl: dataTest({
    calculate: pipe(
      typeAdapter('tool<mcp>', roomAppletHarvest({
        url: 'https://w-staging.indivi.ai/signed-room/testSignedRoom/applet/summaryApplet',
        logger: 'roomLogger,dbLogger,authLogger',
        waitForText: '1 categories',
        timeout: 12000,
        seedLocalStorage: 'mintWonderTestUserAuth2'
      })),
      '%content/0/text%',
      json.parse(),
      (ctx, {uploadedApplet}) => ({...ctx.data, appletIdentity: uploadedApplet?.appletV
        === ctx.data.logs?.roomLogger?.roomLog?.find(e => e.t === 'serve applet page')?.appletV})
    ),
    expectedResult: and(
      '%done%',
      '%errors/length% == 0',
      '%appletIdentity%',
      contains('1 categories', { allText: '%html%' }),
      contains('serve applet page', { allText: join(',', { items: '%logs/roomLogger/roomLog/t%' }) }),
      contains('roomLambda invoke', { allText: join(',', { items: '%logs/roomLogger/roomLog/t%' }) }),
      contains('roomLambda done', {
        allText: join(',', { items: '%logs/roomLogger/roomLog/event%' })
      })
    ),
    setup: Var('uploadedApplet', pipe(
      typeAdapter('tool<mcp>', uploadRoomApplet('signedRoom://testSignedRoom', 'react-comp<react>summaryApplet')),
      '%content/0/text%',
      json.parse(),
      first()
    )),
    timeout: 14000,
    logger: 'mcpLogger'
  })
})
