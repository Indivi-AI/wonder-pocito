import { dsls, coreUtils } from '@jb6/core'
import '@jb6/react'
import '../../agents/app/chat-ui.js'
import '../../agents/react-comp-creator/react-comp-creator.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls
const COMP_WURL = 'room://idf/reactComps/chatUi.js', COMP_ID = 'chatUi'
const MODELS = [['groq/openai/gpt-oss-120b', 'oss 120b'], ['gemini/gemma-4-31b-it', 'gemma 31b'], ['groq/openai/gpt-oss-20b', 'oss 20b'],
  ['chrome/gemini-nano', 'chrome nano']]
let activeAbortFlag = null   // the running edit's llmAbortFlag - Stop marks it and aborts the in-flight llm stream

ReactComp('idfAppletsViz', {
  impl: comp({
    hFunc: (ctx, { react: { h, useState, useEffect, useRef } }) => () => {
      const [view, setView] = useState('preview')
      const [source, setSource] = useState(null)
      const [version, setVersion] = useState(0)
      const [msg, setMsg] = useState('')
      const [status, setStatus] = useState(null)
      const [live, setLive] = useState('')
      const [model, setModel] = useState(MODELS[0][0])
      useEffect(() => { const on = e => e?.t && setLive(e.t); coreUtils.eventEmitter.on('progress', on); return () => coreUtils.eventEmitter.off('progress', on) }, [])
      const loadFromRoom = async () => {
        const src = await dsls.common.data.fetchReactCompSource.$runWithCtx(ctx, COMP_WURL)
        if (typeof src != 'string') return setStatus(`load failed: ${src?.error || ''}`)
        dsls.common.data.evalReactCompSource.$runWithCtx(ctx.setData(src), { compId: COMP_ID })
        setSource(src); setVersion(v => v + 1)
      }
      useEffect(() => { loadFromRoom() }, [])
      const cmpRef = useRef({})
      // one ELEMENT per version: an identical element makes react skip the preview subtree, so status ticks and agent-run evals can never remount it mid-run
      const appletFrame = () => {
        if (cmpRef.current.version != version)
          cmpRef.current = { version, el: h('div:applet-frame', { key: version }, source && h(dsls.react['react-comp'][COMP_ID].$runWithCtx(ctx))) }
        return cmpRef.current.el
      }
      const send = async () => {
        const userMessage = msg.trim()
        if (!userMessage || status == 'working') return
        setStatus('working'); setMsg('')
        const abortFlag = activeAbortFlag = { aborted: false }
        const ctxForWf = ctx.setVars({ userMessage, roomId: ctx.vars.roomId || 'idf', userId: ctx.vars.userId || 'deckViewer',
          flowModelOverride: model, llmAbortFlag: abortFlag, accumulatedContext: { chatHistory: [] } })
        const res = await dsls.workflow.workflow.reactCompCreator.$run().calcWorkflow(ctxForWf).catch(e => ({ error: e.message }))
        activeAbortFlag = null
        const ok = res?.runRes?.ok
        if (ok) await loadFromRoom()
        setStatus(abortFlag.aborted ? 'Stopped' : ok ? 'Updated ✓' : `failed: ${res?.runRes?.error || res?.error || 'see logs'}`)
      }
      const stop = () => { activeAbortFlag && (activeAbortFlag.aborted = true); coreUtils.eventEmitter.emit('abortLLM') }
      return h('div:iv', {}, h('div:iv-title', {}, 'Applets'),
        h('div:toggle', {}, ...['preview', 'code'].map(id =>
          h('button', { key: id, className: view == id ? 'on' : '', onClick: () => setView(id) }, id))),
        view == 'preview'
          ? appletFrame()
          : h('div:win', {}, h('div:chrome', {}, h('i'), h('i'), h('i'), COMP_WURL), h('pre:code-pane', { key: version }, source || '')),
        view == 'code' && h('div:edit-bar', {},
          h('select', { value: model, onChange: e => setModel(e.target.value), title: 'Edit model' },
            ...MODELS.map(([id, label]) => h('option', { key: id, value: id }, label))),
          h('input', { value: msg, placeholder: 'Edit the app with AI — e.g. make the app blue',
            onInput: e => setMsg(e.target.value), onKeyDown: e => e.key == 'Enter' && send() }),
          status == 'working' ? h('button', { onClick: stop }, 'Stop') : h('button', { onClick: send }, 'Send'),
          h('span:edit-status', {}, status == 'working' ? live : status || '')),
        h('div:iv-caption', {}, 'Build-less applets for versatile use. Upload a file and it’s live.'))
    }
  })
})
