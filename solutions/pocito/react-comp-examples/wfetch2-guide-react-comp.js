import { dsls, jb } from '@jb6/core'
import '@jb6/react'
import '@wonder/db/db-drivers-s3-minio.js'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('wfetch2Guide', {
  params: [
    {id: 'roomWUrl', as: 'string', defaultValue: 'room:minio//pocito-wfetch2-guide'}
  ],
  impl: comp({
    hFunc: (ctx, {}, {roomWUrl}) => {
      const { h, useEffect, useState } = ctx.vars.react
      const url = roomWUrl.replace(/\/$/, '') + '/usersRW/react-comp-guides/items'
      return function Wfetch2Guide() {
        const [items, setItems] = useState()
        useEffect(() => { void (async () => {
          const response = await jb.wonderUtils.wfetch2(url, { method: 'GET' }, ctx)
          const value = response.ok ? await response.json() : []
          if (!response.ok) await jb.wonderUtils.wfetch2(url, { method: 'PUT', body: value }, ctx)
          setItems(value)
        })() }, [])
        if (!items) return h('div:p-4', {}, 'טוען…')
        const add = async () => {
          const next = [...items, { id: 'i' + Date.now().toString(36), name: 'פריט ' + (items.length + 1) }]
          setItems(next)
          await jb.wonderUtils.wfetch2(url, { method: 'PUT', body: next }, ctx)
        }
        return h('main:max-w-xl mx-auto mt-16 p-4 space-y-3', { dir: 'rtl' }, h('h1:font-bold', {}, 'wfetch2 · GET + PUT'),
          h('button:border rounded-lg px-3 py-2', { onClick: add }, 'הוספה'),
          items.map(item => h('div', { key: item.id, 'data-item-id': item.id }, item.name)))
      }
    }
  })
})
