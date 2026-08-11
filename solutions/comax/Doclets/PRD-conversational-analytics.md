# PRD — Conversational Analytics: drill-down, follow-ups & richer inline answers

Owner: Analytics / llm-flow · Status: Draft for build · Scope: next iteration of the **existing** Schematics Analytics chat (not greenfield)

---

## 1. Summary & goal

We already ship a working "chat with your CRM data" app: a user asks a question in natural language, a server-side jb6/TGP workflow (`basicAnalytics`) runs **one** DuckDB query over the Delta-Share parquets, an LLM writes a text summary, and the applet renders that text plus an array of inline ECharts widgets. The single goal of this iteration is to turn each **one-shot answer** into an **explorable answer**: under every response the user gets suggested follow-up questions and drill-down chips, can click a bar/slice to auto-ask its breakdown, can reveal the SQL and the raw numbers behind any claim, and receives a small multi-widget "mini-dashboard" with a one-line narrative instead of a single chart. We do this by evolving the existing `{ text, widgets }` contract — no new framework, no rewrite.

---

## 2. Current state (grounded in the code)

**Server workflow — `admin/schematics/analytics/llm-flow/analytics-agent.js`**
- `Workflow('basicAnalytics')` uses `mainWorkflow` + `mpi('gemini/gemini-3.5-flash', …)`. The instructions load three booklets/doclets: `schematicsAnalytics` (Delta-Share schema + conversion math), `vizWidgets` (the chart catalog), and `essentialOutputFormat` (the required flow backbone).
- `Doclet('essentialOutputFormat.analytics')` pins the output shape: a `flow<workflow>` whose steps are `duckDbSql` → `setCtxVar rows` → `llmSummary` (the `answer`) → a final `setCtxData` that returns **`{ text, widgets }`** via `jqSingle`, where `widgets` is an array of inline chart specs. **Exactly one SQL query per turn.**
- `Data('runAnalytics')` is the server entry (published per-room via `uploadRoomLambda`). It seeds vars (`db:'local'`, `userMessage`, `accumulatedContext.chatHistory`) and calls `basicAnalytics.$runWithCtx(wfCtx).calcWorkflow(wfCtx)`. It already receives `chatHistory` but only forwards it as loose context.

**Applet UI — `admin/comax/App/comaxApp.js`**
- `ReactComp('basicAnalyticsApplet')` — message list, autoscroll, streaming "typed status" from the workflow `progress` SSE, and a `MessageInput2` composer.
- `sendMessage()` builds `chatHistory` from prior turns, calls `invokeSnippetInContext(runAnalytics(txt, chatHistory), { pack: roomLambda({ streamProgress:true }) })`, then persists an assistant message that carries `content` (text) and `widgets` (the specs) plus `adminUrl`.
- `AnalyticsAssistantResponse` renders the text, then maps `element.widgets` → `VizWidget` (`h('div', {key}, hh(ctx, VizWidget, { spec }))`). There is a debug `adminUrl` link. **There is no UI for follow-ups, drill-down, or SQL.**

**Widgets — `viz/viz-core.js` + `viz/widgets/*` + `viz/WIDGET_GUIDE.md`**
- `jb.vizUtils.vizComp(kind, optionFrom, description)` builds a `ReactComp` named `${kind}Widget`; `optionFrom(props, jb.vizUtils)` is a **pure** function → an ECharts option. The factory owns `echarts.init` (SVG renderer), resize, dispose, and the jsdom text-measure shim. Widgets read numbers only from `props`.
- `VizWidget` dispatches a `{ kind, … }` spec to `${kind}Widget`. ~20 kinds: bar, hbar, groupedBar, stackedBar, line, area, scatter, bubble, pie, histogram, boxplot, heatmap, radar, funnel, gauge, treemap, waterfall, table, kpi, bullet.
- Shared `highlight` contract already exists: `name | index | {name|index,note} | {min|max,note}`, resolved by `resolveExtremes/itemColors/highlightNote`. The highlight `note` renders as assertable blue subtext. **No click/event callback is threaded from the chart into the app today** — `vizComp`'s `hFunc` never registers an ECharts `chart.on('click', …)`.

