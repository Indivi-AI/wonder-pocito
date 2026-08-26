import { dsls } from '@jb6/core'
import '@jb6/testing'
import '@jb6/common'
import './etl-dsl.js'
import './file-query.js'

import { ns } from '@jb6/core'
const { json } = ns
const {
  tgp: {
    Component, 'ctx-enricher': { setData }
  },
  common: { Data,
    boolean: { contains, and },
    data: { addProp, asIs, etls, join, pipeline, inMemEtl, cliEtl, fileQuery }
  },
  etl: {
    extract: { extract, extractByUrl },
    load: { loadIntoUrl },
    'cli-extract': { localFile, cachedWonderUrl },
    'cli-transform': { mlr, duckdb, polars },
    'cli-load': { copyToFile, toWonderUrl }
  },
  test: { Test,
    test: { dataTest }
  }
} = dsls

// --- inMemEtl tests ---

const largeArray = Data('largeArray' , {
  impl: asIs(Array.from({length: 15}, (_, i) => ({id: i, name: `item-${i}`})))
})

Test('etlDsl.make.runsFirstTimeSkipsSecond', {
  impl: dataTest({
    calculate: etls(
      inMemEtl({
        extract: extract({ extractFromDB: setData(largeArray()) }),
        load: loadIntoUrl('analytics:gcs//etl-test/src-%$testSessionId%')
      }),
      inMemEtl({
        extract: extractByUrl('analytics:gcs//etl-test/src-%$testSessionId%'),
        transform: setData(pipeline('%%', addProp('processed', { val: true }))),
        load: loadIntoUrl('analytics:gcs//etl-test/dst-%$testSessionId%')
      }),
      inMemEtl({
        extract: extractByUrl('analytics:gcs//etl-test/src-%$testSessionId%'),
        load: loadIntoUrl('analytics:gcs//etl-test/dst-%$testSessionId%')
      })
    ),
    expectedResult: contains('etl is already done', { allText: join('\n', { items: '%etlLogger/etlLog/t%' }) }),
    timeout: 12000,
    logger: 'dbLogger,etlLogger'
  })
})

// --- cliEtl tests ---

// demoProfile for the etl<etl> type: file-based ETL over public-room wUrls. extract a sessions CSV from the room
// (cachedWonderUrl fetches + caches it locally), aggregate revenue per campaign with duckdb SQL ({%$inputFile%}
// is the cached file), load the summary CSV back to the room via toWonderUrl
Data('cliEtlDemo', {
  moreTypes: 'etl<etl>',
  impl: cliEtl({
    extract: cachedWonderUrl('room://analytics/sessions.csv'),
    transform: duckdb("SELECT campaign_name, sum(revenue) AS revenue, count(*) AS sessions FROM read_csv('{%$inputFile%}') GROUP BY campaign_name ORDER BY revenue DESC"),
    load: toWonderUrl('room://analytics/revenue_by_campaign.csv')
  })
})

Data('inMemEtlDemo', {
  impl: inMemEtl({
    extract: extractByUrl('room://analytics/sessions.json'),
    transform: setData(pipeline('%%', addProp('processed', { val: true }))),
    load: loadIntoUrl('room://analytics/sessions-enriched.json')
  })
})

const testCsvPath = '/tmp/etl-test-cli-input.csv'
const testOutputPath = '/tmp/etl-test-cli-output.csv'

Data('testCsvData', {
  impl: asIs(`campaign_name,revenue,estimated_revenue\ncamp_a,10,8\ncamp_a,20,15\ncamp_b,5,3\ncamp_a,30,25\ncamp_b,15,10`)
})

const { testCsvData } = dsls.common.data

const runCategoryQueries = Data('runCategoryQueries', {
  params: [{id: 'first', dynamic: true}, {id: 'second', dynamic: true}],
  impl: async (ctx, {}, {first, second}) => [...await first(ctx.setVars({category: 'sports'})), ...await second(ctx.setVars({category: 'electronics'}))]
})

const writeCsvSetup = Component('writeCsvSetup', {
  type: 'ctx-enricher<tgp>',
  impl: async ctx => {
    const { writeFileSync, rmSync } = await import('fs')
    writeFileSync(testCsvPath, testCsvData.$run())
    rmSync(testOutputPath, { force: true })   // stale output within the same mtime second reads as "etl already done"
    return ctx
  }
})

