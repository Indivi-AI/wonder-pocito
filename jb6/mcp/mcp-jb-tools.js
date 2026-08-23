import { dsls, coreUtils } from '@jb6/core'
import '@jb6/common'
import '@jb6/jq'
import '@jb6/llm-guide/guide-generator.js'
import '@jb6/core/misc/import-map-services.js'
import '@jb6/react'
import '@jb6/mcp'

const {
  tgp: { Component, 'ctx-enricher': { Var } },
  common: { Data,
    data: { asIs, bookletsContent, filter, join, keys, pipe, pipeline, split, tgpModel }
  },
  mcp: { Tool,
    tool: { mcpTool }
  },
  react: { ReactComp,
    'react-comp': { comp }
  }
} = dsls

Tool('setupInfo', {
  description: 'setUpInfo of the mcp server',
  impl: mcpTool(() => `repoRoot: ${jb.coreRegistry.repoRoot}, jb6Root: ${jb.coreRegistry.jb6Root}`)
})

Tool('repoRoot', {
  description: 'get repo root',
  impl: mcpTool(() => jb.coreRegistry.repoRoot)
})

Tool('scanDsl', {
  description: `map a dsl (or comma-separated dsls) from the registered model: its TgpType defs and, grouped by the file that defines them,
its comps and tests. details: files|comps|all-comps-with-params|full`,
  params: [
    {id: 'dsl', as: 'string', asIs: true, defaultValue: 'common', description: 'comma separated e.g. test,llm-guide,common' },
    {id: 'details', as: 'string', asIs: true, defaultValue: 'files', description: `files=TgpTypes+file names, comps=+comps grouped by TgpType
(first 3 per type, +N more) with #params & impl length, all-comps-with-params=all comps grouped by TgpType with their params, full=+full source of each file`},
  ],
  impl: mcpTool(async (ctx, {}, {dsl, details}) => {
    await import('@jb6/lang-service')
    return coreUtils.scanDsl({dsl, details, entryPointPaths: await coreUtils.resolveDeveloperEntryPoint(ctx), ctx})
  })
})

Tool('sourceCodeOfComp', {
  description: 'F12 get source code and fileName:line for a tgp comp',
  params: [
    {id: 'cmpFullId', as: 'string', asIs: true },
  ],
  impl: mcpTool(async (ctx, {}, {cmpFullId}) => {
    await import('@jb6/lang-service')
    const repoRoot = await coreUtils.calcRepoRoot()
    const { staticMappings } = await coreUtils.calcImportData({forRepo: repoRoot})
    const tgpModel = await coreUtils.calcTgpModelData({entryPointPaths: await coreUtils.resolveDeveloperEntryPoint(ctx)})
    const loc = coreUtils.compByFullId(cmpFullId, tgpModel)?.$location
    if (!loc) return `comp not found: ${cmpFullId}`
    const src = await coreUtils.fetchByEnv(loc.path, staticMappings)
    return `${loc.path}:${loc.line}\n${src.split('\n').slice(loc.line, loc.to.line).join('\n')}`
  })
})

