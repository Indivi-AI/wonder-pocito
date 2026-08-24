import { dsls, coreUtils } from '@jb6/core'
import '@jb6/react'
import '@jb6/react/reveal.js'

const {
  tgp: { TgpType, 'ctx-enricher': { loadReveal } },
  common: { Data },
  react: { ReactComp, 'react-comp': { comp } }
} = dsls

const Deck = TgpType('deck', 'deck')
const Slide = TgpType('slide', 'deck')
const Column = TgpType('column', 'deck')
const ColumnItem = TgpType('column-item', 'deck')
const ListItem = TgpType('list-item', 'deck')

Slide('coverSlide', { params: [{ id: 'title', as: 'string' }, { id: 'subtitle', as: 'string' }] })
Slide('titleSlide', { params: [{ id: 'title', as: 'string' }] })
Slide('columnsSlide', { params: [{ id: 'title', as: 'string' }, { id: 'columns', type: 'column[]' }] })
Slide('codeSlide', {
  params: [
    { id: 'title', as: 'string' },
    { id: 'subtitle', as: 'string' },
    { id: 'file', as: 'string', description: 'source path shown as the code window chrome title' },
    { id: 'compId', as: 'string', description: 'full comp id whose pretty-printed source is the slide body' }
  ]
})
Slide('listDetailSlide', { params: [{ id: 'title', as: 'string' }, { id: 'items', type: 'list-item[]' }] })
Slide('vizSlide', {
  params: [
    { id: 'title', as: 'string' },
    { id: 'subtitle', as: 'string' },
    { id: 'viz', as: 'string', description: 'react-comp id rendered as the full slide body' }
  ]
})

Column('column', { params: [{ id: 'title', as: 'string' }, { id: 'items', type: 'column-item[]' }] })
ColumnItem('item', { params: [{ id: 'text', as: 'string' }, { id: 'href', as: 'string' }] })
ColumnItem('subItem', { params: [{ id: 'text', as: 'string' }], impl: (ctx, {}, { text }) => ({ text, sub: true }) })
ListItem('listItem', {
  params: [
    { id: 'title', as: 'string' },
    { id: 'viz', as: 'string', description: 'react-comp id rendered in the detail box when the item is selected' },
    { id: 'note', as: 'string' },
    { id: 'muted', as: 'boolean' }
  ]
})

const deckSlideViewId = Data('deckSlideViewId', {
  description: 'best categorized ReactComp variant (e.g. columnsSlide.pocito) for a slide kind, like finance3ReportViewId',
  params: [{ id: 'kindId', as: 'string', mandatory: true }],
  impl: (ctx, {}, { kindId }) => Object.entries(dsls.react['react-comp'])
    .filter(([id, cmp]) => cmp?.[coreUtils.asJbComp] && id.split('.')[0] == kindId && id.includes('.'))
    .map(([id]) => ({ id, parts: id.split('.').slice(1) }))
    .sort((a, b) => b.parts.filter(x => ctx.vars.categories?.[x]).length
      - a.parts.filter(x => ctx.vars.categories?.[x]).length || a.parts.length - b.parts.length)[0]?.id
})

ReactComp('deckPlayer', {
  description: 'reveal deck over slide<deck> profiles. views resolve per active categories: <slideKind>.<category> ReactComps + deckShell wrapper',
  params: [
    { id: 'slides', type: 'slide<deck>[]', dynamic: true, composite: true },
    { id: 'metadata', type: 'react-metadata<react>[]', byName: true }
  ],
  impl: comp({
    hFunc: (ctx, { react: { h, hh, useEffect, useRef, useState }, reveal }, { slides }) => () => {
      const host = useRef()
      const [, refresh] = useState(0)
      useEffect(() => {
        const { deck, disconnect } = reveal.mount(host.current)
        const profileChanged = () => refresh(x => x + 1)
        window.addEventListener('deckProfileChanged', profileChanged)
        deck.configure({ width: 1920, height: 1080, margin: 0, controls: true, progress: true, transition: 'fade', center: false, scrollActivationWidth: null })
        deck.on('ready', () => ctx.vars.uiLogger?.info?.({ t: 'deckPlayer.ready', slides: deck.getTotalSlides() }, {}, { ctx }))
        return () => (window.removeEventListener('deckProfileChanged', profileChanged), disconnect())
      }, [])
      const viewOf = kind => dsls.react['react-comp'][ctx.run(deckSlideViewId(kind))]
      const sections = coreUtils.asArray(slides.profile).map((profile, i) => {
        const view = viewOf(coreUtils.compIdOfProfile(profile).split('>').pop()), slide = ctx.runInnerArg(slides, i)
        return view && h('section', { key: i, 'data-label': slide.title }, hh(ctx, view, { slide }))
      })
      const shell = viewOf('deckShell'), revealTree = h('div:reveal', { ref: host }, h('div:slides', {}, ...sections))
      return shell ? hh(ctx, shell, { children: revealTree }) : h('main', {}, revealTree)
    },
    enrichCtx: loadReveal(),
    metadata: '%$metadata%'
  })
})
