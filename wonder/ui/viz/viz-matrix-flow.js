import { dsls, coreUtils } from '@jb6/core'
import '../echart-dsl.js'
import './viz-types.js'

const {
  echart: {
    EChartsOption, 'series-option': {bar, heatmap}, 'title-option': {title}, 'tooltip-option': {tooltip},
    'text-style-option': {textStyle}, 'grid-option': {grid}, 'axis-option': {xAxis, yAxis}, 'axis-line-option': {axisLine},
    'axis-tick-option': {axisTick}, 'axis-label-option': {axisLabel}, 'split-line-option': {splitLine},
    'split-area-option': {splitArea}, 'axis-pointer-option': {axisPointer}, 'line-style-option': {lineStyle},
    'item-style-option': {itemStyle}, 'emphasis-option': {emphasis}, 'label-option': {label}, 'mark-line-option': {markLine},
    'visual-map-option': {visualMap}, 'in-range-option': {inRange}, 'area-style-option': {areaStyle}
  },
  viz: {'viz-theme': {defaultTheme}, 'viz-value-format': {compact}}
} = dsls

EChartsOption('viz.waterfall', {
  params: [
    {id: 'steps', as: 'array'},
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
    {id: 'gridOption', type: 'grid-option<echart>', dynamic: true, defaultValue: grid({ left: 8, right: 18, top: '%gridTop%', bottom: 28, containLabel: true })},
    {id: 'tooltipOption', type: 'tooltip-option<echart>', dynamic: true, defaultValue: tooltip({
      trigger: 'axis',
      formatter: (ctx, {format, normalizedSteps}) => {
        const step = normalizedSteps[ctx.data[0].dataIndex]
        return `${step.name}<br/>${step.total ? format(step.delta) : `${step.delta > 0 ? '+' : ''}${format(step.delta)}`} → ${format(step.top)}`
      },
      axisPointer: axisPointer({ type: 'shadow' })
    })},
    {id: 'categoryAxis', type: 'axis-option<echart>', dynamic: true, defaultValue: xAxis({
      type: 'category',
      Data: '%categories%',
      boundaryGap: true,
      axisLine: axisLine({ lineStyle: lineStyle({ color: '%dim%' }) }),
      axisTick: axisTick({ show: false }),
      axisLabel: axisLabel({ color: '%mute%', fontSize: 10, interval: 0, hideOverlap: true })
    })},
    {id: 'valueAxis', type: 'axis-option<echart>', dynamic: true, defaultValue: yAxis({
      type: 'value',
      name: '%yLabel%',
      nameTextStyle: textStyle({ color: '%mute%', fontSize: 11 }),
      axisLabel: axisLabel({ color: '%mute%', fontSize: 10, formatter: (ctx, {format}) => format(ctx.data) }),
      splitLine: splitLine({ lineStyle: lineStyle({ color: '#f1f5f9' }) })
    })},
    {id: 'baseSeries', type: 'series-option<echart>', dynamic: true, defaultValue: bar({
      Data: '%baseData%',
      stack: 'waterfall',
      silent: true,
      itemStyle: itemStyle({ color: 'transparent' }),
      emphasis: emphasis({ disabled: true })
    })},
    {id: 'stepSeries', type: 'series-option<echart>', dynamic: true, defaultValue: bar({
      Data: '%stepData%',
      stack: 'waterfall',
      barMaxWidth: 46,
      itemStyle: itemStyle({ borderRadius: [3,3,0,0] }),
      emphasis: emphasis({
        focus: 'series',
        itemStyle: itemStyle({ shadowBlur: 8, shadowColor: 'rgba(30,41,59,0.2)' })
      }),
      label: label({
        show: true,
        position: 'top',
        fontSize: 10,
        formatter: (ctx, {format, normalizedSteps}) => normalizedSteps[ctx.data.dataIndex].total
          ? format(normalizedSteps[ctx.data.dataIndex].delta)
          : `${normalizedSteps[ctx.data.dataIndex].delta > 0 ? '+' : ''}${format(normalizedSteps[ctx.data.dataIndex].delta)}`
      }),
      markLine: markLine({
        Data: '%connectors%',
        silent: true,
        symbol: 'none',
        lineStyle: lineStyle({ color: '%dim%', width: 1, type: 'dashed' })
      })
    })}
  ],
  impl: (ctx, {}, {steps, title, highlight, valueFormat, theme, yLabel,
    mainTitle, gridOption, tooltipOption, categoryAxis, valueAxis, baseSeries, stepSeries}) => {
    let cumulative = 0
    const normalizedSteps = coreUtils.asArray(steps).map((item, index) => {
      const name = String(item.name ?? item.label ?? index)
      if (item.total) { const delta = +(item.value ?? cumulative) || cumulative; cumulative = delta; return {name, total: true, delta, base: 0, top: delta} }
      const delta = +(item.value ?? item.y ?? 0) || 0, start = cumulative
      cumulative += delta
      return {name, delta, base: Math.min(start, cumulative), top: cumulative}
    })
    const items = normalizedSteps.map(item => ({name: item.name, value: item.delta}))
    const highlights = coreUtils.asArray(highlight).map(item => item.resolve(ctx.setData(items))), active = !!highlights.length
    const {palette, dim, ink, mute, fontFamily} = theme
    const matches = (item, index) => highlights.some(highlight => highlight.matches(ctx.setData({item, index})))
    const note = highlights.find(item => item.note)?.note, format = value => valueFormat(ctx.setData(value))
    const stepData = normalizedSteps.map((item, index) => ({value: Math.abs(item.delta), itemStyle: {color: active && !matches(item, index)
      ? dim : item.total ? ink : item.delta >= 0 ? palette[1] : palette[3]}, label: {color: active && !matches(item, index) ? dim : active ? ink : mute,
        fontWeight: active && matches(item, index) ? 700 : 400}}))
    const connectors = normalizedSteps.slice(0, -1).map((item, index) => [{xAxis: index, yAxis: item.top}, {xAxis: index + 1, yAxis: item.top}])
    const optionCtx = ctx.setData({title: title || '', showTitle: !!(title || note), note: note || '', ink, accent: palette[0], mute, dim,
      gridTop: title ? note ? 62 : 46 : 16, categories: normalizedSteps.map(item => item.name), yLabel: yLabel || '',
      baseData: normalizedSteps.map(item => item.base), stepData, connectors}).setVars({format, normalizedSteps})
    return {color: palette, animation: !globalThis.window?.testing, textStyle: {fontFamily}, title: mainTitle(optionCtx),
      grid: gridOption(optionCtx), tooltip: tooltipOption(optionCtx), xAxis: categoryAxis(optionCtx), yAxis: valueAxis(optionCtx),
      series: [baseSeries(optionCtx), stepSeries(optionCtx)]}
  }
})

