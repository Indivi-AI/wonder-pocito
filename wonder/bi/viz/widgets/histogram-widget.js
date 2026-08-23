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

// histogramWidget — distribution of one numeric variable, bucketed into equal-width
// bins (bars touch, categoryGap:0 + thin separators). highlight ({min}/{max}, index,
// or {range:[lo,hi]}) accents one bin (full color) and dims the rest; note as subtext.
const histogramOption = (props, V) => {
  const values = (V.asArray(props.values ?? props.data) || []).map((v) => +v).filter((v) => !isNaN(v))
  const bins = Math.max(1, Math.round(props.bins) || 10)
  const min = Math.min(...values),
    max = Math.max(...values),
    step = (max - min || 1) / bins
  const fmt = (v) => V.fmtNum(Math.round(v * 1e4) / 1e4, props.valueFormat)
  const counts = Array.from({ length: bins }, () => 0)
  values.forEach((v) => counts[Math.min(bins - 1, Math.floor((v - min) / step))]++)
  const edges = counts.map((_, i) => fmt(min + step * i)).concat(fmt(max))
  const labels = counts.map((_, i) => `${edges[i]}–${edges[i + 1]}`)
  const items = counts.map((c, i) => ({ name: labels[i], value: c }))
  const rangeToName = (h) =>
    h && typeof h === 'object' && h.range ? { name: labels[counts.findIndex((_, k) => min + step * (k + 1) > h.range[0] && min + step * k < h.range[1])] ?? '', note: h.note } : h
  const hl = V.resolveExtremes(props.highlight, items).map(rangeToName)
  const note = items.map((d) => V.highlightNote(hl, d.name)).find(Boolean)
  const active = V.hasHighlight(hl)
  const barColor = (i) => (active ? (V.matchHighlight(hl, labels[i], i) ? V.PALETTE[0] : V.DIM) : V.PALETTE[0])
  const width = props.width || 540
  const thin = Math.max(1, Math.ceil(bins / Math.max(4, Math.floor(width / 56))))
  const fmtC = (v) => V.fmtNum(v, props.countFormat || 'int')
  return {
    ...V.titleBlock(props.title, note),
    grid: { left: 46, right: 16, top: props.title ? (note ? 60 : 46) : 16, bottom: props.xLabel ? 46 : 34, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, textStyle: { fontSize: 12 }, formatter: (p) => `${p[0].axisValue}<br/><b>${fmtC(p[0].value)}</b>` },
    xAxis: {
      type: 'category',
      data: labels,
      name: props.xLabel,
      nameLocation: 'middle',
      nameGap: 30,
      nameTextStyle: { color: V.MUTE, fontSize: 11 },
      axisTick: { alignWithLabel: true, lineStyle: { color: V.DIM } },
      axisLine: { lineStyle: { color: V.DIM } },
      axisLabel: { color: V.MUTE, fontSize: 10, interval: thin - 1, hideOverlap: true, rotate: bins > 8 ? 32 : 0 },
    },
    yAxis: {
      type: 'value',
      name: props.yLabel || 'count',
      nameTextStyle: { color: V.MUTE, fontSize: 11, align: 'left' },
      nameGap: 10,
      minInterval: 1,
      axisLabel: { color: V.MUTE, fontSize: 10, formatter: fmtC },
      splitLine: { lineStyle: { color: '#f1f5f9' } },
    },
    series: [
      {
        type: 'bar',
        barCategoryGap: 0,
        itemStyle: { color: '#fff', borderColor: '#fff', borderWidth: 1 },
        emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(37,99,235,0.25)' } },
        data: counts.map((c, i) => ({ value: c, itemStyle: { color: barColor(i), borderColor: '#fff', borderWidth: 1 } })),
        label: {
          show: true,
          position: 'top',
          fontSize: 10,
          formatter: (p) => (p.value ? fmtC(p.value) : ''),
          color: (p) => (active && V.matchHighlight(hl, labels[p.dataIndex], p.dataIndex) ? V.INK : V.MUTE),
        },
      },
    ],
  }
}

jb.vizUtils.vizComp('histogram', histogramOption, 'Histogram of one numeric variable bucketed into equal-width bins; highlight accents a bin or range')

const sample = [4, 7, 7, 8, 9, 9, 9, 10, 11, 11, 12, 12, 13, 13, 14, 15, 16, 18, 21, 23, 5, 6, 8, 10, 10, 11, 12, 14, 17, 20]

Test('reactTest.viz.histogram', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'histogram', title: 'Response times', values: sample, bins: 6, xLabel: 'ms', valueFormat: 'int' },
        }),
    expectedResult: and(contains('Response times'), contains('count'), contains('4–')),
    userActions: delay(80),
  }),
})

Test('reactTest.viz.histogram.highlight', {
  impl: reactTest({
    testedComp:
      (ctx, { react: { hh } }) =>
      () =>
        hh(ctx, dsls.react['react-comp'].VizWidget, {
          spec: { kind: 'histogram', title: 'Latency spread', values: sample, bins: 6, highlight: { max: true, note: 'modal bucket' } },
        }),
    expectedResult: contains('modal bucket'),
    userActions: delay(80),
  }),
})

// clicking a bin drills with {name}=the bin range label
Test('reactTest.viz.histogram.drillPanel', {
  impl: reactTest({
    testedComp: drillHost(
      {
        kind: 'histogram',
        title: 'Response times',
        values: sample,
        bins: 6,
        valueFormat: 'int',
        drill: { kind: 'histogram', title: 'Bin {name}', sql: 'SELECT latency AS value FROM t WHERE bin = {name:q}' },
      },
      [{ value: 1 }, { value: 2 }, { value: 2 }, { value: 3 }],
    ),
    expectedResult: and(contains("WHERE bin = '4–7'"), contains('Bin 4–7')),
    userActions: [delay(120), clickVizShape({ shapeType: 'rect' }), delay(200)],
  }),
})
