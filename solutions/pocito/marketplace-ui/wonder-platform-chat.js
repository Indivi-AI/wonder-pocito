import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-kit.js'
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
    hFunc: (ctx, {react: {h, hh}}) => ({repo, conversation}) => {
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
        className: depth > 0 ? 'ms-3.5 border-s border-[var(--wp-border)] ps-3.5' : ''},
      h('div:flex items-center gap-2.5 py-1.5', {},
        hh(ctx, dsls.react['react-comp'].wonderPlatformMark, {icon: node.item.icon || ui.resources[node.resource]?.icon, text: node.item.mark, size: 'sm'}),
        h('span:min-w-0 flex-1', {},
          h(`span:block truncate text-[var(--wp-ink)] ${depth == 0 ? 'text-[13px] font-semibold' : 'text-[12px] font-medium'}`,
            {}, node.item.name),
          h('span:block text-[11px] text-[var(--wp-ink-4)]', {}, ui.labels[node.resource]))),
      node.children.length > 0 && h('div:mt-0.5', {}, node.children.map(child => renderNode(child, depth + 1))))
      return h('aside:hidden w-[280px] shrink-0 flex-col border-e border-[var(--wp-border)] ' +
        'bg-[var(--wp-surface)] lg:flex', {},
      h('div:flex h-[64px] shrink-0 items-center border-b border-[var(--wp-border)] px-4 text-[11px] ' +
        'font-medium text-[var(--wp-ink-4)]', {}, 'הקשר השיחה'),
      h('div:wp-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4', {},
        rootNodes.length > 0
          ? h('div', {}, rootNodes.map(node => renderNode(node, 0)))
          : h('p:text-[12px] leading-[1.5] text-[var(--wp-ink-3)]', {}, 'לא נבחרו חיבורים עדיין.'),
        conversation?.messages?.length > 0 && h('p:mt-5 border-t border-[var(--wp-border)] pt-4 text-[12px] ' +
          'leading-[1.5] text-[var(--wp-ink-4)]', {}, 'ההקשר ננעל כשהשיחה התחילה. פתחו שיחה חדשה כדי לשנות אותו.')))
    }
  })
})

ReactComp('wonderPlatformChatContextBoard', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh}}) => ({repo, conversation, selectAgent, setContext, setMessage}) => {
      const ui = dsls.common.data.wonderPlatformUi.$run(), {classes} = ui
      const mine = list => list.filter(item => (item.owner || 'me') != 'global')
      const agent = repo.agents.find(item => item.id == conversation?.agentId)
      const prompts = agent ? [`מה אתה יודע לעשות, ${agent.name}?`, 'הראה לי דוגמה מלאה', 'אילו מקורות מידע עומדים לרשותך?']
        : ['מה אפשר לעשות כאן?', 'עזרו לי לבחור סוכן מתאים', 'איך בונים סוכן חדש?']
      const select = props => h('div', {key: props.testId},
        hh(ctx, dsls.react['react-comp'].wonderPlatformSearchableSelect, {card: true, ...props}))
      const [pluginRow, ...restRows] = wonderPlatformChatContextRows
      const tile = ([field, resource, headerLabel]) => select({items: mine(repo[resource]), multi: true,
        value: conversation?.[field] || [], onChange: value => setContext(field, value),
        icon: ui.resources[resource].icon, label: headerLabel, testId: `${field}-selector-board`})
      return h('div:w-full max-w-[760px]', {},
        h('div:mb-5', {}, h(`h2:${classes.h2}`, {}, 'במה נתחיל?'),
          h(`p:${classes.help}`, {}, 'בחרו סוכן וחיבורים שילוו את השיחה, או פשוט כתבו שאלה. הכול אופציונלי.')),
        select({items: mine(repo.agents), value: conversation?.agentId || '', onChange: selectAgent, full: true,
          icon: ui.resources.agents.icon, label: ui.labels.agents, empty: 'ללא סוכן', testId: 'agent-selector-board'}),
        h('div:mt-5', {},
          h('div:pb-2 text-[11px] font-medium text-[var(--wp-ink-4)]', {}, 'חיבורים נוספים'),
          h('div:flex gap-2', {}, tile(pluginRow), ...restRows.map(tile))),
        h('div:mt-6 border-t border-[var(--wp-border)] pt-4', {},
          h('div:pb-2 text-[11px] font-medium text-[var(--wp-ink-4)]', {}, 'התחלות מהירות'),
          h('div:grid gap-px overflow-hidden rounded-[8px] border border-[var(--wp-border)] bg-[var(--wp-border)]', {},
            prompts.map(prompt => h('button:flex items-center gap-2 bg-[var(--wp-surface)] px-3.5 py-2.5 text-start ' +
              'text-[13px] text-[var(--wp-ink-2)] transition-colors hover:bg-[var(--wp-surface-2)] ' +
              'hover:text-[var(--wp-ink)]', {key: prompt, onClick: () => setMessage(prompt)},
            h('span:min-w-0 flex-1 truncate', {}, prompt),
            h('L:ArrowLeft', {size: 14, className: 'shrink-0 text-[var(--wp-ink-4)]'}))))))
    }
  })
})

