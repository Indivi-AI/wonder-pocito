import { dsls, jb } from '@jb6/core'
import '@jb6/common'
import '@jb6/testing'
import '@jb6/react/tests/react-testers.js'
import '@wonder/ai/llm-flow-main-workflow.js'
import '../../../viz/viz-index.js'        // registers VizWidget + every widget + its reactTests
import '../Agents/analytics-agent.js' // registers the basicAnalytics workflow + viz doclets
import '../App/comaxApp.js' // registers AnalyticsAssistantResponse (the chat answer renderer)

const {
  common: { boolean: { contains, notContains, and, equals } },
  react: { 'react-comp': { AnalyticsAssistantResponse } },
  test: { Test, 'ui-action': { delay, click }, test: { dataTest, reactTest } },
  workflow: { workflow: { basicAnalytics } }
} = dsls

// ── the campaign rows from the real failing case (sessions per campaign) ─────
const campaignRows = [
  { name: '120242290250740237', value: 410572 }, { name: '39911 Open', value: 409001 },
  { name: '39912 Open', value: 137215 }, { name: '39951', value: 106214 },
  { name: '39942 Open', value: 58746 }, { name: '439951', value: 57321 }
]

// ============================================================================
// LAYER 1 — deterministic OUTPUT CONTRACT. Given the model's chosen chart+params
// (a fixed flow), runLLMFlowScript must carry kind+params through to runRes.widgets.
// No LLM/DB: isolates "the flow selects a widget and passes the right params".
// ============================================================================
const flowEmitting = widgetExp => `
\`\`\`javascript
{$: 'flow-elem<workflow>flow', elems: [
  {$: 'flow-elem<workflow>setCtxData', goal: 'Load rows',
    value: {$: 'data<common>jqArray', exp: '[{"name":"Alice","value":120},{"name":"Bob","value":80},{"name":"Carol","value":50}]'},
    postCondition: {$: 'boolean<common>jqBoolean', exp: 'length == 3'}},
  {$: 'flow-elem<workflow>setCtxVar', goal: 'Keep rows', varName: 'rows',
    value: {$: 'data<common>jqSingle', exp: '.'}},
  {$: 'flow-elem<workflow>setCtxData', goal: 'Return text + chart',
    value: {$: 'data<common>jqSingle', exp: '{ text: "Top senders", widgets: [ ${widgetExp} ] }'},
    postCondition: {$: 'boolean<common>jqBoolean', exp: 'has("text") and (.widgets|type=="array")'}}
]}
\`\`\``

const runFlow = responseText => async ctx => {
  const wfCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx.setVars({ db: 'local', userMessage: 'top senders', doNotWriteLogs: true }))
  return dsls.common.data.runLLMFlowScript.$runWithCtx(wfCtx, responseText)
}

Test('vizFlow.emitsPieWithParams', {
  impl: dataTest({
    calculate: runFlow(flowEmitting('{ kind: "pie", title: "Messages by sender", highlight: {name:"Alice", note:"most active"}, data: ($rows | map({name:.name, value:.value})) }')),
    expectedResult: and(
      equals('pie', '%runRes/widgets/0/kind%'),
      equals('Messages by sender', '%runRes/widgets/0/title%'),
      equals('Alice', '%runRes/widgets/0/highlight/name%'),
      equals(120, '%runRes/widgets/0/data/0/value%'))
  })
})

Test('vizFlow.emitsBarHighlightMax', {
  impl: dataTest({
    calculate: runFlow(flowEmitting('{ kind: "bar", title: "Senders", valueFormat: "int", highlight: {max:true, note:"top sender"}, data: ($rows | map({name:.name, value:.value})) }')),
    expectedResult: and(
      equals('bar', '%runRes/widgets/0/kind%'),
      equals(true, '%runRes/widgets/0/highlight/max%'),
      contains('top sender', { allText: '%runRes/widgets/0/highlight/note%' }))
  })
})

