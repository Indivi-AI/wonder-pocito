// Pocito dev launcher: `node infra/dev/main.js` starts the whole stack, `--setup` only prepares dependencies and `--shutdown` stops a running stack.
// Connected development installs npm and uv dependencies under .local-data; the air-gapped dev image (POCITO_DEPS_DIR) ships them and never installs.
import { spawn, execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, mkdirSync, writeFileSync, copyFileSync, rmSync, constants } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { startPostgres } from './container/postgres.mjs'

const solution = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const repoRoot = (dir => {   // the solution repo itself, or the mother repo when this solution is developed inside it
  while (dir !== dirname(dir) && !existsSync(join(dir, 'nodejs-importmap.js'))) dir = dirname(dir)
  return dir
})(solution)
const envFile = process.env.POCITO_ENV_FILE || join(solution, '.env')
const loadEnv = () => ({...(existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {}), ...process.env})
const stateDir = env => resolve(solution, env.POCITO_DATA_DIR || '.local-data')
const isProcessAlive = pid => {
  if (!(pid > 0)) return false
  try { process.kill(pid, 0); return true } catch { return false }
}
const copyOnce = (from, to) => existsSync(to) || copyFileSync(from, to, constants.COPYFILE_EXCL)

async function shutdownPocito() {
  const pidFile = join(stateDir(loadEnv()), 'pocito-dev.pid'), pid = Number(existsSync(pidFile) && readFileSync(pidFile, 'utf8'))
  if (!isProcessAlive(pid)) { rmSync(pidFile, {force: true}); return console.log('Pocito is not running') }
  process.kill(pid, 'SIGTERM')
  for (let attempt = 0; attempt < 100 && isProcessAlive(pid); attempt++) await delay(100)
  if (isProcessAlive(pid)) throw new Error(`Pocito ${pid} did not stop within 10 seconds`)
  rmSync(pidFile, {force: true})
  console.log('Pocito stopped')
}

// npm dependencies of the repo and the FLAPI mock, plus one uv environment per Python project; returns the bin dir of each environment.
async function prepareDependencies(env, run) {
  const state = stateDir(env), deps = env.POCITO_DEPS_DIR, requestedPython = env.POCITO_PYTHON
  if (!deps) {
    const npmInstall = (env.POCITO_NPM_INSTALL || 'ci').split(/\s+/).filter(Boolean), flapiMock = join(solution, 'infra/dev/flapi-mock')
    for (const [directory, modules] of [[repoRoot, env.POCITO_NODE_MODULES || join(repoRoot, 'node_modules')], [flapiMock, join(flapiMock, 'node_modules')]])
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
  }
  const environments = {}
  for (const [name, project] of [['marketplace-server', 'marketplace-server'], ['agno-server', 'agno-server'], ['litellm', 'infra/dev/litellm']]) {
    const venv = join(deps || state, 'venvs', name), projectDir = join(solution, project)
    if (deps) { if (!existsSync(join(venv, 'bin/python'))) throw new Error(`${venv} is missing from the dev image`) }
    else {
      const stamp = createHash('sha256').update(readFileSync(join(projectDir, 'pyproject.toml'))).update(readFileSync(join(projectDir, 'uv.lock')))
        .update(requestedPython || '').digest('hex'), stampFile = join(venv, '.pocito-lock')
      if (!existsSync(stampFile) || readFileSync(stampFile, 'utf8').trim() !== stamp) {
        const requirements = join(state, `${name}.requirements.txt`)
        await run('uv', ['export', '--frozen', '--no-dev', '--no-emit-project', '--project', projectDir, '--output-file', requirements])
        await run('uv', ['venv', '--clear', ...(requestedPython ? ['--python', requestedPython] : []), '--project', projectDir, venv])
        await run('uv', ['pip', 'sync', '--require-hashes', '--python', join(venv, 'bin/python'), requirements], { stdio: 'inherit' })
        writeFileSync(stampFile, stamp)
      }
    }
    environments[name] = join(venv, 'bin')
  }
  return environments
}

