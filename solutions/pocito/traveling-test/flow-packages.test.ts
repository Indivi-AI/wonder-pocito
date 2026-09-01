import assert from 'node:assert/strict'
import test from 'node:test'
import { getPackageFullMetadata, getRunResults, searchPackages } from '../flapi-mock/packages/index.js'

type Row = Record<string, unknown>
const runPackage = (id: number, params: Record<string, unknown> = {}) => {
  const result = getRunResults(String(id), { input: params })
  assert(result && !('error' in result))
  return result.results as Record<string, Row[]>
}

test('travel packages are registered with tabular metadata', () => {
  assert.deepEqual(searchPackages('Northstar Loom').map(({ Id }) => Id), [101, 102, 104])
  assert.equal(searchPackages('Tel Aviv Offline Places')[0].Id, 103)
  for (const id of [101, 102, 103, 104]) assert(getPackageFullMetadata(String(id))?.Queries.length)
})

test('email package exposes 100 messages, 28 threads, attachments, and search', () => {
  const { Emails, Attachments } = runPackage(101)
  assert.equal(Emails.length, 100)
  assert.equal(new Set(Emails.map(({ thread_id }) => thread_id)).size, 28)
  assert(Attachments.length >= 15)
  for (const clue of ['VGML', 'chicken stock', 'dairy and eggs', 'smoked aubergine', 'Opa']) {
    assert(runPackage(101, { query: clue }).Emails.length, `missing email clue: ${clue}`)
  }
  assert(runPackage(101, { participant: 'tom.becker@northstarloom.example' }).Emails.length >= 5)
})

test('Instagram package exposes ten posts and the last-seen phone evidence', () => {
  const { Posts } = runPackage(102)
  assert.equal(Posts.length, 10)
  const clue = runPackage(102, { query: 'yellow phone with its white star' }).Posts
  assert.equal(clue.length, 1)
  assert.equal(clue[0].id, 'post-008')
  assert.equal(clue[0].location_name, 'The Norman Library Bar')
})

test('places package is large, offline, and applies dietary filters', () => {
  const { Places } = runPackage(103, { limit: 2000 })
  assert.equal(Places.length, 1200)
  assert(Places.filter(({ source }) => String(source).startsWith('OpenStreetMap')).length >= 1000)
  const opa = runPackage(103, { query: 'Opa', vegetarianOnly: true, veganOnly: true }).Places
  assert.equal(opa.length, 1)
  assert.equal(opa[0].formatted_address, '8 Ha-Halutzim Street, Tel Aviv-Yafo')
})

test('itinerary and Instagram evidence resolve John phone location', () => {
  const debrief = runPackage(104, { attendee: 'John Okafor', query: 'blue pilot folder' }).Events
  const post = runPackage(102, { query: 'white star' }).Posts
  assert.equal(debrief.length, 1)
  assert.equal(post.length, 1)
  assert.equal(debrief[0].location_name, post[0].location_name)
  assert.match(String(debrief[0].area_detail), /window-side green banquette/i)
})
