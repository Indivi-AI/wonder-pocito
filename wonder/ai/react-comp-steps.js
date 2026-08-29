import { jb, dsls, coreUtils } from '@jb6/core'
import '@jb6/react'
import '@jb6/llm-guide'
import '@wonder/db/db-drivers.js'
import './llm-flow-core.js'
import { parse } from '@jb6/lang-service/lib/acorn.mjs'

const { wfetch2 } = jb.wonderUtils
const {
  common: { Data },
  'llm-guide': { Doclet, doclet: { dataComp }, guidance: { example, mustDo, doNot }, explanationPoint: { explanation, syntax, whenToUse } }
} = dsls

Data('fetchReactCompSource', {
  description: 'GET a room react-comp source file (importless module body, .js wUrl) as text. cache-busted: gcs serves these objects with '
    + 'default public max-age 3600, and a stale read shows viewers old content AND makes the next section-merge silently revert newer edits',
  params: [
    {id: 'wUrl', as: 'string', mandatory: true}
  ],
  impl: async (ctx, {workflowLogger}, {wUrl}) => {
    const res = await wfetch2(`${wUrl}${wUrl.includes('?') ? '&' : '?'}cacheKiller=${Date.now()}`, { method: 'GET' }, ctx)
    const source = res?.ok ? await res.text() : null
    workflowLogger?.info({ t: 'fetchReactCompSource', wUrl, ok: !!res?.ok, bytes: source?.length || 0 }, {}, { ctx })
    return source ?? { error: `fetchReactCompSource ${res?.status} ${wUrl}` }
  }
})

const sectionName = ({ type, declarations, id, expression }) =>
  type == 'VariableDeclaration' ? declarations.map(d => d.id.name || d.init?.name || 'destructure').join(',')
  : type == 'FunctionDeclaration' ? id.name
  : expression?.type == 'CallExpression' && expression.callee.name
    ? [expression.callee.name, expression.arguments[0]?.value].filter(x => typeof x == 'string').join('.')
  : type
