"""Agno AgentOS runtime server: runs the agents the marketplace server defines.
The two servers share only the S3 object store (through marketplace_storage) - agents created or
deleted there are picked up here per request by sync_factories, so neither server ever calls the other."""
import base64
import asyncio
import hashlib
import importlib
import importlib.util
import json
import os
import re
import sys
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager, suppress
from contextvars import ContextVar
from pathlib import Path

from agno.agent import Agent
from agno.agent.factory import AgentFactory
from agno.db.in_memory import InMemoryDb
from agno.knowledge.chunking.fixed import FixedSizeChunking
from agno.knowledge.embedder.openai import OpenAIEmbedder
from agno.knowledge.knowledge import Knowledge
from agno.knowledge.reader import ReaderFactory
from agno.models.openai import OpenAIChat
from agno.os import AgentOS
from agno.run import RunContext
from agno.skills import LocalSkills, Skills
from agno.tools.function import Function
from agno.tools.mcp import MCPTools
from agno.vectordb.pgvector import PgVector
from agno.vectordb.search import SearchType
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import BaseModel, Field
from sqlalchemy import Index, create_engine, text
from sqlalchemy.engine import URL

SCHEMA_DIR = Path(__file__).resolve().parent.parent / 'marketplace-schema'
if str(SCHEMA_DIR) not in sys.path:
    sys.path.insert(0, str(SCHEMA_DIR))

from marketplace_storage import DEFAULT_ROOM, ROOM_CONTEXT, ROOT, MarketplaceRepository, S3ObjectStore, safe_name, safe_path
from knowledge_mcp import BearerAuthMiddleware, create_knowledge_mcp

ADHOC_DEFAULT_INSTRUCTIONS = 'את/ה עוזר בינה מלאכותית ידידותי ומדויק. השב/י בעברית, בבהירות ובתמציתיות.'
MODEL_CONTEXT = ContextVar('model', default='')


def knowledge_reader(path):
    reader = ReaderFactory.get_reader_for_extension(path.suffix)
    reader.chunking_strategy = FixedSizeChunking(3000, 300)
    return reader


def generate_json_schema(input_schema):
    properties = {}
    required = []
    
    type_map = {
        'string': lambda: {'type': 'string'},
        'int': lambda: {'type': 'integer'},
        'double': lambda: {'type': 'number'},
        'boolean': lambda: {'type': 'boolean'},
        'timestamp': lambda: {'type': 'string', 'format': 'date-time'},
        'datetime': lambda: {
            'type': 'object',
            'description': 'Date range: e.g. {"From": "YYYY-MM-DD", "To": "YYYY-MM-DD"} or {"TimeBackValue": 30, "TimeBackUnit": "DAY"}'
        },
        'haphoch': lambda: {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'value': {'type': 'array', 'items': {'type': 'string'}},
                    'radius': {'type': 'integer'}
                },
                'required': ['value', 'radius']
            },
            'description': 'Geo area coordinates in WKT with search radius'
        }
    }
    
    for param in input_schema:
        name = param.get('Name')
        if not name:
            continue
        p_type = str(param.get('Type', 'String')).lower()
        display = param.get('DisplayName', name)
        desc = param.get('Description') or display
        
        prop = type_map.get(p_type, lambda: {'type': 'string'})()
        prop['description'] = desc
        properties[name] = prop
        
        if param.get('IsRequired'):
            required.append(name)
            
    return {
        'type': 'object',
        'properties': properties,
        'required': required
    }


def binding_name(binding, bindings):
    field = binding.get('field', '')
    if sum(item.get('field') == field and item.get('mode') == 'dynamic' for item in bindings) == 1:
        return field
    query = re.sub(r'\W+', '_', binding.get('query_name') or binding.get('query_id', '')).strip('_').lower()
    return f'{query}__{field}'


def generate_binding_schema(bindings):
    dynamic = [binding for binding in bindings if binding.get('mode') == 'dynamic']
    return generate_json_schema([{'Name': binding_name(binding, dynamic), 'Type': binding.get('type', 'String'),
      'DisplayName': binding.get('display_name') or binding.get('field'), 'Description': binding.get('description'),
      'IsRequired': True} for binding in dynamic])


