import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-agent-results.js'
import './wonder-platform-searchable-select.js'
import './wonder-platform-wizard.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformWorkspace', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh, useEffect, useState}}) => props => {
      const {workspace, repo, back, saveWorkspace, openPicker, openEditor, runTarget, runEval, setDirty} = props
      const {classes, labels} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx), [draft, setDraft] = useState({...workspace.item})
      const [panelOpen, setPanelOpen] = useState(true), [tab, setTab] = useState('test'), [testInput, setTestInput] = useState('')
      const [runs, setRuns] = useState([]), [evaluationId, setEvaluationId] = useState(workspace.item.evaluationId || '')
      const [evaluationRun, setEvaluationRun] = useState(), [detail, setDetail] = useState(-1)
      const [activeTab, setActiveTab] = useState('settings'), [stepId, setStepId] = useState('general')
      const runtimeConfig = item => JSON.stringify(item)
      const savedConfig = runtimeConfig(workspace.item), [chatSessionId, setChatSessionId] = useState(`${workspace.item.id}-${Date.now()}`)
      const [sessionConfig, setSessionConfig] = useState(savedConfig), draftConfig = runtimeConfig(draft)
      const draftDirty = draftConfig != savedConfig, sessionOutdated = runs.length > 0 && sessionConfig != savedConfig
      useEffect(() => { setDraft({...workspace.item}); setEvaluationId(workspace.item.evaluationId || ''); setStepId('general') }, [workspace.item])
      useEffect(() => { setDirty?.(draftDirty) }, [draftDirty])
      useEffect(() => {
        setRuns([]); setChatSessionId(`${workspace.item.id}-${Date.now()}`); setSessionConfig(runtimeConfig(workspace.item))
      }, [workspace.item.id])
      const targetLabels = {plugins: 'הפלאגין', subagents: 'הסאב-אייג׳נט', agents: 'הסוכן'}, targetLabel = targetLabels[workspace.resource]
      const relationRows = workspace.resource == 'plugins' ? [['skillIds', 'skills', 'מיומנויות'], ['toolIds', 'tools', 'כלים'],
          ['knowledgeIds', 'knowledge', 'ידע']]
        : workspace.resource == 'agents' ? [['pluginIds', 'plugins', 'פלאגינים'], ['skillIds', 'skills', 'מיומנויות'],
          ['toolIds', 'tools', 'כלים'], ['knowledgeIds', 'knowledge', 'ידע']]
        : repo.marketplace ? [['pluginIds', 'plugins', 'פלאגינים'], ['skillIds', 'skills', 'מיומנויות'], ['toolIds', 'tools', 'כלים']]
        : [['skillIds', 'skills', 'מיומנויות'], ['toolIds', 'tools', 'כלים']]
      const semanticTrace = dsls.common.data.wonderPlatformTrace.$runWithCtx(ctx, {repo, target: draft})
      const lastRun = repo.evalRuns.filter(run => run.targetId == draft.id).sort((a, b) => b.startedAt - a.startedAt)[0]
      const sendTest = async input => {
        const text = input.trim()
        if (!text || runs.some(run => run.status == 'מריץ…')) return
        const id = `test-${Date.now()}`, pending = {id, input: text, status: 'מריץ…', trace: semanticTrace}
        setRuns(items => [...items, pending]); setTestInput('')
        try {
          const result = await runTarget(text, draft, chatSessionId)
          setRuns(items => items.map(run => run.id == id ? {...run, ...result, output: result.text || result.output, status: result.status || 'הושלם',
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
            onClick: () => openPicker(field, resource, title, draft[field] || [], selected => setDraft({...draft, [field]: selected}))},
          h('L:Plus', {size: 14}), 'הוספה')),
        h('div:mt-3 space-y-3', {}, (draft[field] || []).map(id => {
          const item = repo[resource].find(value => value.id == id), managed = resource == 'tools' && item?.managed
          if (!item) return null
          const inherited = resource == 'skills' ? item.toolIds?.map(toolId => ['כלי', repo.tools.find(value => value.id == toolId)?.name])
            : resource == 'subagents' ? [...(item.skillIds || []).map(skillId => ['מיומנות', repo.skills.find(value => value.id == skillId)?.name]),
              ...(item.toolIds || []).map(toolId => ['כלי', repo.tools.find(value => value.id == toolId)?.name])] : []
          return h('article:rounded-xl border border-[#e8e8ea] p-3', {key: id}, h('div:flex items-start gap-3', {},
            h('span:grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f4f4f5] text-xs font-bold text-[#0f0f10]', {}, item.mark),
            h('div:min-w-0 flex-1', {}, h('b:block text-sm', {}, item.name), h('p:mt-1 text-xs leading-5 text-[#6b6b6f]', {}, item.desc),
              managed && h('span:text-[10px] text-[#6b6b6f]', {title: 'כלי מנוהל — לא ניתן לעריכה'}, 'Connector · MCP · מנוהל')),
            !managed && h('button:rounded-lg p-1.5 hover:bg-gray-100', {onClick: () => openEditor(resource, item), 'aria-label': 'עריכה'},
              h('L:Pencil', {size: 14})), h('button:rounded-lg p-1.5 hover:bg-red-50', {onClick: () => setDraft({...draft,
                [field]: draft[field].filter(value => value != id)}), 'aria-label': `הסרה ${title}`}, h('L:X', {size: 14}))),
          inherited.filter(value => value[1]).length > 0 && h('div:mt-3 border-t border-dashed border-[#e8e8ea] pt-2', {},
            h('span:text-[10px] text-[#6b6b6f]', {}, `נכנס דרך ${labels[resource]}`), h('div:mt-2 flex flex-wrap gap-2', {},
              inherited.filter(value => value[1]).map(([kind, name]) => h(`span:${classes.chip}`, {key: kind + name}, `${kind} · ${name}`)))) )
        })))
      const newChat = () => {
        if (draftDirty) return
        setRuns([]); setChatSessionId(`${draft.id}-${Date.now()}`); setSessionConfig(savedConfig)
      }
      const configNotice = draftDirty ? 'יש שינויי תצורה שלא נשמרו' : sessionOutdated
        ? 'תצורת הפלאגין עודכנה — פתח שיחה חדשה' : 'שיחת AgentOS פעילה'
      const chatRun = run => h('div:space-y-3', {key: run.id}, h('div:flex justify-end', {}, h(
        'div:max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-[#0f0f10] px-4 py-3 text-sm text-white', {}, run.input)), h(
        'div:flex justify-start', {}, h('div:max-w-[85%] rounded-2xl rounded-bl-sm border border-[#e8e8ea] bg-white px-4 py-3', {}, h(
          'div:flex items-center gap-2', {}, h(`span:${classes.chip}`, {}, run.status), run.opikUrl && h(
            'a:text-xs text-[#0f0f10]', {href: run.opikUrl}, 'Opik ↗')), h(
          'p:mt-3 whitespace-pre-wrap break-words text-sm leading-7', {}, run.output || run.status), (run.trace || []).length > 0 && h(
          'details:mt-3', {}, h('summary:cursor-pointer text-xs text-[#6b6b6f]', {}, 'מעקב הרצה'), (run.trace || []).map((step, stepIndex) => h(
            'div:mt-2 flex items-center gap-2 text-xs', {key: `${step.kind}-${step.id || stepIndex}`}, h(
              `span:${classes.chip}`, {}, step.kind), h('span:flex-1', {}, step.title)))))))
      const testPanel = h('div:flex h-full flex-col', {}, h('div:flex items-center justify-between gap-3 border-b border-[#e8e8ea] bg-white p-3', {},
        h(`span:text-xs ${draftDirty || sessionOutdated ? 'text-amber-700' : 'text-[#6b6b6f]'}`, {}, configNotice), h(
          `button:${classes.button}`, {disabled: draftDirty, onClick: newChat}, draftDirty ? 'שמור תחילה' : 'שיחה חדשה')),
      h('div:flex-1 space-y-5 overflow-y-auto p-4', {}, runs.length ? runs.map(chatRun)
        : h('div:grid min-h-64 place-items-center text-center text-sm text-[#6b6b6f]', {},
          h('div', {}, h('L:MessageCircle', {size: 28, className: 'mx-auto mb-3'}), `התחל שיחה עם ${targetLabel}`))),
      h('div:border-t border-[#e8e8ea] bg-white p-3', {}, h('div:flex items-end gap-2 rounded-xl border border-[#e8e8ea] p-2', {},
        h('textarea:min-h-12 flex-1 resize-none p-2 text-sm outline-none', {value: testInput, placeholder: `נסה את ${targetLabel}…`,
          onInput: event => setTestInput(event.target.value), onKeyDown: event => event.key == 'Enter' && !event.shiftKey &&
            (event.preventDefault(), sendTest(testInput)), 'data-testid': 'workspace-test-input'}),
        h('button:grid h-9 w-9 place-items-center rounded-full bg-[#0f0f10] text-white disabled:opacity-40', {disabled: !testInput.trim(),
          onClick: () => sendTest(testInput), 'aria-label': 'הרצה'}, h('L:ArrowUp', {size: 15}))),
      h('p:mt-2 text-[10px] text-[#6b6b6f]', {}, 'ההקשר נשמר לאורך השיחה ב-AgentOS')))
      const shownRun = evaluationRun || repo.evalRuns.filter(run => run.evaluationId == evaluationId && run.targetId == draft.id)
        .sort((a, b) => b.startedAt - a.startedAt)[0]
      const evalRow = (row, index) => h('article:rounded-xl border border-[#e8e8ea] bg-white p-3', {key: index},
        h('div:flex items-center gap-3', {}, h('b:font-mono text-xs', {}, String(index + 1).padStart(2, '0')),
          h('span:min-w-0 flex-1 truncate text-sm', {}, row.input), h('button:text-xs text-[#0f0f10]', {
            onClick: () => setDetail(detail == index ? -1 : index)}, 'קלט ופלט')), detail == index && h('div:mt-3 grid gap-3 border-t border-dashed pt-3', {},
          [['קלט', row.input], ['פלט מצופה', row.expected], ['פלט בפועל', row.actual]].map(([title, value]) => h('div', {key: title},
            h('b:text-[10px] text-[#6b6b6f]', {}, title), h('p:mt-1 whitespace-pre-wrap break-words text-sm', {}, value || '—'))),
          (row.trace || []).length > 0 && h('details', {}, h('summary:cursor-pointer text-xs text-[#0f0f10]', {}, 'מעקב הרצה'),
            (row.trace || []).map((step, stepIndex) => h('div:mt-2 text-xs', {key: stepIndex}, `${step.kind} · ${step.title}`))),
          row.opikUrl && h('a:text-xs text-[#0f0f10]', {href: row.opikUrl}, 'הטרייס המלא ב-Opik ↗')))
      const evalPanel = h('div:h-full overflow-y-auto p-4', {}, h('div:flex items-end gap-2 max-sm:block', {}, h('div:flex-1', {},
        h('span:text-xs font-semibold', {}, 'סט אבלואציה'), h('div:mt-2', {}, hh(ctx, dsls.react['react-comp'].wonderPlatformSearchableSelect,
          {items: repo.evaluations, value: evaluationId, onChange: setEvaluationId, placeholder: 'בחר סט', empty: 'בחר סט'}))),
      h(`button:${classes.primary} max-sm:mt-2 max-sm:w-full`, {
          disabled: !evaluationId || shownRun?.status == 'מריץ…', onClick: executeEval}, shownRun?.status == 'מריץ…' ? 'מריץ…' : 'הרצת הסט')),
      shownRun && h('div:mt-4', {}, h('div:flex items-center gap-2', {}, h(`span:${classes.chip}`, {}, shownRun.status),
        h('span:text-xs text-[#6b6b6f]', {}, shownRun.started || 'עכשיו')), h('div:mt-4 space-y-2', {}, (shownRun.rows || []).map(evalRow))))
      const steps = [{id: 'general', label: 'כללי', render: () => h('div:space-y-4', {},
        h(`section:${classes.card} space-y-4`, {}, h('label:block text-xs font-semibold', {}, 'id', h(
          'input:mt-2 w-full rounded-xl border border-[#e8e8ea] bg-[#fafafa] p-3 font-mono text-sm', {dir: 'ltr', value: draft.id || '',
            placeholder: 'uiRenderingSkill', disabled: !!draft.originalId,
            onInput: event => setDraft({...draft, id: event.target.value})})), h('label:block text-xs font-semibold', {},
          'Description', h('textarea:mt-2 w-full resize-y rounded-xl border border-[#e8e8ea] bg-[#fafafa] p-3 text-sm', {
            dir: 'ltr', value: draft.apiDescription || '', onInput: event => setDraft({...draft, apiDescription: event.target.value})})),
        h('label:block text-xs font-semibold', {}, 'תיאור בעברית', h(
          'textarea:mt-2 w-full resize-y rounded-xl border border-[#e8e8ea] bg-[#fafafa] p-3 text-sm', {value: draft.desc || '',
            onInput: event => setDraft({...draft, desc: event.target.value})}))),
        draft._marketplace && h(`section:${classes.card}`, {}, h('div:flex flex-wrap items-center gap-2', {}, h('b:text-sm', {},
          'Marketplace API'), h(`span:${classes.chip}`, {}, `${draft.versions?.length || 0} גרסאות`), h(`span:${classes.chip}`, {},
            `${draft.audit?.length || 0} אירועי audit`)), draft.references && h(
            'pre:mt-3 overflow-x-auto rounded-xl bg-[#fafafa] p-3 text-xs', {dir: 'ltr'}, JSON.stringify(draft.references, null, 2)),
          draft.configYaml && h('details:mt-3', {}, h('summary:cursor-pointer text-xs font-semibold text-[#0f0f10]', {}, 'config.yaml'),
            h('pre:mt-2 max-w-full overflow-x-auto rounded-xl bg-[#fafafa] p-3 text-xs', {dir: 'ltr'}, draft.configYaml))))},
        {id: 'instructions', label: 'הנחיות', render: () => h('div:space-y-4', {},
          h(`section:${classes.card}`, {}, h('div:flex items-center justify-between', {}, h('b:text-sm', {}, workspace.resource == 'plugins'
            ? 'README.md' : 'system_prompt'), h('span:text-[10px] text-[#6b6b6f]', {}, `טקסט חופשי · ${workspace.resource == 'plugins'
              ? draft.readme?.length || 0 : draft.instructions?.length || 0} תווים`)), h(
            'textarea:mt-3 min-h-44 w-full resize-y rounded-xl border border-[#e8e8ea] bg-[#fafafa] p-3 text-sm leading-7', {
              value: workspace.resource == 'plugins' ? draft.readme || '' : draft.instructions || '',
              onInput: event => setDraft({...draft, [workspace.resource == 'plugins' ? 'readme' : 'instructions']: event.target.value})}),
          h('div:mt-4', {}, h('span:block text-xs font-semibold', {}, 'סט אבלואציה מקושר'), h('div:mt-2', {},
            hh(ctx, dsls.react['react-comp'].wonderPlatformSearchableSelect, {items: repo.evaluations, value: draft.evaluationId || '',
              onChange: id => setDraft({...draft, evaluationId: id}), placeholder: 'ללא סט מקושר', empty: 'ללא סט מקושר'}))),
          lastRun && h('div:mt-3 flex items-center justify-between text-xs text-[#6b6b6f]', {},
            `הרצה אחרונה · ${lastRun.started} · ${lastRun.status}`, h('button:text-[#0f0f10]', {
            onClick: () => (setPanelOpen(true), setTab('evaluation'))}, 'צפייה בהיסטוריית ההרצות'))),
          ['subagents', 'agents'].includes(workspace.resource) && !draft.originalId && h(`section:${classes.card}`, {},
            h('b:text-sm', {}, 'README (creation only)'), h(
              'textarea:mt-3 min-h-32 w-full resize-y rounded-xl border border-[#e8e8ea] bg-[#fafafa] p-3 text-sm', {
                value: draft.readme || '', onInput: event => setDraft({...draft, readme: event.target.value})})))},
        {id: 'connections', label: 'חיבורים', render: () => h('div:space-y-4', {}, relationRows.map(relationSection))}]
      return h('main:min-h-screen overflow-x-clip pb-24 sm:mr-[248px] sm:pb-0', {}, h('header:sticky top-0 z-20 flex flex-wrap items-center ' +
        'gap-3 border-b border-[#e8e8ea] bg-white px-5 py-4', {}, h('button:rounded-lg p-2 hover:bg-[#f4f4f5]', {onClick: back,
        'aria-label': `חזרה ל${{plugins: 'פלאגינים', subagents: 'סאב-אייג׳נטים', agents: 'סוכנים'}[workspace.resource]}`},
        h('L:ChevronRight', {size: 16})),
      h('span:text-xs text-[#6b6b6f]', {}, labels[workspace.resource]), h('input:min-w-0 flex-1 text-xl font-bold outline-none', {
        value: draft.name, placeholder: 'שם להצגה…', 'aria-label': 'display_name',
        onInput: event => setDraft({...draft, name: event.target.value})}),
      h(`span:${classes.chip}`, {}, draft.version || 'V0'), h(`button:${classes.primary}`, {
        disabled: !draft.name.trim() || !draft.id.trim(), onClick: () => saveWorkspace(draft),
        'aria-label': 'שמירת סביבת עבודה'}, 'שמירה'), draft.originalId && h(
              'button:text-xs text-red-600', {onClick: props.deleteWorkspace}, 'מחיקה')),
      h('div:flex min-h-[calc(100vh-65px)] max-lg:block', {}, h(`section:min-w-0 flex-1 space-y-4 p-5 ${panelOpen ? 'lg:max-w-[58%]' : ''}`, {},
        hh(ctx, dsls.react['react-comp'].wonderPlatformWizard, {steps, activeId: stepId, onStep: setStepId})), panelOpen ? h(
        'aside:w-full shrink-0 self-start border-r border-[#e8e8ea] bg-[#fafafa] lg:sticky lg:top-[65px] lg:h-[calc(100vh-65px)] ' +
          'lg:w-[42%]', {}, h('div:flex items-center border-b border-[#e8e8ea] bg-white p-3', {},
          h('button:ml-2 rounded-lg p-2', {onClick: () => setPanelOpen(false), 'aria-label': 'סגירה'}, h('L:X', {size: 15})),
          [['test', 'הרצת ניסוי'], ['evaluation', 'אבלואציה']].map(([id, title]) => h(`button:rounded-lg px-4 py-2 text-sm ${tab == id
            ? 'bg-[#f4f4f5] font-semibold text-[#0f0f10]' : ''}`, {key: id, onClick: () => setTab(id)}, title)),
          tab == 'test' && h('button:mr-auto text-xs text-[#6b6b6f]', {onClick: () => setRuns([])}, 'איפוס')),
        h('div:h-[calc(100vh-126px)] max-lg:h-auto max-lg:min-h-[32rem]', {}, tab == 'test' ? testPanel : evalPanel)) : h(
          'button:fixed left-0 top-1/2 z-30 rounded-r-xl bg-[#0f0f10] px-2 py-6 text-sm text-white', {onClick: () => setPanelOpen(true)}, 'הרצה')))
    }
  })
})
