/**
 * Minimal MCP App client for receiving tool results from host
 * Based on @modelcontextprotocol/ext-apps but self-contained without dependencies
 */

const PROTOCOL_VERSION = '2026-01-26'
const UI_INITIALIZE = 'ui/initialize'
const UI_TOOL_RESULT = 'ui/notifications/tool-result'
const UI_TOOL_INPUT = 'ui/notifications/tool-input'
const UI_INITIALIZED = 'ui/notifications/initialized'

let requestId = 0

export class App {
  constructor(appInfo, capabilities = {}) {
    this.appInfo = appInfo
    this.capabilities = capabilities
    this.hostCapabilities = null
    this.hostInfo = null
    this.hostContext = null
    this.pendingRequests = new Map()

    // Notification handlers
    this.ontoolresult = null
    this.ontoolinput = null
    this.onhostcontextchanged = null
  }

  connect(target = window.parent) {
    this.target = target

    // Listen for messages from host
    window.addEventListener('message', (event) => {
      this._handleMessage(event.data)
    })

    // Send initialize request
    return this._sendRequest(UI_INITIALIZE, {
      protocolVersion: PROTOCOL_VERSION,
      appInfo: this.appInfo,
      capabilities: this.capabilities
    }).then(result => {
      this.hostCapabilities = result.capabilities
      this.hostInfo = result.hostInfo
      this.hostContext = result.hostContext

      // Notify host we're ready
      this._sendNotification(UI_INITIALIZED, {})

      return result
    })
  }

  _handleMessage(data) {
    if (!data || typeof data !== 'object') return

    // Handle JSON-RPC response
    if (data.id != null && (data.result !== undefined || data.error !== undefined)) {
      const pending = this.pendingRequests.get(data.id)
      if (pending) {
        this.pendingRequests.delete(data.id)
        if (data.error) {
          pending.reject(new Error(data.error.message || 'Unknown error'))
        } else {
          pending.resolve(data.result)
        }
      }
      return
    }

    // Handle notifications
    if (data.method) {
      switch (data.method) {
        case UI_TOOL_RESULT:
          this.ontoolresult?.(data.params)
          break
        case UI_TOOL_INPUT:
          this.ontoolinput?.(data.params)
          break
        case 'ui/notifications/host-context-changed':
          this.hostContext = { ...this.hostContext, ...data.params }
          this.onhostcontextchanged?.(data.params)
          break
      }
    }
  }

  _sendRequest(method, params) {
    const id = ++requestId
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      this.target.postMessage({
        jsonrpc: '2.0',
        id,
        method,
        params
      }, '*')
    })
  }

  _sendNotification(method, params) {
    this.target.postMessage({
      jsonrpc: '2.0',
      method,
      params
    }, '*')
  }

  // Call a tool on the MCP server through the host
  async callServerTool(request) {
    return this._sendRequest('tools/call', request)
  }

  // Send a message to the model/conversation
  async sendMessage(content) {
    return this._sendRequest('ui/message', { content })
  }

  // Open a link in the host
  async openLink(url) {
    return this._sendRequest('ui/open-link', { url })
  }

  getHostCapabilities() {
    return this.hostCapabilities
  }

  getHostContext() {
    return this.hostContext
  }
}
