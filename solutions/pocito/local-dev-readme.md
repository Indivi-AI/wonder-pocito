# Pocito local development

`npm run pocito-dev` starts Pocito, Marketplace and Agno, plus bundled LiteLLM and FLAPI unless their external URLs are set.
`npm run pocito-dev-airgapped` requires external FLAPI and never installs dependencies or downloads model assets.
It does not start MinIO or PostgreSQL.
Applets use checkout source and existing `files/rooms` data. Publishing uploads to the configured MinIO that imitates production.
The launcher does not create applets, change FLAPI fixtures, or provision external infrastructure.

## Docker infrastructure (once)

From the repository root, with Docker running:

```sh
docker run -d --name pocito-minio \
  -p 127.0.0.1:9000:9000 -p 127.0.0.1:9001:9001 \
  -e MINIO_ROOT_USER=wonder -e MINIO_ROOT_PASSWORD=wonder-minio-local \
  -v pocito-minio:/data minio/minio:RELEASE.2025-04-22T22-12-26Z server /data --console-address :9001
docker run -d --name pocito-postgres --platform linux/amd64 -p 127.0.0.1:5432:5432 \
  -e POSTGRES_USER=wonder -e POSTGRES_PASSWORD=wonder-pg-local -e POSTGRES_DB=wonder \
  -v pocito-postgres:/var/lib/postgresql/data pgvector/pgvector:0.8.6-pg16-bookworm
```

After PostgreSQL finishes initializing, enable pgvector and create the demo buckets:

```sh
docker exec pocito-postgres psql -U wonder -d wonder -c 'CREATE EXTENSION IF NOT EXISTS vector;'
docker run --rm --network container:pocito-minio --entrypoint /bin/sh minio/mc:latest -ec '
  mc alias set local http://localhost:9000 wonder wonder-minio-local
  for bucket in indiviai-wonder wonder-code-packages; do
    mc mb --ignore-existing local/$bucket
    mc anonymous set public local/$bucket
  done'
```

Anonymous read/write access is intentional for this demo. The API is `http://localhost:9000`; console is `http://localhost:9001`.
Named volumes retain data. Later use `docker start pocito-minio pocito-postgres` or `docker stop pocito-minio pocito-postgres`.
For air-gapped hosts, import these images ahead of time or use your internal registry.
Existing on-prem services can replace these containers: configure their endpoints, credentials, buckets and vector extension yourself.

## Start the app

Install Node 24+ and uv on macOS or Linux. No native MinIO or PostgreSQL installation is needed.
The launcher installs missing npm dependencies and lets uv select a compatible Python for each locked environment.
Set `POCITO_PYTHON` only to request a specific compatible version.

```sh
cp -n solutions/pocito/.env.onprem.example solutions/pocito/.env.onprem
# Only when LITELLM_HOST is empty:
cp -n solutions/pocito/on-prem/litellm/config.yaml solutions/pocito/on-prem/litellm/config.local.yaml
npm run pocito-dev
```
`npm run pocito-dev` uses `POCITO_NPM_INSTALL='install --omit=optional'`, so root Google SDK/Auth packages are installed only for
Cloud/credentialed targets and skipped in on-prem.

When using bundled LiteLLM, edit `config.local.yaml` with model endpoints and keys; keep real credentials out of the tracked template.
`chat` and `embeddings` are OpenAI-compatible aliases. Replace the OpenAI deployments with your on-prem providers.
Agent manifests with explicit models must use configured aliases. Embedding dimensions must match the deployment;
changing embedding model/dimensions requires rebuilding affected knowledge indexes.

Open your existing applet at `http://localhost:3000/room/<room>/applet/<applet>`.
Any registered react-comp also serves def-less at `http://localhost:3000/applet/<cmpId>` (derived spec; the comp must be imported from your `.jb6` entry point).
Ctrl+C stops app processes only; Docker infrastructure remains running.

## Configuration

Precedence: defaults, `.env.onprem`, shell/container environment, then derived per-service URLs.
No Wonder env file is loaded. Model credentials belong only in LiteLLM YAML, not `.env.onprem`.