Tool('formatAndValidateTgpComp', {
  description: 'Format a TGP component and update its source file',
  params: [
    {id: 'fullCompId', as: 'string', asIs: true, mandatory: true,
      description: `full component ID, e.g. test<test>coreTest.HelloWorld`},
    {id: 'logger', as: 'string', asIs: true, description: `comma-separated loggers, e.g. langServiceLogger`},
  ],
  impl: mcpTool(async (ctx, {}, {fullCompId, logger}) => {
    const loggerNames = (logger || '').split(',').map(x=>x.trim()).filter(Boolean)
    const logCtx = coreUtils.ensureLoggers(loggerNames, {ctx})
    const done = result => JSON.stringify({...result, ...coreUtils.harvestLogs(logCtx, loggerNames)}, null, 2)
    try {
      await import('@jb6/lang-service')
      const repoRoot = await coreUtils.calcRepoRoot()
      const tgpModel = await coreUtils.calcTgpModelData({entryPointPaths: await coreUtils.resolveDeveloperEntryPoint(logCtx)}, logCtx)
      const comp = coreUtils.compByFullId(fullCompId, tgpModel)
      if (!comp?.$location) throw new Error(`fullCompId '${fullCompId}' not found`)
      const {readFile, writeFile} = await import('fs/promises')
      const {lineColToOffset, calcProfileActionMap} = jb.langServiceUtils
      const {importMap, staticMappings} = await coreUtils.calcImportData({forRepo: repoRoot})
      const {to} = comp.$location
      const path = coreUtils.resolveWithImportMap(comp.$location.path, importMap, staticMappings) || comp.$location.path
      const src = await readFile(path, 'utf8')
      const from = lineColToOffset(src, comp.$location), end = lineColToOffset(src, to)
      const {comp: parsedComp, compDef, error} = calcProfileActionMap(src.slice(from, end), {tgpModel, filePath: path, ctx: logCtx})
      if (error || parsedComp?.syntaxError) throw new Error(error?.syntaxError || error || parsedComp.syntaxError)
      const formatted = coreUtils.prettyPrintComp(parsedComp, {tgpModel, filePath: path, initialPath: fullCompId, compDef})
      const changed = formatted != src.slice(from, end)
      if (changed) await writeFile(path, src.slice(0, from) + formatted + src.slice(end))
      logCtx.vars.langServiceLogger?.info?.({t: 'formatComp', fullCompId, path, changed}, {}, {ctx: logCtx})
      return done({fullCompId, path, changed})
    } catch (error) {
      logCtx.vars.langServiceLogger?.warning?.({t: 'formatCompError', fullCompId, error: error.stack || String(error)}, {}, {ctx: logCtx})
      logCtx.vars.errorLogger?.error?.({t: 'formatCompError', fullCompId, error: error.stack || String(error)}, {}, {ctx: logCtx})
      return done({error: error.message || String(error)})
    }
  })
})

Tool('safeEditTgpComp', {
  description: 'Validate and TGP-format a profile, replace it at an existing tgpPath, and optionally probe the changed element immediately',
  params: [
    {id: 'tgpPath', as: 'string', asIs: true, mandatory: true, description: 'type<dsl>id[~path]; array: ~+0 prepend, ~+ append, ~0+ after first, ~!3 delete, ~![3-5] delete range'},
    {id: 'profileText', as: 'string', asIs: true, description: 'New profile; ignored for delete'},
    {id: 'existingProfileText', as: 'string', asIs: true, description: 'Current source; WS ignored; empty/* skips check; ignored for array insert/delete'},
    {id: 'livePreview', as: 'string', asIs: true, description: `optional JSON string: {result?: 'in'|'out'|'all', runner?: 'node', loggers?: {loggerName: true|jq}, probePath?, circuit?}; defaults to the edited path, inferred circuit, node, and out`}
  ],
  impl: mcpTool(async (ctx, {}, {tgpPath, profileText, existingProfileText, livePreview}) => {
    try {
      await import('@jb6/lang-service')
      const previewOptions = livePreview && JSON.parse(livePreview)
      const host = jb.langServiceUtils.localFsHost({ctx})
      jb.ext.tgpTextEditor = {host}
      const result = await dsls.common.data['langService.calcTgpCompChange'].$runWithCtx(ctx, {tgpPath, profileText, existingProfileText})
      await jb.langServiceUtils.applyCompChange({edit: result.compChange, path: result.path, expectedSource: result.source}, {ctx})
      if (host.applyError()) throw host.applyError()
      if (!previewOptions) return result.formattedTgpProfile
      const preview = await coreUtils.runProbePreview(previewOptions.probePath || result.resultTgpPath || tgpPath, previewOptions)
      return JSON.stringify({formattedTgpProfile: result.formattedTgpProfile, livePreview: preview}, null, 2)
    } catch (error) {
      return JSON.stringify({error: error.message || String(error)})
    }
  })
})

