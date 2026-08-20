import { dsls } from '@jb6/core'
import '@jb6/common'
import './wonder-platform-domain.js'

const { common: { Data } } = dsls

Data('wonderPlatformMarketplaceRequest', {
  params: [
    {id: 'method', as: 'string', defaultValue: 'GET'},
    {id: 'path', as: 'string', mandatory: true},
    {id: 'body', as: 'object'},
    {id: 'baseUrl', as: 'string', defaultValue: 'http://localhost:7777'}
  ],
  impl: async (ctx, {}, {method, path, body, baseUrl}) => {
    const hasBody = !['GET', 'DELETE'].includes(method) && body != null
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method, headers: hasBody ? {'Content-Type': 'application/json'} : {}, ...(hasBody ? {body: JSON.stringify(body)} : {})
    })
    ctx.vars.marketplaceLogger?.info?.({t: 'marketplaceApi', method, path, status: response.status}, {}, {ctx})
    if (!response.ok) throw new Error(`Marketplace ${response.status}: ${await response.text()}`)
    if (response.status == 204) return null
    return response.headers.get('content-type')?.includes('json') ? response.json() : response.text()
  }
})

Data('wonderPlatformMarketplaceCall', {
  params: [
    {id: 'operation', as: 'string', mandatory: true},
    {id: 'resource', as: 'string'},
    {id: 'name', as: 'string'},
    {id: 'filePath', as: 'string'},
    {id: 'version', as: 'number'},
    {id: 'body', as: 'object'},
    {id: 'baseUrl', as: 'string', defaultValue: 'http://localhost:7777'},
    {id: 'request', dynamic: true,
      defaultValue: dsls.common.data.wonderPlatformMarketplaceRequest('%$method%', '%$apiPath%', '%$body%', '%$baseUrl%')}
  ],
  impl: (ctx, {}, {operation, resource, name, filePath, version, body, baseUrl, request}) => {
    const apiResource = resource == 'subagents' ? 'agents' : resource, id = encodeURIComponent(name || '')
    const routes = {
      health: ['GET', '/healthz'], list: ['GET', `/api/v1/${apiResource}/`], create: ['POST', `/api/v1/${apiResource}/`],
      get: ['GET', `/api/v1/${apiResource}/${id}`], update: ['PUT', `/api/v1/${apiResource}/${id}`],
      delete: ['DELETE', `/api/v1/${apiResource}/${id}`], config: ['GET', `/api/v1/${apiResource}/${id}/config.yaml`],
      document: ['GET', `/api/v1/${apiResource}/${id}/${resource == 'skills' ? 'SKILL.md' : 'README.md'}`],
      references: ['GET', `/api/v1/${apiResource}/${id}/references`], versions: ['GET', `/api/v1/${apiResource}/${id}/versions`],
      version: ['GET', `/api/v1/${apiResource}/${id}/versions/${version}`],
      asset: ['GET', `/api/v1/skills/${id}/assets/${encodeURIComponent(filePath || '')}`],
      code: ['GET', `/api/v1/tools/${id}/code/${encodeURIComponent(filePath || '')}`],
      audit: ['GET', `/api/v1/audit/${{tools: 'tool', skills: 'skill', plugins: 'plugin', agents: 'agent'}[apiResource]}/${id}`],
      presignDownload: ['POST', '/api/v1/presign/download'],
      presignUpload: ['POST', '/api/v1/presign/upload'], createUser: ['POST', '/api/v1/users/'],
      getUser: ['GET', `/api/v1/users/${id}`]
    }
    const [method, apiPath] = routes[operation]
    return request(ctx.setVars({method, apiPath, body, baseUrl}))
  }
})

