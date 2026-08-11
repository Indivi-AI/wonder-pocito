import fs from 'fs'
import vm from 'node:vm'

import https from 'node:https'
import http from 'node:http'
import * as os from 'node:os'   // node-only file → safe at head. registered in builtInModules so sandbox code (jb-logging's $source) can import 'os'

import { jb } from '@jb6/repo'
import './import-map-services.js'
import '../utils/jb-logging.js'

const { coreUtils } = jb
const {resolveWithImportMap, calcImportData, logError } = coreUtils
Object.assign(coreUtils, { getOrCreateVm })

const vmCache = {}

async function getOrCreateVm(options) {
    const { vmId, resources, entryFiles: optEntryFiles, vmLogger, ctx } = options
    const log = (t, data, level = 'info') => ctx && vmLogger?.[level]?.({t, vmId, ...data}, {}, {ctx})
    if (vmId && vmCache[vmId]) { log('vm cache hit', {}); return vmCache[vmId] }
    log('calc importData', { hasResources: !!resources, hasImportMap: !!options.importMap })
    const importData = options.importMap ? options : resources ? await calcImportData(resources) : options
    const {importMap, staticMappings, entryFiles: calcedEntryFiles } = importData
    if (!importMap) {
        log('importMap missing', { resources, importData }, 'error')
        console.error('can not calc importMap',importData, resources,options)
        return
    }
    log('importMap ready', { entryCount: (calcedEntryFiles || optEntryFiles || []).length })

    const moduleCache = new Map()
    const vmCleanup = []
    const builtInModules = {}

    function calcSpecifierUrl(specifier, referrer = {}) {
        if (/^https?:\/\//.test(specifier) || builtInModules[specifier]) return specifier
        const fixRelative = specifier[0] == '.' ? safeResolveURL(specifier, referrer.identifier).href : specifier
        const resolved = resolveWithImportMap(fixRelative.replace(/^file:\/\//,''), importMap, staticMappings)
        if (!resolved) {
            console.error('can not resolve', specifier, fixRelative, referrer.identifier, referrer)
            return ''
        }
        return safeResolveURL(resolved.startsWith('file://') ? resolved : ('file://' + resolved)).href
    }

    const fileOverrides = options.fileOverrides

    function readFileContent(identifier) {
        if (fileOverrides) {
            const url = safeResolveURL(identifier)
            const path = url.pathname || url.href?.replace?.('file://','')
            if (path && fileOverrides.has(path)) return fileOverrides.get(path)
        }
        return fs.readFileSync(safeResolveURL(identifier), 'utf8')
    }

    const shortId = id => String(id || '').replace(/^file:\/\//, '').replace(/^.*\/(packages|node_modules|jb6_packages|public)\//, '$1/')
    function loadModule(identifier, context, {fileContent, referrer} = {}) {
        if (!identifier)
            debugger
        if (moduleCache.has(identifier)) {
            log('module cache hit', { id: shortId(identifier) })
            return moduleCache.get(identifier)
        }
        try {
            let mod
            if (builtInModules[identifier]) {
                log('load builtIn module', { id: shortId(identifier) })
                mod = new vm.SyntheticModule(
                    Object.keys(builtInModules[identifier]),
                    function init() {
                      for (const [key, value] of Object.entries(builtInModules[identifier]))
                        this.setExport(key, value)
                    },
                    { context, identifier }
                  )
            } else {
                try {
                    const source = fileContent || readFileContent(identifier)
                    log('load module', { id: shortId(identifier), bytes: source.length, from: shortId(referrer?.identifier) })
                    mod = new vm.SourceTextModule(source, { identifier, context,
                        importModuleDynamically: (specifier, referrer) => importModuleDynamically (context, specifier, referrer)
                    })
                } catch(error) {
                    log('module load error', { id: shortId(identifier), from: shortId(referrer?.identifier), error: error.message }, 'error')
                    console.log(`can not find module ${identifier} from '${referrer?.identifier}'`)
                    return new vm.SyntheticModule([], () => {}, { context, identifier: `error loading module ${identifier} from ${referrer?.identifier}` })
                }
            }
            moduleCache.set(identifier, mod)
            return mod
        } catch (error) {
            log('loadModule exception', { id: shortId(identifier), error: error.stack }, 'error')
            console.log(error.stack)
        }
    }

    function linker(specifier, referrer) {
        const childId = calcSpecifierUrl(specifier,referrer)
        if (!childId) {
            log('linker resolve failed', {specifier, from: referrer.identifier}, 'error')
            console.error('VM linker: FAILED to resolve', specifier, 'from', referrer.identifier)
        }
        const res = childId && loadModule(childId, referrer.context, {fileContent: '', referrer})
        if (!res)
            return new vm.SyntheticModule([], () => {}, { context: referrer.context, identifier: `error calculating url for ${specifier} from ${referrer?.identifier}` })
        return res
    }

    async function importModuleDynamically (context, specifier, referrer) {
        const resolvedId = calcSpecifierUrl(specifier, referrer)
        if (!resolvedId) 
            throw new Error(`Cannot resolve dynamic import '${specifier}' from '${referrer?.identifier}'`)
    
        const content = /^https?:\/\//.test(resolvedId) && await fetchRemoteCode(resolvedId)
        const child = loadModule(resolvedId, context, { fileContent: content, referrer})
        if (child.status === 'unlinked')
            await child.link(linker)

        await child.evaluate()
        return child.namespace    
    }

    async function init() {
        const httpRequests = {}
        const builtIn = { ...options.builtIn }
        log('loading builtIn', { keys: Object.keys(builtIn) })
        await Promise.all(Object.entries(builtIn || {}).filter(e=>typeof e[1] == 'string').map( async e => {
            builtIn[e[0]] = await import(e[1])
            builtInModules[e[1]] = builtIn[e[0]] = builtIn[e[0]].default || builtIn[e[0]]
        }))
        builtInModules['os'] = os

        const context = vm.createContext({
            console, vmId, httpRequests, setTimeout, clearTimeout, setInterval, clearInterval, process, AbortController,
            URLSearchParams, atob, gc, performance, URL, calcSpecifierUrl, Buffer, RegExp, fetch,
            vmCleanup, builtIn, __repoRoot: globalThis.__repoRoot })
        const entryFiles = optEntryFiles || calcedEntryFiles
        log('vm context ready', { entryCount: entryFiles.length })
        const initCode = ['import { jb } from "@jb6/core"', "globalThis.jb = jb",entryFiles.map(e=>`import '${e}'`)].join('\n')
        const mod = await loadModule(vmId || 'entryScript', context , {fileContent: initCode, displayErrors: true })
        await mod.link(linker)
        await mod.evaluate()
        log('vm entry evaluated', {})

        async function evalScript(code) {
            try {
                const reqId = '' + Math.floor(10000000 + Math.random() * 90000000)
                const withReqId = `globalThis.reqId = '${reqId}'; \n${code}`
                log('evalScript', { reqId, codeLen: code.length })
                return vm.runInContext(withReqId,context, {filename: `evalScript-${reqId}`, displayErrors: true,
                    importModuleDynamically: (specifier, referrer) => importModuleDynamically (context, specifier, referrer)})
            } catch(e) {
                log('evalScript error', { error: e.stack || e.message }, 'error')
                logError('error evaluating script', {code, e})
            }
        }
        
        function destroy() {
           moduleCache.clear()
           delete vmCache[vmId]
           vmCleanup.forEach(f=>f())
           for (const k of Object.keys(context)) delete context[k]
           context.globalThis = null
           gc()
        }

        return { context, httpRequests, evalScript, destroy }
    }

    const entry = await init()
    return vmCache[vmId] = {vmId, ...entry}
}

async function fetchRemoteCode(url) {
  return new Promise((resolve, reject) => {
    const getter = url.startsWith('https:') ? https.get : http.get
    getter(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} ${url}`))
      let data = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

function safeResolveURL(specifier, base) {
    try {
      return new URL(specifier, base)
    } catch (e) {
      debugger
      return { error: e.stack, specifier, base }
    }
}