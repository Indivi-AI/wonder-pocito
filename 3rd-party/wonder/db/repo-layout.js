import { coreUtils } from '@jb6/core'
import '@jb6/core/misc/import-map-services.js'

// The repo layout is package.json only: importMap (alias -> served url), staticMappings (served url -> dir), jb6Root (/jb6_packages).
// Published code (applet share, lambda tarball) is laid out by served url, so neither runtime nor storage ever spells a repo directory.
export async function repoLayout() {
  const repoRoot = await coreUtils.calcRepoRoot(), { importMap, staticMappings } = await coreUtils.getStaticServeConfig(repoRoot)
  const { imports } = importMap
  const toDisk = spec => coreUtils.resolveWithImportMap(spec, importMap, staticMappings)   // '@alias/x.js' or '/served/x.js' -> disk path
  const toUrl = disk => {   // disk path -> served url path, undefined when the file is not served
    const served = staticMappings.filter(m => disk.startsWith(`${m.diskPath}/`)).sort((a, b) => b.diskPath.length - a.diskPath.length)[0]
    return served && served.urlPath + disk.slice(served.diskPath.length)
  }
  const toImportUrl = pathOrUrl => {   // disk path or served url -> '@alias/x.js' import specifier
    const disk = toDisk(pathOrUrl)
    return toUrl(disk) && coreUtils.absPathToImportUrl(disk, imports, staticMappings)
  }
  const aliasDirs = Object.fromEntries(Object.entries(imports).filter(([alias, url]) => alias.endsWith('/') && url.endsWith('/'))
    .map(([alias, url]) => [alias.slice(0, -1), toDisk(url.slice(0, -1))]))   // {'@wonder': '<repo>/wonder', '@jb6/core': '<jb6Root>/core'}
  return { repoRoot, imports, staticMappings, toDisk, toUrl, toImportUrl, aliasDirs }
}
