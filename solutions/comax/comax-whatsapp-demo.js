import { dsls, coreUtils } from '@jb6/core'
import '@jb6/react'
import '../../demo2/demo-spec-dsl.js'
import '../../demo2/whatsapp-comps.js'
import { waDefaultAvatarUrl } from '../../demo2/whatsapp-svgs.js'
import { comaxLogo, comaxFontCss } from './Comps/comax-brand.js'

const {
  tgp: { Component },
  'demo-spec': { Scenario,
    step: { animationScreen, waSetup: whatsappSetup, waOpen: openWhatsapp, waBot: bot, waUser: user,
      waExplain: explain, waSurveyImage: surveyImage, waOpenUrl: openUrl, waDateSpacer },
    scan: { waScanAll: scanAll },
    'whatsapp-chat': { waSingleChat: whatsappSingleChat },
    'whatsapp-participant': { waParticipant: whatsappParticipant },
    image: { image },
    scenario: { chatScenario }
  },
  react: { ReactComp, 'react-comp': { comp, demoPlayer } }
} = dsls
const { delay } = coreUtils

// ── Comax brand + real "big chain" data ──
const green = '#61A60E', ink = '#454343', amber = '#E08B0E', red = '#DC2626', track = '#E9ECEF'
const day = 'יום חמישי'
// Thursday net (₪ thousands) per real trading branch vs its own Thursday average — from the verified ERP model.
const branches = [
  { nm: 'גני תקווה', today: 372, avg: 358 },
  { nm: 'אם המושבות', today: 291, avg: 279 },
  { nm: 'רמת השרון', today: 205, avg: 198 },
  { nm: 'רעננה', today: 149, avg: 143 },
  { nm: 'בר כוכבא פ״ת', today: 147, avg: 172, flag: true },
  { nm: 'הסתדרות', today: 128, avg: 131 },
  { nm: 'חובבי ציון', today: 103, avg: 97 },
  { nm: 'כץ', today: 85, avg: 92 },
  { nm: 'רחובות', today: 80, avg: 84 },
  { nm: 'כפר סבא-גולני', today: 25, avg: 21 }
]
const sum = k => branches.reduce((s, b) => s + b[k], 0)
const dlt = b => (b.today - b.avg) / b.avg * 100
const clr = d => d >= 0 ? green : d > -10 ? amber : red
const money = k => k >= 1000 ? `₪${(k / 1000).toFixed(2)}M` : `₪${k}K`
const pct = d => `${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}%`

const brandFont = h => h('style', {}, comaxFontCss)

// Per-branch row: name+₪ on the right, one bar for "today" growing from the right against a fixed
// average marker-line, delta chip on the left. Bar crossing the line = above average (RTL).
const AVG_POS = 68
const branchRow = (h, b) => {
  const d = dlt(b), c = clr(d), w = Math.min(b.today / b.avg, 1.35) * AVG_POS
  return h('div', { key: b.nm, className: 'flex items-center gap-2.5 px-3 py-2.5 border-t border-gray-100 first:border-t-0', style: b.flag ? { background: '#FDECEC' } : {} },
    h('div', { className: 'w-[86px] shrink-0 text-right' },
      h('div', { className: 'text-[12px] font-bold', style: { color: ink } }, b.nm),
      h('div', { className: 'text-[10px] text-gray-500 mt-0.5' }, money(b.today))),
    h('div', { className: 'relative flex-1 h-2.5 rounded-full', style: { background: track } },
      h('div', { className: 'absolute top-0 bottom-0 right-0 rounded-full', style: { width: `${w}%`, background: c } }),
      h('div', { className: 'absolute', style: { right: `${AVG_POS}%`, top: '-3px', bottom: '-3px', width: '2px', background: '#495057', borderRadius: '1px' } })),
    h('div', { className: 'w-[50px] shrink-0 text-left text-[12px] font-black', style: { color: c } }, pct(d)))
}

