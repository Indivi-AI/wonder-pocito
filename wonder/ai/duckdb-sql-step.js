import { dsls, jb, coreUtils } from '@jb6/core'
import '@jb6/core/misc/jb-cli.js'
import '@jb6/llm-guide'
import '@wonder/db/db-drivers.js'
import { fetchItemsFromLLMReactiveP } from '@wonder/ai/reactive-llm.js'
import './llm-flow-core.js'

const { wresolve, wfetch2 } = jb.wonderUtils
const {
  common: { Data },
  'llm-guide': { Doclet, doclet: { dataComp }, guidance: { example, mustDo, doNot }, explanationPoint: { explanation, syntax, whenToUse } }
} = dsls

const sh = s => `'${String(s).replace(/'/g, `'\\''`)}'`
const cacheableSql = sql => /^\s*(with|select)\b/i.test(sql) && !/\b(copy|insert|update|delete|drop|create|alter|attach|detach|pragma)\b/i.test(sql)
const cachedDuckDbCmd = sql => {
  const q = sh(sql)
  return `mkdir -p .cache/duckdb-sql; if command -v sha256sum >/dev/null; then k=$(printf %s ${q} | sha256sum | cut -d' ' -f1); else k=$(printf %s ${q} | shasum -a 256 | cut -d' ' -f1); fi; f=.cache/duckdb-sql/$k.json; if [ -f "$f" ]; then cat "$f"; else t="$f.$$.$(date +%s).tmp"; duckdb -json -c ${q} > "$t"; rc=$?; if [ $rc -eq 0 ]; then mv "$t" "$f"; cat "$f"; else cat "$t"; rm -f "$t"; exit $rc; fi; fi`
}

// rewrite every embedded wUrl (scheme://, not http) to a signed https url so duckdb httpfs reads it remotely
const resolveWurls = async (sql, ctx) => {
  const wurls = [...new Set(sql.match(/[a-zA-Z][\w-]*:\/\/[^'")\s]+/g) || [])].filter(u => !/^https?:/i.test(u))
  return wurls.reduce(async (accP, u) => (await accP).split(u).join(await wresolve(u, ctx)), Promise.resolve(sql))
}

// browser → room lambda: ship a profile to <roomUrl>/lambda/<name> (the roomLambda db-driver-interceptor carries auth + transport).
// 5xx = transport/infra (cold container, 503) → one retry; comp-level errors ride status 200 and pass through untouched
export const runViaRoomLambda = async (ctx, name, profile, retry = 1) => {
  const res = await wfetch2(`${ctx.vars.roomUrl}/lambda/${name}`, { method: 'post', body: { profile, serverTimeout: 180000 } }, ctx).catch(() => null)
  if ((!res || res.status >= 500) && retry) return runViaRoomLambda(ctx, name, profile, retry - 1)
  const out = res && await res.json()
  return out ?? { error: `lambda ${name} failed: ${res?.status}` }
}

Data('duckDbSql', {
  params: [{id: 'sql', as: 'text', dynamic: true, mandatory: true}], // dynamic + doNotCalcExpression: keep raw SQL, no %..% templating (strftime, LIKE)
  impl: async (ctx, {}, {sql}) => {
    const waitedCtx = await jb.workflowUtils.waitForHumanFeedbackVars(ctx, sql.profile || sql(ctx.setVars({doNotCalcExpression: true})))
    const rawSql = jb.workflowUtils.applyHumanFeedbackVars(sql(waitedCtx.setVars({doNotCalcExpression: true})), waitedCtx)
    // browser with no local duckdb: ship the raw sql (wUrls unresolved - the lambda signs them near the data) to the %$sqlLambda% room lambda
    if (!coreUtils.isNode && waitedCtx.vars.sqlLambda)
      return runViaRoomLambda(waitedCtx, waitedCtx.vars.sqlLambda, { $: 'data<common>duckDbSql', sql: rawSql })
    const resolved = await resolveWurls(rawSql, waitedCtx)
    // browser flows resolve local-room wUrls to localhost /files urls - rewrite to repo-relative disk paths (duckdb spawns at repo root) so local parquets skip httpfs
    const localFiles = resolved.replace(/https?:\/\/localhost:\d+\/files\//g, 'files/')
    // single runs use duckdb's native defaults (all cores, ~80% RAM) for speed; only parallel agents/evals pass duckdbMemoryLimit/duckdbThreads to cap and avoid OOM. temp_directory always set so an over-budget query spills instead of crashing
    const {duckdbMemoryLimit, duckdbThreads} = ctx.vars
    const caps = (duckdbMemoryLimit ? `SET memory_limit='${duckdbMemoryLimit}'; ` : '') + (duckdbThreads ? `SET threads=${duckdbThreads}; ` : '') + `SET temp_directory='/tmp/duckdb-spill'; `
    // DUCKDB_CACHE_HTTPFS (opt-in per service): cache_httpfs keeps fetched byte ranges on container disk, so repeat remote reads go local
    const prelude = caps + (/https?:\/\//.test(localFiles) ? `${globalThis.process?.env?.DUCKDB_CACHE_HTTPFS ? 'LOAD cache_httpfs; ' : ''}LOAD httpfs; SET enable_http_metadata_cache=true; ` : '')
    const runSql = prelude + localFiles
    const {stdout, stderr, error} = await coreUtils.runBashScript(cacheableSql(localFiles) && ctx.vars.duckDbSqlCache !== false ? cachedDuckDbCmd(runSql) : `duckdb -json -c ${sh(runSql)}`)
    if (error) return {error: stderr || error}
    if (typeof stdout != 'string') return stdout   // clean output: runBashScript already JSON.parsed it into the rows array
    // duckdb prints ANSI-colored httpfs warnings (e.g. range-request fallback) to STDOUT before the JSON,
    // which breaks that parse and leaves a string that fails every jq postCondition - strip and re-parse
    const clean = stdout.replace(/\x1b\[[0-9;]*m/g, '')
    const jsonStart = clean.search(/^[\[{]/m)
    const json = jsonStart >= 0 ? clean.slice(jsonStart) : clean
    if (!json.trim()) return []   // duckdb -json prints nothing for 0 rows
    try { return JSON.parse(json) } catch { return json }
  }
})

// the SQL twin of llmSummary: an LLM call at RUNTIME that sees the current ctx data + flow vars, authors ONE query, executes it, returns the rows
Data('llmSql', {
  params: [
    {id: 'task', as: 'text', mandatory: true, description: 'what the query must answer; reference the discovery rows kept in ctx data / flow vars'},
    {id: 'model', as: 'string', defaultValue: '%$flowModel%'},
    {id: 'maxRetries', as: 'number', defaultValue: 1}
  ],
  impl: async (ctx, {workflowLogger, userMessage, summaryModel}, {task, model, maxRetries}) => {
    const logger = workflowLogger || ctx.vars.logger
    const { squeeze, getWorkflowVars } = jb.workflowUtils
    const domainGuides = ['dbBooklet', 'comaxAnalytics', 'selectedReportDetails', 'reportsCatalog'].map(k => ctx.vars[k]).filter(Boolean).join('\n')
    const flowVars = Object.entries(getWorkflowVars(logger?.workflowTrace) || {}).map(([k, v]) => `${k}: ${squeeze(v, 2000)}`).join('\n')
    let feedback = ''
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const prompt = [`#TASK\n${task}`, `#DATA (current flow data)\n${squeeze(ctx.data, 6000)}`, flowVars && `#FLOW_VARS\n${flowVars}`,
        `#ORIGINAL_USER_MESSAGE\n${userMessage || ''}`, feedback,
        'Reply with ONE DuckDB SQL query inside a ```sql block. No explanations, no flow elements, no jq.'].filter(Boolean).join('\n\n')
      const { responseText } = await fetchItemsFromLLMReactiveP({ ctx, model: model || summaryModel, goal: 'llmSql',
        prompt, instructions: domainGuides, maxTokens: 3000, temperature: 0, thinkingBudget: 0 })
      const sql = (responseText.match(/```(?:sql)?\s*\n?([\s\S]*?)```/)?.[1] || responseText).trim()
      const rows = sql ? await dsls.common.data.duckDbSql.$runWithCtx(ctx, sql) : { error: 'llmSql: empty SQL response' }
      logger?.info?.({t: 'llmSql', attempt, ok: Array.isArray(rows), rowsCount: Array.isArray(rows) ? rows.length : undefined}, {sql, error: rows?.error}, {ctx})
      if (Array.isArray(rows)) return rows
      feedback = `#PREVIOUS_ATTEMPT (failed)\n${sql}\n#ERROR\n${squeeze(rows?.error || rows, 2000)}`
    }
    return { error: `llmSql failed after ${maxRetries + 1} attempts` }
  }
})

