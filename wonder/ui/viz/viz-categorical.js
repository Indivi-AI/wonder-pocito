import { dsls, coreUtils } from '@jb6/core'
import '../echart-dsl.js'
import './viz-types.js'

const {
  echart: {
    EChartsOption, 'series-option': {pie, bar}, 'title-option': {title}, 'tooltip-option': {tooltip},
    'legend-option': {legend}, 'text-style-option': {textStyle}, 'grid-option': {grid}, 'axis-option': {xAxis, yAxis},
    'axis-line-option': {axisLine}, 'axis-tick-option': {axisTick}, 'axis-label-option': {axisLabel},
    'split-line-option': {splitLine}, 'axis-pointer-option': {axisPointer}, 'line-style-option': {lineStyle},
    'item-style-option': {itemStyle}, 'emphasis-option': {emphasis}, 'label-option': {label}
  },
  viz: { 'viz-theme': {defaultTheme}, 'viz-value-format': {compact} }
} = dsls

EChartsOption('viz.pie', {
  params: [
    {id: 'items', as: 'array'},
    {id: 'title', as: 'string', byName: true},
    {id: 'highlight', type: 'viz-highlight<viz>', byName: true},
    {id: 'valueFormat', type: 'viz-value-format<viz>', byName: true, defaultValue: compact()},
    {id: 'theme', type: 'viz-theme<viz>', defaultValue: defaultTheme()},
    {id: 'donut', as: 'boolean', type: 'boolean<common>'},
    {id: 'showLegend', type: 'boolean<common>', byName: true},
    {id: 'width', as: 'number', defaultValue: 540},
    {id: 'height', as: 'number', defaultValue: 320},
    {id: 'mainTitle', type: 'title-option<echart>', dynamic: true, defaultValue: title({
      text: '%title%',
      show: '%showTitle%',
      subtext: '%note%',
      left: 8,
      top: 6,
      textStyle: textStyle({ color: '%ink%', fontWeight: 600, fontSize: 15 }),
      subtextStyle: textStyle({ color: '%accent%', fontWeight: 600, fontSize: 12 })
    })},
    {id: 'totalTitle', type: 'title-option<echart>', dynamic: true, defaultValue: title({
      text: '%totalText%',
      show: '%showTotal%',
      left: 'center',
      top: '%centerY%',
      textVerticalAlign: 'middle',
      textStyle: textStyle({ color: '%ink%', fontWeight: 700, fontSize: '%totalFontSize%' })
    })},
    {id: 'tooltipOption', type: 'tooltip-option<echart>', dynamic: true, defaultValue: tooltip({
      trigger: 'item',
      valueFormatter: (ctx, {format}) => format(ctx.data),
      textStyle: textStyle({ fontSize: 12 })
    })},
    {id: 'legendOption', type: 'legend-option<echart>', dynamic: true, defaultValue: legend({
      Data: '%legendData%',
      show: '%showLegend%',
      type: 'scroll',
      bottom: 2,
      textStyle: textStyle({ color: '#475569', fontSize: 12 })
    })},
    {id: 'seriesOption', type: 'series-option<echart>', dynamic: true, defaultValue: pie({ Data: '%seriesData%', radius: '%radius%', center: '%center%' })}
  ],
  impl: (ctx, {}, {items, title, highlight, valueFormat, theme, donut = true, showLegend, width, height,
    mainTitle, totalTitle, tooltipOption, legendOption, seriesOption}) => {
    width = ctx.vars.echartWidth || width
    height = ctx.vars.echartHeight || height
    const normalizedItems = coreUtils.asArray(items).map((item, index) => ({
      name: String(item.name ?? item.label ?? index), value: +(item.value ?? item.y ?? 0) || 0, color: item.color
    }))
    const highlights = coreUtils.asArray(highlight).map(item => item.resolve(ctx.setData(normalizedItems)))
    const active = highlights.length > 0
    const {palette, dim, ink, mute, fontFamily} = theme
    const matches = (item, index) => highlights.some(highlight => highlight.matches(ctx.setData({item, index})))
    const colors = normalizedItems.map((item, index) => active
      ? matches(item, index) ? item.color || palette[index % palette.length] : dim
      : item.color || palette[index % palette.length])
    const note = highlights.find(highlight => highlight.note)?.note
    const total = normalizedItems.reduce((sum, item) => sum + item.value, 0)
    const format = value => valueFormat(ctx.setData(value))
    const top = title || note ? title && note ? 56 : 40 : 10, bottom = showLegend ? 30 : 10, band = height - top - bottom
    const labelRadius = Math.round(Math.max(28, Math.min(band / 2 - 26, width * 0.28)))
    const strip = Math.round(width / 2 - labelRadius - 6), labelWidth = Math.max(56, strip - 8)
    const rowHeight = Math.ceil((Math.max(0, ...normalizedItems.map(item => item.name.length)) + 8) * 6.5 / labelWidth) * 13 + 8
    const showLabels = strip >= 84 && band / Math.ceil(normalizedItems.length / 2) >= rowHeight && labelRadius >= 40
    const radius = showLabels ? labelRadius : Math.round(Math.max(28, Math.min(band / 2 - 8, width * 0.42)))
    const centerY = Math.round(top + band / 2)
    const seriesData = normalizedItems.map((item, index) => ({name: item.name, value: item.value,
      itemStyle: {color: colors[index]}, label: {color: active && colors[index] == dim ? mute : ink,
        fontWeight: active && colors[index] != dim ? 700 : 400}, selected: active && colors[index] != dim}))
    const optionCtx = ctx.setData({title: title || '', showTitle: !!(title || note), note: note || '', ink, accent: palette[0],
      totalText: format(total), showTotal: donut && !!total, centerY, totalFontSize: Math.max(12, Math.min(20, Math.round(radius * 0.24))),
      legendData: normalizedItems.map(item => item.name), showLegend: !!showLegend, seriesData, showLabels, labelWidth,
      radius: donut ? [Math.round(radius * 0.7), radius] : [0, radius], center: ['50%', centerY], mute})
      .setVars({active, colors, dim, ink, mute, format})
    return {color: palette, animation: !globalThis.window?.testing, textStyle: {fontFamily}, title: [mainTitle(optionCtx), totalTitle(optionCtx)],
      tooltip: tooltipOption(optionCtx), legend: legendOption(optionCtx), series: [seriesOption(optionCtx)]}
  }
})