| Setting | Value / behavior |
| --- | --- |
| `MINIO_ENDPOINT` | Required; template uses `http://localhost:9000` |
| `PGVECTOR_URL` | Required; template uses `postgresql+psycopg://wonder:wonder-pg-local@localhost:5432/wonder` |
| `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | Defaults: `wonder`, `wonder-minio-local` |
| `MARKETPLACE_S3_BUCKET` | Marketplace room storage; defaults to `indiviai-wonder` |
| `MINIO_STORAGE_CLASS` | Defaults to `STANDARD_IA`; use `STANDARD` with stock MinIO |
| `POCITO_DATA_DIR` | `.local-data` relative to this directory; Python environments and marketplace data, not applet files |
| `OPENAI_EMBEDDING_DIMENSIONS` | `1536` |
| `FLAPI_BASE_URL`, `FLAPI_TOKEN`, `FLAPI_USERNAME` | FLAPI endpoint and credentials; the local mock requires username `625navehp` |
| `LITELLM_HOST` | External LiteLLM origin; empty starts bundled LiteLLM at `http://localhost:${LITELLM_PORT}` |

All storage endpoints are external to the launcher, even `localhost`. Agno chat sessions are currently in memory.
App ports: Pocito `3000`, Marketplace `7777`, Agno `7778`, LiteLLM `4000`, FLAPI `6001`.
Optional port overrides are listed in `.env.onprem.example`.
The launcher preserves npm configuration and forwards pip's primary index to uv unless uv has its own index configuration.
For advanced Artifactory authentication, configure uv directly. Missing Python binaries need an approved
`UV_PYTHON_INSTALL_MIRROR` or a compatible preinstalled Python runtime; package indexes alone do not supply Python or tokenizer assets.

## Air-gapped development container

The image supplies Linux dependencies, OMP 18.1.2 and a Git bundle. Its entrypoint clones the bundle into `/workspace/repo` on the first start.
Use a named Docker volume for that path so Git, tools and VS Code all work on the same Linux filesystem without Windows CRLF or file-mode noise.
MinIO and PostgreSQL/pgvector remain external and must be reachable from the container.

### 1. Prepare the ignored environment files

Prepare an environment file on the host from `.env.onprem.example`. Docker passes it to the container with `--env-file`; it is not stored in the
workspace volume or image. The external-service URLs must be reachable from inside the container.

```env
MINIO_ENDPOINT=http://localhost:9000
PGVECTOR_URL=postgresql+psycopg://wonder:wonder-pg-local@localhost:5432/wonder
MINIO_ACCESS_KEY=wonder
MINIO_SECRET_KEY=wonder-minio-local
MINIO_STORAGE_CLASS=STANDARD_IA
FLAPI_BASE_URL=http://flapi.internal:6001
FLAPI_TOKEN=<FLAPI_TOKEN>
FLAPI_USERNAME=<FLAPI_USERNAME>
LITELLM_HOST=http://litellm.internal:4000
LITELLM_API_KEY=<LITELLM_API_KEY>
POCITO_PORT=3007
```

On native Linux with `--network host`, `localhost` reaches host MinIO and PostgreSQL. For bridge networking, use service hostnames or addresses
reachable from inside the container; on Docker Desktop this is commonly `host.docker.internal`. External air-gapped services can use their
normal DNS names or IP addresses. Ensure both MinIO buckets exist and PostgreSQL has the `vector` extension as described above.

If the network provides LiteLLM, set `LITELLM_HOST`; the bundled LiteLLM and its YAML are then unused. OMP discovers the models exposed by that
gateway and uses `LITELLM_API_KEY` when supplied. If bundled LiteLLM is required, leave `LITELLM_HOST` empty and mount a prepared configuration
at `/run/pocito/litellm.yaml`, then set `LITELLM_CONFIG=/run/pocito/litellm.yaml`.
Provider keys belong only in runtime configuration, never in the Git bundle, tracked template, build arguments or image layers.
Set `FLAPI_BASE_URL`, `FLAPI_TOKEN` and `FLAPI_USERNAME` for the external on-prem FLAPI service.

### 2. Load the transferred image

```sh
cd solutions/pocito/on-prem/images
sha256sum -c SHA256SUMS
cat pocito-dev-linux-amd64.tar.gz.part-* | gzip -dc | docker load
cd ../../../..
```

The archive loads `pocito-dev:linux-amd64` and `pocito-dev:sudo-linux-amd64`.
The sudo image uses `pocito` as both username and sudo password.

