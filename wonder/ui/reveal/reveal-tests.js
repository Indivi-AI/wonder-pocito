import { coreUtils, dsls, ns } from '@jb6/core'
import '@jb6/common'
import '@jb6/testing'
import '@jb6/react/tests/react-testers.js'
import '@wonder/ui/applet.js'
import './reveal-dsl.js'
import './reveal-editor.js'

const { json } = ns
const {
  tgp: { Const },
  reveal: {
    Deck, Slide,
    deck: { deck },
    comment: { comment },
    slide: { coverSlide, titleSlide, columnsSlide }, column: { column }, 'column-item': { item },
    theme: { theme }, controls: { controls },
    'live-editor': { liveEditor }
  },
  react: { ReactComp, UiAction, 'react-comp': { comp, deckViewer }, 'react-metadata': { applet },
    'ui-action': { actions, click, waitForText } },
  common: { boolean: { and, contains } },
  test: { Test, test: { reactTest } }
} = dsls

Const('revealSampleTitlePath', 'deck<reveal>revealSample.deck~impl~slides~0~title')
Const('revealCommentTargetPath', 'deck<reveal>revealSample.deck~impl~slides~0~subtitle')
Const('revealEditedTitle', 'Edited title')
Const('revealCommentText', 'Clarify this title')

Slide('slideSample.columns', {
  description: 'Reusable two-column Reveal comparison slide',
  impl: columnsSlide('New comparison', [
    column('First', item('First point')),
    column('Second', item('Second point'))
  ], {
    comments: []
  })
})

const revealNavigate = UiAction('revealNavigate', {
  params: [
    {id: 'direction', as: 'string', options: 'left,right,up,down', defaultValue: 'right'}
  ],
  impl: ({}, {}, { direction }) => ({ exec: async ({ vars: { win } }) => {
    win.document.querySelector(`.navigate-${direction}`)?.dispatchEvent(new win.MouseEvent('click', { bubbles: true }))
    await coreUtils.delay(200)
  } })
})

const inPlaceEdit = UiAction('inPlaceEdit', {
  params: [
    {id: 'tgpPath', as: 'string'},
    {id: 'text', as: 'string'},
    {id: 'restore', as: 'boolean', defaultValue: true, type: 'boolean<common>'}
  ],
  impl: ({}, {}, { tgpPath, text, restore }) => ({ exec: async ({ vars: { win, revealLogger } }) => {
    const filePath = coreUtils.compByFullId(tgpPath.split('~')[0]).$location.path
    const beforeSource = restore && await fetch(filePath).then(res => res.text())
    const find = () => [...win.document.querySelectorAll('[data-reveal-tgp-path]')].find(el => el.dataset.revealTgpPath == tgpPath)
    const edit = async value => {
      const el = find()
      const saves = revealLogger.revealLog.filter(event => event.t == 'reveal.textSaved').length
      el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }))
      el.focus()
      el.textContent = value
      el.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
      el.blur()
      for (let i = 0; i < 40 && revealLogger.revealLog.filter(event => event.t == 'reveal.textSaved').length == saves; i++)
        await coreUtils.delay(50)
    }
    for (let i = 0; i < 80 && !find(); i++) await coreUtils.delay(50)
    const original = find().textContent
    const before = revealLogger.revealLog.length
    await edit(text)
    if (restore) {
      const afterSource = await fetch(filePath).then(res => res.text())
      const { range, newText } = (await import('@jb6/lang-service/src/lang-service-parsing-utils.js')).langServiceUtils
        .deltaFileContent(afterSource, beforeSource, { line: 0, col: 0 })
      await fetch('/editSource', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, range, newText }) })
    }
    if (revealLogger.revealLog.slice(before).filter(event => event.t == 'reveal.textSaved').length != 1)
      throw new Error(`inPlaceEdit did not save ${tgpPath}`)
  } })
})

