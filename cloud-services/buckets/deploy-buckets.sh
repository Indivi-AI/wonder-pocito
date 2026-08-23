#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-indiviai}"
REGION="${REGION:-me-west1}"
PUBLIC_SA="${PUBLIC_SA:-wonder-public-sa@${PROJECT_ID}.iam.gserviceaccount.com}"
PROTECTED_SA="${PROTECTED_SA:-wonder-protected-rooms-sa@${PROJECT_ID}.iam.gserviceaccount.com}"
GROUP="${GROUP:-group:employees@indivi.ai}"

create() { gsutil ls -b "gs://$1" >/dev/null 2>&1 || gsutil mb -p "$PROJECT_ID" -l "$REGION" -b on "gs://$1"; }
for bucket in indiviai-wonder indiviai-wonder-protected wonder-code-packages logs-bucket-me-west1 \
  indiviai-wonder-users-contact-info indiviai-tos-bucket; do
  create "$bucket"
  gsutil uniformbucketlevelaccess set on "gs://$bucket"
done
gsutil iam ch allUsers:objectViewer allUsers:objectCreator gs://indiviai-wonder
gsutil pap set enforced gs://indiviai-wonder-protected
gsutil iam ch "${GROUP}:objectAdmin" "serviceAccount:${PROTECTED_SA}:objectAdmin" gs://indiviai-wonder-protected
gsutil iam ch allUsers:objectViewer "${GROUP}:objectAdmin" "serviceAccount:${PUBLIC_SA}:objectViewer" gs://wonder-code-packages
gsutil iam ch allUsers:objectCreator "${GROUP}:objectViewer" gs://logs-bucket-me-west1
gsutil retention set 100y gs://logs-bucket-me-west1
for bucket in indiviai-wonder-users-contact-info indiviai-tos-bucket; do
  gsutil pap set enforced "gs://$bucket"
  gsutil iam ch "${GROUP}:objectAdmin" "serviceAccount:${PUBLIC_SA}:objectAdmin" "gs://$bucket"
done
