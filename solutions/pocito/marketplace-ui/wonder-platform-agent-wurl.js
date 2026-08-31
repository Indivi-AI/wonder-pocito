import { dsls, jb } from '@jb6/core'
import '@jb6/common'
import '@wonder/db/db-drivers.js'

const { common: { Data } } = dsls

Data('wonderPlatformMarketplaceApiBase', {
  description: 'single source of truth: explicit baseUrl, else MARKETPLACE_API_URL, else marketplace on the page host at 7777',
  params: [
    {id: 'baseUrl', as: 'string'}
  ],
  impl: ({}, {}, {baseUrl}) => (baseUrl || globalThis.MARKETPLACE_API_URL || globalThis.process?.env?.MARKETPLACE_API_URL
    || (globalThis.location ? `${location.protocol}//${location.hostname}:7777` : 'http://localhost:7777')).replace(/\/$/, '')
})

Data('wonderPlatformAgnoApiBase', {
  description: 'agent-run base: explicit baseUrl, else AGNO_API_URL, else agno on the page host at 7778',
  params: [
    {id: 'baseUrl', as: 'string'}
  ],
  impl: ({}, {}, {baseUrl}) => (baseUrl || globalThis.AGNO_API_URL || globalThis.process?.env?.AGNO_API_URL
    || (globalThis.location ? `${location.protocol}//${location.hostname}:7778` : 'http://localhost:7778')).replace(/\/$/, '')
})

const { wonderPlatformAgnoApiBase, wonderPlatformMarketplaceApiBase } = dsls.common.data

Data('wonderPlatformAgentContent', {
  params: [{id: 'content'}],
  impl: ({}, {}, {content}) => {
    let value = content
    for (let depth = 0; depth < 3; depth++) {
      if (typeof value == 'string') {
        try { value = JSON.parse(value) } catch { return value.trim() }
      } else {
        const nested = value?.text ?? value?.answer ?? value?.message ?? value?.content
        if (nested == null) break
        value = nested
      }
    }
    return typeof value == 'string' ? value.trim() : Object.entries(value || {}).map(([key, item]) =>
      `${key}: ${Array.isArray(item) && !item.length ? '—' : typeof item == 'object' ? JSON.stringify(item) : item}`).join('\n')
  }
})

Data('wonderPlatformAgentWUrlResponse', {
  params: [
    {id: 'url', as: 'string', mandatory: true},
    {id: 'fileName', as: 'string', mandatory: true},
    {id: 'opts', as: 'object', defaultValue: {}},
    {id: 'baseUrl', as: 'string'},
    {id: 'agnoBaseUrl', as: 'string'},
    {id: 'resolveApiBase', dynamic: true, defaultValue: wonderPlatformMarketplaceApiBase('%$baseUrl%')},
    {id: 'resolveAgnoBase', dynamic: true, defaultValue: wonderPlatformAgnoApiBase('%$agnoBaseUrl%')}
  ],
  impl: async (ctx, {}, {url, fileName, opts, baseUrl, agnoBaseUrl, resolveApiBase, resolveAgnoBase}) => {
    const match = String(fileName).match(/^agent\/([^/]+)$/), adhoc = fileName == 'adhoc/runs'
    if (!match && !adhoc) return
    const method = (opts.method || 'GET').toUpperCase(), harness = new URL(url).searchParams.get('harness')
    const agentId = match && decodeURIComponent(match[1])
    const json = (payload, status = 200) => {
      ctx.vars.agentLogger?.info?.({t: 'agentWUrl', harness, agentId, adhoc, method, status}, {}, {ctx})
      return new Response(JSON.stringify(payload), {status, headers: {'content-type': 'application/json'}})
    }
    if (harness != 'agno') return json({detail: 'harness must be agno'}, 400)
    if (adhoc ? method != 'POST' : !['GET', 'POST'].includes(method)) return json({detail: `Method ${method} not allowed`}, 405)
    const apiBase = adhoc || method == 'POST' ? resolveAgnoBase(ctx.setVars({agnoBaseUrl})) : resolveApiBase(ctx.setVars({baseUrl}))
    const apiPath = adhoc ? '/adhoc/runs' : method == 'GET' ? `/api/v1/agents/${encodeURIComponent(agentId)}`
      : `/agents/${encodeURIComponent(agentId)}/runs`
    const headers = new Headers(opts.headers || {})
    headers.delete('content-type')
    headers.set('x-wonder-room', ctx.vars.roomId)
    let body, sessionId
    if (adhoc) {
      const input = opts.body || {}
      if (!String(input.message || '').trim()) return json({detail: 'message is required'}, 422)
      headers.set('content-type', 'application/json')
      body = JSON.stringify(input)
    } else if (method == 'POST') {
      const input = opts.body || {}
      if (!String(input.message || '').trim()) return json({detail: 'message is required'}, 422)
      sessionId = input.sessionId || `${agentId}-${Date.now()}`
      body = new FormData()
      Object.entries({message: input.message, session_id: sessionId, user_id: 'wonder-platform', stream: 'false'})
        .forEach(([key, value]) => body.append(key, value))
    }
    const upstream = await fetch(`${apiBase}${apiPath}`, {method, headers, ...(body ? {body} : {})})
    if (!upstream.ok) return upstream
    return json({...(await upstream.json()), harness, ...(agentId ? {agentId} : {}), ...(sessionId ? {sessionId} : {})}, upstream.status)
  }
})
Data('wonderPlatformAgentWUrlRequest', {
  params: [
    {id: 'agentId', as: 'string', mandatory: true},
    {id: 'message', as: 'string', mandatory: true},
    {id: 'sessionId', as: 'string'},
    {id: 'roomWUrl', as: 'string', defaultValue: 'room://wonder-platform'},
    {id: 'baseUrl', as: 'string'},
    {id: 'token', as: 'string'}
  ],
  impl: async (ctx, {}, {agentId, message, sessionId, roomWUrl, baseUrl, token}) => {
    const wUrl = `${roomWUrl.replace(/\/$/, '')}/agent/${encodeURIComponent(agentId)}?harness=agno`
    const response = await jb.wonderUtils.wfetch2(wUrl, {
      method: 'POST', headers: token ? {Authorization: `Bearer ${token}`} : {}, body: {message, sessionId}
    }, ctx.setVars({marketplaceBaseUrl: baseUrl, agnoBaseUrl: baseUrl}))
    if (!response.ok) throw new Error(`Agent ${response.status}: ${await response.text()}`)
    return response.json()
  }
})

