import { dsls, coreUtils, jb } from '@jb6/core'
import '@jb6/core/misc/pretty-print.js'
import '@wonder/db/etl/etl-dsl.js'

const { tgp: { TgpType, Component }, etl: { 'cli-transform': { duckdb } } } = dsls
const ValueWithInfo = TgpType('value-with-info', 'dim-stat')
const Stat = TgpType('stat', 'dim-stat')
const StatBuilder = TgpType('stat-builder', 'dim-stat', {
  typescript: `{ fieldId: string; aggregateSql(namespace: string): string }`
})

ValueWithInfo('value', { params: [
  { id: 'value', asIs: true, mandatory: true },
  { id: 'count', as: 'number', mandatory: true }
] })
ValueWithInfo('bin', { params: [
  { id: 'from', asIs: true, mandatory: true },
  { id: 'to', asIs: true },
  { id: 'count', as: 'number', mandatory: true }
] })
ValueWithInfo('path', { params: [
  { id: 'values', asIs: true, mandatory: true },
  { id: 'count', as: 'number', mandatory: true }
] })

Component('categorical', {
  type: 'stat<dim-stat>',
  params: [
    {id: 'count', as: 'number', mandatory: true},
    {id: 'nullCount', as: 'number'},
    {id: 'values', type: 'value-with-info[]', mandatory: true}
  ]
})
Stat('text', { params: [
  { id: 'count', as: 'number', mandatory: true },
  { id: 'nullCount', as: 'number' },
  { id: 'emptyCount', as: 'number' },
  { id: 'distinctCount', as: 'number' },
  { id: 'minLength', as: 'number' },
  { id: 'maxLength', as: 'number' },
  { id: 'totalLength', as: 'number' },
  { id: 'top', type: 'value-with-info[]' },
  { id: 'lengthBins', type: 'value-with-info[]' }
] })
Stat('numeric', { params: [
  { id: 'count', as: 'number', mandatory: true },
  { id: 'nullCount', as: 'number' },
  { id: 'min', as: 'number' },
  { id: 'max', as: 'number' },
  { id: 'sum', as: 'number' },
  { id: 'bins', type: 'value-with-info[]' }
] })
Stat('temporal', { params: [
  { id: 'count', as: 'number', mandatory: true },
  { id: 'nullCount', as: 'number' },
  { id: 'min', as: 'string', asIs: true },
  { id: 'max', as: 'string', asIs: true },
  { id: 'granularity', as: 'string', asIs: true },
  { id: 'timezone', as: 'string', asIs: true },
  { id: 'bins', type: 'value-with-info[]' }
] })
Stat('hierarchical', { params: [
  { id: 'count', as: 'number', mandatory: true },
  { id: 'nullCount', as: 'number' },
  { id: 'levels', as: 'array', mandatory: true },
  { id: 'paths', type: 'value-with-info[]', mandatory: true }
] })
Stat('fromWUrl', { params: [
  { id: 'wUrl', as: 'string', asIs: true, mandatory: true }
] })

StatBuilder('categoricalStat', {
  params: [{ id: 'fieldId', as: 'string', defaultValue: '%$dimensionName%' }],
  impl: (_, {}, { fieldId }) => ({ fieldId, aggregateSql: namespace =>
    `json_object('id','${fieldId}.${namespace}','impl',json_object('$','stat<dim-stat>categorical','count',count(*),
      'nullCount',count(*)-count(${fieldId}),'values',list_transform(map_entries(histogram(${fieldId})),v ->
      json_object('$','value-with-info<dim-stat>value','value',v.key,'count',v.value))))` })
})

StatBuilder('numericStat', {
  params: [{ id: 'fieldId', as: 'string', defaultValue: '%$dimensionName%' }],
  impl: (_, {}, { fieldId }) => ({ fieldId, aggregateSql: namespace =>
    `json_object('id','${fieldId}.${namespace}','impl',json_object('$','stat<dim-stat>numeric','count',count(*),
      'nullCount',count(*)-count(${fieldId}),'min',min(${fieldId}),'max',max(${fieldId}),'sum',sum(${fieldId})))` })
})