EChartsOption('viz.heatmap', {
  params: [
    {id: 'xCategories', as: 'array'},
    {id: 'yCategories', as: 'array'},
    {id: 'cells', as: 'array'},
    {id: 'title', as: 'string', byName: true},
    {id: 'highlight', type: 'viz-highlight<viz>', byName: true},
    {id: 'valueFormat', type: 'viz-value-format<viz>', byName: true, defaultValue: compact()},
    {id: 'theme', type: 'viz-theme<viz>', defaultValue: defaultTheme()},
    {id: 'mainTitle', type: 'title-option<echart>', dynamic: true, defaultValue: title({
      text: '%title%',
      show: '%showTitle%',
      subtext: '%note%',
      left: 8,
      top: 6,
      textStyle: textStyle({ color: '%ink%', fontWeight: 600, fontSize: 15 }),
      subtextStyle: textStyle({ color: '%accent%', fontWeight: 600, fontSize: 12 })
    })},
    {id: 'gridOption', type: 'grid-option<echart>', dynamic: true, defaultValue: grid({ left: 4, right: 12, top: '%gridTop%', bottom: 48, containLabel: true })},
    {id: 'tooltipOption', type: 'tooltip-option<echart>', dynamic: true, defaultValue: tooltip({
      formatter: (ctx, {format, xCategories, yCategories}) =>
        `${yCategories[ctx.data.value[1]]} · ${xCategories[ctx.data.value[0]]}<br/><b>${format(ctx.data.value[2])}</b>`,
      position: 'top',
      borderColor: '%dim%',
      textStyle: textStyle({ fontSize: 12 })
    })},
    {id: 'xCategoryAxis', type: 'axis-option<echart>', dynamic: true, defaultValue: xAxis({
      type: 'category',
      Data: '%xCategories%',
      boundaryGap: true,
      axisLine: axisLine({ lineStyle: lineStyle({ color: '%dim%' }) }),
      axisTick: axisTick({ show: false }),
      axisLabel: axisLabel({ color: '%mute%', fontSize: 10, interval: 0, hideOverlap: true }),
      splitArea: splitArea({ show: true, areaStyle: areaStyle({ color: ['#fff','#fafbfc'] }) })
    })},
    {id: 'yCategoryAxis', type: 'axis-option<echart>', dynamic: true, defaultValue: yAxis({
      type: 'category',
      Data: '%yCategories%',
      boundaryGap: true,
      axisLine: axisLine({ lineStyle: lineStyle({ color: '%dim%' }) }),
      axisTick: axisTick({ show: false }),
      axisLabel: axisLabel({ color: '%mute%', fontSize: 10, interval: 0, hideOverlap: true }),
      splitArea: splitArea({ show: true, areaStyle: areaStyle({ color: ['#fff','#fafbfc'] }) })
    })},
    {id: 'visualMapOption', type: 'visual-map-option<echart>', dynamic: true, defaultValue: visualMap({
      min: '%min%',
      max: '%max%',
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 6,
      itemWidth: 12,
      itemHeight: 90,
      inRange: inRange({ color: '%heatColors%' }),
      textStyle: textStyle({ color: '%mute%', fontSize: 10 }),
      formatter: (ctx, {format}) => format(ctx.data)
    })},
    {id: 'seriesOption', type: 'series-option<echart>', dynamic: true, defaultValue: heatmap({
      Data: '%seriesData%',
      itemStyle: itemStyle({ borderColor: '#fff', borderWidth: 1.5 }),
      label: label({ show: true, fontSize: 10, formatter: (ctx, {format}) => format(ctx.data.value[2]) }),
      emphasis: emphasis({ itemStyle: itemStyle({ borderColor: '%ink%', borderWidth: 2.5 }) })
    })}
  ],
  impl: (ctx, {}, {xCategories, yCategories, cells, title, highlight, valueFormat, theme,
    mainTitle, gridOption, tooltipOption, xCategoryAxis, yCategoryAxis, visualMapOption, seriesOption}) => {
    xCategories = coreUtils.asArray(xCategories).map(String)
    yCategories = coreUtils.asArray(yCategories).map(String)
    cells = coreUtils.asArray(cells).map(item => ({name: `${item.x}|${item.y}`, x: String(item.x), y: String(item.y), value: +item.value || 0}))
    const highlights = coreUtils.asArray(highlight).map(item => item.resolve(ctx.setData(cells))), active = !!highlights.length
    const {palette, dim, ink, mute, fontFamily} = theme
    const matches = (item, index) => highlights.some(highlight => highlight.matches(ctx.setData({item, index})))
    const note = highlights.find(item => item.note)?.note, format = value => valueFormat(ctx.setData(value))
    const values = cells.map(item => item.value), seriesData = cells.map((item, index) => {
      const highlighted = matches(item, index)
      return {value: [xCategories.indexOf(item.x), yCategories.indexOf(item.y), item.value],
        itemStyle: active ? highlighted ? {borderColor: ink, borderWidth: 2.5, opacity: 1} : {opacity: .35} : undefined,
        label: {color: active && !highlighted ? mute : ink, fontWeight: highlighted ? 700 : 400}}
    })
    const optionCtx = ctx.setData({title: title || '', showTitle: !!(title || note), note: note || '', ink, accent: palette[0], mute, dim,
      gridTop: title ? note ? 60 : 46 : 14, xCategories, yCategories, min: Math.min(0, ...values), max: Math.max(1, ...values),
      heatColors: ['#eff6ff', '#93c5fd', palette[0]], seriesData})
      .setVars({format, xCategories, yCategories})
    return {color: palette, animation: !globalThis.window?.testing, textStyle: {fontFamily}, title: mainTitle(optionCtx),
      grid: gridOption(optionCtx), tooltip: tooltipOption(optionCtx), xAxis: xCategoryAxis(optionCtx), yAxis: yCategoryAxis(optionCtx),
      visualMap: visualMapOption(optionCtx), series: [seriesOption(optionCtx)]}
  }
})
