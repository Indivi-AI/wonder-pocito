import { dsls } from '@jb6/core'
import '@jb6/react'
import './platform-v0-model.js'
import './platform-v0-services.js'
import './platform-v0-navigation.js'
import './platform-v0-marketplace.js'
import './platform-v0-resource-modal.js'
import './platform-v0-workspace.js'
import './platform-v0-chat.js'
import './platform-v0-evaluation.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('PlatformV0', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh, useEffect, useState}}) => () => {
      const config = dsls.common.data.platformV0Config.$run()
      const [view, setView] = useState('plugins'), [catalog, setCatalog] = useState(), [search, setSearch] = useState('')
      const [workspace, setWorkspace] = useState(), [editors, setEditors] = useState([]), [picker, setPicker] = useState()
      const [conversationName, setConversationName] = useState('conversation-orlight'), [message, setMessage] = useState('')
      const [busy, setBusy] = useState(false), [runningSet, setRunningSet] = useState(''), [notice, setNotice] = useState('')
      const serverUrl = ctx.vars.platformUrl || new URLSearchParams(location.search).get('platformUrl') || 'http://localhost:7777'
      const request = (method, resource, name, body) => dsls.common.data.platformMarketplaceApi.$runWithCtx(ctx, {
        method, path: `/api/v1/${resource}${name ? `/${encodeURIComponent(name)}` : ''}`, body, baseUrl: serverUrl
      })
      const loadCatalog = () => Promise.all(config.apiResources.map(async resource => [resource, await request('GET', resource)]))
        .then(rows => setCatalog(Object.fromEntries(rows)))
      useEffect(() => { void loadCatalog() }, [])
      const flash = text => (setNotice(text), setTimeout(() => setNotice(''), 1800))
      const blank = resource => ({name: '', title: '', description: '', instructions: '', version: 'V0', skills: [], tools: [], agents: [],
        evalSet: '', rows: [], rubric: '', kind: resource == 'tools' ? 'flow' : undefined, inputSchema: [], outputCubes: []})
      const saveItem = async (resource, item) => {
        const {originalName, ...body} = item, saved = await request(originalName ? 'PUT' : 'POST', resource, originalName, body)
        await loadCatalog(); return saved
      }
      const openView = id => (setView(id), setWorkspace(), setSearch(''))
      const openItem = (resource, item) => ['plugins', 'agents'].includes(resource)
        ? (setWorkspace({resource, item}), setView('workspace'))
        : setEditors([{resource, item: {...item, originalName: item.name}, createLabel: config.resources[resource]?.createLabel}])
      const createItem = resource => setEditors([{resource, item: blank(resource), createLabel: config.resources[resource]?.createLabel}])
      const saveWorkspace = async item => {
        const saved = await saveItem(workspace.resource, {...item, originalName: workspace.item.name})
        setWorkspace({...workspace, item: saved}); flash('נשמר אוטומטית'); return saved
      }
      const deleteWorkspace = async () => {
        await request('DELETE', workspace.resource, workspace.item.name); await loadCatalog(); openView(workspace.resource)
      }
      const openWorkspaceEditor = (resource, item) => item && setEditors([...editors, {
        resource, item: {...item, originalName: item.name}, createLabel: config.resources[resource]?.createLabel}])
      const openWorkspacePicker = (key, resource, label) => setPicker({source: 'workspace', key, resource, label,
        single: config.resources[resource].typeLabel, selected: workspace.item[key] || [], query: ''})
      const openEditorPicker = (key, resource, label) => setPicker({source: 'editor', editorIndex: editors.length - 1,
        key, resource, label, single: config.resources[resource].typeLabel, selected: editors.at(-1).item[key] || [], query: ''})
      const attachSelected = async () => {
        if (picker.source == 'workspace') await saveWorkspace({...workspace.item, [picker.key]: picker.selected})
        else setEditors(editors.map((entry, index) => index == picker.editorIndex
          ? {...entry, item: {...entry.item, [picker.key]: picker.selected}} : entry))
        setPicker()
      }
      const createNested = resource => {
        const attachTo = picker
        setPicker(); setEditors([...editors, {resource, item: blank(resource), attachTo,
          createLabel: resource == 'tools' ? 'כלי חדש ממארז Flow' : config.resources[resource].createLabel}])
      }
      const saveEditor = async () => {
        const active = editors.at(-1), saved = await saveItem(active.resource, active.item), rest = editors.slice(0, -1)
        if (active.attachTo?.source == 'workspace') {
          const key = active.attachTo.key, values = [...new Set([...(workspace.item[key] || []), saved.name])]
          await saveWorkspace({...workspace.item, [key]: values}); setEditors(rest)
        } else if (active.attachTo?.source == 'editor') {
          setEditors(rest.map((entry, index) => index == active.attachTo.editorIndex ? {...entry, item: {...entry.item,
            [active.attachTo.key]: [...new Set([...(entry.item[active.attachTo.key] || []), saved.name])]}} : entry))
        } else if (['plugins', 'agents'].includes(active.resource)) {
          setEditors([]); setWorkspace({resource: active.resource, item: saved}); setView('workspace')
        } else {
          setEditors([]); setView(active.resource == 'evalSets' ? 'evaluation' : active.resource); flash('נשמר בקטלוג המשותף')
        }
      }
      const deleteEditor = async () => {
        const active = editors.at(-1)
        await request('DELETE', active.resource, active.item.originalName); await loadCatalog(); setEditors(editors.slice(0, -1))
      }
      const runAgent = (text, agentId, sessionId) => dsls.common.data.platformAgnoRun.$runWithCtx(ctx, {
        message: text, agentId, sessionId, baseUrl: serverUrl, opikBaseUrl: ctx.vars.opikBaseUrl, token: ctx.vars.agnoToken
      })
      const runEval = async (set, targetResource, target) => {
        const startedAt = Date.now(), name = `eval-${startedAt}`
        const started = new Date(startedAt).toLocaleString('he-IL', {dateStyle: 'short', timeStyle: 'short'})
        const pending = {name, set: set.name, targetResource, target: target.name, started, startedAt, status: 'מריץ…', completed: 0,
          total: set.rows.length, rows: []}
        await request('POST', 'evalRuns', '', pending); await loadCatalog()
        const rows = await Promise.all(set.rows.map(async (row, index) => {
          try {
            const result = await runAgent(row.input, target.name, `${name}-${index}`)
            return {...row, actual: result.content, runId: result.runId, opikUrl: result.opikUrl}
          } catch (error) { return {...row, actual: String(error.message || error), error: true} }
        }))
        const failed = rows.some(row => row.error), result = {...pending, status: failed ? 'נכשל' : 'הושלם',
          completed: rows.filter(row => !row.error).length, rows}
        await request('PUT', 'evalRuns', name, result); await loadCatalog(); return result
      }
      const activeConversation = catalog?.conversations?.find(item => item.name == conversationName) || catalog?.conversations?.[0]
      const updateConversation = async conversation => {
        setCatalog(current => ({...current, conversations: current.conversations.map(item => item.name == conversation.name ? conversation : item)}))
        await request('PUT', 'conversations', conversation.name, conversation)
      }
      const newConversation = async () => {
        const conversation = {name: `conversation-${Date.now()}`, title: 'שיחה חדשה', plugin: '', updated: 'עכשיו', messages: []}
        const saved = await request('POST', 'conversations', '', conversation)
        setCatalog(current => ({...current, conversations: [saved, ...current.conversations]})); setConversationName(saved.name); setMessage('')
      }
      const send = async () => {
        const text = message.trim(), conversation = activeConversation
        if (!text || !conversation?.plugin || busy) return
        setMessage(''); setBusy(true)
        const pending = {...conversation, title: conversation.messages.length ? conversation.title : text.slice(0, 42), updated: 'עכשיו',
          messages: [...conversation.messages, {id: `m-${Date.now()}`, role: 'user', text}]}
        await updateConversation(pending)
        try {
          const result = await runAgent(text, conversation.plugin, conversation.name)
          const parsed = dsls.common.data.platformReportMarkers.$runWithCtx(ctx, {text: result.content})
          const plugin = catalog.plugins.find(item => item.name == conversation.plugin)
          const trace = dsls.common.data.platformV0Trace.$runWithCtx(ctx, {catalog, target: plugin})
          await updateConversation({...pending, messages: [...pending.messages, {id: `m-${Date.now() + 1}`, role: 'assistant',
            text: parsed.content, reports: parsed.reportIds, runId: result.runId, opikUrl: result.opikUrl, status: 'הושלם', trace}]})
        } catch (error) {
          await updateConversation({...pending, messages: [...pending.messages, {id: `m-${Date.now() + 1}`, role: 'assistant',
            text: String(error.message || error), status: 'נכשל', trace: []}]})
        } finally { setBusy(false) }
      }
      const runSet = async (set, plugin) => {
        setRunningSet(set.name); await runEval(set, 'plugins', plugin); setRunningSet('')
      }
      if (!catalog) return h('div:grid min-h-screen place-items-center', {}, h('L:Loader2', {size: 24, className: 'animate-spin'}))
      const content = view == 'workspace' && workspace ? hh(ctx, dsls.react['react-comp'].PlatformV0Workspace, {
        workspace, catalog, back: () => openView(workspace.resource), saveWorkspace, deleteWorkspace,
        openPicker: openWorkspacePicker, openEditor: openWorkspaceEditor, runAgent, runEval
      }) : view == 'chat' ? hh(ctx, dsls.react['react-comp'].PlatformV0Chat, {catalog, conversation: activeConversation, message,
        setMessage, busy, send, updateConversation, newConversation, setConversation: setConversationName})
        : view == 'evaluation' ? hh(ctx, dsls.react['react-comp'].PlatformV0Evaluation, {catalog, search, setSearch,
          openSet: item => setEditors([{resource: 'evalSets', item: {...item, originalName: item.name}}]),
          createSet: () => setEditors([{resource: 'evalSets', item: blank('evalSets'), createLabel: 'סט חדש'}]), runningSet, runSet})
          : hh(ctx, dsls.react['react-comp'].PlatformV0Marketplace, {view, catalog, search, setSearch, openItem, createItem})
      return h('div:min-h-screen overflow-x-hidden bg-[#f7f8f6] text-[#202724]', {dir: 'rtl', lang: 'he', style: {
        fontFamily: 'Arial, system-ui, sans-serif', backgroundImage: 'radial-gradient(#dfe4e1 0.7px, transparent 0.7px)',
        backgroundSize: '18px 18px'}}, hh(ctx, dsls.react['react-comp'].PlatformV0Navigation, {
        view: view == 'workspace' ? workspace?.resource : view, openView, setView}), content,
        editors.length > 0 && hh(ctx, dsls.react['react-comp'].PlatformV0ResourceModal, {
          editors, setEditors, catalog, saveEditor, deleteEditor, openPicker: openEditorPicker}),
        picker && hh(ctx, dsls.react['react-comp'].PlatformV0AttachPicker, {picker, catalog, setPicker, attachSelected, createNested}),
        notice && h('div:fixed bottom-5 left-5 z-[100] rounded-xl border border-[#c8ded0] bg-[#edf6f0] px-4 py-2 text-sm text-[#315e46]', {}, notice))
    }
  })
})
