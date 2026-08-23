import { dsls, coreUtils } from '@jb6/core'
import '../echart-dsl.js'
import './viz-types.js'

const {
  echart: {
    ECharts, 'series': {line}, 'title': {title}, 'tooltip': {tooltip}, 'legend': {legend}, 'text-style': {textStyle},
    'grid': {grid}, 'axis': {xAxis, yAxis}, 'axis-line': {axisLine}, 'axis-tick': {axisTick}, 'axis-label': {axisLabel},
    'split-line': {splitLine}, 'axis-pointer': {axisPointer}, 'line-style': {lineStyle}, 'item-style': {itemStyle},
    'area-style': {areaStyle}, 'emphasis': {emphasis}, 'data-zoom': {dataZoom}
  },
  viz: {'viz-theme': {defaultTheme}, 'viz-value-format': {compact}}
} = dsls

ECharts('viz.line', {
  params: [
    {id: 'series', type: 'viz-series<viz>[]'},
    {id: 'points', as: 'array'},
    {id: 'title', as: 'string', byName: true},
    {id: 'note', as: 'string'},
    {id: 'highlight', type: 'viz-highlight<viz>', byName: true},
    {id: 'valueFormat', type: 'viz-value-format<viz>', byName: true, defaultValue: compact()},
    {id: 'theme', type: 'viz-theme<viz>', defaultValue: defaultTheme()},
    {id: 'xType', as: 'string', options: 'category,number,time', defaultValue: 'category'},
    {id: 'xLabel', as: 'string'},
    {id: 'yLabel', as: 'string'},
    {id: 'smooth', type: 'boolean<common>', defaultValue: true},
    {id: 'mainTitle', type: 'title<echart>', dynamic: true, defaultValue: title({
      text: '%title%',
      show: '%showTitle%',
      subtext: '%note%',
      left: 8,
      top: 6,
      textStyle: textStyle({ color: '%ink%', fontWeight: 600, fontSize: 15 }),
      subtextStyle: textStyle({ color: '%accent%', fontWeight: 600, fontSize: 12 })
    })},
    {id: 'gridOption', type: 'grid<echart>', dynamic: true, defaultValue: grid({ left: 58, right: 20, top: '%gridTop%', bottom: '%gridBottom%', containLabel: true })},
    {id: 'tooltipOption', type: 'tooltip<echart>', dynamic: true, defaultValue: tooltip({
      trigger: 'axis',
      valueFormatter: (ctx, {format}) => format(ctx.data),
      axisPointer: axisPointer({ type: 'line', lineStyle: lineStyle({ color: '%dim%' }) })
    })},
    {id: 'legendOption', type: 'legend<echart>', dynamic: true, defaultValue: legend({
      Data: '%legendData%',
      show: '%showLegend%',
      bottom: 2,
      textStyle: textStyle({ color: '#475569', fontSize: 12 })
    })},
    {id: 'xAxisOption', type: 'axis<echart>', dynamic: true, defaultValue: xAxis({
      type: '%axisType%',
      Data: '%categories%',
      name: '%xLabel%',
      nameLocation: 'middle',
      nameGap: 24,
      nameTextStyle: textStyle({ color: '%mute%', fontSize: 11 }),
      boundaryGap: false,
      axisLine: axisLine({ lineStyle: lineStyle({ color: '%dim%' }) }),
      axisTick: axisTick({ show: false }),
      axisLabel: axisLabel({
        color: '%mute%',
        fontSize: 10,
        interval: '%interval%',
        hideOverlap: '%hideOverlap%',
        rotate: '%rotate%',
        width: '%labelWidth%',
        overflow: '%overflow%'
      })
    })},
    {id: 'yAxisOption', type: 'axis<echart>', dynamic: true, defaultValue: yAxis({
      type: 'value',
      name: '%yLabel%',
      nameTextStyle: textStyle({ color: '%mute%', fontSize: 11 }),
      axisLine: axisLine({ show: false }),
      axisLabel: axisLabel({ color: '%mute%', fontSize: 10, formatter: (ctx, {format}) => format(ctx.data) }),
      splitLine: splitLine({ lineStyle: lineStyle({ color: '#f1f5f9' }) })
    })},
    {id: 'insideZoom', type: 'data-zoom<echart>', dynamic: true, defaultValue: dataZoom({ type: 'inside' })},
    {id: 'sliderZoom', type: 'data-zoom<echart>', dynamic: true, defaultValue: dataZoom({
      type: 'slider',
      height: 16,
      bottom: '%zoomBottom%',
      borderColor: '%dim%',
      fillerColor: 'rgba(37,99,235,0.08)'
    })},
    {id: 'seriesOption', type: 'series<echart>', dynamic: true, defaultValue: line({
      Data: '%Data%',
      name: '%name%',
      smooth: '%smooth%',
      triggerLineEvent: true,
      showSymbol: '%showSymbol%',
      symbolSize: 6,
      lineStyle: lineStyle({ color: '%color%', width: '%lineWidth%', opacity: '%opacity%' }),
      itemStyle: itemStyle({ color: '%color%' }),
      emphasis: emphasis({ focus: 'series', lineStyle: lineStyle({ width: '%emphasisWidth%' }) }),
      z: '%z%'
    })}
  ],
  impl: (ctx, {}, {series, points, title, note, highlight, valueFormat, theme, xType, xLabel, yLabel, smooth,
    mainTitle, gridOption, tooltipOption, legendOption, xAxisOption, yAxisOption, insideZoom, sliderZoom, seriesOption}) => {
    series = coreUtils.asArray(series).length ? series : points?.length ? [{name: title || 'series', points}] : []
    series = coreUtils.asArray(series).map(item => ({name: String(item.name ?? ''), points: coreUtils.asArray(item.points)
      .map(point => [point.x ?? point.name, point.y == null && point.value == null ? null : +(point.y ?? point.value) || 0])}))
    const highlights = coreUtils.asArray(highlight).map(item => item.resolve(ctx.setData(series))), active = !!highlights.length
    const {palette, dim, ink, mute, fontFamily} = theme, axisType = xType == 'number' ? 'value' : xType == 'time' ? 'time' : 'category'
    const matches = (item, index) => highlights.some(itemHighlight => itemHighlight.matches(ctx.setData({item, index})))
    note = note || highlights.find(item => item.note)?.note
    const multi = series.length > 1, zoom = axisType != 'category'
    const categories = axisType == 'category' ? series[0]?.points.map(point => String(point[0])) : null
    const allLabels = categories && categories.length <= 20, rotate = allLabels && categories.some(item => item.length > 8) ? 28 : 0
    const format = value => valueFormat(ctx.setData(value)), optionCtx = ctx.setData({title: title || '', showTitle: !!(title || note),
      note: note || '', ink, accent: palette[0], dim, mute, gridTop: title ? note ? 62 : 46 : 18,
      gridBottom: (multi ? 44 : 26) + (xLabel ? 20 : 0) + (zoom ? 30 : 0), legendData: series.map(item => item.name),
      showLegend: multi, axisType, categories, xLabel: xLabel || '', yLabel: yLabel || '', hideOverlap: !allLabels,
      interval: allLabels ? 0 : null, rotate, overflow: allLabels ? 'truncate' : null, labelWidth: allLabels ? 92 : null,
      zoomBottom: multi ? 24 : 6}).setVars({format})
    const seriesOptions = series.map((item, index) => {
      const on = !active || matches(item, index), color = on ? palette[index % palette.length] : dim
      return seriesOption(optionCtx.setData({name: item.name, smooth, color, opacity: on ? 1 : .7, lineWidth: on ? active ? 3 : 2.4 : 1.2,
        emphasisWidth: on ? 3.5 : 1.2, showSymbol: on && item.points.length <= 12, z: on ? 3 : 1,
        Data: axisType == 'category' ? item.points.map(point => point[1]) : item.points}))
    })
    return {color: palette, animation: !globalThis.window?.testing, textStyle: {fontFamily}, title: mainTitle(optionCtx),
      grid: gridOption(optionCtx), tooltip: tooltipOption(optionCtx), legend: legendOption(optionCtx), xAxis: xAxisOption(optionCtx),
      yAxis: yAxisOption(optionCtx), dataZoom: zoom ? [insideZoom(optionCtx), sliderZoom(optionCtx)] : [], series: seriesOptions}
  }
})

