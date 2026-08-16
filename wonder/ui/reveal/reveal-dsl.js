import { dsls, coreUtils } from '@jb6/core'
import '@jb6/react/reveal.js'

const {
  tgp: { TgpType, 'ctx-enricher': { loadReveal } },
  common: { Data },
  react: { ReactComp, 'react-comp': { comp } }
} = dsls

const Deck = TgpType('deck', 'reveal', { typescript: '(props: object) => vdom' })
const Slide = TgpType('slide', 'reveal', { typescript: '{ title: string; subtitle?: string; [prop: string]: unknown }' })
const Comment = TgpType('comment', 'reveal', {
  typescript: '{ paramId: string; commentText: string; author: string; timestamp: string }'
})
const Column = TgpType('column', 'reveal', { typescript: '{ title: string; items: ColumnItem[] }' })
const ColumnItem = TgpType('column-item', 'reveal', { typescript: '{ text: string; href?: string; sub?: boolean }' })
const ListItem = TgpType('list-item', 'reveal', { typescript: '{ title: string; viz?: string; note?: string; muted?: boolean }' })
const Theme = TgpType('theme', 'reveal', {
  typescript: '{ name?: string; fonts?: RevealFont[]; palette?: RevealPalette; typography?: RevealTypography; logo?: RevealLogo; spacing?: RevealSpacing }'
})
const Font = TgpType('font', 'reveal', { typescript: '{ family: string; stylesheetUrl?: string; weights?: string; fallback?: string }' })
const Palette = TgpType('palette', 'reveal', { typescript: 'Record<string, string>' })
const TextStyle = TgpType('text-style', 'reveal', {
  typescript: '{ family?: string; size?: number; weight?: number; lineHeight?: number; letterSpacing?: string }'
})
const Typography = TgpType('typography', 'reveal', { typescript: 'Record<string, RevealTextStyle>' })
const Logo = TgpType('logo', 'reveal', { typescript: '{ src?: string; mark?: string; wordmark?: string; placement?: string; showOn?: string }' })
const Spacing = TgpType('spacing', 'reveal', { typescript: 'Record<string, number>' })
const Controls = TgpType('controls', 'reveal', {
  typescript: '{ navigation: boolean; progress: boolean; hash: boolean }'
})
const DeckFeature = TgpType('deck-feature', 'reveal', { typescript: '(props: RevealDeckFeatureProps) => vdom' })
const LiveEditor = TgpType('live-editor', 'reveal', {
  moreTypes: 'deck-feature<reveal>',
  typescript: '(props: RevealDeckFeatureProps) => vdom'
})

