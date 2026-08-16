import {dsls, coreUtils, jb} from '@jb6/core'
import '@jb6/llm-guide/essentials.js'
import '@jb6/core/misc/jb-cli.js'   // assigns runBashScript onto coreUtils (node CLI helpers)
import '@wonder/db/db-drivers.js'

const { wfetch2, wresolve, wcachePopulate } = jb.wonderUtils
const {
  tgp: { TgpType, TgpTypeModifier, Component, 'ctx-enricher': { sameCtx } },
  common: { Data },
  test: { Logger,
    logger: { domainLogger }
  },
  'llm-guide': { Doclet }
} = dsls

Doclet('cli-etl', {
  impl: `
cliEtl is a file-based ETL using CLI tools. Data stays on disk — never loaded into Node memory.
Unlike inMemEtl (in-memory ctx.data), cliEtl passes file paths between stages via ctx.vars.
All transforms generate bash commands executed via coreUtils.runBashScript (works on both Node and browser).

## When to use cliEtl instead of inMemEtl
- Large files (100K+ rows) that don't fit in memory
- CSV/JSON aggregations, joins, transforms
- Streaming — constant memory processing

## Type system
cli-extract<etl>: { inputFile(ctx<etlLogger>): filePath, lastModified(ctx<etlLogger>): dateString }
cli-transform<etl>: { cmd(ctx<etlLogger, inputFile, outputFile>): bashCommand }
cli-load<etl>: { save(ctx<etlLogger, outputFile>), lastModified(ctx<etlLogger>): dateString }

## cliEtl flow
1. Date check: extract.lastModified vs load.lastModified → skip if unchanged
2. extract.inputFile(ctx) → local file path → ctx.vars.inputFile
3. cliEtl sets ctx.vars.outputFile = /tmp/etl-{etlId}-output
4. transform.cmd(ctx) → bash command string → runBashScript executes it
5. load.save(ctx) → copies ctx.vars.outputFile to destination

## Extract components (cli-extract<etl>)
- localFile(path) — local file
- cachedWonderUrl(url) — download from wonder URL with local cache

## Transform engines (cli-transform<etl>)
Each generates a bash command: engine expression inputFile > outputFile

### mlr(expression) — Miller (sudo apt-get install miller)
Streaming, constant memory. Best for simple aggregations on CSV/JSON.
--csv stats1 -a sum,count -f revenue,cost -g campaign
--icsv --ojson stats1 -a sum,count -f revenue -g campaign
--csv sort-nr revenue
--csv head -n 100
--csv filter '$revenue =~ "^[0-9]"' then histogram -f revenue --auto --nbins 10

### duckdb(sql) — DuckDB SQL (sudo apt-get install duckdb)
Full SQL. Best for joins, window functions, complex queries. Use '{%$inputFile%}' as table reference.
SELECT col, count(*) FROM read_csv('{%$inputFile%}') GROUP BY col
SELECT *, revenue/cost as roi FROM read_csv('{%$inputFile%}') WHERE revenue > 0
SELECT a.*, b.name FROM read_csv('{%$inputFile%}') a JOIN read_csv('/tmp/lookup.csv') b ON a.id = b.id

### polars(expression) — Polars Python (pip install polars)
Lazy evaluation, query optimization. Expression is a df method chain (df = df.{expression}).
filter(col("revenue") > 0).group_by("campaign_name").agg(col("revenue").sum()).sort("revenue", descending=True)
with_columns((col("revenue") * 2).alias("double_rev"))
join(pl.scan_csv("/tmp/clients.csv"), on="client_id", how="left")

## Load components (cli-load<etl>)
- copyToFile(path) — copy to local file

## Profile examples
cliEtl({
  extract: localFile('/tmp/sessions.csv'),
  transform: mlr('--csv stats1 -a sum,count -f revenue -g campaign_name'),
  load: copyToFile('/tmp/revenue_by_campaign.csv')
})

cliEtl({
  extract: localFile('/tmp/sessions.csv'),
  transform: duckdb("SELECT campaign_name, count(*) as sessions, sum(revenue) as revenue FROM read_csv('{%$inputFile%}') GROUP BY campaign_name ORDER BY revenue DESC"),
  load: copyToFile('/tmp/revenue_by_campaign.csv')
})

cliEtl({
  extract: localFile('/tmp/sessions.csv'),
  transform: polars('filter(col("revenue") > 0).group_by("campaign_name").agg(col("revenue").sum()).sort("revenue", descending=True)'),
  load: copyToFile('/tmp/revenue_by_campaign.csv')
})

cliEtl({
  extract: cachedWonderUrl('room:gcs//myRoom/sessions.csv'),
  transform: mlr('--csv stats1 -a sum,count -f revenue -g campaign_name'),
  load: copyToFile('/tmp/revenue_by_campaign.csv')
})

## DuckDB query with indices (future)
duckDBQueryWithIndices({
  from: localFile('/tmp/sessions.csv'),
  indices: [
    parquetIndexByField('byCampaign', 'campaign_name'),
    parquetIndexByField('byDate', 'start_dt', { desc: true }),
    parquetIndexByEtl('enriched', cliEtl({ ... }))
  ],
  query: "SELECT * FROM $byCampaign WHERE campaign_name = 'camp_a'"
})
Parquet indices are sorted files with min/max metadata per row group.
DuckDB uses predicate pushdown to skip irrelevant row groups — reads ~1-5% of the file.
`
})

