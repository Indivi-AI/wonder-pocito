import { dsls } from '@jb6/core'
import '@jb6/llm-guide'

const {
  'llm-guide': { Booklet, Doclet, booklet: { booklet } }
} = dsls

// One booklet the analytics workflow loads so the LLM can pick a chart and emit
// inline widgets. Plain-string doclets (read verbatim by the model), same style
// as schematicsAnalyticsSchema.
Booklet('vizWidgets', { impl: booklet('vizCatalog,vizHighlight,vizDrill,vizOutputFormat') })

Doclet('vizCatalog', {
  impl: `
INLINE VISUALIZATION WIDGETS
You can answer with text AND inline interactive widgets (charts/plots/tables). Choose the widget whose purpose matches the question, then pass the right params. Every widget gets {title, optional subtitle, optional highlight, optional valueFormat: 'int'|'$'|'%'|'compact'}. Pick the SMALLEST set of widgets that answers the question (usually one).

For flow-elem<ai>finalAnswer/finalAnswerFromReport, widgets are DECLARATIVE specs: charts use nameCol/valueCol and tables use columns; do not pass data/rows/series/items because the runtime materializes the render shape from the kept rows. The render shapes below describe what VizWidget consumes after materialization or what drill SQL aliases should return.

PART-TO-WHOLE (composition of a single total):
- pie    {kind:'pie', data:[{name,value}], donut?:true} — share of a total across few categories (<=8).
- funnel {kind:'funnel', data:[{name,value}]} — ordered stages that shrink (sessions→clicks→converters).
- treemap{kind:'treemap', data:[{name,value}]} — many categories' relative size in one block.
- gauge  {kind:'gauge', value, min, max, target?} — one KPI against a range.
- waterfall {kind:'waterfall', data:[{name,value}]} — running total built from +/- contributions.

COMPARISON ACROSS CATEGORIES:
- bar    {kind:'bar', data:[{name,value}]} — vertical columns, few categories.
- hbar   {kind:'hbar', data:[{name,value}]} — horizontal bars, long labels or a ranked list.
- groupedBar {kind:'groupedBar', categories:[...], series:[{name,values:[...]}]} — compare series side by side per category.
- stackedBar {kind:'stackedBar', categories:[...], series:[{name,values:[...]}]} — part-to-whole per category.
- radar  {kind:'radar', indicators:[{name,max}], series:[{name,values:[...]}]} — multi-metric profile.
- bullet {kind:'bullet', data:[{name,value,target,ranges?:[a,b,c]}]} — actual vs target KPIs.

TREND OVER A CONTINUOUS / ORDERED AXIS:
- line   {kind:'line', series:[{name,points:[{x,y}]}], xType?:'category'|'number'|'time'} — one or more trends; single series may pass data:[{x,y}].
- area   {kind:'area', series:[...], stacked?:true} — trend with magnitude / cumulative composition.

DISTRIBUTION:
- histogram {kind:'histogram', values:[numbers], bins?:n} — shape of one numeric variable.
- boxplot   {kind:'boxplot', data:[{name,values:[numbers]}]} — spread/quartiles across groups.
- scatter   {kind:'scatter', data:[{x,y,name?}], xLabel, yLabel, xFormat?, yFormat?} — relationship between two numerics; ALWAYS name both axes, and when their units differ set xFormat/yFormat per axis instead of one valueFormat.
- bubble    {kind:'bubble', data:[{x,y,size,name?}], xLabel, yLabel, sizeLabel?, xFormat?, yFormat?} — three numerics at once; same axis-naming rule.

MATRIX / TABLE / SINGLE VALUE:
- heatmap {kind:'heatmap', xCategories:[...], yCategories:[...], data:[{x,y,value}]} — density across two categorical axes.
- table   {kind:'table', columns:[{key,label,format?}], rows:[{...}], search?, filters?:{colKey:text}, sort?:{key,dir:'asc'|'desc'}} — exact numbers across several columns; renders clickable sort headers, per-column filters, and search with highlighted matches.
- kpi     {kind:'kpi', items:[{label,value,delta?,format?}]} — a few headline numbers/scorecards.

All widgets support hover tooltips and titles; cartesian widgets (bar/line/area/scatter/bubble) support zoom. Build the widget DATA from your computed result (the SQL/array already in the flow), never invent numbers.
`
})

Doclet('vizHighlight', {
  impl: `
HIGHLIGHT (the emphasis param every widget shares)
Use \`highlight\` to make the answer point at the most important element. Forms:
- "Alice"               → emphasize the slice/bar/row named Alice (dims the rest)
- 2                     → emphasize the element at 0-based index 2
- {name:"Alice", note:"biggest spender"}  → emphasize + show a callout note
- {max:true, note:"peak day"} or {min:true} → auto-pick the extreme value
- ["Alice","Bob"] or [{...},{...}]         → emphasize several
Set highlight whenever the user asks "which is biggest/most/least/the top X" or wants attention drawn to a specific category. Put the punchline in note.
`
})

