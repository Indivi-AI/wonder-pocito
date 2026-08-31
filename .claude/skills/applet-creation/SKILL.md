---
name: applet-creation
description: Build, verify and publish a Wonder ReactComp/applet with GCS-backed data. Use when asked to create an applet, a reactComp, a small app/tool on Wonder infra, or to publish/share one.
---

# Applet / ReactComp Creation on Wonder Infra

## 0. Session setup (do first, in parallel)
- Start the local server in background: `npm run local` (serves http://localhost:3000 + the MCP endpoint). It takes ~1 min to boot.
- If GCS writes from node may be needed, check `gcloud auth list`. On `invalid_grant`/`invalid_rapt` use the **gcs-auth** skill; `gcloud auth application-default login` can be run by the agent in background — the user approves in the browser.

## 1. Code: ReactComp pattern
Reference impls: `solutions/crm/crm-applet.js` (applet), `solutions/crm/crm.js` (CRUD app), use cases in `jb6/@jb6/react/tests/react-tests.js`, dsl in `jb6/@jb6/react/react-utils.js`.

```js
import { dsls } from '@jb6/core'
import '@jb6/react'
const { react: { ReactComp, 'react-comp': { comp } } } = dsls

const GCS = (roomId, key) => `https://storage.googleapis.com/indiviai-wonder/${roomId}/${key}.json`

ReactComp('myComp', {
  impl: comp({
    // hFunc: (ctx, ctxVars, compParams) => (reactProps) => vdom
    hFunc: (ctx, {roomId, initialData, react: {h, useState}}) => () => {
      const [data, setData] = useState(initialData)
      // persist user changes — direct anonymous PUT to the public bucket (works from the browser):
      const save = next => fetch(GCS(roomId, 'myFile'), { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ content: next }) }).catch(()=>{})
      return h('div:p-6 font-sans', {}, ...)   // 'tag:tailwind classes' shorthand
    },
    // async load before first render; the comp shows a spinner meanwhile
    enrichCtx: async ctx => {
      // default roomId so the comp works BOTH embedded (roomUrl set) and standalone in react-comp-view
      const roomId = ctx.vars.roomUrl?.match(/^room:\/\/([^/]+)/)?.[1] || 'myRoom'
      const r = await fetch(`${GCS(roomId,'myFile')}?t=${Date.now()}`).catch(()=>null)
      const j = r?.ok ? await r.json() : null
      return ctx.setVars({ roomId, initialData: j?.content ?? [] })   // unwrap {content:...}
    }
  })
})
```
**Browser data IO — prefer direct GCS HTTP over `wfetch2('room://...')`.** `wfetch2` room:// is great from node, but in the browser (react-comp-view AND published staging) its GET can silently return nothing (driver/fs fallback), so the comp renders empty. A plain `fetch('https://storage.googleapis.com/indiviai-wonder/<roomId>/<key>.json')` GET — and anonymous **PUT** (incl. binary like images) — works reliably everywhere (localhost, staging, iPhone), no auth/lambda. Store as `{content: <body>}` and unwrap `j.content ?? j` on read. Bust cache with `?t=${Date.now()}`.
Conventions: functional style, minimal lines, ESM only. `h('L:icon-name')` for lucide icons. Room applets (chat-embedded) add `metadata: [applet({title, icon}), importUrl(...)]` and lived in Genie’s `public/applets2/`, which did NOT migrate — pick a home under `solutions/` and update this line.
**Location matters**: comps that will be *published/shared* must live under `admin/` (loaded as `@wonder/...`); `public/` comps (`@wonder/...`) are local-dev only for sharing purposes.

## 2. Data in GCS (wfetch2)
Full model: `wonder/db/db-drivers.js` (doclet at top).
- URL: `scope:db//path` — force GCS with `room:gcs//roomId/fileName` (else localhost defaults to fs). Extension defaults to `.json`.
- `room://` → bucket `indiviai-wonder` at `roomId/fileName.json`, stored as `{content: <body>}`. Public bucket: anonymous HTTP GET **and PUT** work — browser talks to GCS directly, no auth/lambda.
- Methods: GET / PUT (whole doc) / POST=append-to-array / PATCH=merge-object (append goes via wonder service or generation-check).
- Driver is auto-selected by capability bag (host/db/devMachine/gcpIdentity...). Node SDK paths need ADC; browser paths don't.
- Other scopes: `signedRoom://` (protected, signed URLs), `userGlobal://`, `logs:`, `wonderFrontend://` (CDN).
- Quick seed/inspect without infra: `curl -X PUT -H "Content-Type: application/json" -d '{"content":[...]}' "https://storage.googleapis.com/indiviai-wonder/<roomId>/<file>.json"` (and plain GET with `?t=<now>` to bust cache).
- **Separate import-generated data from user-mutated data into different files** (e.g. `catalog.json` written by a scraper/cron, `read.json` written only by the app). Then background refreshes never clobber live user state, and vice-versa. Every writer should read-modify-write (preserve unknown fields), never blind-overwrite. Once a user relies on a file, treat it as sacred — don't reset it even in testing; keep a `backups/<file>-<date>.json`.
- **Whole-doc PUT is last-write-wins.** For data multiple devices/users edit concurrently, split per-writer (e.g. `read-wife.json` / `read-husband.json`) so they can't clobber each other.
- **External data the applet pulls live:** the browser can't read cross-origin without CORS (need a proxy), and some sites also **403 datacenter/cloud IPs** — so a cloud function/proxy can't reach them at all; only a residential-IP machine can. When that's the case, a scheduled fetch must run locally (e.g. a Mac `launchd` job writing to GCS), not in the cloud. Rehost any needed third-party assets to your own bucket rather than hotlinking.

