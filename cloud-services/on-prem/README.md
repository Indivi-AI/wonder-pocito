# Wonder on-prem — fill one file, copy these commands

Config lives in **one file**: `onprem.env` (from `onprem.env.template`). Every script loads it automatically;
variables already exported in your shell win over the file. It holds the MinIO keys, so it is gitignored — never commit it.

## 0. Outside the air gap — build the transfer kit

```sh
git status                                   # must be clean
npm run airgapped-export -- ../wonder-kit
```

Move `../wonder-kit` inside on approved media.

## 1. Fill the one config file

```sh
cp wonder-kit/onprem.env.template wonder-kit/onprem.env
vi wonder-kit/onprem.env                     # 6 required values; every line is documented in the file
```

## 2. Install (kube context selected, internal registry logged in)

```sh
bash wonder-kit/install-airgap.sh wonder-kit /opt/wonder
```

Verifies checksums, restores the checkout to `/opt/wonder`, pushes the image, creates the four buckets
(`indiviai-wonder`, `indiviai-wonder-protected`, `wonder-code-packages`, `logs-bucket-me-west1`) with anonymous
policies, seeds the CDN, and deploys `wonder-public` with `WONDER_AUTH_MODE=none` (all rooms public, applets anonymous).

## 3. Expose and check (host = `WONDER_SERVICE_URL` from onprem.env)

```sh
oc expose service/wonder-public --hostname=wonder.client
curl -k https://wonder.client/health                       # {"status":"ok","mode":"public"}
curl -sk https://minio.client/wonder-code-packages/cdn/tailwindcss-3.4.17.js -o /dev/null -w '%{http_code}\n'   # 200
```

Browsers must resolve and trust both hosts; MinIO CORS must allow the Wonder origin (`MINIO_API_CORS_ALLOW_ORIGIN=*` is fine).

## 4. Start the MCP publisher

```sh
bash wonder-kit/run-mcp.sh /opt/wonder                     # MCP endpoint: http://localhost:3000/mcp
```

## 5. Publish

Smoke-test with a data write + read (no code needed):

```sh
curl -s -X POST http://localhost:3000/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
  "params":{"name":"wFetch","arguments":{"url":"room://demo/usersRW/hello.json","method":"PUT","body":{"hello":"air gap"}}}}'
curl -s -X POST http://localhost:3000/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
  "params":{"name":"wFetch","arguments":{"url":"room://demo/usersRW/hello.json"}}}'
```

Publish an applet and a lambda (the comp must be loaded by the on-prem toolset — `solutions/idf/**` is preloaded):

```sh
curl -s -X POST http://localhost:3000/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":3,"method":"tools/call",
  "params":{"name":"uploadRoomApplet","arguments":{"roomId":"demo","entryCompFullId":"react-comp<react>YOUR_APPLET"}}}'
curl -s -X POST http://localhost:3000/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":4,"method":"tools/call",
  "params":{"name":"uploadRoomLambda","arguments":{"compFullId":"data<common>YOUR_LAMBDA","roomWUrl":"room://demo"}}}'
```

Open `https://wonder.client/room/demo/applet/<cmpId>` — loads with no login, lambdas run anonymously.

## Updating

```sh
npm run airgapped-export -- ../wonder-kit-v2               # outside, after committing; transfer it inside
git -C /opt/wonder fetch wonder-kit-v2/wonder.bundle master && git -C /opt/wonder reset --hard FETCH_HEAD
bash wonder-kit-v2/install-airgap.sh wonder-kit-v2 /opt/wonder    # onprem.env is already in the checkout
curl -s -X POST http://localhost:3000/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":5,"method":"tools/call",
  "params":{"name":"updateLambdasAndApplets","arguments":{"roomId":"demo"}}}'
```

Data/content changes need no redeploy — just `wFetch` writes.

## Troubleshooting

| symptom | fix |
|---|---|
| `sha256sum ... FAILED` on install | corrupted transfer — re-copy the kit |
| rollout timeout | `oc logs deploy/wonder-public` — usually bad `MINIO_ENDPOINT` or registry pull |
| PUT returns 400 | `MINIO_ENDPOINT` points at the :9001 console — use the S3 API port |
| PUT returns 403 / 404 NoSuchBucket | anonymous policy / bucket missing — rerun `install-airgap.sh` |
| applet page 404 `no applet ...` | publish again with `uploadRoomApplet`; list with `wFetch` url `room://demo/applets/` |
| page loads forever, import errors in devtools | browser can't reach `MINIO_PUBLIC_ENDPOINT`: DNS, untrusted TLS, or MinIO CORS |