Doclet('vizDrill', {
  impl: `
DRILL-DOWN (click-to-expand side plot on any widget)
Any widget MAY carry a \`drill\` object; clicking an element then runs a NEW SQL locally and opens the side plot under the widget — no chat round-trip:
  drill: { kind, title, sql, question?, label?, valueFormat? }
- kind: any catalog kind for the side plot.
- Placeholders, filled from the clicked element: {name} (clicked category/slice/bar/row), {series}, and on heatmap {x}/{y}. Use {name:q} inside SQL — it becomes a safely-quoted SQL literal (so you never write quotes yourself): WHERE branch = {name:q}.
- sql: one DuckDB query over the same parquets as the main query. Alias its columns to the target kind's shape: name,value (bar/hbar/pie/funnel/treemap/waterfall/boxplot) · x,y and optional series (line/area) · category,series,value (groupedBar/stackedBar) · x,y,value (heatmap) · label,value (kpi) · value (histogram/gauge) · any columns (table). Aggregate + ORDER BY + LIMIT like the main query.
- title: Hebrew template shown above the side plot, e.g. 'מגמה שבועית — {name}'.
- question: optional escalation — a chat-question template offered as a button in the panel (also the fallback when there is no sql).
- drill MAY be an array (the panel shows a chip per drill, e.g. trend + composition); give each a short Hebrew label.
Example on a bar of revenue by branch:
  drill: {kind: 'line', title: 'מגמה חודשית — {name}', valueFormat: '₪', sql: "SELECT date_trunc('month', d)::date AS x, SUM(rev) AS y FROM read_parquet('signedRoom://comaxDemo/usersRO/parquet/...') WHERE branch = {name:q} GROUP BY 1 ORDER BY 1"}
Pick the drill that answers the natural next question: a time cell (day/hour heatmap) drills to the trend of that cell; a category bar drills to its composition (bar/pie splitBy another dimension); a KPI drills to its breakdown.
`
})

Doclet('vizOutputFormat', {
  impl: `
WIDGET ANSWER OUTPUT FORMAT
When a chart helps, the FINAL flow element is flow-elem<ai>finalAnswer/finalAnswerFromReport. Do not build the final object with jqSingle. text/narrative are clean markdown; widgets is an array of declarative specs (charts: nameCol/valueCol; table: columns); every main widget SHOULD add drill (see DRILL-DOWN) so clicks open a side plot; followUps are 2-4 grounded next questions.

Backbone:
\`\`\`javascript
{$: 'flow-elem<ai>flow', elems: [
  {$: 'flow-elem<ai>setCtxData',
    goal: 'Compute the rows',
    value: {$: 'data<common>duckDbSql', sql: 'SELECT name, value FROM ... ORDER BY value DESC LIMIT 8'},
    postCondition: {$: 'boolean<common>jqBoolean', exp: 'type == "array"'}
  },
  {$: 'flow-elem<ai>setCtxVar', goal: 'Keep rows', varName: 'rows',
    value: {$: 'data<common>jqSingle', exp: '.'}
  },
  {$: 'flow-elem<ai>setCtxVar', goal: 'Write the answer', varName: 'answer',
    value: {$: 'data<common>llmSummary', summaryCategories: 'dataInsights', evaluation: 'Answer with SHORT_ANSWER as one sentence and LONG_ANSWER as 3-4 concise sentences, with key numbers in **bold** and every number to 2 decimals; if rows are empty, say no matching data was found.'},
    postCondition: {$: 'boolean<common>jqBoolean', exp: '(type == "string" and length > 0) or (.text | type == "string" and length > 0)'}
  },
  {$: 'flow-elem<ai>finalAnswer',
    goal: 'Return the explorable answer',
    sql: 'SELECT name, value FROM ... ORDER BY value DESC LIMIT 8',
    narrative: '{0.name} leads with {0.value:$}.',
    widgets: [{ kind: 'bar', title: 'Revenue by campaign', valueFormat: '$', highlight: {max:true, note:'top campaign'}, nameCol: 'name', valueCol: 'value',
      drill: {kind: 'bar', title: 'Devices — {name}', valueFormat: '$', sql: "SELECT device AS name, SUM(revenue) AS value FROM ... WHERE campaign = {name:q} GROUP BY 1 ORDER BY 2 DESC LIMIT 8", question: 'Break {name} down by device'} }],
    followUps: [ {label: 'Top campaign by device', question: 'Break the top campaign down by device'} ]
  }
]}
\`\`\`
Rules:
- Exactly one javascript code block, 2-space indent before each flow elem.
- widgets are declarative only: charts use nameCol/valueCol; table uses columns; never pass data/rows/series/items/values/categories/xCategories/yCategories/points.
- sql echoes the SAME literal query string from duckDbSql; finalAnswer truncates rows to 50.
- Empty rows are valid; finalAnswer handles them automatically.
- For a detailed table answer, pass columns into a table widget, use sort for the primary metric, filters for known narrowed dimensions, and search only when the user supplied a specific term to find/highlight.
- If no chart helps, return { text } alone (the rest optional).
- Match each widget's declarative bindings to the columns you computed; the catalog shapes are what runtime/drill renderers consume after materialization.
`
})
