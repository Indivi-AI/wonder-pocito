import { dsls, coreUtils, jb } from '@jb6/core'
import '@jb6/testing'
import '@wonder/db/db-drivers-s3-minio.js'

const { wonderUtils: { getDBDriver, wfetch2 } } = jb
const { common: { data: { asIs }, boolean: { equals } }, test: { Test, test: { dataTest } } } = dsls

Test('dbDriverTests.minio.driverSelection', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async ctx => ({ result: (await getDBDriver('room:minio//testRoom/item.json', ctx))?.id,
      ...coreUtils.harvestLogs(ctx) }),
    expectedResult: equals('%result%', 'bucket.minio'),
    logger: 'dbLogger'
  })
})

Test('dbDriverTests.minio.putGet', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async (ctx, { testSessionId }) => {
      const url = `room:minio//testRoom/tests/${testSessionId}/put-get.json`, content = { value: 42 }
      await wfetch2(url, { method: 'PUT', body: content }, ctx)
      return { result: await (await wfetch2(url, { method: 'GET' }, ctx)).json(), ...coreUtils.harvestLogs(ctx) }
    },
    expectedResult: equals('%result%', asIs({ value: 42 })),
    logger: 'dbLogger'
  })
})


Test('dbDriverTests.minio.head', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async (ctx, { testSessionId }) => {
      const url = `room:minio//testRoom/tests/${testSessionId}/head.json`
      await wfetch2(url, { method: 'PUT', body: { value: 42 } }, ctx)
      const res = await wfetch2(url, { method: 'HEAD' }, ctx)
      return { result: { status: res.status, size: Number(res.headers.get('content-length')) > 0 }, ...coreUtils.harvestLogs(ctx) }
    },
    expectedResult: equals('%result%', asIs({ status: 200, size: true })),
    logger: 'dbLogger'
  })
})

Test('dbDriverTests.minio.list', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async (ctx, { testSessionId }) => {
      const dir = `room:minio//testRoom/tests/${testSessionId}/list/`
      await Promise.all(['a', 'b'].map(name => wfetch2(`${dir}${name}.json`, { method: 'PUT', body: { name } }, ctx)))
      const items = await (await wfetch2(dir, { method: 'GET' }, ctx)).json()
      return { result: items.map(item => item.name.split('/').at(-1)).sort(), ...coreUtils.harvestLogs(ctx) }
    },
    expectedResult: equals('%result%', ['a.json','b.json']),
    logger: 'dbLogger'
  })
})
