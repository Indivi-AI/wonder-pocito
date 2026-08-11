import { coreUtils, dsls, ns, jb } from '@jb6/core'
import { logger, storagePrefix } from './base-utils.js'
import './db-drivers.js'
const { successResult, errorResultByException } = jb.wonderUtils

const {
  wonder: { GetMethod, PutMethod, AppendMethod, ListMethod, DbDriver,
    'db-driver': { dbDriver }
  }
} = dsls
const { wget, wput, wappend, whead, wlist } = ns

const testMemory = globalThis.testMemory = globalThis.testMemory || {}
const nodeFilePath = async path => (await import('path')).resolve(globalThis.__repoRoot || process.cwd(), 'files', path)

GetMethod('wget.nodeFS', {
  impl: async (ctx, {dbLogger, filePath }) => {
    try {
        const { readFile } = await import('fs/promises')
        const txt = await readFile(filePath, 'utf8')
        const data = JSON.parse(txt)
        dbLogger?.info?.({t: 'FSNode GET', bytes: txt.length}, {data}, {ctx})
        return { ok: true, status: 200, text: async () => JSON.stringify(data.content), json: async () => data.content }
    } catch (error) {
        if (error.code === 'ENOENT') {
            dbLogger?.info?.({t: 'FSNode GET no file'}, {}, {ctx})
            return { ok: false, status: 404, text: async () => null, json: async () => null }
        }
        dbLogger?.error?.({t: 'FSNode GET failed'}, {}, {ctx, error})
        return errorResultByException(error)
    }
  }
})

GetMethod('wget.wrapWithMem', {
  params: [
    {id: 'get', type: 'get-method', dynamic: true}
  ],
  impl: async (ctx, {dbLogger, path, testSessionId}, {get}) => {
    testMemory[testSessionId] = testMemory[testSessionId] || {}
    if (testMemory[testSessionId][path] !== undefined) {
      dbLogger?.info?.({t: 'wrapWithMem GET from memory'}, {path, data: testMemory[testSessionId][path]}, {ctx})
      return { ok: true, status: 200, text: async () => testMemory[testSessionId][path], json: async () => testMemory[testSessionId][path] }
    }

    const response = await get(ctx)
    if (!response.ok)
        return response
    const content = testMemory[testSessionId][path] = (await response.json())
    dbLogger?.info?.({t: 'wrapWithMem GET from getter'}, {path, content }, {ctx})

    return { ok: true, status: 200, text: async () => JSON.stringify(content), json: async () => content }
  }
})

PutMethod('wput.intoMem', {
  impl: async (ctx, {opts, path, testSessionId}) => {
    testMemory[testSessionId] = testMemory[testSessionId] || {}
    testMemory[testSessionId][path] = opts.body
    return successResult
  }
})

PutMethod('wput.nodeFS', {
  impl: async (ctx, {dbLogger, opts, filePath}) => {
    try {
        const { writeFile, mkdir } = await import('fs/promises')
        const { dirname } = await import('path')
        await mkdir(dirname(filePath), { recursive: true })
        const jsonStr = JSON.stringify({content: opts.body}, null, 2)
        await writeFile(filePath, jsonStr, 'utf8')
        dbLogger?.info?.({t: 'FSNode PUT', bytes: jsonStr.length}, {}, {ctx})
        return successResult
    } catch (error) {
        dbLogger?.error?.({t: 'FSNode PUT failed'}, {}, {ctx, error})
        return errorResultByException(error)
    }
  }
})

AppendMethod('wappend.getAndPutNoCheck', {
  params: [
    {id: 'get', type: 'get-method', dynamic: true,  byName: true},
    {id: 'put', type: 'put-method', dynamic: true}
  ],
  impl: async (ctx, {dbLogger, opts, method}, {get, put}) => {
    try {      
      let existing = method == 'PATCH' ? {} : []
      try {
        const resp = await get(ctx)
        if (resp.status != 404) {
          const res = await resp.json()
          existing = res || existing
        }
      } catch (error) {
        dbLogger?.error?.({t: 'wappend.getAndPutNoCheck get failed'}, {}, {ctx, error})
        return errorResultByException(error)
      }
      
      const bodyData = opts.body
      
      const merged = method == 'PATCH' ? {...existing, ...bodyData} : [...existing, ...bodyData]
      await put(ctx.setVars({opts: {...opts, body: merged }}))
      return successResult
    } catch (error) {
      dbLogger?.error?.({t: `wappend.getAndPutNoCheck put failed`}, {}, {ctx, error})
      return errorResultByException(error)
    }
  }
})

