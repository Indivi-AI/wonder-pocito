import { jb } from '@jb6/repo'
import './core-utils.js'
const { coreUtils } = jb
const { logError, isRefType, resolveFinishedPromise, toString, toNumber, RT_types, calcValue } = coreUtils

const isRef = v => jb.dbUtils?.isRef(v)
const objHandler = v => jb.dbUtils ? jb.dbUtils.objHandler(v) : null

Object.assign(coreUtils, {calcExpression: calc, calcVar, calcBool, embedBraceVars })

const { consts } = jb.coreRegistry

function calcVar(varname, ctx) {
    if (jb.dbUtils)
        return jb.dbUtils.calcVar(varname,ctx)
    const { jbCtx: { args }} = ctx  
    return resolveFinishedPromise(doCalcVar())

    function doCalcVar() {
        if (args && args[varname] != undefined) return args[varname]
        if (ctx.vars[varname] != undefined) return ctx.vars[varname] 
        if (consts[varname] != undefined) return consts[varname]
    }
}

function calc(_exp, ctx, overrideParentParam ) {
  const { jbCtx : {parentParam: ctxParentParam }, vars: { stringsOrigins, doNotCalcExpression } } = ctx
  if (doNotCalcExpression)
    return _exp
  const parentParam = overrideParentParam || ctxParentParam
  const jstype = parentParam?.ref ? 'ref' : parentParam?.as
  let exp = '' + _exp
  if (jstype == 'boolean' || parentParam?.type?.startsWith('boolean')) 
    return calcBool(exp, ctx, parentParam)
  if (exp.indexOf('$debugger:') == 0) {
    debugger
    exp = exp.split('$debugger:')[1]
  }
  if (exp.indexOf('$track:') == 0) {
    exp = exp.split('$track:')[1]
    const res = doCalc(exp, ctx, overrideParentParam)
    if (stringsOrigins) {
      stringsOrigins[res] = stringsOrigins[res] || []
      stringsOrigins[res].push({ ctx, exp, overrideParentParam })
    }
    return res
  }

  const res = doCalc(exp, ctx, overrideParentParam)
  return res
}