EChartsOption('viz.bar', {
  params: [
    {id: 'items', as: 'array'},
    {id: 'title', as: 'string', byName: true},
    {id: 'highlight', type: 'viz-highlight<viz>', byName: true},
    {id: 'valueFormat', type: 'viz-value-format<viz>', byName: true, defaultValue: compact()},
    {id: 'theme', type: 'viz-theme<viz>', defaultValue: defaultTheme()},
    {id: 'xLabel', as: 'string'},
    {id: 'yLabel', as: 'string'},
    {id: 'showValues', type: 'boolean<common>', defaultValue: true},
    {id: 'mainTitle', type: 'title-option<echart>', dynamic: true, defaultValue: title({
      text: '%title%',
      show: '%showTitle%',
      subtext: '%note%',
      left: 8,
      top: 6,
      textStyle: textStyle({ color: '%ink%', fontWeight: 600, fontSize: 15 }),
      subtextStyle: textStyle({ color: '%accent%', fontWeight: 600, fontSize: 12 })
    })},
    {id: 'gridOption', type: 'grid-option<echart>', dynamic: true, defaultValue: grid({ left: 8, right: 16, top: '%gridTop%', bottom: '%gridBottom%', containLabel: true })},
    {id: 'tooltipOption', type: 'tooltip-option<echart>', dynamic: true, defaultValue: tooltip({
      trigger: 'axis',
      valueFormatter: (ctx, {format}) => format(ctx.data),
      textStyle: textStyle({ fontSize: 12 }),
      axisPointer: axisPointer({ type: 'shadow' })
    })},
    {id: 'categoryAxis', type: 'axis-option<echart>', dynamic: true, defaultValue: xAxis({
      type: 'category',
      Data: '%categories%',
      name: '%xLabel%',
      nameLocation: 'middle',
      nameGap: 30,
      nameTextStyle: textStyle({ color: '%mute%', fontSize: 11 }),
      boundaryGap: true,
      axisLine: axisLine({ lineStyle: lineStyle({ color: '%dim%' }) }),
      axisTick: axisTick({ show: false }),
      axisLabel: axisLabel({ show: true, color: '%mute%', fontSize: 11, interval: 0, hideOverlap: true })
    })},
    {id: 'valueAxis', type: 'axis-option<echart>', dynamic: true, defaultValue: yAxis({
      type: 'value',
      name: '%yLabel%',
      nameGap: 12,
      nameTextStyle: textStyle({ color: '%mute%', fontSize: 11, align: 'left' }),
      axisLabel: axisLabel({ color: '%mute%', fontSize: 10, formatter: (ctx, {format}) => format(ctx.data) }),
      splitLine: splitLine({ lineStyle: lineStyle({ color: '#f1f5f9' }) })
    })},
    {id: 'seriesOption', type: 'series-option<echart>', dynamic: true, defaultValue: bar({
      Data: '%seriesData%',
      barMaxWidth: 46,
      itemStyle: itemStyle({ borderRadius: [4,4,0,0] }),
      emphasis: emphasis({
        focus: 'series',
        itemStyle: itemStyle({ shadowBlur: 8, shadowColor: 'rgba(37,99,235,0.25)' })
      }),
      label: label({
        show: '%showValues%',
        position: 'top',
        fontSize: 11,
        formatter: (ctx, {format}) => format(ctx.data.value)
      })
    })}
  ],
  impl: (ctx, {}, {items, title, highlight, valueFormat, theme, xLabel, yLabel, showValues,
    mainTitle, gridOption, tooltipOption, categoryAxis, valueAxis, seriesOption}) => {
    const Data = coreUtils.asArray(items).map((item, index) => ({name: String(item.name ?? item.label ?? item.x ?? index),
      value: +(item.value ?? item.y ?? 0) || 0, color: item.color}))
    const highlights = coreUtils.asArray(highlight).map(item => item.resolve(ctx.setData(Data))), active = !!highlights.length
    const {palette, dim, ink, mute, fontFamily} = theme
    const matches = (item, index) => highlights.some(highlight => highlight.matches(ctx.setData({item, index})))
    const colors = Data.map((item, index) => active ? matches(item, index) ? item.color || palette[index % palette.length] : dim
      : item.color || palette[index % palette.length])
    const note = highlights.find(item => item.note)?.note, format = value => valueFormat(ctx.setData(value))
    const optionCtx = ctx.setData({title: title || '', showTitle: !!(title || note), note: note || '', ink, accent: palette[0], mute, dim,
      gridTop: title ? note ? 62 : 46 : 20, gridBottom: xLabel ? 44 : 30, categories: Data.map(item => item.name), xLabel: xLabel || '',
      yLabel: yLabel || '', showValues, seriesData: Data.map((item, index) => ({name: item.name, value: item.value,
        itemStyle: {color: colors[index]}, label: {color: active && colors[index] != dim ? ink : mute,
          fontWeight: active && colors[index] != dim ? 700 : 400}}))}).setVars({format})
    return {color: palette, animation: !globalThis.window?.testing, textStyle: {fontFamily}, title: mainTitle(optionCtx),
      grid: gridOption(optionCtx), tooltip: tooltipOption(optionCtx), xAxis: categoryAxis(optionCtx), yAxis: valueAxis(optionCtx),
      series: [seriesOption(optionCtx)]}
  }
})

