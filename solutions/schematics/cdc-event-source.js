// avroCdcSource — a Google Datastream MySQL-CDC avro reader as an event-source<bi>.
// Emits the same cdcRow shape comax-cdc-cube.js synthesises, except here it is native: Datastream already
// gives us table / change_type / primary key / row image, so nothing is faked.
//
//   { t:'cdcRow', table, op, id, timestamp, ts_ms, binlog_pos, is_deleted, after: {...row image} }
//
// TWO CONTRACTS materializeFromEvents depends on, both satisfied here:
//   1. events arrive keyField-CONTIGUOUS — materializePeriod throws if a key reappears.
//   2. reduceObject re-sorts each group by ev.timestamp. That is millisecond-granular, so two changes in the
//      same ms would tie. We emit pre-sorted by (id, ts_ms, binlog_pos) and JS sort is STABLE, so the binlog
//      position — the real total order — survives the re-sort. Ordering by source_timestamp instead would be
//      wrong: it is second-granular.
//
// The lag window is why this is not a plain directory read. A click's payout is written days later, and that
// UPDATE lands in a LATER day's avro files. So we scan period..period+lagDays and keep every version of the
// rows whose own dt falls in the period — complete history for that day's rows, nothing from neighbouring days.
//
// Bronze is a local read-only mirror of gs://schematics-gcs-dump, pulled with:
//   gcloud storage cp -r "gs://schematics-gcs-dump/schemathics_crm_leadcenter_<table>/2026/05/15/*" <root>/<table>/2026/05/15/

import { dsls, coreUtils } from '@jb6/core'
import '@jb6/common'
import '@wonder/bi/bi-common.js'

const { tgp: { TgpType } } = dsls
const EventSource = TgpType('event-source', 'bi')

// python+fastavro, not duckdb: the duckdb avro extension has no osx_arm64 build. Sorting in python is fine —
// a busy day is ~90K change records, and the reduce downstream is what streams, not this.
// Reads gs:// directly — no local mirror. The bucket is in our own project, so the same code path serves a
// laptop (ADC) and Cloud Run (service account); nothing is copied and nothing can be purged out from under it.
// A local path still works, so an offline mirror remains a valid override.
const readerPy = (dirs, table, keyField, dateField, period, out) => `
import fastavro, glob, json, datetime, io
from concurrent.futures import ThreadPoolExecutor
DIRS = ${JSON.stringify(dirs)}
# Datastream writes ~5,000 tiny avro per table-day, so a day is thousands of round-trips, not one big read.
# Fetched with a thread pool: sequential took >6min for three days, which a nightly 22-day rebuild could never
# afford. Order is irrelevant — rows are sorted by (id, ts_ms, binlog_pos) below, so concurrency cannot change
# the output, only the wait.
def open_all(dirs):
    if dirs and dirs[0].startswith('gs://'):
        from google.cloud import storage
        client = storage.Client()
        blobs = []
        for d in dirs:
            bucket, _, prefix = d[5:].partition('/')
            blobs += [b for b in client.list_blobs(bucket, prefix=prefix + '/') if b.name.endswith('.avro')]
        with ThreadPoolExecutor(max_workers=64) as pool:
            for data in pool.map(lambda b: b.download_as_bytes(), blobs):
                yield io.BytesIO(data)
    else:
        for d in dirs:
            for fn in glob.glob(d + '/**/*.avro', recursive=True):
                yield open(fn, 'rb')
rows = []
nfiles = 0
for fh in open_all(DIRS):
    nfiles += 1
    with fh:
        for r in fastavro.reader(fh):
            p, m = r['payload'], r['source_metadata']
            dt = p.get(${JSON.stringify(dateField)})
            if dt is None or str(dt)[:10] != ${JSON.stringify(period)}: continue
            after = {k: (v.isoformat() if isinstance(v,(datetime.datetime,datetime.date)) else v)
                     for k, v in p.items()}
            rows.append({'t':'cdcRow','table':${JSON.stringify(table)},'op':m.get('change_type'),
                'id': str(p.get(${JSON.stringify(keyField)})), 'timestamp': r['sort_keys'][0],
                'ts_ms': r['sort_keys'][0], 'binlog_pos': r['sort_keys'][2],
                'is_deleted': bool(m.get('is_deleted')), 'after': after})
rows.sort(key=lambda e: (e['id'], e['ts_ms'], e['binlog_pos']))
with open(${JSON.stringify(out)},'w') as f:
    for e in rows: f.write(json.dumps(e) + '\\n')
print('AVRO_CDC files=%d rows=%d keys=%d' % (nfiles, len(rows), len({e['id'] for e in rows})))
`

