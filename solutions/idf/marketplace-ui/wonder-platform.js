import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-marketplace-api.js'
import './wonder-platform-repository.js'
import './wonder-platform-views.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls
const { wonderPlatformRunAgent, wonderPlatformListSkills, wonderPlatformLoadSkill, wonderPlatformMarketplaceCall,
  wonderPlatformMarketplaceDetail, wonderPlatformMarketplaceManifest, wonderPlatformMarketplaceRepository,
  wonderPlatformPublishSkill, wonderPlatformSaveRepository, wonderPlatformUpsert } = dsls.common.data

ReactComp('wonderPlatform', {
  params: [
    {id: 'roomWUrl', as: 'string', defaultValue: 'room://wonder-platform'},
    {id: 'marketplaceBaseUrl', as: 'string', defaultValue: 'http://localhost:7777'},
    {id: 'agentOsBaseUrl', as: 'string', defaultValue: 'http://localhost:7777'},
    {id: 'agentOsToken', as: 'string'},
    {id: 'loadRepo', dynamic: true, defaultValue: wonderPlatformMarketplaceRepository('%$roomWUrl%', '%$marketplaceBaseUrl%')},
    {id: 'saveRepo', dynamic: true, defaultValue: wonderPlatformSaveRepository('%$roomWUrl%', '%$repo%')},
    {id: 'upsert', dynamic: true, defaultValue: wonderPlatformUpsert('%$repo%', '%$resource%', { item: '%$item%' })},
    {id: 'loadSkill', dynamic: true, defaultValue: wonderPlatformLoadSkill('%$docletWUrl%')},
    {id: 'listSkills', dynamic: true, defaultValue: wonderPlatformListSkills('%$roomWUrl%')},
    {id: 'publishSkill', dynamic: true, defaultValue: wonderPlatformPublishSkill('%$roomWUrl%', '%$skill%')},
    {id: 'marketplaceCall', dynamic: true, defaultValue: wonderPlatformMarketplaceCall('%$operation%', '%$resource%', {
      name: '%$name%',
      body: '%$body%',
      roomWUrl: '%$roomWUrl%',
      baseUrl: '%$marketplaceBaseUrl%'
    })},
    {id: 'marketplaceDetail', dynamic: true, defaultValue: wonderPlatformMarketplaceDetail('%$resource%', '%$name%', {
      roomWUrl: '%$roomWUrl%',
      baseUrl: '%$marketplaceBaseUrl%'
    })},
    {id: 'manifest', dynamic: true, defaultValue: wonderPlatformMarketplaceManifest('%$resource%', '%$item%', { operation: '%$operation%' })},
    {id: 'runAgent', dynamic: true, defaultValue: wonderPlatformRunAgent('%$text%', '%$target%', {
      sessionId: '%$sessionId%',
      roomWUrl: '%$roomWUrl%',
      baseUrl: '%$agentOsBaseUrl%',
      token: '%$agentOsToken%',
      repo: '%$repo%'
    })}
  ],
  impl: comp({
    hFunc: (ctx, {react: {h, hh, useEffect, useState}},
      {roomWUrl, marketplaceBaseUrl, agentOsBaseUrl, agentOsToken, loadRepo, saveRepo, upsert, loadSkill, listSkills, publishSkill,
        marketplaceCall, marketplaceDetail, manifest, runAgent}) => () => {
      const repositoryRoomWUrl = ctx.vars.roomWUrl || roomWUrl, marketplaceUrl = ctx.vars.marketplaceBaseUrl || marketplaceBaseUrl
      const agentUrl = ctx.vars.agentOsBaseUrl || agentOsBaseUrl, token = ctx.vars.agentOsToken || agentOsToken
      const config = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx), [view, setView] = useState('plugins')
      const [repo, setRepo] = useState(), [loadError, setLoadError] = useState(), [search, setSearch] = useState('')
      const [workspace, setWorkspace] = useState()
      const [editors, setEditors] = useState([]), [picker, setPicker] = useState(), [report, setReport] = useState()
      const [conversationId, setConversationId] = useState('c1'), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
      const [runningSet, setRunningSet] = useState(''), [notice, setNotice] = useState('')
      useEffect(() => { void Promise.resolve(loadRepo(ctx.setVars({roomWUrl: repositoryRoomWUrl, marketplaceBaseUrl: marketplaceUrl}))).then(setRepo, setLoadError) }, [])
      const flash = text => (setNotice(text), setTimeout(() => setNotice(''), 1800))
      const persistRepo = async next => (setRepo(next), next.marketplace || await saveRepo(
        ctx.setVars({repo: next, roomWUrl: repositoryRoomWUrl})), next)
      const blank = resource => ({id: `${config.prefixes[resource]}-${Date.now()}`, name: '', desc: '', instructions: '',
        version: resource == 'skills' ? '1.0.0' : 'V0', publishVersion: resource == 'skills' ? '1.0.0' : undefined, content: '',
        created: 'היום', updated: 'עכשיו', skillIds: [], toolIds: [], subagentIds: [], evaluationId: '', rows: [], rubric: '',
        kind: resource == 'tools' ? 'connector' : undefined, managed: false, tags: [], readme: '', backendConfig: {harness_type: 'deepagents'},
        pluginIds: [], assets: [], toolType: resource == 'tools' ? 'code' : undefined, jsonSchema: {}, isAsync: true, tracable: true,
        dedicatedToolConfig: {}, codeFiles: [], packageId: '', inputSchema: [], outputCubes: []})
      const saveRemote = async (resource, item) => {
        const operation = item.originalId ? 'update' : 'create', body = manifest(ctx.setVars({resource, item, operation}))
        const response = await marketplaceCall(ctx.setVars({operation, resource, name: item.originalId, body,
          roomWUrl: repositoryRoomWUrl, marketplaceBaseUrl: marketplaceUrl}))
        return {...dsls.common.data.wonderPlatformMarketplaceItem.$runWithCtx(ctx, {resource, item: {...body, ...response}}),
          originalId: item.originalId}
      }
      const saveItem = async (resource, item) => {
        if (repo.marketplace && ['plugins', 'skills', 'tools', 'subagents'].includes(resource)) item = await saveRemote(resource, item)
        const result = upsert(ctx.setVars({repo, resource, item}))
        await persistRepo(result.repo); return result.saved
      }
      const skillDraft = async item => {
        if (repo.marketplace) return item
        const loaded = await loadSkill(ctx.setVars({roomWUrl: repositoryRoomWUrl, docletWUrl: `${item.docletUrl}?v=${item.version}`}))
        return {...item, content: loaded?.content || '', publishVersion: dsls.common.data.wonderPlatformNextVersion.$run(item.version)}
      }
      const openView = id => (setView(id), setWorkspace(), setReport(), setSearch(''))
      const openItem = async (resource, item) => {
        if (resource == 'reports') return setReport(item), setView('report')
        if (repo.marketplace && ['plugins', 'skills', 'tools', 'subagents'].includes(resource)) item = await marketplaceDetail(
          ctx.setVars({resource, name: item.id, roomWUrl: repositoryRoomWUrl, marketplaceBaseUrl: marketplaceUrl}))
        if (['plugins', 'subagents'].includes(resource)) return setWorkspace({resource, item: {...item, originalId: item.id}}), setView('workspace')
        if (resource == 'skills') item = await skillDraft(item)
        setEditors([{resource, item: {...item, originalId: item.id}, createLabel: config.resources[resource]?.create}])
      }
      const createItem = resource => ['plugins', 'subagents'].includes(resource)
        ? (setWorkspace({resource, item: blank(resource)}), setView('workspace'))
        : setEditors([{resource, item: blank(resource), createLabel: config.resources[resource]?.create}])
      const saveWorkspace = async item => {
        const saved = await saveItem(workspace.resource, {...item, originalId: workspace.item.originalId})
        setWorkspace({...workspace, item: {...saved, originalId: saved.id}}); flash('נשמר אוטומטית'); return saved
      }
      const deleteWorkspace = async () => {
        if (repo.marketplace) await marketplaceCall(ctx.setVars({operation: 'delete', resource: workspace.resource,
          name: workspace.item.originalId || workspace.item.id, roomWUrl: repositoryRoomWUrl, marketplaceBaseUrl: marketplaceUrl}))
        await persistRepo({...repo, [workspace.resource]: repo[workspace.resource].filter(item => item.id != workspace.item.id)})
        openView(workspace.resource)
      }
      const openWorkspaceEditor = async (resource, item) => {
        if (!item) return
        if (repo.marketplace) item = await marketplaceDetail(ctx.setVars({resource, name: item.id, roomWUrl: repositoryRoomWUrl, marketplaceBaseUrl: marketplaceUrl}))
        const draft = resource == 'skills' ? await skillDraft(item) : item
        setEditors(current => [...current, {resource, item: {...draft, originalId: item.id}, createLabel: config.resources[resource]?.create}])
      }
      const openWorkspacePicker = (field, resource, label, selected, attach) => setPicker({source: 'workspace', field, resource, label,
        single: config.resources[resource].label, selected, attach,
        draftOnly: repo.marketplace && workspace.resource == 'subagents' && !workspace.item.originalId, query: ''})
      const openEditorPicker = (field, resource, label) => setPicker({source: 'editor', editorIndex: editors.length - 1,
        field, resource, label, single: config.resources[resource].label, selected: editors.at(-1).item[field] || [], query: ''})
      const attachSelected = async () => {
        if (picker.source == 'workspace') await picker.attach(picker.selected)
        else setEditors(editors.map((entry, index) => index == picker.editorIndex
          ? {...entry, item: {...entry.item, [picker.field]: picker.selected}} : entry))
        setPicker()
      }
      const createNested = resource => {
        const attachTo = picker
        setPicker(); setEditors([...editors, {resource, item: blank(resource), attachTo,
          createLabel: resource == 'tools' ? 'כלי חדש ממארז Flow' : config.resources[resource].create}])
      }
      const publishEditedSkill = async (skill, persist = true) => {
        await publishSkill(ctx.setVars({roomWUrl: repositoryRoomWUrl, skill}))
        const skills = await listSkills(ctx.setVars({roomWUrl: repositoryRoomWUrl})), nextRepo = {...repo, skills}
        if (persist) await persistRepo(nextRepo)
        return {repo: nextRepo, saved: skills.find(item => item.id == skill.id)}
      }
      const saveEditor = async () => {
        const active = editors.at(-1), rest = editors.slice(0, -1)
        if (active.attachTo?.source == 'workspace') {
          const childItem = repo.marketplace ? await saveRemote(active.resource, active.item) : active.item
          const child = active.resource == 'skills' && !repo.marketplace ? await publishEditedSkill(childItem, false)
            : upsert(ctx.setVars({repo, resource: active.resource, item: childItem})), field = active.attachTo.field
          if (active.attachTo.draftOnly) {
            await persistRepo(child.repo); active.attachTo.attach([...new Set([...active.attachTo.selected, child.saved.id])]); return setEditors(rest)
          }
          let parent = upsert(ctx.setVars({repo: child.repo, resource: workspace.resource, item: {...workspace.item,
            originalId: workspace.item.originalId,
            [field]: [...new Set([...(workspace.item[field] || []), child.saved.id])]}}))
          if (repo.marketplace) parent = upsert(ctx.setVars({repo: child.repo, resource: workspace.resource,
            item: await saveRemote(workspace.resource, {...parent.saved, originalId: workspace.item.originalId})}))
          await persistRepo(parent.repo); setWorkspace({...workspace, item: {...parent.saved, originalId: parent.saved.id}}); setEditors(rest)
        } else {
          const skillResult = active.resource == 'skills' && !repo.marketplace && await publishEditedSkill(active.item)
          const saved = skillResult ? skillResult.saved : await saveItem(active.resource, active.item)
          if (active.attachTo?.source == 'editor') setEditors(rest.map((entry, index) => index == active.attachTo.editorIndex
            ? {...entry, item: {...entry.item, [active.attachTo.field]: [...new Set([...(entry.item[active.attachTo.field] || []), saved.id])]}} : entry))
          else if (['plugins', 'subagents'].includes(active.resource)) {
            setEditors([]); setWorkspace({resource: active.resource, item: {...saved, originalId: saved.id}}); setView('workspace')
          } else {
            setEditors([]); setView(active.resource); flash('נשמר בקטלוג המשותף')
          }
        }
      }
      const deleteEditor = async () => {
        const active = editors.at(-1)
        if (repo.marketplace) await marketplaceCall(ctx.setVars({operation: 'delete', resource: active.resource,
          name: active.item.originalId, roomWUrl: repositoryRoomWUrl, marketplaceBaseUrl: marketplaceUrl}))
        await persistRepo({...repo, [active.resource]: repo[active.resource].filter(item => item.id != active.item.originalId)})
        setEditors(editors.slice(0, -1))
      }
      const runTarget = (text, target, sessionId = `${target.id}-${Date.now()}`) => runAgent(ctx.setVars({text, target, sessionId,
        roomWUrl: repositoryRoomWUrl, agentOsBaseUrl: agentUrl, agentOsToken: token, repo}))
      const runEval = async (evaluation, targetResource, target) => {
        const startedAt = Date.now(), id = `eval-${startedAt}`, started = new Date(startedAt).toLocaleString('he-IL', {
          dateStyle: 'short', timeStyle: 'short'}), pending = {id, evaluationId: evaluation.id, targetResource, targetId: target.id,
          started, startedAt, status: 'מריץ…', completed: 0, total: evaluation.rows.length, rows: []}
        const pendingRepo = await persistRepo({...repo, evalRuns: [pending, ...repo.evalRuns]})
        const semanticTrace = dsls.common.data.wonderPlatformTrace.$runWithCtx(ctx, {repo, target})
        const rows = await Promise.all(evaluation.rows.map(async row => {
          try {
            const result = await runTarget(row.input, target)
            return {...row, actual: result.text, reportIds: result.reportIds, runId: result.runId, opikUrl: result.opikUrl,
              trace: [...semanticTrace, ...(result.runtimeSteps || [])]}
          } catch (error) { return {...row, actual: String(error.message || error), error: true, trace: semanticTrace} }
        }))
        const result = {...pending, status: rows.some(row => row.error) ? 'נכשל' : 'הושלם', completed: rows.filter(row => !row.error).length, rows}
        await persistRepo({...pendingRepo, evalRuns: pendingRepo.evalRuns.map(run => run.id == id ? result : run)}); return result
      }
      const conversation = repo?.conversations.find(item => item.id == conversationId) || repo?.conversations[0]
      const updateConversation = async updated => persistRepo({...repo,
        conversations: repo.conversations.map(item => item.id == updated.id ? updated : item)})
      const newConversation = async (agentId = '') => {
        const created = {id: `c-${Date.now()}`, title: 'שיחה חדשה', agentId, when: 'עכשיו', messages: []}
        await persistRepo({...repo, conversations: [created, ...repo.conversations]}); setConversationId(created.id); setMessage('')
      }
      const selectAgent = agentId => conversation.messages.length ? newConversation(agentId) : updateConversation({...conversation, agentId})
      const send = async () => {
        const text = message.trim(), agent = repo.subagents.find(item => item.id == conversation?.agentId)
        if (!text || !agent || busy) return
        setMessage(''); setBusy(true)
        const pending = {...conversation, title: conversation.messages.length ? conversation.title : text.slice(0, 42), when: 'עכשיו',
          messages: [...conversation.messages, {id: `m-${Date.now()}`, role: 'user', text}]}
        await updateConversation(pending)
        try {
          const result = await runTarget(text, agent, conversation.id)
          const reportIds = (result.reportIds || []).filter(id => repo.reports.some(report => report.id == id))
          const steps = [...dsls.common.data.wonderPlatformTrace.$runWithCtx(ctx, {repo, target: agent}), ...(result.runtimeSteps || [])]
          await updateConversation({...pending, messages: [...pending.messages, {...result, id: `m-${Date.now() + 1}`, role: 'agent',
            text: result.text || result.output, reportIds, steps}]})
        } catch (error) {
          await updateConversation({...pending, messages: [...pending.messages, {id: `m-${Date.now() + 1}`, role: 'agent',
            text: String(error.message || error), status: 'נכשל', steps: []}]})
        } finally { setBusy(false) }
      }
      const runSet = async (evaluation, target) => {
        setRunningSet(evaluation.id); await runEval(evaluation, repo.plugins.some(item => item.id == target.id) ? 'plugins' : 'subagents', target)
        setRunningSet('')
      }
      if (loadError) return h('div:grid min-h-screen place-items-center p-6 text-center', {}, h('div', {}, h(
        'L:CircleAlert', {size: 30, className: 'mx-auto mb-3 text-red-600'}), h('b:block', {}, 'המרקטפלייס אינו זמין'),
      h('p:mt-2 max-w-lg text-sm text-[#68706c]', {}, String(loadError.message || loadError))))
      if (!repo) return h('div:grid min-h-screen place-items-center', {}, h('L:Loader2', {size: 24, className: 'animate-spin'}))
      const content = view == 'workspace' && workspace ? hh(ctx, dsls.react['react-comp'].wonderPlatformWorkspace, {workspace, repo,
        back: () => openView(workspace.resource), saveWorkspace, deleteWorkspace, openPicker: openWorkspacePicker,
        openEditor: openWorkspaceEditor, runTarget, runEval}) : view == 'chat' ? hh(ctx, dsls.react['react-comp'].wonderPlatformChat, {
        repo, conversation, message, setMessage, busy, send, selectAgent, newConversation, setConversation: setConversationId})
        : view == 'evaluations' ? hh(ctx, dsls.react['react-comp'].wonderPlatformEvaluation, {repo, search, setSearch,
          openSet: item => setEditors([{resource: 'evaluations', item: {...item, originalId: item.id}}]),
          createSet: () => setEditors([{resource: 'evaluations', item: blank('evaluations'), createLabel: 'סט חדש'}]), runningSet, runSet})
          : view == 'report' ? hh(ctx, dsls.react['react-comp'].wonderPlatformReport, {report, back: () => openView('reports')})
            : hh(ctx, dsls.react['react-comp'].wonderPlatformCatalog, {view, repo, search, setSearch, openItem, createItem})
      return h('div:min-h-screen overflow-x-hidden bg-[#f7f8f6] text-[#202724]', {dir: 'rtl', lang: 'he', style: {
        fontFamily: 'Arial, system-ui, sans-serif', backgroundImage: 'radial-gradient(#dfe4e1 0.7px, transparent 0.7px)',
        backgroundSize: '18px 18px'}}, hh(ctx, dsls.react['react-comp'].wonderPlatformNavigation, {
        view: view == 'workspace' ? workspace?.resource : view, openView}), content, editors.length > 0 && hh(ctx,
        dsls.react['react-comp'].wonderPlatformResourceEditor, {editors, setEditors, repo, saveEditor, deleteEditor, openPicker: openEditorPicker}),
      picker && hh(ctx, dsls.react['react-comp'].wonderPlatformAttachPicker, {picker, repo, setPicker, attachSelected, createNested}),
      notice && h('div:fixed bottom-5 left-5 z-[100] rounded-xl border border-[#c8ded0] bg-[#edf6f0] px-4 py-2 text-sm text-[#315e46]', {}, notice))
    }
  })
})
