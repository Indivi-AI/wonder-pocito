// Local stdio MCP server exposing the Indivi CRM (GCS) to Claude Desktop.
// Reads gs://indiviai-wonder/<CRM_ROOM>/{contacts,products}.json via ADC (your gcloud
// application-default credentials), and wraps the HeyReach public REST API (key from
// <CRM_ROOM>/heyreach-api-key.json). Read-only. Run by Claude Desktop — see claude_desktop_config below.
//
// Claude Desktop config (~/Library/Application Support/Claude/claude_desktop_config.json):
//   { "mcpServers": { "indivi-crm": {
//       "command": "node",
//       "args": ["/Users/roeewinder/Documents/Indivi/Genie/solutions/crm/crm-mcp.mjs"] } } }
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Storage } from '@google-cloud/storage'
import { execSync } from 'child_process'
import { z } from 'zod'
import { CRM_ROOM } from './crm.config.mjs'

// fresh client each call so it picks up refreshed ADC after a re-login
const file = name => new Storage().bucket('indiviai-wonder').file(`${CRM_ROOM}/${name}`)
const dl = async name => JSON.parse((await file(name).download())[0].toString()).content
const isAuthErr = e => /invalid_grant|invalid_rapt|reauth|unauthenticated|\b401\b|could not load the default credentials|refresh|credential|access token/i.test(e?.message || String(e))
// ADC refresh-token expired/revoked → re-run interactive login (opens a browser for the user); stdio ignored so it never corrupts the MCP stdout channel
const reauth = () => { try { execSync('gcloud auth application-default login', { stdio: 'ignore', timeout: 180000 }) } catch {} }
const withReauth = async fn => { try { return await fn() } catch (e) { if (!isAuthErr(e)) throw e; reauth(); return await fn() } }
const load = () => withReauth(async () => (await dl('contacts.json')) || [])
const loadProducts = () => withReauth(async () => { try { return (await dl('products.json')) || {} } catch (e) { if (e.code == 404) return {}; throw e } })
const knownProducts = ['LPO', 'Marketing Data', 'ETLS', 'UI', 'WonderSpace', 'Workflows']

// HeyReach public REST API, keyed by heyreach-api-key.json in the room (key cached after first read)
let _heyKey
const heyKey = async () => { if (!_heyKey) _heyKey = (await withReauth(async () => JSON.parse((await file('heyreach-api-key.json').download())[0].toString()))).apiKey; return _heyKey }
const heyApi = async (path, body) => { const r = await fetch(`https://api.heyreach.io/api/public/${path}`, { method: 'POST', headers: { 'X-API-KEY': await heyKey(), 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); if (!r.ok) throw new Error(`HeyReach ${path} → ${r.status}`); return r.json() }
// Fathom API (key from fathom-api-key.json in the room, {apiKey} at top level)
let _fathomKey
const fathomKey = async () => { if (!_fathomKey) _fathomKey = (await withReauth(async () => JSON.parse((await file('fathom-api-key.json').download())[0].toString()))).apiKey; return _fathomKey }
const fathomApi = async path => { const r = await fetch(`https://api.fathom.ai/external/v1/${path}`, { headers: { 'X-Api-Key': await fathomKey() } }); if (!r.ok) throw new Error(`Fathom ${path} → ${r.status}`); return r.json() }
const norm = s => (s || '').toLowerCase()
const parseDMY = s => { const [d, m, y] = (s || '').split('/'); return y ? Date.parse(`${y}-${m}-${d}`) : null }
const brief = c => ({ name: c['Main Contact'], company: c.Company, position: c.Position, funnel: c.Funnel,
  chance: c['Chance 1-10'], nextAction: c['next action'], date: c['date next action'], product: c.Product,
  status: c['Alive/Dead'], owner: c.sender, msgs: (c.msgs || []).length, meetings: (c.meetings || []).length })
const text = o => ({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o, null, 2) }] })
const dossier = (c, ps) => { const products = Object.fromEntries([].concat(c.Product || []).map(l => [l, ps[l]]).filter(([, v]) => v))
  const thread = (c.msgs || []).map(m => ({ dir: m.from === c.sender ? 'us' : 'them', from: m.from, text: m.text, ts: m.ts }))
  const sent = thread.filter(m => m.dir === 'us').map(m => m.text)
  const { msgs, ...record } = c
  const meetings = (c.meetings || []).map(m => ({ recording_id: m.recording_id, title: m.title, date: m.date, actionItems: m.actionItems, url: m.url }))
  return { record, products, thread, sentMessages: sent, opener: sent[0] || null, meetings } }

