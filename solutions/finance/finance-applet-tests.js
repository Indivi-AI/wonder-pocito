import { dsls } from '@jb6/core'
import '@jb6/testing'
import '@jb6/react/tests/react-testers.js'
import './finance-demo.js'

const {
  test: { Test, test: { reactTest }, 'ui-action': { waitForText } },
  common: { boolean: { and, contains } },
  react: { 'react-comp': { FinanceDemo } }
} = dsls

Test('financeApplet.homeReports', {
  impl: reactTest({
    testedComp: (ctx, { react: { hh } }) => () => hh(ctx, FinanceDemo),
    userActions: waitForText('AI insights'),
    expectedResult: and(contains('Money in'), and(contains('AI insights'), contains('Top payers'))),
    timeout: 20000,
    logger: 'uiLogger,colsCacheLogger'
  })
})
