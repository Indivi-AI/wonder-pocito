import { dsls, coreUtils } from '@jb6/core'
import '@jb6/common'
import '@jb6/react'

const {
  tgp: { TgpType, Component },
  common: { Data,
    data: { first, pipe }
  }
} = dsls

// Define core types
TgpType('tool', 'mcp', {
  resultExample: `{ content: {type:"text", text:string}[], isError: boolean, _meta?: {ui: {resourceUri: string}} }`
})

export function renderReactCompToHtml(compId, importMap = {}, urlsToLoad = [], { origin = '', fullScreen = false } = {}) {
  const fix = v => origin && v.startsWith('/') ? origin + v : v
  const imports = importMap.imports ? Object.fromEntries(Object.entries(importMap.imports).map(([k, v]) => [k, fix(v)])) : {}
  const importMapJson = JSON.stringify({ imports })
  const urlsJson = JSON.stringify(urlsToLoad.map(fix))
  return `<!DOCTYPE html>
<html>
<head><meta name="viewport" content="width=device-width, initial-scale=1.0">
${origin ? `<base href="${origin}/">` : ''}
<script type="importmap">${importMapJson}</script>
<style>html, body { height: 100%; margin: 0; padding: 0; }
.fs-btn { position: fixed; top: 6px; right: 6px; z-index: 9999; background: rgba(255,255,255,.9); border: 1px solid #ccc; border-radius: 4px; padding: 4px 6px; cursor: pointer; line-height: 0; }
.fs-btn:hover { background: #e8e8e8; }</style>
</head>
<body>
  <div id="show"></div>
  <script type="module">
    const origin = '${origin}'
    ${origin ? `const _fetch = globalThis.fetch; globalThis.fetch = (url, ...args) => _fetch(typeof url === 'string' && url.startsWith('/') ? '${origin}' + url : url, ...args)` : ''}
    const PROTOCOL_VERSION = '2026-01-26'
    let requestId = 0
    class App {
      constructor(appInfo, capabilities = {}) {
        this.appInfo = appInfo; this.capabilities = capabilities; this.pendingRequests = new Map()
        this.target = window.parent; this.ontoolresult = null; this.ontoolinput = null
        window.addEventListener('message', e => e.data?.jsonrpc === '2.0' && this._handleMessage(e.data))
      }
      connect() {
        return this._sendRequest('ui/initialize', {
          protocolVersion: PROTOCOL_VERSION, appInfo: this.appInfo, appCapabilities: this.capabilities
        }).then(r => { this._sendNotification('ui/notifications/initialized', {}); return r })
      }
      _handleMessage(data) {
        if (data.id != null && (data.result !== undefined || data.error !== undefined)) {
          const p = this.pendingRequests.get(data.id)
          if (p) { this.pendingRequests.delete(data.id); data.error ? p.reject(new Error(data.error.message)) : p.resolve(data.result) }
          return
        }
        if (data.method === 'ui/notifications/tool-result') this.ontoolresult?.(data.params)
        else if (data.method === 'ui/notifications/tool-input') this.ontoolinput?.(data.params)
      }
      _sendRequest(method, params) {
        const id = ++requestId
        return new Promise((resolve, reject) => { this.pendingRequests.set(id, { resolve, reject }); this.target.postMessage({ jsonrpc: '2.0', id, method, params }, '*') })
      }
      _sendNotification(method, params) { this.target.postMessage({ jsonrpc: '2.0', method, params }, '*') }
      callServerTool(req) { return this._sendRequest('tools/call', req) }
      requestSize(size) { this._sendNotification('ui/notifications/size-changed', size) }
      requestDisplayMode(mode) { return this._sendRequest('ui/request-display-mode', { mode }) }
    }

    const app = globalThis.mcpApp = new App({ name: '${compId}', version: '1.0.0' }, { availableDisplayModes: ['inline', 'fullscreen'] })

    import { dsls, coreUtils } from '@jb6/core'
    import { reactUtils } from '@jb6/react'
    import '@jb6/react/lib/tailwindcss-3.4.17.js'
    import '@jb6/react/codemirror-utils.js'
    reactUtils.loadLucid05()
    const { h, hh } = reactUtils

    for (const file of ${urlsJson}) await import(file)

    let ctx = new coreUtils.Ctx().setVars({react: reactUtils, isLocalHost: true, dbCategories: {sandboxed: true}, localhostServer: origin || 'http://localhost:3000'})
    const root = reactUtils.createRoot(document.getElementById('show'))
    let compArgs = null
    const render = async (args) => {
      const { reactCmp, ctx: rCtx } = await reactUtils.runOnHost('${compId}', ctx, args)
      root.render(h('div', {}, hh(rCtx, reactCmp)))
    }

    await app.connect()
    ${fullScreen ? "await app.requestDisplayMode('fullscreen')" : ''}

    let currentMode = '${fullScreen ? 'fullscreen' : 'inline'}'
    const fsBtn = document.createElement('button')
    fsBtn.className = 'fs-btn'
    fsBtn.title = 'Toggle fullscreen'
    const expandSvg = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8.5 1.5H12.5V5.5"/><path d="M5.5 12.5H1.5V8.5"/><path d="M12.5 1.5L8 6"/><path d="M1.5 12.5L6 8"/></svg>'
    const shrinkSvg = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12.5 1.5L8.5 5.5"/><path d="M8.5 1.5V5.5H12.5"/><path d="M1.5 12.5L5.5 8.5"/><path d="M5.5 12.5V8.5H1.5"/></svg>'
    const updateBtn = () => { fsBtn.innerHTML = currentMode === 'fullscreen' ? shrinkSvg : expandSvg; fsBtn.title = currentMode === 'fullscreen' ? 'Exit fullscreen' : 'Enter fullscreen' }
    updateBtn()
    fsBtn.onclick = async () => {
      const newMode = currentMode === 'fullscreen' ? 'inline' : 'fullscreen'
      try { const r = await app.requestDisplayMode(newMode); currentMode = r.mode || newMode; updateBtn() } catch(e) {}
    }
    document.body.appendChild(fsBtn)

    const parse = (params) => { try { return JSON.parse(params?.content?.find(c => c.type === 'text')?.text) } catch(e) {} }

    app.ontoolinput = (args) => { debugger; compArgs = args.arguments; if (compArgs) render(compArgs) }
    app.ontoolresult = (params) => { debugger; const data = parse(params); if (data) { ctx = ctx.setVars({llmInput: data}); if (compArgs) render(compArgs) } }
    render({})
    new ResizeObserver(() => app.requestSize({ height: document.body.scrollHeight })).observe(document.body)
  </script>
</body>
</html>`
}

