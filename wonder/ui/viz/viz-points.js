import { dsls, coreUtils } from '@jb6/core'
import '../echart-dsl.js'
import './viz-types.js'

const {echart: {ECharts, 'series': {scatter}, 'title': {title}, 'tooltip': {tooltip}, 'text-style': {textStyle}, 'grid': {grid},
  'axis': {xAxis, yAxis}, 'axis-label': {axisLabel}, 'split-line': {splitLine}, 'line-style': {lineStyle}, 'item-style': {itemStyle},
  'emphasis': {emphasis}, 'data-zoom': {dataZoom}}, viz: {'viz-theme': {defaultTheme}, 'viz-value-format': {compact}}} = dsls

ECharts('viz.scatter', {
  params: [
    {id: 'points', as: 'array'},
    {id: 'title', as: 'string', byName: true},
    {id: 'highlight', type: 'viz-highlight<viz>', byName: true},
    {id: 'valueFormat', type: 'viz-value-format<viz>', byName: true, defaultValue: compact()},
    {id: 'xFormat', type: 'viz-value-format<viz>'},
    {id: 'yFormat', type: 'viz-value-format<viz>'},
    {id: 'theme', type: 'viz-theme<viz>', defaultValue: defaultTheme()},
    {id: 'xLabel', as: 'string'},
    {id: 'yLabel', as: 'string'},
    {id: 'mainTitle', type: 'title<echart>', dynamic: true, defaultValue: title({
      text: '%title%',
      show: '%showTitle%',
      subtext: '%note%',
      left: 8,
      top: 6,
      textStyle: textStyle({ color: '%ink%', fontWeight: 600, fontSize: 15 }),
      subtextStyle: textStyle({ color: '%accent%', fontWeight: 600, fontSize: 12 })
    })},
    {id: 'gridOption', type: 'grid<echart>', dynamic: true, defaultValue: grid({ left: 56, right: '%gridRight%', top: '%gridTop%', bottom: '%gridBottom%' })},
    {id: 'tooltipOption', type: 'tooltip<echart>', dynamic: true, defaultValue: tooltip({ trigger: 'item', formatter: (ctx, vars) => vars.tooltip(ctx.data) })},
    {id: 'xAxisOption', type: 'axis<echart>', dynamic: true, defaultValue: xAxis({
      type: 'value',
      name: '%xLabel%',
      nameLocation: 'middle',
      nameGap: 26,
      nameTextStyle: textStyle({ color: '%mute%', fontSize: 11 }),
      axisLabel: axisLabel({ color: '%mute%', fontSize: 10, formatter: (ctx, {formatX}) => formatX(ctx.data) }),
      splitLine: splitLine({ lineStyle: lineStyle({ color: '#f1f5f9' }) }),
      scale: true
    })},
    {id: 'yAxisOption', type: 'axis<echart>', dynamic: true, defaultValue: yAxis({
      type: 'value',
      name: '%yLabel%',
      nameTextStyle: textStyle({ color: '%mute%', fontSize: 11 }),
      axisLabel: axisLabel({ color: '%mute%', fontSize: 10, formatter: (ctx, {formatY}) => formatY(ctx.data) }),
      splitLine: splitLine({ lineStyle: lineStyle({ color: '#f1f5f9' }) }),
      scale: true
    })},
    {id: 'xZoom', type: 'data-zoom<echart>', dynamic: true, defaultValue: dataZoom({ type: 'inside', xAxisIndex: 0 })},
    {id: 'yZoom', type: 'data-zoom<echart>', dynamic: true, defaultValue: dataZoom({ type: 'inside', yAxisIndex: 0 })},
    {id: 'seriesOption', type: 'series<echart>', dynamic: true, defaultValue: scatter({
      Data: '%seriesData%',
      emphasis: emphasis({
        focus: 'self',
        scale: true,
        scaleSize: 6,
        itemStyle: itemStyle({ borderColor: '%ink%', borderWidth: 1.5 })
      })
    })}
  ],
  impl: (ctx, {}, {points, title, highlight, valueFormat, xFormat, yFormat, theme, xLabel, yLabel,
    mainTitle, gridOption, tooltipOption, xAxisOption, yAxisOption, xZoom, yZoom, seriesOption}) => {
    const items = coreUtils.asArray(points).map((item, index) => ({name: String(item.name ?? index), x: +item.x || 0, y: +item.y || 0}))
    const highlights = coreUtils.asArray(highlight).map(item => item.resolve(ctx.setData(items.map(({name, y}) => ({name, value: y})))))
    const active = !!highlights.length, {palette, dim, ink, mute, fontFamily} = theme
    const matches = (item, index) => highlights.some(mark => mark.matches(ctx.setData({item, index})))
    const note = highlights.find(item => item.note)?.note, formatX = value => (xFormat || valueFormat)(ctx.setData(value))
    const formatY = value => (yFormat || valueFormat)(ctx.setData(value)), tooltip = p => `${items[p.dataIndex].name}<br/>${xLabel || 'x'}: `
      + `${formatX(p.value[0])}<br/>${yLabel || 'y'}: ${formatY(p.value[1])}`
    const optionCtx = ctx.setData({title: title || '', showTitle: !!(title || note), note: note || '', ink, mute, accent: palette[0],
      gridRight: 18, gridTop: note ? title ? 68 : 44 : title ? 50 : 18, gridBottom: 52, xLabel: xLabel || '', yLabel: yLabel || '',
      seriesData: items.map((item, index) => {const on = !active || matches(item, index); return {name: item.name, value: [item.x, item.y],
        symbolSize: on ? 18 : 11, itemStyle: {color: on ? palette[0] : dim, opacity: on ? .95 : .5, borderColor: '#fff', borderWidth: on ? 1 : 0}}})})
      .setVars({formatX, formatY, tooltip})
    return {color: palette, animation: !globalThis.window?.testing, textStyle: {fontFamily}, title: mainTitle(optionCtx), grid: gridOption(optionCtx),
      tooltip: tooltipOption(optionCtx), xAxis: xAxisOption(optionCtx), yAxis: yAxisOption(optionCtx),
      dataZoom: [xZoom(optionCtx), yZoom(optionCtx)], series: [seriesOption(optionCtx)]}
  }
})

