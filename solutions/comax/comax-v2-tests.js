import { dsls } from '@jb6/core'
import '@jb6/testing'
import './comax-v2-agent.js'

const {
  tgp: { 'ctx-enricher': { addCategory } },
  common: { data: { categorizedReportViewId, verifiedReportsCatalog }, boolean: { and, contains, equals } },
  test: { Test, test: { dataTest } }
} = dsls

Test('comaxV2.catalog', {
  impl: dataTest({ setup: addCategory('comax'), calculate: verifiedReportsCatalog(),
    expectedResult: and(contains('salesOverview.comax'), contains('promotions.comax')), logger: 'workflowLogger,errorLogger' })
})
Test('comaxV2.chatView', {
  impl: dataTest({ setup: addCategory('comax,nextChatItem'), calculate: categorizedReportViewId('salesOverview'),
    expectedResult: equals('salesOverview.reportView.comax.nextChatItem'), logger: 'workflowLogger,errorLogger' })
})
Test('comaxV2.sidePanelView', {
  impl: dataTest({ setup: addCategory('comax,sidePanel'), calculate: categorizedReportViewId('salesOverview'),
    expectedResult: equals('salesOverview.reportView.comax.sidePanel'), logger: 'workflowLogger,errorLogger' })
})
