import { dsls } from '@jb6/core'
import '@jb6/react'
import './platform-v0-model.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('PlatformV0VerifiedReport', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({report}) => report && h(
      'section:mt-4 overflow-hidden rounded-xl border border-[#cfe0d5] bg-[#f8fbf9]', {key: report.name},
      h('div:flex items-start justify-between border-b border-[#e1ebe4] bg-[#edf6f0] px-4 py-3', {},
        h('div', {}, h('div:flex items-center gap-2 text-sm font-bold text-[#294f3b]', {}, h('L:BadgeCheck', {size: 16}), report.title),
          h('div:mt-1 text-[11px] text-[#728078]', {}, 'Verified Report · תצוגה ושאילתה מוגדרות מראש')),
        h('span:rounded border border-[#c8d9ce] px-1.5 py-0.5 text-[10px] text-[#52705e]', {}, report.version)),
      h('p:px-4 pt-3 text-xs leading-5 text-[#66706b]', {}, report.description),
      h('div:grid grid-cols-3 gap-2 p-4', {}, report.metrics.map(metric =>
        h('div:rounded-lg border border-[#e0e8e3] bg-white p-2 text-center', {key: metric.label},
          h('div:text-lg font-bold text-[#2f6b4b]', {}, metric.value), h('div:text-[10px] text-[#8b948f]', {}, metric.label)))),
      h('div:flex items-center justify-between border-t border-[#e3ebe6] px-4 py-2.5 text-[10px] text-[#7d8982]', {},
        'פרמטרים · ' + report.parameters.join(', '),
        h('span:flex items-center gap-1 font-semibold text-[#356349]', {}, 'פתיחת הדוח', h('L:ArrowUpLeft', {size: 12}))))
  })
})

ReactComp('PlatformV0ChatComposer', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({catalog, chatInput, setChatInput, agentBusy, sendMessage, selectedAgent, setSelectedAgent}) => h(
      'div:fixed bottom-0 left-0 right-0 border-t border-[#e3e7e4] bg-[#f8f9f8]/95 p-4 backdrop-blur sm:left-[250px] sm:right-[210px]', {},
      h('div:mx-auto max-w-3xl rounded-2xl border border-[#e0e5e2] bg-white p-2 shadow-sm', {}, h('div:flex items-end gap-2', {},
        h('textarea:min-h-12 flex-1 resize-none px-3 py-2 text-sm outline-none', {
          value: chatInput, placeholder: 'כתוב הודעה לפלאגין…', onInput: event => setChatInput(event.target.value),
          onKeyDown: event => event.key == 'Enter' && !event.shiftKey && (event.preventDefault(), sendMessage())}),
        h('button:grid h-10 w-10 place-items-center rounded-full bg-[#2f6b4b] text-white disabled:opacity-40', {
          disabled: !chatInput.trim() || agentBusy, onClick: sendMessage, 'aria-label': 'שליחה'}, h('L:ArrowUp', {size: 16}))),
        h('select:mt-1 rounded-lg border-0 bg-[#f4f6f5] px-2 py-1 text-xs text-[#5f6863]', {
          value: selectedAgent, onChange: event => setSelectedAgent(event.target.value)
        }, (catalog?.plugins || []).map(item => h('option', {key: item.name, value: item.name}, item.title)))))
  })
})

ReactComp('PlatformV0Chat', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh}}) => {
      const {chatHistory} = dsls.common.data.platformV0Config.$run()
      return ({catalog, messages, chatInput, setChatInput, agentBusy, sendMessage, selectedAgent, setSelectedAgent}) =>
        h('main:min-h-screen overflow-x-hidden pb-28 sm:ml-[250px] sm:mr-[210px]', {},
          h('aside:fixed bottom-0 left-0 top-0 hidden w-[250px] border-r border-[#e4e8e5] bg-white p-4 sm:block', {},
            h('button:w-full rounded-xl border border-[#cfe0d5] bg-[#edf6f0] py-2.5 text-sm font-semibold text-[#315e46]', {}, '＋ שיחה חדשה'),
            h('div:pb-3 pt-6 text-xs text-[#a1a7a4]', {}, 'היסטוריית שיחות'), chatHistory.map((title, index) =>
              h(`button:w-full rounded-xl px-3 py-3 text-right text-sm ${index ? 'hover:bg-gray-50' : 'bg-[#e7f1eb]'}`, {key: title}, title))),
          h('header:sticky top-0 z-20 flex items-center justify-between border-b border-[#e5e8e6] bg-white/95 px-6 py-4 backdrop-blur', {},
            h('div:flex items-center gap-3', {}, h('span:grid h-8 w-8 place-items-center rounded-xl bg-[#e6f2ea] text-xs font-bold text-[#285a40]', {}, 'אנ'),
              h('b:text-sm text-[#202724]', {}, catalog?.plugins?.find(item => item.name == selectedAgent)?.title || 'אנליסט הוכחת קיום')),
            h('a:text-xs text-[#37664e]', {href: '#'}, 'ה-trace המלא ב-Opik ↗')),
          h('div:mx-auto max-w-3xl px-5 py-8', {},
            h('div:mb-5 text-center text-xs text-[#a3a9a6]', {}, 'שיחה מתמשכת · ההקשר נשמר בין הפניות'),
            messages.map((message, index) => h(`div:mb-4 ${message.role == 'user'
              ? 'mr-auto max-w-[88%] rounded-2xl border border-[#cee2d6] bg-[#eaf4ed] p-4'
              : `rounded-2xl border bg-white p-5 shadow-sm ${message.error ? 'border-red-200 text-red-700' : 'border-[#e3e7e4]'}`}`, {key: index},
              message.role == 'assistant' && h('div:mb-3 text-xs font-semibold text-[#3c5548]', {}, 'תשובת הסוכן'),
              h('div:whitespace-pre-wrap text-sm leading-7', {}, message.text),
              message.reports?.map(id => hh(ctx, dsls.react['react-comp'].PlatformV0VerifiedReport, {
                key: id, report: catalog?.reports?.find(report => report.name == id)
              })), message.runId && h('div:mt-3 text-[10px] text-[#a3a9a6]', {}, `Agno run · ${message.runId}`))),
            agentBusy && h('div:flex items-center gap-2 rounded-2xl border border-[#e3e7e4] bg-white p-5 text-sm text-[#758078]', {},
              h('L:Loader2', {size: 16, className: 'animate-spin'}), 'Agno מריץ את הסוכן…')),
          hh(ctx, dsls.react['react-comp'].PlatformV0ChatComposer, {
            catalog, chatInput, setChatInput, agentBusy, sendMessage, selectedAgent, setSelectedAgent
          }))
    }
  })
})
