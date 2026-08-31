// Syncs Fathom meetings into the CRM contacts file (replaces docs-sync). For each meeting, matches
// EXTERNAL invitees to contacts by name (fuzzy) or company-domain token, and upserts c.meetings.
// Meetings matching no contact → fathom-unmatched.json (CRM banner). Run: node solutions/crm/fathom-sync.mjs
import { Storage } from '@google-cloud/storage'

const DIR = process.env.CRM_ROOM || (await import('./crm.config.mjs')).CRM_ROOM // room id (cron sets env; repo runs read the config)
const bucket = new Storage().bucket('indiviai-wonder')
const read = async f => { try { return JSON.parse((await bucket.file(`${DIR}/${f}`).download())[0].toString()) } catch { return null } }
const write = (f, obj) => bucket.file(`${DIR}/${f}`).save(JSON.stringify(obj), { contentType: 'application/json' })

const { apiKey } = await read('fathom-api-key.json')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const api = async path => { // honor RateLimit headers; on 429 sleep until reset then retry
  while (true) {
    const r = await fetch(`https://api.fathom.ai/external/v1/${path}`, { headers: { 'X-Api-Key': apiKey } })
    if (r.status == 429) { await sleep((Number(r.headers.get('RateLimit-Reset')) || 60) * 1000); continue }
    if (Number(r.headers.get('RateLimit-Remaining')) == 0) await sleep((Number(r.headers.get('RateLimit-Reset')) || 1) * 1000)
    if (!r.ok) throw new Error(`Fathom ${path} → ${r.status}`)
    return r.json()
  }
}

const since = (await read('fathom-state.json'))?.lastSyncedAt // created_at high-water mark; created_after is inclusive so the boundary meeting re-appears but is deduped below. First run: full backfill.
const meetings = []
for (let cursor = ''; ;) {
  const { items, next_cursor } = await api(`meetings?include_summary=true&include_action_items=true${since ? `&created_after=${encodeURIComponent(since)}` : ''}${cursor ? `&cursor=${cursor}` : ''}`)
  meetings.push(...(items || []))
  if (!next_cursor) break
  cursor = next_cursor
}

const norm = s => (s || '').toLowerCase().replace(/[^a-zא-ת0-9]/g, ' ').replace(/\s+/g, ' ').trim()
const existing = await read('contacts.json')
if (!existing) throw new Error('contacts.json read failed — aborting, will not overwrite real data')
const contacts = existing.content || []

const matchContacts = inv => contacts.filter(c => { // external invitees → contacts by name or company-domain token
  const fn = norm(c['Main Contact']), co = norm(c.Company).split(' ')[0]
  return fn && inv.some(i => { const n = norm(i.name), dom = norm((i.email_domain || '').split('.')[0])
    return (n && (n.includes(fn) || fn.includes(n))) || (co && dom && co == dom) })
})

const ignored = new Set((await read('fathom-ignored.json'))?.content || []) // recording_ids the user dismissed
const linked = new Map(contacts.flatMap(c => (c.meetings || []).map(m => [m.recording_id, c]))) // already attached (manual via banner or auto)
const unmatched = new Map(((await read('fathom-unmatched.json'))?.content || []).map(u => [u.recording_id, u])) // accumulated across runs
for (const id of [...unmatched.keys()]) if (linked.has(id) || ignored.has(id)) unmatched.delete(id) // user resolved via banner → clear it (no API call)

let attached = 0
for (const m of meetings) {
  const id = m.recording_id
  if (linked.has(id) || ignored.has(id)) continue // already handled (incl. the re-fetched boundary meeting) — don't reprocess
  const inv = (m.calendar_invitees || []).filter(i => i.is_external)
  if (!inv.length) { unmatched.delete(id); continue } // internal/demo meeting, never unmatched noise
  const entry = { recording_id: id, title: m.title || m.meeting_title, date: m.recording_start_time,
    summary: m.default_summary?.markdown_formatted || '', actionItems: (m.action_items || []).map(a => a.description), url: m.share_url }
  const matched = matchContacts(inv)
  if (matched.length) {
    attached++; unmatched.delete(id)
    for (const c of matched)
      c.meetings = [...(c.meetings || []).filter(x => x.recording_id != id), entry].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
  } else unmatched.set(id, { ...entry, invitees: inv.map(i => i.name) })
}

const watermark = meetings.reduce((mx, m) => (m.created_at > mx ? m.created_at : mx), since || '') // advance to newest created_at → next run fetches only ties + genuinely new
if (attached) await write('contacts.json', { content: contacts }) // only rewrite real data when something actually changed
await write('fathom-unmatched.json', { content: [...unmatched.values()] })
if (watermark) await write('fathom-state.json', { lastSyncedAt: watermark })
console.log(`fathom: ${meetings.length} fetched (since ${since || 'beginning'}), ${attached} attached, ${unmatched.size} unmatched total`)
