# Marketplace + agno servers

Two servers in one package, one per process: `marketplace_server.py` serves the marketplace CRUD API on port 7777 and
`agno_server.py` serves Agno AgentOS agent runs (`POST /agents/{id}/runs`) on port 7778. They never call each other -
both read and write the same S3/MinIO bucket through the shared `marketplace_storage.py` layer (`S3ObjectStore` +
`MarketplaceRepository`; manifests live in envelopes `{data, version, created_at, updated_at}`), and agno refreshes its
agent list from it on every `/agents` request, so agents created or deleted through the marketplace are runnable immediately. Wonder derives `x-wonder-room` from the request wUrl;
direct clients may send the bare room ID themselves. Omitting the header preserves the default `marketplace` room.

Resource manifests use a stable semantic `id` such as `uiRenderingSkill` in URLs and relationships, plus one editable `display_name` for UI.

Knowledge Bases use `/api/v1/knowledge/`. Their `/content` endpoint accepts either a file or `text_content`; common PDF, DOCX, PPTX, CSV,
Markdown, JSON, and text formats are handled by Agno. Agents connect to any number of bases through `config.knowledge_bases`. AgentOS builds a
room-scoped LanceDB cache from the S3 source content and refreshes only a changed base before an agent runs.

Setup from zero (dev and deployment): `solutions/pocito/wonder-platform/README.md`. All marketplace state lives in
MinIO/S3 — manifests, version snapshots, audit events, users, and artifacts are
room-prefixed objects in one bucket; there is no sqlite. Defaults: `MARKETPLACE_S3_BUCKET=wonder-marketplace`,
`MARKETPLACE_S3_ENDPOINT=http://127.0.0.1:9000`, `MARKETPLACE_S3_ACCESS_KEY=wonder`, `MARKETPLACE_S3_SECRET_KEY=wonder-minio-local`.
Presigned upload/download URLs point at room-prefixed MinIO keys. `MARKETPLACE_DATA_DIR` (agno only) hosts runtime materialization, and
each room's agent chat sessions use a separate Agno in-memory db, so both reset without data loss. `MARKETPLACE_HOST`/`MARKETPLACE_PORT`
(default 127.0.0.1:7777), `AGENT_OS_HOST`/`AGENT_OS_PORT` (default 127.0.0.1:7778), `CORS_ALLOWED_ORIGINS`, and
`MARKETPLACE_S3_STORAGE_CLASS` (sent as `StorageClass` on every put when set) are optional.
Browsers resolve each server's URL from `globalThis.MARKETPLACE_API_URL` / `globalThis.AGNO_API_URL` — the wonder server injects them into
applet pages when set in its env — falling back to the page's host on ports 7777 / 7778.

Skills are materialized into Agno `LocalSkills`, including their assets. `GET /api/v1/skills/{id}?includeAssets=true` returns assets with
`content_b64`; normal reads return metadata only.

Code tools are trusted server code. Put `file.py:function` in `dedicated_tool_config.entrypoint`; without it, the loader uses `run` or the only
public function defined in `tool.py`. All saved files are materialized, so the entrypoint can import sibling modules. The manifest `json_schema`
becomes the Agno function schema.

For credential-free browser e2e tests, set `MARKETPLACE_MODEL_FACTORY=marketplace_e2e_model:model_factory` on the agno server. This still
runs AgentOS and Agno's real skill and tool loop; only the model response selection is deterministic.

Run the deterministic suite with:

```sh
cd solutions/pocito/marketplace-server
.venv/bin/python -m unittest -v test_marketplace_server.py
```
