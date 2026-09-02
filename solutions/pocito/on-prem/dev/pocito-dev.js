import { spawn, execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, mkdirSync, writeFileSync, copyFileSync, rmSync, constants } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'

const pocito = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), root = resolve(pocito, '../..')
const envFile = join(pocito, '.env.onprem')
const loadPocitoEnv = () => ({...(existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {}), ...process.env})
const pocitoStateDir = env => resolve(pocito, env.POCITO_DATA_DIR || '.local-data')
const isProcessAlive = pid => {
  if (!(pid > 0)) return false
  try { process.kill(pid, 0); return true } catch { return false }
}

export async function shutdownPocito() {
  const pidFile = join(pocitoStateDir(loadPocitoEnv()), 'pocito-dev.pid'), pid = Number(existsSync(pidFile) && readFileSync(pidFile, 'utf8'))
  if (!isProcessAlive(pid)) { rmSync(pidFile, {force: true}); return console.log('Pocito is not running') }
  process.kill(pid, 'SIGTERM')
  for (let attempt = 0; attempt < 100 && isProcessAlive(pid); attempt++) await delay(100)
  if (isProcessAlive(pid)) throw new Error(`Pocito ${pid} did not stop within 10 seconds`)
  rmSync(pidFile, {force: true})
  console.log('Pocito stopped')
}

