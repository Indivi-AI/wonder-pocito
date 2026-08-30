import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-agent-results.js'
import './wonder-platform-searchable-select.js'
import './wonder-platform-wizard.js'
import './wonder-platform-kit.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformWorkspace', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh, useEffect, useState}}) => props => {
      const {workspace, repo, openPicker, openEditor, runTarget, runEval, update, panelOpen, setPanelOpen, tab, setTab} = props
      const item = workspace.item
      const {classes, labels} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const [testInput, setTestInput] = useState('')
      const [runs, setRuns] = useState([]), [evaluationId, setEvaluationId] = useState(item.evaluationId || '')
      const [evaluationRun, setEvaluationRun] = useState(), [detail, setDetail] = useState(-1)
      const [activeTab, setActiveTab] = useState('settings'), [stepId, setStepId] = useState('general')
      const runtimeConfig = value => JSON.stringify(value)
      const refKinds = {plugin: 'פלאגין', skill: 'מיומנות', tool: 'כלי', subagent: 'סאב-אייג׳נט', knowledge: 'ידע', agent: 'סוכן'}
      const refRows = value => Array.isArray(value.references) ? value.references : value.references?.references || []
      const fieldLabel = (title, key) => [title, h(`span:mr-2 ${classes.mono}`, {key}, key)]
      const savedConfig = workspace.baseline, [chatSessionId, setChatSessionId] = useState(`${item.id}-${Date.now()}`)
      const [sessionConfig, setSessionConfig] = useState(savedConfig)
      const itemDirty = runtimeConfig(item) != savedConfig, sessionOutdated = runs.length > 0 && sessionConfig != savedConfig
      useEffect(() => {
        setStepId('general'); setEvaluationId(item.evaluationId || '')
        setRuns([]); setChatSessionId(`${item.id}-${Date.now()}`); setSessionConfig(runtimeConfig(item))
      }, [item.id])
      const targetLabels = {plugins: 'הפלאגין', subagents: 'הסאב-אייג׳נט', agents: 'הסוכן'}, targetLabel = targetLabels[workspace.resource]
      const relationRows = workspace.resource == 'plugins' ? [['skillIds', 'skills', 'מיומנויות'], ['toolIds', 'tools', 'כלים'],
          ['knowledgeIds', 'knowledge', 'ידע']]
        : workspace.resource == 'agents' ? [['pluginIds', 'plugins', 'פלאגינים'], ['skillIds', 'skills', 'מיומנויות'],
          ['toolIds', 'tools', 'כלים'], ['knowledgeIds', 'knowledge', 'ידע']]
        : repo.marketplace ? [['pluginIds', 'plugins', 'פלאגינים'], ['skillIds', 'skills', 'מיומנויות'], ['toolIds', 'tools', 'כלים']]
        : [['skillIds', 'skills', 'מיומנויות'], ['toolIds', 'tools', 'כלים']]
      const semanticTrace = dsls.common.data.wonderPlatformTrace.$runWithCtx(ctx, {repo, target: item})
      const lastRun = repo.evalRuns.filter(run => run.targetId == item.id).sort((a, b) => b.startedAt - a.startedAt)[0]
      const sendTest = async input => {
        const text = input.trim()
        if (!text || runs.some(run => run.status == 'מריץ…')) return
        const id = `test-${Date.now()}`, pending = {id, input: text, status: 'מריץ…', trace: semanticTrace}
        setRuns(items => [...items, pending]); setTestInput('')
        try {
          const result = await runTarget(text, item, chatSessionId)
          setRuns(items => items.map(run => run.id == id ? {...run, ...result, output: result.text || result.output, status: result.status || 'הושלם',
            trace: [...semanticTrace, ...(result.runtimeSteps || [])]} : run))
        } catch (error) {
          setRuns(items => items.map(run => run.id == id ? {...run, status: 'נכשל', output: String(error.message || error)} : run))
        }
      }
      const executeEval = async () => {
        const evaluation = repo.evaluations.find(value => value.id == evaluationId)
        if (!evaluation || evaluationRun?.status == 'מריץ…') return
        setEvaluationRun({status: 'מריץ…', rows: []}); setEvaluationRun(await runEval(evaluation, workspace.resource, item))
      }
      const groupHead = (title, count) => h('div:flex items-center gap-2 border-b border-[var(--wp-border)] ' +
        'bg-[var(--wp-surface-2)] px-4 py-2', {},
      h('span:text-[12px] font-semibold text-[var(--wp-ink-2)]', {}, title),
      count > 0 && h('span:wp-num text-[12px] text-[var(--wp-ink-4)]', {}, count))
      const relationGroup = ([field, resource, title]) => {
        const items = item[field] || []
        const remove = id => update({...item, [field]: items.filter(value => value != id)})
        const missingRow = id => {
          const label = {skills: 'מיומנות', tools: 'כלי', knowledge: 'ידע', plugins: 'פלאגין'}[resource] || 'משאב'
          return h('div:flex items-start gap-3 px-4 py-2.5', {key: id},
            h('span:grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-[var(--wp-danger-soft)] ' +
              'text-[var(--wp-danger)]', {}, h('L:TriangleAlert', {size: 16})),
            h('div:min-w-0 flex-1', {}, h('b:block text-[13px] text-[var(--wp-danger)]', {}, `${id} (${label} לא זמין)`),
              h('p:mt-0.5 text-[12px] leading-[1.5] text-[var(--wp-ink-3)]', {}, 'המשאב נמחק או אינו קיים עוד בקטלוג.')),
            h(`button:${classes.icon} hover:bg-[var(--wp-danger-soft)] hover:text-[var(--wp-danger)]`,
              {onClick: () => remove(id), 'aria-label': `הסרת ${id}`, title: `הסרת ${id}`}, h('L:X', {size: 14})))
        }
        const itemRow = (id, item) => {
          const managed = resource == 'tools' && item.managed
          const inherited = resource == 'skills' ? item.toolIds?.map(toolId => ['כלי', repo.tools.find(value => value.id == toolId)?.name])
            : resource == 'subagents' ? [...(item.skillIds || []).map(skillId => ['מיומנות', repo.skills.find(value => value.id == skillId)?.name]),
              ...(item.toolIds || []).map(toolId => ['כלי', repo.tools.find(value => value.id == toolId)?.name])] : []
          const passed = inherited.filter(value => value[1])
          return h('div:group px-4 py-2.5 transition-colors hover:bg-[var(--wp-surface-2)]', {key: id}, h('div:flex items-center gap-3', {},
            hh(ctx, dsls.react['react-comp'].wonderPlatformMark, {icon: item.icon, text: item.mark, size: 'md'}),
            h('div:min-w-0 flex-1', {}, h('b:block truncate text-[13px] text-[var(--wp-ink)]', {}, item.name),
              h('p:truncate text-[12px] leading-[1.5] text-[var(--wp-ink-3)]', {}, item.desc),
              managed && h('span:mt-0.5 block text-[11px] text-[var(--wp-ink-4)]',
                {title: 'כלי מנוהל — לא ניתן לעריכה'}, 'Connector · MCP · מנוהל')),
            !managed && h(`button:${classes.icon} opacity-0 group-hover:opacity-100`, {onClick: () => openEditor(resource, item, field),
              'aria-label': `עריכת ${item.name}`, title: `עריכת ${item.name}`}, h('L:Pencil', {size: 14})),
            h(`button:${classes.icon} opacity-0 hover:bg-[var(--wp-danger-soft)] hover:text-[var(--wp-danger)] group-hover:opacity-100`,
              {onClick: () => remove(id), 'aria-label': `הסרת ${item.name}`, title: `הסרת ${item.name}`}, h('L:X', {size: 14}))),
          passed.length > 0 && h('div:mt-2 flex flex-wrap items-center gap-2 ps-12', {},
            h('span:text-[11px] text-[var(--wp-ink-4)]', {}, `נכנס דרך ${labels[resource]}`),
            passed.map(([kind, name]) => h(`span:${classes.chip}`, {key: kind + name}, `${kind} · ${name}`))))
        }
        const addRow = h('button:flex w-full items-center gap-3 px-4 py-2.5 text-[13px] text-[var(--wp-ink-3)] ' +
          'transition-colors hover:bg-[var(--wp-surface-2)] hover:text-[var(--wp-ink)]',
        {onClick: () => openPicker(field, resource, title)},
        h('span:grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border border-dashed ' +
          'border-[var(--wp-border-strong)]', {}, h('L:Plus', {size: 14})), `הוספת ${title}`)
        return h('div', {key: field}, groupHead(title, items.length),
          h('div:divide-y divide-[var(--wp-border)]', {}, items.map(id => {
            const item = repo[resource].find(value => value.id == id)
            return item ? itemRow(id, item) : missingRow(id)
          }), addRow))
      }
      const newChat = () => {
        if (itemDirty) return
        setRuns([]); setChatSessionId(`${item.id}-${Date.now()}`); setSessionConfig(savedConfig)
      }
      const configNotice = itemDirty ? 'יש שינויי תצורה שלא נשמרו' : sessionOutdated
        ? 'תצורת הפלאגין עודכנה — פתח שיחה חדשה' : 'שיחת AgentOS פעילה'
      const chatRun = run => h('div:space-y-3', {key: run.id}, h('div:flex justify-end', {}, h(
        'div:max-w-[85%] whitespace-pre-wrap break-words rounded-[12px] rounded-br-sm bg-[var(--wp-ink)] px-4 py-3 text-[13px] text-white',
        {}, run.input)), h(
        'div:flex justify-start', {}, h('div:max-w-[85%] rounded-[12px] rounded-bl-sm border border-[var(--wp-border)] ' +
          'bg-[var(--wp-surface)] px-4 py-3', {}, h(
          'div:flex items-center gap-2', {}, h(`span:${classes.chip}`, {}, run.status), run.opikUrl && h(
            'a:inline-flex items-center gap-1 text-[12px] text-[var(--wp-ink)]',
            {href: run.opikUrl, target: '_blank', rel: 'noreferrer'}, 'Opik', h('L:ExternalLink', {size: 12}))), h(
          'p:mt-3 whitespace-pre-wrap break-words text-[13px] leading-7', {}, run.output || run.status), (run.trace || []).length > 0 && h(
          'details:mt-3', {}, h('summary:cursor-pointer text-[12px] text-[var(--wp-ink-3)]', {}, 'מעקב הרצה'), (run.trace || []).map((step, stepIndex) => h(
            'div:mt-2 flex items-center gap-2 text-[12px]', {key: `${step.kind}-${step.id || stepIndex}`}, h(
              `span:${classes.chip}`, {}, step.kind), h('span:flex-1', {}, step.title)))))))
      const testPanel = h('div:flex h-full flex-col', {}, h('div:flex items-center justify-between gap-3 border-b ' +
        'border-[var(--wp-border)] bg-[var(--wp-surface)] p-3', {},
        h(`span:text-[12px] ${itemDirty || sessionOutdated ? 'text-amber-700' : 'text-[var(--wp-ink-3)]'}`, {}, configNotice), h(
          `button:${classes.button}`, {disabled: itemDirty, onClick: newChat}, itemDirty ? 'שמור תחילה' : 'שיחה חדשה')),
      h('div:flex-1 space-y-5 overflow-y-auto wp-scroll p-4', {}, runs.length ? runs.map(chatRun)
        : hh(ctx, dsls.react['react-comp'].wonderPlatformEmpty, {icon: 'MessageCircle', compact: true,
          title: `התחל שיחה עם ${targetLabel}`})),
      h('div:border-t border-[var(--wp-border)] bg-[var(--wp-surface)] p-3', {},
        h('div:flex items-end gap-2 rounded-[12px] border border-[var(--wp-border)] p-2 transition-colors focus-within:border-[var(--wp-border-strong)]', {},
        h('textarea:wp-noring min-h-12 flex-1 resize-none bg-transparent p-2 text-[13px] outline-none', {value: testInput, placeholder: `נסה את ${targetLabel}…`,
          onInput: event => setTestInput(event.target.value), onKeyDown: event => event.key == 'Enter' && !event.shiftKey &&
            (event.preventDefault(), sendTest(testInput)), 'data-testid': 'workspace-test-input'}),
        h('button:grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[var(--wp-ink)] text-white transition-colors ' +
          'hover:bg-[var(--wp-ink-hover)] disabled:bg-[var(--wp-border-strong)]', {disabled: !testInput.trim(),
          onClick: () => sendTest(testInput), 'aria-label': 'הרצה'}, h('L:ArrowUp', {size: 15}))),
      h('p:mt-2 text-[11px] text-[var(--wp-ink-3)]', {}, 'ההקשר נשמר לאורך השיחה ב-AgentOS')))
      const shownRun = evaluationRun || repo.evalRuns.filter(run => run.evaluationId == evaluationId && run.targetId == item.id)
        .sort((a, b) => b.startedAt - a.startedAt)[0]
      const evalRow = (row, index) => h(`article:${classes.panel} p-3`, {key: index},
        h('div:flex items-center gap-3', {}, h('b:font-mono text-[12px]', {}, String(index + 1).padStart(2, '0')),
          h('span:min-w-0 flex-1 truncate text-[13px]', {}, row.input), h('button:text-[12px] text-[var(--wp-ink)]', {
            onClick: () => setDetail(detail == index ? -1 : index)}, 'קלט ופלט')), detail == index && h('div:mt-3 grid gap-3 border-t border-dashed pt-3', {},
          [['קלט', row.input], ['פלט מצופה', row.expected], ['פלט בפועל', row.actual]].map(([title, value]) => h('div', {key: title},
            h('b:text-[11px] text-[var(--wp-ink-3)]', {}, title), h('p:mt-1 whitespace-pre-wrap break-words text-[13px]', {}, value || '—'))),
          (row.trace || []).length > 0 && h('details', {}, h('summary:cursor-pointer text-[12px] text-[var(--wp-ink)]', {}, 'מעקב הרצה'),
            (row.trace || []).map((step, stepIndex) => h('div:mt-2 text-[12px]', {key: stepIndex}, `${step.kind} · ${step.title}`))),
          row.opikUrl && h('a:inline-flex items-center gap-1 text-[12px] text-[var(--wp-ink)]',
            {href: row.opikUrl, target: '_blank', rel: 'noreferrer'}, 'הטרייס המלא ב-Opik', h('L:ExternalLink', {size: 12}))))
      const evalPanel = h('div:h-full overflow-y-auto wp-scroll p-4', {}, h('div:flex items-end gap-2 max-sm:block', {}, h('div:flex-1', {},
        h('span:text-[12px] font-semibold', {}, 'סט אבלואציה'), h('div:mt-2', {}, hh(ctx, dsls.react['react-comp'].wonderPlatformSearchableSelect,
          {items: repo.evaluations, value: evaluationId, onChange: setEvaluationId, placeholder: 'בחר סט', empty: 'בחר סט'}))),
      h(`button:${classes.primary} max-sm:mt-2 max-sm:w-full`, {
          disabled: !evaluationId || shownRun?.status == 'מריץ…', onClick: executeEval}, shownRun?.status == 'מריץ…' ? 'מריץ…' : 'הרצת הסט')),
      shownRun && h('div:mt-4', {}, h('div:flex items-center gap-2', {}, h(`span:${classes.chip}`, {}, shownRun.status),
        h('span:text-[12px] text-[var(--wp-ink-3)]', {}, shownRun.started || 'עכשיו')), h('div:mt-4 space-y-2', {}, (shownRun.rows || []).map(evalRow))))
      const steps = [{id: 'general', label: 'כללי', render: () => h('div:space-y-4', {},
        h(`section:${classes.card} space-y-4`, {}, h(`label:${classes.label}`, {}, fieldLabel('שם להצגה', 'display_name'), h(
          `input:${classes.field} font-semibold`, {value: item.name || '',
            placeholder: 'שם להצגה…', 'aria-label': 'display_name', onInput: event => update({...item, name: event.target.value})})),
        h(`label:${classes.label}`, {}, fieldLabel('מזהה', 'id'), h(
          `input:${classes.field} font-mono`, {dir: 'ltr', value: item.id || '',
            placeholder: 'uiRenderingSkill', disabled: !!item.originalId,
            onInput: event => update({...item, id: event.target.value})})), h(`label:${classes.label}`, {},
          fieldLabel('תיאור באנגלית', 'description'), h(`textarea:${classes.area}`, {
            dir: 'ltr', value: item.apiDescription || '', onInput: event => update({...item, apiDescription: event.target.value})})),
        h(`label:${classes.label}`, {}, 'תיאור בעברית', h(
          `textarea:${classes.area}`, {value: item.desc || '',
            onInput: event => update({...item, desc: event.target.value})}))),
        item._marketplace && h(`section:${classes.card}`, {}, h('div:flex flex-wrap items-center gap-2', {}, h('b:text-[13px]', {},
          'Marketplace API'), h(`span:${classes.chip}`, {}, `${item.versions?.length || 0} גרסאות`), h(`span:${classes.chip}`, {},
            `${item.audit?.length || 0} אירועי ביקורת`)), item.references && h('div:mt-3 space-y-1.5', {},
            refRows(item).map(ref => h('div:flex items-center gap-2 text-[12px]', {key: `${ref.resource_type}-${ref.name}`},
              h(`L:${ref.exists === false ? 'CircleAlert' : 'Check'}`, {size: 14,
                className: ref.exists === false ? 'text-[var(--wp-danger)]' : 'text-[var(--wp-ink-3)]'}),
              h('span:font-medium text-[var(--wp-ink)]', {}, ref.name),
              h('span:text-[var(--wp-ink-3)]', {}, refKinds[ref.resource_type] || ref.resource_type))),
            refRows(item).length == 0 && h('span:text-[12px] text-[var(--wp-ink-3)]', {}, 'אין קישורים לפריטים אחרים')),
          item.references && h('details:mt-3', {}, h('summary:cursor-pointer text-[12px] font-semibold text-[var(--wp-ink)]', {},
            'פרטים טכניים'),
            h('pre:mt-2 overflow-x-auto rounded-[12px] bg-[var(--wp-surface-2)] p-3 text-[12px]', {dir: 'ltr'},
              JSON.stringify(item.references, null, 2))),
          item.configYaml && h('details:mt-3', {}, h('summary:cursor-pointer text-[12px] font-semibold text-[var(--wp-ink)]', {},
            'config.yaml'),
            h('pre:mt-2 max-w-full overflow-x-auto rounded-[12px] bg-[var(--wp-surface-2)] p-3 text-[12px]', {dir: 'ltr'}, item.configYaml))))},
        {id: 'instructions', label: 'הנחיות', render: () => h('div:space-y-4', {},
          h(`section:${classes.card}`, {}, h('div:flex items-center justify-between', {}, h('b:text-[13px]', {}, ...(workspace.resource == 'plugins'
            ? fieldLabel('תיעוד', 'README.md') : fieldLabel('הנחיות מערכת', 'system_prompt'))),
          h('span:text-[11px] text-[var(--wp-ink-3)]', {}, `טקסט חופשי · ${workspace.resource == 'plugins'
              ? item.readme?.length || 0 : item.instructions?.length || 0} תווים`)), h(
            `textarea:${classes.area} min-h-44 leading-7`, {
              value: workspace.resource == 'plugins' ? item.readme || '' : item.instructions || '',
              onInput: event => update({...item, [workspace.resource == 'plugins' ? 'readme' : 'instructions']: event.target.value})})),
          ['subagents', 'agents'].includes(workspace.resource) && !item.originalId && h(`section:${classes.card}`, {},
            h('b:text-[13px]', {}, 'README (creation only)'), h(
              `textarea:${classes.area} min-h-32`, {
                value: item.readme || '', onInput: event => update({...item, readme: event.target.value})})))},
        {id: 'connections', label: 'חיבורים', render: () =>
          h(`section:${classes.panel} divide-y divide-[var(--wp-border)] overflow-hidden`, {},
            relationRows.map(relationGroup),
            h('div', {}, groupHead('סט אבלואציה מקושר'),
              hh(ctx, dsls.react['react-comp'].wonderPlatformSearchableSelect, {items: repo.evaluations,
                value: item.evaluationId || '', bare: true, onChange: id => update({...item, evaluationId: id}),
                placeholder: 'ללא סט מקושר', empty: 'ללא סט מקושר'}),
              lastRun && h('div:flex items-center justify-between gap-3 border-t border-[var(--wp-border)] px-4 py-2.5 ' +
                'text-[12px] text-[var(--wp-ink-3)]', {}, `הרצה אחרונה · ${lastRun.started} · ${lastRun.status}`,
              h('button:font-medium text-[var(--wp-ink)]', {onClick: () => (setPanelOpen(true), setTab('evaluation'))},
                'היסטוריית הרצות'))))}]
      return h('div:flex min-h-full max-lg:block', {}, h(`section:min-w-0 flex-1 space-y-4 p-5 ${panelOpen ? 'lg:max-w-[58%]' : ''}`, {},
        hh(ctx, dsls.react['react-comp'].wonderPlatformWizard, {steps, activeId: stepId, onStep: setStepId})), panelOpen && h(
        'aside:flex w-full shrink-0 flex-col self-start border-r border-[var(--wp-border)] bg-[var(--wp-surface-2)] ' +
          'lg:sticky lg:top-0 lg:h-full lg:w-[42%]', {}, h('div:flex shrink-0 items-center border-b border-[var(--wp-border)] ' +
          'bg-[var(--wp-surface)] p-3', {},
          h(`button:${classes.icon} ml-2`, {onClick: () => setPanelOpen(false), 'aria-label': 'סגירה', title: 'סגירת פאנל הרצת ניסוי'},
            h('L:X', {size: 15})),
          h(`div:${classes.segment}`, {}, [['test', 'הרצת ניסוי'], ['evaluation', 'אבלואציה']].map(([id, title]) => h(
            `button:${tab == id ? classes.tabOn : classes.tab}`, {key: id, onClick: () => setTab(id)}, title))),
          tab == 'test' && h('button:mr-auto text-[12px] text-[var(--wp-ink-3)]', {onClick: () => setRuns([])}, 'איפוס')),
        h('div:min-h-0 flex-1 max-lg:h-auto max-lg:min-h-[32rem]', {}, tab == 'test' ? testPanel : evalPanel)))
    }
  })
})
