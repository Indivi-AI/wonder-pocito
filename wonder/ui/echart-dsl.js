import { dsls } from '@jb6/core'

const { tgp: { TgpType } } = dsls

TgpType('text-style', 'echart', {
  typescript: '{ color?: any, fontStyle?: string, fontWeight?: string | number, fontFamily?: string, fontSize?: number, align?: string, padding?: any }'
})
TgpType('item-style', 'echart', {
  typescript: `{
    color?: any, opacity?: number, borderColor?: string, borderWidth?: number, borderRadius?: any,
    shadowBlur?: number, shadowColor?: string, gapWidth?: number
  }`
})
TgpType('line-style', 'echart', {typescript: '{ color?: any, width?: number, opacity?: number, type?: string }'})
TgpType('area-style', 'echart', {typescript: '{ color?: any, opacity?: number }'})
TgpType('label', 'echart', {
  typescript: `{
    show?: boolean, position?: any, distance?: number, color?: any, fontSize?: number, fontWeight?: string | number,
    formatter?: (params: any) => any, width?: number, overflow?: string, alignTo?: string, edgeDistance?: any, minMargin?: number, rich?: object
  }`
})
TgpType('label-line', 'echart', {
  typescript: '{ show?: boolean, length?: number, length2?: number, smooth?: boolean, lineStyle?: LineStyle }'
})
TgpType('emphasis', 'echart', {
  typescript: `{
    focus?: string, scale?: boolean, scaleSize?: number, disabled?: boolean, itemStyle?: ItemStyle,
    label?: Label, lineStyle?: LineStyle, areaStyle?: AreaStyle
  }`
})
TgpType('axis-line', 'echart', {typescript: '{ show?: boolean, lineStyle?: LineStyle }'})
TgpType('axis-tick', 'echart', {
  typescript: '{ show?: boolean, alignWithLabel?: boolean, distance?: number, length?: number, lineStyle?: LineStyle }'
})
TgpType('axis-label', 'echart', {
  typescript: `{
    show?: boolean, color?: any, fontSize?: number, fontWeight?: string | number, formatter?: (value: any) => any,
    interval?: any, hideOverlap?: boolean, rotate?: number, width?: number, overflow?: string, distance?: number
  }`
})
TgpType('split-line', 'echart', {
  typescript: '{ show?: boolean, distance?: number, length?: number, lineStyle?: LineStyle }'
})
TgpType('split-area', 'echart', {typescript: '{ show?: boolean, areaStyle?: AreaStyle }'})
TgpType('axis-pointer', 'echart', {typescript: '{ type?: string, lineStyle?: LineStyle, shadowStyle?: object }'})
TgpType('mark-line', 'echart', {
  typescript: '{ silent?: boolean, symbol?: any, lineStyle?: LineStyle, data?: any[] }'
})
TgpType('mark-point', 'echart', {
  typescript: '{ symbol?: any, symbolSize?: any, itemStyle?: ItemStyle, data?: any[] }'
})
TgpType('progress', 'echart', {
  typescript: '{ show?: boolean, width?: number, roundCap?: boolean, itemStyle?: ItemStyle }'
})
TgpType('pointer', 'echart', {
  typescript: '{ show?: boolean, width?: number, length?: any, offsetCenter?: any[], keepAspect?: boolean, icon?: string, itemStyle?: ItemStyle }'
})
TgpType('anchor', 'echart', {typescript: '{ show?: boolean, size?: number, itemStyle?: ItemStyle }'})
TgpType('detail', 'echart', {
  typescript: `{
    show?: boolean, valueAnimation?: boolean, formatter?: (value: any) => any, fontSize?: number,
    fontWeight?: string | number, color?: any, offsetCenter?: any[]
  }`
})
TgpType('gauge-title', 'echart', {
  typescript: '{ show?: boolean, offsetCenter?: any[], color?: any, fontSize?: number, fontWeight?: string | number }'
})
TgpType('breadcrumb', 'echart', {typescript: '{ show?: boolean }'})
TgpType('in-range', 'echart', {typescript: '{ color?: string[] }'})
TgpType('dataset-transform', 'echart', {
  typescript: `{
    type: string, config?: object,
    transform?: (params: EChartsTransformParams) => EChartsTransformResult | EChartsTransformResult[]
  }`
})
TgpType('dataset', 'echart', {
  typescript: '{ source?: any[], fromDatasetIndex?: number, fromDatasetId?: string, transform?: DatasetTransform }'
})
TgpType('encode', 'echart', {
  typescript: '{ x?: string | number, y?: string | number, itemName?: string | number, tooltip?: (string | number)[] }'
})
TgpType('echarts', 'echart', {
  modifierId: 'ECharts',
  typescript: `{
    color?: string[], animation?: boolean, textStyle?: TextStyle,
    title?: Title | Title[], tooltip?: Tooltip, legend?: Legend,
    grid?: Grid, xAxis?: Axis | Axis[], yAxis?: Axis | Axis[],
    dataZoom?: DataZoom[], visualMap?: VisualMap, radar?: Radar,
    dataset?: Dataset | Dataset[], graphic?: GraphicElement[], series: Series[]
  }`
})
TgpType('title', 'echart', {
  typescript: `{
    show?: boolean, text?: string, subtext?: string, left?: any, top?: any, textVerticalAlign?: string,
    textStyle?: TextStyle, subtextStyle?: TextStyle
  }`
})
TgpType('tooltip', 'echart', {
  typescript: `{
    show?: boolean, trigger?: string, formatter?: Function, valueFormatter?: Function,
    position?: any, confine?: boolean, borderColor?: string, textStyle?: TextStyle, axisPointer?: AxisPointer
  }`
})
TgpType('legend', 'echart', {
  typescript: '{ show?: boolean, data?: string[], type?: string, bottom?: any, itemWidth?: number, itemGap?: number, textStyle?: TextStyle }'
})
TgpType('grid', 'echart', {typescript: '{ left?: any, right?: any, top?: any, bottom?: any, containLabel?: boolean }'})
TgpType('axis', 'echart', {
  typescript: `{
    type?: string, data?: any[], name?: string, nameLocation?: string, nameGap?: number,
    nameTextStyle?: TextStyle, boundaryGap?: any, axisLine?: AxisLine, axisTick?: AxisTick,
    axisLabel?: AxisLabel, splitLine?: SplitLine, splitArea?: SplitArea, inverse?: boolean,
    scale?: boolean, minInterval?: number, triggerEvent?: boolean
  }`
})
TgpType('data-zoom', 'echart', {
  typescript: `{
    type?: string, xAxisIndex?: number, yAxisIndex?: number, height?: number,
    bottom?: any, borderColor?: string, fillerColor?: string
  }`
})
TgpType('visual-map', 'echart', {
  typescript: `{
    min?: number, max?: number, calculable?: boolean, orient?: string, left?: any, bottom?: any,
    itemWidth?: number, itemHeight?: number, inRange?: InRange, textStyle?: TextStyle, formatter?: Function
  }`
})
TgpType('radar', 'echart', {
  typescript: `{
    indicator?: {name: string, max: number}[], center?: any[], radius?: any,
    axisName?: TextStyle, axisNameGap?: number, splitNumber?: number, axisLine?: AxisLine,
    splitLine?: SplitLine, splitArea?: SplitArea
  }`
})
TgpType('graphic-element', 'echart', {
  typescript: '{ type: string, z?: number, right?: any, left?: any, top?: any, style?: object, silent?: boolean }'
})
TgpType('series', 'echart', {
  typescript: `{
    type: 'pie' | 'bar' | 'line' | 'scatter' | 'heatmap' | 'boxplot' | 'funnel' | 'gauge' | 'treemap' | 'radar',
    name?: string, data?: any[]
  }`
})