## 3. Verify locally (always)
- View: `http://localhost:3000/jb6_packages/react/react-comp-view.html?cmpId=<id>&urlsToLoad=@wonder/<path>.js`
- Screenshot: `node take-screenshot.js "<url>"` → writes `/tmp/screenshot-desktop.png` + `-mobile.png`; Read both. Mobile must have NO horizontal overflow.
- take-screenshot.js does NOT capture console; for JS errors use a one-off playwright script (see /tmp pattern: page.on('console'/'requestfailed'/'response>=400')).
- Logic/data debugging: use the localhost MCP (`curl -s -X POST http://localhost:3000/mcp ...`) with `runTgpSnippet`/`runTest` + `logger: 'dbLogger'` — prefer this over ad-hoc node scripts.
- **Verify images on a mobile UA, not just desktop.** Third-party image URLs often pass a desktop Playwright fetch but break in real iOS Safari (cross-site image / hotlink / `Sec-Fetch` gate) → broken covers on the user's phone. Fix by rehosting to your GCS bucket. In a verify script, set an iPhone UA + cross-origin `Referer`, and scroll the page to trigger `loading="lazy"` images before counting `img.naturalWidth>0`.

## 4. Publish / share
Use the `uploadRoomApplet` MCP tool (server must be running); `name`/`cmpId` are derived from the comp:
```
curl -s -X POST http://localhost:3000/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"uploadRoomApplet","arguments":{"roomId":"<id>","entryPath":"@wonder/<path>.js","entryCompFullId":"react-comp<react>myApplet"}}}'
```
- Only bundles `@wonder/*` files (error `no admin files` otherwise — move the comp under `admin/`).
- Uploads a code snapshot to the `wonder-frontend-me-west1` CDN bucket; needs valid ADC (else `invalid_rapt` → gcs-auth skill).
- Writes `<roomId>/applets/<cmpId>.json = {cmpId, urlsToLoad, appletV, entryCompFullId}`; returns `{appletV, cmpId, fileCount, entryUrl}`. `entryUrl` = `https://staging.indivi.ai/room/<roomId>/applet/<cmpId>` (same URL for public & signed rooms).
- **`roomId` targets a specific room** (`room://<id>` public, `signedRoom://<id>` protected). For a per-app dataset, always scope it to its own room rather than sharing one.
- Each upload mints a NEW `appletV` snapshot; the `entryUrl` stays stable (the def points at the newest `appletV`). App *data* lives in GCS and is independent of the snapshot, so **publishing a code update never affects user data**.
- ALWAYS verify the entryUrl yourself: `playwrightHarvest` it (404s on `@jb6/*` mean snapshot/import-map mismatch) OR screenshot it. For a signed room, seed auth via `seedLocalStorage: 'mintWonderAuth2'`.

