// REAL browser with REAL modules (no stubs), use the mcp tool `playwrightHarvest`
import { coreUtils, dsls, ns } from '@jb6/core'
import './react-testers.js'
import '@jb6/react/progress-indicators.js'
import '@jb6/react/codemirror-utils.js'
import '@jb6/react/reveal.js'

const { json } = ns
const {
  tgp: { Component, 'ctx-enricher': { Var, loadReveal } },
  test: { Test,
      'ui-action': { click, longPress, actions, waitForText, clickInCodeMirror, selectInCodeMirror, keyPressInCodeMirror },
      test: { dataTest, reactTest }
  },
  common: {
    data: { asIs },
    boolean: { contains, equals, and },
  },
  react: { ReactComp,
    'react-comp': { comp, CodeMirrorJs },
    'react-metadata': { containerComp, importUrl },
    'progress-indicator': { spinner, dots, byStatus, byProgress }
  }
} = dsls

Test('reactTest.helloWorld', {
  impl: reactTest(({}, {react: {h}}) => () => h('div', {}, 'hello world'), contains('hello world'))
})

Test('reactTest.buttonClick', {
  impl: reactTest({
    testedComp: ({}, {react: {h, useState}}) => () => {
      const [text, setText] = useState('Click me')
      return h('button', { onClick: () => setText('Clicked!') }, text)
    },
    expectedResult: contains('Clicked!'),
    userActions: actions(click('Click me')),
    logger: 'uiLogger'
  })
})

Test('reactTest.use', {
  impl: reactTest({
    testedComp: ({}, {react: {h, use}}) => {
      const textPromise = coreUtils.delay(20).then(()=>'hello')
      return () => {
        const text = use(textPromise)
        return h('div', {}, text)
      }
    },
    expectedResult: contains('hello'),
    userActions: waitForText('hello')
  })
})

const compWithP1AndV1 = ReactComp('compWithP1AndV1', {
  params: [
    {id: 'p1', as: 'string ', type: 'data<common>', $dslType: 'data<common>'}
  ],
  impl: comp({
    hFunc: ({}, {v1, react: {h}}) => ({p1}) => h('div', {}, `myComp p1: ${p1}, v1: ${v1}`),
    enrichCtx: Var('v1', 'v1Val')
  })
})

Test('reactTest.usingjbComp', {
  impl: reactTest({
    testedComp: (ctx, {react: {h, hh}}) => () => h('div', {}, hh(ctx, compWithP1AndV1, {p1: 'p1Val'})),
    expectedResult: contains('myComp p1: p1Val, v1: v1Val')
  })
})

const asyncComp = ReactComp('asyncComp', {
  params: [
    {id: 'p1', as: 'string '}
  ],
  impl: comp({
    hFunc: ({}, {v1, react: {h}}) => ({p1}) => h('div', {}, `myComp p1: ${p1}, v1: ${v1}`),
    enrichCtx: ctx => coreUtils.delay(20).then(()=>ctx.setVars({v1: 'v1Val'}))
  })
})

Test('reactTest.asyncComp', {
  impl: reactTest({
    testedComp: (ctx, {react: {h, hh}}) => () => hh(ctx, asyncComp, {p1: 'p1Val'}),
    expectedResult: contains('myComp p1: p1Val, v1: v1Val'),
    userActions: waitForText('v1Val')
  })
})

const userComp = ReactComp('userComp', {
  impl: comp({ hFunc: ({}, {userName, react: {h}}) => () => h('div', {}, `User: ${userName}`) })
})

Test('reactTest.strongRefresh', {
  impl: reactTest({
    testedComp: (ctx, {react: {h, hh, hhStrongRefresh}}) => () => h('div', {}, [
        hh(ctx.setVars({userName: 'John'}), userComp),  // Shows: "User: John" (cached)
        hh(ctx.setVars({ userName: 'Jane' }), userComp),                      // Shows: "User: John" (still cached!)
        hhStrongRefresh(ctx.setVars({ userName: 'Jane' }), userComp)          // Shows: "User: Jane" (fresh)
    ]),
    expectedResult: and(contains('User: John'), contains('User: Jane'))
  })
})