### 3. Run with a Linux workspace volume

On Docker Desktop for Windows:

```sh
docker volume create pocito-workspace
docker volume create pocito-data
docker volume create pocito-home
docker run -d --name pocito-dev --restart unless-stopped \
  --add-host host.docker.internal:host-gateway -p 127.0.0.1:3007:3007 \
  --env-file "<ENV_PATH>" \
  --mount type=volume,src=pocito-workspace,dst=/workspace/repo \
  --mount type=volume,src=pocito-data,dst=/var/lib/pocito \
  --mount type=volume,src=pocito-home,dst=/home/pocito \
  pocito-dev:linux-amd64 npm run pocito-dev-airgapped
```

Replace `<ENV_PATH>` with the host environment file. The entrypoint clones the baked current branch only when `pocito-workspace` is empty and
never overwrites an existing checkout. It names the read-only bundle remote `image-bundle`. No `node_modules` mount is needed: the repository
sits below `/workspace/node_modules`, which Node resolves as an ancestor. The command uses only image-baked dependencies.

On native Linux, replace the port and host mapping with:

```sh
--network host
```

VS Code can use **Dev Containers: Attach to Running Container**; the checkout is `/workspace/repo` and the container user is `pocito`.

OMP runs entirely inside the container and stores its sessions under `/var/lib/pocito/omp`:

```sh
omp models litellm
omp --model litellm/<MODEL_ALIAS>
```

Expose stable coding aliases such as `coder-default`, `coder-fast` and `coder-deep` in LiteLLM. OMP discovers them from LiteLLM, so changing an
alias's underlying MiniMax, Qwen or DeepSeek deployment does not require rebuilding the image.

### 4. Inspect Pocito

```sh
docker logs -f pocito-dev
curl -f http://localhost:3007/health
```

The script uses external FLAPI, LiteLLM and Agno when configured and starts the baked LiteLLM or Agno otherwise.

### 5. Run the installation suite

Open:

`http://localhost:3007/wonder/studio/tests.html?pattern=pocitoOnPrem&includeHeavy`

The default suite accepts Agno's `degraded`/`vector_store: unreachable` health when object storage is healthy. Run the optional strict pgvector health
test directly at `http://localhost:3007/wonder/studio/tests.html?test=pocitoOnPrem.serviceAgnoStrictPgvector`; it requires fully healthy Agno object
and vector stores. The direct `pocitoOnPrem.pgvector` round-trip is also optional and excluded from the default suite.

The sixteen default tests cover individual service health, metadata and execution through the FLAPI proxy for packages 101–104, travel dataset
counts, Marketplace MinIO, LiteLLM chat and embeddings, seeded Marketplace assets, applet publication to MinIO, and both Agno travel-agent calls.
They contain no Playwright test. When all sixteen are green, the mounted checkout and on-prem service chain are working together.
This is an installation/integration check, not an exhaustive product-quality test. For a focused failure, run the matching `pocitoOnPrem.*`
test through MCP and inspect its domain error arrays.

### 6. Stop or restart

Stop or restart the standalone container directly:

```sh
docker stop pocito-dev
docker start pocito-dev
```

## Image maintenance

Build on a connected/prepared machine and transfer the exact tested image:

```sh
npm run airgapped-export
```

The exporter rebuilds `wonder-pocito.bundle`, builds both Linux AMD64 image variants, exports them together, splits the compressed archive into
190 MiB parts and regenerates `solutions/pocito/on-prem/images/SHA256SUMS`. Run it from a connected checkout with Docker and Git installed.

Dependencies, OMP and the current-branch Git bundle are baked in; the entrypoint creates the persistent checkout from that bundle.
Rebuild after source, npm or Python lock changes. BuildKit secrets `npmrc` and `uvconfig` support private indexes without baking credentials in.
The image uses Debian 13, Node 24, npm 11.19.1, uv 0.12.7 and Python 3.12.12; projects accept compatible Python versions from 3.10.
Scan and test the exact image being transferred. Automatic whitening-gate acceptance is not guaranteed.

`.jb6/entry-points-default.js` imports the on-prem suite for containers without a Git identity.
`uploadRoomApplet` publishes to configured MinIO. Python servers share `marketplace-schema` from the checkout.
Use `uv lock --project <server-directory>` after Python manifest changes; startup never updates locks.
