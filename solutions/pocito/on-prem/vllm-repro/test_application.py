"""Live regression of the application's Agno factory; configure OPENAI_BASE_URL, OPENAI_API_KEY and OPENAI_MODEL."""
import asyncio
import json
import os
import sys
from importlib.metadata import version
from pathlib import Path
from tempfile import TemporaryDirectory

import httpx

sys.path.append(str(Path(__file__).resolve().parents[2] / 'agno-server'))
from agno_server import MarketplaceAgentRuntime


async def check_conversation(stream):
    exchanges, calculations = [], []

    async def record(response):
        exchanges.append(json.loads(response.request.content))
        exchanges[-1].update(path=response.request.url.path, status=response.status_code)
        if response.is_error:
            exchanges[-1]['error'] = (await response.aread()).decode()
        assert len(exchanges) <= 4, 'Unexpected additional model call'

    def multiply(a: int, b: int) -> int:
        """Multiply two integers."""
        calculations.append((a, b, a * b))
        agent.model.request_params = {'tool_choice': 'none'}
        return a * b

    async def turn(agent, message):
        if stream:
            events = [event async for event in agent.arun(message, session_id='regression', stream=True, stream_events=True)]
            assert not any(event.event == 'RunError' for event in events), events
            assert any(event.event == 'RunCompleted' for event in events), events
            assert any(event.content for event in events if event.event == 'RunContent'), events
        else:
            result = await agent.arun(message, session_id='regression')
            assert result.content and result.status.value == 'COMPLETED', exchanges
        assert all(item['path'] == '/v1/chat/completions' and item['status'] == 200 for item in exchanges), exchanges
        assert all('previous_response_id' not in item for item in exchanges), exchanges

    with TemporaryDirectory(prefix='pocito-agno-regression-') as runtime_dir:
        runtime = MarketplaceAgentRuntime(None, runtime_dir)
        async with httpx.AsyncClient(event_hooks={'response': [record]}, timeout=120) as client:
            async def build():
                agent = await runtime.build_agent('regression', {'display_name': 'Regression', 'config': {
                    'system_prompt': 'Reply in one short sentence. Use the tool when asked to multiply.'}}, 'regression', [])
                agent.model.http_client, agent.model.max_retries = client, 0
                agent.model.max_tokens, agent.model.temperature = 64, 0
                agent.tool_choice = 'none'
                return agent

            await turn(await build(), 'Say hello.')
            assert len(exchanges) == 1, exchanges
            agent = await build()
            agent.tools = [multiply]
            agent.tool_choice = {'type': 'function', 'function': {'name': 'multiply'}}
            await turn(agent, 'Use multiply to multiply 6 by 7, then tell me the result.')
            assert len(exchanges) == 3 and len(calculations) == 1, (exchanges, calculations)
            assert [item['role'] for item in exchanges[1]['messages']][-3:] == ['user', 'assistant', 'user'], exchanges[1]
            assistant, tool = exchanges[2]['messages'][-2:]
            assert assistant['role'] == 'assistant' and tool['role'] == 'tool', (assistant, tool)
            call = assistant['tool_calls'][0]
            assert call['function']['name'] == 'multiply' and call['id'] == tool['tool_call_id'], (call, tool)
            assert json.loads(call['function']['arguments']) == dict(zip(('a', 'b'), calculations[0][:2])), call
            assert tool['content'] == str(calculations[0][2]), tool
            await turn(await build(), 'Say goodbye.')
            assert len(exchanges) == 4, exchanges
            assert [item['role'] for item in exchanges[3]['messages']][-7:] == [
                'user', 'assistant', 'user', 'assistant', 'tool', 'assistant', 'user'], exchanges[3]
        runtime.vector_db_engine.dispose()
    print(f"PASS: {os.environ['OPENAI_MODEL']}, stream={stream}; 4 Chat Completions calls, real tool, preserved session history")


async def main():
    assert version('agno') == '2.8.5', version('agno')
    for stream in (False, True):
        await asyncio.wait_for(check_conversation(stream), timeout=180)


if __name__ == '__main__':
    asyncio.run(main())
