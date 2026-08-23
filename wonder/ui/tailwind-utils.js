import { dsls, coreUtils, jb } from '@jb6/core'
import '@jb6/core/misc/jb-cli.js'
import '@jb6/core/misc/import-map-services.js'

jb.tailwindUtils = { tailwindHtmlToPng, compileTailwindCSS, h, L, useState: () => {}, useEffect: () => {} }

const {
    common: { Data },
    tgp: { TgpType }
} = dsls

function h(t, p = {}, ...c){
  let [tag,cls]= typeof t==="string" ? t.split(/:(.+)/) : [t]
  if (tag == 'L') { tag = L(cls); cls = '' }
  if (c && c[0] && Array.isArray(c[0]) && c[0][0]?.key == null)
    c = [...c[0],...c.slice(1)]

  const className=[p.className,cls].filter(Boolean).join(' ').trim()
  return createElement(tag,className ? {...p,className} : p,...c)
}

const toPascal = s => s.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('')
const unknow = [["path",{"d":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"}],["path",{"d":"M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3"}],["path",{"d":"M12 17h.01"}]]
function L(iconName) {
  const icons = jb.reactUtils?.icons || {}
  const icon = icons[toPascal(iconName)] || unknow
  return function LucideIcon(props = {}) {
    const { size, width, height, color, stroke, strokeWidth, ...restProps } = props
    return createElement('svg', {
        xmlns: 'http://www.w3.org/2000/svg', width: width || size || '24', height: height || size || '24', viewBox: '0 0 24 24', fill: 'none',
        stroke: stroke || color || 'currentColor', strokeWidth: strokeWidth || '2', strokeLinecap: 'round', strokeLinejoin: 'round', ...restProps },
      ...icon.map((item, index) => createElement(item[0],{ key: index, ...item[1]}))
    )
  }
}

function createElement(type, props = {}, ...children) {
  const vdom = { type, props, children }
  vdom.toHtml = () => {
    const toAttr = (k, v) => k === 'style' && typeof v === 'object'
      ? ` style="${Object.entries(v).map(([p, val]) => `${p.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}:${val}`).join(';')}"`
      : ` ${k === 'className' ? 'class' : k}="${v}"`
    const attrs = Object.entries(props).map(([k, v]) => toAttr(k, v)).join('')
    const inner = children.filter(c => c !== false && c !== null && c !== undefined).map(c => (typeof c === 'object' ? c.toHtml() : c)).join('')
    return `<${type}${attrs}>${inner}</${type}>`
  }
  return vdom
}


Data('compileTailwindCSS', {
  params: [
    {id: 'html', as: 'text', defaultValue: '%%'},
  ],
  impl: ({},{},{html}) => compileTailwindCSS({html})
})

async function compileTailwindCSS(args) {
  const { html } = args
  if (!coreUtils.isNode) {
    const script = `
      import { coreUtils, jb } from '@jb6/core'
      import '@wonder/ui/tailwind-utils.js'
      try {
        const result = await jb.tailwindUtils.compileTailwindCSS(${JSON.stringify(args)})
        await coreUtils.writeServiceResult(result)
      } catch (e) {
        coreUtils.logException(e, 'tailwind compile failed')
        await coreUtils.writeServiceResult(null)
      }`
    const res = await coreUtils.runNodeCliViaJbWebServer(script,{importMapsInCli: './public/core/nodejs-importmap.js'})
    return res.result
  }
  const repoRoot = await coreUtils.calcRepoRoot()  
  const { compile } = await import("@tailwindcss/node")
  const { join } = await import("path")
  const { readFile } = await import("fs/promises")

  const inputCss = `@layer theme, base, components, utilities;
  @import "${join(repoRoot, 'node_modules/tailwindcss/theme.css')}" layer(theme);
  @import "${join(repoRoot, 'node_modules/tailwindcss/utilities.css')}" layer(utilities);`

  const loadModule = async (id) => {
      if (id.endsWith('.css')) {
          try {
              return await readFile(id, 'utf8')
          } catch (err) {}
      }
  }
  const compiler = await compile(inputCss, { base: repoRoot, loadModule, onDependency: () => {} })
  const classes = extractClassesFromHTML(html)
  const tailwindCss = compiler.build(classes)
  return { tailwindCss }
}

function extractClassesFromHTML(html) {
  const classes = new Set();
  const regex = /class\s*=\s*["']([^"']*)["']/gi
  let match; while ((match = regex.exec(html)) !== null) match[1].split(/\s+/).forEach(cls => cls.trim() && classes.add(cls.trim()))
  return Array.from(classes)
}

Data('tailwindHtmlToPng', {
  params: [
    {id: 'html', as: 'text', defaultValue: '%%'},
    {id: 'width', as: 'number', defaultValue: 400},
    {id: 'paddingBottom', as: 'number', defaultValue: 10},
    {id: 'deviceScaleFactor', as: 'number', defaultValue: 2},
  ],
  impl: ({},{},args) => tailwindHtmlToPng(args)
})

const CHROME_PORT = 9222

function sleep(ms) { return new Promise(res => setTimeout(res, ms)) }

async function isChromeAlive() {
  try {
    const res = await fetch(`http://localhost:${CHROME_PORT}/json/version`, { method: 'GET' })
    return res.ok
  } catch (e) {
    return false
  }
}

async function ensureChromeDaemon(chromeBin) {
  // simple in-process lock so we don’t spawn 10 chromes at once
  if (!globalThis.__ensureChromePromise) {
    globalThis.__ensureChromePromise = (async () => {
      if (await isChromeAlive()) return

      const { spawn } = await import('child_process')
      const child = spawn(chromeBin, [
        '--headless=new', `--remote-debugging-port=${CHROME_PORT}`, '--user-data-dir=/tmp/chrome-profile', '--no-sandbox', '--disable-gpu', '--disable-extensions', '--disable-background-networking',
        '--disable-dev-shm-usage', '--disable-sync', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check' ], { detached: true, stdio: 'ignore'
      })
      child.unref()

      // wait up to ~15s for Chrome to come up
      for (let i = 0; i < 60; i++) {
        if (await isChromeAlive()) return
        await sleep(250)
      }
      throw new Error('Chrome remote-debugging port not responding')
    })().finally(() => {
      globalThis.__ensureChromePromise = null
    })
  }
  return globalThis.__ensureChromePromise
}

async function fetchAsDataUrl(url, timeoutMs = 5000) {
  if (url.startsWith('data:')) return url
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (res.ok) {
      const buf = await res.arrayBuffer()
      return `data:${res.headers.get('content-type') || 'application/octet-stream'};base64,${Buffer.from(buf).toString('base64')}`
    }
  } catch {}
  return url
}

async function inlineUrls(content, regex) {
  const matches = [...content.matchAll(regex)]
  const urlMap = new Map()
  await Promise.all(matches.map(async ([, url]) => {
    if (!urlMap.has(url)) urlMap.set(url, await fetchAsDataUrl(url))
  }))
  return [...urlMap].reduce((c, [url, dataUrl]) => c.split(url).join(dataUrl), content)
}

const inlineImages = html => inlineUrls(html, /<img[^>]+src\s*=\s*["']([^"']+)["']/gi)
const inlineCssUrls = css => inlineUrls(css, /url\(["']?([^"')]+)["']?\)/gi)

async function tailwindHtmlToPng(args) {
  let { html, width = 400, paddingBottom = 10, layoutCss: layoutCssOverride, deviceScaleFactor = 2 } = args
  if (!html) return { error: 'tailwindHtmlToPng: missing html input' }

  if (!coreUtils.isNode) {
    const script = `
      import { coreUtils, jb } from '@jb6/core'
      import '@wonder/ui/tailwind-utils.js'
      try {
        const result = await jb.tailwindUtils.tailwindHtmlToPng(${JSON.stringify(args)})
        await coreUtils.writeServiceResult(result)
      } catch (e) {
        await coreUtils.writeServiceResult({ error: e.stack || e })
      }`
    const res = await coreUtils.runNodeCliViaJbWebServer(script,{importMapsInCli: './public/core/nodejs-importmap.js'})
    return res?.result || { error: 'tailwindHtmlToPng: no result from server' }
  }
  try {
    html = await inlineImages(html)
    let {tailwindCss} = await compileTailwindCSS({html})
    tailwindCss = await inlineCssUrls(tailwindCss)
    const layoutCss = layoutCssOverride || `* { box-sizing: border-box; }
    html, body { width: ${width}px; margin: 0; padding: 0; overflow-x: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans Hebrew", "Heebo", sans-serif; }
    body { padding-bottom: ${paddingBottom}px; }
    .chat-body, .w-full, .max-w-sm { max-width: 100%; }
    button { max-width: 100%; }`
    const finalHTML = `<!doctype html><html><head><meta charset="utf-8"><style>${layoutCss}\n${tailwindCss}</style></head>${html}</html>`

    let puppeteer = await import('puppeteer-core')
    puppeteer = puppeteer || puppeteer.default
    const chromeBin = process.env.CHROME_BIN || 'google-chrome'
    await ensureChromeDaemon(chromeBin)

    const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${CHROME_PORT}`, defaultViewport: null })
    const page = await browser.newPage()
    await page.setJavaScriptEnabled(false)
    await page.setRequestInterception(true)
    page.on('request', r => r.abort())
    await page.setContent(finalHTML, { waitUntil: 'domcontentloaded' })

    const height = await page.evaluate(() => {
      const rect = document.body.getBoundingClientRect()
      return Math.ceil(rect.bottom)
    })
    await page.setViewport({ width: width + 3, height: Math.max(200, height) + paddingBottom, deviceScaleFactor })

    const pngBuffer = await page.screenshot({type: 'png', captureBeyondViewport: false })
    try { await page.close() } catch {}
    try { await browser.disconnect() } catch {}

    const base64 = pngBuffer.toString('base64')
    return { imageUrl: `data:image/png;base64,${base64}`, base64, html, finalHTML }
  } catch (e) {
    return { error: `tailwindHtmlToPng: ${e.stack || e}` }
  }
}
