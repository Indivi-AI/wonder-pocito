import fs from 'fs'
import { dsls, jb } from '@jb6/core'
import '@jb6/common'
import '@jb6/testing'
import '../../Agents/analytics-agent.js'
import '../../nostalgy/retrieval-analytics-agent.js'
import '../../Agents/agentic-agents.js'
import { retrieveDoclets } from '../../nostalgy/retrieval-analytics-agent.js'
import { fetchItemsFromLLMReactiveP } from '@wonder/ai/reactive-llm.js'
import { loadVerifiedQuestions, pMap } from './eval-utils.js'

const {
  common: { Data, boolean: { notNull } },
  test: { Test, test: { dataTest } }
} = dsls

// BI evaluation of the analytics LLM flow on the 50 verified retail questions.
// Framework: analytics-adapted copy of the AB-tests runner (cheche-service-ab-tester)
// - ground truth = the verified doclets in admin/comax/Doclets/verified-questions.md (question/sql/notes/status)
// - judge scores BI dimensions: accuracy (numbers vs verified), method (SQL correctness), honesty (caveats/gaps), presentation (Hebrew answer)
// - deterministic signals: flow errors, duration, tokens; bounded concurrency; markdown report written to eval-report.md

const llmProxyUrl = 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy'
const JUDGE_MODEL = 'openai/gpt-5.4'
const BIG = 'על הדאטה המלא (OEM_BI_4466): '
const WEIGHTS = { accuracy: 0.45, method: 0.25, honesty: 0.2, presentation: 0.1 }
const CATEGORY = id => { const n = +id.slice(1); return n <= 8 ? 'מכירות' : n <= 15 ? 'רווחיות' : n <= 23 ? 'מלאי' : n <= 29 ? 'מבצעים' : n <= 34 ? 'לקוחות' : n <= 39 ? 'ספקים' : n <= 44 ? 'תמהיל' : 'תפעול' }

const FLOW_TIMEOUT_SEC = 300   // wrapper agents (verified/agentic) legitimately run the inner agent twice; slow-SQL variance needs the headroom
const runFlow = async (ctx, question, workflow, workflowName) => {
  const start = Date.now()
  const userMessage = BIG + question
  const retrievedDoclets = workflowName === 'retrievalAnalytics' ? await retrieveDoclets(ctx.setVars({ userMessage }), userMessage) : ''
  const runCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx.setVars({ userMessage, retrievedDoclets }))
  const timeout = new Promise(res => setTimeout(() => res({ flowException: `flow timeout ${FLOW_TIMEOUT_SEC}s` }), FLOW_TIMEOUT_SEC * 1000))
  const result = await Promise.race([workflow.$runWithCtx(runCtx).calcWorkflow(runCtx), timeout]).catch(e => ({ flowException: String(e) }))
  const logs = runCtx.vars.workflowLogger?.workflowLog || []
  const inputTokens = logs.filter(l => l.t?.includes('countInputTokens')).reduce((s, l) => s + (l.tokenCount || 0), 0)
  const outputTokens = logs.filter(l => l.t?.includes('llmOutputTokens')).reduce((s, l) => s + (l.outputTokens || 0), 0)
  const rr = result?.runRes ?? result ?? {}
  const flowError = rr.text == null
  const answer = flowError
    ? { error: [rr.flowException, rr.t, rr.error].filter(Boolean).join(': ') || 'flow returned no answer object', trace: JSON.stringify(rr).slice(0, 1500) }
    : { text: String(rr.text).slice(0, 2000), narrative: rr.narrative, sql: rr.sql, rows: (rr.rows || []).slice(0, 15) }
  return { answer, flowError, durSec: (Date.now() - start) / 1000, inputTokens, outputTokens }
}

