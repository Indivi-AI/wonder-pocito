// buildCdcReference — the CDC tables that are read as BROADCAST LOOKUPS, each collapsed to one
// current-state parquet: the offer catalogue, the client list, and the settlement ledger.
//
// These are NOT built per period like the fact tables, and for the same reason in every case: a row here only
// emits an avro record when it CHANGES, so a single day contains whichever handful changed that day. Current
// state exists only as the latest version of every row across ALL history.
//
// THE LEDGER EARNS ITS PLACE HERE THE HARD WAY. It looks like a daily fact — a payment is booked on a day —
// so it was first built partitioned by booking day with the usual 2-day lag. That silently lost 24 of 26
// HELOC sales, because a `disposition` is written back WEEKS after the money is booked and a per-period
// window truncates exactly those late updates. Partition a table by when it was created and you cannot see
// what it became.
//
//   runTest({testId: 'buildCdcReference'})
//
// Only the columns the cube needs are carried across. `clients` also holds password and webhook columns and
// they stay in bronze — a lookup table read by every query is the last place credentials belong.

import { dsls, coreUtils } from '@jb6/core'
import '@jb6/common'
import '@wonder/db/etl/etl-dsl.js'

const { tgp: { Component }, test: { logger: { etlLogger } } } = dsls

// Reads the Datastream sink in place, exactly like avroCdcSource. These three tables are replayed over their
// WHOLE history, which is far more objects than a single fact day, so the same thread pool applies — order is
// irrelevant here too, since latest-wins is decided by sort_keys, not by read order.
const replayPy = (root, tablePrefix, outDir, refs) => `
import fastavro, glob, json, datetime, os, io
from concurrent.futures import ThreadPoolExecutor
REFS = ${JSON.stringify(refs)}
ROOT = ${JSON.stringify(root)}
PREFIX = ${JSON.stringify(tablePrefix)}
def open_all(table):
    base = ROOT + '/' + PREFIX + table
    if ROOT.startswith('gs://'):
        from google.cloud import storage
        client = storage.Client()
        bucket, _, prefix = base[5:].partition('/')
        blobs = [b for b in client.list_blobs(bucket, prefix=prefix + '/') if b.name.endswith('.avro')]
        with ThreadPoolExecutor(max_workers=64) as pool:
            for data in pool.map(lambda b: b.download_as_bytes(), blobs):
                yield io.BytesIO(data)
    else:
        for fn in glob.glob(base + '/**/*.avro', recursive=True):
            yield open(fn, 'rb')
for r in REFS:
    nfiles = 0
    latest = {}
    for fh in open_all(r['table']):
        nfiles += 1
        with fh:
            for rec in fastavro.reader(fh):
                p, m = rec['payload'], rec['source_metadata']
                k = str(p.get(r['pk']))
                # latest-wins across the WHOLE history: epoch ms then binlog position, the same total order
                # the fact tables use. A tombstone wins too, so a retired offer is visibly retired.
                ord_ = (rec['sort_keys'][0], rec['sort_keys'][2])
                if k not in latest or ord_ > latest[k][0]:
                    row = {c: p.get(c) for c in r['cols']}
                    row = {c: (v.isoformat() if isinstance(v,(datetime.datetime,datetime.date)) else v)
                           for c, v in row.items()}
                    row['is_deleted'] = bool(m.get('is_deleted'))
                    latest[k] = (ord_, row)
    out = os.path.join(${JSON.stringify(outDir)}, r['out']).replace('.parquet', '.jsonl')
    with open(out, 'w') as f:
        for _, row in latest.values(): f.write(json.dumps(row) + '\\n')
    print('CDC_REF table=%s files=%d rows=%d out=%s' % (r['table'], nfiles, len(latest), out))
`

const toParquetSql = (outDir, refs) => refs.map(r =>
  `COPY (SELECT * FROM read_json_auto('${outDir}/${r.out.replace('.parquet', '.jsonl')}'))
     TO '${outDir}/${r.out}' (FORMAT PARQUET, COMPRESSION ZSTD);`).join('\n')

Component('buildCdcReference', {
  moreTypes: 'etl<etl>',
  description: 'replay the whole CDC history of the slowly-changing tables → one current-state parquet each',
  params: [
    { id: 'bronzeRoot', as: 'string', defaultValue: 'gs://schematics-gcs-dump',
      description: 'the Datastream sink, read in place. gs:// or a local mirror path' },
    { id: 'tablePrefix', as: 'string', defaultValue: 'schemathics_crm_leadcenter_' },
    { id: 'outDir', as: 'string', defaultValue: 'files/rooms/schematicsBI/usersRO/silver' },
    { id: 'refs', as: 'array', description: 'each entry: which CDC table, its primary key, and the columns worth keeping',
      defaultValue: [
        { table: 'links_tracking_links', pk: 'id', out: 'ref-offers.parquet',
          cols: ['id', 'offerId', 'client_id', 'category', 'name', 'is_active'] },
        { table: 'clients', pk: 'id', out: 'ref-clients.parquet',
          cols: ['id', 'company', 'client_status'] },
        // the settlement ledger. Grain is one payout ROW; turning that into "what a click earned" is an
        // aggregation, and it lives in the payouts lookup in schematics-cdc-cube.js where the column is read.
        { table: 'links_tracking_payouts', pk: 'id', out: 'ref-payouts.parquet',
          cols: ['id', 'clickId', 'offerId', 'payout', 'status', 'disposition', 'disposition_source', 'dt'] }
      ] }
  ],
  impl: async (_ctx, { etlId }, { bronzeRoot, tablePrefix, outDir, refs }) => {
    const ctx = _ctx.setVars({ etlId: etlId || 'buildCdcReference' })
    const log = _ctx.vars.etlLogger || etlLogger.$runWithCtx(_ctx)
    log.info({ t: 'buildCdcReference start', bronzeRoot, outDir }, {}, { ctx })
    const r = await coreUtils.runBashScript(
      `mkdir -p '${outDir}' && python3 <<'__PY_EOF__'\n${replayPy(bronzeRoot, tablePrefix, outDir, refs)}\n__PY_EOF__\n` +
      `duckdb <<'__SQL_EOF__'\n${toParquetSql(outDir, refs)}\n__SQL_EOF__`)
    const lines = String(r.stdout ?? '').match(/CDC_REF .*/g) || []
    if (lines.length !== refs.length) {
      log.error({ t: 'buildCdcReference failed', stderr: r.stderr, stdout: String(r.stdout ?? '').slice(0, 400) }, {}, { ctx })
      throw new Error(r.stderr || 'buildCdcReference: replay produced no summary')
    }
    log.info({ t: 'buildCdcReference complete', summary: lines }, {}, { ctx })
    return { ...coreUtils.harvestLogs(ctx), built: refs.map(x => x.out), summary: lines }
  }
})
