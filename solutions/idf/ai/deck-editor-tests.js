import { jb, dsls } from '@jb6/core'
import '@jb6/testing'
import '@wonder-admin/idf/idf-deck-host.js'

const {
  tgp: { Component, 'ctx-enricher': { Var } },
  test: { Test, test: { dataTest } },
  common: {
    data: { pipe, seedRoomCompFromModule, fetchReactCompSource, evalReactCompSource },
    boolean: { and, equals, contains, notContains }
  },
  workflow: { workflow: { deckEditor } }
} = dsls

Test('deckEditor.roomRoundTrip', {
  impl: dataTest({
    vars: [Var('db', 'fs'), Var('roomId', 'idf')],
    calculate: pipe(
      seedRoomCompFromModule('admin/idf/idf-deck.js', 'room://idf/reactComps/idfDeck.js'),
      fetchReactCompSource('room://idf/reactComps/idfDeck.js'),
      evalReactCompSource('idfDeck')
    ),
    expectedResult: equals(true, '%0/registered%'),
    logger: 'dbLogger'
  })
})

const deckEditTest = Component('deckEditTest', {
  type: 'test<test>',
  description: 'seed both room sources (deck + chat applet), run the deckEditor agent on userMessage, assert on {ok, route, deckSource, appletSource}',
  params: [
    {id: 'userMessage', as: 'string'},
    {id: 'expectedResult', type: 'boolean<common>', dynamic: true}
  ],
  impl: dataTest({
    calculate: async (_ctx, {}, { userMessage }) => {
      const ctx = _ctx.setVars({ db: 'fs', isLocalHost: true, roomId: 'idf', userId: 'idfTester', userMessage, accumulatedContext: { chatHistory: [] } })
      await ctx.run(seedRoomCompFromModule('admin/idf/idf-deck.js', 'room://idf/reactComps/idfDeck.js'))
      await ctx.run(seedRoomCompFromModule('admin/agents/app/chat-ui.js', 'room://idf/reactComps/chatUi.js'))
      const workflowCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx)
      const { runRes, routeTaken, adminUrl } = await deckEditor.$run().calcWorkflow(workflowCtx)
      const deckSource = await ctx.run(fetchReactCompSource('room://idf/reactComps/idfDeck.js'))
      const appletSource = await ctx.run(fetchReactCompSource('room://idf/reactComps/chatUi.js'))
      return { ok: runRes?.ok, error: runRes?.error, route: routeTaken?.[0], compId: runRes?.compId, adminUrl, deckSource, appletSource }
    },
    expectedResult: '%$expectedResult()%',
    timeout: 240000,
    logger: 'workflowLogger',
    allowError: true
  })
})

const runDeckEditor = async (_ctx, userMessage, chatHistory = []) => {
  const ctx = _ctx.setVars({ db: 'fs', isLocalHost: true, roomId: 'idf', userId: 'idfTester', userMessage, accumulatedContext: { chatHistory } })
  return deckEditor.$run().calcWorkflow(await jb.workflowUtils.extendWithWorkflowVars(ctx))
}

Test('deckEditor.answer', {
  impl: dataTest({
    calculate: async _ctx => {
      await _ctx.setVars({ db: 'fs', roomId: 'idf' }).run(seedRoomCompFromModule('admin/idf/idf-deck.js', 'room://idf/reactComps/idfDeck.js'))
      const { runRes, routeTaken } = await runDeckEditor(_ctx, 'what is this deck about?')
      return { route: routeTaken?.[0], answer: typeof runRes == 'string' ? runRes : '' }
    },
    expectedResult: and(equals('answer', '%route%'), contains('Wonder', { allText: '%answer%' })),
    timeout: 120000,
    logger: 'workflowLogger',
    allowError: true
  })
})

Test('deckEditor.revert', {
  impl: dataTest({
    calculate: async _ctx => {
      const seedCtx = _ctx.setVars({ db: 'fs', roomId: 'idf' })
      await seedCtx.run(seedRoomCompFromModule('admin/idf/idf-deck.js', 'room://idf/reactComps/idfDeck.js'))
      const r1 = await runDeckEditor(_ctx, 'make the slide titles green')
      const midSource = await seedCtx.run(fetchReactCompSource('room://idf/reactComps/idfDeck.js'))
      const r2 = await runDeckEditor(_ctx, 'revert', [{ role: 'user', content: 'make the slide titles green' },
        { role: 'assistant', content: 'Updated idfDeck ✓' }])
      const endSource = await seedCtx.run(fetchReactCompSource('room://idf/reactComps/idfDeck.js'))
      return { ok1: r1.runRes?.ok, midGreen: String(midSource).includes('green'), ok2: r2.runRes?.ok,
        route2: r2.routeTaken?.[0], endGreen: String(endSource).includes('green') }
    },
    expectedResult: and(equals(true, '%ok1%'), equals(true, '%midGreen%'), equals(true, '%ok2%'),
      equals('editDeck', '%route2%'), equals(false, '%endGreen%')),
    timeout: 300000,
    logger: 'workflowLogger',
    allowError: true
  })
})

Test('deckEditor.slideText', {
  impl: deckEditTest('change the cover slide title from Wonder OS to Wonder OS 2', and(equals(true, '%ok%'),
    equals('editDeck', '%route%'), contains('Wonder OS 2', { allText: '%deckSource%' })))
})

Test('deckEditor.cssTitles', {
  impl: deckEditTest('make the slide titles green', and(equals(true, '%ok%'), equals('editDeck', '%route%'),
    contains('green', { allText: '%deckSource%' }), notContains('h2{margin:0;font-size:60px;font-weight:800;line-height:1.08;color:#fff}', {
      allText: '%deckSource%' })))
})

Test('deckEditor.noChangeRequest', {
  impl: deckEditTest('change the cover slide title to "Wonder OS"', and(equals(true, '%ok%'), equals('editDeck', '%route%')))
})

Test('deckEditor.appletBlue', {
  impl: deckEditTest('make the chat app send button blue', and(equals(true, '%ok%'), equals('editApplet', '%route%'),
    contains('bg-blue', { allText: '%appletSource%' })))
})
