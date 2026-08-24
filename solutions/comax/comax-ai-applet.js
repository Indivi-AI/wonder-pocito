import { dsls, coreUtils } from '@jb6/core'
import '@jb6/react'
import '@wonder/ui/applet.js'
import './comax-v2-agent.js'

const { react: { ReactComp, 'react-comp': reactComps, 'react-metadata': { applet } } } = dsls
const { comp } = reactComps

ReactComp('comaxAiApplet', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh, useEffect, useRef, useState } }) => () => {
      const [messages, setMessages] = useState([]), [text, setText] = useState(''), [working, setWorking] = useState(false)
      const [progress, setProgress] = useState('בוחר דוח מאומת...'), [details, setDetails] = useState(), list = useRef()
      useEffect(() => list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }), [messages, working])
      useEffect(() => {
        const onProgress = event => event?.t && setProgress(event.t)
        coreUtils.eventEmitter.on('progress', onProgress)
        return () => coreUtils.eventEmitter.off('progress', onProgress)
      }, [])
      const send = async question => {
        question = (question || text).trim()
        if (!question || working) return
        const user = { role: 'user', text: question }, next = [...messages, user]
        setMessages(next); setText(''); setWorking(true)
        try {
          const accumulatedContext = { chatHistory: next.map(({ role, text: content }) => ({ role, content })) }
          const requestCtx = coreUtils.ensureLoggers('workflowLogger,llmCallLogger,biLogger,dbLogger,errorLogger', {
            ctx: ctx.setVars({ roomId: 'comaxDemo', roomWUrl: 'room://comaxDemo', userMessage: question, accumulatedContext }) })
          const result = await dsls.ai.workflow.comaxVerifiedReports.$runWithCtx(requestCtx).calcWorkflow(requestCtx)
          const answer = { role: 'assistant', ...result.runRes }
          answer.showIn == 'sidePanel' ? setDetails(answer) : setMessages([...next, answer])
        } catch (error) { setMessages([...next, { role: 'assistant', text: error.message }]) }
        finally { setWorking(false) }
      }
      const report = message => message.viewId && reactComps[message.viewId]
      const message = (item, index) => report(item)
        ? h('div:w-full', { key: index }, item.text && h('div:mb-3 whitespace-pre-wrap', {}, item.text),
          hh(ctx, reactComps[item.viewId], { rows: item.rows, openDetails: setDetails }))
        : h(`div:max-w-[82%] rounded-3xl px-4 py-2.5 whitespace-pre-wrap ${item.role == 'user'
          ? 'self-end bg-[#EBF4DE]' : 'self-start bg-white border border-gray-100'}`, { key: index }, item.text)
      return h('main:fixed inset-0 grid bg-[#F6F7F8] text-gray-900', { dir: 'rtl', style: { gridTemplateRows: 'auto 1fr auto' } },
        h('header:border-b-2 border-[#61A60E] bg-white px-5 py-3', {},
          h('div:max-w-3xl mx-auto flex items-center justify-between', {},
            h('div', {}, h('strong:text-lg', {}, 'Comax AI'), h('div:text-xs text-gray-500', {}, 'דוחות מאומתים')),
            h('button:w-10 h-10 rounded-full hover:bg-gray-100',
              { onClick: () => setMessages([]), title: 'צ׳אט חדש' }, h('L:SquarePen', { size: 18 })))),
        h('section:overflow-y-auto overflow-x-hidden', { ref: list },
          h('div:max-w-3xl min-h-full mx-auto p-5 flex flex-col gap-4', {}, messages.length ? messages.map(message)
            : h('div:my-auto text-center', {}, h('h1:text-3xl font-semibold', {}, 'מה נרצה לגלות היום?'),
              h('div:mt-5 flex flex-wrap justify-center gap-2', {}, ['מצב המכירות', 'ביצועי סניפים', 'אילו מבצעים מפסידים?'].map(question =>
                h('button:rounded-full border bg-white px-4 py-2 text-sm hover:border-[#61A60E]', { onClick: () => send(question) }, question)))),
            working && h('div:text-sm text-gray-500', {}, progress))),
        h('footer:border-t bg-white p-4', {}, h('form:max-w-3xl mx-auto flex gap-2', { onSubmit: event => (event.preventDefault(), send()) },
          h('input:flex-1 min-w-0 rounded-2xl border px-4 py-3', { value: text, onInput: event => setText(event.target.value), placeholder: 'שאלו על העסק...' }),
          h('button:w-12 rounded-full bg-[#61A60E] text-white disabled:bg-gray-200',
            { disabled: working || !text.trim(), 'aria-label': 'שליחה' }, h('L:ArrowUp', { size: 18 })))),
        details && h('aside:fixed inset-y-0 left-0 z-50 w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-2xl', {},
          h('button:mb-4 w-9 h-9 rounded-full hover:bg-gray-100', { onClick: () => setDetails() }, h('L:X', { size: 18 })),
          details.viewId ? hh(ctx, reactComps[details.viewId], { rows: details.rows, openDetails: setDetails })
            : h('pre:whitespace-pre-wrap text-sm', {}, JSON.stringify(details.spec?.item || details, null, 2))))
    },
    metadata: applet({ title: 'Comax AI', icon: 'ChartNoAxesCombined', showMessageInput: false })
  })
})
