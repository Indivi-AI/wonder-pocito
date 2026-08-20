import { dsls } from '@jb6/core'
import '@jb6/react'
import './platform-v0-model.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('PlatformV0VerifiedReport', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({report}) => report && h(
      'section:mt-4 overflow-hidden rounded-xl border border-[#cfe0d5] bg-[#f8fbf9]', {'data-report-id': report.name},
      h('div:flex items-start justify-between border-b border-[#e1ebe4] bg-[#edf6f0] px-4 py-3', {}, h('div', {},
        h('div:flex items-center gap-2 text-sm font-bold text-[#294f3b]', {}, h('L:BadgeCheck', {size: 16}), report.title),
        h('div:mt-1 text-[11px] text-[#728078]', {}, 'דוח מאומת · תצוגה ושאילתה מוגדרות מראש')),
      h('span:rounded border border-[#c8d9ce] px-1.5 py-0.5 text-[10px] text-[#52705e]', {}, report.version)),
      h('p:px-4 pt-3 text-xs leading-5 text-[#66706b]', {}, report.description), h('div:grid grid-cols-3 gap-2 p-4', {},
        report.metrics.map(metric => h('div:rounded-lg border border-[#e0e8e3] bg-white p-2 text-center', {key: metric.label},
          h('div:text-lg font-bold text-[#2f6b4b]', {}, metric.value), h('div:text-[10px] text-[#8b948f]', {}, metric.label))))
    )
  })
})

ReactComp('PlatformV0ChatComposer', {
  impl: comp({
    hFunc: (ctx, {react: {h, useEffect, useRef}}) => ({catalog, conversation, message, setMessage, busy, send, updateConversation}) => {
      const ref = useRef(), submit = () => message.trim() && conversation?.plugin && !busy && send()
      const placeholder = conversation?.plugin ? 'כתוב הודעה לפלאגין…' : 'בחר פלאגין כדי להתחיל'
      useEffect(() => {
        if (ref.current) ref.current.style.height = 'auto', ref.current.style.height = Math.min(ref.current.scrollHeight, 144) + 'px'
      }, [message])
      return h('div:border-t border-[#e3e7e4] bg-[#f8f9f8] p-4', {},
        h('div:mx-auto max-w-3xl rounded-2xl border border-[#e0e5e2] bg-white p-2 shadow-sm', {}, h('select:mb-2 max-w-full rounded-full ' +
          'border border-[#cfe0d5] bg-[#edf6f0] px-3 py-1 text-xs text-[#315e46]', {value: conversation?.plugin || '',
          disabled: conversation?.messages?.length > 0, onChange: event => updateConversation({...conversation, plugin: event.target.value})},
          h('option', {value: ''}, 'בחר פלאגין'), (catalog.plugins || []).map(plugin => h('option', {key: plugin.name, value: plugin.name}, plugin.title))),
        h('div:flex items-end gap-2', {}, h('textarea:min-h-11 flex-1 resize-none px-3 py-2 text-sm outline-none', {ref, rows: 1,
          value: message, 'data-testid': 'platform-chat-input', placeholder,
          onInput: event => setMessage(event.target.value), onKeyDown: event => event.key == 'Enter' && !event.shiftKey &&
            (event.preventDefault(), submit())}), h('button:grid h-10 w-10 place-items-center rounded-full bg-[#2f6b4b] text-white disabled:opacity-40', {
              disabled: !message.trim() || !conversation?.plugin || busy, onClick: submit, 'aria-label': 'שליחה'}, h('L:ArrowUp', {size: 16})))))
    }
  })
})

