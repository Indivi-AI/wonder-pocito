import { createLocalApp } from '../../../../cloud-services/express-server/local-server.js'
import express from 'express'
import { setupPocitoGateway } from './pocito-gateway.js'

export async function createPocitoApp() {
  const app = express()
  setupPocitoGateway(app)
  return createLocalApp({ app, llmProxyMode: process.env.LLM_PROXY_MODE || 'onprem' })
}