Component('setVarsInParallel', {
    type: 'ctx-enricher<tgp>',
    params: [{id: 'enrichers', type: 'ctx-enricher<tgp>[]', dynamic: true, composite: true}],
    impl: async (ctx, {}, { enrichers }) => {
        const results = await Promise.all(coreUtils.asArray(enrichers.profile).map((_, i) => ctx.runInnerArg(enrichers, i)))
        return ctx.setVars(Object.assign({}, ...results.map(r => r.vars)))
    }
})

TgpType('etl','etl', { demoProfile: 'etl<etl>cliEtlDemo' })
TgpType('extract','etl', { typescript: '{ lastModified(ctx), extractFromDB(ctx)}'})
TgpType('load','etl', { typescript: '{ lastModified(ctx), saveToDB(ctx)}'})

Logger('etlLogger', {
  impl: domainLogger('etl', 'etlId')
})

Component('inMemEtl', {
  moreTypes: 'etl<etl>',
  description: 'in memory etl',
  params: [
    {id: 'enrichBefore', type: 'ctx-enricher<tgp>', dynamic: true, defaultValue: sameCtx(), byName: true},
    {id: 'extract', type: 'extract<etl>', description: 'e.g. put main result in ctx.data'},
    {id: 'enrichAfterExtract', type: 'ctx-enricher<tgp>', dynamic: true, description: 'e.g. build indeces', defaultValue: sameCtx()},
    {id: 'transform', type: 'ctx-enricher<tgp>', dynamic: true, description: 'e.g. put result in ctx.data', defaultValue: sameCtx()},
    {id: 'load', type: 'load<etl>', description: 'save ctx.data into db'}
  ],
  impl: async (_ctx, { etlLogger, etlId},{enrichBefore, extract, enrichAfterExtract, transform, load}) => {
        etlLogger = etlLogger || dsls.test.logger.etlLogger.$runWithCtx(_ctx)
        etlId = etlId || `etl-${Math.random().toString(36).slice(2,8)}`

        let ctx = _ctx.setVars({ etlLogger, etlId })
        const { dbLogger } = ctx.vars
        const startTime = Date.now()
const extractLastModified = normalizeTimestamp(await extract.lastModified(ctx))
        const loadLastModified = normalizeTimestamp(await load.lastModified(ctx))
        if (!ctx.vars.runAnyways && extractLastModified && extractLastModified <= loadLastModified)
            return etlLogger.info({ t: 'etl is already done', extractLastModified, loadLastModified } , {} , {ctx})

        etlLogger.info({t: 'etl start' }, {}, {ctx})
        dbLogger?.info?.({t: 'etl start' }, {}, {ctx})

        try {
            etlLogger.status('enrichBefore...')
            ctx = await enrichBefore(ctx)
            etlLogger.status('extracting...')
            ctx = await extract.extractFromDB(ctx)
            if (Array.isArray(ctx.data)) ctx.data[Symbol.for('bigData')] = `${etlId} ${ctx.jbCtx.lexicalParentPath}`
            const extracted = ctx.data
            etlLogger.info({t: `extracted`, type: typeof extracted, isArray: Array.isArray(extracted), length: extracted?.length, duration: Date.now() - startTime}, {}, {ctx})
            etlLogger.status('enrichAfterExtract...')
            ctx = await enrichAfterExtract(ctx)
            etlLogger.status('transforming...')
            ctx = await transform(ctx)
            if (Array.isArray(ctx.data)) ctx.data[Symbol.for('bigData')] = `${etlId} ${ctx.jbCtx.lexicalParentPath}`
            const data = ctx.data
            etlLogger.info({t: 'transformed data', length: data?.length, duration: Date.now() - startTime}, {}, {ctx})
            etlLogger.status('loading into DB...')
            await load.saveToDB(ctx)
            const recordsCount = Array.isArray(data) ? data.length : 1
            etlLogger.info({t: 'etl complete', etlId, status: 'success', recordsCount, duration: Date.now() - startTime}, {}, {ctx})
            const result = { ...coreUtils.harvestLogs(ctx) }
            return result
        } catch (_error) {
            const error = _error.stack || _error
            const result = { ...coreUtils.harvestLogs(ctx) }
            etlLogger.error({t: 'etl failed', etlId, status: 'error', duration: Date.now() - startTime}, {error}, {ctx})
            return { ...result, error }
        }
    }
})

