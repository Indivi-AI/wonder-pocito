import fs from 'fs'
import { dsls, coreUtils } from '@jb6/core'
import '@jb6/core/misc/jb-cli.js'
import '@jb6/common'
import '@jb6/testing'
import '../../Reports/comax-reports.js'
import { loadVerifiedQuestions, pMap } from './eval-utils.js'

const {
  common: { Data, data: { verifiedReportsRegistry }, boolean: { notNull } },
  test: { Test, test: { dataTest } }
} = dsls

// Execution accuracy (deterministic, Spider-2.0-lenient): execute the verified gold SQL and the agent's
// stored SQL (from the eval-rows files) on the local data; a question passes when every gold column is
// contained in a distinct agent column (unordered rows, numeric tolerance). No LLM calls, no agent re-runs.
// Stricter than the judge: a different-but-disclosed date anchor still counts as mismatch here.

const DB = new URL('../../../../../files/rooms/comaxDemo/usersRO/comax.duckdb', import.meta.url).pathname
const PARQUET_BASE = new URL('../../../../../files/rooms/comaxDemo/usersRO/parquet', import.meta.url).pathname
const RUNS = { basicAnalytics: 'eval-rows.json', basicFinalAnswer: 'eval-rows-final-answer.json', retrievalAnalytics: 'eval-rows-retrieval-full.json', reportsAnalytics: 'reports-eval-rows.json' }

