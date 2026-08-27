# Wonder on-prem — build outside, whiten, run inside

Images are built OUTSIDE the gap and carry code + deps only — no `.env` is ever baked. Docker Compose runs the machine-local stack; the Helm
chart deploys the same images and configuration to local Kubernetes or OpenShift. Every site fact lives in `.env.site`
(copy `.env.site.template`, gitignored, one copy per machine). All communication — browsers and service-to-service
alike — crosses the host at `SITE_HOST:<published port>`; there is no internal docker network, so nothing can depend
on an address browsers cannot reach (presigned S3 urls included). Containers resolve `SITE_HOST` back to the host via
docker's `host-gateway`; on OpenShift, cluster DNS and routes provide the same name.

## Outside: build and simulate

```sh
solutions/pocito/on-prem/build-images.sh --base    # dependency bases; needs network, so outside only
solutions/pocito/on-prem/build-images.sh           # app layers, built with --network=none; prints IMAGE_TAG=dd-mm-yyyy-HH-MM-<sha>
cd solutions/pocito/on-prem && cp .env.site.template .env.site               # SITE_HOST=$(hostname), IMAGE_TAG, LLM_MODEL
cp llm-lite-config.template.yaml llm-lite-config.yaml                      # upstream endpoint; the api key is typed into .env.site LLM_API_KEY
docker compose --env-file .env.site -f docker-compose.yml -f compose.airgap.yml --profile local-minio up -d
./sim-check.sh    # waits for readiness, then: anonymous room/applet storage, /llmProxy, CRUD, presign, AgentOS run
```

Images target the SITE's cpu: `build-images.sh` defaults to `linux/amd64` (override with `PLATFORM=linux/arm64`) —
a mac arm build without it produces images g-force-class x86 hosts cannot run. In the sim, the `minio-init` one-shot
creates the `WONDER_BUCKETS` with anonymous read/write; the smoke's `/llmProxy` check sends one tiny completion
through llm-lite and prints the upstream's verdict verbatim. For teammate day-to-day development, `./solutions/pocito/wonder-up.sh` wraps all of this
and adds `compose.dev.yml` — the working tree mounted live into the containers, native-arch images.

The airgap overlay removes internet for wonder/marketplace/agno/minio (published ports still work); llm-lite alone
gets egress, playing the site's internal LLM endpoint. `--profile local-flapi` (or `wonder-up.sh --flapi`) adds the
vendored FLAPI mock at :58051 as the stand-in for the site's FLAPI package service — like minio, it never runs on a
real site. agno (AgentOS agent runs, `agno_server.py`) shares the
marketplace image; the two servers share only the object store — browsers call each at its own published port. `--profile local-minio` spins a stand-in for the site's global
MinIO. Set `SITE_HOST` to the machine's own hostname — any machine, any name; add an `/etc/hosts` entry only for a
made-up name, and never browse via localhost: it masks host/origin/CORS bugs.
Browser check: `http://$SITE_HOST:58045/room/<room>/applet/<name>`.

## The whitening kit

```sh
cd solutions/pocito/on-prem   # bases enable in-gap rebuilds; config --images lists the stack (llm-lite, pgvector included)
docker save wonder-server-base:latest marketplace-server-base:latest \
  $(docker compose --env-file .env.site config --images | sort -u) | gzip > wonder-images.tar.gz
git bundle create wonder.bundle HEAD <branch>          # source: enables in-gap edits and image rebuilds
sha256sum wonder-images.tar.gz wonder.bundle > SHA256SUMS
```

Kit = the images tar + `wonder.bundle` + this directory (compose files, dockerfiles, Helm chart,
`.env.site.template`, `llm-lite-config.template.yaml`, scripts). `export-airgap.sh` still builds the legacy
bare-process kit (bundle + runtime image + `node_modules` tarball) when needed.