ReactComp('wonderPlatformChatComposer', {
  impl: comp({
    hFunc: (ctx, {react: {h, useEffect, useRef, useState}}) =>
      ({repo, conversation, message, setMessage, busy, send, model, setModel}) => {
        const {classes} = dsls.common.data.wonderPlatformUi.$run()
        const ref = useRef(), submit = () => message.trim() && !busy && send()
        const [models, setModels] = useState([])
        const agent = repo.agents.find(item => item.id == conversation?.agentId)
        const llmflow = [agent?.backendConfig?.harness, agent?.backendConfig?.harness_type].includes('llmflow')
        useEffect(() => { globalThis.LLM_PROXY_URL && fetch(`${globalThis.LLM_PROXY_URL}/models`)
          .then(response => response.ok && response.json())
          .then(catalog => setModels((catalog?.data || []).map(entry => `openai/${entry.id}`)
            .filter(name => name != 'openai/*')), () => {}) }, [])
        useEffect(() => { const el = ref.current; if (!el) return
          el.style.height = 'auto'
          if (message) el.style.height = `${Math.min(el.scrollHeight, 176)}px` }, [message])
        return h('div:px-5 pb-5 pt-2', {}, h('div:mx-auto w-full max-w-[760px] rounded-[12px] border ' +
          'border-[var(--wp-border)] bg-[var(--wp-surface)] shadow-[var(--wp-sh-1)] transition-colors ' +
          'focus-within:border-[var(--wp-border-strong)]', {},
        h('textarea:wp-noring wp-scroll block max-h-44 w-full resize-none bg-transparent px-3.5 pb-2 pt-3 text-[14px] ' +
          'leading-[1.65] text-[var(--wp-ink)] outline-none placeholder:text-[var(--wp-ink-4)]',
        {ref, rows: 1, value: message, 'data-testid': 'chat-input', placeholder: 'שאלו כל דבר…',
          onInput: event => setMessage(event.target.value),
          onKeyDown: event => event.key == 'Enter' && !event.shiftKey && (event.preventDefault(), submit())}),
        h('div:flex items-center justify-between gap-2 px-2.5 pb-2.5', {},
          h('div:flex min-w-0 items-center gap-2', {},
            llmflow && h(`input:${classes.fieldBare} w-44`, {dir: 'ltr', list: 'wonder-llm-models',
              value: model, placeholder: 'model', 'data-testid': 'model-selector',
              title: 'מודל השפה - ריק = ברירת המחדל של האתר', onInput: event => setModel(event.target.value)}),
            llmflow && h('datalist', {id: 'wonder-llm-models'}, models.map(name => h('option', {key: name, value: name})))),
          h('div:flex shrink-0 items-center gap-2.5', {},
            h('span:hidden text-[11px] text-[var(--wp-ink-4)] sm:block', {}, 'Enter לשליחה · Shift+Enter לשורה חדשה'),
            h('button:grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[var(--wp-ink)] text-white ' +
            'transition-colors hover:bg-[var(--wp-ink-hover)] disabled:bg-[var(--wp-border-strong)]',
          {disabled: !message.trim() || busy, onClick: submit, 'aria-label': 'שליחה'},
          h(`L:${busy ? 'Loader2' : 'ArrowUp'}`, {size: 15, className: busy ? 'animate-spin' : ''}))))))
      }
  })
})

