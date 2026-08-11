# admin/bi — shared BI infra

Multiple projects (finance demo, comax, schematics) compile through this code, and it runs in THREE realms — browser LIVE, mac/node dev, linux room-lambda. Changes that look safe in the realm you're editing routinely break another (e.g. the committed cols_cache duckdb extension is linux-only).

These cross-realm contracts are pinned by guard tests in the finance suite — `financeCube.realmReadPaths` (conditional extension LOAD + db routing) and `financeCube.askAiWorkflowUtilsIntact` ([admin/finance/finance-cube-tests.js](../finance/finance-cube-tests.js)). Read each guard's comment for the WHY before changing behavior it asserts — never "clean up" what a guard pins.

**After ANY change here (especially duckdb-utils.js), run and pass the full `financeCube.*` suite** (mcp `runTest`, see repo CLAUDE.md).
