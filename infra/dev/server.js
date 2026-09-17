// Pocito dev server: Wonder's local server (live repo sources, fs rooms, MCP, studio) plus the Pocito same-origin gateway.
import express from 'express'
import { pathToFileURL } from 'node:url'
import { createLocalApp } from '@wonder/server/local-server.js'
import { setupPocitoGateway } from '../gateway.js'

export async function createPocitoApp() {
  const app = express()
  setupPocitoGateway(app)
  return createLocalApp({ app, llmProxyMode: process.env.LLM_PROXY_MODE || 'onprem' })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  (await createPocitoApp()).listen(Number(process.env.PORT || 3000), process.env.POCITO_BIND_HOST || '127.0.0.1')
