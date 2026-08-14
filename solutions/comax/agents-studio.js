import { dsls, coreUtils, jb } from '@jb6/core'
import '@jb6/common'
import '@jb6/react'
import '@jb6/testing'
import '@jb6/react/tests/react-testers.js'
import { fetchItemsFromLLMReactiveP } from '@wonder/ai/reactive-llm.js'
import './Agents/reports-template-agent.js'
import './nostalgy/structured-reports-template-agent.js'
import './Agents/fast-report-agent.js'
import { comaxAgentPanelTemplateFlow } from './Agents/parallel-agent.js'
import { verifiedAnalyticsTemplateFlow } from './Agents/agentic-agents.js'

const {
  react: { ReactComp, 'react-comp': { comp }, 'ui-action': { waitForText } },
  test: { Test, test: { reactTest } },
  common: { boolean: { contains } }
} = dsls
const LLM_PROXY = 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy', MODEL = 'groq/openai/gpt-oss-20b'
const arr = v => Array.isArray(v) ? v : v == null ? [] : [v], clone = x => JSON.parse(JSON.stringify(x))
const slot = o => ({ reportId: 'promotions', scope: 'summary', sections: ['coverage'], sectionDepth: 'summary', rows: { source: 'scope', scope: 'summary' }, entities: [{ entity: 'branch', query: 'אשדוד', varName: 'selectedBranches', mode: 'single' }], summaryEvaluation: 'Summarize grounded promotion performance rows in Hebrew.', narrative: '{0.branch} leads with {0.net:₪}', sqlDescription: 'promotions / coverage', widgets: [{ kind: 'bar', title: 'Promotion impact', nameCol: 'branch', valueCol: 'net', valueFormat: '₪' }], followUps: [{ label: 'Drill by branch', question: 'פרק לפי סניף' }], ...o })
const factories = () => [
  ['comaxAgentPanel', 'Parallel Panel', 'From parallel-agent.js: two agents branch, then a judge selects.', comaxAgentPanelTemplateFlow],
  ['verifiedAnalytics', 'Verified Loop', 'From agentic-agents.js: retrieval agent retries through an until loop.', verifiedAnalyticsTemplateFlow],
  ['structuredReportsTemplateAnalytics', 'Structured Reports', 'Template flow with structured section summaries.', () => jb.workflowUtils.structuredReportsTemplateFlow(slot({ slice: { sectionId: 'coverage', sql: 'SELECT branch, round(sum(net)) net FROM full_data GROUP BY 1 ORDER BY 2 DESC LIMIT 20' } }))],
  ['fast-report', 'Fast Report', 'Widgets first, heavier sections and final summary later.', () => jb.workflowUtils.fastReportFlow(slot({ sections: ['profitable-promotions'], slice: null, params: {} }))]
].map(([id, label, desc, flow]) => ({ id, label, desc, profile: coreUtils.tgpProfileToJson(flow()) }))
const short = x => String(x || '').split('>').pop()
const val = e => short(e.value?.$) || short(e.body?.$) || short(e.verifier?.$) || e.value?.workflow || e.varName || e.reportId || ''
const seg = k => /^\d+$/.test(k) ? +k : k, get = (p, id) => id.split('.').reduce((o, k) => o?.[seg(k)], p)
const setAt = (p, id, f) => { const n = clone(p), ks = id.split('.').map(seg), last = ks.pop(), parent = ks.reduce((o, k) => o[k], n); parent[last] = f(parent[last]); return n }
const nodeOf = (e, id, seq) => ({ profile: e, id, seq, type: short(e?.$), title: e?.goal || val(e), status: e?.status || '', value: val(e), varName: e?.varName, reportId: e?.value?.reportId, sectionId: e?.value?.sectionId, rowsVar: e?.rowsVar, widgets: arr(e?.widgets).length })
const nested = (e, id, seq) => [
  ...arr(e?.value?.branches).flatMap((x, i) => flatten(x, `${id}.value.branches.${i}`, `${seq}.${i + 1}`)),
  ...arr(e?.body?.elems).flatMap((x, i) => flatten(x, `${id}.body.elems.${i}`, `${seq}.${i + 1}`))
]
const flatten = (e, id = '', seq = '') => short(e?.$) == 'flow' ? arr(e.elems).flatMap((x, i) => flatten(x, `${id}${id ? '.' : ''}elems.${i}`, `${seq}${seq ? '.' : ''}${i + 1}`)) : [nodeOf(e, id, seq), ...nested(e, id, seq)]
const meta = t => ({ asHumanFeedback: ['MessageSquare', 'bg-emerald-50 text-emerald-700 border-emerald-200'], setCtxData: ['Database', 'bg-blue-50 text-blue-700 border-blue-200'], setCtxVar: ['Variable', 'bg-violet-50 text-violet-700 border-violet-200'], finalAnswerFromReport: ['Send', 'bg-teal-50 text-teal-700 border-teal-200'], until: ['RefreshCcw', 'bg-amber-50 text-amber-700 border-amber-200'] }[t] || ['Workflow', 'bg-slate-50 text-slate-700 border-slate-200'])
const extractJson = s => JSON.parse((String(s || '').match(/\{[\s\S]*\}/) || ['{}'])[0])
const askStudio = (ctx, agent, node, text) => fetchItemsFromLLMReactiveP({ ctx: ctx.setVars({ llmProxyUrl: LLM_PROXY, categories: { agentsStudio: true }, roomId: 'comaxDemo' }), model: MODEL, goal: 'agents studio edit', maxTokens: 1200, temperature: 0, thinkingBudget: 0, prompt: JSON.stringify({ user: text, agent: agent.label, selectedNode: node, flow: agent.nodes }), instructions: 'Return strict JSON only: {"reply":"short","patch":{"nodeId":"selected id only","goal":"optional","status":"optional"}}. Patch only when the user asks to change the selected node.' }).then(r => extractJson(r.responseText))

