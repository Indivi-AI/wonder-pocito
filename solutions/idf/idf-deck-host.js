import { dsls, coreUtils } from '@jb6/core'
import '@jb6/react'
import './idf-deck.js'
import '../agents/deck-editor/deck-editor.js'

const { react: { ReactComp, 'react-comp': { comp }, 'react-metadata': { applet } } } = dsls
const DECK_WURL = 'room://idf/reactComps/idfDeck.js', DECK_ID = 'idfDeck'
const MODELS = [['gemini/gemma-4-31b-it', 'gemma 31b'], ['groq/openai/gpt-oss-120b', 'oss 120b'], ['groq/openai/gpt-oss-20b', 'oss 20b'],
  ['chrome/gemini-nano', 'chrome nano']]

const HOST_CSS = `
.deck-host{position:fixed;inset:0;display:flex;background:#0b1020}
.deck-host .deck-area{flex:1;min-width:0;position:relative}
.deck-fab{position:fixed;left:18px;bottom:18px;z-index:60;width:46px;height:46px;border-radius:50%;border:1px solid rgba(34,211,238,.5);
background:#111c2e;color:#67e8f9;font-size:20px;cursor:pointer;box-shadow:0 8px 30px rgba(0,0,0,.45)}
.deck-fab:hover{background:#22d3ee;color:#06202a}
.deck-chat{width:min(400px,45vw);flex:none;display:flex;flex-direction:column;background:#0d1526;border-left:1px solid #26324a;color:#e8ebf6;
font-family:Heebo,system-ui,sans-serif}
.deck-chat header{flex:none;display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #26324a;
font:700 16px Sora,sans-serif;color:#67e8f9}
.deck-chat header button{border:none;background:transparent;color:#8ea0c0;font-size:18px;cursor:pointer}
.deck-chat .chat-list{flex:1;min-height:0;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}
.deck-chat .msg{max-width:88%;padding:9px 13px;border-radius:14px;font:500 14px/1.45 Heebo;white-space:pre-wrap;overflow-wrap:anywhere}
.deck-chat .msg.user{align-self:flex-end;background:rgba(34,211,238,.14);color:#c7f9ff}
.deck-chat .msg.bot{align-self:flex-start;background:#111c2e;border:1px solid #26324a;color:#c7cce0}
.deck-chat .msg.bot b{color:#67e8f9}
.deck-chat .live{flex:none;padding:0 18px 8px;font:500 12px Heebo;color:#6b7390;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.deck-chat footer{flex:none;display:flex;gap:8px;padding:12px 14px;border-top:1px solid #26324a}
.deck-chat footer select{flex:none;max-width:110px;border:1px solid #26324a;border-radius:10px;background:#111c2e;color:#8ea0c0;
padding:0 6px;font:500 12px Heebo;outline:none;cursor:pointer}
.deck-chat footer input{flex:1;min-width:0;border:1px solid #26324a;border-radius:10px;background:#111c2e;color:#e8ebf6;padding:10px 12px;
font:500 14px Heebo;outline:none}
.deck-chat footer input:focus{border-color:#22d3ee}
.deck-chat footer button{border:none;border-radius:10px;background:#22d3ee;color:#06202a;padding:10px 16px;font:700 14px Sora;cursor:pointer}
.deck-chat footer button:disabled{opacity:.5;cursor:default}
`

ReactComp('idfDeckHost', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh, useState, useEffect, useRef } }) => () => {
      const [version, setVersion] = useState(0)
      const [open, setOpen] = useState(false)
      const [msgs, setMsgs] = useState([])
      const [txt, setTxt] = useState('')
      const [working, setWorking] = useState(false)
      const [live, setLive] = useState('')
      const [model, setModel] = useState(MODELS[0][0])
      const listRef = useRef(), deckRef = useRef({})
      useEffect(() => { const on = e => e?.t && setLive(e.t); coreUtils.eventEmitter.on('progress', on); return () => coreUtils.eventEmitter.off('progress', on) }, [])
      useEffect(() => { const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 60); return () => clearTimeout(t) }, [open])
      useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }) }, [msgs.length, working])
      const loadFromRoom = async () => {
        const src = await dsls.common.data.fetchReactCompSource.$runWithCtx(ctx, DECK_WURL)
        if (typeof src == 'string') dsls.common.data.evalReactCompSource.$runWithCtx(ctx.setData(src), { compId: DECK_ID })
        setVersion(v => v + 1)
      }
      useEffect(() => { loadFromRoom() }, [])
      // one ELEMENT per version: an identical element makes react skip the whole deck subtree, so status ticks and agent-run evals can never remount reveal mid-run
      const deckArea = () => {
        if (deckRef.current.version != version)
          deckRef.current = { version, el: h('div:deck-area', { key: version }, version > 0 && h(dsls.react['react-comp'][DECK_ID].$runWithCtx(ctx))) }
        return deckRef.current.el
      }
      const send = async () => {
        const userMessage = txt.trim()
        if (!userMessage || working) return
        const nextMsgs = [...msgs, { role: 'user', text: userMessage }]
        setMsgs(nextMsgs); setTxt(''); setWorking(true)
        const chatHistory = nextMsgs.map(m => ({ role: m.role == 'bot' ? 'assistant' : 'user', content: m.text }))
        const ctxForWf = ctx.setVars({ userMessage, roomId: ctx.vars.roomId || 'idf', userId: ctx.vars.userId || 'deckViewer',
          flowModelOverride: model, accumulatedContext: { chatHistory } })
        const res = await dsls.workflow.workflow.deckEditor.$run().calcWorkflow(ctxForWf).catch(e => ({ error: e.message }))
        const ok = res?.runRes?.ok
        if (ok) await loadFromRoom()
        const text = typeof res?.runRes == 'string' ? res.runRes
          : ok ? `Updated ${res.runRes.compId} ✓` : `failed: ${res?.runRes?.error || res?.error || 'see logs'}`
        setMsgs(m => [...m, { role: 'bot', text }])
        setWorking(false)
      }
      return h('div:deck-host', {}, h('style', {}, HOST_CSS),
        deckArea(),
        !open && h('button:deck-fab', { onClick: () => setOpen(true), title: 'Edit deck with AI' }, '✦'),
        open && h('aside:deck-chat', {},
          h('header', {}, 'Edit deck with AI', h('button', { onClick: () => setOpen(false), 'aria-label': 'Close' }, '✕')),
          h('div:chat-list', { ref: listRef },
            !msgs.length && h('div:msg bot', {}, 'Ask for changes to the deck or its applets, e.g. ', h('b', {}, 'make the slide titles green')),
            ...msgs.map((m, i) => h(`div:msg ${m.role}`, { key: i }, m.text))),
          working && h('div:live', {}, live),
          h('footer', {},
            h('select', { value: model, onChange: e => setModel(e.target.value), title: 'Edit model' },
              ...MODELS.map(([id, label]) => h('option', { key: id, value: id }, label))),
            h('input', { value: txt, placeholder: 'Ask or describe a change...', onInput: e => setTxt(e.target.value),
              onKeyDown: e => e.key == 'Enter' && send() }),
            h('button', { onClick: send, disabled: working }, working ? '...' : 'Send'))))
    },
    metadata: applet({ title: 'Wonder OS', icon: 'Presentation', showMessageInput: false })
  })
})
