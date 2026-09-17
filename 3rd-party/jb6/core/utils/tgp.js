import { jb } from '@jb6/repo'
import './core-utils.js'
const { coreUtils } = jb
const { asJbComp, resolveProfileTop, jbComp, jbCompProxy, splitDslType, Ctx, asArray, isPromise, logError, enrichCtxWithDataContext, compByFullId } = coreUtils

Object.assign(coreUtils, { globalsOfType, globalsOfTypeIds, toCapitalType, findCompDefById, CompDefByDslType, callerCompId, parseCompFieldModifier, getCompField })

function Component(id, comp) {
  const {type} = comp
  let [_type,_dsl] = ['data','common']
  if (type && type.indexOf('<') != -1)
    [_type, _dsl] = splitDslType(type)
  try {
    return jb.dsls[_dsl][toCapitalType(_type)](id,comp)
  } catch(error) {
    console.error(`error while defining comp ${id}`,error.stack)
  }
}  

const CompDef = comp => jbCompProxy(new jbComp(resolveProfileTop(comp)))

const tgpComp = CompDef({ // bootstraping
  dsl: 'tgp',
  type: 'comp',
  id: 'tgpComp',
  params: [
    {id: 'id', as: 'string', mandatory: true},
    {id: 'type', as: 'string', byName: true},
    {id: 'dsl', as: 'string'},
    {id: 'moreTypes', as: 'string'},
    {id: 'macroByValue', as: 'boolean'},
    {id: 'description', as: 'string'},
    {id: 'whenToUse', as: 'text'},
    {id: 'HeavyTest', as: 'boolean' },
    {id: 'aggregator', as: 'boolean' },
    {id: 'doNotRunInTests', as: 'boolean' },
    {id: 'nodeOnly', as: 'boolean' },
    {id: 'circuit', as: 'string' },
    {id: 'params', type: 'param[]'},
    {id: 'impl', type: '$asParent<tgp>', mandatory: true }
  ]
})

Object.assign(jb.dsls.tgp, { TgpType, TgpTypeModifier, DefComponents, tgpComp, ProfileTemplate: Component, Component })

function TgpTypeModifier(id, extraCompProps, tgpModel = jb) {
  return TgpType(extraCompProps.type, extraCompProps.dsl, {modifierId: id, ...extraCompProps}, tgpModel)
}

const nsProxy = (ns) => new Proxy(() => 0, {
  get: (o,id) => {
    const res = (...args) => ({ $: '__', $delayed: () => {
      const comp = jb.nsRepo[ns][id]
      if (!comp) {
        debugger
        logError(`delayed ns profile. can not find profile ${ns}.${id}`)
        return `missing ${ns}.${id}`
      }
      return comp(...args) 
    }} )
    res.$run = (...args) => new Ctx().run(res(...args))
    return res
  }
})

const forwardProxy = (dsl,type,id) => new Proxy(() => 0, {
  get: (o,p) => {
    const comp = jb.dsls[dsl]?.[type]?.[id]
    if (!comp) {
      logError(`delayed forward profile. can not find profile ${type}<${dsl}>${id}`)
      return 'missing ${type}<${dsl}>${id}'
    }
    if (p == '$run')
      return (...args) => comp.$run(...args) 
    
    return p === asJbComp && comp[asJbComp]
  },
  apply: () => (...args) => ({ $: '__', $delayed: () => {
      const comp = jb.dsls[dsl]?.[type]?.[id]
      if (!comp) {
        logError(`delayed forward profile. can not find profile ${type}<${dsl}>${id}`)
        return 'missing ${type}<${dsl}>${id}'
      }
      return comp(...args) 
    }})
})

function toCapitalType(type) {
  return type.replace(/-(.)/g, (_, letter) => letter.toUpperCase()).replace(/^./, c => c.toUpperCase())
}

