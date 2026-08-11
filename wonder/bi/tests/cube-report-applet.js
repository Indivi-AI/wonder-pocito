// Cube report — browser applet. setData(invokeSnippetInContext(cubeReport(), ...)) invokes the node cube lambda
// (room://demoRoom), streams its progress (the cube's query phases) to the stepper, then renders the {rows} table. No node-only code.
import { dsls } from '@jb6/core'
import '@jb6/react'
import '@jb6/react/progress-indicators.js'
import '@wonder/db/room/room-lambda-client.js'   // invokeSnippetInContext + roomLambda interceptor

const {
  tgp: { Component, 'ctx-enricher': { setData } },
  common: { Data, data: { invokeSnippetInContext } },
  lambda: { 'lambda-packaging': { roomLambda } },
  react: { ReactComp, 'react-comp': { comp }, 'progress-indicator': { stepper } }
} = dsls

// browser-side REFERENCE to the node cube lambda — impl-less on purpose: invokeSnippetInContext only reads the
// profile (name + day arg) to build the /run-room-lambda call. The real cube/duckdb impl lives in
// cube-report-lambda.js (a node-only closure that must NOT be bundled into the browser) and runs server-side.
const cubeReport = Data('cubeReport', { params: [{ id: 'day', as: 'string' }] })

const fmt = n => Number(n || 0).toLocaleString('en-US')

ReactComp('cubeApplet', {
  impl: comp({
    enrichCtx: setData(invokeSnippetInContext(cubeReport('2000-01-01'), { pack: roomLambda({ streamProgress: true }) })),   // day → lambda %$day% → silver sessions-2000-01-01.parquet. streamProgress ⇒ live stepper
    // smart progress: the cube lambda emits load→reduce→parquet→query as it runs; the stepper renders them live.
    progressIndicator: stepper({ title: 'Running cube query', steps: 'list,download,reduce,parquet,query', labels: 'Listing,Downloading,Reducing,Writing parquet,Querying' }),
    hFunc: (ctx, { react: { h } }) => () => {
      const rows = Array.isArray(ctx.data) ? ctx.data : [], error = ctx.data?.error
      return h('div:max-w-3xl mx-auto p-6 bg-gray-50 min-h-screen font-sans', {},
        h('h1:text-xl font-bold text-gray-900 mb-1', {}, 'Conversion by Variant'),
        h('p:text-xs text-gray-400 mb-4', {}, `${rows.length} variants • cube gold query`),
        error ? h('div:bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg p-3', {}, error)
        : !rows.length ? h('p:text-gray-500 text-sm', {}, 'No data.')
        : h('div:bg-white rounded-lg shadow-sm border p-4', {},
            h('table:w-full text-sm', {},
              h('thead', {}, h('tr:text-left text-gray-400 border-b', {},
                h('th:py-1', {}, 'Variant'), h('th:text-right', {}, 'Sessions'),
                h('th:text-right', {}, 'Bids'), h('th:text-right', {}, 'Revenue'), h('th:text-right', {}, 'CTR'))),
              h('tbody', {}, ...rows.map(r => h('tr:border-b border-gray-50', {},
                h('td:py-1.5 font-medium text-gray-700', {}, r.variant),
                h('td:text-right text-gray-500', {}, fmt(r.sessions)),
                h('td:text-right text-gray-500', {}, fmt(r.bids)),
                h('td:text-right text-gray-500', {}, '$' + (+r.revenue || 0).toFixed(2)),
                h('td:text-right text-gray-500', {}, (+r.ctr || 0) + '%'))))))
      )
    }
  })
})
