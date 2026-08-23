# Wonder on-prem — env + local server

One machine: this checkout, node 24, and a reachable MinIO. No Kubernetes.

## One-time MinIO setup

Create buckets `indiviai-wonder` and `wonder-code-packages` and allow anonymous read+write on both
(S3 Browser, or `mc anonymous set public <alias>/<bucket>`). MinIO CORS must allow the server origin
(the default `MINIO_API_CORS_ALLOW_ORIGIN=*` is fine).

## Configure and run

```sh
cp cloud-services/express-server/.env.onprem.template cloud-services/express-server/.env.onprem
vi cloud-services/express-server/.env.onprem   # usually only MINIO_ENDPOINT needs a real value
npm ci                                         # once
npm run onprem                                 # WONDER_ENV=onprem -> loads .env.onprem; server + MCP at http://localhost:3000
```

`WONDER_ENV` is the switch for which env file the local server loads: `dev` (default) loads `.env.dev`,
`onprem` loads `.env.onprem` — same folder, same mechanism.

## Use

Applets serve live from the checkout, no login: `http://localhost:3000/room/<roomId>/applet/<name>`

Smoke-test storage over MinIO, then publish, via MCP:

```sh
curl -s -X POST http://localhost:3000/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
  "params":{"name":"wFetch","arguments":{"url":"room://demo/usersRW/hello.json","method":"PUT","body":{"hello":"on-prem"}}}}'
curl -s -X POST http://localhost:3000/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
  "params":{"name":"wFetch","arguments":{"url":"room://demo/usersRW/hello.json"}}}'
curl -s -X POST http://localhost:3000/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":3,"method":"tools/call",
  "params":{"name":"uploadRoomApplet","arguments":{"roomId":"demo","entryCompFullId":"react-comp<react>YOUR_APPLET"}}}'
```

## Marketplace / AgentOS on-prem

No code changes — everything is env. In `solutions/idf/marketplace-server/.env` (sourced by `start-marketplace.sh`):

```dotenv
AGENT_OS_HOST=0.0.0.0            # reachable through NAT/port-forwarding, not only localhost
AGENT_OS_PORT=8046               # when 7777 is taken on this machine
MARKETPLACE_S3_STORAGE_CLASS=STANDARD_IA   # only if the S3 appliance wants a storage class; unset for MinIO
CORS_ALLOWED_ORIGINS=http://<host-users-browse-to>:3000
```

In `cloud-services/express-server/.env.onprem`, tell browsers where the marketplace is (as THEY reach it — e.g. the
NAT-mapped port, not the internal one):

```dotenv
MARKETPLACE_API_URL=http://<host-users-browse-to>:58046
```

The server injects it into every applet page as `globalThis.MARKETPLACE_API_URL`; without it, browsers try the page's
host on port 7777.

## Getting the repo across

`npm run airgapped-export -- ../wonder-kit` (outside) builds a transfer kit: `wonder.bundle` (git bundle),
the runtime image, matching linux `node_modules`, and `SHA256SUMS` to verify after the copy.
