import { dsls, jb } from '@jb6/core'
import '@jb6/common'
import './bi-dsl.js'

const { tgp: { TgpType, TgpTypeModifier }, common: { CubeTool } } = dsls
const CubeFilter = TgpType('cube-filter', 'bi', {
  typescript: `{
  fields: string[]
  toSql(ctx<cube>): string
}`
})

const sqlLiteral = v => typeof v === 'number' ? String(v) : `'${String(v).replaceAll("'", "''")}'`
const combinePredicates = (parts, op) => { const kept = parts.filter(s => s && s !== 'true'); return kept.length ? kept.map(s => `(${s})`).join(` ${op} `) : 'true' }
const omitted = (ctx, field) => (ctx.vars.omitFields || []).includes(field)

CubeFilter('inList', {
  params: [
    {id: 'field', as: 'string', mandatory: true},
    {id: 'values', as: 'array', mandatory: true}
  ],
  impl: (_, {}, { field, values }) => ({
    fields: [field],
    toSql: ctx => { const v = values.map(x => ctx.exp(x, 'string')); return omitted(ctx, field) || !v.length ? 'true' : `${field} in (${v.map(sqlLiteral).join(',')})` }
  })
})

CubeFilter('range', {
  params: [
    {id: 'field', as: 'string', mandatory: true},
    {id: 'from', as: 'string'},
    {id: 'to',   as: 'string'},
    {id: 'fromEx', as: 'string'},
    {id: 'toEx',   as: 'string'}
  ],
  impl: (_, {}, { field, from, to, fromEx, toEx }) => ({
    fields: [field],
    toSql: ctx => omitted(ctx, field) ? 'true' : [
      from   != null && `${field} >= ${sqlLiteral(ctx.exp(from, 'string'))}`,
      to     != null && `${field} <= ${sqlLiteral(ctx.exp(to, 'string'))}`,
      fromEx != null && `${field} > ${sqlLiteral(ctx.exp(fromEx, 'string'))}`,
      toEx   != null && `${field} < ${sqlLiteral(ctx.exp(toEx, 'string'))}`
    ].filter(Boolean).join(' and ') || 'true'
  })
})

CubeFilter('allOf', {
  params: [{id: 'items', type: 'cube-filter<bi>[]', mandatory: true, composite: true}],
  impl: (_, {}, { items }) => ({
    fields: items.flatMap(f => f.fields),
    toSql: ctx => combinePredicates(items.map(f => f.toSql(ctx)), 'and')
  })
})
CubeFilter('anyOf', {
  params: [{id: 'items', type: 'cube-filter<bi>[]', mandatory: true, composite: true}],
  impl: (_, {}, { items }) => ({
    fields: items.flatMap(f => f.fields),
    toSql: ctx => combinePredicates(items.map(f => f.toSql(ctx)), 'or')
  })
})

CubeFilter('rebind', {
  description: 'evaluate base with its constraints on the replace fields ignored, then AND the using filters in their place; lets a measure re-decide specific fields while inheriting the rest of an ambient filter',
  params: [
    {id: 'base', type: 'cube-filter<bi>', mandatory: true, composite: true},
    {id: 'replace', as: 'array'},
    {id: 'using', type: 'cube-filter<bi>[]'}
  ],
  impl: (_, {}, { base, replace = [], using = [] }) => ({
    fields: base.fields.filter(f => !replace.includes(f)).concat(using.flatMap(f => f.fields)),
    toSql: ctx => combinePredicates([
      base.toSql(ctx.setVars({ omitFields: [...(ctx.vars.omitFields || []), ...replace] })),
      ...using.map(f => f.toSql(ctx))
    ], 'and')
  })
})

CubeFilter('unfiltered', {
  impl: () => ({ fields: [], toSql: () => 'true' })
})

CubeTool('filterToSql', {
  params: [
    { id: 'cube', type: 'cube<bi>', dynamic: true, mandatory: true },
    { id: 'filter', type: 'cube-filter<bi>', mandatory: true }
  ],
  impl: (ctx, {}, { cube, filter }) => filter.toSql(ctx.setVars({ cube: cube(ctx) }))
})