ReactComp('PlatformV0Chat', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh}}) => props => {
      const {catalog, conversation, message, setMessage, busy, send, updateConversation, newConversation, setConversation} = props
      const plugin = catalog.plugins?.find(item => item.name == conversation?.plugin)
      const opikUrl = conversation?.messages?.filter(item => item.opikUrl).at(-1)?.opikUrl
      return h('main:h-screen min-w-0 overflow-hidden pb-16 sm:mr-[210px] sm:pb-0', {}, h('div:flex h-full min-w-0', {},
        h('section:flex min-w-0 flex-1 flex-col', {}, h('header:flex items-center justify-between border-b border-[#e5e8e6] bg-white px-6 py-4', {},
          h('div:flex items-center gap-3', {}, h('span:grid h-8 w-8 place-items-center rounded-xl bg-[#e6f2ea] text-xs font-bold text-[#285a40]', {},
            plugin?.title?.slice(0, 2) || '—'), h('b:text-sm', {}, plugin?.title || 'בחר פלאגין')),
          opikUrl && h('a:text-xs text-[#37664e]', {href: opikUrl}, 'ה-trace המלא ב-Opik ↗')),
        h('div:flex-1 overflow-y-auto overflow-x-hidden', {}, h('div:mx-auto max-w-3xl px-5 py-8', {},
          conversation?.messages?.length > 0 && h('div:mb-5 text-center text-xs text-[#a3a9a6]', {},
            `שיחה מתמשכת · ${plugin?.title} · ההקשר נשמר בין הפניות`), (conversation?.messages || []).map(item => item.role == 'user'
              ? h('div:mb-4 mr-auto max-w-[88%] rounded-2xl border border-[#cee2d6] bg-[#eaf4ed] p-4 text-sm leading-7', {
                key: item.id, 'data-message-role': 'user'}, item.text)
              : h('div:mb-4', {key: item.id}, h('details:mb-3 rounded-xl border border-[#e3e7e4] bg-white', {},
                h('summary:cursor-pointer px-4 py-3 text-xs font-semibold text-[#3c5548]', {},
                  `מעקב הרצה · ${item.trace?.length || 0} שלבים · ${item.status || 'הושלם'}`), h('div:border-t border-[#edf0ee] p-3', {},
                  (item.trace || []).map((step, index) => h('div:flex items-center gap-2 py-1 text-xs', {key: index},
                    h('span:rounded-full border px-2 py-0.5 text-[10px]', {}, step.kind), step.title)))),
                h('div:rounded-2xl border border-[#e3e7e4] bg-white p-5 shadow-sm', {'data-message-role': 'assistant'},
                  h('div:mb-3 text-xs font-semibold text-[#3c5548]', {}, 'תשובת הסוכן'),
                  h('div:whitespace-pre-wrap text-sm leading-7', {}, item.text), item.runId && h('div:mt-3 text-[10px] text-[#a3a9a6]', {},
                    `Agno run · ${item.runId}`)), (item.reports || []).map(name => hh(ctx,
                    dsls.react['react-comp'].PlatformV0VerifiedReport, {key: name, report: catalog.reports?.find(report => report.name == name)})))),
          busy && h('div:flex items-center gap-2 rounded-2xl border border-[#e3e7e4] bg-white p-5 text-sm text-[#758078]', {},
            h('L:Loader2', {size: 16, className: 'animate-spin'}), 'Agno מריץ את הפלאגין…'))),
        hh(ctx, dsls.react['react-comp'].PlatformV0ChatComposer, {catalog, conversation, message, setMessage, busy, send, updateConversation})),
        h('aside:hidden w-[260px] shrink-0 overflow-y-auto border-r border-[#e4e8e5] bg-white p-4 lg:block', {},
          h('button:w-full rounded-xl border border-[#cfe0d5] bg-[#edf6f0] py-2.5 text-sm font-semibold text-[#315e46]', {
            onClick: newConversation}, '＋ שיחה חדשה'), h('div:pb-3 pt-6 text-xs text-[#a1a7a4]', {}, 'היסטוריית שיחות'),
          (catalog.conversations || []).map(item => h(`button:mb-1 w-full rounded-xl px-3 py-3 text-right text-sm ${item.name == conversation?.name
            ? 'bg-[#e7f1eb]' : 'hover:bg-gray-50'}`, {key: item.name, onClick: () => setConversation(item.name)}, h('b:block', {}, item.title),
            h('small:text-[#8b948f]', {}, `${catalog.plugins?.find(value => value.name == item.plugin)?.title || 'ללא בחירה'} · ${item.updated || 'עכשיו'}`))))))
    }
  })
})
