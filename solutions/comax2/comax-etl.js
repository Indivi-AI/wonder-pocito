import { dsls, coreUtils } from '@jb6/core'
import '@jb6/common'
import '@wonder/db/etl/etl-dsl.js'

const { common: { Data }, test: { logger: { etlLogger } } } = dsls

// Query-aligned row groups: latest month, four calendar quarters, then calendar years.
Data('monthQuarterYear', {
  moreTypes: 'etl<etl>',
  params: [
    {id: 'source', as: 'string', options: 'lines,header', defaultValue: 'lines', description: 'lines = header-enriched fact; header = self-dated KupaDoc_Header'},
    {id: 'srcDir', as: 'string', defaultValue: 'files/rooms/comax2/usersRO/parquet/OEM_BI_4466'},
    {id: 'outFile', as: 'string', description: 'defaults to <srcDir>/KupaDoc_<Lines|Header>-mqy.parquet'}
  ],
  impl: async (_ctx, { etlId }, { source, srcDir, outFile }) => {
    const log = _ctx.vars.etlLogger || etlLogger.$runWithCtx(_ctx), ctx = _ctx.setVars({ etlId: etlId || 'monthQuarterYear' })
    const lines = `${srcDir}/KupaDoc_Lines.parquet`, headers = `${srcDir}/KupaDoc_Header.parquet`
    const q = source === 'header'
      ? `select h.*, h.DateDoc::date sale_date, strftime(h.DateDoc,'%Y-%m') sale_month from read_parquet('${headers}') h order by h.DateDoc, h.C`
      : `select l.*, h.DateDoc::date sale_date, strftime(h.DateDoc,'%Y-%m') sale_month
        from read_parquet('${lines}') l join read_parquet('${headers}') h on l.KupaDocC=h.C order by h.DateDoc, l.C`
    outFile = outFile || `${srcDir}/KupaDoc_${source === 'header' ? 'Header' : 'Lines'}-mqy.parquet`
    const py = `import os, duckdb, pyarrow as pa, pyarrow.parquet as pq
con = duckdb.connect(); con.execute("SET memory_limit='4GB';SET threads=2;SET temp_directory='/tmp/duck-spill';")
q = ${JSON.stringify(q)}
last = con.execute("select year(max(DateDoc))*12+month(max(DateDoc))-1 from read_parquet('${headers}')").fetchone()[0]
month_num = lambda m: int(m[:4])*12+int(m[5:])-1
quarter_from = last-last%3-9
segment = lambda m: m if month_num(m) == last else f'{m[:4]}-Q{(int(m[5:])-1)//3+1}' if month_num(m) >= quarter_from else m[:4]
tmp = ${JSON.stringify(outFile)} + '.tmp'; w = None; segments = set()
pending = []; current = None
def flush():
    global pending
    if pending:
        t = pa.concat_tables(pending); w.write_table(t, row_group_size=t.num_rows); pending = []
for b in con.execute(q).fetch_record_batch(1000000):
    t = pa.Table.from_batches([b]); ss = [segment(m) for m in t.column('sale_month').to_pylist()]
    cuts = [0] + [i for i in range(1, len(ss)) if ss[i] != ss[i-1]] + [len(ss)]
    if w is None: w = pq.ParquetWriter(tmp, t.schema)
    for a, z in zip(cuts, cuts[1:]):
        s = ss[a]
        if current != s: flush(); current = s
        pending.append(t.slice(a, z-a))
        segments.add(s)
flush(); w.close()
groups = con.execute(f"select count(distinct row_group_id) from parquet_metadata('{tmp}')").fetchone()[0]
if groups != len(segments): raise RuntimeError(f'MQY segments {len(segments)} != row groups {groups}')
os.replace(tmp, ${JSON.stringify(outFile)}); print('DONE', len(segments), flush=True)`
    log.info({ t: 'monthQuarterYear start', outFile }, {}, { ctx })
    const r = await coreUtils.runBashScript(`python3 - <<'PYEOF'\n${py}\nPYEOF`)
    if (!/DONE/.test(r.stdout || '')) { log.error({ t: 'pyarrow write failed', stderr: r.stderr, stdout: r.stdout }, {}, { ctx }); throw new Error(r.stderr || 'pyarrow failed') }
    const segments = (r.stdout.match(/^DONE (\d+)/m) || [])[1]
    log.info({ t: 'monthQuarterYear complete', outFile, segments: +segments }, {}, { ctx })
    return { ...coreUtils.harvestLogs(ctx) }
  }
})
