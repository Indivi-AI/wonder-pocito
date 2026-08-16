import { dsls, coreUtils, jb } from '@jb6/core'
import '@wonder/db/db-drivers.js'

const { wfetch2, wresolve, getAccessToken } = jb.wonderUtils
import '@jb6/common'
import '@jb6/mcp'
import '@jb6/react'
import '@jb6/mcp/mcp-utils.js'
import '@wonder/ai/llm-flow-main-workflow.js'
import '@jb6/probe-studio/probe-studio.js'

const { extendWithWorkflowVars } = jb.workflowUtils
const {
  tgp: { Component },
  common: { 
    data: { mcpTool, pipe, squeezeText, wFetch: wFetchData }
  },
  mcp: { Tool },
  react: { ReactComp,
    'react-comp': { comp },
    'react-metadata': { mcpUi }
  }
} = dsls

export const exportedTools = ['runWorkflow', 'biglogContent', 'listBiglogs', 'BiglogViewerInRoom', 'wFetch', 'updateLambdasAndApplets']

Tool('wFetch', {
  description: 'read db-driver.js . wUrl = <scheme>://<roomId>/<dir>/<file>?user=<id>; room:// public, signedRoom:// protected (dirs admin/ usersRO/ usersRW/)',
  params: [
    {id: 'url', as: 'string', asIs: true, mandatory: true,
      description: 'room wUrl; trailing slash lists, and ?jq=<encoded-expression> slices JSON'},
    {id: 'method', as: 'string', defaultValue: 'GET', options: 'GET,PUT,POST,PATCH,HEAD'},
    {id: 'body', asIs: true,
      description: 'JSON body; PUT replaces, POST appends, PATCH merges. x-wonder-body:localFile makes it a file path.'},
    {id: 'headers', asIs: true, description: 'JSON object of extra headers. {"x-wonder-body":"localFile"} streams the file at `body` path (for binary: parquet/jpg/mp4).'},
    {id: 'logger', as: 'string', defaultValue: 'dbLogger', description: 'comma-separated loggers to harvest; result returns {result, ...logs}'},
  ],
  impl: mcpTool({
    text: async (ctx, {}, {url, method, body, headers, logger}) => {
      try {
        // headers/body arrive either as a real object (mcp tool-use client) or a JSON string (curl/SSE). Accept both; give future LLMs a precise fix when neither.
        const asObj = (v, name) => {
          if (v == null || typeof v === 'object') return v
          if (typeof v !== 'string') throw new Error(`wFetch '${name}' must be a JSON object or JSON string, got ${typeof v}. Read the '${name}' param description.`)
          if (v.includes('[object Object]'))
            throw new Error(`wFetch '${name}' was stringified upstream; pass it as a JSON object`)
          try { return JSON.parse(v) }
          catch { throw new Error(`wFetch '${name}' is not valid JSON: ${v.slice(0,80)}`) }
        }
        const hdrs = asObj(headers, 'headers')
        const rawBody = hdrs?.['x-wonder-body'] === 'localFile' ? body : asObj(body, 'body')
        const res = await dsls.common.data.wFetch.$runWithCtx(ctx, { url, method, logger, ...(hdrs && { headers: hdrs }), ...(body != null && { body: rawBody }) })
        return JSON.stringify(res, null, 2)
      } catch (e) {
        coreUtils.logException(e, 'wFetch', { url, method })
        return `Error wFetch: ${e.stack || e}`
      }
    }
  })
})

const shortenDataUrls = obj => JSON.parse(JSON.stringify(obj, (_, v) =>
  typeof v === 'string' && (v.includes('data:image') || (v.length > 500 && /[A-Za-z0-9+/]{100,}/.test(v)))
    ? v.slice(0, 100) + `...[truncated ${Math.round(v.length/1024)}KB]` : v))
const namesFromMetadata = xs => (xs || []).map(x => x.name?.split('/').pop()).filter(x => x?.startsWith('metadata-')).map(x => x.replace(/^metadata-/, ''))

// phaseTimer: call phase(name) after each step → timeline of {phase, ms:step, atMs:cumulative}; totalMs = sum.
const phaseTimer = (t0 = Date.now(), last = t0, timeline = []) => ({ timeline,
  phase: name => (timeline.push({ phase: name, ms: Date.now() - last, atMs: Date.now() - t0 }), last = Date.now()),
  get totalMs() { return Date.now() - t0 } })

Tool('runWorkflow', {
  description: 'Run a Wonder workflow in a room. Returns the workflow result including responseText and biglog path.',
  params: [
    {id: 'userMessage', as: 'string', asIs: true, description: 'The user message/query to process'},
    {id: 'roomId', as: 'string', description: 'The room ID to run the workflow in'},
    {id: 'userId', as: 'string', description: 'The user ID'},
    {id: 'workflowName', as: 'string', defaultValue: 'checheLlmFlow', description: 'Workflow name from registry (default: checheLlmFlow)'},
  ],
  impl: mcpTool(async (ctx, {}, {userMessage, roomId, userId, workflowName}) => {
    try {
      const wfProfile = dsls.workflow.workflow[workflowName]
      if (!wfProfile) return `Workflow not found: ${workflowName}. Available: ${Object.keys(dsls.workflow.workflow).join(', ')}`
      const wfCtx = await extendWithWorkflowVars(new coreUtils.Ctx().setVars({userMessage, roomId, userId, accumulatedContext: {chatHistory: []}}))
      const wf = wfProfile.$runWithCtx(wfCtx)
      const result = await wf.calcWorkflow(wfCtx)
      return JSON.stringify(result, null, 2)
    } catch(error) {
      return JSON.stringify({ error: error.stack })
    }
  })
})