const addRevealComment = UiAction('addRevealComment', {
  params: [
    {id: 'tgpPath', as: 'string'},
    {id: 'text', as: 'string'}
  ],
  impl: ({}, {}, { tgpPath, text }) => ({ exec: async ({ vars: { win, revealLogger } }) => {
    const el = [...win.document.querySelectorAll('[data-reveal-tgp-path]')].find(el => el.dataset.revealTgpPath == tgpPath)
    const filePath = '/wonder/ui/reveal/reveal-tests.js', before = await fetch(filePath).then(res => res.text())
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }))
    win.document.querySelector('button[data-action="add-comment"]').click()
    for (let i = 0; i < 20 && !win.document.querySelector('.new-comment p'); i++) await coreUtils.delay(20)
    const input = win.document.querySelector('.new-comment p')
    input.focus()
    input.textContent = text
    input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    for (let i = 0; i < 40 && !revealLogger.revealLog.some(event => event.t == 'reveal.commentAdded'); i++) await coreUtils.delay(50)
    if (!revealLogger.revealLog.some(event => event.t == 'reveal.commentAdded' && event.commentText == text))
      throw new Error(`addRevealComment did not add ${tgpPath}`)
    const after = await fetch(filePath).then(res => res.text())
    const { range, newText } = (await import('@jb6/lang-service/src/lang-service-parsing-utils.js')).langServiceUtils
      .deltaFileContent(after, before, { line: 0, col: 0 })
    await fetch('/editSource', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, range, newText }) })
  } })
})

const dragRevealSourceDialog = UiAction('dragRevealSourceDialog', {
  impl: ({}, {}, {}) => ({ exec: async ({ vars: { win } }) => {
    const header = win.document.querySelector('.reveal-source-dialog header'), box = header.parentElement.getBoundingClientRect()
    header.dispatchEvent(new win.MouseEvent('pointerdown', { bubbles: true, clientX: box.left + 20, clientY: box.top + 20 }))
    win.dispatchEvent(new win.MouseEvent('pointermove', { bubbles: true, clientX: box.left + 140, clientY: box.top + 100 }))
    win.dispatchEvent(new win.MouseEvent('pointerup', { bubbles: true })); await coreUtils.delay(50)
  } })
})

ReactComp('deckShell.revealSample', {
  impl: comp({
    hFunc: ({}, { react: { h } }) => ({ children }) => h('main:reveal-sample', {},
    h('style', {}, `.reveal-sample{height:100vh;background:#f8fafc}.reveal-sample>.reveal{height:100%}
      .reveal-sample .slides{text-align:left}.sample-slide{height:100%;padding:80px;background:linear-gradient(135deg,#fff,#e0f2fe)}
      .sample-slide h1,.sample-slide h2{color:#0f172a;text-transform:none}.sample-slide p,.sample-slide li{color:#334155}`), children)
  })
})

ReactComp('coverSlide.revealSample', {
  impl: comp({
    hFunc: ({}, { react: { h } }) => ({ slide, tgpPath, visitVdom }) => h('div:sample-slide', {},
    visitVdom({ vdom: h('h1', {}, slide.title), revealType: 'editable-text<reveal>', tgpPath: `${tgpPath}~title` }),
    visitVdom({ vdom: h('p', {}, slide.subtitle), revealType: 'editable-text<reveal>', tgpPath: `${tgpPath}~subtitle` }))
  })
})

ReactComp('titleSlide.revealSample', {
  impl: comp({
    hFunc: ({}, { react: { h } }) => ({ slide, tgpPath, visitVdom }) => h('div:sample-slide', {},
    visitVdom({ vdom: h('h2', {}, slide.title), revealType: 'editable-text<reveal>', tgpPath: `${tgpPath}~title` }))
  })
})

ReactComp('columnsSlide.revealSample', {
  impl: comp({
    hFunc: ({}, { react: { h } }) => ({ slide, tgpPath, visitVdom }) => h('div:sample-slide', {},
      visitVdom({ vdom: h('h2', {}, slide.title), revealType: 'editable-text<reveal>', tgpPath: `${tgpPath}~title` }),
      ...slide.columns.map((col, colIndex) => h('div', {},
        visitVdom({ vdom: h('h3', {}, col.title), revealType: 'editable-text<reveal>',
          tgpPath: `${tgpPath}~columns~${colIndex}~title` }),
        h('ul', {}, ...coreUtils.asArray(col.items).map((entry, itemIndex) => visitVdom({ vdom: h('li', {}, entry.text),
          revealType: 'editable-text<reveal>', tgpPath: `${tgpPath}~columns~${colIndex}~items~${itemIndex}~text` }))))))
  })
})

