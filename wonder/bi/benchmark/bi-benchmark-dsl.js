import { dsls, coreUtils, jb } from '@jb6/core'
import '../duckdb-utils.js'
import '../bi-dsl.js'
import '../bi-manifest.js'
import '@wonder/db/room-lambda-client.js'
import '@wonder/db/db-drivers-utils.js'

const { formatTimeWithRandom } = jb.wonderUtils

const {
  tgp: { TgpType },
  bi: {cube: { cubeless } },
  common: { Data, Lambda, data: { cubeQuery, invokeSnippetInContext }, boolean: { equals } },
  lambda: { 'lambda-packaging': { roomLambda } }
} = dsls

const QueryCase = TgpType('query-case', 'bi', {
  typescript: `{
    sql: DynamicSql
    cube: Cube
    setup(ctx: Ctx): Ctx | Promise<Ctx>
    expectedResult(ctxWithRows: Ctx): boolean | Promise<boolean>
    maxScanMB?: number
    maxScanTimeFor4Cores?: number
  }`
})
const QueryEnvironment = TgpType('query-environment', 'bi', {
  typescript: `{
    id: string
    cores?: number
    prepare(queryCase: DynamicQueryCase, ctx: Ctx): Promise<{
      clearCache(): void | Promise<void>
      run(): Promise<{rows: any, queryMs: number, valid: boolean}>
      close(): void | Promise<void>
    }>
  }`
})

QueryCase('queryCase', {
  params: [
    { id: 'sql', as: 'text', dynamic: true, mandatory: true },
    { id: 'cube', type: 'cube<bi>', defaultValue: cubeless(), byName: true },
    { id: 'setup', type: 'ctx-enricher<tgp>', dynamic: true },
    { id: 'expectedResult', type: 'boolean<common>', dynamic: true, defaultValue: true },
    { id: 'maxScanMB', as: 'number' },
    { id: 'maxScanTimeFor4Cores', as: 'number' }
  ]
})

Data('runQueryCase', {
  params: [
    {id: 'queryCase', type: 'query-case<bi>', mandatory: true}
  ],
  impl: async (ctx, {}, { queryCase }) => {
    const queryCtx = queryCase.setup.profile ? await queryCase.setup(ctx) : ctx
    if (queryCtx.vars.queryCaseError)
      return { error: queryCtx.vars.queryCaseError }
    return cubeQuery.$runWithCtx(queryCase.sql.lexicalCtx.setVars(queryCtx.vars).setData(queryCtx.data),
      { sql: queryCase.sql.profile, cube: queryCase.cube })
  }
})

const biBenchmarkRunner = Lambda('biBenchmarkRunner', {
  permissionByPath: 'usersRO',
  params: [
    {id: 'queryCase', type: 'query-case<bi>', mandatory: true},
    {id: 'cold', as: 'boolean', type: 'boolean<common>'}
  ],
  impl: async (ctx, {}, { queryCase, cold }) => {
    let at = performance.now()
    const queryCtx = queryCase.setup.profile ? await queryCase.setup(ctx) : ctx
    const setupMs = performance.now() - at
    at = performance.now()
    if (cold) await jb.biUtils.clearDuckdbCache()
    const clearMs = performance.now() - at
    at = performance.now()
    const rows = await cubeQuery.$runWithCtx(queryCase.sql.lexicalCtx.setVars(queryCtx.vars).setData(queryCtx.data),
      { sql: queryCase.sql.profile, cube: queryCase.cube })
    const queryMs = performance.now() - at
    at = performance.now()
    const { duckDBProfiling: profiling } = ctx.vars.duckDBProfilingLogger.logsAndErrors()
    const profilingMs = performance.now() - at
    const runtime = coreUtils.isNode
      ? { instance: globalThis.process.env.HOSTNAME, revision: globalThis.process.env.K_REVISION }
      : { instance: 'browser-wasm' }
    return { rows, setupMs, clearMs, queryMs, profilingMs, profiling, runtime, valid: true }
  }
})

QueryEnvironment('queryEnvironment', {
  params: [
    {id: 'prepare', dynamic: true, mandatory: true},
    {id: 'cores', as: 'number'}
  ],
  impl: (ctx, {}, { prepare, cores }) => ({
    id: coreUtils.callerCompId(ctx.jbCtx),
    cores,
    prepare: (queryCase, prepareCtx) => prepare(prepareCtx.setVars({ queryCase }))
  })
})

QueryEnvironment('wasm', {
  impl: QueryEnvironment.queryEnvironment({
    cores: 4,
    prepare: async (ctx, { queryCase }) => {
      const wasmCtx = ctx.setVars({ categories: { ...ctx.vars.categories, gcshttpblockedbycors: true } })
      let cold
      return {
        clearCache: () => { cold = true },
        async run() {
          const result = await biBenchmarkRunner.$runWithCtx(wasmCtx, queryCase.profile, !!cold)
          cold = false
          return result
        },
        close() {}
      }
    }
  })
})

