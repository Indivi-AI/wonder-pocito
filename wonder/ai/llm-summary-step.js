import { jb, dsls } from '@jb6/core'
import '@jb6/llm-guide'
import './llm-flow-core.js'
import { fetchItemsFromLLMReactiveP } from '@wonder/ai/reactive-llm.js'

const {
  tgp: { Component },
  common: { Data },
  'llm-guide': { Doclet,
    doclet: { dataComp, howTo },
    explanationPoint: { explanation, syntax, whenToUse },
    guidance: { doNot, example, mustDo, solution },
    problemStatement: { problem }
  },
  ai: { Mpi,
    mpi: { mpi }
  }
} = dsls

const { docletContent } = jb.workflowUtils
const SUMMARY_STR_LIMIT = 220
const OMIT_SUMMARY_KEYS = new Set('widgets reactComps explainer'.split(' '))
const OMIT_SUMMARY_KEY = /chart|promo_items|previous_identical_promos|html|base64|imageUrl/i
const ROW_SUMMARY_KEY = new RegExp(
  'name|title|date|window|branch|category|product|item|promo|count|qty|units|sales|revenue|net|profit|loss|margin|growth|lift|'
  + 'stock|rate|pct|percent|ils|avg|sum|active|low|high|min|max|score|warning|label', 'i')
