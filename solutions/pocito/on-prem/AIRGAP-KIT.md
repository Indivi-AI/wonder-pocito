# Wonder Docker air-gap kit

This AMD64 kit contains the exact Wonder, marketplace/AgentOS, minimal LiteLLM, and PostgreSQL/pgvector images. MinIO is external and not bundled.

On the Linux server:

```sh
cp .env.example .env
cp llm-lite-config.example.yaml llm-lite-config.yaml
# Fill SITE_HOST, external MINIO settings, LLM_MODEL, and the LiteLLM endpoint/key.
./docker-up.sh
SITE_ENV_FILE=.env ./sim-check.sh
```

`docker-up.sh` verifies and loads the images, starts with `--pull never`, and never builds or contacts a registry. It uses the base Compose file
so containers can reach the site's internal MinIO, LLM, and FLAPI services. PostgreSQL data persists in the
`pgvector-data` volume. The dependency-base tags are also included for future offline code-only rebuilds; Playwright is excluded, while the other
Node test dependencies and test source remain available.

The full source is `wonder.bundle`; clone it and restore the exact packaging files with:

```sh
git clone wonder.bundle wonder-source
cd wonder-source
git apply ../source.patch
```
