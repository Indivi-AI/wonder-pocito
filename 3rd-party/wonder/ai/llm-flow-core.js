import { dsls, jb, coreUtils } from '@jb6/core'
import '@jb6/jq'
import '@jb6/llm-guide'
import { parse } from '@jb6/lang-service/lib/acorn.mjs'
import '@jb6/lang-service/src/lang-service-parsing-utils.js'
import './category-dsl.js'
import { fetchItemsFromLLMReactiveP } from '@wonder/ai/reactive-llm.js'

const {
  tgp: { TgpType, TgpTypeModifier, Component },
  test: { Logger, logger: { domainLogger } }
} = dsls
TgpType('workflow', 'ai')

const {
  common: { Data },
  'llm-guide': { Guidance, Concept, Doclet }
} = dsls
const workflowLoggerProfile = Logger('workflowLoggerProfile', { impl: domainLogger('workflow') })

// last fenced block, fence must open with a newline - a prose mention like "a ```javascript block" is not a fence
const lastFencedBlock = txt => [...String(txt || '').matchAll(/```(?:js|javascript)?[ \t]*\n([\s\S]*?)```/gi)].at(-1)?.[1]

Object.assign(jb.workflowUtils ||= {}, {
  extendWithWorkflowVars,
  getWorkflowVars, parseFlowCode, resolveCompRefs, squeeze, waitForHumanFeedbackVars, applyHumanFeedbackVars,
  seedClarifiedVars, lastFencedBlock
})

const Mpi = TgpType('mpi', 'ai', { typescript: '{ model, prompt, instructions }'} )
const FlowElem = TgpType('flow-elem', 'ai', {typescript: 'async ctx => ctx'})
const enrichCtxByLlmFlow = Component('enrichCtxByLlmFlow', {
  type: 'ctx-enricher<tgp>',
  moreTypes: 'flow-elem<ai>',
  params: [{id: 'flow', type: 'flow-elem<ai>', dynamic: true, mandatory: true}],
  impl: (ctx, {}, {flow}) => flow(ctx)
})
const VerifiedReport2 = TgpTypeModifier('VerifiedReport2', { verifiedReport2: true, dsl: 'common', type: 'data' })
const workflowElementFixGuidance = Data('workflowElementFixGuidance', {
  impl: async ctx => (await Promise.all(coreUtils.globalsOfTypeIds(Doclet, 'all')
    .filter(id => id.startsWith('workflowElementFix.') && id.split('.').slice(1).every(category => ctx.vars.categories?.[category]))
    .map(id => Doclet[id].$runWithCtx(ctx)))).filter(Boolean).join('\n\n')
})
const feedbackWaiters = {}
coreUtils.eventEmitter.on('humanFeedbackResolve', ({requestId, ids, value}) => feedbackWaiters[requestId]?.(ids ?? value, delete feedbackWaiters[requestId]))

async function extendWithWorkflowVars(ctx) {
  const userRequestId = ctx.vars.userRequestId || ctx.vars.requestId || Math.random().toString(36).slice(2, 12)
  if (ctx.vars.workflowLogger) return ctx.setVars({ userRequestId })
  const workflowLogger = workflowLoggerProfile.$runWithCtx(ctx)
  Object.assign(workflowLogger, {
    workflowTrace: [], statusHistory: [],
    status(text) {
      this.startTime ||= Date.now()
      this.statusHistory.push({ text, at: Date.now() - this.startTime })
      this.progress({ t: text, status: true })
    },
    logsAndErrors({ stripData = true } = {}) {
      const logs = { workflowErrors: this.workflowErrors, workflowTrace: this.workflowTrace, workflowLog: this.workflowLog }
      return stripData ? coreUtils.stripData(logs) : logs
    }
  })
  return ctx.setVars({ workflowDb: {}, workflowLogger, userRequestId, TODAYS_DATE: new Date().toLocaleDateString() })
}

