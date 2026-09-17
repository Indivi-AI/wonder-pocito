import { dsls, jb } from '@jb6/core'
import '@jb6/react'
import '@wonder/db/db-drivers.js'
import '@wonder/db/db-drivers-s3-minio.js'

const { common: { Data }, react: { ReactComp, 'react-comp': { comp } } } = dsls

Data('pocitoRoomJsonStore', {
  params: [
    {id: 'roomWUrl', as: 'string'},
    {id: 'assetPath', as: 'string'}
  ],
  impl: (ctx, {}, {roomWUrl, assetPath}) => {
    const url = roomWUrl.replace(/\/$/, '') + '/' + assetPath.replace(/^\//, '')
    return {
      load: async seed => {
        const response = await jb.wonderUtils.wfetch2(url, { method: 'GET' }, ctx)
        if (response.ok) return response.json()
        await jb.wonderUtils.wfetch2(url, { method: 'PUT', body: JSON.stringify(seed), headers: {'content-type': 'application/json'} }, ctx)
        return seed
      },
      save: value => jb.wonderUtils.wfetch2(url, { method: 'PUT', body: JSON.stringify(value), headers: {'content-type': 'application/json'} }, ctx)
    }
  }
})

Data('roomStateExampleSeed', {
  impl: () => ({ version: 1, items: [{ id: 'i1', name: 'פריט ראשון' }] })
})

ReactComp('roomStateExample', {
  params: [
    {id: 'roomWUrl', as: 'string', defaultValue: 'room:minio//pocito-room-state-example'}
  ],
  impl: comp({
    hFunc: (ctx, {}, {roomWUrl}) => {
      const { h, useEffect, useState } = ctx.vars.react
      const seed = dsls.common.data.roomStateExampleSeed.$run()
      const store = dsls.common.data.pocitoRoomJsonStore.$runWithCtx(ctx, {
        roomWUrl, assetPath: 'usersRW/react-comp-examples/items'
      })
      return function RoomStateExample() {
        const [repo, setRepo] = useState(), [name, setName] = useState('')
        useEffect(() => { void store.load(seed).then(setRepo) }, [])
        if (!repo) return h('div:p-6', {}, 'טוען…')
        const persist = async next => { setRepo(next); await store.save(next) }
        const add = () => name.trim() && (persist({ ...repo,
          items: [...repo.items, { id: 'i' + Date.now().toString(36), name: name.trim() }] }), setName(''))
        return h('main:max-w-xl mx-auto p-6 space-y-4', { dir: 'rtl' }, h('h1:text-xl font-bold', {}, 'מצב חדר'),
          h('div:flex gap-2', {}, h('input:flex-1 rounded-lg border px-3 py-2', {
            value: name, onInput: event => setName(event.target.value), placeholder: 'שם פריט'
          }), h('button:rounded-lg bg-emerald-800 text-white px-4', { onClick: add }, 'הוספה')),
          repo.items.map(item => h('div:flex gap-2', { key: item.id }, h('input:flex-1 rounded-lg border px-3 py-2', {
            defaultValue: item.name, onBlur: event => event.target.value !== item.name && persist({ ...repo,
              items: repo.items.map(current => current.id === item.id ? { ...current, name: event.target.value } : current) })
          }), h('button:rounded-lg border px-3', { onClick: () => persist({ ...repo,
            items: repo.items.filter(current => current.id !== item.id) }) }, 'מחיקה'))))
      }
    }
  })
})
