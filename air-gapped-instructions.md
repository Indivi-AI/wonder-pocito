# Wonder air-gapped deployment

This is the current operating guide for Wonder in the air-gapped network. It records the working local setup, transfer process, runtime
selection, bucket configuration, React applet flow, and remaining gaps.

## Current target

- Ubuntu development server.
- Repository: `/mnt/users/yiftach/wonder`.
- Docker, not Podman.
- Local Wonder server first; OpenShift later.
- One MinIO endpoint, reachable by the Ubuntu server and user browsers.
- Four separate buckets.
- Anonymous bucket access for now.
- Unsigned `room://` rooms only.
- `WONDER_AUTH_MODE=none`.
- HTTP/1.1 is sufficient; HTTP/2 is not required.
- DuckDB is intentionally excluded for now.

## Architecture

```text
MCP client/model ---- HTTP ----> Wonder local server :3000 ---- HTTP(S) ----> MinIO
User browser -------- HTTP ----> Wonder local server :3000
User browser ----------------------------------------- HTTP(S) ----> MinIO
```

The browser must reach both Wonder and MinIO. The Wonder server must also reach MinIO. If the browser is on another machine, do not use
`localhost` in either public URL.

## How MinIO is selected

`STORAGE_PROVIDER=minio` is the deployment selector.

1. `.jb6/mcp.js` imports `.jb6/mcp-on-prem.js` only when `STORAGE_PROVIDER` is exactly `minio`.
2. The on-prem MCP imports the MinIO object store and DB driver.
3. Server code creates contexts with `db: 'minio'` and `bucketEndpoint: MINIO_ENDPOINT`.
4. Applet pages receive `WONDER_STORAGE_PROVIDER=minio` and `WONDER_STORAGE_URL` for browser-side storage access.
5. `room://`, `clientCode://`, and other bare wUrls use that runtime DB context.

Do not globally replace Shai's `db: 'gcs'` code. GCS and MinIO are real, separate backends. Also do not use `db: 'bucket'` as the on-prem
selector: `bucket` is a driver category. The MinIO object store adds the `bucket`, `s3`, and `minio` categories, and selects `bucket.minio`.

An explicit wUrl such as `room:gcs//...` overrides the runtime selector and must not be used for on-prem data. Use `room://...` or, only when
an explicit backend is needed, `room:minio//...`.

## Buckets

Create these exact bucket names:

| Bucket | Use |
| --- | --- |
| `indiviai-wonder` | Public rooms, unsigned applet manifests, and room data |
| `indiviai-wonder-protected` | Signed rooms; created but not used in the current unsigned setup |
| `wonder-code-packages` | Uploaded applet snapshots, lambda packages, React runtime, and images |
| `logs-bucket-me-west1` | Wonder and room logs |

For the current no-security phase, configure all four buckets for anonymous object read and write. Range reads and HEAD requests must work.
Anonymous listing may also be enabled for convenience.

If room IDs are later meant to act as capability passwords, deny bucket listing while keeping object GET, PUT, HEAD, and any required DELETE.
Normal applet upload and opening do not need listing. `updateLambdasAndApplets` and trailing-slash `wFetch` requests do need listing.

### MinIO CORS

Configure CORS on the MinIO side for all four buckets:

- Allowed origins: `*`.
- Allowed methods: `GET`, `HEAD`, `PUT`, `POST`, and `DELETE`.
- Allowed headers: `*`.
- Expose at least `ETag`, `Last-Modified`, `Content-Length`, `Content-Range`, and `Accept-Ranges`.

No `mc` client is required. Use S3 Browser or ask the MinIO administrator. Some MinIO installations reject bucket-level `mc cors set`; in that
case the administrator must configure or verify the server-level CORS policy. The current internal MinIO CORS is considered acceptable.

### MinIO URL and certificates

Use the path-style form:

```text
https://MINIO_HOST/indiviai-wonder/ROOM_ID/file.json
```

If Wonder is served over HTTPS, MinIO must also use HTTPS or browsers will block mixed content. A private CA must be trusted by both the Ubuntu
server/container and every browser. The current scripts do not install a private CA automatically.

## What enters the air-gapped network

For the first installation, transfer:

- `wonder.bundle`.
- `wonder-image.tar.gz`.
- `node_modules.tar.gz`.
- `manifest.env`.
- `SHA256SUMS`.
- `run-mcp.sh`.
- This guide.

After the first local installation, a source-only Git bundle is normally enough because the repository is mounted into the container. Transfer a
new image after Dockerfile, OS package, Node version, or image runtime changes. Transfer `node_modules.tar.gz` when either npm manifest changes.
OpenShift does not mount the repository, so every OpenShift source release needs a new image.