const theme = Theme('theme', {
  params: [
    {id: 'name', as: 'string', options: 'black,white,league,beige,sky,night,serif,simple,solarized,moon,dracula,blood'},
    {id: 'fonts', type: 'font<reveal>[]'},
    {id: 'palette', type: 'palette<reveal>'},
    {id: 'typography', type: 'typography<reveal>'},
    {id: 'logo', type: 'logo<reveal>'},
    {id: 'spacing', type: 'spacing<reveal>'},
    {id: 'cssClass', as: 'string'},
    {id: 'tailwindCss', as: 'text'}
  ]
})
Font('font', {
  params: [
    {id: 'family', as: 'string'},
    {id: 'stylesheetUrl', as: 'string'},
    {id: 'weights', as: 'string'},
    {id: 'fallback', as: 'string'}
  ]
})
Palette('palette', {
  params: [
    {id: 'background', as: 'string'},
    {id: 'surface', as: 'string'},
    {id: 'text', as: 'string'},
    {id: 'textSecondary', as: 'string'},
    {id: 'muted', as: 'string'},
    {id: 'border', as: 'string'},
    {id: 'accent', as: 'string'},
    {id: 'accentText', as: 'string'},
    {id: 'accentSoft', as: 'string'},
    {id: 'accentBorder', as: 'string'},
    {id: 'darkSurface', as: 'string'},
    {id: 'onDark', as: 'string'}
  ]
})
TextStyle('textStyle', {
  params: [
    {id: 'family', as: 'string'},
    {id: 'size', as: 'number'},
    {id: 'weight', as: 'number'},
    {id: 'lineHeight', as: 'number'},
    {id: 'letterSpacing', as: 'string'}
  ]
})
Typography('typography', {
  params: [
    {id: 'coverTitle', type: 'text-style<reveal>'},
    {id: 'title', type: 'text-style<reveal>'},
    {id: 'subtitle', type: 'text-style<reveal>'},
    {id: 'body', type: 'text-style<reveal>'},
    {id: 'eyebrow', type: 'text-style<reveal>'},
    {id: 'code', type: 'text-style<reveal>'}
  ]
})
Logo('logo', {
  params: [
    {id: 'src', as: 'string'},
    {id: 'mark', as: 'string'},
    {id: 'wordmark', as: 'string'},
    {id: 'placement', as: 'string', options: 'top-left,top-right,bottom-left,bottom-right'},
    {id: 'showOn', as: 'string', options: 'cover,content,all'}
  ]
})
Spacing('spacing', {
  params: [
    {id: 'slideTop', as: 'number'},
    {id: 'slideRight', as: 'number'},
    {id: 'slideBottom', as: 'number'},
    {id: 'slideLeft', as: 'number'},
    {id: 'sectionGap', as: 'number'},
    {id: 'gridGap', as: 'number'}
  ]
})
const controls = Controls('controls', {
  params: [
    {id: 'navigation', as: 'boolean', defaultValue: true, type: 'boolean<common>'},
    {id: 'progress', as: 'boolean', defaultValue: true, type: 'boolean<common>'},
    {id: 'hash', as: 'boolean', defaultValue: true, type: 'boolean<common>'}
  ]
})
const deck = Deck('deck', {
  params: [
    {id: 'slides', type: 'slide<reveal>[]', dynamic: true},
    {id: 'theme', type: 'theme<reveal>', defaultValue: theme()},
    {id: 'controls', type: 'controls<reveal>', defaultValue: controls()},
    {id: 'features', type: 'deck-feature<reveal>[]'},
    {id: 'metadata', type: 'react-metadata<react>[]', byName: true}
  ],
  impl: ({}, {}, deck) => deck
})
const comment = Comment('comment', {
  params: [
    {id: 'paramId', as: 'string'},
    {id: 'commentText', as: 'text'},
    {id: 'author', as: 'string'},
    {id: 'timestamp', as: 'string'}
  ],
  impl: ({}, {}, comment) => comment
})

Slide('coverSlide', {
  params: [
    {id: 'title', as: 'string'},
    {id: 'subtitle', as: 'string'},
    {id: 'comments', type: 'comment<reveal>[]'}
  ]
})

Slide('itemListSlide', {
  params: [
    {id: 'title', as: 'string'},
    {id: 'subtitle', as: 'string'},
    {id: 'items', type: 'list-item[]'},
    {id: 'comments', type: 'comment<reveal>[]'},
    {id: 'cssClass', as: 'string'}
  ]
})
Slide('columnsSlide', {
  params: [
    {id: 'title', as: 'string'},
    {id: 'columns', type: 'column[]'},
    {id: 'comments', type: 'comment<reveal>[]'},
    {id: 'cssClass', as: 'string'}
  ]
})
Slide('reactCompSlide', {
  params: [
    {id: 'title', as: 'string'},
    {id: 'subtitle', as: 'string'},
    {id: 'content', type: 'react-comp<react>'},
    {id: 'comments', type: 'comment<reveal>[]'},
    {id: 'cssClass', as: 'string'}
  ]
})

Column('column', {
  params: [
    {id: 'title', as: 'string'},
    {id: 'items', type: 'column-item[]'}
  ]
})
ColumnItem('item', {
  params: [
    {id: 'text', as: 'string'},
    {id: 'href', as: 'string'},
    {id: 'comments', type: 'comment<reveal>[]'}
  ]
})
ColumnItem('subItem', {
  params: [
    {id: 'text', as: 'string'},
    {id: 'comments', type: 'comment<reveal>[]'}
  ],
  impl: (ctx, {}, { text }) => ({ text, sub: true })
})

ListItem('textItem', {
  params: [
    {id: 'text', as: 'string'},
    {id: 'comments', type: 'comment<reveal>[]'}
  ]
})
ListItem('listItem', {
  params: [
    {id: 'title', as: 'string'},
    {id: 'description', as: 'string'},
    {id: 'comments', type: 'comment<reveal>[]'}
  ]
})

const deckSlideViewId = Data('deckSlideViewId', {
  description: 'best categorized ReactComp variant (e.g. columnsSlide.idf) for a slide kind, like finance3ReportViewId',
  params: [
    {id: 'kindId', as: 'string', mandatory: true}
  ],
  impl: (ctx, {}, { kindId }) => Object.entries(dsls.react['react-comp'])
    .filter(([id, cmp]) => cmp?.[coreUtils.asJbComp] && id.split('.')[0] == kindId && id.includes('.'))
    .map(([id]) => ({ id, parts: id.split('.').slice(1) }))
    .sort((a, b) => b.parts.filter(x => ctx.vars.categories?.[x]).length
      - a.parts.filter(x => ctx.vars.categories?.[x]).length || a.parts.length - b.parts.length)[0]?.id
})

