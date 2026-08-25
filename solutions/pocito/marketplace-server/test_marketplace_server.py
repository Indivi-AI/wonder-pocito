import json
import os
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from agno_server import create_app as create_agent_os_app
from marketplace_e2e_model import MarketplaceE2EEmbedder, model_factory
from marketplace_server import create_app


class MarketplaceServerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {'MARKETPLACE_S3_BUCKET': f'marketplace-test-{uuid.uuid4().hex[:12]}'})
        self.env.start()
        self.client = TestClient(create_app())
        self.agno = TestClient(create_agent_os_app(self.temp.name, model_factory, MarketplaceE2EEmbedder()))
        self.objects = self.client.app.state.marketplace_repo.objects
        self.examples = json.loads((Path(__file__).parent / 'marketplace-api-examples.json').read_text())

    def tearDown(self):
        self.client.close()
        self.agno.close()
        self.objects.delete_prefix('')
        self.objects.client.delete_bucket(Bucket=self.objects.bucket)
        self.env.stop()
        self.temp.cleanup()

    def request(self, method, path, **kwargs):
        return self.client.request(method, path, **kwargs)

    def skill(self, description='Knows the room code.'):
        return {'id': 'roomFactsSkill', 'display_name': 'Room facts', 'description': description,
          'skill_md': '# Room facts\nTHE ORBITAL CODE IS AMBER-17.',
          'assets': [{'path': 'references/fact.txt', 'content_b64': 'UkVGRVJFTkNFLU9L', 'mime_type': 'text/plain'}]}

    def tool(self):
        return {'id': 'numberTool', 'display_name': 'Number tool', 'description': 'Doubles a number.', 'tool_type': 'code',
          'json_schema': {'type': 'object', 'properties': {'value': {'type': 'integer'}}, 'required': ['value']},
          'dedicated_tool_config': {'entrypoint': 'tool.py:double'},
          'code_files': [{'path': 'tool.py', 'content': "def double(value: int) -> str:\n    return f'TOOL_CALLED:{value * 2}'\n"}]}

    def agent(self):
        return {'id': 'roomAgent', 'display_name': 'Room agent', 'description': 'Uses room facts.', 'config': {
          'system_prompt': 'Use the configured skill and tool.', 'backend_config': {'harness_type': 'deepagents'},
          'plugins': ['roomPlugin'], 'skills': [], 'tools': [], 'sub_agents': []}}

    def knowledge(self, id):
        return {'id': id, 'display_name': id, 'description': f'{id} knowledge base'}

    def test_contract_routes_exist(self):
        schema = self.client.get('/openapi.json').json()
        contract = json.loads((Path(__file__).parent / 'marketplace-openapi.json').read_text())
        self.assertEqual(schema, contract)
        self.assertIn('x-wonder-room', json.dumps(schema).lower())
        expected = {(method.upper(), path) for path, methods in contract['paths'].items() for method in methods}
        actual = {(method, route.path.replace('{path:path}', '{path}')) for route in self.client.app.routes
          for method in getattr(route, 'methods', set())}
        self.assertEqual(expected - actual, set())

    def test_model_factory_can_be_selected_by_environment(self):
        with tempfile.TemporaryDirectory() as data_dir, patch.dict(os.environ,
          {'MARKETPLACE_MODEL_FACTORY': 'marketplace_e2e_model:model_factory'}):
            app = create_agent_os_app(data_dir)
            self.assertIs(app.state.marketplace_runtime.model_factory, model_factory)

    def test_crud_artifacts_versions_audit_and_references(self):
        created = self.request('POST', '/api/v1/skills/', json=self.skill())
        self.assertEqual(created.status_code, 201)
        self.assertEqual(self.request('POST', '/api/v1/skills/', json=self.skill()).status_code, 409)
        expanded = self.request('GET', '/api/v1/skills/roomFactsSkill?includeAssets=true').json()
        self.assertEqual(expanded['assets'][0]['content_b64'], 'UkVGRVJFTkNFLU9L')
        self.assertEqual((expanded['id'], expanded['display_name']), ('roomFactsSkill', 'Room facts'))
        self.assertNotIn('hebrew_display_name', expanded)
        self.assertEqual(self.request('GET', '/api/v1/skills/roomFactsSkill/SKILL.md').text,
          '# Room facts\nTHE ORBITAL CODE IS AMBER-17.')
        self.assertEqual(self.request('GET', '/api/v1/skills/roomFactsSkill/assets/references/fact.txt').content, b'REFERENCE-OK')
        self.assertTrue(self.request('GET', '/api/v1/skills/roomFactsSkill/SKILL.md').headers['content-type'].startswith('text/plain'))
        updated = self.request('PUT', '/api/v1/skills/roomFactsSkill', json={'display_name': 'Updated facts'}).json()
        self.assertEqual((updated['id'], updated['display_name']), ('roomFactsSkill', 'Updated facts'))
        self.assertEqual(self.request('PUT', '/api/v1/skills/roomFactsSkill', json={'id': 'renamedSkill'}).status_code, 422)
        updated = self.request('PUT', '/api/v1/skills/roomFactsSkill', json={'description': 'Updated'}).json()
        self.assertEqual((updated['version'], updated['description']), (3, 'Updated'))
        versions = self.request('GET', '/api/v1/skills/roomFactsSkill/versions').json()
        self.assertEqual((len(versions), versions[0]['version'], versions[0]['display_name']), (2, 1, 'Room facts'))
        self.assertEqual(self.request('GET', '/api/v1/skills/roomFactsSkill/versions/1').json()['assets'][0]['content_b64'],
          'UkVGRVJFTkNFLU9L')
        self.assertEqual([event['action'] for event in self.request('GET', '/api/v1/audit/skill/roomFactsSkill').json()],
          ['create', 'update', 'update'])
        tool = self.request('POST', '/api/v1/tools/', json=self.tool()).json()
        self.assertEqual(tool['tags'], [])
        code = self.request('GET', '/api/v1/tools/numberTool/code/tool.py')
        self.assertTrue(code.headers['content-type'].startswith('text/plain'))
        self.request('PUT', '/api/v1/tools/numberTool', json={'description': 'Updated'})
        self.assertEqual(self.request('GET', '/api/v1/tools/numberTool/versions/1').json()['id'], 'numberTool')
        plugin = {'id': 'roomPlugin', 'display_name': 'Room plugin', 'description': 'Bundle',
          'config': {'skills': ['roomFactsSkill'], 'tools': ['numberTool']}, 'readme': '# Bundle'}
        self.assertEqual(self.request('POST', '/api/v1/plugins/', json=plugin).status_code, 201)
        self.assertTrue(self.request('GET', '/api/v1/plugins/roomPlugin/references').json()['valid'])
        self.assertIn('skills:', self.request('GET', '/api/v1/plugins/roomPlugin/config.yaml').text)
        readme = self.request('GET', '/api/v1/plugins/roomPlugin/README.md')
        self.assertEqual(readme.text, '# Bundle')
        self.assertTrue(readme.headers['content-type'].startswith('text/plain'))
        self.assertEqual(self.request('DELETE', '/api/v1/tools/numberTool').status_code, 204)
        self.assertEqual(self.request('GET', '/api/v1/tools/numberTool').status_code, 404)
        self.assertEqual(self.objects.list('marketplace/tools/numberTool/'), [])
        self.assertEqual([event['action'] for event in self.request('GET', '/api/v1/audit/tool/numberTool').json()],
          ['create', 'update', 'delete'])
        self.assertFalse(self.request('GET', '/api/v1/plugins/roomPlugin/references').json()['valid'])

    def test_users_and_real_minio_presign(self):
        user = self.request('POST', '/api/v1/users/', json={'username': 'reviewer'}).json()
        self.assertEqual(self.request('GET', f"/api/v1/users/{user['uid']}").json()['username'], 'reviewer')
        upload = self.request('POST', '/api/v1/presign/upload', json={'key': 'uploads/a.txt', 'content_type': 'text/plain'}).json()
        self.assertIn(f'/{self.objects.bucket}/marketplace/uploads/a.txt', upload['url'])
        put = httpx.put(upload['url'], content=b'PRESIGNED-OK', headers=upload['headers'])
        self.assertEqual(put.status_code, 200, put.text)
        self.assertEqual(self.objects.get('marketplace/uploads/a.txt'), b'PRESIGNED-OK')
        download = self.request('POST', '/api/v1/presign/download', json={'key': 'uploads/a.txt'}).json()
        self.assertEqual(httpx.get(download['url']).content, b'PRESIGNED-OK')

    def test_rooms_isolate_resources_users_presigned_files_and_agents(self):
        room_headers = lambda room: {'x-wonder-room': room}
        for room, fact in [('room-a', 'ROOM_A_FACT'), ('room-b', 'ROOM_B_FACT')]:
            skill = self.skill()
            skill['skill_md'] = fact
            agent = self.agent()
            agent['config']['plugins'], agent['config']['skills'] = [], ['roomFactsSkill']
            self.assertEqual(self.request('POST', '/api/v1/skills/', headers=room_headers(room), json=skill).status_code, 201)
            self.assertEqual(self.request('POST', '/api/v1/agents/', headers=room_headers(room), json=agent).status_code, 201)
        self.assertEqual(self.request('GET', '/api/v1/skills/roomFactsSkill').status_code, 404)
        self.assertEqual(self.request('GET', '/api/v1/skills/roomFactsSkill',
          headers=room_headers('room-a')).json()['skill_md'], 'ROOM_A_FACT')
        user = self.request('POST', '/api/v1/users/', headers=room_headers('room-a'), json={'username': 'room-user'}).json()
        self.assertEqual(self.request('GET', f"/api/v1/users/{user['uid']}", headers=room_headers('room-b')).status_code, 404)
        upload = self.request('POST', '/api/v1/presign/upload', headers=room_headers('room-a'), json={'key': 'uploads/a.txt'}).json()
        self.assertIn(f'/{self.objects.bucket}/room-a/uploads/a.txt', upload['url'])
        for room, fact in [('room-a', 'ROOM_A_FACT'), ('room-b', 'ROOM_B_FACT')]:
            run = self.agno.post('/agents/roomAgent/runs', headers=room_headers(room), data={
              'message': 'What is the room fact?', 'session_id': room, 'user_id': 'tester', 'stream': 'false'})
            self.assertEqual(run.status_code, 200, run.text)
            self.assertIn(fact, run.json()['content'])
        self.assertEqual(self.request('GET', '/api/v1/skills/', headers=room_headers('bad/room')).status_code, 422)

    def test_corrupt_stored_events_are_skipped_and_users_return_422(self):
        user = self.request('POST', '/api/v1/users/', json={'username': 'corrupt'}).json()
        self.objects.put('marketplace/audit/skill/missing/00000000.json', b'{')
        self.objects.put(f"marketplace/users/{user['uid']}.json", b'{')
        self.assertEqual(self.request('GET', '/api/v1/audit/skill/missing').json(), [])
        self.assertEqual(self.request('GET', f"/api/v1/users/{user['uid']}").status_code, 422)

    def test_corrupt_manifests_are_logged_and_skipped(self):
        self.request('POST', '/api/v1/skills/', json=self.skill())
        legacy = {'data': {'display_name': 'legacySkill', 'hebrew_display_name': 'Legacy skill', 'description': 'Legacy'},
          'version': 1, 'created_at': '2026-01-01', 'updated_at': '2026-01-01'}
        self.objects.put('marketplace/skills/legacySkill/manifest.json', json.dumps(legacy).encode())
        self.objects.put('marketplace/skills/legacy/manifest.json', b'{"display_name":"legacy"}')
        self.objects.put('marketplace/skills/broken/manifest.json', b'{')
        with self.assertLogs('marketplace_storage', level='WARNING') as logs:
            response = self.request('GET', '/api/v1/skills/')
        listed = {item['id']: item for item in response.json()}
        self.assertEqual(set(listed), {'legacySkill', 'roomFactsSkill'})
        self.assertEqual(listed['legacySkill']['display_name'], 'Legacy skill')
        self.assertNotIn('hebrew_display_name', listed['legacySkill'])
        self.assertTrue(all(name in '\n'.join(logs.output) for name in ['legacy', 'broken']))

    def test_photographed_schema_examples_round_trip(self):
        for kind in ['Skill', 'Tool', 'Plugin', 'Agent', 'Knowledge']:
            body, plural = self.examples[f'create{kind}'], kind.lower() if kind == 'Knowledge' else f'{kind.lower()}s'
            self.assertEqual(self.request('POST', f'/api/v1/{plural}/', json=body).status_code, 201)
            self.assertEqual(self.request('GET', f"/api/v1/{plural}/{body['id']}").status_code, 200)
            self.assertEqual(self.request('PUT', f"/api/v1/{plural}/{body['id']}",
              json=self.examples[f'update{kind}']).status_code, 200)
        user = self.request('POST', '/api/v1/users/', json=self.examples['createUser'])
        self.assertEqual(self.request('GET', f"/api/v1/users/{user.json()['uid']}").status_code, 200)
        for action in ['download', 'upload']:
            self.assertEqual(self.request('POST', f'/api/v1/presign/{action}',
              json=self.examples[f'presign{action.title()}']).status_code, 200)

    def test_multiple_knowledge_bases_are_managed_and_connected_to_agents(self):
        for id, fact in [('finance', 'FINANCE_CODE_GOLD_41'), ('legal', 'LEGAL_CODE_BLUE_92')]:
            self.assertEqual(self.request('POST', '/api/v1/knowledge/', json=self.knowledge(id)).status_code, 201)
            content = self.request('POST', f'/api/v1/knowledge/{id}/content',
              data={'name': f'{id} facts', 'text_content': fact, 'metadata': json.dumps({'domain': id})})
            self.assertEqual(content.status_code, 202, content.text)
            self.assertEqual(content.json()['status'], 'processing')
        agent = self.agent()
        agent['config'] |= {'plugins': [], 'knowledge_bases': ['finance', 'legal']}
        self.assertEqual(self.request('POST', '/api/v1/agents/', json=agent).status_code, 201)
        self.assertTrue(self.request('GET', '/api/v1/agents/roomAgent/references').json()['valid'])
        run = self.agno.post('/agents/roomAgent/runs', data={'message': 'Find FINANCE_CODE_GOLD_41 and LEGAL_CODE_BLUE_92.',
          'session_id': 'knowledge', 'user_id': 'tester', 'stream': 'false'})
        self.assertEqual(run.status_code, 200, run.text)
        self.assertIn('FINANCE_CODE_GOLD_41', run.json()['content'])
        self.assertIn('LEGAL_CODE_BLUE_92', run.json()['content'])
        for id in ['finance', 'legal']:
            content = self.request('GET', f'/api/v1/knowledge/{id}/content').json()['data'][0]
            self.assertEqual(self.request('GET', f"/api/v1/knowledge/{id}/content/{content['id']}/status").json()['status'],
              'completed')

    def test_agentos_uses_saved_plugin_skill_and_tool_updates(self):
        plugin = {'id': 'roomPlugin', 'display_name': 'Room plugin', 'description': 'Bundle',
          'config': {'skills': ['roomFactsSkill'], 'tools': []}}
        resources = [('/api/v1/skills/', self.skill()), ('/api/v1/tools/', self.tool()),
          ('/api/v1/plugins/', plugin), ('/api/v1/agents/', self.agent())]
        for path, body in resources:
            self.assertEqual(self.request('POST', path, json=body).status_code, 201)
        def agent_run(session):
            response = self.agno.post('/agents/roomAgent/runs', data={
              'message': 'What is the code? Double 21.', 'session_id': session, 'user_id': 'tester', 'stream': 'false'})
            self.assertEqual(response.status_code, 200, response.text)
            return response.json()
        skill_only = agent_run('skill-only')
        self.assertIn('THE ORBITAL CODE IS AMBER-17', skill_only['content'])
        self.assertNotIn('TOOL_CALLED', skill_only['content'])
        self.request('PUT', '/api/v1/plugins/roomPlugin', json={'config': {'skills': ['roomFactsSkill'], 'tools': ['numberTool']}})
        plugin_run = agent_run('plugin-updated')
        self.assertIn('THE ORBITAL CODE IS AMBER-17', plugin_run['content'])
        self.assertIn('TOOL_CALLED:42', plugin_run['content'])
        executions = plugin_run.get('tools') or plugin_run.get('tool_executions') or []
        names = [item.get('tool_name') or item.get('name') for item in executions]
        self.assertIn('get_skill_instructions', names)
        self.assertIn('numberTool', names)
        self.request('PUT', '/api/v1/skills/roomFactsSkill', json={'skill_md': '# Updated\nSAVED_SKILL_UPDATE'})
        self.request('PUT', '/api/v1/tools/numberTool', json={'code_files': [{'path': 'tool.py',
          'content': "def double(value: int) -> str:\n    return f'SAVED_TOOL_UPDATE:{value * 2}'\n"}]})
        updated = agent_run('resources-updated')
        self.assertIn('SAVED_SKILL_UPDATE', updated['content'])
        self.assertIn('SAVED_TOOL_UPDATE:42', updated['content'])


if __name__ == '__main__':
    unittest.main()
