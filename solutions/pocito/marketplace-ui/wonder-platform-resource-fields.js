import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-kit.js'
import './wonder-platform-searchable-select.js'
import './wonder-platform-wizard.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformResourceFields', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh, useState, useEffect}}) => ({resource, item, update, repo, loadPackage, openPicker,
      saveAndRun, runningSet, reason, finish}) => {
      const {classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const stepped = (steps, bar) => hh(ctx, dsls.react['react-comp'].wonderPlatformWizard,
        {steps, activeId, onStep: setActiveId, rail: true, reason: bar?.reason ?? reason, finish: bar?.finish || finish})
      const [historyDetail, setHistoryDetail] = useState(-1)
      const [pkg, setPkg] = useState()
      const [packageState, setPackageState] = useState({loading: false, error: ''})
      const [activeId, setActiveId] = useState('general')
      const [loadedFile, setLoadedFile] = useState('')
      const [dialogFile, setDialogFile] = useState(null)
      const [openQueries, setOpenQueries] = useState({})
      useEffect(() => {
        setActiveId('general'); setPkg(); setPackageState({loading: false, error: ''}); setOpenQueries({})
        if (resource == 'tools' && item.toolType == 'flow_package' && item.packageId) {
          setPackageState({loading: true, error: ''})
          loadPackage(ctx.setVars({packageId: item.packageId}))
            .then(metadata => {
              setPkg(metadata)
              setPackageState({loading: false, error: ''})
            })
            .catch(error => setPackageState({loading: false, error: error.message || String(error)}))
        }
      }, [item.originalId, resource])
      const groupHead = (title, count) => h('div:flex items-center gap-2 border-b border-[var(--wp-border)] ' +
        'bg-[var(--wp-surface-2)] px-4 py-2', {},
      h('span:text-[12px] font-semibold text-[var(--wp-ink-2)]', {}, title),
      count > 0 && h('span:wp-num text-[12px] text-[var(--wp-ink-4)]', {}, count))
      const area = classes.area.replace('mt-1.5 ', '')
      const section = (...rows) => h(`section:${classes.panel} divide-y divide-[var(--wp-border)] overflow-hidden`, {}, ...rows)
      const field = (label, control, hint) => h('div:grid grid-cols-[150px_1fr] items-start gap-x-5 px-4 py-3',
        {key: hint || label}, h('div', {}, h('span:block text-[13px] font-medium leading-9 text-[var(--wp-ink)]', {}, label),
          hint && h(`span:-mt-2 block ${classes.mono}`, {dir: 'ltr'}, hint)),
      h('div:min-w-0', {}, control))
      const block = (label, control, hint) => h('div:px-4 py-3.5', {key: label},
        h('div:mb-2 flex items-baseline gap-2', {}, h('span:text-[13px] font-medium text-[var(--wp-ink)]', {}, label),
          hint && h(`span:${classes.mono}`, {dir: 'ltr'}, hint)), control)
      const input = (key, props = {}) => h(`input:${classes.fieldBare}`, {value: item[key] || '',
        onInput: event => update({...item, [key]: event.target.value}), ...props})
      const relation = (fieldName, target, title) => {
        const ids = item[fieldName] || []
        const row = id => {
          const found = repo[target]?.find(value => value.id == id)
          return h('div:group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--wp-surface-2)]', {key: id},
            hh(ctx, dsls.react['react-comp'].wonderPlatformMark, {icon: found?.icon, text: found?.mark, size: 'md'}),
            h('div:min-w-0 flex-1', {}, h('b:block truncate text-[13px] font-medium text-[var(--wp-ink)]', {}, found?.name || id),
              found?.desc && h('p:truncate text-[12px] leading-[1.5] text-[var(--wp-ink-3)]', {}, found.desc)),
            h(`button:${classes.icon} opacity-0 hover:bg-[var(--wp-danger-soft)] hover:text-[var(--wp-danger)] group-hover:opacity-100`,
              {onClick: () => update({...item, [fieldName]: ids.filter(value => value != id)}),
                'aria-label': `הסרת ${found?.name || id}`}, h('L:X', {size: 14})))
        }
        const addRow = h('button:flex w-full items-center gap-3 px-4 py-2.5 text-[13px] text-[var(--wp-ink-3)] ' +
          'transition-colors hover:bg-[var(--wp-surface-2)] hover:text-[var(--wp-ink)]',
        {onClick: () => openPicker(fieldName, target, title)},
        h('span:grid h-9 w-9 shrink-0 place-items-center rounded-[8px] border border-dashed ' +
          'border-[var(--wp-border-strong)]', {}, h('L:Plus', {size: 14})), `הוספת ${title}`)
        return h('div', {key: fieldName}, groupHead(title, ids.length),
          h('div:divide-y divide-[var(--wp-border)]', {}, ids.map(row), addRow))
      }
      const generalStep = () => h('div:space-y-4', {},
        section(field('שם להצגה', input('name', {placeholder: 'שם להצגה…', 'aria-label': 'display_name'}), 'display_name'),
          field('מזהה', input('id', {dir: 'ltr', placeholder: 'uiRenderingSkill', disabled: !!item.originalId}), 'id'),
          field('תיאור באנגלית', h(`textarea:${area} min-h-20 resize-y`, {dir: 'ltr', value: item.apiDescription || '',
            onInput: event => update({...item, apiDescription: event.target.value})}), 'description'),
          field('תיאור בעברית', h(`textarea:${area} min-h-20 resize-y`, {value: item.desc || '',
            onInput: event => update({...item, desc: event.target.value})}), 'hebrew_description')))
      const stepsFor = resource => resource == 'agents' ? [
        {id: 'general', label: 'כללי', render: generalStep},
        {id: 'instructions', label: 'הנחיות', render: () => section(block('הנחיות מערכת',
          h(`textarea:${area} min-h-40 resize-y`, {value: item.instructions || '',
            onInput: event => update({...item, instructions: event.target.value})}), 'system_prompt'))},
        {id: 'connections', label: 'חיבורים', render: () => section(relation('pluginIds', 'plugins', 'פלאגינים'),
          relation('skillIds', 'skills', 'מיומנויות'), relation('toolIds', 'tools', 'כלים'),
          relation('knowledgeIds', 'knowledge', 'ידע'))}
      ] : resource == 'skills' ? [
        {id: 'general', label: 'כללי', render: generalStep},
        {id: 'content', label: 'תוכן המיומנות', render: () => section(
          h('div:px-4 py-3.5', {},
            h('div:mb-2 flex items-baseline justify-between gap-2', {},
              h('div:flex items-baseline gap-2', {},
                h('span:text-[13px] font-medium text-[var(--wp-ink)]', {}, 'תוכן המיומנות'),
                loadedFile && h('span:text-[12px] text-[var(--wp-ink-4)]', {}, loadedFile),
                repo.marketplace && h(`span:${classes.mono}`, {dir: 'ltr'}, 'SKILL.md')),
              h(`label:${classes.button} cursor-pointer shrink-0`, {},
                h('input:hidden', {type: 'file', accept: '.md,.txt,text/markdown,text/plain',
                  onChange: async e => {
                    if (!e.target.files?.[0]) return
                    const content = await e.target.files[0].text()
                    item.content?.trim() ? setDialogFile({file: e.target.files[0], content})
                      : (update({...item, content}), setLoadedFile(e.target.files[0].name))
                  }}),
                'טעינה מקובץ')),
            h(`textarea:${area} min-h-[22rem] resize-y`, {value: item.content || '',
              onInput: event => update({...item, content: event.target.value})})))},
        {id: 'assets', label: 'Assets', render: () => repo.marketplace && section(
          groupHead('Assets', (item.assets || []).length),
          h('div:px-4 py-3', {}, h('label:flex cursor-pointer flex-col items-center rounded-[8px] border border-dashed ' +
            'border-[var(--wp-border-strong)] px-4 py-6 text-center transition-colors hover:bg-[var(--wp-surface-2)]',
          {onDragOver: event => event.preventDefault(), onDrop: event => (event.preventDefault(),
            addAssets(event.dataTransfer.files, event.currentTarget.ownerDocument.defaultView))},
          h('L:Upload', {size: 18, className: 'text-[var(--wp-ink-4)]'}),
          h('b:mt-2 text-[13px] font-medium text-[var(--wp-ink)]', {}, 'Drop files here or browse'),
          h(`p:${classes.help}`, {}, 'Multiple files are supported'),
          h('input:hidden', {type: 'file', multiple: true, 'data-skill-assets': true,
            onChange: event => addAssets(event.target.files, event.currentTarget.ownerDocument.defaultView)}))),
          ...(item.assets || []).map((asset, index) => h('div:flex min-w-0 items-center gap-3 px-4 py-2.5',
            {key: `${asset.path}-${index}`}, h('L:File', {size: 16, className: 'shrink-0 text-[var(--wp-ink-4)]'}),
            h('div:min-w-0 flex-1', {}, h('input:w-full min-w-0 bg-transparent text-[13px] font-medium outline-none wp-noring',
              {dir: 'ltr', value: asset.path || '', 'aria-label': `Asset path ${index + 1}`, onInput: event => update({...item,
                assets: item.assets.map((value, row) => row == index ? {...value, path: event.target.value} : value)})}),
            h(`p:truncate ${classes.mono}`, {dir: 'ltr'}, asset.mime_type || 'application/octet-stream')),
            h(`button:${classes.icon} hover:bg-[var(--wp-danger-soft)] hover:text-[var(--wp-danger)]`,
              {onClick: () => update({...item, assets: item.assets.filter((value, row) => row != index)}),
                'aria-label': `Remove ${asset.path}`}, h('L:Trash2', {size: 14})))))},
        {id: 'tools', label: 'כלים', render: () => section(relation('toolIds', 'tools', 'כלים'))}
      ] : resource == 'knowledge' ? [
        {id: 'general', label: 'כללי', render: generalStep},
        {id: 'files', label: 'קבצים', render: knowledgeSection}
      ] : resource == 'plugins' ? [
        {id: 'general', label: 'כללי', render: generalStep},
        {id: 'instructions', label: 'הנחיות', render: () => section(block('הנחיות בסיס',
          h(`textarea:${area} min-h-40 resize-y`, {value: item.instructions || '',
            onInput: event => update({...item, instructions: event.target.value})}))) },
        {id: 'connections', label: 'חיבורים', render: () => section(relation('skillIds', 'skills', 'מיומנויות'),
          relation('toolIds', 'tools', 'כלים'), relation('knowledgeIds', 'knowledge', 'ידע'))}
      ] : [
        {id: 'general', label: 'כללי', render: generalStep},
        {id: 'instructions', label: 'הנחיות בסיס', render: () => section(block('הנחיות בסיס',
          h(`textarea:${area} min-h-40 resize-y`, {value: item.instructions || '',
            onInput: event => update({...item, instructions: event.target.value})}))) },
        {id: 'connections', label: 'חיבורים', render: () => section(relation('skillIds', 'skills', 'מיומנויות'),
          relation('toolIds', 'tools', 'כלים'))}
      ]
      const currentPackage = pkg || repo.flowPackages.find(value => value.Id == item.packageId)
      const setCube = (index, patch) => update({...item, outputCubes: item.outputCubes.map((value, cubeIndex) =>
        cubeIndex == index ? {...value, ...patch} : value)})
      const queryId = query => String(query.id ?? query.Id ?? query.Name)
      const selectedQueries = [...new Set((item.inputBindings || []).map(binding => binding.queryId))]
      const bindingKey = (query, field) => `${queryId(query)}:${field.Name}`
      const selectedBinding = (query, field) => (item.inputBindings || []).find(binding =>
        `${binding.queryId}:${binding.field}` == bindingKey(query, field))
      const bindingName = (binding, bindings = item.inputBindings || []) => {
        const dynamic = bindings.filter(value => value.mode == 'dynamic')
        if (dynamic.filter(value => value.field == binding.field).length == 1) return binding.field
        return `${(binding.queryName || binding.queryId).replace(/\W+/g, '_').replace(/^_|_$/g, '').toLowerCase()}__${binding.field}`
      }
      const bindingSchema = inputBindings => inputBindings.filter(binding => binding.mode == 'dynamic').map(binding => ({
          Name: bindingName(binding, inputBindings), Type: binding.type,
          DisplayName: binding.displayName, Description: binding.description, IsRequired: true, QueryId: binding.queryId}))
      const setBindings = inputBindings => update({...item, inputBindings, inputSchema: bindingSchema(inputBindings)})
      const patchBinding = (binding, patch) => setBindings((item.inputBindings || []).map(value => value == binding
        ? {...value, ...patch} : value))
      const queryExpanded = (id, index) => {
        if (openQueries[id] !== undefined) return !!openQueries[id]
        const bound = [...new Set((item.inputBindings || []).map(b => b.queryId))]
        if (bound.length > 0) return bound.includes(id)
        return index === 0
      }
      const toggleExpand = (id, index) => {
        const current = queryExpanded(id, index)
        setOpenQueries(prev => ({...prev, [id]: !current}))
      }
      const fieldDescription = field => field?.Description || field?.description || field?.Desc || field?.Help
        || (field?.DisplayName ? `ערך ${field.DisplayName}` : (field?.Name ? `ערך ${field.Name}` : ''))
      const toggleField = (query, field) => {
        const binding = selectedBinding(query, field)
        const next = binding ? (item.inputBindings || []).filter(value => value != binding) : [...(item.inputBindings || []), {
          queryId: queryId(query), queryName: query.Name || queryId(query), field: field.Name,
          displayName: field.DisplayName || field.Name, type: field.Type || 'String', mode: 'dynamic',
          description: fieldDescription(field)}]
        setBindings(next)
      }
      const isDateField = (binding, field) => {
        const t = (binding?.type || field?.Type || '').toLowerCase()
        if (['datetime', 'date', 'timestamp', 'daterange'].includes(t)) return true
        const f = (binding?.field || field?.Name || '').toLowerCase()
        return /_at$|_date$|^date|date_|^time|timestamp/.test(f)
      }
      const timeUnits = [
        ['day', 'ימים'],
        ['week', 'שבועות'],
        ['month', 'חודשים'],
        ['year', 'שנים'],
        ['hour', 'שעות'],
        ['minute', 'דקות']
      ]
      const hasValidFixedValue = binding => {
        if (!binding || binding.value === '' || binding.value == null) return false
        if (typeof binding.value == 'object') {
          return binding.value.TimeBackValue !== '' && binding.value.TimeBackValue != null && !isNaN(binding.value.TimeBackValue)
        }
        return true
      }
      const formatFixedValue = value => {
        if (value && typeof value == 'object' && value.TimeBackValue != null) {
          const unitLabels = {day: 'ימים', week: 'שבועות', month: 'חודשים', year: 'שנים', hour: 'שעות', minute: 'דקות', second: 'שניות'}
          return `${value.TimeBackValue} ${unitLabels[value.TimeBackUnit] || value.TimeBackUnit} אחורה`
        }
        return value == null ? '' : typeof value == 'string' ? value : JSON.stringify(value)
      }
      const fixedValue = (binding, value) => ['int', 'double'].includes((binding?.type || '').toLowerCase()) ? +value
        : (binding?.type || '').toLowerCase() == 'boolean' ? value == 'true' : value
      const bindingEditor = (query, field) => {
        const binding = selectedBinding(query, field), selected = !!binding
        const isDate = isDateField(binding, field)
        const isRelative = selected && isDate && typeof binding?.value == 'object' && binding?.value !== null && binding?.value?.TimeBackValue !== undefined
        const dateKind = binding?.dateKind || (isRelative ? 'relative' : 'exact')
        const relVal = isRelative ? binding?.value : {TimeBackValue: 30, TimeBackUnit: 'day'}
        const descText = binding?.description ?? fieldDescription(field)
        const fixedControl = () => {
          if (!binding) return null
          if (isDate) {
            return h('div:space-y-2.5', {},
              h('div:flex items-center gap-2', {},
                h('div:inline-flex rounded-[8px] border border-[var(--wp-border)] bg-[var(--wp-surface)] p-0.5', {},
                  ...[['exact', 'תאריך סגור'], ['relative', 'כמה זמן אחורה']].map(([kind, label]) => h(
                    `button:rounded-[6px] px-2.5 py-1 text-[11px] font-medium ${dateKind == kind
                      ? 'bg-[var(--wp-ink)] text-white' : 'text-[var(--wp-ink-3)]'}`,
                    {key: kind, onClick: () => patchBinding(binding, {dateKind: kind,
                      value: kind == 'relative' ? (isRelative ? binding.value : {TimeBackValue: 30, TimeBackUnit: 'day'})
                        : (typeof binding.value == 'string' ? binding.value : '')})}, label)))),
              dateKind == 'exact'
                ? h(`input:${classes.fieldBare}`, {type: 'date', value: typeof binding.value == 'string' ? binding.value : '',
                  'aria-label': `תאריך סגור ${field.Name}`,
                  onInput: event => patchBinding(binding, {value: event.target.value, dateKind: 'exact'}),
                  onChange: event => patchBinding(binding, {value: event.target.value, dateKind: 'exact'})})
                : h('div:flex items-center gap-2', {},
                  h(`input:${classes.fieldBare} w-28`, {type: 'number', min: 1, placeholder: 'כמות',
                    value: relVal.TimeBackValue ?? '', 'aria-label': `כמות זמן אחורה ${field.Name}`,
                    onInput: event => patchBinding(binding, {dateKind: 'relative',
                      value: {TimeBackValue: event.target.value === '' ? '' : +event.target.value, TimeBackUnit: relVal.TimeBackUnit || 'day'}})}),
                  h(`select:${classes.fieldBare} w-36`, {value: relVal.TimeBackUnit || 'day', 'aria-label': `יחידת מידה ${field.Name}`,
                    onChange: event => patchBinding(binding, {dateKind: 'relative',
                      value: {TimeBackValue: relVal.TimeBackValue ?? 30, TimeBackUnit: event.target.value}})},
                    ...timeUnits.map(([unit, label]) => h('option', {key: unit, value: unit}, label)))))
          }
          if ((binding.type || field?.Type || '').toLowerCase() == 'boolean') {
            return h(`select:${classes.fieldBare}`, {value: String(binding.value ?? ''),
              'aria-label': `ערך קבוע ${field.Name}`,
              onChange: event => patchBinding(binding, {value: fixedValue(binding, event.target.value)})},
              ...['', 'true', 'false'].map(value => h('option', {key: value, value},
                value == '' ? 'בחרו ערך' : value == 'true' ? 'כן' : 'לא')))
          }
          return h(`input:${classes.fieldBare}`, {
            type: ['int', 'double'].includes((binding.type || field?.Type || '').toLowerCase()) ? 'number' : 'text', value: String(binding.value ?? ''),
            placeholder: 'ערך קבוע', 'aria-label': `ערך קבוע ${field.Name}`,
            onInput: event => patchBinding(binding, {value: fixedValue(binding, event.target.value)}),
            onChange: event => patchBinding(binding, {value: fixedValue(binding, event.target.value)})})
        }
        return h(`div:border-t border-[var(--wp-border)] px-4 py-3 ${selected ? 'bg-[var(--wp-surface-2)]' : ''}`,
          {key: field.Name},
          h('button:flex w-full items-start gap-3 text-start', {onClick: () => toggleField(query, field)},
            h('span:mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border border-[var(--wp-border-strong)]', {},
              selected && h('L:Check', {size: 13})),
            h('span:min-w-0 flex-1', {},
              h('b:block truncate text-[13px] font-medium', {}, field.DisplayName || field.Name),
              h(`span:${classes.mono} block`, {dir: 'ltr'}, field.Name),
              binding?.mode == 'fixed' && descText && h('p:mt-1 text-[12px] text-[var(--wp-ink-3)] leading-relaxed', {}, descText)),
            h(`span:${classes.chip} shrink-0`, {}, field.Type || 'String')),
          selected && h('div:mt-3 me-8 space-y-3', {},
            h('div:inline-flex rounded-[8px] border border-[var(--wp-border)] bg-[var(--wp-surface)] p-0.5', {},
              ...[['dynamic', 'דינמי'], ['fixed', 'קבוע']].map(([mode, label]) => h(
                `button:rounded-[6px] px-3 py-1.5 text-[12px] font-medium ${binding.mode == mode
                  ? 'bg-[var(--wp-ink)] text-white' : 'text-[var(--wp-ink-3)]'}`,
                {key: mode, onClick: () => patchBinding(binding, {mode, ...(mode == 'fixed' ? {value: ''} : {})})}, label))),
            binding.mode == 'dynamic' ? h(`input:${classes.fieldBare}`, {value: binding.description ?? descText,
              placeholder: 'מה הסוכן צריך להזין?', 'aria-label': `תיאור ${field.Name}`,
              onInput: event => patchBinding(binding, {description: event.target.value})})
              : fixedControl(),
            binding.mode == 'dynamic' && !binding.description?.trim() && h('p:text-[12px] text-[var(--wp-danger)]', {},
              'חובה להוסיף תיאור לקלט דינמי'),
            binding.mode == 'fixed' && !hasValidFixedValue(binding) && h('p:text-[12px] text-[var(--wp-danger)]', {},
              'חובה לקבוע ערך')))
      }
      const inputQuery = (query, index) => {
        const id = queryId(query)
        const count = (item.inputBindings || []).filter(binding => binding.queryId == id).length
        const hasSelected = count > 0
        const isExpanded = queryExpanded(id, index)
        return h(`article:${classes.panel} overflow-hidden`, {key: id},
          h('button:flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-[var(--wp-surface-2)]',
            {onClick: () => toggleExpand(id, index), 'aria-expanded': isExpanded},
            h('span:grid h-5 w-5 shrink-0 place-items-center rounded border border-[var(--wp-border-strong)]', {},
              hasSelected && h('L:Check', {size: 13})),
            h('span:min-w-0 flex-1', {}, h('b:block truncate text-[13px] font-semibold', {}, query.Name || id),
              h(`span:${classes.mono}`, {dir: 'ltr'}, id)),
            hasSelected && h(`span:${classes.chip}`, {}, `${count} שדות`),
            h(isExpanded ? 'L:ChevronUp' : 'L:ChevronDown', {size: 15})),
          isExpanded && h('div', {}, ...(query.Fields || []).map(field => bindingEditor(query, field)),
            !(query.Fields || []).length && h('p:border-t border-[var(--wp-border)] px-4 py-4 text-[12px] text-[var(--wp-ink-3)]', {},
              'לא נמצאו שדות בקובייה')))
      }
      const inputSection = () => h('div:space-y-3', {}, h('div:flex items-end justify-between gap-4 px-1', {},
        h('div', {}, h(`h2:${classes.h2}`, {}, 'קלטים לפונקציה'), h(`p:${classes.help}`, {},
          'בחרו קובייה, ואז סמנו אילו שדות הסוכן ימלא ואילו יישלחו כערך קבוע (אופציונלי).')),
        h(`span:${classes.chip}`, {}, `${(item.inputBindings || []).length} נבחרו`)),
      ...(currentPackage?.Queries || []).map((query, index) => inputQuery(query, index)))
      const summaryStep = () => {
        const dynamic = (item.inputBindings || []).filter(binding => binding.mode == 'dynamic')
        const fixed = (item.inputBindings || []).filter(binding => binding.mode == 'fixed')
        const type = value => ({int: 'integer', double: 'number', boolean: 'boolean'}[value.toLowerCase()] || 'string')
        const signature = `${item.id || 'flowTool'}(${dynamic.map(binding => `${bindingName(binding)}: ${type(binding.type)}`).join(', ')})`
        const rows = (title, values, render) => h(`section:${classes.panel} overflow-hidden`, {}, groupHead(title, values.length),
          ...values.map(render), !values.length && h('p:px-4 py-4 text-[13px] text-[var(--wp-ink-3)]', {}, 'לא נבחרו'))
        const tag = (text, dir) => h('span:shrink-0 rounded-full border border-[var(--wp-border)] ' +
          'bg-[var(--wp-surface)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--wp-ink-3)]', dir ? {dir} : {}, text)
        const badge = (text, dir) => h('span:rounded border border-[var(--wp-border)] bg-[var(--wp-surface-2)] ' +
          'px-1.5 py-0.5 font-mono text-[11px] text-[var(--wp-ink-3)]', dir ? {dir} : {}, text)
        return h('div:space-y-4', {},
          h(`section:${classes.panel} p-4`, {}, h(`p:${classes.meta}`, {}, 'חתימת הפונקציה'),
            h('code:mt-2 block overflow-x-auto rounded-[8px] bg-[var(--wp-surface-2)] p-3 text-[13px]', {dir: 'ltr'}, signature)),
          rows('קלטים דינמיים', dynamic, binding => h(
            'div:flex items-start justify-between gap-4 border-b border-[var(--wp-border)] px-4 py-3 last:border-b-0',
            {key: `${binding.queryId}:${binding.field}`},
            h('div:min-w-0 flex-1 space-y-1', {},
              h('div:flex flex-wrap items-center gap-2', {},
                h('span:text-[13px] font-semibold text-[var(--wp-ink)]', {dir: 'auto'}, binding.displayName || binding.field),
                badge(`${binding.queryName} · ${binding.field}`, 'ltr')),
              binding.description
                ? h('p:text-[13px] leading-relaxed text-[var(--wp-ink-2)]', {dir: 'auto'}, binding.description)
                : h('p:text-[13px] italic text-[var(--wp-ink-3)]', {}, 'ללא תיאור')),
            tag('דינמי'))),
          rows('ערכים קבועים', fixed, binding => h(
            'div:flex items-start justify-between gap-4 border-b border-[var(--wp-border)] px-4 py-3 last:border-b-0',
            {key: `${binding.queryId}:${binding.field}`},
            h('div:min-w-0 flex-1 space-y-1', {},
              h('div:flex flex-wrap items-center gap-2', {},
                h('span:text-[13px] font-semibold text-[var(--wp-ink)]', {dir: 'auto'}, binding.displayName || binding.field),
                badge(`${binding.queryName} · ${binding.field}`, 'ltr')),
              h('div:flex items-center gap-2 text-[13px]', {},
                h('span:text-[var(--wp-ink-3)]', {}, 'ערך קבוע:'),
                h('span:rounded border border-[var(--wp-border)] bg-[var(--wp-surface-2)] px-2 py-0.5 ' +
                  'font-mono font-medium text-[var(--wp-ink)]', {dir: 'ltr'}, formatFixedValue(binding.value)))),
            tag('קבוע'))),
          rows('קוביות פלט', item.outputCubes || [], cube => h(
            'div:flex items-start justify-between gap-4 border-b border-[var(--wp-border)] px-4 py-3 last:border-b-0',
            {key: cube.id || cube.Name || cube.name},
            h('div:min-w-0 flex-1 space-y-1', {},
              h('div:flex flex-wrap items-center gap-2', {},
                h('span:text-[13px] font-semibold text-[var(--wp-ink)]', {dir: 'auto'}, cube.Name || cube.name || cube.id),
                (cube.id || cube.Name) && badge(cube.id || cube.Name, 'ltr')),
              cube.description?.trim()
                ? h('p:text-[13px] leading-relaxed text-[var(--wp-ink-2)]', {dir: 'auto'}, cube.description)
                : h('p:text-[13px] italic text-[var(--wp-ink-3)]', {}, 'ללא תיאור נוסף')),
            cube.save ? tag(`${(cube.format || 'json').toUpperCase()} · קובץ`, 'ltr') : tag('פלט ישיר'))))
      }
      const cubeRow = (cube, index) => h('div:group px-4 py-3', {key: cube.id || cube.Name || cube.name || index},
        h('div:flex items-center gap-3', {},
          h('span:min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--wp-ink)]', {}, cube.Name || cube.name || cube.id),
          h(`button:${classes.icon} opacity-0 hover:bg-[var(--wp-danger-soft)] hover:text-[var(--wp-danger)] group-hover:opacity-100`,
            {onClick: () => update({...item, outputCubes: item.outputCubes.filter((value, cubeIndex) => cubeIndex != index)}),
              'aria-label': `הסרת ${cube.Name || cube.name || cube.id}`}, h('L:X', {size: 14}))),
        h('div:mt-2 grid grid-cols-[1fr_96px] gap-2', {},
          h(`input:${classes.fieldBare}`, {value: cube.description || '', placeholder: 'מה הקובייה מחזירה',
            onInput: event => setCube(index, {description: event.target.value})}),
          h(`input:${classes.fieldBare}`, {type: 'number', value: cube.markdownRows || 20, min: 0, title: 'שורות Markdown',
            onInput: event => setCube(index, {markdownRows: +event.target.value})})),
        h('div:mt-2 flex items-center gap-3 text-[12px] text-[var(--wp-ink-3)]', {},
          h('label:flex items-center gap-1.5', {}, h('input:wp-noring', {type: 'checkbox', checked: cube.save || false,
            onChange: event => setCube(index, {save: event.target.checked})}), 'שמירה לקובץ'),
          cube.save && h(`select:${classes.fieldBare} h-8 w-28`, {value: cube.format || 'json',
            onChange: event => setCube(index, {format: event.target.value})}, ...['json', 'csv', 'parquet'].map(value =>
            h('option', {key: value, value}, value.toUpperCase())))))
      const outputCubesSection = () => {
        const allCubes = currentPackage?.Queries || []
        const pickCubes = ids => update({...item, outputCubes: ids.map(id => (item.outputCubes || []).find(value => value.id == id)
          || {...allCubes.find(cube => cube.id == id), description: '', markdownRows: allCubes.find(cube => cube.id == id)?.ResultsLimit || 20,
            save: false, format: 'json'})})
        return section(groupHead('קוביות פלט', item.outputCubes?.length || 0),
          h('div:px-4 py-3', {}, hh(ctx, dsls.react['react-comp'].wonderPlatformSearchableSelect, {items: allCubes.map(cube =>
            ({id: cube.id, name: cube.Name})), value: (item.outputCubes || []).map(cube => cube.id), onChange: pickCubes, multi: true,
          placeholder: 'בחירת קוביות פלט'})),
          ...(item.outputCubes || []).map(cubeRow))
      }
      const removeFile = index => update({...item, files: item.files.filter((value, row) => row != index),
        deletedContentIds: item.files[index].id ? [...(item.deletedContentIds || []), item.files[index].id] : item.deletedContentIds})
      const pickedFile = (file, index) => h(`li:flex items-center justify-between text-[12px] text-[var(--wp-ink-2)]`, {key: index},
        h('span:truncate', {}, `${file.name} (${Math.round(file.size / 1024)}KB)`, file.status && h(
          `span:${classes.chip} mr-2`, {}, {pending: 'ממתין', processing: 'בעיבוד', completed: 'מוכן', failed: 'נכשל'}[file.status]
            || file.status)),
        h('button', {onClick: () => removeFile(index), 'aria-label': `הסרת ${file.name}`}, h('L:X', {size: 12})))
      const addFiles = event => update({...item, files: [...(item.files || []), ...[...event.target.files].map(file =>
        ({name: file.name, size: file.size, file}))]})
      const readAsset = (file, win) => new Promise(resolve => { const reader = new win.FileReader(); reader.onload = () => resolve({
        path: file.name, content_b64: reader.result.split(',')[1], mime_type: file.type || 'application/octet-stream'}); reader.readAsDataURL(file) })
      const addAssets = async (files, win) => {
        const added = await Promise.all([...files].map(file => readAsset(file, win)))
        update({...item, assets: [...(item.assets || []).filter(asset => !added.some(value => value.path == asset.path)), ...added]})
      }
      const knowledgeSection = () => h(`section:${classes.panel} p-4`, {},
        h('div:flex items-center justify-between', {}, h(`h2:${classes.h2}`, {}, `קבצים (${(item.files || []).length})`),
          h(`label:${classes.button} cursor-pointer`, {}, h('L:Plus', {size: 14}), 'הוספת קבצים',
            h('input:hidden', {type: 'file', multiple: true, onChange: addFiles}))),
        (item.files || []).length > 0 ? h('ul:mt-3 space-y-1', {}, item.files.map(pickedFile))
          : h(`p:mt-3 ${classes.meta}`, {}, 'לא נבחרו קבצים'))
      const runRow = (row, rowIndex) => {
        const fields = [['קלט', row.input], ['פלט מצופה', row.expected], ['פלט בפועל', row.actual]]
        const fieldBlock = ([title, value]) => h('div', {key: title}, h(`b:text-[11px] text-[var(--wp-ink-3)]`, {}, title),
          h('p:mt-1 whitespace-pre-wrap break-words', {}, value || '—'))
        return h(`div:rounded-[8px] border border-[var(--wp-border)] p-2 text-[12px]`, {key: rowIndex},
          h('div:grid gap-2 sm:grid-cols-3', {}, fields.map(fieldBlock)),
          row.opikUrl && h('a:mt-2 inline-flex items-center gap-1 text-[var(--wp-ink)]',
            {href: row.opikUrl, target: '_blank', rel: 'noreferrer'}, 'הטרייס המלא ב-Opik', h('L:ExternalLink', {size: 12})))
      }
      const historyRow = (run, runIndex) => {
        const targetName = repo.plugins.find(plugin => plugin.id == run.targetId)?.name
          || repo.subagents.find(agent => agent.id == run.targetId)?.name || repo.agents.find(agent => agent.id == run.targetId)?.name
        const summary = h('button:flex w-full flex-wrap items-center gap-3 text-[12px]', {
          onClick: () => setHistoryDetail(historyDetail == runIndex ? -1 : runIndex)},
          h('b', {}, run.started), h('span', {}, targetName), h('span', {}, `${run.completed || 0}/${run.total}`),
          h(`span:${classes.chip}`, {}, run.status))
        const detail = historyDetail == runIndex && h('div:mt-3 space-y-2', {}, (run.rows || []).map(runRow))
        return h('div:mt-3 border-t border-[var(--wp-border)] pt-3', {key: run.id}, summary, detail)
      }
      const historySection = () => {
        const runs = repo.evalRuns.filter(run => run.evaluationId == item.id).sort((a, b) => b.startedAt - a.startedAt)
        return h(`section:${classes.panel} p-4`, {}, h(`h2:${classes.h2}`, {}, 'היסטוריית הרצות'),
          runs.length ? runs.map(historyRow) : h(`p:mt-3 ${classes.meta}`, {}, 'עדיין אין הרצות'))
      }
      const scenario = (row, index) => h('article:border-t border-[var(--wp-border)] pt-3 first:border-t-0 first:pt-0', {key: index}, h(
        'div:flex items-center justify-between', {}, h('b:text-[13px] font-semibold', {}, `תרחיש ${index + 1}`), h(
          `button:${classes.icon} hover:bg-[var(--wp-danger-soft)] hover:text-[var(--wp-danger)]`, {onClick: () => update({...item,
            rows: item.rows.filter((value, rowIndex) => rowIndex != index)}), 'aria-label': `מחיקת תרחיש ${index + 1}`}, h(
            'L:Trash2', {size: 14}))), h('div:mt-3 grid gap-3 md:grid-cols-2', {}, field('מה שולחים לסוכן?', h(
          `textarea:${classes.area} min-h-28 resize-y`, {value: row.input || '', placeholder: 'לדוגמה: סכם את מדיניות ההחזרות',
            onInput: event => update({...item, rows: item.rows.map((value, rowIndex) => rowIndex == index
              ? {...value, input: event.target.value} : value)})})), field('מהי תשובה טובה?', h(
          `textarea:${classes.area} min-h-28 resize-y`, {value: row.expected || '',
            placeholder: 'הגדירו עובדות, מבנה או תנאים שחייבים להופיע',
            onInput: event => update({...item, rows: item.rows.map((value, rowIndex) => rowIndex == index
              ? {...value, expected: event.target.value} : value)})}))), h('details:mt-3', {}, h(
        `summary:cursor-pointer ${classes.meta}`, {}, 'הערות פנימיות'), h(`textarea:${classes.area}`, {
          value: row.notes || '', placeholder: 'הקשר נוסף לצוות', onInput: event => update({...item,
            rows: item.rows.map((value, rowIndex) => rowIndex == index ? {...value, notes: event.target.value} : value)})})))
      const legacyTool = () => h('div:space-y-3', {},
        section(
          field('שם להצגה', h(`div:${classes.fieldBare} flex items-center text-[var(--wp-ink-3)]`,
            {'aria-label': 'display_name'}, item.name || '—'), 'display_name'),
          field('תיאור באנגלית', h(`div:${classes.fieldBare} flex h-auto min-h-9 items-center text-[var(--wp-ink-3)]`,
            {dir: 'ltr'}, item.apiDescription || '—'), 'description'),
          field('תיאור בעברית', h(`div:${classes.fieldBare} flex h-auto min-h-9 items-center text-[var(--wp-ink-3)]`,
            {}, item.desc || '—'), 'hebrew_description')),
        h(`p:${classes.help} px-1`, {}, 'כלי Connector מנוהל — לא ניתן לעריכה מכאן.'))
      const loadFlowPackage = async () => {
        setPackageState({loading: true, error: ''})
        try {
          const metadata = await loadPackage(ctx.setVars({packageId: item.packageId}))
          setPkg(metadata); update({...item, packageId: String(metadata.Id ?? item.packageId), inputSchema: [], inputBindings: [], outputCubes: []})
          setPackageState({loading: false, error: ''})
        } catch (error) { setPackageState({loading: false, error: error.message || String(error)}) }
      }
      const loaded = !!item.packageId
      const invalidBinding = (item.inputBindings || []).find(binding => binding.mode == 'dynamic' ? !binding.description?.trim()
        : !hasValidFixedValue(binding))
      const inputsReady = !invalidBinding
      const toolSteps = [
        {id: 'general', label: 'כללי', render: () => section(
          field('שם להצגה', input('name', {placeholder: 'שם להצגה…', 'aria-label': 'display_name'}), 'display_name'),
          field('מזהה הכלי', input('id', {dir: 'ltr', placeholder: 'ecommerceAnalyticsTool', disabled: !!item.originalId}), 'id'),
          field('מארז Flow', h('div:flex items-center gap-2', {},
            input('packageId', {dir: 'ltr', placeholder: '7', inputMode: 'numeric', 'aria-label': 'packageId'}),
            h(`button:${classes.button} shrink-0`, {onClick: loadFlowPackage,
              disabled: packageState.loading || !item.packageId?.trim()}, packageState.loading ? 'טוען…' : 'טעינת מארז')), 'packageId'),
          (packageState.error || item.packageId) && h('div:px-4 py-2.5', {}, packageState.error
            ? h('p:text-[12px] text-[var(--wp-danger)]', {dir: 'ltr'}, packageState.error)
            : h(`p:${classes.mono}`, {dir: 'ltr'}, `${currentPackage?.Name || item.packageId} · #${item.packageId}`)),
          field('תיאור באנגלית', h(`textarea:${area} min-h-20 resize-y`, {dir: 'ltr', value: item.apiDescription || '',
            onInput: event => update({...item, apiDescription: event.target.value})}), 'description'),
          field('תיאור בעברית', h(`textarea:${area} min-h-20 resize-y`, {value: item.desc || '',
            onInput: event => update({...item, desc: event.target.value})}), 'hebrew_description'))},
        {id: 'inputs', label: 'קלטים', disabled: !loaded, render: inputSection},
        {id: 'cubes', label: 'קוביות פלט', disabled: !loaded || !inputsReady, render: outputCubesSection},
        {id: 'summary', label: 'סיכום', disabled: !loaded || !inputsReady, render: summaryStep}
      ]
      if (resource == 'tools') return h('div:h-full min-h-0', {},
        (item.originalId && item.kind != 'flow'
          ? h('div:wp-scroll h-full overflow-y-auto', {}, h('div:mx-auto w-full max-w-[840px] px-6 py-6', {}, legacyTool()))
          : stepped(toolSteps, {reason: invalidBinding ? 'השלימו תיאור או ערך לכל שדה שנבחר' : reason,
          finish: finish && {...finish, disabled: finish.disabled || !inputsReady}})),
        dialogFile && hh(ctx, dsls.react['react-comp'].wonderPlatformDialog, {
          title: 'החלפת תוכן המיומנות',
          body: `טעינה מקובץ ${dialogFile.file.name}. תוכן המיומנות הנוכחי יוחלף.`,
          close: () => setDialogFile(null),
          actions: [['ביטול', () => setDialogFile(null)],
            ['החלפה', () => {
              update({...item, content: dialogFile.content})
              setLoadedFile(dialogFile.file.name)
              setDialogFile(null)
            }, true]]}))
      if (resource == 'evaluations') {
        const target = repo.agents.find(agent => agent.id == item.targetId), running = runningSet == item.id
        const ready = item.name?.trim() && target && item.rows?.some(row => row.input?.trim())
        const evalSteps = [
          {id: 'general', label: 'הגדרה', render: () => h('div:space-y-4', {}, h(`section:${classes.panel} p-5`, {},
            field('שם להצגה', input('name', {placeholder: 'שם להצגה…', 'aria-label': 'display_name'}), 'display_name')),
            h(`section:${classes.panel} p-5`, {}, h(
            `h2:${classes.h2}`, {}, 'מה רוצים לבדוק?'), h(`textarea:${classes.area} min-h-20 resize-y`, {value: item.desc || '',
              placeholder: 'תארו בקצרה את מטרת הבדיקה', onInput: event => update({...item, desc: event.target.value})})), h(
            `section:${classes.panel} p-5`, {}, h('div:flex items-start gap-3', {},
              hh(ctx, dsls.react['react-comp'].wonderPlatformMark, {icon: 'Bot', size: 'md'}), h(
              'div:flex-1', {}, h(`h2:${classes.h2}`, {}, 'איזה סוכן בודקים?'), h(
                `p:${classes.help}`, {}, 'כל התרחישים ירוצו מול אותו סוכן דרך Agno'), h('div:mt-3', {}, hh(
                ctx, dsls.react['react-comp'].wonderPlatformSearchableSelect, {items: repo.agents, value: item.targetId || '',
                  onChange: targetId => update({...item, targetId}), placeholder: 'בחרו סוכן', empty: 'אין סוכנים זמינים'}))))))},
          {id: 'scenarios', label: 'תרחישי בדיקה', render: () => h('div:space-y-4', {}, h(
            `section:${classes.panel} p-5`, {}, h('div:flex items-center justify-between gap-3', {}, h(
              'div', {}, h(`h2:${classes.h2}`, {}, 'תרחישי בדיקה'), h(`p:${classes.help}`, {},
                'כל תרחיש הוא שאלה אחת ותיאור של התוצאה הרצויה')), h(`button:${classes.button}`, {onClick: () => update({...item,
                rows: [...(item.rows || []), {input: '', expected: '', notes: ''}]})}, h('L:Plus', {size: 14}), 'תרחיש')), h(
              'div:mt-4 space-y-3', {}, (item.rows || []).map(scenario), !item.rows?.length && h(
                `div:rounded-[12px] border border-dashed border-[var(--wp-border-strong)] p-8 text-center text-[13px] text-[var(--wp-ink-3)]`, {},
                'הוסיפו תרחיש ראשון כדי להתחיל'))))},
          {id: 'rubric', label: 'רובריקה', render: () => h(`section:${classes.panel} p-5`, {}, h(
            `h2:${classes.h2}`, {}, 'רובריקה'), h(`p:${classes.help}`, {},
              'הגדירו כיצד להעריך תשובה טובה בכל התרחישים'), h(`textarea:${classes.area} mt-4 min-h-24 resize-y`, {
                value: item.rubric || '', placeholder: 'לדוגמה: התשובה מדויקת, מבוססת על המקורות ומציינת פערי מידע',
                onInput: event => update({...item, rubric: event.target.value})}))},
          {id: 'history', label: 'היסטוריית הרצות', render: historySection}
        ]
        return h('div:h-full min-h-0', {},
          stepped(evalSteps, {reason: !item.name?.trim() ? 'הוסיפו שם לבדיקה' : !target ? 'בחרו סוכן כדי להריץ'
            : !item.rows?.some(row => row.input?.trim()) ? 'הוסיפו לפחות תרחיש אחד עם קלט' : 'מוכן להרצה',
            finish: {label: running ? 'מריץ…' : 'שמירה והרצה', aria: 'שמירה והרצת הסט', disabled: !ready || running,
              onClick: () => saveAndRun(item, target)}}),
          dialogFile && hh(ctx, dsls.react['react-comp'].wonderPlatformDialog, {
            title: 'החלפת תוכן המיומנות',
            body: `טעינה מקובץ ${dialogFile.file.name}. תוכן המיומנות הנוכחי יוחלף.`,
            close: () => setDialogFile(null),
            actions: [['ביטול', () => setDialogFile(null)],
            ['החלפה', () => {
              update({...item, content: dialogFile.content})
              setLoadedFile(dialogFile.file.name)
              setDialogFile(null)
            }, true]]}))
      }
      return h('div:h-full min-h-0', {},
        stepped(stepsFor(resource).filter(step => step.id != 'assets' || repo.marketplace)),
        dialogFile && hh(ctx, dsls.react['react-comp'].wonderPlatformDialog, {
          title: 'החלפת תוכן המיומנות',
          body: `טעינה מקובץ ${dialogFile.file.name}. תוכן המיומנות הנוכחי יוחלף.`,
          close: () => setDialogFile(null),
          actions: [['ביטול', () => setDialogFile(null)],
            ['החלפה', () => {
              update({...item, content: dialogFile.content})
              setLoadedFile(dialogFile.file.name)
              setDialogFile(null)
            }, true]]}))
    }
  })
})
