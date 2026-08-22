// Two-turn conversation runner: turn 1 answers a question, turn 2 follows up with the structured
// turn record in chatHistory (the Shabbat coverage case). Usage: node admin/comax/Demo/Tests/run-conversation.mjs <outFile>
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import dotenv from 'dotenv'
dotenv.config({ path: './cloud-services/express-server/.env.dev' })
register('./public/core/nodejs-importmap-loader.js', pathToFileURL('./'))
const { dsls, jb } = await import('@jb6/core')
await import('../Agents/fast-report-agent.js')

const outFile = process.argv[2] || 'specs/reports-baseline/conversation.json'
const LOCAL_ROOT = new URL('./files/rooms/comaxDemo/usersRO/parquet/OEM_BI_4466', pathToFileURL('./')).pathname
const llmProxyUrl = 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy'
const TURN1 = 'מה היו סך המכירות אתמול בכל הסניפים, ואיך זה מול אותו יום בשבוע שעבר?'
const TURN2 = 'מה עם יתר הסניפים?'

const run = async (userMessage, chatHistory) => {
  const vars = { db: 'local', userId: 'ConversationRunner', roomId: 'comaxDemo', userMessage, doNotWriteLogs: true,
    isLocalHost: false, llmProxyUrl, reportsRoot: LOCAL_ROOT, accumulatedContext: { chatHistory },
    categories: { reportsAnalytics: true, reports: true, local: true } }
  const wfCtx = await jb.workflowUtils.extendWithWorkflowVars(new jb.coreUtils.Ctx().setVars(vars))
  return dsls.ai.workflow['fast-report'].$runWithCtx(wfCtx).calcWorkflow(wfCtx)
}
const sig = d => {
  const rr = typeof d.runRes == 'object' && d.runRes || {}
  return { reportSlots: Array.isArray(d.reportSlots) ? d.reportSlots.map(s => s.reportId) : d.reportSlots && {
      reportId: d.reportSlots.reportId, sections: d.reportSlots.sections, params: d.reportSlots.params,
      slice: d.reportSlots.slice?.sql || null },
    directResponse: d.directResponse || null, customAnswer: d.customAnswer || false,
    text: rr.text, longText: rr.longText || null, rowsCount: rr.rows?.length,
    verified: rr.verified, widgets: (rr.widgets || []).map(w => `${w.kind}:${w.slot || w.title}`),
    turnRecord: d.turnRecord && { plan: d.turnRecord.plan, rows: d.turnRecord.rowsShown?.length,
      entitiesShown: d.turnRecord.entitiesShown, caveats: d.turnRecord.caveats, verified: d.turnRecord.verified },
    error: rr.error || null, workflowErrors: (d.workflowErrors || []).map(e => e.t || e.error || e).slice(0, 5) }
}

const first = await run(TURN1, [])
console.log('== turn1:', JSON.stringify(sig(first).reportSlots), 'rows:', sig(first).rowsCount)
const t = first.turnRecord || {}
const chatHistory = [
  { role: 'user', content: TURN1 },
  { role: 'assistant', content: first.runRes?.text || '', plan: t.plan, entitiesShown: t.entitiesShown,
    verified: t.verified !== false, rowsShown: (t.rowsShown || []).slice(0, 20), caveats: t.caveats || [] }
]
const second = await run(TURN2, chatHistory)
console.log('== turn2 mode:', second.directResponse ? 'directResponse' : second.customAnswer ? 'customAnswer' : 'reports')
fs.writeFileSync(outFile, JSON.stringify({ turn1: sig(first), historySent: chatHistory, turn2: sig(second) }, null, 2))
console.log('saved', outFile)
process.exit(0)
