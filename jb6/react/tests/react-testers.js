// REAL browser with REAL modules (no stubs), use the mcp tool `playwrightHarvest`
import { dsls, ns, coreUtils, jb } from '@jb6/core'
import { reactUtils } from '@jb6/react' 
import '@jb6/testing'
const { asArray, logException } = coreUtils

Object.assign(reactUtils, {registerMutObs, prettyPrintNode, probeReactComp, runAndHarvest})

const { delay } = coreUtils
const {
  tgp: { TgpType },
  test: { Test,
    test: { dataTest }
  },
  react: { ReactComp, HFunc,
    'react-comp': { comp },
  },
  common: { Data }
} = dsls

const UiAction = TgpType('ui-action', 'test')
Test('reactTest', {
    params: [
      {id: 'testedComp', type: 'react-comp<react>', dynamic: true },
      {id: 'expectedResult', type: 'boolean', dynamic: true},
      {id: 'props', as: 'object' },
      {id: 'userActions', type: 'ui-action[]'},
      {id: 'logger', as: 'string'},
      {id: 'setup', type: 'ctx-enricher<tgp>', dynamic: true},
      {id: 'timeout', as: 'number', defaultValue: 2000},
      {id: 'locationHref', as: 'string'},
    ],
    impl: dataTest({
        logger: '%$logger%',
        setup: '%$setup()%',
        timeout: '%$timeout%',
        calculate: async (ctx,{singleTest,uiLogger,uiHtmlLogger},{testedComp,userActions,props,locationHref}) => {
          const win = globalThis.window
          if (!win)
            return {error: 'reactTest: no global window' }

          win.testing = true
          reactUtils.registerMutObs(win)
          const testSimulation = win.document.createElement('div')
          testSimulation.id = 'test-simulation'
          const hasActions = asArray(userActions).length > 0
          if (singleTest || hasActions)
              win.document.body.appendChild(testSimulation)
          const seedCtx = reactUtils.extendCtxWithUrl({ctx: ctx.setVars({react: reactUtils}), href: locationHref})
          let hFuncRes
          try {
            hFuncRes = testedComp(seedCtx)
          } catch (error) {
            return { error: error.stack}
          }

          uiLogger?.info?.({t: 'render', comp: 'reactTest'}, {}, {ctx})
          reactUtils.createRoot(testSimulation).render(reactUtils.createElement(hFuncRes, props))
          await win.waitForMutations(10)
          const ctxA = seedCtx.setVars({ win })
          for (const a of asArray(userActions)) {
            uiLogger?.info?.({t: 'ui-action', action: a.actionId || 'action'}, {}, {ctx})
            await a.exec(ctxA)
            await win.waitForMutations(50)
          }
          uiLogger?.info?.({t: 'actions-done', count: asArray(userActions).length}, {}, {ctx})
          const html = prettyPrintNode(testSimulation)
          if (!singleTest)
            testSimulation.remove()
          uiLogger?.info?.({t: 'html', len: html.length, summary: html.replace(/\s+/g, ' ').slice(0, 200)}, {}, {ctx})
          uiHtmlLogger?.info?.({t: 'html', html}, {}, {ctx})
          return { toString: () => html }
        },
        expectedResult: '%$expectedResult()%',
        includeTestRes: true
    })
})

UiAction('actions', {
  params: [ 
    { id:'actions', type: 'ui-action[]', composite: true } 
  ],
  impl: ({}, {}, {actions}) => ({
    async exec(ctx) {
      for (const a of actions)
        await a.exec(ctx)
    }
  })
})

UiAction('waitForMutations', {
  params: [ { id:'timeout', as:'number' } ],
  impl: ({}, {}, {timeout}) => ({ exec: ctx => ctx.vars.win.waitForMutations(timeout) })
})

UiAction('delay', {
  params: [ { id:'ms', as:'number', defaultValue: 1000 } ],
  impl: ({}, {}, {ms}) => ({ exec: () => delay(ms) })
})

UiAction('waitForSelector', {
  params: [
    { id: 'selector', as: 'string' },
    { id: 'timeout', as: 'number', defaultValue: 2000 }
  ],
  impl: ({}, {}, { selector, timeout }) => ({
    async exec(ctx) {
      const {win, uiLogger} = ctx.vars, t0 = Date.now()
      return new Promise(resolve => {
        const observer = new win.MutationObserver(check)
        observer.observe(win.document, { childList: true, subtree: true })
        const timer = setTimeout(() => { observer.disconnect(); uiLogger?.info?.({t: 'waitForSelector', selector, found: false, ms: Date.now()-t0}, {}, {ctx}); resolve(null) }, timeout)
        check()

        function check() {
          const el = win.document.querySelector(selector)
          if (el) {
            observer.disconnect()
            clearTimeout(timer)
            uiLogger?.info?.({t: 'waitForSelector', selector, found: true, ms: Date.now()-t0}, {}, {ctx})
            resolve(el)
          }
        }
      })
    }
  })
})

