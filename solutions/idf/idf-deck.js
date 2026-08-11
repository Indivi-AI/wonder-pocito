import { jb, dsls, coreUtils } from '@jb6/core'
import '@jb6/react'
import '@jb6/core/misc/pretty-print.js'
import '@wonder/applets/applet.js'
import '@wonder/llm-flow/llm-flow-core.js'
import './deck-dsl.js'
import './deck/rooms-assets-viz.js'
import './deck/applets-viz.js'
import './deck/categories-viz.js'
import './deck/agents-viz.js'
import './deck/verified-reports-viz.js'
import './deck/artifacts-viz.js'
import './deck/data-sources-viz.js'
import './deck/room-lambdas-viz.js'
import './deck/logs-viz.js'
import './deck/cube-viz.js'
import '../agents/fable-trial/trial/simple-router-agent2.js'

const {
  tgp: { 'ctx-enricher': { addCategory } },
  deck: { Deck, slide: { coverSlide, columnsSlide, codeSlide, listDetailSlide, vizSlide }, column: { column },
    'column-item': { item, subItem }, 'list-item': { listItem } },
  react: { ReactComp, 'react-comp': { comp, deckPlayer }, 'react-metadata': { applet } }
} = dsls

const CSS_BASE = `
@import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap');
*{box-sizing:border-box}
.idf-deck{height:100vh;background:#0b1020;color:#fff;font-family:Heebo,system-ui,sans-serif}
.idf-deck .reveal h1,.idf-deck .reveal h2,.idf-deck .reveal h3{text-transform:none}
.idf-deck *{scrollbar-color:#334155 transparent}
.idf-deck>.reveal{height:100vh}
.idf-deck .reveal .slides{text-align:inherit}
.idf-deck .reveal .slides section{height:1080px}
.s-slide{display:flex;width:100%;height:100%;padding:72px 90px 56px;background:#0b1020;color:#fff;flex-direction:column;text-align:left;overflow:hidden}
.glow{position:absolute;right:-140px;top:-140px;width:560px;height:560px;border-radius:50%;background:linear-gradient(120deg,#22d3ee,#06b6d4);filter:blur(130px);opacity:.22}
.brand{display:flex;align-items:center;gap:10px;font:800 24px Sora,sans-serif}
.brand i{width:26px;height:26px;border-radius:8px;background:linear-gradient(120deg,#22d3ee,#06b6d4)}
.brand em{color:#22d3ee;font-style:normal}
`
const CSS_HEADINGS = `
.slide-head{display:flex;align-items:flex-start;justify-content:space-between;gap:40px;margin-bottom:30px}
.slide-head h2{margin:0;font-size:60px;font-weight:800;line-height:1.08;color:#fff}
.slide-sub{margin:-18px 0 26px;font-size:28px;color:#9fb0d0}
.divider{justify-content:center;align-items:center;text-align:center}
.divider h2{margin:0;max-width:1500px;font-size:104px;line-height:1.15;color:#fff}
`
const CSS_COVER = `
.cover{position:relative;justify-content:center;gap:44px}
.cover h1{margin:0;max-width:1500px;font-size:130px;font-weight:800;line-height:1.1;color:#fff}
.cover .rule{width:150px;height:8px;border-radius:4px;background:linear-gradient(120deg,#22d3ee,#06b6d4)}
.cover .sub{font-size:40px;color:#9fb0d0}
.cover .brand{position:absolute;bottom:80px;left:90px;font-size:30px}
`
const CSS_OS = `
.os-grid{flex:1;min-height:0;display:grid;grid-template-columns:440px 1fr;gap:36px}
.os-left{display:flex;flex-direction:column;gap:10px;padding:22px;border-radius:22px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12)}
.os-item{border:1px solid transparent;border-radius:12px;background:transparent;color:#e8ebf6;padding:12px 16px;font:600 24px Heebo;text-align:left;cursor:pointer}
.os-item:hover{border-color:rgba(34,211,238,.5)}
.os-item.on{background:rgba(34,211,238,.12);border-color:#22d3ee;color:#67e8f9}
.os-item.muted{color:#6b7390}
.os-item .os-note{display:block;font:400 16px Heebo;color:#6b7390}
.os-right{min-width:0;min-height:0;border-radius:22px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);padding:34px;display:flex}
`
const CSS_VIZ = `
.iv{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;gap:20px}
.iv-title{font:800 40px Sora;color:#fff}
.iv-sub{font:500 26px Heebo;color:#9fb0d0}
.iv-caption{font:500 26px Heebo;color:#c7cce0}
.iv-caption b{color:#22d3ee}
.iv-line{font:600 34px Heebo;color:#e8ebf6;border-left:3px solid #22d3ee;padding-left:22px;margin-top:10px}
.win{flex:1;min-height:0;display:flex;flex-direction:column;border-radius:16px;overflow:hidden;border:1px solid #26324a;background:#0d1526}
.chrome{height:44px;flex:none;background:#111c2e;border-bottom:1px solid #26324a;display:flex;align-items:center;gap:8px;padding:0 16px;font:600 14px Sora;color:#8ea0c0}
.chrome i{width:10px;height:10px;border-radius:50%;background:#334155}
.idf-deck .reveal :is(pre,textarea).code-pane{flex:1;min-height:0;width:100%;box-sizing:border-box;margin:0;padding:22px;overflow:auto;
border:0;resize:none;outline:none;background:transparent;color:#c7d2fe;white-space:pre;text-align:left;
font:400 15px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
.toggle{display:flex;gap:8px}
.toggle button{border:1px solid #26324a;border-radius:999px;background:transparent;color:#8ea0c0;padding:8px 22px;font:700 17px Sora;cursor:pointer}
.toggle button.on{background:#22d3ee;border-color:#22d3ee;color:#06202a}
.applet-frame{flex:1;min-height:0;position:relative;transform:translateZ(0);overflow:hidden;background:#fff;border-radius:16px}
.applet-frame h1,.applet-frame h2,.applet-frame h3{color:inherit;font-size:36px;font-weight:600;margin:0;line-height:1.2}
.edit-bar{flex:none;display:flex;align-items:center;gap:14px}
.edit-bar select{flex:none;max-width:170px;border:1px solid #26324a;border-radius:12px;background:#111c2e;color:#8ea0c0;
padding:14px 10px;font:500 18px Heebo;outline:none;cursor:pointer}
.edit-bar input{flex:1;min-width:0;border:1px solid #26324a;border-radius:12px;background:#111c2e;color:#e8ebf6;padding:14px 20px;
font:500 22px Heebo;outline:none}
.edit-bar input:focus{border-color:#22d3ee}
.edit-bar input::placeholder{color:#6b7390}
.edit-bar button{flex:none;border:none;border-radius:12px;background:#22d3ee;color:#06202a;padding:14px 34px;font:700 22px Sora;cursor:pointer}
.edit-bar button:disabled{opacity:.5;cursor:default}
.edit-status{flex:none;max-width:520px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:500 20px Heebo;color:#9fb0d0}
`
const CSS_TREE = `
.tree{flex:1;min-height:0;border:1px solid #26324a;border-radius:16px;background:#0d1526;padding:12px 24px;overflow:auto}
.tree-row{display:flex;align-items:baseline;font:500 17px/1.18 Heebo;color:#9fb0d0;cursor:pointer;border-radius:8px;padding:0 10px}
.tree-row:hover{background:rgba(34,211,238,.07)}
.tree-row.on{background:rgba(34,211,238,.14)}
.tree-row.dir{color:#e8ebf6;font-weight:700}
.tree-row.root{color:#67e8f9;font:700 20px/1.3 Sora;margin-top:8px}
.tree-row.root:first-child{margin-top:0}
.tree-prefix{font:500 17px/1.15 ui-monospace,SFMono-Regular,Menlo,monospace;color:#3b4a66;white-space:pre}
.tree-wurl{flex:none;border:1px solid #26324a;border-radius:12px;background:#111c2e;padding:10px 20px;color:#67e8f9;
font:600 22px ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;overflow:auto}
.tree-wurl-server{color:#8ea0c0;font-size:18px;font-weight:400}
.tree-note{flex:none;border:1px solid rgba(34,211,238,.35);border-radius:12px;background:rgba(34,211,238,.08);padding:12px 20px;
font:600 24px Heebo;color:#c7cce0}
`
const CSS_COLS = `
.col-grid{flex:1;display:grid;grid-template-columns:repeat(auto-fit,minmax(600px,1fr));gap:44px;align-content:center}
.col-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.14);border-radius:22px;padding:44px 48px}
.col-card h3{font:700 40px Sora;color:#22d3ee;margin:0 0 26px}
.col-card .li{font:500 30px/1.5 Heebo;color:#e8ebf6;margin:18px 0}
.col-card .li:before{content:'◆';color:#22d3ee;font-size:14px;margin-right:16px}
.col-card .li.sub{margin:10px 0 10px 44px;font-size:27px;color:#c7cce0}
.col-card .li.sub:before{content:'·';margin-right:12px}
.col-card a.li{display:block;text-decoration:none}
.col-card a.li:hover{color:#67e8f9}
`

