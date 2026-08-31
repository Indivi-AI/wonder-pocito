// Links Drive meeting docs (in the CRM folder) to contacts: sets docUrl + docText (first 4000 chars,
// so the in-app AI summary can read the meeting notes). Docs that match no contact go to
// doc-mismatches.json, which the CRM app surfaces as a top banner for manual linking.
// Runs after heyreach-sync (reads the contacts it just wrote). Run: node solutions/crm/docs-sync.mjs
// Needs: Drive API enabled + the CRM Drive folder shared (Viewer) with the job's service account.
import { Storage } from '@google-cloud/storage'
import { GoogleAuth } from 'google-auth-library'

const DIR = process.env.CRM_ROOM || (await import('./crm.config.mjs')).CRM_ROOM // room id (cron sets env; repo runs read the config)
const FOLDERS = ['1RKW5Cfs6hTAA4Q8z1uHVegDg8MO8ykRC'] // CRM data folder only (parent CRM folder has non-lead docs e.g. "CRM Design")
const bucket = new Storage().bucket('indiviai-wonder')
const read = async f => { try { return JSON.parse((await bucket.file(`${DIR}/${f}`).download())[0].toString()) } catch { return null } }
const write = (f, obj) => bucket.file(`${DIR}/${f}`).save(JSON.stringify(obj), { contentType: 'application/json' })

const client = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/drive.readonly'] }).getClient()
const token = (await client.getAccessToken()).token
const q = `(${FOLDERS.map(f => `'${f}' in parents`).join(' or ')}) and mimeType='application/vnd.google-apps.document' and trashed=false`
const params = new URLSearchParams({ q, fields: 'files(id,name)', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', corpora: 'allDrives', pageSize: '1000' })
const docs = (await (await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: { Authorization: `Bearer ${token}` } })).json()).files || []

const norm = s => (s || '').toLowerCase().replace(/[^a-zא-ת0-9]/g, ' ').replace(/\s+/g, ' ').trim()
const url = id => `https://docs.google.com/document/d/${id}/edit`
const docText = async id => { const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/plain`, { headers: { Authorization: `Bearer ${token}` } }); return r.ok ? (await r.text()).slice(0, 4000) : '' }
const existing = await read('contacts.json')
if (!existing) throw new Error('contacts.json read failed — aborting, will not overwrite real data')
const contacts = existing.content || []
const byDocId = Object.fromEntries(contacts.map(c => [c.docUrl?.match(/\/d\/([^/]+)/)?.[1], c]).filter(([id]) => id))
const matchDoc = doc => { const t = norm(doc.name), full = c => norm(c['Main Contact']) // first name + company token, or full name
  return contacts.find(c => { const fn = norm(c['Main Contact']).split(' ')[0], co = norm(c.Company).split(' ')[0]
    return fn && ((co && t.includes(fn) && t.includes(co)) || (full(c) && t.includes(full(c)))) }) }

const unmatched = []
for (const doc of docs) {
  const c = byDocId[doc.id] || matchDoc(doc)
  if (c) { c.docUrl ||= url(doc.id); c.docText = await docText(doc.id) }
  else unmatched.push({ id: doc.id, title: doc.name, url: url(doc.id) })
}
await write('contacts.json', { content: contacts })
await write('doc-mismatches.json', { content: unmatched })
console.log(`docs: ${docs.length} found, ${docs.length - unmatched.length} linked, ${unmatched.length} unmatched`)
