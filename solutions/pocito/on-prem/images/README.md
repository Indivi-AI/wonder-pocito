# Air-gapped development container

The Linux AMD64 image supplies dependencies, sudo and OMP 18.1.2. Source lives in a native Linux host Git checkout, bind-mounted at `/workspace/repo`.
The Git bundle is an offline delivery artifact. Clone and update it on the host; the container runs the checkout without cloning or updating it.
MinIO, PostgreSQL/pgvector and FLAPI remain external services. LiteLLM and Agno can run in this container or at configured external endpoints.

### 1. Export on the connected machine

Run from the source checkout. Commit the code you intend to transfer first: bundles contain committed history, not working-tree changes or ignored files.
Export the current branch with its full history; no prerequisite bundle is needed.

```sh
npm run airgapped-export
npm run airgapped-export -- --code
npm run airgapped-export -- --images
```

Choose one command: the default exports code and images; `--code` exports only code without invoking Docker; `--images` builds and exports only images.
Every mode writes this standalone `README.md` into `solutions/pocito/on-prem/images/`, using the air-gapped section of the local development README.

Transfer these files from that directory:

- First installation: `README.md`, `wonder-pocito.bundle`, `SHA256SUMS.code`, `SHA256SUMS`, and every `pocito-dev-linux-amd64.tar.gz.part-*` file.
- Code update: `README.md`, `wonder-pocito.bundle`, and `SHA256SUMS.code`.
- Image update: `README.md`, `SHA256SUMS`, and every `pocito-dev-linux-amd64.tar.gz.part-*` file.

Code and image checksums are independent. A code-only export leaves existing image archives and their checksums unchanged.
The image export contains only the sudo image, tagged `pocito-dev:latest`, split into 190 MiB parts, each below 200 MB.
The image uses `pocito` as both username and sudo password. Code updates reuse the installed image while dependencies remain compatible.

### 2. Prepare paths and load images on native Linux

Install Docker, Git, curl, gzip and coreutils ahead of time. The host does not need Node, npm or Python.
Docker must run on this host and your user must be able to use it. Use separate checkout paths, container names, ports and volumes for each developer.
Set these variables in the host shell used for the remaining commands; change the kit path to the directory containing the transferred files.

```sh
export POCITO_KIT="$HOME/pocito-kit"
export POCITO_CHECKOUT="$HOME/pocito-workspace"
export POCITO_CONFIG="$HOME/.config/pocito"
export POCITO_IMAGE=pocito-dev:latest
export POCITO_CONTAINER=pocito-dev
export POCITO_HTTP_PORT=58000
export POCITO_HOME_VOLUME=pocito-home
export POCITO_DATA_VOLUME=pocito-data
cd "$POCITO_KIT"
sha256sum -c SHA256SUMS
set -o pipefail
cat pocito-dev-linux-amd64.tar.gz.part-* | gzip -t
cat pocito-dev-linux-amd64.tar.gz.part-* | gzip -dc | docker load
```

These commands use Bash. Skip image loading for a code-only delivery when the compatible image is already installed.

### 3. Create the host checkout

For migration from an existing workspace volume, use section 10 instead of cloning a fresh checkout.

```sh
cd "$POCITO_KIT"
sha256sum -c SHA256SUMS.code
export POCITO_BRANCH=$(git bundle list-heads wonder-pocito.bundle | sed -n 's/^[^ ]* refs\/heads\///p')
git clone --origin bundle --branch "$POCITO_BRANCH" "$POCITO_KIT/wonder-pocito.bundle" "$POCITO_CHECKOUT"
git -C "$POCITO_CHECKOUT" bundle verify "$POCITO_KIT/wonder-pocito.bundle"
git -C "$POCITO_CHECKOUT" status --short
```

Keep the checkout at this path when replacing bundles. Its `bundle` remote points at the kit file; it is read-only and cannot receive pushes.
Use a normal clone with its own `.git` directory. Host worktrees whose `.git` files point outside the mount require additional mounts.
Do not install or copy `node_modules` into this checkout: Node uses the image's `/workspace/node_modules` through parent-directory resolution.
Python services use the environments under `/opt/pocito/venvs`; no dependency download happens at air-gapped startup.

