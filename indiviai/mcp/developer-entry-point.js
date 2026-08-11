import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export const developerEntryPoint = () => {
  const email = execFileSync('git', ['config', 'user.email'], { encoding: 'utf8' }).trim()
  const id = email.split('@')[0], path = resolve(here, `entry-points-${id}.js`)
  if (!existsSync(path)) throw new Error(`missing MCP entry point for ${id}: ${path}`)
  return path
}
