import { dsls } from '@jb6/core'
import '@jb6/react'
import '@jb6/react/progress-indicators.js'
import '@wonder/db/room-lambda-client.js'
import '@wonder/db/db-drivers.js'
import '@wonder/db/etl/file-query.js'
import '@wonder/bi/bi-common.js'
import './room-test-lambdas.js'

const {
  tgp: { 'ctx-enricher': { setData } },
  common: { Data, data: { invokeSnippetInContext, salesByCategory, cubeQuery, fileQuery } },
  lambda: { 'lambda-packaging': { roomLambda } },
  react: { ReactComp, 'react-comp': { comp }, 'progress-indicator': { stepper, dots } },
  bi: { cube: { cube }, 'silver-builder': { parquetSource }, metric: { metric } },
  etl: { 'cli-extract': { cachedWonderUrl }, 'cli-transform': { duckdb } }
} = dsls

ReactComp('summaryApplet', {
  impl: comp({
    enrichCtx: setData(invokeSnippetInContext(salesByCategory(), { pack: roomLambda({ streamProgress: true }) })),
    progressIndicator: stepper({ title: 'Summarizing', steps: 'load,process', labels: 'Loading file,Aggregating' }),
    hFunc: (ctx, { react: { h } }) => () => h('div:p-4 font-sans', {},
      h('h1:text-lg font-bold', {}, 'Room Summary'),
      h('p', {}, `${Array.isArray(ctx.data) ? ctx.data.length : 0} categories`))
  })
})
const browserStoreCount = Data('browserStoreCount', {
  impl: cubeQuery('select storeCount', cube(parquetSource('room://testPublicRoom/usersRO/stores.parquet', 'stores'), {
    metrics: [
      metric('storeCount', 'count(*)')
    ]
  }))
})

ReactComp('storeCountApplet', {
  impl: comp({
    enrichCtx: setData(browserStoreCount()),
    hFunc: (ctx, { react: { h } }) => () => h('div', {}, JSON.stringify(ctx.data))
  })
})
const dailySales = Data('dailySales', {
  params: [
    {id: 'date', as: 'string'}
  ],
  impl: fileQuery(cachedWonderUrl('room://aTeam/usersRO/sales-large.json'), {
    query: duckdb({
      sql: `SELECT category, sum(amount) AS total FROM read_json_auto({%$inputFile%})
      WHERE day = '{%$date%}' GROUP BY category ORDER BY total DESC`,
      format: 'JSON, ARRAY'
    })
  })
})
const dailySalesReport = ReactComp('dailySalesReport', {
  params: [
    {id: 'date', as: 'string'}
  ],
  impl: comp({
    hFunc: (ctx, { react: { h } }) => () => h('pre', {}, JSON.stringify(ctx.data)),
    enrichCtx: setData(invokeSnippetInContext(dailySales('%$date%'), { pack: roomLambda(true) })),
    progressIndicator: dots('loading %$date% data')
  })
})
ReactComp('salesPage', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh } }) => () => h('div', {}, hh(ctx, dailySalesReport('2026-06-01')))
  })
})
