import { dsls } from '@jb6/core'

const { tgp: { TgpType } } = dsls

const SilverProjection = TgpType('silver-projection', 'de', {
  typescript: '{ name: string, mainCubeFile: SilverFile, lookupFiles: SilverFile[] }'
})
const SilverFile = TgpType('silver-file', 'de', {
  typescript: `{
  name: string
  wUrlPattern: string
  fields?: string[]
  version: number
  source?: string
  format?: string
  compression?: string
  orderBy?: string
  rowGroupLayout?: string
  metadata?: string
}`
})
const QueryLookup = TgpType('query-lookup', 'de', {
  typescript: '{ wUrl: string, bindAs: string, key?: string, value?: string, ensureCols?: string[] }'
})
const SilverBuilder = TgpType('silver-builder', 'de', {
  modifierId: 'SilverBuilder',
  typescript: '{ sourceType: "event-batches"|"full", keyField: string, periodPattern: string, silverProjections: SilverProjection[] }'
})
const SqlModifier = TgpType('sql-modifier', 'de', {
  modifierId: 'SqlModifier',
  typescript: '{ phase?: string, modifyAst?: Function, modifyPrelude?: Function, duckFlags?: Function }'
})
const CacheStrategy = TgpType('cache-strategy', 'de', {
  modifierId: 'CacheStrategy',
  typescript: '{ buildSourceReader: Function, modifiers: Function, initQueryLookups?: Function, effectiveStrategyFor?: Function }'
})
const Cube = TgpType('cube', 'de', {
  modifierId: 'Cube',
  typescript: `{
  baCube: SemanticCube
  source: SilverBuilder
  wUrlBase: string
  queryLookups: QueryLookup[]
  sqlModifiers: SqlModifier[]
  setup?: CtxEnricher
  cacheStrategy: CacheStrategy
}`
})
const PhysicalTopology = TgpType('physical-topology', 'de', {
  typescript: `{
  cube?: Cube
  cubes?: Cube[]
  etls: Etl[]
  silverBuilder: SilverBuilder
  silverProjections: SilverProjection[]
  silverLookups: QueryLookup[]
  sqlModifiers: SqlModifier[]
  install(): Promise<Report>
  update(previousBaCube: SemanticCube): Promise<Report>
  build(): Promise<Report>
  deploy(): Promise<Report>
  report(): Promise<Report>
  autoImprove(): Promise<Report>
  guardedImprove(): Promise<Report>
}`
})

SilverProjection('projection', {
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'mainCubeFile', type: 'silver-file<de>', mandatory: true, byName: true},
    {id: 'lookupFiles', type: 'silver-file<de>[]'}
  ]
})

SilverFile('parquetFile', {
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'wUrlPattern', as: 'string', mandatory: true},
    {id: 'fields', as: 'array', byName: true},
    {id: 'version', as: 'number', byName: true, defaultValue: 1},
    {id: 'source', as: 'string'},
    {id: 'format', as: 'string', defaultValue: 'parquet'},
    {id: 'compression', as: 'string'},
    {id: 'orderBy', as: 'string'},
    {id: 'rowGroupLayout', as: 'string'},
    {id: 'metadata', as: 'string'}
  ]
})

QueryLookup('lookupByWUrl', {
  params: [
    {id: 'wUrl', as: 'string', mandatory: true},
    {id: 'bindAs', as: 'string', mandatory: true},
    {id: 'key', as: 'string'},
    {id: 'value', as: 'string'},
    {id: 'ensureCols', as: 'array', byName: true}
  ]
})

SilverBuilder('parquetSource', {
  params: [
    {id: 'wUrl', as: 'string', mandatory: true},
    {id: 'name', as: 'string', defaultValue: ''},
    {id: 'keyField', as: 'string', defaultValue: ''},
    {id: 'periodPattern', as: 'string', defaultValue: 'YYYY-MM-DD'}
  ]
})

SqlModifier('sqlModifier', {
  params: [
    {id: 'phase', as: 'string'},
    {id: 'modifyAst', asIs: true},
    {id: 'modifyPrelude', asIs: true},
    {id: 'duckFlags', asIs: true}
  ]
})

CacheStrategy('colsCache', { description: 'cache requested parquet columns' })
CacheStrategy('fullFileCache', { description: 'cache complete source files' })
CacheStrategy('noCache', { description: 'read source files without persistent cache' })

Cube('cube', {
  params: [
    {id: 'baCube', type: 'semantic-cube<ba>', mandatory: true},
    {id: 'source', type: 'silver-builder<de>'},
    {id: 'wUrlBase', as: 'string', defaultValue: ''},
    {id: 'queryLookups', type: 'query-lookup<de>[]'},
    {id: 'sqlModifiers', type: 'sql-modifier<de>[]'},
    {id: 'setup', type: 'ctx-enricher<tgp>', dynamic: true},
    {id: 'cacheStrategy', type: 'cache-strategy<de>'}
  ]
})

PhysicalTopology('singleCubeBucketDuckdbZeroSilverReplication', {
  params: [
    {id: 'cube', type: 'cube<de>', mandatory: true},
    {id: 'silverBuilder', type: 'silver-builder<de>'},
    {id: 'etls', type: 'etl<etl>[]', dynamic: true},
    {id: 'silverProjections', type: 'silver-projection[]'},
    {id: 'silverLookups', type: 'query-lookup[]'},
    {id: 'sqlModifiers', type: 'sql-modifier[]'},
    {id: 'wUrlBase', as: 'string'},
    {id: 'cacheStrategy', type: 'cache-strategy'}
  ]
})

PhysicalTopology('bucketDuckDbWithProjections', {
  params: [
    {id: 'cubes', type: 'cube<de>[]', mandatory: true},
    {id: 'silverBuilder', type: 'silver-builder<de>'},
    {id: 'etls', type: 'etl<etl>[]', dynamic: true},
    {id: 'silverProjections', type: 'silver-projection[]'},
    {id: 'silverLookups', type: 'query-lookup[]'},
    {id: 'sqlModifiers', type: 'sql-modifier[]'},
    {id: 'wUrlBase', as: 'string'},
    {id: 'cacheStrategy', type: 'cache-strategy'}
  ]
})

PhysicalTopology('athenaSQLRouter', {
  params: [
    {id: 'cubes', type: 'cube<de>[]', mandatory: true},
    {id: 'silverBuilder', type: 'silver-builder<de>'},
    {id: 'etls', type: 'etl<etl>[]', dynamic: true},
    {id: 'silverProjections', type: 'silver-projection[]'},
    {id: 'silverLookups', type: 'query-lookup[]'},
    {id: 'sqlModifiers', type: 'sql-modifier[]'},
    {id: 'wUrlBase', as: 'string'},
    {id: 'cacheStrategy', type: 'cache-strategy'}
  ]
})

PhysicalTopology('trinoIncrementalEtlAndSqlRouter', {
  params: [
    {id: 'cubes', type: 'cube<de>[]', mandatory: true},
    {id: 'silverBuilder', type: 'silver-builder<de>'},
    {id: 'etls', type: 'etl<etl>[]', dynamic: true},
    {id: 'silverProjections', type: 'silver-projection[]'},
    {id: 'silverLookups', type: 'query-lookup[]'},
    {id: 'sqlModifiers', type: 'sql-modifier[]'},
    {id: 'wUrlBase', as: 'string'},
    {id: 'cacheStrategy', type: 'cache-strategy'}
  ]
})