Doclet('llmSqlDataComponent', {
  impl: dataComp('llmSql', {
    guidance: [
      example(`
// two-stage recovery: deterministic discovery, then a runtime-informed query
{$: 'flow-elem<workflow>setCtxData', goal: 'Discover matching products',
  value: {$: 'data<common>duckDbSql', sql: "SELECT C, trim(Nm) AS name FROM read_parquet('<root>/Prt.parquet') WHERE Nm LIKE '%פילדלפיה%'"}},
{$: 'flow-elem<workflow>setCtxVar', goal: 'Keep matches', varName: 'matchedProducts', value: {$: 'data<common>jqSingle', exp: '.'}},
{$: 'flow-elem<workflow>setCtxData', goal: 'Informed final query',
  value: {$: 'data<common>llmSql', task: 'answer the original question for the EXACT product ids found in matchedProducts; GROUP BY the matched product name'},
  postCondition: {$: 'boolean<common>jqBoolean', exp: 'type == "array"'}}
`),
      mustDo('Put the discovered entities in ctx data or a kept var BEFORE llmSql - the authored SQL is grounded in what it sees there'),
      doNot('Use llmSql when the SQL can be fully written upfront', {reason: 'a plain duckDbSql is cheaper and deterministic'})
    ],
    explaination: [
      explanation('Makes one LLM call at RUNTIME: sees the current ctx data + flow vars + task, authors one DuckDB query, executes it, returns the rows'),
      explanation('On SQL error it retries once with the error as feedback, then returns {error} - guard with a postCondition'),
      whenToUse('Second stage of discovery flows: a deterministic lookup ran, and the final query must be written against its actual results')
    ]
  })
})