**Data model — `admin/schematics/CLAUDE.md`, `admin/schematics/analytics/CLAUDE.md`**
- DuckDB `read_parquet` over Delta-Share parquets at `signedRoom://schematics/usersRO/crm/*.parquet`: `sessions_answers_auto` (session outcomes/revenue), `bronze_clicks` (bids), `bronze_click_conversions` (converters/payout), plus bronze/silver/gold variants. Join on `session_id`; secondary dims `campaign_id/name, form_id, vertical, geo, device`.
- Conversion math is pinned: aggregate to one row/session first; `converters = COUNT(DISTINCT session with ≥1 conversion)` (never `sum(conversions)`); `ctr/cvr/avg_bid/usd_per_session` formulas; exclude `device_type='bot'`; `LIMIT 20`.

**Net:** today = one turn → one SQL query → text + static charts. No drill-down, no follow-up suggestions, no cross-filter, no comparison mode, no "explain this number", no shown SQL, no saved views. Every message is single-shot.

---

## 3. Competitive landscape

Scores are 1–5 (5 = best-in-class, mature). Assessed on the six capabilities most relevant to our goal.

| Product | Inline viz in chat | Click / drill-down | Follow-up suggestions | Shown SQL / trust | Cross-filter | Conversation memory |
|---|---|---|---|---|---|---|
| **ThoughtSpot Spotter / Sage** | 5 — every answer is an interactive chart, "no dead end" | 5 — drill down, include/exclude filters, axis ops on any chart | 5 — multi-turn refine ("just the top five"), suggested follow-ups | 4 — "show underlying data", SpotIQ explain | 4 | 5 — session context across turns |
| **Databricks AI/BI Genie** | 5 — SQL + result table + viz per answer | 4 — drill-through + cross-filter on supported viz types | 4 — suggested follow-up questions | 5 — SQL always shown; "Trusted" badge on certified UDFs; per-answer explanation | 5 — implicit cross-filter across same-dataset viz | 4 |
| **Snowflake Cortex Analyst** | 3 — API-first; charts in host app | 3 — via follow-up refinement | 5 — onboarding + verified-query suggestions from VQR | 5 — returns generated SQL + Verified Query Repository grounding | 2 | 4 |
| **Amazon Q in QuickSight** | 5 — multi-visual answers (bars, KPI cards, tables, trend lines + text) | 4 — "Now show me revenue by product", geo/time/segment drill | 4 — Q-topic suggestion cards; iterative refine | 3 — topic/field rephrase shown, less raw SQL | 4 | 4 |
| **Google Gemini in Looker (Conversational Analytics)** | 5 — Looker Studio charts/tables inline | 4 — follow-up filter/timeframe/chart-type change | 4 — guided follow-ups | 4 — "How was this calculated?" NL explanation; semantic-model grounded | 3 | 4 |
| **Tableau Pulse / Agent** | 4 — insight cards w/ viz + NL | 4 — click a dimension value → one level deeper; filter-level Q&A | 5 — proactively surfaced guided follow-ups; root-cause "why" | 3 — NL explanation of drivers | 3 | 4 |
| **Power BI Copilot** | 4 — narrative + report visuals | 4 — "break this down by quarter"; drill-through, filtered citations | 4 — suggested prompts + follow-ups in session | 5 — "How Copilot arrived at this" + field/measure + visual citations | 4 | 4 |
| **Julius AI** | 5 — auto bar/scatter/heatmap from a prompt | 3 — follow-up-driven, in-thread | 5 — clickable suggested questions after each response | 3 — shows generated Python/code | 2 | 5 — full thread memory |
| **Hex (Magic / Notebook agent)** | 5 — cells render rich charts | 3 — via agent edits to cells | 3 — agent proposes next steps | 5 — every cell shows the SQL/Python it generated | 2 | 4 |
| **ChatGPT Advanced Data Analysis** | 4 — bar/pie/scatter/line can be interactive | 3 — click a chart area / table row → ask follow-up; "switch to interactive" | 4 — suggested prompts to "go deeper" | 4 — shows the Python; you read the code | 2 | 5 |
| **Perplexity** | 2 — occasional inline chart, mostly prose + citations | 1 | 4 — always renders "related" follow-up questions | 2 — source citations, not SQL | 1 | 3 |
| **Our app today** | 4 — ~20 ECharts kinds inline, real SVG, highlight contract | **1 — none** | **1 — none** | **1 — none (adminUrl debug only)** | **1 — none** | 2 — chatHistory passed but under-used |

