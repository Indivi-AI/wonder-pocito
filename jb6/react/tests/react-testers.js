// REAL browser with REAL modules (no stubs), use the mcp tool `playwrightHarvest`
import { dsls, coreUtils } from '@jb6/core'
import { reactUtils } from '@jb6/react'
import '../automation.js'
import '../react-probe.js'
import '@jb6/testing'


const {test: {Test, test: {dataTest}}, common: {Data}} = dsls

Test('reactTest', {
    params: [
      {id: 'testedComp', type: 'react-comp<react>', dynamic: true },
      {id: 'expectedResult', type: 'boolean', dynamic: true},
      {id: 'props', as: 'object' },
      {id: 'userActions', type: 'ui-action<react>'},
      {id: 'logger', as: 'string'},
      {id: 'setup', type: 'ctx-enricher<tgp>', dynamic: true},
      {id: 'timeout', as: 'number', defaultValue: 2000},
      {id: 'locationHref', as: 'string'},
    ],
    impl: dataTest({
        logger: '%$logger%',
        setup: '%$setup()%',
        timeout: '%$timeout%',
        calculate: async (ctx,{singleTest,uiLogger,uiHtmlLogger},{testedComp,userActions,props,locationHref}) => {
          const win = globalThis.window
          if (!win)
            return {error: 'reactTest: no global window' }

          win.testing = true
          reactUtils.installMutationObserver(win)
          const testSimulation = win.document.createElement('div')
          testSimulation.id = 'test-simulation'
          if (singleTest || userActions)
              win.document.body.appendChild(testSimulation)
          const seedCtx = reactUtils.extendCtxWithUrl({ctx: ctx.setVars({react: reactUtils}), href: locationHref})
          let hFuncRes
          try {
            hFuncRes = testedComp(seedCtx)
          } catch (error) {
            return { error: error.stack}
          }

          uiLogger?.info?.({t: 'render', comp: 'reactTest'}, {}, {ctx})
          reactUtils.createRoot(testSimulation).render(reactUtils.createElement(hFuncRes, props))
          await win.waitForMutations(10)
          const ctxA = seedCtx.setVars({ win })
          await userActions?.exec(ctxA)
          if (userActions) await win.waitForMutations(50)
          uiLogger?.info?.({t: 'user actions done', active: !!userActions}, {}, {ctx})
          const html = reactUtils.prettyPrintNode(testSimulation)
          if (!singleTest)
            testSimulation.remove()
          uiLogger?.info?.({t: 'html', len: html.length, summary: html.replace(/\s+/g, ' ').slice(0, 200)}, {}, {ctx})
          uiHtmlLogger?.info?.({t: 'html', html}, {}, {ctx})
          return { toString: () => html }
        },
        expectedResult: '%$expectedResult()%',
        includeTestRes: true
    })
})

// a mock localStorage auth seed for playwrightHarvest(seedLocalStorage) - stands in for a real auth-token minter
// (e.g. Wonder's mintWonderAuth2). NOTE: seeds localStorage, not cookies - Wonder's auth2 also lives in
// localStorage (localStorage.getItem('auth2')). its result object is written to localStorage before the page
// boots so the comp renders "as a logged-in user"; object values are JSON.stringified into localStorage by the tool.
Data('mockAuthSeed', {
  impl: () => ({ auth2: { id_token: 'mock-id-token', expiresAt: 9999999999999 }, user: { name: 'Homer' } })
})
