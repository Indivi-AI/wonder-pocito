// Deployed Pocito server for Docker, Kubernetes, and OpenShift. Storage is MinIO/S3.
import { pathToFileURL } from 'node:url'
import { createPocitoApp } from './pocito-app.js'

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  (await createPocitoApp()).listen(Number(process.env.PORT || 8045), '0.0.0.0')