**Patterns worth stealing (cited):**
- **Follow-up chips after every answer** — Julius shows clickable suggested questions after each response; Perplexity always renders "related"; Tableau Pulse proactively surfaces guided follow-ups. Cheap, high-leverage, and it fits our `{ text, widgets }` return with one new field.
- **Click a chart element → drill** — ChatGPT ADA lets you click a chart area/row to ask a follow-up; QuickSight/Looker/Pulse turn a clicked dimension value into "one level deeper". Maps directly onto our per-widget `highlight`/click hook.
- **Show the SQL + explain** — Genie shows SQL + a "Trusted" badge + per-answer explanation; Power BI's "How Copilot arrived at this"; Looker's "How was this calculated?". We already **generate** the exact SQL string in the workflow — we just don't surface it.
- **Multi-visual answer with narrative** — QuickSight returns bars + KPI cards + tables + text together. We already return an `array` of widgets; we just need the workflow to emit a small coherent set + a one-line narrative and the UI to lay them out as a mini-dashboard.

Sources:
- ThoughtSpot Spotter — https://docs.thoughtspot.com/cloud/10.10.0.cl/spotter , https://www.thoughtspot.com/data-trends/analytics/conversational-analytics
- Databricks AI/BI Genie — https://docs.databricks.com/aws/en/genie/ , https://www.databricks.com/blog/aibi-genie-now-generally-available , https://www.databricks.com/blog/next-level-interactivity-aibi-dashboards
- Snowflake Cortex Analyst — https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst , https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst/verified-query-repository , https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst/suggested-questions-feature
- Amazon Q in QuickSight — https://aws.amazon.com/blogs/machine-learning/build-a-conversational-data-assistant-part-2-embedding-generative-business-intelligence-with-amazon-q-in-quicksight/ , https://docs.aws.amazon.com/quicksight/latest/user/adding-drill-downs.html
- Gemini in Looker — https://cloud.google.com/blog/products/business-intelligence/a-closer-look-at-looker-conversational-analytics , https://docs.cloud.google.com/looker/docs/conversational-analytics-overview
- Tableau Pulse — https://help.tableau.com/current/online/en-us/pulse_ask_discover_qa.htm , https://www.tableau.com/blog/top-new-tableau-pulse-feature-releases-know
- Power BI Copilot — https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-ask-data-question , https://learn.microsoft.com/en-us/power-bi/create-reports/copilot-introduction
- Julius AI — https://julius.ai/features/workflows , https://julius.ai/feature_page/ai-analysis
- Hex — https://learn.hex.tech/docs/explore-data/notebook-view/notebook-agent
- ChatGPT ADA — https://openai.com/index/improvements-to-data-analysis-in-chatgpt/ , https://help.openai.com/en/articles/8437071-data-analysis-with-chatgpt
- Cross-filtering pattern — https://www.databricks.com/blog/next-level-interactivity-aibi-dashboards

---

## 4. Gaps (our app vs the field)

1. **No follow-ups.** Every competitor surfaces "next questions"; we end the turn cold. Highest-leverage, lowest-cost gap.
2. **No drill-down.** Our charts are inert — no click handler is wired through `vizComp` at all, while ADA/QuickSight/Looker/Pulse all turn a click on a bar/value into the next question.
3. **No trust affordance.** We compute the exact SQL and the raw rows, then throw them away in the UI. Genie/Power BI/Looker treat "show me the SQL / how this was calculated" as table stakes.
4. **Single chart, no narrative.** We usually emit one widget with no framing; QuickSight-style answers are a small coherent dashboard (headline number + trend + breakdown) with one line of narration.
5. **Under-used memory.** `chatHistory` is passed but the workflow is single-shot and doesn't use it to make a follow-up reuse/extend the prior SQL.
6. **(Deferred) No cross-filter, no saved views.** Not in this iteration — see Non-goals.

---

## 5. Requirements (prioritized)

Priorities: **P0** = this iteration, buildable in one pass on the existing contract. **P1** = fast follow. **P2** = later.

### P0-a — Suggested follow-up questions / drill-down chips under each answer
> **User story:** As an analyst, after I get an answer I want 3–4 tappable next questions so I can keep exploring without typing.

