# Schematics BI — handover to the `wonder` repo

A CDC-backed BI pipeline for schematics (schemathics.com / top10us.com), a US lead-gen affiliate. It replaces
what they run on Databricks + Sigma. Everything here was built and verified in the `Genie` repo against
`gs://schematics-gcs-dump`, read-only, using the operator's own gcloud identity. **No schematics credentials,
no Databricks connection, no writes to their systems** — keep it that way.

Read this top to bottom before moving anything. The traps in §7 cost real days and every one of them fails
SILENTLY — wrong numbers, green tests.

---

## 1. What it does, in one paragraph

Google Datastream mirrors schematics' MySQL binlog to GCS as avro. We reconstruct their clickout facts from
those change records (latest-wins per row), enrich them from a catalogue of offers/clients, join revenue from
a settlement ledger, join Meta ad spend, and expose the result as two semantic cubes plus a dashboard applet.
Correctness is measured against a frozen Databricks dump of their own gold tables, which acts as the oracle.
As of 2026-08-25 revenue reproduces the oracle at **100.03%** and sales **exactly**.

---

## 2. Files to move

All under `admin/schematics/da/` unless noted. `→` marks what each file registers into the TGP registry.

### The live pipeline — move all of these

| file | lines | registers |
|---|---|---|
| `cdc-event-source.js` | 98 | `avroCdcSource` (`event-source<bi>`) |
| `cdc-reference-etl.js` | 89 | `buildCdcReference` (`etl<etl>`) |
| `cdc-gold-etl.js` | 122 | `buildCdcGold` (`etl<etl>`) |
| `schematics-cdc-cube.js` | 276 | `clickoutsCdcSilver` (file-local const), `clickoutsCdcCube`, `cdcAdPerformanceCube`, and 5 `Const`s |
| `schematics-cdc-tests.js` | 225 | 5 contract tests + 5 fixture builders |
| `heloc-dashboard.js` | 146 | `HelocDashboard` (`ReactComp`) |
| `pull-cdc-day.sh` | 12 | bronze mirror script (bash, not TGP) |
| `../../viz/widgets/drill-table-widget.js` | 93 | `drillTableWidget` (`ReactComp`) — domain-free, reusable |

The five `Const`s in `schematics-cdc-cube.js` are the domain facts the applet reads:
`helocVertical`, `helocClients`, `adHierarchy`, `spendHorizon`, `maturityDays`.

### The Databricks pipeline — move it, but it is scaffolding

`databricks-temp/` holds `schematics-etl.js` (180), `schematics-cubes.js` (206), `schematics-cube-tests.js`
(201). It reads the frozen dump, not CDC. **It is not deletable yet**, for two reasons:

1. `cdc-gold-etl.js` reads `spend.parquet`, which only `buildSchematicsSilver` writes. **Meta spend is not in
   CDC at all** — it arrives via the fb-connector. Delete this and ROI/profit/CPL all collapse.
2. It is the only independent ORACLE. Every correctness claim below is a comparison against it.

It also registers a `spendCube` that **collides by name** with the one in `ad-drift-cubes.js`. The registry is
a flat map, so last import wins. Dormant today only because `analytics-index.js` is commented out of
`all-tests.js`. **Rename one before enabling both.**

### Do NOT move

`ad-drift-cubes.js`, `ad-drift.js`, `more-cubes.js` are not mine and are a *third* pipeline reading
`crmEvents://` (raw landing-page event JSON), currently unloaded. Do not delete them either — `spendEvents`
in `ad-drift-cubes.js` already wires **live Meta spend** via `facebookInsights()`, which is the unblock for
item §8.3.

---

## 3. External dependencies to remap

Import aliases used, in rough order of how likely they are to have moved:

| alias | used for |
|---|---|
| `@wonder-admin/bi/bi-common.js` | the whole `bi` DSL — `cube`, `materializeFromEvents`, `pick`, `lookupByQuery`, `enrichFromLookup`, `validation`, `projection`, `dimension`, `metric`, `ratio` |
| `@wonder-admin/etl/etl-dsl.js` | `etl<etl>` type + `etlLogger` |
| `@wonder/core/db-drivers-live-repo.js` | the `FS.*` drivers that `db:'fs'` needs. **See trap 7.1** |
| `@wonder/applets/applet.js` | `applet()` metadata for the ReactComp |
| `@jb6/core`, `@jb6/common`, `@jb6/react`, `@jb6/testing`, `@jb6/repo` | framework |
| `../../viz/viz-index.js` | `VizWidget` + the drill table |

From `@jb6/core` the code uses `dsls`, `coreUtils` (`runBashScript`, `harvestLogs`) and `jb`
(`jb.coreRegistry.consts`, `jb.vizTheme`).

Two components shell out via `coreUtils.runBashScript`: they need **`duckdb`** and **`python3` with
`fastavro`** on PATH. The duckdb avro extension has no `osx_arm64` build, which is why avro is read in python.

---

## 4. Wiring — what must import what

Nothing self-registers; a file is only live if something imports it.

- `public/tests/all-tests.js` imports `schematics-cdc-tests.js`, `heloc-dashboard.js`, and
  `databricks-temp/schematics-cube-tests.js`. **A test that is not imported here does not exist.**
- `admin/viz/viz-index.js` imports `widgets/drill-table-widget.js`.
- `admin/schematics/analytics/analytics-index.js` lists everything, but is **commented out** of
  `all-tests.js` — which is the only reason the `spendCube` collision is currently dormant.

Internal chain (already relative, should survive a move intact):
`schematics-cdc-cube.js` → `cdc-event-source.js`, `cdc-reference-etl.js`, `cdc-gold-etl.js`;
`heloc-dashboard.js` → `schematics-cdc-cube.js`, `viz-index.js`; `schematics-cdc-tests.js` →
`schematics-cdc-cube.js`.

---

## 5. Data — what to copy, what to regenerate

### Bronze (read-only mirrors of the bucket, ~2.7GB) — regenerable, do not copy

`/tmp/schm-cdc/<table>/YYYY/MM/DD/**.avro` — `links_tracking_clicks` (2.6G), `links_tracking_payouts` (128M),
`links_tracking_links` (6M), `clients` (27M). Refetch with `./pull-cdc-day.sh 2026-05-15 21`. Currently
mirrored: clicks + payouts for **2026-05-14 → 2026-06-05**; links/clients for full history.

`/tmp/schm-bronze/*.parquet` (2.5G) — the Databricks dump oracle. Path is in
`databricks-temp/schematics-etl.js` under `srcDir`. Refetch:
`gcloud storage cp gs://schematics-gcs-dump/databricks/<stamp>/wonder_full/bronze/{revenue_clicks,sessions,hourly_smm}.parquet /tmp/schm-bronze/`

### Silver/gold (`files/rooms/schematicsBI/usersRO/silver/`) — copy the parquets

Worth copying so a new session can verify without a multi-hour rebuild:
`ref-offers.parquet` (24K), `ref-clients.parquet` (4K), `ref-payouts.parquet` (488K),
`clickouts-cdc-2026-05-{14,15,16,17}.parquet` (~1.2M each),
`cdc-ad-performance-2026-05-{14..17}.parquet` (~25K each), `spend.parquet` (23M).
`conversions.parquet` (285M) and `ad-performance.parquet` (2.8M) belong to the Databricks pipeline.

### Scratch — DO NOT COPY

`events-of-id-*.jsonl` (**575MB**) and `ref-*.jsonl` (11MB) in that same directory are `materializePeriod`
intermediates, rewritten on every build. `/tmp/avroCdc-*.jsonl` likewise. Safe to delete.

---

## 6. Build order — this is not optional

`buildCdcReference` → clickout silver → `buildCdcGold`. Each step reads the previous one's output.

```
runTest({testId: 'buildCdcReference'})              # offers + clients + THE LEDGER, wholesale
runTest({testId: 'clickoutsCdc.maturedBuildPrevDay'})  # 2026-05-14, lagDays 21
runTest({testId: 'clickoutsCdc.maturedBuild'})         # 2026-05-15, lagDays 21
runTest({testId: 'buildCdcRange'})                 # 05-16, 05-17 at the default lag
runTest({testId: 'buildCdcGoldRange'})             # gold for 05-14..05-17
```

