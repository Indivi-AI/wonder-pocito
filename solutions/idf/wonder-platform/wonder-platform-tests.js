import { coreUtils, dsls } from '@jb6/core'
import '@jb6/testing'
import '@jb6/react/automation.js'
import '@jb6/react/tests/react-testers.js'
import './wonder-platform.js'

const {
  common: { Data, data: { asIs, wFetch, wonderPlatformAnswer, wonderPlatformListSkills, wonderPlatformLoadSkill,
    wonderPlatformLoadTargetSkills, wonderPlatformMarketplaceCall, wonderPlatformMarketplaceItem, wonderPlatformMarketplaceManifest,
    wonderPlatformNormalize, wonderPlatformPublishSkill, wonderPlatformSeed, wonderPlatformUpsert, wonderPlatformAgentOsRun },
    boolean: { and, contains, equals } },
  react: { ReactComp, 'react-comp': { comp, wonderPlatform }, 'ui-action': { actions, click, waitForText } },
  test: { Test, test: { dataTest, reactTest } },
  workflow: { Workflow }
} = dsls

Data('wonderPlatformRepositoryRoundTrip', {
  params: [
    {id: 'url', as: 'string', mandatory: true},
    {id: 'seed', dynamic: true, defaultValue: wonderPlatformSeed()},
    {id: 'write', dynamic: true, defaultValue: wFetch('%$repositoryUrl%', {method: 'PUT', body: '%$repo%'})},
    {id: 'read', dynamic: true, defaultValue: wFetch('%$repositoryUrl%')}
  ],
  impl: async (ctx, {}, {url, seed, write, read}) => {
    const runCtx = ctx.setVars({repositoryUrl: url}), repo = seed(runCtx)
    await write(runCtx.setVars({repo})); return read(runCtx)
  }
})

Data('wonderPlatformTestSave', {impl: () => true})

Data('wonderPlatformApiCapture', {
  impl: (ctx, {marketplaceLogger}) => {
    const result = {method: ctx.vars.method, path: ctx.vars.apiPath,
      ...(['GET', 'DELETE'].includes(ctx.vars.method) ? {} : {body: ctx.vars.body})}
    marketplaceLogger?.info?.({t: 'capturedMarketplaceRequest', ...result}, {}, {ctx})
    return result
  }
})

Data('wonderPlatformAgentOsCapture', {
  impl: () => ({content: 'Grounded answer [[report:r1]]', run_id: 'run-1', status: 'COMPLETED'})
})

Data('wonderPlatformMarketplaceFixture', {
  impl: ctx => {
    const seed = wonderPlatformSeed.$runWithCtx(ctx), item = (resource, manifest) => wonderPlatformMarketplaceItem.$runWithCtx(ctx, {resource, item: manifest})
    return {...seed, marketplace: true,
      plugins: [item('plugins', {display_name: 'evidence-plugin', hebrew_display_name: 'פלאגין ראיות', description: 'Evidence plugin',
        hebrew_description: 'אורז מיומנות וכלי.', tags: [{tag_type: 'domain', tag_name: 'audit'}], version: 2,
        config: {skills: ['evidence-skill'], tools: ['evidence-search']}, readme: '# Evidence plugin'})],
      skills: [item('skills', {display_name: 'evidence-skill', hebrew_display_name: 'מיומנות ראיות', description: 'Evidence skill',
        hebrew_description: 'בונה שרשרת ראיות.', version: 3, min_agent_version: '0.1.0', license: 'MIT', skill_md: '# Evidence skill',
        assets: [{path: 'checklist.md', content_b64: 'IyBDaGVja2xpc3Q=', mime_type: 'text/markdown'}]})],
      tools: [item('tools', {display_name: 'evidence-search', hebrew_display_name: 'חיפוש ראיות', description: 'Evidence search',
        hebrew_description: 'מחפש במקורות.', version: 4, tool_type: 'code', json_schema: {type: 'object'}, is_async: true, tracable: true,
        dedicated_tool_config: {}, code_files: [{path: 'tool.py', content: 'def search(): pass'}]})],
      subagents: [item('subagents', {display_name: 'evidence-agent', hebrew_display_name: 'סוכן ראיות', description: 'Evidence agent',
        hebrew_description: 'מאמת טענות.', version: 5, config: {system_prompt: 'Use evidence.', backend_config: {harness_type: 'deepagents'},
          plugins: ['evidence-plugin'], skills: ['evidence-skill'], tools: ['evidence-search'], sub_agents: []}})]}
  }
})

