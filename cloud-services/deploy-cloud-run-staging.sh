#!/bin/bash

export PROJECT_ID="indiviai"
export REGION="me-west1"
export REPOSITORY="cloud-run-source-deploy"
export IMAGE_NAME="wonder"
PUBLIC_SERVICE="wonder-server-staging"
PUBLIC_SA="wonder-public-sa@${PROJECT_ID}.iam.gserviceaccount.com"
SIGNED_SA="wonder-protected-rooms-sa@${PROJECT_ID}.iam.gserviceaccount.com"

set -e
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "${REPO_ROOT}"
npm run server-secrets:pull:prod || { echo "Failed to pull secrets. Aborting."; exit 1; }

echo "--- Authenticating Docker with GCP ---"
gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet

echo "--- Building Production Docker Image for linux/amd64 ---"
docker build --platform linux/amd64 --build-arg BUILD_TARGET=prod -t ${IMAGE_NAME} -f ./cloud-services/wonder.docker .

export IMAGE_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest"
echo "--- Tagging image as: ${IMAGE_TAG} ---"
docker tag ${IMAGE_NAME} ${IMAGE_TAG}

echo "--- Pushing image to Artifact Registry ---"
docker push ${IMAGE_TAG}

echo "--- ✅ Build, Push, and Cleanup Complete ---"
echo "--- Starting Deployment to Cloud Run ---"

if [ "$1" == "--all" ]; then
  gcloud run deploy wonder-signed-rooms-staging --image ${IMAGE_TAG} --platform managed --region ${REGION} \
    --no-allow-unauthenticated --memory 2Gi --service-account="${SIGNED_SA}" --set-env-vars="WONDER_SERVICE=signed"
  gcloud run services add-iam-policy-binding wonder-signed-rooms-staging --region="${REGION}" \
    --member="serviceAccount:${PUBLIC_SA}" --role="roles/run.invoker"
fi

SIGNED_URL=$(gcloud run services describe wonder-signed-rooms-staging --region="${REGION}" --format='value(status.url)')
echo "--- Signed lambda URL: ${SIGNED_URL} ---"

gcloud run deploy ${PUBLIC_SERVICE} --image ${IMAGE_TAG} --platform managed --region ${REGION} \
  --allow-unauthenticated --memory 2Gi --service-account="${PUBLIC_SA}" \
  --set-env-vars="WONDER_SERVICE=public,SIGNED_LAMBDA_URL=${SIGNED_URL}"