const wonderPlatformRunStatusLabel = {running: 'בהרצה…', completed: 'הושלם', failed: 'נכשל'}

ReactComp('wonderPlatformChat', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh}}) => props => {
      const {repo, conversation, message, setMessage, busy, send, selectAgent, setContext, model, setModel} = props
      const {classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const agent = repo.agents.find(item => item.id == conversation?.agentId)
      const opikUrl = conversation?.messages.filter(item => item.opikUrl).at(-1)?.opikUrl
      const statusText = status => wonderPlatformRunStatusLabel[String(status).toLowerCase()] || status || 'הושלם'
      const locked = conversation?.messages.length > 0
      const trace = item => (item.steps || []).length > 0 && h('details:mt-3 rounded-[8px] border ' +
        'border-[var(--wp-border)] bg-[var(--wp-surface-2)]', {},
      h('summary:cursor-pointer list-none px-3 py-2 text-[12px] text-[var(--wp-ink-3)]', {},
        `מעקב הרצה · ${item.steps.length} שלבים · ${statusText(item.status)}`),
      h('div:border-t border-[var(--wp-border)] p-3', {}, item.steps.map((step, index) =>
        h('div:flex items-center gap-2 py-1 text-[12px] text-[var(--wp-ink-2)]', {key: index},
          h(`span:${classes.chip}`, {}, step.kind), step.title || step.name))))
      const messages = h('div:mx-auto w-full max-w-[760px] px-5 py-8', {},
        conversation?.messages.map(item => item.role == 'user'
          ? h('div:mb-6 flex', {key: item.id, 'data-message-role': 'user'},
            h('div:max-w-[85%] rounded-[12px] bg-[var(--wp-surface-3)] px-3.5 py-2.5 text-[14px] ' +
              'leading-[1.7] text-[var(--wp-ink)]', {}, item.text))
          : h('div:mb-8', {key: item.id, 'data-message-role': 'agent'},
            h('div:mb-2 flex items-center gap-2', {},
              hh(ctx, dsls.react['react-comp'].wonderPlatformMark, {icon: agent?.icon, text: agent?.mark || 'AI', size: 'sm'}),
              h('span:text-[12px] font-medium text-[var(--wp-ink-2)]', {}, agent?.name || 'סוכן')),
            hh(ctx, dsls.react['react-comp'].wonderPlatformAgentResult, {result: item, setMessage}), trace(item))),
        busy && h('div:flex items-center gap-2 text-[13px] text-[var(--wp-ink-3)]', {},
          h('L:Loader2', {size: 15, className: 'animate-spin'}), 'הסוכן פועל…'))
      return h('main:flex h-screen min-w-0 flex-1 bg-[var(--wp-surface)] pb-16 sm:pb-0', {},
        h('section:flex min-w-0 flex-1 flex-col', {},
          hh(ctx, dsls.react['react-comp'].wonderPlatformDetailHeader,
            {title: agent?.name || conversation?.title || 'שיחה חופשית',
            subtitle: locked ? 'ההקשר ננעל עם תחילת השיחה' : '', icon: agent?.icon, mark: agent?.mark || 'AI',
            actions: opikUrl && h(`a:${classes.button}`, {href: opikUrl, target: '_blank', rel: 'noreferrer'},
              h('L:ExternalLink', {size: 14}), 'Opik')}),
          h('div:wp-scroll flex-1 overflow-y-auto overflow-x-hidden', {},
            locked || busy ? messages : h('div:mx-auto flex min-h-full w-full max-w-[800px] items-center px-5 py-8', {},
              hh(ctx, dsls.react['react-comp'].wonderPlatformChatContextBoard,
                {repo, conversation, selectAgent, setContext, setMessage}))),
          hh(ctx, dsls.react['react-comp'].wonderPlatformChatComposer,
            {repo, conversation, message, setMessage, busy, send, model, setModel})),
        hh(ctx, dsls.react['react-comp'].wonderPlatformChatContext, {repo, conversation}))
    }
  })
})