coreUtils.runMcpTool = runMcpTool
export async function runMcpTool(name, args, toolComp) {
  const jbComp = dsls.react?.['react-comp']?.[name]?.[coreUtils.asJbComp]
  if (jbComp) {
    coreUtils.resolveCompArgs(jbComp)
    const metadata = typeof jbComp.impl.metadata === 'function' ? jbComp.impl.metadata() : jbComp.impl.metadata
    const calcData = coreUtils.asArray(metadata).find(m => m.calcData)?.calcData
    if (calcData) {
      const mergedArgs = Object.fromEntries((toolComp.params || []).map(p => [p.id, (args || {})[p.id] ?? p.defaultValue]).filter(([,v]) => v != null))
      const ctx = new coreUtils.Ctx().setJbCtx(new coreUtils.JBCtx({args: mergedArgs}))
      const data = await ctx.run(calcData)
      const text = typeof data === 'string' ? data : JSON.stringify(data)
      return { content: [{ type: 'text', text }], _meta: { ui: { resourceUri: `ui://react-comp/${name}` } } }
    }
  }
  return await new coreUtils.Ctx().run({$: toolComp, ...args})
}

export async function startMcpServer(transport, { allTools, importMap } = {}) {
  const { Server } = await import("@modelcontextprotocol/sdk/server/index.js")
  const { z } = await import('zod')
  const { ListToolsRequestSchema, CallToolRequestSchema, ReadResourceRequestSchema } = await import("@modelcontextprotocol/sdk/types.js")

  const toolConfigs = allTools.map(({id, toolComp}) => {
    const reactJbComp = dsls.react?.['react-comp']?.[id]?.[coreUtils.asJbComp]
    const base = { name: id, description: toolComp.description || `Tool: ${id}`,
      inputSchema: { type: "object",
        properties: (toolComp.params || []).reduce((props, param) => { props[param.id] = { type: param.as === 'number' ? 'number' : 'string', description: param.description || '' }; return props }, {}),
        required: (toolComp.params || []).filter(p => p.mandatory).map(p => p.id) } }
    if (!reactJbComp) return base
    const metadata = typeof reactJbComp.impl.metadata === 'function' ? reactJbComp.impl.metadata() : reactJbComp.impl.metadata
    const mcpMeta = coreUtils.asArray(metadata).find(m => m.calcData || m.fullScreen)
    return { ...base, _meta: { ui: { resourceUri: `ui://react-comp/${id}`, ...(mcpMeta?.fullScreen && { displayMode: 'fullscreen' }) } } }
  })

  const mcpServer = new Server(
    { name: 'JB6 MCP Server', version: '1.0.0' },
    { capabilities: { tools: {}, prompts: {}, resources: {} } }
  )
  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolConfigs }))

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const toolComp = allTools.find(({id}) => id == name)?.toolComp
    return runMcpTool(name, args, toolComp)
  })

  // Handle UI resource reads for react-comp tools
  mcpServer.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri
    const match = uri.match(/^ui:\/\/react-comp\/(.+)$/)
    if (match) {
      const compId = match[1]
      const reactComp = dsls.react?.['react-comp']?.[compId]
      const jbComp = reactComp?.[coreUtils.asJbComp]
      const sourceFile = jbComp?.$location?.path
      const { imports, staticMappings } = importMap || {}
      const fileUrl = sourceFile && imports && coreUtils.absPathToImportUrl?.(sourceFile, imports, staticMappings)
      const urlsToLoad = fileUrl ? [fileUrl] : []
      const browserImportMap = imports ? { imports } : {}
      const metadata = typeof jbComp.impl.metadata === 'function' ? jbComp.impl.metadata() : jbComp.impl.metadata
      const fullScreen = !!coreUtils.asArray(metadata).find(m => m.fullScreen)?.fullScreen
      const html = renderReactCompToHtml(compId, browserImportMap, urlsToLoad, { fullScreen })
      return { contents: [{ uri, mimeType: 'text/html;profile=mcp-app', text: html }] }
    }
    throw { code: -32002, message: `Resource not found: ${uri}` }
  })


    const GenericToolCallSchema = z.object({
      jsonrpc: z.literal("2.0"),
      id: z.union([z.string(), z.number(), z.null()]),
      method: z.literal("callTool"),
      params: z.object({ name: z.string(), arguments: z.record(z.unknown()) })
    })

    mcpServer.setRequestHandler(GenericToolCallSchema, async (request) => {
      const { name, arguments: args } = request.params
      const toolComp = allTools.find(({id}) => id == name)?.toolComp
      const result = await new coreUtils.Ctx().run({$: toolComp, ...args})
      return result
    })
      
    await mcpServer.connect(transport)
}

