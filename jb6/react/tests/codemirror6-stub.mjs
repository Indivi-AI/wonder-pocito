// Minimal cm6 stand-in for react tests. Same export surface CodeMirrorJs destructures,
// but no layout: selection is pure {from,to,head} offsets. Only selection, click and
// key-shortcut are meaningful. The UiActions clickInCodeMirror/selectInCodeMirror/
// keyPressInCodeMirror drive it via EditorView.findFromDOM(el)._cmView.
const win = globalThis.window

export const EditorState = {
  readOnly: { of: () => ({}) },
  create: ({ doc, extensions }) => ({
    doc: { toString: () => doc || '' },
    selection: { main: { from: 0, to: 0, head: 0 } },
    extensions: extensions.flat()
  })
}

export const keymap = { of: binds => ({ cm6: 'keymap', binds }) }

export class EditorView {
  constructor({ parent, state }) {
    this.state = state
    // only the component's own keymap binds - no faked defaults, so the stub reflects exactly what CodeMirrorJs declares
    this.keymap = state.extensions.filter(e => e?.cm6 === 'keymap').flatMap(e => e.binds)
    this.listeners = state.extensions.filter(e => e?.cm6 === 'updateListener').map(e => e.fn)
    this.dom = win.document.createElement('div')
    this.dom.className = 'cm-editor'
    this.dom.textContent = state.doc.toString()
    this.dom._cmView = this
    parent.appendChild(this.dom)
  }
  dispatch(tr) {
    if (tr.selection) {
      const { anchor, head = anchor } = tr.selection
      this.setSel(anchor, head)
    }
  }
  setSel(from, to) {
    this.state.selection.main = { from, to, head: to }
    this.listeners.forEach(fn => fn({ selectionSet: true, view: this }))
  }
}
EditorView.updateListener = { of: fn => ({ cm6: 'updateListener', fn }) }
EditorView.theme = () => ({})
EditorView.findFromDOM = el => el?._cmView

// inert - only destructured/called by CodeMirrorJs, never asserted by the tests
export const openSearchPanel = () => {}
export const lineNumbers = () => ({})
export const javascript = () => ({})
export const search = () => ({})
export const syntaxHighlighting = () => ({})
export const defaultHighlightStyle = {}
