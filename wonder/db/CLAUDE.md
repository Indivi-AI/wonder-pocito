# Rooms

## What is a room

A room is a **cloud directory** (a tree in cloud storage) that bundles everything a small team needs to collaborate:

- **users + permissions** — membership and an ACL (`room://` = public, `signedRoom://` = signed GCS access).
- **files** — read/written via `wfetch2` / the db drivers, scoped by the protection dirs.
- **lambdas** — server-side code the room can run, gated as the user.
- **applets** — UI (react-comps) the room can serve, room-gated.
- **assets** — versioned, collaboratable artifacts tracked in `assets.json`.
- **cron etls** — scheduled jobs that read/write the room's files on a timer.

## Room schemes

All room types use the **same directory structure**. The scheme changes storage and authorization, never the room layout:

- `room://<roomId>/...` uses the public GCS bucket.
- `signedRoom://<roomId>/...` uses private GCS objects through Wonder-issued signed URLs.

The directory conventions are identical for every room type:

- `admin/` — only admins read/write.
- `usersRO/` — admins write *for* users; users read-only.
- `usersRW/` — users read/write.

## Room lambdas - invokeSnippetInContext

Run a tgp snippet **on the remote, gated AS THE USER, within tgp context**, via the `wFetch` comp:
`{$:'data<common>wFetch', url:'<roomWUrl>/lambda/<name>', method:'post', body:{profile, packedCtx, stream, serverTimeout, logger}}`

## Signed rooms via MCP
Signed-room MCP work requires a logged-in developer; outside the sandbox run `gcloud auth list --filter=status:ACTIVE "--format=value(account)"`.
If no account is returned, ask the developer to run `gcloud auth login`; never continue signed-room work anonymously.
That email must be listed in the room's `admin/users.json` with permission for the requested directory (`usersRO`, `usersRW`, or `admin`).
For `playwrightHarvest`, pass `seedLocalStorage: 'mintWonderAuth2'`; manual applet use signs in through the Google login screen.

## Room applets

The UI/browser twin of a lambda is a room-gated, published react-comp served at `/room/:roomId/applet/:name`. Publish it with
`uploadRoomApplet`; the resulting `appletV` points the host import map at frozen jb6+wonder source.

The renderer is the **applet host page** `serveAppletPage`/`APPLET_HOST_HTML` in
`cloud-services/express-server/lib/room-lambda-and-applet.js`. It is served inline and emits only the import map and `appletSpec`
(`cmpId`, `urlsToLoad`, `roomWUrl`, `appletV`). It reads no room data, so protection remains in downstream per-file reads.
The same `/room/:roomId/applet/:name` URL serves every room scheme.

`setupRoomLambdaAndApplet` serves the applet page alongside `POST /run-room-lambda`. It is registered in `local-server.js`
for development and the production/staging servers. `APPLET_HOST_HTML` runs `extendCtxWithUrl` and seeds `roomWUrl` from the
`appletSpec`; the bare `react-comp-view.html` harness instead needs `ctx-roomWUrl`.

## Room assets

An **assetsRepo** is a sub-directory of a room with an `assets.json` manifest that makes artifacts versioned and collaboratable (comments, ratings, relations).

## Useful rooms (for the LLM)

Real rooms can be read or written through `wFetch` using `<scheme>://<roomId>/<dir>/<file>?user=<id>`. Verify contents with a
trailing-slash GET and `dbLogger`, rather than trusting this list.

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
| room lambda | `uploadRoomLambda({ lambdaId, roomId, entryPath })` | `lambdas/<lambdaId>.json` | `POST /run-room-lambda/<roomId>/<lambdaId>` |
| room applet | `uploadRoomApplet({ roomId, entryPath, entryCompFullId })` | `applets/<name>.json` | `/room/<roomId>/applet/<name>` |
| admin ad-hoc | `uploadLambdaComp({ entryPath })` | tar at `lambdas/<lambdaV>.tar.gz` | `POST /admin-run-snippet/<lambdaV>` |

Applet runtime assets must use `new URL('./relative-file', import.meta.url)`. `uploadRoomApplet` recursively discovers JavaScript workers,
ES modules, WASM, and data assets, uploads them as raw bytes, and preserves their source-relative paths. Never use fake or commented imports.

## admin/users.json: 
{ admins: ['some-other@x.com'], users: [...], accessLevels: { usersRO: { user: 'r' }, admin: { admin: 'rw' } } }

## Cron (etls)

Scheduled code that runs room lambda. Built on the shared `gcloudCronEtl`. usually ETL component
