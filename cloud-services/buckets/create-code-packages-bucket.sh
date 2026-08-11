#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-indiviai}"
REGION="${REGION:-me-west1}"
BUCKET="${BUCKET:-wonder-code-packages}"
CORS_FILE="$(mktemp)"
trap 'rm -f "$CORS_FILE"' EXIT

if ! gsutil ls -b "gs://${BUCKET}" >/dev/null 2>&1; then
  gsutil mb -p "$PROJECT_ID" -c regional -l "$REGION" -b on "gs://${BUCKET}"
fi

gsutil uniformbucketlevelaccess set on "gs://${BUCKET}"
gsutil web set -m index.html -e 404.html "gs://${BUCKET}"
gsutil iam ch allUsers:objectViewer "gs://${BUCKET}"

printf '%s\n' '[{"maxAgeSeconds":3600,"method":["GET","HEAD"],"origin":["*"],"responseHeader":["Content-Type","Content-Length","ETag"]}]' > "$CORS_FILE"
gsutil cors set "$CORS_FILE" "gs://${BUCKET}"

echo "Configured gs://${BUCKET}: regional ${REGION}, website metadata, public objectViewer, and frontend CORS."
