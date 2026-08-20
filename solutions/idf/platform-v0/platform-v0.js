import { dsls } from '@jb6/core'
import '@jb6/common'
import '@jb6/react'

const {
  common: { Data },
  react: { ReactComp, 'react-comp': { comp } }
} = dsls
Data('platformMarketplaceApi', {
  params: [
    {id: 'method', as: 'string', defaultValue: 'GET'},
    {id: 'path', as: 'string', mandatory: true},
    {id: 'body', asIs: true},
    {id: 'baseUrl', as: 'string', defaultValue: 'http://localhost:7777'}
  ],
  impl: async ({}, {}, {method, path, body, baseUrl}) => {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method, headers: body ? {'Content-Type': 'application/json'} : {},
      ...(body && {body: JSON.stringify(body)})
    })
    if (!response.ok) throw new Error(`Marketplace ${response.status}: ${await response.text()}`)
    return response.json()
  }
})
Data('platformAgnoRun', {
  params: [
    {id: 'message', as: 'string', mandatory: true},
    {id: 'agentId', as: 'string', defaultValue: 'proof-of-existence-analyst'},
    {id: 'sessionId', as: 'string', mandatory: true},
    {id: 'baseUrl', as: 'string', defaultValue: 'http://localhost:7777'},
    {id: 'token', as: 'string'}
  ],
  impl: async ({}, {}, {message, agentId, sessionId, baseUrl, token}) => {
    const body = new FormData()
    Object.entries({message, session_id: sessionId, user_id: 'platform-v0', stream: 'false'})
      .forEach(([key, value]) => body.append(key, value))
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/agents/${encodeURIComponent(agentId)}/runs`, {
      method: 'POST', headers: token ? {Authorization: `Bearer ${token}`} : {}, body
    })
    if (!res.ok) throw new Error(`Agno ${res.status}: ${await res.text()}`)
    const run = await res.json()
    return {content: typeof run.content == 'string' ? run.content : JSON.stringify(run.content),
      runId: run.run_id, status: run.status}
  }
})
ReactComp('PlatformV0', {
  impl: comp({
    hFunc: (ctx, {react: {h, useEffect, useRef, useState}}) => () => {
      const [view, setView] = useState('plugins'), [catalog, setCatalog] = useState(null), [search, setSearch] = useState('')
      const [draft, setDraft] = useState(null), [messages, setMessages] = useState([
        {role: 'user', text: 'בדוק הוכחת קיום עבור ספק "אורלייט תעשיות" לפי מסמכי הרכש של Q2, ' +
          'וסמן פערים מול הדוח הקודם.'},
        {role: 'assistant', text: 'נמצאו 14 מסמכי רכש רלוונטיים, מהם 12 עם התאמה מלאה. שני פערים דורשים בדיקה ידנית.',
          reports: ['procurement-gaps', 'supplier-evidence']}
      ])
      const [chatInput, setChatInput] = useState(''), [agentBusy, setAgentBusy] = useState(false)
      const [selectedAgent, setSelectedAgent] = useState('proof-of-existence-analyst')
      const [evals, setEvals] = useState([
        {name: 'דיוק התאמת מסמכים', score: 94, runs: 24}, {name: 'שלמות תשובה', score: 89, runs: 18},
        {name: 'שימוש נכון בכלים', score: 97, runs: 31}
      ])
      const sessionId = useRef(globalThis.crypto?.randomUUID?.() || `session-${Date.now()}`)
      const serverUrl = ctx.vars.platformUrl || new URLSearchParams(location.search).get('platformUrl')
        || 'http://localhost:7777'
      const labels = {
        plugins: ['פלאגינים', 'פלאגין אורז מיומנויות, כלים וסאב-אייג׳נטים ליחידה אחת.', 'פלאגין חדש', 'PlugZap'],
        skills: ['מיומנויות', 'הוראות וידע ממוקד שהסוכנים יכולים לטעון לפי הצורך.', 'מיומנות חדשה', 'BookOpenText'],
        tools: ['כלים', 'חיבורים ופעולות שהסוכנים יכולים להפעיל בזמן ריצה.', 'כלי חדש', 'Wrench'],
        reports: ['דוחות מאומתים', 'שאילתות פרמטריות עם תצוגה עשירה ומוגדרת מראש.', 'דוח מאומת חדש', 'BadgeCheck'],
        agents: ['סאב-אייג׳נטים', 'סוכנים ממוקדים שניתן להאציל אליהם משימות.', 'סאב-אייג׳נט חדש', 'Network']
      }
      const marketplaceRequest = (method, resource, name, body) => dsls.common.data.platformMarketplaceApi.$runWithCtx(ctx, {
        method, path: `/api/v1/${resource}${name ? `/${encodeURIComponent(name)}` : ''}`, body, baseUrl: serverUrl
      })
      const reloadMarketplace = () => Promise.all(['plugins', 'skills', 'tools', 'reports', 'agents'].map(async resource => [resource, await marketplaceRequest('GET', resource)]))
        .then(rows => setCatalog(Object.fromEntries(rows)))
      useEffect(() => { reloadMarketplace() }, [])
      const saveResource = async () => {
        const {resource, originalName, ...body} = draft
        await marketplaceRequest(originalName ? 'PUT' : 'POST', resource, originalName, body)
        setDraft(null)
        reloadMarketplace()
      }
      const deleteResource = async (resource, name) => {
        await marketplaceRequest('DELETE', resource, name)
        reloadMarketplace()
      }
      const sendMessage = async () => {
        const message = chatInput.trim()
        if (!message || agentBusy) return
        setMessages(xs => [...xs, {role: 'user', text: message}])
        setChatInput('')
        setAgentBusy(true)
        try {
          const run = await dsls.common.data.platformAgnoRun.$runWithCtx(ctx, {
            message, agentId: selectedAgent, sessionId: sessionId.current,
            baseUrl: serverUrl,
            token: ctx.vars.agnoToken
          })
          const reportIds = [...new Set([...run.content.matchAll(/\[\[report:([\w-]+)\]\]/g)].map(([, id]) => id))]
          const content = run.content.replace(/\s*\[\[report:[\w-]+\]\]/g, '').trim()
          setMessages(xs => [...xs, {role: 'assistant', text: content, reports: reportIds, runId: run.runId}])
        } catch (error) {
          setMessages(xs => [...xs, {role: 'assistant', error: true, text: `Agno: ${error.message || error}`}])
        } finally {
          setAgentBusy(false)
        }
      }
      const nav = (id, icon, title) => h(
        'button:w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ' +
          (view == id ? 'bg-[#e7f1eb] text-[#204d36] font-semibold' : 'text-[#66706b] hover:bg-gray-50'),
        {key: id, onClick: () => (setView(id), setSearch('')), 'aria-label': title}, h(`L:${icon}`, {size: 17}), title)
      const sidebar = h('aside:fixed top-0 right-0 bottom-0 z-40 hidden sm:flex w-[210px] flex-col border-l border-[#e4e8e5] bg-white p-4', {},
        h('div:flex items-center gap-3 px-2 pb-6 font-bold text-[#202724]', {},
          h('span:grid h-8 w-8 place-items-center rounded-xl bg-[#2f6b4b] text-white', {},
            h('L:ShieldCheck', {size: 17})), 'פלאגין סטודיו'),
        nav('plugins', 'PlugZap', 'פלאגינים'), nav('chat', 'MessageCircle', 'צ׳אט'), nav('evaluation', 'SquareCheckBig', 'אבלואציה'),
        h('div:px-3 pb-2 pt-7 text-xs text-[#a4aaa7]', {}, 'ספרייה'),
        nav('skills', 'BookOpenText', 'מיומנויות'), nav('tools', 'Wrench', 'כלים'),
        nav('reports', 'BadgeCheck', 'דוחות מאומתים'), nav('agents', 'Network', 'סאב-אייג׳נטים'))
      const mobileNav = h('nav:fixed bottom-0 left-0 right-0 z-50 flex border-t border-[#e4e8e5] bg-white sm:hidden', {},
        [['plugins', 'PlugZap', 'פלאגינים'], ['chat', 'MessageCircle', 'צ׳אט'], ['skills', 'BookOpenText', 'מיומנויות'],
          ['tools', 'Wrench', 'כלים'], ['reports', 'BadgeCheck', 'דוחות']].map(([id, icon, title]) => h(
          `button:flex-1 py-2 text-[10px] ${view == id ? 'text-[#2f6b4b]' : 'text-gray-500'}`,
          {key: id, onClick: () => setView(id)}, h(`L:${icon}`, {size: 18, className: 'mx-auto mb-0.5'}), title)))
      const resourceCard = (item, resource) => h('article:rounded-2xl border border-[#e4e8e5] bg-white p-5 shadow-[0_1px_2px_rgba(30,50,40,.04)]', {
        key: item.name, onClick: () => setDraft({...item, resource, originalName: item.name})
      }, h('div:flex items-start gap-3', {},
        h('div:grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#dbe7df] bg-[#edf6f0] text-sm font-bold text-[#285a40]', {},
          item.title?.slice(0, 2)),
        h('div:min-w-0 flex-1', {}, h('div:flex items-center gap-2', {},
          h('h3:truncate text-base font-bold text-[#202724]', {}, item.title),
          h('span:rounded border border-[#e6e9e7] px-1.5 py-0.5 text-[10px] text-[#9aa19d]', {}, item.version || 'V0'),
          resource == 'reports' && h('span:flex items-center gap-1 text-[10px] font-semibold text-[#2f6b4b]', {},
            h('L:BadgeCheck', {size: 12}), 'מאומת')),
          h('div:mt-0.5 text-xs text-[#a1a7a4]', {}, resource == 'plugins' ? 'פלאגין' : labels[resource]?.[0])),
        h('button:rounded-lg p-1.5 text-[#a5aaa7] hover:bg-red-50 hover:text-red-600', {
          onClick: e => (e.stopPropagation(), deleteResource(resource, item.name)), 'aria-label': `מחיקת ${item.title}`
        }, h('L:Trash2', {size: 15}), h('span:sr-only', {}, `מחיקת ${item.title}`))),
        h('p:mt-4 min-h-10 text-sm leading-6 text-[#68706c]', {}, item.description),
        resource == 'plugins' && h('div:mt-4 flex flex-wrap gap-2 text-[11px] text-[#59615d]', {},
          h('span:rounded-full bg-[#f1f3f2] px-2.5 py-1', {}, `${item.skills || 0} מיומנויות`),
          h('span:rounded-full bg-[#f1f3f2] px-2.5 py-1', {}, `${item.tools || 0} כלים ישירים`),
          h('span:rounded-full border border-[#dfe4e1] px-2.5 py-1', {}, `${item.agents || 0} סאב-אייג׳נטים`)),
        h('div:mt-4 border-t border-dashed border-[#edf0ee] pt-3 text-[11px] text-[#a3a9a6]', {}, `עודכן ${item.updated || 'עכשיו'}`))
      const verifiedReportCard = report => report && h(
        'section:mt-4 overflow-hidden rounded-xl border border-[#cfe0d5] bg-[#f8fbf9]', {key: report.name},
        h('div:flex items-start justify-between border-b border-[#e1ebe4] bg-[#edf6f0] px-4 py-3', {},
          h('div', {}, h('div:flex items-center gap-2 text-sm font-bold text-[#294f3b]', {},
            h('L:BadgeCheck', {size: 16}), report.title),
            h('div:mt-1 text-[11px] text-[#728078]', {}, 'Verified Report · תצוגה ושאילתה מוגדרות מראש')),
          h('span:rounded border border-[#c8d9ce] px-1.5 py-0.5 text-[10px] text-[#52705e]', {}, report.version)),
        h('p:px-4 pt-3 text-xs leading-5 text-[#66706b]', {}, report.description),
        h('div:grid grid-cols-3 gap-2 p-4', {}, report.metrics.map(metric =>
          h('div:rounded-lg border border-[#e0e8e3] bg-white p-2 text-center', {key: metric.label},
            h('div:text-lg font-bold text-[#2f6b4b]', {}, metric.value),
            h('div:text-[10px] text-[#8b948f]', {}, metric.label)))),
        h('div:flex items-center justify-between border-t border-[#e3ebe6] px-4 py-2.5 text-[10px] text-[#7d8982]', {},
          'פרמטרים · ' + report.parameters.join(', '),
          h('span:flex items-center gap-1 font-semibold text-[#356349]', {}, 'פתיחת הדוח', h('L:ArrowUpLeft', {size: 12}))))
      const library = () => {
        const [title, subtitle, createLabel, icon] = labels[view], items = (catalog?.[view] || [])
          .filter(x => !search || `${x.title} ${x.description}`.includes(search))
        return h('main:min-h-screen overflow-x-hidden px-5 pb-24 pt-8 sm:mr-[210px] sm:px-10 sm:pb-10', {},
          h('div:mx-auto max-w-6xl', {},
            h('div:flex flex-wrap items-start justify-between gap-4', {},
              h('div', {}, h('div:flex items-center gap-2', {}, h(`L:${icon}`, {size: 21, className: 'text-[#2f6b4b]'}),
                h('h1:text-2xl font-bold text-[#202724]', {}, title)), h('p:mt-2 text-sm text-[#929995]', {}, subtitle)),
              h('button:inline-flex items-center gap-2 rounded-xl bg-[#2f6b4b] px-4 py-2.5 text-sm font-semibold text-white shadow-sm', {
                onClick: () => setDraft({resource: view, title: '', name: '', description: '', version: 'V0'})
              }, h('L:Plus', {size: 16}), createLabel)),
            h('div:mt-7 flex items-center gap-4', {},
              h('div:relative max-w-md flex-1', {}, h('L:Search', {size: 16, className: 'absolute right-3 top-3 text-[#a1a7a4]'}),
                h('input:w-full rounded-xl border border-[#e2e6e3] bg-white py-2.5 pl-3 pr-9 text-sm outline-none focus:border-[#7fa18c]', {
                  value: search, placeholder: 'חיפוש לפי כותרת…', onInput: e => setSearch(e.target.value)})),
              h('span:text-xs text-[#9da39f]', {}, `${items.length} פריטים`)),
            !catalog ? h('div:grid min-h-80 place-items-center text-[#8b938e]', {}, h('L:Loader2', {size: 22, className: 'animate-spin'}))
              : h('div:mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3', {}, items.map(item => resourceCard(item, view)))))
      }
      const chat = () => h('main:min-h-screen overflow-x-hidden pb-28 sm:ml-[250px] sm:mr-[210px]', {},
        h('aside:fixed bottom-0 left-0 top-0 hidden w-[250px] border-r border-[#e4e8e5] bg-white p-4 sm:block', {},
          h('button:w-full rounded-xl border border-[#cfe0d5] bg-[#edf6f0] py-2.5 text-sm font-semibold text-[#315e46]', {}, '＋ שיחה חדשה'),
          h('div:pb-3 pt-6 text-xs text-[#a1a7a4]', {}, 'היסטוריית שיחות'),
          ['אורלייט תעשיות — Q2', 'פערים בדוח תפעול 28/7', 'אפיון שירות החזרות',
            'תיק ספק — נובה לוגיסטיקה'].map((x, i) =>
            h(`button:w-full rounded-xl px-3 py-3 text-right text-sm ${i ? 'hover:bg-gray-50' : 'bg-[#e7f1eb]'}`, {key: x}, x))),
        h('header:sticky top-0 z-20 flex items-center justify-between border-b border-[#e5e8e6] bg-white/95 px-6 py-4 backdrop-blur', {},
          h('div:flex items-center gap-3', {}, h('span:grid h-8 w-8 place-items-center rounded-xl bg-[#e6f2ea] text-xs font-bold text-[#285a40]', {}, 'אנ'),
            h('b:text-sm text-[#202724]', {}, catalog?.plugins?.find(x => x.name == selectedAgent)?.title || 'אנליסט הוכחת קיום')),
          h('a:text-xs text-[#37664e]', {href: '#'}, 'ה-trace המלא ב-Opik ↗')),
        h('div:mx-auto max-w-3xl px-5 py-8', {},
          h('div:mb-5 text-center text-xs text-[#a3a9a6]', {}, 'שיחה מתמשכת · ההקשר נשמר בין הפניות'),
          messages.map((m, i) => h(`div:mb-4 ${m.role == 'user' ? 'mr-auto max-w-[88%] rounded-2xl border border-[#cee2d6] bg-[#eaf4ed] p-4'
            : `rounded-2xl border bg-white p-5 shadow-sm ${m.error ? 'border-red-200 text-red-700' : 'border-[#e3e7e4]'}`}`, {key: i},
            m.role == 'assistant' && h('div:mb-3 text-xs font-semibold text-[#3c5548]', {}, 'תשובת הסוכן'),
            h('div:whitespace-pre-wrap text-sm leading-7', {}, m.text),
            m.reports?.map(id => verifiedReportCard(catalog?.reports?.find(report => report.name == id))),
            m.runId && h('div:mt-3 text-[10px] text-[#a3a9a6]', {}, `Agno run · ${m.runId}`))),
          agentBusy && h('div:flex items-center gap-2 rounded-2xl border border-[#e3e7e4] bg-white p-5 text-sm text-[#758078]', {},
            h('L:Loader2', {size: 16, className: 'animate-spin'}), 'Agno מריץ את הסוכן…')),
        h('div:fixed bottom-0 left-0 right-0 border-t border-[#e3e7e4] bg-[#f8f9f8]/95 p-4 backdrop-blur sm:left-[250px] sm:right-[210px]', {},
          h('div:mx-auto max-w-3xl rounded-2xl border border-[#e0e5e2] bg-white p-2 shadow-sm', {},
            h('div:flex items-end gap-2', {},
              h('textarea:min-h-12 flex-1 resize-none px-3 py-2 text-sm outline-none', {
                value: chatInput, placeholder: 'כתוב הודעה לפלאגין…', onInput: e => setChatInput(e.target.value),
                onKeyDown: e => e.key == 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}),
              h('button:grid h-10 w-10 place-items-center rounded-full bg-[#2f6b4b] text-white disabled:opacity-40', {
                disabled: !chatInput.trim() || agentBusy, onClick: sendMessage, 'aria-label': 'שליחה'}, h('L:ArrowUp', {size: 16}))),
            h('select:mt-1 rounded-lg border-0 bg-[#f4f6f5] px-2 py-1 text-xs text-[#5f6863]', {
              value: selectedAgent, onChange: e => setSelectedAgent(e.target.value)
            }, (catalog?.plugins || []).map(x => h('option', {key: x.name, value: x.name}, x.title))))))
      const evaluation = () => h('main:min-h-screen overflow-x-hidden px-5 pb-24 pt-8 sm:mr-[210px] sm:px-10', {},
        h('div:mx-auto max-w-5xl', {}, h('div:flex items-start justify-between gap-4', {},
          h('div', {}, h('h1:text-2xl font-bold text-[#202724]', {}, 'אבלואציה'),
            h('p:mt-2 text-sm text-[#929995]', {}, 'מדדי איכות והרצות בדיקה לפלאגינים הפעילים.')),
          h('button:rounded-xl bg-[#2f6b4b] px-4 py-2.5 text-sm font-semibold text-white', {
            onClick: () => setEvals(xs => xs.map(x => ({...x, runs: x.runs + 1})))
          }, 'הרצת אבלואציה')),
          h('div:mt-7 grid grid-cols-1 gap-4 md:grid-cols-3', {}, evals.map(x => h(
            'article:rounded-2xl border border-[#e3e7e4] bg-white p-5', {key: x.name},
            h('div:text-sm font-semibold text-[#323a36]', {}, x.name),
            h('div:mt-4 text-4xl font-bold text-[#2f6b4b]', {}, `${x.score}%`),
            h('div:mt-3 h-2 overflow-hidden rounded-full bg-[#eef1ef]', {},
              h('div:h-full rounded-full bg-[#5d8a70]', {style: {width: `${x.score}%`}})),
            h('div:mt-3 text-xs text-[#9da39f]', {}, `${x.runs} הרצות`))))))
      const modal = draft && h('div:fixed inset-0 z-[70] grid place-items-center bg-black/25 p-4', {
        onMouseDown: e => e.target == e.currentTarget && setDraft(null)
      }, h('section:w-full max-w-lg rounded-2xl border border-[#dfe5e1] bg-white p-6 shadow-2xl', {},
          h('div:flex items-center justify-between', {}, h('h2:text-lg font-bold text-[#202724]', {},
            draft.originalName ? 'עריכת פריט' : labels[draft.resource]?.[2]),
            h('button:rounded-lg p-2 hover:bg-gray-100', {onClick: () => setDraft(null), 'aria-label': 'סגירה'}, h('L:X', {size: 17}))),
          h('label:mt-5 block text-xs font-semibold text-[#69726d]', {}, 'כותרת',
            h('input:mt-2 w-full rounded-xl border border-[#dfe5e1] px-3 py-2.5 text-sm outline-none focus:border-[#789b86]', {
              value: draft.title, onInput: e => setDraft({...draft, title: e.target.value})})),
          h('label:mt-4 block text-xs font-semibold text-[#69726d]', {}, 'מזהה',
            h('input:mt-2 w-full rounded-xl border border-[#dfe5e1] px-3 py-2.5 text-left text-sm outline-none', {
              dir: 'ltr', value: draft.name, disabled: !!draft.originalName, onInput: e => setDraft({...draft, name: e.target.value})})),
          h('label:mt-4 block text-xs font-semibold text-[#69726d]', {}, 'תיאור',
            h('textarea:mt-2 min-h-24 w-full resize-none rounded-xl border border-[#dfe5e1] px-3 py-2.5 text-sm outline-none', {
              value: draft.description, onInput: e => setDraft({...draft, description: e.target.value})})),
          draft.resource == 'skills' && h('label:mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl ' +
            'border border-dashed border-[#b9ccc0] p-4 text-sm text-[#42634f]', {},
            h('L:Upload', {size: 16}), draft.fileName || 'העלאת SKILL.md או ZIP',
            h('input:hidden', {type: 'file', accept: '.md,.zip,.json,.yaml,.yml', onChange: async e => {
              const file = e.target.files?.[0]
              if (file) {
                const content = await file.text()
                setDraft(x => ({...x, title: x.title || file.name.replace(/\.[^.]+$/, ''),
                  name: x.name || file.name.replace(/\W+/g, '-').toLowerCase(), fileName: file.name, content}))
              }
            }})),
          h('div:mt-6 flex justify-end gap-2', {},
            h('button:rounded-xl px-4 py-2 text-sm text-[#68716c] hover:bg-gray-100', {onClick: () => setDraft(null)}, 'ביטול'),
            h('button:rounded-xl bg-[#2f6b4b] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40', {
              disabled: !draft.title?.trim() || !draft.name?.trim(), onClick: saveResource
            }, draft.originalName ? 'שמירת שינויים' : 'יצירה ושמירה'))))
      return h('div:min-h-screen overflow-x-hidden bg-[#f7f8f6] text-[#202724]', {
        dir: 'rtl', lang: 'he', style: {fontFamily: 'Arial, system-ui, sans-serif',
          backgroundImage: 'radial-gradient(#dfe4e1 0.7px, transparent 0.7px)', backgroundSize: '18px 18px'}
      }, sidebar, view == 'chat' ? chat() : view == 'evaluation' ? evaluation() : library(), mobileNav, modal)
    }
  })
})