DbDriver('FS.browser', {
  impl: dbDriver({
    whenAndWhyToUse: `in general we prefer our local file system db (saved in git) to be used when we develop.
      it allows us to manage the db content in an easier way and allow the llm to look at the db content`,
    designConcerns: 'The local express server supports GCS compatible GET and PUT methods to write under {REPO_ROOT}/files/',
    get: wget.viaGcsHttpApi(),
    put: wput.viaGcsHttpApi(),
    append: wappend.getAndPutNoCheck({ get: wget.viaGcsHttpApi(), put: wput.viaGcsHttpApi() }),
    filePathUrl: '%$localhostServer%/files/%$path%'
  })
})

DbDriver('FS.node', {
  impl: dbDriver({
    whenAndWhyToUse: 'server-side code in development that needs to read/write local file system db. used by express localhost',
    designConcerns: 'direct file system access for node lambdas and workflows in dev mode',
    get: wget.nodeFS(),
    put: wput.nodeFS(),
    append: wappend.getAndPutNoCheck({ get: wget.nodeFS(), put: wput.nodeFS() }),
    filePathUrl: (ctx, { path }) => nodeFilePath(path)
  })
})

DbDriver('GCS.browser.liveRepo', {
  impl: dbDriver({
    whenAndWhyToUse: 'in general we prefer our local file system db (saved in git) to be used when we develop. however, sometimes we want to see our users data and use GCS as the DB',
    designConcerns: 'security issues. our developers needs to know the roomId',
    get: wget.viaGcsHttpApi(),
    put: wput.viaGcsHttpApi(),
    list: wlist.viaGcsHttpApi(),
    append: wappend.getAndPutNoCheck({ get: wget.viaGcsHttpApi(), put: wput.viaGcsHttpApi() }),
    filePathUrl: (ctx,{path, bucketName}) => `${storagePrefix}/${bucketName}/${path}`
  })
})

DbDriver('GCS.node.gcpIdentity.liveRepo', {
  impl: dbDriver({
    whenAndWhyToUse: 'faster than GCS SDK when testing from local machine outside GCP. uses HTTP for GET/PUT, SDK for POST/PATCH generation locking',
    designConcerns: 'SDK is slow outside GCP for simple operations (933ms vs 183ms HTTP). Use HTTP for GET/PUT, SDK for POST/PATCH atomic operations',
    get: wget.viaGcsHttpApi(),
    put: wput.viaGcsHttpApi(),
    append: wappend.GcsJSApiWithGenerationCheck(),
    head: whead.viaGcsHttpApi(),
    storageApi: true,
    filePathUrl: (ctx,{path, bucketName}) => `${storagePrefix}/${bucketName}/${path}`
  })
})

DbDriver('fsmem.browser.liveRepo', {
  impl: dbDriver({
    whenAndWhyToUse: 'when running tests, we do not want the test to write to the file system db, but we do want to allow it to read from it',
    designConcerns: 'in test run, any writes should be written to memory (under ctx.vars.testSessionId) and when read later should be served from there. no mix between tests',
    get: wget.wrapWithMem(wget.viaGcsHttpApi()),
    put: wput.intoMem(),
    append: wappend.getAndPutNoCheck({ get: wget.wrapWithMem(wget.viaGcsHttpApi()), put: wput.intoMem() }),
    filePathUrl: '%$localhostServer%/files/%$path%'
  })
})

DbDriver('fsmem.node', {
  impl: dbDriver({
    whenAndWhyToUse: 'when running tests, we do not want the test to write to the file system db, but we do want to allow it to read from it',
    designConcerns: 'in test run, any writes should be written to memory (under ctx.vars.testSessionId) and when read later should be served from there. no mix between tests',
    get: wget.wrapWithMem(wget.nodeFS()),
    put: wput.intoMem(),
    append: wappend.getAndPutNoCheck({ get: wget.wrapWithMem(wget.nodeFS()), put: wput.intoMem() }),
    filePathUrl: (ctx, { path }) => nodeFilePath(path)
  })
})

GetMethod('wget.viaGsUtil', {
  impl: async (ctx, { dbLogger, bucketName, path }) => {
    try {
      const gsutilCmd = `gsutil cat gs://${bucketName}/${path}`
      dbLogger?.info?.({ t: 'viaGsUtil GET attempt' }, { gsutilCmd }, { ctx })
      const result = await coreUtils.runBashScript(gsutilCmd)
      if (result.stderr && (result.stderr.includes('No such object') || result.stderr.includes('BucketNotFoundException'))) {
        dbLogger?.info?.({ t: 'viaGsUtil GET 404' }, { gsutilCmd, stderr: result.stderr }, { ctx })
        return { ok: false, status: 404, text: async () => null, json: async () => null }
      }
      const res = result?.stdout?.content || ''
      dbLogger?.info?.({ t: 'viaGsUtil GET result', status: 200, bytes: res.length }, { res }, { ctx })
      return { ok: true, status: 200, text: async () => res, json: async () => res }
    } catch (error) {
      const gsutilCmd = `gsutil cat gs://${bucketName}/${path}`
      dbLogger?.error?.({ t: 'viaGsUtil GET failed' }, { gsutilCmd, error: error.message }, { ctx, error })
      return errorResultByException(error)
    }
  }
})