const { echart: {
  TextStyle, ItemStyle, LineStyle, AreaStyle, Label, LabelLine, Emphasis,
  AxisLine, AxisTick, AxisLabel, SplitLine, SplitArea, AxisPointer, MarkLine,
  MarkPoint, Progress, Pointer, Anchor, Detail, Breadcrumb, InRange, ECharts,
  Title, Tooltip, Legend, Grid, Axis, DataZoom, VisualMap, Radar, GaugeTitle,
  GraphicElement, Series, DatasetTransform, Dataset, Encode
} } = dsls

DatasetTransform('boundIQR', {
  params: [
    {id: 'factor', as: 'number', byName: true, defaultValue: 1.5}
  ],
  impl: ({}, {}, {factor}) => ({type: 'boxplot', config: {boundIQR: factor}})
})

DatasetTransform('bin', {
  params: [
    {id: 'dimension', byName: true},
    {id: 'maxBins', as: 'number', defaultValue: 10}
  ],
  impl: ({}, {}, {dimension, maxBins}) => ({
    type: 'wonder:bin',
    config: {dimension, maxBins},
    transform: ({upstream, config}) => {
      const dimension = upstream.getDimensionInfo(config.dimension).index
      const values = Array.from({length: upstream.count()}, (_, index) => +upstream.retrieveValue(index, dimension)).filter(Number.isFinite)
      const min = Math.min(...values), max = Math.max(...values), bins = Math.max(1, Math.round(config.maxBins) || 10), step = (max - min || 1) / bins
      const counts = Array(bins).fill(0)
      values.forEach(value => counts[Math.min(bins - 1, Math.floor((value - min) / step))]++)
      return {dimensions: ['binStart', 'binEnd', 'bin', 'count'], data: counts.map((count, index) => {
        const start = min + index * step, end = index == bins - 1 ? max : start + step
        return [start, end, `${start}–${end}`, count]
      })}
    }
  })
})

