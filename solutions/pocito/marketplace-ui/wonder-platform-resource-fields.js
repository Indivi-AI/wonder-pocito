import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-kit.js'
import './wonder-platform-searchable-select.js'
import './wonder-platform-wizard.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformResourceFields', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh, useState, useEffect}}) => ({resource, item, update, repo, loadPackage, openPicker, saveAndRun, runningSet}) => {
      const {classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const [historyDetail, setHistoryDetail] = useState(-1)
      const [pkg, setPkg] = useState()
      const [packageState, setPackageState] = useState({loading: false, error: ''})
      const [activeId, setActiveId] = useState('general')
      useEffect(() => {
        setActiveId('general'); setPkg(); setPackageState({loading: false, error: ''})
        if (resource == 'tools' && item.toolType == 'flow_package' && item.packageId) {
          setPackageState({loading: true, error: ''})
          loadPackage(ctx.setVars({packageId: item.packageId}))
            .then(({metadata}) => {
              setPkg(metadata)
              setPackageState({loading: false, error: ''})
            })
            .catch(error => setPackageState({loading: false, error: error.message || String(error)}))
        }
      }, [item.id, resource])
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
            onInput: event => update({...item, desc: event.target.value})}), 'hebrew_description')),
        repo.marketplace && item._marketplace && section(h('div:flex flex-wrap items-center gap-2 px-4 py-3', {},
          h(`h2:${classes.h3}`, {}, 'Marketplace API'), h(`span:${classes.chip}`, {}, `${item.versions?.length || 0} גרסאות`),
          h(`span:${classes.chip}`, {}, `${item.audit?.length || 0} אירועי audit`),
          ...(item.versions || []).map((version, index) => h(`span:${classes.chip}`, {key: index},
            `V${version.version ?? version.n ?? index + 1}`)))))
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
        {id: 'content', label: 'תוכן המיומנות', render: () => section(block('תוכן המיומנות',
          h(`textarea:${area} min-h-40 resize-y`, {value: item.content || '',
            onInput: event => update({...item, content: event.target.value})}, ), repo.marketplace && 'SKILL.md'))},
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
      const quickParamRow = (row, index) => h('div:px-4 py-3', {key: row.Name},
        h('div:flex flex-wrap items-center gap-2', {},
          h('span:text-[13px] font-medium text-[var(--wp-ink)]', {}, row.DisplayName),
          h(`span:${classes.mono}`, {dir: 'ltr'}, row.Name),
          h('span:text-[11px] text-[var(--wp-ink-4)]', {}, row.Type),
          row.IsRequired && h(`span:${classes.chip}`, {}, 'נדרש'),
          row.IsRequireAny && h(`span:${classes.chip}`, {}, 'לפחות אחד'),
          row.IsSingleValue && h(`span:${classes.chip}`, {}, 'ערך יחיד')),
        h(`input:${classes.fieldBare} mt-2`, {value: row.Description || '', placeholder: 'תיאור הפרמטר',
          onInput: event => update({...item, inputSchema: item.inputSchema.map((value, rowIndex) => rowIndex == index
            ? {...value, Description: event.target.value} : value)})}))
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
          const {quick, metadata} = await loadPackage(ctx.setVars({packageId: item.packageId}))
          setPkg(metadata); update({...item, packageId: String(metadata.Id ?? item.packageId), inputSchema: Object.values(quick || {}).flat().map(value =>
            ({...value, Description: value.Description || ''})), outputCubes: []})
          setPackageState({loading: false, error: ''})
        } catch (error) { setPackageState({loading: false, error: error.message || String(error)}) }
      }
      const loaded = !!item.packageId
      const toolSteps = [
        {id: 'general', label: 'כללי', render: () => section(
          field('שם להצגה', input('name', {placeholder: 'שם להצגה…', 'aria-label': 'display_name'}), 'display_name'),
          field('מזהה הכלי', input('id', {dir: 'ltr', placeholder: 'ecommerceAnalyticsTool', disabled: !!item.originalId}), 'id'),
          field('מארז Flow', h('div:flex items-center gap-2', {},
            input('packageId', {dir: 'ltr', placeholder: '7', inputMode: 'numeric'}),
            h(`button:${classes.button} shrink-0`, {onClick: loadFlowPackage,
              disabled: packageState.loading || !item.packageId?.trim()}, packageState.loading ? 'טוען…' : 'טעינה')), 'packageId'),
          (packageState.error || item.packageId) && h('div:px-4 py-2.5', {}, packageState.error
            ? h('p:text-[12px] text-[var(--wp-danger)]', {dir: 'ltr'}, packageState.error)
            : h(`p:${classes.mono}`, {dir: 'ltr'}, `${currentPackage?.Name || item.packageId} · #${item.packageId}`)),
          field('תיאור באנגלית', h(`textarea:${area} min-h-20 resize-y`, {dir: 'ltr', value: item.apiDescription || '',
            onInput: event => update({...item, apiDescription: event.target.value})}), 'description'),
          field('תיאור בעברית', h(`textarea:${area} min-h-20 resize-y`, {value: item.desc || '',
            onInput: event => update({...item, desc: event.target.value})}), 'hebrew_description'))},
        {id: 'params', label: 'פרמטרים', disabled: !loaded, render: () => section(
          groupHead('פרמטרים מהירים', (item.inputSchema || []).length),
          ...(item.inputSchema || []).map(quickParamRow))},
        {id: 'cubes', label: 'קוביות פלט', disabled: !loaded, render: outputCubesSection}
      ]
      const toolFields = () => item.originalId && item.kind != 'flow' ? legacyTool() : hh(ctx,
        dsls.react['react-comp'].wonderPlatformWizard, {steps: toolSteps, activeId, onStep: setActiveId})
      if (resource == 'tools') return toolFields()
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
        return h('div:space-y-5', {},
          hh(ctx, dsls.react['react-comp'].wonderPlatformWizard, {steps: evalSteps, activeId, onStep: setActiveId}),
          h(`div:sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border ` +
            `border-[var(--wp-border-strong)] bg-[var(--wp-surface)] p-4 shadow-[var(--wp-sh-2)]`, {}, h(
            'p:text-[12px] text-[var(--wp-ink-3)]', {}, !item.name?.trim() ? 'הוסיפו שם לבדיקה' : !target ? 'בחרו סוכן כדי להריץ'
              : !item.rows?.some(row => row.input?.trim()) ? 'הוסיפו לפחות תרחיש אחד עם קלט' : 'מוכן להרצה'), h(
            `button:${classes.primary}`, {disabled: !ready || running, onClick: () => saveAndRun(item, target)},
            running ? 'מריץ…' : 'שמירה והרצה')))
      }
      const steps = stepsFor(resource).filter(step => step.id != 'assets' || repo.marketplace)
      const active = steps.find(step => step.id == activeId) || steps[0]
      return hh(ctx, dsls.react['react-comp'].wonderPlatformWizard, {steps, activeId: active.id, onStep: setActiveId})
    }
  })
})
