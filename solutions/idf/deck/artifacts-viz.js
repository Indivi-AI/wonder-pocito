import { jb, dsls, coreUtils } from '@jb6/core'
import '@jb6/react'
import '@jb6/core/misc/pretty-print.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('idfArtifactsViz', {
  impl: comp({
    hFunc: (ctx, { react: { h, useMemo, useState } }) => () => {
      const deckComp = useMemo(() => coreUtils.compByFullId('deck<deck>idfDeck'), [])
      const [printed, setPrinted] = useState(() => coreUtils.prettyPrintWithPositions(deckComp, { tgpModel: jb }))
      const editProfile = e => {
        const source = e.target.value, oldSource = printed.text
        let from = 0, suffix = 0
        while (oldSource[from] == source[from] && from < oldSource.length && from < source.length) from++
        while (oldSource.at(-suffix - 1) == source.at(-suffix - 1) && suffix < oldSource.length - from && suffix < source.length - from) suffix++
        const to = oldSource.length - suffix, inserted = source.slice(from, source.length - suffix), offset = printed.startOffset
        const isText = x => /~(title|subtitle|note|text)$/.test(x.action)
        const textAction = printed.actionMap.find(x => isText(x) && x.action.startsWith('insideText!~impl~slides~') && x.from - offset - 1 <= from && to <= x.to - offset - 1)
          || printed.actionMap.find(x => isText(x) && from == to && x.from - offset == from && x.action.startsWith('edit!~impl~slides~'))
        if (!textAction) return e.target.value = oldSource
        const path = textAction.action.split('!~')[1].split('~'), key = path.pop(), parent = path.reduce((o, p) => o?.[p], deckComp)
        const textFrom = textAction.from - offset - Number(textAction.action.startsWith('insideText'))
        parent[key] = parent[key].slice(0, from - textFrom) + inserted + parent[key].slice(to - textFrom)
        setPrinted(coreUtils.prettyPrintWithPositions(deckComp, { tgpModel: jb }))
        window.dispatchEvent(new Event('deckProfileChanged'))
      }
      return h('div:iv', {}, h('div:iv-title', {}, 'Artifacts'), h('div:iv-sub', {}, 'Edit slide text in its TGP profile'),
        h('div:win', {}, h('div:chrome', {}, h('i'), h('i'), h('i'), 'admin/idf/idf-deck.js'),
          h('textarea:code-pane', { value: printed.text, onChange: editProfile, spellCheck: false, 'aria-label': 'Deck profile editor' })))
    }
  })
})