Data('wonderPlatformMarketplaceManifest', {
  params: [{id: 'resource', as: 'string'}, {id: 'item', as: 'object'}],
  impl: ({}, {}, {resource, item}) => {
    const base = {display_name: item.id || item.display_name, hebrew_display_name: item.name || null,
      description: item.apiDescription || item.desc || '', hebrew_description: item.desc || null, tags: item.tags || []}
    if (resource == 'plugins') return {...base, config: {skills: item.skillIds || [], tools: item.toolIds || []},
      readme: item.readme || ''}
    if (resource == 'subagents') return {...base, config: {system_prompt: item.instructions || '',
      backend_config: item.backendConfig || {harness_type: 'deepagents'}, plugins: item.pluginIds || [], skills: item.skillIds || [],
      tools: item.toolIds || [], sub_agents: item.subagentIds || []}, readme: item.readme || ''}
    if (resource == 'skills') return {...base, min_agent_version: item.minAgentVersion || null, license: item.license || null,
      skill_md: item.content || '', assets: item.assets || []}
    return {...base, tool_type: item.toolType || item.tool_type || 'code', json_schema: item.jsonSchema || {},
      is_async: item.isAsync ?? true, tracable: item.tracable ?? true, dedicated_tool_config: item.dedicatedToolConfig || {},
      code_files: item.codeFiles || []}
  }
})

Data('wonderPlatformMarketplaceItem', {
  params: [{id: 'resource', as: 'string'}, {id: 'item', as: 'object'}],
  impl: ({}, {}, {resource, item}) => {
    const config = item.config || {}, id = item.display_name || item.name || item.id, name = item.hebrew_display_name || id
    return {...item, _marketplace: true, id, name, mark: name?.slice(0, 2), desc: item.hebrew_description || item.description || '',
      apiDescription: item.description || '', tags: item.tags || [], version: item.version == null ? 'V0' : String(item.version),
      created: item.created_at || item.created || '—', updated: item.updated_at || item.updated || '—',
      skillIds: config.skills || item.skills || [], toolIds: config.tools || item.tools || [],
      subagentIds: config.sub_agents || config.agents || item.agents || [], pluginIds: config.plugins || item.plugins || [],
      instructions: config.system_prompt || item.instructions || '', readme: item.readme || '', backendConfig: config.backend_config || {},
      content: item.skill_md || item.content || '', assets: item.assets || [], minAgentVersion: item.min_agent_version,
      license: item.license, toolType: item.tool_type, jsonSchema: item.json_schema || {}, isAsync: item.is_async,
      tracable: item.tracable, dedicatedToolConfig: item.dedicated_tool_config || {}, codeFiles: item.code_files || [],
      kind: resource == 'tools' ? ['flow_package', 'flow_cube'].includes(item.tool_type) ? 'flow' : 'connector' : item.kind,
      managed: resource == 'tools' && item.tool_type == 'kick_graphql'}
  }
})

Data('wonderPlatformMarketplaceLoad', {
  params: [
    {id: 'baseUrl', as: 'string', defaultValue: 'http://localhost:7777'},
    {id: 'call', dynamic: true,
      defaultValue: dsls.common.data.wonderPlatformMarketplaceCall('list', '%$resource%', {baseUrl: '%$baseUrl%'})}
  ],
  impl: async (ctx, {}, {baseUrl, call}) => Object.fromEntries(await Promise.all(['plugins', 'skills', 'tools', 'subagents'].map(async resource =>
    [resource, await call(ctx.setVars({resource, baseUrl}))])))
})

Data('wonderPlatformMarketplaceRepository', {
  params: [
    {id: 'baseUrl', as: 'string', defaultValue: 'http://localhost:7777'},
    {id: 'seed', dynamic: true, defaultValue: dsls.common.data.wonderPlatformSeed()},
    {id: 'load', dynamic: true, defaultValue: dsls.common.data.wonderPlatformMarketplaceLoad('%$baseUrl%')},
    {id: 'normalize', dynamic: true, defaultValue: dsls.common.data.wonderPlatformMarketplaceItem('%$resource%', '%$item%')}
  ],
  impl: async (ctx, {}, {baseUrl, seed, load, normalize}) => {
    const catalog = await load(ctx.setVars({baseUrl}))
    return {...seed(ctx), ...Object.fromEntries(Object.entries(catalog).map(([resource, items]) =>
      [resource, items.map(item => normalize(ctx.setVars({resource, item})))])), marketplace: true}
  }
})