The container user `pocito` has UID 1000. If your host user has another UID, install your distribution's `acl` package ahead of time and grant both
users access to the existing files and newly created files. Run this once after cloning or migrating:

```sh
if [ "$(id -u)" != 1000 ]; then
  sudo setfacl -R -m "u:$(id -u):rwX,u:1000:rwX" "$POCITO_CHECKOUT"
  sudo find "$POCITO_CHECKOUT" -type d -exec setfacl -m "d:u:$(id -u):rwx,d:u:1000:rwx" {} +
fi
```

### 4. Prepare runtime configuration

Run these copy commands only for initial configuration. Edit the files for your environment before starting the container.
The environment template in the checkout is the source of truth. The files below stay on the host, outside the checkout and bundle.

```sh
mkdir -p "$POCITO_CONFIG"
chmod 700 "$POCITO_CONFIG"
cp "$POCITO_CHECKOUT/solutions/pocito/.env.onprem.example" "$POCITO_CONFIG/pocito.env"
cp "$POCITO_CHECKOUT/solutions/pocito/on-prem/litellm/config.yaml" "$POCITO_CONFIG/litellm.yaml"
cat >> "$POCITO_CONFIG/pocito.env" <<'ENV'
POCITO_PORT=3000
POCITO_DATA_DIR=/var/lib/pocito
PI_CODING_AGENT_DIR=/var/lib/pocito/omp
ENV
chmod 600 "$POCITO_CONFIG/pocito.env" "$POCITO_CONFIG/litellm.yaml"
vi "$POCITO_CONFIG/pocito.env"
vi "$POCITO_CONFIG/litellm.yaml"
if [ "$(id -u)" != 1000 ]; then
  setfacl -m u:1000:r "$POCITO_CONFIG/litellm.yaml"
fi
```

Set these values in `pocito.env`:

| Setting | Required configuration |
| --- | --- |
| `MINIO_ENDPOINT` | Reachable MinIO URL; for a host service use `http://host.docker.internal:9000` |
| `PGVECTOR_URL` | PostgreSQL URL, e.g. `postgresql+psycopg://wonder:wonder-pg-local@host.docker.internal:5432/wonder` |
| `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | Your MinIO credentials; uncomment and set when overriding the local defaults |
| `MARKETPLACE_S3_BUCKET` | Your room bucket; default `indiviai-wonder` |
| `MINIO_STORAGE_CLASS` | `STANDARD` for stock MinIO; otherwise your supported class |
| `FLAPI_BASE_URL`, `FLAPI_TOKEN`, `FLAPI_USERNAME` | Required external FLAPI URL and credentials |
| `LITELLM_HOST` | External LiteLLM origin, or empty for the bundled gateway |
| `LITELLM_CONFIG` | `/run/pocito/litellm.yaml` when using bundled LiteLLM |
| `LITELLM_API_KEY` | Gateway API key if authentication is enabled |
| `AGNO_API_URL` | External Agno origin, or empty to start bundled Agno |

For bundled LiteLLM, change the copied YAML's OpenAI examples to your on-prem model endpoints, model names and keys.
Provide `chat` and `embeddings` aliases. Embedding dimensions must agree with the configured model and existing knowledge indexes.
For external LiteLLM, the YAML is unused; the run command can keep its mount or omit it.
Model-provider credentials belong in runtime LiteLLM configuration, never in a bundle, build argument or image layer.

The commands below use bridge networking. `localhost` inside the container refers to the container itself.
Host services must listen on an address reachable from Docker's bridge; loopback-only host listeners cannot be reached through `host.docker.internal`.
For dedicated native Linux hosts, `--network host` can replace `--add-host` and `-p`; then use host `localhost` endpoints and app port 3000 directly.
Do not combine host networking with port remapping.

### 5. Verify external infrastructure

Have your on-prem administrators provide MinIO, PostgreSQL with the `vector` extension, and FLAPI before starting Pocito.
MinIO needs the `indiviai-wonder` room bucket (or your override) and the `wonder-code-packages` code bucket, with the access policy your applets need.
For an existing PostgreSQL service, its administrator can enable the extension with:

```sh
psql "$PGVECTOR_ADMIN_URL" -c 'CREATE EXTENSION IF NOT EXISTS vector;'
```

Set `PGVECTOR_ADMIN_URL` to an administrator connection URL using the `postgresql://` scheme; `psql` is an optional host administration tool.
MinIO/PostgreSQL images and their data are separate from this export. Existing infrastructure does not need to be recreated for code updates.

