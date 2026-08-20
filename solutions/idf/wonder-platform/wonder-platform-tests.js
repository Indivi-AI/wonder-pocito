import { coreUtils, dsls, jb } from '@jb6/core'
import '@jb6/testing'
import '@jb6/react/automation.js'
import '@wonder/db/db-drivers-s3-minio.js'
import './wonder-platform.js'

const {
  common: { data: { asIs }, boolean: { equals } },
  react: { ReactComp, UiAction, 'react-comp': { comp } },
  test: { Test, test: { dataTest } }
} = dsls
Test('wonderPlatform.seedShape', {
  impl: dataTest({
    calculate: () => {
      const x = dsls.common.data.wonderPlatformSeed.$run()
      return {
        result: {
          plugins: x.plugins.length,
          skills: x.skills.length,
          tools: x.tools.length,
          subagents: x.subagents.length,
          reports: x.reports.length,
          embeddedReports: x.conversations[0].messages[1].reportIds.length
        }
      }
    },
    expectedResult: equals('%result%', asIs({plugins: 4, skills: 4, tools: 6, subagents: 3, reports: 3, embeddedReports: 2}))
  })
})
Test('wonderPlatform.minioRoundTrip', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async (ctx, { testSessionId }) => {
      const url = 'room:minio//wonder-platform-test/tests/' + testSessionId + '/assets'
      const content = dsls.common.data.wonderPlatformSeed.$run()
      await jb.wonderUtils.wfetch2(url, { method: 'PUT', body: content }, ctx)
      const stored = await (await jb.wonderUtils.wfetch2(url, { method: 'GET' }, ctx)).json()
      return {
        result: {
          plugin: stored.plugins[0].name,
          reports: stored.reports.length,
          conversations: stored.conversations.length
        },
        ...coreUtils.harvestLogs(ctx)
      }
    },
    expectedResult: equals('%result%', asIs({plugin: 'אנליסט הוכחת קיום', reports: 3, conversations: 3})),
    logger: 'dbLogger'
  })
})
Test('wonderPlatform.agentGrounding', {
  doNotRunInTests: true,
  impl: dataTest({
    calculate: async ctx => {
      const assets = dsls.common.data.wonderPlatformSeed.$run()
      const plugin = assets.plugins[0]
      const workflowCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx.setVars({
        userMessage: 'האם תוכנית שחר מוכנה ליציאה? החזר גם את הדוח המאומת הרלוונטי.',
        selectedPlugin: JSON.stringify(plugin),
        assetRepoText: JSON.stringify({
          plugin,
          skills: assets.skills.filter(x => plugin.skillIds.includes(x.id)),
          tools: assets.tools.filter(x => plugin.toolIds.includes(x.id)),
          subagents: assets.subagents.filter(x => plugin.subagentIds.includes(x.id)),
          reports: assets.reports
        }),
        accumulatedContext: { chatHistory: [] },
        llmProxyUrl: 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy'
      }))
      const res = await dsls.workflow.workflow.wonderPlatformAgent.$run().calcWorkflow(workflowCtx)
      return {
        ok: typeof res.runRes?.text === 'string' && Array.isArray(res.runRes.reportIds),
        answer: res.runRes,
        trace: res.workflowTrace,
        workflowErrors: res.workflowErrors
      }
    },
    expectedResult: equals('%ok%', true),
    timeout: 180000,
    logger: 'workflowLogger'
  })
})
ReactComp('wonderPlatformChatTestHost', {
  impl: comp({
    hFunc: ctx => {
      const App = dsls.react['react-comp'].wonderPlatform.$runWithCtx(ctx, { roomWUrl: 'room:minio//wonder-platform-chat-test' })
      return () => ctx.vars.react.h(App)
    }
  })
})
ReactComp('wonderPlatformVerificationHost', {
  impl: comp({
    hFunc: ctx => {
      const App = dsls.react['react-comp'].wonderPlatform.$runWithCtx(ctx, { roomWUrl: 'room:minio//wonder-platform-verification-v2' })
      return () => ctx.vars.react.h(App)
    }
  })
})
UiAction('wonderPlatformChatInteraction', {
  impl: () => ({
    async exec({ vars: { win } }) {
      const click = text => [...win.document.querySelectorAll('button')].find(x => x.textContent.trim() === text)
        ?.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }))
      const wait = (check, timeout = 180000) => new Promise((resolve, reject) => {
        const started = Date.now(), poll = () => {
          const result = check()
          result ? resolve(result) : Date.now() - started > timeout ? reject(new Error('chat interaction timeout')) : win.setTimeout(poll, 50)
        }
        poll()
      })
      click('צ׳אט')
      const input = await wait(() => win.document.querySelector('[data-testid=chat-input]'), 5000)
      await wait(() => win.document.querySelector('[data-message-role=agent]'), 5000)
      const count = selector => win.document.querySelectorAll(selector).length
      const beforeAgent = count('[data-message-role=agent]'), beforeUser = count('[data-message-role=user]')
      const beforeReport = count('[data-report-id=r1]')
      const setValue = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, 'value').set
      input.focus()
      let value = ''
      for (const char of 'מה מצב המוכנות של תוכנית שחר לפי הדוח?') {
        value += char
        setValue.call(input, value)
        input.dispatchEvent(new win.Event('input', { bubbles: true }))
        await new Promise(resolve => win.setTimeout(resolve, 10))
        if (win.document.activeElement !== input) throw new Error('chat input lost focus')
        if (input.value !== value) throw new Error('chat input dropped text')
      }
      input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
      await wait(() => count('[data-message-role=user]') > beforeUser, 5000)
      await wait(() => {
        const answers = win.document.querySelectorAll('[data-message-role=agent]'), answer = answers[answers.length - 1]
        return answers.length > beforeAgent && answer.textContent.includes('92%')
          && answer.textContent.includes('נוהל התאוששות') && answer
      })
      await wait(() => count('[data-report-id=r1]') > beforeReport, 5000)
    }
  })
})
