import { coreUtils } from '@jb6/core'
import '@jb6/core/misc/import-map-services.js'

await import(await coreUtils.resolveDeveloperEntryPoint())
