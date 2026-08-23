import { jb, dsls } from '@jb6/core'
import '@jb6/lang-service/src/lang-service-parsing-utils.js'

const {
  react: { ReactComp,
    'react-comp': { comp },
  }
} = dsls

const { filePosOfPath } = jb.langServiceUtils

/*
example html for picker:
<div jbid=";react-comp&lt;react&gt;test.sampleContainer~impl" style="display: contents;"><div>container<div jbid=";react-comp&lt;react&gt;test.sampleContainer~impl~hFunc;react-comp&lt;react&gt;test.inContainer~impl" style="display: contents;"><div>hello</div></div></div></div>
*/
const JbPickBox = ReactComp('JbPickBox', {
  impl: comp({
    hFunc: (ctx, { react: { h, useEffect, useMemo, useRef, useState } }) => ({ enabled, attr = 'jbid', 
        zIndex = 2147483647, onStop, onPick, summarize }) => {
      const [rect, setRect] = useState(null)
      const [label, setLabel] = useState('')
      const [targetEl, setTargetEl] = useState(null)
      const [candidates, setCandidates] = useState([])
      const [pickIdx, setPickIdx] = useState(0)
      const [pickPos, setPickPos] = useState({ x: 0, y: 0 })

      const rafId = useRef(0)
      const lastMouse = useRef({ x: 0, y: 0 })
      const menuRef = useRef(null)

      const summarizeFn = useMemo(() => {
        if (summarize) return summarize

        return (id) => {
          const s = String(id || '')
          const parts = s.split(';').filter(Boolean)
          const last = parts[parts.length - 1] || s
          const m = last.match(/>([^~]+)/)
          const name = m ? m[1] : last
          return name.length > 80 ? name.slice(0, 77) + '…' : name
        }
      }, [summarize, attr])

      function isElement(x) {
        return x && x.nodeType === 1
      }

      function findAttrElement(startEl) {
        let el = startEl
        while (isElement(el)) {
          if (el.hasAttribute && el.hasAttribute(attr)) return el
          el = el.parentElement
        }
        return null
      }

      function resolveBoxElement(el) {
        if (!isElement(el)) return null

        const r0 = el.getBoundingClientRect()
        if (r0.width > 0 && r0.height > 0) return el

        const walker = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT)
        let cur = walker.currentNode
        while (cur) {
          const r = cur.getBoundingClientRect()
          if (r.width > 0 && r.height > 0) return cur
          cur = walker.nextNode()
        }

        return el
      }

      function collectCandidates(x, y) {
        const els = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [document.elementFromPoint(x, y)].filter(Boolean)
        const seenPath = new Set()
        const seenEl = new Set()
        const res = []
        for (const el0 of els) {
          let el = el0
          while (isElement(el)) {
            if (el.hasAttribute && el.hasAttribute(attr)) {
              if (!seenEl.has(el)) {
                seenEl.add(el)
                const raw = el.getAttribute(attr) || ''
                raw.split(';').filter(Boolean).forEach(tgpPath => {
                  if (seenPath.has(tgpPath)) return
                  seenPath.add(tgpPath)
                  const summary = String(summarizeFn(tgpPath, el) || '') || tgpPath
                  res.push({ el, tgpPath, summary })
                })
              }
            }
            el = el.parentElement
          }
        }
        return res
      }

      function setFromPoint(x, y) {
        const all = collectCandidates(x, y)
        setCandidates(all)
        setPickIdx(0)
        setPickPos({ x, y })
        const cand = all[0]
        const attrEl = cand?.el

        if (!attrEl) {
          setTargetEl(null)
          setRect(null)
          setLabel('')
          return
        }

        const boxEl = resolveBoxElement(attrEl)
        const r = boxEl && boxEl.getBoundingClientRect ? boxEl.getBoundingClientRect() : null

        if (!r || !(r.width > 0 && r.height > 0)) {
          setTargetEl(null)
          setRect(null)
          setLabel('')
          return
        }

        setTargetEl(attrEl)
        setRect({ left: r.left, top: r.top, width: r.width, height: r.height })
        setLabel(cand?.summary || '')
      }

      function pick(i) {
        const cand = candidates[i] || candidates[0]
        cand?.el && onPick(cand.el, { id: cand.tgpPath, tgpPath: cand.tgpPath, summary: cand.summary })
      }

      function movePick(delta) {
        if (candidates.length < 2) return
        setPickIdx(i => {
          const n = (i + delta + candidates.length) % candidates.length
          requestAnimationFrame(() =>
            menuRef.current?.querySelector?.(`[data-jb-pick-item="${n}"]`)?.scrollIntoView?.({ block: 'nearest' })
          )
          return n
        })
      }

      function scheduleUpdate(x, y) {
        lastMouse.current = { x, y }
        if (rafId.current) cancelAnimationFrame(rafId.current)
        rafId.current = requestAnimationFrame(() => {
          setFromPoint(lastMouse.current.x, lastMouse.current.y)
        })
      }

      useEffect(() => {
        if (!enabled) {
          setTargetEl(null)
          setRect(null)
          setLabel('')
          return
        }

        function onMove(e) {
          scheduleUpdate(e.clientX, e.clientY)
        }

        function onClickCapture(e) {
          if (e.target?.closest?.('[data-jb-pick-menu]')) return
          if (!candidates.length) return

          e.preventDefault()
          e.stopPropagation()

          pick(pickIdx)
        }

        function onKeyDown(e) {
          if (e.key === 'Escape') onStop()
          if (e.key === 'Enter') return pick(pickIdx)
          if (e.key === 'ArrowDown') return (e.preventDefault(), movePick(1))
          if (e.key === 'ArrowUp') return (e.preventDefault(), movePick(-1))
          const n = e.key?.match(/^[1-9]$/) ? Number(e.key) - 1 : -1
          if (n >= 0 && n < candidates.length) return (e.preventDefault(), pick(n))
        }

        function onWheel(e) {
          if (!candidates.length) return
          e.preventDefault()
          movePick(e.deltaY > 0 ? 1 : -1)
        }

        function onScrollOrResize() {
          if (!targetEl) return
          const boxEl = resolveBoxElement(targetEl)
          const r = boxEl && boxEl.getBoundingClientRect ? boxEl.getBoundingClientRect() : null
          if (!r || !(r.width > 0 && r.height > 0)) return
          setRect({ left: r.left, top: r.top, width: r.width, height: r.height })
        }

        window.addEventListener('mousemove', onMove, true)
        window.addEventListener('click', onClickCapture, true)
        window.addEventListener('keydown', onKeyDown, true)
        window.addEventListener('wheel', onWheel, { capture: true, passive: false })
        window.addEventListener('scroll', onScrollOrResize, true)
        window.addEventListener('resize', onScrollOrResize, true)

        document.documentElement.classList.add('cursor-crosshair')

        return () => {
          if (rafId.current) cancelAnimationFrame(rafId.current)
          window.removeEventListener('mousemove', onMove, true)
          window.removeEventListener('click', onClickCapture, true)
          window.removeEventListener('keydown', onKeyDown, true)
          window.removeEventListener('wheel', onWheel, true)
          window.removeEventListener('scroll', onScrollOrResize, true)
          window.removeEventListener('resize', onScrollOrResize, true)

          document.documentElement.classList.remove('cursor-crosshair')
        }
      }, [enabled, attr, onStop, onPick, summarizeFn, targetEl, candidates, pickIdx])

      if (!enabled || !rect) return null

      const margin = 8
      const tipMaxWidth = 360
      const tipTopPreferred = rect.top - 28
      const tipTop = tipTopPreferred < margin ? rect.top + rect.height + 6 : tipTopPreferred
      const tipLeft = Math.max(margin, Math.min(rect.left, window.innerWidth - margin - tipMaxWidth))

      return h('div:fixed inset-0 pointer-events-none', { style: { zIndex } },
        h('div:fixed pointer-events-none border-2 border-sky-500/95 rounded bg-sky-500/10 box-border', {
          style: {
            left: Math.round(rect.left) + 'px',
            top: Math.round(rect.top) + 'px',
            width: Math.round(rect.width) + 'px',
            height: Math.round(rect.height) + 'px'
          }
        }),
        h('div:fixed pointer-events-none px-2 py-1.5 rounded-md border border-white/15 bg-black/85 text-white text-xs font-mono max-w-[360px] whitespace-nowrap overflow-hidden text-ellipsis shadow-lg', {
          style: {
            left: Math.round(tipLeft) + 'px',
            top: Math.round(tipTop) + 'px'
          }
        }, label)
        ,
        candidates.length > 1 && h('div:fixed pointer-events-auto rounded-md border border-white/15 bg-black/85 text-white text-xs font-mono shadow-lg', {
          ref: menuRef,
          'data-jb-pick-menu': '1',
          style: {
            left: Math.min(window.innerWidth - 240, Math.max(margin, pickPos.x + 10)) + 'px',
            top: Math.min(window.innerHeight - 200, Math.max(margin, pickPos.y + 10)) + 'px',
            width: '240px',
            maxHeight: '200px',
            overflow: 'auto',
          }
        },
          candidates.map((c, i) => h('div:px-2 py-1 cursor-pointer', {
            key: c.tgpPath,
            'data-jb-pick-item': String(i),
            className: i === pickIdx ? 'bg-white/50' : '',
            onMouseEnter: () => setPickIdx(i),
            onMouseDown: (e) => {
              e.preventDefault()
              e.stopPropagation()
              pick(i)
            }
          }, `${i + 1}. ${c.summary}`))
        )
      )
    }
  })
})


