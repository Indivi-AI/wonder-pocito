import { dsls, coreUtils } from '@jb6/core'
import '@jb6/core/misc/import-map-services.js'
import { langServiceUtils } from './lang-service-parsing-utils.js'

const { jb, astToTgpObj, asJbComp, logError, resolveWithImportMap, fetchByEnv, unique, asArray, logVsCode, calcImportData, calcRepoRoot, toCapitalType, absPathToImportUrl, discoverDslEntryPoints, tgpProfileToJson, isNode } = coreUtils
const { calcProfileActionMap, lineColToOffset, parseWithFallback: parse } = langServiceUtils
const {
  tgp: { TgpType, TgpTypeModifier },
  common: { Data },
} = dsls

Object.assign(coreUtils, { calcTgpModelData, calcExpectedDslsSection, calcImportsForProfile, scanDsl, hashAndGetCache, writeTgpModelCache})

export async function calcTgpModelData(resources) {
  const { fetchByEnvHttpServer, ctx } = resources
  const log = ctx?.vars?.langServiceLogger
  const detailed = ctx?.vars?.detailedTgpModelDataLogger
  if (resources.forDsls == 'test' && !resources.entryPointPaths && !resources.forRepo)
    resources.forRepo = await calcRepoRoot()
  const {importMap, staticMappings, entryFiles, testFiles, projectDir, repoRoot, llmGuideFiles, jb6_llmGuideFiles, jb6_testFiles } = await calcImportData(resources)
  const allLlmGuideFiles = unique([...llmGuideFiles || [], ...jb6_llmGuideFiles || []])
  const allTestFiles = unique([...testFiles || [], ...jb6_testFiles || []])
  const rootFilePaths = unique([...entryFiles, ...allTestFiles, ...allLlmGuideFiles])
  const short = p => (p || '').replace(repoRoot + '/', '')   // strip common prefix to shrink logs
  const compsByFile = {}

  const datesStart = Date.now()
  const { files: dateFiles, mtimes } = await crawlForDates({ importMap, staticMappings, rootFilePaths, fetchByEnvHttpServer })
  log?.info?.({ t: 'tgpModelDates', forDsls: resources.forDsls, ms: Date.now() - datesStart,
    dateFileCount: dateFiles.length, mtimeCount: Object.keys(mtimes).length,
    fingerprint: fingerprintOf(mtimes) }, {}, { ctx })

  // crawl
  const codeMap = {} , visited = {}, importGraph = {}
  await rootFilePaths.reduce((acc, filePath) => acc.then(() => crawl(filePath)), Promise.resolve())
  log?.info?.({ t: 'tgpModelDiscovery', forDsls: resources.forDsls, repoRoot, entryFileCount: entryFiles.length,
    testFileCount: allTestFiles.length, crawledFileCount: Object.keys(codeMap).length,
    entryFiles: entryFiles.map(short), testFiles: allTestFiles.map(short) }, {}, { ctx })

  const tgpModel = {dsls: {}, ns: {}, nsRepo: {}, compDefsByFilePaths: {}, files: Object.keys(codeMap), importGraph, importMap, entryFiles, testFiles, projectDir, staticMappings}
  globalThis.detailedjbVSCodeLog && logVsCode('calcTgpModelData before', resources, tgpModel)

  const {dsls} = tgpModel

  const entryFileSet = new Set(entryFiles)
  const safeFiles = Object.keys(codeMap).filter(f => !entryFileSet.has(f))
  const unsafeFiles = entryFiles.filter(f => codeMap[f])

  // Phase 1: TgpTypes — identify compDefs from ALL files
  Object.entries(codeMap).forEach(([url, src]) => {
    const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module' }, url)

    const directDefs = ast.body.flatMap(n => n?.expression)
    const exportDefs = ast.body.filter(n => n.type === 'ExportNamedDeclaration').flatMap(n => n.declaration?.declarations).map(d=>d?.init)
    const constDefs =  ast.body.filter(n => n.type === 'VariableDeclaration').flatMap(n => n.declarations).map(d=>d?.init)
    const allDefs = [...directDefs, ...exportDefs, ...constDefs]

    allDefs.filter(d => d?.callee?.name === 'TgpType').forEach(decl=> {
      const args = decl.arguments.map(ast =>astToObj(ast))
      args.push(...Array(3 - args.length).fill(null), tgpModel)
      TgpType(...args).$location = { path: url, ...offsetToLineCol(src, decl.start) }
    })
    allDefs.filter(d => d?.callee?.name === 'TgpTypeModifier').forEach(decl=> {
      const args = decl.arguments.map(ast =>astToObj(ast))
      args.push(...Array(2 - args.length).fill(null), tgpModel)
      TgpTypeModifier(...args).$location = { path: url, ...offsetToLineCol(src, decl.start) }
    })
  })

  if (!dsls.tgp) {
    const error = `calcTgpModelData: error for resources ${JSON.stringify({resources, importMap, staticMappings, entryFiles, testFiles, projectDir, repoRoot})}`
    logError(error)
    return { tgpModel, error }
  }
  dsls.tgp['ctx-enricher'].Var = jb.dsls.tgp['ctx-enricher'].Var[asJbComp]
  dsls.tgp.comp.tgpComp = jb.dsls.tgp.tgpComp[asJbComp]

  // Phase 2: load components from safe files (library/framework code that compiles)
  safeFiles.forEach(filePath => {
    const src = codeMap[filePath]
    const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module' }, filePath)
    const compDefs = extractCompDefs({dsls, ast, tgpModel, filePath})
    parseAllDeclarations(ast, filePath, src, compDefs)
  })

  // Phase 3: identify compDef suspects in entry files (may not compile)
  const { compDefsByFilePaths } = tgpModel
  unsafeFiles.forEach(filePath => {
    const src = codeMap[filePath]
    const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module' }, filePath)
    const ownCompDefs = extractCompDefs({dsls, ast, tgpModel, filePath})
    const mergedCompDefs = {...ownCompDefs}
    collectCompDefsFromImports(filePath, mergedCompDefs)
    compDefsByFilePaths[filePath] = mergedCompDefs
  })

  // Phase 4: register components from entry files
  unsafeFiles.forEach(filePath => {
    const src = codeMap[filePath]
    const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module' }, filePath)
    const compDefs = compDefsByFilePaths[filePath]
    parseAllDeclarations(ast, filePath, src, compDefs)
  })

  function parseAllDeclarations(ast, filePath, src, compDefs) {
    const exportDefs = ast.body.filter(n => n.type === 'ExportNamedDeclaration').flatMap(n => n.declaration?.declarations)
    const constDefs = ast.body.filter(n => n.type === 'VariableDeclaration').flatMap(n => n.declarations)
    ;[...exportDefs, ...constDefs].filter(d => d?.init)
      .forEach(decl => parseCompDec({exportName: decl.id.name, decl: decl.init, filePath, src, compDefs}))
    ast.body.map(n => n?.expression).filter(Boolean)
      .forEach(decl => parseCompDec({decl, filePath, src, compDefs}))
  }

  function collectCompDefsFromImports(filePath, mergedCompDefs) {
    const visited = new Set()
    ;(function walk(fp) {
      if (visited.has(fp)) return
      visited.add(fp)
      ;(importGraph[fp] || []).forEach(dep => {
        const depCompDefs = compDefsByFilePaths[dep]
        if (depCompDefs) Object.entries(depCompDefs).forEach(([id, def]) => {
          if (def && !mergedCompDefs[id]) mergedCompDefs[id] = def
        })
        walk(dep)
      })
    })(filePath)
  }

  globalThis.detailedjbVSCodeLog && logVsCode('calcTgpModelData result', resources, tgpModel)
  detailed?.info?.({ t: 'compsRegistered', totalComps: Object.values(compsByFile).reduce((a,b)=>a+b,0), compsByFile }, {}, { ctx })

  return tgpModel

  function parseCompDec({exportName, decl, filePath, src, compDefs, vars = {}}) {
    if (!decl) return
    if (decl.type !== 'CallExpression' || decl.callee.type !== 'Identifier') return
    let compDefId = decl.callee.name
    if (compDefId === 'DefComponents' && decl.arguments[0]?.type === 'Literal' && decl.arguments[1]?.type === 'ArrowFunctionExpression') {
      const items = decl.arguments[0].value.split(',')
      const paramName = decl.arguments[1].params[0]?.name
      const body = decl.arguments[1].body
      const innerCall = body.type === 'CallExpression' ? body : body.body?.[0]?.expression
      if (innerCall && paramName)
        items.forEach(item => parseCompDec({decl: innerCall, filePath, src, compDefs, vars: {[paramName]: item}}))
      return
    }
    if (decl.callee.name == 'Component') {
      const dslType = astToTgpObj(decl).$unresolvedArgs[1]?.type || 'data<common>'
      if (typeof dslType !== 'string' || !/^[^<]+<[^>]+>$/.test(dslType)) {
        logError(`calcTgpModelData bad Component type ${JSON.stringify(dslType)}`, { filePath, ...offsetToLineCol(src, decl.start) })
        return
      }
      const [_type, _dsl] = coreUtils.splitDslType(dslType)
      compDefId = coreUtils.toCapitalType(_type)
      compDefs[compDefId] = dsls[_dsl][compDefId]
    }
    if (typeof compDefs[compDefId] !== 'function') {
      if (compDefs[compDefId] !== undefined)
        logError(`calcTgpModelData compDef "${compDefId}" is not a function (got ${typeof compDefs[compDefId]}). Known compDefs: ${Object.keys(compDefs).join(', ')}`, { filePath, ...offsetToLineCol(src, decl.start) })
      return
    }

    let shortId, comp
    const firstArgVal = astToObj(decl.arguments[0], vars)
    if (typeof firstArgVal === 'string' && decl.arguments.length > 1) {
      shortId = firstArgVal
      if (exportName && shortId !== exportName)
        logError(`calcTgpModelData id mismatch ${shortId} ${exportName}`,{ filePath, ...offsetToLineCol(src, decl) })
      comp = astToObj(decl.arguments[1], vars)
    } else {
      shortId = exportName
      comp = astToObj(decl.arguments[0], vars)
    }
    if (!shortId)
      logError(`calcTgpModelData no id mismatch`,{ filePath, ...offsetToLineCol(src, decl) })

    const $location = { path: filePath, ...offsetToLineCol(src, decl.start), to: offsetToLineCol(src, decl.end) }
    const _comp = compDefs[compDefId](shortId, {...comp, $location})
    const jbComp = _comp[asJbComp] // remove the proxy
    delete jbComp.$
    dsls[jbComp.dsl][jbComp.type][shortId] = jbComp
    compsByFile[short(filePath)] = (compsByFile[short(filePath)] || 0) + 1
  }

  async function crawl(url) {
    if (visited[url]) return
    visited[url] = true
    try {
      const rUrl = resolveWithImportMap(url, importMap, staticMappings) || url
      const src = await fetchByEnv(rUrl, staticMappings, fetchByEnvHttpServer)
      codeMap[url] = src

      const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module' }, rUrl)

      const imports = [
      ...ast.body.filter(n => n.type === 'ImportDeclaration').map(n => n.source.value)
          .filter(spec => ['/','.','@','#'].some(p=>spec.startsWith(p))).map(rel => resolvePath(rUrl, rel)),
      ...ast.body.filter(n => n.type === 'ExpressionStatement').map(n => n.expression)
          .filter(ex => ex.type === 'CallExpression' && ex.callee.type === 'Import')
          .map(ex => ex.arguments[0]?.value).filter(Boolean).map(rel => resolvePath(rUrl, rel))
      ].filter(x=>!x.match(/^\/libs\//))
      importGraph[url] = imports
      globalThis.detailedjbVSCodeLog && logVsCode('crawl', url, imports)
      detailed?.info?.({ t: 'crawl', url: short(url), importCount: imports.length }, {}, { ctx })

      await Promise.all(imports.map(url => crawl(url)))
    } catch (e) {
      detailed?.error?.({ t: 'crawlError', url, err: e.stack || String(e) }, {}, { ctx })
      console.error(`Error crawling ${url}:`, e)
    }
  }
}

function astToObj(node, vars = {}) {
  if (!node) return undefined
  switch (node.type) {
    case 'Identifier':
      return vars[node.name]
    case 'Literal':
      return node.value
    case 'TemplateLiteral': {
      const strs = node.quasis.map(q => q.value.cooked)
      const exprs = node.expressions.map(e => astToObj(e, vars))
      return strs.reduce((acc, s, i) => acc + s + (exprs[i] ?? ''), '')
    }
    case 'ObjectExpression': {
      const obj = {}
      for (const prop of node.properties) {
        const key = prop.key.type === 'Identifier' ? prop.key.name : prop.key.value
        obj[key] = astToObj(prop.value, vars)
      }
      return obj
    }
    case 'ArrayExpression':
      return node.elements.map(el => astToObj(el, vars))
    case 'UnaryExpression':
      return node.operator === '-' ? -astToObj(node.argument, vars) : astToObj(node.argument, vars)
    default:
      return undefined
  }
}

function resolvePath(b, r) {
	if (['/','@','#'].some(p=>r.startsWith(p))) return r
	const segs = b.split('/')
	segs.pop()
	const parts = segs.concat(r.split('/'))
	const out = []
	for (const p of parts) {
	  if (p === '..') out.pop()
	  else if (p !== '.' && p !== '') out.push(p)
	}
	return (b[0] === '/' ? '/' : '') + out.join('/')
}

// lightweight sibling of calcTgpModelData's crawl: walk the static import graph WITHOUT full AST
// parsing. we only need the file LIST + mtimes (the cache-invalidation fingerprint), so we harvest
// imports from the top lines via regex. static es-module imports are top-level; mid/deep-file imports
// (e.g. a lazy import at line 445) are missed, which is fine for a leaf-level mtime check.
const CRAWL_DATES_TOP_LINES = 40
const importLineRe = /^\s*import\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]/
function harvestImports(src, file) {
  const lines = src.split('\n')
  return (file.endsWith('/all-tests.js') ? lines : lines.slice(0, CRAWL_DATES_TOP_LINES))
    .map(l => (l.match(importLineRe) || [])[1])
    .filter(spec => spec && ['/', '.', '@', '#'].some(p => spec.startsWith(p)))
}
function fingerprintOf(mtimes) {   // order-independent hash of the {file: mtimeMs} map
  let h = 0
  for (const k of Object.keys(mtimes).sort()) {
    const s = k + ':' + mtimes[k]
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return h
}
export async function crawlForDates({ importMap, staticMappings, rootFilePaths, fetchByEnvHttpServer }) {
  const visited = {}, mtimes = {}
  // mtimes (and the file cache) are a node-only optimization; in the browser the real build is delegated
  // to a node CLI. no isNode -> no stat, no fs/promises import (which would throw in the browser).
  const stat = isNode && !fetchByEnvHttpServer ? (await import('fs/promises')).stat : null
  async function crawl(url) {
    if (visited[url]) return
    visited[url] = true
    try {
      const rUrl = resolveWithImportMap(url, importMap, staticMappings) || url
      const src = await fetchByEnv(rUrl, staticMappings, fetchByEnvHttpServer)
      if (stat && rUrl.startsWith('/'))
        mtimes[rUrl] = (await stat(rUrl)).mtimeMs
      const imports = harvestImports(src, rUrl).map(rel => resolvePath(rUrl, rel)).filter(x => !x.match(/^\/libs\//))
      await Promise.all(imports.map(crawl))
    } catch (e) {}   // ignore unresolved leaves (bare pkg specifiers etc.)
  }
  await rootFilePaths.reduce((acc, f) => acc.then(() => crawl(f)), Promise.resolve())
  return { files: Object.keys(visited), mtimes }
}

// cache key = hash(query + graph mtimes). query change OR file edit -> new key. null in http mode (no mtimes).
async function calcTgpModelCacheKey({ query, importMap, staticMappings, rootFilePaths, fetchByEnvHttpServer }) {
  if (fetchByEnvHttpServer) return { key: null, mtimes: {} }
  const { mtimes } = await crawlForDates({ importMap, staticMappings, rootFilePaths, fetchByEnvHttpServer })
  if (!Object.keys(mtimes).length) return { key: null, mtimes }
  const canon = JSON.stringify(query) + '|' + Object.keys(mtimes).sort().map(k => k + ':' + mtimes[k]).join(',')  // sort: crawl order varies
  return { key: String(fingerprintOf({ canon }) >>> 0), mtimes }
}
const TGP_MODEL_CACHE_DIR = '/tmp/.jb6/tgpModel'   // node-only; key is null in the browser so these no-op
async function readTgpModelCache(key) {
  if (!key || !isNode) return null
  try { return JSON.parse(await (await import('fs/promises')).readFile(`${TGP_MODEL_CACHE_DIR}/${key}.json`, 'utf8')) }
  catch (e) { return null }
}
async function writeTgpModelCache(key, value) {
  if (!key || !isNode) return
  try {
    const fs = await import('fs/promises')
    await fs.mkdir(TGP_MODEL_CACHE_DIR, { recursive: true })
    await fs.writeFile(`${TGP_MODEL_CACHE_DIR}/${key}.json`, JSON.stringify(value))
  } catch (e) {}
}

async function hashAndGetCache({ cacheQuery, modelResources, fetchByEnvHttpServer, ctx }) {
  if (!isNode) {
    const script = `import { coreUtils } from '@jb6/core'
import '@jb6/lang-service'
;(async()=>{
try {
  const result = await coreUtils.hashAndGetCache(${JSON.stringify({ cacheQuery, modelResources: { ...modelResources, ctx: undefined }, fetchByEnvHttpServer })})
  await coreUtils.writeServiceResult(result)
} catch (e) { console.error(e) }
})()`
    const res = await coreUtils.runCliInContext(script, { ctx })
    return res.result
  }
  const lsLog = ctx?.vars?.langServiceLogger
  try {
    const { importMap, staticMappings, entryFiles, testFiles, llmGuideFiles, jb6_llmGuideFiles, jb6_testFiles } = await calcImportData(modelResources)
    const rootFilePaths = unique([...entryFiles, ...(testFiles || []), ...(jb6_testFiles || []), ...(llmGuideFiles || []), ...(jb6_llmGuideFiles || [])])
    const { key } = await calcTgpModelCacheKey({ query: cacheQuery, importMap, staticMappings, rootFilePaths, fetchByEnvHttpServer })
    const cached = await readTgpModelCache(key)
    if (cached) {
      lsLog?.info?.({ t: 'tgpModelCache', hit: true, key }, {}, { ctx })
      return { result: cached }
    }
    lsLog?.info?.({ t: 'tgpModelCache', hit: false, key }, {}, { ctx })
    return { key }
  } catch (e) {
    lsLog?.error?.({ t: 'tgpModelCache', err: e.message }, {}, { ctx })
    return {}
  }
}

function offsetToLineCol(text, offset) {
  const cut = text.slice(0, offset)
  return {
      line: (cut.match(/\n/g) || []).length || 0,
      col: offset - (cut.indexOf('\n') == -1 ? 0 : (cut.lastIndexOf('\n') + 1))
  }
}

function extractCompDefs({dsls, ast, tgpModel, filePath}) {
  const { compDefsByFilePaths } = tgpModel
  if (compDefsByFilePaths[filePath]) return compDefsByFilePaths[filePath]
  const compDefs = {}

  ast.body.forEach(n => n.type === 'VariableDeclaration' && n.declarations.forEach(d => {
      if (!d.init) return

      // const Aggregator = TgpTypeModifier('Aggregator', { aggregator: true, dsl: 'common', type: 'data'})
      if (d.id.type === 'Identifier' && d.init.type === 'CallExpression' && d.init.callee.name === 'TgpTypeModifier') {
        const { dsl } = astToObj(d.init.arguments[1])
        compDefs[d.id.name] = dsls[dsl]?.[d.id.name]
      }
      // const Control = TgpType('control','ui')
      if (d.id.type === 'Identifier' && d.init.type === 'CallExpression' && d.init.callee.name === 'TgpType') {
        const dsl = d.init.arguments[1]?.value
        if (dsl) compDefs[d.id.name] = dsls[dsl]?.[d.id.name]
      }

      // const { common: { Data }, test: { Test } } = dsls
      if ( d.id.type === 'ObjectPattern' && d.init.type === 'Identifier' && d.init.name === 'dsls') {
        d.id.properties.forEach(p => p.value?.type === 'ObjectPattern' &&
          p.value.properties.forEach(i => {
            const id = i.value?.name || i.key?.name || i.key?.value
            compDefs[id] = dsls[p.key.name || p.key.value]?.[id]
          })
        )
      }
    })
  )

  return compDefsByFilePaths[filePath] = compDefs
}

async function calcExpectedDslsSection(tgpModel, filePath) {
  const src = await fetchByEnv(filePath, tgpModel.staticMappings)
  if (!src) return null

  const allComps = Object.values(tgpModel.dsls).flatMap(types =>
    Object.values(types).filter(x => typeof x == 'object').flatMap(type => Object.values(type))
  ).filter(comp => comp.id)
  const filePathAliases = new Set([filePath])
  const sm = tgpModel.staticMappings || []
  sm.filter(x => x.diskPath != x.urlPath && filePath.indexOf(x.diskPath) == 0)
    .forEach(x => filePathAliases.add(filePath.replace(x.diskPath, x.urlPath)))
  const imports = tgpModel.importMap?.imports
  if (imports) {
    const importUrl = absPathToImportUrl(filePath, imports, sm)
    if (importUrl) filePathAliases.add(importUrl)
  }
  const compsInFile = allComps.filter(comp => filePathAliases.has(comp.$location?.path))
  globalThis.detailedjbVSCodeLog && logVsCode('calcExpectedDslsSection', { filePath, compsInFile: compsInFile.length, filePathAliases: [...filePathAliases] })
  if (compsInFile.length == 0) return null

  // Sort by file position and compile params so comps can reference each other
  compsInFile.sort((a, b) => lineColToOffset(src, a.$location) - lineColToOffset(src, b.$location))

  const _items = []
  const compDefsUsed = new Set()

  // Detect tgp dsl compDefs (Component, Const, TgpType, TgpTypeModifier) used in the file
  const tgpCompDefIds = new Set(['Component', 'Const', 'TgpType', 'TgpTypeModifier'])
  const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module' }, filePath)
  ast.body.forEach(n => {
    const callee = n?.expression?.callee?.name || n?.declarations?.[0]?.init?.callee?.name
    if (callee && tgpCompDefIds.has(callee))
      compDefsUsed.add(JSON.stringify({ dsl: 'tgp', id: callee }))
  })

  // Collect compDef IDs that are defined in this file via TgpType/TgpTypeModifier
  const compDefsDefinedInFile = new Set()
  ast.body.forEach(n => n?.type === 'VariableDeclaration' && n.declarations.forEach(d => {
    if (d.id?.type === 'Identifier' && d.init?.type === 'CallExpression'
        && (d.init.callee.name === 'TgpType' || d.init.callee.name === 'TgpTypeModifier')) {
      const dsl = d.init.callee.name === 'TgpType' ? d.init.arguments[1]?.value : astToObj(d.init.arguments[1])?.dsl
      if (dsl) compDefsDefinedInFile.add(JSON.stringify({ dsl, id: d.id.name }))
    }
  }))

  for (const comp of compsInFile) {
    const compDefId = toCapitalType(comp.type)
    const compDefKey = JSON.stringify({ dsl: comp.dsl, id: compDefId })
    if (!compDefsDefinedInFile.has(compDefKey))
      compDefsUsed.add(compDefKey)

    const loc = comp.$location
    const startOffset = lineColToOffset(src, loc)
    const endOffset = lineColToOffset(src, loc.to)
    const compText = src.slice(startOffset, endOffset)

    try {
      const { comp: resolvedComp } = calcProfileActionMap(compText, { tgpModel, filePath })
      if (resolvedComp) calcItems(resolvedComp)
    } catch (e) {}
  }

  function calcItems(node) {
    if (typeof node?.$$ == 'string') {
      const match = node.$$.match(/([^<]+)<([^>]+)>(.+)/)
      if (match) _items.push(match.slice(1)) // [type, dsl, id]
    }
    if (node && typeof node == 'object')
      Object.values(node).filter(x => x).forEach(x => calcItems(x))
  }

  const compIdsInFile = new Set(compsInFile.map(c => `${c.type},${c.dsl},${c.id}`))
  const items = unique(_items.filter(x => !compIdsInFile.has(`${x[0]},${x[1]},${x[2]}`)), x => x.join(','))
  const compDefs = [...compDefsUsed].map(x => JSON.parse(x))
  const allDsls = unique([...items.map(x => x[1]), ...compDefs.map(c => c.dsl)]).sort((a, b) => a === 'tgp' ? -1 : b === 'tgp' ? 1 : a.localeCompare(b))

  const dslsStr = allDsls.map(dsl => {
    const types = unique(items.filter(x => x[1] == dsl).map(x => x[0])).sort().map(type => {
      const comps = unique(items.filter(x => x[1] == dsl && x[0] == type).map(x => x[2]))
        .filter(x => x.indexOf('.') == -1).sort().join(', ')
      const typeStr = type.indexOf('-') == -1 ? type : `'${type}'`
      return comps && `${typeStr}: { ${comps} }`
    }).filter(Boolean).join(',\n    ')

    const compDefsIds = unique(compDefs.filter(c => c.dsl == dsl).map(c => c.id))
    const compDefsStr = compDefsIds.length ? compDefsIds.join(', ') + (types ? ',' : '') : ''
    const dslStr = dsl.indexOf('-') == -1 ? dsl : `'${dsl}'`
    if (!types) return `  ${dslStr}: { ${compDefsStr} }`
    return `  ${dslStr}: { ${compDefsStr}\n    ${types}\n  }`
  }).join(',\n')

  return `const {\n${dslsStr}\n} = dsls`
}

// Auto-discover Node-side imports needed to resolve `$:'type<dsl>id'` refs in the given profile(s)/JSON-text.
// Accepts a TGP profile, an array of profiles, or a JSON string. Returns importsStr ready to inline,
// plus projectDir + importMapsInCli for runCliInContext.
async function calcImportsForProfile(input, {repoRoot, fetchByEnvHttpServer, entryPointPaths, ctx} = {}) {
  const log = ctx?.vars?.snippetLogger
  const lsLog = ctx?.vars?.langServiceLogger
  // entryPointPaths mode crawls explicit files (e.g. host tests outside /packages) - forRepo mode
  // ignores entryPointPaths and only crawls the repo's discovered files, so the two are exclusive.
  if (!entryPointPaths) repoRoot = repoRoot || await calcRepoRoot()
  const text = typeof input === 'string' ? input
    : Array.isArray(input) ? input.map(p => JSON.stringify(tgpProfileToJson(p))).join('\n')
    : JSON.stringify(tgpProfileToJson(input))
  const allFullIds = unique([...text.matchAll(/["']\$["']\s*:\s*["']([^"']+)["']|\$\s*:\s*'([^']+)'/g)].map(m => m[1] || m[2]))
  const parsed = allFullIds.map(id => { const m = id.match(/^([^<]+)<([^>]+)>(.+)$/); return m && { type: m[1], dsl: m[2], shortId: m[3], fullId: id } }).filter(Boolean)
  if (!parsed.length) return { error: `no valid {$: 'type<dsl>id'} found in profile`, topLevelImports: [], importsStr: '' }
  const allDsls = unique(parsed.map(p => p.dsl))
  const modelResources = {forRepo: entryPointPaths ? undefined : repoRoot, forDsls: allDsls.join(','), fetchByEnvHttpServer, entryPointPaths, ctx}

  // file cache: hash the graph mtimes + query, look it up. hit -> return the cached imports; miss -> get
  // back the key to write under after building. hashAndGetCache runs node-side (browser delegates via /run-cli).
  const cacheQuery = { ids: allFullIds.slice().sort(), repoRoot: repoRoot || '', entryPointPaths: [].concat(entryPointPaths || []).join(',') }
  const { result, key: cacheKey } = await hashAndGetCache({ cacheQuery, modelResources, fetchByEnvHttpServer, ctx })
  if (result) return result

  const tgpModel = await calcTgpModelData(modelResources)
  if (tgpModel.error) return { error: tgpModel.error }
  const projectDir = tgpModel.projectDir || repoRoot
  const comps = parsed.map(p => tgpModel.dsls[p.dsl]?.[p.type]?.[p.shortId]).filter(Boolean)
  if (!comps.length) {
    const diagnostic = calcResolveFailedDiagnostic(parsed, tgpModel)
    log?.error?.({ t: 'snippetResolveFailed', requested: allFullIds, ...diagnostic }, {}, { ctx })
    // cache the failure too: it's keyed on the graph mtimes, so ADDING the missing comp's file bumps the
    // key and re-resolves. avoids re-crawling (~630ms) on every repeat of a genuinely-missing comp.
    const failRes = { error: `can not find ${allFullIds.join(', ')}`, diagnostic }
    await writeTgpModelCache(cacheKey, failRes)
    return failRes
  }
  const allComps = collectTransitiveComps(comps, tgpModel)
  const allCompDsls = unique([...allDsls, ...allComps.map(c => c.dsl)])
  const dslsEntryPoints = await discoverDslEntryPoints({ forDsls: allCompDsls, repoRoot })
  const entryFiles = unique(allComps.map(c => c.$location?.path).filter(Boolean))
  const topLevelImports = calcMinimalImports([...dslsEntryPoints, ...entryFiles], tgpModel.importGraph)
  const importsStr = topLevelImports.map(f => `await import('${f}')`).join('\n')
  // cached shape (JSON-safe, self-contained); tgpModel returned live but NOT persisted (comp impls don't survive JSON).
  const res = { topLevelImports, importsStr, projectDir, importMapsInCli: tgpModel.importMap.importMapsInCli, testFiles: tgpModel.testFiles || [] }
  await writeTgpModelCache(cacheKey, res)
  return { ...res, tgpModel }
}

function collectTransitiveComps(initialComps, tgpModel) {
  const visited = new Set()
  const result = []
  initialComps.forEach(comp => walkComp(comp))
  return result

  function walkComp(comp) {
    if (!comp || visited.has(comp)) return
    visited.add(comp)
    result.push(comp)
    if (typeof comp.impl == 'object') walkImpl(comp.impl)
  }
  function walkImpl(node) {
    if (!node || typeof node != 'object' || visited.has(node)) return
    visited.add(node)
    if (typeof node.$ == 'string') {
      const m = node.$.match(/^([^<]+)<([^>]+)>(.+)$/)
      if (m) walkComp(tgpModel.dsls[m[2]]?.[m[1]]?.[m[3]])
    }
    Object.values(node).forEach(v => walkImpl(v))
  }
}

function calcResolveFailedDiagnostic(parsed, tgpModel) {
  const files = tgpModel.files || []
  return {
    missing: parsed.map(p => {
      const token = p.shortId.split('.').pop()
      return {
        fullId: p.fullId,
        dslLoaded: !!tgpModel.dsls[p.dsl],
        typeLoaded: !!tgpModel.dsls[p.dsl]?.[p.type],
        definingFileCrawled: files.some(f => f.includes(token))   // false ⇒ defining file never crawled
      }
    }),
    crawledFileCount: files.length
  }
}

function calcMinimalImports(allFiles, importGraph) {
  const imported = new Set()
  allFiles.forEach(f => collectImported(f, importGraph, imported, new Set([f])))
  return allFiles.filter(f => !imported.has(f))
}

function collectImported(file, importGraph, imported, visited) {
  for (const dep of importGraph[file] || []) {
    if (visited.has(dep)) continue
    visited.add(dep)
    imported.add(dep)
    collectImported(dep, importGraph, imported, visited)
  }
}

async function scanDsl({dsl, details = 'comps', repoRoot, ctx}) {
  repoRoot = repoRoot || await calcRepoRoot()
  const short = p => p.replace(repoRoot + '/', '')
  const wanted = new Set((Array.isArray(dsl) ? dsl : (dsl||'').split(',')).map(d => d.trim()).filter(Boolean))
  const tgpModel = await calcTgpModelData({forRepo: repoRoot})
  if (tgpModel.error) return tgpModel.error

  // comps are grouped by the scanned type-bucket they sit in. moreTypes registers a comp in extra buckets (tgp.js), so a data<common> comp with moreTypes:'etl<etl>' also lives in dsls.etl.etl and shows there when etl is scanned - no synthetic type needed
  const tgpTypes = [], comps = [], grouped = [], tsByType = {}, demoComp = {}, typeLoc = {}   // grouped: {comp, groupKey}; demoComp: typeKey -> demoProfile id(s); typeLoc: typeKey -> TgpType def $location
  Object.entries(tgpModel.dsls).forEach(([d, dslObj]) =>
    Object.entries(dslObj).forEach(([bucket, val]) => {
      if (typeof val == 'function' && val.dslType) {
        if (!wanted.has(d)) return
        tgpTypes.push(val.dslType); typeLoc[val.dslType] = val.$location
        if (val.demoProfile) demoComp[val.dslType] = val.demoProfile
        if (val.typescript) tsByType[val.dslType] = val.typescript   // RT contract lives on the TgpType def
        return
      }
      if (!val || typeof val != 'object' || !wanted.has(d)) return
      const groupKey = `${bucket}<${d}>`
      Object.values(val).forEach(v => {
        const comp = v?.[asJbComp] || v   // moreTypes buckets hold jbCompProxy - unwrap to the raw comp def
        if (!comp?.$location?.path) return
        comps.push(comp); grouped.push({ comp, groupKey })
      })
    }))
  const groupKey = c => grouped.find(g => g.comp == c)?.groupKey || `${c.type}<${c.dsl}>`
  const usedBy = {}   // dslType -> [type<dsl>id~params~paramId] of scanned comps whose param accepts it
  comps.forEach(c => (c.params || []).forEach(p => {
    if (!p.type) return
    const dt = p.type.replace(/\[\]$/, '')
    const full = dt.includes('<') ? dt : `${dt}<${c.dsl}>`
    ;(usedBy[full] ||= []).push(`${c.type}<${c.dsl}>${c.id}~params~${p.id}`)
  }))
  const { staticMappings, importMap } = await calcImportData({forRepo: repoRoot})
  const locRank = dt => { const l = typeLoc[dt]; return l ? `${l.path}:${String(l.line).padStart(6,'0')}` : '~' }
  const orderedTypes = unique(tgpTypes).sort((a, b) => locRank(a) < locRank(b) ? -1 : 1)   // TgpType/modifier source-file order
  ctx?.vars?.langServiceLogger?.info?.({ t: 'scanDsl', dsl, details, orderedTypes: orderedTypes.map(dt => `${dt} @ ${short(typeLoc[dt]?.path || '')}:${typeLoc[dt]?.line}`), compCount: comps.length }, {}, { ctx })
  const demoIds = dt => asArray(demoComp[dt])   // demoProfile is a single id or a list — normalize to ids[]
  const typeHeader = dt => [dt, demoIds(dt).length && `  demo: ${demoIds(dt).join(', ')}`, usedBy[dt] && `  usedBy: ${usedBy[dt].join(', ')}`].filter(Boolean).join('\n')
  const header = `## TgpTypes\n${orderedTypes.map(typeHeader).join('\n')}`
  if (details == 'files' || details == 'full') {
    const paths = unique(comps.map(c => c.$location.path)).sort()
    if (details == 'files') return `${header}\n\n## files\n${paths.map(p => `### ${short(p)}`).join('\n')}`
    const srcs = await Promise.all(paths.map(async p => `### ${short(p)}\n\`\`\`js\n${await fetchByEnv(p, staticMappings)}\n\`\`\``))
    return `${header}\n\n${srcs.join('\n\n')}`
  }
  const compById = id => { const [type, dsl, sid] = id.match(/^(.+)<(.+)>(.+)$/)?.slice(1) || []; return tgpModel.dsls[dsl]?.[type]?.[sid] }
  async function demoSrc(id) {   // demoProfile id → its comp source, sliced from the defining file (impl is a live fn at runtime, so pretty-print can't recover it)
    const c = compById(id); if (!c?.$location?.to) return `  demo: ${id}`
    const src = await fetchByEnv(resolveWithImportMap(c.$location.path, importMap, staticMappings) || c.$location.path, staticMappings)
    const body = src.slice(lineColToOffset(src, c.$location), lineColToOffset(src, c.$location.to))
    return `  demo ${id}:\n\`\`\`js\n${body}\n\`\`\``
  }
  const demoBlocks = Object.fromEntries(await Promise.all(unique(Object.values(demoComp).flatMap(asArray)).map(async id => [id, await demoSrc(id)])))
  const withParams = details == 'all-comps-with-params'
  const implLines = c => (c.$location.to?.line || c.$location.line) - c.$location.line + 1
  const at = c => `${c.$location.path.split('/').pop()}:${c.$location.line}`
  const compLine = c => `${c.id} ${at(c)} ${(c.params || []).length} prms, ${implLines(c)} lines${c.description ? ` — ${c.description}` : ''}`
  const paramLine = p => `    ${p.id}${p.type ? ` <${p.type}>` : p.as ? ` (${p.as})` : ''}${p.defaultValue != null ? ` = ${JSON.stringify(p.defaultValue)}` : ''}${p.description ? ` — ${p.description}` : ''}`
  const compLines = c => withParams ? [`${c.id} ${at(c)}`, ...(c.params || []).map(paramLine)] : [compLine(c)]
  const byType = {}
  comps.forEach(c => (byType[groupKey(c)] ||= []).push(c))
  const compRank = c => `${c.$location.path}:${String(c.$location.line).padStart(6,'0')}`
  const typeBlock = ([typeKey, comps]) => {
    const sorted = comps.sort((a, b) => compRank(a) < compRank(b) ? -1 : 1)
    const shown = withParams ? sorted : sorted.slice(0, 12)
    const more = sorted.length - shown.length
    const demos = demoIds(typeKey).map(id => demoBlocks[id]), ts = tsByType[typeKey]
    const heading = `### ${typeKey}${ts ? ` — RT: ${ts}` : ''}${demos.length ? `\n${demos.join('\n')}` : ''}`
    return [heading, ...shown.flatMap(compLines), ...(more > 0 ? [`...${more} more comps`] : [])].join('\n')
  }
  const compsSection = `## comps by type\n${Object.entries(byType).sort((a, b) => locRank(a[0]) < locRank(b[0]) ? -1 : 1).map(typeBlock).join('\n\n')}`

  const compFiles = new Set(comps.map(c => c.$location.path))
  const tests = Object.values(tgpModel.dsls.test?.test || {})
    .filter(t => compFiles.has(t.$location?.path)).sort((a, b) => a.id < b.id ? -1 : 1)
  const testLines = [...tests.slice(0, 10).map(t => `- ${t.id} ${at(t)}${t.description ? ` — ${t.description}` : ''}`),
    ...(tests.length > 10 ? [`...${tests.length - 10} more tests`] : [])]
  const testsSection = tests.length ? `\n\n## tests\n${testLines.join('\n')}` : ''
  return `${compsSection}${testsSection}`
}