const squeezeText = Data('squeezeText', {
  description: 'squeeze text by deleting parts in the middle',
  params: [
    {id: 'text', defaultValue: '%%'},
    {id: 'maxLength', as: 'number', defaultValue: 20000},
    {id: 'keepPrefixSize', as: 'number', defaultValue: 1000}
  ],
  impl: async (ctx, {}, {text: _text, maxLength, keepPrefixSize}) => {
    const text = await Promise.resolve(_text).then(x=>x||'').then(x=>typeof x == 'object' ? JSON.stringify(x) : x)
    return (text.length > maxLength) ? [text.slice(0,keepPrefixSize),
      `===text was originally ${text.length}. sorry, we had to squeeze it to ${maxLength} chars. ${text.length - maxLength} missing chars here====`,
      text.slice(text.length-maxLength+keepPrefixSize)
    ].join('') : text
  }
})

Component('mcpUi', {
  type: 'react-metadata<react>',
  params: [
    {id: 'calcData', dynamic: true},
    {id: 'fullScreen', as: 'boolean', byName: true}
  ]
})

Component('mcpTool', {
  moreTypes: 'tool<mcp>',
  description: 'wrap text as mcp result',
  params: [
    {id: 'text', dynamic: true},
    {id: 'maxLength', as: 'number', defaultValue: 200000, byName: true}
  ],
  impl: pipe(
    '%$text()%',
    squeezeText('%%', '%$maxLength%'),
    ({data}) => ({ content: [{ type: 'text', text: data }], isError: data.indexOf('Error') == 0 }),
    first()
  )
})