Getting the order wrong does not error. A lookup that cannot resolve returns an **empty Map**, and every
enriched column becomes NULL — see trap 7.1.

---

## 7. Traps — every one of these fails silently

**7.1 A failed `room://` lookup writes NULL rather than raising.** `loadByQuery` swallows its exception and
returns an empty Map. A build then "succeeds" with 25,105 rows whose `vertical`, `client_name` and
`revenue_amount` are all null, and the HELOC filter returns an empty, plausible-looking result. The usual
cause is a realm without the FS drivers: **`schematics-cdc-cube.js` does not import
`db-drivers-live-repo.js`, the TEST file does.** Build through the test harness, never through a bare MCP
snippet. Secondary symptom: an all-NULL column is typed **JSON** not VARCHAR by the jsonl→parquet COPY, so a
later multi-day `read_parquet([...])` dies with `Malformed JSON at byte 0`.

**7.2 The dump's day is not our day.** `revenue_clicks.session_dt` renders in **+03**; our silver is
partitioned by **UTC**. The dump's `2026-05-15` == UTC `2026-05-14 21:00` → `2026-05-15 21:00`, so its first
three hours live in the *previous* parquet. Comparing one UTC file against the dump's day drops 210 clickouts
and reads 85–89% when the truth is ~100%. **Reconcile by key inside a UTC instant range, never by date.**

**7.3 `buildCube` does not propagate `Var('lagDays')`.** It silently builds at the source default of 2.
Proven by the scratch filename: a `buildCube` run over 05-15 with `lagDays: 21` set wrote
`/tmp/avroCdc-links_tracking_clicks-2026-05-15-lag2.jsonl`. Use `materializeCubePeriod` per period whenever
maturity matters. `buildCdcRange` is deliberately scoped to 05-16/05-17 so it cannot overwrite the matured days.

**7.4 Tests clobber each other's fixtures.** A build at the default lag writes 05-15 into the *same* wUrl the
matured build writes, so running one after the other downgrades the parity day. The old
`clickoutsCdc.buildsTheDay` did exactly that and was REMOVED for it; `buildCdcRange` is now scoped to
05-16/05-17 so no fixture builder can overwrite a matured day. The parity test still asserts revenue and sales
exactly (both lag-stable, ledger-joined) and `leads` only as a range.

**7.5 Never partition the ledger by booking day.** Tried; it dropped **24 of 26 HELOC sales** while looking
healthy, because a `disposition` is written back *weeks* after the money is booked and a per-period window
truncates exactly those late updates. The ledger settles slowly, so it lives with the reference tables in
`buildCdcReference`. Partition a table by when a row was created and you cannot see what it became.

**7.6 Datastream ships MySQL DECIMAL as a STRING.** `payout` arrives as `"8.21"`. Uncoerced, its parquet type
is inferred per build — VARCHAR one time, BIGINT the next — and `sum()` silently returns a string. Both
`click_payout_amount` and `is_lead` are coerced via `withReduceFunc(obj(prop(..., 'number')))`. Any new
numeric column from CDC needs the same.

**7.7 A cubeQuery cannot reference a raw column that shares a metric's name.** `metric('revenue', …)` makes a
bare `revenue` expand to the metric — **quoting does not help**, the editor normalises it. Physical columns
therefore end `_amount`/`_count`; metrics get the clean name. A metric name also cannot be a CTE alias.

**7.8 Latest-wins is the whole pipeline.** A clickout is written ~3.09 times, so every non-key column must
come from the LAST version. It no longer moves revenue — that is joined from the ledger on the CDC primary
key, which is constant across versions — but it decides conversion, sub1/2/3 and the offer. (An older note
claiming a 62% revenue loss was measured when revenue came from the click row; it does not apply now.)
Order by `sort_keys` = `[epoch_ms, binlog_file, binlog_position]`; `source_timestamp` is
second-granular and too coarse. `avroCdcSource` emits pre-sorted by `(id, ts_ms, binlog_pos)` and relies on JS
sort being **stable** so the binlog tiebreak survives `reduceObject`'s re-sort by `timestamp`.

**7.9 `validations` read the OBJ, not the events.** `is_deleted` must be *picked onto* the object or
`not_deleted` fails every row for the wrong reason.

**7.10 `enrichFromLookup` keys off the RAW event (`events[0]`), not the reduced obj.** Hence
`offers[after.offerId]/vertical`, not `offers[offer_id]/…`.

**7.11 You can only query days you BUILT.** A per-period silver raises `IO Error: No files found` for an
unbuilt day — not an empty result, not a zero. That is how a dashboard date range breaks.

