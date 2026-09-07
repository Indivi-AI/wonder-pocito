import { coreUtils, dsls } from '@jb6/core'
import '@jb6/testing'
import '@jb6/react/tests/react-testers.js'
import './wonder-platform-agent-wurl.js'
import './wonder-platform-agent-results.js'
import './wonder-platform-marketplace-wurl.js'

const {
  common: { Data, boolean: { and, contains, equals } },
  react: { ReactComp, 'react-comp': { comp } },
  test: { Test, test: { dataTest, reactTest } }
} = dsls
ReactComp('wonderPlatformAgentResultTestHost', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh}}) => () => h('div', {},
      hh(ctx, dsls.react['react-comp'].wonderPlatformAgentResult, {
        result: {harness: 'agno', text: 'Agno answer', runId: 'run-1', sessionId: 'session-1'}}),
      hh(ctx, dsls.react['react-comp'].wonderPlatformAgentResult, {
        result: {harness: 'llmflow', text: 'Flow answer', runId: 'flow-run', followUps: ['Next step'],
          runtimeSteps: [{kind: 'מודל'}]}}),
      hh(ctx, dsls.react['react-comp'].wonderPlatformRunTrace, {status: 'נכשל', steps: [
        {kind: 'כלי', title: 'run_flow', status: 'הושלם', input: {category: 'Audio'},
          output: {rows: Array.from({length: 7}, (_, index) => ({id: index + 1, name: `row-${index + 1}`}))}},
        {kind: 'מודל', title: 'תשובה סופית', status: 'נכשל', error: 'Model timeout'}]}))
  })
})
Test('wonderPlatform.agentWUrlRejectsLlmFlow', {
  impl: dataTest({
    calculate: async ctx => {
      const response = await dsls.common.data.wonderPlatformAgentWUrlResponse.$runWithCtx(ctx, {
        url: 'room://room-a/agent/agent-a?harness=llmflow', fileName: 'agent/agent-a',
        opts: {method: 'POST', body: {message: 'Question'}}
      })
      const result = await response.json()
      return {status: response.status, result, ...coreUtils.harvestLogs(ctx)}
    },
    expectedResult: and(
      equals('%status%', 400),
      equals('%result/detail%', 'harness must be agno'),
      equals('%agentLogger/agentLog/0/t%', 'agentWUrl')
    ),
    logger: 'agentLogger'
  })
})
Test('wonderPlatform.agentWUrlAgno', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async ctx => {
      const {createServer} = await import('node:http')
      const server = createServer((request, response) => {
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({content: `${request.method} ${request.url} room=${request.headers['x-wonder-room']}`,
          model: request.headers['x-wonder-model'], run_id: 'run-1', status: 'COMPLETED'}))
      })
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
      try {
        const result = await dsls.common.data.wonderPlatformAgentWUrlRequest.$runWithCtx(ctx.setVars({selectedModel: 'minimax-skynet'}), {
          agentId: 'agent-a', message: 'Question', sessionId: 'session-1', roomWUrl: 'room://room-a',
          baseUrl: `http://127.0.0.1:${server.address().port}`
        })
        return {result, ...coreUtils.harvestLogs(ctx)}
      } finally { await new Promise(resolve => server.close(resolve)) }
    },
    expectedResult: and(
      equals('%result/harness%', 'agno'),
      equals('%result/run_id%', 'run-1'),
      equals('%result/sessionId%', 'session-1'),
      equals('%result/model%', 'minimax-skynet'),
      contains('/agents/agent-a/runs room=room-a', { allText: '%result/content%' }),
      equals('%agentLogger/agentLog/0/t%', 'agentWUrl')
    ),
    timeout: 10000,
    logger: 'agentLogger,marketplaceLogger'
  })
})
Test('wonderPlatform.agentResultComponents', {
  impl: reactTest({$: 'react-comp<react>wonderPlatformAgentResultTestHost'},
    and(contains('תשובת AgentOS'), contains('run-1'), contains('תשובת LLM Flow'), contains('Next step'),
      contains('5 מתוך 7 שורות'), contains('Model timeout'), contains('run_flow')))
})
Test('wonderPlatform.runtimeStepsReflectAgentOs', {
  impl: dataTest({
    calculate: ctx => dsls.common.data.wonderPlatformRuntimeSteps.$runWithCtx(ctx, {run: {status: 'COMPLETED', content: 'Done', tools: [
      {tool_name: 'search_knowledge_base', tool_args: {query: 'refund'}, result: '{"matches":[1]}', metrics: {duration: 0.2}},
      {tool_name: 'get_skill_instructions', tool_args: {skill_name: 'support'}, result: 'Use policy'},
      {tool_name: 'run_flow', tool_args: {category: 'Audio'}, result: '{"rows":[1,2]}', tool_call_error: false}
    ]}}),
    expectedResult: and(equals('%0/kind%', 'ידע'), equals('%1/kind%', 'מיומנות'), equals('%2/kind%', 'כלי'),
      equals('%2/input/category%', 'Audio'), equals('%2/output/rows/1%', 2), equals('%3/kind%', 'מודל'), equals('%3/output%', 'Done'))
  })
})
Test('wonderPlatform.agentUsesAgno', {
  impl: dataTest({
    calculate: ctx => dsls.common.data.wonderPlatformRunAgent.$runWithCtx(ctx, {
      text: 'Question', target: {id: 'agent-a', backendConfig: {harness: 'llmflow'}},
      request: () => ({harness: 'agno', content: 'Agno answer', runId: 'agno-run'})
    }),
    expectedResult: and(equals('%harness%', 'agno'), equals('%text%', 'Agno answer'), equals('%runId%', 'agno-run'))
  })
})
