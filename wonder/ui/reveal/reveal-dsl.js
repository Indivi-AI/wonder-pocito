import { jb, dsls } from '@jb6/core'
import '@jb6/react'
import '../theme-dsl.js'

const { tgp: { TgpType }, theme: { theme: { theme } } } = dsls

const Deck = TgpType('deck', 'reveal', { typescript: '(props: object) => vdom' })
const Slide = TgpType('slide', 'reveal', {
  typescript: '{ title: string; subtitle?: string; [prop: string]: unknown }',
  defaultImpl: resolvedSlideCtx => (dynamicCtx, categories) =>
    jb.revealUtils.resolveSlideView(resolvedSlideCtx, dynamicCtx, categories)
})
const Comment = TgpType('comment', 'reveal', {
  typescript: '{ paramId: string; commentText: string; author: string; timestamp: string }'
})
const Column = TgpType('column', 'reveal', { typescript: '{ title: string; items: ColumnItem[] }' })
const ColumnItem = TgpType('column-item', 'reveal', { typescript: '{ text: string; href?: string; sub?: boolean }' })
const ListItem = TgpType('list-item', 'reveal', { typescript: '{ title: string; viz?: string; note?: string; muted?: boolean }' })
const Person = TgpType('person', 'reveal', { typescript: '{ name: string; role?: string; image?: string; tags?: string[] }' })
const Card = TgpType('card', 'reveal', {
  typescript: '{ title: string; value?: string; text?: string; footnote?: string; tags?: string[]; previousValue?: string; '
    + 'valueContext?: string; lookAndFeel?: string }'
})
const ShowcaseItem = TgpType('showcase-item', 'reveal', {
  typescript: '{ id: string; title: string; text?: string; details?: string[]; content?: ReactComp }'
})
const DiagramEntity = TgpType('diagram-entity', 'reveal')
const DiagramRelation = TgpType('diagram-relation', 'reveal')
const DiagramAnchor = TgpType('diagram-anchor', 'reveal')
const DiagramRoute = TgpType('diagram-route', 'reveal')
const DiagramPoint = TgpType('diagram-point', 'reveal')
const Box = TgpType('box', 'reveal', {
  typescript: '{ x: number; y: number; width: number | "auto"; height: number | "auto" }',
  coerce: value => box(value)
})
const Controls = TgpType('controls', 'reveal', { typescript: '{ navigation: boolean; progress: boolean; hash: boolean }' })
const DeckFeature = TgpType('deck-feature', 'reveal', { typescript: '(props: RevealDeckFeatureProps) => vdom' })
TgpType('live-editor', 'reveal', { moreTypes: 'deck-feature<reveal>', typescript: '(props: RevealDeckFeatureProps) => vdom' })

const controls = Controls('controls', {
  params: [
    {id: 'navigation', as: 'boolean', defaultValue: true, type: 'boolean<common>'},
    {id: 'progress', as: 'boolean', defaultValue: true, type: 'boolean<common>'},
    {id: 'hash', as: 'boolean', defaultValue: true, type: 'boolean<common>'}
  ]
})
Deck('deck', {
  params: [
    {id: 'slides', type: 'slide<reveal>[]', dynamic: true},
    {id: 'theme', type: 'theme<theme>', defaultValue: theme()},
    {id: 'controls', type: 'controls<reveal>', defaultValue: controls()},
    {id: 'features', type: 'deck-feature<reveal>[]', defaultValue: []},
    {id: 'metadata', type: 'react-metadata<react>[]', byName: true}
  ]
})
Comment('comment', {
  params: [
    {id: 'paramId', as: 'string'},
    {id: 'commentText', as: 'text'},
    {id: 'author', as: 'string'},
    {id: 'timestamp', as: 'string'}
  ]
})

