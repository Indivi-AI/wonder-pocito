import { jb, coreUtils, dsls } from '@jb6/core'
import '@jb6/core/misc/import-map-services.js'
export const reactUtils = jb.reactUtils = { h, L, loadLucid05, loadReveal, hh, hhStrongRefresh, runOnHost, rebuildNativeComp, extendCtxWithUrl, imported }

const { tgp: { TgpType, Component } } = dsls

jb.reactRepository = {
  comps: {},
  promises: {},
  importCache: {}
}
const repo = jb.reactRepository
const hostInfo = Symbol.for('hostInfo')

jb.coreRegistry.urlReservedParams = jb.coreRegistry.urlReservedParams || {}
Object.assign(jb.coreRegistry.urlReservedParams, {cmpId: true, urlsToLoad: true, wlaForceRebuild: true, wlaDryRun: true})

function logMs(ctx, t, ms, extra) { if (ms) ctx.vars.uiLogger?.info?.({t, ms, ...extra}, {}, {ctx}) }

function imported(url) { return repo.importCache[url] }

function extendCtxWithUrl({ctx = new coreUtils.Ctx(), href} = {}) {
  href = href ?? globalThis.window?.location?.href ?? ''
  const urlParams = new URLSearchParams(href.split('?')[1] || '')
  const reserved = jb.coreRegistry.urlReservedParams
  const urlVars = Object.fromEntries([...urlParams.entries()].map(([k, v]) => k.startsWith('ctx-') ? [k.slice(4), v] : reserved[k] ? [k, v] : null).filter(Boolean))
  return coreUtils.loggersFromUrl(urlParams, ctx.setVars(urlVars))
}

const ReactComp = TgpType('react-comp','react', { isCircuit: true,
  typescript: '(props) => vdom & { [hostInfo]: { hFunc, enrichCtx, importMetas, progressIndicator } }',
  probeExec: (passiveRes, circuitCtx) => {
    const probeCtx = circuitCtx.setVars({react: reactUtils})
    return reactUtils.probeReactComp(probeCtx, reactUtils.rebuildNativeComp(passiveRes, probeCtx))
  }
})
TgpType('vdom','react', { typescript: '(ctx, ctxVars, compParams) => (reactProps) => vdom' })
TgpType('react-metadata','react')
const ProgressIndicator = TgpType('progress-indicator','react', {
  typescript: '{ requiredLoggers: (ctx) => string, hFunc: vdom<react> }'
})
TgpType('progress-hfunc','react', {
  typescript: '(ctx) => ({progressEvent}) => vdom'
})

Component('importUrl', {
  description: 'importUrls for the component, will make the comp async',
  type: 'react-metadata<react>',
  params: [
    {id: 'importUrl', as: 'string'},
    {id: 'stubUrl', as: 'string', byName: true}
  ]
})

Component('containerComp', {
  description: 'certain react comps need containers to run in. containers usually provide ctx.vars',
  type: 'react-metadata<react>',
  params: [
    {id: 'containerComp', as: 'string', description: 'runOnHost will mount this comp inside the container for preview'},
    {id: 'cntrImportPath', as: 'string', description: 'runOnHost will load the container from there' }
  ]
})

ReactComp('comp', {
  params: [
    {id: 'hFunc', type: 'vdom', dynamic: true, byName: true},
    {id: 'enrichCtx', type: 'ctx-enricher<tgp>', dynamic: true, byName: true, description: 'enrich the react comp ctx at the *first time*. to run on every refresh use hhStrongRefresh'},
    {id: 'metadata', type: 'react-metadata[]', dynamic: true},
    {id: 'progressIndicator', type: 'progress-indicator<react>', dynamic: true, byName: true, defaultValue: {$: 'progress-indicator<react>spinner'}},
  ],
  impl: (_ctx, {strongRefresh}, { hFunc, enrichCtx, metadata, progressIndicator }) => {
    const ctx = _ctx.setVars({strongRefresh: false})
    const jbid = ctx.jbCtx.lexicalStack?.join(';')
    const id = strongRefresh ? '' : jbid && `${jbid}|${Object.keys(ctx.vars || {}).sort().join(',')}`
    if (id && repo.comps[id]) return repo.comps[id]
    const importMetas = coreUtils.asArray(metadata()).filter(m => m.importUrl)
    const native = buildNativeComp({ hFunc, enrichCtx, importMetas, progressIndicator }, ctx)
    native.jbid = jbid
    Object.defineProperty(native, 'name', { value: id })
    return id ? (repo.comps[id] = native) : native
  }
})

