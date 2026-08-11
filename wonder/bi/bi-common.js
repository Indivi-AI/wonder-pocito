import './duckdb-utils.js'    // jb.biUtils duckdb runners + sqlEditor (the duckdb-interaction home)
import './bi-dsl.js'
import './dimention-stat-dsl.js'
import './benchmark/bi-benchmark-dsl.js'
import './bi-etl.js'
import './large-scan-cache-strategies.js'   // parseSql + pickPlan — the append-only scan-plan classifier
import './bi-manifest.js'      // manifest partition-pruning: expandManifest sql-modifier + filesFromManifest (on biUtils)
import './metrics.js'          // metric, ratio, stat fitting, validation and drift
import './materialization.js'  // BUILD side: materializeFromEvents + entrypoints + event-predicates/picks/pick-reducer/lookups/enrichment reducers
import './event-sources.js'
import '@wonder/db/room/room-lambda-client.js'   // invokeSnippetInContext + permissionByPath
import '@wonder/db/room/managed-ctx.js'
// `span` is shared cross-module via coreUtils.biSpan (Symbol.for('bi-span')) — no export needed