ReactComp('JbPickerStarter', {
  impl: comp({
    hFunc: (ctx, { react: { h, useEffect, useState, L, hh } }) => () => {
      const [enabled, setEnabled] = useState(false)

      useEffect(() => {
        function onKeyDown(e) {
          const isAltN = e.altKey && (e.key === 'n' || e.key === 'N')
          if (isAltN) {
            e.preventDefault()
            setEnabled(v => !v)
          }
          if (e.key === 'Escape') {
            setEnabled(false)
          }
        }

        window.addEventListener('keydown', onKeyDown, true)
        return () => window.removeEventListener('keydown', onKeyDown, true)
      }, [])

      return h('div:relative', {},
        hh(ctx, JbPickBox, {
          enabled,
          attr: 'jbid',
          onStop: () => setEnabled(false),
          onPick: (el, info) => {
            const full = String(info?.id || '')
            const tgpPath = full.split(';').filter(Boolean).slice(-1)[0] || ''
            const pos = tgpPath && filePosOfPath(tgpPath, { tgpModel: jb })
            if (pos?.path) {
              const filePos = `.${pos.path}:${pos.line}:${pos.col ?? 0}`
              fetch(`/gotoSource?filePos=${encodeURIComponent(filePos)}`)
            } else {
              console.log('Picked jbid:', info?.id)
              console.log('Element:', el)
            }
            setEnabled(false)
          }
        }),

        h('button:fixed top-3 right-3 z-[2147483647] pointer-events-auto inline-flex items-center gap-2 px-3 py-2 rounded-md border bg-white shadow hover:bg-gray-50 active:bg-gray-100', {
          title: 'Pick element (Alt+N)',
          onClick: () => setEnabled(v => !v)
        },
          h('span:inline-flex items-center justify-center w-5 h-5', {},
            h(L('MousePointerClick'), { size: 18 })
          ),
          h('span:text-xs font-medium text-gray-700', {}, enabled ? 'Picking' : 'Pick')
        )
      )
    }
  })
})