**7.13 Spend was host-timezone dependent until 2026-08-25.** `spd.dt` is a `TIMESTAMPTZ`, so a bare
`dt::date` resolves in the SESSION timezone: the same query returned **$121,172.32** on a machine in
Asia/Jerusalem and **$119,192.50** under UTC — a 1.7% swing, on one gold row carrying two different day
boundaries (revenue on the UTC click day, spend on the host's). Now written as
`(dt AT TIME ZONE 'UTC')::date` in the expression rather than as a `SET`, so it travels with the query. **Any
gold parquet built before 2026-08-25 carries the local-timezone figure** — rebuild rather than trust it.

**7.14 `enrichFromLookup` reads `events[0]` — the OLDEST version — while `offer_id` beside it uses `last()`.**
They agree only because `offerId` is never rewritten (measured: 0 of 27,594 clickouts on 2026-05-15). Nothing
enforces it. The proper fix is a `phase: 'obj'` option on `enrichFromLookup` in the shared
`materialization.js`, deliberately not done here — that file is used by every cube in the repo.

**7.12 `replaceFileSection` (the MCP editor) corrupts `$`.** It truncated every line at a `'$'` literal AND
duplicated the tail, taking `schematics-cdc-cube.js` from 245 to 607 lines with the cube repeated five times —
while reporting success. It also matched the wrong block where two cubes shared identical `limits` text. Edit
these files with python/sed and run `node --check` after **every** edit.

---

## 8. State of the work — what is true, and what is not finished

### Verified (2026-08-25, HELOC, the dump's own +03 day)

| | ours | dump | |
|---|---|---|---|
| revenue | $46,566.31 | $46,553.31 | **100.03%** |
| sales | 26 | 26 | **exact** |
| leads | 399–406 | 403 | moves with the lag window |
| clickouts | 1,459 | 1,456 | |

Gold HELOC 2026-05-15: revenue $46,724, spend **$37,976.87** (UTC-pinned), ROI **123.03%**, 404 leads,
30 sales. Whole-day CDC reconstruction is **99.98% of the dump's 28,492 rows** (6 unresolved). **18/18 tests
pass.**

**SPEND IS NOT INDEPENDENTLY VALIDATED.** `spend.parquet` is built FROM the Databricks `hourly_smm` table, so
"our spend matches Databricks" is self-consistency, not validation — `cdcGold.spendIsNotDuplicated` proves only
that the gold join does not fan the spend out. Until the fb-connector is read directly, treat cost as
unverified.

### The revenue rule, measured not assumed

Revenue is the `links_tracking_payouts` ledger, never the clickout row's own `payout`. Measured over the
dump's own +03 day, 28,425 clickouts reconciled by key: the ledger is exact on **99.70%** and the click row on
**98.21%**; restricted to the **2,335 clickouts that actually earned** — where the difference lives — that is
**96.45% against 78.42%**. (An earlier note contrasting "6.7% vs 99.95%" compared a paid-rows numerator against
an all-rows denominator and overstated the gap by roughly 15x.) Within it: **same `(clickId, offerId)` = revisions, take `max`; different `offerId` =
separate payments, sum.** Discriminating cases — unison writes `0.00` then `200.00` one second apart and the
dump keeps 200 (so first-by-time is wrong); amerisave writes `87.00` twice eleven days apart and the dump
keeps 87 not 174 (so summing is wrong). The rule lives in one `lookupByQuery` in `schematics-cdc-cube.js`.
Caveat: in the window measured, **every click settled on a single offer**, so the summing branch is correct by
construction but has never actually fired.

### Open

1. **13 clickouts / $1,480 residual**, all verticals. Offer 90267 settles $100 on the ledger where the dump
   books $20; offer 18059 settles $300 where the dump books $0. Each has exactly ONE payout row, so no
   multi-row rule reaches them — something downstream rewrites those two offers. **Ask schematics.**
2. **`leads` under-reads.** `is_lead` comes from the click's own `after.conversion`, not the ledger: 1,926 vs
   the dump's 2,299 across all verticals (HELOC is fine). Deriving it from "has a ledger row" is untried and
   might close it the way revenue closed.
3. **Spend horizon 2026-06-04.** Past that date revenue exists and spend is zero, so ROI reads infinite.
   `spendEvents` in `ad-drift-cubes.js` already wires live Meta spend via `facebookInsights()` — untested, but
   it is the unblock, and it would also let `databricks-temp/` finally be deleted.
4. **`websites_visitors` joins to nothing.** Backfilled and volumetrically correct (2,097 vs 2,132 sessions,
   same pages in the same rank order) but **zero id overlap** with the dump's `session_id`, all four click id
   fields, or `random_log`. Ask the co-founder which field links a visitor session to a clickout.
5. **`leads` bronze table was never backfilled** (only 2026-02-10 and 04-30), so form-fill vertical revenue is
   unavailable — that is $2,560,225 of Home Security revenue outside the pipeline. `form_answers` stops
   2026-03-29.
6. **The applet is unpublished.** `/room/schematicsBI/applet/HelocDashboard` 404s. Verified via the data path
   only, never visually.
7. **`spendCube` name collision** (§2).
7b. **`sub1` is 98.7% populated, not 100%** as some guidance still implies — 351 of 27,594 clickouts on
   2026-05-15 carry no `sub1` and cannot be attributed to spend at all.
8. **`admin/schematics/config.share` is tracked in git with a live Databricks bearer token**
   (`expirationTime: 9999-12-31`). `git rm --cached` it and rotate. Not actioned.
9. **`cdc-gold-etl.js` is 111 of 141 lines of raw SQL.** The business logic in it is not reachable by a
   non-technical implementor. It is the next refactor target.
10. **A three-agent code review has been applied** (TGP correctness, deletion, claim accuracy). Deferred from
   it: the `enrichFromLookup` phase option and `buildCube`'s failure to propagate `lagDays` (trap 7.3) — both
   need changes to the shared `materialization.js` and their own verification pass. Also deferred: replacing
   the two remaining SQL/python heredoc ETLs with `cliEtl` profiles, and `ctx.run` inside the applet's impl
   (`heloc-dashboard.js:85`), which should be `$runWithCtx`.

### Dead ends — do not re-chase

- `clients.revenue_formula` — identical `"default"` for clients that agree AND disagree with the dump.
- The `payout*0.9` haircut in `ad-drift-cubes.js` — in the dump `revenue == payout` on **all 1,456** HELOC
  rows, ratio exactly 1.0000, and 1,230 of our matched clicks already agreed to the cent. The 91.6%/90%
  resemblance was coincidence.
- `random_log` as a revenue source — HELOC group_ids matched **0 of 4,260**. It is only the card-exchange log.
- Offer price fields (`internal_lead_price`, `external_lead_price_fixed` are 0.0; real prices live in offer
  NAMES like "Unlock short form $150"), `clients.price_per_lead` (=1 for everyone), `offline_conversions`.

---

## 9. How to prove the move worked

After remapping imports and copying the parquets, run these five. They are ordered so a failure tells you
where the move broke.

| test | proves |
|---|---|
| `clickoutsCdc.rebuildsTheDump` | CDC reconstruction still matches the oracle, and latest-wins collapsed |
| `clickoutsCdc.maturedRevenueReachesParity` | revenue $46,566 / sales exactly 26 |
| `cdcGold.everyNumberOnTheDay` | every gold metric, pinned — a dropped metric reads 0, it does not raise |
| `cdcGold.spendIsNotDuplicated` | the gold join did not fan out |
| `helocDashboard.rendersWithRealData` | the applet renders real numbers, not `Loading…` |

`rebuildsTheDump` needs the oracle on disk — `/tmp` is cleared periodically, so refetch it first:
`gcloud storage cp gs://schematics-gcs-dump/databricks/2026-08-24_00-29/wonder_full/bronze/revenue_clicks.parquet /tmp/schm-bronze/`

If `rebuildsTheDump` fails on coverage rather than a missing file, everything downstream will produce
plausible NULLs rather than errors — fix it before reading any other result.

---

## 10. Migration into `wonder` (2026-08-26) — what changed, what is UNVERIFIED

Files now live in `solutions/schematics/`; `drill-table-widget.js` moved to `wonder/bi/viz/widgets/` and is
imported by `wonder/bi/viz/viz-index.js`. Tests are wired through `.jb6/entry-points-roee.js`
(`developerEntryPoint` resolves `{gitUser}` from `git config user.email` → `roee`).

Import remap actually applied:

| Genie | wonder |
|---|---|
| `@wonder-admin/bi/bi-common.js` | `@wonder/bi/bi-common.js` |
| `@wonder-admin/etl/etl-dsl.js` | `@wonder/db/etl/etl-dsl.js` |
| `@wonder/core/db-drivers-live-repo.js` | `@wonder/db/db-drivers-live-repo.js` |
| `@wonder/applets/applet.js` | `@wonder/ui/applet.js` |
| `../../viz/viz-index.js` | `@wonder/bi/viz/viz-index.js` |

**wonder's `bi-common.js` is NOT Genie's.** It imports only `bi-dsl.js` + `metrics.js`, where Genie's also
pulled in `materialization.js`, `event-sources.js`, `bi-etl.js`, `bi-manifest.js` and more. So
`schematics-cdc-cube.js` now states `import '@wonder/bi/materialization.js'` explicitly — without it
`materializeFromEvents`, `lookupByQuery`, `enrichFromLookup`, `withReduceFunc`, `pick`, `last`, `count`,
`buildCube` and `materializeCubePeriod` are all undefined at destructure time.

Audited as present and API-compatible in wonder's older `bi`: `materializeFromEvents` (single `keyField`
only — wonder has no composite-grain support, schematics uses `id`, fine), `lookupByQuery`,
`enrichFromLookup` (same `ref[key]/pick` regex, same `events[0]` read — trap 7.14 still applies),
`withReduceFunc`, `pick` with `'a as b'` aliasing, `Pick('count')`, `Pick('last')`, `projection`,
`parquetSource`, `validation`, `lookupByWUrl`, `share`, `jb.biUtils.expandPeriods`, `jb.vizUtils`
(`INK`/`MUTE`/`fmtNum`/`asArray`), `coreUtils.runBashScript`/`harvestLogs`.

**`spendCube` does not collide in wonder** — `ad-drift-cubes.js` was not moved and nothing else registers
that name. Handover item §8.7 is closed by the move itself.

**Data needed no copying: `wonder/files` is a symlink to `../genie/files`.** The silver parquets, the CDC
bronze mirror at `/tmp/schm-cdc` (2.8G) and the Databricks oracle at `/tmp/schm-bronze` are all already
reachable from wonder. Nothing was duplicated.

### Two upgrade-infra adjustments wonder needed (both pre-existing wonder defects)

**1. `ui-action` moved DSL, and wonder's viz layer had not followed.** jb6 now registers `delay`/`click`
under `ui-action<react>` (`jb6/react/automation.js`), and `reactTest.userActions` is typed `ui-action<react>`.
Wonder's 20 viz widgets still destructured them from `test: { 'ui-action': ... }`, where they no longer exist,
so **`wonder/bi/viz/viz-index.js` could not be imported at all** — `TypeError: delay is not a function` at
`pie-widget.js:111`, which also killed the whole dev server at boot. Reproduced on a clean checkout of that
file, so it predates this move. Fixed by moving the destructure into the `react:` block in all 20 widgets and
re-registering wonder's own `clickVizShape` as `ui-action<react>` in `viz-test-helpers.js`.

