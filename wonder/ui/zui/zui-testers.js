import { dsls } from '@jb6/core'
import '@jb6/react/tests/react-testers.js'
import './zui-dsl.js'

const {
  tgp: { Component },
  test: { UiAction }
} = dsls

// --- ui-actions for zui testing ---

UiAction('zuiSetView', {
  description: 'set zoom state on zuiCanvas directly',
  params: [
    {id: 'scale', as: 'number'},
    {id: 'pan', as: 'object'},
    {id: 'viewport', as: 'object'},
  ],
  impl: (ctx, {}, {scale, pan, viewport}) => ({
    async exec(ctx) {
      const canvas = ctx.vars.zuiCanvas || globalThis.__zuiCanvas
      if (!canvas) return
      const patch = {}
      if (scale != null) patch.scale = scale
      if (pan) patch.pan = pan
      if (viewport) patch.viewport = viewport
      canvas.setView(patch)
      await ctx.vars.win?.waitForMutations?.(50)
    }
  })
})

UiAction('drillDown', {
  description: 'zoom toward an item/group until a target itemView activates',
  params: [
    {id: 'item', as: 'string'},
    {id: 'untilView', as: 'number', defaultValue: 1},
    {id: 'steps', as: 'number', defaultValue: 3},
  ],
  impl: (ctx, {}, {item, untilView, steps}) => ({
    async exec(ctx) {
      const canvas = ctx.vars.zuiCanvas || globalThis.__zuiCanvas
      if (!canvas) return
      const targetView = canvas.zoomViews.views[untilView]
      if (!targetView) return
      const targetScale = (targetView.minItemSize + 1) / canvas.baseItemSize
      const startScale = canvas.zoomState.scale
      const pos = canvas.positions[item]
      const vp = canvas.zoomState.viewport
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const scale = startScale + (targetScale - startScale) * t
        const pan = pos ? { x: vp.w / 2 - pos.x * scale, y: vp.h / 2 - pos.y * scale } : canvas.zoomState.pan
        canvas.setView({ scale, pan })
        await ctx.vars.win?.waitForMutations?.(50)
      }
    }
  })
})

UiAction('panTo', {
  description: 'pan to center an item in viewport, keeping current scale',
  params: [
    {id: 'item', as: 'string'},
  ],
  impl: (ctx, {}, {item}) => ({
    async exec(ctx) {
      const canvas = ctx.vars.zuiCanvas || globalThis.__zuiCanvas
      if (!canvas) return
      const pos = canvas.positions[item]
      if (!pos) return
      const { scale } = canvas.zoomState
      const vp = canvas.zoomState.viewport
      canvas.setView({ pan: { x: vp.w / 2 - pos.x * scale, y: vp.h / 2 - pos.y * scale } })
      await ctx.vars.win?.waitForMutations?.(50)
    }
  })
})

UiAction('zoomOut', {
  description: 'zoom out to see all items',
  params: [
    {id: 'steps', as: 'number', defaultValue: 2},
  ],
  impl: (ctx, {}, {steps}) => ({
    async exec(ctx) {
      const canvas = ctx.vars.zuiCanvas || globalThis.__zuiCanvas
      if (!canvas) return
      const xs = Object.values(canvas.positions).map(p => p.x)
      const ys = Object.values(canvas.positions).map(p => p.y)
      const maxSpan = Math.max((Math.max(...xs) - Math.min(...xs)) + canvas.baseItemSize, (Math.max(...ys) - Math.min(...ys)) + canvas.baseItemSize)
      const vp = canvas.zoomState.viewport
      const targetScale = Math.min(vp.w, vp.h) / maxSpan * 0.9
      const startScale = canvas.zoomState.scale
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        canvas.setView({ scale: startScale + (targetScale - startScale) * t, pan: { x: 0, y: 0 } })
        await ctx.vars.win?.waitForMutations?.(50)
      }
    }
  })
})
