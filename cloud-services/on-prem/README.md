# Wonder on-prem — build outside, whiten, run inside

Images are built OUTSIDE the gap and carry code + deps only — no `.env` is ever baked. Docker Compose runs the machine-local stack; the Helm
chart deploys the same images and configuration to local Kubernetes or OpenShift. Every site fact lives in `.env.site`
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
creates the `WONDER_BUCKETS` with anonymous read/write; the smoke's `/llmProxy` check sends one tiny completion
through llm-lite and prints the upstream's verdict verbatim. For teammate day-to-day development, `./wonder-up.sh` at the repo root wraps all of this
and adds `compose.dev.yml` — the working tree mounted live into the containers, native-arch images.

The airgap overlay removes internet for wonder/marketplace/agno/minio (published ports still work); llm-lite alone
gets egress, playing the site's internal LLM endpoint. agno (AgentOS agent runs, `agno_server.py`) shares the
marketplace image; the two servers share only the object store — browsers call each at its own published port. `--profile local-minio` spins a stand-in for the site's global
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

Kit = the images tar + `wonder.bundle` + this directory (compose files, dockerfiles, Helm chart,
`.env.site.template`, scripts). `export-airgap.sh` still builds the legacy bare-process kit (bundle + runtime image +
`node_modules` tarball) when needed.

## Local Kubernetes and OpenShift

`helm/wonder` is one chart with explicit `platform: kubernetes|openshift` variants. The Kubernetes variant renders an Ingress and optional
MinIO; the OpenShift variant renders Routes, requires digest-pinned images, and uses the site's object store. On an outside Mac with kind:

```sh
PLATFORM=linux/arm64 ./build-images.sh --base
PLATFORM=linux/arm64 ./build-images.sh
./local-k8s-up.sh <IMAGE_TAG>
./local-k8s-check.sh
```

## Inside: deploy and iterate

```sh
docker load < wonder-images.tar.gz
cp .env.site.template .env.site
docker compose --env-file .env.site up -d    # wonder + marketplace + agno + llm-lite; no minio service on site
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

Site LiteLLM config: put the site's own yaml at `llm-lite-site.yaml` next to `.env.site` (gitignored; include it in
the whitening kit) and set `LLM_LITE_CONFIG=./llm-lite-site.yaml`. Any `os.environ/KEY` it references goes into
`.env.site`; if it pins its own `master_key`, `LLM_PROXY_KEY` must equal it. Applet code chooses any model served by this catalog; only
`SMOKE_LLM_MODEL` selects the deployment smoke test's model. If its upstream is https behind an internal CA, add the CA via a small override:
`services: {llm-lite: {volumes: ["./site-ca.pem:/site-ca.pem:ro"], environment: {SSL_CERT_FILE: /site-ca.pem}}}`.

## Bare-process dev mode (no docker)

`npm run onprem` runs the wonder server alone against a reachable MinIO, loading
`cloud-services/express-server/.env.onprem` (copy `.env.onprem.template`; usually only `MINIO_ENDPOINT` needs a real
value). Applets serve live from the checkout at `http://localhost:3000/room/<roomId>/applet/<name>`.
