import { coreUtils, dsls } from '@jb6/core'
const { RT_types, unique } = coreUtils
const { 
  common: { Data, Aggregator },
} = dsls

Aggregator('aggregate', {
  description: 'in pipeline, calc function on all items, rather then one by one',
  params: [
    {id: 'aggregator', type: 'data', mandatory: true, dynamic: true}
  ],
  impl: ({}, {}, {aggregator}) => aggregator()
})

Aggregator('objFromProperties', {
  description: 'object from entries of properties {id,val}',
  params: [
    {id: 'properties', defaultValue: '%%', as: 'array'}
  ],
  impl: ({}, {}, {properties}) => Object.fromEntries(properties.map(({id,val}) => [id,val]))
})

Aggregator('objFromEntries', {
  description: 'object from entries',
  params: [
    {id: 'entries', defaultValue: '%%', as: 'array'}
  ],
  impl: ({}, {}, {entries}) => Object.fromEntries(entries)
})

Aggregator('unique', {
  params: [
    {id: 'id', as: 'string', dynamic: true, defaultValue: '%%'},
    {id: 'items', as: 'array', defaultValue: '%%'}
  ],
  impl: (ctx, {}, {id,items}) => {
		const _idFunc = id.profile == '%%' ? x=>x : x => id(ctx.setData(x))
		return unique(items,_idFunc)
	}
})

Aggregator('max', {
  params: [
    {id: 'items', as: 'array', defaultValue: '%%'}
  ],
  impl: (ctx, {}, {items}) => Math.max.apply(0,items)
})

Aggregator('min', {
  params: [
    {id: 'items', as: 'array', defaultValue: '%%'}
  ],
  impl: (ctx, {}, {items}) => Math.min.apply(0,items)
})

Aggregator('sum', {
  params: [
    {id: 'items', as: 'array', defaultValue: '%%'}
  ],
  impl: (ctx, {}, {items}) => items.reduce((acc,item) => +item+acc, 0)
})

Aggregator('sort', {
  params: [
    {id: 'propertyName', as: 'string', description: 'sort by property inside object'},
    {id: 'lexical', as: 'boolean', type: 'boolean'},
    {id: 'ascending', as: 'boolean', type: 'boolean'}
  ],
  impl: ({data}, {}, {prop,lexical,ascending}) => {
    if (!data || ! Array.isArray(data)) return null;
    let sortFunc
    const firstData = data[0] //jb.entries(data[0]||{})[0][1]
		if (lexical || isNaN(firstData))
			sortFunc = prop ? (x,y) => (x[prop] == y[prop] ? 0 : x[prop] < y[prop] ? -1 : 1) : (x,y) => (x == y ? 0 : x < y ? -1 : 1);
		else
			sortFunc = prop ? (x,y) => (x[prop]-y[prop]) : (x,y) => (x-y);
		if (ascending)
  		return data.slice(0).sort((x,y)=>sortFunc(x,y));
		return data.slice(0).sort((x,y)=>sortFunc(y,x));
	}
})

Aggregator('last', {
  params: [
    {id: 'items', as: 'array', defaultValue: '%%'}
  ],
  impl: ({}, {}, {items}) => items.slice(-1)[0]
})

Aggregator('count', {
  description: 'length, size of array',
  params: [
    {id: 'items', as: 'array', defaultValue: '%%'}
  ],
  impl: ({}, {}, {items}) => items.length
})

Aggregator('reverse', {
  params: [
    {id: 'items', as: 'array', defaultValue: '%%'}
  ],
  impl: ({}, {}, {items}) => items.slice(0).reverse()
})

Aggregator('sample', {
  params: [
    {id: 'size', as: 'number', defaultValue: 300},
    {id: 'items', as: 'array', defaultValue: '%%'}
  ],
  impl: ({}, {}, {size, items}) =>	items.filter((x,i)=>i % (Math.floor(items.length/size) ||1) == 0)
})

Data('addProp', {
  description: 'assign, extend obj with a single prop',
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'val', dynamic: true, mandatory: true, defaultValue: ''},
    {id: 'type', as: 'string', options: 'string,number,boolean,object,array,asIs', defaultValue: 'asIs'},
    {id: 'obj', byName: true, defaultValue: '%%'}
  ],
  impl: (ctx, {}, {name,val,type,obj}) => ({...obj, [name]: RT_types[type](val())})
})

Data('removeProps', {
  description: 'remove properties from object',
  params: [
    {id: 'names', type: 'data[]', as: 'array', mandatory: true},
    {id: 'obj', byName: true, defaultValue: '%%'}
  ],
  impl: (ctx, {}, {names,obj}) => names.reduce((obj,name) => { const{ [name]: _, ...rest } = obj; return rest }, obj)
})
