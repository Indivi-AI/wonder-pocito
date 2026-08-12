import fs from 'fs'
import { dsls, jb } from '@jb6/core'
import '@jb6/common'
import '@jb6/testing'
import '../../nostalgy/reports-based-agent.js'
import { fetchItemsFromLLMReactiveP } from '@wonder/ai/reactive-llm.js'
import { loadVerifiedQuestions, pMap } from './eval-utils.js'

const {
  common: { Data, data: { verifiedReportsRegistry }, boolean: { notNull } },
  test: { Test, test: { dataTest } },
  workflow: { workflow: { reportsAnalytics } }
} = dsls

// BI evaluation of the reports-based analytics flow on the 50 verified retail questions.
// Same proven skeleton as comax-eval.js (verified-questions.md ground truth, LLM judge, bounded pMap, incremental rows json + md report), plus:
// - deterministic `selection` metric: did the flow actually run a report whose questionsCovered contains the question id
// - method is judged on report/section/depth appropriateness (the SQL is pre-validated), not on raw SQL correctness
// - the report compares side-by-side against the basicAnalytics baseline in eval-rows.json

const llmProxyUrl = 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy'
const JUDGE_MODEL = 'openai/gpt-5.4'
const SUMMARY_MODEL = 'openai/gpt-5.4'
const WEIGHTS = { accuracy: 0.4, method: 0.15, selection: 0.15, honesty: 0.2, presentation: 0.1 }
const CATEGORY = id => { const n = +id.slice(1); return n <= 8 ? 'מכירות' : n <= 15 ? 'רווחיות' : n <= 23 ? 'מלאי' : n <= 29 ? 'מבצעים' : n <= 34 ? 'לקוחות' : n <= 39 ? 'ספקים' : n <= 44 ? 'תמהיל' : 'תפעול' }
const qidToReports = reports => Object.fromEntries([...Array(50)].map((_, i) => 'Q' + (i + 1))
  .map(q => [q, reports.filter(r => (r.questionsCovered || []).includes(q)).map(r => r.id)]))

const FLOW_TIMEOUT_SEC = 180
const runFlow = async (ctx, question) => {
  const start = Date.now()
  // reports target the big company (root OEM_BI_4466 is set by the workflow's enrichCtx) - no dataset prefix needed
  const runCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx.setVars({ userMessage: question }))
  const timeout = new Promise(res => setTimeout(() => res({ flowException: `flow timeout ${FLOW_TIMEOUT_SEC}s` }), FLOW_TIMEOUT_SEC * 1000))
  const result = await Promise.race([reportsAnalytics.$runWithCtx(runCtx).calcWorkflow(runCtx), timeout]).catch(e => ({ flowException: String(e) }))
  const logs = runCtx.vars.workflowLogger?.workflowLog || []
  const inputTokens = logs.filter(l => l.t?.includes('countInputTokens')).reduce((s, l) => s + (l.tokenCount || 0), 0)
  const outputTokens = logs.filter(l => l.t?.includes('llmOutputTokens')).reduce((s, l) => s + (l.outputTokens || 0), 0)
  const rr = result?.runRes ?? result ?? {}
  const flowError = rr.text == null
  // what the flow ACTUALLY ran (runReport log lines) unioned with what it claims (reportsUsed echo)
  const selectedReports = [...new Set([...(Array.isArray(rr.reportsUsed) ? rr.reportsUsed : []).map(r => r?.reportId),
    ...logs.filter(l => l.t == 'runReport').map(l => l.reportId)])].filter(Boolean)
  const answer = flowError
    ? { error: [rr.flowException, rr.t, rr.error].filter(Boolean).join(': ') || 'flow returned no answer object', trace: JSON.stringify(rr).slice(0, 1500) }
    : { text: String(rr.text).slice(0, 2000), narrative: rr.narrative, sql: rr.sql, rows: (rr.rows || []).slice(0, 15), reportsUsed: rr.reportsUsed }
  return { answer, selectedReports, flowError, durSec: (Date.now() - start) / 1000, inputTokens, outputTokens }
}

