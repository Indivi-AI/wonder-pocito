import { jb, dsls } from '@jb6/core'
import '@jb6/react'
import '@wonder/ui/applet.js'
import '@wonder/db/db-drivers.js'

const {
  react: { ReactComp, 'react-comp': { comp }, 'react-metadata': { applet, importUrl } }
} = dsls

ReactComp('parquetPaper', {
  impl: comp({
    hFunc: (ctx, {react: {h, imported, useEffect, useState}}) => () => {
      const [html, setHtml] = useState('')
      const [error, setError] = useState('')
      useEffect(() => {
        let active = true
        jb.wonderUtils.wfetch2('room://aTeam/usersRO/papers/parquet1.md', {method: 'GET'}, ctx)
          .then(res => res.ok ? res.text() : Promise.reject(new Error(`Could not load paper (${res.status})`)))
          .then(md => {
            const safe = imported('https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.es.mjs').default.sanitize(
              imported('https://cdn.jsdelivr.net/npm/marked@12.0.2/lib/marked.esm.js').marked.parse(md))
            const doc = new DOMParser().parseFromString(safe, 'text/html')
            doc.querySelectorAll('code.language-sql').forEach(code => code.innerHTML = code.textContent.trim().replace(/\s+/g, ' ')
              .split(/(?=\b(?:FROM|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT)\b)/i).map(section => {
                const clause = section.match(/^(FROM|WHERE|GROUP BY|HAVING|ORDER BY|LIMIT)\b/i)?.[1].toLowerCase().replace(' by', '') || 'select'
                const highlighted = imported('https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/+esm').default
                  .highlight(section, {language: 'sql'}).value
                return `<span class="sql-section sql-${clause}">${highlighted}</span>`
              }).join(' '))
            const parts = [...doc.querySelectorAll('h2')].filter(heading => /^Part (I|II|III)\b/.test(heading.textContent))
            parts.forEach(heading => heading.classList.add('part-page'))
            parts[0].insertAdjacentHTML('beforebegin', '<img class="cover-image" src="https://storage.googleapis.com/indiviai-wonder/aTeam/usersRO/papers/parquet-og-6.png">')
            parts[1].insertAdjacentHTML('beforebegin', '<img class="part-end-image" src="https://storage.googleapis.com/indiviai-wonder/aTeam/usersRO/papers/parquet-og-2.png">')
            parts[2].insertAdjacentHTML('beforebegin', '<img class="part-end-image" src="https://storage.googleapis.com/indiviai-wonder/aTeam/usersRO/papers/parquet-og-5.png">')
            ;[...doc.querySelectorAll('h1')].find(heading => /^10\./.test(heading.textContent))?.insertAdjacentHTML('beforebegin',
              '<img class="part-end-image" src="https://storage.googleapis.com/indiviai-wonder/aTeam/usersRO/papers/parquet-og-4.png">')
            doc.body.insertAdjacentHTML('beforeend', `<section class="more-images"><h2>More illustrations</h2>
              <img src="https://storage.googleapis.com/indiviai-wonder/aTeam/usersRO/papers/parquet-og-1.png">
              <img src="https://storage.googleapis.com/indiviai-wonder/aTeam/usersRO/papers/parquet-og-3.png"></section>`)
            if (active) setHtml(doc.body.innerHTML)
          })
          .catch(err => active && setError(err.message))
        return () => { active = false }
      }, [])
      return h('main', {},
        h('style', {}, `:root{color-scheme:light;--ink:#17212b;--muted:#5d6873;--accent:#0d6b68;--line:#dce2df;--paper:#fff;--wash:#f3f6f4}
          *{box-sizing:border-box}body{margin:0;background:linear-gradient(135deg,#e8eeeb,#f7f4ed);color:var(--ink);font:16px/1.65 Georgia,serif}
          main{max-width:860px;min-height:100vh;margin:auto;padding:56px 72px;background:var(--paper);box-shadow:0 0 60px #263c3520}
          article{overflow-wrap:anywhere}h1,h2,h3{line-height:1.15}h1{max-width:700px;margin:0 0 .8em;font:600 1.8rem/1.2 Iowan Old Style,
          Palatino Linotype,Book Antiqua,Georgia,serif;letter-spacing:-.025em}h2,h3{font-family:ui-sans-serif,system-ui,sans-serif;letter-spacing:-.015em}
          article>p:first-of-type{margin:-.5em 0 2.4em;text-align:right;color:var(--accent);font:600 .78rem/1.4 ui-sans-serif,system-ui,sans-serif;letter-spacing:.08em}
          article>p:nth-of-type(2){margin:0 0 2.5em;padding:16px 20px;border:1px solid #ead7ad;border-radius:10px;background:#fff8e8;color:#594829}
          h2.part-page{break-before:page;margin:5rem -72px 2rem;padding:4rem 72px 0;border-top:14px solid #e8eeeb}
          .cover-image,.part-end-image,.more-images img{display:block;width:100%;height:auto;border-radius:10px}.cover-image{margin:2rem 0 0}
          .part-end-image{margin:4rem 0 0}.more-images{break-before:page;margin-top:5rem;padding-top:3rem;border-top:14px solid #e8eeeb}
          .more-images img{margin:1.5rem 0}
          h2{margin:2em 0 .6em;padding-top:.6em;
          border-top:1px solid var(--line);font-size:1.45rem}h3{margin:1.6em 0 .45em;font-size:1.1rem}p,li{color:#2b3741}strong{color:var(--ink)}
          a{color:var(--accent);text-decoration-thickness:1px;text-underline-offset:3px}hr{border:0;border-top:1px solid var(--line);margin:3em 0}
          code,pre{font:14px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace}code{padding:.15em .35em;border-radius:4px;background:#eaf0ed;color:#145653}
          pre{overflow:auto;margin:1.4em 0;padding:16px 18px;border:1px solid #d8e0e4;border-radius:8px;background:#f3f6f8;color:#33434f}
          pre code{padding:0;background:none;color:inherit}table{display:block;width:100%;overflow:auto;margin:1.8em 0;border-collapse:collapse;font:15px/1.5 system-ui,sans-serif}
          pre:has(.language-sql){margin:1em 0;padding:11px 14px;border-color:#e2dac8;background:#f7f3e9;box-shadow:none}code.language-sql{white-space:normal;color:#596168}
          .sql-section{padding:2px 4px;border-radius:4px;background:#f0ece2}.sql-where{background:#ffe2a8;color:#5f3b00}
          .hljs-keyword{color:#8a4b2a;font-weight:650}.hljs-string{color:#26705d}.hljs-number{color:#6b57a5}.hljs-built_in{color:#25658a}
          th{background:var(--wash);color:var(--ink)}th,td{padding:11px 14px;border:1px solid var(--line);text-align:left;vertical-align:top}
          blockquote{margin:1.8em 0;padding:4px 0 4px 22px;border-left:4px solid var(--accent);color:var(--muted);font-style:italic}
          @media(max-width:650px){main{width:100%;padding:32px 20px;box-shadow:none}h1{font-size:1.65rem}
          h2.part-page{margin-inline:-20px;padding-inline:20px}pre{margin-inline:-8px;padding:16px}}
        `),
        error ? h('p', {}, error) : html ? h('article', {dangerouslySetInnerHTML: {__html: html}}) : h('p', {}, 'Loading paper…'))
    },
    metadata: [
      importUrl('https://cdn.jsdelivr.net/npm/marked@12.0.2/lib/marked.esm.js'),
      importUrl('https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.es.mjs'),
      importUrl('https://cdn.jsdelivr.net/npm/highlight.js@11.10.0/+esm'),
      applet({
        title: 'Why Parquet Structure Matters for Fast Queries',
        icon: 'FileText',
        showMessageInput: false
      })
    ]
  })
})
