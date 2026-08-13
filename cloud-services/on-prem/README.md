# Existing Kubernetes/OpenShift + MinIO

The scripts make no internet calls. Mirror the Wonder image into the client's registry and install `kubectl` plus MinIO's `mc` on the deployment machine.
The MinIO administrator must allow the Wonder web origin through global or per-bucket API CORS; MinIO's global default is `*`.

Create the four Wonder buckets with bucket-administrator credentials:

```sh
MINIO_ENDPOINT=https://minio-admin.client \
MINIO_ACCESS_KEY=... MINIO_SECRET_KEY=... \
bash cloud-services/on-prem/deploy-buckets.sh
```

Deploy the public and protected Wonder lambda services into the existing cluster:

```sh
WONDER_IMAGE=registry.client/wonder:VERSION \
MINIO_ENDPOINT=https://minio.internal.client \
MINIO_PUBLIC_ENDPOINT=https://minio.client \
MINIO_ACCESS_KEY=... MINIO_SECRET_KEY=... \
WONDER_ENV_FILE=cloud-services/express-server/.env.prod \
bash cloud-services/on-prem/deploy-lambdas.sh
```

The Kubernetes resources, probes, limits and OpenShift-compatible security context are in `wonder.yaml`; the script only creates the runtime secret,
injects `WONDER_IMAGE`, applies the manifest and waits for both rollouts.
Use a scoped MinIO service account here with runtime access to the four buckets, not the bucket-administrator credentials.
`MINIO_ENDPOINT` is used by pods; `MINIO_PUBLIC_ENDPOINT` is embedded in browser-facing and presigned URLs.
`wonder-protected` stays cluster-internal. Expose only `wonder-public` with the client's existing OpenShift Route or Kubernetes Ingress policy.
