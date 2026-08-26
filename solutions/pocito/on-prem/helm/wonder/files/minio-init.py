"""One-shot init for the sim's local MinIO: create the wonder buckets with anonymous read/write.
On a real site the global MinIO is managed by its administrator - this never runs there (local-minio profile only)."""
import json
import os
import time

import boto3
from botocore.exceptions import ClientError

endpoint = os.environ['MINIO_ENDPOINT']
client = boto3.client('s3', endpoint_url=endpoint, aws_access_key_id=os.environ['S3_ACCESS_KEY'],
  aws_secret_access_key=os.environ['S3_SECRET_KEY'], region_name='us-east-1')
for attempt in range(60):
    try:
        client.list_buckets()
        break
    except Exception:
        time.sleep(2)
else:
    raise SystemExit(f'minio not reachable at {endpoint}')
for bucket in [name for name in os.environ['WONDER_BUCKETS'].split(',') if name]:
    try:
        client.create_bucket(Bucket=bucket)
    except ClientError as error:
        if error.response['Error']['Code'] not in {'BucketAlreadyOwnedByYou', 'BucketAlreadyExists'}:
            raise
    client.put_bucket_policy(Bucket=bucket, Policy=json.dumps({'Version': '2012-10-17', 'Statement': [
      {'Effect': 'Allow', 'Principal': {'AWS': ['*']}, 'Action': ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket'],
       'Resource': [f'arn:aws:s3:::{bucket}', f'arn:aws:s3:::{bucket}/*']}]}))
    print('bucket ready with anonymous rw:', bucket)
