import { jb, dsls } from '@jb6/core'

const { tgp: { TgpType } } = dsls

const Theme = TgpType('theme', 'theme', { typescript: '{ fonts: Font[]; colors: Colors; typography: object; layout: object }' })
const Font = TgpType('font', 'theme')
const SurfaceColors = TgpType('surface-colors', 'theme')
const AccentColors = TgpType('accent-colors', 'theme')
const Colors = TgpType('colors', 'theme')
const TextStyle = TgpType('text-style', 'theme')
const Typography = TgpType('typography', 'theme')
const Layout = TgpType('layout', 'theme')
const Logo = TgpType('logo', 'theme')

Font('font', {
  params: [
    {id: 'role', as: 'string'},
    {id: 'family', as: 'string'},
    {id: 'woff2Url', as: 'string'},
    {id: 'weight', as: 'string'},
    {id: 'fallback', as: 'string'}
  ]
})
SurfaceColors('surfaceColors', {
  params: [
    {id: 'background', as: 'string'},
    {id: 'text', as: 'string'},
    {id: 'secondaryText', as: 'string'},
    {id: 'mutedText', as: 'string'},
    {id: 'border', as: 'string'}
  ]
})
AccentColors('accentColors', {
  params: [
    {id: 'solid', as: 'string'},
    {id: 'text', as: 'string'},
    {id: 'soft', as: 'string'},
    {id: 'border', as: 'string'},
    {id: 'onSolid', as: 'string'}
  ]
})
Colors('colors', {
  params: [
    {id: 'canvas', type: 'surface-colors<theme>'},
    {id: 'surface', type: 'surface-colors<theme>'},
    {id: 'panel', type: 'surface-colors<theme>'},
    {id: 'inverse', type: 'surface-colors<theme>'},
    {id: 'accent', type: 'accent-colors<theme>'}
  ]
})
TextStyle('textStyle', {
  params: [
    {id: 'font', as: 'string'},
    {id: 'size', as: 'number'},
    {id: 'weight', as: 'number'},
    {id: 'lineHeight', as: 'number'},
    {id: 'letterSpacing', as: 'string'}
  ]
})
Typography('typography', {
  params: [
    {id: 'heroTitle', type: 'text-style<theme>'},
    {id: 'title', type: 'text-style<theme>'},
    {id: 'statementTitle', type: 'text-style<theme>'},
    {id: 'statementLabel', type: 'text-style<theme>'},
    {id: 'lead', type: 'text-style<theme>'},
    {id: 'subtitle', type: 'text-style<theme>'},
    {id: 'body', type: 'text-style<theme>'},
    {id: 'heroLabel', type: 'text-style<theme>'},
    {id: 'label', type: 'text-style<theme>'},
    {id: 'caption', type: 'text-style<theme>'},
    {id: 'code', type: 'text-style<theme>'},
    {id: 'windowTitle', type: 'text-style<theme>'},
    {id: 'control', type: 'text-style<theme>'},
    {id: 'chartLabel', type: 'text-style<theme>'}
  ]
})
Layout('layout', {
  params: [
    {id: 'slideTop', as: 'number'},
    {id: 'slideRight', as: 'number'},
    {id: 'slideBottom', as: 'number'},
    {id: 'slideLeft', as: 'number'},
    {id: 'sectionGap', as: 'number'},
    {id: 'gridGap', as: 'number'}
  ]
})
Logo('logo', {
  params: [
    {id: 'src', as: 'string'},
    {id: 'mark', as: 'string'},
    {id: 'wordmark', as: 'string'}
  ]
})
Theme('theme', {
  params: [
    {id: 'fonts', type: 'font<theme>[]'},
    {id: 'colors', type: 'colors<theme>'},
    {id: 'typography', type: 'typography<theme>'},
    {id: 'layout', type: 'layout<theme>'},
    {id: 'logo', type: 'logo<theme>'},
    {id: 'appTheme', type: 'theme<theme>'}
  ]
})

const themeToCssVars = theme => {
  const { canvas = {}, surface = {}, panel = {}, inverse = {}, accent = {} } = theme.colors || {}
  const fonts = Object.fromEntries((theme.fonts || []).map(font => [
    `--font-${font.role}`, [font.family, font.fallback].filter(Boolean).join(',')
  ]))
  const typography = Object.fromEntries(Object.entries(theme.typography || {}).filter(([, style]) => style).flatMap(([role, style]) => {
    const id = role.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
    return [[`--${id}-size`, `${style.size}px`], [`--${id}-weight`, style.weight], [`--${id}-leading`, style.lineHeight],
      [`--${id}-tracking`, style.letterSpacing], [`--${id}-font`, `var(--font-${style.font})`]]
  }))
  return {
    '--canvas': canvas.background, '--surface': surface.background, '--panel': panel.background, '--inverse': inverse.background,
    '--text': canvas.text, '--secondary-text': canvas.secondaryText, '--muted-text': canvas.mutedText, '--border': canvas.border,
    '--surface-border': surface.border, '--panel-text': panel.text, '--panel-border': panel.border, '--inverse-text': inverse.text,
    '--accent': accent.solid, '--accent-text': accent.text, '--accent-soft': accent.soft, '--accent-border': accent.border,
    '--on-accent': accent.onSolid, '--slide-top': `${theme.layout?.slideTop || 0}px`, '--slide-right': `${theme.layout?.slideRight || 0}px`,
    '--slide-bottom': `${theme.layout?.slideBottom || 0}px`, '--slide-left': `${theme.layout?.slideLeft || 0}px`,
    '--section-gap': `${theme.layout?.sectionGap || 0}px`, '--grid-gap': `${theme.layout?.gridGap || 0}px`, ...fonts, ...typography
  }
}

const themeFontFaces = theme => (theme.fonts || []).filter(font => font.woff2Url).map(font =>
  `@font-face{font-family:'${font.family}';src:url('${font.woff2Url}') format('woff2');font-weight:${font.weight || 'normal'};font-display:swap}`
).join('\n')

Object.assign(jb.themeUtils ||= {}, { themeToCssVars, themeFontFaces })
