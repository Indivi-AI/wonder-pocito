import { readFileSync } from 'node:fs'
import { MockPackage, buildMetadata, quickParamsQuery } from '../package-base.js'

type Row = Record<string, unknown>
type Params = Record<string, unknown>
const readDataset = (name: string) => JSON.parse(readFileSync(new URL(`../../../traveling-test/datasets/${name}`, import.meta.url), 'utf8')) as Row[]
const toTableRows = (rows: Row[]) => rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
  Array.isArray(value) ? value.join(' | ') : value && typeof value === 'object' ? JSON.stringify(value) : value])))
const normalizedText = (value: unknown) => String(value ?? '').trim().toLowerCase()
const filterByText = (rows: Row[], query: unknown) => {
  const needle = normalizedText(query)
  return needle ? rows.filter(row => normalizedText(JSON.stringify(row)).includes(needle)) : rows
}
const filterByDate = (rows: Row[], params: Params, field: string) => rows.filter(row =>
  (!params.dateFrom || String(row[field]) >= String(params.dateFrom)) && (!params.dateTo || String(row[field]) <= String(params.dateTo)))
const takeRows = (rows: Row[], value: unknown) => rows.slice(0, value === undefined ? 1000 : Math.max(0, Number(value)))
const isTrue = (value: unknown) => value === true || value === 'true'
const emails = readDataset('emails.json'), posts = readDataset('instagram.json')
const places = readDataset('google-places.json'), events = readDataset('itinerary.json')
const emailRows = toTableRows(emails), postRows = toTableRows(posts), placeRows = toTableRows(places), eventRows = toTableRows(events)
const attachmentRows = emails.flatMap(email => (email.attachments as string[]).map(filename => ({ email_id: email.id, filename })))
const commentRows = posts.flatMap(post => (post.comments as string[]).map((comment, index) => ({ post_id: post.id, index: index + 1, comment })))
const attendanceRows = events.flatMap(event => (event.attendees as string[]).map(person => ({ event_id: event.id, person })))
const flowPackage = (id: number, name: string, description: string, cubes: Record<string, Row[]>, params: Parameters<typeof quickParamsQuery>[1],
  getResults: (params: Params) => Record<string, unknown>) => new MockPackage({
    metadata: buildMetadata(id, name, cubes, { description }),
    quickParams: quickParamsQuery(`northstar-travel-${id}`, params),
    getResults
  })
const commonParams = [
  { name: 'query', description: 'Case-insensitive full-row text search.' },
  { name: 'dateFrom', type: 'DateTime' as const, description: 'Inclusive ISO date-time lower bound.' },
  { name: 'dateTo', type: 'DateTime' as const, description: 'Inclusive ISO date-time upper bound.' },
  { name: 'limit', type: 'Int' as const, defaultValues: [1000], description: 'Maximum rows returned.' }
]

export const emailPackage = flowPackage(101, 'Northstar Loom Company Email',
  'Offline company mailbox with trip-planning threads and ordinary business traffic.', { Emails: emailRows, Attachments: attachmentRows }, [
    ...commonParams,
    { name: 'participant', description: 'Sender, recipient, or copied participant.' },
    { name: 'threadId', description: 'Exact thread identifier.' }
  ], params => {
    const selected = takeRows(filterByDate(filterByText(emailRows, params.query), params, 'sent_at').filter(row =>
      (!params.participant || normalizedText(JSON.stringify(row)).includes(normalizedText(params.participant))) &&
      (!params.threadId || row.thread_id === params.threadId)), params.limit)
    const selectedIds = new Set(selected.map(({ id }) => id))
    return { Emails: selected, Attachments: attachmentRows.filter(({ email_id }) => selectedIds.has(email_id)) }
  })

export const instagramPackage = flowPackage(102, 'Northstar Loom Employee Instagram',
  'Offline export of ten geotagged employee posts, media descriptions, and comments.', { Posts: postRows, Comments: commentRows }, [
    ...commonParams,
    { name: 'author', description: 'Author name or username.' },
    { name: 'location', description: 'Location-name substring.' }
  ], params => {
    const selected = takeRows(filterByDate(filterByText(postRows, params.query), params, 'created_at').filter(row =>
      (!params.author || normalizedText(`${row.author_name} ${row.author_username}`).includes(normalizedText(params.author))) &&
      (!params.location || normalizedText(row.location_name).includes(normalizedText(params.location)))), params.limit)
    const selectedIds = new Set(selected.map(({ id }) => id))
    return { Posts: selected, Comments: commentRows.filter(({ post_id }) => selectedIds.has(post_id)) }
  })

export const placesPackage = flowPackage(103, 'Tel Aviv Offline Places',
  'Air-gapped Google-Places-shaped snapshot containing curated trip venues and public map distractors.', { Places: placeRows }, [
    { name: 'query', description: 'Case-insensitive name, address, type, or summary search.' },
    { name: 'primaryType', description: 'Exact primary place type.' },
    { name: 'vegetarianOnly', type: 'Boolean', defaultValues: [false], description: 'Return places serving vegetarian food.' },
    { name: 'veganOnly', type: 'Boolean', defaultValues: [false], description: 'Return places serving vegan food.' },
    { name: 'minRating', type: 'Double', defaultValues: [0], description: 'Minimum offline fixture rating.' },
    { name: 'limit', type: 'Int', defaultValues: [1000], description: 'Maximum rows returned.' }
  ], params => ({ Places: takeRows(filterByText(placeRows, params.query).filter(row =>
    (!params.primaryType || row.primary_type === params.primaryType) &&
    (!isTrue(params.vegetarianOnly) || row.serves_vegetarian_food) && (!isTrue(params.veganOnly) || row.serves_vegan_food) &&
    Number(row.rating) >= Number(params.minRating || 0)), params.limit) }))

export const itineraryPackage = flowPackage(104, 'Northstar Loom Tel Aviv Itinerary',
  'Offline meeting schedule with locations, room details, attendees, and subjects.', { Events: eventRows, Attendance: attendanceRows }, [
    ...commonParams,
    { name: 'attendee', description: 'Employee or external attendee name.' },
    { name: 'location', description: 'Location-name or area-detail substring.' }
  ], params => {
    const selected = takeRows(filterByDate(filterByText(eventRows, params.query), params, 'starts_at').filter(row =>
      (!params.attendee || normalizedText(row.attendees).includes(normalizedText(params.attendee))) &&
      (!params.location || normalizedText(`${row.location_name} ${row.area_detail}`).includes(normalizedText(params.location)))), params.limit)
    const selectedIds = new Set(selected.map(({ id }) => id))
    return { Events: selected, Attendance: attendanceRows.filter(({ event_id }) => selectedIds.has(event_id)) }
  })

export const travelingPackages = [emailPackage, instagramPackage, placesPackage, itineraryPackage]
