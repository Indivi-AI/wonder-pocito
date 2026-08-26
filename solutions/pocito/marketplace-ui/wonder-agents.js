import { dsls } from '@jb6/core'
import '@jb6/react'
import './wonder-platform.js'

const { react: { ReactComp, 'react-comp': { wonderPlatform } } } = dsls

ReactComp('wonderAgents', {
  impl: wonderPlatform({
    defaultView: 'agents',
    brand: 'Wonder Agents',
    brandTagline: 'ניהול סוכנים ארגוני',
    brandIcon: 'Bot',
    extraPrimaryNav: [['agents', 'Bot', 'סוכנים']]
  })
})