Component('etls', {
  moreTypes: 'etl<etl>',
  params: [
    {id: 'etls', type: 'etl<etl>[]', dynamic: true, composite: true},
  ],
  impl: async (_ctx, { etlLogger, etlId },{etls}) => {
        etlLogger = etlLogger || dsls.test.logger.etlLogger.$runWithCtx(_ctx)
        etlId = etlId || `etl-${Math.random().toString(36).slice(2,8)}`
        const ctx = _ctx.setVars({ etlLogger, etlId })
        const results = []
        const profiles = coreUtils.asArray(etls.profile), total = profiles.length
        const scope = _ctx.jbCtx.lexicalParentPath || etlId
        const ids = profiles.map((_, i) => `${scope}:${i + 1}`)
        const labels = profiles.map((profile, i) => {
            const compId = typeof profile.$ === 'string' ? profile.$ : profile.$?.id
            return compId?.split('>').at(-1) || `etl-${i + 1}`
        })
        for (const [index, profile] of profiles.entries()) {
            const child = labels[index], step = ids[index], start = Date.now()
            etlLogger.stepPlan(ids, labels)
            etlLogger.step(step, child)
            const result = await ctx.runInnerArg(etls, index)
            results.push(result)
            etlLogger.stepPlan(ids, labels)
            result?.error ? etlLogger.progress({step, t: child, status: 'error'}) : etlLogger.stepDone(step, child)
            etlLogger.info({ t: 'etl child complete', child, step: index + 1, total, duration: Date.now() - start,
                status: result?.error ? 'error' : 'success' }, {}, {ctx})
            if (result?.error) return { ...coreUtils.harvestLogs(ctx), results, error: result.error }
        }
        return { ...coreUtils.harvestLogs(ctx), results }
  }
})

Component('extract', {
    type: 'extract<etl>',
    params: [
        {id: 'title', as: 'string', dynamic: true, byName: true },
        {id: 'extractFromDB', type: 'ctx-enricher<tgp>', dynamic: true},
        {id: 'lastModified', as: 'string', dynamic: true }
    ]
})

Component('extractByUrl', {
    type: 'extract<etl>',
    params: [
        {id: 'url', as: 'string', dynamic: true}
    ],
    impl: (_ctx,{},{url}) => ({
        title: ctx => url(ctx),
        extractFromDB: async ctx => ctx.setData(await (await wfetch2(url(ctx), { method: 'GET' }, ctx)).json()),
        lastModified: async ctx => {
            const res = await wfetch2(url(ctx), { method: 'HEAD' }, ctx)
            return res.headers?.get('Last-Modified')
        }
    })
})

Component('loadIntoUrl', {
    type: 'load<etl>',
    params: [
        {id: 'url', as: 'string', dynamic: true}
    ],
    impl: (_ctx,{},{url}) => ({
        saveToDB: async ctx => wfetch2(url(ctx), { method: 'PUT', body: ctx.data }, ctx),
        lastModified: async ctx => {
            const res = await wfetch2(url(ctx), { method: 'HEAD' }, ctx)
            return res.headers?.get('Last-Modified')
        }
    })
})

