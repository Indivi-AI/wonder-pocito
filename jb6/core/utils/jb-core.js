/*
profile can be:
    string - potentialy a template with %$var1% %$param1%
    json - { $$: 'fullCompId', ...params}
    (ctx,vars, args) => 
    [] of profiles

comp
    {id, type, params, impl: profile}

running a profile means
1. resolving its params *in the runtime context* into args
2. calling the profile with the args, the default behavior of profile run is just to return the args

ctx is { data, vars } that can be used in extend during RT
jbCtx { path, stack, compCtx, argsCtxs}

TGP stands for Types, Generic Classes, and profiles.
Generic classes and global profiles are implemented by comp. any comps and profile should have a type.
Types are implemented as prefixes and specialized comp functions that set the types.
DataFunc and Action are core types in the '' dsl
types are organized in DSLs.
so a full comp id is in the format: type<dsl>id

dynamic function 'hold' and keeps the args until called by client with ctx. it has the lexical jbCtx, the lexical ctx and the dynamic ctx to merge.
}
*/
import { jb } from '@jb6/repo'
import './core-utils.js'

const { RT_types, resolveCompArgs, resolveProfileArgs, asComp, calcExpression, isPromise, asArray, waitForInnerElements, logError } = jb.coreUtils

function run(profile, ctx = new Ctx(), settings = {}) {
    // changing context with data and vars
    resolveDelayed(profile)
    if (profile.vars != null && !settings.resolvedCtx)
        ctx = applyCtxEnrichers(profile.vars, ctx, settings)
    if (isPromise(ctx)) // handling a-synch vars
        return ctx.then(resolvedCtx => run(profile,resolvedCtx,{...settings, resolvedCtx: true}))
    delete settings.resolvedCtx
    const { jbCtx } = ctx
    if (profile.data != null)
        ctx = ctx.setData(run(profile.data, ctx.setJbCtx(jbCtx.innerParam({id: 'data'}, profile)), settings))

    let res = profile

    if (typeof profile == 'string')
        res = toRTType(jbCtx.parentParam, calcExpression(profile, ctx))
    else if ((jbCtx.parentParam?.type || '').indexOf('[]') != -1 && Array.isArray(profile)) // array param
        res = profile.flatMap((p,i) => run(p, ctx.setJbCtx(jbCtx.innerArrayPath(i)), settings))
    else if (profile && profile.$) {
        const comp = asComp(profile.$) // also lazy resolve
        const compArgs = Object.fromEntries(comp.calcParams().map(p =>[p.id, p.resolve(profile, ctx.setJbCtx(ctx.jbCtx.innerParam(p, profile)), settings)]))
        if (comp.impl == null) return compArgs
        if (typeof comp.impl == 'function')
            comp.impl.compFunc = true
        res = run(comp.impl, ctx.setJbCtx(ctx.jbCtx.newComp(comp,compArgs)), settings)
    } else if (typeof profile == 'function' && profile.compFunc)
        res = profile(ctx, ctx.vars, jbCtx.args)
    else if (typeof profile == 'function')
        res = profile(ctx, ctx.vars, jbCtx.args)
    
    if (jbCtx.probe && res !== profile)
        jbCtx.probe.record(ctx, res, ctx.data, ctx.vars)
    return res
}

function applyCtxEnrichers(enrichers, ctx, settings) {
    const callerJbCtx = ctx.jbCtx   // enrichers only add vars/data, not a new lexical frame
    const { path } = callerJbCtx
    const restore = c => c.setJbCtx(callerJbCtx)
    const enriched = asArray(enrichers).reduce((ctx, e, i) =>
        isPromise(ctx)
            ? ctx.then(c => run(e, c.setJbCtx(new JBCtx({...c.jbCtx, path: `${path}~vars~${i}`})), settings))
            : run(e, ctx.setJbCtx(new JBCtx({...ctx.jbCtx, path: `${path}~vars~${i}`})), settings)
    , ctx)
    return isPromise(enriched) ? enriched.then(restore) : restore(enriched)
}

function toRTType(parentParam, value) {
    const convert = RT_types[parentParam?.as]
    const val = waitForInnerElements(value,{passRx: true})
    if (convert) {
        if (isPromise(val))
            return val.then(res=>convert(res))
        return convert(value)
    }
    return value
}

function resolveDelayed(profile) {
    if (profile?.$delayed) {
        Object.assign(profile, profile.$delayed())
        delete profile.$delayed
        resolveProfileArgs(profile)
    }
    return profile
}

class JBCtx {
    constructor(jbCtx = {}) {
        Object.assign(this,jbCtx)
    }
    innerDataPath(path) {
        return new JBCtx({...this, path: `${this.path}~${path}`, parentParam: {$type: 'data<common>'}, profile: 'data path' })
    }
    innerArrayPath(index) {
        return new JBCtx({...this, path: `${this.path}~${index}`, profile: this.profile[index] })
    }
    innerParam(parentParam, profile) {
        return new JBCtx({...this, path: `${this.path}~${parentParam.id}`, parentParam, profile: profile[parentParam.id]})
    }
    paramDefaultValue(path, parentParam) {
        return new JBCtx({...this, lexicalStack: [...(this.lexicalStack || []), this.path, path], path, parentParam, profile: parentParam.defaultValue})
    }
    callCtx(dynamicCtx) {
        return new JBCtx({...this, dynamicStack: [...(this.dynamicStack||[]), dynamicCtx]})
    }
    get lexicalParentPath() { return this.lexicalStack?.[this.lexicalStack.length - 1] || '' }
    newComp(comp, args) {
        return new JBCtx({...this,
            path: `${comp.$dslType}${comp.id}~impl`,
            lexicalStack: [...(this.lexicalStack || []), this.path],
            args
        })
    }
}

