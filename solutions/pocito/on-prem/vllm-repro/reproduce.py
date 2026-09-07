"""Real Agno → LiteLLM → vLLM reproduction of the adapter introduced in b2f46a66."""
import asyncio
import json
import os
from importlib.metadata import version

import httpx
from agno.agent import Agent
from agno.db.in_memory import InMemoryDb
from agno.exceptions import ModelProviderError
from agno.models.openai import OpenAIChat
from agno.models.openai.responses import OpenAIResponses


class LiteLLMResponses(OpenAIResponses):
    def _using_reasoning_model(self):
        return True


async def run_turn(agent, message, stream):
    try:
        if stream:
            events = [event async for event in agent.arun(message, session_id="repro", stream=True, stream_events=True)]
            if any(event.event == "RunError" for event in events):
                return None
            return "".join(event.content or "" for event in events if event.event == "RunContent")
        return (await agent.arun(message, session_id="repro")).content
    except ModelProviderError:
        return None


async def check_continuation(base_url, model_type, stream, storage):
    exchanges = []

    async def record(response):
        body = json.loads(response.request.content)
        exchange = {"path": response.request.url.path, "request": body, "status": response.status_code}
        if response.is_error:
            await response.aread()
            exchange["error"] = response.json()
        exchanges.append(exchange)
        print(json.dumps({"url": str(response.request.url), "status": response.status_code,
            "previous_response_id": body.get("previous_response_id"), "store": body.get("store")}))

    async with httpx.AsyncClient(event_hooks={"response": [record]}, timeout=120) as client:
        options = {"max_tokens": 24} if model_type is OpenAIChat else {"max_output_tokens": 24, "reasoning_summary": "auto"}
        model = model_type(id="tiny", api_key="unused", base_url=base_url, http_client=client, max_retries=0, temperature=0, **options)
        agent = Agent(model=model, db=InMemoryDb(), add_history_to_context=True, telemetry=False,
            instructions=["Reply in one short sentence."], markdown=True)
        first = await run_turn(agent, "Say hello in one short sentence.", stream)
        assert first and len(exchanges) == 1 and exchanges[0]["status"] == 200, (first, exchanges)
        second = await run_turn(agent, "Say goodbye in one short sentence.", stream)
        assert len(exchanges) == 2, exchanges
        expected_path = "/v1/chat/completions" if model_type is OpenAIChat else "/v1/responses"
        assert all(item["path"] == expected_path for item in exchanges), exchanges
        continuation = exchanges[1]["request"].get("previous_response_id")
        if model_type is OpenAIChat:
            assert all("previous_response_id" not in item["request"] for item in exchanges), exchanges
            assert [item["role"] for item in exchanges[1]["request"]["messages"]][-3:] == ["user", "assistant", "user"], exchanges
        else:
            assert continuation and exchanges[1]["request"]["store"] is True, exchanges
            assert len(exchanges[1]["request"]["input"]) == 1, exchanges
        if model_type is LiteLLMResponses and not storage:
            error = json.dumps(exchanges[1].get("error", {}))
            assert exchanges[1]["status"] in (400, 404) and "Response with id" in error and "not found" in error, exchanges
            print(f"PASS: reproduced missing-response-ID failure ({base_url}, stream={stream})")
        else:
            assert second and exchanges[1]["status"] == 200, (second, exchanges)
            print(f"PASS: two generated answers ({model_type.__name__}, {base_url}, stream={stream})")


async def main():
    print({name: version(name) for name in ("agno", "openai", "litellm")})
    storage = os.getenv("RESPONSES_STORE", "0") == "1"
    for base_url in ("http://vllm:8000/v1", "http://litellm:4000/v1"):
        for model_type in (LiteLLMResponses, OpenAIChat):
            for stream in (False, True):
                await check_continuation(base_url, model_type, stream, storage)
    print(f"PASS: all 8 real-model checks; response storage={int(storage)}")


if __name__ == "__main__":
    asyncio.run(main())
