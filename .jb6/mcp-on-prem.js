import '@jb6/mcp'
import '@wonder/db/db-drivers-s3-minio.js'
import '@wonder/studio/mcp-tools/wonder-mcp-tools.js'
const pocitoRoot = new URL('../solutions/pocito/', import.meta.url)
const { readdir } = await import('node:fs/promises')
const pocitoFiles = (await readdir(pocitoRoot, { recursive: true }))
  .filter(file => file.endsWith('.js') && !file.split('/').some(part => part.startsWith('.')))
await Promise.all(pocitoFiles.map(file => import(new URL(file, pocitoRoot))))