const compactSummaryValue = (v, depth = 0, key = '') => {
  // caveats are the model's license to explain coverage gaps - truncating one mid-sentence destroys exactly that
  if (v == null || typeof v != 'object') return typeof v == 'string' && v.length > SUMMARY_STR_LIMIT && !/caveat/i.test(key) ? v.slice(0, SUMMARY_STR_LIMIT) + '...' : v
  if (Array.isArray(v)) return v.slice(0, key == 'rows' ? 8 : depth ? 6 : 20).map(x => compactSummaryValue(x, depth + 1, key))
  const entries = Object.entries(v).filter(([k, val]) => val != null && !OMIT_SUMMARY_KEYS.has(k) && !OMIT_SUMMARY_KEY.test(k))
  return Object.fromEntries((key == 'rows' || depth > 4 ? entries.filter(([k, val]) => ['number','boolean'].includes(typeof val) || ROW_SUMMARY_KEY.test(k)).slice(0, 22) : entries)
    .map(([k, val]) => [k, compactSummaryValue(val, depth + 1, k)]))
}
const evalPaths = evaluation => [...new Set([...String(evaluation).matchAll(/\b[A-Za-z_]\w*(?:[/.][A-Za-z_]\w*)+\b/g)].map(x => x[0]))]
const pathVal = (vars, path) => path.split(/[/.]/).reduce((o, k) => o?.[k], vars)
const summaryVarEntries = (trace, evaluation = '') => {
  const vars = jb.workflowUtils.getWorkflowVars(trace), paths = evalPaths(evaluation).filter(p => pathVal(vars, p) != null), roots = new Set(paths.map(p => p.split(/[/.]/)[0]))
  return [...paths.map(p => [p, pathVal(vars, p)]), ...Object.entries(vars).reverse()
    .filter(([k]) => !roots.has(k))
    .sort(([a], [b]) => Number(String(evaluation).includes(b)) - Number(String(evaluation).includes(a)))]
}
const summaryJson = v => JSON.stringify(compactSummaryValue(v))
const conversationContextText = (context, maxSize = 200000) => {
  const text = context && JSON.stringify(context)
  return !text || text.length <= maxSize ? text || '' : summaryJson(context).slice(0, maxSize)
}
const tagText = (s, tag) => String(s || '').match(new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*<\\/${tag}>`, 'i'))?.[1]?.trim()
const parseSummaryBody = body => {
  const shortAnswer = tagText(body, 'SHORT_ANSWER'), longAnswer = tagText(body, 'LONG_ANSWER')
  return shortAnswer || longAnswer ? { text: shortAnswer || longAnswer, longText: longAnswer || '' } : body?.trim()
}
const summaryText = s => {
  s = String(s || '')
  const body = s.match(/<LLM_SUMMARY>\s*([\s\S]*?)\s*<\/LLM_SUMMARY>/i)?.[1]?.trim()
    || s.match(/<LLM_SUMMARY>\s*([\s\S]*?)(?:<LLM_SUMMARY>|$)/i)?.[1]?.trim()
  return body ? parseSummaryBody(body) : (!/^\s*(\{\}|{"type":"error")\s*/.test(s) && s.trim())
}

const llmSummaryMpi = Mpi('llmSummaryMpi', {
  impl: mpi('gemini/gemini-3.5-flash', {
    prompt: `%$TODAYS_DATE% ,
#GOAL   
%$goal%
%$includeSourceRefs%

#DATA
%$inputData%
%$flowVarsSection%

#CONVERSATION_CONTEXT
%$conversationContext%

#EVALUATION
%$evaluation%

#ORIGINAL_USER_MESSAGE
%$userMessage%
`,
    instructions: '%$llmSummaryDoclet%'
  })
})

Component('llmSummary', {
  params: [
    {id: 'includeSourceRefs', as: 'boolean'},
    {id: 'summaryCategories', as: 'string', options: 'dataInsights'},
    {id: 'evaluation', as: 'text'},
    {id: 'maxInputSize', as: 'number', defaultValue: 50000},
    {id: 'model', as: 'string', defaultValue: '%$summaryModel%'},
    {id: 'mpi', type: 'mpi<ai>', defaultValue: llmSummaryMpi()}
  ],
  impl: async (__ctx,{flowIndex, workflowLogger,userMessage},
      {mpi, model, summaryCategories,evaluation,maxInputSize, includeSourceRefs}) => {
    // roomId as category lets a room define its own answer-style doclet, e.g. llmSummary.dataInsights.comax
    const categories = summaryCategories.split(',').reduce((acc,c) => {acc[c] = true; return acc},
      {llmSummary: true, ...(__ctx.vars.roomId ? {[__ctx.vars.roomId]: true} : {})})
    const _ctx = __ctx.setVars({evaluation, categories})
    let res

    let inputData, flowVarsSection = '', conversationContext = ''
    try {
      inputData = _ctx.data && summaryJson(_ctx.data)
      conversationContext = conversationContextText(_ctx.vars.accumulatedContext)
      // the vars the flow kept via setCtxVar - a computed slice there is usually the direct answer basis
      const varsEntries = summaryVarEntries(workflowLogger?.workflowTrace, evaluation)
      flowVarsSection = !varsEntries.length ? '' : [
        '\n#FLOW_VARS - compact named results this flow kept; vars named in EVALUATION appear first. Ground the answer in the named var before UI payloads.',
        ...varsEntries.map(([k, v]) => `${k}: ${summaryJson(v)}`)].join('\n').slice(0, maxInputSize)
      workflowLogger?.info?.({t: 'llmSummary input', flowVarNames: varsEntries.map(([k]) => k),
        inputChars: inputData?.length, flowVarsChars: flowVarsSection.length,
        conversationContextChars: conversationContext.length}, {}, {ctx: _ctx})
    } catch {
      workflowLogger.error({t: 'llmSummary JSON.stringify failed'}, {data: _ctx.data}, {ctx: _ctx})
      return { error: 'invalid input data for llmSummary' }
    }
    if (!inputData) {
      workflowLogger.error({t: 'llmSummary no input'}, {}, {ctx: _ctx})
      return { error: 'no input for llmSummary' }
    }

    if (inputData.length > maxInputSize) {
      workflowLogger.info({t: `llmSummary input is too large, cutting to ${maxInputSize} chars` , maxInputSize, inputChars: inputData.length}, {}, {ctx: _ctx})
      inputData = inputData.slice(0,maxInputSize)
    }
    const [llmSummaryDoclet, essentialOutputFormat] = await Promise.all([
      docletContent('llmSummary', _ctx), docletContent('essentialOutputFormat', _ctx)])
    const ctx = _ctx.setVars({ includeSourceRefs: includeSourceRefs ? 'include source refs' : '',
      inputData, flowVarsSection, conversationContext, llmSummaryDoclet, essentialOutputFormat, userMessage })
    try {
      let lastResponseText
      for (const m of [...new Set([model || mpi.model(ctx), ctx.vars.flowModel].filter(Boolean))]) {
        const {responseText} =  await fetchItemsFromLLMReactiveP({
          ctx, model: m, goal: 'final generated text response',
          prompt: mpi.prompt(ctx), maxTokens: 1200, temperature: 0, thinkingBudget: 0,
          instructions: [mpi.instructions(ctx), essentialOutputFormat].filter(Boolean).join('\n\n')
        })
        lastResponseText = responseText
        res = summaryText(responseText)
        if (res) break
        workflowLogger.info({t: 'llmSummary retrying after missing tags', model: m}, {responseText: responseText?.slice(0,500)}, {ctx})
      }
      if (!res) {
        workflowLogger.error({t: 'llmSummary missing tags'}, {responseText: lastResponseText?.slice(0,500)}, {ctx})
        res = { error: 'llmSummary: LLM response missing <LLM_SUMMARY> tags' }
      }
    } catch (error) {
      workflowLogger.error({t: 'llmSummary failed'} ,{}, {error,ctx})
      res = { error: error.stack || String(error) }
    }
    workflowLogger.workflowTrace.push({flowIndex, output: res})
    return res
  }
})

Object.assign(jb.workflowUtils, { compactLLMSummaryValue: compactSummaryValue,
  llmSummaryVarEntries: summaryVarEntries, llmSummaryText: summaryText,
  conversationContextText })

Doclet('llmSummaryDataComponent', {
  impl: dataComp('llmSummary', {
    guidance: example(`
Component('llmSummary', {
  type: 'data<common>',
  params: [
    {id: 'goal', as: 'string'},
    {id: 'summaryCategories', as: 'string', options: 'dataInsights'},
    {id: 'evaluation', as: 'text'},
    {id: 'includeSourceRefs', as: 'boolean'}
  ]
})

{$: 'flow-elem<ai>setCtxData',
  goal: 'Summarize data insights',
  value: {$: 'data<common>llmSummary',
    goal: 'Summarize insights',
    summaryCategories: 'dataInsights'
  },
  postCondition: {$: 'boolean<common>jqBoolean', exp: '(type == "string" and length > 0) or (.text | type == "string" and length > 0)'}
}
`),
    explaination: [
      explanation('Input = current ctx data + a #FLOW_VARS section with vars kept via setCtxVar; write evaluation to NAME the exact kept var/path the answer must use'),
      explanation('Runtime compacts UI-heavy payloads before the LLM call; name paths like reportResult/results, rows, or branchRows so only the needed subtree is placed first'),
      syntax('summaryCategories: "dataInsights"', 'extract trends from numerical data'),
      whenToUse('Generating a user-facing answer when simple processing is not enough')
    ]
  })
})

Doclet('essentialOutputFormat.llmSummary', {
  impl: howTo(
    problem('Ensure LLM output can be parsed into short and expanded answers'),
    solution({
      points: [
        explanation('Wrap your entire summary response in <LLM_SUMMARY></LLM_SUMMARY> tags'),
        explanation('The first non-whitespace characters must be <LLM_SUMMARY>; do not use markdown fences, '
          + 'JSON, headers, or explanations outside the tags'),
        explanation('The closing tag must be exactly </LLM_SUMMARY> with the slash'),
        explanation('Inside it, write <SHORT_ANSWER> as exactly one user-facing word and <LONG_ANSWER> '
          + 'as the fuller answer, usually 3-4 concise sentences like the old answer'),
        explanation('This SHORT_ANSWER length overrides category, evaluation, or agent-specific guidance'),
        syntax('<LLM_SUMMARY><SHORT_ANSWER>Excellent.</SHORT_ANSWER><LONG_ANSWER>Three to four concise sentences.</LONG_ANSWER></LLM_SUMMARY>',
          'required format for parser')
      ]
    })
  )
})


Doclet('llmSummary.dataInsights', {
  impl: howTo(
    problem('Extract meaningful insights from numerical and structured data'),
    solution({
      points: [
        explanation('The input you receive is already pre-aggregated compact data (grouped counts/sums/avg, '
          + 'a top-N), not raw rows - read it as summary statistics'),
        explanation('#FLOW_VARS holds the named intermediate results the flow kept - if the EVALUATION references '
          + 'a var/path by name, ground the answer in THAT var/path, not in broader data'),
        explanation('Follow essentialOutputFormat for SHORT_ANSWER; put the fuller 3-4 sentence explanation in LONG_ANSWER'),
        explanation('Treat current #DATA and #FLOW_VARS as authoritative; use #CONVERSATION_CONTEXT to resolve '
          + 'follow-ups and stay consistent with prior user-visible facts; state scope changes explicitly'),
        explanation('For report flows, write evaluation with reportResult/results or reportResult/results/sections '
          + 'so llmSummary receives only report data, never widget/reactComp render payloads'),
        explanation('Include specific numbers and ranges from the data'),
        explanation('Format every number in SHORT_ANSWER/LONG_ANSWER with exactly 2 decimals, preserving the column '
          + 'unit/scale and thousands separators - 243179 -> 243,179.00; -156.54136 -> -156.54; no K/M/B rescaling '
          + 'unless the column name states the scale (e.g. net_M)'),
        explanation('Call out the key extremes explicitly - the max and the min - and any notable outlier'),
        explanation('Identify trends, not just current state snapshots'),
        explanation('Point out outliers or unexpected patterns worth attention'),
        explanation('Connect data points to actionable recommendations'),
        whenToUse('When summarizing analytics, metrics, or quantitative results')
      ]
    })
  )
})
