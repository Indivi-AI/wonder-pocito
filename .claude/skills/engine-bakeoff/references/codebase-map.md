# Read these before benchmarking anything in this repo

Ordered by how much grief skipping them causes. Read the whole file, not a grep hit — these are dense.

## 1. `wonder/bi/CLAUDE.md` — read FIRST, it is 8 lines
The bi layer runs in **three realms**: browser LIVE (duckdb-wasm), mac/node dev (duckdb CLI), linux room-lambda.
Changes safe in one realm routinely break another. Cross-realm contracts are pinned by guard tests
(`financeCube.realmReadPaths`, `financeCube.askAiWorkflowUtilsIntact`). **Run the full `financeCube.*` suite
after ANY change under `wonder/bi`, especially `duckdb-utils.js`.**

## 2. `wonder/bi/duckdb-utils.js` — the single gate every DuckDB query flows through
`runDuckdbSqlByHost(sql, ctx, {as, parseOnly, duckFlags})` is the ONLY way SQL reaches DuckDB. Everything
below is applied by it and will silently shape your measurements:

- **`memory_limit` defaults to `500MB` on node, `300MB` in the browser** (`ctx.vars.duckMemLimit` overrides).
  A bare `duckdb -c` from your shell uses ~80% of host RAM instead. **Benchmarking the cube against raw
  DuckDB without matching this compares a 500 MB engine to a 12 GB one.** Measured effect on the rollup
  stage at 300K: 0.58 s uncapped → 0.86 s at 500 MB.
- `SET temp_directory='/tmp'` on node; nothing in wasm (FILESYSTEM=0). On Cloud Run `/tmp` is tmpfs, so
  spill consumes the container's memory budget.
- SQL over **50 KB** is written to a temp `.sql` file and run with `-f` instead of `-c` (avoids E2BIG). Any
  generated multi-statement script hits this path.
- `as:` picks the return shape — `rows` | `value` | `text` | `raw` | `nonQuery`.
- Emits `{t:'duck.time', ms}` to `biLogger` for every non-parseOnly call — free per-query timing.

**`duckDBProfilingLogger`** (top of the same file) is the instrumentation you actually want for a bake-off:
`scanMs`, `e2eMs`, `bytesScanned`, per-column `colScan`, `rowGroupsScanned`, colsCache hit/miss bytes,
download waterfall with `maxConcurrency`, and the compiled SQL (`sql` / `compiledSql`). Prefer it over
wrapping things in `/usr/bin/time`.

`sqlEditor(...).compile()` is the cube→DuckDB compiler: parses to a DuckDB JSON AST, folds the
`sql-modifier<bi>` chain in phase order (`build` → `rewriteSource` → `finalize`), serialises back. Logs
`{t:'sqlEditor.compile', in, out, explanation}` — read `out` when a cube query behaves unexpectedly.

`readSourceFiles(paths)` picks `read_csv_auto` / `read_json` / `read_parquet` from the first path's extension.

## 3. `wonder/bi/materialization.js` — the BUILD side
`materializeFromEvents` and its three reducer phases. Grep-proof facts:
- **field phase** (`pick`, `withAggFunc`) sees only ONE object's events; **obj phase** sees the built obj;
  **period phase** (`rollupFields`) sees ALL the period's events and broadcasts back by grain.
- `keyField` may be a comma-separated composite; `keyOf` builds the group key and the source must arrive
  ordered by all of it or the contiguity guard throws.
- `materializePeriod` streams: one object's events in memory, flush on key change. It writes `silver-*.jsonl`
  AND echoes every event to `source-events-*.jsonl` (the drill source) — that echo is a full second
  serialization of the input.
- `at(obj, path)` re-splits the path string on **every call** — per event, per field. It is the single
  hottest line in the JS reduce (~72% of that function's cost at 6M calls).

## 4. `wonder/bi/bi-dsl.js` — the QUERY side
Every `TgpType` (`cube`, `silver-source`, `event-source`, `metric`, `dimension`, `parquet-file`,
`cache-strategy`, `sql-modifier`, `pick`, …), `resolveSilvers` (turns `parquetFiles[]` into `from %$name%`
vars), the cache strategies (`colsCache` | `fullFileCache` | `noCache`), and `cubeQuery`.

## 5. `wonder/bi/metrics.js`
`metricToSql` — `distinctCount(x)` → `count(distinct x)`, `agg(field)` → `agg(field)`, raw `sql` expressions
inline sibling metric names with cycle detection. Reused by `rollupFields`, so a rollup's aggregates are
ordinary `metric<bi>` profiles. `cubeVocab` renders the cube as LLM-readable vocabulary including `limits`.

## 6. `wonder/bi/event-sources.js`
`csvEventSource` / `parquetEventSource` (share one body; DuckDB `ORDER BY` the key columns into a JSONL that
the JS side streams) and `bucketUrlSourceJsonEvents` (GCS file-per-event, compose1024). Note
`bucketUrlSourceJsonEvents` derives its key from filenames and does **not** support composite keyFields.

## 7. Running things
- `wonder/db/etl/etl-dsl.js` — `cliEtl`, and `gcloudCronEtl` which deploys a Cloud Run Job **and always upserts a
  Cloud Scheduler cron**. For a one-off benchmark deploy the job directly instead.
- `wonder/db/etl/file-query.js` — `fileQuery` for ad-hoc file queries; caches by source mtime + query hash.
- `wonder/db/room/room-lambda-client.js` — `Lambda(...)`, `invokeSnippetInContext`. Its OOM hint documents a trap
  worth internalising: **DuckDB sizes `memory_limit` off HOST ram, not the cgroup**, so a 2Gi Cloud Run cap
  gets OOM-killed unless `duckMemLimit` is set.

## 8. TGP itself
Before writing or changing any component read `jb6/core/utils/{jb-core,jb-args,tgp}.js`.
Minimum you must be able to explain: how `dynamic: true` defers a param into a re-invocable closure carrying
its lexical ctx (`paramRunner.resolve`), and why `ctx.run(profile)` inside an impl is an anti-pattern.
