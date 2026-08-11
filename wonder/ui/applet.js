import { dsls, ns } from '@jb6/core'
import '@jb6/react'

const {
  tgp: { Component },
} = dsls

Component('applet', {
  type: 'react-metadata<react>',
  params: [
    {id: 'title', as: 'string', byName: true},
    {id: 'icon', as: 'string'},
    {id: 'showMessageInput', as: 'boolean'},
    {id: 'showOnMainPageMenu', as: 'boolean'}
  ]
})

