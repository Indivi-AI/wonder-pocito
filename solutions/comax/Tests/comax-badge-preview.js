import { dsls } from '@jb6/core'
import '../App/comaxApp.js'

const { react: { ReactComp, 'react-comp': { comp, AnalyticsAssistantResponse } } } = dsls
const answer = {
  sender: 'Assistant', type: 'text', content: '## מכירות לפי סניף\n\nסניף תל אביב מוביל עם **18,400 ₪**.',
  narrative: 'סניף תל אביב מוביל בפער ברור, אבל ירושלים קרובה במדד ההזמנות.',
  rows: [{ branch: 'תל אביב', sales: 18400 }, { branch: 'ירושלים', sales: 14200 }],
  widgets: [{ kind: 'table', title: 'סניפים — יום אחרון מול שבוע שעבר', columns: [
    { key: 'branch', label: 'סניף' }, { key: 'last', label: 'נטו יום אחרון', format: '₪' }, { key: 'prev', label: 'אותו יום שבוע שעבר', format: '₪' }, { key: 'change', label: 'שינוי', format: '%' }
  ], rows: [
    { branch: 'סה"כ רשת', last: 556000, prev: 591000, change: -5.8 },
    { branch: 'אם המושבות פ"ת', last: 244000, prev: 260000, change: -6.2 },
    { branch: 'גני תקווה', last: 225000, prev: 234000, change: -3.7 },
    { branch: 'רמת השרון', last: 87000, prev: 97000, change: -10 }
  ] }],
  reportsUsed: [{ reportId: 'sales-overview', sections: ['sales-by-branch'], depth: 'summary' }]
}

ReactComp('ComaxBadgePreview', { impl: comp({ hFunc: (ctx, { react: { h, hh } }) => () =>
  h('div:bg-[#F6F7F8] min-h-screen py-6 space-y-4', { dir: 'rtl' },
    hh(ctx, AnalyticsAssistantResponse, { element: answer }),
    hh(ctx, AnalyticsAssistantResponse, { element: { ...answer, reportsUsed: [] } })) }) })
