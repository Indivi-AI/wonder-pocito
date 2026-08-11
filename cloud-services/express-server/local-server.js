import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { jb } from '@jb6/core'
import { createApp } from './app.js'

jb.coreRegistry.repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const port = Number(process.env.PORT || 3000)
;(await createApp('local')).listen(port, '0.0.0.0', () => console.log(`Wonder local server is running on port ${port}`))
