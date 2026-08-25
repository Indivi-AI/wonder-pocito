import base64
import json
import os
import sys
from enum import Enum
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

SCHEMA_DIR = Path(__file__).resolve().parent.parent / 'marketplace-schema'
if str(SCHEMA_DIR) not in sys.path:
    sys.path.insert(0, str(SCHEMA_DIR))

from marketplace_storage import DEFAULT_ROOM, ROOM_CONTEXT, ROOT, MarketplaceRepository, S3ObjectStore, safe_name, safe_path


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class NamedModel(StrictModel):
    id: str = Field(description='Stable semantic identifier used in API paths and references')
    display_name: str = Field(description='Human-readable display name')

    @field_validator('id')
    @classmethod
    def valid_id(cls, value):
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
    knowledge_bases: list[str] = Field(default_factory=list)


class PluginConfig(BaseModel):
    """Flat resource IDs stored in config.yaml with forward-compatible extra fields."""

    model_config = ConfigDict(extra='allow')
    skills: list[str] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)
    knowledge_bases: list[str] = Field(default_factory=list)


class DescribedModel(NamedModel):
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
    description: str
    hebrew_description: str | None = None


class ToolType(str, Enum):
    """Invocation type: code uses a handler; dedicated runtime types use dedicated_tool_config."""

    code = 'code'
    flow_package = 'flow_package'
    flow_cube = 'flow_cube'
    solr = 'solr'
    kick_graphql = 'kick_graphql'
    mcp = 'mcp'


class CreateTool(ToolDescription):
    """Create body. Code files are uploaded before config.json; dedicated config is typed by tool_type."""

    tool_type: ToolType
    json_schema: dict[str, Any] = Field(default_factory=dict)
    is_async: bool = True
    tracable: bool = True
    dedicated_tool_config: dict[str, Any] = Field(default_factory=dict)
    code_files: list[CodeFile] = Field(default_factory=list)
    package_id: str | None = None
    input_schema: list[dict[str, Any]] | None = Field(default_factory=list)
    output_cubes: list[dict[str, Any]] | None = Field(default_factory=list)


class CreatePlugin(DescribedModel):
    """Create body. config.yaml and README.md are uploaded first; the manifest is written last."""

    config: PluginConfig
    readme: str = ''


class CreateAgent(DescribedModel):
    """Create body. config.yaml is uploaded first; the manifest is written last."""

    config: AgentConfig
    readme: str = ''


class CreateKnowledge(DescribedModel):
    pass


class UpdateBase(StrictModel):
    """Partial update: only explicitly set fields overwrite the stored manifest/config."""

    id: str | None = None
    display_name: str | None = None
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

    id: str | None = None
    display_name: str | None = None
    description: str | None = None
    hebrew_description: str | None = None
    tool_type: ToolType | None = None
    json_schema: dict[str, Any] | None = None
    is_async: bool | None = None
    tracable: bool | None = None
    dedicated_tool_config: dict[str, Any] | None = None
    code_files: list[CodeFile] | None = None
    package_id: str | None = None
    input_schema: list[dict[str, Any]] | None = Field(default_factory=list)
    output_cubes: list[dict[str, Any]] | None = Field(default_factory=list)


class UpdatePlugin(UpdateBase):
    config: PluginConfig | None = None
    readme: str | None = None


class UpdateAgent(UpdateBase):
    config: AgentConfig | None = None


class UpdateKnowledge(UpdateBase):
    pass


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


