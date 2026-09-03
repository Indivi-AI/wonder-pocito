import { coreUtils } from '@jb6/core'
import { auth } from '@wonder/db/auth.js'

const loggerOf = ctx => ctx.vars.workflowLogger || ctx.vars.aiLogger

function decode(value) {
    if (!value) return ''
    if (typeof Buffer !== 'undefined') return Buffer.from(value).toString('utf-8')
    if (globalThis.TextDecoder) return new TextDecoder('utf-8').decode(value)
    if (globalThis.builtIn?.util) return new globalThis.builtIn.util.TextDecoder('utf-8').decode(value)
    throw new Error('No text decoder available')
}

const DEFAULT_MODEL = 'groq/openai/gpt-oss-120b'
const MODEL_ALIASES = {
  'gcp/gemma-4-31b-it': 'gemini/gemma-4-31b-it',
  'gcp/gemma-4-26b-a4b-it': 'gemini/gemma-4-26b-a4b-it',
  'qwen/qwen3-32b': 'openrouter/qwen/qwen3-32b'
}

const PROVIDER_URLS = {
  anthropic: () => 'https://api.anthropic.com/v1/messages',
  openrouter: () => 'https://openrouter.ai/api/v1/chat/completions',
  groq: () => 'https://api.groq.com/openai/v1/chat/completions',
  openai: () => 'https://api.openai.com/v1/chat/completions',
  gemini: model => `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
  chrome: () => null   // Chrome built-in Gemini Nano (Prompt API) - on-device, no endpoint
}

export const getProviderConfig = (modelString, proxyAlias) => {
  if (proxyAlias) return {provider: 'openai', model: modelString, url: PROVIDER_URLS.openai()}
  const [provider, ...rest] = (MODEL_ALIASES[modelString] || modelString).split('/')
  const model = rest.join('/')
  const urlFn = PROVIDER_URLS[provider]
  if (!urlFn) throw new Error(`Unknown provider: ${provider}`)
  return { provider, model, url: urlFn(model) }
}

const usageOf = val => val?.usage || val?.message?.usage || val?.usageMetadata || {}
const num = (...xs) => xs.reduce((r, x) => r ?? (x != null && Number.isFinite(+x) ? +x : null), null)
const tokenStatsOf = (u = {}) => {
  const d = u.prompt_tokens_details || u.promptTokensDetails || {}
  return {
    inputTokens: num(u.input_tokens, u.prompt_tokens, u.promptTokenCount),
    outputTokens: num(u.output_tokens, u.completion_tokens, u.candidatesTokenCount),
    cacheCreationInputTokens: num(u.cache_creation_input_tokens, d.cache_write_tokens),
    cacheReadInputTokens: num(u.cache_read_input_tokens, d.cached_tokens, u.cachedContentTokenCount)
  }
}
const cacheTokenFields = u => Object.fromEntries(Object.entries(tokenStatsOf(u)).filter(([k, v]) => k.startsWith('cache') && v != null))
const cacheLogFields = ({provider, model, goal, inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens, tokenCount}) => {
  cacheCreationInputTokens ||= 0; cacheReadInputTokens ||= 0
  const uncachedInputTokens = inputTokens ?? tokenCount ?? 0
  const totalInputTokens = provider == 'anthropic'
    ? uncachedInputTokens + cacheCreationInputTokens + cacheReadInputTokens : uncachedInputTokens
  return { goal, provider, model, inputTokens: uncachedInputTokens, totalInputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens,
    cacheSavedInputTokens: cacheReadInputTokens, cacheUsedInputTokens: cacheReadInputTokens, cacheWriteInputTokens: cacheCreationInputTokens,
    cacheHitRatePct: totalInputTokens ? Math.round(cacheReadInputTokens * 1000 / totalInputTokens) / 10 : 0 }
}
const tokenLimitParam = (provider, model) => provider == 'openai' && /^(gpt-5|o\d)/.test(model) ? 'max_completion_tokens' : 'max_tokens'
const stripSourceRefs = val => typeof val == 'string' ? (coreUtils.sourceRefs?.strip?.(val) || val.replace(/<!--\/?sourceRef:[^>]+-->\n?/g, ''))
  : Array.isArray(val) ? val.map(stripSourceRefs) : val && typeof val == 'object' ? Object.fromEntries(Object.entries(val).map(([k,v]) => [k, stripSourceRefs(v)])) : val

export const buildRequestBody = (model, messages, maxTokens, temperature, instructions, context, provider, thinkingBudget, responseSchema, userRequestId) => {
  const maxTokensOpt = maxTokens == null ? {} : { [tokenLimitParam(provider, model)]: maxTokens }
  const replyInstruction = `reply based on the instructions and the context you received, to best answer the users message. `
    + `use minimal amount of tokens${maxTokens == null ? '' : ` and you have a max of ${maxTokens} tokens`}.`
  const systemContent = [instructions, context && `accumulatedContext: ${context}`, replyInstruction].filter(Boolean).join('\n\n')
  const messagesWithSystem = systemContent ? [{role: "system", content: systemContent}, ...messages] : messages
  const request = body => ({ messages: messagesWithSystem, body: stripSourceRefs(body) })
  if (provider === 'gemini') {
    return request({
      contents: messages.map(m => ({role: m.role === 'assistant' ? 'model' : 'user', parts: [{text: m.content}]})),
      systemInstruction: systemContent ? {parts: [{text: systemContent}]} : undefined,
      generationConfig: {
        ...(maxTokens == null ? {} : {maxOutputTokens: maxTokens}), temperature,
        // gemma-4 400s on thinkingBudget and ignores includeThoughts:false - its only knob is thinkingLevel; gemini needs includeThoughts to return thought parts
        ...(thinkingBudget != null && {thinkingConfig: /gemma/.test(model)
          ? {thinkingLevel: thinkingBudget == 0 ? 'MINIMAL' : 'HIGH'}
          : {thinkingBudget, ...(thinkingBudget > 0 && {includeThoughts: true})}}),
        ...(responseSchema && {responseMimeType: 'application/json', responseSchema})
      }
    })
  }
  if (provider === 'anthropic') {
    const noTemperature = /opus-4-8|sonnet-5|fable|mythos/.test(model)   // newer anthropic models 400 on the deprecated temperature param
    return request({
      model, stream: true, ...maxTokensOpt, ...(noTemperature ? {} : { temperature }), messages,
      ...(userRequestId && {metadata: {user_id: userRequestId}}),
      cache_control: {type: 'ephemeral'},
      ...(thinkingBudget > 0 && {thinking: {type: 'enabled', budget_tokens: thinkingBudget}}),
      system: [
        ...(instructions ? [{type: 'text', text: instructions, cache_control: {type: 'ephemeral'}}] : []),
        ...(context ? [{type: 'text', text: `accumulatedContext: ${context}`}] : []),
        {type: 'text', text: replyInstruction}
      ]
    })
  }
  const responseFormat = responseSchema && { response_format: { type: 'json_schema', json_schema: { name: 'response', schema: responseSchema } } }
  const noThinking = thinkingBudget === 0, openAiGpt5 = provider === 'openai' && /^gpt-5/.test(model)
  const reasoning = noThinking && openAiGpt5 ? { reasoning_effort: 'minimal' }
    : noThinking && provider === 'openrouter' ? { reasoning: { effort: 'low', exclude: true } }
    : noThinking && provider === 'groq' && /^openai\/gpt-oss/.test(model) ? { include_reasoning: false, reasoning_effort: 'low' } : {}
  const usageOpt = provider === 'openrouter' ? { usage: { include: true } } : { stream_options: { include_usage: true } }
  const body = { model, stream: true, ...maxTokensOpt, ...(openAiGpt5 ? {} : {temperature}),
    messages: messagesWithSystem, ...usageOpt, ...responseFormat, ...reasoning,
    ...(userRequestId && {user: userRequestId}) }
  return request(body)
}

const countTokens = async ({messages, instructions = '', context = ''}) => {
  try {
    const systemContent = [instructions, context].filter(Boolean).join('\n\n')
    const allMessages = systemContent ? [{role: 'system', content: systemContent}, ...messages] : messages
    const totalChars = allMessages.reduce((sum, m) => sum + (m.content?.length || 0), 0)
    return Math.ceil(totalChars / 4)
  } catch (error) {
    console.error('error counting tokens', error.message)
    return null
  }
}

export async function fetchItemsFromLLMReactive({messages, goal, prompt, instructions, context, progressiveHandler = {}, onDone,
  onChunk, model: modelString = DEFAULT_MODEL, maxTokens = 10000, temperature = 0.0, thinkingBudget, responseSchema,
  userId, roomId, passedContext = {}, contentType, inputOrigins, ctx}) {
    const {provider, model, url} = getProviderConfig(modelString, ctx.vars.selectedModel == modelString)
    const logger = loggerOf(ctx)
    const {categories, userRequestId} = ctx.vars
    if (ctx.vars.llmAbortFlag?.aborted) {   // run aborted by the user - skip the remaining llm calls so the flow completes fast and the bigLog is still written
      logger?.info?.({t: `${goal}: skipped - llm run aborted`, model}, {}, {ctx})
      return '{}'
    }
    logger.step?.('llm', `Using LLM (${modelString}): ${goal}...`)
    messages = messages || [{role: "user", content: prompt}]
    const llmInput = {goal, model: modelString, messages, instructions, context, maxTokens, temperature, thinkingBudget, responseSchema,
      ...(inputOrigins && {inputOrigins})}

    const llmStart = Date.now()
    if (provider === 'chrome') {   // Chrome built-in Gemini Nano (Prompt API, chrome 138+ desktop) - runs on-device in the browser, no fetch
      const LM = globalThis.LanguageModel
      const fail = reason => { ctx.vars.errorLogger.error({t: `${goal}: chrome built-in llm failed`, reason, model}, {}, {ctx})
        logger.status?.(`gemini nano: ${reason}`); logger.stepDone?.('llm'); onDone && onDone('{}'); return '{}' }
      if (!LM) return fail('the LanguageModel API is missing - needs Chrome 138+ on desktop')
      if (await LM.availability?.() == 'unavailable') return fail('gemini nano is unavailable on this device')
      const controller = new AbortController()
      const onAbortLLM = () => { ctx.vars.llmAbortFlag && (ctx.vars.llmAbortFlag.aborted = true); controller.abort() }
      coreUtils.eventEmitter.on('abortLLM', onAbortLLM)
      try {
        logger.status?.('prompting gemini nano on-device...')
        const systemContent = [instructions, context && `accumulatedContext: ${context}`].filter(Boolean).join('\n\n')
        const session = await LM.create({ signal: controller.signal,
          ...(systemContent && { initialPrompts: [{ role: 'system', content: systemContent }] }) })
        const fullContent = await session.prompt(messages.map(m => m.content).join('\n\n'), { signal: controller.signal })
        session.destroy?.()
        if (/not available in Chromium/.test(fullContent)) return fail('this Chromium ships an echo stub, not gemini nano - use real Chrome 138+ desktop')
        const llmStats = { goal, model, duration: Date.now() - llmStart,
          inputTokens: await countTokens({messages, instructions, context}), outputTokens: Math.ceil(fullContent.length / 4) }
        logger?.info?.({t: `${goal}: llm call finished`, ...llmStats, onDevice: true}, {llmInput, fullContent}, {ctx})
        logger.stepDone?.('llm')
        onDone && onDone(fullContent, llmStats)
        return { llmStats, outputTokens: llmStats.outputTokens, destroy() { controller.abort() } }
      } catch (error) {
        return fail(error.message)
      } finally {
        coreUtils.eventEmitter.off('abortLLM', onAbortLLM)
      }
    }
    const {body: reqBody, messages: logMessages} = buildRequestBody(model, messages, maxTokens, temperature, instructions, context, provider,
      thinkingBudget, responseSchema, userRequestId)
    const logBody = {messages: logMessages, model, userRequestId,
      ...(maxTokens == null ? {} : {[tokenLimitParam(provider, model)]: maxTokens}), temperature}
    const tokenCount = await countTokens({messages, model, instructions, context})
    ctx.vars.llmCallLogger?.info?.({t: 'llm request', goal, provider, model, userRequestId, workflowStack: ctx.vars.workflowStack},
      {requestBody: reqBody, sourceRefs: coreUtils.sourceRefs?.ids?.(logMessages) || []}, {ctx})
    if (tokenCount !== null)
      logger?.info?.({t:`${goal}: countInputTokens`, tokenCount, instructionsLength: instructions?.length || 0, contextLength: context?.length || 0}, logBody, {ctx})

    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(reqBody)
    }
    const {response,controller}  = await fetchProxyWithCache(url, options ,ctx)

    if (!response) {   // fetch aborted mid-connect or proxy failed
      controller.offAbortLLM?.()
      ctx.vars.errorLogger.error({t: `${goal}: llm fetch failed or aborted`, model, aborted: !!ctx.vars.llmAbortFlag?.aborted}, logBody, {ctx})
      return '{}'
    }
    if (response.status == 429) {
      debugger
      controller.offAbortLLM?.()
      ctx.vars.errorLogger.error({t:`${goal}: tooManyRequestsToLLM`, responseStatus: response.status, model}, logBody, {response, ctx})
      return '{}'
    }
    if (response.status == 400) {
      debugger
      controller.offAbortLLM?.()
      response.statusText && logger.status?.(response.statusText)
      const {curlCmd} = response
      const reader = response.body.getReader()
      const { done, value } = await reader.read()
      const reply = '' + decode(value||'')
      ctx.vars.errorLogger.error({t:`${goal}: BadRequest`, curlCmd, reply, responseStatus: response.status, model}, logBody, {response, ctx})
      return '{}'
    }

    if (!response.ok) {
      debugger
      controller.offAbortLLM?.()
      response.statusText && logger.status?.(response.statusText)
      const {curlCmd} = response
      console.log('apiRequestFailedToLLM Raw', curlCmd, logBody)
      ctx.vars.errorLogger.error({t:`${goal} apiRequestFailedToLLM`, statusText: response.statusText, responseStatus: response.status, model}
        , {curlCmd, ...logBody}, { response, ctx})
      return '{}'
    }
    logger?.info?.({t:`${goal}: llmStreamingStarted` }, logBody , {ctx})
  
    // Process the stream
    const reader = response.body.getReader()
    let fullContent = '', fullThinking = ''
    let outputTokens = null, providerInputTokens = null, cacheCreationInputTokens = null, cacheReadInputTokens = null, llmStats
    let detectorOffset = 0
    let detector = progressiveHandler.handler && progressiveHandler
    let currentSeqDetectorIndex = 0
    let currentSeqDetector = (progressiveHandler?.$segementDetectorSequenece || [])[0]
    let chunkLeft = ''
    let lastPctAt = 0
    try {
      let done
      while (true) {
        const { done: _done, value } = await reader.read()
        done = done || _done
        const fullStr = chunkLeft + decode(value)
        const lines = fullStr.split('\n')
        chunkLeft = lines.pop() // trailing fragment - complete only when next chunk supplies its newline
        //filtering lines starting with : as these are SSE comments
        lines.map(x=>x.trim()).filter(x=>x && !x.startsWith(':')).forEach(line => {
            try {
              const val = line.indexOf('data: [DONE]') != -1 ? 'done' : line.startsWith('data: ') ? JSON.parse(line.slice(6)) : null
              done ||= ['event: message_stop','event: error'].includes(line) || val == 'done' || ['message_stop','error'].includes(val?.type) || val?.delta?.stop_reason
              if (val && typeof val == 'object') { // full line
                ctx.vars.llmCallDetailLogger?.info?.({t: 'llm processing val', val}, {}, {ctx})
                const {inputTokens, outputTokens: out, cacheCreationInputTokens: write, cacheReadInputTokens: read} = tokenStatsOf(usageOf(val))
                outputTokens = out ?? outputTokens
                providerInputTokens = inputTokens ?? providerInputTokens
                cacheCreationInputTokens = write ?? cacheCreationInputTokens
                cacheReadInputTokens = read ?? cacheReadInputTokens
                const parts = val?.candidates?.[0]?.content?.parts
                const thinking = parts ? parts.filter(p => p.thought).map(p => p.text || '').join('')
                  : val?.delta?.thinking ?? val?.choices?.[0]?.delta?.reasoning ?? null
                if (typeof thinking == 'string' && thinking) fullThinking += thinking
                const content = parts ? parts.filter(p => !p.thought).map(p => p.text || '').join('')
                  : val?.choices?.[0]?.delta?.content ?? val?.choices?.[0]?.message?.content ?? val?.delta?.content ?? val?.delta?.text ?? val?.text ?? null

                if (typeof content != 'string' || !content) return
                fullContent += content
                onChunk && onChunk(content)
              }
            } catch (error) {
              ctx.vars.errorLogger.error({t:`${goal}: llm can not parse line`, error: error.stack }, {line, fullContent} , {ctx, error})
            }
        })
        if ((fullContent || fullThinking) && Date.now() - lastPctAt > 200) {   // throttled live token stream → moving bar, so a slow LLM call reads as alive not hung
          lastPctAt = Date.now()
          const got = fullContent.length + fullThinking.length
          logger.stepPct?.('llm', Math.round(100 * got / (got + 800)), fullContent ? `Receiving answer (${fullContent.length} chars)...`
            : `Thinking: ${fullThinking.slice(-100).split('\n').filter(Boolean).pop() || '...'}`)
        }
        if (detector) { // single repeating detector - loop until no more matches
          let result, segmentIndex = 0
          const wfLogger = ctx.vars.workflowLogger || logger
          while ((result = detector.detector(fullContent.slice(detectorOffset)))) {
            wfLogger.info({t: `${goal}: segment detected`, segmentIndex, swallow: result.swallow}, {text: result.text.slice(0,100)}, {ctx})
            detectorOffset += result.swallow
            try {
              detector.handler(result.text, {fullContent, addDynamicSegments, userId, roomId, passedContext, contentType})
            } catch (error) {
              ctx.vars.errorLogger.error({t: `${goal}: segment handler error`, segmentIndex}, {text: result.text, error: error.stack}, {ctx, error})
            }
            segmentIndex++
          }
        }
        if (currentSeqDetector) {
          const contentToSearch = fullContent.slice(detectorOffset)
          const result = currentSeqDetector.detector(contentToSearch)
          if (result) {
            detectorOffset += result.swallow
            currentSeqDetector.handler(result.text, {fullContent, addDynamicSegments, userId, roomId, passedContext,contentType})
            currentSeqDetector = progressiveHandler?.$segementDetectorSequenece[++currentSeqDetectorIndex]
          }
        }
        if (done)
          break
      }
    } catch(error) {
      ctx.vars.errorLogger.error({t:`${goal}: llm error`, error: error.stack }, { fullContent} , {ctx, error})
      return { error: error.stack}
    }
    finally {
      controller.offAbortLLM?.()
      const cacheTokens = cacheTokenFields({cache_creation_input_tokens: cacheCreationInputTokens, cache_read_input_tokens: cacheReadInputTokens})
      llmStats = {goal, model, duration: Date.now() - llmStart, inputTokens: providerInputTokens ?? tokenCount,
        outputTokens: outputTokens ?? null, ...cacheTokens}
      logger?.info?.({t:`${goal}: llm cache usage`, ...cacheLogFields({provider, model, goal,
        inputTokens: providerInputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens, tokenCount})}, {}, {ctx})
      logger?.info?.({t:`${goal}: llm call finished`, ...llmStats},
        {...logBody, llmInput, categories, fullContent, ...(fullThinking && {thinkingContent: fullThinking})}, {ctx})
      ctx.vars.llmCallLogger?.info?.({t: 'llm response', ...llmStats, userRequestId, workflowStack: ctx.vars.workflowStack},
        {fullContent, ...(fullThinking && {thinkingContent: fullThinking})}, {ctx})
      logger.stepDone?.('llm')
      onDone && onDone(fullContent, llmStats, fullThinking)
      try {
        reader.releaseLock()
      } catch (e) {}
    }

    return {
      response, llmStats, outputTokens: llmStats?.outputTokens,
      destroy() { controller.abort() }
    }

    function addDynamicSegments(...segments) {
      progressiveHandler?.$segementDetectorSequenece.push(...segments)
    }
}

export async function fetchItemsFromLLMReactiveP(args) {
  const replay = args.ctx?.vars.replay
  const isReplayCall = replay?.llmInput && (replay.nextCallIndex ??= 0, replay.nextCallIndex++) == (replay.callIndex ?? 0)
  args = isReplayCall ? (replay.applied = true, {...args, ...replay.llmInput, ctx: args.ctx}) : args
  return new Promise(resolve => {
    let done = false
    const finish = (responseText, llmStats, thinkingText) => !done && (done = true,
      resolve({...args, responseText, thinkingText, llmStats, outputTokens: llmStats?.outputTokens ?? null}))
    fetchItemsFromLLMReactive({...args, onDone: finish}).finally(() => finish('{}'))
  })
}

export async function warmLLMCache({messages, prompt = 'warmup', goal = 'warm llm cache', instructions, context,
  model: modelString = DEFAULT_MODEL, maxTokens = 10000, temperature = 0, thinkingBudget, responseSchema, ctx}) {
  const {provider, model, url} = getProviderConfig(modelString), logger = loggerOf(ctx)
  if (provider != 'anthropic' || !instructions)
    return {skipped: true, reason: provider != 'anthropic' ? 'only anthropic prompt cache is supported' : 'missing instructions'}
  const start = Date.now(), reqMessages = messages || [{role: 'user', content: prompt}]
  const {body, messages: logMessages} = buildRequestBody(model, reqMessages, maxTokens, temperature, instructions, context, provider,
    thinkingBudget, responseSchema, ctx.vars.userRequestId)
  const {response} = await fetchProxyWithCache(url, {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({...body, stream: false, max_tokens: 0})
  }, ctx)
  const json = await response?.json?.().catch(() => null), usage = usageOf(json)
  const res = {ok: !!response?.ok, status: response?.status, stopReason: json?.stop_reason,
    contentLength: json?.content?.length ?? 0, duration: Date.now() - start, ...cacheTokenFields(usage)}
  logger?.info?.({t: `${goal}: llm cache warm finished`, model, ...res}, {messages: logMessages, max_tokens: 0, temperature}, {ctx})
  return res
}

export const segmentDetectorByRegex = (beginRegex, endRegex) => content => {
    const beginMatch = content.match(beginRegex)
    if (beginMatch) {
      const segmentContent = content.substring(beginMatch.index + beginMatch[0].length)
      const endMatch = segmentContent.match(endRegex)
      if (endMatch) {
        return { text: segmentContent.substring(0, endMatch.index).trim(), swallow: beginMatch[0].length + endMatch.index + endMatch[0].length}
      }
    }
}

export const segmentDetectorJSONItem = tabsPrefix => segmentDetectorByRegex(new RegExp(`^${tabsPrefix}{`,'m'),new RegExp(`^${tabsPrefix}}`,'m'))

export const trimContext = (roomData, settings = null) => {
  const now = Date.now()
  
  // Generate 4-char letter-only IDs for users
  const userIds = new Set()
  roomData.content?.forEach(msg => {
    if (msg.sender) userIds.add(msg.sender)
  })
  if (settings?.content?.participants) {
    Object.keys(settings.content.participants).forEach(id => userIds.add(id))
  }
  
  const userIdMap = {}
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  let counter = 0
  userIds.forEach(userId => {
    // Generate 4-letter ID
    let shortId = ''
    let num = counter
    for (let i = 0; i < 4; i++) {
      shortId = letters[num % 26] + shortId
      num = Math.floor(num / 26)
    }
    userIdMap[userId] = shortId
    counter++
  })
  
  // Helper to convert timestamp to relative format
  const timeToRelative = (timestamp) => {
    const diff = now - timestamp
    const days = Math.floor(diff / (24 * 60 * 60 * 1000))
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000))
    
    let result = ''
    if (days > 0) result += `d${days}`
    if (hours > 0) result += `h${hours}`
    if (minutes > 0) result += `m${minutes}`
    return result || 'm0'
  }
  
  // Trim messages
  const trimmedContent = roomData.content?.map(msg => ({
    sender: userIdMap[msg.sender] || msg.sender,
    type: msg.type,
    content: msg.content,
    time: timeToRelative(msg.time)
  })) || []
  
  // Trim settings if provided
  let trimmedSettings = null
  if (settings?.content?.participants) {
    trimmedSettings = {
      participants: {}
    }
    Object.entries(settings.content.participants).forEach(([id, participant]) => {
      trimmedSettings.participants[userIdMap[id] || id] = {
        name: participant.name
      }
    })
  }
  
  return {
    content: trimmedContent,
    ...(trimmedSettings && { settings: trimmedSettings })
  }
}

export async function fetchLLMProxy(targetUrl, options = {}, ctx) {
  const { body, headers = {}, ...restOptions } = options
  const proxyBase = ctx.vars.wonderServiceBase || globalThis.location?.origin
    || globalThis.process?.env?.WONDER_SERVICE_URL || 'https://wonder-lambda-me-west1.indivi.ai'
  const url = ctx.vars.llmProxyUrl || `${proxyBase}/llmProxy`
  const roomId = ctx.vars.roomId || ctx.vars.roomWUrl?.split('://')[1]?.split('/')[0]
  const bodyForProxy = JSON.stringify({ targetUrl, headers, originalBody: body || null, roomId })
  const curlCmd = ['curl', '-X', 'POST', ...Object.entries(headers || {}).flatMap(([k, v]) => ['-H', `'${k}: ${v}'`]),
  '-d', `'${bodyForProxy.replace(/'/g, "'\\''")}'`, `'${url}'` ].join(' ') // for debug
  try {
    const token = await auth.wonderIdToken(ctx)
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-wonder-proxy-auth': `Bearer ${token}` },
      body: bodyForProxy,
      ...restOptions
    })
    response.curlCmd
    return response
  } catch (error) {
    debugger
    coreUtils.logException(error, 'fetch proxy failed', { ctx, url, bodyForProxy, curlCmd })
  }
}

