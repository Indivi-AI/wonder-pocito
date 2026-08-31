# Wonder CRM — context

ReactComp CRM for Indivi co-founders, backed by GCS, with LinkedIn (HeyReach), Fathom and WhatsApp sync.

## How it loads
The stable link **https://staging.indivi.ai/room/<CRM_ROOM>/applet/crm** serves the room-applet shell (inline HTML, no redirect). The shell:
1. reads `<CRM_ROOM>/applets/crm.json` (`appletV` + `entryCompFullId`), imports the bundled closure, and passes `roomUrl: room://<CRM_ROOM>` in ctx — so the room is NEVER hardcoded in crm.js (`getRoom` reads `ctx.vars.roomUrl`).
2. gates with `ensureLogin` (oauth2.js): unauthenticated → Google `LoginScreen`; authenticated → mounts `crm`.
`?cmpId=productMap` switches to the product-map comp (both register via crm-applet.js).

## Deploy — one MCP call
Local server running (`npm run local`). Publish with `uploadRoomApplet`:
```
uploadRoomApplet({ roomId: <CRM_ROOM>, entryPath: '@solution/crm/crm-applet.js', entryCompFullId: 'react-comp<react>crm' })
```
Bundles the closure, writes `<CRM_ROOM>/applets/crm.json`, returns `entryUrl`. The link is **stable by construction** (the def is repointed to the new `appletV` each publish) — no shortener. Old bookmark `share.indivi.ai/s/crm` is repointed to it.

## Verify — one MCP call
`playwrightHarvest` loads the live applet headless and harvests jb6 loggers + browser errors:
```
playwrightHarvest({ url: 'https://staging.indivi.ai/room/<CRM_ROOM>/applet/crm?logger=dbLogger', timeout: 15000 })
```
- The applet's `ensureLogin` gates on the Google **access_token**. `seedLocalStorage: 'mintWonderAuth2'` plants only an **id_token** (enough for room lambdas, NOT for this gate) → still shows `LoginScreen`. So the harvest confirms the shell + oauth2 chain LOAD (no errors, dbErrors empty), not the grid. To see the grid headless, bypass the gate with `&noAuth` (public bucket GET works anonymously); a real logged-in admin sees it directly.
- Healthy `noAuth` run: `dbLog` shows a 200 GET on `room://<CRM_ROOM>/contacts.json`; `domSelector: 'h1'` returns `Wonder CRM N/N`.
- ⚠️ **A `noAuth` load is not read-only any more.** The WhatsApp sync persists on mount, and the room accepts anonymous PUT (the unguessable prefix is the only gate), so harvesting the real applet URL *will* write to `contacts.json` if the group holds unapplied events. Add `&ctx-dbUrl=…` to point at a throwaway room whenever you don't intend that.

## Files
- `crm-applet.js` — applet entry; imports `crm.js` + `product-map.js` so both comps register (navTo between them works). Deploy target.
- `crm.js` — the ReactComp (`react-comp<react>crm`). Loaded as `@solution/crm/crm.js`.
- `product-map.js` — the `productMap` ReactComp; navigated to from CRM via `?cmpId=productMap`.
- `whatsapp-sync.js` — parses the lead-tracking WhatsApp group into CRM activity and renders the activity widget. Imported by `crm.js`; no cron, it runs in the browser on every CRM load. See **WhatsApp lead sync** below.
- `heyreach-sync.mjs` — pulls HeyReach LinkedIn conversations *started by us* into contacts. Run: `node solutions/crm/heyreach-sync.mjs`.
- `fathom-sync.mjs` — pulls Fathom meetings, matches *external* invitees to contacts by fuzzy name or company-domain token, upserts `c.meetings`; unmatched → `fathom-unmatched.json` (CRM banner). Run: `node solutions/crm/fathom-sync.mjs`.
- `docs-sync.mjs` — **superseded by `fathom-sync.mjs`**, not in the cron. Linked Drive CRM-folder meeting docs to contacts (`docUrl`); unmatched → `doc-mismatches.json`. Needs Drive API + the CRM folder shared with the job SA.
- `heyreach-cron.js` — 🛑 **PAUSED — DO NOT REACTIVATE, UNDER ANY CIRCUMSTANCE.** `gcloudCronEtl` that *used to* run `heyreach-sync.mjs` then `fathom-sync.mjs` every 15 min as a Cloud Run Job. `etl-crm-heyreach-sync-sched` (me-west1) is PAUSED and the job last ran **2026-07-01**; it was paused for security. Do not resume, redeploy, un-pause, or run `deployHeyreachSyncCron` — not to "test", not to backfill, not as a side effect of another task. Run the `.mjs` scripts by hand if a sync is genuinely needed.

