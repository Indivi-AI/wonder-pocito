#!/bin/bash
set -euo pipefail

SERVICE="wonder-server-staging"
DOMAIN="staging.indivi.ai"
REGION="me-west1"
NEG="${SERVICE}-neg"
BACKEND="${SERVICE}-backend"
URL_MAP="wonder-map"

gcloud compute network-endpoint-groups create "${NEG}" --region="${REGION}" \
  --network-endpoint-type=serverless --cloud-run-service="${SERVICE}"
gcloud compute backend-services create "${BACKEND}" --global --load-balancing-scheme=EXTERNAL_MANAGED
gcloud compute backend-services add-backend "${BACKEND}" --global \
  --network-endpoint-group="${NEG}" --network-endpoint-group-region="${REGION}"
gcloud compute url-maps add-path-matcher "${URL_MAP}" --path-matcher-name="${SERVICE}-pm" \
  --default-service="${BACKEND}" --new-hosts="${DOMAIN}"