export async function startPocito() {
  if (!existsSync(envFile)) copyFileSync(`${envFile}.example`, envFile, constants.COPYFILE_EXCL)
  const env = loadPocitoEnv(), state = pocitoStateDir(env), host = env.POCITO_BIND_HOST || '127.0.0.1'
  const ports = { pocito: env.POCITO_PORT || '3000', marketplace: env.MARKETPLACE_PORT || '7777',
    agno: env.AGENT_OS_PORT || '7778', litellm: env.LITELLM_PORT || '4000', flapi: env.FLAPI_PORT || '6001' }
  const url = name => `http://localhost:${ports[name]}`
  const npmInstall = (env.POCITO_NPM_INSTALL || 'ci').split(/\s+/).filter(Boolean)
  const minio = env.MINIO_ENDPOINT, storageClass = env.MINIO_STORAGE_CLASS || 'STANDARD_IA', flapiBaseUrl = env.FLAPI_BASE_URL
  const agnoBaseUrl = env.AGNO_API_URL, localAgno = !agnoBaseUrl
  const localLitellm = !env.LITELLM_HOST, litellmHost = env.LITELLM_HOST || url('litellm'), llmModel = env.LLM_MODEL || 'openai/chat'
  if (!minio || !env.PGVECTOR_URL) throw new Error('Set MINIO_ENDPOINT and PGVECTOR_URL in .env.onprem')
  Object.assign(env, {
    ENV_PATH: envFile, WONDER_AUTH_MODE: 'none', STORAGE_PROVIDER: 'minio', MINIO_ENDPOINT: minio,
    MINIO_STORAGE_CLASS: storageClass, WONDER_STORAGE_URL: minio, WONDER_CDN_URL: `${url('pocito')}/jb6_packages/react/lib`,
    WONDER_LOCAL_SERVER: url('pocito'), WONDER_SERVICE_URL: url('pocito'),
    MARKETPLACE_API_URL: url('marketplace'), AGNO_API_URL: agnoBaseUrl || url('agno'), FLAPI_BASE_URL: flapiBaseUrl || url('flapi'),
    FLAPI_TOKEN: env.FLAPI_TOKEN || (flapiBaseUrl ? '' : randomUUID()),
    FLAPI_USERNAME: env.FLAPI_USERNAME || (flapiBaseUrl ? '' : '625navehp'),
    LLM_PROXY_URL: `${url('pocito')}/llmProxy`, LLM_PROXY_MODE: 'onprem', LITELLM_HOST: litellmHost, LLM_MODEL: llmModel,
    OPENAI_BASE_URL: `${litellmHost.replace(/\/$/, '')}/v1`, OPENAI_API_KEY: env.OPENAI_API_KEY || 'unused',
    OPENAI_MODEL: env.OPENAI_MODEL || llmModel.split('/').pop(),
    OPENAI_EMBEDDING_DIMENSIONS: env.OPENAI_EMBEDDING_DIMENSIONS || '1536',
    MARKETPLACE_HOST: host, MARKETPLACE_PORT: ports.marketplace, AGENT_OS_HOST: host, AGENT_OS_PORT: ports.agno,
    PGVECTOR_URL: env.PGVECTOR_URL,
    MARKETPLACE_DATA_DIR: join(state, 'marketplace'), MCP_BEARER_TOKEN: '',
    CORS_ALLOWED_ORIGINS: '*', PYTHONUNBUFFERED: '1',
    LITELLM_LOCAL_MODEL_COST_MAP: 'True', LITELLM_LOCAL_POLICY_TEMPLATES: 'true', LITELLM_LOCAL_BLOG_POSTS: 'True'
  })
  mkdirSync(state, { recursive: true })
  const pidFile = join(state, 'pocito-dev.pid'), previousPid = Number(existsSync(pidFile) && readFileSync(pidFile, 'utf8'))
  if (isProcessAlive(previousPid)) throw new Error(`Pocito is already running (${previousPid})`)
  writeFileSync(pidFile, String(process.pid))
  const children = new Set()
  let stopping = false
  const signal = (child, value) => { try { process.kill(-child.pid, value) } catch {} }
  const stop = async code => {
    if (stopping) return
    stopping = true
    const active = [...children]
    active.forEach(child => signal(child, 'SIGTERM'))
    const timer = setTimeout(() => active.forEach(child => signal(child, 'SIGKILL')), 5000)
    await Promise.allSettled(active.map(child => child.done))
    clearTimeout(timer)
    rmSync(pidFile, {force: true})
    process.exit(code)
  }
  process.once('SIGINT', () => void stop(0))
  process.once('SIGTERM', () => void stop(0))
  const launch = (file, args, options = {}) => {
    if (stopping) throw new Error('Pocito is stopping')
    const child = spawn(file, args, { cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'inherit'], ...options })
    children.add(child)
    child.output = ''
    child.stdout?.on('data', chunk => { child.output += chunk })
    child.done = new Promise((ok, fail) => {
      child.once('error', fail)
      child.once('exit', code => code === 0 ? ok(child.output) : fail(new Error(`${file} exited with ${code}`)))
    })
    child.done.then(() => children.delete(child), () => children.delete(child))
    return child
  }
  const run = (file, args, options) => launch(file, args, options).done
  const service = (name, file, args, options = {}) => {
    const child = launch(file, args, { ...options, stdio: 'inherit' })
    child.done.then(() => { if (!stopping) { console.error(`${name} stopped`); void stop(1) } }, error => {
      if (!stopping) { console.error(`${name}: ${error.message}`); void stop(1) }
    })
  }
  const waitFor = async (name, check) => {
    for (let attempt = 0; attempt < 120 && !stopping; attempt++) {
      if (await check().catch(() => false)) return
      await delay(500)
    }
    throw new Error(`${name} was not ready within 60 seconds`)
  }
  const ready = async address => (await fetch(address, { signal: AbortSignal.timeout(2000) })).ok
  const requestedPython = env.POCITO_PYTHON
  try {
    const requiredPorts = Object.entries(ports).filter(([name]) => (name !== 'litellm' || localLitellm) && (name !== 'agno' || localAgno))
      .map(([, port]) => port)
    if (new Set(requiredPorts).size !== requiredPorts.length) throw new Error('Service ports must be distinct')
    for (const port of requiredPorts) await new Promise((ok, fail) => {
      const socket = createServer().once('error', () => fail(new Error(`Port ${port} is occupied; stop its owner or configure an external service`)))
      socket.listen(Number(port), host, () => socket.close(ok))
    })
    console.log('Preparing Pocito dependencies')
    for (const [directory, modules] of [[root, env.POCITO_NODE_MODULES || join(root, 'node_modules')],
      ...(flapiBaseUrl ? [] : [[join(pocito, 'flapi-mock'), join(pocito, 'flapi-mock/node_modules')]])])
      if (!existsSync(modules)) await run('npm', npmInstall, { cwd: directory, stdio: 'inherit' })
    if (!env.UV_DEFAULT_INDEX && !env.UV_INDEX_URL) {
      let pip = {}
      try {
        pip = Object.fromEntries(execFileSync('python3', ['-m', 'pip', 'config', 'list'], { env, stdio: ['ignore', 'pipe', 'ignore'] })
          .toString().trim().split('\n').filter(line => line.includes('=')).map(line => {
            const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1).replace(/^['"]|['"]$/g, '')]
          }))
      } catch {}
      const index = env.PIP_INDEX_URL || pip['install.index-url'] || pip['global.index-url']
      if (index) env.UV_DEFAULT_INDEX = index
    }
    if (env.PIP_EXTRA_INDEX_URL && !env.UV_EXTRA_INDEX_URL) env.UV_EXTRA_INDEX_URL = env.PIP_EXTRA_INDEX_URL
    const environments = {}
    for (const name of ['marketplace-server', 'agno-server', ...(localLitellm ? ['on-prem/litellm'] : [])]) {
      const project = join(pocito, name), venv = join(env.POCITO_DEPS_DIR || state, 'venvs', name.split('/').pop())
      const stamp = createHash('sha256').update(readFileSync(join(project, 'pyproject.toml')))
        .update(readFileSync(join(project, 'uv.lock'))).update(requestedPython || '').digest('hex')
      const stampFile = join(venv, '.pocito-lock')
      if (!existsSync(stampFile) || readFileSync(stampFile, 'utf8').trim() !== stamp) {
        const requirements = join(state, `${name.split('/').pop()}.requirements.txt`)
        await run('uv', ['export', '--frozen', '--no-dev', '--no-emit-project', '--project', project, '--output-file', requirements])
        await run('uv', ['venv', '--clear', ...(requestedPython ? ['--python', requestedPython] : []), '--project', project, venv])
        await run('uv', ['pip', 'sync', '--require-hashes', '--python', join(venv, 'bin/python'), requirements], { stdio: 'inherit' })
        writeFileSync(stampFile, stamp)
      }
      environments[name] = join(venv, 'bin')
    }
    const python = name => join(environments[name], 'python')
    const config = join(pocito, 'on-prem/litellm/config.local.yaml')
    if (localLitellm) {
      if (!existsSync(config)) copyFileSync(join(dirname(config), 'config.yaml'), config, constants.COPYFILE_EXCL)
      service('LiteLLM', join(environments['on-prem/litellm'], 'litellm'), ['--config', config, '--host', host, '--port', ports.litellm])
    }
    service('FLAPI', process.execPath, flapiBaseUrl ? [join(pocito, 'on-prem/dev/flapi-server.js')] : ['--import', 'tsx', 'server.ts'],
      flapiBaseUrl ? {env: {...env, PORT: ports.flapi}} : {cwd: join(pocito, 'flapi-mock'), env: {...env, MOCK_PORT: ports.flapi}})
    service('Marketplace', python('marketplace-server'), [join(pocito, 'marketplace-server/marketplace_server.py')])
    await waitFor('LiteLLM', () => ready(`${litellmHost.replace(/\/$/, '')}/health/liveliness`))
    await waitFor('FLAPI', () => ready(`${url('flapi')}/health`))
    await waitFor('Marketplace', async () => {
      const health = await (await fetch(`${url('marketplace')}/healthz`, { signal: AbortSignal.timeout(2000) })).json()
      return health.status === 'ok' && health.object_store === 'ok'
    })
    await run(process.execPath, [join(pocito, 'traveling-test/scripts/seed-marketplace-assets.mjs')], {stdio: 'inherit'})
    if (localAgno) service('Agno', python('agno-server'), [join(pocito, 'agno-server/agno_server.py')])
    await waitFor('Agno', async () => {
      const health = await (await fetch(`${(agnoBaseUrl || url('agno')).replace(/\/$/, '')}/healthz`, { signal: AbortSignal.timeout(2000) })).json()
      return health.status === 'ok' && health.object_store === 'ok'
    })
    service('Pocito', process.execPath, ['--import', join(root, 'nodejs-importmap.js'), join(pocito, 'on-prem/dev/pocito-local-server.js')], {
      env: {...env, PORT: ports.pocito, POCITO_BIND_HOST: host, FLAPI_BASE_URL: url('flapi')}
    })
    await waitFor('Pocito', () => ready(`${url('pocito')}/health`))
    console.log(`Pocito: ${url('pocito')}/room/<room>/applet/<applet>\nLiteLLM: ${litellmHost}\nCtrl+C stops the local services.`)
  } catch (error) {
    if (!stopping) console.error(error.message)
    await stop(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await (process.argv.includes('--shutdown') ? shutdownPocito() : startPocito())
