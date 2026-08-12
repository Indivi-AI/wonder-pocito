import { dsls, jb, coreUtils } from '@jb6/core'
import '@jb6/common'
import '@wonder/ai/llm-flow-main-workflow.js'
import { fetchItemsFromLLMReactiveP } from '@wonder/ai/reactive-llm.js'
import '@wonder/db/db-drivers.js'
const { wfetch2 } = jb.wonderUtils
import '../Reports/index.js'

const {
  tgp: { TgpType },
  common: { Data, data: { runReport, verifiedReportsRegistry } },
  'llm-guide': { Booklet, Doclet, booklet: { booklet }, doclet: { dataComp }, guidance: { example, mustDo }, explanationPoint: { explanation, syntax } },
  workflow: { Workflow }
} = dsls
const FlowElem = TgpType('flow-elem', 'workflow'), MODEL = 'openai/gpt-5.5', REPORT = 'promotions'
const LOCAL_ROOT = globalThis.process?.versions?.node ? new URL('../../../../files/rooms/comaxDemo/usersRO/parquet/OEM_BI_4466', import.meta.url).pathname : 'files/rooms/comaxDemo/usersRO/parquet/OEM_BI_4466'
const DEPTHS = ['executiveSummary', 'summary', 'inDepth']
const roomFile = (roomUrl, reportId = REPORT, suffix = '-draft-patch') => `${String(roomUrl || 'signedRoom://comaxDemo/usersRW').replace(/\/$/, '')}/report-studio/${reportId}${suffix}.json`
const clone = x => structuredClone(coreUtils.resolveRefs(coreUtils.stripData(x)))
const uniq = xs => [...new Set(xs.filter(Boolean))]
const clip = (s, n = 2400) => (s = String(s || ''), s.length > n ? `${s.slice(0, n)}\n... clipped ${s.length - n} chars ...` : s)
const clipSql = (s, n = 10000) => (s = String(s || ''), s.length > n ? `${s.slice(0, n * .65)}\n... clipped ${s.length - n} chars ...\n${s.slice(-n * .35)}` : s)
const chatText = (xs, userMessage) => (coreUtils.asArray(xs).slice(-10).length ? coreUtils.asArray(xs).slice(-10) : [{ role: 'current user', text: userMessage }]).map(m => `${m.role || 'user'}: ${clip(m.text || m.content || '', 700)}`).join('\n')
const patchSummary = p => p?.ops?.length && JSON.stringify({ changes: p.changes, lastOps: coreUtils.asArray(p.ops).slice(-6).map(op => ({ op: op.op, path: op.path, section: op.section?.id })) }, null, 2)
const pathArr = p => (Array.isArray(p) ? p : String(p || '').replace(/\[(\d+)\]/g, '.$1').split('.')).filter(x => x !== '').map(x => /^\d+$/.test(x) ? +x : x)
const setAt = (o, p, v) => { const ks = pathArr(p), k = ks.pop(), base = ks.reduce((x, y) => x?.[y], o); if (base && k != null) base[k] = v }
const mergeAt = (o, p, v) => { const cur = pathArr(p).reduce((x, y) => x?.[y], o); cur && typeof cur == 'object' ? Object.assign(cur, v) : setAt(o, p, v) }
const replaceAt = (o, p, from, to) => setAt(o, p, String(pathArr(p).reduce((x, y) => x?.[y], o) || '').split(from).join(to))
const stripFullDataCte = sql => {
  const s = String(sql || ''), m = s.match(/^\s*WITH\s+full_data\s+AS\s*\(/i); if (!m) return s
  for (let i = m[0].length, d = 1, q = ''; i < s.length; i++) {
    const c = s[i]; if (q) { if (c == q && s[i + 1] == q) i++; else if (c == q) q = ''; continue }
    if (c == "'" || c == '"') q = c; else if (c == '(') d++; else if (c == ')' && !--d) return s.slice(i + 1).trim()
  }
  return s
}
const fixFullDataSql = sql => stripFullDataCte(sql).replace(/"window"|\bwindow\b/gi, m => m[0] == '"' ? m : '"window"')
const allSlots = r => [
  ...DEPTHS.map(d => ({ key: `report.${d}`, path: [d], title: r.title, slot: r[d] })),
  ...(r.sections || []).flatMap((s, i) => DEPTHS.map(d => ({ key: `${s.id}.${d}`, path: ['sections', i, d], sectionId: s.id, title: s.title, slot: s[d] })))
].filter(x => x.slot)
const sectionOf = (r, id) => (r.sections || []).find(s => s.id == id)
const normalizeSlot = slot => slot?.widget?.kind == 'kpi' && !Array.isArray(slot.widget.items) && (slot.widget.items = Object.values(slot.widget.items || {}))
const tableReactComp = (slot, title) => slot?.widget?.kind == 'table' && !slot.reactComp && (slot.reactComp = { cmpId: 'promotionReportPanel', area: 'נתח ביצועי מבצעים', mode: 'promotionCards', title: slot.widget.title || title, view: 'table', fields: coreUtils.asArray(slot.widget.columns).map(c => c.key || c) })
const normalizeSection = (r, s) => {
  const src = s.fullDataFrom && sectionOf(r, s.fullDataFrom)?.fullData
  s.fullData = s.fullData || (src && clone(src))
  DEPTHS.forEach(d => s[d] ||= clone(s.summary || s.executiveSummary || s.inDepth))
  DEPTHS.forEach(d => tableReactComp(s[d], s.title))
  s.fullData && DEPTHS.forEach(d => s[d]?.sql && /from\s+full_data\b/i.test(s[d].sql) && (s[d].sql = fixFullDataSql(s[d].sql)))
  delete s.fullDataFrom
  return s
}
export const applyReportPatch = (report, patch = {}) => {
  const r = clone(report)
  coreUtils.asArray(patch.ops).forEach(op => {
    if (op.op == 'set') setAt(r, op.path, op.value)
    else if (op.op == 'merge') mergeAt(r, op.path, op.value)
    else if (op.op == 'replace') replaceAt(r, op.path, op.from, op.to)
    else if (op.op == 'append') pathArr(op.path).reduce((x, y) => x?.[y], r)?.push?.(op.value)
    else if (op.op == 'appendSection') r.sections.push(normalizeSection(r, clone(op.section)))
  })
  allSlots(r).forEach(({ slot }) => normalizeSlot(slot))
  return r
}
const slotRefs = (report, selectedSlotKey, msg) => {
  const terms = String(msg || '').toLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) || []
  const score = s => (s.key == selectedSlotKey ? 99 : 0) + terms.filter(t => JSON.stringify([s.key, s.title, s.slot?.goal, s.slot?.sql, s.slot?.widget, s.slot?.reactComp]).toLowerCase().includes(t)).length
  return allSlots(report).map(s => ({ ...s, score: score(s) })).filter(s => s.score || /losing_promos|low_redemption|promotionCards/i.test(JSON.stringify(s.slot))).sort((a, b) => b.score - a.score).slice(0, 10)
}
const reportContext = (report, selectedSlotKey, msg) => ({
  reportId: report.id, title: report.title, selectedSlotKey,
  slots: slotRefs(report, selectedSlotKey, msg).map(s => ({ key: s.key, path: s.path, sectionId: s.sectionId, title: s.title, goal: s.slot.goal, fullDataColumns: s.sectionId && sectionOf(report, s.sectionId)?.fullData?.columns, focus: ['losing_promos','low_redemption_promos','stock_left'].map(t => (i => i == -1 ? '' : clip(s.slot.sql.slice(Math.max(0, i - 450), i + 450), 900))(String(s.slot.sql || '').indexOf(t))).filter(Boolean), reactComp: s.slot.reactComp, widget: s.slot.widget, sql: s.score > 10 ? clipSql(s.slot.sql) : clip(s.slot.sql, 2200) })),
  fullDataSources: (report.sections || []).filter(s => s.fullData).map(s => ({ sectionId: s.id, title: s.title, description: s.fullData.description, columns: s.fullData.columns, grain: s.fullData.grain }))
})
const parsePatch = text => { const s = String(text ?? '').trim(); if (!s.startsWith('{')) throw new Error(`report patch returned non-JSON object: ${s.slice(0, 100)}`); return JSON.parse(s) }
const directPatch = (report, selectedSlotKey, userMessage) => {
  const [, k = '', v] = String(userMessage || '').trim().match(/^(title|goal):\s*([\s\S]+)/i) || [], kind = k.toLowerCase(), value = v?.trim()
  const slot = allSlots(report).find(s => s.key == selectedSlotKey), secPath = slot?.sectionId && ['sections', report.sections.findIndex(s => s.id == slot.sectionId)]
  return kind == 'title' ? { summary: 'title', changes: ['title'], runSections: [slot?.sectionId].filter(Boolean), ops: [{ op: 'set', path: secPath ? [...secPath, 'title'] : ['title'], value }] }
    : kind == 'goal' && slot ? { summary: 'goal', changes: ['goal'], runSections: [slot.sectionId].filter(Boolean), ops: [{ op: 'set', path: [...slot.path, 'goal'], value }] } : null
}
const errorsOf = run => [run?.error, ...Object.values(run?.results?.sections || {}).map(s => s.rows?.error), ...Object.entries(run?.results || {}).filter(([k]) => k != 'sections').map(([, rows]) => rows?.error)].filter(Boolean)
const changedSections = (report, patch) => uniq(coreUtils.asArray(patch.ops).flatMap(op => op.op == 'appendSection' ? op.section?.id : [report.sections?.[pathArr(op.path)[1]]?.id]))
const authorPatch = async (ctx, { report, userMessage, selectedSlotKey, model, feedback, chatHistory, currentPatch }) => {
  const logger = ctx.vars.workflowLogger || ctx.vars.logger
  logger?.status('כותב עריכת דוח...')
  const intentText = chatText(chatHistory, userMessage)
  const prompt = [
    'You are the COMAX Reports Studio editor. Edit the verified report by returning ONLY the changed parts as a JSON patch, never a full report.',
    'Use CHAT_HISTORY and CURRENT_DRAFT_PATCH_SUMMARY to resolve references like it/that/again/reapply/אותו/זה/מחדש/בעצם. The latest user request is authoritative, but pronouns refer to the previous report edit.',
    'Patch ops: set {op,path,value}; merge {op,path,value}; replace {op,path,from,to}; appendSection {op,section}. Paths are arrays, e.g. ["sections",2,"summary","sql"].',
    'For long SQL, prefer replace ops with exact from/to substrings from slot.focus. Never return clipped SQL, ellipses, "...", or WITH promos AS (...).',
    'For a new section use appendSection with id,title,goal, fullDataFrom:<existing sectionId>, and summary/executiveSummary/inDepth slots. When fullDataFrom is set, slot SQL must be plain SELECT ... FROM full_data; never define WITH full_data or copy the source viewSql.',
    'Every appendSection slot must include a reactComp. For table sections use {cmpId:"promotionReportPanel", mode:"promotionCards", view:"table", title, fields:[column keys]}.',
    'For existing SQL edits, preserve the current CTE/FROM shape and change only the relevant expressions/filters. Do not invent WITH full_data unless the edited section fullDataColumns contain every column you use.',
    'Quote reserved SQL columns such as "window" when selecting from full_data.',
    'ReactComp slots use {cmpId:"promotionReportPanel", mode:"promotionCards", title, fields?, compactFields?}. Table widgets use {kind:"table", title, columns:[{key,label,format?}]}.',
    'Explicit title:/goal: commands target the selected section/report title or selected slot goal.',
    'For "ימים לגמר מלאי" add a SQL column named days_to_stockout and render it in promotionCards fields/compactFields.',
    'For losing_promos KPI edits, use replace ops on every slot whose SQL defines losing_promos: from "count(*) FILTER (WHERE is_active AND margin_ils <= 0) AS losing_promos" to "count(*) FILTER (WHERE is_active AND (margin_pct < 0 OR item_sales_lift_pct < 0)) AS losing_promos".',
    'For low-performing tables, append a new section with fullDataFrom set to a promo-level source and use SELECT ... FROM full_data.',
    feedback && `Previous validation failed:\n${feedback}`,
    chatHistory?.length && `CHAT_HISTORY:\n${intentText}`,
    currentPatch?.ops?.length && `CURRENT_DRAFT_PATCH_SUMMARY:\n${patchSummary(currentPatch)}`,
    `USER_REQUEST:\n${userMessage}`,
    `REPORT_CONTEXT:\n${JSON.stringify(reportContext(report, selectedSlotKey, intentText), null, 2)}`,
    'Return raw JSON object only, no XML/tags, markdown, or prose: {"summary":"...","changes":["..."],"runSections":["coverage"],"ops":[...]}'
  ].filter(Boolean).join('\n\n')
  const { responseText } = await fetchItemsFromLLMReactiveP({ ctx, model, goal: 'reports studio patch', prompt, instructions: '', maxTokens: 12000, temperature: 0, thinkingBudget: 0 })
  const patch = { reportId: report.id || REPORT, selectedSlotKey, userMessage, ...parsePatch(responseText) }
  logger?.info?.({ t: 'reportStudioPatch authored', changes: patch.changes }, { patch, responseText: clip(responseText, 5000) }, { ctx })
  return patch
}
const validate = async (ctx, { report, patch, reportId = REPORT, reportsRoot = ctx.vars.reportsRoot || LOCAL_ROOT }) => {
  const logger = ctx.vars.workflowLogger || ctx.vars.logger
  logger?.status('מריץ שאילתה ובודק תצוגה...')
  const sections = uniq([...coreUtils.asArray(patch.runSections), ...changedSections(report, patch), 'coverage']).filter(id => sectionOf(report, id))
  const runCtx = ctx.setVars({ db: 'local', dbHost: 'node', reportsRegistry: [report], reportsRoot, duckdbMatRun: `studio-${Date.now()}` })
  const run = await runReport.$runWithCtx(runCtx, { reportId, registry: [report], root: reportsRoot, scope: 'executiveSummary', sections, sectionDepth: 'summary' })
  const missingFields = (run?.reactComps || []).flatMap(c => uniq([...coreUtils.asArray(c.fields), ...coreUtils.asArray(c.compactFields)]).filter(f => c.rows?.length && !c.rows.some(r => f in r)).map(f => `${c.title}: ${f} is missing from final query rows; add it to the outermost SELECT`))
  const errors = [...errorsOf(run), ...missingFields], hasRows = run?.reactComps?.some(c => c.rows?.length) || run?.widgets?.some(w => w.rows?.length || w.data?.length || w.items?.length || w.series?.length)
  return { ok: !errors.length && !!hasRows, errors, sections, run, rows: run?.reactComps?.reduce((n, c) => n + (c.rows?.length || 0), 0) || 0 }
}
const baseReport = ctx => ctx.vars.currentReport || verifiedReportsRegistry.$runWithCtx(ctx).find(r => r.id == REPORT)
const editDraft = async (ctx, args) => {
  const { userMessage = ctx.vars.userMessage, chatHistory = ctx.vars.chatHistory, currentReport = baseReport(ctx), currentPatch = ctx.vars.currentPatch, reportId = REPORT, roomUrl = 'signedRoom://comaxDemo/usersRW', reportsRoot, selectedSlotKey = 'coverage.summary', saveDraft = true, model = MODEL } = args
  const id = currentReport?.id || reportId
  if (!currentReport) return { changes: [], error: `report ${reportId} not found` }
  let feedback = '', patch, report, validation
  for (let i = 0; i < 2; i++) {
    patch = { reportId: id, selectedSlotKey, userMessage, ...(directPatch(currentReport, selectedSlotKey, userMessage) || await authorPatch(ctx, { report: currentReport, userMessage, selectedSlotKey, model, feedback, chatHistory, currentPatch })) }
    report = applyReportPatch(currentReport, patch)
    validation = await validate(ctx, { report, patch, reportId: id, reportsRoot })
    if (validation.ok) break
    feedback = JSON.stringify({ errors: validation.errors, sections: validation.sections }).slice(0, 2500)
  }
  const savedPatch = currentPatch?.ops?.length ? { ...patch, changes: uniq([...(currentPatch.changes || []), ...(patch.changes || [])]), ops: [...currentPatch.ops, ...coreUtils.asArray(patch.ops)] } : patch
  const draftUrl = roomFile(roomUrl, id), draftWrite = saveDraft && validation.ok && await wfetch2(draftUrl, { method: 'PUT', body: savedPatch }, ctx).catch(e => ({ error: e.message }))
  return { report, patch: savedPatch, lastPatch: patch, changes: savedPatch?.changes || [], draftUrl, draftWrite: draftWrite && { ok: draftWrite.ok, status: draftWrite.status }, validation,
    text: validation.ok ? `נוצרה טיוטת דוח תקינה: ${(patch.changes || []).join(', ') || patch.summary || 'עודכן'}` : `הטיוטה נכשלה בבדיקה: ${(validation.errors || []).join(' | ') || 'אין תצוגה'}` }
}

