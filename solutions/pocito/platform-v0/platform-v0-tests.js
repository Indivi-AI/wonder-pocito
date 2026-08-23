import { coreUtils, dsls } from '@jb6/core'
import '@jb6/testing'
import '@jb6/react/tests/react-testers.js'
import './platform-v0.js'

const {
  test: { Test, test: { dataTest, reactTest } },
  common: { data: { asIs }, boolean: { and, contains, equals } },
  react: { 'react-comp': { PlatformV0 }, 'ui-action': { actions, click, waitForText } }
} = dsls

Test('platformV0.moduleContracts', {
  impl: dataTest({
    calculate: () => ({result: [
      'data<common>platformV0Config', 'data<common>platformMarketplaceApi', 'data<common>platformAgnoRun',
      'data<common>platformReportMarkers', 'data<common>platformV0Trace', 'react-comp<react>PlatformV0Navigation',
      'react-comp<react>PlatformV0Marketplace', 'react-comp<react>PlatformV0AttachPicker', 'react-comp<react>PlatformV0ResourceModal',
      'react-comp<react>PlatformV0Workspace', 'react-comp<react>PlatformV0VerifiedReport', 'react-comp<react>PlatformV0ChatComposer',
      'react-comp<react>PlatformV0Chat', 'react-comp<react>PlatformV0Evaluation', 'react-comp<react>PlatformV0'
    ].every(id => coreUtils.compByFullId(id))}),
    expectedResult: equals('%result%', true)
  })
})

Test('platformV0.apiRelationships', {
  impl: dataTest({
    calculate: async ctx => {
      const get = path => dsls.common.data.platformMarketplaceApi.$runWithCtx(ctx, {path})
      const [plugins, skills, tools, agents, sets] = await Promise.all([
        get('/api/v1/plugins'), get('/api/v1/skills'), get('/api/v1/tools'), get('/api/v1/agents'), get('/api/v1/evalSets')
      ])
      const named = (items, name) => items.find(item => item.name == name)
      return {result: {pluginSkills: named(plugins, 'proof-of-existence-analyst').skills.length,
        skillTools: named(skills, 'proof-process').tools.length, managed: tools.filter(item => item.managed).length,
        agentEval: named(agents, 'document-entity-extractor').evalSet, evalRows: named(sets, 'supplier-q2').rows.length},
      ...coreUtils.harvestLogs(ctx)}
    },
    expectedResult: equals('%result%', asIs({pluginSkills: 2, skillTools: 3, managed: 3,
      agentEval: 'source-consistency', evalRows: 4})),
    logger: 'uiLogger'
  })
})

Test('platformV0.pluginWorkspace', {
  impl: reactTest(PlatformV0(), and(contains('חיבורי הפלאגין'), contains('הרצת ניסוי'), contains('סט אבלואציה מקושר')), {
    userActions: actions(waitForText('אנליסט הוכחת קיום'), click('אנליסט הוכחת קיום'), waitForText('חיבורי הפלאגין'))
  })
})

Test('platformV0.evaluationCatalog', {
  impl: reactTest(PlatformV0(), and(contains('הוכחת קיום — ספקי Q2'), contains('רשומות'), contains('טרם הורץ')), {
    userActions: actions(waitForText('פלאגין חדש'), click('אבלואציה'), waitForText('הוכחת קיום — ספקי Q2'))
  })
})

Test('platformV0.toolRules', {
  impl: reactTest(PlatformV0(), and(contains('Connector · MCP'), contains('Flow · מארז'), contains('מנוהל')), {
    userActions: actions(waitForText('פלאגין חדש'), click('כלים'), waitForText('Jira — חיפוש טיקטים'))
  })
})

Test('platformV0.chatHistory', {
  impl: reactTest(PlatformV0(), and(contains('שיחה מתמשכת'), contains('היסטוריית שיחות'), contains('דוח מאומת')), {
    userActions: actions(waitForText('פלאגין חדש'), click('צ׳אט'), waitForText('שיחה מתמשכת'))
  })
})

Test('platformV0.subagentWorkspace', {
  impl: reactTest(PlatformV0(), and(contains('חיבורי הסאב-אייג׳נט'), contains('נסה את הסאב-אייג׳נט')), {
    userActions: actions(waitForText('פלאגין חדש'), click('סאב-אייג׳נטים'), waitForText('מחלץ ישויות ממסמך'),
      click('מחלץ ישויות ממסמך'), waitForText('חיבורי הסאב-אייג׳נט'))
  })
})