// setCtxVar postCondition must validate the SET VALUE, not the leftover ctx.data.
// Here data stays an array while the var holds a string — 'type == "string"' must pass.
Test('vizFlow.setCtxVarPostConditionOnValue', {
  impl: dataTest({
    calculate: runFlow(`
\`\`\`javascript
{$: 'flow-elem<workflow>flow', elems: [
  {$: 'flow-elem<workflow>setCtxData', goal: 'Load rows',
    value: {$: 'data<common>jqArray', exp: '[{"name":"Alice","value":120}]'},
    postCondition: {$: 'boolean<common>jqBoolean', exp: 'type == "array" and length > 0'}},
  {$: 'flow-elem<workflow>setCtxVar', goal: 'Write the answer', varName: 'answer',
    value: {$: 'data<common>jqSingle', exp: '"the answer"'},
    postCondition: {$: 'boolean<common>jqBoolean', exp: 'type == "string" and length > 0'}},
  {$: 'flow-elem<workflow>setCtxData', goal: 'Return answer',
    value: {$: 'data<common>jqSingle', exp: '{ text: $answer }'},
    postCondition: {$: 'boolean<common>jqBoolean', exp: 'has("text")'}}
]}
\`\`\``),
    expectedResult: equals('the answer', '%runRes/text%')
  })
})

// ============================================================================
// LAYER 2 — RUNS & RENDERS. The chart the flow chose must actually render as an
// ECharts SVG in jsdom (title + highlight note + a data label become real <text>).
// ============================================================================
Test('vizFlow.pieRunsAndRenders', {
  impl: reactTest({
    testedComp: (ctx, { react: { hh } }) => () => hh(ctx, dsls.react['react-comp'].VizWidget, {
      spec: { kind: 'pie', title: 'Sessions per campaign', valueFormat: 'compact', highlight: { max: true, note: 'leading campaign' }, data: campaignRows }
    }),
    expectedResult: and(contains('Sessions per campaign'), contains('leading campaign'), contains('39951')),
    userActions: delay(80)
  })
})

// ============================================================================
// LAYER 3 — LIVE: the real LLM must CHOOSE the pie widget for a pie question and
// put the data in widgets[] — NOT dump a JSON block into the answer text (the bug).
// ============================================================================
// return ONLY the generated flow code — upstream SQL/summary execution errors must
// not gate the "did the model choose the right widget" assertion (see tester testFailure).
const genFlowCode = userMessage => async ctx => {
  const vars = { db: 'local', userId: 'ScreenshotService', roomId: 'BSG-prod-slice', userMessage, doNotWriteLogs: true, isLocalHost: false,
    llmProxyUrl: 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy', categories: { analytics: true, local: true, viz: true } }
  const wfCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx.setVars(vars))
  const res = await basicAnalytics.$runWithCtx(wfCtx).calcWorkflow(wfCtx)
  return { llmGeneratedCode: res?.llmGeneratedCode || '' }
}

