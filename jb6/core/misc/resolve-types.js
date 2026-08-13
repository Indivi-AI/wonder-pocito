import { jb } from '@jb6/core'
const { coreUtils } = jb
const { asJbComp, astNode, OrigArgs, systemParams, jbComp, unique, asArray, isPrimitiveValue, logError, splitDslType, compByFullId } = coreUtils

export const primitivesAst = Symbol.for('primitivesAst')

Object.assign(coreUtils, {resolveProfileTypes, primitivesAst})

function calcDslType(fullId) {
    if (typeof fullId != 'string') return
    if (fullId.indexOf('<') == -1)
      logError(`util dslType not fullId ${fullId}`,{})
    return (fullId || '').split('>')[0] + '>'
}

export function resolveProfileTypes(prof, { astFromParent, expectedType, parent, parentParam, tgpModel, filePath, topComp, parentType, tgpPath = ''} = {}) {
    if (!prof || !prof.constructor || ['Object','Array'].indexOf(prof.constructor.name) == -1) return prof
    const typeFromParent = expectedType == '$asParent<>' ? (parentType || calcDslType(parent?.$$)) : expectedType
    const dynamicTypeFromParent = parentParam?.dynamicTypeFromParent?.(parent)
    const fromFullId = calcDslType(prof.$$)
    const dslType = dynamicTypeFromParent || typeFromParent || fromFullId 
    if (!dslType || dslType?.indexOf('<') == -1) debugger
    const ast = prof[astNode] || astFromParent

    const comp1 = prof.$ instanceof jbComp ? prof.$
        : resolveCompTypeWithId(prof.$$ || prof.$, tgpModel, { dslType, parent, parentParam, topComp, parentType, tgpPath })
    const comp = comp1?.[asJbComp] || comp1
    if (comp)
      prof.$$ = prof.$ instanceof jbComp ? prof.$ : `${comp.$dslType}${comp.id}`
    if (prof.$$ == 'pipeline') debugger
    if (prof.$unresolvedArgs && comp) {
      Object.assign(prof, argsToProfile(prof, comp), {[astNode]: prof[astNode]})
      if (prof.$delayed) debugger
      prof[OrigArgs] = prof.$unresolvedArgs
      delete prof.$unresolvedArgs
    }

    if (Array.isArray(prof)) {
      prof[primitivesAst] = Object.fromEntries(prof.map( (val,i) => isPrimitiveValue(val) && [i,ast?.elements[i]]).filter(Boolean))
      prof.forEach((v,i) =>resolveProfileTypes(v, { 
        astFromParent: prof[primitivesAst][i], expectedType: dslType, parent, parentParam, topComp, tgpModel, filePath, parentType, tgpPath: [tgpPath,i].join('~')}))
    } else if (comp && prof.$ != 'asIs') {
      ;[...(comp.params || []), ...systemParams].forEach(p=> 
          resolveProfileTypes(prof[p.id], { 
            astFromParent: prof[primitivesAst]?.[p.id], expectedType: p.$dslType, parentType: dslType, parent: prof, 
            parentParam: p, topComp, tgpModel, filePath, tgpPath: [tgpPath,p.id].join('~')}))
    } else if (!comp && prof.$) {
        logError(`resolveProfile - can not resolve ${prof.$} at ${topComp && topComp.$$} ${tgpPath} expected type ${dslType || 'unknown'}`, 
            {tgpModel, filePath, compId: prof.$, prof, expectedType, dslType, topComp, parentType})
    }
    return prof
}

