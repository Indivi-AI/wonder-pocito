import { coreUtils, dsls } from '@jb6/core'
const { asArray, logError, waitForInnerElements, toArray, toString, isPromise, calcValue, toJstype, objectDiff, toSingle, sessionStorage, delay } = coreUtils

const {
  tgp: { Any, DefComponents, Const, TgpType, TgpTypeModifier, Component,
    'ctx-enricher': { Var },
    any: { If }
  },
  common: { Data, Action, Boolean,
    data: {asIs}
  }
} = dsls

Component('log', {
  moreTypes: 'action',
  params: [
    {id: 'logName', as: 'string', mandatory: 'true'},
    {id: 'logObj', as: 'single', defaultValue: '%%'}
  ],
  impl: (ctx, {}, {logName,logObj}) => { ctx.vars.commonLogger?.info?.({t: logName, ...logObj}, {}, {ctx}); return ctx.data }
})

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
    {id: 'prefix', as: 'string', byName: true },
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

Data('firstSucceeding', {
  params: [
    {id: 'operators', type: 'data[]', as: 'array', composite: true}
  ],
  impl: ({}, {}, { operators }) => {
    for(let i=0;i<operators.length;i++) {
      const val = calcValue(operators[i])
      const isNumber = typeof val === 'number'
      if (val !== '' && val != null && (!isNumber || (!isNaN(val)) && val !== Infinity && val !== -Infinity))
        return operators[i]
    }
		return operators.slice(-1)[0];
	}
})

Any('firstNotEmpty', {
  params: [
    {id: 'first', type: '$asParent', dynamic: true, mandatory: true},
    {id: 'second', type: '$asParent', dynamic: true, mandatory: true}
  ],
  impl: If('%$first()%', '%$first()%', '%$second()%')
})

Data('properties', {
  description: 'object entries as id,val',
  params: [
    { id: 'obj', defaultValue: '%%', as: 'single' }
  ],
  impl: (ctx, {}, { obj }) => Object.keys(obj).filter(p=>p.indexOf('$jb_') != 0).map((id,index) =>
			({ id: id, val: obj[id], index: index }))
})

Data('keys', {
  description: 'Object.keys',
  params: [
    { id: 'obj', defaultValue: '%%', as: 'single' }
  ],
  impl: (ctx, {}, { obj }) => Object.keys(obj && typeof obj === 'object' ? obj : {})
})

Data('values', {
  description: 'Object.keys',
  params: [
    { id: 'obj', defaultValue: '%%', as: 'single' }
  ],
  impl: (ctx, {}, { obj }) => Object.values(obj && typeof obj === 'object' ? obj : {})
})

Data('mapValues', {
  description: 'change each value of properties',
  type: 'data',
  params: [
    {id: 'map', dynamic: true, mandatory: true},
    {id: 'obj', defaultValue: '%%', as: 'single'}
  ],
  impl: (ctx, {}, {map, obj}) => Object.fromEntries(Object.keys(obj).map(k=>[k, map(ctx.setData(obj[k]))]))
})

Data('entries', {
  description: 'object entries as array 0/1',
  type: 'data',
  params: [
    {id: 'obj', defaultValue: '%%', as: 'single'}
  ],
  impl: (ctx, {}, {obj}) => Object.entries(obj)
})

Data('now', {
  impl: ({}, {}) => Date.now()
})

Data('plus', {
  category: 'math:80',
  params: [
    {id: 'x', as: 'number', mandatory: true},
    {id: 'y', as: 'number', mandatory: true}
  ],
  impl: (ctx, {}, {x, y}) => +x + +y
})

Data('minus', {
  category: 'math:80',
  params: [
    {id: 'x', as: 'number', mandatory: true},
    {id: 'y', as: 'number', mandatory: true}
  ],
  impl: (ctx, {}, {x, y}) => +x - +y
})

Data('mul', {
  category: 'math:80',
  params: [
    {id: 'x', as: 'number', mandatory: true},
    {id: 'y', as: 'number', mandatory: true}
  ],
  impl: (ctx, {}, {x, y}) => +x * +y
})

Data('div', {
  category: 'math:80',
  params: [
    {id: 'x', as: 'number', mandatory: true},
    {id: 'y', as: 'number', mandatory: true}
  ],
  impl: (ctx, {}, {x, y}) => +x / +y
})