const dayDirs = (root, tablePrefix, table, period, lagDays) => Array.from({ length: lagDays + 1 }, (_, i) => {
  const d = new Date(Date.parse(period + 'T00:00:00Z') + i * 86400000).toISOString().slice(0, 10).split('-')
  return `${root}/${tablePrefix}${table}/${d[0]}/${d[1]}/${d[2]}`
})

EventSource('avroCdcSource', {
  description: 'Datastream MySQL-CDC avro → keyField-contiguous cdcRow events, including later days\' updates to this day\'s rows',
  params: [
    { id: 'bronzeRoot', as: 'string', defaultValue: 'gs://schematics-gcs-dump',
      description: 'the Datastream sink, read in place. gs:// (any project we can read) or a local mirror path' },
    { id: 'tablePrefix', as: 'string', defaultValue: 'schemathics_crm_leadcenter_',
      description: "Datastream names each table dir <prefix><table>; a hand-made local mirror usually has none" },
    { id: 'table', as: 'string', mandatory: true, description: 'CDC table dir under bronzeRoot, e.g. links_tracking_clicks' },
    { id: 'primaryKey', as: 'string', defaultValue: 'id', description: 'the MySQL primary key, from source_metadata.primary_keys' },
    { id: 'dateField', as: 'string', defaultValue: 'dt', description: 'payload field whose date decides which period a row belongs to' },
    { id: 'lagDays', as: 'number', defaultValue: 2,
      description: 'extra following days to scan for late UPDATEs (payouts land after the click). ' +
      'ctx.vars.lagDays OVERRIDES this, so a matured period can be rebuilt wide — Var("lagDays", 21) — ' +
      'without editing the cube that a nightly incremental build also uses' }
  ],
  impl: (_, {}, { bronzeRoot, tablePrefix, table, primaryKey, dateField, lagDays }) => ({
    async read(ctx, period) {
      const log = ctx?.vars?.biLogger, t0 = Date.now()
      const lag = ctx?.vars?.lagDays ?? lagDays
      const dirs = dayDirs(bronzeRoot, tablePrefix, table, period, lag)
      // the window is part of the OUTPUT's identity: a 2-day and a 21-day build of the same period are
      // different answers, so they must not share a scratch file
      const jsonl = `/tmp/avroCdc-${table}-${period}-lag${lag}.jsonl`
      const r = await coreUtils.runBashScript(
        `python3 <<'__PY_EOF__'\n${readerPy(dirs, table, primaryKey, dateField, period, jsonl)}\n__PY_EOF__`)
      const summary = String(r.stdout ?? '').match(/AVRO_CDC .*/)?.[0]
      if (!summary) throw new Error(r.stderr || 'avroCdcSource: reader produced no summary')
      const { createReadStream } = await import('fs')
      return { sourceCb: (t, sink) => {
        if (t !== 0) return
        sink(0, () => {})
        let buf = '', events = 0
        const emit = line => { if (line) { events++; sink(1, JSON.parse(line)) } }
        createReadStream(jsonl, { encoding: 'utf8' })
          .on('data', c => { buf += c; const parts = buf.split('\n'); buf = parts.pop(); parts.forEach(emit) })
          .on('end', () => { emit(buf)
            log?.info?.({ t: 'eventSource.read', source: 'avroCdcSource', table, period, dirs,
              lagDays: lag, summary, events, ms: Date.now() - t0 }, {}, { ctx })
            sink(2) })
          .on('error', e => sink(2, e))
      } }
    }
  })
})
