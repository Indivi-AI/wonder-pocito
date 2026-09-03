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
    || (globalThis.location ? `${location.protocol}//${location.hostname}:58046` : 'http://localhost:58046')).replace(/\/$/, '')
})

Data('wonderPlatformAgnoApiBase', {
  description: 'agent-run base: explicit baseUrl, else AGNO_API_URL, else agno on the page host at 7778',
  params: [
    {id: 'baseUrl', as: 'string'}
  ],
  impl: ({}, {}, {baseUrl}) => (baseUrl || globalThis.AGNO_API_URL || globalThis.process?.env?.AGNO_API_URL
    || (globalThis.location ? `${location.protocol}//${location.hostname}:58049` : 'http://localhost:58049')).replace(/\/$/, '')
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
    const input = opts.body || {}
    if (input.model) headers.set('x-wonder-model', input.model)
    let body, sessionId
    if (adhoc) {
      if (!String(input.message || '').trim()) return json({detail: 'message is required'}, 422)
      headers.set('content-type', 'application/json')
      body = JSON.stringify(input)
    } else if (method == 'POST') {
      if (!String(input.message || '').trim()) return json({detail: 'message is required'}, 422)
      sessionId = input.sessionId || `${agentId}-${Date.now()}`
      body = new FormData()
      Object.entries({message: input.message, session_id: sessionId, user_id: 'wonder-platform', stream: 'true'})
        .forEach(([key, value]) => body.append(key, value))
    }
    const upstream = await fetch(`${apiBase}${apiPath}`, {method, headers, ...(body ? {body} : {})})
    if (!upstream.ok) return upstream
    if (method == 'POST') {
      ctx.vars.agentLogger?.info?.({t: 'agentWUrl', harness, agentId, adhoc, method, status: upstream.status, streamed: true}, {}, {ctx})
      return upstream
    }
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
    {id: 'token', as: 'string'},
    {id: 'model', as: 'string', defaultValue: '%$selectedModel%'}
  ],
  impl: async (ctx, {}, {agentId, message, sessionId, roomWUrl, baseUrl, token, model}) => {
    const wUrl = `${roomWUrl.replace(/\/$/, '')}/agent/${encodeURIComponent(agentId)}?harness=agno`
    const response = await jb.wonderUtils.wfetch2(wUrl, {
      method: 'POST', headers: token ? {Authorization: `Bearer ${token}`} : {}, body: {message, sessionId, model}
    }, ctx.setVars({marketplaceBaseUrl: baseUrl, agnoBaseUrl: baseUrl}))
    if (!response.ok) throw new Error(`Agent ${response.status}: ${await response.text()}`)
    return response
  }
})

Data('wonderPlatformAgnoRunSteps', {
  description: 'real runtime trace: model thinking (reasoning_content) and tool calls with actual input/output, live while running',
  params: [{id: 'run', as: 'object', mandatory: true}],
  impl: ({}, {}, {run}) => {
    const reasoningSteps = (run.reasoning_steps || []).map(step => ({type: 'thinking', title: step.title || 'חשיבה',
      detail: [step.reasoning, step.action, step.result].filter(Boolean).join('\n')}))
    const thinking = reasoningSteps.length ? reasoningSteps
      : run.reasoning_content ? [{type: 'thinking', title: 'חשיבה', detail: run.reasoning_content,
        running: !run.reasoningDone && !run.done}] : []
    const tools = (run.tools || []).map(call => {
      const isSkill = call.tool_name?.startsWith('get_skill_')
      return {type: isSkill ? 'skill' : 'tool', title: isSkill ? call.tool_args?.skill_name || call.tool_name : call.tool_name,
        input: call.tool_args, output: call.result, error: call.tool_call_error || undefined, seconds: call.metrics?.duration,
        running: call.result == null && !call.tool_call_error}
    })
    return [...thinking, ...tools]
  }
})

Data('wonderPlatformSseFrames', {
  description: 'splits a raw text/event-stream chunk buffer into complete {type, data} frames, keeping the trailing partial frame',
  params: [{id: 'buffer', as: 'string', mandatory: true}],
  impl: ({}, {}, {buffer}) => {
    const parts = buffer.split('\n\n'), rest = parts.pop()
    const frames = parts.map(frame => {
      const type = frame.match(/^event: ?(.+)$/m)?.[1]
      const dataLines = frame.match(/^data: ?(.*)$/gm)?.map(line => line.replace(/^data: ?/, '')) || []
      try { return type && dataLines.length ? {type, data: JSON.parse(dataLines.join(''))} : null } catch { return null }
    }).filter(Boolean)
    return {frames, rest}
  }
})

const { wonderPlatformAgentWUrlRequest, wonderPlatformAgentWUrlResponse, wonderPlatformAgnoRunSteps,
  wonderPlatformSseFrames } = dsls.common.data