// # HOST
async function runOnHost(cmpId, _ctx, args) {
  const ctx = (_ctx || new coreUtils.Ctx()).setVars({react: reactUtils})
  try {
    const fullId = cmpId.indexOf('<') == -1 ? `react-comp<react>${cmpId}` : cmpId
    const jbComp = coreUtils.compByFullId(fullId)
    coreUtils.resolveCompArgs(jbComp)
    const metadata = coreUtils.asArray(jbComp.impl.metadata)
    const containerComp = metadata.find(m => m.containerComp)?.containerComp
    const cntrImportPath = metadata.find(m => m.containerComp)?.cntrImportPath
    if (cntrImportPath) {
      const _t = Date.now()
      await import(cntrImportPath)
      logMs(ctx, 'jb6.cntrImport', Date.now() - _t, {cntrImportPath})
    }
    const compToRun = containerComp && dsls.react['react-comp'][containerComp] || coreUtils.proxyByFullId(fullId)

    const ctxWithComp = containerComp ? ctx.setVars({testedComp: cmpId}) : ctx
    const reactCmp = compToRun.$runWithCtx(ctxWithComp, args != null ? args : {})
    return { ctx: ctxWithComp, reactCmp }
  } catch(error) {
    return { ctx, reactCmp: () => reactUtils.h('pre',{},error.stack) }
  }
}

// # RENDER (hyperscript)
function h(t, p = {}, ...c) {
  let [tag,cls]= typeof t==="string" ? t.split(/:(.+)/) : [t]
  if (tag == 'L') {
    tag = L(cls)
    cls = ''
  }
  c = c.flat().filter(x => x != null)

  const className=[p.className,cls].filter(Boolean).join(' ').trim()
  let vdom = reactUtils.createElement(tag,className ? {...p,className} : p,...c)
  if (typeof t == 'function' && t.jbid)
    return h('div', { jbid: t.jbid, style: { display: 'contents' } }, vdom)
  return vdom
}

function hh(ctx, t, p = {}, ...c) {
  if (!(ctx instanceof coreUtils.Ctx))
    console.error('hh: first param of hh must be ctx')
  t = t[coreUtils.asJbComp] ? t.$runWithCtx(ctx) : t
  return h(t,p,...c)
}

function hhStrongRefresh(ctx, t, p = {}, ...c) {
  if (!(ctx instanceof coreUtils.Ctx))
    console.error('hhStrongRefresh: first param of hh must be ctx')
  if (t[coreUtils.asJbComp]) {
    const id = 'react:' + t[coreUtils.asJbComp].id
    t = t.$runWithCtx(ctx.setVars({strongRefresh: true}))
    const f = id ? ({ [id]: () => h(t,p,...c) })[id] : (() => h(t,p,...c))
    return f()
  }
  return h(t,p,...c)
}