## Data (admin-only, real data — never overwrite for tests)
Lives in the A-Team room — public bucket `indiviai-wonder`, prefix `<CRM_ROOM>/` (the room id is in `crm.config.mjs`; it's the capability secret, so it's never hardcoded in app/cron code, only derived from there). The unguessable prefix is the access control.
- Contacts: `room://<CRM_ROOM>/contacts` → `indiviai-wonder/<CRM_ROOM>/contacts.json`. Also `doc-mismatches.json`, `products.json` (product map).
- `fathom-unmatched.json` / `fathom-ignored.json` — meetings not yet linked to a contact, and the ones dismissed.
- `wa-ignored.json` — normalised LinkedIn urls from the WhatsApp group that are deliberately not CRM leads (written by the banner's Ignore button). Absent until the first Ignore; the 404 on load is expected and swallowed.
- `contacts-backup-pre-wa-sync.json` — snapshot of contacts taken just before the WhatsApp sync first ran (2026-08-24), kept as a restore point.
- API keys: `<CRM_ROOM>/heyreach-api-key.json`, `<CRM_ROOM>/fathom-api-key.json`.
- Access: comp gates via Google login (oauth2.js `handleAuth`/`LoginScreen`);
- Schema = the CRM csv columns (Main Contact, Company, Position, Funnel, Chance 1-10, next action, date next action, summary, Product, Alive/Dead, sender) + added: `id`, `linkedin`, `msgs`, `activity`. CSV is the source of truth; add columns, don't delete.
- `activity: [{waId, ts, kind, by}]` — one entry per WhatsApp event applied to that contact. `kind` is `request|message|meeting`, `by` is the CRM sender label. **This array is the sync's dedupe state** — an event whose `waId` is already present is never re-applied. Derived, never hand-edited (it is in `derivedFields`, so the edit page won't render it).

## WhatsApp lead sync (`whatsapp-sync.js`)
The co-founders log every outreach action in a WhatsApp group, mirrored into its own room by the Wonder bot. `crm.js` reads it on every load (`enrichCtx`) and applies it in the browser — there is no cron.

**The group's room id IS hardcoded** (`WA_ROOM` in `whatsapp-sync.js`), which is a deliberate exception to the "never hardcode a room" rule above. `<CRM_ROOM>` is a capability secret because contacts are private; the group only ever carries a public LinkedIn url plus a one-letter code, so it is not. Don't "fix" this by routing it through `crm.config.mjs`.

Message shape — `<linkedin url>\n<code>[\n\nfree text]`, where the code is `R` (friend request), `M` (message) or `Meeting`. Anything else in the group is ignored, as is any sender not in `senderByWaName`.

Per event, matched to a contact by normalised LinkedIn url:
- **Funnel advances, never downgrades** — `R→0-Attempted to contact`, `M→1-Contacted`, `Meeting→2-Discovery`, applied only if it is further along `funnelColors`' key order than the current value. A 4-Negotiation lead getting an `M` stays at 4.
- Free text after the code is appended to `notes`.
- The event is recorded in `activity` (see schema above).

Urls with no matching contact surface in a green banner with **Create / Link / Ignore**. Create prefills a new contact from the url slug; Link just sets `linkedin` on an existing one.

**The sync is re-derived on every render, not run once.** `applyWaEvents` is pure and cheap, and a mount effect persists whenever it reports fresh events. That is what makes Create/Link work: the moment a contact has the url, its older events land on the next pass and it drops out of the banner by itself. Do **not** replace the per-contact `waId` dedupe with a global "parsed up to" cursor — a lead you create today would silently skip last week's events.

The activity widget (collapsible, above the table) charts the parsed events — not `activity` — so outreach to people who aren't CRM leads still counts. 3 panels (requests / messages / meetings) × 2 senders, 7/14/30 days, bucketed in one O(events) pass.

Since the HeyReach cron is paused (see Files), **this is currently the only sync actually feeding the CRM** — LinkedIn conversations and Fathom meetings have not been pulled since 2026-07-01.

⚠️ Dormant-but-real conflict: `heyreach-sync.mjs`'s connection-watch branch assigns `Funnel = '0-Attempted to contact'` unconditionally, so it can *downgrade* a contact this sync advanced (only while `next action` is still `connect on linkedin` / `awaiting acceptance`). Harmless while the cron stays paused — but it would bite on any manual run of that script.

## Testing the UI without touching real data
Point the comp at a throwaway room instead of the real one via `&ctx-dbUrl=room://wonderCrmDemo/contacts` (crm.js reads `ctx.vars.dbUrl`, else `${room}/contacts`). Verify with the `playwrightHarvest` recipe above (add `&ctx-dbUrl=…` to the url).

`room://waSyncTest0823/contacts` is a throwaway seeded with a 19-contact subset of the real CRM, kept for exercising the WhatsApp sync end to end:
```
localhost:3000/room/<CRM_ROOM>/applet/crm?noAuth&ctx-dbUrl=room://waSyncTest0823/contacts
```
Reseed it from a fresh copy of `contacts.json` before each run — after one load the events are already applied, so a second run only proves idempotency (which is also worth checking: reload and confirm `activity` and `notes` counts don't grow).

Note `wa-ignored` still resolves against the **applet's own room**, not `ctx-dbUrl` — clicking Ignore during a test writes to the real room.

## Notes
- A true `crm.indivi.ai` subdomain is possible (wildcard `*.indivi.ai` cert; setup-url-shortner-domain.sh) but needs DNS+LB changes — requires explicit approval.