Dataset('dataset', {
  params: [
    {id: 'source', byName: true},
    {id: 'fromDatasetIndex', as: 'number'},
    {id: 'fromDatasetId', as: 'string'},
    {id: 'transform', type: 'dataset-transform<echart>'}
  ],
  impl: ({}, {}, option) => Object.fromEntries(Object.entries(option).filter(([, value]) => value != null && value !== ''))
})

Encode('encode', {
  params: [
    {id: 'x', byName: true},
    {id: 'y'},
    {id: 'itemName'},
    {id: 'tooltip', as: 'array'}
  ]
})

TextStyle('textStyle', {
  params: [
    {id: 'color', byName: true},
    {id: 'fontStyle', as: 'string', options: 'normal,italic,oblique'},
    {id: 'fontWeight'},
    {id: 'fontFamily', as: 'string'},
    {id: 'fontSize', as: 'number'},
    {id: 'align', as: 'string', options: 'left,center,right'},
    {id: 'padding'}
  ]
})

ItemStyle('itemStyle', {
  params: [
    {id: 'color', byName: true},
    {id: 'opacity', as: 'number'},
    {id: 'borderColor', as: 'string'},
    {id: 'borderWidth', as: 'number'},
    {id: 'borderRadius'},
    {id: 'shadowBlur', as: 'number'},
    {id: 'shadowColor', as: 'string'},
    {id: 'gapWidth', as: 'number'}
  ]
})

LineStyle('lineStyle', {
  params: [
    {id: 'color', byName: true},
    {id: 'width', as: 'number'},
    {id: 'opacity', as: 'number'},
    {id: 'type', as: 'string', options: 'solid,dashed,dotted'}
  ]
})

AreaStyle('areaStyle', {
  params: [
    {id: 'color', byName: true},
    {id: 'opacity', as: 'number'}
  ]
})

Label('label', {
  params: [
    {id: 'show', byName: true, type: 'boolean<common>'},
    {id: 'position'},
    {id: 'distance', as: 'number'},
    {id: 'color'},
    {id: 'fontSize', as: 'number'},
    {id: 'fontWeight'},
    {id: 'formatter', dynamic: true},
    {id: 'width', as: 'number'},
    {id: 'overflow', as: 'string', options: 'truncate,break,breakAll'},
    {id: 'alignTo', as: 'string', options: 'none,labelLine,edge'},
    {id: 'edgeDistance'},
    {id: 'minMargin', as: 'number'},
    {id: 'rich', as: 'object'}
  ],
  impl: (ctx, {}, {formatter, ...option}) => ({...option,
    ...(formatter.profile == null ? {} : {formatter: params => formatter(ctx.setData(params))})})
})

LabelLine('labelLine', {
  params: [
    {id: 'show', byName: true, type: 'boolean<common>'},
    {id: 'length', as: 'number'},
    {id: 'length2', as: 'number'},
    {id: 'smooth', type: 'boolean<common>'},
    {id: 'lineStyle', type: 'line-style<echart>'}
  ]
})