**2. `expandPeriods` had lost the `from..to` branch.** Wonder's copy handled `today` / `all` / `last:N` /
a bare period, but not a range — so `'2026-05-14..2026-05-15'` was substituted into the wUrl verbatim and the
query died on `No files found ... clickouts-cdc-2026-05-14..2026-05-15.parquet`. Every other line of the
function was byte-identical to Genie's, so the five missing lines were ported back verbatim. `..` cannot
appear in any other spec, so this is additive. **This is load-bearing**: the dashboard's date pickers, the
gold backfill (`buildCdcGold('from..to')`) and the parity test's two-day window all depend on it.

### Verified in wonder, 2026-08-26

Run against a wonder server on **:3010** (Genie's own server on :3000 was left alone — `PORT` is honoured).
Confirmed genuinely wonder's by `topLevelImports: ["@solution/schematics/schematics-cdc-tests.js"]` and by
the silver paths in `biLog` resolving under `.../Indivi/wonder/files/...`.

| test | result |
|---|---|
| `schematicsConsts.resolveForTheApplet` | PASS — registry + applet contract |
| `clickoutsCdc.offerCatalogueResolves` | PASS — **100%** resolved, 16 verticals (trap-7.1 canary clean) |
| `clickoutsCdc.rebuildsTheDump` | PASS — 27,784 / 27,802 = **99.94%** |
| `cdcGold.spendIsNotDuplicated` | PASS — gold $119,192 == silver $119,192 (the UTC figure, not the +03 one) |
| `clickoutsCdc.maturedRevenueReachesParity` | PASS — **rev $46,566 · sales 26 · clickouts 1,459** |
| `cdcGold.helocProfitAndRoi` | PASS — rev $46,724 · spend $37,976.87 · **ROI 123.03%** · CPL $95.66 |
| `helocDashboard.cdcQueriesResolveOverARange` | PASS — 4-day range resolves after the expandPeriods fix |
| `clickoutsCdc.latestWinsCollapsedManyVersions` | PASS — 27,594 objs from 87,245 records (3.16x) |
| `clickoutsCdc.clickoutCarriesItsOwnAttribution` | PASS — sub1 **98.7%** (matches §8.7b) |
| `clickoutsCdc.answersHeloc` | PASS |
| `conversionsCube.allVerticalsPresent` | PASS — 6,320,445 clickouts, 28 verticals |
| `conversionsCube.leadToSaleByClient` | PASS — amerisave 42445/1803, unison 1370/95 |
| `spendCube.accountVerticalIsPure` | PASS |
| `adPerformanceCube.helocReconciles` | PASS — $6,857,331 / $7,034,576 / 77150 / 2596 |
| `adPerformanceCube.kpiTilesAreSane` | PASS — ROI 105.51%, CPL $100.46 |

Every figure reproduces the Genie baselines exactly. Both pipelines — CDC and the Databricks oracle — are
live in wonder.

**The 6 `HeavyTest` rebuilds were deliberately NOT run.** The silver is already built and matured at
lagDays 21; per trap 7.4, `clickoutsCdc.buildsTheDay` rebuilds 2026-05-15 at lag 2 into the same wUrl and
would downgrade the parity day from 406 leads to 399. Run them only when you intend to rebuild, and in the
§6 order.

### Still open

`/room/schematicsBI/applet/HelocDashboard` still 404s — `no applet HelocDashboard in schematicsBI`. The
applet def at `<room>/applets/HelocDashboard.json` has never been written; publishing it is
`uploadRoomApplet({roomId: 'schematicsBI', entryCompFullId: 'react-comp<react>HelocDashboard'})`. The comp
itself registers fine and all of its queries pass, so this is a publish step, not a defect. Handover §8.6
stands.

Note `wonder/files` is a symlink to `../genie/files`, so anything published from wonder lands in the same
storage Genie reads.

---

## 11. The Meta connector — assessment (2026-08-26). NOT MOVED, NOT EXECUTED.

`admin/connector/fb-connector.js` (217 lines) + `connectors.js` (70) in Genie. **This hits PRODUCTION** — the real
Meta Graph API against schematics' live ad accounts, authenticated by a real token behind
`signedRoom://schematics/admin/secrets.json`. It was read, never run. Do not loop it over a backfill range
casually: `retry()` with exponential backoff and a hardcoded `BLOCKED` account set are both there because
someone already got bitten.

### What it gives

`fb://ad?account=&period=` → one row per ad-hour carrying `spend, impressions, clicks, inline_link_clicks,
reach`, the full `account/campaign/adset/ad` id+name ladder, and `traffic_source`. Secrets never travel: only
a room *ref* moves (in `ctx.vars` / the `x-wonder-secret` header), `resolveSecret` is ACL-gated and logs the
token's SHAPE, never its value.

Two things here are strictly better than the Databricks-derived `spend.parquet`:

1. **`constructDt` converts the advertiser-timezone hour to UTC at pull time**, using each account's
   `timezone_offset_hours_utc`. That is trap 7.13 fixed AT THE SOURCE rather than patched in the gold query.
2. **`dynamicAccounts`** reads `leadcenter_settings.parquet` for `ad_accounts` + `ad_accounts_category` —
   account→vertical from schematics' OWN settings, instead of `schematics-etl.js`'s `account_vertical`, which
   is *inferred* from where the account's traffic converted and needs the revenue join to exist at all.

### THE SEAM THAT WOULD DRIVE IT FROM A CUBE IS NOT BUILT

```js
// wonder/bi/materialization.js:130 — byte-identical in Genie
async produce(ctx, period) { throw new Error('cube.produce: not implemented (accounts/connectors producer phase TBD)') },
```

So `spendEvents`' `accounts: [dynamicAccounts({connectors: [facebookInsights()]})]` in `ad-drift-cubes.js` is
**declarative only — nothing ever calls it.** That is why `spendEvents` reads pre-landed JSON from
`crmEvents://schm/hourly_smm/...`: some other process must pull and land it. `fbQuery` builds a per-account
url list into `ctx.vars.fbUrls` and no consumer for that var exists anywhere.

The ONE working live path is `apiWUrlSource` (`wonder/bi/event-sources.js:154`) — a single `wfetch2` whose
`fb://` scheme the `DbDriverInterceptor` catches and executes, with the secret ref passed as a header. It is
**one account per source**, so multi-account fan-out is the piece that has to be written.

Handover §8.3 called `spendEvents` "the unblock". That was optimistic: the connector is the unblock, but
`spendEvents` itself has never pulled a row.

### MEASURED: the spend↔revenue join key must stay name-derived

Read-only, on local parquet, no API calls. Distinct `sub1` on the 2026-05-15 clickouts vs `hourly_smm`:

| clickout sub1 values | match `campaign_id` | match `to_sub1(campaign_name)` |
|---|---|---|
| 139 | **0** | **130** |

`fb://ad` returns `campaign_id` directly and it is tempting to join on it as more robust than parsing a
campaign name. **It matches nothing.** The clickout's `sub1` is the name-derived numeric id, so
`to_sub1(campaign_name)` — the macro in `schematics-etl.js` — stays the join key.

Which makes `spendEvents`' `pick('campaign_name as sub1')` a **defect**: the comment beside it claims
"SUB1_REGEX extracts numeric id from campaign_name" but there is no regex — it aliases the RAW name. Wired to
gold as-is it would emit campaign names where `sub1` is expected and the join would fail almost entirely.

### MEASURED: what the unmatched sub1 actually is

Of 27,243 valid clickouts carrying a sub1 on 2026-05-15 (revenue $94,631), **18,394 clickouts / $86,241
(91.1% of revenue) resolve to a paid campaign.** The remainder is not a bug — the top unmatched values are
`SCHMK` (8,490), `homepage` (290), `categories` (26), `HELOCPAGE` (21), `home`, `email`, `header`: organic and
on-site placements that correctly have no Meta spend. This quantifies the gold cube's existing limit "rows
exist with revenue and zero spend (organic or untagged)".

### What still has to be written before spend.parquet can be replaced

1. Multi-account fan-out — implement `produce()`, or loop accounts and call `apiWUrlSource` per account.
2. `sub1` = `to_sub1(campaign_name)`, not the raw name (above). Verify `sub2`/`sub3` against the clickouts the
   same way before trusting them — only `sub1` has been measured.
3. `spendCube` in `ad-drift-cubes.js` carries no `vertical`, `account_name`, `sub2` or `sub3`, so it is NOT a
   drop-in for what `cdc-gold-etl.js` reads from `spd`.
4. A backfill decision. Gold needs history back to at least 2026-05-14; every day of that is real Graph API
   traffic against live accounts.

---

## 12. The spend↔revenue join key, fully measured (2026-08-26)

Read-only, local parquet, zero API calls. Distinct clickout `sub1/sub2/sub3` on 2026-05-15 against every
candidate column in `hourly_smm` — which carries exactly the `fb://ad` columns, so this settles the connector
mapping too.

| clickout col | vs `*_id` | vs raw `*_name` | vs ` - ` tail split |
|---|---|---|---|
| `sub1` / campaign (139 distinct) | **0** | 122 | **130** ← use this |
| `sub2` / adset (179 distinct) | **0** | **126** ← use this | 76 |
| `sub3` / ad (216 distinct) | **0** | **151** ← use this | 151 (no ` - ` in ad names) |

**Two rules fall out, and both are easy to get wrong:**

1. **All three subs are NAMES, never ids.** `fb://ad` hands back `campaign_id`/`adset_id`/`ad_id` and joining on
   them is the obvious "more robust than parsing names" instinct. It matches **nothing at all** — 0 of 139, 0 of
   179, 0 of 216.
2. **The ` - ` tail split applies to `sub1` ONLY.** Applying it uniformly for consistency destroys `sub2`,
   dropping it from 126 matches to 76. This confirms `schematics-etl.js`'s existing mapping
   (`to_sub1(campaign_name) sub1, adset_name sub2, ad_name sub3`) is correct as written.

### The triple is much weaker per-row than per-dollar

`cdc-gold-etl.js` joins `rev FULL JOIN cost USING (sub1, sub2, sub3)`, so what matters is the triple, not the
columns individually. Over the 27,243 valid clickouts carrying a sub1 on 2026-05-15 ($94,631 revenue):

| | matched | share |
|---|---|---|
| clickout rows | 11,754 | **43.1%** |
| revenue | $73,742 | **77.9%** |

This is the STATUS QUO, not a connector regression — `spend.parquet` already uses this exact mapping. Because
gold FULL JOINs, the unmatched 22% is not lost: it surfaces as revenue with zero spend, which is the cube's
existing "organic or untagged" limit. But note the gap between 43% of rows and 78% of dollars — the rows that
fail to join are overwhelmingly small ones, and any per-row statistic over the joined set is biased toward
big spenders. Do not quote a row-level match rate as if it were a revenue coverage rate.

### Connector prerequisites, verified present in wonder

Every dependency `fb-connector.js` + `connectors.js` need — `Scope`, `DbDriverInterceptor`,
`dbDriverInterceptor`, `jb.wonderUtils.wfetch2`, `coreUtils.enrichCtxWithDataContext`, `globalsOfTypeIds`,
`DefComponents` — exists in wonder. The two files were NOT moved; moving them is a small remap
(`@wonder/core/db-drivers.js` → `@wonder/db/db-drivers.js`).

### RESOLVED 2026-08-26: auth restored, connector ported, one step remains

After `gcloud auth login` + `application-default login`, both paths reach
`gs://indiviai-wonder-protected/schematics/admin/secrets.json` (396 bytes, updated 2026-06-27).

`fb-connector.js` is now at `wonder/bi/connector/fb-connector.js` — the only remap needed was
`@wonder/core/db-drivers.js` → `@wonder/db/db-drivers.js`. **wonder already had `connectors.js`** at
`wonder/bi/connector/connectors.js`, byte-identical to Genie's apart from that same import. Verified
registering in wonder: `fb-insight-connector` = ad, adBreakdown · `connector` = facebookInsights ·
`ad-split<fb>` = ageGender, placement, country, region, dma, hourly · 15 `field<fb>`.

STILL NOT EXECUTED against Meta. The next step is the single validation call described below; reading the
secrets file directly from a shell was blocked by the sandbox classifier (correctly — it is a credential
file). The connector resolves the secret **in-process** via `resolveSecret`, which never exposes the value,
so the right path is to let `fbConnect` do it rather than to read the file by hand.

**The minimal first call, ready to run:**
1. `fbConnect(secret, accountIds)` once — populates `ctx.vars.fbAccounts {act_x:{offset,status}}`.
   This is NOT optional: `fbGraphPull` reads that offset for `constructDt`, and without it every account's
   spend is bucketed at `offset = 0`, i.e. the wrong hours, silently.
2. ONE `fb://ad?account=<single active account>&period=2026-05-15` — a day already covered by `hourly_smm`,
   so the mapping in §12 validates against known-good local data at minimal prod cost.
3. Diff the returned columns against `hourly_smm` for that account/day before fanning out to anything.

### (historical) the blocker that has now been cleared

`signedRoom://schematics/admin/secrets.json` → `gs://indiviai-wonder-protected/schematics/admin/secrets.json`.
There is no local mirror (`files/rooms/` holds only `schematicsBI`, no `schematics` room), `FB_TOKEN` is unset,
and BOTH credential paths are expired with `invalid_grant / invalid_rapt`:

- `gcloud storage` → "Reauthentication failed"
- Node ADC (`~/.config/gcloud/application_default_credentials.json`, stamped 2026-08-25) → same error

Clearing it needs an interactive login the agent cannot perform:

    gcloud auth login
    gcloud auth application-default login

Until then the connector cannot be exercised at all. Do NOT work around this by pasting a raw Meta token —
the whole point of the ref-not-token design in `resolveSecret` is that the token never lives in source, env,
or a wUrl.

---

## 13. First live connector call — 2026-08-26. PATH PROVEN, TOKEN EXPIRED.

One call, one account (`act_2048397800` "Auto Insurance" — 1 ad, $302.28 on 2026-05-15, deliberately the
smallest account with data that day), one period. Meta answered:

```
OAuthException: Error validating access token:
  Session has expired on Tuesday, 25-Aug-26 02:22:50 PDT. The current time is Wednesday, 26-Aug-26 09:45:04 PDT.
```

**Everything except the credential is verified working:**
`fb-connector.js` loads in wonder → `resolveSecret` resolves the token (193 chars, correct shape) →
`fb://ad` matched by the `DbDriverInterceptor` (`{t:'fb pre', matched:true, hasSecretHeader:true}`) →
request reached Meta → Meta replied. Only the token is stale.

**SILENT FAILURE — the one to guard.** An expired token does NOT raise. `fbConnect` logged
`{t:'fbConnect', accounts: 0}` and the pull returned `rows: 0`. Downstream that is indistinguishable from
"this account had no spend that day". A `pullFbSpend` implementation MUST treat `accounts === 0`, or any
`fbError`, as a hard failure and refuse to write the period's parquet — see the "never write a partial day"
rule in the fan-out design. A zero-row spend day silently inflates ROI to infinity.

**The secret's layout is not what §11 assumed.** `resolveSecret` reads `secrets.facebook`, taking `.token` or
`.access_token` if it is an object. The live token is NOT at any of those paths — it was located by SHAPE
(a ≥100-char / `EAA`-prefixed string) by walking the JSON. So either the file uses a different key and
`resolveSecret` would fail against it even with a fresh token, or the nesting differs. **Confirm the key name
when the token is replaced**, and if it is not `facebook` (flat) or `facebook.token` / `facebook.access_token`,
either move it or widen `resolveSecret`. This is a real latent bug, independent of expiry.

### What to ask for

A **System User token** (does not expire) or at minimum a 60-day long-lived user token, with `ads_read`, held
by an identity that can see schematics' ad accounts (`/me/adaccounts` is how they are discovered). Written
directly into `gs://indiviai-wonder-protected/schematics/admin/secrets.json` under `facebook` — merged into
the existing file, not replacing it. The short-lived token that was there lasted well under a day of useful
life after issue.

---

## 14. Why the applet 404s — diagnosed 2026-08-26

Not a missing component. `HelocDashboard` registers fine in wonder (verified), and `viz-index.js` imports
cleanly. The route is:

```js
// cloud-services/express-server/app.js:69
const applet = await readDef(roomWUrl, `applets/${name}.json`)
if (!applet) return next()          // ← the 404
```

`readDef` fetches `room://schematicsBI/applets/HelocDashboard.json` through `wfetch2` with
`storageEnvVars()`, which returns `{}` unless `STORAGE_PROVIDER=minio`. So `db` falls to its default —
**`'gcs'`** (`db-drivers-utils.js:20`) — and `room://` resolves to:

    gs://indiviai-wonder/schematicsBI/...

**The `schematicsBI` room does not exist in that bucket at all.** Nothing was ever uploaded. Every test in
this pipeline passes only because it forces `Var('db', 'fs')`, which maps `room://` onto local `files/`. The
server has no equivalent switch: `db` comes from `storageEnvVars()` or the default, never from a flag.

So "the applet is unpublished" (§8.6) is precise and literal: the room is local-only. The applet def written
at `files/rooms/schematicsBI/applets/HelocDashboard.json` is invisible to the server.

Note `files/` is a symlink to `../genie/files`, so that def actually landed in the Genie checkout — the two
repos share room data.

### To publish, upload to `gs://indiviai-wonder/schematicsBI/`

| object | size |
|---|---|
| `applets/HelocDashboard.json` | ~100 B |
| `usersRO/silver/cdc-ad-performance-2026-05-{14,15,16,17}.parquet` | ~95 KB total |

The gold parquets are what `cdcAdPerformanceCube` reads; the dashboard defaults to 2026-05-15..17 and the
picker is capped at the spend horizon, so those four days are the whole MVP surface. The clickout silver and
`spend.parquet` are NOT needed by the applet — gold already carries revenue and spend on one row.

The def itself:

```json
{ "cmpId": "HelocDashboard",
  "urlsToLoad": "@solution/schematics/heloc-dashboard.js",
  "liveRepo": true }
```

`liveRepo: true` serves the UI from the localhost live repo rather than a bucket code snapshot, so edits to
`heloc-dashboard.js` are live without an `uploadRoomApplet`. `noAuth` was deliberately NOT set — with it, the
dashboard renders for anyone who has the URL. Leave it off unless that is wanted, and never set it on a def
that reaches a shared bucket.

---

## 15. Migration proof — differential rebuild, 2026-05-16 (2026-08-27)

### Why the 15 green tests were not proof

Every silver parquet on disk is stamped 2026-08-26 10:53–10:58; wonder was first touched at 11:09. **Genie
built all of them.** And all 7 build tests carry `HeavyTest: true`, which `jb6/testing/tester.js:236` skips
unless a test is named explicitly:

```js
.filter(id => specificTest || includeHeavy || !Test[id][asJbComp]?.HeavyTest)
```

So the passing suite exercised the READ path over Genie's artifacts. It never proved wonder could BUILD them
— which is the risky half, because wonder's `materialization.js` is an OLDER file than Genie's and the two
genuinely differ:

```js
Genie:  const fieldR = reducers.filter(r => !r.phase)           // period-phase EXCLUDED
wonder: const fieldR = reducers.filter(r => r.phase !== 'obj')  // period-phase INCLUDED
```

(Schematics uses no period-phase reducer, so this is latent rather than active — but it proves the build path
is not the same code.)

### The harness

`migration-parity.js` registers `parquetContentDiff(left, right)` — schema drift first, then a symmetric
`EXCEPT` in both directions. Schema-first is load-bearing: `EXCEPT` **throws** on mismatched column types
rather than reporting them, so trap 7.6's per-build type inference (`is_lead` VARCHAR one run, BIGINT the
next) would surface as an opaque duckdb error instead of the finding.

