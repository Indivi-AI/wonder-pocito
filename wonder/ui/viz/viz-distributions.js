import { dsls, coreUtils } from '@jb6/core'
import '../echart-dsl.js'
import './viz-types.js'

const {
  echart: {
    EChartsOption, 'series-option': {bar, boxplot, scatter}, 'title-option': {title}, 'tooltip-option': {tooltip},
    'text-style-option': {textStyle}, 'grid-option': {grid}, 'axis-option': {xAxis, yAxis}, 'axis-line-option': {axisLine},
    'axis-tick-option': {axisTick}, 'axis-label-option': {axisLabel}, 'split-line-option': {splitLine},
    'axis-pointer-option': {axisPointer}, 'line-style-option': {lineStyle}, 'item-style-option': {itemStyle},
    'emphasis-option': {emphasis}, 'label-option': {label}
  },
  viz: {'viz-theme': {defaultTheme}, 'viz-value-format': {compact, integer}}
} = dsls

EChartsOption('viz.histogram', {
  params: [
    {id: 'values', as: 'array'},
    {id: 'title', as: 'string', byName: true},
    {id: 'bins', as: 'number', defaultValue: 10},
    {id: 'highlight', type: 'viz-highlight<viz>', byName: true},
    {id: 'valueFormat', type: 'viz-value-format<viz>', byName: true, defaultValue: compact()},
    {id: 'countFormat', type: 'viz-value-format<viz>', defaultValue: integer()},
    {id: 'theme', type: 'viz-theme<viz>', defaultValue: defaultTheme()},
    {id: 'xLabel', as: 'string'},
    {id: 'yLabel', as: 'string', defaultValue: 'count'},
    {id: 'mainTitle', type: 'title-option<echart>', dynamic: true, defaultValue: title({
      text: '%title%',
      show: '%showTitle%',
      subtext: '%note%',
      left: 8,
      top: 6,
      textStyle: textStyle({ color: '%ink%', fontWeight: 600, fontSize: 15 }),
      subtextStyle: textStyle({ color: '%accent%', fontWeight: 600, fontSize: 12 })
    })},
    {id: 'gridOption', type: 'grid-option<echart>', dynamic: true, defaultValue: grid({ left: 46, right: 16, top: '%gridTop%', bottom: '%gridBottom%', containLabel: true })},
    {id: 'tooltipOption', type: 'tooltip-option<echart>', dynamic: true, defaultValue: tooltip({
      trigger: 'axis',
      formatter: (ctx, {formatCount}) => `${ctx.data[0].axisValue}<br/><b>${formatCount(ctx.data[0].value)}</b>`,
      textStyle: textStyle({ fontSize: 12 }),
      axisPointer: axisPointer({ type: 'shadow' })
    })},
    {id: 'categoryAxis', type: 'axis-option<echart>', dynamic: true, defaultValue: xAxis({
      type: 'category',
      Data: '%labels%',
      name: '%xLabel%',
      nameLocation: 'middle',
      nameGap: 30,
      nameTextStyle: textStyle({ color: '%mute%', fontSize: 11 }),
      boundaryGap: true,
      axisLine: axisLine({ lineStyle: lineStyle({ color: '%dim%' }) }),
      axisTick: axisTick({ alignWithLabel: true, lineStyle: lineStyle({ color: '%dim%' }) }),
      axisLabel: axisLabel({
        color: '%mute%',
        fontSize: 10,
        interval: '%interval%',
        hideOverlap: true,
        rotate: '%rotate%'
      })
    })},
    {id: 'valueAxis', type: 'axis-option<echart>', dynamic: true, defaultValue: yAxis({
      type: 'value',
      name: '%yLabel%',
      nameGap: 10,
      nameTextStyle: textStyle({ color: '%mute%', fontSize: 11, align: 'left' }),
      axisLabel: axisLabel({
        color: '%mute%',
        fontSize: 10,
        formatter: (ctx, {formatCount}) => formatCount(ctx.data)
      }),
      splitLine: splitLine({ lineStyle: lineStyle({ color: '#f1f5f9' }) }),
      minInterval: 1
    })},
    {id: 'seriesOption', type: 'series-option<echart>', dynamic: true, defaultValue: bar({
      Data: '%seriesData%',
      barCategoryGap: 0,
      itemStyle: itemStyle({ color: '#fff', borderColor: '#fff', borderWidth: 1 }),
      emphasis: emphasis({ itemStyle: itemStyle({ shadowBlur: 8, shadowColor: 'rgba(37,99,235,0.25)' }) }),
      label: label({
        show: true,
        position: 'top',
        fontSize: 10,
        formatter: (ctx, {formatCount}) => ctx.data.value ? formatCount(ctx.data.value) : ''
      })
    })}
  ],
  impl: (ctx, {}, {values, title, bins, highlight, valueFormat, countFormat, theme, xLabel, yLabel,
    mainTitle, gridOption, tooltipOption, categoryAxis, valueAxis, seriesOption}) => {
    values = coreUtils.asArray(values).map(Number).filter(Number.isFinite)
    bins = Math.max(1, Math.round(bins) || 10)
    const min = values.length ? Math.min(...values) : 0, max = values.length ? Math.max(...values) : 0, step = ((max - min) || 1) / bins
    const counts = Array.from({length: bins}, () => 0), format = value => valueFormat(ctx.setData(Math.round(value * 1e4) / 1e4))
    values.forEach(value => counts[Math.min(bins - 1, Math.floor((value - min) / step))]++)
    const edges = counts.map((_, index) => format(min + step * index)).concat(format(max))
    const items = counts.map((value, index) => ({name: `${edges[index]}–${edges[index + 1]}`, value,
      low: min + step * index, high: min + step * (index + 1)}))
    const highlights = coreUtils.asArray(highlight).map(item => item.resolve(ctx.setData(items))), active = !!highlights.length
    const {palette, dim, ink, mute, fontFamily} = theme
    const matches = (item, index) => highlights.some(highlight => highlight.matches(ctx.setData({item, index})))
    const note = highlights.find(item => item.note)?.note, formatCount = value => countFormat(ctx.setData(value))
    const seriesData = items.map((item, index) => ({value: item.value, itemStyle: {color: !active || matches(item, index) ? palette[0] : dim,
      borderColor: '#fff', borderWidth: 1}, label: {color: active && matches(item, index) ? ink : mute,
        fontWeight: active && matches(item, index) ? 700 : 400}}))
    const interval = Math.max(0, Math.ceil(bins / Math.max(4, Math.floor((ctx.vars.echartWidth || 540) / 56))) - 1)
    const optionCtx = ctx.setData({title: title || '', showTitle: !!(title || note), note: note || '', ink, accent: palette[0], mute, dim,
      gridTop: title ? note ? 60 : 46 : 16, gridBottom: xLabel ? 46 : 34, labels: items.map(item => item.name), xLabel: xLabel || '',
      yLabel, interval, rotate: bins > 8 ? 32 : 0, seriesData}).setVars({formatCount})
    return {color: palette, animation: !globalThis.window?.testing, textStyle: {fontFamily}, title: mainTitle(optionCtx),
      grid: gridOption(optionCtx), tooltip: tooltipOption(optionCtx), xAxis: categoryAxis(optionCtx), yAxis: valueAxis(optionCtx),
      series: [seriesOption(optionCtx)]}
  }
})

