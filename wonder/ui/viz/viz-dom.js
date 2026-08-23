import { dsls, coreUtils } from '@jb6/core'
import './viz-types.js'

const {react: {ReactComp, 'react-comp': {comp}}, viz: {VizValueFormat, 'viz-theme': {defaultTheme}}} = dsls

ReactComp('viz.kpi', {
  params: [
    {id: 'items', as: 'array'},
    {id: 'title', as: 'string', byName: true},
    {id: 'highlight', type: 'viz-highlight<viz>', byName: true},
    {id: 'valueFormat', type: 'viz-value-format<viz>'},
    {id: 'deltaFormat', type: 'viz-value-format<viz>'},
    {id: 'theme', type: 'viz-theme<viz>', defaultValue: defaultTheme()},
    {id: 'width', as: 'number', defaultValue: 540},
    {id: 'onEvent', type: 'action<common>', dynamic: true}
  ],
  impl: comp({
    hFunc: (ctx, {react: {h}}, {items, title, highlight, valueFormat, deltaFormat, theme, width, onEvent}) => () => {
      items = coreUtils.asArray(items).map((item, index) => ({name: String(item.label ?? index), value: +item.value || 0, delta: item.delta,
        format: item.format, deltaFormat: deltaFormat || item.format || valueFormat, unit: item.unit}))
      const highlights = coreUtils.asArray(highlight).map(item => item.label != null ? {...item, name: item.label} : item)
        .map(item => item.resolve(ctx.setData(items))), active = !!highlights.length
      const {palette, dim, ink, mute, fontFamily} = theme, note = highlights.find(item => item.note)?.note
      const matches = (item, index) => highlights.some(mark => mark.matches(ctx.setData({item, index})))
      const format = (value, itemFormat, fallback) => itemFormat ? VizValueFormat.coerce(itemFormat)(ctx.setData(value))
        : fallback ? fallback(ctx.setData(value)) : VizValueFormat.coerce('compact')(ctx.setData(value))
      return h('div:viz-widget', {style: {width: '100%', maxWidth: `${width}px`, background: '#fff', border: '1px solid #f1f5f9',
        borderRadius: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: '16px', boxSizing: 'border-box', fontFamily}},
      title && h('div', {style: {fontSize: '15px', fontWeight: 600, color: ink, marginBottom: '2px'}}, title),
      note && h('div', {style: {fontSize: '12px', fontWeight: 600, color: palette[0], marginBottom: '8px'}}, note),
      h('div', {style: {display: 'flex', flexWrap: 'wrap', gap: '12px'}}, items.map((item, index) => {
        const on = active && matches(item, index), muted = active && !on, direction = item.delta > 0 ? '▲' : item.delta < 0 ? '▼' : '▬'
        return h('div', {key: index, className: onEvent.profile != null ? 'cursor-pointer' : undefined,
          onClick: onEvent.profile == null ? undefined : () => onEvent(ctx.setData({type: 'drill', name: item.name, value: item.value})),
          style: {flex: '1 1 130px', minWidth: 0, padding: '13px 15px', borderRadius: '12px', background: on ? '#eff6ff' : '#f8fafc',
            border: on ? `2px solid ${palette[0]}` : '1px solid #eef2f7', opacity: muted ? .6 : 1, boxSizing: 'border-box',
            cursor: onEvent.profile != null ? 'pointer' : undefined}},
        h('div', {style: {fontSize: '11px', fontWeight: 600, color: muted ? dim : mute, textTransform: 'uppercase', letterSpacing: '.05em',
          marginBottom: '7px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}, item.name),
        h('div', {style: {fontSize: '27px', fontWeight: 700, color: muted ? mute : ink, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-.01em'}},
          `${format(item.value, item.format, valueFormat)}${item.unit ? ` ${item.unit}` : ''}`),
        item.delta != null && h('div', {style: {fontSize: '12px', fontWeight: 600, marginTop: '5px',
          color: item.delta == 0 ? mute : item.delta > 0 ? palette[1] : palette[3], fontVariantNumeric: 'tabular-nums'}},
          `${direction} ${format(Math.abs(item.delta), null, item.deltaFormat)}`))
      })))
    }
  })
})

ReactComp('viz.table', {
  params: [
    {id: 'columns', as: 'array'},
    {id: 'rows', as: 'array'},
    {id: 'title', as: 'string', byName: true},
    {id: 'highlight', asIs: true},
    {id: 'search', as: 'string'},
    {id: 'filters', as: 'object'},
    {id: 'sort', as: 'object'},
    {id: 'collapsedRows', as: 'number', defaultValue: 5},
    {id: 'width', as: 'number', defaultValue: 540},
    {id: 'theme', type: 'viz-theme<viz>', defaultValue: defaultTheme()},
    {id: 'onEvent', type: 'action<common>', dynamic: true}
  ],
  impl: comp({
    hFunc: (ctx, {react: {h, useState}}, {columns, rows, title, highlight, search, filters, sort, collapsedRows, width, theme, onEvent}) => () => {
      const [query, setQuery] = useState(search || ''), [activeFilters, setFilters] = useState(filters || {}), [activeSort, setSort] = useState(sort || {})
      const [expanded, setExpanded] = useState(false), {palette, ink, mute, fontFamily} = theme, list = coreUtils.asArray(highlight)
      const text = value => value == null ? '' : String(value), format = (row, column, first) => first || !column.format ? text(row[column.key])
        : VizValueFormat.coerce(column.format)(ctx.setData(row[column.key]))
      const hay = (row, column, index) => `${text(row[column.key])} ${format(row, column, index == 0)}`.toLowerCase(), q = query.trim().toLowerCase()
      let view = rows.filter(row => columns.every((column, index) => !activeFilters[column.key]
        || hay(row, column, index).includes(text(activeFilters[column.key]).toLowerCase())) && (!q || columns.some((column, index) => hay(row, column, index).includes(q))))
      if (activeSort.key) view = [...view].sort((a, b) => {const x = a[activeSort.key], y = b[activeSort.key], numeric = !isNaN(+x) && !isNaN(+y)
        return (activeSort.dir == 'desc' ? -1 : 1) * (numeric ? +x - +y : text(x).localeCompare(text(y)))})
      const marked = new Set(), numericColumn = columns[1]?.key
      list.forEach(mark => {const key = mark?.col || numericColumn
        if (mark && (mark.max || mark.min) && key && view.length) marked.add(view.reduce((best, row, index) => mark.max
          ? +row[key] > +view[best][key] ? index : best : +row[key] < +view[best][key] ? index : best, 0))
        else if (typeof mark == 'number') marked.add(mark)
        else view.forEach((row, index) => String(row[columns[0]?.key]) == String(typeof mark == 'object' ? mark.name : mark) && marked.add(index))})
      const shown = expanded || view.length <= collapsedRows ? view : view.slice(0, collapsedRows), note = list.find(item => item?.note)?.note
      const markText = value => !q || !text(value).toLowerCase().includes(q) ? value : text(value).split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'))
        .map((part, index) => part.toLowerCase() == q ? h('mark', {key: index, style: {background: '#fde68a', padding: 0}}, part) : part)
      return h('div:viz-widget', {style: {width: '100%', maxWidth: `${width}px`, background: '#fff', border: '1px solid #f1f5f9', borderRadius: '14px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: '16px', boxSizing: 'border-box', fontFamily}},
      title && h('div', {style: {direction: 'rtl', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '15px', fontWeight: 600,
        color: ink, marginBottom: '2px'}}, h('span', {}, title)),
      note && h('div', {style: {fontSize: '12px', fontWeight: 600, color: palette[0], marginBottom: '10px'}}, note),
      h('div', {style: {display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '10px 0'}},
        h('input', {value: query, placeholder: 'Search', onChange: event => setQuery(event.target.value),
          style: {flex: '1 1 140px', minWidth: 0, border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 8px', fontSize: '12px'}}),
        columns.map(column => h('input', {key: column.key, value: activeFilters[column.key] || '', placeholder: column.label || column.key,
          onChange: event => setFilters({...activeFilters, [column.key]: event.target.value}),
          style: {flex: '1 1 96px', minWidth: 0, border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 8px', fontSize: '12px'}}))),
      h('div', {style: {color: mute, fontSize: '11px', marginBottom: '6px'}}, `${view.length} of ${rows.length} rows`),
      h('div', {style: {overflow: 'hidden'}}, h('table', {style: {width: '100%', borderCollapse: 'collapse', fontSize: '12px', tableLayout: 'fixed'}},
        h('thead', {}, h('tr', {}, columns.map((column, index) => h('th', {key: column.key, style: {textAlign: index ? 'right' : 'left',
          padding: '5px 10px', color: mute, fontWeight: 600, fontSize: '10px', letterSpacing: '.05em', textTransform: 'uppercase',
          borderBottom: '2px solid #e2e8f0'}},
          h('button', {onClick: () => setSort(activeSort.key == column.key ? {key: column.key, dir: activeSort.dir == 'asc' ? 'desc' : 'asc'}
            : {key: column.key, dir: 'asc'}), style: {all: 'unset', cursor: 'pointer'}},
          `${column.label || column.key}${activeSort.key == column.key ? activeSort.dir == 'desc' ? ' ↓' : ' ↑' : ''}`))))),
        h('tbody', {}, shown.map((row, rowIndex) => h('tr', {key: rowIndex, className: onEvent.profile != null ? 'cursor-pointer' : undefined,
          onClick: onEvent.profile == null ? undefined : () => onEvent(ctx.setData({type: 'drill', name: text(row[columns[0]?.key]), row})),
          style: {background: marked.has(rowIndex) ? '#eff6ff' : rowIndex % 2 ? '#f8fafc' : '#fff', borderBottom: '1px solid #f1f5f9',
            boxShadow: marked.has(rowIndex) ? `inset 3px 0 0 ${palette[0]}` : undefined, cursor: onEvent.profile != null ? 'pointer' : undefined}},
        columns.map((column, columnIndex) => h('td', {key: column.key, style: {textAlign: columnIndex ? 'right' : 'left', padding: '7px 10px',
          color: marked.has(rowIndex) || !columnIndex ? ink : mute, fontWeight: marked.has(rowIndex) ? columnIndex ? 600 : 700 : columnIndex ? 400 : 500,
          fontVariantNumeric: columnIndex ? 'tabular-nums' : undefined, overflowWrap: 'anywhere'}}, markText(format(row, column, !columnIndex))))))))),
      view.length > collapsedRows && h('button', {onClick: () => setExpanded(!expanded), style: {all: 'unset', cursor: 'pointer', display: 'block',
        width: '100%', textAlign: 'center', marginTop: '8px', padding: '5px', fontSize: '12px', fontWeight: 600, color: palette[0],
        borderTop: '1px solid #f1f5f9'}}, expanded ? '▲' : `▼ +${view.length - collapsedRows}`))
    }
  })
})
