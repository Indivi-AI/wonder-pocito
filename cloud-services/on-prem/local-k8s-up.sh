#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
tag="${1:?usage: $0 IMAGE_TAG}"
set -a; source .env.site; set +a
for value in LLM_UPSTREAM_BASE LLM_PROXY_KEY S3_ACCESS_KEY S3_SECRET_KEY LLM_LITE_IMAGE MINIO_IMAGE; do
  [ -n "${!value:-}" ] || { echo "$value is required in .env.site" >&2; exit 1; }
done
[[ "$LLM_UPSTREAM_BASE" != *api.openai.com* || -n "${LLM_UPSTREAM_KEY:-}" ]] \
  || { echo 'LLM_UPSTREAM_KEY is required for the OpenAI upstream' >&2; exit 1; }
kind get clusters | grep -qx wonder || kind create cluster --name wonder --config kind-config.yaml
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.15.1/deploy/static/provider/kind/deploy.yaml
kubectl wait -n ingress-nginx --for=condition=Available deployment/ingress-nginx-controller --timeout=5m
kubectl wait -n ingress-nginx --for=condition=Complete job/ingress-nginx-admission-create --timeout=5m
kubectl wait -n ingress-nginx --for=jsonpath='{.subsets[0].addresses[0].ip}' endpoints/ingress-nginx-controller-admission --timeout=5m
load_image() {
  local image="$1"
  docker image inspect "$image" >/dev/null 2>&1 || docker pull "$image"
  docker save "$image" | docker exec -i wonder-control-plane ctr --namespace=k8s.io images import --digests --snapshotter=overlayfs - >/dev/null
}
for image in "wonder-server:$tag" "marketplace-server:$tag" "$LLM_LITE_IMAGE" "$MINIO_IMAGE"; do
  load_image "$image"
done
kubectl create namespace wonder --dry-run=client -o yaml | kubectl apply -f -
kubectl -n wonder create secret generic wonder-secrets --dry-run=client -o yaml \
  --from-literal=S3_ACCESS_KEY="$S3_ACCESS_KEY" --from-literal=S3_SECRET_KEY="$S3_SECRET_KEY" \
  --from-literal=LLM_PROXY_KEY="$LLM_PROXY_KEY" --from-literal=LLM_UPSTREAM_KEY="$LLM_UPSTREAM_KEY" | kubectl apply -f -
helm upgrade --install wonder helm/wonder -n wonder -f helm/wonder/values-local.yaml --wait --timeout 10m \
  --set-string images.wonder="wonder-server:$tag" --set-string images.marketplace="marketplace-server:$tag" \
  --set-string images.litellm="$LLM_LITE_IMAGE" --set-string images.minio="$MINIO_IMAGE" \
  --set-string llm.upstreamBase="$LLM_UPSTREAM_BASE"
kubectl rollout restart -n wonder deployment/wonder-wonder deployment/wonder-marketplace deployment/wonder-agno deployment/wonder-litellm
kubectl rollout status -n wonder deployment/wonder-wonder deployment/wonder-marketplace deployment/wonder-agno deployment/wonder-litellm --timeout=5m
kubectl get pods,services,ingress -n wonder
