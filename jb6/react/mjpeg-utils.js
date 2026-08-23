import { dsls, coreUtils, jb } from '@jb6/core'
import '@jb6/rx'

const {
  tgp: { Component },
  rx: { ReactiveSource }
} = dsls

const CHROME_PORT = 9222

async function isChromeAlive() {
  try {
    const res = await fetch(`http://localhost:${CHROME_PORT}/json/version`, { method: 'GET' })
    return res.ok
  } catch (e) {
    return false
  }
}

async function ensureChromeDaemon(chromeBin) {
  if (!globalThis.__ensureChromePromise) {
    globalThis.__ensureChromePromise = (async () => {
      if (await isChromeAlive()) return

      const { spawn } = await import('child_process')
      const child = spawn(chromeBin, [
        '--headless=new', `--remote-debugging-port=${CHROME_PORT}`, '--user-data-dir=/tmp/chrome-profile', '--no-sandbox', '--disable-gpu', '--disable-extensions', '--disable-background-networking',
        '--disable-dev-shm-usage', '--disable-sync', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check' ], { detached: true, stdio: 'ignore'
      })
      child.unref()

      for (let i = 0; i < 60; i++) {
        if (await isChromeAlive()) return
        await coreUtils.delay(250)
      }
      throw new Error('Chrome remote-debugging port not responding')
    })().finally(() => {
      globalThis.__ensureChromePromise = null
    })
  }
  return globalThis.__ensureChromePromise
}