GetMethod('wget.viaGsUtilStreaming', {
  impl: async (ctx, { dbLogger, bucketName, path }) => {
    const { createReadStream } = await import('fs')
    const { unlink, stat } = await import('fs/promises')
    const streamJson = await import('stream-json')
    const Pick = await import('stream-json/filters/Pick.js')
    const StreamValues = await import('stream-json/streamers/StreamValues.js')
    const parser = streamJson.default.parser, pick = Pick.default.pick, streamValues = StreamValues.default.streamValues
    const tmpFile = `/tmp/gcs-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const gsutilCmd = `gsutil cp gs://${bucketName}/${path} ${tmpFile}`
    try {
      dbLogger?.info?.({ t: 'viaGsUtilStreaming GET attempt' }, { gsutilCmd }, { ctx })
      const result = await coreUtils.runBashScript(gsutilCmd)
      if (result.stderr && (result.stderr.includes('No such object') || result.stderr.includes('BucketNotFoundException'))) {
        dbLogger?.info?.({ t: 'viaGsUtilStreaming GET 404' }, { gsutilCmd }, { ctx })
        return { ok: false, status: 404, text: async () => null, json: async () => null }
      }
      const fileSize = (await stat(tmpFile)).size
      const stream = createReadStream(tmpFile).pipe(parser()).pipe(pick({filter: 'content'})).pipe(streamValues())
      let content
      for await (const {value} of stream) content = value
      await unlink(tmpFile).catch(() => {})
      dbLogger?.info?.({ t: 'viaGsUtilStreaming GET result', status: 200, bytes: fileSize }, {}, { ctx })
      return { ok: true, status: 200, text: async () => JSON.stringify(content), json: async () => content }
    } catch (error) {
      await unlink(tmpFile).catch(() => {})
      dbLogger?.error?.({ t: 'viaGsUtilStreaming GET failed' }, { gsutilCmd, error: error.message }, { ctx, error })
      return errorResultByException(error)
    }
  }
})

ListMethod('wlist.viaRunBash', {
  impl: async (ctx, { dbLogger, bucketName, path }) => {
    const res = await coreUtils.runBashScript(`gsutil ls -l 'gs://${bucketName}/${path}' 2>/dev/null | grep -v TOTAL || true`)
    const lines = (typeof res.stdout === 'string' ? res.stdout : '').trim().split('\n').filter(Boolean)
    const items = lines.map(l => { const parts = l.trim().split(/\s+/); return { name: parts[2]?.replace(`gs://${bucketName}/`, ''), updated: parts[1] } }).filter(i => i.name)
    dbLogger?.info?.({ t: 'wlist.viaRunBash', prefix: path, count: items.length }, {}, { ctx })
    return items
  }
})

DbDriver('GCS.node.gcpIdentity.liveRepo.logs', {
  impl: dbDriver({
    whenAndWhyToUse: 'For accessing logs bucket using gsutil CLI tool, ideal for server environments with gsutil installed',
    designConcerns: 'Uses gsutil cat command for direct access to logs bucket, handles both JSON and raw text files',
    get: wget.viaGsUtil(),
    put: wput.GcsJSApi(),
    append: wappend.GcsJSApiWithGenerationCheck(),
    list: wlist.GcsJSApi(),
    storageApi: true,
    filePathUrl: (ctx, { path, bucketName }) => `${storagePrefix}/${bucketName}/${path}`
  })
})

DbDriver('GCS.browser.liveRepo.logs', {
  impl: dbDriver({
    whenAndWhyToUse: 'For accessing logs bucket using gsutil CLI tool, ideal for server environments with gsutil installed',
    designConcerns: 'Uses gsutil cat command for direct access to logs bucket, handles both JSON and raw text files',
    get: wget.viaGsUtil(),
    put: wput.viaGcsHttpApi(),
    append: wappend.GcsJSApiWithGenerationCheck(),
    list: wlist.viaRunBash(),
    filePathUrl: (ctx, { path, bucketName }) => `${storagePrefix}/${bucketName}/${path}`
  })
})

DbDriver('GCS.node.gcpIdentity.liveRepo.allowStreaming', {
  impl: dbDriver({
    whenAndWhyToUse: 'Streaming read for large files from localhost node using gsutil cp + stream-json',
    get: wget.viaGsUtilStreaming(),
    put: wput.GcsJSApi(),
    append: wappend.GcsJSApiWithGenerationCheck(),
    head: whead.GcsJSApi(),
    storageApi: true,
    filePathUrl: (ctx, { path, bucketName }) => `${storagePrefix}/${bucketName}/${path}`
  })
})
