# BigQuery-replacement brief — what is real, what it's worth, how to sell it
*Condensed from a 4-agent repo+web audit, 2026-07-27. Supersedes the simulated benchmark deck.*

> **Ported from the retired `Genie` repo, 2026-08-16.** Paths were rewritten to `wonder`
> (`admin/bi`→`wonder/bi`, `admin/etl`→`wonder/db/etl`, `admin/data-clients/winner`→`solutions/winner`)
> and every rewritten path was verified to resolve. Two references are deliberately left pointing at
> Genie because that code never migrated: `method-simulator.js` (§0) and `admin/schematics/*` (§2, §6).
> Claims about `admin/schematics` and the ETLS demo are therefore **unverified against `wonder`**.

## 0. The one thing to not get wrong
The "BigQuery vs 200λ fan-out" cost/latency table is a **calculator, not a measurement**.
Producer: `admin/bi/benchmark/method-simulator.js` in the retired Genie repo (deleted there in
`c2a423b1`; never existed in `wonder`) — pure arithmetic
(`N=min(200,ceil(bytes/(125MB×0.5s)))`, `cost=bytes/125MB×vcpuSecUsd`). Only the `bytes` column is
real, and it's a `bq` dry-run — i.e. it measures **BigQuery**, not us. **There is no fan-out in the
code**: one HTTP call → one lambda → one node child → one DuckDB, no split/merge/reduce anywhere.
Cloud Run deploys with no `--concurrency`/`--max-instances`/`--cpu` (`deploy-cloud-run-staging.sh:65,81`).
Never show that table to a prospect.

## 1. What is REAL (demonstrable today)

**Scan engine.** `cols_cache` DuckDB extension (`wonder/bi/cols-cache/`, committed linux binary) —
a `RangeCacheFileSystem` VFS: suffix-range GET for the footer (size cached in `.size`), then per-column
byte-range GETs cached as slice files under `/tmp/cols_cache/<hash(wUrl)>/`. Projection + filter
pushdown (`colsCacheCore.h:275-276`), row-group stats pruning, file-level manifest pruning
(`bi-manifest.js:38-60`). Parallel unit = (file,row_group) off one atomic cursor.
**Runs in three realms from one code path**: browser WASM (statically linked, `/gcs-proxy` for CORS),
node CLI, linux lambda — `runDuckdbSqlByHost` branches on `isNode` (`duckdb-utils.js:86`).
Instrumented: `duckDBProfilingLogger` already emits `scan_ms`, `e2e_ms`, bytes, per-column bytes,
`rowGroupsScanned scanned/total`, cache hits/misses. **No captured output is committed.**

**Semantic cube (`wonder/bi`, ~2,800 lines, 18 TgpTypes).** `comaxSalesCube`
(`solutions/comax2/comax-cube.js:48-151`): 30 dimensions, 26 metrics, 16-table star join, real Israeli
retail ledger (~25.5M ILS/30d). `nameExpand` (`bi-dsl.js:243`) AST-rewrites a bare metric *name* into
its expression, keeping the alias in SELECT and bare in tail clauses, and **refuses ambiguous cases
with an actionable error**. `ratio` compiles Σnum/Σden (correct across groupings), `share` a window sum.
Build side is genuinely above SQL (structured reducers: `pick/enrichFromLookup/withAggFunc/…`).