class JsonDict(dict):
    def __str__(self):
        return json.dumps(self, ensure_ascii=False)


def result_key(room, run_context, result_id):
    if not run_context or not run_context.session_id or not re.fullmatch(r'[a-f0-9]{32}', result_id):
        raise ValueError('A valid result_id and active session are required')
    scope = hashlib.sha256(json.dumps([run_context.user_id, run_context.session_id]).encode()).hexdigest()
    return f'{safe_name(room)}/results/{scope}/{result_id}.json'


def make_flow_package_executor(package_id, bindings=None, repo=None, output_cubes=None, room=None):
    def execute(_agno_run_context: RunContext = None, **flat_args):
        import urllib.request
        import urllib.error
        import json
        flapi_base_url = os.getenv('FLAPI_BASE_URL') or 'http://localhost:6001'
        url = f"{flapi_base_url.rstrip('/')}/package/v3/{package_id}"
        params = flat_args if not bindings else {}
        for binding in bindings or []:
            value = binding.get('value') if binding.get('mode') == 'fixed' else flat_args[binding_name(binding, bindings)]
            params.setdefault(binding['query_id'], {})[binding['field']] = value
        req = urllib.request.Request(
            url,
            data=json.dumps(params if bindings else {'params': params}).encode('utf-8'),
            headers={'Content-Type': 'application/json', 'accept': 'application/json',
              'Authorization': os.getenv('FLAPI_TOKEN', ''), 'Username': os.getenv('FLAPI_USERNAME', '')},
            method='POST'
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                raw = response.read().decode('utf-8')
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"FLAPI error {e.code}: {e.read().decode('utf-8')}")
        except Exception as e:
            raise RuntimeError(f"FLAPI request failed: {e}")

        try:
            data = json.loads(raw) if isinstance(raw, str) else (raw or {})
        except Exception:
            return JsonDict({'raw': str(raw)})

        def save_result(cube, rows):
            if not repo:
                return {'cube': cube, 'rows': rows, 'total_rows': len(rows)}
            result_id = uuid.uuid4().hex
            key = result_key(room or ROOM_CONTEXT.get(), _agno_run_context, result_id)
            repo.objects.put(key, json.dumps({'run_id': _agno_run_context.run_id, 'cube': cube, 'rows': rows},
              ensure_ascii=False).encode(), 'application/json')
            return {'result_id': result_id, 'cube': cube, 'rows': rows[:5], 'total_rows': len(rows)}

        results = data.get('results', data.get('cubes', data)) if isinstance(data, dict) else {}
        results = results or {}
        cubes = output_cubes or []
        if len(cubes) == 1:
            target = cubes[0].get('Name') or cubes[0].get('id') or ''
            matched = next((k for k in results if k == target or target in k or k in target or k == cubes[0].get('id')), None)
            rows = results.get(matched) if matched else []
            if isinstance(rows, dict) and 'rows' in rows: rows = rows['rows']
            if not isinstance(rows, list): rows = [rows] if rows else []
            cube_name = cubes[0].get('Name') or matched or 'output'
            return JsonDict(save_result(cube_name, rows))

        filtered = {}
        for cube_id, cube_val in (results.items() if isinstance(results, dict) else []):
            if cubes and not any(c.get('Name') == cube_id or c.get('id') == cube_id or str(c.get('Name') or '') in str(cube_id) for c in cubes):
                continue
            rows = cube_val if isinstance(cube_val, list) else (cube_val.get('rows') if isinstance(cube_val, dict) else None)
            if isinstance(rows, list):
                filtered[cube_id] = save_result(cube_id, rows)
        return JsonDict({'results': filtered if cubes else filtered or results})

    return execute