DefComponents('abs,acos,acosh,asin,asinh,atan,atan2,atanh,cbrt,ceil,clz32,cos,cosh,exp,expm1,floor,fround,hypot,log2,random,round,sign,sin,sinh,sqrt,tan,tanh,trunc', 
  f => Data(`math.${f}`, {
    autoGen: true,
    category: 'math:70',
    params: [
      {id: 'func', as: 'string', defaultValue: f}
    ],
    impl: (ctx, {}, {func}) => Math[func](ctx.data)
  })
)

Data('property', {
  description: 'navigate/select/path property of object as ref object',
  params: [
    {id: 'prop', as: 'string', mandatory: true},
    {id: 'ofObj', defaultValue: '%%'},
    {id: 'useRef', as: 'boolean', type: 'boolean<common>'}
  ],
  impl: (ctx, {}, {prop, ofObj: obj, useRef}) => useRef && jb.ext.db ? jb.ext.db.objectProperty(obj,prop,ctx) : obj[prop]
})

Data('indexOf', {
  params: [
    {id: 'array', as: 'array', mandatory: true},
    {id: 'item', as: 'single', mandatory: true}
  ],
  impl: (ctx, {}, {array, item}) => array.indexOf(item)
})

Data('obj', {
  description: 'build object (dictionary) from props',
  category: 'common:100',
  params: [
    {id: 'props', type: 'prop[]', mandatory: true, sugar: true}
  ],
  impl: (ctx, {}, {props}) => Object.fromEntries((props || []).map(p=>[p.name, toJstype(p.val(ctx),p.type)]))
})

Data('dynamicObject', {
  type: 'data',
  description: 'process items into object properties',
  params: [
    {id: 'items', mandatory: true, as: 'array'},
    {id: 'propertyName', mandatory: true, as: 'string', dynamic: true},
    {id: 'value', mandatory: true, dynamic: true}
  ],
  impl: (ctx, {}, {items, propertyName, value}) =>
    items.reduce((obj,item)=>({ ...obj, [propertyName(ctx.setData(item))]: value(ctx.setData(item)) }),{})
})

Data('objFromVars', {
  params: [
    {id: 'Vars', type: 'data[]', mandatory: true, as: 'array', description: 'names of vars'},
  ],
  impl: (ctx, {}, {vars}) => vars.reduce((acc,id)=>({ ...acc, [id]: ctx.vars[id] }),{})
})

Data('selectProps', {
  description: 'pick, extract properties from object',
  params: [
    {id: 'propNames', type: 'data[]', mandatory: true, as: 'array', description: 'names of properties'},
    {id: 'ofObj', type: 'data', defaultValue: '%%'},
  ],
  impl: (ctx, {}, {propNames, ofObj: obj}) => propNames.reduce((acc,id)=>({ ...acc, [id]: obj[id] }),{})
})

Data('transformProp', {
  description: 'make transformation on a single prop, leave the other props alone',
  params: [
    {id: 'prop', as: 'string', mandatory: true, description: 'property to work on'},
    {id: 'transform', as: 'string', dynamic: true, mandatory: true, description: 'prop value as input', composite: true},
    {id: 'ofObj', type: 'data', defaultValue: '%%'},
  ],
  impl: (ctx, {}, {prop, transform, ofObj: obj}) => (typeof obj == 'object' && prop) ? {...obj, [prop]: transform(ctx.setData(obj[prop])) } : obj
})

Data('extend', {
  type: 'data',
  description: 'assign and extend with calculated properties',
  params: [
    {id: 'props', type: 'prop[]', mandatory: true, defaultValue: []},
    {id: 'obj', byName: true, defaultValue: '%%'}
  ],
  impl: (ctx, {}, {properties,obj}) =>
		Object.assign({}, obj, Object.fromEntries(properties.map(p=>[p.name, toJstype(p.val(ctx),p.type)])))
})

Data('extendWithObj', {
  type: 'data',
  description: 'assign to extend with another obj',
  params: [
    { id: 'obj', mandatory: true },
    { id: 'withObj', defaultValue: '%%' }
  ],
  impl: (ctx, {}, { obj, withObj }) => Object.assign({}, withObj, obj)
})

Data('extendWithIndex', {
  type: 'data',
  aggregator: true,
  description: 'extend with calculated properties. %$index% is available ',
  params: [
    {id: 'props', type: 'prop[]', mandatory: true, defaultValue: []}
  ],
  impl: (ctx, {}, {properties}) => toArray(ctx.data).map((item,i) =>
			Object.assign({}, item, Object.fromEntries(properties.map(p=>[p.name, toJstype(p.val(ctx.setData(item).setVars({index:i})),p.type)]))))
})

