# Repo pointers for ETL cost work

## Already written, use rather than rebuild
- **`research/bq-bill-autopsy.sql`** — per-shape attribution over
  `INFORMATION_SCHEMA.JOBS`. Metadata-only, $0 to run, hashes query text so nothing identifiable leaves the
  project. Reports **both** currencies and infers the billing model (`billing_model='auto'`). Change
  `region-us` to the client's dataset region before running.
- **`research/bq-replacement-brief.md`** — the positioning audit. Read before writing
  anything client-facing; it records which claims are measured and which were projections.
- **`solutions/winner/`** — a complete worked example: `sql-sample.sql` (client model as received,
  do not edit), `sql-sample-duckdb.sql` (runnable port), `sql-sample-perday.sql` (partitioned rewrite),
  `winner-sql-parity-tests.js` (proves a rewrite equals the original).

## Where the cost levers live in code
- `wonder/bi/duckdb-utils.js` — if you are costing a DuckDB alternative, note `runDuckdbSqlByHost` caps
  `memory_limit` at **500MB** on node unless `ctx.vars.duckMemLimit` says otherwise. Compare like with like.
- `wonder/db/etl/etl-cron.js` — how Cloud Run Jobs get deployed here (region/bucket/project defaults,
  memory/cpu knobs). Its `run-etl.sh` records door-to-door `durationMs`, which is what actually bills.
- `wonder/bi/CLAUDE.md` — three-realm warning; read before touching anything shared.

## Memory files worth checking first (they may be stale — verify, don't quote)
- `winner-duckdb-vs-bq-measured` — carries a **corrected** header; the original `$0.14/run` figure priced a
  Cloud Run shape that OOMs, and its "5.22 GB scanned" is 34× smaller than one run per the client's own
  shape report. Treat every stored number as a hypothesis.
- `bq-benchmark-table-is-simulated` — the fan-out cost/latency table is a calculator, not measurements.

## The habit that matters
Every figure you repeat should trace to either (a) a client artifact you can point at, or (b) something you
ran. When those disagree, the client artifact wins and the stored number gets corrected at source.