- **Acceptance criteria**
  - The workflow return object includes `followUps: [{ label, question }]` (2–4 items; `label` ≤ ~40 chars shown on the chip, `question` is the full NL prompt sent on tap).
  - The applet renders chips below the widgets. Tapping a chip calls the existing `send(question)` path — i.e. it behaves exactly like the user typed `question`.
  - Follow-ups are grounded in the answer's dimensions (e.g. after "revenue by campaign" → "Break the top campaign down by device", "Same for last 30 days", "Which campaigns lost revenue?"). No generic filler.
  - If the workflow omits `followUps`, no chip row renders (backward compatible).
- **Where it lands**
  - Contract/prompt: `essentialOutputFormat.analytics` doclet + `basicAnalytics` instructions in `analytics-agent.js` (teach the model to emit `followUps` in the final `jqSingle`).
  - Persist: add `followUps` to the assistant message in `sendMessage()` (`comaxApp.js`, the `...(runRes && typeof runRes==='object' ? {…}` spread).
  - Render: new chip row in `AnalyticsAssistantResponse` (`comaxApp.js`), reusing `send`.

### P0-b — Click-to-drill on a chart element
> **User story:** As an analyst, clicking a bar/slice should auto-ask its breakdown so drilling feels physical, not typed.

- **Acceptance criteria**
  - A widget spec may carry `drill: { dimension, question }`. `dimension` names the axis being drilled (e.g. `"campaign"`); `question` is a **template** with a `{name}` placeholder (e.g. `"Break {name} down by device"`).
  - Clicking a data element (bar, pie slice, treemap tile, funnel stage, table row…) whose category is `name` sends `question` with `{name}` substituted — through the same `send()` path as a typed message.
  - When `drill` is present, hovered/clickable elements get an affordance (cursor pointer + emphasis). Absent `drill` → charts behave exactly as today (no regressions to the ~20 existing widgets or their reactTests).
  - Works for at least the categorical kinds: bar, hbar, pie, treemap, funnel, stackedBar, groupedBar, table.
- **Where it lands**
  - `viz/viz-core.js`: thread an optional `onEvent` prop into `vizComp`'s `hFunc`; register `chart.on('click', p => props.onEvent?.({ type:'drill', name: p.name ?? p.data?.name, seriesName: p.seriesName }))`. Pure `optionFrom` functions stay untouched.
  - `viz/viz-core.js`: `VizWidget` accepts an `onEvent` prop and forwards it to the dispatched widget alongside `spec`.
  - `comaxApp.js`: `AnalyticsAssistantResponse` passes `onEvent` to each `VizWidget`; the handler reads the widget's `spec.drill`, substitutes `{name}`, and calls `send`.
  - Prompt: extend the viz emission guidance so the model attaches `drill` to a widget when a natural next breakdown dimension exists.

### P0-c — "Show SQL / show the numbers" trust affordance
> **User story:** As an analyst, I want to expand any answer to see the exact SQL and the raw result rows so I can trust and verify it.

- **Acceptance criteria**
  - The workflow return object includes `sql` (the exact DuckDB query string it ran) and `rows` (a bounded sample of the result set, e.g. ≤ 50 rows — the same rows the widgets were built from).
  - The applet shows a compact "Show SQL / data" toggle under the answer. Expanded: the SQL in a monospace block and the rows as a `table`-kind VizWidget (reuse `tableWidget`).
  - Collapsed by default; no layout cost when collapsed. Absent `sql`/`rows` → toggle not shown (backward compatible).
- **Where it lands**
  - Contract: the final `setCtxData` in `essentialOutputFormat.analytics` returns `sql` and `rows` in addition to `text`/`widgets`. The SQL is already in scope as the `duckDbSql` param; `rows` is already the `$rows` var — this is surfacing, not new computation.
  - Persist: add `sql`, `rows` to the assistant message spread in `sendMessage()`.
  - Render: a collapsible section in `AnalyticsAssistantResponse` (state via `useState`), rendering SQL text + a `VizWidget` `{ kind:'table', columns, rows }`.

### P0-d — Multi-widget answer with a short narrative
> **User story:** As an analyst, I want each answer to read like a mini-dashboard — one headline, a trend, a breakdown — with a one-line takeaway, not a wall of text and one chart.

