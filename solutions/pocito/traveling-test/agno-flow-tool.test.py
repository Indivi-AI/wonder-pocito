import asyncio
import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

POCITO = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(POCITO / 'agno-server'), str(POCITO / 'marketplace-schema')]

from agno_server import MarketplaceAgentRuntime


class FlowToolTest(unittest.TestCase):
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