ReactComp('comaxBranchStatusChart', {
  impl: comp({
    hFunc: (_ctx, { react: { h } }) => () => {
      const t = sum('today'), a = sum('avg'), d = (t - a) / a * 100
      return h('div', { dir: 'rtl', className: 'comax-brand rounded-[20px] overflow-hidden max-w-[430px] border border-gray-300', style: { background: '#ECEFF2', boxShadow: '0 8px 26px rgba(0,0,0,0.16)' } },
        brandFont(h),
        h('div', { className: 'px-4 pt-3.5 pb-8', style: { background: `linear-gradient(135deg, ${green} 0%, #4a7f0b 100%)` } },
          h('div', { className: 'flex items-center justify-between' },
            h('div', {},
              h('div', { className: 'text-white text-[15px] font-black tracking-tight' }, `מצב מכירות · ${day}`),
              h('div', { className: 'text-white/80 text-[10px] font-medium mt-0.5' }, 'היום מול ממוצע אותו יום · כל הסניפים')),
            h('img', { src: comaxLogo, className: 'h-4 w-auto' }))),
        h('div', { className: 'px-3 -mt-5 pb-3' },
          h('div', { className: 'flex gap-2 mb-2.5' },
            ...[['הרשת היום', money(t), ink], [`ממוצע ${day}`, money(a), '#6B7280'], ['סטייה', pct(d), clr(d)]].map(([lbl, val, col]) =>
              h('div', { key: lbl, className: 'flex-1 bg-white rounded-xl p-2.5 text-center border border-gray-200 shadow-sm' },
                h('div', { className: 'text-[9px] text-gray-500 font-semibold' }, lbl),
                h('div', { className: 'text-[16px] font-black mt-0.5', style: { color: col } }, val)))),
          h('div', { className: 'bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-2' },
            h('div', { className: 'flex items-center justify-end gap-1.5 px-3 py-1.5 text-[9px] text-gray-500 border-b border-gray-100' },
              h('span', { className: 'inline-block w-4 h-[7px] rounded-full', style: { background: green } }), 'מכירות היום',
              h('span', { className: 'inline-block w-[2px] h-3 mr-2', style: { background: '#495057' } }), `קו הממוצע`),
            ...branches.map(b => branchRow(h, b))),
          h('div', { className: 'rounded-2xl p-3', style: { background: '#FDECEC', border: `1px solid ${red}33` } },
            h('div', { className: 'text-[11px] font-black', style: { color: red } }, '⚠️ שים לב: בר כוכבא פ״ת'),
            h('div', { className: 'text-[11px] text-gray-700 mt-1 leading-relaxed' },
              'נמוך ב‑14% מממוצע יום חמישי — היום השלישי ברציפות מתחת לקו. שאר הסניפים על הממוצע או מעליו.'))))
    }
  })
})

