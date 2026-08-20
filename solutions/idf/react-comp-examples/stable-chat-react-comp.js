import { dsls } from '@jb6/core'
import '@jb6/react'
import './room-state-react-comp.js'

const { common: { Data }, react: { ReactComp, 'react-comp': { comp } } } = dsls

Data('stableChatExampleSeed', {
  impl: () => ({ version: 1, conversations: [{ id: 'c1', messages: [] }] })
})

ReactComp('stableChatExample', {
  params: [
    {id: 'roomWUrl', as: 'string', defaultValue: 'room:minio//idf-stable-chat-example'}
  ],
  impl: comp({
    hFunc: (ctx, {}, {roomWUrl}) => {
      const { h, hh, useEffect, useState } = ctx.vars.react
      const seed = dsls.common.data.stableChatExampleSeed.$run()
      const store = dsls.common.data.idfRoomJsonStore.$runWithCtx(ctx, {
        roomWUrl, assetPath: 'usersRW/react-comp-examples/stable-chat'
      })
      return function StableChatExample() {
        const [repo, setRepo] = useState(), [message, setMessage] = useState('')
        useEffect(() => { void store.load(seed).then(setRepo) }, [])
        if (!repo) return h('div:p-6', {}, 'טוען…')
        const conversation = repo.conversations[0]
        const persist = async next => { setRepo(next); await store.save(next) }
        const send = async () => {
          const text = message.trim()
          if (!text) return
          setMessage('')
          await persist({ ...repo, conversations: [{ ...conversation,
            messages: [...conversation.messages, { id: 'm' + Date.now().toString(36), role: 'user', text }] }] })
        }
        return h('main:max-w-2xl mx-auto p-6 flex flex-col gap-4', { dir: 'rtl' }, h('h1:text-xl font-bold', {}, 'צ׳אט יציב'),
          h('section:min-h-64 rounded-2xl bg-gray-50 border p-4 space-y-3', {}, conversation.messages.map(item => h(
            'div:w-fit max-w-[85%] rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 whitespace-pre-wrap',
            { key: item.id, 'data-message-role': item.role }, item.text))),
          hh(ctx, dsls.react['react-comp'].stableChatComposerExample, { message, setMessage, send }))
      }
    }
  })
})

ReactComp('stableChatComposerExample', {
  impl: comp({
    hFunc: (ctx, { react: { h, useEffect, useRef } }) => ({message, setMessage, send}) => {
      const ref = useRef()
      useEffect(() => { if (ref.current) ref.current.style.height = Math.min(ref.current.scrollHeight, 144) + 'px' }, [message])
      return h('div:flex items-end gap-2 rounded-2xl border p-3', {}, h('textarea:flex-1 resize-none outline-none', {
        ref, rows: 1, value: message, 'data-testid': 'stable-chat-input', placeholder: 'כתוב הודעה…',
        onInput: event => setMessage(event.target.value),
        onKeyDown: event => event.key === 'Enter' && !event.shiftKey && (event.preventDefault(), send())
      }), h('button:rounded-full bg-emerald-800 text-white px-4 py-2 disabled:opacity-40', {
        disabled: !message.trim(), onClick: send, 'aria-label': 'שליחה'
      }, 'שליחה'))
    }
  })
})