QueryEnvironment('localFs', {
  impl: QueryEnvironment.queryEnvironment({
    prepare: async (ctx, { queryCase }) => {
      const queryCaseProfile = coreUtils.tgpProfileToJson(queryCase.profile)
      const profile = cold => coreUtils.tgpProfileToJson(biBenchmarkRunner(queryCaseProfile, cold))
      const repoRoot = await coreUtils.calcRepoRoot()
      const source = coreUtils.compByFullId(coreUtils.compIdOfProfile(queryCase.profile)).$location.path
        .replace(/^\/wonder\//, '@wonder/')
      const imports = coreUtils.isNode
        ? await coreUtils.calcImportsForProfile(profile(false), { ctx })
        : {
            topLevelImports: [source], importsStr: `await import('${source}')`, projectDir: repoRoot,
            importMapsInCli: `${repoRoot}/nodejs-importmap.js`
          }
      if (imports.error) throw new Error(imports.error)
      let cold
      return {
        clearCache: () => { cold = true },
        async run() {
          const profileJson = profile(cold), packedCtx = coreUtils.stripCtx({ profileJson, ctx: queryCase.lexicalCtx })
          packedCtx.vars.db = 'fs'
          const res = await coreUtils.runStrippedCli({
            profileJson, packedCtx, imports, testLoggers: coreUtils.activeLoggers(ctx), progressLoggers: 'benchmarkLogger', ctx
          })
          cold = false
          if (res.error) throw new Error(res.error)
          Object.entries(res.logs || {}).forEach(([name, logs]) =>
            Object.entries(logs).forEach(([channel, entries]) => {
              if (Array.isArray(ctx.vars[name]?.[channel]) && Array.isArray(entries))
                ctx.vars[name][channel].push(...entries.filter(entry => entry.severity !== 'progress'))
            }))
          return res.result
        },
        close() {}
      }
    }
  })
})

QueryEnvironment('cloud', {
  params: [
    { id: 'roomWUrl', as: 'string', defaultValue: '%$roomWUrl%' },
    { id: 'lambdaHost', as: 'string', defaultValue: '%$lambdaHost%' }
  ],
  impl: QueryEnvironment.queryEnvironment({
    prepare: async (ctx, { queryCase }) => {
      const roomWUrl = ctx.exp('%$roomWUrl%'), lambdaHost = ctx.exp('%$lambdaHost%') || 'https://w-staging.indivi.ai'
      const queryCaseProfile = coreUtils.tgpProfileToJson(queryCase.profile)
      let cold
      return {
        clearCache: () => { cold = true },
        async run() {
          const result = await invokeSnippetInContext.$runWithCtx(ctx.setVars({ roomWUrl, lambdaHost }),
            biBenchmarkRunner(queryCaseProfile, cold), { pack: roomLambda() })
          cold = false
          if (!result || result.error) return { error: result?.error || 'cloud benchmark request failed' }
          return result
        },
        close() {}
      }
    }
  })
})

Data('compareBenchmarks', {
  params: [
    { id: 'queryCase', type: 'query-case<bi>', dynamic: true, mandatory: true },
    { id: 'environments', type: 'query-environment<bi>[]', mandatory: true },
    { id: 'warmRuns', as: 'number', defaultValue: 1 },
    { id: 'clearBeforeRun', as: 'boolean', defaultValue: true }
  ],
  impl: async (ctx, {}, { queryCase, environments, warmRuns, clearBeforeRun }) => {
    ctx = ctx.setVars({ benchmarkRunId: ctx.vars.benchmarkRunId || formatTimeWithRandom() })
    const log = ctx.vars.benchmarkLogger, queryCaseId = coreUtils.compIdOfProfile(queryCase.profile)
    const results = await Promise.all(environments.map(async environment => {
      const envCtx = coreUtils.ensureLoggers('duckDBProfilingLogger,colsCacheLogger,biDownloadLogger', { ctx })
      const step = phase => `${queryCaseId}.${environment.id}.${phase}`
      let at = performance.now()
      log?.step(step('prepare'), `Preparing ${environment.id}`)
      const prepared = await environment.prepare(queryCase, envCtx)
      const preparationMs = performance.now() - at
      log?.stepDone(step('prepare'), `${environment.id} prepared in ${preparationMs.toFixed(1)}ms`)
      const runType = clearBeforeRun ? 'cold' : 'warm'
      log?.step(step(runType), `Running ${environment.id} ${runType}`)
      if (clearBeforeRun) await prepared.clearCache()
      const cold = await prepared.run()
      if (cold.error) return { queryCase: queryCaseId, environment: environment.id, error: cold.error }
      log?.stepDone(step(runType), `${environment.id} ${runType} ${cold.queryMs.toFixed(1)}ms`)
      const warm = []
      for (let i = 0; i < warmRuns; i++) {
        log?.stepPct(step('warm'), 100 * i / warmRuns, `Running ${environment.id} warm ${i + 1}/${warmRuns}`)
        warm.push(await prepared.run())
      }
      if (warmRuns) log?.stepDone(step('warm'), `${environment.id} warm complete`)
      const profiling = cold.profiling || {}
      const checks = {
        scanMB: queryCase.maxScanMB == null || profiling.bytesScanned == null ? undefined : profiling.bytesScanned <= queryCase.maxScanMB * 1e6,
        scanTimeFor4Cores: environment.cores !== 4 || queryCase.maxScanTimeFor4Cores == null || profiling.scanMs == null
          ? undefined : profiling.scanMs <= queryCase.maxScanTimeFor4Cores
      }
      const result = { benchmarkRunId: ctx.vars.benchmarkRunId, queryCase: queryCaseId, environment: environment.id, preparationMs, cold, warm, profiling,
        checks, valid: cold.valid && warm.every(run => run.valid) && !Object.values(checks).includes(false) }
      await prepared.close()
      log?.info?.({ t: 'benchmark.result', ...result }, {}, { ctx })
      log?.progress({ queryCase: queryCaseId, environment: environment.id, step: step('complete'), status: 'done',
        t: `${environment.id} comparison completed`, result })
      return result
    }))
    return results
  }
})
