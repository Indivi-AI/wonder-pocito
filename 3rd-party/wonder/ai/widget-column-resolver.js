import { coreUtils } from '@jb6/core'

const CHART_KINDS = 'bar,hbar,pie,funnel,treemap,waterfall,line,area'.split(',')
const pick = (keys, col, def) => keys.includes(col) ? col : def
const validColumns = (cols, keys) => {
  const valid = coreUtils.asArray(cols).filter(c => keys.includes(c?.key))
  return valid.length ? valid : keys.map(key => ({ key, label: key }))
}

export const materializeWidgets = (rows, widgets, { maxRows = 50 } = {}) => {
  rows = coreUtils.asArray(rows).filter(r => r && typeof r == 'object')
  if (!rows.length) return []
  const keys = Object.keys(rows[0]), rowSlice = rows.slice(0, maxRows)
  const defName = keys.find(k => typeof rows[0][k] == 'string') ?? keys[0]
  const defVal = keys.find(k => typeof rows[0][k] == 'number') ?? keys[1]
  return coreUtils.asArray(widgets).map(({ nameCol, valueCol, columns, data, rows: _rows, series, values, categories, xCategories, yCategories, points, items, name, value, min, max, target, indicators, ...w }) => {
    const kind = w.kind == 'table' ? 'table' : CHART_KINDS.includes(w.kind) ? w.kind : 'bar'
    return kind == 'table'
      ? { ...w, kind, columns: validColumns(columns, keys), rows: rowSlice }
      : { ...w, kind, data: rowSlice.map(r => ({ name: String(r[pick(keys, nameCol ?? name, defName)] ?? ''), value: +r[pick(keys, valueCol ?? value, defVal)] || 0 })) }
  })
}
