// Local source and applet files; publishing uses the configured MinIO.
import { pathToFileURL } from 'node:url'
import { createPocitoApp } from './pocito-app.js'

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  (await createPocitoApp()).listen(Number(process.env.PORT || 3000), process.env.POCITO_BIND_HOST || '127.0.0.1')
