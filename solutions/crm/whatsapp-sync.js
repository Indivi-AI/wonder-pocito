// The "Track on leads" WhatsApp group is mirrored into this room by the Wonder bot, one message per outreach action,
// shaped "<linkedin url>\n<code>[\n\nfree text]". It is not the CRM room and holds no private data, so it is named here.
export const WA_ROOM = 'room://rpyoapmdp5/room'

const eventKinds = { r: 'request', m: 'message', meeting: 'meeting' }
const eventFunnel = { request: '0-Attempted to contact', message: '1-Contacted', meeting: '2-Discovery' }
const eventIcons = { request: '🤝', message: '💬', meeting: '📅' }
const eventLabels = { request: 'Friend requests', message: 'Messages', meeting: 'Meetings' }
const senderByWaName = { 'Roee Winder': 'Winder', 'יפתח נוימן': 'Yiftach' }
const senders = ['Winder', 'Yiftach']
const senderColors = { Winder: '#3b82f6', Yiftach: '#f59e0b' }
const kindOrder = ['request', 'message', 'meeting']
const dayKey = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const dayStart = d => new Date(d).setHours(0, 0, 0, 0)
const lastDays = n => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (n - 1 - i)); return d })
const advance = (cur, next, stages) => stages.indexOf(next) > stages.indexOf(cur) ? next : cur

export const normLinkedin = u => (u || '').toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*/, '').replace(/\/+$/, '')
export const nameFromLinkedin = li =>
  (li.split('/in/')[1] || li).replace(/-[0-9a-f]{6,}$/, '').split('-').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')

// The code is the first *word* on the line after the url — letters only, so "Meeting, not relevant…" still reads as
// a meeting and the rest becomes the note. A quoted reply carries the original in row.replyTo, which we never read,
// so re-quoting an event message can never re-trigger it.
const eventLine = /(https?:\/\/\S*linkedin\.com\/\S+)\s*\n\s*([A-Za-z]+)([\s\S]*)/i
export const parseWaEvents = rows => (rows || []).flatMap(row => {
  const [, url, code, note] = (row.content || '').match(eventLine) || []
  const kind = eventKinds[(code || '').toLowerCase()], by = senderByWaName[row.sender]
  return kind && by ? [{ waId: row.id, ts: row.time, kind, by, url, li: normLinkedin(url),
    note: (note || '').replace(/^[\s,.:;!?—–-]+/, '').trim() }] : []
})

// idempotent by waId: an event already in a contact's activity is never re-applied, so re-entering the CRM is a no-op
export const applyWaEvents = (contacts, events, funnelStages) => {
  const byLi = new Map(contacts.filter(c => c.linkedin).map(c => [normLinkedin(c.linkedin), c]))
  const fresh = events.filter(e => byLi.has(e.li) && !(byLi.get(e.li).activity || []).some(a => a.waId == e.waId))
  const patched = fresh.reduce((m, e) => {
    const c = m.get(byLi.get(e.li).id) || byLi.get(e.li)
    return m.set(c.id, { ...c, Funnel: advance(c.Funnel, eventFunnel[e.kind], funnelStages),
      activity: [...(c.activity || []), { waId: e.waId, ts: e.ts, kind: e.kind, by: e.by }],
      ...(e.note && { notes: [...(c.notes || []), { ts: e.ts, text: e.note }] }) })
  }, new Map())
  const unmatched = Object.values(events.filter(e => !byLi.has(e.li))
    .reduce((m, e) => (m[e.li] = { ...e, kinds: [...new Set([...(m[e.li]?.kinds || []), e.kind])] }, m), {}))
  return { contacts: patched.size ? contacts.map(c => patched.get(c.id) || c) : contacts, applied: fresh.length, unmatched }
}

// one pass over the events fills every kind×sender×day bucket, so cost is O(events) per render regardless of the range
const bucket = (events, days) => {
  const cols = lastDays(days), slot = cols.reduce((m, d, i) => (m[dayKey(d)] = i, m), {})
  const bins = Object.fromEntries(kindOrder.flatMap(k => senders.map(sender => [`${k}|${sender}`, Array(days).fill(0)])))
  events.forEach(e => { const i = slot[dayKey(new Date(e.ts))], b = bins[`${e.kind}|${e.by}`]; if (i != null && b) b[i]++ })
  return { cols, bins }
}
const sum = a => a.reduce((x, y) => x + y, 0)

export const waSummary = (events, days) => {
  const { bins } = bucket(events, days)
  return kindOrder.map(k => `${eventIcons[k]} ${sum(senders.flatMap(sender => bins[`${k}|${sender}`]))}`).join('  ·  ')
}

export const waChart = (h, events, days) => {
  const { cols, bins } = bucket(events, days), every = Math.ceil(days / 7)
  // up to 14 days the slots are wide enough to print each count on its bar; beyond that only the y-max is shown and
  // the exact numbers come from hovering the day column (the whole column is the hit area, so empty days work too)
  const showVals = days <= 14, barTop = showVals ? 84 : 100
  return h('div:flex flex-wrap gap-3', {}, kindOrder.map(kind => {
    const series = senders.map(sender => bins[`${kind}|${sender}`]), max = Math.max(1, ...series.flat())
    return h('div:flex-1 min-w-[240px] bg-white border border-gray-200 rounded-xl p-3', { key: kind },
      h('div:flex items-baseline justify-between mb-2', {},
        h('span:text-xs font-semibold text-gray-700', {}, `${eventIcons[kind]} ${eventLabels[kind]}`),
        h('span:text-xs flex gap-2', {}, senders.map((sender, s) =>
          h('span', { key: sender, style: { color: senderColors[sender] } }, `${sender} ${sum(series[s])}`)))),
      h('div:relative flex items-end gap-[3px] h-24 border-b border-gray-200', {},
        !showVals && h('div:absolute left-0 top-0 text-[9px] text-gray-300 leading-none', {}, max),
        cols.map((d, i) =>
          h('div:flex-1 flex items-end justify-center gap-[2px] h-full hover:bg-gray-50/70 rounded', {
            key: i, title: `${d.toLocaleDateString([], { day: '2-digit', month: 'short' })} · ${senders.map((sn, si) => `${sn} ${series[si][i]}`).join(' · ')}`
          }, senders.map((sender, s) => {
            const v = series[s][i]
            return h('div:flex-1 flex flex-col justify-end items-center h-full', { key: sender },
              showVals && v > 0 && h('div:text-[9px] leading-none font-semibold mb-0.5', { style: { color: senderColors[sender] } }, v),
              h('div:rounded-t w-3/4', { style: { height: `${v / max * barTop}%`, minHeight: v ? '3px' : 0, background: senderColors[sender] } }))
          })))),
      h('div:flex gap-[3px] mt-1', {}, cols.map((d, i) =>
        h('div:flex-1 text-[9px] text-gray-400 text-center', { key: i }, // anchored to the right so today always keeps its label
          (days - 1 - i) % every ? '' : `${d.getDate()}/${d.getMonth() + 1}`))))
  }))
}