const { wonderPlatformAgentWUrlRequest, wonderPlatformAgentWUrlResponse } = dsls.common.data
Data('wonderPlatformWUrlResponse', {
  params: [
    {id: 'url', as: 'string', mandatory: true},
    {id: 'fileName', as: 'string', mandatory: true},
    {id: 'opts', as: 'object', defaultValue: {}},
    {id: 'baseUrl', as: 'string'},
    {id: 'agnoBaseUrl', as: 'string'},
    {id: 'resolveApiBase', dynamic: true, defaultValue: wonderPlatformMarketplaceApiBase('%$baseUrl%')},
    {id: 'resolveAgnoBase', dynamic: true, defaultValue: wonderPlatformAgnoApiBase('%$agnoBaseUrl%')},
    {id: 'agentResponse', dynamic: true, defaultValue: wonderPlatformAgentWUrlResponse('%$url%', '%$fileName%', {
      opts: '%$opts%',
      baseUrl: '%$baseUrl%',
      agnoBaseUrl: '%$agnoBaseUrl%'
    })}
  ],
  impl: async (ctx, {}, {url, fileName, opts, baseUrl, agnoBaseUrl, resolveApiBase, resolveAgnoBase, agentResponse}) => {
    const agent = await agentResponse(ctx.setVars({url, fileName, opts, baseUrl, agnoBaseUrl}))
    if (agent) return agent
    let path = String(fileName || '').replace(/^\/+/, '')
    if (!/^(healthz$|plugins(?:\/|$)|skills(?:\/|$)|tools(?:\/|$)|agents(?:\/|$)|subagents(?:\/|$)|knowledge(?:\/|$)|audit(?:\/|$)|presign(?:\/|$)|users(?:\/|$))/.test(path))
      return
    path = path.replace(/^subagents(?=\/|$)/, 'agents')
    const query = url.includes('?') ? `?${url.split('?').slice(1).join('?')}` : ''
    const runtime = /^agents\/[^/]+\/runs$/.test(path)
    const apiPath = path == 'healthz' ? '/healthz' : runtime ? `/${path}` : `/api/v1/${path}`
    const method = (opts.method || 'GET').toUpperCase(), body = opts.body
    const hasBody = !['GET', 'HEAD'].includes(method) && body != null
    const isForm = typeof FormData != 'undefined' && body instanceof FormData
    const isJson = hasBody && typeof body == 'object' && !isForm && !(body instanceof ArrayBuffer) && !(body instanceof Blob)
    const headers = new Headers(opts.headers || {})
    if (isJson) headers.set('Content-Type', 'application/json')
    headers.set('x-wonder-room', ctx.vars.roomId)
    const apiBase = runtime ? resolveAgnoBase(ctx.setVars({agnoBaseUrl})) : resolveApiBase(ctx.setVars({baseUrl}))
    const response = await fetch(`${apiBase}${apiPath}${query}`, {
      method, headers, ...(hasBody ? {body: isJson ? JSON.stringify(body) : body} : {})
    })
    ctx.vars.marketplaceLogger?.info?.({t: 'marketplaceWUrl', url, apiPath, method, status: response.status}, {}, {ctx})
    return response
  }
})
Data('wonderPlatformRunAgent', {
  params: [
    {id: 'text', as: 'string', mandatory: true},
    {id: 'target', as: 'object', mandatory: true},
    {id: 'sessionId', as: 'string'},
    {id: 'roomWUrl', as: 'string', defaultValue: 'room://wonder-platform'},
    {id: 'baseUrl', as: 'string'},
    {id: 'token', as: 'string'},
    {id: 'request', dynamic: true, defaultValue: wonderPlatformAgentWUrlRequest('%$target/id%', '%$text%', {
      sessionId: '%$sessionId%',
      roomWUrl: '%$roomWUrl%',
      baseUrl: '%$baseUrl%',
      token: '%$token%'
    })}
  ],
  impl: async (ctx, {}, {text, target, sessionId, roomWUrl, baseUrl, token, request}) => {
    const startedAt = Date.now(), run = await request(ctx.setVars({
      text, target, sessionId, roomWUrl, baseUrl, token
    }))
    return {
      harness: 'agno', text: dsls.common.data.wonderPlatformAgentContent.$run(run.content),
      status: String(run.status || '').toLowerCase().includes('fail') ? 'נכשל' : 'הושלם',
      duration: `${Math.max(1, Math.round((Date.now() - startedAt) / 1000))} שנ׳`,
      runId: run.run_id || run.runId, sessionId: run.sessionId,
      opikUrl: run.opik_url || run.trace_url,
      runtimeSteps: [{kind: 'AgentOS', title: target.name, runtime: true}]
    }
  }
})

