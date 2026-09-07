#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { once } from 'node:events'
import { startOmpGateway } from './omp-minimax.mjs'

const repo = process.env.POCITO_REPO_DIR || '/workspace/repo'
const envFile = process.env.POCITO_ENV_FILE || `${repo}/solutions/pocito/.env.onprem`
if (existsSync(envFile)) process.loadEnvFile(envFile)
const liteLlmBase = (process.env.LITELLM_BASE_URL || process.env.LITELLM_HOST ||
  `http://localhost:${process.env.LITELLM_PORT || 4000}`).replace(/\/$/, '')
process.env.LITELLM_BASE_URL = liteLlmBase.endsWith('/v1') ? liteLlmBase : `${liteLlmBase}/v1`
process.env.LITELLM_API_KEY ||= 'unused'
const {server, baseUrl} = await startOmpGateway(process.env.LITELLM_BASE_URL)
const child = spawn('/opt/pocito/bin/omp', process.argv.slice(2), {env: {...process.env, LITELLM_BASE_URL: baseUrl}, stdio: 'inherit'})
const signals = ['SIGINT', 'SIGTERM', 'SIGHUP']
for (const signal of signals) process.on(signal, () => child.kill(signal))
const [status, signal] = await once(child, 'exit')
server.closeAllConnections()
server.close()
for (const signal of signals) process.removeAllListeners(signal)
if (signal) process.kill(process.pid, signal)
process.exit(status ?? 1)