Emphasis('emphasis', {
  params: [
    {id: 'focus', as: 'string', options: 'none,self,series,adjacency', byName: true},
    {id: 'scale', type: 'boolean<common>'},
    {id: 'scaleSize', as: 'number'},
    {id: 'disabled', type: 'boolean<common>'},
    {id: 'itemStyle', type: 'item-style<echart>'},
    {id: 'label', type: 'label<echart>'},
    {id: 'lineStyle', type: 'line-style<echart>'},
    {id: 'areaStyle', type: 'area-style<echart>'}
  ]
})

AxisLine('axisLine', {
  params: [
    {id: 'show', byName: true, type: 'boolean<common>'},
    {id: 'lineStyle', type: 'line-style<echart>'}
  ]
})

AxisTick('axisTick', {
  params: [
    {id: 'show', byName: true, type: 'boolean<common>'},
    {id: 'alignWithLabel', type: 'boolean<common>'},
    {id: 'distance', as: 'number'},
    {id: 'length', as: 'number'},
    {id: 'lineStyle', type: 'line-style<echart>'}
  ]
})

AxisLabel('axisLabel', {
  params: [
    {id: 'show', byName: true, type: 'boolean<common>'},
    {id: 'color'},
    {id: 'fontSize', as: 'number'},
    {id: 'fontWeight'},
    {id: 'formatter', dynamic: true},
    {id: 'interval'},
    {id: 'hideOverlap', type: 'boolean<common>'},
    {id: 'rotate', as: 'number'},
    {id: 'width', as: 'number'},
    {id: 'overflow', as: 'string', options: 'truncate,break,breakAll'},
    {id: 'distance', as: 'number'}
  ],
  impl: (ctx, {}, {formatter, ...option}) => ({...option,
    ...(formatter.profile == null ? {} : {formatter: value => formatter(ctx.setData(value))})})
})

SplitLine('splitLine', {
  params: [
    {id: 'show', byName: true, type: 'boolean<common>'},
    {id: 'distance', as: 'number'},
    {id: 'length', as: 'number'},
    {id: 'lineStyle', type: 'line-style<echart>'}
  ]
})

SplitArea('splitArea', {
  params: [
    {id: 'show', byName: true, type: 'boolean<common>'},
    {id: 'areaStyle', type: 'area-style<echart>'}
  ]
})

AxisPointer('axisPointer', {
  params: [
    {id: 'type', as: 'string', options: 'line,shadow,none,cross', byName: true},
    {id: 'lineStyle', type: 'line-style<echart>'},
    {id: 'shadowStyle', as: 'object'}
  ]
})

MarkLine('markLine', {
  params: [
    {id: 'Data', as: 'array', byName: true},
    {id: 'silent', type: 'boolean<common>'},
    {id: 'symbol'},
    {id: 'lineStyle', type: 'line-style<echart>'}
  ],
  impl: ({}, {}, {Data, ...option}) => ({...option, data: Data})
})

MarkPoint('markPoint', {
  params: [
    {id: 'Data', as: 'array', byName: true},
    {id: 'symbol'},
    {id: 'symbolSize'},
    {id: 'itemStyle', type: 'item-style<echart>'}
  ],
  impl: ({}, {}, {Data, ...option}) => ({...option, data: Data})
})

Progress('progress', {
  params: [
    {id: 'show', byName: true, type: 'boolean<common>'},
    {id: 'width', as: 'number'},
    {id: 'roundCap', type: 'boolean<common>'},
    {id: 'itemStyle', type: 'item-style<echart>'}
  ]
})

Pointer('pointer', {
  params: [
    {id: 'show', byName: true, type: 'boolean<common>'},
    {id: 'width', as: 'number'},
    {id: 'length'},
    {id: 'offsetCenter', as: 'array'},
    {id: 'keepAspect', type: 'boolean<common>'},
    {id: 'icon', as: 'string'},
    {id: 'itemStyle', type: 'item-style<echart>'}
  ]
})

Anchor('anchor', {
  params: [
    {id: 'show', byName: true, type: 'boolean<common>'},
    {id: 'size', as: 'number'},
    {id: 'itemStyle', type: 'item-style<echart>'}
  ]
})