EChartsOption('viz.horizontalBar', {
  params: [
    {id: 'items', as: 'array'},
    {id: 'title', as: 'string', byName: true},
    {id: 'highlight', type: 'viz-highlight<viz>', byName: true},
    {id: 'valueFormat', type: 'viz-value-format<viz>', byName: true, defaultValue: compact()},
    {id: 'theme', type: 'viz-theme<viz>', defaultValue: defaultTheme()},
    {id: 'valueLabel', as: 'string'},
    {id: 'showValues', type: 'boolean<common>', defaultValue: true},
    {id: 'mainTitle', type: 'title-option<echart>', dynamic: true, defaultValue: title({
      text: '%title%',
      show: '%showTitle%',
      subtext: '%note%',
      left: 8,
      top: 6,
      textStyle: textStyle({ color: '%ink%', fontWeight: 600, fontSize: 15 }),
      subtextStyle: textStyle({ color: '%accent%', fontWeight: 600, fontSize: 12 })
    })},
    {id: 'gridOption', type: 'grid-option<echart>', dynamic: true, defaultValue: grid({ left: 8, right: 52, top: '%gridTop%', bottom: '%gridBottom%', containLabel: true })},
    {id: 'tooltipOption', type: 'tooltip-option<echart>', dynamic: true, defaultValue: tooltip({ trigger: 'item', valueFormatter: (ctx, {format}) => format(ctx.data) })},
    {id: 'valueAxis', type: 'axis-option<echart>', dynamic: true, defaultValue: xAxis({
      type: 'value',
      name: '%valueLabel%',
      nameLocation: 'middle',
      nameGap: 26,
      nameTextStyle: textStyle({ color: '%mute%', fontSize: 10 }),
      axisLine: axisLine({ show: false }),
      axisTick: axisTick({ show: false }),
      axisLabel: axisLabel({ color: '%mute%', fontSize: 10, formatter: (ctx, {format}) => format(ctx.data) }),
      splitLine: splitLine({ lineStyle: lineStyle({ color: '#f1f5f9' }) })
    })},
    {id: 'categoryAxis', type: 'axis-option<echart>', dynamic: true, defaultValue: yAxis({
      type: 'category',
      Data: '%categories%',
      axisLine: axisLine({ show: false }),
      axisTick: axisTick({ show: false }),
      axisLabel: axisLabel({
        show: true,
        color: '%ink%',
        fontSize: 11,
        fontWeight: 400,
        width: 130,
        overflow: 'truncate'
      }),
      inverse: true,
      triggerEvent: true
    })},
    {id: 'seriesOption', type: 'series-option<echart>', dynamic: true, defaultValue: bar({
      Data: '%seriesData%',
      barMaxWidth: 26,
      barCategoryGap: '38%',
      itemStyle: itemStyle({ borderRadius: [0,4,4,0] }),
      emphasis: emphasis({ focus: 'self' }),
      label: label({
        show: '%showValues%',
        position: 'right',
        fontSize: 10,
        fontWeight: 600,
        formatter: (ctx, {format}) => format(ctx.data.value)
      })
    })}
  ],
  impl: (ctx, {}, {items, title, highlight, valueFormat, theme, valueLabel, showValues,
    mainTitle, gridOption, tooltipOption, valueAxis, categoryAxis, seriesOption}) => {
    const Data = coreUtils.asArray(items).map((item, index) => ({name: String(item.name ?? item.label ?? item.y ?? index),
      value: +(item.value ?? item.x ?? 0) || 0, color: item.color})).sort((a, b) => b.value - a.value)
    const highlights = coreUtils.asArray(highlight).map(item => item.resolve(ctx.setData(Data))), active = !!highlights.length
    const {palette, dim, ink, mute, fontFamily} = theme
    const matches = (item, index) => highlights.some(highlight => highlight.matches(ctx.setData({item, index})))
    const colors = Data.map((item, index) => active ? matches(item, index) ? item.color || palette[index % palette.length] : dim
      : item.color || palette[index % palette.length])
    const note = highlights.find(item => item.note)?.note, format = value => valueFormat(ctx.setData(value))
    const optionCtx = ctx.setData({title: title || '', showTitle: !!(title || note), note: note || '', ink, accent: palette[0], mute, dim,
      gridTop: note ? title ? 68 : 44 : title ? 50 : 14, gridBottom: valueLabel ? 34 : 16, valueLabel: valueLabel || '',
      categories: Data.map(item => item.name), showValues, seriesData: Data.map((item, index) => ({name: item.name, value: item.value,
        itemStyle: {color: colors[index]}, label: {color: active && colors[index] == dim ? dim : mute}}))}).setVars({format})
    return {color: palette, animation: !globalThis.window?.testing, textStyle: {fontFamily}, title: mainTitle(optionCtx),
      grid: gridOption(optionCtx), tooltip: tooltipOption(optionCtx), xAxis: valueAxis(optionCtx), yAxis: categoryAxis(optionCtx),
      series: [seriesOption(optionCtx)]}
  }
})
