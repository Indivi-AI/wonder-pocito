import { coreUtils, dsls, ns } from '@jb6/core'
import '@jb6/common'
import '@jb6/testing'
import '@jb6/react/tests/react-testers.js'
import '@wonder/ui/applet.js'
import './reveal-dsl.js'
import './reveal-impl.js'
import './reveal-themes.js'
import './reveal-editor.js'

const { json } = ns
const {
  tgp: { Const, 'ctx-enricher': { setVars } },
  reveal: {
    Deck, Slide,
    deck: { deck },
    comment: { comment },
    slide: { coverSlide, columnsSlide, entityDiagramSlide }, column: { column }, 'column-item': { item },
    'diagram-entity': { diagramEntity, diagramGroup }, 'diagram-relation': { diagramRelation },
    'diagram-anchor': { diagramAnchor }, 'diagram-route': { bezierRoute, orthogonalRoute }, 'diagram-point': { diagramPoint },
    controls: { controls },
    'live-editor': { liveEditor }
  },
  theme: { theme: { wonder } },
  react: { ReactComp, UiAction, 'react-comp': { comp, deckViewer }, 'react-metadata': { applet },
    'ui-action': { actions, click, waitForText } },
  common: { Data, data: { asIs }, boolean: { and, contains, notContains } },
  test: { Test, test: { dataTest, reactTest } }
} = dsls

Const('revealSampleTitlePath', 'deck<reveal>revealSample.deck~impl~slides~0~title')
Const('revealCommentTargetPath', 'deck<reveal>revealSample.deck~impl~slides~0~subtitle')
Const('revealEditedTitle', 'Edited title')
Const('revealCommentText', 'Clarify this title')

const resolveSlideViewTest = Data('resolveSlideViewTest', {
  params: [
    {id: 'slide', type: 'slide<reveal>', dynamic: true},
    {id: 'categories', as: 'object', byName: true}
  ],
  impl: (ctx, {}, { slide, categories }) => {
    const { slideViewCtx, view } = slide(ctx)(ctx, categories)
    const { slideArgs, slideTgpPath, revealCategories } = slideViewCtx.vars
    return `${view[coreUtils.asJbComp].id}|${slideArgs.title}|${revealCategories.reveal}|${slideTgpPath}`
  }
})

const diagramBoxTest = Data('diagramBoxTest', {
  params: [
    {id: 'entity', type: 'diagram-entity<reveal>'}
  ],
  impl: ({}, {}, { entity }) => `${entity.x},${entity.y},${entity.width},${entity.height}`
})

Test('revealTest.boxCoerce', {
  impl: dataTest(diagramBoxTest(diagramEntity('auto-box', 'Auto box', { box: '5,5' })), contains('5,5,auto,auto'))
})

Test('revealTest.resolveSlideView', {
  impl: dataTest({
    calculate: resolveSlideViewTest(coverSlide('Simple slide'), { categories: {revealSample: true} }),
    expectedResult: contains('coverSlide.reveal.revealSample|Simple slide|true','revealTest.resolveSlideView~impl~calculate~slide')
  })
})

Slide('slideSample.columns', {
  description: 'Reusable two-column Reveal comparison slide',
  impl: columnsSlide('New comparison', [
    column('First', item('First point')),
    column('Second', item('Second point'))
  ], {
    comments: []
  })
})