def make_file_reader_tool(repo, room=None):
    params = generate_json_schema([
        {'Name': 'result_id', 'Type': 'String', 'Description': 'מזהה תוצאה שהוחזר מכלי מארז בשיחה הנוכחית', 'IsRequired': True},
        {'Name': 'limit', 'Type': 'int', 'Description': 'מספר שורות מקסימלי לקריאה (ברירת מחדל 50)', 'IsRequired': False},
        {'Name': 'offset', 'Type': 'int', 'Description': 'דילוג שורות (ברירת מחדל 0)', 'IsRequired': False},
        {'Name': 'search', 'Type': 'String', 'Description': 'סינון טקסט חופשי בשורות', 'IsRequired': False}
    ])

    def read_file(result_id: str, limit: int = 50, offset: int = 0, search: str = '', _agno_run_context: RunContext = None) -> JsonDict:
        if not 1 <= limit <= 200 or offset < 0:
            raise ValueError('limit must be 1–200 and offset must be nonnegative')
        key = result_key(room or ROOM_CONTEXT.get(), _agno_run_context, result_id)
        try:
            result = json.loads(repo.objects.get(key))
        except FileNotFoundError:
            raise ValueError('Result not found in the current session') from None
        rows = [row for row in result['rows'] if not search or search.casefold() in json.dumps(row, ensure_ascii=False).casefold()]
        return JsonDict({'result_id': result_id, 'cube': result['cube'], 'total_rows': len(rows),
          'offset': offset, 'rows': rows[offset:offset + limit], 'returned_rows': len(rows[offset:offset + limit])})

    return Function(
        name='read_file',
        description=('קריאת תוצאות מארז בשיחה הנוכחית לפי result_id. '
          'לקבלת שורות מעבר לתצוגה המקדימה השתמשו ב-offset, limit (עד 200) ו-search.'),
        parameters=params,
        entrypoint=read_file,
        skip_entrypoint_processing=True,
    )



