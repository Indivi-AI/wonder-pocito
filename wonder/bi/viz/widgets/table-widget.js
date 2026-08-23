import { dsls, jb } from '@jb6/core'
import '@jb6/common'
import '@jb6/testing'
import '@jb6/react/tests/react-testers.js'
import '../viz-core.js'
import { drillHost } from '../viz-test-helpers.js'

const {
  common: {
    boolean: { contains, notContains, and },
  },
  test: {
    Test,
    'ui-action': { delay, click },
    test: { reactTest },
  },
  react: {
    ReactComp,
    'react-comp': { comp },
  },
} = dsls

// tableWidget — exact numbers with sort, filters, highlighted search, and row highlight.
const rowsToMark = (highlight, rows, cols) => {
  const list = highlight == null ? [] : Array.isArray(highlight) ? highlight : [highlight]
  const marked = new Set()
  list.forEach((h) => {
    if (h && h.col && (h.max || h.min) && rows.length) {
      let bi = 0
      rows.forEach((r, i) => {
        if (h.max ? +r[h.col] > +rows[bi][h.col] : +r[h.col] < +rows[bi][h.col]) bi = i
      })
      marked.add(bi)
    } else if (h && (h.max || h.min) && cols[1] && rows.length) {
      const k = cols[1].key
      let bi = 0
      rows.forEach((r, i) => {
        if (h.max ? +r[k] > +rows[bi][k] : +r[k] < +rows[bi][k]) bi = i
      })
      marked.add(bi)
    } else if (typeof h === 'number') marked.add(h)
    else if (h != null) {
      const name = typeof h === 'object' ? h.name : h
      rows.forEach((r, i) => {
        if (String(r[cols[0]?.key]) === String(name)) marked.add(i)
      })
    }
  })
  return marked
}

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const cmpVal = (v) => (v == null ? '' : String(v))
const sortRows = (rows, sort) =>
  !sort?.key
    ? rows
    : [...rows].sort((a, b) => {
        const [x, y] = [a[sort.key], b[sort.key]],
          n = !isNaN(+x) && !isNaN(+y)
        return (sort.dir === 'desc' ? -1 : 1) * (n ? +x - +y : cmpVal(x).localeCompare(cmpVal(y)))
      })

