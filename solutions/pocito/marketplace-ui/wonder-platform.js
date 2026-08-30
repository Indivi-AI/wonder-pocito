import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-marketplace-api.js'
import './wonder-platform-repository.js'
import './wonder-platform-views.js'
import './wonder-platform-resource-page.js'
import './wonder-platform-home.js'
import './evaluation-page.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls
const { wonderPlatformRunAgent, wonderPlatformRunAdhoc, wonderPlatformListSkills, wonderPlatformLoadSkill, wonderPlatformMarketplaceCall,
  wonderPlatformFlapiPackage, wonderPlatformMarketplaceDetail, wonderPlatformMarketplaceManifest, wonderPlatformMarketplaceRepository,
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
    {id: 'loadPackage', dynamic: true, defaultValue: wonderPlatformFlapiPackage('%$packageId%')},
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
    })},
    {id: 'runAdhoc', dynamic: true, defaultValue: wonderPlatformRunAdhoc('%$text%', '%$conversation%', {
      sessionId: '%$sessionId%',
      roomWUrl: '%$roomWUrl%',
      baseUrl: '%$agentOsBaseUrl%',
      token: '%$agentOsToken%'
    })}
  ],
  impl: comp({
    hFunc: (ctx, {react: {h, hh, useEffect, useState, useRef}},
      {roomWUrl, marketplaceBaseUrl, agentOsBaseUrl, agentOsToken, defaultView, brand, brandTagline, brandIcon, extraPrimaryNav,
        extraLibraryNav, loadRepo, saveRepo, loadPackage, upsert, loadSkill, listSkills, publishSkill,
        marketplaceCall, marketplaceDetail, manifest, runAgent, runAdhoc}) => () => {
      const repositoryRoomWUrl = ctx.vars.roomWUrl || roomWUrl, marketplaceUrl = ctx.vars.marketplaceBaseUrl || marketplaceBaseUrl
      const agentUrl = ctx.vars.agentOsBaseUrl || agentOsBaseUrl, token = ctx.vars.agentOsToken || agentOsToken
      const config = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx), [view, setView] = useState(defaultView)
      const [repo, setRepo] = useState(), [loadError, setLoadError] = useState(), [search, setSearch] = useState('')
      const [stack, setStack] = useState([]), stackRef = useRef([])
      const [picker, setPicker] = useState(), [pendingLeave, setPendingLeave] = useState(), [saving, setSaving] = useState(false)
      stackRef.current = stack
      const top = stack.at(-1)
      const frame = (resource, item, extra = {}) => ({resource, item, baseline: JSON.stringify(item), ...extra})
      const pushFrame = entry => setStack(current => [...current, entry])
      const popFrame = () => setStack(current => current.slice(0, -1))
      const updateTop = value => setStack(current => current.map((entry, index) => index == current.length - 1
        ? {...entry, item: typeof value == 'function' ? value(entry.item) : value} : entry))
      const stackDirty = () => stackRef.current.some(entry => JSON.stringify(entry.item) != entry.baseline)
      const [conversationId, setConversationId] = useState('c1'), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
      const [model, setModel] = useState(globalThis.LLM_MODEL || '')   // '' = the deployment default (wonderPlatformModel chain)
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
      const navigate = id => (setView(id), setSearch(''))
      const requestLeave = action => stackDirty() ? setPendingLeave(() => action) : action()
      const openView = id => requestLeave(() => (setStack([]), navigate(id)))
      const openItem = async (resource, item) => {
        if (repo.marketplace && marketResources.includes(resource)) item = await marketplaceDetail(
          ctx.setVars({resource, id: item.id, roomWUrl: repositoryRoomWUrl, marketplaceBaseUrl: marketplaceUrl}))
        if (resource == 'skills') item = await skillDraft(item)
        setStack([frame(resource, {...item, originalId: item.id}, {createLabel: config.resources[resource]?.create})])
        setView('journey')
      }
      const createItem = resource => (setStack([frame(resource, blank(resource),
        {createLabel: config.resources[resource]?.create})]), setView('journey'))
      const openPicker = (field, resource, label) => setPicker({frameIndex: stack.length - 1, field, resource, label,
        single: config.resources[resource].label, selected: top.item[field] || [], query: ''})
      const attachSelected = async () => {
        setStack(current => current.map((entry, index) => index == picker.frameIndex
          ? {...entry, item: {...entry.item, [picker.field]: picker.selected}} : entry))
        setPicker()
      }
      const createNested = resource => {
        const attachTo = {frameIndex: picker.frameIndex, field: picker.field}
        setPicker(); pushFrame(frame(resource, blank(resource), {attachTo,
          createLabel: resource == 'tools' ? 'כלי חדש ממארז Flow' : config.resources[resource].create}))
      }
      const openEditor = async (resource, item, field) => {
        if (!item) return
        if (repo.marketplace && marketResources.includes(resource)) item = await marketplaceDetail(ctx.setVars({resource, id: item.id, roomWUrl: repositoryRoomWUrl,
          marketplaceBaseUrl: marketplaceUrl}))
        const draft = resource == 'skills' ? await skillDraft(item) : item
        pushFrame(frame(resource, {...draft, originalId: item.id},
          {attachTo: {frameIndex: stack.length - 1, field}, createLabel: config.resources[resource]?.create}))
      }
      const publishEditedSkill = async skill => {
        await publishSkill(ctx.setVars({roomWUrl: repositoryRoomWUrl, skill}))
        const skills = await listSkills(ctx.setVars({roomWUrl: repositoryRoomWUrl})), nextRepo = {...repo, skills}
        await persistRepo(nextRepo)
        return {repo: nextRepo, saved: skills.find(item => item.id == skill.id)}
      }
      const saveTop = async override => {
        const active = {...stack.at(-1), item: override || stack.at(-1).item}, rest = stack.slice(0, -1)
        const skillResult = active.resource == 'skills' && !repo.marketplace && await publishEditedSkill(active.item)
        const saved = skillResult ? skillResult.saved : await saveItem(active.resource, active.item)
        if (!active.attachTo) {
          const savedFrame = frame(active.resource, {...saved, originalId: saved.id}, {createLabel: active.createLabel})
          if (['plugins', 'subagents', 'agents'].includes(active.resource)) { setStack([savedFrame]); flash('נשמר') }
          else if (active.resource == 'evaluations') { setStack([savedFrame]); flash('נשמר בקטלוג המשותף') }
          else { setStack([]); setView(active.resource); flash('נשמר בקטלוג המשותף') }
          return saved
        }
        setStack(rest.map((entry, index) => index == active.attachTo.frameIndex
          ? {...entry, item: {...entry.item, [active.attachTo.field]:
            [...new Set([...(entry.item[active.attachTo.field] || []), saved.id])]}} : entry))
        return saved
      }
      const deleteTop = async () => {
        const active = stack.at(-1)
        if (repo.marketplace && marketResources.includes(active.resource)) await marketplaceCall(ctx.setVars({
          operation: 'delete', resource: active.resource, id: active.item.originalId || active.item.id,
          roomWUrl: repositoryRoomWUrl, marketplaceBaseUrl: marketplaceUrl}))
        await persistRepo({...repo, [active.resource]: repo[active.resource].filter(
          item => item.id != (active.item.originalId || active.item.id))})
        stack.length > 1 ? popFrame() : openView(active.resource)
      }
      const saveAndLeave = async () => { const action = pendingLeave; setSaving(true)
        try { await saveTop() } catch (error) { setSaving(false); return }
        setSaving(false); setPendingLeave(); action() }
      const runTarget = (text, target, sessionId = `${target.id}-${Date.now()}`) => runAgent(ctx.setVars({text, target, sessionId,
        roomWUrl: repositoryRoomWUrl, agentOsBaseUrl: agentUrl, agentOsToken: token, ...(model && {selectedModel: model})}))
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
        const agent = repo.agents.find(item => item.id == agentId)
        const title = agent ? `שיחה · ${agent.name}` : 'שיחה חופשית'
        const created = {id: `c-${Date.now()}`, title, agentId, when: 'עכשיו', messages: [],
          pluginIds: [], skillIds: [], toolIds: [], knowledgeIds: []}
        await persistRepo({...repo, conversations: [created, ...repo.conversations]})
        setConversationId(created.id); setMessage(''); openView('chat')
      }
      const selectAgent = agentId => conversation.messages.length ? newConversation(agentId) : updateConversation({...conversation, agentId})
      const setContext = (field, value) => updateConversation({...conversation, [field]: value})
      const send = async () => {
        const text = message.trim(), agent = repo.agents.find(item => item.id == conversation?.agentId)
        if (!text || busy) return
        setMessage(''); setBusy(true)
        const pending = {...conversation, title: conversation.messages.length ? conversation.title : text.slice(0, 42), when: 'עכשיו',
          messages: [...conversation.messages, {id: `m-${Date.now()}`, role: 'user', text}]}
        await updateConversation(pending)
        try {
          const result = agent ? await runTarget(text, agent, conversation.id) : await runAdhoc(ctx.setVars({text, conversation,
            sessionId: conversation.id, roomWUrl: repositoryRoomWUrl, agentOsBaseUrl: agentUrl, agentOsToken: token}))
          const steps = [...dsls.common.data.wonderPlatformTrace.$runWithCtx(ctx, {repo, target: agent || conversation}), ...(result.runtimeSteps || [])]
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
        setStack([frame('evaluations', {...result.saved, originalId: result.saved.id}, {createLabel: top.createLabel})]); flash('נשמר')
        setRunningSet(result.saved.id); await runEval(result.saved, 'agents', target, next); setRunningSet('')
      }
      const shell = body => h('div:wp-app grid min-h-screen place-items-center bg-[var(--wp-canvas)] p-6', {dir: 'rtl', lang: 'he'},
        h('style', {}, dsls.common.data.wonderPlatformCss.$run()), body)
      if (loadError) return shell(h(`div:${config.classes.panel} max-w-md p-8 text-center`, {},
        h('span:mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full bg-[var(--wp-danger-soft)] text-[var(--wp-danger)]',
          {}, h('L:CircleAlert', {size: 20})),
        h(`h1:${config.classes.h2}`, {}, 'הקטלוג אינו זמין'),
        h(`p:mt-2 ${config.classes.body}`, {}, 'לא הצלחנו לטעון את הקטלוג. בדקו את החיבור ונסו שוב.'),
        h('p:mt-3 truncate text-[12px] text-[var(--wp-ink-4)]', {dir: 'ltr', title: String(loadError.message || loadError)},
          String(loadError.message || loadError)),
        h(`button:${config.classes.primary} mt-5`, {onClick: () => location.reload()}, 'טעינה מחדש')))
      if (!repo) return h('div:wp-app min-h-screen bg-[var(--wp-canvas)]', {dir: 'rtl', lang: 'he'},
        h('style', {}, dsls.common.data.wonderPlatformCss.$run()),
        h('div:mx-auto flex w-full max-w-[1720px]', {}, hh(ctx, dsls.react['react-comp'].wonderPlatformAppSkeleton, {})))
      const content = view == 'home' ? hh(ctx, dsls.react['react-comp'].wonderPlatformHome, {repo,
        createAgent: () => createItem('agents'), startChat: () => newConversation(),
        openItem, openConversation: id => (setConversationId(id), openView('chat'))})
        : view == 'journey' && top ? (['plugins', 'subagents', 'agents'].includes(top.resource)
          ? hh(ctx, dsls.react['react-comp'].wonderPlatformWorkspace, {workspace: top, repo, update: updateTop,
            back: () => stack.length > 1 ? popFrame() : openView(top.resource), saveWorkspace: saveTop,
            deleteWorkspace: deleteTop, openPicker, openEditor, runTarget, runEval})
          : hh(ctx, dsls.react['react-comp'].wonderPlatformResourcePage, {active: top, update: updateTop,
            save: () => saveTop(), deleteItem: deleteTop, back: () => stack.length > 1 ? popFrame() : openView(top.resource),
            repo, openPicker, loadPackage, saveAndRun, runningSet}))
          : view == 'chat' ? hh(ctx, dsls.react['react-comp'].wonderPlatformChat, {
            repo, conversation, message, setMessage, busy, send, selectAgent, setContext, model, setModel})
            : view == 'evaluations' ? hh(ctx, dsls.react['react-comp'].EvaluationPage,
              {embedded: true, roomWUrl: repositoryRoomWUrl, marketplaceBaseUrl: marketplaceUrl,
                agentOsBaseUrl: agentUrl, agentOsToken: token, targetItems: repo.agents, openView})
                : hh(ctx, dsls.react['react-comp'].wonderPlatformCatalog,
                  {view, repo, search, setSearch, openItem, createItem, importItem})
      return h('div:wp-app min-h-screen overflow-x-clip bg-[var(--wp-canvas)] text-[var(--wp-ink)]', {dir: 'rtl', lang: 'he'},
      h('style', {}, dsls.common.data.wonderPlatformCss.$run()),
      h('div:mx-auto flex w-full max-w-[1720px]', {}, hh(ctx, dsls.react['react-comp'].wonderPlatformNavigation, {
        view: view == 'journey' ? top?.resource : view, openView, brand, brandTagline, brandIcon, extraLibraryNav,
        conversations: repo.conversations, conversationId, newConversation, createAgent: () => createItem('agents'),
        openConversation: id => (setConversationId(id), openView('chat'))}), content),
      picker && hh(ctx, dsls.react['react-comp'].wonderPlatformAttachPicker, {picker, repo, setPicker, attachSelected, createNested}),
      pendingLeave && hh(ctx, dsls.react['react-comp'].wonderPlatformDialog, {title: 'שינויים שלא נשמרו',
        body: 'ערכתם פריט שעדיין לא נשמר. מה תרצו לעשות?', close: () => setPendingLeave(), busy: saving,
        actions: [['שמירה ועזיבה', saveAndLeave, true], ['עזיבה בלי שמירה', () => (setPendingLeave(), pendingLeave())]]}),
      notice && h('div:fixed bottom-5 left-5 z-[100] flex items-center gap-2 rounded-[8px] bg-[var(--wp-ink)] px-3.5 py-2 ' +
        'text-[13px] font-medium text-white shadow-[var(--wp-sh-2)]', {}, h('L:Check', {size: 14}), notice))
    }
  })
})