Tool('macroToJson', {
  description: `Convert TGP macro syntax to JSON profile. e.g. pipeline([1,2,3], join("-")) → {$: "data<common>pipeline", ...}.
Use tgpModel tool to discover available components.`,
  params: [
    {id: 'macroText', as: 'string', asIs: true, mandatory: true, description: `macro expression, e.g. pipeline([1,2,3], join('-')). Prefix with type<dsl>: for non-common dsls`},
  ],
  impl: mcpTool({
    text: async (ctx, {}, {macroText}) => {
      try {
        await import('@jb6/lang-service')
        const forDsls = macroText.match(/^[^<]+<([^>]+)>/)?.[1] || 'common'
        const tgpModel = await coreUtils.calcTgpModelData({entryPointPaths: await coreUtils.resolveDeveloperEntryPoint(ctx), forDsls })
        if (tgpModel.error) return `Error: ${tgpModel.error}`
        const result = coreUtils.macroToJson(macroText, tgpModel)
        return result.error ? `Error: ${result.error}` : JSON.stringify(result, null, 2)
      } catch (error) {
        return `Error: ${error.stack}`
      }
    }
  })
})

Tool('runTgpSnippet', {
  description: `Execute a TGP profile. TGP: TgpType (abstract type), Component (concrete impl), Profile (JSON instance to run).
TgpType('color', 'css')
Component('rgb', { type: 'color<css>', params: [{id: 'r', as: 'number'}, {id: 'g', as: 'number'}, {id: 'b', as: 'number'}] })
Component('hsl', { type: 'color<css>', ... })
TgpType('gradient', 'css')
Component('linearGradient', { type: 'gradient<css>', params: [{id: 'direction', as: 'string'}, {id: 'stops', type: 'color<css>[]'}] })
Profile: {$: 'gradient<css>linearGradient', direction: 'to right', stops: [{$: 'color<css>rgb', r: 255, g: 99, b: 71}, {$: 'color<css>hsl', h: 45, s: 100, l: 50}]}
Use tgpModel tool to discover available components and their params.`,
  params: [
    {id: 'profileText', as: 'string', asIs: true, mandatory: true, description: `JSON profile to execute, e.g. {$: 'data<common>pipeline', items: [...]}`},
    {id: 'logger', as: 'string', asIs: true, description: `comma-separated loggers, e.g. snippetLogger,langServiceLogger,dbLogger`},
    {id: 'repoRoot', as: 'string', asIs: true, description: `cross-repo: target repo root, e.g. /home/shaiby/projects/wonder`},
    {id: 'fetchByEnvHttpServer', as: 'string', description: `cross-repo: http server serving that repo, e.g. http://localhost:3000`},
  ],
  impl: mcpTool({
    text: async (ctx, {}, args) => {
      try {
        await import('@jb6/lang-service')
        const res = await coreUtils.runSnippetCli(args)
        return JSON.stringify(res, null, 2)
      } catch (error) {
        return `Error running snippet: ${error.stack}`
      }
    }
  })
})

Tool('runProbe', {
  description: `Probe a TGP circuit: run it and capture intermediate {in,out} at a probePath.
A probePath addresses a location inside a runnable circuit, e.g.
'test<test>coreTest.HelloWorld~impl~calculate~operators~0' or 'data<common>cmpA~impl'.
Returns the recorded {in,out} at that path plus visits, circuitRes, logs and errors.`,
  params: [
    {id: 'probePath', as: 'string', asIs: true, mandatory: true, description: `probe path, e.g. test<test>myTest~impl~expectedResult~items~0`},
    {id: 'resolution', as: 'string', options: 'default,input,output,all', defaultValue: 'default',
      description: `result detail: 'default' = {in,out} at path + visits + circuitRes + errors; 'input'/'output' = only that side; 'all' adds logs, cmd, imports`},
    {id: 'circuit', as: 'string', description: `force circuit comp id (overrides auto-detect), e.g. test<test>circuitForAA`},
    {id: 'logger', as: 'string', description: `comma-separated loggers, e.g. snippetLogger,langServiceLogger,dbLogger`},
    {id: 'repoRoot', as: 'string', description: `cross-repo: target repo root, e.g. /home/shaiby/projects/wonder`},
    {id: 'fetchByEnvHttpServer', as: 'string', description: `cross-repo: http server serving that repo, e.g. http://localhost:3000`},
  ],
  impl: mcpTool({
    text: async (ctx, {}, {probePath, resolution, circuit, logger, repoRoot, fetchByEnvHttpServer}) => {
      try {
        await import('@jb6/lang-service')
        const res = await coreUtils.runProbeCli(probePath, {
          circuitCmpId: circuit, logger, forRepo: repoRoot, fetchByEnvHttpServer, resolution
        })
        return JSON.stringify(res, null, 2)
      } catch (error) {
        return `Error running probe: ${error.stack}`
      }
    }
  })
})

