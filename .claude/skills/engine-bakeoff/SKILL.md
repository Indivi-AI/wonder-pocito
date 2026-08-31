---
name: engine-bakeoff
description: Benchmark the same analytical model across engines — a bi/TGP cube, plain DuckDB, and BigQuery — and prove the outputs match. Covers building synthetic datasets at a controlled grain, running on Cloud Run Jobs with hard cost ceilings, and diffing results correctly. Use when asked to compare engines, measure cube vs SQL performance, size a BigQuery replacement, or benchmark a model at scale.
---

# Engine bake-off — cube vs DuckDB vs BigQuery

## Read first

`references/codebase-map.md` — what to read in this repo and why, ordered by how much grief
skipping it causes. Non-negotiable before measuring anything: `wonder/bi/CLAUDE.md` (three realms, guard
tests) and `wonder/bi/duckdb-utils.js` (**every** DuckDB call is capped at `memory_limit=500MB` on node —
benchmark raw DuckDB without matching that and you are comparing a 500 MB engine to a 12 GB one).

Three engines, one model, one dataset. The whole exercise is worthless unless the outputs are proven equal,
so read §4 before you run anything.

## 1. Build the dataset — control the grain directly

The single most common mistake is letting the grain *emerge* from cardinality arithmetic. It won't land where
you want. Force it:

```sql
WITH o AS (SELECT i, i % (N/COLLAPSE) AS g FROM range(0, N) t(i))
-- every dimension is a function of (g, s); the key then has exactly (N/COLLAPSE)*S distinct values
-- UserId is a function of i (NOT g) so rows sharing a cell carry different users and COUNT(DISTINCT) has work
```

`scripts/gen-synthetic.sql` is a parameterised generator (nested `BetDetails` array + `EventsData`/`Countries`
dimension tables, Winner-shaped). Verify before using:

| check | why |
|---|---|
| rows / cells = target collapse | a 2174:1 collapse makes a cube benchmark meaningless; real is often ~8:1 |
| dimension tables keyed on **(ID, Brand)** | keying on ID alone silently drops 4/5 of rows on a two-column join |
| NULL count per dimension | zero NULLs hides an entire class of join/broadcast bug |
| nested vs flat | if the model has `UNNEST`, a pre-flattened fixture cannot reproduce the fan-out — the main cost driver |

Back the client's real volume out of their reported bytes before choosing N. Ours was ~6× smaller than
theirs, which turned a "171×" headline into ~23×.

## 2. Running each engine

**DuckDB local** — `/usr/bin/time -l` for wall + peak RSS. **Set `temp_directory` explicitly**; DuckDB spills
into `.tmp/` in the *current working directory* and will happily write 5 GB into the repo.

**Cloud Run Job** — the comparable, billable venue. `scripts/deploy-job.sh` has the recipe. Non-obvious parts:
- Base image must be `gcr.io/google.com/cloudsdktool/cloud-sdk:slim` — the shared ETL runner shells `gcloud`.
  (`conversion3-etl.js`, Genie only, uses `node:22-slim` and is the outlier; copying it gives exit 127.)
- Deploy the job **directly**, not via `gcloudCronEtl` — that always upserts a Cloud Scheduler cron.
- Match the DuckDB version to whatever you measured locally. The shared image pins 1.1.3.
- **Cost ceiling, always**: `--task-timeout=<s> --max-retries=0` plus an inner `timeout` per step.
  `$ceiling = timeout × (vCPU × 0.000018 + GiB × 0.000002)` in me-west1.

**Cube** — `materializeCubePeriod` via `runTgpSnippet`; read `reduceMs` / `parquetMs` from `biLogger`.
To benchmark the *real* comp rather than a copy, temporarily swap the bronze fixture (back it up, restore,
verify byte-identical). Room-lambda fleet in me-west1 tops out at **2 vCPU / 4 GiB** (`me-west1-4gb`) — fine
for ≤1M rows, hopeless above that; use a Job.

**BigQuery** — needs `roles/bigquery.user` (`jobs.create` + `datasets.create`). Run on-demand and read
`total_slot_ms` from `INFORMATION_SCHEMA.JOBS_BY_PROJECT`: you pay cents in bytes and get the slot figure free.

## 3. Cloud Run memory — the rule that bites

**`/tmp` is tmpfs.** DuckDB's spill lands in RAM and counts against the *same* container limit as
`memory_limit`. Out-of-core spilling therefore cannot relieve memory pressure there.

- `memory_limit` must leave headroom for spill. 20 GB on a 32 GiB container works; **26 GB OOMs, 24 GB OOMs.**
- A model that OOMs whole-window may run comfortably per-partition — 40M rows failed on 32 GiB as one query
  and completed in **8 GiB** run per-day. Check partitionability (see `client-etl-cost-autopsy`) before
  reaching for a bigger box; Cloud Run's ceiling is 8 vCPU / 32 GiB and there is nothing above it.

## 4. Comparing results — the part everyone gets wrong

**Never use bare `EXCEPT`.** It compares positionally and treats a 1-ULP float difference as a mismatch. On a
correct rewrite it reported 72% of rows "differing".

Do this instead:

```sql
SELECT count(*) AS joined,
  sum(CASE WHEN a."col" IS DISTINCT FROM b."col" THEN 1 ELSE 0 END) AS "col", ...
FROM a JOIN b USING (<all key columns>)
```

`scripts/coldiff.py` generates that query from a key list and a column list. Then judge:

| column type | expectation |
|---|---|
| `COUNT(DISTINCT)`, integer `SUM`, booleans | **exact** — any difference is a real bug |
| float `SUM` | ≤1 ULP (~1e-16 relative); **zero rows differ at 6 dp** |

Also check row counts *and* column counts *and* the column-name set match — a schema that differs by a column
will still join happily.

Report it as **"numerically identical"**, never "bit-identical".

## 5. Gotchas that cost real time

- **`runTgpSnippet` caches by profile text.** Repeat runs return a previous result in ~0.3 s, reporting success
  while doing nothing and writing no file. Vary a parameter (e.g. the period) per run to defeat it.
- Reproduce a known-good configuration before varying anything, and vary **one** thing at a time.
- The cube's `csvEventSource`/`parquetEventSource` wUrl `signedRoom:fs//` pins the *local* filesystem — a
  lambda resolves rooms via GCS, so the source must move before any remote run.
- Never write to an existing room without asking first.

## 6. Calibration numbers (300K rows, 8:1 grain, same machine, 2026-08)

| | CSV source | parquet source |
|---|---|---|
| SQL model (DuckDB, uncapped memory) | 0.49 s | **0.36 s** |
| winnerCube | 2.95 s | 2.68 s |
| ratio *as measured* | 6.0× | **7.4×** |

**Caveat on those ratios**: the cube's DuckDB stages run through `runDuckdbSqlByHost` at `memory_limit=500MB`
while the raw SQL was uncapped. Matching the cap costs the rollup stage 0.58 s → 0.86 s, so a like-for-like
ratio is nearer **~6.7×** than 7.4×. Always set `duckMemLimit` on one side or match the cap on the other, and
say which you did.

Cube breakdown at 300K: ~0.25 s sort→JSONL · ~0.31 s `JSON.parse` · **~1.22 s the JS reducer** · ~0.90 s
rollups+joins. Parquet intermediates are worth only ~0.08 s net — the JSONL is not the bottleneck, the
row-by-row JS reduction is, and that is structural rather than a bug.

40M: whole-window **OOMs** on 8 vCPU / 32 GiB; per-day completes in 436 s on 4 vCPU / 8 GiB for **$0.040**.