Data('wonderPlatformAdhocRunRequest', {
  params: [
    {id: 'message', as: 'string', mandatory: true},
    {id: 'sessionId', as: 'string'},
    {id: 'skillIds', as: 'array', defaultValue: []},
    {id: 'toolIds', as: 'array', defaultValue: []},
    {id: 'knowledgeIds', as: 'array', defaultValue: []},
    {id: 'pluginIds', as: 'array', defaultValue: []},
    {id: 'roomWUrl', as: 'string', defaultValue: 'room://wonder-platform'},
    {id: 'baseUrl', as: 'string'},
    {id: 'token', as: 'string'}
  ],
  impl: async (ctx, {}, {message, sessionId, skillIds, toolIds, knowledgeIds, pluginIds, roomWUrl, baseUrl, token}) => {
    const wUrl = `${roomWUrl.replace(/\/$/, '')}/adhoc/runs?harness=agno`
    const response = await jb.wonderUtils.wfetch2(wUrl, {
      method: 'POST', headers: token ? {Authorization: `Bearer ${token}`} : {},
      body: {message, session_id: sessionId, skills: skillIds, tools: toolIds, knowledge: knowledgeIds, plugins: pluginIds}
    }, ctx.setVars({marketplaceBaseUrl: baseUrl, agnoBaseUrl: baseUrl}))
    if (!response.ok) throw new Error(`Adhoc run ${response.status}: ${await response.text()}`)
    return response.json()
  }
})

const { wonderPlatformAdhocRunRequest } = dsls.common.data
Data('wonderPlatformRunAdhoc', {
  params: [
    {id: 'text', as: 'string', mandatory: true},
    {id: 'conversation', as: 'object', mandatory: true},
    {id: 'sessionId', as: 'string'},
    {id: 'roomWUrl', as: 'string', defaultValue: 'room://wonder-platform'},
    {id: 'baseUrl', as: 'string'},
    {id: 'token', as: 'string'},
    {id: 'request', dynamic: true, defaultValue: wonderPlatformAdhocRunRequest('%$text%', {
      sessionId: '%$sessionId%',
      skillIds: '%$conversation/skillIds%',
      toolIds: '%$conversation/toolIds%',
      knowledgeIds: '%$conversation/knowledgeIds%',
      pluginIds: '%$conversation/pluginIds%',
      roomWUrl: '%$roomWUrl%',
      baseUrl: '%$baseUrl%',
      token: '%$token%'
    })}
  ],
  impl: async (ctx, {}, {text, conversation, sessionId, roomWUrl, baseUrl, token, request}) => {
    const startedAt = Date.now(), run = await request(ctx.setVars({text, conversation, sessionId, roomWUrl, baseUrl, token}))
    return {
      harness: 'agno', text: dsls.common.data.wonderPlatformAgentContent.$run(run.content),
      status: String(run.status || '').toLowerCase().includes('fail') ? 'נכשל' : 'הושלם',
      duration: `${Math.max(1, Math.round((Date.now() - startedAt) / 1000))} שנ׳`,
      runId: run.run_id || run.runId, sessionId: run.session_id || run.sessionId,
      opikUrl: run.opik_url || run.trace_url,
      runtimeSteps: [{kind: 'AgentOS', title: 'הרצה ללא סוכן', runtime: true}]
    }
  }
})
