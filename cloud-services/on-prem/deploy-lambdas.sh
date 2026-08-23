#!/usr/bin/env bash
set -euo pipefail

: "${WONDER_IMAGE:?Set WONDER_IMAGE to the image in the client registry}"
: "${MINIO_ENDPOINT:?Set the MinIO endpoint reachable from Kubernetes}"
: "${MINIO_PUBLIC_ENDPOINT:?Set the MinIO endpoint reachable from browsers}"
CLUSTER_CLI="${KUBE_CLI:-$(command -v oc || command -v kubectl)}"
NAMESPACE_ARGS=(); [[ -z "${NAMESPACE:-}" ]] || NAMESPACE_ARGS=(-n "$NAMESPACE")
MANIFEST="$(dirname "$0")/wonder.yaml"

SECRET_ARGS=(--from-literal=STORAGE_PROVIDER=minio --from-literal="MINIO_ENDPOINT=$MINIO_ENDPOINT"
  --from-literal="MINIO_PUBLIC_ENDPOINT=$MINIO_PUBLIC_ENDPOINT" --from-literal="MINIO_REGION=${MINIO_REGION:-us-east-1}"
  --from-literal="WONDER_STORAGE_URL=${MINIO_PUBLIC_ENDPOINT%/}" --from-literal="WONDER_CDN_URL=${MINIO_PUBLIC_ENDPOINT%/}/wonder-code-packages/cdn"
  --from-literal=WONDER_AUTH_MODE=none --from-literal=CORS_ALLOW_ALL=true
  --from-literal="S3_STORAGE_CLASS=${S3_STORAGE_CLASS:-STANDARD_IA}" --from-literal="S3_USE_PATH_STYLE=${S3_USE_PATH_STYLE:-true}")
[[ -z "${WONDER_SERVICE_URL:-}" ]] || SECRET_ARGS+=(--from-literal="WONDER_SERVICE_URL=$WONDER_SERVICE_URL")   # in-cluster lambda->lambda calls
if [[ -n "${WONDER_ENV_FILE:-}" ]]; then
  while IFS= read -r entry || [[ -n "$entry" ]]; do
    [[ -z "$entry" || "$entry" == \#* ]] || SECRET_ARGS+=(--from-literal="$entry")
  done < "$WONDER_ENV_FILE"
fi
"$CLUSTER_CLI" "${NAMESPACE_ARGS[@]}" create secret generic wonder-runtime "${SECRET_ARGS[@]}" --dry-run=client -o yaml \
  | "$CLUSTER_CLI" "${NAMESPACE_ARGS[@]}" apply -f -

sed "s|image: wonder:replace-me|image: $WONDER_IMAGE|" "$MANIFEST" | "$CLUSTER_CLI" "${NAMESPACE_ARGS[@]}" apply -f -
"$CLUSTER_CLI" "${NAMESPACE_ARGS[@]}" rollout status deployment/wonder-public --timeout="${ROLLOUT_TIMEOUT:-5m}"
