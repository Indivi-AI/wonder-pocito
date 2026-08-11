import { dsls, coreUtils, jb } from '@jb6/core'
import '@jb6/core/misc/jb-cli.js'
import '@jb6/core/misc/import-map-services.js'

jb.tailwindUtils = { tailwindHtmlToPng, compileTailwindCSS, h }

const {
    common: { Data },
    tgp: { TgpType }
} = dsls

function h(t, p = {}, ...c){
  let [tag,cls]= typeof t==="string" ? t.split(/:(.+)/) : [t]
  if (c && c[0] && Array.isArray(c[0]) && c[0][0]?.key == null)
    c = [...c[0],...c.slice(1)]

  const className=[p.className,cls].filter(Boolean).join(' ').trim()
  return createElement(tag,className ? {...p,className} : p,...c)
}

function createElement(type, props = {}, ...children) {
  const vdom = { type, props, children }
  vdom.toHtml = () => {
    const attrs = Object.entries(props).map(([k, v]) => ` ${k === 'className' ? 'class' : k}="${v}"`).join('')
    const inner = children.map(c => (typeof c === 'object' ? c.toHtml() : c)).join('')
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
      import '@jb6/react/tailwind-utils.js'
      try {
        const result = await jb.tailwindUtils.compileTailwindCSS(${JSON.stringify(args)})
        await coreUtils.writeServiceResult(result)
      } catch (e) {
        await coreUtils.writeServiceResult(e.message || e)
      }`
    const res = await coreUtils.runNodeCliViaJbWebServer(script)
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

      // wait up to ~5s for Chrome to come up
      for (let i = 0; i < 20; i++) {
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

async function tailwindHtmlToPng(args) {
  const { html, width = 400, paddingBottom = 10, layoutCss: layoutCssOverride } = args

  if (!coreUtils.isNode) {
    const script = `
      import { coreUtils, jb } from '@jb6/core'
      import '@jb6/react/tailwind-utils.js'
      try {
        const result = await jb.tailwindUtils.tailwindHtmlToPng(${JSON.stringify(args)})
        await coreUtils.writeServiceResult(result)
      } catch (e) {
        await coreUtils.writeServiceResult(e.message || e)
      }`
    const res = await coreUtils.runNodeCliViaJbWebServer(script)
    return res.result
  }
  const {tailwindCss} = await compileTailwindCSS({html})
  const layoutCss = layoutCssOverride || `* { box-sizing: border-box; }
  html, body { width: ${width}px; margin: 0; padding: 0; overflow-x: hidden; }
  body { padding-bottom: ${paddingBottom}px; }
  .chat-body, .w-full, .max-w-sm { max-width: 100%; }
  button { max-width: 100%; }`
  const finalHTML = `<!doctype html><html><head><meta charset="utf-8"><style>${layoutCss}\n${tailwindCss}</style></head>${html}</html>`

  const puppeteer = (await import('puppeteer-core')).default
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

  // Resize to fit content exactly
  await page.setViewport({
    width: width + 3,
    height: Math.max(200, height) + paddingBottom,
    deviceScaleFactor: 1
  })

  const pngBuffer = await page.screenshot({type: 'png', captureBeyondViewport: false })
  try { await page.close() } catch {}
  try { await browser.disconnect() } catch {}

  const base64 = pngBuffer.toString('base64')
  return { imageUrl: `data:image/png;base64,${base64}`, base64, html, finalHTML }
}

