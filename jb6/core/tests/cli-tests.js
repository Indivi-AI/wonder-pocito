import { dsls, coreUtils } from '@jb6/core'
import '@jb6/testing'
import '@jb6/core/misc/jb-cli.js'
import '@jb6/core/misc/jb-remote.js'         // stripCtx / buildCtx
import '@jb6/core/misc/jb-remote-via-cli.js' // runStrippedCli

// ============================================================================
// OVER-THE-WIRE: run a profile on a process that shares the code, with a stripped slice of the caller's ctx.
//   stripCtx({profileJson, ctx})  → packedCtx (the call's referenced vars/args; bigData→ref; 256K cap)
//   buildCtx(packedCtx)           → Ctx (args back into jbCtx) — run it == running locally
// over a FRESH node process: result returned, testLoggers' logs returned, progressLoggers re-activate local progress.
// ============================================================================
const {
  tgp: { 'ctx-enricher': { Var } },
  common: { Data, boolean: { equals } },
  test: { Test, test: { dataTest } }
} = dsls

const sCalc = Data('sCalc', {
  params: [
    {id: 'p1', as: 'string'},
    {id: 'pDyn1', dynamic: true, defaultValue: '%$v1%-%$p1%'}
  ],
  impl: '%$v1%-%$p1%-%$pDyn1()%'
})

const s2Calc = Data('s2Calc', {
  params: [{id: 'pDyn2', dynamic: true}],
  impl: sCalc('s2-%$pDyn2()%')
})

const stripAndRun = Data('stripAndRun', {
  params: [{id: 'prof', dynamic: true}],
  impl: (ctx, {}, {prof}) => {
    const { stripCtx, buildCtx, tgpProfileToJson } = coreUtils
    const profileJson = tgpProfileToJson(prof.profile)
    const wire = JSON.parse(JSON.stringify(stripCtx({ profileJson, ctx: prof.lexicalCtx })))
    return buildCtx(wire).run(profileJson)
  }
})

Test('stripCtxTest.var', {
  impl: dataTest(stripAndRun({ vars: Var('v1', 'V'), prof: sCalc('P') }), equals('V-P-V-'))
})

Test('stripCtxTest.doubleDynamicTrue', {
  impl: dataTest({
    calculate: stripAndRun({ vars: Var('v1', 'V'), prof: sCalc('P', s2Calc('%$v1%')) }),
    expectedResult: equals('V-P-V-s2-V-V-')
  })
})

// resolve {%$var%} in the SQL's DEFINITION ctx (lexical params like minTotal), merged with the RUNTIME ctx vars (e.g. region).
const lexEmbed = Data('lexEmbed', {
  params: [{id: 'sql', dynamic: true}],
  impl: (ctx, {}, {sql}) => coreUtils.embedBraceVars(sql.profile, sql.lexicalCtx.setVars(ctx.vars))
})

const reportSql = Data('reportSql', {
  params: [{id: 'minTotal', as: 'number'}],
  impl: lexEmbed({ sql: 'total >= {%$minTotal%}' })
})

Test('lexEmbedTest.dynamicEmbedBraceVarsParam', {
  impl: dataTest({
    calculate: reportSql({ minTotal: 200 }),
    expectedResult: equals('total >= 200')
  })
})

// reportSqlVar embeds a runtime VAR (region) AND the lexical param (minTotal) — both via embedBraceVars's {%$ %} token.
const reportSqlVar = Data('reportSqlVar', {
  params: [{id: 'minTotal', as: 'number'}],
  impl: lexEmbed({ sql: '{%$region%} total >= {%$minTotal%}' })
})