Runtime network access is needed only between:

- MCP clients and the Wonder server.
- Browsers and the Wonder server.
- The Wonder server and MinIO.
- Browsers and MinIO.

GitHub, npm, GCP, and public container registries do not need to be allowed at runtime when all artifacts were prepared outside.

## Prepare the first kit outside

The exporter requires a clean, committed worktree and Docker. Use a writable destination; `/transfer` was read-only on the Mac.

```bash
cd /Users/yiftachn/code/wonder
git status --short
npm run airgapped-export -- "$HOME/wonder-kit"
```

The exporter builds a Linux image without DuckDB and creates the files listed above. It also records the image tag in `manifest.env`.
Its default platform is `linux/amd64`; set `PLATFORM` before exporting if the Ubuntu server uses another architecture.

Copy the kit to a permitted transfer medium. From Windows, an example is:

```text
scp -P 22 -r "C:\path\to\wonder-kit" 618gin@g-force:/mnt/users/yiftach/
```

## Install the first kit inside

Run these commands on the Ubuntu server:

```bash
cd /mnt/users/yiftach
sha256sum -c wonder-kit/SHA256SUMS
git clone wonder-kit/wonder.bundle wonder
cd wonder
git switch master
tar -xzf ../wonder-kit/node_modules.tar.gz
gzip -t ../wonder-kit/wonder-image.tar.gz
gunzip -c ../wonder-kit/wonder-image.tar.gz | docker load
. ../wonder-kit/manifest.env
docker image inspect "$WONDER_SOURCE_IMAGE" >/dev/null
```

The `node_modules` extraction is required because `run-mcp.sh` bind-mounts the repository at `/workspace`. Node must therefore find dependencies
under `/mnt/users/yiftach/wonder/node_modules`.

If `gzip -t` reports `unexpected end of file`, or `docker load` reports `corrupted` or `incomplete deflate data`, the transfer is incomplete.
Delete only the damaged transferred archive, copy it again, and repeat `gzip -t`. Loading the same damaged archive cannot succeed.

Do not use `install-airgap.sh` for the current environment. It assumes cluster deployment, bucket-admin access through `mc`, and a reachable
container registry, none of which match the current local setup.

## Runtime environment

No new repository `.env` file is required. Set runtime variables in the shell or in a private shell file outside the repository.

The local server loads `cloud-services/express-server/.env.dev` with override enabled. It currently has no conflicting air-gap keys. If those
keys are added there later, they override shell values and must be removed or corrected.

Set these values on the Ubuntu server:

```bash
cd /mnt/users/yiftach/wonder

. /mnt/users/yiftach/wonder-kit/manifest.env
export WONDER_IMAGE="$WONDER_SOURCE_IMAGE"
export CONTAINER_ENGINE=docker
export MINIO_ENDPOINT='https://MINIO_HOST'
export MINIO_PUBLIC_ENDPOINT="$MINIO_ENDPOINT"
export WONDER_SERVICE_URL='http://UBUNTU_HOST_OR_IP:3000'
export MINIO_REGION='us-east-1'
export S3_STORAGE_CLASS='STANDARD_IA'
export S3_USE_PATH_STYLE='true'
export PORT='3000'
```

With one MinIO endpoint, `MINIO_ENDPOINT` and `MINIO_PUBLIC_ENDPOINT` are the same:

- `MINIO_ENDPOINT` must be reachable from the Wonder container.
- `MINIO_PUBLIC_ENDPOINT` must be reachable from user browsers.

`run-mcp.sh` sets these derived values:

```text
STORAGE_PROVIDER=minio
WONDER_AUTH_MODE=none
WONDER_STORAGE_URL=$MINIO_PUBLIC_ENDPOINT
WONDER_CDN_URL=$MINIO_PUBLIC_ENDPOINT/wonder-code-packages/cdn
```

`S3_USE_PATH_STYLE=true` describes the required addressing, but the current MinIO driver already always builds path-style URLs.
`S3_STORAGE_CLASS=STANDARD_IA` is passed through but is not currently used by the anonymous MinIO PUT implementation.

The local Wonder server automatically accepts every CORS origin. MinIO CORS is separate and must still be configured. In OpenShift public mode,
set `CORS_ALLOW_ALL=true` to preserve the same Wonder-server behavior.

## Start the local server

After exporting the runtime variables above, start the server:

```bash
cd /mnt/users/yiftach/wonder
bash cloud-services/on-prem/run-mcp.sh /mnt/users/yiftach/wonder
```