function TgpType(type, dsl, extraCompProps, tgpModel = jb) {
  const {ns, dsls, nsRepo} = tgpModel
  const capitalLetterId = extraCompProps?.modifierId || toCapitalType(type)
  dsls[dsl] = dsls[dsl] || {}
  if (dsls[dsl][capitalLetterId])
    return dsls[dsl][capitalLetterId]

  const dslType = `${type}<${dsl}>`
  const { demoProfile, isCircuit, probeExec, typescript, defaultImpl, ...compProps } = extraCompProps || {}
  const tgpType = (arg0,arg1) => {
    let [id,comp] = ['',null]
    if (typeof arg0 == 'string')
     [id,comp] = [arg0,arg1]
    else
      comp = arg0

    tgpType[id] = Component({...comp, id, dsl, type, ...compProps, impl: comp.impl ?? defaultImpl})
    ;[type, ...(comp.moreTypes||'').split(',')].filter(x=>x).forEach(typeInStr=> {
      let [_type,_dsl] = [typeInStr,dsl]
      if (typeInStr.indexOf('<') != -1)
        [_type, _dsl] = splitDslType(typeInStr)
      dsls[_dsl][_type][id] = tgpType[id]
    })
    if (id.split('.').length > 1) {
      const [_ns, innerName] = id.split('.')
      // ns[_ns] = ns[_ns] || {}
      // ns[_ns][innerName] = tgpType[id]

      ns[_ns] = ns[_ns] || nsProxy(_ns)
      nsRepo[_ns] = nsRepo[_ns] || {}
      nsRepo[_ns][innerName] = tgpType[id]
    }
    return tgpType[id]
  }

  const forward = id => forwardProxy(dsl,type,id)
  Object.assign(tgpType, {capitalLetterId, type, dsl, dslType, forward, coerce: extraCompProps?.coerce, demoProfile, isCircuit, probeExec, typescript})
  dsls[dsl][type] = dsls[dsl][type] || {}
  dsls[dsl][capitalLetterId] = tgpType
  return tgpType

  function Component(comp) {
    comp.$ = tgpComp[asJbComp]
    comp.$location = comp.$location || calcSourceLocation(new Error().stack.split(/\r|\n/)) || {}
    return CompDef(comp)
  }  
}

// meta tgp
const Any = TgpType('any','tgp')
// ctx-enricher RT interface: impl is (ctx, {}, args) => Ctx — given the current ctx, return a new enriched ctx
// (build it via enrichCtxWithDataContext(ctx, {vars, data}), or return ctx as-is). enrichers chain: each receives
// the previous one's ctx. compose a list with enrichCtx; run one via ctx.run(enricher) -> enriched ctx.
// coerce: a raw array in a single ctx-enricher slot folds into one enrichCtx (whose enrichers is ctx-enricher<tgp>[], so it is not re-coerced)
TgpType('ctx-enricher','tgp', { coerce: e => Array.isArray(e) ? jb.dsls.tgp['ctx-enricher'].enrichCtx(e) : e })
TgpType('comp','tgp')
TgpType('param','tgp')

Component('param', {
  type: 'param<tgp>',
  params: [
    {id: 'id', as: 'string', mandatory: true},
    {id: 'type', as: 'string', description: 'type or type<dsl> e.g. control,control[],control<ui>'},
    {id: 'description', as: 'string'},
    {id: 'as', as: 'string', options: 'string,text,number,boolean,ref,single,array'},
    {id: 'dynamic', as: 'boolean' },
    {id: 'mandatory', as: 'boolean' },
    {id: 'composite', as: 'boolean' },
    {id: 'defaultValue', dynamicType: '%type%'},
    {id: 'byName', as: 'boolean'},
    {id: 'asIs', as: 'boolean', description: 'do not evaluate expressions'},
    {id: 'dynamicTypeFromParent', as: 'string'},
    {id: 'secondParamAsArray', as: 'boolean'},
    {id: 'newLinesInCode', as: 'boolean'},
    {id: 'importance', as: 'text'},
    {id: 'guidance', as: 'text'},
  ]
})

Component('Var', {
  type: 'ctx-enricher<tgp>',
  params: [
      {id: 'name', as: 'string', mandatory: true},
      {id: 'val', dynamic: true, type: 'data', mandatory: true, defaultValue: '%%'},
  ],
  impl: (ctx,{},{name,val}) => enrichCtxWithDataContext(ctx, { vars: { [name]: val(ctx) } })
})

