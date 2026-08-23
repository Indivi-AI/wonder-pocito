import { dsls } from '@jb6/core'
import '@jb6/react'
import '@jb6/llm-guide'

const {
  tgp: { TgpType, Component },
  react: { ReactComp, 'react-comp': { comp } },
  test: { Logger, logger: { domainLogger } },
  'llm-guide': { Doclet }
} = dsls

Doclet('zui-comp', {
  impl: `
ZUI renders items that reveal detail as you zoom. zVars (CSS custom properties) drive show/hide via CSS transitions.
zoomingGrid: absolute positioning + CSS transform scale. Pan/zoom on infinite canvas. Use for spatial layouts (galaxies, graphs).
zoomingCards: flex/grid layout, DOM-sized items, no transform scale. Text stays readable. Use for documents, data-flow diagrams.
zoomingWithHotCardAndMargins: zoom-to-focus. Split only when screen > mainWidth (margins exist).
Below splitPx all cards equal. Above splitPx, hotCard grows, others shrink. State is stored in the URL hash.
Consumer provides layoutFunc(h,ctx) + calcVars. debugPanel enables the debug bar.
zVar show/hide: opacity: var(--name); max-height: calc(var(--name) * 300px); overflow: hidden; transition: opacity 0.3s;
Key types: zuiCanvas(items, itemsLayout, zoomViews, baseItemSize), itemView(minItemSize, zoomingVars, hFunc), zVar(id, calcFunc).
See zui-tests.js for zoomingGrid examples, schematics/zui/schematics-zui-fields.js for zoomingWithHotCardAndMargins.
`
})

// --- TgpTypes ---

const ZuiCanvas = TgpType('zui-canvas', 'zui', {
  typescript: `{
    items: {id:string}[], positions: Record<string, {x:number, y:number}>,
    zoomViews: zoom-views<zui>, baseItemSize: number,
    zoomState: {scale:number, pan:{x:number,y:number}, viewport:{w:number,h:number}},
    frame: {itemPixelSize:number, activeViewIdx:number, zVarValues:Record<string,string|number>, visibleItems:{id:string}[]} | null,
    setView(patch): frame
  }`
})
const ItemView = TgpType('item-view', 'zui', {
  typescript: '{ minItemSize: number, zoomingVars: zooming-var<zui>[], hFunc: (ctx) => vdom }'
})
const ZoomingVar = TgpType('zooming-var', 'zui', {
  typescript: '{ id: string, calcFunc: (itemPixelSize: number) => string|number }'
})
const ZoomViews = TgpType('zoom-views', 'zui', {
  typescript: '{ views: item-view<zui>[], activeView(itemPixelSize): number }'
})
const ItemsLayout = TgpType('items-layout', 'zui', {
  typescript: '(ctx) => Record<string, {x:number, y:number}>'
})
const MetadataLayout = TgpType('metadata-layout', 'zui', {
  typescript: '(ctxWithGraph) => {width:number,height:number,children:object[],edges:object[]}'
})

Logger('zuiLoggerProf', { impl: domainLogger('zui') })

// --- Components ---

Component('zVar', {
  type: 'zooming-var<zui>',
  macroByValue: true,
  params: [
    {id: 'id', as: 'string'},
    {id: 'calcFunc', dynamic: true},
  ]
})

Component('itemView', {
  type: 'item-view<zui>',
  params: [
    {id: 'minItemSize', as: 'number', defaultValue: 0},
    {id: 'zoomingVars', type: 'zooming-var<zui>[]', byName: true},
    {id: 'hFunc', type: 'vdom', dynamic: true},
  ]
})

Component('zoomViews', {
  type: 'zoom-views<zui>',
  params: [
    {id: 'views', type: 'item-view<zui>[]', composite: true},
  ],
  impl: (ctx, {}, {views}) => {
    const sorted = [...views].sort((a, b) => a.minItemSize - b.minItemSize)
    return {
      views: sorted,
      activeView: itemPixelSize => sorted.reduce((acc, v, i) => itemPixelSize >= v.minItemSize ? i : acc, 0)
    }
  }
})

