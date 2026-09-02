import { dsls } from '@jb6/core'
import '@jb6/react'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('pocitoOnPremTestApplet', {
  impl: comp({ hFunc: ({}, {react: {h}}) => () => h('main', {}, 'Pocito on-prem applet loaded') })
})