const server = new McpServer({ name: 'indivi-crm', version: '1.0.0' })

server.registerTool('crm_search',
  { description: 'Search CRM contacts by name, company, position, product, or summary text. Returns brief cards.',
    inputSchema: { query: z.string().describe('free-text search') } },
  async ({ query }) => { const q = norm(query)
    const hits = (await load()).filter(c => [c['Main Contact'], c.Company, c.Position, c.summary, (c.Product || []).join(' ')].some(v => norm(v).includes(q)))
    return text(hits.map(brief)) })

server.registerTool('crm_get',
  { description: 'Full record for one contact (incl. LinkedIn messages, Fathom meetings, and notes) by name. Set withProduct=true to also attach the product-mapping (business value, ICP, pricing…) for the contact\'s Product(s).',
    inputSchema: { name: z.string(), withProduct: z.boolean().optional() } },
  async ({ name, withProduct }) => { const c = (await load()).find(x => norm(x['Main Contact']).includes(norm(name)))
    if (!c) return text(`No contact matching "${name}"`)
    if (!withProduct) return text(c)
    const ps = await loadProducts()
    const productInfo = Object.fromEntries([].concat(c.Product || []).map(l => [l, ps[l]]).filter(([, v]) => v))
    return text({ ...c, productInfo }) })

server.registerTool('crm_list',
  { description: 'List contacts as brief cards, optionally filtered by funnel stage and/or owner (Winder/Yiftach).',
    inputSchema: { funnel: z.string().optional(), owner: z.string().optional() } },
  async ({ funnel, owner }) => text((await load())
    .filter(c => (!funnel || norm(c.Funnel).includes(norm(funnel))) && (!owner || norm(c.sender) === norm(owner)))
    .map(brief)))

server.registerTool('crm_stats',
  { description: 'Pipeline overview: totals, counts by funnel stage and owner, and overdue next-actions.', inputSchema: {} },
  async () => { const cs = await load(), now = Date.now()
    const by = f => cs.reduce((a, c) => { const k = (c[f] || '(none)'); a[k] = (a[k] || 0) + 1; return a }, {})
    const overdue = cs.filter(c => { const t = parseDMY(c['date next action']); return t && t < now })
      .map(c => ({ name: c['Main Contact'], date: c['date next action'], action: c['next action'], owner: c.sender }))
    return text({ total: cs.length, byFunnel: by('Funnel'), byOwner: by('sender'), overdueCount: overdue.length, overdue }) })

server.registerTool('crm_products',
  { description: `Product mapping: business value, ICP, target buyer, pricing model, key differentiator, competitors, common objections. Known products: ${knownProducts.join(', ')}. Omit "product" to get all; pass a (fuzzy) name for one.`,
    inputSchema: { product: z.string().optional().describe(`fuzzy name, one of: ${knownProducts.join(', ')}. omit to list all`) } },
  async ({ product }) => { const ps = await loadProducts()
    if (!product) return text({ products: ps, known: knownProducts })
    const key = Object.keys(ps).find(k => norm(k).includes(norm(product))) || knownProducts.find(k => norm(k).includes(norm(product)))
    return text(key ? { [key]: ps[key] || '(no mapping saved yet)' } : { known: knownProducts, note: `no match for "${product}"` }) })

server.registerTool('heyreach_campaigns',
  { description: 'List HeyReach campaigns (name, status, lead-list, progress stats).', inputSchema: { limit: z.number().optional() } },
  async ({ limit = 20 }) => text(((await heyApi('campaign/GetAll', { offset: 0, limit })).items || [])
    .map(c => ({ id: c.id, name: c.name, status: c.status, list: c.linkedInUserListName, stats: c.progressStats }))))

server.registerTool('heyreach_lists',
  { description: 'List HeyReach lead lists (name, size, linked campaign ids).', inputSchema: { limit: z.number().optional() } },
  async ({ limit = 20 }) => text(((await heyApi('list/GetAll', { offset: 0, limit })).items || [])
    .map(l => ({ id: l.id, name: l.name, count: l.totalItemsCount, campaignIds: l.campaignIds }))))

