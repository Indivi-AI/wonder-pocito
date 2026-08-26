import { coreUtils, dsls } from '@jb6/core'
import '@jb6/testing'
import '@jb6/react/automation.js'
import '@jb6/react/tests/react-testers.js'
import './wonder-platform-runtime.js'
import './wonder-platform.js'
import './wonder-agents.js'

const {
  tgp: { CtxEnricher },
  common: { Data, data: { asIs, wFetch, wonderPlatformAnswer, wonderPlatformListSkills, wonderPlatformLoadSkill,
    wonderPlatformLoadTargetSkills, wonderPlatformMarketplaceCall, wonderPlatformMarketplaceItem, wonderPlatformMarketplaceManifest,
    wonderPlatformNormalize, wonderPlatformPublishSkill, wonderPlatformSeed, wonderPlatformUpsert, wonderPlatformAgentOsRun },
    boolean: { and, contains, equals, notContains } },
  react: { ReactComp, UiAction, 'react-comp': { comp, wonderPlatform },
    'ui-action': { actions, click, waitForText } },
  test: { Test, test: { dataTest, reactTest } },
  ai: { Workflow }
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
    const result = {method: ctx.vars.method, wUrl: ctx.vars.wUrl,
      ...(['GET', 'DELETE'].includes(ctx.vars.method) ? {} : {body: ctx.vars.body})}
    marketplaceLogger?.info?.({t: 'capturedMarketplaceRequest', ...result}, {}, {ctx})
    return result
  }
})

Data('wonderPlatformAgentOsCapture', {
  impl: () => ({content: 'Grounded answer', run_id: 'run-1', status: 'COMPLETED'})
})

Data('wonderPlatformChatAgentCapture', {
  impl: ctx => ({harness: 'agno', text: `AGNO_AGENT:${ctx.vars.target.id}`, runtimeSteps: []})
})

Data('wonderPlatformFlapiFixture', {
  impl: () => ({quick: {'ecom-query-1': [{Name: 'category', DisplayName: 'Category', Type: 'string', Description: 'Product category'}]},
    metadata: {Id: 7, Name: 'E-commerce Analytics', Queries: [{id: 'orders', Name: 'Orders Cube', ResultsLimit: 1000, Fields: []}]}})
})

const { wonderPlatformChatAgentCapture, wonderPlatformTestSave } = dsls.common.data

Data('wonderPlatformMarketplaceFixture', {
  impl: ctx => {
    const seed = wonderPlatformSeed.$runWithCtx(ctx), item = (resource, manifest) => wonderPlatformMarketplaceItem.$runWithCtx(ctx, {resource, item: manifest})
    return {...seed, marketplace: true,
      plugins: [item('plugins', {id: 'evidencePlugin', display_name: 'פלאגין ראיות', description: 'Evidence plugin',
        hebrew_description: 'אורז מיומנות וכלי.', tags: [{tag_type: 'domain', tag_name: 'audit'}], version: 2,
        config: {skills: ['evidenceSkill'], tools: ['evidenceSearch']}, readme: '# Evidence plugin'})],
      skills: [item('skills', {id: 'evidenceSkill', display_name: 'מיומנות ראיות', description: 'Evidence skill',
        hebrew_description: 'בונה שרשרת ראיות.', version: 3, min_agent_version: '0.1.0', license: 'MIT', skill_md: '# Evidence skill',
        assets: [{path: 'checklist.md', content_b64: 'IyBDaGVja2xpc3Q=', mime_type: 'text/markdown'}]})],
      tools: [item('tools', {id: 'evidenceSearch', display_name: 'חיפוש ראיות', description: 'Evidence search',
        hebrew_description: 'מחפש במקורות.', version: 4, tool_type: 'code', json_schema: {type: 'object'}, is_async: true, tracable: true,
        dedicated_tool_config: {}, code_files: [{path: 'tool.py', content: 'def search(): pass'}]})],
      subagents: [item('subagents', {id: 'evidenceAgent', display_name: 'סוכן ראיות', description: 'Evidence agent',
        hebrew_description: 'מאמת טענות.', version: 5, config: {system_prompt: 'Use evidence.', backend_config: {harness_type: 'deepagents'},
          plugins: ['evidencePlugin'], skills: ['evidenceSkill'], tools: ['evidenceSearch'], sub_agents: []}})]}
  }
})