const sh = s => `'${String(s).replace(/'/g, `'\\''`)}'`
const stripTail = sql => {
  const lines = String(sql).trimEnd().split('\n')
  while (lines.length && /^\s*--/.test(lines.at(-1))) lines.pop()
  return lines.join('\n').trimEnd().replace(/;\s*(--[^\n]*)?$/, '')
}
const capped = sql => `SELECT * FROM (${stripTail(sql)}) __t LIMIT 400`
const runSql = async sql => {
  const caps = `SET memory_limit='2GB'; SET threads=2; SET temp_directory='/tmp/duckdb-spill'; `
  const run = coreUtils.runBashScript(`duckdb -readonly -json ${sh(DB)} -c ${sh(caps + sql)}`)
  const { stdout, stderr, error } = await Promise.race([run, new Promise(res => setTimeout(() => res({ error: 'sql timeout 120s' }), 120000))])
  if (error) return { error: String(stderr || error).slice(0, 300) }
  if (typeof stdout != 'string') return stdout
  const clean = stdout.replace(/\x1b\[[0-9;]*m/g, ''), jsonStart = clean.search(/^[\[{]/m)
  try { return JSON.parse(jsonStart >= 0 ? clean.slice(jsonStart) : clean) } catch { return clean.trim() ? { error: clean.slice(0, 300) } : [] }
}

// --- lenient result containment: gold ⊆ agent, column-wise multisets, rel 2% / abs 1 numeric tolerance
const toNum = v => typeof v == 'number' ? v : (typeof v == 'string' && v.trim() && isFinite(+v) ? +v : null)
const valEq = (g, a) => { const gn = toNum(g), an = toNum(a)
  return gn != null && an != null ? Math.abs(gn - an) <= Math.max(0.02 * Math.max(Math.abs(gn), Math.abs(an)), 1) : String(g).trim() == String(a).trim() }
const colContained = (goldVals, agentVals) => {
  const rest = [...agentVals]
  return goldVals.filter(v => v != null).every(g => { const i = rest.findIndex(a => a != null && valEq(g, a)); return i >= 0 && (rest.splice(i, 1), true) })
}
const goldContained = (gold, agent) => {
  const agentCols = Object.keys(agent[0] || {}), used = new Set()
  return Object.keys(gold[0] || {}).every(gc => {
    const found = agentCols.find(ac => !used.has(ac) && colContained(gold.map(r => r[gc]), agent.map(r => r[ac])))
    return found && used.add(found)
  })
}

// --- gold results: execute each verified refSql once against the local duckdb, cache to gold-results.json
// multi-statement doclets (e.g. tier A + tier B answers) are stored as {sets: [rows,...]} - matching any set passes
const statements = sql => stripTail(sql).split(/;\s*\n/).map(s => s.trim()).filter(Boolean)
const goldSets = g => Array.isArray(g) ? [g] : Array.isArray(g?.sets) ? g.sets : null
const goldFile = new URL('../results/gold-results.json', import.meta.url)
const goldResults = async (questions, concurrency) => {
  const cache = fs.existsSync(goldFile) ? JSON.parse(fs.readFileSync(goldFile, 'utf8')) : {}
  const todo = questions.filter(q => q.status != 'NOT_ANSWERABLE' && !goldSets(cache[q.id]))
  await pMap(todo, async q => {
    const sets = []
    for (const st of statements(q.refSql)) sets.push(await runSql(capped(st)))
    cache[q.id] = !sets.every(Array.isArray) ? { error: sets.map(s => s?.error).filter(Boolean).join(' | ') }
      : sets.length == 1 ? sets[0] : { sets }
    console.log(`gold ${q.id} ${goldSets(cache[q.id]) ? goldSets(cache[q.id]).map(s => s.length + ' rows').join(' + ') : 'ERROR ' + String(cache[q.id]?.error).slice(0, 100)}`)
  }, concurrency)
  todo.length && fs.writeFileSync(goldFile, JSON.stringify(cache, null, 1))
  return cache
}

// --- executable SQL candidates per agent answer (question passes if ANY candidate result contains the gold)
const sqlCandidates = row => /select/i.test(row.answerSql || '') ? [String(row.answerSql).replaceAll('signedRoom://comaxDemo/usersRO/parquet', PARQUET_BASE)] : []
// the reports agent stores a description "report: <id> (<sections>); full_data slice: <sql>" - reconstruct
// the pre-validated slot sqls + the wrapped slice, exactly as runReport/queryReportFullData compose them
const reportsCandidates = (row, registry) => {
  const [head, slice] = String(row.answerSql || '').split(/full_data slice:/i)
  const [, reportId, secText] = head.match(/report:\s*([\w-]+)\s*(?:\(([^)]*)\))?/) || []
  const report = registry.find(r => r.id == reportId)
  if (!report) return []
  const secs = (secText || '').split(/[,+]/).map(t => t.trim()).filter(Boolean).map(t => ({
    section: (report.sections || []).find(s => t.includes(s.id)),
    depth: (t.match(/executiveSummary|inDepth|summary/) || ['summary'])[0]
  })).filter(x => x.section)
  const sliceSqls = slice ? secs.map(({ section }) => section.fullData?.viewSql
    && `WITH full_data AS (${section.fullData.viewSql}) ${slice.trim().replace(/^\s*WITH\s/i, ', ')}`).filter(Boolean) : []
  const slotSqls = [report.executiveSummary?.sql, ...secs.map(({ section, depth }) => section[depth]?.sql)].filter(Boolean)
  return [...sliceSqls, ...slotSqls].map(s => s.replaceAll('{{ROOT}}', `${PARQUET_BASE}/OEM_BI_4466`))
}

const fmtPct = x => (100 * x).toFixed(0) + '%'
const summary = rows => {
  const c = k => rows.filter(r => r.exec == k).length, gradable = rows.length - c('na') - c('gold-error')
  return { execAcc: +(c('match') / (gradable || 1)).toFixed(3), match: c('match'), mismatch: c('mismatch'), execError: c('exec-error'), noSql: c('no-sql'), na: c('na'), goldError: c('gold-error'), gradable }
}
const writeReport = all => {
  const names = Object.keys(all)
  const ids = [...new Set(names.flatMap(n => all[n].map(r => r.id)))].sort((a, b) => +a.slice(1) - +b.slice(1))
  const cell = r => !r ? '' : ({ match: '✅', mismatch: '❌', 'exec-error': '💥', 'no-sql': '—', na: 'n/a', 'gold-error': 'gold?' })[r.exec]
  const report = `# Comax agents — execution accuracy (deterministic)