Data('wonderPlatformMarketplaceDetailFixture', {
  params: [{id: 'resource', as: 'string'}, {id: 'name', as: 'string'}],
  impl: (ctx, {}, {resource, name}) => ({...dsls.common.data.wonderPlatformMarketplaceFixture.$runWithCtx(ctx)[resource]
    .find(item => item.id == name), versions: [{version: 1}, {version: 2}], audit: [{action: 'updated'}],
    references: {ok: true}, configYaml: 'skills:\n  - evidence-skill'})
})

Data('wonderPlatformAnswerSmoke', {
  params: [
    {id: 'seed', dynamic: true, defaultValue: wonderPlatformSeed()},
    {id: 'listSkills', dynamic: true, defaultValue: wonderPlatformListSkills('%$roomWUrl%')},
    {id: 'answer', dynamic: true,
      defaultValue: wonderPlatformAnswer('%$text%', '%$target%', '%$repo%', [], '%$roomWUrl%')}
  ],
  impl: async (ctx, {}, {seed, listSkills, answer}) => {
    const roomWUrl = `room:minio//wonder-platform-answer-${ctx.vars.testSessionId || 'smoke'}`
    const repo = {...seed(ctx), skills: await listSkills(ctx.setVars({roomWUrl}))}, target = repo.plugins[0]
    return answer(ctx.setVars({roomWUrl, repo, target, text: 'האם תוכנית שחר מוכנה ליציאה? ציין את הדוח התומך.'}))
  }
})

Data('wonderPlatformDocletRoundTrip', {
  params: [
    {id: 'roomWUrl', as: 'string', mandatory: true},
    {id: 'listSkills', dynamic: true, defaultValue: wonderPlatformListSkills('%$roomWUrl%')},
    {id: 'loadSkill', dynamic: true, defaultValue: wonderPlatformLoadSkill('%$docletWUrl%')},
    {id: 'loadTargetSkills', dynamic: true, defaultValue: wonderPlatformLoadTargetSkills('%$roomWUrl%', '%$target%')},
    {id: 'publish', dynamic: true, defaultValue: wonderPlatformPublishSkill('%$roomWUrl%', '%$skill%')}
  ],
  impl: async (ctx, {}, {roomWUrl, listSkills, loadSkill, loadTargetSkills, publish}) => {
    const runCtx = ctx.setVars({roomWUrl}), skills = await listSkills(runCtx)
    const [selected] = await loadTargetSkills(runCtx.setVars({target: {
      skillIds: ['evidenceVerification'], categories: ['audit', 'he']}}))
    const exact = await loadSkill(runCtx.setVars({docletWUrl: `${roomWUrl}/doclets/evidenceVerification.audit?v=1.0.0`}))
    const missing = await loadSkill(runCtx.setVars({docletWUrl: `${roomWUrl}/doclets/evidenceVerification.unknown?v=1.0.0`}))
    await publish(runCtx.setVars({skill: {...skills.find(skill => skill.id == 'evidenceVerification'),
      content: '# הוכחת קיום\n\nגרסה שפורסמה דרך WURL.', publishVersion: '1.0.1'}}))
    const refreshed = await listSkills(runCtx)
    return {skills: skills.length, version: skills.find(skill => skill.id == 'evidenceVerification')?.version,
      categories: skills.find(skill => skill.id == 'evidenceVerification')?.categories, selected: selected?.id,
      selectedContent: selected?.content, exact: exact?.id, missing: missing == null,
      refreshedVersion: refreshed.find(skill => skill.id == 'evidenceVerification')?.version}
  }
})

const wonderPlatformSkillProbeAgent = Workflow('wonderPlatformSkillProbeAgent', {
  impl: () => ({calcWorkflow: async workflowCtx => ({runRes: {text: workflowCtx.vars.loadedSkillDoclets, reportIds: [], followUps: []},
    workflowErrors: [], workflowTrace: []})})
})

