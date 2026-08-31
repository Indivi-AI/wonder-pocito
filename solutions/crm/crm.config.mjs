// Single source of truth for the CRM room id. Everything derives from this:
//   - browser comps (crm.js, product-map.js): get it from the room-applet spec's roomUrl (uploadRoomApplet sets it from CRM_ROOM)
//   - cron (heyreach-cron.js): passes it to the Cloud Run job as the CRM_ROOM env var
//   - node scripts (heyreach-sync, docs-sync, crm-mcp): process.env.CRM_ROOM, falling back to this when run from the repo
export const CRM_ROOM = 'r49btbgtzw' // A Team room (room://r49btbgtzw, public bucket)
