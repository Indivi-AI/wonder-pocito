import base64
import hashlib
import importlib
import importlib.util
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path, PurePosixPath
from typing import Any, Literal

import yaml
import boto3
from agno.agent import Agent
from agno.agent.factory import AgentFactory
from agno.db.in_memory import InMemoryDb
from agno.models.openai import OpenAIResponses
from agno.os import AgentOS
from agno.skills import LocalSkills, Skills
from agno.tools.function import Function
from botocore.exceptions import ClientError
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator

ROOT = Path(__file__).parent
SCOPE = 'marketplace'


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


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class NamedModel(StrictModel):
    display_name: str

    @field_validator('display_name')
    @classmethod
    def valid_name(cls, value):
        return safe_name(value)


class TagRef(BaseModel):
    """A typed tag attached to a manifest."""

    tag_type: str
    tag_name: str


class AssetInput(StrictModel):
    """One asset attached to a skill. content_b64 is base64-encoded raw bytes."""

    path: str
    content_b64: str
    mime_type: str | None = None

    @field_validator('path')
    @classmethod
    def valid_path(cls, value):
        return safe_path(value)

    @field_validator('content_b64')
    @classmethod
    def valid_content(cls, value):
        base64.b64decode(value, validate=True)
        return value


class CodeFile(StrictModel):
    """One already-wrapped tool source file stored byte-for-byte under tools/{id}/code/{path}."""

    path: str
    content: str

    @field_validator('path')
    @classmethod
    def valid_path(cls, value):
        return safe_path(value)


class BackendConfig(BaseModel):
    """Backend harness selection with extensible fields for forward-compatible config.yaml files."""

    model_config = ConfigDict(extra='allow')
    harness_type: Literal['deepagents', 'claude']


class AgentConfig(BaseModel):
    """Agent payload with flat reference IDs and extensible backend-compatible fields."""

    model_config = ConfigDict(extra='allow')
    system_prompt: str
    backend_config: BackendConfig
    plugins: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)
    sub_agents: list[str] = Field(default_factory=list)


class PluginConfig(BaseModel):
    """Flat skill/tool IDs stored in config.yaml with forward-compatible extra fields."""

    model_config = ConfigDict(extra='allow')
    skills: list[str] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)


class DescribedModel(NamedModel):
    hebrew_display_name: str | None = None
    description: str
    hebrew_description: str | None = None
    tags: list[TagRef] = Field(default_factory=list)


class CreateSkill(DescribedModel):
    """Create body. SKILL.md and assets are uploaded first; the manifest is written last."""

    min_agent_version: str | None = None
    license: str | None = None
    skill_md: str = ''
    assets: list[AssetInput] = Field(default_factory=list)


class ToolDescription(NamedModel):
    hebrew_display_name: str | None = None
    description: str
    hebrew_description: str | None = None


class ToolType(str, Enum):
    """Invocation type: code uses a handler; dedicated runtime types use dedicated_tool_config."""

    code = 'code'
    flow_package = 'flow_package'
    flow_cube = 'flow_cube'
    solr = 'solr'
    kick_graphql = 'kick_graphql'


class CreateTool(ToolDescription):
    """Create body. Code files are uploaded before config.json; dedicated config is typed by tool_type."""

    tool_type: ToolType
    json_schema: dict[str, Any] = Field(default_factory=dict)
    is_async: bool = True
    tracable: bool = True
    dedicated_tool_config: dict[str, Any] = Field(default_factory=dict)
    code_files: list[CodeFile] = Field(default_factory=list)


class CreatePlugin(DescribedModel):
    """Create body. config.yaml and README.md are uploaded first; the manifest is written last."""

    config: PluginConfig
    readme: str = ''


class CreateAgent(DescribedModel):
    """Create body. config.yaml is uploaded first; the manifest is written last."""

    config: AgentConfig
    readme: str = ''


class UpdateBase(StrictModel):
    """Partial update: only explicitly set fields overwrite the stored manifest/config."""

    display_name: str | None = None
    hebrew_display_name: str | None = None
    description: str | None = None
    hebrew_description: str | None = None
    tags: list[TagRef] | None = None


class UpdateSkill(UpdateBase):
    min_agent_version: str | None = None
    license: str | None = None
    skill_md: str | None = None
    assets: list[AssetInput] | None = None


