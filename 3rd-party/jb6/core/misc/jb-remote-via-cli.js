import { jb } from '@jb6/repo'
import './jb-remote.js'   // stripCtx / buildCtx
import './jb-cli.js'      // runCliInContext (spawn transport + dispatchChildLine logger routing)
const { coreUtils } = jb

// run a profile on a fresh process that SHARES the code, with a packedCtx (from stripCtx). The CALLER supplies
// `imports` ({importsStr, projectDir, importMapsInCli}) — discovery is not this layer's job (a bundled lambda passes
// its index.js; an ad-hoc caller passes lang-service's calcImportsForProfile output). The child rebuilds the ctx via
// buildCtx and runs the profile. Two logger use-cases:
//   - testLoggers     → collected via logsAndErrors() and RETURNED in {logs}. (tests/debug)
//   - progressLoggers → emitted to stderr live for UI progress.
// Returns { result, error?, logs? }.
async function runStrippedCli({ profileJson, packedCtx, imports = {}, testLoggers = '', progressLoggers = '', ctx }) {
  const test = [...new Set(['errorLogger', 'cliLogger', ...testLoggers.split(',').map(s => s.trim()).filter(Boolean)])]   // errorLogger always returned — child errors must reach the caller; cliLogger carries the _phase timing back to the harvest
  const prog = progressLoggers.split(',').map(s => s.trim()).filter(Boolean)
  const all = [...new Set([...test, ...prog])]
  ctx = coreUtils.ensureLoggers(prog, {
    ctx: (ctx || new coreUtils.Ctx()).setVars({loggersNeededForUiProgress: progressLoggers})
  })
  const { importsStr = '', projectDir, importMapsInCli } = imports
  const script = `
import { coreUtils } from '@jb6/core'
import '@jb6/core/misc/jb-remote.js'
export async function calc() {
  const tBeforeLambdaLoad = Date.now()
  ${importsStr}
  const lambdaJsCodeLoadMs = Date.now() - tBeforeLambdaLoad
  const loggers = coreUtils.ensureLoggers(${JSON.stringify(all)}, {ctx: new coreUtils.Ctx({vars: {loggersNeededForUiProgress: ${JSON.stringify(progressLoggers)}, progressToStderr: true}})}).vars
  try {
    const tBeforeBuildCtx = Date.now()
    const ctx = coreUtils.buildCtx(${JSON.stringify(packedCtx)}).setVars(loggers)
    const tBeforeProfileRun = Date.now()
    const raw = await ctx.run(${JSON.stringify(profileJson)})
    loggers.cliLogger?.info?.({t: 'lambda js code load', lambdaJsCodeLoadMs, buildCtxMs: tBeforeProfileRun - tBeforeBuildCtx, profileRunMs: Date.now() - tBeforeProfileRun}, {}, {ctx})
    if (raw instanceof Error) process.stderr.write('CHILD_ERR_STACK '+raw.stack+'\\n')   // log to delete
    const result = coreUtils.stripData(raw)
    const metaCliRecords = new Set(['lambda js code load'])
    const stripMeta = (name, le) => name != 'cliLogger' ? le : Object.fromEntries(Object.entries(le).map(([k, arr]) => [k, Array.isArray(arr) ? arr.filter(r => !metaCliRecords.has(r?.t)) : arr]))
    const logs = Object.fromEntries(${JSON.stringify(test)}.filter(n => loggers[n]?.logsAndErrors).map(n => [n, stripMeta(n, loggers[n].logsAndErrors())]))   // testLoggers → returned (inlined: child bundle may predate coreUtils.harvestLogs)
    return ${JSON.stringify(test.length > 0)} ? { result, logs } : { result }
  } catch (e) { process.stderr.write('CHILD_CATCH_STACK '+e.stack+'\\n'); return { error: e.stack } }
}
`
  const res = await coreUtils.runCliInContext(`${script}\n await coreUtils.writeServiceResult(await calc())`,
    {projectDir, importMapsInCli, ctx})
  const out = res.result ?? res
  if (out && out.result !== undefined) out.result = coreUtils.resolveRefs(out.result)   // stripData deduped shared refs → rebuild the graph
  return out
}
Object.assign(coreUtils, { runStrippedCli })