// # ICONS (Lucide)
const toPascal = s => s.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('')
const unknow = [["path",{"d":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"}],["path",{"d":"M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3"}],["path",{"d":"M12 17h.01"}]]
function L(iconName) {
  const icon = jb.reactUtils.icons && jb.reactUtils.icons[toPascal(iconName)] || unknow
  return function LucideIcon(props) {
    const { size, width, height, color, stroke, strokeWidth, ...restProps } = props
    return reactUtils.createElement('svg', {
        xmlns: 'http://www.w3.org/2000/svg', width: width || size || '24', height: height || size || '24', viewBox: '0 0 24 24', fill: 'none',
        stroke: stroke || color || 'currentColor', strokeWidth: strokeWidth || '2', strokeLinecap: 'round', strokeLinejoin: 'round', ...restProps },
      icon.map((item, index) => reactUtils.createElement(item[0],{ key: index, ...item[1]}))
    )
  }
}

async function loadLucid05() {
  return jb.reactUtils.icons = await import('@jb6/react/lib/lucide-0.5.mjs')
}

async function loadReveal() {
  return jb.reactUtils.reveal = await import('@jb6/react/lib/reveal-5.2.1.mjs')
}

// # KERNEL (recipe + ctx → native React fn)
function resolveImportUrl(m) {
  const key = m.importUrl
  if (repo.importCache[key]) return repo.importCache[key]
  const url = (globalThis.window?.testing && m.stubUrl && !globalThis.window?.noStubs) ? m.stubUrl : key
  return import(url).then(mod => repo.importCache[key] = mod)
}

function readyReactCtx(ctx, importMetas, enrichCtx) {
  const tImp = Date.now()
  const imports = importMetas.map(m => resolveImportUrl(m))
  const pending = imports.some(coreUtils.isPromise) &&
    Promise.all(imports).then(() => logMs(ctx, 'jb6.importUrls', Date.now() - tImp, {urls: importMetas.map(m => m.importUrl)}))
  const tEnr = Date.now()
  const enriched = enrichCtx(ctx) || ctx
  logMs(ctx, 'jb6.enrichCtx', Date.now() - tEnr)
  return pending ? Promise.resolve(pending).then(() => enriched) : enriched
}

function buildNativeComp(host, ctx, {rebuilt} = {}) {
  const { hFunc, enrichCtx, importMetas, progressIndicator } = host
  const { useState, useEffect } = ctx.vars.react
  const indicator = progressIndicator(ctx)
  const requiredLoggers = indicator.requiredLoggers(ctx)
  ctx = coreUtils.ensureLoggers(requiredLoggers, {ctx: ctx.setVars({loggersNeededForUiProgress: requiredLoggers})})
  const readyCtx = readyReactCtx(ctx, importMetas, enrichCtx)
  const async = coreUtils.isPromise(readyCtx)
  ctx.vars.uiLogger?.info?.({t: 'buildNativeComp', comp: ctx.jbCtx.path, rebuilt: !!rebuilt, async, imports: importMetas.length}, {}, {ctx})
  const native = async
    ? args => {
        const [rctx, setCtx] = useState(null)
        useEffect(() => { let live = true; readyCtx.then(c => live && setCtx(c)); return () => { live = false } }, [])
        return rctx ? h(hFunc(rctx), args) : h(indicator.hFunc)
      }
    : hFunc(readyCtx)
  native[hostInfo] = host
  return native
}

function rebuildNativeComp(native, ctx) {
  const host = native[hostInfo]
  if (!host)
    ctx.vars.uiLogger?.info?.({t: 'rebuildNativeComp.noHost', comp: ctx.jbCtx.path}, {}, {ctx})
  return host ? buildNativeComp(host, ctx, {rebuilt: true}) : native
}

// # BOOTSTRAP
let initReact = () => {}
if (!globalThis.window) {
  initReact = async () => {
    const cli = Object.fromEntries(process.argv.slice(2).filter(a=>a.startsWith('--')).map(a=>a.slice(2).split('=')))
    const url = globalThis.builtIn?.window?.url || cli.url || 'http://localhost'
    const html = globalThis.html || '<!DOCTYPE html><body></body>'
    const JSDOM = globalThis.builtIn?.JSDOM?.JSDOM || (await import('jsdom')).JSDOM
    const dom = new JSDOM(html, { url, pretendToBeVisual: true, resources: 'usable', features: { ProcessExternalResources: false } })
    const win = globalThis.window = dom.window
    const isLocalHost = win.location.hostname === 'localhost'

    await import('./lib/mutationobserver.min.js')

    win.matchMedia = () => ({})
    win.scrollTo     = () => {}
    win.Element.prototype.scrollTo = () => {}
    win.Element.prototype.scrollIntoView = () => {}
    globalThis.requestAnimationFrame = cb => setTimeout(cb, 0)
    globalThis.cancelAnimationFrame  = id => clearTimeout(id)
    globalThis.nodeTesting = true

    globalThis.localStorage = {
      db: {},
      getItem(k)    { return this.db[k] },
      setItem(k,v)  { this.db[k] = v },
      removeItem(k) { delete this.db[k] }
    }

    ;['Image','Node','Element','HTMLElement','Document','MutationObserver','document'].forEach(k => globalThis[k] = win[k])
    ;['navigator','location'].forEach(k => Object.defineProperty(globalThis, k, { value: win[k], writable: true, configurable: true, enumerable: true }))
    const ver = isLocalHost ? '19.2.0-dev' : '19.2.0-prod'
    const {React,ReactDomClient,ReactDom} = await import(`@jb6/react/lib/react-all-${ver}.mjs`)
    Object.assign(reactUtils, { ...React, ...ReactDomClient, ...ReactDom, React, ReactDOM: ReactDomClient })
  }
} else {
  initReact = async () => {
    const isLocalHost = typeof location !== 'undefined' && location.hostname === 'localhost'
    const ver = isLocalHost ? '19.2.0-dev' : '19.2.0-prod'
    if (typeof process === 'undefined')
      globalThis.process = { env: { NODE_ENV: 'development' }, platform: 'browser', version: '', versions: {} }
    if (!reactUtils.reactPromise)
      reactUtils.reactPromise = (async () => {
        const { React, ReactDomClient, ReactDom } = await import(`@jb6/react/lib/react-all-${ver}.mjs`)
        Object.assign(reactUtils, { ...React, ...ReactDomClient, ...ReactDom, React, ReactDOM: ReactDomClient  })
      })()
    return reactUtils.reactPromise
  }
}

await (async () => initReact())()
