"""Agno AgentOS runtime server: runs the agents the marketplace server defines.
The two servers share only the S3 object store (through marketplace_storage) - agents created or
deleted there are picked up here per request by sync_factories, so neither server ever calls the other."""
import base64
import hashlib
import importlib
import importlib.util
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path

from agno.agent import Agent
from agno.agent.factory import AgentFactory
from agno.db.in_memory import InMemoryDb
from agno.models.openai import OpenAIResponses
from agno.os import AgentOS
from agno.skills import LocalSkills, Skills
from agno.tools.function import Function
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from marketplace_storage import DEFAULT_ROOM, ROOM_CONTEXT, ROOT, MarketplaceRepository, S3ObjectStore, safe_name, safe_path


class MarketplaceAgentRuntime:
    def __init__(self, repo, runtime_dir, model_factory=None):
        self.repo, self.runtime_dir = repo, Path(runtime_dir)
        self.db = InMemoryDb()
        self.room_dbs = defaultdict(InMemoryDb)
        self.model_factory = model_factory or self.openai_model

    def openai_model(self, manifest):
        model = manifest.get('config', {}).get('backend_config', {}).get('model') or os.getenv('OPENAI_MODEL', 'gpt-5-mini')
        return OpenAIResponses(id=model, api_key=os.getenv('OPENAI_API_KEY'), base_url=os.getenv('OPENAI_BASE_URL'))

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
        return Agent(id=name, name=manifest['display_name'], model=self.model_factory(manifest),
          db=self.room_dbs[room],
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
    base = FastAPI(title='agno', version='0.1.0')
    factories = []

    def sync_factories():
        names = set(repo.agent_names())
        factories[:] = [item for item in factories if item.id in names]
        for name in sorted(names - {item.id for item in factories}):
            factories.append(AgentFactory(id=name, db=runtime.db,
              factory=lambda ctx, agent_name=name: runtime.agent(ROOM_CONTEXT.get(), agent_name)))

    @base.middleware('http')
    async def bind_room(request, call_next):
        try:
            room = safe_name(request.headers.get('x-wonder-room', DEFAULT_ROOM))
        except ValueError as error:
            return JSONResponse({'detail': str(error)}, status_code=422)
        if request.url.path.startswith('/agents'):
            sync_factories()
        token = ROOM_CONTEXT.set(room)
        try:
            return await call_next(request)
        finally:
            ROOM_CONTEXT.reset(token)

    @base.get('/healthz', tags=['health'])
    def healthz():
        return {'status': 'ok', 'object_store': 'ok' if repo.objects.healthy() else 'unreachable'}

    sync_factories()
    agent_os = AgentOS(name='Wonder AgentOS', agents=factories, db=runtime.db, base_app=base,
      on_route_conflict='preserve_base_app', telemetry=False)
    app = agent_os.get_app()
    app.user_middleware = [middleware for middleware in app.user_middleware if middleware.cls is not CORSMiddleware]
    app.add_middleware(CORSMiddleware, allow_origins=os.getenv('CORS_ALLOWED_ORIGINS', '*').split(','),
      allow_methods=['*'], allow_headers=['*'])
    app.state.marketplace_repo, app.state.marketplace_runtime = repo, runtime
    return app


if __name__ == '__main__':
    import uvicorn

    uvicorn.run(create_app(), host=os.getenv('AGENT_OS_HOST', '127.0.0.1'), port=int(os.getenv('AGENT_OS_PORT', '7778')))
