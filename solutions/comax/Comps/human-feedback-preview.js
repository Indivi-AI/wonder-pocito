import { dsls } from '@jb6/core'
import '../App/comaxApp.js'

const {
  react: { ReactComp, 'react-comp': { comp, HumanFeedbackMessage } }
} = dsls

const feedbackOptions = [
  { id: 886, label: 'עגבניות שרי תמר ישראל', summary: 'מלאי ‎-65,329.3 · מכירות שבועיות 2,337.4 · מחיר 12.9' },
  { id: 19406, label: 'עגבניות שרי מנומר ישראל', summary: 'מלאי 3,697.3 · מכירות שבועיות 223.8 · מחיר 19.9' },
  { id: 23943, label: 'עגבניות שרי צהוב ישראל', summary: 'מלאי 821.2 · מכירות שבועיות 96 · מחיר 19.9' }
]

ReactComp('HumanFeedbackMessageTestHarness', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh, useState } }) => () => {
      const [ids, setIds] = useState([])
      return h('div', {}, h('div', {}, `resolved:${ids.join(',')}`),
        hh(ctx, HumanFeedbackMessage, { element: { question: 'לאיזה מוצר התכוונת?', varName: 'selectedProducts', mode: 'multi', options: feedbackOptions, selectedIds: ids, resolved: ids.length > 0 }, resolve: setIds }))
    }
  })
})

ReactComp('HumanFeedbackAutoResolvedHarness', {
  impl: comp({
    hFunc: (ctx, { react: { hh } }) => () =>
      hh(ctx, HumanFeedbackMessage, { element: { question: 'לאיזה סניף התכוונת?', varName: 'selectedBranches', mode: 'single', options: [{ id: 12, label: 'גני תקווה' }], selectedIds: [12], resolved: true, autoResolved: true } })
  })
})