Component('twoLayerMetadataLayout', {
  type: 'metadata-layout<zui>',
  params: [
    {id: 'nodeGap', as: 'number', defaultValue: 36},
    {id: 'layerGap', as: 'number', defaultValue: 100},
    {id: 'padding', as: 'number', defaultValue: 30},
  ],
  impl: (ctx, {}, {nodeGap, layerGap, padding}) => {
    const graph = ctx.data, nodes = graph.children.map(node => ({ ...node }))
    const byId = Object.fromEntries(nodes.map(node => [node.id, node]))
    const rowWidth = row => row.reduce((sum, node) => sum + node.width, 0) + nodeGap * (row.length - 1)
    const mainBySize = nodes.filter(node => node.layer === 'main').sort((a, b) => b.meta.bytes - a.meta.bytes)
    const main = mainBySize.reduce((row, node, i) => i % 2 ? [node, ...row] : [...row, node], [])
    const connected = id => graph.edges.flatMap(edge =>
      edge.sources[0] === id ? edge.targets : edge.targets[0] === id ? edge.sources : [])
    const centers = Object.fromEntries(main.map((node, i) => [
      node.id, main.slice(0, i).reduce((x, n) => x + n.width + nodeGap, node.width / 2)
    ]))
    const lookups = nodes.filter(node => node.layer === 'lookup')
    for (let i = 0; i < lookups.length; i++)
      lookups.forEach(node => {
        const xs = connected(node.id).map(id => centers[id]).filter(x => x != null)
        if (xs.length) centers[node.id] = xs.reduce((a, b) => a + b) / xs.length
      })
    lookups.sort((a, b) => (centers[a.id] ?? Infinity) - (centers[b.id] ?? Infinity))
    const width = Math.max(rowWidth(main), rowWidth(lookups)) + padding * 2
    const place = (row, y) => {
      let x = (width - rowWidth(row)) / 2
      row.forEach(node => { Object.assign(node, { x, y }); x += node.width + nodeGap })
    }
    const mainY = padding + 20, mainHeight = Math.max(...main.map(node => node.height))
    const lookupY = mainY + mainHeight + layerGap
    place(main, mainY)
    place(lookups, lookupY)
    const edges = graph.edges.map(edge => {
      const source = byId[edge.sources[0]], target = byId[edge.targets[0]]
      const sameLayer = source.layer === target.layer
      const channelY = sameLayer
        ? source.layer === 'main' ? mainY - 12 : lookupY + Math.max(source.height, target.height) + 12
        : mainY + mainHeight + layerGap / 2
      const mainNode = source.layer === 'main' ? source : target
      const lookupNode = source.layer === 'lookup' ? source : target
      const startPoint = sameLayer
        ? { x: source.x + source.width / 2, y: source.layer === 'main' ? source.y : source.y + source.height }
        : { x: mainNode.x + mainNode.width / 2, y: mainNode.y + mainNode.height }
      const endPoint = sameLayer
        ? { x: target.x + target.width / 2, y: target.layer === 'main' ? target.y : target.y + target.height }
        : { x: lookupNode.x + lookupNode.width / 2, y: lookupNode.y }
      const bendPoints = [{ x: startPoint.x, y: channelY }, { x: endPoint.x, y: channelY }]
      return { ...edge, sections: [{ startPoint, bendPoints, endPoint }],
        labels: edge.labels.map(label => ({ ...label, x: (startPoint.x + endPoint.x - label.width) / 2, y: channelY - 9 })) }
    })
    return { width, height: lookupY + Math.max(...lookups.map(node => node.height)) + padding + 20, children: nodes, edges }
  }
})

// --- zuiCanvas ---

function calcFrame(zoomState, items, positions, zoomViews, baseItemSize) {
  const itemPixelSize = baseItemSize * zoomState.scale
  const activeViewIdx = zoomViews.activeView(itemPixelSize)
  const zVarValues = {}
  ;(zoomViews.views[activeViewIdx].zoomingVars || []).forEach(v => zVarValues[v.id] = v.calcFunc.profile(itemPixelSize))
  const { pan, viewport } = zoomState
  const visibleItems = items.filter(item => {
    const p = positions[item.id]
    if (!p) return false
    const sx = p.x * zoomState.scale + pan.x, sy = p.y * zoomState.scale + pan.y
    return sx + itemPixelSize > 0 && sx < viewport.w && sy + itemPixelSize > 0 && sy < viewport.h
  })
  return { itemPixelSize, activeViewIdx, zVarValues, visibleItems, visibleCount: visibleItems.length }
}

