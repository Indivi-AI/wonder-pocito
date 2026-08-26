"""Shared storage layer for the marketplace and agno servers: room-scoped manifests in one S3 bucket.
An envelope is the stored JSON object {data, version, created_at, updated_at} wrapping each manifest -
the only state the two servers share, so both must read and write it through this one module."""
import base64
import hashlib
import json
import logging
import os
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
from pathlib import Path, PurePosixPath

import yaml
import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError
from fastapi import HTTPException

ROOT = Path(__file__).parent
DEFAULT_ROOM = 'marketplace'
KNOWLEDGE_INDEX_VERSION = 'pgvector-v3'
ROOM_CONTEXT = ContextVar('room', default=DEFAULT_ROOM)
logger = logging.getLogger(__name__)


def now():
    return datetime.now(timezone.utc).isoformat()


def safe_name(value):
    if not value or value in {'.', '..'} or '/' in value or '\\' in value:
        raise ValueError('name must be one safe path segment')
    return value


def safe_path(value):
    path = PurePosixPath(value)
    if not value or path.is_absolute() or '..' in path.parts:
        raise ValueError('path must be relative and cannot contain ..')
    return str(path)


class S3ObjectStore:
    def __init__(self, bucket=None, client=None):
        self.bucket = bucket or os.getenv('MARKETPLACE_S3_BUCKET', 'wonder-marketplace')
        self.storage_class = os.getenv('MARKETPLACE_S3_STORAGE_CLASS', '')
        endpoint = os.getenv('MARKETPLACE_S3_ENDPOINT', 'http://127.0.0.1:9000')
        create_client = lambda url: boto3.client('s3', endpoint_url=url,
          aws_access_key_id=os.getenv('MARKETPLACE_S3_ACCESS_KEY', 'wonder'),
          aws_secret_access_key=os.getenv('MARKETPLACE_S3_SECRET_KEY', 'wonder-minio-local'), region_name='us-east-1',
          config=BotoConfig(connect_timeout=5, read_timeout=20, retries={'max_attempts': 3, 'mode': 'standard'}))
        self.client = client or create_client(endpoint)
        public_endpoint = os.getenv('MARKETPLACE_S3_PUBLIC_ENDPOINT', endpoint)
        self.presign_client = self.client if client or public_endpoint == endpoint else create_client(public_endpoint)
        self.client.meta.events.register('before-send.s3.*', self.drop_expect_header)
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except ClientError as error:
            if error.response.get('Error', {}).get('Code') not in {'404', 'NoSuchBucket'}:
                raise
            self.client.create_bucket(Bucket=self.bucket)

    def drop_expect_header(self, request, **kwargs):
        """A zero-byte PUT with Expect: 100-continue desyncs MinIO keep-alive and stalls the next PUT for 30 seconds."""
        if 'Expect' in request.headers:
            del request.headers['Expect']

    def put(self, key, content, content_type=None, if_absent=False):
        try:
            self.client.put_object(Bucket=self.bucket, Key=safe_path(key), Body=content,
              **({'ContentType': content_type} if content_type else {}), **({'IfNoneMatch': '*'} if if_absent else {}),
              **({'StorageClass': self.storage_class} if self.storage_class else {}))
        except ClientError as error:
            if error.response.get('Error', {}).get('Code') in {'PreconditionFailed', '412'}:
                raise FileExistsError(key)
            raise

    def get(self, key):
        try:
            return self.client.get_object(Bucket=self.bucket, Key=safe_path(key))['Body'].read()
        except ClientError as error:
            if error.response.get('Error', {}).get('Code') in {'NoSuchKey', '404'}:
                raise FileNotFoundError(key)
            raise

    def list(self, prefix):
        pages = self.client.get_paginator('list_objects_v2').paginate(Bucket=self.bucket, Prefix=prefix)
        return [item['Key'] for page in pages for item in page.get('Contents', [])]

    def delete_prefix(self, prefix):
        keys = [{'Key': key} for key in self.list(prefix)]
        for offset in range(0, len(keys), 1000):
            self.client.delete_objects(Bucket=self.bucket, Delete={'Objects': keys[offset:offset + 1000]})

    def delete(self, key):
        self.client.delete_object(Bucket=self.bucket, Key=safe_path(key))

    def healthy(self):
        try:
            self.client.head_bucket(Bucket=self.bucket)
            return True
        except Exception:
            return False

    def presign(self, key, method, expires, content_type=None):
        operation = 'get_object' if method == 'GET' else 'put_object'
        params = {'Bucket': self.bucket, 'Key': key} | ({'ContentType': content_type} if content_type else {})
        return self.presign_client.generate_presigned_url(operation, Params=params, ExpiresIn=expires)


