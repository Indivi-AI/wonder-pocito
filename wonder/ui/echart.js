import { dsls, jb } from '@jb6/core'
import { reactUtils } from '@jb6/react/react-utils.js'
import './echart-dsl.js'

const { react: { ReactComp, 'react-comp': { comp }, 'react-metadata': { importUrl } } } = dsls

ReactComp('EChart', {
  params: [
    {id: 'option', type: 'echarts-option<echart>', dynamic: true}
  ],
  impl: comp({
    hFunc: (ctx, {react: {h, useEffect, useRef}}, {option}) => () => {
      const width = 540, height = 320
      const host = useRef(), chartRef = useRef(), optionRef = useRef()
      optionRef.current = option
      useEffect(() => {
        const echarts = reactUtils.imported('@jb6/react/lib/echarts/echarts.mjs')
        if (globalThis.window?.testing && !jb.__echartsReady) {
          jb.__echartsReady = true
          const measureText = text => ({width: String(text).length * 7.2})
          echarts.setPlatformAPI({measureText, createCanvas: () => ({getContext: () => ({measureText})})})
        }
        const chart = chartRef.current = echarts.init(host.current, null, {renderer: 'svg', width: host.current.clientWidth || width, height})
        chart.on('mouseover', ({targetType, value}) => targetType == 'axisLabel' && host.current?.setAttribute('title', value))
        chart.on('mouseout', ({targetType}) => targetType == 'axisLabel' && host.current?.removeAttribute('title'))
        const render = () => {
          chart.resize({width: host.current.clientWidth || width})
          const nextOption = optionRef.current(ctx.setVars({echartWidth: host.current.clientWidth || width,
            echartHeight: host.current.clientHeight || height}))
          const transforms = [], clean = value => Array.isArray(value) ? value.map(clean) : value && typeof value == 'object'
            ? Object.fromEntries(Object.entries(value).flatMap(([key, inner]) => {
              if (key == 'transform' && typeof inner == 'function') {
                transforms.push({type: value.type, transform: inner})
                return []
              }
              return [[key, clean(inner)]]
            })) : value
          const optionJson = clean(nextOption)
          jb.__echartsTransforms = jb.__echartsTransforms || new Set()
          transforms.filter(({type}) => !jb.__echartsTransforms.has(type)).forEach(transform => {
            echarts.registerTransform(transform)
            jb.__echartsTransforms.add(transform.type)
          })
          chart.setOption(optionJson, {notMerge: true})
        }
        render()
        const observer = globalThis.ResizeObserver && new globalThis.ResizeObserver(render)
        observer?.observe(host.current)
        return () => { observer?.disconnect(); chart.dispose(); chartRef.current = null }
      }, [])
      return h('div:viz-widget', {style: {direction: 'ltr', width: '100%', minWidth: 'min(100%, 480px)', maxWidth: `${width}px`, height: `${height}px`, background: '#fff',
        border: '1px solid #f1f5f9', borderRadius: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', boxSizing: 'border-box'}},
        h('div:viz-chart', {ref: host, style: {direction: 'ltr', width: '100%', height: `${height}px`}}))
    },
    metadata: importUrl('@jb6/react/lib/echarts/echarts.mjs')
  })
})
