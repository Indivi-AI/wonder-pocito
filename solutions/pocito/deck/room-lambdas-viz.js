import { dsls } from '@jb6/core'
import '@jb6/react'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('pocitoRoomLambdasViz', {
  impl: comp({
    hFunc: (ctx, { react: { h } }) => () => h('div:iv', {}, h('div:iv-title', {}, 'Room Lambdas'),
      h('div:iv-line', {}, 'Backend function execution with room permissions'),
      h('div:iv-line', {}, 'Can be used by agents, apps, cli - via CURL and MCP'))
  })
})