// Assert on the GENERATED FLOW CODE (like liveFlowOk) — robust to upstream
// llmSummary/SQL execution flakes. The bug = model routes the data as a JSON dump
// in the answer text instead of a widget; correct = a widget of the right kind whose
// data derives from the rows var. Runtime rendering is proven separately in Layer 2.
const codeChoosesChart = kind => ctx => {
  const code = ctx.data?.llmGeneratedCode || ''
  const hasKind = new RegExp(`kind:\\s*["']${kind}["']`).test(code)
  const dataFromRows = /widgets:[\s\S]*?data:\s*\(\$/.test(code)   // widget data comes from a flow var ($rows…), not a literal array
  const noJsonDump = !/```json/i.test(code) && !/text:\s*["'`][^"'`]{0,60}\[\s*\{\s*"/.test(code)
  return hasKind && dataFromRows && noJsonDump
}

Test('vizLiveFlow.choosesPieNoJsonDump', {
  HeavyTest: true,
  impl: dataTest({
    calculate: genFlowCode('Show a pie chart of the share of sessions per campaign. Use sessions_answers_auto, group by campaign_name, top 12 by sessions.'),
    expectedResult: codeChoosesChart('pie'),
    allowError: true,   // ignore unrelated upstream SQL/summary log-errors; we assert only the widget choice in the generated code
    timeout: 120000,
    logger: 'dbLogger'
  })
})

// ============================================================================
// CONTRACT — the FINAL flow object carries the explorable-answer keys (§6.1):
// narrative, sql, rows[0:50], followUps, and a widget with drill{dimension,question}.
// ============================================================================
Test('vizFlow.emitsExplorableAnswer', {
  impl: dataTest({
    calculate: runFlow(`
\`\`\`javascript
{$: 'flow-elem<workflow>flow', elems: [
  {$: 'flow-elem<workflow>setCtxData', goal: 'Load rows',
    value: {$: 'data<common>jqArray', exp: '[{"name":"Alice","value":120},{"name":"Bob","value":80}]'},
    postCondition: {$: 'boolean<common>jqBoolean', exp: 'length == 2'}},
  {$: 'flow-elem<workflow>setCtxVar', goal: 'Keep rows', varName: 'rows', value: {$: 'data<common>jqSingle', exp: '.'}},
  {$: 'flow-elem<workflow>setCtxVar', goal: 'Keep sql', varName: 'sql', value: {$: 'data<common>jqSingle', exp: '"SELECT name, value FROM t"'}},
  {$: 'flow-elem<workflow>setCtxData', goal: 'Return explorable answer',
    value: {$: 'data<common>jqSingle', exp: '{ text: "**Top senders**", narrative: "Alice leads.", sql: $sql, rows: $rows[0:50], widgets: [ { kind: "bar", title: "Senders", data: ($rows | map({name:.name, value:.value})), drill: {dimension: "sender", question: "Break {name} down by day"} } ], followUps: [ {label: "By day", question: "Break the top sender down by day"} ] }'},
    postCondition: {$: 'boolean<common>jqBoolean', exp: 'has("text") and (.widgets|type=="array")'}}
]}
\`\`\``),
    expectedResult: and(
      equals('Alice leads.', '%runRes/narrative%'),
      equals('SELECT name, value FROM t', '%runRes/sql%'),
      equals('Alice', '%runRes/rows/0/name%'),
      equals('sender', '%runRes/widgets/0/drill/dimension%'),
      contains('{name}', { allText: '%runRes/widgets/0/drill/question%' }),
      equals('By day', '%runRes/followUps/0/label%'))
  })
})

// ============================================================================
// APPLET RENDER — AnalyticsAssistantResponse renders markdown (bold survives as
// text), a follow-up chip, reveals SQL + a table on toggle, and never shows the
// deterministic narrative line.
// ============================================================================
const explorableElement = {
  id: 'a1', sender: 'Assistant', type: 'text',
  content: '## Revenue by campaign\n\nThe top campaign earned **$18.4K** this week.\n- Brand leads\n- Search second',
  narrative: 'Revenue is concentrated in the top campaign.',
  sql: 'SELECT campaign, revenue FROM sessions ORDER BY revenue DESC',
  rows: [{ campaign: 'Brand', revenue: 18400 }, { campaign: 'Search', revenue: 9200 }],
  widgets: [{ kind: 'bar', title: 'Revenue by campaign', valueFormat: '$', data: [{ name: 'Brand', value: 18400 }, { name: 'Search', value: 9200 }], drill: { dimension: 'campaign', question: 'Break {name} down by device' } }],
  followUps: [{ label: 'Top campaign by device', question: 'Break the top campaign down by device' }]
}

Test('reactTest.applet.explorableAnswer', {
  impl: reactTest({
    testedComp: (ctx, { react: { hh } }) => () => hh(ctx, AnalyticsAssistantResponse, { element: explorableElement, send: () => {} }),
    expectedResult: and(
      notContains('Revenue is concentrated in the top campaign.'), // narrative line is not rendered
      contains('Revenue by campaign'),                            // markdown heading + widget title
      contains('$18.4K'),                                         // bold metric survived markdown
      contains('Top campaign by device'),                        // follow-up chip label
      contains('SELECT campaign, revenue FROM sessions')),        // revealed SQL after toggle
    userActions: [delay(80), click('הצג SQL / נתונים'), delay(80)]
  })
})
