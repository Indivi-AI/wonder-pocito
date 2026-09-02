#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const repo = process.env.POCITO_REPO_DIR || '/workspace/repo'
const envFile = process.env.POCITO_ENV_FILE || `${repo}/solutions/pocito/.env.onprem`
if (existsSync(envFile)) process.loadEnvFile(envFile)
const liteLlmBase = (process.env.LITELLM_BASE_URL || process.env.LITELLM_HOST ||
  `http://localhost:${process.env.LITELLM_PORT || 4000}`).replace(/\/$/, '')
process.env.LITELLM_BASE_URL = liteLlmBase.endsWith('/v1') ? liteLlmBase : `${liteLlmBase}/v1`
process.env.LITELLM_API_KEY ||= 'unused'
const result = spawnSync('/opt/pocito/bin/omp', process.argv.slice(2), {env: process.env, stdio: 'inherit'})
if (result.signal) process.kill(process.pid, result.signal)
process.exit(result.status ?? 1)