Detail('detail', {
  params: [
    {id: 'show', byName: true, type: 'boolean<common>'},
    {id: 'valueAnimation', type: 'boolean<common>'},
    {id: 'formatter', dynamic: true},
    {id: 'fontSize', as: 'number'},
    {id: 'fontWeight'},
    {id: 'color'},
    {id: 'offsetCenter', as: 'array'}
  ],
  impl: (ctx, {}, {formatter, ...option}) => ({...option,
    ...(formatter.profile == null ? {} : {formatter: value => formatter(ctx.setData(value))})})
})

GaugeTitle('gaugeTitle', {
  params: [
    {id: 'show', byName: true, type: 'boolean<common>'},
    {id: 'offsetCenter', as: 'array'},
    {id: 'color'},
    {id: 'fontSize', as: 'number'},
    {id: 'fontWeight'}
  ]
})

Breadcrumb('breadcrumb', {
  params: [
    {id: 'show', byName: true, type: 'boolean<common>'}
  ]
})

InRange('inRange', {
  params: [
    {id: 'color', as: 'array', byName: true}
  ]
})

ECharts('option', {
  params: [
    {id: 'series', type: 'series<echart>[]', byName: true},
    {id: 'color', as: 'array'},
    {id: 'animation', type: 'boolean<common>'},
    {id: 'textStyle', type: 'text-style<echart>'},
    {id: 'title', type: 'title<echart>[]'},
    {id: 'tooltip', type: 'tooltip<echart>'},
    {id: 'legend', type: 'legend<echart>'},
    {id: 'grid', type: 'grid<echart>'},
    {id: 'xAxis', type: 'axis<echart>'},
    {id: 'yAxis', type: 'axis<echart>'},
    {id: 'dataZoom', type: 'data-zoom<echart>[]'},
    {id: 'visualMap', type: 'visual-map<echart>'},
    {id: 'radar', type: 'radar<echart>'},
    {id: 'dataset', type: 'dataset<echart>[]'},
    {id: 'graphic', type: 'graphic-element<echart>[]'}
  ]
})

Title('title', {
  params: [
    {id: 'text', as: 'string', byName: true},
    {id: 'show', type: 'boolean<common>'},
    {id: 'subtext', as: 'string'},
    {id: 'left'},
    {id: 'top'},
    {id: 'textVerticalAlign', as: 'string', options: 'top,middle,bottom'},
    {id: 'textStyle', type: 'text-style<echart>'},
    {id: 'subtextStyle', type: 'text-style<echart>'}
  ]
})

Tooltip('tooltip', {
  params: [
    {id: 'trigger', as: 'string', options: 'item,axis,none', byName: true},
    {id: 'formatter', dynamic: true},
    {id: 'valueFormatter', dynamic: true},
    {id: 'position'},
    {id: 'confine', type: 'boolean<common>'},
    {id: 'borderColor', as: 'string'},
    {id: 'textStyle', type: 'text-style<echart>'},
    {id: 'axisPointer', type: 'axis-pointer<echart>'},
    {id: 'show', type: 'boolean<common>'}
  ],
  impl: (ctx, {}, {formatter, valueFormatter, ...option}) => ({...option,
    ...(formatter.profile == null ? {} : {formatter: params => formatter(ctx.setData(params))}),
    ...(valueFormatter.profile == null ? {} : {valueFormatter: value => valueFormatter(ctx.setData(value))})})
})

Legend('legend', {
  params: [
    {id: 'Data', as: 'array', byName: true},
    {id: 'show', type: 'boolean<common>'},
    {id: 'type', as: 'string', options: 'plain,scroll'},
    {id: 'bottom'},
    {id: 'itemWidth', as: 'number'},
    {id: 'itemGap', as: 'number'},
    {id: 'textStyle', type: 'text-style<echart>'}
  ],
  impl: ({}, {}, {Data, ...option}) => ({...Object.fromEntries(Object.entries(option).filter(([, value]) => value != null)), data: Data})
})

Grid('grid', {
  params: [
    {id: 'left', byName: true},
    {id: 'right'},
    {id: 'top'},
    {id: 'bottom'},
    {id: 'containLabel', type: 'boolean<common>'}
  ]
})

