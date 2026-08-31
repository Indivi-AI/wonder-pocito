// Import a prospect list into the Wonder CRM as new leads.
// Mirrors heyreach-sync's storage contract: reads {content:[...]} from GCS, dedups
// (by id "name|company" / name / linkedin url), appends, writes {content:[...]}.
// DRY by default; --write commits (backing up contacts.json first). Run from repo root.
//
//   SRC=/tmp/<list>/enriched180.json \
//   FUNNEL='0-Lead' PRODUCT='ETLS' NEXT_ACTION='connect on linkedin' \
//   STAGGER='per-company-workingdays' OWNERS='Winder,Yiftach' \
//   SUMMARY='ETLS – market-evidence list (Apollo).' \
//   node .claude/skills/apollo-list-creation/scripts/crm_import.mjs [--write]
//
// SRC items: { name, org, title, linkedin_url }  (the master/enriched list shape),
//   OR pre-built CRM leads — any item that already has a 'Main Contact' key is passed
//   through as-is (only id + linkedin normalised + dedup), so each lead can carry its own
//   summary / Chance / Funnel / next action (e.g. ICP-fit metadata from Phase 5b).
// Config (env):
//   SRC*        path to the list json
//   FUNNEL      default '0-Lead' (hidden in CRM default view — good for cold leads)
//   PRODUCT     comma list -> Product[] (e.g. 'ETLS'); empty = none
//   NEXT_ACTION default '' ; sets "next action" on every lead
//   STAGGER     'per-company-workingdays' (default) | 'today' | 'none'
//               per-company: 1st person in a company = today, 2nd = next Israeli
//               working day (skips Fri/Sat), etc. singles = today.
//   OWNERS      comma list round-robined into `sender` (e.g. 'Winder,Yiftach'); empty = blank
//   SUMMARY     default '' ; source note written to every lead
//   CRM_ROOM    overrides solutions/crm/crm.config.mjs
import { Storage } from '@google-cloud/storage'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const env = (k, d = '') => process.env[k] ?? d
const SRC = env('SRC'); if (!SRC) throw new Error('set SRC=<list json path>')
const FUNNEL = env('FUNNEL', '0-Lead'), NEXT_ACTION = env('NEXT_ACTION'), SUMMARY = env('SUMMARY')
const PRODUCT = env('PRODUCT').split(',').map(s => s.trim()).filter(Boolean)
const OWNERS = env('OWNERS').split(',').map(s => s.trim()).filter(Boolean)
const STAGGER = env('STAGGER', 'per-company-workingdays')
const WRITE = process.argv.includes('--write')
const CRM_ROOM = env('CRM_ROOM') || (await import(path.join(process.cwd(), 'solutions/crm/crm.config.mjs'))).CRM_ROOM

const bucket = new Storage().bucket('indiviai-wonder')
const read = async f => { try { return JSON.parse((await bucket.file(`${CRM_ROOM}/${f}`).download())[0].toString()) } catch { return null } }
const norm = s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim()
const httpsUrl = u => (u || '').replace(/^http:/, 'https:').replace(/\/+$/, '')
const dmy = d => `${`${d.getDate()}`.padStart(2, '0')}/${`${d.getMonth() + 1}`.padStart(2, '0')}/${d.getFullYear()}`
const workingDays = n => { const out = [], d = new Date(); while (out.length < n) { if (![5, 6].includes(d.getDay())) out.push(new Date(d)); d.setDate(d.getDate() + 1) } return out }
const DAYS = workingDays(60)
const dueDate = nth => STAGGER === 'none' ? '' : STAGGER === 'today' ? dmy(new Date()) : dmy(DAYS[nth])

const people = JSON.parse(readFileSync(SRC, 'utf8'))
const existing = await read('contacts.json')
if (!existing) throw new Error('contacts.json read failed — aborting, will not touch real data')
const contacts = existing.content || []
const liSet = new Set(contacts.filter(c => c.linkedin).map(c => httpsUrl(c.linkedin)))
const nameSet = new Set(contacts.map(c => norm(c['Main Contact'])))
const idSet = new Set(contacts.map(c => c.id))

const perCompany = {}, skipped = [], newLeads = []
let added = 0
for (const p of people) {
  const pre = p['Main Contact'] ? p : null      // passthrough: item is already a full CRM lead (per-lead summary/chance/etc.)
  const nm = pre ? p['Main Contact'] : p.name
  const org = pre ? (p.Company || '') : p.org
  const li = httpsUrl(pre ? p.linkedin : p.linkedin_url)
  const id = p.id || `${norm(nm)}|${norm(org)}`
  if (idSet.has(id) || nameSet.has(norm(nm)) || (li && liSet.has(li))) { skipped.push(nm); continue }
  const nth = perCompany[org] = (perCompany[org] || 0); perCompany[org]++
  let lead
  if (pre) { lead = { ...p, id, linkedin: li } }
  else {
    lead = { id, 'Main Contact': nm, Company: org, Position: p.title,
      Funnel: FUNNEL, 'Chance 1-10': '1', 'Alive/Dead': 'Alive', linkedin: li }
    if (PRODUCT.length) lead.Product = PRODUCT
    if (OWNERS.length) lead.sender = OWNERS[added % OWNERS.length]
    if (NEXT_ACTION) { lead['next action'] = NEXT_ACTION; lead['date next action'] = dueDate(nth) }
    if (SUMMARY) lead.summary = SUMMARY
  }
  newLeads.push(lead); added++
}

console.log(`source ${people.length} | existing ${contacts.length} | new ${newLeads.length} | skipped(dup) ${skipped.length}`)
if (skipped.length) console.log('  skipped:', skipped.join(', '))
if (OWNERS.length) console.log('owner split:', newLeads.reduce((m, l) => (m[l.sender] = (m[l.sender] || 0) + 1, m), {}))
const multi = Object.entries(perCompany).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1])
if (NEXT_ACTION && STAGGER === 'per-company-workingdays') {
  console.log(`\nmulti-person companies (${multi.length}) — staggered due dates:`)
  for (const [co] of multi) console.log(`  ${co}: ` +
    newLeads.filter(l => l.Company === co).map(r => `${r['Main Contact'].split(' ')[0]}=${r['date next action']}`).join(', '))
}
console.log('\nsample:', JSON.stringify(newLeads[0], null, 1))

if (!WRITE) { console.log('\nDRY RUN — no write. Re-run with --write to commit.'); process.exit(0) }
const ts = dmy(new Date()).replace(/\//g, '-')
await bucket.file(`${CRM_ROOM}/contacts.backup-${ts}.json`).save(JSON.stringify(existing), { contentType: 'application/json' })
const merged = [...contacts, ...newLeads]
await bucket.file(`${CRM_ROOM}/contacts.json`).save(JSON.stringify({ content: merged }), { contentType: 'application/json' })
console.log(`\nWROTE ${merged.length} contacts (was ${contacts.length}, +${newLeads.length}). Backup: contacts.backup-${ts}.json`)