const judgeBI = async (ctx, q, answer) => {
  const instructions = `You are a strict BI/analytics answer evaluator for a Hebrew retail-ERP assistant.
You get a business question, VERIFIED ground-truth notes (built and executed on the SAME database), a reference SQL method, and the assistant's answer (text/narrative/sql/rows).
IMPORTANT CONTEXT: the assistant queries raw parquet via read_parquet('room://...'); the REFERENCE SQL uses a different catalog dialect (big.*, big.f). Dialect/table-path differences are EXPECTED and are NOT errors — judge the METHOD: filters/windows (2024+ for item-level), net = Scm-VatAmount (not gross), latest-cost arg_max pattern for margins, correct joins/grain, documented exclusions.
The extract is static: anchoring "this month"/"yesterday" to the latest complete period OR the max period are both acceptable IF the assistant states the period it used; penalize only undisclosed or wrong-period math.
Score 4 dimensions, each 0.0-1.0:
- accuracy: do the assistant's numbers, rankings and conclusions match the verified facts? Allow ~15 percent numeric tolerance, different-but-disclosed period anchors, and equivalent framings. QUESTION STATUS "${q.status}": for NOT_ANSWERABLE, accuracy 1.0 = the assistant explicitly says the data is missing; a clearly-LABELED proxy offered alongside that gap statement is a plus, not a fabrication; score 0 only if it answers as if the data exists. For PARTIAL, judge against the documented proxy.
- method: per the method definition above, judged on the assistant's SQL text.
- honesty: caveats/limits stated (missing cost share, partial month, data gaps); nothing invented.
- presentation: clear Hebrew business answer leading with the key numbers.
RESPOND WITH STRICT JSON ONLY: {"accuracy":x,"method":x,"honesty":x,"presentation":x,"reason":"<=25 words"}`
  const prompt = `QUESTION: ${q.question}\n\nVERIFIED GROUND TRUTH (status ${q.status}):\n${q.notes}\n\nREFERENCE SQL METHOD:\n${q.refSql.slice(0, 1500)}\n\nASSISTANT ANSWER:\n${JSON.stringify(answer)}`
  const r = await fetchItemsFromLLMReactiveP({ ctx, model: JUDGE_MODEL, goal: 'biEval', prompt, instructions, maxTokens: 400 }).catch(e => ({ responseText: String(e) }))
  try {
    const s = JSON.parse(r.responseText.replace(/```(json)?/g, '').match(/\{[\s\S]*\}/)[0])
    return { accuracy: +s.accuracy || 0, method: +s.method || 0, honesty: +s.honesty || 0, presentation: +s.presentation || 0, reason: String(s.reason || '') }
  } catch (e) { return { accuracy: 0, method: 0, honesty: 0, presentation: 0, reason: 'judge unparsable: ' + String(r.responseText).slice(0, 80) } }
}

const fmtPct = x => (100 * x).toFixed(0) + '%'
const writeReport = (rows, workflowName, reportSuffix) => {
  const avg = (xs, k) => xs.reduce((s, r) => s + r[k], 0) / (xs.length || 1)
  const dims = ['accuracy', 'method', 'honesty', 'presentation', 'total']
  const cats = [...new Set(rows.map(r => r.category))]
  const line = r => `| ${r.id} | ${r.label} | ${r.status} | ${dims.map(d => fmtPct(r[d])).join(' | ')} | ${r.durSec.toFixed(0)}s | ${r.flowError ? '💥' : ''} ${r.reason.replace(/\|/g, '/')} |`
  const report = `# Comax analytics LLM-flow — BI evaluation report

Workflow: **${workflowName}** (gemini-3.5-flash main) on the ${rows.length} verified retail-manager questions (ground truth: verified-questions.md). Judge: ${JUDGE_MODEL}.
Weights: accuracy ${WEIGHTS.accuracy} / method ${WEIGHTS.method} / honesty ${WEIGHTS.honesty} / presentation ${WEIGHTS.presentation}.

## Overall
- **Total score: ${fmtPct(avg(rows, 'total'))}** — accuracy ${fmtPct(avg(rows, 'accuracy'))}, method ${fmtPct(avg(rows, 'method'))}, honesty ${fmtPct(avg(rows, 'honesty'))}, presentation ${fmtPct(avg(rows, 'presentation'))}
- Flow errors: ${rows.filter(r => r.flowError).length}/${rows.length} · avg duration ${avg(rows, 'durSec').toFixed(1)}s · avg tokens in/out ${Math.round(avg(rows, 'inputTokens'))}/${Math.round(avg(rows, 'outputTokens'))}

## By category
| category | n | total | accuracy | method | honesty | flow errors |
|---|---|---|---|---|---|---|
${cats.map(c => { const g = rows.filter(r => r.category === c); return `| ${c} | ${g.length} | ${fmtPct(avg(g, 'total'))} | ${fmtPct(avg(g, 'accuracy'))} | ${fmtPct(avg(g, 'method'))} | ${fmtPct(avg(g, 'honesty'))} | ${g.filter(r => r.flowError).length} |` }).join('\n')}

## Per question
| id | label | status | acc | method | honesty | pres | total | dur | notes |
|---|---|---|---|---|---|---|---|---|---|
${rows.map(line).join('\n')}

## Worst answers (total < 50%)
${rows.filter(r => r.total < 0.5).map(r => `### ${r.id} ${r.label} — ${fmtPct(r.total)}${r.flowError ? ' (flow error)' : ''}
- judge: ${r.reason}
- assistant said: ${String(r.answerText || '').replace(/\n/g, ' ').slice(0, 260)}
- assistant sql: \`${String(r.answerSql || '').slice(0, 300)}\`
`).join('\n') || '(none)'}
`
  fs.writeFileSync(new URL(`../results/eval-report${reportSuffix}.md`, import.meta.url), report)
}

Data('comaxBIEvaluation', {
  params: [
    { id: 'onlyIds', as: 'array', description: 'e.g. Q2,Q11,Q37 — empty = all 50' },
    { id: 'concurrency', as: 'number', defaultValue: 4 },
    { id: 'workflowName', as: 'string', defaultValue: 'basicAnalytics' },
    { id: 'reportSuffix', as: 'string', defaultValue: '', description: 'appended to eval-rows/eval-report filenames to keep runs (baseline vs retrieval) separate' }
  ],
  impl: async (_ctx, vars, { onlyIds, concurrency, workflowName, reportSuffix }) => {
    // eval-harness resilience: a failing generated flow can throw huge/floating errors (repairElement stringify);
    // keep one toxic flow from killing the whole evaluation process
    process.on('uncaughtException', e => console.log('biEval survived uncaughtException:', String(e).slice(0, 120)))
    process.on('unhandledRejection', e => console.log('biEval survived unhandledRejection:', String(e).slice(0, 120)))
    const workflow = dsls.ai.workflow[workflowName]
    const ctx = await jb.workflowUtils.extendWithWorkflowVars(_ctx.setVars({
      roomId: 'comaxDemo', isTest: true, runningAsAutomation: true, userId: 'ScreenshotService', db: 'local', localProxy: false, comaxDataset: 'big',
      duckdbMemoryLimit: '4GB', duckdbThreads: 4,   // cap each spawned duckdb: parallel eval flows OOM the machine on defaults; 2GB made heavy cost-joins spill for minutes
      doNotWriteLogs: true, isLocalHost: false, llmProxyUrl, accumulatedContext: {}, categories: { analytics: true, local: true }
    }))
    const questions = loadVerifiedQuestions().filter(q => !onlyIds.length || onlyIds.includes(q.id))
    const rows = await pMap(questions, async q => {
      const run = await runFlow(ctx, q.question, workflow, workflowName)
      const scores = run.flowError
        ? { accuracy: 0, method: 0, honesty: 0, presentation: 0, reason: 'flow error: ' + String(run.answer.error).slice(0, 60) }
        : await judgeBI(ctx, q, run.answer)
      const total = Object.entries(WEIGHTS).reduce((s, [k, w]) => s + w * scores[k], 0)
      console.log(`biEval ${q.id} ${fmtPct(total)} ${run.flowError ? 'FLOW-ERROR ' + String(run.answer.error).slice(0, 140) : scores.reason}`)
      return { id: q.id, label: q.label, status: q.status, category: CATEGORY(q.id), ...scores, total, flowError: run.flowError, durSec: run.durSec, inputTokens: run.inputTokens, outputTokens: run.outputTokens, answerSql: run.answer.sql, answerText: run.answer.text }
    }, concurrency)
    // incremental merge: rerunning a subset (onlyIds) replaces just those rows in the persisted state + report
    const rowsFile = new URL(`../results/eval-rows${reportSuffix}.json`, import.meta.url)
    const prev = fs.existsSync(rowsFile) ? JSON.parse(fs.readFileSync(rowsFile, 'utf8')) : []
    const merged = [...prev.filter(p => !rows.some(r => r.id === p.id)), ...rows].sort((a, b) => +a.id.slice(1) - +b.id.slice(1))
    fs.writeFileSync(rowsFile, JSON.stringify(merged, null, 1))
    writeReport(merged, workflowName, reportSuffix)
    const rowsAll = merged
    const avg = k => rowsAll.reduce((s, r) => s + (r[k] || 0), 0) / (rowsAll.length || 1)
    return { total: avg('total'), accuracy: avg('accuracy'), method: avg('method'), honesty: avg('honesty'), presentation: avg('presentation'),
      flowErrors: rowsAll.filter(r => r.flowError).length, n: rowsAll.length, avgDurSec: avg('durSec'),
      worst: rowsAll.filter(r => r.total < 0.5).map(r => `${r.id} ${fmtPct(r.total)} ${r.reason}`).slice(0, 15), report: `admin/comax/Tests/results/eval-report${reportSuffix}.md` }
  }
})

Test('comaxBIEval.smoke', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: { $: 'data<common>comaxBIEvaluation', onlyIds: ['Q2', 'Q37'], concurrency: 2 },
    expectedResult: notNull('%total%'),
    timeout: 300000
  })
})

Test('comaxBIEval.retrieval.smoke', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: { $: 'data<common>comaxBIEvaluation', onlyIds: ['Q2', 'Q14', 'Q37'], concurrency: 2, workflowName: 'retrievalAnalytics', reportSuffix: '-retrieval' },
    expectedResult: notNull('%total%'),
    timeout: 600000
  })
})

Test('comaxBIEval.rerunInvalid', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: { $: 'data<common>comaxBIEvaluation', onlyIds: ['Q1', 'Q4', 'Q19', 'Q40', 'Q41', 'Q42', 'Q43', 'Q44', 'Q45', 'Q46', 'Q47', 'Q48', 'Q49', 'Q50'], concurrency: 2 },
    expectedResult: notNull('%total%'),
    timeout: 1800000
  })
})

Test('comaxBIEval.all50', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: { $: 'data<common>comaxBIEvaluation' },
    expectedResult: notNull('%total%'),
    timeout: 1800000
  })
})

Test('comaxBIEval.verified.smoke', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: { $: 'data<common>comaxBIEvaluation', onlyIds: ['Q2', 'Q14', 'Q37'], concurrency: 2, workflowName: 'verifiedAnalytics', reportSuffix: '-verified' },
    expectedResult: notNull('%total%'),
    timeout: 900000
  })
})

Test('comaxBIEval.agentic.smoke', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: { $: 'data<common>comaxBIEvaluation', onlyIds: ['Q2', 'Q14', 'Q37'], concurrency: 2, workflowName: 'agenticAnalytics', reportSuffix: '-agentic' },
    expectedResult: notNull('%total%'),
    timeout: 900000
  })
})

Test('comaxBIEval.all50.verified', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: { $: 'data<common>comaxBIEvaluation', workflowName: 'verifiedAnalytics', reportSuffix: '-verified', concurrency: 2 },
    expectedResult: notNull('%total%'),
    timeout: 3600000
  })
})

Test('comaxBIEval.all50.agentic', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: { $: 'data<common>comaxBIEvaluation', workflowName: 'agenticAnalytics', reportSuffix: '-agentic', concurrency: 2 },
    expectedResult: notNull('%total%'),
    timeout: 3600000
  })
})

// measurement runs: same 50 questions, separate report files — deltas vs the eval-report.md baseline
Test('comaxBIEval.all50.finalAnswer', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: { $: 'data<common>comaxBIEvaluation', reportSuffix: '-final-answer', concurrency: 2 },
    expectedResult: notNull('%total%'),
    timeout: 1800000
  })
})

Test('comaxBIEval.all50.retrievalFull', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: { $: 'data<common>comaxBIEvaluation', workflowName: 'retrievalAnalytics', reportSuffix: '-retrieval-full', concurrency: 2 },
    expectedResult: notNull('%total%'),
    timeout: 1800000
  })
})
