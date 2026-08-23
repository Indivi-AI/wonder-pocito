#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="indiviai"
REGION="me-west1"
REPOSITORY="cloud-run-source-deploy"
IMAGE_NAME="node24-wonder-base"
IMAGE_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest"
ROOT="$(git rev-parse --show-toplevel)"

gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
docker build --platform linux/amd64 -t "${IMAGE_NAME}" -f "$ROOT/cloud-services/wonder-base.docker" "$ROOT"
docker tag "${IMAGE_NAME}" "${IMAGE_TAG}"
docker push "${IMAGE_TAG}"

echo "--- ✅ Base image pushed: ${IMAGE_TAG} ---"
