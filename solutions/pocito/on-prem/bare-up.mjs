#!/usr/bin/env node
// Bare-process stack, no docker: all four app servers on a machine with just node+npm and python. Windows and Linux.
//   node solutions/pocito/on-prem/bare-up.mjs     (first runs create .env.bare + the venvs, then it starts everything)
// MinIO and postgres/pgvector are NOT started here: point MINIO_ENDPOINT / PGVECTOR_* at reachable ones
// (the docker stack's :58048/:58050, or the site's global services). litellm gets its own venv - its mcp<2 pin
// conflicts with the marketplace's mcp==2 (same isolation as all-in-one.docker).
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'

const onprem = dirname(fileURLToPath(import.meta.url)), root = join(onprem, '..', '..', '..')
const market = join(root, 'solutions', 'pocito', 'marketplace-server')
const win = process.platform == 'win32', exe = name => win ? `${name}.exe` : name
const venvBin = (venv, name) => join(venv, win ? 'Scripts' : 'bin', exe(name))
const die = msg => { console.error(msg); process.exit(1) }
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: 'inherit', ...opts }).status == 0

const envFile = join(onprem, '.env.bare')
if (!existsSync(envFile)) { copyFileSync(join(onprem, '.env.bare.template'), envFile); die(`Created ${envFile} - fill it, then rerun`) }
const config = join(onprem, 'llm-lite-config.yaml')
if (!existsSync(config)) {
  copyFileSync(join(onprem, 'llm-lite-config.template.yaml'), config); die(`Created ${config} - fill the LLM endpoint, then rerun`) }
const fileEnv = Object.fromEntries(readFileSync(envFile, 'utf8').split('\n')
  .map(line => line.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].trim()]))
const env = { ...fileEnv, ...process.env }   // the real environment wins over the file, like compose --env-file
const d = (key, value) => env[key] = env[key] || value
d('SITE_HOST', 'localhost'); d('LLM_MODEL', 'openai/gpt-5-mini')
const base = `${d('SITE_SCHEME', 'http')}://${env.SITE_HOST}`
const ports = { wonder: d('WONDER_PORT', '3000'), market: d('MARKETPLACE_PORT', '7777'), agno: d('AGENT_OS_PORT', '7778'), llm: d('LLM_LITE_PORT', '4000') }
if (!env.MINIO_ENDPOINT) die('Fill MINIO_ENDPOINT in .env.bare - a reachable MinIO (the docker stack :58048, or the global one)')

if (!existsSync(join(root, 'node_modules')))
  run('npm', ['ci'], { cwd: root, shell: win }) || die('npm ci failed - in the gap, extract a carried node_modules tarball at the repo root instead')
const py = env.PYTHON || (win ? 'python' : 'python3'), mvenv = join(market, '.venv'), lvenv = join(onprem, '.venv-litellm')
if (!existsSync(mvenv)) {
  run(py, ['-m', 'venv', mvenv]) || die(`${py} -m venv failed`)
  const req = join(market, 'requirements.txt')
  if (!run(venvBin(mvenv, 'pip'), ['install', '-r', req])) {   // prefer the agno pin; accept any agno when the index cannot satisfy it
    const relaxed = join(tmpdir(), 'wonder-requirements-relaxed.txt')
    writeFileSync(relaxed, readFileSync(req, 'utf8').replace(/^(agno[^=]*)==.*$/m, '$1'))
    run(venvBin(mvenv, 'pip'), ['install', '-r', relaxed]) || die('pip install failed - in the gap, add --no-index --find-links <wheel dir>')
  }
}
if (!existsSync(lvenv)) {   // keep the pins in sync with llm-lite.docker; uvloop has no Windows build
  run(py, ['-m', 'venv', lvenv]) || die(`${py} -m venv failed`)
  run(venvBin(lvenv, 'pip'), ['install', 'litellm==1.98.0', 'fastapi==0.141.1', 'uvicorn>=0.33,<1', 'pyyaml==6.0.3', 'python-multipart',
    'websockets>=15,<16', 'backoff', 'apscheduler', 'orjson', 'pyjwt', 'rq', 'hiredis', 'cryptography', 'pynacl', ...(win ? [] : ['uvloop']),
    'expression>=5.6,<6', 'mcp>=1.28,<2', 'restrictedpython>=8.1,<9', 'fastapi-sso>=0.19,<1', 'rich>=13.9,<14', 'inquirerpy>=0.3,<1'])
    || die('litellm install failed')
}
const dataDir = join(onprem, '.agno-data'); mkdirSync(dataDir, { recursive: true })

