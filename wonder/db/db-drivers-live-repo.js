import { coreUtils, dsls, ns, jb } from '@jb6/core'
import './db-drivers.js'
const { successResult, errorResultByException } = jb.wonderUtils
const { storagePrefix } = jb.wonderUtils

const {
  wonder: { GetMethod, PutMethod, AppendMethod, ListMethod, DbDriver,
    'db-driver': { dbDriver }
  }
} = dsls
const { authToken, authMethod, wget, wput, wappend, whead, wlist } = ns

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

DbDriver('FS.browser', {
  impl: dbDriver({
    whenAndWhyToUse: `in general we prefer our local file system db (saved in git) to be used when we develop.
      it allows us to manage the db content in an easier way and allow the llm to look at the db content`,
    designConcerns: 'The local express server supports GCS compatible GET and PUT methods to write under {REPO_ROOT}/files/',
    get: wget.viaBucketApi(),
    put: wput.viaBucketApi(),
    append: wappend.bucketSingleWriterGetPut(),
    filePathUrl: '%$localhostServer%/files/%$path%'
  })
})

DbDriver('FS.node', {
  impl: dbDriver({
    whenAndWhyToUse: 'server-side code in development that needs to read/write local file system db. used by express localhost',
    designConcerns: 'direct file system access for node lambdas and workflows in dev mode',
    get: wget.nodeFS(),
    put: wput.nodeFS(),
    append: wappend.singleWriterGetPut({ get: wget.nodeFS(), put: wput.nodeFS() }),
    filePathUrl: (ctx, { path }) => nodeFilePath(path)
  })
})

DbDriver('GCS.browser.liveRepo', {
  impl: dbDriver({
    whenAndWhyToUse: 'Use GCS user data during development instead of the preferred local git-backed files.',
    designConcerns: 'security issues. our developers needs to know the roomId',
    get: wget.viaBucketApi(),
    put: wput.viaBucketApi(),
    append: wappend.bucketSingleWriterGetPut(),
    list: wlist.viaBucketApi(),
    filePathUrl: (ctx,{path, bucketName}) => `${storagePrefix}/${bucketName}/${path}`
  })
})

DbDriver('GCS.node.gcpIdentity.liveRepo', {
  impl: dbDriver({
    whenAndWhyToUse: 'HTTP GCS access from a local Node process using its minted GCP access token.',
    designConcerns: 'Single-writer live repository; all storage operations use authenticated HTTP.',
    authToken: authToken.gcpAccessToken(),
    authMethod: authMethod.bearer(),
    get: wget.viaBucketApi(),
    put: wput.viaBucketApi(),
    append: wappend.bucketSingleWriterGetPut(),
    head: whead.viaBucketApi(),
    list: wlist.viaBucketApi(),
    filePathUrl: (ctx,{path, bucketName}) => `${storagePrefix}/${bucketName}/${path}`
  })
})

DbDriver('fsmem.browser.liveRepo', {
  impl: dbDriver({
    whenAndWhyToUse: 'when running tests, we do not want the test to write to the file system db, but we do want to allow it to read from it',
    designConcerns: 'in test run, any writes should be written to memory (under ctx.vars.testSessionId) and when read later should be served from there. no mix between tests',
    get: wget.wrapWithMem(wget.viaBucketApi()),
    put: wput.intoMem(),
    append: wappend.singleWriterGetPut({ get: wget.wrapWithMem(wget.viaBucketApi()), put: wput.intoMem() }),
    filePathUrl: '%$localhostServer%/files/%$path%'
  })
})

DbDriver('fsmem.node', {
  impl: dbDriver({
    whenAndWhyToUse: 'when running tests, we do not want the test to write to the file system db, but we do want to allow it to read from it',
    designConcerns: 'in test run, any writes should be written to memory (under ctx.vars.testSessionId) and when read later should be served from there. no mix between tests',
    get: wget.wrapWithMem(wget.nodeFS()),
    put: wput.intoMem(),
    append: wappend.singleWriterGetPut({ get: wget.wrapWithMem(wget.nodeFS()), put: wput.intoMem() }),
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
      coreUtils.logException(error, 'viaGsUtil GET failed', { ctx, gsutilCmd })
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
      coreUtils.logException(error, 'viaGsUtilStreaming GET failed', { ctx, gsutilCmd })
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
    whenAndWhyToUse: 'Authenticated HTTP access to the live-repository logs bucket.',
    designConcerns: 'Single-writer log repository; gsutil remains only for the specialized read path.',
    authToken: authToken.gcpAccessToken(),
    authMethod: authMethod.bearer(),
    get: wget.viaGsUtil(),
    put: wput.viaBucketApi(),
    append: wappend.bucketSingleWriterGetPut(),
    head: whead.viaBucketApi(),
    list: wlist.viaBucketApi(),
    filePathUrl: (ctx, { path, bucketName }) => `${storagePrefix}/${bucketName}/${path}`
  })
})

DbDriver('GCS.browser.liveRepo.logs', {
  impl: dbDriver({
    whenAndWhyToUse: 'For accessing logs bucket using gsutil CLI tool, ideal for server environments with gsutil installed',
    designConcerns: 'Uses gsutil cat command for direct access to logs bucket, handles both JSON and raw text files',
    get: wget.viaGsUtil(),
    put: wput.viaBucketApi(),
    append: wappend.appendMultiUser(),
    list: wlist.viaRunBash(),
    filePathUrl: (ctx, { path, bucketName }) => `${storagePrefix}/${bucketName}/${path}`
  })
})

DbDriver('GCS.node.gcpIdentity.liveRepo.allowStreaming', {
  impl: dbDriver({
    whenAndWhyToUse: 'Streaming reads for large live-repository files from local Node.',
    designConcerns: 'Single-writer repository; gsutil is limited to streaming reads and all other storage operations use authenticated HTTP.',
    authToken: authToken.gcpAccessToken(),
    authMethod: authMethod.bearer(),
    get: wget.viaGsUtilStreaming(),
    put: wput.viaBucketApi(),
    append: wappend.bucketSingleWriterGetPut(),
    head: whead.viaBucketApi(),
    list: wlist.viaBucketApi(),
    filePathUrl: (ctx, { path, bucketName }) => `${storagePrefix}/${bucketName}/${path}`
  })
})
