import { coreUtils, jb, dsls } from '@jb6/core'
import '@jb6/core/misc/jb-cli.js'
import '@jb6/core/misc/import-map-services.js'
import pty from 'node-pty'

const { runNodeCli, runBashScript, buildNodeCliCmd, ensureImportMapsInCli } = coreUtils

jb.serverUtils = jb.serverUtils || {}
Object.assign(jb.serverUtils, {serveCli, serveCliStream })

function serveCli(app) {
  app.post('/run-cli', async (req, res) => {
    if (!req.body) {
      res.status(200).json({ error: 'no body in req' })
      return
    }
    const { script, ...options } = req.body
    options.importMapsInCli = options.importMapsInCli || await ensureImportMapsInCli()
    const result = await runNodeCli(script, options)
    res.status(200).json({ result })
  })

  app.post('/run-bash', async (req, res) => {
    const { script } = req.body
    const result = await runBashScript(script)
    res.status(200).json({ result })
  })
}

function serveCliStream(app) {
  const runs = {}
  let seq = 1
  const newRunId = () => 'run_' + (seq++)

  const sseHeaders = res => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders && res.flushHeaders()
  }
  const sseSend = (res, msg) => res.write(`data: ${JSON.stringify(msg)}\n\n`)

  const broadcast = (runId, msg) => {
    const run = runs[runId]
    if (!run) return
    run.buffer.push(msg)
    Object.values(run.listeners).forEach(fn => fn(msg))
  }

  // generic SSE run registration: returns { runId, urls, broadcastStatus, broadcastDone, resolve }
  const startRun = pathPrefix => {
    const runId = newRunId()
    let resolve
    const promise = new Promise(r => resolve = r)
    runs[runId] = { listeners: {}, buffer: [], promise, resolve }
    return {
      runId,
      run: runs[runId],
      urls: {
        runId,
        statusUrl: `${pathPrefix}/${runId}/status`,
        contentUrl: `${pathPrefix}/${runId}/content`
      },
      broadcastStatus: text => broadcast(runId, { type: 'status', text }),
      broadcastDone: () => broadcast(runId, { type: 'done' }),
      cleanup: () => setTimeout(() => delete runs[runId], 60_000)
    }
  }

  app.post('/run-cli-stream', async (req, res) => {
    if (!req.body) return res.json({ error: 'no body in req' })

    if (req.body.interactive) {
      const { runId, run, urls, broadcastStatus, broadcastDone, cleanup } = startRun('/run-cli-stream')
      const { cmd = 'bash', args = [], cwd, env, shell, cols = 120, rows = 40 } = req.body
      const sh = shell || process.env.SHELL || '/bin/bash'
      const term = (env && env.TERM) || 'xterm-256color'
      const line = [cmd, ...args].map(x => String(x).replace(/'/g, `'\\''`)).join(' ')

      const p = pty.spawn(sh, ['-lic', line], {
        cwd,
        env: { ...process.env, ...env, TERM: term },
        cols,
        rows,
        name: term
      })
      run.pty = p
      p.onData(d => broadcastStatus({ stream: 'pty', text: d }))
      p.onExit(({ exitCode, signal }) => {
        run.resolve({ exitCode, signal })
        broadcastDone()
        cleanup()
      })

      return res.json({
        ...urls,
        inputUrl: `/run-cli-stream/${runId}/input`,
        resizeUrl: `/run-cli-stream/${runId}/resize`
      })
    }

    const { script, ...options } = req.body
    options.importMapsInCli = options.importMapsInCli || await ensureImportMapsInCli()
    const { runId, run, urls, broadcastStatus, broadcastDone, cleanup } = startRun('/run-cli-stream')
    const { cmd } = buildNodeCliCmd(script, options)
    ;(async () => {
      try {
        const final = await runNodeCli(script, {...options, onChunk: broadcastStatus})
        run.resolve(final)
      } catch (error) {
        run.resolve({ error: error.stack || error })
      }
      broadcastDone()
      cleanup()
    })()
    res.json({ cmd, ...urls })
  })

  app.post('/run-bash-stream', (req, res) => {
    if (!req.body) return res.json({ error: 'no body in req' })
    const { script } = req.body
    const { runId, run, urls, broadcastStatus, broadcastDone, cleanup } = startRun('/run-bash-stream')
    ;(async () => {
      try {
        const final = await runBashScript(script, {
          _onChunk: broadcastStatus,
          onStart: ({pid, kill}) => { run.pid = pid; run.kill = kill }
        })
        run.resolve(final)
      } catch (error) {
        run.resolve({ error: error.stack || error })
      }
      broadcastDone()
      cleanup()
    })()
    res.json(urls)
  })

  app.post('/run-bash-stream/:runId/cancel', (req, res) => {
    const run = runs[req.params.runId]
    if (!run?.kill) return res.status(404).json({ error: 'no such run or already finished' })
    const signal = (req.body?.signal) || 'SIGTERM'
    broadcast(req.params.runId, { type: 'status', text: { stream: 'stdout', text: `==> cancel: ${signal} → pid ${run.pid} (process group)\n` } })
    run.kill(signal)
    if (signal === 'SIGTERM') {
      setTimeout(() => {
        if (runs[req.params.runId]?.kill) {
          broadcast(req.params.runId, { type: 'status', text: { stream: 'stdout', text: `==> cancel: 5s elapsed, escalating to SIGKILL\n` } })
          try { runs[req.params.runId].kill('SIGKILL') } catch {}
        }
      }, 5000)
    }
    res.json({ ok: true, runId: req.params.runId, signal })
  })

  // shared SSE/content/input/resize endpoints (apply to both /run-cli-stream and /run-bash-stream)
  const mountSseEndpoints = prefix => {
    app.get(`${prefix}/:runId/status`, (req, res) => {
      const run = runs[req.params.runId]
      if (!run) return res.status(404).end('no such run')
      sseHeaders(res)
      run.buffer.forEach(msg => sseSend(res, msg))
      const id = Math.random().toString(36).slice(2)
      run.listeners[id] = msg => sseSend(res, msg)
      req.on('close', () => delete run.listeners[id])
    })
    app.get(`${prefix}/:runId/content`, async (req, res) => {
      const run = runs[req.params.runId]
      if (!run) return res.status(404).json({ error: 'no such run' })
      res.json(await run.promise)
    })
  }
  mountSseEndpoints('/run-cli-stream')
  mountSseEndpoints('/run-bash-stream')

  app.post('/run-cli-stream/:runId/input', (req, res) => {
    const run = runs[req.params.runId]
    if (!run?.pty) return res.status(404).json({ error: 'no such run' })
    run.pty.write(String(req.body?.d || ''))
    res.json({ ok: true })
  })

  app.post('/run-cli-stream/:runId/resize', (req, res) => {
    const run = runs[req.params.runId]
    if (!run?.pty) return res.status(404).json({ error: 'no such run' })

    const cols = Math.max(2, Number(req.body?.cols || 120) | 0)
    const rows = Math.max(2, Number(req.body?.rows || 40) | 0)

    try {
      run.pty.resize(cols, rows)
    } catch (e) {
      if (e?.code == 'ENOTTY' || e?.code == 'EBADF' || e?.code == 'EPIPE') {
        run.pty = null
        return res.json({ ok: false, ignored: e.code })
      }
      throw e
    }
    res.json({ ok: true })
  })
}