Keep this terminal open. The script publishes container port 3000 on the Ubuntu host and bind-mounts the live repository. Source-only Git updates
therefore do not require an image rebuild.

From another terminal, verify:

```bash
curl -fsS http://127.0.0.1:3000/health
curl -sS -o /dev/null -w '%{http_code}\n' "$MINIO_ENDPOINT/indiviai-wonder/THIS_OBJECT_SHOULD_NOT_EXIST"
docker ps
```

Expected health response:

```json
{"status":"ok","mode":"local"}
```

From the MCP client machine and a user browser, also open:

```text
http://UBUNTU_HOST_OR_IP:3000/health
```

If localhost works but the host IP does not, check the Ubuntu firewall and routing to TCP port 3000.

## Configure the MCP client

Configure the internal model's MCP client with this Streamable HTTP endpoint:

```text
http://UBUNTU_HOST_OR_IP:3000/mcp
```

The remote MCP server must:

- Be reachable from the model host.
- Expose Wonder's registered MCP tools through `/mcp`.
- Run against the mounted repository so tools can inspect and execute source.
- Upload applet manifests and dependency snapshots to MinIO.
- Return tool results to the model over MCP.

It does not require HTTP/2. If a reverse proxy is added, allow long requests and streaming responses, and disable response buffering for streaming
routes. HTTP/1.1 keep-alive is sufficient.

## Creating and registering React components

Put model-created Pocito JavaScript files under:

```text
/mnt/users/yiftach/wonder/solutions/pocito/
```

`.jb6/mcp-on-prem.js` recursively imports every non-hidden `.js` file under `solutions/pocito`. This prevents the inside model from forgetting a
separate entry-point registration step. Tests are recommended for correctness but are not required merely to register a component.

Each file must still:

- Be valid ESM.
- Register a real TGP/React component rather than only declaring an unregistered JavaScript value.
- Import only files and packages available inside the air-gapped repository.
- Have no broken or missing dependencies.

The recursive import is strict: one invalid JavaScript file or missing import under `solutions/pocito` can prevent the on-prem MCP from starting.
Remove incomplete scratch files from that directory. ESM can resolve ordinary cycles, but application-level cyclic initialization can still fail.

After adding a component, use its full ID, for example:

```text
react-comp<react>myApplet
```

If the MCP says the component is not registered, confirm its file is under `solutions/pocito`, fix import errors, and restart the local server.

## Upload an unsigned room applet

Use the canonical `uploadRoomApplet` MCP tool with:

```json
{
  "roomId": "a-long-unpredictable-room-id",
  "entryCompFullId": "react-comp<react>myApplet"
}
```

The tool:

1. Finds the registered component and derives its source entry path.
2. Collects its repository dependency closure.
3. Uploads the source snapshot under `wonder-code-packages/applets/...` through the MinIO driver.
4. Writes the manifest under `indiviai-wonder/ROOM_ID/applets/COMPONENT_ID.json`.

`WONDER_AUTH_MODE=none` bypasses `testAdminUser`, so uploading an unsigned room applet does not require Google OAuth, an admin user, or a Wonder
user account. It still requires anonymous MinIO write permission.

Open the applet at:

```text
http://UBUNTU_HOST_OR_IP:3000/room/ROOM_ID/applet/COMPONENT_ID
```

Do not use `/signed-room/...` in this phase. Signed rooms select the signed-room driver and still depend on Wonder/GCP token and signed-URL
services.

The `entryUrl` currently returned by `uploadRoomApplet` is hard-coded to the public staging host. Ignore that returned URL on-prem and construct
the local URL above from `WONDER_SERVICE_URL`.

Old manifests without `clientCodeWUrl` are not usable by a non-live server and must be republished.

## Unsigned-room security model

The current setup deliberately has no application auth and anonymous bucket writes. The room ID is only a capability-like secret if bucket
listing is disabled and the ID is unpredictable. Anyone who knows a room ID and can reach MinIO may read or overwrite that room.

With anonymous bucket listing enabled, room IDs can be enumerated and should not be treated as passwords. This is accepted for the current
no-security phase.

## Extra dependencies

All dependencies used while building or running must exist inside the air-gapped network.

- Existing npm dependencies are carried by `node_modules.tar.gz` and the image.
- A new npm dependency requires an outside lockfile update and a new `node_modules.tar.gz` or image transfer.
- `uploadRoomApplet` excludes `node_modules` from the uploaded browser snapshot.
- A bare npm import must therefore already be supported by the applet import map or be vendored into repository source.