Component('wonderPut', {
    type: 'action<common>',
    params: [
        {id: 'url', as: 'string', dynamic: true},
        {id: 'body', dynamic: true, defaultValue: '%%'}
    ],
    impl: async (ctx, {}, {url, body}) => wfetch2(url(ctx), { method: 'PUT', body: body(ctx) }, ctx)
})

// coerce a bare string: a url pattern (has ://, e.g. room://, signedRoom://, room:gcs//) → cachedWonderUrl (db-drivers GET,
// cached); else a local path → localFile. Lets fileQuery take from:'room://.../x.json' instead of wrapping in cachedWonderUrl.
TgpType('cli-extract','etl', { typescript: '{ inputFile(ctx<etlLogger>): filePath, shortName: string, lastModified(ctx<etlLogger>): dateString }',
  coerce: s => /:\/\//.test(s) ? dsls.etl['cli-extract'].cachedWonderUrl(s) : dsls.etl['cli-extract'].localFile(s) })
TgpType('cli-transform','etl', { typescript: '{ cmd(ctx<etlLogger, inputFile, outputFile>): bashCommand }'})
TgpType('cli-load','etl', { typescript: '{ save(ctx<etlLogger, outputFile>), lastModified(ctx<etlLogger>): dateString, etlAsQuery?(ctx<etlLogger>) }'})

Component('cliEtl', {
    moreTypes: 'etl<etl>',
    description: 'file-based ETL using CLI tools for streaming transforms',
    params: [
        {id: 'extract', type: 'cli-extract<etl>'},
        {id: 'moreFiles', type: 'cli-extract<etl>[]', byName: true},
        {id: 'transform', type: 'cli-transform<etl>'},
        {id: 'load', type: 'cli-load<etl>'}
    ],
    impl: async (_ctx, { etlLogger, etlId }, { extract, moreFiles, transform, load }) => {
        etlLogger = etlLogger || dsls.test.logger.etlLogger.$runWithCtx(_ctx)
        etlId = etlId || `etl-${Math.random().toString(36).slice(2,8)}`
        let ctx = _ctx.setVars({ etlLogger, etlId })
        const { dbLogger } = ctx.vars
        const startTime = Date.now()

        const allExtracts = [extract, ...coreUtils.asArray(moreFiles)]
        // cache fresh? compare source remote mtime vs cached output mtime. source mtime = a GCS HEAD over the net
        // (wfetchHeadMs ~340-550ms, the HIT's dominant cost); loadLmMs = local stat; etlAsQueryMs = local cat+parse.
        let _t = Date.now(); const _ms = () => { const d = Date.now() - _t; _t = Date.now(); return d }
        const extractLastModified = (await Promise.all(allExtracts.map(e => e.lastModified(ctx, ctx.vars))))
            .map(normalizeTimestamp).filter(Boolean).sort().pop()
        const wfetchHeadMs = _ms()
        const loadLastModified = normalizeTimestamp(await load.lastModified(ctx, ctx.vars))
        const loadLmMs = _ms()
        if (!ctx.vars.runAnyways && extractLastModified && loadLastModified && extractLastModified <= loadLastModified) {
            etlLogger.info({ t: 'etl is already done', extractLastModified, loadLastModified, wfetchHeadMs, loadLmMs }, {}, {ctx})
            const r = load.etlAsQuery ? await load.etlAsQuery(ctx, ctx.vars) : null
            etlLogger.info({ t: 'etlAsQuery (cache read) done', etlAsQueryMs: _ms() }, {}, {ctx})
            return r
        }

        etlLogger.info({ t: 'cliEtl start' }, {}, {ctx})
        dbLogger?.info?.({ t: 'cliEtl start' }, {}, {ctx})

        try {
            etlLogger.status('resolving input file...')
            const inputFile = await extract.inputFile(ctx, ctx.vars)
            const outputFile = `/tmp/etl-${etlId}-output`

            // moreFiles are exposed to the transform as moreInputFiles[] so SQL can reference them via $moreFile<N>.
            // Paths may be relative; duckdb resolves them against the server's cwd where runBashScript runs.
            const moreInputFiles = []
            for (const f of coreUtils.asArray(moreFiles)) {
                const fPath = await f.inputFile(ctx, ctx.vars)
                moreInputFiles.push(fPath)
                etlLogger.info({ t: 'more file ready', file: fPath }, {}, {ctx})
            }
            ctx = ctx.setVars({ inputFile, outputFile, moreInputFiles })
            etlLogger.info({ t: 'input ready', inputFile: ctx.vars.inputFile, duration: Date.now() - startTime }, {}, {ctx})

            etlLogger.status('running transform...')
            const cmd = await transform.cmd(ctx, ctx.vars)
            // GNU time reports peak RSS to stderr; macOS time exists but does not support -v.
            const timed = (await coreUtils.runBashScript('/usr/bin/time -v true')).error ? cmd : `/usr/bin/time -v ${cmd}`
            const cmdStart = Date.now()
            const res = await coreUtils.runBashScript(timed)
            const stderr = res.error ? String(res.stderr ?? '').replace(/^\t[A-Z][^\n]*$/gm, '').trim() : ''
            if (res.error) {
                const error = stderr || res.error
                etlLogger.error({ t: 'cli transform failed', etlId, duration: Date.now() - startTime }, {error}, {ctx})
                return { ...coreUtils.harvestLogs(ctx), error }
            }
            const cliMs = Date.now() - cmdStart
            const maxRssKb = +(String(res.stderr ?? '').match(/Maximum resident set size \(kbytes\): (\d+)/)?.[1]) || undefined
            if (stderr) etlLogger.info({ t: 'transform stderr', stderr }, {}, {ctx})
            const statRes = await coreUtils.runBashScript(`stat -c%s '${outputFile}' 2>/dev/null || echo 0`)
            const outputBytes = +(String(statRes.stdout ?? '0').trim())
            etlLogger.info({ t: 'transform done', cmd, cliMs, maxRssKb, outputBytes, duration: Date.now() - startTime }, {}, {ctx})

            etlLogger.status('loading output...')
            await load.save(ctx, ctx.vars)

            etlLogger.info({ t: 'cliEtl complete', etlId, status: 'success', duration: Date.now() - startTime }, {}, {ctx})
            return load.etlAsQuery ? load.etlAsQuery(ctx, ctx.vars) : { ...coreUtils.harvestLogs(ctx) }
        } catch (_error) {
            const error = _error.stack || _error
            etlLogger.error({ t: 'cliEtl failed', etlId, status: 'error', duration: Date.now() - startTime }, {error}, {ctx})
            return { ...coreUtils.harvestLogs(ctx), error }
        }
    }
})

// cronjobEtl — Linux/macOS cron-driven ETL. macOS prerequisite (one-time):
//   brew install coreutils flock
//   echo 'export PATH="$(brew --prefix coreutils)/libexec/gnubin:$PATH"' >> ~/.zshrc
// (gives `timeout`, `flock`, GNU `date +%s%3N` for millisecond timestamps)
//
// Operational commands (replace <id> with the cron's id):
//   view installed:        crontab -l | grep cronjobEtl
//   remove (interactive):  crontab -e            ← delete the cronjobEtl:<id> line
//   remove (scripted):     crontab -l | grep -v 'cronjobEtl:<id>' | crontab -
//   manual run:            /tmp/cron-<id>.sh
//   live tail:             tail -f /tmp/cron-<id>.log
//   inspect tick script:   cat /tmp/cron-<id>.sh
//   state:                 cat /tmp/cron-<id>.json
Component('cronjobEtl', {
    moreTypes: 'etl<etl>',
    description: 'Cron ETL writes its tick script, prevents overlapping runs, refreshes the crontab entry, and starts one immediate run.',
    params: [
        {id: 'id', as: 'string'},
        {id: 'extract',   as: 'string', asIs: true},
        {id: 'transform', as: 'string', asIs: true},
        {id: 'load',      as: 'string', asIs: true},
        {id: 'intervalSec', as: 'number', defaultValue: 600},
        {id: 'timeoutSec', as: 'number', defaultValue: 300}
    ],
    impl: async (ctx, {}, { id, extract, transform, load, intervalSec, timeoutSec }) => {
        const script = `/tmp/cron-${id}.sh`,   state = `/tmp/cron-${id}.json`
        const lock   = `/tmp/cron-${id}.lock`, log   = `/tmp/cron-${id}.log`
        const tag    = `# cronjobEtl:${id}`
        const body   = `${extract}\n${transform}\n${load}`
        const intervalMin = Math.max(1, Math.min(59, Math.round(intervalSec / 60)))
        const cwd = String((await coreUtils.runBashScript('pwd')).stdout ?? '').trim()
        const tickScript = `#!/bin/bash
for d in /opt/homebrew/opt/coreutils/libexec/gnubin /usr/local/opt/coreutils/libexec/gnubin /opt/homebrew/bin /usr/local/bin; do
  [ -d "$d" ] && export PATH="$d:$PATH"
done
exec 9>'${lock}'
flock -n 9 || exit 0
cd '${cwd}'
echo "[$(date -u +%FT%TZ)] tick ${id}"
timeout ${timeoutSec} bash <<'__TICK__'
${body}
__TICK__
printf '{"lastRun":%s,"id":"${id}"}' "$(date +%s%3N)" > '${state}'
`
        const cronLine = `*/${intervalMin} * * * * '${script}' >> '${log}' 2>&1 ${tag}`
        await coreUtils.runBashScript(`cat > '${script}' << '__SCRIPT_EOF__'\n${tickScript}\n__SCRIPT_EOF__\nchmod +x '${script}'`)
        const existingCron = String((await coreUtils.runBashScript(`crontab -l 2>/dev/null`)).stdout ?? '')
        if (!existingCron.split('\n').some(l => l === cronLine))
            await coreUtils.runBashScript(`(crontab -l 2>/dev/null | grep -v '${tag}'; echo "${cronLine}") | crontab -`)
        const heldRes = await coreUtils.runBashScript(`lsof '${lock}' >/dev/null 2>&1 && echo 1 || echo 0`)
        let running = String(heldRes.stdout ?? '0').trim() === '1'
        if (!running) {
            await coreUtils.runBashScript(`nohup '${script}' >> '${log}' 2>&1 </dev/null & disown`)
            running = true
        }
        let s = {}
        try { s = JSON.parse((await coreUtils.runBashScript(`cat '${state}' 2>/dev/null || echo {}`)).stdout || '{}') } catch {}
        return { ...s, running }
    }
})

Component('localFile', {
    type: 'cli-extract<etl>',
    params: [{id: 'path', as: 'string'}],
    impl: (_ctx, {}, { path }) => ({
        path,
        inputFile: async (ctx, { etlLogger }) => {
            const exists = await coreUtils.runBashScript(`test -f '${path}' && echo 1 || echo 0`)
            if (String(exists.stdout ?? '').trim() !== '1') {
                const msg = `File not found: ${path} — place the data file at this path before running`
                etlLogger?.status(msg)
                await coreUtils.runBashScript(`echo "${msg}" >&2`)
                throw new Error(msg)
            }
            return path
        },
        lastModified: async () => {
            const res = await coreUtils.runBashScript(`stat -c%Y '${path}' 2>/dev/null || echo ""`)
            const mtime = String(res.stdout ?? '').trim()
            return mtime ? mtime : null
        }
    })
})

async function ensureCli(name, installCmd) {
    const res = await coreUtils.runBashScript(`which ${name}`)
    if (!String(res.stdout ?? '').trim()) throw new Error(`${name} not installed. Run: ${installCmd}`)
}

Component('mlr', {
    type: 'cli-transform<etl>',
    params: [{id: 'expression', as: 'string', asIs: true}],
    impl: (_ctx, {}, { expression }) => ({
        cmd: async (ctx, { inputFile, outputFile }) => {
            await ensureCli('mlr', 'sudo apt-get install miller')
            return `mlr ${expression} ${inputFile} > ${outputFile}`
        }
    })
})

Component('duckdb', {
  type: 'cli-transform<etl>',
  params: [
    {id: 'sql', as: 'text', dynamic: true, description: 'use {%$x%} instead of %$x%. %$x% will not work to allow % in sql!!'},
    {id: 'format', as: 'string', defaultValue: 'CSV, HEADER'},
    {id: 'prelude', as: 'text', dynamic: true, byName: true}
  ],
  impl: (_ctx, {}, { sql, format, prelude }) => ({
        cmd: async (ctx, { inputFile, outputFile, moreInputFiles }) => {
            await ensureCli('duckdb', 'curl -fsSL https://install.duckdb.org | sh')
            const vars = { inputFile, outputFile, moreInputFiles,
                ...Object.fromEntries(moreInputFiles.map((file, i) => [`moreFile${i}`, file])) }
            const resolve = arg => arg?.profile && coreUtils.embedBraceVars(arg.profile, arg.lexicalCtx.setVars(vars))
            return `duckdb -noheader -c "${resolve(prelude) || ''} COPY (${resolve(sql)}) TO '${outputFile}' (FORMAT ${format})"`
        }
    })
})

Component('polars', {
    type: 'cli-transform<etl>',
    params: [{id: 'expression', as: 'text', asIs: true}],
    impl: (_ctx, {}, { expression }) => ({
        cmd: async (ctx, { inputFile, outputFile }) => {
            await ensureCli('python3', 'sudo apt-get install python3')
            const res = await coreUtils.runBashScript('python3 -c "import polars" 2>&1')
            if (res.stderr?.includes('ModuleNotFoundError')) throw new Error('polars not installed. Run: pip install polars')
            const scriptPath = `/tmp/etl-polars-${Date.now()}.py`
            const script = `import polars as pl\nfrom polars import col, lit, len\ndf = pl.scan_csv("${inputFile}")\ndf = df.${expression}\ndf.collect().write_csv("${outputFile}")`
            await coreUtils.runBashScript(`cat > '${scriptPath}' << 'PYEOF'\n${script}\nPYEOF`)
            return `python3 ${scriptPath}`
        }
    })
})

const normalizeTimestamp = v => v && new Date(/^\d+$/.test(String(v)) ? +v * 1000 : v).toISOString()

// cache the source under the canonical wcache path (/tmp/wcache/<bucket>/<path>) so dev + lambda + parallel-download share it
const urlToCachePath = (u, ctx) => wresolve(u, ctx.setVars({ db: 'wcache' }))

Component('cachedWonderUrl', {
    type: 'cli-extract<etl>',
    params: [{id: 'url', as: 'string', dynamic: true}],
    impl: (_ctx, {}, { url }) => ({
        url,
        inputFile: async (ctx) => await wcachePopulate(url(ctx), ctx, { validate: true }) || await urlToCachePath(url(ctx), ctx),
        lastModified: async (ctx) => {
            const res = await wfetch2(url(ctx), { method: 'HEAD' }, ctx.setVars({ db: 'bucket' }))
            return res?.headers?.get?.('Last-Modified') || null
        }
    })
})

Component('copyToFile', {
    type: 'cli-load<etl>',
    params: [{id: 'path', as: 'string'}],
    impl: (_ctx, {}, { path }) => ({
        save: async (ctx, { etlLogger, outputFile }) => {
            await coreUtils.runBashScript(`mkdir -p "$(dirname '${path}')" && cp '${outputFile}' '${path}'`)
            etlLogger?.info({ t: 'copied', from: outputFile, to: path }, {}, {ctx})
        },
        lastModified: async () => {
            const res = await coreUtils.runBashScript(`stat -c%Y '${path}' 2>/dev/null || echo ""`)
            const mtime = String(res.stdout ?? '').trim()
            return mtime ? mtime : null
        }
    })
})

Component('toWonderUrl', {
    type: 'cli-load<etl>',
    params: [{id: 'url', as: 'string', dynamic: true}],
    impl: (_ctx, {}, { url }) => ({
        save: async (ctx, { etlLogger, outputFile }) => {
            const u = url(ctx)
            await wfetch2(u, { method: 'PUT', body: outputFile, headers: { 'x-wonder-body': 'localFile' } }, ctx)
            etlLogger?.info({ t: 'uploaded', url: u }, {}, {ctx})
        },
        lastModified: async (ctx) => {
            const res = await wfetch2(url(ctx), { method: 'HEAD' }, ctx)
            return res?.headers?.get?.('Last-Modified') || null
        }
    })
})