const escapeHebrewGershayim = s => s.replace(/([\u0590-\u05FF])"(?=[\u0590-\u05FF])/g, '$1\\"')
const escapeHebrewGeresh = s => s.replace(/([\u0590-\u05FF])'(?=[\u0590-\u05FF])/g, "$1\\'")

function parseElem(elemCode) {
  const wrapped = `(${escapeHebrewGeresh(elemCode)})`
  const ast = parse(wrapped, { ecmaVersion: 'latest' }).body[0]
  assertLiteralParams(ast, wrapped)
  return coreUtils.astToTgpObj(ast, wrapped)
}

function assertLiteralParams(node, code) {
  if (!node || typeof node.type != 'string') return
  const snippet = () => code.slice(node.start, node.end).slice(0, 160)
  switch (node.type) {
    case 'Literal': case 'Identifier': case 'ArrowFunctionExpression': return
    case 'TemplateLiteral':
      if (node.expressions.length) throw new Error(`non-literal param: template \${...} interpolation is dropped by the flow parser - write ONE plain literal string: ${snippet()}`)
      return
    case 'ObjectExpression': return node.properties.forEach(p => assertLiteralParams(p.value, code))
    case 'ArrayExpression': return node.elements.forEach(el => assertLiteralParams(el, code))
    case 'UnaryExpression': return assertLiteralParams(node.argument, code)
    case 'ExpressionStatement': return assertLiteralParams(node.expression, code)
    case 'CallExpression': return node.arguments.forEach(a => assertLiteralParams(a, code))
    default: throw new Error(`non-literal param (${node.type}) is dropped by the flow parser and arrives EMPTY at runtime - `
      + `params must be plain literals, never JS expressions like + concatenation: ${snippet()}`)
  }
}

function splitFlowElems(code) {
  const lines = code.split('\n')
  const elemStarts = lines.reduce((acc, line, i) => /^  \{/.test(line) ? [...acc, i] : acc, [])
  if (elemStarts.length === 0) return null
  return elemStarts.map((start, i) => {
    const end = elemStarts[i + 1] ?? lines.findIndex((l, j) => j > start && /^]}/.test(l))
    const raw = lines.slice(start, end === -1 ? undefined : end).join('\n').replace(/,\s*$/, '')
    return { raw, lineNo: start + 1 }
  })
}

async function parseFlowCode(code, workflowLogger, ctx) {
  try {
    return parseElem(code)
  } catch(fullParseError) {
    const elems = splitFlowElems(code)
    if (!elems) throw fullParseError
    workflowLogger.info({t: 'full parse failed, parsing elements individually', error: fullParseError.stack}, {}, {ctx})
    const parsedElems = await Promise.all(elems.map(async ({raw, lineNo}) => {
      try { return parseElem(raw) }
      catch(e) {
        let parseError = e
        workflowLogger.info({t: 'element parse error, attempting fix', lineNo, error: e.stack}, {raw}, {ctx})
        const fix = await llmFixElement(ctx, { elemCode: raw, error: e.stack, phase: 'compile' })
        if (fix?.fixedCode) {
          try { return parseElem(fix.fixedCode) }
          catch(e2) { parseError = e2 }
        }
        workflowLogger.error({t: 'element parse error', lineNo, error: parseError.stack}, {raw}, {ctx})
        if (fix?.needsRegeneration)
          return { $: 'flow-elem<ai>setCtxData', goal: `Parse error at line ${lineNo}`,
            value: { $: 'data<common>jqSingle', exp: `{error: "parse error", needsRegeneration: true}` } }
        return { $: 'flow-elem<ai>setCtxData', goal: `Parse error at line ${lineNo}: ${e.stack}`,
          value: { $: 'data<common>jqSingle', exp: `{error: "parse error: ${e.stack.replace(/"/g, '\\"')}"}` } }
      }
    }))
    return { $: 'flow-elem<ai>flow', elems: parsedElems }
  }
}

Component('runLLMFlowScript', {
  params: [
    {id: 'responseTextF', as: 'string', dynamic: true }
  ],
  impl: async (ctx, {workflowLogger}, {responseTextF}) => {
    let code
    try {
      code = (lastFencedBlock(responseTextF.profile) || responseTextF.profile).trim()
      workflowLogger.workflowTrace ||= []
      workflowLogger.workflowTrace.splice(0)
      workflowLogger.info({t: 'runLLMFlowScript started', codeLength: code.length}, {}, {ctx})
      const profile = await parseFlowCode(code, workflowLogger, ctx)
      coreUtils.resolveProfileTypes(profile,{expectedType: 'flow-elem<ai>', tgpModel: jb})
      resolveCompRefs(profile)
      const resultCtx = await ctx.run(enrichCtxByLlmFlow(profile))

      // debug info for studio
      const { text: llmGeneratedCode, actionMap } = coreUtils.prettyPrintWithPositions(profile, {type: 'flow-elem<ai>'})
      const elemsPos = actionMap.filter(e=>e.action.match(/begin!~elems~[0-9]+$/)).map(x=>x.from)
      const posOf = (i, prop) => {
        const begin = actionMap.find(e=>e.action == `begin!~elems~${i}~${prop}`)
        const end = actionMap.find(e=>e.action == `end!~elems~${i}~${prop}`)
        return begin && end ? {from: begin.from, to: end.to} : null
      }
      const sections = elemsPos.map((start, i) => ({ start, end: elemsPos[i + 1] || llmGeneratedCode.length,
        value: posOf(i, 'value'), postCondition: posOf(i, 'postCondition') }))
      return { runRes: resultCtx?.data, workflowTrace: workflowLogger.workflowTrace, llmGeneratedCode, sections }
    } catch(error) {
      const failure = {phase: code ? 'execute' : 'prepare', code, traceLength: workflowLogger.workflowTrace?.length || 0}
      workflowLogger.workflowTrace?.push({failure: {...failure, error: error.stack || String(error)}})
      coreUtils.logException(error, 'runLLMFlowScript', {ctx, ...failure})
      workflowLogger.error({t: 'runLLMFlowScript failed', phase: failure.phase, traceLength: failure.traceLength}, {}, {ctx, error})
      return { runRes: error.stack || error, workflowTrace: workflowLogger.workflowTrace }
    }
  }
})

FlowElem('flow', {
  params: [
    {id: 'elems', type: 'flow-elem[]', dynamic: true }
  ],
  impl: async (ctx0, { workflowLogger }, { elems }) => {
    let ctx = ctx0
    const logger = workflowLogger || ctx0.vars.logger
    try {
      const profiles = coreUtils.asArray(elems.profile)
      logger?.stepPlan(profiles.map((_, i) => i), profiles.map(p => p?.status || p?.goal || ''))
      for (let flowIndex = 0; flowIndex < profiles.length; flowIndex++) {
        const _res = await ctx.setVars({ flowIndex }).runInnerArg(elems, flowIndex)
        if (_res?.error || _res?.needsRegeneration)
          return ctx.setData({..._res, flowIndex})
        let res = await coreUtils.waitForInnerElements(_res)
        if (!(res instanceof coreUtils.Ctx)) res = ctx.setData(res)
        ctx = res
        logger?.stepDone(flowIndex)
      }
      return ctx
    } catch (error) {
      return ctx.setData(error)
    }
  }
})

const unwrapCtx = res => res && typeof res.setData == 'function' && res.jbCtx ? res.data : res
FlowElem('parallel', {
  description: 'run branches concurrently from the same input ctx; output data is the array of each branch result',
  params: [
    {id: 'branches', type: 'flow-elem[]', dynamic: true }
  ],
  impl: async (ctx, {}, { branches }) => {
    const n = coreUtils.asArray(branches.profile).length
    const results = await Promise.all([...Array(n)].map(async (_, flowIndex) =>
      unwrapCtx(await coreUtils.waitForInnerElements(await ctx.setVars({ flowIndex }).runInnerArg(branches, flowIndex)))))
    return ctx.setData(results)
  }
})

async function runValueWithRecovery(ctx, { value, profileCode, logger, elemGoal }) {
  const valueProfile = coreUtils.prettyPrint(value.profile)
  const ctxForValue = await waitForHumanFeedbackVars(ctx, value.profile, logger)
  let val
  try {
    val = await value(ctxForValue)
    if (val instanceof coreUtils.Ctx) val = val.data
  } catch (error) {
    logger?.error({t: 'error running profile', profileCode, error: error.stack}, {}, {error, ctx})
    val = { error: error.stack || error }
  }
  if (val?.error) {
    const result = await repairElement(ctx, logger,
      { elemCode: profileCode, error: val.error, phase: 'runtime', elemGoal },
      returnError(val.error, {profileCode, valueProfile}))
    return result instanceof coreUtils.Ctx ? { recovered: result } : { error: result }
  }
  return { val, ctx: ctxForValue }
}

const feedbackId = () => `hf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
const sqlLit = v => /^-?\d+(\.\d+)?$/.test(String(v)) ? String(v) : `'${String(v).replace(/'/g, "''")}'`
const feedbackValue = (request, ids) => {
  const selectedIds = coreUtils.asArray(ids).filter(x => x != null)
  const byId = Object.fromEntries((request.options || []).map(o => [String(o.id), o]))
  const items = selectedIds.map(id => byId[String(id)] || { id }).filter(Boolean)
  const labels = items.map(x => x.label || x.name || String(x.id))
  return { ids: selectedIds, id: selectedIds[0], sqlIn: selectedIds.map(sqlLit).join(',') || 'NULL', sqlLabelsIn: labels.map(sqlLit).join(',') || 'NULL', labels, items }
}
// clarified selections from previous turns (accumulatedContext.clarifiedParams) become resolved ctx vars, matching the prompt contract
// "reuse the clarified product, do not ask again": %$var.sqlIn% placeholders resolve, and a re-emitted asHumanFeedback with the same varName skips itself
function seedClarifiedVars(ctx) {
  const seeds = coreUtils.asArray(ctx.vars.accumulatedContext?.clarifiedParams).filter(c => c?.varName && ctx.vars[c.varName] == null && coreUtils.asArray(c.ids).length)
  seeds.length && ctx.vars.workflowLogger?.info?.({t: 'seedClarifiedVars', varNames: seeds.map(c => c.varName)}, {}, {ctx})
  return seeds.reduce((c, p) => c.setVars({ [p.varName]: {
    ...feedbackValue({ options: coreUtils.asArray(p.ids).map((id, i) => ({ id, label: p.labels?.[i] })) }, p.ids),
    $fromPreviousTurn: true
  } }), ctx)
}
const profileText = p => { try { return typeof p == 'string' ? p : coreUtils.prettyPrint(p) } catch { return JSON.stringify(coreUtils.stripData(p)) } }
const pendingVarNames = vars => Object.entries(vars || {}).filter(([,v]) => v?.$humanFeedbackPending).map(([k]) => k)
const braceVar = /\{\{(?!ROOT\}\})[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*\}\}/, tgpVar = /%\$([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)%/g
const varPath = (vars, path) => path.split('.').reduce((o, k) => o?.[k], vars)
const usedPendingVars = (ctx, profile) => pendingVarNames(ctx.vars).filter(v => {
  const t = profileText(profile)
  return [`$${v}`, `%$${v}`].some(x => t.includes(x))
})
async function waitForHumanFeedbackVars(ctx, profile, logger) {
  return (await usedPendingVars(ctx, profile).reduce(async (ctxP, v) => {
    const c = await ctxP, pending = c.vars[v], waiter = c.vars.humanFeedback?.waiters?.[pending.requestId]
    if (!waiter) return c
    logger?.status?.('ממתין לבחירה...')
    const val = await waiter
    logger?.workflowTrace?.push({ setVars: { [v]: val } })
    return c.setVars({ [v]: val })
  }, Promise.resolve(ctx)))
}
function applyHumanFeedbackVars(text, ctx) {
  const s = String(text), bad = s.match(braceVar)?.[0]
  if (bad) throw new Error(`invalid placeholder ${bad}: use %$var.path%`)
  return s.replace(tgpVar, (m, path) => {
    const val = varPath(ctx.vars, path)
    if (val == null) throw new Error(`unresolved placeholder ${m}`)
    return String(val)
  })
}

FlowElem('asHumanFeedback', {
  params: [
    {id: 'goal', as: 'string'},
    {id: 'status', as: 'string'},
    {id: 'varName', as: 'string', mandatory: true},
    {id: 'question', as: 'string', mandatory: true},
    {id: 'mode', as: 'string', options: 'single,multi', defaultValue: 'single'},
    {id: 'options', dynamic: true}
  ],
  impl: async (ctx, { flowIndex, workflowLogger }, {goal, status, varName, question, mode, options}) => {
    const logger = workflowLogger || ctx.vars.logger
    // skip same-run duplicates, but an explicitly emitted picker OVERRIDES a value seeded from a previous turn (the question may target a different entity)
    const current = ctx.vars[varName]
    if (current?.$humanFeedbackPending || (Array.isArray(current?.ids) && !current.$fromPreviousTurn)) return ctx
    if (status) logger?.status(status)
    const request = { id: feedbackId(), type: 'humanFeedback', varName, question, mode, options: coreUtils.asArray(options.profile ? await options(ctx) : []) }
    if (request.options.length < 2) {
      const value = feedbackValue(request, request.options.map(o => o.id))
      request.options.length && coreUtils.eventEmitter.emit('humanFeedbackRequest', { ...request, value, selectedIds: value.ids, resolved: true, autoResolved: true })
      return ctx.setVars({ [varName]: value })
    }
    const waiter = new Promise(resolve => feedbackWaiters[request.id] = ids => resolve(feedbackValue(request, ids)))
    coreUtils.eventEmitter.emit('humanFeedbackRequest', request)
    logger?.info({t: 'asHumanFeedback', goal, flowIndex, varName, options: request.options.length}, {}, {ctx})
    logger?.workflowTrace?.push({flowIndex, output: request})
    return ctx.setVars({
      [varName]: { $humanFeedbackPending: true, requestId: request.id, varName },
      humanFeedback: { ...(ctx.vars.humanFeedback || {}), waiters: {
        ...(ctx.vars.humanFeedback?.waiters || {}), [request.id]: waiter
      } }
    })
  }
})

FlowElem('setCtxData', {
  params: [
    {id: 'goal', as: 'string'},
    {id: 'status', as: 'string'},
    {id: 'value', dynamic: true},
    {id: 'postCondition', as: 'boolean', dynamic: true},
  ],
  impl: async (ctx, { flowIndex, workflowLogger }, {goal, status, value, postCondition}) => {
    const logger = workflowLogger || ctx.vars.logger
    logger?.step(flowIndex, status || goal)
    const profileCode = coreUtils.prettyPrint(ctx.jbCtx.profile)
    logger?.workflowTrace?.push({flowIndex, input: ctx.data})

    let ctx1 = ctx
    if (value.profile) {
      const res = await runValueWithRecovery(ctx, { value, profileCode, logger, elemGoal: goal })
      if (res.recovered) return res.recovered
      if (res.error) return res.error
      logger?.info({t: 'setCtxData', goal, flowIndex},{ val: res.val },{ctx })
      logger?.workflowTrace?.push({flowIndex, output: res.val})
      ctx1 = (res.ctx || ctx).setData(res.val)
    }

    return enforcePostCondition(ctx1, ctx, postCondition, profileCode, goal, flowIndex, logger)
  }
})

FlowElem('setCtxVar', {
  params: [
    {id: 'goal', as: 'string'},
    {id: 'status', as: 'string'},
    {id: 'varName', as: 'string'},
    {id: 'value', dynamic: true},
    {id: 'postCondition', as: 'boolean', dynamic: true},
  ],
  impl: async (ctx, { flowIndex, workflowLogger }, {goal, status, varName, value, postCondition}) => {
    const logger = workflowLogger || ctx.vars.logger
    logger?.step(flowIndex, status || goal)
    const profileCode = coreUtils.prettyPrint(ctx.jbCtx.profile)
    logger?.workflowTrace?.push({flowIndex, input: ctx.data})

    let ctx1 = ctx
    if (value.profile) {
      const res = await runValueWithRecovery(ctx, { value, profileCode, logger, elemGoal: goal })
      if (res.recovered) return res.recovered
      if (res.error) return res.error
      logger?.info({t: 'setCtxVar', goal, flowIndex, varName},{ val: res.val },{ctx })
      logger?.workflowTrace?.push({flowIndex, setVars: {[varName]: res.val}})
      ctx1 = (res.ctx || ctx).setVars({[varName]: res.val})
      return enforcePostCondition(ctx1.setData(res.val), ctx, postCondition, profileCode, goal, flowIndex, logger, ctx1)
    }

    return enforcePostCondition(ctx1, ctx, postCondition, profileCode, goal, flowIndex, logger)
  }
})

async function repairElement(inputCtx, logger, diagnostics, hardError, { acceptFix, continueCtx, soft } = {}, maxTries = 3) {
  const settle = extra => {
    if (!soft) return { ...hardError, ...extra }
    logger?.warning({t: 'postCondition unsatisfied, continuing', ...diagnostics, errors: logger?._recoveryErrors}, {}, {ctx: inputCtx})
    return continueCtx
  }
  if (!logger) return soft ? continueCtx : { ...hardError }
  logger._recoveryErrors = logger._recoveryErrors || []
  logger._recoveryTries = (logger._recoveryTries || 0) + 1
  logger._recoveryErrors.push(typeof diagnostics.error === 'string' ? diagnostics.error : squeeze(diagnostics.error, 2000))
  if (logger._recoveryTries > maxTries)
    return settle({ errors: logger._recoveryErrors, exhaustedRetries: true })
  const fix = await llmFixElement(inputCtx, { ...diagnostics, error: logger._recoveryErrors.join('\n---\n'), tryNumber: logger._recoveryTries })
  if (fix?.needsRegeneration)
    return soft ? settle() : { ...hardError, fixCode: fix, needsRegeneration: true }
  if (fix?.fixedCode) {
    const attempted = logger._attemptedFixCodes = logger._attemptedFixCodes || []
    const canon = canonicalElemCode(fix.fixedCode)
    if (canon == diagnostics.elemCode || attempted.includes(canon)) {
      logger._recoveryErrors.push(`Fix attempt ${logger._recoveryTries} re-emitted code identical to a failed attempt - change the actual jq/sql content, not just quoting`)
    } else {
      attempted.push(canon)
      const recovered = await tryRunFixedElement(fix.fixedCode, inputCtx, logger, acceptFix)
      if (recovered) return recovered
      logger._recoveryErrors.push(`Fix attempt ${logger._recoveryTries} failed`)
    }
  } else {
    logger._recoveryErrors.push(`Fix attempt ${logger._recoveryTries}: no fix provided`)
  }
  return settle({ errors: logger._recoveryErrors, exhaustedRetries: logger._recoveryTries >= maxTries })
}
function canonicalElemCode(code) { // fixes differing only in escaping collapse to the same canonical form, exposing no-op fixes
  try {
    const profile = parseElem(code)
    coreUtils.resolveProfileTypes(profile, { expectedType: 'flow-elem<ai>', tgpModel: jb })
    resolveCompRefs(profile)
    return coreUtils.prettyPrint(profile)
  } catch { return code }
}
async function tryRunFixedElement(fixedCode, ctx, logger, acceptFix) { // todo: merge with repairElement
  try {
    const profile = parseElem(fixedCode)
    coreUtils.resolveProfileTypes(profile, { expectedType: 'flow-elem<ai>', tgpModel: jb })
    resolveCompRefs(profile)
    const res = await ctx.run(profile)
    const resData = res instanceof coreUtils.Ctx ? res.data : res
    if (resData?.error) return null
    if (acceptFix && !(await acceptFix(res instanceof coreUtils.Ctx ? res : ctx.setData(resData)))) {
      logger?.info({ t: 'fixedElement still violates postCondition' }, { fixedCode }, { ctx })
      return null
    }
    logger?.info({ t: 'fixedElement ran successfully' }, { fixedCode }, { ctx })
    return res
  } catch (e) {
    logger?.error({ t: 'fixedElement run failed' }, { fixedCode, error: e.stack || e }, { ctx })
    return null
  }
}


async function enforcePostCondition(outputCtx, inputCtx, postCondition, profileCode, goal, flowIndex, logger, continueCtx = outputCtx) {
  if (!postCondition.profile) return continueCtx
  const postConditionProfile = coreUtils.prettyPrint(postCondition.profile)
  const acceptFix = async candidateCtx => { try { const r = await postCondition(candidateCtx); return !!r && !r?.error } catch { return false } }
  const softFail = { acceptFix, continueCtx, soft: true }
  outputCtx = await waitForHumanFeedbackVars(outputCtx, postCondition.profile, logger)
  continueCtx = continueCtx instanceof coreUtils.Ctx ? continueCtx.setVars(outputCtx.vars) : continueCtx
  let postCondRes
  try {
    postCondRes = await postCondition(outputCtx)
  } catch (error) {
    return repairElement(inputCtx, logger,
      { elemCode: profileCode, error: error.stack || error, phase: 'postCondition', stageResult: outputCtx.data, elemGoal: goal },
      returnError(error, {profileCode, postConditionProfile}), softFail)
  }
  if (!postCondRes || postCondRes?.error) {
    const ctxData = outputCtx.data instanceof coreUtils.Ctx ? outputCtx.data.data : outputCtx.data
    const jqExp = postCondition.profile?.exp
    let jqRawResult
    try { jqRawResult = jqExp && executeJq(compileJqExpression(jqExp, null, null, outputCtx, 'diag'), outputCtx, null, jqExp, 'diag') } catch(e) {}
    const referencedVars = Object.fromEntries((jqExp?.match(/\$[a-zA-Z_]\w*/g) || []).map(v => [v, outputCtx.vars?.[v.slice(1)]]))
    const calcResult = { ctxData, jqExp, jqRawResult, ...(Object.keys(referencedVars).length ? {referencedVars} : {}) }
    const simpleTest = generateFailureTest(ctxData, jqExp, referencedVars) // for studio
    logger?.error({t: 'postCondition error', postConditionProfile, profileCode, flowIndex, err: postCondRes?.error },{ calcResult, simpleTest },{ctx: outputCtx})
    return repairElement(inputCtx, logger,
      { elemCode: profileCode, error: postCondRes?.error || 'post condition false', phase: 'postCondition', stageResult: ctxData, elemGoal: goal, calcResult },
      { error: 'post condition false', profileCode, postConditionProfile, calcResult, simpleTest, flowIndex }, softFail)
  }
  logger?.info({t: 'postCondition', goal },{ postConditionProfile, postCondRes, profileCode },{ctx: outputCtx})
  return continueCtx
}

function generateFailureTest(ctxData, jqExp, referencedVars) {
  if (!jqExp) return null
  const jsonOf = v => JSON.stringify(coreUtils.stripData(v)) ?? 'null'
  const vars = Object.entries(referencedVars || {}).filter(([,v]) => v !== undefined).map(([k,v]) => `Var('${k.slice(1)}', ${jsonOf(v)})`).join(', ')
  const dataStr = jsonOf(ctxData)
  if (vars.length + dataStr.length > 20000) return null
  const inner = [vars, `asIs(${dataStr})`, `jqBoolean('${jqExp}')`].filter(Boolean).join(', ')
  return `Test('jqTest.wfError', {\n  impl: dataTest(pipeline(${inner}), equals(true))\n})`
}

function squeeze(val, maxLen = 500) {
  if (val == null) return 'null'
  const s = typeof val === 'string' ? val : JSON.stringify(coreUtils.stripData(val))
  return !s || s.length <= maxLen ? s : s.slice(0, maxLen) + `... (${s.length} chars total)`
}

function getWorkflowVars(workflowTrace) {
  if (!workflowTrace) return {}
  return workflowTrace.reduce((acc, entry) => entry.setVars ? { ...acc, ...entry.setVars } : acc, {})
}

async function llmFixElement(ctx, { elemCode, elemGoal, error, phase, stageResult, tryNumber, calcResult }) {
  const logger = ctx.vars.workflowLogger
  try {
    const workflowVars = getWorkflowVars(logger?.workflowTrace)
    const guidance = await ctx.run(workflowElementFixGuidance())
    const prompt = [
      'Fix this workflow element that failed. If the error is a local syntax/logic bug you can fix, return ONLY the fixed element code in a ```javascript block.',
      'Return STRATEGIC only when this one element cannot produce the requested output even when corrected.',
      'Escaping trap: this code crosses nested string layers - adding backslashes usually changes nothing after JS '
        + 'unescaping. For ASCII quotes inside Hebrew words (מע"מ, צ\'ויס) rewrite with the Unicode marks ״/׳ or rephrase '
        + 'without the quote.',
      guidance,
      `\nPHASE: ${phase}`,
      `ERROR: ${typeof error === 'string' ? error : error?.stack || error?.t || squeeze(error, 2000)}`,
      `FAILING CODE:\n${elemCode}`,
      `CTX DATA (input): ${squeeze(ctx.data)}`,
      Object.keys(workflowVars).length ? `WORKFLOW VARS: ${squeeze(workflowVars, 300)}` : null,
      stageResult != null ? `STAGE RESULT: ${squeeze(stageResult)}` : null,
      calcResult ? `POST_CONDITION DIAGNOSTICS: jqExp="${calcResult.jqExp}", rawResult=${squeeze(calcResult.jqRawResult)}` : null,
      tryNumber > 1 ? `\nATTEMPT ${tryNumber}: Previous fixes failed. The error above includes all previous attempt failures. Try a different approach.` : null,
    ].filter(Boolean).join('\n')

    logger?.info({ t: 'llmFixElement attempt', phase }, { elemCode, error: String(error) }, { ctx })
    const { responseText } = await fetchItemsFromLLMReactiveP({
      ctx, model: ctx.vars.flowModel || ctx.vars.summaryModel, goal: `fix flow element ${elemGoal || ''}`,
      prompt, instructions: '', maxTokens: 4000, temperature: 0, thinkingBudget: 0
    })
    if (responseText.includes('STRATEGIC')) {
      logger?.info({ t: 'llmFixElement strategic', phase }, {}, { ctx })
      return { needsRegeneration: true }
    }
    const fixedCode = lastFencedBlock(responseText)?.trim()
    if (fixedCode) {
      logger?.info({ t: 'llmFixElement local fix', phase }, { fixedCode }, { ctx })
      return { fixedCode }
    }
    return null
  } catch (e) {
    logger?.error({ t: 'llmFixElement failed', phase }, {}, { ctx, error: e })
    return null
  }
}

function returnError(error, args) {
  if (error?.stack) return { error: error.stack, ...args }
  if (typeof error == 'string') return { error, ...args }
  if (typeof error == 'object') return { error: error.t || error.error || JSON.stringify(error), ...error, ...args, ctx: null }
}

function compileJqExpression(exp, suffix, logger, ctx, operationName) {
  exp = escapeHebrewGershayim(exp)
  const cacheKey = suffix ? exp + suffix : exp
  try {
    return jb.jQRepository[cacheKey] = jb.jQRepository[cacheKey] || coreUtils.compileJb(exp + (suffix || ''))
  } catch (error) {
    logger?.error({t: `compile ${operationName} error`, exp}, {}, {ctx, error})
    throw {t: `compile ${operationName} error`, exp, ctx, error}
  }
}

function executeJq(compiledJq, ctx, logger, exp, operationName, extractor) {
  if (!compiledJq) return null
  try {
    const result = extractor ? extractor(compiledJq(ctx)) : compiledJq(ctx).next().value
    logger?.info({t: operationName}, { exp, res: result }, {ctx})
    return result
  } catch (error) {
    logger?.error({t: `run ${operationName} error`, exp}, {}, {ctx, error})
    throw {t: `run ${operationName} error`, exp, ctx, error}
  }
}

Data('jqArray', {
  params: [
    {id: 'exp', as: 'text'},
  ],
  impl: (ctx, { workflowLogger }, {exp}) => {
    const logger = workflowLogger || ctx.vars.logger
    const compiledJq = compileJqExpression(exp, '| .[]', logger, ctx, 'jqArray')
    const result = executeJq(compiledJq, ctx, logger, exp, 'jqArray', (gen) => Array.from(gen))
    return result || []
  }
})

Data('jqSingle', {
  params: [
    {id: 'exp', as: 'text'},
  ],
  impl: (ctx, { workflowLogger }, {exp}) => {
    const logger = workflowLogger || ctx.vars.logger
    const compiledJq = compileJqExpression(exp, null, logger, ctx, 'jqSingle')
    return executeJq(compiledJq, ctx, logger, exp, 'jqSingle')
  }
})

Data('jqBoolean', {
  moreTypes: 'boolean<common>',
  params: [
    {id: 'exp', as: 'text' }
  ],
  impl: (ctx, { workflowLogger }, {exp}) => {
    const logger = workflowLogger || ctx.vars.logger
    const compiledJq = compileJqExpression(exp, null, logger, ctx, 'jqBoolean')
    return !!executeJq(compiledJq, ctx, logger, exp, 'jqBoolean')
  }
})

Mpi('mpi', {
  params: [
    {id: 'model', as: 'string', dynamic: true,
      options: 'openrouter/google/gemini-2.5-flash-preview-09-2025,anthropic/claude-sonnet-4-5,'
        + 'llama_33_70b_versatile,openrouter/openai/gpt-oss-20b'},
    {id: 'prompt', as: 'text', dynamic: true, byName: true},
    {id: 'instructions', dynamic: true, as: 'text'},
    {id: 'thinkingBudget', as: 'number', dynamic: true}
  ]
})

Guidance('flowSample', {
  params: [
    {id: 'flow', type: 'flow-elem<ai>', dynamic: true},
  ]
})



Component('inputVariable', {
  type: 'concept<llm-guide>',
  params: [
    {id: 'id', as: 'string'},
    {id: 'explanation', type: 'explanationPoint[]', byName: true},
    {id: 'guidance', type: 'guidance[]'}
  ]
})

Component('synonym', {
  type: 'concept<llm-guide>',
  params: [
    {id: 'id', as: 'string', mandatory: true},
    {id: 'of', as: 'text', mandatory: true}
  ]
})

Component('dataComp', {
  type: 'doclet<llm-guide>',
  params: [
    {id: 'id', as: 'string', mandatory: true},
    {id: 'guidance', type: 'guidance[]', mandatory: true, byName: true},
    {id: 'explaination', type: 'explanationPoint[]', mandatory: true},
  ]
})

function resolveCompRefs(prof) {
  if (!prof || typeof prof !== 'object') return
  if (Array.isArray(prof)) return prof.forEach(resolveCompRefs)
  if (typeof prof.$$ === 'string') prof.$ = coreUtils.compByFullId(prof.$$)
  Object.values(prof).forEach(resolveCompRefs)
}
