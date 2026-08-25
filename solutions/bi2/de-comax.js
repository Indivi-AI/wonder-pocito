import { dsls } from '@jb6/core'
import '../comax2/comax-etl.js'
import './ba-comax.js'
import './de-dsl.js'

const {
  ba: { 'semantic-cube': { comax2Sales } },
  de: {
    PhysicalTopology, SqlModifier,
    cube: { cube }, 'silver-builder': { parquetSource },
    'physical-topology': { bucketDuckDbWithProjections },
    'silver-projection': { projection }, 'silver-file': { parquetFile },
    'query-lookup': { lookupByWUrl }, 'cache-strategy': { colsCache }
  },
  etl: { etl: { monthQuarterYear } }
} = dsls

const comaxStarJoin = SqlModifier('comaxStarJoin', {
  description: 'builds the requested Comax star joins'
})
const comaxStarFilter = SqlModifier('comaxStarFilter', {
  description: 'applies Comax query filters to the star base'
})

PhysicalTopology('comax2', {
  impl: bucketDuckDbWithProjections({
    cubes: [
      cube(comax2Sales(), parquetSource('KupaDoc_Lines-mqy.parquet', 'salesLines', { keyField: 'C' }), {
        queryLookups: [
          lookupByWUrl('KupaDoc_Header-mqy.parquet', 'salesHeaders'),
          lookupByWUrl('Store.parquet', 'stores', { ensureCols: ['C'] }),
          lookupByWUrl('Prt.parquet', 'products', { ensureCols: ['C'] }),
          lookupByWUrl('Departments.parquet', 'departments'),
          lookupByWUrl('DepartmentsTop.parquet', 'departmentTops'),
          lookupByWUrl('PrtGroups.parquet', 'productGroups'),
          lookupByWUrl('PrtGroupTt.parquet', 'productSubgroups'),
          lookupByWUrl('Suppliers.parquet', 'suppliers'),
          lookupByWUrl('Idx.parquet', 'entities'),
          lookupByWUrl('Idx_Grp.parquet', 'entityGroups'),
          lookupByWUrl('Mivza.parquet', 'promotions'),
          lookupByWUrl('Mivza_Svg.parquet', 'promotionClasses'),
          lookupByWUrl('PrtDegem.parquet', 'models'),
          lookupByWUrl('DailyPriceCost.parquet', 'salesCosts'),
          lookupByWUrl('DailyPriceCost_Zakyan.parquet', 'franchiseCosts'),
          lookupByWUrl('Prt_ItrotStore_Yomi.parquet', 'inventory')
        ],
        sqlModifiers: [comaxStarJoin(), comaxStarFilter()]
      })
    ],
    etls: [
      monthQuarterYear('lines'),
      monthQuarterYear('header')
    ],
    silverProjections: [
      projection('sales', {
        mainCubeFile: parquetFile('salesLines', 'KupaDoc_Lines-mqy.parquet', {
          source: 'KupaDoc_Lines.parquet + KupaDoc_Header.parquet',
          orderBy: 'DateDoc,C',
          rowGroupLayout: 'latest month, four calendar quarters, then calendar years'
        }),
        lookupFiles: [
          parquetFile('salesHeaders', 'KupaDoc_Header-mqy.parquet', {
            source: 'KupaDoc_Header.parquet',
            orderBy: 'DateDoc,C',
            rowGroupLayout: 'latest month, four calendar quarters, then calendar years'
          }),
          parquetFile('stores', 'Store.parquet'),
          parquetFile('products', 'Prt.parquet'),
          parquetFile('departments', 'Departments.parquet'),
          parquetFile('departmentTops', 'DepartmentsTop.parquet'),
          parquetFile('productGroups', 'PrtGroups.parquet'),
          parquetFile('productSubgroups', 'PrtGroupTt.parquet'),
          parquetFile('suppliers', 'Suppliers.parquet'),
          parquetFile('entities', 'Idx.parquet'),
          parquetFile('entityGroups', 'Idx_Grp.parquet'),
          parquetFile('promotions', 'Mivza.parquet'),
          parquetFile('promotionClasses', 'Mivza_Svg.parquet'),
          parquetFile('models', 'PrtDegem.parquet'),
          parquetFile('salesCosts', 'DailyPriceCost.parquet'),
          parquetFile('franchiseCosts', 'DailyPriceCost_Zakyan.parquet'),
          parquetFile('inventory', 'Prt_ItrotStore_Yomi.parquet')
        ]
      })
    ],
    wUrlBase: 'signedRoom://comax2/usersRO/parquet/OEM_BI_4466',
    cacheStrategy: colsCache()
  })
})
