import { dsls, coreUtils } from '@jb6/core'
import '@jb6/react'

const { 
  react: { ReactMetadata,
    'react-comp': { comp }
  }
} = dsls

ReactMetadata('abbr', {
  params: [
    {id: 'abbr', as: 'string'}
  ]
})

ReactMetadata('matchData', {
  params: [
    {id: 'matchData', dynamic: true}
  ]
})

ReactMetadata('priority', {
  params: [
    {id: 'priority', as: 'number'}
  ]
})