ReactComp('comaxAgentsStudio', { impl: comp({ hFunc: (ctx, { react: { h, useMemo, useState, useEffect } }) => () => {
  const agents = useMemo(factories, []), [agentId, setAgentId] = useState(agents[0]?.id), [profiles, setProfiles] = useState(() => Object.fromEntries(agents.map(a => [a.id, a.profile]))), [sel, setSel] = useState(''), [pane, setPane] = useState(false), [draft, setDraft] = useState(''), [busy, setBusy] = useState(false)
  const agent = agents.find(a => a.id == agentId) || agents[0], profile = profiles[agent.id] || agent.profile, nodes = flatten(profile), node = nodes.find(n => n.id == sel) || nodes[0]
  const [msgs, setMsgs] = useState([{ role: 'assistant', text: 'Pick a templated flow, then select a node to inspect or edit its profile.' }]), [nodeJson, setNodeJson] = useState(''), [jsonError, setJsonError] = useState(''), nodeSig = JSON.stringify(node?.profile || {})
  useEffect(() => (setSel(flatten(profile)[0]?.id), setPane(false)), [agentId])
  useEffect(() => (setNodeJson(JSON.stringify(node?.profile || {}, null, 2)), setJsonError('')), [agentId, node?.id, nodeSig])
  const pick = n => (setSel(n.id), setPane(true))
  const edit = p => setProfiles(ps => ({ ...ps, [agent.id]: setAt(profile, node.id, n => ({ ...n, ...p })) }))
  const applyJson = () => { try { const p = JSON.parse(nodeJson); setProfiles(ps => ({ ...ps, [agent.id]: setAt(profile, node.id, () => p) })); setJsonError('') } catch (e) { setJsonError(e.message) } }
  const reset = () => setProfiles(ps => ({ ...ps, [agent.id]: setAt(profile, node.id, () => clone(get(agent.profile, node.id))) }))
  const send = async () => { const text = draft.trim(); if (!text || busy) return; setDraft(''); setMsgs(m => [...m, { role: 'user', text }]); setBusy(true)
    try { const res = await askStudio(ctx, { ...agent, nodes }, node, text); res.patch?.nodeId && edit(Object.fromEntries(['goal', 'status'].map(k => [k, res.patch[k]]).filter(([, v]) => v))); setMsgs(m => [...m, { role: 'assistant', text: res.reply || 'Applied.' }]) }
    catch (e) { setMsgs(m => [...m, { role: 'assistant', text: `LLM edit failed: ${e.message || e}` }]) } finally { setBusy(false) } }
  const chip = a => h(`button:h-8 px-2.5 rounded-md text-xs font-bold border ${a.id == agent.id ? 'bg-[#61A60E] text-white border-[#61A60E]' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`, { key: a.id, onClick: () => setAgentId(a.id) }, a.label)
  const tags = n => [n.type, n.value, n.varName, n.reportId, n.sectionId, n.rowsVar, n.widgets && `${n.widgets} widgets`].filter(Boolean).slice(0, 4)
  const Mini = (e, id, seq) => { const n = nodeOf(e, id, seq); return h('button:min-w-32 max-w-40 text-left rounded border border-slate-200 bg-white/80 px-2 py-1.5 hover:border-[#61A60E]', { key: id, onClick: ev => (ev.stopPropagation(), pick(n)) }, h('div:text-[11px] font-bold text-slate-900 truncate', {}, n.title), h('div:text-[10px] text-slate-500 truncate', {}, tags(n).join(' · '))) }
  const Branches = n => arr(n.profile?.value?.branches).length ? h('div:mt-2 space-y-1', {}, arr(n.profile.value.branches).map((b, i) => h('div:rounded border border-slate-200 bg-slate-50/80 p-1.5', { key: i }, h('div:text-[10px] font-bold uppercase text-slate-400 mb-1', {}, `branch ${i + 1}`), Mini(b, `${n.id}.value.branches.${i}`, `${n.seq}.${i + 1}`)))) : null
  const Loop = n => arr(n.profile?.body?.elems).length ? h('div:mt-2 rounded border border-amber-200 bg-amber-50/60 p-1.5', {}, h('div:flex items-center gap-1 text-[10px] font-bold uppercase text-amber-700 mb-1', {}, h('L:RefreshCcw', { size: 10 }), `loop body · max ${n.profile.maxRuns || 1}`), h('div:flex flex-wrap gap-1.5', {}, arr(n.profile.body.elems).map((e, i) => Mini(e, `${n.id}.body.elems.${i}`, `${n.seq}.${i + 1}`)))) : null
  const Card = n => { const [icon, cls] = meta(n.type), on = n.id == node?.id
    return h('div:flex items-start gap-2', { key: n.id }, h(`div:w-44 min-h-20 cursor-pointer text-left rounded-md border bg-white p-2 shadow-sm transition-all ${on && pane ? 'border-[#61A60E] ring-2 ring-[#61A60E]/20' : 'border-slate-200 hover:border-slate-300'}`, { onClick: () => pick(n), role: 'button', tabIndex: 0 },
      h('div:flex items-start gap-2', {}, h(`span:w-7 h-7 shrink-0 rounded border flex items-center justify-center ${cls}`, {}, h(`L:${icon}`, { size: 14 })), h('div:min-w-0 flex-1', {}, h('div:flex justify-between gap-1', {}, h('div:text-xs font-black text-slate-950 truncate', {}, n.title), h('span:text-[10px] text-slate-400', {}, `#${n.seq}`)), h('div:mt-1 flex flex-wrap gap-1', {}, tags(n).map((x, i) => h('span:rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[10px] text-slate-600', { key: `${x}-${i}` }, x))), n.status && h('div:mt-1 text-[10px] text-slate-500 truncate', {}, n.status))), Branches(n), Loop(n)), h('div:hidden lg:flex h-20 items-center text-slate-300', {}, h('L:ArrowRight', { size: 16 }))) }
  const Flow = (p, id = '', seq = '') => h('div:flex flex-row flex-wrap lg:flex-nowrap items-start gap-2 min-w-0', {}, arr(p.elems).map((e, i) => Card(nodeOf(e, `${id}${id ? '.' : ''}elems.${i}`, `${seq}${seq ? '.' : ''}${i + 1}`))))
  return h('main:min-h-screen overflow-x-hidden bg-[#F6F7F8] text-slate-900 grid grid-cols-1 lg:h-screen lg:overflow-hidden lg:grid-cols-[330px_1fr]', {},
    h('aside:lg:min-h-0 flex flex-col bg-white border-b lg:border-b-0 lg:border-r border-slate-200', {}, h('div:p-4 border-b border-slate-200', {}, h('div:flex items-center gap-2', {}, h('L:Bot', { size: 18, color: '#61A60E' }), h('h1:text-lg font-black', {}, 'Agents Studio')), h('div:text-xs text-slate-500 mt-1', {}, `${agents.length} pre-runtime template flows`)), h('div:max-h-56 lg:max-h-none lg:flex-1 lg:min-h-0 overflow-y-auto p-3 space-y-2', {}, msgs.map((m, i) => h(`div:max-w-[92%] rounded-md px-3 py-2 text-sm leading-6 ${m.role == 'user' ? 'ml-auto bg-[#61A60E] text-white' : 'bg-slate-100 text-slate-700'}`, { key: i }, m.text))), h('div:p-3 border-t border-slate-200 space-y-2', {}, h('textarea:w-full h-20 rounded-md border border-slate-200 p-2 text-sm resize-none outline-none focus:border-[#61A60E]', { value: draft, onInput: e => setDraft(e.target.value), placeholder: 'Ask for a flow edit...', onKeyDown: e => e.key == 'Enter' && !e.shiftKey && (e.preventDefault(), send()) }), h('button:w-full h-9 rounded-md bg-[#61A60E] text-white text-sm font-bold disabled:opacity-50 inline-flex items-center justify-center gap-2', { disabled: busy || !draft.trim(), onClick: send }, h(`L:${busy ? 'LoaderCircle' : 'Wand2'}`, { size: 14 }), busy ? 'Thinking' : 'Ask AI'))),
    h('section:min-w-0 flex flex-col lg:min-h-0 lg:overflow-hidden', {}, h('header:bg-white/95 border-b border-slate-200 px-4 py-3 space-y-3', {}, h('div:flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3', {}, h('div:min-w-0', {}, h('div:text-xl font-black truncate', {}, agent.label), h('div:text-sm text-slate-500 truncate', {}, agent.desc)), h('div:flex flex-wrap gap-2', {}, agents.map(chip)))), h('div:grid grid-cols-1 lg:flex-1 lg:min-h-0 lg:overflow-hidden', { className: pane ? 'xl:grid-cols-[1fr_320px]' : '' },
      h('div:min-w-0 lg:min-h-0 lg:overflow-auto p-4 sm:p-5', {}, h('div:rounded-md border border-slate-200 bg-white/50 p-3 sm:p-4 min-w-0', { style: { backgroundImage: 'linear-gradient(#e2e8f0 1px,transparent 1px),linear-gradient(90deg,#e2e8f0 1px,transparent 1px)', backgroundSize: '24px 24px' } }, Flow(profile))),
      pane && h('aside:border-t xl:border-t-0 xl:border-l border-slate-200 bg-white xl:overflow-y-auto p-4 space-y-3', {}, h('div:flex items-start justify-between gap-2', {}, h('div:min-w-0', {}, h('div:text-xs font-bold uppercase text-slate-400', {}, 'Selected node'), h('div:text-lg font-black truncate', {}, node?.title)), h('button:w-8 h-8 rounded-md border border-slate-200 hover:bg-slate-50 flex items-center justify-center', { onClick: () => setPane(false), 'aria-label': 'Close selected node' }, h('L:X', { size: 15 }))), h('label:block text-xs font-bold text-slate-500 space-y-1', {}, 'Goal', h('input:w-full h-8 rounded-md border border-slate-200 px-2 text-sm font-normal text-slate-900 outline-none focus:border-[#61A60E]', { value: node?.title || '', onInput: e => edit({ goal: e.target.value }) })), h('label:block text-xs font-bold text-slate-500 space-y-1', {}, 'Status', h('input:w-full h-8 rounded-md border border-slate-200 px-2 text-sm font-normal text-slate-900 outline-none focus:border-[#61A60E]', { value: node?.status || '', onInput: e => edit({ status: e.target.value }) })), h('div:grid grid-cols-2 gap-2 text-xs', {}, [['Type', node?.type], ['Value', node?.value], ['Var', node?.varName], ['Rows', node?.rowsVar]].map(([k, v]) => h('div:rounded-md border border-slate-200 p-2 min-w-0', { key: k }, h('div:text-slate-400 font-bold', {}, k), h('div:text-slate-700 truncate mt-1', {}, v || '-')))), h('label:block text-xs font-bold text-slate-500 space-y-1', {}, 'Profile JSON', h('textarea:w-full h-44 rounded-md border border-slate-200 p-2 font-mono text-xs font-normal text-slate-900 outline-none focus:border-[#61A60E]', { value: nodeJson, onInput: e => setNodeJson(e.target.value), spellCheck: false })), jsonError && h('div:text-xs text-red-600', {}, jsonError), h('div:flex flex-wrap gap-2', {}, h('button:h-8 px-3 rounded-md bg-[#61A60E] text-white text-sm font-bold inline-flex items-center gap-2', { onClick: applyJson }, h('L:Check', { size: 14 }), 'Apply JSON'), h('button:h-8 px-3 rounded-md border border-slate-200 text-sm font-bold text-slate-600 inline-flex items-center gap-2 hover:bg-slate-50', { onClick: reset }, h('L:RotateCcw', { size: 14 }), 'Reset node'))))))
} }) })

Test('comaxDemo.agentsStudio', { impl: reactTest({
  testedComp: dsls.react['react-comp'].comaxAgentsStudio(),
  expectedResult: contains('Agents Studio', 'Parallel Panel', 'Verified Loop', 'Judge and pick the better answer'),
  userActions: waitForText('Verified Loop'),
  timeout: 5000,
  logger: 'uiLogger'
}) })