const userCompAsync = ReactComp('userCompAsync', {
  impl: comp({
    hFunc: ({}, {userName, react: {h}}) => () => h('div', {}, `User: ${userName}`),
    enrichCtx: ctx => coreUtils.delay(10).then(()=> ctx)
  })
})

Test('reactTest.strongRefreshAsync', {
  impl: reactTest({
    testedComp: (ctx, {react: {h, hh, hhStrongRefresh}}) => () => h('div', {}, [
        hh(ctx.setVars({userName: 'John'}), userCompAsync),  // Shows: "User: John" (cached)
        hh(ctx.setVars({ userName: 'Jane' }), userCompAsync),                      // Shows: "User: John" (still cached!)
        hhStrongRefresh(ctx.setVars({ userName: 'Jane' }), userCompAsync)          // Shows: "User: Jane" (fresh)
    ]),
    expectedResult: and(contains('User: John'), contains('User: Jane')),
    userActions: waitForText('Jane')
  })
})

const refreshMainInner = ReactComp('refreshMainInner', {
  impl: comp({
    hFunc: ({}, {userName, react: {h}}) => ({refreshMain}) => h('div', {}, [
      h('div', {}, `User: ${userName}`),
      h('button', { onClick: () => refreshMain({userName: 'Jane'}) }, 'Change to Jane')
    ]),
    enrichCtx: ctx => coreUtils.delay(1).then(()=> ctx)
  })
})

Test('reactTest.refreshMainWithNewVars', {
  impl: reactTest({
    testedComp: (ctx, {react: { hhStrongRefresh, useState}}) => () => {
        const [vars, setVars] = useState({userName: 'John'})
        return hhStrongRefresh(ctx.setVars(vars), refreshMainInner, { refreshMain: (vars) => setVars(vars) })
    },
    expectedResult: contains('User: Jane'),
    userActions: actions(waitForText('Change to Jane'), click(), waitForText('Jane'))
  })
})

Test('reactTest.buttonClickWithParams', {
  params: [
    {id: 'textAfterClick', as: 'string', defaultValue: 'Clicked!'}
  ],
  impl: reactTest({
    testedComp: ({}, {react: {h, useState}}, {textAfterClick}) => () => {
      const [text, setText] = useState('Click me')
      return h('button', { onClick: () => setText(textAfterClick) }, text)
    },
    expectedResult: contains('%$textAfterClick%'),
    userActions: actions(click('Click me'))
  })
})

Test('reactTest.buttonForClick', {
  impl: reactTest({
    testedComp: ({}, {react: {h, useState}}) => () => {
    const [text, setText] = useState('Click me')
    return h('button', { onClick: () => setText('Clicked!') }, text)
  },
    expectedResult: contains('Click me'),
  })
})

Test('reactTest.longPress', {
  impl: reactTest({
    testedComp: ({}, {react: {h, useState, useRef}}) => () => {
      const [text, setText] = useState('LongPress me')
      const timeoutRef = useRef(null)
      
      const start = () => timeoutRef.current = setTimeout(() => setText('LongPress!'), 20)
      const stop = () => { 
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
      }
      
      return h('div:cursor-pointer', { 
        onMouseDown: start, onMouseUp: stop, onTouchStart: start, onTouchEnd: stop
      }, h('div',{}, h('div',{}, text)))
    },
    expectedResult: contains('LongPress!'),
    userActions: longPress('LongPress me', { timeToPress: 30 })
  })
})

Component('showMe', {
  type: 'react-comp<react>',
  params: [
    {id: 'textToShowAfter', defaultValue: 'after text' }
  ],
  impl: comp({
    hFunc: ({}, {text1, v1, react: {h}}, {textToShowAfter}) => ({}) => h('div', {}, text1, v1, textToShowAfter),
    enrichCtx: Var('text1', '%%/text%')
  })
})

ReactComp('test.sampleContainer', {
  impl: comp({
    hFunc: (ctx, {testedComp, react: {h, hh}}) => ({}) => 
      h('div', {}, 'container', hh(ctx, dsls.react['react-comp'][testedComp]))
  })
})

