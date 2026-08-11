import { dsls, coreUtils } from '@jb6/core'
import '@wonder/bi/benchmark/bi-benchmark-dsl.js'
import './finance3-cube.js'

const {
  common: { Data, data: { compareBenchmarks } },
  bi: { QueryCase, 'query-case': { queryCase }, 'query-environment': { cloud } }
} = dsls
const cube = dsls.bi.cube.finance3Cube()
const benchmarkEndpoint = 'https://staging.indivi.ai/run-room-lambda-sse-progress/finance3/biBenchmarkRunner'
const benchmarkLog = (ctx, event) =>
  (ctx.vars.roomBigLogLogger2 || ctx.vars.benchmarkLogger)?.info?.(event, {}, { ctx })
const benchmarkErrorLog = (ctx, event) =>
  (ctx.vars.roomBigLogLogger2 || ctx.vars.benchmarkLogger)?.error?.(event, {}, { ctx })

const benchmarkError = (error, ctx) => {
  const roomError = ctx.vars.roomLogger?.roomErrors?.at(-1) || {}
  const serverError = roomError.serverError || roomError.error || ''
  const message = String(serverError || error.message || error)
  const known = [
    [/\$resolvedInner|reading 'dsls'/, 'The lambda snapshot is missing a registered TGP dependency.',
      'Upload biBenchmarkRunner again so its dependency closure includes the Finance3 query case and cube.'],
    [/not iterable|is not an array/, 'The server tried to merge a non-array logger channel as an array.',
      'Deploy the room-lambda server containing the logger-channel merge fix, then retry.'],
    [/id_token|getIdToken|login required|authorization token expired/, 'The public applet attempted authenticated token resolution.',
      'Keep noAuth on the public room request, or sign in and remove noAuth.'],
    [/lambda.*not found|missing.*lambda/i, 'The Finance3 lambda manifest is missing or stale.',
      'Upload biBenchmarkRunner to room finance3, then reload the applet.']
  ].find(([pattern]) => pattern.test(message))
  return {
    message, stack: error.stack || '', endpoint: benchmarkEndpoint, status: roomError.status || 500,
    cause: known?.[1] || 'Unknown error.',
    ...(known && { fix: known[2] }),
    serverError: String(serverError)
  }
}

