// Baseline runner: the 3 home-screen questions through the CURRENT fast-report workflow.
// Usage: node scratchpad/run-home-baseline.mjs <outDir> [suffix]
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import dotenv from 'dotenv'
dotenv.config({ path: './cloud-services/express-server/.env.dev' })
register('./public/core/nodejs-importmap-loader.js', pathToFileURL('./'))
const { dsls, jb } = await import('@jb6/core')
await import('../Agents/fast-report-agent.js')
await import('../Agents/agents-repo.js')

const [outDir, suffix = 'baseline'] = process.argv.slice(2)
const LOCAL_ROOT = new URL('./files/rooms/comaxDemo/usersRO/parquet/OEM_BI_4466', pathToFileURL('./')).pathname
const llmProxyUrl = 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy'
const QUESTIONS = [
  ['q1-sales-month', 'מכירות החודש ביחס לחודש שעבר'],
  ['q2-promotions', 'נתח ביצועי מבצעים והמלץ על פעולות'],
  ['q3-inventory', 'נתח מלאי שכמעט אוזל ועודפי מלאי לפי קצב מכירות']
]
const widgetSig = w => ({ kind: w.kind, title: w.title, slot: w.slot, reportId: w.reportId })
const compSig = c => ({ cmpId: c.cmpId, mode: c.mode, title: c.title, slot: c.slot, reportId: c.reportId, rows: c.rows?.length })
const slotsSig = s => Array.isArray(s) ? s.map(slotsSig) : s && { reportId: s.reportId, scope: s.scope,
  sections: s.sections, fastSections: s.fastSections, sectionDepth: s.sectionDepth, params: s.params,
  slice: s.slice?.sql || null, rows: s.rows, hideWidgets: s.hideWidgets }

for (const [id, userMessage] of QUESTIONS) {
  const start = Date.now(), partials = []
  const onPartial = p => partials.push({ ms: Date.now() - start, widgets: (p.widgets || []).map(widgetSig), reactComps: (p.reactComps || []).map(compSig) })
  jb.coreUtils.eventEmitter.on('fastReportPartial', onPartial)
  let d
  try {
    const vars = { db: 'local', userId: 'BaselineRunner', roomId: 'comaxDemo', userMessage, doNotWriteLogs: true,
      isLocalHost: false, llmProxyUrl, reportsRoot: LOCAL_ROOT, categories: { reportsAnalytics: true, reports: true, local: true } }
    const wfCtx = await jb.workflowUtils.extendWithWorkflowVars(new jb.coreUtils.Ctx().setVars(vars))
    d = await dsls.workflow.workflow['fast-report'].$runWithCtx(wfCtx).calcWorkflow(wfCtx)
  } catch (e) { d = { runRes: { error: e.stack } } } finally { jb.coreUtils.eventEmitter.off('fastReportPartial', onPartial) }
  const rr = typeof d.runRes == 'object' && d.runRes || {}
  const out = { suffix, userMessage, durMs: Date.now() - start,
    customAnswer: d.customAnswer || false, reportRoute: d.reportRoute,
    reportSlots: slotsSig(d.reportSlots), reportExecution: d.reportExecution,
    reportsUsed: rr.reportsUsed, verified: rr.verified, verificationWarning: rr.verificationWarning || null,
    widgets: (rr.widgets || []).map(widgetSig), reactComps: (rr.reactComps || []).map(compSig),
    rowsCount: rr.rows?.length, partials,
    text: rr.text, longText: rr.longText || null,
    error: rr.error || null, workflowErrors: (d.workflowErrors || []).map(e => e.t || e.error || e).slice(0, 5) }
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(`${outDir}/${id}.${suffix}.json`, JSON.stringify(out, null, 2))
  console.log(`== ${id} done in ${out.durMs}ms: route=${JSON.stringify(out.reportSlots?.reportId || out.reportRoute?.reportId)} widgets=${out.widgets.length} comps=${out.reactComps.length} err=${out.error?.slice?.(0, 100) || 'none'}`)
}
process.exit(0)
