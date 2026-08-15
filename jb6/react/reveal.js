import { dsls } from '@jb6/core'
import { reactUtils } from '@jb6/react'

const { tgp: { CtxEnricher } } = dsls

const REVEAL_VERSION = '5.2.1'
const cdn = path => `https://cdn.jsdelivr.net/npm/reveal.js@${REVEAL_VERSION}/dist/${path}`

CtxEnricher('loadReveal', {
  params: [
    {id: 'theme', as: 'string', options: 'black,white,league,beige,sky,night,serif,simple,solarized,moon,dracula,blood', description: 'theme name; empty uses bundled black theme'}
  ],
  impl: async (ctx, {}, {theme}) => {
    const { Reveal, css } = await reactUtils.loadReveal()
    const styleText = theme
      ? await Promise.all([cdn('reveal.css'), cdn(`theme/${theme}.css`)].map(u => fetch(u).then(r => r.text()))).then(parts => parts.join('\n'))
      : css
    if (!document.getElementById('reveal-css'))
      document.head.appendChild(Object.assign(document.createElement('style'), { id: 'reveal-css', textContent: styleText }))
    const mount = (hostEl, options) => {
      const deck = new Reveal(hostEl, { embedded: true, ...options })
      deck.initialize()
      const resizeObserver = globalThis.ResizeObserver && new ResizeObserver(() => requestAnimationFrame(() => deck.layout()))
      resizeObserver?.observe(hostEl)

      const decorate = () => deck.sync()
      const slidesEl = hostEl.querySelector('.slides')
      let scheduled = false, decorating = false, n = 0
      const isSlideBoundary = t => t === slidesEl || (t?.nodeName === 'SECTION' && t.parentNode === slidesEl)
      const observer = new MutationObserver(muts => {
        if (decorating) return
        const structural = muts.some(m => m.type === 'childList' && isSlideBoundary(m.target) &&
          [...m.addedNodes, ...m.removedNodes].some(n => n.nodeName === 'SECTION'))
        if (!structural || scheduled) return
        scheduled = true
        requestAnimationFrame(() => {
          scheduled = false; decorating = true
          ;(ctx.vars.revealLogger || ctx.vars.uiLogger)?.info?.({ t: 'reveal.slidesSynced', syncCount: ++n,
            slideCount: deck.getTotalSlides() }, {}, { ctx })
          decorate()
          requestAnimationFrame(() => { decorating = false })
        })
      })
      observer.observe(slidesEl, { childList: true, subtree: true })

      const disconnect = () => { observer.disconnect(); resizeObserver?.disconnect(); deck.destroy() }
      return { deck, decorate, disconnect }
    }
    return ctx.setVars({ reveal: { mount } })
  }
})