EChartsOption('viz.boxplot', {
  params: [
    {id: 'groups', as: 'array'},
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
    {id: 'gridOption', type: 'grid-option<echart>', dynamic: true, defaultValue: grid({ left: 48, right: 16, top: '%gridTop%', bottom: 26, containLabel: true })},
    {id: 'tooltipOption', type: 'tooltip-option<echart>', dynamic: true, defaultValue: tooltip({
      trigger: 'item',
      formatter: (ctx, {format}) => ctx.data.seriesType == 'scatter'
        ? `${ctx.data.name} · outlier ${format(ctx.data.value[1])}`
        : `<b>${ctx.data.name}</b><br/>max ${format(ctx.data.value[5])}<br/>q3 ${format(ctx.data.value[4])}<br/>median ${format(ctx.data.value[3])}<br/>q1 ${format(ctx.data.value[2])}<br/>min ${format(ctx.data.value[1])}`,
      confine: true,
      textStyle: textStyle({ fontSize: 12 })
    })},
    {id: 'categoryAxis', type: 'axis-option<echart>', dynamic: true, defaultValue: xAxis({
      type: 'category',
      Data: '%categories%',
      boundaryGap: true,
      axisLine: axisLine({ lineStyle: lineStyle({ color: '%dim%' }) }),
      axisTick: axisTick({ show: false }),
      axisLabel: axisLabel({ color: '%mute%', fontSize: 11, interval: 0, hideOverlap: true })
    })},
    {id: 'valueAxis', type: 'axis-option<echart>', dynamic: true, defaultValue: yAxis({
      type: 'value',
      name: '%yLabel%',
      nameGap: 12,
      nameTextStyle: textStyle({ color: '%mute%', fontSize: 11, align: 'left' }),
      axisLabel: axisLabel({ color: '%mute%', fontSize: 10, formatter: (ctx, {format}) => format(ctx.data) }),
      splitLine: splitLine({ lineStyle: lineStyle({ color: '#f1f5f9' }) })
    })},
    {id: 'boxSeries', type: 'series-option<echart>', dynamic: true, defaultValue: boxplot({
      Data: '%boxData%',
      boxWidth: [10,34],
      emphasis: emphasis({
        itemStyle: itemStyle({ borderWidth: 2.4, shadowBlur: 8, shadowColor: 'rgba(37,99,235,0.25)' })
      })
    })},
    {id: 'outlierSeries', type: 'series-option<echart>', dynamic: true, defaultValue: scatter({ Data: '%outlierData%', symbolSize: 6, z: 3 })}
  ],
  impl: (ctx, {}, {groups, title, highlight, valueFormat, theme, yLabel,
    mainTitle, gridOption, tooltipOption, categoryAxis, valueAxis, boxSeries, outlierSeries}) => {
    const normalized = coreUtils.asArray(groups).map((group, index) => {
      const values = coreUtils.asArray(group.values).map(Number).filter(Number.isFinite).sort((a, b) => a - b)
      const quantile = p => {
        const at = (values.length - 1) * p, low = Math.floor(at)
        return values[low] + (values[Math.ceil(at)] - values[low]) * (at - low)
      }
      if (group.median != null) return {name: String(group.name ?? index), five: [+group.min, +group.q1, +group.median, +group.q3, +group.max], outliers: []}
      if (!values.length) return {name: String(group.name ?? index), five: [0, 0, 0, 0, 0], outliers: []}
      const q1 = quantile(.25), q3 = quantile(.75), fence = 1.5 * (q3 - q1), inside = values.filter(value => value >= q1 - fence && value <= q3 + fence)
      return {name: String(group.name ?? index), five: [inside[0], q1, quantile(.5), q3, inside.at(-1)],
        outliers: values.filter(value => value < q1 - fence || value > q3 + fence)}
    })
    const items = normalized.map(item => ({name: item.name, value: item.five[2]}))
    const highlights = coreUtils.asArray(highlight).map(item => item.resolve(ctx.setData(items))), active = !!highlights.length
    const {palette, dim, ink, mute, fontFamily} = theme
    const matches = (item, index) => highlights.some(highlight => highlight.matches(ctx.setData({item, index})))
    const colors = items.map((item, index) => !active || matches(item, index) ? palette[index % palette.length] : dim)
    const note = highlights.find(item => item.note)?.note, format = value => valueFormat(ctx.setData(value))
    const boxData = normalized.map((item, index) => ({value: item.five, itemStyle: {color: colors[index] == dim ? dim : `${colors[index]}26`,
      borderColor: colors[index], borderWidth: !active || matches(item, index) ? 2.2 : 1.4, opacity: !active || matches(item, index) ? 1 : .75}}))
    const outlierData = normalized.flatMap((item, index) => item.outliers.map(value => ({name: item.name, value: [index, value],
      itemStyle: {color: colors[index], opacity: !active || matches(item, index) ? .9 : .55, borderColor: '#fff', borderWidth: 1}})))
    const optionCtx = ctx.setData({title: title || '', showTitle: !!(title || note), note: note || '', ink, accent: palette[0], mute, dim,
      gridTop: title ? note ? 60 : 44 : 16, categories: normalized.map(item => item.name), yLabel: yLabel || '', boxData, outlierData}).setVars({format})
    return {color: palette, animation: !globalThis.window?.testing, textStyle: {fontFamily}, title: mainTitle(optionCtx),
      grid: gridOption(optionCtx), tooltip: tooltipOption(optionCtx), xAxis: categoryAxis(optionCtx), yAxis: valueAxis(optionCtx),
      series: [boxSeries(optionCtx), outlierSeries(optionCtx)]}
  }
})
