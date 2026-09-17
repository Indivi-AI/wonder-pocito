import { dsls } from '@jb6/core'

const { tgp: { TgpTypeModifier, CompField } } = dsls

CompField('permissionByPath', { impl: { $: 'comp-field<tgp>compField', type: 'string' } })
TgpTypeModifier('Lambda', { lambda: true, dsl: 'common', type: 'data' })
