import { dsls } from '@jb6/core'

const { tgp: { TgpType } } = dsls

const VizHighlight = TgpType('viz-highlight', 'viz', {
  typescript: '{ note?: string, resolve: (ctx) => VizHighlight, matches: (ctx) => boolean }',
  coerce: value => {
    const spec = typeof value == 'string' ? {name: value} : typeof value == 'number' ? {index: value} : value || {}
    return {...spec,
      resolve(ctx) {
        if (!(spec.min || spec.max) || !ctx.data.length) return this
        const item = ctx.data.reduce((a, b) => spec.max ? b.value > a.value ? b : a : b.value < a.value ? b : a)
        return {...this, name: item.name, matches: ctx => String(item.name) == ctx.data.item.name}
      },
      matches(ctx) {
        const {item, index} = ctx.data
        return spec.name != null ? String(spec.name) == item.name : spec.index != null ? spec.index == index
          : spec.range ? item.high > spec.range[0] && item.low < spec.range[1]
            : spec.x != null && spec.y != null ? String(spec.x) == item.x && String(spec.y) == item.y : false
      }
    }
  }
})

VizHighlight('byName', {
  params: [
    {id: 'name', as: 'string', byName: true},
    {id: 'note', as: 'string'}
  ],
  impl: (ctx, {}, spec) => VizHighlight.coerce(spec)
})
VizHighlight('byIndex', {
  params: [
    {id: 'index', as: 'number', byName: true},
    {id: 'note', as: 'string'}
  ],
  impl: (ctx, {}, spec) => VizHighlight.coerce(spec)
})
VizHighlight('maximum', {
  params: [
    {id: 'note', as: 'string', byName: true}
  ],
  impl: (ctx, {}, {note}) => VizHighlight.coerce({max: true, note})
})
VizHighlight('minimum', {
  params: [
    {id: 'note', as: 'string', byName: true}
  ],
  impl: (ctx, {}, {note}) => VizHighlight.coerce({min: true, note})
})
VizHighlight('range', {
  params: [
    {id: 'range', as: 'array', byName: true},
    {id: 'note', as: 'string'}
  ],
  impl: (ctx, {}, spec) => VizHighlight.coerce(spec)
})
VizHighlight('cell', {
  params: [
    {id: 'x', as: 'string', byName: true},
    {id: 'y', as: 'string'},
    {id: 'note', as: 'string'}
  ],
  impl: (ctx, {}, spec) => VizHighlight.coerce(spec)
})

const VizSeries = TgpType('viz-series', 'viz', {
  typescript: '{ name: string, values?: number[], points?: { x: any, y: number }[] }'
})

VizSeries('values', {
  params: [
    {id: 'name', as: 'string', byName: true},
    {id: 'values', as: 'array'}
  ]
})
VizSeries('points', {
  params: [
    {id: 'name', as: 'string', byName: true},
    {id: 'points', as: 'array'}
  ]
})

const VizColumn = TgpType('viz-column', 'viz', {
  typescript: '{ key: string, label?: string, format?: string }'
})

VizColumn('column', {
  params: [
    {id: 'key', as: 'string', byName: true},
    {id: 'label', as: 'string'},
    {id: 'format', as: 'string'}
  ]
})

const VizDrill = TgpType('viz-drill', 'viz', {
  typescript: '{ kind?: string, title?: string, sql?: string, question?: string, label?: string, valueFormat?: string }'
})

VizDrill('query', {
  params: [
    {id: 'kind', as: 'string', byName: true},
    {id: 'sql', as: 'string'},
    {id: 'title', as: 'string'},
    {id: 'question', as: 'string'},
    {id: 'label', as: 'string'},
    {id: 'valueFormat', as: 'string'}
  ]
})
VizDrill('question', {
  params: [
    {id: 'question', as: 'string', byName: true},
    {id: 'label', as: 'string'}
  ]
})

const VizValueFormat = TgpType('viz-value-format', 'viz', {
  typescript: '(ctx) => string',
  coerce: format => typeof format == 'function' ? format : ctx => {
    const value = +ctx.data, abs = Math.abs(value)
    const compact = abs >= 1e9 ? `${+(value / 1e9).toFixed(1)}B` : abs >= 1e6 ? `${+(value / 1e6).toFixed(1)}M`
      : abs >= 1e3 ? `${+(value / 1e3).toFixed(1)}K` : String(Math.round(value * 100) / 100)
    return format == '$' ? `$${compact}` : format == '₪' ? `${compact} ₪` : format == '%' ? `${compact}%`
      : format == 'int' ? String(Math.round(value)) : compact
  }
})

VizValueFormat('compact', {
  impl: () => VizValueFormat.coerce('compact')
})
VizValueFormat('currency', {
  params: [
    {id: 'symbol', as: 'string', byName: true}
  ],
  impl: (ctx, {}, {symbol}) => VizValueFormat.coerce(symbol)
})
VizValueFormat('percent', {
  impl: () => VizValueFormat.coerce('%')
})
VizValueFormat('integer', {
  impl: () => VizValueFormat.coerce('int')
})

const VizTheme = TgpType('viz-theme', 'viz', {
  typescript: '{ palette: string[], dim: string, ink: string, mute: string, fontFamily: string }'
})

VizTheme('defaultTheme', {
  impl: () => ({
    palette: ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#db2777', '#0d9488', '#ea580c'],
    dim: '#cbd5e1',
    ink: '#1e293b',
    mute: '#64748b',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif'
  })
})
VizTheme('customTheme', {
  params: [
    {id: 'palette', as: 'array', byName: true},
    {id: 'dim', as: 'string'},
    {id: 'ink', as: 'string'},
    {id: 'mute', as: 'string'},
    {id: 'fontFamily', as: 'string'}
  ]
})

const VizFrame = TgpType('viz-frame', 'viz', {
  typescript: '{ maxWidth: number, height: number }'
})

VizFrame('standardFrame', {
  impl: () => ({maxWidth: 540, height: 320})
})
VizFrame('compactFrame', {
  impl: () => ({maxWidth: 360, height: 220})
})
VizFrame('wideFrame', {
  impl: () => ({maxWidth: 900, height: 360})
})
VizFrame('customFrame', {
  params: [
    {id: 'maxWidth', as: 'number', byName: true},
    {id: 'height', as: 'number'}
  ]
})
