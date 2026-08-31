import { dsls, jb } from '@jb6/core'
import '@jb6/react'
import '@wonder/db/db-drivers.js'
import { handleAuth, LoginScreen } from '@wonder/db/oauth2.js'

const { wfetch2 } = jb.wonderUtils
const { react: { ReactComp, 'react-comp': { comp } } } = dsls

// room comes from the applet spec (shell passes roomUrl: room://<id> in ctx) — never hardcoded here
const getRoom = ctx => ctx.vars.roomUrl || new URLSearchParams(globalThis.location?.search || '').get('roomUrl')
const navTo = cmpId => { const u = new URL(globalThis.location.href); u.searchParams.set('cmpId', cmpId); globalThis.location.assign(u.href) }
const knownProducts = ['LPO', 'Marketing Data', 'ETLS', 'UI', 'WonderSpace', 'Workflows']
const fields = [
  { id: 'pain', label: 'Pain', hint: "The customer's problem today, in their words — what hurts without us." },
  { id: 'businessValue', label: 'Business Value', hint: 'What value does it create for the customer?' },
  { id: 'wedge', label: 'Wedge', hint: 'The sharp entry angle — the one use case you lead with to land the first deal.' },
  { id: 'icp', label: 'ICP — Ideal Customer Profile', hint: 'Company size, industry, stage, geography…' },
  { id: 'targetBuyer', label: 'Target Buyer / Persona', hint: 'Who signs off? Who champions it internally?' },
  { id: 'pricingModel', label: 'Pricing Model', hint: 'How is it priced and packaged?' },
  { id: 'keyDifferentiator', label: 'Key Differentiator', hint: 'Why us over the alternatives?' },
  { id: 'competitors', label: 'Competitors', hint: 'Direct and indirect alternatives.' },
  { id: 'commonObjections', label: 'Common Objections', hint: 'What do prospects push back on, and the rebuttal?' }
]
const taCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 resize-y'

ReactComp('productMap', {
  impl: comp({
    hFunc: (ctx, { initialData, readOk, authed, dbUrl, react: { h, useState, useRef } }) => () => {
      if (!authed) return h(LoginScreen)
      const [data, setData] = useState(initialData)
      const [product, setProduct] = useState('ETLS')
      const [saving, setSaving] = useState(false)
      const timer = useRef(null)
      const rec = data[product] || {}

      const persist = next => {
        setData(next)
        if (!readOk) return
        clearTimeout(timer.current)
        timer.current = setTimeout(async () => {
          setSaving(true)
          await wfetch2(dbUrl, { method: 'PUT', body: next }, ctx)
          setSaving(false)
        }, 600)
      }
      const setField = (id, v) => persist({ ...data, [product]: { ...rec, [id]: v } })

      return h('div:w-full max-w-6xl mx-auto p-4 font-sans', {},
        h('div:flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5', {},
          h('div:flex items-center gap-3', {},
            h('button:px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50', { onClick: () => navTo('crm') }, '← CRM'),
            h('h1:text-2xl font-bold', {}, 'Product Mapping')),
          h('div:flex items-center gap-3', {},
            saving && h('span:text-sm text-gray-400', {}, 'saving…'),
            h('select:border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white', {
              value: product, onChange: e => setProduct(e.target.value)
            }, knownProducts.map(p => h('option', { key: p, value: p }, p))))),
        h('div:border border-gray-200 rounded-xl shadow-sm p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4', {},
          fields.map(f => h('div:flex flex-col gap-1', { key: f.id },
            h('label:text-sm font-semibold text-gray-700', {}, f.label),
            h('span:text-xs text-gray-400', {}, f.hint),
            h('textarea', {
              className: taCls, rows: 3, value: rec[f.id] || '',
              placeholder: f.hint, onChange: e => setField(f.id, e.target.value)
            })))))
    },
    enrichCtx: async ctx => {
      const authed = await handleAuth()
      if (!authed) return ctx.setVars({ authed: false })
      const dbUrl = ctx.vars.dbUrl || `${getRoom(ctx)}/products`
      const res = await wfetch2(dbUrl, { method: 'GET' }, ctx).catch(() => null)
      const readOk = !!res && (res.ok || res.status == 404)
      return ctx.setVars({ authed: true, dbUrl, readOk, initialData: readOk ? await res.json() : {} })
    }
  })
})
