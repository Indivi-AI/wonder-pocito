# Pocito deployment reference

Three services, three pods: Wonder/Pocito (8080), Marketplace (7777), Agno (7778).
Apps use Wonder's "/_pocito" gateway. Marketplace and Agno also have direct OpenShift Routes.
Authentication is disabled. Scaling is deferred. Service upgrades use Recreate and briefly interrupt that service.

The older 0.1.0-ready and 0.1.0-verified images contain shared runtime changes reverted on 2026-09-08.
This export uses the unchanged shared runtime; full lambda runtime validation remains pending.

Requires Docker with BuildKit and Helm. Default target is linux/amd64; set PLATFORM=linux/arm64 for ARM worker nodes.
Existing npm configuration and optional UV_CONFIG_FILE are passed as build secrets.
The output is under solutions/pocito/on-prem/prod/releases/RELEASE_VERSION: three images in images.tar, the chart, image IDs, and SHA256SUMS.
Runtime images contain their dependencies and local API documentation assets. Startup requires no internet access.
DuckDB and lambdas requiring it are outside this release.

Use immutable release tags or registry digests. Supply imagePullSecrets if required by that registry.
Route hosts must resolve to OpenShift ingress and be covered by its certificate; ingress terminates TLS and redirects HTTP to HTTPS.

The kit includes customer-configmaps.example.yaml with all three ConfigMaps, named to match customer-values.example.yaml.
Copy it to customer-configmaps.yaml, replace every customer.example address and REPLACE_* value, then apply it in the deployment namespace.
Keep the two Python services on the same MinIO bucket. The internal pocito-* Service addresses assume Helm release name pocito.
Fill FLAPI_TOKEN and FLAPI_USERNAME only if your existing FLAPI requires them.
Set OPENAI_MODEL to your LiteLLM chat model ID and OPENAI_EMBEDDING_DIMENSIONS to your embedding model's output size.
The current Agno runtime requests the embedding model alias embeddings from LiteLLM. The template's chat and 1536 values are examples.
Each services.<name>.existingConfigMap names the ConfigMap for that service. Helm neither creates these ConfigMaps nor writes their values.
The containers receive their keys through envFrom; the existing applications continue reading environment variables.
There are no env values in Helm and no generated endpoint, model, database or certificate variables.

Populate the ConfigMaps with the runtime settings:

| Service | Settings |
| --- | --- |
| Wonder | MINIO_ENDPOINT, WONDER_CDN_URL, LITELLM_HOST, MARKETPLACE_API_URL, AGNO_API_URL, WONDER_SERVICE_URL |
| Marketplace and Agno | MINIO_ENDPOINT, MARKETPLACE_S3_BUCKET, S3_USE_PATH_STYLE, FLAPI_BASE_URL, CORS_ALLOWED_ORIGINS |
| Agno | LITELLM_HOST, OPENAI_BASE_URL, OPENAI_MODEL, OPENAI_EMBEDDING_DIMENSIONS, SITE_HOST |

For release name pocito, Wonder's ConfigMap data can use these service addresses:

```yaml
MARKETPLACE_API_URL: http://pocito-marketplace:7777
AGNO_API_URL: http://pocito-agno:7778
WONDER_SERVICE_URL: http://pocito-wonder:8080
```

Set Agno's OPENAI_BASE_URL to the LiteLLM address plus /v1; the template's OPENAI_API_KEY: unused assumes LiteLLM needs no key.
Set SITE_HOST to the comma-separated Agno Route hostname and Service name, such as agno.apps.customer.example,pocito-agno.
Match these hosts to customer-values.yaml. SITE_HOST contains hostnames without schemes or spaces.
Set CORS_ALLOWED_ORIGINS to the HTTPS Wonder origin and the service's own HTTPS origin, separated by commas without spaces.
The images retain their existing authentication-disabled defaults.

Optional services.<name>.existingSecret references load additional keys through envFrom. These keys take precedence over matching ConfigMap keys.
These runtime keys can be supplied in the ConfigMap or in the optional Secret:

| Secret reference | Required contents |
| --- | --- |
| services.marketplace.existingSecret | MINIO_ACCESS_KEY, MINIO_SECRET_KEY; existing FLAPI connection variables if used |
| services.agno.existingSecret | MINIO_ACCESS_KEY, MINIO_SECRET_KEY, AGNO_DB_URL, PGVECTOR_URL; existing FLAPI/model variables if used |
| services.wonder.existingSecret | Optional additional runtime environment for published lambdas |

