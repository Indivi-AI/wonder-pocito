import { jb, dsls } from '@jb6/core'
import '@jb6/testing'
import '@wonder-admin/agents/app/chat-ui.js'
import '@wonder-admin/agents/react-comp-creator/react-comp-creator.js'

const {
  tgp: { Component, 'ctx-enricher': { Var } },
  test: { Test, test: { dataTest } },
  common: {
    data: { pipe, seedRoomCompFromModule, fetchReactCompSource, evalReactCompSource, sectionedCompSource, mergeCompEdits },
    boolean: { and, equals, contains }
  },
  workflow: { workflow: { reactCompCreator } }
} = dsls

Test('reactCompCreator.roomRoundTrip', {
  impl: dataTest({
    vars: [Var('db', 'fs'), Var('roomId', 'idf')],
    calculate: pipe(
      seedRoomCompFromModule('admin/agents/app/chat-ui.js', 'room://idf/reactComps/chatUi.js'),
      fetchReactCompSource('room://idf/reactComps/chatUi.js'),
      evalReactCompSource('chatUi')
    ),
    expectedResult: equals(true, '%0/registered%'),
    logger: 'dbLogger'
  })
})

Test('reactCompCreator.sectionedSource', {
  impl: dataTest(sectionedCompSource('const A = 1\nReactComp(\'x\', { impl: 2 })'),
    contains('// SECTION A\nconst A = 1\n// SECTION ReactComp.x'))
})

Test('reactCompCreator.sectionMerge', {
  impl: dataTest({
    calculate: mergeCompEdits({
      base: 'const A = 1\nReactComp(\'x\', { impl: 2 })\nconst B = 3',
      edits: 'prose around the fences\n```js\n// EDIT ReactComp.x\nReactComp(\'x\', { impl: 9 })\n```'
    }),
    expectedResult: equals('const A = 1\nReactComp(\'x\', { impl: 9 })\nconst B = 3')
  })
})

Test('reactCompCreator.noChanges', {
  impl: dataTest({
    calculate: mergeCompEdits({ base: 'const A = 1', edits: 'NO_CHANGES - the title is already Wonder OS' }),
    expectedResult: equals('const A = 1')
  })
})

Test('reactCompCreator.wholeFileRejected', {
  impl: dataTest({
    calculate: mergeCompEdits({ base: 'const A = 1\nconst B = 2', edits: '```javascript\nconst A = 9\nconst B = 2\n```' }),
    expectedResult: contains('// EDIT', { allText: '%error%' })
  })
})

const reactCompEditTest = Component('reactCompEditTest', {
  type: 'test<test>',
  description: 'seed the room chatUi source, run the reactCompCreator agent on userMessage, assert on {ok, source} of the resulting room file',
  params: [
    {id: 'userMessage', as: 'string'},
    {id: 'expectedResult', type: 'boolean<common>', dynamic: true}
  ],
  impl: dataTest({
    calculate: async (_ctx, {}, { userMessage }) => {
      const ctx = _ctx.setVars({ db: 'fs', isLocalHost: true, roomId: 'idf', userId: 'idfTester', userMessage, accumulatedContext: { chatHistory: [] } })
      await ctx.run(seedRoomCompFromModule('admin/agents/app/chat-ui.js', 'room://idf/reactComps/chatUi.js'))
      const workflowCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx)
      const { runRes, adminUrl } = await reactCompCreator.$run().calcWorkflow(workflowCtx)
      const source = await ctx.run(fetchReactCompSource('room://idf/reactComps/chatUi.js'))
      return { ok: runRes?.ok, error: runRes?.error, adminUrl, source }
    },
    expectedResult: '%$expectedResult()%',
    timeout: 180000,
    logger: 'workflowLogger',
    allowError: true
  })
})

Test('reactCompCreator.makeBlue', {
  impl: reactCompEditTest('make the app blue', and(equals(true, '%ok%'), contains('bg-blue', { allText: '%source%' })))
})