class Ctx {
    constructor({data,vars = {}, jbCtx = new JBCtx()} = {}) {
        this.data = data
        this.vars = vars
        this.jbCtx = jbCtx
    }
    setData(data) {
        return new Ctx({data,vars: this.vars, jbCtx: this.jbCtx})
    }
    setVars(vars) {
        return new Ctx({data: this.data, vars: {...this.vars, ...vars}, jbCtx: this.jbCtx})
    }
    setJbCtx(jbCtx) {
        return new Ctx({data: this.data, vars: this.vars, jbCtx})
    }
    run(profile) {
        resolveDelayed(profile)
        return run(resolveProfileArgs(profile),this)
    }
    exp(exp,jstype) { 
        return calcExpression(exp, this.setJbCtx(new JBCtx({...this.jbCtx, parentParam: {as: jstype}}))) 
    }
    runInnerArg(arg, arrayIndex) {
        return arg(this, arrayIndex)
    }
    dataObj(out,vars,input) { 
        if (this.jbCtx.probe)
            this.jbCtx.probe.record(this, null, input, this.vars)
    
        return {data: out, vars: vars || this.vars} 
    }
}

class jbComp {
    constructor(compData) {
        Object.assign(this, compData)
    }
    calcParams() {
        this._params = this._params || (this.params || []).map(p=>new paramRunner(p, this.id))
        return this._params
    }
    runProfile(profile, ctx = new Ctx(), settings) {
        const compArgs = Object.fromEntries(this.calcParams().map(p =>[p.id, p.resolve(profile, ctx.setJbCtx(ctx.jbCtx.innerParam(p, profile)), settings)]))
        if (this.impl == null) return compArgs
        if (typeof this.impl == 'function')
            this.impl.compFunc = true
        if (!this?.$resolvedInner)
            resolveCompArgs(this)
        return run(this.impl, ctx.setJbCtx(ctx.jbCtx.newComp(this,compArgs)), settings)
    }
}

class paramRunner {
    constructor(_param,compFullPath) {
        Object.assign(this,_param)
        this.path = `${compFullPath}~params~${_param.id}`
    }
    resolve(profile, lexicalCtx, settings) {
        if (this.asIs == true) return toRTType(this, profile[this.id])
        const doResolve = ctxToUse => {
            const innerProfile = ctxToUse.jbCtx.profile
            const value = innerProfile == null && this.defaultValue == null ? null 
                : innerProfile == null && this.defaultValue != null ? run(this.defaultValue, 
                    ctxToUse.setJbCtx(ctxToUse.jbCtx.paramDefaultValue(`${this.path}~defaultValue`, this)), settings )
                : run(innerProfile, ctxToUse, settings )
            return toRTType(this, value)
        }
        const lexicalProfile = lexicalCtx.jbCtx.profile
        const funcName = typeof lexicalProfile == 'string' && lexicalProfile.slice(0,30) 
            || lexicalProfile?.$?.id || typeof lexicalProfile == 'function' && 'js' || ''
        Object.defineProperty(doResolve, 'name', { value: `${funcName} ${lexicalCtx.jbCtx.path}` })

        if (this.dynamic == true) {
            const res = (dynamicCtx, arrayIndex) => {
                if (arrayIndex && typeof arrayIndex != 'number') {
                    logError('tgp core error: use single ctx param when invoking dynamic:true funcs, vars are taken from the ctx. second param can only be arrayIndex of array profile. ', {secondParam: arrayIndex, ctx: dynamicCtx})
                    arrayIndex = null
                }
                const _lexicalCtx = arrayIndex != null ? lexicalCtx.setJbCtx(lexicalCtx.jbCtx.innerArrayPath(arrayIndex)) : lexicalCtx
                return doResolve(mergeDataCtx(_lexicalCtx, dynamicCtx))
            }
            res.profile = profile[this.id] // use by pipeline
            res.lexicalCtx = lexicalCtx
            return res
        }                
        return doResolve(lexicalCtx)

        function mergeDataCtx(_lexicalCtx, dynamicCtx) {
            const lexicalCtx = dynamicCtx ? _lexicalCtx.setJbCtx(_lexicalCtx.jbCtx.callCtx(dynamicCtx)) : _lexicalCtx
            if (dynamicCtx == null) return lexicalCtx
            const noOfVars = Object.keys(dynamicCtx.vars || []).length
            if (noOfVars == 0 && dynamicCtx.data == null)
                return lexicalCtx
            if (noOfVars == 0 && dynamicCtx.data != null)
                return lexicalCtx.setData(dynamicCtx.data)
            if (noOfVars > 0 && dynamicCtx.data != null)
                return lexicalCtx.setVars(dynamicCtx.vars).setData(dynamicCtx.data)
            if (noOfVars > 0 && dynamicCtx.data == null)
                return lexicalCtx.setVars(dynamicCtx.vars)
        }
    }
}

Object.assign(jb.coreUtils, {run, Ctx, JBCtx, jbComp, resolveDelayed})
