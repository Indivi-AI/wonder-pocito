import { dsls } from '@jb6/core'
import '@jb6/common'
import '@jb6/testing'
import './perf-lab.js'

const {
  common: { boolean: { and, contains, not, equals }, data: { measureReportsAnalyticsPerfCache, reportsAnalyticsPerfPromptParts, warmReportsAnalyticsPerfCache } },
  test: { Test, test: { dataTest } }
} = dsls

Test('perfLab.cacheablePromptParts', {
  impl: dataTest({
    calculate: reportsAnalyticsPerfPromptParts('המלץ על מבצעים בגני תקווה', 'small'),
    expectedResult: and(
      contains('ANALYTICS_QUESTION', { allText: '%prompt%' }),
      not(contains('FLOW DSL', { allText: '%prompt%' })),
      contains('FLOW DSL', { allText: '%instructions%' }),
      contains('REPORT CATALOG', { allText: '%instructions%' }))
  })
})

Test('perfLab.warmCache.live', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: warmReportsAnalyticsPerfCache('openai/gpt-5.4', 'small', 'המלץ על מבצעים בגני תקווה'),
    expectedResult: and(equals(true, '%skipped%'), contains('prompt cache', { allText: '%reason%' })),
    timeout: 30000
  })
})

Test('perfLab.cacheTiming.live', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: measureReportsAnalyticsPerfCache('openai/gpt-5.4', 'small', 'המלץ על מבצעים בגני תקווה'),
    expectedResult: and(
      equals(true, '%prewarm/skipped%'),
      equals(true, ({data}) => data.cold?.duration > 0),
      equals(true, ({data}) => data.warm?.duration > 0)),
    timeout: 90000
  })
})
