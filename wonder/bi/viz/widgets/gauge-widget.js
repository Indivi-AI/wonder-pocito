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
    'ui-action': { delay, clickVizShape },
  },
} = dsls

// gaugeWidget — one KPI value on a radial arc against a [min,max] range; when a
// target is given the note surfaces value-vs-target and highlight emphasizes it.
const gaugeOption = (props, V) => {
  const value = +(props.value ?? 0) || 0,
    min = +(props.min ?? 0) || 0,
    max = +(props.max ?? 100) || 100
  const fmt = (v) => V.fmtNum(v, props.valueFormat)
  const target = props.target == null ? null : +props.target
  const onTarget = target == null || value >= target
  const arc = target == null ? V.colorAt(0) : onTarget ? V.PALETTE[1] : V.PALETTE[2]
  const targetNote = target == null ? undefined : `${fmt(value)} ${onTarget ? 'above' : 'below'} target ${fmt(target)}`
  const note = V.highlightNote(props.highlight) || (V.hasHighlight(props.highlight) ? targetNote : undefined)
  const top = props.title ? (note ? 30 : 14) : 0
  const anchor = target == null ? [] : [{ value: target, itemStyle: { color: V.INK } }]
  return {
    ...V.titleBlock(props.title, note),
    series: [
      {
        type: 'gauge',
        min,
        max,
        radius: '76%',
        center: ['50%', 62 + top + '%'],
        startAngle: 215,
        endAngle: -35,
        progress: { show: true, width: 16, roundCap: true, itemStyle: { color: arc } },
        axisLine: { lineStyle: { width: 16, color: [[1, V.DIM]] } },
        axisTick: { distance: -20, length: 5, lineStyle: { color: V.MUTE, width: 1 } },
        splitLine: { distance: -22, length: 12, lineStyle: { color: V.MUTE, width: 2 } },
        pointer: { width: 5, length: '62%', itemStyle: { color: V.INK } },
        anchor: { show: true, size: 14, itemStyle: { color: V.INK } },
        axisLabel: { distance: -2, formatter: fmt, color: V.MUTE, fontSize: 10 },
        detail: { valueAnimation: false, formatter: () => fmt(value), fontSize: 30, fontWeight: 700, color: V.INK, offsetCenter: [0, '32%'] },
        title: { show: target != null, offsetCenter: [0, '58%'], color: V.MUTE, fontSize: 12, fontWeight: 600 },
        data: [{ value, name: target == null ? '' : `target ${fmt(target)}` }],
        markLine: {},
      },
      {
        type: 'gauge',
        min,
        max,
        radius: '76%',
        center: ['50%', 62 + top + '%'],
        startAngle: 215,
        endAngle: -35,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        pointer: { show: false },
        anchor: { show: false },
        detail: { show: false },
        markPoint: { symbol: 'triangle', symbolSize: 11, itemStyle: { color: V.INK } },
        data: anchor.map((a) => ({
          ...a,
          name: 'target',
          pointer: { show: true, length: '92%', width: 3, offsetCenter: [0, 0], keepAspect: false, icon: 'rect', itemStyle: { color: onTarget ? V.PALETTE[1] : V.PALETTE[3] } },
        })),
      },
    ],
  }
}

// a gauge has one value, so the widget title is the click identity
const gaugeClickInfo = (p, props) => ({ name: String(props.title ?? ''), value: props.value })

jb.vizUtils.vizComp('gauge', gaugeOption, 'Radial gauge for one KPI against a range; note surfaces value vs target and highlight emphasizes it', gaugeClickInfo)

Test('reactTest.viz.gauge', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'gauge', title: 'CPU load', value: 72, max: 100, target: 80, valueFormat: 'int' },
        }),
    expectedResult: and(contains('CPU load'), contains('72')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.gauge.highlight', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'gauge', title: 'Quota', value: 95, max: 100, target: 80, highlight: { note: 'above target' }, valueFormat: 'int' },
        }),
    expectedResult: contains('above target'),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.gauge.drillPanel', {
  impl: reactTest({
    testedComp: drillHost(
      {
        kind: 'gauge',
        title: 'CPU load',
        value: 72,
        max: 100,
        drill: { kind: 'gauge', title: 'Peak {name}', sql: 'SELECT max(load) AS value, 0 AS min, 100 AS max FROM t WHERE metric = {name:q}' },
      },
      [{ value: 93, min: 0, max: 100 }],
    ),
    expectedResult: and(contains("WHERE metric = 'CPU load'"), contains('Peak CPU load'), contains('93')),
    userActions: [delay(120), clickVizShape(), delay(200)],
  }),
})
