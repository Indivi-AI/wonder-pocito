import { coreUtils, dsls, jb } from '@jb6/core'
import '@jb6/core/misc/import-map-services.js'
import '@jb6/testing'
import '@wonder/studio/mcp-tools/wonder-mcp-tools.js'
import './pocito-on-prem-test-applet.js'

const {
  common: { Data, boolean: { and, contains, equals } },
  test: { Test, test: { dataTest } }
} = dsls

Data('pocitoOnPremRequest', {
  params: [
    {id: 'url', as: 'string', defaultValue: '%$url%'},
    {id: 'options', defaultValue: '%$options%'}
  ],
  impl: async ({}, {}, {url, options}) => {
    const response = await fetch(url, {signal: AbortSignal.timeout(120000), ...options}), text = await response.text()
    let body = text
    try { body = text ? JSON.parse(text) : null } catch {}
    if (!response.ok) throw new Error(`${url}: ${response.status} ${text}`)
    return {status: response.status, body}
  }
})

const { pocitoOnPremRequest } = dsls.common.data

Data('pocitoOnPremServices', {
  params: [
    {id: 'request', dynamic: true, defaultValue: pocitoOnPremRequest()}
  ],
  impl: async (ctx, {onPremLogger}, {request}) => {
    const wonder = process.env.WONDER_SERVICE_URL || 'http://localhost:3000'
    const marketplace = process.env.MARKETPLACE_API_URL || 'http://localhost:7777'
    const agno = process.env.AGNO_API_URL || 'http://localhost:7778'
    const get = url => request(ctx.setVars({url, options: {}}))
    const [wonderHealth, marketplaceHealth, agnoHealth, models, flapi] = await Promise.all([
      get(`${wonder}/health`), get(`${marketplace}/healthz`), get(`${agno}/healthz`),
      get(`${wonder}/llmProxy/models`), get(`${marketplace}/api/v1/flapi/package/101`)
    ])
    const result = {wonder: wonderHealth.status == 200, marketplace: marketplaceHealth.body, agno: agnoHealth.body,
      models: models.body.data?.map(({id}) => id) || [], flapiPackage: flapi.body.metadata?.Id}
    onPremLogger?.info?.({t: 'on-prem services checked', ...result}, {}, {ctx})
    return result
  }
})

Data('pocitoOnPremDataset', {
  impl: async (ctx, {onPremLogger}) => {
    const {readFile} = await import('node:fs/promises'), {join} = await import('node:path')
    const root = await coreUtils.calcRepoRoot(), data = join(root, 'solutions/pocito/traveling-test/datasets')
    const read = async name => JSON.parse(await readFile(join(data, name), 'utf8'))
    const [emails, instagram, places, itinerary] = await Promise.all([
      read('emails.json'), read('instagram.json'), read('google-places.json'), read('itinerary.json')
    ])
    const result = {emails: emails.length, posts: instagram.length, places: places.length,
      events: itinerary.length}
    onPremLogger?.info?.({t: 'on-prem dataset checked', ...result}, {}, {ctx})
    return result
  }
})

Data('pocitoOnPremMinioRoundTrip', {
  params: [
    {id: 'request', dynamic: true, defaultValue: pocitoOnPremRequest()}
  ],
  impl: async (ctx, {onPremLogger}, {request}) => {
    const base = process.env.MARKETPLACE_API_URL || 'http://localhost:7777'
    const id = `pocito-on-prem-${ctx.vars.testSessionId}`, headers = {'content-type': 'application/json',
      'x-wonder-room': 'pocito-on-prem-tests'}
    const url = `${base}/api/v1/skills/${id}`, marker = 'POCITO_MINIO_OK'
    const payload = {id, display_name: id, description: 'On-prem object-store probe', skill_md: `# Probe\n${marker}`,
      assets: [{path: 'probe.txt', content_b64: Buffer.from(marker).toString('base64'), mime_type: 'text/plain'}]}
    try {
      await request(ctx.setVars({url: `${base}/api/v1/skills/`, options: {method: 'POST', headers, body: JSON.stringify(payload)}}))
      const stored = (await request(ctx.setVars({url: `${url}?includeAssets=true`, options: {headers}}))).body
      const result = {skill: stored.skill_md.includes(marker), asset: Buffer.from(stored.assets[0].content_b64, 'base64').toString()}
      onPremLogger?.info?.({t: 'on-prem MinIO round trip', ...result}, {}, {ctx})
      return result
    } finally { await fetch(url, {method: 'DELETE', headers}) }
  }
})

