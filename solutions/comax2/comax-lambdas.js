// comax-lambdas.js — comax cube queries published as room lambdas over signedRoom://comax2.
// The lambda's setupComax enricher plants comaxArgs, prefetches signed URLs and folds the star sqlModifiers,
// then the cubeQuery runs `select … from base` against the header-first star. period rides as a param resolved server-side.
import { dsls } from '@jb6/core'
import './comax-cube.js'
import '@wonder/db/room/room-lambda-client.js'

const {
  common: { Lambda, data: { cubeQuery, asIs } },
  bi: { cube: { comaxSalesCube } },
  tgp: { 'ctx-enricher': { setupComax } }
} = dsls

Lambda('comaxPing', { permissionByPath: 'usersRO', impl: asIs({ pong: true }) })

Lambda('comaxNetSales30d', {
  permissionByPath: 'usersRO',
  params: [{ id: 'period', as: 'string', defaultValue: '30' }],
  impl: cubeQuery(setupComax(comaxSalesCube(), { period: '%$period%', prior: false }),
    'select round(sum(net_sales_amount),2) sales from base')
})

Lambda('comaxRowCount', {
  permissionByPath: 'usersRO',
  params: [{ id: 'period', as: 'string', defaultValue: '30' }],
  impl: cubeQuery(setupComax(comaxSalesCube(), { period: '%$period%', prior: false }),
    'select count(*) cnt from base')
})

// Raw latest-month query over the MQY sales-lines relation.
Lambda('comaxLatestMonthRaw', {
  permissionByPath: 'usersRO',
  impl: cubeQuery(setupComax(comaxSalesCube(), { prior: false }),
    "select count(*) lines from {%$salesLines%} where sale_date between date '2026-06-01' and date '2026-06-28'")
})
