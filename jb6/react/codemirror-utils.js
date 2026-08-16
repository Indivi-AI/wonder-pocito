import { dsls } from '@jb6/core'
import { reactUtils } from '@jb6/react'
import './automation.js'

const CM6_IMPORT = './lib/codemirror6/codemirror6-bundle.mjs'
const CM6_STUB = '@jb6/react/tests/codemirror6-stub.mjs'

const {
    tgp: { Component },
    react : { ReactComp ,
        UiAction,
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

UiAction('clickInCodeMirror', {
  params: [{id: 'pos', as: 'number'}, {id: 'selector', as: 'string'}],
  impl: ({}, {}, {pos, selector}) => ({exec: async ctx => {
    const {win, view} = await codeMirrorView(ctx, selector)
    if (win.testing) view?.setSel(pos, pos)
    else view?.dispatch({selection: {anchor: pos}})
    ctx.vars.uiLogger?.info?.({t: 'clickInCodeMirror', pos, found: !!view}, {}, {ctx})
  }})
})

UiAction('selectInCodeMirror', {
  params: [{id: 'from', as: 'number'}, {id: 'to', as: 'number'}, {id: 'selector', as: 'string'}],
  impl: ({}, {}, {from, to, selector}) => ({exec: async ctx => {
    const {win, view} = await codeMirrorView(ctx, selector)
    if (win.testing) view?.setSel(from, to)
    else view?.dispatch({selection: {anchor: from, head: to}})
    ctx.vars.uiLogger?.info?.({t: 'selectInCodeMirror', from, to, found: !!view}, {}, {ctx})
  }})
})

UiAction('keyPressInCodeMirror', {
  params: [
    {id: 'key', as: 'string'}, {id: 'ctrl', as: 'boolean'}, {id: 'meta', as: 'boolean'},
    {id: 'shift', as: 'boolean'}, {id: 'selector', as: 'string'}
  ],
  impl: ({}, {}, {key, ctrl, meta, shift, selector}) => ({exec: async ctx => {
    const {win, view} = await codeMirrorView(ctx, selector)
    const spec = [ctrl && 'Ctrl', meta && 'Cmd', shift && 'Shift', key].filter(Boolean).join('-')
    if (win.testing) view?.keymap.find(binding => binding.key === spec)?.run(view)
    else view?.contentDOM.dispatchEvent(new win.KeyboardEvent('keydown', {
      key, ctrlKey: !!ctrl, metaKey: !!meta, shiftKey: !!shift, bubbles: true, cancelable: true
    }))
    ctx.vars.uiLogger?.info?.({t: 'keyPressInCodeMirror', key: spec, found: !!view}, {}, {ctx})
  }})
})

async function codeMirrorView(ctx, selector, timeout = 2000) {
  const {win} = ctx.vars, started = Date.now()
  const find = () => {
    const element = win.document.querySelector(selector || '.cm-editor')
    const view = reactUtils.imported(CM6_IMPORT)?.EditorView?.findFromDOM(element)
    return view && {win, view}
  }
  let found = find()
  while (!found && Date.now() - started < timeout) {
    await win.waitForMutations(20)
    found = find()
  }
  return found || {win}
}