Data('wonderPlatformWorkflowSkillProbe', {
  params: [
    {id: 'roomWUrl', as: 'string', mandatory: true},
    {id: 'seed', dynamic: true, defaultValue: wonderPlatformSeed()},
    {id: 'listSkills', dynamic: true, defaultValue: wonderPlatformListSkills('%$roomWUrl%')},
    {id: 'answer', dynamic: true, defaultValue: wonderPlatformAnswer('בדיקה', '%$target%', '%$repo%', [], '%$roomWUrl%', {
      agentWorkflow: wonderPlatformSkillProbeAgent()})}
  ],
  impl: async (ctx, {}, {roomWUrl, seed, listSkills, answer}) => {
    const repo = {...seed(ctx), skills: await listSkills(ctx.setVars({roomWUrl}))}, target = repo.plugins[0]
    return answer(ctx.setVars({roomWUrl, repo, target}))
  }
})

Data('wonderPlatformWfetchRoundTrip', {
  params: [
    {id: 'roomWUrl', as: 'string', mandatory: true},
    {id: 'listSkills', dynamic: true, defaultValue: wonderPlatformListSkills('%$roomWUrl%')}
  ],
  impl: async (ctx, {}, {roomWUrl, listSkills}) => {
    await listSkills(ctx.setVars({roomWUrl}))
    const {createApp} = await import(`${await coreUtils.calcRepoRoot()}/cloud-services/express-server/app.js`)
    const app = await createApp('public'), server = await new Promise(resolve => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance))
    })
    const call = body => fetch(`http://127.0.0.1:${server.address().port}/wfetch`, {method: 'POST',
      headers: {'content-type': 'application/json'}, body: JSON.stringify(body)})
    try {
      const response = await call({url: `${roomWUrl}/doclets/evidenceVerification`, categories: ['audit', 'he'],
        logger: 'workflowLogger'}), payload = await response.json()
      const deniedWrite = await call({url: `${roomWUrl}/doclets/evidenceVerification`, method: 'PUT', body: {}})
      const invalidUrl = await call({url: 'doclet://evidenceVerification'})
      return {httpStatus: response.status, id: payload.body?.id, version: payload.body?.version,
        contentLocation: payload.headers?.['content-location'], hasContent: payload.body?.content?.includes('כללי תשובה בעברית'),
        apiWorkflowErrors: payload.logs?.workflowLogger?.workflowErrors?.length || 0,
        deniedWrite: deniedWrite.status, invalidUrl: invalidUrl.status}
    } finally { await new Promise(resolve => server.close(resolve)) }
  }
})

ReactComp('wonderPlatformTestApp', {
  impl: wonderPlatform({loadRepo: wonderPlatformSeed(), saveRepo: dsls.common.data.wonderPlatformTestSave()})
})

ReactComp('wonderPlatformMarketplaceTestApp', {
  impl: wonderPlatform({loadRepo: dsls.common.data.wonderPlatformMarketplaceFixture(), saveRepo: dsls.common.data.wonderPlatformTestSave(),
    marketplaceDetail: dsls.common.data.wonderPlatformMarketplaceDetailFixture('%$resource%', '%$name%')})
})

Test('wonderPlatform.marketplaceApiRoutes', {
  impl: dataTest({
    calculate: async ctx => {
      const request = dsls.common.data.wonderPlatformApiCapture(), call = args => wonderPlatformMarketplaceCall.$runWithCtx(ctx, {...args, request})
      const [list, version, audit, update, upload] = await Promise.all([
        call({operation: 'list', resource: 'plugins'}), call({operation: 'version', resource: 'subagents', name: 'a b', version: 2}),
        call({operation: 'audit', resource: 'skills', name: 'skill-1'}), call({operation: 'update', resource: 'tools', name: 'tool-1',
          body: {tracable: true}}), call({operation: 'presignUpload', body: {key: 'assets/a'}})
      ])
      return {result: {list, version, audit, update, upload}, ...coreUtils.harvestLogs(ctx)}
    },
    expectedResult: equals('%result%', asIs({
      list: {method: 'GET', path: '/api/v1/plugins/'},
      version: {method: 'GET', path: '/api/v1/agents/a%20b/versions/2'},
      audit: {method: 'GET', path: '/api/v1/audit/skill/skill-1'},
      update: {method: 'PUT', path: '/api/v1/tools/tool-1', body: {tracable: true}},
      upload: {method: 'POST', path: '/api/v1/presign/upload', body: {key: 'assets/a'}}
    })),
    logger: 'marketplaceLogger'
  })
})

