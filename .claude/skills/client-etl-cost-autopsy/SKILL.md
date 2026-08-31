---
name: client-etl-cost-autopsy
description: Work out what a client's BigQuery/dbt ETL model actually does and what it actually costs — read its schema and grain, attribute spend across the two BigQuery currencies (bytes scanned vs slot-time), and find the specific lines driving the bill. Use when handed a client SQL model, a dbt project, an INFORMATION_SCHEMA export or a "why is our BigQuery bill so high" question, or when asked to size a BigQuery replacement.
---

# Client ETL autopsy — schema, purpose, cost

## Read first

`references/codebase-map.md` — existing artifacts to reuse (`scripts/bq-bill-autopsy.sql` already does the
per-shape attribution), the Winner worked example, and which stored numbers are known stale.
`references/bq-replacement-brief.md` — read before writing anything client-facing.

Goal: given a client's model, be able to say *what it computes*, *what it costs*, and *which lines cost it*.
Everything below is read-only and most of it is free.

## 1. Read the model before pricing it

Establish, in this order:

- **Grain** — the final `GROUP BY`. Everything else hangs off it.
- **Fan-out** — `UNNEST`/array joins multiply rows *after* the read. `total_bytes_processed` is a storage-scan
  metric and is structurally blind to this. Row count after fan-out ≠ anything in the byte accounting.
- **Rollup blocks** — repeated `GROUP BY` CTEs joined back onto the base. Count how many times the source CTE
  is referenced; that number is the single most important thing you will learn (see §3).
- **Cross-grain values** — window functions like `MAX(x) OVER (PARTITION BY brand)`. These are what stop a
  model being partition-parallel. Everything whose grain includes the partition column is independent.
- **Incremental window** — `is_incremental()` + `date_from`/`date_to`. A model that reprocesses 92 days on
  every daily run costs 92× what it needs to. Check the *rendered* SQL, not the template.

Write the grain down as a table of (block, GROUP BY columns) before touching cost. `references/reading-a-model.md`
has the checklist and the day-partitionability test.

## 2. The two currencies — get this right or every number is wrong

| meter | field | when it is real money |
|---|---|---|
| bytes | `total_bytes_billed` | **on-demand** — this is cash |
| slots | `total_slot_ms` | **reservation** — this is *opportunity* cost, not cash |

Under a reservation with idle slots the marginal cash cost of a query is ~zero. Under on-demand, slot-time
costs nothing directly. **Find out which regime the client is on before quoting anything.** Quoting a
slot-derived figure to an on-demand customer (or vice versa) is the fastest way to lose the room.

`scripts/bq-bill-autopsy.sql` already does the per-shape attribution and reports both
currencies. It is metadata-only, costs $0, and hashes query text so nothing identifiable leaves the project.

## 3. Diagnostics that pay, cheapest first

**Dry runs are free.** `bq query --dry_run --use_legacy_sql=false < model.sql` returns bytes without executing.
Use them for every hypothesis below.

- **CTE re-evaluation.** BigQuery re-executes non-recursive CTEs per reference. If a source CTE is referenced
  N times, the underlying scan happens N times. Divide the shape's bytes by N and sanity-check against the
  table size — if it matches, you have found a ~N× multiplier. Confirm with two dry runs: the full model, and
  a cut-down version referencing the CTE once. *DuckDB does NOT have this pathology — it materialises a
  multiply-referenced CTE (verified: 1 READ + N CTE_SCAN in EXPLAIN). It is BigQuery-specific.*
- **One wide column dominating a scan.** BigQuery bills every byte of every *referenced* column. A JSON blob
  (`ExternalData`-style) read for a single output measure can dominate a multi-TB scan, and a predicate inside
  a `CASE` prunes nothing at scan time. Dry-run with and without that one expression.
- **Window width.** Narrowing the incremental window is often the largest single lever and needs no SQL change.
- **Partition/cluster pruning.** If the filter column isn't the partition column, nothing prunes.

## 4. Prices — pin them, never recall them

Regional prices differ and guessing them corrupts every downstream figure. Pull them:

```bash
TOKEN=$(gcloud auth print-access-token)
# BigQuery = 24E6-581D-38E5 · Cloud Run = 152E-C115-5142
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://cloudbilling.googleapis.com/v1/services/24E6-581D-38E5/skus?pageSize=2000" \
| jq -r '.skus[] | select(.serviceRegions[]? == "me-west1") | select(.description|test("Analysis"))
         | "\(.description) \(.pricingInfo[0].pricingExpression.tieredRates[-1].unitPrice)"'
```

Verified 2026-08: BigQuery on-demand **US $6.25/TiB**, **me-west1 $7.50/TiB**. Cloud Run **Jobs** me-west1:
CPU $0.000018/vCPU-s, Memory $0.000002/GiB-s. See `references/pricing.md`.

Arithmetic: `$ = bytes / 2^40 × usd_per_tib` · `$ = slot_ms / 3.6e6 × usd_per_slot_hour`.

## 5. Worked example — Winner `sportTickets_daily`

Model at `solutions/winner/sql-sample.sql`; per-day rewrite at `sql-sample-perday.sql`.

- 14-dimension grain, `UNNEST(BetDetails)` fan-out, nine rollup CTEs, source CTE referenced **10×**
- Client shape report: **180 GB/run** → $1.02 (US) / $1.23 (me-west1) on bytes
- Same run attributed **115 slot-hours → $6.90** at $0.06/slot-hour — a **6.7×** gap between the currencies
- 180 GB ÷ 10 references ≈ **18 GB per evaluation**, consistent with the CTE pathology
- A *different* shape in the same project scans **1.96 TB** — 11× more. Always rank shapes before optimising one.

## Traps

- **Do not quote a ratio that pairs your synthetic measurement with their production measurement.** Say which
  side is which. Back out their real volume from the bytes first — ours was ~6× smaller than theirs.
- **A stored number is not a measured number.** If a memory or brief carries a figure, re-derive it. One
  recorded here as "5.22 GB scanned across 30 runs" turned out to be 34× smaller than a *single* run.
- Byte counts say nothing about slot-time and vice versa; never convert between them.
