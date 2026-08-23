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

If the checkout has no team git identity, run `git config user.email onprem@airgap` once
(maps the MCP dev tools to `.jb6/entry-points-onprem.js`).

## Getting the repo across

`npm run airgapped-export -- ../wonder-kit` (outside) builds a transfer kit: `wonder.bundle` (git bundle),
the runtime image, matching linux `node_modules`, and `SHA256SUMS` to verify after the copy.