const { slideSample } = ns
Test('revealTest.resolveWrappedSlideView', {
  impl: dataTest({
    calculate: resolveSlideViewTest(slideSample.columns(), { categories: {revealSample: true} }),
    expectedResult: contains('columnsSlide.reveal.revealSample|New comparison|true|slide<reveal>slideSample.columns~impl')
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
    if (restore) await edit(original)
    if (revealLogger.revealLog.slice(before).filter(event => event.t == 'reveal.textSaved').length != (restore ? 2 : 1))
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
    const compId = tgpPath.split('~')[0], filePath = new URL(coreUtils.compByFullId(compId).$location.path, win.location.href).href
    const before = await fetch(filePath).then(res => res.text())
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

ReactComp('deckShell.reveal.revealSample', {
  impl: comp({
    hFunc: ({}, { react: { h } }) => ({ children }) => h('main:reveal-sample', {},
      h('style', {}, `.reveal-sample{height:100vh;background:#f8fafc}.reveal-sample>.reveal{height:100%}
        .reveal-sample .slides{text-align:left}.sample-slide{height:100%;padding:80px;background:linear-gradient(135deg,#fff,#e0f2fe)}
        .sample-slide h1,.sample-slide h2{color:#0f172a;text-transform:none}.sample-slide p,.sample-slide li{color:#334155}`), children)
  })
})

ReactComp('coverSlide.reveal.revealSample', {
  impl: comp({
    hFunc: ({}, { react: { h } }) => ({ slide, tgpPath, visitVdom }) => h('div:slideContent', {},
      h('div:logo', {}, 'W  |  Wonder'),
      visitVdom({ vdom: h('h1:title', {}, slide.title), revealType: 'editable-text<reveal>', tgpPath: `${tgpPath}~title` }),
      visitVdom({ vdom: h('p:subtitle', {}, slide.subtitle), revealType: 'editable-text<reveal>', tgpPath: `${tgpPath}~subtitle` }))
  })
})

ReactComp('titleSlide.reveal.revealSample', {
  impl: comp({
    hFunc: ({}, { react: { h } }) => ({ slide, tgpPath, visitVdom }) => h('div:sample-slide', {},
    visitVdom({ vdom: h('h2', {}, slide.title), revealType: 'editable-text<reveal>', tgpPath: `${tgpPath}~title` }))
  })
})

ReactComp('columnsSlide.reveal.revealSample', {
  impl: comp({
    hFunc: ({}, { react: { h } }) => ({ slide, tgpPath, visitVdom }) => h('div:slideContent', {},
      h('div:logo', {}, 'W  |  Wonder'),
      visitVdom({ vdom: h('h2:title', {}, slide.title), revealType: 'editable-text<reveal>', tgpPath: `${tgpPath}~title` }),
      h('div:columns', {}, ...slide.columns.map((col, colIndex) =>
        h('article:column', {},
          visitVdom({ vdom: h('h3:columnTitle', {}, col.title), revealType: 'editable-text<reveal>',
            tgpPath: `${tgpPath}~columns~${colIndex}~title` }),
          h('ul:body', {}, ...coreUtils.asArray(col.items).map((entry, itemIndex) =>
            visitVdom({ vdom: h('li:item', {}, entry.text), revealType: 'editable-text<reveal>',
              tgpPath: `${tgpPath}~columns~${colIndex}~items~${itemIndex}~text` })))))))
  })
})

const revealSampleDeck = Deck('revealSample.deck', {
  impl: deck({
    slides: [
      coverSlide('Edited title', 'In edit mode, click text to edit or comment', {
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
    theme: wonder(),
    controls: controls(),
    features: [
      liveEditor({ author: 'shaiby' })
    ],
    metadata: applet({ title: 'Reveal DSL Playground', icon: 'Presentation', showMessageInput: false })
  })
})
const revealSampleDeckSourcePath = coreUtils.compByFullId('deck<reveal>revealSample.deck').$location.path

const revealSampleApplet = ReactComp('revealSampleApplet', {
  impl: deckViewer(revealSampleDeck(), setVars(asIs({ revealCategories: { revealSample: true } })))
})

const revealArchitectureDeck = Deck('revealArchitecture.deck', {
  impl: deck({
    slides: [
      entityDiagramSlide('Data Engineering Service', 'SYSTEM ARCHITECTURE', {
        subtitle: 'Entities and the relations between them',
        entities: [
          diagramGroup('customer', 'CUSTOMER DATA', { box: '20,120,350,540' }),
          diagramGroup('backend', 'WONDER BACKEND ENGINE', { box: '390,120,940,540', accented: true }),
          diagramGroup('client', 'WONDER CLIENT ENGINE', { box: '1350,120,390,540' }),
          diagramEntity('requirements', 'Business / Data Analyst Requirements', {
            box: '390,10,940,90',
            subtitle: 'metrics and dimensions'
          }),
          diagramEntity('event', 'Event Source', { box: '70,340,250,100', subtitle: 'operational events' }),
          diagramEntity('master', 'Master Data', {
            box: '70,500,250,120',
            summary: ['users','products','accounts']
          }),
          diagramEntity('parquets', 'Optimized Parquets', { box: '450,190,230,105' }),
          diagramEntity('projections', 'Optimized Projections', { box: '450,390,230,105' }),
          diagramEntity('trino', 'Athena / Trino', { box: '760,190,220,105' }),
          diagramEntity('cube', 'Wonder Cube', {
            box: '1040,320,230,130',
            subtitle: 'optimizer and router',
            dark: true,
            detail: columnsSlide('Wonder Cube', [
              column('Business logic', item('Semantic model and policy enforcement')),
              column('Query routing', item('Chooses Athena, Trino, or an optimized projection'))
            ])
          }),
          diagramEntity('dashboards', 'Dashboards', { box: '1420,220,250,110' }),
          diagramEntity('ai', 'AI', { box: '1420,480,250,110', subtitle: 'verified answers' })
        ],
        relations: [
          diagramRelation('requirements-cube', diagramAnchor('requirements', 'bottom', { ratio: 0.8 }), {
            to: diagramAnchor('cube', 'top'),
            route: bezierRoute(),
            label: 'semantic model'
          }),
          diagramRelation('requirements-client', diagramAnchor('requirements', 'right'), {
            to: diagramAnchor('client', 'left', { ratio: 0.1 }),
            route: bezierRoute(),
            label: 'requirements'
          }),
          diagramRelation('event-parquets', diagramAnchor('event'), {
            to: diagramAnchor('parquets', 'left'),
            route: orthogonalRoute(diagramPoint(380, 242.5))
          }),
          diagramRelation('master-backend', diagramAnchor('master'), {
            to: diagramAnchor('backend', 'left', { ratio: 0.77 }),
            route: orthogonalRoute(diagramPoint(380, 535.8))
          }),
          diagramRelation('parquets-trino', diagramAnchor('parquets'), {
            to: diagramAnchor('trino', 'left')
          }),
          diagramRelation('trino-cube', diagramAnchor('trino'), {
            to: diagramAnchor('cube', 'top', { ratio: 0.35 }),
            route: bezierRoute()
          }),
          diagramRelation('backend-cube', diagramAnchor('backend'), {
            to: diagramAnchor('cube', 'left'),
            direction: 'both'
          }),
          diagramRelation('dashboards-cube', diagramAnchor('dashboards', 'left'), {
            to: diagramAnchor('cube', 'right', { ratio: 0.32 }),
            route: bezierRoute()
          }),
          diagramRelation('ai-cube', diagramAnchor('ai', 'left'), {
            to: diagramAnchor('cube', 'right', { ratio: 0.71 }),
            route: bezierRoute()
          })
        ],
        lookAndFeel: 'systemArchitecture'
      })
    ],
    theme: wonder(),
    controls: controls({ hash: false }),
    features: [
      liveEditor({ author: 'shaiby' })
    ],
    metadata: applet({ title: 'Reveal Architecture Test', icon: 'Presentation', showMessageInput: false })
  })
})

const revealArchitectureApplet = ReactComp('revealArchitectureApplet', {
  impl: deckViewer(revealArchitectureDeck())
})

Test('revealTest.entityDiagramRelations', {
  impl: reactTest({
    testedComp: revealArchitectureApplet(),
    expectedResult: and(
      contains('Data Engineering Service','data-relation-id="requirements-cube"','data-relation-id="requirements-client"'),
      contains('data-route="bezier"'),
      contains('data-relation-layer="halo"','stroke-linecap="round"'),
      notContains('Business logic'),
      contains('"entityId":"cube"', '"entityId":null', {
        allText: json.stringify('%$revealLogger/revealLog%')
      }),
      contains('data-testid="diagram-master"')
    ),
    userActions: actions(
      waitForText('Data Engineering Service'),
      click('Wonder Cube'),
      waitForText('Business logic'),
      waitForText('Optimized Parquets'),
      waitForText('Chooses Athena, Trino, or an optimized projection'),
      click('✕'),
      waitForText('Optimized Parquets')
    ),
    logger: 'revealLogger,uiLogger',
    timeout: 8000
  })
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
      contains(revealSampleDeckSourcePath),
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
