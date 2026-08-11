import { dsls, ns, coreUtils } from '@jb6/core'
import './import-map-testers.js'

const { 
  test: { Test, 
    test: { dataTest, staticServeConfigTest, calcImportDataTest },
    repo: { Genie }
  }, 
  common: { Data, Action, Boolean,
    data: { pipeline, filter, join, property, obj, delay, asIs,list }, 
    Boolean: { contains, equals },
    Prop: { prop }
  }
} = dsls
const { json } = ns
const geniePath = '/home/shaiby/projects/Genie'

Test('importMapTest.jb6Monorepo', {
  impl: staticServeConfigTest({
    transform: list(
      '%repoRootName%',
      '%staticMappings/diskPath%',
      pipeline('%importMap/imports%', property('@jb6/common'))
    ),
    expectedResult: contains('jb6-monorepo', '/packages', '/jb6_packages/common/index.js', {
      allText: json.stringify()
    })
  })
})

Test('genieTest.staticServeConfigTest', {
  HeavyTest: true,
  impl: staticServeConfigTest({
    repo: Genie(),
    transform: list('%repoRootName%', '%staticMappings/diskPath%', pipeline('%importMap/imports%')),
    expectedResult: contains('genie', `${geniePath}/public/3rd-party/@jb6`, '@wonder', {
      allText: json.stringify()
    })
  })
})

Test('genieTest.importMap', {
  HeavyTest: true,
  impl: calcImportDataTest(`${geniePath}/public/tests/basic-tests.js`, {
    transform: list('%repoRootName%','%staticMappings/diskPath%','%importMap/imports%'),
    expectedResult: contains('genie', `${geniePath}/public/3rd-party/@jb6`, '/jb6_packages/common/index.js', {
      allText: json.stringify()
    })
  })
})

// Test('genieTest.calcTgpModelData', {
//   HeavyTest: true,
//   impl: dataTest({
//     calculate: async () => {
//       const {coreUtils} = await import('@jb6/core')
//       await import('@jb6/lang-service')
//       return coreUtils.calcTgpModelData({
//         entryPointPaths: `${geniePath}/public/llm-flow/reports-dsl.js`, fetchByEnvHttpServer: 'http://localhost:3000'})
//     },
//     expectedResult: contains('/public/3rd-party/@jb6', '/jb6_packages/common/index.js', {
//       allText: json.stringify()
//     }),
//     timeout: 2000
//   })
// })

Test('genieTest.nodejs.calcTgpModelData', {
  HeavyTest: true,
  impl: dataTest({
    calculate: async () => {
      if (!coreUtils.isNode) {
        const script = `
              const {coreUtils} = await import('@jb6/core')
      await import('@jb6/lang-service')
      const result = await coreUtils.calcTgpModelData({ entryPointPaths: '${geniePath}/public/core/db-drivers.js', 
        fetchByEnvHttpServer: 'http://localhost:3000'})
        await coreUtils.writeServiceResult(result)
        `
        const res = await coreUtils.runNodeCliViaJbWebServer(script, {projectDir: geniePath, 
          importMapsInCli: `${geniePath}/public/core/nodejs-importmap.js` })
        return res
      }
    },
    expectedResult: contains({
      text: [`${geniePath}/public/3rd-party/@jb6`,`/jb6_packages/common/index.js`,`bsg-tests`],
      allText: json.stringify()
    }),
    timeout: 10000
  })
})