def create_app():
    repo = MarketplaceRepository(S3ObjectStore())
    base = FastAPI(title='marketplace', version='0.1.0')

    @base.middleware('http')
    async def bind_room(request, call_next):
        try:
            room = safe_name(request.headers.get('x-wonder-room', DEFAULT_ROOM))
        except ValueError as error:
            return JSONResponse({'detail': str(error)}, status_code=422)
        token = ROOM_CONTEXT.set(room)
        try:
            return await call_next(request)
        finally:
            ROOM_CONTEXT.reset(token)

    @base.get('/healthz', tags=['health'])
    def healthz():
        return {'status': 'ok', 'object_store': 'ok' if repo.objects.healthy() else 'unreachable'}

    models = {'tool': (CreateTool, UpdateTool), 'skill': (CreateSkill, UpdateSkill), 'plugin': (CreatePlugin, UpdatePlugin),
      'agent': (CreateAgent, UpdateAgent), 'knowledge': (CreateKnowledge, UpdateKnowledge)}

    def routes(kind, create_model, update_model):
        plural = 'knowledge' if kind == 'knowledge' else f'{kind}s'

        async def list_resources():
            return repo.list(ROOM_CONTEXT.get(), kind)

        async def create_resource(payload: create_model):
            return repo.create(ROOM_CONTEXT.get(), kind, payload.model_dump())

        async def get_resource(id: str, request: Request):
            include_assets = kind == 'skill' and request.query_params.get('includeAssets', '').lower() == 'true'
            return repo.get(ROOM_CONTEXT.get(), kind, id, include_assets=include_assets)

        async def update_resource(id: str, payload: update_model):
            return repo.update(ROOM_CONTEXT.get(), kind, id, payload.model_dump(exclude_unset=True))

        async def delete_resource(id: str):
            repo.delete(ROOM_CONTEXT.get(), kind, id)
            return Response(status_code=204)

        async def list_versions(id: str):
            return repo.versions(ROOM_CONTEXT.get(), kind, id)

        async def read_version(id: str, n: int):
            return repo.version(ROOM_CONTEXT.get(), kind, id, n)

        labels = {verb: f'{verb}_{kind}_api_v1_{plural}' for verb in ('create', 'get', 'update', 'delete')}
        base.add_api_route(f'/api/v1/{plural}/', list_resources, methods=['GET'], operation_id=f'list_{plural}_api_v1_{plural}__get')
        base.add_api_route(f'/api/v1/{plural}/', create_resource, methods=['POST'], status_code=201,
          operation_id=f"{labels['create']}__post")
        base.add_api_route(f'/api/v1/{plural}', list_resources, methods=['GET'], include_in_schema=False)
        base.add_api_route(f'/api/v1/{plural}', create_resource, methods=['POST'], status_code=201, include_in_schema=False)
        base.add_api_route(f'/api/v1/{plural}/{{id}}', get_resource, methods=['GET'], operation_id=f"{labels['get']}__id__get")
        base.add_api_route(f'/api/v1/{plural}/{{id}}', update_resource, methods=['PUT'], operation_id=f"{labels['update']}__id__put")
        base.add_api_route(f'/api/v1/{plural}/{{id}}', delete_resource, methods=['DELETE'], status_code=204,
          operation_id=f"{labels['delete']}__id__delete")
        base.add_api_route(f'/api/v1/{plural}/{{id}}/versions', list_versions, methods=['GET'],
          operation_id=f'list_{kind}_versions_api_v1_{plural}__id__versions_get')
        base.add_api_route(f'/api/v1/{plural}/{{id}}/versions/{{n}}', read_version, methods=['GET'],
          operation_id=f'read_{kind}_version_api_v1_{plural}__id__versions__n__get')

    for kind, pair in models.items():
        routes(kind, *pair)

    def raw_file(kind, prefix, path, binary=False):
        content, mime_type = repo.file(ROOM_CONTEXT.get(), kind, safe_name(path[0]), f'{prefix}{safe_path(path[1])}')
        return Response(content, media_type=mime_type or 'application/octet-stream' if binary else 'text/plain')

    @base.get('/api/v1/tools/{id}/code/{path:path}', tags=['tools'],
      operation_id='get_tool_code_api_v1_tools__id__code__path__get')
    def tool_code(id: str, path: str):
        return raw_file('tool', 'code/', (id, path))

    @base.get('/api/v1/skills/{id}/SKILL.md', tags=['skills'], operation_id='get_skill_md_api_v1_skills__id__SKILL_md_get')
    def skill_md(id: str):
        return raw_file('skill', '', (id, 'SKILL.md'))

    @base.get('/api/v1/skills/{id}/assets/{path:path}', tags=['skills'],
      operation_id='get_skill_asset_api_v1_skills__id__assets__path__get')
    def skill_asset(id: str, path: str):
        return raw_file('skill', 'assets/', (id, path), binary=True)

    @base.get('/api/v1/plugins/{id}/config.yaml', tags=['plugins'],
      operation_id='get_plugin_config_api_v1_plugins__id__config_yaml_get')
    def plugin_config(id: str):
        return raw_file('plugin', '', (id, 'config.yaml'))

    @base.get('/api/v1/plugins/{id}/README.md', tags=['plugins'],
      operation_id='get_plugin_readme_api_v1_plugins__id__README_md_get')
    def plugin_readme(id: str):
        return raw_file('plugin', '', (id, 'README.md'))

    @base.get('/api/v1/agents/{id}/config.yaml', tags=['agents'],
      operation_id='get_agent_config_api_v1_agents__id__config_yaml_get')
    def agent_config(id: str):
        return raw_file('agent', '', (id, 'config.yaml'))

    @base.get('/api/v1/plugins/{id}/references', tags=['plugins'],
      operation_id='check_plugin_references_api_v1_plugins__id__references_get')
    def plugin_references(id: str):
        return repo.references(ROOM_CONTEXT.get(), 'plugin', id)

    @base.get('/api/v1/agents/{id}/references', tags=['agents'],
      operation_id='check_agent_references_api_v1_agents__id__references_get')
    def agent_references(id: str):
        return repo.references(ROOM_CONTEXT.get(), 'agent', id)

    @base.get('/api/v1/audit/{resource_type}/{resource_id}', tags=['audit'],
      operation_id='list_audit_events_api_v1_audit__resource_type___resource_id__get')
    def audit(resource_type: Literal['tool', 'skill', 'plugin', 'agent', 'knowledge'], resource_id: str):
        return repo.audits(ROOM_CONTEXT.get(), resource_type, resource_id)

    def metadata_json(value):
        try:
            metadata = json.loads(value or '{}')
            if not isinstance(metadata, dict):
                raise ValueError
            return metadata
        except (json.JSONDecodeError, ValueError):
            raise HTTPException(422, 'metadata must be a JSON object')

    @base.post('/api/v1/knowledge/{id}/content', status_code=202, tags=['knowledge'])
    async def upload_content(id: str, name: str | None = Form(None), description: str | None = Form(None),
      metadata: str | None = Form(None), file: UploadFile | None = File(None), text_content: str | None = Form(None)):
        if (file is None) == (text_content is None):
            raise HTTPException(422, 'provide exactly one of file or text_content')
        body = await file.read() if file else text_content.encode()
        file_name = file.filename if file else f'{name or "content"}.txt'
        content_type = file.content_type if file else 'text/plain'
        return repo.create_content(ROOM_CONTEXT.get(), id, name, description, metadata_json(metadata), file_name, content_type, body)

    @base.get('/api/v1/knowledge/{id}/content', tags=['knowledge'])
    def list_content(id: str, page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100)):
        items = repo.contents(ROOM_CONTEXT.get(), id)
        start, total = (page - 1) * limit, len(items)
        return {'data': items[start:start + limit], 'meta': {'page': page, 'limit': limit,
          'total_pages': (total + limit - 1) // limit, 'total_count': total}}

    @base.get('/api/v1/knowledge/{id}/content/{content_id}', tags=['knowledge'])
    def get_content(id: str, content_id: str):
        return repo.public_content(repo.content(ROOM_CONTEXT.get(), id, content_id))

    @base.get('/api/v1/knowledge/{id}/content/{content_id}/status', tags=['knowledge'])
    def content_status(id: str, content_id: str):
        content = repo.content(ROOM_CONTEXT.get(), id, content_id)
        return {key: content[key] for key in ('id', 'status', 'status_message')}

    @base.patch('/api/v1/knowledge/{id}/content/{content_id}', tags=['knowledge'])
    def update_content(id: str, content_id: str, name: str | None = Form(None), description: str | None = Form(None),
      metadata: str | None = Form(None)):
        changes = {key: value for key, value in {'name': name, 'description': description}.items() if value is not None}
        return repo.update_content(ROOM_CONTEXT.get(), id, content_id,
          changes | ({'metadata': metadata_json(metadata)} if metadata is not None else {}))

    @base.delete('/api/v1/knowledge/{id}/content/{content_id}', tags=['knowledge'])
    def delete_content(id: str, content_id: str):
        return repo.delete_content(ROOM_CONTEXT.get(), id, content_id)

    @base.get('/api/v1/knowledge/{id}/content/{content_id}/file', tags=['knowledge'])
    def download_content(id: str, content_id: str):
        body, artifact = repo.content_file(ROOM_CONTEXT.get(), id, content_id)
        return Response(body, media_type=artifact.get('mime_type') or 'application/octet-stream')

    @base.post('/api/v1/users/', status_code=201, tags=['users'])
    def create_user(payload: CreateUser):
        return repo.create_user(ROOM_CONTEXT.get(), payload.model_dump())

    base.add_api_route('/api/v1/users', create_user, methods=['POST'], status_code=201, include_in_schema=False)

    @base.get('/api/v1/users/{uid}', tags=['users'])
    def get_user(uid: str):
        return repo.get_user(ROOM_CONTEXT.get(), uid)

    def presigned(key, method, expires, content_type=None):
        result = {'url': repo.objects.presign(f'{ROOM_CONTEXT.get()}/{key}', method, expires, content_type),
          'method': method, 'expires_in': expires}
        return result | ({'headers': {'Content-Type': content_type}} if content_type else {})

    @base.post('/api/v1/presign/download', tags=['presign'])
    def presign_download(payload: DownloadRequest):
        return presigned(payload.key, 'GET', payload.expires_in)

    @base.post('/api/v1/presign/upload', tags=['presign'])
    def presign_upload(payload: UploadRequest):
        return presigned(payload.key, 'PUT', payload.expires_in, payload.content_type)

    base.add_middleware(CORSMiddleware, allow_origins=os.getenv('CORS_ALLOWED_ORIGINS', '*').lower().split(','),
      allow_methods=['*'], allow_headers=['*'], allow_private_network=True)
    base.state.marketplace_repo = repo
    base.openapi_schema = json.loads((ROOT / 'marketplace-openapi.json').read_text())
    base.openapi = lambda: base.openapi_schema
    return base


if __name__ == '__main__':
    import uvicorn

    uvicorn.run(create_app(), host=os.getenv('MARKETPLACE_HOST', '127.0.0.1'), port=int(os.getenv('MARKETPLACE_PORT', '7777')))
