import {dsls} from '@jb6/core'
import '@jb6/testing'
import './category-dsl.js'

const {tgp: {'ctx-enricher': {Var}}, common: {data: {asIs, bookletContent}, boolean: {and, contains}},
  'llm-guide': {Doclet, Booklet, booklet: {booklet}}, test: {Test, test: {dataTest}}} = dsls

Doclet('categoryDslTest.doclet', {impl: 'base'})
Doclet('categoryDslTest.doclet.test', {impl: 'categorized'})
Booklet('categoryDslTest.booklet', {impl: booklet('categoryDslTest.doclet')})

Test('categoryDsl.bookletContent', {
  impl: dataTest({
    vars: Var('categories', asIs({test: true})),
    calculate: bookletContent('categoryDslTest.booklet'),
    expectedResult: and(contains('categoryDslTest.doclet.test'), contains('categorized')),
    logger: 'errorLogger'
  })
})
