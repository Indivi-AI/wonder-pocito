import { dsls } from '@jb6/core'
import '@wonder/db/room-lambda-def.js'
import '@wonder/db/etl/file-query.js'

const {
  common: { Lambda, data: { fileQuery } },
  etl: { 'cli-extract': { cachedWonderUrl }, 'cli-transform': { duckdb } }
} = dsls

Lambda('salesByCategory', {
  permissionByPath: 'usersRO',
  params: [{ id: 'category', as: 'string', defaultValue: 'electronics',
    description: 'one category to summarize; empty = all categories' }],
  impl: fileQuery(cachedWonderUrl('{%$roomWUrl%}/usersRO/sales-large.json'), {
    query: duckdb({
      sql: `SELECT category, count(*) AS count, sum(amount) AS total FROM read_json_auto('{%$inputFile%}')
        WHERE '{%$category%}' = '' OR category = '{%$category%}' GROUP BY category ORDER BY total DESC`,
      format: 'JSON, ARRAY'
    })
  })
})
