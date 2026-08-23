import { dsls, ns } from '@jb6/core'
import './zui-testers.js'

const {
  tgp: { Component },
  common: { Data, Boolean: { contains },
    data: { asIs }
  },
  test: { Test,
    test: { dataTest, reactTest },
    'ui-action': { drillDown, panTo, zoomOut, zuiSetView }
  },
  react: { 'react-comp': { zoomingGrid, zoomLevelGallery } },
  zui: { ZoomViews, ZuiCanvas,
    'item-view': { itemView },
    'items-layout': { galaxies },
    'zoom-views': { zoomViews },
    'zooming-var': { zVar },
    'zui-canvas': { zuiCanvas }
  }
} = dsls

Data('zuiTest.sampleItems', {
  impl: asIs([
    {id: 'a', category: 'fruit', name: 'Apple', value: 10},
    {id: 'b', category: 'fruit', name: 'Banana', value: 20},
    {id: 'c', category: 'fruit', name: 'Cherry', value: 5},
    {id: 'd', category: 'veggie', name: 'Daikon', value: 15},
    {id: 'e', category: 'veggie', name: 'Eggplant', value: 25},
    {id: 'f', category: 'grain', name: 'Farro', value: 8},
  ])
})
const { zuiTest } = ns

Component('zuiTest.sampleZoomViews', {
  type: 'zoom-views<zui>',
  impl: zoomViews(
    itemView({ minItemSize: 0, hFunc: (ctx, {react: {h}}) => h('div:w-4 h-4 rounded-full bg-blue-400') }),
    itemView({ minItemSize: 60, zoomingVars: [zVar('labelOpacity', px => Math.min(1, (px - 60) / 40))],
      hFunc: (ctx, {react: {h}}) => h('div:p-1', {}, h('div:text-xs font-bold', {}, ctx.data.name)) }),
    itemView({ minItemSize: 200, zoomingVars: [zVar('detailOpacity', px => Math.min(1, (px - 200) / 100))],
      hFunc: (ctx, {react: {h}}) => h('div:p-2', {}, h('div:font-bold', {}, ctx.data.name), h('div:text-xs', {}, `Value: ${ctx.data.value}`)) }),
  )
})

Component('zuiTest.sampleCanvas', {
  type: 'zui-canvas<zui>',
  impl: zuiCanvas({
    items: zuiTest.sampleItems(),
    itemsLayout: galaxies({groupBy: 'category'}),
    zoomViews: zuiTest.sampleZoomViews(),
    baseItemSize: 80
  })
})

// --- pure data tests (no DOM) ---

Test('zuiTest.galaxiesLayout', {
  impl: dataTest({
    calculate: ctx => {
      const items = dsls.common.data['zuiTest.sampleItems'].$runWithCtx(ctx)
      const zuiLogger = dsls.test.logger.zuiLoggerProf.$runWithCtx(ctx)
      return dsls.zui['items-layout'].galaxies.$runWithCtx(ctx.setVars({items, zuiLogger}), {groupBy: 'category'})
    },
    expectedResult: ctx => {
      const pos = ctx.data
      return Object.keys(pos).length === 6 && ['a','b','c','d','e','f'].every(id => pos[id] && typeof pos[id].x === 'number')
    },
    timeout: 2000
  })
})

Test('zuiTest.canvasSetView', {
  impl: dataTest({
    calculate: async ctx => {
      const zuiLogger = dsls.test.logger.zuiLoggerProf.$runWithCtx(ctx)
      const canvas = await dsls.zui['zui-canvas']['zuiTest.sampleCanvas'].$runWithCtx(ctx.setVars({zuiLogger}))
      canvas.setView({ scale: 1 })
      canvas.setView({ scale: 3 })
      canvas.setView({ scale: 0.5 })
      return zuiLogger.logsAndErrors()
    },
    expectedResult: ctx => {
      const logs = ctx.data.zuiLog
      return logs.length === 3
        && logs[0].activeViewIdx === 1
        && logs[1].activeViewIdx === 2
        && logs[2].activeViewIdx === 0
    },
    timeout: 2000
  })
})

// --- react test with zui path ---

Test('zuiTest.drillDownPath', {
  impl: reactTest({
    hFunc: zoomingGrid({ canvas: zuiTest.sampleCanvas() }),
    userActions: [
      zuiSetView({ scale: 0.3 }),
      drillDown({ item: 'a', untilView: 2, steps: 3 }),
    ],
    expectedResult: contains('Value:')
  })
})

Test('zuiTest.panAcross', {
  impl: reactTest({
    hFunc: zoomingGrid({ canvas: zuiTest.sampleCanvas() }),
    userActions: [
      drillDown({ item: 'a', untilView: 1, steps: 2 }),
      panTo({ item: 'd' }),
    ],
    expectedResult: contains('Daikon')
  })
})

Test('zuiTest.zoomCycle', {
  impl: reactTest({
    hFunc: zoomingGrid({ canvas: zuiTest.sampleCanvas() }),
    userActions: [
      zuiSetView({ scale: 0.3 }),
      drillDown({ item: 'b', untilView: 2, steps: 2 }),
      zoomOut({ steps: 2 }),
    ],
    expectedResult: contains('zui-root')
  })
})

Test('zuiTest.zoomLevelGallery', {
  impl: reactTest({
    testedComp: zoomLevelGallery({
      scales: [1, 2, 4, 8],
      renderItem: (ctx, {react: {h}}) => h('div', {}, `zoom ${ctx.vars.zoomState.scale}`)
    }),
    expectedResult: contains('zoom 8')
  })
})