class MarketplaceRepository:
    """All state lives in the object store: envelopes are JSON objects shaped {data, version, created_at, updated_at}."""

    def __init__(self, objects):
        self.objects = objects

    def read_json(self, key):
        return json.loads(self.objects.get(key).decode())

    def write_json(self, key, value, if_absent=False):
        self.objects.put(key, json.dumps(value, ensure_ascii=False).encode(), 'application/json', if_absent)

    def resource_key(self, room, kind, name, path):
        return f'{safe_name(room)}/{kind}s/{safe_name(name)}/{path}'

    def normalize_envelope(self, envelope):
        data = dict(envelope['data'])
        legacy_name = data.pop('hebrew_display_name', None)
        if 'id' not in data:
            data['id'], data['display_name'] = data['display_name'], legacy_name or data['display_name']
        return envelope | {'data': data}

    def envelope(self, room, kind, name):
        try:
            return self.normalize_envelope(self.read_json(self.resource_key(room, kind, name, 'manifest.json')))
        except FileNotFoundError:
            raise HTTPException(404, f'{kind}/{name} not found')

    def manifest_keys(self, room, kind):
        prefix = f'{safe_name(room)}/{kind}s/'
        return [key for key in self.objects.list(prefix) if key.endswith('/manifest.json') and key.count('/') == 3]

    def object_key(self, room, kind, name, version, path):
        return self.resource_key(room, kind, name, f'v{version}/{safe_path(path)}')

    def read_artifact(self, room, kind, name, artifact):
        return self.objects.get(self.object_key(room, kind, name, artifact['version'], artifact['path']))

    def artifacts(self, room, kind, version, payload, current=None):
        current, writes = dict(current or {}), {}
        if kind == 'skill':
            if 'skill_md' in payload:
                writes['SKILL.md'] = ((payload.pop('skill_md') or '').encode(), 'text/markdown')
            if 'assets' in payload:
                for key in [key for key in current if key.startswith('assets/')]:
                    current.pop(key)
                for asset in payload.pop('assets') or []:
                    writes[f"assets/{safe_path(asset['path'])}"] = (base64.b64decode(asset['content_b64']), asset.get('mime_type'))
        elif kind == 'tool' and 'code_files' in payload:
            for key in [key for key in current if key.startswith('code/')]:
                current.pop(key)
            for source in payload.pop('code_files') or []:
                writes[f"code/{safe_path(source['path'])}"] = (source['content'].encode(), 'text/x-python')
        elif kind in {'plugin', 'agent'}:
            if 'readme' in payload:
                writes['README.md'] = ((payload.pop('readme') or '').encode(), 'text/markdown')
            if 'config' in payload:
                writes['config.yaml'] = (yaml.safe_dump(payload['config'], allow_unicode=True, sort_keys=False).encode(), 'text/yaml')
        for path, (content, mime_type) in writes.items():
            self.objects.put(self.object_key(room, kind, payload['id'], version, path), content, mime_type)
            current[path] = {'path': path, 'version': version, 'mime_type': mime_type}
        return current

    def public(self, room, kind, envelope, include_assets=False, include_code=False):
        data = dict(self.normalize_envelope(envelope)['data'])
        artifacts, result = data.pop('_artifacts', {}), data
        result |= {'version': envelope['version'], 'created_at': envelope['created_at'], 'updated_at': envelope['updated_at']}
        if kind == 'skill':
            skill = artifacts.get('SKILL.md')
            result['skill_md'] = self.read_artifact(room, kind, result['id'], skill).decode() if skill else ''
            result['assets'] = [self.asset(room, kind, result['id'], item, include_assets) for key, item in artifacts.items()
              if key.startswith('assets/')]
        if kind == 'tool':
            result['tags'] = result.get('tags', [])
            result['code_files'] = [self.code(room, kind, result['id'], item, include_code) for key, item in artifacts.items()
              if key.startswith('code/')]
        if kind in {'plugin', 'agent'}:
            readme = artifacts.get('README.md')
            result['readme'] = self.read_artifact(room, kind, result['id'], readme).decode() if readme else ''
        return result

    def asset(self, room, kind, name, item, content):
        result = {'path': item['path'][7:], 'mime_type': item.get('mime_type')}
        return result | ({'content_b64': base64.b64encode(self.read_artifact(room, kind, name, item)).decode()} if content else {})

    def code(self, room, kind, name, item, content):
        result = {'path': item['path'][5:]}
        return result | ({'content': self.read_artifact(room, kind, name, item).decode()} if content else {})

    def list(self, room, kind):
        def read_manifest(key):
            try:
                return self.public(room, kind, self.read_json(key))
            except (AttributeError, FileNotFoundError, KeyError, TypeError, ValueError) as error:
                logger.warning('Ignoring corrupt marketplace manifest %s: %s', key, error)
        return [item for key in self.manifest_keys(room, kind) if (item := read_manifest(key)) is not None]

    def get(self, room, kind, name, include_assets=False, include_code=False):
        return self.public(room, kind, self.envelope(room, kind, name), include_assets, include_code)

    def create(self, room, kind, payload):
        data, timestamp = dict(payload), now()
        name = data['id']
        key = self.resource_key(room, kind, name, 'manifest.json')
        if self.objects.list(key):
            raise HTTPException(409, f'{kind}/{name} already exists')
        data['_artifacts'] = self.artifacts(room, kind, 1, data)
        try:
            self.write_json(key, {'data': data, 'version': 1, 'created_at': timestamp, 'updated_at': timestamp}, if_absent=True)
        except FileExistsError:
            if self.envelope(room, kind, name).get('data') != data:
                raise HTTPException(409, f'{kind}/{name} already exists')
        self.audit(room, kind, name, 'create', 1, data, timestamp)
        return self.get(room, kind, name)

    def update(self, room, kind, name, changes):
        envelope, timestamp = self.envelope(room, kind, name), now()
        previous, version = envelope['data'], envelope['version'] + 1
        if changes.get('id') not in {None, name}:
            raise HTTPException(422, 'id cannot rename a resource')
        changes.pop('id', None)
        merged = previous | changes
        merged['id'] = name
        merged['_artifacts'] = self.artifacts(room, kind, version, merged, previous.get('_artifacts'))
        self.write_json(self.resource_key(room, kind, name, f"versions/{envelope['version']:08d}.json"), envelope)
        self.write_json(self.resource_key(room, kind, name, 'manifest.json'),
          {'data': merged, 'version': version, 'created_at': envelope['created_at'], 'updated_at': timestamp})
        self.audit(room, kind, name, 'update', version, changes, timestamp)
        return self.get(room, kind, name)

    def delete(self, room, kind, name):
        envelope = self.envelope(room, kind, name)
        if kind == 'knowledge':
            for content in self.contents(room, name):
                self.enqueue_content(room, name, content['id'], 'delete')
        self.audit(room, kind, name, 'delete', envelope['version'], {}, now())
        self.objects.delete_prefix(self.resource_key(room, kind, name, ''))

    def audit_prefix(self, room, kind, name):
        return f'{safe_name(room)}/audit/{kind}/{safe_name(name)}/'

    def audit(self, room, kind, name, action, version, data, timestamp):
        prefix = self.audit_prefix(room, kind, name)
        event = {'action': action, 'version': version, 'data': data, 'ts': timestamp}
        self.write_json(f'{prefix}{len(self.objects.list(prefix)):08d}.json', event)

    def audits(self, room, kind, name):
        events = []
        for key in self.objects.list(self.audit_prefix(room, kind, name)):
            try:
                events.append(self.read_json(key))
            except json.JSONDecodeError:
                pass
        return events

    def versions(self, room, kind, name):
        self.envelope(room, kind, name)
        keys = self.objects.list(self.resource_key(room, kind, name, 'versions/'))
        return [self.public(room, kind, self.read_json(key), include_assets=True, include_code=True) for key in keys]

    def version(self, room, kind, name, version):
        try:
            envelope = self.read_json(self.resource_key(room, kind, name, f'versions/{version:08d}.json'))
        except FileNotFoundError:
            raise HTTPException(404, f'{kind}/{name} version {version} not found')
        result = self.public(room, kind, envelope, include_assets=True, include_code=True)
        if kind == 'tool':
            result.pop('tags', None)
        return result

    def file(self, room, kind, name, path):
        item = self.envelope(room, kind, name)['data'].get('_artifacts', {}).get(safe_path(path))
        if not item:
            raise HTTPException(404, f'{kind}/{name}/{path} not found')
        try:
            return self.read_artifact(room, kind, name, item), item.get('mime_type')
        except FileNotFoundError:
            raise HTTPException(404, f'{kind}/{name}/{path} not found')

    def references(self, room, kind, name):
        config = self.get(room, kind, name).get('config') or {}
        refs = [('plugin', value) for value in config.get('plugins', [])] + [('skill', value) for value in config.get('skills', [])]
        refs += [('tool', value) for value in config.get('tools', [])] + [('agent', value) for value in config.get('sub_agents', [])]
        refs += [('knowledge', value) for value in config.get('knowledge_bases', [])]
        checked = []
        for ref_kind, ref_name in refs:
            try:
                self.envelope(room, ref_kind, ref_name)
                exists = True
            except HTTPException:
                exists = False
            checked.append({'resource_type': ref_kind, 'name': ref_name, 'exists': exists})
        return {'valid': all(item['exists'] for item in checked), 'references': checked,
          'missing': [item for item in checked if not item['exists']]}

    def content_key(self, room, knowledge, content, path):
        return self.resource_key(room, 'knowledge', knowledge, f'contents/{safe_name(content)}/{path}')

    def contents(self, room, knowledge):
        self.envelope(room, 'knowledge', knowledge)
        prefix = self.resource_key(room, 'knowledge', knowledge, 'contents/')
        keys = [key for key in self.objects.list(prefix) if key.endswith('/manifest.json')]
        return [self.public_content(self.read_json(key)) for key in keys]

    def job_key(self, room, content, revision=None):
        prefix = f'_system/knowledge-jobs/{safe_name(room)}/{safe_name(content)}-'
        return f'{prefix}{hashlib.sha256(revision.encode()).hexdigest()[:16]}.json' if revision else prefix

    def enqueue_content(self, room, knowledge, content, action, revision=None):
        timestamp = now()
        revision = revision or timestamp
        job = {'room': room, 'knowledge_id': knowledge, 'content_id': content, 'action': action,
          'revision': revision, 'status': 'pending', 'attempts': 0, 'retry_at': timestamp,
          'index_version': KNOWLEDGE_INDEX_VERSION, 'created_at': timestamp, 'updated_at': timestamp}
        self.write_json(self.job_key(room, content, revision), job)
        return job

    def content_jobs(self):
        jobs = []
        for key in self.objects.list('_system/knowledge-jobs/'):
            parts = key.split('/')
            if len(parts) == 4 and parts[1] == 'knowledge-jobs' and parts[3].endswith('.json'):
                try:
                    jobs.append(self.read_json(key) | {'_job_key': key})
                except (FileNotFoundError, json.JSONDecodeError):
                    pass
        timestamp = datetime.now(timezone.utc)
        return sorted((job for job in jobs if job['attempts'] < 5 and
          (job['status'] in {'pending', 'failed'} and datetime.fromisoformat(job['retry_at']) <= timestamp or
           job['status'] == 'processing' and datetime.fromisoformat(job['lease_until']) <= timestamp)),
          key=lambda job: (job['created_at'], job['content_id']))

    def bootstrap_content_jobs(self):
        for key in self.objects.list(''):
            parts = key.split('/')
            if len(parts) != 6 or parts[1] != 'knowledges' or parts[3] != 'contents' or parts[5] != 'manifest.json':
                continue
            record = self.read_json(key)
            if record.get('_index_version') == KNOWLEDGE_INDEX_VERSION or self.objects.list(self.job_key(parts[0], parts[4])):
                continue
            revision = record.get('_ingestion_revision') or now()
            record |= {'status': 'pending', 'status_message': '', '_ingestion_revision': revision}
            self.write_json(key, record)
            self.enqueue_content(parts[0], parts[2], parts[4], 'index', revision)

    def claim_content_job(self, job, owner, lease_seconds=300):
        key = f"_system/knowledge-claims/{safe_name(job['room'])}/{safe_name(job['content_id'])}.json"
        timestamp = datetime.now(timezone.utc)
        claim = {'owner': owner, 'expires_at': (timestamp + timedelta(seconds=lease_seconds)).isoformat()}
        try:
            self.write_json(key, claim, if_absent=True)
            return True
        except FileExistsError:
            try:
                if datetime.fromisoformat(self.read_json(key)['expires_at']) > timestamp:
                    return False
            except (FileNotFoundError, KeyError, ValueError):
                pass
            self.objects.delete(key)
            try:
                self.write_json(key, claim, if_absent=True)
                return True
            except FileExistsError:
                return False

    def start_content_job(self, job, lease_seconds=300):
        key = job.get('_job_key') or self.job_key(job['room'], job['content_id'], job['revision'])
        current = self.read_json(key)
        if current['action'] == 'index':
            try:
                revision = self.content(current['room'], current['knowledge_id'], current['content_id']).get('_ingestion_revision')
            except HTTPException:
                revision = None
            if revision != current['revision']:
                self.objects.delete(key)
                return None
        timestamp = datetime.now(timezone.utc)
        current |= {'status': 'processing', 'attempts': current['attempts'] + 1,
          'lease_until': (timestamp + timedelta(seconds=lease_seconds)).isoformat(), 'updated_at': timestamp.isoformat()}
        self.write_json(key, current)
        if current['action'] == 'index':
            self.set_content_status(current['room'], current['knowledge_id'], current['content_id'], 'processing',
              revision=current['revision'])
        return current | {'_job_key': key}

    def finish_content_job(self, job, error=None):
        key = job.get('_job_key') or self.job_key(job['room'], job['content_id'], job['revision'])
        try:
            current = self.read_json(key)
        except FileNotFoundError:
            return
        if current['revision'] != job['revision']:
            return
        if error:
            delay = min(300, 2 ** current['attempts'])
            timestamp = datetime.now(timezone.utc)
            current |= {'status': 'failed', 'retry_at': (timestamp + timedelta(seconds=delay)).isoformat(),
              'updated_at': timestamp.isoformat(), 'error': str(error)}
            self.write_json(key, current)
            if current['action'] == 'index':
                self.set_content_status(current['room'], current['knowledge_id'], current['content_id'], 'failed', str(error),
                  current['revision'])
        else:
            if current['action'] == 'index':
                self.set_content_status(current['room'], current['knowledge_id'], current['content_id'], 'completed',
                  revision=current['revision'], index_version=KNOWLEDGE_INDEX_VERSION)
            self.objects.delete(key)

    def release_content_job(self, job, owner):
        key = f"_system/knowledge-claims/{safe_name(job['room'])}/{safe_name(job['content_id'])}.json"
        try:
            if self.read_json(key).get('owner') == owner:
                self.objects.delete(key)
        except FileNotFoundError:
            pass

    def content(self, room, knowledge, content):
        self.envelope(room, 'knowledge', knowledge)
        try:
            return self.read_json(self.content_key(room, knowledge, content, 'manifest.json'))
        except FileNotFoundError:
            raise HTTPException(404, f'knowledge/{knowledge}/content/{content} not found')

    def public_content(self, content):
        return {key: value for key, value in content.items() if not key.startswith('_')}

    def create_content(self, room, knowledge, name, description, metadata, file_name, content_type, body):
        self.envelope(room, 'knowledge', knowledge)
        content_id, timestamp = os.urandom(16).hex(), now()
        file_name = safe_name(PurePosixPath(file_name).name)
        record = {'id': content_id, 'name': name or file_name, 'description': description, 'type': content_type,
          'size': str(len(body)), 'linked_to': knowledge, 'metadata': metadata, 'access_count': 0, 'status': 'pending',
          'status_message': '', 'created_at': timestamp, 'updated_at': timestamp,
          '_content_hash': hashlib.sha256(body).hexdigest(), '_ingestion_revision': timestamp,
          '_artifact': {'path': file_name, 'mime_type': content_type}}
        self.objects.put(self.content_key(room, knowledge, content_id, file_name), body, content_type)
        self.write_json(self.content_key(room, knowledge, content_id, 'manifest.json'), record, if_absent=True)
        self.enqueue_content(room, knowledge, content_id, 'index', timestamp)
        self.audit(room, 'knowledge', knowledge, 'content.create', self.envelope(room, 'knowledge', knowledge)['version'],
          self.public_content(record), timestamp)
        return self.public_content(record)

    def update_content(self, room, knowledge, content, changes):
        record, timestamp = self.content(room, knowledge, content), now()
        record |= changes | {'status': 'pending', 'status_message': '', 'updated_at': timestamp, '_ingestion_revision': timestamp}
        self.write_json(self.content_key(room, knowledge, content, 'manifest.json'), record)
        self.enqueue_content(room, knowledge, content, 'index', timestamp)
        self.audit(room, 'knowledge', knowledge, 'content.update', self.envelope(room, 'knowledge', knowledge)['version'],
          changes, timestamp)
        return self.public_content(record)

    def set_content_status(self, room, knowledge, content, status, message='', revision=None, index_version=None):
        record = self.content(room, knowledge, content)
        if revision and record.get('_ingestion_revision') != revision:
            return self.public_content(record)
        record |= {'status': status, 'status_message': message, 'updated_at': now()}
        if index_version:
            record['_index_version'] = index_version
        self.write_json(self.content_key(room, knowledge, content, 'manifest.json'), record)
        return self.public_content(record)

    def delete_content(self, room, knowledge, content):
        record = self.content(room, knowledge, content)
        self.enqueue_content(room, knowledge, content, 'delete')
        self.objects.delete_prefix(self.content_key(room, knowledge, content, ''))
        self.audit(room, 'knowledge', knowledge, 'content.delete', self.envelope(room, 'knowledge', knowledge)['version'],
          {'id': content}, now())
        return self.public_content(record)

    def content_file(self, room, knowledge, content):
        record = self.content(room, knowledge, content)
        artifact = record['_artifact']
        return self.objects.get(self.content_key(room, knowledge, content, artifact['path'])), artifact

    def user_key(self, room, uid):
        return f'{safe_name(room)}/users/{safe_name(uid)}.json'

    def create_user(self, room, payload):
        data = dict(payload) | {'uid': os.urandom(16).hex(), 'created_at': now()}
        self.write_json(self.user_key(room, data['uid']), data)
        return data

    def get_user(self, room, uid):
        try:
            return self.read_json(self.user_key(room, uid))
        except FileNotFoundError:
            raise HTTPException(404, f'user/{uid} not found')
        except json.JSONDecodeError:
            raise HTTPException(422, f'user/{uid} is corrupt')

    def agent_names(self, room=None):
        keys = self.manifest_keys(room, 'agent') if room else self.objects.list('')
        return sorted({parts[2] for key in keys if len(parts := key.split('/')) == 4
          and parts[1] == 'agents' and parts[3] == 'manifest.json'})
