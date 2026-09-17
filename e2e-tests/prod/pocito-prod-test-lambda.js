import { dsls, jb, coreUtils } from '@jb6/core'
import '@jb6/core/misc/jb-cli.js'
import '@wonder/db/room-lambda-client.js'

const { common: { Data } } = dsls

Data('pocitoProdTestLambda', {
  params: [
    {id: 'marker', as: 'string'},
    {id: 'delayMs', as: 'number', defaultValue: 0},
    {id: 'callback', as: 'boolean', type: 'boolean<common>'}
  ],
  impl: async (ctx, {roomLogger, roomWUrl, noAuth}, {marker, delayMs, callback}) => {
    await coreUtils.runBashScript(`sleep ${delayMs / 1000} & wait`, {
      onStart: () => roomLogger.progress({marker, pid: process.pid})})
    const nested = callback && await (await jb.wonderUtils.wfetch2(`${roomWUrl}/lambdas/pocitoProdTestLambda`, {
      method: 'POST', body: {profile: {$: 'data<common>pocitoProdTestLambda', marker: 'nested'}}
    }, ctx)).json()
    return {marker, pid: process.pid, cwd: process.cwd(), noAuth, nested}
  }
})
