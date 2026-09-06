import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
const pocito = 'solutions/pocito', envFile = process.env.POCITO_ENV_FILE || `${pocito}/.env.onprem`, venvs = '/opt/pocito/venvs'
if (existsSync(envFile)) process.loadEnvFile(envFile)
const env = process.env, minio = env.MINIO_ENDPOINT
const ports = {pocito: env.POCITO_PORT || '3007', marketplace: env.MARKETPLACE_PORT || '7777',
  agno: env.AGENT_OS_PORT || '7778', litellm: env.LITELLM_PORT || '4000'}
const app = `http://localhost:${ports.pocito}`, marketplace = `http://localhost:${ports.marketplace}`
const litellm = (env.LITELLM_HOST || `http://localhost:${ports.litellm}`).replace(/\/v1\/?$/, '')
const internalLiteLlm = !env.LITELLM_HOST, internalAgno = !env.AGNO_API_URL
Object.assign(env, {
  ENV_PATH: envFile, WONDER_AUTH_MODE: 'none', STORAGE_PROVIDER: 'minio', WONDER_STORAGE_URL: minio,
  MARKETPLACE_HOST: '0.0.0.0', AGENT_OS_HOST: '0.0.0.0',
  WONDER_LOCAL_SERVER: app, WONDER_SERVICE_URL: app,
  WONDER_CDN_URL: `${app}/jb6_packages/react/lib`, MARKETPLACE_API_URL: marketplace,
  S3_USE_PATH_STYLE: env.S3_USE_PATH_STYLE || 'true',
  LITELLM_HOST: litellm,
  OPENAI_BASE_URL: `${litellm}/v1`, OPENAI_API_KEY: 'unused', OPENAI_MODEL: 'chat',
  AGNO_API_URL: env.AGNO_API_URL || `http://localhost:${ports.agno}`, LITELLM_LOCAL_MODEL_COST_MAP: 'True',
  LITELLM_LOCAL_POLICY_TEMPLATES: 'true', LITELLM_LOCAL_BLOG_POSTS: 'True'
})
const services = [], finished = [], warn = (name, error) => console.warn(`Warning: ${name} failed; continuing: ${error.message || error}`)
const start = (name, port, file, args, vars = {}) => {
  try { execFileSync('fuser', ['-k', `${port}/tcp`], {stdio: 'ignore'}) } catch (error) { if (error.status != 1) warn(`port ${port} cleanup`, error) }
  const service = spawn(file, args, {env: {...env, ...vars}, stdio: 'inherit'})
  services.push(service)
  finished.push(new Promise(resolve => {
    service.once('error', error => { warn(name, error); resolve() })
    service.once('exit', code => { if (code) warn(name, `exited with code ${code}`); resolve() })
  }))
}
const ready = async (name, url) => {
  const until = Date.now() + 60000
  while (Date.now() < until) {
    if (await fetch(url, {signal: AbortSignal.timeout(2000)}).then(response => response.ok).catch(() => false)) return
    await new Promise(ok => setTimeout(ok, 500))
  }
  warn(`${name} readiness`, 'timed out after 60 seconds')
}
if (internalLiteLlm && env.LITELLM_CONFIG) start('LiteLLM', ports.litellm, `${venvs}/litellm/bin/litellm`,
  ['--config', env.LITELLM_CONFIG, '--port', ports.litellm], {PYTHONPATH: [`${process.cwd()}/${pocito}/on-prem/litellm`, env.PYTHONPATH].filter(Boolean).join(':')})
else if (internalLiteLlm) warn('LiteLLM', 'LITELLM_CONFIG is not set')
for (const service of ['marketplace', ...(internalAgno ? ['agno'] : [])]) start(service, ports[service],
  `${venvs}/${service}-server/bin/python`, [`${pocito}/${service}-server/${service}_server.py`])
await Promise.all([ready('Marketplace', `${marketplace}/healthz`), ready('Agno', `${env.AGNO_API_URL.replace(/\/$/, '')}/healthz`)])
start('Pocito', ports.pocito, process.execPath, ['--import', './nodejs-importmap.js', `${pocito}/on-prem/dev/pocito-local-server.js`],
  {LLM_PROXY_MODE: 'onprem', LLM_PROXY_URL: `${app}/llmProxy`, POCITO_BIND_HOST: '0.0.0.0', PORT: ports.pocito})
const stop = () => services.forEach(service => service.kill())
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, stop)
await Promise.all(finished)
stop()