UiAction('waitForText', {
  params: [
    { id: 'text', as: 'string' },
    { id: 'timeout', as: 'number', defaultValue: 8000 }
  ],
  impl: ({}, {}, { text, timeout }) => ({
    async exec(ctx) {
      const {win, uiLogger} = ctx.vars, t0 = Date.now()
      return new Promise(resolve => {
        const observer = new win.MutationObserver(check)
        observer.observe(win.document, { childList: true, subtree: true })
        const timer = setTimeout(() => { observer.disconnect(); uiLogger?.info?.({t: 'waitForText', text, found: false, ms: Date.now()-t0}, {}, {ctx}); resolve(null) }, timeout)
        check()

        function check() {
          const found = win.document.body.outerHTML.indexOf(text) != -1
          if (found) {
            observer.disconnect()
            clearTimeout(timer)
            uiLogger?.info?.({t: 'waitForText', text, found: true, ms: Date.now()-t0}, {}, {ctx})
            resolve()
          }
        }
      })
    }
  })
})

UiAction('click', {
  params: [
    { id: 'buttonText', as: 'string' },
  ],
  impl: (ctx, {}, { buttonText }) => ({
    async exec(ctx) {
      const { win } = ctx.vars
      try {
        const buttons = Array.from(win.document.querySelectorAll('button, .cursor-pointer'))
        const button = buttonText ? buttons.find(button => button.outerHTML.indexOf(buttonText) != -1) : buttons[0]
        if (!button) {
          console.log(`can not find button ${buttonText}`,buttons)
          return
        }
        console.log(`click: found button ${buttonText}`, button.outerHTML)
        const event = new win.MouseEvent('click', { bubbles: true, cancelable: true })
        button.dispatchEvent(event)
      } catch (e) {
        debugger
        console.log(e)
      }
    }
  })
})

UiAction('longPress', {
  params: [
    { id: 'buttonText', as: 'string' },
    { id: 'timeToPress', as: 'number', defaultValue: 350, byName: true },
  ],
  impl: (ctx, {}, { buttonText, timeToPress }) => ({
    async exec(ctx) {
      const { win } = ctx.vars
      try {
        const buttons = Array.from(win.document.querySelectorAll('button, .cursor-pointer'))
        const button = buttonText ? buttons.find(button => button.outerHTML.indexOf(buttonText) != -1) : buttons[0]
        if (!button) {
          console.log(`can not find button ${buttonText}`,buttons)
          return
        }
        console.log(`click: found button ${buttonText}`, button.outerHTML)
        const event = new win.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: Math.pow(2, 0), view: win })
        button.dispatchEvent(event)
        await delay(timeToPress)
        const event2 = new win.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, buttons: Math.pow(2, 0), view: win })
        button.dispatchEvent(event2)
      } catch (e) {
        debugger
        console.log(e)
      }
    }
  })
})

// resolve the cm6 EditorView bound to a .cm-editor node. real cm6 and the test stub both
// resolve the view via EditorView.findFromDOM(el) - the one API both the real cm6 bundle and the stub expose.
// CodeMirrorJs is async (importUrl -> spinner first), so the node mounts after render; wait for it.
const CM6_IMPORT = './lib/codemirror6/codemirror6-bundle.mjs'
async function cmView(ctx, selector, timeout = 2000) {
  const { win, uiLogger } = ctx.vars
  const sel = selector || '.cm-editor'
  const { EditorView } = reactUtils.imported(CM6_IMPORT) || {}
  const t0 = Date.now()
  const find = () => { const el = win.document.querySelector(sel); const view = EditorView?.findFromDOM(el); return view ? { el, view } : null }
  let found = find()
  while (!found && Date.now() - t0 < timeout) {
    await win.waitForMutations(20)
    found = find()
  }
  const { el, view } = found || {}
  uiLogger?.info?.({ t: 'cmView', selector: sel, elFound: !!el, viewFound: !!view, ms: Date.now() - t0 }, {}, { ctx })
  return { win, el, view }
}

