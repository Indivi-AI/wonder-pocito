import { coreUtils, dsls } from '@jb6/core'
import '@jb6/testing'
import '@jb6/react/automation.js'
import '@wonder/db/db-drivers-s3-minio.js'
import './room-state-react-comp.js'
import './stable-chat-react-comp.js'
import './llm-flow-react-comp.js'
import './wfetch2-guide-react-comp.js'
import './json-file-import-guide-react-comp.js'
import './enrich-ctx-guide-react-comp.js'

const {
  common: { data: { asIs }, boolean: { equals } },
  react: { ReactComp, UiAction, 'react-comp': { comp } },
  test: { Test, test: { dataTest } }
} = dsls

Test('reactCompExamples.registry', {
  impl: dataTest({
    calculate: () => ({ result: {
      store: !!coreUtils.compByFullId('data<common>pocitoRoomJsonStore'),
      roomState: !!coreUtils.compByFullId('react-comp<react>roomStateExample'),
      stableChat: !!coreUtils.compByFullId('react-comp<react>stableChatExample'),
      composer: !!coreUtils.compByFullId('react-comp<react>stableChatComposerExample'),
      llmFlow: !!coreUtils.compByFullId('react-comp<react>llmFlowExample'),
      answer: !!coreUtils.compByFullId('data<common>llmFlowExampleAnswer'),
      wfetch2: !!coreUtils.compByFullId('react-comp<react>wfetch2Guide'),
      fileImport: !!coreUtils.compByFullId('react-comp<react>jsonFileImportGuide'),
      enrichCtx: !!coreUtils.compByFullId('react-comp<react>enrichCtxGuide')
    } }),
    expectedResult: equals('%result%', asIs({
        store: true,
        roomState: true,
        stableChat: true,
        composer: true,
        llmFlow: true,
        answer: true,
        wfetch2: true,
        fileImport: true,
        enrichCtx: true
    }))
  })
})

Test('reactCompExamples.roomStoreRoundTrip', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async (ctx, {testSessionId}) => {
      const store = dsls.common.data.pocitoRoomJsonStore.$runWithCtx(ctx, {
        roomWUrl: 'room:minio//pocito-react-comp-examples-test', assetPath: 'tests/' + testSessionId + '/items'
      })
      const seed = { version: 1, items: [{ id: 'i1', name: 'ראשון' }] }
      await store.load(seed)
      const added = { ...seed, items: [...seed.items, { id: 'i2', name: 'שני' }] }
      await store.save(added)
      const edited = { ...added, items: added.items.map(item => item.id === 'i2' ? { ...item, name: 'שני ערוך' } : item) }
      await store.save(edited)
      await store.save({ ...edited, items: edited.items.filter(item => item.id !== 'i1') })
      const stored = await store.load(seed)
      return { result: { count: stored.items.length, id: stored.items[0].id, name: stored.items[0].name }, ...coreUtils.harvestLogs(ctx) }
    },
    expectedResult: equals('%result%', asIs({count: 1, id: 'i2', name: 'שני ערוך'})),
    timeout: 10000,
    logger: 'dbLogger'
  })
})

Test('reactCompExamples.llmFlowGrounding', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: async ctx => {
      const repo = dsls.common.data.wonderPlatformSeed.$run(), plugin = repo.plugins[0]
      const answer = await dsls.common.data.llmFlowExampleAnswer.$runWithCtx(ctx, {
        question: 'האם תוכנית שחר מוכנה? החזר את הדוח המאומת.', plugin, repo
      })
      return { ok: !!answer.text && answer.reportIds.every(id => repo.reports.some(report => report.id === id)), answer,
        ...coreUtils.harvestLogs(ctx) }
    },
    expectedResult: equals('%ok%', true),
    timeout: 180000,
    logger: 'workflowLogger'
  })
})

ReactComp('stableChatExampleTestHost', {
  impl: comp({
    hFunc: ctx => {
      const Chat = dsls.react['react-comp'].stableChatExample.$runWithCtx(ctx, { roomWUrl: 'room:minio//pocito-stable-chat-example-test' })
      return () => ctx.vars.react.h(Chat)
    }
  })
})

UiAction('stableChatExampleFocus', {
  impl: () => ({
    async exec({vars: {win}}) {
      const wait = (check, timeout = 5000) => new Promise((resolve, reject) => {
        const started = Date.now(), poll = () => {
          const result = check()
          result ? resolve(result) : Date.now() - started > timeout ? reject(new Error('stable chat timeout')) : win.setTimeout(poll, 40)
        }
        poll()
      })
      const input = await wait(() => win.document.querySelector('[data-testid=stable-chat-input]'))
      const before = win.document.querySelectorAll('[data-message-role=user]').length
      const setValue = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, 'value').set
      let value = ''
      input.focus()
      for (const char of 'כל התווים נשמרים והמיקוד נשאר יציב') {
        value += char
        setValue.call(input, value)
        input.dispatchEvent(new win.Event('input', { bubbles: true }))
        await new Promise(resolve => win.setTimeout(resolve, 8))
        if (input.value !== value || win.document.activeElement !== input) throw new Error('stable composer remounted')
      }
      input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }))
      if (win.document.querySelectorAll('[data-message-role=user]').length !== before) throw new Error('Shift+Enter sent the message')
      input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await wait(() => win.document.querySelectorAll('[data-message-role=user]').length === before + 1)
      if (!win.document.querySelector('[data-testid=stable-chat-input]')) throw new Error('composer collapsed after send')
    }
  })
})
