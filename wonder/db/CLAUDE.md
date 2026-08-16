# Rooms

## What is a room

A room is a **cloud directory** (a tree in cloud storage) that bundles everything a small team needs to collaborate:

- **users + protections** — membership and an ACL (`room://` = public, no enforcement; `signedRoom://` = same layout with enforced teeth).
- **files** — read/written via `wfetch2` / the db drivers, scoped by the protection dirs.
- **lambdas** — server-side code the room can run, gated as the user.
- **applets** — UI (react-comps) the room can serve, room-gated.
- **assets** — versioned, collaboratable artifacts tracked in `assets.json`.
- **cron etls** — scheduled jobs that read/write the room's files on a timer.

## Public rooms vs signed rooms
Two URL schemes for the **same** room layout — they differ only in storage bucket and whether the protection dirs have teeth
Three protected dir conventions:
- `admin/` — only admins read/write.
- `usersRO/` — admins write *for* users; users read-only.
- `usersRW/` — users read/write.

## Room lambdas - invokeSnippetInContext

Run a tgp snippet **on the remote, gated AS THE USER, within tgp context**, via the `wFetch` comp:
`{$:'data<common>wFetch', url:'<roomUrl>/lambda/<name>', method:'post', body:{profile, packedCtx, stream, serverTimeout, logger}}`

## Signed rooms via MCP
Signed-room MCP work requires a logged-in developer; outside the sandbox run `gcloud auth list --filter=status:ACTIVE "--format=value(account)"`.
If no account is returned, ask the developer to run `gcloud auth login`; never continue signed-room work anonymously.
That email must be listed in the room's `admin/users.json` with permission for the requested directory (`usersRO`, `usersRW`, or `admin`).
For `playwrightHarvest`, pass `seedLocalStorage: 'mintWonderAuth2'`; manual applet use signs in through the Google login screen.

## Room applets

The ui/browser twin of a lambda: a published react-comp, room-gated, served at the pretty `/room/:roomId/applet/:name` URL. Publish with `uploadRoomApplet` first — it produces the `appletV` the host page needs to point its importmap at the frozen jb6+wonder source.

The renderer is the **applet host page** `serveAppletPage`/`APPLET_HOST_HTML` in `cloud-services/express-server/lib/room-lambda-and-applet.js` — served INLINE (no 302), a PUBLIC page that only emits the importmap + the `appletSpec` ({cmpId, urlsToLoad, roomUrl, appletV}); it reads no room data, so the teeth stay downstream in the `signedRoom://` per-file reads. Same `/room/:roomId/applet/:name` URL serves both public and signed rooms — the room's scheme (has `admin/users.json` ⇒ `signedRoom`) is picked server-side, not by the caller's identity.

Server story (refs): the applet host page is served by `setupRoomLambdaAndApplet` in `room-lambda-and-applet.js` (`GET /room/:roomId/applet/:name`, alongside `POST /run-room-lambda` + `/admin-run-snippet`); registered in `local-server.js` (dev) and `core-server.js`/`automations-server/server.js` (prod/staging). `APPLET_HOST_HTML` runs `extendCtxWithUrl` then seeds `roomUrl` from the `appletSpec`; the bare dev harness `react-comp-view.html` instead needs `ctx-roomUrl` (`extendCtxWithUrl` in `@jb6/react/react-utils.js`).

## Room assets

An **assetsRepo** is a sub-directory of a room with an `assets.json` manifest that makes artifacts versioned and collaboratable (comments, ratings, relations).

## Useful rooms (for the LLM)

Real rooms you can read/write via the `wFetch` comp. URL = `<scheme>://<roomId>/<dir>/<file>?user=<id>`. `room://` = public bucket (`indiviai-wonder`, no teeth), `signedRoom://` = protected bucket (`indiviai-wonder-protected`, enforced). Verify contents with a trailing-slash GET `{$:'data<common>wFetch', url:'<roomUrl>/', method:'GET', logger:'dbLogger'}` + reading `assets.json`/`users` rather than trusting this list.

| roomId | scheme | purpose | example wUrl |
|---|---|---|---|
| `aTeam` | `room://` | default public room for assets (`uploadReactComp` etc.) | `room://aTeam/assets.json` |
| `demo` | `room://` | generic MCP example room id (placeholder, not a fixed room) | `room://demo/...` |
| `demoTestRoom-<sid>` | — | per-session `demoRoom`-typed rooms from the whatsapp demo bp | created by `demo-bp.js` |

Test rooms (in the db-driver test suite, `public/core/db-drivers-tests.js`):

| roomId | scheme | used by |
|---|---|---|
| `testSignedRoom` | `signedRoom://` | wcache/media/permissions over signed bucket (`usersRO/`,`usersRW/`) |
| `testPublicRoom` | `room://` | same data as testSignedRoom over the public path |
| `buyPhone` | `room:gcs`/`room:fs` | put/get/append/patch driver tests (`items`) |

## Uploading resources via MCP

| Resource | MCP tool | Writes | Run / open |
|---|---|---|---|
| room lambda | `uploadRoomLambda({ lambdaId, roomId, entryPath })` | `lambdas/<lambdaId>.json = {lambdaV, entryCompFullId, dir}` | `POST /run-room-lambda/<roomId>/<lambdaId>` |
| room applet | `uploadRoomApplet({ roomId, entryPath, entryCompFullId })` | `applets/<name>.json = {cmpId, urlsToLoad, appletV, entryCompFullId}` | `/room/<roomId>/applet/<name>` (same for public & signed) |
| admin ad-hoc | `uploadLambdaComp({ entryPath })` | tar at `lambdas/<lambdaV>.tar.gz` | `POST /admin-run-snippet/<lambdaV>` |

Applet runtime assets must use `new URL('./relative-file', import.meta.url)`. `uploadRoomApplet` recursively discovers JavaScript workers,
ES modules, WASM, and data assets, uploads them as raw bytes, and preserves their source-relative paths. Never use fake or commented imports.

## admin/users.json: 
{ admins: ['some-other@x.com'], users: [...], accessLevels: { usersRO: { user: 'r' }, admin: { admin: 'rw' } } }

## Cron (etls)

Scheduled code that runs room lambda. Built on the shared `gcloudCronEtl`. usually ETL component