### 4a. Publish gotchas (hard-won — read before debugging a broken applet)
- **BLANK SCREEN → check for a 404 on `shared/<appletV>/wonder/db/oauth2.js`.** The applet shell (`serveAppletShell`, `cloud-services/express-server/lib/room-lambda-and-applet.js`) itself `import`s `@wonder/db/oauth2.js` for the login gate, and maps `@wonder/` → `shared/<appletV>/wonder/`. So the share MUST contain the `@wonder` tree — but the share is built from **the comp's own import closure**. A minimal comp importing only `@jb6/core` + `@jb6/react` bundles NO `wonder/` dir → the shell's oauth2 import 404s → the shell module aborts **before** it renders anything (no pageError, just the 404) → blank. **Fix: pull `@wonder` into the closure** — add `import '@wonder/db/oauth2.js'` (or `import '@wonder/ui/applet.js'` + applet metadata, like `hebrewEditor.js`). A correct bundle reports ~30 files (`fileCount`), not a handful.
- **MCP `uploadRoomApplet` returns `{"error":"SyntaxError: Unexpected end of JSON input ... jb-cli.js"}`** = the jb-cli child produced empty stdout, almost always **stale ADC**. Refresh (`gcloud auth application-default login`), or run the tool via a **direct-node child** which surfaces the real error and is more reliable than the MCP wrapper: import `@jb6/mcp/mcp-jb-tools.js` + `@wonder/studio/mcp-tools/wonder-mcp-tools.js`, then `runMcpTool('uploadRoomApplet', args, dsls.mcp.tool['uploadRoomApplet'][coreUtils.asJbComp])` under `node --experimental-vm-modules --import ./nodejs-importmap.js`.
- **The login gate cannot be passed by seeding `mintWonderAuth2`.** It mints only `{auth2:{id_token, expiresAt}}` — no `access_token` — but the shell's `getAuthState` requires `auth2.access_token` (non-expired), so the "Sign in with Google" wall persists and `window.jbLoggers` never appears (harvest times out). Don't fabricate a real Google token. Instead verify everything *up to* the gate and hand the final mount to the logged-in user:
  1. served shell has **zero 4xx + zero pageErrors** and every `shared/<appletV>/…` asset returns 200 (curl them);
  2. the comp renders in the local **wComp shell** (`http://localhost:3000/room/<roomId>/applet/<cmpId>`) or react-comp-view;
  3. ask the (already signed-in) user to **hard-reload** the staging entryUrl.
- **Don't trust a bare screenshot / `take-screenshot.js` of the entryUrl** — the shell cold-loads the whole jb6 closure from the CDN (~5-10s) behind a `Loading...` div, so an early grab shows a false blank. Screenshot only after `page.waitForFunction(() => !document.getElementById('loading'))` (or your comp's root selector).
- **`appletV` is the bare share id** (e.g. `07-12-bxse`), used as `shared/<appletV>/…`. If a def ever carries `adHocV` (the `<ver>;<shareId>` form) instead, the route reads `appletV` as `undefined`, the import map drops `@wonder/` entirely, and the comp can't load → blank. The current tool writes `appletV` correctly; only patch the def by hand if you see the wrong key.