server.registerTool('heyreach_stats',
  { description: 'HeyReach outreach stats over a date range (messages sent, replies, connections, reply rate…). ISO dates; default last 30 days.',
    inputSchema: { startDate: z.string().optional(), endDate: z.string().optional() } },
  async ({ startDate, endDate }) => text(await heyApi('stats/GetOverallStats', { accountIds: [], campaignIds: [],
    startDate: startDate || new Date(Date.now() - 30 * 864e5).toISOString(), endDate: endDate || new Date().toISOString() })))

server.registerTool('heyreach_inbox',
  { description: 'Recent HeyReach LinkedIn conversations (correspondent + last message + account).', inputSchema: { limit: z.number().optional() } },
  async ({ limit = 20 }) => text(((await heyApi('inbox/GetConversationsV2', { filters: {}, offset: 0, limit })).items || [])
    .map(c => ({ name: `${c.correspondentProfile?.firstName || ''} ${c.correspondentProfile?.lastName || ''}`.trim(),
      company: c.correspondentProfile?.companyName, profile: c.correspondentProfile?.profileUrl,
      lastMessage: c.messages?.at(-1)?.body, account: c.linkedInAccount?.emailAddress }))))

server.registerTool('crm_lead_dossier',
  { description: 'Everything to analyze a lead and craft a reply: CRM record, matched product mapping(s), the full LinkedIn thread (each message marked us/them), and the exact message(s) we sent (opener first). Call this before drafting a response.',
    inputSchema: { name: z.string() } },
  async ({ name }) => { const c = (await load()).find(x => norm(x['Main Contact']).includes(norm(name)))
    if (!c) return text(`No contact matching "${name}"`)
    return text(dossier(c, await loadProducts())) })

server.registerTool('crm_product_dossiers',
  { description: `Full dossiers (CRM record, product mapping, LinkedIn thread, sent messages, meetings) for every contact mapped to a given product. Known products: ${knownProducts.join(', ')}.`,
    inputSchema: { product: z.string().describe(`fuzzy product name, one of: ${knownProducts.join(', ')}`) } },
  async ({ product }) => { const q = norm(product), ps = await loadProducts()
    const hits = (await load()).filter(c => [].concat(c.Product || []).some(p => norm(p).includes(q)))
    if (!hits.length) return text(`No contacts mapped to product "${product}"`)
    return text({ product, count: hits.length, dossiers: hits.map(c => dossier(c, ps)) }) })

server.registerTool('fathom_transcript',
  { description: 'Fetch the full transcript of a Fathom meeting recording (read-only). Pass recording_id, or a contact name to use that contact\'s most recent synced meeting.',
    inputSchema: { recording_id: z.number().optional(), name: z.string().optional() } },
  async ({ recording_id, name }) => {
    if (!recording_id && name) { const c = (await load()).find(x => norm(x['Main Contact']).includes(norm(name)))
      recording_id = c?.meetings?.at(-1)?.recording_id }
    if (!recording_id) return text('No recording_id (and no matching contact meeting found)')
    const { transcript } = await fathomApi(`recordings/${recording_id}/transcript`)
    return text((transcript || []).map(t => `[${t.timestamp}] ${t.speaker?.display_name || '?'}: ${t.text}`).join('\n') || '(empty transcript)') })

server.registerPrompt('analyze_lead',
  { title: 'Analyze lead & draft reply', description: 'Pull a lead\'s dossier, analyze them, and draft two reply variations.',
    argsSchema: { lead: z.string().describe('lead name (as in the CRM)') } },
  ({ lead }) => ({ messages: [{ role: 'user', content: { type: 'text', text:
`Help me reply to a LinkedIn lead for Indivi.

1. Call \`crm_lead_dossier\` with name "${lead}" to get the CRM record, the product mapping(s), the full LinkedIn thread (each message marked us/them), and the exact opener we sent.
2. Analyze briefly: role/company, funnel stage, which product they're mapped to, the exact opener we sent them, how they replied, and what the reply signals (interest, objection, question, brush-off).
3. Draft TWO distinct reply variations. Each: short and human (LinkedIn DM tone, no corporate fluff), directly answers what they actually said, leans on the product's business value / key differentiator from the mapping, and moves to a concrete next step. Make the two genuinely different in angle (e.g. one question/curiosity-led, one value/proof-led) so they can be A/B tested.
4. If the reply contains any objection, hesitation, or pushback, list it under "Objections spotted" — each phrased as a candidate addition to that product's commonObjections, with a one-line rebuttal. Do NOT save anything; just suggest, I'll decide.

Lead with the two reply variations.` } }] }))

await server.connect(new StdioServerTransport())