### 6. Start the container and services

```sh
docker volume create "$POCITO_HOME_VOLUME"
docker volume create "$POCITO_DATA_VOLUME"
docker run -d --name "$POCITO_CONTAINER" --platform linux/amd64 \
  --add-host host.docker.internal:host-gateway \
  -p "$POCITO_HTTP_PORT:3000" \
  --env-file "$POCITO_CONFIG/pocito.env" \
  --mount "type=bind,src=$POCITO_CHECKOUT,dst=/workspace/repo" \
  --mount "type=bind,src=$POCITO_CONFIG/litellm.yaml,dst=/run/pocito/litellm.yaml,readonly" \
  --mount "type=volume,src=$POCITO_HOME_VOLUME,dst=/home/pocito" \
  --mount "type=volume,src=$POCITO_DATA_VOLUME,dst=/var/lib/pocito" \
  "$POCITO_IMAGE" npm run pocito-dev-airgapped
if [ "$(id -u)" != 1000 ]; then
  docker exec "$POCITO_CONTAINER" git config --global --add safe.directory /workspace/repo
fi
docker exec "$POCITO_CONTAINER" sh -ec 'test -w /workspace/repo; git status --short'
docker logs -f "$POCITO_CONTAINER"
```

Ctrl+C leaves the detached container running. The entrypoint requires the checkout and executes the supplied command without changing Git state.
The launcher starts Pocito, Marketplace and configured bundled Agno/LiteLLM services. It requires external FLAPI and uses image dependencies.
Before starting a bundled service it terminates processes on that container port. Inspect startup warnings and readiness failures in the logs.
Home and application data persist in named volumes; source and local edits persist in the host checkout.
Marketplace, Agno and LiteLLM browser requests use Pocito's same-origin routes, so only the app port needs publishing.

### 7. Inspect, develop and verify

```sh
curl -f "http://localhost:$POCITO_HTTP_PORT/health"
docker exec "$POCITO_CONTAINER" git rev-parse HEAD
docker inspect "$POCITO_CONTAINER" --format '{{range .Mounts}}{{println .Type .Source .Destination}}{{end}}'
docker exec -it "$POCITO_CONTAINER" /bin/bash
docker exec -it "$POCITO_CONTAINER" omp models litellm
docker exec -it "$POCITO_CONTAINER" omp --model litellm/coder-default
```

Exit the interactive Bash shell before running the subsequent host commands. Choose a model alias returned by `omp models litellm`.
`omp` invokes the launcher and MiniMax streaming adapter from the mounted checkout; launcher changes take effect in the next OMP session.
The OMP binary remains in the image. Its adapter displays MiniMax `<mm:think>...</mm:think>` content as reasoning in new responses.
For an older image with a baked launcher, invoke `node solutions/pocito/on-prem/dev/omp.mjs` inside the checkout until the image is upgraded.

Attach VS Code with **Dev Containers: Attach to Running Container** and open `/workspace/repo` as user `pocito`.
From another machine open `http://LINUX_HOST:58000/applet/wonderAgents`, replacing the hostname and port with your settings.
Run the installation suite at `http://LINUX_HOST:58000/wonder/studio/tests.html?pattern=pocitoOnPrem&includeHeavy`.
Inspect each test's domain logger errors as well as its result. The default Agno health check permits degraded pgvector when object storage is healthy.
For strict vector health use `?test=pocitoOnPrem.serviceAgnoStrictPgvector`; functional checks use `?pattern=pocitoIntegration`.
Existing room data under `files/rooms` is not included in the Git bundle; transfer required development data separately when migrating.

### 8. Update code using the same image

