import { coreUtils, dsls, jb } from '@jb6/core'
import { langServiceUtils } from './lang-service-parsing-utils.js'
import '@jb6/core/misc/import-map-services.js'
import './tgp-model-data.js' // provides coreUtils.calcImportsForProfile
const { calcProfileActionMap } = langServiceUtils
import { parse } from '../lib/acorn-loose.mjs'

const { runCliInContext, toCapitalType, calcRepoRoot, unique } = coreUtils
Object.assign(coreUtils, { runSnippetCli, macroToJson })

function macroToJson(macroText, tgpModel) {
  const cleanText = macroText.replace(/^[^<]+<[^>]+>:?/, '')
  const allComps = Object.values(tgpModel.dsls).flatMap(type => Object.values(type)).filter(x => typeof x == 'object').flatMap(x => Object.values(x))
  const firstCallee = parse(cleanText, { ecmaVersion: 'latest', sourceType: 'module' }).body[0]?.expression?.callee
  const firstName = firstCallee?.name || [firstCallee?.object?.name, firstCallee?.property?.name].join('.')
  const { type } = allComps.find(c => c.id === firstName) || { type: 'data' }
  const compText = `${toCapitalType(type)}('noName',{impl: ${cleanText}})`
  const { comp, error } = calcProfileActionMap(compText, { tgpModel })
  if (error) return { error }
  return toJson(comp.impl)
}

