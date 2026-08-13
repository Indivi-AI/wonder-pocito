import { dsls } from '@jb6/core'
import { reactUtils } from '@jb6/react'

const CM6_IMPORT = './lib/codemirror6/codemirror6-bundle.mjs'
const CM6_STUB = '@jb6/react/tests/codemirror6-stub.mjs'

const {
    tgp: { Component },
    react : { ReactComp ,
        'react-comp': { comp },
        'react-metadata': { importUrl }
    }
} = dsls

// reusable metadata: real cm6 bundle, or the minimal stub under win.testing
const importCodeMirror = Component('importCodeMirror', {
  type: 'react-metadata<react>',
  impl: importUrl(CM6_IMPORT, { stubUrl: CM6_STUB })
})

ReactComp('CodeMirrorJs', {
  impl: comp({
    hFunc: (ctx, {react: {h, useRef, useEffect}}) => ({ code, onCursorActivity }) => {
        const { EditorState, EditorView, javascript, lineNumbers, syntaxHighlighting, defaultHighlightStyle, keymap, search, openSearchPanel } = reactUtils.imported(CM6_IMPORT)
        const host = useRef()
        const viewRef = useRef()

        useEffect(() => {
          if (!host.current || viewRef.current) return
          viewRef.current = new EditorView({
            parent: host.current,
            state: EditorState.create({
              doc: code || '',
              extensions: [
                lineNumbers(), syntaxHighlighting(defaultHighlightStyle), javascript(), search(),
                keymap.of([
                  { key: 'Ctrl-f', run: openSearchPanel },
                  { key: 'Ctrl-a', run: view => (view.dispatch({ selection: { anchor: 0, head: view.state.doc.toString().length } }), true) }
                ]),
                EditorState.readOnly.of(true),
                EditorView.theme({ '&': { height: '100%', fontSize: '12px' }, '.cm-scroller': { overflow: 'auto' }, '.cm-content': { fontFamily: 'monospace' } }),
                ...(onCursorActivity ? [EditorView.updateListener.of(update => {
                  if (update.selectionSet) onCursorActivity(update.view)
                })] : [])
              ]
            })
          })
          return () => { viewRef.current?.destroy(); viewRef.current = null }
        }, [])

        useEffect(() => {
          if (!viewRef.current) return
          const current = viewRef.current.state.doc.toString()
          if (current !== (code || ''))
            viewRef.current.dispatch({ changes: { from: 0, to: current.length, insert: code || '' } })
        }, [code])

        return h('div:h-full', { ref: host })
      },
    metadata: importCodeMirror()
  })
})