class MarketplaceAgentRuntime:
    def __init__(self, repo, runtime_dir, model_factory=None, embedder=None):
        self.repo, self.runtime_dir = repo, Path(runtime_dir)
        self.db = InMemoryDb()
        self.room_dbs = defaultdict(InMemoryDb)
        self.litellm_url = f"{os.getenv('LITELLM_HOST', 'http://localhost:4000').rstrip('/')}/v1"
        self.model_factory = model_factory or self.openai_model
        self.embedder = embedder or OpenAIEmbedder(id='embeddings', dimensions=int(os.getenv('OPENAI_EMBEDDING_DIMENSIONS', '1536')),
          api_key='unused', base_url=self.litellm_url)
        pgvector_url = os.getenv('PGVECTOR_URL') or URL.create('postgresql+psycopg',
          username=os.getenv('POSTGRES_USER', 'wonder'), password=os.getenv('POSTGRES_PASSWORD', 'wonder-pg-local'),
          host=os.getenv('PGVECTOR_HOST', '127.0.0.1'), port=int(os.getenv('PGVECTOR_PORT', '5432')),
          database=os.getenv('POSTGRES_DB', 'wonder'))
        self.vector_db_engine = create_engine(pgvector_url, pool_pre_ping=True)
        self.knowledge_instances, self.worker_id = {}, os.urandom(16).hex()
        self.mcp_tools = {}

    def openai_model(self, manifest):
        model = MODEL_CONTEXT.get() or manifest.get('config', {}).get('backend_config', {}).get('model') or os.getenv('OPENAI_MODEL', 'gpt-5-mini')
        return OpenAIChat(id=model, api_key=os.getenv('OPENAI_API_KEY'), base_url=os.getenv('OPENAI_BASE_URL'),
                          reasoning_effort=os.getenv("OPENAI_REASONING_EFFORT") or None)

    def agent_manifest(self, room, name):
        try:
            return self.repo.get(room, 'agent', name)
        except HTTPException as error:
            if error.status_code != 404:
                raise
        plugin = self.repo.get(room, 'plugin', name)
        return plugin | {'config': {'system_prompt': plugin.get('readme') or plugin['description'],
          'backend_config': {'harness_type': 'deepagents'}, 'plugins': [name]}}

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

    async def close_mcp(self, room, name, keep=None):
        for key in [k for k in self.mcp_tools if k[:2] == (room, name) and k != keep]:
            await self.mcp_tools.pop(key).close()

    async def mcp_toolkit(self, room, name, manifest, context_ref=''):
        config = dict(manifest.get('dedicated_tool_config', {}))
        config.pop('transport', None)
        key = (room, name, manifest['version'], context_ref)
        await self.close_mcp(room, name, keep=key)
        if key not in self.mcp_tools:
            if context_ref:
                ref = context_ref
                config['header_provider'] = lambda: {'X-Context-Ref': ref}
            self.mcp_tools[key] = MCPTools(**config)
        toolkit = self.mcp_tools[key]
        if not getattr(toolkit, '_initialized', False):
            await toolkit.connect()
        return toolkit

    async def tool(self, room, name, context_ref=''):
        manifest = self.repo.get(room, 'tool', name, include_code=True)
        if manifest.get('tool_type') == 'mcp':
            return await self.mcp_toolkit(room, name, manifest, context_ref)
        if manifest.get('tool_type') == 'flow_package':
            package_id = manifest.get('package_id')
            if not package_id:
                raise ValueError(f"flow_package tool {name} is missing package_id")
            bindings = manifest.get('input_bindings') or []
            parameters = generate_binding_schema(bindings) if bindings else generate_json_schema(manifest.get('input_schema') or [])
            entrypoint = make_flow_package_executor(package_id, bindings, self.repo, manifest.get('output_cubes') or [], room)
            return Function(name=re.sub(r'\W', '_', name), description=manifest['description'],
              parameters=parameters, entrypoint=entrypoint, skip_entrypoint_processing=True)

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

    def knowledge(self, room, name, validate=True):
        if validate:
            self.repo.get(room, 'knowledge', name)
        key = safe_name(room), safe_name(name)
        return self.knowledge_instances.setdefault(key, Knowledge(name=name,
          vector_db=PgVector(db_engine=self.vector_db_engine,
            table_name=f"knowledge_{hashlib.sha256(f'{room}:{name}'.encode()).hexdigest()[:20]}",
            search_type=SearchType.vector, vector_index=None, embedder=self.embedder)))

    def process_content_job(self, job):
        knowledge = self.knowledge(job['room'], job['knowledge_id'], job['action'] != 'delete')
        if knowledge.vector_db.exists():
            knowledge.vector_db.delete_by_metadata({'content_id': job['content_id']})
        if job['action'] == 'delete':
            return
        item = self.repo.content(job['room'], job['knowledge_id'], job['content_id'])
        if item.get('_ingestion_revision') != job['revision']:
            return
        body, artifact = self.repo.content_file(job['room'], job['knowledge_id'], job['content_id'])
        path = self.runtime_dir / 'knowledge-content' / safe_name(job['room']) / safe_name(job['knowledge_id'])
        path = path / job['content_id'] / artifact['path']
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
        count = knowledge.vector_db.get_count() if knowledge.vector_db.exists() else 0
        knowledge.insert(name=item['name'], description=item.get('description'), path=str(path), reader=knowledge_reader(path),
          metadata=(item.get('metadata') or {}) | {'knowledge_id': job['knowledge_id'], 'content_id': job['content_id']})
        table = knowledge.vector_db.table
        Index(f'{table.name}_hnsw_index', table.c.embedding, postgresql_using='hnsw',
          postgresql_ops={'embedding': 'vector_cosine_ops'}, postgresql_with={'m': 16, 'ef_construction': 200}).create(
          self.vector_db_engine, checkfirst=True)
        if knowledge.vector_db.get_count() <= count:
            raise RuntimeError('content was not indexed')

    def process_content_jobs(self):
        for pending in self.repo.content_jobs():
            if not self.repo.claim_content_job(pending, self.worker_id):
                continue
            job = None
            try:
                job = self.repo.start_content_job(pending)
                if job:
                    self.process_content_job(job)
                    self.repo.finish_content_job(job)
            except Exception as error:
                self.repo.finish_content_job(job or pending, error)
            finally:
                self.repo.release_content_job(pending, self.worker_id)

    def assigned_knowledge_names(self, room, agent_name):
        config = self.agent_manifest(room, agent_name)['config']
        names = set(config.get('knowledge_bases', []))
        for plugin_name in config.get('plugins', []):
            names.update((self.repo.get(room, 'plugin', plugin_name).get('config') or {}).get('knowledge_bases', []))
        for name in names:
            self.repo.get(room, 'knowledge', name)
        return sorted(names)

    def search_one_knowledge(self, room, name, query, limit):
        return [document.to_dict() for document in self.knowledge(room, name).retrieve(query, max_results=limit)]

    def search_knowledge(self, room, names, query, limit):
        ranked = []
        for name in names:
            for rank, item in enumerate(self.search_one_knowledge(room, name, query, max(limit, 8)), 1):
                item['meta_data'] = (item.get('meta_data') or {}) | {'knowledge_id': name, 'source_rank': rank,
                  'fused_score': 1 / (60 + rank)}
                ranked.append(item)
        return sorted(ranked, key=lambda item: (-item['meta_data']['fused_score'], item['meta_data']['knowledge_id']))[:limit]

    def retrieve_knowledge(self, knowledge, names, query, num_documents=None, **_):
        limit = num_documents or knowledge.max_results
        return self.search_knowledge(ROOM_CONTEXT.get(), sorted(names), query, limit)

    async def build_agent(self, room, manifest, agent_id, knowledge_names, context_ref=''):
        config, skill_names, tool_names = manifest['config'], set(), set()
        knowledge_names = set(knowledge_names)
        for plugin_name in config.get('plugins', []):
            plugin = self.repo.get(room, 'plugin', plugin_name).get('config') or {}
            skill_names.update(plugin.get('skills', []))
            tool_names.update(plugin.get('tools', []))
        skill_names.update(config.get('skills', []))
        tool_names.update(config.get('tools', []))
        skills = Skills([LocalSkills(str(self.materialize_skill(room, item)), validate=False) for item in sorted(skill_names)])
        knowledge = self.knowledge(room, sorted(knowledge_names)[0]) if knowledge_names else None
        tools = [await self.tool(room, item, context_ref) for item in sorted(tool_names)]
        tools.append(make_file_reader_tool(self.repo, room))
        return Agent(id=agent_id, name=manifest['display_name'], model=self.model_factory(manifest),
          db=self.room_dbs[room], add_history_to_context=True,
          tools=tools, skills=skills,
          knowledge=knowledge, knowledge_retriever=(lambda agent, query, num_documents=None, **kwargs:
            self.retrieve_knowledge(knowledge, knowledge_names, query, num_documents, **kwargs)) if knowledge else None,
          instructions=[config['system_prompt']], markdown=True, telemetry=False)

    async def agent(self, room, name, context_ref=''):
        manifest = self.agent_manifest(room, name)
        return await self.build_agent(room, manifest, name, self.assigned_knowledge_names(room, name), context_ref)