- **Acceptance criteria**
  - The workflow return object includes `narrative` (one sentence, the takeaway) distinct from `text` (the fuller answer). `widgets` should, when the question warrants, contain a small coherent set (e.g. a `kpi` headline + a `line` trend + a `bar` breakdown) rather than a single chart, each with its own `title` and a `highlight` note.
  - The applet renders `narrative` prominently (e.g. above the widgets), then the widget grid, then `text` as supporting detail. Existing single-widget answers still render fine.
  - The mini-dashboard stays within the one-SQL-per-turn rule where possible: multiple widgets are different **views of the same result set** (headline = an aggregate of the rows, trend/breakdown = projections). If a genuinely second query is needed it is out of P0 (see P1).
- **Where it lands**
  - Contract/prompt: `essentialOutputFormat.analytics` + `basicAnalytics` instructions — emit `narrative` and encourage 1–3 complementary widgets built from the single `$rows` var.
  - Render: `AnalyticsAssistantResponse` renders `narrative` band; widget grid uses the existing `space-y-3` (optionally 2-col on wide screens).

### P1 (fast follow)
- **P1-a — Follow-up reuses/extends prior SQL via memory.** Use `chatHistory` + the prior turn's `sql` so a drill/follow-up modifies the last query (add a `GROUP BY`, a `WHERE`) instead of starting cold. Lands in `analytics-agent.js` (pass prior `sql` into vars/prompt).
- **P1-b — Second query for true breakdowns.** Allow a drill answer to run a *new* `duckDbSql` step when the breakdown dimension isn't in the current rows. Relax the "one query per turn" doclet rule for drill turns.
- **P1-c — "Explain this number."** A per-widget/inline affordance that asks the model to explain how a specific figure was derived (Genie/Looker style), reusing `sql`+`rows`.

### P2 (later)
- **P2-a — Cross-filter between widgets in one answer** (click a bar filters the sibling charts in the same answer, ECharts-side, no round-trip). Databricks-style implicit cross-filter.
- **P2-b — Saved views / pinned answers** to a room file via `wFetch`.
- **P2-c — Proactive anomaly/root-cause surfacing** (Pulse-style).

---

## 6. Proposed data contract changes (implement literally)

### 6.1 Workflow return object
Today the final `setCtxData` returns `{ text, widgets }`. Evolve it to:

```jsonc
{
  "text": "string — the full answer (unchanged, still required)",
  "narrative": "string — one-sentence takeaway (P0-d, optional)",
  "sql": "string — the exact DuckDB query that was run (P0-c, optional)",
  "rows": [ { "...": "..." } ],        // bounded sample (≤ 50) of the SQL result — the rows widgets were built from (P0-c)
  "widgets": [ /* widget specs, see 6.2 */ ],
  "followUps": [                        // 2–4 suggested next questions (P0-a, optional)
    { "label": "string ≤ ~40 chars", "question": "string — full NL prompt sent on tap" }
  ]
}
```

Rules for the model / doclet:
- `text` stays **required** (backward compatible). All new fields are **optional**; the applet must render correctly when any are absent.
- `sql` MUST be the literal query string from the `duckDbSql` step (already in scope — do not re-synthesize).
- `rows` MUST be the same `$rows` var used to build widgets, truncated to ≤ 50 rows (`$rows[0:50]` in jq).
- `followUps[].question` must be a self-contained NL question (it is replayed through `send()` with no extra context).

### 6.2 Widget spec addition — `drill`
Each widget spec keeps all current fields (`kind, title, subtitle, highlight, valueFormat, width, height, data/series/…`) and MAY add:

```jsonc
{
  "kind": "bar",
  "title": "Revenue by campaign",
  "valueFormat": "$",
  "highlight": { "max": true, "note": "top campaign" },
  "data": [ { "name": "Campaign A", "value": 12000 }, /* … */ ],
  "drill": {
    "dimension": "campaign",                         // human name of the axis (for the affordance/label)
    "question": "Break {name} down by device"        // template; {name} := clicked element's category
  }
}
```

- `drill` is optional. When present, clicking an element substitutes `{name}` and sends the resulting question via `send()`.
- `{name}` resolves from the ECharts click payload (`p.name` or `p.data.name`); if only a series is meaningful, `{name}` may resolve from `seriesName`.