ReactComp('tableWidget', {
  description: 'Data table of exact numbers with sort, filters, highlighted search, and row highlight',
  impl: comp({
    hFunc:
      (ctx, { react: { h, useState } }) =>
      (props) => {
        const V = jb.vizUtils
        const cols = V.asArray(props.columns) || [],
          rows = V.asArray(props.rows) || []
        const list = props.highlight == null ? [] : Array.isArray(props.highlight) ? props.highlight : [props.highlight]
        const note = list.map((x) => x && typeof x === 'object' && x.note).find(Boolean)
        const [search, setSearch] = useState(props.search || ''),
          [filters, setFilters] = useState(props.filters || {}),
          [sort, setSort] = useState(props.sort || {})
        const [expanded, setExpanded] = useState(false)
        const collapsedRows = props.collapsedRows || 5 // long tables start collapsed; the button below the table expands them
        const width = props.width || 540,
          accent = V.PALETTE[0]
        const fmt = (r, c, first) => (first || !c.format ? cmpVal(r[c.key]) : V.fmtNum(r[c.key], c.format)) // exact-numbers table: only a declared column format abbreviates
        const hay = (r, c, i) => `${cmpVal(r[c.key])} ${fmt(r, c, i === 0)}`.toLowerCase()
        const q = search.trim().toLowerCase()
        const view = sortRows(
          rows.filter(
            (r) => cols.every((c, i) => !filters[c.key] || hay(r, c, i).includes(cmpVal(filters[c.key]).toLowerCase())) && (!q || cols.some((c, i) => hay(r, c, i).includes(q))),
          ),
          sort,
        )
        const shown = expanded || view.length <= collapsedRows ? view : view.slice(0, collapsedRows)
        const marked = rowsToMark(props.highlight, view, cols)
        const mark = (text) =>
          !q || !String(text).toLowerCase().includes(q)
            ? text
            : String(text)
                .split(new RegExp(`(${esc(q)})`, 'ig'))
                .map((p, i) => (p.toLowerCase() === q ? h('mark', { key: i, style: { background: '#fde68a', padding: 0 } }, p) : p))
        const cell = (r, c, first, on) =>
          h(
            'td',
            {
              style: {
                textAlign: first ? 'left' : 'right',
                padding: '7px 10px',
                color: on ? V.INK : first ? V.INK : V.MUTE,
                fontWeight: on ? (first ? 700 : 600) : first ? 500 : 400,
                fontVariantNumeric: first ? undefined : 'tabular-nums',
                overflowWrap: 'anywhere',
              },
            },
            mark(fmt(r, c, first)),
          )
        const setFilter = (key, val) => setFilters({ ...filters, [key]: val })
        return h(
          'div:viz-widget',
          {
            style: {
              width: '100%',
              maxWidth: width + 'px',
              background: '#fff',
              border: '1px solid #f1f5f9',
              borderRadius: '14px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              padding: '16px',
              boxSizing: 'border-box',
              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            },
          },
          props.title &&
            h(
              'div',
              { style: { direction: 'rtl', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '15px', fontWeight: 600, color: V.INK, marginBottom: '2px' } },
              props.titleBadge,
              h('span', {}, props.title),
            ),
          note && h('div', { style: { fontSize: '12px', fontWeight: 600, color: accent, marginBottom: '10px' } }, note),
          h(
            'div',
            { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '10px 0' } },
            h('input', {
              value: search,
              placeholder: 'Search',
              onChange: (e) => setSearch(e.target.value),
              style: { flex: '1 1 140px', minWidth: 0, border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 8px', fontSize: '12px' },
            }),
            cols.map((c) =>
              h('input', {
                key: c.key,
                value: filters[c.key] || '',
                placeholder: c.label || c.key,
                onChange: (e) => setFilter(c.key, e.target.value),
                style: { flex: '1 1 96px', minWidth: 0, border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 8px', fontSize: '12px' },
              }),
            ),
          ),
          h('div', { style: { color: V.MUTE, fontSize: '11px', marginBottom: '6px' } }, `${view.length} of ${rows.length} rows`),
          h(
            'div',
            { style: { overflow: 'hidden' } },
            h(
              'table',
              { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px', tableLayout: 'fixed' } },
              h(
                'thead',
                {},
                h(
                  'tr',
                  {},
                  cols.map((c, ci) =>
                    h(
                      'th',
                      {
                        key: ci,
                        style: {
                          textAlign: ci === 0 ? 'left' : 'right',
                          padding: '5px 10px',
                          color: V.MUTE,
                          fontWeight: 600,
                          fontSize: '10px',
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                          borderBottom: '2px solid #e2e8f0',
                        },
                      },
                      h(
                        'button',
                        {
                          onClick: () => setSort(sort.key === c.key ? { key: c.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'asc' }),
                          style: { all: 'unset', cursor: 'pointer' },
                        },
                        `${c.label || c.key}${sort.key === c.key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}`,
                      ),
                    ),
                  ),
                ),
              ),
              h(
                'tbody',
                {},
                shown.map((r, ri) => {
                  const on = marked.has(ri)
                  return h(
                    'tr',
                    {
                      key: ri,
                      className: props.onEvent ? 'cursor-pointer' : undefined,
                      onClick: props.onEvent && (() => props.onEvent({ type: 'drill', name: cmpVal(r[cols[0]?.key]), row: r, spec: props })),
                      style: {
                        background: on ? '#eff6ff' : ri % 2 ? '#f8fafc' : '#fff',
                        borderBottom: '1px solid #f1f5f9',
                        boxShadow: on ? `inset 3px 0 0 ${accent}` : undefined,
                        cursor: props.onEvent ? 'pointer' : undefined,
                      },
                    },
                    cols.map((c, ci) => cell(r, c, ci === 0, on)),
                  )
                }),
              ),
            ),
          ),
          view.length > collapsedRows &&
            h(
              'button',
              {
                onClick: () => setExpanded(!expanded),
                style: {
                  all: 'unset',
                  cursor: 'pointer',
                  display: 'block',
                  width: '100%',
                  textAlign: 'center',
                  marginTop: '8px',
                  padding: '5px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: accent,
                  borderTop: '1px solid #f1f5f9',
                },
              },
              expanded ? '▲' : `▼ +${view.length - collapsedRows}`,
            ),
        )
      },
  }),
})

const columns = [
  { key: 'name', label: 'Campaign' },
  { key: 'sessions', label: 'Sessions', format: 'int' },
  { key: 'revenue', label: 'Revenue', format: '$' },
]
const rows = [
  { name: 'Brand', sessions: 5200, revenue: 18400 },
  { name: 'Search', sessions: 3100, revenue: 9200 },
  { name: 'Social', sessions: 2400, revenue: 4100 },
]

Test('reactTest.viz.table', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'table', title: 'Campaign metrics', columns, rows },
        }),
    expectedResult: and(contains('Campaign metrics'), contains('Brand'), contains('5200'), contains('$18K')),
    userActions: delay(60),
  }),
})

Test('reactTest.viz.table.highlight', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'table', title: 'Top earner', columns, rows, highlight: { col: 'revenue', max: true, note: 'best campaign' } },
        }),
    expectedResult: and(contains('Top earner'), contains('best campaign'), contains('$18K')),
    userActions: delay(60),
  }),
})

// clicking a row drills with {name}=the first column value
Test('reactTest.viz.table.drillPanel', {
  impl: reactTest({
    testedComp: drillHost(
      { kind: 'table', title: 'Campaign metrics', columns, rows, drill: { kind: 'table', title: 'Days of {name}', sql: 'SELECT day, spend FROM t WHERE campaign = {name:q}' } },
      [{ day: 'Sunday', spend: 77 }],
    ),
    expectedResult: and(contains("WHERE campaign = 'Brand'"), contains('Days of Brand'), contains('Sunday'), contains('77')),
    userActions: [delay(80), click('Brand'), delay(150)],
  }),
})

const manyRows = [...Array(7)].map((_, i) => ({ name: 'camp' + i, sessions: i * 100, revenue: i * 10 }))

Test('reactTest.viz.table.collapsed', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'table', title: 'Long table', columns, rows: manyRows },
        }),
    expectedResult: and(contains('camp4'), notContains('camp6'), contains('▼ +2')),
    userActions: delay(60),
  }),
})

Test('reactTest.viz.table.expand', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'table', title: 'Long table', columns, rows: manyRows },
        }),
    expectedResult: contains('camp6'),
    userActions: [delay(60), click('▼ +2'), delay(60)],
  }),
})

Test('reactTest.viz.table.controls', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'table', title: 'Filtered campaigns', columns, rows, search: 'sea', filters: { sessions: '3100' }, sort: { key: 'revenue', dir: 'desc' } },
        }),
    expectedResult: and(contains('Filtered campaigns'), contains('Revenue ↓'), contains('1 of 3 rows'), contains('Search')),
    userActions: delay(60),
  }),
})
