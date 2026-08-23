import { dsls, jb } from '@jb6/core'
import '@jb6/common'
import '@wonder/db/db-drivers.js'
import './wonder-platform-repository.js'
import './wonder-platform-runtime.js'

const { common: { Data, data: { wonderPlatformAnswer, wonderPlatformLoadRepository } } } = dsls

Data('wonderPlatformAgentWUrlResponse', {
  params: [
    {id: 'url', as: 'string', mandatory: true},
    {id: 'fileName', as: 'string', mandatory: true},
    {id: 'opts', as: 'object', defaultValue: {}},
    {id: 'baseUrl', as: 'string'},
    {id: 'loadRepository', dynamic: true, defaultValue: wonderPlatformLoadRepository('%$roomWUrl%')},
    {id: 'runLlmFlow', dynamic: true, defaultValue: wonderPlatformAnswer('%$message%', '%$target%', {
      repo: '%$repo%',
      history: '%$history%',
      roomWUrl: '%$roomWUrl%'
    })}
  ],
  impl: async (ctx, {}, {url, fileName, opts, baseUrl, loadRepository, runLlmFlow}) => {
    const match = String(fileName).match(/^agent\/([^/]+)$/)
    if (!match) return
    const method = (opts.method || 'GET').toUpperCase(), harness = new URL(url).searchParams.get('harness')
    const json = (payload, status = 200) => {
      ctx.vars.agentLogger?.info?.({t: 'agentWUrl', harness, agentId, method, status}, {}, {ctx})
      return new Response(JSON.stringify(payload), {status, headers: {'content-type': 'application/json'}})
    }
    const agentId = decodeURIComponent(match[1])
    if (!['agno', 'llmflow'].includes(harness)) return json({detail: 'harness must be agno or llmflow'}, 400)
    if (!['GET', 'POST'].includes(method)) return json({detail: `Method ${method} not allowed`}, 405)
    const roomWUrl = String(url).split('?')[0].replace(/\/agent\/[^/]+$/, '')
    if (harness == 'llmflow') {
      const repo = ctx.vars.agentRepo || await loadRepository(ctx.setVars({roomWUrl}))
      const target = ctx.vars.agentTarget?.id == agentId ? ctx.vars.agentTarget
        : repo.subagents?.find(item => item.id == agentId) || repo.plugins?.find(item => item.id == agentId)
      if (!target) return json({detail: `Agent ${agentId} not found`}, 404)
      if (method == 'GET') return json({harness, agentId, agent: target})
      const body = opts.body || {}
      if (!String(body.message || '').trim()) return json({detail: 'message is required'}, 422)
      const result = await runLlmFlow(ctx.setVars({roomWUrl, repo, target,
        message: body.message, history: body.history || []}))
      return json({...result, harness, agentId})
    }
    const apiBase = (baseUrl || globalThis.MARKETPLACE_API_URL || globalThis.process?.env?.MARKETPLACE_API_URL
      || 'http://localhost:7777').replace(/\/$/, '')
    const apiPath = method == 'GET' ? `/api/v1/agents/${encodeURIComponent(agentId)}`
      : `/agents/${encodeURIComponent(agentId)}/runs`
    const headers = new Headers(opts.headers || {})
    headers.delete('content-type')
    headers.set('x-wonder-room', ctx.vars.roomId)
    let body, sessionId
    if (method == 'POST') {
      const input = opts.body || {}
      if (!String(input.message || '').trim()) return json({detail: 'message is required'}, 422)
      sessionId = input.sessionId || `${agentId}-${Date.now()}`
      body = new FormData()
      Object.entries({message: input.message, session_id: sessionId, user_id: 'wonder-platform', stream: 'false'})
        .forEach(([key, value]) => body.append(key, value))
    }
    const upstream = await fetch(`${apiBase}${apiPath}`, {method, headers, ...(body ? {body} : {})})
    if (!upstream.ok) return upstream
    return json({...(await upstream.json()), harness, agentId, ...(method == 'POST' ? {sessionId} : {})}, upstream.status)
  }
})
Data('wonderPlatformAgentWUrlRequest', {
  params: [
    {id: 'agentId', as: 'string', mandatory: true},
    {id: 'message', as: 'string', mandatory: true},
    {id: 'harness', as: 'string', options: 'agno,llmflow', mandatory: true},
    {id: 'sessionId', as: 'string'},
    {id: 'history', as: 'array', defaultValue: []},
    {id: 'roomWUrl', as: 'string', defaultValue: 'room://wonder-platform'},
    {id: 'baseUrl', as: 'string', defaultValue: 'http://localhost:7777'},
    {id: 'token', as: 'string'},
    {id: 'repo', as: 'object'},
    {id: 'target', as: 'object'}
  ],
  impl: async (ctx, {}, {agentId, message, harness, sessionId, history, roomWUrl, baseUrl, token, repo, target}) => {
    const wUrl = `${roomWUrl.replace(/\/$/, '')}/agent/${encodeURIComponent(agentId)}?harness=${harness}`
    const response = await jb.wonderUtils.wfetch2(wUrl, {
      method: 'POST', headers: token ? {Authorization: `Bearer ${token}`} : {}, body: {message, sessionId, history}
    }, ctx.setVars({marketplaceBaseUrl: baseUrl, agentRepo: repo, agentTarget: target}))
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
    {id: 'agentResponse', dynamic: true, defaultValue: wonderPlatformAgentWUrlResponse('%$url%', '%$fileName%', {
      opts: '%$opts%',
      baseUrl: '%$baseUrl%'
    })}
  ],
  impl: async (ctx, {}, {url, fileName, opts, baseUrl, agentResponse}) => {
    const agent = await agentResponse(ctx.setVars({url, fileName, opts, baseUrl}))
    if (agent) return agent
    let path = String(fileName || '').replace(/^\/+/, '')
    if (!/^(healthz$|plugins(?:\/|$)|skills(?:\/|$)|tools(?:\/|$)|agents(?:\/|$)|subagents(?:\/|$)|audit(?:\/|$)|presign(?:\/|$)|users(?:\/|$))/.test(path))
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
    const apiBase = (baseUrl || globalThis.MARKETPLACE_API_URL || globalThis.process?.env?.MARKETPLACE_API_URL
      || 'http://localhost:7777').replace(/\/$/, '')
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
    {id: 'history', as: 'array', defaultValue: []},
    {id: 'roomWUrl', as: 'string', defaultValue: 'room://wonder-platform'},
    {id: 'baseUrl', as: 'string', defaultValue: 'http://localhost:7777'},
    {id: 'token', as: 'string'},
    {id: 'repo', as: 'object'},
    {id: 'harness', as: 'string'},
    {id: 'request', dynamic: true, defaultValue: wonderPlatformAgentWUrlRequest('%$target/id%', '%$text%', {
      harness: '%$selectedHarness%',
      sessionId: '%$sessionId%',
      history: '%$history%',
      roomWUrl: '%$roomWUrl%',
      baseUrl: '%$baseUrl%',
      token: '%$token%',
      repo: '%$repo%',
      target: '%$target%'
    })}
  ],
  impl: async (ctx, {}, {text, target, sessionId, history, roomWUrl, baseUrl, token, repo, harness, request}) => {
    const selectedHarness = harness || target.backendConfig?.harness
      || (target.backendConfig?.harness_type == 'llmflow' ? 'llmflow' : 'agno')
    const startedAt = Date.now(), run = await request(ctx.setVars({
      text, target, sessionId, history, roomWUrl, baseUrl, token, repo, selectedHarness
    }))
    if (run.harness == 'llmflow') return run
    const output = typeof run.content == 'string' ? run.content : JSON.stringify(run.content || '')
    const markers = [...output.matchAll(/\[\[report:([\w-]+)\]\]/g)]
    return {
      harness: 'agno', text: output.replace(/\s*\[\[report:[\w-]+\]\]/g, '').trim(),
      reportIds: [...new Set(markers.map(([, id]) => id))],
      status: String(run.status || '').toLowerCase().includes('fail') ? 'נכשל' : 'הושלם',
      duration: `${Math.max(1, Math.round((Date.now() - startedAt) / 1000))} שנ׳`,
      runId: run.run_id || run.runId, sessionId: run.sessionId,
      opikUrl: run.opik_url || run.trace_url,
      runtimeSteps: [{kind: 'AgentOS', title: target.name, runtime: true}]
    }
  }
})