Data('pocitoOnPremPgvectorRoundTrip', {
  impl: async (ctx, {onPremLogger}) => {
    const {execFile} = await import('node:child_process'), {promisify} = await import('node:util'), {join, resolve} = await import('node:path')
    const root = await coreUtils.calcRepoRoot(), pocito = join(root, 'solutions/pocito')
    const venvs = process.env.POCITO_DEPS_DIR ? join(process.env.POCITO_DEPS_DIR, 'venvs')
      : join(resolve(pocito, process.env.POCITO_DATA_DIR || '.local-data'), 'venvs')
    const script = `from sqlalchemy import create_engine, text
import os
with create_engine(os.environ['PGVECTOR_URL']).begin() as connection:
 connection.execute(text('CREATE TEMP TABLE pocito_vector_test (embedding vector(3))'))
 connection.execute(text("INSERT INTO pocito_vector_test VALUES ('[1,0,0]')"))
 print(connection.execute(text("SELECT embedding <-> '[1,0,0]' FROM pocito_vector_test")).scalar_one())`
    const {stdout} = await promisify(execFile)(join(venvs, 'agno-server/bin/python'), ['-c', script], {env: process.env})
    const distance = Number(stdout.trim())
    onPremLogger?.info?.({t: 'on-prem PGVector round trip', distance}, {}, {ctx})
    return {distance}
  }
})

Data('pocitoOnPremLiteLlmRoundTrip', {
  params: [
    {id: 'request', dynamic: true, defaultValue: pocitoOnPremRequest()}
  ],
  impl: async (ctx, {onPremLogger}, {request}) => {
    const url = process.env.LLM_PROXY_URL || 'http://localhost:3000/llmProxy'
    const call = async (path, originalBody) => (await request(ctx.setVars({url, options: {method: 'POST',
      headers: {'content-type': 'application/json'}, body: JSON.stringify({targetUrl: `http://litellm${path}`,
        headers: {'content-type': 'application/json'}, originalBody: JSON.stringify(originalBody)})}}))).body
    const chat = await call('/v1/chat/completions', {model: 'chat', stream: false,
      messages: [{role: 'user', content: 'Reply with exactly POCITO_LITELLM_OK'}]})
    const embeddings = await call('/v1/embeddings', {model: 'embeddings', input: 'Pocito on-prem embedding probe'})
    const result = {reply: chat.choices?.[0]?.message?.content || '', dimensions: embeddings.data?.[0]?.embedding?.length || 0}
    onPremLogger?.info?.({t: 'on-prem LiteLLM round trip', ...result}, {}, {ctx})
    return result
  }
})

Data('pocitoOnPremMarketplaceSeed', {
  params: [
    {id: 'request', dynamic: true, defaultValue: pocitoOnPremRequest()}
  ],
  impl: async (ctx, {onPremLogger}, {request}) => {
    const base = process.env.MARKETPLACE_API_URL || 'http://localhost:7777'
    const headers = {'x-wonder-room': process.env.MARKETPLACE_SEED_ROOM || 'marketplace'}
    const paths = ['tools/northstar-company-email', 'tools/northstar-instagram', 'tools/tel-aviv-places',
      'tools/northstar-itinerary', 'skills/northstar-travel-support', 'agents/northstar-travel-agent']
    const assets = await Promise.all(paths.map(async path =>
      (await request(ctx.setVars({url: `${base}/api/v1/${path}`, options: {headers}}))).body))
    const result = {ids: assets.map(({id}) => id), packageIds: assets.slice(0, 4).map(({package_id}) => package_id)}
    onPremLogger?.info?.({t: 'on-prem Marketplace seed checked', ...result}, {}, {ctx})
    return result
  }
})

Data('pocitoOnPremMinioApplet', {
  impl: async (ctx, {onPremLogger}) => {
    const tool = await dsls.mcp.tool.uploadRoomApplet.$runWithCtx(ctx, {
      roomId: 'room://pocito-on-prem-minio', entryCompFullId: 'react-comp<react>pocitoOnPremTestApplet'
    })
    const published = JSON.parse(tool.content[0].text)
    if (published.error) throw new Error(published.error)
    const dbCtx = ctx.setVars(jb.wonderUtils.storageEnvVars())
    const manifestResponse = await jb.wonderUtils.wfetch2(published.defPath, {method: 'GET'}, dbCtx)
    const uploadedManifest = await manifestResponse.json()
    const sourceResponse = await jb.wonderUtils.wfetch2(
      `${published.clientCodeWUrl.replace(/\/?$/, '/')}solutions/pocito/on-prem/dev/pocito-on-prem-test-applet.js`, {}, dbCtx)
    const result = {fileCount: published.fileCount, manifestStored: uploadedManifest.appletV === published.appletV,
      sourceStored: sourceResponse.ok && (await sourceResponse.text()).includes('Pocito on-prem applet loaded')}
    onPremLogger?.info?.({t: 'on-prem applet uploaded to MinIO', appletV: published.appletV, ...result}, {}, {ctx})
    return result
  }
})

