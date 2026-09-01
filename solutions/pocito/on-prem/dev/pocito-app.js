import { createLocalApp } from '../../../../cloud-services/express-server/local-server.js'

export async function createPocitoApp() {
  const app = await createLocalApp({ llmProxyMode: process.env.LLM_PROXY_MODE || 'onprem' })
  return app
}
