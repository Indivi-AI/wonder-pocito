# Flow-package tool creation — backend handoff

## Goal
Let a builder create a marketplace Tool (`tool_type == 'flow_package'`) by entering a Flow
package id, reading its schema, and publishing — instead of hand-writing `json_schema` /
`dedicated_tool_config` JSON. This is the "no-code tool creation" flow (mock PRD §7.4, TCN-1–TCN-11).

## What already exists (client, demo-only)
`solutions/pocito/marketplace-ui/wonder-platform-resource-fields.js`:
- `readPackage()` (line 22) — looks up a package by id and seeds `item.inputSchema` / `item.outputCubes`.
- Package-id input + "קריאת המארז" button + read-confirmation banner (lines 52–59).
- Full wizard body — input-schema table, output-cube picker with per-cube description/row-limit/save/format (lines 121–152).

All of it currently reads from **`repo.flowPackages`** — a hardcoded client seed array
(`wonder-platform-domain.js:78-86`), and is gated to `!repo.marketplace` (local/demo mode only).
It never calls a real API. **This is the part to replace.**

## What's missing
One backend endpoint: given a Flow package id, return its quick params and cubes.

```
GET /api/v1/flow-packages/{package_id}
→ {
    "name": "...",
    "quick_params": [
      {"name": "date_from", "display_name": "תאריך התחלה", "type": "DateTime",
       "is_required": true, "is_require_any": false, "is_single_value": false}
    ],
    "cubes": [
      {"name": "aggregate_table", "display_name": "טבלת איחוד מלאה"}
    ]
  }
```

Field names above follow FLAPI's real types (`QuickParamDefinition`, `PackageMetadata`/`Query`) —
see `88roy88/FlowBolt` repo, branch `develop`, path `mocks/flapi-mock/schemas.ts` for the
authoritative shapes (cited in Mock v6's own `github.md` sync note). Don't invent field names —
pull them from that source.

`type` enum per TCN-3: `String | Int | Double | Boolean | DateTime | Timestamp | Haphoch`.

## No Tool schema change needed
`CreateTool`/`UpdateTool` (`marketplace_server.py:124-131, 165-177`) already carry generic
`json_schema: dict` and `dedicated_tool_config: dict`. The resolved wizard output (params with
builder-written descriptions, chosen cubes with row-limit/save/format) fits there as-is —
client maps `inputSchema`/`outputCubes` into those two dicts on publish. No new columns/tables.

## Client wiring once the endpoint exists
- Replace `repo.flowPackages.find(...)` in `readPackage()` with a call to the new endpoint.
- Widen the wizard's gate from `!repo.marketplace` to also fire when
  `repo.marketplace && item.toolType == 'flow_package'`.
- Hide the raw `json_schema`/`dedicated_tool_config` textareas (currently lines 104-110) for
  `flow_package` — keep them for `code`/`solr`/`kick_graphql`.

## Open questions (unresolved in the mock's own PRD, §11 q8 — confirm before building)
1. **Output formats + row-limit default are NOT derived from the package** — they reflect
   whatever the runtime supports today (mock shows `JSON`/`CSV`/`Parquet`, default 20 rows).
   Confirm the real supported list/default with whoever owns Flow execution.
2. **Auth for Flow calls**: MVP mock assumes one fixed, maximal-permission token for all Flow
   calls (TCN-9) — explicitly a temporary shortcut, not a security model. Needs a real decision,
   not silent adoption.

## Non-goals (per intent deck)
- No editing of param types/required-flags — those come from the package, description is the
  only editable field per param.
- No tool-configuration/credential layer — a Flow tool's runtime inputs still come from the
  calling skill's instructions.
- No tool-sharing across rooms/workspaces.
