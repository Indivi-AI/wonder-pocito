import assert from 'node:assert/strict'
import test from 'node:test'
import { seedMarketplaceAssets } from './scripts/seed-marketplace-assets.mjs'

const quick = id => ({[`query-${id}`]: [{Name: 'query', Type: 'String', DisplayName: 'Query', Description: 'Search', IsRequired: false}]})
const metadata = id => ({Id: Number(id), Name: `Package ${id}`, Queries: [{id: `cube-${id}`, Name: `Cube ${id}`, Fields: []}]})

test('seeds four FLAPI tools, one skill, and one agent only once', async () => {
  const stored = new Map()
  const fetchImpl = async (input, options = {}) => {
    const path = new URL(input).pathname, method = options.method || 'GET', id = path.split('/').filter(Boolean).at(-1)
    if (path.includes('/package/v1/quick/')) return Response.json(quick(id))
    if (path.includes('/package/v2/')) return Response.json(metadata(id))
    const parts = path.split('/').filter(Boolean), plural = parts[2]
    if (method == 'GET') return stored.has(`${plural}/${id}`) ? Response.json(stored.get(`${plural}/${id}`)) : new Response('', {status: 404})
    const payload = JSON.parse(options.body)
    stored.set(`${plural}/${payload.id}`, payload)
    return Response.json(payload, {status: method == 'POST' ? 201 : 200})
  }
  const options = {fetchImpl, env: {FLAPI_BASE_URL: 'http://flapi', MARKETPLACE_API_URL: 'http://marketplace'}}
  assert.deepEqual((await seedMarketplaceAssets(options)).created, [
    'northstar-company-email', 'northstar-instagram', 'tel-aviv-places', 'northstar-itinerary',
    'northstar-travel-support', 'northstar-travel-agent'
  ])
  assert.equal((await seedMarketplaceAssets(options)).existing.length, 6)
  stored.get('skills/northstar-travel-support').description = 'stale'
  assert.deepEqual((await seedMarketplaceAssets(options)).updated, ['northstar-travel-support'])
  assert.deepEqual([...stored.values()].filter(({tool_type}) => tool_type).map(({package_id}) => package_id), ['101', '102', '103', '104'])
  const agent = stored.get('agents/northstar-travel-agent')
  assert.deepEqual(agent.config.tools, ['northstar-company-email', 'northstar-instagram', 'tel-aviv-places', 'northstar-itinerary'])
  const skill = stored.get('skills/northstar-travel-support').skill_md
  assert(!/Opa|8 Ha-Halutzim|benchmark\.json/i.test(skill))
})
