import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
const pocito = 'solutions/pocito', envFile = process.env.POCITO_ENV_FILE || `${pocito}/.env.onprem`, venvs = '/opt/pocito/venvs'
if (existsSync(envFile)) process.loadEnvFile(envFile)
const env = process.env, minio = env.MINIO_ENDPOINT, port = env.POCITO_PORT || '3007'
const app = `http://localhost:${port}`, marketplace = `http://localhost:${env.MARKETPLACE_PORT || 7777}`
const litellm = (env.LITELLM_HOST || `http://localhost:${env.LITELLM_PORT || 4000}`).replace(/\/v1\/?$/, '')
const internalLiteLlm = !env.LITELLM_HOST, internalAgno = !env.AGNO_API_URL
Object.assign(env, {
  ENV_PATH: envFile, WONDER_AUTH_MODE: 'none', STORAGE_PROVIDER: 'minio', WONDER_STORAGE_URL: minio,
  MARKETPLACE_HOST: '0.0.0.0', AGENT_OS_HOST: '0.0.0.0',
  WONDER_LOCAL_SERVER: `http://localhost:${port}`, WONDER_SERVICE_URL: `http://localhost:${port}`,
  WONDER_CDN_URL: `http://localhost:${port}/jb6_packages/react/lib`, MARKETPLACE_API_URL: marketplace,
  S3_USE_PATH_STYLE: env.S3_USE_PATH_STYLE || 'true',
  LITELLM_HOST: litellm,
  OPENAI_BASE_URL: `${litellm}/v1`, OPENAI_API_KEY: 'unused', OPENAI_MODEL: 'chat',
  AGNO_API_URL: env.AGNO_API_URL || 'http://localhost:7778', LITELLM_LOCAL_MODEL_COST_MAP: 'True',
  LITELLM_LOCAL_POLICY_TEMPLATES: 'true', LITELLM_LOCAL_BLOG_POSTS: 'True'
})
const services = [], start = (file, args, vars = {}) => services.push(spawn(file, args, {env: {...env, ...vars}, stdio: 'inherit'}))
const ready = async url => { while (!await fetch(url).then(response => response.ok).catch(() => false)) await new Promise(ok => setTimeout(ok, 500)) }
if (internalLiteLlm) start(`${venvs}/litellm/bin/litellm`,
  ['--config', env.LITELLM_CONFIG || `${pocito}/on-prem/litellm/config.local.yaml`, '--port', env.LITELLM_PORT || '4000'])
for (const service of ['marketplace', ...(internalAgno ? ['agno'] : [])])
  start(`${venvs}/${service}-server/bin/python`, [`${pocito}/${service}-server/${service}_server.py`])
await Promise.all([ready(`${marketplace}/healthz`), ready(`${env.AGNO_API_URL.replace(/\/$/, '')}/healthz`)])
execFileSync(process.execPath, [`${pocito}/traveling-test/scripts/seed-marketplace-assets.mjs`], {env, stdio: 'inherit'})
start(process.execPath, ['--import', './nodejs-importmap.js', `${pocito}/on-prem/dev/pocito-local-server.js`],
  {LLM_PROXY_MODE: 'onprem', LLM_PROXY_URL: `http://localhost:${port}/llmProxy`, POCITO_BIND_HOST: '0.0.0.0', PORT: port})
const stop = () => services.forEach(service => service.kill())
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, stop)
await Promise.race(services.map(service => new Promise(resolve => service.once('exit', resolve))))
stop()
