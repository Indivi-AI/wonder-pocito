import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-views.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatform', {
  params: [
    {id: 'roomWUrl', as: 'string', defaultValue: 'room:minio//wonder-platform'}
  ],
  impl: comp({
    hFunc: (ctx, {}, {roomWUrl}) => {
      const { h, hh, useEffect, useRef, useState } = ctx.vars.react
      const seed = dsls.common.data.wonderPlatformSeed.$run(), ui = dsls.common.data.wonderPlatformUi.$run()
      const roomStore = dsls.common.data.wonderPlatformRoomStore.$runWithCtx(ctx, {roomWUrl})
      return function WonderPlatform() {
        const [repo, setRepo] = useState(), [screen, setScreen] = useState('plugins'), [query, setQuery] = useState('')
        const [assetType, setAssetType] = useState(), [draftAsset, setDraftAsset] = useState()
        const [conversationId, setConversationId] = useState('c1'), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
        const [runningEvaluationId, setRunningEvaluationId] = useState(''), [notice, setNotice] = useState('')
        const chatEndRef = useRef(), fileRef = useRef()
        const flash = text => { setNotice(text); setTimeout(() => setNotice(''), 2200) }
        const persistRepo = async next => {
          setRepo(next)
          if (!(await roomStore.save(next)).ok) flash('השמירה לחדר נכשלה')
          return next
        }
        useEffect(() => { void roomStore.load(seed).then(setRepo) }, [])
        useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [repo?.conversations, busy])
        if (!repo) return h('div', { className: 'h-screen grid place-items-center' },
          h('div', { className: 'w-5 h-5 rounded-full border-2 border-[#c7e4d5] border-t-[#0e5c3f] animate-spin' }))
        const activeConversation = repo.conversations.find(x => x.id === conversationId) || repo.conversations[0]
        const activePlugin = repo.plugins.find(x => x.id === activeConversation?.pluginId)
        const updateConversation = (conversation, source = repo) => persistRepo({ ...source,
          conversations: source.conversations.map(x => x.id === conversation.id ? conversation : x) })
        const openEditor = (type, item) => {
          if (item?.managed) return
          setAssetType(type)
          setDraftAsset(item ? structuredClone(item) : { id: '', name: '', mark: '', desc: '', instructions: '', status: 'טיוטה',
            version: 'V1', pluginId: repo.plugins[0]?.id, lastRun: '—', skillIds: [], toolIds: [], subagentIds: [], rows: [],
            sourceCount: 0, verifiedAt: 'עכשיו' })
          setScreen('editor')
        }
        const saveDraft = async () => {
          const item = { ...draftAsset, id: draftAsset.id || ui.prefixes[assetType] + Date.now().toString(36),
            mark: draftAsset.mark || draftAsset.name.slice(0, 2) }
          await persistRepo({ ...repo, [assetType]: repo[assetType].some(x => x.id === item.id)
            ? repo[assetType].map(x => x.id === item.id ? item : x) : [item, ...repo[assetType]] })
          setScreen(assetType); flash('נשמר בחדר')
        }
        const deleteDraft = async () => {
          await persistRepo({ ...repo, [assetType]: repo[assetType].filter(x => x.id !== draftAsset.id) })
          setScreen(assetType); flash('נמחק מהחדר')
        }
        const importAssets = async event => {
          const value = JSON.parse(await event.target.files[0].text()), list = Array.isArray(value) ? value : [value]
          const items = list.map((x, i) => ({ ...x, id: x.id || ui.prefixes[screen] + Date.now().toString(36) + i,
            mark: x.mark || x.name?.slice(0, 2) }))
          await persistRepo({ ...repo, [screen]: [...items, ...repo[screen]] }); event.target.value = ''; flash('הייבוא נשמר בחדר')
        }
        const runGroundedAnswer = (text, plugin, history) => dsls.common.data.wonderPlatformAnswer.$runWithCtx(ctx, {
          text, plugin, history, repo
        })
        const send = async () => {
          const text = message.trim()
          if (!text || !activePlugin || busy) return
          setMessage(''); setBusy(true)
          const pending = { ...activeConversation, title: activeConversation.messages.length ? activeConversation.title : text.slice(0, 42),
            messages: [...activeConversation.messages, { id: 'm' + Date.now(), role: 'user', text }] }
          const first = await updateConversation(pending), result = await runGroundedAnswer(text, activePlugin, pending.messages)
          await updateConversation({ ...pending, messages: [...pending.messages,
            { id: 'm' + (Date.now() + 1), role: 'agent', ...result, traceOpen: true }] }, first)
          setBusy(false)
        }
        const runEvaluation = async item => {
          setRunningEvaluationId(item.id)
          const plugin = repo.plugins.find(x => x.id === item.pluginId)
          const results = await Promise.all(item.rows.map(async row => ({ ...row,
            actual: (await runGroundedAnswer(row.input, plugin, [])).text })))
          await persistRepo({ ...repo, evaluations: repo.evaluations.map(x => x.id === item.id
            ? { ...x, status: 'הושלם', lastRun: new Date().toLocaleString('he-IL'), results } : x) })
          setRunningEvaluationId('')
        }
        const newConversation = async () => {
          const conversation = { id: 'c' + Date.now().toString(36), title: 'שיחה חדשה', pluginId: repo.plugins[0]?.id,
            when: 'עכשיו', messages: [] }
          await persistRepo({ ...repo, conversations: [conversation, ...repo.conversations] }); setConversationId(conversation.id)
        }
        const toggleTrace = messageId => updateConversation({ ...activeConversation, messages: activeConversation.messages.map(item =>
          item.id === messageId ? { ...item, traceOpen: !item.traceOpen } : item) })
        const sharedViewProps = { repo, query, setQuery, openEditor, ui }
        const activeView = screen === 'editor' ? hh(ctx, dsls.react['react-comp'].wonderPlatformEditor, {
          repo, assetType, draftAsset, setDraftAsset, setScreen, saveDraft, deleteDraft, ui
        }) : screen === 'chat' ? hh(ctx, dsls.react['react-comp'].wonderPlatformChat, {
          repo, activeConversation, activePlugin, busy, chatEndRef, message, setMessage, send, updateConversation, newConversation,
          setConversationId, toggleTrace, ui
        }) : screen === 'evaluations' ? hh(ctx, dsls.react['react-comp'].wonderPlatformEvaluations, {
          ...sharedViewProps, runningEvaluationId, runEvaluation
        }) : hh(ctx, dsls.react['react-comp'].wonderPlatformCatalog, { ...sharedViewProps, screen, fileRef, importAssets })
        return h('div', {}, h('div', {
          dir: 'rtl', className: 'min-h-screen flex bg-[#f6f6f8] text-[#14161a] font-sans text-sm max-md:block max-md:pb-16'
        }, hh(ctx, dsls.react['react-comp'].wonderPlatformSidebar, { screen, setScreen, setQuery, ui }),
        h('main', { className: 'flex-1 min-w-0' }, activeView)), notice && h('div', { className: (
          'fixed bottom-5 left-5 z-30 rounded-lg border border-[#c7e4d5] bg-[#e3f2ea] px-3 py-2 text-[#0a4a32] shadow-lg'
        ) }, notice))
      }
    }
  })
})
