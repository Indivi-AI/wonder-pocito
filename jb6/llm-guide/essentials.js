import { dsls } from '@jb6/core'

const { tgp: { TgpType } } = dsls
const Doclet = TgpType('doclet', 'llm-guide')
const Booklet = TgpType('booklet', 'llm-guide')

Booklet('booklet', {
  params: [
    {id: 'doclets', as: 'string', description: 'comma delimited names of doclets', mandatory: true},
    {id: 'whenToUse', as: 'text'}
  ]
})