export async function fetchProxyWithCache(url,options, _ctx) {
  if (false && _ctx?.vars.useProxyCache && globalThis.location?.hostname === 'localhost') {
    let res
    const ctx = _ctx.setVars({db:'local'}) // proxy only on local db
    const hash = options.body && calcHash(typeof options.body == 'string' ? options.body : JSON.stringify(options.body))
    const ct = new ContentType(`proxy-cache-${hash}`,'irelevant for you', { type: 'wonderPublish' })
    res = await ct.get('','',{ctx})
    if (!Object.keys(res).length) {
      res = await doFetch()
      debugger
      if (res?.value) // && !JSON.parse(res.value).candidates?.[0]?.finishReason == 'STOP')
        await ct.put('','',res,{ctx})
    } else {
      return { 
        controller: { abort: () => {}}, 
        response: {
          body: {
            getReader: () => ({read: () => ({ done: true, value: encode(res.value) } ), releaseLock: () => {} })
          },
          ok: true,
          json: () => res.value ? JSON.parse(res.value) : {},
          text: () => res.value ? res.value : ''
        }
      }
    }
    
    async function doFetch() {
      try {
        const response = await fetchLLMProxy(url, options, ctx)
        if (response.ok) {
          const value = await response.json()
          debugger
          return { value }
        }
        coreUtils.logError('fetch proxy response not ok', { ctx, status: response.status, url, options })
      } catch (error) {
          coreUtils.logException(error, 'fetch proxy failed', { ctx, url, options })
      }
    }
  
    function stableStringify(x){
      if (x && typeof x === 'object'){
        if (Array.isArray(x))
          return '['+x.map(v=> (v===undefined||typeof v==='function'||typeof v==='symbol') ? 'null' : stableStringify(v)).join(',')+']'
        return '{'+Object.keys(x).sort().filter(k=>{
            const v=x[k]; return !(v===undefined||typeof v==='function'||typeof v==='symbol')
          }).map(k=>JSON.stringify(k)+':'+stableStringify(x[k])).join(',')+'}'
      }
      return JSON.stringify(x) // handles NaN/Infinity -> "null", Dates -> ISO via toJSON
    }
    
    function calcHash(data) {
      const str = stableStringify(data)
      let hash = 0, i, chr;
      if (str.length === 0) return hash
      for (i = 0; i < str.length; i++) {
          chr = str.charCodeAt(i)
          hash = ((hash << 5) - hash) + chr;
          hash |= 0; // Convert to 32bit integer
      }
      return hash
    }  
  } else { // no proxy
    const controller = new AbortController()
    options.signal = controller.signal
    // 'abortLLM' event (emitted by a chat stop button) aborts the in-flight stream; the flag marks the whole run so its remaining llm calls skip
    const abortFlag = _ctx?.vars.llmAbortFlag
    const onAbortLLM = () => { abortFlag && (abortFlag.aborted = true); controller.abort() }
    coreUtils.eventEmitter.on('abortLLM', onAbortLLM)
    controller.offAbortLLM = () => coreUtils.eventEmitter.off('abortLLM', onAbortLLM)
    const response = await fetchLLMProxy(url, options, _ctx)
    return { response, controller }
  }
}