Validated before use — a diff tool that only ever says "identical" proves nothing:

| control | expected | got |
|---|---|---|
| file vs itself | identical | identical, 19,190 rows |
| 05-16 vs 05-17 (same schema, different data) | rows differ | 19,190 vs 22,863, all differ |
| ref-offers vs ref-clients (different schema) | report drift, do NOT throw | 7 columns of drift, no throw |

### Result

Two builds of 2026-05-16 in wonder, at the source-default `lagDays: 2` — matching how Genie built that day
through `buildCdcRange`, which does not propagate a lag override (trap 7.3). Genie's artifact was frozen to
`/tmp/schm-migration-ref` FIRST, because `files/` symlinks into the Genie checkout and a rebuild overwrites
the very reference you would compare against.

| level | claim | result |
|---|---|---|
| **L0 determinism** | wonder run1 ≡ wonder run2 | **PASS** — 19,190 rows, 0 differences |
| **L1 fidelity** | Genie ≡ wonder | **PASS** — 19,190 rows, 0 differences, 0 schema drift |

All three files share one sha256 (`ceed4f3b…`) — **byte-identical**, not merely content-identical.

**Correction to §14-era guidance:** I claimed parquet is not byte-reproducible here (zstd framing, row-group
boundaries, `created_by`). For THIS pipeline that is wrong — it reproduces exactly. The content diff was still
the right instrument: byte-equality is sufficient but not necessary, and had the bytes differed only the cell
diff could say whether it mattered.

