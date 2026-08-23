import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path

import httpx
from agno.agent import Agent
from agno.db.sqlite import SqliteDb
from agno.models.openai import OpenAIResponses
from agno.os import AgentOS
from fastapi import Body, FastAPI, Form, HTTPException

ROOT = Path(__file__).parent
DATA_DIR = ROOT / '.data'
MARKETPLACE_DB = DATA_DIR / 'marketplace.db'
MARKETPLACE_URL = os.getenv('MARKETPLACE_URL', 'http://127.0.0.1:7777')
CORS_ALLOWED_ORIGINS = os.getenv('CORS_ALLOWED_ORIGINS',
  'http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,'
  'http://localhost:3004,http://127.0.0.1:3004').split(',')
MARKETPLACE_SEED = json.loads((ROOT / 'marketplace.json').read_text())
MARKETPLACE_RESOURCES = tuple(MARKETPLACE_SEED)
LEGACY_SEEDS = {'skills': ['document-matching', 'operational-analysis', 'supplier-research'],
  'tools': ['purchase-documents', 'wiki-search', 'report-reader'],
  'agents': ['document-auditor', 'operations-analyst', 'service-writer']}


def connect_marketplace():
    connection = sqlite3.connect(MARKETPLACE_DB)
    connection.row_factory = sqlite3.Row
    return connection


def init_marketplace():
    DATA_DIR.mkdir(exist_ok=True)
    with connect_marketplace() as connection:
        connection.execute('CREATE TABLE IF NOT EXISTS assets (resource TEXT, name TEXT, data TEXT, PRIMARY KEY(resource, name))')
        for resource, names in LEGACY_SEEDS.items():
            connection.executemany('DELETE FROM assets WHERE resource = ? AND name = ?', ((resource, name) for name in names))
        for resource, items in MARKETPLACE_SEED.items():
            for seed in items:
                row = connection.execute('SELECT data FROM assets WHERE resource = ? AND name = ?',
                  (resource, seed['name'])).fetchone()
                current = json.loads(row['data']) if row else {}
                item = {**seed, **current}
                for key in ('skills', 'tools', 'agents', 'rows', 'messages', 'inputSchema', 'outputCubes'):
                    if key in seed and not isinstance(current.get(key), list):
                        item[key] = seed[key]
                connection.execute('INSERT OR REPLACE INTO assets VALUES (?, ?, ?)',
                  (resource, seed['name'], json.dumps(item, ensure_ascii=False)))


def require_resource(resource):
    if resource not in MARKETPLACE_RESOURCES:
        raise HTTPException(404, f'Unknown marketplace resource: {resource}')
    return resource


def read_asset(resource, name):
    with connect_marketplace() as connection:
        row = connection.execute('SELECT data FROM assets WHERE resource = ? AND name = ?', (resource, name)).fetchone()
    if not row:
        raise HTTPException(404, f'{resource}/{name} not found')
    return json.loads(row['data'])


init_marketplace()
base_app = FastAPI(title='Pocito Platform V0')


@base_app.get('/healthz')
def health():
    return {'status': 'ok'}


@base_app.get('/api/v1/{resource}')
def list_assets(resource: str):
    with connect_marketplace() as connection:
        rows = connection.execute('SELECT data FROM assets WHERE resource = ? ORDER BY rowid', (require_resource(resource),)).fetchall()
    return [json.loads(row['data']) for row in rows]


@base_app.post('/api/v1/{resource}', status_code=201)
def create_asset(resource: str, payload: dict = Body(...)):
    resource, item = require_resource(resource), {'version': 'V0', **payload, 'updated': datetime.now().strftime('%d/%m')}
    item['name'] = item.get('name') or f'item-{datetime.now().timestamp():.0f}'
    try:
        with connect_marketplace() as connection:
            connection.execute('INSERT INTO assets VALUES (?, ?, ?)', (resource, item['name'], json.dumps(item, ensure_ascii=False)))
    except sqlite3.IntegrityError:
        raise HTTPException(409, f'{resource}/{item["name"]} already exists')
    return item


