# Existing Kubernetes/OpenShift + MinIO

Outside the air gap, commit the required source and build one transfer directory:

```sh
bash cloud-services/on-prem/export-airgap.sh /transfer/wonder-kit
```

The export builds Linux dependencies and the runtime image. It requires Git, Docker or Podman, gzip, tar and internet access.
Set `CONTAINER_ENGINE=podman` or `PLATFORM=linux/arm64` when needed.

Inside the air gap, log in to the internal image registry and select the target Kubernetes context. Install Git, Docker or Podman, `kubectl`, `mc`
and tar. The existing MinIO CORS policy must allow the Wonder web origin, then run:

```sh
export WONDER_IMAGE=registry.client/wonder:VERSION
export MINIO_ENDPOINT=https://minio.internal.client
export MINIO_ADMIN_ENDPOINT=https://minio-admin.client
export MINIO_PUBLIC_ENDPOINT=https://minio.client
export MINIO_ACCESS_KEY=... MINIO_SECRET_KEY=...
export MINIO_ADMIN_ACCESS_KEY=... MINIO_ADMIN_SECRET_KEY=...
bash /transfer/wonder-kit/install-airgap.sh /transfer/wonder-kit /opt/wonder
```

The `MINIO_ADMIN_*` values are optional and default to the runtime values. The installer verifies the transfer, restores a Git checkout and matching
native dependencies, pushes the image, creates and seeds the buckets, applies `wonder.yaml`, and waits for both deployments.

Start the MCP publisher from the restored checkout:

```sh
export WONDER_SERVICE_URL=https://wonder.client
bash /transfer/wonder-kit/run-mcp.sh /opt/wonder
```

The MCP helper runs the restored checkout in the transferred image, so the inside host does not need Node or npm. Use `uploadRoomAppletOnPrem`,
`uploadRoomLambdaOnPrem` and `updateLambdasAndAppletsOnPrem`. The deployment uses unsigned rooms and does not expose bucket listing. Expose only
`wonder-public`; browsers must resolve and trust the TLS certificates for Wonder and `MINIO_PUBLIC_ENDPOINT`.