ECharts('viz.bubble', {
  params: [
    {id: 'points', as: 'array'},
    {id: 'title', as: 'string', byName: true},
    {id: 'highlight', type: 'viz-highlight<viz>', byName: true},
    {id: 'valueFormat', type: 'viz-value-format<viz>', byName: true, defaultValue: compact()},
    {id: 'xFormat', type: 'viz-value-format<viz>'},
    {id: 'yFormat', type: 'viz-value-format<viz>'},
    {id: 'theme', type: 'viz-theme<viz>', defaultValue: defaultTheme()},
    {id: 'xLabel', as: 'string'},
    {id: 'yLabel', as: 'string'},
    {id: 'sizeLabel', as: 'string'},
    {id: 'mainTitle', type: 'title<echart>', dynamic: true, defaultValue: title({
      text: '%title%',
      show: '%showTitle%',
      subtext: '%note%',
      left: 8,
      top: 6,
      textStyle: textStyle({ color: '%ink%', fontWeight: 600, fontSize: 15 }),
      subtextStyle: textStyle({ color: '%accent%', fontWeight: 600, fontSize: 12 })
    })},
    {id: 'gridOption', type: 'grid<echart>', dynamic: true, defaultValue: grid({ left: 56, right: '%gridRight%', top: '%gridTop%', bottom: '%gridBottom%' })},
    {id: 'tooltipOption', type: 'tooltip<echart>', dynamic: true, defaultValue: tooltip({ trigger: 'item', formatter: (ctx, vars) => vars.tooltip(ctx.data) })},
    {id: 'xAxisOption', type: 'axis<echart>', dynamic: true, defaultValue: xAxis({
      type: 'value',
      name: '%xLabel%',
      nameLocation: 'middle',
      nameGap: 26,
      nameTextStyle: textStyle({ color: '%mute%', fontSize: 11 }),
      axisLabel: axisLabel({ color: '%mute%', fontSize: 10, formatter: (ctx, {formatX}) => formatX(ctx.data) }),
      splitLine: splitLine({ lineStyle: lineStyle({ color: '#f1f5f9' }) }),
      scale: true
    })},
    {id: 'yAxisOption', type: 'axis<echart>', dynamic: true, defaultValue: yAxis({
      type: 'value',
      name: '%yLabel%',
      nameTextStyle: textStyle({ color: '%mute%', fontSize: 11 }),
      axisLabel: axisLabel({ color: '%mute%', fontSize: 10, formatter: (ctx, {formatY}) => formatY(ctx.data) }),
      splitLine: splitLine({ lineStyle: lineStyle({ color: '#f1f5f9' }) }),
      scale: true
    })},
    {id: 'xZoom', type: 'data-zoom<echart>', dynamic: true, defaultValue: dataZoom({ type: 'inside', xAxisIndex: 0 })},
    {id: 'yZoom', type: 'data-zoom<echart>', dynamic: true, defaultValue: dataZoom({ type: 'inside', yAxisIndex: 0 })},
    {id: 'seriesOption', type: 'series<echart>', dynamic: true, defaultValue: scatter({ Data: '%seriesData%' })}
  ],
  impl: (ctx, {}, {points, title, highlight, valueFormat, xFormat, yFormat, theme, xLabel, yLabel, sizeLabel,
    mainTitle, gridOption, tooltipOption, xAxisOption, yAxisOption, xZoom, yZoom, seriesOption}) => {
    const items = coreUtils.asArray(points).map((item, index) => ({name: String(item.name ?? index), x: +item.x || 0, y: +item.y || 0, size: +item.size || 0}))
    const highlights = coreUtils.asArray(highlight).map(item => item.resolve(ctx.setData(items.map(({name, size}) => ({name, value: size})))))
    const active = !!highlights.length, {palette, dim, ink, mute, fontFamily} = theme, sizes = items.map(item => item.size)
    const low = Math.min(...sizes), high = Math.max(...sizes), matches = (item, index) => highlights.some(mark => mark.matches(ctx.setData({item, index})))
    const symbolSize = size => high == low ? 29 : 12 + Math.sqrt((size - low) / (high - low)) * 34
    const note = highlights.find(item => item.note)?.note, formatX = value => (xFormat || valueFormat)(ctx.setData(value))
    const formatY = value => (yFormat || valueFormat)(ctx.setData(value)), format = value => valueFormat(ctx.setData(value))
    const tooltip = p => `<b>${p.value[3]}</b><br/>${xLabel || 'x'}: ${formatX(p.value[0])}<br/>${yLabel || 'y'}: ${formatY(p.value[1])}`
      + `<br/>${sizeLabel || 'size'}: ${format(p.value[2])}`
    const optionCtx = ctx.setData({title: title || '', showTitle: !!(title || note), note: note || '', ink, mute, accent: palette[0],
      gridRight: 26, gridTop: title ? 50 : 18, gridBottom: 56, xLabel: xLabel || '', yLabel: yLabel || '', seriesData: items.map((item, index) => {
        const on = !active || matches(item, index); return {name: item.name, value: [item.x, item.y, item.size, item.name], symbolSize: symbolSize(item.size),
          z: on ? 3 : 1, itemStyle: {color: on ? palette[index % palette.length] : dim, opacity: on ? .85 : .4,
            borderColor: '#fff', borderWidth: 1}, emphasis: {focus: 'self', itemStyle: {opacity: 1, borderColor: ink, borderWidth: 1.5}}}
      })}).setVars({formatX, formatY, tooltip})
    return {color: palette, animation: !globalThis.window?.testing, textStyle: {fontFamily}, title: mainTitle(optionCtx), grid: gridOption(optionCtx),
      tooltip: tooltipOption(optionCtx), xAxis: xAxisOption(optionCtx), yAxis: yAxisOption(optionCtx),
      dataZoom: [xZoom(optionCtx), yZoom(optionCtx)], series: [seriesOption(optionCtx)]}
  }
})