function argsToProfile(prof, comp) {
  const ast = prof[astNode]
  const { args, system, argsAst } = splitSystemArgs(prof.$unresolvedArgs, ast)
  if (args.length == 0) return {...system, [primitivesAst]: {}, [astNode]: ast }

  const lastArg = args[args.length-1]
  const lastArgIsByName = lastArg && typeof lastArg == 'object' && !Array.isArray(lastArg) && !lastArg.$
  const argsByValue = lastArgIsByName ? args.slice(0,-1) : args
  const propsByName = lastArgIsByName ? lastArg : {}
  const onlyByName = lastArgIsByName && args.length == 1
  const params = comp.params || []
  const param0 = params[0] || {}, param1 = params[1] || {}
  const firstParamAsArray = (param0.type||'').indexOf('[]') != -1 && !param0.byName
  const secondParamAsArray = param1.secondParamAsArray
  if (!lastArgIsByName) {
      if (firstParamAsArray)
          return extendWithSystem({[param0.id]: params.length > 1 && args.length == 1 ? args[0] : args })
      if (secondParamAsArray)
          return extendWithSystem({[param0.id]: args[0], [param1.id] : args.slice(1) })

      if (comp.macroByValue || params.length < 3)
          return extendWithSystem(Object.fromEntries(args.filter((_, i) => params[i]).map((arg, i) => [params[i].id, arg])))
  }

  const varArgs = []
  while (argsByValue[0] && jb.dsls.tgp['ctx-enricher']?.[argsByValue[0].$])
      varArgs.push(argsByValue.shift())
  const propsByValue = onlyByName ? []
      : firstParamAsArray ? { [param0.id] : argsByValue }
      : secondParamAsArray ? { [param0.id] : argsByValue[0], [param1.id] : argsByValue.slice(1) } 
      : Object.fromEntries(argsByValue.map((v,i) => [params[i].id, v]))
  return extendWithSystem({ ...(varArgs.length ? {vars: varArgs} : {}), ...propsByValue, ...propsByName })

  function extendWithSystem(ret) {
    return {...system, [primitivesAst]: Object.fromEntries(calcPrimitivesByValue()), [astNode]: ast, ...ret}
  }

  function calcPrimitivesByValue() {
    if (!lastArgIsByName) {
        if (firstParamAsArray) 
            return params.length > 1 && args.length == 1 ? [[param0.id, argsAst[0]]]
                : addVirtualArrayAst(param0.id, args.map((v,i) => [`${param0.id}~${i}`, argsAst[i]]))
        if (secondParamAsArray)  return [
            [param0.id, argsAst[0]],
            ...addVirtualArrayAst(param1.id, args.slice(1).map((v,i) => [`${param1.id}~${i}`, argsAst[i+1]]))
            ]
  
        if (comp.macroByValue || params.length < 3)
            return args.filter((_, i) => params[i]).map((arg, i) => [params[i].id, argsAst[i]])
    }
  
    const propsByValue = onlyByName ? []
        : firstParamAsArray ? argsByValue.map((v,i) => [`${param0.id}~${i}`, argsAst[i], v])
        : secondParamAsArray ? [ 
            [param0.id, argsAst[0] ,argsByValue[0]],
            ...argsByValue.slice(1).map((v,i) => [`${param1.id}~${i}`, argsAst[i+1], v])
        ]
        : argsByValue.map((v,i) => [params[i].id, argsAst[i],v])
  
    const paramsByNameAst = argsAst.filter(n=>n.type=='ObjectExpression')[0]
    const propsPrimitivesByName =  Object.entries(propsByName).filter(e=>isPrimitiveValue(e[1]))
        .map(([k,v])=> [k,paramsByNameAst.properties.find(p=>p.key.name == k || p.key.value == k).value, v])
    return [...propsByValue, ...propsPrimitivesByName].filter(v=>isPrimitiveValue(v[2])).map(x=>x.slice(0,2))
  }

  function addVirtualArrayAst(path, children) {
    if (children.length == 0) return []
    const elements = children.map(x=>x[1])
    const start = Math.min(...elements.map(x=>x.start)) -1
    const end = Math.max(...elements.map(x=>x.end)) + 1
    const node = { elements, start, end, virtualAst: true }
    return [[path, node], ...children]
  }

  function splitSystemArgs(allArgs, ast) {
    const args = [], system = {}
    allArgs.forEach(arg => {
        if (jb.dsls.tgp['ctx-enricher']?.[arg.$]) { // leading ctx-enricher (Var/setData/setVars/...) in pipeline
          system.vars = system.vars || []
          system.vars.push(arg)
        } else {
           args.push(arg)
        }
    })
    let argsAst = ast.arguments || ast.expression.arguments
    if (system.vars) {
      const elements = system.vars.map(v=>v[astNode])
      const start = Math.min(...elements.map(x=>x.start))
      const end = Math.max(...elements.map(x=>x.end))
      system.vars[astNode] = { elements, start, end, virtualAst: true }

      argsAst = argsAst.filter(n=>!elements.includes(n))
    }

    return { args, system, argsAst }
  }
}

function resolveCompTypeWithId(id, tgpModel, {dslType, silent, parentParam, parent, topComp, parentType, tgpPath, dsl} = {}) {
  if (!id) return
  const dsls = tgpModel.dsls
  if (dslType == 'comp<tgp>')
    return dsls.tgp.tgpComp
  if (dslType) {
    const [type, dsl] = splitDslType(dslType)
    const res = dsls[dsl||'common']?.[type]?.[id]
    if (res) 
      return res[asJbComp] || res
  }

  if (dsls.tgp.any[id])
    return dsls.tgp.any[id]

  if (id.indexOf('<') != -1) {
    const res = compByFullId(id, tgpModel)
    if (res) return res
  }

  const typeFromParent = parentParam?.$dslType == '$asParent<tgp>' && parentType // parentParam?.typeAsParent === true && parentType
  const dynamicTypeFromParent = typeof parentParam?.dynamicTypeFromParent == 'function' && parentParam.dynamicTypeFromParent(parent)
  const byTypeRules = [dynamicTypeFromParent,typeFromParent,dslType].filter(x=>x).join(',').split(',').filter(x=>x)
    .flatMap(t=>moreTypesByTypeRules(t)).join(',')

  const allTypes = unique([byTypeRules,dynamicTypeFromParent,typeFromParent,dslType].filter(x=>x).join(',').split(',').filter(x=>x))
  const shortId = id.split('>').pop()
  const fromAllTypes = allTypes.map(dslType => {
    const [type, dsl] = splitDslType(dslType)
    return dsls[dsl||'common']?.[type]?.[shortId]
  }).find(x=>x)
  if (fromAllTypes)
    return fromAllTypes

  if (id && !silent) {
    const error = `can not find comp ${id} of type ${dslType} in path ${tgpPath}`
    globalThis.showUserMessage && globalThis.showUserMessage('error', error)
    logError(error,{id, tgpModel, topComp, parent, parentType, allTypes, dslType})
    throw { syntaxError: error }
  }

  function moreTypesByTypeRules(type) {
    // isOf: ['boolean<common>','data<common>'] data -> boolean
    // same: ['data<common>', 'data<llm>']
    // isOfWhenEndsWith: ['-feature<>','feature<>']
    // isOfWhenEndsWith: ['-style<>',[ 'feature<>', 'style<>' ]]
    const _typeRules = tgpModel?.typeRules || []

    return _typeRules.flatMap(rule=> asArray(
        rule.isOf && type == rule.isOf[0] ? rule.isOf[1]
        : rule.same && type == rule.same[0] ? rule.same[1]
        : rule.same && type == rule.same[1] ? rule.same[0]
        : rule.isOfWhenEndsWith && type.endsWith(rule.isOfWhenEndsWith[0]) && rule.isOfWhenEndsWith[0] != type ? rule.isOfWhenEndsWith[1]
        : []))          
  }
}
