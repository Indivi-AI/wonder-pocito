import { coreUtils, dsls, ns } from '@jb6/core'

const { asArray, unique, RT_types } = coreUtils
const { 
  tgp: { TgpType },
  common: { Data, Aggregator,
    data: { addProp, pipeline,  removeProps, join, max, min, sum, count },
  },
} = dsls

const GroupProp = TgpType('group-prop','common')

Aggregator('splitByPivot', {
  params: [
    {id: 'pivot', as: 'string', description: 'prop name', mandatory: true},
    {id: 'items', as: 'array', defaultValue: '%%'}
  ],
  impl: (ctx, {}, {pivot, items}) => {
      const keys = unique(items.map(item=>item[pivot]))
      const groups = Object.fromEntries(keys.map(key=> [key,[]]))
      items.forEach(item => groups[item[pivot]].push(item))
      return keys.map(key => ({[pivot]: key, items: groups[key]}))
  }
})

Data('enrichGroupProps', {
  description: 'aggregate, extend group obj with a group props',
  params: [
    {id: 'props', type: 'group-prop[]', mandatory: true},
  ],
  impl: (ctx, {}, {props}) => props.flatMap(x=>asArray(x)).reduce((item,prop) => ({...item, ...prop.enrichGroupItem(item)}), ctx.data )
})

// Aggregator('groupBy', {
//   params: [
//     {id: 'pivot', as: 'string', description: 'new prop name', mandatory: true},
//     {id: 'calcPivot', dynamic: true, mandatory: true, byName: true},
//     {id: 'aggregate', type: 'group-prop[]', mandatory: true},
//     {id: 'inputItems', defaultValue: '%%'},
//   ],
//   impl: pipeline(
//     '%$inputItems%',
//     addProp('%$pivot%', '%$calcPivot()%'),
//     splitByPivot('%$pivot%'),
//     enrichGroupProps('%$aggregate%'),
//     removeProps('items'),
//   )
// })

GroupProp('group.prop', {
  description: 'assign, extend group obj with a single prop, input is items',
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'val', dynamic: true, mandatory: true, defaultValue: '', description: 'input is group items'},
    {id: 'type', as: 'string', options: 'string,number,boolean,object,array,asIs', defaultValue: 'asIs'},
  ],
  impl: (ctx, {}, {name, val, type}) => ({ 
    enrichGroupItem: item => ({...item, [name]: RT_types[type](val(ctx.setData(item.items)))})
  })
})

const { group } = ns

GroupProp('group.count', {
  params: [
    {id: 'as', as: 'string', defaultValue: 'count'},
  ],
  impl: group.prop('%$as%', count())
})

GroupProp('group.join', {
  params: [
    {id: 'prop', as: 'string', mandatory: true},
    {id: 'as', as: 'string', mandatory: true, byName: true},
    {id: 'separator', as: 'string', defaultValue: ','},
  ],
  impl: group.prop('%$as%', join({data: '%{%$prop%}%', separator: '%$separator%'}))
})

GroupProp('group.max', {
  params: [
    {id: 'prop', as: 'string', mandatory: true},
    {id: 'as', as: 'string', dynamic: true, defaultValue: defaultGroupPropName, byName: true}
  ],
  impl: group.prop('%$as()%', max({data: '%{%$prop%}%'}))
})

GroupProp('group.min', {
  params: [
    {id: 'prop', as: 'string', mandatory: true},
    {id: 'as', as: 'string', defaultValue: defaultGroupPropName, byName: true}
  ],
  impl: group.prop('%$as%', min({data: '%{%$prop%}%'}))
})

GroupProp('group.sum', {
  params: [
    {id: 'prop', as: 'string', mandatory: true},
    {id: 'as', as: 'string', defaultValue: defaultGroupPropName, byName: true}
  ],
  impl: group.prop('%$as%', sum({data: '%{%$prop%}%'}))
})

function defaultGroupPropName(ctx) {
  const aggregatedProp = coreUtils.calcPath(ctx.jbCtx.dynamicStack.slice(-1)[0],'jbCtx.args.prop') || ''
  const opId = (ctx.jbCtx.path.match(/([^~.]+)~/) || [])[1]
  return [opId,aggregatedProp.replace(/^./, c => c.toUpperCase())].join('')
}
/*
example usage:

Test('groupBy.stepByStep', {
  impl: dataTest({
    calculate: pipeline(
      '%$employees%',
      splitByPivot('dept'),
      enrichGroupProps(group.count('numEmployees')),
      enrichGroupProps(group.max('salary', { as: 'maxSalary' })),
      '%numEmployees% employees max %maxSalary%'
    ),
    expectedResult: equals(asIs(['2 employees max 60000','2 employees max 80000','1 employees max 55000']))
  })
})
*/
