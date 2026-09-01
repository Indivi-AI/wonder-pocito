import { dsls } from '@jb6/core'
import '../theme-dsl.js'

const {
  theme: {
    Theme,
    theme: { theme }, font: { font }, 'surface-colors': { surfaceColors }, 'accent-colors': { accentColors },
    colors: { colors }, 'text-style': { textStyle }, typography: { typography }, logo: { logo }, layout: { layout }
  }
} = dsls

const wonderStudioTheme = Theme('wonderStudioTheme', {
  description: 'Wonder Studio application visual language',
  impl: theme({
    fonts: [
      font('body', 'Inter', {
        woff2Url: 'https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2',
        weight: '400 800',
        fallback: 'system-ui,sans-serif'
      }),
      font('code', 'ui-monospace', { fallback: 'Menlo,monospace' })
    ],
    colors: colors({
      canvas: surfaceColors('#fafafa', '#171717', {
        secondaryText: '#555555',
        mutedText: '#8a8a92',
        border: '#e6e6ea'
      }),
      surface: surfaceColors('#f5f5f6', '#171717', {
        secondaryText: '#555555',
        mutedText: '#8a8a92',
        border: '#e3e3e8'
      }),
      panel: surfaceColors('#ffffff', '#171717', {
        secondaryText: '#555555',
        mutedText: '#8a8a92',
        border: '#d9d9de'
      }),
      inverse: surfaceColors('#131417', '#ececf1', {
        secondaryText: '#9aa1ab',
        mutedText: '#6d727e',
        border: '#26272c'
      }),
      accent: accentColors('#ff4800', '#b93200', { soft: '#fff3ee', border: '#ffc9b3', onSolid: '#ffffff' })
    }),
    typography: typography({
      body: textStyle('body', 16, { weight: 400, lineHeight: 1.5 }),
      label: textStyle('body', 14, { weight: 700, lineHeight: 1.3 }),
      caption: textStyle('body', 13, { weight: 500, lineHeight: 1.3 }),
      code: textStyle('code', 15.5, { weight: 500, lineHeight: 1.62 }),
      windowTitle: textStyle('body', 15, { weight: 700, lineHeight: 1.2 }),
      control: textStyle('body', 16, { weight: 600, lineHeight: 1.3 }),
      chartLabel: textStyle('body', 13.5, { weight: 700, lineHeight: 1.2 })
    }),
    layout: layout(0, 0, { slideBottom: 0, slideLeft: 0, sectionGap: 16, gridGap: 16 })
  })
})

Theme('wonder', {
  description: 'Wonder visual language',
  impl: theme({
    fonts: [
      font('body', 'Inter', {
        woff2Url: 'https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2',
        weight: '400 800',
        fallback: 'system-ui,sans-serif'
      }),
      font('code', 'ui-monospace', { fallback: 'Menlo,monospace' })
    ],
    colors: colors({
      canvas: surfaceColors('#ffffff', '#171717', {
        secondaryText: '#555555',
        mutedText: '#8a8a92',
        border: '#d9d9de'
      }),
      surface: surfaceColors('#fafafa', '#171717', {
        secondaryText: '#555555',
        mutedText: '#8a8a92',
        border: '#e6e6ea'
      }),
      panel: surfaceColors('#ffffff', '#171717', {
        secondaryText: '#555555',
        mutedText: '#8a8a92',
        border: '#d9d9de'
      }),
      inverse: surfaceColors('#131417', '#ececf1', {
        secondaryText: '#9aa1ab',
        mutedText: '#6d727e',
        border: '#26272c'
      }),
      accent: accentColors('#ff4800', '#b93200', { soft: '#fff3ee', border: '#ffc9b3', onSolid: '#ffffff' })
    }),
    typography: typography({
      heroTitle: textStyle('body', 118, { weight: 600, lineHeight: 1.05, letterSpacing: '-0.035em' }),
      title: textStyle('body', 56, { weight: 600, lineHeight: 1.06, letterSpacing: '-0.035em' }),
      statementTitle: textStyle('body', 66, { weight: 600, lineHeight: 1.14, letterSpacing: '-0.03em' }),
      statementLabel: textStyle('body', 17, { weight: 800, lineHeight: 1.2, letterSpacing: '0.32em' }),
      lead: textStyle('body', 34, { weight: 400, lineHeight: 1.45 }),
      subtitle: textStyle('body', 24, { weight: 400, lineHeight: 1.45 }),
      body: textStyle('body', 20, { weight: 400, lineHeight: 1.5 }),
      heroLabel: textStyle('code', 23, { weight: 700, lineHeight: 1.2, letterSpacing: '0.2em' }),
      label: textStyle('body', 17, { weight: 800, lineHeight: 1.2, letterSpacing: '0.22em' }),
      caption: textStyle('code', 21, { weight: 600, lineHeight: 1.2 }),
      code: textStyle('code', 16, { weight: 500, lineHeight: 1.62 })
    }),
    layout: layout(60, 84, { slideBottom: 56, slideLeft: 84, sectionGap: 26, gridGap: 36 }),
    logo: logo({ mark: 'W', wordmark: 'Wonder' }),
    appTheme: wonderStudioTheme()
  })
})