Data('wonderPlatformMarketplaceDetailFixture', {
  params: [{id: 'resource', as: 'string'}, {id: 'id', as: 'string'}],
  impl: (ctx, {}, {resource, id}) => ({...dsls.common.data.wonderPlatformMarketplaceFixture.$runWithCtx(ctx)[resource]
    .find(item => item.id == id), versions: [{version: 1}, {version: 2}], audit: [{action: 'updated'}],
    references: {ok: true}, configYaml: 'skills:\n  - evidenceSkill'})
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
  impl: () => ({calcWorkflow: async workflowCtx => ({runRes: {text: workflowCtx.vars.loadedSkillDoclets, followUps: []},
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

Data('wonderPlatformFlapiRoundTrip', {
  impl: async () => {
    const {createServer} = await import('node:http'), requests = []
    const upstream = createServer((req, res) => {
      requests.push({url: req.url, authorization: req.headers.authorization})
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(req.url.includes('/quick/') ? {'ecom-query-1': [{Name: 'category'}]}
        : {Id: 7, Name: 'E-commerce Analytics', Queries: [{Name: 'Orders Cube'}]}))
    })
    await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
    const previous = {FLAPI_BASE_URL: process.env.FLAPI_BASE_URL, FLAPI_BEARER_TOKEN: process.env.FLAPI_BEARER_TOKEN}
    process.env.FLAPI_BASE_URL = `http://127.0.0.1:${upstream.address().port}`; process.env.FLAPI_BEARER_TOKEN = 'test-token'
    try {
      const {createApp} = await import(`${await coreUtils.calcRepoRoot()}/cloud-services/express-server/app.js`)
      const app = await createApp('public'), server = await new Promise(resolve => {
        const instance = app.listen(0, '127.0.0.1', () => resolve(instance))
      })
      try {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/flapi/package/7`), body = await response.json()
        return {status: response.status, body, requests}
      } finally { await new Promise(resolve => server.close(resolve)) }
    } finally {
      await new Promise(resolve => upstream.close(resolve))
      for (const [key, value] of Object.entries(previous)) value == null ? delete process.env[key] : process.env[key] = value
    }
  }
})

ReactComp('wonderPlatformTestApp', {
  impl: wonderPlatform({loadRepo: wonderPlatformSeed(), saveRepo: dsls.common.data.wonderPlatformTestSave()})
})

ReactComp('wonderPlatformMarketplaceTestApp', {
  impl: wonderPlatform({loadRepo: dsls.common.data.wonderPlatformMarketplaceFixture(), saveRepo: dsls.common.data.wonderPlatformTestSave(),
    loadPackage: dsls.common.data.wonderPlatformFlapiFixture(),
    marketplaceDetail: dsls.common.data.wonderPlatformMarketplaceDetailFixture('%$resource%', '%$id%'),
    extraPrimaryNav: [['agents', 'Bot', 'סוכנים']]})
})

ReactComp('wonderPlatformAgentChatTestApp', {
  impl: wonderPlatform({
    loadRepo: wonderPlatformSeed(),
    saveRepo: wonderPlatformTestSave(),
    runAgent: wonderPlatformChatAgentCapture()
  })
})

const { wonderPlatformAgentChatTestApp, wonderPlatformMarketplaceTestApp, wonderPlatformTestApp } = dsls.react['react-comp']

Test('wonderPlatform.marketplaceApiRoutes', {
  impl: dataTest({
    calculate: async ctx => {
      const request = dsls.common.data.wonderPlatformApiCapture()
      const call = args => wonderPlatformMarketplaceCall.$runWithCtx(ctx, {
        roomWUrl: 'room://tenant-a',
        ...args,
        request
      })
      const [list, skill, version, audit, update, upload, contents, deleteContent] = await Promise.all([
        call({operation: 'list', resource: 'plugins'}),
        call({operation: 'get', resource: 'skills', id: 'skill-a'}),
        call({operation: 'version', resource: 'subagents', id: 'a b', version: 2}),
        call({operation: 'audit', resource: 'skills', id: 'skill-1'}),
        call({operation: 'update', resource: 'tools', id: 'tool-1', body: {tracable: true}}),
        call({operation: 'presignUpload', body: {key: 'assets/a'}}),
        call({operation: 'listContent', resource: 'knowledge', id: 'kb 1'}),
        call({operation: 'deleteContent', resource: 'knowledge', id: 'kb 1', contentId: 'doc/1'})
      ])
      return {result: {list, skill, version, audit, update, upload, contents, deleteContent}, ...coreUtils.harvestLogs(ctx)}
    },
    expectedResult: equals('%result%', asIs({
        list: {method: 'GET', wUrl: 'room://tenant-a/plugins/'},
        skill: {method: 'GET', wUrl: 'room://tenant-a/skills/skill-a?includeAssets=true'},
        version: {method: 'GET', wUrl: 'room://tenant-a/agents/a%20b/versions/2'},
        audit: {method: 'GET', wUrl: 'room://tenant-a/audit/skill/skill-1'},
        update: {method: 'PUT', wUrl: 'room://tenant-a/tools/tool-1', body: {tracable: true}},
        upload: {method: 'POST', wUrl: 'room://tenant-a/presign/upload', body: {key: 'assets/a'}},
        contents: {method: 'GET', wUrl: 'room://tenant-a/knowledge/kb%201/content'},
        deleteContent: {method: 'DELETE', wUrl: 'room://tenant-a/knowledge/kb%201/content/doc%2F1'}
    })),
    logger: 'marketplaceLogger'
  })
})

Test('wonderPlatform.flapiRoundTrip', {
  nodeOnly: true,
  impl: dataTest({
    calculate: dsls.common.data.wonderPlatformFlapiRoundTrip(),
    expectedResult: and(equals('%status%', 200), equals('%body/quick/ecom-query-1/0/Name%', 'category'),
      equals('%body/metadata/Queries/0/Name%', 'Orders Cube'), equals('%requests/length%', 2),
      equals('%requests/0/authorization%', 'Bearer test-token'), equals('%requests/1/authorization%', 'Bearer test-token')),
    timeout: 10000
  })
})

Test('wonderPlatform.marketplaceManifest', {
  impl: dataTest({
    calculate: () => ({result: {
      plugin: wonderPlatformMarketplaceManifest.$run({resource: 'plugins', item: {id: 'p', name: 'פ', desc: 'ת', skillIds: ['s'],
        toolIds: ['t'], subagentIds: ['a']}}), tool: wonderPlatformMarketplaceManifest.$run({resource: 'tools', item: {id: 't', name: 'כ',
          desc: 'ת', tracable: true}}), agentCreateReadme: wonderPlatformMarketplaceManifest.$run({resource: 'subagents',
            item: {id: 'a', readme: '# Agent'}}).readme, agentKnowledge: wonderPlatformMarketplaceManifest.$run({resource: 'agents',
              item: {id: 'a', knowledgeIds: ['finance', 'legal']}}).config.knowledge_bases,
          knowledge: wonderPlatformMarketplaceManifest.$run({resource: 'knowledge', item: {id: 'k', name: 'י', desc: 'ת'}}),
          agentUpdateHasReadme: 'readme' in wonderPlatformMarketplaceManifest.$run({resource: 'subagents', operation: 'update',
            item: {id: 'a', readme: '# Agent'}})}}),
    expectedResult: equals('%result%', asIs({
        plugin: {
          id: 'p',
          display_name: 'פ',
          description: 'ת',
          hebrew_description: 'ת',
          tags: [],
          config: {skills: ['s'], tools: ['t'], knowledge_bases: []},
          readme: ''
        },
        tool: {
          id: 't',
          display_name: 'כ',
          description: 'ת',
          hebrew_description: 'ת',
          tool_type: 'flow_package',
          is_async: true,
          tracable: true,
          package_id: '',
          input_schema: [],
          output_cubes: []
        },
        agentCreateReadme: '# Agent',
        agentKnowledge: ['finance','legal'],
        knowledge: {id: 'k', display_name: 'י', description: 'ת', hebrew_description: 'ת', tags: []},
        agentUpdateHasReadme: false
    }))
  })
})

Test('wonderPlatform.marketplaceSkillAssetManifest', {
  impl: dataTest({
    calculate: () => wonderPlatformMarketplaceManifest.$run({resource: 'skills', item: {id: 'skill-a', assets: [{
      path: 'references/checklist.md', content_b64: 'IyBDaGVja2xpc3Q=', mime_type: 'text/markdown', size: 11}]}}),
    expectedResult: equals('%assets%', asIs([
        {path: 'references/checklist.md', content_b64: 'IyBDaGVja2xpc3Q=', mime_type: 'text/markdown'}
    ]))
  })
})

Test('wonderPlatform.marketplaceKnowledgeItem', {
  impl: dataTest({
    calculate: () => ({result: wonderPlatformMarketplaceItem.$run({resource: 'knowledge', item: {id: 'policies', display_name: 'נהלים',
      description: 'Policies', contents: {data: [{id: 'doc-1', name: 'policy.pdf', size: '1024', status: 'ready'}]}}})}),
    expectedResult: and(
      equals('%result/knowledgeIds/length%', 0),
      equals('%result/files/0/id%', 'doc-1'),
      equals('%result/files/0/status%', 'ready')
    )
  })
})

Test('wonderPlatform.agentOsRun', {
  impl: dataTest({
    calculate: wonderPlatformAgentOsRun('Question', asIs({id: 'evidenceAgent', name: 'סוכן ראיות'}), 'session-1', {
      request: dsls.common.data.wonderPlatformAgentOsCapture()}),
    expectedResult: and(equals('%text%', 'Grounded answer'), equals('%runId%', 'run-1'),
      equals('%runtimeSteps/0/kind%', 'AgentOS'))
  })
})

Test('wonderPlatform.seedShape', {
  impl: dataTest({
    calculate: () => {
      const repo = dsls.common.data.wonderPlatformSeed.$run()
      return {result: {plugins: repo.plugins.length, skills: repo.skills.length, tools: repo.tools.length, subagents: repo.subagents.length,
        evaluations: repo.evaluations.length, flowPackages: repo.flowPackages.length, firstSkill: repo.skills[0].id,
        skillWUrl: repo.skills[0].docletUrl}}
    },
    expectedResult: equals('%result%', asIs({plugins: 4, skills: 4, tools: 6, subagents: 3, evaluations: 4,
      flowPackages: 3, firstSkill: 'evidenceVerification',
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
    expectedResult: equals('%result%', asIs({
        version: 5,
        packageId: '4821037',
        managedKind: 'connector',
        skills: ['evidenceVerification','documentationGaps'],
        evaluations: 4,
        evalRuns: 0
    }))
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
      'data<common>wonderPlatformMarketplaceDetail', 'data<common>wonderPlatformFlapiPackage',
      'data<common>wonderPlatformAgentOsRequest', 'data<common>wonderPlatformAgentOsRun',
      'workflow<ai>wonderPlatformAgent', 'react-comp<react>wonderPlatformNavigation', 'react-comp<react>wonderPlatformCatalog',
      'react-comp<react>wonderPlatformAttachPicker', 'react-comp<react>wonderPlatformResourceEditor',
      'react-comp<react>wonderPlatformWizard',
      'react-comp<react>wonderPlatformWorkspace', 'react-comp<react>wonderPlatformChat',
      'react-comp<react>wonderPlatformEvaluation', 'react-comp<react>wonderPlatform'].every(id => coreUtils.compByFullId(id))}),
    expectedResult: equals('%result%', true)
  })
})

Test('wonderPlatform.minioRoundTrip', {
  nodeOnly: true,
  impl: dataTest({
    calculate: dsls.common.data.wonderPlatformRepositoryRoundTrip('room:minio//wonder-platform-test/tests/%$testSessionId%/assets'),
    expectedResult: and(equals('%plugins/0/name%', 'אנליסט הוכחת קיום'), equals('%flowPackages/length%', 3)),
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
  impl: reactTest(dsls.react['react-comp'].wonderPlatformTestApp(), and(contains('חיבורים'), contains('הרצת ניסוי'),
    contains('סט אבלואציה מקושר')), {userActions: actions(waitForText('אנליסט הוכחת קיום'), click('אנליסט הוכחת קיום'),
      waitForText('חיבורים'), click('חיבורים'), waitForText('סט אבלואציה מקושר'))})
})

Test('wonderPlatform.evaluationCatalog', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformTestApp(), and(
    contains('הרצה חדשה'), contains('ספרייה'), contains('איזה סוכן רוצים לבדוק?')), {
    userActions: actions(waitForText('פלאגין חדש'), click('אבלואציה'), waitForText('איזה סוכן רוצים לבדוק?')),
    logger: 'uiLogger'})
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

Test('wonderPlatform.chatContextPanel', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformTestApp(),
    and(contains('הקשר השיחה'), contains('שיחה חופשית')), {
    userActions: actions(waitForText('פלאגין חדש'), click('שיחה חדשה'), waitForText('הקשר השיחה'))})
})

Test('wonderPlatform.marketplacePluginWorkspace', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformMarketplaceTestApp(),
    and(contains('Marketplace API'), contains('2 גרסאות'), contains('config.yaml'), contains('חיבורים')), {
      userActions: actions(waitForText('פלאגין ראיות'), click('פלאגין ראיות'), waitForText('Marketplace API'),
        click('הנחיות'), waitForText('README.md'), click('כללי'), waitForText('Marketplace API'))})
})

Test('wonderPlatform.marketplaceSkillEditor', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformMarketplaceTestApp(),
    and(contains('תוכן המיומנות'), contains('Assets'), contains('Drop files here or browse')), {
      userActions: actions(waitForText('פלאגין ראיות'), click('מיומנויות'), waitForText('מיומנות ראיות'), click('מיומנות ראיות'),
        waitForText('Marketplace API'), click('תוכן המיומנות'), waitForText('SKILL.md'), click('Assets'),
        waitForText('Drop files here or browse'))})
})

Test('wonderPlatform.marketplaceToolEditor', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformMarketplaceTestApp(),
    and(contains('חיפוש ראיות'), contains('Connector מנוהל'), notContains('tool_type'), notContains('Code files')), {
      userActions: actions(waitForText('פלאגין ראיות'), click('כלים'), waitForText('חיפוש ראיות'), click('חיפוש ראיות'),
        waitForText('לא ניתן לעריכה'))})
})

Test('wonderPlatform.marketplaceAgentWorkspace', {
  impl: reactTest({
    testedComp: {$: 'react-comp<react>wonderPlatformMarketplaceTestApp'},
    expectedResult: and(
      contains('חיבורים'),
      contains('פלאגינים'),
      contains('ידע')
    ),
    userActions: actions(
      waitForText('פלאגין ראיות'),
      click('סוכנים'),
      waitForText('סוכן תמיכת לקוחות B2B'),
      click('סוכן תמיכת לקוחות B2B'),
      waitForText('חיבורים'),
      click('חיבורים'),
      waitForText('הוספה'),
      waitForText('פלאגינים')
    )
  })
})

Test('wonderPlatform.marketplaceAgentCreate', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformMarketplaceTestApp(), and(contains('README (creation only)'), contains('שמירה')), {
    userActions: actions(waitForText('פלאגין ראיות'), click('סוכנים'), waitForText('סוכן חדש'), click('סוכן חדש'),
      waitForText('הנחיות'), click('הנחיות'), waitForText('README (creation only)'))})
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

ReactComp('wonderPlatformWizardTestHost', {
  impl: comp({hFunc: (ctx, {react: {h, hh, useState}}) => {
    const Wizard = dsls.react['react-comp'].wonderPlatformWizard
    return () => {
      const [activeId, setActiveId] = useState('a')
      return hh(ctx, Wizard, {steps: [{id: 'a', label: 'ראשון', render: () => h('p', {}, 'תוכן ראשון')},
        {id: 'b', label: 'שני', render: () => h('p', {}, 'תוכן שני')},
        {id: 'c', label: 'חסום', disabled: true, render: () => h('p', {}, 'לא רואים')}], activeId, onStep: setActiveId})
    }
  }})
})

Test('wonderPlatform.wizardShell', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformWizardTestHost(), and(contains('תוכן שני'),
    notContains('תוכן ראשון'), notContains('לא רואים'), contains('חסום')), {
    userActions: actions(waitForText('ראשון'), click('שני'), waitForText('תוכן שני'))})
})
Test('wonderPlatform.marketplaceWUrlInterceptor', {
  nodeOnly: true,
  impl: dataTest({
    calculate: async ctx => {
      const {createServer} = await import('node:http')
      const server = createServer(async (request, response) => {
        const chunks = []
        for await (const chunk of request) chunks.push(chunk)
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({
          path: request.url,
          room: request.headers['x-wonder-room'],
          method: request.method,
          body: JSON.parse(Buffer.concat(chunks).toString() || 'null')
        }))
      })
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
      try {
        const skill = await dsls.common.data.wonderPlatformMarketplaceRequest.$runWithCtx(ctx, {
          method: 'PUT',
          wUrl: 'room://tenant-x/skills/skill-a?includeAssets=true',
          body: {skill_md: 'room scoped'},
          baseUrl: `http://127.0.0.1:${server.address().port}`
        })
        const knowledge = await dsls.common.data.wonderPlatformMarketplaceRequest.$runWithCtx(ctx, {
          wUrl: 'room://tenant-x/knowledge/', baseUrl: `http://127.0.0.1:${server.address().port}`
        })
        return {result: {skill, knowledge}, ...coreUtils.harvestLogs(ctx)}
      } finally {
        await new Promise(resolve => server.close(resolve))
      }
    },
    expectedResult: equals('%result%', asIs({
        skill: {
          path: '/api/v1/skills/skill-a?includeAssets=true',
          room: 'tenant-x',
          method: 'PUT',
          body: {skill_md: 'room scoped'}
        },
        knowledge: {path: '/api/v1/knowledge/', room: 'tenant-x', method: 'GET', body: null}
    })),
    timeout: 10000,
    logger: 'marketplaceLogger'
  })
})
UiAction('wonderPlatformSetControl', {
  params: [
    {id: 'label', as: 'string'},
    {id: 'placeholder', as: 'string'},
    {id: 'selector', as: 'string'},
    {id: 'value', as: 'string', mandatory: true}
  ],
  impl: ({}, {}, {label, placeholder, selector, value}) => ({
    async exec({vars: {win}}) {
      const controls = [...win.document.querySelectorAll(selector || 'input, textarea')]
      const control = selector ? controls[0] : controls.find(element => label ? element.parentElement?.textContent.trim().startsWith(label)
        : element.placeholder?.includes(placeholder))
      if (!control || control.disabled) throw new Error(`Control unavailable: ${label || placeholder || selector}`)
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), 'value').set.call(control, value)
      control.dispatchEvent(new win.Event('input', {bubbles: true}))
      control.dispatchEvent(new win.Event('change', {bubbles: true}))
      control.dispatchEvent(new win.FocusEvent('focusout', {bubbles: true}))
      await win.waitForMutations(100)
    }
  })
})
UiAction('wonderPlatformClickInSection', {
  params: [
    {id: 'section', as: 'string', mandatory: true},
    {id: 'button', as: 'string', mandatory: true}
  ],
  impl: ({}, {}, {section, button}) => ({
    async exec({vars: {win}}) {
      const candidates = [...win.document.querySelectorAll('section, div')].filter(element => element.textContent.includes(section))
        .sort((left, right) => left.textContent.length - right.textContent.length)
      const target = candidates.flatMap(element => [...element.querySelectorAll('button')])
        .find(element => element.outerHTML.includes(button))
      if (!target) throw new Error(`Button not found: ${section} / ${button}`)
      target.dispatchEvent(new win.MouseEvent('click', {bubbles: true, cancelable: true}))
      await win.waitForMutations(100)
    }
  })
})
UiAction('wonderPlatformWaitForButtonGone', {
  params: [
    {id: 'text', as: 'string', mandatory: true},
    {id: 'timeout', as: 'number', defaultValue: 5000}
  ],
  impl: ({}, {}, {text, timeout}) => ({
    async exec({vars: {win}}) {
      const started = Date.now()
      while ([...win.document.querySelectorAll('button')].some(element => element.outerHTML.includes(text))) {
        if (Date.now() - started > timeout) throw new Error(`Button did not disappear: ${text}`)
        await new Promise(resolve => setTimeout(resolve, 20))
      }
    }
  })
})
UiAction('wonderPlatformUploadAsset', {
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'content', as: 'string', mandatory: true},
    {id: 'mimeType', as: 'string', mandatory: true}
  ],
  impl: ({}, {}, {name, content, mimeType}) => ({
    async exec({vars: {win}}) {
      const input = win.document.querySelector('input[data-skill-assets]')
      if (!input) throw new Error('Skill asset input unavailable')
      Object.defineProperty(input, 'files', {configurable: true, value: [new win.File([content], name, {type: mimeType})]})
      input.dispatchEvent(new win.Event('change', {bubbles: true}))
      await win.waitForMutations(100)
    }
  })
})