class UpdateTool(StrictModel):
    """Partial update; code_files is write-only and typed dedicated config is conditionally revalidated."""

    display_name: str | None = None
    hebrew_display_name: str | None = None
    description: str | None = None
    hebrew_description: str | None = None
    tool_type: ToolType | None = None
    json_schema: dict[str, Any] | None = None
    is_async: bool | None = None
    tracable: bool | None = None
    dedicated_tool_config: dict[str, Any] | None = None
    code_files: list[CodeFile] | None = None


class UpdatePlugin(UpdateBase):
    config: PluginConfig | None = None
    readme: str | None = None


class UpdateAgent(UpdateBase):
    config: AgentConfig | None = None


class CreateUser(StrictModel):
    """Create-user request body."""

    username: str
    display_name: str | None = None
    email: str | None = None


class DownloadRequest(StrictModel):
    """Request body for a presigned download URL."""

    key: str
    expires_in: int = Field(3600, ge=1, le=86400)

    @field_validator('key')
    @classmethod
    def valid_key(cls, value):
        return safe_path(value)


class UploadRequest(DownloadRequest):
    """Request body for a presigned upload URL."""

    content_type: str | None = None


class S3ObjectStore:
    def __init__(self, bucket=None, client=None):
        self.bucket = bucket or os.getenv('MARKETPLACE_S3_BUCKET', 'wonder-marketplace')
        self.client = client or boto3.client('s3', endpoint_url=os.getenv('MARKETPLACE_S3_ENDPOINT', 'http://127.0.0.1:9000'),
          aws_access_key_id=os.getenv('MARKETPLACE_S3_ACCESS_KEY', 'wonder'),
          aws_secret_access_key=os.getenv('MARKETPLACE_S3_SECRET_KEY', 'wonder-minio-local'),
          region_name=os.getenv('MARKETPLACE_S3_REGION', 'us-east-1'))
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except ClientError as error:
            if error.response.get('Error', {}).get('Code') not in {'404', 'NoSuchBucket'}:
                raise
            self.client.create_bucket(Bucket=self.bucket)

    def put(self, key, content, content_type=None, if_absent=False):
        try:
            self.client.put_object(Bucket=self.bucket, Key=safe_path(key), Body=content,
              **({'ContentType': content_type} if content_type else {}), **({'IfNoneMatch': '*'} if if_absent else {}))
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

    def healthy(self):
        try:
            self.client.head_bucket(Bucket=self.bucket)
            return True
        except Exception:
            return False

    def presign(self, key, method, expires, content_type=None):
        operation = 'get_object' if method == 'GET' else 'put_object'
        params = {'Bucket': self.bucket, 'Key': key} | ({'ContentType': content_type} if content_type else {})
        return self.client.generate_presigned_url(operation, Params=params, ExpiresIn=expires)


