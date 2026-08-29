// Pocito developer server. Storage is MinIO; default port is 3005.
import { pathToFileURL } from 'node:url'
import { createPocitoApp } from './pocito-app.js'

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  (await createPocitoApp()).listen(Number(process.env.PORT || 3005), '0.0.0.0')