Both PostgreSQL URLs use SQLAlchemy syntax: postgresql+psycopg://USER:PASSWORD@HOST:PORT/DATABASE.
They can point to the same existing database. Agno creates a stable schema per room for session data; the database user needs DDL permissions.
Supply AGNO_DB_URL and PGVECTOR_URL in Agno's ConfigMap or referenced Secret; Helm does not supply or validate their contents.
AGNO_DB_URL is needed for persistent production sessions; the existing runtime falls back to in-memory sessions when it is absent.

MINIO_ENDPOINT must be reachable by pods. WONDER_STORAGE_URL sets the browser-facing address and is also used for presigning.
If WONDER_STORAGE_URL is omitted, browsers use MINIO_ENDPOINT too.
WONDER_CDN_URL must point to the mirrored runtime directory already published in MinIO; the example path is illustrative.
Publish applet definitions, browser snapshots, lambda packages, and their complete runtime assets before serving the apps.
Marketplace business data and Agno's ingestion queue remain in the existing MinIO bucket; this chart does not create or seed application content.

For corporate CAs, set caConfigMap to an existing ConfigMap with a ca.crt key containing the complete trusted CA bundle.
The chart mounts it at /etc/pocito-ca/ca.crt. Set NODE_EXTRA_CA_CERTS in Wonder's ConfigMap to that path.
For the Python services, set SSL_CERT_FILE, REQUESTS_CA_BUNDLE and AWS_CA_BUNDLE to that path in their ConfigMaps.
PostgreSQL TLS settings belong in the database URL, including sslrootcert when needed.
Corporate DNS, firewall rules, and NAT must allow pods to reach the external MinIO, PostgreSQL, LiteLLM, and FLAPI addresses.
Runtime data is written to bounded /tmp volumes. Configure services.<name>.resources for the available capacity.

For local checkout validation:

```sh
helm lint solutions/pocito/on-prem/helm/pocito -f solutions/pocito/on-prem/prod/customer-values.example.yaml
helm template pocito solutions/pocito/on-prem/helm/pocito -f solutions/pocito/on-prem/prod/customer-values.example.yaml
```

The TGP tests are registered in .jb6/entry-points-pocito-tests.js:
`pocitoProd.runtime` publishes a real lambda and checks execution, callbacks, streaming, cancellation, and MinIO writes.
Its cancellation, progress-isolation, localhost and noAuth expectations describe the reverted implementation; it is pending review, not a passing baseline.
Run it against a disposable production container with POCITO_PROD_TEST_URL and POCITO_PROD_TEST_CONTAINER set on the development MCP process.
Its MINIO_ENDPOINT must address the same storage as the container; Docker access is required to verify child termination.
`pocitoProd.sessions` checks PostgreSQL persistence and room separation using the existing Agno development environment and PGVECTOR_URL/AGNO_DB_URL.
Use onPremLogger,roomLogger,dbLogger,mcpLogger for runtime verification and onPremLogger for sessions; inspect the returned error channels.

Check /health on Wonder and /livez, /readyz on the Python services. /docs works on each Python Route and through its gateway prefix.
Exercise published /room/<room>/applet/<name>, lambda execution, Marketplace uploads, Agno runs/MCP, and model streaming through the real Routes.
Agno session persistence survives replacement; interrupted model runs are not automatically resumed.
SHUTDOWN_TIMEOUT_MS defaults to 25000 and must remain below terminationGracePeriodSeconds; it closes HTTP connections, not individual lambda processes.
LAMBDA_TIMEOUT_MS was removed. The shared handler retains its existing request-supplied serverTimeout behavior without child cancellation.
routeTimeout defaults to 300s and measures ingress inactivity, not total execution duration.

Each service has its own image setting, so changing only its image does not restart the other workloads.
After editing a ConfigMap or Secret, restart the consuming Deployment, for example: oc rollout restart deployment/pocito-agno -n pocito.
Helm upgrades and rollbacks do not overwrite your ConfigMaps or Secrets; rollback also does not restore PostgreSQL or MinIO data.
Uninstalling the chart preserves external databases, object storage, and the referenced customer ConfigMaps and Secrets.

#Using mininal lines of code#