Slide('coverSlide', {
  params: [
    {id: 'title', as: 'string', description: 'Supports inline **emphasis**.'},
    {id: 'subtitle', as: 'string'},
    {id: 'eyebrow', as: 'string'},
    {id: 'foot', as: 'string'},
    {id: 'comments', type: 'comment<reveal>[]'}
  ]
})
Slide('itemListSlide', {
  params: [
    {id: 'title', as: 'string', description: 'Supports inline **emphasis**.'},
    {id: 'subtitle', as: 'string'},
    {id: 'items', type: 'list-item<reveal>[]'},
    {id: 'comments', type: 'comment<reveal>[]'},
    {id: 'cssClass', as: 'string'}
  ]
})
Slide('columnsSlide', {
  params: [
    {id: 'title', as: 'string', description: 'Supports inline **emphasis**.'},
    {id: 'columns', type: 'column<reveal>[]'},
    {id: 'comments', type: 'comment<reveal>[]'},
    {id: 'cssClass', as: 'string'}
  ]
})
Slide('reactCompSlide', {
  params: [
    {id: 'title', as: 'string', description: 'Supports inline **emphasis**.'},
    {id: 'subtitle', as: 'string'},
    {id: 'content', type: 'react-comp<react>'},
    {id: 'comments', type: 'comment<reveal>[]'},
    {id: 'cssClass', as: 'string'}
  ]
})
Slide('teamSlide', {
  params: [
    {id: 'title', as: 'string', description: 'Supports inline **emphasis**.'},
    {id: 'eyebrow', as: 'string'},
    {id: 'people', type: 'person<reveal>[]'},
    {id: 'imageRoot', as: 'string'},
    {id: 'foot', as: 'string'},
    {id: 'comments', type: 'comment<reveal>[]'}
  ]
})
Slide('cardGridSlide', {
  params: [
    {id: 'title', as: 'string', description: 'Supports inline **emphasis**.'},
    {id: 'eyebrow', as: 'string'},
    {id: 'cards', type: 'card<reveal>[]'},
    {id: 'comments', type: 'comment<reveal>[]'},
    {id: 'lookAndFeel', as: 'string'}
  ]
})
Slide('showcaseSlide', {
  params: [
    {id: 'title', as: 'string', description: 'Supports inline **emphasis**.'},
    {id: 'eyebrow', as: 'string'},
    {id: 'subtitle', as: 'string'},
    {id: 'items', type: 'showcase-item<reveal>[]'},
    {id: 'comments', type: 'comment<reveal>[]'}
  ]
})
Slide('masterDetailsSlide', {
  params: [
    {id: 'title', as: 'string', description: 'Supports inline **emphasis**.'},
    {id: 'eyebrow', as: 'string'},
    {id: 'subtitle', as: 'string'},
    {id: 'details', type: 'slide<reveal>[]', dynamic: true},
    {id: 'comments', type: 'comment<reveal>[]'}
  ]
})
Slide('appSlide', {
  params: [
    {id: 'title', as: 'string'},
    {id: 'windowTitle', as: 'string'},
    {id: 'showWindowChrome', as: 'boolean', type: 'boolean<common>', defaultValue: true},
    {id: 'subtitle', as: 'string'},
    {id: 'highlights', type: 'data<common>[]'},
    {id: 'hint', as: 'string'},
    {id: 'app', type: 'react-comp<react>'},
    {id: 'comments', type: 'comment<reveal>[]'}
  ]
})
Slide('entityDiagramSlide', {
  params: [
    {id: 'title', as: 'string', description: 'Supports inline **emphasis**.'},
    {id: 'eyebrow', as: 'string'},
    {id: 'subtitle', as: 'string'},
    {id: 'entities', type: 'diagram-entity<reveal>[]'},
    {id: 'relations', type: 'diagram-relation<reveal>[]'},
    {id: 'viewBox', as: 'string', defaultValue: '0 0 1760 700'},
    {id: 'lookAndFeel', as: 'string', defaultValue: 'systemArchitecture'},
    {id: 'comments', type: 'comment<reveal>[]'}
  ]
})

