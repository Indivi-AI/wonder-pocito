import { dsls } from '@jb6/core'
import './reveal-dsl.js'

const {
  reveal: {
    Theme,
    theme: { theme }, font: { font }, palette: { palette }, 'text-style': { textStyle }, typography: { typography },
    logo: { logo }, spacing: { spacing }
  }
} = dsls

Theme('wonderForPayoneer', {
  description: 'Payoneer visual language with Wonder co-branding',
  impl: theme({
    name: 'white',
    fonts: [
      font('Inter', 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap', {
        weights: '400,500,600,700,800',
        fallback: 'system-ui'
      }),
      font('Code', { fallback: 'ui-monospace,Menlo,monospace' })
    ],
    palette: palette('#ffffff', '#fafafa', {
      text: '#171717',
      textSecondary: '#555555',
      muted: '#8a8a92',
      border: '#d9d9de',
      accent: '#ff4800',
      accentText: '#b93200',
      accentSoft: '#fff3ee',
      accentBorder: '#ffc9b3',
      darkSurface: '#131417',
      onDark: '#ececf1'
    }),
    typography: typography({
      coverTitle: textStyle('Inter', 132, { weight: 800, lineHeight: 1.05, letterSpacing: '-0.035em' }),
      title: textStyle('Inter', 56, { weight: 800, lineHeight: 1.06, letterSpacing: '-0.035em' }),
      subtitle: textStyle('Inter', 24, { weight: 400, lineHeight: 1.45 }),
      body: textStyle('Inter', 20, { weight: 400, lineHeight: 1.5 }),
      eyebrow: textStyle('Code', 17, { weight: 800, lineHeight: 1.2, letterSpacing: '0.22em' }),
      code: textStyle('Code', 16, { weight: 500, lineHeight: 1.62 })
    }),
    logo: logo({ mark: 'W', wordmark: 'Wonder', placement: 'top-right', showOn: 'all' }),
    spacing: spacing(60, 84, { slideBottom: 56, slideLeft: 84, sectionGap: 26, gridGap: 36 }),
    cssClass: 'wonderForPayoneer',
    tailwindCss: `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
.wonderForPayoneer { @apply h-screen bg-white text-[#171717]; }
.wonderForPayoneer .reveal { @apply [font-family:Inter,system-ui,sans-serif]; }
.wonderForPayoneer .slideContent { @apply relative box-border h-full bg-white px-[84px] pt-[60px] pb-[56px]; }
.wonderForPayoneer .logo { @apply absolute right-[84px] top-[60px] text-[18px] font-extrabold text-[#171717]; }
.wonderForPayoneer .title { @apply mt-[80px] mb-[52px] text-[56px] leading-[1.06] font-extrabold tracking-[-0.035em] text-[#171717] normal-case; }
.wonderForPayoneer .coverSlide .title { @apply mt-[230px] max-w-[1400px] text-[132px] leading-[1.05]; }
.wonderForPayoneer .subtitle { @apply text-[24px] leading-[1.45] font-normal text-[#555555]; }
.wonderForPayoneer .columns { @apply grid grid-cols-2 gap-9; }
.wonderForPayoneer .column { @apply rounded-[18px] border border-[#d9d9de] bg-[#fafafa] p-[30px]; }
.wonderForPayoneer .columnTitle { @apply mb-[22px] text-[30px] leading-[1.2] font-bold text-[#ff4800] normal-case; }
.wonderForPayoneer .body { @apply text-[24px] leading-[1.45] font-normal text-[#555555]; }
.wonderForPayoneer .item { @apply mb-3; }
.wonderForPayoneer .controls, .wonderForPayoneer .progress { @apply text-[#ff4800]; }`
  })
})
