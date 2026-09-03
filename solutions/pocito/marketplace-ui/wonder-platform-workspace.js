import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-agent-results.js'
import './wonder-platform-searchable-select.js'
import './wonder-platform-wizard.js'
import './wonder-platform-kit.js'
import './wonder-platform-capability-step.js'
import './wonder-platform-trace.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformWorkspace', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh, useEffect, useState}}) => props => {
      const {workspace, repo, openPicker, openEditor, createNested, runTarget, runEval, update, panelOpen, setPanelOpen,
        tab, setTab, resetScroll, finish, finishLabel, finishAria} = props
      const item = workspace.item, resource = workspace.resource
      const {classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const [testInput, setTestInput] = useState('')
      const [runs, setRuns] = useState([]), [evaluationId, setEvaluationId] = useState(item.evaluationId || '')
      const [evaluationRun, setEvaluationRun] = useState(), [detail, setDetail] = useState(-1)
      const [stepIds, setStepIds] = useState({}), stepId = stepIds[resource] || 'identity'
      const runtimeConfig = value => JSON.stringify(value)
      const fieldLabel = (title, key) => [title, h(`span:mr-2 ${classes.mono}`, {key}, key)]
      const savedConfig = workspace.baseline, [chatSessionId, setChatSessionId] = useState(`${item.id}-${Date.now()}`)
      const [sessionConfig, setSessionConfig] = useState(savedConfig)
      const itemDirty = runtimeConfig(item) != savedConfig, sessionOutdated = runs.length > 0 && sessionConfig != savedConfig
      useEffect(() => {
        setStepIds({}); setEvaluationId(item.evaluationId || '')
        setRuns([]); setChatSessionId(`${item.id}-${Date.now()}`); setSessionConfig(runtimeConfig(item))
      }, [item.originalId, resource])
      const isAgent = resource == 'agents', isPlugin = resource == 'plugins'
      const kind = {agents: 'סוכן', plugins: 'פלאגין', subagents: 'סאב-אייג׳נט'}[resource], targetLabel = `ה${kind}`
      const primary = isAgent ? ['plugins'] : isPlugin ? ['skills', 'tools', 'knowledge']
        : repo.marketplace ? ['plugins', 'skills', 'tools'] : ['skills', 'tools']
      const secondary = isAgent ? ['skills', 'tools', 'knowledge'] : []
      const sendTest = async input => {
        const text = input.trim()
        if (!text || runs.some(run => run.status == 'מריץ…')) return
        const id = `test-${Date.now()}`, pending = {id, input: text, status: 'מריץ…', trace: []}
        setRuns(items => [...items, pending]); setTestInput('')
        const applyPartial = partial => setRuns(items => items.map(run => run.id == id ? {...run, ...partial,
          output: partial.text || partial.output || run.output, status: partial.status || run.status, trace: partial.runtimeSteps || run.trace} : run))
        try {
          const result = await runTarget(text, item, chatSessionId, applyPartial)
          applyPartial({...result, status: result.status || 'הושלם'})
        } catch (error) {
          setRuns(items => items.map(run => run.id == id ? {...run, status: 'נכשל', output: String(error.message || error)} : run))
        }
      }
      const executeEval = async () => {
        const evaluation = repo.evaluations.find(value => value.id == evaluationId)
        if (!evaluation || evaluationRun?.status == 'מריץ…') return
        setEvaluationRun({status: 'מריץ…', rows: []}); setEvaluationRun(await runEval(evaluation, resource, item))
      }
      const newChat = () => {
        if (itemDirty) return
        setRuns([]); setChatSessionId(`${item.id}-${Date.now()}`); setSessionConfig(savedConfig)
      }
      const configNotice = itemDirty ? 'יש שינויי תצורה שלא נשמרו' : sessionOutdated
        ? `תצורת ${targetLabel} עודכנה — פתחו שיחה חדשה` : 'שיחה פעילה'
      const chatRun = run => h('div:space-y-3', {key: run.id}, h('div:flex justify-end', {}, h(
        'div:max-w-[85%] whitespace-pre-wrap break-words rounded-[12px] rounded-br-sm bg-[var(--wp-ink)] px-4 py-3 text-[13px] text-white',
        {}, run.input)), h(
        'div:flex justify-start', {}, h('div:max-w-[85%] rounded-[12px] rounded-bl-sm border border-[var(--wp-border)] ' +
          'bg-[var(--wp-surface)] px-4 py-3', {}, h(
          'div:flex items-center gap-2', {}, h(`span:${classes.chip}`, {}, run.status), run.opikUrl && h(
            'a:inline-flex items-center gap-1 text-[12px] text-[var(--wp-ink)]',
            {href: run.opikUrl, target: '_blank', rel: 'noreferrer'}, 'Opik', h('L:ExternalLink', {size: 12}))), h(
          'p:mt-3 whitespace-pre-wrap break-words text-[13px] leading-7', {}, run.output || run.status),
          hh(ctx, dsls.react['react-comp'].wonderPlatformRunTrace, {steps: run.trace, status: run.status}))))

      const testPanel = h('div:flex h-full min-h-0 flex-col', {}, h('div:flex shrink-0 items-center justify-between gap-3 border-b ' +
        'border-[var(--wp-border)] bg-[var(--wp-surface)] p-3', {},
      h(`span:text-[12px] ${itemDirty || sessionOutdated ? 'text-[var(--wp-warn)]' : 'text-[var(--wp-ink-3)]'}`, {}, configNotice), h(
        `button:${classes.button}`, {disabled: itemDirty, onClick: newChat}, itemDirty ? 'שמור תחילה' : 'שיחה חדשה')),
      h('div:wp-scroll min-h-0 flex-1 space-y-5 overflow-y-auto p-4', {}, runs.length ? runs.map(chatRun)
        : hh(ctx, dsls.react['react-comp'].wonderPlatformEmpty, {icon: 'MessageCircle', compact: true,
          title: `התחילו שיחה עם ${targetLabel}`, body: 'ההרצה משתמשת בתצורה השמורה האחרונה.'})),
      h('div:shrink-0 border-t border-[var(--wp-border)] bg-[var(--wp-surface)] p-3', {},
        h('div:flex items-end gap-2 rounded-[12px] border border-[var(--wp-border)] p-2 transition-colors focus-within:border-[var(--wp-border-strong)]', {},
        h('textarea:wp-noring min-h-12 flex-1 resize-none bg-transparent p-2 text-[13px] outline-none', {value: testInput, placeholder: `נסו את ${targetLabel}…`,
          onInput: event => setTestInput(event.target.value), onKeyDown: event => event.key == 'Enter' && !event.shiftKey &&
            (event.preventDefault(), sendTest(testInput)), 'data-testid': 'workspace-test-input'}),
        h('button:grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[var(--wp-ink)] text-white transition-colors ' +
          'hover:bg-[var(--wp-ink-hover)] disabled:bg-[var(--wp-border-strong)]', {disabled: !testInput.trim(),
          onClick: () => sendTest(testInput), 'aria-label': 'הרצה'}, h('L:ArrowUp', {size: 15}))),
      h('p:mt-2 text-[11px] text-[var(--wp-ink-3)]', {}, 'ההקשר נשמר לאורך השיחה')))
      const shownRun = evaluationRun || repo.evalRuns.filter(run => run.evaluationId == evaluationId && run.targetId == item.id)
        .sort((a, b) => b.startedAt - a.startedAt)[0]
      const evalRow = (row, index) => h(`article:${classes.panel} p-3`, {key: index},
        h('div:flex items-center gap-3', {}, h('b:font-mono text-[12px]', {}, String(index + 1).padStart(2, '0')),
          h('span:min-w-0 flex-1 truncate text-[13px]', {}, row.input), h('button:text-[12px] text-[var(--wp-ink)]', {
            onClick: () => setDetail(detail == index ? -1 : index)}, 'קלט ופלט')), detail == index && h('div:mt-3 grid gap-3 border-t border-dashed pt-3', {},
          [['קלט', row.input], ['פלט מצופה', row.expected], ['פלט בפועל', row.actual]].map(([title, value]) => h('div', {key: title},
            h('b:text-[11px] text-[var(--wp-ink-3)]', {}, title), h('p:mt-1 whitespace-pre-wrap break-words text-[13px]', {}, value || '—'))),
          hh(ctx, dsls.react['react-comp'].wonderPlatformRunTrace, {steps: row.trace}),
          row.opikUrl && h('a:inline-flex items-center gap-1 text-[12px] text-[var(--wp-ink)]',
            {href: row.opikUrl, target: '_blank', rel: 'noreferrer'}, 'הטרייס המלא ב-Opik', h('L:ExternalLink', {size: 12}))))
      const evalPanel = h('div:wp-scroll h-full overflow-y-auto p-4', {}, h('div:flex items-end gap-2', {}, h('div:flex-1', {},
        h('span:text-[12px] font-semibold', {}, 'סט אבלואציה'), h('div:mt-2', {}, hh(ctx, dsls.react['react-comp'].wonderPlatformSearchableSelect,
          {items: repo.evaluations, value: evaluationId, onChange: setEvaluationId, placeholder: 'בחר סט', empty: 'בחר סט'}))),
      h(`button:${classes.primary}`, {
          disabled: !evaluationId || shownRun?.status == 'מריץ…', onClick: executeEval}, shownRun?.status == 'מריץ…' ? 'מריץ…' : 'הרצת הסט')),
      shownRun && h('div:mt-4', {}, h('div:flex items-center gap-2', {}, h(`span:${classes.chip}`, {}, shownRun.status),
        h('span:text-[12px] text-[var(--wp-ink-3)]', {}, shownRun.started || 'עכשיו')), h('div:mt-4 space-y-2', {}, (shownRun.rows || []).map(evalRow))))
      const onStep = id => {setStepIds(current => ({...current, [resource]: id})); resetScroll?.()}
      const docField = isPlugin ? 'readme' : 'instructions'
      const capDone = (item.pluginIds?.length || item.skillIds?.length || item.toolIds?.length || item.knowledgeIds?.length) > 0
      const identityStep = () => h('div:space-y-4', {},
        h(`section:${classes.card} space-y-5`, {},
          h(`label:${classes.label} block`, {}, 'שם להצגה',
            h(`input:${classes.field} h-10 text-[15px] font-semibold`, {value: item.name || '', placeholder: `שם ${targetLabel}…`,
              'aria-label': 'display_name', onInput: event => update({...item, name: event.target.value})}),
            h(`p:${classes.help}`, {}, `השם שיוצג למשתמשים ברשימות ובשיחה עם ${targetLabel}.`)),
          h(`label:${classes.label} block`, {}, fieldLabel('מזהה', 'id'),
            h(`input:${classes.field} font-mono`, {dir: 'ltr', value: item.id || '', 'aria-label': 'id',
              placeholder: isAgent ? 'supportAgent' : 'supportPlugin', disabled: !!item.originalId,
              onInput: event => update({...item, id: event.target.value})}),
            h(`p:${classes.help}`, {}, 'מזהה טכני קבוע באנגלית, בלי רווחים. לא ניתן לשינוי אחרי השמירה.')),
          h(`label:${classes.label} block`, {}, 'תיאור בעברית',
            h(`textarea:${classes.area}`, {value: item.desc || '', 'aria-label': 'hebrew_description',
              placeholder: `במשפט אחד — מה ${targetLabel} עושה`,
              onInput: event => update({...item, desc: event.target.value})})),
          h(`label:${classes.label} block`, {}, ...fieldLabel('תיאור באנגלית', 'description')),
          h(`textarea:${classes.area}`, {dir: 'ltr', value: item.apiDescription || '', 'aria-label': 'description',
            onInput: event => update({...item, apiDescription: event.target.value})}),
          h(`p:${classes.help}`, {}, `תיאור טכני באנגלית, משמש את ה-API ואת המודל לבחירת ${targetLabel} המתאים.`)),
        item.configYaml && h(`section:${classes.card}`, {}, h('b:text-[13px]', {}, 'config.yaml'),
          h('pre:mt-2 max-w-full overflow-x-auto rounded-[12px] bg-[var(--wp-surface-2)] p-3 text-[12px]', {dir: 'ltr'}, item.configYaml)))
      const instructionsStep = () => h('div:space-y-4', {},
        h(`section:${classes.card}`, {}, h('div:flex items-center justify-between gap-3', {},
          h('b:text-[13px]', {}, ...(isPlugin ? fieldLabel('תיעוד', 'README.md') : fieldLabel('הנחיות מערכת', 'system_prompt'))),
          h('span:text-[11px] text-[var(--wp-ink-3)]', {}, `${item[docField]?.length || 0} תווים`)),
        h(`textarea:${classes.area} min-h-52 leading-7`, {value: item[docField] || '',
          'aria-label': isPlugin ? 'readme' : 'system_prompt',
          placeholder: isPlugin ? 'מה הפלאגין כולל, מתי להשתמש בו ומה הוא מחזיר'
            : 'איך על הסוכן לענות, על מה להסתמך ומה אסור לו לעשות',
          onInput: event => update({...item, [docField]: event.target.value})}),
        h(`p:${classes.help}`, {}, isPlugin ? 'התיעוד מלווה את הפלאגין בכל סוכן שמחובר אליו.'
          : 'ההנחיות נשלחות למודל בכל שיחה, לפני הודעת המשתמש.')),
        !isPlugin && !item.originalId && h(`section:${classes.card}`, {}, h('b:text-[13px]', {}, 'README (creation only)'),
          h(`textarea:${classes.area} min-h-32`, {value: item.readme || '',
            onInput: event => update({...item, readme: event.target.value})})))
      const steps = [
        {id: 'identity', label: isAgent ? 'מי הסוכן' : 'מה הפלאגין עושה', render: identityStep,
          done: !!(item.name?.trim() && item.id?.trim() && item.desc?.trim())},
        {id: 'capabilities', label: 'יכולות', done: capDone, render: () => hh(ctx,
          dsls.react['react-comp'].wonderPlatformCapabilityStep, {item, update, repo, openPicker, openEditor, createNested,
            primary, secondary, headline: isAgent ? 'מה הסוכן צריך לדעת לעשות?' : `מה ${targetLabel} יודע לעשות?`,
            intro: isAgent ? 'פלאגין אורז מיומנויות, כלים וידע ליחידה אחת — זו הדרך המומלצת להוסיף יכולת לסוכן.'
              : 'הרכיבו את היכולת ממיומנויות, כלים ומקורות ידע. כל סוכן שיחובר יקבל את כולם.'})},
        {id: 'instructions', label: isPlugin ? 'תיעוד' : 'הנחיות', render: instructionsStep,
          done: !!(item[docField]?.trim() && item.apiDescription?.trim())}]
      const missing = !item.name?.trim() ? `הוסיפו שם ל${kind}` : !item.id?.trim() ? `הוסיפו מזהה ל${kind}`
        : !item.desc?.trim() || !item.apiDescription?.trim() ? `הוסיפו תיאור ל${kind}`
          : !item[docField]?.trim() ? (isPlugin ? 'הוסיפו תיעוד לפלאגין' : 'הוסיפו הנחיות מערכת') : ''
      const reason = missing || (capDone ? `${targetLabel} מוכן` : isAgent
        ? 'אין עדיין יכולות — הסוכן יענה מהמודל בלבד' : 'אין עדיין יכולות — הוסיפו מיומנות, כלי או ידע')
      return h('div:flex h-full min-h-0', {},
        h('section:flex min-w-0 flex-1 flex-col', {},
          hh(ctx, dsls.react['react-comp'].wonderPlatformWizard, {steps, activeId: stepId, onStep, rail: true, reason,
            finish: {label: finishLabel, aria: finishAria, disabled: !!missing, onClick: () => finish(item)}})),
        panelOpen && h('aside:flex h-full w-[400px] shrink-0 flex-col border-r border-[var(--wp-border)] ' +
          'bg-[var(--wp-surface-2)] 2xl:w-[460px]', {},
        h('div:flex shrink-0 items-center border-b border-[var(--wp-border)] bg-[var(--wp-surface)] p-3', {},
          h(`button:${classes.icon} ml-2`, {onClick: () => setPanelOpen(false), 'aria-label': 'סגירה', title: 'סגירת פאנל הרצת ניסוי'},
            h('L:X', {size: 15})),
          h(`div:${classes.segment}`, {}, [['test', 'הרצת ניסוי'], ['evaluation', 'אבלואציה']].map(([id, title]) => h(
            `button:${tab == id ? classes.tabOn : classes.tab}`, {key: id, onClick: () => setTab(id)}, title))),
          tab == 'test' && h('button:mr-auto text-[12px] text-[var(--wp-ink-3)]', {onClick: () => setRuns([])}, 'איפוס')),
        h('div:min-h-0 flex-1', {}, tab == 'test' ? testPanel : evalPanel)))
    }
  })
})
