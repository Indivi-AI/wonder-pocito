import asyncio
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace

POCITO = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(POCITO / 'agno-server'), str(POCITO / 'marketplace-schema')]

from agno_server import MarketplaceAgentRuntime, make_flow_package_executor, make_file_reader_tool
from agno.run import RunContext
from agno.tools.function import Function, FunctionCall


class FlowToolTest(unittest.TestCase):
    def test_result_isolation_and_pagination(self):
        stored = {}
        def get(key):
            if key not in stored:
                raise FileNotFoundError(key)
            return stored[key]
        repo = SimpleNamespace(objects=SimpleNamespace(put=lambda key, body, *_: stored.update({key: body}), get=get))
        context = RunContext(run_id='run-1', session_id='chat-1', user_id='user-1')
        execute = make_flow_package_executor('101', repo=repo, output_cubes=[{'Name': 'Products'}], room='room-a')
        tool = Function(name='products', entrypoint=execute, skip_entrypoint_processing=True)
        tool._run_context = context
        with patch('urllib.request.urlopen') as urlopen:
            urlopen.return_value.__enter__.return_value.read.return_value = json.dumps({'results': {'Products': list(range(12))}}).encode()
            call = FunctionCall(function=tool, arguments={})
            call.execute()
            first = call.result
            second = execute(_agno_run_context=context)
        self.assertEqual(first['rows'], list(range(5)))
        self.assertEqual(first['total_rows'], 12)
        self.assertNotEqual(first['result_id'], second['result_id'])
        reader = make_file_reader_tool(repo, 'room-a')
        reader._run_context = RunContext(run_id='run-2', session_id='chat-1', user_id='user-1')
        call = FunctionCall(function=reader, arguments={'result_id': first['result_id'], 'offset': 5, 'limit': 3})
        call.execute()
        self.assertEqual(call.result['rows'], [5, 6, 7])
        for room, session, user in [('room-b', 'chat-1', 'user-1'), ('room-a', 'chat-2', 'user-1'), ('room-a', 'chat-1', 'user-2')]:
            with self.assertRaises(ValueError):
                make_file_reader_tool(repo, room).entrypoint(first['result_id'],
                  _agno_run_context=RunContext(run_id='r', session_id=session, user_id=user))
        for result_id in ['../files/data', '/secret', 'files/table.json']:
            with self.assertRaises(ValueError):
                reader.entrypoint(result_id, _agno_run_context=context)
        with self.assertRaises(ValueError):
            reader.entrypoint(first['result_id'], limit=201, _agno_run_context=context)
        self.assertTrue(all(key.startswith('room-a/results/') for key in stored))

    def tool(self):
        runtime = MarketplaceAgentRuntime.__new__(MarketplaceAgentRuntime)
        runtime.repo = type('Repo', (), {'get': lambda *_, **__: {'tool_type': 'flow_package', 'package_id': '101',
          'description': 'Email search', 'input_schema': [
            {'Name': 'query', 'Type': 'String', 'Description': 'Search text', 'IsRequired': False}]}})()
        return asyncio.run(runtime.tool('marketplace', 'northstar-company-email'))

    def test_schema_and_request_contract(self):
        tool = self.tool()
        tool.process_entrypoint()
        self.assertEqual(tool.parameters['required'], [])
        self.assertNotIn('flat_args', tool.parameters['properties'])
        with patch.dict(os.environ, {'FLAPI_BASE_URL': 'http://flapi.test', 'FLAPI_TOKEN': 'token',
          'FLAPI_USERNAME': 'user'}), patch('urllib.request.urlopen') as urlopen:
            urlopen.return_value.__enter__.return_value.read.return_value = b'{"results": {}}'
            self.assertEqual(tool.entrypoint(query='Tom'), {'results': {}})
            request = urlopen.call_args.args[0]
            self.assertEqual(json.loads(request.data), {'params': {'query': 'Tom'}})
            self.assertEqual((request.get_header('Authorization'), request.get_header('Username')), ('token', 'user'))


if __name__ == '__main__':
    unittest.main()
