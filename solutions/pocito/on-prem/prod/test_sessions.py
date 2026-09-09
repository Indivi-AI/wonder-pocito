import hashlib
import json
import os
import sys
import tempfile
import uuid
from pathlib import Path
from time import time

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'agno-server'))
from agno_server import MarketplaceAgentRuntime
from agno.session import AgentSession
from sqlalchemy import text

os.environ['AGNO_DB_URL'] = os.getenv('AGNO_DB_URL') or os.environ['PGVECTOR_URL']
room = f'prod-session-{uuid.uuid4().hex}'
rooms = [room, f'{room}-other']
runtimes = []
try:
    for _ in range(2):
        runtimes.append(MarketplaceAgentRuntime(None, tempfile.gettempdir()))
    original, replacement = runtimes
    for name in rooms:
        stored = original.room_db(name).upsert_session(AgentSession(session_id='same-session', agent_id='probe',
          session_data={'marker': name}, created_at=int(time()), updated_at=int(time())))
        assert stored is not None
    for name in rooms:
        restored = replacement.room_db(name).get_session('same-session')
        assert restored.session_data['marker'] == name
    print(json.dumps({'persistence': True, 'roomIsolation': True}))
finally:
    if runtimes:
        with runtimes[0].session_db_engine.begin() as connection:
            for name in rooms:
                schema = f'pocito_{hashlib.sha256(name.encode()).hexdigest()[:20]}'
                connection.execute(text(f'DROP SCHEMA IF EXISTS {schema} CASCADE'))
    for runtime in runtimes:
        runtime.session_db_engine.dispose()
        runtime.vector_db_engine.dispose()
