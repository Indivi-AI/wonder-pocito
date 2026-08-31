import { dsls } from '@jb6/core'
import '@jb6/react'
import '@wonder/ui/applet.js'
import '@solution/pocito/deck-dsl.js'

const {
  tgp: { TgpType },
  deck: { Slide },
  react: { ReactComp, 'react-comp': { comp, deckPlayer }, 'react-metadata': { applet } }
} = dsls

const Person = TgpType('person', 'deck')
const ApproachCard = TgpType('approach-card', 'deck')
const ShowcaseItem = TgpType('showcase-item', 'deck')

Person('person', {
  params: [
    {id: 'name', as: 'string'},
    {id: 'role', as: 'string'},
    {id: 'photo', as: 'string'}
  ]
})
ApproachCard('approachCard', {
  params: [
    {id: 'title', as: 'string'},
    {id: 'usd', as: 'string'},
    {id: 'text', as: 'string'},
    {id: 'how', as: 'string'},
    {id: 'chips', type: 'data<common>[]'}
  ]
})
ShowcaseItem('showcaseItem', { params: [
  { id: 'id', as: 'string' }, { id: 'title', as: 'string' }, { id: 'text', as: 'string' }, { id: 'details', type: 'data<common>[]' }
] })
Slide('teamSlide', { params: [{ id: 'title', as: 'string' }, { id: 'eyebrow', as: 'string' }, { id: 'people', type: 'person[]' }, { id: 'foot', as: 'string' }] })
Slide('approachSlide', {
  params: [
    {id: 'title', as: 'string'},
    {id: 'eyebrow', as: 'string'},
    {id: 'cards', type: 'approach-card[]'}
  ]
})
Slide('showcaseSlide', { params: [
  { id: 'title', as: 'string' }, { id: 'eyebrow', as: 'string' }, { id: 'subtitle', as: 'string' }, { id: 'items', type: 'showcase-item[]' }
] })
Slide('archSlide', {
  params: [
    {id: 'title', as: 'string'},
    {id: 'eyebrow', as: 'string'},
    {id: 'subtitle', as: 'string'}
  ]
})
Slide('stackSlide', {
  params: [
    {id: 'title', as: 'string'},
    {id: 'eyebrow', as: 'string'},
    {id: 'subtitle', as: 'string'}
  ]
})

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*{box-sizing:border-box}
.de-deck{height:100vh;background:#fff;color:#171717;font-family:Inter,system-ui,sans-serif}
.de-deck>.reveal{height:100vh}.de-deck .reveal .slides{text-align:inherit}.de-deck .reveal .slides section{height:1080px}
.de-deck .reveal .controls{color:#ff4800}.de-deck .reveal .progress{color:#ff4800;height:4px}
.de-deck *{scrollbar-color:#d9d9de transparent;scrollbar-width:thin}
.p-slide{width:100%;height:100%;padding:60px 84px 56px;background:#fff;display:flex;flex-direction:column;text-align:left;overflow:hidden}
.p-head{display:flex;justify-content:space-between;align-items:flex-end;gap:40px;margin-bottom:26px}
.p-eyebrow{margin-bottom:10px;color:#ff4800;font-size:17px;font-weight:800;letter-spacing:.22em}
.p-head h2{margin:0;max-width:1500px;color:#171717;font-size:56px;line-height:1.06;letter-spacing:-.035em;text-transform:none}
.p-brand{display:flex;align-items:center;gap:13px;padding-bottom:8px;white-space:nowrap}
.p-brand .mark{width:36px;height:36px;border-radius:11px;background:#ff4800;color:#fff;display:grid;place-items:center;font:800 21px Inter;font-style:normal}
.p-brand .sep{width:1.5px;height:26px;background:#d9d9de}.p-brand .name{font-size:24px;font-weight:800;color:#171717}
.p-sub{margin:-8px 0 24px;color:#686868;font-size:24px}
.cover .cover-body{flex:1;display:flex;flex-direction:column;justify-content:center;gap:30px}
.cover .c-eyebrow{color:#ff4800;font:700 23px ui-monospace,Menlo,monospace;letter-spacing:.2em}
.cover h1{margin:0;max-width:1400px;color:#171717;font-size:118px;line-height:1.05;letter-spacing:-.035em;text-transform:none}
.cover p{margin:0;max-width:1150px;color:#555;font-size:34px;line-height:1.45}
.cover-foot{display:flex;align-items:center;gap:14px;color:#8a8a92;font:600 21px ui-monospace,Menlo,monospace}
.cover-foot i{width:15px;height:15px;border-radius:50%;background:#ff4800}
.team-grid{flex:1;min-height:0;display:grid;grid-template-columns:repeat(3,1fr);gap:36px}
.person{display:flex;flex-direction:column;border:1px solid #e6e6ea;border-radius:24px;background:#fff;overflow:hidden;box-shadow:0 22px 60px rgba(23,23,23,.07)}
.person img{width:100%;height:470px;object-fit:cover;border-bottom:4px solid #ff4800}
.person .p-body{flex:1;display:flex;flex-direction:column;gap:14px;padding:34px 36px}
.person h3{margin:0;color:#171717;font-size:37px;letter-spacing:-.02em;text-transform:none}
.person p{margin:0;color:#555;font-size:22px;line-height:1.5}
.team-foot{margin-top:30px;padding-top:22px;border-top:1px solid #e8e8eb;color:#555;text-align:center;font-size:24px}
.ap2{padding:56px 84px 60px;background:radial-gradient(58% 55% at 50% 0%,#fff3ee 0%,#fff 65%)}
.ap2-top{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:28px;text-align:center}
.ap2-eyebrow{color:#ff4800;font-size:17px;font-weight:800;letter-spacing:.32em}
.ap2 h1{margin:0;max-width:1620px;color:#171717;font-size:66px;line-height:1.14;letter-spacing:-.03em;text-transform:none}
.ap2 h1 b{color:#ff4800}
.appr{flex:1;min-height:0;display:grid;grid-template-columns:repeat(3,1fr);gap:40px}
.a-card{position:relative;display:flex;flex-direction:column;gap:20px;padding:50px 46px 36px;border:1px solid #eee;border-radius:26px;background:#fff;
box-shadow:0 30px 70px rgba(23,23,23,.10);overflow:hidden;transition:.25s}
.a-card:before{content:'';position:absolute;left:0;top:0;right:0;height:7px;background:linear-gradient(90deg,#ff4800,#ffb79b)}
.a-card:hover{transform:translateY(-8px);box-shadow:0 40px 90px rgba(255,72,0,.16)}
.a-card h3{margin:0;color:#171717;font-size:37px;line-height:1.16;letter-spacing:-.02em;text-transform:none}
.a-card .usd{color:#171717;font-size:46px;font-weight:800;letter-spacing:-.03em}
.a-card .usd .old{color:#8a8a92;font-size:58px;font-weight:800;text-decoration:line-through;text-decoration-thickness:4px}
.a-card .usd .arr{color:#c9ccd2;font-size:36px}
.a-card .usd .new{color:#ff4800;font-size:36px}.a-card .usd .new.dark{color:#171717;font-size:50px}
.a-card .usd .for{color:#8a8a92;font-size:27px;font-weight:700}
.a-card p{margin:0;color:#555;font-size:27px;line-height:1.45}
.a-card .how{margin-top:auto;padding-top:18px;border-top:1px solid #f0f0f2;color:#555;font-size:18.5px;font-weight:600}
.a-card .how:before{content:'◆';color:#ff4800;font-size:12px;margin-right:10px}
.a-chips{display:flex;gap:10px;flex-wrap:wrap}
.a-chips span{border:1px solid #ffc9b3;border-radius:999px;background:#fff;color:#b93200;padding:8px 20px;font-size:16.5px;font-weight:800;letter-spacing:.06em}
.showcase{flex:1;min-height:0;display:grid;grid-template-columns:470px 1fr;gap:30px}
.show-list{display:flex;flex-direction:column;gap:12px}
.show-item{flex:1;display:flex;flex-direction:column;justify-content:center;padding:22px 24px;border:1px solid #e6e6ea;border-radius:18px;
background:#fafafa;color:#333;text-align:left;cursor:pointer;transition:.2s}
.show-item:hover{border-color:#ffb79b}.show-item.on{border-color:#ff4800;background:#fff;box-shadow:0 14px 40px rgba(255,72,0,.13)}
.show-item b{display:flex;align-items:center;gap:12px;font-size:25px;color:#171717}
.show-item b:before{content:'';width:10px;height:10px;border-radius:50%;background:#d9d9de;transition:.2s}
.show-item.on b:before{background:#ff4800;box-shadow:0 0 0 5px #ffe1d4}
.show-item span{display:block;margin:8px 0 0 22px;color:#727272;font-size:17px;line-height:1.4}
.show-details{display:grid;gap:8px;margin:14px 0 2px 22px}
.show-details div{color:#b93200;font-size:16.5px;font-weight:600}.show-details div:before{content:'◆';margin-right:10px;font-size:11px;color:#ff4800}
.show-viz{display:flex;min-width:0;min-height:0}
.pw{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;border:1px solid #e3e3e8;border-radius:18px;overflow:hidden;background:#fff;
box-shadow:0 22px 60px rgba(23,23,23,.08)}
.pw-bar{height:52px;flex:none;display:flex;align-items:center;gap:9px;padding:0 20px;background:#131417;color:#ececf1;font-size:15px;font-weight:700}
.pw-bar i{width:11px;height:11px;border-radius:50%;background:#3a3d45}.pw-bar span{margin-left:auto;color:#8f939e;font-size:13px;font-weight:500}
.de-deck .reveal pre.code{flex:1;min-height:0;width:100%;margin:0;padding:24px 28px;overflow:auto;background:#131417;box-shadow:none;
text-align:left;font:15.5px/1.62 ui-monospace,SFMono-Regular,Menlo,monospace}
.cl{white-space:pre;color:#c9cdd6}.cl.hl{background:#4a1c07;box-shadow:0 0 0 4px #4a1c07;border-radius:3px}
.cl .k{color:#ff8b60;font-weight:600}.cl .s{color:#e8c98a}.cl .c{color:#6d727e}
.viz-body{flex:1;min-height:0;display:flex;background:#fafafa}
.ai-q{align-self:flex-end;max-width:82%;border-radius:18px 18px 4px 18px;background:#131417;color:#fff;padding:16px 22px;font-size:20px}
.ai-a{border:1px solid #e6e6ea;border-radius:18px;background:#fff;padding:22px 24px;box-shadow:0 14px 40px rgba(23,23,23,.07)}
.ai-a .vhead{display:flex;align-items:center;gap:10px;margin-bottom:10px;font-size:17px;font-weight:800}
.vbadge{display:inline-flex;align-items:center;gap:7px;color:#ff4800;font-size:14px;font-weight:800}
.vbadge i{width:20px;height:20px;border-radius:50%;background:#ff4800;color:#fff;font-style:normal;display:grid;place-items:center;font-size:12px}
.ai-a p{margin:0;color:#333;font-size:19px;line-height:1.5}
.ai-bars{display:grid;gap:8px;margin-top:16px}
.ai-bar{display:grid;grid-template-columns:52px 1fr 84px;align-items:center;gap:12px;font-size:15px;color:#555;font-weight:600}
.ai-bar i{height:16px;border-radius:8px;background:#ff4800}.ai-bar em{font-style:normal;text-align:right;font-weight:700;color:#171717}
.ai-sql{align-self:flex-start;border:1px solid #e6e6ea;border-radius:12px;background:#fff;color:#444;padding:12px 18px;
font:600 15.5px ui-monospace,Menlo,monospace}.ai-sql b{color:#ff4800;font-weight:600}
.vocab-chips{display:flex;flex-wrap:wrap;gap:9px;align-content:flex-start}
.vocab-chips span{border:1px solid #e3e3e8;border-radius:999px;background:#fafafa;color:#666;padding:8px 15px;font:600 15px ui-monospace,Menlo,monospace}
.vocab-chips span.used{border-color:#ff4800;background:#fff3ee;color:#b93200;box-shadow:0 6px 18px rgba(255,72,0,.18)}
.aif-step{color:#ff4800;font-weight:800}
.aif-store{border:1px solid #e6e6ea;border-radius:999px;background:#fafafa;color:#666;padding:9px 22px;font:600 15px ui-monospace,Menlo,monospace}
.aifC{flex:1;min-width:0;padding:24px 30px;display:grid;grid-template-columns:1fr 250px 330px;gap:18px 0;align-content:center;align-items:center}
.aifC .lane{grid-column:3;grid-row:1/5;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:10px;border-radius:18px;
background:#131417;color:#fff;padding:34px;align-self:stretch}
.aifC .lane b{font-size:27px}.aifC .lane span{color:#8f939e;font-size:16px}
.arrow-c{display:grid;justify-items:center;align-content:center;gap:2px;color:#8a8a92;font-size:14px;font-weight:700;text-align:center;padding:0 12px}
.arrow-c i{font-style:normal;font-size:30px;line-height:1;color:#ff4800}
.builder{flex:1;display:grid;grid-template-columns:440px 1fr}
.b-panel{display:flex;flex-direction:column;padding:26px 30px;border-right:1px solid #e6e6ea;background:#fff}
.b-panel h4{margin:0 0 18px;font-size:21px;color:#171717}
.b-panel label{margin:12px 0 6px;color:#8a8a92;font-size:13.5px;font-weight:800;letter-spacing:.08em}
.b-panel select{width:100%;padding:12px 14px;border:1px solid #d9d9de;border-radius:10px;background:#fff;color:#171717;
font:600 16px ui-monospace,Menlo,monospace;outline:none;cursor:pointer}.b-panel select:focus{border-color:#ff4800}
.b-chart{flex:1;display:flex;flex-direction:column;margin-top:24px;border:1px solid #eee;border-radius:14px;background:#fafafa;padding:18px}
.b-chart h5{margin:0 0 6px;font-size:15px;color:#444}.b-chart h5 b{color:#ff4800}
.b-bars{flex:1;display:flex;align-items:flex-end;gap:16px;padding-top:20px}
.b-bar{flex:1;display:flex;flex-direction:column;justify-content:flex-end;gap:6px;height:100%;text-align:center}
.b-bar i{border-radius:8px 8px 0 0;background:#ff4800;transition:height .35s}
.b-bar em{font-style:normal;font-size:13.5px;font-weight:800;color:#171717}.b-bar span{font-size:13px;color:#8a8a92;font-weight:600}
.b-code{display:flex;flex-direction:column;min-width:0;background:#131417}.de-deck .reveal .b-code pre.code{font-size:16.5px}
.opt{flex:1;min-width:0;padding:24px 30px;display:flex;flex-direction:column;gap:16px}
.sql-chip{align-self:flex-start;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;border:1px solid #e3e3e8;border-radius:12px;
background:#131417;color:#e8c98a;padding:13px 22px;font:600 16px ui-monospace,Menlo,monospace}.sql-chip b{color:#ff8b60;font-weight:600}
.pq-flow{flex:1;min-height:0;display:flex;align-items:center;gap:30px}
.pqm{flex:1;min-height:0;align-self:stretch;display:flex;gap:2px}
.pqm-lbls{display:flex;flex-direction:column;width:225px;margin-right:14px}
.pqm-lbls>div{flex:810;display:flex;align-items:center;justify-content:flex-end;text-align:right;color:#9a9aa2;font-size:15px;font-weight:600}
.pqm-lbls>div.read{flex:190;color:#b93200}
.pqm-col{position:relative;display:flex;flex-direction:column;min-width:15px;flex-basis:0}
.pqm-col>i{flex:810;min-height:0;display:flex;background:#ececee}.pqm-col>b{flex:190;background:#dcdce1}
.pqm-col.read>b{background:#ff4800;box-shadow:0 8px 20px rgba(255,72,0,.28)}
.pqm-col>i span{margin:0 auto;padding-top:12px;writing-mode:vertical-rl;color:#9a9aa2;font:600 13px ui-monospace,Menlo,monospace;overflow:hidden}
.pqm-col.read>i span{color:#b93200;font-weight:700}
.pqm-col:after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(180deg,transparent 0 calc(1.7544% - 1px),#fff calc(1.7544% - 1px) 1.7544%)}
.pq-arrow{color:#ff4800;font-size:40px}
.pq-stat{display:grid;gap:8px;white-space:nowrap}
.pq-stat b{color:#171717;font-size:56px;letter-spacing:-.03em;line-height:1}.pq-stat span{color:#ff4800;font-size:22px;font-weight:800}
.pq-stat small{color:#8a8a92;font-size:16px;font-weight:600;white-space:normal;max-width:230px;line-height:1.4}
.pq-caption{flex:none;color:#555;text-align:center;font-size:21px}
.arch-wrap{flex:1;min-height:0;display:flex;gap:0}
.arch{flex:1;min-width:0;min-height:0;display:flex}.arch svg{flex:1;min-height:0;width:100%}
.an{cursor:pointer}.an rect.nb{transition:stroke .2s,stroke-width .2s}
.an:hover rect.nb{stroke:#ff8b60;stroke-width:2.5}
.an.sel rect.nb{stroke:#ff4800;stroke-width:3.5;filter:drop-shadow(0 0 14px rgba(255,72,0,.45))}
.arch svg>*{transition:opacity .3s}.arch.dim svg>*{opacity:.22}.arch.dim svg>.an.sel{opacity:1}
.drill{width:0;flex:none;overflow:hidden;transition:width .45s cubic-bezier(.2,.8,.2,1)}
.drill.open{width:1280px;margin-left:26px}
.drill-in{width:1280px;height:100%;display:flex;flex-direction:column;border:1px solid #e3e3e8;border-radius:20px;background:#fff;
box-shadow:-24px 0 60px rgba(23,23,23,.12);overflow:hidden}
.drill-head{flex:none;display:flex;align-items:center;gap:16px;padding:20px 28px;border-bottom:1px solid #ececef}
.drill-head .d-eyebrow{color:#ff4800;font-size:13px;font-weight:800;letter-spacing:.2em}
.drill-head h3{margin:2px 0 0;font-size:27px;color:#171717;letter-spacing:-.02em;text-transform:none}
.drill-head button{margin-left:auto;width:42px;height:42px;border:1px solid #ddd;border-radius:50%;background:#fff;color:#444;font-size:19px;cursor:pointer}
.drill-head button:hover{border-color:#ff4800;color:#ff4800}
.drill-body{flex:1;min-height:0;display:flex;flex-direction:column;padding:24px 28px}
.spacer{flex:1 1 0;min-width:0}.stack-d{flex:0 1 840px}
.arch-wrap{position:relative}
.sql-links{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3}
.sqlv{flex:1;min-height:0;display:flex;flex-direction:column;gap:14px}
.sqlv>.pw{flex:none}.de-deck .reveal .sqlv pre.code{flex:none;overflow:visible}
.sqlv-arrow{color:#b93200;font-size:17px;font-weight:700;text-align:center}
.sqlv-note{color:#555;font-size:18px;text-align:center}.sqlv-note b{color:#ff4800}
.lc{flex:1;min-height:0;display:flex;flex-direction:column;gap:18px}
.lc-sec{border:1px solid #e6e6ea;border-radius:18px;background:#fff;box-shadow:0 14px 40px rgba(23,23,23,.06);padding:20px 26px}
.lc-sec h4{margin:0;font-size:22px;color:#171717;text-transform:none}.lc-sec h4 i{font-style:normal;color:#ff4800;margin-right:12px}
.lc-grow{flex:1;min-height:0}
.lc-flow{display:grid;grid-template-columns:1fr 330px 230px;gap:18px;align-items:stretch;margin-top:16px;height:calc(100% - 48px)}
.lc-cache{border:1px solid #ffc9b3;border-radius:16px;background:#fff8f5;padding:18px 22px;display:flex;flex-direction:column;gap:14px}
.lc-cache h5,.lc-bucket h5{margin:0;font-size:17px;color:#171717}
.lc-segs{flex:1;display:flex;gap:6px;align-items:stretch;min-height:110px}
.seg{flex:1;display:grid;place-items:center;border:1px solid #d9d9de;border-radius:10px;background:#ececee;color:#666;
font:700 14px ui-monospace,Menlo,monospace}
.seg.head{flex:1.2;border:2.5px dashed #ff4800;background:#fff3ee;color:#b93200;text-align:center}
.lc-arrows{display:flex;flex-direction:column;justify-content:center;gap:38px;padding:0 6px}
.lc-arrow em{display:block;font-style:normal;text-align:center;color:#b93200;font-size:14.5px;font-weight:800;margin-bottom:8px}
.lc-arrow .ln{position:relative;height:3px;background:repeating-linear-gradient(90deg,#ff4800 0 12px,transparent 12px 22px);
animation:ceFlowL 1.1s linear infinite}
.lc-arrow .ln:before{content:'';position:absolute;left:-2px;top:-6px;border:7.5px solid transparent;border-right-color:#ff4800;border-left:0}
.lc-arrow small{display:block;text-align:center;margin-top:8px;color:#171717;font-size:14.5px;font-weight:800}
.lc-bucket{border:1px solid #e6e6ea;border-radius:16px;background:#fff;padding:18px 22px;display:flex;flex-direction:column;justify-content:center}
@keyframes ceFlowL{to{background-position:-22px 0}}
.ce{flex:1;min-height:0;display:flex;flex-direction:column;gap:16px}
.ce-flow{display:grid;grid-template-columns:300px 1fr 240px;gap:0;align-items:stretch}
.ce-card{border:1px solid #e6e6ea;border-radius:18px;background:#fff;box-shadow:0 14px 40px rgba(23,23,23,.07);padding:22px 26px}
.ce-card h4{margin:0;font-size:22px;color:#171717;text-transform:none}
.ce-card h4 small{display:block;margin-top:6px;color:#8a8a92;font-size:14.5px;font-weight:600}
.ce-card .engine{margin-top:16px;border-radius:12px;background:#131417;color:#fff;padding:14px 18px;font-weight:800;font-size:17px}
.ce-card .engine small{display:block;margin-top:4px;color:#8f939e;font-size:13px;font-weight:600}
.ce-lane{position:relative;display:flex;flex-direction:column;justify-content:center;gap:10px;padding:0 22px}
.ce-lane .rng{height:3px;background:repeating-linear-gradient(90deg,#ff4800 0 12px,transparent 12px 22px);animation:ceFlow 1.1s linear infinite}
.ce-lane .rng:nth-child(3){animation-delay:.25s}.ce-lane .rng:nth-child(4){animation-delay:.5s}
.ce-lane em{font-style:normal;text-align:center;color:#b93200;font-size:15.5px;font-weight:800}
.ce-lane small{text-align:center;color:#8a8a92;font-size:13.5px;font-weight:600}
@keyframes ceFlow{to{background-position:22px 0}}
.ce-fallback{display:flex;align-items:center;gap:18px;border:1px dashed #c9ccd2;border-radius:16px;padding:16px 24px;color:#555;font-size:17px;font-weight:600}
.ce-fallback .dark{border-radius:999px;background:#131417;color:#fff;padding:10px 24px;font-weight:800}
.ce-fallback i{font-style:normal;color:#ff4800;font-size:24px}
.ce-runs{border:1px solid #ffc9b3;border-radius:16px;background:#fff8f5;padding:18px 24px;display:grid;gap:12px}
.ce-runs h5{margin:0;color:#171717;font-size:17px}.ce-runs h5 span{color:#8a8a92;font-weight:600;font-size:14px}
.run{display:grid;grid-template-columns:250px 1fr 70px;align-items:center;gap:14px;color:#555;font-size:15.5px;font-weight:600;white-space:nowrap}
.run i{height:16px;border-radius:8px;background:#ffd4c2}.run.hot i{background:#ff4800}
.run em{font-style:normal;text-align:right;font-weight:800;color:#171717}
.ce-note{color:#555;text-align:center;font-size:18px}.ce-note b{color:#ff4800}
.prj{flex:1;min-height:0;display:flex;flex-direction:column;gap:14px;max-width:960px;width:100%;margin:0 auto}
.prj-chips{display:flex;gap:10px}
.prj-chips button{flex:1;padding:11px 14px;border:1px solid #ddd;border-radius:999px;background:#fff;color:#444;font:700 14.5px Inter;cursor:pointer;transition:.2s}
.prj-chips button.on{border-color:#ff4800;color:#b93200;background:#fff3ee;box-shadow:0 8px 22px rgba(255,72,0,.18)}
.prj-main{position:relative;flex:1;min-height:580px}
.prj-q{position:absolute;left:0;top:150px;width:228px;border:1px solid #e6e6ea;border-radius:14px;background:#fff;padding:16px 18px;
box-shadow:0 14px 40px rgba(23,23,23,.08);font-size:16.5px;font-weight:700;color:#171717;opacity:0;transform:translateX(-30px);transition:.4s}
.prj-q.in{opacity:1;transform:none}
.prj-conn{position:absolute;left:230px;top:192px;width:42px;height:3px;background:repeating-linear-gradient(90deg,#c9ccd2 0 10px,transparent 10px 18px);opacity:0}
.prj-conn.on{opacity:1;background:repeating-linear-gradient(90deg,#ff4800 0 10px,transparent 10px 18px);animation:ceFlow .9s linear infinite}
.prj-cube{position:absolute;left:274px;top:118px;width:168px;height:150px;border-radius:22px;background:#131417;color:#fff;display:grid;place-content:center;
text-align:center;gap:5px;box-shadow:0 18px 50px rgba(23,23,23,.3);transition:.3s}
.prj-cube b{font-size:22px}.prj-cube span{color:#9aa1ab;font-size:13px}
.prj-cube.think{animation:prjPulse .9s ease;box-shadow:0 0 60px rgba(255,72,0,.4)}
.prj-cap{position:absolute;left:246px;top:284px;width:224px;text-align:center;color:#8a8a92;font-size:13.5px;font-weight:600;opacity:0;transition:.3s}
.prj-cap.on{opacity:1}
.prj-ans{position:absolute;left:0;top:250px;width:228px;text-align:center;border-radius:999px;background:#ff4800;color:#fff;padding:9px 0;
font-size:15px;font-weight:800;opacity:0;transform:scale(.7);transition:.3s}.prj-ans.on{opacity:1;transform:none}
.prj-panel{position:absolute;left:505px;top:0;width:435px;height:452px;border-radius:20px;background:#131417;padding:16px 18px 12px;color:#fff}
.prj-panel h5{margin:0 0 10px;color:#8a8f98;font-size:12px;font-weight:800;letter-spacing:.14em}
.prj-shelf{position:relative;display:flex;align-items:center;gap:12px;height:128px;border-top:1px solid #26272c;padding:0 6px 0 14px}
.prj-shelf:first-of-type{border-top:none}
.prj-shelf:before{content:'';position:absolute;left:0;top:14px;bottom:14px;width:4px;border-radius:2px;background:var(--tc)}
.prj-tier{width:104px;flex:none}.prj-tier b{display:block;font-size:15px}.prj-tier span{display:block;margin-top:3px;color:#8a8f98;font-size:12px}
.prj-card{position:relative;flex:1;border:1px solid #2a2b30;border-radius:14px;background:#1c1d22;padding:12px 14px;transition:.3s}
.prj-card b{font-size:15.5px}.prj-card small{display:block;margin-top:4px;color:#8a8f98;font-size:12px}
.prj-card .size{position:absolute;right:12px;top:12px;color:#c9cdd6;font-size:13px;font-weight:800}
.prj-card .verdict{position:absolute;right:12px;bottom:10px;border-radius:999px;padding:3px 12px;font-size:11.5px;font-weight:800;
background:#26272c;color:#8a8f98;opacity:0;transition:.25s}
.prj-card .verdict.show{opacity:1}.prj-card .verdict.ok{background:#3a1503;color:#ff8b60}
.prj-card.on{border-color:#ff4800;transform:translateY(-3px);animation:prjRipple .7s ease-out}
.prj-card.dim{opacity:.35}
.prj-tip{position:absolute;left:246px;top:314px;width:224px;text-align:center;color:#ff8b60;font-size:12.5px;font-weight:700;opacity:0;transition:.3s}
.prj-beam{position:absolute;left:442px;top:192px;height:3px;background:repeating-linear-gradient(90deg,#ff4800 0 10px,transparent 10px 16px);
transform-origin:0 50%;transition:transform .35s ease-out;z-index:2}
.prj-promo{position:absolute;left:404px;width:9px;height:9px;border-radius:50%;background:#ff4800;animation:prjPromote 4.5s ease-in-out infinite}
.prj-panel .foot{position:absolute;left:18px;right:18px;bottom:-26px;color:#8a8a92;font-size:12.5px;font-weight:600}
.prj-cost{position:absolute;left:0;right:0;top:492px;display:grid;gap:8px}
.prj-cost h6{margin:0;color:#8a8f98;font-size:12px;font-weight:800;letter-spacing:.14em}
.prj-bar{display:grid;grid-template-columns:200px 1fr 210px;align-items:center;gap:14px;font-size:14px;font-weight:700;color:#555}
.prj-bar .track{height:16px;border-radius:8px;background:#f1f1f3;overflow:hidden}
.prj-bar .track i{display:block;height:100%;border-radius:8px;width:0;transition:width .5s ease-out}
.prj-bar.base .track i{background:#c9ccd2}.prj-bar.opt .track i{background:#ff4800}
.prj-bar em{font-style:normal;color:#171717;font-weight:800}
.prj-mult{position:absolute;left:235px;top:392px;transform:translateX(-50%);width:max-content;border-radius:12px;background:#fff3ee;
border:1px solid #ffc9b3;color:#ff4800;padding:10px 24px;font-size:24px;font-weight:800;opacity:0}
.prj-mult.on{opacity:1;animation:prjPop .35s ease-out}
.prj-mult.alt{background:#131417;border-color:#131417;color:#fff;font-size:17px}
@keyframes prjPulse{50%{transform:scale(1.05)}}
@keyframes prjPop{0%{transform:translateX(-50%) scale(.6)}70%{transform:translateX(-50%) scale(1.08)}100%{transform:translateX(-50%) scale(1)}}
@keyframes prjRipple{from{box-shadow:0 0 0 0 rgba(255,72,0,.5)}to{box-shadow:0 0 0 18px rgba(255,72,0,0)}}
@keyframes prjPromote{0%,12%{top:392px;opacity:0}22%{opacity:1}82%{top:76px;opacity:1}100%{top:66px;opacity:0}}
`

const KW_WORDS = 'Cube|cube|dimension|metric|ratio|materializeFromEvents|bucketUrlSourceJsonEvents|pick|last'
  + '|PhysicalTopology|trinoIncrementalEtlAndSqlRouter|projection|parquetFile|colsCache'
const KW = new RegExp(`^(${KW_WORDS})$`)
const TOKENS = new RegExp(`('[^']*'|"[^"]*"|//[^\\n]*|\\b(?:${KW_WORDS})\\b)`, 'g')
const codePane = (h, text, hlOf = () => false) => h('pre:code', {}, ...text.split('\n').map((line, i) =>
  h(`div:cl${hlOf(line) ? ' hl' : ''}`, { key: i }, ...line.split(TOKENS).filter(Boolean).map((tok, j) => {
    const cls = tok.startsWith("'") || tok.startsWith('"') ? 's' : tok.startsWith('//') ? 'c' : KW.test(tok) ? 'k' : ''
    return h(cls ? `span:${cls}` : 'span', { key: j }, tok)
  }))))
const win = (h, { label, hint }, ...body) => h('div:pw', {}, h('div:pw-bar', {}, h('i'), h('i'), h('i'), label, hint && h('span', {}, hint)), ...body)

const CUBE_CODE = `Cube('finance3Cube', {
  impl: cube({
    source: materializeFromEvents({
      eventSource: bucketUrlSourceJsonEvents('room://payoneer/payment-events/\${period}/\${transaction_id}-\${counter}.json'),
      keyField: 'transaction_id',                        // all events of a transaction reduce to one silver row
      fields: [
        pick('timestamp as date, customer_id, customer_country, fee_bps'),
        pick('amount as transaction_value', { eventFilter: 'payment.captured', take: last() }),
        pick('status', { take: last() })                 // events → silver parquet, per period
      ]
    }),
    dimensions: [
      dimension('date', { type: 'timestamp' }),
      dimension('customer_country'),   dimension('customer_type'),   dimension('loyalty_tier'),
      dimension('product_category'),   dimension('brand'),           dimension('payment_channel'),
      dimension('payment_provider'),   dimension('status')           // …15 dimensions
    ],
    metrics: [
      metric('txns', 'count'),
      metric('gross_value', 'round(sum(transaction_value),2)', { unit: '$' }),
      metric('completed_value', "sum(case when status='completed' then transaction_value end)", { unit: '$' }),
      metric('payment_fees', 'round(sum(transaction_value*fee_bps/10000),2)', { unit: '$' }),
      ratio('completion_rate', 'completed_n/txns'),
      ratio('gross_margin', '(gross_value-estimated_cost)/gross_value')  // …15 metrics
    ]
  })
})`
const DASH_CODE = `dimensions: [
  dimension('customer_country'),
  dimension('customer_type'),
  dimension('loyalty_tier'),
  dimension('product_category')
],
metrics: [
  metric('gross_value', 'round(sum(transaction_value),2)'),
  metric('payment_fees', 'round(sum(transaction_value*fee_bps/10000),2)'),
  ratio('completion_rate', 'completed_n/txns')
]`
const DASH_DIMS = { customer_country: ['US', 'UK', 'DE', 'IL', 'SG'], customer_type: ['Marketplace', 'Direct', 'Platform'],
  loyalty_tier: ['Gold', 'Silver', 'Bronze'] }
const DASH_DATA = {
  gross_value: { fmt: v => `$${v}M`, customer_country: [9.2, 7.1, 5.8, 4.1, 3.3], customer_type: [12.4, 9.8, 7.2], loyalty_tier: [14.1, 9.3, 6.0] },
  payment_fees: { fmt: v => `$${v}K`, customer_country: [212, 164, 133, 94, 76], customer_type: [286, 225, 166], loyalty_tier: [324, 214, 138] },
  completion_rate: { fmt: v => `${v}%`, customer_country: [97.2, 96.1, 95.4, 93.8, 92.9], customer_type: [96.8, 95.2, 93.5], loyalty_tier: [98.1, 95.7, 94.2] }
}
// real footer stats of room://finance3/usersRO/silver/transactions-17mb.parquet — 16,961,821 B · 5.7M rows · 14 columns · 57 row groups · 74 KB footer
const PQ_COLS = [['source_row', 6243229], ['transaction_id', 5000408], ['date', 13146, 1], ['source_date_quality', 131690],
  ['customer_id', 1111192], ['product', 287696, 1], ['quantity', 763926], ['price', 1274336], ['payment_method', 151498],
  ['status', 273247, 1], ['missing_transaction_id', 33883], ['invalid_date', 68356], ['transaction_value', 1054106, 1], ['has_quality_issue', 55053]]
const AI_VOCAB = ['gross_value', 'completed_value', 'payment_fees', 'completion_rate', 'gross_margin', 'customer_country',
  'customer_type', 'loyalty_tier', 'product_category']
const AI_USED = ['completed_value', 'customer_country']
const AI_BARS = [['US', 100, '$4.1M'], ['UK', 71, '$2.9M'], ['DE', 41, '$1.7M']]
const AI_Q = 'Which countries drove completed volume in Q2?'
const AI_ANSWER = 'US and UK drove 58% of completed volume in Q2, led by marketplace sellers.'
// wasm 3.6s cold / 0.6s warm vs lambda 4.3s: measured on staging (solutions/finance/CLAUDE.md); 377 ranges / 6 files: comax-proxy-tests.js
const CE_RUNS = [['Browser WASM · first visit', 3.6], ['Browser WASM · warm cache', 0.6, 'hot'], ['Server lambda · every time', 4.3]]
const TRINO_CODE = `PhysicalTopology('financeAtScale', {
  impl: trinoIncrementalEtlAndSqlRouter({
    cubes: [finance2Cube(), marketingCube()],   // the same cubes, a bigger engine
    silverProjections: [
      projection('transactionGrain', {
        mainCubeFile: parquetFile('transactions', 's3://analytics/silver/transactions.parquet', { orderBy: 'date', compression: 'zstd' })
      }),
      projection('campaignDaily', {
        mainCubeFile: parquetFile('campaign_daily', 's3://analytics/silver/campaign_daily.parquet')   // pre-aggregated side table
      })
    ],
    cacheStrategy: colsCache()                  // physical placements decided by the cache optimizer
  })
})`
const PRJ_SHELVES = [
  ['RAM', 'microseconds', '#ff4800', 'Summary', 'day × campaign × country — pre-aggregated', '40 MB'],
  ['NVMe', 'milliseconds', '#ff9d66', 'Sorted slice', 'campaign · country · device · revenue', '2 GB'],
  ['S3', 'seconds', '#6b7280', 'Full table', 'all 150 columns, every row', '800 GB']
]
const PRJ = [
  { chip: 'Revenue by country — last 7 days', target: 0, verdicts: ['answers · 40 MB', 'answers · 2 GB', 'answers · 800 GB'],
    scan: '40 MB', barPct: 1.2, mult: '20,000× less data', tip: '~10 µs — served straight from RAM', answer: 'Answer in 12 ms' },
  { chip: 'Clicks by campaign × device — quarter', target: 1, verdicts: ['can’t answer', 'answers · 2 GB', 'answers · 800 GB'],
    scan: '2 GB', barPct: 8, mult: '400× less data', tip: '~40 ms — worker-local NVMe', answer: 'Answer in 0.4 s' },
  { chip: 'Ad-hoc — every column, one user', target: 2, verdicts: ['can’t answer', 'can’t answer', 'answers · 800 GB'],
    scan: '800 GB', barPct: 100, mult: 'always correct', tip: 'full scan — the safe fallback', answer: 'Correct, a bit later' }
]

const brand = h => h('div:p-brand', {}, h('i:mark', {}, 'W'), h('i:sep'), h('span:name', {}, 'Wonder'))
const SlideHead = ReactComp('slideHead.bi2', {
  impl: comp({ hFunc: ({}, { react: { h } }) => ({ eyebrow, title }) => h('div', {},
    eyebrow && h('div:p-eyebrow', {}, eyebrow),
    h('div:p-head', {}, h('h2', {}, title), brand(h))) })
})
ReactComp('deckShell.bi2', {
  impl: comp({ hFunc: ({}, { react: { h } }) => ({ children }) => h('main:de-deck', {}, h('style', {}, CSS), children) })
})
ReactComp('coverSlide.bi2', {
  impl: comp({ hFunc: ({}, { react: { h } }) => ({ slide }) => h('div:p-slide cover', {},
    brand(h),
    h('div:cover-body', {},
      h('div:c-eyebrow', {}, 'DATA ENGINEERING AS A SERVICE'),
      h('h1', {}, slide.title),
      h('p', {}, slide.subtitle)),
    h('div:cover-foot', {}, h('i'), 'Powered by Wonder')) })
})
ReactComp('teamSlide.bi2', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh } }) => ({ slide }) => h('div:p-slide', {},
    hh(ctx, SlideHead, { eyebrow: slide.eyebrow, title: slide.title }),
    h('div:team-grid', {}, ...slide.people.map(person => h('div:person', { key: person.name },
      h('img', { src: new URL(`./photos/${person.photo}`, import.meta.url), alt: person.name }),
      h('div:p-body', {}, h('h3', {}, person.name), h('p', {}, person.role))))),
    slide.foot && h('div:team-foot', {}, slide.foot))
  })
})
ReactComp('approachSlide.bi2', {
  impl: comp({
    hFunc: ({}, { react: { h } }) => ({ slide }) => {
    const statement = slide.title.split('byte-optimized')
    const usd = str => {
      const [main, forPart] = str.split(' for ')
      return str.includes('→')
        ? h('div:usd', {}, h('span:old', {}, str.split('→')[0].trim()), h('span:arr', {}, '  →  '), h('b:new', {}, str.split('→')[1].trim()))
        : h('div:usd', {}, h('b:new dark', {}, main), forPart && h('span:for', {}, ` for ${forPart}`))
    }
    return h('div:p-slide ap2', {},
      h('div:ap2-top', {},
        h('div:ap2-eyebrow', {}, slide.eyebrow),
        h('h1', {}, statement[0], statement.length > 1 && h('b', {}, 'byte-optimized'), statement[1])),
      h('div:appr', {}, ...slide.cards.map(card => h('div:a-card', { key: card.title },
        h('h3', {}, card.title),
        h('div:a-chips', {}, ...(card.chips || []).map(chip => h('span', { key: chip }, chip))),
        card.usd && usd(card.usd),
        card.text && h('p', {}, card.text),
        card.how && h('div:how', {}, card.how)))))
  }
  })
})

const CubeCodeViz = ReactComp('cubeCodeViz.bi2', {
  impl: comp({ hFunc: ({}, { react: { h } }) => () => win(h,
    { label: 'admin/finance/v3/finance3-cube.js', hint: 'every business definition lives here, once' }, codePane(h, CUBE_CODE)) })
})
const aiSqlChip = h => h('div:ai-sql', {}, h('b', {}, 'select'), ' customer_country, completed_value ', h('b', {}, 'where'), " quarter = '2025-Q2'")
const aiAnswerCard = (h, props) => h('div:ai-a', props, h('div:vhead', {}, 'Answer', h('span:vbadge', {}, h('i', {}, '✓'), 'Verified')),
  h('p', {}, AI_ANSWER), h('div:ai-bars', {}, ...AI_BARS.map(([label, width, value]) => h('div:ai-bar', { key: label }, label,
    h('i', { style: { width: `${width}%` } }), h('em', {}, value)))))
const aiVocabChips = (h, words) => h('div:vocab-chips', {}, ...words.map(word => h(`span${AI_USED.includes(word) ? ':used' : ''}`, { key: word }, word)))
const AiSequenceViz = ReactComp('aiSequenceViz.bi2', {
  impl: comp({
    hFunc: ({}, { react: { h } }) => () => {
    const arrow = (glyph, num, text) => h('div:arrow-c', {}, h('i', {}, glyph), h('span', {}, h('b:aif-step', {}, `${num} `), text))
    return win(h, { label: 'Ask AI — grounded in the cube', hint: 'every exchange passes through the cube' },
      h('div:viz-body', {}, h('div:aifC', {},
        h('div:lane', {}, h('b', {}, 'Wonder Cube'), h('span', {}, 'data model · query engine · verifier'),
          h('div:aif-store', { style: { marginTop: 16 } }, 'transactions.parquet')),
        h('div:ai-q', { style: { alignSelf: 'flex-start', borderRadius: '18px 18px 18px 4px' } }, AI_Q), h('div'),
        aiVocabChips(h, AI_VOCAB.slice(0, 6)), arrow('⟵', '①', 'injects the data model'),
        aiSqlChip(h), arrow('⟶', '②', 'SQL in cube vocabulary — compiled + run'),
        aiAnswerCard(h, { style: { maxWidth: 640 } }), arrow('⟵', '③', 'verified rows + evidence'))))
  }
  })
})
const DashboardViz = ReactComp('dashboardViz.bi2', {
  impl: comp({ hFunc: ({}, { react: { h, useState } }) => () => {
    const [dim, setDim] = useState('customer_country'), [met, setMet] = useState('gross_value')
    const { fmt, [dim]: values } = DASH_DATA[met], top = Math.max(...values)
    const select = (label, value, onChange, options) => [h('label', {}, label), h('select', { value, onChange: e => onChange(e.target.value) },
      ...options.map(x => h('option', { key: x }, x)))]
    return win(h, { label: 'Dashboard builder', hint: 'widgets are cube queries — pick, don’t code' },
      h('div:viz-body', {}, h('div:builder', {},
        h('div:b-panel', {}, h('h4', {}, 'New widget'),
          ...select('METRIC', met, setMet, Object.keys(DASH_DATA)), ...select('DIMENSION', dim, setDim, Object.keys(DASH_DIMS)),
          h('div:b-chart', {}, h('h5', {}, h('b', {}, met), ' by ', h('b', {}, dim)),
            h('div:b-bars', {}, ...values.map((value, i) => h('div:b-bar', { key: DASH_DIMS[dim][i] }, h('em', {}, fmt(value)),
              h('i', { style: { height: `${value / top * 82}%` } }), h('span', {}, DASH_DIMS[dim][i])))))),
        h('div:b-code', {}, codePane(h, DASH_CODE, line => line.includes(`'${dim}'`) || line.includes(`'${met}'`))))))
  } })
})
const ParquetViz = ReactComp('parquetViz.bi2', {
  impl: comp({ hFunc: ({}, { react: { h } }) => () => win(h,
    { label: 'transactions.parquet — 17 MB · 5.7M rows · 14 columns · 57 row groups', hint: 'real footer stats, read via parquet_metadata' },
    h('div:viz-body', {}, h('div:opt', {},
      h('div:sql-chip', {}, h('b', {}, 'select'), ' product, sum(transaction_value) ', h('b', {}, 'where'),
        " date >= '2024-07' and status = 'completed' ", h('b', {}, 'group by'), ' product'),
      h('div:pq-flow', {},
        h('div:pqm', {},
          h('div:pqm-lbls', {},
            h('div', {}, '2020-01 → 2024-06 · 46 row groups — skipped'),
            h('div:read', {}, 'date ≥ 2024-07 · 11 groups — read')),
          ...PQ_COLS.map(([name, bytes, lit]) => h(`div:pqm-col${lit ? ' read' : ''}`,
            { key: name, style: { flexGrow: bytes }, title: `${name} — ${Math.round(bytes / 1024)} KB` },
            h('i', {}, h('span', {}, name)), h('b')))),
        h('div:pq-arrow', {}, '⟶'),
        h('div:pq-stat', {}, h('b', {}, '0.41 MB'), h('span', {}, 'moved · 2.4%'), h('small', {}, '97.6% of the file never leaves storage'))),
      h('div:pq-caption', {},
        'We analyze the query log and lay out partitions, sort order and row groups to match it — scans shrink drastically, on this file 41×.')))) })
})
const ProjectionsViz = ReactComp('projectionsViz.bi2', {
  impl: comp({
    hFunc: ({}, { react: { h, useState, useEffect } }) => () => {
    const [{ q, step }, setSt] = useState({ q: 0, step: 0 })
    useEffect(() => {
      const timer = setInterval(() => setSt(s => s.step >= 13 ? { q: (s.q + 1) % PRJ.length, step: 0 } : { ...s, step: s.step + 1 }), 600)
      return () => clearInterval(timer)
    }, [])
    const sc = PRJ[q], at = n => step >= n
    const beamStyle = t => {
      const [bx, by] = [505 - 442, 105 + t * 128 - 192], len = Math.hypot(bx, by)
      return { width: len, transform: `rotate(${Math.atan2(by, bx)}rad) scaleX(${at(7) ? 1 : 0})` }
    }
    return h('div:prj', {},
      h('div:prj-chips', {}, ...PRJ.map((x, i) => h(`button${i == q ? ':on' : ''}`, { key: i, onClick: () => setSt({ q: i, step: 0 }) }, x.chip))),
      h('div:prj-main', {},
        h(`div:prj-q${at(0) ? ' in' : ''}`, {}, sc.chip),
        h(`div:prj-conn${at(2) ? ' on' : ''}`),
        h(`div:prj-cube${at(3) && step < 7 ? ' think' : ''}`, {}, h('b', {}, 'Wonder Cube'), h('span', {}, 'semantic layer')),
        h(`div:prj-cap${at(3) ? ' on' : ''}`, {}, 'finds the cheapest copy that answers correctly'),
        h(`div:prj-ans${at(8) ? ' on' : ''}`, {}, sc.answer),
        h('div:prj-beam', { style: beamStyle(sc.target) }),
        h('div:prj-panel', {},
          h('h5', {}, 'ONE TABLE · THREE COPIES · THREE TEMPERATURES'),
          ...PRJ_SHELVES.map(([tier, latency, color, name, sub, size], t) => h('div:prj-shelf', { key: tier, style: { '--tc': color } },
            h('div:prj-tier', {}, h('b', {}, tier), h('span', {}, latency)),
            h(`div:prj-card${at(7) ? sc.target == t ? ' on' : ' dim' : ''}`, {},
              h('b', {}, name), h('div:size', {}, size), h('small', {}, sub),
              h(`div:verdict${at(6 - t) ? ' show' : ''}${sc.target == t ? ' ok' : ''}`, {}, sc.verdicts[t])))),
          h('div:prj-promo'),
          h('div:foot', {}, 'hot data moves up to RAM, cold data moves down to S3 — automatically, by access frequency × bytes avoided')),
        h(`div:prj-tip${at(7) ? ' on' : ''}`, {}, sc.tip),
        h('div:prj-cost', {},
          h('h6', {}, 'DATA SCANNED'),
          h('div:prj-bar base', {}, 'without the cube', h('div:track', {}, h('i', { style: { width: at(9) ? '100%' : 0 } })), h('em', {}, '800 GB — full scan')),
          h('div:prj-bar opt', {}, 'with the cube', h('div:track', {}, h('i', { style: { width: at(10) ? `max(${sc.barPct}%, 8px)` : 0 } })),
            h('em', {}, `${sc.scan} — routed`))),
        h(`div:prj-mult${at(11) ? ' on' : ''}${sc.target == 2 ? ' alt' : ''}`, {}, sc.mult)))
  }
  })
})
const ClientEngineViz = ReactComp('clientEngineViz.bi2', {
  impl: comp({ hFunc: ({}, { react: { h } }) => () => h('div:ce', {},
    h('div:ce-flow', {},
      h('div:ce-card', {}, h('h4', {}, 'The user’s browser', h('small', {}, 'every user brings compute')),
        h('div:engine', {}, 'DuckDB WASM + cols_cache', h('small', {}, 'our parquet driver, statically linked — loads with the page')),
        h('div:sql-chip', { style: { marginTop: 14, fontSize: 13.5 } }, h('b', {}, 'select'), ' … ', h('b', {}, 'group by'), ' product')),
      h('div:ce-lane', {},
        h('em', {}, '377 byte-range requests · in parallel'),
        h('div:rng'), h('div:rng'), h('div:rng'),
        h('small', {}, 'only the queried column chunks move — no query server in the path')),
      h('div:ce-card', {}, h('h4', {}, 'S3 / GCS bucket', h('small', {}, 'optimized parquets')),
        h('div:engine', {}, 'footer + stats first', h('small', {}, 'row groups pruned by min/max before any data moves')))),
    h('div:ce-fallback', {}, 'hard / rare queries', h('i', {}, '⟶'), h('div:dark', {}, 'DuckDB Lambda · Trino / Athena'),
      'same cube, same SQL — routed server-side'),
    h('div:ce-runs', {}, h('h5', {}, 'Same 7-widget dashboard, time to paint ', h('span', {}, '— measured on staging')),
      ...CE_RUNS.map(([label, seconds, hot]) => h(`div:run${hot ? ' hot' : ''}`, { key: label }, h('span', {}, label),
        h('i', { style: { width: `${seconds / 4.3 * 100}%` } }), h('em', {}, `${seconds} s`)))),
    h('div:ce-note', {}, '10,000 users mean ', h('b', {}, '10,000 query engines'), ' — and zero servers to scale.')) })
})

const SQL_COLORS = { cache: '#ff4800', projB: '#d97706', parquets: '#6b7280' }
const CUBE_IN_SQL = [
  [{ kw: 'select' }, ' customer_country, gross_value, completion_rate'],
  [{ kw: 'where' }, ' date >= today() - 30'],
  [{ kw: 'group by' }, ' customer_country']
]
const CUBE_OUT_SQL = [
  [{ kw: 'SELECT' }, ' c.customer_country,'],
  ['       round(sum(t.transaction_value), 2)                ', { kw: 'AS' }, ' gross_value,'],
  ["       count(*) FILTER (status = 'completed') / count(*) ", { kw: 'AS' }, ' completion_rate'],
  [{ kw: 'FROM' }, ' ('],
  ['  ', { kw: 'SELECT' }, ' * ', { kw: 'FROM' }, ' ', { src: 'cache', text: 'local_cache.tx_hot_7d' },
    '                                  ', { c: '-- last 7 days · already warm in RAM' }],
  ['  ', { kw: 'UNION ALL' }],
  ['  ', { kw: 'SELECT' }, ' * ', { kw: 'FROM' }, ' ', { src: 'parquets', text: "read_parquet('s3://acme/silver/transactions.parquet')" },
    '  ', { c: '-- 23 colder days · byte-ranges' }],
  ['  ', { kw: 'WHERE' }, " date >= date '2026-07-31'"],
  [') t'],
  [{ kw: 'JOIN' }, ' ', { src: 'projB', text: 'proj_b.customers' }, ' c ', { kw: 'USING' }, ' (customer_id)',
    '                     ', { c: '-- Projection B · country per customer' }],
  [{ kw: 'GROUP BY' }, ' c.customer_country']
]
const sqlPane = (h, lines) => h('pre:code', {}, ...lines.map((segs, i) => h('div:cl', { key: i }, ...segs.map((seg, j) =>
  typeof seg == 'string' ? h('span', { key: j }, seg)
  : seg.kw ? h('span:k', { key: j }, seg.kw)
  : seg.c ? h('span:c', { key: j }, seg.c)
  : h('span', { key: j, 'data-src': seg.src, style: { borderBottom: `3px solid ${SQL_COLORS[seg.src]}`, color: '#fff', fontWeight: 700 } }, seg.text)))))
const CubeSqlViz = ReactComp('cubeSqlViz.bi2', {
  impl: comp({
    hFunc: ({}, { react: { h } }) => () => h('div:sqlv', {},
    win(h, { label: 'what the dashboard asks', hint: 'cube vocabulary — no joins, no files' }, sqlPane(h, CUBE_IN_SQL)),
    h('div:sqlv-arrow', {}, '↓   the cube compiles — joins and physical sources injected, invisible to the user'),
    win(h, { label: 'what actually runs', hint: 'each source underlined — follow its arrow into the stack' }, sqlPane(h, CUBE_OUT_SQL)),
    h('div:sqlv-note', {}, 'One logical table became ', h('b', {}, 'three physical sources'),
      ' — the cheapest copies that still answer correctly.'))
  })
})

const LocalCacheViz = ReactComp('localCacheViz.bi2', {
  impl: comp({
    hFunc: ({}, { react: { h } }) => () => h('div:lc', {},
    h('div:lc-sec', {}, h('h4', {}, h('i', {}, '①'), 'Fast, zero cost Queries')),
    h('div:lc-sec', {}, h('h4', {}, h('i', {}, '②'), 'Our Optimized WASM engine')),
    h('div:lc-sec lc-grow', {}, h('h4', {}, h('i', {}, '③'), 'Incrementally Updating'),
      h('div:lc-flow', {},
        h('div:lc-cache', {}, h('h5', {}, 'Local cache'),
          h('div:lc-segs', {},
            ...['2026-04', '2026-05', '2026-06', '2026-07'].map(month => h('div:seg', { key: month }, month)),
            h('div:seg head', {}, 'head · today'))),
        h('div:lc-arrows', {},
          h('div:lc-arrow', {}, h('em', {}, 'only the updates'), h('div:ln'), h('small', {}, '+0.3% of the data · 210 ms'))),
        h('div:lc-bucket', {}, h('h5', {}, 'S3 / Parquets')))) )
  })
})

const TrinoViz = ReactComp('trinoViz.bi2', {
  impl: comp({
    hFunc: ({}, { react: { h } }) => () => win(h,
    { label: 'solutions/bi2/de-dsl.js — physical topologies', hint: 'declared once, deployed to the engine that fits' }, codePane(h, TRINO_CODE))
  })
})

const SHOWCASE_VIEWS = { semantic: CubeCodeViz, ai: AiSequenceViz, dashboards: DashboardViz }
ReactComp('showcaseSlide.bi2', {
  impl: comp({ hFunc: (ctx, { react: { h, hh, useState } }) => ({ slide }) => {
    const [selected, setSelected] = useState(0), item = slide.items[selected]
    return h('div:p-slide', {}, hh(ctx, SlideHead, { eyebrow: slide.eyebrow, title: slide.title }),
      slide.subtitle && h('div:p-sub', {}, slide.subtitle),
      h('div:showcase', {}, h('div:show-list', {}, ...slide.items.map((x, i) => h('button:show-item', {
        key: x.id, className: i == selected ? 'on' : '', onClick: () => setSelected(i), 'data-testid': `show-${x.id}`
      }, h('b', {}, x.title), h('span', {}, x.text),
        i == selected && x.details?.length ? h('div:show-details', {}, ...x.details.map(d => h('div', { key: d }, d))) : null))),
      h('div:show-viz', {}, hh(ctx, SHOWCASE_VIEWS[item.id] || CubeCodeViz))))
  } })
})

const sBox = (h, x, y, w, hgt, title, sub, dark) => [h('rect:nb', { x, y, width: w, height: hgt, rx: 14, fill: dark ? '#131417' : '#fff',
  stroke: dark ? '#131417' : '#d9d9de', strokeWidth: 1.5, filter: 'drop-shadow(0 8px 18px rgba(23,23,23,.08))' }),
  h('text', { x: x + w / 2, y: y + (sub ? hgt / 2 - 4 : hgt / 2 + 7), textAnchor: 'middle', fontSize: 20, fontWeight: 800,
    fill: dark ? '#fff' : '#171717' }, title),
  sub && h('text', { x: x + w / 2, y: y + hgt / 2 + 24, textAnchor: 'middle', fontSize: 14, fill: dark ? '#9aa1ab' : '#6b7280' }, sub)]
const sDrill = (h, sel, onSel, id, x, y, w, hgt, title, sub, dark) => h(`g:an${sel == id ? ' sel' : ''}`,
  { onClick: () => onSel(id), 'data-testid': `arch-${id}` },
  ...sBox(h, x, y, w, hgt, title, sub, dark), h('circle', { cx: x + w - 16, cy: y + 16, r: 5, fill: '#ff4800' }))
const ARCH = (h, sel, onSel) => {
  const zone = (x, y, w, hgt, label, warm) => [h('rect', { x, y, width: w, height: hgt, rx: 20, fill: 'none',
    stroke: warm ? '#ffb79b' : '#c9ccd2', strokeWidth: 1.6, strokeDasharray: '8 7' }),
    h('text', { x: x + 24, y: y + 34, fill: warm ? '#ff4800' : '#8a8a92', fontSize: 15, fontWeight: 800, letterSpacing: 2 }, label)]
  const box = (...args) => sBox(h, ...args)
  const drill = (...args) => sDrill(h, sel, onSel, ...args)
  const arrow = (x1, y1, x2, y2, both) => h('line', { x1, y1, x2, y2, stroke: '#9aa0a6', strokeWidth: 2,
    markerEnd: 'url(#de-ah)', markerStart: both && 'url(#de-ah)' })
  return h('svg', { viewBox: '0 0 1760 700' },
    h('defs', {}, h('marker', { id: 'de-ah', markerWidth: 9, markerHeight: 9, refX: 7, refY: 4.5, orient: 'auto-start-reverse' },
      h('path', { d: 'M0,0 L9,4.5 L0,9 z', fill: '#9aa0a6' }))),
    h('rect', { x: 60, y: 8, width: 1640, height: 90, rx: 16, fill: '#fff', stroke: '#d9d9de', strokeWidth: 1.5,
      filter: 'drop-shadow(0 8px 18px rgba(23,23,23,.08))' }),
    h('text', { x: 880, y: 63, textAnchor: 'middle', fontSize: 26, fontWeight: 800, fill: '#171717' }, 'Business / Data Analyst Requirements'),
    h('path', { d: 'M 880 98 C 1060 150 1270 160 1270 282', fill: 'none', stroke: '#9aa0a6', strokeWidth: 2, markerEnd: 'url(#de-ah)' }),
    ...zone(20, 130, 350, 520, 'CUSTOMER DATA'), ...zone(410, 130, 620, 520, 'WONDER BACKEND ENGINE', true),
    ...box(60, 210, 270, 120, 'Event Source', 'streams · CDC · files'),
    ...box(60, 470, 270, 120, 'Master Data', 'users · products · accounts'),
    drill('parquets', 450, 210, 260, 120, 'Optimized Parquets', 'partitioned by the query log'),
    drill('projections', 750, 210, 240, 120, 'Optimized Projections', 'RAM · NVMe · bucket'),
    ...box(930, 475, 200, 110, 'Athena / Trino', 'hard & rare queries'),
    drill('cube', 1150, 290, 240, 190, 'Wonder Cube', 'data model · optimizer · router', true),
    h(`g:an${sel == 'client' ? ' sel' : ''}`, { onClick: () => onSel('client'), 'data-testid': 'arch-client' },
      h('rect:nb', { x: 1440, y: 130, width: 300, height: 520, rx: 20, fill: '#fff',
        stroke: '#c9ccd2', strokeWidth: 1.6, strokeDasharray: '8 7' }),
      h('text', { x: 1464, y: 164, fill: '#ff4800', fontSize: 15, fontWeight: 800, letterSpacing: 2 }, 'WONDER CLIENT ENGINE'),
      h('circle', { cx: 1724, cy: 146, r: 5, fill: '#ff4800' }),
      ...box(1480, 220, 220, 120, 'Dashboards', 'run in the browser'),
      ...box(1480, 470, 220, 120, 'AI', 'verified answers')),
    arrow(330, 270, 450, 270), arrow(330, 530, 450, 530),
    arrow(1030, 385, 1150, 385, true),
    arrow(1480, 300, 1392, 350), arrow(1480, 510, 1392, 425))
}
const DRILLS = {
  cube: ['Wonder Cube — business logic, written once', CubeCodeViz],
  parquets: ['Optimized Parquets — scan less, pay less', ParquetViz],
  projections: ['Optimized Projections — route to the cheapest copy', ProjectionsViz],
  client: ['Wonder Client Engine — every user brings compute', ClientEngineViz]
}
const drillPane = (ctx, { h, hh }, drill, close) => h(`div:drill${drill ? ' open' : ''}`, {},
  drill && h('div:drill-in', {},
    h('div:drill-head', {}, h('div', {}, h('div:d-eyebrow', {}, 'DRILL DOWN'), h('h3', {}, drill[0])),
      h('button', { onClick: close }, '✕')),
    h('div:drill-body', { key: drill[0] }, hh(ctx, drill[1]))))
ReactComp('archSlide.bi2', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh, useState } }) => ({ slide }) => {
    const [focus, setFocus] = useState(null), drill = DRILLS[focus]
    return h('div:p-slide', {}, hh(ctx, SlideHead, { eyebrow: slide.eyebrow, title: slide.title }),
      slide.subtitle && h('div:p-sub', {}, slide.subtitle),
      h('div:arch-wrap', {},
        h(`div:arch${drill ? ' dim' : ''}`, {}, ARCH(h, focus, id => setFocus(id == focus ? null : id))),
        drillPane(ctx, { h, hh }, drill, () => setFocus(null))))
  }
  })
})

const STACK = (h, sel, onSel) => h('svg', { viewBox: '0 0 760 880' },
  h('defs', {}, h('marker', { id: 'st-ah', markerWidth: 9, markerHeight: 9, refX: 7, refY: 4.5, orient: 'auto-start-reverse' },
    h('path', { d: 'M0,0 L9,4.5 L0,9 z', fill: '#9aa0a6' }))),
  h('rect', { x: 60, y: 16, width: 560, height: 56, rx: 12, fill: '#131417' }),
  h('text', { x: 340, y: 50, textAnchor: 'middle', fontSize: 14.5, fontFamily: 'ui-monospace,Menlo,monospace', fill: '#e8c98a' },
    'select customer_country, gross_value where date >= today()-30'),
  h('line', { x1: 340, y1: 76, x2: 340, y2: 136, stroke: '#9aa0a6', strokeWidth: 2, markerEnd: 'url(#st-ah)' }),
  sDrill(h, sel, onSel, 'cube', 230, 142, 220, 95, 'Cube', 'semantic layer', true),
  h('line', { x1: 340, y1: 239, x2: 340, y2: 284, stroke: '#9aa0a6', strokeWidth: 2, markerEnd: 'url(#st-ah)' }),
  sDrill(h, sel, onSel, 'cache', 235, 288, 210, 72, 'Local cache', null),
  h(`g:an${sel == 'projections' ? ' sel' : ''}`, { onClick: () => onSel('projections'), 'data-testid': 'arch-stack-projections' },
    ...sBox(h, 120, 400, 160, 95, 'Projection A', null), ...sBox(h, 300, 400, 160, 95, 'Projection B', null),
    ...sBox(h, 480, 400, 160, 95, 'Projection C', null), h('circle', { cx: 624, cy: 416, r: 5, fill: '#ff4800' })),
  h(`g:an${sel == 'trino' ? ' sel' : ''}`, { onClick: () => onSel('trino'), 'data-testid': 'arch-stack-trino' },
    h('rect:nb', { x: 120, y: 540, width: 520, height: 150, rx: 16, fill: '#fff', stroke: '#c9ccd2', strokeWidth: 1.6, strokeDasharray: '8 7' }),
    h('text', { x: 150, y: 588, fontSize: 24, fontWeight: 800, fill: '#171717' }, 'Trino / Athena'),
    h('circle', { cx: 624, cy: 556, r: 5, fill: '#ff4800' })),
  sDrill(h, sel, onSel, 'optimizer', 330, 655, 270, 66, 'Cache optimizer', null),
  sDrill(h, sel, onSel, 'parquets', 120, 745, 520, 100, 'Parquets', 'optimized layout, on the bucket'))
const STACK_DRILLS = {
  cube: ['Cube — one simple query, the best physical plan', CubeSqlViz],
  cache: ['Local cache', LocalCacheViz],
  projections: ['Projections — route to the cheapest copy', ProjectionsViz],
  trino: ['Trino / Athena — hard & rare queries, same cube', TrinoViz],
  optimizer: ['Cache optimizer — hot up, cold down, automatically', ProjectionsViz],
  parquets: ['Parquets — scan less, pay less', ParquetViz]
}
ReactComp('stackSlide.bi2', {
  impl: comp({
    hFunc: (ctx, { react: { h, hh, useState, useEffect, useRef } }) => ({ slide }) => {
    const [focus, setFocus] = useState(null), [links, setLinks] = useState(null), wrapRef = useRef()
    const drill = STACK_DRILLS[focus]
    useEffect(() => {
      if (focus != 'cube') return setLinks(null)
      const wrap = wrapRef.current, drillEl = wrap.querySelector('.drill')
      const measure = () => {
        const wr = wrap.getBoundingClientRect(), scale = wr.width / wrap.offsetWidth
        const local = r => ({ x: (r.left - wr.left) / scale, y: (r.top - wr.top) / scale, w: r.width / scale, h: r.height / scale })
        const targetOf = src => src == 'projB' ? wrap.querySelectorAll('[data-testid=arch-stack-projections] rect.nb')[1]
          : wrap.querySelector(`[data-testid=arch-${src}] rect.nb`)
        setLinks([...wrap.querySelectorAll('[data-src]')].map(span => {
          const target = targetOf(span.dataset.src)
          return target && { src: span.dataset.src, from: local(span.getBoundingClientRect()), to: local(target.getBoundingClientRect()) }
        }).filter(Boolean))
      }
      const onEnd = e => e.propertyName == 'width' && measure()  // the pane finished sliding — geometry is final
      drillEl.addEventListener('transitionend', onEnd)
      const fallback = setTimeout(measure, 700)                  // no width transition happens when the pane was already open
      return () => (drillEl.removeEventListener('transitionend', onEnd), clearTimeout(fallback))
    }, [focus])
    return h('div:p-slide', {}, hh(ctx, SlideHead, { eyebrow: slide.eyebrow, title: slide.title }),
      slide.subtitle && h('div:p-sub', {}, slide.subtitle),
      h('div:arch-wrap', { ref: wrapRef },
        h(`div:arch stack-d${drill ? ' dim' : ''}`, {}, STACK(h, focus, id => setFocus(id == focus ? null : id))),
        h('div:spacer'),
        drillPane(ctx, { h, hh }, drill, () => setFocus(null)),
        links && h('svg:sql-links', { viewBox: `0 0 ${wrapRef.current.offsetWidth} ${wrapRef.current.offsetHeight}` },
          h('defs', {}, ...Object.entries(SQL_COLORS).map(([src, color]) => h('marker',
            { key: src, id: `lk-${src}`, markerWidth: 8, markerHeight: 8, refX: 7, refY: 4, orient: 'auto' },
            h('path', { d: 'M0,0 L8,4 L0,8 z', fill: color })))),
          ...links.flatMap(({ src, from, to }) => [
            h('path', { key: src, d: `M ${from.x - 4} ${from.y + from.h} C ${from.x - 200} ${from.y + from.h},
              ${to.x + to.w + 150} ${to.y + to.h / 2}, ${to.x + to.w + 8} ${to.y + to.h / 2}`,
              fill: 'none', stroke: SQL_COLORS[src], strokeWidth: 2.5, markerEnd: `url(#lk-${src})` }),
            h('rect', { key: `${src}-ring`, x: to.x - 4, y: to.y - 4, width: to.w + 8, height: to.h + 8, rx: 16,
              fill: 'none', stroke: SQL_COLORS[src], strokeWidth: 2.5 })]))))
  }
  })
})

const { slide: { coverSlide, teamSlide, approachSlide, showcaseSlide, archSlide, stackSlide },
  person: { person }, 'approach-card': { approachCard }, 'showcase-item': { showcaseItem } } = dsls.deck

ReactComp('deServiceDeck', {
  moreTypes: 'deck<deck>',
  impl: deckPlayer({
    slides: [
      coverSlide({
        title: 'Data Engineering as a Service',
        subtitle: 'Tailored, byte-optimized data platforms — from raw event streams to AI-verified dashboards.'
      }),
      teamSlide('Meet the Team', 'WHO WE ARE', {
        people: [
          person({
            name: 'Shai Ben-Yehuda',
            role: 'World class leader of DSL design, with decades of experience in software design, system integration and data processing.',
            photo: 'shai.jpg'
          }),
          person('Yiftach Neuman', 'AI and Data Science expert, Ex 8200', { photo: 'yiftach.jpg' }),
          person('Roee Winder', 'Data engineering and GenAI expert, Ex 8200', { photo: 'roee.jpg' })
        ],
        foot: 'Deep expertise across enterprise integration, AI and data engineering'
      }),
      approachSlide({
        title: 'Delivering tailored, byte-optimized data solutions to reduce complexity and costs and increase efficiency and AI use',
        eyebrow: 'OUR APPROACH',
        cards: [
          approachCard('Reducing BigQuery Bill', '$20k/m → $180/m', {
            how: 'Using Incremental ETLs and our Client Engine',
            chips: ['Gaming']
          }),
          approachCard('Delivering serverless BI', '$2,000/m for 1M users', {
            how: 'Using Parquet optimization and our Client Engine',
            chips: ['Finance','POC']
          }),
          approachCard('Vibe coded, reliable live Dashboards', {
            text: 'Throw away Tableau and Sigma',
            chips: ['Marketing']
          })
        ]
      }),
      showcaseSlide('Wonder Cube — Semantic Data Modeling', 'THE DATA MODEL', {
        items: [
          showcaseItem('semantic', 'Semantic Layer', {
            text: 'The finance cube defines shared business meaning.',
            details: ['Metrics & dimensions declared once','Business logic leaves the queries']
          }),
          showcaseItem('ai', 'AI Ready', {
            text: 'The same vocabulary constrains and verifies AI answers.',
            details: ['LLM constrained to the cube','Verified answers with evidence']
          }),
          showcaseItem('dashboards', 'Dashboards', {
            text: 'Metrics and dimensions compose reusable BI experiences.',
            details: ['Widgets = cube queries','Pick metric × dimension, done']
          })
        ]
      }),
      archSlide('Wonder Dashboard Architecture', 'THE PLATFORM', {
        subtitle: 'Click a highlighted component to drill down.'
      }),
      stackSlide('The Query Serving Stack', 'THE QUERY PATH', {
        subtitle: 'Click a highlighted component to drill down.'
      })
    ],
    metadata: applet({ title: 'Data Engineering as a Service', icon: 'Presentation', showMessageInput: false })
  })
})
