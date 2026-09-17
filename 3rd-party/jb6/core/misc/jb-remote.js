import { jb } from '@jb6/repo'
import '../utils/jb-core.js'
import '../utils/jb-args.js'
const { coreUtils } = jb
const { Ctx, JBCtx, asComp } = coreUtils
const CAP = 256 * 1024

// over-the-wire: a call = the profile (the remote has the comp def) + the slice of ctx its %$tokens% lead to.
// stripCtx scans the profile AND the impl/defaultValues of the comps it references (the tokens the RUN will hit),
// harvests those names from the lexicalCtx (args separate from vars, calcVar order), closing over shipped values
// that name more tokens. Values are JSON-safe: bigData arrays → {$bigData:url}, functions → '@js@<src>'. An ongoing
// byte accumulator trips at CAP naming the offending var. buildCtx revives and rebuilds the real Ctx.
const tokensIn = v => [...(JSON.stringify(v ?? '') || '').matchAll(/%\$([a-zA-Z0-9_]+)%/g)].map(m => m[1])

// tokens reachable when running the profile: the call's own tokens + each referenced comp's impl + param defaults
function scanProfile(prof, seen = new Set()) {
    if (!prof || typeof prof != 'object') return tokensIn(prof)
    const tokens = []
    if (prof.$) {
        const comp = asComp(prof.$)
        if (comp && !seen.has(comp)) {
            seen.add(comp)
            tokens.push(...tokensIn(comp.impl), ...(comp.params || []).filter(p => prof[p.id] === undefined).flatMap(p => tokensIn(p.defaultValue)))
        }
    }
    Object.values(prof).forEach(v => Array.isArray(v) ? v.forEach(x => tokens.push(...scanProfile(x, seen))) : tokens.push(...scanProfile(v, seen)))
    return [...tokens, ...tokensIn(prof)]
}

function stripVal(v) {
    if (typeof v == 'function') return `@js@${v}`
    if (v == null || typeof v != 'object') return v
    if (Array.isArray(v)) return v[Symbol.for('bigData')] ? { $bigData: v[Symbol.for('bigData')] } : v.map(stripVal)
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, stripVal(x)]))
}

function stripCtx({ profileJson, ctx }) {
    const { vars = {}, jbCtx: { args = {}, path } = {} } = ctx
    const out = { vars: {}, args: {}, path }
    const seen = new Set(), queue = scanProfile(profileJson)
    let bytes = 0
    while (queue.length) {
        const name = queue.shift()
        if (seen.has(name)) continue
        seen.add(name)
        const inArgs = args[name] !== undefined
        const val = inArgs ? args[name] : vars[name]
        if (val === undefined) continue
        const stripped = (inArgs ? out.args : out.vars)[name] = stripVal(val)
        bytes += JSON.stringify(stripped).length
        if (bytes > CAP) throw new Error(`stripCtx: '${name}' exceeds ${CAP} bytes - make it bigData`)
        queue.push(...tokensIn(stripped))
    }
    return out
}

function reviveVal(v, deref) {
    if (typeof v == 'string') return v.indexOf('@js@') == 0 ? eval(v.slice(4)) : v
    if (v == null || typeof v != 'object') return v
    if (v.$bigData) return deref ? deref(v.$bigData) : v.$bigData
    if (Array.isArray(v)) return v.map(x => reviveVal(x, deref))
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, reviveVal(x, deref)]))
}

function buildCtx({ vars = {}, args = {}, data, path }, deref) {
    const revive = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, reviveVal(v, deref)]))
    return new Ctx({ data: reviveVal(data, deref), vars: revive(vars), jbCtx: new JBCtx({ path, args: revive(args) }) })
}

Object.assign(coreUtils, { stripCtx, buildCtx })
