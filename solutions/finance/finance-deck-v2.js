import { dsls } from '@jb6/core'
import '@jb6/react'
import '@wonder/ui/applets/applet.js'
import '@wonder/ai/llm-flow-core.js'
import '@wonder/ui/idf/deck-dsl.js'

const {
  tgp: { TgpType, 'ctx-enricher': { addCategory } },
  deck: { Deck, Slide },
  react: { ReactComp, 'react-comp': { comp, deckPlayer }, 'react-metadata': { applet } }
} = dsls

const ShowcaseItem = TgpType('showcase-item', 'deck')
const Person = TgpType('person', 'deck')
const ArchChip = TgpType('arch-chip', 'deck')
const TimelinePhase = TgpType('timeline-phase', 'deck')

ShowcaseItem('showcaseItem', { params: [
  { id: 'id', as: 'string' }, { id: 'title', as: 'string' }, { id: 'text', as: 'string' }, { id: 'details', type: 'data<common>[]' }
] })
Person('person', { params: [
  { id: 'name', as: 'string' }, { id: 'role', as: 'string' }, { id: 'photo', as: 'string' }, { id: 'tags', type: 'data<common>[]' }
] })
ArchChip('archChip', { params: [
  { id: 'id', as: 'string' }, { id: 'title', as: 'string' }, { id: 'tag', as: 'string' }, { id: 'text', as: 'string' }
] })
TimelinePhase('timelinePhase', { params: [
  { id: 'title', as: 'string' }, { id: 'duration', as: 'string' }, { id: 'startWeek', as: 'number' }, { id: 'endWeek', as: 'number' },
  { id: 'items', type: 'data<common>[]' }, { id: 'solidUntil', as: 'number' }, { id: 'optional', as: 'boolean' }, { id: 'milestone', as: 'boolean' }
] })
Slide('coverSlide', { params: [{ id: 'title', as: 'string' }, { id: 'subtitle', as: 'string' }, { id: 'eyebrow', as: 'string' }] })
Slide('teamSlide', { params: [{ id: 'title', as: 'string' }, { id: 'eyebrow', as: 'string' }, { id: 'people', type: 'person[]' }] })
Slide('interactiveShowcaseSlide', { params: [
  { id: 'title', as: 'string' }, { id: 'eyebrow', as: 'string' }, { id: 'subtitle', as: 'string' }, { id: 'items', type: 'showcase-item[]' }
] })
Slide('architectureSlide', { params: [{ id: 'title', as: 'string' }, { id: 'eyebrow', as: 'string' }, { id: 'chips', type: 'arch-chip[]' }] })
Slide('clientServerSlide', { params: [{ id: 'title', as: 'string' }, { id: 'eyebrow', as: 'string' }] })
Slide('timelineSlide', { params: [
  { id: 'title', as: 'string' }, { id: 'eyebrow', as: 'string' }, { id: 'weeks', as: 'number' }, { id: 'phases', type: 'timeline-phase[]' }
] })