Person('person', {
  params: [
    {id: 'name', as: 'string'},
    {id: 'role', as: 'string'},
    {id: 'image', as: 'string'},
    {id: 'tags', type: 'data<common>[]'}
  ]
})
Card('card', {
  params: [
    {id: 'title', as: 'string'},
    {id: 'value', as: 'string'},
    {id: 'text', as: 'string'},
    {id: 'footnote', as: 'string'},
    {id: 'tags', type: 'data<common>[]'},
    {id: 'previousValue', as: 'string'},
    {id: 'valueContext', as: 'string'},
    {id: 'lookAndFeel', as: 'string', options: 'message,metric,valueComparison', defaultValue: 'message'}
  ]
})
ShowcaseItem('showcaseItem', {
  params: [
    {id: 'id', as: 'string'},
    {id: 'title', as: 'string'},
    {id: 'text', as: 'string'},
    {id: 'details', type: 'data<common>[]'},
    {id: 'content', type: 'react-comp<react>'}
  ]
})
const box = Box('box', {
  params: [
    {id: 'value', as: 'string'}
  ],
  impl: ({}, {}, { value }) => Object.fromEntries(['x','y','width','height'].map((id, i) => {
    const part = value.split(',')[i]?.trim()
    return [id, i < 2 ? +(part || 0) : !part || part == 'auto' ? 'auto' : +part]
  }))
})
DiagramEntity('diagramEntity', {
  params: [
    {id: 'id', as: 'string'},
    {id: 'title', as: 'string'},
    {id: 'box', type: 'box<reveal>'},
    {id: 'subtitle', as: 'string'},
    {id: 'summary', type: 'data<common>[]'},
    {id: 'dark', as: 'boolean', type: 'boolean<common>'},
    {id: 'detail', type: 'slide<reveal>', dynamic: true}
  ],
  impl: ({}, {}, entity) => ({ ...entity, ...entity.box })
})
DiagramEntity('diagramGroup', {
  params: [
    {id: 'id', as: 'string'},
    {id: 'title', as: 'string'},
    {id: 'box', type: 'box<reveal>'},
    {id: 'accented', as: 'boolean', type: 'boolean<common>'},
    {id: 'detail', type: 'slide<reveal>', dynamic: true}
  ],
  impl: ({}, {}, entity) => ({ ...entity, ...entity.box, group: true })
})
DiagramAnchor('diagramAnchor', {
  params: [
    {id: 'entity', as: 'string'},
    {id: 'side', as: 'string', options: 'top,right,bottom,left', defaultValue: 'right'},
    {id: 'ratio', as: 'number', defaultValue: 0.5}
  ]
})

const straightRoute = DiagramRoute('straightRoute', {
  impl: () => ({ kind: 'straight' })
})
DiagramRoute('bezierRoute', {
  impl: () => ({ kind: 'bezier' })
})
DiagramRoute('orthogonalRoute', {
  params: [
    {id: 'points', type: 'diagram-point<reveal>[]'}
  ],
  impl: ({}, {}, route) => ({ ...route, kind: 'orthogonal' })
})
DiagramRoute('polylineRoute', {
  params: [
    {id: 'points', type: 'diagram-point<reveal>[]'}
  ],
  impl: ({}, {}, route) => ({ ...route, kind: 'polyline' })
})
DiagramPoint('diagramPoint', {
  params: [
    {id: 'x', as: 'number'},
    {id: 'y', as: 'number'}
  ]
})
DiagramRelation('diagramRelation', {
  params: [
    {id: 'id', as: 'string'},
    {id: 'from', type: 'diagram-anchor<reveal>'},
    {id: 'to', type: 'diagram-anchor<reveal>'},
    {id: 'route', type: 'diagram-route<reveal>', defaultValue: straightRoute()},
    {id: 'direction', as: 'string', options: 'forward,backward,both,none', defaultValue: 'forward'},
    {id: 'label', as: 'string'}
  ]
})
Column('column', {
  params: [
    {id: 'title', as: 'string'},
    {id: 'items', type: 'column-item<reveal>[]'}
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