Component('setVar', {
  type: 'ctx-enricher<tgp>',
  params: [
      {id: 'name', as: 'string', mandatory: true},
      {id: 'val', dynamic: true, type: 'data', mandatory: true, defaultValue: '%%'},
  ],
  impl: (ctx,{},{name,val}) => enrichCtxWithDataContext(ctx, { vars: { [name]: val(ctx) } })
})

Component('setVars', {
  type: 'ctx-enricher<tgp>',
  params: [
    {id: 'obj', dynamic: true}
  ],
  impl: (ctx,{},{obj}) => enrichCtxWithDataContext(ctx, { vars: obj(ctx) })
})

Component('sameCtx', {
  type: 'ctx-enricher<tgp>',
  impl: ctx => ctx
})

Component('setData', {
  type: 'ctx-enricher<tgp>',
  params: [
    {id: 'val', dynamic: true}
  ],
  impl: (ctx,{},{val}) => enrichCtxWithDataContext(ctx, { data: val(ctx) })
})

Component('enrichCtx', {
  type: 'ctx-enricher<tgp>',
    params: [
    {id: 'enrichers', type: 'ctx-enricher<tgp>[]', dynamic: true }
  ],
  impl: (ctx, {}, { enrichers }) =>
    asArray(enrichers.profile).flat().reduce((res, e) =>
        isPromise(res) ? res.then(c => c.run(e)) : res.run(e)
    , ctx)
})

// common dsl
const Data = TgpType('data','common')
const Action = TgpType('action','common')

TgpType('boolean','common')
TgpType('reactive-source','rx') // callbag api
TgpType('reactive-operator','rx') // callbag api

// ── comp-field: a declared list metadata field of comps. Contributions are comps named '<cmpId>#<fieldId>[#<order>]'
// of the field's element type, plus the inline '<comp>[fieldId]'. harvested+ordered by getCompField, which returns
// the contribution profiles (the consumer decides how to run them).
const CompField = TgpType('comp-field','tgp')
CompField('compField', { params: [{id: 'type', as: 'string'}] })

// sampleCtx: sample ctx-enrichers used to exercise a comp (e.g. in probe/usages)
CompField('sampleCtx', { impl: { $: 'comp-field<tgp>compField', type: 'ctx-enricher<tgp>[]' } })

function parseCompFieldModifier(id) {
  const [base, field, order] = id.split('#')
  return { base, field, order: order ? +order : undefined }
}

// getCompField(cmpId, fieldId, dtCtx): the inline '<comp>[fieldId]' + ordered '<cmpId>#<fieldId>' contribution profiles. throws if field undeclared.
function getCompField(cmpId, fieldId, dtCtx = new Ctx()) {
  const decl = jb.dsls.tgp['comp-field'][fieldId]?.[asJbComp]
  if (!decl) throw new Error(`getCompField: undeclared field '${fieldId}'`)
  const elemType = decl.impl.type.replace(/\[\]/g, '')
  const [t, d] = elemType.includes('<') ? splitDslType(elemType) : []   // primitive element type (e.g. 'string') has no comp #-contributions
  const shortId = cmpId.split('>').pop()
  const external = !d ? [] : Object.entries(jb.dsls[d][t])
    .filter(([id]) => id.includes('#'))
    .map(([id]) => ({ id, m: parseCompFieldModifier(id) }))
    .filter(({ m }) => m.base === shortId && m.field === fieldId)
    .sort((a, b) => (a.m.order ?? Infinity) - (b.m.order ?? Infinity))
    .map(({ id }) => jb.dsls[d][t][id][asJbComp].impl)
  return [...asArray(compByFullId(cmpId, jb)?.[fieldId]), ...external]
}

function DefComponents(items,def) { items.split(',').forEach(item=>def(item)) } // 'templateParam' must be used as param name

