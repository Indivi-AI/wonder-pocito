import { dsls } from '@jb6/core'
import '@jb6/react'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

const LINES = [
  'Drop a file and have a live agent',
  'Can also support python agents',
  'Agents can be run in any way possible',
  'Wonder Agents can also run in the frontend for easy embedding in other applications'
]

ReactComp('pocitoAgentsViz', {
  impl: comp({
    hFunc: (ctx, { react: { h } }) => () => h('div:iv', {}, h('div:iv-title', {}, 'Agents'),
      ...LINES.map(text => h('div:iv-line', { key: text }, text)))
  })
})
