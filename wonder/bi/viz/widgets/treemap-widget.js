import { dsls, jb, coreUtils } from '@jb6/core'
import '@jb6/common'
import '@jb6/testing'
import '@jb6/react/tests/react-testers.js'
import '../viz-core.js'
import { drillHost } from '../viz-test-helpers.js'

const {
  common: {
    boolean: { contains, and },
  },
  test: {
    Test,
    'ui-action': { delay, clickVizShape },
    test: { reactTest },
  },
} = dsls

// treemapWidget — many categories as area-proportional tiles in one block.
// `highlight` keeps the matched tile colored + emphasized and dims the rest; note shows as subtext.
const treemapOption = (props, V) => {
  const data = (V.asArray(props.data) || []).map((d, i) => ({ name: String(d.name ?? d.label ?? i), value: +(d.value ?? 0) || 0, color: d.color }))
  const hl = V.resolveExtremes(props.highlight, data)
  const note = data.map((d) => V.highlightNote(hl, d.name)).find(Boolean)
  const active = V.hasHighlight(hl)
  const colors = V.itemColors(hl, data)
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  const fmt = (v) => V.fmtNum(v, props.valueFormat)
  const ink = (c) => (parseInt(c.slice(1, 3), 16) * 0.299 + parseInt(c.slice(3, 5), 16) * 0.587 + parseInt(c.slice(5, 7), 16) * 0.114 > 150 ? V.INK : '#fff')
  return {
    ...V.titleBlock(props.title, note),
    tooltip: { formatter: (p) => `${p.name}<br/>${fmt(p.value)} · ${((p.value / total) * 100).toFixed(1)}%`, textStyle: { fontSize: 12 } },
    series: [
      {
        type: 'treemap',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        animationDuration: 300,
        top: props.title ? (note ? 60 : 44) : 12,
        left: 8,
        right: 8,
        bottom: 8,
        itemStyle: { gapWidth: 2, borderColor: '#fff', borderWidth: 2, borderRadius: 3 },
        label: {
          show: true,
          overflow: 'truncate',
          formatter: (p) => (p.value / total < 0.05 ? '' : `{n|${p.name}}\n{v|${fmt(p.value)}}`),
          rich: { n: { fontSize: 12, fontWeight: 600, lineHeight: 16 }, v: { fontSize: 11, lineHeight: 14 } },
        },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' } },
        data: data.map((d, i) => {
          const c = colors[i],
            txt = ink(c),
            on = active && c !== V.DIM
          return {
            name: d.name,
            value: d.value,
            itemStyle: { color: c, borderColor: on ? V.INK : '#fff', borderWidth: on ? 2.5 : 2 },
            label: { rich: { n: { color: txt, fontWeight: on ? 700 : 600 }, v: { color: txt, opacity: 0.85 } } },
          }
        }),
      },
    ],
  }
}

jb.vizUtils.vizComp('treemap', treemapOption, 'Treemap of area-proportional tiles for many categories; highlight emphasizes one tile')

const sample = [
  { name: 'Search', value: 420 },
  { name: 'Direct', value: 310 },
  { name: 'Social', value: 180 },
  { name: 'Email', value: 120 },
  { name: 'Referral', value: 90 },
  { name: 'Display', value: 60 },
]

Test('reactTest.viz.treemap', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'treemap', title: 'Traffic by channel', data: sample, valueFormat: 'int' },
        }),
    expectedResult: and(contains('Traffic by channel'), contains('Search')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.treemap.highlight', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'treemap', title: 'Top channel', data: sample, highlight: { max: true, note: 'dominant source' } },
        }),
    expectedResult: contains('dominant source'),
    userActions: delay(80),
  }),
})

// clicking a tile drills; the hovered tile is layout-dependent so assertions are prefix-based
Test('reactTest.viz.treemap.drillPanel', {
  impl: reactTest({
    testedComp: drillHost(
      {
        kind: 'treemap',
        title: 'Traffic by channel',
        data: sample,
        drill: { kind: 'treemap', title: 'Pages of {name}', sql: 'SELECT page AS name, views AS value FROM t WHERE channel = {name:q}' },
      },
      [
        { name: 'Landing page', value: 30 },
        { name: 'Pricing page', value: 20 },
      ],
    ),
    expectedResult: and(contains("WHERE channel = '"), contains('Pages of '), contains('Landing page')),
    userActions: [delay(120), clickVizShape({ shapeType: 'rect' }), delay(200)],
  }),
})
