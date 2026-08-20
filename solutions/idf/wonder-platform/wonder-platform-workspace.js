import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformWorkspace', {
  impl: comp({
    hFunc: (ctx, {react: {h, useEffect, useState}}) => props => {
      const {workspace, repo, back, saveWorkspace, openPicker, openEditor, runTarget, runEval} = props
      const {classes, labels} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx), [draft, setDraft] = useState({...workspace.item})
      const [panelOpen, setPanelOpen] = useState(true), [tab, setTab] = useState('test'), [testInput, setTestInput] = useState('')
      const [runs, setRuns] = useState([]), [evaluationId, setEvaluationId] = useState(workspace.item.evaluationId || '')
      const [evaluationRun, setEvaluationRun] = useState(), [detail, setDetail] = useState(-1)
      useEffect(() => { setDraft({...workspace.item}); setEvaluationId(workspace.item.evaluationId || '') }, [workspace.item])
      const targetLabel = workspace.resource == 'plugins' ? 'הפלאגין' : 'הסאב-אייג׳נט', persist = next => (setDraft(next), saveWorkspace(next))
      const relationRows = workspace.resource == 'plugins' ? [['skillIds', 'skills', 'מיומנויות'], ['toolIds', 'tools', 'כלים']]
        : [['pluginIds', 'plugins', 'פלאגינים'], ['skillIds', 'skills', 'מיומנויות'], ['toolIds', 'tools', 'כלים'],
          ['subagentIds', 'subagents', 'סאב-אייג׳נטים']]
      const semanticTrace = dsls.common.data.wonderPlatformTrace.$runWithCtx(ctx, {repo, target: draft})
      const lastRun = repo.evalRuns.filter(run => run.targetId == draft.id).sort((a, b) => b.startedAt - a.startedAt)[0]
      const sendTest = async input => {
        const text = input.trim()
        if (!text || runs.some(run => run.status == 'מריץ…')) return
        const id = `test-${Date.now()}`, pending = {id, input: text, status: 'מריץ…', trace: semanticTrace}
        setRuns(items => [...items, pending]); setTestInput('')
        try {
          const result = await runTarget(text, draft, [])
          setRuns(items => items.map(run => run.id == id ? {...run, ...result, output: result.text, status: result.status,
            trace: [...semanticTrace, ...(result.runtimeSteps || [])]} : run))
        } catch (error) {
          setRuns(items => items.map(run => run.id == id ? {...run, status: 'נכשל', output: String(error.message || error)} : run))
        }
      }
      const executeEval = async () => {
        const evaluation = repo.evaluations.find(item => item.id == evaluationId)
        if (!evaluation || evaluationRun?.status == 'מריץ…') return
        setEvaluationRun({status: 'מריץ…', rows: []}); setEvaluationRun(await runEval(evaluation, workspace.resource, draft))
      }
      const relationSection = ([field, resource, title]) => h(`section:${classes.card}`, {key: field},
        h('div:flex items-center justify-between', {}, h('div:flex items-center gap-2', {}, h('b', {}, title),
          h(`span:${classes.chip}`, {}, draft[field]?.length || 0)), h(`button:${classes.button}`, {
            onClick: () => openPicker(field, resource, title)}, h('L:Plus', {size: 14}), 'הוספה')),
        h('div:mt-3 space-y-3', {}, (draft[field] || []).map(id => {
          const item = repo[resource].find(value => value.id == id), managed = resource == 'tools' && item?.managed
          if (!item) return null
          const inherited = resource == 'skills' ? item.toolIds?.map(toolId => ['כלי', repo.tools.find(value => value.id == toolId)?.name])
            : resource == 'subagents' ? [...(item.skillIds || []).map(skillId => ['מיומנות', repo.skills.find(value => value.id == skillId)?.name]),
              ...(item.toolIds || []).map(toolId => ['כלי', repo.tools.find(value => value.id == toolId)?.name])] : []
          return h('article:rounded-xl border border-[#e5e9e7] p-3', {key: id}, h('div:flex items-start gap-3', {},
            h('span:grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#edf6f0] text-xs font-bold text-[#315e46]', {}, item.mark),
            h('div:min-w-0 flex-1', {}, h('b:block text-sm', {}, item.name), h('p:mt-1 text-xs leading-5 text-[#808984]', {}, item.desc),
              managed && h('span:text-[10px] text-[#8b948f]', {title: 'כלי מנוהל — לא ניתן לעריכה'}, 'Connector · MCP · מנוהל')),
            !managed && h('button:rounded-lg p-1.5 hover:bg-gray-100', {onClick: () => openEditor(resource, item), 'aria-label': 'עריכה'},
              h('L:Pencil', {size: 14})), h('button:rounded-lg p-1.5 hover:bg-red-50', {onClick: () => persist({...draft,
                [field]: draft[field].filter(value => value != id)}), 'aria-label': `הסרה ${title}`}, h('L:X', {size: 14}))),
          inherited.filter(value => value[1]).length > 0 && h('div:mt-3 border-t border-dashed border-[#e6ebe8] pt-2', {},
            h('span:text-[10px] text-[#97a09b]', {}, `נכנס דרך ${labels[resource]}`), h('div:mt-2 flex flex-wrap gap-2', {},
              inherited.filter(value => value[1]).map(([kind, name]) => h(`span:${classes.chip}`, {key: kind + name}, `${kind} · ${name}`)))) )
        })))
      const testPanel = h('div:flex h-full flex-col', {}, h('div:flex-1 space-y-4 overflow-y-auto p-4', {}, runs.length ? runs.map((run, index) => h(
        'article:overflow-hidden rounded-xl border border-[#dfe5e1] bg-white', {key: run.id}, h('div:flex items-center justify-between border-b ' +
          'bg-[#f6f8f7] px-4 py-3', {}, h('div', {}, h('b:font-mono text-xs', {}, `RUN ${String(index + 1).padStart(2, '0')}`),
          h('div:mt-1 text-[10px] text-[#8b948f]', {}, 'הרצה עצמאית · ללא הקשר מהרצות קודמות')), h('div:flex items-center gap-2', {},
          h(`span:${classes.chip}`, {}, run.status), run.opikUrl && h('a:text-xs text-[#2f6b4b]', {href: run.opikUrl}, 'Opik ↗'))),
        h('div:space-y-3 p-4', {}, h('div', {}, h('b:text-[10px] text-[#8b948f]', {}, 'קלט ההרצה'), h('p:mt-1 text-sm', {}, run.input)),
          h('div', {}, h('b:text-[10px] text-[#8b948f]', {}, 'מעקב הרצה'), h('div:mt-2 space-y-1', {}, (run.trace || []).map((step, stepIndex) => h(
            'div:flex items-center gap-2 rounded-lg bg-[#f7f9f8] px-3 py-2', {key: `${step.kind}-${step.id || stepIndex}`},
            h(`span:${classes.chip}`, {}, step.kind), h('span:flex-1 text-xs', {}, step.title), step.id && step.resource != 'tools' && h(
              'button:text-xs text-[#2f6b4b]', {onClick: () => openEditor(step.resource, repo[step.resource].find(item => item.id == step.id))}, 'עריכה')))),
          run.output && h('div', {}, h('b:text-[10px] text-[#8b948f]', {}, 'פלט ההרצה'),
            h('p:mt-1 whitespace-pre-wrap text-sm leading-6', {}, run.output)))))) : h('div:grid min-h-64 place-items-center text-center text-sm text-[#8b948f]', {},
          h('div', {}, h('L:PlayCircle', {size: 28, className: 'mx-auto mb-3'}), `נסה את ${targetLabel} תוך כדי בנייה`))),
      h('div:border-t border-[#e2e7e4] bg-white p-3', {}, h('div:flex items-end gap-2 rounded-xl border border-[#dfe5e1] p-2', {},
        h('textarea:min-h-12 flex-1 resize-none p-2 text-sm outline-none', {value: testInput, placeholder: `נסה את ${targetLabel}…`,
          onInput: event => setTestInput(event.target.value), onKeyDown: event => event.key == 'Enter' && !event.shiftKey &&
            (event.preventDefault(), sendTest(testInput)), 'data-testid': 'workspace-test-input'}),
        h('button:grid h-9 w-9 place-items-center rounded-full bg-[#2f6b4b] text-white disabled:opacity-40', {disabled: !testInput.trim(),
          onClick: () => sendTest(testInput), 'aria-label': 'הרצה'}, h('L:ArrowUp', {size: 15}))),
      h('p:mt-2 text-[10px] text-[#9aa19d]', {}, 'כל שליחה היא הרצה עצמאית של AgentOS, ללא זיכרון שיחה')))
      const shownRun = evaluationRun || repo.evalRuns.filter(run => run.evaluationId == evaluationId && run.targetId == draft.id)
        .sort((a, b) => b.startedAt - a.startedAt)[0]
      const evalRow = (row, index) => h('article:rounded-xl border border-[#dfe5e1] bg-white p-3', {key: index},
        h('div:flex items-center gap-3', {}, h('b:font-mono text-xs', {}, String(index + 1).padStart(2, '0')),
          h('span:min-w-0 flex-1 truncate text-sm', {}, row.input), h('button:text-xs text-[#2f6b4b]', {
            onClick: () => setDetail(detail == index ? -1 : index)}, 'קלט ופלט')), detail == index && h('div:mt-3 grid gap-3 border-t border-dashed pt-3', {},
          [['קלט', row.input], ['פלט מצופה', row.expected], ['פלט בפועל', row.actual]].map(([title, value]) => h('div', {key: title},
            h('b:text-[10px] text-[#8b948f]', {}, title), h('p:mt-1 whitespace-pre-wrap break-words text-sm', {}, value || '—'))),
          (row.reportIds || []).length > 0 && h('div:text-xs', {}, `דוחות: ${row.reportIds.map(id => repo.reports.find(report => report.id == id)?.name || id).join(', ')}`),
          (row.trace || []).length > 0 && h('details', {}, h('summary:cursor-pointer text-xs text-[#2f6b4b]', {}, 'מעקב הרצה'),
            (row.trace || []).map((step, stepIndex) => h('div:mt-2 text-xs', {key: stepIndex}, `${step.kind} · ${step.title}`))),
          row.opikUrl && h('a:text-xs text-[#2f6b4b]', {href: row.opikUrl}, 'הטרייס המלא ב-Opik ↗')))
      const evalPanel = h('div:h-full overflow-y-auto p-4', {}, h('div:flex items-end gap-2 max-sm:block', {}, h('label:flex-1 text-xs font-semibold', {},
        'סט אבלואציה', h('select:mt-2 w-full rounded-xl border border-[#dfe5e1] p-2 text-sm', {value: evaluationId,
          onChange: event => setEvaluationId(event.target.value)}, h('option', {value: ''}, 'בחר סט'), repo.evaluations.map(item => h(
            'option', {key: item.id, value: item.id}, item.name)))), h(`button:${classes.primary} max-sm:mt-2 max-sm:w-full`, {
          disabled: !evaluationId || shownRun?.status == 'מריץ…', onClick: executeEval}, shownRun?.status == 'מריץ…' ? 'מריץ…' : 'הרצת הסט')),
      shownRun && h('div:mt-4', {}, h('div:flex items-center gap-2', {}, h(`span:${classes.chip}`, {}, shownRun.status),
        h('span:text-xs text-[#8b948f]', {}, shownRun.started || 'עכשיו')), h('div:mt-4 space-y-2', {}, (shownRun.rows || []).map(evalRow))))
      return h('main:min-h-screen overflow-x-hidden pb-24 sm:mr-[210px] sm:pb-0', {}, h('header:sticky top-0 z-20 flex flex-wrap items-center ' +
        'gap-3 border-b border-[#e3e7e4] bg-white px-5 py-4', {}, h('button:rounded-lg border p-2', {onClick: back,
        'aria-label': `חזרה ל${workspace.resource == 'plugins' ? 'פלאגינים' : 'סאב-אייג׳נטים'}`}, h('L:ChevronRight', {size: 16})),
      h('span:text-xs text-[#8b948f]', {}, labels[workspace.resource]), h('input:min-w-0 flex-1 text-xl font-bold outline-none', {
        value: draft.name, placeholder: `שם ${targetLabel}…`, onInput: event => setDraft({...draft, name: event.target.value}),
        onBlur: () => saveWorkspace(draft)}), h(`span:${classes.chip}`, {}, draft.version || 'V0'),
      h('span:text-[10px] text-[#9aa19d]', {}, 'נשמר אוטומטית'), h('button:text-xs text-red-600', {onClick: props.deleteWorkspace}, 'מחיקה')),
      h('div:flex min-h-[calc(100vh-65px)] max-lg:block', {}, h(`section:min-w-0 flex-1 space-y-4 p-5 ${panelOpen ? 'lg:max-w-[58%]' : ''}`, {},
        h(`section:${classes.card} space-y-4`, {}, h('label:block text-xs font-semibold', {}, 'display_name', h(
          'input:mt-2 w-full rounded-xl border border-[#e2e7e4] bg-[#f6f8f7] p-3 font-mono text-sm', {dir: 'ltr', value: draft.id || '',
            disabled: !!draft.originalId, onInput: event => setDraft({...draft, id: event.target.value})})), h('label:block text-xs font-semibold', {},
          'Description', h('textarea:mt-2 w-full resize-y rounded-xl border border-[#e2e7e4] bg-[#f6f8f7] p-3 text-sm', {
            dir: 'ltr', value: draft.apiDescription || '', onInput: event => setDraft({...draft, apiDescription: event.target.value}),
            onBlur: () => saveWorkspace(draft)})), h('label:block text-xs font-semibold', {}, 'תיאור בעברית', h(
          'textarea:mt-2 w-full resize-y rounded-xl border border-[#e2e7e4] bg-[#f6f8f7] p-3 text-sm', {value: draft.desc || '',
            onInput: event => setDraft({...draft, desc: event.target.value}), onBlur: () => saveWorkspace(draft)}))),
        h(`section:${classes.card}`, {}, h('div:flex items-center justify-between', {}, h('b:text-sm', {}, 'תגיות'), h(
          `button:${classes.button}`, {onClick: () => setDraft({...draft, tags: [...(draft.tags || []), {tag_type: '', tag_name: ''}]})},
        h('L:Plus', {size: 14}), 'תגית')), (draft.tags || []).map((tag, index) => h(
          'div:mt-3 grid grid-cols-[1fr_1fr_32px] gap-2 max-sm:grid-cols-[1fr_1fr_32px]', {key: index}, h(
            'input:min-w-0 rounded-lg border p-2 font-mono text-xs', {dir: 'ltr', value: tag.tag_type,
              placeholder: 'tag_type', onInput: event => setDraft({...draft, tags: draft.tags.map((value, row) => row == index
                ? {...value, tag_type: event.target.value} : value)})}), h('input:min-w-0 rounded-lg border p-2 text-xs', {
              value: tag.tag_name, placeholder: 'tag_name', onInput: event => setDraft({...draft, tags: draft.tags.map((value, row) => row == index
                ? {...value, tag_name: event.target.value} : value)})}), h('button', {onClick: () => persist({...draft,
              tags: draft.tags.filter((value, row) => row != index)}), 'aria-label': 'מחיקת תגית'}, h('L:Trash2', {size: 14}))))),
        h(`section:${classes.card}`, {}, h('div:flex items-center justify-between', {}, h('b:text-sm', {}, workspace.resource == 'plugins'
          ? 'README.md' : 'system_prompt'), h('span:text-[10px] text-[#9aa19d]', {}, `טקסט חופשי · ${workspace.resource == 'plugins'
            ? draft.readme?.length || 0 : draft.instructions?.length || 0} תווים`)), h(
          'textarea:mt-3 min-h-44 w-full resize-y rounded-xl border border-[#e2e7e4] bg-[#f6f8f7] p-3 text-sm leading-7', {
            value: workspace.resource == 'plugins' ? draft.readme || '' : draft.instructions || '',
            onInput: event => setDraft({...draft, [workspace.resource == 'plugins' ? 'readme' : 'instructions']: event.target.value}),
            onBlur: () => saveWorkspace(draft)})), workspace.resource == 'subagents' && h(`section:${classes.card}`, {},
          h('b:text-sm', {}, 'BackendConfig'), h('select:mt-3 w-full rounded-xl border border-[#e2e7e4] bg-[#f6f8f7] p-3 text-sm', {
            value: draft.backendConfig?.harness_type || 'deepagents', onChange: event => persist({...draft,
              backendConfig: {...draft.backendConfig, harness_type: event.target.value}})}, h('option', {value: 'deepagents'}, 'deepagents'),
          h('option', {value: 'claude'}, 'claude'))), h(`section:${classes.card}`, {}, h('b:text-sm', {}, 'סט אבלואציה מקושר'),
        h('select:mt-3 w-full rounded-xl border border-[#e2e7e4] bg-[#f6f8f7] p-3 text-sm', {value: draft.evaluationId || '',
          onChange: event => persist({...draft, evaluationId: event.target.value})}, h('option', {value: ''}, 'ללא סט מקושר'),
        repo.evaluations.map(item => h('option', {key: item.id, value: item.id}, item.name))), lastRun && h('div:mt-3 flex items-center justify-between text-xs ' +
          'text-[#7d8982]', {}, `הרצה אחרונה · ${lastRun.started} · ${lastRun.status}`, h('button:text-[#2f6b4b]', {
          onClick: () => (setPanelOpen(true), setTab('evaluation'))}, 'צפייה בהיסטוריית ההרצות'))), draft._marketplace && h(
        `section:${classes.card}`, {}, h('div:flex flex-wrap items-center gap-2', {}, h('b:text-sm', {}, 'Marketplace API'),
          h(`span:${classes.chip}`, {}, `${draft.versions?.length || 0} גרסאות`), h(`span:${classes.chip}`, {},
            `${draft.audit?.length || 0} אירועי audit`)), draft.references && h('pre:mt-3 overflow-x-auto rounded-xl bg-[#f6f8f7] p-3 text-xs', {
              dir: 'ltr'}, JSON.stringify(draft.references, null, 2)), draft.configYaml && h(
            'details:mt-3', {}, h('summary:cursor-pointer text-xs font-semibold text-[#2f6b4b]', {}, 'config.yaml'), h(
              'pre:mt-2 max-w-full overflow-x-auto rounded-xl bg-[#f6f8f7] p-3 text-xs', {dir: 'ltr'}, draft.configYaml))),
        h('h2:pt-2 text-lg font-bold', {}, `חיבורי ${targetLabel}`), relationRows.map(relationSection)), panelOpen ? h(
        'aside:w-full shrink-0 border-r border-[#dfe5e1] bg-[#f8f9f8] lg:w-[42%]', {}, h('div:flex items-center border-b border-[#dfe5e1] bg-white p-3', {},
          h('button:ml-2 rounded-lg p-2', {onClick: () => setPanelOpen(false), 'aria-label': 'סגירה'}, h('L:X', {size: 15})),
          [['test', 'הרצת ניסוי'], ['evaluation', 'אבלואציה']].map(([id, title]) => h(`button:rounded-lg px-4 py-2 text-sm ${tab == id
            ? 'bg-[#e7f1eb] font-semibold text-[#2f6b4b]' : ''}`, {key: id, onClick: () => setTab(id)}, title)),
          tab == 'test' && h('button:mr-auto text-xs text-[#748079]', {onClick: () => setRuns([])}, 'איפוס')),
        h('div:h-[calc(100vh-126px)] max-lg:h-auto max-lg:min-h-[32rem]', {}, tab == 'test' ? testPanel : evalPanel)) : h(
          'button:fixed left-0 top-1/2 z-30 rounded-r-xl bg-[#2f6b4b] px-2 py-6 text-sm text-white', {onClick: () => setPanelOpen(true)}, 'הרצה')))
    }
  })
})
