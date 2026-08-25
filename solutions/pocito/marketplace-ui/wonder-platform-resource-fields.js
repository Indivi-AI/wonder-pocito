import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-searchable-select.js'
import './wonder-platform-wizard.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformResourceFields', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh, useState}}) => ({resource, item, update, repo, openPicker, saveAndRun, runningSet}) => {
      const {classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const [historyDetail, setHistoryDetail] = useState(-1)
      const [pkg, setPkg] = useState()
      const [activeId, setActiveId] = useState('general')
      const field = (label, control) => h('label:block text-xs font-semibold text-[#2e2e2e]', {}, label, control)
      const input = (key, props = {}) => h(`input:${classes.field}`, {value: item[key] || '',
        onInput: event => update({...item, [key]: event.target.value}), ...props})
      const relation = (fieldName, target, title) => h('section:rounded-2xl border border-[#e8e8ea] p-4', {},
        h('div:flex items-center justify-between', {}, h('b:text-sm', {}, title), h(`button:${classes.button}`, {
          onClick: () => openPicker(fieldName, target, title)}, h('L:Plus', {size: 14}), 'צירוף מהקטלוג')),
        h('div:mt-3 flex flex-wrap gap-2', {}, (item[fieldName] || []).map(id => h(`span:${classes.chip} flex items-center gap-2`, {key: id},
          repo[target]?.find(value => value.id == id)?.name || id, h('button', {onClick: () => update({...item,
            [fieldName]: item[fieldName].filter(value => value != id)}), 'aria-label': 'הסרה'}, h('L:X', {size: 12}))))))
      const generalStep = () => h('div:space-y-4', {},
        field('id', input('id', {dir: 'ltr', placeholder: 'uiRenderingSkill', disabled: !!item.originalId})),
        field('description', h(`textarea:${classes.field} min-h-24 resize-y`, {dir: 'ltr', value: item.apiDescription || '',
          onInput: event => update({...item, apiDescription: event.target.value})})),
        field('hebrew_description', h(`textarea:${classes.field} min-h-24 resize-y`, {value: item.desc || '',
          onInput: event => update({...item, desc: event.target.value})})),
        repo.marketplace && item._marketplace && h('section:rounded-2xl border border-[#e8e8ea] p-4', {}, h(
          'div:flex flex-wrap items-center gap-2', {}, h('b:text-sm', {}, 'Marketplace API'), h(`span:${classes.chip}`, {},
            `${item.versions?.length || 0} גרסאות`), h(`span:${classes.chip}`, {}, `${item.audit?.length || 0} אירועי audit`)),
        (item.versions || []).length > 0 && h('div:mt-3 flex flex-wrap gap-2', {}, item.versions.map((version, index) => h(
          `span:${classes.chip}`, {key: index}, `V${version.version ?? version.n ?? index + 1}`)))))
      const stepsFor = resource => resource == 'agents' ? [
        {id: 'general', label: 'כללי', render: generalStep},
        {id: 'instructions', label: 'הנחיות', render: () => field('הנחיות', h(`textarea:${classes.field} min-h-40 resize-y`, {
          value: item.instructions || '', onInput: event => update({...item, instructions: event.target.value})}))},
        {id: 'plugins', label: 'פלאגינים', render: () => relation('pluginIds', 'plugins', 'פלאגינים')},
        {id: 'skills', label: 'מיומנויות', render: () => relation('skillIds', 'skills', 'מיומנויות')},
        {id: 'tools', label: 'כלים', render: () => relation('toolIds', 'tools', 'כלים')},
        {id: 'knowledge', label: 'ידע', render: () => relation('knowledgeIds', 'knowledge', 'ידע')}
      ] : resource == 'skills' ? [
        {id: 'general', label: 'כללי', render: generalStep},
        {id: 'content', label: 'תוכן המיומנות', render: () => field(repo.marketplace ? 'SKILL.md' : 'תוכן המיומנות', h(
          `textarea:${classes.field} min-h-40 resize-y`, {value: item.content || '',
            onInput: event => update({...item, content: event.target.value})}))},
        {id: 'assets', label: 'Assets', render: () => repo.marketplace && h('section:rounded-2xl border border-[#e8e8ea] p-4', {},
          h('div:flex items-start justify-between gap-3', {}, h('div', {}, h('b:text-sm', {}, `Assets (${(item.assets || []).length})`),
            h('p:mt-1 text-xs text-[#6b6b6f]', {}, 'Files bundled with this skill. You can adjust their path before saving.'))),
          h('label:mt-3 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-[#d8d8dc] px-4 py-5 text-center hover:bg-[#fafafa]',
            {onDragOver: event => event.preventDefault(), onDrop: event => (event.preventDefault(), addAssets(event.dataTransfer.files,
              event.currentTarget.ownerDocument.defaultView))}, h('L:Upload', {size: 20}), h('b:mt-2 text-sm', {}, 'Drop files here or browse'),
            h('span:mt-1 text-xs text-[#6b6b6f]', {}, 'Multiple files are supported'), h('input:hidden', {type: 'file', multiple: true,
              'data-skill-assets': true, onChange: event => addAssets(event.target.files, event.currentTarget.ownerDocument.defaultView)})),
          (item.assets || []).length ? h('div:mt-3 space-y-2', {}, item.assets.map((asset, index) => h(
            'div:flex min-w-0 items-center gap-3 rounded-xl border border-[#e8e8ea] p-3', {key: `${asset.path}-${index}`},
            h('L:File', {size: 18}), h('div:min-w-0 flex-1', {}, h('input:w-full min-w-0 bg-transparent text-sm font-medium outline-none', {
              dir: 'ltr', value: asset.path || '', 'aria-label': `Asset path ${index + 1}`, onInput: event => update({...item,
                assets: item.assets.map((value, row) => row == index ? {...value, path: event.target.value} : value)})}),
            h('p:mt-1 truncate text-xs text-[#6b6b6f]', {}, asset.mime_type || 'application/octet-stream')),
            h('button:rounded-lg p-2 hover:bg-[#f3f3f4]', {onClick: () => update({...item,
              assets: item.assets.filter((value, row) => row != index)}), 'aria-label': `Remove ${asset.path}`}, h('L:Trash2', {size: 14})))))
            : h('p:mt-3 text-center text-xs text-[#6b6b6f]', {}, 'No assets added yet'))},
        {id: 'tools', label: 'כלים', render: () => relation('toolIds', 'tools', 'כלים')}
      ] : resource == 'knowledge' ? [
        {id: 'general', label: 'כללי', render: generalStep},
        {id: 'files', label: 'קבצים', render: knowledgeSection}
      ] : resource == 'plugins' ? [
        {id: 'general', label: 'כללי', render: generalStep},
        {id: 'instructions', label: 'הנחיות', render: () => field('הנחיות בסיס', h(
          `textarea:${classes.field} min-h-40 resize-y`, {value: item.instructions || '',
            onInput: event => update({...item, instructions: event.target.value})}))},
        {id: 'skills', label: 'מיומנויות', render: () => relation('skillIds', 'skills', 'מיומנויות')},
        {id: 'tools', label: 'כלים', render: () => relation('toolIds', 'tools', 'כלים')},
        {id: 'knowledge', label: 'ידע', render: () => relation('knowledgeIds', 'knowledge', 'ידע')}
      ] : [
        {id: 'general', label: 'כללי', render: generalStep},
        {id: 'instructions', label: 'הנחיות בסיס', render: () => field('הנחיות בסיס', h(
          `textarea:${classes.field} min-h-40 resize-y`, {value: item.instructions || '',
            onInput: event => update({...item, instructions: event.target.value})}))},
        {id: 'skills', label: 'מיומנויות', render: () => relation('skillIds', 'skills', 'מיומנויות')},
        {id: 'tools', label: 'כלים', render: () => relation('toolIds', 'tools', 'כלים')}
      ]
      const currentPackage = pkg || repo.flowPackages.find(value => value.Id == item.packageId)
      const setCube = (index, patch) => update({...item, outputCubes: item.outputCubes.map((value, cubeIndex) =>
        cubeIndex == index ? {...value, ...patch} : value)})
      const quickParamRow = (row, index) => h('div:py-3', {key: row.Name},
        h('div:flex flex-wrap items-center justify-between gap-2', {}, h('span', {}, h('b:text-sm', {}, row.DisplayName),
          h('span:mr-2 font-mono text-xs text-[#6b6b6f]', {dir: 'ltr'}, row.Name)), h('span:text-xs text-[#6b6b6f]', {}, row.Type)),
        h('div:mt-1 flex flex-wrap gap-1.5', {}, row.IsRequired && h(`span:${classes.chip}`, {}, 'נדרש'),
          row.IsRequireAny && h(`span:${classes.chip}`, {}, 'לפחות אחד'), row.IsSingleValue && h(`span:${classes.chip}`, {}, 'ערך יחיד')),
        h('input:mt-2 w-full rounded-lg border border-[#e8e8ea] px-2 py-1 text-sm', {value: row.Description || '', placeholder: 'תיאור הפרמטר',
          onInput: event => update({...item, inputSchema: item.inputSchema.map((value, rowIndex) => rowIndex == index
            ? {...value, Description: event.target.value} : value)})}))
      const inputSchemaSection = () => h('section:rounded-2xl border border-[#e8e8ea] p-4', {},
        h('b:text-sm', {}, 'סכמת קלט — פרמטרים מהירים'),
        h('div:mt-2 divide-y divide-[#f0f0f1]', {}, (item.inputSchema || []).map(quickParamRow)))
      const cubeRow = (cube, index) => h('div:space-y-2 py-3', {key: cube.id},
        h('div:flex items-center justify-between', {}, h('span:text-sm font-semibold', {}, cube.Name),
          h('button:text-xs text-[#6b6b6f] hover:text-red-600', {onClick: () => update({...item,
            outputCubes: item.outputCubes.filter((value, cubeIndex) => cubeIndex != index)}), 'aria-label': `הסרת ${cube.Name}`}, '✕')),
        h('div:grid grid-cols-[2fr_100px] gap-2 max-sm:grid-cols-1', {},
          h('input:rounded-lg border px-2 py-1 text-sm', {value: cube.description || '', placeholder: 'מה הקובייה מחזירה',
            onInput: event => setCube(index, {description: event.target.value})}),
          h('input:rounded-lg border px-2 py-1 text-sm', {type: 'number', value: cube.markdownRows || 20, min: 0,
            onInput: event => setCube(index, {markdownRows: +event.target.value})})),
        h('div:flex flex-wrap items-center gap-3 text-xs', {}, h('label:flex items-center gap-1.5', {},
          h('input', {type: 'checkbox', checked: cube.save || false, onChange: event => setCube(index, {save: event.target.checked})}),
          'שמירה לקובץ'), cube.save && h('select:rounded-lg border px-2 py-1 text-xs', {value: cube.format || 'json',
            onChange: event => setCube(index, {format: event.target.value})}, ...['json', 'csv', 'parquet'].map(value =>
            h('option', {key: value, value}, value.toUpperCase())))))
      const outputCubesSection = () => {
        const allCubes = currentPackage?.Queries || []
        const pickCubes = ids => update({...item, outputCubes: ids.map(id => (item.outputCubes || []).find(value => value.id == id)
          || {...allCubes.find(cube => cube.id == id), description: '', markdownRows: allCubes.find(cube => cube.id == id)?.ResultsLimit || 20,
            save: false, format: 'json'})})
        return h('section:rounded-2xl border border-[#e8e8ea] p-4', {},
          h('div:flex items-center justify-between', {}, h('b:text-sm', {}, 'קוביות פלט'),
            h('span:text-xs text-[#6b6b6f]', {}, `${item.outputCubes?.length || 0} קוביות נבחרו`)),
          h('div:mt-3', {}, hh(ctx, dsls.react['react-comp'].wonderPlatformSearchableSelect, {items: allCubes.map(cube =>
            ({id: cube.id, name: cube.Name})), value: (item.outputCubes || []).map(cube => cube.id), onChange: pickCubes, multi: true,
            placeholder: 'בחר קוביות פלט'})),
          h('div:mt-2 divide-y divide-[#f0f0f1]', {}, (item.outputCubes || []).map(cubeRow)))
      }
      const removeFile = index => update({...item, files: item.files.filter((value, row) => row != index),
        deletedContentIds: item.files[index].id ? [...(item.deletedContentIds || []), item.files[index].id] : item.deletedContentIds})
      const pickedFile = (file, index) => h('li:flex items-center justify-between text-xs text-[#2e2e2e]', {key: index},
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
      const knowledgeSection = () => h('section:rounded-2xl border border-[#e8e8ea] p-4', {},
        h('div:flex items-center justify-between', {}, h('b:text-sm', {}, `קבצים (${(item.files || []).length})`),
          h(`label:${classes.button} cursor-pointer`, {}, h('L:Plus', {size: 14}), 'הוספת קבצים',
            h('input:hidden', {type: 'file', multiple: true, onChange: addFiles}))),
        (item.files || []).length > 0 ? h('ul:mt-3 space-y-1', {}, item.files.map(pickedFile))
          : h('p:mt-3 text-xs text-[#6b6b6f]', {}, 'לא נבחרו קבצים'))
      const runRow = (row, rowIndex) => {
        const fields = [['קלט', row.input], ['פלט מצופה', row.expected], ['פלט בפועל', row.actual]]
        const fieldBlock = ([title, value]) => h('div', {key: title}, h('b:text-[10px] text-[#6b6b6f]', {}, title),
          h('p:mt-1 whitespace-pre-wrap break-words', {}, value || '—'))
        return h('div:rounded-lg border border-[#e8e8ea] p-2 text-xs', {key: rowIndex},
          h('div:grid gap-2 sm:grid-cols-3', {}, fields.map(fieldBlock)),
          row.opikUrl && h('a:mt-2 inline-block text-[#0f0f10]', {href: row.opikUrl}, 'הטרייס המלא ב-Opik ↗'))
      }
      const historyRow = (run, runIndex) => {
        const targetName = repo.plugins.find(plugin => plugin.id == run.targetId)?.name
          || repo.subagents.find(agent => agent.id == run.targetId)?.name || repo.agents.find(agent => agent.id == run.targetId)?.name
        const summary = h('button:flex w-full flex-wrap items-center gap-3 text-xs', {
          onClick: () => setHistoryDetail(historyDetail == runIndex ? -1 : runIndex)},
          h('b', {}, run.started), h('span', {}, targetName), h('span', {}, `${run.completed || 0}/${run.total}`),
          h(`span:${classes.chip}`, {}, run.status))
        const detail = historyDetail == runIndex && h('div:mt-3 space-y-2', {}, (run.rows || []).map(runRow))
        return h('div:mt-3 border-t border-[#e8e8ea] pt-3', {key: run.id}, summary, detail)
      }
      const historySection = () => {
        const runs = repo.evalRuns.filter(run => run.evaluationId == item.id).sort((a, b) => b.startedAt - a.startedAt)
        return h('section:rounded-2xl border border-[#e8e8ea] p-4', {}, h('b:text-sm', {}, 'היסטוריית הרצות'),
          runs.length ? runs.map(historyRow) : h('p:mt-3 text-xs text-[#6b6b6f]', {}, 'עדיין אין הרצות'))
      }
      const scenario = (row, index) => h('article:rounded-xl border border-[#e8e8ea] bg-white p-4', {key: index}, h(
        'div:flex items-center justify-between', {}, h('b:text-sm', {}, `תרחיש ${index + 1}`), h(
          'button:rounded-lg p-1.5 text-[#6b6b6f] hover:bg-red-50 hover:text-red-600', {onClick: () => update({...item,
            rows: item.rows.filter((value, rowIndex) => rowIndex != index)}), 'aria-label': `מחיקת תרחיש ${index + 1}`}, h(
            'L:Trash2', {size: 14}))), h('div:mt-3 grid gap-3 md:grid-cols-2', {}, field('מה שולחים לסוכן?', h(
          `textarea:${classes.field} min-h-28 resize-y`, {value: row.input || '', placeholder: 'לדוגמה: סכם את מדיניות ההחזרות',
            onInput: event => update({...item, rows: item.rows.map((value, rowIndex) => rowIndex == index
              ? {...value, input: event.target.value} : value)})})), field('מהי תשובה טובה?', h(
          `textarea:${classes.field} min-h-28 resize-y`, {value: row.expected || '',
            placeholder: 'הגדירו עובדות, מבנה או תנאים שחייבים להופיע',
            onInput: event => update({...item, rows: item.rows.map((value, rowIndex) => rowIndex == index
              ? {...value, expected: event.target.value} : value)})}))), h('details:mt-3', {}, h(
        'summary:cursor-pointer text-xs text-[#6b6b6f]', {}, 'הערות פנימיות'), h(`textarea:${classes.field}`, {
          value: row.notes || '', placeholder: 'הקשר נוסף לצוות', onInput: event => update({...item,
            rows: item.rows.map((value, rowIndex) => rowIndex == index ? {...value, notes: event.target.value} : value)})})))
      const legacyTool = () => h('div:space-y-5', {},
        h('section:rounded-2xl border border-[#e8e8ea] p-4', {},
          field('description', h(`div:${classes.field} text-[#6b6b6f]`, {dir: 'ltr'}, item.apiDescription || '—')),
          field('hebrew_description', h(`div:${classes.field} text-[#6b6b6f]`, {}, item.desc || '—'))),
        h('p:text-xs leading-5 text-[#6b6b6f]', {}, 'כלי Connector מנוהל — לא ניתן לעריכה מכאן.'))
      const mockLoadPackage = () => {
        const seed = repo.flowPackages.find(value => String(value.Id) == item.id) || repo.flowPackages[0]
        setPkg(seed)
        update({...item, packageId: item.id, inputSchema: Object.values(seed.Quick || {}).flat().map(value =>
          ({...value, Description: value.Description || ''})), outputCubes: []})
      }
      const loaded = !!(item.packageId && (item.inputSchema || []).length)
      const toolSteps = [
        {id: 'general', label: 'כללי', render: () => h('div:space-y-4', {},
          h('div:flex items-end gap-2', {}, h('div:flex-1', {},
            field('id', input('id', {dir: 'ltr', placeholder: '12345678', inputMode: 'numeric'}))),
            h(`button:${classes.button}`, {onClick: mockLoadPackage}, 'טעינת מארז')),
          field('description', h(`textarea:${classes.field} min-h-24 resize-y`, {dir: 'ltr', value: item.apiDescription || '',
            onInput: event => update({...item, apiDescription: event.target.value})})),
          field('hebrew_description', h(`textarea:${classes.field} min-h-24 resize-y`, {value: item.desc || '',
            onInput: event => update({...item, desc: event.target.value})})),
          item.packageId && h('p:text-xs text-[#6b6b6f]', {dir: 'ltr'}, `נבחר: ${currentPackage?.Name || item.packageId} (#${item.packageId})`))},
        {id: 'params', label: 'פרמטרים', disabled: !loaded, render: () => h('div:space-y-4', {},
          h('div:rounded-lg border border-[#d8d8dc] bg-[#f4f4f5] px-3 py-2 text-xs text-[#0f0f10]', {},
            `נקראו ${item.inputSchema.length} פרמטרים מהירים ו-${currentPackage?.Queries?.length || 0} קוביות.`),
          inputSchemaSection())},
        {id: 'cubes', label: 'קוביות פלט', disabled: !loaded, render: outputCubesSection}
      ]
      const toolFields = () => item.originalId && item.kind != 'flow' ? legacyTool() : hh(ctx,
        dsls.react['react-comp'].wonderPlatformWizard, {steps: toolSteps, activeId, onStep: setActiveId})
      if (resource == 'tools') return toolFields()
      if (resource == 'evaluations') {
        const target = repo.agents.find(agent => agent.id == item.targetId), running = runningSet == item.id
        const ready = item.name?.trim() && target && item.rows?.some(row => row.input?.trim())
        const evalSteps = [
          {id: 'general', label: 'הגדרה', render: () => h('div:space-y-4', {}, h('section:rounded-2xl border border-[#e8e8ea] p-5', {}, h(
            'h2:text-base font-semibold', {}, 'מה רוצים לבדוק?'), h(`textarea:${classes.field} min-h-20 resize-y`, {value: item.desc || '',
              placeholder: 'תארו בקצרה את מטרת הבדיקה', onInput: event => update({...item, desc: event.target.value})})), h(
            'section:rounded-2xl border border-[#e8e8ea] p-5', {}, h('div:flex items-start gap-3', {}, h(
              'span:grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f4f4f5]', {}, h('L:Bot', {size: 17})), h(
              'div:flex-1', {}, h('h2:text-base font-semibold', {}, 'איזה סוכן בודקים?'), h(
                'p:mt-1 text-xs text-[#6b6b6f]', {}, 'כל התרחישים ירוצו מול אותו סוכן דרך Agno'), h('div:mt-3', {}, hh(
                ctx, dsls.react['react-comp'].wonderPlatformSearchableSelect, {items: repo.agents, value: item.targetId || '',
                  onChange: targetId => update({...item, targetId}), placeholder: 'בחרו סוכן', empty: 'אין סוכנים זמינים'}))))))},
          {id: 'scenarios', label: 'תרחישי בדיקה', render: () => h('div:space-y-4', {}, h(
            'section:rounded-2xl border border-[#e8e8ea] bg-[#fafafa] p-5', {}, h('div:flex items-center justify-between gap-3', {}, h(
              'div', {}, h('h2:text-base font-semibold', {}, 'תרחישי בדיקה'), h('p:mt-1 text-xs text-[#6b6b6f]', {},
                'כל תרחיש הוא שאלה אחת ותיאור של התוצאה הרצויה')), h(`button:${classes.button}`, {onClick: () => update({...item,
                rows: [...(item.rows || []), {input: '', expected: '', notes: ''}]})}, h('L:Plus', {size: 14}), 'תרחיש')), h(
              'div:mt-4 space-y-3', {}, (item.rows || []).map(scenario), !item.rows?.length && h(
                'div:rounded-xl border border-dashed border-[#d8d8dc] p-8 text-center text-sm text-[#6b6b6f]', {},
                'הוסיפו תרחיש ראשון כדי להתחיל'))))},
          {id: 'rubric', label: 'רובריקה', render: () => h('section:rounded-2xl border border-[#e8e8ea] p-5', {}, h(
            'h2:text-base font-semibold', {}, 'רובריקה'), h('p:mt-1 text-xs text-[#6b6b6f]', {},
              'הגדירו כיצד להעריך תשובה טובה בכל התרחישים'), h(`textarea:${classes.field} mt-4 min-h-24 resize-y`, {
                value: item.rubric || '', placeholder: 'לדוגמה: התשובה מדויקת, מבוססת על המקורות ומציינת פערי מידע',
                onInput: event => update({...item, rubric: event.target.value})}))},
          {id: 'history', label: 'היסטוריית הרצות', render: historySection}
        ]
        return h('div:space-y-5', {},
          hh(ctx, dsls.react['react-comp'].wonderPlatformWizard, {steps: evalSteps, activeId, onStep: setActiveId}),
          h('div:sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d8d8dc] bg-white p-4 shadow-lg', {}, h(
            'p:text-xs text-[#6b6b6f]', {}, !item.name?.trim() ? 'הוסיפו שם לבדיקה' : !target ? 'בחרו סוכן כדי להריץ'
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