Tool('runTest', {
  description: 'Run a jb6 test by its test ID. Wraps the test as a snippet and executes it.',
  params: [
    {id: 'testId', as: 'string', asIs: true, mandatory: true, description: 'The test ID to run (e.g., "jqTest.tryCatch")'},
    {id: 'logger', as: 'string', asIs: true,
      description: `comma-separated loggers, e.g. snippetLogger,langServiceLogger,dbLogger. OVERRIDES the test's own logger list.`},
  ],
  impl: mcpTool({
    text: async (ctx, {}, {testId, logger}) => {
      try {
        await import('@jb6/lang-service')
        const ctxEnricher = logger ? {$: 'ctx-enricher<tgp>setVars', obj: {$: 'data<common>asIs', val: {overrideTestLoggers: logger}}} : undefined
        return coreUtils.runSnippetCli({profileText: `{$: 'test<test>${testId}'}`, logger, ctxEnricher})
      } catch (error) {
        return `Error running test: ${error.stack || error}`
      }
    }
  })
})

Tool('scrambleText', {
  description: 'Hide/reveal learning content for predict-then-verify methodology. Encodes text to prevent accidental answer viewing during quiz preparation.',
  params: [
    {id: 'texts', as: 'string', asIs: true, mandatory: true, description: 'content to hide/reveal, separate multiple parts with ##'},
    {id: 'unscramble', as: 'string', description: '"true" to reveal hidden content, omit to hide content'}
  ],
  impl: mcpTool(pipeline('%$texts%', split('##'),
    ({data}, {}, { unscramble }) => unscramble.toLowerCase() == 'true' ? atob(data.split('').reverse().join('')) : btoa(data).split('').reverse().join(''),
    join('##\n')
  ))
})

