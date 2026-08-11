import { dsls } from '@jb6/core'

const { common: { Data } } = dsls

// The analytics-agents repo: the single list the app reads to offer agent selection.
// An agent appears only if its workflow is actually registered in the current bundle,
// so importing/removing an agent module automatically updates every selector.
Data('comaxAnalyticsAgents', {
  impl: () => [
    { id: 'basicAnalytics', label: 'SQL', hint: 'שאילתה חופשית מעל נתוני ה-ERP' },
    { id: 'comaxCubeAnalytics', label: 'קיוב', hint: 'שאילתות מעל שכבת הקיוב הסמנטית — מדדים ומגבלות מובנים' },
    { id: 'fast-report', label: 'fast-report', hint: 'דוחות מהירים: ווידג׳טים מיד, סיכום אחר כך' }
  ].filter(a => dsls.workflow.workflow[a.id])
})
