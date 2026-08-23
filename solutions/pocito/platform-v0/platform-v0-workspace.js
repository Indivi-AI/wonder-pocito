import { dsls } from '@jb6/core'
import '@jb6/react'
import './platform-v0-model.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('PlatformV0Workspace', {
  impl: comp({
    hFunc: (ctx, {react: {h, useEffect, useState}}) => props => {
      const {workspace, catalog, back, saveWorkspace, openPicker, openEditor, runAgent, runEval} = props
      const {classes, labels} = dsls.common.data.platformV0Config.$run()
      const [draft, setDraft] = useState({...workspace.item}), [panelOpen, setPanelOpen] = useState(true)
      const [tab, setTab] = useState('test'), [testInput, setTestInput] = useState(''), [runs, setRuns] = useState([])
      const [evalSetName, setEvalSetName] = useState(workspace.item.evalSet || ''), [evalRun, setEvalRun] = useState()
      const [detail, setDetail] = useState(-1)
      useEffect(() => { setDraft({...workspace.item}); setEvalSetName(workspace.item.evalSet || '') }, [workspace.item.name])
      const targetLabel = workspace.resource == 'plugins' ? 'הפלאגין' : 'הסאב-אייג׳נט'
      const persist = next => (setDraft(next), saveWorkspace(next))
      const relationRows = workspace.resource == 'plugins'
        ? [['skills', 'skills', 'מיומנויות'], ['tools', 'tools', 'כלים'], ['agents', 'agents', 'סאב-אייג׳נטים']]
        : [['skills', 'skills', 'מיומנויות'], ['tools', 'tools', 'כלים']]
      const trace = dsls.common.data.platformV0Trace.$runWithCtx(ctx, {catalog, target: draft})
      const runTime = run => run.startedAt || +(run.name.match(/\d{10,}/)?.[0] || 0)
      const lastRun = catalog.evalRuns?.filter(item => item.target == draft.name).sort((a, b) => runTime(a) - runTime(b)).at(-1)
      const sendTest = async input => {
        const text = input.trim()
        if (!text || runs.some(run => run.status == 'מריץ…')) return
        const id = `run-${Date.now()}`, pending = {id, input: text, status: 'מריץ…', trace, started: new Date().toLocaleTimeString('he-IL')}
        setRuns(items => [...items, pending]); setTestInput('')
        try {
          const result = await runAgent(text, draft.name, `test-${id}`)
          setRuns(items => items.map(run => run.id == id ? {...run, status: 'הושלם', output: result.content,
            runId: result.runId, opikUrl: result.opikUrl} : run))
        } catch (error) {
          setRuns(items => items.map(run => run.id == id ? {...run, status: 'נכשל', output: String(error.message || error)} : run))
        }
      }
      const executeEval = async () => {
        const set = catalog.evalSets?.find(item => item.name == evalSetName)
        if (!set || evalRun?.status == 'מריץ…') return
        setEvalRun({status: 'מריץ…', rows: []})
        setEvalRun(await runEval(set, workspace.resource, draft))
      }
      const relationSection = ([key, resource, title]) => h(`section:${classes.card}`, {key},
        h('div:flex items-center justify-between', {}, h('div:flex items-center gap-2', {}, h('b', {}, title),
          h(`span:${classes.chip}`, {}, draft[key]?.length || 0)), h(`button:${classes.button}`, {
            onClick: () => openPicker(key, resource, title)}, h('L:Plus', {size: 14}), 'הוספה')),
        h('div:mt-3 space-y-3', {}, (draft[key] || []).map(name => {
          const item = catalog[resource]?.find(value => value.name == name), managed = resource == 'tools' && item?.managed
          if (!item) return null
          const inherited = resource == 'skills' ? item.tools?.map(tool => ['כלי', catalog.tools?.find(value => value.name == tool)?.title])
            : resource == 'agents' ? [...(item.skills || []).map(skill => ['מיומנות', catalog.skills?.find(value => value.name == skill)?.title]),
              ...(item.tools || []).map(tool => ['כלי', catalog.tools?.find(value => value.name == tool)?.title])] : []
          return h('article:rounded-xl border border-[#e5e9e7] p-3', {key: name}, h('div:flex items-start gap-3', {},
            h('span:grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#edf6f0] text-xs font-bold text-[#315e46]', {},
              item.title.slice(0, 2)), h('div:min-w-0 flex-1', {}, h('b:block text-sm', {}, item.title),
              h('p:mt-1 text-xs leading-5 text-[#808984]', {}, item.description), managed && h('span:text-[10px] text-[#8b948f]', {
                title: 'כלי מנוהל — לא ניתן לעריכה'}, 'Connector · MCP · מנוהל')),
            !managed && h('button:rounded-lg p-1.5 hover:bg-gray-100', {onClick: () => openEditor(resource, item), 'aria-label': 'עריכה'},
              h('L:Pencil', {size: 14})), h('button:rounded-lg p-1.5 hover:bg-red-50', {onClick: () => persist({...draft,
                [key]: draft[key].filter(value => value != name)}), 'aria-label': `הסרה ${title}`}, h('L:X', {size: 14}))),
          inherited.filter(value => value[1]).length > 0 && h('div:mt-3 border-t border-dashed border-[#e6ebe8] pt-2', {},
            h('span:text-[10px] text-[#97a09b]', {}, `נכנס דרך ${labels[resource]}`), h('div:mt-2 flex flex-wrap gap-2', {},
              inherited.filter(value => value[1]).map(([kind, value]) => h(`span:${classes.chip}`, {key: kind + value}, `${kind} · ${value}`)))) )
        })))
      const testPanel = h('div:flex h-full flex-col', {}, h('div:flex-1 space-y-4 overflow-y-auto p-4', {},
        runs.length ? runs.map((run, index) => h('article:overflow-hidden rounded-xl border border-[#dfe5e1] bg-white', {key: run.id},
          h('div:flex items-center justify-between border-b bg-[#f6f8f7] px-4 py-3', {}, h('div', {}, h('b:font-mono text-xs', {},
            `RUN ${String(index + 1).padStart(2, '0')}`), h('div:mt-1 text-[10px] text-[#8b948f]', {}, run.status == 'מריץ…'
              ? 'מריץ · הקשר נקי' : 'הרצה עצמאית · ללא הקשר מהרצות קודמות')), h('div:flex items-center gap-2', {},
            h(`span:${classes.chip}`, {}, run.status), run.opikUrl && h('a:text-xs text-[#2f6b4b]', {href: run.opikUrl}, 'Opik ↗'))),
          h('div:space-y-3 p-4', {}, h('div', {}, h('b:text-[10px] text-[#8b948f]', {}, 'קלט ההרצה'),
            h('p:mt-1 text-sm', {}, run.input)), h('div', {}, h('b:text-[10px] text-[#8b948f]', {}, 'מעקב הרצה'),
            h('div:mt-2 space-y-1', {}, run.trace.map(step => h('div:flex items-center gap-2 rounded-lg bg-[#f7f9f8] px-3 py-2', {
              key: step.kind + step.name}, h(`span:${classes.chip}`, {}, step.kind), h('span:flex-1 text-xs', {}, step.title),
              step.resource != 'tools' && h('button:text-xs text-[#2f6b4b]', {onClick: () => openEditor(step.resource,
                catalog[step.resource].find(item => item.name == step.name))}, 'עריכה')))), run.output && h('div', {},
              h('b:text-[10px] text-[#8b948f]', {}, 'פלט ההרצה'), h('p:mt-1 whitespace-pre-wrap text-sm leading-6', {}, run.output))))))
          : h('div:grid min-h-64 place-items-center text-center text-sm text-[#8b948f]', {}, h('div', {}, h('L:PlayCircle', {
            size: 28, className: 'mx-auto mb-3'}), `נסה את ${targetLabel} תוך כדי בנייה`))),
        h('div:border-t border-[#e2e7e4] bg-white p-3', {}, h('div:flex items-end gap-2 rounded-xl border border-[#dfe5e1] p-2', {},
          h('textarea:min-h-12 flex-1 resize-none p-2 text-sm outline-none', {value: testInput, placeholder: `נסה את ${targetLabel}…`,
            onInput: event => setTestInput(event.target.value), onKeyDown: event => event.key == 'Enter' && !event.shiftKey &&
              (event.preventDefault(), sendTest(testInput))}), h('button:grid h-9 w-9 place-items-center rounded-full bg-[#2f6b4b] text-white disabled:opacity-40', {
            disabled: !testInput.trim(), onClick: () => sendTest(testInput), 'aria-label': 'הרצה'}, h('L:ArrowUp', {size: 15}))),
          h('p:mt-2 text-[10px] text-[#9aa19d]', {}, 'הרצה מול הטיוטה השמורה · כל שליחה היא הרצה עצמאית, ללא זיכרון שיחה')))
      const evalRow = (row, index) => h('article:rounded-xl border border-[#dfe5e1] bg-white p-3', {key: index},
        h('div:flex items-center gap-3', {}, h('b:font-mono text-xs', {}, String(index + 1).padStart(2, '0')),
          h('span:flex-1 text-sm', {}, row.input), h('button:text-xs text-[#2f6b4b]', {
            onClick: () => setDetail(detail == index ? -1 : index)}, 'קלט ופלט')),
        detail == index && h('div:mt-3 grid gap-3 border-t border-dashed pt-3', {},
          [['קלט', row.input], ['פלט מצופה', row.expected], ['פלט בפועל', row.actual]].map(([title, value]) => h('div', {key: title},
            h('b:text-[10px] text-[#8b948f]', {}, title), h('p:mt-1 whitespace-pre-wrap text-sm', {}, value || '—'))),
          row.opikUrl && h('a:text-xs text-[#2f6b4b]', {href: row.opikUrl}, 'הטרייס המלא ב-Opik ↗')))
      const evalPanel = h('div:h-full overflow-y-auto p-4', {}, h('div:flex items-end gap-2', {}, h('label:flex-1 text-xs font-semibold', {},
        'סט אבלואציה', h('select:mt-2 w-full rounded-xl border border-[#dfe5e1] p-2 text-sm', {value: evalSetName,
          onChange: event => setEvalSetName(event.target.value)}, h('option', {value: ''}, 'בחר סט'), (catalog.evalSets || []).map(set => h(
            'option', {key: set.name, value: set.name}, set.title)))), h(`button:${classes.primary}`, {disabled: !evalSetName || evalRun?.status == 'מריץ…',
          onClick: executeEval}, evalRun?.status == 'מריץ…' ? 'מריץ…' : 'הרצת הסט')),
        evalRun && h('div:mt-4', {}, h(`span:${classes.chip}`, {}, evalRun.status),
          h('div:mt-4 space-y-2', {}, (evalRun.rows || []).map(evalRow))))
      return h('main:min-h-screen overflow-x-hidden pb-24 sm:mr-[210px] sm:pb-0', {}, h('header:sticky top-0 z-20 flex flex-wrap items-center ' +
        'gap-3 border-b border-[#e3e7e4] bg-white px-5 py-4', {}, h('button:rounded-lg border p-2', {onClick: back,
          'aria-label': `חזרה ל${workspace.resource == 'plugins' ? 'פלאגינים' : 'סאב-אייג׳נטים'}`}, h('L:ChevronRight', {size: 16})),
        h('span:text-xs text-[#8b948f]', {}, labels[workspace.resource]), h('input:min-w-0 flex-1 text-xl font-bold outline-none', {
          value: draft.title, placeholder: `שם ${targetLabel}…`, onInput: event => setDraft({...draft, title: event.target.value}),
          onBlur: () => saveWorkspace(draft)}), h(`span:${classes.chip}`, {}, draft.version || 'V0'),
        h('span:text-[10px] text-[#9aa19d]', {}, 'נשמר אוטומטית'), h('button:text-xs text-red-600', {onClick: props.deleteWorkspace}, 'מחיקה')),
      h('div:flex min-h-[calc(100vh-65px)] max-lg:block', {}, h(`section:min-w-0 flex-1 space-y-4 p-5 ${panelOpen ? 'lg:max-w-[58%]' : ''}`, {},
        h(`section:${classes.card}`, {}, h('label:block text-xs font-semibold', {}, 'תיאור', h('textarea:mt-3 w-full resize-y rounded-xl ' +
          'border border-[#e2e7e4] bg-[#f6f8f7] p-3 text-sm', {value: draft.description || '',
            onInput: event => setDraft({...draft, description: event.target.value}), onBlur: () => saveWorkspace(draft)}))),
        h(`section:${classes.card}`, {}, h('div:flex items-center justify-between', {}, h('b:text-sm', {}, 'הנחיות בסיס'),
          h('span:text-[10px] text-[#9aa19d]', {}, `טקסט חופשי · ${draft.instructions?.length || 0} תווים`)),
          h('textarea:mt-3 min-h-44 w-full resize-y rounded-xl border border-[#e2e7e4] bg-[#f6f8f7] p-3 text-sm leading-7', {
            value: draft.instructions || '', onInput: event => setDraft({...draft, instructions: event.target.value}),
            onBlur: () => saveWorkspace(draft)})),
        h(`section:${classes.card}`, {}, h('b:text-sm', {}, 'סט אבלואציה מקושר'), h('select:mt-3 w-full rounded-xl border border-[#e2e7e4] ' +
          'bg-[#f6f8f7] p-3 text-sm', {value: draft.evalSet || '', onChange: event => persist({...draft, evalSet: event.target.value})},
          h('option', {value: ''}, 'ללא סט מקושר'), (catalog.evalSets || []).map(set => h('option', {key: set.name, value: set.name}, set.title))),
          lastRun && h('div:mt-3 flex items-center justify-between text-xs text-[#7d8982]', {},
            `הרצה אחרונה · ${lastRun.started} · ${lastRun.status}`, h('button:text-[#2f6b4b]', {onClick: () => (setPanelOpen(true), setTab('evaluation'))},
              'צפייה בהיסטוריית ההרצות'))), h('h2:pt-2 text-lg font-bold', {}, `חיבורי ${targetLabel}`), relationRows.map(relationSection)),
        panelOpen ? h('aside:w-full shrink-0 border-r border-[#dfe5e1] bg-[#f8f9f8] lg:w-[42%]', {},
          h('div:flex items-center border-b border-[#dfe5e1] bg-white p-3', {}, h('button:ml-2 rounded-lg p-2', {
            onClick: () => setPanelOpen(false), 'aria-label': 'סגירה'}, h('L:X', {size: 15})), ['test', 'evaluation'].map(id => h(
              `button:rounded-lg px-4 py-2 text-sm ${tab == id ? 'bg-[#e7f1eb] font-semibold text-[#2f6b4b]' : ''}`, {key: id,
                onClick: () => setTab(id)}, id == 'test' ? 'הרצת ניסוי' : 'אבלואציה')), tab == 'test' && h('button:mr-auto text-xs text-[#748079]', {
              onClick: () => setRuns([])}, 'איפוס')), h('div:h-[calc(100vh-126px)]', {}, tab == 'test' ? testPanel : evalPanel))
          : h('button:fixed left-0 top-1/2 z-30 rounded-r-xl bg-[#2f6b4b] px-2 py-6 text-sm text-white', {
            onClick: () => setPanelOpen(true)}, 'הרצה')))
    }
  })
})