StatBuilder('temporalStat', {
  params: [{ id: 'fieldId', as: 'string', defaultValue: '%$dimensionName%' }],
  impl: (_, {}, { fieldId }) => ({ fieldId, aggregateSql: namespace =>
    `json_object('id','${fieldId}.${namespace}','impl',json_object('$','stat<dim-stat>temporal','count',count(*),
      'nullCount',count(*)-count(${fieldId}),'min',min(${fieldId})::varchar,'max',max(${fieldId})::varchar,'granularity','day'))` })
})

StatBuilder('textStat', {
  params: [{ id: 'fieldId', as: 'string', defaultValue: '%$dimensionName%' }],
  impl: (_, {}, { fieldId }) => ({ fieldId, aggregateSql: namespace =>
    `json_object('id','${fieldId}.${namespace}','impl',json_object('$','stat<dim-stat>text','count',count(*),
      'nullCount',count(*)-count(${fieldId}),'emptyCount',count(*) filter(where ${fieldId}=''),'distinctCount',count(distinct ${fieldId}),
      'minLength',min(length(${fieldId})),'maxLength',max(length(${fieldId})),'totalLength',sum(length(${fieldId}))))` })
})

Component('dimensionStats', {
  type: 'cli-transform<etl>', params: [
    { id: 'statBuilders', type: 'stat-builder<dim-stat>[]', mandatory: true },
    { id: 'namespace', as: 'string', asIs: true, mandatory: true },
    { id: 'from', as: 'string', asIs: true, mandatory: true }
  ],
  impl: (ctx, {}, { statBuilders, namespace, from }) => ctx.run(duckdb(`select cast(json_object('stats',[
    ${statBuilders.map(statBuilder => statBuilder.aggregateSql(namespace)).join(',')}]) as varchar) dimension_stats from ${from}`,
    { format: 'JSON, ARRAY false' }))
})

const allowedProfiles = new Set(['categorical', 'text', 'numeric', 'temporal', 'hierarchical', 'fromWUrl']
  .map(id => `stat<dim-stat>${id}`).concat(['value', 'bin', 'path'].map(id => `value-with-info<dim-stat>${id}`)))
const safeJson = value => value == null || ['string', 'number', 'boolean'].includes(typeof value) || Array.isArray(value) && value.every(safeJson)
  || Object.getPrototypeOf(value) === Object.prototype && !Object.keys(value).some(key => ['__proto__', 'prototype', 'constructor'].includes(key))
    && (!value.$ || allowedProfiles.has(value.$)) && Object.values(value).every(safeJson)

function loadDimensionStatsJson(json) {
  try {
    const outer = typeof json === 'string' ? JSON.parse(json) : json
    const parsed = typeof outer?.dimension_stats === 'string' ? JSON.parse(outer.dimension_stats) : outer
    const definitions = coreUtils.asArray(parsed?.stats || parsed)
    if (!definitions.every(({ id, impl } = {}) => /^[\w$-]+(?:\.[\w$-]+)*$/.test(id) && safeJson(impl))) {
      coreUtils.logError('invalid dimension stat definitions', { definitions })
      return []
    }
    return definitions.map(({ id, impl }) => Stat(id, { impl }))
  } catch (error) {
    coreUtils.logException(error, 'invalid dimension stats json')
    return []
  }
}

Object.assign(jb.biUtils ||= {}, { loadDimensionStatsJson })

Component('dimensionStatsMacroFile', {
  moreTypes: 'etl<etl>', nodeOnly: true, params: [{ id: 'from', as: 'string' }, { id: 'to', as: 'string' }],
  impl: async (ctx, {}, { from, to }) => {
    try {
      const { readFile, writeFile } = await import('node:fs/promises')
      const comps = loadDimensionStatsJson(await readFile(from, 'utf8'))
      if (!comps.length) return { error: 'no stats', from }
      await writeFile(to, comps.map(comp => coreUtils.prettyPrintComp(comp, { tgpModel: jb })).join('\n\n'))
      return { to, stats: comps.length }
    } catch (error) {
      coreUtils.logException(error, 'dimension stats macro file', { from, to, ctx })
      return { error: error.message, from, to }
    }
  }
})
