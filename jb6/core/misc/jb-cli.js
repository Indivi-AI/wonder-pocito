import { jb } from '@jb6/repo'
import '../utils/core-utils.js'
import '../utils/jb-expression.js'
import '../utils/jb-args.js'
import '../utils/jb-core.js'
import '../utils/tgp.js'
import '../utils/jb-logging.js'
const { coreUtils } = jb

const {
  tgp: { Component },
  common: { Data }
} = jb.dsls
const { logException, logError, isNode } = coreUtils
Object.assign(coreUtils, {runNodeCli, runNodeCliViaJbWebServer, runCliInContext, runBashScript,
  runNodeCliStreamViaJbWebServer, runBashScriptStreamViaJbWebServer, buildNodeCliCmd, createLoggerStreamAdapter})

function createLoggerStreamAdapter({ctx, bindLoggers}) {
  if (!bindLoggers && !ctx?.vars?.cliLogger) return null
  const buffers = { stdout: '', stderr: '' }
  const dispatch = (line, stream) => {
    let envelope
    try { envelope = JSON.parse(line) } catch {}
    if (envelope?.kind !== 'log') return ctx?.vars?.cliLineLogger?.info?.({t: 'cli line', stream, line}, {}, {ctx})
    const logger = ctx?.vars?.[envelope.logger], channel = logger?.[envelope.channel]
    if (typeof channel === 'function') channel.call(logger, envelope.event, {}, {ctx})
  }
  const accept = ({stream, text}) => {
    if (!text) return
    const lines = (buffers[stream] + text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')).split('\n')
    buffers[stream] = lines.pop()
    lines.forEach(line => dispatch(line, stream))
  }
  accept.flush = () => Object.entries(buffers).forEach(([stream, line]) => {
    if (line) dispatch(line, stream)
    buffers[stream] = ''
  })
  return accept
}

function buildNodeCliCmd(script, options = {}) {
  options.importMapsInCli = options.importMapsInCli || jb.coreRegistry.importMapsInCli
  const importParts = options.importMapsInCli ? ['--import', options.importMapsInCli] : []
  const cmd = `node --inspect-brk --experimental-vm-modules --expose-gc --input-type=module ${importParts.join(' ')} -e "${script.replace(/\$/g, '\\$').replace(/"/g, '\\"')}"`
  return { cmd, importParts }
}

async function runCliInContext(script, options = {}) {
  const ctx = options.ctx = coreUtils.ensureLoggers([], {ctx: options.ctx})   // always a ctx with errorLogger — single source of truth downstream
  if (!isNode && ctx.vars.loggersNeededForUiProgress) return runNodeCliStreamViaJbWebServer(script, options)
  if (!isNode) return runNodeCliViaJbWebServer(script, options)
  return runNodeCli(script, options)
}

async function runNodeCli(script, options = {}) {
  const {spawn} = await import('child_process')
  const { cmd, importParts } = buildNodeCliCmd(script, options)
  const cwd = options.projectDir
  // Real spawn args; `cmd` is display-only and its --inspect-brk is not used here.
  const childArgs = ['--experimental-vm-modules', '--expose-gc', '--input-type=module', ...importParts]
  const scriptToRun = `console.log = () => {};\n${script}`
  const acceptProgressFromStderr = options.ctx?.vars?.loggersNeededForUiProgress ? progressFromStderr(options.ctx) : null
  const onChunk = options.onChunk
  options.ctx?.vars?.cliLogger?.info?.({t: 'spawn cli', realArgs: childArgs, cmd, cwd}, {}, {ctx: options.ctx})

  return new Promise(resolve => {
    let out = '', err = ''
    try {
      const child = spawn(process.execPath, [...childArgs, '-e', scriptToRun], {cwd})
      options.onChild?.(child)
      child.stdout.on('data', d => { const text = '' + d; out += text; onChunk?.({stream: 'stdout', text}) })
      child.stderr.on('data', d => { const text = '' + d; err += text; acceptProgressFromStderr?.(text); onChunk?.({stream: 'stderr', text}) })
      child.on('close', async code => {
        acceptProgressFromStderr?.flush?.()
        options.ctx?.vars?.cliLogger?.info?.({
          t: 'cli closed', code, stdoutLen: out.length, stderrLen: err.length,
          stderrTail: err.slice(-500)
        }, {}, {ctx: options.ctx})
        if (code !== 0) {
          const error = Object.assign(new Error(`Exit ${code}`), {stdout: out, stderr: err})
          logException(error, 'error in run node cli stream', {cmd, cwd, stdout: out})
          return resolve({error, cmd, cwd, code, stderr: err})
        }
        try {
          const result = await coreUtils.parseServiceResult(out)
          options.ctx?.vars?.cliLogger?.info?.({t: 'cli result parsed', hasResult: result != null, resultKeys: Object.keys(result || {})}, {}, {ctx: options.ctx})
          resolve({result, error: result?.error, cmd, cwd, stderr: err})
        } catch (e) {
          options.ctx?.vars?.cliLogger?.info?.({t: 'cli result parse failed', error: e.stack || String(e), stdoutTail: out.slice(-500)}, {}, {ctx: options.ctx})
          resolve({error: e.stack || e, cmd, cwd, textToParse: out, stderr: err})
        }
      })
    } catch(e) {
      logException(e, 'error in run node cli stream', {cmd, cwd})
      resolve({error: e, cmd, cwd})
    }
  })
}

async function runNodeCliViaJbWebServer(script, options = {}) {
  const {ctx, ...optionsToSend} = options
  try {
    const expressUrl = options.expressUrl || ''
    const { cmd } = buildNodeCliCmd(script, options)
    const { cliLogger, errorLogger } = ctx?.vars || {}
    cliLogger?.info?.({t: 'POST /run-cli', expressUrl, scriptLen: script.length}, {}, {ctx})
    const res = await fetch(`${expressUrl}/run-cli`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ script, ...optionsToSend })
    })
    cliLogger?.info?.({t: '/run-cli response', ok: res.ok, status: res.status}, {}, {ctx})
    if (!res.ok) {
      const text = await res.text()
      errorLogger?.error?.({t: '/run-cli !ok', status: res.status, body: text.slice(0,500)}, {}, {ctx})
      return { error: `runNodeCliViaJbWebServer failed: ${res.status} – ${text}`, ...optionsToSend }
    }

    const json = await res.json()
    const { result, error } = json
    cliLogger?.info?.({
      t: '/run-cli json', hasResult: !!result, error: String(error || result?.error || ''), code: result?.code,
      stderr: String(result?.stderr || '').slice(0,500), textToParse: String(result?.textToParse || '').slice(0,500)
    }, {}, {ctx})
    if (error) {
      errorLogger?.error?.({t: '/run-cli error', error}, {}, {ctx})
      return { error, cmd, ...optionsToSend }
    }

    return { ...result, cmd }
  } catch (e) {
    ctx?.vars?.errorLogger?.error?.({t: '/run-cli exception'}, {}, {ctx, error: e})
    return { error: `runNodeCliViaJbWebServer exception: ${e.stack}`, ...optionsToSend }
  }
}

