import { jb, coreUtils } from '@jb6/core'
import '@jb6/lang-service'

export const liveRepoSourceImports = async (profile, ctx) => {
  await import(await coreUtils.resolveDeveloperEntryPoint(ctx))
  return coreUtils.calcImportsForProfile(profile, { entryPointPaths: [jb.coreRegistry.developerEntryPoint], ctx })
}
