// Generic self-serve widget-builder engine over ANY cube<bi>: spec {metric, metric2?, dimension, kind, grain, limit, filters?}
// → cube-vocabulary SQL + WHERE fragment + VizWidget chart spec. Everything domain-specific comes from the cube's meta
// (metric `unit`, dimension `values`, the timestamp dimension) — NO project column names in this file.
// meta = a resolved cube (someCube.$run()) or its summary(): anything with {metrics:[{name,unit}], dimensions:[{name,type,values}]}.
// Pure module (no imports): usable from any demo/react graph and from node tests.

export const q = v => `'${String(v).replace(/'/g, "''")}'`
export const cap = s => (s || '').charAt(0).toUpperCase() + (s || '').slice(1)
export const sentence = s => cap((s || '').replace(/_/g, ' '))
export const fmtBucket = (d, gran) => { const dt = new Date(String(d ?? '').slice(0, 10) + 'T00:00:00Z'); return isNaN(+dt) ? String(d ?? '') : dt.toLocaleDateString('en-GB', gran == 'month' ? { month: 'short', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' }) }

const colKey = name => String(name || '').replace(/"/g, '')
export const timeDimOf = meta => (meta.dimensions || []).find(d => d.type == 'timestamp')?.name
export const unitOf = (meta, m) => (meta.metrics || []).find(x => x.name == m)?.unit || 'int'
export const rangeWhere = (meta, from, to) => { const t = timeDimOf(meta); return [from && `${t} >= DATE ${q(from)}`, to && `${t} <= DATE ${q(to)}`].filter(Boolean).join(' AND ') }

// filter dropdowns = every dimension that declares enum values (dimension('Status', { values: [...] })).
// exclude dims the host dashboard already filters globally (e.g. a header currency picker).
export const widgetFilters = (meta, { exclude = [] } = {}) => (meta.dimensions || [])
  .filter(d => d.values?.length && !exclude.includes(colKey(d.name)))
  .map(d => ({ key: colKey(d.name), col: d.name, label: sentence(colKey(d.name)), opts: d.values }))
// widget-level filters: equality clauses ANDed onto the host's base where. Metrics that already encode a column
// (money_in ⇒ Direction) just null out under a contradicting filter — the live preview makes that visible.
export const widgetWhere = (meta, w, baseWhere = '', opts) =>
  [baseWhere, ...widgetFilters(meta, opts).filter(x => w.filters?.[x.key]).map(x => `${x.col} = ${q(w.filters[x.key])}`)].filter(Boolean).join(' AND ')
export const widgetFilterLabel = (meta, w, opts) => widgetFilters(meta, opts).filter(x => w.filters?.[x.key]).map(x => sentence(w.filters[x.key])).join(' · ')

export const widgetSql = (meta, w) => { const m2 = w.metric2 ? `, ${w.metric2} as "value2"` : '', t = timeDimOf(meta)
  return w.kind == 'kpi' ? `select ${w.metric} as "value"${m2}`   // headline number(s) — no grouping
    : w.dimension == t
    ? `select strftime(date_trunc('${w.grain || 'month'}', ${t}), '%Y-%m-%d') as "name", ${w.metric} as "value"${m2} group by 1 order by 1`
    : `select ${w.dimension} as "name", ${w.metric} as "value"${m2} group by 1 having ${w.metric} is not null order by 2 desc limit ${w.limit || 10}` }

// bind a cube once — cubeWidgets(someCube.$run(), { palette, exclude }) → the engine pre-applied with meta/options,
// so a host app and its tests share one binding expression instead of a per-project shim module.
export const cubeWidgets = (meta, { palette, exclude } = {}) => ({
  meta, timeDim: timeDimOf(meta),
  unitOf: m => unitOf(meta, m),
  rangeWhere: (from, to) => rangeWhere(meta, from, to),
  filters: widgetFilters(meta, { exclude }),
  filterLabel: w => widgetFilterLabel(meta, w, { exclude }),
  where: (w, baseWhere) => widgetWhere(meta, w, baseWhere, { exclude }),
  sql: w => widgetSql(meta, w),
  spec: (w, rows) => widgetSpec(meta, w, rows, { palette })
})

export const widgetSpec = (meta, w, rows, { palette = ['#4E79A7', '#A0CBE8'] } = {}) => {
  const vf = unitOf(meta, w.metric), isTime = w.dimension == timeDimOf(meta), xOf = r => isTime ? fmtBucket(r.name, w.grain) : String(r.name)
  if (w.kind == 'kpi') { const r = rows[0] || {}
    return { kind: 'kpi', title: w.title, items: [{ label: sentence(w.metric), value: +r.value || 0, format: vf },
      ...(w.metric2 ? [{ label: sentence(w.metric2), value: +r.value2 || 0, format: unitOf(meta, w.metric2) }] : [])] } }
  if (w.kind == 'table') return { kind: 'table', title: w.title, valueFormat: vf, rows,
    columns: [{ key: 'name', label: colKey(w.dimension) }, { key: 'value', label: sentence(w.metric) }, ...(w.metric2 ? [{ key: 'value2', label: sentence(w.metric2) }] : [])] }
  if (w.kind == 'line' || w.kind == 'area') return { kind: w.kind, title: w.title, valueFormat: vf, xType: 'category',
    series: [{ name: sentence(w.metric), points: rows.map(r => ({ x: xOf(r), y: +r.value || 0 })) },
      ...(w.metric2 ? [{ name: sentence(w.metric2), points: rows.map(r => ({ x: xOf(r), y: +r.value2 || 0 })) }] : [])] }
  if (w.metric2) return { kind: 'groupedBar', title: w.title, valueFormat: vf, categories: rows.map(xOf),   // compare + bar → clustered columns
    series: [{ name: sentence(w.metric), values: rows.map(r => +r.value || 0) }, { name: sentence(w.metric2), values: rows.map(r => +r.value2 || 0) }] }
  return { kind: w.kind, title: w.title, valueFormat: vf, ...(w.kind == 'pie' ? { donut: true, showLegend: true } : {}),
    data: rows.map((r, i) => ({ name: String(r.name), value: +r.value || 0, ...(w.kind == 'pie' ? {} : { color: i == 0 ? palette[0] : palette[1] }) })) }
}