class MarketplaceRepository:
    """All state lives in the object store: rows are JSON objects shaped {data, version, created_at, updated_at}."""

    def __init__(self, objects):
        self.objects = objects

    def read_json(self, key):
        return json.loads(self.objects.get(key).decode())

    def write_json(self, key, value, if_absent=False):
        self.objects.put(key, json.dumps(value, ensure_ascii=False).encode(), 'application/json', if_absent)

    def resource_key(self, room, kind, name, path):
        return f'{safe_name(room)}/{kind}s/{safe_name(name)}/{path}'

    def row(self, room, kind, name):
        try:
            return self.read_json(self.resource_key(room, kind, name, 'manifest.json'))
        except FileNotFoundError:
            raise HTTPException(404, f'{kind}/{name} not found')

    def manifest_keys(self, room, kind):
        prefix = f'{safe_name(room)}/{kind}s/'
        return [key for key in self.objects.list(prefix) if key.endswith('/manifest.json') and key.count('/') == 3]

    def object_key(self, room, kind, name, version, path):
        return self.resource_key(room, kind, name, f'v{version}/{safe_path(path)}')

    def read_artifact(self, room, kind, name, artifact):
        return self.objects.get(self.object_key(room, kind, name, artifact['version'], artifact['path']))

    def artifacts(self, room, kind, name, version, payload, current=None):
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
            self.objects.put(self.object_key(room, kind, payload['display_name'], version, path), content, mime_type)
            current[path] = {'path': path, 'version': version, 'mime_type': mime_type}
        return current

    def public(self, room, kind, row, include_assets=False, include_code=False):
        data = dict(row['data'])
        artifacts, result = data.pop('_artifacts', {}), data
        result |= {'id': result['display_name'], 'version': row['version'],
          'created_at': row['created_at'], 'updated_at': row['updated_at']}
        if kind == 'skill':
            skill = artifacts.get('SKILL.md')
            result['skill_md'] = self.read_artifact(room, kind, result['display_name'], skill).decode() if skill else ''
            result['assets'] = [self.asset(room, kind, result['display_name'], item, include_assets) for key, item in artifacts.items()
              if key.startswith('assets/')]
        if kind == 'tool':
            result['tags'] = result.get('tags', [])
            result['code_files'] = [self.code(room, kind, result['display_name'], item, include_code) for key, item in artifacts.items()
              if key.startswith('code/')]
        if kind in {'plugin', 'agent'}:
            readme = artifacts.get('README.md')
            result['readme'] = self.read_artifact(room, kind, result['display_name'], readme).decode() if readme else ''
        return result

    def asset(self, room, kind, name, item, content):
        result = {'path': item['path'][7:], 'mime_type': item.get('mime_type')}
        return result | ({'content_b64': base64.b64encode(self.read_artifact(room, kind, name, item)).decode()} if content else {})

    def code(self, room, kind, name, item, content):
        result = {'path': item['path'][5:]}
        return result | ({'content': self.read_artifact(room, kind, name, item).decode()} if content else {})

    def list(self, room, kind):
        return [self.public(room, kind, self.read_json(key)) for key in self.manifest_keys(room, kind)]

    def get(self, room, kind, name, include_assets=False, include_code=False):
        return self.public(room, kind, self.row(room, kind, name), include_assets, include_code)

    def create(self, room, kind, payload):
        data, timestamp = dict(payload), now()
        name = data['display_name']
        key = self.resource_key(room, kind, name, 'manifest.json')
        if self.objects.list(key):
            raise HTTPException(409, f'{kind}/{name} already exists')
        data['_artifacts'] = self.artifacts(room, kind, name, 1, data)
        try:
            self.write_json(key, {'data': data, 'version': 1, 'created_at': timestamp, 'updated_at': timestamp}, if_absent=True)
        except FileExistsError:
            raise HTTPException(409, f'{kind}/{name} already exists')
        self.audit(room, kind, name, 'create', 1, data, timestamp)
        return self.get(room, kind, name)

    def update(self, room, kind, name, changes):
        row, timestamp = self.row(room, kind, name), now()
        previous, version = row['data'], row['version'] + 1
        if changes.get('display_name') not in {None, name}:
            raise HTTPException(422, 'display_name cannot rename a resource')
        changes.pop('display_name', None)
        merged = previous | changes
        merged['display_name'] = name
        merged['_artifacts'] = self.artifacts(room, kind, name, version, merged, previous.get('_artifacts'))
        self.write_json(self.resource_key(room, kind, name, f"versions/{row['version']:08d}.json"), row)
        self.write_json(self.resource_key(room, kind, name, 'manifest.json'),
          {'data': merged, 'version': version, 'created_at': row['created_at'], 'updated_at': timestamp})
        self.audit(room, kind, name, 'update', version, changes, timestamp)
        return self.get(room, kind, name)

    def delete(self, room, kind, name):
        row = self.row(room, kind, name)
        self.audit(room, kind, name, 'delete', row['version'], {}, now())
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
        self.row(room, kind, name)
        keys = self.objects.list(self.resource_key(room, kind, name, 'versions/'))
        return [self.public(room, kind, self.read_json(key), include_assets=True, include_code=True) for key in keys]

    def version(self, room, kind, name, version):
        try:
            row = self.read_json(self.resource_key(room, kind, name, f'versions/{version:08d}.json'))
        except FileNotFoundError:
            raise HTTPException(404, f'{kind}/{name} version {version} not found')
        result = self.public(room, kind, row, include_assets=True, include_code=True)
        if kind == 'tool':
            result.pop('id', None)
            result.pop('tags', None)
        return result

    def file(self, room, kind, name, path):
        item = self.row(room, kind, name)['data'].get('_artifacts', {}).get(safe_path(path))
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
        checked = []
        for ref_kind, ref_name in refs:
            try:
                self.row(room, ref_kind, ref_name)
                exists = True
            except HTTPException:
                exists = False
            checked.append({'resource_type': ref_kind, 'name': ref_name, 'exists': exists})
        return {'valid': all(item['exists'] for item in checked), 'references': checked,
          'missing': [item for item in checked if not item['exists']]}

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

    def agent_names(self, room):
        return [key.split('/')[2] for key in self.manifest_keys(room, 'agent')]


