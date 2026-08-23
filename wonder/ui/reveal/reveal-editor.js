import { jb, dsls, coreUtils } from '@jb6/core'
import { reactUtils } from '@jb6/react'
import './reveal-dsl.js'
import '@jb6/react/codemirror-utils.js'
import '@jb6/core/misc/pretty-print.js'

const {
  reveal: { LiveEditor, comment: { comment } },
  react: { ReactComp, 'react-comp': { comp }, 'react-metadata': { importUrl } }
} = dsls

ReactComp('revealDeckSourceDialog', {
  impl: comp({
    hFunc: (ctx, { react: { h, useEffect, useRef, useState } }) => ({ code, jbid, onClose, onSave, title }) => {
      const cm = reactUtils.imported('./lib/codemirror6/codemirror6-bundle.mjs')
      const host = useRef(), view = useRef(), [position, setPosition] = useState(), [status, setStatus] = useState()
      const save = async () => {
        setStatus({ kind: 'saving', text: 'Saving…' })
        try {
          const result = await onSave(view.current.state.doc.toString())
          view.current.dispatch({ changes: { from: 0, to: view.current.state.doc.length, insert: result.code } })
          setStatus({ kind: 'success', text: result.text })
        } catch (error) {
          setStatus({ kind: 'error', text: error.message || String(error) })
        }
      }
      useEffect(() => {
        view.current = new cm.EditorView({ parent: host.current, state: cm.EditorState.create({ doc: code, extensions: [
          cm.lineNumbers(), cm.javascript(), cm.oneDark, cm.EditorView.lineWrapping,
          cm.keymap.of([{ key: 'Ctrl-s', preventDefault: true, run: () => (save(), true) }]),
          cm.EditorView.theme({ '&': { height: '100%', fontSize: '13px' }, '.cm-scroller': { overflow: 'auto' } }, { dark: true })
        ] }) })
        return () => view.current?.destroy()
      }, [])
      const drag = event => {
        let last
        const box = event.currentTarget.parentElement.getBoundingClientRect(), dx = event.clientX - box.left, dy = event.clientY - box.top
        const move = event => setPosition(last = { x: event.clientX - dx, y: event.clientY - dy })
        const stop = () => {
          window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop)
          ctx.vars.revealLogger?.info?.({ t: 'reveal.sourceDialogMoved', ...last }, {}, { ctx })
        }
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop)
      }
      return h('div:reveal-source-dialog', { jbid,
        style: position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto', transform: 'none' } : {} },
        h('header', { onPointerDown: drag }, h('b', {}, title), h('span', {}, 'Ctrl+S to save'),
          h('button', { onPointerDown: event => event.stopPropagation(), onClick: onClose }, '×')),
        h('div:reveal-source-editor', { ref: host }),
        h('footer', {}, status && h(`span:reveal-source-status ${status.kind}`, {}, status.text),
          h('button', { onClick: onClose }, 'Cancel'), h('button:primary', { onClick: save }, 'Save source')))
    },
    metadata: importUrl('./lib/codemirror6/codemirror6-bundle.mjs', {
      stubUrl: '@jb6/react/tests/codemirror6-stub.mjs'
    })
  })
})
const liveEditor = LiveEditor('liveEditor', {
  moreTypes: 'deck-feature<reveal>',
  params: [
    {id: 'textEditing', as: 'boolean', defaultValue: true, type: 'boolean<common>'},
    {id: 'comments', as: 'boolean', defaultValue: true, type: 'boolean<common>'},
    {id: 'author', as: 'string', defaultValue: '%$userId%'},
    {id: 'slideSamplesPrefix', as: 'string', defaultValue: 'slideSample.'},
    {id: 'addSlideLabel', as: 'string', defaultValue: 'Add slide'}
  ],
  impl: ({}, {}, editor) => {
    const sourceLocations = new Map()
    let savedTimer, selectedItem, showSaved = () => {}
    const parsedComp = async (compText, filePath) => {
      const { calcProfileActionMap } = (await import('@jb6/lang-service/src/lang-service-parsing-utils.js')).langServiceUtils
      return calcProfileActionMap(compText, { tgpModel: jb, filePath }).comp
    }
    const compSource = async tgpPath => {
      const compId = tgpPath.split('~')[0], comp = coreUtils.compByFullId(compId)
      const sourceLocation = comp?.$location || sourceLocations.get(compId)
      comp?.$location && sourceLocations.set(compId, comp.$location)
      const filePath = sourceLocation.path, source = await fetch(filePath).then(res => res.text())
      const { closestComp, offsetToLineCol } = (await import('@jb6/lang-service/src/lang-service-parsing-utils.js')).langServiceUtils
      const found = closestComp(source, Math.max(0, (+sourceLocation.line || 1) - 1), 0, filePath)
      const end = offsetToLineCol(found.compText, found.compText.length)
      return { comp, compId, filePath, ...found, range: { start: found.compPos,
        end: { line: found.compPos.line + end.line, col: end.line ? end.col : found.compPos.col + end.col } } }
    }
    const sourceEdit = async (tgpPath, append, replacement) => {
      const { comp: sourceComp, filePath, compText, compPos } = await compSource(tgpPath)
      const { calcProfileActionMap, offsetToLineCol } =
        (await import('@jb6/lang-service/src/lang-service-parsing-utils.js')).langServiceUtils
      const parsedComp = calcProfileActionMap(compText, { tgpModel: jb, filePath }).comp
      const parts = tgpPath.split('~').slice(1), key = parts.pop(), parent = parts.reduce((obj, part) => obj?.[part], parsedComp)
      const ast = parent?.[coreUtils.primitivesAst]?.[key] || parent?.[key]?.[coreUtils.astNode]
      const from = append ? ast.end - 1 : ast.start, to = ast.end, expectedText = compText.slice(from, to)
      const newText = typeof replacement == 'function' ? replacement(expectedText) : replacement
      const candidate = `${compText.slice(0, from)}${newText}${compText.slice(to)}`
      const absolute = pos => ({ line: compPos.line + pos.line, col: pos.line ? pos.col : compPos.col + pos.col })
      const response = await fetch('/editSource', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          filePath, range: { start: absolute(offsetToLineCol(compText, from)), end: absolute(offsetToLineCol(compText, to)) },
          newText, expectedText, validateTgpComp: candidate
        })
      })
      if (!response.ok) throw new Error(await response.text())
      return parsedComp(candidate, filePath)
    }
    const visit = ctx => ({ vdom, tgpPath, slidePath, slide, editMode, refresh }) => {
      if (!editMode || !ctx.vars.react.isValidElement(vdom)) return vdom
      vdom = ctx.vars.react.cloneElement(vdom, { 'data-reveal-tgp-path': tgpPath })
      const originalText = vdom.props.children
      const paramId = tgpPath.slice(slidePath.length + 1)
      const comments = coreUtils.asArray(slide.comments).filter(comment => comment.paramId == paramId)
      const save = async event => {
        const value = event.currentTarget.textContent
        if (value == originalText) return
        const sourceComp = await sourceEdit(tgpPath, false, JSON.stringify(value))
        const parts = tgpPath.split('~'), key = parts.pop(), parent = parts.slice(1).reduce((obj, part) => obj?.[part], sourceComp)
        if (parent) parent[key] = value
        const compId = tgpPath.split('~')[0], filePath = sourceLocations.get(compId).path
        ctx.vars.revealLogger?.info?.({ t: 'reveal.textSaved', tgpPath, filePath }, {}, { ctx })
        clearTimeout(savedTimer); showSaved({ tgpPath: tgpPath.split('>').pop(), filePath }); savedTimer = setTimeout(() => showSaved(null), 3000)
      }
      const previousKeyDown = vdom.props.onKeyDown
      return ctx.vars.react.cloneElement(vdom, {
        contentEditable: false,
        suppressContentEditableWarning: true,
        title: comments.map(comment => `${comment.author} · ${comment.timestamp}\n${comment.commentText}`).join('\n\n'),
        ...(selectedItem?.tgpPath == tgpPath ? { 'data-reveal-selected': true } : {}),
        ...(comments.length ? { 'data-reveal-comments': comments.length } : {}),
        onClick: async event => {
          vdom.props.onClick?.(event)
          selectedItem = { tgpPath, slidePath, paramId, slide, element: event.currentTarget }; refresh()
          ctx.vars.revealLogger?.info?.({ t: 'reveal.itemSelected', tgpPath, slidePath, paramId }, {}, { ctx })
          if (editor.textEditing) event.preventDefault(), event.currentTarget.contentEditable = 'true', event.currentTarget.focus()
        },
        onBlur: async event => { const el = event.currentTarget; await save(event); el.contentEditable = 'false' },
        onKeyDown: event => {
          previousKeyDown?.(event)
          if (event.isComposing || event.key != 'Enter' || event.shiftKey) return
          event.preventDefault()
          event.currentTarget.blur()
        }
      })
    }
    const hFunc = ctx => ({ slides, editMode, setEditMode, refresh }) => {
      const { createElement, h, useState } = ctx.vars.react, [open, setOpen] = useState(false), [source, setSource] = useState()
      const templates = coreUtils.globalsOfTypeIds(dsls.reveal.slide, 'profiles')
        .filter(id => id.startsWith(editor.slideSamplesPrefix))
        .map(id => ({ label: id.slice(editor.slideSamplesPrefix.length), profile: dsls.reveal.slide[id][coreUtils.asJbComp].impl }))
      const addTemplate = async template => {
        const profile = coreUtils.tgpProfileToJson(template.profile), slidesPath = slides.lexicalCtx.jbCtx.path
        coreUtils.restoreProfile$(profile)
        await sourceEdit(slidesPath, true, tail =>
          `${slides.profile.length ? ', ' : ''}${coreUtils.prettyPrint(profile, { tgpModel: jb })}${tail}`)
        slides.profile.push(profile); setOpen(false); refresh()
        ctx.vars.revealLogger?.info?.({ t: 'reveal.templateSlideAdded', slidesPath, template: template.label,
          slideType: coreUtils.compIdOfProfile(profile), slideCount: slides.profile.length }, {}, { ctx })
      }
      const toggleTemplates = () => setOpen(value => {
        ctx.vars.revealLogger?.info?.({ t: 'reveal.templatePickerChanged', open: !value,
          templates: templates.map(template => template.label) }, {}, { ctx })
        return !value
      })
      const openSource = async () => setSource(await compSource(slides.lexicalCtx.jbCtx.path))
      const saveSource = async newText => {
        const response = await fetch('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: 'safeEditTgpComp', arguments: {
            compText: newText, fullCompId: source.compId, existingCompText: source.compText
          } }
        }) }), mcpResult = await response.json(), result = JSON.parse(mcpResult.result?.content?.[0]?.text || '{}')
        if (!response.ok || mcpResult.error || result.error) throw new Error(result.error || mcpResult.error?.message || response.statusText)
        const savedComp = await parsedComp(result.formattedTgpComp, source.filePath)
        const restoreFullIds = profile => profile && typeof profile == 'object' &&
          (profile.$$ && typeof profile.$ == 'string' && (profile.$ = profile.$$), Object.values(profile).forEach(restoreFullIds))
        restoreFullIds(savedComp.impl); coreUtils.restoreProfile$(savedComp.impl)
        const registeredComp = dsls[savedComp.dsl][coreUtils.toCapitalType(savedComp.type)](savedComp.id, savedComp)
        const recalculatedDeck = registeredComp.$runWithCtx(ctx)
        slides.profile.splice(0, slides.profile.length, ...recalculatedDeck.slides.profile)
        source.compText = result.formattedTgpComp; refresh(true)
        ctx.vars.revealLogger?.info?.({ t: 'reveal.deckSourceSaved', compId: source.compId, filePath: source.filePath }, {}, { ctx })
        return { text: `Saved ${source.compId}`, code: result.formattedTgpComp }
      }
      const sourceDialog = dsls.react['react-comp'].revealDeckSourceDialog.$runWithCtx(ctx)
      if (!editMode) return h('button:reveal-enter-edit', { onClick: () => setEditMode(true), title: 'Edit' },
        h('L:pencil', { size: 16 }), h('span', {}, 'Edit'))
      return h('div:reveal-editor-bar', {},
        h('button', { onClick: () => setEditMode(false), title: 'Present' },
          h('L:presentation', { size: 17 }), h('span:reveal-action-label', {}, 'Present')),
        h('button:reveal-edit-source', { onClick: openSource }, 'Edit source'),
        h('button', { onClick: toggleTemplates, title: editor.addSlideLabel },
          h('L:square-plus', { size: 17 }), h('span:reveal-action-label', {}, editor.addSlideLabel)),
        open && h('div:reveal-template-menu', {},
          ...templates.map(template => h('button', { onClick: () => addTemplate(template) }, template.label))),
        source && createElement(sourceDialog, { code: source.compText, jbid: sourceDialog.jbid, onClose: () => setSource(), onSave: saveSource,
          title: source.compId }))
    }
    const statusHFunc = ctx => ({ editMode }) => {
      const { h, useState } = ctx.vars.react, [saved, setSaved] = useState()
      showSaved = setSaved
      return editMode && saved && h('div:reveal-save-indication', {}, h('span:reveal-save-dot'),
        h('span', {}, `saved to ${saved.tgpPath} → ${saved.filePath}`))
    }
    const commentsHFunc = ctx => ({ slides, editMode, refresh }) => {
      const { h, useEffect, useRef, useState } = ctx.vars.react, [adding, setAdding] = useState(false), input = useRef()
      useEffect(() => {
        if (adding) input.current?.focus()
      }, [adding])
      const comments = coreUtils.asArray(slides.profile).flatMap((_, index) => {
        const slide = ctx.runInnerArg(slides, index)
        const slidePath = `${slides.lexicalCtx.jbCtx.path}~${index}`
        return coreUtils.asArray(slide.comments)
          .map((comment, commentIndex) => ({ ...comment, source: comment, slideTitle: slide.title, slidePath, commentIndex }))
      }).filter(comment => selectedItem && comment.slidePath == selectedItem.slidePath && comment.paramId == selectedItem.paramId)
      const save = async (comment, commentText) => {
        if (!commentText || commentText == comment.commentText) return
        await sourceEdit(`${comment.slidePath}~comments~${comment.commentIndex}~commentText`, false, JSON.stringify(commentText))
        comment.source.commentText = commentText; refresh()
        ctx.vars.revealLogger?.info?.({ t: 'reveal.commentSaved', tgpPath: comment.slidePath, commentText }, {}, { ctx })
      }
      const add = async commentText => {
        setAdding(false)
        if (!commentText || !selectedItem) return
        const { slide, slidePath, paramId } = selectedItem, timestamp = new Date().toISOString()
        const profile = coreUtils.tgpProfileToJson(comment(paramId, commentText, editor.author, timestamp))
        coreUtils.restoreProfile$(profile)
        await sourceEdit(`${slidePath}~comments`, true, tail =>
          `${slide.comments.length ? ', ' : ''}${coreUtils.prettyPrint(profile, { tgpModel: jb })}${tail}`)
        refresh()
        ctx.vars.revealLogger?.info?.({ t: 'reveal.commentAdded', slidePath, paramId, commentText,
          author: editor.author, timestamp }, {}, { ctx })
      }
      const editable = (comment, onSave) => {
        const save = async event => {
          const element = event.currentTarget
          element.contentEditable = 'false'
          await onSave(element.textContent)
        }
        return {
          contentEditable: false,
          suppressContentEditableWarning: true,
          onClick: event => {
            if (comment.author == editor.author) {
              event.currentTarget.contentEditable = 'true'; event.currentTarget.focus()
            }
          },
          onBlur: save,
          onKeyDown: async event => {
            if (event.isComposing || event.key != 'Enter' || event.shiftKey) return
            event.preventDefault()
            await save(event)
          }
        }
      }
      return editMode && editor.comments && h('aside:reveal-comments-panel', { className: comments.length ? '' : 'empty' },
        comments.length > 0 && h('header', {}, h('span', {}, `Comments · ${comments.length}`)),
        adding && h('article:new-comment', {}, h('small', {}, 'New comment'),
          h('small', {}, `${selectedItem.slide.title} · ${selectedItem.paramId}`),
          h('p', { ...editable({ author: editor.author }, add), contentEditable: true, ref: input })),
        ...comments.map(comment => h('article', {}, h('div', {}, h('b', {}, comment.author), h('time', {}, comment.timestamp)),
          h('small', {}, `${comment.slideTitle} · ${comment.paramId}`),
          h('p', editable(comment, text => save(comment, text)), comment.commentText))),
        h('button:reveal-add-comment', { 'data-action': 'add-comment', 'aria-disabled': !selectedItem,
          title: selectedItem ? 'Add comment' : 'Select an item first', onClick: () => selectedItem && setAdding(true) },
          h('L:message-square-plus', { size: 16 }),
          h('span:reveal-action-label', {}, selectedItem ? 'Add comment' : 'Select an item first')))
    }
    return {
      injections: [
        { injectArea: 'topRight', hFunc },
        { injectArea: 'bottomLeft', hFunc: statusHFunc },
        { injectArea: 'bottomRight', hFunc: commentsHFunc }
      ],
      visitors: [{ revealType: 'editable-text<reveal>', visit }],
      reactMetadata: []
    }
  }
})
