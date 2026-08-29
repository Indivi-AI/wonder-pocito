import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-agent-results.js'
import './wonder-platform-searchable-select.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

const wonderPlatformChatContextRows = [['pluginIds', 'plugins', 'פלאגינים'], ['skillIds', 'skills', 'מיומנויות'],
  ['toolIds', 'tools', 'כלים'], ['knowledgeIds', 'knowledge', 'ידע']]

const wonderPlatformContextChildRows = {
  agents: [['pluginIds', 'plugins'], ['skillIds', 'skills'], ['toolIds', 'tools'], ['knowledgeIds', 'knowledge']],
  plugins: [['skillIds', 'skills'], ['toolIds', 'tools'], ['knowledgeIds', 'knowledge']],
  skills: [['toolIds', 'tools']]
}

ReactComp('wonderPlatformChatContext', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({repo, conversation}) => {
      const agent = repo.agents.find(item => item.id == conversation?.agentId)
      const ui = dsls.common.data.wonderPlatformUi.$run()
      const buildNode = (resource, id, depth) => {
        const item = repo[resource]?.find(value => value.id == id)
        if (!item || depth > 6) return null
        const children = (wonderPlatformContextChildRows[resource] || []).flatMap(([field, childResource]) =>
          (item[field] || []).map(childId => buildNode(childResource, childId, depth + 1)).filter(Boolean))
        return {resource, item, children}
      }
      const topNodes = wonderPlatformChatContextRows.flatMap(([field, resource]) =>
        (conversation?.[field] || []).map(id => buildNode(resource, id, 1)).filter(Boolean))
      const agentNode = agent && buildNode('agents', agent.id, 0)
      const rootNodes = agentNode ? [agentNode, ...topNodes] : topNodes
      const renderNode = (node, depth) => h('div', {key: `${node.resource}:${node.item.id}:${depth}`,
        className: depth > 0 ? 'ms-3 border-s border-[#e8e8ea] ps-3' : ''},
        h('div:flex items-center gap-2 py-1.5', {},
          h(`span:grid shrink-0 place-items-center rounded-full bg-[#f4f4f5] font-bold text-[#0f0f10] ${
            depth == 0 ? 'h-7 w-7 text-[11px]' : 'h-6 w-6 text-[10px]'}`, {},
            node.item.icon ? h(`L:${node.item.icon}`, {size: depth == 0 ? 13 : 12}) : (node.item.mark || '·')),
          h('span:min-w-0 flex-1', {},
            h(`span:block truncate text-[#0f0f10] ${depth == 0 ? 'text-[13px] font-semibold' : 'text-[12.5px] font-medium'}`,
              {}, node.item.name),
            h('span:block text-[10.5px] text-[#6b7280]', {}, ui.labels[node.resource])),
          h(`L:${ui.resources[node.resource].icon}`, {size: 13, className: 'shrink-0 text-[#a8a8ad]'})),
        node.children.length > 0 && h('div:mt-0.5', {}, node.children.map(child => renderNode(child, depth + 1))))
      return h('aside:hidden w-[280px] shrink-0 overflow-y-auto bg-white px-4 py-5 shadow-[-8px_0_24px_rgba(0,0,0,0.07)] lg:block', {},
        h('div:mb-4 text-[13px] font-semibold text-[#0f0f10]', {}, 'הקשר השיחה'),
        rootNodes.length > 0
          ? h('div', {}, rootNodes.map(node => renderNode(node, 0)))
          : h('p:text-[12px] text-[#6b7280]', {}, 'לא נבחרו נכסים עדיין.'),
        h('p:mt-4 text-[11px] leading-5 text-[#6b7280]', {}, conversation?.messages?.length > 0
          ? 'ההקשר ננעל כשהשיחה התחילה. פתחו שיחה חדשה כדי לשנות אותו.'
          : 'הסוכן והנכסים שנבחרו מהווים את ההקשר שנשלח בכל פנייה בשיחה זו.'))
    }
  })
})