const AI_STUDIO_URL = 'http://localhost:3000/jb6_packages/react/react-comp-view.html?urlsToLoad=@wonder-agents/app/ai-studio.js&cmpId=aiStudio&roomId=comaxDemo'

const SlideHead = ReactComp('slideHead.idf', {
  impl: comp({
    hFunc: ({}, { react: { h } }) => ({ title }) => h('div:slide-head', {},
      h('h2', {}, title), h('div:brand', {}, h('i'), h('span', {}, 'indivi', h('em', {}, '.ai'))))
  })
})

ReactComp('deckShell.idf', {
  impl: comp({ hFunc: ({}, { react: { h } }) => ({ children }) =>
    h('main:idf-deck', {}, h('style', {}, [CSS_BASE, CSS_HEADINGS, CSS_COVER, CSS_OS, CSS_VIZ, CSS_TREE, CSS_COLS].join('\n')), children) })
})

ReactComp('coverSlide.idf', {
  impl: comp({
    hFunc: ({}, { react: { h } }) => ({ slide }) => h('div:s-slide cover', {}, h('div:glow'),
      h('h1', {}, slide.title), h('div:rule'), slide.subtitle && h('div:sub', {}, slide.subtitle),
      h('div:brand', {}, h('i'), h('span', {}, 'indivi', h('em', {}, '.ai'))))
  })
})

