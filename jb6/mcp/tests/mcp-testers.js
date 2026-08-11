import { dsls } from '@jb6/core'
import '@jb6/testing'
import '@jb6/mcp'

const {
  tgp: { TgpType, Component },
  test: { Test,
    test: { dataTest }
  },
  common: { Data }
} = dsls

/**
 * MockMcpHost - simulates the host that contains an MCP Apps iframe
 * Based on MCP Apps Extension (SEP-1865) specification
 * Uses JSON-RPC 2.0 over postMessage for iframe-host communication
 * @see https://github.com/modelcontextprotocol/ext-apps
 */
export class MockMcpHost {
  constructor(iframe) {
    this.iframe = iframe
    this.appCapabilities = null
    this.initialized = false
    this.messages = []
    this._resolveInit = null

    this._setupMessageListener()
  }

  _setupMessageListener() {
    this.messageHandler = (event) => {
      if (event.source !== this.iframe.contentWindow) return
      const data = event.data
      if (!data || typeof data !== 'object' || data.jsonrpc !== '2.0') return

      this.messages.push(data)

      // Handle JSON-RPC request from iframe (has id and method)
      if (data.id != null && data.method) {
        this._handleRequest(data)
      }
      // Handle JSON-RPC notification from iframe (has method but no id)
      else if (data.method && data.id == null) {
        this._handleNotification(data)
      }
    }
    window.addEventListener('message', this.messageHandler)
  }

  _handleRequest(data) {
    switch (data.method) {
      case 'ui/initialize':
        this.appCapabilities = data.params.capabilities
        // Respond per MCP Apps spec
        this._sendResponse(data.id, {
          capabilities: {
            requests: ['tools/call'],
            notifications: ['ui/notifications/tool-input', 'ui/notifications/tool-result']
          },
          hostContext: { theme: 'light' }
        })
        break
      case 'tools/call':
        // Mock tool call - respond with empty result
        this._sendResponse(data.id, {
          content: [{ type: 'text', text: '{}' }]
        })
        break
      default:
        this._sendError(data.id, -32601, `Method not found: ${data.method}`)
    }
  }

  _handleNotification(data) {
    if (data.method === 'ui/notifications/initialized') {
      this.initialized = true
      this._resolveInit?.()
    }
  }

  _sendResponse(id, result) {
    this.iframe.contentWindow.postMessage({
      jsonrpc: '2.0',
      id,
      result
    }, '*')
  }

  _sendError(id, code, message) {
    this.iframe.contentWindow.postMessage({
      jsonrpc: '2.0',
      id,
      error: { code, message }
    }, '*')
  }

  /**
   * Send tool result notification to iframe per MCP Apps spec
   * @param {Object} params - { toolName, toolInput, result: { content: [...] } }
   */
  sendToolResult(params) {
    this.iframe.contentWindow.postMessage({
      jsonrpc: '2.0',
      method: 'ui/notifications/tool-result',
      params
    }, '*')
  }

  /**
   * Send tool input notification to iframe
   * @param {Object} params - { toolName, toolInput }
   */
  sendToolInput(params) {
    this.iframe.contentWindow.postMessage({
      jsonrpc: '2.0',
      method: 'ui/notifications/tool-input',
      params
    }, '*')
  }

  // Wait for iframe to complete initialization
  waitForInit(timeout = 5000) {
    if (this.initialized) return Promise.resolve()
    return new Promise((resolve, reject) => {
      this._resolveInit = resolve
      setTimeout(() => reject(new Error('MockMcpHost: init timeout')), timeout)
    })
  }

  destroy() {
    window.removeEventListener('message', this.messageHandler)
  }
}

Component('mcpToolTest', {
  type: 'test<test>',
  params: [
    {id: 'tool', as: 'string'},
    {id: 'args', as: 'object'},
    {id: 'mcpUrl', as: 'string', defaultValue: 'http://localhost:8083/mcp'},
    {id: 'expectedResult', type: 'boolean', dynamic: true}
  ],
  impl: dataTest({
    calculate: async (ctx,{},{tool, args, mcpUrl}) => {
        const req = {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name": tool, arguments: args || {}}}
        const json = await mcpFetch(mcpUrl, req)
        const mcpRes = json?.result?.content?.[0]?.text
        let parsedMcpRes
        try {
          parsedMcpRes = /^[\s]*[{\[]/.test(mcpRes) && JSON.parse(mcpRes)
        } catch(e) {}
        if (parsedMcpRes?.error)
          return { testFailure: parsedMcpRes?.error}
        if (!mcpRes)
          return { testFailure: 'error in mcp res', json }
        return mcpRes
    },
    expectedResult: '%$expectedResult()%',
    timeout: 5000
  })
})

async function mcpFetch(url, req) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body: JSON.stringify(req)
  })
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('text/event-stream')) {
    const text = await res.text()
    const last = text.split('\n').filter(l => l.startsWith('data: ')).pop()
    return last ? JSON.parse(last.slice(6)) : null
  }
  return res.json()
}

