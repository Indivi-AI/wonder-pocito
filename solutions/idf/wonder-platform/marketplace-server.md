# Marketplace server

`marketplace_server.py` serves the reconstructed single-scope marketplace API and Agno AgentOS on port 7777. Room routing stays in Wonder's
WURL layer and is not part of the current marketplace HTTP API.

Run `./start-marketplace.sh`. The default object store is the local filesystem under `.marketplace-data`. For MinIO or S3 set
`MARKETPLACE_OBJECT_STORE=s3`, `MARKETPLACE_S3_BUCKET`, `MARKETPLACE_S3_ENDPOINT`, `MARKETPLACE_S3_ACCESS_KEY`, and
`MARKETPLACE_S3_SECRET_KEY`. `MARKETPLACE_DATA_DIR`, `AGENT_OS_PORT`, `OPENAI_MODEL`, and `CORS_ALLOWED_ORIGINS` are optional.

Skills are materialized into Agno `LocalSkills`, including their assets. `GET /api/v1/skills/{name}?includeAssets=true` returns assets with
`content_b64`; normal reads return metadata only.

Code tools are trusted server code. Put `file.py:function` in `dedicated_tool_config.entrypoint`; without it, the loader uses `run` or the only
public function defined in `tool.py`. All saved files are materialized, so the entrypoint can import sibling modules. The manifest `json_schema`
becomes the Agno function schema.

For credential-free browser e2e tests, set `MARKETPLACE_MODEL_FACTORY=marketplace_e2e_model:model_factory`. This still runs AgentOS and Agno's
real skill and tool loop; only the model response selection is deterministic.

Run the deterministic suite with:

```sh
cd solutions/idf/wonder-platform
../platform-v0/.venv/bin/python -m unittest -v test_marketplace_server.py
```