Component('zuiCanvas', {
  type: 'zui-canvas<zui>',
  params: [
    {id: 'items', dynamic: true},
    {id: 'itemsLayout', type: 'items-layout<zui>', dynamic: true},
    {id: 'zoomViews', type: 'zoom-views<zui>'},
    {id: 'baseItemSize', as: 'number', defaultValue: 80},
  ],
  impl: async (ctx, {zuiLogger}, {items: _items, itemsLayout, zoomViews, baseItemSize}) => {
    const items = await _items(ctx)
    const positions = await itemsLayout(ctx.setVars({items}))
    const zoomState = { scale: 1, pan: { x: 0, y: 0 }, viewport: { w: 375, h: 812 } }
    let frame = null
    return {
      items, positions, zoomViews, baseItemSize, zoomState, onFrame: null,
      get frame() { return frame },
      setView(patch) {
        Object.assign(zoomState, patch)
        frame = calcFrame(zoomState, items, positions, zoomViews, baseItemSize)
        zuiLogger.info({ t: 'zuiFrame', ...frame, scale: zoomState.scale, pan: { ...zoomState.pan } }, {}, { ctx })
        this.onFrame?.(frame)
        return frame
      }
    }
  }
})

// --- zoomingGrid ---

Component('zoomingGrid', {
  type: 'react-comp<react>',
  params: [
    {id: 'canvas', type: 'zui-canvas<zui>', dynamic: true},
  ],
  impl: comp({
    enrichCtx: async (ctx, {}, {canvas}) => {
      const zuiLogger = dsls.test.logger.zuiLoggerProf.$runWithCtx(ctx)
      const zuiCanvas = await canvas(ctx.setVars({zuiLogger}))
      globalThis.__zuiCanvas = zuiCanvas
      return ctx.setVars({ zuiCanvas, zuiLogger })
    },
    hFunc: (ctx, { react: { h, useEffect, useState }, zuiCanvas }) => () => {
      const [viewIdx, setViewIdx] = useState(0)
      useEffect(() => {
        const el = document.getElementById('zui-root')
        const t = document.getElementById('zui-transformer')
        if (!el || !t) return
        const zs = zuiCanvas.zoomState
        const clamp = s => Math.max(0.05, Math.min(s, 50))
        let lastTouch = null, pinch = { dist: 0, scale: 1 }, drag = null

        const applyFrame = frame => {
          t.style.transform = `translate(${zs.pan.x}px,${zs.pan.y}px) scale(${zs.scale})`
          Object.entries(frame.zVarValues).forEach(([k, v]) => t.style.setProperty(`--${k}`, v))
          if (frame.activeViewIdx !== viewIdx) setViewIdx(frame.activeViewIdx)
        }
        const update = () => applyFrame(zuiCanvas.setView({}))
        const handlers = {
          wheel: e => { zs.scale = clamp(zs.scale * (1 - e.deltaY * 0.001)); update() },
          mousedown: e => { drag = { x: e.clientX, y: e.clientY } },
          mousemove: e => { if (!drag) return; zs.pan.x += e.clientX - drag.x; zs.pan.y += e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; update() },
          mouseup: () => { drag = null },
          touchstart: e => {
            if (e.touches.length === 1) lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY }
            else if (e.touches.length === 2) pinch = { dist: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), scale: zs.scale }
          },
          touchmove: e => {
            if (e.touches.length === 1 && lastTouch) {
              zs.pan.x += e.touches[0].clientX - lastTouch.x; zs.pan.y += e.touches[0].clientY - lastTouch.y
              lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; update()
            } else if (e.touches.length === 2) {
              zs.scale = clamp(pinch.scale * Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY) / pinch.dist); update()
            }
          },
          touchend: e => { if (e.touches.length < 2) pinch.dist = 0; if (e.touches.length === 0) lastTouch = null }
        }
        Object.entries(handlers).forEach(([e, fn]) => el.addEventListener(e, fn))
        zuiCanvas.onFrame = applyFrame
        zuiCanvas.setView({ viewport: { w: el.clientWidth, h: el.clientHeight } })
        return () => { Object.entries(handlers).forEach(([e, fn]) => el.removeEventListener(e, fn)); zuiCanvas.onFrame = null }
      }, [])

      const view = zuiCanvas.zoomViews.views[viewIdx]
      const bs = zuiCanvas.baseItemSize
      return h('div:fixed inset-0 overflow-hidden touch-none bg-white', { id: 'zui-root' },
        h('div:absolute', { id: 'zui-transformer' },
          zuiCanvas.items.map(item =>
            h('div:absolute', { key: item.id, style: {
                left: zuiCanvas.positions[item.id].x + 'px', top: zuiCanvas.positions[item.id].y + 'px',
                width: bs + 'px', height: bs + 'px' }
            }, view.hFunc(ctx.setData(item))))))
    }
  })
})

