# Air-gapped OpenShift + MinIO

Wonder uses these four buckets:

- `indiviai-wonder`
- `indiviai-wonder-protected`
- `wonder-code-packages`
- `logs-bucket-me-west1`

For the current unsigned deployment, allow anonymous `s3:*` access to each bucket and its objects. MinIO CORS must allow all origins.
If `mc` and bucket-admin credentials are available, `deploy-buckets.sh` applies this policy. Otherwise configure it in S3 Browser.

Outside the air gap, commit the desired revision and create the transfer kit:

```sh
npm run airgapped-export -- ../wonder-kit
```

The air-gap image omits DuckDB. Transfer the resulting directory, verify `SHA256SUMS`, restore `wonder.bundle`, and load the image.

In the selected OpenShift project, push the image to the internal registry and deploy it:

```sh
cd /mnt/users/yiftach/wonder
export WONDER_IMAGE=image-registry.openshift-image-registry.svc:5000/PROJECT/wonder:VERSION
export MINIO_ENDPOINT=https://minio.internal
export MINIO_PUBLIC_ENDPOINT=https://minio.internal
export KUBE_CLI=oc
bash cloud-services/on-prem/deploy-cdn.sh
bash cloud-services/on-prem/deploy-lambdas.sh
oc expose service/wonder-public
oc get route wonder-public
```

`deploy-lambdas.sh` uses the current project unless `NAMESPACE` is set. It deploys one unsigned public service with all-origin CORS.
No MinIO credentials are passed to the runtime because all four buckets are anonymous.

Run the on-prem MCP publisher from the restored checkout:

```sh
export WONDER_SERVICE_URL=https://ROUTE_HOST
export WONDER_IMAGE=image-registry.openshift-image-registry.svc:5000/PROJECT/wonder:VERSION
bash cloud-services/on-prem/run-mcp.sh /mnt/users/yiftach/wonder
```

Use the canonical `uploadRoomApplet` MCP tool; `STORAGE_PROVIDER=minio` routes it to the on-prem buckets.
