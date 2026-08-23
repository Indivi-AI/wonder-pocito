import { dsls } from '@jb6/core'
import '@jb6/react'

const { tgp: { TgpType, Component } } = dsls

TgpType('visualized-data', 'react', {
  // passiveRes is {calc, showResult} (steps/result are dynamic:true, so running the profile only builds them).
  // probeExec activates it: calc(ctx) invokes those closures under the probe ctx, so inner steps
  // (e.g. ~steps~0~val) actually fire and get recorded, instead of an empty result.
  probeExec: (passiveRes, ctx) => passiveRes.calc(ctx)
})

Component('jbScript', {
  type: 'visualized-data<react>',
  params: [
    {id: 'setup', type: 'ctx-enricher<tgp>', dynamic: true, byName: true},
    {id: 'steps', type: 'ctx-enricher<tgp>', dynamic: true, byName: true},
    {id: 'result', type: 'data<common>', dynamic: true},
    {id: 'visualizeResult', type: 'react-comp<react>', dynamic: true}
  ],
  impl: (ctx, {}, { setup, steps, result, visualizeResult }) => {
    const enrich = cctx => { const afterSetup = setup(cctx) || cctx; return steps(afterSetup) || afterSetup }
    return {
      calc:       cctx => result(enrich(cctx)),
      showResult: cctx => visualizeResult({ data: result(enrich(cctx)) })
    }
  }
})