const playwrightHarvest = Data('playwrightHarvest', {
  description: `Load a tests.html, react-comp-view.html or room applet URL in Chromium, run ui-action<react> automation and harvest its loggers and browser errors.
Returns { done, errors, logs, html?, timeline }.`,
  params: [
    {id: 'url', as: 'string', asIs: true, mandatory: true},
    {id: 'automation', type: 'ui-action<react>', dynamic: true},
    {id: 'timeout', as: 'number', defaultValue: 5000, description: 'ms to wait for the page to mount and its uiAction to finish'},
    {id: 'domSelector', as: 'string', description: 'optional css selector; when set returns that element outerHTML'},
    {id: 'seedLocalStorage', as: 'string', asIs: true,
      description: 'id of a data<common> comp whose result object seeds localStorage before boot'},
  ],
  impl: async (ctx, {}, {url, automation, timeout, domSelector, seedLocalStorage}) => {
    let seed = null
    await coreUtils.ensureImportMapsInCli() // needed for external repos with import maps
    if (seedLocalStorage) {
      await import('@jb6/lang-service')
      const { result, error } = await coreUtils.runSnippetCli({ profileText: `{$: 'data<common>${seedLocalStorage}'}`,
        ctxEnricher: {$: 'ctx-enricher<tgp>setVars', obj: {$: 'data<common>asIs',
          val: {localhostServer: new URL(url).origin, seedNonce: Date.now()}}} })
      if (error) return {error: `seedLocalStorage '${seedLocalStorage}' failed: ${error}`}
      seed = result
    }
    let redirect = null
    const res = await fetch(url, { redirect: 'manual' })
    if (res.status >= 300 && res.status < 400) {
      const location = new URL(res.headers.get('location'), url).href
      redirect = { from: url, status: res.status, to: location }
      url = location
    }
    const targetUrl = new URL(url)
    targetUrl.searchParams.set('automation', automation.profile
      ? JSON.stringify(coreUtils.tgpProfileToJson(automation.profile)) : '')
    targetUrl.searchParams.set('automationTimeout', timeout)
    url = targetUrl.href
    const script = `
import { coreUtils } from '@jb6/core'
import '@jb6/core/misc/import-map-services.js'
const t0 = Date.now(), timeline = [], mark = phase => timeline.push({ phase, atMs: Date.now() - t0 })
const { chromium } = await import(coreUtils.pathJoin(await coreUtils.calcRepoRoot(), 'node_modules/playwright/index.mjs'))
const browser = await chromium.launch(); mark('launched')
const page = await browser.newPage()
const errors = []
page.on('console', m => /error|warning/i.test(m.type()) &&
  !m.text().startsWith('cdn.tailwindcss.com should not be used in production') && errors.push(m.text()))
page.on('pageerror', e => errors.push(String(e?.stack || e)))
await page.addInitScript(() => window.addEventListener('unhandledrejection', e => console.error('unhandledrejection: ' + (e.reason?.stack || e.reason))))
const seed = ${JSON.stringify(seed)}
if (seed) await page.addInitScript(s => Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v))), seed)
let done, logs, html, harvestError
try {
  await page.goto(${JSON.stringify(url)}, { waitUntil: 'domcontentloaded', timeout: ${timeout} }); mark('loaded')
  await page.waitForFunction(() => window.jbAutomation?.done, null, { timeout: ${timeout} }); mark('done')
  const state = await page.evaluate(() => window.jbAutomation)
  ;({ done, logs, error: harvestError } = state)
  await page.waitForTimeout(500)   // drain late async render errors / unhandled rejections before closing
  html = ${JSON.stringify(domSelector || '')} ? await page.evaluate(s => document.querySelector(s)?.outerHTML, ${JSON.stringify(domSelector || '')}) : undefined
} catch (e) { harvestError = String(e?.message || e); mark('failed:' + (timeline.at(-1)?.phase || 'goto')) }
await browser.close(); mark('closed')
const redirect = ${JSON.stringify(redirect)}
await coreUtils.writeServiceResult({ done, harvestError, errors, logs, html, timeline, redirect })`
    const { result, error } = await coreUtils.runCliInContext(script)
    return error ? {error} : result
  }
})

Tool('playwrightHarvest', {
  description: `Load a URL in Chromium, run ui-action<react> automation, and harvest logs, browser errors, HTML, and timeline.`,
  params: [
    {id: 'url', as: 'string', asIs: true, mandatory: true},
    {id: 'automation', as: 'string', asIs: true},
    {id: 'timeout', as: 'number', defaultValue: 5000},
    {id: 'domSelector', as: 'string'},
    {id: 'seedLocalStorage', as: 'string', asIs: true}
  ],
  impl: mcpTool((ctx, {}, args) => {
    const automation = args.automation && JSON.parse(args.automation)
    coreUtils.restoreProfile$(automation)
    return playwrightHarvest.$runWithCtx(ctx, {...args, automation})
  })
})

Component('helloMcp', {
  type: 'react-comp<react>',
  moreTypes: 'tool<mcp>',
  params: [
    {id: 'textToShowAfter', defaultValue: 'after text'}
  ],
  impl: comp({
    hFunc: ({}, {text1, v1, react: {h}}, {textToShowAfter}) => ({}) => h('div', {}, text1, v1, textToShowAfter),
    enrichCtx: Var('text1', '%%/text%')
  })
})
