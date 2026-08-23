# Air-gapped OpenShift/Kubernetes + MinIO

All configuration lives in **one file**: copy `onprem.env.template` to `onprem.env`, fill it, and every
on-prem script picks it up automatically (already-exported shell variables win over the file;
`ONPREM_ENV_FILE=/path` points the scripts at a file elsewhere). `onprem.env` holds credentials — it is
gitignored and must never be committed.

Wonder uses four buckets — `indiviai-wonder`, `indiviai-wonder-protected`, `wonder-code-packages`,
`logs-bucket-me-west1`. `deploy-buckets.sh` creates them with anonymous `s3:*` policies and seeds the CDN.
MinIO CORS must allow the Wonder origin (`MINIO_API_CORS_ALLOW_ORIGIN=*` is fine).

## 1. Outside the air gap - build the transfer kit

```sh
git status            # must be clean
npm run airgapped-export -- ../wonder-kit
```

The kit contains `wonder.bundle`, the runtime image, matching `node_modules`, the install/run scripts,
`onprem-env.sh` and `onprem.env.template`. Transfer it on approved media and verify `SHA256SUMS`.

## 2. Inside - fill the template once

```sh
cp wonder-kit/onprem.env.template wonder-kit/onprem.env   # edit: endpoints, WONDER_IMAGE, WONDER_SERVICE_URL, admin keys
```

## 3. Inside - install

With the kube context selected and the internal registry logged in:

```sh
bash wonder-kit/install-airgap.sh wonder-kit /opt/wonder
```

This verifies checksums, restores the checkout to `/opt/wonder` (git identity pinned to `onprem` so the
MCP tools work), copies `onprem.env` into the checkout, unpacks `node_modules`, pushes the image, creates
buckets + CDN, and deploys the `wonder-public` service with `WONDER_AUTH_MODE=none` (all rooms public,
applets run anonymously).

Expose the service at the host you wrote in `WONDER_SERVICE_URL`:

```sh
oc expose service/wonder-public --hostname=<WONDER_SERVICE_URL host>
curl -k $WONDER_SERVICE_URL/health        # {"status":"ok","mode":"public"}
```

## 4. Inside - run the MCP publisher

```sh
bash wonder-kit/run-mcp.sh /opt/wonder    # MCP at http://localhost:3000/mcp
```

Publish with the canonical tools — `STORAGE_PROVIDER=minio` (set by the script) routes everything to MinIO:
`uploadRoomApplet({roomId, entryCompFullId})`, `uploadRoomLambda({compFullId, roomWUrl})`, `wFetch` for data.
Applets serve at `$WONDER_SERVICE_URL/room/<roomId>/applet/<name>`.

## Updating

New code: re-export outside, transfer, `git -C /opt/wonder fetch kit/wonder.bundle <branch> && git -C /opt/wonder reset --hard FETCH_HEAD`,
re-run `install-airgap.sh` (env file is already in place), then `updateLambdasAndApplets({roomId})`.
Data changes need no redeploy — just `wFetch` writes.
