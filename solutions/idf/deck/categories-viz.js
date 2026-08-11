import { dsls } from '@jb6/core'
import '@jb6/react'

const { react: { ReactComp, 'react-comp': { comp } } } = dsls

const CSS = `
.cat-req{align-self:center;display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 26px;border-radius:16px;
  background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.35)}
.cat-req b{font:700 22px ui-monospace,Menlo,monospace;color:#67e8f9}
.cat-req span{font:400 16px ui-monospace,Menlo,monospace;color:#8ea0c0}
.cat-cols{flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:22px}
.cat-chip{flex:none;padding:12px 18px;border-bottom:1px solid #26324a;background:#0b1526;font:600 19px ui-monospace,Menlo,monospace;color:#9fb0d0}
.cat-code{font-size:20px;line-height:1.6;padding:22px}
.cat-code b{color:#e8ebf6;font-weight:700}
.cat-code em{font-style:normal;color:#06202a;background:#22d3ee;border-radius:5px;padding:1px 6px}
`

const VARIANTS = [
  {
    chip: `categories: {}`, cat: '',
    body: `', {
  impl: \`Reply with:
<SHORT_ANSWER>one sentence</SHORT_ANSWER>
<LONG_ANSWER>3-4 concise sentences</LONG_ANSWER>\`
})`
  },
  {
    chip: `addCategory('whatsapp')`, cat: '.whatsapp',
    body: `', {
  impl: \`Reply as one WhatsApp message:
{imageUrl, text}
rich text: *bold* _italic_ ~strikethrough~
text is shown below the image, keep it short\`
})`
  }
]

ReactComp('idfCategoriesViz', {
  impl: comp({
    hFunc: (ctx, { react: { h } }) => () => h('div:iv', {}, h('style', {}, CSS),
      h('div:iv-title', {}, 'Context aware asset resolution'),
      h('div:cat-req', {}, h('b', {}, `docletContent('essentialOutputFormat', ctx)`),
        h('span', {}, `id.split('.').slice(1).filter(c => categories[c]).length`)),
      h('div:cat-cols', {}, ...VARIANTS.map(({ chip, cat, body }) => h('div:win', { key: chip },
        h('div:chrome', {}, h('i'), h('i'), h('i'), `essentialOutputFormat${cat}`),
        h('div:cat-chip', {}, chip),
        h('pre:code-pane cat-code', {}, `Doclet('`, h('b', {}, 'essentialOutputFormat'), cat && h('em', {}, cat), body)))))
  })
})
