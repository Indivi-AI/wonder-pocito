# Wonder Platform

A marketplace + agents platform: the `wonderPlatform` browser applet (`solutions/pocito/marketplace-ui/`) backed by five services.

| Service | Role | Local dev | Deployed (published on `SITE_HOST`) |
|---|---|---|---|
| wonder server | serves applets live from the repo, `/wfetch`, `/mcp`, `/llmProxy` | :3000 | :58045 |
| marketplace | resource CRUD, versions, audit, presign (`marketplace_server.py`) | :7777 | :58046 |
| agno (AgentOS) | agent runs (`agno_server.py`, same package/image; shares only S3 with the marketplace) | :7778 | :58049 |
| llm-lite (LiteLLM) | the one OpenAI-compatible gateway to the LLM | not needed (cloud proxy) | :58047 |
| MinIO | all storage: marketplace objects, rooms, applet code | :9000 | the site's global MinIO |

Everything talks through the same published URLs browsers use; applet pages receive `MARKETPLACE_API_URL`,
`AGNO_API_URL` and `LLM_PROXY_URL` from the wonder server's env, so the browser calls each server directly.
Ports above are defaults — every value comes from env files (below).

Fastest team setup: `./wonder-up.sh` at the repo root (see the root `README.md`) — docker, one command, working tree
mounted live. The paths below are the bare-process alternative and the deployment flows.

## 1. Local development — internet machine, from zero

Prereqs: Node 24, Python 3.12, the [MinIO binary](https://min.io/docs/minio/macos/index.html) at `~/.local/bin/minio`.

```sh
npm ci
python3.12 -m venv solutions/pocito/marketplace-server/.venv
solutions/pocito/marketplace-server/.venv/bin/pip install -r solutions/pocito/marketplace-server/requirements.txt
cp solutions/pocito/marketplace-server/.env.example solutions/pocito/marketplace-server/.env   # OPENAI_API_KEY only for real agent runs
touch cloud-services/express-server/.env.dev
```

Run, one terminal each:

```sh
npm run start-min-io                                        # MinIO :9000 (console :9001, wonder / wonder-minio-local)
npm run local                                               # wonder :3000
./solutions/pocito/marketplace-server/start-marketplace.sh     # marketplace CRUD :7777
./solutions/pocito/marketplace-server/start-agno.sh            # agno (AgentOS) agent runs :7778
```

Verify: [platform UI](http://localhost:3000/jb6_packages/react/react-comp-view.html?cmpId=wonderPlatform&urlsToLoad=@solution/pocito/marketplace-ui/wonder-platform.js),
[marketplace health](http://localhost:7777/healthz) and [agno health](http://localhost:7778/healthz) (`object_store: ok`),
[API docs](http://localhost:7777/docs).
Tests: `node --import ./nodejs-importmap.js jb6/testing/run-tests-cli.js .jb6/entry-points-pocito.js --pattern=wonderPlatform`

## 2. Build images + simulate the on-prem — internet machine

```sh
cloud-services/on-prem/build-images.sh --base    # dependency bases, once per deps change
cloud-services/on-prem/build-images.sh           # app images, offline by design; prints IMAGE_TAG
cd cloud-services/on-prem && cp .env.site.template .env.site   # fill SITE_HOST=$(hostname), IMAGE_TAG, LLM_UPSTREAM_KEY
docker compose --env-file .env.site -f docker-compose.yml -f compose.airgap.yml --profile local-minio up -d
./sim-check.sh
```

The overlay blocks internet for app services (llm-lite alone reaches the real LLM), so anything that would break
inside the gap breaks here first. Browse `http://$SITE_HOST:58045/room/<room>/applet/<name>` — never localhost.

## 3. Deploy inside the air gap

Whiten `wonder-images.tar.gz` (`docker save` of the built images) plus the `cloud-services/on-prem/` directory, then on the site:

```sh
docker load < wonder-images.tar.gz
cp .env.site.template .env.site      # SITE_HOST=<site hostname>, IMAGE_TAG, MINIO_ENDPOINT=<global MinIO URL>, keys
docker compose --env-file .env.site up -d      # wonder + marketplace + agno + llm-lite; storage is the global MinIO
./sim-check.sh
```

Full runbook, whitening kit, in-gap rebuilds, OpenShift notes: `cloud-services/on-prem/README.md`.

## Env files — what lives where

| File | Machine | Holds |
|---|---|---|
| `cloud-services/express-server/.env.dev` | dev | optional `OPENAI_API_KEY` for cloud LLM flows |
| `solutions/pocito/marketplace-server/.env` | dev | marketplace `OPENAI_*` provider (from `.env.example`) |
| `cloud-services/on-prem/.env.site` | sim and site, own gitignored copy each | all deployment facts: `SITE_HOST`, ports, `IMAGE_TAG`, MinIO + LLM endpoints and keys |

Images are env-free; secrets are never committed and never baked into an image.

## Reference

- `solutions/pocito/marketplace-server/marketplace-server.md` — marketplace + agno server behavior, env names, tests.
- `cloud-services/on-prem/README.md` — the outside/inside deployment runbook.