ReactComp('zoomingSvg', {
  impl: comp({
    hFunc: (ctx, { react: { h, useRef, useState } }) =>
      ({width, height, zoomingVars = [], content, minScale = 0.5, maxScale = 8}) => {
      const [zoomState, setZoomState] = useState({ scale: 1, pan: { x: 0, y: 0 }, hotCard: null })
      const drag = useRef()
      const point = e => {
        const p = e.currentTarget.createSVGPoint()
        Object.assign(p, { x: e.clientX, y: e.clientY })
        return p.matrixTransform(e.currentTarget.getScreenCTM().inverse())
      }
      const wheel = e => {
        e.preventDefault()
        const p = point(e)
        const hotCard = e.target.closest?.('[data-zui-card]')?.dataset.zuiCard
        setZoomState(zs => {
          const scale = Math.max(minScale, Math.min(maxScale, zs.scale * Math.exp(-e.deltaY * .001)))
          return { scale, hotCard: scale > 1 ? hotCard || zs.hotCard : null, pan: {
            x: p.x - (p.x - zs.pan.x) * scale / zs.scale,
            y: p.y - (p.y - zs.pan.y) * scale / zs.scale
          }}
        })
      }
      const zoomTo = next => setZoomState(zs => {
        const scale = Math.max(minScale, Math.min(maxScale, next(zs.scale))), p = { x: width / 2, y: height / 2 }
        return { ...zs, scale, pan: {
          x: p.x - (p.x - zs.pan.x) * scale / zs.scale,
          y: p.y - (p.y - zs.pan.y) * scale / zs.scale
        }}
      })
      const reset = () => setZoomState({ scale: 1, pan: { x: 0, y: 0 }, hotCard: null })
      const startPan = e => {
        if (e.target.closest?.('foreignObject')) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        e.currentTarget.style.cursor = 'grabbing'
        drag.current = { point: point(e), zoomState }
      }
      const pan = e => {
        if (!drag.current) return
        const p = point(e), start = drag.current
        setZoomState({ ...start.zoomState, pan: {
          x: start.zoomState.pan.x + p.x - start.point.x,
          y: start.zoomState.pan.y + p.y - start.point.y
        }})
      }
      const endPan = e => {
        if (!drag.current) return
        drag.current = null
        e.currentTarget.style.cursor = 'grab'
      }
      const vars = Object.fromEntries(zoomingVars.map(v => [v.id, v.calc(zoomState.scale)]))
      const cssVars = Object.fromEntries(Object.entries(vars).map(([id, value]) => [`--${id}`, value]))
      const button = (label, title, onClick) => h('button', { title, 'aria-label': title, onClick, style: {
        width: label.length > 1 ? 24 : 16, height: 16, padding: 0, border: 0, borderRadius: 4,
        background: 'transparent', color: '#cbd5e1', font: `600 ${label.length > 1 ? 7 : 10}px/1 system-ui`, cursor: 'pointer'
      }}, label)
      const controls = h('div', { xmlns: 'http://www.w3.org/1999/xhtml', role: 'group', 'aria-label': 'Zoom controls', style: {
        display: 'flex', alignItems: 'center', padding: 1, border: '1px solid #47556988', borderRadius: 6,
        background: '#0f172add', boxShadow: '0 3px 8px #0005', backdropFilter: 'blur(8px)'
      }}, button('−', 'Zoom out', () => zoomTo(scale => scale / 1.35)),
      button(`${Math.round(zoomState.scale * 100)}%`, 'Reset zoom', reset),
      button('+', 'Zoom in', () => zoomTo(scale => scale * 1.35)))
      return h('svg', {
        viewBox: `0 0 ${width} ${height}`, onWheel: wheel, onPointerDown: startPan, onPointerMove: pan,
        onPointerUp: endPan, onPointerCancel: endPan,
        onDoubleClick: reset,
        style: { width: '100%', height: '100%', cursor: 'grab', touchAction: 'none' }
      }, h('g', {
        transform: `translate(${zoomState.pan.x} ${zoomState.pan.y}) scale(${zoomState.scale})`, style: cssVars
      }, content(ctx.setVars({ zoomState, ...vars }))),
      h('foreignObject', { x: width - 64, y: 6, width: 56, height: 20 }, controls))
    }
  })
})

