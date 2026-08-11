# Finance data-viz demo — screen specification

Detailed spec for the demo screens that bring the strategy document's Layer 02
(Online Reports) and Layer 03 (Dashboards) to life, driven by the six synthetic
datasets. Written to be built directly — every UI element maps to a real data
field and a documented requirement.

---

## 0. Context and scope

### What this demo proves
The strategy doc frames one decision (custom build vs. embedded BI) and leaves
"Architecture Overview" as *TBD after vendor choice*. This demo is the missing
concrete artifact: it shows the two in-scope layers as working screens over
realistic data, so stakeholders can see the target experience before the vendor
decision — and so a vendor POC has a reference to match.

### The three layers (from the doc)
| Layer | Name | Status in doc | In this demo |
|---|---|---|---|
| 01 | Offline reports (CSV/PDF) | Partially live | Referenced as export actions, not a built screen |
| 02 | Online reports (real-time, filterable) | In scope | **Built — Screen B** |
| 03 | Dashboards (visual, at-a-glance) | In scope | **Built — Screen A** |

### Data behind the demo
Six datasets, three personas × two sizes. Persona is switchable in the demo
(the doc's "Mix — one of each"). All figures below are USD-normalised via the
`Amount (USD)` column.

| Persona | Size | Txns | Money in | Money out | Character |
|---|---|---|---|---|---|
| Freelancer | realistic | 1,980 | $1.90M | $0.39M | Inbound-heavy |
| Freelancer | heavy | 5,040 | $4.99M | $0.95M | Inbound-heavy |
| E-commerce | realistic | 1,980 | $1.47M | $1.83M | Margin-thin, near-balanced |
| E-commerce | heavy | 5,040 | $3.60M | $4.08M | Margin-thin |
| Marketplace | realistic | 1,980 | $6.20M | $1.46M | Large inflow, heavy payouts |
| Marketplace | heavy | 5,040 | $17.08M | $3.82M | Large inflow |

All datasets: 6 currencies (USD, EUR, GBP, CAD, AUD, JPY), status split ~86%
completed / 11% pending / 3% failed, with a planted 2-day inbound anomaly spike
(~3–6× normal) ~70% through each period for the drill-down flow.

### Global demo controls (persistent, top of app)
A demo needs a way to switch context that a real product wouldn't expose:
- **Persona switcher** — Freelancer / E-commerce / Marketplace. Reloads the
  active dataset and re-derives everything.
- **Size switcher** — Realistic / Heavy. Same personas, more rows.
- These sit in a slim demo bar visually distinct from the product chrome, so it
  reads as "demo scaffolding," not part of the product.

---

## Brand and theme

The demo must read as *Finance's* product, not a generic dashboard. This
section defines the visual identity to apply across both screens.

> **Accuracy note:** the hex values below are matched from public brand-color
> aggregators and Finance's live marketing/app surfaces, not from Finance's
> official brand book (which isn't public). Treat them as a faithful
> approximation to tune against real screenshots, not exact spec values. If the
> team has access to Finance's actual design tokens, those override this.

### Identity summary
Finance's identity centers on a saturated **red-orange** primary against a
clean **white** dashboard canvas with a near-black wordmark, plus a distinctive
**rainbow-ring emblem**. The orange is used as a warm, high-contrast accent —
CTAs, active states, the logo checkmark — not as a flood color. Dashboards stay
predominantly white/light-grey with orange highlights (the same pattern seen in
Finance's own product surfaces).

### Color palette
| Role | Hex | Use |
|---|---|---|
| **Primary orange** | `#FF4800` | Primary CTAs, active nav, logo checkmark, key chart accents, money-in series |
| Orange (alt/print) | `#FA4616` | Alternate shade; matches Pantone 172 C |
| Orange hover/dark | `#E03F00` | Hover/pressed states on orange elements |
| Orange tint (bg) | `#FFF0EB` | Subtle backgrounds behind orange elements, selected rows |
| Near-black (wordmark) | `#1A1A1A` | Wordmark, primary text, headings |
| Text secondary | `#5A5A5A` | Supporting text, labels |
| Text muted | `#8A8A8A` | Placeholders, captions |
| Page canvas | `#F7F7F8` | App background |
| Surface / card | `#FFFFFF` | Cards, table, panels |
| Border hairline | `#E6E6E8` | Card/table borders, dividers |
| Success (money in / completed) | `#1FA971` | Completed status pill, positive deltas — pair with orange for the in/out chart |
| Warning (pending) | `#E8A317` | Pending status pill |
| Danger (failed / money out emphasis) | `#D64545` | Failed status pill, negative deltas |

For the **payment volume chart**, use orange (`#FF4800`) for money-in and a
neutral dark-grey or teal for money-out, so the brand color leads and the two
series stay distinguishable (avoid orange-vs-red, which fails for color-blind
users).

### Rainbow-ring emblem
Finance's post-2021 emblem is a gradient ring cycling through the spectrum. Use
it sparingly — app icon, loading spinner, a small brand mark in the header. Do
not use it as a chart palette. For the demo, a simple SVG ring with a
warm→cool→warm gradient stroke is sufficient; keep the wordmark in near-black
beside or below it.

### Typography
Finance's wordmark uses a rounded, medium-weight sans-serif. For UI, use a
clean geometric/neutral sans (system stack or a Google font like **Inter** or
**Poppins**) — nothing serif. Weights: 400 body, 500 headings/labels. Sentence
case throughout.

### Logo usage in the demo
- **Header**: Finance wordmark (near-black) with the orange checkmark "Y", or
  the rainbow-ring emblem + wordmark lockup, top-left.
- **Do not** distort, recolor the wordmark, or place orange text on orange.
- If an official SVG logo asset is available, use it; otherwise reconstruct the
  wordmark in the chosen sans with the orange checkmark accent, or use a clean
  text lockup "finance" with the orange dot/accent as a lightweight stand-in.
- Keep clear space around the logo; never crowd it with controls.

### Component styling notes
- **Buttons**: primary = solid orange `#FF4800`, white text, subtle radius
  (~8px); secondary = white with hairline border, near-black text.
- **Nav / active state**: active item marked with orange text or an orange left-
  bar / underline; inactive in secondary grey.
- **Status pills**: filled tints — completed green, pending amber, failed red —
  with the darker shade of the same family for the text.
- **Metric cards**: white surface, hairline border, orange used only for the
  delta arrow or an accent icon, not the whole card.
- **Charts**: white plot area, light-grey gridlines, orange as the lead series
  color; tooltips on white with hairline border.
- **Tables**: white rows, `#F7F7F8` header, selected row in the orange tint
  `#FFF0EB`, hairline row dividers.

### Demo scaffolding vs. product chrome
The persona/size switchers are *demo* controls, not Finance product. Style them
deliberately **off-brand** — a neutral dark slim bar at the very top, clearly
separate from the white Finance app below — so viewers never mistake the
scaffolding for the product.

---

## Screen A — Merchant dashboard (Layer 03)

The default view on login to My Account. At-a-glance financial health. This is
the doc's MVP screen, specced most concretely there.

### A.0 Layout overview
```
┌───────────────────────────────────────────────────────────────┐
│  Greeting header            [ + ]  [ Date range ▾ ] [ Currency ▾ ]│
├───────────────────────────────────────────────────────────────┤
│  Balance summary strip:  Total │ Pending │ Settled              │
├───────────────────────────────┬───────────────────────────────┤
│  Payment volume chart          │  Performance panel            │
│  (in/out, D/W/M toggle)        │  (money in, out, net, fees)   │
├───────────────────────────────┼───────────────────────────────┤
│  Top 5 payers                  │  Top 5 recipients             │
└───────────────────────────────┴───────────────────────────────┘
```

### A.1 Header
- **Greeting**: "Hi {merchant}, here's your transaction data at a glance."
  Merchant name is per-persona (e.g. "Maya's Design Studio", "Northwind Goods",
  "Bridgeway Agency").
- **Date range selector** — presets: Today, Last 7 days, Last 4 weeks, Last 3
  months, Last 6 months, Custom. Default: Last 3 months. Drives every element
  on the screen. Filters on the `Date` field.
- **Currency filter** — All currencies (USD-normalised) or a single currency.
  Default: All. When a single currency is chosen, values show native `Amount`;
  when All, values use `Amount (USD)`. Filters on `Currency`.

### A.2 Balance summary strip
Three metric cards. Definitions map to `Status`:
| Card | Value | Derivation |
|---|---|---|
| **Total balance** | Sum of `Running Balance` latest-per-currency, USD-normalised | Latest running balance across currency balances |
| **Pending** | Sum of `Amount (USD)` where `Status = pending` | Upcoming transactions not yet affecting balance |
| **Settled** | Sum of `Amount (USD)` where `Status = completed`, net of fees | Completed transactions |

Each card shows the value (24px) and a small delta vs. the previous equivalent
period (e.g. "+12.4% vs. previous 3 months").

### A.3 Payment volume chart
The centerpiece. Line/area chart, dual series.
- **Two series**: Money in (`Direction = in`) and Money out (`Direction = out`),
  each summed by time bucket over `Amount (USD)`.
- **Granularity toggle**: Daily / Weekly / Monthly. Rebuckets the same data.
- **Only `completed`** transactions count toward volume (pending/failed excluded
  — consistent with balance logic).
- **Hover tooltip**: date, money in, money out, net for that bucket.
- **Anomaly is visible**: the planted spike shows as a clear peak in the in-series.
- **Click a data point** → drills into Screen B (Online reports), pre-filtered
  to that date/bucket. This is Flow #1's key interaction.

### A.4 Performance panel
Compact KPI list (right of the chart), each with value + period-over-period delta:
| Metric | Derivation |
|---|---|
| Money in | Σ `Amount (USD)` where `Direction = in`, `Status = completed` |
| Money out | Σ `Amount (USD)` where `Direction = out`, `Status = completed` |
| Net flow | Money in − Money out |
| Total fees | Σ `Fee` (USD-normalised) |
| Transactions | Count of rows in range |
| Failed rate | % rows where `Status = failed` |

### A.5 Top 5 payers / Top 5 recipients
Two ranked lists side by side.
- **Top payers**: group `completed` `in` rows by `Description` (payer name),
  sum `Amount (USD)`, take top 5. Show name, total, and % of total inflow.
- **Top recipients**: same for `out` rows.
- Each row is clickable → Screen B filtered to that counterparty.
- Because inbound sources are weighted in the data, the top-5 concentration is
  always visually clear (e.g. Upwork/Fiverr/Toptal dominate the freelancer set).

### A.6 States
- **Loading**: skeletons for each card/chart region; progressive reveal.
- **Empty** (e.g. date range with no txns): friendly empty state per region,
  never a blank box — "No transactions in this range. Try widening the dates."
- **Single-currency with sparse data**: chart still renders; gaps are zero, not
  missing.

---

## Screen B — Online reports (Layer 02)

Real-time, filterable transaction table inside My Account. The doc's Layer 02:
the interactive replacement for "download CSV and pivot in Excel," and the
drill-down target from the dashboard.

### B.0 Layout overview
```
┌───────────────────────────────────────────────────────────────┐
│  Search box            Filter chips:  [Date][Currency][Status][Type][+]│
├───────────────────────────────────────────────────────────────┤
│  Result summary: "1,240 transactions · $2.1M in · $0.4M out"  [Export ▾]│
├───────────────────────────────────────────────────────────────┤
│  Table: Date │ Description │ Type │ Amount │ Currency │ Status │ Balance │
│         … sortable, paginated …                                │
├───────────────────────────────────────────────────────────────┤
│  Pagination:  ‹ 1 2 3 … ›     Rows per page: [25 ▾]             │
└───────────────────────────────────────────────────────────────┘
```

### B.1 Search
- Free-text search over `Transaction ID`, `Description` (payer/recipient name),
  and `Store Name` — matching Finance's real "searchable by payer name,
  merchant name, or transaction ID."
- Debounced, live-filters the table.

### B.2 Filters (chips)
All combinable; each shows active state and a clear (×):
| Filter | Field | Control |
|---|---|---|
| Date range | `Date` | Preset + custom range picker |
| Currency | `Currency` | Multi-select (USD, EUR, GBP, CAD, AUD, JPY) |
| Status | `Status` | Multi-select (completed, pending, failed) |
| Direction | `Direction` | in / out / both |
| Type | `Transaction Type` | Multi-select (marketplace_payment, client_payment, supplier_payment, payout, withdrawal) |
| Counterparty | `Description` | Autocomplete from names in the set |

When arrived at via dashboard drill-down, the relevant filters are **pre-applied
and visible as chips** (e.g. "Date: 2025-05-07", or "Payer: Upwork Global Inc").

### B.3 Result summary bar
Live-updates as filters change: transaction count, total in, total out, net —
all over the currently-filtered set. Gives the "what am I looking at" anchor.

### B.4 Transaction table
- **Columns** (default visible): `Date`, `Description`, `Transaction Type`,
  `Amount` + `Currency`, `Status`, `Running Balance`.
- **Column options** (toggle): `Transaction ID`, `Source`, `Target`, `Fee`,
  `Reference ID`, `Store Name`, `Amount (USD)`.
- **Sortable** on every column. Default sort: `Date & Time` descending.
- **Status** rendered as a colored pill (completed = green, pending = amber,
  failed = red).
- **Row click** → transaction detail (B.6).
- **Heavy dataset** (5,040 rows) is the pagination/perf stress case — the reason
  two sizes exist.

### B.5 Export
- **Export CSV** and **Export PDF** of the *currently-filtered* set (Layer 01
  bridge). CSV includes all columns; PDF is the branded, compliance-oriented
  version the doc calls out. In the demo these produce a real file download.
- Requirement from the doc: exported totals must reconcile with the on-screen
  summary and with the dashboard figures.

### B.6 Transaction detail (drawer or modal)
Opened on row click. Shows the full record: all 18 fields, formatted, with the
`Source → Target` flow, native and USD amounts, fee, running balance after, and
the reference ID. Matches Finance's "Transaction Details" panel.

### B.7 States
- **Loading**: table skeleton rows.
- **Empty** (over-filtered): "No transactions match these filters" + a one-click
  "Clear filters."
- **No search match**: distinct copy from empty-filter state.

---

## Cross-screen flows (from the doc)

### Flow #1 — Customer: checking daily performance
1. Land on **Screen A** (default dashboard, last 30/90 days).
2. Adjust date range to "last 90 days"; select a currency.
3. Spot the anomaly (volume spike) in the payment volume chart.
4. **Click the spike** → **Screen B**, pre-filtered to that date.
5. Review the transactions; **Export CSV** for the accountant.
6. No support ticket. ✅ This is the demo's hero path.

### Flow #2 — Finance: end-of-month close
1. Go to **Screen B** (or a Reports entry point).
2. Filter to previous month + a currency/entity + type.
3. **Export PDF and CSV**.
4. Validate totals against **Screen A**'s summary figures (they match).

### Flow #3 — Leadership: board prep (optional stretch)
1. Open a **leadership view** on mobile — a slimmed Screen A: revenue trend,
   top customers, success rate, mobile-legible.
2. Export a one-page PDF summary. (See §Leadership view below — specced but out
   of MVP.)

---

## Leadership view (Layer 03, stretch — not MVP)

Per the doc's Flow #3, a distinct at-a-glance view for executives:
- **Widgets**: monthly revenue trend (money-in over time), top customers (top
  payers), payment success rate (100% − failed rate).
- **Mobile-first**: legible on a phone before a board meeting.
- **One-page PDF export**.
- **Data grounding gap (flagged)**: the doc's "monthly revenue" and "success
  rate" aren't defined as data points elsewhere. Here, revenue ≈ money-in
  (completed inflows), success rate ≈ completed / (completed + failed). Call this
  out to stakeholders rather than implying it's a settled definition.

---

## Non-functional / demo-quality requirements

| Area | Requirement |
|---|---|
| Performance | Dashboard renders < 2s (doc target P95); table filters feel instant on the heavy set |
| Consistency | Dashboard totals, report summary, and exports all reconcile |
| Currency | USD-normalisation everywhere aggregation crosses currencies; native amounts when a single currency is selected |
| Design | Finance-branded per the Brand and theme section — orange/white/near-black, rainbow-ring emblem, branded status pills; demo scaffolding (persona/size switch) visually separated and off-brand |
| Accessibility | Legible contrast, keyboard-navigable table and filters |
| Responsiveness | Screen A degrades gracefully to mobile for the leadership flow |

---

## Explicitly out of scope (this demo)

Mirrors the doc's out-of-scope list, plus demo-practical cuts:
- Internal-facing dashboards (Grafana/Superset/Metabase-style).
- The AI layer (trend narration, anomaly *detection* — the anomaly here is
  planted and found by eye, not detected).
- A full documented Reporting API (data model is implied by the CSV schema).
- Native mobile app charting (web-first; leadership view is responsive web).
- Real authentication, multi-entity consolidation beyond a single account,
  and live FX rates (rates are static/illustrative).

---

## Build order (suggested)

1. **Data layer** — load the active CSV, parse types, derive aggregates
   (by-day/week/month buckets, top-N, status sums). One module, persona/size
   aware.
2. **Screen B first** — the table + filters is the foundation and the
   drill-down target; easier to verify against raw data.
3. **Screen A** — build on the same aggregates; wire the chart-click →
   Screen B drill-down.
4. **Exports** — CSV/PDF of filtered set; verify reconciliation.
5. **Leadership view** — if pursuing the stretch, reuse Screen A aggregates.
6. **Polish** — loading/empty states, persona switching, responsiveness.

---

## Field → UI cross-reference (quick lookup)

| Field | Used by |
|---|---|
| `Transaction ID` | B search, B table (optional col), B detail |
| `Date & Time` / `Date` | A date filter, A chart bucketing, B date filter, B sort |
| `Direction` | A chart series, A performance, B direction filter |
| `Transaction Type` | B type filter, B table, B detail |
| `Description` | A top-5 grouping, B search, B table, B counterparty filter |
| `Counterparty Type` | (internal grouping; optional B facet) |
| `Source` / `Target` | B detail (flow), B optional columns |
| `Amount` / `Currency` | A/B display when single-currency; B table |
| `Amount (USD)` | All cross-currency aggregation |
| `Status` | A balance strip, A failed rate, B status filter, B pill |
| `Fee` | A total fees, B detail, B optional column |
| `Running Balance` | A total balance, B table, B detail |
| `Store Name` | B search, B detail |
| `Reference ID` | B detail, B optional column |
| `Additional Description` | B detail |