ECharts('viz.area', {
  params: [
    {id: 'series', type: 'viz-series<viz>[]'},
    {id: 'points', as: 'array'},
    {id: 'title', as: 'string', byName: true},
    {id: 'highlight', type: 'viz-highlight<viz>', byName: true},
    {id: 'valueFormat', type: 'viz-value-format<viz>', byName: true, defaultValue: compact()},
    {id: 'theme', type: 'viz-theme<viz>', defaultValue: defaultTheme()},
    {id: 'xType', as: 'string', options: 'category,number,time', defaultValue: 'category'},
    {id: 'xLabel', as: 'string'},
    {id: 'yLabel', as: 'string'},
    {id: 'stacked', type: 'boolean<common>'},
    {id: 'mainTitle', type: 'title<echart>', dynamic: true, defaultValue: title({
      text: '%title%',
      show: '%showTitle%',
      subtext: '%note%',
      left: 8,
      top: 6,
      textStyle: textStyle({ color: '%ink%', fontWeight: 600, fontSize: 15 }),
      subtextStyle: textStyle({ color: '%accent%', fontWeight: 600, fontSize: 12 })
    })},
    {id: 'gridOption', type: 'grid<echart>', dynamic: true, defaultValue: grid({ left: 52, right: 16, top: '%gridTop%', bottom: '%gridBottom%', containLabel: false })},
    {id: 'tooltipOption', type: 'tooltip<echart>', dynamic: true, defaultValue: tooltip({
      trigger: 'axis',
      valueFormatter: (ctx, {format}) => format(ctx.data),
      textStyle: textStyle({ color: '%ink%', fontSize: 12 }),
      axisPointer: axisPointer({ type: 'line', lineStyle: lineStyle({ color: '%dim%' }) })
    })},
    {id: 'legendOption', type: 'legend<echart>', dynamic: true, defaultValue: legend({
      Data: '%legendData%',
      show: '%showLegend%',
      bottom: 2,
      textStyle: textStyle({ color: '#475569', fontSize: 12 })
    })},
    {id: 'xAxisOption', type: 'axis<echart>', dynamic: true, defaultValue: xAxis({
      type: '%axisType%',
      Data: '%categories%',
      name: '%xLabel%',
      nameLocation: 'middle',
      nameGap: 26,
      boundaryGap: false,
      axisLine: axisLine({ lineStyle: lineStyle({ color: '%dim%' }) }),
      axisTick: axisTick({ show: false }),
      axisLabel: axisLabel({
        color: '%mute%',
        fontSize: 10,
        interval: '%interval%',
        hideOverlap: '%hideOverlap%',
        rotate: '%rotate%',
        width: '%labelWidth%',
        overflow: '%overflow%'
      })
    })},
    {id: 'yAxisOption', type: 'axis<echart>', dynamic: true, defaultValue: yAxis({
      type: 'value',
      name: '%yLabel%',
      axisLabel: axisLabel({ color: '%mute%', fontSize: 10, formatter: (ctx, {format}) => format(ctx.data) }),
      splitLine: splitLine({ lineStyle: lineStyle({ color: '#f1f5f9' }) })
    })},
    {id: 'seriesOption', type: 'series<echart>', dynamic: true, defaultValue: line({
      Data: '%Data%',
      name: '%name%',
      smooth: true,
      triggerLineEvent: true,
      showSymbol: '%showSymbol%',
      symbolSize: 5,
      stack: '%stack%',
      lineStyle: lineStyle({ color: '%color%', width: '%lineWidth%' }),
      itemStyle: itemStyle({ color: '%color%' }),
      areaStyle: areaStyle({ color: '%fill%', opacity: '%fillOpacity%' }),
      emphasis: emphasis({ focus: 'series' }),
      z: '%z%'
    })}
  ],
  impl: (ctx, {}, {series, points, title, highlight, valueFormat, theme, xType, xLabel, yLabel, stacked,
    mainTitle, gridOption, tooltipOption, legendOption, xAxisOption, yAxisOption, seriesOption}) => {
    series = coreUtils.asArray(series).length ? series : points?.length ? [{name: title || 'series', points}] : []
    series = coreUtils.asArray(series).map(item => ({name: String(item.name ?? ''), points: coreUtils.asArray(item.points)
      .map(point => [point.x ?? point.name, +(point.y ?? point.value) || 0])}))
    const highlights = coreUtils.asArray(highlight).map(item => item.resolve(ctx.setData(series))), active = !!highlights.length
    const {palette, dim, ink, mute, fontFamily} = theme, axisType = xType == 'number' ? 'value' : xType == 'time' ? 'time' : 'category'
    const matches = (item, index) => highlights.some(itemHighlight => itemHighlight.matches(ctx.setData({item, index})))
    const note = highlights.find(item => item.note)?.note, multi = series.length > 1
    const categories = axisType == 'category' ? series[0]?.points.map(point => String(point[0])) : null
    const allLabels = categories && categories.length <= 20, rotate = allLabels && categories.some(item => item.length > 8) ? 28 : 0
    const format = value => valueFormat(ctx.setData(value)), optionCtx = ctx.setData({title: title || '', showTitle: !!(title || note),
      note: note || '', ink, accent: palette[0], dim, mute, gridTop: title ? 50 : 18, gridBottom: (multi ? 40 : 30) + (rotate ? 34 : 0),
      legendData: series.map(item => item.name), showLegend: multi, axisType, categories, xLabel: xLabel || '', yLabel: yLabel || '',
      hideOverlap: !allLabels, interval: allLabels ? 0 : null, rotate, overflow: allLabels ? 'truncate' : null,
      labelWidth: allLabels ? 92 : null}).setVars({format})
    const seriesOptions = series.map((item, index) => {
      const on = !active || matches(item, index), color = on ? palette[index % palette.length] : dim
      const fill = stacked ? color : {type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [{offset: 0, color: `${color}${on ? '66' : '1f'}`}, {offset: 1, color: `${color}05`}]}
      return seriesOption(optionCtx.setData({name: item.name, color, fill, fillOpacity: stacked ? on ? .55 : .15 : null,
        lineWidth: on ? 2.5 : 1, stack: stacked ? 'total' : null, showSymbol: on && (multi ? active : false), z: on ? 3 : 1,
        Data: axisType == 'category' ? item.points.map(point => point[1]) : item.points}))
    })
    return {color: palette, animation: !globalThis.window?.testing, textStyle: {fontFamily}, title: mainTitle(optionCtx),
      grid: gridOption(optionCtx), tooltip: tooltipOption(optionCtx), legend: legendOption(optionCtx), xAxis: xAxisOption(optionCtx),
      yAxis: yAxisOption(optionCtx), series: seriesOptions}
  }
})