Data('wonderPlatformConsumeAgentRun', {
  description: 'reads a run response as it arrives: real event-stream if the server streamed, one shot if it returned plain JSON. ' +
    'Calls onUpdate(agnoRunState) after every event/chunk and again with the final state; always returns the final state.',
  params: [
    {id: 'response', as: 'object', mandatory: true},
    {id: 'onUpdate', asIs: true}
  ],
  impl: async (ctx, {}, {response, onUpdate}) => {
    const notify = state => { onUpdate?.(state); return state }
    if (!response.headers.get('content-type')?.includes('text/event-stream'))
      return notify({...(await response.json()), done: true})
    const reader = response.body.getReader(), decoder = new TextDecoder()
    let state = {tools: [], done: false}, buffer = ''
    const applyEvent = ({type, data}) => {
      if (type == 'RunStarted') state = {...state, run_id: data.run_id, session_id: data.session_id}
      else if (type == 'ToolCallStarted') state = {...state, tools: [...state.tools, data.tool]}
      else if (type == 'ToolCallCompleted' || type == 'ToolCallError')
        state = {...state, tools: state.tools.map(tool => tool.tool_call_id == data.tool.tool_call_id ? {...tool, ...data.tool} : tool)}
      else if (type == 'RunContent') state = {...state,
        content: (typeof state.content == 'string' ? state.content : '') + (data.content || ''),
        reasoning_content: (state.reasoning_content || '') + (data.reasoning_content || '')}
      else if (type == 'RunCompleted') state = {...state, content: data.content, reasoning_content: data.reasoning_content ?? state.reasoning_content,
        reasoning_steps: data.reasoning_steps, status: data.status, metrics: data.metrics, reasoningDone: true, done: true}
      else if (type == 'RunError') state = {...state, content: data.content, status: 'ERROR', done: true}
      notify(state)
    }
    while (true) {
      const {done, value} = await reader.read()
      if (done) break
      buffer += decoder.decode(value, {stream: true})
      const {frames, rest} = wonderPlatformSseFrames.$runWithCtx(ctx, {buffer})
      buffer = rest; frames.forEach(applyEvent)
    }
    return notify({...state, done: true})
  }
})
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
Data('wonderPlatformAgnoRunResult', {
  description: 'shapes one accumulated agno run (partial while streaming, final once done) into the UI-facing chat message shape',
  params: [{id: 'run', as: 'object', mandatory: true}, {id: 'startedAt', as: 'number', mandatory: true}],
  impl: (ctx, {}, {run, startedAt}) => ({
    harness: 'agno', text: dsls.common.data.wonderPlatformAgentContent.$runWithCtx(ctx, {content: run.content}),
    status: !run.done ? 'בהרצה…' : String(run.status || '').toLowerCase().includes('fail') || run.status == 'ERROR' ? 'נכשל' : 'הושלם',
    duration: `${Math.max(1, Math.round((Date.now() - startedAt) / 1000))} שנ׳`,
    runId: run.run_id || run.runId, sessionId: run.session_id || run.sessionId,
    opikUrl: run.opik_url || run.trace_url,
    runtimeSteps: wonderPlatformAgnoRunSteps.$runWithCtx(ctx, {run})
  })
})

const { wonderPlatformAgnoRunResult, wonderPlatformConsumeAgentRun } = dsls.common.data
Data('wonderPlatformRunAgent', {
  params: [
    {id: 'text', as: 'string', mandatory: true},
    {id: 'target', as: 'object', mandatory: true},
    {id: 'sessionId', as: 'string'},
    {id: 'roomWUrl', as: 'string', defaultValue: 'room://wonder-platform'},
    {id: 'baseUrl', as: 'string'},
    {id: 'token', as: 'string'},
    {id: 'onUpdate'},
    {id: 'request', dynamic: true, defaultValue: wonderPlatformAgentWUrlRequest('%$target/id%', '%$text%', {
      sessionId: '%$sessionId%',
      roomWUrl: '%$roomWUrl%',
      baseUrl: '%$baseUrl%',
      token: '%$token%'
    })}
  ],
  impl: async (ctx, {}, {text, target, sessionId, roomWUrl, baseUrl, token, onUpdate, request}) => {
    const startedAt = Date.now()
    const response = await request(ctx.setVars({text, target, sessionId, roomWUrl, baseUrl, token}))
    const run = await wonderPlatformConsumeAgentRun.$runWithCtx(ctx, {response,
      onUpdate: partial => onUpdate?.(wonderPlatformAgnoRunResult.$runWithCtx(ctx, {run: partial, startedAt}))})
    return wonderPlatformAgnoRunResult.$runWithCtx(ctx, {run, startedAt})
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
    {id: 'token', as: 'string'},
    {id: 'model', as: 'string', defaultValue: '%$selectedModel%'}
  ],
  impl: async (ctx, {}, {message, sessionId, skillIds, toolIds, knowledgeIds, pluginIds, roomWUrl, baseUrl, token, model}) => {
    const wUrl = `${roomWUrl.replace(/\/$/, '')}/adhoc/runs?harness=agno`
    const response = await jb.wonderUtils.wfetch2(wUrl, {
      method: 'POST', headers: token ? {Authorization: `Bearer ${token}`} : {},
      body: {message, session_id: sessionId, skills: skillIds, tools: toolIds, knowledge: knowledgeIds, plugins: pluginIds, model, stream: true}
    }, ctx.setVars({marketplaceBaseUrl: baseUrl, agnoBaseUrl: baseUrl}))
    if (!response.ok) throw new Error(`Adhoc run ${response.status}: ${await response.text()}`)
    return response
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
    {id: 'onUpdate'},
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
  impl: async (ctx, {}, {text, conversation, sessionId, roomWUrl, baseUrl, token, onUpdate, request}) => {
    const startedAt = Date.now()
    const response = await request(ctx.setVars({text, conversation, sessionId, roomWUrl, baseUrl, token}))
    const run = await wonderPlatformConsumeAgentRun.$runWithCtx(ctx, {response,
      onUpdate: partial => onUpdate?.(wonderPlatformAgnoRunResult.$runWithCtx(ctx, {run: partial, startedAt}))})
    return wonderPlatformAgnoRunResult.$runWithCtx(ctx, {run, startedAt})
  }
})