const compSections = source => parse(source, { ecmaVersion: 'latest' }).body.reduce((acc, node) => {
  const base = sectionName(node), dups = acc.filter(s => s.base == base).length
  return [...acc, { base, name: dups ? `${base}.${dups + 1}` : base, start: node.start, end: node.end }]
}, [])
const fencedBlocks = txt => [...String(txt || '').matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map(m => m[1])

Data('compSection', {
  description: 'the source text of one top-level section of a comp source, by name prefix (e.g. Deck. matches Deck.pocitoDeck)',
  params: [
    {id: 'name', as: 'string', mandatory: true},
    {id: 'source', as: 'text', defaultValue: '%%'}
  ],
  impl: (ctx, {}, {name, source}) => {
    const section = compSections(source).find(s => s.name.startsWith(name))
    return section ? source.slice(section.start, section.end) : { error: `no section ${name} in the source` }
  }
})

Data('sectionedCompSource', {
  description: 'the source annotated with a // SECTION <name> marker above each top-level statement - the addressable view the edit llm sees',
  params: [
    {id: 'source', as: 'text', defaultValue: '%%'}
  ],
  impl: (ctx, {}, {source}) => compSections(source).reduceRight((text, {name, start}) =>
    text.slice(0, start) + `// SECTION ${name}\n` + text.slice(start), source)
})

const mergeCompEdits = Data('mergeCompEdits', {
  description: 'ast splice: each ```javascript fence opening with // EDIT <section> replaces that top-level statement of base (acorn start/end offsets)',
  params: [
    {id: 'base', as: 'text', mandatory: true, description: 'the current full source the section names resolve against'},
    {id: 'edits', as: 'text', defaultValue: '%%', description: 'llm response text holding the // EDIT fences'}
  ],
  impl: (ctx, {workflowLogger}, {base, edits}) => {
    if (edits.trim() == '{}') return { error: 'the llm returned no answer (model unavailable, request failed or run aborted)' }
    const blocks = fencedBlocks(edits).map(b => ({ name: b.match(/^\s*\/\/ EDIT (\S+)/)?.[1], code: b.replace(/^\s*\/\/ (EDIT|SECTION) .*\r?\n/gm, '').trim() }))
    const sections = compSections(base)
    if (!blocks.length && /NO_CHANGES|no changes/i.test(edits)) {
      workflowLogger?.info({ t: 'mergeCompEdits noChanges', reply: edits.slice(0, 200) }, {}, { ctx })
      return base
    }
    if (!blocks.length) return { error: 'response has no ```javascript fenced block' }
    if (blocks.some(b => !b.name))
      return { error: 'never send the whole file - reply ONLY with the changed sections, each in its own ```javascript block opening with '
        + `// EDIT <sectionName>. sections: ${sections.map(s => s.name).join(', ')}` }
    const missing = blocks.filter(b => !sections.some(s => s.name == b.name)).map(b => b.name)
    if (missing.length) return { error: `unknown section(s) ${missing.join(', ')}. valid sections: ${sections.map(s => s.name).join(', ')}` }
    const byName = Object.fromEntries(blocks.map(b => [b.name, b.code]))
    const merged = sections.reduceRight((text, {name, start, end}) => byName[name] == null ? text : text.slice(0, start) + byName[name] + text.slice(end), base)
    workflowLogger?.info({ t: 'mergeCompEdits', sections: Object.keys(byName), editBytes: edits.length, mergedBytes: merged.length }, {}, { ctx })
    return merged
  }
})

const evalReactCompSource = Data('evalReactCompSource', {
  description: 'compile + run an importless comp source with (dsls, coreUtils, jb), (re)registering its comps and flushing stale built comps. source flows via ctx.data',
  params: [
    {id: 'compId', as: 'string', mandatory: true, description: 'react-comp id the source must (re)register'},
    {id: 'source', as: 'text', defaultValue: '%%'}
  ],
  impl: (ctx, {workflowLogger, uiLogger}, {compId, source}) => {
    const logger = workflowLogger || uiLogger
    const before = Object.fromEntries(Object.entries(dsls.react['react-comp']))
    try {
      parse(source, { ecmaVersion: 'latest' })
      new Function('dsls', 'coreUtils', 'jb', source)(dsls, coreUtils, jb)
    } catch (error) {
      logger?.error({ t: 'evalReactCompSource failed', compId, error: `${error.name}: ${error.message}` }, { source: source?.slice(0, 500) }, { ctx })
      return { error: `${error.name}: ${error.message}` }
    }
    const changed = Object.keys(dsls.react['react-comp']).filter(id => dsls.react['react-comp'][id] !== before[id])
    if (!changed.includes(compId)) return { error: `source ran but did not register ReactComp('${compId}')` }
    // built comps are cached by lexical path - drop ONLY the builds of re-registered comps, so untouched hosts keep their identity and never remount
    const staleBuilds = Object.keys(jb.reactRepository.comps).filter(key => changed.some(id => key.includes(`>${id}~`)))
    staleBuilds.forEach(key => delete jb.reactRepository.comps[key])
    logger?.info({ t: 'evalReactCompSource registered', compId, changed, staleBuilds: staleBuilds.length, bytes: source.length }, {}, { ctx })
    return { compId, registered: true }
  }
})

Data('validReactCompSource', {
  moreTypes: 'boolean<common>',
  description: 'until-verifier: the // EDIT fences of ctx.data merge over base into a source that compiles and re-registers compId; returns {satisfied, reason}',
  params: [
    {id: 'compId', as: 'string', mandatory: true},
    {id: 'base', as: 'text', defaultValue: '%$compSource%'}
  ],
  impl: async (ctx, {}, {compId, base}) => {
    const merged = await ctx.run(mergeCompEdits(base))
    if (merged.error) return { satisfied: false, reason: merged.error }
    const res = await ctx.setData(merged).run(evalReactCompSource(compId))
    return res.error ? { satisfied: false, reason: res.error } : { satisfied: true }
  }
})

Data('uploadReactComp', {
  description: 'upload a react-comp source to its room wUrl (the room serves the applet from this file). validates by compile+register before the PUT',
  params: [
    {id: 'wUrl', as: 'string', mandatory: true},
    {id: 'compId', as: 'string', mandatory: true},
    {id: 'source', as: 'text', defaultValue: '%%', description: 'the full importless module body (already merged - plain code, no fences)'}
  ],
  impl: async (ctx, {workflowLogger}, {wUrl, compId, source}) => {
    const valid = await ctx.setData(source).run(evalReactCompSource(compId))
    if (valid.error) return { error: valid.error, wUrl, compId }
    const res = await wfetch2(wUrl, { method: 'PUT', body: source, headers: {'content-type': 'application/javascript'} }, ctx)
    workflowLogger?.info({ t: 'uploadReactComp', wUrl, compId, ok: !!res?.ok, bytes: source.length }, {}, { ctx })
    return res?.ok ? { ok: true, wUrl, compId, bytes: source.length } : { error: `uploadReactComp PUT ${res?.status}`, wUrl, compId }
  }
})

Data('seedRoomCompFromModule', {
  description: 'node-side seeding: read a repo module, strip its import lines (deps come from the host bundle) and PUT the body as a room comp source',
  params: [
    {id: 'modulePath', as: 'string', mandatory: true, description: 'repo-relative module, e.g. admin/pocito/pocito-deck.js'},
    {id: 'wUrl', as: 'string', mandatory: true}
  ],
  impl: async (ctx, {dbLogger}, {modulePath, wUrl}) => {
    const { readFile } = await import('fs/promises')
    const source = (await readFile(`${await coreUtils.calcRepoRoot()}/${modulePath}`, 'utf8'))
      .split('\n').filter(line => !line.startsWith('import ')).join('\n')
    const res = await wfetch2(wUrl, { method: 'PUT', body: source, headers: {'content-type': 'application/javascript'} }, ctx)
    dbLogger?.info?.({ t: 'seedRoomCompFromModule', modulePath, wUrl, ok: !!res?.ok, bytes: source.length }, {}, { ctx })
    return { seeded: !!res?.ok, seedBytes: source.length, wUrl }
  }
})

Doclet('reactCompEditing', {
  impl: `You edit the source of a jb6 ReactComp stored as a room file.
The file is an importless module body: it runs with three parameters in scope - dsls, coreUtils, jb. NEVER add import or export statements.
The source is shown with a // SECTION <name> marker above each top-level statement.
Reply ONLY with the sections you change: for each one, ONE \`\`\`javascript fenced block whose first line is // EDIT <name>,
followed by the COMPLETE replacement of that whole top-level statement. Never reply with the whole file, never output unchanged
sections, never write omissions like "// rest unchanged" - each block fully replaces its section, so every line of the statement must be there.
If the request is already satisfied and nothing needs to change, reply with exactly NO_CHANGES plus a short reason - no code fences.
Keep the ReactComp('<id>', ...) registrations and comp ids exactly as they are; change only what the request needs.
The system context holds accumulatedContext.chatHistory - the conversation so far. "revert" / "undo" means restore the state
before the previous edit: find in the history what was changed and put those sections back to their prior values.
Styling is tailwind classes inside h() type strings: h('div:flex gap-2 bg-blue-600 text-white', {...}, ...children). Edit styles by editing these class strings.
Files with CSS template strings are styled there - the css may be split across several CSS_* constants (each its own section);
edit ONLY the constant holding the rules you change. When the request names a color, use exactly that color
(the css color name like green, or its standard tailwind class like text-green-500) - never substitute an existing theme accent for it.
h('L:IconName', {size}) renders a lucide icon. Keep every line under 180 characters.
If PREVIOUS ATTEMPT FAILURE is non empty, it is the error of your last answer - fix that exact problem.`
})

Doclet('uploadReactCompDataComponent', {
  impl: dataComp('uploadReactComp', {
    guidance: [
      example(`
// fetch a room react-comp source, then upload an edited version. the room serves the applet from this file - upload makes the edit live
{$: 'flow-elem<ai>setCtxVar', goal: 'read current source', varName: 'compSource',
  value: {$: 'data<common>fetchReactCompSource', wUrl: 'room://pocito/reactComps/chatUi.js'}}
{$: 'flow-elem<ai>setCtxData', goal: 'save edited source',
  value: {$: 'data<common>uploadReactComp', wUrl: 'room://pocito/reactComps/chatUi.js', compId: 'chatUi'}}
`),
      mustDo('pass compId - upload validates the source compiles AND re-registers ReactComp(compId) before writing'),
      doNot('PUT comp source with wonderPut or wFetch directly', { reason: 'uploadReactComp is the guarded path: broken source never overwrites a working applet' })
    ],
    explaination: [
      explanation('uploadReactComp(wUrl, compId, source=%%): validate then PUT an importless comp source to the room; returns {ok,wUrl,compId,bytes} or {error}'),
      explanation('fetchReactCompSource(wUrl): the source text of a room react-comp'),
      explanation('evalReactCompSource(compId, source=%%): compile+register without writing - the dry-run half of uploadReactComp'),
      explanation('sectionedCompSource(source=%%) + mergeCompEdits(base, edits=%%): the section-edit pair - mark top-level statements with '
        + '// SECTION names for the llm, then ast-splice its // EDIT fences back over them'),
      syntax('source is an importless module body run with (dsls, coreUtils, jb)', 'deps come pre-registered from the host page bundle'),
      whenToUse('when a user asks to change a room-served applet: fetch source, edit, uploadReactComp - the applet is live on next render')
    ]
  })
})