QueryCase('finance3Bench.customerPortfolio', {
  description: 'Business value 5/5: customer investment, retention and service priorities',
  impl: queryCase({
    sql: `select customer_type,customer_country,loyalty_tier,customers,txns,completed_value,completion_rate,quality_issue_rate
      where customer_type is not null group by customer_type,customer_country,loyalty_tier order by completed_value desc`,
    cube, expectedResult: ctx => ctx.data.length === 45
  })
})
QueryCase('finance3Bench.productEconomics', {
  description: 'Business value 5/5: revenue, cost, margin and payment expense',
  impl: queryCase({
    sql: `select product,customer_type,payment_channel,gross_value,completed_value,estimated_cost,gross_margin,payment_fees,txns
      where customer_type is not null group by product,customer_type,payment_channel order by gross_value desc`,
    cube, expectedResult: ctx => ctx.data.length === 45
  })
})
QueryCase('finance3Bench.marketOpportunities', {
  description: 'Business value 4/5: country, product and channel priorities',
  impl: queryCase({
    sql: `select customer_country,product,payment_channel,gross_value,completed_value,payment_fees,completion_rate,failed_n,txns
      where customer_type is not null group by customer_country,product,payment_channel order by completed_value desc limit 50`,
    cube, expectedResult: ctx => ctx.data.length === 50
  })
})
QueryCase('finance3Bench.quarterlyCustomerPerformance', {
  description: 'Business value 4/5: customer performance changes over time',
  impl: queryCase({
    sql: `select year(date) transaction_year,quarter(date) transaction_quarter,customer_type,
      completed_value,gross_value,completion_rate,txns where customer_type is not null
      group by year(date),quarter(date),customer_type order by transaction_year desc,transaction_quarter desc,completed_value desc limit 50`,
    cube, expectedResult: ctx => ctx.data.length === 50
  })
})
Data('finance3RawSseFetch', {
  params: [
    { id: 'host', as: 'string', defaultValue: 'http://localhost:3000' },
    { id: 'logger', as: 'string',
      defaultValue: 'roomBigLogLogger2,benchmarkLogger,roomLogger,dbLogger,errorLogger,duckDBProfilingLogger' }
  ],
  impl: async (ctx, {}, { host, logger }) => {
    const profile = coreUtils.tgpProfileToJson(dsls.common.data.biBenchmarkRunner(
      coreUtils.tgpProfileToJson(dsls.bi['query-case']['finance3Bench.customerPortfolio']()), true))
    const body = JSON.stringify({
      profile, packedCtx: coreUtils.stripCtx({ profileJson: profile, ctx }), stream: true,
      roomUrl: 'room://finance3', logger, noAuth: true
    })
    const url = `${host}/run-room-lambda-sse-progress/finance3/biBenchmarkRunner`
    benchmarkLog(ctx, { t: 'finance3 SSE request', url, bytes: body.length, body })
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body
    })
    const text = await response.text()
    const done = text.split('\n\n').map(message => message.split('\n').find(line => line.startsWith('data:')))
      .filter(Boolean).map(line => JSON.parse(line.slice(5))).find(event => event.type === 'done')
    Object.entries(done?.result?.logs || {}).forEach(([loggerName, channels]) =>
      Object.entries(channels).forEach(([channel, entries]) =>
        Array.isArray(ctx.vars[loggerName]?.[channel]) && Array.isArray(entries) &&
          ctx.vars[loggerName][channel].push(...entries.filter(entry => entry.severity !== 'progress'))))
    const result = done?.result?.result
    benchmarkLog(ctx, {
      t: 'finance3 SSE response', url, status: response.status, contentType: response.headers.get('content-type'), done: !!done,
      body: response.ok ? undefined : text.slice(0, 4000)
    })
    return {
      status: response.status, contentType: response.headers.get('content-type'), done: !!done,
      rows: result?.rows?.length, requests: result?.profiling?.rangesFromBucket?.requests,
      ...(!response.ok && { body: text.slice(0, 4000) })
    }
  }
})
Data('finance3CloudBenchmarkResult', {
  params: [
    { id: 'roomUrl', as: 'string', defaultValue: 'room://finance3' },
    { id: 'lambdaHost', as: 'string', defaultValue: 'https://staging.indivi.ai' },
    { id: 'noAuth', as: 'boolean', defaultValue: true }
  ],
  impl: async (ctx, {}, { roomUrl, lambdaHost, noAuth }) => {
    benchmarkLog(ctx, {
      t: 'finance3 cloud benchmark request', endpoint: benchmarkEndpoint, roomUrl, lambdaHost, noAuth,
      queryCase: 'query-case<bi>finance3Bench.customerPortfolio', warmRuns: 0
    })
    try {
      const [result] = await compareBenchmarks.$runWithCtx(ctx.setVars({ roomUrl, lambdaHost, noAuth }), {
        queryCase: dsls.bi['query-case']['finance3Bench.customerPortfolio'](), environments: [cloud()], warmRuns: 0
      })
      if (!result?.cold?.queryMs) {
        const failure = benchmarkError({ message: 'cloud benchmark returned no cold result', stack: '' }, ctx)
        benchmarkLog(ctx, { t: 'finance3 cloud benchmark response', ok: false, ...failure })
        benchmarkErrorLog(ctx, { t: 'finance3 cloud benchmark failed', ...failure })
        return { ok: false, error: failure }
      }
      ctx.vars.f3Logger?.info?.({
        t: 'finance3 cloud benchmark response', ok: true, rows: result.cold.rows.length,
        queryMs: result.cold.queryMs, requests: result.profiling?.rangesFromBucket?.requests
      })
      return { ok: true, result }
    } catch (error) {
      const failure = benchmarkError(error, ctx)
      benchmarkLog(ctx, { t: 'finance3 cloud benchmark response', ok: false, ...failure })
      coreUtils.logException(error, 'finance3 cloud benchmark failed', { ctx, failure })
      return { ok: false, error: failure }
    }
  }
})
