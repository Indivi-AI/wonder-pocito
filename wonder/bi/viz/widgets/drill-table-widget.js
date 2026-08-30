import { dsls, jb } from '@jb6/core'
import '@jb6/common'
import '../viz-core.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

// drillTableWidget — a flat row set displayed as an expandable hierarchy with conditional cell colour.
// Everything is data-driven; the widget knows no column names.
//   levels:  ['account','campaign','adset']  outer→inner grouping keys present on every row
//   columns: {key,label,format}                     plain measure, summed up the hierarchy
//            {key,label,kind:'ratio',num,den,scale} recomputed at every level, never averaged
//            heat:{mid,span,good:'high'|'low'}      green→amber→red background around `mid`
//   groups:  [{label, span}] optional banner row spanning column groups
const agg = (rows, columns) => Object.fromEntries(columns.map(c => [c.key,
  c.kind == 'ratio' ? null : rows.reduce((s, r) => s + (+r[c.key] || 0), 0)]))

const withRatios = (o, columns) => (columns.filter(c => c.kind == 'ratio').forEach(c => {
  const den = o[c.den]
  o[c.key] = den ? (c.scale ?? 100) * o[c.num] / den : null
}), o)

const groupBy = (rows, key) => rows.reduce((m, r) => ((m[r[key] ?? '—'] ||= []).push(r), m), {})

// one node per distinct value at `level`, children built lazily on the way down
const buildTree = (rows, levels, columns, level = 0, path = '') =>
  Object.entries(groupBy(rows, levels[level])).map(([label, rs]) => ({
    id: `${path}/${label}`, label, depth: level, rows: rs,
    values: withRatios(agg(rs, columns), columns),
    children: level + 1 < levels.length ? () => buildTree(rs, levels, columns, level + 1, `${path}/${label}`) : null
  }))

const heatBg = (v, heat) => {
  if (v == null || !heat) return null
  const { mid, span = mid, good = 'high' } = heat
  const d = ((v - mid) / (span || 1)) * (good == 'high' ? 1 : -1)
  return d >= 0.25 ? '#C8E6C9' : d >= 0 ? '#DFF0D8' : d >= -0.35 ? '#FCE9B6' : '#F5B7B1'
}

ReactComp('drillTableWidget', {
  description: 'Expandable hierarchy table over flat rows; sums measures, recomputes ratios per level, conditional cell colour',
  impl: comp({
    hFunc: (ctx, { react: { h, useState } }) => props => {
      const V = jb.vizUtils
      const columns = V.asArray(props.columns) || [], rows = V.asArray(props.rows) || []
      const levels = V.asArray(props.levels) || []
      const [open, setOpen] = useState({})
      const [sort, setSort] = useState(props.sort || { key: columns[0]?.key, dir: 'desc' })
      const toggle = id => setOpen({ ...open, [id]: !open[id] })
      const sorted = nodes => sort.key ? [...nodes].sort((a, b) =>
        (sort.dir == 'desc' ? -1 : 1) * ((+a.values[sort.key] || 0) - (+b.values[sort.key] || 0))) : nodes

      const flatten = nodes => sorted(nodes).flatMap(n =>
        [n, ...(open[n.id] && n.children ? flatten(n.children()) : [])])
      const visible = flatten(buildTree(rows, levels, columns))

      const th = (label, key, align = 'right') => h('th', { key: key || label, onClick: key && (() => setSort({ key, dir: sort.key == key && sort.dir == 'desc' ? 'asc' : 'desc' })),
        style: { textAlign: align, padding: '7px 10px', fontSize: '11px', fontWeight: 600, color: V.MUTE, whiteSpace: 'nowrap',
          borderBottom: '1px solid #e2e8f0', cursor: key ? 'pointer' : undefined, position: 'sticky', top: 0, background: '#fff' } },
        label + (sort.key == key ? (sort.dir == 'desc' ? ' ↓' : ' ↑') : ''))

      const cell = (n, c) => {
        const v = n.values[c.key], bg = heatBg(v, c.heat)
        return h('td', { key: c.key, style: { textAlign: 'right', padding: '6px 10px', fontSize: '12px', color: V.INK,
          fontVariantNumeric: 'tabular-nums', background: bg || undefined, whiteSpace: 'nowrap' } },
          v == null ? '' : V.fmtNum(v, c.format))
      }

      const labelCell = n => h('td', { key: 'label', style: { padding: '6px 10px', fontSize: '12px', color: V.INK,
        whiteSpace: 'nowrap', paddingLeft: (10 + n.depth * 16) + 'px' } },
        h('span', { onClick: n.children ? () => toggle(n.id) : undefined,
          style: { cursor: n.children ? 'pointer' : 'default', userSelect: 'none' } },
          n.children ? h('span', { style: { color: V.MUTE, marginRight: '6px', fontWeight: 700 } }, open[n.id] ? '−' : '+') : null,
          n.label))

      return h('div:viz-widget', { style: { width: '100%', background: '#fff', border: '1px solid #f1f5f9', borderRadius: '14px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: '16px', boxSizing: 'border-box', fontFamily: 'ui-sans-serif, system-ui, sans-serif' } },
        props.title && h('div', { style: { fontSize: '15px', fontWeight: 600, color: V.INK, marginBottom: '10px' } }, props.title),
        h('div', { style: { overflowX: 'auto', maxHeight: (props.maxHeight || 460) + 'px', overflowY: 'auto' } },
          h('table', { style: { borderCollapse: 'collapse', width: '100%', minWidth: '760px' } },
            h('thead', {},
              props.groups && h('tr', {}, h('th', { style: { borderBottom: '1px solid #e2e8f0' } }),
                V.asArray(props.groups).map((g, i) => h('th', { key: i, colSpan: g.span,
                  style: { textAlign: 'center', padding: '5px 10px', fontSize: '11px', fontWeight: 700, color: V.MUTE,
                    borderBottom: '1px solid #e2e8f0', borderLeft: '1px solid #eef2f7' } }, g.label))),
              h('tr', {}, th(props.levelLabel || levels.join(' / '), null, 'left'), columns.map(c => th(c.label, c.key)))),
            h('tbody', {}, visible.map(n =>
              h('tr', { key: n.id, style: { borderBottom: '1px solid #f1f5f9', background: n.depth == 0 ? '#fff' : '#fcfcfd' } },
                labelCell(n), columns.map(c => cell(n, c))))))),
        h('div', { style: { fontSize: '11px', color: V.MUTE, marginTop: '8px' } },
          `${visible.length} rows · click a name to drill`))
    }
  })
})
