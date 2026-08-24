import json
import re

from agno.models.base import Model
from agno.models.response import ModelResponse


def example(schema):
    if schema.get('enum'):
        return schema['enum'][0]
    return {'integer': 21, 'number': 21, 'boolean': True, 'array': [], 'object': {}}.get(schema.get('type'), 'e2e')


class MarketplaceE2EModel(Model):
    def __init__(self):
        super().__init__(id='marketplace-e2e', provider='deterministic')

    def invoke(self, messages, tools=None, **kwargs):
        results = [message.get_content_string() for message in messages if message.role == 'tool']
        functions = {item['function']['name']: item['function'] for item in tools or [] if item.get('type') == 'function'}
        system = '\n'.join(message.get_content_string() for message in messages if message.role == 'system')
        skill = re.search(r'<skill>.*?<name>(.*?)</name>', system, re.S)
        if not results and skill:
            return self.call('get_skill_instructions', {'skill_name': skill.group(1)}, 'skill')
        saved = next((item for name, item in functions.items() if not name.startswith('get_skill_')), None)
        if saved and len(results) == bool(skill):
            schema = saved.get('parameters') or {}
            args = {name: example(spec) for name, spec in schema.get('properties', {}).items() if name in schema.get('required', [])}
            return self.call(saved['name'], args, 'tool')
        return ModelResponse(content='\n'.join(results) or 'No marketplace skill or tool is configured.')

    def call(self, name, arguments, call_id):
        return ModelResponse(tool_calls=[{'id': call_id, 'type': 'function',
          'function': {'name': name, 'arguments': json.dumps(arguments)}}])

    async def ainvoke(self, *args, **kwargs):
        return self.invoke(*args, **kwargs)

    def invoke_stream(self, *args, **kwargs):
        yield self.invoke(*args, **kwargs)

    async def ainvoke_stream(self, *args, **kwargs):
        yield self.invoke(*args, **kwargs)

    def _parse_provider_response(self, response, **kwargs):
        return response

    def _parse_provider_response_delta(self, response):
        return response


def model_factory(_):
    return MarketplaceE2EModel()