UiAction('clickInCodeMirror', {
  params: [ { id: 'pos', as: 'number' }, { id: 'selector', as: 'string' } ],
  impl: ({}, {}, { pos, selector }) => ({
    async exec(ctx) {
      const { uiLogger } = ctx.vars
      const { win, view } = await cmView(ctx, selector)
      if (!view) return uiLogger?.info?.({ t: 'clickInCodeMirror', pos, error: 'no cm view' }, {}, { ctx })
      if (win.testing) view.setSel(pos, pos)
      else view.dispatch({ selection: { anchor: pos } })
      uiLogger?.info?.({ t: 'clickInCodeMirror', pos }, {}, { ctx })
    }
  })
})

UiAction('selectInCodeMirror', {
  params: [ { id: 'from', as: 'number' }, { id: 'to', as: 'number' }, { id: 'selector', as: 'string' } ],
  impl: ({}, {}, { from, to, selector }) => ({
    async exec(ctx) {
      const { uiLogger } = ctx.vars
      const { win, view } = await cmView(ctx, selector)
      if (!view) return uiLogger?.info?.({ t: 'selectInCodeMirror', from, to, error: 'no cm view' }, {}, { ctx })
      if (win.testing) view.setSel(from, to)
      else view.dispatch({ selection: { anchor: from, head: to } })
      uiLogger?.info?.({ t: 'selectInCodeMirror', from, to, text: view.state.doc.toString().slice(from, to) }, {}, { ctx })
    }
  })
})

UiAction('keyPressInCodeMirror', {
  params: [ { id: 'key', as: 'string' }, { id: 'ctrl', as: 'boolean' }, { id: 'meta', as: 'boolean' }, { id: 'shift', as: 'boolean' }, { id: 'selector', as: 'string' } ],
  impl: ({}, {}, { key, ctrl, meta, shift, selector }) => ({
    async exec(ctx) {
      const { uiLogger } = ctx.vars
      const { win, view } = await cmView(ctx, selector)
      const spec = [ctrl && 'Ctrl', meta && 'Cmd', shift && 'Shift', key].filter(Boolean).join('-')
      if (!view) return uiLogger?.info?.({ t: 'keyPressInCodeMirror', key: spec, error: 'no cm view' }, {}, { ctx })
      if (win.testing) {
        const bind = view.keymap.find(k => k.key === spec)
        uiLogger?.info?.({ t: 'keyPressInCodeMirror', key: spec, bound: !!bind }, {}, { ctx })
        bind?.run(view)
      } else {
        view.contentDOM.dispatchEvent(new win.KeyboardEvent('keydown', { key, ctrlKey: !!ctrl, metaKey: !!meta, shiftKey: !!shift, bubbles: true, cancelable: true }))
        uiLogger?.info?.({ t: 'keyPressInCodeMirror', key: spec }, {}, { ctx })
      }
    }
  })
})

// a mock localStorage auth seed for playwrightHarvest(seedLocalStorage) - stands in for a real auth-token minter
// (e.g. Wonder's mintWonderAuth2). NOTE: seeds localStorage, not cookies - Wonder's auth2 also lives in
// localStorage (localStorage.getItem('auth2')). its result object is written to localStorage before the page
// boots so the comp renders "as a logged-in user"; object values are JSON.stringified into localStorage by the tool.
Data('mockAuthSeed', {
  impl: () => ({ auth2: { id_token: 'mock-id-token', expiresAt: 9999999999999 }, user: { name: 'Homer' } })
})

// run a ui-action<test> profile (object or json string) against the already-mounted comp in `win`, then
// harvest its loggers. owns the whole live-page lifecycle: run actions (bounded by `limit` ms) → set
// window.jbDone → return { done, logs }. shared by react-comp-view.html and the playwrightHarvest mcp tool.
async function runAndHarvest(ctx, win, uiActionJsonStr, limit = 10000) {
  const { uiLogger } = ctx.vars
  let done = true
  try {
    // log the raw input so a failing run shows exactly what crossed the wire (e.g. an object stringified to '[object Object]' = a serialization bug upstream)
    uiLogger?.info?.({t: 'runAndHarvest.start', type: typeof uiActionJsonStr, uiActionJsonStr: String(uiActionJsonStr).slice(0, 200), limit}, {}, {ctx})
    if (uiActionJsonStr) {
      registerMutObs(win)
      const profile = typeof uiActionJsonStr === 'string' ? JSON.parse(uiActionJsonStr) : uiActionJsonStr
      coreUtils.restoreProfile$(profile)
      const action = await ctx.run(profile)
      await win.waitForMutations(10)
      // race the action against the limit; whichever wins tells us if the action completed or timed out
      const timedOut = await Promise.race([
        action.exec(ctx.setVars({ win })).then(() => false),
        delay(limit).then(() => true)
      ])
      if (timedOut) done = false
      uiLogger?.info?.({t: 'runAndHarvest.actionsDone', timedOut}, {}, {ctx})
    }
  } catch (error) {
    logException(error, 'runAndHarvest', {ctx})
    done = false
  }
  win.jbDone = true
  return { done, logs: coreUtils.harvestLogs({ vars: win.jbLoggers || ctx.vars }) }
}