@base_app.get('/api/v1/{resource}/{name}')
def get_asset(resource: str, name: str):
    return read_asset(require_resource(resource), name)


@base_app.put('/api/v1/{resource}/{name}')
def update_asset(resource: str, name: str, payload: dict = Body(...)):
    resource = require_resource(resource)
    item = {**read_asset(resource, name), **payload, 'name': name, 'updated': datetime.now().strftime('%d/%m')}
    with connect_marketplace() as connection:
        connection.execute('UPDATE assets SET data = ? WHERE resource = ? AND name = ?',
          (json.dumps(item, ensure_ascii=False), resource, name))
    return item


@base_app.delete('/api/v1/{resource}/{name}')
def delete_asset(resource: str, name: str):
    read_asset(require_resource(resource), name)
    with connect_marketplace() as connection:
        connection.execute('DELETE FROM assets WHERE resource = ? AND name = ?', (resource, name))
    return {'deleted': name}


def marketplace_get(path):
    response = httpx.get(f'{MARKETPLACE_URL}{path}', timeout=5)
    response.raise_for_status()
    return response.json()


def list_marketplace_assets(resource: str) -> str:
    """List every marketplace asset of a resource type: plugins, skills, tools, reports, or agents."""
    return json.dumps(marketplace_get(f'/api/v1/{resource}'), ensure_ascii=False)


def get_marketplace_asset(resource: str, name: str) -> str:
    """Read one marketplace asset by resource type and exact name."""
    return json.dumps(marketplace_get(f'/api/v1/{resource}/{name}'), ensure_ascii=False)


def search_marketplace(query: str) -> str:
    """Search all marketplace plugins, skills, tools, verified reports, and sub-agents."""
    query = query.casefold()
    matches = [
        {'resource': resource, **item} for resource in MARKETPLACE_RESOURCES for item in marketplace_get(f'/api/v1/{resource}')
        if query in json.dumps(item, ensure_ascii=False).casefold()
    ]
    return json.dumps(matches, ensure_ascii=False)


agent_db = SqliteDb(db_file=str(DATA_DIR / 'agents.db'))


def runtime_agent(asset):
    return Agent(id=asset['name'], name=asset['title'], model=OpenAIResponses(id=os.getenv('OPENAI_MODEL', 'gpt-5-mini')),
    db=agent_db, tools=[search_marketplace, list_marketplace_assets, get_marketplace_asset],
    instructions=[
        f"Your marketplace asset is '{asset['name']}': {asset['description']}",
        asset.get('instructions', ''),
        'Always inspect the marketplace before answering and use the relevant plugins, skills, tools, reports, and sub-agents.',
        'Answer in Hebrew unless asked otherwise. Cite used marketplace asset names.',
        'When a verified report is relevant, append its exact marker once: [[report:report-name]].'
    ],
    add_history_to_context=True, num_history_runs=5, markdown=True
    )


@base_app.post('/api/v1/runtime/{agent_id}/runs')
async def run_marketplace_agent(agent_id: str, message: str = Form(...), session_id: str = Form(...),
  user_id: str = Form('platform-v0')):
    asset = next((item for resource in ('plugins', 'agents') for item in list_assets(resource) if item['name'] == agent_id), None)
    if not asset:
        raise HTTPException(404, f'Agent {agent_id} not found')
    return (await runtime_agent(asset).arun(message, session_id=session_id, user_id=user_id)).to_dict()


plugin_agents = [runtime_agent(asset) for asset in MARKETPLACE_SEED['plugins'] + MARKETPLACE_SEED['agents']]

agent_os = AgentOS(
  name='Pocito Platform V0', agents=plugin_agents, db=agent_db, base_app=base_app,
  cors_allowed_origins=CORS_ALLOWED_ORIGINS, telemetry=False
)
app = agent_os.get_app()

if __name__ == '__main__':
    agent_os.serve(app='agno_server:app', host='127.0.0.1', port=int(os.getenv('AGENT_OS_PORT', '7777')))
