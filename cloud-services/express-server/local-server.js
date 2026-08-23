import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { jb } from '@jb6/core'
import { createApp } from './app.js'

const dir = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(dir, '.env.dev'), override: true })
jb.coreRegistry.repoRoot = path.resolve(dir, '../..')
const port = Number(process.env.PORT || 3000)
;(await createApp('local')).listen(port, '0.0.0.0', () => console.log(`Wonder local server is running on port ${port}`))