const revealSampleDeck = Deck('revealSample.deck', {
  impl: deck({
    slides: [
      coverSlide('Reveal DSL sample 121', 'In edit mode, click text to edit or comment', {
        comments: [
          comment('title', 'Review this title', { author: 'shaiby', timestamp: '2026-08-15T12:00:00.000Z' })
        ]
      }),
      columnsSlide({
        title: 'Semantic Reveal paths',
        columns: [
          column('Runtime', item('Reveal owns navigation and hash state')),
          column('Source', item('Language services persist exact TGP paths'))
        ],
        comments: []
      })
    ],
    theme: theme('white'),
    controls: controls(),
    features: [
      liveEditor({ author: 'shaiby' })
    ],
    metadata: applet({ title: 'Reveal DSL Playground', icon: 'Presentation', showMessageInput: false })
  })
})

const revealSampleApplet = ReactComp('revealSampleApplet', {
  impl: deckViewer(revealSampleDeck())
})

Test('revealTest.liveEditing', {
  impl: reactTest({
    testedComp: revealSampleApplet(),
    expectedResult: and(
      contains('data-reveal-tgp-path'),
      contains('contenteditable="false"'),
      contains('reveal.editModeChanged', { allText: json.stringify('%$revealLogger/revealLog%') }),
      contains('reveal.vdomVisited', { allText: json.stringify('%$revealLogger/revealLog%') })
    ),
    userActions: actions(waitForText('Reveal DSL sample'), click('Edit'), waitForText('Add slide')),
    logger: 'revealLogger',
    timeout: 8000
  })
})

Test('revealTest.templatePicker', {
  impl: reactTest({
    testedComp: revealSampleApplet(),
    expectedResult: and(
      contains('title'),
      contains('columns'),
      contains('reveal.templatePickerChanged', {
        allText: json.stringify('%$revealLogger/revealLog%')
      })
    ),
    userActions: actions(waitForText('Reveal DSL sample'), click('Edit'), click('Add slide'), waitForText('columns')),
    logger: 'revealLogger',
    timeout: 8000
  })
})

Test('revealTest.sourceEditor', {
  impl: reactTest({
    testedComp: revealSampleApplet(),
    expectedResult: and(
      contains('deck<reveal>revealSample.deck'),
      contains('Save source'),
      contains('reveal.sourceDialogMoved', { allText: json.stringify('%$revealLogger/revealLog%') })
    ),
    userActions: actions(
      waitForText('Reveal DSL sample'),
      click('Edit'),
      click('Edit source'),
      waitForText('Save source'),
      dragRevealSourceDialog(),
      click('Save source'),
      waitForText('Saved deck<reveal>revealSample.deck')
    ),
    logger: 'revealLogger',
    timeout: 8000
  })
})

Test('revealTest.navigation', {
  impl: reactTest({
    testedComp: revealSampleApplet(),
    expectedResult: and(
      contains('Semantic Reveal paths'),
      contains('reveal.hashChanged', { allText: json.stringify('%$revealLogger/revealLog%') })
    ),
    userActions: actions(waitForText('Reveal DSL sample'), revealNavigate('right'), waitForText('Semantic Reveal paths')),
    logger: 'revealLogger',
    timeout: 8000
  })
})

Test('revealTest.inPlaceEditingSave', {
  impl: reactTest({
    testedComp: revealSampleApplet(),
    expectedResult: and(
      contains('saved to revealSample.deck~impl~slides~0~title'),
      contains('/wonder/ui/reveal/reveal-tests.js'),
      contains('reveal.textSaved', { allText: json.stringify('%$revealLogger/revealLog%') })
    ),
    userActions: actions(
      waitForText('Reveal DSL sample'),
      click('Edit'),
      inPlaceEdit('%$revealSampleTitlePath%', '%$revealEditedTitle%')
    ),
    logger: 'revealLogger',
    timeout: 8000
  })
})

Test('revealTest.comment', {
  impl: reactTest({
    testedComp: revealSampleApplet(),
    expectedResult: and(
      contains('data-reveal-comments'),
      contains('Review this title'),
      contains('reveal.itemSelected', 'reveal.commentAdded', 'subtitle', {
        allText: json.stringify('%$revealLogger/revealLog%')
      })
    ),
    userActions: actions(
      waitForText('Reveal DSL sample'),
      click('Edit'),
      addRevealComment('%$revealCommentTargetPath%', '%$revealCommentText%')
    ),
    logger: 'revealLogger',
    timeout: 8000
  })
})
