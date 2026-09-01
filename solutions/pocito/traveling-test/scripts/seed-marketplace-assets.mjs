import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const packages = [
  ['101', 'northstar-company-email', 'Northstar company email',
    'Search company email for employee constraints and preferences. Use focused query, participant, date, thread, and limit parameters.'],
  ['102', 'northstar-instagram', 'Northstar employee Instagram',
    'Search ten offline employee Instagram posts and comments by text, author, location, date, and limit.'],
  ['103', 'tel-aviv-places', 'Tel Aviv offline places',
    'Search the offline Tel Aviv places snapshot by text, type, dietary support, rating, and limit. Returns venue details and addresses.'],
  ['104', 'northstar-itinerary', 'Northstar Tel Aviv itinerary',
    'Search scheduled meetings and attendance by text, attendee, location, date, and limit. Returns precise venue and area details.']
]

const json = async response => {
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
  return response.json()
}

const flapiJson = async (fetchImpl, baseUrl, path, env) => {
  const url = `${baseUrl.replace(/\/$/, '')}/${path}`
  const headers = {'content-type': 'application/json', accept: 'application/json',
    Authorization: env.FLAPI_TOKEN || '', Username: env.FLAPI_USERNAME || ''}
  let response = await fetchImpl(url, {method: 'POST', headers, body: '{}'})
  if ([404, 405].includes(response.status)) response = await fetchImpl(url, {headers})
  return json(response)
}

export const marketplaceAssets = async ({fetchImpl = fetch, env = process.env} = {}) => {
  const flapiBase = env.FLAPI_BASE_URL || 'http://localhost:6001'
  const tools = await Promise.all(packages.map(async ([packageId, id, display_name, description]) => {
    const [quick, metadata] = await Promise.all([
      flapiJson(fetchImpl, flapiBase, `package/v1/quick/${packageId}`, env),
      flapiJson(fetchImpl, flapiBase, `package/v2/${packageId}`, env)
    ])
    const input_schema = [...new Map(Object.values(quick).flat().map(param => [param.Name, param])).values()]
    return {kind: 'tool', payload: {id, display_name, description, tool_type: 'flow_package', package_id: packageId,
      input_schema, output_cubes: metadata.Queries || []}}
  }))
  const skill_md = await readFile(new URL('../marketplace/northstar-travel-support/SKILL.md', import.meta.url), 'utf8')
  const skill = {kind: 'skill', payload: {id: 'northstar-travel-support', display_name: 'Northstar travel support',
    description: "Ground Northstar Loom's Tel Aviv travel support in email, itinerary, Instagram, and places evidence.",
    tags: [{tag_type: 'scenario', tag_name: 'traveling-test'}], skill_md}}
  const agent = {kind: 'agent', payload: {id: 'northstar-travel-agent', display_name: 'Northstar travel agent',
    description: 'Supports the Northstar Loom delegation during its Tel Aviv business trip.',
    tags: [{tag_type: 'scenario', tag_name: 'traveling-test'}], config: {
      system_prompt: 'Support Northstar Loom travelers with evidence. Load the travel skill, use focused source queries, and never guess.',
      backend_config: {harness_type: 'deepagents'}, plugins: [], skills: ['northstar-travel-support'],
      tools: packages.map(([, id]) => id), sub_agents: [], knowledge_bases: []}}}
  return [...tools, skill, agent]
}

export const seedMarketplaceAssets = async ({fetchImpl = fetch, env = process.env} = {}) => {
  const baseUrl = (env.MARKETPLACE_API_URL || 'http://localhost:7777').replace(/\/$/, '')
  const headers = {'content-type': 'application/json', 'x-wonder-room': env.MARKETPLACE_SEED_ROOM || 'marketplace'}
  const result = {created: [], existing: []}
  for (const asset of await marketplaceAssets({fetchImpl, env})) {
    const plural = asset.kind == 'skill' ? 'skills' : `${asset.kind}s`, url = `${baseUrl}/api/v1/${plural}`
    const existing = await fetchImpl(`${url}/${encodeURIComponent(asset.payload.id)}`, {headers})
    if (existing.ok) result.existing.push(asset.payload.id)
    else {
      if (existing.status != 404) await json(existing)
      await json(await fetchImpl(`${url}/`, {method: 'POST', headers, body: JSON.stringify(asset.payload)}))
      result.created.push(asset.payload.id)
    }
  }
  return result
}

if (process.argv[1] && fileURLToPath(import.meta.url) == process.argv[1])
  console.log(JSON.stringify(await seedMarketplaceAssets()))
