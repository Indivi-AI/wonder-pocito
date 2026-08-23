import { dsls } from '@jb6/core'
import '@jb6/common'

const { common: { Data } } = dsls

Data('platformMarketplaceApi', {
  params: [
    {id: 'method', as: 'string', defaultValue: 'GET'},
    {id: 'path', as: 'string', mandatory: true},
    {id: 'body', asIs: true},
    {id: 'baseUrl', as: 'string', defaultValue: 'http://localhost:7777'}
  ],
  impl: async ({}, {}, {method, path, body, baseUrl}) => {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method, headers: body ? {'Content-Type': 'application/json'} : {}, ...(body && {body: JSON.stringify(body)})
    })
    if (!response.ok) throw new Error(`Marketplace ${response.status}: ${await response.text()}`)
    return response.json()
  }
})

Data('platformAgnoRun', {
  params: [
    {id: 'message', as: 'string', mandatory: true},
    {id: 'agentId', as: 'string', defaultValue: 'proof-of-existence-analyst'},
    {id: 'sessionId', as: 'string', mandatory: true},
    {id: 'baseUrl', as: 'string', defaultValue: 'http://localhost:7777'},
    {id: 'opikBaseUrl', as: 'string'},
    {id: 'token', as: 'string'}
  ],
  impl: async ({}, {}, {message, agentId, sessionId, baseUrl, opikBaseUrl, token}) => {
    const body = new FormData()
    Object.entries({message, session_id: sessionId, user_id: 'platform-v0', stream: 'false'}).forEach(([key, value]) => body.append(key, value))
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/runtime/${encodeURIComponent(agentId)}/runs`, {
      method: 'POST', headers: token ? {Authorization: `Bearer ${token}`} : {}, body
    })
    if (!response.ok) throw new Error(`Agno ${response.status}: ${await response.text()}`)
    const run = await response.json()
    const runId = run.run_id
    return {content: typeof run.content == 'string' ? run.content : JSON.stringify(run.content), runId, status: run.status,
      opikUrl: run.opik_url || run.trace_url || opikBaseUrl && `${opikBaseUrl.replace(/\/$/, '')}/${runId}`}
  }
})

Data('platformReportMarkers', {
  params: [
    {id: 'text', as: 'string', mandatory: true}
  ],
  impl: ({}, {}, {text}) => ({
    content: text.replace(/\s*\[\[report:[\w-]+\]\]/g, '').trim(),
    reportIds: [...new Set([...text.matchAll(/\[\[report:([\w-]+)\]\]/g)].map(([, id]) => id))]
  })
})