Test('cliEtl.mlr.groupBy', {
  impl: dataTest({
    setup: writeCsvSetup(),
    calculate: cliEtl({
      extract: localFile(testCsvPath),
      transform: mlr('--csv stats1 -a sum,count -f revenue,estimated_revenue -g campaign_name'),
      load: copyToFile(testOutputPath)
    }),
    expectedResult: and(
      contains('cliEtl start', { allText: join('\n', { items: '%etlLogger/etlLog/t%' }) }),
      contains('cliEtl complete', { allText: join('\n', { items: '%etlLogger/etlLog/t%' }) })
    ),
    timeout: 12000,
    logger: 'dbLogger,etlLogger'
  })
})

Test('cliEtl.duckdb.groupBy', {
  impl: dataTest({
    setup: writeCsvSetup(),
    calculate: cliEtl({
      extract: localFile(testCsvPath),
      transform: duckdb(`SELECT campaign_name, count(*) as sessions, sum(revenue) as revenue,
          sum(estimated_revenue) as estimated_revenue FROM read_csv('{%$inputFile%}') GROUP BY campaign_name ORDER BY revenue DESC`),
      load: copyToFile(testOutputPath)
    }),
    expectedResult: and(
      contains('cliEtl start', { allText: join('\n', { items: '%etlLogger/etlLog/t%' }) }),
      contains('cliEtl complete', { allText: join('\n', { items: '%etlLogger/etlLog/t%' }) })
    ),
    timeout: 12000,
    logger: 'dbLogger,etlLogger'
  })
})

Test('cliEtl.polars.groupBy', {
  impl: dataTest({
    setup: writeCsvSetup(),
    calculate: cliEtl({
      extract: localFile(testCsvPath),
      transform: polars('group_by("campaign_name").agg(col("revenue").sum(), col("estimated_revenue").sum(), len().alias("sessions")).sort("revenue", descending=True)'),
      load: copyToFile(testOutputPath)
    }),
    expectedResult: and(
      contains('cliEtl start', { allText: join('\n', { items: '%etlLogger/etlLog/t%' }) }),
      contains('cliEtl complete', { allText: join('\n', { items: '%etlLogger/etlLog/t%' }) })
    ),
    timeout: 12000,
    logger: 'dbLogger,etlLogger'
  })
})

const testClientsPath = '/tmp/etl-test-clients.csv'

const writeJoinSetup = Component('writeJoinSetup', {
  type: 'ctx-enricher<tgp>',
  impl: async ctx => {
    const { writeFileSync, rmSync } = await import('fs')
    writeFileSync(testCsvPath, testCsvData.$run())
    writeFileSync(testClientsPath, `campaign_name,client_tier\ncamp_a,gold\ncamp_b,silver`)
    rmSync(testOutputPath, { force: true })
    return ctx
  }
})

Test('cliEtl.duckdb.join', {
  impl: dataTest({
    setup: writeJoinSetup(),
    calculate: cliEtl({
      extract: localFile(testCsvPath),
      moreFiles: [localFile(testClientsPath)],
      transform: duckdb(`SELECT s.*, c.client_tier FROM read_csv('{%$inputFile%}') s JOIN read_csv('${testClientsPath}') c ON s.campaign_name = c.campaign_name`),
      load: copyToFile(testOutputPath)
    }),
    expectedResult: and(
      contains('more file ready', { allText: join('\n', { items: '%etlLogger/etlLog/t%' }) }),
      contains('cliEtl complete', { allText: join('\n', { items: '%etlLogger/etlLog/t%' }) })
    ),
    timeout: 12000,
    logger: 'dbLogger,etlLogger'
  })
})

Test('cliEtl.mlr.cacheSkipsSecondRun', {
  impl: dataTest({
    setup: writeCsvSetup(),
    calculate: etls(
      cliEtl({
        extract: localFile(testCsvPath),
        transform: mlr('--csv stats1 -a sum,count -f revenue -g campaign_name'),
        load: copyToFile(testOutputPath)
      }),
      cliEtl({
        extract: localFile(testCsvPath),
        transform: mlr('--csv stats1 -a sum,count -f revenue -g campaign_name'),
        load: copyToFile(testOutputPath)
      })
    ),
    expectedResult: contains('etl is already done', { allText: join('\n', { items: '%etlLogger/etlLog/t%' }) }),
    timeout: 12000,
    logger: 'dbLogger,etlLogger'
  })
})

