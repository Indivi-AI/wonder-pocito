import '@jb6/mcp'
import '@wonder/db/db-drivers-s3-minio.js'
import '@wonder/studio/mcp-tools/wonder-mcp-tools.js'
const idfRoot = new URL('../solutions/idf/', import.meta.url)
const { readdir } = await import('node:fs/promises')
const idfFiles = (await readdir(idfRoot, { recursive: true }))
  .filter(file => file.endsWith('.js') && !file.split('/').some(part => part.startsWith('.')))
await Promise.all(idfFiles.map(file => import(new URL(file, idfRoot))))