async function startPocito({ setupOnly = false } = {}) {
  process.env.POCITO_DEPS_DIR || copyOnce(join(solution, '.env.example'), envFile)
  const env = loadEnv(), state = stateDir(env), host = env.POCITO_BIND_HOST || '127.0.0.1', offline = !!env.POCITO_DEPS_DIR
  const ports = { pocito: env.POCITO_PORT || '3000', marketplace: env.MARKETPLACE_PORT || '7777',
    agno: env.AGENT_OS_PORT || '7778', litellm: env.LITELLM_PORT || '4000', flapi: env.FLAPI_PORT || '6001' }
  const url = name => `http://localhost:${ports[name]}`
  const minio = env.MINIO_ENDPOINT, storageClass = env.MINIO_STORAGE_CLASS || 'STANDARD_IA', flapiBaseUrl = env.FLAPI_BASE_URL
  const agnoBaseUrl = env.AGNO_API_URL, localAgno = !agnoBaseUrl
  const localLitellm = !env.LITELLM_HOST, litellmHost = (env.LITELLM_HOST || url('litellm')).replace(/\/v1\/?$/, ''), llmModel = env.LLM_MODEL || 'chat'
  const litellmConfig = env.LITELLM_CONFIG || (offline ? '' : join(solution, 'infra/dev/litellm/config.local.yaml'))
  if (!minio) throw new Error('Set MINIO_ENDPOINT in .env')
  if (offline && !flapiBaseUrl) throw new Error('The air-gapped image needs an external FLAPI_BASE_URL')
  if (!offline && !env.PGVECTOR_URL && localAgno) throw new Error('Set PGVECTOR_URL in .env')
  Object.assign(env, {
    ENV_PATH: envFile, WONDER_AUTH_MODE: 'none', STORAGE_PROVIDER: 'minio', MINIO_ENDPOINT: minio,
    MINIO_STORAGE_CLASS: storageClass, WONDER_STORAGE_URL: minio, WONDER_CDN_URL: `${url('pocito')}/jb6_packages/react/lib`,
    WONDER_LOCAL_SERVER: url('pocito'), WONDER_SERVICE_URL: url('pocito'), S3_USE_PATH_STYLE: env.S3_USE_PATH_STYLE || 'true',
    MARKETPLACE_API_URL: url('marketplace'), AGNO_API_URL: agnoBaseUrl || url('agno'), FLAPI_BASE_URL: flapiBaseUrl || url('flapi'),
    FLAPI_TOKEN: env.FLAPI_TOKEN || (flapiBaseUrl ? '' : randomUUID()),
    FLAPI_USERNAME: env.FLAPI_USERNAME || (flapiBaseUrl ? '' : '625navehp'),
    LLM_PROXY_URL: `${url('pocito')}/llmProxy`, LLM_PROXY_MODE: 'onprem', LITELLM_HOST: litellmHost, LLM_MODEL: llmModel,
    OPENAI_BASE_URL: `${litellmHost}/v1`, OPENAI_API_KEY: env.OPENAI_API_KEY || 'unused',
    OPENAI_MODEL: env.OPENAI_MODEL || llmModel.split('/').pop(),
    OPENAI_EMBEDDING_DIMENSIONS: env.OPENAI_EMBEDDING_DIMENSIONS || '1536',
    MARKETPLACE_HOST: host, MARKETPLACE_PORT: ports.marketplace, AGENT_OS_HOST: host, AGENT_OS_PORT: ports.agno,
    MARKETPLACE_DATA_DIR: env.MARKETPLACE_DATA_DIR || join(state, 'marketplace'), MCP_BEARER_TOKEN: '',
    CORS_ALLOWED_ORIGINS: '*', PYTHONUNBUFFERED: '1',
    LITELLM_LOCAL_MODEL_COST_MAP: 'True', LITELLM_LOCAL_POLICY_TEMPLATES: 'true', LITELLM_LOCAL_BLOG_POSTS: 'True'
  })
  mkdirSync(state, { recursive: true })
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
    rmSync(join(state, 'pocito-dev.pid'), {force: true})
    process.exit(code)
  }
  const launch = (file, args, options = {}) => {
    if (stopping) throw new Error('Pocito is stopping')
    const child = spawn(file, args, { cwd: repoRoot, env, detached: true, stdio: ['ignore', 'pipe', 'inherit'], ...options })
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
  const warn = (name, error) => console.warn(`Warning: ${name} failed; continuing: ${error.message || error}`)
  const service = (name, file, args, options = {}) => {   // a dying service stops the stack; the air-gapped container stays up for SSH diagnosis
    const child = launch(file, args, { ...options, stdio: 'inherit' })
    const ended = error => { if (!stopping) offline ? warn(name, error) : stop(1) }
    child.done.then(() => ended('stopped'), ended)
  }
  const waitFor = async (name, check) => {
    for (let attempt = 0; attempt < 120 && !stopping; attempt++) {
      if (await check().catch(() => false)) return
      await delay(500)
    }
    if (offline) return warn(`${name} readiness`, 'timed out after 60 seconds')
    throw new Error(`${name} was not ready within 60 seconds`)
  }
  const ready = async address => (await fetch(address, { signal: AbortSignal.timeout(2000) })).ok
  const healthy = async address => {
    const health = await (await fetch(address, { signal: AbortSignal.timeout(2000) })).json()
    return health.status === 'ok' && health.object_store === 'ok'
  }
  try {
    if (setupOnly) {
      localLitellm && litellmConfig && copyOnce(join(solution, 'infra/dev/litellm/config.yaml'), litellmConfig)
      await prepareDependencies(env, run)
      return console.log(`Pocito dependencies are ready; edit ${envFile}${localLitellm ? ` and ${litellmConfig}` : ''}, then npm run local`)
    }
    const pidFile = join(state, 'pocito-dev.pid'), previousPid = Number(existsSync(pidFile) && readFileSync(pidFile, 'utf8'))
    if (isProcessAlive(previousPid)) throw new Error(`Pocito is already running (${previousPid})`)
    writeFileSync(pidFile, String(process.pid))
    process.once('SIGINT', () => void stop(0))
    process.once('SIGTERM', () => void stop(0))
    const requiredPorts = Object.entries(ports).filter(([name]) => (name !== 'litellm' || localLitellm) && (name !== 'agno' || localAgno))
      .map(([, port]) => port)
    if (new Set(requiredPorts).size !== requiredPorts.length) throw new Error('Service ports must be distinct')
    for (const port of requiredPorts) {
      if (offline) try { execFileSync('fuser', ['-k', `${port}/tcp`], {stdio: 'ignore'}) } catch {}
      await new Promise((ok, fail) => createServer().once('error', () => fail(new Error(`Port ${port} is occupied; stop its owner or configure an external service`)))
        .listen(Number(port), host, function () { this.close(ok) }))
    }
    console.log('Preparing Pocito dependencies')
    const environments = await prepareDependencies(env, run), python = name => join(environments[name], 'python')
    if (offline && localAgno && !env.PGVECTOR_URL) try { startPostgres(env) } catch (error) { warn('PostgreSQL', error) }
    if (localLitellm && litellmConfig) {
      copyOnce(join(solution, 'infra/dev/litellm/config.yaml'), litellmConfig)
      service('LiteLLM', join(environments.litellm, 'litellm'), ['--config', litellmConfig, '--host', host, '--port', ports.litellm])
    } else if (localLitellm) warn('LiteLLM', 'LITELLM_CONFIG is not set')
    service('FLAPI', process.execPath, flapiBaseUrl ? [join(solution, 'infra/dev/flapi-proxy.js')] : ['--import', 'tsx', 'server.ts'],
      flapiBaseUrl ? {env: {...env, PORT: ports.flapi}} : {cwd: join(solution, 'infra/dev/flapi-mock'), env: {...env, MOCK_PORT: ports.flapi}})
    service('Marketplace', python('marketplace-server'), [join(solution, 'marketplace-server/marketplace_server.py')])
    localLitellm && await waitFor('LiteLLM', () => ready(`${litellmHost}/health/liveliness`))
    await waitFor('FLAPI', () => ready(`${url('flapi')}/health`))
    await waitFor('Marketplace', () => healthy(`${url('marketplace')}/healthz`))
    offline || await run(process.execPath, [join(solution, 'e2e-tests/traveling-test/scripts/seed-marketplace-assets.mjs')], {stdio: 'inherit'})
    if (localAgno) service('Agno', python('agno-server'), [join(solution, 'agno-server/agno_server.py')])
    await waitFor('Agno', () => healthy(`${(agnoBaseUrl || url('agno')).replace(/\/$/, '')}/healthz`))
    service('Pocito', process.execPath, ['--import', join(repoRoot, 'nodejs-importmap.js'), join(solution, 'infra/dev/server.js')], {
      env: {...env, PORT: ports.pocito, POCITO_BIND_HOST: host, FLAPI_BASE_URL: url('flapi')}
    })
    await waitFor('Pocito', () => ready(`${url('pocito')}/health`))
    console.log(`Pocito: ${url('pocito')}/applet/wonderAgents\nLiteLLM: ${litellmHost}\nCtrl+C stops the local services.`)
  } catch (error) {
    if (!stopping) console.error(error.message)
    await stop(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await (process.argv.includes('--shutdown') ? shutdownPocito() : startPocito({ setupOnly: process.argv.includes('--setup') }))