async function probeReactComp(ctx, reactCmp) {
  const win = globalThis.window
  if (!win)
    return {error: 'reactTest: no global window' }

  win.testing = true
  reactUtils.registerMutObs(win)
  const testSimulation = win.document.createElement('div')
  testSimulation.id = 'test-simulation'
  let hFuncRes
  try {
    hFuncRes = reactUtils.hh(ctx, reactCmp)
  } catch (error) {
    return { error: error.stack}
  }

  reactUtils.createRoot(testSimulation).render(hFuncRes)
  await win.waitForMutations(10)
  const res = prettyPrintNode(testSimulation)
  testSimulation.remove()
  return res
}

function registerMutObs(win) {
  win.groupCounter = 0
  win.mutationGroups = []
  let batch = [], startRel = null, timer = null, nextGroupResolver = null
  const t0 = Date.now()
  const observer = new win.MutationObserver(muts => {
    const now = Date.now(), rel = now - t0
    if (startRel == null) startRel = rel
    muts.forEach(m => {
      batch.push({
        timestamp: rel,
        type: m.type,
        target: m.target.nodeName,
        path: getPathFromRoot(m.target),
        attributeName: m.attributeName,
        oldValue: m.oldValue,
        added: [...m.addedNodes].map(n => nodeToJSON(n,win)),
        removed: [...m.removedNodes].map(n => nodeToJSON(n,win))
      })
    })
    clearTimeout(timer)
    timer = setTimeout(() => {
      const endRel = Date.now() - t0
      const sec = new Date(t0 + endRel).getSeconds()
      const group = { time: `${startRel}-${endRel}:${sec}`, mutations: batch }
      win.mutationGroups.push(group)
      win.groupCounter++
      batch = []
      startRel = null
      if (nextGroupResolver) nextGroupResolver(group)
      nextGroupResolver = null
    }, 50)
  })
  
  observer.observe(win.document.body, { childList: true, subtree: true, attributes: true, characterData: true })

  win.waitForMutations = (timeout = 500) => new Promise(resolve => {
    let timer
    const resolver = group => {
      clearTimeout(timer)
      nextGroupResolver = null
      resolve(group)
    }
    nextGroupResolver = resolver
    timer = setTimeout(() => {
      if (nextGroupResolver === resolver) {
        nextGroupResolver = null
        resolve('timeout')
      }
    }, timeout)
  })
}

function nodeToJSON(node, win) {
  if (node.nodeType === win.Node.TEXT_NODE) {
    return { type: 'text', text: node.textContent }
  }
  return {
    type: node.nodeName,
    attributes: Object.fromEntries(
      Array.from(node.attributes || []).map(a => [a.name, a.value])
    ),
    innerHTML: node.innerHTML
  }
}

function getPathFromRoot(node) {
  const path = []
  let el = node
  while (el && el.id !== 'root') {
    const parent = el.parentNode
    if (!parent || !parent.children) break
    const idx = Array.prototype.indexOf.call(parent.children, el) + 1
    el.tagName && path.unshift(`${el.tagName.toLowerCase()}:nth-child(${idx})`)
    el = parent
  }
  if (el && el.id === 'root') path.unshift('#root')
  return path.join(' > ')
} 

function prettyPrintNode(node, indent = 0) {
  if (!node) return ''
  const pad = ' '.repeat(indent)
  let out = ''

  node.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      const txt = child.textContent.trim()
      if (txt) out += pad + txt + '\n'
    }
    else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = child.tagName.toLowerCase()
      const attrs = [...child.attributes].map(a => ` ${a.name}="${a.value}"`).join('')
      const children = Array.from(child.childNodes).filter(n => n.nodeType !== Node.TEXT_NODE || n.textContent.trim().length > 0)

      if (children.length === 0) {
        out += pad + `<${tag}${attrs}></${tag}>\n`
      } else if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE) {
        const text = children[0].textContent.trim()
        out += pad + `<${tag}${attrs}>${text}</${tag}>\n`
      } else {
        out += pad + `<${tag}${attrs}>\n`
        out += prettyPrintNode(child, indent + 2)
        out += pad + `</${tag}>\n`
      }
    }
  })
  return out.replace(/\n+$/, '\n')
}