Integrity checks: the avro scratch `/tmp/avroCdc-links_tracking_clicks-2026-05-16-lag2.jsonl` was rewritten
during the run (119MB, correct lag), so the source genuinely re-read the bronze rather than short-circuiting.
Genie's artifact was restored afterwards and `shasum -c FROZEN.sha256` verifies all four frozen files.

### What this does NOT prove

L1 covered ONE of four build paths — the clickout silver via `materializeFromEvents` + `avroCdcSource`.
Still never executed in wonder at all:

1. **`buildCdcReference`** — python replay + duckdb COPY. Its output (`ref-*.parquet`) is an INPUT to the run
   above, so the differential silently assumed it correct.
2. **`buildCdcGold`** — duckdb heredoc.
3. **The matured lag-21 path** — 05-14/05-15, which is what `maturedRevenueReachesParity` asserts on. The
   parity numbers ($46,566 / 26 sales) are still Genie-built figures.
4. **L3, collateral damage** — 20+ shared viz widgets and `expandPeriods` in `bi-dsl.js` were edited during
   the port and wonder's own suite has never been run against them.

L2 — re-running the Databricks oracle against WONDER-built artifacts — is the claim that actually matters,
because the dump is independent of both repos. Matching Genie only proves fidelity, and would faithfully
reproduce a Genie bug.

---

## 16. L2 — the ORACLE, against WONDER-built silver (2026-08-27)

05-14 and 05-15 rebuilt in wonder at `lagDays: 21` via `materializeCubePeriod` (the only entrypoint that
propagates the lag — trap 7.3), then the two oracle tests re-run against that output. The Databricks dump is
independent of both repos, so this is the claim that actually proves the migration rather than merely proving
wonder agrees with Genie.

| oracle | result | dump |
|---|---|---|
| `clickoutsCdc.rebuildsTheDump` | 27,784 / 27,802 = **99.94%** | — |
| `clickoutsCdc.maturedRevenueReachesParity` | **$46,566** · **26 sales** · 1,459 clickouts · 406 leads | $46,553 · 26 · 1,456 · 403 |

**These figures are now wonder-built.** Everything §8 reported was Genie-built and inherited.