Doclet('duckDbSqlDataComponent', {
  impl: dataComp('duckDbSql', {
    guidance: [
      example(`
{$: 'flow-elem<workflow>setCtxData',
  goal: 'Run analytics SQL',
  value: {$: 'data<common>duckDbSql',
    sql: "SELECT campaign_name, count(*) AS sessions FROM read_parquet('signedRoom://schematics/usersRO/crm/sessions_answers_auto.parquet') GROUP BY campaign_name ORDER BY sessions DESC LIMIT 20"},
  postCondition: {$: 'boolean<common>jqBoolean', exp: 'type == "array"'}
}`),
      mustDo('Reference parquets by their full signedRoom://schematics/usersRO/crm/<file>.parquet wUrl - duckDbSql resolves it to a signed url read remotely via httpfs'),
      mustDo('Keep result sets small with LIMIT or grouped aggregates before llmSummary'),
      mustDo('Compute aggregates and interesting data points - counts, sums, avg, and min/max - grouped by the requested dimension, ordered and LIMITed to a top-N, so downstream context stays small and the extremes are explicit'),
      mustDo('Use %$selectedProducts.sqlIn%/%$selectedBranches.sqlIn% for selected id filters, or %$selectedProducts.sqlLabelsIn%/%$selectedBranches.sqlLabelsIn% for selected name filters; duckDbSql waits and substitutes'),
      doNot('Return raw event/session rows unless the user explicitly asks for samples', {reason: 'llmSummary needs compact, aggregated data'})
    ],
    explaination: [
      explanation('Resolves any scheme:// wUrl in the SQL to a signed url, then runs DuckDB and returns the JSON array result'),
      syntax("read_parquet('signedRoom://schematics/usersRO/crm/sessions_answers_auto.parquet')", 'CRM Delta Share snapshot in the schematics room'),
      whenToUse('Every analytics flow that needs room parquets, joins, aggregation, or conversion math')
    ]
  })
})
