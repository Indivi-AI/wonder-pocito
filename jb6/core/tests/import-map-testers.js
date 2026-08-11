import { dsls, ns, coreUtils } from '@jb6/core'
import '@jb6/testing'
import '@jb6/common'
import '@jb6/core/misc/import-map-services.js'
const { asArray, calcRepoRoot, getStaticServeConfig, calcImportData } = coreUtils

const { 
  tgp: { TgpType, 'ctx-enricher': { Var } },
  test: { Test, 
    test: { dataTest }
  }, 
  common: { Data, 
    data: { pipe }
  }
} = dsls

const Repo = TgpType('repo','test')

const Jb6 = Repo('Jb6', {
  impl: ({}, {}) => calcRepoRoot()
})

const Genie = Repo('Genie', {
  impl: ({}, {}) => '/home/shaiby/projects/Genie'
})

Test('staticServeConfigTest', {
  params: [
    {id: 'repo', type: 'repo', defaultValue: Jb6(), byName: true},
    {id: 'transform', type: 'data', dynamic: true, defaultValue: '%%'},
    {id: 'expectedResult', type: 'boolean', dynamic: true}
  ],
  impl: dataTest(pipe('%$repo%', ({data}) => getStaticServeConfig(data), '%$transform()%'), '%$expectedResult()%', {
    includeTestRes: true
  })
})

Test('calcImportDataTest', {
  params: [
    {id: 'entryPointPaths', as: 'array'},
    {id: 'forDsls', as: 'string'},
    {id: 'transform', type: 'data', dynamic: true, defaultValue: '%%'},
    {id: 'expectedResult', type: 'boolean', dynamic: true}
  ],
  impl: dataTest({
    calculate: pipe(
      ({},{},{entryPointPaths,forDsls}) => calcImportData({entryPointPaths, forDsls }),
      '%$transform()%'
    ),
    expectedResult: '%$expectedResult()%',
    includeTestRes: true
  })
})

