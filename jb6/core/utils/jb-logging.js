import { jb } from '@jb6/repo'
import './core-utils.js'
const { coreUtils } = jb
import './tgp.js'
const spyLog = (...args) => coreUtils.browserSpy?.log(...args)

const {
    tgp: {TgpType, Component}
} = jb.dsls

const Logger = TgpType('logger', 'test')
const LoggersResult = TgpType('loggers-result', 'mcp', {
  coerce: exp => typeof exp == 'string' ? loggerResult(exp) : exp
})

const loggerResult = LoggersResult('loggerResult', {
  params: [
    {id: 'exp', as: 'string', asIs: true, mandatory: true}
  ],
  impl: (ctx, {}, {exp}) => {
    const loggerResults = []
    let offset = 0
    while (offset < exp.length) {
      skipWhitespace()
      const nameFrom = offset
      while (offset < exp.length && !/[,\s:]/.test(exp[offset])) offset++
      const name = exp.slice(nameFrom, offset)
      if (!name) syntaxError('logger name expected')
      skipWhitespace()
      let jqFilter
      if (exp[offset] == ':') {
        offset++
        skipWhitespace()
        jqFilter = readJqFilter()
        skipWhitespace()
      }
      loggerResults.push({logger: name.endsWith('Logger') ? name : `${name}Logger`, ...(jqFilter != null && {jqFilter})})
      if (offset == exp.length) break
      if (exp[offset] != ',') syntaxError("',' expected")
      offset++
      if (!exp.slice(offset).trim()) syntaxError('logger name expected after comma')
    }
    return loggerResults

    function readJqFilter() {
      if (exp[offset] != '{') syntaxError("'{' expected before jq filter")
      const filterFrom = ++offset
      let depth = 1, quote = '', escaped = false
      while (offset < exp.length) {
        const char = exp[offset++]
        if (escaped) {
          escaped = false
        } else if (char == '\\') {
          escaped = true
        } else if (quote) {
          if (char == quote) quote = ''
        } else if (char == '"' || char == "'") {
          quote = char
        } else if (char == '{') {
          depth++
        } else if (char == '}' && --depth == 0) {
          return exp.slice(filterFrom, offset - 1).trim()
        }
      }
      syntaxError("unterminated jq filter, '}' expected")
    }

    function skipWhitespace() {
      while (/\s/.test(exp[offset] || '')) offset++
    }

    function syntaxError(message) {
      throw new Error(`logger result syntax error at ${offset}: ${message}`)
    }
  }
})

// URL params reserved by view boot — modules add their own here so URL params can be cleanly partitioned into ctx vars.
jb.coreRegistry.urlReservedParams = jb.coreRegistry.urlReservedParams || {}
Object.assign(jb.coreRegistry.urlReservedParams, {logger: true, browserSpy: true, spy: true})

const ensureLoggers = (names = [], {ctx = new coreUtils.Ctx()} = {}) => {
  names = (Array.isArray(names) ? names : String(names).split(',')).map(s => s.trim()).filter(Boolean)
  return [...new Set(['errorLogger', ...names])].reduce((c, name) => {
    const comp = jb.dsls.test.logger[name] || Logger(name, { impl: domainLogger(name.replace(/Logger$/, '')) })   // auto register loggers
    const inst = c.vars[name] || comp.$runWithCtx(c)
    if (c.vars[name]) return c
    c = c.setVars({[name]: inst})
    return inst.onCreation ? inst.onCreation(c) : c   // onCreation(ctx)->ctx: composite loggers arm ctx (e.g. set benchmark, pull dep loggers)
  }, ctx)
}
coreUtils.ensureLoggers = ensureLoggers

coreUtils.harvestLogs = (ctx, names) => Object.fromEntries((names || Object.keys(ctx.vars)).filter(n => ctx.vars[n]?.logsAndErrors).map(n => [n, ctx.vars[n].logsAndErrors()]))
jb.loggingUtils ||= {}
jb.loggingUtils.preserveForBigLog = (ctx, names) => ctx.vars.bigLogLogger.bigLogLog.push(Object.fromEntries(names.map(name =>
  [name, Object.fromEntries(Object.entries(ctx.vars[name].logsAndErrors({stripData: false})).map(([channel, entries]) => [channel, [...entries]]))])))
