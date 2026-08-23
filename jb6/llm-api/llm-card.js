import { dsls, coreUtils, jb, ns } from '@jb6/core'

import '@jb6/react/tailwind-utils.js'
import './llm-api.js'
import './llm-models.js'
import '@jb6/jq'
// import '@jb6/rx'
// import '@jb6/rx/rx-common.js'
import '@jb6/common'

import { parse } from '@jb6/lang-service/lib/acorn-loose.mjs'
import './llm-card-examples.js'

const { jq, jbjq } = coreUtils

const {
    tgp: {'ctx-enricher': {Var}, any : {If }}, 
    'llm-api': { Prompt,
        prompt: { prompt, user, system, tailwindChartGuide},
        model: {llama_33_70b_versatile, gpt_oss_120b, claude_code_sonnet_4, llama_guard_4_12b}
    },
    
    common: { Data,
        data: { pipe, tailwindHtmlToPng, obj, asIs, first },
        prop: { prop }
     },
} = dsls

const { rx, llm, subject } = ns

Prompt('llm.card', {
  circuit: 'llmCardTest.profitableProductsPng',
  params: [
    {id: 'prompt', as: 'text'},
    {id: 'DBSchema', as: 'text'}
  ],
  impl: prompt(
    system(`You are an API. you can not speak to the user. Generate React components using jq + h function. Use + for strings, no backticks.
        keep the format like the examples. we parse the js code and expect this pattern.
        ***please add extra parentheses*** for anything in the jq expression: calculated fields, condition expression, etc
        use ***only**** this functions in jq. other funcs are not supported: length, keys, has, in, type, del, empty, select, arrays GitHub, objects, booleans, numbers, strings, nulls, map, map_values, sort, sort_by, explode, implode, split, join, 
        add, add/1, to_entries, from_entries, with_entries, walk/1, range/1, range/2, range/3, any/0, any/1, any/2, all/0, all/1, all/2, 
        contains, inside, path, getpath/1, setpath/2, delpaths/1, pick/1, trim/0, ltrim/0, rtrim/0, trimstr/1, ltrimstr/1, rtrimstr/1, 
        first, last, nth/1, first/1, last/1, nth/2, limit/2, skip/2, sub/1, sub/2, gsub/1, gsub/2, test/1, test/2, split/2, capture/1, 
        capture/2, match/1, match/2, splits/1, splits/2, ascii_upcase/1, ascii_downcase/1, tostring, tonumber, toboolean, tojson, fromjson


EXAMPLE 1 - With filtering:
(ctx) => {
const data = jq('.customers | map(select(.tier == "gold"))', ctx)
return h('div:flex flex-wrap gap-3', {},
  ...data.map(c => h('div:border p-3', {},
    h('h4', {}, c.name),
    h('span:text-sm', {}, 'Spent: $' + c.total_spent)
  ))
)
}

EXAMPLE 2 - Complex query:
(ctx) => {
const data = jq('.orders | map(select((.quantity > 0) and (.total_amount > 0)) ) | sort_by(.total_amount) | reverse', ctx)
return h('div:space-y-2', {},
  ...data.map(order => h('div:bg-gray-100 p-2 hover:bg-gray-200', {},
    h('p:font-medium', {}, order.customer_name),
    h('p:text-green-600', {}, 'Amount: $' + order.total_amount)
  ))
)
}

EXAMPLE 3 - With calculated fields:
(ctx) => {
const data = jq('.orders | map(select(.status == "completed") | . + {profit_margin: (((.total_amount - .cost) / .total_amount) * 100)}) | sort_by(.profit_margin) | reverse | .[0:10]', ctx)
return h('div:grid gap-3', {},
  ...data.map(order => h('div:bg-white p-3 border', {},
    h('h4:font-bold', {}, 'Order #' + order.order_id),
    h('p:text-green-600', {}, 'Profit: ' + order.profit_margin.toFixed(1) + '%'),
    h('p:text-sm', {}, order.customer_name)
  ))
)
}

***please add extra parentheses*** for anything: calculated fields, condition expression, etc

Follow these patterns exactly.
ensure the jq code uses the same table and field names as in the schema!! 
do not exceed 300 tokens. 
do not use js section, start with "(ctx) => {".
`),
    tailwindChartGuide(),
    user('DATABASE SCHEMA by example: %$DBSchema%'),
    user('%$prompt%')
  )
})
  
const compileAndRunCard = Data('compileAndRunCard', {
  params: [
    {id: 'db', as: 'object'}
  ],
  impl: (ctx,{},{db}) => {
        const code = ctx.data
        let jqExp, compiled, dataForUi
        try {
            const ast = parse(code, { ecmaVersion:"latest", sourceType:"module", ranges:true })
            jqExp = ast.body[0]?.expression?.body?.body[0]?.declarations[0]?.init?.arguments[0]?.value
            if (!jqExp) return {error: 'can not extract jq expression', code }
        } catch (error) {
            return { error: { code, message: error || error.message } }
        }

        try {
            compiled = jq.compileJb(jqExp)
        } catch (error) {
            return { error: { jqExp, message: 'compile jq error: ' + (error || error.message) } }
        }
        try {
            debugger    
            dataForUi = [...compiled(ctx.setData(db))][0]
        } catch (error) {
            return { error: { jqExp, message: 'run jq error: ' + (error || error.message), db } }
        }
        if (!dataForUi || Array.isArray(dataForUi) && !dataForUi.length)
            return { error: 'empty result' }

        let html
        const h = jb.tailwindUtils.h
        try {
            const func = (new Function('h', 'jq', `return ${code}`))(h,jbjq)
            const vdom = func(ctx.setData(db))
            html = vdom.toHtml()
            //console.log(html)
            return { code, html, dataForUi }
        } catch (error) {
            return {error: {dataForUi, db, jqExp, code, html, message: error.stack || error} }
            //onError(ctx.setData(error.message))
        }
    }
})

const retryOnError= Data('retryOnError', {
  params: [
    {id: 'calc', dynamic: true},
    {id: 'retries', as: 'number', defaultValue: 3}
  ],
  impl: async (ctx,{},{calc, retries}) => {
    let error, res, tries = 0
    while ((!res || res?.error) && tries < retries) {
        tries++
        res = await calc(ctx)
        if (res.error) {
            error = error || { errors: [] }
            error.errors.push(res.error)
        }
    }
    return { ...res, error }
  }
})

Data('llm.cardToPng', {
  circuit: 'llmCardTest.profitableProductsPng',
  params: [
    {id: 'prompt', as: 'text'},
    {id: 'DBSchema', as: 'text'},
    {id: 'db', as: 'object'}
  ],
  impl: pipe(
    retryOnError(pipe(
      llm.completions(llm.card('%$prompt%', '%$DBSchema%'), llama_guard_4_12b(), { maxTokens: 1000 }),
      compileAndRunCard('%$db%'),
      first()
    )),
    If('%error%', '%%', tailwindHtmlToPng('%html%')),
    first()
  )
})
