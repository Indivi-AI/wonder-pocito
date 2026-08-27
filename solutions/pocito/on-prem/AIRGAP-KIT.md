# Wonder Docker air-gap kit

This AMD64 kit contains the exact Wonder, marketplace/AgentOS, minimal LiteLLM, and PostgreSQL/pgvector images. MinIO is external and not bundled.

An `-apps` kit (created with `create-docker-airgap-kit.sh --no-pinned`) carries only the wonder/marketplace images
and their bases — deploy it on a machine that already loaded litellm + pgvector from a previous full `-lean` kit
(`docker-up.sh` verifies they are present).

An `-aio` kit (`--aio`) carries ONE `wonder-aio` app image running all four servers (wonder, marketplace, agno,
litellm baked in its own venv) plus the pinned pgvector and minio images (`--aio --no-pinned` skips those). It has
no base images: in-gap code updates come from the `wonder-source` clone, which is mounted into the container —
edit and `docker compose restart aio`, no rebuilds. `docker-up.sh` runs it on Linux; `docker-up.ps1` on Windows.

A `-split` kit (`--separate`) is the same content as loose files — one `*.image.tar.gz` per image, `wonder.bundle`,
and the config/script files — so a gate that rejects the combined tar can judge each file separately. Carry every
file into ONE directory inside; the same `docker-up.sh` flow then works unchanged (it loads whatever image files
are present).

Kit arrived as `*.tar.part-*` files (created with `create-docker-airgap-kit.sh --parts N`)? Reassemble first:
`cat wonder-docker-airgap-*-lean.tar.part-* > kit.tar && sha256sum -c --ignore-missing wonder-docker-airgap-*-lean.tar.sha256`, then untar `kit.tar`.

On the Linux server:

```sh
cp .env.example .env
cp llm-lite-config.example.yaml llm-lite-config.yaml
# Fill SITE_HOST, external MINIO settings, LLM_MODEL, and the LiteLLM endpoint; type the key as LLM_API_KEY in .env.
./docker-up.sh
SITE_ENV_FILE=.env ./sim-check.sh
```

`docker-up.sh` verifies and loads the images, starts with `--pull never`, and never builds or contacts a registry.
It picks the kit's compose file from `manifest.env` (`KIT_COMPOSE`), auto-shifts the published-port block when
taken, and with `MINIO_ENDPOINT` left empty runs the kit's own minio under `--profile local-minio`. PostgreSQL
data persists in the `pgvector-data` volume. Lean/apps kits also include the dependency-base tags for offline
code-only rebuilds (Playwright excluded; the other Node test dependencies and test source remain available).

Both up scripts also `git clone wonder.bundle wonder-source` (+ `source.patch`) on first run: live-repo applet
serving needs the source as a real git clone, and the clone is where in-gap code edits happen. In aio kits it is
mounted as the running code (`compose.aio.yml`); in lean/apps kits `compose.liverepo.yml` mounts it into the
wonder container. Edits go live with `docker compose restart aio` (or `restart wonder`) — no image rebuilds.

On a Windows machine (aio kits only): install Docker Desktop (Linux containers, the default WSL2 backend) — no
git, bash, or WSL distro needed. From PowerShell in the kit directory:

```powershell
powershell -ExecutionPolicy Bypass -File .\docker-up.ps1   # first run creates .env + llm-lite-config.yaml to fill
```

A lean/apps kit on Windows instead runs unchanged inside a WSL2 Ubuntu shell (`wsl`), where `./docker-up.sh`
works as on any Linux box — keep the kit inside the WSL filesystem (e.g. `~/kit`), not under `/mnt/c`.