function calcSourceLocation(errStack) {
  try {
      const takeOutHostNameAndPort = /https?:\/\/[^\/:]+(:\d+)?\//
      const line = errStack.map(x=>x.trim().replace(takeOutHostNameAndPort,'/'))
          .filter(x=>x && !x.match(/^Error/) && !x.match(/tgp.js/)).shift()
      const location = line ? (line.split('at ').pop().split('eval (').pop().split(' (').pop().match(/\\?([^:]+):([^:]+):[^:]+$/) || ['','','','']).slice(1,3) : ['','']
      location[0] = location[0].split('?')[0].replace(/^\/\/\//,'/')
      const path = location[0]
      return { path, line: location[1] }
  } catch(e) {
    console.log(e)
  }      
}

function filterGlobal(comp, filter) { // all, pts, profiles
  if (!comp?.[asJbComp]) return
  filter = filter || 'profiles'
  const hasParams = (comp[asJbComp]?.params || []).length
  return filter == 'all' || (filter == 'profiles' && !hasParams) || filter == 'pts' && hasParams
}

function globalsOfTypeIds(tgpType, filter) { 
  return Object.entries(tgpType).filter(e => filterGlobal(e[1], filter)).map(e=>e[0])
}

function globalsOfType(tgpType, ctx, filter) {
  return Object.entries(tgpType).filter(e => filterGlobal(e[1], filter)).map(([id,val]) => ({id, ...val.$runWithCtx(ctx)}))
}

function callerCompId(jbCtx) {
  return (jbCtx.lexicalParentPath.match(/>([^~]+)/) || [])[1] || null
}

function findCompDefById({id, tgpModel, dslType}) {
  return Object.values(tgpModel.dsls).flatMap(dsl=>Object.values(dsl)).find(t=>t.capitalLetterId == id && (!dslType || dslType == t.dslType))
}

function CompDefByDslType({dslType, tgpModel, filePath}) {
  if (!filePath) {
    const dsl = dslType.match(/<([^.>]*)>/)[1]
    return Object.entries(tgpModel.dsls[dsl]).find(x=>x[1]?.dslType == dslType)?.[0]
  }

  return Object.entries(tgpModel.compDefsByFilePaths[filePath]).find(x=>x[1]?.dslType == dslType)?.[0]
}

Data('asIs', {
  params: [
    {id: 'val', ignore: true}
  ],
  impl: ({},{},{val}) => val
})


Any('If', {
  macroByValue: true,
  params: [
    {id: 'condition', as: 'boolean', mandatory: true, dynamic: true, type: 'boolean'},
    {id: 'then', type: '$asParent', dynamic: true, composite: true},
    {id: 'Else', type: '$asParent', dynamic: true}
  ],
  impl: ({}, {}, { condition, then, Else}) => condition() ? then() : Else()
})

Any('typeAdapter', {
  params: [
    {id: 'fromType', as: 'string', mandatory: true, description: 'e.g. type1<myDsl>'},
    {id: 'val', dynamicTypeFromParent: 'fromType', mandatory: true}
  ],
  impl: (ctx, {}, {val}) => val
})

Any('TBD', {
  hidden: true,
  impl: 'TBD'
})

Any('runCtx', {
  type: 'any',
  hidden: true,
  params: [
    {id: 'path', as: 'string'},
    {id: 'Vars'},
    {id: 'profile'}
  ]
})

Action('runActions', {
  params: [
    { id: 'actions', type: 'action[]', dynamic: true, composite: true, mandatory: true }
  ],
  impl: async (ctx, {}, { actions }) => {
    const list = asArray(actions.profile)
    for (let i = 0; i < list.length; i++) {
      await ctx.runInnerArg(actions, i)
    }
  }
})

// Action('writeValue', {
//   params: [
//     {id: 'to', as: 'ref', mandatory: true},
//     {id: 'value', mandatory: true},
//   ],
//   impl: (ctx,to,value) => {
//     const val = calcValue(value)
//     if (isPromise(val))
//       return Promise.resolve(val).then(_val=>jb.dbUtils?.writeValue(to,_val,ctx))
//     else
//       jb.dbUtils?.writeValue(to,val,ctx)
//   }
// })
