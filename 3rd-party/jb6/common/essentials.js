import { coreUtils, dsls } from '@jb6/core'
const { asArray, waitForInnerElements, toArray, toString, calcValue, objectDiff, toSingle } = coreUtils
const { tgp: { TgpTypeModifier, Component }, common: { Data, Boolean } } = dsls

Component('pipeline', {
  description: 'flat map data arrays one after the other, does not wait for promises and rx',
  params: [
    {id: 'source', type: 'data', dynamic: true, mandatory: true, composite: true},
    {id: 'operators', type: 'data[]', dynamic: true, mandatory: true, secondParamAsArray: true, description: 'chain/map data functions'}
  ],
  impl: (ctx, {}, { operators, source }) => asArray(operators.profile).reduce( (dataArray, profile ,index) => logPipeStep(ctx, index, profile, runAsAggregator(ctx, operators, index,dataArray,profile)), source())
})

Component('pipe', {
  description: 'synch data, wait for promises and reactive (callbag) data',
  params: [
    {id: 'source', type: 'data', dynamic: true, mandatory: true, templateValue: '', composite: true},
    {id: 'operators', type: 'data[]', dynamic: true, mandatory: true, secondParamAsArray: true, description: 'chain/map data functions'}
  ],
  impl: async (ctx, {}, {operators,source}) => waitForInnerElements(asArray(operators.profile).reduce(async (dataArrayPromise, profile,index) => {
      const dataArray = await waitForInnerElements(dataArrayPromise)
      return logPipeStep(ctx, index, profile, await runAsAggregator(ctx, operators, index, dataArray, profile))
    }, waitForInnerElements(source()) ))
})

const Aggregator = TgpTypeModifier('Aggregator', { aggregator: true, dsl: 'common', type: 'data'})

Aggregator('join', {
  params: [
    {id: 'separator', as: 'string', defaultValue: ','},
    {id: 'prefix', as: 'string', byName: true},
    {id: 'suffix', as: 'string'},
    {id: 'items', as: 'array', defaultValue: '%%'},
    {id: 'itemText', as: 'string', dynamic: true, defaultValue: '%%'}
  ],
  impl: (ctx, {}, { separator,prefix,suffix,items,itemText}) => {
		const itemToText = ctx.jbCtx.args.itemText ? item => itemText(ctx.setData(item)) : item => toString(item)
		return prefix + items.map(itemToText).join(separator) + suffix;
	}
})

Aggregator('filter', {
  params: [
    {id: 'filter', type: 'boolean', as: 'boolean', dynamic: true, mandatory: true}
  ],
  impl: (ctx, {}, {filter}) => toArray(ctx.data).filter(item => filter(ctx.setData(item)))
})

Aggregator('first', {
  params: [
    {id: 'items', as: 'array', defaultValue: '%%'}
  ],
  impl: ({}, {}, {items}) => items[0]
})

Component('list', {
  description: 'list definition, flatten internal arrays',
  params: [
    {id: 'items', type: 'data[]', as: 'array', composite: true}
  ],
  impl: ({}, {}, {items}) => items.flatMap(item=>Array.isArray(item) ? item : [item])
})

Aggregator('slice', {
  params: [
    {id: 'start', as: 'number', defaultValue: 0, description: '0-based index', mandatory: true},
    {id: 'end', as: 'number', mandatory: true, description: '0-based index of where to end the selection (not including itself)'}
  ],
  impl: ({data}, {}, {start,end}) => {
		if (!data || !data.slice) return null
		return end ? data.slice(start,end) : data.slice(start)
	}
})

Aggregator('count', {
  description: 'length, size of array',
  params: [
    {id: 'items', as: 'array', defaultValue: '%%'}
  ],
  impl: ({}, {}, {items}) => items.length
})

Data('split', {
  description: 'breaks string using separator',
  params: [
    {id: 'separator', as: 'string', defaultValue: ',', description: 'E.g., "," or "<a>"'},
    {id: 'text', as: 'string', defaultValue: '%%', byName: true},
    {id: 'part', options: 'all,first,second,last,but first,but last', defaultValue: 'all'}
  ],
  impl: (ctx, {}, {separator, text, part}) => {
    const out = text.split(separator.replace(/\\r\\n/g,'\n').replace(/\\n/g,'\n'));
    switch (part) {
      case 'first': return out[0];
      case 'second': return out[1];
      case 'last': return out.pop();
      case 'but first': return out.slice(1);
      case 'but last': return out.slice(0,-1);
      default: return out;
    }
  }
})

export const not = Boolean('not', {
  type: 'boolean',
  params: [
    {id: 'of', type: 'boolean', as: 'boolean', mandatory: true, composite: true}
  ],
  impl: (ctx, {}, {of}) => !of
})

Boolean('and', {
  description: 'logical and',
  type: 'boolean',
  params: [
    {id: 'items', type: 'boolean[]', dynamic: true, mandatory: true, composite: true}
  ],
  impl: (ctx, {}, {items}) => asArray(items.profile).reduce((res,_,i) => res && ctx.runInnerArg(items,i), true)
})

Boolean('or', {
  description: 'logical or',
  type: 'boolean',
  params: [
    {id: 'items', type: 'boolean[]', dynamic: true, mandatory: true, composite: true}
  ],
  impl: (ctx, {}, {items}) => asArray(items.profile).reduce((res,_,i) => res || ctx.runInnerArg(items,i), false)
})

Boolean('notEmpty', {
  params: [
    {id: 'item', as: 'single', defaultValue: '%%', composite: true}
  ],
  impl: (ctx, {}, {item}) => item && !(Array.isArray(item) && item.length == 0)
})

Boolean('equals', {
  params: [
    {id: 'item1', mandatory: true},
    {id: 'item2', defaultValue: '%%'}
  ],
  impl: (ctx, {}, {item1, item2}) => {
    return typeof item1 == 'object' && typeof item1 == 'object' ? Object.keys(objectDiff(item1,item2)||[]).length == 0 
      : toSingle(item1) == toSingle(item2)
  }
})

export const contains = Boolean('contains', {
  params: [
    {id: 'text', type: 'data[]', as: 'array', mandatory: true},
    {id: 'allText', defaultValue: '%%', as: 'string'},
    {id: 'anyOrder', as: 'boolean', type: 'boolean'}
  ],
  impl: (ctx, {}, {text, allText, anyOrder}) => {
    let prevIndex = -1
    for(let i=0;i<text.length;i++) {
      const newIndex = allText.indexOf(toString(text[i]),prevIndex+1)
      if (newIndex == -1) return false
      prevIndex = anyOrder ? -1 : newIndex
    }
    return true
  }
})

Boolean('notContains', {
  params: [
    {id: 'text', type: 'data[]', as: 'array', mandatory: true},
    {id: 'allText', defaultValue: '%%', as: 'array', byName: true}
  ],
  impl: not(contains('%$text%', { allText: '%$allText%' }))
})

function runAsAggregator(ctx, arg, index, dataArray, profile) {
    if (!profile || profile.$disabled) return dataArray
    if (profile.$?.aggregator)
      return ctx.setData(asArray(dataArray)).runInnerArg(arg, index)
    return asArray(dataArray)
      .map(item => ctx.setData(item).runInnerArg(arg, index))
      .filter(x=>x!=null)
      .flatMap(x=> asArray(calcValue(x)))
}

function logPipeStep(ctx, index, profile, out) {
    ctx.vars.pipeLogger?.info({t: 'step', pipe: ctx.jbCtx.path, index, op: profile?.$ || profile?.$$, out}, {}, {ctx})
    return out
}