function doCalc(exp, ctx, parentParam ) {
    if (exp.indexOf('%') == -1 && exp.indexOf('{') == -1) return exp
    if (exp == '{%%}' || exp == '%%')
        return expPart('')
  
    if (exp.lastIndexOf('{%') == 0 && exp.indexOf('%}') == exp.length-2) // just one exp filling all string
      return expPart(exp.substring(2,exp.length-2))
  
    exp = exp.replace(/{%(.*?)%}/g, (match,contents) => toString(expPart(contents,{ as: 'string'})))
    exp = exp.replace(/{\?(.*?)\?}/g, (match,contents) => toString(conditionalExp(contents)))
    if (exp.match(/^%[^%;{}\s><"']*%$/)) // must be after the {% replacer
      return expPart(exp.substring(1,exp.length-1))
  
    exp = exp.replace(/%([^%;{}\s><"']*)%/g, (match,contents) => toString(expPart(contents,{as: 'string'})))
    return exp

    function expPart(expressionPart, _parentParam) {
      return resolveFinishedPromise(evalExpressionPart(expressionPart,ctx, _parentParam || parentParam))
    }

    function conditionalExp(exp) {
      // check variable value - if not empty return all exp, otherwise empty
      const match = exp.match(/%([^%;{}\s><"']*)%/)
      if (match && toString(expPart(match[1], { as: 'string' })))
        return calc(exp, ctx, { as: 'string' })
      else
        return ''
    }   
}


function evalExpressionPart(expressionPart, ctx, calculatedParentParam ) {
    const jstype = calculatedParentParam?.ref ? 'ref' : calculatedParentParam?.as
    // example: %$person.name%.
  
    const parts = expressionPart.split(/[./[]/)
    return parts.reduce((input,subExp,index)=>pipe(input,subExp,index == parts.length-1,index == 0),ctx.data)
  
    function pipe(input,subExp,last,first,invokeFunc) {
      if (subExp == '')
         return input
      if (subExp.match(/]$/))
        subExp = subExp.slice(0,-1)
  
      const refHandler = objHandler(input)
      if (subExp.match(/\(\)$/))
        return pipe(input,subExp.slice(0,-2),last,first,true)
      if (first && subExp.charAt(0) == '$' && subExp.length > 1) {
        const ret = calcVar(subExp.substr(1), ctx, {isRef: isRefType(last && jstype)})
        // const _ctx = ret.lexicalCtx ? { data: ctx.data, vars: ctx.vars, jbCtx: ret.lexicalCtx } : ctx
        //const _ctx = ctx // TODO: fix it. ret && ret.runCtx ? new jb.core.JBCtx(ctx, { cmpCtx: ret.runCtx, forcePath: ret.srcPath}) : ctx
        return typeof ret === 'function' && invokeFunc ? ret(ctx) : ret
      }
      const obj = calcValue(input)
      if (subExp == 'length' && obj && typeof obj.length == 'number')
        return obj.length
      if (Array.isArray(obj) && isNaN(Number(subExp)))
        return [].concat.apply([],obj.map(item=>pipe(item,subExp,last,false,refHandler)).filter(x=>x!=null))
  
      if (input != null && typeof input == 'object') {
        if (obj == null) return
        if (typeof obj[subExp] === 'function' && (invokeFunc || obj[subExp].profile && parentParam && parentParam.dynamic)) {
          return obj[subExp](ctx)
        }
        if (subExp.match(/\(\)$/)) {
          const method = subExp.slice(0,-2)
          return typeof obj[method] == 'function' && obj[method]()
        }
        if (subExp.match(/^@/) && obj.getAttribute)
            return obj.getAttribute(subExp.slice(1))
        if (isRefType(jstype)) {
          if (last)
            return refHandler.objectProperty(obj,subExp,ctx)
          if (obj[subExp] === undefined)
            obj[subExp] = implicitlyCreateInnerObject(obj,subExp,refHandler)
        }
        if (last && jstype)
            return RT_types[jstype](obj[subExp])
        return obj[subExp]
      }
    }
}

let expressionLogger   // lazy: ensureLoggers isn't ready at module-eval; this fn runs only at expression runtime
function implicitlyCreateInnerObject(parent,prop,refHandler) {
    expressionLogger = expressionLogger || coreUtils.ensureLoggers?.('expressionLogger').vars.expressionLogger
    expressionLogger?.info?.({t: 'innerObject created', parent, prop, refHandler})
    parent[prop] = {}
    refHandler?.refreshMapDown && refHandler.refreshMapDown(parent)
    return parent[prop]
}

function calcBool(exp, ctx, parentParam) {
    if (exp.indexOf('$debugger:') == 0) {
      debugger
      exp = exp.split('$debugger:')[1]
    }
    if (exp.indexOf('$log:') == 0) {
      const calculated = calc(exp.split('$log:')[1],ctx, {as: 'boolean'})
      const result = calcBool(exp.split('$log:')[1], ctx)
      console.log(result, calculated, ctx)
      return result
    }
    if (exp.indexOf('!') == 0)
      return !calcBool(exp.substring(1), ctx)
    const parts = exp.match(/(.+)(==|!=|<|>|>=|<=|\^=|\$=)(.+)/)
    if (!parts) {
      const ref = calc(exp, ctx, {as: parentParam?.ref ? 'ref' : 'string'})
      if (isRef(ref))
        return ref
      
      const _val = toString(ref)
      if (typeof _val == 'boolean') return _val
      const asString = toString(_val)
      return !!asString && asString != 'false'
    }
    if (parts.length != 4)
      return logError('invalid boolean expression: ' + exp, {ctx})
    const op = parts[2].trim()
  
    if (op == '==' || op == '!=' || op == '$=' || op == '^=') {
      let [p1, p2] = [doCalcString(parts[1]), doCalcString(parts[3])]
      p2 = (p2.match(/^["'](.*)["']/) || ['',p2])[1] // remove quotes
      if (op == '==') return p1 == p2
      if (op == '!=') return p1 != p2
      if (op == '^=') return p1.lastIndexOf(p2,0) == 0 // more effecient
      if (op == '$=') return p1.indexOf(p2, p1.length - p2.length) !== -1
    }
  
    const [p1,p2] = [doCalcNumber(parts[1]), doCalcNumber(parts[3])]
  
    if (op == '>') return p1 > p2
    if (op == '<') return p1 < p2
    if (op == '>=') return p1 >= p2
    if (op == '<=') return p1 <= p2
  
    function trim(str) {  // trims also " and '
      return str.trim().replace(/^"(.*)"$/,'$1').replace(/^'(.*)'$/,'$1')
    }

    function doCalcString(exp) {
        return toString(calc(trim(exp), ctx, {as: 'string'} ))
    }
    function doCalcNumber(exp) {
        return toNumber(calc(trim(exp), ctx, {as: 'number'}))
    }
}

function embedBraceVars(text, ctx) {
    return String(text).replace(/\{%(.*?)%\}/g, (_, e) => ctx.exp(`{%${e}%}`, 'string'))
}
