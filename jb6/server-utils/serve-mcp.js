import { coreUtils, jb, dsls } from '@jb6/core'

jb.serverUtils = jb.serverUtils || {}
Object.assign(jb.serverUtils, { serveMcp, serveMcpViaCli, serveMcpViaVm })

async function serveMcp(app, { express }) {
  const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js')
  const { startMcpServer } = await import("@jb6/mcp/mcp-utils.js")
  await import('@jb6/mcp/mcp-jb-tools.js')
  await import('@jb6/mcp/mcp-fs-tools.js')

  // Pre-calculate import map once at startup
  await import('@jb6/core/misc/import-map-services.js')
  const { importMap } = await coreUtils.calcImportData()

  app.post("/mcp", express.json({ type: "application/json" }), async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })

    try {
      const exclude = ['text','doclet']
      const allTools = coreUtils.globalsOfTypeIds(dsls.mcp.tool,'all').filter(id => !exclude.includes(id))
      .map(id=>({id, toolComp: dsls.mcp.tool[id][coreUtils.asJbComp] }))

      await startMcpServer(transport, {allTools, importMap})
      await transport.handleRequest(req, res, req.body)

      res.on("close", () => transport.close())
    } catch (error) {
      console.error(error?.stack || error)
      if (!res.headersSent) res.status(500).end()
      transport.close()
    }
  })
}

