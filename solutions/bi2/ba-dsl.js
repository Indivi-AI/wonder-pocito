import { dsls } from '@jb6/core'

const { tgp: { TgpType, Component } } = dsls
const SemanticCube = TgpType('semantic-cube', 'ba', {
  typescript: 'declarative, non-executable { inputs, mappings, dimensions, metrics, queryServiceLevels, limits, remarks }'
})
const Input = TgpType('input', 'ba', { typescript: '{ name, example?, exampleFile?, size?, updateFrequency?, remarks? }' })
const Mapping = TgpType('mapping', 'ba', { typescript: '{ name, from, grain?, fields, relationships, remarks? }' })
const Field = TgpType('field', 'ba', { typescript: '{ name, sqlExp, jsExp, type?, description? }' })
const Normalizer = TgpType('normalizer', 'ba')
const EnumAlias = TgpType('enum-alias', 'ba')
const FieldReducer = TgpType('field-reducer', 'ba', { typescript: '{ fields, take? } | { fields }' })
const Relationship = TgpType('relationship', 'ba', { typescript: '{ name, from, to, on, cardinality, required?, remarks? }' })
const Dimension = TgpType('dimension', 'ba', { typescript: '{ name, expression?, type?, description?, parent?, values? }' })
const Metric = TgpType('metric', 'ba', { typescript: '{ name, formula, unit?, description? }' })
const Limit = TgpType('limit', 'ba', { typescript: '{ text }' })
const QueryServiceLevel = TgpType('query-service-level', 'ba', {
  typescript: '{ name, when, latency, freshness, priority, exactness, frequency }'
})
Input('factByExample', {
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'example', as: 'single'},
    {id: 'exampleFile', as: 'string'},
    {id: 'size', as: 'string'},
    {id: 'updateFrequency', as: 'string'},
    {id: 'remark', as: 'text'}
  ]
})
Input('masterDataByExample', {
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'example', as: 'single'},
    {id: 'exampleFile', as: 'string'},
    {id: 'remark', as: 'text'}
  ]
})
Field('field', {
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'sqlExp', as: 'text'},
    {id: 'jsExp', dynamic: true},
    {id: 'type', as: 'string'},
    {id: 'description', as: 'string'}
  ]
})
Field('sourceField', {
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'from', as: 'string'},
    {id: 'type', as: 'string'}
  ]
})
Field('enumField', {
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'values', as: 'string', mandatory: true},
    {id: 'from', as: 'string'},
    {id: 'normalizer', type: 'normalizer<ba>'},
    {id: 'aliases', type: 'enum-alias<ba>[]'},
    {id: 'description', as: 'string'}
  ]
})
Field('masterDataField', {
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'masterField', as: 'string', mandatory: true},
    {id: 'from', as: 'string'},
    {id: 'normalizer', type: 'normalizer<ba>'}
  ]
})
Field('calculatedField', {
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'calculate', dynamic: true, mandatory: true},
    {id: 'type', as: 'string'},
    {id: 'description', as: 'string'}
  ]
})
Normalizer('ignoreCase', {
  impl: () => 'ignoreCase'
})
Normalizer('kebab', {
  impl: () => 'kebab'
})
EnumAlias('aliases', {
  params: [
    {id: 'value', as: 'string', mandatory: true},
    {id: 'sourceValues', as: 'string', mandatory: true}
  ]
})
FieldReducer('pick', {
  params: [
    {id: 'fields', as: 'string', mandatory: true},
    {id: 'take', as: 'string', defaultValue: 'firstNotNull'}
  ]
})
FieldReducer('calculateFields', {
  params: [
    {id: 'fields', type: 'field<ba>[]', mandatory: true}
  ]
})
Relationship('relationship', {
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'from', as: 'string', mandatory: true},
    {id: 'to', as: 'string', mandatory: true},
    {id: 'on', as: 'string', mandatory: true},
    {id: 'cardinality', as: 'string', defaultValue: 'many-to-one'},
    {id: 'required', as: 'boolean', type: 'boolean<common>'},
    {id: 'remark', as: 'text'}
  ]
})
Relationship('relationshipByKey', {
  params: [
    {id: 'to', as: 'string', mandatory: true},
    {id: 'key', as: 'string', mandatory: true},
    {id: 'cardinality', as: 'string', defaultValue: 'many-to-one'},
    {id: 'required', as: 'boolean', type: 'boolean<common>'}
  ]
})
Mapping('mapInput', {
  params: [
    {id: 'baseInput', as: 'string', mandatory: true},
    {id: 'fields', type: 'field<ba>[]'},
    {id: 'relationships', type: 'relationship<ba>[]'},
    {id: 'remark', as: 'text'}
  ]
})
Mapping('materializeInput', {
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'from', as: 'string', mandatory: true},
    {id: 'grain', as: 'array', mandatory: true},
    {id: 'rows', as: 'single'},
    {id: 'fields', type: 'field<ba>[]'},
    {id: 'relationships', type: 'relationship<ba>[]'}
  ]
})
Mapping('mapFacts', {
  params: [
    {id: 'baseInput', as: 'string', mandatory: true},
    {id: 'fields', type: 'field<ba>[]'},
    {id: 'relationships', type: 'relationship<ba>[]'},
    {id: 'remark', as: 'text'}
  ]
})
Mapping('materializeFacts', {
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'from', as: 'string', mandatory: true},
    {id: 'grain', as: 'array', mandatory: true},
    {id: 'fields', type: 'field-reducer<ba>[]'},
    {id: 'relationships', type: 'relationship<ba>[]'},
    {id: 'remark', as: 'text'}
  ]
})
Mapping('mapMasterData', {
  params: [
    {id: 'baseInput', as: 'string', mandatory: true},
    {id: 'fields', type: 'field<ba>[]'},
    {id: 'relationships', type: 'relationship<ba>[]'},
    {id: 'remark', as: 'text'}
  ]
})
Mapping('materializeMasterData', {
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'from', as: 'string', mandatory: true},
    {id: 'grain', as: 'array', mandatory: true},
    {id: 'fields', type: 'field-reducer<ba>[]'},
    {id: 'relationships', type: 'relationship<ba>[]'},
    {id: 'remark', as: 'text'}
  ]
})
Mapping('eventToObjectMapping', {
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'from', as: 'string', mandatory: true},
    {id: 'grain', as: 'array', mandatory: true},
    {id: 'fields', type: 'field<ba>[]'},
    {id: 'relationships', type: 'relationship<ba>[]'},
    {id: 'remark', as: 'text'}
  ]
})
Dimension('dimension', {
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'expression', as: 'string', mandatory: true},
    {id: 'type', as: 'string'},
    {id: 'description', as: 'string'},
    {id: 'parent', as: 'string'},
    {id: 'values', as: 'array'}
  ]
})
Metric('metric', {
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'formula', as: 'string', mandatory: true},
    {id: 'unit', as: 'string'},
    {id: 'description', as: 'string'}
  ]
})
Limit('limit', {
  params: [
    {id: 'text', as: 'string', mandatory: true}
  ]
})
QueryServiceLevel('queryServiceLevel', {
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'when', as: 'string', mandatory: true},
    {id: 'latency', as: 'string'},
    {id: 'freshness', as: 'string'},
    {id: 'priority', as: 'number', defaultValue: 3},
    {id: 'exactness', as: 'string', defaultValue: 'exact'},
    {id: 'frequency', as: 'string'}
  ]
})
SemanticCube('semanticCube', {
  params: [
    {id: 'inputs', type: 'input<ba>[]'},
    {id: 'mappings', type: 'mapping<ba>[]'},
    {id: 'dimensions', type: 'dimension<ba>[]'},
    {id: 'metrics', type: 'metric<ba>[]'},
    {id: 'queryServiceLevels', type: 'query-service-level<ba>[]'},
    {id: 'limits', type: 'limit<ba>[]'},
    {id: 'remark', as: 'text'}
  ]
})