const judgeBI = async (ctx, q, answer) => {
  const instructions = `You are a strict BI/analytics answer evaluator for a Hebrew retail-ERP assistant.
You get a business question, VERIFIED ground-truth notes (built and executed on the SAME database), a reference SQL method, and the assistant's answer (text/narrative/sql/rows/reportsUsed).
IMPORTANT CONTEXT: this assistant does NOT write raw SQL. It answers by selecting PRE-VALIDATED catalog reports (runReport: reportId + sections + sectionDepth) whose SQL already encodes the data traps (2024+ window, net = ex-VAT, latest-cost margins, returns netting, static-extract date anchoring); its 'sql' field is a description of the reports/sections/depths used plus at most one small aggregation over a report full_data view. The REFERENCE SQL below uses a different catalog dialect (big.*, big.f) — use it to check the FACTS and the analytical approach, never literal SQL similarity.
The extract is static: anchoring "this month"/"yesterday" to the latest complete period OR the max period are both acceptable IF the assistant states the period it used; penalize only undisclosed or wrong-period math.
Score 4 dimensions, each 0.0-1.0:
- accuracy: do the assistant's numbers, rankings and conclusions match the verified facts? Allow ~15 percent numeric tolerance, different-but-disclosed period anchors, and equivalent framings. QUESTION STATUS "${q.status}": for NOT_ANSWERABLE, accuracy 1.0 = the assistant explicitly says the data is missing; a clearly-LABELED proxy offered alongside that gap statement is a plus, not a fabrication; score 0 only if it answers as if the data exists. For PARTIAL, judge against the documented proxy.
- method: did the assistant pick reports/sections/depth that FIT the question (per its sql description and reportsUsed), and is any full_data slice a sensible small aggregation? Do NOT penalize the absence of raw SQL — pre-validated reports are the correct method here; penalize an ill-fitting report choice, answering from the wrong section, or a broken/oversized full_data query.
- honesty: caveats/limits stated (missing cost share, partial month, data gaps); nothing invented.
- presentation: clear Hebrew business answer leading with the key numbers.
RESPOND WITH STRICT JSON ONLY: {"accuracy":x,"method":x,"honesty":x,"presentation":x,"reason":"<=25 words"}`
  const prompt = `QUESTION: ${q.question}\n\nVERIFIED GROUND TRUTH (status ${q.status}):\n${q.notes}\n\nREFERENCE SQL METHOD:\n${q.refSql.slice(0, 1500)}\n\nASSISTANT ANSWER:\n${JSON.stringify(answer)}`
  const r = await fetchItemsFromLLMReactiveP({ ctx, model: JUDGE_MODEL, goal: 'reportsBiEval', prompt, instructions, maxTokens: 400 }).catch(e => ({ responseText: String(e) }))
  try {
    const s = JSON.parse(r.responseText.replace(/```(json)?/g, '').match(/\{[\s\S]*\}/)[0])
    return { accuracy: +s.accuracy || 0, method: +s.method || 0, honesty: +s.honesty || 0, presentation: +s.presentation || 0, reason: String(s.reason || '') }
  } catch (e) { return { accuracy: 0, method: 0, honesty: 0, presentation: 0, reason: 'judge unparsable: ' + String(r.responseText).slice(0, 80) } }
}

const fmtPct = x => (100 * x).toFixed(0) + '%'
const fmtDelta = x => (x >= 0 ? '+' : '') + (100 * x).toFixed(0) + 'pp'
const avgOf = (xs, k) => xs.reduce((s, r) => s + (r[k] || 0), 0) / (xs.length || 1)
const writeReport = (rows, reportCount, QID_TO_REPORTS) => {
  const baseFile = new URL('../results/eval-rows.json', import.meta.url)
  const baseline = fs.existsSync(baseFile) ? JSON.parse(fs.readFileSync(baseFile, 'utf8')) : []
  const bById = Object.fromEntries(baseline.map(r => [r.id, r]))
  const cats = [...new Set(rows.map(r => r.category))]
  const overallLine = (label, k) => `| ${label} | ${fmtPct(avgOf(rows, k))} | ${baseline.length ? fmtPct(avgOf(baseline, k)) : '—'} |`
  const line = r => {
    const b = bById[r.id]
    return `| ${r.id} | ${r.label} | ${r.status} | ${['accuracy', 'method', 'selection', 'honesty', 'presentation', 'total'].map(d => fmtPct(r[d])).join(' | ')} | ${b ? fmtDelta(r.total - b.total) : '—'} | ${r.durSec.toFixed(0)}s | ${r.flowError ? '💥' : ''} ${String(r.reason).replace(/\|/g, '/')} |`
  }
  const report = `# Comax reports-based analytics LLM-flow — BI evaluation report

Workflow: **reportsAnalytics** (gemini-3.5-flash main, catalog of ${reportCount} pre-validated reports) on the ${rows.length} verified retail-manager questions (ground truth: verified-questions.md). Judge: ${JUDGE_MODEL}.
Weights: accuracy ${WEIGHTS.accuracy} / method ${WEIGHTS.method} / selection ${WEIGHTS.selection} / honesty ${WEIGHTS.honesty} / presentation ${WEIGHTS.presentation}.
selection is deterministic: 1 when a report the flow ran (runReport log ∪ reportsUsed echo) covers the question per the catalog questionsCovered.
Baseline: **basicAnalytics** from eval-rows.json (its totals use its own weights acc .45 / method .25 / honesty .2 / pres .1, no selection).

## Overall — vs basicAnalytics baseline
| metric | reportsAnalytics | basicAnalytics |
|---|---|---|
${overallLine('**total**', 'total')}
${overallLine('accuracy', 'accuracy')}
| method | ${fmtPct(avgOf(rows, 'method'))} | ${baseline.length ? fmtPct(avgOf(baseline, 'method')) : '—'} (raw-SQL method) |
| selection | ${fmtPct(avgOf(rows, 'selection'))} | — |
${overallLine('honesty', 'honesty')}
${overallLine('presentation', 'presentation')}
| flow errors | ${rows.filter(r => r.flowError).length}/${rows.length} | ${baseline.filter(r => r.flowError).length}/${baseline.length || '—'} |
| avg duration | ${avgOf(rows, 'durSec').toFixed(1)}s | ${baseline.length ? avgOf(baseline, 'durSec').toFixed(1) + 's' : '—'} |
| avg tokens in/out | ${Math.round(avgOf(rows, 'inputTokens'))}/${Math.round(avgOf(rows, 'outputTokens'))} | ${baseline.length ? Math.round(avgOf(baseline, 'inputTokens')) + '/' + Math.round(avgOf(baseline, 'outputTokens')) : '—'} |

## By category — vs baseline
| category | n | total | base total | Δ | accuracy | selection | honesty | flow errors | base flow errors |
|---|---|---|---|---|---|---|---|---|---|
${cats.map(c => { const g = rows.filter(r => r.category === c), bg = baseline.filter(r => r.category === c)
    return `| ${c} | ${g.length} | ${fmtPct(avgOf(g, 'total'))} | ${bg.length ? fmtPct(avgOf(bg, 'total')) : '—'} | ${bg.length ? fmtDelta(avgOf(g, 'total') - avgOf(bg, 'total')) : '—'} | ${fmtPct(avgOf(g, 'accuracy'))} | ${fmtPct(avgOf(g, 'selection'))} | ${fmtPct(avgOf(g, 'honesty'))} | ${g.filter(r => r.flowError).length} | ${bg.filter(r => r.flowError).length} |` }).join('\n')}

## Per question
| id | label | status | acc | method | sel | honesty | pres | total | Δ base | dur | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
${rows.map(line).join('\n')}

## Worst answers (total < 50%)
${rows.filter(r => r.total < 0.5).map(r => `### ${r.id} ${r.label} — ${fmtPct(r.total)}${r.flowError ? ' (flow error)' : ''}
- judge: ${r.reason}
- selected reports: ${r.selectedReports?.join(', ') || '(none)'} — expected one of: ${QID_TO_REPORTS[r.id]?.join(', ')}
- assistant said: ${String(r.answerText || '').replace(/\n/g, ' ').slice(0, 260)}
- assistant sql: \`${String(r.answerSql || '').slice(0, 300)}\`
`).join('\n') || '(none)'}
`
  fs.writeFileSync(new URL('../results/reports-eval-report.md', import.meta.url), report)
}

Data('reportsBIEvaluation', {
  params: [
    { id: 'onlyIds', as: 'array', description: 'e.g. Q2,Q11,Q37 — empty = all 50' },
    { id: 'concurrency', as: 'number', defaultValue: 1, description: 'hard-capped at 2 (RAM discipline: each flow spawns duckdb processes)' }
  ],
  impl: async (_ctx, vars, { onlyIds, concurrency }) => {
    // eval-harness resilience: a failing generated flow can throw huge/floating errors; keep one toxic flow from killing the evaluation
    process.on('uncaughtException', e => console.log('reportsBiEval survived uncaughtException:', String(e).slice(0, 120)))
    process.on('unhandledRejection', e => console.log('reportsBiEval survived unhandledRejection:', String(e).slice(0, 120)))
    const ctx = await jb.workflowUtils.extendWithWorkflowVars(_ctx.setVars({
      roomId: 'comaxDemo', isTest: true, runningAsAutomation: true, userId: 'ScreenshotService', db: 'local', localProxy: false,
      doNotWriteLogs: true, isLocalHost: false, llmProxyUrl, summaryModel: SUMMARY_MODEL, accumulatedContext: {}, categories: { reportsAnalytics: true, local: true }
    }))
    const reports = verifiedReportsRegistry.$runWithCtx(ctx)
    const QID_TO_REPORTS = qidToReports(reports)
    const questions = loadVerifiedQuestions().filter(q => !onlyIds.length || onlyIds.includes(q.id))
    const rows = await pMap(questions, async q => {
      const run = await runFlow(ctx, q.question)
      const scores = run.flowError
        ? { accuracy: 0, method: 0, honesty: 0, presentation: 0, reason: 'flow error: ' + String(run.answer.error).slice(0, 60) }
        : await judgeBI(ctx, q, run.answer)
      const selection = run.flowError ? 0 : +(!QID_TO_REPORTS[q.id].length || run.selectedReports.some(id => QID_TO_REPORTS[q.id].includes(id)))
      const total = Object.entries(WEIGHTS).reduce((s, [k, w]) => s + w * ({ ...scores, selection }[k]), 0)
      console.log(`reportsBiEval ${q.id} ${fmtPct(total)} sel:${selection} [${run.selectedReports}] ${run.flowError ? 'FLOW-ERROR ' + String(run.answer.error).slice(0, 140) : scores.reason}`)
      return { id: q.id, label: q.label, status: q.status, category: CATEGORY(q.id), ...scores, selection, total, selectedReports: run.selectedReports,
        flowError: run.flowError, durSec: run.durSec, inputTokens: run.inputTokens, outputTokens: run.outputTokens, answerSql: run.answer.sql, answerText: run.answer.text }
    }, Math.min(concurrency || 1, 2))
    // incremental merge: rerunning a subset (onlyIds) replaces just those rows in the persisted state + report
    const rowsFile = new URL('../results/reports-eval-rows.json', import.meta.url)
    const prev = fs.existsSync(rowsFile) ? JSON.parse(fs.readFileSync(rowsFile, 'utf8')) : []
    const merged = [...prev.filter(p => !rows.some(r => r.id === p.id)), ...rows].sort((a, b) => +a.id.slice(1) - +b.id.slice(1))
    fs.writeFileSync(rowsFile, JSON.stringify(merged, null, 1))
    writeReport(merged, reports.length, QID_TO_REPORTS)
    const avg = k => avgOf(merged, k)
    return { total: avg('total'), accuracy: avg('accuracy'), method: avg('method'), selection: avg('selection'), honesty: avg('honesty'), presentation: avg('presentation'),
      flowErrors: merged.filter(r => r.flowError).length, n: merged.length, avgDurSec: avg('durSec'),
      worst: merged.filter(r => r.total < 0.5).map(r => `${r.id} ${fmtPct(r.total)} ${r.reason}`).slice(0, 15), report: 'admin/comax/Tests/results/reports-eval-report.md' }
  }
})

Test('reportsBIEval.smoke', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: { $: 'data<common>reportsBIEvaluation', onlyIds: ['Q2', 'Q37'], concurrency: 1 },
    expectedResult: notNull('%total%'),
    allowError: true,   // evaluated flows may log errors - the eval SCORES flow errors, they must not fail the harness
    timeout: 900000
  })
})

Test('reportsBIEval.subset8', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: { $: 'data<common>reportsBIEvaluation', onlyIds: ['Q2', 'Q5', 'Q11', 'Q17', 'Q25', 'Q31', 'Q37', 'Q41'], concurrency: 1 },
    expectedResult: notNull('%total%'),
    allowError: true,
    timeout: 3600000
  })
})

// flow-error rerun policy: rerun failed questions once at concurrency 1 in a fresh process - dead flows retain giant
// error ctxs (repair-loop RangeError) that degrade the process, and generation bugs are nondeterministic; persistent
// failures stay in the rows as flow errors. Update onlyIds to the current flow-error set before running.
Test('reportsBIEval.rerunFlowErrors', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: { $: 'data<common>reportsBIEvaluation', onlyIds: ['Q6'], concurrency: 1 },
    expectedResult: notNull('%total%'),
    allowError: true,
    timeout: 3600000
  })
})

Test('reportsBIEval.all50', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: { $: 'data<common>reportsBIEvaluation', concurrency: 2 },
    expectedResult: notNull('%total%'),
    allowError: true,
    timeout: 5400000
  })
})
