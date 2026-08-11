// Comax ERP live brand assets (comaxerp.com): green #61A60E CTAs + header border, logo green #5FA845,
// ink #454343, PLONI Hebrew typeface. Colors are inlined in tailwind classes; shared assets live here.
import { jb } from '@jb6/core'

// brand the shared viz kit (admin/viz): apple green #61A60E leads, then yellow #DFCB1A, emerald #23A455, ink #454343
jb.vizTheme = Object.assign(jb.vizTheme || {}, {
  palette: ['#61A60E', '#DFCB1A', '#23A455', '#454343', '#7DC528', '#0d9488', '#db2777', '#ea580c', '#7c3aed', '#0891b2', '#2563eb', '#9333ea'],
  accent: '#4a7f0b',
  fontFamily: 'PLONI, ui-sans-serif, system-ui, sans-serif'
})

export const comaxLogo = 'https://comaxerp.com/wp-content/uploads/2022/01/comax-logo1.png'
const face = (file, weight, fmt) => `@font-face{font-family:PLONI;font-weight:${weight};font-display:swap;src:url(https://comaxerp.com/wp-content/uploads/2022/01/ploni-${file}) format('${fmt}')}`
export const comaxFontCss = face('regular-aaa.woff', 400, 'woff') + face('medium-aaa.woff2', 500, 'woff2') + face('bold-aaa.woff', 700, 'woff')
  + '.comax-brand{font-family:PLONI,ui-sans-serif,system-ui,sans-serif}'