ReactComp('test.inContainer', {
  impl: comp({
    hFunc: ({}, {react: {h}}) => ({}) => h('div', {}, 'hello'),
    metadata: containerComp('test.sampleContainer')
  })
})

const compWithImportUrl = ReactComp('compWithImportUrl', {
  impl: comp({
    hFunc: ({}, {react: {h}}) => () => h('div', {}, 'importUrl loaded'),
    metadata: importUrl('./tests/test-import-module.mjs')
  })
})

Test('reactTest.importUrl', {
  impl: reactTest({
    testedComp: (ctx, {react: {h, hh}}) => () => hh(ctx, compWithImportUrl),
    expectedResult: contains('importUrl loaded'),
    userActions: waitForText('importUrl loaded')
  })
})

// renders the real CodeMirrorJs (cm6 stubbed under win.testing) with a fixed doc, logging the
// selected text on every cursor/selection change so tests can assert 'selected: <text>'.
const codeMirrorTest = ReactComp('codeMirrorTest', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh}}) => () => hh(ctx, CodeMirrorJs, {
      code: 'select-all-me',
      onCursorActivity: view => {
        const { from, to } = view.state.selection.main
        ctx.vars.uiLogger?.info?.({t: 'selected', text: `selected: ${view.state.doc.toString().slice(from, to)}`}, {}, {ctx})
      }
    })
  })
})

Test('reactTest.codeMirrorSelect', {
  impl: reactTest({
    testedComp: codeMirrorTest(),
    expectedResult: contains('selected: lect-a', { allText: json.stringify('%$uiLogger/uiLog%') }),
    userActions: actions(selectInCodeMirror(2, 8)),
    logger: 'uiLogger'
  })
})

Test('reactTest.codeMirrorClick', {
  impl: reactTest({
    testedComp: codeMirrorTest(),
    expectedResult: contains('selected: ', { allText: json.stringify('%$uiLogger/uiLog%') }),
    userActions: actions(clickInCodeMirror(5)),
    logger: 'uiLogger'
  })
})

Test('reactTest.codeMirrorKeyShortcut', {
  impl: reactTest({
    testedComp: codeMirrorTest(),
    expectedResult: contains('selected: select-all-me', { allText: json.stringify('%$uiLogger/uiLog%') }),
    userActions: actions(keyPressInCodeMirror('a', { ctrl: true })),
    logger: 'uiLogger'
  })
})

// progress-indicator usage: react-comp.comp renders the progressIndicator while its async enrichCtx is pending.

Test('reactTest.progress.defaultSpinner', {
  impl: reactTest({
    testedComp: comp({
      hFunc: ({}, {react: {h}}) => () => h('div', {}, 'report ready'),
      enrichCtx: ctx => coreUtils.delay(20).then(()=> ctx)
    }),
    expectedResult: contains('spinner', { allText: json.stringify('%$uiLogger/uiLog%') }),
    userActions: waitForText('report ready'),
    logger: 'uiLogger'
  })
})

Test('reactTest.progress.dots', {
  impl: reactTest({
    testedComp: comp({
      hFunc: ({}, {react: {h}}) => () => h('div', {}, 'report ready'),
      enrichCtx: ctx => coreUtils.delay(20).then(()=> ctx),
      progressIndicator: dots('Loading', 10)
    }),
    expectedResult: contains('Loading', { allText: json.stringify('%$uiLogger/uiLog%') }),
    userActions: waitForText('report ready'),
    logger: 'uiLogger'
  })
})

Test('reactTest.progress.byStatus', {
  impl: reactTest({
    testedComp: comp({
      hFunc: ({}, {react: {h}}) => () => h('div', {}, 'model ready'),
      enrichCtx: async (ctx, {uiLogger}) => {
        await coreUtils.delay(10).then(()=> uiLogger.status('1'))
        await coreUtils.delay(10).then(()=> uiLogger.status('232'))
        await coreUtils.delay(0)
        return ctx
      },
      progressIndicator: byStatus('Loading model')
    }),
    expectedResult: contains('1', '232', { allText: json.stringify('%$uiLogger/uiLog%') }),
    userActions: waitForText('232'),
    logger: 'uiLogger'
  })
})