const DEMO_URL = globalThis.location?.hostname == 'localhost'
  ? '/jb6_packages/react/react-comp-view.html?cmpId=FinanceDemo&urlsToLoad=@solution/finance/finance-demo.js&logo=payoneer&logger=biDownloadLogger,colsCacheLogger'
  : 'https://w-staging.indivi.ai/room/4c7ef0/applet/FinanceDemo?logo=payoneer&logger=biDownloadLogger,colsCacheLogger'

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*{box-sizing:border-box}
.payoneer-deck{height:100vh;background:#fff;color:#171717;font-family:Inter,system-ui,sans-serif}
.payoneer-deck>.reveal{height:100vh}.payoneer-deck .reveal .slides{text-align:inherit}
.payoneer-deck .reveal .slides section{height:1080px}.payoneer-deck .reveal .slides .p-slide.present{display:flex!important}
.payoneer-deck .reveal .controls{color:#ff4800}.payoneer-deck .reveal .progress{color:#ff4800;height:4px}
.payoneer-deck *{scrollbar-color:#d9d9de transparent;scrollbar-width:thin}
.p-slide{width:100%;height:100%;padding:60px 84px 56px;background:#fff;display:flex;flex-direction:column;text-align:left;overflow:hidden}
.p-head{display:flex;justify-content:space-between;align-items:flex-end;gap:40px;margin-bottom:26px}
.p-eyebrow{margin-bottom:10px;color:#ff4800;font-size:17px;font-weight:800;letter-spacing:.22em}
.p-head h2{margin:0;max-width:1500px;color:#171717;font-size:56px;line-height:1.06;letter-spacing:-.035em;text-transform:none}
.p-brand{display:flex;align-items:center;gap:13px;padding-bottom:8px;white-space:nowrap}
.p-brand .mark{width:36px;height:36px;border-radius:11px;background:#ff4800;color:#fff;display:grid;place-items:center;font:800 21px Inter;font-style:normal}
.p-brand .sep{width:1.5px;height:26px;background:#d9d9de}
.p-brand .name{font-size:24px;font-weight:800;color:#171717}
.p-sub{margin:-8px 0 24px;color:#686868;font-size:24px}
.cover .cover-body{flex:1;display:flex;flex-direction:column;justify-content:center;gap:30px}
.cover .c-eyebrow{color:#ff4800;font:700 23px ui-monospace,Menlo,monospace;letter-spacing:.2em}
.cover h1{margin:0;max-width:1150px;color:#171717;font-size:132px;line-height:1.05;letter-spacing:-.035em;text-transform:none}
.cover p{margin:0;max-width:1100px;color:#555;font-size:34px;line-height:1.45}
.cover-foot{display:flex;align-items:center;gap:14px;color:#8a8a92;font:600 21px ui-monospace,Menlo,monospace}
.cover-foot i{width:15px;height:15px;border-radius:50%;background:#ff4800}
.demo-col{flex:1;min-width:0;display:flex;flex-direction:column}
.demo-toggle{display:flex;justify-content:flex-end;gap:8px;margin-bottom:12px}
.demo-toggle button{min-width:130px;padding:9px 26px;border:1px solid #ddd;border-radius:999px;background:#fff;color:#444;
font:700 16px Inter;cursor:pointer;text-transform:capitalize;transition:.2s}
.demo-toggle button.on{border-color:#ff4800;background:#ff4800;color:#fff;box-shadow:0 10px 26px rgba(255,72,0,.3)}
.pw{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;border:1px solid #e3e3e8;border-radius:18px;overflow:hidden;background:#fff;
box-shadow:0 22px 60px rgba(23,23,23,.08)}
.pw-bar{height:52px;flex:none;display:flex;align-items:center;gap:9px;padding:0 20px;background:#131417;color:#ececf1;font-size:15px;font-weight:700}
.pw-bar i{width:11px;height:11px;border-radius:50%;background:#3a3d45}.pw-bar i.live{background:#ff4800;animation:pulse 1.6s infinite}
.pw-bar span{margin-left:auto;color:#8f939e;font-size:13px;font-weight:500}
.pw-bar button{margin-left:14px;border:1px solid #3a3d45;border-radius:8px;background:transparent;color:#ececf1;padding:5px 12px;font:600 13px Inter;cursor:pointer}
.pw-bar button:hover{border-color:#ff4800;color:#ff8b60}
@keyframes pulse{50%{opacity:.35}}
.payoneer-deck .reveal pre.code{flex:1;min-height:0;width:100%;margin:0;padding:24px 28px;overflow:auto;background:#131417;box-shadow:none;
text-align:left;font:15.5px/1.62 ui-monospace,SFMono-Regular,Menlo,monospace}
.cl{white-space:pre;color:#c9cdd6}.cl.hl{background:#4a1c07;box-shadow:0 0 0 4px #4a1c07;border-radius:3px}
.cl .k{color:#ff8b60;font-weight:600}.cl .s{color:#e8c98a}.cl .c{color:#6d727e}
.team-grid{flex:1;min-height:0;display:grid;grid-template-columns:repeat(3,1fr);gap:36px}
.person{display:flex;flex-direction:column;border:1px solid #e6e6ea;border-radius:24px;background:#fff;overflow:hidden;box-shadow:0 22px 60px rgba(23,23,23,.07)}
.person img{width:100%;height:470px;object-fit:cover;border-bottom:4px solid #ff4800}
.person .p-body{flex:1;display:flex;flex-direction:column;gap:14px;padding:34px 36px}
.person h3{margin:0;color:#171717;font-size:37px;letter-spacing:-.02em;text-transform:none}
.person p{margin:0;color:#555;font-size:22px;line-height:1.5}
.p-tags{display:flex;gap:10px;flex-wrap:wrap;margin-top:auto}
.p-tags span{border:1px solid #ffc9b3;border-radius:999px;background:#fff3ee;color:#b93200;padding:7px 16px;font-size:16px;font-weight:700}
.team-foot{margin-top:30px;padding-top:22px;border-top:1px solid #e8e8eb;color:#555;text-align:center;font-size:24px}
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
.demo-iframe{flex:1;width:100%;min-height:0;border:0;background:#fff}
.arch{flex:1;min-height:0;display:flex;flex-direction:column;gap:6px}
.arch svg{flex:1;min-height:0;width:100%}
.arch-chips{display:flex;justify-content:center;gap:16px}
.arch-chip{min-width:250px;padding:15px 28px;border:1px solid #ddd;border-radius:999px;background:#fff;color:#444;font:700 21px Inter;cursor:pointer;transition:.2s}
.arch-chip.on{border-color:#ff4800;background:#ff4800;color:#fff;box-shadow:0 12px 34px rgba(255,72,0,.35)}
.arch-note{height:36px;margin-top:14px;color:#555;text-align:center;font-size:22px}
.viz-body{flex:1;min-height:0;display:flex;background:#fafafa}
.opt{flex:1;min-width:0;padding:24px 30px;display:flex;flex-direction:column;gap:16px}
.sql-chip{align-self:flex-start;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;border:1px solid #e3e3e8;border-radius:12px;
background:#131417;color:#e8c98a;padding:13px 22px;font:600 16px ui-monospace,Menlo,monospace}.sql-chip b{color:#ff8b60;font-weight:600}
.pq-flow{flex:1;min-height:0;display:flex;align-items:center;gap:30px}
.pqm{flex:1;min-height:0;align-self:stretch;display:flex;gap:2px}
.pqm-lbls{display:flex;flex-direction:column;width:225px;margin-right:14px}
.pqm-lbls>div{flex:810;display:flex;align-items:center;justify-content:flex-end;text-align:right;color:#9a9aa2;font-size:15px;font-weight:600}
.pqm-lbls>div.read{flex:190;color:#b93200}
.pqm-col{position:relative;display:flex;flex-direction:column;min-width:15px;flex-basis:0}
.pqm-col>i{flex:810;min-height:0;display:flex;background:#ececee}
.pqm-col>b{flex:190;background:#dcdce1}
.pqm-col.read>b{background:#ff4800;box-shadow:0 8px 20px rgba(255,72,0,.28)}
.pqm-col>i span{margin:0 auto;padding-top:12px;writing-mode:vertical-rl;color:#9a9aa2;font:600 13px ui-monospace,Menlo,monospace;overflow:hidden}
.pqm-col.read>i span{color:#b93200;font-weight:700}
.pqm-col:after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(180deg,transparent 0 calc(1.7544% - 1px),#fff calc(1.7544% - 1px) 1.7544%)}
.pq-arrow{color:#ff4800;font-size:40px}
.pq-stat{display:grid;gap:8px;white-space:nowrap}
.pq-stat b{color:#171717;font-size:56px;letter-spacing:-.03em;line-height:1}
.pq-stat span{color:#ff4800;font-size:22px;font-weight:800}
.pq-stat small{color:#8a8a92;font-size:16px;font-weight:600;white-space:normal;max-width:230px;line-height:1.4}
.pq-caption{flex:none;color:#555;text-align:center;font-size:21px}
.bench{flex:1;min-width:0;display:grid;grid-template-columns:480px 1fr}
.bench-code{display:flex;flex-direction:column;min-width:0;background:#131417}
.payoneer-deck .reveal .bench-code pre.code{font-size:14.5px}
.bench-right{min-width:0;display:flex;flex-direction:column;gap:14px;padding:20px 26px}
.wf{min-width:0;flex:1;display:flex;flex-direction:column;border:1px solid #e6e6ea;border-radius:16px;background:#fff;padding:18px 24px 12px}
.wf-head{display:flex;justify-content:space-between;align-items:baseline;gap:20px;margin-bottom:6px}
.wf-head b{font-size:18px;color:#171717}.wf-head span{color:#8a8a92;font-size:14px;font-weight:600;white-space:nowrap}
.wf-axis,.wf-row{display:grid;grid-template-columns:258px 52px 1fr;gap:12px;align-items:center}
.wf-axis>div{position:relative;height:24px;color:#9a9aa2;font-size:12.5px;font-weight:600}
.wf-axis span{position:absolute;top:4px;transform:translateX(-50%);white-space:nowrap}
.wf-row{flex:1;min-height:26px}
.wf-row .lbl{min-width:0;color:#444;font:600 13.5px ui-monospace,Menlo,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wf-row .sz{color:#8a8a92;font-size:12.5px;font-weight:700;text-align:right;white-space:nowrap}
.wf-track{position:relative;height:100%;background:repeating-linear-gradient(90deg,#f1f1f3 0,#f1f1f3 1px,transparent 1px,transparent 19.23%)}
.wf-bar{position:absolute;top:calc(50% - 8px);height:16px;border-radius:8px;background:#ff4800;box-shadow:0 6px 16px rgba(255,72,0,.22)}
.wf-bar.join{background:#c9ccd2;box-shadow:none}.wf-bar.meta{background:#131417;box-shadow:none}
.wf-bar em{position:absolute;left:calc(100% + 7px);top:50%;transform:translateY(-50%);color:#9a9aa2;font:700 11.5px Inter;font-style:normal;white-space:nowrap}
.wf-legend{display:flex;gap:22px;margin-top:8px;padding-top:10px;border-top:1px solid #f0f0f2;color:#8a8a92;font-size:13px;font-weight:600}
.wf-legend i{display:inline-block;width:20px;height:9px;border-radius:5px;margin-right:8px}
.bench-runs{flex:none;border:1px solid #ffc9b3;border-radius:16px;background:#fff8f5;padding:14px 20px;display:grid;gap:10px}
.bench-runs h5{margin:0 0 2px;color:#171717;font-size:15.5px}
.run{display:grid;grid-template-columns:205px 1fr 62px;align-items:center;gap:12px;color:#555;font-size:14px;font-weight:600;white-space:nowrap}
.run i{height:14px;border-radius:7px;background:#ffd4c2}.run.hot i{background:#ff4800}
.run em{font-style:normal;text-align:right;font-weight:800;color:#171717}
.ai-q{align-self:flex-end;max-width:82%;border-radius:18px 18px 4px 18px;background:#131417;color:#fff;padding:16px 22px;font-size:20px}
.ai-sql{align-self:flex-start;border:1px solid #e6e6ea;border-radius:12px;background:#fff;color:#444;padding:12px 18px;
font:600 15.5px ui-monospace,Menlo,monospace}.ai-sql b{color:#ff4800;font-weight:600}
.ai-a{border:1px solid #e6e6ea;border-radius:18px;background:#fff;padding:22px 24px;box-shadow:0 14px 40px rgba(23,23,23,.07)}
.ai-a .vhead{display:flex;align-items:center;gap:10px;margin-bottom:10px;font-size:17px;font-weight:800}
.vbadge{display:inline-flex;align-items:center;gap:7px;color:#ff4800;font-size:14px;font-weight:800}
.vbadge i{width:20px;height:20px;border-radius:50%;background:#ff4800;color:#fff;font-style:normal;display:grid;place-items:center;font-size:12px}
.ai-a p{margin:0;color:#333;font-size:19px;line-height:1.5}
.ai-bars{display:grid;gap:8px;margin-top:16px}
.ai-bar{display:grid;grid-template-columns:52px 1fr 84px;align-items:center;gap:12px;font-size:15px;color:#555;font-weight:600}
.ai-bar i{height:16px;border-radius:8px;background:#ff4800}.ai-bar em{font-style:normal;text-align:right;font-weight:700;color:#171717}
.vocab-chips{display:flex;flex-wrap:wrap;gap:9px;align-content:flex-start}
.vocab-chips span{border:1px solid #e3e3e8;border-radius:999px;background:#fafafa;color:#666;padding:8px 15px;font:600 15px ui-monospace,Menlo,monospace}
.vocab-chips span.used{border-color:#ff4800;background:#fff3ee;color:#b93200;box-shadow:0 6px 18px rgba(255,72,0,.18)}
.aif-node{border:1px solid #e6e6ea;border-radius:18px;background:#fff;box-shadow:0 14px 40px rgba(23,23,23,.07);padding:22px 30px}
.aif-node h4{margin:0;color:#171717;font-size:23px;text-transform:none}
.aif-node h4 small{display:block;margin-top:6px;color:#8a8a92;font-size:14.5px;font-weight:600}
.aif-cube{border-radius:18px;background:#131417;color:#fff;padding:22px 44px;text-align:center;box-shadow:0 18px 50px rgba(23,23,23,.3)}
.aif-cube b{font-size:25px}.aif-cube span{display:block;margin-top:5px;color:#8f939e;font-size:15.5px}
.aif-step{color:#ff4800;font-weight:800}
.aif-store{border:1px solid #e6e6ea;border-radius:999px;background:#fafafa;color:#666;padding:9px 22px;font:600 15px ui-monospace,Menlo,monospace}
.aifA{flex:1;min-width:0;padding:26px 46px;display:flex;flex-direction:column;justify-content:space-evenly;align-items:center}
.aifA .flow-row{display:flex;align-items:center;gap:20px;width:100%}
.aifA .flow-row .ai-q{align-self:center;max-width:330px;flex:none}
.aifA .flow-row .ai-a{max-width:400px;flex:none}
.arrow-h{flex:1;display:grid;justify-items:center;gap:2px;color:#8a8a92;font-size:14.5px;font-weight:700;text-align:center}
.arrow-h i{font-style:normal;font-size:38px;line-height:1;color:#9aa0a6}
.v-arrows{display:flex;gap:85px;margin:6px 0}
.v-arrow{display:grid;justify-items:center;gap:2px;color:#8a8a92;font-size:14.5px;font-weight:700}
.v-arrow i{font-style:normal;font-size:28px;line-height:1;color:#ff4800}
.aifB{flex:1;min-width:0;padding:22px 28px;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:16px}
.aifB .card{display:flex;flex-direction:column;justify-content:center;gap:14px;border:1px solid #e6e6ea;border-radius:18px;background:#fff;padding:20px 26px;min-width:0}
.aifB .card h4{margin:0;color:#171717;font-size:21px;text-transform:none}.aifB .card h4 i{font-style:normal;color:#ff4800;margin-right:11px}
.aifB .card p{margin:0;color:#666;font-size:15.5px;line-height:1.45}
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
.b-code{display:flex;flex-direction:column;min-width:0;background:#131417}
.payoneer-deck .reveal .b-code pre.code{font-size:16.5px}
.gantt{flex:1;min-height:0;position:relative;display:flex;flex-direction:column;margin-top:6px}
.g-axis{display:grid;grid-template-columns:440px 1fr;margin-bottom:4px}
.g-ticks{position:relative;height:30px;color:#9a9aa2;font-size:14px;font-weight:600}
.g-ticks span{position:absolute;transform:translateX(-50%)}
.g-row{flex:1;display:grid;grid-template-columns:440px 1fr;align-items:center;border-top:1px solid #ececef}
.g-label{padding:20px 36px 20px 0}
.g-label h3{display:flex;align-items:center;gap:14px;margin:0;color:#171717;font-size:29px;letter-spacing:-.02em;text-transform:none}
.g-label .dur{margin-top:8px;color:#ff4800;font-size:18px;font-weight:800}
.g-label ul{margin:12px 0 0;padding-left:22px;color:#666;font-size:18px;line-height:1.6}
.g-opt{border:1px solid #ffc9b3;border-radius:999px;background:#fff3ee;color:#b93200;padding:4px 13px;font-size:13px;font-weight:800;letter-spacing:.08em}
.g-track{position:relative;height:100%;min-height:120px;
background:repeating-linear-gradient(90deg,#f1f1f3 0,#f1f1f3 1px,transparent 1px,transparent 10%)}
.g-bar{position:absolute;top:calc(50% - 19px);height:38px;border-radius:19px;background:#ffd4c2}
.g-bar .solid{position:absolute;inset:0;width:var(--solid);border-radius:19px;background:#ff4800}
.g-bar .blabel{position:absolute;left:22px;top:50%;transform:translateY(-50%);color:#fff;font-size:15px;font-weight:800;letter-spacing:.04em;z-index:1}
.g-bar.optional{background:#fff;border:2px dashed #ffa987}.g-bar.optional .solid{background:#ffb79b}
.g-bar.optional .blabel{color:#b93200}
.g-diamond{position:absolute;top:calc(50% - 15px);width:30px;height:30px;transform:translateX(-50%) rotate(45deg);background:#ff4800;
border-radius:6px;box-shadow:0 10px 26px rgba(255,72,0,.4)}
.g-runner{position:absolute;top:calc(50% - 1px);height:0;border-top:3px dashed #ffc9b3}
.g-runner em{position:absolute;right:0;top:-30px;color:#b93200;font-size:15px;font-weight:800;font-style:normal;white-space:nowrap}
.g-live{position:absolute;top:34px;bottom:0;width:0;border-left:2px dashed #ffb79b}
.g-live span{position:absolute;top:-30px;left:-2px;transform:translateX(-50%);border-radius:999px;background:#ff4800;color:#fff;
padding:5px 16px;font-size:14px;font-weight:800;letter-spacing:.1em;white-space:nowrap}
`

const KW = /^(Cube|cube|dimension|metric|ratio|materializeFromEvents|bucketUrlSourceJsonEvents|pick|last|QueryCase|queryCase|compareBenchmarks)$/
const TOKENS = /('[^']*'|\/\/[^\n]*|\b(?:Cube|cube|dimension|metric|ratio|materializeFromEvents|bucketUrlSourceJsonEvents|pick|last|QueryCase|queryCase|compareBenchmarks)\b)/g
const codePane = (h, text, hlOf = () => false) => h('pre:code', {}, ...text.split('\n').map((line, i) =>
  h(`div:cl${hlOf(line) ? ' hl' : ''}`, { key: i }, ...line.split(TOKENS).filter(Boolean).map((tok, j) => {
    const cls = tok.startsWith("'") ? 's' : tok.startsWith('//') ? 'c' : KW.test(tok) ? 'k' : ''
    return h(cls ? `span:${cls}` : 'span', { key: j }, tok)
  }))))
const win = (h, { label, hint, live, onFull }, ...body) => h('div:pw', {}, h('div:pw-bar', {},
  h(`i${live ? ':live' : ''}`), h('i'), h('i'), label, hint && h('span', {}, hint),
  onFull && h('button', { onClick: onFull }, '⛶ Full screen')), ...body)

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
// real footer stats of room://finance3/usersRO/silver/transactions-17mb.parquet — 16,961,821 B · 5.7M rows · 14 columns · 57 row groups · 74 KB footer.
// parquet_metadata: date >= '2024-07' overlaps row groups 46-56; their date+product+status+transaction_value chunks 336 KB + footer → 0.41 MB moves (2.4%).
const PQ_COLS = [['source_row', 6243229], ['transaction_id', 5000408], ['date', 13146, 1], ['source_date_quality', 131690],
  ['customer_id', 1111192], ['product', 287696, 1], ['quantity', 763926], ['price', 1274336], ['payment_method', 151498],
  ['status', 273247, 1], ['missing_transaction_id', 33883], ['invalid_date', 68356], ['transaction_value', 1054106, 1], ['has_quality_issue', 55053]]
// finance3Bench17MB.productStatus, measured 2026-08-07 on the staging finance3Benchmark17MBApplet (browser WASM, cold cols cache):
// 286 range requests · 3.7 MB · network wall 652 ms · concurrency 285. each column lane aggregates its 57 per-row-group chunk requests.
const BENCH_MS = 652
const BENCH_WATERFALL = [
  ['footer — schema + min/max stats', '72 KB', 0, 88, 'meta'],
  ['product · 57 chunks', '281 KB', 127, 93],
  ['status · 57 chunks', '267 KB', 128, 149],
  ['quantity · 57 chunks', '746 KB', 128, 255],
  ['price · 57 chunks', '1.24 MB', 128, 425],
  ['transaction_value · 57 chunks', '1.03 MB', 128, 524]
]
const BENCH_RUNS = [['Browser WASM · cold cache', 1293], ['Browser WASM · warm cache', 777, 'hot']]
const QUERY_CASE_CODE = `QueryCase('finance3Bench17MB.productStatus', {
  impl: queryCase({
    sql: \`select product, status, txns,
      completed_value
      group by product, status
      order by completed_value desc\`,
    cube: finance3Cube17MB(),
    expectedResult: ctx => ctx.data.length == 20
  })
})

// 5.7M rows in a 17 MB parquet; one call
// measures the case per environment, cold and
// warm, and validates the result on each run
compareBenchmarks({
  queryCase: productStatus(),
  environments: [wasm()],
  warmRuns: 1
})`
const AI_VOCAB = ['gross_value', 'completed_value', 'payment_fees', 'completion_rate', 'gross_margin', 'customer_country',
  'customer_type', 'loyalty_tier', 'product_category']
const AI_USED = ['completed_value', 'customer_country']
const AI_BARS = [['US', 100, '$4.1M'], ['UK', 71, '$2.9M'], ['DE', 41, '$1.7M']]
const AI_Q = 'Which countries drove completed volume in Q2?'
const AI_ANSWER = 'US and UK drove 58% of completed volume in Q2, led by marketplace sellers.'

const brand = h => h('div:p-brand', {}, h('i:mark', {}, 'W'), h('i:sep'), h('span:name', {}, 'Wonder'))
const SlideHead = ReactComp('slideHead.payoneer', {
  impl: comp({ hFunc: ({}, { react: { h } }) => ({ eyebrow, title }) => h('div', {},
    eyebrow && h('div:p-eyebrow', {}, eyebrow),
    h('div:p-head', {}, h('h2', {}, title), brand(h))) })
})

ReactComp('deckShell.payoneer', {
  impl: comp({ hFunc: ({}, { react: { h } }) => ({ children }) => h('main:payoneer-deck', {}, h('style', {}, CSS), children) })
})

ReactComp('coverSlide.payoneer', {
  impl: comp({ hFunc: ({}, { react: { h } }) => ({ slide }) => h('div:p-slide cover', {},
    brand(h),
    h('div:cover-body', {},
      h('div:c-eyebrow', {}, slide.eyebrow),
      h('h1', {}, slide.title),
      h('p', {}, slide.subtitle)),
    h('div:cover-foot', {}, h('i'), 'Powered by Wonder')) })
})

ReactComp('teamSlide.payoneer', {
  impl: comp({ hFunc: (ctx, { react: { h, hh } }) => ({ slide }) => h('div:p-slide', {},
    hh(ctx, SlideHead, { eyebrow: slide.eyebrow, title: slide.title }),
    h('div:team-grid', {}, ...slide.people.map(person => h('div:person', { key: person.name },
      h('img', { src: new URL(`../sheba-demo/deck/photos/${person.photo}`, import.meta.url), alt: person.name }),
      h('div:p-body', {}, h('h3', {}, person.name), h('p', {}, person.role),
        h('div:p-tags', {}, ...(person.tags || []).map(tag => h('span', { key: tag }, tag))))))),
    h('div:team-foot', {}, 'Deep expertise across enterprise integration, AI and data engineering')) })
})

const FinanceDemoViz = ReactComp('financeDemoViz.payoneer', {
  impl: comp({ hFunc: ({}, { react: { h, useState } }) => ({ item }) => {
    const [view, setView] = useState('desktop')
    return h('div:demo-col', {},
      h('div:demo-toggle', {}, ...['desktop', 'mobile'].map(mode =>
        h(`button${view == mode ? ':on' : ''}`, { key: mode, onClick: () => setView(mode) }, mode))),
      win(h, { label: 'FinanceDemo — live product', hint: item.title, live: true,
        onFull: e => e.currentTarget.closest('.pw').querySelector('iframe').requestFullscreen() },
        h('iframe:demo-iframe', { key: view, src: `${DEMO_URL}&view=${view}`, title: 'Wonder finance applet', allowFullScreen: true })))
  } })
})

const SemanticLayerViz = ReactComp('semanticLayerViz.payoneer', {
  impl: comp({ hFunc: ({}, { react: { h } }) => () => win(h,
    { label: 'admin/finance/v3/finance3-cube.js', hint: 'every business definition lives here, once' }, codePane(h, CUBE_CODE)) })
})

const OptimizedSqlViz = ReactComp('optimizedSqlViz.payoneer', {
  impl: comp({ hFunc: ({}, { react: { h } }) => () => win(h,
    { label: 'transactions-17mb.parquet — 17 MB · 5.7M rows · 14 columns · 57 row groups', hint: 'real footer stats, read via parquet_metadata' },
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
      h('div:pq-caption', {}, 'Column width = real bytes on disk. The 74 KB footer skips 46 of 57 row groups; of the last 11, only the 4 queried column chunks move.')))) })
})

const BenchmarksViz = ReactComp('benchmarksViz.payoneer', {
  impl: comp({ hFunc: ({}, { react: { h } }) => () => {
    const pct = ms => `${ms / BENCH_MS * 100}%`
    return win(h, { label: 'finance3-17mb-benchmark.js — QueryCase, measured on staging', hint: 'the engine reads only the footer + needed chunks' },
      h('div:viz-body', {}, h('div:bench', {},
        h('div:bench-code', {}, codePane(h, QUERY_CASE_CODE)),
        h('div:bench-right', {},
          h('div:wf', {},
            h('div:wf-head', {}, h('b', {}, 'Cold-run network waterfall'), h('span', {}, '286 range requests · 3.7 of 17 MB · concurrency 285')),
            h('div:wf-axis', {}, h('div'), h('div'), h('div', {}, ...[0, 100, 200, 300, 400, 500, 600].map(ms =>
              h('span', { key: ms, style: { left: pct(ms) } }, `${ms} ms`)))),
            ...BENCH_WATERFALL.map(([label, size, start, duration, kind]) => h('div:wf-row', { key: label },
              h('div:lbl', {}, label), h('div:sz', {}, size),
              h('div:wf-track', {}, h(`div:wf-bar${kind ? ` ${kind}` : ''}`, { style: { left: pct(start), width: pct(duration) } },
                h('em', {}, `${duration} ms`))))),
            h('div:wf-legend', {},
              h('span', {}, h('i', { style: { background: '#131417' } }), 'parquet footer — stats'),
              h('span', {}, h('i', { style: { background: '#ff4800' } }), 'projected columns — 57 parallel chunk requests per lane'))),
          h('div:bench-runs', {}, h('h5', {}, 'Same QueryCase, time to answer'),
            ...BENCH_RUNS.map(([label, ms, hot]) => h(`div:run${hot ? ' hot' : ''}`, { key: label }, h('span', {}, label),
              h('i', { style: { width: `${ms / BENCH_RUNS[0][1] * 100}%` } }), h('em', {}, ms < 100 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`))))))))
  } })
})

const urlParam = name => new URLSearchParams(globalThis.location?.search || '').get(name)
const aiSqlChip = h => h('div:ai-sql', {}, h('b', {}, 'select'), ' customer_country, completed_value ', h('b', {}, 'where'), " quarter = '2025-Q2'")
const aiAnswerCard = (h, props) => h('div:ai-a', props, h('div:vhead', {}, 'Answer', h('span:vbadge', {}, h('i', {}, '✓'), 'Verified')),
  h('p', {}, AI_ANSWER), h('div:ai-bars', {}, ...AI_BARS.map(([label, width, value]) => h('div:ai-bar', { key: label }, label,
    h('i', { style: { width: `${width}%` } }), h('em', {}, value)))))
const aiVocabChips = (h, words) => h('div:vocab-chips', {}, ...words.map(word => h(`span${AI_USED.includes(word) ? ':used' : ''}`, { key: word }, word)))

const AiReadyPipeline = ReactComp('aiReadyPipeline.payoneer', {
  impl: comp({ hFunc: ({}, { react: { h } }) => () => win(h, { label: 'Ask AI — grounded in the cube', hint: 'the cube teaches, runs and verifies' },
    h('div:viz-body', {}, h('div:aifA', {},
      h('div:flow-row', {},
        h('div:ai-q', {}, AI_Q),
        h('div:arrow-h', {}, h('i', {}, '⟶')),
        h('div:aif-node', {}, h('h4', {}, 'LLM', h('small', {}, 'speaks cube vocabulary only'))),
        h('div:arrow-h', {}, h('i', {}, '⟶'), h('span', {}, h('b:aif-step', {}, '④ '), 'verified answer + evidence')),
        aiAnswerCard(h)),
      h('div:v-arrows', {},
        h('div:v-arrow', {}, h('i', {}, '↑'), h('span', {}, h('b:aif-step', {}, '① '), 'injects the data model')),
        h('div:v-arrow', {}, h('i', {}, '↓'), h('span', {}, h('b:aif-step', {}, '② '), 'SQL in cube vocabulary')),
        h('div:v-arrow', {}, h('i', {}, '↑'), h('span', {}, h('b:aif-step', {}, '③ '), 'verified rows'))),
      h('div:aif-cube', {}, h('b', {}, 'Wonder Cube'), h('span', {}, 'data model · query engine · verifier')),
      h('div:v-arrow', {}, h('i', { style: { color: '#9aa0a6' } }, '↕'), 'optimized reads'),
      h('div:aif-store', {}, 'transactions.parquet — 0.41 MB read')))) })
})

const AiReadyStoryboard = ReactComp('aiReadyStoryboard.payoneer', {
  impl: comp({ hFunc: ({}, { react: { h } }) => () => win(h, { label: 'Ask AI — grounded in the cube', hint: 'four beats, one vocabulary' },
    h('div:viz-body', {}, h('div:aifB', {},
      h('div:card', {}, h('h4', {}, h('i', {}, '①'), 'The question'),
        h('div:ai-q', { style: { alignSelf: 'flex-start', borderRadius: '18px 18px 18px 4px' } }, AI_Q),
        h('p', {}, 'Plain business language — no SQL, no schema knowledge needed.')),
      h('div:card', {}, h('h4', {}, h('i', {}, '②'), 'The cube injects the data model'),
        aiVocabChips(h, AI_VOCAB.slice(0, 7)),
        h('p', {}, 'Approved metrics and dimensions become the only words the LLM may use.')),
      h('div:card', {}, h('h4', {}, h('i', {}, '③'), 'The LLM queries through the cube'),
        aiSqlChip(h),
        h('p', {}, 'The cube compiles and runs the SQL over parquet — hallucinated columns cannot compile.')),
      h('div:card', {}, h('h4', {}, h('i', {}, '④'), 'The verified answer'), aiAnswerCard(h))))) })
})

const AiReadySequence = ReactComp('aiReadySequence.payoneer', {
  impl: comp({ hFunc: ({}, { react: { h } }) => () => {
    const arrow = (glyph, num, text) => h('div:arrow-c', {}, h('i', {}, glyph), h('span', {}, h('b:aif-step', {}, `${num} `), text))
    return win(h, { label: 'Ask AI — grounded in the cube', hint: 'every exchange passes through the cube' },
      h('div:viz-body', {}, h('div:aifC', {},
        h('div:lane', {}, h('b', {}, 'Wonder Cube'), h('span', {}, 'data model · query engine · verifier'),
          h('div:aif-store', { style: { marginTop: 16 } }, 'transactions.parquet')),
        h('div:ai-q', { style: { alignSelf: 'flex-start', borderRadius: '18px 18px 18px 4px' } }, AI_Q), h('div'),
        aiVocabChips(h, AI_VOCAB.slice(0, 6)), arrow('⟵', '①', 'injects the data model'),
        aiSqlChip(h), arrow('⟶', '②', 'SQL in cube vocabulary — compiled + run'),
        aiAnswerCard(h, { style: { maxWidth: 640 } }), arrow('⟵', '③', 'verified rows + evidence'))))
  } })
})

const AI_LAYOUTS = [['A · pipeline', AiReadyPipeline], ['B · storyboard', AiReadyStoryboard], ['C · sequence', AiReadySequence]]
const AiReadyViz = ReactComp('aiReadyViz.payoneer', {
  impl: comp({ hFunc: (ctx, { react: { h, hh, useState } }) => () => {
    const [layoutIndex, setLayoutIndex] = useState(Math.max(0, ['a', 'b', 'c'].indexOf(urlParam('aiLayout'))))
    return h('div:demo-col', {},
      h('div:demo-toggle', {}, ...AI_LAYOUTS.map(([label], i) =>
        h(`button${layoutIndex == i ? ':on' : ''}`, { key: label, onClick: () => setLayoutIndex(i) }, label))),
      hh(ctx, AI_LAYOUTS[layoutIndex][1]))
  } })
})

const DashboardViz = ReactComp('dashboardViz.payoneer', {
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

const CUBE_VIEWS = { semantic: SemanticLayerViz, queries: OptimizedSqlViz, benchmarks: BenchmarksViz, ai: AiReadyViz, dashboards: DashboardViz }

ReactComp('interactiveShowcaseSlide.payoneer', {
  impl: comp({ hFunc: (ctx, { react: { h, hh, useState } }) => ({ slide }) => {
    const [selected, setSelected] = useState(Math.max(0, slide.items.findIndex(x => x.id == urlParam('show')))), item = slide.items[selected]
    const Viz = CUBE_VIEWS[item.id] || FinanceDemoViz
    return h('div:p-slide', {}, hh(ctx, SlideHead, { eyebrow: slide.eyebrow, title: slide.title }),
      slide.subtitle && h('div:p-sub', {}, slide.subtitle),
      h('div:showcase', {}, h('div:show-list', {}, ...slide.items.map((x, i) => h('button:show-item', {
        key: x.id, className: i == selected ? 'on' : '', onClick: () => setSelected(i), 'data-testid': `show-${x.id}`
      }, h('b', {}, x.title), h('span', {}, x.text),
        i == selected && x.details?.length ? h('div:show-details', {}, ...x.details.map(d => h('div', { key: d }, d))) : null))),
      h('div:show-viz', {}, hh(ctx, Viz, { item }))))
  } })
})

const ARCH = h => {
  const zone = (x, y, w, hgt, label, warm) => [h('rect', { x, y, width: w, height: hgt, rx: 20, fill: 'none',
    stroke: warm ? '#ffb79b' : '#c9ccd2', strokeWidth: 1.6, strokeDasharray: '8 7' }),
    h('text', { x: x + 24, y: y + 34, fill: warm ? '#ff4800' : '#8a8a92', fontSize: 15, fontWeight: 800, letterSpacing: 2 }, label)]
  const node = (x, y, w, hgt, title, sub) => h('g', {}, h('rect', { x, y, width: w, height: hgt, rx: 14, fill: '#fff',
    stroke: '#d9d9de', strokeWidth: 1.5, filter: 'drop-shadow(0 8px 18px rgba(23,23,23,.08))' }),
    h('text', { x: x + w / 2, y: y + (sub ? hgt / 2 - 6 : hgt / 2 + 7), textAnchor: 'middle', fontSize: 19, fontWeight: 800, fill: '#171717' }, title),
    sub && h('text', { x: x + w / 2, y: y + hgt / 2 + 22, textAnchor: 'middle', fontSize: 14.5, fill: '#6b7280' }, sub))
  const lane = (x1, x2, y, above, below) => h('g', {},
    h('line', { x1, y1: y, x2, y2: y, stroke: '#9aa0a6', strokeWidth: 2, markerEnd: 'url(#pd-ah)', markerStart: 'url(#pd-ah)' }),
    h('text', { x: (x1 + x2) / 2, y: y - 14, textAnchor: 'middle', fontSize: 16, fontWeight: 700, fill: '#171717' }, above),
    h('text', { x: (x1 + x2) / 2, y: y + 26, textAnchor: 'middle', fontSize: 15, fill: '#ff4800', fontWeight: 700 }, below))
  const prefixRow = (y, name) => [h('rect', { x: 1240, y, width: 444, height: 54, rx: 10, fill: '#fafafa', stroke: '#e6e6ea' }),
    h('text', { x: 1262, y: y + 33, fontSize: 15.5, fontWeight: 600, fill: '#444', fontFamily: 'ui-monospace,Menlo,monospace' }, name),
    h('text', { x: 1650, y: y + 34, fontSize: 17 }, '🔒')]
  return h('svg:arch-svg', { viewBox: '0 0 1760 640' },
    h('defs', {}, h('marker', { id: 'pd-ah', markerWidth: 9, markerHeight: 9, refX: 7, refY: 4.5, orient: 'auto-start-reverse' },
      h('path', { d: 'M0,0 L9,4.5 L0,9 z', fill: '#9aa0a6' }))),
    ...zone(18, 24, 570, 592, 'USER DEVICE'), ...zone(760, 24, 430, 160, 'PAYONEER', true), ...zone(760, 214, 980, 402, 'PAYONEER AWS', true),
    h('g', {}, h('rect', { x: 74, y: 120, width: 470, height: 420, rx: 16, fill: '#fff', stroke: '#ececef' }),
      h('rect', { x: 62, y: 108, width: 470, height: 420, rx: 16, fill: '#fff', stroke: '#e3e3e8' })),
    h('g', {},
      h('rect', { x: 50, y: 96, width: 470, height: 420, rx: 16, fill: '#fff', stroke: '#d9d9de', strokeWidth: 1.5,
        filter: 'drop-shadow(0 14px 30px rgba(23,23,23,.1))' }),
      ...[0, 1, 2].map(i => h('circle', { key: i, cx: 80 + i * 22, cy: 126, r: 5.5, fill: '#d9d9de' })),
      h('text', { x: 285, y: 316, textAnchor: 'middle', fontSize: 21, fontWeight: 800, fill: '#171717' }, 'Payoneer BI — runs in the browser')),
    node(784, 76, 382, 84, 'Payoneer Login (IdP)', 'your existing authentication'),
    node(784, 266, 382, 96, 'AWS Cognito — token exchange', 'Payoneer JWT  →  scoped AWS JWT'),
    h('g', {},
      h('rect', { x: 1216, y: 266, width: 492, height: 322, rx: 14, fill: '#fff', stroke: '#d9d9de', strokeWidth: 1.5,
        filter: 'drop-shadow(0 8px 18px rgba(23,23,23,.08))' }),
      h('text', { x: 1240, y: 302, fontSize: 19, fontWeight: 800, fill: '#171717' }, 'S3 Parquets, optimized by Wonder Cube'),
      ...prefixRow(322, 's3://payoneer-bi/u-84291/'), ...prefixRow(390, 's3://payoneer-bi/u-3117/'), ...prefixRow(458, 's3://payoneer-bi/u-90514/'),
      h('text', { x: 1240, y: 552, fontSize: 14.5, fill: '#6b7280' }, 'one prefix per user · no server between user and data')),
    lane(592, 784, 118, '① sign in', '⇠ Payoneer JWT'),
    lane(592, 784, 314, '② trade the JWT', '⇠ scoped AWS JWT'),
    lane(592, 1216, 470, '③ read own prefix — AWS JWT', '⇠ parquet byte ranges'))
}

ReactComp('architectureSlide.payoneer', {
  impl: comp({ hFunc: (ctx, { react: { h, hh, useState } }) => ({ slide }) => {
    const [focus, setFocus] = useState(null), active = slide.chips.find(chip => chip.id == focus)
    return h('div:p-slide', {}, hh(ctx, SlideHead, { eyebrow: slide.eyebrow, title: slide.title }),
      h('div:arch', {}, ARCH(h),
        h('div:arch-chips', {}, ...slide.chips.map(chip => h('button:arch-chip', {
          key: chip.id, className: focus == chip.id ? 'on' : '', onClick: () => setFocus(focus == chip.id ? null : chip.id),
          'data-testid': `chip-${chip.id}`
        }, chip.title))),
        h('div:arch-note', {}, active ? active.text : 'Click a chip for details.')))
  } })
})

const CLIENT_SERVER_ARCH = h => {
  const icon = (kind, x, y) => kind == 'browser' ? h('g', { stroke: '#8a8a92', strokeWidth: 2, fill: 'none' },
    h('rect', { x, y, width: 32, height: 24, rx: 4 }), h('line', { x1: x, y1: y + 7, x2: x + 32, y2: y + 7 }),
    ...[6, 11, 16].map(dx => h('circle', { cx: x + dx, cy: y + 3.5, r: 1, fill: '#8a8a92', stroke: 'none' })))
    : kind == 'server' ? h('g', { stroke: '#8a8a92', strokeWidth: 2, fill: 'none' }, ...[0, 13].flatMap(dy => [
      h('rect', { x, y: y + dy, width: 32, height: 10, rx: 2 }), h('circle', { cx: x + 26, cy: y + dy + 5, r: 1.5, fill: '#8a8a92' })]))
    : h('g', { stroke: '#ff4800', strokeWidth: 2, fill: 'none', strokeLinecap: 'round' },
      h('path', { d: `M${x} ${y + 5}h12l4 5h16v18H${x}z` }), h('line', { x1: x + 10, y1: y + 15, x2: x + 10, y2: y + 23 }),
      h('line', { x1: x + 10, y1: y + 19, x2: x + 20, y2: y + 19 }),
      ...[[10, 15], [10, 23], [20, 19]].map(([dx, dy]) => h('circle', { cx: x + dx, cy: y + dy, r: 2, fill: '#fff8f5' })))
  const box = (x, y, w, hgt, title, sub, dark) => h('g', {},
    h('rect', { x, y, width: w, height: hgt, rx: 18, fill: dark ? '#131417' : '#fff', stroke: dark ? '#131417' : '#d9d9de',
      strokeWidth: 1.6, filter: 'drop-shadow(0 10px 24px rgba(23,23,23,.1))' }),
    h('text', { x: x + w / 2, y: y + hgt / 2 - (sub ? 7 : -7), textAnchor: 'middle', fontSize: 22, fontWeight: 800,
      fill: dark ? '#fff' : '#171717' }, title),
    sub && h('text', { x: x + w / 2, y: y + hgt / 2 + 24, textAnchor: 'middle', fontSize: 15.5, fill: dark ? '#b9bdc7' : '#6b7280' }, sub))
  const zone = (x, label, kind) => [h('rect', { x, y: 28, width: 700, height: 352, rx: 22, fill: 'none', stroke: '#c9ccd2', strokeWidth: 1.6,
    strokeDasharray: '8 7' }), icon(kind, x + 26, 43),
    h('text', { x: x + 72, y: 64, fill: '#8a8a92', fontSize: 16, fontWeight: 800, letterSpacing: 2 }, label)]
  const profiles = (x, y, w, sub) => h('g', {}, ...[12, 6].map(offset => h('rect', { x: x + offset, y: y - offset, width: w, height: 66,
    rx: 18, fill: '#fff', stroke: '#e6e6ea' })), box(x, y, w, 66, 'Declarative profiles', sub))
  const parquet = (y, name) => h('g', {}, h('rect', { x: 775, y, width: 210, height: 30, rx: 7, fill: '#fafafa', stroke: '#e6e6ea' }),
    h('text', { x: 880, y: y + 20, textAnchor: 'middle', fontSize: 13, fontWeight: 700, fill: '#444' }, name))
  const arrow = (x1, y1, x2, y2, label) => h('g', {},
    h('line', { x1, y1, x2, y2, stroke: '#ff4800', strokeWidth: 2.4, markerEnd: 'url(#cs-ah)' }),
    h('text', { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 12, textAnchor: 'middle', fontSize: 15, fontWeight: 700, fill: '#ff4800' }, label))
  return h('svg:arch-svg', { viewBox: '0 0 1760 680' },
    h('defs', {}, h('marker', { id: 'cs-ah', markerWidth: 9, markerHeight: 9, refX: 8, refY: 4.5, orient: 'auto' },
      h('path', { d: 'M0,0 L9,4.5 L0,9 z', fill: '#ff4800' }))),
    ...zone(40, 'CLIENT · BROWSER', 'browser'), ...zone(1020, 'SERVER · AWS LAMBDA', 'server'),
    profiles(190, 116, 400, 'UI · AI agent · BI cube'),
    box(150, 238, 480, 108, 'wonderClientEngine', 'JS library · DuckDB WASM', true),
    profiles(1170, 116, 400, 'BI cube · ETL'),
    box(1130, 238, 480, 108, 'wonderLambdaEngine', 'Node.js · DuckDB', true),
    arrow(390, 182, 390, 238, 'executes on'), arrow(1370, 182, 1370, 238, 'executes on'),
    h('g', {}, h('rect', { x: 750, y: 60, width: 260, height: 286, rx: 18, fill: '#fff', stroke: '#ffb79b', strokeWidth: 1.8,
      filter: 'drop-shadow(0 10px 24px rgba(23,23,23,.1))' }),
      h('text', { x: 880, y: 92, textAnchor: 'middle', fontSize: 21, fontWeight: 800, fill: '#ff4800' }, 'Amazon S3'),
      h('circle', { cx: 782, cy: 111, r: 7, fill: '#b87333' }),
      h('text', { x: 797, y: 116, fontSize: 13, fontWeight: 800, fill: '#8a8a92', letterSpacing: 1.5 }, 'BRONZE'),
      parquet(126, 'raw-events.parquet'),
      h('line', { x1: 880, y1: 160, x2: 880, y2: 198, stroke: '#ff4800', strokeWidth: 2, markerEnd: 'url(#cs-ah)' }),
      h('text', { x: 894, y: 184, fontSize: 13, fontWeight: 800, fill: '#ff4800' }, 'ETL'),
      h('circle', { cx: 782, cy: 213, r: 7, fill: '#aeb4bd' }),
      h('text', { x: 797, y: 218, fontSize: 13, fontWeight: 800, fill: '#8a8a92', letterSpacing: 1.5 }, 'SILVER'),
      parquet(228, 'transactions.parquet'), parquet(266, 'metrics.parquet')),
    arrow(750, 314, 630, 314, 'read'), arrow(1010, 314, 1130, 314, 'read'), arrow(1130, 338, 1010, 338, 'ETL write'),
    h('line', { x1: 630, y1: 370, x2: 1130, y2: 370, stroke: '#9aa0a6', strokeWidth: 2, strokeDasharray: '6 7' }),
    h('text', { x: 880, y: 362, textAnchor: 'middle', fontSize: 15, fontWeight: 700, fill: '#6b7280' }, 'direct API'),
    h('rect', { x: 310, y: 442, width: 1140, height: 216, rx: 22, fill: '#fff8f5', stroke: '#ffb79b', strokeWidth: 1.8 }),
    icon('repo', 350, 451),
    h('text', { x: 396, y: 478, fill: '#ff4800', fontSize: 16, fontWeight: 800, letterSpacing: 2 }, 'CLIENT WEB SITE · CDN'),
    profiles(390, 510, 430, 'configuration scripts · versioned · signed'), box(390, 594, 430, 46, 'wClientEngine.js', null, true),
    profiles(940, 510, 430, 'configuration scripts · versioned · signed'), box(940, 594, 430, 46, 'wLambdaEngine.js', null, true),
    h('line', { x1: 605, y1: 380, x2: 605, y2: 498, stroke: '#9aa0a6', strokeWidth: 2, strokeDasharray: '6 7' }),
    h('line', { x1: 1155, y1: 380, x2: 1155, y2: 498, stroke: '#9aa0a6', strokeWidth: 2, strokeDasharray: '6 7' }))
}

ReactComp('clientServerSlide.payoneer', {
  impl: comp({ hFunc: (ctx, { react: { h, hh } }) => ({ slide }) => h('div:p-slide', {},
    hh(ctx, SlideHead, { eyebrow: slide.eyebrow, title: slide.title }), h('div:arch', {}, CLIENT_SERVER_ARCH(h))) })
})

ReactComp('timelineSlide.payoneer', {
  impl: comp({ hFunc: (ctx, { react: { h, hh } }) => ({ slide }) => {
    const pct = week => `${week / slide.weeks * 100}%`
    const bar = phase => phase.milestone
      ? [h('div:g-diamond', { style: { left: pct(phase.startWeek) } }),
        h('div:g-runner', { style: { left: `calc(${pct(phase.startWeek)} + 26px)`, right: 0 } }, h('em', {}, 'in production →'))]
      : [h(`div:g-bar${phase.optional ? ' optional' : ''}`, {
          style: { left: pct(phase.startWeek), width: pct(phase.endWeek - phase.startWeek),
            '--solid': `${(phase.solidUntil - phase.startWeek) / (phase.endWeek - phase.startWeek) * 100}%` } },
          h('div:solid'), h('div:blabel', {}, phase.duration))]
    return h('div:p-slide', {}, hh(ctx, SlideHead, { eyebrow: slide.eyebrow, title: slide.title }),
      h('div:gantt', {},
        h('div:g-axis', {}, h('div'), h('div:g-ticks', {}, ...Array.from({ length: slide.weeks + 1 }, (_, week) =>
          week % 2 == 0 && h('span', { key: week, style: { left: pct(week) } }, `W${week}`)))),
        h('div:g-live', { style: { left: `calc(440px + (100% - 440px) * ${6 / slide.weeks})` } }, h('span', {}, 'LIVE')),
        ...slide.phases.map(phase => h('div:g-row', { key: phase.title, style: { flex: phase.milestone ? 0.55 : 1 } },
          h('div:g-label', {}, h('h3', {}, phase.title, phase.optional && h('span:g-opt', {}, 'OPTIONAL')),
            h('div:dur', {}, phase.duration), phase.items.length ? h('ul', {}, ...phase.items.map(x => h('li', { key: x }, x))) : null),
          h('div:g-track', {}, ...bar(phase))))))
  } })
})

const { slide: { coverSlide, teamSlide, interactiveShowcaseSlide, architectureSlide, clientServerSlide, timelineSlide },
  'showcase-item': { showcaseItem }, person: { person }, 'arch-chip': { archChip }, 'timeline-phase': { timelinePhase } } = dsls.deck

Deck('payoneerDeckV2', {
  moreTypes: 'react-comp<react>',
  impl: deckPlayer(addCategory('payoneer'), {
    metadata: applet({ title: 'Payoneer Deck V2', icon: 'Presentation', showMessageInput: false }),
    slides: [
      coverSlide({
        title: 'Wonder',
        subtitle: 'Secured, scalable, multi-tenant BI — white-labeled for Payoneer customers, with verified AI on top.',
        eyebrow: 'PRODUCT PROOF OF CONCEPT'
      }),
      teamSlide({ title: 'The Team', eyebrow: 'WHO WE ARE', people: [
        person('Shai Ben-Yehuda', 'World class leader of DSL Design, with decades of experience in software design, system integration and data processing.', 'shai.jpg',),
        person('Yiftach Neuman', 'AI and Data Science Expert, Ex 8200', 'yiftach.jpg'),
        person('Roee Winder', 'Data engineering and GenAI expert, Ex 8200', 'roee.jpg')
      ] }),
      interactiveShowcaseSlide({
        title: 'Wonder — Secured, Scalable Multi-Tenant BI', eyebrow: 'THE PRODUCT',
        subtitle: 'A branded BI product that runs securely for every Payoneer customer — live on the right.',
        items: [
          showcaseItem('white-label', 'Customized White Label App', 'Payoneer branding, workflows and product experience.',
            { details: ['Payoneer logo, colors and terminology', 'Same product — shipped as your product'] }),
          showcaseItem('verified-ai', 'Verified AI', 'Answers grounded in approved metrics and evidence.',
            { details: ['Ask AI speaks only approved metrics', 'Every answer ships its SQL + evidence'] }),
          showcaseItem('secure', 'Secure', 'Each user can access only their own data prefix.',
            { details: ['One S3 prefix per user', 'Enforced by AWS, not app code'] }),
          showcaseItem('scalable', 'Scalable', 'Client-side query and visualization remove server bottlenecks.',
            { details: ['Queries and charts run in the browser', 'Zero shared query servers'] })
        ]
      }),
      architectureSlide({ title: 'Deployment Architecture', eyebrow: 'HOW IT RUNS', chips: [
        archChip('secure', 'Secure', 'Enforced by AWS IAM',
          'The scoped token opens exactly one prefix — isolation is AWS policy, not application code.'),
        archChip('scalable', 'Scalable', 'Every user brings compute',
          'Each browser runs its own query engine — 10,000 users mean 10,000 engines, no shared bottleneck.'),
        archChip('serverless', 'Serverless', 'No backend in the path',
          'After sign-in the browser reads S3 directly — nothing to operate, patch or scale in between.')
      ] }),
      interactiveShowcaseSlide({
        title: 'Wonder Cube — Semantic Data Modeling', eyebrow: 'THE DATA MODEL',
        items: [
          showcaseItem('semantic', 'Semantic Layer', 'The finance cube defines shared business meaning.',
            { details: ['Metrics & dimensions declared once', 'Business logic leaves the queries'] }),
          showcaseItem('queries', 'Optimized SQL Queries', 'The parquet layout turns queries into tiny reads.',
            { details: ['Min/max stats skip 46 of 57 row groups', '4 of 14 columns fetched — 97.6% never moves'] }),
          showcaseItem('ai', 'AI Ready', 'The same vocabulary constrains and verifies AI answers.',
            { details: ['LLM constrained to the cube', 'Verified answers with evidence'] }),
          showcaseItem('dashboards', 'Dashboards', 'Metrics and dimensions compose reusable BI experiences.',
            { details: ['Widgets = cube queries', 'Pick metric × dimension, done'] })
        ]
      }),
      timelineSlide({ title: 'Work Plan', eyebrow: 'DELIVERY', weeks: 10, phases: [
        timelinePhase('Setup', '2–6 weeks', 0, 6, ['Deploy in Payoneer AWS', 'Product customization according to Payoneer requests', 'ETLs'],
          { solidUntil: 2 }),
        timelinePhase('BI Product in Production', 'go-live — as early as week 2', 6, 6, [], { milestone: true }),
        timelinePhase('AI Insights', '1–4 weeks', 6, 10, ['Verified Reports', 'AI Quality Evaluations'], { solidUntil: 7, optional: true })
      ] }),
      clientServerSlide({ title: 'Client–Server Architecture', eyebrow: 'HOW THE RUNTIME LOADS' })
    ]
  })
})