const CDN_BUCKET = 'wonder-code-packages'
const lambdaTraversalBlockers = /\/(lib|static-wasm|lang-service)\//
const lambdaTestEntry = /\/(tests?\/|[^/]*-tests?\.js$)/

const repoScopes = { '@wonder': 'wonder', '@jb6': 'jb6', '@indiviai': 'indiviai', '@solution': 'solutions' }
const toAbsolute = (u, baseDir, path) => {
  const prefix = Object.keys(repoScopes).find(p => u === p || u.startsWith(`${p}/`))
  return prefix ? path.join(baseDir, repoScopes[prefix], u.slice(prefix.length + 1)) : path.join(baseDir, u.replace(/^\//, ''))
}

export async function uploadCompDependencies(urlsToLoad, onVersion) {
  const timer = phaseTimer()   // full timeline of the real bundle+upload work (inside the cli child), not the mcp round-trip
  const path = await import('path')
  const fsp = await import('fs/promises')
  const esbuild = await import('esbuild')
  const { Pool } = await import('undici')
  timer.phase('imports')

  const baseDir = await coreUtils.calcRepoRoot()
  const dbCtx = new coreUtils.Ctx().setVars({ db: 'gcs' })

  const sourceFiles = urlsToLoad.split(',').map(f => f.trim()).filter(Boolean)
  if (!sourceFiles.length) throw new Error('no source files')
  const entries = [...sourceFiles, '@jb6/react/tests/react-testers.js', '@wonder/db/oauth2.js']

  const sourceScopes = Object.keys(repoScopes)
  const assets = new Set()
  const result = await esbuild.build({
    stdin: { contents: entries.map(f => `import '${toAbsolute(f, baseDir, path)}'`).join('\n'), resolveDir: baseDir },
    bundle: true, write: false, metafile: true, format: 'esm', platform: 'browser', logLevel: 'silent',
    alias: Object.fromEntries(Object.entries(repoScopes).map(([scope, dir]) => [scope, path.join(baseDir, dir)])),
    plugins: [{
      name: 'imports-only',
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, args =>
          sourceScopes.some(s => args.path === s || args.path.startsWith(s + '/')) ? null : { path: args.path, external: true })
        b.onLoad({ filter: /\.m?js$/ }, async args => {
          const src = await fsp.readFile(args.path, 'utf8')
          const importLines = []
          // static import/export ... from '...' (line-start) + dynamic import('...') ANYWHERE (e.g. `await import('./oauth2.js')`)
          const re = /^\s*(?:import\s+(?:[^'"`;\n]*from\s+)?['"`]([^'"`]+)['"`]|export\s+(?:[^'"`;\n]*from\s+)['"`]([^'"`]+)['"`])|import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/gm
          let m
          while ((m = re.exec(src))) { const spec = m[1] || m[2] || m[3]; if (!spec.includes('${')) importLines.push(`import '${spec}'`) }   // skip template-literal dynamic paths
          const assetRe = /new\s+URL\(\s*['"`]([^'"`]+)['"`]\s*,\s*import\.meta\.url\s*\)/g
          while ((m = assetRe.exec(src))) {
            const abs = path.resolve(path.dirname(args.path), m[1])
            if ((await fsp.stat(abs).catch(() => null))?.isFile()) {
              assets.add(path.relative(baseDir, abs))
              if (/\.m?js$/.test(abs)) importLines.push(`import '${abs}'`)
            }
          }
          return { contents: importLines.join('\n'), loader: 'js' }
        })
      }
    }]
  })
  timer.phase('esbuildGraph')

  const inputs = [...new Set([...Object.keys(result.metafile.inputs), ...assets])]
    .filter(f => !f.includes('node_modules') && f !== '<stdin>' && !/(^|\/)jb6\/react\/lib\//.test(f))
  // Repository paths already match the browser snapshot layout.
  const relForUpload = f => f

  const d = new Date()
  const appletV = `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    + `-${Math.random().toString(36).slice(2,6)}`
  timer.phase('versions')
  const resolved = await wresolve(`codePackages://shared/${appletV}/${relForUpload(inputs[0])}`, dbCtx, 'PUT')
  const [, bucket, prefix] = resolved.match(/storage\.googleapis\.com\/([^/]+)\/(.*)$/)   // prefix = shared/<appletV>/<rel[0]>
  const gcsPrefix = prefix.slice(0, prefix.length - relForUpload(inputs[0]).length)        // strip rel[0] → shared/<appletV>/
  const token = await getAccessToken(dbCtx, { method: 'PUT' })
  const auth = { authorization: `Bearer ${token}` }
  const ctypeOf = f => /\.mjs$|\.js$/.test(f) ? 'text/javascript' : /\.wasm$/.test(f) ? 'application/wasm'
    : /\.css$/.test(f) ? 'text/css' : /\.json$/.test(f) ? 'application/json' : 'application/octet-stream'
  const bodies = await Promise.all(inputs.map(f => fsp.readFile(path.resolve(baseDir, f))))
  const pool = new Pool('https://storage.googleapis.com', { connections: inputs.length + 1, pipelining: 1, keepAliveTimeout: 60000 })
  const put = async (f, body) => {
    const r = await pool.request({ method: 'PUT', path: `/${bucket}/${encodeURI(gcsPrefix + relForUpload(f))}`, headers: { ...auth, 'content-type': ctypeOf(f) }, body })
    await r.body.dump()
    if (r.statusCode >= 400) throw new Error(`PUT ${relForUpload(f)} → ${r.statusCode}`)
  }
  try { await Promise.all([onVersion?.({ appletV, dbCtx }), ...inputs.map((f, i) => put(f, bodies[i]))]) } finally { await pool.close() }
  timer.phase('upload')

  return { appletV, fileCount: inputs.length, uploadMs: timer.totalMs, timeline: timer.timeline }
}

// Primitive: bundle entry (node flavor) → full source closure (admin + public + jb6 sources, no /lib/),
// tar.gz + upload to lambdas/<lambdaV>.tar.gz. Returns lambdaV = MMDD-HHMM-<gitSha>[-<rand>].
// Exported so it runs in a jb-cli child (host realm) via runCliInContext, not inside the MCP VM.
export async function uploadLambdaCompDependencies(entryPath) {
  const timer = phaseTimer()   // full timeline of the real bundle+tar+upload work
  const path = await import('path')
  const fsp = await import('fs/promises')
  const esbuild = await import('esbuild')
  const { execSync } = await import('child_process')
  const { Pool } = await import('undici')
  const tar = await import('tar')
  timer.phase('imports')

  const baseDir = await coreUtils.calcRepoRoot()
  const dbCtx = new coreUtils.Ctx().setVars({ db: 'gcs' })
  // Version identity = git sha + entry path. Clean tree → deterministic reuse per package entry.
  // Dirty tree → `MMDD-HHMM-<gitSha>-<rand>` so every uncommitted change rebuilds. Computed first to allow early reuse.
  const gitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf8', cwd: baseDir }).trim()
  const entryHash = (await import('crypto')).createHash('sha1').update(entryPath).digest('hex').slice(0, 6)
  const isDirty = execSync('git status --porcelain', { encoding: 'utf8', cwd: baseDir }).trim().length > 0
  const d = new Date()
  const datePart = `${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
    + `-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`
  const dirtySuffix = Math.random().toString(36).slice(2, 8)
  const lambdaV = isDirty ? `${datePart}-${gitSha}-${entryHash}-${dirtySuffix}` : `${gitSha}-${entryHash}`
  const runtimeBase = `/tmp/code/${lambdaV}`
  if (!isDirty) {   // rebuild-on-change: clean sha already uploaded ⇒ skip esbuild/stage/tar/PUT
    const head = await wfetch2(`codePackages://lambdas/${lambdaV}.tar.gz`, { method: 'HEAD' }, dbCtx).catch(() => null)
    timer.phase('reuseCheck')
    if (head?.ok) return { lambdaV, reused: true, gitSha, isDirty, runtimeBase,
      uploadMs: timer.totalMs, timeline: timer.timeline,
      description: `version ${gitSha} built ${head.headers?.get('last-modified') || 'unknown date'}` }
  }

  const pkg = JSON.parse(await fsp.readFile(path.join(baseDir, 'package.json'), 'utf8'))
  const nodeBuiltins = ['fs', 'fs/promises', 'path', 'url', 'util', 'crypto', 'child_process', 'zlib', 'stream',
    'events', 'http', 'https', 'net', 'os', 'tls', 'querystring', 'buffer', 'v8']
  const externals = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {}),
    ...nodeBuiltins, ...nodeBuiltins.map(n => 'node:' + n)]

  const absEntry = toAbsolute(entryPath, baseDir, path)
  const testEntry = lambdaTestEntry.test(`/${entryPath}`)
  const importGraph = new Map()
  const graphId = file => path.basename(file || '<entry>').replace(/\.(m?js)$/, '')
  // imports-only plugin: bypasses parser errors in some jb6 source files; we only need the graph.
  const result = await esbuild.build({
    stdin: { contents: `import '${absEntry}'\nimport '@jb6/core/misc/jb-remote.js'`, resolveDir: baseDir },
    bundle: true, write: false, metafile: true, format: 'esm', platform: 'node',
    external: externals,
    packages: 'external',
    alias: Object.fromEntries(Object.entries(repoScopes).map(([scope, dir]) => [scope, path.join(baseDir, dir)])),
    logLevel: 'silent',
    plugins: [{
      name: 'imports-only',
      setup(b) {
        b.onResolve({ filter: /.*/ }, args => {
          const resolved = path.isAbsolute(args.path) ? args.path
            : args.path.startsWith('.') ? path.resolve(args.resolveDir, args.path) : toAbsolute(args.path, baseDir, path)
          const source = `/${args.path}\n/${resolved}`
          const blocked = lambdaTraversalBlockers.test(source) || !testEntry && lambdaTestEntry.test(source)
          const action = blocked ? 'blocked' : 'traverse'
          const from = graphId(args.importer), to = `${graphId(resolved)}${action === 'blocked' ? ':blocked' : ''}`
          if (from !== to) importGraph.set(from, new Set([...(importGraph.get(from) || []), to]))
          if (action === 'blocked') return { path: args.path, external: true }
        })
        b.onLoad({ filter: new RegExp('\\.js$') }, async args => {
          const src = await fsp.readFile(args.path, 'utf8')
          const importLines = []
          // static import/export ... from '...' (line-start) + dynamic import('...') ANYWHERE (e.g. `await import('./oauth2.js')`)
          const re = /^\s*(?:import\s+(?:[^'"`;\n]*from\s+)?['"`]([^'"`]+)['"`]|export\s+(?:[^'"`;\n]*from\s+)['"`]([^'"`]+)['"`])|import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/gm
          let m
          while ((m = re.exec(src))) { const spec = m[1] || m[2] || m[3]; if (!spec.includes('${')) importLines.push(`import '${spec}'`) }   // skip template-literal dynamic paths
          return { contents: importLines.join('\n'), loader: 'js' }
        })
      }
    }]
  })

  timer.phase('esbuildGraph')

  const inputs = Object.keys(result.metafile.inputs)
    .filter(f => !f.includes('node_modules'))
    .filter(f => !lambdaTraversalBlockers.test(`/${f}`))
    .filter(f => testEntry || !lambdaTestEntry.test(`/${f}`))
    .filter(f => f !== '<stdin>')

  // Source paths already match the per-version layout.
  const relForUpload = f => f

  // Stage files into a tmp dir, preserving wonder/, jb6/, indiviai/, and solutions/.
  const stageRoot = `/tmp/lambda-stage-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
  await fsp.mkdir(stageRoot, { recursive: true })
  for (const f of inputs) {
    const abs = path.resolve(baseDir, f)
    const target = path.join(stageRoot, relForUpload(f))
    await fsp.mkdir(path.dirname(target), { recursive: true })
    await fsp.copyFile(abs, target)
  }
  timer.phase('stage')

  // Generate per-share loader with absolute paths baked in
  const loaderJs = `import { existsSync, statSync } from 'fs'
import { extname } from 'path'
import { pathToFileURL, fileURLToPath } from 'url'
import { builtinModules, createRequire } from 'module'

const BASE = '${runtimeBase}'
const hostRequire = createRequire('/usr/src/app/package.json')
const MAP = {
  '@wonder':       BASE + '/wonder',
  '@jb6':          BASE + '/jb6',
  '@indiviai':     BASE + '/indiviai',
  '@solution':     BASE + '/solutions'
}
export async function resolve(specifier, context, nextResolve) {
  for (const [prefix, base] of Object.entries(MAP)) {
    if (specifier === prefix || specifier.startsWith(prefix + '/')) {
      let cand = base + specifier.slice(prefix.length)
      if (existsSync(cand) && statSync(cand).isDirectory()) cand += '/index.js'
      if (!extname(cand) && existsSync(cand + '.js')) cand += '.js'
      return { url: pathToFileURL(cand).href, shortCircuit: true }
    }
  }
  if (!builtinModules.includes(specifier) && !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('file:'))
    try { return { url: pathToFileURL(hostRequire.resolve(specifier)).href, shortCircuit: true } } catch {}
  const resolved = await nextResolve(specifier, context)
  if (resolved.url.startsWith('file:') && !fileURLToPath(resolved.url).startsWith(BASE + '/'))
    throw new Error('lambda import outside package: ' + specifier)
  return resolved
}
`
  const importmapJs = `import { register } from 'node:module'
register('./loader.mjs', import.meta.url)
`
  await fsp.writeFile(path.join(stageRoot, 'loader.mjs'), loaderJs)
  await fsp.writeFile(path.join(stageRoot, 'importmap.mjs'), importmapJs)
  await fsp.writeFile(path.join(stageRoot, 'index.js'), `import '${entryPath}'\n`)

  // Tar + gzip
  const tarBuffer = await new Promise(async (res, rej) => {
    const chunks = []
    const stream = tar.create({ gzip: true, cwd: stageRoot }, await fsp.readdir(stageRoot))
    stream.on('data', c => chunks.push(c))
    stream.on('end', () => res(Buffer.concat(chunks)))
    stream.on('error', rej)
  })
  timer.phase('tarGzip')

  // direct-to-GCS PUT of the tar (same fast path as the applet upload) — resolve bucket/key, mint write token, one keep-alive Pool.
  const resolved = await wresolve(`codePackages://lambdas/${lambdaV}.tar.gz`, dbCtx, 'PUT')
  const [, bucket, key] = resolved.match(/storage\.googleapis\.com\/([^/]+)\/(.*)$/)
  const token = await getAccessToken(dbCtx, { method: 'PUT' })
  const pool = new Pool('https://storage.googleapis.com', { keepAliveTimeout: 60000 })
  try {
    const r = await pool.request({ method: 'PUT', path: `/${bucket}/${encodeURI(key)}`,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/gzip' }, body: tarBuffer })
    await r.body.dump()
    if (r.statusCode >= 400) throw new Error(`PUT ${lambdaV}.tar.gz → ${r.statusCode}`)
  } finally { await pool.close() }
  await fsp.rm(stageRoot, { recursive: true, force: true })
  timer.phase('upload')

  return { lambdaV, fileCount: inputs.length, tarBytes: tarBuffer.length, gitSha, isDirty, runtimeBase,
    importGraph: Object.fromEntries([...importGraph].map(([from, to]) => [from, [...to].join(',')])), uploadMs: timer.totalMs, timeline: timer.timeline }
}

Tool('uploadAdHokSnippetForAdmin', {
  description: 'Upload an admin entry with its full Node-side dependency closure to GCS. POST a TGP profile to /admin-run-snippet/<lambdaV> to execute.',
  params: [
    {id: 'entryPath', as: 'string'}
  ],
  impl: mcpTool(async (ctx, {}, {entryPath}) => {
    // Run in a jb-cli child (host realm) — esbuild etc. don't work in the MCP VM realm.
    const script = `
import { uploadLambdaCompDependencies } from '@wonder/studio/mcp-tools/wonder-mcp-tools.js'
import { coreUtils } from '@jb6/core'
await coreUtils.writeServiceResult(await uploadLambdaCompDependencies(${JSON.stringify(entryPath)}))`
    await coreUtils.calcJb6RepoRootAndImportMapsInCli()
    const { result, error } = await coreUtils.runCliInContext(script, { importMapsInCli: jb.coreRegistry.importMapsInCli })
    if (error) return JSON.stringify({ error })
    const { lambdaV, fileCount, tarBytes, gitSha, isDirty, reused, description, uploadMs, timeline } = result
    return JSON.stringify({
      lambdaV, fileCount, tarBytes, gitSha, isDirty, reused: !!reused, uploadMs, timeline, ...(description && { description }),
      localUrl:   `http://localhost:3000/admin-run-snippet/${lambdaV}`,
      stagingUrl: `https://staging.indivi.ai/admin-run-snippet/${lambdaV}`,
      prodUrl:    `https://wonder.indivi.ai/admin-run-snippet/${lambdaV}`
    })
  })
})

Tool('applyProtectedRoomPolicy', {
  description: 'Apply a protected room admin/room-iam-policy.json to the AWS IAM group WONDER_ADMINS.',
  params: [{id: 'roomId', as: 'string', mandatory: true, description: 'room id or protected room wUrl'}],
  impl: mcpTool(async (ctx, {}, {roomId}) => {
    const roomWUrl = await jb.wonderUtils.resolveWUrl(roomId, ctx)
    if (!roomWUrl.startsWith('protected://')) throw new Error(`${roomWUrl} is not a protected room`)
    const resolvedRoomId = roomWUrl.split('://')[1]
    const policy = await (await wfetch2(`${roomWUrl}/admin/room-iam-policy.json`, { method: 'GET' }, ctx)).json()
    const bucketArn = 'arn:aws:s3:::wonder-rooms-585008076838'
    const statements = policy?.Statement || [], resources = statements.flatMap(({Resource}) => [Resource].flat())
    if (policy?.Version !== '2012-10-17' || !statements.length
      || statements.some(({Action}) => [Action].flat().some(action => !action.startsWith('s3:')))
      || resources.some(resource => resource !== bucketArn && !resource.startsWith(`${bucketArn}/${resolvedRoomId}/`)))
      throw new Error(`invalid protected-room IAM policy for ${resolvedRoomId}`)
    const script = `
import { execFileSync } from 'node:child_process'
import { coreUtils } from '@jb6/core'
const group = 'WONDER_ADMINS', policyName = ${JSON.stringify(`WonderRoom-${resolvedRoomId}`)}
const policy = ${JSON.stringify(policy)}
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)
let before
try { before = JSON.parse(execFileSync('aws', ['iam', 'get-group-policy', '--group-name', group,
  '--policy-name', policyName, '--output', 'json'], { encoding: 'utf8' })).PolicyDocument } catch {}
const changed = canonical(before) !== canonical(policy)
if (changed) execFileSync('aws', ['iam', 'put-group-policy', '--group-name', group,
  '--policy-name', policyName, '--policy-document', JSON.stringify(policy)], { stdio: 'pipe' })
await coreUtils.writeServiceResult({ group, policyName, roomWUrl: ${JSON.stringify(roomWUrl)}, changed })`
    await coreUtils.calcJb6RepoRootAndImportMapsInCli()
    const { result, error } = await coreUtils.runCliInContext(script, { importMapsInCli: jb.coreRegistry.importMapsInCli })
    if (error || result?.error) return JSON.stringify({ error: result?.error || error, roomWUrl })
    return JSON.stringify(result)
  })
})

Tool('applyRoomPublicPolicy', {
  description: 'Merge a protected room admin/room-public-policy.json into its S3 bucket policy.',
  params: [{id: 'roomId', as: 'string', mandatory: true, description: 'room id or protected room wUrl'}],
  impl: mcpTool(async (ctx, {}, {roomId}) => {
    const roomWUrl = await jb.wonderUtils.resolveWUrl(roomId, ctx)
    if (!roomWUrl.startsWith('protected://')) throw new Error(`${roomWUrl} is not a protected room`)
    const resolvedRoomId = roomWUrl.split('://')[1], bucket = 'wonder-rooms-585008076838'
    const policy = await (await wfetch2(`${roomWUrl}/admin/room-public-policy.json`, { method: 'GET' }, ctx)).json()
    const prefix = `arn:aws:s3:::${bucket}/${resolvedRoomId}/`, statements = policy?.Statement || []
    if (policy?.Version !== '2012-10-17' || !statements.length
      || statements.some(({Effect, Principal, Action, Resource}) => Effect !== 'Allow' || Principal !== '*'
        || [Action].flat().some(action => action !== 's3:GetObject')
        || [Resource].flat().some(resource => !resource.startsWith(prefix))))
      throw new Error(`invalid room public policy for ${resolvedRoomId}`)
    const script = `
import { execFileSync } from 'node:child_process'
import { coreUtils } from '@jb6/core'
const bucket = ${JSON.stringify(bucket)}, roomPrefix = ${JSON.stringify(prefix)}, roomPolicy = ${JSON.stringify(policy)}
const aws = args => execFileSync('aws', args, { encoding: 'utf8' })
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)
let current = { Version: '2012-10-17', Statement: [] }
try { current = JSON.parse(JSON.parse(aws(['s3api', 'get-bucket-policy', '--bucket', bucket, '--query',
  'Policy', '--output', 'json']))) } catch {}
const belongsToRoom = statement => [statement.Resource].flat().some(resource => resource?.startsWith(roomPrefix))
const merged = { Version: '2012-10-17',
  Statement: [...current.Statement.filter(statement => !belongsToRoom(statement)), ...roomPolicy.Statement] }
const changed = canonical(current) !== canonical(merged)
aws(['s3api', 'put-public-access-block', '--bucket', bucket, '--public-access-block-configuration',
  'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false'])
if (changed) aws(['s3api', 'put-bucket-policy', '--bucket', bucket, '--policy', JSON.stringify(merged)])
await coreUtils.writeServiceResult({ roomWUrl: ${JSON.stringify(roomWUrl)}, changed,
  publicResources: roomPolicy.Statement.flatMap(statement => [statement.Resource].flat()) })`
    await coreUtils.calcJb6RepoRootAndImportMapsInCli()
    const { result, error } = await coreUtils.runCliInContext(script, { importMapsInCli: jb.coreRegistry.importMapsInCli })
    if (error || result?.error) return JSON.stringify({ error: result?.error || error, roomWUrl })
    return JSON.stringify(result)
  })
})

Tool('uploadRoomLambda', {
  description: 'Publish a registered comp as a room lambda; roomId resolves to its canonical room wUrl.',
  params: [
    {id: 'lambdaId', as: 'string' },
    {id: 'roomId', as: 'string', description: 'room id or full room wUrl', mandatory: true},
    {id: 'entryPath', as: 'string', description: 'module path that defines the comp, e.g. @solution/...'},
  ],
  impl: mcpTool(async (ctx, {}, {lambdaId, roomId, entryPath}) => {
    const roomWUrl = await jb.wonderUtils.resolveWUrl(roomId, ctx)
    const resolvedRoomId = roomWUrl.split('://')[1]
    const script = `
import { uploadLambdaCompDependencies } from '@wonder/studio/mcp-tools/wonder-mcp-tools.js'
import { jb, coreUtils } from '@jb6/core'
import '@wonder/db/db-drivers.js'
import ${JSON.stringify(entryPath)}
try {
const { lambdaV, fileCount, tarBytes, importGraph, uploadMs, timeline } = await uploadLambdaCompDependencies(${JSON.stringify(entryPath)})
const [dir] = coreUtils.getCompField('data<common>${lambdaId}', 'permissionByPath')   // the dir the lambda reads
const roomWUrl = ${JSON.stringify(roomWUrl)}
const def = { lambdaV, entryCompFullId: 'data<common>${lambdaId}', dir, roomWUrl }
await jb.wonderUtils.wfetch2(\`${roomWUrl}/lambdas/${lambdaId}.json\`, { method: 'PUT', body: def }, new coreUtils.Ctx())
await coreUtils.writeServiceResult({ lambdaId: ${JSON.stringify(lambdaId)}, defPath: \`${roomWUrl}/lambdas/${lambdaId}.json\`, def,
  fileCount, tarBytes, importGraph, uploadMs, timeline })
} catch (e) { await coreUtils.writeServiceResult({ error: e.stack || String(e), lambdaId: ${JSON.stringify(lambdaId)},
  roomId: ${JSON.stringify(roomId)}, entryPath: ${JSON.stringify(entryPath)} }) }`
    await coreUtils.calcJb6RepoRootAndImportMapsInCli()
    const { result, error } = await coreUtils.runCliInContext(script, { importMapsInCli: jb.coreRegistry.importMapsInCli })
    if (error || result?.error)
      return JSON.stringify({ error: result?.error || error, stderr: result?.stderr, lambdaId, roomId, entryPath })
    return JSON.stringify({ ...result, runUrl: `https://staging.indivi.ai/run-room-lambda/${resolvedRoomId}/${lambdaId}` })
  })
})

Tool('uploadRoomApplet', {
  description: 'Publish a react comp as a room applet; roomId resolves to its canonical room wUrl.',
  params: [
    {id: 'roomId', as: 'string', description: 'room id or full room wUrl', mandatory: true},
    {id: 'entryPath', as: 'string', description: 'module path that defines the comp, e.g. @solution/...'},
    {id: 'entryCompFullId', as: 'string', description: 'full comp id, e.g. react-comp<react>cubeApplet. name + cmpId derived from the comp.'},
    {id: 'ogTitle', as: 'string', description: 'optional link-preview title for this applet (og:title). Else falls back to room admin/branding.json then wonder default.'},
    {id: 'ogDescription', as: 'string', description: 'optional link-preview description (og:description).'},
    {id: 'ogImage', as: 'string', description: 'optional link-preview image url, ideally 1200x630 (og:image).'},
    {id: 'ogImageLocalPath', as: 'string', description: 'optional local image to upload under the public room applet dir; overrides ogImage.'}
  ],
  impl: mcpTool(async (ctx, {}, {roomId, entryPath, entryCompFullId, ogTitle, ogDescription, ogImage, ogImageLocalPath}) => {
    const roomWUrl = await jb.wonderUtils.resolveWUrl(roomId, ctx)
    const resolvedRoomId = roomWUrl.split('://')[1]
    const script = `
import { uploadCompDependencies } from '@wonder/studio/mcp-tools/wonder-mcp-tools.js'
import { jb, coreUtils } from '@jb6/core'
import '@wonder/db/db-drivers.js'
import ${JSON.stringify(entryPath)}
try {
  const cmpId = coreUtils.compByFullId(${JSON.stringify(entryCompFullId)}).id
  const path = await import('path')
  const roomWUrl = ${JSON.stringify(roomWUrl)}, dbCtx = new coreUtils.Ctx()
  const localImage = ${JSON.stringify(ogImageLocalPath)}, imageName = localImage && path.basename(localImage)
  const imageUrl = imageName && \`${roomWUrl}/applets/\${cmpId}/\${imageName}\`
  const og = Object.fromEntries(Object.entries({ ogTitle: ${JSON.stringify(ogTitle)}, ogDescription: ${JSON.stringify(ogDescription)},
    ogImage: imageUrl || ${JSON.stringify(ogImage)} }).filter(([, v]) => v))
  const imageUpload = imageName && jb.wonderUtils.wfetch2(imageUrl, {
    method: 'PUT', body: localImage, headers: { 'x-wonder-body': 'localFile' } }, dbCtx)
  const writeDef = ({ appletV }) => Promise.all([imageUpload, jb.wonderUtils.wfetch2(\`${roomWUrl}/applets/\${cmpId}.json\`, {
    method: 'PUT', body: { cmpId, urlsToLoad: ${JSON.stringify(entryPath)}, appletV, roomWUrl,
      entryCompFullId: ${JSON.stringify(entryCompFullId)}, ...(Object.keys(og).length && { og }) } }, dbCtx)])
  const { appletV, fileCount, uploadMs, timeline } = await uploadCompDependencies(${JSON.stringify(entryPath)}, writeDef)
  await coreUtils.writeServiceResult({ appletV, cmpId, fileCount, uploadMs, timeline, imageUrl,
    defPath: \`${roomWUrl}/applets/\${cmpId}.json\` })
} catch (e) { await coreUtils.writeServiceResult({ error: e.stack || String(e) }) }`
    await coreUtils.calcJb6RepoRootAndImportMapsInCli()
    const cliCtx = coreUtils.ensureLoggers(['cliLogger', 'cliLineLogger'])   // over-the-wire: child stderr lines -> these loggers
    const { result, error } = await coreUtils.runCliInContext(script, { ctx: cliCtx, importMapsInCli: jb.coreRegistry.importMapsInCli })
    if (error || result?.error) return JSON.stringify({ error: result?.error || error, cliLog: coreUtils.harvestLogs(cliCtx, ['cliLineLogger']).cliLineLogger })
    return JSON.stringify({ ...result, entryUrl: `https://staging.indivi.ai/room/${resolvedRoomId}/applet/${result.cmpId}` })
  })
})

// recover a lambda's entryPath from its published tar: parse the root index.js (`import '<entryPath>'`).
export async function lambdaEntryPath(lambdaV) {
  const zlib = await import('zlib')
  const r = await fetch(`https://storage.googleapis.com/${CDN_BUCKET}/lambdas/${lambdaV}.tar.gz`)
  if (!r.ok) throw new Error(`tar fetch ${lambdaV} → ${r.status}`)
  const raw = zlib.gunzipSync(Buffer.from(await r.arrayBuffer()))
  for (let off = 0; off + 512 <= raw.length; ) {
    const name = raw.toString('utf8', off, off + 100).replace(/\0.*/, '')
    if (!name) break
    const size = parseInt(raw.toString('utf8', off + 124, off + 136).replace(/\0.*/, '').trim() || '0', 8)
    if (name === 'index.js') return raw.toString('utf8', off + 512, off + 512 + size).match(/import\s+'([^']+)'/)?.[1]
    off += 512 + Math.ceil(size / 512) * 512
  }
}

Tool('updateLambdasAndApplets', {
  description: 'Refresh every lambda and applet manifest in a room wUrl from its current source.',
  params: [
    {id: 'roomId', as: 'string', mandatory: true, description: 'room id or full room wUrl'}
  ],
  impl: mcpTool(async (ctx, {}, {roomId}) => {
    const roomWUrl = await jb.wonderUtils.resolveWUrl(roomId, ctx)
    const resolvedRoomId = roomWUrl.split('://')[1]
    const script = `
import { uploadLambdaCompDependencies, uploadCompDependencies, lambdaEntryPath } from '@wonder/studio/mcp-tools/wonder-mcp-tools.js'
import { jb, coreUtils } from '@jb6/core'
import '@wonder/db/db-drivers.js'
try {
const roomWUrl = ${JSON.stringify(roomWUrl)}, dbCtx = new coreUtils.Ctx()
const defsIn = async dir => {
  const dirUrl = \`${roomWUrl}/\${dir}/\`
  const files = await (await jb.wonderUtils.wfetch2(dirUrl, { method: 'GET' }, dbCtx)).json()
  return Promise.all(files.filter(f => f.name.endsWith('.json')).map(async f => {
    const name = f.name.split('/').pop().replace('.json',''), url = \`${dirUrl}\${name}.json\`
    return { name, url, def: await (await jb.wonderUtils.wfetch2(url, { method: 'GET' }, dbCtx)).json() }
  }))
}
const save = (url, obj) => jb.wonderUtils.wfetch2(url, { method: 'PUT', body: obj }, dbCtx)

const lambdas = await defsIn('lambdas')
const lambdaResults = await Promise.all(lambdas.map(async ({ name, url, def }) => {
  const from = def.lambdaV || def.fullAdHocV
  try {
    const entryPath = await lambdaEntryPath(from)
    if (!entryPath) return { name, from, error: 'no entryPath in tar index.js' }
    await import(entryPath)   // register the comp so getCompField resolves permissionByPath
    const { lambdaV, reused } = await uploadLambdaCompDependencies(entryPath)
    const [dir] = coreUtils.getCompField(def.entryCompFullId, 'permissionByPath')
    await save(url, { lambdaV, entryCompFullId: def.entryCompFullId, dir, roomWUrl })
    return { name, entryPath, dir, from, to: lambdaV, changed: from !== lambdaV, reused: !!reused,
      runUrl: \`https://staging.indivi.ai/run-room-lambda/${resolvedRoomId}/\${name}\` }
  } catch (e) { coreUtils.logException(e, 'updateLambdasAndApplets lambda',
    { roomId: '${resolvedRoomId}', name, from }); return { name, from, error: e.stack || String(e) } }
}))

const applets = await defsIn('applets')
const appletResults = await Promise.all(applets.map(async ({ name, url, def }) => {
  const from = def.appletV
  try {
    await import(def.urlsToLoad)   // register the comp
    const { appletV, fileCount } = await uploadCompDependencies(def.urlsToLoad)
    await save(url, { ...def, appletV, roomWUrl })
    return { name, entryPath: def.urlsToLoad, fileCount, from, to: appletV, changed: from !== appletV,
      entryUrl: \`https://staging.indivi.ai/room/${resolvedRoomId}/applet/\${name}\` }
  } catch (e) { coreUtils.logException(e, 'updateLambdasAndApplets applet',
    { roomId: '${resolvedRoomId}', name, from }); return { name, from, error: e.stack || String(e) } }
}))

const tally = (xs, changedKey) => ({ total: xs.length, changed: xs.filter(x => x[changedKey]).length, failed: xs.filter(x => x.error).length })
await coreUtils.writeServiceResult({ roomId: ${JSON.stringify(resolvedRoomId)},
  summary: { lambdas: tally(lambdaResults, 'changed'), applets: tally(appletResults, 'changed') },
  lambdas: lambdaResults, applets: appletResults })
} catch (e) { await coreUtils.writeServiceResult({ error: e.stack || String(e) }) }`
    try {
      await coreUtils.calcJb6RepoRootAndImportMapsInCli()
      const { result, error } = await coreUtils.runCliInContext(script, { importMapsInCli: jb.coreRegistry.importMapsInCli })
      if (error || result?.error) return JSON.stringify({ error: result?.error || error, roomId })
      return JSON.stringify(result, null, 2)
    } catch (e) {
      coreUtils.logException(e, 'updateLambdasAndApplets', { roomId })
      return JSON.stringify({ error: e.stack || String(e), roomId })
    }
  })
})