async function createAnimatedPage({ html, width = 400, height = 300 }) {
  if (!coreUtils.isNode) return null

  let puppeteer = await import('puppeteer-core')
  puppeteer = puppeteer || puppeteer.default
  const chromeBin = process.env.CHROME_BIN || 'google-chrome'
  await ensureChromeDaemon(chromeBin)

  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${CHROME_PORT}` })
  const page = await browser.newPage()
  
  await page.setViewport({ width, height })
  await page.setContent(html, { waitUntil: 'domcontentloaded' })
  
  return { page, browser }
}

const zoomInOutStream = Component('zoomInOutStream', {
  type: 'reactive-source<rx>',
  params: [
    {id: 'html', as: 'text', mandatory: true},
    {id: 'cssVariable', as: 'string', mandatory: true},
    {id: 'zoomMin', as: 'number', defaultValue: 1},
    {id: 'zoomMax', as: 'number', defaultValue: 3},
    {id: 'fps', as: 'number', defaultValue: 2},
    {id: 'totalTime', as: 'number', defaultValue: 10},
    {id: 'width', as: 'number', defaultValue: 400},
    {id: 'height', as: 'number', defaultValue: 300}
  ],
  impl: (ctx, {}, { html, cssVariable, zoomMin, zoomMax, fps, totalTime, width, height }) => {
    return (start, sink) => {
      if (start !== 0) return
      
      let scale = zoomMin
      let direction = 1
      const step = (zoomMax - zoomMin) / (fps * 2)
      let stopped = false
      let pageContext = null
      let endSent = false
      
      const sendEnd = () => {
        if (!endSent) {
          endSent = true
          sink(1, ctx.dataObj({ type: 'mjpeg_end'}))
          sink(2)
        }
      }
      
      sink(0, (t) => { 
        if (t === 2) {
          stopped = true
          sendEnd()
          if (pageContext) {
            pageContext.page.close().catch(() => {})
            try { pageContext.browser.disconnect() } catch {}
          }
        }
      })

      createAnimatedPage({ html, width, height }).then(async context => {
          if (stopped) return
          pageContext = context
          
          sink(1, ctx.dataObj({ type: 'mjpeg_headers', fps }))
          
          let totalFrames = 0
          let currentScale = zoomMin
          let direction = 1
          
          // Simple loop - capture and send one frame at a time
          const streamLoop = async () => {
            const framesToProduce = totalTime * fps

            while (!stopped && totalFrames < framesToProduce) {
              await pageContext.page.evaluate((varName, val) => {
                document.documentElement.style.setProperty('--' + varName, val)
              }, cssVariable, currentScale)
              const jpegBuffer = await pageContext.page.screenshot({ type: 'jpeg', quality: 60 })
              
              totalFrames++
              sink(1, ctx.dataObj({ type: 'mjpeg_frame', jpegBuffer }))
              
              // Update scale for next frame
              currentScale += step * direction
              if (currentScale >= zoomMax || currentScale <= zoomMin) {
                  direction *= -1
                  currentScale = Math.max(zoomMin, Math.min(zoomMax, currentScale))
              }
            }
            if (totalFrames >= framesToProduce) sendEnd()
          }
          
          streamLoop()
          
        })
        .catch(err => {
          console.error('Failed to create animated page:', err)
          sendEnd()
        })
    }
  }
})

// Example usage
ReactiveSource('mjpeg.helloWorldZoom', {
  impl: zoomInOutStream({ 
    html: `<!doctype html>
<html>
<head>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { 
      width: 400px; 
      height: 300px; 
      overflow: hidden;
    }
    :root { --zoomVar: 1; }
    .zoom-content {
      transform: scale(var(--zoomVar));
      transform-origin: center center;
      text-align: center;
      font-size: 24px;
      padding: 50px;
      color: blue;
    }
  </style>
</head>
<body>
  <div class="zoom-content">Hello World!</div>
</body>
</html>`,
    cssVariable: 'zoomVar',
    zoomMin: 0.5,
    zoomMax: 4
  })
})


const exploreItems = Component('exploreItems', {
  type: 'reactive-source<rx>',
  params: [
    {id: 'html', as: 'text', mandatory: true},
    {id: 'itemsSelector', as: 'string', mandatory: true},
    {id: 'zoomOut', as: 'number', defaultValue: 1},
    {id: 'zoomIn', as: 'number', defaultValue: 3},
    {id: 'fps', as: 'number', defaultValue: 1},
    {id: 'totalTime', as: 'number', defaultValue: 10},
    {id: 'width', as: 'number', defaultValue: 400},
    {id: 'height', as: 'number', defaultValue: 300}
  ],
  impl: (ctx, {}, { html, itemsSelector, zoomOut, zoomIn, fps, totalTime, width, height }) => {
    return (start, sink) => {
      if (start !== 0) return
      
      let stopped = false
      let pageContext = null
      let endSent = false
      
      const sendEnd = () => {
        if (!endSent) {
          endSent = true
          sink(1, ctx.dataObj({ type: 'mjpeg_end'}))
          sink(2)
        }
      }
      
      sink(0, (t) => { 
        if (t === 2) {
          stopped = true
          sendEnd()
          if (pageContext) {
            pageContext.page.close().catch(() => {})
            try { pageContext.browser.disconnect() } catch {}
          }
        }
      })

      createAnimatedPage({ html, width, height }).then(async context => {
          if (stopped) return
          pageContext = context
          
          // Stage 1: Get item coordinates
          const items = await pageContext.page.evaluate((selector) => {
            const elements = document.querySelectorAll(selector)
            const viewportW = window.innerWidth
            const viewportH = window.innerHeight
            return Array.from(elements).map(el => {
              const rect = el.getBoundingClientRect()
              return {
                // Center coordinates relative to viewport center
                x: (rect.left + rect.width / 2) - viewportW / 2,
                y: (rect.top + rect.height / 2) - viewportH / 2,
                width: rect.width,
                height: rect.height
              }
            })
          }, itemsSelector)
          
          console.log('Found items:', items)
          
          if (items.length === 0) {
            console.error('No items found with selector:', itemsSelector)
            sendEnd()
            return
          }
          
          // Stage 2: Build animation route
          // For each item: zoom out → pan to item → zoom in → pause
          const buildRoute = () => {
            const route = []
            
            for (let i = 0; i < items.length; i++) {
              const item = items[i]
              const nextItem = items[(i + 1) % items.length]
              
              // Zoom in on current item (start position or after pan)
              route.push({ zoom: zoomIn, panX: -item.x, panY: -item.y, phase: 'zoomedIn' })
              
              // Zoom out (prepare to pan)
              route.push({ zoom: zoomOut, panX: -item.x, panY: -item.y, phase: 'zoomingOut' })
              
              // Pan to next item (while zoomed out)
              route.push({ zoom: zoomOut, panX: -nextItem.x, panY: -nextItem.y, phase: 'panning' })
              
              // Zoom in on next item
              route.push({ zoom: zoomIn, panX: -nextItem.x, panY: -nextItem.y, phase: 'zoomingIn' })
            }
            
            return route
          }
          
          const route = buildRoute()
          console.log('Animation route:', route)
          
          sink(1, ctx.dataObj({ type: 'mjpeg_headers', fps }))
          
          // Stage 3: Animate through the route
          let routeIndex = 0
          let stepInTransition = 0
          
          const lerp = (a, b, t) => a + (b - a) * t
          
          const streamLoop = async () => {
            const framesToProduce = totalTime * fps
            let totalFrames = 0

            while (!stopped && totalFrames < framesToProduce) {
              const current = route[routeIndex]
              const next = route[(routeIndex + 1) % route.length]
              
              // Interpolate between current and next keyframe
              const t = stepInTransition / fps
              const zoom = lerp(current.zoom, next.zoom, t)
              const panX = lerp(current.panX, next.panX, t)
              const panY = lerp(current.panY, next.panY, t)
              
              // Apply transform
              await pageContext.page.evaluate((z, px, py) => {
                document.documentElement.style.setProperty('--zoom', z)
                document.documentElement.style.setProperty('--panX', px + 'px')
                document.documentElement.style.setProperty('--panY', py + 'px')
              }, zoom, panX, panY)
              
              const jpegBuffer = await pageContext.page.screenshot({ type: 'jpeg', quality: 60 })
              sink(1, ctx.dataObj({ type: 'mjpeg_frame', jpegBuffer }))
              
              totalFrames++
              // Advance animation
              stepInTransition++
              while (stepInTransition >= fps) {
                stepInTransition -= fps
                routeIndex = (routeIndex + 1) % route.length
              }
            }
            if (totalFrames >= framesToProduce) sendEnd()
          }
          
          streamLoop()
          
        })
        .catch(err => {
          console.error('Failed to create animated page:', err)
          sendEnd()
        })
    }
  }
})

ReactiveSource('mjpeg.itemsView', {
  impl: exploreItems({ 
    html: `<!doctype html>
<html>
<head>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { 
      width: 400px; 
      height: 300px; 
      overflow: hidden;
    }
    :root { 
      --zoom: 1; 
      --panX: 0px; 
      --panY: 0px; 
    }
    .container {
      width: 100%;
      height: 100%;
      transform: scale(var(--zoom)) translate(var(--panX), var(--panY));
      transform-origin: center center;
    }
    .item {
      padding: 20px;
      margin: 10px;
      background: #3498db;
      color: white;
      text-align: center;
      font-size: 24px;
      border-radius: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="item">Item 1</div>
    <div class="item">Item 2</div>
    <div class="item">Item 3</div>
  </div>
</body>
</html>`,
    itemsSelector: '.item',
    zoomOut: 1,
    zoomIn: 2.5
  })
})