Component('mcpHttpTest', {
  type: 'test<test>',
  params: [
    {id: 'tool', as: 'string'},
    {id: 'args', as: 'object'},
    {id: 'mcpUrl', as: 'string', defaultValue: 'http://localhost:8083/mcp'},
    {id: 'expectedResult', type: 'boolean', dynamic: true}
  ],
  impl: dataTest({
    calculate: async (ctx,{},{tool, args, mcpUrl}) => {
        const req = {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name": tool, arguments: args || {}}}
        const json = await mcpFetch(mcpUrl, req)
        const mcpRes = json?.result?.content?.[0]?.text
        let parsedMcpRes
        try {
          parsedMcpRes = /^[\s]*[{\[]/.test(mcpRes) && JSON.parse(mcpRes)
        } catch(e) {}
        if (parsedMcpRes?.error)
          return { testFailure: parsedMcpRes?.error}
        if (!mcpRes)
          return { testFailure: 'error in mcp res', json }
        return mcpRes
    },
    expectedResult: '%$expectedResult()%',
    timeout: 5000
  })
})

/**
 * mcpUiResourceTest - Tests that MCP UI resources return valid HTML (Node.js compatible)
 * Does NOT create iframe or run the HTML - just verifies the server response
 */
Component('mcpUiResourceTest', {
  type: 'test<test>',
  params: [
    {id: 'compId', as: 'string', description: 'React component ID to test'},
    {id: 'expectedResult', type: 'boolean', dynamic: true},
    {id: 'mcpUrl', as: 'string', defaultValue: 'http://localhost:8083'}
  ],
  impl: dataTest({
    calculate: async (ctx,{},{compId, mcpUrl}) => {
      const resourceUri = `ui://react-comp/${compId}`
      const req = {"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri": resourceUri}}
      const json = await mcpFetch(`${mcpUrl}/mcp`, req)
      if (json.error) return { testFailure: json.error.message, json }
      const html = json?.result?.contents?.[0]?.text
      if (!html) return { testFailure: 'No HTML in response', json }
      return html
    },
    expectedResult: '%$expectedResult()%',
    timeout: 5000
  })
})

/**
 * mcpReactTest - Tests React components served via MCP UI resources
 * Creates an iframe with the component HTML, uses MockMcpHost for communication
 * Per MCP Apps Extension (SEP-1865) specification
 * NOTE: This test requires a BROWSER environment - it won't work in Node.js
 */
Component('mcpReactTest', {
  type: 'test<test>',
  params: [
    {id: 'compId', as: 'string', description: 'React component ID to test'},
    {id: 'toolResult', as: 'object', description: 'Tool result to send via ui/notifications/tool-result'},
    {id: 'mcpUrl', as: 'string', defaultValue: 'http://localhost:8083'},
    {id: 'expectedResult', type: 'boolean', dynamic: true}
  ],
  impl: dataTest({
    calculate: async (ctx,{singleTest},{compId, toolResult, mcpUrl}) => {
      const resourceUri = `ui://react-comp/${compId}`
      const req = {"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri": resourceUri}}
      const json = await mcpFetch(`${mcpUrl}/mcp`, req)
      const html = json?.result?.contents?.[0]?.text
      if (!html) return { testFailure: 'Failed to get UI resource HTML', json }

      // Create iframe and load HTML
      const iframe = document.createElement('iframe')
      iframe.style.cssText = 'width: 800px; height: 600px; border: 1px solid #ccc;'
      iframe.sandbox = 'allow-scripts allow-same-origin'
      document.body.appendChild(iframe)

      // Create mock host and wait for iframe to initialize
      const mockHost = new MockMcpHost(iframe)

      // Write HTML to iframe
      iframe.srcdoc = html

      try {
        // Wait for MCP Apps initialization handshake
        await mockHost.waitForInit(5000)

        // Send tool result if provided
        if (toolResult) {
          mockHost.sendToolResult({
            toolName: compId,
            toolInput: {},
            content: [{ type: 'text', text: JSON.stringify(toolResult) }]
          })
          // Give time for render
          await new Promise(r => setTimeout(r, 500))
        }

        return {
          initialized: mockHost.initialized,
          messages: mockHost.messages,
          appCapabilities: mockHost.appCapabilities
        }
      } finally {
        if (!singleTest) {
          mockHost.destroy()
          iframe.remove()
        }
      }
    },
    expectedResult: '%$expectedResult()%',
    timeout: 10000
  })
})
