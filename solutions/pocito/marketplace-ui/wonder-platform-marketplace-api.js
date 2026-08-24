import { dsls, jb } from '@jb6/core'
import '@jb6/common'
import './wonder-platform-domain.js'
import './wonder-platform-marketplace-wurl.js'

const { common: { Data } } = dsls

Data('wonderPlatformMarketplaceRequest', {
  params: [
    {id: 'method', as: 'string', defaultValue: 'GET'},
    {id: 'wUrl', as: 'string', mandatory: true},
    {id: 'body', as: 'object'},
    {id: 'baseUrl', as: 'string'}
  ],
  impl: async (ctx, {}, {method, wUrl, body, baseUrl}) => {
    const hasBody = !['GET', 'DELETE'].includes(method) && body != null
    const response = await jb.wonderUtils.wfetch2(wUrl, {method, ...(hasBody ? {body} : {})},
      ctx.setVars({marketplaceBaseUrl: baseUrl}))
    if (!response.ok) throw new Error(`Marketplace ${response.status}: ${await response.text()}`)
    if (response.status == 204) return null
    return response.headers.get('content-type')?.includes('json') ? response.json() : response.text()
  }
})

const { wonderPlatformMarketplaceRequest } = dsls.common.data

Data('wonderPlatformMarketplaceCall', {
  params: [
    {id: 'operation', as: 'string', mandatory: true},
    {id: 'resource', as: 'string'},
    {id: 'id', as: 'string'},
    {id: 'filePath', as: 'string'},
    {id: 'version', as: 'number'},
    {id: 'body', as: 'object'},
    {id: 'roomWUrl', as: 'string', defaultValue: 'room://wonder-platform'},
    {id: 'baseUrl', as: 'string'},
    {id: 'request', dynamic: true, defaultValue: wonderPlatformMarketplaceRequest('%$method%', '%$wUrl%', {
      body: '%$body%',
      baseUrl: '%$baseUrl%'
    })}
  ],
  impl: (ctx, {}, {operation, resource, id, filePath, version, body, roomWUrl, baseUrl, request}) => {
    const apiResource = resource == 'subagents' ? 'agents' : resource, encodedId = encodeURIComponent(id || '')
    const file = String(filePath || '').split('/').map(encodeURIComponent).join('/')
    const routes = {
      health: ['GET', 'healthz'], list: ['GET', `${apiResource}/`], create: ['POST', `${apiResource}/`],
      get: ['GET', `${apiResource}/${encodedId}`], update: ['PUT', `${apiResource}/${encodedId}`],
      delete: ['DELETE', `${apiResource}/${encodedId}`], config: ['GET', `${apiResource}/${encodedId}/config.yaml`],
      document: ['GET', `${apiResource}/${encodedId}/${resource == 'skills' ? 'SKILL.md' : 'README.md'}`],
      references: ['GET', `${apiResource}/${encodedId}/references`],
      versions: ['GET', `${apiResource}/${encodedId}/versions`],
      version: ['GET', `${apiResource}/${encodedId}/versions/${version}`],
      asset: ['GET', `skills/${encodedId}/assets/${file}`],
      code: ['GET', `tools/${encodedId}/code/${file}`],
      audit: ['GET', `audit/${{tools: 'tool', skills: 'skill', plugins: 'plugin', agents: 'agent'}[apiResource]}/${encodedId}`],
      presignDownload: ['POST', 'presign/download'],
      presignUpload: ['POST', 'presign/upload'],
      createUser: ['POST', 'users/'],
      getUser: ['GET', `users/${id}`]
    }
    const [method, resourcePath] = routes[operation]
    const wUrl = `${roomWUrl.replace(/\/$/, '')}/${resourcePath}`
    return request(ctx.setVars({method, wUrl, body, baseUrl}))
  }
})

const { wonderPlatformMarketplaceCall } = dsls.common.data