Axis('xAxis', {
  params: [
    {id: 'type', as: 'string', options: 'value,category,time,log', byName: true},
    {id: 'Data'},
    {id: 'name', as: 'string'},
    {id: 'nameLocation', as: 'string', options: 'start,middle,end'},
    {id: 'nameGap', as: 'number'},
    {id: 'nameTextStyle', type: 'text-style<echart>'},
    {id: 'boundaryGap'},
    {id: 'axisLine', type: 'axis-line<echart>'},
    {id: 'axisTick', type: 'axis-tick<echart>'},
    {id: 'axisLabel', type: 'axis-label<echart>'},
    {id: 'splitLine', type: 'split-line<echart>'},
    {id: 'splitArea', type: 'split-area<echart>'},
    {id: 'inverse', type: 'boolean<common>'},
    {id: 'scale', type: 'boolean<common>'},
    {id: 'minInterval', as: 'number'},
    {id: 'triggerEvent', type: 'boolean<common>'}
  ],
  impl: ({}, {}, {Data, ...option}) => ({...option, ...(Data == null ? {} : {data: Data})})
})

Axis('yAxis', {
  params: [
    {id: 'type', as: 'string', options: 'value,category,time,log', byName: true},
    {id: 'Data'},
    {id: 'name', as: 'string'},
    {id: 'nameLocation', as: 'string', options: 'start,middle,end'},
    {id: 'nameGap', as: 'number'},
    {id: 'nameTextStyle', type: 'text-style<echart>'},
    {id: 'boundaryGap'},
    {id: 'axisLine', type: 'axis-line<echart>'},
    {id: 'axisTick', type: 'axis-tick<echart>'},
    {id: 'axisLabel', type: 'axis-label<echart>'},
    {id: 'splitLine', type: 'split-line<echart>'},
    {id: 'splitArea', type: 'split-area<echart>'},
    {id: 'inverse', type: 'boolean<common>'},
    {id: 'scale', type: 'boolean<common>'},
    {id: 'minInterval', as: 'number'},
    {id: 'triggerEvent', type: 'boolean<common>'}
  ],
  impl: ({}, {}, {Data, ...option}) => ({...option, ...(Data == null ? {} : {data: Data})})
})

DataZoom('dataZoom', {
  params: [
    {id: 'type', as: 'string', options: 'inside,slider', byName: true},
    {id: 'xAxisIndex', as: 'number'},
    {id: 'yAxisIndex', as: 'number'},
    {id: 'height', as: 'number'},
    {id: 'bottom'},
    {id: 'borderColor', as: 'string'},
    {id: 'fillerColor', as: 'string'}
  ]
})

VisualMap('visualMap', {
  params: [
    {id: 'min', as: 'number', byName: true},
    {id: 'max', as: 'number'},
    {id: 'calculable', type: 'boolean<common>'},
    {id: 'orient', as: 'string', options: 'horizontal,vertical'},
    {id: 'left'},
    {id: 'bottom'},
    {id: 'itemWidth', as: 'number'},
    {id: 'itemHeight', as: 'number'},
    {id: 'inRange', type: 'in-range<echart>'},
    {id: 'textStyle', type: 'text-style<echart>'},
    {id: 'formatter', dynamic: true}
  ],
  impl: (ctx, {}, {formatter, ...option}) => ({...option,
    ...(formatter.profile == null ? {} : {formatter: value => formatter(ctx.setData(value))})})
})

Radar('radarConfig', {
  params: [
    {id: 'indicator', as: 'array', byName: true},
    {id: 'center', as: 'array'},
    {id: 'radius'},
    {id: 'axisName', type: 'text-style<echart>'},
    {id: 'axisNameGap', as: 'number'},
    {id: 'splitNumber', as: 'number'},
    {id: 'axisLine', type: 'axis-line<echart>'},
    {id: 'splitLine', type: 'split-line<echart>'},
    {id: 'splitArea', type: 'split-area<echart>'}
  ]
})

GraphicElement('graphic', {
  params: [
    {id: 'type', as: 'string', options: 'group,image,text,rect,circle,ring,sector,arc,polygon,polyline,line,bezierCurve', byName: true},
    {id: 'z', as: 'number'},
    {id: 'right'},
    {id: 'left'},
    {id: 'top'},
    {id: 'style', as: 'object'},
    {id: 'silent', type: 'boolean<common>'}
  ]
})

const {
  'item-style': {itemStyle}, 'emphasis': {emphasis}, 'label-line': {labelLine},
  'line-style': {lineStyle}, 'label': {label}
} = dsls.echart