For the most reliable air-gapped applet, use repository modules and the existing `@jb6`, `@wonder`, `@solution`, and `@indiviai` imports. Do not
assume that installing an npm package on the server makes it available to an uploaded browser applet.

## Upload the local React runtime and images

The provided uploader needs only `curl` and anonymous PUT access:

```bash
cd /mnt/users/yiftach/wonder
export MINIO_ENDPOINT='https://MINIO_HOST'
bash cloud-services/on-prem/deploy-cdn.sh
```

It uploads:

- `jb6/react/lib` to `wonder-code-packages/cdn`.
- `wonder/images` to `wonder-code-packages/cdn/images`.

This upload is useful for a future non-live deployment, but see the CDN wiring gap below.

## Updating source with a Git bundle

A `.bundle` file is a read-only Git transport, not a writable remote. Fetch from it; never push to it.

### Create an update outside

First get the current inside commit:

```bash
cd /mnt/users/yiftach/wonder
git rev-parse HEAD
```

Outside, commit only intended changes and create the smallest update from that shared commit:

```bash
cd /Users/yiftachn/code/wonder
git status --short
git add air-gapped-instructions.md OTHER_INTENDED_FILES
git commit -m 'describe the change'
git bundle create "$HOME/wonder-update.bundle" master ^INSIDE_CURRENT_HEAD
git bundle verify "$HOME/wonder-update.bundle"
```

`INSIDE_CURRENT_HEAD` must exist outside and be an ancestor of `master`. If it is not, create a full fallback bundle:

```bash
git bundle create "$HOME/wonder-update-full.bundle" master
```

Transfer the bundle you created to `/mnt/users/yiftach/`; use its actual filename in the inside commands below.

### Apply the update inside

```bash
cd /mnt/users/yiftach/wonder
git status --short
git fetch /mnt/users/yiftach/wonder-update.bundle master
git switch master
git merge --ff-only FETCH_HEAD
```

Restart the local server after the update. A source-only update needs no image reload because the repository is mounted into the container.

If `origin` points to a transferred `.bundle`, remove its upstream relationship to avoid misleading divergence messages:

```bash
git branch --unset-upstream 2>/dev/null || true
git remote remove origin
```

Only when the inside checkout is intentionally disposable and must exactly match the transferred master, first make a backup branch, then reset:

```bash
git branch "backup-before-reset-$(date +%Y%m%d-%H%M%S)"
git fetch /mnt/users/yiftach/wonder-update.bundle master
git switch master
git reset --hard FETCH_HEAD
```

This discards tracked inside changes after preserving them on the backup branch. It does not remove untracked files.

## OpenShift later

`route_host` means the DNS hostname assigned to an OpenShift Route, such as `wonder.apps.internal.example`. It is not needed for the local Docker
server.

When OpenShift is used:

- Use `oc`, not `kubectl`.
- Set the active project with `oc project PROJECT`.
- Put runtime variables in an OpenShift Secret or Deployment environment, not a repository `.env`.
- Set `CORS_ALLOW_ALL=true` for the Wonder service.
- Set `WONDER_SERVICE_URL` to the Route origin.
- Ensure the Route, pods, and user browsers can reach the MinIO public endpoint.
- Import the image through an internal process approved by the cluster administrator.

If the OpenShift image registry has no public hostname, Docker on the Ubuntu server cannot push to its internal ClusterIP. An administrator must
expose the registry, provide another reachable registry, or arrange an in-cluster image import/build. Do not invent a public registry hostname.

## Known gaps before a production OpenShift deployment

### Dedicated remote MCP image

The current local MCP works because `run-mcp.sh` mounts the whole repository. The current Wonder image does not copy `.jb6`, `solutions`, or
`indiviai`, and `wonder.yaml` starts the public service rather than the local MCP service. A standalone OpenShift MCP deployment is not packaged
yet.

A future MCP image must include the on-prem MCP entry point, `solutions`, required source trees, and any writable source workflow, then expose
`/mcp` separately from or alongside the public service.

### React runtime CDN selection

`WONDER_CDN_URL` is set by the on-prem scripts, but the non-live applet page currently resolves `clientCode:cloudflare//runtime/` through a
hard-coded `https://jb6-cdn.pages.dev` endpoint. The local server primarily uses its live-repository import map, so local applets can work, but
icons may still attempt that public CDN.

Before a non-live OpenShift applet deployment, wire the runtime base to `WONDER_CDN_URL` or an equivalent MinIO-backed object-store endpoint.
Uploading `wonder-code-packages/cdn` alone does not currently complete that wiring.

### Local testing does not fully test the uploaded snapshot