Test('wonderPlatform.marketplaceManifest', {
  impl: dataTest({
    calculate: () => ({result: {
      plugin: wonderPlatformMarketplaceManifest.$run({resource: 'plugins', item: {id: 'p', name: 'פ', desc: 'ת', skillIds: ['s'],
        toolIds: ['t'], subagentIds: ['a']}}), tool: wonderPlatformMarketplaceManifest.$run({resource: 'tools', item: {id: 't', name: 'כ',
          desc: 'ת', toolType: 'code', tracable: true}})}}),
    expectedResult: equals('%result%', asIs({plugin: {display_name: 'p', hebrew_display_name: 'פ', description: 'ת',
      hebrew_description: 'ת', tags: [], config: {skills: ['s'], tools: ['t']}, readme: ''}, tool: {display_name: 't',
      hebrew_display_name: 'כ', description: 'ת', hebrew_description: 'ת', tags: [], tool_type: 'code', json_schema: {}, is_async: true,
      tracable: true, dedicated_tool_config: {}, code_files: []}}))
  })
})

Test('wonderPlatform.agentOsRun', {
  impl: dataTest({
    calculate: wonderPlatformAgentOsRun('Question', asIs({id: 'evidence-agent', name: 'סוכן ראיות'}), 'session-1', {
      request: dsls.common.data.wonderPlatformAgentOsCapture()}),
    expectedResult: and(equals('%text%', 'Grounded answer'), equals('%reportIds/0%', 'r1'), equals('%runId%', 'run-1'),
      equals('%runtimeSteps/0/kind%', 'AgentOS'))
  })
})

Test('wonderPlatform.seedShape', {
  impl: dataTest({
    calculate: () => {
      const repo = dsls.common.data.wonderPlatformSeed.$run()
      return {result: {plugins: repo.plugins.length, skills: repo.skills.length, tools: repo.tools.length, subagents: repo.subagents.length,
        reports: repo.reports.length, evaluations: repo.evaluations.length, flowPackages: repo.flowPackages.length,
        embeddedReports: repo.conversations[0].messages[1].reportIds.length, firstSkill: repo.skills[0].id,
        skillWUrl: repo.skills[0].docletUrl}}
    },
    expectedResult: equals('%result%', asIs({plugins: 4, skills: 4, tools: 6, subagents: 3, reports: 3, evaluations: 4,
      flowPackages: 3, embeddedReports: 2, firstSkill: 'evidenceVerification',
      skillWUrl: 'room:minio//wonder-platform/doclets/evidenceVerification'}))
  })
})

Test('wonderPlatform.migration', {
  impl: dataTest({
    calculate: () => {
      const seed = dsls.common.data.wonderPlatformSeed.$run(), repo = dsls.common.data.wonderPlatformNormalize.$run({
        repo: {version: 1, ...seed, flowPackages: undefined, evalRuns: undefined,
          plugins: seed.plugins.map(plugin => plugin.id == 'p1' ? {...plugin, skillIds: ['s1', 's3']} : plugin),
          tools: seed.tools.map(tool => tool.id == 't4' ? {...tool, kind: 'Flow · 4821037', packageId: undefined} : tool)}, seed})
      return {result: {version: repo.version, packageId: repo.tools.find(tool => tool.id == 't4').packageId,
        managedKind: repo.tools.find(tool => tool.id == 't1').kind, skills: repo.plugins[0].skillIds,
        evaluations: repo.evaluations.length, evalRuns: repo.evalRuns.length}}
    },
    expectedResult: equals('%result%', asIs({version: 3, packageId: '4821037', managedKind: 'connector',
      skills: ['evidenceVerification', 'documentationGaps'], evaluations: 4, evalRuns: 0}))
  })
})

Test('wonderPlatform.atomicComposition', {
  impl: dataTest({
    calculate: () => {
      const repo = dsls.common.data.wonderPlatformSeed.$run(), skill = {...repo.skills[0], id: 's-new', name: 'מיומנות חדשה'}
      const child = wonderPlatformUpsert.$run({repo, resource: 'skills', item: skill})
      const parent = wonderPlatformUpsert.$run({repo: child.repo, resource: 'plugins',
        item: {...repo.plugins[0], originalId: 'p1', skillIds: [...repo.plugins[0].skillIds, skill.id]}})
      return {result: {savedChild: parent.repo.skills.some(item => item.id == skill.id),
        linkedChild: parent.repo.plugins[0].skillIds.includes(skill.id)}}
    },
    expectedResult: equals('%result%', asIs({savedChild: true, linkedChild: true}))
  })
})

