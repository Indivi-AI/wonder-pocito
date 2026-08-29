import { jb, dsls } from '@jb6/core'
import '@jb6/react'
import '@wonder/ui/applet.js'
import '@wonder/db/db-drivers.js'

const { react: { ReactComp, 'react-comp': { comp }, 'react-metadata': { applet, importUrl } } } = dsls

ReactComp('parquetScanTiers', {
  impl: comp({
    hFunc: (ctx, {react: {h, imported, useEffect, useState}}) => () => {
      const [html, setHtml] = useState(''), [error, setError] = useState('')
      useEffect(() => {
        let active = true
        jb.wonderUtils.wfetch2('room://aTeam/usersRO/papers/parquet-scan-tiers.md', {method: 'GET'}, ctx)
          .then(res => res.ok ? res.text() : Promise.reject(new Error(`Could not load paper (${res.status})`)))
          .then(md => active && setHtml(imported('https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.es.mjs').default.sanitize(
            imported('https://cdn.jsdelivr.net/npm/marked@12.0.2/lib/marked.esm.js').marked.parse(md))))
          .catch(err => active && setError(err.message))
        return () => { active = false }
      }, [])
      return h('main', {},
        h('style', {}, `:root{color-scheme:light;--ink:#17212b;--accent:#0d6b68;--line:#dce2df;--paper:#fff;--wash:#f3f6f4}
          *{box-sizing:border-box}body{margin:0;background:linear-gradient(135deg,#e8eeeb,#f7f4ed);color:var(--ink);font:16px/1.65 Georgia,serif}
          main{width:calc(100vw - 32px);min-height:100vh;margin:16px auto;padding:56px clamp(24px,4vw,72px);border-radius:12px;background:var(--paper);
          box-shadow:0 0 60px #263c3520}article{overflow-wrap:anywhere}h1{margin:1.8em 0 .6em;font:600 1.8rem/1.2 Iowan Old Style,Georgia,serif}
          article>h1:first-child{margin-top:0}p,li{max-width:860px;color:#2b3741}article>p:first-of-type{color:var(--accent);font-weight:600}
          code,pre{font:14px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace}code{padding:.15em .35em;border-radius:4px;background:#eaf0ed}
          pre{max-width:860px;overflow:auto;padding:16px 18px;border:1px solid #d8e0e4;border-radius:8px;background:#f3f6f8}
          table{display:table;width:100%;margin:2rem 0;border-collapse:collapse;font:clamp(9px,.85vw,12px)/1.3 system-ui,sans-serif}
          th{background:var(--wash)}th,td{padding:7px 9px;border:1px solid var(--line);text-align:left;vertical-align:top}
          @media(max-width:650px){main{width:100%;margin:0;padding:32px 16px;border-radius:0}table{display:block;overflow:auto}h1{font-size:1.55rem}}`),
        error ? h('p', {}, error) : html ? h('article', {dangerouslySetInnerHTML: {__html: html}}) : h('p', {}, 'Loading paper…'))
    },
    metadata: [
      importUrl('https://cdn.jsdelivr.net/npm/marked@12.0.2/lib/marked.esm.js'),
      importUrl('https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.es.mjs'),
      applet({ title: 'Parquet Scan Tiers', icon: 'Route', showMessageInput: false })
    ]
  })
})
