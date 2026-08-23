import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform-domain.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wonderPlatformAttachPicker', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({picker, repo, setPicker, attachSelected, createNested}) => picker && h(
      'div:fixed inset-0 z-[90] grid place-items-center bg-black/35 p-4', {}, h(
        'section:max-h-[78vh] w-full max-w-xl overflow-hidden rounded-2xl border border-[#dfe5e1] bg-white shadow-2xl', {},
        h('div:flex items-center gap-3 border-b border-[#e5e9e7] p-4', {}, h('L:Search', {size: 16, className: 'text-[#8c9690]'}),
          h('input:flex-1 text-sm outline-none', {value: picker.query || '', placeholder: `חיפוש ${picker.label}…`,
            onInput: event => setPicker({...picker, query: event.target.value})}), h('button:text-xs text-[#9aa19d]', {
            onClick: () => setPicker(), 'aria-label': 'סגירה'}, 'esc')),
        h('div:max-h-[58vh] overflow-y-auto p-3', {}, h('button:mb-2 flex w-full items-center justify-between rounded-xl border border-dashed ' +
          'border-[#b7cbbf] px-4 py-3 text-sm font-semibold text-[#315e46]', {onClick: () => createNested(picker.resource)},
        picker.resource == 'tools' ? 'כלי חדש ממארז Flow' : `${picker.single} חדשה`, h('L:Plus', {size: 15})),
        (repo[picker.resource] || []).filter(item => !picker.query || `${item.name} ${item.desc}`.includes(picker.query)).map(item => {
          const selected = picker.selected.includes(item.id)
          return h(`button:mb-2 flex w-full items-start gap-3 rounded-xl border p-3 text-right ${selected
            ? 'border-[#b8d3c2] bg-[#edf6f0]' : 'border-[#e7ebe8] bg-white'}`, {key: item.id,
            onClick: () => setPicker({...picker, selected: selected ? picker.selected.filter(id => id != item.id) : [...picker.selected, item.id]})},
          h(`span:mt-1 h-4 w-4 rounded border ${selected ? 'border-[#2f6b4b] bg-[#2f6b4b]' : 'border-[#cfd7d2]'}`, {},
            selected && h('L:Check', {size: 14, className: 'text-white'})), h('span:min-w-0 flex-1', {}, h('b:block text-sm', {}, item.name),
            h('small:mt-1 block text-[#8b948f]', {}, item.desc)), item.managed && h('span:text-[10px] text-[#8b948f]', {}, 'מנוהל'))
        })), h('div:flex items-center justify-between border-t border-[#e5e9e7] bg-[#f8f9f8] p-4', {},
          h('span:text-xs text-[#9aa19d]', {}, 'בחירה מרובה'), h('div:flex gap-2', {}, h('button:rounded-xl px-4 py-2 text-sm', {
            onClick: () => setPicker()}, 'ביטול'), h('button:rounded-xl bg-[#2f6b4b] px-4 py-2 text-sm font-semibold text-white', {
            onClick: attachSelected}, `צירוף ${picker.label}`)))))
  })
})