ReactComp('deckViewer', {
  description: 'reveal deck over slide<reveal> profiles. views resolve per active categories: <slideKind>.<category> ReactComps + deckShell wrapper',
  params: [
    {id: 'deck', type: 'deck<reveal>'}
  ],
  impl: comp({
    hFunc: (ctx, { react: { cloneElement, h, useEffect, useRef, useState }, reveal }, { deck }) => () => {
      const { slides, controls, features, theme } = deck
      const host = useRef(), injectionViews = useRef(new Map()), loggedSlides = useRef(new Set()), loggedVisitors = useRef(new Set())
      const strongRefreshViews = useRef(false)
      const [, setRefresh] = useState(0), [activeSlideIndex, setActiveSlideIndex] = useState(0)
      const [editMode, setEditModeState] = useState(false)
      const refresh = strong => (strongRefreshViews.current ||= strong, setRefresh(x => x + 1))
      const setEditMode = editMode => {
        setEditModeState(editMode)
        ctx.vars.revealLogger?.info?.({ t: 'reveal.editModeChanged', editMode }, {}, { ctx })
      }
      useEffect(() => {
        const { deck, disconnect } = reveal.mount(host.current)
        const hashParts = location.hash.match(/^#\/(\d+)(?:\/(\d+))?/)
        const syncHash = ({ indexh, indexv }) => {
          if (!controls.hash) return
          history.replaceState(null, '', `#/${indexh}/${indexv}`)
          ctx.vars.revealLogger?.info?.({ t: 'reveal.hashChanged', indexh, indexv, hash: location.hash }, {}, { ctx })
        }
        deck.configure({ width: 1920, height: 1080, margin: 0, controls: controls.navigation, progress: controls.progress,
          transition: 'fade', center: false, scrollActivationWidth: null })
        controls.hash && deck.on('slidechanged', syncHash)
        deck.on('slidechanged', ({ indexh }) => setActiveSlideIndex(indexh))
        hashParts && deck.on('ready', () => deck.slide(+hashParts[1], +(hashParts[2] || 0)))
        deck.on('ready', () => ctx.vars.revealLogger?.info?.({ t: 'reveal.ready', slideCount: deck.getTotalSlides(), controls,
          slidesPath: slides.lexicalCtx.jbCtx.path, initialHash: location.hash }, {}, { ctx }))
        return () => (deck.off('slidechanged', syncHash), disconnect())
      }, [])
      const renderView = (view, props, strongRefresh) => {
        if (strongRefresh && view[coreUtils.asJbComp]) return ctx.vars.react.hhStrongRefresh(ctx, view, props)
        const native = view[coreUtils.asJbComp] ? view.$runWithCtx(ctx) : view
        return cloneElement(native(props), { jbid: native.jbid })
      }
      const visitors = features.flatMap(feature => (feature.visitors || []).map(visitor => ({ feature, visitor })))
      const visitVdom = ({ vdom, revealType, tgpPath, slidePath, slide }) => visitors
        .filter(({ visitor }) => visitor.revealType == revealType || visitor.revealType == 'reveal-comp<reveal>')
        .reduce((vdom, { visitor }) => {
          const logKey = `${revealType}:${tgpPath}`
          if (!loggedVisitors.current.has(logKey)) {
            loggedVisitors.current.add(logKey)
            ctx.vars.revealLogger?.info?.({ t: 'reveal.vdomVisited', revealType, tgpPath }, {}, { ctx })
          }
          return visitor.visit(ctx)({ vdom, tgpPath, slidePath, slide, editMode, refresh })
        }, vdom)
      const injected = injectArea => features.flatMap(feature => (feature.injections || [])
        .filter(injection => injection.injectArea == injectArea)
        .map((injection, i) => {
          if (!injectionViews.current.has(injection)) injectionViews.current.set(injection, injection.hFunc(ctx))
          return h(injectionViews.current.get(injection), { key: i, slides, activeSlideIndex, editMode, setEditMode, refresh })
        }))
      const viewOf = kind => dsls.react['react-comp'][ctx.run(deckSlideViewId(kind))]
      const strongRefresh = strongRefreshViews.current
      strongRefreshViews.current = false
      const sections = coreUtils.asArray(slides.profile).map((profile, i) => {
        const slideType = coreUtils.compIdOfProfile(profile), view = viewOf(slideType.split('>').pop()), slide = ctx.runInnerArg(slides, i)
        const tgpPath = `${slides.lexicalCtx.jbCtx.path}~${i}`
        if (!loggedSlides.current.has(tgpPath)) {
          loggedSlides.current.add(tgpPath)
          ctx.vars.revealLogger?.info?.({ t: 'reveal.slideViewResolved', tgpPath, slideType,
            viewId: view?.[coreUtils.asJbComp]?.id, slide }, {}, { ctx })
        }
        const visitSlideVdom = args => visitVdom({ ...args, slidePath: tgpPath, slide })
        return view && h('section', { key: i, className: ['slide', slideType.split('>').pop(), slide.cssClass].filter(Boolean).join(' '),
          'data-reveal-slide-type': slideType, 'data-label': slide.title },
          renderView(view, { slide, tgpPath, visitVdom: visitSlideVdom }, strongRefresh))
      })
      const revealTree = h('div:reveal', { ref: host }, h('div:slides', {}, ...sections))
      const layout = h('div:reveal-deck-layout', { className: theme.cssClass },
        h('style', { type: 'text/tailwindcss' }, theme.tailwindCss), h('style', {}, `.reveal-deck-layout{height:100%;position:relative}.reveal-stage{height:100%}
        .reveal-topRight{position:absolute;z-index:40;right:20px;top:18px}.reveal-bottomLeft{position:absolute;z-index:40;left:24px;bottom:24px}
        .reveal-bottomRight{position:absolute;z-index:40;right:24px;bottom:24px}
        .reveal-enter-edit{position:relative;display:grid;place-items:center;width:34px;height:34px;padding:0;border:1px solid #cbd5e1;border-radius:10px;
        background:#ffffffe6;color:#475569;opacity:.65;box-shadow:0 6px 18px #0f172a18}.reveal-enter-edit:hover{opacity:1}
        .reveal-enter-edit span,.reveal-action-label{position:absolute;top:calc(100% + 8px);right:0;display:block;padding:5px 8px;border-radius:7px;
        background:#0f172a;color:white;font:600 11px system-ui;white-space:nowrap;opacity:0;pointer-events:none;transform:translateY(-3px);transition:.15s}
        .reveal-enter-edit:hover span,.reveal-editor-bar button:hover .reveal-action-label{opacity:1;transform:none}
        .reveal-editor-bar{display:flex;gap:8px;padding:8px;border:1px solid #cbd5e1;
        border-radius:14px;background:#fffffff2;box-shadow:0 12px 35px #0f172a24}.reveal-editor-bar button{padding:8px 12px;border:1px solid #cbd5e1;
        border-radius:9px;background:white;font-weight:600}.reveal-editor-bar button{position:relative;display:grid;place-items:center;min-width:36px;height:36px}
        .reveal-editor-bar button[aria-disabled=true]{cursor:not-allowed;opacity:.35}
        .reveal-editor-bar .reveal-edit-source{padding:6px 9px;color:#475569;font-size:12px}[data-reveal-selected]{outline:3px solid #0ea5e9;
        outline-offset:7px}
        .reveal-template-menu{position:absolute;right:0;top:52px;display:grid;min-width:220px;padding:8px;
        border:1px solid #cbd5e1;border-radius:12px;background:white;box-shadow:0 16px 40px #0f172a2e}.reveal-save-indication{display:flex;align-items:center;
        gap:9px;max-width:760px;padding:10px 14px;border:1px solid #ffffff24;border-radius:999px;background:#0f172ae8;color:#f8fafc;font:600 13px/1.3 system-ui;
        box-shadow:0 12px 32px #02061745;backdrop-filter:blur(12px)}.reveal-save-dot{width:8px;height:8px;border-radius:50%;background:#4ade80;
        box-shadow:0 0 0 4px #4ade8024}[contenteditable=true]{outline:3px solid #0ea5e9;
        outline-offset:6px;cursor:text}[data-reveal-comments]{position:relative;outline:2px solid #f59e0b80;outline-offset:6px}
        [data-reveal-comments]:after{content:attr(data-reveal-comments);position:absolute;right:-16px;top:-16px;display:grid;place-items:center;width:24px;height:24px;
        border-radius:50%;background:#f59e0b;color:#451a03;font:800 12px/1 system-ui;box-shadow:0 5px 15px #92400e40}.reveal-source-dialog{position:fixed;
        z-index:100;right:20px;bottom:20px;display:grid;
        grid-template-rows:44px 1fr 52px;width:min(1100px,calc(100vw - 40px));height:68vh;overflow:hidden;border:1px solid #334155;border-radius:16px;
        background:#0b1220;
        box-shadow:0 28px 90px #02061799;color:#e2e8f0}.reveal-source-dialog header,.reveal-source-dialog footer{display:flex;align-items:center;gap:12px;
        padding:0 14px;background:#111827}.reveal-source-dialog header{cursor:move;border-bottom:1px solid #334155}.reveal-source-dialog header span{margin-left:auto;
        color:#64748b;font-size:12px}.reveal-source-dialog header button{display:grid;place-items:center;width:28px;height:28px;padding:0;border:0;
        border-radius:7px;background:transparent;color:#94a3b8;font:22px/1 system-ui}.reveal-source-dialog header button:hover{background:#1e293b;color:white}
        .reveal-source-editor{min-width:0;min-height:0;overflow:hidden}.reveal-source-editor .cm-scroller{overflow-x:hidden!important}
        .reveal-source-dialog footer{justify-content:flex-end;border-top:1px solid #334155}.reveal-source-dialog footer button{padding:7px 13px;border:1px solid #475569;
        border-radius:8px;background:#1e293b;color:#e2e8f0}.reveal-source-dialog footer .primary{border-color:#0284c7;background:#0284c7}
        .reveal-source-status{margin-right:auto;font:600 12px system-ui}.reveal-source-status.saving{color:#94a3b8}.reveal-source-status.success{color:#4ade80}
        .reveal-source-status.error{max-width:620px;overflow:hidden;color:#fb7185;text-overflow:ellipsis;white-space:nowrap}
        .reveal-comments-panel{width:min(360px,32vw);max-height:55vh;overflow:auto;border:1px solid #f59e0b55;border-radius:16px;background:#fffbebf2;
        box-shadow:0 20px 55px #78350f30;backdrop-filter:blur(12px);color:#451a03;font:14px/1.4 system-ui}.reveal-comments-panel>header{padding:11px 14px;
        }.reveal-comments-panel.empty{width:auto;overflow:visible;border:0;background:transparent;box-shadow:none;backdrop-filter:none}
        .reveal-add-comment{position:relative;display:grid;place-items:center;width:34px;height:34px;margin:10px 12px 12px auto;padding:0;
        border:1px solid #cbd5e1;border-radius:10px;background:#ffffffe6;color:#475569;opacity:.65;box-shadow:0 6px 18px #0f172a18}
        .reveal-comments-panel.empty .reveal-add-comment{margin:0}.reveal-add-comment:hover{opacity:1}
        .reveal-add-comment:hover .reveal-action-label{opacity:1;transform:none}.reveal-add-comment[aria-disabled=true]{cursor:not-allowed;opacity:.4}
        .reveal-comments-panel>header{
        border-bottom:1px solid #f59e0b40;font-weight:800}.reveal-comments-panel>header{display:flex;justify-content:space-between;align-items:center}
        .reveal-comments-panel>header button{width:26px;height:26px;border:0;border-radius:50%;background:#f59e0b;color:#451a03;font-size:20px}
        .reveal-comments-panel article{display:grid;gap:5px;padding:12px 14px;border-bottom:1px solid #f59e0b24}
        .reveal-comments-panel .new-comment{position:fixed;z-index:110;right:24px;bottom:70px;width:300px;padding:14px;border:1px solid #38bdf855;border-radius:14px;
        background:#fffffff5;box-shadow:0 20px 55px #0f172a40;color:#0f172a}.reveal-comments-panel .new-comment p{min-height:52px;padding:8px;
        border:1px solid #cbd5e1;border-radius:9px;background:white}
        .reveal-comments-panel article:last-child{border:0}.reveal-comments-panel article div{display:flex;justify-content:space-between;gap:12px}
        .reveal-comments-panel time,.reveal-comments-panel small{color:#92400e;font-size:11px}.reveal-comments-panel p{margin:0;color:#451a03}
        `), h('div:reveal-title', {}, ...injected('title')),
        h('div:reveal-menu', {}, ...injected('menu')), h('div:reveal-stage', {}, revealTree),
        ...['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].map(area =>
          h(`div:reveal-${area}`, {}, ...injected(area))), h('div:reveal-overlay', {}, ...injected('overlay')))
      const shell = viewOf('deckShell'), children = [layout]
      return shell ? renderView(shell, { children }) : h('main', {}, ...children)
    },
    enrichCtx: loadReveal('%$deck/theme/name%'),
    metadata: '%$deck/metadata%'
  })
})