// writes raw CSV to room FS (bypassing wfetch2 {content:} wrapping) then reads via cachedWonderUrl
// this simulates a raw CSV file uploaded externally (gsutil, Delta Sharing, etc.)
// should fail until rawDataFile interceptor is implemented
const writeRawCsvSetup = Component('writeRawCsvSetup', {
  type: 'ctx-enricher<tgp>',
  impl: async (ctx) => {
    const { writeFileSync, mkdirSync } = await import('fs')
    const { dirname } = await import('path')
    const { fileURLToPath } = await import('url')
    const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
    const filePath = `${repoRoot}files/rooms/etlTestRoom/raw-data-${ctx.vars.testSessionId}.csv`
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, testCsvData.$run())
    return ctx
  }
})

Test('cliEtl.cachedWonderUrl.rawCsvInRoom', {
  description: 'raw CSV file in room (not wrapped in {content:}) - requires rawDataFile support',
  impl: dataTest({
    setup: writeRawCsvSetup(),
    calculate: cliEtl({
      extract: cachedWonderUrl('room:fs//etlTestRoom/raw-data-%$testSessionId%.csv'),
      transform: mlr('--csv stats1 -a sum,count -f revenue,estimated_revenue -g campaign_name'),
      load: copyToFile('/tmp/etl-test-raw-csv-output.csv')
    }),
    expectedResult: and(
      contains('wcache hit', { allText: join('\n', { items: '%dbLogger/dbLog/t%' }) }),
      contains('cliEtl complete', { allText: join('\n', { items: '%etlLogger/etlLog/t%' }) })
    ),
    timeout: 12000,
    logger: 'dbLogger,etlLogger'
  })
})

const rmFiles = Component('rmFiles', {
  type: 'ctx-enricher<tgp>',
  params: [{id: 'files', as: 'string[]', mandatory: true}],
  impl: async (ctx, {}, {files}) => {
    const { rmSync } = await import('fs')
    files.forEach(f => rmSync(f, { force: true }))
    return ctx
  }
})

Test('cliEtl.cachedWonderUrl.json', {
  impl: dataTest({
    setup: rmFiles(['/tmp/etl-test-wonder-output.csv', '/tmp/wcache/indiviai-wonder/testPublicRoom/usersRO/sales-large.json']),
    calculate: cliEtl({
      extract: cachedWonderUrl('room://testPublicRoom/usersRO/sales-large.json'),
      transform: duckdb("SELECT category, count(*) as sales, sum(amount) as total FROM read_json_auto('{%$inputFile%}') GROUP BY category ORDER BY total DESC"),
      load: copyToFile('/tmp/etl-test-wonder-output.csv')
    }),
    expectedResult: and(
      contains('wcache populated', { allText: join('\n', { items: '%dbLogger/dbLog/t%' }) }),
      contains('cliEtl complete', { allText: join('\n', { items: '%etlLogger/etlLog/t%' }) })
    ),
    timeout: 12000,
    logger: 'dbLogger,etlLogger'
  })
})

// --- fileQuery tests ---

Test('fileQuery.duckdb', {
  impl: dataTest({
    setup: writeCsvSetup(),
    calculate: fileQuery({
      from: localFile(testCsvPath),
      query: duckdb(`SELECT campaign_name, count(*) as sessions, sum(revenue) as revenue
          FROM read_csv('{%$inputFile%}') GROUP BY campaign_name ORDER BY revenue DESC`, { format: 'JSON, ARRAY' })
    }),
    expectedResult: contains('camp_a', { allText: json.stringify() }),
    timeout: 12000,
    logger: 'dbLogger,etlLogger'
  })
})

Test('fileQuery.mlr', {
  impl: dataTest({
    setup: writeCsvSetup(),
    calculate: fileQuery({
      from: localFile(testCsvPath),
      query: mlr('--csv stats1 -a sum,count -f revenue -g campaign_name')
    }),
    expectedResult: contains('camp_a', { allText: json.stringify() }),
    timeout: 12000,
    logger: 'dbLogger,etlLogger'
  })
})

Test('fileQuery.dynamicVarCache', {
  impl: dataTest({
    setup: writeCsvSetup(),
    calculate: runCategoryQueries(
      fileQuery({
        from: localFile(testCsvPath),
        query: duckdb("SELECT '{%$category%}' AS category", { format: 'JSON, ARRAY' }),
        clearCache: true
      }),
      fileQuery({
        from: localFile(testCsvPath),
        query: duckdb("SELECT '{%$category%}' AS category", { format: 'JSON, ARRAY' })
      })
    ),
    expectedResult: contains('sports,electronics', { allText: join(',', { items: '%category%' }) }),
    timeout: 12000,
    logger: 'etlLogger'
  })
})
