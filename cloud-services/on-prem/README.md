# Wonder on-prem — env + local server

One machine: this checkout, node 24, and a reachable MinIO. No Kubernetes.

## One-time MinIO setup

Create buckets `indiviai-wonder` and `wonder-code-packages` and allow anonymous read+write on both
(S3 Browser, or `mc anonymous set public <alias>/<bucket>`). MinIO CORS must allow the server origin
(the default `MINIO_API_CORS_ALLOW_ORIGIN=*` is fine).

## Configure and run

```sh
cp cloud-services/express-server/.env.onprem.template cloud-services/express-server/.env.onprem
vi cloud-services/express-server/.env.onprem   # usually only MINIO_ENDPOINT needs a real value
npm ci                                         # once
npm run onprem                                 # WONDER_ENV=onprem -> loads .env.onprem; server + MCP at http://localhost:3000
```

`WONDER_ENV` is the switch for which env file the local server loads: `dev` (default) loads `.env.dev`,
`onprem` loads `.env.onprem` — same folder, same mechanism.

## Use

Applets serve live from the checkout, no login: `http://localhost:3000/room/<roomId>/applet/<name>`

Smoke-test storage over MinIO, then publish, via MCP:

```sh
curl -s -X POST http://localhost:3000/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
  "params":{"name":"wFetch","arguments":{"url":"room://demo/usersRW/hello.json","method":"PUT","body":{"hello":"on-prem"}}}}'
curl -s -X POST http://localhost:3000/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
  "params":{"name":"wFetch","arguments":{"url":"room://demo/usersRW/hello.json"}}}'
curl -s -X POST http://localhost:3000/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":3,"method":"tools/call",
  "params":{"name":"uploadRoomApplet","arguments":{"roomId":"demo","entryCompFullId":"react-comp<react>YOUR_APPLET"}}}'
```

## Docker compose deployment (wonder + marketplace + llm-lite + minio)

Everything is env; the images carry code and deps only — no `.env` is ever baked. One `docker-compose.yml` runs the
outside sim, the site box, and mirrors what OpenShift deploys; every site fact (host, ports, endpoints, keys, storage
class) lives in `.env.site` (copy from `.env.site.template`, gitignored). All communication — browsers and
service-to-service alike — crosses the host at `SITE_HOST:<published port>`; there is no internal docker network, so
nothing can depend on an address browsers cannot reach (presigned S3 urls included). Containers resolve `SITE_HOST`
back to the host via docker's `host-gateway`; on OpenShift, cluster DNS and routes provide the same name.

Build outside and pack for whitening:

```sh
cloud-services/on-prem/build-images.sh --base    # dependency bases; needs network, so outside only
cloud-services/on-prem/build-images.sh           # app layers, built with --network=none; prints IMAGE_TAG=dd-mm-yyyy-HH-MM-<sha>
docker save wonder-server:<tag> marketplace-server:<tag> "$LLM_LITE_IMAGE" "$MINIO_IMAGE" | gzip > wonder-onprem-images.tar.gz
```

Whiten the tar plus this directory. On the site the stack is wonder + marketplace + llm-lite only — storage is the
site's **global MinIO**, set as `MINIO_ENDPOINT` in `.env.site` (browser-reachable URL). `docker load`, fill
`.env.site`, then:

```sh
docker compose --env-file .env.site up -d
./sim-check.sh
```

Outside sim — identical, plus the air-gap overlay (no egress for app services; llm-lite alone reaches the real LLM,
playing the site's internal endpoint). Set `SITE_HOST` to the machine's own hostname (`hostname`) — any machine, any
name; add an `/etc/hosts` entry only for a made-up name. Never localhost: it masks host/origin/CORS bugs.

```sh
docker compose --env-file .env.site -f docker-compose.yml -f compose.airgap.yml --profile local-minio up -d
./sim-check.sh
```

Browsers find the marketplace and the LLM through env injected into applet pages (`MARKETPLACE_API_URL`,
`LLM_PROXY_URL`); wonder's `/llmProxy` forwards to llm-lite whenever `LLM_PROXY_TARGET` is set. In-gap code edits:
rebuild the app layers from the whitened bases with `build-images.sh` — COPY-only, fully offline. Note: MinIO rejects
`StorageClass: STANDARD_IA` (`InvalidStorageClass`), so leave `MARKETPLACE_S3_STORAGE_CLASS` empty on MinIO;
`sim-check.sh` proves whatever value the site sets against the site's real S3.

## Getting the repo across

`npm run airgapped-export -- ../wonder-kit` (outside) builds a transfer kit: `wonder.bundle` (git bundle),
the runtime image, matching linux `node_modules`, and `SHA256SUMS` to verify after the copy.