/* sample
fetchItemsFromLLM('my prompt ...', {
  $segementDetectorSequenece: [
  { 
    detector: segmentDetectorByRegex(/start code a.js/,/end code/), 
    handler: text => { // do something with text }
  },
  {
    detector: segmentDetectorByRegex(/start code b.js/,/end code/), 
    handler: text => { // do something with text }
  }
 ],ctx 
)
*/

// export const fetchItemsFromLLM = async ({prompt, model = DEFAULT_MODEL, instructions = '', context = '', ctx}) => {
//   const systemContent = [instructions, context, "reply based on the instructions and the context you received, to best answer the users message"].filter(Boolean).join('\n\n')
//   const messages = systemContent ? [{role: "system", content: systemContent}, {role: "user", content: prompt}] : [{role: "user", content: prompt}]
//   const tokenCount = await countTokens(messages, model, instructions, context)
//   if (tokenCount !== null) {
//     logger.info({t:`${goal} countInputTokens', tokenCount, promptLength: prompt.length, instructionsLength: instructions.length, contextLength: context.length})
//   }

//   const {controller, response} = await fetchProxyWithCache("https://api.groq.com/openai/v1/chat/completions", {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json"
//     },
//     body: JSON.stringify({ 
//       model, 
//       stream: true, 
//       max_tokens: 4000, 
//       temperature: 0.0, 
//       messages 
//     }),
//   }, ctx)

//   if (response.status == 429) {
//     logger.error({t:`${goal} tooManyRequestsToLLM', responseStatus: response.status, model})
//     return '{}'
//   }
//   if (!response.ok) {
//     logger.error({t:`${goal} apiRequestFailedToLLM', responseStatus: response.status, model, requestBody})
//     return '{}'
//   }

//   const reader = response.body.getReader()
//   let result = ''

//   while (true) {
//     const { done, value } = await reader.read()
//     if (done) break

//     const chunk = decode(value)
//     const lines = chunk.split('\n').filter(line => line.trim() !== '')
    
//     for (const line of lines) {
//       if (line.startsWith('data: ') && line !== 'data: [DONE]') {
//         const data = JSON.parse(line.slice(6))
//         const content = data.choices?.[0]?.delta?.content
//         if (content) result += content
//       }
//     }
//   }

//   return result
// }

// messages or prompt