Data('editReportStudioDraft', { params: [{ id: 'userMessage', as: 'string', mandatory: true }, { id: 'chatHistory' }, { id: 'currentReport' }, { id: 'currentPatch' }, { id: 'reportId', as: 'string', defaultValue: REPORT }, { id: 'roomUrl', as: 'string', defaultValue: 'signedRoom://comaxDemo/usersRW' }, { id: 'reportsRoot', as: 'string' }, { id: 'selectedSlotKey', as: 'string', defaultValue: 'coverage.summary' }, { id: 'saveDraft', as: 'boolean', defaultValue: true }, { id: 'model', as: 'string', defaultValue: MODEL }], impl: (ctx, {}, args) => editDraft(ctx, args) })
Data('publishReportStudioDraft', { params: [{ id: 'report' }, { id: 'reportId', as: 'string', defaultValue: REPORT }, { id: 'roomUrl', as: 'string', defaultValue: 'signedRoom://comaxDemo/usersRW' }], impl: async (ctx, {}, { report = baseReport(ctx), reportId, roomUrl }) => ({ ok: (await wfetch2(roomFile(roomUrl, reportId, ''), { method: 'PUT', body: report }, ctx)).ok, cleared: (await wfetch2(roomFile(roomUrl, reportId), { method: 'PUT', body: { reportId, ops: [], publishedAt: Date.now() } }, ctx)).ok }) })
Data('reportStudioDraftValid', { moreTypes: 'boolean<common>', impl: ctx => !!(ctx.data?.report && ctx.data?.validation?.ok && !ctx.data?.error) })
FlowElem('editReportStudioDraft', { params: [{ id: 'userMessage', as: 'string', dynamic: true, defaultValue: '%$userMessage%' }, { id: 'chatHistory' }, { id: 'reportId', as: 'string', defaultValue: REPORT }, { id: 'roomUrl', as: 'string', defaultValue: 'signedRoom://comaxDemo/usersRW' }, { id: 'reportsRoot', as: 'string' }, { id: 'selectedSlotKey', as: 'string', defaultValue: 'coverage.summary' }, { id: 'model', as: 'string', defaultValue: MODEL }], impl: async (ctx, {}, p) => ctx.setData(await editDraft(ctx, { ...p, userMessage: typeof p.userMessage == 'function' ? p.userMessage(ctx) : p.userMessage, currentReport: ctx.vars.currentReport })) })