async function serveMcpViaCli(app, { express }) {
  await import('@jb6/core/misc/import-map-services.js')
  await coreUtils.ensureImportMapsInCli()
  const repoRoot = await coreUtils.calcRepoRoot()
  const { projectDir, importMap, staticMappings } = await coreUtils.calcImportData({forRepo: repoRoot})
  if ((process.env.PORT || 8083) == 8083) {
    console.log('loading mcp tools for jb6')
    await import('@jb6/mcp/mcp-jb-tools.js')
    await import('@jb6/mcp/mcp-fs-tools.js')
  }

  app.get("/mcp-ui", async (req, res) => {
    try {
      const compId = req.query.compId
      const reactComp = dsls.react?.['react-comp']?.[compId]
      const jbComp = reactComp?.[coreUtils.asJbComp]
      const _sourceFile = jbComp?.$location?.path
      const mapped = coreUtils.absPathToImportUrl?.(_sourceFile, importMap.imports, staticMappings)
      const sourceFile = mapped && !mapped.startsWith('undefined') ? mapped
        : _sourceFile?.startsWith(repoRoot) ? `/genie${_sourceFile.slice(repoRoot.length)}` : null
      const urlsToLoad = sourceFile ? [sourceFile] : []
      const { renderReactCompToHtml } = await import('@jb6/mcp/mcp-utils.js')
      res.type('html').send(renderReactCompToHtml(compId, importMap, urlsToLoad))
    } catch(e) { res.status(500).send(e.stack) }
  })

  app.post("/mcp", express.json({ type: "application/json" }), async (req, res) => {
    const origin = `${req.get('x-forwarded-proto') || req.protocol}://${req.get('x-forwarded-host') || req.get('host')}`
    const wantsSSE = (req.headers.accept || '').includes('text/event-stream')
    const sendJson = (data) => {
      if (wantsSSE) {
        res.setHeader('Content-Type', 'text/event-stream')
        res.write(`event: message\ndata: ${JSON.stringify(data)}\n\n`)
        res.end()
      } else {
        res.json(data)
      }
    }
    try {
      const { method, params, id } = req.body

      // Handle initialize - required for MCP handshake
      if (method === 'initialize') {
        return sendJson({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2025-06-18',
            capabilities: {
              tools: {},
              resources: {},
              extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } }
            },
            serverInfo: {
              name: 'jb6_mcp',
              version: '1.0.0'
            }
          }
        })
      }

      // Handle initialized notification
      if (method === 'initialized') {
        return sendJson({ jsonrpc: '2.0', id, result: {} })
      }

      // Handle tools/list
      if (method === 'tools/list') {
        const exclude = ['text', 'doclet']
        const tools = coreUtils.globalsOfTypeIds(dsls.mcp.tool, 'all')
          .filter(id => !exclude.includes(id))
          .map(id => {
            const toolComp = dsls.mcp.tool[id][coreUtils.asJbComp]
            const reactJbComp = dsls.react?.['react-comp']?.[id]?.[coreUtils.asJbComp]
            if (!reactJbComp) return { name: id, description: toolComp.description || `Tool: ${id}`,
              inputSchema: { type: 'object',
                properties: (toolComp.params || []).reduce((props, param) => { props[param.id] = { type: param.as === 'number' ? 'number' : 'string', description: param.description || '' }; return props }, {}),
                required: (toolComp.params || []).filter(p => p.mandatory).map(p => p.id) } }
            const metadata = typeof reactJbComp.impl.metadata === 'function' ? reactJbComp.impl.metadata() : reactJbComp.impl.metadata
            const mcpMeta = coreUtils.asArray(metadata).find(m => m.calcData || m.fullScreen)
            const csp = { resourceDomains: [origin], connectDomains: [origin], baseUriDomains: [origin] }
            return { name: id, description: toolComp.description || `Tool: ${id}`,
              inputSchema: { type: 'object',
                properties: (toolComp.params || []).reduce((props, param) => { props[param.id] = { type: param.as === 'number' ? 'number' : 'string', description: param.description || '' }; return props }, {}),
                required: (toolComp.params || []).filter(p => p.mandatory).map(p => p.id) },
              _meta: { ui: { resourceUri: `ui://react-comp/${id}`, csp, ...(mcpMeta?.fullScreen && { displayMode: 'fullscreen' }) } } }
          })
        return sendJson({ jsonrpc: '2.0', id, result: { tools } })
      }

      // Handle tools/call - run the tool via CLI for dynamic code reloading
      if (method === 'tools/call') {
        const { name: toolId, arguments: args } = params
        const toolComp = dsls.mcp?.tool?.[toolId]?.[coreUtils.asJbComp]
        if (!toolComp) {
          return sendJson({ jsonrpc: '2.0', id, error: { code: -32601, message: `Tool not found: ${toolId}` } })
        }
        const _toolPath = toolComp.$location?.path
        const mapped = coreUtils.absPathToImportUrl?.(_toolPath, importMap.imports, staticMappings)
        const toolPath = mapped && !mapped.startsWith('undefined') ? mapped : ('file://' + _toolPath)
        const argsJson = JSON.stringify(args || {})

        const script = `
import { jb, dsls, coreUtils } from '@jb6/core'
jb.coreRegistry.repoRoot = '${repoRoot}'
jb.coreRegistry.jb6Root = '${jb.coreRegistry.jb6Root}'
await import('@jb6/mcp/mcp-jb-tools.js')
await import('${toolPath}')
const { runMcpTool } = await import('@jb6/mcp/mcp-utils.js')
const toolComp = dsls.mcp.tool['${toolId}'][coreUtils.asJbComp]
const result = await runMcpTool('${toolId}', ${argsJson}, toolComp)
await coreUtils.writeServiceResult(result)
`
        const cliResult = await coreUtils.runCliInContext(script, {projectDir, importMapsInCli: importMap?.importMapsInCli})
        console.log('mcp result', cliResult)
        const mcpResult = cliResult?.result || { content: [{ type: 'text', text: cliResult?.error?.message || 'CLI error' }], isError: true }
        return sendJson({ jsonrpc: '2.0', id, result: mcpResult })
      }

      // Handle resources/list
      if (method === 'resources/list') {
        return sendJson({ jsonrpc: '2.0', id, result: { resources: [] } })
      }

      // Handle resources/read - for UI resources
      if (method === 'resources/read') {
        const uri = params.uri

        const match = uri.match(/^ui:\/\/react-comp\/(.+)$/)
        if (match) {
          const compId = match[1]

          // Get source file from component location and calculate import map from it
          const reactComp = dsls.react?.['react-comp']?.[compId]
          const jbComp = reactComp?.[coreUtils.asJbComp]
          const _sourceFile = jbComp?.$location?.path
          const mapped = coreUtils.absPathToImportUrl?.(_sourceFile, importMap.imports, staticMappings)
          const sourceFile = mapped && !mapped.startsWith('undefined') ? mapped
            : _sourceFile?.startsWith(repoRoot) ? `/genie${_sourceFile.slice(repoRoot.length)}` : null
          const urlsToLoad = sourceFile ? [sourceFile] : []

          const { renderReactCompToHtml } = await import('@jb6/mcp/mcp-utils.js')
          const metadata = typeof jbComp.impl.metadata === 'function' ? jbComp.impl.metadata() : jbComp.impl.metadata
          const fullScreen = !!coreUtils.asArray(metadata).find(m => m.fullScreen)?.fullScreen
          const html = renderReactCompToHtml(compId, importMap, urlsToLoad, { origin, fullScreen })
          const csp = { resourceDomains: [origin], connectDomains: [origin], baseUriDomains: [origin] }
          return sendJson({ jsonrpc: '2.0', id, result: { contents: [{ uri, mimeType: 'text/html;profile=mcp-app', text: html, _meta: { ui: { csp } } }] } })
        }
        return sendJson({ jsonrpc: '2.0', id, error: { code: -32002, message: `Resource not found: ${uri}` } })
      }

      // Handle ping and logging
      if (method === 'ping' || method === 'logging/setLevel') {
        return sendJson({ jsonrpc: '2.0', id, result: {} })
      }

      // Unknown method
      sendJson({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not supported: ${method}` } })
    } catch (error) {
      console.error(error?.stack || error)
      if (!res.headersSent) sendJson({ jsonrpc: '2.0', id: req.body?.id, error: { code: -32603, message: error.stack } })
    }
  })
}

async function serveMcpViaVm(app, { express, entryPointPaths, builtIn = {}, versionFiles }) {
  console.log('start serveMcpViaVm')
  await import('@jb6/core/misc/import-map-services.js')
  await import('@jb6/core/misc/jb-vm.js')
  const vmId = 'mcp-' + Date.now()
  const { importMap, staticMappings } = versionFiles || await coreUtils.calcImportData({entryPointPaths})
  const vmOptions = versionFiles
    ? { vmId, ...versionFiles, entryFiles: [entryPointPaths], builtIn }
    : { vmId, resources: {entryPointPaths}, builtIn }
  const mcpVm = await coreUtils.getOrCreateVm(vmOptions)
  console.log('serveMcpViaVm - vm created')

  if (versionFiles?.fileOverrides) {
    for (const {urlPath, diskPath} of staticMappings)
      app.use(urlPath, (req, res, next) => {
        const filePath = diskPath + req.path
        const content = versionFiles.fileOverrides.get(filePath)
        if (content == null) return next()
        const ext = filePath.split('.').pop()
        const types = { js: 'application/javascript', mjs: 'application/javascript', css: 'text/css', html: 'text/html', json: 'application/json', svg: 'image/svg+xml' }
        res.type(types[ext] || 'text/plain').send(content)
      })
  } else {
    for (const {urlPath, diskPath} of staticMappings)
      app.use(urlPath, express.static(diskPath))
  }
  console.log('serveMcpViaVm - serving', staticMappings)

  const importMapJson = JSON.stringify({imports: importMap.imports})
  const exclude = ['text', 'doclet']

  const sendJsonRes = (res, data, req) => {
    if ((req.headers.accept || '').includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/event-stream')
      res.write(`event: message\ndata: ${JSON.stringify(data)}\n\n`)
      res.end()
    } else res.json(data)
  }

  app.post("/mcp", express.json({type: "application/json"}), async (req, res) => {
    const origin = `${req.get('x-forwarded-proto') || req.protocol}://${req.get('x-forwarded-host') || req.get('host')}`
    const { method, params, id } = req.body
    const jsonrpc = result => sendJsonRes(res, {jsonrpc: '2.0', id, result}, req)
    const jsonrpcError = (code, message) => sendJsonRes(res, {jsonrpc: '2.0', id, error: {code, message}}, req)

    try {
      if (method === 'initialize') return jsonrpc({
        protocolVersion: '2025-06-18',
        capabilities: { tools: {}, resources: {},
          extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } }
        },
        serverInfo: { name: 'jb6_mcp_vm', version: '1.0.0' }
      })
      if (['initialized','ping','logging/setLevel'].includes(method)) return jsonrpc({})

      if (method === 'tools/list') {
        const tools = await mcpVm.evalScript(`(async () => {
          const { coreUtils, dsls } = await import('@jb6/core')
          const exclude = ${JSON.stringify(exclude)}
          return coreUtils.globalsOfTypeIds(dsls.mcp.tool,'all').filter(id => !exclude.includes(id)).map(id => {
            const tc = dsls.mcp.tool[id][coreUtils.asJbComp]
            const reactJbComp = dsls.react?.['react-comp']?.[id]?.[coreUtils.asJbComp]
            const base = { name: id, description: tc.description || 'Tool: ' + id,
              inputSchema: { type: 'object',
                properties: (tc.params || []).reduce((p, param) => { p[param.id] = { type: param.as === 'number' ? 'number' : 'string', description: param.description || '', ...(param.options ? {enum: param.options.split(',')} : {}) }; return p }, {}),
                required: (tc.params || []).filter(p => p.mandatory).map(p => p.id) } }
            if (!reactJbComp) return base
            const metadata = typeof reactJbComp.impl.metadata === 'function' ? reactJbComp.impl.metadata() : reactJbComp.impl.metadata
            const mcpMeta = coreUtils.asArray(metadata).find(m => m.calcData || m.fullScreen)
            return { ...base, _meta: { ui: { resourceUri: 'ui://react-comp/' + id, ...(mcpMeta?.fullScreen && { displayMode: 'fullscreen' }) } } }
          })
        })()`)
        return jsonrpc({ tools })
      }

      if (method === 'tools/call') {
        const { name: toolId, arguments: args } = params
        const result = await mcpVm.evalScript(`(async () => {
          const toolComp = jb.dsls.mcp?.tool?.['${toolId}']?.[jb.coreUtils.asJbComp]
          if (!toolComp) return { content: [{ type: 'text', text: 'Tool not found: ${toolId}' }], isError: true }
          return jb.coreUtils.runMcpTool('${toolId}', ${JSON.stringify(args || {})}, toolComp)
        })()`)
        return jsonrpc(result || { content: [{ type: 'text', text: 'no result' }], isError: true })
      }

      if (method === 'resources/read') {
        const uri = params.uri
        const match = uri.match(/^ui:\/\/react-comp\/(.+)$/)
        if (match) {
          const compId = match[1]
          const html = await mcpVm.evalScript(`(async () => {
            const { coreUtils } = await import('@jb6/core')
            const { renderReactCompToHtml } = await import('@jb6/mcp/mcp-utils.js')
            const jbComp = jb.dsls.react?.['react-comp']?.['${compId}']?.[coreUtils.asJbComp]
            const sourceFile = jbComp?.$location?.path
            const fileUrl = sourceFile && coreUtils.absPathToImportUrl?.(sourceFile, ${importMapJson}.imports, ${JSON.stringify(staticMappings)})
            const urlsToLoad = fileUrl ? [fileUrl] : []
            const metadata = typeof jbComp?.impl?.metadata === 'function' ? jbComp.impl.metadata() : jbComp?.impl?.metadata
            const fullScreen = !!coreUtils.asArray(metadata).find(m => m.fullScreen)?.fullScreen
            return renderReactCompToHtml('${compId}', ${importMapJson}, urlsToLoad, { origin: '${origin}', fullScreen })
          })()`)
          const csp = { resourceDomains: [origin], connectDomains: [origin], baseUriDomains: [origin] }
          return jsonrpc({ contents: [{ uri, mimeType: 'text/html;profile=mcp-app', text: html, _meta: { ui: { csp } } }] })
        }
        return jsonrpcError(-32002, `Resource not found: ${uri}`)
      }
      if (method === 'resources/list') return jsonrpc({ resources: [] })
      jsonrpcError(-32601, `Method not supported: ${method}`)
    } catch (error) {
      console.error('mcp vm error:', error?.stack || error)
      if (!res.headersSent) jsonrpcError(-32603, error.stack || error.message)
    }
  })
}