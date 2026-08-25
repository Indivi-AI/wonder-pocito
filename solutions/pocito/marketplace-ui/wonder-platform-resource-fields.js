import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'
import './wonder-platform-flapi.js'
import './wonder-platform-searchable-select.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformResourceFields', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh, useState}}) => ({resource, item, update, repo, openPicker, saveAndRun, runningSet}) => {
      const {classes} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx)
      const [cubeQuery, setCubeQuery] = useState('')
      const [historyDetail, setHistoryDetail] = useState(-1)
      const [packageQuery, setPackageQuery] = useState(''), [packageResults, setPackageResults] = useState([])
      const [pkg, setPkg] = useState()
      const field = (label, control) => h('label:block text-xs font-semibold text-[#2e2e2e]', {}, label, control)
      const input = (key, props = {}) => h(`input:${classes.field}`, {value: item[key] || '',
        onInput: event => update({...item, [key]: event.target.value}), ...props})
      const relation = (fieldName, target, title) => h('section:rounded-2xl border border-[#e8e8ea] p-4', {},
        h('div:flex items-center justify-between', {}, h('b:text-sm', {}, title), h(`button:${classes.button}`, {
          onClick: () => openPicker(fieldName, target, title)}, h('L:Plus', {size: 14}), 'צירוף מהקטלוג')),
        h('div:mt-3 flex flex-wrap gap-2', {}, (item[fieldName] || []).map(id => h(`span:${classes.chip} flex items-center gap-2`, {key: id},
          repo[target]?.find(value => value.id == id)?.name || id, h('button', {onClick: () => update({...item,
            [fieldName]: item[fieldName].filter(value => value != id)}), 'aria-label': 'הסרה'}, h('L:X', {size: 12}))))))
      const flapiBaseUrl = ctx.vars.flapiBaseUrl
      const flapiCall = (operation, vars) => dsls.common.data.wonderPlatformFlapiCall.$runWithCtx(ctx, {operation, flapiBaseUrl, ...vars})
      const currentPackage = pkg || repo.flowPackages.find(value => value.Id == item.packageId)
      const searchPackages = async query => { setPackageQuery(query); setPackageResults(query.trim() ? (flapiBaseUrl
        ? await flapiCall('search', {partial: query}) : repo.flowPackages.filter(value => value.Name.includes(query))) : []) }
      const pickPackage = result => (update({...item, packageId: String(result.Id)}), setPkg(), setPackageQuery(''), setPackageResults([]))
      const pickPackageResult = result => h('button:block w-full px-3 py-2 text-right text-xs hover:bg-gray-50', {key: result.Id,
        onClick: () => pickPackage(result)}, result.Name)
      const readPackage = async () => {
        const [quick, metadata] = flapiBaseUrl
          ? await Promise.all([flapiCall('quick', {packageId: item.packageId}), flapiCall('metadata', {packageId: item.packageId})])
          : [currentPackage?.Quick, currentPackage]
        setPkg(metadata)
        update({...item, name: item.name || metadata?.Name || '', desc: item.desc || metadata?.Description || '',
          inputSchema: Object.values(quick || {}).flat().map(value => ({...value, Description: value.Description || ''})), outputCubes: []})
      }
      const packageStep = () => h('div:space-y-2', {},
        field('חיפוש מארז Flow', h('div:relative', {}, h(`input:${classes.field}`, {value: packageQuery, placeholder: 'חיפוש מארז...',
          onInput: event => searchPackages(event.target.value)}), packageResults.length > 0 && h(
          'div:absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-[#e8e8ea] bg-white shadow-lg', {},
          packageResults.map(pickPackageResult)))),
        h('div:grid grid-cols-[1fr_auto] items-end gap-2 max-sm:grid-cols-1', {},
          field('מזהה מארז נבחר', h(`div:${classes.field} text-[#6b6b6f]`, {dir: 'ltr'}, item.packageId || '—')),
          h(`button:${classes.button}`, {disabled: !item.packageId, onClick: readPackage}, 'קריאת המארז')))
      const setCube = (index, patch) => update({...item, outputCubes: item.outputCubes.map((value, cubeIndex) =>
        cubeIndex == index ? {...value, ...patch} : value)})
      const quickParamRow = (row, index) => h('div:mt-3 rounded-lg border border-[#e8e8ea] p-2', {key: row.Name},
        h('div:flex flex-wrap items-center justify-between gap-2', {}, h('span', {}, h('b:text-sm', {}, row.DisplayName),
          h('span:mr-2 font-mono text-xs text-[#6b6b6f]', {dir: 'ltr'}, row.Name)), h('span:text-xs text-[#6b6b6f]', {}, row.Type)),
        h('div:mt-1 flex flex-wrap gap-1.5', {}, row.IsRequired && h(`span:${classes.chip}`, {}, 'נדרש'),
          row.IsRequireAny && h(`span:${classes.chip}`, {}, 'לפחות אחד'), row.IsSingleValue && h(`span:${classes.chip}`, {}, 'ערך יחיד')),
        h('input:mt-2 w-full rounded-lg border border-[#e8e8ea] px-2 py-1 text-sm', {value: row.Description || '', placeholder: 'תיאור הפרמטר',
          onInput: event => update({...item, inputSchema: item.inputSchema.map((value, rowIndex) => rowIndex == index
            ? {...value, Description: event.target.value} : value)})}))
      const inputSchemaSection = () => h('section:rounded-2xl border border-[#e8e8ea] p-4', {},
        h('b:text-sm', {}, 'סכמת קלט — פרמטרים מהירים'), (item.inputSchema || []).map(quickParamRow))
      const pickCubeResult = cube => h(`button:${classes.chip}`, {key: cube.id, onClick: () => update({...item,
        outputCubes: [...(item.outputCubes || []), {...cube, description: '', markdownRows: cube.ResultsLimit || 20,
          save: false, format: 'json'}]})}, `+ ${cube.Name}`)
      const cubeRow = (cube, index) => h('div:mt-3 space-y-2 rounded-lg border border-[#e8e8ea] p-2', {key: cube.id},
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
        const available = allCubes.filter(cube => !item.outputCubes?.some(value => value.id == cube.id)
          && (!cubeQuery.trim() || cube.Name.includes(cubeQuery)))
        return h('section:rounded-2xl border border-[#e8e8ea] p-4', {},
          h('div:flex items-center justify-between', {}, h('b:text-sm', {}, 'קוביות פלט'),
            h('span:text-xs text-[#6b6b6f]', {}, `${item.outputCubes?.length || 0} קוביות נבחרו`)),
          h('div:mt-3 space-y-2', {},
            h('input:rounded-lg border border-[#e8e8ea] px-2 py-1.5 text-sm', {value: cubeQuery,
              placeholder: `חיפוש קובייה להוספה מתוך ${allCubes.length}…`, onInput: event => setCubeQuery(event.target.value)}),
            h('div:flex flex-wrap gap-2', {}, available.length ? available.map(pickCubeResult) : h('span:text-xs text-[#6b6b6f]', {},
              cubeQuery.trim() ? 'אין קוביות נוספות תואמות לחיפוש' : 'כל הקוביות נבחרו'))),
          (item.outputCubes || []).map(cubeRow))
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
      if (resource == 'evaluations') {
        const target = repo.agents.find(agent => agent.id == item.targetId), running = runningSet == item.id
        const ready = item.name?.trim() && target && item.rows?.some(row => row.input?.trim())
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
        return h('div:space-y-5', {}, h('section:rounded-2xl border border-[#e8e8ea] p-5', {}, h(
          'h2:text-base font-semibold', {}, 'מה רוצים לבדוק?'), h(`textarea:${classes.field} min-h-20 resize-y`, {value: item.desc || '',
            placeholder: 'תארו בקצרה את מטרת הבדיקה', onInput: event => update({...item, desc: event.target.value})})), h(
          'section:rounded-2xl border border-[#e8e8ea] p-5', {}, h('div:flex items-start gap-3', {}, h(
            'span:grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f4f4f5]', {}, h('L:Bot', {size: 17})), h(
            'div:flex-1', {}, h('h2:text-base font-semibold', {}, 'איזה סוכן בודקים?'), h(
              'p:mt-1 text-xs text-[#6b6b6f]', {}, 'כל התרחישים ירוצו מול אותו סוכן דרך Agno'), h('div:mt-3', {}, hh(
              ctx, dsls.react['react-comp'].wonderPlatformSearchableSelect, {items: repo.agents, value: item.targetId || '',
                onChange: targetId => update({...item, targetId}), placeholder: 'בחרו סוכן', empty: 'אין סוכנים זמינים'}))))), h(
          'section:rounded-2xl border border-[#e8e8ea] bg-[#fafafa] p-5', {}, h('div:flex items-center justify-between gap-3', {}, h(
            'div', {}, h('h2:text-base font-semibold', {}, 'תרחישי בדיקה'), h('p:mt-1 text-xs text-[#6b6b6f]', {},
              'כל תרחיש הוא שאלה אחת ותיאור של התוצאה הרצויה')), h(`button:${classes.button}`, {onClick: () => update({...item,
              rows: [...(item.rows || []), {input: '', expected: '', notes: ''}]})}, h('L:Plus', {size: 14}), 'תרחיש')), h(
            'div:mt-4 space-y-3', {}, (item.rows || []).map(scenario), !item.rows?.length && h(
              'div:rounded-xl border border-dashed border-[#d8d8dc] p-8 text-center text-sm text-[#6b6b6f]', {},
              'הוסיפו תרחיש ראשון כדי להתחיל'))), h('section:rounded-2xl border border-[#e8e8ea] p-5', {}, h(
            'h2:text-base font-semibold', {}, 'רובריקה'), h('p:mt-1 text-xs text-[#6b6b6f]', {},
              'הגדירו כיצד להעריך תשובה טובה בכל התרחישים'), h(`textarea:${classes.field} mt-4 min-h-24 resize-y`, {
                value: item.rubric || '', placeholder: 'לדוגמה: התשובה מדויקת, מבוססת על המקורות ומציינת פערי מידע',
                onInput: event => update({...item, rubric: event.target.value})})), historySection(), h(
          'div:sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d8d8dc] bg-white p-4 shadow-lg', {}, h(
            'p:text-xs text-[#6b6b6f]', {}, !item.name?.trim() ? 'הוסיפו שם לבדיקה' : !target ? 'בחרו סוכן כדי להריץ'
              : !item.rows?.some(row => row.input?.trim()) ? 'הוסיפו לפחות תרחיש אחד עם קלט' : 'מוכן להרצה'), h(
            `button:${classes.primary}`, {disabled: !ready || running, onClick: () => saveAndRun(item, target)},
            running ? 'מריץ…' : 'שמירה והרצה')))
      }
      return h('div:space-y-5', {}, resource == 'tools' && !repo.marketplace && packageStep(),
      resource == 'tools' && !repo.marketplace && item.packageId && (item.inputSchema || []).length > 0 && h(
        'div:rounded-lg border border-[#d8d8dc] bg-[#f4f4f5] px-3 py-2 text-xs text-[#0f0f10]', {},
        `נקראו ${item.inputSchema.length} פרמטרים מהירים ו-${currentPackage?.Queries?.length || 0} קוביות.`),
      field('display_name', input('name', {placeholder: 'שם להצגה'})),
      field('id', input('id', {dir: 'ltr', placeholder: 'uiRenderingSkill', disabled: !!item.originalId})),
      field('description', h(`textarea:${classes.field} min-h-24 resize-y`, {dir: 'ltr', value: item.apiDescription || '',
        onInput: event => update({...item, apiDescription: event.target.value})})), field('hebrew_description', h(
        `textarea:${classes.field} min-h-24 resize-y`, {value: item.desc || '', onInput: event => update({...item, desc: event.target.value})})),
      resource == 'knowledge' && knowledgeSection(),
      ['plugins', 'skills', 'subagents'].includes(resource) &&
        field(resource == 'skills' ? repo.marketplace ? 'SKILL.md' : 'תוכן המיומנות' : 'הנחיות בסיס', h(
          `textarea:${classes.field} min-h-40 resize-y`, {
          value: resource == 'skills' ? item.content || '' : item.instructions || '',
          onInput: event => update({...item, [resource == 'skills' ? 'content' : 'instructions']: event.target.value})})),
      resource == 'skills' && !repo.marketplace && h('div:grid grid-cols-1 gap-3 sm:grid-cols-2', {},
        field('גרסה נוכחית', h(`div:${classes.field} text-[#6b6b6f]`, {}, item.originalId ? item.version : 'טרם פורסם')),
        field('גרסה חדשה', input('publishVersion', {dir: 'ltr', placeholder: '1.0.0'})),
        h('p:col-span-full text-xs leading-5 text-[#6b6b6f]', {},
          'השמירה מפרסמת release חדש. גרסאות ותוכן שכבר פורסמו נשארים בלתי משתנים.')),
      resource == 'skills' && repo.marketplace && h('div:grid grid-cols-1 gap-3 sm:grid-cols-2', {},
        field('min_agent_version', input('minAgentVersion', {dir: 'ltr'})), field('license', input('license', {dir: 'ltr'}))),
      resource == 'skills' && repo.marketplace && h('section:rounded-2xl border border-[#e8e8ea] p-4', {}, h(
        'div:flex items-center justify-between', {}, h('b:text-sm', {}, 'Assets'), h(`button:${classes.button}`, {
          onClick: () => update({...item, assets: [...(item.assets || []), {path: '', content_b64: '', mime_type: ''}]})},
        h('L:Plus', {size: 14}), 'Asset')), (item.assets || []).map((asset, index) => h(
          'div:mt-3 grid grid-cols-[1fr_1fr_1fr_32px] gap-2 max-sm:grid-cols-1', {key: index}, ...[
            ['path', 'path'], ['content_b64', 'base64'], ['mime_type', 'mime type']].map(([key, placeholder]) => h(
              'input:min-w-0 rounded-lg border p-2 text-xs', {key, dir: 'ltr', value: asset[key] || '', placeholder,
                onInput: event => update({...item, assets: item.assets.map((value, row) => row == index
                  ? {...value, [key]: event.target.value} : value)})})), h('button', {onClick: () => update({...item,
            assets: item.assets.filter((value, row) => row != index)}), 'aria-label': 'מחיקת asset'}, h('L:Trash2', {size: 14}))))),
      resource == 'skills' && relation('toolIds', 'tools', 'כלים'), resource == 'subagents' && h('div:space-y-4', {},
        relation('skillIds', 'skills', 'מיומנויות'), relation('toolIds', 'tools', 'כלים')), resource == 'tools' && repo.marketplace && h(
      'div:space-y-5', {}, h('section:rounded-2xl border border-[#e8e8ea] p-4', {}, h('div:grid grid-cols-1 gap-3 sm:grid-cols-3', {},
        field('tool_type', h(`select:${classes.field}`, {value: item.toolType || 'code', onChange: event => update({...item,
          toolType: event.target.value})}, ...['code', 'flow_package', 'flow_cube', 'solr', 'kick_graphql'].map(value => h(
            'option', {key: value, value}, value)))), field('is_async', h('input:mt-4 h-5 w-5', {type: 'checkbox', checked: item.isAsync ?? true,
              onChange: event => update({...item, isAsync: event.target.checked})})), field('tracable', h('input:mt-4 h-5 w-5', {
                type: 'checkbox', checked: item.tracable ?? true, onChange: event => update({...item, tracable: event.target.checked})}))),
        field('json_schema', h(`textarea:${classes.field} min-h-32 font-mono text-xs`, {dir: 'ltr',
          defaultValue: JSON.stringify(item.jsonSchema || {}, null, 2), onBlur: event => update({...item,
            jsonSchema: JSON.parse(event.target.value)})})), field('dedicated_tool_config', h(
          `textarea:${classes.field} min-h-32 font-mono text-xs`, {dir: 'ltr', defaultValue: JSON.stringify(item.dedicatedToolConfig || {}, null, 2),
            onBlur: event => update({...item, dedicatedToolConfig: JSON.parse(event.target.value)})})),
        h('p:text-xs leading-5 text-[#6b6b6f]', {}, 'json_schema מגדיר את פרמטרי הקלט של הכלי (JSON Schema). ' +
          'dedicated_tool_config הוא תצורת הרצה ייעודית לכלי זה, בפורמט JSON חופשי.'))),
      resource == 'tools' && repo.marketplace && h('section:rounded-2xl border border-[#e8e8ea] p-4', {}, h('div:flex items-center justify-between', {},
        h('b:text-sm', {}, 'Code files'), h(`button:${classes.button}`, {onClick: () => update({...item,
          codeFiles: [...(item.codeFiles || []), {path: '', content: ''}]})}, h('L:Plus', {size: 14}), 'קובץ')), (item.codeFiles || []).map(
        (file, index) => h('div:mt-3 grid grid-cols-[1fr_2fr_32px] gap-2 max-sm:grid-cols-1', {key: index}, h(
          'input:min-w-0 rounded-lg border p-2 font-mono text-xs', {dir: 'ltr', value: file.path, placeholder: 'path',
            onInput: event => update({...item, codeFiles: item.codeFiles.map((value, row) => row == index
              ? {...value, path: event.target.value} : value)})}), h('textarea:min-h-24 min-w-0 rounded-lg border p-2 font-mono text-xs', {
            dir: 'ltr', value: file.content, placeholder: 'content', onInput: event => update({...item,
              codeFiles: item.codeFiles.map((value, row) => row == index ? {...value, content: event.target.value} : value)})}), h(
            'button', {onClick: () => update({...item, codeFiles: item.codeFiles.filter((value, row) => row != index)}),
              'aria-label': 'מחיקת קובץ'}, h('L:Trash2', {size: 14}))))), resource == 'tools' && !repo.marketplace && h(
        'div:space-y-5', {}, inputSchemaSection(), outputCubesSection()),
      repo.marketplace && item._marketplace && h('section:rounded-2xl border border-[#e8e8ea] p-4', {}, h(
        'div:flex flex-wrap items-center gap-2', {}, h('b:text-sm', {}, 'Marketplace API'), h(`span:${classes.chip}`, {},
          `${item.versions?.length || 0} גרסאות`), h(`span:${classes.chip}`, {}, `${item.audit?.length || 0} אירועי audit`)),
      (item.versions || []).length > 0 && h('div:mt-3 flex flex-wrap gap-2', {}, item.versions.map((version, index) => h(
        `span:${classes.chip}`, {key: index}, `V${version.version ?? version.n ?? index + 1}`)))))
    }
  })
})
