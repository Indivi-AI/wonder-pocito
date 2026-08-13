import { dsls, coreUtils } from '@jb6/core'
import '@jb6/probe-studio/probe-studio-dsl.js'
import '@jb6/jq'

const {
  tgp: { 'ctx-enricher': { Var } },
  common: {
    data: { jq },
  },
  react: { ReactComp, ReactMetadata,
    'react-comp': { comp, codeMirrorJson },
    'react-metadata' : { abbr, matchData, priority}
  }
} = dsls

ReactComp('testIframeView', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => () => {
      const testId = ctx.data
      const src = `/packages/testing/tests.html?test=${testId}&browserSpy=all`
      return h('div:w-full h-full flex flex-col', {},
        h('div:flex p-1', {},
          h('a:text-gray-500 hover:text-gray-800', { href: src, target: '_blank', title: 'Open in new tab' }, 
            h('L:ExternalLink', { className: 'w-4 h-4' })
          )
        ),
        h('iframe:w-full flex-1 min-h-[500px] border-0', { src })
      )
    },
    metadata: [
      abbr('TST'),
      matchData(({},{probeRes}) => probeRes?.circuitCmpId?.startsWith('test<test>') && probeRes?.circuitCmpId?.split('~')[0]),
      priority(20)
    ]
  })
})

ReactComp('reactCompView', {
  impl: comp({
    hFunc: (ctx, {urlsToLoad, react: {h}}) => () => {
      const cmpId = ctx.data
      const src = `/jb6_packages/react/react-comp-view.html?cmpId=${encodeURIComponent(cmpId)}&urlsToLoad=${encodeURIComponent(urlsToLoad)}`
      return h('div:w-full h-full flex flex-col', {},
        h('div:flex p-1', {},
          h('a:text-gray-500 hover:text-gray-800', { href: src, target: '_blank', title: 'Open in new tab' }, 
            h('L:ExternalLink', { className: 'w-4 h-4' })
          )
        ),
        h('iframe:w-full flex-1 min-h-[500px] border-0', { src })
      )
    },
    metadata: [
      abbr('CMP'),
      matchData(({},{probeRes}) => probeRes?.circuitCmpId?.startsWith('react-comp<react>') && probeRes?.circuitCmpId?.split('>').pop().split('~')[0]),
      priority(2)
    ]
  })
})

ReactComp('cmdView', {
  impl: comp({
    hFunc: (ctx, {projectDir, react: {h}}) => () => {
      const cmd = ctx.data
      return h('div:p-3', {},
        h('div:mb-2 flex items-center justify-between', {},
          h('span:font-medium text-purple-800', {}, `cd ${projectDir}`),
          h('button:text-purple-600 hover:text-purple-800 text-xs px-2 py-1 border border-purple-300 rounded hover:bg-purple-50', {
            onClick: () => navigator.clipboard.writeText(cmd)
          }, 'Copy')
        ),
        h('pre:bg-gray-900 text-green-400 p-3 rounded text-xs overflow-auto max-h-64 font-mono border border-gray-600 whitespace-pre-wrap', {}, `$ ${cmd}`)
      )
    },
    enrichCtx: Var('projectDir', '%$top/projectDir%'),
    metadata: [
      abbr('CMD'),
      matchData('%$top/cmd%'),
      priority(6)
    ]
  })
})

ReactComp('imageView', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => () => h('img', { src: ctx.data, width: 400 }),
    metadata: [
      abbr('IMG'),
      matchData(jq('$top | .. | .imageUrl?', { first: true })),
      priority(2)
    ]
  })
})

ReactComp('errorDetailView', {
  impl: comp({
    hFunc: (ctx, {react: {h, hh}}) => () => h('div:p-3', {},
        h('div:mb-2 font-medium text-red-800', {}, 'Error:'),
        hh(ctx, codeMirrorJson, { json: ctx.data }),
    ),
    metadata: [
      abbr('ERR'),
      matchData(jq('$top | .. | .error?')),
      priority(0)
    ]
  })
})

ReactComp('claude', {
  impl: comp({
    hFunc: (ctx, { claudeDir, react: { h, useRef, useEffect } }) =>
      ({ cmd = 'claude', args = [], env }) => {

        const host = useRef()
        const term = useRef()
        const run = useRef()
        const fitAddon = useRef()
        let es, resizeObserver

        useEffect(() => {
          ;(async () => {
            const [{ Terminal }, { FitAddon }] = await Promise.all([
              import('https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/+esm'),
              import('https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/+esm')
            ])
            const link = document.createElement('link')
            link.rel = 'stylesheet'
            link.href = 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.css'
            document.head.appendChild(link)

            term.current = new Terminal({ cursorBlink: true, fontSize: 12 })
            fitAddon.current = new FitAddon()
            term.current.loadAddon(fitAddon.current)
            term.current.open(host.current)
            fitAddon.current.fit()

            const cols = term.current.cols
            const rows = term.current.rows

            run.current = await fetch('/run-cli-stream', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ interactive: true, cmd, args, cwd: claudeDir, env, cols, rows })
            }).then(r => r.json())

            es = new EventSource(run.current.statusUrl)
            es.onmessage = e => {
              const msg = JSON.parse(e.data)
              if (msg.type == 'status') term.current.write(msg.text.text || msg.text)
              if (msg.type == 'done') es.close()
            }

            term.current.onData(d => {
              run.current && fetch(run.current.inputUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ d })
              })
            })

            resizeObserver = new ResizeObserver(() => {
              fitAddon.current?.fit()
              if (run.current && term.current) {
                fetch(run.current.resizeUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ cols: term.current.cols, rows: term.current.rows })
                })
              }
            })
            resizeObserver.observe(host.current)
          })()

          return () => {
            es?.close()
            resizeObserver?.disconnect()
            term.current?.dispose()
          }
        }, [])

        return h('div:h-full min-w-0', { ref: host })
      },
    metadata: [abbr('CLAUDE'), matchData('%$claudeDir%'), priority(5)]
  })
})

export function runPty({p, extractors = [], triggers = [], stopWhen = [], onAnsi }) {

  function stripAnsi(s) {
    return s.replace(/\u001b\[[0-9;]*[A-Za-z]/g,'').replace(/\u001b\][^\u0007]*\u0007/g,'')
  }

  let out = ''

  function stop() {
    // send ctrl-c a few times
  }

  function extract(e) {
    const a = out.indexOf(e.start)
    const b = out.indexOf(e.end)
    if (a == -1 || b == -1) return
    const r = out.slice(a, b + e.end.length)
    if (e.minLen && r.length < e.minLen) return
    if (e.ignore && r.includes(e.ignore)) return
    return r
  }

  function fire(t) {
    if (t._fired) return
    if (!t.when(out)) return
    t._fired = 1
    const seq = Array.isArray(t.send) ? t.send : [t.send]
    seq.forEach(d => p.write(d))
    if (t.reset) out = ''
  }

  return {
    write: function(d) { p.write(d) },
    stop,
    promise: new Promise((resolve) => {
      p.onData(d => {
        if (onAnsi) onAnsi('' + d)
        out += stripAnsi('' + d)

        triggers.forEach(fire)

        for (const e of extractors) {
          const r = extract(e)
          if (r) return stop(), resolve({ res: r, out })
        }

        for (const s of stopWhen)
          if (s.when(out))
            return stop(), resolve({ res: s.result ? s.result(out) : out, out })
      })
    })
  }
}