function toJson(v) {
  if (v == null || typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map(toJson)
  return Object.fromEntries(Object.keys(v).filter(k => k[0] !== '$' || k === '$').map(k =>
    [k, k === '$' ? (v.$$ || v.$) : toJson(v[k])]))
}

async function runSnippetCli(args) {
  const _t0 = Date.now()
  const repoRoot = args.repoRoot || await calcRepoRoot({ ctx: args.ctx })
  const developerEntryPoint = await jb.coreRegistry.developerEntryPoint
  args.entryPointPaths ||= developerEntryPoint && coreUtils.asArray(developerEntryPoint)
  const _tRepoRoot = Date.now()
  const loggerNames = (args.logger || '').split(',').map(s => s.trim()).filter(Boolean)
  const loggersNeededForUiProgress = args.ctx?.vars?.loggersNeededForUiProgress || args.loggersNeededForUiProgress || ''
  const ctx = args.ctx || (loggerNames.length || loggersNeededForUiProgress
    ? coreUtils.ensureLoggers(loggerNames, {
        ctx: new coreUtils.Ctx({vars: {loggersNeededForUiProgress}})
      })
    : undefined)
  const toJson = p => p == null ? p : typeof p === 'string' ? p : JSON.stringify(coreUtils.tgpProfileToJson(p))
  const profileText = toJson(args.profile ?? args.profileText)
  const ctxEnricher = toJson(args.ctxEnricher)
  const harvest = () => ctx ? coreUtils.harvestLogs(ctx, loggerNames) : {}

  if (!coreUtils.isNode) {
    const script = `import { coreUtils } from '@jb6/core'
import '@jb6/lang-service'
;(async()=>{ try {
  await coreUtils.writeServiceResult(await coreUtils.runSnippetCli(${JSON.stringify({ ...args, profile: undefined, profileText,
    ctxEnricher, repoRoot, loggersNeededForUiProgress, logger: undefined, ctx: undefined })}))
} catch (e) { console.error(e) } })()`
    const res = await coreUtils.runCliInContext(script, {ctx})
    return { ...(res.result || res), ...harvest() }
  }

  // same file cache as calcImportsForProfile (coreUtils.hashAndGetCache): key = hash(cacheQuery + graph mtimes).
  // here we cache the WHOLE snippet run (imports build + child spawn), so a hit skips the ~825ms child too.
  const allDsls = unique([...(profileText + (ctxEnricher || '')).matchAll(/["']\$["']\s*:\s*["']([^"']+)<([^"']+)>/g)].map(m => m[2]))
  const isTestProfile = /(?:["']\$["']|\$)\s*:\s*["']test<test>/.test(profileText)
  const modelResources = {forRepo: args.entryPointPaths ? undefined : repoRoot, forDsls: allDsls.join(','),
    fetchByEnvHttpServer: args.fetchByEnvHttpServer, entryPointPaths: args.entryPointPaths}
  const cacheQuery = {snippet: true, profileText, ctxEnricher: ctxEnricher || '', repoRoot: repoRoot || '', entryPointPaths: [].concat(args.entryPointPaths || []).join(',')}
  const { result: cached, key: cacheKey } = await coreUtils.hashAndGetCache({cacheQuery, modelResources, fetchByEnvHttpServer: args.fetchByEnvHttpServer}, ctx)
  if (cached && !isTestProfile && !loggersNeededForUiProgress && !loggerNames.length) {
    ctx?.vars?.snippetLogger?.info?.({t: 'runSnippetCli cacheHit', preSpawnMs: Date.now() - _t0}, {}, {ctx})
    return { ...cached, ...harvest() }
  }

  const res = await calcJsonProfileScript({...args, ctx, loggersNeededForUiProgress, profileText, ctxEnricher, repoRoot})
  ctx?.vars?.snippetLogger?.info?.({t: 'runSnippetCli preSpawn', calcRepoRootMs: _tRepoRoot - _t0,
    calcImportsMs: Date.now() - _tRepoRoot, preSpawnMs: Date.now() - _t0, fileCount: res.topLevelImports?.length}, {}, {ctx})
  const { ecmScript, projectDir, importMapsInCli, topLevelImports, error } = res
  if (error) return { ...res, ...harvest() }
  try {
    const result = await runCliInContext(
      `${ecmScript}\n await coreUtils.writeServiceResult(await calc())`,
      {projectDir, importMapsInCli, ctx}
    )
    ctx?.vars?.snippetLogger?.info?.({
      t: 'runSnippetCli child result', hasResult: result.result != null,
      resultKeys: Object.keys(result.result || {}), error: result.error && String(result.error), code: result.code,
      stderrTail: result.stderr?.slice(-500), stdoutTail: result.textToParse?.slice(-500)
    }, {}, {ctx})
    const value = { ...result.result, topLevelImports }   // JSON-safe run result (logs excluded - harvested per call)
    if (!isTestProfile && !value.error) await coreUtils.writeTgpModelCache(cacheKey, value)
    return { ...value, ...harvest() }
  } catch (error) {
    return { error, ecmScript, projectDir, importMapsInCli, ...harvest() }
  }
}

async function calcJsonProfileScript({profileText, repoRoot, fetchByEnvHttpServer, loggersNeededForUiProgress, ctxEnricher, entryPointPaths, ctx}) {
  const _tImp = Date.now()
  const imp = await coreUtils.calcImportsForProfile(profileText + (ctxEnricher || ''), {repoRoot, fetchByEnvHttpServer, entryPointPaths, ctx})
  ctx?.vars?.snippetLogger?.info?.({t: 'calcImportsForProfile', ms: Date.now() - _tImp, fileCount: imp.topLevelImports?.length}, {}, {ctx})
  if (imp.error) return imp
  const { importsStr, projectDir, importMapsInCli } = imp
  const enrichStmt = ctxEnricher ? `.run(${ctxEnricher})` : ''
  const loggerSetup = `
    const loggerCtx = coreUtils.ensureLoggers(${JSON.stringify(loggersNeededForUiProgress)}, {ctx: new coreUtils.Ctx({vars:
      {loggersNeededForUiProgress: ${JSON.stringify(loggersNeededForUiProgress)}, progressToStderr: true}})})${enrichStmt}
    const result = await loggerCtx.run(${profileText})`
  const ecmScript = `
  // dir: ${projectDir}
import { coreUtils } from '@jb6/core'
export async function calc() {
  ${importsStr}
  try {${loggerSetup}
    return {result: coreUtils.stripData(result)}
  } catch (e) {
    return {error: e.stack || String(e)}
  }
}
`
  return { ecmScript, projectDir, importMapsInCli, topLevelImports: imp.topLevelImports }
}