ReactComp('wonderPlatformResourceEditor', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({editors, setEditors, repo, saveEditor, deleteEditor, openPicker}) => {
      const {classes, labels} = dsls.common.data.wonderPlatformUi.$runWithCtx(ctx), active = editors.at(-1)
      if (!active) return null
      const {resource, item} = active, update = value => setEditors(editors.map((entry, index) => index == editors.length - 1
        ? {...entry, item: typeof value == 'function' ? value(entry.item) : value} : entry))
      const field = (label, control) => h('label:block text-xs font-semibold text-[#69726d]', {}, label, control)
      const input = (key, props = {}) => h(`input:${classes.field}`, {value: item[key] || '',
        onInput: event => update({...item, [key]: event.target.value}), ...props})
      const relation = (fieldName, target, title) => h('section:rounded-2xl border border-[#e2e7e4] p-4', {},
        h('div:flex items-center justify-between', {}, h('b:text-sm', {}, title), h(`button:${classes.button}`, {
          onClick: () => openPicker(fieldName, target, title)}, h('L:Plus', {size: 14}), 'צירוף מהקטלוג')),
        h('div:mt-3 flex flex-wrap gap-2', {}, (item[fieldName] || []).map(id => h(`span:${classes.chip} flex items-center gap-2`, {key: id},
          repo[target]?.find(value => value.id == id)?.name || id, h('button', {onClick: () => update({...item,
            [fieldName]: item[fieldName].filter(value => value != id)}), 'aria-label': 'הסרה'}, h('L:X', {size: 12}))))))
      const readPackage = () => {
        const pkg = repo.flowPackages.find(value => value.id == item.packageId)
        if (pkg) update({...item, name: item.name || pkg.name, desc: item.desc || pkg.desc,
          inputSchema: pkg.inputSchema.map(value => ({...value, description: value.description || ''})), outputCubes: []})
      }
      return h('div:fixed inset-0 z-[80] bg-black/25', {}, h('section:absolute inset-y-0 left-0 w-full max-w-3xl overflow-y-auto bg-white shadow-2xl', {
        dir: 'rtl'}, h('div:sticky top-0 z-10 border-b border-[#e5e9e7] bg-white p-5', {}, h('div:flex flex-wrap gap-2 text-xs text-[#789083]', {},
        editors.map((entry, index) => h('button', {key: index, onClick: () => setEditors(editors.slice(0, index + 1))},
          `${labels[entry.resource] || 'סט'} · ${entry.item.name || 'חדש'}`))), h('div:mt-3 flex items-center justify-between gap-4', {}, h('div', {},
        h('h2:text-xl font-bold', {}, item.name || active.createLabel), h('span:text-xs text-[#9aa19d]', {}, labels[resource])),
      h('button:rounded-lg p-2 hover:bg-gray-100', {onClick: () => setEditors(editors.slice(0, -1)), 'aria-label': 'סגירה'}, h('L:X')))),
      h('div:space-y-5 p-6', {}, resource == 'tools' && !repo.marketplace && h(
        'div:grid grid-cols-[1fr_auto] items-end gap-2 max-sm:grid-cols-1', {},
        field('מזהה מארז Flow', input('packageId', {dir: 'ltr', placeholder: '4821037'})), h(`button:${classes.button}`, {
          onClick: readPackage}, 'קריאת המארז')), field('hebrew_display_name', input('name', {placeholder: 'שם בעברית'})),
      field('display_name', input('id', {dir: 'ltr', placeholder: 'unique-id', disabled: !!item.originalId})),
      field('description', h(`textarea:${classes.field} min-h-24 resize-y`, {dir: 'ltr', value: item.apiDescription || '',
        onInput: event => update({...item, apiDescription: event.target.value})})), field('hebrew_description', h(
        `textarea:${classes.field} min-h-24 resize-y`, {value: item.desc || '', onInput: event => update({...item, desc: event.target.value})})),
      repo.marketplace && resource != 'tools' && h('section:rounded-2xl border border-[#e2e7e4] p-4', {}, h('div:flex items-center justify-between', {},
        h('b:text-sm', {}, 'Tags'), h(`button:${classes.button}`, {onClick: () => update({...item,
          tags: [...(item.tags || []), {tag_type: '', tag_name: ''}]})}, h('L:Plus', {size: 14}), 'Tag')), (item.tags || []).map((tag, index) => h(
        'div:mt-3 grid grid-cols-[1fr_1fr_32px] gap-2', {key: index}, h('input:min-w-0 rounded-lg border p-2 font-mono text-xs', {
          dir: 'ltr', value: tag.tag_type, placeholder: 'tag_type', onInput: event => update({...item, tags: item.tags.map((value, row) =>
            row == index ? {...value, tag_type: event.target.value} : value)})}), h('input:min-w-0 rounded-lg border p-2 text-xs', {
          value: tag.tag_name, placeholder: 'tag_name', onInput: event => update({...item, tags: item.tags.map((value, row) => row == index
            ? {...value, tag_name: event.target.value} : value)})}), h('button', {onClick: () => update({...item,
          tags: item.tags.filter((value, row) => row != index)}), 'aria-label': 'מחיקת תגית'}, h('L:Trash2', {size: 14}))))),
      ['plugins', 'skills', 'subagents'].includes(resource) &&
        field(resource == 'skills' ? repo.marketplace ? 'SKILL.md' : 'תוכן המיומנות' : 'הנחיות בסיס', h(
          `textarea:${classes.field} min-h-40 resize-y`, {
          value: resource == 'skills' ? item.content || '' : item.instructions || '',
          onInput: event => update({...item, [resource == 'skills' ? 'content' : 'instructions']: event.target.value})})),
      resource == 'skills' && !repo.marketplace && h('div:grid grid-cols-1 gap-3 sm:grid-cols-2', {},
        field('גרסה נוכחית', h(`div:${classes.field} text-[#7d8781]`, {}, item.originalId ? item.version : 'טרם פורסם')),
        field('גרסה חדשה', input('publishVersion', {dir: 'ltr', placeholder: '1.0.0'})),
        h('p:col-span-full text-xs leading-5 text-[#8b948f]', {},
          'השמירה מפרסמת release חדש. גרסאות ותוכן שכבר פורסמו נשארים בלתי משתנים.')),
      resource == 'skills' && repo.marketplace && h('div:grid grid-cols-1 gap-3 sm:grid-cols-2', {},
        field('min_agent_version', input('minAgentVersion', {dir: 'ltr'})), field('license', input('license', {dir: 'ltr'}))),
      resource == 'skills' && repo.marketplace && h('section:rounded-2xl border border-[#e2e7e4] p-4', {}, h(
        'div:flex items-center justify-between', {}, h('b:text-sm', {}, 'Assets'), h(`button:${classes.button}`, {
          onClick: () => update({...item, assets: [...(item.assets || []), {path: '', content_b64: '', mime_type: ''}]})},
        h('L:Plus', {size: 14}), 'Asset')), (item.assets || []).map((asset, index) => h(
          'div:mt-3 grid grid-cols-[1fr_1fr_1fr_32px] gap-2 max-sm:grid-cols-1', {key: index}, ...[
            ['path', 'path'], ['content_b64', 'base64'], ['mime_type', 'mime type']].map(([key, placeholder]) => h(
              'input:min-w-0 rounded-lg border p-2 text-xs', {key, dir: 'ltr', value: asset[key] || '', placeholder,
                onInput: event => update({...item, assets: item.assets.map((value, row) => row == index
                  ? {...value, [key]: event.target.value} : value)})})), h('button', {onClick: () => update({...item,
            assets: item.assets.filter((value, row) => row != index)}), 'aria-label': 'מחיקת asset'}, h('L:Trash2', {size: 14}))))),
      resource == 'skills' && !repo.marketplace && relation('toolIds', 'tools', 'כלים'), resource == 'subagents' && h('div:space-y-4', {},
        relation('skillIds', 'skills', 'מיומנויות'), relation('toolIds', 'tools', 'כלים')), resource == 'tools' && repo.marketplace && h(
      'div:space-y-5', {}, h('section:rounded-2xl border border-[#e2e7e4] p-4', {}, h('div:grid grid-cols-1 gap-3 sm:grid-cols-3', {},
        field('tool_type', h(`select:${classes.field}`, {value: item.toolType || 'code', onChange: event => update({...item,
          toolType: event.target.value})}, ...['code', 'flow_package', 'flow_cube', 'solr', 'kick_graphql'].map(value => h(
            'option', {key: value, value}, value)))), field('is_async', h('input:mt-4 h-5 w-5', {type: 'checkbox', checked: item.isAsync ?? true,
              onChange: event => update({...item, isAsync: event.target.checked})})), field('tracable', h('input:mt-4 h-5 w-5', {
                type: 'checkbox', checked: item.tracable ?? true, onChange: event => update({...item, tracable: event.target.checked})}))),
        field('json_schema', h(`textarea:${classes.field} min-h-32 font-mono text-xs`, {dir: 'ltr',
          defaultValue: JSON.stringify(item.jsonSchema || {}, null, 2), onBlur: event => update({...item,
            jsonSchema: JSON.parse(event.target.value)})})), field('dedicated_tool_config', h(
          `textarea:${classes.field} min-h-32 font-mono text-xs`, {dir: 'ltr', defaultValue: JSON.stringify(item.dedicatedToolConfig || {}, null, 2),
            onBlur: event => update({...item, dedicatedToolConfig: JSON.parse(event.target.value)})})))),
      h('section:rounded-2xl border border-[#e2e7e4] p-4', {}, h('div:flex items-center justify-between', {},
        h('b:text-sm', {}, 'Code files'), h(`button:${classes.button}`, {onClick: () => update({...item,
          codeFiles: [...(item.codeFiles || []), {path: '', content: ''}]})}, h('L:Plus', {size: 14}), 'קובץ')), (item.codeFiles || []).map(
        (file, index) => h('div:mt-3 grid grid-cols-[1fr_2fr_32px] gap-2 max-sm:grid-cols-1', {key: index}, h(
          'input:min-w-0 rounded-lg border p-2 font-mono text-xs', {dir: 'ltr', value: file.path, placeholder: 'path',
            onInput: event => update({...item, codeFiles: item.codeFiles.map((value, row) => row == index
              ? {...value, path: event.target.value} : value)})}), h('textarea:min-h-24 min-w-0 rounded-lg border p-2 font-mono text-xs', {
            dir: 'ltr', value: file.content, placeholder: 'content', onInput: event => update({...item,
              codeFiles: item.codeFiles.map((value, row) => row == index ? {...value, content: event.target.value} : value)})}), h(
            'button', {onClick: () => update({...item, codeFiles: item.codeFiles.filter((value, row) => row != index)}),
              'aria-label': 'מחיקת קובץ'}, h('L:Trash2', {size: 14})))))), resource == 'tools' && !repo.marketplace && h(
        'div:space-y-5', {}, h('section:rounded-2xl border border-[#e2e7e4] p-4', {}, h('b:text-sm', {}, 'סכמת קלט — פרמטרים מהירים'),
          (item.inputSchema || []).map((row, index) => h('div:mt-3 grid grid-cols-[1fr_100px_2fr] gap-2 max-sm:grid-cols-1', {key: row.id},
            h('span:text-xs', {dir: 'ltr'}, row.id), h('span:text-xs', {}, row.type), h('input:rounded-lg border border-[#e2e7e4] px-2 py-1 text-sm', {
              value: row.description || '', onInput: event => update({...item, inputSchema: item.inputSchema.map((value, rowIndex) => rowIndex == index
                ? {...value, description: event.target.value} : value)})})))), h('section:rounded-2xl border border-[#e2e7e4] p-4', {},
          h('b:text-sm', {}, 'קוביות פלט'), h('div:mt-3 flex flex-wrap gap-2', {}, (repo.flowPackages.find(value => value.id == item.packageId)?.cubes || [])
            .map(cube => {
              const selected = item.outputCubes?.some(value => value.id == cube.id)
              return h(`button:${classes.chip} ${selected ? 'border-[#6f9a7f] bg-[#e7f1eb]' : ''}`, {key: cube.id,
                onClick: () => update({...item, outputCubes: selected ? item.outputCubes.filter(value => value.id != cube.id)
                  : [...(item.outputCubes || []), {...cube, description: '', markdownRows: 20}]})}, cube.title)
            })), (item.outputCubes || []).map((cube, index) => h('div:mt-3 grid grid-cols-[1fr_2fr_100px] gap-2 max-sm:grid-cols-1', {key: cube.id},
            h('span:text-sm', {}, cube.title), h('input:rounded-lg border px-2 py-1 text-sm', {value: cube.description || '',
              placeholder: 'מה הקובייה מחזירה', onInput: event => update({...item, outputCubes: item.outputCubes.map((value, cubeIndex) => cubeIndex == index
                ? {...value, description: event.target.value} : value)})}), h('input:rounded-lg border px-2 py-1 text-sm', {type: 'number',
              value: cube.markdownRows || 20, min: 0, onInput: event => update({...item, outputCubes: item.outputCubes.map((value, cubeIndex) =>
                cubeIndex == index ? {...value, markdownRows: +event.target.value} : value)})}))))),
      repo.marketplace && item._marketplace && h('section:rounded-2xl border border-[#e2e7e4] p-4', {}, h(
        'div:flex flex-wrap items-center gap-2', {}, h('b:text-sm', {}, 'Marketplace API'), h(`span:${classes.chip}`, {},
          `${item.versions?.length || 0} גרסאות`), h(`span:${classes.chip}`, {}, `${item.audit?.length || 0} אירועי audit`)),
      (item.versions || []).length > 0 && h('div:mt-3 flex flex-wrap gap-2', {}, item.versions.map((version, index) => h(
        `span:${classes.chip}`, {key: index}, `V${version.version ?? version.n ?? index + 1}`)))),
      resource == 'evaluations' && h('div:space-y-4', {}, field('מדרג לשופט (נשמר לשימוש עתידי — הסטודיו אינו שופט)',
        h(`textarea:${classes.field} min-h-24`, {value: item.rubric || '', onInput: event => update({...item, rubric: event.target.value})})),
      h('section:rounded-2xl border border-[#e2e7e4] p-4', {}, h('div:flex items-center justify-between', {}, h('b:text-sm', {}, 'רשומות הסט'),
        h(`button:${classes.button}`, {onClick: () => update({...item, rows: [...(item.rows || []), {input: '', expected: '', notes: ''}]})},
          h('L:Plus', {size: 14}), 'רשומה')), (item.rows || []).map((row, index) => h(
        'div:mt-3 grid grid-cols-[28px_1fr_1fr_1fr_28px] gap-2 max-sm:grid-cols-1', {key: index},
        h('span:text-xs text-[#9aa19d]', {}, String(index + 1).padStart(2, '0')), ...['input', 'expected', 'notes'].map(key => h(
          'textarea:min-h-20 rounded-lg border border-[#e2e7e4] p-2 text-sm', {key, value: row[key] || '',
            placeholder: {input: 'קלט לדוגמה', expected: 'מה מצופה שיחזור', notes: 'הערות'}[key],
            onInput: event => update({...item, rows: item.rows.map((value, rowIndex) => rowIndex == index
              ? {...value, [key]: event.target.value} : value)})})), h('button', {onClick: () => update({...item,
          rows: item.rows.filter((value, rowIndex) => rowIndex != index)}), 'aria-label': 'מחיקת רשומה'}, h('L:Trash2', {size: 14}))))),
      h('section:rounded-2xl border border-[#e2e7e4] p-4', {}, h('b:text-sm', {}, 'היסטוריית הרצות'),
        repo.evalRuns.filter(run => run.evaluationId == item.id).sort((a, b) => b.startedAt - a.startedAt).map(run => h(
          'div:mt-3 flex flex-wrap items-center gap-3 border-t border-[#edf0ee] pt-3 text-xs', {key: run.id}, h('b', {}, run.started),
          h('span', {}, repo.plugins.find(plugin => plugin.id == run.targetId)?.name || repo.subagents.find(agent => agent.id == run.targetId)?.name),
          h('span', {}, `${run.completed || 0}/${run.total}`), h(`span:${classes.chip}`, {}, run.status))),
        !repo.evalRuns.some(run => run.evaluationId == item.id) && h('p:mt-3 text-xs text-[#9aa19d]', {}, 'עדיין אין הרצות'))),
      h('div:flex items-center justify-between border-t border-[#e5e9e7] pt-5', {}, active.item.originalId &&
        (resource != 'skills' || repo.marketplace) && h('button:text-sm text-red-600', {
        onClick: deleteEditor}, 'מחיקה'), h('div:mr-auto flex gap-2', {}, h(`button:${classes.button}`, {
        onClick: () => setEditors(editors.slice(0, -1))}, 'ביטול'), h(`button:${classes.primary}`, {
        disabled: !item.name?.trim() || !item.id?.trim() || resource == 'skills' && !repo.marketplace && (!item.content?.trim()
          || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(item.publishVersion)), onClick: saveEditor}, active.attachTo ? 'פרסום וצירוף'
          : repo.marketplace ? 'שמירה למרקטפלייס' : resource == 'tools' ? 'פרסום לקטלוג'
            : resource == 'skills' ? 'פרסום גרסה' : 'שמירה')))))
    }
  })
})