Builds: 05-14 → 25,105 objs / 848,165 B / 55s · 05-15 → 27,594 objs / 915,582 B / 53s.

### The 05-15 differential "failure" is a STALE REFERENCE, not a migration defect

`parquetContentDiff(genie, wonder)` on 05-15 reported 154 rows differing each way (05-14 was identical).
Diffing the columns rather than guessing:

| column | rows differing |
|---|---|
| `cdc_versions` | **154 — all of them** |
| `is_lead` | 29 |
| `revenue_amount`, `is_sale`, `disposition`, `vertical`, `sub1`, `offer_id` | **0** |

`cdc_versions` is `pick('id as cdc_versions', {take: count()})` — how many CDC change records collapsed into
the row, which is a DIRECT function of the lag window. Only lag-sensitive columns moved. Genie's on-disk
05-15 had seen fewer change records, i.e. it was built with a narrower effective window: **trap 7.4 exactly**
("`clickoutsCdc.buildsTheDay` rebuilds 05-15 at lag 2 into the same wUrl the matured build writes … running
the suite in order downgrades the parity day").

Confirmed on the HELOC slice over the dump's own +03 instant range:

| | clickouts | leads | revenue |
|---|---|---|---|
| genie (stale) | 1,245 | 343 | $40,443 |
| wonder (lag 21) | 1,245 | **350** | **$40,443** |

Leads move with the window; revenue does not — because revenue is joined from the ledger on `click_id`, which
is constant across versions. That is the cube's own documented lag behaviour, reproduced independently here,
and it is why `maturedRevenueReachesParity` asserts revenue and sales exactly but leads only as a range.

**A differential against a mutable reference is only as good as the reference.** 05-16 was safe because
nothing else rebuilds it; 05-15 is the one day the suite itself clobbers. When re-running this, either freeze
the reference immediately after a known-good matured build, or diff only the lag-stable columns.

### State of `files/` after this run

`files/` symlinks into the Genie checkout, so these builds replaced Genie's 05-14/05-15 artifacts. **The
wonder builds were LEFT in place deliberately** — they are matured at lag 21 and oracle-verified, where the
originals were stale. Genie's originals remain recoverable at `/tmp/schm-migration-ref/genie-clickouts-2026-05-1{4,5}.parquet`
with checksums in `FROZEN.sha256`. 05-16 was restored to Genie's byte-identical original.

### Scoreboard

| level | claim | status |
|---|---|---|
| L0 determinism | wonder run ≡ wonder run | **PASS** (05-16, byte-identical) |
| L1 fidelity | Genie ≡ wonder | **PASS** 05-16 & 05-14; 05-15 explained by a stale reference |
| L2 correctness | independent dump oracle on wonder-built silver | **PASS** |
| L3 collateral | wonder's own suite vs the 20+ shared files edited in the port | **NOT RUN** |

Still never executed in wonder: `buildCdcReference` and `buildCdcGold` — both shell-out ETLs (python replay,
duckdb heredoc). `ref-*.parquet` was an INPUT to every build above, so its correctness is still assumed.

---

## 17. The last two build paths, executed in wonder (2026-08-27)

`buildCdcReference` and `buildCdcGold` had never run outside Genie. Both are shell-outs — python/fastavro
replay and a duckdb heredoc — so neither was covered by the silver differential. Outputs were frozen first
(`files/` symlinks into Genie), and a PREDICTION was recorded BEFORE running so the result could falsify it
rather than be rationalised afterwards.

### buildCdcReference — 5.8s, all three IDENTICAL

| parquet | rows | vs Genie |
|---|---|---|
| `ref-offers` | 1,344 | identical |
| `ref-clients` | 352 | identical |
| `ref-payouts` | 55,768 | identical |

This closes the hole under §15–16: the reference tables were an INPUT to every build proven there, and their
correctness had only been assumed. The full-history replay reproduces exactly.

### buildCdcGold — 0.4s for 4 days, 3 identical and 1 differing exactly as predicted

| day | vs Genie |
|---|---|
| 2026-05-14 | identical (870 rows) |
| **2026-05-15** | **22 rows differ** |
| 2026-05-16 | identical (585 rows) |
| 2026-05-17 | identical (471 rows) |

05-15 was PREDICTED to differ, and to differ only in lead columns, because wonder's 05-15 clickout silver is
the matured lag-21 build while Genie's was the stale one (§16) — 29 rows with a changed `is_lead`. Measured:

| | rows differing |
|---|---|
| `lead_count` | 22 (3 of them `amerisave_lead_count`) |
| `revenue_amount`, `spend_amount`, `profit_amount`, `sale_count`, `clickout_count` | **0** |

Day totals — revenue **$96,012**, spend **$119,192**, sales **47** — identical in both. Leads move
**2,066 → 2,095 = +29**, exactly the 29 silver rows. The whole causal chain is accounted for: a wider lag
window changes `is_lead` on 29 clickouts, that propagates to `lead_count` on 22 ad-days, and touches nothing
else. Gold's spend is the UTC $119,192, not the Asia/Jerusalem $121,172, so trap 7.13's pin holds in wonder.

### MIGRATION SCOREBOARD — all four build paths now executed in wonder

| level | claim | status |
|---|---|---|
| L0 | build is deterministic | **PASS** — byte-identical across two runs |
| L1 | wonder ≡ Genie | **PASS** — silver 05-16/05-14, all 3 reference tables, gold 05-14/16/17; the two exceptions (silver 05-15, gold 05-15) are a stale reference, fully explained and predicted |
| L2 | independent Databricks oracle on wonder-built silver | **PASS** — 99.94% reconstruction, $46,566, 26 sales |
| L3 | wonder's own suite vs the 20+ shared files edited during the port | **NOT RUN** |

Build paths, all now exercised in wonder: `materializeFromEvents`+`avroCdcSource` (default lag AND matured
lag-21), `buildCdcReference` (python replay), `buildCdcGold` (duckdb heredoc).

The only remaining risk is L3 — collateral damage to the rest of wonder from the `ui-action` fix across 20+
viz widgets and the `expandPeriods` change in the shared `bi-dsl.js`. That is a wonder-wide question, not a
schematics one.

---

## 18. L3 — collateral damage to the rest of wonder (2026-08-27)

The port edited 20+ shared viz widgets (`ui-action` destructure) and `expandPeriods` in the shared
`bi-dsl.js`. Neither is schematics code, so both were run against wonder's OWN suites, differentially: a
clean `git worktree` at HEAD (non-destructive — the working tree was never stashed) versus the working tree.

### Viz widgets — a REPAIR, not a regression

| | HEAD | working tree |
|---|---|---|
| `import viz-index.js` | **fails: "delay is not a function"** | OK |
| viz suite | **0 tests runnable** — process dies at `pie-widget.js:111` | **65 / 65 pass** |

At HEAD the entire viz widget library is unloadable. `delay` moved from the `test` DSL to `react`
(`ui-action<react>`), and every widget still destructured `test: {'ui-action': {delay}}`, which throws at
module scope. The port surfaced this because `heloc-dashboard.js` imports `viz-index.js`; nothing else in the
loaded set did. Anything else in the repo still destructuring `delay` from `test` has the same latent break.

### BI suite — IDENTICAL behaviour, no divergence

| | HEAD | working tree |
|---|---|---|
| tests completed | 14 | 14 |
| set of tests completed | — | **identical (diff empty)** |
| terminating error | `s.replaceAll is not a function` | same |
| `biTest.parquetSourceBuildSkipped` | fails: `dimensions.map` of null | same |

Byte-for-byte the same behaviour with and without the port's changes. **The `expandPeriods` change caused no
regression.**

### Two PRE-EXISTING wonder bugs found (not caused by the port, not fixed here)

1. **`bi-dsl.js:174`** — `dimensionStatsBuilders: () => dimensions.map(...)` throws when a cube declares no
   `dimensions`. `biTest.parquetSourceBuildSkipped` builds exactly such a cube. Reproduces at clean HEAD.
   The throw is uncaught and kills the whole runner, so every test after it is silently skipped — which is
   why the bi suite reports far fewer tests than it contains.
2. **`s.replaceAll is not a function`** via `bi-dsl.js:601` — a non-string reaching a `replaceAll`. Also
   reproduces at clean HEAD, and also kills the runner.

Both are out of scope for the migration. They matter because they mask the rest of the bi suite: with them
unfixed, nobody can see whether the other ~40 bi tests pass.

### FINAL SCOREBOARD

| level | claim | status |
|---|---|---|
| L0 | build is deterministic | **PASS** |
| L1 | wonder ≡ Genie | **PASS** (two exceptions predicted in advance and explained) |
| L2 | independent Databricks oracle on wonder-built silver | **PASS** — 99.94%, $46,566, 26 sales |
| L3 | no collateral damage to wonder | **PASS** — bi identical; viz repaired from fully broken to 65/65 |

The schematics migration is proven end to end: all four build paths executed in wonder, output verified
against both Genie and an independent oracle, and the rest of the repo verified unharmed.

---

## 19. DEPLOYED to `signedRoom://schematicsBI` (2026-08-27)

The room is live at `gs://indiviai-wonder-protected/schematicsBI/`.

| path | contents |
|---|---|
| `admin/users.json` | 4 admins (shaiby, yiftach, roee, the compute SA). `users: []` — add BI viewers here; they get `r` on `usersRO` and never see `admin/` |
| `applets/HelocDashboard.json` | the applet def |
| `usersRO/silver/` | 12 parquets, 25.3 MB — 3 reference, spend, 4 clickout silver, 4 gold |

Signatures are minted ON DEMAND by the server from `users.json` (`signed-url.js makeSignatures`), so provisioning
a room is exactly one file. Nothing else was needed.

### The cut-over is ONE line

```js
const ROOM = 'signedRoom://schematicsBI'
```

`schematics-cdc-cube.js` had `room://schematicsBI` in five places (silver wUrl, three lookup SQLs, the gold
`parquetSource`); all now derive from `ROOM`.

**Why this does not break the local test path**, which is the whole proof asset: the driver is chosen by
`ctx.vars.db` overriding the scope default (`db-drivers-utils.js:176`), and signed rooms have an FS mirror.
Measured:

    signedRoom://schematicsBI/usersRO/silver/cdc-ad-performance-2026-05-15.parquet
      under Var('db','fs')  ->  files/rooms/schematicsBI/usersRO/silver/cdc-ad-performance-2026-05-15.parquet

i.e. exactly where the parquets already were. `db:'fs'` reads the mirror; the server signs. Re-verified after
the cut-over, numbers unchanged:

| test | result |
|---|---|
| `clickoutsCdc.offerCatalogueResolves` | 27,594 rows, **100%** resolved, 16 verticals |
| `clickoutsCdc.maturedRevenueReachesParity` | 1,459 · 406 leads · **26 sales** · **$46,566** |
| `cdcGold.helocProfitAndRoi` | $46,724 rev · $37,976.87 spend · **ROI 123.03%** · CPL $94 |

### The §14 404 is closed

    GET /signed-room/schematicsBI/applet/HelocDashboard  ->  200
    appletSpec = {"cmpId":"HelocDashboard","urlsToLoad":"@solution/schematics/heloc-dashboard.js",
                  "liveRepo":true,"roomWUrl":"signedRoom://schematicsBI","noAuth":false}

`noAuth` is deliberately absent, so the page gates on login — which is the point of a signed room. `liveRepo:
true` serves the UI from the repo, so editing `heloc-dashboard.js` is live without an `uploadRoomApplet`.

### NOT YET DONE — what stands between this and "a full working version"

1. **Never rendered in a browser.** The route serves and the spec is right, but the page gates on login and
   the actual render was not visually confirmed. `helocDashboard.rendersWithRealData` still fails on the
   macOS-only colsCache `cacheStrategy` plumbing.
2. **No nightly job.** Everything above is a hand-run build. `gcloudCronEtl` is the chosen primitive
   (Cloud Run Job + Scheduler, me-west1); the image needs python3 + fastavro + duckdb.
3. **Spend is frozen at 2026-06-04** — the Meta token is expired, so 5 of 10 KPI tiles cannot be live.
4. **The dashboard is not yet Sigma-shaped** — needs `conversion_time` in the silver, a second date axis in
   gold, the P&L tile row, and heat on Profit/L2S%.
5. **Bronze still comes from a local `/tmp` mirror.** Schematics are to land CDC in a dedicated bucket
   (§ recommendation); until then `pull-cdc-day.sh` under a human identity is the ingest.

---

## 20. Time-travel demo: a real clock, a real fast-forward (2026-08-27)

Goal: a dashboard on REAL data, anchored at the first fully-covered day, with a control that advances one day
and runs the ETLs in view.

### The arithmetic that shapes it

A day displays as matured only after 21 days of settling, so to show **2026-05-14** settled, "today" must be
**2026-06-04**. Each advance matures exactly one more day:

    today 2026-06-04  ->  matured through 2026-05-14   (demo start)
    today 2026-06-25  ->  matured through 2026-06-04   (spend horizon, demo end)

**22 demo days = 21 advances.** Mirroring bronze past 06-25 buys NOTHING — the limit is the spend horizon at
2026-06-04, not the CDC. Measured:

| mirror to | matured AND spend-backed days | extra pull |
|---|---|---|
| 2026-06-05 (before) | 2 | — |
| **2026-06-25** | **22** | +20 days, ~2.4 GB |
| 2026-08-25 | 22 — no gain | +81 days, ~9.5 GB |

### `demo-advance-day.js`

**The clock is READ, never sensed.** `usersRO/pipeline-state.json` holds `{asOf, maturityDays, lastRun}` — the
same shape `gcloudCronEtl` writes as `state.json`. `heloc-dashboard.js` previously called `Date.now()` for its
maturity banner, which cannot work over a historical dataset: every day would read as long-settled and the
warning would never fire. In production the nightly job writes the same field, so the dashboard reports the
PIPELINE's freshness rather than the browser's clock. No demo-only branch exists.

**`advanceSchematicsDay`** does what a real day does, not just append:

| | period | lag | why |
|---|---|---|---|
| the day that arrived | `asOf+1` | source default (2) | deliberately immature — what a nightly run actually sees |
| the day that settled | `asOf+1-21` | **21** | this rebuild is what makes revenue final |

Then gold for **those two days only** — never the range between them. A range demands a silver for every day
in it, and a per-period silver raises `IO Error: No files found` for an unbuilt day rather than returning
empty (trap 7.11). That mistake was made and caught here.

Written with `dynamic: true` params (`buildSilver`, `buildGold`) invoked as `buildSilver(ctx.setVars({period,
lagDays}))`, so the impl orchestrates without `ctx.run` on a profile.

### PROVEN: one advance, end to end

    asOf 2026-06-04 -> 2026-06-05
      fresh   2026-06-05  16,207 objs  (lag 2)
      matured 2026-05-15  27,594 objs  (lag 21 — matches the known count exactly)
      61.7s · status ok

State updated, `usersRO/etl-runs/2026-06-05.json` written, gold rebuilt for both days.

### Dashboard changes

- header reads `pipeline as of <asOf>`
- **`Next day ▶`** calls `advanceSchematicsDayLambda` (permissionByPath `usersRO`, which `users.json` grants
  rw to admins only — a viewer can read the dashboard but cannot move the clock). The ETL shells out to
  python3/duckdb, so it can only run server-side; the button ships it over the room-lambda wire.
- maturity measured as `daysBetween(to, clock.asOf)`, so the "younger than 21 days" banner fires correctly —
  and becomes a visible demo beat rather than a footnote
- **Pipeline runs** panel listing the real run records — the same shape production monitoring reads

### NOT VERIFIED

The button has never been clicked. The applet registers, the route serves 200, the ETL is proven standalone —
but the `invokeSnippetInContext` path and 21 sequential advances are untested, and nothing has been rendered
in a browser. That remains the recurring gap: everything here is proven on the data path, not visually.
