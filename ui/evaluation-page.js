import { dsls } from '@jb6/core'
import '@jb6/react'
import './evaluation-page-domain.js'
import './wonder-platform-repository.js'
import './wonder-platform-marketplace-api.js'
import './wonder-platform-agent-wurl.js'
import './wonder-platform-kit.js'

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
    hFunc: (ctx, {react: {h, hh, useEffect, useRef, useState}},
      {roomWUrl, marketplaceBaseUrl, agentOsBaseUrl, agentOsToken, loadState, saveDefinitions, saveRun, loadTargets, runTarget,
        grade}) => function EvaluationPage({embedded, targetItems, openView} = {}) {
      const [repo, setRepo] = useState(), repoRef = useRef(), saveQueue = useRef(Promise.resolve()), definitionTimer = useRef()
      const editedVersions = useRef(new Set())
      const [targets, setTargets] = useState([]), [loadError, setLoadError] = useState(), [view, setView] = useState('composer')
      const [composerStep, setComposerStep] = useState(0), [libraryTab, setLibraryTab] = useState('datasets')
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
      if (loadError) return h(`main:${classes.page} grid place-items-center p-6`, {},
        h(`div:${classes.panel} max-w-md p-8 text-center`, {},
          h('span:mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full bg-[var(--wp-danger-soft)] ' +
            'text-[var(--wp-danger)]', {}, h('L:CircleAlert', {size: 20})),
          h(`h1:${classes.h2}`, {}, 'עמוד האבלואציה אינו זמין'),
          h(`p:mt-2 ${classes.body}`, {}, 'לא הצלחנו לטעון את נתוני האבלואציה. בדקו את החיבור ונסו שוב.'),
          h('p:mt-3 truncate text-[12px] text-[var(--wp-ink-4)]', {dir: 'ltr', title: String(loadError.message || loadError)},
            String(loadError.message || loadError))))
      if (!repo) return h(`main:${classes.page} px-6 pt-9`, {},
        h('div:mx-auto w-full max-w-[1180px]', {}, h('span:wp-skel block h-6 w-40'),
          h('span:wp-skel mt-3 block h-3.5 w-96 max-w-full'), h('span:wp-skel mt-8 block h-9 w-full'),
          h('div:mt-6 grid gap-3 sm:grid-cols-2', {}, [0, 1, 2, 3].map(index =>
            h('div:rounded-[12px] border border-[var(--wp-border)] p-4', {key: index},
              h('span:wp-skel block h-3.5 w-32'), h('span:wp-skel mt-3 block h-3 w-full'),
              h('span:wp-skel mt-2 block h-3 w-2/3'))))))
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
      const badge = (text, tone = 'slate') => h(`span:${classes.chip} ${tone == 'green'
        ? 'border-[var(--wp-accent-soft)] bg-[var(--wp-accent-soft)] text-[var(--wp-accent-ink)]'
        : tone == 'red' ? 'border-[var(--wp-danger-soft)] bg-[var(--wp-danger-soft)] text-[var(--wp-danger)]'
          : tone == 'amber' ? 'border-[var(--wp-warn)]/25 bg-[var(--wp-warn-soft)] text-[var(--wp-warn)]' : ''}`, {}, text)
      const button = (text, onClick, primary, props = {}) => h(`button:${primary ? classes.primary : classes.button}`, {onClick, ...props}, text)
      const field = (title, control) => h(`label:${classes.label}`, {}, title, control)
      const emptyChoice = (text, action, label) => h(
        'div:mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-dashed border-[var(--wp-border-strong)] p-4',
        {}, h('span:text-[13px] text-[var(--wp-ink-3)]', {}, text), button(label, action, false))
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
        setTargetId(configuration.targetId); setDatasetIds(configuration.datasetIds); setGraderIds(configuration.graderIds)
        setComposerStep(3); flash('התצורה נטענה — אפשר להריץ')
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
      const nav = h(`nav:mt-7 ${classes.segment} w-full grid grid-cols-3 sm:inline-flex sm:w-auto`, {'aria-label': 'ניווט אבלואציה'}, [
        ['library', 'Library', 'ספרייה'], ['runs', 'ChartNoAxesCombined', 'הרצות קודמות'], ['composer', 'Play', 'הרצה']]
        .map(([id, icon, title]) => h(`button:${view == id ? classes.tabOn : classes.tab} flex items-center justify-center gap-1.5`,
          {key: id, onClick: () => setView(id)}, h(`L:${icon}`, {size: 14}), title)))
      const step = (number, title, description, content) => h(`section:${classes.card} p-5`, {}, h(
        'div:flex items-start gap-3', {}, h(
          'span:grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--wp-ink)] text-[12px] font-semibold text-white', {}, number), h(
          'div:min-w-0 flex-1', {}, h(`h2:${classes.h2}`, {}, title), h('p:mt-1 text-[13px] text-[var(--wp-ink-3)]', {}, description), content)))
      const choice = (item, selected, meta, select) => h(`button:rounded-[12px] border p-4 text-right transition-colors ${selected
        ? 'border-[var(--wp-ink)] bg-[var(--wp-surface-2)]'
        : 'border-[var(--wp-border)] hover:border-[var(--wp-border-strong)] hover:bg-[var(--wp-surface-2)]'}`, {key: item.id,
        onClick: select, 'aria-label': item.name}, h('div:flex items-start justify-between gap-3', {}, h('b:text-[13px] font-semibold', {},
          item.name), selected && h('L:CircleCheck', {size: 17, className: 'text-[var(--wp-ink)]'})), h(
          'p:mt-2 line-clamp-2 text-[12px] leading-5 text-[var(--wp-ink-3)]', {}, item.description || item.desc), h(
          'div:mt-3 flex flex-wrap gap-2', {}, meta))
      const savedConfigurations = repo.configurations.length > 0 && h(`section:${classes.card} p-4`, {}, h(
        'div:flex flex-wrap items-center gap-2', {}, h('span:text-[12px] font-semibold text-[var(--wp-ink-3)]', {},
          'תצורות שמורות'), repo.configurations.map(item => h(
            'button:rounded-[8px] border border-[var(--wp-border)] px-3 py-1.5 text-[12px] hover:border-[var(--wp-ink)]', {key: item.id,
              onClick: () => applyConfiguration(item)}, item.name))))
      const targetStep = step('1', 'איזה סוכן רוצים לבדוק?', 'בחרו את הסוכן שעליו תרוץ הבדיקה.', targets.length ? h(
        'div:mt-4 grid gap-3 md:grid-cols-2', {}, targets.map(item => choice(item, item.id == targetId, [badge(item.version || 'V0')], () =>
          setTargetId(item.id)))) : h(
          'div:mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-dashed border-[var(--wp-border-strong)] p-4',
          {}, h('span:text-[13px] text-[var(--wp-ink-3)]', {}, 'אין עדיין סוכנים זמינים.'),
          openView && button('יצירת סוכן', () => openView('agents'), false)))
      const datasetStep = step('2', 'על אילו תרחישים?',
        'בחרו מערך אחד או יותר. רק תרחישים פעילים יורצו.', repo.datasets.length ? h(
        'div:mt-4 grid gap-3 md:grid-cols-2', {}, repo.datasets.map(dataset => choice(dataset, datasetIds.includes(dataset.id), [badge(
          `${dataset.cases.filter(item => item.enabled).length} תרחישים`), badge(`v${dataset.version}`)], () => toggle(
          datasetIds, setDatasetIds, dataset.id)))) : emptyChoice('אין עדיין סטים.', () => (
            setLibraryTab('datasets'), setView('library')), 'יצירת סט'))
      const graderStep = step('3', 'איך מודדים הצלחה?',
        'בודקי חובה קובעים הצלחה או כישלון. מדדי מידע לא משפיעים על התוצאה.', repo.graders.length ? h(
        'div:mt-4 grid gap-3 md:grid-cols-2', {}, repo.graders.map(grader => choice(grader, graderIds.includes(grader.id), [badge(
          graderKinds[grader.kind]), badge(grader.required ? 'חובה' : 'מידע')], () => toggle(
          graderIds, setGraderIds, grader.id)))) : emptyChoice('אין עדיין בודקים.', () => (
            setLibraryTab('graders'), setView('library')), 'יצירת בודק'))
      const metrics = [[selectedCases.length, 'תרחישים'], [selectedCases.length, 'קריאות לסוכן'], [selectedCases.length * selectedGraders.length,
        'בדיקות'], [estimatedLlmGrades, 'בדיקות מודל']]
      const reviewRow = (icon, title, value, editStep) => h(
        'div:flex items-center gap-3 rounded-[12px] border border-[var(--wp-border)] p-4', {},
        hh(ctx, dsls.react['react-comp'].wonderPlatformMark, {icon, size: 'md'}), h(
          'div:min-w-0 flex-1', {}, h('span:block text-[11px] text-[var(--wp-ink-3)]', {}, title),
          h('b:block truncate text-[13px]', {}, value)), h(
            'button:text-[12px] font-medium text-[var(--wp-ink)]', {onClick: () => setComposerStep(editStep)}, 'שינוי'))
      const reviewStep = step('4', 'סיכום ההרצה', 'עברו על הבחירות, תנו שם אם תרצו, והתחילו.', h('div:mt-5', {}, h(
        'div:grid gap-3 md:grid-cols-3', {}, reviewRow('Bot', 'סוכן', selectedTarget?.name || 'לא נבחר', 0), reviewRow(
          'Table2', 'סטים', selectedDatasets.map(item => item.name).join(', ') || 'לא נבחרו', 1), reviewRow(
          'Scale', 'בודקים', `${selectedGraders.length} נבחרו`, 2)), h(
        'div:mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4', {}, metrics.map(([value, label]) => h(
          'div:rounded-[12px] bg-[var(--wp-surface-2)] p-3', {key: label}, h('b:block wp-num text-[22px] font-semibold', {}, value), h(
            'span:text-[11px] text-[var(--wp-ink-3)]', {}, label)))), blockers.length ? h(
        'div:mt-4 rounded-[8px] border border-[var(--wp-warn)]/25 bg-[var(--wp-warn-soft)] p-3 text-[12px] ' +
        'text-[var(--wp-warn)]', {}, blockers.join(' · ')) : h(
        'div:mt-4 flex items-center gap-2 text-[13px] text-[var(--wp-accent)]', {}, h('L:CircleCheck', {size: 16}), 'הכול מוכן'), h(
        `input:${classes.field}`, {
          value: configurationName, placeholder: 'שם להרצה (רשות)', onInput: event => setConfigurationName(event.target.value)}), h(
        'div:mt-3 flex flex-col gap-2 sm:flex-row', {}, button('הרצת אבלואציה', runEvaluation, true, {disabled: !!blockers.length}), button(
          'שמירת הבחירות לשימוש חוזר', saveConfiguration, false, {disabled: !!blockers.length}))))
      const stepReady = [!!selectedTarget, !!selectedCases.length && !selectedCases.some(item => !item.input?.trim()), !blockers.length, !blockers.length]
      const furthestStep = stepReady[0] ? stepReady[1] ? stepReady[2] ? 3 : 2 : 1 : 0
      const flowSteps = [['Bot', 'סוכן'], ['Table2', 'תרחישים'], ['Scale', 'מדידה'], ['Rocket', 'הרצה']]
      const flowNav = h(`nav:${classes.segment} w-full grid grid-cols-4`, {'aria-label': 'שלבי ההרצה'},
        flowSteps.map(([icon, title], index) => h(`button:${index == composerStep ? classes.tabOn : classes.tab} flex min-w-0 ` +
          `items-center justify-center gap-1.5 ${index > furthestStep ? 'pointer-events-none opacity-40' : ''}`,
          {key: title, disabled: index > furthestStep, onClick: () => setComposerStep(index)},
          index < composerStep && index <= furthestStep ? h('L:Check', {size: 14}) : h(`L:${icon}`, {size: 14}),
          h('span:truncate', {}, title))))
      const nextLabels = ['המשך לתרחישים', 'המשך לבודקים', 'המשך לסיכום']
      const flowControls = composerStep < 3 && h('div:mt-4 flex items-center justify-between gap-3', {}, composerStep ? button(
        'חזרה', () => setComposerStep(composerStep - 1), false) : h('span'), button(nextLabels[composerStep], () => setComposerStep(
          composerStep + 1), true, {disabled: !stepReady[composerStep]}))
      const composer = h('div:space-y-4', {}, savedConfigurations, flowNav, [targetStep, datasetStep, graderStep, reviewStep][composerStep], flowControls)
      const datasetEditor = dataset => {
        const update = patch => updateDefinition('datasets', dataset.id, patch)
        const updateCase = (caseId, patch) => update({cases: dataset.cases.map(item => item.id == caseId ? {...item, ...patch} : item)})
        return h(`section:${classes.card} p-5`, {}, h('div:grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3', {}, h(
          `button:${classes.icon}`, {onClick: () => (editedVersions.current.delete(`datasets:${dataset.id}`),
            setEditingDatasetId()), 'aria-label': 'חזרה'}, h('L:ChevronRight', {size: 16})), h(
            'input:min-w-0 flex-1 bg-transparent text-[15px] font-semibold outline-none', {value: dataset.name, 'aria-label': 'שם מערך הנתונים',
              dir: 'auto', onInput: event => update({name: event.target.value})}), badge(`v${dataset.version}`), h(
                'span:col-span-2 col-start-2 text-[11px] text-[var(--wp-ink-4)]', {}, 'השינויים נשמרים אוטומטית')), field(
                  'תיאור הסט', h(
          `textarea:${classes.area} min-h-20`, {
            value: dataset.description, placeholder: 'מה הסט בודק?', onInput: event => update({description: event.target.value})})), h(
          'div:mt-6 flex items-center justify-between', {}, h('h2:font-semibold', {}, `${dataset.cases.length} תרחישים`), button(
            'הוספת תרחיש', () => update({cases: [...dataset.cases, {id: `case-${Date.now().toString(36)}`, name: 'תרחיש ללא שם', input: '',
              referenceOutput: '', tags: [], enabled: true}]}), false)), h(
          'div:mt-3 space-y-3', {}, dataset.cases.map(testCase => h(`article:${classes.card}`, {key: testCase.id}, h(
            'div:flex items-center gap-3', {}, h('input', {type: 'checkbox', checked: testCase.enabled,
              'aria-label': `תרחיש פעיל: ${testCase.name}`, onChange: event => updateCase(testCase.id, {enabled: event.target.checked})}), h(
              'input:min-w-0 flex-1 font-semibold outline-none', {value: testCase.name, 'aria-label': 'שם התרחיש',
                onInput: event => updateCase(testCase.id, {name: event.target.value})}), h(
              `button:${classes.icon} text-[var(--wp-danger)] hover:bg-[var(--wp-danger-soft)]`, {onClick: () => globalThis.confirm('למחוק את התרחיש?') && update({
                cases: dataset.cases.filter(item => item.id != testCase.id)})}, h('L:Trash2', {size: 15}))), h(
            'div:mt-3 grid gap-3 md:grid-cols-2', {}, field('קלט לסוכן', h(
              `textarea:${classes.area} min-h-28`, {
                value: testCase.input, placeholder: 'מה שולחים לסוכן?', onInput: event => updateCase(testCase.id, {input: event.target.value})})), field(
                  'פלט מצופה או עובדות נדרשות', h(
              `textarea:${classes.area} min-h-28`, {
                value: testCase.referenceOutput, placeholder: 'פלט מצופה או עובדות נדרשות',
                onInput: event => updateCase(testCase.id, {referenceOutput: event.target.value})})))))))
      }
      const datasetsView = editingDatasetId ? datasetEditor(repo.datasets.find(item => item.id == editingDatasetId)) : h(
        'div:grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]', {}, h('button:min-h-44 rounded-[12px] ' +
          'border border-dashed border-[var(--wp-border-strong)] p-6 text-[var(--wp-ink-3)] hover:border-[var(--wp-ink)]', {
          onClick: () => {
            const dataset = {id: `dataset-${Date.now().toString(36)}`, name: 'מערך ללא שם', description: '', version: 1, cases: []}
            editedVersions.current.add(`datasets:${dataset.id}`)
            persistDefinitions(current => ({...current, datasets: [dataset, ...current.datasets]})); setEditingDatasetId(dataset.id)
          }}, h('L:Plus', {size: 20, className: 'mx-auto'}), h('b:mt-3 block text-[13px]', {}, 'סט חדש')), repo.datasets.map(dataset => h(
          `article:${classes.card} flex flex-col`, {key: dataset.id}, h('div:flex items-start justify-between gap-3', {}, h(
            'div:min-w-0', {}, h('h2:text-[14px] font-medium', {}, dataset.name), h(
              'p:mt-2 line-clamp-2 min-h-[40px] text-[13px] leading-5 text-[var(--wp-ink-3)]', {}, dataset.description)), badge(`v${dataset.version}`)), h(
            'div:mt-auto flex items-center justify-between pt-5', {}, badge(`${dataset.cases.length} תרחישים`), button(
              'פתיחה', () => setEditingDatasetId(dataset.id), false)))))
      const graderEditor = grader => {
        const update = patch => updateDefinition('graders', grader.id, patch)
        return h(`section:${classes.card} mx-auto max-w-3xl p-5`, {}, h(
          'div:grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3', {}, h(`button:${classes.icon}`, {onClick: () => (
            editedVersions.current.delete(`graders:${grader.id}`), setEditingGraderId()), 'aria-label': 'חזרה'}, h(
              'L:ChevronRight', {size: 16})), h('input:min-w-0 flex-1 bg-transparent text-[15px] font-semibold outline-none', {
            value: grader.name, 'aria-label': 'שם הבודק', dir: 'auto', onInput: event => update({name: event.target.value})}), badge(
              `v${grader.version}`), h('span:col-span-2 col-start-2 text-[11px] text-[var(--wp-ink-4)]', {},
                'השינויים נשמרים אוטומטית')), field('תיאור הבודק', h(
          `textarea:${classes.area} min-h-20`, {
            value: grader.description, placeholder: 'מה הבודק מודד?', onInput: event => update({description: event.target.value})})), h(
          'div:mt-5 grid gap-4 sm:grid-cols-2', {}, h('label:text-[12px] font-semibold text-[var(--wp-ink-3)]', {}, 'סוג הבודק', h(
            `select:${classes.field}`, {value: grader.kind,
              onChange: event => update({kind: event.target.value})}, [['exact', 'התאמה מלאה'], ['contains', 'עובדות נדרשות'], [
                'llmJudge', 'בודק מודל'], ['latency', 'זמן תגובה']].map(([value, label]) => h('option', {key: value, value}, label)))), h(
            'label:text-[12px] font-semibold text-[var(--wp-ink-3)]', {}, 'השפעה על התוצאה', h(
              `select:${classes.field}`, {
              value: grader.required ? 'required' : 'informational', onChange: event => update({required: event.target.value == 'required'})}, h(
                'option', {value: 'required'}, 'בודק חובה'), h('option', {value: 'informational'}, 'מידע בלבד')))), grader.kind == 'llmJudge' && h(
          'label:mt-5 block text-[12px] font-semibold text-[var(--wp-ink-3)]', {}, 'מה נחשב לתשובה טובה?', h(
            `textarea:${classes.area} min-h-40`, {value: grader.criteria || '',
              onInput: event => update({criteria: event.target.value})})), h(
          'label:mt-5 block text-[12px] font-semibold text-[var(--wp-ink-3)]', {}, grader.kind == 'latency' ? 'זמן מרבי במילישניות' : 'סף מעבר', h(
            `input:${classes.field}`, {type: 'number', value: grader.kind == 'exact' ? 1 : grader.threshold,
              min: grader.kind == 'latency' ? 1 : 0.01, max: grader.kind == 'latency' ? undefined : 1,
              step: grader.kind == 'latency' ? 1 : 0.01, disabled: grader.kind == 'exact',
              onInput: event => update({threshold: +event.target.value})})))
      }
      const gradersView = editingGraderId ? graderEditor(repo.graders.find(item => item.id == editingGraderId)) : h(
        'div:grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]', {}, h('button:min-h-44 rounded-[12px] ' +
          'border border-dashed border-[var(--wp-border-strong)] p-6 text-[var(--wp-ink-3)] hover:border-[var(--wp-ink)]', {
          onClick: () => {
            const grader = {id: `grader-${Date.now().toString(36)}`, name: 'בודק ללא שם', description: '', kind: 'contains', required: true,
              threshold: 1, version: 1}
            editedVersions.current.add(`graders:${grader.id}`)
            persistDefinitions(current => ({...current, graders: [grader, ...current.graders]})); setEditingGraderId(grader.id)
          }}, h('L:Plus', {size: 20, className: 'mx-auto'}), h('b:mt-3 block text-[13px]', {}, 'בודק חדש')), repo.graders.map(grader => h(
          `article:${classes.card} flex flex-col`, {key: grader.id}, h('div:flex items-start justify-between gap-3', {}, h(
            'div:min-w-0', {}, h('h2:text-[14px] font-medium', {}, grader.name), h(
              'p:mt-2 line-clamp-2 min-h-[40px] text-[13px] leading-5 text-[var(--wp-ink-3)]', {}, grader.description)), badge(
                graderKinds[grader.kind])), h(
            'div:mt-auto flex items-center justify-between pt-5', {}, badge(grader.required ? 'חובה' : 'מידע'), button(
              'פתיחה', () => setEditingGraderId(grader.id), false)))))
      const runRow = result => {
        const required = result.grades.filter(grade => grade.required && grade.status != 'skipped')
        const verdict = result.executionStatus == 'error' ? 'שגיאת הרצה' : !required.length ? 'לא נבדק'
          : required.some(grade => grade.status == 'error') ? 'שגיאת בודק'
            : required.every(grade => grade.status == 'passed') ? 'עבר' : 'נכשל'
        return h(`article:${classes.card}`, {key: `${result.datasetId}:${result.id}`}, h(
        'div:flex flex-wrap items-center gap-2', {}, badge(verdict, verdict == 'עבר' ? 'green' : verdict == 'לא נבדק' ? 'slate' : 'red'), h(
          'b:text-[13px]', {}, result.name), h('span:mr-auto text-[12px] text-[var(--wp-ink-4)]', {}, `${result.durationMs}ms`)), result.error ? h(
        'p:mt-3 text-[13px] text-[var(--wp-danger)]', {}, result.error) : h('details:mt-3', {}, h('summary:cursor-pointer text-[12px] font-semibold text-[var(--wp-ink-3)]', {},
          'פלט וציונים'), h('div:mt-3 grid gap-3 lg:grid-cols-2', {}, h('div:rounded-[8px] bg-[var(--wp-surface-2)] p-3', {}, h(
            'b:text-[11px] text-[var(--wp-ink-3)]', {}, 'פלט בפועל'), h('p:mt-2 whitespace-pre-wrap text-[13px] leading-6', {}, result.output)), h(
            'div:space-y-2', {}, result.grades.map(item => h('div:rounded-[8px] border border-[var(--wp-border)] p-3', {key: item.graderId}, h(
              'div:flex items-center gap-2', {}, badge({passed: 'עבר', failed: 'נכשל', skipped: 'דולג', error: 'שגיאה'}[item.status] || item.status,
                item.status == 'passed' ? 'green' : item.status == 'failed' ? 'red' : 'slate'), h(
                'b:text-[12px]', {}, item.graderName), h('span:mr-auto text-[12px] text-[var(--wp-ink-4)]', {}, `${Math.round(item.score * 100)}%`)), h(
              'p:mt-2 text-[12px] leading-5 text-[var(--wp-ink-3)]', {}, item.reason))))), result.opikUrl && h('a:mt-3 inline-block text-[12px] font-medium text-[var(--wp-ink)]', {
                href: result.opikUrl, target: '_blank', rel: 'noreferrer'}, 'פתיחת טרייס ההרצה ↗')))
      }
      const selectedRun = repo.runs.find(item => item.id == selectedRunId) || repo.runs[0]
      const runsView = selectedRun ? (() => {
        const summary = summaryOf(selectedRun), pct = selectedRun.total ? Math.round(selectedRun.completed / selectedRun.total * 100) : 0
        return h('div:grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]', {}, h('aside:space-y-2', {}, repo.runs.map(run => {
          const itemSummary = summaryOf(run)
          return h(`button:w-full rounded-[12px] border p-4 text-right ${selectedRun.id == run.id ? 'border-[var(--wp-ink)] bg-[var(--wp-surface-2)]' :
            'border-[var(--wp-border)] bg-[var(--wp-surface)] hover:border-[var(--wp-border-strong)]'}`, {key: run.id, onClick: () => setSelectedRunId(run.id)}, h(
              'b:block truncate text-[13px]', {}, run.name), h(
              'div:mt-3 flex items-center justify-between', {}, badge(run.status == 'running' ? `${run.completed}/${run.total}` : `${itemSummary.score}%`,
                itemSummary.failed || itemSummary.errors ? 'red' : 'green'), h(
                'span:text-[12px] text-[var(--wp-ink-4)]', {}, new Date(run.startedAt).toLocaleString('he-IL')))) })), h('section:min-w-0', {}, h(
          `div:${classes.card} p-5 sm:p-6`, {}, h('div:flex flex-wrap items-start justify-between gap-4', {}, h(
            'div:min-w-0', {}, badge(selectedRun.status == 'running' ? 'מתבצעת' : 'הושלמה'), h(
              'h1:mt-3 truncate text-[15px] font-semibold', {}, selectedRun.name), h('p:mt-1 text-[13px] text-[var(--wp-ink-3)]', {}, selectedRun.target.name)), h(
            'div:text-left', {}, h('b:block wp-num text-[22px] font-semibold', {}, `${summary.score}%`), h('span:text-[12px] text-[var(--wp-ink-3)]', {}, 'ציון ממוצע'))), h(
            'div:mt-5 h-1.5 overflow-hidden rounded-full bg-[var(--wp-surface-3)]', {}, h('div:h-full rounded-full bg-[var(--wp-ink)] transition-all', {
              style: {width: `${pct}%`}})), h('div:mt-4 flex flex-wrap gap-2', {}, badge(`${summary.passed} עברו`, 'green'), badge(
                `${summary.failed} נכשלו`, summary.failed ? 'red' : 'slate'), badge(`${summary.errors} שגיאות הרצה`, summary.errors ? 'red' : 'slate'), badge(
                `${summary.graderErrors} שגיאות בודק`, summary.graderErrors ? 'red' : 'slate'), summary.notGraded > 0 && badge(
                `${summary.notGraded} לא נבדקו`), badge(`${selectedRun.completed}/${selectedRun.total} הושלמו`))), h(
          'div:mt-4 space-y-3', {}, selectedRun.results.length ? selectedRun.results.map(runRow) : h(
            'div:rounded-[12px] border border-dashed border-[var(--wp-border-strong)] p-12 text-center text-[13px] text-[var(--wp-ink-3)]', {}, 'ממתין לתוצאה הראשונה…'))))
      })() : hh(ctx, dsls.react['react-comp'].wonderPlatformEmpty, {icon: 'ChartNoAxesCombined', title: 'אין עדיין הרצות',
        body: 'הרכיבו אבלואציה ראשונה כדי ליצור תוצאה שניתנת להשוואה.'})
      const openLibraryTab = id => (setLibraryTab(id), setEditingDatasetId(), setEditingGraderId())
      const libraryView = h('div', {}, h(`nav:mb-5 ${classes.segment}`, {'aria-label': 'ספריית אבלואציה'}, [
        ['datasets', 'Table2', 'סטים'], ['graders', 'Scale', 'בודקים']].map(([id, icon, title]) => h(
          `button:${libraryTab == id ? classes.tabOn : classes.tab} flex items-center gap-1.5`,
          {key: id, onClick: () => openLibraryTab(id)}, h(`L:${icon}`, {size: 15}), title))),
      libraryTab == 'datasets' ? datasetsView : gradersView)
      const pageMeta = {
        composer: ['הרצה חדשה', 'בוחרים סוכן, תרחישים ומדדי הצלחה — ומקבלים תוצאה שאפשר לסמוך עליה.'],
        runs: ['הרצות קודמות', 'תוצאות שמפרידות בין תקלות הרצה לבין איכות התשובה.'],
        library: ['ספריית אבלואציה', 'יוצרים ומנהלים סטים ובודקים לשימוש חוזר.']}[view]
      const page = h(`main:${classes.page} wp-scroll overflow-x-hidden`, {},
        h(`div:${classes.content} pb-24 pt-9`, {},
          h('div', {}, h(`h1:${classes.h1}`, {}, pageMeta[0]),
            h('p:mt-1.5 max-w-[62ch] text-[13px] leading-[1.6] text-[var(--wp-ink-3)]', {}, pageMeta[1])),
          nav, h('div:mt-6', {}, {composer, runs: runsView, library: libraryView}[view])))
      const alert = notice && h('div:fixed bottom-16 left-5 z-[100] flex items-center gap-2 rounded-[8px] ' +
        'bg-[var(--wp-ink)] px-3.5 py-2 text-[13px] font-medium text-white shadow-[var(--wp-sh-2)] sm:bottom-5', {},
      h('L:Check', {size: 14}), notice)
      if (embedded) return h('div:contents', {}, page, alert)
      return h('div:wp-app flex min-h-screen bg-[var(--wp-canvas)] text-[var(--wp-ink)]', {dir: 'rtl', lang: 'he'},
        h('style', {}, dsls.common.data.wonderPlatformCss.$run()), page, alert)
    }
  })
})
