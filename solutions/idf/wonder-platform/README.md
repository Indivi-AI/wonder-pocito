# Wonder Platform local setup

Run every command from the repository root unless a section says otherwise.

## Prerequisites

- Node.js 24 with npm.
- Python 3.12.
- The [MinIO server](https://min.io/docs/minio/macos/index.html). On macOS: `brew install minio/stable/minio`.

Keep dependencies reproducible: use `npm ci` for JavaScript and the pinned Python `requirements.txt` inside a virtual environment.
Do not install project libraries globally.

## First-time installation

```sh
npm ci
python3.12 -m venv solutions/idf/platform-v0/.venv
solutions/idf/platform-v0/.venv/bin/python -m pip install -r solutions/idf/marketplace-server/requirements.txt
touch cloud-services/express-server/.env.dev
```

Add `OPENAI_API_KEY` to `cloud-services/express-server/.env.dev` only when agent execution is needed:

```dotenv
OPENAI_API_KEY=your-key
```

Catalog browsing and editing do not require this key.

## Start the servers

Use three terminals.

### 1. MinIO

```sh
MINIO_ROOT_USER=wonder MINIO_ROOT_PASSWORD=wonder-minio-local \
  minio server "$HOME/.minio-data" --console-address :9001
```

MinIO uses `http://localhost:9000` for its S3 API and `http://localhost:9001` for its console.
`npm run start-min-io` is an equivalent shortcut when the binary is installed at `~/.local/bin/minio`.

### 2. Wonder web server

```sh
npm run local
```

This serves Wonder at `http://localhost:3000`.

### 3. Marketplace API and AgentOS

```sh
./solutions/idf/marketplace-server/start-marketplace.sh
```

This serves the marketplace API and AgentOS at `http://localhost:7777`.

## Open and verify

- [Wonder Platform UI](http://localhost:3000/jb6_packages/react/react-comp-view.html?cmpId=wonderPlatform&urlsToLoad=@solution/idf/marketplace-ui/wonder-platform.js)
- [Marketplace health](http://localhost:7777/healthz) — `object_store` should be `ok`.
- [Marketplace API docs](http://localhost:7777/docs)
- [MinIO console](http://localhost:9001) — user `wonder`, password `wonder-minio-local`.

## Rooms

Wonder forwards the room ID from each wUrl as `x-wonder-room` to the Python API. Direct HTTP clients can send the same header; omitting it
uses the backward-compatible `marketplace` room. Resources, users, audit events, presigned files, runtime files, and agent sessions are isolated
per room.

## Adding dependencies

- JavaScript: use `npm install <package>` so both `package.json` and `package-lock.json` are updated.
- Python: add a pinned version to `solutions/idf/marketplace-server/requirements.txt`, then run the first-time Python install command again.
- External binaries or services: document the official install command here and provide a repository startup script when the setup is repeated.

Commit manifests and lockfiles. Never commit `node_modules`, virtual environments, `.env.dev`, credentials, or MinIO data.
