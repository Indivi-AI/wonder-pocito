import { dsls, coreUtils } from '@jb6/core'
import '../echart-dsl.js'
import './viz-types.js'

const {echart: {ECharts, 'series': {radar, funnel, treemap, bar, scatter}, radar: {radarConfig}, title: {title}, tooltip: {tooltip},
  legend: {legend}, 'text-style': {textStyle}, 'axis-line': {axisLine}, 'axis-tick': {axisTick}, 'axis-label': {axisLabel},
  'split-line': {splitLine}, 'split-area': {splitArea}, 'line-style': {lineStyle}, 'area-style': {areaStyle}, 'item-style': {itemStyle},
  emphasis: {emphasis}, label: {label}, 'label-line': {labelLine}, breadcrumb: {breadcrumb}, 'graphic-element': {graphic}, grid: {grid},
  axis: {xAxis, yAxis}, 'axis-pointer': {axisPointer}}, viz: {'viz-theme': {defaultTheme}, 'viz-value-format': {compact}}} = dsls

ECharts('viz.radar', {
  params: [
    {id: 'indicators', as: 'array'},
    {id: 'series', type: 'viz-series<viz>[]'},
    {id: 'title', as: 'string', byName: true},
    {id: 'highlight', type: 'viz-highlight<viz>', byName: true},
    {id: 'valueFormat', type: 'viz-value-format<viz>', byName: true, defaultValue: compact()},
    {id: 'theme', type: 'viz-theme<viz>', defaultValue: defaultTheme()},
    {id: 'mainTitle', type: 'title<echart>', dynamic: true, defaultValue: title({
      text: '%title%',
      show: '%showTitle%',
      subtext: '%note%',
      left: 8,
      top: 6,
      textStyle: textStyle({ color: '%ink%', fontWeight: 600, fontSize: 15 }),
      subtextStyle: textStyle({ color: '%accent%', fontWeight: 600, fontSize: 12 })
    })},
    {id: 'tooltipOption', type: 'tooltip<echart>', dynamic: true, defaultValue: tooltip({ trigger: 'item', valueFormatter: (ctx, {format}) => format(ctx.data) })},
    {id: 'legendOption', type: 'legend<echart>', dynamic: true, defaultValue: legend({
      Data: '%legendData%',
      show: '%showLegend%',
      bottom: 2,
      textStyle: textStyle({ color: '#475569', fontSize: 12 })
    })},
    {id: 'radarOption', type: 'radar<echart>', dynamic: true, defaultValue: radarConfig({
      indicator: '%indicators%',
      center: '%center%',
      radius: '58%',
      axisName: textStyle({ color: '%mute%', fontSize: 11, padding: [2,4] }),
      axisNameGap: 8,
      splitNumber: 5,
      axisLine: axisLine({ lineStyle: lineStyle({ color: '#e2e8f0' }) }),
      splitLine: splitLine({ lineStyle: lineStyle({ color: '#eef2f7' }) }),
      splitArea: splitArea({ areaStyle: areaStyle({ color: ['#fafbfc','#ffffff'] }) })
    })},
    {id: 'seriesOption', type: 'series<echart>', dynamic: true, defaultValue: radar({ Data: '%seriesData%', symbolSize: 4 })}
  ],
  impl: (ctx, {}, {indicators, series, title, highlight, valueFormat, theme, mainTitle, tooltipOption, legendOption, radarOption, seriesOption}) => {
    indicators = coreUtils.asArray(indicators).map(item => ({name: String(item.name ?? ''), max: +(item.max ?? 1) || 1}))
    series = coreUtils.asArray(series).map(item => ({name: String(item.name ?? ''), values: coreUtils.asArray(item.values).map(value => +value || 0)}))
    const highlights = coreUtils.asArray(highlight).map(item => item.resolve(ctx.setData(series))), active = !!highlights.length
    const {palette, dim, ink, mute, fontFamily} = theme, matches = (item, index) => highlights.some(mark => mark.matches(ctx.setData({item, index})))
    const note = highlights.find(item => item.note)?.note, format = value => valueFormat(ctx.setData(value))
    const seriesData = series.map((item, index) => {const on = !active || matches(item, index), color = on ? palette[index % palette.length] : dim
      return {name: item.name, value: item.values, lineStyle: {color, width: on ? active ? 3 : 2.4 : 1.2, opacity: on ? 1 : .85},
        itemStyle: {color}, areaStyle: {color, opacity: on ? active ? .28 : .16 : .04},
        emphasis: {lineStyle: {width: on ? 3.5 : 1.2}, areaStyle: {opacity: on ? .35 : .06}}, z: on ? 3 : 1}})
    const optionCtx = ctx.setData({title: title || '', showTitle: !!(title || note), note: note || '', ink, mute, accent: palette[0],
      indicators, center: ['50%', title ? '57%' : '52%'], legendData: series.map(item => item.name), showLegend: series.length > 1, seriesData}).setVars({format})
    return {color: palette, animation: !globalThis.window?.testing, textStyle: {fontFamily}, title: mainTitle(optionCtx),
      tooltip: tooltipOption(optionCtx), legend: legendOption(optionCtx), radar: radarOption(optionCtx), series: [seriesOption(optionCtx)]}
  }
})

