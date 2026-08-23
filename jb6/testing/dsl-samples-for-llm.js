// === CSS DSL === showing TGP pattern with well-known CSS types

import { dsls } from '@jb6/core'
const { tgp: { TgpType, Component } } = dsls

// TgpTypes - abstract categories from CSS spec
const Color = TgpType('color', 'css')
const Length = TgpType('length', 'css')
const Gradient = TgpType('gradient', 'css')

// Components - generic definitions with typed params
Component('rgb', {
  type: 'color<css>',
  params: [
    {id: 'r', as: 'number', mandatory: true},
    {id: 'g', as: 'number', mandatory: true},
    {id: 'b', as: 'number', mandatory: true}
  ]
})

Component('hsl', {
  type: 'color<css>',
  params: [
    {id: 'h', as: 'number', mandatory: true},
    {id: 's', as: 'number', mandatory: true},
    {id: 'l', as: 'number', mandatory: true}
  ]
})

Component('px', {
  type: 'length<css>',
  params: [{id: 'val', as: 'number', mandatory: true, byName: true}]
})

Component('linearGradient', {
  type: 'gradient<css>',
  params: [
    {id: 'direction', as: 'string', mandatory: true},
    {id: 'stops', type: 'color<css>[]', mandatory: true}
  ]
})

// Profile - concrete instance. Composition: gradient -> color[]
const sunset = {$ : 'gradient<css>linearGradient', direction: 'to right', stops: [ {$ : 'color<css>rgb', r: 255, g: 99, b: 71}, {$ : 'color<css>hsl', h: 45, s: 100, l: 50} ] }

// === SQL DSL === showing the same TGP pattern in a completely different domain

// TgpTypes - abstract categories from SQL
const Expr = TgpType('expr', 'sql')
const Condition = TgpType('condition', 'sql')
const Source = TgpType('source', 'sql')

// Components
Component('column', {
  type: 'expr<sql>',
  params: [
    {id: 'name', as: 'string', mandatory: true, byName: true},
    {id: 'table', as: 'string'}
  ]
})

Component('count', {
  type: 'expr<sql>',
  params: [{id: 'expr', type: 'expr<sql>'}]
})

Component('sum', {
  type: 'expr<sql>',
  params: [{id: 'expr', type: 'expr<sql>', mandatory: true}]
})

Component('gt', {
  type: 'condition<sql>',
  params: [
    {id: 'left', type: 'expr<sql>', mandatory: true},
    {id: 'right', type: 'expr<sql>', mandatory: true}
  ]
})

Component('and', {
  type: 'condition<sql>',
  params: [{id: 'conditions', type: 'condition<sql>[]', mandatory: true}]
})

Component('table', {
  type: 'source<sql>',
  params: [{id: 'name', as: 'string', mandatory: true, byName: true}]
})

Component('select', {
  type: 'source<sql>',
  params: [
    {id: 'from', type: 'source<sql>', mandatory: true},
    {id: 'columns', type: 'expr<sql>[]', mandatory: true},
    {id: 'where', type: 'condition<sql>'}
  ]
})

/*
// TGP: TgpType (abstract type), Component (generic def), Profile (concrete JSON instance)
TgpType('color', 'css')

Component('rgb', { type: 'color<css>', params: [{id: 'r', as: 'number'}, {id: 'g', as: 'number'}, {id: 'b', as: 'number'}] })
Component('hsl', { type: 'color<css>', ... })

TgpType('gradient', 'css')
Component('linearGradient', { type: 'gradient<css>', params: [{id: 'direction', as: 'string'}, {id: 'stops', type: 'color<css>[]'}] })
Component('radialGradient', { type: 'gradient<css>', ... })
...

// Profile: linear-gradient(to right, rgb(255,99,71), hsl(45,100,50))
{$: 'gradient<css>linearGradient', direction: 'to right', stops: [{$: 'color<css>rgb', r: 255, g: 99, b: 71}, {$: 'color<css>hsl', h: 45, s: 100, l: 50}]}

// Profile from antoher domain (guess the TgpTypes and Components) - SELECT count(*), sum(amount) FROM orders WHERE amount > 100
const bigOrders = {$ : 'source<sql>select', from: {$ : 'source<sql>table', name: 'orders'}, columns: [ 
  {$ : 'expr<sql>count'}, 
  {$ : 'expr<sql>sum', expr: {$ : 'expr<sql>column', name: 'amount'}} 
], where: {$ : 'condition<sql>gt', left: {$ : 'expr<sql>column', name: 'amount'}, right: 100} }
*/