// ── The same conversation continued inside the Comax analytics app (comaxApp.js look) ──
ReactComp('comaxAppContinuation', {
  impl: comp({
    hFunc: (_ctx, { react: { h } }) => () => {
      const chip = t => h('div', { key: t, className: 'px-3 py-1.5 text-[12px] rounded-full font-semibold', style: { border: `1px solid ${green}55`, color: '#4a7f0b', background: 'white' } }, t)
      return h('div', { dir: 'rtl', className: 'comax-brand min-h-full flex flex-col', style: { background: '#F6F7F8', color: ink } },
        brandFont(h),
        h('div', { className: 'px-4 py-3 bg-white flex items-center justify-between', style: { borderBottom: `2px solid ${green}` } },
          h('div', { className: 'w-8' }),
          h('div', { className: 'flex flex-col items-center' },
            h('img', { src: comaxLogo, className: 'h-5 w-auto' }),
            h('div', { className: 'text-[11px] font-semibold mt-0.5', style: { color: ink } }, 'אנליטיקה · 4 הודעות')),
          h('div', { className: 'w-8 text-center text-gray-400 text-[18px]' }, '⤢')),
        h('div', { className: 'flex-1 overflow-auto px-4 py-4' },
          h('div', { className: 'flex justify-start mb-5' },
            h('div', { className: 'px-4 py-2.5 rounded-2xl text-[15px] leading-6', style: { background: '#EBF4DE', color: ink } }, 'מה מצב המכירות בכל סניף')),
          h('div', { className: 'max-w-3xl' },
            h('div', { className: 'text-[16px] leading-7 mb-4', style: { color: ink } },
              h('div', {}, 'רוב הסניפים על ממוצע ',
                h('strong', { className: 'font-black' }, day), ' או מעליו, והרשת בעלייה קלה של ',
                h('strong', { className: 'font-black', style: { color: green } }, '0.6%'), '.'),
              h('div', { className: 'mt-2' }, 'החריג היחיד הוא ',
                h('strong', { className: 'font-black', style: { color: red } }, 'בר כוכבא פ״ת'),
                ' — נמוך ב‑14% מהממוצע, שלישי ברציפות מתחת לקו.')),
            h('div', { className: 'bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-4' }, ...branches.map(b => branchRow(h, b))),
            h('div', { className: 'rounded-2xl p-3.5 mb-4', style: { background: 'white', border: `1px solid ${red}22`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' } },
              h('div', { className: 'text-[13px] font-bold mb-1.5', style: { color: red } }, 'למה בר כוכבא פ״ת נשחק?'),
              h('div', { className: 'text-[13px] text-gray-600 leading-relaxed' },
                'הסניף כבר מסומן אצלנו כשוחק מרווח: 27.1% מרווח גולמי, כ‑4.8 נקודות מתחת לממוצע הרשת — פער שגורר כ‑₪2.6M בשנה. הירידה השבוע במכירות מצטרפת לאותה מגמה, וכדאי לבדוק תמחור והנחות קופה בסניף.')),
            h('div', { className: 'flex flex-wrap gap-2 mb-4' },
              chip('פרק את בר כוכבא לפי מחלקה'), chip('השווה מרווח מול שאר הרשת'), chip('מה נמכר פחות היום?')),
            h('div', { className: 'inline-flex items-center gap-1.5 text-[12px] text-gray-500' },
              h('span', { style: { fontSize: '13px' } }, '🗄'), 'הצג SQL / נתונים')),
          h('div', { className: 'h-24' })),
        h('div', { className: 'px-4 py-3', style: { background: 'rgba(246,247,248,0.9)' } },
          h('div', { className: 'flex items-end gap-2 rounded-[22px] border border-gray-200 bg-white p-2 shadow-sm max-w-3xl mx-auto' },
            h('div', { className: 'flex-1 px-3 py-2 text-[15px] text-gray-400' }, 'שאלו על נתוני Comax ERP...'),
            h('div', { className: 'w-10 h-10 rounded-full flex items-center justify-center text-white text-[18px]', style: { background: green } }, '↑'))))
    }
  })
})

// ── Hero / outro cards ──
const fadeUp = '@keyframes cFadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}'
const animStyle = (d = 0) => ({ animation: `cFadeUp 600ms ${d}ms ease both` })
Component('comaxHeroScreen', {
  type: 'react-comp<react>',
  params: [{ id: 'line1', as: 'string' }, { id: 'line2', as: 'string' }],
  impl: comp({
    hFunc: (_ctx, { react: { h } }, { line1, line2 }) => () =>
      h('div', { dir: 'rtl', className: 'comax-brand relative flex flex-col items-center justify-center h-full px-6 text-white overflow-hidden',
          style: { background: `radial-gradient(ellipse at 50% 30%, #4a7f0b 0%, #14210a 72%)` } },
        h('style', {}, comaxFontCss + fadeUp),
        h('div', { style: { position: 'absolute', width: '220px', height: '220px', borderRadius: '50%', background: `${green}33`, filter: 'blur(60px)', top: '32%', left: '50%', transform: 'translate(-50%,-50%)' } }),
        h('img', { src: comaxLogo, className: 'h-9 w-auto relative mb-8', style: animStyle() }),
        h('div', { className: 'text-[27px] font-black text-center leading-tight tracking-tight relative', style: animStyle(150) }, line1),
        h('div', { className: 'text-[20px] font-bold text-center leading-snug mt-2 relative', style: { ...animStyle(350), color: '#DFCB1A', whiteSpace: 'pre-line' } }, line2))
  })
})

// Gentle scroll through the opened Comax app view.
Component('comaxScrollThrough', {
  type: 'step-animation<demo-player>',
  impl: ctx => async speed => {
    const el = document.querySelector('.overflow-auto'); if (!el) return
    const dur = (ctx.vars.duration || 8000) / speed
    await delay(dur * 0.15)
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); await delay(dur * 0.55)
    el.scrollTo({ top: 0, behavior: 'smooth' }); await delay(dur * 0.3)
  }
})

const { 'react-comp': { comaxHeroScreen, comaxBranchStatusChart, comaxAppContinuation } } = dsls.react
const { 'step-animation': { comaxScrollThrough } } = dsls['demo-player']

const botName = 'Comax · אנליטיקה'
const botImage = comaxLogo

Scenario('comaxBranches', {
  impl: chatScenario('ComaxBranches', {
    steps: [
      animationScreen(comaxHeroScreen('שאלה אחת בוואטסאפ,\nתמונת מצב של כל הרשת', ''), { duration: 3200 }),
      whatsappSetup([
        whatsappSingleChat('comaxAgent', botName, {
          chatImage: botImage,
          otherParticipant: whatsappParticipant(botName, botImage),
          lastMessage: 'תמונת המצב היומית מוכנה', time: '8:05'
        })
      ], { userDisplayName: 'רונית', userImage: waDefaultAvatarUrl }),

      openWhatsapp('comaxAgent'),
      waDateSpacer('היום', { delay: 0 }),
      user('מה מצב המכירות בכל סניף', { delay: 2500 }),
      bot({
        text: '📊 רוב הסניפים על ממוצע יום חמישי או מעליו, והרשת בעלייה קלה של 0.6%.\nשים לב: בר כוכבא פ״ת נמוך ב‑14% מהממוצע — שלישי ברציפות מתחת לקו.\n\nהפירוט המלא והמשך שיחה בקומקס:\nhttps://comax.wonder.new',
        image: image(comaxBranchStatusChart()), delay: 3000, id: 'branch-status'
      }),
      surveyImage({ targetMessage: 'branch-status', scan: scanAll(), duration: 6500, delay:4000 }),
      explain('אפשר לשאול כל שאלה ולקבל תשובה ברורה בוואטסאפ', { targetMessage: 'branch-status', duration: 5500 }),
      openUrl({ content: image(comaxAppContinuation()), animation: comaxScrollThrough(), delay: 2500, duration: 11000 }),
      explain('לחיצה על הקישור פותחת את אותה שיחה בקומקס — שם אפשר להעמיק, לפלח לפי מחלקה ולשאול הלאה', { duration: 5000 }),

      animationScreen(comaxHeroScreen('כל הרשת, במבט אחד', 'comax.wonder.new'), { duration: 4000 })
    ]
  })
})

ReactComp('demoTest.comaxBranchesDemo', { impl: demoPlayer(dsls['demo-spec'].scenario.comaxBranches()) })
ReactComp('demoTest.comaxBranchesViewer', { impl: demoPlayer(dsls['demo-spec'].scenario.comaxBranches()) })
