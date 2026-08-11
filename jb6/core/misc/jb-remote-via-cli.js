import { jb } from '@jb6/repo'
import './jb-remote.js'   // stripCtx / buildCtx
import './jb-cli.js'      // runCliInContext (spawn transport + dispatchChildLine logger routing)
const { coreUtils } = jb

// run a profile on a fresh process that SHARES the code, with a packedCtx (from stripCtx). The CALLER supplies
// `imports` ({importsStr, projectDir, importMapsInCli}) — discovery is not this layer's job (a bundled lambda passes
// its index.js; an ad-hoc caller passes lang-service's calcImportsForProfile output). The child rebuilds the ctx via
// buildCtx and runs the profile. Two logger use-cases:
//   - testLoggers     → collected via logsAndErrors() and RETURNED in {logs}. (tests/debug)
//   - progressLoggers → wrapped to stderr live → runCliInContext dispatches into the caller's ctx loggers. (UI progress)
// Returns { result, error?, logs? }.
async function runStrippedCli({ profileJson, packedCtx, imports = {}, testLoggers = '', progressLoggers = '', ctx }) {
  const test = [...new Set(['errorLogger', 'cliLogger', ...testLoggers.split(',').map(s => s.trim()).filter(Boolean)])]   // errorLogger always returned — child errors must reach the caller; cliLogger carries the _phase timing back to the harvest
  const prog = [...new Set(['errorLogger', ...progressLoggers.split(',').map(s => s.trim()).filter(Boolean)])]
  const all = [...new Set([...test, ...prog])]
  // the live sink: dispatchChildLine routes child progress into ctx.vars[logger].progress → eventEmitter (the local
  // progress channel a UI/SSE subscribes to). Default it to a fresh ctx with progressLoggers, so callers needn't manage it.
  ctx = ctx || coreUtils.ensureLoggers(prog)
  const { importsStr = '', projectDir, importMapsInCli } = imports
  const script = `
import { coreUtils } from '@jb6/core'
import '@jb6/core/misc/jb-remote.js'
export async function calc() {
  const tBeforeLambdaLoad = Date.now()
  ${importsStr}
  const lambdaJsCodeLoadMs = Date.now() - tBeforeLambdaLoad
  const loggers = coreUtils.ensureLoggers(${JSON.stringify(all)}, {ctx: coreUtils.ensureLoggers(${JSON.stringify(prog)}, {wrapToStderr: true})}).vars   // prog wrapped to stderr (live), rest just instantiated
  let ctx
  try {
    const tBeforeBuildCtx = Date.now()
    ctx = coreUtils.buildCtx(${JSON.stringify(packedCtx)}).setVars(loggers)
    const tBeforeProfileRun = Date.now()
    const raw = await ctx.run(${JSON.stringify(profileJson)})
    loggers.cliLogger?.info?.({t: 'lambda js code load', lambdaJsCodeLoadMs, buildCtxMs: tBeforeProfileRun - tBeforeBuildCtx, profileRunMs: Date.now() - tBeforeProfileRun}, {}, {ctx})
    if (raw instanceof Error) loggers.errorLogger.error({t: 'remote cli returned Error'}, {}, {ctx, error: raw})
    const result = coreUtils.stripData(raw)
    const metaCliRecords = new Set(['staticImportsLoaded', 'lambda js code load'])   // wrap-to-stderr timing meta - not part of the snippet's own logs
    const stripMeta = (name, le) => name != 'cliLogger' ? le : Object.fromEntries(Object.entries(le).map(([k, arr]) => [k, Array.isArray(arr) ? arr.filter(r => !metaCliRecords.has(r?.t)) : arr]))
    const logs = Object.fromEntries(${JSON.stringify(test)}.filter(n => loggers[n]?.logsAndErrors).map(n => [n, stripMeta(n, loggers[n].logsAndErrors())]))   // testLoggers → returned (inlined: child bundle may predate coreUtils.harvestLogs)
    return ${JSON.stringify(test.length > 0)} ? { result, logs } : { result }
  } catch (e) { loggers.errorLogger.error({t: 'remote cli exception'}, {}, {ctx, error: e}); return { error: e.stack } }
}
`
  const res = await coreUtils.runCliInContext(`${script}\n await coreUtils.writeServiceResult(await calc())`,
    { projectDir, importMapsInCli, bindLoggers: prog.join(','), ctx, stream: 'both' })
  const out = res.result ?? res
  if (out && out.result !== undefined) out.result = coreUtils.resolveRefs(out.result)   // stripData deduped shared refs → rebuild the graph
  return out
}
Object.assign(coreUtils, { runStrippedCli })