Export with `npm run airgapped-export -- --code` on the source machine. Replace the bundle, `SHA256SUMS.code` and README in `POCITO_KIT` on Linux.
Run in the host shell with the variables from section 2. The checks stop before applying an update to a dirty checkout or the wrong branch.

```sh
(
  set -eu
  cd "$POCITO_KIT"
  sha256sum -c SHA256SUMS.code
  POCITO_BRANCH=$(git bundle list-heads wonder-pocito.bundle | sed -n 's/^[^ ]* refs\/heads\///p')
  docker stop "$POCITO_CONTAINER"
  cd "$POCITO_CHECKOUT"
  git bundle verify "$POCITO_KIT/wonder-pocito.bundle"
  git status --short
  test -z "$(git status --porcelain)"
  test "$(git branch --show-current)" = "$POCITO_BRANCH"
  git fetch "$POCITO_KIT/wonder-pocito.bundle" "refs/heads/$POCITO_BRANCH"
  git log --oneline HEAD..FETCH_HEAD
  git diff --stat HEAD FETCH_HEAD
)
```

Review the fetched changes and dependency manifests. Then apply the update in the host shell:

```sh
(
  set -eu
  cd "$POCITO_CHECKOUT"
  test -z "$(git status --porcelain)"
  git merge --ff-only FETCH_HEAD
  docker start "$POCITO_CONTAINER"
)
docker logs -f "$POCITO_CONTAINER"
```

If a check fails, the stopped container stays stopped and your local changes remain available. Commit or stash local work deliberately before retrying.
Divergent branches require your own merge/rebase decision. No forced resets or automatic stashes are performed.
Run the health and installation checks again after updating. An image build is needed only for dependency/runtime changes or image startup tooling.
For rollback, stop the container, preserve local work, select the earlier compatible Git revision with normal Git commands, then restart.

### 9. Stop, restart or replace the image

```sh
docker stop "$POCITO_CONTAINER"
docker start "$POCITO_CONTAINER"
```

To install a new image, stop the container, verify/load the new image parts with section 2, then remove only the stopped container:

```sh
docker stop "$POCITO_CONTAINER"
docker rm "$POCITO_CONTAINER"
```

Repeat the `docker run` command in section 6 with the same checkout and home/data volumes. This also applies after changing `--env-file` values.
A plain `docker start` reuses the old container's image and environment; it does not adopt a newly loaded image or changed environment file.
Rebuild images after npm/Python dependency changes, OMP binary upgrades, or Dockerfile/bootstrap changes. Normal source updates use code-only export.
BuildKit secrets `npmrc` and `uvconfig` support private package indexes when passed to `docker build --secret` on the connected machine.

### 10. Migrate an existing workspace volume

Before removing the old container, preserve its mount names and copy the complete checkout, including `.git`, ignored files and local edits.
Use the actual old container name in `POCITO_CONTAINER`; the destination must not already exist.

```sh
docker inspect "$POCITO_CONTAINER" --format '{{range .Mounts}}{{println .Type .Name .Source .Destination}}{{end}}'
docker stop "$POCITO_CONTAINER"
mkdir "$POCITO_CHECKOUT"
docker cp "$POCITO_CONTAINER:/workspace/repo/." "$POCITO_CHECKOUT/"
git -C "$POCITO_CHECKOUT" status --short
```

Set `POCITO_HOME_VOLUME` and `POCITO_DATA_VOLUME` to the existing volumes shown by inspect, including an anonymous volume name when applicable.
Preserve the old `POCITO_DATA_DIR` and `PI_CODING_AGENT_DIR` values when data was stored under the home volume.
Copy an old environment file outside the checkout into `POCITO_CONFIG` rather than replacing it with the initial setup template.
If the copied checkout contains `node_modules`, move it outside the checkout before starting; the new container uses its own dependencies.
Apply the permissions from section 3, prepare the runtime configuration, then remove the stopped container with `docker rm` and run section 6.
Keep the old workspace volume until Git state, local files and application behavior have been verified. The update commands fetch directly from the
new kit path, so they also work when the migrated checkout still has an old `image-bundle` remote.