const { wonderPlatformClickInSection, wonderPlatformSetControl, wonderPlatformUploadAsset, wonderPlatformWaitForButtonGone } =
  dsls.react['ui-action']

Test('wonderPlatform.navGuardPrompts', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformMarketplaceTestApp(),
    and(contains('ארגז הכלים שעומד ברשות הסוכנים'), notContains('שינויים שלא נשמרו')), {
      userActions: actions(waitForText('פלאגין ראיות'), click('מיומנויות'), waitForText('מיומנות ראיות'), click('מיומנות ראיות'),
        waitForText('Marketplace API'),
        wonderPlatformSetControl({selector: '[aria-label="display_name"]', value: 'מיומנות ששונתה'}),
        click('כלים'), waitForText('שינויים שלא נשמרו'), click('עזיבה בלי שמירה'),
        waitForText('ארגז הכלים שעומד ברשות הסוכנים'))})
})

Test('wonderPlatform.flowToolWizard', {
  impl: reactTest(dsls.react['react-comp'].wonderPlatformMarketplaceTestApp(),
    and(contains('קוביות פלט'), contains('Orders Cube'), contains('פרמטרים'), notContains('טעינת מארז')), {
      userActions: actions(waitForText('פלאגין ראיות'), click('כלים'), waitForText('כלי ממארז Flow'),
        click('כלי ממארז Flow'), waitForText('טעינת מארז'), wonderPlatformSetControl('מזהה מארז Flow', {value: '7'}),
        click('טעינת מארז'), waitForText('E-commerce Analytics'), click('פרמטרים'), waitForText('Category'),
        click('קוביות פלט'), waitForText('בחר קוביות פלט'), click('בחר קוביות פלט'), click('Orders Cube'))})
})