Series('pie', {
  params: [
    {id: 'Data', as: 'array', dynamic: true, byName: true},
    {id: 'name', as: 'string'},
    {id: 'radius'},
    {id: 'center', as: 'array'},
    {id: 'avoidLabelOverlap', type: 'boolean<common>'},
    {id: 'minAngle', as: 'number', defaultValue: 6},
    {id: 'padAngle', as: 'number', defaultValue: 2},
    {id: 'itemStyle', type: 'item-style<echart>', defaultValue: itemStyle({ borderColor: '#fff', borderWidth: 2, borderRadius: 4 })},
    {id: 'emphasis', type: 'emphasis<echart>', defaultValue: emphasis({
      scaleSize: 6,
      itemStyle: itemStyle({ shadowBlur: 10, shadowColor: 'rgba(37,99,235,0.25)' })
    })},
    {id: 'selectedMode', defaultValue: 'single'},
    {id: 'selectedOffset', as: 'number'},
    {id: 'labelLine', type: 'label-line<echart>', defaultValue: labelLine({
      show: '%showLabels%',
      length: 12,
      length2: 10,
      smooth: true,
      lineStyle: lineStyle({ color: '%mute%' })
    })},
    {id: 'label', type: 'label<echart>', defaultValue: label({
      show: '%showLabels%',
      fontSize: 11,
      formatter: ctx => `${ctx.data.name}  ${ctx.data.percent}%`,
      width: '%labelWidth%',
      overflow: 'break',
      alignTo: 'edge',
      edgeDistance: 6,
      minMargin: 4
    })}
  ],
  impl: (ctx, {}, {Data, ...option}) => ({type: 'pie', ...option, data: Data(ctx)})
})

Series('bar', {
  params: [
    {id: 'Data', as: 'array', dynamic: true, byName: true},
    {id: 'name', as: 'string'},
    {id: 'stack', as: 'string'},
    {id: 'silent', type: 'boolean<common>'},
    {id: 'barWidth'},
    {id: 'barMaxWidth', as: 'number'},
    {id: 'barGap'},
    {id: 'barCategoryGap'},
    {id: 'itemStyle', type: 'item-style<echart>'},
    {id: 'emphasis', type: 'emphasis<echart>'},
    {id: 'label', type: 'label<echart>'},
    {id: 'labelLayout', asIs: true},
    {id: 'markLine', type: 'mark-line<echart>'},
    {id: 'tooltip', type: 'tooltip<echart>'},
    {id: 'datasetIndex', as: 'number'},
    {id: 'encode', type: 'encode<echart>'},
    {id: 'z', as: 'number'}
  ],
  impl: (ctx, {}, {Data, ...option}) => ({type: 'bar', ...option, ...(Data.profile == null ? {} : {data: Data(ctx)})})
})

Series('line', {
  params: [
    {id: 'Data', as: 'array', dynamic: true, byName: true},
    {id: 'name', as: 'string'},
    {id: 'smooth', type: 'boolean<common>'},
    {id: 'triggerLineEvent', type: 'boolean<common>'},
    {id: 'showSymbol', type: 'boolean<common>'},
    {id: 'symbolSize'},
    {id: 'stack', as: 'string'},
    {id: 'lineStyle', type: 'line-style<echart>'},
    {id: 'itemStyle', type: 'item-style<echart>'},
    {id: 'areaStyle', type: 'area-style<echart>'},
    {id: 'emphasis', type: 'emphasis<echart>'},
    {id: 'z', as: 'number'}
  ],
  impl: (ctx, {}, {Data, ...option}) => ({type: 'line', ...option, data: Data(ctx)})
})

Series('scatter', {
  params: [
    {id: 'Data', as: 'array', dynamic: true, byName: true},
    {id: 'name', as: 'string'},
    {id: 'symbol'},
    {id: 'symbolSize'},
    {id: 'itemStyle', type: 'item-style<echart>'},
    {id: 'emphasis', type: 'emphasis<echart>'},
    {id: 'silent', type: 'boolean<common>'},
    {id: 'z', as: 'number'}
  ],
  impl: (ctx, {}, {Data, ...option}) => ({type: 'scatter', ...option, data: Data(ctx)})
})

Series('heatmap', {
  params: [
    {id: 'Data', as: 'array', dynamic: true, byName: true},
    {id: 'name', as: 'string'},
    {id: 'itemStyle', type: 'item-style<echart>'},
    {id: 'label', type: 'label<echart>'},
    {id: 'emphasis', type: 'emphasis<echart>'}
  ],
  impl: (ctx, {}, {Data, ...option}) => ({type: 'heatmap', ...option, data: Data(ctx)})
})