Data('wonderPlatformMarketplaceManifest', {
  params: [
    {id: 'resource', as: 'string'},
    {id: 'item', as: 'object'},
    {id: 'operation', as: 'string', defaultValue: 'create'}
  ],
  impl: ({}, {}, {resource, item, operation}) => {
    const base = {id: item.id, display_name: item.name || item.id,
      description: item.apiDescription || item.desc || '', hebrew_description: item.desc || null, tags: item.tags || []}
    if (resource == 'plugins') return {...base, config: {skills: item.skillIds || [], tools: item.toolIds || []},
      readme: item.readme || ''}
    if (resource == 'subagents') return {...base, config: {system_prompt: item.instructions || '',
      backend_config: item.backendConfig || {harness_type: 'deepagents'}, plugins: item.pluginIds || [], skills: item.skillIds || [],
      tools: item.toolIds || [], sub_agents: item.subagentIds || []}, ...(operation == 'create' ? {readme: item.readme || ''} : {})}
    if (resource == 'skills') return {...base, min_agent_version: item.minAgentVersion || null, license: item.license || null,
      skill_md: item.content || '', assets: item.assets || []}
    const {tags, ...toolBase} = base
    return {...toolBase, tool_type: item.toolType || item.tool_type || 'code', json_schema: item.jsonSchema || {},
      is_async: item.isAsync ?? true, tracable: item.tracable ?? true, dedicated_tool_config: item.dedicatedToolConfig || {},
      code_files: item.codeFiles || []}
  }
})

Data('wonderPlatformMarketplaceItem', {
  params: [
    {id: 'resource', as: 'string'},
    {id: 'item', as: 'object'}
  ],
  impl: ({}, {}, {resource, item}) => {
    const config = item.config || {}, id = item.id, name = item.display_name || id
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
    {id: 'roomWUrl', as: 'string', defaultValue: 'room://wonder-platform'},
    {id: 'baseUrl', as: 'string'},
    {id: 'call', dynamic: true, defaultValue: wonderPlatformMarketplaceCall('list', '%$resource%', {
      roomWUrl: '%$roomWUrl%',
      baseUrl: '%$baseUrl%'
    })}
  ],
  impl: async (ctx, {}, {roomWUrl, baseUrl, call}) => Object.fromEntries(await Promise.all(
    ['plugins', 'skills', 'tools', 'subagents'].map(async resource =>
      [resource, await call(ctx.setVars({resource, roomWUrl, baseUrl}))])
  ))
})

const { wonderPlatformMarketplaceItem, wonderPlatformMarketplaceLoad, wonderPlatformSeed } = dsls.common.data

Data('wonderPlatformMarketplaceRepository', {
  params: [
    {id: 'roomWUrl', as: 'string', defaultValue: 'room://wonder-platform'},
    {id: 'baseUrl', as: 'string'},
    {id: 'seed', dynamic: true, defaultValue: wonderPlatformSeed()},
    {id: 'load', dynamic: true, defaultValue: wonderPlatformMarketplaceLoad('%$roomWUrl%', '%$baseUrl%')},
    {id: 'normalize', dynamic: true, defaultValue: wonderPlatformMarketplaceItem('%$resource%', '%$item%')}
  ],
  impl: async (ctx, {}, {roomWUrl, baseUrl, seed, load, normalize}) => {
    const catalog = await load(ctx.setVars({roomWUrl, baseUrl}))
    return {...seed(ctx), ...Object.fromEntries(Object.entries(catalog).map(([resource, items]) =>
      [resource, items.map(item => normalize(ctx.setVars({resource, item})))])), marketplace: true}
  }
})

