import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-marketplace-api.js'
import './wonder-platform-repository.js'
import './wonder-platform-views.js'
import './wonder-platform-resource-page.js'
import './evaluation-page.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls
const { wonderPlatformRunAgent, wonderPlatformListSkills, wonderPlatformLoadSkill, wonderPlatformMarketplaceCall,
  wonderPlatformMarketplaceDetail, wonderPlatformMarketplaceManifest, wonderPlatformMarketplaceRepository,
  wonderPlatformPublishSkill, wonderPlatformSaveRepository, wonderPlatformUpsert } = dsls.common.data

ReactComp('wonderPlatform', {
  params: [
    {id: 'roomWUrl', as: 'string', defaultValue: 'room://wonder-platform'},
    {id: 'marketplaceBaseUrl', as: 'string'},
    {id: 'agentOsBaseUrl', as: 'string'},
    {id: 'agentOsToken', as: 'string'},
    {id: 'defaultView', as: 'string', defaultValue: 'plugins'},
    {id: 'brand', as: 'string'}, {id: 'brandTagline', as: 'string'}, {id: 'brandIcon', as: 'string'},
    {id: 'extraPrimaryNav', as: 'array'}, {id: 'extraLibraryNav', as: 'array'},
    {id: 'loadRepo', dynamic: true, defaultValue: wonderPlatformMarketplaceRepository('%$roomWUrl%', '%$marketplaceBaseUrl%')},
    {id: 'saveRepo', dynamic: true, defaultValue: wonderPlatformSaveRepository('%$roomWUrl%', '%$repo%')},
    {id: 'upsert', dynamic: true, defaultValue: wonderPlatformUpsert('%$repo%', '%$resource%', { item: '%$item%' })},
    {id: 'loadSkill', dynamic: true, defaultValue: wonderPlatformLoadSkill('%$docletWUrl%')},
    {id: 'listSkills', dynamic: true, defaultValue: wonderPlatformListSkills('%$roomWUrl%')},
    {id: 'publishSkill', dynamic: true, defaultValue: wonderPlatformPublishSkill('%$roomWUrl%', '%$skill%')},
    {id: 'marketplaceCall', dynamic: true, defaultValue: wonderPlatformMarketplaceCall('%$operation%', '%$resource%', {
      id: '%$id%',
      contentId: '%$contentId%',
      body: '%$body%',
      roomWUrl: '%$roomWUrl%',
      baseUrl: '%$marketplaceBaseUrl%'
    })},
    {id: 'marketplaceDetail', dynamic: true, defaultValue: wonderPlatformMarketplaceDetail('%$resource%', '%$id%', {
      roomWUrl: '%$roomWUrl%',
      baseUrl: '%$marketplaceBaseUrl%'
    })},
    {id: 'manifest', dynamic: true, defaultValue: wonderPlatformMarketplaceManifest('%$resource%', '%$item%', { operation: '%$operation%' })},
    {id: 'runAgent', dynamic: true, defaultValue: wonderPlatformRunAgent('%$text%', '%$target%', {
      sessionId: '%$sessionId%',
      roomWUrl: '%$roomWUrl%',
      baseUrl: '%$agentOsBaseUrl%',
      token: '%$agentOsToken%'
    })}
  ],
  impl: comp({
    hFunc: (ctx, {react: {h, hh, useEffect, useState, useRef}},
      {roomWUrl, marketplaceBaseUrl, agentOsBaseUrl, agentOsToken, defaultView, brand, brandTagline, brandIcon, extraPrimaryNav,
        extraLibraryNav, loadRepo, saveRepo, upsert, loadSkill, listSkills, publishSkill,
        marketplaceCall, marketplaceDetail, manifest, runAgent}) => () => {
      const repositoryRoomWUrl = ctx.vars.roomWUrl || roomWUrl, marketplaceUrl = ctx.vars.marketplaceBaseUrl || marketplaceBaseUrl
      const agentUrl = ctx.vars.agentOsBaseUrl || agentOsBaseUrl, token = ctx.vars.agentOsToken || agentOsToken
      const config = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx), [view, setView] = useState(defaultView)
      const [repo, setRepo] = useState(), [loadError, setLoadError] = useState(), [search, setSearch] = useState('')
      const [workspace, setWorkspace] = useState(), [workspaceDirty, setWorkspaceDirty] = useState(false)
      const [editors, setEditors] = useState([]), [picker, setPicker] = useState(), [pendingLeave, setPendingLeave] = useState(), [saving, setSaving] = useState(false)
      const editorsRef = useRef([]), dirtyRef = useRef(false), viewRef = useRef(view)
      editorsRef.current = editors; dirtyRef.current = workspaceDirty; viewRef.current = view
      const [conversationId, setConversationId] = useState('c1'), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
      const [runningSet, setRunningSet] = useState(''), [notice, setNotice] = useState('')
      useEffect(() => { void Promise.resolve(loadRepo(ctx.setVars({roomWUrl: repositoryRoomWUrl, marketplaceBaseUrl: marketplaceUrl}))).then(setRepo, setLoadError) }, [])
      const flash = text => (setNotice(text), setTimeout(() => setNotice(''), 1800))
      const marketResources = ['plugins', 'skills', 'tools', 'subagents', 'agents', 'knowledge']
      const importItem = (resource, item) => persistRepo({...repo, [resource]: repo[resource].map(value =>
        value.id == item.id ? {...value, owner: 'imported'} : value)})
      const persistRepo = async next => (setRepo(next), next.marketplace || await saveRepo(
        ctx.setVars({repo: next, roomWUrl: repositoryRoomWUrl})), next)
      const blank = resource => ({id: resource == 'evaluations' ? `eval-${Date.now()}` : '', name: '', desc: '', instructions: '', owner: 'me',
        version: resource == 'skills' ? '1.0.0' : 'V0', publishVersion: resource == 'skills' ? '1.0.0' : undefined, content: '',
        created: 'היום', updated: 'עכשיו', skillIds: [], toolIds: [], subagentIds: [], knowledgeIds: [], evaluationId: '',
        rows: resource == 'evaluations' ? [{input: '', expected: '', notes: ''}] : [], rubric: '',
        kind: resource == 'tools' ? 'flow' : undefined, managed: false, tags: [], readme: '',
        backendConfig: {harness: 'agno', harness_type: 'deepagents'},
        pluginIds: [], assets: [], toolType: resource == 'tools' ? 'flow_package' : undefined, packageId: '', inputSchema: [], outputCubes: [],
        fileCount: 0, syncStatus: 'טיוטה מקומית'})
      const saveRemote = async (resource, item) => {
        const operation = item.originalId ? 'update' : 'create', body = manifest(ctx.setVars({resource, item, operation}))
        const response = await marketplaceCall(ctx.setVars({operation, resource, id: item.originalId, body,
          roomWUrl: repositoryRoomWUrl, marketplaceBaseUrl: marketplaceUrl}))
        if (resource == 'knowledge') {
          await Promise.all([...(item.deletedContentIds || []).map(contentId => marketplaceCall(ctx.setVars({operation: 'deleteContent', resource,
            id: response.id, contentId, roomWUrl: repositoryRoomWUrl, marketplaceBaseUrl: marketplaceUrl}))),
          ...(item.files || []).filter(content => content.file).map(content => {
            const upload = new FormData(); upload.append('file', content.file)
            return marketplaceCall(ctx.setVars({operation: 'uploadContent', resource, id: response.id, body: upload,
              roomWUrl: repositoryRoomWUrl, marketplaceBaseUrl: marketplaceUrl}))
          })])
          return {...await marketplaceDetail(ctx.setVars({resource, id: response.id, roomWUrl: repositoryRoomWUrl,
            marketplaceBaseUrl: marketplaceUrl})), originalId: item.originalId}
        }
        return {...dsls.common.data.wonderPlatformMarketplaceItem.$runWithCtx(ctx, {resource, item: {...body, ...response}}),
          originalId: item.originalId}
      }
      const saveItem = async (resource, item) => {
        if (repo.marketplace && marketResources.includes(resource)) item = await saveRemote(resource, item)
        const result = upsert(ctx.setVars({repo, resource, item}))
        await persistRepo(result.repo); return result.saved
      }
      const skillDraft = async item => {
        if (repo.marketplace) return item
        const loaded = await loadSkill(ctx.setVars({roomWUrl: repositoryRoomWUrl, docletWUrl: `${item.docletUrl}?v=${item.version}`}))
        return {...item, content: loaded?.content || '', publishVersion: dsls.common.data.wonderPlatformNextVersion.$run(item.version)}
      }
      const navigate = id => (setView(id), setWorkspace(), setSearch(''))
      const editorEntry = (resource, item, extra = {}) => ({resource, item, baseline: JSON.stringify(item), ...extra})
      const dirty = entry => JSON.stringify(entry.item) != entry.baseline
      const requestLeave = action => { const active = editorsRef.current.at(-1); (active && dirty(active)) || (viewRef.current == 'workspace' && dirtyRef.current) ? setPendingLeave(action) : action() }
      const openView = id => requestLeave(() => (setEditors([]), navigate(id)))
      const openItem = async (resource, item) => {
        if (repo.marketplace && marketResources.includes(resource)) item = await marketplaceDetail(
          ctx.setVars({resource, id: item.id, roomWUrl: repositoryRoomWUrl, marketplaceBaseUrl: marketplaceUrl}))
        if (['plugins', 'subagents', 'agents'].includes(resource)) return setWorkspace({resource, item: {...item, originalId: item.id}}), setView('workspace')
        if (resource == 'skills') item = await skillDraft(item)
        setEditors([editorEntry(resource, {...item, originalId: item.id}, {createLabel: config.resources[resource]?.create, standalone: true})])
      }
      const createItem = resource => ['plugins', 'subagents', 'agents'].includes(resource)
        ? (setWorkspace({resource, item: blank(resource)}), setView('workspace'))
        : setEditors([editorEntry(resource, blank(resource), {createLabel: config.resources[resource]?.create, standalone: true})])
      const saveWorkspace = async item => {
        const saved = await saveItem(workspace.resource, item)
        setWorkspace({...workspace, item: {...saved, originalId: saved.id}}); flash('נשמר'); return saved
      }
      const deleteWorkspace = async () => {
        if (repo.marketplace && marketResources.includes(workspace.resource)) await marketplaceCall(ctx.setVars({
          operation: 'delete', resource: workspace.resource,
          id: workspace.item.originalId || workspace.item.id, roomWUrl: repositoryRoomWUrl, marketplaceBaseUrl: marketplaceUrl}))
        await persistRepo({...repo, [workspace.resource]: repo[workspace.resource].filter(item => item.id != workspace.item.id)})
        openView(workspace.resource)
      }
      const openWorkspaceEditor = async (resource, item) => {
        if (!item) return
        if (repo.marketplace && marketResources.includes(resource)) item = await marketplaceDetail(ctx.setVars({resource, id: item.id, roomWUrl: repositoryRoomWUrl,
          marketplaceBaseUrl: marketplaceUrl}))
        const draft = resource == 'skills' ? await skillDraft(item) : item
        setEditors(current => [...current, editorEntry(resource, {...draft, originalId: item.id},
          {createLabel: config.resources[resource]?.create, returnToWorkspace: true})])
      }
      const openWorkspacePicker = (field, resource, label, selected, attach) => setPicker({source: 'workspace', field, resource, label,
        single: config.resources[resource].label, selected, attach, query: ''})
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
        setPicker(); setEditors([...editors, editorEntry(resource, blank(resource), {attachTo,
          createLabel: resource == 'tools' ? 'כלי חדש ממארז Flow' : config.resources[resource].create})])
      }
      const publishEditedSkill = async skill => {
        await publishSkill(ctx.setVars({roomWUrl: repositoryRoomWUrl, skill}))
        const skills = await listSkills(ctx.setVars({roomWUrl: repositoryRoomWUrl})), nextRepo = {...repo, skills}
        await persistRepo(nextRepo)
        return {repo: nextRepo, saved: skills.find(item => item.id == skill.id)}
      }
      const saveEditor = async () => {
        const active = editors.at(-1), rest = editors.slice(0, -1)
        if (active.attachTo?.source == 'workspace') {
          const child = active.resource == 'skills' && !repo.marketplace ? (await publishEditedSkill(active.item)).saved
            : await saveItem(active.resource, active.item)
          active.attachTo.attach([...new Set([...active.attachTo.selected, child.id])]); setEditors(rest)
        } else {
          const skillResult = active.resource == 'skills' && !repo.marketplace && await publishEditedSkill(active.item)
          const saved = skillResult ? skillResult.saved : await saveItem(active.resource, active.item)
          if (active.attachTo?.source == 'editor') setEditors(rest.map((entry, index) => index == active.attachTo.editorIndex
            ? {...entry, item: {...entry.item, [active.attachTo.field]: [...new Set([...(entry.item[active.attachTo.field] || []), saved.id])]}} : entry))
          else if (active.returnToWorkspace) setEditors([])
          else if (['plugins', 'subagents', 'agents'].includes(active.resource)) {
            setEditors([]); setWorkspace({resource: active.resource, item: {...saved, originalId: saved.id}}); setView('workspace')
          } else {
            setEditors([]); setView(active.resource); flash('נשמר בקטלוג המשותף')
          }
        }
      }
      const updateBase = value => setEditors(editors.map((entry, index) => index == 0
        ? {...entry, item: typeof value == 'function' ? value(entry.item) : value} : entry))
      const saveBase = async () => {
        const {resource, item} = editors[0]
        const saved = await saveItem(resource, item)
        setEditors(resource == 'evaluations'
          ? [{...editors[0], item: {...saved, originalId: saved.id}, baseline: JSON.stringify({...saved, originalId: saved.id})}] : [])
        flash('נשמר בקטלוג המשותף'); return saved
      }
      const saveAndLeave = async () => { const action = pendingLeave; setSaving(true)
        try { await (editors.length > 1 ? saveEditor() : saveBase()) } catch (error) { setSaving(false); return }
        setSaving(false); setPendingLeave(); action() }
      const deleteBase = async () => {
        const {resource, item} = editors[0]
        if (repo.marketplace && marketResources.includes(resource)) await marketplaceCall(ctx.setVars({operation: 'delete', resource, id: item.originalId,
          roomWUrl: repositoryRoomWUrl, marketplaceBaseUrl: marketplaceUrl}))
        await persistRepo({...repo, [resource]: repo[resource].filter(value => value.id != item.originalId)})
        setEditors([])
      }
      const deleteEditor = async () => {
        const active = editors.at(-1)
        if (repo.marketplace && marketResources.includes(active.resource)) await marketplaceCall(ctx.setVars({operation: 'delete', resource: active.resource,
          id: active.item.originalId, roomWUrl: repositoryRoomWUrl, marketplaceBaseUrl: marketplaceUrl}))
        await persistRepo({...repo, [active.resource]: repo[active.resource].filter(item => item.id != active.item.originalId)})
        setEditors(editors.slice(0, -1))
      }
      const runTarget = (text, target, sessionId = `${target.id}-${Date.now()}`) => runAgent(ctx.setVars({text, target, sessionId,
        roomWUrl: repositoryRoomWUrl, agentOsBaseUrl: agentUrl, agentOsToken: token}))
      const runEval = async (evaluation, targetResource, target, runRepo = repo) => {
        const startedAt = Date.now(), id = `eval-${startedAt}`, started = new Date(startedAt).toLocaleString('he-IL', {
          dateStyle: 'short', timeStyle: 'short'}), pending = {id, evaluationId: evaluation.id, targetResource, targetId: target.id,
          started, startedAt, status: 'מריץ…', completed: 0, total: evaluation.rows.length, rows: []}
        const pendingRepo = await persistRepo({...runRepo, evalRuns: [pending, ...runRepo.evalRuns]})
        const semanticTrace = dsls.common.data.wonderPlatformTrace.$runWithCtx(ctx, {repo: runRepo, target})
        const rows = await Promise.all(evaluation.rows.map(async row => {
          try {
            const result = await runTarget(row.input, target)
            return {...row, actual: result.text, runId: result.runId, opikUrl: result.opikUrl,
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
        const created = {id: `c-${Date.now()}`, title: 'שיחה חדשה', agentId, when: 'עכשיו', messages: [],
          pluginIds: [], skillIds: [], toolIds: [], knowledgeIds: []}
        await persistRepo({...repo, conversations: [created, ...repo.conversations]})
        setConversationId(created.id); setMessage(''); openView('chat')
      }
      const selectAgent = agentId => conversation.messages.length ? newConversation(agentId) : updateConversation({...conversation, agentId})
      const setContext = (field, value) => updateConversation({...conversation, [field]: value})
      const send = async () => {
        const text = message.trim(), agent = repo.agents.find(item => item.id == conversation?.agentId)
        if (!text || busy || !agent) return
        setMessage(''); setBusy(true)
        const pending = {...conversation, title: conversation.messages.length ? conversation.title : text.slice(0, 42), when: 'עכשיו',
          messages: [...conversation.messages, {id: `m-${Date.now()}`, role: 'user', text}]}
        await updateConversation(pending)
        try {
          const result = await runTarget(text, agent, conversation.id)
          const steps = [...dsls.common.data.wonderPlatformTrace.$runWithCtx(ctx, {repo, target: agent}), ...(result.runtimeSteps || [])]
          await updateConversation({...pending, messages: [...pending.messages, {...result, id: `m-${Date.now() + 1}`, role: 'agent',
            text: result.text || result.output, steps}]})
        } catch (error) {
          await updateConversation({...pending, messages: [...pending.messages, {id: `m-${Date.now() + 1}`, role: 'agent',
            text: String(error.message || error), status: 'נכשל', steps: []}]})
        } finally { setBusy(false) }
      }
      const runSet = async (evaluation, target) => {
        const resource = ['agents', 'plugins', 'subagents'].find(name => repo[name].some(item => item.id == target.id))
        setRunningSet(evaluation.id); await runEval(evaluation, resource, target)
        setRunningSet('')
      }
      const saveAndRun = async (evaluation, target) => {
        const result = upsert(ctx.setVars({repo, resource: 'evaluations', item: evaluation})), next = await persistRepo(result.repo)
        setEditors([{...editors[0], item: {...result.saved, originalId: result.saved.id},
          baseline: JSON.stringify({...result.saved, originalId: result.saved.id})}]); flash('נשמר')
        setRunningSet(result.saved.id); await runEval(result.saved, 'agents', target, next); setRunningSet('')
      }
      if (loadError) return h('div:grid min-h-screen place-items-center p-6 text-center', {}, h('div', {}, h(
        'L:CircleAlert', {size: 30, className: 'mx-auto mb-3 text-red-600'}), h('b:block', {}, 'המרקטפלייס אינו זמין'),
      h('p:mt-2 max-w-lg text-sm text-[#2e2e2e]', {}, String(loadError.message || loadError))))
      if (!repo) return h('div:grid min-h-screen place-items-center', {}, h('L:Loader2', {size: 24, className: 'animate-spin'}))
      const content = view == 'workspace' && workspace ? hh(ctx, dsls.react['react-comp'].wonderPlatformWorkspace, {workspace, repo,
        back: () => openView(workspace.resource), saveWorkspace, deleteWorkspace, openPicker: openWorkspacePicker, setDirty: setWorkspaceDirty,
        openEditor: openWorkspaceEditor, runTarget, runEval}) : view == 'chat' ? hh(ctx, dsls.react['react-comp'].wonderPlatformChat, {
        repo, conversation, message, setMessage, busy, send, selectAgent, setContext})
        : view == 'evaluations' ? hh(ctx, dsls.react['react-comp'].EvaluationPage, {embedded: true, roomWUrl: repositoryRoomWUrl,
          marketplaceBaseUrl: marketplaceUrl, agentOsBaseUrl: agentUrl, agentOsToken: token, targetItems: repo.agents, openView})
          : editors[0]?.standalone ? hh(ctx, dsls.react['react-comp'].wonderPlatformResourcePage, {active: editors[0], update: updateBase,
              save: saveBase, deleteItem: deleteBase, back: () => requestLeave(() => setEditors([])), repo, openPicker: openEditorPicker,
              saveAndRun, runningSet})
              : hh(ctx, dsls.react['react-comp'].wonderPlatformCatalog, {view, repo, search, setSearch, openItem, createItem, importItem})
      return h('div:min-h-screen overflow-x-clip bg-white text-[#0f0f10] antialiased', {dir: 'rtl', lang: 'he', style: {
        fontFamily: '"Inter", "Assistant", system-ui, sans-serif', letterSpacing: '-0.005em'}},
      hh(ctx, dsls.react['react-comp'].wonderPlatformNavigation, {
        view: view == 'workspace' ? workspace?.resource : view, openView, brand, brandTagline, brandIcon, extraPrimaryNav, extraLibraryNav,
        conversations: repo.conversations, conversationId, newConversation,
        openConversation: id => (setConversationId(id), openView('chat'))}), content,
      editors.length > (editors[0]?.standalone ? 1 : 0) && hh(ctx,
        dsls.react['react-comp'].wonderPlatformResourceEditor, {editors, setEditors, repo, saveEditor, deleteEditor,
          openPicker: openEditorPicker, requestClose: requestLeave}),
      picker && hh(ctx, dsls.react['react-comp'].wonderPlatformAttachPicker, {picker, repo, setPicker, attachSelected, createNested}),
      pendingLeave && h('div:fixed inset-0 z-[90] grid place-items-center bg-black/25 p-4', {}, h(
        'section:w-full max-w-md rounded-2xl border border-[#e8e8ea] bg-white p-5 shadow-2xl', {}, h(
        'div:flex items-center justify-between', {}, h('b:text-base font-semibold', {}, 'שינויים שלא נשמרו'),
        h('button:rounded-lg p-1.5 hover:bg-gray-100', {onClick: () => setPendingLeave(), 'aria-label': 'סגירה'}, h('L:X'))),
        h('p:mt-2 text-sm text-[#6b6b6f]', {}, 'ערכתם פריט שעדיין לא נשמר. מה תרצו לעשות?'),
        h('div:mt-5 flex flex-wrap gap-2', {}, h(`button:${config.classes.primary}`, {onClick: saveAndLeave, disabled: saving}, 'שמירה ועזיבה'),
          h(`button:${config.classes.button}`, {onClick: () => (setPendingLeave(), pendingLeave()), disabled: saving}, 'עזיבה בלי שמירה')))),
      notice && h('div:fixed bottom-5 left-5 z-[100] rounded-xl border border-[#d8d8dc] bg-[#f4f4f5] px-4 py-2 text-sm text-[#0f0f10]', {}, notice))
    }
  })
})
