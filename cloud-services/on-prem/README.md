# Wonder on-prem — build outside, whiten, run inside

Images are built OUTSIDE the gap and carry code + deps only — no `.env` is ever baked. One `docker-compose.yml` runs
the outside sim and the site stack (and mirrors what OpenShift deploys); every site fact lives in `.env.site`
(copy `.env.site.template`, gitignored, one copy per machine). All communication — browsers and service-to-service
alike — crosses the host at `SITE_HOST:<published port>`; there is no internal docker network, so nothing can depend
on an address browsers cannot reach (presigned S3 urls included). Containers resolve `SITE_HOST` back to the host via
docker's `host-gateway`; on OpenShift, cluster DNS and routes provide the same name.

## Outside: build and simulate

```sh
cloud-services/on-prem/build-images.sh --base    # dependency bases; needs network, so outside only
cloud-services/on-prem/build-images.sh           # app layers, built with --network=none; prints IMAGE_TAG=dd-mm-yyyy-HH-MM-<sha>
cd cloud-services/on-prem && cp .env.site.template .env.site   # SITE_HOST=$(hostname), IMAGE_TAG, LLM_UPSTREAM_KEY
docker compose --env-file .env.site -f docker-compose.yml -f compose.airgap.yml --profile local-minio up -d
./sim-check.sh    # waits for readiness, then: anonymous room/applet storage, /llmProxy, CRUD, presign, AgentOS run
```

Images target the SITE's cpu: `build-images.sh` defaults to `linux/amd64` (override with `PLATFORM=linux/arm64`) —
a mac arm build without it produces images g-force-class x86 hosts cannot run. In the sim, the `minio-init` one-shot
creates the `WONDER_BUCKETS` with anonymous read/write; `LLM_SMOKE=1 ./sim-check.sh` additionally buys one real
completion through llm-lite.

The airgap overlay removes internet for wonder/marketplace/minio (published ports still work); llm-lite alone gets
egress, playing the site's internal LLM endpoint. `--profile local-minio` spins a stand-in for the site's global
MinIO. Set `SITE_HOST` to the machine's own hostname — any machine, any name; add an `/etc/hosts` entry only for a
made-up name, and never browse via localhost: it masks host/origin/CORS bugs.
Browser check: `http://$SITE_HOST:58045/room/<room>/applet/<name>`.

## The whitening kit

```sh
source cloud-services/on-prem/.env.site
docker save wonder-server:<tag> marketplace-server:<tag> "$LLM_LITE_IMAGE" | gzip > wonder-images.tar.gz
git bundle create wonder.bundle HEAD <branch>          # source: enables in-gap edits and image rebuilds
sha256sum wonder-images.tar.gz wonder.bundle > SHA256SUMS
```

Kit = the images tar + `wonder.bundle` + this directory (compose files, dockerfiles, `llm-lite-config.yaml`,
`.env.site.template`, scripts). `export-airgap.sh` still builds the legacy bare-process kit (bundle + runtime image +
`node_modules` tarball) when needed.

## Inside: deploy and iterate

```sh
docker load < wonder-images.tar.gz
cp .env.site.template .env.site
docker compose --env-file .env.site up -d    # wonder + marketplace + llm-lite; no minio service on site
./sim-check.sh
```

Fill `.env.site` with: `SITE_HOST` (the name browsers use for this machine), `IMAGE_TAG`, `MINIO_ENDPOINT` = the
site's **global MinIO** url (browser-reachable), its S3 creds, `MARKETPLACE_S3_STORAGE_CLASS` (site S3 only — MinIO
rejects `STANDARD_IA` with `InvalidStorageClass`; `sim-check.sh` proves whatever the site sets),
`LLM_UPSTREAM_BASE` = the internal OpenAI-compatible endpoint, `LLM_UPSTREAM_KEY`, and an invented `LLM_PROXY_KEY`
(gates the published llm-lite port). Wonder's global MinIO needs buckets `indiviai-wonder` and
`wonder-code-packages` with anonymous read+write.

In-gap code edits: update source from `wonder.bundle`, run `build-images.sh` (COPY-only layers, fully offline from
the whitened bases), bump `IMAGE_TAG` in `.env.site`, `up -d`. OpenShift prod: the same images; the same `.env.site`
keys become ConfigMap/Secret entries.

## Bare-process dev mode (no docker)

`npm run onprem` runs the wonder server alone against a reachable MinIO, loading
`cloud-services/express-server/.env.onprem` (copy `.env.onprem.template`; usually only `MINIO_ENDPOINT` needs a real
value). Applets serve live from the checkout at `http://localhost:3000/room/<roomId>/applet/<name>`.
