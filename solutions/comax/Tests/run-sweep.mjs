// Manual question sweep over the refactored fast-report. Usage: node admin/comax/Demo/Tests/run-sweep.mjs <outDir>
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import dotenv from 'dotenv'
dotenv.config({ path: './cloud-services/express-server/.env.dev' })
register('./public/core/nodejs-importmap-loader.js', pathToFileURL('./'))
const { dsls, jb } = await import('../Agents/fast-report-agent.js').then(() => import('@jb6/core'))
const outDir = process.argv[2] || 'specs/reports-baseline/sweep'
const LOCAL_ROOT = new URL('./files/rooms/comaxDemo/usersRO/parquet/OEM_BI_4466', pathToFileURL('./')).pathname
const llmProxyUrl = 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy'
const QUESTIONS = [
  ['s1-extrema', 'מה המבצע הכי מצליח והכי כושל?'],
  ['s2-rerun', 'אילו מבצעים כדאי להריץ שוב?'],
  ['s3-profitable', 'תראה לי מבצעים רווחיים'],
  ['s4-branch-daily', 'אילו סניפים בלטו היום לחיוב ולשלילה?'],
  ['s5-passover', 'כמה טוב היו המכירות בפסח?']
]
fs.mkdirSync(outDir, { recursive: true })
for (const [id, userMessage] of QUESTIONS) {
  const start = Date.now()
  let d
  try {
    const vars = { db: 'local', userId: 'SweepRunner', roomId: 'comaxDemo', userMessage, doNotWriteLogs: true,
      isLocalHost: false, llmProxyUrl, reportsRoot: LOCAL_ROOT, categories: { reportsAnalytics: true, reports: true, local: true } }
    const wfCtx = await jb.workflowUtils.extendWithWorkflowVars(new jb.coreUtils.Ctx().setVars(vars))
    d = await dsls.workflow.workflow['fast-report'].$runWithCtx(wfCtx).calcWorkflow(wfCtx)
  } catch (e) { d = { runRes: { error: e.stack } } }
  const rr = typeof d.runRes == 'object' && d.runRes || {}
  const out = { userMessage, durMs: Date.now() - start, customAnswer: d.customAnswer || false,
    reportSlots: Array.isArray(d.reportSlots) ? d.reportSlots.map(s => ({reportId: s.reportId, sections: s.sections}))
      : d.reportSlots && {reportId: d.reportSlots.reportId, sections: d.reportSlots.sections,
        params: d.reportSlots.params, slice: d.reportSlots.slice?.sql || null},
    text: rr.text, rowsCount: rr.rows?.length, verified: rr.verified,
    widgets: (rr.widgets || []).map(w => `${w.kind}:${w.slot || w.title}`),
    reactComps: (rr.reactComps || []).map(c => `${c.cmpId}:${c.title || c.slot}`),
    error: rr.error?.slice?.(0, 500) || null, workflowErrors: (d.workflowErrors || []).map(e => e.t || e.error || e).slice(0, 5) }
  fs.writeFileSync(`${outDir}/${id}.json`, JSON.stringify(out, null, 2))
  console.log(`== ${id} (${out.durMs}ms) route=${JSON.stringify(out.reportSlots?.reportId || out.reportSlots?.map?.(s=>s.reportId) || 'custom')} rows=${out.rowsCount} err=${out.error?.slice(0,80) || 'none'}`)
}
process.exit(0)
