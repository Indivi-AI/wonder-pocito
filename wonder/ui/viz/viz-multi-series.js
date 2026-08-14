import { dsls, coreUtils } from '@jb6/core'
import '../echart-dsl.js'
import './viz-types.js'

const {
  echart: {
    EChartsOption, 'series-option': {bar}, 'title-option': {title}, 'tooltip-option': {tooltip}, 'legend-option': {legend},
    'text-style-option': {textStyle}, 'grid-option': {grid}, 'axis-option': {xAxis, yAxis}, 'axis-line-option': {axisLine},
    'axis-tick-option': {axisTick}, 'axis-label-option': {axisLabel}, 'split-line-option': {splitLine},
    'axis-pointer-option': {axisPointer}, 'line-style-option': {lineStyle}, 'item-style-option': {itemStyle},
    'emphasis-option': {emphasis}, 'label-option': {label}
  },
  viz: {'viz-theme': {defaultTheme}, 'viz-value-format': {compact}}
} = dsls

EChartsOption('viz.groupedBar', {
  params: [
    {id: 'categories', as: 'array'},
    {id: 'series', type: 'viz-series<viz>[]'},
    {id: 'title', as: 'string', byName: true},
    {id: 'highlight', type: 'viz-highlight<viz>', byName: true},
    {id: 'valueFormat', type: 'viz-value-format<viz>', byName: true, defaultValue: compact()},
    {id: 'theme', type: 'viz-theme<viz>', defaultValue: defaultTheme()},
    {id: 'yLabel', as: 'string'},
    {id: 'mainTitle', type: 'title-option<echart>', dynamic: true, defaultValue: title({
      text: '%title%',
      show: '%showTitle%',
      subtext: '%note%',
      left: 8,
      top: 6,
      textStyle: textStyle({ color: '%ink%', fontWeight: 600, fontSize: 15 }),
      subtextStyle: textStyle({ color: '%accent%', fontWeight: 600, fontSize: 12 })
    })},
    {id: 'gridOption', type: 'grid-option<echart>', dynamic: true, defaultValue: grid({ left: 8, right: 18, top: '%gridTop%', bottom: '%gridBottom%', containLabel: true })},
    {id: 'tooltipOption', type: 'tooltip-option<echart>', dynamic: true, defaultValue: tooltip({
      trigger: 'axis',
      valueFormatter: (ctx, {format}) => format(ctx.data),
      axisPointer: axisPointer({ type: 'shadow', shadowStyle: {color: 'rgba(37,99,235,0.06)'} })
    })},
    {id: 'legendOption', type: 'legend-option<echart>', dynamic: true, defaultValue: legend({
      Data: '%legendData%',
      show: '%showLegend%',
      bottom: 2,
      textStyle: textStyle({ color: '#475569', fontSize: 12 })
    })},
    {id: 'categoryAxis', type: 'axis-option<echart>', dynamic: true, defaultValue: xAxis({
      type: 'category',
      Data: '%categories%',
      boundaryGap: true,
      axisLine: axisLine({ lineStyle: lineStyle({ color: '%dim%' }) }),
      axisTick: axisTick({ show: false }),
      axisLabel: axisLabel({ show: true, color: '%mute%', fontSize: 10, hideOverlap: true })
    })},
    {id: 'valueAxis', type: 'axis-option<echart>', dynamic: true, defaultValue: yAxis({
      type: 'value',
      name: '%yLabel%',
      nameTextStyle: textStyle({ color: '%mute%', fontSize: 11 }),
      axisLine: axisLine({ show: false }),
      axisLabel: axisLabel({
        show: true,
        color: '%mute%',
        fontSize: 10,
        formatter: (ctx, {format}) => format(ctx.data)
      }),
      splitLine: splitLine({ lineStyle: lineStyle({ color: '#f1f5f9' }) })
    })},
    {id: 'seriesOption', type: 'series-option<echart>', dynamic: true, defaultValue: bar({
      Data: '%Data%',
      name: '%name%',
      barMaxWidth: 34,
      barGap: '18%',
      barCategoryGap: '38%',
      itemStyle: itemStyle({ opacity: '%opacity%', borderRadius: [3,3,0,0] }),
      emphasis: emphasis({ focus: 'series', itemStyle: itemStyle({ color: '%seriesColor%' }) }),
      z: '%z%'
    })}
  ],
  impl: (ctx, {}, {categories, series, title, highlight, valueFormat, theme, yLabel,
    mainTitle, gridOption, tooltipOption, legendOption, categoryAxis, valueAxis, seriesOption}) => {
    categories = coreUtils.asArray(categories).map(String)
    series = coreUtils.asArray(series).map(item => ({name: String(item.name ?? ''), values: coreUtils.asArray(item.values).map(value => +value || 0)}))
    const highlights = coreUtils.asArray(highlight).map(item => item.resolve(ctx.setData(series))), active = !!highlights.length
    const {palette, dim, ink, mute, fontFamily} = theme
    const matches = (item, index) => highlights.some(highlight => highlight.matches(ctx.setData({item, index})))
    const categoryMatches = categories.map((name, index) => matches({name}, index)), byCategory = active && categoryMatches.some(Boolean)
    const note = highlights.find(item => item.note)?.note, format = value => valueFormat(ctx.setData(value))
    const optionCtx = ctx.setData({title: title || '', showTitle: !!(title || note), note: note || '', ink, accent: palette[0], dim, mute,
      gridTop: note ? title ? 66 : 44 : title ? 46 : 16, gridBottom: (series.length > 1 ? 40 : 20) + (yLabel ? 4 : 0),
      categories, yLabel: yLabel || '', legendData: series.map(item => item.name), showLegend: series.length > 1}).setVars({format})
    const seriesOptions = series.map((item, index) => {
      const highlighted = !active || byCategory || matches(item, index), seriesColor = palette[index % palette.length]
      return seriesOption(optionCtx.setData({name: item.name, z: highlighted ? 3 : 1, opacity: highlighted ? 1 : 0.75, seriesColor,
        Data: item.values.map((value, categoryIndex) => ({value, itemStyle: {color: byCategory
          ? categoryMatches[categoryIndex] ? seriesColor : dim : highlighted ? seriesColor : dim}}))}))
    })
    return {color: palette, animation: !globalThis.window?.testing, textStyle: {fontFamily}, title: mainTitle(optionCtx),
      grid: gridOption(optionCtx), tooltip: tooltipOption(optionCtx), legend: legendOption(optionCtx),
      xAxis: categoryAxis(optionCtx), yAxis: valueAxis(optionCtx), series: seriesOptions}
  }
})