async function streamViaSSE({ startUrl, body, onStatus, onUrls }) {
  const startRes = await fetch(startUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!startRes.ok) {
    const text = await startRes.text()
    return { error: `streamViaSSE start failed: ${startRes.status} – ${text}` }
  }
  const urls = await startRes.json()
  const { statusUrl, contentUrl, error } = urls
  if (error) return { error }
  if (onUrls) onUrls(urls)

  const origin = (typeof location !== 'undefined' && location.origin) || 'http://localhost'
  const absStatus  = /^https?:/.test(statusUrl)  ? statusUrl  : new URL(statusUrl,  new URL(startUrl,  origin).href).href
  const absContent = /^https?:/.test(contentUrl) ? contentUrl : new URL(contentUrl, new URL(startUrl,  origin).href).href

  const sse = await fetch(absStatus, { headers: { Accept: 'text/event-stream' } })
  const reader = sse.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let done = false
  while (!done) {
    const { value, done: streamDone } = await reader.read()
    if (streamDone) break
    const chunk = decoder.decode(value, { stream: true })
    buf += chunk
    const events = buf.split('\n\n')
    buf = events.pop() || ''
    for (const ev of events) {
      const dataLine = ev.split('\n').find(l => l.startsWith('data:'))
      if (!dataLine) continue
      try {
        const msg = JSON.parse(dataLine.slice(5).trim())
        if (msg.type === 'status') onStatus?.(msg.text)
        if (msg.type === 'done') { done = true; break }
      } catch (e) {}
    }
  }
  reader.cancel().catch(() => {})

  const r = await fetch(absContent)
  if (!r.ok) return { error: `streamViaSSE content failed: ${r.status} – ${await r.text()}` }
  return await r.json()
}

async function runNodeCliStreamViaJbWebServer(script, options = {}) {
  const { ctx, expressUrl = '', ...optionsToPass } = options
  try {
    const { cmd } = buildNodeCliCmd(script, optionsToPass)
    const acceptProgressFromStderr = progressFromStderr(ctx)
    const result = await streamViaSSE({
      startUrl: `${expressUrl}/run-cli-stream`,
      body: {script, ...optionsToPass, loggersNeededForUiProgress: ctx.vars.loggersNeededForUiProgress},
      onStatus: chunk => chunk?.stream === 'stderr' && acceptProgressFromStderr(chunk.text || '')
    })
    acceptProgressFromStderr.flush()
    if (result.error) {
      ctx.vars.errorLogger.error({t: '/run-cli-stream error', error: result.error}, {}, {ctx})
      return { error: result.error, cmd, ...options }
    }
    return { ...result, cmd }
  } catch (e) {
    ctx?.vars?.errorLogger?.error?.({t: '/run-cli-stream exception'}, {}, {ctx, error: e})
    return { error: `runNodeCliStreamViaJbWebServer exception: ${e.stack}`, ...options }
  }
}