ECharts('viz.funnel', {
  params: [
    {id: 'stages', as: 'array'},
    {id: 'title', as: 'string', byName: true},
    {id: 'highlight', type: 'viz-highlight<viz>', byName: true},
    {id: 'valueFormat', type: 'viz-value-format<viz>', byName: true, defaultValue: compact()},
    {id: 'theme', type: 'viz-theme<viz>', defaultValue: defaultTheme()},
    {id: 'height', as: 'number', defaultValue: 320},
    {id: 'mainTitle', type: 'title<echart>', dynamic: true, defaultValue: title({
      text: '%title%',
      show: '%showTitle%',
      subtext: '%note%',
      left: 8,
      top: 6,
      textStyle: textStyle({ color: '%ink%', fontWeight: 600, fontSize: 15 }),
      subtextStyle: textStyle({ color: '%accent%', fontWeight: 600, fontSize: 12 })
    })},
    {id: 'tooltipOption', type: 'tooltip<echart>', dynamic: true, defaultValue: tooltip({
      trigger: 'item',
      valueFormatter: (ctx, {format, percent}) => `${format(ctx.data)} (${percent(ctx.data)})`,
      textStyle: textStyle({ fontSize: 12 })
    })},
    {id: 'seriesOption', type: 'series<echart>', dynamic: true, defaultValue: funnel({
      Data: '%seriesData%',
      sort: 'descending',
      top: '%top%',
      bottom: 20,
      left: 8,
      right: 96,
      gap: 6,
      min: 0,
      max: '%max%',
      funnelAlign: 'center',
      minSize: '18%',
      itemStyle: itemStyle({ borderColor: '#fff', borderWidth: 2 }),
      emphasis: emphasis({
        itemStyle: itemStyle({ shadowBlur: 10, shadowColor: 'rgba(37,99,235,0.3)' }),
        label: label({ fontSize: 13 })
      }),
      label: label({
        position: 'inside',
        color: '#fff',
        fontSize: 11,
        formatter: (ctx, {format, percent}) => `${format(ctx.data.value)} · ${percent(ctx.data.value)}`
      }),
      labelLine: labelLine({ length: 24, lineStyle: lineStyle({ color: '%mute%' }) })
    })},
    {id: 'stageName', type: 'graphic-element<echart>', dynamic: true,
      defaultValue: graphic({ type: 'text', z: 20, right: 8, top: '%stageTop%', style: '%stageStyle%', silent: true })}
  ],
  impl: (ctx, {}, {stages, title, highlight, valueFormat, theme, height, mainTitle, tooltipOption, seriesOption, stageName}) => {
    const data = coreUtils.asArray(stages).map((item, index) => ({name: String(item.name ?? item.label ?? index), value: +(item.value ?? item.y ?? 0) || 0,
      color: item.color}))
    const highlights = coreUtils.asArray(highlight).map(item => item.resolve(ctx.setData(data))), active = !!highlights.length
    const {palette, dim, ink, mute, fontFamily} = theme, matches = (item, index) => highlights.some(mark => mark.matches(ctx.setData({item, index})))
    const note = highlights.find(item => item.note)?.note, max = data[0]?.value || 1, format = value => valueFormat(ctx.setData(value))
    const percent = value => `${(value / max * 100).toFixed(value / max >= .1 ? 0 : 1)}%`, top = title ? note ? 66 : 50 : 20
    const on = (item, index) => !active || matches(item, index), seriesData = data.map((item, index) => ({name: item.name, value: item.value,
      itemStyle: {color: on(item, index) ? item.color || palette[index % palette.length] : dim, opacity: on(item, index) ? 1 : .85},
      label: {fontWeight: on(item, index) ? 700 : 400}, labelLine: {show: true}, emphasis: {label: {position: 'right', color: ink,
        formatter: `${item.name}: ${format(item.value)} (${percent(item.value)})`}}}))
    const optionCtx = ctx.setData({title: title || '', showTitle: !!(title || note), note: note || '', ink, mute, accent: palette[0], top, max,
      seriesData}).setVars({format, percent})
    return {color: palette, animation: !globalThis.window?.testing, textStyle: {fontFamily}, title: mainTitle(optionCtx), tooltip: tooltipOption(optionCtx),
      series: [seriesOption(optionCtx)], graphic: data.map((item, index) => stageName(optionCtx.setData({stageTop: top + (height - top - 20) * (index + .5) / data.length,
        stageStyle: {text: item.name, fill: on(item, index) ? ink : mute,
          font: `${on(item, index) ? 600 : 400} 11px ${fontFamily}`, textAlign: 'right', textVerticalAlign: 'middle'}})))}
  }
})