Local applet routes use the live repository import map. They prove that the component and room manifest work, but do not fully prove that the
uploaded snapshot and production import map work. A production-mode on-prem test is still needed before declaring OpenShift applets complete.

### Chromium

Playwright is in `devDependencies`, but the current Dockerfiles do not explicitly install a Chromium browser and its complete system runtime.
MCP tools that require browser automation may fail even while normal applet upload works. Verify Chromium inside the final image or bake it into
the image outside the air gap before relying on `playwrightHarvest`.

### Hard-coded cloud features

Unsigned room applets and MinIO storage are separated from GCP. Other features still contain GCP or public-service assumptions, including:

- Signed rooms and signed URLs.
- The GCS proxy.
- Some LLM proxy/provider paths.
- BI, ETL, and cache paths written specifically for GCS.
- Some public fonts, icons, model endpoints, and staging URLs.

Do not assume those features work air-gapped merely because an unsigned React applet works. Audit each feature before enabling it.

### Concurrent writes

The MinIO driver uses anonymous HTTP access and does not currently provide the GCS generation-based conditional-write protocol. Single-writer
GET/PUT appends can lose updates under concurrent writers. The current simple applet flow is acceptable, but concurrent mutation needs a MinIO
revision strategy later.

## Fast troubleshooting

| Symptom | Check |
| --- | --- |
| `/health` is unreachable remotely | Port 3000 publication, Ubuntu firewall, and `WONDER_SERVICE_URL` host |
| MCP starts the GCS path | `STORAGE_PROVIDER` must be exactly `minio` inside the container |
| MinIO object requests use GCS | Remove explicit `:gcs//` wUrls and verify `MINIO_ENDPOINT` |
| Applet upload says not registered | File location, full component ID, import error, then restart MCP |
| MCP fails during startup | Every `.js` under `solutions/pocito` must import successfully |
| Upload returns 403 | Anonymous PUT policy on `indiviai-wonder` and `wonder-code-packages` |
| Applet manifest is 404 | Exact room/component ID and anonymous GET policy |
| Browser reports CORS | MinIO CORS, public endpoint reachability, and allowed response headers |
| Browser reports mixed content | Serve MinIO with HTTPS when Wonder uses HTTPS |
| Returned applet URL points to staging | Ignore it and build the URL from `WONDER_SERVICE_URL` |
| Old applet says no `clientCodeWUrl` | Republish it with `uploadRoomApplet` |
| `docker load` reports corrupt gzip | Re-transfer, run `gzip -t`, then load |
| Git says branch diverged from `origin/master` | The bundle remote is stale; unset upstream or remove `origin` |
| `git push` to `.bundle` fails | Expected; create a new bundle outside and fetch it inside |
| Playwright cannot launch | Chromium and OS dependencies are not guaranteed in the current image |

## Minimal current checklist

1. Confirm the four exact buckets exist and allow anonymous object access.
2. Confirm MinIO CORS and browser reachability.
3. Install the Git bundle, `node_modules`, and Docker image once.
4. Export the runtime variables with the single MinIO endpoint.
5. Run `bash cloud-services/on-prem/run-mcp.sh /mnt/users/yiftach/wonder`.
6. Verify `/health` locally and from the MCP client machine.
7. Configure the model with `http://UBUNTU_HOST_OR_IP:3000/mcp`.
8. Put valid component files under `solutions/pocito`.
9. Call `uploadRoomApplet` for an unsigned room.
10. Open `/room/ROOM_ID/applet/COMPONENT_ID`.

## Source-of-truth files

- `.jb6/mcp.js` — selects the on-prem MCP.
- `.jb6/mcp-on-prem.js` — imports MinIO support, MCP tools, and all Pocito JavaScript.
- `wonder/db/db-drivers-s3-minio.js` — MinIO object store and driver.
- `wonder/db/db-drivers-core.js` — runtime DB/category selection.
- `wonder/db/db-drivers-code.js` — client and lambda code bucket mapping.
- `wonder/db/db-drivers-signed-room.js` — signed-room behavior.
- `wonder/studio/mcp-tools/wonder-mcp-tools.js` — applet upload implementation.
- `cloud-services/express-server/local-server.js` — local server startup and `.env.dev` loading.
- `cloud-services/express-server/lib/room-lambda-and-applet.js` — applet routes, storage injection, and runtime import map.
- `cloud-services/on-prem/run-mcp.sh` — current local Docker launcher.
- `cloud-services/on-prem/export-airgap.sh` — full offline kit exporter.
- `cloud-services/on-prem/wonder.yaml` — current OpenShift public service manifest.