function progressFromStderr(ctx) {
  const needed = String(ctx.vars.loggersNeededForUiProgress || '').split(',').map(x => x.trim()).filter(Boolean)
  let buf = ''
  const accept = text => {
    const lines = (buf + text).split('\n')
    buf = lines.pop() || ''
    lines.forEach(handleLine)
  }
  accept.flush = () => { if (buf) handleLine(buf); buf = '' }
  return accept

  function handleLine(line) {
    let entry
    try { entry = JSON.parse(line) } catch { return }
    if (entry?.severity !== 'progress' || !needed.includes(entry.logger)) return
    if (typeof document !== 'undefined' || ctx.vars.isProgressConsumer)
      coreUtils.eventEmitter.emit('progress', entry)
    else
      globalThis.process?.stderr?.write(`${line}\n`)
  }
}

Component('bash', {
  params: [
    {id: 'script', as: 'text'}
  ],
  impl: (ctx, {}, {script}) => runBashScript(script)
})

async function runBashScriptStreamViaJbWebServer(script, { onStdoutLine, onStderrLine, onStatus, onStart } = {}, options = {}) {
  try {
    const expressUrl = options.expressUrl || ''
    const buf = { stdout: '', stderr: '' }
    const flushChunk = (stream, text) => {
      const cb = stream === 'stderr' ? onStderrLine : onStdoutLine
      if (!cb) return
      const combined = buf[stream] + text
      const lines = combined.split('\n')
      buf[stream] = lines.pop() || ''
      lines.forEach(cb)
    }
    const result = await streamViaSSE({
      startUrl: `${expressUrl}/run-bash-stream`,
      body: { script, ...options },
      onUrls: urls => {
        if (!onStart || !urls?.runId) return
        const kill = (signal = 'SIGTERM') =>
          fetch(`${expressUrl}/run-bash-stream/${urls.runId}/cancel`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ signal })
          }).catch(() => {})
        onStart({ pid: urls.runId, kill })
      },
      onStatus: chunk => {
        if (!chunk) return
        if (onStatus) onStatus(chunk)
        flushChunk(chunk.stream, chunk.text || '')
      }
    })
    if (onStdoutLine && buf.stdout) onStdoutLine(buf.stdout)
    if (onStderrLine && buf.stderr) onStderrLine(buf.stderr)
    if (result.error) return { error: result.error, script }
    return result
  } catch (e) {
    return { error: `runBashScriptStreamViaJbWebServer exception: ${e.stack}`, script }
  }
}

async function runBashScript(script, callbacks) {
  const { onStdoutLine, onStderrLine, onStart, _onChunk, cliLogger, ctx } = callbacks || {}
  cliLogger?.info?.({ t: 'runBashScript', scriptLen: script.length, argMax: 131072 }, {}, { ctx })   // bash -c argv carries the whole script → E2BIG when scriptLen > OS ARG_MAX
  if (!isNode) {
    if (onStdoutLine || onStderrLine || onStart)
      return runBashScriptStreamViaJbWebServer(script, { onStdoutLine, onStderrLine, onStart })
    const response = await fetch('/run-bash', { method: 'POST', headers: {'Content-Type': 'application/json' }, body: JSON.stringify({ script }) })
    const result = await response.json()
    return result.result
  }
  const {spawn} = await import('child_process')
  return new Promise((resolve) => {
    let stdout = '', stderr = '', outBuf = '', errBuf = ''
    const emit = (data, isErr) => {
      const text = String(data)
      if (isErr) stderr += text; else stdout += text
      if (_onChunk) _onChunk({ stream: isErr ? 'stderr' : 'stdout', text })
      const cb = isErr ? onStderrLine : onStdoutLine
      if (!cb) return
      const buf = (isErr ? errBuf : outBuf) + text
      const lines = buf.split('\n')
      const tail = lines.pop() || ''
      if (isErr) errBuf = tail; else outBuf = tail
      lines.forEach(cb)
    }

    let child
    try {
      child = spawn('bash', ['-c', script], { encoding: 'utf8', detached: true })
    } catch (err) {   // spawn throws synchronously on E2BIG (script > ARG_MAX) — surface it as a structured error, not an uncaught reject
      cliLogger?.error?.({ t: 'spawn failed', code: err.code, scriptLen: script.length }, {}, { ctx, error: err })
      return resolve({ error: `spawn ${err.code || err.message}`, scriptLen: script.length, script })
    }
    if (onStart) {
      const kill = (signal = 'SIGTERM') => { try { process.kill(-child.pid, signal) } catch (e) {} }
      onStart({ pid: child.pid, kill })
    }
    child.stdout.on('data', d => emit(d, false))
    child.stderr.on('data', d => emit(d, true))

    child.on('close', async code => {
      if (onStdoutLine && outBuf) onStdoutLine(outBuf)
      if (onStderrLine && errBuf) onStderrLine(errBuf)
      if (code !== 0) {
        const error = `Shell script exited with code ${code}`
        logError('error in run shell script', { error, script, stdout, stderr })
        return resolve({ error, stdout, stderr, script })
      }
      try {
        stdout = await coreUtils.parseServiceResult(stdout)
      } catch (e) {}
      resolve({ stdout, stderr, script })
    })

    child.on('error', err => {
      logException(err, 'error spawning shell script', { script })
      resolve({script, err})
    })
  })
}
