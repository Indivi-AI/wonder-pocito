// Syncs HeyReach LinkedIn conversations *initiated by us* into the CRM contacts file.
// Matches existing leads by linkedin url or by name; creates new leads otherwise.
// Run from repo root: node solutions/crm/heyreach-sync.mjs
import { Storage } from '@google-cloud/storage'

const DIR = process.env.CRM_ROOM || (await import('./crm.config.mjs')).CRM_ROOM // room id (cron sets env; repo runs read the config)
const ACCOUNT_LABELS = { 'roee1.winder@gmail.com': 'Winder', 'yiftachn@gmail.com': 'Yiftach' } // heyreach account email → CRM sender label
const EXCLUDE = ['https://www.linkedin.com/in/yiftachneuman'] // co-founders chatting with each other are not leads
const bucket = new Storage().bucket('indiviai-wonder')
const read = async f => {
  try { return JSON.parse((await bucket.file(`${DIR}/${f}`).download())[0].toString()) } catch { return null }
}

const { apiKey } = await read('heyreach-api-key.json')
const api = async (path, body) => (await fetch(`https://api.heyreach.io/api/public/${path}`, {
  method: 'POST', headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
})).json()

const convs = []
for (let offset = 0, total = 1; convs.length < total; offset += 100) {
  const { items, totalCount } = await api('inbox/GetConversationsV2', { filters: {}, offset, limit: 100 })
  total = totalCount
  convs.push(...items)
}

const norm = s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim()
const dmy = ts => { const d = new Date(ts); return `${`${d.getDate()}`.padStart(2, '0')}/${`${d.getMonth() + 1}`.padStart(2, '0')}/${d.getFullYear()}` }
const parseDmy = s => { const [d, m, y] = (s || '').split('/').map(Number); return y ? new Date(y, m - 1, d).getTime() : 0 }
const existing = await read('contacts.json')
if (!existing) throw new Error('contacts.json read failed — aborting, will not overwrite real data')
const contacts = existing.content || []
const byLinkedin = Object.fromEntries(contacts.filter(c => c.linkedin).map(c => [c.linkedin, c]))
const byName = Object.fromEntries(contacts.map(c => [norm(c['Main Contact']), c]))

const startedByUs = convs.filter(c => !c.groupChat && c.correspondentProfile?.profileUrl
  && !EXCLUDE.includes(c.correspondentProfile.profileUrl) && c.messages[0]?.sender == 'ME')
for (const conv of startedByUs) {
  const p = conv.correspondentProfile
  const name = `${p.firstName} ${p.lastName}`.trim()
  const sender = ACCOUNT_LABELS[conv.linkedInAccount.emailAddress] || conv.linkedInAccount.firstName
  const first = s => norm(s).split(' ')[0]
  let c = byLinkedin[p.profileUrl] || byName[norm(name)]
    || (p.companyName && contacts.find(o => norm(o.Company) == norm(p.companyName) && norm(o.Position) == norm(p.position) && first(o['Main Contact']) == first(name)))
  if (!c) {
    c = { id: `${norm(name)}|${norm(p.companyName)}`, 'Main Contact': name, Company: p.companyName || '',
      Position: p.position || '', Funnel: '0-Attempted to contact', 'Chance 1-10': '1', sender }
    contacts.push(c)
  }
  const liMsgs = conv.messages.map(m => ({
    ts: Date.parse(m.createdAt), text: m.body || m.postLink || '',
    from: m.sender == 'ME' ? sender : p.firstName
  }))
  Object.assign(c, { linkedin: p.profileUrl, sender: c.sender || sender,
    msgs: [...liMsgs, ...(c.msgs || []).filter(m => m.manual)].sort((a, b) => a.ts - b.ts) })
  const replied = conv.messages.some(m => m.sender == 'CORRESPONDENT')
  if (replied && (!c.Funnel || /^0/.test(c.Funnel))) c.Funnel = '1-Contacted'
  else if (!c.Funnel || c.Funnel == '0-Lead') c.Funnel = '0-Attempted to contact' // we messaged them → attempted
  if (replied && Number(c['Chance 1-10'] || 1) < 2) c['Chance 1-10'] = '2' // they answered → bump chance to 2
  const lastSent = [...c.msgs].reverse().find(m => m.from == c.sender) // most recent msg we sent
  if (lastSent && !c.dateLocked && /^[01]/.test(c.Funnel || '') && (!c['next action'] || /^(Send message|send opener|connect on linkedin)$/.test(c['next action']))) { // funnel 0/1 → follow up 4 days after our last msg, unless the date was set by hand (dateLocked)
    c['next action'] = 'Send message'
    c['date next action'] = dmy(Math.max(lastSent.ts + 4 * 864e5, parseDmy(c['date next action'])))
  }
}

// ── connection-watch: a lead with next action "connect on linkedin" is detected as ACCEPTED once
// they appear in the sender's 1st-degree network (works for manually-sent requests, no campaign needed).
// Name-based match (network profileUrls are obfuscated). On accept: advance funnel + queue the opener.
const SENDERS = { Winder: 211536, Yiftach: 212029 } // CRM sender label → heyreach account id
let accepted = 0
try {
  const netNames = {}
  for (const [label, sid] of Object.entries(SENDERS)) {
    const names = new Set()
    for (let page = 0, total = 1, got = 0; got < total; page++) {
      const { items, totalCount } = await api('MyNetwork/GetMyNetworkForSender', { senderId: sid, pageNumber: page, pageSize: 100 })
      total = totalCount || 0
      for (const it of items || []) names.add(norm(`${it.firstName} ${it.lastName}`))
      got += (items || []).length
      if (!items?.length) break
    }
    netNames[label] = names
  }
  for (const c of contacts) {
    if (!['connect on linkedin', 'awaiting acceptance'].includes(c['next action'])) continue // cold leads: to-send or already-sent, awaiting accept
    if (netNames[c.sender]?.has(norm(c['Main Contact']))) { // they accepted the owner's request
      c.Funnel = '0-Attempted to contact'; c['next action'] = 'send opener'; c['date next action'] = dmy(Date.now())
      accepted++
    }
  }
} catch (e) { console.error('connection-watch skipped:', e.message) } // never let it block the contact save

const locked = Object.fromEntries(((await read('contacts.json'))?.content || []).filter(c => c.dateLocked).map(c => [c.id, c])) // re-read just before save: a lock set mid-run must win over our stale recompute
const merged = contacts.map(c => locked[c.id] ? { ...c, dateLocked: true, 'date next action': locked[c.id]['date next action'] } : c)
await bucket.file(`${DIR}/contacts.json`).save(JSON.stringify({ content: merged }), { contentType: 'application/json' })
console.log(`synced ${startedByUs.length}/${convs.length} conversations (started by us); ${accepted} connection(s) accepted; ${contacts.length} contacts`)
