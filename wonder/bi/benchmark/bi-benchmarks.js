import { dsls } from '@jb6/core'
import '../metrics.js'
import './bi-benchmark-dsl.js'

const {
  common: { boolean: { and } },
  bi: {
    Cube, QueryCase, cube: { cube }, 'query-case': { queryCase },
    'silver-builder': { parquetSource }, metric: { metric }
  }
} = dsls

const taxiCube = Cube('taxiCube', {
  impl: cube(parquetSource('room://testPublicRoom/usersRO/taxi-row-groups.parquet', 'taxi'), {
    cacheStrategy: 'colsCache', metrics: [metric('trips', 'count'), metric('total_fare', 'round(sum(fare_amount))::BIGINT')]
  })
})

QueryCase('biBench.taxi', {
  impl: queryCase({
    sql: 'select trips, total_fare',
    cube: taxiCube(),
    expectedResult: and('%0/trips% > 0', '%0/total_fare% > 0')
  })
})

QueryCase('biBench.taxi.filtered', {
  impl: queryCase({
    sql: "select trips, total_fare where tpep_pickup_datetime >= '2023-01-29'",
    cube: taxiCube(),
    expectedResult: and('%0/trips% > 0', '%0/total_fare% > 0')
  })
})
