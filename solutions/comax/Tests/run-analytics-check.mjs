// Ad-hoc check: dairy-promos question through basicAnalytics after inlining dimension values. Usage: node admin/comax/demo/Tests/run-analytics-check.mjs
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import dotenv from 'dotenv'
dotenv.config({ path: './cloud-services/express-server/.env.dev' })
register('./public/core/nodejs-importmap-loader.js', pathToFileURL('./'))
const { dsls, jb } = await import('@jb6/core')
await import('../Agents/analytics-agent.js')

const userMessage = process.argv[2] || 'איזה מבצעים יש היום במוצרי החלב?'
const vars = { db: 'local', userId: 'AnalyticsChecker', roomId: 'comaxDemo', userMessage, doNotWriteLogs: true,
  llmProxyUrl: 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy',
  accumulatedContext: { chatHistory: [] }, categories: { analytics: true, local: true } }
const wfCtx = await jb.workflowUtils.extendWithWorkflowVars(new jb.coreUtils.Ctx().setVars(vars))
const res = await dsls.workflow.workflow.basicAnalytics.$runWithCtx(wfCtx).calcWorkflow(wfCtx)
const rr = res.runRes || {}
console.log(JSON.stringify({ text: rr.text, longText: rr.longText, rows: (rr.rows || []).slice(0, 5), rowsCount: rr.rows?.length,
  widgets: (rr.widgets || []).map(w => w.kind + ':' + w.title), sql: rr.sql, narrative: rr.narrative,
  followUps: (rr.followUps || []).map(f => f.label), flowHasReplan: /replan/.test(res.llmGeneratedCode || ''),
  errors: (res.workflowErrors || []).slice(0, 3) }, null, 1))
process.exit(0)