### 6.3 `vizComp` / `VizWidget` event plumbing (viz-core.js)
- `vizComp(kind, optionFrom, description)`: in the `hFunc`, after `chart.setOption(...)`, register:
  ```js
  props.onEvent && chart.on('click', p => props.onEvent({ type: 'drill', name: p.name ?? p.data?.name, seriesName: p.seriesName, spec: props }))
  ```
  `optionFrom` stays pure and untouched — no widget file changes required for the ~20 kinds.
- `VizWidget`'s `hFunc` signature becomes `({ spec, onEvent })` and forwards `onEvent` to the dispatched widget: `hh(ctx, widget, { ...s, onEvent })`.
- Backward compatible: no `onEvent` → no click handler registered → existing reactTests unaffected.

### 6.4 Applet changes (comaxApp.js)
- `sendMessage()`: extend the assistant-message spread to persist `narrative, sql, rows, followUps` (alongside the existing `widgets`).
- `AnalyticsAssistantResponse`: render order → `narrative` band → widget grid (each `VizWidget` gets an `onEvent` that reads the widget's `spec.drill`, substitutes `{name}`, and calls `send`) → `text` detail → follow-up chip row (`followUps.map` → buttons calling `send(question)`) → collapsible "Show SQL / data" (SQL block + a `table` VizWidget of `rows`).
- Thread `send` down to `AnalyticsAssistantResponse` (currently it only lives in the applet root) so chips and drill clicks can replay questions.

---

## 7. Non-goals (explicitly out of scope for this iteration)

- **Cross-filtering between widgets** in one answer (P2). P0 drill = round-trip a new question, not client-side filtering of siblings.
- **Saved views / pinned dashboards / export** (P2).
- **A second/parallel SQL query per turn** — P0 keeps the one-query-per-turn backbone; multi-widget answers are multiple **views of the same result set**. True second-query breakdowns are P1-b.
- **Proactive/agentic anomaly detection** (Pulse-style) (P2).
- **New chart kinds** — the ~20 existing kinds are sufficient; do not add widgets.
- **Semantic-model / verified-query repository** (Cortex/Genie style) — our grounding stays the booklet + conversion-math doclet.
- **Changing the LLM, framework, or renderer.** Stays gemini via `mpi`, jb6/TGP, ECharts SVG, DuckDB-on-parquet.

---

## 8. Rollout / test plan

Follow the repo's short loop: write a test, run it with loggers via MCP, read the logs, iterate.

**Contract / workflow (analytics-agent-tests.js, run via MCP `runTest` with `dbLogger,roomLogger`)**
- Extend `workflowTest.basicAnalytics.*` `liveFlowOk` checks so the generated code includes `followUps`, `narrative`, `sql`, and a `rows` slice in the final `setCtxData`, and that `widgets` may carry `drill`.
- Add a case asserting a drill-oriented question yields a widget with `drill:{dimension,question}` and a `{name}` placeholder.
- Keep `basicAnalytics.outputFormat.backbone` green (still `duckDbSql` + `llmSummary`); add assertions for the new emitted keys.

**Widgets (viz, run via `node ./public/core/run-tst.js --entryPoint=…/viz/widgets/<kind>-widget.js --pattern="reactTest.viz.<kind>"`)**
- All existing `reactTest.viz.*` and `reactTest.viz.*.highlight` must stay green (no-`onEvent` path unchanged) — this is the regression gate for §6.3.
- Add one reactTest that renders a `VizWidget` with an `onEvent` spy and a `spec.drill`, simulates a click (ECharts `dispatchAction`/SVG click via the test harness), and asserts `onEvent` fires with the clicked `name`. Verify via MCP `runTest` with `uiLogger`.

**Applet (reactTest via MCP `runTest({ testId, logger:'uiLogger' })`)**
- Add a `reactTest` for `AnalyticsAssistantResponse` fed an element with `narrative`, `widgets` (one with `drill`), `sql`, `rows`, `followUps`: assert the narrative text, a follow-up chip label, and that the "Show SQL / data" section reveals the SQL string and a table. Read `uiLog`, not just `success`.
- Manual: render the live applet via its room-applet URL (`http://localhost:3000/room/comax/applet/<appletName>?logger=uiLogger,…`) and `playwrightHarvest`; verify a chip tap and a bar click both re-enter `send` (one new user turn each).

**Definition of done for P0:** all existing viz + workflow tests green; new contract fields emitted and rendered; a chip tap and a chart click each produce a new answer; the SQL/data toggle reveals the exact query and rows.