ECharts('viz.treemap', {
  params: [
    {id: 'items', as: 'array'},
    {id: 'title', as: 'string', byName: true},
    {id: 'highlight', type: 'viz-highlight<viz>', byName: true},
    {id: 'valueFormat', type: 'viz-value-format<viz>', byName: true, defaultValue: compact()},
    {id: 'theme', type: 'viz-theme<viz>', defaultValue: defaultTheme()},
    {id: 'mainTitle', type: 'title<echart>', dynamic: true, defaultValue: title({
      text: '%title%',
      show: '%showTitle%',
      subtext: '%note%',
      left: 8,
      top: 6,
      textStyle: textStyle({ color: '%ink%', fontWeight: 600, fontSize: 15 }),
      subtextStyle: textStyle({ color: '%accent%', fontWeight: 600, fontSize: 12 })
    })},
    {id: 'tooltipOption', type: 'tooltip<echart>', dynamic: true, defaultValue: tooltip({
      formatter: (ctx, {format, total}) =>
      `${ctx.data.name}<br/>${format(ctx.data.value)} · ${(ctx.data.value / total * 100).toFixed(1)}%`,
      textStyle: textStyle({ fontSize: 12 })
    })},
    {id: 'seriesOption', type: 'series<echart>', dynamic: true, defaultValue: treemap({
      Data: '%seriesData%',
      roam: false,
      nodeClick: false,
      breadcrumb: breadcrumb({ show: false }),
      animationDuration: 300,
      top: '%top%',
      left: 8,
      right: 8,
      bottom: 8,
      itemStyle: itemStyle({ borderColor: '#fff', borderWidth: 2, borderRadius: 3, gapWidth: 2 }),
      label: label({
        show: true,
        formatter: (ctx, {format, total}) => ctx.data.value / total < .05 ? ''
        : `{n|${ctx.data.name}}\n{v|${format(ctx.data.value)}}`,
        overflow: 'truncate',
        rich: {n: {fontSize: 12, fontWeight: 600, lineHeight: 16}, v: {fontSize: 11, lineHeight: 14}}
      }),
      emphasis: emphasis({ itemStyle: itemStyle({ shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' }) })
    })}
  ],
  impl: (ctx, {}, {items, title, highlight, valueFormat, theme, mainTitle, tooltipOption, seriesOption}) => {
    const data = coreUtils.asArray(items).map((item, index) => ({name: String(item.name ?? item.label ?? index), value: +(item.value ?? 0) || 0,
      color: item.color}))
    const highlights = coreUtils.asArray(highlight).map(item => item.resolve(ctx.setData(data))), active = !!highlights.length
    const {palette, dim, ink, mute, fontFamily} = theme, matches = (item, index) => highlights.some(mark => mark.matches(ctx.setData({item, index})))
    const note = highlights.find(item => item.note)?.note, total = data.reduce((sum, item) => sum + item.value, 0) || 1
    const format = value => valueFormat(ctx.setData(value)), contrast = color => parseInt(color.slice(1, 3), 16) * .299
      + parseInt(color.slice(3, 5), 16) * .587 + parseInt(color.slice(5, 7), 16) * .114 > 150 ? ink : '#fff'
    const seriesData = data.map((item, index) => {const on = active && matches(item, index), color = active && !on ? dim : item.color || palette[index % palette.length]
      return {name: item.name, value: item.value, itemStyle: {color, borderColor: on ? ink : '#fff', borderWidth: on ? 2.5 : 2},
        label: {rich: {n: {color: contrast(color), fontWeight: on ? 700 : 600}, v: {color: contrast(color), opacity: .85}}}}})
    const optionCtx = ctx.setData({title: title || '', showTitle: !!(title || note), note: note || '', ink, mute, accent: palette[0],
      top: title ? note ? 60 : 44 : 12, seriesData}).setVars({format, total})
    return {color: palette, animation: !globalThis.window?.testing, textStyle: {fontFamily}, title: mainTitle(optionCtx),
      tooltip: tooltipOption(optionCtx), series: [seriesOption(optionCtx)]}
  }
})

ECharts('viz.bullet', {
  params: [
    {id: 'measures', as: 'array'},
    {id: 'title', as: 'string', byName: true},
    {id: 'highlight', type: 'viz-highlight<viz>', byName: true},
    {id: 'valueFormat', type: 'viz-value-format<viz>', byName: true, defaultValue: compact()},
    {id: 'theme', type: 'viz-theme<viz>', defaultValue: defaultTheme()},
    {id: 'mainTitle', type: 'title<echart>', dynamic: true, defaultValue: title({
      text: '%title%',
      show: '%showTitle%',
      subtext: '%note%',
      left: 8,
      top: 6,
      textStyle: textStyle({ color: '%ink%', fontWeight: 600, fontSize: 15 }),
      subtextStyle: textStyle({ color: '%accent%', fontWeight: 600, fontSize: 12 })
    })},
    {id: 'gridOption', type: 'grid<echart>', dynamic: true, defaultValue: grid({ left: 12, right: 70, top: '%top%', bottom: 22, containLabel: true })},
    {id: 'tooltipOption', type: 'tooltip<echart>', dynamic: true, defaultValue: tooltip({
      trigger: 'axis',
      valueFormatter: (ctx, {format}) => format(ctx.data),
      textStyle: textStyle({ fontSize: 12 }),
      axisPointer: axisPointer({ type: 'shadow' })
    })},
    {id: 'valueAxis', type: 'axis<echart>', dynamic: true, defaultValue: xAxis({
      type: 'value',
      axisLine: axisLine({ show: false }),
      axisTick: axisTick({ show: false }),
      axisLabel: axisLabel({ color: '%mute%', fontSize: 10, formatter: (ctx, {format}) => format(ctx.data) }),
      splitLine: splitLine({ show: false })
    })},
    {id: 'categoryAxis', type: 'axis<echart>', dynamic: true, defaultValue: yAxis({
      type: 'category',
      Data: '%names%',
      axisLine: axisLine({ lineStyle: lineStyle({ color: '%dim%' }) }),
      axisTick: axisTick({ show: false }),
      axisLabel: axisLabel({ color: '%ink%', fontSize: 11, fontWeight: 600 }),
      inverse: true
    })},
    {id: 'bandSeries', type: 'series<echart>', dynamic: true, defaultValue: bar({
      Data: '%Data%',
      stack: 'band',
      silent: true,
      barWidth: '68%',
      emphasis: emphasis({ disabled: true }),
      z: 1
    })},
    {id: 'valueSeries', type: 'series<echart>', dynamic: true, defaultValue: bar({
      Data: '%values%',
      name: 'value',
      barWidth: '26%',
      barGap: '-100%',
      itemStyle: itemStyle({ borderRadius: 2 }),
      label: label({
        show: true,
        position: 'right',
        fontSize: 10,
        formatter: (ctx, {format, items}) => `${format(items[ctx.data.dataIndex].value)} / ${format(items[ctx.data.dataIndex].target)}`
      }),
      z: 3
    })},
    {id: 'targetSeries', type: 'series<echart>', dynamic: true, defaultValue: scatter({
      Data: '%targets%',
      name: 'target',
      symbol: 'rect',
      symbolSize: [3,24],
      silent: true,
      z: 4
    })}
  ],
  impl: (ctx, {}, {measures: data, title, highlight, valueFormat, theme, mainTitle, gridOption, tooltipOption, valueAxis, categoryAxis,
    bandSeries, valueSeries, targetSeries}) => {
    const items = coreUtils.asArray(data).map((item, index) => ({name: String(item.name ?? item.label ?? index), value: +(item.value ?? 0) || 0,
      target: +(item.target ?? 0) || 0, ranges: coreUtils.asArray(item.ranges).map(Number).sort((a, b) => a - b)}))
    const highlights = coreUtils.asArray(highlight).map(item => item.resolve(ctx.setData(items))), active = !!highlights.length
    const {palette, dim, ink, mute, fontFamily} = theme, matches = (item, index) => highlights.some(mark => mark.matches(ctx.setData({item, index})))
    const on = (item, index) => !active || matches(item, index), note = highlights.find(item => item.note)?.note
    const count = Math.max(0, ...items.map(item => item.ranges.length)), format = value => valueFormat(ctx.setData(value))
    const shade = (band, lit) => {const ratio = count > 1 ? band / (count - 1) : 0, level = Math.round((lit ? 240 : 247) - ratio * (lit ? 66 : 14))
      return `rgb(${level},${level + 5},${level + 11})`}
    const optionCtx = ctx.setData({title: title || '', showTitle: !!(title || note), note: note || '', ink, mute, dim, accent: palette[0],
      top: title ? note ? 62 : 46 : 18, names: items.map(item => item.name), values: items.map((item, index) => ({value: item.value,
        itemStyle: {color: on(item, index) ? palette[index % palette.length] : dim}, label: {color: on(item, index) ? ink : mute,
          fontWeight: active && on(item, index) ? 700 : 500}})), targets: items.map((item, index) => ({value: [item.target, item.name],
        itemStyle: {color: on(item, index) ? ink : dim}}))}).setVars({format, items})
    const bands = Array.from({length: count}, (_, band) => bandSeries(optionCtx.setData({Data: items.map((item, index) => ({
      value: (item.ranges[band] ?? 0) - (band ? item.ranges[band - 1] ?? 0 : 0), itemStyle: {color: shade(band, on(item, index))}}))})))
    return {color: palette, animation: !globalThis.window?.testing, textStyle: {fontFamily}, title: mainTitle(optionCtx), grid: gridOption(optionCtx),
      tooltip: tooltipOption(optionCtx), xAxis: valueAxis(optionCtx), yAxis: categoryAxis(optionCtx),
      series: [...bands, valueSeries(optionCtx), targetSeries(optionCtx)]}
  }
})
