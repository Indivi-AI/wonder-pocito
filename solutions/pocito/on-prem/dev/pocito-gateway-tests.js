import { dsls } from '@jb6/core'
import '@jb6/testing'

const { common: { Data, boolean: { equals } }, test: { Test, test: { dataTest } } } = dsls

Data('pocitoGatewayBrowserCheck', {
  params: [
    {id: 'includeModelRun', as: 'boolean', type: 'boolean<common>'}
  ],
  impl: async (ctx, {onPremLogger}, {includeModelRun}) => {
    const assert = (await import('node:assert/strict')).default
    const { chromium } = await import('playwright')
    const { createPocitoApp } = await import('./pocito-app.js')
    const app = await createPocitoApp(), server = await new Promise(resolve => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening))
    })
    const port = server.address().port, origin = `http://pocito-gateway.test:${port}`, room = `gateway-${crypto.randomUUID()}`
    let browser
    try {
      browser = await chromium.launch({args: ['--host-resolver-rules=MAP pocito-gateway.test 127.0.0.1', '--no-proxy-server']})
      const page = await browser.newPage(), errors = [], offOriginApi = [], requests = []
      page.on('pageerror', error => errors.push(error.message))
      page.on('request', request => requests.push(request.url()))
      await page.route('**/*', route => {
        const request = route.request()
        if (new URL(request.url()).origin === origin) return route.continue()
        if (['fetch', 'xhr', 'script'].includes(request.resourceType())) offOriginApi.push(request.url())
        return route.abort()
      })
      await page.goto(`${origin}/applet/wonderAgents?logger=marketplaceLogger,agentLogger,dbLogger,uiLogger&automation=`,
        {waitUntil: 'domcontentloaded'})
      await page.getByText('Wonder Agents', {exact: true}).first().waitFor()
      await page.getByRole('button', {name: /התחל שיחה/}).click()
      await page.getByTestId('model-selector').waitFor()
      const result = await page.evaluate(async ({room, includeModelRun}) => {
        const { coreUtils, dsls } = await import('/jb6_packages/core/index.js')
        const ctx = coreUtils.ensureLoggers('marketplaceLogger,agentLogger,dbLogger')
          .setVars({roomWUrl: `room://${room}`, db: 'fs', localhostServer: location.origin, noAuth: true})
        const check = (condition, message) => { if (!condition) throw new Error(message) }
        const call = args => dsls.common.data.wonderPlatformMarketplaceCall.$runWithCtx(ctx, {roomWUrl: `room://${room}`, ...args})
        check(globalThis.MARKETPLACE_API_URL === '/_pocito/marketplace' && globalThis.AGNO_API_URL === '/_pocito/agno'
          && globalThis.LLM_PROXY_URL === '/llmProxy', 'browser endpoints must be same-origin')
        const item = {id: 'probe', display_name: 'Gateway probe', description: 'Remote browser regression test'}
        await call({operation: 'create', resource: 'skills', body: {...item, skill_md: 'before',
          assets: [{path: 'probe.bin', content_b64: 'AAH/fw==', mime_type: 'application/octet-stream'}]}})
        await call({operation: 'update', resource: 'skills', id: item.id, body: {skill_md: 'after'}})
        const skill = await call({operation: 'get', resource: 'skills', id: item.id})
        check(skill.skill_md === 'after' && skill.assets[0].content_b64 === 'AAH/fw==', 'skill update/query round trip')
        const redirected = await fetch('/_pocito/marketplace/api/v1/skills/probe/?includeAssets=true', {headers: {'x-wonder-room': room}})
        check(redirected.ok && redirected.redirected && redirected.url.startsWith(`${location.origin}/_pocito/marketplace/`),
          'upstream redirect must stay behind the gateway')
        const otherRoom = await fetch('/_pocito/marketplace/api/v1/skills/probe', {headers: {'x-wonder-room': `${room}-other`}})
        check(otherRoom.status === 404, 'room header must be preserved')
        await call({operation: 'create', resource: 'knowledge', body: item})
        const bytes = new Uint8Array([0, 1, 255, 127]), upload = new FormData()
        upload.append('file', new Blob([bytes], {type: 'application/octet-stream'}), 'probe.bin')
        const content = await call({operation: 'uploadContent', resource: 'knowledge', id: item.id, body: upload})
        const download = await fetch(`/_pocito/marketplace/api/v1/knowledge/probe/content/${content.id}/file`,
          {headers: {'x-wonder-room': room}})
        check(download.ok && String(new Uint8Array(await download.arrayBuffer())) === String(bytes), 'multipart/binary round trip')
        const agno = await fetch('/_pocito/agno/healthz')
        check(agno.ok && (await agno.json()).object_store === 'ok', 'Agno gateway health')
        if (includeModelRun) {
          await call({operation: 'create', resource: 'agents', body: {...item, config: {
            system_prompt: 'Reply with exactly POCITO_GATEWAY_OK', backend_config: {harness_type: 'deepagents'}}}})
          const run = await dsls.common.data.wonderPlatformAgentWUrlRequest.$runWithCtx(ctx, {
            roomWUrl: `room://${room}`, agentId: 'probe', message: 'Check connectivity', model: 'chat'})
          check(JSON.stringify(run.content).includes('POCITO_GATEWAY_OK'), 'real agent reply through multipart gateway')
          const stream = await fetch('/llmProxy', {method: 'POST', headers: {'content-type': 'application/json'},
            body: JSON.stringify({targetUrl: 'http://litellm/v1/chat/completions', originalBody: JSON.stringify({model: 'chat',
              stream: true, messages: [{role: 'user', content: 'Reply OK'}]})})})
          check(stream.ok && (await stream.text()).includes('[DONE]'), 'LLM event stream through same origin')
        }
        return {passed: true, logs: coreUtils.harvestLogs(ctx)}
      }, {room, includeModelRun})
      await page.reload({waitUntil: 'domcontentloaded'})
      await page.getByText('Wonder Agents', {exact: true}).first().waitFor()
      assert.deepEqual(offOriginApi, [])
      assert.deepEqual(errors, [])
      assert(requests.some(url => url.startsWith(`${origin}/_pocito/marketplace/api/v1/`)))
      const logs = await page.evaluate(async () => (await import('/jb6_packages/core/index.js')).coreUtils.harvestLogs({vars: window.jbLoggers}))
      for (const group of [result.logs, logs]) for (const logger of Object.values(group))
        for (const [name, entries] of Object.entries(logger)) if (/Errors$|^errorLog$/.test(name)) assert.deepEqual(entries, [])
      onPremLogger?.info?.({t: 'Pocito browser gateway checked', origin, includeModelRun, requests: requests.length, ...result, pageLogs: logs}, {}, {ctx})
      return result.passed
    } finally {
      try {
        await browser?.close()
        const deleted = await Promise.all(['agents', 'skills', 'knowledge'].map(resource => fetch(
          `http://127.0.0.1:${port}/_pocito/marketplace/api/v1/${resource}/probe`, {method: 'DELETE', headers: {'x-wonder-room': room}})))
        assert(deleted.every(response => [204, 404].includes(response.status)))
      } finally {
        server.closeAllConnections()
        await new Promise(resolve => server.close(resolve))
      }
    }
  }
})

const { pocitoGatewayBrowserCheck } = dsls.common.data

Test('pocitoIntegration.browserGateway', {
  HeavyTest: true,
  nodeOnly: true,
  impl: dataTest(pocitoGatewayBrowserCheck(), equals('%%', true), {
    timeout: 60000,
    logger: 'onPremLogger'
  })
})

Test('pocitoIntegration.browserGatewayAgent', {
  HeavyTest: true,
  nodeOnly: true,
  impl: dataTest(pocitoGatewayBrowserCheck(true), equals('%%', true), {
    timeout: 120000,
    logger: 'onPremLogger'
  })
})
