#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-me-south-1}"
BUCKETS=(indiviai-wonder indiviai-wonder-protected wonder-code-packages logs-bucket-me-west1 \
  indiviai-wonder-users-contact-info indiviai-tos-bucket)
for bucket in "${BUCKETS[@]}"; do
  aws s3api head-bucket --bucket "$bucket" 2>/dev/null || aws s3api create-bucket --bucket "$bucket" --region "$AWS_REGION" \
    --create-bucket-configuration "LocationConstraint=${AWS_REGION}" >/dev/null
  aws s3api put-bucket-ownership-controls --bucket "$bucket" \
    --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
done
for bucket in indiviai-wonder wonder-code-packages logs-bucket-me-west1; do
  aws s3api put-public-access-block --bucket "$bucket" \
    --public-access-block-configuration BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false
done
public_policy() { jq -n --arg bucket "$1" --arg actions "$2" '{Version:"2012-10-17",Statement:[{Effect:"Allow",Principal:"*",
  Action:($actions|split(",")),Resource:("arn:aws:s3:::"+$bucket+"/*")}]}' ; }
aws s3api put-bucket-policy --bucket indiviai-wonder \
  --policy "$(public_policy indiviai-wonder 's3:GetObject,s3:PutObject')"
aws s3api put-bucket-policy --bucket wonder-code-packages \
  --policy "$(public_policy wonder-code-packages 's3:GetObject')"
aws s3api put-bucket-policy --bucket logs-bucket-me-west1 \
  --policy "$(public_policy logs-bucket-me-west1 's3:PutObject')"
aws s3api put-bucket-versioning --bucket logs-bucket-me-west1 --versioning-configuration Status=Enabled
aws s3api put-object-lock-configuration --bucket logs-bucket-me-west1 \
  --object-lock-configuration 'ObjectLockEnabled=Enabled,Rule={DefaultRetention={Mode=COMPLIANCE,Years=100}}'
