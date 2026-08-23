import {dsls} from '@jb6/core'
import '@jb6/testing'
import '@wonder/ai/verified-report.js'

const {
  tgp: { 
    'ctx-enricher': { Var }
  },
  common: { VerifiedReport2,
    boolean: { and, contains },
    data: { asIs, join, pipe, selectCategoryType }
  },
  test: { Test,
    test: { dataTest }
  }
} = dsls

VerifiedReport2('sectionTest.overviewSection.test', {
  impl: asIs([{value: 1}])
})
VerifiedReport2('sectionTest.excessStockSection', {
  impl: asIs([{value: 2}])
})
VerifiedReport2('sectionTest.excessStockSection.test', {
  impl: asIs([{value: 3}])
})

Test('verifiedReportSections', {
  impl: dataTest({
    vars: Var('categories', asIs({test: true})),
    calculate: pipe(selectCategoryType('sectionTest,section'), join({ itemText: '%id%' })),
    expectedResult: and(contains('sectionTest.excessStockSection.test'), contains('sectionTest.overviewSection.test')),
    logger: 'workflowLogger,errorLogger'
  })
})
