# bi-brush — trace a value to its source

**Goal:** click a dashboard value → see *where it came from*, both the DATA it aggregated and the CODE that computed it (brushing-and-linking; Excel's Trace Precedents across source AND result at once).

The dashboard is a 3-tier cube: **gold** (query result) ← **silver** (parquet, one object per `keyField`) ← **bronze** (raw events). Provenance is a back-pointer chain down those tiers, riding the `span` Symbol (`daily-logs-dsl.js:62`), attached only in `brushMode` so normal data stays clean. Drilling one key loads its events into memory, so a raw event is shown by `JSON.stringify` — no file round-trip.

The three elements (`productCube`, period `2026-01-01`):

| # | element | half | what it is | content |
|---|---|---|---|---|
| **G** | gold source | code | the metric's SQL node, from `metric('avg_price', 'avg(price)')` | `avg(price)` |
| **S** | silver source | code | the cube `pick` profile that built the field | `pick('productId, price', { take: last() })` |
| **R** | data result | data | the resolved chain gold→silver→bronze | `avg_price=150` → A `price=100` / B `price=200`, `last()`→idx 1 |

## `valueSource` — the payload every brush view renders
The `drill` (a `ctx-enricher` param) runs ONE node round-trip and sets `ctx.vars.valueSource`. Every brush view is a pure function of it; they differ only in layout.

```ts
type Section = { fold: number } | { line: string; onPath: boolean; highlights: number[] }
interface SqueezeResult { crumb: string; sections: Section[]; token: string }
interface SilverField   { value: number; events: any[]; pickedIdx: number; tgpPath: string }  // pickedIdx = winner

interface ValueSource {                 // === ctx.vars.valueSource
  func:        string                   // metric name  → header label
  value:       number                   // gold value   → header big number
  gSource:     SqueezeResult            // G — metric SQL node  (kind:'sql')  → codeBrush
  sSource:     SqueezeResult            // S — cube pick node   (kind:'cube') → codeBrush
  metricField: string                   // link key threading G/S/R
  keys:        string[]                 // contributing keys → dataBrush master rows
  silverByKey: { [key: string]: { fields: { [field: string]: SilverField } } }  // R
}
```

A brush view's `hFunc` is `(ctx, { valueSource, react: { h, useState, hh } }, { drill }) => props => vdom`.

## The comps
`BrushView` is a `TgpTypeModifier` stamping `brushView:true` on a `react-comp` — a self-documenting alias for `ReactComp` (the `Aggregator`→`Data` move). Two **primitives** + three **composites** + one explorer. Each declares a `drill` param (`dynamic:true`) defaulting to `inheritDrill` (no-op), so a composite drills ONCE and the primitives it `hh`-mounts reuse that `valueSource`.

- **`codeBrush`** (G + S) — `gSource`/`sSource` as two squeezed, highlighted code boxes (yellow on-path lines, `-- n lines --` folds, breadcrumb, link token accented).
- **`dataBrush`** (R) — `keys` as a master list; click a key → `silverByKey[k]` events expand, winner `▶ … ← winner`.

| composite | layout | use |
|---|---|---|
| `brushResultFirst` | data leads, code is the detail rail | **production** (result-first, smallest) |
| `brushPanes` | `codeBrush \| dataBrush` coequal | dedicated provenance page |
| `brushInline` | code folds behind chips, data below | mobile/dense |

`brushViews` is a dev-only tab explorer to compare the three; production mounts one composite directly.

## `squeezeAndHighlight(locator, token) → { crumb, sections, token }`
A pure node-side `Data` pass (`codeBrush` is a dumb HTML renderer of its output). The split is forced by one constraint: the SQL link-token column needs DuckDB's `query_location`, and the browser has no duckdb — so the highlight is computed on node, only coordinates travel.

- **squeeze:** `prettyPrintWithPositions(comp)` → `{ text, actionMap }`. The algorithm is purely the **tgpPath**: each path element (`~impl`, `~impl~metrics`, …, the node) owns a contiguous text span = min/max offsets of its actionMap entries; keep its OPEN + CLOSE line (lone-bracket lines dropped). Over the path that's the nested skeleton; siblings fold. Consecutive lines cluster into `{ in, from, size }` runs → `sections[]`: each kept line a `{ line, onPath, highlights }`, each gap one `{ fold: n }`.
- **highlight:** the token sits inside a string literal prettyPrint treats as opaque. Find the literal's span via `insideText!<tail>~<litChild>`, then ask the locator's own `inLitCols` sub-parser (polymorphic, lives on the locator) for the in-literal offsets: `sqlLocator` → DuckDB `query_location` (finds `price` in `avg(price)`, NOT the alias `avg_price`); `cubeLocator` → word-boundary index. literal line/col + offset = absolute column.

`code-locator<daily-logs>` (`sqlLocator`/`cubeLocator`) carries `{ path, litChild, inLitCols }` — the address of a token in a comp.

Payload (`brushSpanCell`): the generic `spanCell` (`func/value/keys/silverByKey`) PLUS `gSource`/`sSource` — `cell`/`gSource`/`sSource` are `dynamic:true` sub-profiles awaited in the impl (never `$run`). The `drill` ships it via `invokeSnippetInContext`.

> Test note: assert on the alias `avg_price` (intact), never `avg(price)` — the highlight wraps `price` in a `<span>`, splitting that substring in the html.

## Key files
- `bi-brush-utils.js` — `BrushView`, `codeBrush`/`dataBrush`, `brushPanes`/`brushResultFirst`/`brushInline`, `brushViews`, `squeezeAndHighlight`, `brushSpanCell`, `sqlLocator`/`cubeLocator`
- `product-cube-ui.js` — concrete productCube wiring: `productSpanCell`, `productDrill`, `productBrush`
- `bi-brush-test.js` — the `brush.*` tests (`dataTest` for the pure pass — use `pipe`, async-aware)
- `daily-logs-dsl.js` — `spanView` field `tgpPath` (→ S source), `cubeQuery`
- `sql-editor.js` — `sqlColumnRefCols` (DuckDB `query_location` for the G highlight)
- `daily-logs-tests.js` — `spanCell`, `productCube` — the simplest example to brush