Test('reactTest.progress.byProgress', {
  impl: reactTest({
    testedComp: comp({
      hFunc: ({}, {react: {h}}) => () => h('div', {}, 'report ready'),
      enrichCtx: async (ctx, {uiLogger}) => {
        await coreUtils.delay(10).then(()=> uiLogger.progress({t: 'aggregating', pct: 10}))
        await coreUtils.delay(10).then(()=> uiLogger.progress({t: 'aggregating', pct: 80}))
        await coreUtils.delay(10)
        return ctx
      },
      progressIndicator: byProgress({
        title: 'Loading report',
        logger: 'uiLogger',
        hFunc: ({}, {react: {h}}) => ({progressEvent}) =>
          h('div', {}, `${progressEvent.t} — ${progressEvent.pct}%`)
      })
    }),
    expectedResult: contains('10', '80', { allText: json.stringify('%$uiLogger/uiLog%') }),
    userActions: waitForText('80'),
    logger: 'uiLogger'
  })
})

const revealTest = ReactComp('revealTest', {
  impl: comp({
    hFunc: (ctx, {reveal, react: {h, useRef, useEffect, useState}}) => () => {
      const host = useRef()
      const [extra, setExtra] = useState(false)
      useEffect(() => {
        const { deck, disconnect } = reveal.mount(host.current)
        ctx.vars.uiLogger?.info?.({t: 'reveal', text: `reveal ready: ${deck.getTotalSlides()} slides`}, {}, {ctx})
        return disconnect
      }, [])
      // reveal {embedded} sizes to its host - the host needs an explicit height or the deck collapses to 0 (FOUC/roller)
      return h('div:reveal', { ref: host, style: { height: '400px' } }, h('div:slides', {},
        h('section', {}, 'SLIDE-ALPHA'),
        h('section', {}, 'SLIDE-BETA'),
        extra ? h('section', {}, 'SLIDE-GAMMA') : null,
        h('button', { onClick: () => setExtra(true) }, 'add-slide')))
    },
    enrichCtx: loadReveal()
  })
})

Test('reactTest.reveal', {
  impl: reactTest({
    testedComp: revealTest(),
    // clicking add-slide adds a 3rd <section>; the loadReveal observer auto-re-decorates and logs 'decorate #1'.
    // that single log is the proof reveal picked up the React-added slide - no extra bookkeeping in the comp needed.
    expectedResult: contains('reveal ready: 2 slides', 'decorate #1', { allText: json.stringify('%$uiLogger/uiLog%') }),
    userActions: actions(waitForText('SLIDE-ALPHA'), click('add-slide'), waitForText('SLIDE-GAMMA')),
    logger: 'uiLogger'
  })
})

