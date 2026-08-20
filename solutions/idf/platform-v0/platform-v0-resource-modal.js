import { dsls } from '@jb6/core'
import '@jb6/react'
import './platform-v0-model.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('PlatformV0AttachPicker', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => ({picker, catalog, setPicker, attachSelected, createNested}) => picker && h(
      'div:fixed inset-0 z-[90] grid place-items-center bg-black/35 p-4', {}, h(
        'section:max-h-[78vh] w-full max-w-xl overflow-hidden rounded-2xl border border-[#dfe5e1] bg-white shadow-2xl', {},
        h('div:flex items-center gap-3 border-b border-[#e5e9e7] p-4', {}, h('L:Search', {size: 16, className: 'text-[#8c9690]'}),
          h('input:flex-1 text-sm outline-none', {value: picker.query || '', placeholder: `חיפוש ${picker.label}…`,
            onInput: event => setPicker({...picker, query: event.target.value})}), h('button:text-xs text-[#9aa19d]', {
            onClick: () => setPicker(null), 'aria-label': 'סגירה'}, 'esc')),
        h('div:max-h-[58vh] overflow-y-auto p-3', {}, h('button:mb-2 flex w-full items-center justify-between rounded-xl border border-dashed ' +
          'border-[#b7cbbf] px-4 py-3 text-sm font-semibold text-[#315e46]', {onClick: () => createNested(picker.resource)},
        picker.resource == 'tools' ? 'כלי חדש ממארז Flow' : `${picker.single} חדשה`, h('L:Plus', {size: 15})),
        (catalog[picker.resource] || []).filter(item => !picker.query || `${item.title} ${item.description}`.includes(picker.query)).map(item => {
          const selected = picker.selected.includes(item.name)
          return h(`button:mb-2 flex w-full items-start gap-3 rounded-xl border p-3 text-right ${selected
            ? 'border-[#b8d3c2] bg-[#edf6f0]' : 'border-[#e7ebe8] bg-white'}`, {key: item.name,
            onClick: () => setPicker({...picker, selected: selected ? picker.selected.filter(name => name != item.name)
              : [...picker.selected, item.name]})}, h(`span:mt-1 h-4 w-4 rounded border ${selected
                ? 'border-[#2f6b4b] bg-[#2f6b4b]' : 'border-[#cfd7d2]'}`, {}, selected && h('L:Check', {size: 14, className: 'text-white'})),
            h('span:min-w-0 flex-1', {}, h('b:block text-sm', {}, item.title), h('small:mt-1 block text-[#8b948f]', {}, item.description)),
            item.managed && h('span:text-[10px] text-[#8b948f]', {}, 'מנוהל'))
        })), h('div:flex items-center justify-between border-t border-[#e5e9e7] bg-[#f8f9f8] p-4', {},
          h('span:text-xs text-[#9aa19d]', {}, 'בחירה מרובה'), h('div:flex gap-2', {},
            h('button:rounded-xl px-4 py-2 text-sm', {onClick: () => setPicker(null)}, 'ביטול'),
            h('button:rounded-xl bg-[#2f6b4b] px-4 py-2 text-sm font-semibold text-white', {onClick: attachSelected},
              `צירוף ${picker.label}`)))))
  })
})