ReactComp('zoomLevelGallery', {
  params: [
    {id: 'scales', asIs: true, defaultValue: [1, 2, 4, 8]},
    {id: 'width', as: 'number', defaultValue: 280},
    {id: 'height', as: 'number', defaultValue: 180},
    {id: 'renderItem', type: 'vdom', dynamic: true}
  ],
  impl: comp({
    hFunc: (ctx, { react: { h } }, {scales, width, height, renderItem}) => () => h('div', { style: {
      display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(${width}px,1fr))`, gap: 16
    }}, ...scales.map(scale => h('figure', {
      'data-zui-zoom-level': scale, style: { margin: 0, padding: 10, border: '1px solid #334155', borderRadius: 10, background: '#071521' }
    }, h('figcaption', { style: { marginBottom: 8, color: '#94a3b8', font: '12px ui-monospace,monospace' } }, `${scale.toFixed(2)}×`),
    h('div', { style: { width, height, overflow: 'hidden', position: 'relative' } },
      renderItem(ctx.setVars({ zoomState: { scale, pan: { x: 0, y: 0 }, hotCard: null } }))))))
  })
})

// --- zoomingCards --- items grow in DOM size, no CSS transform scale, CSS vars for show/hide

Component('zoomingCards', {
  type: 'react-comp<react>',
  params: [
    {id: 'canvas', type: 'zui-canvas<zui>', dynamic: true},
  ],
  impl: comp({
    enrichCtx: async (ctx, {}, {canvas}) => {
      const zuiLogger = dsls.test.logger.zuiLoggerProf.$runWithCtx(ctx)
      const zuiCanvas = await canvas(ctx.setVars({zuiLogger}))
      return ctx.setVars({ zuiCanvas, zuiLogger })
    },
    hFunc: (ctx, { react: { h, useEffect, useState }, zuiCanvas }) => () => {
      const [viewIdx, setViewIdx] = useState(0)
      useEffect(() => {
        const el = document.getElementById('zui-cards-root')
        const container = document.getElementById('zui-cards-container')
        if (!el || !container) return
        const zs = zuiCanvas.zoomState
        const clamp = s => Math.max(0.05, Math.min(s, 50))
        let lastTouch = null, pinch = { dist: 0, scale: 1 }, drag = null

        const applyFrame = frame => {
          Object.entries(frame.zVarValues).forEach(([k, val]) => container.style.setProperty(`--${k}`, val))
          container.style.transform = `translate(${zs.pan.x}px,${zs.pan.y}px)`
          const sz = frame.itemPixelSize + 'px'
          zuiCanvas.items.forEach(item => {
            const el = document.getElementById('zui-card-' + item.id)
            if (!el) return
            const p = zuiCanvas.positions[item.id]
            el.style.left = (p.x * zs.scale) + 'px'
            el.style.top = (p.y * zs.scale) + 'px'
            el.style.width = sz
            el.style.height = sz
          })
          if (frame.activeViewIdx !== viewIdx) setViewIdx(frame.activeViewIdx)
        }
        const update = () => applyFrame(zuiCanvas.setView({}))
        const handlers = {
          wheel: e => { e.preventDefault(); zs.scale = clamp(zs.scale * (1 - e.deltaY * 0.002)); update() },
          mousedown: e => { drag = { x: e.clientX, y: e.clientY } },
          mousemove: e => { if (!drag) return; zs.pan.x += e.clientX - drag.x; zs.pan.y += e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY }; update() },
          mouseup: () => { drag = null },
          touchstart: e => {
            if (e.touches.length === 1) lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY }
            else if (e.touches.length === 2) pinch = { dist: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), scale: zs.scale }
          },
          touchmove: e => {
            if (e.touches.length === 1 && lastTouch) {
              zs.pan.x += e.touches[0].clientX - lastTouch.x; zs.pan.y += e.touches[0].clientY - lastTouch.y
              lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; update()
            } else if (e.touches.length === 2) {
              zs.scale = clamp(pinch.scale * Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY) / pinch.dist); update()
            }
          },
          touchend: e => { if (e.touches.length < 2) pinch.dist = 0; if (e.touches.length === 0) lastTouch = null }
        }
        Object.entries(handlers).forEach(([e, fn]) => el.addEventListener(e, fn, { passive: false }))
        zuiCanvas.setView({ viewport: { w: el.clientWidth, h: el.clientHeight } })
        return () => Object.entries(handlers).forEach(([e, fn]) => el.removeEventListener(e, fn))
      }, [])

      const view = zuiCanvas.zoomViews.views[viewIdx]
      const bs = zuiCanvas.baseItemSize
      return h('div:fixed inset-0 overflow-hidden touch-none bg-white', { id: 'zui-cards-root' },
        h('div:absolute', { id: 'zui-cards-container' },
          zuiCanvas.items.map(item => {
            const p = zuiCanvas.positions[item.id]
            return h('div:absolute overflow-hidden', { key: item.id, id: 'zui-card-' + item.id, style: {
              left: p.x + 'px', top: p.y + 'px', width: bs + 'px', height: bs + 'px'
            }}, view.hFunc(ctx.setData(item)))
          })
        )
      )
    }
  })
})

// --- zoomingWithHotCardAndMargins ---
// Zoom-to-focus: below splitPx all cards equal. Above splitPx, card under cursor (hotCard) grows, others shrink to margins.
// Split only enabled when screen > mainWidth (margins exist). State persisted in URL hash.
// Consumer provides layoutFunc(h, ctx) that arranges cards. Mark diagram-only elements with data-diagram attribute.

Component('zoomingWithHotCardAndMargins', {
  type: 'react-comp<react>',
  params: [
    {id: 'itemIds', as: 'array'},
    {id: 'calcVars', dynamic: true},
    {id: 'layoutFunc', dynamic: true},
    {id: 'splitPx', as: 'number', defaultValue: 300},
    {id: 'mainWidth', as: 'number', defaultValue: 1000},
    {id: 'minPx', as: 'number', defaultValue: 80},
    {id: 'maxPx', as: 'number', defaultValue: 1200},
    {id: 'debugPanel', as: 'boolean', defaultValue: false},
  ],
  impl: comp({
    hFunc: (ctx, { react: { h, useEffect } }, {itemIds, calcVars: calcVarsFn, layoutFunc, splitPx, mainWidth, minPx, maxPx, debugPanel}) => () => {
      useEffect(() => {
        const el = document.getElementById('zui-flow-root')
        if (!el) return
        const clamp = v => Math.max(minPx, Math.min(v, maxPx))
        const hash = Object.fromEntries(new URLSearchParams(location.hash.slice(1)))
        let itemPx = clamp(+(hash.itemPx || minPx)), hotCard = hash.hot && itemIds.includes(hash.hot) ? hash.hot : null
        let mouseX = 0, mouseY = 0
        const canSplit = () => window.innerWidth > mainWidth
        const setVarsOn = (elem, vars) => Object.entries(vars).forEach(([k, val]) => elem.style.setProperty(`--${k}`, val))
        const effectivePx = id => {
          if (!canSplit() || itemPx <= splitPx || !hotCard) return itemPx
          const over = itemPx - splitPx
          return id === hotCard ? itemPx : Math.max(minPx, splitPx - over * 0.5)
        }
        const splitAmt = () => !canSplit() ? 0 : Math.min(1, Math.max(0, (itemPx - splitPx) / splitPx))
        const detectHotCard = () => {
          let best = null, bestDist = Infinity
          itemIds.forEach(id => {
            const c = document.getElementById('zui-field-' + id)
            if (!c) return
            const r = c.getBoundingClientRect(), d = Math.hypot(mouseX - r.left - r.width / 2, mouseY - r.top - r.height / 2)
            if (d < bestDist) { bestDist = d; best = id }
          })
          return best
        }
        let hashTimer = null
        const updateHash = () => {
          clearTimeout(hashTimer)
          hashTimer = setTimeout(() => {
            const p = new URLSearchParams()
            if (itemPx !== minPx) p.set('itemPx', Math.round(itemPx))
            if (hotCard) p.set('hot', hotCard)
            const qs = p.toString()
            history.replaceState(null, '', qs ? '#' + qs : location.pathname + location.search)
          }, 150)
        }
        const applyAll = () => {
          const s = splitAmt()
          el.querySelectorAll('[data-diagram]').forEach(d => d.style.opacity = 1 - s)
          itemIds.forEach(id => {
            const c = document.getElementById('zui-field-' + id), wrapper = c?.parentElement
            if (!c || !wrapper) return
            setVarsOn(c, calcVarsFn.profile(effectivePx(id)))
            const isHot = hotCard && id === hotCard && s > 0, isCold = hotCard && id !== hotCard && s > 0
            const coldW = Math.round(110 - s * 30) + 'px'
            Object.assign(c.style, { opacity: isCold ? 1 - s * 0.5 : '1', boxShadow: isHot ? `0 4px ${Math.round(s * 24)}px rgba(0,0,0,${s * 0.1})` : '' })
            Object.assign(wrapper.style, { flex: isHot ? `1 1 ${Math.round(s * 100)}%` : isCold ? `0 0 ${coldW}` : '1 1 0',
              minWidth: isHot ? Math.round(s * (mainWidth - 40)) + 'px' : '0', maxWidth: isCold ? coldW : '', order: isHot ? '-1' : '' })
          })
          updateHash()
          const dbg = debugPanel && document.getElementById('zui-debug')
          if (dbg) dbg.textContent = `itemPx:${Math.round(itemPx)} | hot:${hotCard||'none'} | split:${s.toFixed(2)} | canSplit:${canSplit()} | screen:${window.innerWidth}`
        }
        const onWheel = e => {
          e.preventDefault(); mouseX = e.clientX; mouseY = e.clientY
          const wasBelow = itemPx <= splitPx
          itemPx = clamp(itemPx * (1 - e.deltaY * 0.002))
          if (canSplit() && itemPx > splitPx) { if (wasBelow || !hotCard) hotCard = detectHotCard() } else if (!canSplit() || itemPx <= splitPx) hotCard = null
          applyAll()
        }
        let drag = null, didDrag = false
        const onClick = e => {
          if (didDrag) { didDrag = false; return }
          const c = e.target.closest('[id^="zui-field-"]')
          if (c && canSplit()) { hotCard = c.id.replace('zui-field-', ''); itemPx = Math.max(itemPx, splitPx + 50); applyAll(); return }
          if (hotCard) { hotCard = null; itemPx = Math.min(itemPx, splitPx); applyAll() }
        }
        const onKey = e => { if (e.key === 'Escape' && hotCard) { hotCard = null; itemPx = Math.min(itemPx, splitPx); applyAll() } }
        const onMouseDown = e => { if (!e.target.closest('[id^="zui-field-"]')) { drag = { y: e.clientY }; didDrag = false; el.style.cursor = 'grabbing' } }
        const onMouseMove = e => { mouseX = e.clientX; mouseY = e.clientY; if (!drag) return; window.scrollBy(0, drag.y - e.clientY); drag.y = e.clientY; didDrag = true }
        const onMouseUp = () => { if (drag) el.style.cursor = ''; drag = null }
        let pinch = { dist: 0, px: minPx }
        const touchDistance = e => Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        )
        const onTouchStart = e => {
          if (e.touches.length === 2) pinch = { dist: touchDistance(e), px: itemPx }
        }
        const onTouchMove = e => {
          if (e.touches.length !== 2) return
          itemPx = clamp(pinch.px * touchDistance(e) / pinch.dist)
          if (canSplit() && itemPx > splitPx && !hotCard) hotCard = detectHotCard()
          if (!canSplit() || itemPx <= splitPx) hotCard = null
          applyAll()
        }
        const onResize = () => { if (!canSplit() && hotCard) { hotCard = null }; applyAll() }
        const handlers = { wheel: onWheel, mousedown: onMouseDown, mousemove: onMouseMove, mouseup: onMouseUp, click: onClick, touchstart: onTouchStart, touchmove: onTouchMove }
        Object.entries(handlers).forEach(([e, fn]) => el.addEventListener(e, fn, e === 'wheel' ? { passive: false } : undefined))
        document.addEventListener('keydown', onKey)
        window.addEventListener('resize', onResize)
        applyAll()
        return () => {
          Object.entries(handlers).forEach(([e, fn]) => el.removeEventListener(e, fn))
          document.removeEventListener('keydown', onKey)
          window.removeEventListener('resize', onResize)
          clearTimeout(hashTimer)
        }
      }, [])
      return h('div', {},
        layoutFunc.profile(h, ctx),
        debugPanel && h('div:fixed bottom-0 left-0 right-0 bg-gray-900 text-gray-300 text-[10px] font-mono px-4 py-1 z-50 flex items-center gap-2', {},
          h('div:flex-1', { id: 'zui-debug' }, 'loading...'),
          h('button:bg-gray-700 text-gray-300 px-2 py-0.5 rounded text-[9px] hover:bg-gray-600', {
            onClick: e => {
              e.stopPropagation()
              const t = document.getElementById('zui-debug')?.textContent
              if (t) navigator.clipboard.writeText(t)
            }
          }, 'Copy')))
    }
  })
})

// --- galaxies layout ---

ItemsLayout('galaxies', {
  params: [
    {id: 'groupBy', as: 'string'},
    {id: 'sortBy', as: 'string', byName: true},
    {id: 'groupGap', as: 'number', defaultValue: 1},
    {id: 'cellSize', as: 'number', defaultValue: 100},
  ],
  impl: (ctx, {}, {groupBy, sortBy, groupGap, cellSize}) => {
    const items = ctx.vars.items || []
    if (sortBy) items.sort((a, b) => (+a[sortBy] || 0) - (+b[sortBy] || 0))
    const groups = {}
    items.forEach(item => (groups[item[groupBy]] ??= []).push(item))
    const sortedKeys = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length)
    const centers = [], bounds = [[0, 0], [0, 0]]

    sortedKeys.forEach((key, idx) => {
      const g = groups[key]
      const cols = Math.ceil(Math.sqrt(g.length)), rows = Math.ceil(g.length / cols)
      const box = Math.max(cols, rows)
      let pos = [0, 0]
      if (idx > 0) {
        let placed = false
        for (const [cx, cy, os] of centers) {
          for (const [px, py] of [[cx + (os + box) / 2 + groupGap, cy], [cx - (os + box) / 2 - groupGap, cy],
            [cx, cy + (os + box) / 2 + groupGap], [cx, cy - (os + box) / 2 - groupGap]]) {
            if (!centers.some(([ox, oy, s]) => Math.hypot(px - ox, py - oy) < (box + s) / 2 + groupGap)) {
              pos = [px, py]; placed = true; break
            }
          }
          if (placed) break
        }
        if (!placed) pos = [bounds[0][1] + box / 2 + groupGap, bounds[1][1] + box / 2 + groupGap]
      }
      ;[0, 1].forEach(a => { bounds[a][0] = Math.min(bounds[a][0], pos[a] - box / 2); bounds[a][1] = Math.max(bounds[a][1], pos[a] + box / 2) })
      centers.push([...pos, box])
      let x = pos[0] - Math.floor(cols / 2), y = pos[1] - Math.floor(rows / 2), step = 1, dir = 0, rem = 1
      g.forEach(item => {
        item._zuiPos = [x, y]
        ;[() => x++, () => y++, () => x--, () => y--][dir]()
        if (--rem === 0) { dir = (dir + 1) % 4; if (dir % 2 === 0) step++; rem = step }
      })
    })
    return Object.fromEntries(items.map(item => [item.id, {
      x: (item._zuiPos[0] - bounds[0][0]) * cellSize, y: (item._zuiPos[1] - bounds[1][0]) * cellSize
    }]))
  }
})