ReactComp('wonderPlatformChatContextBoard', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh}}) => ({repo, conversation, selectAgent, setContext}) => {
      const ui = dsls.common.data.wonderPlatformUi.$run()
      const mine = list => list.filter(item => (item.owner || 'me') != 'global')
      const select = props => h('div:w-40', {key: props.testId},
        hh(ctx, dsls.react['react-comp'].wonderPlatformSearchableSelect, {card: true, ...props}))
      const [pluginRow, ...restRows] = wonderPlatformChatContextRows
      const tile = ([field, resource, headerLabel]) => select({items: mine(repo[resource]), multi: true,
        value: conversation?.[field] || [], onChange: value => setContext(field, value),
        icon: ui.resources[resource].icon, label: headerLabel, placeholder: '+ הוספה', testId: `${field}-selector-board`})
      return h('div:flex w-full max-w-2xl flex-col items-center gap-6 text-center', {},
        h('div', {}, h('h2:text-[16px] font-semibold text-[#0f0f10]', {}, 'הקשר השיחה'),
          h('p:mt-1 text-[12px] text-[#6b7280]', {}, 'כולם אופציונליים')),
        h('div:flex flex-col items-center gap-3', {},
          h('div:flex flex-wrap justify-center gap-3', {},
            select({items: mine(repo.agents), value: conversation?.agentId || '', onChange: selectAgent,
              icon: ui.resources.agents.icon, label: ui.labels.agents, placeholder: '+ הוספה', empty: 'ללא סוכן',
              testId: 'agent-selector-board'}),
            tile(pluginRow)),
          h('div:flex flex-wrap justify-center gap-3', {}, restRows.map(tile))))
    }
  })
})

ReactComp('wonderPlatformChatComposer', {
  impl: comp({
    hFunc: (ctx, {react: {h, useEffect, useRef, useState}}) => ({repo, conversation, message, setMessage, busy, send, model, setModel}) => {
      const ref = useRef(), submit = () => message.trim() && !busy && send()
      const [models, setModels] = useState([])
      const agent = repo.agents.find(item => item.id == conversation?.agentId)
      const llmflow = [agent?.backendConfig?.harness, agent?.backendConfig?.harness_type].includes('llmflow')
      useEffect(() => { globalThis.LLM_PROXY_URL && fetch(`${globalThis.LLM_PROXY_URL}/models`).then(response => response.ok && response.json())
        .then(catalog => setModels((catalog?.data || []).map(entry => `openai/${entry.id}`).filter(name => name != 'openai/*')), () => {}) }, [])
      useEffect(() => { if (ref.current) ref.current.style.height = 'auto', ref.current.style.height = `${Math.min(ref.current.scrollHeight, 144)}px` }, [message])
      return h('div:px-5 py-4', {}, h('div:mx-auto flex max-w-3xl items-end gap-2 rounded-[12px] ' +
        'border border-[#e8e8ea] bg-white p-2 shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition-colors ' +
        'focus-within:border-[#c9c9ce]', {},
      llmflow && h('input:w-40 shrink-0 rounded-[8px] border border-[#e8e8ea] px-2 py-1.5 text-[12px] text-[#2e2e2e] outline-none ' +
        'placeholder:text-[#6b7280]', {dir: 'ltr', list: 'wonder-llm-models', value: model, placeholder: 'model',
        'data-testid': 'model-selector', title: 'מודל השפה - ריק = ברירת המחדל של האתר', onInput: event => setModel(event.target.value)}),
      llmflow && h('datalist', {id: 'wonder-llm-models'}, models.map(name => h('option', {key: name, value: name}))),
      h('textarea:min-h-10 flex-1 resize-none px-2 py-1.5 text-[13px] outline-none placeholder:text-[#6b7280]', {ref, rows: 1,
        value: message, 'data-testid': 'chat-input', placeholder: 'שאלו כל דבר…',
        onInput: event => setMessage(event.target.value),
        onKeyDown: event => event.key == 'Enter' && !event.shiftKey && (event.preventDefault(), submit())}),
      h('button:grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[#0f0f10] text-white transition-opacity ' +
        'hover:opacity-85 disabled:opacity-25', {disabled: !message.trim() || busy, onClick: submit,
        'aria-label': 'שליחה'}, h('L:ArrowUp', {size: 15}))))
    }
  })
})

const wonderPlatformRunStatusLabel = {running: 'בהרצה…', completed: 'הושלם', failed: 'נכשל'}