Gold = verified-questions.md refSql executed on the local duckdb (gold-results.json). An agent answer matches when its
stored SQL, executed on the same data, contains every gold column (unordered, distinct columns, rel 2% / abs 1 tolerance).
NOT_ANSWERABLE questions are excluded. Stricter than the LLM judge: undisclosed-equivalent period anchors count as mismatch.

| run | execAcc | match | mismatch | exec-error | no-sql | gradable |
|---|---|---|---|---|---|---|
${names.map(n => { const s = summary(all[n]); return `| ${n} | **${fmtPct(s.execAcc)}** | ${s.match} | ${s.mismatch} | ${s.execError} | ${s.noSql} | ${s.gradable} |` }).join('\n')}

| id | ${names.join(' | ')} |
|---|${names.map(() => '---').join('|')}|
${ids.map(id => `| ${id} | ${names.map(n => cell(all[n].find(r => r.id == id))).join(' | ')} |`).join('\n')}
`
  fs.writeFileSync(new URL('../results/execution-accuracy-report.md', import.meta.url), report)
}

Data('comaxExecutionAccuracy', {
  params: [
    { id: 'runs', as: 'array', description: `run names, empty = all: ${Object.keys(RUNS).join(',')}` },
    { id: 'onlyIds', as: 'array', description: 'e.g. Q2,Q14 — empty = all 50' },
    { id: 'concurrency', as: 'number', defaultValue: 4 }
  ],
  impl: async (ctx, {}, { runs, onlyIds, concurrency }) => {
    const questions = loadVerifiedQuestions()
    const gold = await goldResults(questions, concurrency)
    const registry = verifiedReportsRegistry.$runWithCtx(ctx)
    const resFile = new URL('../results/execution-accuracy-rows.json', import.meta.url)
    const all = fs.existsSync(resFile) ? JSON.parse(fs.readFileSync(resFile, 'utf8')) : {}
    for (const name of (runs.length ? runs : Object.keys(RUNS))) {
      const rows = JSON.parse(fs.readFileSync(new URL(`./${RUNS[name]}`, import.meta.url), 'utf8')).filter(r => !onlyIds.length || onlyIds.includes(r.id))
      const graded = await pMap(rows, async row => {
        const status = questions.find(q => q.id == row.id)?.status
        if (status == 'NOT_ANSWERABLE') return { id: row.id, status, exec: 'na' }
        const sets = goldSets(gold[row.id])
        if (!sets) return { id: row.id, status, exec: 'gold-error' }
        const cands = name == 'reportsAnalytics' ? reportsCandidates(row, registry) : sqlCandidates(row)
        if (!cands.length) return { id: row.id, status, exec: 'no-sql' }
        let lastErr
        for (const sql of cands) {
          const res = await runSql(capped(sql))
          if (Array.isArray(res) && sets.some(g => goldContained(g, res))) return { id: row.id, status, exec: 'match' }
          lastErr = res?.error
        }
        return { id: row.id, status, exec: lastErr ? 'exec-error' : 'mismatch', ...(lastErr && { err: String(lastErr).slice(0, 120) }) }
      }, concurrency)
      all[name] = [...(all[name] || []).filter(p => !graded.some(g => g.id == p.id)), ...graded].sort((a, b) => +a.id.slice(1) - +b.id.slice(1))
      console.log(`execAcc ${name}:`, JSON.stringify(summary(all[name])))
    }
    fs.writeFileSync(resFile, JSON.stringify(all, null, 1))
    writeReport(all)
    return Object.fromEntries(Object.entries(all).map(([name, rows]) => [name, summary(rows)]))
  }
})

Test('comaxExecAcc.smoke', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: { $: 'data<common>comaxExecutionAccuracy', runs: ['retrievalAnalytics'], onlyIds: ['Q2', 'Q14'] },
    expectedResult: notNull('%retrievalAnalytics/match%'),
    timeout: 600000
  })
})

Test('comaxExecAcc.all', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: { $: 'data<common>comaxExecutionAccuracy' },
    expectedResult: notNull('%basicAnalytics/execAcc%'),
    timeout: 1800000
  })
})
