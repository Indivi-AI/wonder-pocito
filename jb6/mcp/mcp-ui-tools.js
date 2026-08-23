import { dsls, coreUtils } from '@jb6/core'
import '@jb6/react'
import './mcp-utils.js'

const {
  tgp: { Component },
  common: { 
    data: { asIs }
  },
  react: { ReactComp,
    'react-comp': { comp }
  }
} = dsls

ReactComp('helloMcp', {
  moreTypes: 'tool<mcp>',
  impl: comp({
    hFunc: ({}, {text, react: {h}}) => ({}) => h('div', {}, text),
    enrichCtx: ctx => ctx.setVars({text: 'hello mcp'})
  })
})