`create-docker-airgap-kit.sh` automates all of it; its `--aio` flavor builds `wonder-aio` (`build-images.sh --aio`,
`all-in-one.docker`): ONE image whose `aio-start.sh` runs all four app servers — wonder, marketplace, agno, and
litellm in its own venv (litellm's `mcp<2` conflicts with the marketplace's `mcp==2`, so they cannot share
site-packages). `compose.aio.yml` runs it with pgvector (+ optional local minio) alongside, mounting the
`wonder-source` clone as the running code — so aio kits carry no base images and never rebuild in-gap, and one
image file crosses the whitening gate. It is also the Windows path: `docker-up.ps1` needs only Docker Desktop.

Live-repo serving needs the source as a real git clone (jb6 finds the repo root by walking up to `.git`, which
images never contain). Both up scripts therefore clone `wonder.bundle` to `wonder-source` on first run; lean/apps
kits mount it into the wonder container via the `compose.liverepo.yml` overlay, aio kits via `compose.aio.yml`.
In-gap edits: edit `wonder-source`, then `docker compose restart wonder` (or `restart aio`).

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
cp llm-lite-config.template.yaml llm-lite-config.yaml
docker compose --env-file .env.site up -d    # wonder + marketplace + agno + llm-lite + pgvector; no minio service on site
./sim-check.sh
```

Fill `.env.site` with just the human values: `SITE_HOST` (the name browsers use for this machine), `IMAGE_TAG`,
`MINIO_ENDPOINT` = the site's **global MinIO** url (browser-reachable), its S3 creds, `LLM_MODEL` (the default
model applets start with; the UI may pick another), and the `FLAPI_*` pair when the FLAPI package service is used.
Everything else — scheme, published ports, buckets, storage class, postgres creds, image pins — defaults inside
`docker-compose.yml`; override by uncommenting it in the template's advanced section (site S3 note: MinIO rejects
`STANDARD_IA` with `InvalidStorageClass`; `sim-check.sh` proves whatever the site sets). `pgvector` is durable in
the `pgvector-data` volume; set `PGVECTOR_URL` only for an external PostgreSQL. Wonder's global MinIO needs buckets
`indiviai-wonder` and `wonder-code-packages` with anonymous read+write.

LLM routing lives in `llm-lite-config.yaml` (gitignored, next to `.env.site`): the internal OpenAI-compatible
endpoint and the model list. The api key is typed into `.env.site` as `LLM_API_KEY` on the machine that runs the
stack — no kit, image or config file ever carries it (a site-owned yaml may instead inline its own key and skip
`LLM_API_KEY`). If the upstream is https behind an internal CA, add the CA via a small override:
`services: {llm-lite: {volumes: ["./site-ca.pem:/site-ca.pem:ro"], environment: {SSL_CERT_FILE: /site-ca.pem}}}`.

In-gap code edits: update source from `wonder.bundle`, run `build-images.sh` (COPY-only layers, fully offline from
the whitened bases), bump `IMAGE_TAG` in `.env.site`, `up -d`. OpenShift prod: the same images; the same `.env.site`
keys become ConfigMap/Secret entries and `llm-lite-config.yaml` is passed as `--set-file llm.config`.

## Bare-process mode (no docker) — Windows and Linux

`node solutions/pocito/on-prem/bare-up.mjs` runs ALL FOUR app servers as bare processes on any machine with
node+npm and python on PATH — no docker. First runs create `.env.bare` (from its template) and the venvs
(marketplace `.venv` + isolated `.venv-litellm`), then it starts wonder :3000, marketplace :7777, agno :7778 and
litellm :4000, prefixing each server's log lines. MinIO and postgres are not started — `.env.bare` points at
reachable ones (the docker stack's published ports, or the site's global services). In the gap, extract a carried
`node_modules` tarball at the repo root and install the python deps from a wheel dir instead of the index.

`npm run onprem` remains the smaller variant: the wonder server alone against a reachable MinIO, loading
`cloud-services/express-server/.env.onprem` (copy `.env.onprem.template`). Applets serve live from the checkout
at `http://localhost:3000/room/<roomId>/applet/<name>` in both variants.
