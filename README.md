# Pocito on Windows

## Environment configuration

Connected development reads `solutions/pocito/.env.onprem`. Air-gapped Docker receives the same settings from `pocito.env` through `--env-file`.

- Internet-connected macOS/Linux development: copy `.env.onprem.example` to `.env.onprem`, use `npm run pocito-dev`, and set
  `MINIO_STORAGE_CLASS=STANDARD` for stock local MinIO.
- Air-gapped on-prem development: prepare `C:\pocito\pocito.env` from `.env.onprem.example`, use `npm run pocito-dev-airgapped`, and keep
  `MINIO_STORAGE_CLASS=STANDARD_IA` for the on-prem object store.

## Prerequisites

- Docker Desktop is running Linux containers.
- Install VS Code and its **Dev Containers** extension.
- MinIO, PostgreSQL with pgvector, and FLAPI are reachable.
- Put `pocito.env` and `litellm.yaml` in `C:\pocito`.

`pocito.env` uses `NAME=value` lines:

```dotenv
MINIO_ENDPOINT=http://host.docker.internal:9000
MINIO_ACCESS_KEY=wonder
MINIO_SECRET_KEY=wonder-minio-local
MINIO_STORAGE_CLASS=STANDARD_IA
MARKETPLACE_S3_BUCKET=indiviai-wonder
POCITO_PORT=3000
POCITO_DATA_DIR=/home/pocito/.local/share/pocito
PI_CODING_AGENT_DIR=/home/pocito/.local/share/pocito/omp
PGVECTOR_URL=postgresql+psycopg://wonder:wonder-pg-local@host.docker.internal:5432/wonder
FLAPI_BASE_URL=http://host.docker.internal:6001
FLAPI_TOKEN=<TOKEN>
FLAPI_USERNAME=625navehp
LITELLM_HOST=
LITELLM_CONFIG=/run/pocito/litellm.yaml
```

## Run

Run in PowerShell:

```powershell
cd C:\pocito
docker volume create pocito-workspace
docker volume create pocito-home
docker run -it --name pocito-dev `
  --add-host host.docker.internal:host-gateway `
  -p 2222:2222 -p 3000:3000 -p 4000:4000 -p 6001:6001 -p 7777:7777 -p 7778:7778 `
  --env-file "C:\pocito\pocito.env" `
  --mount "type=bind,source=C:\pocito\litellm.yaml,target=/run/pocito/litellm.yaml,readonly" `
  --mount type=volume,src=pocito-workspace,dst=/workspace/repo `
  --mount type=volume,src=pocito-home,dst=/home/pocito `
  pocito-dev:linux-amd64 /bin/bash
```

`--add-host` lets the container reach services running on Windows as `host.docker.internal`.

## Start

At the container prompt:

```sh
npm run pocito-dev-airgapped
```

The launcher terminates an existing process on each bundled service port before restarting that service. A service or readiness failure warns
without stopping the other services.

Open `http://localhost:3000/wonder/studio/tests.html?pattern=pocitoOnPrem&includeHeavy`.

In VS Code, choose **Dev Containers: Attach to Running Container**, select `pocito-dev`, and open `/workspace/repo`.

To run the coding agent, open another VS Code terminal:

```sh
omp models litellm
omp --model litellm/<MODEL_ALIAS>
```

To reopen the container later:

```powershell
docker start -ai pocito-dev
```

See the [detailed development guide](solutions/pocito/local-dev-readme.md) for maintenance and troubleshooting.