Doclet('reportStudioEditing', { impl: `Reports Studio edits verified report JSON through a draft patch, not source files. title:/goal: commands deterministically edit the selected title/goal; the LLM must return a raw JSON object with only changed paths/sections. It may edit SQL, widgets, reactComp fields, titles and goals. Validate by running runReport; publish only on explicit save.` })
Doclet('editReportStudioDraftDataComponent', { impl: dataComp('editReportStudioDraft', { guidance: [example(`value: {$: 'data<common>editReportStudioDraft', userMessage: '%$userMessage%', selectedSlotKey: 'coverage.summary'}`), mustDo('Use this component for report-studio edits; it authors a patch, saves only edited parts, validates SQL + ReactComp output')], explaination: [explanation('Returns {report,patch,draftUrl,validation,text}; patch is the only saved draft artifact'), syntax("appendSection can add a section whose SQL selects FROM full_data and fullDataFrom points at an existing section")] }) })
Booklet('reportStudioEditing', { impl: booklet('reportStudioEditing,editReportStudioDraftDataComponent,runReportDataComponent,queryReportFullDataDataComponent,agentLoopComponents') })

Workflow('reports-studio-edit', {
  params: [{ id: 'model', as: 'string', defaultValue: MODEL }],
  impl: ({}, {}, { model }) => ({ async calcWorkflow(ctx0) {
    let ctx = await jb.workflowUtils.extendWithWorkflowVars(ctx0.setVars({ flowModel: model, categories: { reportsStudio: true, local: true } }))
    const logger = ctx.vars.workflowLogger
    let runRes
    try { runRes = await editDraft(ctx, { ...ctx.vars, model, currentReport: baseReport(ctx) }) }
    catch (error) { logger.error({ t: 'reports-studio-edit failed' }, {}, { ctx, error }); runRes = { error: error.stack || String(error) } }
    const result = { runRes, workflowTrace: logger.workflowTrace, ...logger.logsAndErrors() }
    const bigLogWUrl = await jb.wonderUtils.saveRoomBigLog2(ctx, `wf-report-studio-${Date.now()}`)
    return { ...result, ...(bigLogWUrl && { bigLogWUrl }) }
  } })
})