EChartsOption('viz.stackedBar', {
  params: [
    {id: 'categories', as: 'array'},
    {id: 'series', type: 'viz-series<viz>[]'},
    {id: 'title', as: 'string', byName: true},
    {id: 'highlight', type: 'viz-highlight<viz>', byName: true},
    {id: 'valueFormat', type: 'viz-value-format<viz>', byName: true, defaultValue: compact()},
    {id: 'theme', type: 'viz-theme<viz>', defaultValue: defaultTheme()},
    {id: 'yLabel', as: 'string'},
    {id: 'mainTitle', type: 'title-option<echart>', dynamic: true, defaultValue: title({
      text: '%title%',
      show: '%showTitle%',
      subtext: '%note%',
      left: 8,
      top: 6,
      textStyle: textStyle({ color: '%ink%', fontWeight: 600, fontSize: 15 }),
      subtextStyle: textStyle({ color: '%accent%', fontWeight: 600, fontSize: 12 })
    })},
    {id: 'gridOption', type: 'grid-option<echart>', dynamic: true, defaultValue: grid({ left: 52, right: 18, top: '%gridTop%', bottom: '%gridBottom%', containLabel: true })},
    {id: 'tooltipOption', type: 'tooltip-option<echart>', dynamic: true, defaultValue: tooltip({
      trigger: 'axis',
      valueFormatter: (ctx, {format}) => format(ctx.data),
      axisPointer: axisPointer({ type: 'shadow', shadowStyle: {color: 'rgba(37,99,235,0.06)'} })
    })},
    {id: 'legendOption', type: 'legend-option<echart>', dynamic: true, defaultValue: legend({
      Data: '%legendData%',
      show: '%showLegend%',
      bottom: 2,
      textStyle: textStyle({ color: '#475569', fontSize: 12 })
    })},
    {id: 'categoryAxis', type: 'axis-option<echart>', dynamic: true, defaultValue: xAxis({
      type: 'category',
      Data: '%categories%',
      boundaryGap: true,
      axisLine: axisLine({ lineStyle: lineStyle({ color: '%dim%' }) }),
      axisTick: axisTick({ show: false }),
      axisLabel: axisLabel({ show: true, color: '%mute%', fontSize: 10, hideOverlap: true })
    })},
    {id: 'valueAxis', type: 'axis-option<echart>', dynamic: true, defaultValue: yAxis({
      type: 'value',
      name: '%yLabel%',
      nameTextStyle: textStyle({ color: '%mute%', fontSize: 11 }),
      axisLine: axisLine({ show: false }),
      axisLabel: axisLabel({
        show: true,
        color: '%mute%',
        fontSize: 10,
        formatter: (ctx, {format}) => format(ctx.data)
      }),
      splitLine: splitLine({ lineStyle: lineStyle({ color: '#f1f5f9' }) })
    })},
    {id: 'seriesOption', type: 'series-option<echart>', dynamic: true, defaultValue: bar({
      Data: '%Data%',
      name: '%name%',
      stack: 'total',
      barMaxWidth: 52,
      itemStyle: itemStyle({
        color: '%seriesColor%',
        borderColor: '#fff',
        borderWidth: 1.5,
        borderRadius: '%borderRadius%'
      }),
      emphasis: emphasis({ focus: 'series' }),
      label: label({
        show: '%showLabel%',
        position: 'inside',
        color: '#fff',
        fontSize: 10,
        fontWeight: 600,
        formatter: (ctx, {format, peak}) => ctx.data.value / peak >= 0.14 ? format(ctx.data.value) : ''
      }),
      labelLayout: {hideOverlap: true},
      z: '%z%'
    })},
    {id: 'totalSeries', type: 'series-option<echart>', dynamic: true, defaultValue: bar({
      Data: '%totalData%',
      stack: 'total',
      silent: true,
      itemStyle: itemStyle({ color: 'transparent' }),
      label: label({
        show: true,
        position: 'top',
        distance: 5,
        color: '%ink%',
        fontSize: 11,
        fontWeight: 700,
        formatter: (ctx, {format, totals}) => format(totals[ctx.data.dataIndex])
      }),
      labelLayout: {hideOverlap: true},
      tooltip: tooltip({ show: false })
    })}
  ],
  impl: (ctx, {}, {categories, series, title, highlight, valueFormat, theme, yLabel,
    mainTitle, gridOption, tooltipOption, legendOption, categoryAxis, valueAxis, seriesOption, totalSeries}) => {
    categories = coreUtils.asArray(categories).map(String)
    series = coreUtils.asArray(series).map(item => ({name: String(item.name ?? ''), values: coreUtils.asArray(item.values).map(value => +value || 0)}))
    const highlights = coreUtils.asArray(highlight).map(item => item.resolve(ctx.setData(series))), active = !!highlights.length
    const {palette, dim, ink, mute, fontFamily} = theme
    const matches = (item, index) => highlights.some(highlight => highlight.matches(ctx.setData({item, index})))
    const totals = categories.map((_, categoryIndex) => series.reduce((sum, item) => sum + (item.values[categoryIndex] || 0), 0))
    const peak = Math.max(1, ...totals), note = highlights.find(item => item.note)?.note, format = value => valueFormat(ctx.setData(value))
    const optionCtx = ctx.setData({title: title || '', showTitle: !!(title || note), note: note || '', ink, accent: palette[0], dim, mute,
      gridTop: title ? note ? 64 : 48 : 22, gridBottom: series.length > 1 ? 40 : 26, categories, yLabel: yLabel || '',
      legendData: series.map(item => item.name), showLegend: series.length > 1, totalData: totals.map(() => 0)}).setVars({format, peak, totals})
    const seriesOptions = series.map((item, index) => {
      const highlighted = !active || matches(item, index)
      return seriesOption(optionCtx.setData({name: item.name, Data: item.values, z: highlighted ? 3 : 1,
        seriesColor: highlighted ? palette[index % palette.length] : dim, borderRadius: index == series.length - 1 ? [4, 4, 0, 0] : 0,
        showLabel: highlighted}))
    })
    return {color: palette, animation: !globalThis.window?.testing, textStyle: {fontFamily}, title: mainTitle(optionCtx),
      grid: gridOption(optionCtx), tooltip: tooltipOption(optionCtx), legend: legendOption(optionCtx),
      xAxis: categoryAxis(optionCtx), yAxis: valueAxis(optionCtx), series: [...seriesOptions, totalSeries(optionCtx)]}
  }
})