coreUtils.harvestBigLog = ctx => {
  const logs = coreUtils.harvestLogs(ctx)
  ;[...(ctx.vars.bigLogLogger?.bigLogLog || [])].reverse().forEach(extra => Object.entries(extra).forEach(([name, channels]) =>
    Object.entries(channels).forEach(([channel, entries]) =>
      (logs[name] ||= {})[channel] = [...entries, ...(logs[name]?.[channel] || [])])))
  delete logs.bigLogLogger
  return logs
}
coreUtils.activeLoggers = ctx => Object.keys(ctx.vars).filter(n => /Logger$/.test(n)).join(',')

// loggersFromUrl: instantiate loggers named by `?logger=...` URL param + activate spy. Returns ctx with logger vars.
coreUtils.loggersFromUrl = (urlParams, ctx = new coreUtils.Ctx()) => {
  coreUtils.browserSpy?.initSpyByUrl()
  const names = urlParams.get('logger') || ''
  return ensureLoggers(names, {ctx})
}

// ensureLogger: ctx-enricher form (single name). Idempotent — safe in both standalone and test-runner ctxs.
Component('ensureLogger', {
  type: 'ctx-enricher<tgp>',
  params: [{id: 'name', as: 'string', mandatory: true, description: 'logger name (e.g. "wlaLogger")'}],
  impl: (ctx, {}, {name}) => ensureLoggers(name, {ctx})
})

const takeFromVars = (ids, ctx) => Object.fromEntries((ids||'').split(',').map(x=>x.trim()).filter(x=>x).filter(p=>ctx?.vars[p] != null).map(p=>[p,ctx.vars[p]]))

const sigRe = /\?[^'")\]\s]*(?:X-Goog-|X-Amz-|Signature=)[^'")\]\s]*/g
const scrubSignatures = (v, seen = new WeakSet()) =>   // seen: cycle guard - logged graphs (ctx/dataObj) are circular; without it recursion overflows the stack
  typeof v === 'string' ? v.replace(sigRe, m => `?<signature:${m.length - 1}chars>`)
  : v && typeof v === 'object' ? (seen.has(v) ? v : (seen.add(v),
      Array.isArray(v) ? v.map(x => scrubSignatures(x, seen))
      : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrubSignatures(x, seen)]))))
  : v
coreUtils.scrubSignatures = scrubSignatures

let $source = 'browser'   // machine:pid, computed once. stamped on every entry so parent & child logs both carry their origin
if (typeof process != 'undefined')
  import('os').then(os => $source = `${os.hostname()}:${process.pid}`)

