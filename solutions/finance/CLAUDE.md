# Finance demo (Payoneer POC)

Cross-border wallet analytics. Rooms: **finance-demo** (canonical; data `usersRO/data/finance_<persona>_<size>.csv|.parquet` — the ONLY copy, repo sample-data was deleted 2026-07-20; personas freelancer|ecommerce|marketplace × realistic|heavy) and **4c7ef0** (self-contained deck room: FinanceDeck + its own copy of the demo, lambdas and data).
URLs: `localhost:3000/room/finance-demo/applet/FinanceDemo` (`?noAuth` skips login; local dev mints a wonder token) · same path on staging.indivi.ai.

## Architecture
- [finance-cube.js](finance-cube.js) — semantic layer over the `admin/bi` DSL: `financeCube` (metrics money_in/money_out/fees/failed_rate/… + dimensions with LLM guidance) — every business SQL definition lives here ONCE. Its `financeTxSource` tags every row with `entity` and consolidates persona `'__all__'` via UNION ALL inside the cube. Also the `report<bi>` verified-report catalog and the `financeUserWidgets` contentType (userPerRoomPrivate ⇒ per-google-user widgets, privacy by storage path).
- [finance-demo.js](finance-demo.js) — the applet. Dashboard SQL via the pure-JS metric map (`CUBE_META`/`M`, zero compile cost) and/or `runReportBatch` (mixed report/cube-SQL entries, per-entry `where` → `cubeWhere`, one lambda round-trip); verified reports via `setupCube`+`runReport` (cubeQuery AST compile ~400ms, runs where duckdb lives); `+ New widget` builder and pin-from-Ask-AI. Saved-widget types: `cube` (follows dashboard filters) | `report` (re-runs the verified report) | `pinned` (fixed LLM SQL, csv path templated `{FILE}` for persona portability).
- [finance-analytics.js](finance-analytics.js) — Ask-AI workflow (LLM writes plain duckDbSql; the metric vocabulary is auto-rendered from the cube into the financeSchema doclet) + the 4 lambdas: runFinanceSql, runFinanceSqlBatch, runFinanceAnalytics, runFinanceReport. `anchorTodayToDataEnd` overrides TODAYS_DATE with the cube's max(Date) — the dataset is frozen (ends 2025-06-30), so the real date made the LLM query empty future months.
- Data (finance-cube.js): `DATA_ROOT = room://finance-demo/usersRO/data` in EVERY realm — GCS is the single source of truth. The linux lambda byte-range-reads via the cols_cache extension (`colsCache`); every other realm (mac dev, browser LIVE, node tests) auto-mirrors whole files to `/tmp/wcache` (`fullFileCache`, Last-Modified-validated — first query downloads ~6MB, needs network). `resolveFroms` pins db:'gcs', so the ambient `db:'local'` (browser Ask-AI) cannot re-route it. Since 2026-08-07 (appletV 08-07-6hqg) the applet runs queries in-page in EVERY realm — duckdb-wasm with cols_cache statically linked byte-ranges bucket parquet via same-origin `/gcs-proxy` (`gcshttpblockedbycors` category); `?engine=lambda` falls back to the room-lambda batch path (needed for signed rooms). Measured on staging: wasm batch 3.6s cold / 0.6s warm vs lambda 4.3s every batch; wasm cache is per-page-session.
- Tests: [finance-cube-tests.js](finance-cube-tests.js) (registered in all-tests). Ask-AI health check (node): `dsls.common.data.runFinanceAnalytics.$run('Who are my top payers?')` — expect Upwork Global Inc **$673,124** (freelancer/realistic).

## Publish (proven 2026-07-15; appletV 07-14-02bp, lambdaV 0715-1022)
Runner: `node --experimental-vm-modules --import ./public/core/nodejs-importmap.js <script.mjs>` — needs fresh ADC; bypasses the local server. Script essence (imports: `uploadCompDependencies`/`uploadLambdaCompDependencies` from `@wonder/server/mcp-tools/wonder-mcp-tools.js` + `Storage` from `@google-cloud/storage`; import the entry file first so comps register):
```js
// LAMBDAS: const {lambdaV} = await uploadLambdaCompDependencies('@wonder-admin/finance/finance-analytics.js')
//   then for each of the 4 lambdaIds: write indiviai-wonder/<roomId>/lambdas/<id>.json = {lambdaV, entryCompFullId:`data<common>${id}`, dir:'usersRO'}
// APPLET:  await uploadCompDependencies('@wonder-admin/finance/finance-demo.js', ({appletV}) => write
//   <roomId>/applets/FinanceDemo.json = {cmpId:'FinanceDemo', urlsToLoad: entryPath, appletV, entryCompFullId:'react-comp<react>FinanceDemo'})
// REPOINT a room to an existing snapshot (no rebuild): rewrite its lambda defs with the old lambdaV.
// DECK room bootstrap: copy finance-demo/{lambdas/,usersRO/data/} objects to <roomId>/ on the bucket.
```

## Gotchas (each cost a debug cycle)
- Lambda vars must use `db:'gcs'` — `db:'local'` (browser-LIVE only) resolves `room://` to nonexistent `files/rooms/` paths → every Ask-AI query dies.
- **workflowUtils replace-vs-merge**: `workflow-core.js` does `jb.workflowUtils = {…}` which, in the lambda closure's module order, wipes llm-flow's `waitForHumanFeedbackVars` → duckDbSql crash. The fix (`Object.assign(jb.workflowUtils ||= {}, …)` in all 3 writers: workflow-core, llm-flow-core, llm-summary-step) is applied in-tree and pinned by the `financeCube.askAiWorkflowUtilsIntact` test — run it before any lambda republish.
- Restart localhost:3000 after `gcloud auth application-default login` — the server process caches stale ADC.
- Staging's lambda gate rejects the dev HMAC token ("No pem found for HS256") — test the published closure via the LOCAL gate: `invokeSnippetInContext` with `lambdaHost:'http://localhost:3000'`, `roomUrl:'room://finance-demo'`.
- Verified-report `sql` is cube-vocabulary — runnable only through cubeQuery, not plain duckDbSql. Metric aliases survive compile (`money_in as "value"`).
- anon-user widget test artifacts exist in storage (visible only with `?noAuth`; trash icon removes).

Full screen spec: [finance_demo_screen_spec.md](finance_demo_screen_spec.md).