Test('wonderPlatform.marketplaceSkillAssetUpload', {
  impl: reactTest(wonderPlatformMarketplaceTestApp(), and(contains('checklist.md'), contains('text/markdown')), {
    userActions: actions(
      waitForText('פלאגין ראיות'),
      click('מיומנויות'),
      waitForText('מיומנות ראיות'),
      click('מיומנות ראיות'),
      waitForText('כללי'),
      click('Assets'),
      waitForText('Drop files here or browse'),
      wonderPlatformUploadAsset('checklist.md', '# Checklist', { mimeType: 'text/markdown' }),
      waitForText('checklist.md')
    )
  })
})

Test('wonderPlatform.workspaceSavesOnlyFromButton', {
  impl: reactTest(wonderPlatformTestApp(), contains('פלאגין שנשמר'), {
    userActions: actions(
      waitForText('אנליסט הוכחת קיום'),
      click('אנליסט הוכחת קיום'),
      waitForText('חיבורים'),
      wonderPlatformSetControl({selector: '[aria-label="display_name"]', value: 'טיוטה שלא נשמרה'}),
      click('aria-label="חזרה לפלאגינים"'),
      waitForText('שינויים שלא נשמרו'),
      click('עזיבה בלי שמירה'),
      waitForText('אנליסט הוכחת קיום'),
      click('אנליסט הוכחת קיום'),
      wonderPlatformSetControl({selector: '[aria-label="display_name"]', value: 'פלאגין שנשמר'}),
      click('aria-label="שמירת סביבת עבודה"'),
      waitForText('נשמר'),
      click('aria-label="חזרה לפלאגינים"'),
      waitForText('פלאגין שנשמר')
    ),
    logger: 'uiLogger'
  })
})