Data('pocitoOnPremAgentQuestion', {
  params: [
    {id: 'question', as: 'string', mandatory: true}
  ],
  impl: async (ctx, {onPremLogger}, {question}) => {
    const base = process.env.AGNO_API_URL || 'http://localhost:7778', form = new FormData()
    form.set('message', question); form.set('session_id', ctx.vars.testSessionId); form.set('user_id', 'pocito-on-prem-test'); form.set('stream', 'false')
    const response = await fetch(`${base}/agents/northstar-travel-agent/runs`, {method: 'POST',
      headers: {'x-wonder-room': process.env.MARKETPLACE_SEED_ROOM || 'marketplace'}, body: form, signal: AbortSignal.timeout(180000)})
    const body = await response.json()
    if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`)
    const result = {answer: body.content || '', tools: body.tools || body.tool_executions || []}
    onPremLogger?.info?.({t: 'on-prem travel agent answered', question, answer: result.answer,
      tools: result.tools.map(({tool_name, name}) => tool_name || name)}, {}, {ctx})
    return result
  }
})

const { pocitoOnPremAgentQuestion, pocitoOnPremDataset, pocitoOnPremLiteLlmRoundTrip, pocitoOnPremMarketplaceSeed,
  pocitoOnPremMinioApplet, pocitoOnPremMinioRoundTrip, pocitoOnPremPgvectorRoundTrip, pocitoOnPremServices } = dsls.common.data

Test('pocitoOnPrem.services', {
  HeavyTest: true,
  nodeOnly: true,
  impl: dataTest({
    calculate: pocitoOnPremServices(),
    expectedResult: and(
      equals('%wonder%', true),
      equals('%marketplace/status%', 'ok'),
      equals('%marketplace/object_store%', 'ok'),
      equals('%agno/status%', 'ok'),
      equals('%agno/object_store%', 'ok'),
      equals('%agno/vector_store%', 'ok'),
      equals('%models%', ['chat','embeddings']),
      equals('%flapiPackage%', 101)
    ),
    timeout: 30000,
    logger: 'onPremLogger'
  })
})

Test('pocitoOnPrem.dataset', {
  HeavyTest: true,
  nodeOnly: true,
  impl: dataTest({
    calculate: pocitoOnPremDataset(),
    expectedResult: and(
      equals('%emails%', 100),
      equals('%posts%', 10),
      equals('%places%', 1200),
      equals('%events%', 17)
    ),
    timeout: 30000,
    logger: 'onPremLogger'
  })
})

Test('pocitoOnPrem.minio', {
  HeavyTest: true,
  nodeOnly: true,
  impl: dataTest({
    calculate: pocitoOnPremMinioRoundTrip(),
    expectedResult: and(equals('%skill%', true), equals('%asset%', 'POCITO_MINIO_OK')),
    timeout: 30000,
    logger: 'onPremLogger'
  })
})

Test('pocitoOnPrem.pgvector', {
  HeavyTest: true,
  nodeOnly: true,
  impl: dataTest(pocitoOnPremPgvectorRoundTrip(), equals('%distance%', 0), {
    timeout: 30000,
    logger: 'onPremLogger'
  })
})

Test('pocitoOnPrem.litellm', {
  HeavyTest: true,
  nodeOnly: true,
  impl: dataTest({
    calculate: pocitoOnPremLiteLlmRoundTrip(),
    expectedResult: and(contains('POCITO_LITELLM_OK', { allText: '%reply%' }), equals('%dimensions%', 1536)),
    timeout: 120000,
    logger: 'onPremLogger'
  })
})

Test('pocitoOnPrem.marketplaceSeed', {
  HeavyTest: true,
  nodeOnly: true,
  impl: dataTest({
    calculate: pocitoOnPremMarketplaceSeed(),
    expectedResult: and(equals('%ids/length%', 6), equals('%packageIds%', ['101','102','103','104'])),
    timeout: 30000,
    logger: 'onPremLogger'
  })
})

Test('pocitoOnPrem.minioApplet', {
  HeavyTest: true,
  nodeOnly: true,
  impl: dataTest({
    calculate: pocitoOnPremMinioApplet(),
    expectedResult: and('%fileCount% > 0', equals('%manifestStored%', true), equals('%sourceStored%', true)),
    timeout: 120000,
    logger: 'onPremLogger,mcpLogger,dbLogger'
  })
})

Test('pocitoOnPrem.restaurantAgent', {
  HeavyTest: true,
  nodeOnly: true,
  impl: dataTest({
    calculate: pocitoOnPremAgentQuestion('Help me find a restaurant that Tom will like.'),
    expectedResult: and(contains('Opa', { allText: '%answer%' }), contains('vegetar', { allText: '%answer%' })),
    timeout: 180000,
    logger: 'onPremLogger,agentLogger'
  })
})

Test('pocitoOnPrem.phoneAgent', {
  HeavyTest: true,
  nodeOnly: true,
  impl: dataTest({
    calculate: pocitoOnPremAgentQuestion('John lost his phone. Help him find it.'),
    expectedResult: and(
      contains('Norman Library Bar', { allText: '%answer%' }),
      contains('green', { allText: '%answer%' })
    ),
    timeout: 180000,
    logger: 'onPremLogger,agentLogger'
  })
})