const domainLogger = Logger('domainLogger', {
  params: [
    {id: 'domain', as: 'string'},
    {id: 'addToR1', as: 'string', description: 'add to first param, e.g. userId,fileName'},
    {id: 'addToR2', as: 'string', description: 'add to second param, e.g. roomId'},
    {id: 'doNotAllowInR1', as: 'string', description: 'e.g. roomId'},
  ],
  impl: (ctx,{},{addToR1, addToR2, domain}) => {
    const logName = `${domain}Log`
    const errorsName = `${domain}Errors`
    const startTime = Date.now()
    let progressSeq = 0   // monotonic per-instance; with $source lets a debugger order emits & detect dropped (dispatch-missing) progress
    return {
      [logName]: [],
      [errorsName]: [],
      info(r1,r2,r3) {
        const enriched = enrichParams(r1,r2,r3)
        this[logName].push({...enriched[0], ...enriched[1]})
        spyLog(logName, {r1: enriched[0], r2: enriched[1], ctx: r3?.ctx})
      },
      warning(r1,r2,r3) {
        const enriched = enrichParams(r1,r2,r3)
        this[logName].push({severity: 'warning', ...enriched[0], ...enriched[1]})
        spyLog(logName, {severity: 'warning', r1: enriched[0], r2: enriched[1], ctx: r3?.ctx})
      },
      warnOnce(key,r1,r2,r3) {   // collapse per-element warning spam: warn first time per key, count the rest
        const seen = this._warnCount || (this._warnCount = {})
        if ((seen[key] = (seen[key]||0)+1) == 1) this.warning({...r1, warnKey: key}, r2, r3)
      },
      error(r1,r2,r3) {
        const enriched = enrichParams(r1, r2, r3)
        this[logName].push({severity: 'error', ...enriched[0], ...enriched[1]})
        this[errorsName].push({...enriched[0], ...enriched[1]})
        spyLog(logName, {severity: 'error', r1: enriched[0], r2: enriched[1], ctx: r3?.ctx})
        if (domain === 'error') globalThis.console?.error?.(enriched[0].$source, enriched[0], enriched[1])
        const errLog = r3?.ctx?.vars?.errorLogger   // tee: every error is ALSO recorded in the always-on errorLogger
        if (errLog && errLog !== this) errLog.error(r1, r2, r3)
      },
      status(text) { this.progress({t: text, status: true}) },
      step(step, text) { this.progress({step, t: text, status: 'running'}) },
      stepDone(step, text) { this.progress({step, ...(text && {t: text}), status: 'done'}) },
      stepPct(step, pct, text) { this.progress({step, pct, ...(text && {t: text})}) },
      stepPlan(steps, labels) { this.progress({stepPlan: steps, ...(labels && {stepLabels: labels}), status: 'plan'}) },
      progress(payload) {
        const logger = `${domain}Logger`
        const entry = {severity: 'progress', seq: ++progressSeq, at: Date.now() - startTime, $source, logger, ...payload}
        this[logName].push(entry)
        spyLog(logName, {severity: 'progress', r1: entry})
        if (ctx.vars.progressToStderr)
          globalThis.process?.stderr?.write(`${JSON.stringify(entry)}\n`)
        else if (typeof document !== 'undefined' || ctx.vars.isProgressConsumer)
          coreUtils.eventEmitter.emit('progress', entry)
        else if ((ctx.vars.loggersNeededForUiProgress || '').split(',').map(x => x.trim()).includes(logger))
          globalThis.process?.stderr?.write(`${JSON.stringify(entry)}\n`)
      },
      $stripData() {
        const custom = coreUtils.loggerSummaries?.[domain]   // per-domain summary override (e.g. rx node rollup); keeps auto-logger path intact
        if (custom) return custom(this[logName], this[errorsName])
        return { $: `${domain}Logger`, logCount: this[logName].length, errorCount: this[errorsName].length, last: this[logName].at(-1)?.t }
      },
      logsAndErrors({stripData = true} = {}) {
        const res = {[logName]: this[logName], [errorsName]: this[errorsName]}
        return stripData ? coreUtils?.stripData(res) || res : res
      }
    }
    function enrichParams(r1, r2, r3 = {}) {
      const {ctx} = r3   // ctx is optional — callbag/no-ctx call sites (rx internals) log without it
      const error = r3.error ? {error: r3.error.stack || r3.error.message || r3.error } : {}
      const resp = r3.response ? { status: r3.response.status, statusText: r3.response.statusText } : {}
      const enrichedR1 = { ...takeFromVars(addToR1,ctx), ...error, ...resp, at: Date.now() - startTime, $source, tgpPath: ctx?.jbCtx.lexicalParentPath, ...r1 }
      const enrichedR2 = { ...takeFromVars(addToR2,ctx), ...r2 }
      return [scrubSignatures(enrichedR1), scrubSignatures(enrichedR2)]
    }
  }
})

const bridgeCtx = ensureLoggers('errorLogger')   // prebuilt once: carries the always-on errorLogger
coreUtils.log = (logNames, logObj = {}) => {
  const {ctx: callerCtx, error, ...data} = logObj
  // NEVER instantiate loggers on the hot log() path (running comps mid-probe re-enters the probe machinery -> recursion).
  const errorLogger = callerCtx?.vars?.errorLogger || bridgeCtx.vars.errorLogger
  errorLogger.error({t: logNames, ...data}, {}, {ctx: callerCtx || bridgeCtx, error})
}