// one snippet emits an INFO event, another a PROGRESS event — kept separate so each test reads a single, unambiguous entry.
const sLogInfo = Data('sLogInfo', { impl: ctx => ctx.vars.cliLogger?.info?.({ t: 'theInfo' }, {}, { ctx }) })
const sLogProgress = Data('sLogProgress', { impl: ctx => ctx.vars.cliLogger?.progress?.({ t: 'theProgress' }) })
// a snippet emitting a numeric METRIC — observability: a remote process's perf/metric must ride back via the logger.
const sLogMetric = Data('sLogMetric', { impl: ctx => ctx.vars.cliLogger?.info?.({ t: 'perf', maxRssKb: 29760 }, {}, { ctx }) })

// runOverCli(prof) runs the snippet on a FRESH node process that shares this file's code (like a lambda's package
// index.js). Returns { result, logs, localProgress }: logs = what testLoggers RETURN; localProgress = what progressLoggers
// stream live, captured off the LOCAL eventEmitter (the channel a UI/SSE subscribes to).
const runOverCli = Data('runOverCli', {
  params: [{id: 'prof', dynamic: true}, {id: 'loggers', as: 'string'}],
  impl: async (ctx, {}, {prof, loggers}) => {
    const { stripCtx, tgpProfileToJson, runStrippedCli } = coreUtils
    const profileJson = tgpProfileToJson(prof.profile)
    const packedCtx = stripCtx({ profileJson, ctx: prof.lexicalCtx })
    const localProgress = []
    const onProgress = ev => localProgress.push(ev)
    coreUtils.eventEmitter.on('progress', onProgress)
    const { result, logs } = await runStrippedCli({
      profileJson, packedCtx, imports: { importsStr: "await import('@jb6/core/tests/cli-tests.js')" },
      testLoggers: loggers, progressLoggers: loggers, ctx: ctx.setVars({isProgressConsumer: true})
    })
    coreUtils.eventEmitter.off('progress', onProgress)
    return { result, logs, localProgress }
  }
})

// a VAR (v1) + an ARG (p1) cross the wire; the remote returns the result string.
Test('cliTest.stripCtxRun', {
  HeavyTest: true,
  impl: dataTest({
    calculate: runOverCli({ vars: Var('v1', 'V'), prof: sCalc('P') }),
    expectedResult: equals('V-P-V-', '%result%'),
    timeout: 12000
  })
})

// testLoggers ⇒ the snippet's INFO event is RETURNED in logs (the record), at the end.
Test('cliTest.stripCtxLogs', {
  HeavyTest: true,
  impl: dataTest({
    calculate: runOverCli({ prof: sLogInfo(), loggers: 'cliLogger' }),
    expectedResult: equals('theInfo', '%logs.cliLogger.cliLog.0.t%'),
    timeout: 12000
  })
})

// progressLoggers ⇒ the snippet's PROGRESS event re-activates the LOCAL progress mechanism (eventEmitter) — the UI hook.
Test('cliTest.stripCtxProgress', {
  HeavyTest: true,
  nodeOnly: true,
  impl: dataTest(runOverCli(sLogProgress(), 'cliLogger'), equals('theProgress', '%localProgress.0.t%'), {
    timeout: 12000
  })
})

// OVER THE WIRE (the lambda mechanism, in jb6): dynamic param + embedBraceVars + a var, all crossing to a fresh process.
// stripCtx harvests minTotal (lexical, from the SQL's DEFINITION frame) AND region (a var) → remote lexEmbed resolves both.
Test('cliTest.stripCtxEmbedBraceVars', {
  HeavyTest: true,
  impl: dataTest({
    calculate: runOverCli({ vars: Var('region', 'US'), prof: reportSqlVar({ minTotal: 200 }) }),
    expectedResult: equals('US total >= 200', '%result%'),
    timeout: 12000
  })
})

// OBSERVABILITY over the wire: a numeric metric logged in the remote process rides back in {logs} (like a lambda's duckdb perf).
Test('cliTest.stripCtxMetric', {
  HeavyTest: true,
  impl: dataTest({
    calculate: runOverCli({ prof: sLogMetric(), loggers: 'cliLogger' }),
    expectedResult: equals(29760, '%logs.cliLogger.cliLog.0.maxRssKb%'),
    timeout: 12000
  })
})