Series('boxplot', {
  params: [
    {id: 'Data', as: 'array', dynamic: true, byName: true},
    {id: 'name', as: 'string'},
    {id: 'boxWidth'},
    {id: 'itemStyle', type: 'item-style<echart>'},
    {id: 'emphasis', type: 'emphasis<echart>'}
  ],
  impl: (ctx, {}, {Data, ...option}) => ({type: 'boxplot', ...option, data: Data(ctx)})
})

Series('funnel', {
  params: [
    {id: 'Data', as: 'array', dynamic: true, byName: true},
    {id: 'name', as: 'string'},
    {id: 'sort', as: 'string', options: 'ascending,descending,none'},
    {id: 'top'},
    {id: 'bottom'},
    {id: 'left'},
    {id: 'right'},
    {id: 'gap', as: 'number'},
    {id: 'min', as: 'number'},
    {id: 'max', as: 'number'},
    {id: 'funnelAlign', as: 'string', options: 'left,center,right'},
    {id: 'minSize'},
    {id: 'itemStyle', type: 'item-style<echart>'},
    {id: 'emphasis', type: 'emphasis<echart>'},
    {id: 'label', type: 'label<echart>'},
    {id: 'labelLine', type: 'label-line<echart>'}
  ],
  impl: (ctx, {}, {Data, ...option}) => ({type: 'funnel', ...option, data: Data(ctx)})
})

Series('gauge', {
  params: [
    {id: 'Data', as: 'array', dynamic: true, byName: true},
    {id: 'name', as: 'string'},
    {id: 'min', as: 'number'},
    {id: 'max', as: 'number'},
    {id: 'radius'},
    {id: 'center', as: 'array'},
    {id: 'startAngle', as: 'number'},
    {id: 'endAngle', as: 'number'},
    {id: 'progress', type: 'progress<echart>'},
    {id: 'axisLine', type: 'axis-line<echart>'},
    {id: 'axisTick', type: 'axis-tick<echart>'},
    {id: 'splitLine', type: 'split-line<echart>'},
    {id: 'pointer', type: 'pointer<echart>'},
    {id: 'anchor', type: 'anchor<echart>'},
    {id: 'axisLabel', type: 'axis-label<echart>'},
    {id: 'detail', type: 'detail<echart>'},
    {id: 'title', type: 'gauge-title<echart>'},
    {id: 'markLine', type: 'mark-line<echart>'},
    {id: 'markPoint', type: 'mark-point<echart>'}
  ],
  impl: (ctx, {}, {Data, ...option}) => ({type: 'gauge', ...option, data: Data(ctx)})
})

Series('treemap', {
  params: [
    {id: 'Data', as: 'array', dynamic: true, byName: true},
    {id: 'name', as: 'string'},
    {id: 'roam', type: 'boolean<common>'},
    {id: 'nodeClick', description: `ECharts navigation mode: 'zoomToNode', 'link', or false to disable navigation`},
    {id: 'breadcrumb', type: 'breadcrumb<echart>'},
    {id: 'animationDuration', as: 'number'},
    {id: 'top'},
    {id: 'left'},
    {id: 'right'},
    {id: 'bottom'},
    {id: 'itemStyle', type: 'item-style<echart>'},
    {id: 'label', type: 'label<echart>'},
    {id: 'emphasis', type: 'emphasis<echart>'}
  ],
  impl: (ctx, {}, {Data, ...option}) => ({type: 'treemap', ...option, data: Data(ctx)})
})

Series('radar', {
  params: [
    {id: 'Data', as: 'array', dynamic: true, byName: true},
    {id: 'name', as: 'string'},
    {id: 'symbolSize'},
    {id: 'lineStyle', type: 'line-style<echart>'},
    {id: 'itemStyle', type: 'item-style<echart>'},
    {id: 'areaStyle', type: 'area-style<echart>'},
    {id: 'emphasis', type: 'emphasis<echart>'},
    {id: 'z', as: 'number'}
  ],
  impl: (ctx, {}, {Data, ...option}) => ({type: 'radar', ...option, data: Data(ctx)})
})
