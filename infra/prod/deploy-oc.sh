#!/usr/bin/env bash
# Deploy a Pocito release directory (written by export-prod.sh and transferred into the air gap) to OpenShift: ConfigMaps first, then the chart.
set -euo pipefail
release=${1:?Usage: deploy-oc.sh RELEASE_DIRECTORY [NAMESPACE]}
namespace=${2:-pocito}
cd "$release"
for file in customer-configmaps.yaml customer-values.yaml; do
  [[ -f $file ]] || { echo "Missing $file: copy $file.example, edit it for this customer (see README.md)" >&2; exit 1; }
done
shasum -a 256 -c SHA256SUMS
oc apply -n "$namespace" -f customer-configmaps.yaml
helm upgrade --install pocito ./pocito-*.tgz -n "$namespace" -f customer-values.yaml --wait --timeout 10m
oc get pods,svc,route -n "$namespace"
