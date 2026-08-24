import { dsls, jb } from '@jb6/core'
import '@jb6/llm-guide'
import '@wonder/ai/llm-flow-main-workflow.js'
import './wonder-platform-domain.js'
import './wonder-platform-skills.js'

const {
  common: { Data },
  'llm-guide': { Booklet, Doclet, booklet: { booklet } },
  ai: { Workflow, workflow: { mainWorkflow }, mpi: { mpi } }
} = dsls

Booklet('wonderPlatform', {impl: booklet('wonderPlatformAssets,wonderPlatformResponse')})

Doclet('wonderPlatformAssets', {
  impl: `
The ASSET_REPOSITORY in the prompt is authoritative room data.
LOADED_SKILLS contains the selected published Markdown doclets and is authoritative for how to perform the task.
Use only ASSET_REPOSITORY plugins, skill metadata, tools, subagents and reports.
Honor the selected target instructions and connected asset IDs.
Never claim that a connector ran when its room asset supplies no result.
A verified report may be cited only by a real report id from ASSET_REPOSITORY.
`
})

Doclet('wonderPlatformResponse', {
  impl: `
Answer in the user's language, concisely and professionally.
Lead with the conclusion, then name supporting evidence and any material gap.
Return zero to three reportIds that directly support the answer. Prefer status "מאומת" reports.
followUps contains two short, useful next questions.
`
})

Doclet('essentialOutputFormat.wonderPlatform', {
  impl: `
Return one javascript code block containing one flow.
The flow has one setCtxData element whose jqSingle exp is a literal object.
The object shape is {text: string, reportIds: string[], followUps: string[]}.
Escape quotes for one jq string and emit no other code.
Example:
\`\`\`javascript
{$: 'flow-elem<ai>flow', elems: [
  {$: 'flow-elem<ai>setCtxData', goal: 'Compose grounded answer', status: 'מנסח תשובה מאומתת...',
    value: {$: 'data<common>jqSingle', exp: '{text:"המסקנה המבוססת",reportIds:["r1"],followUps:["בדוק פער","הצג מקורות"]}'}}
]}
\`\`\`
`
})

Workflow('wonderPlatformAgent', {
  params: [{id: 'model', as: 'string', defaultValue: 'gemini/gemini-3.5-flash'}],
  impl: mainWorkflow({
    main: mpi('%$model%', {
      prompt: `USER_MESSAGE: %$userMessage%
SELECTED_TARGET: %$selectedTarget%
CHAT_HISTORY: %$chatHistory%
ASSET_REPOSITORY: %$assetRepoText%
LOADED_SKILLS:
%$loadedSkillDoclets%
Return a grounded answer and relevant verified report ids.`,
      instructions: `%$llmFlowBooklet%
%$wonderPlatform%
Use the exact structured response flow and no unavailable component.`,
      thinkingBudget: 0
    }),
    categories: ['wonderPlatform'],
    bookletsToLoad: ['wonderPlatform']
  })
})

Data('wonderPlatformAnswer', {
  params: [
    {id: 'text', as: 'string', mandatory: true},
    {id: 'target', as: 'object', mandatory: true},
    {id: 'repo', as: 'object', mandatory: true},
    {id: 'history', as: 'array', defaultValue: []},
    {id: 'roomWUrl', as: 'string', defaultValue: 'room:minio//wonder-platform'},
    {id: 'loadSkills', dynamic: true,
      defaultValue: dsls.common.data.wonderPlatformLoadTargetSkills('%$roomWUrl%', '%$target%')},
    {id: 'agentWorkflow', type: 'workflow<ai>', dynamic: true, defaultValue: dsls.ai.workflow.wonderPlatformAgent()}
  ],
  impl: async (ctx, {}, {text, target, repo, history, roomWUrl, loadSkills, agentWorkflow}) => {
    const startedAt = Date.now(), loadedSkills = (await loadSkills(ctx.setVars({roomWUrl, target}))).filter(Boolean)
    const assetRepo = {target, skills: loadedSkills.map(({content, ...skill}) => skill),
      tools: repo.tools.filter(item => target.toolIds?.includes(item.id)),
      subagents: repo.subagents.filter(item => target.subagentIds?.includes(item.id)), reports: repo.reports}
    const loadedSkillDoclets = loadedSkills.map(skill => jb.coreUtils.sourceRefs.wrap(
      `${skill.id}@${skill.version}`, skill.content)).join('\n\n')
    const workflowCtx = await jb.workflowUtils.extendWithWorkflowVars(ctx.setVars({userMessage: text, selectedTarget: JSON.stringify(target),
      chatHistory: JSON.stringify(history), assetRepoText: JSON.stringify(assetRepo), loadedSkillDoclets,
      accumulatedContext: {chatHistory: history},
      llmProxyUrl: globalThis.LLM_PROXY_URL || 'https://node25-automations-server-365199207445.me-west1.run.app/llmProxy'}))
    const result = await agentWorkflow(ctx).calcWorkflow(workflowCtx), output = typeof result.runRes == 'string' ? {text: result.runRes} : result.runRes || {}
    return {text: output.text || result.workflowErrors?.[0]?.t || 'ההרצה הסתיימה ללא תשובה.', reportIds: output.reportIds || [],
      followUps: output.followUps || [], status: result.workflowErrors?.length ? 'נכשל' : 'הושלם',
      duration: `${Math.max(1, Math.round((Date.now() - startedAt) / 1000))} שנ׳`, runId: result.runId || result.traceId,
      opikUrl: result.opikUrl, loadedSkillIds: loadedSkills.map(skill => skill.id),
      runtimeSteps: (result.workflowTrace || []).filter(step => step.flowIndex != null).map((step, index) => ({
        kind: index ? 'כלי' : 'מודל', title: step.setVars ? Object.keys(step.setVars)[0] : `שלב llm-flow ${index + 1}`, runtime: true}))}
  }
})
