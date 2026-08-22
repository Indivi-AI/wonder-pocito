import { dsls } from '@jb6/core'

const { common: { Data } } = dsls

// The analytics-agents repo: the single list the app reads to offer agent selection.
// An agent appears only if its workflow is actually registered in the current bundle,
// so importing/removing an agent module automatically updates every selector.
Data('comaxAnalyticsAgents', {
  impl: () => [
    { id: 'comaxVerifiedReports', label: 'דוחות מאומתים', hint: 'בחירת דוח מוגדר ומאומת מראש' }
  ].filter(a => dsls.ai.workflow[a.id])
})