class AdhocRunRequest(BaseModel):
    message: str = Field(min_length=1)
    session_id: str | None = None
    display_name: str | None = None
    instructions: str | None = None
    skills: list[str] | None = None
    tools: list[str] | None = None
    knowledge: list[str] | None = None
    plugins: list[str] | None = None


def configured_model_factory():
    path = os.getenv('MARKETPLACE_MODEL_FACTORY')
    if not path:
        return None
    module, function = path.split(':', 1)
    return getattr(importlib.import_module(module), function)


def create_app(data_dir=None, model_factory=None, embedder=None):
    data_dir = Path(data_dir or os.getenv('MARKETPLACE_DATA_DIR', ROOT / '.marketplace-data'))
    repo = MarketplaceRepository(S3ObjectStore())
    runtime = MarketplaceAgentRuntime(repo, data_dir / 'runtime', model_factory or configured_model_factory(), embedder)
    site_host = os.getenv('SITE_HOST', 'localhost')
    mcp = create_knowledge_mcp(runtime, streamable_http_path='/mcp', json_response=True, stateless_http=True,
      transport_security=TransportSecuritySettings(allowed_hosts=[f'{site_host}:*', 'localhost:*', '127.0.0.1:*'],
        allowed_origins=os.getenv('CORS_ALLOWED_ORIGINS', '').split(',')))
    mcp_app = mcp.streamable_http_app()

    @asynccontextmanager
    async def lifespan(_):
        async with mcp_app.router.lifespan_context(mcp_app):
            async def ingest():
                await asyncio.to_thread(repo.bootstrap_content_jobs)
                while True:
                    await asyncio.to_thread(runtime.process_content_jobs)
                    await asyncio.sleep(float(os.getenv('KNOWLEDGE_WORKER_INTERVAL', '1')))
            worker = asyncio.create_task(ingest())
            try:
                yield
            finally:
                worker.cancel()
                with suppress(asyncio.CancelledError):
                    await worker

    base = FastAPI(title='agno', version='0.1.0', lifespan=lifespan)
    factories = []

    def sync_factories(room=DEFAULT_ROOM):
        names = set(repo.agent_names(room)) | {item['id'] for item in repo.list(room, 'plugin')}
        factories[:] = [item for item in factories if item.id in names]
        for name in sorted(names - {item.id for item in factories}):
            async def build(ctx, agent_name=name):
                context_ref = (ctx.input or {}).get('context_ref', '') if ctx else ''
                return await runtime.agent(ROOM_CONTEXT.get(), agent_name, context_ref)
            factories.append(AgentFactory(id=name, db=runtime.db, factory=build))

    @base.middleware('http')
    async def bind_room(request, call_next):
        try:
            room = safe_name(request.headers.get('x-wonder-room', DEFAULT_ROOM))
        except ValueError as error:
            return JSONResponse({'detail': str(error)}, status_code=422)
        token, model_token = ROOM_CONTEXT.set(room), MODEL_CONTEXT.set(request.headers.get('x-wonder-model', ''))
        try:
            if request.url.path.startswith('/agents'):
                sync_factories(room)
            return await call_next(request)
        finally:
            ROOM_CONTEXT.reset(token)
            MODEL_CONTEXT.reset(model_token)

    @base.get('/healthz', tags=['health'])
    def healthz():
        try:
            with runtime.vector_db_engine.connect() as connection:
                connection.execute(text('SELECT 1'))
            vector_store = 'ok'
        except Exception:
            vector_store = 'unreachable'
        return {'status': 'ok' if vector_store == 'ok' else 'degraded',
          'object_store': 'ok' if repo.objects.healthy() else 'unreachable', 'vector_store': vector_store}

    @base.post('/adhoc/runs', tags=['adhoc'])
    async def adhoc_run(payload: AdhocRunRequest):
        room = ROOM_CONTEXT.get()
        skills, tools, knowledge, plugins = payload.skills or [], payload.tools or [], payload.knowledge or [], payload.plugins or []
        for name in knowledge:
            repo.get(room, 'knowledge', name)
        session_id = payload.session_id or uuid.uuid4().hex
        manifest = {'display_name': payload.display_name or 'Ad-hoc agent', 'config': {
          'system_prompt': payload.instructions or ADHOC_DEFAULT_INSTRUCTIONS, 'plugins': plugins, 'skills': skills, 'tools': tools}}
        agent = await runtime.build_agent(room, manifest, f'adhoc-{session_id}', knowledge)
        result = await agent.arun(payload.message, session_id=session_id, stream=False)
        return {'run_id': result.run_id, 'content': result.content, 'status': result.status.value, 'session_id': session_id}

    sync_factories()
    agent_os = AgentOS(name='Wonder AgentOS', agents=factories, db=runtime.db, base_app=base,
      on_route_conflict='preserve_base_app', telemetry=False)
    app = agent_os.get_app()
    app.user_middleware = [middleware for middleware in app.user_middleware if middleware.cls is not CORSMiddleware]
    app.add_middleware(CORSMiddleware, allow_origins=os.getenv('CORS_ALLOWED_ORIGINS', '*').lower().split(','),
      allow_methods=['*'], allow_headers=['*'], allow_private_network=True)
    app.mount('/', BearerAuthMiddleware(mcp_app, os.getenv('MCP_BEARER_TOKEN', '')))
    app.state.marketplace_repo, app.state.marketplace_runtime = repo, runtime
    return app


if __name__ == '__main__':
    import uvicorn

    uvicorn.run(create_app(), host=os.getenv('AGENT_OS_HOST', '127.0.0.1'), port=int(os.getenv('AGENT_OS_PORT', '7778')))