const shared = { ...env, PYTHONUNBUFFERED: '1', CORS_ALLOWED_ORIGINS: `${base}:${ports.wonder}`,
  MARKETPLACE_S3_ENDPOINT: env.MINIO_ENDPOINT, MARKETPLACE_S3_ACCESS_KEY: d('S3_ACCESS_KEY', 'wonder'),
  MARKETPLACE_S3_SECRET_KEY: d('S3_SECRET_KEY', 'wonder-minio-local'), MARKETPLACE_S3_BUCKET: d('MARKETPLACE_S3_BUCKET', 'wonder-marketplace'),
  OPENAI_BASE_URL: `${base}:${ports.llm}/v1`, OPENAI_API_KEY: 'unused', OPENAI_MODEL: d('OPENAI_MODEL', 'gpt-5-mini'),
  PGVECTOR_HOST: d('PGVECTOR_HOST', env.SITE_HOST), PGVECTOR_PORT: d('PGVECTOR_PORT', '5432'),
  POSTGRES_DB: d('POSTGRES_DB', 'wonder'), POSTGRES_USER: d('POSTGRES_USER', 'wonder'), POSTGRES_PASSWORD: d('POSTGRES_PASSWORD', 'wonder-pg-local') }
const children = []
const start = (name, cmd, args, { cwd = root, env: extra = {} } = {}) => {
  const child = spawn(cmd, args, { cwd, env: { ...shared, ...extra }, stdio: ['ignore', 'pipe', 'pipe'] })
  const tag = data => data.toString().split('\n').filter(Boolean).forEach(line => console.log(`[${name}] ${line}`))
  child.stdout.on('data', tag); child.stderr.on('data', tag)
  child.on('exit', code => { console.error(`[${name}] exited (${code}) - stopping the stack`); children.forEach(c => c.kill()); process.exit(1) })
  children.push(child)
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { children.forEach(c => c.kill()); process.exit(0) })

start('wonder', process.execPath, ['--import', './nodejs-importmap.js', 'cloud-services/express-server/local-server.js'], { env: {
  WONDER_ENV: 'bare', PORT: ports.wonder, STORAGE_PROVIDER: 'minio', WONDER_AUTH_MODE: 'none',
  WONDER_SERVICE_URL: `http://127.0.0.1:${ports.wonder}`, MARKETPLACE_API_URL: `${base}:${ports.market}`, AGNO_API_URL: `${base}:${ports.agno}`,
  LLM_PROXY_URL: `${base}:${ports.wonder}/llmProxy`, LLM_PROXY_TARGET: `${base}:${ports.llm}` } })
start('marketplace', venvBin(mvenv, 'python'), ['marketplace_server.py'],
  { cwd: market, env: { MARKETPLACE_HOST: '0.0.0.0', MARKETPLACE_PORT: ports.market } })
start('agno', venvBin(mvenv, 'python'), ['agno_server.py'],
  { cwd: market, env: { AGENT_OS_HOST: '0.0.0.0', AGENT_OS_PORT: ports.agno, MARKETPLACE_DATA_DIR: dataDir } })
start('llm-lite', venvBin(lvenv, 'litellm'), ['--config', config, '--port', ports.llm], { cwd: onprem })

console.log(`\nWonder (bare, no docker):
  applets:          ${base}:${ports.wonder}/room/<roomId>/applet/<name>
  marketplace API:  ${base}:${ports.market}/docs
  agno (AgentOS):   ${base}:${ports.agno}/docs
  llm-lite:         ${base}:${ports.llm}/v1/models
Ctrl+C stops everything.`)
