import { dsls } from '@jb6/core'
import '@jb6/react'
import './platform-v0-model.js'
import './platform-v0-services.js'
import './platform-v0-navigation.js'
import './platform-v0-marketplace.js'
import './platform-v0-resource-modal.js'
import './platform-v0-chat.js'
import './platform-v0-evaluation.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('PlatformV0', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh, useEffect, useRef, useState}}) => () => {
      const config = dsls.common.data.platformV0Config.$run()
      const [view, setView] = useState('plugins'), [catalog, setCatalog] = useState(null), [search, setSearch] = useState('')
      const [draft, setDraft] = useState(null), [messages, setMessages] = useState(config.initialMessages)
      const [chatInput, setChatInput] = useState(''), [agentBusy, setAgentBusy] = useState(false)
      const [selectedAgent, setSelectedAgent] = useState('proof-of-existence-analyst')
      const [evaluations, setEvaluations] = useState(config.initialEvaluations)
      const sessionId = useRef(globalThis.crypto?.randomUUID?.() || `session-${Date.now()}`)
      const serverUrl = ctx.vars.platformUrl || new URLSearchParams(location.search).get('platformUrl') || 'http://localhost:7777'
      const request = (method, resource, name, body) => dsls.common.data.platformMarketplaceApi.$runWithCtx(ctx, {
        method, path: `/api/v1/${resource}${name ? `/${encodeURIComponent(name)}` : ''}`, body, baseUrl: serverUrl
      })
      const loadCatalog = () => Promise.all(Object.keys(config.resources).map(async resource => [resource, await request('GET', resource)]))
        .then(rows => setCatalog(Object.fromEntries(rows)))
      useEffect(() => { void loadCatalog() }, [])
      const saveResource = async () => {
        const {resource, originalName, ...body} = draft
        await request(originalName ? 'PUT' : 'POST', resource, originalName, body)
        setDraft(null)
        loadCatalog()
      }
      const deleteResource = async (resource, name) => {
        await request('DELETE', resource, name)
        loadCatalog()
      }
      const sendMessage = async () => {
        const message = chatInput.trim()
        if (!message || agentBusy) return
        setMessages(items => [...items, {role: 'user', text: message}])
        setChatInput('')
        setAgentBusy(true)
        try {
          const run = await dsls.common.data.platformAgnoRun.$runWithCtx(ctx, {
            message, agentId: selectedAgent, sessionId: sessionId.current, baseUrl: serverUrl, token: ctx.vars.agnoToken
          })
          const parsed = dsls.common.data.platformReportMarkers.$runWithCtx(ctx, {text: run.content})
          setMessages(items => [...items, {role: 'assistant', text: parsed.content, reports: parsed.reportIds, runId: run.runId}])
        } catch (error) {
          setMessages(items => [...items, {role: 'assistant', error: true, text: `Agno: ${error.message || error}`}])
        } finally { setAgentBusy(false) }
      }
      const openView = id => (setView(id), setSearch(''))
      const viewContent = view == 'chat'
        ? hh(ctx, dsls.react['react-comp'].PlatformV0Chat, {
          catalog, messages, chatInput, setChatInput, agentBusy, sendMessage, selectedAgent, setSelectedAgent
        })
        : view == 'evaluation'
          ? hh(ctx, dsls.react['react-comp'].PlatformV0Evaluation, {evaluations, setEvaluations})
          : hh(ctx, dsls.react['react-comp'].PlatformV0Marketplace, {view, catalog, search, setSearch, setDraft, deleteResource})
      return h('div:min-h-screen overflow-x-hidden bg-[#f7f8f6] text-[#202724]', {
        dir: 'rtl', lang: 'he', style: {fontFamily: 'Arial, system-ui, sans-serif',
          backgroundImage: 'radial-gradient(#dfe4e1 0.7px, transparent 0.7px)', backgroundSize: '18px 18px'}
      }, hh(ctx, dsls.react['react-comp'].PlatformV0Navigation, {view, openView, setView}), viewContent,
      draft && hh(ctx, dsls.react['react-comp'].PlatformV0ResourceModal, {draft, setDraft, saveResource}))
    }
  })
})
