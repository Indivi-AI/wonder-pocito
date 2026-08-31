# Pocito local development

`npm run pocito-dev` starts Pocito, Marketplace, Agno, LiteLLM and FLAPI, not MinIO or PostgreSQL.
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
  for bucket in indiviai-wonder wonder-code-packages wonder-marketplace; do
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
The launcher installs missing npm dependencies and creates locked Python 3.12.12 environments.

```sh
cp -n solutions/pocito/.env.onprem.example solutions/pocito/.env.onprem
cp -n solutions/pocito/on-prem/litellm/config.yaml solutions/pocito/on-prem/litellm/config.local.yaml
npm run pocito-dev
```

Before launching, edit `config.local.yaml` with model endpoints and keys; keep real credentials out of the tracked template.
`chat` and `embeddings` are OpenAI-compatible aliases. Replace the OpenAI deployments with your on-prem providers.
Agent manifests with explicit models must use configured aliases. Embedding dimensions must match the deployment;
changing embedding model/dimensions requires rebuilding affected knowledge indexes.

Open your existing applet at `http://localhost:3000/room/<room>/applet/<applet>`.
Ctrl+C stops app processes only; Docker infrastructure remains running.

## Configuration

Precedence: defaults, `.env.onprem`, shell/container environment, then derived per-service URLs.
No Wonder env file is loaded. Model credentials belong only in LiteLLM YAML, not `.env.onprem`.

| Setting | Value / behavior |
| --- | --- |
| `MINIO_ENDPOINT` | Required; template uses `http://localhost:9000` |
| `PGVECTOR_URL` | Required; template uses `postgresql+psycopg://wonder:wonder-pg-local@localhost:5432/wonder` |
| `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | Defaults: `wonder`, `wonder-minio-local` |
| `MINIO_STORAGE_CLASS` | `STANDARD`; stock MinIO does not support `STANDARD_IA` |
| `POCITO_DATA_DIR` | `.local-data` relative to this directory; Python environments and marketplace data, not applet files |
| `OPENAI_EMBEDDING_DIMENSIONS` | `1536` |

All storage endpoints are external to the launcher, even `localhost`. Agno chat sessions are currently in memory.
App ports: Pocito `3000`, Marketplace `7777`, Agno `7778`, LiteLLM `4000`, FLAPI `6001`.
Optional port overrides are listed in `.env.onprem.example`.
The launcher preserves npm configuration and forwards pip's primary index to uv unless uv has its own index configuration.
For advanced Artifactory authentication, configure uv directly. Missing Python binaries need an approved
`UV_PYTHON_INSTALL_MIRROR` or preinstalled Python 3.12.12; package indexes alone do not supply Python or tokenizer assets.

## Dependency-only Linux x86-64 image

Build on a connected/prepared machine and transfer the image if needed. Run with Linux host networking so the same
localhost storage endpoints and browser-facing URLs work inside and outside the dev container:

```sh
docker build --platform linux/amd64 -f solutions/pocito/on-prem/on-premp-dev.dockerfile -t pocito-dev .
docker run --rm -it --platform linux/amd64 --network host -e POCITO_BIND_HOST=127.0.0.1 \
  --mount type=bind,src="$PWD",dst=/workspace \
  --mount type=volume,src=pocito-data,dst=/var/lib/pocito pocito-dev
```

Start the separate infrastructure containers and edit both ignored config files first.
Only app dependencies are baked in; no application code, MinIO or PostgreSQL. The checkout supplies source and applet files.
Image-populated npm volumes preserve Linux dependencies; Python environments live outside the checkout.
Rebuild after dependency lock changes. BuildKit secrets `npmrc` and `uvconfig` support private indexes without baking credentials in.

## Maintenance

`.jb6/entry-points-pocito.js` explicitly imports the MCP application; tests use `entry-points-pocito-tests.js` separately.
`uploadRoomApplet` publishes to configured MinIO. Local applet serving remains filesystem-based; production serving is separate.
Python servers share `marketplace-schema` from the checkout. Use `uv lock --project <server-directory>` after manifest changes;
startup never updates locks. A healthy LiteLLM process does not prove provider connectivity: exercise chat and embeddings before the demo.
