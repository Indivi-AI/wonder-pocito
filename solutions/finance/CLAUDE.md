# Finance demo (Payoneer POC)

Cross-border wallet analytics. Rooms: **finance-demo** (canonical; data
`usersRO/data/finance_<persona>_<size>.csv|.parquet` — the only copy; personas
freelancer|ecommerce|marketplace × realistic|heavy) and **4c7ef0** (self-contained deck room).
URLs: `localhost:3000/room/finance-demo/applet/FinanceDemo` (`?noAuth` skips login; local dev mints a wonder token) · same path on staging.indivi.ai.

## Architecture
- [finance-cube.js](finance-cube.js) — semantic layer containing metrics, dimensions, the verified-report catalog,
  and per-user widgets. `financeTxSource` tags every row with `entity` and consolidates `'__all__'` inside the cube.
- [finance-demo.js](finance-demo.js) — applet using the metric map or `runReportBatch`; verified reports use
  `setupCube`+`runReport`. Saved widgets are `cube`, `report`, or `pinned`.
- [finance-analytics.js](finance-analytics.js) — Ask-AI workflow and four lambdas. `anchorTodayToDataEnd`
  uses the frozen dataset's 2025-06-30 end date instead of the current date.
- Data: `DATA_ROOT = room://finance-demo/usersRO/data` in every realm; the configured remote bucket is authoritative.
  Linux byte-range-reads through `colsCache`; macOS/node dev mirrors whole files through `fullFileCache`.
  `resolveFroms` pins `db:'bucket'`, so ambient `db:'local'` cannot re-route it.
- Tests: [finance-cube-tests.js](finance-cube-tests.js) is registered in all-tests. The Ask-AI health check should
  return Upwork Global Inc **$673,124** for freelancer/realistic.

## Publish (proven 2026-07-15; appletV 07-14-02bp, lambdaV 0715-1022)
Runner: `node --experimental-vm-modules --import ./nodejs-importmap.js <script.mjs>`; bypasses the local server.
Import the Wonder MCP upload functions and the entry file first so components register.
```js
// LAMBDAS: const {lambdaV} = await uploadLambdaCompDependencies('@wonder-admin/finance/finance-analytics.js')
//   write each lambda definition with lambdaV, entryCompFullId and dir:'usersRO'
// APPLET:  await uploadCompDependencies('@wonder-admin/finance/finance-demo.js', ({appletV}) => write
//   write FinanceDemo.json with cmpId, urlsToLoad, appletV and entryCompFullId)
// REPOINT a room to an existing snapshot (no rebuild): rewrite its lambda defs with the old lambdaV.
// DECK room bootstrap: copy finance-demo/{lambdas/,usersRO/data/} objects to <roomId>/ on the bucket.
```

## Gotchas (each cost a debug cycle)
- Lambda vars must use `db:'bucket'`; `db:'local'` resolves `room://` to nonexistent `files/rooms/` paths.
- **workflowUtils replace-vs-merge**: assigning `jb.workflowUtils = {…}` can wipe llm-flow state in the lambda closure.
  All three writers merge instead; `financeCube.askAiWorkflowUtilsIntact` pins this before republishing.
- Restart localhost:3000 after `gcloud auth application-default login` — the server process caches stale ADC.
- Staging rejects the dev HMAC token. Test through the local gate with `invokeSnippetInContext`,
  `lambdaHost:'http://localhost:3000'`, and `roomWUrl:'room://finance-demo'`.
- Verified-report `sql` is cube-vocabulary — runnable only through cubeQuery, not plain duckDbSql. Metric aliases survive compile (`money_in as "value"`).
- anon-user widget test artifacts exist in storage (visible only with `?noAuth`; trash icon removes).

Full screen spec: [finance_demo_screen_spec.md](finance_demo_screen_spec.md).
