import { dsls } from '@jb6/core'
import '@jb6/testing'
import '@jb6/common'

const { 
  tgp: { TgpType, Component},
  common: { Data },
    test: { Test }
} = dsls

const Control = TgpType('control','ui')
const Feature = TgpType('feature','ui')

// color type with coerce — converts strings to profiles at build time
const Color = TgpType('color', 'ui', {
  typescript: '{ r: number, g: number, b: number }',
  coerce: str => str.startsWith('#') ? hexColor(str) : namedColor(str)
})

const rgb = Color('rgb', {
  params: [{id: 'r', as: 'number'}, {id: 'g', as: 'number'}, {id: 'b', as: 'number'}],
  impl: (_ctx, {}, {r, g, b}) => ({ r, g, b })
})

const hexColor = Color('hexColor', {
  params: [{id: 'hex', as: 'string'}],
  impl: (_ctx, {}, {hex}) => {
    const h = hex.replace('#', '')
    return { r: parseInt(h.slice(0,2), 16), g: parseInt(h.slice(2,4), 16), b: parseInt(h.slice(4,6), 16) }
  }
})

const namedColor = Color('namedColor', {
  params: [{id: 'name', as: 'string'}],
  impl: (_ctx, {}, {name}) => {
    const colors = { red: {r:255,g:0,b:0}, green: {r:0,g:128,b:0}, blue: {r:0,g:0,b:255}, white: {r:255,g:255,b:255}, black: {r:0,g:0,b:0} }
    return colors[name] || { r: 0, g: 0, b: 0 }
  }
})

const colorBox = Component('colorBox', {
  params: [{id: 'color', type: 'color<ui>'}]
})
TgpType('action','ui')
TgpType('ui-action','test')
TgpType('jbm','jbm')

Component('group', {
  type: 'control<ui>',
  params: [
    {id: 'controls', type: 'control[]', mandatory: true, dynamic: true, composite: true},
    {id: 'title', as: 'string', dynamic: true, byName: true},
    {id: 'layout', type: 'layout'},
    {id: 'style', type: 'group-style', dynamic: true},
    {id: 'features', type: 'feature[]', dynamic: true}
  ]
})

Component('button', {
  type: 'control<ui>',
  params: [
    {id: 'title', as: 'ref', mandatory: true, templateValue: 'click me', dynamic: true},
    {id: 'action', type: 'action<common>', mandatory: true, dynamic: true},
    {id: 'style', type: 'button-style', dynamic: true},
    {id: 'raised', as: 'boolean', dynamic: true, type: 'boolean'},
    {id: 'disabledTillActionFinished', as: 'boolean', type: 'boolean'},
    {id: 'features', type: 'feature[]', dynamic: true}
  ]
})

Component('uiAct', {
  type: 'action<ui>',
  params: [
    {id: 'action'}
  ],
  impl: ''
})

const button2 = Component('button2', {
  type: 'control<ui>',
  params: [
    {id: 'action', type: 'action<ui>', mandatory: true, dynamic: true}
  ]
})

Control('checkActionCollision', {
  impl: button2()
})

Component('controlWithCondition', {
  type: 'control<ui>',
  macroByValue: true,
  params: [
    {id: 'condition', type: 'boolean', dynamic: true, mandatory: true, as: 'boolean'},
    {id: 'control', type: 'control', mandatory: true, dynamic: true, composite: true},
    {id: 'title', as: 'string'}
  ]
})

Component('text', {
  type: 'control<ui>',
  params: [
    {id: 'text', as: 'ref', mandatory: true, templateValue: 'my text', dynamic: true},
    {id: 'title', as: 'ref', dynamic: true},
    {id: 'style', type: 'text-style', dynamic: true},
    {id: 'features', type: 'feature[]', dynamic: true}
  ]
})

Component('html', {
  type: 'control<ui>',
  params: [
    {id: 'html', as: 'text', dynamic: true},
    {id: 'title', as: 'ref', dynamic: true},
    {id: 'style', type: 'html-style', dynamic: true},
    {id: 'features', type: 'feature[]', dynamic: true}
  ]
})

Component('uiTest', {
  type: 'test<test>',
  params: [
    {id: 'control', type: 'control<ui>', dynamic: true, mandatory: true},
    {id: 'expectedResult', type: 'boolean', dynamic: true, mandatory: true},
    {id: 'runBefore', type: 'action', dynamic: true},
    {id: 'uiAction', type: 'ui-action<test>', dynamic: true},
    {id: 'allowError', as: 'boolean', dynamic: true, type: 'boolean'},
    {id: 'timeout', as: 'number', defaultValue: 200},
    {id: 'cleanUp', type: 'action', dynamic: true},
    {id: 'expectedCounters', as: 'single'},
    {id: 'backEndJbm', type: 'jbm<jbm>'},
    {id: 'emulateFrontEnd', as: 'boolean', type: 'boolean'},
    {id: 'transactiveHeadless', as: 'boolean', type: 'boolean'},
    {id: 'browserSpy'}
  ]
})

Component('method', {
  type: 'feature<ui>',
  description: 'define backend event handler',
  params: [
    {id: 'id', as: 'string', mandatory: true, description: 'if using the pattern onXXHandler, or onKeyXXHandler automaticaly binds to UI event XX, assuming on-XX:true is defined at the template'},
    {id: 'action', type: 'action', mandatory: true, dynamic: true}
  ]
})

Component('id', {
  type: 'feature<ui>',
  description: 'adds id to html element',
  params: [
    {id: 'id', mandatory: true, as: 'string', dynamic: true}
  ]
})

// for testing action map
Component('singleParamByNameComp', {
  params: [
    {id: 'p1', as: 'boolean', type: 'boolean<common>', byName: true}
  ]
})

// Control('exmapleForProfile', {
//   impl: group({
//     controls: [
//       button('click me', runActionOnItem('', '')),
//       group(button('btn2', '')),
//       group(text('my text'), button('btn2', ''))
//     ],
//     title: 'group title'
//   })
// })