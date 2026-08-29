import { createLocalApp } from '../../../cloud-services/express-server/local-server.js'
import { setupFlapiProxyRoute } from './flapi-proxy.js'

export async function createPocitoApp() {
  const app = await createLocalApp()
  setupFlapiProxyRoute(app)
  return app
}
