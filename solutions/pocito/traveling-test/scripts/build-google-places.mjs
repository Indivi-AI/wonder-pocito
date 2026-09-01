import { readFileSync, writeFileSync } from 'node:fs'

const [sourcePath = '/tmp/traveling-test-overpass.json', targetPath = new URL('../datasets/google-places.json', import.meta.url)] = process.argv.slice(2)
const { elements: osmElements } = JSON.parse(readFileSync(sourcePath, 'utf8'))
const capturedAt = '2026-09-01T00:00:00Z'
const shortText = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 70)
const stableHash = value => [...String(value)].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7)
const curatedSource = 'Curated benchmark record; venue details checked against official public pages'
const curatedVenueRows = [
  ['opa', 'Opa', 'restaurant', '8 Ha-Halutzim Street, Tel Aviv-Yafo', 32.0600791, 34.7732626, 4.8, 682, 4, true, true,
    'Plant-centered tasting menu using vegetables, fruit, seeds, fermentation, smoke, and low-waste techniques.',
    'https://www.opatlv.co.il/en', 'Tue 19:30; Wed 19:30; Thu 19:00'],
  ['anastasia', 'Anastasia', 'restaurant', '54 Frishman Street, Tel Aviv-Yafo', 32.08021, 34.77362, 4.6, 2491, 2, true, true,
    'Vegan cafe focused on fresh plant-based dishes, raw food, and house-made ingredients.',
    'https://www.anastasiatlv.co.il', 'Sun-Thu 09:00-23:00; Fri 09:00-16:30; Sat 10:00-16:30'],
  ['claro', 'Claro', 'restaurant', '30 David Elazar Street, Tel Aviv-Yafo', 32.0701135, 34.7859855, 4.5, 5417, 3, true, false,
    'Mediterranean farm-to-table restaurant with a seasonal menu rich in local vegetables and fruit.',
    'https://www.clarotlv.com/en', 'Sun-Thu 12:00-15:45,18:00-22:15'],
  ['the-norman', 'The Norman Tel Aviv', 'lodging', '23-25 Nachmani Street, Tel Aviv-Yafo', 32.06642, 34.77184, 4.6, 1288, 4, true, false,
    'Boutique hotel used as the Northstar Loom delegation base.', 'https://www.thenorman.com', 'Open 24 hours'],
  ['library-bar', 'The Norman Library Bar', 'bar', '23-25 Nachmani Street, Tel Aviv-Yafo', 32.06642, 34.77184, 4.5, 422, 3, true, false,
    'Ground-floor hotel bar used for coffee, light lunch, business meetings, and evening drinks.',
    'https://www.thenorman.com/restaurants-and-bar/the-library-bar/', 'Daily 10:00-00:30'],
  ['mindspace-rothschild', 'Mindspace Rothschild', 'coworking_space', '45 Rothschild Boulevard, Tel Aviv-Yafo', 32.06472, 34.77694, 4.4, 337, 2,
    false, false, 'Coworking and meeting venue on Rothschild Boulevard.', 'https://www.mindspace.me', 'Mon-Fri 09:00-18:00'],
  ['toha', 'ToHa Tower', 'point_of_interest', '114 Yigal Alon Street, Tel Aviv-Yafo', 32.07486, 34.79342, 4.5, 1157, 0, false, false,
    'Office tower and meeting location near Tel Aviv HaShalom.', 'https://toha.co.il', 'Mon-Fri 08:00-20:00'],
  ['sosa', 'SOSA', 'coworking_space', '13 Shoken Street, Tel Aviv-Yafo', 32.05382, 34.76731, 4.5, 284, 2, false, false,
    'Innovation hub and workshop venue in south Tel Aviv.', 'https://sosaisrael.com', 'Mon-Fri 09:00-18:00'],
  ['sarona', 'Sarona', 'tourist_attraction', '3 Aluf Kalman Magen Street, Tel Aviv-Yafo', 32.07278, 34.78637, 4.5, 18426, 2, true, true,
    'Restored district with offices, gardens, restaurants, and Sarona Market.', 'https://www.saronamarket.co.il', 'Daily 09:00-23:00'],
  ['hotel-montefiore', 'Hotel Montefiore', 'restaurant', '36 Montefiore Street, Tel Aviv-Yafo', 32.06549, 34.77345, 4.5, 2387, 4, true, false,
    'Boutique hotel restaurant and business-lunch venue.', 'https://www.hotelmontefiore.co.il', 'Daily 07:00-00:00'],
  ['tel-aviv-museum', 'Tel Aviv Museum of Art', 'museum', '27 Shaul HaMelech Boulevard, Tel Aviv-Yafo', 32.07742, 34.78678, 4.7, 14422, 2,
    false, false, 'Art museum and event venue in central Tel Aviv.', 'https://www.tamuseum.org.il', 'Mon-Sat; hours vary'],
  ['meshek-barzilay', 'Meshek Barzilay', 'restaurant', '6 Ahad HaAm Street, Tel Aviv-Yafo', 32.06091, 34.76612, 4.5, 3724, 2, true, true,
    'Plant-based neighborhood restaurant with vegan food and seasonal produce.', 'https://www.meshekbarzilay.co.il', 'Daily; hours vary'],
  ['bana', 'Bana', 'restaurant', '36 Nahmani Street, Tel Aviv-Yafo', 32.06474, 34.7722, 4.4, 1881, 3, true, true,
    'Vegetable-forward restaurant with seasonal sharing plates.', '', 'Evenings; hours vary'],
  ['thai-house', 'Thai House', 'restaurant', '8 Bograshov Street, Tel Aviv-Yafo', 32.07708, 34.76807, 4.5, 6621, 3, true, false,
    'Thai restaurant with spicy dishes and vegetarian options.', 'https://www.thai-house.co.il', 'Daily; hours vary'],
  ['goodness', 'Goodness', 'restaurant', '41 King George Street, Tel Aviv-Yafo', 32.07273, 34.77434, 4.4, 2155, 2, true, true,
    'Casual vegan restaurant with comfort-food plates.', '', 'Daily; hours vary']
]
const curatedPlaces = curatedVenueRows.map(([id, name, type, address, lat, lng, rating, count, price, vegetarian, vegan, summary, website, hours]) => ({
  place_id: `benchmark-${id}`,
  name,
  primary_type: type,
  types: [type, 'point_of_interest'],
  formatted_address: address,
  location_latitude: lat,
  location_longitude: lng,
  rating,
  user_rating_count: count,
  price_level: price,
  business_status: 'OPERATIONAL',
  regular_opening_hours: hours,
  serves_vegetarian_food: vegetarian,
  serves_vegan_food: vegan,
  editorial_summary: summary,
  website_uri: website,
  international_phone_number: '',
  source: curatedSource,
  source_id: `benchmark-${id}`,
  captured_at: capturedAt
}))
const curatedNames = new Set(curatedPlaces.map(({ name }) => name.toLowerCase()))
const osmPlaces = osmElements
  .filter(({ tags, lat, center }) => (tags?.name || tags?.['name:en']) && (lat || center?.lat))
  .map(element => {
    const tags = element.tags || {}, name = shortText(tags['name:en'] || tags.name), seed = stableHash(`${element.type}-${element.id}`)
    const type = tags.amenity || tags.tourism || tags.leisure || 'point_of_interest'
    const street = tags['addr:street:en'] || tags['addr:street']
    const address = shortText([tags['addr:housenumber'], street, tags['addr:city:en'] || tags['addr:city'] || 'Tel Aviv-Yafo']
      .filter(Boolean).join(' '))
    const vegetarian = ['yes', 'only'].includes(tags['diet:vegetarian']) || ['yes', 'only'].includes(tags['diet:vegan'])
    return {
      place_id: `osm-${element.type}-${element.id}`,
      name,
      primary_type: type,
      types: [type, 'point_of_interest'],
      formatted_address: address,
      location_latitude: element.lat || element.center.lat,
      location_longitude: element.lon || element.center.lon,
      rating: Number((3.7 + seed % 12 / 10).toFixed(1)),
      user_rating_count: 25 + seed % 4976,
      price_level: ['restaurant', 'cafe', 'bar', 'pub', 'fast_food'].includes(type) ? 1 + seed % 4 : 0,
      business_status: 'OPERATIONAL',
      regular_opening_hours: shortText(tags.opening_hours),
      serves_vegetarian_food: vegetarian,
      serves_vegan_food: ['yes', 'only'].includes(tags['diet:vegan']),
      editorial_summary: shortText(tags.description || `Offline map record for ${name} in Tel Aviv-Yafo.`),
      website_uri: shortText(tags.website || tags['contact:website']),
      international_phone_number: shortText(tags.phone || tags['contact:phone']),
      source: 'OpenStreetMap contributors, ODbL 1.0',
      source_id: `${element.type}/${element.id}`,
      captured_at: capturedAt
    }
  })
  .filter(({ name }, index, rows) => !curatedNames.has(name.toLowerCase()) && rows.findIndex(row => row.name === name) === index)
  .sort((a, b) => a.name.localeCompare(b.name))
  .slice(0, 1185)

writeFileSync(targetPath, `${JSON.stringify([...curatedPlaces, ...osmPlaces], null, 2)}\n`)
console.log(`Wrote ${curatedPlaces.length + osmPlaces.length} offline places to ${targetPath}`)
