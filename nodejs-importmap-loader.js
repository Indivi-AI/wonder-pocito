import { existsSync, readFileSync, statSync } from 'fs'
import { dirname, extname, resolve as resolvePath } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

// alias roots come from package.json: importMap (alias -> served url), staticMappings (served url -> dir), jb6Root (/jb6_packages)
const root = dirname(fileURLToPath(import.meta.url))
const { importMap = {}, staticMappings = {}, jb6Root = 'node_modules/@jb6' } = JSON.parse(readFileSync(resolvePath(root, 'package.json'), 'utf8'))
const dirs = { '/jb6_packages': jb6Root, ...staticMappings }
const urlToDir = url => {
  const served = Object.keys(dirs).find(u => url === u || url.startsWith(`${u}/`))
  return served && resolvePath(root, dirs[served], url.slice(served.length + 1))
}
const roots = { '@jb6': resolvePath(root, jb6Root),
  ...Object.fromEntries(Object.entries(importMap).map(([alias, url]) => [alias.replace(/\/$/, ''), urlToDir(url.replace(/\/$/, ''))])) }

export async function resolve(specifier, context, nextResolve) {
  const prefix = Object.keys(roots).find(p => roots[p] && (specifier === p || specifier.startsWith(`${p}/`)))
  if (!prefix) return nextResolve(specifier, context)
  let file = resolvePath(roots[prefix], specifier.slice(prefix.length + 1))
  if (existsSync(file) && statSync(file).isDirectory()) file = resolvePath(file, 'index.js')
  if (!extname(file) && existsSync(`${file}.js`)) file += '.js'
  return { url: pathToFileURL(file).href, shortCircuit: true }
}
