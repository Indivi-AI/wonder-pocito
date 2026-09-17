import asyncio
import hmac
import os
from typing import Annotated, Any

from mcp.server.fastmcp import FastMCP, Context
from pydantic import Field
from starlette.responses import JSONResponse

from marketplace_storage import DEFAULT_ROOM, safe_name


class BearerAuthMiddleware:
    def __init__(self, app, token):
        self.app, self.token = app, token

    async def __call__(self, scope, receive, send):
        if scope['type'] == 'http' and os.getenv('WONDER_AUTH_MODE') != 'none':
            headers = {key.lower(): value for key, value in scope.get('headers', [])}
            supplied = headers.get(b'authorization', b'').decode('latin-1')
            if not self.token:
                return await JSONResponse({'error': 'MCP is not configured'}, status_code=503)(scope, receive, send)
            if not hmac.compare_digest(supplied, f'Bearer {self.token}'):
                return await JSONResponse({'error': 'Unauthorized'}, status_code=401,
                  headers={'WWW-Authenticate': 'Bearer'})(scope, receive, send)
        await self.app(scope, receive, send)


def create_knowledge_mcp(runtime, **settings):
    mcp = FastMCP('Wonder Knowledge', **settings)

    def principal(ctx):
        request = ctx.request_context.request
        headers = request.headers if request else {}
        return safe_name(headers.get('x-wonder-room', DEFAULT_ROOM)), safe_name(headers.get('x-wonder-agent', ''))

    @mcp.tool()
    async def list_knowledges(ctx: Context) -> dict[str, Any]:
        """List only the Knowledge bases assigned to the authenticated agent."""
        room, agent = principal(ctx)
        items = []
        for name in runtime.assigned_knowledge_names(room, agent):
            manifest, contents = runtime.repo.get(room, 'knowledge', name), runtime.repo.contents(room, name)
            states = {item['status'] for item in contents}
            status = 'failed' if 'failed' in states else 'processing' if states & {'pending', 'processing'} else 'ready' if contents else 'empty'
            items.append({'id': name, 'name': manifest['display_name'], 'description': manifest['description'], 'status': status})
        return {'agent_id': agent, 'knowledge_count': len(items), 'knowledges': items}

    @mcp.tool()
    async def search_knowledge(query: Annotated[str, Field(min_length=1)],
      knowledge_ids: Annotated[list[str], Field(min_length=1, max_length=5)],
      ctx: Context, limit: Annotated[int, Field(ge=1, le=20)] = 5) -> dict[str, Any]:
        """Search one to five assigned Knowledge bases and return rank-fused, cited chunks."""
        room, agent = principal(ctx)
        if len(knowledge_ids) != len(set(knowledge_ids)):
            raise ValueError('knowledge_ids must not contain duplicates')
        allowed = set(runtime.assigned_knowledge_names(room, agent))
        if set(knowledge_ids) - allowed:
            raise PermissionError('one or more requested Knowledge IDs are not assigned to this agent')
        groups = await asyncio.gather(*(asyncio.to_thread(runtime.search_one_knowledge, room, name, query, max(limit, 8))
          for name in knowledge_ids))
        ranked = []
        for name, items in zip(knowledge_ids, groups):
            for rank, item in enumerate(items, 1):
                metadata = item.get('meta_data') or {}
                ranked.append({'id': str(item.get('id', '')), 'knowledge_id': name,
                  'knowledge_name': runtime.repo.get(room, 'knowledge', name)['display_name'], 'content': item.get('content', ''),
                  'name': item.get('name'), 'content_id': item.get('content_id') or metadata.get('content_id'),
                  'source': metadata.get('source_uri') or metadata.get('filename') or item.get('name'), 'source_rank': rank,
                  'fused_score': 1 / (60 + rank), 'metadata': metadata})
        results = sorted(ranked, key=lambda item: (-item['fused_score'], item['knowledge_id'], item['id']))[:limit]
        return {'query': query, 'requested_knowledge_ids': knowledge_ids, 'result_count': len(results), 'results': results}

    return mcp