ReactComp('PlatformV0ResourceModal', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => {
      const {classes, labels} = dsls.common.data.platformV0Config.$run()
      return ({editors, setEditors, catalog, saveEditor, deleteEditor, openPicker}) => {
        const active = editors.at(-1)
        if (!active) return null
        const {resource, item} = active, update = value => setEditors(editors.map((entry, index) =>
          index == editors.length - 1 ? {...entry, item: typeof value == 'function' ? value(entry.item) : value} : entry))
        const field = (label, control) => h('label:block text-xs font-semibold text-[#69726d]', {}, label, control)
        const input = (key, props = {}) => h(`input:${classes.field}`, {value: item[key] || '',
          onInput: event => update({...item, [key]: event.target.value}), ...props})
        const relation = (key, target, title) => h('section:rounded-2xl border border-[#e2e7e4] p-4', {},
          h('div:flex items-center justify-between', {}, h('b:text-sm', {}, title), h(`button:${classes.button}`, {
            onClick: () => openPicker(key, target, title)}, h('L:Plus', {size: 14}), 'צירוף מהקטלוג')),
          h('div:mt-3 flex flex-wrap gap-2', {}, (item[key] || []).map(name => h(`span:${classes.chip} flex items-center gap-2`, {key: name},
            catalog[target]?.find(value => value.name == name)?.title || name, h('button', {onClick: () => update({...item,
              [key]: item[key].filter(value => value != name)}), 'aria-label': 'הסרה'}, h('L:X', {size: 12}))))))
        const readPackage = () => {
          const pkg = catalog.flowPackages?.find(value => value.name == item.packageId)
          if (pkg) update({...item, title: item.title || pkg.title, description: item.description || pkg.description,
            inputSchema: pkg.inputSchema.map(value => ({...value, description: value.description || ''})), outputCubes: []})
        }
        return h('div:fixed inset-0 z-[80] bg-black/25', {}, h('section:absolute inset-y-0 left-0 w-full max-w-3xl overflow-y-auto bg-white shadow-2xl', {
          dir: 'rtl'}, h('div:sticky top-0 z-10 border-b border-[#e5e9e7] bg-white p-5', {},
          h('div:flex flex-wrap gap-2 text-xs text-[#789083]', {}, editors.map((entry, index) => h('button', {key: index,
            onClick: () => setEditors(editors.slice(0, index + 1))}, `${labels[entry.resource] || 'סט'} · ${entry.item.title || 'חדש'}`))),
          h('div:mt-3 flex items-center justify-between gap-4', {}, h('div', {}, h('h2:text-xl font-bold', {}, item.title || active.createLabel),
            h('span:text-xs text-[#9aa19d]', {}, labels[resource] || 'סט אבלואציה')),
          h('button:rounded-lg p-2 hover:bg-gray-100', {onClick: () => setEditors(editors.slice(0, -1)), 'aria-label': 'סגירה'}, h('L:X')))),
        h('div:space-y-5 p-6', {}, resource == 'tools' && h('div:grid grid-cols-[1fr_auto] items-end gap-2', {},
          field('מזהה מארז Flow', input('packageId', {dir: 'ltr', placeholder: '4821037'})),
          h(`button:${classes.button}`, {onClick: readPackage}, 'קריאת המארז')),
        field('שם', input('title', {placeholder: 'שם כפי שיופיע בקטלוג'})),
        !item.originalName && field('מזהה', input('name', {dir: 'ltr', placeholder: 'unique-id'})),
        field('תיאור', h(`textarea:${classes.field} min-h-24 resize-y`, {value: item.description || '',
          onInput: event => update({...item, description: event.target.value})})),
        ['plugins', 'skills', 'agents'].includes(resource) && field(resource == 'skills' ? 'הנחיות המיומנות' : 'הנחיות בסיס',
          h(`textarea:${classes.field} min-h-40 resize-y`, {value: item.instructions || '',
            onInput: event => update({...item, instructions: event.target.value})})),
        resource == 'skills' && relation('tools', 'tools', 'כלים'),
        resource == 'agents' && h('div:space-y-4', {}, relation('skills', 'skills', 'מיומנויות'), relation('tools', 'tools', 'כלים')),
        resource == 'tools' && h('div:space-y-5', {}, h('section:rounded-2xl border border-[#e2e7e4] p-4', {},
          h('b:text-sm', {}, 'סכמת קלט — פרמטרים מהירים'), (item.inputSchema || []).map((row, index) => h(
            'div:mt-3 grid grid-cols-[1fr_100px_2fr] gap-2 max-sm:grid-cols-1', {key: row.id}, h('span:text-xs', {dir: 'ltr'}, row.id),
            h('span:text-xs', {}, row.type), h('input:rounded-lg border border-[#e2e7e4] px-2 py-1 text-sm', {
              value: row.description || '', onInput: event => update({...item, inputSchema: item.inputSchema.map((value, rowIndex) =>
                rowIndex == index ? {...value, description: event.target.value} : value)})})))),
          h('section:rounded-2xl border border-[#e2e7e4] p-4', {}, h('b:text-sm', {}, 'קוביות פלט'),
            h('div:mt-3 flex flex-wrap gap-2', {}, (catalog.flowPackages?.find(value => value.name == item.packageId)?.cubes || []).map(cube => {
              const selected = item.outputCubes?.some(value => value.id == cube.id)
              return h(`button:${classes.chip} ${selected ? 'border-[#6f9a7f] bg-[#e7f1eb]' : ''}`, {key: cube.id,
                onClick: () => update({...item, outputCubes: selected ? item.outputCubes.filter(value => value.id != cube.id)
                  : [...(item.outputCubes || []), {...cube, description: '', markdownRows: 20}]})}, cube.title)
            })), (item.outputCubes || []).map((cube, index) => h('div:mt-3 grid grid-cols-[1fr_2fr_100px] gap-2 max-sm:grid-cols-1', {key: cube.id},
              h('span:text-sm', {}, cube.title), h('input:rounded-lg border px-2 py-1 text-sm', {value: cube.description || '',
                placeholder: 'מה הקובייה מחזירה', onInput: event => update({...item, outputCubes: item.outputCubes.map((value, cubeIndex) =>
                  cubeIndex == index ? {...value, description: event.target.value} : value)})}),
              h('input:rounded-lg border px-2 py-1 text-sm', {type: 'number', value: cube.markdownRows || 20, min: 0,
                onInput: event => update({...item, outputCubes: item.outputCubes.map((value, cubeIndex) => cubeIndex == index
                  ? {...value, markdownRows: +event.target.value} : value)})}))))),
        resource == 'evalSets' && h('div:space-y-4', {}, field('מדרג לשופט (נשמר לשימוש עתידי — הסטודיו אינו שופט)',
          h(`textarea:${classes.field} min-h-24`, {value: item.rubric || '', onInput: event => update({...item, rubric: event.target.value})})),
          h('section:rounded-2xl border border-[#e2e7e4] p-4', {}, h('div:flex items-center justify-between', {},
            h('b:text-sm', {}, 'רשומות הסט'), h(`button:${classes.button}`, {onClick: () => update({...item,
              rows: [...(item.rows || []), {input: '', expected: '', notes: ''}]})}, h('L:Plus', {size: 14}), 'רשומה')),
          (item.rows || []).map((row, index) => h('div:mt-3 grid grid-cols-[28px_1fr_1fr_1fr_28px] gap-2 max-sm:grid-cols-1', {key: index},
            h('span:text-xs text-[#9aa19d]', {}, String(index + 1).padStart(2, '0')), ...['input', 'expected', 'notes'].map(key => h(
              'textarea:min-h-20 rounded-lg border border-[#e2e7e4] p-2 text-sm', {key, value: row[key],
                placeholder: {input: 'קלט לדוגמה', expected: 'מה מצופה שיחזור', notes: 'הערות'}[key],
                onInput: event => update({...item, rows: item.rows.map((value, rowIndex) => rowIndex == index
                  ? {...value, [key]: event.target.value} : value)})})), h('button', {onClick: () => update({...item,
                rows: item.rows.filter((value, rowIndex) => rowIndex != index)}), 'aria-label': 'מחיקת רשומה'}, h('L:Trash2', {size: 14}))))),
          h('section:rounded-2xl border border-[#e2e7e4] p-4', {}, h('b:text-sm', {}, 'היסטוריית הרצות'),
            (catalog.evalRuns || []).filter(run => run.set == item.name).sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0)).map(run => h(
              'div:mt-3 flex flex-wrap items-center gap-3 ' +
              'border-t border-[#edf0ee] pt-3 text-xs', {key: run.name}, h('b', {}, run.started),
              h('span', {}, catalog.plugins?.find(plugin => plugin.name == run.target)?.title || run.target),
              h('span', {}, `${run.completed || run.rows?.length || 0}/${run.total}`),
              h(`span:${classes.chip}`, {}, run.status))),
            !catalog.evalRuns?.some(run => run.set == item.name) && h('p:mt-3 text-xs text-[#9aa19d]', {}, 'עדיין אין הרצות'))),
        h('div:flex items-center justify-between border-t border-[#e5e9e7] pt-5', {}, active.item.originalName && h(
          'button:text-sm text-red-600', {onClick: deleteEditor}, 'מחיקה'), h('div:mr-auto flex gap-2', {},
          h(`button:${classes.button}`, {onClick: () => setEditors(editors.slice(0, -1))}, 'ביטול'),
          h(`button:${classes.primary}`, {disabled: !item.title?.trim() || !item.name?.trim(), onClick: saveEditor},
            active.attachTo ? 'שמירה וצירוף' : resource == 'tools' ? 'פרסום לקטלוג' : 'שמירה')))))
        )
      }
    }
  })
})