Data('wonderPlatformMarketplaceDetail', {
  params: [
    {id: 'resource', as: 'string', mandatory: true}, {id: 'name', as: 'string', mandatory: true},
    {id: 'baseUrl', as: 'string', defaultValue: 'http://localhost:7777'},
    {id: 'call', dynamic: true,
      defaultValue: dsls.common.data.wonderPlatformMarketplaceCall('%$operation%', '%$resource%', '%$name%', {baseUrl: '%$baseUrl%'})},
    {id: 'normalize', dynamic: true, defaultValue: dsls.common.data.wonderPlatformMarketplaceItem('%$resource%', '%$manifest%')}
  ],
  impl: async (ctx, {}, {resource, name, baseUrl, call, normalize}) => {
    const run = (operation, vars = {}) => call(ctx.setVars({operation, resource, name, baseUrl, ...vars}))
    const [manifest, versions, audit] = await Promise.all([run('get'), run('versions'), run('audit')])
    const [references, document, configYaml] = await Promise.all([
      ['plugins', 'subagents'].includes(resource) ? run('references') : null,
      ['plugins', 'skills'].includes(resource) ? run('document') : null,
      ['plugins', 'subagents'].includes(resource) ? run('config') : null
    ])
    return {...normalize(ctx.setVars({resource, manifest})), versions, audit, references, configYaml,
      ...(resource == 'skills' ? {content: document} : resource == 'plugins' ? {readme: document} : {})}
  }
})

Data('wonderPlatformAgentOsRequest', {
  params: [
    {id: 'agentId', as: 'string', mandatory: true}, {id: 'message', as: 'string', mandatory: true},
    {id: 'sessionId', as: 'string', mandatory: true}, {id: 'baseUrl', as: 'string', defaultValue: 'http://localhost:7777'},
    {id: 'token', as: 'string'}
  ],
  impl: async (ctx, {}, {agentId, message, sessionId, baseUrl, token}) => {
    const body = new FormData()
    Object.entries({message, session_id: sessionId, user_id: 'wonder-platform', stream: 'false'}).forEach(([key, value]) => body.append(key, value))
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/agents/${encodeURIComponent(agentId)}/runs`, {
      method: 'POST', headers: token ? {Authorization: `Bearer ${token}`} : {}, body
    })
    ctx.vars.agentOsLogger?.info?.({t: 'agentOsRun', agentId, sessionId, status: response.status}, {}, {ctx})
    if (!response.ok) throw new Error(`AgentOS ${response.status}: ${await response.text()}`)
    return response.json()
  }
})

Data('wonderPlatformAgentOsRun', {
  params: [
    {id: 'text', as: 'string', mandatory: true}, {id: 'target', as: 'object', mandatory: true},
    {id: 'sessionId', as: 'string', mandatory: true}, {id: 'baseUrl', as: 'string', defaultValue: 'http://localhost:7777'},
    {id: 'token', as: 'string'},
    {id: 'request', dynamic: true,
      defaultValue: dsls.common.data.wonderPlatformAgentOsRequest('%$agentId%', '%$text%', '%$sessionId%', '%$baseUrl%', '%$token%')}
  ],
  impl: async (ctx, {}, {text, target, sessionId, baseUrl, token, request}) => {
    const startedAt = Date.now(), run = await request(ctx.setVars({agentId: target.id, text, sessionId, baseUrl, token}))
    const output = typeof run.content == 'string' ? run.content : JSON.stringify(run.content || ''), markers = [...output.matchAll(
      /\[\[report:([\w-]+)\]\]/g)]
    return {text: output.replace(/\s*\[\[report:[\w-]+\]\]/g, '').trim(), reportIds: [...new Set(markers.map(([, id]) => id))],
      followUps: [], status: String(run.status || '').toLowerCase().includes('fail') ? 'נכשל' : 'הושלם',
      duration: `${Math.max(1, Math.round((Date.now() - startedAt) / 1000))} שנ׳`, runId: run.run_id || run.runId,
      opikUrl: run.opik_url || run.trace_url, runtimeSteps: [{kind: 'AgentOS', title: target.name, runtime: true}]}
  }
})
