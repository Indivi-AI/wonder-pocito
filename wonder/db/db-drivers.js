import '@wonder/db/db-drivers-core.js'
import '@wonder/db/db-drivers-signed-room.js'
if ((globalThis.WONDER_STORAGE_PROVIDER || globalThis.process?.env?.STORAGE_PROVIDER) === 'minio')
  await import('@wonder/db/db-drivers-s3-minio.js')
