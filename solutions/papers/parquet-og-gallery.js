import { dsls } from '@jb6/core'
import '@jb6/react'
import '@wonder/ui/applet.js'

const {
  react: { ReactComp, 'react-comp': { comp }, 'react-metadata': { applet } }
} = dsls

ReactComp('parquetOgGallery', {
  impl: comp({
    hFunc: (ctx, {react: {h}}) => () => h('main', {},
      h('style', {}, `*{box-sizing:border-box}body{margin:0;background:#f4f0e7;color:#25313a;font-family:system-ui,sans-serif}
        main{max-width:1240px;margin:auto;padding:40px 28px}h1{margin:0 0 8px;font:650 2rem/1.2 Georgia,serif}p{margin:0 0 32px;color:#667078}
        section{display:grid;gap:32px}.card{overflow:hidden;border:1px solid #ded7c8;border-radius:14px;background:#fff;box-shadow:0 8px 28px #392b1714}
        img{display:block;width:100%;height:auto}.label{display:flex;gap:12px;align-items:center;padding:14px 18px;font-weight:600}.number{color:#9a5d19}
        @media(max-width:650px){main{padding:24px 14px}h1{font-size:1.55rem}section{gap:20px}}`),
      h('h1', {}, 'Coffee × Parquet — OG candidates'),
      h('p', {}, 'Choose 1–6 for the WhatsApp preview.'),
      h('section', {}, ...[
        'Warm 3D columns', 'Flat editorial', 'Morning desk', 'Isometric Parquet', 'Coffee poured on Parquet', 'Parquet installer'
      ].map((label, i) => h('article:card', {},
        h('img', {src: `https://storage.googleapis.com/indiviai-wonder/aTeam/usersRO/papers/parquet-og-${i + 1}.png`, alt: label}),
        h('div:label', {}, h('span:number', {}, `${i + 1}.`), label))))
    ),
    metadata: applet({ title: 'Coffee × Parquet — image candidates', icon: 'Images', showMessageInput: false })
  })
})