Test('wonderPlatform.moduleContracts', {
  impl: dataTest({
    calculate: () => ({result: ['data<common>wonderPlatformSeed', 'data<common>wonderPlatformNormalize', 'data<common>wonderPlatformUpsert',
      'data<common>wonderPlatformTrace', 'data<common>parseDocletWUrl', 'data<common>publishDocletFamily',
      'data<common>publishedDocletCatalog', 'data<common>publishedDoclet', 'data<common>wonderPlatformSeedSkills',
      'data<common>wonderPlatformListSkills', 'data<common>wonderPlatformLoadSkill', 'data<common>wonderPlatformLoadTargetSkills',
      'data<common>wonderPlatformLoadRepository', 'data<common>wonderPlatformSaveRepository', 'data<common>wonderPlatformAnswer',
      'data<common>wonderPlatformMarketplaceRequest', 'data<common>wonderPlatformMarketplaceCall',
      'data<common>wonderPlatformMarketplaceManifest', 'data<common>wonderPlatformMarketplaceItem',
      'data<common>wonderPlatformMarketplaceLoad', 'data<common>wonderPlatformMarketplaceRepository',
      'data<common>wonderPlatformMarketplaceDetail', 'data<common>wonderPlatformAgentOsRequest', 'data<common>wonderPlatformAgentOsRun',
      'workflow<workflow>wonderPlatformAgent', 'react-comp<react>wonderPlatformNavigation', 'react-comp<react>wonderPlatformCatalog',
      'react-comp<react>wonderPlatformAttachPicker', 'react-comp<react>wonderPlatformResourceEditor',
      'react-comp<react>wonderPlatformWorkspace', 'react-comp<react>wonderPlatformVerifiedReport', 'react-comp<react>wonderPlatformChat',
      'react-comp<react>wonderPlatformEvaluation', 'react-comp<react>wonderPlatform'].every(id => coreUtils.compByFullId(id))}),
    expectedResult: equals('%result%', true)
  })
})

Test('wonderPlatform.minioRoundTrip', {
  nodeOnly: true,
  impl: dataTest({
    calculate: dsls.common.data.wonderPlatformRepositoryRoundTrip('room:minio//wonder-platform-test/tests/%$testSessionId%/assets'),
    expectedResult: and(equals('%plugins/0/name%', 'אנליסט הוכחת קיום'), equals('%reports/length%', 3), equals('%flowPackages/length%', 3)),
    logger: 'dbLogger'
  })
})

Test('wonderPlatform.docletStorage', {
  nodeOnly: true,
  impl: dataTest({
    calculate: dsls.common.data.wonderPlatformDocletRoundTrip(
      'room:minio//wonder-platform-doclet-%$testSessionId%'),
    expectedResult: and(equals(4, '%skills%'), equals('1.0.0', '%version%'), contains('audit', {allText: '%categories%'}),
      equals('evidenceVerification.audit.he', '%selected%'), contains('ענה בעברית תקינה', {allText: '%selectedContent%'}),
      equals('evidenceVerification.audit', '%exact%'), equals(true, '%missing%'), equals('1.0.1', '%refreshedVersion%')),
    timeout: 30000,
    logger: 'workflowLogger'
  })
})

Test('wonderPlatform.workflowLoadsDoclets', {
  nodeOnly: true,
  impl: dataTest({
    calculate: dsls.common.data.wonderPlatformWorkflowSkillProbe(
      'room:minio//wonder-platform-workflow-skills-%$testSessionId%'),
    expectedResult: and(contains('כללי תשובה בעברית', {allText: '%text%'}), contains('איתור פערי תיעוד', {allText: '%text%'}),
      equals('evidenceVerification.audit.he', '%loadedSkillIds/0%'), equals('documentationGaps', '%loadedSkillIds/1%')),
    timeout: 30000,
    logger: 'workflowLogger'
  })
})

Test('wonderPlatform.wfetchApi', {
  nodeOnly: true,
  impl: dataTest({
    calculate: dsls.common.data.wonderPlatformWfetchRoundTrip(
      'room:minio//wonder-platform-wfetch-%$testSessionId%'),
    expectedResult: and(equals(200, '%httpStatus%'), equals('evidenceVerification.audit.he', '%id%'),
      equals('1.0.0', '%version%'), contains('/doclets/evidenceVerification.audit.he?v=1.0.0', {allText: '%contentLocation%'}),
      equals(true, '%hasContent%'), equals(0, '%apiWorkflowErrors%'), equals(401, '%deniedWrite%'), equals(400, '%invalidUrl%')),
    timeout: 30000,
    logger: 'workflowLogger'
  })
})

