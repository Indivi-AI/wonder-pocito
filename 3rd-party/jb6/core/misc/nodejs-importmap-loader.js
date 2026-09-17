// public/tests/loader.js
import { fileURLToPath, pathToFileURL } from 'url'
import { resolve as resolvePath, dirname, extname } from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const JB6_PREFIX = '@jb6'
const JB6_BASE = resolvePath(__dirname, '../..')

export async function resolve(specifier, context, nextResolve) {
  //console.log('resolving', specifier)
  let candidate = null
  if (specifier === JB6_PREFIX || specifier.startsWith(JB6_PREFIX + '/')) {
    const sub = specifier === JB6_PREFIX ? '' : specifier.slice(JB6_PREFIX.length + 1)
    candidate = resolvePath(JB6_BASE, sub)
  }

  if (candidate) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory())
      candidate = resolvePath(candidate, 'index.js')

    // If no extension, assume .js
    if (!extname(candidate)) {
      const withJs = candidate + '.js'
      if (fs.existsSync(withJs)) candidate = withJs
    }

    return { url: pathToFileURL(candidate).href, shortCircuit: true }
  }

  return nextResolve(specifier, context)
}