ReactComp('wonderPlatformChat', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh}}) => props => {
      const {repo, conversation, message, setMessage, busy, send, selectAgent, setContext, model, setModel} = props
      const agent = repo.agents.find(item => item.id == conversation?.agentId)
      const opikUrl = conversation?.messages.filter(item => item.opikUrl).at(-1)?.opikUrl
      const statusText = status => wonderPlatformRunStatusLabel[String(status).toLowerCase()] || status || 'הושלם'
      const locked = conversation?.messages.length > 0
      const starterPrompts = !locked && agent && [agent.desc, `איך אתה יכול לעזור לי, ${agent.name}?`,
        `תן לי דוגמה לשאלה שאפשר לשאול את ${agent.name}`]
      const board = h('div:flex w-full max-w-lg flex-col items-center gap-6', {},
        hh(ctx, dsls.react['react-comp'].wonderPlatformChatContextBoard, {repo, conversation, selectAgent, setContext}))
      const suggestions = starterPrompts && h('div:mx-auto flex w-full max-w-3xl flex-wrap justify-center gap-1.5 px-5 pb-2', {},
        starterPrompts.map(prompt => h('button:max-w-full truncate rounded-full border border-[#e8e8ea] bg-white ' +
          'px-3 py-1.5 text-[11px] text-[#2e2e2e] transition-colors hover:border-[#d8d8dc] hover:bg-[#fafafa]',
          {key: prompt, onClick: () => setMessage(prompt)}, prompt)))
      const messages = h('div:mx-auto max-w-3xl px-5 py-8', {},
        conversation?.messages.map(item => item.role == 'user'
          ? h('div:mb-4 flex', {key: item.id, 'data-message-role': 'user'},
            h('div:max-w-[70ch] rounded-[14px] bg-[#f4f4f5] px-4 py-3 text-[13px] leading-[1.7] text-[#0f0f10]', {}, item.text))
          : h('div:mb-4 max-w-[70ch]', {key: item.id, 'data-message-role': 'agent'},
            h('div:mb-1.5 flex items-center gap-2', {},
              h('span:grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#f4f4f5] text-[10px] font-bold text-[#0f0f10]',
                {}, agent?.mark || 'AI'),
              h('span:text-[12px] font-medium text-[#2e2e2e]', {}, agent?.name || 'סוכן')),
            h('details:mb-3 rounded-[10px] border border-[#e8e8ea] bg-white', {},
              h('summary:cursor-pointer px-3.5 py-2.5 text-[12px] text-[#6b6b6f]', {},
                `מעקב הרצה · ${item.steps?.length || 0} שלבים · ${statusText(item.status)}`),
              h('div:border-t border-[#e8e8ea] p-3', {}, (item.steps || []).map((step, index) =>
                h('div:flex items-center gap-2 py-1 text-[12px]', {key: index},
                  h('span:rounded-md border border-[#e8e8ea] px-1.5 py-0.5 text-[10px] text-[#6b6b6f]', {}, step.kind),
                  step.title || step.name)))),
            hh(ctx, dsls.react['react-comp'].wonderPlatformAgentResult, {result: item, setMessage}))),
        busy && h('div:flex items-center gap-2 rounded-[10px] border border-[#e8e8ea] bg-white p-4 text-[13px] text-[#6b6b6f]', {},
          h('L:Loader2', {size: 15, className: 'animate-spin'}), 'הסוכן פועל…'))
      return h('main:h-screen min-w-0 flex-1 overflow-hidden pb-16 sm:pb-0', {}, h('div:flex h-full min-w-0', {},
        h('section:flex min-w-0 flex-1 flex-col', {},
          h('header:flex items-center justify-between border-b border-[#e8e8ea] bg-white px-6 py-3.5', {},
            h('div:min-w-0', {}, h('b:block truncate text-[14px] font-medium text-[#0f0f10]', {}, agent?.name || 'שיחה חופשית'),
              locked && h('span:text-[11px] text-[#6b7280]', {}, 'ההקשר נשמר בין הפניות')),
            opikUrl && h('a:shrink-0 text-[12px] text-[#2e2e2e]', {href: opikUrl}, 'ה-trace המלא ב-Opik ↗')),
          h(`div:flex-1 ${locked || busy ? 'overflow-y-auto overflow-x-hidden' : 'overflow-visible'}`, {},
            locked || busy ? messages
              : h('div:mx-auto flex max-w-3xl justify-center px-5 py-8 pt-14 sm:pt-20', {}, board)),
          suggestions,
          hh(ctx, dsls.react['react-comp'].wonderPlatformChatComposer, {repo, conversation, message, setMessage, busy, send, model, setModel})),
        hh(ctx, dsls.react['react-comp'].wonderPlatformChatContext, {repo, conversation})))
    }
  })
})
