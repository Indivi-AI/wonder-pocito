import { dsls, coreUtils, jb } from '@jb6/core'

const {
  react: { ReactComp,
    'react-comp': { comp },
    'react-metadata': { importUrl }
  }
} = dsls

// ============ CodeMirror 6 Collapsible JSON Viewer ============

const CM6_IMPORT = '@jb6/react/lib/codemirror6/codemirror6-bundle.mjs'
const MAX_VISIBLE_CHARS = 50000

export const codeMirrorJsonCollapsible = ReactComp('codeMirrorJsonCollapsible', {
  impl: comp({
    hFunc: ({}, {react: {h, useRef, useEffect, useState}}) => ({json}) => {
      if (coreUtils.isNode)
        return h('textarea:h-full w-full font-mono text-xs p-2 border rounded bg-gray-50', {
          readOnly: true,
          value: coreUtils.prettyPrint(json, {noMacros: true})
        })

      const cm6 = jb.reactRepository.importCache[CM6_IMPORT]
      const host = useRef()
      const viewRef = useRef()

      useEffect(() => {
        if (!host.current || viewRef.current) return

        const { EditorState, StateEffect, StateField, EditorView, Decoration, WidgetType, javascript, lineNumbers, syntaxHighlighting, defaultHighlightStyle } = cm6

        const text = coreUtils.prettyPrint(json, {noMacros: true})
        const needsCollapse = text.length > MAX_VISIBLE_CHARS

        // Effect to expand content
        const expandEffect = StateEffect.define()

        // Widget for "Show more" button
        class ShowMoreWidget extends WidgetType {
          constructor(hiddenCount) {
            super()
            this.hiddenCount = hiddenCount
          }
          toDOM(view) {
            const btn = document.createElement('button')
            btn.className = 'cm-show-more'
            btn.textContent = `▶ Show ${this.hiddenCount.toLocaleString()} more chars`
            btn.style.cssText = 'background:#e3f2fd;border:1px solid #90caf9;border-radius:3px;padding:2px 8px;margin:2px;cursor:pointer;font-size:11px;color:#1976d2;'
            btn.onclick = () => view.dispatch({ effects: expandEffect.of(null) })
            return btn
          }
        }

        // StateField to manage collapsed state
        const collapsedField = StateField.define({
          create: (state) => {
            if (!needsCollapse) return Decoration.none
            const hiddenCount = state.doc.length - MAX_VISIBLE_CHARS
            return Decoration.set([
              Decoration.replace({ widget: new ShowMoreWidget(hiddenCount) })
                .range(MAX_VISIBLE_CHARS, state.doc.length)
            ])
          },
          update: (decorations, tr) => {
            // If expand effect received, remove decorations
            if (tr.effects.some(e => e.is(expandEffect)))
              return Decoration.none
            return decorations.map(tr.changes)
          },
          provide: f => EditorView.decorations.from(f)
        })

        // Create editor
        const state = EditorState.create({
          doc: text,
          extensions: [
            lineNumbers(),
            syntaxHighlighting(defaultHighlightStyle),
            javascript(),
            collapsedField,
            EditorState.readOnly.of(true),
            EditorView.theme({
              '&': { height: '100%', fontSize: '12px' },
              '.cm-scroller': { overflow: 'auto' },
              '.cm-content': { fontFamily: 'monospace' }
            })
          ]
        })

        viewRef.current = new EditorView({ state, parent: host.current })

        return () => {
          viewRef.current?.destroy()
          viewRef.current = null
        }
      }, [cm6])

      // Update content when json changes
      useEffect(() => {
        if (!viewRef.current) return
        const { EditorState } = cm6
        const text = coreUtils.prettyPrint(json, {noMacros: true})

        // Recreate state with new content (simpler than transactions for now)
        const newState = EditorState.create({
          doc: text,
          extensions: viewRef.current.state.facet(EditorState.facet) // reuse extensions
        })
        viewRef.current.setState(newState)
      }, [json])

      return h('div:h-full w-full overflow-hidden', { ref: host })
    },
    metadata: importUrl(CM6_IMPORT)
  })
})