const revealCodeSlide = ReactComp('revealCodeSlide', {
  impl: comp({
    hFunc: (ctx, {reveal, react: {h, hh, useRef, useEffect}}) => () => {
      const host = useRef()
      useEffect(() => {
        const { deck, disconnect } = reveal.mount(host.current)
        ctx.vars.uiLogger?.info?.({t: 'reveal', text: `reveal ready: ${deck.getTotalSlides()} slides`}, {}, {ctx})
        return disconnect
      }, [])
      // org-chart card: a styled node in the tree. `accent` tints the CEO. these are the ONLY inline styles we
      // keep - reveal has no card primitive - but layout is done with reveal's r-hstack/r-vstack, not hand flexbox.
      const card = (label, sub, accent) => h('div:fragment fade-up', { style: {
        background: accent ? 'linear-gradient(135deg,#2aa9e0,#1b6fb3)' : 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.18)', borderRadius: '14px', padding: '14px 22px',
        minWidth: '150px', boxShadow: '0 6px 22px rgba(0,0,0,0.4)' } },
        h('div', { style: { fontWeight: 700, fontSize: '0.9em', letterSpacing: '0.02em' } }, label),
        sub ? h('div', { style: { fontSize: '0.55em', opacity: 0.8, marginTop: '3px' } }, sub) : null)

      // full-height host so the deck uses real space (no shrink-to-scale-0.2 letterbox)
      return h('div:reveal', { ref: host, style: { position: 'absolute', inset: 0 } }, h('div:slides', {},
        // slide 1 (active on boot): a strong code-first opener. r-fit-text auto-sizes the headline huge.
        // data-auto-animate lets the headline morph into slide 2's headline. dark bg to make code pop.
        h('section', { 'data-auto-animate': true, 'data-background-color': '#0b1622' },
          h('h1:r-fit-text', { 'data-id': 'title', style: { margin: 0, fontWeight: 800 } }, 'Live Code'),
          h('p:fragment fade-in', { style: { opacity: 0.7, marginTop: '0.2em' } }, 'a real CodeMirror, running inside a reveal slide'),
          h('div', { style: { height: '46vh', maxWidth: '900px', margin: '0.6em auto 0', textAlign: 'left',
              borderRadius: '12px', overflow: 'hidden', boxShadow: '0 18px 60px rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.1)' } },
            hh(ctx, CodeMirrorJs, {
              code: [
                'const deck = new Reveal(host, { embedded: true })',
                'deck.initialize()',
                '',
                '// React fills the slide bodies,',
                '// reveal only decorates the <section>s.',
                'const greet = name => `hello ${name}`',
                'console.log(greet("reveal"))'
              ].join('\n'),
              onCursorActivity: view => {
                const { from, to } = view.state.selection.main
                ctx.vars.uiLogger?.info?.({t: 'cm', text: `cm selected: ${view.state.doc.toString().slice(from, to)}`}, {}, {ctx})
              }
            }))),
        // slide 2: org chart. r-vstack/r-hstack are reveal's own flex layout helpers; fragments build it level by level.
        h('section', { 'data-auto-animate': true, 'data-background-gradient': 'radial-gradient(circle at 50% 0%, #1b3a5b, #0b1622)' },
          h('h2:r-fit-text', { 'data-id': 'title', style: { margin: '0 0 0.4em', fontWeight: 800 } }, 'Org Chart'),
          h('div:r-vstack', { style: { gap: '26px' } },
            card('CEO', 'Ada Lovelace', true),
            h('div:r-hstack', { style: { gap: '28px' } },
              card('VP Eng', 'Grace Hopper'), card('VP Product', 'Alan Kay'), card('VP Design', 'Susan Kare')),
            h('div:r-hstack', { style: { gap: '20px' } },
              card('Frontend'), card('Backend'), card('Data'), card('QA')))),
        // slide 3: an image from the internet, framed with reveal's own r-frame class + a background color slide
        h('section', { 'data-background-color': '#101820' },
          h('h2:r-fit-text', { style: { margin: '0 0 0.3em', fontWeight: 800 } }, 'From the Internet'),
          h('img:r-frame', { src: 'https://cataas.com/cat?width=640&height=420',
            alt: 'a random cat', style: { maxHeight: '58vh', borderRadius: '10px' } }),
          h('p:fragment fade-in', { style: { fontSize: '0.55em', opacity: 0.65, marginTop: '0.5em' } }, 'live <img> from cataas.com')),
        // slide 4: recap with progressive fragments
        h('section', { 'data-background-gradient': 'linear-gradient(to bottom right, #17313b, #0b1622)' },
          h('h2:r-fit-text', { style: { margin: '0 0 0.5em', fontWeight: 800 } }, 'Recap'),
          h('ul', { style: { display: 'inline-block', textAlign: 'left', lineHeight: 1.7 } },
            h('li:fragment fade-up', {}, 'reveal decorates the deck chrome'),
            h('li:fragment fade-up', {}, 'React owns the slide bodies'),
            h('li:fragment fade-up', {}, 'live sub-comps (CodeMirror) embed cleanly'),
            h('li:fragment fade-up', {}, 'the observer only re-syncs on real slide changes')))))
    },
    enrichCtx: loadReveal('league')
  })
})

Test('reactTest.revealCodeSlide', {
  impl: reactTest({
    testedComp: revealCodeSlide(),
    expectedResult: contains('reveal ready: 4 slides', { allText: json.stringify('%$uiLogger/uiLog%') }),
    userActions: actions(waitForText('Live Code'), waitForText('const greet')),
    logger: 'uiLogger',
    timeout: 8000
  })
})