class MarketplaceAgentRuntime:
    def __init__(self, repo, runtime_dir, model_factory=None):
        self.repo, self.runtime_dir = repo, Path(runtime_dir)
        self.db = InMemoryDb()
        self.model_factory = model_factory or self.openai_model

    def openai_model(self, manifest):
        model = manifest.get('config', {}).get('backend_config', {}).get('model') or os.getenv('OPENAI_MODEL', 'gpt-5-mini')
        return OpenAIResponses(id=model)

    def delete(self, room, kind, name):
        path = self.runtime_dir / safe_name(room) / f'{kind}s' / safe_name(name)
        shutil.rmtree(path) if path.is_dir() else None

    def materialize_skill(self, room, name):
        manifest = self.repo.get(room, 'skill', name, include_assets=True)
        digest = hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()[:12]
        target = self.runtime_dir / safe_name(room) / 'skills' / safe_name(name) / f"{manifest['version']}-{digest}"
        target.mkdir(parents=True, exist_ok=True)
        content = manifest['skill_md']
        if not content.startswith('---'):
            content = f"---\nname: {name}\ndescription: {json.dumps(manifest['description'], ensure_ascii=False)}\n---\n{content}"
        (target / 'SKILL.md').write_text(content)
        for asset in manifest['assets']:
            path = (target / safe_path(asset['path'])).resolve()
            if target.resolve() not in path.parents:
                raise ValueError('skill asset escaped runtime directory')
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(base64.b64decode(asset['content_b64']))
        return target

    def tool(self, room, name):
        manifest = self.repo.get(room, 'tool', name, include_code=True)
        digest = hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()[:12]
        target = self.runtime_dir / safe_name(room) / 'tools' / safe_name(name) / f"{manifest['version']}-{digest}"
        target.mkdir(parents=True, exist_ok=True)
        for source in manifest['code_files']:
            path = (target / safe_path(source['path'])).resolve()
            if target.resolve() not in path.parents:
                raise ValueError('tool file escaped runtime directory')
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(source['content'])
        configured = manifest.get('dedicated_tool_config', {}).get('entrypoint')
        file_name, function_name = configured.split(':', 1) if configured else ('tool.py', '')
        module_path = (target / safe_path(file_name)).resolve()
        if not module_path.is_file():
            raise ValueError(f'tool {name} entrypoint file not found: {file_name}')
        module_name = f"wonder_tool_{hashlib.sha256(str(module_path).encode()).hexdigest()[:16]}"
        spec = importlib.util.spec_from_file_location(module_name, module_path)
        module = importlib.util.module_from_spec(spec)
        sys.path.insert(0, str(target))
        try:
            spec.loader.exec_module(module)
        finally:
            sys.path.remove(str(target))
        candidates = [value for key, value in vars(module).items() if callable(value) and not key.startswith('_')
          and getattr(value, '__module__', '') == module_name]
        entrypoint = getattr(module, function_name, None) if function_name else getattr(module, 'run', None)
        entrypoint = entrypoint or (candidates[0] if len(candidates) == 1 else None)
        if not callable(entrypoint):
            raise ValueError(f'tool {name} needs dedicated_tool_config.entrypoint="file.py:function"')
        return Function(name=re.sub(r'\W', '_', name), description=manifest['description'],
          parameters=manifest.get('json_schema') or {'type': 'object', 'properties': {}}, entrypoint=entrypoint)

    def agent(self, room, name):
        manifest = self.repo.get(room, 'agent', name)
        config, skill_names, tool_names = manifest['config'], set(), set()
        for plugin_name in config.get('plugins', []):
            plugin = self.repo.get(room, 'plugin', plugin_name).get('config') or {}
            skill_names.update(plugin.get('skills', []))
            tool_names.update(plugin.get('tools', []))
        skill_names.update(config.get('skills', []))
        tool_names.update(config.get('tools', []))
        skills = Skills([LocalSkills(str(self.materialize_skill(room, item)), validate=False) for item in sorted(skill_names)])
        return Agent(id=name, name=manifest.get('hebrew_display_name') or name, model=self.model_factory(manifest), db=self.db,
          tools=[self.tool(room, item) for item in sorted(tool_names)], skills=skills,
          instructions=[config['system_prompt']], markdown=True, telemetry=False)