Test('wonderPlatform.marketplaceAgentCreateRelations', {
  impl: reactTest({
    testedComp: wonderPlatformMarketplaceTestApp(),
    expectedResult: and(contains('מיומנות ראיות'), contains('פלאגין ראיות'), contains('שמירה')),
    userActions: actions(
      waitForText('פלאגין ראיות'),
      click('סוכנים'),
      waitForText('סוכן חדש'),
      click('סוכן חדש'),
      waitForText('חיבורים'),
      click('חיבורים'),
      wonderPlatformClickInSection('מיומנויות', 'הוספה'),
      waitForText('אישור בחירה'),
      click('מיומנות ראיות'),
      click('אישור בחירה'),
      wonderPlatformWaitForButtonGone('אישור בחירה'),
      wonderPlatformClickInSection('פלאגינים', 'הוספה'),
      waitForText('אישור בחירה'),
      click('פלאגין ראיות'),
      click('אישור בחירה'),
      wonderPlatformWaitForButtonGone('אישור בחירה')
    ),
    logger: 'uiLogger'
  })
})

Test('wonderPlatform.chatRunsSelectedAgent', {
  impl: reactTest(wonderPlatformAgentChatTestApp(), contains('AGNO_AGENT:ag1'), {
    userActions: actions(
      waitForText('פלאגין חדש'),
      click('שיחה חדשה'),
      waitForText('הקשר השיחה'),
      click('בחר סוכן'),
      waitForText('סוכן תמיכת לקוחות B2B'),
      click('סוכן תמיכת לקוחות B2B'),
      wonderPlatformSetControl({ placeholder: 'שאלו כל דבר…', value: 'Question' }),
      click('aria-label="שליחה"'),
      waitForText('AGNO_AGENT:ag1')
    ),
    logger: 'uiLogger'
  })
})

