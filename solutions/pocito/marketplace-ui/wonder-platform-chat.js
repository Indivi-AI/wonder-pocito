import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-agent-results.js'
import './wonder-platform-searchable-select.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformChatContext', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh, useState}}) => ({repo, conversation, selectAgent, setContext}) => {
      const rows = [['pluginIds', 'plugins', 'פלאגינים'], ['skillIds', 'skills', 'מיומנויות'],
        ['toolIds', 'tools', 'כלים'], ['knowledgeIds', 'knowledge', 'ידע']]
      const [closed, setClosed] = useState('')
      const select = props => hh(ctx, dsls.react['react-comp'].wonderPlatformSearchableSelect, {bare: true, tall: true, ...props})
      const section = (id, label, body) => h('div:mb-3', {key: id},
        h(`button:flex w-full items-center justify-between border-b border-[#e8e8ea] py-1.5 text-base font-semibold text-[#0f0f10]`,
          {onClick: () => setClosed(closed == id ? '' : id)}, label,
          h(`L:${closed == id ? 'ChevronDown' : 'ChevronUp'}`, {size: 16})),
        closed != id && h('div:pt-2', {}, body))
      return h('aside:hidden w-[260px] shrink-0 overflow-y-auto bg-white px-4 py-5 shadow-[-8px_0_24px_rgba(0,0,0,0.07)] lg:block', {},
        h('div:mb-5 text-[13px] font-semibold text-[#0f0f10]', {}, 'הקשר השיחה'),
        section('agent', 'סוכן', select({items: repo.agents, value: conversation?.agentId || '', onChange: selectAgent,
          placeholder: 'בחר סוכן', empty: 'ללא סוכן', testId: 'agent-selector'})),
        rows.map(([field, resource, label]) => section(field, label,
          select({items: repo[resource], multi: true, value: conversation?.[field] || [],
            onChange: value => setContext(field, value), placeholder: `בחר ${label}`}))),
        h('p:mt-2 text-[11px] leading-5 text-[#9b9ba0]', {},
          'הסוכן והנכסים שנבחרו מהווים את ההקשר שנשלח בכל פנייה בשיחה זו.'))
    }
  })
})

ReactComp('wonderPlatformChatComposer', {
  impl: comp({
    hFunc: (ctx, {react: {h, useEffect, useRef}}) => ({message, setMessage, busy, ready, send}) => {
      const ref = useRef(), submit = () => message.trim() && !busy && send()
      useEffect(() => { if (ref.current) ref.current.style.height = 'auto', ref.current.style.height = `${Math.min(ref.current.scrollHeight, 144)}px` }, [message])
      return h('div:px-5 py-4', {}, h('div:mx-auto flex max-w-3xl items-end gap-2 rounded-[12px] ' +
        'border border-[#e8e8ea] bg-white p-2 shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-colors ' +
        'focus-within:border-[#c9c9ce]', {},
      h('textarea:min-h-10 flex-1 resize-none px-2 py-1.5 text-[13px] outline-none placeholder:text-[#9b9ba0]', {ref, rows: 1,
        value: message, disabled: !ready, 'data-testid': 'chat-input',
        placeholder: ready ? 'כתוב הודעה…' : 'יש לבחור סוכן תחילה',
        onInput: event => setMessage(event.target.value),
        onKeyDown: event => event.key == 'Enter' && !event.shiftKey && (event.preventDefault(), submit())}),
      h('button:grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[#0f0f10] text-white transition-opacity ' +
        'hover:opacity-85 disabled:opacity-25', {disabled: !message.trim() || busy || !ready, onClick: submit,
        'aria-label': 'שליחה'}, h('L:ArrowUp', {size: 15}))))
    }
  })
})

ReactComp('wonderPlatformChat', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh}}) => props => {
      const {repo, conversation, message, setMessage, busy, send, selectAgent, setContext} = props
      const agent = repo.agents.find(item => item.id == conversation?.agentId)
      const opikUrl = conversation?.messages.filter(item => item.opikUrl).at(-1)?.opikUrl
      return h('main:h-screen min-w-0 overflow-hidden pb-16 sm:mr-[248px] sm:pb-0', {}, h('div:flex h-full min-w-0', {},
        h('section:flex min-w-0 flex-1 flex-col', {},
          h('header:flex items-center justify-between border-b border-[#e8e8ea] bg-white px-6 py-3.5', {},
            h('div:min-w-0', {}, h('b:block truncate text-[14px] font-medium text-[#0f0f10]', {}, agent?.name || 'שיחה חופשית'),
              conversation?.messages.length > 0 && h('span:text-[11px] text-[#9b9ba0]', {}, 'ההקשר נשמר בין הפניות')),
            opikUrl && h('a:shrink-0 text-[12px] text-[#2e2e2e]', {href: opikUrl}, 'ה-trace המלא ב-Opik ↗')),
          h('div:flex-1 overflow-y-auto overflow-x-hidden', {}, h('div:mx-auto max-w-3xl px-5 py-8', {},
            conversation?.messages.map(item => item.role == 'user'
              ? h('div:mb-4 mr-auto max-w-[88%] rounded-[12px] border border-[#e8e8ea] bg-[#fafafa] px-4 py-3 text-[13px] ' +
                'leading-[1.7]', {key: item.id, 'data-message-role': 'user'}, item.text)
              : h('div:mb-4', {key: item.id},
                h('details:mb-3 rounded-[10px] border border-[#e8e8ea] bg-white', {},
                  h('summary:cursor-pointer px-3.5 py-2.5 text-[12px] text-[#6b6b6f]', {},
                    `מעקב הרצה · ${item.steps?.length || 0} שלבים · ${item.status || 'הושלם'}`),
                  h('div:border-t border-[#e8e8ea] p-3', {}, (item.steps || []).map((step, index) =>
                    h('div:flex items-center gap-2 py-1 text-[12px]', {key: index},
                      h('span:rounded-md border border-[#e8e8ea] px-1.5 py-0.5 text-[10px] text-[#6b6b6f]', {}, step.kind),
                      step.title || step.name)))),
                hh(ctx, dsls.react['react-comp'].wonderPlatformAgentResult, {result: item, setMessage}))),
            busy && h('div:flex items-center gap-2 rounded-[10px] border border-[#e8e8ea] bg-white p-4 text-[13px] text-[#6b6b6f]', {},
              h('L:Loader2', {size: 15, className: 'animate-spin'}), 'הסוכן פועל…'))),
          hh(ctx, dsls.react['react-comp'].wonderPlatformChatComposer, {message, setMessage, busy, ready: !!agent, send})),
        hh(ctx, dsls.react['react-comp'].wonderPlatformChatContext, {repo, conversation, selectAgent, setContext})))
    }
  })
})
