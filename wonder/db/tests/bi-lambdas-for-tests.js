import { dsls } from '@jb6/core'
import '@wonder/db/room-lambda-def.js'
import '@wonder/bi/bi-common.js'

const {
  common: { Lambda, data: { asIs, cubeQuery } },
  bi: { cube: { cube }, 'silver-builder': { parquetSource }, metric: { metric } }
} = dsls

Lambda('storeCount', { permissionByPath: 'usersRO', impl: cubeQuery({ sql: 'select storeCount', cube: cube({
  source: parquetSource('signedRoom://testSignedRoom/usersRO/stores.parquet', { name: 'stores' }),
  metrics: [metric('storeCount', 'count(*)')]
}) }) })

Lambda('storeCountPublic', { permissionByPath: 'usersRO', impl: cubeQuery({ sql: 'select storeCount', cube: cube({
  source: parquetSource('room://testPublicRoom/usersRO/stores.parquet', { name: 'stores' }),
  metrics: [metric('storeCount', 'count(*)')]
}) }) })

Lambda('ping', { permissionByPath: 'usersRO', impl: asIs({ pong: true, lambdaMarker: 'room-tests-codex-2026-08-11' }) })
