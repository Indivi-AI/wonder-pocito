import { existsSync, statSync } from 'fs'
import { dirname, extname, resolve as resolvePath } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const root = dirname(fileURLToPath(import.meta.url))
const roots = { '@jb6': 'jb6', '@wonder': 'wonder', '@solution': 'solutions', '@indiviai': 'indiviai' }

export async function resolve(specifier, context, nextResolve) {
  const prefix = Object.keys(roots).find(p => specifier === p || specifier.startsWith(`${p}/`))
  if (!prefix) return nextResolve(specifier, context)
  let file = resolvePath(root, roots[prefix], specifier.slice(prefix.length + 1))
  if (existsSync(file) && statSync(file).isDirectory()) file = resolvePath(file, 'index.js')
  if (!extname(file) && existsSync(`${file}.js`)) file += '.js'
  return { url: pathToFileURL(file).href, shortCircuit: true }
}