def configured_model_factory():
    path = os.getenv('MARKETPLACE_MODEL_FACTORY')
    if not path:
        return None
    module, function = path.split(':', 1)
    return getattr(importlib.import_module(module), function)


def create_app(data_dir=None, model_factory=None):
    data_dir = Path(data_dir or os.getenv('MARKETPLACE_DATA_DIR', ROOT / '.marketplace-data'))
    repo = MarketplaceRepository(S3ObjectStore())
    runtime = MarketplaceAgentRuntime(repo, data_dir / 'runtime', model_factory or configured_model_factory())
    base = FastAPI(title='marketplace', version='0.1.0')
    origins = os.getenv('CORS_ALLOWED_ORIGINS',
      'http://localhost:3000,http://127.0.0.1:3000,http://localhost:8083,http://127.0.0.1:8083').split(',')
    base.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=['*'], allow_headers=['*'])

    @base.get('/healthz', tags=['health'])
    def healthz():
        return {'status': 'ok', 'object_store': 'ok' if repo.objects.healthy() else 'unreachable'}

    models = {'tool': (CreateTool, UpdateTool), 'skill': (CreateSkill, UpdateSkill), 'plugin': (CreatePlugin, UpdatePlugin),
      'agent': (CreateAgent, UpdateAgent)}
    factories = []

    def register_agent(name):
        if not any(item.id == name for item in factories):
            factories.append(AgentFactory(id=name, db=runtime.db,
              factory=lambda ctx, agent_name=name: runtime.agent(SCOPE, agent_name)))

    def routes(kind, create_model, update_model):
        plural = f'{kind}s'

        async def list_resources():
            return repo.list(SCOPE, kind)

        async def create_resource(payload: create_model):
            result = repo.create(SCOPE, kind, payload.model_dump())
            register_agent(result['display_name']) if kind == 'agent' else None
            return result

        async def get_resource(name: str, request: Request):
            include_assets = kind == 'skill' and request.query_params.get('includeAssets', '').lower() == 'true'
            return repo.get(SCOPE, kind, name, include_assets=include_assets)

        async def update_resource(name: str, payload: update_model):
            return repo.update(SCOPE, kind, name, payload.model_dump(exclude_unset=True))

        async def delete_resource(name: str):
            repo.delete(SCOPE, kind, name)
            runtime.delete(SCOPE, kind, name) if kind in {'skill', 'tool'} else None
            if kind == 'agent' and name not in repo.agent_names(SCOPE):
                factories[:] = [item for item in factories if item.id != name]
            return Response(status_code=204)

        async def list_versions(name: str):
            return repo.versions(SCOPE, kind, name)

        async def read_version(name: str, n: int):
            return repo.version(SCOPE, kind, name, n)

        labels = {verb: f'{verb}_{kind}_api_v1_{plural}' for verb in ('create', 'get', 'update', 'delete')}
        base.add_api_route(f'/api/v1/{plural}/', list_resources, methods=['GET'], operation_id=f'list_{plural}_api_v1_{plural}__get')
        base.add_api_route(f'/api/v1/{plural}/', create_resource, methods=['POST'], status_code=201,
          operation_id=f"{labels['create']}__post")
        base.add_api_route(f'/api/v1/{plural}', list_resources, methods=['GET'], include_in_schema=False)
        base.add_api_route(f'/api/v1/{plural}', create_resource, methods=['POST'], status_code=201, include_in_schema=False)
        base.add_api_route(f'/api/v1/{plural}/{{name}}', get_resource, methods=['GET'], operation_id=f"{labels['get']}__name__get")
        base.add_api_route(f'/api/v1/{plural}/{{name}}', update_resource, methods=['PUT'], operation_id=f"{labels['update']}__name__put")
        base.add_api_route(f'/api/v1/{plural}/{{name}}', delete_resource, methods=['DELETE'], status_code=204,
          operation_id=f"{labels['delete']}__name__delete")
        base.add_api_route(f'/api/v1/{plural}/{{name}}/versions', list_versions, methods=['GET'],
          operation_id=f'list_{kind}_versions_api_v1_{plural}__name__versions_get')
        base.add_api_route(f'/api/v1/{plural}/{{name}}/versions/{{n}}', read_version, methods=['GET'],
          operation_id=f'read_{kind}_version_api_v1_{plural}__name__versions__n__get')

    for kind, pair in models.items():
        routes(kind, *pair)

    def raw_file(kind, prefix, path, binary=False):
        content, mime_type = repo.file(SCOPE, kind, safe_name(path[0]), f'{prefix}{safe_path(path[1])}')
        return Response(content, media_type=mime_type or 'application/octet-stream' if binary else 'text/plain')

    @base.get('/api/v1/tools/{name}/code/{path:path}', tags=['tools'],
      operation_id='get_tool_code_api_v1_tools__name__code__path__get')
    def tool_code(name: str, path: str):
        return raw_file('tool', 'code/', (name, path))

    @base.get('/api/v1/skills/{name}/SKILL.md', tags=['skills'], operation_id='get_skill_md_api_v1_skills__name__SKILL_md_get')
    def skill_md(name: str):
        return raw_file('skill', '', (name, 'SKILL.md'))

    @base.get('/api/v1/skills/{name}/assets/{path:path}', tags=['skills'],
      operation_id='get_skill_asset_api_v1_skills__name__assets__path__get')
    def skill_asset(name: str, path: str):
        return raw_file('skill', 'assets/', (name, path), binary=True)

    @base.get('/api/v1/plugins/{name}/config.yaml', tags=['plugins'],
      operation_id='get_plugin_config_api_v1_plugins__name__config_yaml_get')
    def plugin_config(name: str):
        return raw_file('plugin', '', (name, 'config.yaml'))

    @base.get('/api/v1/plugins/{name}/README.md', tags=['plugins'],
      operation_id='get_plugin_readme_api_v1_plugins__name__README_md_get')
    def plugin_readme(name: str):
        return raw_file('plugin', '', (name, 'README.md'))

    @base.get('/api/v1/agents/{name}/config.yaml', tags=['agents'],
      operation_id='get_agent_config_api_v1_agents__name__config_yaml_get')
    def agent_config(name: str):
        return raw_file('agent', '', (name, 'config.yaml'))

    @base.get('/api/v1/plugins/{name}/references', tags=['plugins'],
      operation_id='check_plugin_references_api_v1_plugins__name__references_get')
    def plugin_references(name: str):
        return repo.references(SCOPE, 'plugin', name)

    @base.get('/api/v1/agents/{name}/references', tags=['agents'],
      operation_id='check_agent_references_api_v1_agents__name__references_get')
    def agent_references(name: str):
        return repo.references(SCOPE, 'agent', name)

    @base.get('/api/v1/audit/{resource_type}/{resource_name}', tags=['audit'],
      operation_id='list_audit_events_api_v1_audit__resource_type___resource_name__get')
    def audit(resource_type: Literal['tool', 'skill', 'plugin', 'agent'], resource_name: str):
        return repo.audits(SCOPE, resource_type, resource_name)

    @base.post('/api/v1/users/', status_code=201, tags=['users'])
    def create_user(payload: CreateUser):
        return repo.create_user(SCOPE, payload.model_dump())

    base.add_api_route('/api/v1/users', create_user, methods=['POST'], status_code=201, include_in_schema=False)

    @base.get('/api/v1/users/{uid}', tags=['users'])
    def get_user(uid: str):
        return repo.get_user(SCOPE, uid)

    def presigned(key, method, expires, content_type=None):
        result = {'url': repo.objects.presign(key, method, expires, content_type), 'method': method, 'expires_in': expires}
        return result | ({'headers': {'Content-Type': content_type}} if content_type else {})

    @base.post('/api/v1/presign/download', tags=['presign'])
    def presign_download(payload: DownloadRequest):
        return presigned(payload.key, 'GET', payload.expires_in)

    @base.post('/api/v1/presign/upload', tags=['presign'])
    def presign_upload(payload: UploadRequest):
        return presigned(payload.key, 'PUT', payload.expires_in, payload.content_type)

    for name in repo.agent_names(SCOPE):
        register_agent(name)
    agent_os = AgentOS(name='Wonder Marketplace', agents=factories, db=runtime.db, base_app=base,
      cors_allowed_origins=origins, on_route_conflict='preserve_base_app', telemetry=False)
    app = agent_os.get_app()
    app.state.marketplace_repo, app.state.marketplace_runtime = repo, runtime
    app.openapi_schema = json.loads((ROOT / 'marketplace-openapi.json').read_text())
    app.openapi = lambda: app.openapi_schema
    return app


if __name__ == '__main__':
    import uvicorn

    uvicorn.run(create_app(), host='127.0.0.1', port=int(os.getenv('AGENT_OS_PORT', '7777')))