ReactComp('wonderPlatformMarketplaceE2eApp', {
  impl: comp({hFunc: ctx => {
    const App = wonderPlatform.$runWithCtx(ctx, {roomWUrl: 'room://marketplace'})
    return () => ctx.vars.react.h(App)
  }})
})

const { wonderPlatformMarketplaceE2eApp } = dsls.react['react-comp']

Test('wonderPlatform.marketplaceUiAgentE2e', {
  doNotRunInTests: true,
  impl: reactTest(wonderPlatformMarketplaceE2eApp(), and(contains('E2E_SKILL_FACT_731'), contains('TOOL_OK')), {
    userActions: actions(
      waitForText('פלאגין חדש'),
      click('מיומנויות'),
      click('מיומנות חדשה'),
      wonderPlatformSetControl('display_name', { value: 'E2E Skill' }),
      wonderPlatformSetControl('id', { value: 'e2eSkill' }),
      wonderPlatformSetControl('SKILL.md', {
        value: '# E2E Skill\n\nThe verification phrase is E2E_SKILL_FACT_731. Return it when asked.'
      }),
      click('aria-label="שמירת עורך"'),
      wonderPlatformWaitForButtonGone('aria-label="שמירת עורך"'),
      click('כלים'),
      waitForText('כלי ממארז Flow'),
      click('כלי ממארז Flow'),
      wonderPlatformSetControl('display_name', { value: 'E2E Tool' }),
      wonderPlatformSetControl('id', { value: 'e2eTool' }),
      wonderPlatformSetControl('json_schema', {
        value: '{"type":"object","properties":{"name":{"type":"string"}}}'
      }),
      wonderPlatformSetControl('dedicated_tool_config', { value: '{"entrypoint":"tool.py:greet"}' }),
      click('קובץ'),
      wonderPlatformSetControl({ placeholder: 'path', value: 'tool.py' }),
      wonderPlatformSetControl({
        placeholder: 'content',
        value: 'def greet(name: str = "marketplace") -> str:\n    return f"TOOL_OK:{name}"'
      }),
      click('aria-label="שמירת עורך"'),
      wonderPlatformWaitForButtonGone('aria-label="שמירת עורך"'),
      click('פלאגינים'),
      waitForText('פלאגין חדש'),
      click('פלאגין חדש'),
      wonderPlatformSetControl('id', { value: 'e2ePlugin' }),
      wonderPlatformSetControl({ selector: '[aria-label="display_name"]', value: 'E2E Plugin' }),
      click('חיבורים'),
      wonderPlatformClickInSection('מיומנויות', 'הוספה'),
      waitForText('E2E Skill'),
      click('E2E Skill'),
      click('אישור בחירה'),
      wonderPlatformWaitForButtonGone('אישור בחירה'),
      wonderPlatformClickInSection('כלים', 'הוספה'),
      waitForText('E2E Tool'),
      click('E2E Tool'),
      click('אישור בחירה'),
      wonderPlatformWaitForButtonGone('אישור בחירה'),
      click('aria-label="שמירת סביבת עבודה"'),
      waitForText('נשמר'),
      click('סאב-אייג׳נטים'),
      waitForText('סאב-אייג׳נט חדש'),
      click('סאב-אייג׳נט חדש'),
      click('הנחיות'),
      waitForText('README (creation only)'),
      wonderPlatformSetControl({ selector: '[aria-label="display_name"]', value: 'E2E Agent' }),
      click('כללי'),
      wonderPlatformSetControl('id', { value: 'e2eAgent' }),
      click('הנחיות'),
      wonderPlatformSetControl('system_prompt', {
        value: 'Use the attached plugin. Return its skill fact and exact tool result.'
      }),
      click('aria-label="שמירת סביבת עבודה"'),
      click('כללי'),
      waitForText('Marketplace API'),
      click('חיבורים'),
      wonderPlatformClickInSection('פלאגינים', 'הוספה'),
      waitForText('E2E Plugin'),
      click('E2E Plugin'),
      click('אישור בחירה'),
      wonderPlatformWaitForButtonGone('אישור בחירה'),
      click('aria-label="שמירת סביבת עבודה"'),
      waitForText('נשמר'),
      wonderPlatformSetControl({
        placeholder: 'נסה את הסאב-אייג׳נט',
        value: 'What is the verification phrase? Call the plugin tool with name browser.'
      }),
      click('aria-label="הרצה"'),
      waitForText('E2E_SKILL_FACT_731', 20000),
      waitForText('TOOL_OK', 20000)
    ),
    logger: 'uiLogger,marketplaceLogger,agentOsLogger',
    setup: {$: 'ctx-enricher<tgp>wonderPlatformMarketplaceE2eSetup'},
    timeout: 60000
  })
})
CtxEnricher('wonderPlatformMarketplaceE2eSetup', {
  impl: async ctx => {
    await Promise.all(['agents/e2eAgent', 'plugins/e2ePlugin', 'skills/e2eSkill', 'tools/e2eTool'].map(path =>
      fetch(`http://localhost:7777/api/v1/${path}`, {method: 'DELETE'})))
    return ctx
  }
})
