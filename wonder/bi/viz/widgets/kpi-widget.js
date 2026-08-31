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
    test: { reactTest },
  },
  react: {
    'ui-action': { delay, click },
    ReactComp,
    'react-comp': { comp },
  },
} = dsls

// kpiWidget — scorecard of headline numbers, read at a glance. DOM (not a chart): no echarts, no
// importUrl. Value dominates > muted uppercase label > colored delta arrow; highlight accents one card (border+tint+INK), mutes rest, note under title.
ReactComp('kpiWidget', {
  description: 'KPI scorecard of headline numbers; highlight emphasizes one card',
  impl: comp({
    hFunc:
      (ctx, { react: { h } }) =>
      (props) => {
        const V = jb.vizUtils
        const items = (V.asArray(props.items) || []).map((d, i) => ({
          name: String(d.label ?? i),
          value: +d.value || 0,
          delta: d.delta,
          format: d.format ?? props.valueFormat,
          deltaFormat: props.deltaFormat ?? d.format ?? props.valueFormat,
          unit: d.unit,
        }))
        const highlight = V.asArray(props.highlight)?.map((h) => (h && typeof h === 'object' && h.label != null ? { ...h, name: h.label } : h))
        const hl = V.resolveExtremes(highlight, items)
        const note = items.map((d) => V.highlightNote(hl, d.name)).find(Boolean)
        const width = props.width || 540,
          active = V.hasHighlight(hl),
          accent = V.PALETTE[0]
        const deltaColor = (d) => (d === 0 ? V.MUTE : d > 0 ? V.PALETTE[1] : V.PALETTE[3])
        const card = (d, i) => {
          const on = active && V.matchHighlight(hl, d.name, i),
            muted = active && !on,
            dir = d.delta > 0 ? '▲' : d.delta < 0 ? '▼' : '▬'
          return h(
            'div',
            {
              key: i,
              className: props.onEvent ? 'cursor-pointer' : undefined,
              onClick: props.onEvent && (() => props.onEvent({ type: 'drill', name: d.name, value: d.value, spec: props })),
              style: {
                flex: '1 1 130px',
                minWidth: 0,
                padding: '13px 15px',
                borderRadius: '12px',
                background: on ? '#eff6ff' : '#f8fafc',
                border: on ? `2px solid ${accent}` : '1px solid #eef2f7',
                opacity: muted ? 0.6 : 1,
                boxSizing: 'border-box',
                cursor: props.onEvent ? 'pointer' : undefined,
              },
            },
            h(
              'div',
              {
                style: {
                  fontSize: '11px',
                  fontWeight: 600,
                  color: muted ? V.DIM : V.MUTE,
                  textTransform: 'uppercase',
                  letterSpacing: '.05em',
                  marginBottom: '7px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                },
              },
              d.name,
            ),
            h(
              'div',
              { style: { fontSize: '27px', fontWeight: 700, color: muted ? V.MUTE : V.INK, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em' } },
              V.fmtNum(d.value, d.format) + (d.unit ? ' ' + d.unit : ''),
            ),
            d.delta != null &&
              h(
                'div',
                { style: { fontSize: '12px', fontWeight: 600, marginTop: '5px', color: deltaColor(d.delta), fontVariantNumeric: 'tabular-nums' } },
                `${dir} ${V.fmtNum(Math.abs(d.delta), d.deltaFormat)}`,
              ),
          )
        }
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
          props.title && h('div', { style: { fontSize: '15px', fontWeight: 600, color: V.INK, marginBottom: '2px' } }, props.title),
          note && h('div', { style: { fontSize: '12px', fontWeight: 600, color: accent, marginBottom: '8px' } }, note),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '12px' } }, items.map(card)),
        )
      },
  }),
})

const items = [
  { label: 'Revenue', value: 128400, delta: 12.5, format: '$' },
  { label: 'Sessions', value: 9320, delta: -3.1, format: 'int' },
  { label: 'Conv Rate', value: 4.7, delta: 0.8, format: '%' },
]

Test('reactTest.viz.kpi', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'kpi', title: 'Performance', deltaFormat: '%', items },
        }),
    expectedResult: and(contains('Performance'), contains('Revenue'), contains('$128K'), contains('▲ 12.5%')),
    userActions: delay(60),
  }),
})

Test('reactTest.viz.kpi.highlight', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'kpi', title: 'Headline', items, highlight: { label: 'Revenue', note: 'best quarter yet' } },
        }),
    expectedResult: and(contains('Headline'), contains('$128K'), contains('best quarter yet')),
    userActions: delay(60),
  }),
})

// clicking a card drills with {name}=the KPI label
Test('reactTest.viz.kpi.drillPanel', {
  impl: reactTest({
    testedComp: drillHost(
      { kind: 'kpi', title: 'Performance', items, drill: { kind: 'kpi', title: 'Split of {name}', sql: 'SELECT segment AS label, amount AS value FROM t WHERE kpi = {name:q}' } },
      [
        { label: 'Organic', value: 61 },
        { label: 'Paid', value: 39 },
      ],
    ),
    expectedResult: and(contains("WHERE kpi = 'Sessions'"), contains('Split of Sessions'), contains('Organic'), contains('61')),
    userActions: [delay(80), click('Sessions'), delay(150)],
  }),
})
