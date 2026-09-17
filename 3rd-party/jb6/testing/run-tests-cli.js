#!/usr/bin/env node
import { runTests } from '@jb6/testing'
import child from 'child_process'
import path from 'path'
import { readFile } from 'fs/promises'
import dotenv from 'dotenv'
dotenv.config()

function usage() {
  console.error(`Usage:
  run-tests <module-path> [--test=<name>] [--not=<pattern>] [--pattern=<pattern>] [--take=<number>]
  run-tests --serve      # start HTTP server and open browser`)
  process.exit(1)
}

const raw = process.argv.slice(2)
if (raw.length < 1) usage()

let importPath = raw[0] === 'all' ? '@jb6/testing/all-jb6-tests.js' : raw[0]

const cliParams = raw.slice(1).reduce((acc, arg) => {
  const [key, value] = arg.split('=')
  if (key.startsWith('--')) acc[key.slice(2)] = value
  return acc
}, {})

const params = {
    specificTest: cliParams.test,
    notPattern:   cliParams.not,
    ...Object.fromEntries(
      ['pattern', 'take'].map(k => [k, cliParams[k]])
    )
}

async function main() {
    if (raw.includes('--serve')) {
        const repoRoot = child.execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim()
        const root_pkg = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'))
        const rootPkgName = root_pkg.name

        const modulePath = `@${rootPkgName}/${importPath}`
        const port = process.env.PORT || 8083
        if (!await portInUse(port))
            await import('./jb-web-server.js')
        const queryParams = new URLSearchParams({modulePath, ...cliParams}).toString()

        const url = `http://localhost:${port}/jb6_packages/testing/tests.html?${queryParams}`
        console.log(`🎉 Test UI running at ${url}`)
        child.exec(`open ${url}`)      
    } else {
        const modulePath = importPath.startsWith('.') ? new URL(importPath, `file://${process.cwd()}/`).href : importPath
        await import(modulePath)
        await runTests(params)
    }

    async function portInUse(p) {
        const { createServer } = await import('net')
        return new Promise((res, rej) => {
          const srv = createServer()
          srv.once('error', e => e.code === 'EADDRINUSE' ? res(true) : rej(e))
          srv.once('listening', () => srv.close(() => res(false)))
          srv.listen(p)
        })
    }  
}

await main()


  