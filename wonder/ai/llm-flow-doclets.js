import { dsls } from '@jb6/core'
import '@jb6/common'
import '@jb6/llm-guide'
import './llm-flow-core.js'
import './duckdb-sql-step.js'

const {
  'llm-guide': { Booklet, Doclet, booklet: { booklet } }
} = dsls

Booklet('llmFlow', {
  impl: booklet(`
    TGP,llmFlow,
    duckDbSqlDataComponent,llmSqlDataComponent,llmSummaryDataComponent,asHumanFeedbackFlowElem,agentLoopComponents,
    essentialOutputFormat`)
})

Doclet('TGP', {
  impl: `
// TGP: TgpType (abstract type), Component (generic def), Profile (concrete JSON instance)
TgpType('color', 'css')

Component('rgb', { type: 'color<css>', params: [{id: 'r', as: 'number'}, {id: 'g', as: 'number'}, {id: 'b', as: 'number'}] })
Component('hsl', { type: 'color<css>', ... })

TgpType('gradient', 'css')
Component('linearGradient', { type: 'gradient<css>', params: [{id: 'direction', as: 'string'}, {id: 'stops', type: 'color<css>[]'}] })
Component('radialGradient', { type: 'gradient<css>', ... })
...

// Profile: linear-gradient(to right, rgb(255,99,71), hsl(45,100,50))
{$: 'gradient<css>linearGradient', direction: 'to right', stops: [{$: 'color<css>rgb', r: 255, g: 99, b: 71}, {$: 'color<css>hsl', h: 45, s: 100, l: 50}]}

`
})

Doclet('llmFlow', {
  impl: `
// Workflow dsl 

imutable ctx:
'(ctx) => ctx.setVars/setData(...), modify context immutably'

TgpType('flow-elem', 'workflow', {typescript: 'async ctx => ctx'})

Component('flow', {
  type: 'flow-elem<workflow>',
  params: [
    {id: 'elems', type: 'flow-elem<workflow>[]' }
  ]
})

Component('setCtxData', {
  type: 'flow-elem<workflow>',
  params: [
    {id: 'goal', as: 'string'},
    {id: 'value', type: 'data<common>'},
    {id: 'postCondition', type: 'boolean<common>', as: 'boolean'},
  ]
})

Component('setCtxVar', {
  type: 'flow-elem<workflow>',
  params: [
    {id: 'goal', as: 'string'},
    {id: 'varName', as: 'string'},
    {id: 'value', type: 'data<common>'},
    {id: 'postCondition', type: 'boolean<common>', as: 'boolean'},
  ]
})

Component('jqArray', { // force array result
  type: 'data<common>',
  params: [
    {id: 'exp', as: 'text'},
  ],
})

Component('jqSingle', { // force single object result
  type: 'data<common>',
  params: [
    {id: 'exp', as: 'text'},
  ],
})

Component('jqBoolean', { // force boolean result
  // when using and|or inside jq expression remember to use parans on the left/right. e.g., (. >= $threshold) and (length(.) == 5)
  type: 'boolean<common>',
  params: [
    {id: 'exp', as: 'text'},
  ],
})

Component('duckDbSql', {
  type: 'data<common>',
  params: [
    {id: 'sql', as: 'text'}
  ]
})

Component('asHumanFeedback', {
  type: 'flow-elem<workflow>',
  params: [
    {id: 'varName', as: 'string'},
    {id: 'question', as: 'string'},
    {id: 'mode', as: 'string'}, // single|multi
    {id: 'options', type: 'data<common>'}
  ]
})

// Example profile as JS object:
{$: 'flow-elem<workflow>flow', elems: [
  {$: 'flow-elem<workflow>setCtxVar',
    goal: 'Setup threshold',
    varName: 'threshold',
    value: {$: 'data<common>jqSingle', exp: '84'},
    postCondition: {$: 'boolean<common>jqBoolean', exp: '$threshold == 84'}
  },
  {$: 'flow-elem<workflow>setCtxData',
    goal: 'Load scores',
    value: {$: 'data<common>jqArray', exp: '[85, 92, 67, 94, 78]'},
    postCondition: {$: 'boolean<common>jqBoolean', exp: 'length(.) == 5'}
  },
  {$: 'flow-elem<workflow>setCtxData',
    goal: 'Filter scores above threshold',
    value: {$: 'data<common>jqArray', exp: 'map(select(. >= $threshold))'},
    postCondition: {$: 'boolean<common>jqBoolean', exp: 'all(. >= $threshold)'}
  }
]}
  `
})

Doclet('asHumanFeedbackFlowElem', {
  impl: `
Use asHumanFeedback only when the user gives a specific product, branch, customer or supplier name/phrase to filter and it can match 2+ real
entities; never when the entity is only a requested grouping/output dimension.
It emits a UI dropdown/multi-select and immediately continues; later elements automatically wait only when their profile references the pending
var by $varName in jq/TGP or %$varName.path% in string/SQL params.
The resolved var shape is {ids,id,sqlIn,sqlLabelsIn,labels,items}; use %$selectedProducts.sqlIn% for numeric ids,
%$selectedProducts.sqlLabelsIn% for item-name filters, and $selectedProducts.items in jq/llmSummary basis. Never use {{...}} for human feedback vars.
\`\`\`javascript
{$: 'flow-elem<workflow>asHumanFeedback',
  goal: 'Clarify exact products', status: 'מחפש מוצרים מתאימים...',
  varName: 'selectedProducts',
  question: 'לאיזה מוצר התכוונת?',
  mode: 'multi',
  options: {$: 'data<common>comaxEntityCandidates', entity: 'product', query: 'עגבניות שרי', limit: 12}
}
\`\`\`
`
})