Test('wonderPlatform.pluginWorkspace', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformTestApp(), and(contains('חיבורי הפלאגין'), contains('הרצת ניסוי'),
    contains('סט אבלואציה מקושר')), {userActions: actions(waitForText('אנליסט הוכחת קיום'), click('אנליסט הוכחת קיום'),
      waitForText('חיבורי הפלאגין'))})
})

Test('wonderPlatform.evaluationCatalog', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformTestApp(), and(contains('אימות טענות ומקורות'), contains('רשומות'), contains('טרם הורץ')), {
    userActions: actions(waitForText('פלאגין חדש'), click('אבלואציה'), waitForText('אימות טענות ומקורות'))})
})

Test('wonderPlatform.toolRules', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformTestApp(), and(contains('Connector · MCP'), contains('Flow · מארז'), contains('מנוהל')), {
    userActions: actions(waitForText('פלאגין חדש'), click('כלים'), waitForText('חיפוש Jira'))})
})

Test('wonderPlatform.skillCatalog', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformTestApp(),
    and(contains('הוכחת קיום — תהליך מלא'), contains('1.0.0'), contains('2 קטגוריות')), {
      userActions: actions(waitForText('פלאגין חדש'), click('מיומנויות'), waitForText('הוכחת קיום — תהליך מלא'))})
})

Test('wonderPlatform.chatHistory', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformTestApp(),
    and(contains('שיחה מתמשכת'), contains('היסטוריית שיחות'), contains('דוח מאומת')), {
    userActions: actions(waitForText('פלאגין חדש'), click('צ׳אט'), waitForText('שיחה מתמשכת'))})
})

Test('wonderPlatform.subagentWorkspace', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformTestApp(), and(contains('חיבורי הסאב-אייג׳נט'), contains('נסה את הסאב-אייג׳נט')), {
    userActions: actions(waitForText('פלאגין חדש'), click('סאב-אייג׳נטים'), waitForText('מחלץ ישויות'), click('מחלץ ישויות'),
      waitForText('חיבורי הסאב-אייג׳נט'))})
})

Test('wonderPlatform.marketplacePluginWorkspace', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformMarketplaceTestApp(),
    and(contains('README.md'), contains('Marketplace API'), contains('2 גרסאות'), contains('config.yaml')), {
      userActions: actions(waitForText('פלאגין ראיות'), click('פלאגין ראיות'), waitForText('Marketplace API'))})
})

Test('wonderPlatform.marketplaceSkillEditor', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformMarketplaceTestApp(),
    and(contains('min_agent_version'), contains('Assets'), contains('Marketplace API'), contains('SKILL.md')), {
      userActions: actions(waitForText('פלאגין ראיות'), click('מיומנויות'), waitForText('מיומנות ראיות'), click('מיומנות ראיות'),
        waitForText('Assets'))})
})

Test('wonderPlatform.marketplaceToolEditor', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformMarketplaceTestApp(),
    and(contains('tool_type'), contains('tracable'), contains('Code files'), contains('dedicated_tool_config')), {
      userActions: actions(waitForText('פלאגין ראיות'), click('כלים'), waitForText('חיפוש ראיות'), click('חיפוש ראיות'),
        waitForText('Code files'))})
})

Test('wonderPlatform.marketplaceAgentWorkspace', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformMarketplaceTestApp(),
    and(contains('BackendConfig'), contains('deepagents'), contains('פלאגינים'), contains('סאב-אייג׳נטים')), {
      userActions: actions(waitForText('פלאגין ראיות'), click('סאב-אייג׳נטים'), waitForText('סוכן ראיות'), click('סוכן ראיות'),
        waitForText('BackendConfig'))})
})

ReactComp('wonderPlatformChatTestHost', {
  impl: comp({hFunc: ctx => {
    const App = dsls.react['react-comp'].wonderPlatform.$runWithCtx(ctx, {roomWUrl: 'room:minio//wonder-platform-chat-test'})
    return () => ctx.vars.react.h(App)
  }})
})

ReactComp('wonderPlatformVerificationHost', {
  impl: comp({hFunc: ctx => {
    const App = dsls.react['react-comp'].wonderPlatform.$runWithCtx(ctx, {roomWUrl: 'room:minio//wonder-platform-verification-v3'})
    return () => ctx.vars.react.h(App)
  }})
})
