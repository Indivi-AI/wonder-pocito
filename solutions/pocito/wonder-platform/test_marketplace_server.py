import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request, urlopen
from uuid import uuid4

from agno.db.in_memory import InMemoryDb
from fastapi.testclient import TestClient

from marketplace_e2e_model import model_factory
from marketplace_server import S3ObjectStore, create_app


class MarketplaceServerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = S3ObjectStore(f'marketplace-test-{uuid4().hex}')
        self.client = TestClient(create_app(self.temp.name, model_factory, self.store))
        self.examples = json.loads((Path(__file__).parent / 'marketplace-api-examples.json').read_text())

    def tearDown(self):
        self.client.close()
        self.store.delete_prefix('')
        self.store.client.delete_bucket(Bucket=self.store.bucket)
        self.temp.cleanup()

    def request(self, method, path, **kwargs):
        return self.client.request(method, path, **kwargs)

    def skill(self, description='Knows the room code.'):
        return {'display_name': 'room-facts', 'description': description,
          'skill_md': '# Room facts\nTHE ORBITAL CODE IS AMBER-17.',
          'assets': [{'path': 'references/fact.txt', 'content_b64': 'UkVGRVJFTkNFLU9L', 'mime_type': 'text/plain'}]}

    def tool(self):
        return {'display_name': 'number-tool', 'description': 'Doubles a number.', 'tool_type': 'code',
          'json_schema': {'type': 'object', 'properties': {'value': {'type': 'integer'}}, 'required': ['value']},
          'dedicated_tool_config': {'entrypoint': 'tool.py:double'},
          'code_files': [{'path': 'tool.py', 'content': "def double(value: int) -> str:\n    return f'TOOL_CALLED:{value * 2}'\n"}]}

    def agent(self):
        return {'display_name': 'room-agent', 'description': 'Uses room facts.', 'config': {
          'system_prompt': 'Use the configured skill and tool.', 'backend_config': {'harness_type': 'deepagents'},
          'plugins': ['room-plugin'], 'skills': [], 'tools': [], 'sub_agents': []}}

    def test_contract_routes_exist(self):
        schema = self.client.get('/openapi.json').json()
        contract = json.loads((Path(__file__).parent / 'marketplace-openapi.json').read_text())
        self.assertEqual(schema, contract)
        self.assertNotIn('x-wonder-room', json.dumps(schema).lower())
        expected = {(method.upper(), path) for path, methods in contract['paths'].items() for method in methods}
        actual = {(method, route.path.replace('{path:path}', '{path}')) for route in self.client.app.routes
          for method in getattr(route, 'methods', set())}
        self.assertEqual(expected - actual, set())

    def test_model_factory_can_be_selected_by_environment(self):
        with tempfile.TemporaryDirectory() as data_dir, patch.dict(os.environ,
          {'MARKETPLACE_MODEL_FACTORY': 'marketplace_e2e_model:model_factory'}):
            app = create_app(data_dir, objects=self.store)
            self.assertIs(app.state.marketplace_runtime.model_factory, model_factory)

    def test_crud_artifacts_versions_audit_and_references(self):
        created = self.request('POST', '/api/v1/skills/', json=self.skill())
        self.assertEqual(created.status_code, 201)
        self.assertEqual(self.request('POST', '/api/v1/skills/', json=self.skill()).status_code, 409)
        expanded = self.request('GET', '/api/v1/skills/room-facts?includeAssets=true').json()
        self.assertEqual(expanded['assets'][0]['content_b64'], 'UkVGRVJFTkNFLU9L')
        self.assertEqual(self.request('GET', '/api/v1/skills/room-facts/SKILL.md').text,
          '# Room facts\nTHE ORBITAL CODE IS AMBER-17.')
        self.assertEqual(self.request('GET', '/api/v1/skills/room-facts/assets/references/fact.txt').content, b'REFERENCE-OK')
        self.assertTrue(self.request('GET', '/api/v1/skills/room-facts/SKILL.md').headers['content-type'].startswith('text/plain'))
        updated = self.request('PUT', '/api/v1/skills/room-facts', json={'description': 'Updated'}).json()
        self.assertEqual((updated['version'], updated['description']), (2, 'Updated'))
        versions = self.request('GET', '/api/v1/skills/room-facts/versions').json()
        self.assertEqual((len(versions), versions[0]['version'], versions[0]['description']), (1, 1, 'Knows the room code.'))
        self.assertEqual(self.request('GET', '/api/v1/skills/room-facts/versions/1').json()['assets'][0]['content_b64'],
          'UkVGRVJFTkNFLU9L')
        self.assertEqual([event['action'] for event in self.request('GET', '/api/v1/audit/skill/room-facts').json()],
          ['create', 'update'])
        tool = self.request('POST', '/api/v1/tools/', json=self.tool()).json()
        self.assertEqual(tool['tags'], [])
        code = self.request('GET', '/api/v1/tools/number-tool/code/tool.py')
        self.assertTrue(code.headers['content-type'].startswith('text/plain'))
        self.request('PUT', '/api/v1/tools/number-tool', json={'description': 'Updated'})
        self.assertNotIn('id', self.request('GET', '/api/v1/tools/number-tool/versions/1').json())
        plugin = {'display_name': 'room-plugin', 'description': 'Bundle',
          'config': {'skills': ['room-facts'], 'tools': ['number-tool']}, 'readme': '# Bundle'}
        self.assertEqual(self.request('POST', '/api/v1/plugins/', json=plugin).status_code, 201)
        self.assertTrue(self.request('GET', '/api/v1/plugins/room-plugin/references').json()['valid'])
        self.assertIn('skills:', self.request('GET', '/api/v1/plugins/room-plugin/config.yaml').text)
        readme = self.request('GET', '/api/v1/plugins/room-plugin/README.md')
        self.assertEqual(readme.text, '# Bundle')
        self.assertTrue(readme.headers['content-type'].startswith('text/plain'))

    def test_users_and_real_local_presign(self):
        user = self.request('POST', '/api/v1/users/', json={'username': 'reviewer'}).json()
        self.assertEqual(self.request('GET', f"/api/v1/users/{user['uid']}").json()['username'], 'reviewer')
        upload = self.request('POST', '/api/v1/presign/upload', json={'key': 'uploads/a.txt', 'content_type': 'text/plain'}).json()
        request = Request(upload['url'], data=b'PRESIGNED-OK', method='PUT', headers=upload['headers'])
        self.assertEqual(urlopen(request).status, 200)
        download = self.request('POST', '/api/v1/presign/download', json={'key': 'uploads/a.txt'}).json()
        self.assertEqual(urlopen(download['url']).read(), b'PRESIGNED-OK')

    def test_corrupt_stored_events_are_skipped_and_users_return_422(self):
        user = self.request('POST', '/api/v1/users/', json={'username': 'corrupt'}).json()
        repo = self.client.app.state.marketplace_repo
        repo.objects.put('marketplace/audit/skill/missing/corrupt.json', b'{')
        repo.objects.put(f"marketplace/users/{user['uid']}.json", b'{')
        self.assertEqual(self.request('GET', '/api/v1/audit/skill/missing').json(), [])
        self.assertEqual(self.request('GET', f"/api/v1/users/{user['uid']}").status_code, 422)

    def test_photographed_schema_examples_round_trip(self):
        resources = []
        for kind in ['Skill', 'Tool', 'Plugin', 'Agent']:
            body, plural = self.examples[f'create{kind}'], f'{kind.lower()}s'
            self.assertEqual(self.request('POST', f'/api/v1/{plural}/', json=body).status_code, 201)
            self.assertEqual(self.request('GET', f"/api/v1/{plural}/{body['display_name']}").status_code, 200)
            self.assertEqual(self.request('PUT', f"/api/v1/{plural}/{body['display_name']}",
              json=self.examples[f'update{kind}']).status_code, 200)
            resources.append((plural, body['display_name']))
        user = self.request('POST', '/api/v1/users/', json=self.examples['createUser'])
        self.assertEqual(self.request('GET', f"/api/v1/users/{user.json()['uid']}").status_code, 200)
        for action in ['download', 'upload']:
            self.assertEqual(self.request('POST', f'/api/v1/presign/{action}',
              json=self.examples[f'presign{action.title()}']).status_code, 200)
        for plural, name in reversed(resources):
            self.assertEqual(self.request('DELETE', f'/api/v1/{plural}/{name}').status_code, 204)
            self.assertEqual(self.request('GET', f'/api/v1/{plural}/{name}').status_code, 404)
            self.assertEqual(self.request('GET', f'/api/v1/{plural}/').json(), [])

    def test_minio_is_the_only_persistent_store(self):
        self.assertEqual(self.request('POST', '/api/v1/skills/', json=self.skill()).status_code, 201)
        with tempfile.TemporaryDirectory() as runtime_dir:
            second = TestClient(create_app(runtime_dir, model_factory, S3ObjectStore(self.store.bucket, self.store.client)))
            self.assertEqual(second.get('/api/v1/skills/room-facts').status_code, 200)
            self.assertIsInstance(second.app.state.marketplace_runtime.db, InMemoryDb)
            second.close()
        self.assertFalse(list(Path(self.temp.name).rglob('*.db')))
        self.assertIn('marketplace/skills/room-facts/manifest.json', self.store.list('marketplace/skills/room-facts/'))

    def test_agentos_uses_saved_plugin_skill_and_tool_updates(self):
        plugin = {'display_name': 'room-plugin', 'description': 'Bundle', 'config': {'skills': ['room-facts'], 'tools': []}}
        resources = [('/api/v1/skills/', self.skill()), ('/api/v1/tools/', self.tool()),
          ('/api/v1/plugins/', plugin), ('/api/v1/agents/', self.agent())]
        for path, body in resources:
            self.assertEqual(self.request('POST', path, json=body).status_code, 201)
        def agent_run(session):
            response = self.request('POST', '/agents/room-agent/runs', data={
              'message': 'What is the code? Double 21.', 'session_id': session, 'user_id': 'tester', 'stream': 'false'})
            self.assertEqual(response.status_code, 200, response.text)
            return response.json()
        skill_only = agent_run('skill-only')
        self.assertIn('THE ORBITAL CODE IS AMBER-17', skill_only['content'])
        self.assertNotIn('TOOL_CALLED', skill_only['content'])
        self.request('PUT', '/api/v1/plugins/room-plugin', json={'config': {'skills': ['room-facts'], 'tools': ['number-tool']}})
        plugin_run = agent_run('plugin-updated')
        self.assertIn('THE ORBITAL CODE IS AMBER-17', plugin_run['content'])
        self.assertIn('TOOL_CALLED:42', plugin_run['content'])
        executions = plugin_run.get('tools') or plugin_run.get('tool_executions') or []
        names = [item.get('tool_name') or item.get('name') for item in executions]
        self.assertIn('get_skill_instructions', names)
        self.assertIn('number_tool', names)
        self.request('PUT', '/api/v1/skills/room-facts', json={'skill_md': '# Updated\nSAVED_SKILL_UPDATE'})
        self.request('PUT', '/api/v1/tools/number-tool', json={'code_files': [{'path': 'tool.py',
          'content': "def double(value: int) -> str:\n    return f'SAVED_TOOL_UPDATE:{value * 2}'\n"}]})
        updated = agent_run('resources-updated')
        self.assertIn('SAVED_SKILL_UPDATE', updated['content'])
        self.assertIn('SAVED_TOOL_UPDATE:42', updated['content'])


if __name__ == '__main__':
    unittest.main()