**`limits[]` — the differentiator.** Prose epistemic guardrails on the cube ("gross_profit is
OVERSTATED on zero-cost rows", "data ends 2026-06-28, anchor there, never now()") rendered verbatim
into the LLM prompt (`metrics.js:40-49`). This is the direct answer to the CRM's own listed ETLS
objection ("how do you make sure answers are correct / keep it from drifting"). Nobody else ships this.

**Scheduled ETL (Layer A, `wonder/db/etl`).** Production: 3 live Cloud Run Jobs + Cloud Scheduler.
`gcloudCronEtl` → Dockerfile+script sha256 = image tag (same hash ⇒ no rebuild) → `etl-<id>` job →
`etl-<id>-sched`. Outputs + `state.json` + `runs/<ts>.json` to GCS.

**Measured single-node timings** (`static-wasm/wasm-benchmarks-applet.js:76-145`, local FS):
`latestMonthRaw 157ms`, `kpis 343ms`, `topBranches 466ms`, `weeklyTrend 649ms`, `profitYoYByBranch 3997ms`.
Correctness asserts: taxi `trips=3066766`, `totalFare=56327502` (`signed-room-bi-cache-tests.js:84`).

**Third-party proof we can borrow:** ClickBench 100GB — DuckDB **348ms median (#2 overall)** vs
BigQuery serverless 544ms. Not ours, therefore credible.

## 2. What is NOT real (do not claim)
| Claim | Reality |
|---|---|
| 200λ fan-out, 0.5s floor, ⚡ latency columns | simulator only; no fan-out code exists |
| "DQ + monitoring + dashboards from one spec" | `validation()` only appends `valid`/`invalidReasons` columns; nothing fails/counts/filters/alerts. `metricValidation` SQL has **no consumer**. Zero alerting code in `wonder/bi`. |
| Validations run on the flagship cubes | Both comax & finance use `parquetSource` (virtual) — the build path never runs, so **zero validations execute**, while `cube.summary()` still advertises "validations" to the LLM |
| No-code ETL authoring | **None.** Code-only. `cube-widget-builder` charts an authored cube; `sql-script-studio` is a debugger |
| "One declarative spec" | **Two unrelated layers**: Layer A (`wonder/db/etl`) is raw bash strings concatenated into `script.sh` (`etl-cron.js:79`); Layer B (`wonder/bi`) is the declarative cube. They don't compose. **This is the biggest product gap.** |
| ETLS demo | `admin/schematics/etls-demo.js` (Genie only — not in `wonder`) is a 5-scene scripted ReactComp slide deck; the "308-line spec" is a 20-line hardcoded template literal; all agent Q&A is hardcoded strings; it cites files that don't exist and uses an API that doesn't match the real one. The brief already self-retracts the 80% claim (`etls-demo-brief.md:94-101`). |
| Governance ("we have that") | DuckDB has **no** users/roles/GRANT/row policies/masking/audit. Its docs: SQL runs with full OS-user privileges, "equivalent to running arbitrary code." All of it must be rebuilt above; **the query rewriter becomes the security boundary** while DuckDB SQL can `read_parquet` arbitrary paths and `ATTACH`. |
| AI agent quality | It's a **prompt, not a tool surface** (emits a code block). **Zero tests.** Cube tests were commented out of Genie’s repo-wide `all-tests.js`; `wonder` has **no** repo-wide aggregator — `jb6/testing/all-jb6-tests.js` covers jb6 only, and `wonder/` + `solutions/` tests are unregistered. |
| Layer B scheduling | `produce` and `discoverPeriodGaps` both throw "not implemented" (`materialization.js:109,196`) |

## 3. DuckDB vs BigQuery — parity verdict
- **SQL surface: non-issue.** DuckDB wins in places (ASOF joins, dynamic PIVOT, MAP, nested/nullable
  arrays, `SELECT * EXCLUDE`, `GROUP BY ALL`). Friction is dialect rewriting, not capability.
- **Real gaps, ranked:** governance (worst) → BQML (zero equivalent; "train in Python, score in DuckDB")
  → vector search (VSS experimental, HNSW in-memory-only, can't index parquet) → streaming (DuckLake
  works, ~100ms event-to-queryable, but inlining needs a **Postgres catalog** ⇒ no longer stateless)
  → connectors (Tableau GA via Postgres wire, dbt-duckdb mature, Fivetran destination partner-built).
- **Scale ceiling:** no distributed shuffle — **and nobody has one on DuckDB, including MotherDuck**
  ("each query on one node, no fragments, no shuffle"). So missing fan-out is the state of the art,
  not a product hole. What it caps: joins off the partition key, exact global COUNT(DISTINCT), global
  sorts, windows partitioned differently from storage.
- **Prior art:** MotherDuck (furthest), BoilingData (closest, dormant since 2024), smallpond. Rill:
  "DuckDB Won By Refusing to Scale Out."

**Convergence worth naming:** the workloads that parallelize well (partition-aligned, shuffle-free)
are *exactly* the scheduled-aggregation / dashboard-rollup workloads we target. Technical ceiling and
ICP boundary are the same line — that's the segmentation argument, not an excuse.

## 4. Honest value to a BigQuery client
1. **Repeated-scan cost.** Dashboards and scheduled rollups re-scan the same columns forever. Mechanism
   is real (byte-range + cache + pruning); **magnitude is unmeasured**. Cost survives without fan-out
   (bytes × price); only *latency* needed fan-out.
2. **Sub-second dashboards with no warehouse and no cluster** — measured 157–692ms.
3. **Metrics that can't drift** — one compiled definition, ambiguity rejected at compile time.
4. **AI on data with epistemic guardrails** (`limits[]`) — architecture real, output quality untested.
5. **Same engine in the browser** — genuinely unusual. A working query engine over *their* parquet in a
   browser tab, no deploy, no access to their cloud. Underrated as a sales mechanism.

## 5. Go-to-market plan
**Phase 0 — earn the number (before any outreach).** Run the new harness (`bi-benchmark-dsl.js`
localFs/cloud/wasm + `biBenchmarkApplet`) against 2–3 public BQ datasets; capture `duckDBProfilingLogger`
output; publish a **measured, re-runnable 1λ table**. Delete the ⚡/fan-out columns from every asset.

**Phase 1 — "BQ bill autopsy" (the opener).** Their `INFORMATION_SCHEMA.JOBS` export is **metadata
only — no data access, no security review**. From it: rank queries by `total_bytes_billed × frequency`,
find the repeated scans, project cost under our model. Highest-credibility, lowest-friction entry.

**Phase 2 — one workload, side by side.** Pick a scheduled aggregation feeding a dashboard. Export to
parquet on GCS, author the cube, run both, prove identical numbers + the cost delta. Nothing else moves;
BQ stays connected.

**Phase 3 — expand.** The cube becomes the dashboard and the AI surface. Cost lands the account, the
cube retains it.

**Positioning:** "cut the repeated-scan bill, keep BigQuery" — additive scan path, not a migration.
Never "replace BigQuery." Scope early deals to **single-trust-domain** workloads (governance gap).

## 6. Demo
- **Do not demo** `etls-demo.js` (Genie only) (slide deck, hardcoded, references non-existent files).
- **Do demo** comax (real ledger, real cube, Hebrew AI Q&A) — most credible. Finance is more polished
  but **fully synthetic** (~21k rows, frozen Jan–Jun 2025); its cube-tests are the repo's strongest
  (row-by-row vs legacy DuckDB, balance-sheet reconciliation).
- **The killer move:** browser-WASM running a live query over public-BQ-exported parquet with the
  profiling logger visible (bytes scanned, row-groups pruned, cache hits) — side by side with the BQ
  dry-run bytes for the same query. Zero infrastructure, zero access to their cloud, undeniable.

## 7. Work required before selling (ranked)
1. Capture real benchmark numbers (harness + logger exist; nothing captured).
2. Re-enable and fix the disabled tests (no aggregator exists in `wonder` for `wonder/` + `solutions/` tests) — cube tests and AI agent have none.
3. Make `validation()` run on the `parquetSource` (virtual) path, or stop advertising validations.
4. Decide: bridge Layer A → Layer B, or stop claiming "one spec."
5. Governance: define the trust boundary of the query rewriter before any multi-tenant deal.
