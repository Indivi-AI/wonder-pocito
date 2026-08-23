import { jb, coreUtils } from '@jb6/core'
import '@jb6/core/misc/jb-remote-via-cli.js'
import '@jb6/lang-service/src/tgp-snippet.js'

const asJbComp = c => typeof c == 'string' ? coreUtils.compByFullId(c) : c?.[Symbol.for('asJbComp')] || (c?.$location ? c : null)

const importsFromLoadedLocations = (profile, repoRoot) => {
  const seen = new Set(), paths = [], urlToRepoDir = { '/jb6_packages': 'jb6', '/wonder': 'wonder', '/solution': 'solutions', '/indiviai': 'indiviai' }
  let missing = false
  const abs = p => {
    const dir = Object.keys(urlToRepoDir).find(pre => p.startsWith(pre + '/'))
    return dir ? `${repoRoot}/${urlToRepoDir[dir]}${p.slice(dir.length)}` : p.startsWith('/') ? p : `${repoRoot}/${p}`
  }
  const walkComp = c => {
    if (!c || seen.has(c)) return
    seen.add(c)
    if (!c.$location?.path) { missing = true; return }
    paths.push(abs(c.$location.path))
    walkNode(c.impl)
  }
  const walkNode = node => {
    if (!node || typeof node != 'object' || seen.has(node)) return
    seen.add(node)
    if (node.$) walkComp(asJbComp(node.$))
    Object.values(node).forEach(v => Array.isArray(v) ? v.forEach(walkNode) : walkNode(v))
  }
  walkNode(profile)
  if (missing) return null
  const topLevelImports = coreUtils.unique(paths)
  return { topLevelImports, importsStr: topLevelImports.map(f => `await import('${f}')`).join('\n'), projectDir: repoRoot,
    importMapsInCli: jb.coreRegistry.importMapsInCli, compsWalked: seen.size }
}

coreUtils.runUnPackagedInLiveRepo = async (ctx, compToRun) => {
  const log = ctx.vars.lambdaLogger
  const profile = coreUtils.tgpProfileToJson(compToRun.profile), repoRoot = await coreUtils.calcRepoRoot()
  await coreUtils.calcJb6RepoRootAndImportMapsInCli()
  const fast = importsFromLoadedLocations(compToRun.profile, repoRoot)
  const imp = fast || await coreUtils.calcImportsForProfile(profile, { entryPointPaths: [`${repoRoot}/tests/all-tests.js`], ctx })
  log?.info?.({ event: fast ? 'entry paths from loaded $location (fast, no parse)' : 'loaded $location incomplete → parsed discover (slow)',
    strategy: 'unPackagedInLiveRepo', files: imp?.topLevelImports?.length, compsWalked: fast?.compsWalked }, { imp }, { ctx })
  if (!imp || imp.error) { log?.error?.({ event: 'discover failed → skip', strategy: 'unPackagedInLiveRepo', error: imp?.error }, { imp }, { ctx }); return null }
  const packedCtx = coreUtils.stripCtx({ profileJson: profile, ctx: compToRun.lexicalCtx })
  packedCtx.vars.db = 'gcs'
  const loggers = coreUtils.activeLoggers(ctx)
  log?.info?.({ event: 'spawning child CLI to run packed profile', strategy: 'unPackagedInLiveRepo', loggers,
    ctxVars: Object.keys(packedCtx.vars || {}) }, {}, { ctx })
  const res = await coreUtils.runStrippedCli({ profileJson: profile, packedCtx, imports: imp, testLoggers: loggers, progressLoggers: loggers, ctx })
  if (res?.error) { log?.error?.({ event: 'run failed → skip', strategy: 'unPackagedInLiveRepo', error: res.error }, { childLogs: res.logs }, { ctx }); return null }
  log?.info?.({ event: 'child CLI returned ok', strategy: 'unPackagedInLiveRepo', resultRows: Array.isArray(res.result) ? res.result.length : typeof res.result }, {}, { ctx })
  return res.result
}
