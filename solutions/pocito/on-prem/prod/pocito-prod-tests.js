import { dsls, coreUtils } from '@jb6/core'
import '@jb6/testing'
import '@wonder/studio/mcp-tools/wonder-mcp-tools.js'
import './pocito-prod-test-lambda.js'

const { common: { Data, boolean: { equals } },
  mcp: { tool: { uploadRoomLambda } }, test: { Test, test: { dataTest } } } = dsls

Data('pocitoProdRuntimeCheck', {
  impl: async (ctx, {onPremLogger}) => {
    const assert = (await import('node:assert/strict')).default
    const { execFile } = await import('node:child_process'), { promisify } = await import('node:util')
    const origin = process.env.POCITO_PROD_TEST_URL, container = process.env.POCITO_PROD_TEST_CONTAINER
    assert(origin && container, 'Set POCITO_PROD_TEST_URL and POCITO_PROD_TEST_CONTAINER to the running production image')
    const room = `prod-test-${crypto.randomUUID()}`
    const roomWUrl = `room://${room}`
    const published = JSON.parse((await uploadRoomLambda.$runWithCtx(ctx, {compFullId: 'data<common>pocitoProdTestLambda', roomWUrl})).content[0].text)
    assert(!published.error, JSON.stringify(published))
    const call = async (path, body, signal) => fetch(origin + path,
      {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body), signal})
    const childStopped = async pid => {
      assert(pid)
      await new Promise(resolve => setTimeout(resolve, 100))
      await promisify(execFile)('docker', ['exec', container, 'node', '-e',
        `for (const pid of [${pid}, -${pid}]) try {process.kill(pid, 0); process.exit(1)} catch (e) {if (e.code !== 'ESRCH') throw e}`])
    }
    const profile = marker => ({$: 'data<common>pocitoProdTestLambda', marker, delayMs: 100})
    const logsAreClean = logs => {
      for (const channels of Object.values(logs || {})) for (const [name, entries] of Object.entries(channels))
        if (/Errors$/.test(name)) assert.deepEqual(entries, [])
    }
    try {
      for (const path of ['/mcp', '/run-cli', '/files/test.json', '/applet/test', '/studio/tests.html'])
        assert.equal((await call(path, {})).status, 404, path)
      const invoke = await call(`/run-room-lambda/${room}/pocitoProdTestLambda`, {profile: {...profile('published'), callback: true}, logger: 'roomLogger'})
      const body = await invoke.json()
      assert.equal(invoke.status, 200, JSON.stringify(body))
      assert(body.result?.result, JSON.stringify(body))
      assert.equal(body.result.result.marker, 'published')
      assert.equal(body.result.result.nested.marker, 'nested')
      assert.equal(body.result.result.noAuth, true)
      assert(/^\/(private\/)?tmp\/code\//.test(body.result.result.cwd))
      logsAreClean(body.result.logs)
      const streams = await Promise.all(['first', 'second'].map(async marker => {
        const response = await call(`/run-room-lambda-sse-progress/${room}/pocitoProdTestLambda`, {profile: profile(marker), logger: 'roomLogger'})
        const events = (await response.text()).split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)))
        const progress = events.filter(event => event.channel === 'progress')
        assert(progress.length > 0)
        assert(progress.every(event => event.event.marker === marker))
        logsAreClean(events.find(event => event.type === 'done').result.logs)
        return marker
      }))
      const timeout = await call(`/run-room-lambda-sse-progress/${room}/pocitoProdTestLambda`, {
        profile: {...profile('timeout'), delayMs: 30000}, logger: 'roomLogger', serverTimeout: 8000})
      const timedEvents = (await timeout.text()).split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)))
      assert.equal(timedEvents.find(event => event.type === 'done').result.result, 'serverTimeout')
      await childStopped(timedEvents.find(event => event.channel === 'progress')?.event.pid)
      const cancel = new AbortController()
      const disconnected = await call(`/run-room-lambda-sse-progress/${room}/pocitoProdTestLambda`, {
        profile: {...profile('disconnect'), delayMs: 30000}, logger: 'roomLogger'}, cancel.signal)
      const reader = disconnected.body.getReader(), decoder = new TextDecoder()
      let progress = ''
      while (!progress.includes('\n\n')) progress += decoder.decode((await reader.read()).value)
      cancel.abort()
      await childStopped(JSON.parse(progress.split('\n').find(line => line.startsWith('data: ')).slice(6)).event.pid)
      const storage = await call('/wfetch', {url: `${roomWUrl}/usersRW/check.json`, method: 'PUT',
        headers: {'content-type': 'application/json'}, body: JSON.stringify({persisted: true})})
      assert.equal(storage.status, 200)
      const read = await call('/wfetch', {url: `${roomWUrl}/usersRW/check.json`})
      const stored = await read.json()
      assert.equal(read.status, 200, JSON.stringify(stored))
      assert.equal(stored.body.persisted, true)
      const result = {published: true, nested: true, isolatedStreams: streams.length, timeoutKilledChild: true, disconnectKilledChild: true, storage: true}
      onPremLogger.info({t: 'production runtime verified', ...result}, {}, {ctx})
      return true
    } finally {
      const endpoint = process.env.MINIO_ENDPOINT
      await Promise.all([`${endpoint}/indiviai-wonder/${room}/lambdas/pocitoProdTestLambda.json`,
        `${endpoint}/indiviai-wonder/${room}/usersRW/check.json`,
        `${endpoint}/wonder-code-packages/lambdas/${published.lambdaV}.tar.gz`].map(url => fetch(url, {method: 'DELETE'})))
    }
  }
})

Data('pocitoProdSessionsCheck', {
  impl: async (ctx, {onPremLogger}) => {
    const { execFile } = await import('node:child_process'), { promisify } = await import('node:util'), { join, resolve } = await import('node:path')
    const pocito = join(await coreUtils.calcRepoRoot(), 'solutions/pocito')
    const deps = process.env.POCITO_DEPS_DIR || resolve(pocito, process.env.POCITO_DATA_DIR || '.local-data')
    const {stdout} = await promisify(execFile)(join(deps, 'venvs/agno-server/bin/python'), [join(pocito, 'on-prem/prod/test_sessions.py')])
    const result = JSON.parse(stdout.trim().split('\n').at(-1))
    onPremLogger.info({t: 'production sessions verified', ...result}, {}, {ctx})
    return result.persistence && result.roomIsolation
  }
})

const { pocitoProdRuntimeCheck, pocitoProdSessionsCheck } = dsls.common.data

Test('pocitoProd.runtime', {
  HeavyTest: true,
  nodeOnly: true,
  impl: dataTest(pocitoProdRuntimeCheck(), equals('%%', true), {
    timeout: 120000,
    logger: 'onPremLogger,roomLogger,dbLogger,mcpLogger'
  })
})

Test('pocitoProd.sessions', {
  HeavyTest: true,
  nodeOnly: true,
  impl: dataTest(pocitoProdSessionsCheck(), equals('%%', true), { timeout: 30000, logger: 'onPremLogger' })
})
