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

VizHighlight('maximum', {
  params: [
    {id: 'note', as: 'string', byName: true}
  ],
  impl: (ctx, {}, {note}) => VizHighlight.coerce({max: true, note})
})

TgpType('viz-series', 'viz', {
  typescript: '{ name: string, values?: number[], points?: { x: any, y: number }[] }'
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
