import {dsls, jb, coreUtils} from '@jb6/core'
import jq from './lib/jqjs.js'

const {
    common: { Data }
} = dsls

jb.jQRepository = {}

coreUtils.jbjq = (script, ctx) => {
    const compiledJq = (jb.jQRepository[script] = jb.jQRepository[script] || jq.compileJb(script))
    return Array.from(compiledJq(ctx))[0]
}
coreUtils.jq = jq

coreUtils.compileJb = jq.compileJb

Data('jq', {
  moreTypes: 'boolean<common>',
  params: [
    {id: 'script', as: 'text', asIs: true},
    {id: 'first', as: 'boolean', byName: true}
  ],
  impl: (ctx, {}, {script, first}) => {
    const complied = ctx.jbCtx.compiledJq = ctx.jbCtx.compiledJq || jq.compileJb(script)
    const parentParam = ctx.jbCtx.parentParam
    const single = first || parentParam?.$dslType == 'boolean<common>' || ['string','text','number','boolean'].indexOf(parentParam?.as) != -1
    return single ? complied(ctx).next().value : Array.from(complied(ctx))
  }
})


