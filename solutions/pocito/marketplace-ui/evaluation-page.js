import { dsls } from '@jb6/core'
import '@jb6/react'
import './evaluation-page-domain.js'
import './wonder-platform-repository.js'
import './wonder-platform-marketplace-api.js'
import './wonder-platform-agent-wurl.js'

const { common: { data: { evaluationPageGrade, evaluationPageLoad, evaluationPageSaveDefinitions, evaluationPageSaveRun,
  wonderPlatformMarketplaceRepository, wonderPlatformRunAgent } }, react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('EvaluationPage', {
  params: [
    {id: 'roomWUrl', as: 'string', defaultValue: 'room://wonder-platform'},
    {id: 'marketplaceBaseUrl', as: 'string'},
    {id: 'agentOsBaseUrl', as: 'string'},
    {id: 'agentOsToken', as: 'string'},
    {id: 'loadState', dynamic: true, defaultValue: evaluationPageLoad('%$roomWUrl%')},
    {id: 'saveDefinitions', dynamic: true, defaultValue: evaluationPageSaveDefinitions('%$roomWUrl%', '%$repo%')},
    {id: 'saveRun', dynamic: true, defaultValue: evaluationPageSaveRun('%$roomWUrl%', '%$run%')},
    {id: 'loadTargets', dynamic: true, defaultValue: wonderPlatformMarketplaceRepository('%$roomWUrl%', '%$marketplaceBaseUrl%')},
    {id: 'runTarget', dynamic: true, defaultValue: wonderPlatformRunAgent('%$text%', '%$target%', {
      sessionId: '%$sessionId%',
      roomWUrl: '%$roomWUrl%',
      baseUrl: '%$agentOsBaseUrl%',
      token: '%$agentOsToken%'
    })},
    {id: 'grade', dynamic: true, defaultValue: evaluationPageGrade('%$grader%', '%$testCase%', {
      output: '%$output%',
      durationMs: '%$durationMs%'
    })}
  ],
  impl: comp({
    hFunc: (ctx, {react: {h, useEffect, useRef, useState}},
      {roomWUrl, marketplaceBaseUrl, agentOsBaseUrl, agentOsToken, loadState, saveDefinitions, saveRun, loadTargets, runTarget,
        grade}) => function EvaluationPage({embedded, targetItems, openView} = {}) {
      const [repo, setRepo] = useState(), repoRef = useRef(), saveQueue = useRef(Promise.resolve()), definitionTimer = useRef()
      const editedVersions = useRef(new Set())
      const [targets, setTargets] = useState([]), [loadError, setLoadError] = useState(), [view, setView] = useState('composer')
      const [targetId, setTargetId] = useState(''), [datasetIds, setDatasetIds] = useState([]), [graderIds, setGraderIds] = useState([])
      const [editingDatasetId, setEditingDatasetId] = useState(), [editingGraderId, setEditingGraderId] = useState()
      const [selectedRunId, setSelectedRunId] = useState(), [configurationName, setConfigurationName] = useState('')
      const [notice, setNotice] = useState('')
      const {classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      useEffect(() => { void Promise.all([loadState(ctx.setVars({roomWUrl})), targetItems ? {agents: targetItems}
        : loadTargets(ctx.setVars({roomWUrl, marketplaceBaseUrl}))]).then(([state, targetRepo]) => {
        repoRef.current = state; setRepo(state); setTargets(targetRepo.agents || [])
        setGraderIds(state.graders.filter(item => item.required).map(item => item.id))
      }, setLoadError) }, [])
      const flash = text => (setNotice(text), setTimeout(() => setNotice(''), 1800))
      const persistDefinitions = (updater, immediate = false) => {
        const next = typeof updater == 'function' ? updater(repoRef.current) : updater
        repoRef.current = next; setRepo(next)
        clearTimeout(definitionTimer.current)
        const save = () => saveDefinitions(ctx.setVars({roomWUrl, repo: repoRef.current}))
        if (immediate) saveQueue.current = saveQueue.current.then(save)
        else definitionTimer.current = setTimeout(() => { saveQueue.current = saveQueue.current.then(save) }, 300)
        return immediate ? saveQueue.current : Promise.resolve(next)
      }
      const persistRun = (runId, updater) => {
        const current = repoRef.current, run = updater(current.runs.find(item => item.id == runId))
        const next = {...current, runs: current.runs.map(item => item.id == runId ? run : item)}
        repoRef.current = next; setRepo(next)
        saveQueue.current = saveQueue.current.then(() => saveRun(ctx.setVars({roomWUrl, run})))
        return saveQueue.current
      }
      const stateShell = embedded ? ' sm:mr-[248px]' : ''
      if (loadError) return h(`main:grid min-h-screen place-items-center p-6${stateShell}`, {}, h(
        'div:max-w-lg rounded-xl border border-red-200 bg-white p-8 text-center', {}, h('L:CircleAlert', {
          size: 28, className: 'mx-auto text-red-600'}), h('h1:mt-4 text-lg font-bold', {}, 'לא ניתן לטעון את עמוד האבלואציה'), h(
          'p:mt-2 text-sm text-[#6b6b6f]', {}, String(loadError.message || loadError))))
      if (!repo) return h(`main:grid min-h-screen place-items-center${stateShell}`, {}, h('L:Loader2', {
        size: 24, className: 'animate-spin text-[#0f0f10]'}))
      const selectedTarget = targets.find(item => item.id == targetId)
      const selectedDatasets = repo.datasets.filter(item => datasetIds.includes(item.id))
      const selectedGraders = repo.graders.filter(item => graderIds.includes(item.id))
      const selectedCases = selectedDatasets.flatMap(dataset => dataset.cases.filter(item => item.enabled).map(testCase => ({...testCase,
        datasetId: dataset.id, datasetName: dataset.name})))
      const referenceGaps = selectedGraders.filter(grader => grader.required && ['exact', 'contains'].includes(grader.kind)).flatMap(
        grader => selectedCases.filter(testCase => !testCase.referenceOutput?.trim()).map(testCase => `${grader.id}:${testCase.id}`))
      const invalidGraders = selectedGraders.filter(grader => grader.kind == 'llmJudge' && !grader.criteria?.trim())
      const invalidThresholds = selectedGraders.filter(grader => grader.kind == 'latency' ? grader.threshold < 1
        : grader.kind != 'exact' && (grader.threshold < 0.01 || grader.threshold > 1))
      const blockers = [!selectedTarget && 'בחרו סוכן', !selectedCases.length && 'בחרו מערך עם תרחישים פעילים',
        selectedCases.some(testCase => !testCase.input?.trim()) && 'לכל תרחיש פעיל נדרש קלט',
        !selectedGraders.length && 'בחרו בודק אחד לפחות', referenceGaps.length && `${referenceGaps.length} בדיקות דורשות פלט מצופה`,
        invalidGraders.length && `${invalidGraders.length} בודקי מודל דורשים קריטריונים`,
        invalidThresholds.length && `${invalidThresholds.length} בודקים כוללים סף לא תקין`].filter(Boolean)
      const estimatedLlmGrades = selectedCases.length * selectedGraders.filter(grader => grader.kind == 'llmJudge').length
      const graderKinds = {exact: 'התאמה מלאה', contains: 'עובדות נדרשות', llmJudge: 'שופט מודל', latency: 'זמן תגובה'}
      const badge = (text, tone = 'slate') => h(`span:${classes.chip} ${tone == 'green' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : tone == 'red' ? 'border-red-200 bg-red-50 text-red-700' : tone == 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800' : ''}`, {}, text)
      const button = (text, onClick, primary, props = {}) => h(`button:${primary ? classes.primary : classes.button}`, {onClick, ...props}, text)
      const field = (title, control) => h('label:block text-xs font-semibold text-[#6b6b6f]', {}, title, control)
      const toggle = (list, setList, id) => setList(list.includes(id) ? list.filter(value => value != id) : [...list, id])
      const summaryOf = run => dsls.common.data.evaluationPageSummary.$runWithCtx(ctx, {run})
      const updateDefinition = (resource, id, patch) => { const key = `${resource}:${id}`, bump = !editedVersions.current.has(key)
        editedVersions.current.add(key); return persistDefinitions(current => ({...current, [resource]: current[resource].map(item =>
          item.id == id ? {...item, ...patch, version: item.version + +bump} : item)})) }
      const saveConfiguration = () => {
        if (blockers.length) return
        const configuration = {id: `config-${Date.now().toString(36)}`, name: configurationName.trim() || `אבלואציה · ${selectedTarget.name}`,
          targetId, datasetIds, graderIds, updatedAt: Date.now()}
        persistDefinitions(current => ({...current, configurations: [configuration, ...current.configurations]}))
        setConfigurationName(''); flash('התצורה נשמרה')
      }
      const applyConfiguration = configuration => {
        setTargetId(configuration.targetId); setDatasetIds(configuration.datasetIds); setGraderIds(configuration.graderIds); flash('התצורה נטענה')
      }
      const runEvaluation = async () => {
        if (blockers.length) return
        const runId = `run-${Date.now().toString(36)}`, startedAt = Date.now(), run = {id: runId, name: configurationName.trim()
          || `אבלואציה · ${selectedTarget.name}`, status: 'running', startedAt, target: {...selectedTarget}, datasets: selectedDatasets.map(item => ({
            id: item.id, name: item.name, version: item.version, cases: item.cases.map(value => ({...value}))})), graders: selectedGraders.map(item => ({...item})),
          total: selectedCases.length, completed: 0, results: []}
        await persistDefinitions(current => ({...current, runIds: [runId, ...current.runIds], runs: [run, ...current.runs]}), true)
        await persistRun(runId, item => item); setSelectedRunId(runId); setView('runs')
        const executeCase = async testCase => {
          const caseStartedAt = Date.now(), sessionId = `${runId}:${testCase.datasetId}:${testCase.id}`
          try {
            const targetResult = await runTarget(ctx.setVars({text: testCase.input, target: selectedTarget, sessionId, roomWUrl,
              agentOsBaseUrl, agentOsToken})), durationMs = Date.now() - caseStartedAt, output = targetResult.text || targetResult.output || ''
            if (/fail|error|נכשל/i.test(targetResult.status || '')) throw new Error(`Target run failed${output ? `: ${output}` : ''}`)
            const grades = await Promise.all(selectedGraders.map(grader => grade(ctx.setVars({grader, testCase, output, durationMs}))))
            await persistRun(runId, item => ({...item, completed: item.completed + 1, results: [...item.results, {...testCase, output,
              durationMs, executionStatus: 'completed', grades, runId: targetResult.runId, opikUrl: targetResult.opikUrl}]}))
          } catch (error) {
            await persistRun(runId, item => ({...item, completed: item.completed + 1, results: [...item.results, {...testCase,
              durationMs: Date.now() - caseStartedAt, executionStatus: 'error', error: String(error.message || error), grades: []}]}))
          }
        }
        const queue = [...selectedCases]
        await Promise.all(Array.from({length: Math.min(3, queue.length)}, async () => {
          while (queue.length) await executeCase(queue.shift())
        }))
        await persistRun(runId, item => ({...item, status: 'completed', finishedAt: Date.now()}))
      }
      const nav = h('nav:mt-7 grid grid-cols-4 border-b border-[#e8e8ea] sm:flex', {'aria-label': 'ניווט אבלואציה'}, [
        ['composer', 'Play', 'הרצה חדשה'], ['runs', 'ChartNoAxesCombined', 'הרצות'], ['datasets', 'Table2', 'מערכי נתונים'],
        ['graders', 'Scale', 'בודקים']].map(([id, icon, title]) => h(`button:relative flex items-center justify-center gap-1 px-1 py-3
          text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-[#0f0f10] sm:gap-2 sm:px-3 sm:text-[13px] ${
          view == id ? 'font-medium text-[#0f0f10]' : 'text-[#6b6b6f] hover:text-[#0f0f10]'}`, {key: id, onClick: () => setView(id)}, h(
            `L:${icon}`, {size: 14}), title, view == id && h('span:absolute inset-x-3 bottom-0 h-px bg-[#0f0f10]'))))
      const step = (number, title, description, content) => h(`section:${classes.card} p-5`, {}, h(
        'div:flex items-start gap-3', {}, h('span:grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#0f0f10] text-xs font-semibold text-white', {}, number), h(
          'div:min-w-0 flex-1', {}, h('h2:text-[15px] font-semibold', {}, title), h('p:mt-1 text-[13px] text-[#6b6b6f]', {}, description), content)))
      const choice = (item, selected, meta, select) => h(`button:rounded-xl border p-4 text-right transition-colors ${selected
        ? 'border-[#0f0f10] bg-[#fafafa]' : 'border-[#e8e8ea] hover:border-[#d8d8dc] hover:bg-[#fafafa]'}`, {key: item.id,
        onClick: select}, h('div:flex items-start justify-between gap-3', {}, h('b:text-sm', {}, item.name), selected && h('L:CircleCheck', {
          size: 17, className: 'text-[#0f0f10]'})), h('p:mt-2 line-clamp-2 text-xs leading-5 text-[#6b6b6f]', {}, item.description), h(
          'div:mt-3 flex flex-wrap gap-2', {}, meta))
      const savedConfigurations = repo.configurations.length > 0 && h(`section:${classes.card}`, {}, h(
        'div:flex flex-wrap items-center gap-2', {}, h('span:text-xs font-semibold text-[#6b6b6f]', {},
          'תצורות שמורות'), repo.configurations.map(item => h(
            'button:rounded-lg border border-[#e8e8ea] px-3 py-1.5 text-xs hover:border-[#0f0f10]', {key: item.id,
              onClick: () => applyConfiguration(item)}, item.name))))
      const targetStep = step('1', 'בחירת סוכן', 'התצורה המדויקת של הסוכן נשמרת עם ההרצה.', targets.length ? h(
        'select:mt-4 w-full rounded-[10px] border border-[#e8e8ea] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#c9c9ce]', {
          value: targetId, 'aria-label': 'בחירת סוכן', onChange: event => setTargetId(event.target.value)}, h(
            'option', {value: ''}, 'בחרו סוכן'), targets.map(item => h(
            'option', {key: item.id, value: item.id}, `${item.name} · ${item.version || 'V0'}`))) : h(
          'div:mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-dashed border-[#d8d8dc] p-4', {}, h(
            'span:text-sm text-[#6b6b6f]', {}, 'אין עדיין סוכנים זמינים.'), openView && button('יצירת סוכן', () => openView('agents'), false)))
      const datasetStep = step('2', 'בחירת מערכי נתונים', 'אפשר לשלב כמה מערכים. רק תרחישים פעילים יורצו.', h(
        'div:mt-4 grid gap-3 md:grid-cols-2', {}, repo.datasets.map(dataset => choice(dataset, datasetIds.includes(dataset.id), [badge(
          `${dataset.cases.filter(item => item.enabled).length} תרחישים`), badge(`v${dataset.version}`)], () => toggle(
          datasetIds, setDatasetIds, dataset.id)))))
      const graderStep = step('3', 'בחירת בודקים',
        'בודקי חובה קובעים הצלחה או כישלון; בודקי מידע מציגים מדדים בלבד.', h(
        'div:mt-4 grid gap-3 md:grid-cols-2', {}, repo.graders.map(grader => choice(grader, graderIds.includes(grader.id), [badge(
          graderKinds[grader.kind]), badge(grader.required ? 'חובה' : 'מידע')], () => toggle(
          graderIds, setGraderIds, grader.id)))))
      const metrics = [[selectedCases.length, 'תרחישים'], [selectedCases.length, 'קריאות לסוכן'], [selectedCases.length * selectedGraders.length,
        'בדיקות'], [estimatedLlmGrades, 'בדיקות מודל']]
      const runSummary = h(`aside:${classes.card} self-start p-5 xl:sticky xl:top-6`, {}, h(
        'div:flex items-center justify-between', {}, h('h2:text-[15px] font-semibold', {}, 'סיכום ההרצה'), badge(
          blockers.length ? 'לא מוכן' : 'מוכן להרצה', blockers.length ? 'amber' : 'green')), h(
          'div:mt-5 grid grid-cols-2 gap-x-5 gap-y-4', {}, metrics.map(([value, label]) => h(
            'div:border-b border-[#e8e8ea] pb-3', {key: label}, h('b:block text-xl', {}, value), h(
              'span:text-[11px] text-[#6b6b6f]', {}, label)))), blockers.length ? h(
        'div:mt-4 rounded-[10px] border border-amber-200 bg-amber-50 p-3', {}, h('b:text-xs text-amber-900', {}, 'נדרש לפני ההרצה'), h(
          'ul:mt-2 space-y-1 text-xs text-amber-800', {}, blockers.map(item => h('li', {key: item}, `• ${item}`)))) : h(
        'div:mt-4 flex items-center gap-2 text-sm text-emerald-700', {}, h('L:CircleCheck', {size: 16}), 'הכול מוכן'), h(
        'input:mt-4 w-full rounded-[10px] border border-[#e8e8ea] bg-white px-3 py-2.5 text-sm outline-none placeholder:text-[#9b9ba0] focus:border-[#0f0f10]', {
          value: configurationName, placeholder: 'שם לתצורה (רשות)', onInput: event => setConfigurationName(event.target.value)}), h(
        'div:mt-3 grid gap-2', {}, button('הרצת אבלואציה', runEvaluation, true, {disabled: !!blockers.length}), button(
          'שמירת תצורה', saveConfiguration, false, {disabled: !!blockers.length})))
      const composer = h('div:grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]', {}, h('div:space-y-4', {}, savedConfigurations, targetStep,
        datasetStep, graderStep), runSummary)
      const datasetEditor = dataset => {
        const update = patch => updateDefinition('datasets', dataset.id, patch)
        const updateCase = (caseId, patch) => update({cases: dataset.cases.map(item => item.id == caseId ? {...item, ...patch} : item)})
        return h(`section:${classes.card} p-5`, {}, h('div:grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3', {}, h(
          'button:rounded-lg border border-[#e8e8ea] p-2', {onClick: () => (editedVersions.current.delete(`datasets:${dataset.id}`),
            setEditingDatasetId()), 'aria-label': 'חזרה'}, h('L:ChevronRight', {size: 16})), h(
            'input:min-w-0 flex-1 text-xl font-semibold outline-none', {value: dataset.name, 'aria-label': 'שם מערך הנתונים',
              dir: 'auto', onInput: event => update({name: event.target.value})}), badge(`v${dataset.version}`), h(
                'span:col-span-2 col-start-2 text-[11px] text-[#9b9ba0]', {}, 'השינויים נשמרים אוטומטית')), field(
                  'תיאור מערך הנתונים', h(
          'textarea:mt-2 min-h-20 w-full rounded-[10px] border border-[#e8e8ea] bg-[#fafafa] p-3 text-sm outline-none focus:border-[#c9c9ce]', {
            value: dataset.description, placeholder: 'מה מערך הנתונים בודק?', onInput: event => update({description: event.target.value})})), h(
          'div:mt-6 flex items-center justify-between', {}, h('h2:font-semibold', {}, `${dataset.cases.length} תרחישים`), button(
            'הוספת תרחיש', () => update({cases: [...dataset.cases, {id: `case-${Date.now().toString(36)}`, name: 'תרחיש ללא שם', input: '',
              referenceOutput: '', tags: [], enabled: true}]}), false)), h(
          'div:mt-3 space-y-3', {}, dataset.cases.map(testCase => h('article:rounded-xl border border-[#e8e8ea] p-4', {key: testCase.id}, h(
            'div:flex items-center gap-3', {}, h('input', {type: 'checkbox', checked: testCase.enabled,
              'aria-label': `תרחיש פעיל: ${testCase.name}`, onChange: event => updateCase(testCase.id, {enabled: event.target.checked})}), h(
              'input:min-w-0 flex-1 font-semibold outline-none', {value: testCase.name, 'aria-label': 'שם התרחיש',
                onInput: event => updateCase(testCase.id, {name: event.target.value})}), h(
              'button:rounded-lg p-2 text-red-600 hover:bg-red-50', {onClick: () => globalThis.confirm('למחוק את התרחיש?') && update({
                cases: dataset.cases.filter(item => item.id != testCase.id)})}, h('L:Trash2', {size: 15}))), h(
            'div:mt-3 grid gap-3 md:grid-cols-2', {}, field('קלט לסוכן', h(
              'textarea:mt-2 min-h-28 w-full rounded-[10px] border border-[#e8e8ea] bg-[#fafafa] p-3 text-sm outline-none focus:border-[#c9c9ce]', {
                value: testCase.input, placeholder: 'מה שולחים לסוכן?', onInput: event => updateCase(testCase.id, {input: event.target.value})})), field(
                  'פלט מצופה או עובדות נדרשות', h(
              'textarea:mt-2 min-h-28 w-full rounded-[10px] border border-[#e8e8ea] bg-[#fafafa] p-3 text-sm outline-none focus:border-[#c9c9ce]', {
                value: testCase.referenceOutput, placeholder: 'פלט מצופה או עובדות נדרשות',
                onInput: event => updateCase(testCase.id, {referenceOutput: event.target.value})})))))))
      }
      const datasetsView = editingDatasetId ? datasetEditor(repo.datasets.find(item => item.id == editingDatasetId)) : h(
        'div:grid gap-3 md:grid-cols-2 xl:grid-cols-3', {}, h('button:min-h-44 rounded-xl border border-dashed border-[#d8d8dc] p-6 text-[#6b6b6f] hover:border-[#0f0f10]', {
          onClick: () => {
            const dataset = {id: `dataset-${Date.now().toString(36)}`, name: 'מערך ללא שם', description: '', version: 1, cases: []}
            editedVersions.current.add(`datasets:${dataset.id}`)
            persistDefinitions(current => ({...current, datasets: [dataset, ...current.datasets]})); setEditingDatasetId(dataset.id)
          }}, h('L:Plus', {size: 20, className: 'mx-auto'}), h('b:mt-3 block text-sm', {}, 'מערך נתונים חדש')), repo.datasets.map(dataset => h(
          `article:${classes.card} flex flex-col`, {key: dataset.id}, h('div:flex items-start justify-between gap-3', {}, h(
            'div:min-w-0', {}, h('h2:text-[14px] font-medium', {}, dataset.name), h(
              'p:mt-2 line-clamp-2 min-h-[40px] text-[13px] leading-5 text-[#6b6b6f]', {}, dataset.description)), badge(`v${dataset.version}`)), h(
            'div:mt-auto flex items-center justify-between pt-5', {}, badge(`${dataset.cases.length} תרחישים`), button(
              'פתיחה', () => setEditingDatasetId(dataset.id), false)))))
      const graderEditor = grader => {
        const update = patch => updateDefinition('graders', grader.id, patch)
        return h(`section:${classes.card} mx-auto max-w-3xl p-5`, {}, h(
          'div:grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3', {}, h('button:rounded-lg border border-[#e8e8ea] p-2', {onClick: () => (
            editedVersions.current.delete(`graders:${grader.id}`), setEditingGraderId()), 'aria-label': 'חזרה'}, h(
              'L:ChevronRight', {size: 16})), h('input:min-w-0 flex-1 text-xl font-semibold outline-none', {
            value: grader.name, 'aria-label': 'שם הבודק', dir: 'auto', onInput: event => update({name: event.target.value})}), badge(
              `v${grader.version}`), h('span:col-span-2 col-start-2 text-[11px] text-[#9b9ba0]', {},
                'השינויים נשמרים אוטומטית')), field('תיאור הבודק', h(
          'textarea:mt-2 min-h-20 w-full rounded-[10px] border border-[#e8e8ea] bg-[#fafafa] p-3 text-sm outline-none focus:border-[#c9c9ce]', {
            value: grader.description, placeholder: 'מה הבודק מודד?', onInput: event => update({description: event.target.value})})), h(
          'div:mt-5 grid gap-4 sm:grid-cols-2', {}, h('label:text-xs font-semibold text-[#6b6b6f]', {}, 'סוג הבודק', h(
            'select:mt-2 w-full rounded-[10px] border border-[#e8e8ea] p-3 text-sm', {value: grader.kind,
              onChange: event => update({kind: event.target.value})}, [['exact', 'התאמה מלאה'], ['contains', 'עובדות נדרשות'], [
                'llmJudge', 'בודק מודל'], ['latency', 'זמן תגובה']].map(([value, label]) => h('option', {key: value, value}, label)))), h(
            'label:text-xs font-semibold text-[#6b6b6f]', {}, 'השפעה על התוצאה', h(
              'select:mt-2 w-full rounded-[10px] border border-[#e8e8ea] p-3 text-sm', {
              value: grader.required ? 'required' : 'informational', onChange: event => update({required: event.target.value == 'required'})}, h(
                'option', {value: 'required'}, 'בודק חובה'), h('option', {value: 'informational'}, 'מידע בלבד')))), grader.kind == 'llmJudge' && h(
          'label:mt-5 block text-xs font-semibold text-[#6b6b6f]', {}, 'מה נחשב לתשובה טובה?', h(
            'textarea:mt-2 min-h-40 w-full rounded-[10px] border border-[#e8e8ea] bg-[#fafafa] p-3 text-sm', {value: grader.criteria || '',
              onInput: event => update({criteria: event.target.value})})), h(
          'label:mt-5 block text-xs font-semibold text-[#6b6b6f]', {}, grader.kind == 'latency' ? 'זמן מרבי במילישניות' : 'סף מעבר', h(
            'input:mt-2 w-full rounded-[10px] border border-[#e8e8ea] p-3 text-sm', {type: 'number', value: grader.kind == 'exact' ? 1 : grader.threshold,
              min: grader.kind == 'latency' ? 1 : 0.01, max: grader.kind == 'latency' ? undefined : 1,
              step: grader.kind == 'latency' ? 1 : 0.01, disabled: grader.kind == 'exact',
              onInput: event => update({threshold: +event.target.value})})))
      }
      const gradersView = editingGraderId ? graderEditor(repo.graders.find(item => item.id == editingGraderId)) : h(
        'div:grid gap-3 md:grid-cols-2 xl:grid-cols-3', {}, h('button:min-h-44 rounded-xl border border-dashed border-[#d8d8dc] p-6 text-[#6b6b6f] hover:border-[#0f0f10]', {
          onClick: () => {
            const grader = {id: `grader-${Date.now().toString(36)}`, name: 'בודק ללא שם', description: '', kind: 'contains', required: true,
              threshold: 1, version: 1}
            editedVersions.current.add(`graders:${grader.id}`)
            persistDefinitions(current => ({...current, graders: [grader, ...current.graders]})); setEditingGraderId(grader.id)
          }}, h('L:Plus', {size: 20, className: 'mx-auto'}), h('b:mt-3 block text-sm', {}, 'בודק חדש')), repo.graders.map(grader => h(
          `article:${classes.card} flex flex-col`, {key: grader.id}, h('div:flex items-start justify-between gap-3', {}, h(
            'div:min-w-0', {}, h('h2:text-[14px] font-medium', {}, grader.name), h(
              'p:mt-2 line-clamp-2 min-h-[40px] text-[13px] leading-5 text-[#6b6b6f]', {}, grader.description)), badge(
                graderKinds[grader.kind])), h(
            'div:mt-auto flex items-center justify-between pt-5', {}, badge(grader.required ? 'חובה' : 'מידע'), button(
              'פתיחה', () => setEditingGraderId(grader.id), false)))))
      const runRow = result => {
        const required = result.grades.filter(grade => grade.required && grade.status != 'skipped')
        const verdict = result.executionStatus == 'error' ? 'שגיאת הרצה' : !required.length ? 'לא נבדק'
          : required.some(grade => grade.status == 'error') ? 'שגיאת בודק'
            : required.every(grade => grade.status == 'passed') ? 'עבר' : 'נכשל'
        return h('article:rounded-xl border border-[#e8e8ea] bg-white p-4', {key: `${result.datasetId}:${result.id}`}, h(
        'div:flex flex-wrap items-center gap-2', {}, badge(verdict, verdict == 'עבר' ? 'green' : verdict == 'לא נבדק' ? 'slate' : 'red'), h(
          'b:text-sm', {}, result.name), h('span:mr-auto text-xs text-[#9b9ba0]', {}, `${result.durationMs}ms`)), result.error ? h(
        'p:mt-3 text-sm text-red-700', {}, result.error) : h('details:mt-3', {}, h('summary:cursor-pointer text-xs font-semibold text-slate-600', {},
          'פלט וציונים'), h('div:mt-3 grid gap-3 lg:grid-cols-2', {}, h('div:rounded-[10px] bg-[#fafafa] p-3', {}, h(
            'b:text-[11px] text-[#6b6b6f]', {}, 'פלט בפועל'), h('p:mt-2 whitespace-pre-wrap text-sm leading-6', {}, result.output)), h(
            'div:space-y-2', {}, result.grades.map(item => h('div:rounded-[10px] border border-[#e8e8ea] p-3', {key: item.graderId}, h(
              'div:flex items-center gap-2', {}, badge({passed: 'עבר', failed: 'נכשל', skipped: 'דולג', error: 'שגיאה'}[item.status] || item.status,
                item.status == 'passed' ? 'green' : item.status == 'failed' ? 'red' : 'slate'), h(
                'b:text-xs', {}, item.graderName), h('span:mr-auto text-xs text-[#9b9ba0]', {}, `${Math.round(item.score * 100)}%`)), h(
              'p:mt-2 text-xs leading-5 text-[#6b6b6f]', {}, item.reason))))), result.opikUrl && h('a:mt-3 inline-block text-xs font-medium text-[#0f0f10]', {
                href: result.opikUrl, target: '_blank', rel: 'noreferrer'}, 'פתיחת טרייס ההרצה ↗')))
      }
      const selectedRun = repo.runs.find(item => item.id == selectedRunId) || repo.runs[0]
      const runsView = selectedRun ? (() => {
        const summary = summaryOf(selectedRun), pct = selectedRun.total ? Math.round(selectedRun.completed / selectedRun.total * 100) : 0
        return h('div:grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]', {}, h('aside:space-y-2', {}, repo.runs.map(run => {
          const itemSummary = summaryOf(run)
          return h(`button:w-full rounded-xl border p-4 text-right ${selectedRun.id == run.id ? 'border-[#0f0f10] bg-[#fafafa]' :
            'border-[#e8e8ea] bg-white hover:border-[#d8d8dc]'}`, {key: run.id, onClick: () => setSelectedRunId(run.id)}, h(
              'b:block truncate text-sm', {}, run.name), h(
              'div:mt-3 flex items-center justify-between', {}, badge(run.status == 'running' ? `${run.completed}/${run.total}` : `${itemSummary.score}%`,
                itemSummary.failed || itemSummary.errors ? 'red' : 'green'), h(
                'span:text-xs text-[#9b9ba0]', {}, new Date(run.startedAt).toLocaleString('he-IL')))) })), h('section:min-w-0', {}, h(
          `div:${classes.card} p-5 sm:p-6`, {}, h('div:flex flex-wrap items-start justify-between gap-4', {}, h(
            'div:min-w-0', {}, badge(selectedRun.status == 'running' ? 'מתבצעת' : 'הושלמה'), h(
              'h1:mt-3 truncate text-xl font-semibold', {}, selectedRun.name), h('p:mt-1 text-sm text-[#6b6b6f]', {}, selectedRun.target.name)), h(
            'div:text-left', {}, h('b:block text-3xl', {}, `${summary.score}%`), h('span:text-xs text-[#6b6b6f]', {}, 'ציון ממוצע'))), h(
            'div:mt-5 h-1.5 overflow-hidden rounded-full bg-[#eeeeef]', {}, h('div:h-full rounded-full bg-[#0f0f10] transition-all', {
              style: {width: `${pct}%`}})), h('div:mt-4 flex flex-wrap gap-2', {}, badge(`${summary.passed} עברו`, 'green'), badge(
                `${summary.failed} נכשלו`, summary.failed ? 'red' : 'slate'), badge(`${summary.errors} שגיאות הרצה`, summary.errors ? 'red' : 'slate'), badge(
                `${summary.graderErrors} שגיאות בודק`, summary.graderErrors ? 'red' : 'slate'), summary.notGraded > 0 && badge(
                `${summary.notGraded} לא נבדקו`), badge(`${selectedRun.completed}/${selectedRun.total} הושלמו`))), h(
          'div:mt-4 space-y-3', {}, selectedRun.results.length ? selectedRun.results.map(runRow) : h(
            'div:rounded-xl border border-dashed border-[#d8d8dc] p-12 text-center text-sm text-[#6b6b6f]', {}, 'ממתין לתוצאה הראשונה…'))))
      })() : h('div:rounded-xl border border-dashed border-[#d8d8dc] p-16 text-center', {}, h('L:ChartNoAxesCombined', {
        size: 28, className: 'mx-auto text-[#6b6b6f]'}), h('h2:mt-4 font-semibold', {}, 'אין עדיין הרצות'), h(
        'p:mt-2 text-sm text-[#6b6b6f]', {}, 'הרכיבו אבלואציה ראשונה כדי ליצור תוצאה שניתנת להשוואה.'))
      const pageMeta = {composer: ['אבלואציה', 'בחרו סוכן, מערכי נתונים ובודקים — והריצו בדיקה שניתנת לשחזור.'],
        runs: ['הרצות', 'תוצאות שמפרידות בין תקלות הרצה לבין איכות התשובה.'],
        datasets: ['מערכי נתונים', 'תרחישים לשימוש חוזר, עם גרסאות ופלט מצופה.'],
        graders: ['בודקים', 'כללי בדיקה דטרמיניסטיים ומבוססי מודל.']}[view]
      const page = h(`${embedded ? 'main:min-h-screen px-5 pb-24 pt-10 sm:mr-[248px] sm:px-10' : 'main:mx-auto px-4 py-8 sm:px-7'} max-w-[1440px]`, {}, h(
        'div:mx-auto max-w-6xl', {}, h('div', {}, h('h1:text-[26px] font-semibold tracking-[-0.02em]', {}, pageMeta[0]), h(
          'p:mt-1.5 text-sm text-[#6b6b6f]', {}, pageMeta[1])), nav, h('div:mt-5', {}, {composer, runs: runsView, datasets: datasetsView,
            graders: gradersView}[view])))
      const alert = notice && h(`div:fixed ${embedded ? 'bottom-16' : 'bottom-5'} left-5 z-[100] rounded-xl border border-[#d8d8dc] ` +
        'bg-[#f4f4f5] px-4 py-2 text-sm sm:bottom-5', {}, notice)
      if (embedded) return h('div:min-w-0 overflow-x-hidden bg-white text-[#0f0f10] antialiased', {dir: 'rtl', lang: 'he',
        style: {fontFamily: '"Inter", "Assistant", system-ui, sans-serif'}}, page, alert)
      return h('div:min-h-screen overflow-x-hidden bg-white text-[#0f0f10] antialiased', {dir: 'rtl', lang: 'he',
        style: {fontFamily: '"Inter", "Assistant", system-ui, sans-serif'}}, h(
          'header:border-b border-[#e8e8ea] bg-white', {}, h('div:mx-auto flex max-w-6xl items-center gap-3 px-4 py-5 sm:px-7', {}, h(
            'span:grid h-9 w-9 place-items-center rounded-[10px] bg-[#0f0f10] text-white', {}, h('L:SquareCheckBig', {size: 18})), h(
              'div', {}, h('h1:text-base font-semibold', {}, 'Wonder Evaluations'), h('p:text-xs text-[#6b6b6f]', {}, 'בדיקות איכות לסוכנים')))), page, alert)
    }
  })
})