const Prop = TgpType('prop','common')
Prop('prop', {
  params: [
    { id: 'name', as: 'string', mandatory: true },
    { id: 'val', dynamic: true, type: 'data', mandatory: true, defaultValue: '' },
    { id: 'type', as: 'string', options: 'string,number,boolean,object,array,asIs', defaultValue: 'asIs' }
  ]
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

Boolean('between', {
  description: 'checks if number is in range',
  params: [
    { id: 'from', as: 'number', mandatory: true },
    { id: 'to', as: 'number', mandatory: true },
    { id: 'val', as: 'number', defaultValue: '%%' }
  ],
  impl: (ctx, {}, { from, to, val }) => val >= from && val <= to
})

Boolean('gt', {
  description: '> greater than',
  params: [
    { id: 'than', as: 'number', mandatory: true, description: 'threshold value to compare against' },
    { id: 'orEquals', as: 'boolean', type: 'boolean<common>', defaultValue: false, description: 'include equals in comparison' },
    { id: 'val', as: 'number', defaultValue: '%%', description: 'value to check' }
  ],
  impl: (ctx, {}, { than, val, orEquals }) => orEquals ? val >= than : val > than
})

Boolean('lt', {
  description: '< less than',
  params: [
    { id: 'than', as: 'number', mandatory: true, description: 'threshold value to compare against' },
    { id: 'orEquals', as: 'boolean', type: 'boolean<common>', defaultValue: false, description: 'include equals in comparison' },
    { id: 'val', as: 'number', defaultValue: '%%', description: 'value to check' }
  ],
  impl: (ctx, {}, { than, val, orEquals }) => orEquals ? val <= than : val < than
})

Boolean('isNull', {
  description: 'is null or undefined',
  params: [
    {id: 'obj', defaultValue: '%%'}
  ],
  impl: (ctx, {}, {obj}) => calcValue(obj) == null
})

Boolean('notNull', {
  description: 'not null or undefined',
  params: [
    {id: 'obj', defaultValue: '%%'}
  ],
  impl: (ctx, {}, {obj}) => calcValue(obj) != null
})

Boolean('isEmpty', {
  params: [
    {id: 'item', as: 'single', defaultValue: '%%', composite: true}
  ],
  impl: (ctx, {}, {item}) => !item || (Array.isArray(item) && item.length == 0)
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

Boolean('notEquals', {
  params: [
    {id: 'item1', as: 'single', mandatory: true},
    {id: 'item2', defaultValue: '%%', as: 'single'}
  ],
  impl: (ctx, {}, {item1, item2}) => item1 != item2
})

Action('runActionOnItem', {
  params: [
    {id: 'item', mandatory: true},
    {id: 'action', type: 'action', dynamic: true, mandatory: true, composite: true}
  ],
  impl: (ctx, {}, {item, action}) => isPromise(item) ? Promise.resolve(item).then(_item => action(ctx.setData(_item))) 
    : item != null && action(ctx.setData(item))
})

Action('runActionOnItems', {
  description: 'forEach',
  params: [
    {id: 'items', as: 'array', mandatory: true},
    {id: 'action', type: 'action', dynamic: true, mandatory: true},
    {id: 'indexVariable', as: 'string' }
  ],
  impl: (ctx, {}, {items, action, indexVariable}) => items.reduce( async (pr,_item,i) => {
    await pr;
    const item = await _item
    return action(ctx.setVars({[indexVariable]: i}).setData(item))
  })
})

Action('removeProps', {
  description: 'remove properties from object',
  params: [
    {id: 'names', type: 'data[]', mandatory: true},
    {id: 'obj', byName: true, defaultValue: '%%'}
  ],
  impl: (ctx, {}, {names, obj}) => obj && names.forEach(name=> delete obj[name])
})

Action('delay', {
  moreTypes: 'data',
  params: [
    {id: 'mSec', as: 'number', defaultValue: 1},
    {id: 'res', defaultValue: '%%'}
  ],
  impl: (ctx, {}, {mSec, res}) => delay(mSec,res)
})

Data('range', {
  description: '1-10, returns a range of numbers, generator, numerator, numbers, index',
  params: [
    {id: 'from', as: 'number', defaultValue: 1},
    {id: 'to', as: 'number', defaultValue: 10}
  ],
  impl: (ctx, {}, {from, to}) => Array.from(Array(to-from+1).keys()).map(x=>x+from)
})

Data('typeOf', {
  params: [
    {id: 'obj', defaultValue: '%%'}
  ],
  impl: (ctx, {}, {obj}) => {
    const val = calcValue(obj)
    return Array.isArray(val) ? 'array' : typeof val
  }
})

Data('className', {
  params: [
    {id: 'obj', defaultValue: '%%'}
  ],
  impl: (ctx, {}, {obj}) => {
    const val = calcValue(obj);
    return val && val.constructor && val.constructor.name
  }
})

Boolean('isOfType', {
  params: [
    {id: 'type', as: 'string', mandatory: true, options: 'string,boolean,array,object,null'},
    {id: 'obj', defaultValue: '%%'}
  ],
  impl: (ctx, {}, {type, obj}) => {
    const val = calcValue(obj)
    const objType = val == null ? 'null' : Array.isArray(val) ? 'array' : typeof val
    return type.split(',').indexOf(objType) != -1
  }
})

Boolean('inGroup', {
  description: 'is in list, contains in array',
  params: [
    {id: 'group', as: 'array', mandatory: true},
    {id: 'item', as: 'single', defaultValue: '%%'}
  ],
  impl: (ctx, {}, {group, item}) => group.indexOf(item) != -1
})

Data('Switch', {
  macroByValue: false,
  params: [
    {id: 'cases', type: 'switch-case[]', as: 'array', mandatory: true, defaultValue: []},
    {id: 'default', dynamic: true}
  ],
  impl: (ctx, {}, {cases, default: defaultValue}) => {
    for(let i=0;i<cases.length;i++)
      if (cases[i].condition(ctx))
        return cases[i].value(ctx)
    return defaultValue(ctx)
  }
})

const SwitchCase = TgpType('switch-case','common')
SwitchCase('Case', {
  params: [
    {id: 'condition', type: 'boolean', mandatory: true, dynamic: true},
    {id: 'value', mandatory: true, dynamic: true}
  ]
})

Action('actionSwitch', {
  params: [
    {id: 'cases', type: 'action.switch-case[]', as: 'array', mandatory: true, defaultValue: []},
    {id: 'defaultAction', type: 'action', dynamic: true}
  ],
  macroByValue: false,
  impl: (ctx, {}, {cases, defaultAction}) => {
    for(let i=0;i<cases.length;i++)
      if (cases[i].condition(ctx))
        return cases[i].action(ctx)
    return defaultAction(ctx);
  }
})

const ActionSwitchCase = TgpType('action-switch-case','common')
ActionSwitchCase('actionSwitchCase', {
    params: [
    {id: 'condition', type: 'boolean', as: 'boolean', mandatory: true, dynamic: true},
    {id: 'action', type: 'action', mandatory: true, dynamic: true}
  ]
})

Data('getSessionStorage', {
  params: [
    {id: 'id', as: 'string'}
  ],
  impl: (ctx, {}, {id}) => sessionStorage(id)
})

Action('setSessionStorage', {
  params: [
    {id: 'id', as: 'string'},
    {id: 'value', dynamic: true}
  ],
  impl: (ctx, {}, {id, value}) => sessionStorage(id,value())
})

Data('waitFor', {
  params: [
    {id: 'check', dynamic: true},
    {id: 'interval', as: 'number', defaultValue: 14, byName: true},
    {id: 'timeout', as: 'number', defaultValue: 3000},
    {id: 'logOnError', as: 'string', dynamic: true}
  ],
  impl: (ctx, {}, {check, interval, timeout, logOnError}) => {
    if (!timeout) 
      return logError('waitFor no timeout',{ctx})
    let waitingForPromise, timesoFar = 0
    return new Promise((resolve,reject) => {
        const toRelease = setInterval(() => {
            timesoFar += interval
            if (timesoFar >= timeout) {
              clearInterval(toRelease)
              ctx.vars.commonLogger?.info?.({t: 'waitFor timeout'}, {}, {ctx})
              logOnError() && logError(logOnError() + ` timeout: ${timeout}, waitingTime: ${timesoFar}`,{ctx})
              reject('timeout')
            }
            if (waitingForPromise) return
            const v = check()
            ctx.vars.commonLogger?.info?.({t: 'waitFor check', v}, {}, {ctx})
            if (isPromise(v)) {
              waitingForPromise = true
              v.then(_v=> {
                waitingForPromise = false
                handleResult(_v)
              })
            } else {
              handleResult(v)
            }

            function handleResult(res) {
              if (res) {
                clearInterval(toRelease)
                resolve(res)
              }
            }
        }, interval)
    })
  }
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