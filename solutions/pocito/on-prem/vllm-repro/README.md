# Real vLLM continuation reproduction

An isolated Agno 2.8.5 → LiteLLM 1.98.0 → vLLM 0.28.0 environment. No mocks, GPU, PostgreSQL, S3, or site access required.
It also tests Agno → vLLM directly to distinguish upstream behavior from proxy behavior.

The model is [SmolLM2-135M-Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct), about 270 MB of weights.
This small, real instruction model is sufficient: response-ID lookup fails before the second inference.
It is not a substitute for testing the site's model's reasoning quality or autonomous tool selection.
The [official CPU image](https://docs.vllm.ai/en/v0.28.0/getting_started/installation/cpu/) supports Linux ARM64 and x86-64.
Apple Silicon runs its Linux ARM64 image in Docker Desktop; no CUDA emulation is needed.

## Run

Requires Docker with Compose, internet for initial downloads, and approximately 4.5 GB free container RAM.
The CPU must support BF16 (confirmed on this Mac's Linux VM); older ARM CPUs may need float32 and more RAM.
The first run downloads the engine image (about 0.9 GB compressed on ARM64), model, and Python dependencies.
Images, Python dependencies, and the model revision are pinned; weights persist in this project's `models` volume.

```bash
cd solutions/pocito/on-prem/vllm-repro
docker compose up -d --build --wait --wait-timeout 900
docker compose run --rm reproduce
```

Expected: eight passing checks. A deliberately reproduced missing-response-ID error counts as a pass only after a successful first generation.
Both nonstreaming and streaming are checked, directly and through LiteLLM:

| Adapter | First message | Second message, storage disabled |
| --- | --- | --- |
| Historical `LiteLLMResponses` | Generates text | Expected `Response with id 'resp_…' not found` |
| `OpenAIChat` | Generates text | Generates text, sends full message history and no `previous_response_id` |

Proxy retries and cooldowns are disabled in this lab so an expected 404 cannot mask the next check with a cooldown 429.

`reproduce.py` copies the small `LiteLLMResponses` subclass from application commit `b2f46a66` and uses the application's
`InMemoryDb`/`add_history_to_context=True` setup. It does not modify the application or run its browser/AgentOS routes.
The site's exact vLLM version is still unknown; this reproduces the protocol mismatch on the pinned version above.
Verified locally on 2026-09-07 with real model inference: all eight checks passed with storage disabled and all eight with storage enabled.

## Prove storage is the difference

```bash
RESPONSES_STORE=1 docker compose up -d --wait --wait-timeout 900
RESPONSES_STORE=1 docker compose run --rm reproduce
```

Expected: all eight checks generate both answers. This enables vLLM's in-memory Responses store, not an AgentOS database.
Restore the failing configuration with:

```bash
docker compose up -d --wait --wait-timeout 900
docker compose run --rm reproduce
```

## Application fix and live regression

`chat-completions.patch` fixes the Responses adapter on `origin/claude/wonderagents-trace-ui-454suw` without removing its streaming UI.
The current `master` already uses `OpenAIChat`; do not apply this patch there. On a checkout containing the faulty adapter, from the repository root:

```bash
git apply --check solutions/pocito/on-prem/vllm-repro/chat-completions.patch
git apply solutions/pocito/on-prem/vllm-repro/chat-completions.patch
```

Restart the AgentOS process after updating `solutions/pocito/agno-server/agno_server.py` in the deployed code directory.
No Agno package upgrade, PostgreSQL change, or vLLM response store is needed. A code-mounted deployment does not need an image rebuild.

`test_application.py` imports the actual application's factory and agent builder, using Agno 2.8.5 and its in-memory session database.
With the application's Agno virtual environment installed, run from the repository root:

```bash
OPENAI_BASE_URL=http://localhost:18000/v1 OPENAI_API_KEY=unused OPENAI_MODEL=tiny \
  solutions/pocito/.local-data/venvs/agno-server/bin/python solutions/pocito/on-prem/vllm-repro/test_application.py
```

Repeat with port `14000` to test through LiteLLM. To test OpenAI, export a real `OPENAI_API_KEY` securely first, then run:

```bash
OPENAI_BASE_URL=https://api.openai.com/v1 OPENAI_MODEL=gpt-4.1-mini \
  solutions/pocito/.local-data/venvs/agno-server/bin/python solutions/pocito/on-prem/vllm-repro/test_application.py
```

OpenAI tests make real, billed API calls using only synthetic prompts and standard tool schemas. The script never loads application credentials itself.
Set `PYTHONPATH=/path/to/checkout/solutions/pocito/agno-server` to verify a different checkout's factory.

Each backend runs streaming and nonstreaming conversations: greeting → second message with a real multiplication tool → model continuation → follow-up.
The agent is rebuilt between user messages, as in AgentOS. Assertions verify four successful Chat Completions calls, matching tool IDs/results,
preserved user/assistant/tool history, and no `previous_response_id`. Neither PostgreSQL nor S3 is contacted.

The tiny model uses a named, forced tool choice, switched to `none` after tool execution so the model can answer.
This tests real tool execution and protocol compatibility, not autonomous tool selection or reasoning quality.
The lab enables vLLM's Hermes parser for constrained tool generation; no responses or tool calls are mocked.
Verified on 2026-09-07: all six application scenarios passed against direct vLLM, LiteLLM → vLLM, and OpenAI `gpt-4.1-mini`.

## Endpoints and cleanup

- vLLM: `http://localhost:18000/v1`, model `tiny`.
- LiteLLM: `http://localhost:14000/v1`, model `tiny`.
- Neither requires authentication; SDKs can use the placeholder key `unused`.
- Ports bind only to localhost. Override `VLLM_REPRO_PORT` or `LITELLM_REPRO_PORT` if occupied.
- Logs: `docker compose logs --tail 100 vllm litellm`.
- Stop/remove only this environment's containers: `docker compose down`. Cached model weights are preserved.

The harness prints each real request's URL, HTTP status, `store`, and `previous_response_id` without logging prompt contents.

To deliberately update Python dependency pins, edit `pyproject.toml`, regenerate the lock, then rebuild:

```bash
uv pip compile pyproject.toml --universal --python-version 3.11 --no-annotate --no-header -o requirements.lock
docker compose build litellm
```
