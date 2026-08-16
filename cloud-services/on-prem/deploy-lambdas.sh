#!/usr/bin/env bash
set -euo pipefail

: "${WONDER_IMAGE:?Set WONDER_IMAGE to the image in the client registry}"
: "${MINIO_ENDPOINT:?Set the MinIO endpoint reachable from Kubernetes}"
: "${MINIO_PUBLIC_ENDPOINT:?Set the MinIO endpoint reachable from browsers}"
: "${MINIO_ACCESS_KEY:?Set MINIO_ACCESS_KEY}"
: "${MINIO_SECRET_KEY:?Set MINIO_SECRET_KEY}"
NAMESPACE="${NAMESPACE:-wonder}"
MANIFEST="$(dirname "$0")/wonder.yaml"

kubectl get namespace "$NAMESPACE" >/dev/null 2>&1 || kubectl create namespace "$NAMESPACE"
SECRET_ARGS=(--from-literal=STORAGE_PROVIDER=minio --from-literal="MINIO_ENDPOINT=$MINIO_ENDPOINT"
  --from-literal="MINIO_PUBLIC_ENDPOINT=$MINIO_PUBLIC_ENDPOINT" --from-literal="MINIO_ACCESS_KEY=$MINIO_ACCESS_KEY"
  --from-literal="MINIO_SECRET_KEY=$MINIO_SECRET_KEY" --from-literal="MINIO_REGION=${MINIO_REGION:-us-east-1}"
  --from-literal="WONDER_STORAGE_URL=${MINIO_PUBLIC_ENDPOINT%/}" --from-literal="WONDER_CDN_URL=${MINIO_PUBLIC_ENDPOINT%/}/wonder-code-packages/cdn"
  --from-literal=WONDER_AUTH_MODE=none --from-literal=PROTECTED_LAMBDA_AUTH=none
  --from-literal=PROTECTED_LAMBDA_URL=http://wonder-protected:8080)
if [[ -n "${WONDER_ENV_FILE:-}" ]]; then
  while IFS= read -r entry || [[ -n "$entry" ]]; do
    [[ -z "$entry" || "$entry" == \#* ]] || SECRET_ARGS+=(--from-literal="$entry")
  done < "$WONDER_ENV_FILE"
fi
kubectl -n "$NAMESPACE" create secret generic wonder-runtime "${SECRET_ARGS[@]}" --dry-run=client -o yaml | kubectl apply -f -

sed "s|image: wonder:replace-me|image: $WONDER_IMAGE|" "$MANIFEST" | kubectl -n "$NAMESPACE" apply -f -
for mode in protected public; do kubectl -n "$NAMESPACE" rollout status "deployment/wonder-$mode" --timeout="${ROLLOUT_TIMEOUT:-5m}"; done
