import { dsls, jb } from '@jb6/core'
import '@jb6/react'
import '@wonder/db/db-drivers.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls
const { wfetch2 } = jb.wonderUtils

ReactComp('roomDataVerification', {
  impl: comp({
    enrichCtx: async ctx => ctx.setData(await (await wfetch2(`${ctx.vars.roomUrl}/data.json`, {}, ctx)).json()),
    hFunc: (ctx, { react: { h } }) => () => {
      const { title, message, storage, records } = ctx.data
      return h('main', { style: { fontFamily: 'system-ui', maxWidth: 720, margin: '48px auto', padding: 24 } },
        h('h1', {}, title), h('p', {}, message), h('h2', {}, storage),
        ...records.map(({ label, value }) => h('p', { key: label }, h('strong', {}, `${label}: `), value)))
    }
  })
})