Data('wonderPlatformMarketplaceDetail', {
  params: [
    {id: 'resource', as: 'string', mandatory: true},
    {id: 'id', as: 'string', mandatory: true},
    {id: 'roomWUrl', as: 'string', defaultValue: 'room://wonder-platform'},
    {id: 'baseUrl', as: 'string'},
    {id: 'call', dynamic: true, defaultValue: wonderPlatformMarketplaceCall('%$operation%', '%$resource%', {
      id: '%$id%',
      roomWUrl: '%$roomWUrl%',
      baseUrl: '%$baseUrl%'
    })},
    {id: 'normalize', dynamic: true, defaultValue: wonderPlatformMarketplaceItem('%$resource%', '%$manifest%')}
  ],
  impl: async (ctx, {}, {resource, id, roomWUrl, baseUrl, call, normalize}) => {
    const run = (operation, vars = {}) => call(ctx.setVars({operation, resource, id, roomWUrl, baseUrl, ...vars}))
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
    {id: 'agentId', as: 'string', mandatory: true},
    {id: 'message', as: 'string', mandatory: true},
    {id: 'sessionId', as: 'string', mandatory: true},
    {id: 'roomWUrl', as: 'string', defaultValue: 'room://wonder-platform'},
    {id: 'baseUrl', as: 'string'},
    {id: 'token', as: 'string'}
  ],
  impl: async (ctx, {}, {agentId, message, sessionId, roomWUrl, baseUrl, token}) => {
    const body = new FormData()
    Object.entries({message, session_id: sessionId, user_id: 'wonder-platform', stream: 'false'})
      .forEach(([key, value]) => body.append(key, value))
    const wUrl = `${roomWUrl.replace(/\/$/, '')}/agents/${encodeURIComponent(agentId)}/runs`
    const response = await jb.wonderUtils.wfetch2(wUrl, {
      method: 'POST',
      headers: token ? {Authorization: `Bearer ${token}`} : {},
      body
    }, ctx.setVars({marketplaceBaseUrl: baseUrl, agnoBaseUrl: baseUrl}))
    ctx.vars.agentOsLogger?.info?.({t: 'agentOsRun', agentId, sessionId, status: response.status}, {}, {ctx})
    if (!response.ok) throw new Error(`AgentOS ${response.status}: ${await response.text()}`)
    return response.json()
  }
})

const { wonderPlatformAgentOsRequest } = dsls.common.data

Data('wonderPlatformAgentOsRun', {
  params: [
    {id: 'text', as: 'string', mandatory: true},
    {id: 'target', as: 'object', mandatory: true},
    {id: 'sessionId', as: 'string', mandatory: true},
    {id: 'roomWUrl', as: 'string', defaultValue: 'room://wonder-platform'},
    {id: 'baseUrl', as: 'string'},
    {id: 'token', as: 'string'},
    {id: 'request', dynamic: true, defaultValue: wonderPlatformAgentOsRequest('%$agentId%', '%$text%', {
      sessionId: '%$sessionId%',
      roomWUrl: '%$roomWUrl%',
      baseUrl: '%$baseUrl%',
      token: '%$token%'
    })}
  ],
  impl: async (ctx, {}, {text, target, sessionId, roomWUrl, baseUrl, token, request}) => {
    const startedAt = Date.now(), run = await request(
      ctx.setVars({agentId: target.id, text, sessionId, roomWUrl, baseUrl, token}))
    const output = typeof run.content == 'string' ? run.content : JSON.stringify(run.content || '')
    const markers = [...output.matchAll(/\[\[report:([\w-]+)\]\]/g)]
    return {
      text: output.replace(/\s*\[\[report:[\w-]+\]\]/g, '').trim(),
      reportIds: [...new Set(markers.map(([, id]) => id))],
      followUps: [],
      status: String(run.status || '').toLowerCase().includes('fail') ? 'נכשל' : 'הושלם',
      duration: `${Math.max(1, Math.round((Date.now() - startedAt) / 1000))} שנ׳`,
      runId: run.run_id || run.runId,
      opikUrl: run.opik_url || run.trace_url,
      runtimeSteps: [{kind: 'AgentOS', title: target.name, runtime: true}]
    }
  }
})
