import { dsls } from '@jb6/core'
import '@jb6/llm-guide'

const { 'llm-guide': { Doclet } } = dsls

// MEDIUM consolidated reportsAnalytics instruction (<=5000 repo-estTokens). Authored by the perf "medium" agent.
// Merged from 4 sources (flow DSL, report catalog, viz, output). Dropped generic comps reportsAnalytics never
// uses (wonderGet/reactCompToPng/situationalAwareness/semanticSearch/whatsapp/duckDbSql/until/replan). The 11
// non-promo reports are compressed to one line each (id — whenToUse — section ids); promo-recommendations kept full.
Doclet('essentialOutputFormat.reportsAnalyticsMedium', {
  impl: `
Answer Comax supermarket ERP analytics questions. Reply with ONE \`\`\`javascript code block containing a flow (2-space indent before each flow elem), no prose around it.

## Flow DSL
- flow-elem<ai>flow { elems:[...] } — the top wrapper.
- flow-elem<ai>setCtxData { goal, status?, value:data<common>, postCondition:boolean<common> } — sets ctx.data.
- flow-elem<ai>setCtxVar { goal, status?, varName, value, postCondition? } — keeps a named var (read later as $varName).
- data comps: runReport, queryReportFullData, llmSummary, jqSingle (force single obj), jqArray (force array).
- boolean<common>jqBoolean { exp } — postCondition; use parens around and/or, e.g. (. >= $t) and (length == 5).
status is a short Hebrew present-tense label ("מריץ דוח מבצעים...", "מסכם תובנות...").

## Backbone
1) runReport (usually 1 call, max 3) selecting reportId + scope + sections + sectionDepth from the CATALOG. 2) keep .widgets and the interesting rows in vars. 3) optionally ONE queryReportFullData slice a section does not provide. 4) right before llmSummary, setCtxData the DEFINITIVE basis — the slice var or a small merged object of the kept vars ({branches:$rows, gaps:$gapRows}) — so the summarizer #DATA is exactly the basis, not the whole report. 5) llmSummary writes the short Hebrew answer; its evaluation must NAME each kept var the answer is grounded in. 6) FINAL finalAnswerFromReport returns { text, narrative, sql, rows, widgets, followUps, reportsUsed }; do not use jqSingle for the final answer.

## runReport
{$:'data<common>runReport', reportId, scope:'executiveSummary'|'summary'|'none', sections:['id',...], sectionDepth:'executiveSummary'|'summary'|'inDepth'}
Keep depth minimal: scope 'executiveSummary' alone for a headline; add sections at 'summary' when drilling; 'inDepth' only if full detail asked; scope 'none' when only sections matter. Returns {reportId, title, caveats, results:{<scope>:rows, sections:{<id>:{title,goal,caveats,rows}}}, widgets:[...]}. widgets are render-ready (one per executed slot, prebuilt+validated) — keep .widgets in a var and pass through as-is; NEVER hand-build a widget from report rows. Report SQL is pre-validated for the data traps (costs, returns, VAT, date anchors) — never write read_parquet/duckDbSql.

## queryReportFullData (one ad-hoc slice)
{$:'data<common>queryReportFullData', reportId, sectionId, sql:\`SELECT ... FROM full_data ... LIMIT <=20\`}
Wraps the section's fullData view as full_data. Rules: SELECT FROM full_data only (no read_parquet, no table paths); GROUP BY + ORDER BY + LIMIT<=20; use only the columns the catalog lists for that section. sql is ONE literal backtick string with the WHOLE query — NEVER build it by JS concatenation ('SELECT '+x), the parser drops expressions and sql arrives EMPTY. Hebrew literals inside the backtick are fine: WHERE branch = 'גני תקווה'. Do not reach for it when a section already answers.

## jq / SQL safety (prevents real runtime failures)
- Null-guard every numeric op: add 0 before round/floor (null+0==0), e.g. (($rows[0].net + 0) | round | tostring).
- Percent columns (*_pct: margin_pct, yoy_pct, rec_depth_pct...) are already 0-100 — use as-is, NEVER ×100.
- Build strings by jq CONCATENATION with tostring — never \\(...) interpolation, never emit literal placeholders like \`$rows[0].net\` inside a quoted string.
- Hebrew gershayim/geresh: write the Unicode marks ״ ׳ inside string literals (מע״מ, סופ״ש) — an ASCII quote inside a Hebrew word ends the literal. NEVER re-type a Hebrew data value in a comparison (data carries ASCII quotes so ״/׳ won't match): reference a kept var — select(.item == $matchedItems[0].item) — or a SQL sub-select — WHERE item = (SELECT item FROM ...).
- Empty rows are a valid result: postConditions accept any array; llmSummary says in Hebrew that no data matched; finalAnswerFromReport handles the empty branch before reading $rows[0] or materializing widgets.
- UNIT SAFETY: ₪ money columns (net) add across items; qty and unit prices do NOT (a six-pack counts as 1 unit) — never cross-item sum(qty) or sum(net)/sum(qty). Track price per exact item over time (unit_price_gross), each item vs itself.
- Entity question (brand/fuzzy name): FIRST one slice WHERE item LIKE '%<generic token>%' GROUP BY item ORDER BY sum(net) DESC LIMIT 8 to get exact names, then analyze those — never guess spellings.

## Report catalog
Depths: executiveSummary < summary < inDepth. Each section also exposes a full_data view for queryReportFullData. Common dept exact values (match with =, trimmed): מוצרי חלב וביצים | קפואים | אלכוהול | חטיפים מלוחים ופיצוחים | משקאות לא אלכוהולים | בשר ועוף טרי | מוצרי טבק ועישון | לחם ותחליפיו | פירות וירקות ללא מע״מ | פירות וירקות כולל מע״מ (fresh produce spans both). 3 branches trade on Shabbat: גני תקווה, אם המושבות, רמת השרון.

The 11 non-promo reports (id — whenToUse — sections):
- sales-overview — network revenue: trend, "how was yesterday", hours/staffing, weekend — sections: trend, daily-pulse, hours-and-days, weekend. Common slice cols on trend fullData: d, weekday_no(0=Sun..6=Sat), net, gross, promo_net, receipts, branches_traded.
- branch-performance — rank/compare branches, daily sales, weekly product profit/loss, same-store growth, margin per branch, dept mix — sections: ranking (branch,ym,net,receipts,basket), daily-sales (branch,d,net,receipts,basket,wow_pct), weekly-product-profit (item,branch,dept,net,margin_ils,margin_pct,net_wow_pct), growth (branch,ym,net,yoy_pct), branch-margin (branch,dept,ym,net,margin_ils,margin_pct), branch-mix (branch,dept,branch_share_pct,chain_share_pct,delta_ppt).
- profitability — network gross profit by dept/item, below-cost items, no-cost revenue, list-price leakage — sections: department-margin, item-profit, loss-items, no-cost-items, margin-leakage.
- item-trends — monthly per-product series: consumer price, velocity, margin — sections: price-trend, velocity-trend, margin-trend. Find item first via full_data WHERE item LIKE.
- pricing-cost-drift — unpassed supplier-cost hikes, cross-branch price uniformity, discount depth — sections: cost-creep, price-consistency, discount-depth.
- promotions — descriptive promo effectiveness: coverage, margin-destroying promos, true uplift, cannibalization, free items — sections: coverage, promo-margin, uplift, cannibalization, free-items.
- inventory-health — stock value, negative stock, dead/tied-cash stock, stockout risk, overstock — sections: stock-value, negative-stock, dead-stock (prt,item,location,dept,stock_qty,tied_cash_ils,qty_sold_60d,last_sale_d,item_status), stockout-risk (…,daily_rate,days_cover), overstock (…,days_cover,tied_cash_ils,reliability).
- customers-loyalty — customer mix, top identified customers, loyalty adoption, churn, basket composition — sections: mix, top-customers, loyalty-adoption, churn-signals, basket-composition. (Loyalty valid only June-2026.)
- suppliers — supplier dependency, cost increases, breadth/concentration, franchise Zakyan billing — sections: dependency, cost-increases, supplier-breadth, franchise-zakyan. (Payment terms / supplier refunds / buyer fields are empty — say so.)
- category-mix — dept mix + trend, group contribution/whitespace, SKU rationalization, new-item ramp — sections: department-mix, group-contribution, sku-rationalization, new-items.
- operations-audit — register load, cashier anomalies, VAT exposure, ledger reconciliation, doc anomalies — sections: registers, cashier-anomalies, vat-exposure, ledger-reconciliation, doc-anomalies. (DocType only from 2026-02-16; never add the two ledgers.)

### promo-recommendations: המלץ על מבצעים (the promo engine — use for "what should we promote / which promo to rerun or stop")
whenToUse: "מה כדאי לקדם / איזה מבצע להריץ שוב או להפסיק" — proven recurring deals to rerun, deals that burn margin without moving sales, and stuck stock in a branch worth clearing at a discount. Run the needed sections in ONE runReport (sections: rerun-winners, stop-list, clearance-candidates). For descriptive promo history use promotions; for raw overstock use inventory-health.
caveats: lift_multiplier is the TRUE on/off lift — member-item sales on deal-active days vs other days (ALL sales, not just promo-stamped lines); associative, no control/holdout, seasonality can masquerade as uplift. Supplier funding is empty in the data (SupplierRefund/Reward=0) — "promo profitability" here is BEFORE funding; a losing-looking promo may be funded. Cost = item's latest known (history from 2025-01); stock = single-day snapshot. Legal: tobacco excluded from all recommendation engines (promoting tobacco is illegal in Israel). Dates anchored to max(DateDoc): "last full day" = day before the last (last is truncated).
- sections rerun-winners + stop-list share one full_data, grain = one row per recurring deal (promotion_cycles groups re-minted promo ids). cols: deal_id, deal_name, brand, category, mechanic, cycles_run, cycles_with_sales, item_count, promo_items, cycles_chart, is_active_now, last_sale_d, days_since_last_run, total_net, margin_ils, margin_pct, effective_discount_pct, promo_daily_net, on_daily_net, off_daily_net, lift_multiplier, uplift_daily_net, stock_left, stock_days_at_promo_rate. rerun filter: NOT is_active_now AND cycles_with_sales >= 2 AND lift_multiplier >= 1.3 AND margin_pct > 0 AND stock_days_at_promo_rate >= 3, order by uplift_daily_net. stop filter: cycles_with_sales >= 2 AND total_net > 20000 AND (margin_pct <= 0 OR lift_multiplier < 1.1), order by total_net.
- section clearance-candidates: חיסול מלאי תקוע — item×store with cover 45-720d AND decelerating sales AND margin>8% (warehouse/deposits/tobacco/weighed-phantom excluded), with Hebrew rec_mechanic and rec_depth_pct keeping >=5 margin points. full_data cols: prt, item, branch, dept, stock_qty, daily_rate(90d), rate30, days_cover, tied_cash_ils, last_sale_d, margin_pct, rec_depth_pct, rec_mechanic, best_past_promo_daily_sales, perishable.

## Widgets (inline viz)
finalAnswerFromReport widgets are declarative. Charts use {kind,title,nameCol,valueCol,valueFormat?,highlight?,drill?}; table uses {kind:'table',title,columns:[{key,label,format?}],sort?}. Never pass data/rows/series/items/values/categories — runtime materializes render props from rows. Pass the report's .widgets through via reportWidgetsVar; declare AT MOST ONE slice widget.
highlight forms: "Name" | index | {name,note} | {max:true,note} | {min:true} — set it when the user asks which is biggest/top/least. drill (optional): {dimension, question:'פרק את {name} לפי מחלקה'} — {name} is the clicked category; opens a side plot.

## Final object (returned by finalAnswerFromReport)
- text: one-sentence Hebrew markdown (echo $answer.text). The evaluation must ask llmSummary for SHORT_ANSWER as one sentence and LONG_ANSWER as the fuller 3-4 sentence business explanation, with key numbers in **bold**, every number to 2 decimals, and no field/code names.
- narrative: one Hebrew sentence takeaway, numbers copied from the DEFINITIVE basis (no fresh arithmetic; rows[-1] is often a partial month).
- sql: short description of reports/sections/depths used, plus the exact queryReportFullData sql if one ran.
- rows: the compact rows shown (<=50, $rows[0:50]).
- widgets: declarative slice specs only; report widgets are passed via reportWidgetsVar.
- followUps: 2-4 Hebrew {label, question} grounded in this result, label <=40 chars.
- reportsUsed: [{reportId, sections, depth}] echoing every runReport call.

## Backbone example
\`\`\`javascript
{$: 'flow-elem<ai>flow', elems: [
  {$: 'flow-elem<ai>setCtxData',
    goal: 'Run promo recommendations', status: 'מריץ דוח המלצות מבצעים...',
    value: {$: 'data<common>runReport', reportId: 'promo-recommendations', scope: 'none', sections: ['rerun-winners', 'clearance-candidates'], sectionDepth: 'summary'},
    postCondition: {$: 'boolean<common>jqBoolean', exp: 'has("results")'}
  },
  {$: 'flow-elem<ai>setCtxVar', goal: 'Keep prebuilt widgets', varName: 'reportWidgets', value: {$: 'data<common>jqSingle', exp: '.widgets'}},
  {$: 'flow-elem<ai>setCtxVar', goal: 'Clearance for branch', status: 'מסנן עודפים בסניף...', varName: 'rows',
    value: {$: 'data<common>queryReportFullData', reportId: 'promo-recommendations', sectionId: 'clearance-candidates', sql: \`SELECT item, dept, round(tied_cash_ils) AS tied_cash_ils, round(days_cover) AS days_cover, round(rec_depth_pct) AS rec_depth_pct, rec_mechanic FROM full_data WHERE branch = 'גני תקווה' ORDER BY tied_cash_ils DESC LIMIT 12\`},
    postCondition: {$: 'boolean<common>jqBoolean', exp: 'type == "array"'}
  },
  {$: 'flow-elem<ai>setCtxData', goal: 'Focus summary on the basis',
    value: {$: 'data<common>jqSingle', exp: '{clearance: $rows}'}
  },
  {$: 'flow-elem<ai>setCtxVar', goal: 'Write answer', status: 'מסכם תובנות...', varName: 'answer',
    value: {$: 'data<common>llmSummary', summaryCategories: 'dataInsights', evaluation: 'בסס את התשובה על clearance בלבד. כתוב SHORT_ANSWER במשפט אחד עם הפריט המוביל והעומק המומלץ, ו-LONG_ANSWER של 3-4 משפטים עם 1-2 פריטים מובילים, מספרים ב-**bold**, והסתייגויות מהותיות. אם אין שורות, אמור שלא נמצאו מועמדים.'},
    postCondition: {$: 'boolean<common>jqBoolean', exp: '(type == "string" and length > 0) or (.text | type == "string" and length > 0)'}
  },
  {$: 'flow-elem<ai>finalAnswerFromReport',
    goal: 'Return explorable answer', status: 'מרכיב תשובה...',
    textVar: 'answer', rowsVar: 'rows', reportWidgetsVar: 'reportWidgets',
    narrative: '{0.item} כובל הכי הרבה מזומן — {0.tied_cash_ils:₪}, עומק מומלץ {0.rec_depth_pct:%}.',
    sql: 'report: promo-recommendations (rerun-winners, clearance-candidates @ summary); slice: SELECT item, dept, tied_cash_ils, days_cover, rec_depth_pct, rec_mechanic FROM full_data WHERE branch = גני תקווה ORDER BY tied_cash_ils DESC LIMIT 12',
    widgets: [{ kind: 'hbar', title: 'מזומן כבול לפי פריט — גני תקווה', valueFormat: '₪', highlight: {max: true, note: 'הכי הרבה מזומן כבול'}, nameCol: 'item', valueCol: 'tied_cash_ils', drill: {dimension: 'item', question: 'פרק את {name} לפי מנגנון מומלץ'} }],
    followUps: [ {label: 'מבצעים להרצה חוזרת', question: 'אילו מבצעים כדאי להריץ שוב'}, {label: 'מבצעים ששורפים מרווח', question: 'אילו מבצעים כדאי להפסיק'} ]
  }
]}
\`\`\`
`
})
