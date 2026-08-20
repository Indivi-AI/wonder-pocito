import { dsls } from '@jb6/core'
import '@jb6/react'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

ReactComp('jsonFileImportGuide', {
  impl: comp({
    hFunc: (ctx, { react: { h, useState } }) => function JsonFileImportGuide() {
      const [items, setItems] = useState([])
      const importFiles = async event => {
        const values = await Promise.all([...event.target.files].map(async file => JSON.parse(await file.text())))
        const imported = values.flat().map((item, index) => ({
          ...item, id: item.id || 'i' + Date.now().toString(36) + index
        }))
        setItems(current => [...imported, ...current])
        event.target.value = ''
      }
      return h('main:max-w-xl mx-auto mt-16 p-4 space-y-3', { dir: 'rtl' }, h('h1:font-bold', {}, 'File import · JSON'),
        h('label:block rounded-lg border p-3', {}, 'ייבוא JSON',
          h('input:block mt-2', { type: 'file', multiple: true, accept: '.json,application/json', onChange: importFiles })),
        h('div', { 'data-import-count': items.length }, items.length + ' פריטים'),
        items.map(item => h('div', { key: item.id }, item.name || item.id)))
    }
  })
})