ReactComp('titleSlide.idf', {
  impl: comp({
    hFunc: ({}, { react: { h } }) => ({ slide }) =>
      h('div:s-slide divider', {}, h('div:glow'), h('h2', {}, slide.title))
  })
})

ReactComp('columnsSlide.idf', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh } }) => ({ slide }) =>
      h('div:s-slide', {}, h('div:glow'), hh(ctx, SlideHead, { title: slide.title }),
        h('div:col-grid', {}, ...slide.columns.map(col => h('div:col-card', { key: col.title }, h('h3', {}, col.title),
          ...col.items.map(({ text, sub, href }) => h(href ? 'a:li' : sub ? 'div:li sub' : 'div:li',
            { key: text, ...(href && { href, target: '_blank', rel: 'noreferrer' }) }, text))))))
  })
})

ReactComp('codeSlide.idf', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh } }) => ({ slide }) =>
      h('div:s-slide', {}, h('div:glow'), hh(ctx, SlideHead, { title: slide.title }),
        h('div:slide-sub', {}, slide.subtitle),
        h('div:win', {}, h('div:chrome', {}, h('i'), h('i'), h('i'), slide.file),
          h('pre:code-pane', {}, coreUtils.prettyPrintComp(coreUtils.compByFullId(slide.compId), { tgpModel: jb }))))
  })
})

ReactComp('listDetailSlide.idf', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh, useState } }) => ({ slide }) => {
      const [selectedIndex, setSelectedIndex] = useState(0)
      const viz = slide.items[selectedIndex]?.viz, Viz = viz && dsls.react['react-comp'][viz]
      return h('div:s-slide', {}, h('div:glow'), hh(ctx, SlideHead, { title: slide.title }),
        h('div:os-grid', {},
          h('div:os-left', {}, ...slide.items.map(({ title, note, muted }, i) =>
            h('button:os-item', { key: i, className: `${selectedIndex == i ? 'on' : ''} ${muted ? 'muted' : ''}`, 'data-testid': `os-${title}`,
              onClick: () => setSelectedIndex(i) }, title, note && h('span:os-note', {}, note)))),
          h('div:os-right', {}, Viz && hh(ctx, Viz, { key: selectedIndex }))))
    }
  })
})

Deck('idfDeck', {
  moreTypes: 'react-comp<react>',
  impl: deckPlayer(addCategory('idf'), {
    metadata: applet({ title: 'How can we help you using Wonder?', icon: 'Presentation', showMessageInput: false }),
    slides: [
      coverSlide('How can we help you using Wonder?'),
      listDetailSlide({ title: 'Wonder', items: [
        listItem('Rooms Assets and wUrls', { viz: 'idfRoomsAssetsViz' }),
        listItem('Applets', { viz: 'idfAppletsViz' }),
        listItem('Categories', { viz: 'idfCategoriesViz' }),
        listItem('Booklets', { note: 'detail in next slide', muted: true }),
        listItem('Agents', { viz: 'idfAgentsViz' }),
        listItem('Room Lambdas', { viz: 'idfRoomLambdasViz' }),
        listItem('Verified Reports', { viz: 'idfVerifiedReportsViz' }),
        listItem('Data Sources', { viz: 'idfDataSourcesViz' }),
        listItem('Triggers and CronJobs'),
        listItem('Logs', { viz: 'idfLogsViz' }),
        listItem('Slides and other artifacts', { viz: 'idfArtifactsViz' })
      ] }),
      columnsSlide({ title: 'End User and Agents Studio Demo', columns: [
        column({ title: 'Where a builder wants to work?', items: [
          item('1. Claude Code'),
          item('2. MCP'),
          item('3. UI', { href: AI_STUDIO_URL })
        ] })
      ] }),
      vizSlide('Cube Demo', { viz: 'idfCubeViz' }),
      codeSlide({
        title: 'LLM-FLOW - dsl for harnesses',
        subtitle: 'Works but still in development, in the future will enable non-coders to define their own harnesses',
        file: 'admin/agents/fable-trial/trial/simple-router-agent2.js',
        compId: 'workflow<workflow>simpleRouterAgent'
      }),
      columnsSlide({ title: 'Collaboration ideas', columns: [
        column({ title: 'You Lead - We Clean', items: [
          item('You work with your own tools on your own problems'),
          item('We convert your work after you into the platform until it’s stable and you start using it')
        ] }),
        column({ title: 'Partial Adoption', items: [
          item('You don’t want to use wonderOS'),
          item('We can assist with specific components, for example:'),
          subItem('Applets and UI generation'),
          subItem('Prompt Management'),
          subItem('Slides and Artifacts'),
          subItem('etc')
        ] })
      ] })
    ]
  })
})
